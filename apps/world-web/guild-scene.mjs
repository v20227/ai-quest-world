import { currentQuest, recentQuests, allArtifacts } from "./view-state.mjs";

const DISPLAY_LABELS = {
  research: "研究", planning: "规划", engineering: "工程", debugging: "调试", creation: "创作", automation: "自动化",
  completed: "已完成", failed: "失败", cancelled: "已取消", active: "运行中", pending: "待处理", created: "已创建",
  verified: "已验证", supported: "有证据支持", unverified: "未验证", unknown: "未知",
  locked: "未解锁", dormant: "休眠", old: "待修复", restored: "已修复", idle: "空闲", busy: "忙碌",
  returning: "归来中", milestone: "里程碑", connected: "已连接", unlocked: "已解锁",
  observe: "观测", orient: "理解", plan: "规划", act: "执行", validate: "验证", deliver: "交付", recover: "恢复",
  code: "代码", validation: "验证", document: "文档", file: "文件", other: "其他",
  dusk: "暮色", meadow: "草原", first_qualifying_completion: "首次达标任务", first_verified_outcome: "首次验证成果", first_artifact: "首个真实成果",
  depart: "出发", explore: "探索", return: "归来", candidate: "待确认", validating: "验证中",
  workshop: "工坊", library: "图书馆"
};

export function displayLabel(value) {
  if (value == null) return "—";
  const key = String(value).toLowerCase();
  return Object.hasOwn(DISPLAY_LABELS, key) ? DISPLAY_LABELS[key] : String(value);
}

const label = displayLabel;

export function returnHighlightLabel(item) {
  if (item.kind === "milestone_unlocked") return displayLabel(item.target);
  if (item.kind === "guild_restored") return "任务公会已修复";
  if (item.kind === "building_unlocked") return `${displayLabel(item.target)}已解锁`;
  if (item.kind === "quest_failed") return `${item.label.replace(/ failed$/, "")} · 失败`;
  if (item.kind === "quest_cancelled") return `${item.label.replace(/ cancelled$/, "")} · 已取消`;
  if (item.kind === "artifact_received" && item.label === "Real artifact received") return "获得真实成果";
  return item.label;
}

export function guildSceneModel(snapshot, selectedQuestId = null) {
  const quest = snapshot.quests.find(entry => entry.quest_id === selectedQuestId) ?? currentQuest(snapshot.quests);
  if (!quest) return {
    questId: null, title: "你的下一章，从这里开始。", domain: "小小营地 / 据点",
    description: "在已连接的 AI 工具中开展有意义的工作，下一次观测到的远征会出现在这里。",
    kind: "下一章", facts: [], phases: [], entries: [], active: false
  };
  const settled = snapshot.progressions.find(entry => entry.quest_id === quest.quest_id);
  const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status);
  const confidence = quest.outcome_confidence ? label(quest.outcome_confidence) : "等待证据";
  return {
    questId: quest.quest_id, title: quest.title, domain: `${label(quest.primary_domain)} / ${label(quest.phase)}`,
    description: terminal ? `${label(quest.status)} · ${confidence}。公会已保存这次真实工作的记录。` : "远征正在进行中，任务板会随本地运行环境观测到的工作更新。",
    kind: terminal ? "最近归来" : "当前远征",
    facts: [
      ["结果", confidence],
      ["记录成长", settled ? `${settled.skill_xp} 经验` : "尚未结算"],
      ["真实成果", String(allArtifacts(snapshot.progressions, snapshot.quests).filter(item => item.source_quest_id === quest.quest_id).length)]
    ],
    phases: [`阶段 · ${label(quest.phase)}`, `难度 · ${quest.difficulty?.observed ?? quest.difficulty?.estimated ?? "未知"}${quest.difficulty?.observed != null || quest.difficulty?.estimated != null ? "/5" : ""}`],
    entries: recentQuests(snapshot.quests).slice(0, 3).map(entry => ({ id: entry.quest_id, title: entry.title, detail: `${label(entry.status)} · ${entry.run_ids.length} 次运行` })),
    active: snapshot.world.active_run_ids.length > 0
  };
}

