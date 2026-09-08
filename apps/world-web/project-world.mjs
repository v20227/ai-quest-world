import { orderRuntimeEvents, RunLineage } from "../../packages/uarp/run-lineage.mjs";
import { supportedCodexEvidence } from "../../adapters/codex-cli/legacy-evidence.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { WorldStateEngine } from "../../core/world/world-state-engine.mjs";

export const PROJECTION_POLICY_VERSION = "trusted-loop-1";

export function projectWorld(rawEvents) {
  const supported = rawEvents.map(supportedCodexEvidence).filter(Boolean);
  const lineage = new RunLineage(supported);
  const events = orderRuntimeEvents(supported).filter(event => lineage.rootFor(event.context.run_id) !== null);
  const semantics = analyzeRuntimeEvents(events);
  const engine = new QuestEngine();
  const quests = engine.process(events, semantics.records);
  const progressions = quests.map(quest => calculateProgression(quest, semantics.records.filter(record => record.root_run_id === quest.root_run_id)));
  const settlementEvents = new Map(progressions.filter(value => value.resolution === "RESOLVED")
    .map(value => [value.quest_snapshot.event_ids.at(-1), value]));
  const world = new WorldStateEngine();
  const appliedInputs = [];
  for (const event of events) {
    world.ingest(event);
    appliedInputs.push({ input_id: `event:${event.event_id}`, input_kind: "runtime_event" });
    const settlement = settlementEvents.get(event.event_id);
    if (settlement) {
      world.applyProgression(settlement);
      appliedInputs.push({ input_id: `progression:${settlement.quest_id}`, input_kind: "quest_progression" });
    }
  }
  return { world: world.getState(), quests, progressions, appliedInputs,
    policyVersion: PROJECTION_POLICY_VERSION, eventCount: rawEvents.length };
}
