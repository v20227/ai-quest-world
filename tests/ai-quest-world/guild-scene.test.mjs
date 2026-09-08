import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDemoSnapshot, createWorldWebServer } from "../../apps/world-web/server.mjs";
import { guildSceneModel, desktopGuildModel, displayLabel, returnHighlightLabel } from "../../apps/world-web/guild-scene.mjs";

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
  assert.equal(model.runs.find(run => run.id === snapshot.world.active_run_ids[0]).status, "运行中");
  assert.ok(model.runs.some(run => run.relationship.includes("父级信息未知")));
  assert.ok(model.runs.filter(run => !snapshot.world.active_run_ids.includes(run.id)).every(run => run.status === "当前未运行 · 结果见任务"));
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
  assert.equal(model.facts[1][1], `${snapshot.progressions[0].skill_xp} 经验`);
  assert.equal(model.entries.length, 1);
  assert.deepEqual(snapshot, before);
});

test("guild scene preserves empty and unverified states without fabricating loot", () => {
  const empty = guildSceneModel({ quests: [], progressions: [], world: {} });
  assert.equal(empty.questId, null);
  assert.deepEqual(empty.facts, []);
  const model = guildSceneModel(buildDemoSnapshot({ mode: "unverified" }));
  assert.equal(model.facts[0][1], "未验证");
  assert.equal(model.facts[2][1], "0");
});

test("guild scene chooses active work over a later completed record", () => {
  const snapshot = buildDemoSnapshot();
  const active = structuredClone(snapshot.quests[0]);
  Object.assign(active, { quest_id: "active", status: "ACTIVE", phase: "ACT", outcome_confidence: null });
  snapshot.quests.push(active);
  const model = guildSceneModel(snapshot);
  assert.equal(model.questId, "active");
  assert.equal(model.facts[1][1], "尚未结算");
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

test("Chinese presentation covers states and preserves user text and domain identities", () => {
  for (const key of ["DEPART", "EXPLORE", "ACT", "VALIDATE", "RECOVER", "DELIVER", "RETURN", "CANDIDATE", "ACTIVE", "VALIDATING", "COMPLETED", "FAILED", "CANCELLED", "VERIFIED", "SUPPORTED", "UNVERIFIED", "LOCKED", "DORMANT", "RESTORED", "IDLE", "BUSY", "CONNECTED", "RETURNING", "first_qualifying_completion", "first_artifact", "first_verified_outcome"]) {
    assert.match(displayLabel(key), /[\u4e00-\u9fff]/, key);
  }
  assert.equal(displayLabel("Engineering"), "工程");
  assert.equal(displayLabel("Custom Name.md"), "Custom Name.md");
  assert.equal(returnHighlightLabel({kind:"building_unlocked",target:"workshop"}), "工坊已解锁");
  assert.equal(returnHighlightLabel({kind:"artifact_received",label:"README.md"}), "README.md");
  assert.equal(returnHighlightLabel({kind:"quest_failed",label:"Build App failed"}), "Build App · 失败");
  const snapshot = buildDemoSnapshot();
  assert.equal(desktopGuildModel(snapshot).domains[2].name, "Engineering");
  assert.match(guildSceneModel(snapshot).domain, /归来/);
});

test("root language and accessible controls are Chinese", async () => {
  const html = await readFile(new URL("../../apps/world-web/index.html", import.meta.url), "utf8");
  assert.match(html, /lang="zh-CN"/);
  for (const text of ["选择任务", "关闭详情面板", "打开设置", "查看全部", "任务档案", "领域成长"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Connecting|Choose Quest|View all|Close context panel/);
});
