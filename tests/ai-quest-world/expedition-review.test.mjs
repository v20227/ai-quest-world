import test from "node:test";
import assert from "node:assert/strict";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { projectWorld } from "../../apps/world-web/project-world.mjs";

test("missing validation target is distinct from the literal unknown target", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  delete events[3].attributes.target;
  events[5].attributes.target = "unknown";
  const snapshot = projectWorld(events);
  assert.notEqual(snapshot.quests[0].outcome_confidence, "VERIFIED");
  assert.equal(snapshot.quests[0].expedition.unresolved_count, 1);
  const repeated = projectWorld([...events, ...events].reverse());
  assert.equal(repeated.eventCount, events.length * 2);
  assert.deepEqual({ ...repeated, eventCount: snapshot.eventCount }, snapshot);
});

test("superseded driver terminal cannot become the active Quest return", () => {
  for (const type of ["run.completed", "run.failed", "run.cancelled"]) {
    const source = createSimulatedRunSequence({ includeChildRun: false });
    const root = source[0];
    const resume = structuredClone(root);
    resume.event_id = "resume-start";
    resume.context.run_id = "resume";
    resume.attributes.resumed_from_run_id = root.context.run_id;
    resume.timestamp = new Date(Date.parse(root.timestamp) + 1000).toISOString();
    const terminal = structuredClone(source.at(-1));
    terminal.type = type; terminal.status = type.split(".")[1];
    const snapshot = projectWorld([root, resume, terminal]);
    assert.equal(snapshot.quests[0].status, "ACTIVE");
    assert.equal(snapshot.quests[0].expedition.observed_phases.includes("RETURN"), false);
    assert.equal(snapshot.progressions[0].skill_xp, 0);
  }
});
