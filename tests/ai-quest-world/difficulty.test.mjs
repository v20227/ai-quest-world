import test from "node:test";
import assert from "node:assert/strict";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { validateQuest } from "../../core/game/quest-types.mjs";
import { createDifficultyBasis, estimateDifficulty, updateDifficultyBasis } from "../../core/game/difficulty-policy.mjs";
import { analyzeRuntimeEvents, SemanticEngine } from "../../core/semantic/semantic-engine.mjs";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";

function event(index, type, attributes = {}, extra = {}) {
  return {
    uarp_version: "0.1", event_id: `difficulty-${index}`,
    timestamp: new Date(Date.UTC(2026, 8, 8) + index * 1000).toISOString(),
    source: { adapter_id: "neutral-runtime", adapter_version: "1" },
    context: { run_id: "root" }, privacy: { content_included: false, redaction_level: "standard" },
    type, attributes, ...extra
  };
}
const start = () => event(0, "run.started");
const change = (index, extension = "mjs", extra = {}) => event(index, "resource.changed", {
  resource_kind: "file", change_type: "modified", extension
}, extra);
const validation = (index, status) => event(index, "validation.completed", { kind: "test" }, { status });
function project(events) {
  return new QuestEngine().process(events, analyzeRuntimeEvents(events).records)[0];
}

test("initial, lifecycle-only, empty exploration and failure-only evidence stay Unknown", () => {
  for (const events of [
    [start()],
    [start(), event(1, "resource.activity")],
    [start(), event(1, "validation.started", { kind: "test" })],
    [start(), validation(1, "failed")],
    [start(), event(1, "run.completed")]
  ]) assert.deepEqual(project(events).difficulty, { estimated: null, observed: null });
});

test("distinct supported scope and meaningful phase grow the estimate progressively to five", () => {
  const events = [start(), change(1), change(2, "md"), change(3, "png"),
    validation(4, "succeeded"), event(5, "artifact.created", {
      artifact_id: "output", kind: "code", uri_or_path: "artifacts/output.patch", durable: true
    })];
  assert.deepEqual(events.map((_, i) => project(events.slice(0, i + 1)).difficulty.estimated),
    [null, 1, 2, 3, 4, 5]);
  for (let i = 1; i <= events.length; i++) assert.equal(project(events.slice(0, i)).difficulty.observed, null);
  assert.deepEqual(project([...events, event(6, "run.completed")]).difficulty, { estimated: 5, observed: 5 });
});

test("scope uses strong individual semantic support, never accumulated incidental contributions", () => {
  const events = [start(), change(1, "yaml"), ...Array.from({ length: 30 }, (_, i) => change(i + 2, "yaml"))];
  assert.equal(project(events).difficulty.estimated, 1);
  assert.equal(project([...events, change(40)]).difficulty.estimated, 2);
});

test("repeated errors, validation failures and telemetry do not raise difficulty", () => {
  const noise = Array.from({ length: 20 }, (_, i) => [
    validation(2 + i * 3, "failed"),
    event(3 + i * 3, "error.observed", { kind: `error-${i}`, blocking: true }),
    event(4 + i * 3, "usage.reported", { total_tokens: 1000000, tool_calls: 1000000 })
  ]).flat();
  assert.equal(project([start(), change(1), ...noise]).difficulty.estimated, 1);
  assert.equal(project([start(), ...noise]).difficulty.estimated, null);
  const small = event(1, "resource.activity", { resource_kind: "file", scope: "project", read_count: 1 });
  const large = structuredClone(small);
  Object.assign(large.attributes, { read_count: 100000, search_count: 100000, resource_count: 100000 });
  assert.deepEqual(project([start(), small]).difficulty, project([start(), large]).difficulty);
});

test("recovery requires meaningful change and repeated recovery loops remain bounded", () => {
  const first = [start(), change(1), validation(2, "failed"), change(3)];
  const recovered = project(first).difficulty.estimated;
  assert.ok(recovered > project(first.slice(0, 3)).difficulty.estimated);
  const loops = Array.from({ length: 30 }, (_, i) => [validation(4 + i * 2, "failed"), change(5 + i * 2)]).flat();
  assert.equal(project([...first, ...loops]).difficulty.estimated, recovered);
});

