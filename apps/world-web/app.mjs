import { currentQuest, recentQuests, allArtifacts, artifactKey, unseenReturns } from "./view-state.mjs";
import { renderGuildScene } from "./guild-scene.mjs";

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
  generation: 0,
  pendingReturns: [],
  seenReturns: restoreSeenReturns(),
  activeReturn: null,
  returnTimer: null,
  panelMarkup: null,
  returnFocus: null,
  artifactPreview: null,
  panelFocus: null
};

const BUILDING_PANELS = new Set(["gate", "guild", "workshop", "library", "camp", "chronicle", "settings", "quest", "artifact", "artifacts", "domain"]);

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

    if (event.target.closest("#enter-world") !== null || event.target.closest(".return-backdrop") !== null) {
      hideReturnOverlay();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && !refs.returnOverlay.classList.contains("is-hidden")) {
      event.preventDefault(); refs.enterWorld.focus(); return;
    }
    if (event.key === "Escape") {
      if (!refs.returnOverlay.classList.contains("is-hidden")) {
        hideReturnOverlay();
      } else {
        closePanel();
      }
    }
  });
}

async function loadSnapshot(mode = ui.mode, { showReturn = true, silent = false } = {}) {
  const generation = ++ui.generation;
  ui.loading = true;
  ui.mode = mode;
  if (!silent) {
    setConnection("Connecting", false);
    refs.sceneStatus.textContent = "Restoring signal...";
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
    setConnection(ui.source === "live" ? "World ready" : "Demo", false);
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
    setConnection("Offline", true);
    refs.sceneStatus.textContent = "Signal unavailable — retry when ready";
    if (ui.snapshot === null) renderError();
    if (!silent) showToast("The world signal could not be reached. Try again.");
  } finally {
    if (generation === ui.generation) ui.loading = false;
  }
}

function renderWorld(snapshot) {
  renderGuildScene(snapshot, document, ui.selectedQuestId);
  const { world, quests } = snapshot;
  const quest = currentQuest(quests) ?? null;
  refs.hudQuestTitle.textContent = quest?.title ?? "Waiting for a run...";
  refs.hudQuestPhase.textContent = quest === null
    ? "No active Quest"
    : `${labelize(quest.phase)} · ${labelize(quest.status)}`;
  refs.hudGateState.textContent = labelize(world.gate.state);
  refs.hudQuestCount.textContent = String(quests.length);
  refs.sceneStatus.textContent = sceneStatus(world, quest);
  const reloadLabel = ui.source === "demo" ? "Replay signal" : "Refresh world";
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
}

function selectBoardQuest(id) {
  ui.selectedQuestId = id;
  if (!ui.snapshot) return;
  renderGuildScene(ui.snapshot, document, id);
  if (ui.selectedPanel === "quest" && refs.contextShell.classList.contains("is-open")) selectPanel("quest", { keepMobileOpen: false });
}

function syncPanelAccess() {
  refs.contextShell.inert = !refs.contextShell.classList.contains("is-open");
}

function panelDefinition(panel) {
  switch (panel) {
    case "artifacts":
      return { eyebrow: "ARTIFACTS / REAL OUTPUTS", title: "Artifact archive", render: snapshot => {
        const artifacts = allArtifacts(snapshot.progressions, snapshot.quests);
        return `<p class="panel-lede">${artifacts.length} observed references across your Quests.</p>${artifacts.length ? artifacts.map(artifactItemMarkup).join("") : emptyMarkup("No real artifacts have been recorded yet.")}`;
      } };
    case "domain":
      return { eyebrow: "DOMAIN / PERMANENT GROWTH", title: ui.selectedDomain ?? "Domain", render: renderDomainPanel };
    case "gate":
      return { eyebrow: "AI GATE / CONNECTION", title: "The signal is open.", render: renderGatePanel };
    case "guild":
      return { eyebrow: "QUEST GUILD / CHRONICLE", title: "What is worth remembering?", render: renderGuildPanel };
    case "workshop":
      return { eyebrow: "BUILDING / ENGINEERING", title: "Workshop", render: (snapshot) => renderBuildingPanel(snapshot, "workshop") };
    case "library":
      return { eyebrow: "BUILDING / KNOWLEDGE", title: "Library", render: (snapshot) => renderBuildingPanel(snapshot, "library") };
    case "chronicle":
      return { eyebrow: "CHRONICLE / WORLD MEMORY", title: "The trail so far.", render: renderChroniclePanel };
    case "settings":
      return { eyebrow: "SETTINGS / LOCAL", title: "Shape the lens.", render: renderSettingsPanel };
    case "quest":
      return { eyebrow: "QUEST / EXPEDITION", title: "Quest detail", render: renderQuestPanel };
    case "artifact":
      return { eyebrow: "ARTIFACT / REAL OUTPUT", title: "Artifact detail", render: renderArtifactPanel };
    case "camp":
    default:
      return { eyebrow: "WORLD LENS / SMALL CAMP", title: "A camp for meaningful work.", render: renderCampPanel };
  }
}

