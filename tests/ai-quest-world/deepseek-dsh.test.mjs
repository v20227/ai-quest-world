import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDshSession, replayDshSessionFile, DSH_ADAPTER_ID } from "../../adapters/deepseek/dsh-adapter.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";

const PRIVATE_REASONING = "synthetic-dsh-private-reasoning-marker";
const PRIVATE_ASSISTANT = "synthetic-dsh-private-assistant-marker";
const T0 = 1788611594041;

function dshLines({ cwd, resultPath }) {
  let seq = 0;
  const next = () => ++seq;
  return [
    JSON.stringify({ type: "session", version: 0, id: "dsh-sess-1", createdAt: T0, cwd, parentSession: "dsh-parent-0", origin: "subagent", delegationDepth: 1, agentPreset: "liangshen" }),
    JSON.stringify({ type: "session/title", seq: next(), time: T0 + 1000, data: { title: "修复登录校验" } }),
    JSON.stringify({ type: "turn/start", seq: next(), time: T0 + 2000, data: { turn: 1 } }),
    JSON.stringify({ type: "tool/call", seq: 10, time: T0 + 3000, data: { turn: 1, step: 1, callId: "call-w1", name: "write", arguments: JSON.stringify({ path: resultPath }) } }),
    JSON.stringify({ type: "tool/result", seq: 11, time: T0 + 3100, data: { turn: 1, step: 1, message: { role: "tool", content: ["done"] } }, sourceEventSeqs: [10], surfaceOp: "append" }),
    JSON.stringify({ type: "tool/call", seq: 20, time: T0 + 4000, data: { turn: 1, step: 2, callId: "call-b1", name: "bash", arguments: JSON.stringify({ command: "node --test", description: "run tests" }) } }),
    JSON.stringify({ type: "reasoning-chunks", seq: 21, time: T0 + 4100, data: { text: PRIVATE_REASONING } }),
    JSON.stringify({ type: "assistant/chunk", seq: 22, time: T0 + 4200, data: { text: PRIVATE_ASSISTANT } }),
    JSON.stringify({ type: "tool/result", seq: 23, time: T0 + 5000, data: { turn: 1, step: 2, message: { role: "tool", content: ["# tests 2\n# pass 2\n# fail 0"] } }, sourceEventSeqs: [20], surfaceOp: "append" }),
    JSON.stringify({ type: "tool/call", seq: 30, time: T0 + 6000, data: { turn: 1, step: 3, callId: "call-r1", name: "read", arguments: JSON.stringify({ path: join(cwd, "src") }) } }),
    JSON.stringify({ type: "tool/call", seq: 31, time: T0 + 6100, data: { turn: 1, step: 4, callId: "call-r2", name: "grep", arguments: JSON.stringify({ pattern: "auth" }) } }),
    JSON.stringify({ type: "turn/end", seq: 40, time: T0 + 7000, data: { turn: 1, reason: "done" } })
  ];
}

test("dsh session maps metadata facts, lineage and evidence into UARP", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-dsh-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resultPath = join(root, "result.md");
  await writeFile(resultPath, "# Result\n");

  const { meta, events } = await parseDshSession(dshLines({ cwd: root, resultPath }), {
    runId: "dsh-run-1", assumeCompleted: true, artifactPaths: true
  });

  assert.equal(meta.session_id, "dsh-sess-1");
  assert.equal(meta.parent_session, "dsh-parent-0");
  assert.equal(meta.origin, "subagent");
  assert.equal(meta.delegation_depth, 1);
  assert.equal(meta.title, "修复登录校验");
  assert.equal(events[0].type, "run.started");
  assert.equal(events[0].attributes.title, "修复登录校验");
  assert.equal(events[0].attributes.resumed_from_run_id, undefined);

  const types = events.map(event => event.type);
  assert.ok(types.includes("tool.started") && types.includes("tool.completed"));
  const validations = events.filter(event => event.type === "validation.completed").map(event => event.attributes);
  assert.equal(validations.length, 1);
  assert.equal(validations[0].kind, "test");
  assert.equal(validations[0].passed, 2);
  assert.equal(validations[0].failed, 0);
  assert.ok(validations[0].target.startsWith("command:"));
  assert.deepEqual(events.filter(event => event.type === "resource.changed").map(event => event.attributes.change_type), ["created"]);
  assert.ok(types.includes("artifact.created"));
  assert.deepEqual(events.filter(event => event.type === "resource.activity").map(event => event.attributes.read_count), [2]);
  assert.equal(events.at(-1).type, "run.completed");
  assert.ok(events.every(event => event.source.adapter_id === DSH_ADAPTER_ID));
  assert.ok(events.every(event => event.privacy.content_included === false));
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(PRIVATE_REASONING), false);
  assert.equal(serialized.includes(PRIVATE_ASSISTANT), false);
});

test("dsh replay settles a verified quest through the unchanged game core", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-dsh-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resultPath = join(root, "result.md");
  await writeFile(resultPath, "# Result\n");

  const { events } = await parseDshSession(dshLines({ cwd: root, resultPath }), {
    runId: "dsh-run-2", assumeCompleted: true, artifactPaths: true
  });

  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  try {
    const first = runtime.ingest(events);
    assert.equal(first.insertedCount, events.length);
    const quest = first.snapshot.quests[0];
    assert.equal(quest.status, "COMPLETED");
    assert.equal(quest.outcome_confidence, "VERIFIED");
    assert.ok(first.snapshot.economy.gold > 0);

    const again = runtime.ingest(events);
    assert.equal(again.duplicateCount, events.length);
    assert.deepEqual(again.snapshot.quests, first.snapshot.quests);
    assert.deepEqual(again.snapshot.economy, first.snapshot.economy);
  } finally {
    runtime.close();
  }
});

test("a dsh log without a completion marker never settles a quest", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-dsh-truncated-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = dshLines({ cwd: root, resultPath: join(root, "missing.md") }).slice(0, 6);

  const { events } = await parseDshSession(lines, { runId: "dsh-run-3" });
  assert.equal(events.some(event => ["run.completed", "run.failed", "run.cancelled"].includes(event.type)), false);

  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  try {
    const { snapshot } = runtime.ingest(events);
    assert.equal(snapshot.quests.length, 1);
    assert.notEqual(snapshot.quests[0].status, "COMPLETED");
    assert.equal(snapshot.world.progression_totals.qualifying_quest_count, 0);
  } finally {
    runtime.close();
  }
});

test("an explicit dsh continuation carries resumed_from_run_id", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-dsh-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { events } = await parseDshSession(
    dshLines({ cwd: root, resultPath: join(root, "missing.md") }),
    { runId: "dsh-run-4", resumedFromRunId: "dsh:dsh-parent-0" }
  );
  assert.equal(events[0].attributes.resumed_from_run_id, "dsh:dsh-parent-0");
});

test("replayDshSessionFile reads a session log from disk", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-dsh-file-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = join(root, "session.jsonl");
  await writeFile(filePath, `${dshLines({ cwd: root, resultPath: join(root, "missing.md") }).join("\n")}\n`);

  const { meta, events } = await replayDshSessionFile(filePath, { runId: "dsh-run-5" });
  assert.equal(meta.session_id, "dsh-sess-1");
  assert.ok(events.length > 1);
  assert.equal(events.some(event => event.type === "run.started"), true);
});
