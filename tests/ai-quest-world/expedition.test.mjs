import test from "node:test";
import assert from "node:assert/strict";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";

function project(events) {
  const semantics = analyzeRuntimeEvents(events).records;
  const quest = new QuestEngine().process(events, semantics)[0];
  return quest.expedition;
}

test("expedition shows observed failure/recovery and matching successful evidence", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const journey = project(events);
  assert.deepEqual(journey.steps.map(step => step.phase), ["DEPART", "EXPLORE", "ACT", "VALIDATE", "RECOVER", "VALIDATE", "DELIVER", "RETURN"]);
  assert.equal(journey.encounters.length, 1);
  assert.equal(journey.encounters[0].state, "RESOLVED");
  assert.equal(journey.encounters[0].measurement.passed, 16);
  assert.equal(journey.unresolved_count, 0);
  assert.deepEqual(project([...events, ...events].reverse()), journey);
});

test("edits are recovery rather than victory and another target cannot resolve a failure", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const failedIndex = events.findIndex(event => event.type === "validation.completed");
  assert.equal(project(events.slice(0, failedIndex + 1)).encounters[0].state, "OPEN");
  assert.equal(project(events.slice(0, failedIndex + 2)).encounters[0].state, "RECOVERING");
  events.filter(event => event.type === "validation.completed")[1].attributes.target = "OtherTests";
  assert.equal(project(events).unresolved_count, 1);
});

test("unknown validation cannot resolve or create fictitious progress", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const last = events.filter(event => event.type === "validation.completed")[1];
  last.status = "unknown";
  delete last.attributes.passed; delete last.attributes.failed; delete last.attributes.total;
  const journey = project(events);
  assert.equal(journey.encounters[0].state, "VERIFYING");
  assert.equal(journey.encounters[0].measurement.total, null);
  assert.equal(journey.unresolved_count, 1);
});

test("a later change invalidates resolved encounter evidence", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const changed = structuredClone(events.find(event => event.type === "resource.changed"));
  changed.event_id = "late-change"; changed.timestamp = "2026-09-08T11:00:00.000Z";
  const journey = project([...events, changed]);
  assert.equal(journey.encounters[0].state, "RECHECK_REQUIRED");
  assert.equal(journey.encounters[0].resolved_at, null);
});

test("only explicit identified blocker resolution closes the corresponding blocker", () => {
  const start = createSimulatedRunSequence({ includeChildRun: false })[0];
  const error = { ...structuredClone(start), type: "error.observed", event_id: "blocker", timestamp: "2026-09-08T10:00:01.000Z", status: "failed", attributes: { error_id: "dependency", kind: "dependency", blocking: true } };
  const other = { ...structuredClone(error), type: "error.resolved", event_id: "other", timestamp: "2026-09-08T10:00:02.000Z", status: "succeeded", attributes: { error_id: "different" } };
  assert.equal(project([start, error, other]).unresolved_count, 1);
  other.attributes.error_id = "dependency";
  assert.equal(project([start, error, other]).unresolved_count, 0);
  error.attributes.blocking = false;
  assert.equal(project([start, error]).encounters.length, 0);
});
