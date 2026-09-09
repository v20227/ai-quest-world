import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { createInitialWorldState } from "../../core/world/world-state-types.mjs";
import { SqliteEventStore } from "../../storage/sqlite/event-store.mjs";
import { SqliteProjectionStore } from "../../storage/sqlite/projection-store.mjs";
import { CURRENT_SCHEMA_VERSION } from "../../storage/sqlite/schema.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const events = createSimulatedRunSequence({ includeChildRun: false });

function projection({ candidate = false, id = "quest-main", xp = 20 } = {}) {
  const inputs = candidate ? events.slice(0, 1) : events;
  const analysis = analyzeRuntimeEvents(inputs);
  const engine = new QuestEngine();
  engine.process(inputs, analysis.records);
  const quest = engine.getQuests()[0];
  const progression = calculateProgression(quest, analysis.records);
  delete quest.settlement_snapshot;
  quest.quest_id = id;
  quest.root_run_id = `run-${id}`;
  progression.quest_id = id;
  progression.root_run_id = quest.root_run_id;
  progression.quest_snapshot = clone(quest);
  const world = createInitialWorldState();
  world.progression_totals.skill_xp = xp;
  world.last_quest_id = id;
  return {
    world,
    quests: [quest],
    progressions: [progression],
    appliedInputs: inputs.map((event) => ({ input_id: event.event_id, input_kind: "runtime" })),
    policyVersion: candidate ? "policy-2" : "policy-1",
    eventCount: inputs.length
  };
}

function snapshot(input) {
  return { world: input.world, quests: input.quests, progressions: input.progressions };
}

async function fileDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), "ai-quest-projection-"));
  const handles = [];
  t.after(async () => {
    for (const handle of handles.reverse()) handle.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    path: join(directory, "world.sqlite"),
    track(handle) { handles.push(handle); return handle; }
  };
}

function memoryStore(t) {
  const store = new SqliteProjectionStore();
  t.after(() => store.close());
  return store;
}

test("replacement repairs older state, removes orphan rows and markers, preserves events, and survives reopen", async (t) => {
  const file = await fileDatabase(t);
  const eventStore = file.track(new SqliteEventStore({ path: file.path }));
  eventStore.appendMany(events);
  const store = file.track(new SqliteProjectionStore({ path: file.path }));
  const old = projection();
  const orphan = projection({ id: "quest-orphan" });
  old.quests.push(...orphan.quests);
  old.progressions.push(...orphan.progressions);
  old.appliedInputs.push({ input_id: "orphan-input", input_kind: "progression" });
  assert.equal(store.replace(old), true);
  assert.deepEqual(store.getSnapshot(), snapshot(old));
  const repaired = projection({ candidate: true, xp: 0 });
  repaired.eventCount = events.length;
  assert.equal(store.replace(repaired, { expectedEventCount: events.length }), true);
  assert.deepEqual(store.getSnapshot(), snapshot(repaired));
  assert.equal(store.countApplied(), 1);
  assert.deepEqual(store.getMetadata(), { policy_version: "policy-2", event_count: events.length });
  assert.deepEqual(eventStore.list(), events);
  const database = new DatabaseSync(file.path);
  assert.deepEqual(database.prepare("SELECT input_id, input_kind FROM world_applied_inputs").all().map((row) => ({ ...row })), repaired.appliedInputs);
  database.close();
  store.close();
  const reopened = file.track(new SqliteProjectionStore({ path: file.path }));
  assert.deepEqual(reopened.getSnapshot(), snapshot(repaired));
  assert.deepEqual(reopened.getMetadata(), storeMetadata(repaired));
  assert.equal(reopened.countApplied(), 1);
  assert.equal(eventStore.append(events[0]).duplicate, true);
  assert.equal(eventStore.append({ ...events[0], event_id: "after-repair" }).sequence, events.length + 1);
});

function storeMetadata(input) {
  return { policy_version: input.policyVersion, event_count: input.eventCount };
}

