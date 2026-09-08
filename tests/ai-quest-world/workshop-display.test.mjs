import assert from "node:assert/strict";
import test from "node:test";
import { createWorkshopDisplay, readDisplaySelection, workshopDisplayModel } from "../../apps/world-web/workshop-display.mjs";
import { artifactKey } from "../../apps/world-web/view-state.mjs";

function fixture() {
  const listeners = new Map();
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const doc = { defaultView: { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) }, createElement: tag => new Element(tag) };
  class Element {
    constructor(tag) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.dataset = {}; this.handlers = new Map(); this.value = ""; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; if (this.tag === "select") this.value = children[0]?.value ?? ""; }
    get options() { return this.children; }
    setAttribute() {}
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    click() { if (!this.disabled) this.handlers.get("click")?.(); }
    focus() { doc.activeElement = this; }
  }
  const host = doc.createElement("section");
  const changed = [], opened = [];
  const display = createWorkshopDisplay(host, { storage, onDisplayChange: value => changed.push(value), openArtifact: key => opened.push(key) });
  const [, status, view, picker, actions] = host.children;
  const [save, clear] = actions.children;
  return { display, storage, listeners, host, changed, opened, status, view, picker, save, clear, doc };
}

function snapshot(namespace = "world-a") {
  const artifact = (id, kind = "code") => ({ artifact_id: id, kind, name: "same-name.mjs", durable: true, uri_or_path: `${id}.mjs` });
  return { display_namespace: namespace, world: { workshop: { state: "IDLE" }, activity: {} }, progressions: [], quests: [
    { quest_id: "quest-a", artifact_refs: [artifact("a"), artifact("doc", "document")] },
    { quest_id: "quest-b", artifact_refs: [artifact("b")] }
  ] };
}

test("display replacement, original identity, cancellation and reload preserve factual artifacts", () => {
  const f = fixture(), world = snapshot(), before = structuredClone(world);
  f.display.update(world, "live");
  assert.equal(f.picker.options.length, 2);
  f.save.click();
  assert.equal(f.changed.at(-1).artifact.artifact_id, "a");
  f.picker.value = f.picker.options[1].value;
  f.display.update(world, "live");
  assert.equal(f.picker.value, f.picker.options[1].value, "poll preserves unsaved choice");
  f.save.click(); f.view.click();
  assert.equal(f.opened.at(-1), artifactKey({ source_quest_id: "quest-b", artifact_id: "b" }));
  assert.deepEqual(readDisplaySelection(f.storage, "world-a"), { version: 1, questId: "quest-b", artifactId: "b" });
  f.display.update(snapshot("world-b"), "live");
  assert.equal(f.changed.at(-1).artifact, null);
  f.display.update(world, "live");
  assert.equal(f.changed.at(-1).artifact.artifact_id, "b");
  f.clear.click();
  assert.equal(f.doc.activeElement, f.save);
  assert.equal(readDisplaySelection(f.storage, "world-a"), null);
  assert.deepEqual(world, before);
});

test("cross-tab cancellation during demo is applied on return to the same world", () => {
  const f = fixture(), world = snapshot();
  f.display.update(world, "live"); f.save.click();
  f.display.update(world, "demo");
  f.storage.removeItem("ai-quest-world-display-v1:world-a");
  f.listeners.get("storage")({ key: "ai-quest-world-display-v1:world-a" });
  f.display.update(world, "live");
  assert.equal(f.changed.at(-1).artifact, null);
  assert.equal(f.clear.disabled, true);
});

test("loading and demo modes cannot write the live selection", () => {
  const f = fixture(), world = snapshot();
  f.display.update(world, "live"); f.save.click();
  const saved = readDisplaySelection(f.storage, "world-a");
  for (const source of ["loading", "demo"]) {
    f.display.update(world, source);
    assert.equal(f.clear.disabled, true); assert.equal(f.save.disabled, true);
    f.clear.click(); f.save.click(); f.view.click();
    assert.deepEqual(readDisplaySelection(f.storage, "world-a"), saved);
    assert.equal(f.changed.at(-1).artifact, null);
  }
  assert.equal(f.opened.length, 0);
  f.display.update(world, "live");
  assert.equal(f.changed.at(-1).artifact.artifact_id, "a");
});

test("missing, locked, empty and denied storage have explicit conservative states", () => {
  const f = fixture(), world = snapshot();
  f.storage.setItem("ai-quest-world-display-v1:world-a", JSON.stringify({ version: 1, questId: "missing", artifactId: "missing" }));
  f.display.update(world, "live");
  assert.match(f.status.textContent, /未找到原成果/);
  assert.equal(f.view.disabled, true);
  f.clear.click();
  world.world.workshop.state = "LOCKED"; f.display.update(world, "live");
  assert.equal(f.save.disabled, true); assert.equal(f.changed.at(-1).artifact, null);
  world.world.workshop.state = "IDLE";
  f.storage.setItem = () => { throw new Error("denied"); };
  f.display.update(world, "live"); f.save.click();
  assert.match(f.status.textContent, /无法保存/);
  assert.equal(f.changed.at(-1).artifact.artifact_id, "a");
  f.display.update(world, "live");
  assert.match(f.status.textContent, /本次页面有效/);
  world.quests = []; f.display.update(world, "live");
  assert.equal(f.save.disabled, true); assert.equal(f.view.disabled, true);
  f.display.destroy();
  assert.equal(f.listeners.has("storage"), false); assert.equal(f.host.children.length, 0);
});

test("malformed preference data never creates ownership", () => {
  for (const value of ["{", "null", "{}", '{"version":2,"questId":"q","artifactId":"a"}', '{"version":1,"questId":7,"artifactId":"a"}']) {
    assert.equal(readDisplaySelection({ getItem: () => value }, "world-a"), null);
  }
  assert.equal(readDisplaySelection({ getItem() { throw new Error("denied"); } }, "world-a"), null);
  assert.equal(workshopDisplayModel(snapshot(), { questId: "unknown", artifactId: "a" }).selected, null);
});
