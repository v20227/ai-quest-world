import assert from "node:assert/strict";
import test from "node:test";

import { buildDemoSnapshot, createWorldWebServer } from "../../apps/world-web/server.mjs";

test("canonical demo snapshot exposes an authoritative completed world", () => {
  const snapshot = buildDemoSnapshot();

  assert.equal(snapshot.quests.length, 1);
  assert.equal(snapshot.progressions.length, 1);
  assert.equal(snapshot.world.gate.state, "RETURNING");
  assert.equal(snapshot.world.guild.state, "RESTORED");
  assert.equal(snapshot.world.workshop.state, "IDLE");
  assert.equal(snapshot.world.library.state, "IDLE");
  assert.equal(snapshot.world.progression_totals.qualifying_quest_count, 1);
  assert.equal(snapshot.world.progression_totals.artifact_count, 1);
  assert.equal(snapshot.progressions[0].outcome_confidence, "VERIFIED");
  assert.equal(snapshot.progressions[0].loot_refs.length, 1);
});

test("unverified demo snapshot keeps progression and unlocks conservative", () => {
  const snapshot = buildDemoSnapshot({ mode: "unverified" });

  assert.equal(snapshot.quests.length, 1);
  assert.equal(snapshot.quests[0].outcome_confidence, "UNVERIFIED");
  assert.equal(snapshot.progressions[0].resolution, "RESOLVED");
  assert.equal(snapshot.progressions[0].skill_xp, 6);
  assert.equal(snapshot.progressions[0].loot_refs.length, 0);
  assert.equal(snapshot.world.guild.state, "OLD");
  assert.equal(snapshot.world.workshop.state, "LOCKED");
  assert.equal(snapshot.world.library.state, "LOCKED");
  assert.deepEqual(
    snapshot.world.return_highlights.map((highlight) => highlight.kind),
    ["quest_completed"]
  );
});

test("world web serves the read model and static presentation", async (t) => {
  const server = createWorldWebServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const address = server.address();
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const apiResponse = await fetch(`${origin}/api/demo`);
  assert.equal(apiResponse.status, 200);
  assert.match(apiResponse.headers.get("content-type"), /application\/json/);
  const apiSnapshot = await apiResponse.json();
  assert.equal(apiSnapshot.world.world_version, "0.1");
  assert.equal(apiSnapshot.quests[0].status, "COMPLETED");

  const unverifiedResponse = await fetch(`${origin}/api/demo?mode=unverified`);
  assert.equal(unverifiedResponse.status, 200);
  const unverifiedSnapshot = await unverifiedResponse.json();
  assert.equal(unverifiedSnapshot.quests[0].outcome_confidence, "UNVERIFIED");

  const invalidModeResponse = await fetch(`${origin}/api/demo?mode=unknown`);
  assert.equal(invalidModeResponse.status, 400);
  assert.deepEqual(await invalidModeResponse.json(), {
    error: "mode must be canonical or unverified"
  });

  const pageResponse = await fetch(`${origin}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /class="world-scene"/);

  const scriptResponse = await fetch(`${origin}/app.mjs`);
  assert.equal(scriptResponse.status, 200);
  assert.match(await scriptResponse.text(), /loadSnapshot/);

  const missingResponse = await fetch(`${origin}/missing`);
  assert.equal(missingResponse.status, 404);

  const methodResponse = await fetch(`${origin}/api/demo`, { method: "POST" });
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("allow"), "GET");
});