test("SQL uniqueness failures after deletes roll back every projection table and metadata", async (t) => {
  const file = await fileDatabase(t);
  const store = file.track(new SqliteProjectionStore({ path: file.path }));
  const original = projection();
  store.replace(original);
  for (const collection of ["quests", "progressions", "appliedInputs"]) {
    const invalid = projection({ candidate: true, xp: 0 });
    invalid[collection].push(clone(invalid[collection][0]));
    assert.throws(() => store.replace(invalid), /UNIQUE constraint failed/);
    assert.deepEqual(store.getSnapshot(), snapshot(original));
    assert.deepEqual(store.getMetadata(), storeMetadata(original));
    assert.equal(store.countApplied(), original.appliedInputs.length);
  }
  store.close();
  const reopened = file.track(new SqliteProjectionStore({ path: file.path }));
  assert.deepEqual(reopened.getSnapshot(), snapshot(original));
  assert.deepEqual(reopened.getMetadata(), storeMetadata(original));
  assert.equal(reopened.replace(projection({ candidate: true })), true);
});

test("validates all input collections and metadata without changing durable state", (t) => {
  const store = memoryStore(t);
  const original = projection();
  store.replace(original);
  const mutations = [
    (input) => { input.world.gate.state = "INVALID"; },
    (input) => { input.quests[0].quest_id = ""; },
    (input) => { input.progressions[0].skill_xp = -1; },
    (input) => { input.appliedInputs[0].input_kind = " "; },
    (input) => { input.appliedInputs = [null]; },
    (input) => { input.quests = null; },
    (input) => { input.progressions = {}; },
    (input) => { input.policyVersion = ""; },
    (input) => { input.eventCount = -1; },
    (input) => { input.world.cycle = input.world; }
  ];
  for (const mutate of mutations) {
    const invalid = clone(original);
    mutate(invalid);
    assert.throws(() => store.replace(invalid));
    assert.deepEqual(store.getSnapshot(), snapshot(original));
    assert.deepEqual(store.getMetadata(), storeMetadata(original));
    assert.equal(store.countApplied(), original.appliedInputs.length);
  }
  assert.throws(() => store.replace(original, { expectedEventCount: NaN }), /expectedEventCount/);
});

test("event watermark rejects a concurrent append and optional omission supports separate memory connections", async (t) => {
  const file = await fileDatabase(t);
  const eventStore = file.track(new SqliteEventStore({ path: file.path }));
  const store = file.track(new SqliteProjectionStore({ path: file.path }));
  eventStore.append(events[0]);
  const original = projection({ candidate: true });
  assert.equal(store.replace(original, { expectedEventCount: 1 }), true);
  const watermark = eventStore.count();
  eventStore.append(events[1]);
  assert.equal(store.replace(projection(), { expectedEventCount: watermark }), false);
  assert.deepEqual(store.getSnapshot(), snapshot(original));
  assert.deepEqual(store.getMetadata(), storeMetadata(original));
  assert.equal(store.countApplied(), original.appliedInputs.length);
  assert.equal(eventStore.count(), 2);
  const refreshed = projection();
  refreshed.eventCount = 2;
  assert.equal(store.replace(refreshed, { expectedEventCount: 2 }), true);
  const memory = memoryStore(t);
  assert.equal(memory.replace(refreshed, { expectedEventCount: 2 }), false);
  assert.equal(memory.getMetadata(), null);
  assert.equal(memory.replace(refreshed), true);
  assert.deepEqual(memory.getSnapshot(), snapshot(refreshed));
});

test("fresh and cleared stores expose initial world, empty collections and explicit metadata", (t) => {
  const store = memoryStore(t);
  const empty = { world: createInitialWorldState(), quests: [], progressions: [], appliedInputs: [], policyVersion: "policy-empty", eventCount: 0 };
  assert.deepEqual(store.getSnapshot(), snapshot(empty));
  assert.equal(store.getMetadata(), null);
  assert.equal(store.countApplied(), 0);
  store.replace(projection());
  assert.equal(store.replace(empty, { expectedEventCount: 0 }), true);
  assert.deepEqual(store.getSnapshot(), snapshot(empty));
  assert.deepEqual(store.getMetadata(), storeMetadata(empty));
  assert.equal(store.countApplied(), 0);
  store.close();
  store.close();
  assert.throws(() => store.getSnapshot(), /closed/);
  assert.throws(() => store.getMetadata(), /closed/);
  assert.throws(() => store.countApplied(), /closed/);
  assert.throws(() => store.replace(empty), /closed/);
});