export function renderGuildScene(snapshot, root = document, selectedQuestId = null) {
  const model = guildSceneModel(snapshot, selectedQuestId);
  renderDesktopPanels(snapshot, model.questId, root);
  renderQuestIllustration(snapshot, model.questId, root);
  for (const [id, value] of Object.entries({ "board-title": model.title, "board-domain": model.domain, "board-description": model.description, "board-kind": model.kind, "archivist-state": model.active ? "远征进行中" : "档案管理员" })) root.getElementById(id).textContent = value;
  const facts = root.getElementById("board-facts");
  const signature = JSON.stringify(model);
  if (facts.dataset.signature === signature) return;
  facts.dataset.signature = signature;
  facts.replaceChildren(...model.facts.map(([name, value]) => {
    const item = root.createElement("span"); item.append(name);
    const strong = root.createElement("strong"); strong.textContent = value; item.append(strong); return item;
  }));
  const open = root.getElementById("board-open");
  open.disabled = model.questId === null;
  if (model.questId === null) { delete open.dataset.questId; } else { open.dataset.questId = model.questId; }
  delete open.dataset.panel;
  const entries = model.entries.map(entry => {
    const button = root.createElement("button"); button.type = "button"; button.className = "expedition-entry"; button.dataset.questId = entry.id;
    const title = root.createElement("strong"); title.textContent = entry.title;
    const detail = root.createElement("small"); detail.textContent = entry.detail;
    button.append(title, detail); return button;
  });
  if (entries.length === 0) { const message = root.createElement("p"); message.className = "muted"; message.textContent = "公会静候着，尚未观测到远征。"; entries.push(message); }
  const list = root.getElementById("expedition-list");
  const focusedId = list.contains(root.activeElement) ? root.activeElement.dataset.questId : null;
  list.replaceChildren(...entries);
  if (focusedId) entries.find(entry => entry.dataset.questId === focusedId)?.focus({ preventScroll: true });
  root.getElementById("world-scene").classList.toggle("has-expedition", model.active);
}

export const GUILD_DOMAINS = ["Research", "Planning", "Engineering", "Debugging", "Creation", "Automation"];