function renderCampPanel(snapshot) {
  const { world, quests, progressions } = snapshot;
  const progression = progressions[0];
  const milestones = world.milestones ?? [];
  return `
    <p class="panel-lede">Every expedition returns with a little more signal. The camp keeps the trace, while the work stays yours.</p>
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">Camp memory</h3><span class="status-badge">LOCAL</span></div>
      <div class="detail-line"><span>Quests in the chronicle</span><strong>${quests.length}</strong></div>
      <div class="detail-line"><span>Skill XP recorded</span><strong>${formatNumber(world.progression_totals.skill_xp)}</strong></div>
      <div class="detail-line"><span>Real artifacts</span><strong>${world.progression_totals.artifact_count}</strong></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">First traces</h3><span class="muted-badge">${milestones.length}/3</span></div>
      ${milestones.length === 0 ? emptyMarkup("No milestones yet. The next meaningful return will leave one.") : milestones.map(milestoneMarkup).join("")}
    </div>
    ${progression === undefined ? "" : `<div class="panel-action-row"><button class="secondary-button" data-panel="guild" type="button">Open Quest Guild <span aria-hidden="true">→</span></button></div>`}
  `;
}

function renderDomainPanel(snapshot) {
  const domain = ui.selectedDomain;
  const value = snapshot.world.progression_totals.domain_progress[domain] ?? 0;
  const quests = snapshot.quests.filter(quest => (quest.activity_mix[domain] ?? 0) > 0);
  return `<p class="panel-lede">Permanent growth from meaningful work. This is domain progress, not an equipment bonus or a skill prerequisite.</p><div class="detail-card"><div class="progress-label"><span>${escapeHtml(domain)}</span><strong>${value}/100</strong></div>${meter(value)}</div><div class="quest-list">${quests.length ? quests.map(questItemMarkup).join("") : emptyMarkup("No related work has been observed yet.")}</div>`;
}

function renderGatePanel(snapshot) {
  const { world, quests } = snapshot;
  return `
    <p class="panel-lede">The Gate is the quiet boundary between your local tools and this small world. It observes; it never reaches back.</p>
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">${labelize(world.gate.state)}</h3><span class="confidence-badge verified">READ ONLY</span></div>
      <div class="detail-line"><span>Active expeditions</span><strong>${world.active_run_ids.length}</strong></div>
      <div class="detail-line"><span>Connections observed</span><strong>${world.gate.connection_count}</strong></div>
      <div class="detail-line"><span>Recent return</span><strong>${formatTime(world.last_return_at)}</strong></div>
    </div>
    <div class="detail-card">
      <div class="progress-label"><span>Gate activity</span><strong>${world.activity.gate.level}%</strong></div>
      ${meter(world.activity.gate.level)}
      <p class="artifact-meta">Temporary activity fades with time. The connection memory does not.</p>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Recent returns</h3><span class="muted-badge">${quests.length}</span></div>
      ${quests.length === 0 ? emptyMarkup("No expeditions have returned yet.") : quests.map(questSummaryMarkup).join("")}
    </div>
  `;
}

