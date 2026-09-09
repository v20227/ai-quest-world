import { currentQuest, recentQuests, allArtifacts, artifactKey, unseenReturns } from "./view-state.mjs";
import { renderGuildScene, displayLabel, returnHighlightLabel } from "./guild-scene.mjs";
import { createPixelComposition } from "./pixel-composition.mjs";
import { renderExpedition, renderSettlement, renderGoals } from "./expedition-view.mjs";
import { renderCollection, renderCollectionPlacement } from "./collection-view.mjs";
import { createCollectionNotices } from "./collection-notices.mjs";
import { createEconomyUI } from "./economy-view.mjs";
import { captureLabel, renderCaptureStatus } from "./capture-view.mjs";

const collectionNotices = createCollectionNotices();

const refs = {
  body: document.body,
  connectionChip: document.querySelector("#connection-chip"),
  connectionLabel: document.querySelector("#connection-label"),
  contextShell: document.querySelector("#context-shell"),
  panelEyebrow: document.querySelector("#panel-eyebrow"),
  panelTitle: document.querySelector("#panel-title"),
  panelContent: document.querySelector("#panel-content"),
  sceneStatus: document.querySelector("#scene-status"),
  reloadButton: document.querySelector("#reload-demo"),
  reloadLabel: document.querySelector("#reload-label"),
  hudQuestTitle: document.querySelector("#hud-quest-title"),
  hudQuestPhase: document.querySelector("#hud-quest-phase"),
  hudGateState: document.querySelector("#hud-gate-state"),
  hudQuestCount: document.querySelector("#hud-quest-count"),
  returnOverlay: document.querySelector("#return-overlay"),
  returnTitle: document.querySelector("#return-title"),
  returnSubtitle: document.querySelector("#return-subtitle"),
  returnHighlights: document.querySelector("#return-highlights"),
  enterWorld: document.querySelector("#enter-world"),
  toast: document.querySelector("#toast")
};

const ui = {
  snapshot: null,
  selectedPanel: "camp",
  selectedQuestId: null,
  selectedArtifactId: null,
  selectedDomain: null,
  source: initialSource(),
  mode: "canonical",
  toastTimer: null,
  loading: false,
  savingCollection: false,
  generation: 0,
  pendingReturns: [],
  seenReturns: restoreSeenReturns(),
  activeReturn: null,
  returnCollection: null,
  pauseReturns: false,
  returnTimer: null,
  panelMarkup: null,
  artifactPreview: null,
  panelFocus: null
};

const ECONOMY_PANELS = new Set(["wallet", "shop", "inventory", "companions"]);
const BUILDING_PANELS = new Set(["gate", "guild", "workshop", "library", "camp", "chronicle", "settings", "quest", "artifact", "artifacts", "domain", "collection", ...ECONOMY_PANELS]);

const pixelComposition = createPixelComposition(document, {
  openArtifact: key => { ui.selectedArtifactId = key; selectPanel("artifact"); }
});

const economyUI = createEconomyUI(document, {
  refresh: () => loadSnapshot(ui.mode, { showReturn: false, silent: true }),
  notify: showToast,
  rerender: () => { if (ECONOMY_PANELS.has(ui.selectedPanel)) selectPanel(ui.selectedPanel, { keepMobileOpen: false }); }
});

init();

async function init() {
  restorePreferences();
  bindEvents();
  window.addEventListener("resize", syncPanelAccess);
  syncPanelAccess();
  await loadSnapshot();
  window.setInterval(() => {
    if (ui.source === "live" && !document.hidden && !ui.loading) loadSnapshot(ui.mode, { silent: true });
  }, 2000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ui.source === "live") loadSnapshot(ui.mode, { silent: true });
  });
}

function bindEvents() {
  document.querySelector("#quest-picker")?.addEventListener("change", event => {
    selectBoardQuest(event.target.value);
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("#return-open-collection")) {
      ui.pauseReturns = true;
      hideReturnOverlay();
      selectPanel("collection");
      return;
    }
    const placementTrigger = event.target.closest("[data-place-collectible]");
    if (placementTrigger) { saveCollectible(placementTrigger.dataset.placeCollectible || null); return; }
    const runTrigger = event.target.closest("[data-select-quest]");
    if (runTrigger && ui.snapshot) {
      selectBoardQuest(runTrigger.dataset.selectQuest);
      return;
    }
    const domainTrigger = event.target.closest("[data-domain]");
    if (domainTrigger) { ui.selectedDomain = domainTrigger.dataset.domain; selectPanel("domain"); return; }
    const originalTrigger = event.target.closest("[data-open-artifact]");
    if (originalTrigger !== null) { openArtifact(originalTrigger.dataset.openArtifact); return; }
    const panelTrigger = event.target.closest("[data-panel]");
    if (panelTrigger !== null) {
      selectPanel(panelTrigger.dataset.panel);
      return;
    }

    const questTrigger = event.target.closest("[data-quest-id]");
    if (questTrigger !== null) {
      ui.selectedQuestId = questTrigger.dataset.questId;
      if (ui.snapshot) renderGuildScene(ui.snapshot, document, ui.selectedQuestId);
      selectPanel("quest");
      return;
    }

    const artifactTrigger = event.target.closest("[data-artifact-id]");
    if (artifactTrigger !== null) {
      ui.selectedArtifactId = artifactTrigger.dataset.artifactId;
      selectPanel("artifact");
      return;
    }

    const modeTrigger = event.target.closest("[data-demo-mode]");
    if (modeTrigger !== null) {
      setSource("demo");
      loadSnapshot(modeTrigger.dataset.demoMode);
      return;
    }

    const sourceTrigger = event.target.closest("[data-source]");
    if (sourceTrigger !== null) {
      setSource(sourceTrigger.dataset.source);
      loadSnapshot(ui.mode);
      return;
    }

    if (event.target.closest("#theme-toggle, #settings-theme") !== null) {
      toggleTheme();
      return;
    }

    if (event.target.closest("#motion-toggle, #settings-motion") !== null) {
      toggleMotion();
      return;
    }

    if (event.target.closest("#reload-demo") !== null) {
      loadSnapshot(ui.mode);
      return;
    }

    if (event.target.closest("#close-panel") !== null) {
      closePanel();
      return;
    }

    if (event.target.closest("#settlement-card") !== null) {
      hideReturnOverlay();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (document.querySelector(".display-drawer[open]")) return;
    if (event.key === "Escape") {
      if (!refs.returnOverlay.classList.contains("is-hidden")) {
        hideReturnOverlay();
      } else {
        closePanel();
      }
    }
  });
}

