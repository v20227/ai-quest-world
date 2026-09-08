import { WorldStateEngine } from "./world-state-engine.mjs";
import { validateWorldState } from "./world-state-types.mjs";

export function worldAtTime(state, timestamp, quests = []) {
  const engine = new WorldStateEngine({ initialState: structuredClone(state) });
  engine.advanceTo(timestamp);
  const world = engine.getState();
  if (world.active_run_ids.length > 0) {
    world.gate.state = "ACTIVE";
    world.activity.gate.level = 100;
  } else if (world.gate.state === "RETURNING" && Date.parse(timestamp) - Date.parse(world.last_return_at) >= 5000) {
    world.gate.state = "CONNECTED";
  }
  const active = quests.filter(quest => !["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status));
  for (const [name, domains] of [["workshop", ["Engineering", "Debugging", "Automation"]], ["library", ["Research", "Planning"]]]) {
    if (world[name].state === "LOCKED") continue;
    const working = active.some(quest => domains.some(domain => quest.domain_scores[domain] > 0));
    if (working) world.activity[name].level = 100;
    world[name].state = world.activity[name].level >= 70 ? "BUSY" : world.activity[name].level >= 10 ? "ACTIVE" : "IDLE";
  }
  if (world.guild.state !== "OLD") world.guild.state = active.length > 0 ? "ACTIVE" : "RESTORED";
  return validateWorldState(world);
}
