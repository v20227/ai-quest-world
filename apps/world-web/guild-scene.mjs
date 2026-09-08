import { currentQuest, recentQuests, allArtifacts } from "./view-state.mjs";

const label = value => String(value ?? "Unknown").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());

export function guildSceneModel(snapshot, selectedQuestId = null) {
  const quest = snapshot.quests.find(entry => entry.quest_id === selectedQuestId) ?? currentQuest(snapshot.quests);
  if (!quest) return {
    questId: null, title: "Your next chapter starts here.", domain: "SMALL CAMP / HOME BASE",
    description: "Use your connected AI tool for meaningful work. Its next observed expedition will appear here.",
    kind: "THE NEXT CHAPTER / 下一章", facts: [], phases: [], entries: [], active: false
  };
  const settled = snapshot.progressions.find(entry => entry.quest_id === quest.quest_id);
  const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status);
  const confidence = quest.outcome_confidence ? label(quest.outcome_confidence) : "Pending evidence";
  return {
    questId: quest.quest_id, title: quest.title, domain: `${label(quest.primary_domain)} / ${label(quest.phase)}`,
    description: terminal ? `${label(quest.status)} · ${confidence}. The record of your real work is kept in the guild.` : "An expedition is in progress. This board follows the work observed by your local harness.",
    kind: terminal ? "LATEST RETURN / 最近归来" : "CURRENT EXPEDITION / 当前远征",
    facts: [
      ["Outcome", confidence],
      ["Recorded growth", settled ? `${settled.skill_xp} XP` : "Not settled"],
      ["Real artifacts", String(allArtifacts(snapshot.progressions, snapshot.quests).filter(item => item.source_quest_id === quest.quest_id).length)]
    ],
    phases: [`Phase · ${label(quest.phase)}`, `Difficulty · ${quest.difficulty?.observed ?? quest.difficulty?.estimated ?? "Unknown"}${quest.difficulty?.observed != null || quest.difficulty?.estimated != null ? "/5" : ""}`],
    entries: recentQuests(snapshot.quests).slice(0, 3).map(entry => ({ id: entry.quest_id, title: entry.title, detail: `${label(entry.status)} · ${entry.run_ids.length} run${entry.run_ids.length === 1 ? "" : "s"}` })),
    active: snapshot.world.active_run_ids.length > 0
  };
}

