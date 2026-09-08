import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDemoSnapshot, createWorldWebServer } from "../../apps/world-web/server.mjs";
import { guildSceneModel, desktopGuildModel } from "../../apps/world-web/guild-scene.mjs";

test("desktop selection preserves historical Quest and actual run identities", () => {
  const snapshot = buildDemoSnapshot();
  const historical = structuredClone(snapshot.quests[0]);
  historical.quest_id = "historical";
  historical.title = "Historical delivery";
  snapshot.quests.push(historical);
  assert.equal(guildSceneModel(snapshot, "historical").title, "Historical delivery");
  const model = desktopGuildModel(snapshot, "historical");
  assert.equal(model.selectedId, "historical");
  assert.deepEqual(model.runs.slice(0, snapshot.quests[0].run_ids.length).map(run => run.id), snapshot.quests[0].run_ids);
  assert.equal(model.domains.length, 6);
  for (const domain of model.domains) assert.equal(domain.value, snapshot.world.progression_totals.domain_progress[domain.name]);
});

test("desktop models do not infer unknown run outcome or parent edges", () => {
  const snapshot = buildDemoSnapshot();
  snapshot.world.active_run_ids = [snapshot.quests[0].run_ids[0]];
  const model = desktopGuildModel(snapshot);
  assert.equal(model.runs.find(run => run.id === snapshot.world.active_run_ids[0]).status, "Active");
  assert.ok(model.runs.some(run => run.relationship.includes("parent unavailable")));
  assert.ok(model.runs.filter(run => !snapshot.world.active_run_ids.includes(run.id)).every(run => run.status === "Not active · outcome in Quest"));
});

test("empty desktop world has no fabricated roster, growth or artifacts", () => {
  const model = desktopGuildModel({world:{},quests:[],progressions:[]});
  assert.equal(model.selectedId,null);
  assert.deepEqual(model.runs,[]);
  assert.deepEqual(model.artifacts,[]);
  assert.ok(model.domains.every(domain=>domain.value===0));
});

test("guild scene uses authoritative rewards and leaves its snapshot unchanged", () => {
  const snapshot = buildDemoSnapshot();
  const before = structuredClone(snapshot);
  const model = guildSceneModel(snapshot);
  assert.equal(model.title, snapshot.quests[0].title);
  assert.equal(model.facts[1][1], `${snapshot.progressions[0].skill_xp} XP`);
  assert.equal(model.entries.length, 1);
  assert.deepEqual(snapshot, before);
});

test("guild scene preserves empty and unverified states without fabricating loot", () => {
  const empty = guildSceneModel({ quests: [], progressions: [], world: {} });
  assert.equal(empty.questId, null);
  assert.deepEqual(empty.facts, []);
  const model = guildSceneModel(buildDemoSnapshot({ mode: "unverified" }));
  assert.equal(model.facts[0][1], "Unverified");
  assert.equal(model.facts[2][1], "0");
});

test("guild scene chooses active work over a later completed record", () => {
  const snapshot = buildDemoSnapshot();
  const active = structuredClone(snapshot.quests[0]);
  Object.assign(active, { quest_id: "active", status: "ACTIVE", phase: "ACT", outcome_confidence: null });
  snapshot.quests.push(active);
  const model = guildSceneModel(snapshot);
  assert.equal(model.questId, "active");
  assert.equal(model.facts[1][1], "Not settled");
});

test("root serves raster guild assets and a separate display-only scene module", async t => {
  const server = createWorldWebServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(origin)).text();
  assert.match(html, /hall-environment/);
  assert.doesNotMatch(html, /<svg|pixel-building|library-sprite|mountain-front/);
  for (const path of ["/guild-scene.mjs", "/assets/pixel/guild/hall-interior.png", "/assets/pixel/guild/archivist.png"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
  }
  const image = await readFile(new URL("../../assets/pixel/guild/archivist.png", import.meta.url));
  assert.equal(image.readUInt8(25), 6, "Character PNG must have an RGBA channel");
});
