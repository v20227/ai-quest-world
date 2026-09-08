import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { WorldStateEngine } from "../../core/world/world-state-engine.mjs";
import {
  createInitialWorldState,
  validateWorldState
} from "../../core/world/world-state-types.mjs";
import { SqliteWorldStateStore } from "../../storage/sqlite/world-state-store.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

async function createDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), "ai-quest-world-world-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return join(directory, "world.sqlite");
}

function canonicalProjection() {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const analysis = analyzeRuntimeEvents(events);
  const questEngine = new QuestEngine();
  questEngine.process(events, analysis.records);
  const quest = questEngine.getQuests()[0];
  assert.ok(quest);
  return {
    events,
    progression: calculateProgression(quest, analysis.records)
  };
}

function projectInMemory(events, progression) {
  const engine = new WorldStateEngine();
  for (const event of events) {
    engine.ingest(event);
  }
  if (progression !== undefined) {
    engine.applyProgression(progression);
  }
  return { engine, state: engine.getState() };
}

test("fresh World State starts with the Small Camp baseline", () => {
  const state = createInitialWorldState();
  validateWorldState(state);

  assert.equal(state.camp.state, "ACTIVE");
  assert.equal(state.gate.state, "DORMANT");
  assert.equal(state.guild.state, "OLD");
  assert.equal(state.workshop.state, "LOCKED");
  assert.equal(state.library.state, "LOCKED");
  assert.deepEqual(state.active_run_ids, []);
  assert.deepEqual(state.return_highlights, []);
});

test("runtime lifecycle activates the Gate and leaves it Returning after root completion", () => {
  const { events } = canonicalProjection();
  const engine = new WorldStateEngine();

  const started = engine.ingest(events[0]);
  assert.equal(started.gate.state, "ACTIVE");
  assert.deepEqual(started.active_run_ids, ["run-auth-001"]);
  assert.equal(started.gate.connection_count, 1);
  assert.equal(started.gate.first_connected_at, events[0].timestamp);

  for (const event of events.slice(1)) {
    engine.ingest(event);
  }
  const returned = engine.getState();
  assert.equal(returned.gate.state, "RETURNING");
  assert.deepEqual(returned.active_run_ids, []);
  assert.equal(returned.last_return_at, events.at(-1).timestamp);
});

test("credible completed progression restores the Guild and unlocks relevant buildings", () => {
  const { events, progression } = canonicalProjection();
  const { state } = projectInMemory(events, progression);

  assert.equal(state.guild.state, "RESTORED");
  assert.equal(state.guild.qualifying_quest_count, 1);
  assert.equal(state.workshop.state, "IDLE");
  assert.equal(state.library.state, "IDLE");
  assert.equal(state.progression_totals.skill_xp, progression.skill_xp);
  assert.deepEqual(
    state.progression_totals.domain_progress,
    progression.domain_progress
  );
  assert.equal(state.progression_totals.qualifying_quest_count, 1);
  assert.equal(state.progression_totals.artifact_count, 1);
  assert.equal(state.last_quest_id, progression.quest_id);
  assert.ok(state.return_highlights.length > 0);
  assert.ok(state.return_highlights.length <= 3);
});

test("unverified progression records limited totals but does not unlock buildings or artifact loot", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const events = [
    full[0],
    full.find((event) => event.type === "resource.activity"),
    full.find((event) => event.type === "resource.changed"),
    full.at(-1)
  ];
  const analysis = analyzeRuntimeEvents(events);
  const questEngine = new QuestEngine();
  questEngine.process(events, analysis.records);
  const progression = calculateProgression(questEngine.getQuests()[0], analysis.records);
  const { state } = projectInMemory(events, progression);

  assert.equal(progression.outcome_confidence, "UNVERIFIED");
  assert.ok(progression.skill_xp > 0);
  assert.equal(state.guild.state, "OLD");
  assert.equal(state.workshop.state, "LOCKED");
  assert.equal(state.library.state, "LOCKED");
  assert.equal(state.progression_totals.qualifying_quest_count, 0);
  assert.equal(state.progression_totals.artifact_count, 0);
});

test("duplicate runtime events and Quest progression are idempotent", () => {
  const { events, progression } = canonicalProjection();
  const engine = new WorldStateEngine();
  for (const event of events) {
    engine.ingest(event);
  }
  engine.applyProgression(progression);
  const before = engine.getState();

  assert.equal(engine.ingest(clone(events[0])), null);
  assert.equal(engine.applyProgression(clone(progression)), null);
  assert.deepEqual(engine.getState(), before);
});

test("World State and applied-input markers survive SQLite restart", async (t) => {
  const path = await createDatabase(t);
  const { events, progression } = canonicalProjection();

  const firstStore = new SqliteWorldStateStore({ path });
  const firstEngine = new WorldStateEngine({ repository: firstStore });
  for (const event of events) {
    firstEngine.ingest(event);
  }
  assert.ok(firstEngine.applyProgression(progression));
  const beforeRestart = firstEngine.getState();
  const appliedCount = firstStore.countApplied();
  firstStore.close();

  const reopenedStore = new SqliteWorldStateStore({ path });
  t.after(() => reopenedStore.close());
  const reopenedEngine = new WorldStateEngine({ repository: reopenedStore });
  assert.deepEqual(reopenedEngine.getState(), beforeRestart);
  for (const event of events) {
    assert.equal(reopenedEngine.ingest(clone(event)), null);
  }
  assert.equal(reopenedEngine.applyProgression(clone(progression)), null);
  assert.deepEqual(reopenedEngine.getState(), beforeRestart);
  assert.equal(reopenedStore.countApplied(), appliedCount);
});

test("World State validation enforces the three-highlight presentation budget", () => {
  const state = createInitialWorldState();
  state.return_highlights = [
    { kind: "a", target: "a", label: "A", priority: 1, quest_id: null },
    { kind: "b", target: "b", label: "B", priority: 1, quest_id: null },
    { kind: "c", target: "c", label: "C", priority: 1, quest_id: null },
    { kind: "d", target: "d", label: "D", priority: 1, quest_id: null }
  ];
  assert.throws(() => validateWorldState(state), /return_highlights.*at most three/);
});
