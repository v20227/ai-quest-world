import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { projectWorld, PROJECTION_POLICY_VERSION } from "../../apps/world-web/project-world.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";
import { buildDemoSnapshot } from "../../apps/world-web/server.mjs";
import { SqliteEventStore } from "../../storage/sqlite/index.mjs";
import { SqliteProjectionStore } from "../../storage/sqlite/projection-store.mjs";

const withoutExpedition = value => JSON.parse(JSON.stringify(value, (key, child) => key === "expedition" ? undefined : child));

test("old-policy SQLite adds expedition on reopen without changing settlement, source history or return identity", async t => {
  const dir = await mkdtemp(join(tmpdir(), "expedition-migration-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "world.sqlite");
  const events = createSimulatedRunSequence();
  const eventStore = new SqliteEventStore({ path }); eventStore.appendMany(events);
  const originalEvents = eventStore.list(); eventStore.close();
  const current = projectWorld(events);
  const legacy = withoutExpedition(current); legacy.policyVersion = "trusted-loop-2";
  const store = new SqliteProjectionStore({ path }); store.replace(legacy); store.close();
  let runtime = new PersistentWorldRuntime({ path });
  const upgraded = runtime.getSnapshot();
  assert.ok(upgraded.quests[0].expedition);
  assert.ok(upgraded.quests[0].settlement_snapshot.expedition);
  assert.ok(upgraded.progressions[0].quest_snapshot.expedition);
  const { world: upgradedWorld, quests: upgradedQuests, progressions: upgradedProgressions } = withoutExpedition(upgraded);
  assert.deepEqual(
    { world: upgradedWorld, quests: upgradedQuests, progressions: upgradedProgressions },
    { world: legacy.world, quests: legacy.quests, progressions: legacy.progressions }
  );
  assert.equal(runtime.ingest(events).insertedCount, 0);
  assert.deepEqual(runtime.getSnapshot(), upgraded);
  runtime.close();
  runtime = new PersistentWorldRuntime({ path });
  assert.deepEqual(runtime.getSnapshot(), upgraded); runtime.close();
  const reopened = new SqliteEventStore({ path }); assert.deepEqual(reopened.list(), originalEvents); reopened.close();
  const projection = new SqliteProjectionStore({ path });
  assert.equal(projection.getMetadata().policy_version, PROJECTION_POLICY_VERSION);
  const invalid = structuredClone(current); invalid.quests[0].expedition.expedition_version = "invalid";
  assert.throws(() => projection.replace(invalid), /expedition/);
  const projectionSnapshot = projection.getSnapshot();
  assert.deepEqual(
    { world: projectionSnapshot.world, quests: projectionSnapshot.quests, progressions: projectionSnapshot.progressions },
    { world: upgraded.world, quests: upgraded.quests, progressions: upgraded.progressions }
  );
  projection.close();
});

test("demo and persistent projections expose identical canonical and unverified expedition models", () => {
  for (const mode of ["canonical", "unverified"]) {
    let events = createSimulatedRunSequence({ includeChildRun: mode === "canonical" });
    if (mode === "unverified") events = events.filter(event => ["run.started", "resource.activity", "resource.changed", "run.completed"].includes(event.type));
    const runtime = new PersistentWorldRuntime({ path: ":memory:" });
    runtime.ingest(events);
    assert.deepEqual(runtime.getSnapshot(), buildDemoSnapshot({ mode }));
    runtime.close();
  }
});
