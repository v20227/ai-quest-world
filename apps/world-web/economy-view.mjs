const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const headings = { wallet: "工作钱包", shop: "营地商店", inventory: "物品背包", companions: "伙伴小屋" };

export function createEconomyUI(document, { refresh, notify, rerender }) {
  let snapshot = null;
  let source = "loading";
  let namespace = null;
  let pending = null;
  let busy = false;
  let older = [];
  let olderCursor;
  let lastMessage = "";
  const pendingKey = id => `ai-quest-economy-pending:${id}`;
  const editable = () => source === "live" && Boolean(snapshot?.economy) && !busy && !pending;

  function remember(command) {
    pending = command;
    try {
      if (command) sessionStorage.setItem(pendingKey(namespace), JSON.stringify(command));
      else sessionStorage.removeItem(pendingKey(namespace));
    } catch { /* Keep retry identity in memory when browser storage is unavailable. */ }
  }

  async function execute(command) {
    if (busy || source !== "live" || !snapshot?.economy) return;
    const requestNamespace = namespace;
    remember(command);
    busy = true;
    rerender();
    try {
      const response = await fetch("/api/economy/command", { method: "POST",
        headers: { "content-type": "application/json", "x-world-namespace": requestNamespace },
        body: JSON.stringify(command), signal: AbortSignal.timeout(8000) });
      const result = await response.json();
      if (namespace !== requestNamespace) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) remember(null);
        throw new Error(result.error ?? "操作结果暂未确认。");
      }
      remember(null);
      lastMessage = result.receipt.message;
      notify(lastMessage);
    } catch (error) {
      if (namespace === requestNamespace) {
        lastMessage = pending ? "结果暂未确认。请重试原操作，系统会核对同一操作编号，不会重复消费。" : error.message;
        notify(lastMessage);
      }
    } finally {
      busy = false;
      if (namespace === requestNamespace && source === "live") await refresh();
      rerender();
    }
  }

  document.addEventListener("submit", event => {
    const form = event.target.closest("form[data-economy-action]");
    if (!form) return;
    event.preventDefault();
    if (!editable()) return;
    const action = form.dataset.economyAction;
    const command = { command_id: crypto.randomUUID(), revision: snapshot.economy.revision, action };
    if (["buy", "feed", "hatch"].includes(action)) command.item_id = form.dataset.itemId;
    if (["buy", "feed"].includes(action)) command.quantity = Number(new FormData(form).get("quantity"));
    if (["feed", "select"].includes(action)) command.pet_id = form.dataset.petId || null;
    execute(command);
  });
  document.addEventListener("input", event => {
    const form = event.target.closest("form[data-economy-action]");
    if (!form) return;
    const item = snapshot?.economy?.catalog.find(value => value.item_id === form.dataset.itemId);
    const quantity = Number(event.target.value);
    if (!item || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) return;
    const output = form.querySelector("output");
    if (output) output.textContent = form.dataset.economyAction === "buy"
      ? `总价 ${item.price * quantity} 金币 · 购买后 ${snapshot.economy.gold - item.price * quantity}`
      : `成长 +${Math.min(item.growth * quantity, 100 - (snapshot.economy.pets[0]?.growth ?? 0))}`;
  });
  document.addEventListener("click", async event => {
    if (event.target.closest("[data-economy-retry]")) { if (pending) execute(pending); return; }
    if (!event.target.closest("[data-economy-history]") || busy || source !== "live") return;
    const cursor = olderCursor === undefined ? snapshot?.economy?.history.next_before : olderCursor;
    if (!cursor) return;
    const requestNamespace = namespace;
    busy = true;
    try {
      const response = await fetch(`/api/economy/history?before=${cursor}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("暂时无法读取较早记录。");
      const history = await response.json();
      if (requestNamespace === namespace) { older.push(...history.entries); olderCursor = history.next_before; }
    } catch (error) { notify(error.message); }
    finally { busy = false; rerender(); }
  });

  function form(action, label, { item, pet, disabled = false, quantity = false } = {}) {
    const identity = `${action}-${item?.item_id ?? pet?.pet_id ?? "none"}`;
    return `<form data-economy-action="${action}" data-item-id="${escape(item?.item_id)}" data-pet-id="${escape(pet?.pet_id)}">
      ${quantity ? `<label for="${identity}">数量</label> <input id="${identity}" name="quantity" type="number" value="1" min="1" max="${item.kind === "egg" ? 1 : 20}" required ${!editable() || disabled ? "disabled" : ""} /><output aria-live="polite">${action === "buy" ? `总价 ${item.price} 金币 · 购买后 ${snapshot.economy.gold - item.price}` : `成长 +${Math.min(item.growth, 100 - (pet?.growth ?? 0))}`}</output>` : ""}
      <button id="action-${identity}" class="secondary-button" type="submit" ${!editable() || disabled ? "disabled" : ""}>${escape(label)}</button></form>`;
  }

  function inventory(economy) {
    return economy.catalog.map(item => {
      const count = economy.inventory[item.item_id] ?? 0;
      const pet = economy.pets[0];
      return `<article class="detail-card"><h3>${escape(item.name)} · ${count} 件</h3><p>${escape(item.description)}</p>
        ${item.kind === "egg" ? form("hatch", "孵化为信号伙伴", { item, disabled: !count || Boolean(pet) }) : form("feed", pet ? `喂给${pet.name}` : "先孵化伙伴", { item, pet, quantity: true, disabled: !count || !pet || pet.growth >= 100 })}</article>`;
    }).join("");
  }

  function render(panel) {
    const economy = snapshot?.economy;
    if (!economy || source !== "live") return '<p class="panel-lede">请连接本地世界查看钱包、商店和伙伴。演示数据不会修改你的资产。</p>';
    const navigation = Object.entries(headings).map(([id, label]) => `<button type="button" class="secondary-button" data-panel="${id}" ${panel === id ? 'aria-current="page"' : ""}>${label}</button>`).join("");
    const notice = `<p role="status">${escape(lastMessage)}</p>${pending ? `<p>存在待确认的操作，新的消费已暂停。</p><button class="primary-button" type="button" data-economy-retry ${busy ? "disabled" : ""}>${busy ? "正在确认…" : "重试原操作"}</button>` : ""}`;
    let content = "";
    if (panel === "wallet") {
      const history = [...new Map([...economy.history.entries, ...older].map(entry => [entry.sequence, entry])).values()].sort((a, b) => b.sequence - a.sequence);
      content = `<p>合格真实成果自动入账：已验证 ${economy.reward_policy.verified} 金币，受支持 ${economy.reward_policy.supported} 金币。同一根目标只结算一次，历史合格任务补发一次。</p>
        <p>经验不会被花掉。金币用于物品与伙伴，不改变 AI 的能力。</p>
        ${history.length ? history.map(entry => `<article class="detail-card"><strong>${escape(entry.type === "work_reward" ? entry.quest_title : entry.message)}</strong>
          <p>${entry.gold_delta > 0 ? "+" : ""}${entry.gold_delta} 金币 · 当时余额 ${entry.balance_after}${entry.historical ? " · 历史补发" : ""}</p>
          <p class="artifact-meta">${escape(entry.occurred_at)}${entry.confidence ? ` · ${entry.confidence === "VERIFIED" ? "已验证" : "受支持"}` : ""}</p>
          ${entry.quest_id ? `<button class="text-button" data-quest-id="${escape(entry.quest_id)}" type="button">查看收入来源任务</button>` : ""}</article>`).join("") : "<p>尚无收支。完成合格的真实任务后，收入会显示在这里。</p>"}
        ${(olderCursor === undefined ? economy.history.next_before : olderCursor) ? '<button type="button" class="secondary-button" data-economy-history>查看更早记录</button>' : ""}`;
    } else if (panel === "shop") {
      content = `<p>先获得伙伴，再用工作所得购买食物。商品价格固定，无抽奖或充值。</p>${economy.catalog.map(item => {
        const owned = item.kind === "egg" && (economy.pets.length > 0 || economy.inventory[item.item_id] > 0);
        return `<article class="detail-card"><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><p>单价 ${item.price} 金币 · 库存 ${economy.inventory[item.item_id] ?? 0}</p>
          ${form("buy", owned ? "已有伙伴或待孵化的蛋" : economy.gold < item.price ? "金币不足" : "购买", { item, quantity: true, disabled: owned || economy.gold < item.price })}</article>`;
      }).join("")}`;
    } else if (panel === "inventory") {
      content = `<p>孵化消耗一颗蛋，喂养消耗所选食物；物品与真实成果档案分别保存。</p>${inventory(economy)}<button class="text-button" type="button" data-panel="collection">查看里程碑收藏</button>`;
    } else {
      const pet = economy.pets[0];
      content = pet ? `<article class="detail-card"><span class="companion-portrait" role="img" aria-label="像素信号伙伴"></span><h3>${escape(pet.name)} · ${escape(pet.stage)}</h3>
        <label>成长 ${pet.growth}/${pet.max_growth}<progress value="${pet.growth}" max="${pet.max_growth}"></progress></label>
        <p>${pet.next_growth === null ? "已达当前成长上限，喂养不会继续消耗。" : `距离下一阶段还需 ${pet.next_growth - pet.growth} 点成长。`}</p>
        <p>偏好：研究饼干。成长来自喂养；共同展示不代表宠物参与了 AI 执行。离线不会掉级。</p>
        <p class="artifact-meta">孵化于 ${escape(pet.hatched_at)}</p>
        ${form("select", economy.selected_pet_id === pet.pet_id ? "收起伙伴" : "展示在工作世界", { pet: economy.selected_pet_id === pet.pet_id ? null : pet })}</article>${inventory(economy)}`
        : '<p>还没有伙伴。两次已验证成果的金币可购买一颗信号伙伴蛋，在背包中孵化。</p><button type="button" class="primary-button" data-panel="shop">去商店查看伙伴蛋</button>';
    }
    return `<section class="economy-panel"><div class="panel-action-row">${navigation}</div><h3>钱包余额：${economy.gold} 金币</h3>${notice}${content}</section>`;
  }

  return {
    get busy() { return busy; },
    render,
    update(value, nextSource) {
      snapshot = value;
      source = nextSource;
      const nextNamespace = nextSource === "live" ? value?.display_namespace : null;
      if (namespace !== nextNamespace) {
        namespace = nextNamespace; older = []; olderCursor = undefined; lastMessage = ""; pending = null;
        if (namespace) try { pending = JSON.parse(sessionStorage.getItem(pendingKey(namespace)) ?? "null"); } catch { pending = null; }
      }
      let actor = document.querySelector("#earned-companion");
      if (!actor) {
        actor = document.createElement("button");
        actor.id = "earned-companion";
        actor.type = "button";
        actor.className = "earned-companion";
        actor.dataset.panel = "companions";
        document.querySelector("#world-scene")?.append(actor);
      }
      const pet = value?.economy?.pets.find(item => item.pet_id === value.economy.selected_pet_id);
      actor.hidden = nextSource !== "live" || !pet;
      actor.setAttribute("aria-label", pet ? `${pet.name} · ${pet.stage}，打开伙伴小屋` : "伙伴小屋");
      actor.title = pet ? `${pet.name} · ${pet.stage}` : "";
    }
  };
}