function renderGuildPanel(snapshot) {
  const { world, quests } = snapshot;
  return `
    <p class="panel-lede">The Guild turns runtime work into a readable chronicle. One real goal can gather many child runs without splitting into fake rewards.</p>
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">${labelize(world.guild.state)}</h3><span class="status-badge">${world.guild.qualifying_quest_count} QUALIFYING</span></div>
      <div class="detail-line"><span>Recorded quests</span><strong>${quests.length}</strong></div>
      <div class="detail-line"><span>Milestones</span><strong>${world.milestones.length}</strong></div>
    </div>
    <div class="quest-list">
      ${quests.length === 0 ? emptyMarkup("The board is quiet. Start a meaningful expedition to write the first entry.") : quests.map(questItemMarkup).join("")}
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
    <p class="panel-lede">${buildingName === "workshop" ? "A place for making, testing, and repairing what the work revealed." : "A place for questions, maps, and the evidence that made the next step clearer."}</p>
    <div class="insight-card building-head">
      <span class="building-mini-icon ${buildingName}" aria-hidden="true">${buildingName === "workshop" ? "✣" : "⌘"}</span>
      <div><h3 class="evidence-title">${labelize(building.state)}</h3><p class="artifact-meta">${building.unlocked_at === null ? "Unlocks when credible work reaches this domain." : `Unlocked ${formatTime(building.unlocked_at)}`}</p></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Domain progress</h3><span class="muted-badge">PERMANENT</span></div>
      ${domainEntries.map(([domain, value]) => `<div class="progress-label"><span>${domain}</span><strong>${value}%</strong></div>${meter(value)}`).join("")}
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Live activity</h3><span class="status-badge">${world.activity[buildingName].level}%</span></div>
      ${meter(world.activity[buildingName].level)}
      <p class="artifact-meta">Activity is temporary. Domain progress is permanent.</p>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Recent artifacts</h3><span class="muted-badge">${artifacts.length}</span></div>
      ${artifacts.length === 0 ? emptyMarkup("No matching artifact has returned yet.") : artifacts.map(artifactItemMarkup).join("")}
    </div>
  `;
}

function renderQuestPanel(snapshot) {
  const quest = snapshot.quests.find((candidate) => candidate.quest_id === ui.selectedQuestId) ?? currentQuest(snapshot.quests);
  if (quest === undefined) {
    return emptyMarkup("No Quest is available yet.");
  }
  const progression = snapshot.progressions.find((candidate) => candidate.quest_id === quest.quest_id);
  return `
    <p class="panel-lede">A Quest gathers the runs working toward one real goal. Evidence stays factual; the world remembers the result.</p>
    <div class="insight-card">
      <div class="evidence-head"><h3 class="evidence-title">${escapeHtml(quest.title)}</h3>${confidenceBadge(quest.outcome_confidence)}</div>
      <div class="detail-line"><span>Lifecycle</span><strong>${labelize(quest.status)}</strong></div>
      <div class="detail-line"><span>Current phase</span><strong>${labelize(quest.phase)}</strong></div>
      <div class="detail-line"><span>Estimated difficulty</span><strong>${quest.difficulty?.estimated == null ? "Unknown" : `${quest.difficulty.estimated}/5`}</strong></div>
      <div class="detail-line"><span>Observed difficulty</span><strong>${quest.difficulty?.observed == null ? "Unknown" : `${quest.difficulty.observed}/5`}</strong></div>
      <div class="detail-line"><span>Runs gathered</span><strong>${quest.run_ids.length}</strong></div>
      <div class="detail-line"><span>Agents observed</span><strong>${quest.agent_ids.length}</strong></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Activity Mix</h3><span class="muted-badge">${quest.primary_domain ?? "—"}</span></div>
      ${Object.entries(quest.activity_mix).filter(([, value]) => value > 0).map(([domain, value]) => mixRow(domain, value)).join("") || emptyMarkup("No meaningful activity has been interpreted yet.")}
    </div>
    <div class="evidence-card">
      <div class="evidence-head"><h3 class="evidence-title">Validation</h3>${quest.validation_summary.attempted ? `<span class="status-badge">${quest.validation_summary.success_count} PASS</span>` : `<span class="muted-badge">PENDING</span>`}</div>
      ${validationMarkup(quest.validation_summary)}
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Growth trace</h3><span class="status-badge">${progression?.skill_xp ?? 0} XP</span></div>
      <div class="detail-line"><span>Domain progress</span><strong>${progression === undefined ? "Pending" : formatDomainTotal(progression.domain_progress)}</strong></div>
      <div class="detail-line"><span>Real artifacts</span><strong>${progression?.loot_refs.length ?? 0}</strong></div>
    </div>
    ${allArtifacts(snapshot.progressions, [quest]).filter(artifact => artifact.source_quest_id === quest.quest_id).map(artifactItemMarkup).join("")}
  `;
}

