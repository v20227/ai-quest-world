import test from "node:test";
import assert from "node:assert/strict";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { classifyOutcome } from "../../core/game/outcome-policy.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

function semanticRecordsFor(events) {
  return analyzeRuntimeEvents(events).records;
}

function processEvents(events) {
  const engine = new QuestEngine();
  engine.process(events, semanticRecordsFor(events));
  return { engine, quest: engine.getQuests()[0] };
}

function eventByType(events, type, occurrence = 0) {
  const matches = events.filter((event) => event.type === type);
  assert.ok(matches[occurrence], `fixture event ${type}[${occurrence}] must exist`);
  return clone(matches[occurrence]);
}

test("canonical run creates one completed Verified Quest with child context and artifact reference", () => {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const { engine, quest } = processEvents(events);

  assert.ok(quest);
  assert.equal(engine.getQuests().length, 1);
  assert.equal(quest.quest_id, "quest:run-auth-001");
  assert.equal(quest.root_run_id, "run-auth-001");
  assert.equal(quest.title, "Fix Authentication");
  assert.equal(quest.status, "COMPLETED");
  assert.equal(quest.phase, "RETURN");
  assert.equal(quest.outcome_confidence, "VERIFIED");
  assert.equal(quest.primary_domain, "Engineering");
  assert.deepEqual(quest.secondary_domains, ["Debugging", "Research", "Planning"]);
  assert.deepEqual(quest.run_ids, ["run-auth-001", "run-auth-research-001"]);
  assert.deepEqual(quest.agent_ids, ["agent-root", "agent-research"]);
  assert.equal(quest.validation_summary.attempted, true);
  assert.equal(quest.validation_summary.success_count, 1);
  assert.equal(quest.validation_summary.failure_count, 1);
  assert.equal(quest.validation_summary.latest_passed, 16);
  assert.equal(quest.artifact_refs.length, 1);
  assert.equal(quest.artifact_refs[0].artifact_id, "artifact-auth-refactor");
  assert.equal(quest.artifact_refs[0].durable, true);
  assert.equal(quest.artifact_refs[0].has_reference, true);
  assert.equal(engine.getQuestForRun("run-auth-research-001").quest_id, quest.quest_id);
});

test("root run starts as Candidate, becomes Active, then Validating", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const recordsById = new Map(semanticRecordsFor(events).map((record) => [record.source_event_id, record]));
  const engine = new QuestEngine();

  const candidate = engine.ingest(events[0], recordsById.get(events[0].event_id));
  assert.equal(candidate.status, "CANDIDATE");

  const activeEvent = eventByType(events, "resource.activity");
  const active = engine.ingest(activeEvent, recordsById.get(activeEvent.event_id));
  assert.equal(active.status, "ACTIVE");

  const validation = eventByType(events, "validation.completed");
  const validating = engine.ingest(validation, recordsById.get(validation.event_id));
  assert.equal(validating.status, "VALIDATING");
});

test("completed run without validation or durable artifact is Unverified", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const events = [
    full[0],
    eventByType(full, "resource.activity"),
    eventByType(full, "resource.changed"),
    full.at(-1)
  ];
  const { quest } = processEvents(events);

  assert.equal(quest.status, "COMPLETED");
  assert.equal(quest.outcome_confidence, "UNVERIFIED");
  assert.equal(quest.validation_summary.attempted, false);
  assert.deepEqual(quest.artifact_refs, []);
});

test("successful validation without durable artifact is Supported", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const events = [
    full[0],
    eventByType(full, "validation.completed", 1),
    full.at(-1)
  ];
  const { quest } = processEvents(events);

  assert.equal(quest.status, "COMPLETED");
  assert.equal(quest.outcome_confidence, "SUPPORTED");
  assert.equal(quest.validation_summary.success_count, 1);
});

test("artifact updates retain the strongest known factual reference", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const artifact = eventByType(full, "artifact.created");
  const update = clone(artifact);
  update.event_id = "evt-auth-artifact-updated";
  update.type = "artifact.updated";
  update.timestamp = new Date(Date.parse(artifact.timestamp) + 1000).toISOString();
  update.attributes = {
    artifact_id: artifact.attributes.artifact_id,
    kind: artifact.attributes.kind,
    relation: "updated"
  };
  update.evidence_refs = [];

  const outcome = classifyOutcome([artifact, update]);
  assert.equal(outcome.artifact_refs.length, 1);
  assert.equal(outcome.artifact_refs[0].uri_or_path, "artifacts/auth-refactor.patch");
  assert.equal(outcome.artifact_refs[0].durable, true);
  assert.equal(outcome.artifact_refs[0].relation, "updated");
  assert.equal(outcome.artifact_refs[0].has_reference, true);
  assert.equal(outcome.artifact_refs[0].evidence_refs.length, 1);
});

