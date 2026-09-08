import test from "node:test";
import assert from "node:assert/strict";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import {
  analyzeRuntimeEvents,
  SemanticEngine
} from "../../core/semantic/semantic-engine.mjs";
import {
  SEMANTIC_DOMAINS,
  SEMANTIC_PHASES,
  validateSemanticRecord
} from "../../core/semantic/semantic-types.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("canonical simulated run produces the expected semantic phase timeline", () => {
  const result = analyzeRuntimeEvents(createSimulatedRunSequence({ includeChildRun: true }));
  const snapshot = result.snapshots[0];

  assert.deepEqual(
    result.records.map((record) => record.phase),
    ["DEPART", "EXPLORE", "ACT", "VALIDATE", "RECOVER", "VALIDATE", "DELIVER", "RETURN"]
  );
  assert.deepEqual(
    result.records.map((record) => record.kind),
    [
      "run_started",
      "exploration_activity",
      "implementation_activity",
      "validation_failure",
      "recovery_activity",
      "validation_success",
      "artifact_delivered",
      "run_completed"
    ]
  );
  assert.equal(snapshot.root_run_id, "run-auth-001");
  assert.equal(snapshot.phase, "RETURN");
  assert.equal(snapshot.records.length, result.records.length);
});

test("semantic snapshots expose all domains and stable weighted Activity Mix", () => {
  const result = analyzeRuntimeEvents(createSimulatedRunSequence({ includeChildRun: true }));
  const snapshot = result.snapshots[0];

  assert.deepEqual(Object.keys(snapshot.domain_scores), SEMANTIC_DOMAINS);
  assert.deepEqual(Object.keys(snapshot.activity_mix), SEMANTIC_DOMAINS);
  assert.deepEqual(Object.keys(snapshot.domain_scores), Object.keys(snapshot.activity_mix));
  assert.equal(
    Object.values(snapshot.activity_mix).reduce((sum, value) => sum + value, 0),
    100
  );
  assert.equal(snapshot.primary_domain, "Engineering");
  assert.deepEqual(snapshot.secondary_domains, ["Debugging", "Research", "Planning"]);

  for (const record of result.records) {
    assert.doesNotThrow(() => validateSemanticRecord(record));
    assert.ok(record.impact >= 0 && record.impact <= 5);
    assert.ok(record.visibility >= 0 && record.visibility <= 5);
  }
});

test("large resource counts do not change fixed-impact semantic interpretation", () => {
  const ordinary = createSimulatedRunSequence({ includeChildRun: false });
  const large = clone(ordinary);
  const activity = large.find((event) => event.type === "resource.activity");
  activity.attributes.read_count = 1_000_000;
  activity.attributes.search_count = 1_000_000;
  activity.attributes.resource_count = 1_000_000;

  const ordinaryResult = analyzeRuntimeEvents(ordinary);
  const largeResult = analyzeRuntimeEvents(large);

  assert.deepEqual(largeResult.records, ordinaryResult.records);
  assert.deepEqual(largeResult.snapshots, ordinaryResult.snapshots);
});

test("parent and child events share a root timeline while preserving source context", () => {
  const result = analyzeRuntimeEvents(createSimulatedRunSequence({ includeChildRun: true }));
  const childRecord = result.records.find(
    (record) => record.source_event_id === "evt-auth-child-resource-activity"
  );

  assert.ok(childRecord);
  assert.equal(childRecord.root_run_id, "run-auth-001");
  assert.equal(childRecord.context.run_id, "run-auth-research-001");
  assert.equal(childRecord.context.parent_run_id, "run-auth-001");
  assert.equal(childRecord.context.agent_id, "agent-research");
  assert.equal(childRecord.context.parent_agent_id, "agent-root");
});

test("replayed event IDs do not duplicate semantic records or domain scores", () => {
  const sequence = createSimulatedRunSequence({ includeChildRun: true });
  const engine = new SemanticEngine();
  for (const event of sequence) {
    engine.ingest(event);
  }

  const before = engine.getSnapshot("run-auth-001");
  assert.equal(engine.ingest(clone(sequence[2])), null);
  assert.deepEqual(engine.getSnapshot("run-auth-001"), before);
});

test("analyzeRuntimeEvents is deterministic for the same fixture", () => {
  const sequence = createSimulatedRunSequence({ includeChildRun: true });

  assert.deepEqual(analyzeRuntimeEvents(sequence), analyzeRuntimeEvents(clone(sequence)));
});

test("irrelevant lifecycle, tool, and usage facts do not create semantic records", () => {
  const sequence = createSimulatedRunSequence({ includeChildRun: false });
  const base = sequence[0];
  const irrelevant = [
    {
      ...clone(base),
      event_id: "evt-semantic-agent-started",
      timestamp: "2026-09-08T10:00:01.000Z",
      type: "agent.started",
      status: "started",
      attributes: { role: "helper" }
    },
    {
      ...clone(base),
      event_id: "evt-semantic-tool-completed",
      timestamp: "2026-09-08T10:00:02.000Z",
      type: "tool.completed",
      status: "completed",
      attributes: { tool_kind: "shell", success: true }
    },
    {
      ...clone(base),
      event_id: "evt-semantic-usage-reported",
      timestamp: "2026-09-08T10:00:03.000Z",
      type: "usage.reported",
      attributes: { total_tokens: 999_999 }
    }
  ];
  const engine = new SemanticEngine();

  assert.ok(engine.ingest(sequence[0]));
  for (const event of irrelevant) {
    assert.equal(engine.ingest(event), null);
  }
  assert.equal(engine.getRecords("run-auth-001").length, 1);
});

test("semantic records contain no game-state or reward fields", () => {
  const result = analyzeRuntimeEvents(createSimulatedRunSequence({ includeChildRun: true }));
  const forbidden = new Set([
    "xp",
    "boss",
    "dungeon",
    "quest",
    "reward",
    "loot",
    "milestone",
    "skill_xp",
    "domain_progress",
    "building_state",
    "world_state",
    "game_event"
  ]);

  const assertNoForbiddenKeys = (value, path = "record") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbidden.has(key.toLowerCase()), false, `${path}.${key}`);
      assertNoForbiddenKeys(child, `${path}.${key}`);
    }
  };

  assertNoForbiddenKeys(result.records);
});

test("reset clears semantic interpretation state", () => {
  const engine = new SemanticEngine();
  const event = createSimulatedRunSequence({ includeChildRun: false })[0];

  engine.ingest(event);
  assert.equal(engine.getRecords("run-auth-001").length, 1);
  engine.reset();

  assert.deepEqual(engine.getRecords("run-auth-001"), []);
  assert.equal(engine.getSnapshot("run-auth-001").phase, SEMANTIC_PHASES[0]);
  assert.equal(engine.getSnapshot("run-auth-001").primary_domain, null);
});