test("snapshot collections sort by updated_at then quest_id and return detached values", (t) => {
  const store = memoryStore(t);
  const a = projection({ id: "a" });
  const b = projection({ id: "b" });
  const early = projection({ id: "z", candidate: true });
  const input = { ...a, quests: [b.quests[0], a.quests[0], early.quests[0]], progressions: [b.progressions[0], early.progressions[0], a.progressions[0]] };
  store.replace(input);
  const result = store.getSnapshot();
  assert.deepEqual(result.quests.map((quest) => quest.quest_id), ["z", "a", "b"]);
  assert.deepEqual(result.progressions.map((item) => item.quest_id), ["z", "a", "b"]);
  result.world.gate.state = "INVALID";
  result.quests[0].title = "changed";
  assert.equal(store.getSnapshot().world.gate.state, "DORMANT");
  assert.equal(store.getSnapshot().quests[0].title, early.quests[0].title);
});

test("schema 3 migrates to 4 while preserving every existing row", async (t) => {
  const file = await fileDatabase(t);
  const database = new DatabaseSync(file.path);
  database.exec(`
    CREATE TABLE runtime_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, run_id TEXT NOT NULL, parent_run_id TEXT, agent_id TEXT, parent_agent_id TEXT, event_type TEXT NOT NULL, event_timestamp TEXT NOT NULL, event_json TEXT NOT NULL);
    CREATE UNIQUE INDEX idx_runtime_events_event_id ON runtime_events (event_id);
    CREATE INDEX idx_runtime_events_run_sequence ON runtime_events (run_id, sequence);
    CREATE INDEX idx_runtime_events_sequence ON runtime_events (sequence);
    CREATE TABLE world_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), state_json TEXT NOT NULL);
    CREATE TABLE world_applied_inputs (input_id TEXT PRIMARY KEY, input_kind TEXT NOT NULL);
    CREATE INDEX idx_world_applied_inputs_kind ON world_applied_inputs (input_kind);
    CREATE TABLE quests (quest_id TEXT PRIMARY KEY, root_run_id TEXT NOT NULL UNIQUE, updated_at TEXT NOT NULL, quest_json TEXT NOT NULL);
    CREATE TABLE progressions (quest_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, progression_json TEXT NOT NULL);
    CREATE INDEX idx_quests_updated_at ON quests (updated_at);
    CREATE INDEX idx_progressions_updated_at ON progressions (updated_at);
    PRAGMA user_version = 3;
  `);
  const old = projection();
  const quest = old.quests[0];
  database.prepare("INSERT INTO runtime_events (event_id, run_id, event_type, event_timestamp, event_json) VALUES (?, ?, ?, ?, ?)").run(events[0].event_id, events[0].context.run_id, events[0].type, events[0].timestamp, JSON.stringify(events[0]));
  database.prepare("INSERT INTO world_state VALUES (1, ?)").run(JSON.stringify(old.world));
  database.prepare("INSERT INTO quests VALUES (?, ?, ?, ?)").run(quest.quest_id, quest.root_run_id, quest.updated_at, JSON.stringify(quest));
  database.prepare("INSERT INTO progressions VALUES (?, ?, ?)").run(quest.quest_id, quest.updated_at, JSON.stringify(old.progressions[0]));
  database.prepare("INSERT INTO world_applied_inputs VALUES (?, ?)").run("legacy-input", "runtime");
  const tables = ["runtime_events", "world_state", "quests", "progressions", "world_applied_inputs", "sqlite_sequence"];
  const before = tables.map((table) => database.prepare(`SELECT * FROM ${table}`).all());
  const store = file.track(new SqliteProjectionStore({ path: file.path }));
  assert.equal(database.prepare("PRAGMA user_version").get().user_version, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(tables.map((table) => database.prepare(`SELECT * FROM ${table}`).all()), before);
  assert.deepEqual(store.getSnapshot(), snapshot(old));
  assert.equal(store.getMetadata(), null);
  assert.equal(store.countApplied(), 1);
  database.close();
});