test("failed and cancelled root terminals map to distinct terminal states", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const failedTerminal = eventByType(full, "run.completed");
  failedTerminal.event_id = "evt-quest-failed";
  failedTerminal.type = "run.failed";
  failedTerminal.status = "failed";
  failedTerminal.attributes.native_outcome = "failed";

  const cancelledTerminal = eventByType(full, "run.completed");
  cancelledTerminal.event_id = "evt-quest-cancelled";
  cancelledTerminal.type = "run.cancelled";
  cancelledTerminal.status = "cancelled";
  cancelledTerminal.attributes.native_outcome = "cancelled";
  cancelledTerminal.context.run_id = "run-cancelled-001";
  cancelledTerminal.attributes.title = undefined;

  const failed = processEvents([full[0], failedTerminal]).quest;
  const cancelled = processEvents([
    { ...clone(full[0]), event_id: "evt-cancelled-start", context: { ...full[0].context, run_id: "run-cancelled-001" } },
    cancelledTerminal
  ]).quest;

  assert.equal(failed.status, "FAILED");
  assert.equal(failed.outcome_confidence, "FAILED");
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.outcome_confidence, "CANCELLED");
});

test("child and retry terminals attach without independently completing the root Quest", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const childTerminal = eventByType(full, "run.completed");
  childTerminal.event_id = "evt-quest-child-completed";
  childTerminal.context = {
    ...childTerminal.context,
    run_id: "run-auth-retry-001",
    parent_run_id: "run-auth-001",
    agent_id: "agent-retry",
    parent_agent_id: "agent-root"
  };

  const rootTerminal = eventByType(full, "run.completed");
  const events = [full[0], childTerminal, rootTerminal];
  const { engine, quest } = processEvents(events);

  assert.equal(engine.getQuests().length, 1);
  assert.equal(quest.status, "COMPLETED");
  assert.equal(quest.root_run_id, "run-auth-001");
  assert.ok(quest.run_ids.includes("run-auth-retry-001"));
  assert.equal(engine.getQuestForRun("run-auth-retry-001").quest_id, quest.quest_id);
});

test("independent root runs create separate Candidate/terminal Quests", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const secondStart = clone(full[0]);
  secondStart.event_id = "evt-second-run-started";
  secondStart.context = { ...secondStart.context, run_id: "run-second-001", agent_id: "agent-second" };
  secondStart.attributes.title = "Write Release Notes";
  const secondTerminal = clone(full.at(-1));
  secondTerminal.event_id = "evt-second-run-completed";
  secondTerminal.context = { ...secondStart.context };

  const engine = new QuestEngine();
  engine.process(
    [full[0], secondStart, full.at(-1), secondTerminal],
    semanticRecordsFor([full[0], secondStart, full.at(-1), secondTerminal])
  );
  const quests = engine.getQuests();

  assert.equal(quests.length, 2);
  assert.deepEqual(quests.map((quest) => quest.root_run_id), ["run-auth-001", "run-second-001"]);
  assert.equal(quests[0].status, "COMPLETED");
  assert.equal(quests[1].title, "Write Release Notes");
  assert.equal(quests[1].status, "COMPLETED");
});

test("replayed event IDs do not create a second Quest or alter state", () => {
  const events = createSimulatedRunSequence({ includeChildRun: false });
  const record = semanticRecordsFor(events).find((candidate) => candidate.source_event_id === events[0].event_id);
  const engine = new QuestEngine();

  engine.ingest(events[0], record);
  const before = engine.getQuests();
  assert.equal(engine.ingest(clone(events[0]), clone(record)), null);
  assert.deepEqual(engine.getQuests(), before);
});

test("Quest projections contain no reward, loot, or World State mutation fields", () => {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const { quest } = processEvents(events);
  const forbidden = ["xp", "reward", "loot", "world_state", "building_state", "game_event"];

  for (const key of forbidden) {
    assert.equal(key in quest, false, `quest must not expose ${key}`);
  }
});

test("Quest projections are deterministic for repeated canonical analysis", () => {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const first = processEvents(events).quest;
  const second = processEvents(clone(events)).quest;

  assert.deepEqual(first, second);
});