function pixelIcon(root, index, className = "") {
  const icon = root.createElement("span");
  icon.className = `pixel-icon ${className}`;
  icon.dataset.icon = String(index);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function renderQuestIllustration(snapshot, selectedQuestId, root) {
  const quest = snapshot.quests.find(item => item.quest_id === selectedQuestId);
  const difficulty = root.getElementById("board-difficulty");
  const value = quest?.difficulty?.observed ?? quest?.difficulty?.estimated;
  if (difficulty) {
    const known = Number.isInteger(value) && value >= 1 && value <= 5;
    difficulty.textContent = known ? `${"★".repeat(value)}${"☆".repeat(5 - value)}` : "等待观测";
    difficulty.setAttribute("aria-label", known ? `${quest.difficulty.observed != null ? "已观测" : "预估"}难度 ${value}/5` : "尚无难度信息");
  }
  const emblem = root.querySelector(".quest-emblem");
  if (emblem) emblem.dataset.icon = String(Math.max(0, GUILD_DOMAINS.indexOf(quest?.primary_domain)));
  const progress = root.getElementById("board-evidence-progress");
  const validation = quest?.validation_summary;
  const liveRun = quest != null && !["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status);
  if (progress) {
    const passed = validation?.latest_passed;
    const total = validation?.latest_total;
    const known = Number.isFinite(passed) && Number.isFinite(total) && total > 0 && passed >= 0 && passed <= total;
    // 远征进行中时进度条保持在场：已知证据显示实读比例，未知时以流动纹理表示观测中。
    progress.hidden = !known && !liveRun;
    progress.classList.toggle("is-flowing", !known && liveRun);
    if (known) { progress.max = total; progress.value = passed; progress.setAttribute("aria-valuetext", `${passed}/${total} 通过`); }
    else { progress.removeAttribute("value"); progress.removeAttribute("aria-valuetext"); }
  }
  const phases = root.getElementById("board-phases");
  if (!phases) return;
  const current = quest?.phase ?? null;
  const observed = new Set(quest?.expedition?.observed_phases ?? []);
  const phaseKey = JSON.stringify([quest?.quest_id, current, [...observed]]);
  const previousKey = phases.dataset.phase ?? null;
  if (phaseKey === previousKey) return;
  let previousObserved = new Set();
  let previousCurrent = null;
  if (previousKey) {
    try {
      const [, previousCurrentRaw, ...previousRest] = JSON.parse(previousKey);
      previousCurrent = previousCurrentRaw;
      previousObserved = new Set(previousRest[0] ?? []);
    } catch { /* first render */ }
  }
  phases.dataset.phase = phaseKey;
  const slots = [
    [current === "DEPART" ? "DEPART" : "EXPLORE", 0],
    ["PLAN", 1], ["ACT", 2], ["VALIDATE", 3], ["RECOVER", 4],
    [current === "RETURN" ? "RETURN" : "DELIVER", 5]
  ];
  phases.replaceChildren(...slots.map(([phase, iconIndex]) => {
    const stamp = root.createElement("span"); stamp.className = "phase-stamp";
    const state = current === phase ? "当前" : observed.has(phase) ? "已观测" : "—";
    const title = root.createElement("span"); title.textContent = label(phase);
    const stateNode = root.createElement("small"); stateNode.textContent = state;
    if (current === phase) stamp.setAttribute("aria-current", "step");
    stamp.title = current === phase ? `当前观测：${label(phase)}` : observed.has(phase) ? `${label(phase)}，曾观测到此阶段，不代表任务完成` : `${label(phase)}，尚未观测到`;
    stamp.append(pixelIcon(root, iconIndex), title, stateNode);
    const wasCurrent = previousCurrent === phase;
    const isNewlyObserved = !previousObserved.has(phase) && observed.has(phase);
    if (!wasCurrent && (current === phase || isNewlyObserved)) {
      stamp.classList.add("phase-pop");
      root.defaultView?.setTimeout(() => stamp.classList.remove("phase-pop"), 600);
    }
    return stamp;
  }));
}

export function desktopGuildModel(snapshot, selectedQuestId = null) {
  const active = new Set(snapshot.world.active_run_ids ?? []);
  const ordered = recentQuests(snapshot.quests);
  const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
  // 远征队伍是现在进行时：正在进行的远征 + 刚归来的最近两趟。
  // 完整历史在纪事与公会档案里，不在这里堆叠。
  const inFlight = ordered.filter(quest => !terminal.has(quest.status));
  const recentReturns = ordered.filter(quest => terminal.has(quest.status)).slice(0, 2);
  const visible = [...inFlight, ...recentReturns].slice(0, 6);
  const selected = ordered.find(quest => quest.quest_id === selectedQuestId) ?? currentQuest(ordered);
  return {
    selectedId: selected?.quest_id ?? null,
    quests: ordered.map(quest => ({ id: quest.quest_id, title: quest.title })),
    runs: visible.flatMap(quest => {
      const root = quest.run_ids.includes(quest.root_run_id) ? quest.root_run_id : quest.run_ids[0];
      const relationship = quest.run_ids.length > 1 ? `根运行 · 含 ${quest.run_ids.length - 1} 个关联运行` : "根运行";
      return [{
        id: root, questId: quest.quest_id, title: quest.title,
        relationship,
        status: active.has(root) ? "运行中"
          : terminal.has(quest.status) ? `已归来 · ${label(quest.status)}`
          : "进行中"
      }];
    }),
    inFlightCount: inFlight.length,
    returnCount: recentReturns.length,
    live: inFlight.length ? {
      questId: inFlight[0].quest_id,
      title: inFlight[0].title,
      phase: label(inFlight[0].phase ?? "DEPART"),
      evidence: inFlight[0].validation_summary?.latest_passed != null
        ? `${inFlight[0].validation_summary.latest_passed}/${inFlight[0].validation_summary.latest_total ?? "?"}`
        : null
    } : null,
    agents: selected?.agent_ids ?? [],
    domains: GUILD_DOMAINS.map(name => ({ name, value: snapshot.world.progression_totals?.domain_progress?.[name] ?? 0 })),
    artifacts: allArtifacts(snapshot.progressions, snapshot.quests),
    totals: { xp: snapshot.world.progression_totals?.skill_xp ?? 0, active: active.size, quests: ordered.length },
    validation: selected?.validation_summary ?? null
  };
}

function renderDesktopPanels(snapshot, selectedQuestId, root) {
  const host = root.getElementById("desktop-roster");
  if (!host) return;
  const model = desktopGuildModel(snapshot, selectedQuestId);
  const signature = JSON.stringify(model);
  if (host.dataset.signature === signature) return;
  host.dataset.signature = signature;
  const element = (tag, className, text) => { const node = root.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const focused = root.activeElement;
  const focusedRun = focused?.dataset?.selectRun;
  const scroll = host.scrollTop;
  const rows = model.runs.map(run => {
    const button = element("button", `roster-run${run.questId === model.selectedId ? " is-current" : ""}`);
    button.type = "button"; button.dataset.selectQuest = run.questId; button.dataset.selectRun = run.id;
    button.setAttribute("aria-pressed", String(run.questId === model.selectedId));
    const portrait = element("span", "roster-portrait");
    portrait.setAttribute("aria-hidden", "true");
    let portraitIndex = 0;
    for (const character of run.id) portraitIndex = (portraitIndex * 31 + character.charCodeAt(0)) >>> 0;
    portrait.dataset.portrait = String(portraitIndex % 4);
    button.title = `${run.title}\n${run.id}\n${run.relationship}\n${run.status}`;
    const copy = element("span", "roster-copy"); copy.append(element("strong", "", run.title),element("small", "run-id", run.id),element("small", "", run.relationship),element("small", "run-state", run.status));
    button.append(portrait, copy); return button;
  });
  host.replaceChildren(...(rows.length ? rows : [element("p", "muted", "尚未观测到运行，下一次远征会出现在这里。")]));
  host.scrollTop = scroll;
  if (focusedRun) rows.find(row => row.dataset.selectRun === focusedRun)?.focus({ preventScroll: true });
  root.getElementById("roster-count").textContent = model.inFlightCount + model.returnCount > 0
    ? `进行中 ${model.inFlightCount} · 最新归来 ${model.returnCount}`
    : "暂无远征";
  root.getElementById("agent-identities").textContent = model.agents.length ? `已观测到的智能体 · ${model.agents.join(" · ")}` : "此任务暂无智能体身份信息。";
  const picker = root.getElementById("quest-picker");
  picker.replaceChildren(...model.quests.map(quest => { const option = element("option", "", quest.title); option.value = quest.id; return option; }));
  picker.disabled = model.quests.length === 0; picker.value = model.selectedId ?? "";
  for (const [id, value] of Object.entries({ "total-growth": model.totals.xp, "active-expeditions": model.totals.active, "total-quests": model.totals.quests })) root.getElementById(id).textContent = String(value);
  // Mini HUD（原方案 §5）：有进行中的远征时，顶栏常驻显示 标题 · 当前阶段 · 证据进度。
  const liveHud = root.getElementById("hud-live-quest");
  if (liveHud) {
    if (model.live) {
      liveHud.hidden = false;
      const titleNode = root.getElementById("hud-live-quest-title");
      if (titleNode.textContent !== model.live.title) titleNode.textContent = model.live.title;
      root.getElementById("hud-live-quest-progress").textContent = `当前阶段 · ${model.live.phase}${model.live.evidence ? ` · 验证 ${model.live.evidence}` : ""}`;
    } else {
      liveHud.hidden = true;
    }
  }
  const domains = root.getElementById("domain-grid");
  const reduceMotion = root.defaultView?.matchMedia("(prefers-reduced-motion: reduce)")?.matches
    || root.body?.classList.contains("reduce-motion");
  model.domains.forEach((domain, index) => {
    let button = [...domains.children].find(node => node.dataset.domain === domain.name);
    if (!button) {
      button = element("button", "domain-node"); button.type = "button"; button.dataset.domain = domain.name;
      button.append(pixelIcon(root, index, "domain-sigil"), element("strong", "", label(domain.name)), element("small", "")); domains.append(button);
    }
    const valueNode = button.querySelector("small");
    const previous = Number(button.dataset.value ?? "0");
    const target = domain.value;
    if (target === previous) { valueNode.textContent = `${target} / 100`; return; }
    button.dataset.value = String(target);
    if (reduceMotion || previous > target) { valueNode.textContent = `${target} / 100`; return; }
    // 成长是值得被看见的：数值滚动 + 星位脉冲。
    button.classList.remove("domain-pulse");
    void button.offsetWidth;
    button.classList.add("domain-pulse");
    root.defaultView?.setTimeout(() => button.classList.remove("domain-pulse"), 1000);
    const startedAt = performance.now();
    const duration = 700;
    const tick = now => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      valueNode.textContent = `${Math.round(previous + (target - previous) * eased)} / 100`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const artifacts = root.getElementById("desktop-artifacts");
  const retained = new Set();
  model.artifacts.slice(0, 3).forEach((artifact, index) => {
    const id = JSON.stringify([artifact.source_quest_id, artifact.artifact_id]);
    let button = [...artifacts.children].find(node => node.dataset.artifactId === id);
    if (!button) {
      const iconIndex = { code: 2, document: 0, research: 0, plan: 1, creative: 4, validation: 3, automation: 5 }[artifact.kind] ?? 0;
      button = element("button", "artifact-slot"); button.type = "button"; button.dataset.artifactId = id;
      button.append(pixelIcon(root, iconIndex, "artifact-symbol"),element("strong", ""),element("small", ""));
    }
    button.querySelector("strong").textContent = artifact.name;
    button.querySelector("small").textContent = label(artifact.kind);
    retained.add(button);
    if (artifacts.children[index] !== button) artifacts.insertBefore(button, artifacts.children[index] ?? null);
  });
  [...artifacts.children].filter(node => !retained.has(node)).forEach(node => node.remove());
  if (!retained.size) artifacts.append(element("p", "muted", "尚未记录真实成果。"));
  if (focused?.isConnected && focused !== root.activeElement && retained.has(focused)) focused.focus({ preventScroll: true });
  const validation = model.validation;
  root.getElementById("board-validation").textContent = !validation?.attempted ? "验证 · 尚未观测到验证信号" : validation.latest_passed == null ? "验证 · 已记录证据，暂无实测总数" : `验证 · ${validation.latest_passed}/${validation.latest_total ?? "?"} 通过`;
}