export function renderGuildScene(snapshot, root = document, selectedQuestId = null) {
  const model = guildSceneModel(snapshot, selectedQuestId);
  renderDesktopPanels(snapshot, model.questId, root);
  for (const [id, value] of Object.entries({ "board-title": model.title, "board-domain": model.domain, "board-description": model.description, "board-kind": model.kind, "archivist-state": model.active ? "EXPEDITION IN PROGRESS" : "THE ARCHIVIST" })) root.getElementById(id).textContent = value;
  const facts = root.getElementById("board-facts");
  const signature = JSON.stringify(model);
  if (facts.dataset.signature === signature) return;
  facts.dataset.signature = signature;
  facts.replaceChildren(...model.facts.map(([name, value]) => {
    const item = root.createElement("span"); item.append(name);
    const strong = root.createElement("strong"); strong.textContent = value; item.append(strong); return item;
  }));
  root.getElementById("board-phases").replaceChildren(...model.phases.map(value => {
    const stamp = root.createElement("span"); stamp.className = "phase-stamp"; stamp.textContent = value; return stamp;
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
  if (entries.length === 0) { const message = root.createElement("p"); message.className = "muted"; message.textContent = "A quiet guild. No expeditions have been observed yet."; entries.push(message); }
  const list = root.getElementById("expedition-list");
  const focusedId = list.contains(root.activeElement) ? root.activeElement.dataset.questId : null;
  list.replaceChildren(...entries);
  if (focusedId) entries.find(entry => entry.dataset.questId === focusedId)?.focus({ preventScroll: true });
  root.getElementById("world-scene").classList.toggle("has-expedition", model.active);
}

export const GUILD_DOMAINS = ["Research", "Planning", "Engineering", "Debugging", "Creation", "Automation"];

export function desktopGuildModel(snapshot, selectedQuestId = null) {
  const active = new Set(snapshot.world.active_run_ids ?? []);
  const quests = recentQuests(snapshot.quests);
  const selected = quests.find(quest => quest.quest_id === selectedQuestId) ?? currentQuest(quests);
  return {
    selectedId: selected?.quest_id ?? null,
    quests: quests.map(quest => ({ id: quest.quest_id, title: quest.title })),
    runs: quests.flatMap(quest => quest.run_ids.map(id => ({
      id, questId: quest.quest_id, title: quest.title,
      relationship: id === quest.root_run_id ? "Root run" : "Associated run · parent unavailable",
      status: active.has(id) ? "Active" : "Not active · outcome in Quest"
    }))),
    agents: selected?.agent_ids ?? [],
    domains: GUILD_DOMAINS.map(name => ({ name, value: snapshot.world.progression_totals?.domain_progress?.[name] ?? 0 })),
    artifacts: allArtifacts(snapshot.progressions, snapshot.quests),
    totals: { xp: snapshot.world.progression_totals?.skill_xp ?? 0, active: active.size, quests: quests.length },
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
    const portrait = element("img", "roster-portrait"); portrait.src = "/assets/pixel/guild/archivist.png"; portrait.alt = "";
    const copy = element("span", "roster-copy"); copy.append(element("strong", "", run.title),element("small", "run-id", run.id),element("small", "", run.relationship),element("small", "run-state", run.status));
    button.append(portrait, copy); return button;
  });
  host.replaceChildren(...(rows.length ? rows : [element("p", "muted", "No runs observed. Your next expedition will appear here.")]));
  host.scrollTop = scroll;
  if (focusedRun) rows.find(row => row.dataset.selectRun === focusedRun)?.focus({ preventScroll: true });
  root.getElementById("roster-count").textContent = `${model.runs.length} RUNS`;
  root.getElementById("agent-identities").textContent = model.agents.length ? `Observed agents · ${model.agents.join(" · ")}` : "No Agent identities available for this Quest.";
  const picker = root.getElementById("quest-picker");
  picker.replaceChildren(...model.quests.map(quest => { const option = element("option", "", quest.title); option.value = quest.id; return option; }));
  picker.disabled = model.quests.length === 0; picker.value = model.selectedId ?? "";
  for (const [id, value] of Object.entries({ "total-growth": model.totals.xp, "active-expeditions": model.totals.active, "total-quests": model.totals.quests })) root.getElementById(id).textContent = String(value);
  const domains = root.getElementById("domain-grid");
  model.domains.forEach((domain, index) => {
    let button = [...domains.children].find(node => node.dataset.domain === domain.name);
    if (!button) {
      button = element("button", "domain-node"); button.type = "button"; button.dataset.domain = domain.name;
      button.append(element("span", "domain-sigil", ["▤", "◇", "⌘", "⚒", "✦", "⚙"][index]), element("strong", "", domain.name), element("small", "")); domains.append(button);
    }
    button.querySelector("small").textContent = `${domain.value} / 100`;
  });
  const artifacts = root.getElementById("desktop-artifacts");
  const retained = new Set();
  model.artifacts.slice(0, 3).forEach((artifact, index) => {
    const id = JSON.stringify([artifact.source_quest_id, artifact.artifact_id]);
    let button = [...artifacts.children].find(node => node.dataset.artifactId === id);
    if (!button) { button = element("button", "artifact-slot"); button.type = "button"; button.dataset.artifactId = id; button.append(element("span", "artifact-symbol", "▣"),element("strong", ""),element("small", "")); }
    button.querySelector("strong").textContent = artifact.name;
    button.querySelector("small").textContent = label(artifact.kind);
    retained.add(button);
    if (artifacts.children[index] !== button) artifacts.insertBefore(button, artifacts.children[index] ?? null);
  });
  [...artifacts.children].filter(node => !retained.has(node)).forEach(node => node.remove());
  if (!retained.size) artifacts.append(element("p", "muted", "No real artifacts recorded."));
  if (focused?.isConnected && focused !== root.activeElement && retained.has(focused)) focused.focus({ preventScroll: true });
  const validation = model.validation;
  root.getElementById("board-validation").textContent = !validation?.attempted ? "Validation · No validation signal observed" : validation.latest_passed == null ? "Validation · Evidence recorded; no measured total" : `Validation · ${validation.latest_passed}/${validation.latest_total ?? "?"} passed`;
}