function renderArtifactPanel(snapshot) {
  const artifacts = allArtifacts(snapshot.progressions, snapshot.quests);
  const artifact = artifacts.find((candidate) => artifactKey(candidate) === ui.selectedArtifactId) ?? artifacts[0];
  if (artifact === undefined) {
    return emptyMarkup("No real artifact has been recorded yet.");
  }
  return `
    <p class="panel-lede">This item exists because the run exposed a durable reference. The visual is generic; the identity is real.</p>
    <div class="artifact-card">
      <div class="artifact-icon" aria-hidden="true">✦</div>
      <div><h3 class="artifact-name">${escapeHtml(artifact.name ?? artifact.artifact_id)}</h3><p class="artifact-meta">${labelize(artifact.kind)} artifact · ${escapeHtml(artifact.source_quest_id)}</p></div>
    </div>
    <div class="detail-card">
      <div class="detail-line"><span>Reference</span><strong>${escapeHtml(artifact.uri_or_path ?? "Evidence reference")}</strong></div>
      <div class="detail-line"><span>Source Quest</span><strong>${escapeHtml(artifact.source_quest_id)}</strong></div>
      <div class="detail-line"><span>Settlement</span><strong>${artifact.rewarded ? "Included in settled loot" : "Observed reference · no extra reward"}</strong></div>
      <div class="detail-line"><span>Evidence refs</span><strong>${artifact.evidence_refs?.length ?? 0}</strong></div>
    </div>
    ${snapshot.capabilities?.artifact_view ? `<div class="panel-action-row"><button class="primary-button" type="button" data-open-artifact="${escapeAttribute(artifactKey(artifact))}">View original file</button></div><p class="artifact-meta">Current local file, not an archived copy. Missing or protected files remain unavailable.</p>${artifactPreviewMarkup(artifact)}` : `<p class="artifact-meta">Original file viewing is off. Enable AI_QUEST_WORLD_ARTIFACT_ROOT for this project to view permitted files.</p>`}
  `;
}

function artifactUrl(artifact) {
  return `/api/artifact?quest=${encodeURIComponent(artifact.source_quest_id)}&artifact=${encodeURIComponent(artifact.artifact_id)}`;
}

