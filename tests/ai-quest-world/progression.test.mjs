import test from "node:test";
import assert from "node:assert/strict";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function buildProjection(events) {
  const analysis = analyzeRuntimeEvents(events);
  const engine = new QuestEngine();
  engine.process(events, analysis.records);
  const quest = engine.getQuests()[0];
  assert.ok(quest);
  return {
    quest,
    records: analysis.records,
    progression: calculateProgression(quest, analysis.records)
  };
}

function eventByType(events, type, occurrence = 0) {
  const matches = events.filter((event) => event.type === type);
  assert.ok(matches[occurrence], `fixture event ${type}[${occurrence}] must exist`);
  return clone(matches[occurrence]);
}

function buildRepeatedFailureEvents(count) {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const start = clone(full[0]);
  const template = eventByType(full, "validation.completed");
  delete template.evidence_refs;
  const events = [start];

  for (let index = 0; index < count; index += 1) {
    const failure = clone(template);
    failure.event_id = `evt-repeated-validation-failure-${index + 1}`;
    failure.timestamp = new Date(Date.parse(start.timestamp) + (index + 1) * 1000).toISOString();
    events.push(failure);
  }

  const terminal = clone(full.at(-1));
  terminal.event_id = "evt-repeated-failure-run-completed";
  terminal.timestamp = new Date(Date.parse(start.timestamp) + (count + 1) * 1000).toISOString();
  events.push(terminal);
  return events;
}

test("only a terminal Quest resolves progression and the canonical result has real artifact loot", () => {
  const pendingEvents = createSimulatedRunSequence({ includeChildRun: false }).slice(0, 3);
  const pending = buildProjection(pendingEvents).progression;

  assert.equal(pending.resolution, "PENDING");
  assert.equal(pending.skill_xp, 0);
  assert.deepEqual(pending.domain_progress, {
    Research: 0,
    Planning: 0,
    Engineering: 0,
    Debugging: 0,
    Creation: 0,
    Automation: 0
  });
  assert.deepEqual(pending.loot_refs, []);

  const completed = buildProjection(createSimulatedRunSequence({ includeChildRun: true })).progression;
  assert.equal(completed.resolution, "RESOLVED");
  assert.equal(completed.outcome_confidence, "VERIFIED");
  assert.ok(completed.skill_xp > 0);
  assert.ok(completed.domain_progress.Engineering > 0);
  assert.equal(completed.loot_refs.length, 1);
  assert.equal(completed.loot_refs[0].artifact_id, "artifact-auth-refactor");
});

test("outcome confidence changes progression deterministically and failed work keeps only limited process credit", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const unverifiedEvents = [
    full[0],
    eventByType(full, "resource.activity"),
    eventByType(full, "resource.changed"),
    full.at(-1)
  ];
  const failedTerminal = eventByType(full, "run.completed");
  failedTerminal.event_id = "evt-progression-failed";
  failedTerminal.type = "run.failed";
  failedTerminal.status = "failed";
  failedTerminal.attributes.native_outcome = "failed";
  const failedEvents = [
    full[0],
    eventByType(full, "resource.activity"),
    eventByType(full, "resource.changed"),
    failedTerminal
  ];

  const unverified = buildProjection(unverifiedEvents).progression;
  const failed = buildProjection(failedEvents).progression;
  const verified = buildProjection(full).progression;

  assert.equal(unverified.outcome_confidence, "UNVERIFIED");
  assert.equal(failed.outcome_confidence, "FAILED");
  assert.equal(failed.loot_refs.length, 0);
  assert.ok(failed.skill_xp > 0);
  assert.ok(failed.skill_xp < unverified.skill_xp);
  assert.ok(unverified.skill_xp < verified.skill_xp);
  assert.ok(failed.domain_progress.Engineering < unverified.domain_progress.Engineering);
});

test("raw volume changes do not change the progression snapshot", () => {
  const originalEvents = createSimulatedRunSequence({ includeChildRun: true });
  const changedEvents = clone(originalEvents);
  for (const event of changedEvents) {
    if (event.type === "resource.activity") {
      event.attributes.read_count = 999999;
      event.attributes.search_count = 999999;
      event.attributes.resource_count = 999999;
      event.attributes.duration_ms = 999999;
    }
  }

  const original = buildProjection(originalEvents).progression;
  const changed = buildProjection(changedEvents).progression;
  assert.deepEqual(changed, original);
});

test("duplicate semantic records are idempotent and visible only in anti-abuse diagnostics", () => {
  const { quest, records, progression } = buildProjection(
    createSimulatedRunSequence({ includeChildRun: true })
  );
  const replayed = calculateProgression(quest, [
    ...records,
    clone(records[2]),
    clone(records.at(-1))
  ]);

  assert.equal(replayed.anti_abuse.duplicate_semantic_count, 2);
  assert.equal(replayed.skill_xp, progression.skill_xp);
  assert.deepEqual(replayed.domain_progress, progression.domain_progress);
  assert.deepEqual(replayed.semantic_credit, progression.semantic_credit);
  assert.deepEqual(replayed.loot_refs, progression.loot_refs);
});

test("repeated validation failures diminish and stop at the per-kind cap", () => {
  const single = buildProjection(buildRepeatedFailureEvents(1)).progression;
  const repeated = buildProjection(buildRepeatedFailureEvents(20)).progression;

  assert.equal(single.outcome_confidence, "FAILED");
  assert.equal(repeated.outcome_confidence, "FAILED");
  assert.equal(repeated.anti_abuse.repeated_failure_count, 19);
  assert.ok(repeated.anti_abuse.repeated_failure_credit <= repeated.anti_abuse.repeated_failure_credit_cap);
  assert.ok(repeated.anti_abuse.capped_kinds.includes("validation_failure"));
  assert.equal(repeated.semantic_credit.by_kind.validation_failure, single.semantic_credit.by_kind.validation_failure);
  assert.equal(repeated.skill_xp, single.skill_xp);
});

test("failed and unverified outcomes never fabricate artifact loot", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const failedTerminal = clone(full.at(-1));
  failedTerminal.event_id = "evt-progression-artifact-failed";
  failedTerminal.type = "run.failed";
  failedTerminal.status = "failed";
  failedTerminal.attributes.native_outcome = "failed";
  const failed = buildProjection([...full.slice(0, -1), failedTerminal]).progression;

  const unverifiedEvents = [
    full[0],
    eventByType(full, "resource.activity"),
    eventByType(full, "resource.changed"),
    full.at(-1)
  ];
  const unverified = buildProjection(unverifiedEvents).progression;

  assert.equal(failed.loot_refs.length, 0);
  assert.equal(unverified.loot_refs.length, 0);
});

test("progression snapshots are deterministic and expose no raw usage reward inputs", () => {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const first = buildProjection(events).progression;
  const second = buildProjection(clone(events)).progression;

  assert.deepEqual(second, first);
  for (const key of ["input_tokens", "output_tokens", "tool_calls", "read_count", "search_count", "agent_count"]) {
    assert.equal(key in first, false, `progression must not expose ${key}`);
  }
});
