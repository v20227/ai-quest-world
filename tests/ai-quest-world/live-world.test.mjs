import test from "node:test";
import assert from "node:assert/strict";
import { projectWorld } from "../../apps/world-web/project-world.mjs";
import { worldAtTime } from "../../core/world/world-view.mjs";
import { currentQuest, allArtifacts, artifactKey, unseenReturns } from "../../apps/world-web/view-state.mjs";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";

function run(id, offset = 0) {
  return createSimulatedRunSequence({ includeChildRun: false }).map(event => ({ ...structuredClone(event),
    event_id: `${id}:${event.event_id}`, context: { ...event.context, run_id: id },
    timestamp: new Date(Date.parse(event.timestamp) + offset).toISOString() }));
}

test("late factual artifacts remain visible without extending settled loot or rewards", () => {
  const events = run("a"); const before = projectWorld(events);
  const late = structuredClone(events.find(event => event.type === "artifact.created"));
  late.event_id = "late-artifact"; late.attributes.artifact_id = "second-artifact";
  late.attributes.uri_or_path = "artifacts/second.patch";
  late.timestamp = new Date(Date.parse(events.at(-1).timestamp) + 1000).toISOString();
  const after = projectWorld([...events, late]);
  const artifacts = allArtifacts(after.progressions, after.quests);
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts.find(artifact => artifact.artifact_id === "second-artifact").rewarded, false);
  assert.deepEqual(after.progressions, before.progressions);
  assert.deepEqual(after.world.progression_totals, before.world.progression_totals);
  assert.deepEqual(after.world.return_history, before.world.return_history);
});

test("active task wins over old completion and artifact inventory includes every Quest", () => {
  const a = run("a"); const b = run("b", 100000);
  const active = projectWorld([...a, ...b.slice(0, 3)]);
  assert.equal(currentQuest(active.quests).root_run_id, "b");
  const completed = projectWorld([...a, ...b]);
  assert.equal(currentQuest(completed.quests).root_run_id, "b");
  assert.equal(allArtifacts(completed.progressions).length, 2);
  assert.equal(new Set(allArtifacts(completed.progressions).map(artifactKey)).size, 2);
});

test("every return has a stable identity, matching title and at most three highlights", () => {
  const a = run("a"); const b = run("b", 100000); b[0].attributes.title = "Second goal";
  const snapshot = projectWorld([...a, ...b]);
  const returns = unseenReturns(snapshot.world, new Set());
  assert.equal(returns.length, 2);
  assert.equal(returns[1].title, "Second goal");
  assert.equal(returns[1].quest_id, "quest:b");
  assert.ok(returns.every(entry => entry.highlights.length <= 3));
  assert.equal(unseenReturns(snapshot.world, new Set(returns.map(entry => entry.return_id))).length, 0);
  assert.equal(unseenReturns(snapshot.world, new Set(), returns).length, 0);
  assert.deepEqual(projectWorld([...a, ...b, ...a, ...b]).world.return_history, returns);
});

test("clock-driven view decays idle activity but preserves permanent state and return history", () => {
  const result = projectWorld(run("a"));
  const before = structuredClone(result.world);
  const now = new Date(Date.parse(result.world.updated_at) + 3600000).toISOString();
  const view = worldAtTime(result.world, now, result.quests);
  assert.equal(view.gate.state, "CONNECTED");
  assert.equal(view.workshop.state, "IDLE");
  assert.equal(view.activity.workshop.level, 0);
  assert.deepEqual(view.progression_totals, result.world.progression_totals);
  assert.deepEqual(view.return_history, result.world.return_history);
  assert.deepEqual(result.world, before);
  assert.deepEqual(worldAtTime(result.world, now, result.quests), view);
});

test("ongoing work activates unlocked building and Gate without another reward", () => {
  const first = run("a"); const second = run("b", 100000);
  const result = projectWorld([...first, ...second.slice(0, 3)]);
  const view = worldAtTime(result.world, new Date(Date.parse(second[2].timestamp) + 1000).toISOString(), result.quests);
  assert.equal(view.gate.state, "ACTIVE");
  assert.equal(view.workshop.state, "BUSY");
  assert.equal(view.progression_totals.qualifying_quest_count, 1);
});
