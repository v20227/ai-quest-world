import assert from "node:assert/strict";
import test from "node:test";
import { composeCharacterLayers, resolveCharacterClip } from "../../apps/world-web/scene-assets.mjs";
import { loadCharacterSelection, saveCharacterSelection } from "../../apps/world-web/character-preferences.mjs";
import { createFramePlayer } from "../../apps/world-web/scene-frames.mjs";

test("character preferences accept only available default layers and survive storage failures", () => {
  const data = new Map();
  const storage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) };
  const saved = saveCharacterSelection(storage, { body: "agent.archivist", apparel: "workshop.desk", tool: "toString", effect: "unowned" });
  assert.deepEqual(saved, { saved: true, selection: { body: "agent.archivist" } });
  assert.deepEqual(loadCharacterSelection(storage), saved.selection);
  assert.equal(saveCharacterSelection(null, {}).saved, false);
  assert.deepEqual(loadCharacterSelection({ getItem: () => "{" }), { body: "agent.reader" });
  assert.deepEqual(loadCharacterSelection(null), { body: "agent.reader" });
  assert.equal(composeCharacterLayers(loadCharacterSelection(null))[0].src, "/assets/pixel/guild/reader.png");
  assert.deepEqual(loadCharacterSelection(storage), { body: "agent.archivist" });
  assert.equal(composeCharacterLayers({ body: "workshop.desk" }).length, 0);
});

test("frame clips require compatible available layers and local asset paths", () => {
  const catalog = {
    body: { id: "body", role: "body", clips: { idle: { fps: 4, frames: ["/assets/body-0.png", "/assets/body-1.png"] } } },
    hat: { id: "hat", role: "head", clips: { idle: { fps: 4, frames: ["/assets/hat-0.png", "/assets/hat-1.png"] } } }
  };
  const selection = { body: "body", head: "hat" };
  assert.equal(resolveCharacterClip(selection, "idle", catalog).layers.length, 2);
  catalog.hat.clips.idle.fps = 8;
  assert.equal(resolveCharacterClip(selection, "idle", catalog), null);
  catalog.hat.clips.idle.fps = 4;
  catalog.hat.clips.idle.frames[0] = "https://remote.example/hat.png";
  assert.equal(resolveCharacterClip(selection, "idle", catalog), null);
  assert.equal(resolveCharacterClip({ body: "agent.archivist" }, "idle"), null);
});

test("frame player synchronizes layers, pauses without catching up, resets and restores original images", () => {
  const pending = new Map(); let nextId = 0;
  const view = { requestAnimationFrame: callback => { pending.set(++nextId, callback); return nextId; }, cancelAnimationFrame: id => pending.delete(id) };
  const images = ["body", "hat"].map(id => ({ dataset: { assetId: id }, src: `${id}.png`, getAttribute() { return this.src; }, setAttribute(key, value) { this[key] = value; } }));
  const host = { ownerDocument: { defaultView: view }, querySelectorAll: () => images };
  const clip = { fps: 2, frames: 2, loop: true, layers: images.map(image => ({ id: image.dataset.assetId, clip: { frames: [`${image.src}-0`, `${image.src}-1`] } })) };
  const player = createFramePlayer(host, clip);
  function tick(time) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); }
  assert.deepEqual(images.map(image => image.src), ["body.png-0", "hat.png-0"]);
  player.play(); player.play(); assert.equal(pending.size, 1);
  tick(0); tick(500);
  assert.deepEqual(images.map(image => image.src), ["body.png-1", "hat.png-1"]);
  player.pause(); assert.equal(pending.size, 0);
  player.play(); tick(10000);
  assert.equal(images[0].src, "body.png-1");
  player.reset(); assert.equal(pending.size, 0); assert.equal(images[0].src, "body.png-0");
  player.play(); player.destroy();
  assert.equal(pending.size, 0);
  assert.deepEqual(images.map(image => image.src), ["body.png", "hat.png"]);
  player.play(); assert.equal(pending.size, 0);
});
