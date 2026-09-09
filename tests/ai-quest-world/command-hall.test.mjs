import assert from "node:assert/strict";
import test from "node:test";

import { createWorldWebServer } from "../../apps/world-web/server.mjs";
import { getCommandHallFixture, normalizeCommandHallSnapshot } from "../../apps/world-web/command-hall-fixtures.mjs";

async function withServer(callback) {
  const server = createWorldWebServer({ runtime: null });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("command hall fixture modes normalize into an independent frontend view model", () => {
  const verified = normalizeCommandHallSnapshot(getCommandHallFixture("canonical"));
  const unverified = normalizeCommandHallSnapshot(getCommandHallFixture("unverified"));
  const idle = normalizeCommandHallSnapshot(getCommandHallFixture("idle"));

  assert.equal(verified.demoState.key, "canonical");
  assert.equal(verified.expedition.status, "returning");
  assert.equal(unverified.expedition.status, "unverified");
  assert.equal(unverified.expedition.rewards.at(-1).label, "Return pending");
  assert.equal(idle.roster.length, 0);
  assert.equal(idle.expedition.progress, 0);
  assert.equal(idle.expedition.rewards[0].label, "No active quest");
  assert.ok(verified.collection.every((item) => item.state === "visual preview"));
});

test("command hall static route is available without a persistent backend runtime", async () => {
  await withServer(async (origin) => {
    const [page, stylesheet, module, fixture, image, api, traversal, hidden] = await Promise.all([
      fetch(`${origin}/command-hall.html`),
      fetch(`${origin}/command-hall.css`),
      fetch(`${origin}/command-hall.mjs`),
      fetch(`${origin}/command-hall-fixtures.mjs`),
      fetch(`${origin}/assets/pixel/reward-concepts/signal-camp-world-concept.png`),
      fetch(`${origin}/api/world`),
      fetch(`${origin}/assets/%2e%2e/%2e%2e/package.json`),
      fetch(`${origin}/assets/.DS_Store`)
    ]);
    assert.equal(page.status, 200);
    assert.equal(stylesheet.status, 200);
    assert.equal(module.status, 200);
    assert.equal(fixture.status, 200);
    assert.equal(image.status, 200);
    assert.equal(api.status, 503);
    assert.equal(traversal.status, 404);
    assert.equal(hidden.status, 404);
    const pageBody = await page.text();
    assert.match(pageBody, /command-hall\.mjs/);
    assert.doesNotMatch(pageBody, /api\/world/);
    assert.match(stylesheet.headers.get("content-type"), /text\/css/);
    assert.match(image.headers.get("content-type"), /image\/png/);
  });
});
