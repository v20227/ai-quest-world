import { currentQuest, recentQuests, allArtifacts } from "./view-state.mjs";

const label = value => String(value ?? "Unknown").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());

export function guildSceneModel(snapshot) {
  const quest = currentQuest(snapshot.quests);
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

export function renderGuildScene(snapshot, root = document) {
  const model = guildSceneModel(snapshot);
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
