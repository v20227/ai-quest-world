import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoSnapshot, createWorldWebServer } from "../../apps/world-web/server.mjs";
import { withGameplay } from "../../apps/world-web/gameplay-snapshot.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { renderExpedition, renderSettlement, renderGoals } from "../../apps/world-web/expedition-view.mjs";

test("explanations preserve settlement values and state without creating new rewards", () => {
  for (const mode of ["canonical", "unverified"]) {
    const original = buildDemoSnapshot({ mode });
    const before = structuredClone(original);
    const { gameplay, ...snapshot } = withGameplay(original);
    assert.deepEqual(original, before);
    assert.deepEqual(snapshot, before);
    const settlement = gameplay.settlements[0], progression = original.progressions[0];
    assert.equal(settlement.activity_xp + settlement.outcome_bonus, progression.skill_xp);
    assert.equal(settlement.total_xp, progression.skill_xp);
    assert.equal(settlement.contributions.reduce((sum, value) => sum + value.xp, 0), settlement.activity_xp);
    assert.deepEqual(settlement.domain_progress, progression.domain_progress);
    assert.deepEqual(settlement.credited_artifact_ids, progression.loot_refs.map(value => value.artifact_id));
    const goals = Object.fromEntries(gameplay.goals.map(goal => [goal.goal_id, goal]));
    assert.equal(goals.gate_connected.achieved, true);
    assert.equal(goals.guild_restored.achieved, mode === "canonical");
    assert.equal(goals.workshop_unlocked.achieved, mode === "canonical");
    assert.equal(goals.library_unlocked.achieved, mode === "canonical");
    assert.equal(goals.first_artifact.achieved, mode === "canonical");
    assert.equal(goals.first_verified_outcome.achieved, mode === "canonical");
    assert.deepEqual(goals.workshop_unlocked.domains, ["Engineering", "Debugging", "Automation"]);
  }
});

test("empty and in-progress snapshots do not imply unlocks or early rewards", () => {
  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  try {
    const empty = withGameplay(runtime.getSnapshot());
    assert.equal(empty.gameplay.goals.every(goal => !goal.achieved), true);
    assert.match(renderSettlement(empty, "absent"), /尚未结算/);
    runtime.ingest(createSimulatedRunSequence().slice(0, 3));
    const active = withGameplay(runtime.getSnapshot());
    assert.equal(active.gameplay.settlements[0].resolution, "PENDING");
    assert.equal(active.gameplay.settlements[0].total_xp, 0);
    assert.match(renderSettlement(active, active.quests[0].quest_id), /不会提前计入永久成长/);
  } finally { runtime.close(); }
});

test("Chinese expedition views render authoritative history, capped settlement and escaped targets", () => {
  const snapshot = withGameplay(buildDemoSnapshot());
  const quest = snapshot.quests[0];
  const markup = renderExpedition(quest);
  assert.match(markup, /验证受阻/); assert.match(markup, /修复与恢复/);
  assert.match(markup, /已有匹配证据解除/); assert.match(markup, /通过 16/);
  assert.ok(markup.indexOf("验证受阻") < markup.indexOf("修复与恢复"));
  assert.match(renderSettlement(snapshot, quest.quest_id), /过程经验/);
  assert.match(renderGoals(snapshot, "workshop"), /工程、调试、自动化/);
  quest.expedition.encounters[0].target = '<img src=x onerror="alert(1)">';
  assert.doesNotMatch(renderExpedition(quest), /<img src=x/);
  assert.match(renderExpedition(quest), /&lt;img/);
});

test("live and demo HTTP publish the same gameplay contract and serve the frontend module", async t => {
  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  runtime.ingest(createSimulatedRunSequence());
  const server = createWorldWebServer({ runtime });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.close(); runtime.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const live = await (await fetch(`${origin}/api/world`)).json();
  const demo = await (await fetch(`${origin}/api/demo`)).json();
  assert.deepEqual(live.gameplay, demo.gameplay);
  assert.equal(live.gameplay.version, "0.1");
  const module = await fetch(`${origin}/expedition-view.mjs`);
  assert.equal(module.status, 200);
  assert.match(await module.text(), /renderExpedition/);
});