async function openArtifact(key) {
  const artifact = allArtifacts(ui.snapshot?.progressions ?? [], ui.snapshot?.quests ?? []).find(value => artifactKey(value) === key);
  if (!artifact || !ui.snapshot.capabilities?.artifact_view || ui.source !== "live") return;
  const preview = { key, status: "Loading original file…" };
  ui.artifactPreview = preview;
  selectPanel("artifact", { keepMobileOpen: false });
  try {
    const response = await fetch(artifactUrl(artifact), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("unavailable");
    if (response.headers.get("content-type")?.startsWith("text/plain")) {
      preview.text = await response.text(); preview.status = "Original content";
    } else { preview.binary = true; preview.status = "Binary file — download to view"; }
  } catch { preview.status = "Original file unavailable. It may be missing, protected or larger than 1 MiB."; }
  if (ui.artifactPreview === preview && ui.selectedPanel === "artifact") selectPanel("artifact", { keepMobileOpen: false });
}

function artifactPreviewMarkup(artifact) {
  const preview = ui.artifactPreview;
  if (preview?.key !== artifactKey(artifact)) return "";
  return `<div class="detail-card" aria-live="polite"><h3 class="evidence-title">${escapeHtml(preview.status)}</h3>${preview.text === undefined ? "" : `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:24rem;overflow:auto">${escapeHtml(preview.text)}</pre>`}${preview.binary ? `<a class="secondary-button" download href="${escapeAttribute(artifactUrl(artifact))}">Download original file</a>` : ""}</div>`;
}

function renderChroniclePanel(snapshot) {
  const { world, quests } = snapshot;
  const entries = [
    ...world.milestones.map((milestone) => `<div class="detail-line"><span>${formatTime(milestone.unlocked_at)}</span><strong>${labelize(milestone.milestone_id)}</strong></div>`),
    ...quests.map((quest) => `<button class="quest-item" data-quest-id="${escapeAttribute(quest.quest_id)}" type="button"><span class="quest-item-title">${escapeHtml(quest.title)}</span><span class="quest-item-meta">${labelize(quest.status)} · ${labelize(quest.outcome_confidence ?? "pending")}</span></button>`)
  ];
  return `
    <p class="panel-lede">The Chronicle is a small memory of meaningful turns, not a transcript. Technical detail stays behind the Quest lens.</p>
    <div class="detail-card">${entries.length === 0 ? emptyMarkup("The chronicle is waiting for its first meaningful return.") : entries.join("")}</div>
  `;
}

function renderSettingsPanel() {
  const sourceLabel = ui.source === "live" ? "LOCAL WORLD" : "DEMO FIXTURE";
  return `
    <p class="panel-lede">The world is local-first and read-only. Change the visual lens without changing the underlying state.</p>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">World lens</h3><span class="muted-badge">THEME</span></div>
      <div class="panel-action-row"><button class="secondary-button" id="settings-theme" type="button">Switch theme <span aria-hidden="true">◐</span></button></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Return motion</h3><span class="muted-badge">ACCESS</span></div>
      <p class="artifact-meta">Reduced motion keeps every state readable without relying on particles or animation.</p>
      <div class="panel-action-row"><button class="secondary-button" id="settings-motion" type="button">Toggle reduced motion</button></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">World source</h3><span class="muted-badge">${sourceLabel}</span></div>
      <p class="artifact-meta">The local world reads SQLite-backed projections. The fixture lens is only for deterministic presentation checks.</p>
      <div class="panel-action-row"><button class="secondary-button" data-source="live" type="button">Local world</button><button class="secondary-button" data-source="demo" type="button">Demo fixture</button></div>
    </div>
    <div class="detail-card">
      <div class="evidence-head"><h3 class="evidence-title">Fixture outcome</h3><span class="muted-badge">DEMO</span></div>
      <p class="artifact-meta">When the fixture lens is active, view a completed evidence-rich return or an unverified return.</p>
      <div class="panel-action-row"><button class="secondary-button" data-demo-mode="canonical" type="button">Verified return</button><button class="secondary-button" data-demo-mode="unverified" type="button">Unverified return</button></div>
    </div>
  `;
}

function renderError() {
  refs.panelEyebrow.textContent = "WORLD LENS / OFFLINE";
  refs.panelTitle.textContent = "The camp is out of range.";
  refs.panelContent.innerHTML = `
    <div class="error-card"><strong>Signal interrupted</strong>World data could not be loaded. The renderer has not invented a fallback state.</div>
    <div class="panel-action-row"><button class="primary-button" id="retry-world" type="button">Retry signal <span aria-hidden="true">↻</span></button></div>
  `;
  refs.panelContent.querySelector("#retry-world")?.addEventListener("click", () => loadSnapshot(ui.mode));
  refs.contextShell.classList.add("is-open");
  syncPanelAccess();
}

function showLoading() {
  refs.panelEyebrow.textContent = "WORLD LENS / SYNCING";
  refs.panelTitle.textContent = "Loading world...";
  refs.panelContent.innerHTML = loadingMarkup();
}

function loadingMarkup() {
  return `<div class="loading-stack" aria-label="Loading"><span></span><span></span><span></span></div>`;
}

function showReturnOverlay(entry) {
  clearTimeout(ui.returnTimer);
  if (refs.returnOverlay.classList.contains("is-hidden")) ui.returnFocus = document.activeElement;
  const highlights = entry.highlights ?? [];
  refs.returnTitle.textContent = highlights.some((item) => item.kind === "milestone_unlocked")
    ? "The world changed."
    : "The world remembers.";
  refs.returnSubtitle.textContent = `${entry.title ?? "A meaningful run"} returned to camp.`;
  refs.returnHighlights.innerHTML = highlights.map((item) => `<div class="return-highlight"><span>${escapeHtml(item.label)}</span></div>`).join("");
  refs.returnOverlay.classList.remove("is-hidden");
  window.setTimeout(() => refs.enterWorld.focus(), 0);
  ui.returnTimer = window.setTimeout(hideReturnOverlay, 4500);
}

function hideReturnOverlay() {
  clearTimeout(ui.returnTimer);
  ui.activeReturn = null;
  refs.returnOverlay.classList.add("is-hidden");
  if (ui.returnFocus?.isConnected) ui.returnFocus.focus({ preventScroll: true });
  else refs.reloadButton.focus({ preventScroll: true });
  showNextReturn();
}

function showNextReturn() {
  if (ui.source !== "live" || document.hidden || ui.activeReturn !== null) return;
  const next = ui.pendingReturns.shift();
  if (!next) return;
  ui.activeReturn = next;
  ui.seenReturns.add(next.return_id);
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
  showToast(`${labelize(next)} lens active.`);
}

function toggleMotion() {
  const reduced = refs.body.classList.toggle("reduce-motion");
  const button = document.querySelector("#motion-toggle");
  button?.setAttribute("aria-pressed", String(reduced));
  localStorage.setItem("ai-quest-world-reduced-motion", String(reduced));
  showToast(reduced ? "Reduced motion active." : "Full return motion active.");
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
    return quest?.status === "COMPLETED" ? "Quest returned with a trace" : "A signal returned to camp";
  }
  if (world.gate.state === "ACTIVE") {
    return `${world.active_run_ids.length} expedition${world.active_run_ids.length === 1 ? "" : "s"} in motion`;
  }
  return "The camp is ready for a new signal";
}

