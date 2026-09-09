import { describeProgression } from "../../core/game/progression-policy.mjs";
import { describeWorldGoals } from "../../core/world/world-state-engine.mjs";

export function withGameplay(snapshot) {
  return {
    ...snapshot,
    gameplay: {
      version: "0.1",
      settlements: snapshot.progressions.map(describeProgression),
      goals: describeWorldGoals(snapshot.world)
    }
  };
}
