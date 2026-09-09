import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexCliHarnessAdapter } from "../../adapters/codex-cli/index.mjs";
import { identifyValidation } from "../../adapters/codex-cli/validation-command.mjs";
import { classifyOutcome } from "../../core/game/outcome-policy.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";

const command = (id, command, exit_code = 0, output = "# tests 1\n# pass 1\n# fail 0") => ({ type: "item.completed", item: { id, type: "command_execution", command, exit_code, status: "completed", aggregated_output: output } });
const change = (id, path, status = "completed") => ({ type: "item.completed", item: { id, type: "file_change", status, changes: [{ path, kind: "add" }] } });

async function collect(items, options = {}) {
  const events = [];
  const adapter = new CodexCliHarnessAdapter({
    prompt: "Observe fixture", runId: "trusted-run", ...options,
    spawnProcess: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stderr = new PassThrough();
      queueMicrotask(() => {
        for (const row of [{ type: "thread.started", thread_id: "trusted-thread" }, ...items, { type: "turn.completed" }]) child.stdout.write(`${JSON.stringify(row)}\n`);
        child.stdout.end(); child.emit("close", 0, null);
      });
      return child;
    }
  });
  await adapter.start({ emit: async event => events.push(event) });
  return events;
}

function project(events) {
  const semantic = analyzeRuntimeEvents(events);
  const engine = new QuestEngine(); engine.process(events, semantic.records);
  const quest = engine.getQuests()[0];
  return { quest, progression: calculateProgression(quest, semantic.records) };
}

test("ordinary commands and shell tricks cannot assert successful validation", async () => {
  for (const source of ["echo test", "cat package.json", "git diff --check", "echo npm test", "node --test || true", "node --test; echo success", "node --test --help", "node --test -e console.log(1)", "tsc --noEmit -v", "eslint --print-config src/index.js"]) {
    const events = await collect([command("c", source)]);
    assert.equal(events.some(event => event.type.startsWith("validation.")), false, source);
  }
  assert.equal((await identifyValidation("/bin/zsh -lc 'node --test'", process.cwd())).kind, "test");
});

test("empty lifecycle earns no XP, domain progress, or loot", async () => {
  const { progression } = project(await collect([]));
  assert.equal(progression.skill_xp, 0);
  assert.ok(Object.values(progression.domain_progress).every(value => value === 0));
  assert.deepEqual(progression.loot_refs, []);
});

test("failed, missing, hidden and out-of-root files do not produce loot", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "quest-trust-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "result.mjs"), "export const result = 1;\n");
  await writeFile(join(cwd, ".env"), "FAKE_SECRET=test\n");
  await symlink(process.execPath, join(cwd, "external.mjs"));
  for (const item of [change("f", "result.mjs", "failed"), change("f", "missing.mjs"), change("f", ".env"), change("f", "external.mjs")]) {
    const events = await collect([item, command("c", "echo test")], { cwd, artifactPaths: true });
    assert.equal(events.some(event => event.type.startsWith("artifact.")), false);
    assert.notEqual(project(events).quest.outcome_confidence, "VERIFIED");
  }
});

test("real opt-in artifact is stable across item updates and duplicate native items", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "quest-artifact-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "result.mjs"), "export const result = 1;\n");
  const f = change("f", "result.mjs");
  const events = await collect([f, f, change("f2", "result.mjs"), command("c", "node --test")], { cwd, artifactPaths: true });
  assert.equal(new Set(events.map(event => event.event_id)).size, events.length);
  const { quest, progression } = project(events);
  assert.equal(quest.outcome_confidence, "VERIFIED");
  assert.equal(progression.loot_refs.length, 1);
  assert.match(progression.loot_refs[0].uri_or_path, /^file:/);
});

test("zero tests or missing execution result is not a successful validation", async () => {
  for (const output of ["", "# tests 0\n# pass 0\n# fail 0"]) {
    const events = await collect([command("c", "node --test", 0, output)]);
    assert.equal(events.find(event => event.type === "validation.completed").status, "unknown");
    assert.notEqual(project(events).quest.outcome_confidence, "VERIFIED");
  }
});

test("npm script names alone are not validation evidence", async t => {
  const cwd = await mkdtemp(join(tmpdir(), "quest-script-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "echo test" } }));
  assert.equal(await identifyValidation("npm test", cwd), null);
  await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  assert.equal((await identifyValidation("npm test", cwd)).kind, "test");
});

test("later failed validation overrides an earlier pass without completion rewards", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const failure = structuredClone(full.find(event => event.type === "validation.completed"));
  failure.event_id = "later-failure";
  failure.timestamp = new Date(Date.parse(full.at(-1).timestamp) - 1).toISOString();
  const events = [...full.slice(0, -1), failure, full.at(-1)];
  const { quest, progression } = project(events);
  assert.equal(quest.outcome_confidence, "FAILED");
  assert.equal(quest.status, "FAILED");
  assert.equal(progression.semantic_credit.outcome_bonus, 0);
  assert.deepEqual(progression.loot_refs, []);
});

test("a different successful target does not clear unresolved validation failure", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const validations = full.filter(event => event.type === "validation.completed");
  validations[0].attributes.target = "suite-a";
  validations[1].attributes.target = "suite-b";
  assert.equal(classifyOutcome(full).confidence, "FAILED");
});

test("a change after a passing check requires fresh validation", () => {
  const full = createSimulatedRunSequence({ includeChildRun: false });
  const changed = structuredClone(full.find(event => event.type === "resource.changed"));
  changed.event_id = "post-validation-change";
  changed.timestamp = new Date(Date.parse(full.at(-1).timestamp) - 1).toISOString();
  assert.equal(classifyOutcome([...full.slice(0, -1), changed, full.at(-1)]).confidence, "SUPPORTED");
});

test("pending or unknown validation cannot reuse an older pass or clear a failure", () => {
  for (const scenario of ["started", "unknown", "failed-unknown"]) {
    const full = createSimulatedRunSequence({ includeChildRun: false });
    const extra = structuredClone(full.findLast(event => event.type === "validation.completed"));
    extra.event_id = `unresolved-${scenario}`;
    extra.timestamp = new Date(Date.parse(full.at(-1).timestamp) - 1).toISOString();
    extra.attributes = { kind: "test", ...(scenario === "started" ? {} : { target: "other" }) };
    extra.type = scenario === "started" ? "validation.started" : "validation.completed";
    extra.status = scenario === "started" ? "started" : "unknown";
    const events = full.slice(0, -1);
    if (scenario === "failed-unknown") events.push({ ...extra, event_id: "unresolved-failed", timestamp: new Date(Date.parse(extra.timestamp) - 1).toISOString(), status: "failed" });
    events.push(extra, full.at(-1));
    assert.equal(classifyOutcome(events).confidence, scenario === "failed-unknown" ? "FAILED" : "SUPPORTED");
  }
});
