import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { projectWorld } from "../../apps/world-web/project-world.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";
import { RunLineage } from "../../packages/uarp/run-lineage.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { SemanticEngine, analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";

function sequence(run, offset = 0) {
  return createSimulatedRunSequence({ includeChildRun: false }).map(event => ({ ...structuredClone(event),
    event_id: `${run}:${event.event_id}`, timestamp: new Date(Date.parse(event.timestamp) + offset).toISOString(),
    context: { ...event.context, run_id: run } }));
}

test("explicit resume after credible completion shares one frozen bounded settlement", () => {
  const a = sequence("a"); const b = sequence("b", 100000);
  b[0].attributes.resumed_from_run_id = "a";
  const first = projectWorld(a); const combined = projectWorld([...a, ...b]);
  assert.equal(combined.quests.length, 1);
  assert.deepEqual(combined.quests[0].run_ids, ["a", "b"]);
  assert.deepEqual(combined.progressions, first.progressions);
  assert.deepEqual(combined.world.progression_totals, first.world.progression_totals);
});

test("failed root can resume and recover without multiplying completion rewards", () => {
  const a = sequence("a").slice(0, 4);
  const terminal = sequence("a").at(-1);
  terminal.type = "run.failed"; terminal.status = "failed"; a.push(terminal);
  const b = sequence("b", 100000); b[0].attributes.resumed_from_run_id = "a";
  const failed = projectWorld(a);
  const active = projectWorld([...a, b[0]]);
  assert.equal(active.quests[0].status, "CANDIDATE");
  assert.deepEqual(active.world.progression_totals, failed.world.progression_totals);
  const recovered = projectWorld([...a, ...b]);
  assert.equal(recovered.quests.length, 1);
  assert.equal(recovered.quests[0].outcome_confidence, "VERIFIED");
  assert.equal(recovered.world.progression_totals.qualifying_quest_count, 1);
});

test("late multilevel ancestry resolves consistently and child terminals cannot settle roots", () => {
  const a = sequence("a"); const b = sequence("b", 1000); const c = sequence("c", 2000);
  for (const event of b) event.context.parent_run_id = "a";
  for (const event of c) event.context.parent_run_id = "b";
  const history = [...c, ...b, ...a];
  assert.deepEqual(projectWorld(history), projectWorld([...history].reverse()));
  assert.equal(projectWorld(history).quests.length, 1);
  assert.equal(projectWorld([...b, ...c]).progressions[0].resolution, "PENDING");
});

test("cycles and conflicting associations are withheld from settlement", () => {
  const a = sequence("a"); const b = sequence("b");
  a[0].attributes.resumed_from_run_id = "b"; b[0].attributes.resumed_from_run_id = "a";
  assert.equal(new RunLineage([...a, ...b]).rootFor("a"), null);
  assert.equal(projectWorld([...a, ...b]).quests.length, 0);
  const c = sequence("c"); c[0].attributes.resumed_from_run_id = "a"; c[0].context.parent_run_id = "independent";
  assert.equal(new RunLineage(c).rootFor("c"), null);
});

test("unknown resume ancestry remains pending until the original start is observed", () => {
  const b = sequence("b"); b[0].attributes.resumed_from_run_id = "missing";
  const result = projectWorld(b);
  assert.equal(result.progressions[0].resolution, "PENDING");
  assert.equal(result.world.progression_totals.skill_xp, 0);
  assert.equal(result.world.progression_totals.artifact_count, 0);
});

test("incremental engine batches retain complete lineage and do not split chained resumes", () => {
  const a = sequence("a"); const b = sequence("b", 100000); const c = sequence("c", 200000);
  b[0].attributes.resumed_from_run_id = "a"; c[0].attributes.resumed_from_run_id = "b";
  const engine = new QuestEngine();
  for (const batch of [a, b, c]) engine.process(batch);
  assert.equal(engine.getQuests().length, 1);
  assert.deepEqual(engine.getQuests()[0].run_ids, ["a", "b", "c"]);
  const semantic = new SemanticEngine(); const child = sequence("child", 500);
  for (const event of child) event.context.parent_run_id = "a";
  const late = new QuestEngine();
  for (const event of [...child, ...a]) {
    late.ingest(event, semantic.process([event]));
  }
  assert.equal(late.getQuests().length, 1);
  assert.deepEqual(semantic.getSnapshot("a"), analyzeRuntimeEvents([...a, ...child]).snapshots[0]);
});