function questItemMarkup(quest) {
  return `<button class="quest-item" data-quest-id="${escapeAttribute(quest.quest_id)}" type="button"><span class="quest-item-head"><span class="quest-item-title">${escapeHtml(quest.title)}</span>${confidenceBadge(quest.outcome_confidence)}</span><span class="quest-item-meta"><span>${labelize(quest.status)}</span><span>${labelize(quest.phase)}</span><span>${quest.artifact_refs.length} artifact${quest.artifact_refs.length === 1 ? "" : "s"}</span></span></button>`;
}

function questSummaryMarkup(quest) {
  return `<button class="quest-item" data-quest-id="${escapeAttribute(quest.quest_id)}" type="button"><span class="quest-item-title">${escapeHtml(quest.title)}</span><span class="quest-item-meta">${labelize(quest.status)} · ${labelize(quest.phase)}</span></button>`;
}

function artifactItemMarkup(artifact) {
  const id = artifactKey(artifact);
  return `<button class="artifact-card" data-artifact-id="${escapeAttribute(id)}" type="button"><span class="artifact-icon" aria-hidden="true">✦</span><span><span class="artifact-name">${escapeHtml(artifact.name ?? artifact.artifact_id)}</span><span class="artifact-meta">${labelize(artifact.kind)} · real reference</span></span></button>`;
}

function milestoneMarkup(milestone) {
  return `<div class="detail-line"><span>${labelize(milestone.milestone_id)}</span><strong>${formatTime(milestone.unlocked_at)}</strong></div>`;
}

function validationMarkup(summary) {
  if (!summary.attempted) {
    return `<p class="artifact-meta">No validation signal was observed.</p>`;
  }
  const latest = summary.latest_passed === null ? "Evidence recorded" : `${summary.latest_passed}/${summary.latest_total ?? "?"} passed`;
  return `<div class="detail-line"><span>Latest result</span><strong>${latest}</strong></div><div class="detail-line"><span>Attempts</span><strong>${summary.success_count + summary.failure_count}</strong></div>`;
}

function mixRow(domain, value) {
  return `<div class="mix-row"><span>${domain}</span><span class="mix-meter"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span><strong>${value}%</strong></div>`;
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
  return `${Object.values(scores).reduce((sum, value) => sum + value, 0)} pts`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function labelize(value) {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value).toLowerCase().split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
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
  ui.source = source === "demo" ? "demo" : "live";
  clearTimeout(ui.returnTimer);
  ui.activeReturn = null;
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
