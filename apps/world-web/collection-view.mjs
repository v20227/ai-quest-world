const ART = "/assets/pixel/guild/quest-blossom.png";
const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function renderCollection(snapshot, { editable = false, busy = false } = {}) {
  const grant = snapshot.collection?.grants.find(item => item.item_id === "verified-memento");
  const placed = snapshot.collection?.placement.item_id === "verified-memento";
  const quest = snapshot.quests.find(item => item.quest_id === grant?.quest_id);
  return `<p class="panel-lede">收藏纪念真实工作的成果。摆放与收起不影响经验，也不会消耗收藏。</p>
    <article class="detail-card">
      <img class="collection-art" src="${ART}" alt="樱花与城堡组成的验证纪念画" />
      <div class="evidence-head"><h3 class="evidence-title">验证纪念画</h3><span class="status-badge">${grant ? placed ? "已摆放" : "已拥有" : "未解锁"}</span></div>
      <p>获得条件：完成首次已验证成果里程碑。</p>
      ${grant ? `<p>获奖任务：${escape(quest?.title ?? grant.quest_id)}</p>
        <p class="artifact-meta">获得时间：${escape(grant.earned_at)}</p>
        <button class="secondary-button" data-select-quest="${escape(grant.quest_id)}" type="button">查看获奖任务</button>` : "<p>有合格的真实成果与验证证据后，由世界自动解锁，无需重复领取。</p>"}
      <div class="panel-action-row"><button class="primary-button" type="button" data-place-collectible="${placed ? "" : "verified-memento"}" ${!grant || !editable || busy ? "disabled" : ""}>${busy ? "正在保存…" : placed ? "收起纪念画" : "摆放到营地"}</button></div>
      ${!editable ? '<p class="artifact-meta">演示或离线状态下不能修改本地收藏。</p>' : ""}
    </article>`;
}

export function renderCollectionPlacement(document, snapshot) {
  let display = document.querySelector("#camp-memento");
  if (!display) {
    const scene = document.querySelector("#world-scene");
    if (!scene) return;
    display = document.createElement("button");
    display.id = "camp-memento";
    display.type = "button";
    display.className = "camp-memento";
    display.dataset.panel = "collection";
    display.setAttribute("aria-label", "查看已摆放的验证纪念画");
    const image = document.createElement("img");
    image.src = ART;
    image.alt = "";
    display.append(image);
    scene.append(display);
  }
  display.hidden = snapshot.collection?.placement.item_id !== "verified-memento";
}