async function saveCollectible(itemId) {
  if (ui.savingCollection || ui.source !== "live" || !ui.snapshot?.collection) return;
  const namespace = ui.snapshot.display_namespace;
  const revision = ui.snapshot.collection.placement.revision;
  ui.savingCollection = true;
  selectPanel("collection");
  try {
    const response = await fetch("/api/collection/placement", {
      method: "POST",
      headers: { "content-type": "application/json", "x-world-namespace": namespace },
      body: JSON.stringify({ item_id: itemId, revision }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(response.status === 409 ? "收藏状态已变化，已请求刷新，请确认后重试。" : "保存未完成，请刷新后确认陈列状态。");
    const collection = await response.json();
    if (ui.source === "live" && ui.snapshot?.display_namespace === namespace) {
      ui.snapshot.collection = collection;
      renderCollectionPlacement(document, ui.snapshot);
      showToast(itemId ? "纪念画已摆放并保存。" : "已收起，纪念画仍在收藏中。");
    }
  } catch (error) {
    showToast(error.name === "TimeoutError" ? "保存结果暂未确认，请刷新后查看，勿重复操作。" : error.message);
  } finally {
    ui.savingCollection = false;
    if (ui.source === "live" && ui.snapshot?.display_namespace === namespace) {
      await loadSnapshot(ui.mode, { showReturn: false, silent: true });
    }
  }
}

async function loadSnapshot(mode = ui.mode, { showReturn = true, silent = false } = {}) {
  if (economyUI.busy) return;
  const generation = ++ui.generation;
  ui.loading = true;
  ui.mode = mode;
  if (!silent) {
    setConnection("连接中", false);
    refs.sceneStatus.textContent = "正在恢复连接…";
  }
  if (ui.snapshot === null) {
    showLoading();
  }

  try {
    const endpoint = ui.source === "live"
      ? "/api/world"
      : `/api/demo?mode=${encodeURIComponent(mode)}`;
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new Error(`World data returned ${response.status}`);
    }
    const snapshot = await response.json();
    if (generation !== ui.generation) return;
    snapshot.quests = recentQuests(snapshot.quests);
    ui.snapshot = snapshot;
    setConnection(ui.source === "live" ? captureLabel(snapshot) : "演示 · 非真实采集", false);
    renderWorld(snapshot);
    selectPanel(ui.selectedPanel, { keepMobileOpen: false });
    if (showReturn && ui.source === "live") {
      ui.pendingReturns.push(...unseenReturns(snapshot.world, ui.seenReturns, ui.pendingReturns));
      showNextReturn();
    } else if (showReturn && snapshot.world.return_highlights.length > 0) {
      showReturnOverlay({ title: currentQuest(snapshot.quests)?.title, highlights: snapshot.world.return_highlights });
    }
  } catch (error) {
    if (generation !== ui.generation) return;
    console.error(error);
    setConnection("离线", true);
    refs.sceneStatus.textContent = "连接不可用，请稍后重试";
    if (ui.snapshot === null) renderError();
    if (!silent) showToast("无法连接世界，请重试。");
  } finally {
    if (generation === ui.generation) ui.loading = false;
  }
}

function renderWorld(snapshot) {
  economyUI.update(snapshot, ui.source);
  renderCollectionPlacement(document, snapshot);
  pixelComposition.update(snapshot, ui.source);
  renderGuildScene(snapshot, document, ui.selectedQuestId);
  const { world, quests } = snapshot;
  const quest = currentQuest(quests) ?? null;
  refs.hudQuestTitle.textContent = quest?.title ?? "等待新的运行…";
  refs.hudQuestPhase.textContent = quest === null
    ? "暂无进行中的任务"
    : `${labelize(quest.phase)} · ${labelize(quest.status)}`;
  refs.hudGateState.textContent = labelize(world.gate.state);
  refs.hudQuestCount.textContent = String(quests.length);
  refs.sceneStatus.textContent = sceneStatus(world, quest);
  const reloadLabel = ui.source === "demo" ? "重播信号" : "刷新世界";
  refs.reloadLabel.textContent = reloadLabel;
  refs.reloadButton.setAttribute("aria-label", reloadLabel);

  for (const [building, state] of [
    ["gate", world.gate.state],
    ["guild", world.guild.state],
    ["workshop", world.workshop.state],
    ["library", world.library.state]
  ]) {
    const object = document.querySelector(`.object-${building}`);
    if (object === null) {
      continue;
    }
    object.classList.toggle("is-locked", state === "LOCKED" || state === "OLD" || state === "DORMANT");
    object.classList.toggle("is-unlocked", state !== "LOCKED" && state !== "OLD" && state !== "DORMANT");
    object.classList.toggle("is-active", ["ACTIVE", "BUSY", "RETURNING", "MILESTONE"].includes(state));
    const status = object.querySelector(`[data-status-for="${building}"]`);
    if (status !== null) {
      status.textContent = labelize(state);
    }
  }
}

function selectPanel(panel, { keepMobileOpen = true } = {}) {
  const opening = keepMobileOpen && !refs.contextShell.classList.contains("is-open");
  if (opening) ui.panelFocus = document.activeElement;
  if (!BUILDING_PANELS.has(panel)) {
    panel = "camp";
  }
  ui.selectedPanel = panel;
  document.querySelectorAll(".world-object, .nav-item").forEach((element) => {
    element.classList.toggle("is-selected", element.dataset.panel === panel);
    if (element.classList.contains("nav-item")) {
      element.classList.toggle("is-active", element.dataset.panel === panel);
    }
  });
  const definition = panelDefinition(panel);
  refs.panelEyebrow.textContent = definition.eyebrow;
  refs.panelTitle.textContent = definition.title;
  const markup = ui.snapshot === null ? loadingMarkup() : definition.render(ui.snapshot);
  if (markup !== ui.panelMarkup) {
    const focused = refs.panelContent.contains(document.activeElement) ? document.activeElement : null;
    const identity = focused && ["id", "data-quest-id", "data-artifact-id", "data-open-artifact", "data-panel", "href"].map(key => [key, focused.getAttribute(key)]).find(([, value]) => value !== null);
    const scroll = refs.contextShell.scrollTop;
    refs.panelContent.innerHTML = markup;
    ui.panelMarkup = markup;
    if (identity) [...refs.panelContent.querySelectorAll("button, a, input")].find(element => element.getAttribute(identity[0]) === identity[1])?.focus({ preventScroll: true });
    refs.contextShell.scrollTop = scroll;
  }
  if (keepMobileOpen) {
    refs.contextShell.classList.add("is-open");
  }
  syncPanelAccess();
  if (opening) document.querySelector("#close-panel").focus({ preventScroll: true });
}

function closePanel() {
  refs.contextShell.classList.remove("is-open");
  syncPanelAccess();
  if (ui.panelFocus?.isConnected) ui.panelFocus.focus({ preventScroll: true });
  else refs.reloadButton.focus({ preventScroll: true });
  ui.pauseReturns = false;
  showNextReturn();
}

function selectBoardQuest(id) {
  ui.selectedQuestId = id;
  if (!ui.snapshot) return;
  renderGuildScene(ui.snapshot, document, id);
  if (document.documentElement.clientWidth < 1180) selectPanel("quest");
  else if (ui.selectedPanel === "quest" && refs.contextShell.classList.contains("is-open")) selectPanel("quest", { keepMobileOpen: false });
}

function syncPanelAccess() {
  refs.contextShell.inert = !refs.contextShell.classList.contains("is-open");
}

function panelDefinition(panel) {
  if (ECONOMY_PANELS.has(panel)) return {
    eyebrow: "真实工作 / 生活与成长",
    title: { wallet: "工作所得，每一笔都有来处。", shop: "用成果换取你的选择。", inventory: "为伙伴准备的小小行囊。", companions: "让工作世界多一份陪伴。" }[panel],
    render: () => economyUI.render(panel)
  };
  switch (panel) {
    case "collection":
      return { eyebrow: "收藏 / 营地陈列", title: "把值得记住的成果留在身边。", render: snapshot => renderCollection(snapshot, { editable: ui.source === "live" && Boolean(snapshot.collection), busy: ui.savingCollection }) };
    case "artifacts":
      return { eyebrow: "成果 / 真实产出", title: "成果档案", render: snapshot => {
        const artifacts = allArtifacts(snapshot.progressions, snapshot.quests);
        return `<p class="panel-lede">${artifacts.length} 条任务成果引用。</p>${artifacts.length ? artifacts.map(artifactItemMarkup).join("") : emptyMarkup("尚未记录真实成果。")}`;
      } };
    case "domain":
      return { eyebrow: "领域 / 永久成长", title: labelize(ui.selectedDomain), render: renderDomainPanel };
    case "gate":
      return { eyebrow: "AI 传送门 / 连接", title: "连接世界的信号。", render: renderGatePanel };
    case "guild":
      return { eyebrow: "任务公会 / 纪事", title: "让值得记住的工作，留下足迹。", render: renderGuildPanel };
    case "workshop":
      return { eyebrow: "建筑 / 工程", title: "工坊", render: (snapshot) => renderBuildingPanel(snapshot, "workshop") };
    case "library":
      return { eyebrow: "建筑 / 知识", title: "图书馆", render: (snapshot) => renderBuildingPanel(snapshot, "library") };
    case "chronicle":
      return { eyebrow: "纪事 / 世界记忆", title: "一路走来的足迹。", render: renderChroniclePanel };
    case "settings":
      return { eyebrow: "设置 / 本地", title: "调整你的世界视角。", render: renderSettingsPanel };
    case "quest":
      return { eyebrow: "任务 / 远征", title: "任务详情", render: renderQuestPanel };
    case "artifact":
      return { eyebrow: "成果 / 真实产出", title: "成果详情", render: renderArtifactPanel };
    case "camp":
    default:
      return { eyebrow: "世界视角 / 小小营地", title: "让有意义的工作在此扎根。", render: renderCampPanel };
  }
}

function renderCampPanel(snapshot) {
  const { world, quests, progressions } = snapshot;
  const progression = progressions[0];
  const milestones = world.milestones ?? [];
  return `
    <p class="panel-lede">每一次远征都会带回新的收获。营地保存足迹，工作始终属于你。</p>
    <div class="panel-action-row"><button class="secondary-button" data-panel="collection" type="button">收藏与陈列 · ${snapshot.collection?.grants.length ?? 0}</button></div>
    <div class="panel-action-row"><button class="secondary-button" data-panel="wallet" type="button">钱包 · ${snapshot.economy?.gold ?? 0} 金币</button><button class="secondary-button" data-panel="shop" type="button">营地商店</button><button class="secondary-button" data-panel="inventory" type="button">背包</button><button class="secondary-button" data-panel="companions" type="button">伙伴小屋</button></div>
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">营地记忆</h3><span class="status-badge">本地</span></div>
      <div class="detail-line"><span>纪事中的任务</span><strong>${quests.length}</strong></div>
      <div class="detail-line"><span>累计技能经验</span><strong>${formatNumber(world.progression_totals.skill_xp)}</strong></div>
      <div class="detail-line"><span>真实成果</span><strong>${world.progression_totals.artifact_count}</strong></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">最初的足迹</h3><span class="muted-badge">${milestones.length}/3</span></div>
      ${milestones.length === 0 ? emptyMarkup("尚无里程碑，下一次有意义的归来可能留下新的足迹。") : milestones.map(milestoneMarkup).join("")}
    </div>
    ${progression === undefined ? "" : `<div class="panel-action-row"><button class="secondary-button" data-panel="guild" type="button">打开任务公会 <span aria-hidden="true">→</span></button></div>`}
  `;
}

function renderDomainPanel(snapshot) {
  const domain = ui.selectedDomain;
  const value = snapshot.world.progression_totals.domain_progress[domain] ?? 0;
  const quests = snapshot.quests.filter(quest => (quest.activity_mix[domain] ?? 0) > 0);
  return `<p class="panel-lede">有意义的工作带来的永久成长。这是领域进度，不是装备加成，也不是技能解锁前置条件。</p><div class="detail-card"><div class="progress-label"><span>${escapeHtml(labelize(domain))}</span><strong>${value}/100</strong></div>${meter(value)}</div><div class="quest-list">${quests.length ? quests.map(questItemMarkup).join("") : emptyMarkup("尚未观测到相关工作。")}</div>`;
}

function renderGatePanel(snapshot) {
  const { world, quests } = snapshot;
  return `
    <p class="panel-lede">传送门连接本地工具与这个小世界。它只负责观测，不会反向控制工具。</p>
    ${renderCaptureStatus(snapshot)}
    ${renderGoals(snapshot, "gate")}
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">${labelize(world.gate.state)}</h3><span class="confidence-badge verified">只读</span></div>
      <div class="detail-line"><span>进行中的远征</span><strong>${world.active_run_ids.length}</strong></div>
      <div class="detail-line"><span>已观测到的连接</span><strong>${world.gate.connection_count}</strong></div>
      <div class="detail-line"><span>最近归来</span><strong>${formatTime(world.last_return_at)}</strong></div>
    </div>
    <div class="detail-card">
      <div class="progress-label"><span>传送门活跃度</span><strong>${world.activity.gate.level}%</strong></div>
      ${meter(world.activity.gate.level)}
      <p class="artifact-meta">临时活跃度会随时间消退，连接记录会保留。</p>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">最近归来</h3><span class="muted-badge">${quests.length}</span></div>
      ${quests.length === 0 ? emptyMarkup("尚无远征归来。") : quests.map(questSummaryMarkup).join("")}
    </div>
  `;
}

function renderGuildPanel(snapshot) {
  const { world, quests } = snapshot;
  return `
    <p class="panel-lede">公会将运行中的工作整理为可读的纪事。一个真实目标可以包含多次子运行，但不会因此重复发放奖励。</p>
    ${renderGoals(snapshot, "guild")}
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">${labelize(world.guild.state)}</h3><span class="status-badge">${world.guild.qualifying_quest_count} 项达标任务</span></div>
      <div class="detail-line"><span>已记录的任务</span><strong>${quests.length}</strong></div>
      <div class="detail-line"><span>里程碑</span><strong>${world.milestones.length}</strong></div>
    </div>
    <div class="quest-list">
      ${quests.length === 0 ? emptyMarkup("任务板暂时空白，开始一次有意义的远征，写下第一条记录。") : quests.map(questItemMarkup).join("")}
    </div>
  `;
}

function renderBuildingPanel(snapshot, buildingName) {
  const { world, progressions } = snapshot;
  const building = world[buildingName];
  const domainEntries = Object.entries(building.domain_progress);
  const artifacts = allArtifacts(progressions, snapshot.quests).filter((artifact) => buildingName === "workshop"
    ? ["code", "validation", "automation"].includes(artifact.kind)
    : ["research", "plan", "document"].includes(artifact.kind));
  return `
    <p class="panel-lede">${buildingName === "workshop" ? "在这里，把工作中的发现付诸构建、测试与修复。" : "在这里，收藏问题、计划，以及让下一步更清晰的证据。"}</p>
    ${renderGoals(snapshot, buildingName)}
    <div class="insight-card building-head">
      <span class="building-mini-icon ${buildingName}" aria-hidden="true">${buildingName === "workshop" ? "✣" : "⌘"}</span>
      <div><h3 class="evidence-title">${labelize(building.state)}</h3><p class="artifact-meta">${building.unlocked_at === null ? "此领域积累可信工作后解锁。" : `解锁于 ${formatTime(building.unlocked_at)}`}</p></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">领域进度</h3><span class="muted-badge">永久</span></div>
      ${domainEntries.map(([domain, value]) => `<div class="progress-label"><span>${escapeHtml(labelize(domain))}</span><strong>${value}%</strong></div>${meter(value)}`).join("")}
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">实时活跃度</h3><span class="status-badge">${world.activity[buildingName].level}%</span></div>
      ${meter(world.activity[buildingName].level)}
      <p class="artifact-meta">活跃度是临时的，领域进度会永久保留。</p>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">最近成果</h3><span class="muted-badge">${artifacts.length}</span></div>
      ${artifacts.length === 0 ? emptyMarkup("尚无对应成果归来。") : artifacts.map(artifactItemMarkup).join("")}
    </div>
  `;
}

function renderQuestPanel(snapshot) {
  const quest = snapshot.quests.find((candidate) => candidate.quest_id === ui.selectedQuestId) ?? currentQuest(snapshot.quests);
  if (quest === undefined) {
    return emptyMarkup("暂无可用任务。");
  }
  const progression = snapshot.progressions.find((candidate) => candidate.quest_id === quest.quest_id);
  return `
    <p class="panel-lede">任务汇集为同一真实目标开展的运行。证据保持真实，世界记住结果。</p>
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">${escapeHtml(quest.title)}</h3>${confidenceBadge(quest.outcome_confidence)}</div>
      <div class="detail-line"><span>生命周期</span><strong>${labelize(quest.status)}</strong></div>
      <div class="detail-line"><span>当前阶段</span><strong>${labelize(quest.phase)}</strong></div>
      <div class="detail-line"><span>预估难度</span><strong>${quest.difficulty?.estimated == null ? "未知" : `${quest.difficulty.estimated}/5`}</strong></div>
      <div class="detail-line"><span>观测难度</span><strong>${quest.difficulty?.observed == null ? "未知" : `${quest.difficulty.observed}/5`}</strong></div>
      <div class="detail-line"><span>关联运行</span><strong>${quest.run_ids.length}</strong></div>
      <div class="detail-line"><span>已观测到的智能体</span><strong>${quest.agent_ids.length}</strong></div>
    </div>
    ${renderExpedition(quest)}
    ${renderSettlement(snapshot, quest.quest_id)}
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">工作类型分布</h3><span class="muted-badge">${escapeHtml(labelize(quest.primary_domain))}</span></div>
      ${Object.entries(quest.activity_mix).filter(([, value]) => value > 0).map(([domain, value]) => mixRow(domain, value)).join("") || emptyMarkup("尚未解析到有意义的工作活动。")}
    </div>
    <div class="evidence-card">
      <div class="evidence-head"><h3 class="evidence-title">验证</h3>${quest.validation_summary.attempted ? `<span class="status-badge">${quest.validation_summary.success_count} 次通过</span>` : `<span class="muted-badge">待验证</span>`}</div>
      ${validationMarkup(quest.validation_summary)}
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">成长足迹</h3><span class="status-badge">${progression?.skill_xp ?? 0} 经验</span></div>
      <div class="detail-line"><span>领域进度</span><strong>${progression === undefined ? "待处理" : formatDomainTotal(progression.domain_progress)}</strong></div>
      <div class="detail-line"><span>真实成果</span><strong>${progression?.loot_refs.length ?? 0}</strong></div>
    </div>
    ${allArtifacts(snapshot.progressions, [quest]).filter(artifact => artifact.source_quest_id === quest.quest_id).map(artifactItemMarkup).join("")}
  `;
}

function renderArtifactPanel(snapshot) {
  const artifacts = allArtifacts(snapshot.progressions, snapshot.quests);
  const artifact = artifacts.find((candidate) => artifactKey(candidate) === ui.selectedArtifactId) ?? artifacts[0];
  if (artifact === undefined) {
    return emptyMarkup("尚未记录真实成果。");
  }
  return `
    <p class="panel-lede">此成果来自运行中记录的持久化引用。图标为通用展示，成果身份真实可查。</p>
    <div class="artifact-card">
      <div class="artifact-icon" aria-hidden="true">✦</div>
      <div><h3 class="artifact-name">${escapeHtml(artifact.name ?? artifact.artifact_id)}</h3><p class="artifact-meta">${labelize(artifact.kind)} 成果 · ${escapeHtml(artifact.source_quest_id)}</p></div>
    </div>
    <div class="detail-card">
      <div class="detail-line"><span>引用位置</span><strong>${escapeHtml(artifact.uri_or_path ?? "证据引用")}</strong></div>
      <div class="detail-line"><span>来源任务</span><strong>${escapeHtml(artifact.source_quest_id)}</strong></div>
      <div class="detail-line"><span>结算</span><strong>${artifact.rewarded ? "已计入结算成果" : "观测到的引用 · 不额外发奖"}</strong></div>
      <div class="detail-line"><span>证据引用数</span><strong>${artifact.evidence_refs?.length ?? 0}</strong></div>
    </div>
    ${snapshot.capabilities?.artifact_view ? `<div class="panel-action-row"><button class="primary-button" type="button" data-open-artifact="${escapeAttribute(artifactKey(artifact))}">查看原文件</button></div><p class="artifact-meta">展示当前本地文件，并非历史存档。已删除或受保护的文件不可查看。</p>${artifactPreviewMarkup(artifact)}` : `<p class="artifact-meta">原文件查看未开启。为此项目配置 AI_QUEST_WORLD_ARTIFACT_ROOT 后，可查看允许访问的文件。</p>`}
  `;
}

function artifactUrl(artifact) {
  return `/api/artifact?quest=${encodeURIComponent(artifact.source_quest_id)}&artifact=${encodeURIComponent(artifact.artifact_id)}`;
}

async function openArtifact(key) {
  const artifact = allArtifacts(ui.snapshot?.progressions ?? [], ui.snapshot?.quests ?? []).find(value => artifactKey(value) === key);
  if (!artifact || !ui.snapshot.capabilities?.artifact_view || ui.source !== "live") return;
  const preview = { key, status: "正在加载原文件…" };
  ui.artifactPreview = preview;
  selectPanel("artifact", { keepMobileOpen: false });
  try {
    const response = await fetch(artifactUrl(artifact), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("unavailable");
    if (response.headers.get("content-type")?.startsWith("text/plain")) {
      preview.text = await response.text(); preview.status = "原文件内容";
    } else { preview.binary = true; preview.status = "二进制文件，请下载查看"; }
  } catch { preview.status = "原文件不可用，可能已删除、受保护或超过 1 MiB。"; }
  if (ui.artifactPreview === preview && ui.selectedPanel === "artifact") selectPanel("artifact", { keepMobileOpen: false });
}

function artifactPreviewMarkup(artifact) {
  const preview = ui.artifactPreview;
  if (preview?.key !== artifactKey(artifact)) return "";
  return `<div class="detail-card" aria-live="polite"><h3 class="evidence-title">${escapeHtml(preview.status)}</h3>${preview.text === undefined ? "" : `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto">${escapeHtml(preview.text)}</pre>`}${preview.binary ? `<a class="secondary-button" download href="${escapeAttribute(artifactUrl(artifact))}">下载原文件</a>` : ""}</div>`;
}

function renderChroniclePanel(snapshot) {
  const { world, quests } = snapshot;
  const entries = [
    ...world.milestones.map((milestone) => `<div class="detail-line"><span>${formatTime(milestone.unlocked_at)}</span><strong>${labelize(milestone.milestone_id)}</strong></div>`),
    ...quests.map((quest) => `<button class="quest-item" data-quest-id="${escapeAttribute(quest.quest_id)}" type="button"><span class="quest-item-title">${escapeHtml(quest.title)}</span><span class="quest-item-meta">${labelize(quest.status)} · ${labelize(quest.outcome_confidence ?? "pending")}</span></button>`)
  ];
  return `
    <p class="panel-lede">纪事收藏有意义的工作节点，而不是对话逐字稿。技术细节可在任务详情中查看。</p>
    ${renderGoals(snapshot, "chronicle")}
    <div class="detail-card">${entries.length === 0 ? emptyMarkup("纪事正等待第一次有意义的归来。") : entries.join("")}</div>
  `;
}

function renderSettingsPanel() {
  const sourceLabel = ui.source === "live" ? "本地世界" : "演示数据";
  return `
    <p class="panel-lede">世界以本地优先、只读方式运行。调整显示方式不会改变底层状态。</p>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">世界视角</h3><span class="muted-badge">主题</span></div>
      <div class="panel-action-row"><button class="secondary-button" id="settings-theme" type="button">切换主题 <span aria-hidden="true">◐</span></button></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">归来动画</h3><span class="muted-badge">无障碍</span></div>
      <p class="artifact-meta">减少动态效果后，所有状态仍可清晰阅读，无须依赖粒子或动画。</p>
      <div class="panel-action-row"><button class="secondary-button" id="settings-motion" type="button">切换减少动态效果</button></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">世界数据源</h3><span class="muted-badge">${sourceLabel}</span></div>
      <p class="artifact-meta">本地世界读取 SQLite 中保存的状态。演示数据仅用于查看固定的展示效果。</p>
      <div class="panel-action-row"><button class="secondary-button" data-source="live" type="button">本地世界</button><button class="secondary-button" data-source="demo" type="button">演示数据</button></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">演示结果</h3><span class="muted-badge">演示</span></div>
      <p class="artifact-meta">使用演示数据时，可查看证据充分的已验证归来，或尚未验证的归来。</p>
      <div class="panel-action-row"><button class="secondary-button" data-demo-mode="canonical" type="button">已验证归来</button><button class="secondary-button" data-demo-mode="unverified" type="button">未验证归来</button></div>
    </div>
  `;
}

function renderError() {
  refs.panelEyebrow.textContent = "世界视角 / 离线";
  refs.panelTitle.textContent = "暂时无法连接营地。";
  refs.panelContent.innerHTML = `
    <div class="error-card"><strong>连接中断</strong>无法加载世界数据，界面不会用虚构状态代替。</div>
    <div class="panel-action-row"><button class="primary-button" id="retry-world" type="button">重新连接 <span aria-hidden="true">↻</span></button></div>
  `;
  refs.panelContent.querySelector("#retry-world")?.addEventListener("click", () => loadSnapshot(ui.mode));
  refs.contextShell.classList.add("is-open");
  syncPanelAccess();
}

function showLoading() {
  refs.panelEyebrow.textContent = "世界视角 / 同步中";
  refs.panelTitle.textContent = "正在加载世界…";
  refs.panelContent.innerHTML = loadingMarkup();
}

function loadingMarkup() {
  return `<div class="loading-stack" aria-label="加载中"><span></span><span></span><span></span></div>`;
}

const SETTLEMENT_BLESSINGS = [
  "小小的努力，更好的自己。",
  "每一点探索都留下足迹。",
  "让创造温暖生活。",
  "休息一下，再出发。",
  "今天的努力，会长成明天的建筑。",
  "世界因诚实而美。"
];

function blessingFor(seed) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return SETTLEMENT_BLESSINGS[hash % SETTLEMENT_BLESSINGS.length];
}

function showReturnOverlay(entry) {
  clearTimeout(ui.returnTimer);
  const grant = entry.collectionGrant ?? null;
  const income = ui.source === "live" && entry.quest_id ? ui.snapshot?.economy?.history.entries.find(item => item.type === "work_reward" && item.quest_id === entry.quest_id) : null;
  const progression = ui.source === "live" && entry.quest_id ? ui.snapshot?.progressions?.find(item => item.quest_id === entry.quest_id) : null;
  ui.returnCollection = grant;
  const highlights = (entry.highlights ?? []).slice(0, 3);
  refs.returnTitle.textContent = entry.batch ? "离线结算完成。"
    : entry.collectionOnly ? "新收藏已解锁。"
    : highlights.some((item) => item.kind === "milestone_unlocked") ? "世界因你而改变。"
    : "世界记住了你的努力。";
  refs.returnSubtitle.textContent = entry.batch
    ? `你不在的时候，完成了 ${entry.count} 件真实的事。`
    : entry.collectionOnly ? "营地纪念已收入收藏。"
    : `${entry.title ?? "一次有意义的远征"}已回到营地。`;
  if (entry.batch) {
    const lines = [`${entry.count} 个远征收获记录`];
    if (entry.totalXp > 0) lines.push(`记录成长 +${entry.totalXp} 经验`);
    if (entry.totalGold > 0) lines.push(`工作金币 +${entry.totalGold} · 已入账`);
    if (entry.newCollection > 0) lines.push(`新增收藏 ×${entry.newCollection}`);
    refs.returnHighlights.innerHTML = lines.map(line => `<div class="return-highlight"><span>${escapeHtml(line)}</span></div>`).join("");
    const blessing = document.getElementById("return-blessing");
    if (blessing) blessing.textContent = blessingFor(`batch-${entry.count}`);
    let collectionButton = document.querySelector("#return-open-collection");
    if (collectionButton) collectionButton.hidden = true;
    refs.returnOverlay.classList.remove("is-hidden");
    ui.returnTimer = window.setTimeout(hideReturnOverlay, 8000);
    return;
  }
  refs.returnHighlights.innerHTML = highlights.map((item) => `<div class="return-highlight"><span>${escapeHtml(returnHighlightLabel(item))}</span></div>`).join("");
  if (progression?.skill_xp > 0) refs.returnHighlights.insertAdjacentHTML("beforeend", `<div class="return-highlight"><span>记录成长 +${Number(progression.skill_xp)} 经验</span></div>`);
  if (income) refs.returnHighlights.insertAdjacentHTML("beforeend", `<div class="return-highlight"><span>本任务金币 +${Number(income.gold_delta)} · 已入账，可在工作钱包追溯</span></div>`);
  if (grant) refs.returnHighlights.insertAdjacentHTML("beforeend", '<div class="return-highlight"><span>新收藏：验证纪念画 · 已收入收藏</span></div>');
  const blessing = document.getElementById("return-blessing");
  if (blessing) blessing.textContent = blessingFor(entry.return_id ?? entry.quest_id ?? "camp");
  let collectionButton = document.querySelector("#return-open-collection");
  if (!collectionButton) {
    collectionButton = document.createElement("button");
    collectionButton.id = "return-open-collection";
    collectionButton.type = "button";
    collectionButton.className = "secondary-button";
    collectionButton.textContent = "查看收藏";
    refs.enterWorld.before(collectionButton);
  }
  collectionButton.hidden = !grant;
  refs.returnOverlay.classList.remove("is-hidden");
  ui.returnTimer = window.setTimeout(hideReturnOverlay, 6000);
}

function hideReturnOverlay() {
  clearTimeout(ui.returnTimer);
  if (ui.source === "live") collectionNotices.acknowledge(ui.snapshot, ui.returnCollection);
  ui.returnCollection = null;
  ui.activeReturn = null;
  refs.returnOverlay.classList.add("is-hidden");
  showNextReturn();
}

function showNextReturn() {
  if (ui.source !== "live" || document.hidden || ui.activeReturn !== null || ui.pauseReturns) return;
  const grants = collectionNotices.pending(ui.snapshot);
  // Habitica 节奏：离线堆积的回归汇总为一张离线结算，不逐条轰炸。
  if (ui.pendingReturns.length > 1) {
    const batch = ui.pendingReturns.splice(0);
    for (const item of batch) if (item.return_id) ui.seenReturns.add(item.return_id);
    try { localStorage.setItem("ai-quest-world-seen-returns", JSON.stringify([...ui.seenReturns])); } catch { /* Keep the current session cursor. */ }
    const questIds = new Set(batch.map(item => item.quest_id).filter(Boolean));
    const progressions = questIds.size ? (ui.snapshot?.progressions ?? []).filter(item => questIds.has(item.quest_id)) : [];
    const totalXp = progressions.reduce((sum, item) => sum + Number(item.skill_xp ?? 0), 0);
    const totalGold = questIds.size
      ? (ui.snapshot?.economy?.history.entries ?? []).filter(item => item.type === "work_reward" && questIds.has(item.quest_id)).reduce((sum, item) => sum + Number(item.gold_delta ?? 0), 0)
      : 0;
    const batchGrants = grants.filter(grant => questIds.has(grant.quest_id));
    for (const grant of batchGrants) collectionNotices.acknowledge(ui.snapshot, grant);
    ui.activeReturn = { batch: true, count: batch.length, totalXp, totalGold, newCollection: batchGrants.length, return_id: `batch-${Date.now()}` };
    showReturnOverlay(ui.activeReturn);
    return;
  }
  let next = ui.pendingReturns.shift();
  if (next) next = { ...next, collectionGrant: grants.find(grant => grant.quest_id === next.quest_id) };
  else if (grants.length) next = { collectionOnly: true, collectionGrant: grants[0] };
  if (!next) return;
  ui.activeReturn = next;
  if (next.return_id) ui.seenReturns.add(next.return_id);
  try { localStorage.setItem("ai-quest-world-seen-returns", JSON.stringify([...ui.seenReturns])); } catch { /* Keep the current session cursor. */ }
  showReturnOverlay(next);
}

function restoreSeenReturns() {
  try {
    const values = JSON.parse(localStorage.getItem("ai-quest-world-seen-returns") ?? "[]");
    return new Set(Array.isArray(values) ? values.filter(value => typeof value === "string") : []);
  } catch { return new Set(); }
}

function toggleTheme() {
  const next = refs.body.dataset.theme === "dusk" ? "meadow" : "dusk";
  refs.body.dataset.theme = next;
  localStorage.setItem("ai-quest-world-theme", next);
  showToast(`${labelize(next)}主题已启用。`);
}

function toggleMotion() {
  const reduced = refs.body.classList.toggle("reduce-motion");
  const button = document.querySelector("#motion-toggle");
  button?.setAttribute("aria-pressed", String(reduced));
  localStorage.setItem("ai-quest-world-reduced-motion", String(reduced));
  showToast(reduced ? "已减少动态效果。" : "已启用完整归来动画。");
}

function restorePreferences() {
  const theme = localStorage.getItem("ai-quest-world-theme");
  if (["dusk", "meadow"].includes(theme)) {
    refs.body.dataset.theme = theme;
  }
  const reduced = localStorage.getItem("ai-quest-world-reduced-motion") === "true";
  refs.body.classList.toggle("reduce-motion", reduced);
  document.querySelector("#motion-toggle")?.setAttribute("aria-pressed", String(reduced));
}

function setConnection(label, error) {
  refs.connectionLabel.textContent = label;
  refs.connectionChip.classList.toggle("is-error", error);
}

function sceneStatus(world, quest) {
  if (world.gate.state === "RETURNING") {
    return quest?.status === "COMPLETED" ? "任务已归来，留下新的足迹" : "新的信号回到了营地";
  }
  if (world.gate.state === "ACTIVE") {
    return `${world.active_run_ids.length} 次远征进行中`;
  }
  return "营地已准备好迎接新的信号";
}

function questItemMarkup(quest) {
  return `<button class="quest-item" data-quest-id="${escapeAttribute(quest.quest_id)}" type="button"><span class="quest-item-head"><span class="quest-item-title">${escapeHtml(quest.title)}</span>${confidenceBadge(quest.outcome_confidence)}</span><span class="quest-item-meta"><span>${labelize(quest.status)}</span><span>${labelize(quest.phase)}</span><span>${quest.artifact_refs.length} 项成果</span></span></button>`;
}

function questSummaryMarkup(quest) {
  return `<button class="quest-item" data-quest-id="${escapeAttribute(quest.quest_id)}" type="button"><span class="quest-item-title">${escapeHtml(quest.title)}</span><span class="quest-item-meta">${labelize(quest.status)} · ${labelize(quest.phase)}</span></button>`;
}

function artifactItemMarkup(artifact) {
  const id = artifactKey(artifact);
  return `<button class="artifact-card" data-artifact-id="${escapeAttribute(id)}" type="button"><span class="artifact-icon" aria-hidden="true">✦</span><span><span class="artifact-name">${escapeHtml(artifact.name ?? artifact.artifact_id)}</span><span class="artifact-meta">${labelize(artifact.kind)} · 真实引用</span></span></button>`;
}

function milestoneMarkup(milestone) {
  return `<div class="detail-line"><span>${labelize(milestone.milestone_id)}</span><strong>${formatTime(milestone.unlocked_at)}</strong></div>`;
}

function validationMarkup(summary) {
  if (!summary.attempted) {
    return `<p class="artifact-meta">尚未观测到验证信号。</p>`;
  }
  const latest = summary.latest_passed === null ? "已记录证据" : `${summary.latest_passed}/${summary.latest_total ?? "?"} 通过`;
  return `<div class="detail-line"><span>最近结果</span><strong>${latest}</strong></div><div class="detail-line"><span>尝试次数</span><strong>${summary.success_count + summary.failure_count}</strong></div>`;
}

function mixRow(domain, value) {
  return `<div class="mix-row"><span>${escapeHtml(labelize(domain))}</span><span class="mix-meter"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span><strong>${value}%</strong></div>`;
}

function meter(value) {
  return `<div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, value))}%"></div></div>`;
}

function confidenceBadge(confidence) {
  const value = confidence ?? "PENDING";
  const className = value.toLowerCase();
  return `<span class="confidence-badge ${className}">${labelize(value)}</span>`;
}

function emptyMarkup(message) {
  return `<div class="empty-card">${escapeHtml(message)}</div>`;
}

function formatDomainTotal(scores) {
  return `${Object.values(scores).reduce((sum, value) => sum + value, 0)} 点`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTime(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function labelize(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return escapeHtml(displayLabel(value));
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function showToast(message) {
  window.clearTimeout(ui.toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");
  ui.toastTimer = window.setTimeout(() => refs.toast.classList.remove("is-visible"), 2200);
}

function initialSource() {
  return new URLSearchParams(window.location.search).get("source") === "demo" ? "demo" : "live";
}

function setSource(source) {
  pixelComposition.suspend();
  ui.source = source === "demo" ? "demo" : "live";
  economyUI.update(null, "loading");
  clearTimeout(ui.returnTimer);
  ui.activeReturn = null;
  ui.returnCollection = null;
  ui.pauseReturns = false;
  ui.pendingReturns = [];
  refs.returnOverlay.classList.add("is-hidden");
  const url = new URL(window.location.href);
  if (ui.source === "demo") {
    url.searchParams.set("source", "demo");
  } else {
    url.searchParams.delete("source");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