test("duplicate events, repeated work and child counts do not multiply difficulty", () => {
  const baseline = [start(), change(1)];
  const children = Array.from({ length: 20 }, (_, i) => {
    const context = { run_id: `child-${i}`, parent_run_id: "root", agent_id: `agent-${i}` };
    return [event(2 + i * 3, "run.started", {}, { context }),
      change(3 + i * 3, "mjs", { context }), event(4 + i * 3, "run.completed", {}, { context })];
  }).flat();
  const quest = project([...baseline, ...children, ...baseline]);
  assert.deepEqual(quest.difficulty, project(baseline).difficulty);
  assert.equal(quest.difficulty.observed, null);
  assert.equal(quest.run_ids.length, 21);
});

test("observed is written only for driver terminal and freezes with bounded settlement", () => {
  for (const type of ["run.completed", "run.failed", "run.cancelled"]) {
    const events = [start(), change(1), event(2, type)];
    const settled = project(events);
    assert.deepEqual(settled.difficulty, { estimated: 1, observed: 1 });
    const after = project([...events, change(3, "png"), validation(4, "succeeded")]);
    assert.deepEqual(after.difficulty, settled.difficulty);
    assert.deepEqual(after.settlement_snapshot, settled.settlement_snapshot);
    assert.equal(after.settlement_snapshot.settlement_snapshot, undefined);
  }
});

test("reopening an unfinished outcome clears observed until the next settlement", () => {
  const failed = [start(), change(1), event(2, "run.failed")];
  const context = { run_id: "retry" };
  const resume = event(3, "run.started", { resumed_from_run_id: "root" }, { context });
  const active = project([...failed, resume]);
  assert.deepEqual(active.difficulty, { estimated: 1, observed: null });
  assert.deepEqual(active.settlement_snapshot.difficulty, { estimated: 1, observed: 1 });
  const terminal = project([...failed, resume, change(4, "png", { context }), event(5, "run.completed", {}, { context })]);
  assert.deepEqual(terminal.difficulty, { estimated: 2, observed: 2 });
  assert.equal(terminal.settlement_snapshot.settlement_snapshot, undefined);
});

test("current semantic snapshots, retraction, incremental processing and replay agree", () => {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const semantic = new SemanticEngine();
  const engine = new QuestEngine();
  for (const item of events) engine.ingest(item, semantic.process([item]));
  assert.deepEqual(engine.getQuests()[0], project(events));
  assert.deepEqual(project(structuredClone(events).reverse()), project(events));
  const original = engine.getQuests();
  assert.equal(engine.ingest(events[0], semantic.getRecords(events[0].context.run_id)), null);
  assert.deepEqual(engine.getQuests(), original);
  const records = analyzeRuntimeEvents(events).records;
  engine.process([], { records: [] });
  assert.deepEqual(engine.getQuests()[0].difficulty, { estimated: null, observed: null });
  engine.process([], { records });
  assert.deepEqual(engine.getQuests(), original);
});

test("difficulty is harness neutral and its accumulator has finite vocabulary", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const renamed = events.map(item => ({ ...structuredClone(item),
    source: { adapter_id: "another-adapter", adapter_version: "99", harness_family: "unrelated" } }));
  assert.deepEqual(project(events).difficulty, project(renamed).difficulty);
  const basis = createDifficultyBasis();
  const records = analyzeRuntimeEvents(events).records;
  for (let i = 0; i < 100; i++) for (const record of records) updateDifficultyBasis(basis, record);
  assert.ok(basis.phases.size <= 5);
  assert.ok(basis.scopes.size <= 6);
  assert.ok(estimateDifficulty(basis) >= 1 && estimateDifficulty(basis) <= 5);
  const before = estimateDifficulty(basis);
  updateDifficultyBasis(basis, { ...records[0], kind: "implementation_activity", phase: "RETURN", impact: 5 });
  assert.equal(estimateDifficulty(basis), before);
});

test("Quest validation preserves legacy projections and validates optional difficulty", () => {
  const quest = project([start()]);
  const legacy = structuredClone(quest);
  delete legacy.difficulty;
  assert.doesNotThrow(() => validateQuest(legacy));
  for (const value of [undefined, 0, 6, 1.5, NaN, Infinity, "3"]) {
    assert.throws(() => validateQuest({ ...quest, difficulty: { estimated: value, observed: null } }));
    assert.throws(() => validateQuest({ ...quest, difficulty: { estimated: null, observed: value } }));
  }
  assert.throws(() => validateQuest({ ...quest, difficulty: { estimated: 1, observed: 1 } }));
  assert.doesNotThrow(() => validateQuest(project([start(), change(1), event(2, "run.completed")])));
});