test("late semantic snapshots replace corrected records and retract suppressed records", () => {
  const events = sequence("a");
  const semantic = new SemanticEngine(); const quest = new QuestEngine();
  for (const event of [...events].reverse()) quest.ingest(event, semantic.process([event]));
  assert.deepEqual(quest.getQuests(), projectWorld(events).quests);
  const extra = structuredClone(events[1]); extra.event_id = "late-exploration";
  extra.timestamp = new Date(Date.parse(events[1].timestamp) + 500).toISOString();
  const revisedSemantic = new SemanticEngine(); const revisedQuest = new QuestEngine();
  revisedQuest.process([extra], revisedSemantic.process([extra]));
  revisedQuest.process(events, revisedSemantic.process(events));
  assert.deepEqual(revisedQuest.getQuests(), projectWorld([...events, extra]).quests);
});

test("scalar incremental semantics reject late input before mutating history", () => {
  const events = sequence("a"); const semantic = new SemanticEngine(); const quest = new QuestEngine();
  quest.ingest(events.at(-1), semantic.ingest(events.at(-1)));
  const before = quest.getQuests();
  assert.throws(() => quest.ingest(events[0], semantic.ingest(events[0])), /complete current semantic record array/);
  assert.deepEqual(quest.getQuests(), before);
  quest.ingest(events[0], semantic.process([]));
  assert.equal(quest.getQuests()[0].event_ids.length, 2);
});

test("different direct targets are withheld even if their ultimate root converges", () => {
  const a = sequence("a"); const c = sequence("c", 10000); c[0].attributes.resumed_from_run_id = "a";
  const d = sequence("d", 20000); d[0].attributes.resumed_from_run_id = "a"; d[1].context.parent_run_id = "c";
  assert.equal(new RunLineage([...a, ...c, ...d]).rootFor("d"), null);
  assert.equal(projectWorld([...a, ...c, ...d]).quests.some(quest => quest.run_ids.includes("d")), false);
});

test("late preterminal evidence reconciles one bounded settlement independent of arrival order", () => {
  const a = sequence("a"); const child = sequence("child", 100);
  for (const event of child) event.context.parent_run_id = "a";
  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  try {
    runtime.ingest(a); runtime.ingest(child);
    const expected = projectWorld([...a, ...child]);
    assert.deepEqual(runtime.getSnapshot().world, expected.world);
    assert.equal(expected.world.progression_totals.qualifying_quest_count, 1);
    assert.equal(expected.progressions.length, 1);
    const before = runtime.getSnapshot();
    assert.deepEqual(runtime.ingest([...a, ...child]).snapshot, before);
  } finally { runtime.close(); }
});

test("incremental, reversed arrival and restart produce identical derived world", async t => {
  const directory = await mkdtemp(join(tmpdir(), "quest-lineage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const a = sequence("a"); const b = sequence("b", 100000); b[0].attributes.resumed_from_run_id = "a";
  const events = [...a, ...b];
  const runtime = new PersistentWorldRuntime({ path: join(directory, "world.sqlite") });
  t.after(() => runtime.close());
  for (const event of [...events].reverse()) runtime.ingest([event]);
  const expected = projectWorld(events);
  const actual = runtime.getSnapshot();
  assert.deepEqual(actual.world, expected.world);
  assert.equal(actual.quests.length, 1);
  runtime.close();
  const reopened = new PersistentWorldRuntime({ path: join(directory, "world.sqlite") });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.ingest(events).snapshot, actual);
});

test("policy rebuild corrects old totals and orphan projections without deleting events", async t => {
  const directory = await mkdtemp(join(tmpdir(), "quest-rebuild-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "world.sqlite");
  const runtime = new PersistentWorldRuntime({ path });
  runtime.ingest(sequence("a"));
  const expected = runtime.getSnapshot(); runtime.close();
  const db = new DatabaseSync(path);
  const corrupt = structuredClone(expected.world); corrupt.progression_totals.skill_xp = 9999;
  db.prepare("UPDATE world_state SET state_json = ?").run(JSON.stringify(corrupt));
  db.exec("UPDATE projection_metadata SET policy_version = 'obsolete'");
  const eventCount = db.prepare("SELECT COUNT(*) AS count FROM runtime_events").get().count;
  db.close();
  const reopened = new PersistentWorldRuntime({ path }); t.after(() => reopened.close());
  assert.deepEqual(reopened.getSnapshot(), expected);
  assert.equal(reopened.getDiagnostics().event_count, eventCount);
});

test("legacy unproven Codex artifact and validation facts do not perpetuate old rewards", () => {
  const events = sequence("legacy").map(event => ({ ...event, source: { adapter_id: "codex-cli", adapter_version: "0.1.0" } }));
  const result = projectWorld(events);
  assert.equal(result.progressions[0].loot_refs.length, 0);
  assert.equal(result.world.workshop.state, "LOCKED");
  assert.notEqual(result.quests[0].outcome_confidence, "VERIFIED");
});
