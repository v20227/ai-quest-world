import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { SqliteQuestStore } from "../../storage/sqlite/quest-store.mjs";

async function createDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), "ai-quest-world-read-model-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return join(directory, "read-model.sqlite");
}

function buildReadModels() {
  const events = createSimulatedRunSequence({ includeChildRun: true });
  const analysis = analyzeRuntimeEvents(events);
  const fullEngine = new QuestEngine();
  fullEngine.process(events, analysis.records);
  const completedQuest = fullEngine.getQuests()[0];
  assert.ok(completedQuest);

  const candidateEngine = new QuestEngine();
  candidateEngine.process([events[0]], analysis.records);
  const candidateQuest = candidateEngine.getQuests()[0];
  assert.ok(candidateQuest);

  return {
    candidateQuest,
    completedQuest,
    pendingProgression: calculateProgression(
      candidateQuest,
      analysis.records.filter((record) => record.source_event_id === events[0].event_id)
    ),
    completedProgression: calculateProgression(completedQuest, analysis.records)
  };
}

test("Quest and progression read models update monotonically and remain replay-safe", async (t) => {
  const path = await createDatabase(t);
  const models = buildReadModels();
  const store = new SqliteQuestStore({ path });

  assert.equal(store.saveQuest(models.candidateQuest).saved, true);
  assert.equal(store.saveProgression(models.pendingProgression).saved, true);
  assert.equal(store.saveQuest(models.completedQuest).saved, true);
  assert.equal(store.saveProgression(models.completedProgression).saved, true);

  assert.equal(store.saveQuest(models.candidateQuest).saved, false);
  assert.equal(store.saveProgression(models.pendingProgression).saved, false);
  assert.equal(store.saveQuest(models.completedQuest).saved, false);
  assert.equal(store.saveProgression(models.completedProgression).saved, false);
  assert.equal(store.countQuests(), 1);
  assert.equal(store.countProgressions(), 1);
  assert.deepEqual(store.getQuest(models.completedQuest.quest_id), models.completedQuest);
  assert.deepEqual(
    store.getProgression(models.completedProgression.quest_id),
    models.completedProgression
  );
  assert.deepEqual(store.listQuests(), [models.completedQuest]);
  assert.deepEqual(store.listProgressions(), [models.completedProgression]);
  store.close();

  const reopened = new SqliteQuestStore({ path });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getQuest(models.completedQuest.quest_id), models.completedQuest);
  assert.deepEqual(
    reopened.getProgression(models.completedProgression.quest_id),
    models.completedProgression
  );
  assert.equal(reopened.countQuests(), 1);
  assert.equal(reopened.countProgressions(), 1);
});

test("pending progression can be replaced by resolved progression but never the reverse", async (t) => {
  const path = await createDatabase(t);
  const models = buildReadModels();
  const store = new SqliteQuestStore({ path });

  store.saveProgression(models.completedProgression);
  const result = store.saveProgression(models.pendingProgression);
  assert.equal(result.saved, false);
  assert.equal(result.progression.resolution, "RESOLVED");
  assert.equal(store.getProgression(models.completedProgression.quest_id).resolution, "RESOLVED");
  store.close();
});
