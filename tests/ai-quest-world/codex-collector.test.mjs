import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexCliHarnessAdapter } from "../../adapters/codex-cli/index.mjs";
import { collectCodex } from "../../apps/world-web/collect-codex.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";

const input = lines => Readable.from(lines.map(line => `${typeof line === "string" ? line : JSON.stringify(line)}\n`));
const start = [{ type: "thread.started", thread_id: "public-thread" }, { type: "turn.started" }];
const end = { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 20 } };

test("malformed lifecycle and known record shapes cannot grant a completion reward", async () => {
  const check = { type: "item.completed", item: { id: "check", type: "command_execution", command: "node --test", status: "completed", exit_code: 0, aggregated_output: "# tests 1\n# pass 1\n# fail 0" } };
  for (const lines of [
    [start[0], check, end],
    [{ ...start[0], thread_id: " " }, start[1], check, end],
    [...start, { type: "item.completed", item: null }, check, end],
    [...start, { type: "unrelated" }, check, end],
    [end, start[0]],
    [...start, { type: "item.completed", item: { id: "unknown", type: "new_kind" } }, check, end],
    [...start, { type: "item.completed", item: { id: "file", type: "file_change", changes: [null] } }, check, end]
  ]) {
    const runtime = new PersistentWorldRuntime({ path: ":memory:" });
    const snapshot = await runtime.runAdapter(new CodexCliHarnessAdapter({ input: input(lines), runId: "malformed" }));
    assert.equal(snapshot.quests[0].status, "FAILED");
    assert.equal(snapshot.world.progression_totals.qualifying_quest_count, 0);
    assert.equal(snapshot.world.progression_totals.artifact_count, 0);
    assert.equal(snapshot.progressions[0].semantic_credit.outcome_bonus, 0);
    runtime.close();
  }
});

test("passive collector never launches a process and requires a real terminal marker", async () => {
  for (const [lines, terminal] of [[[], "run.failed"], [start, "run.failed"], [[...start, end], "run.completed"], [[...start, "invalid", end], "run.failed"], [[...start, { type: "turn.started" }, end], "run.failed"], [[...start, end, { type: "item.completed", item: {} }], "run.failed"]]) {
    const events = [];
    const adapter = new CodexCliHarnessAdapter({ input: input(lines), runId: "run", spawnProcess: () => { throw new Error("must not spawn"); } });
    assert.equal(await adapter.detect(), true);
    await adapter.start({ emit: async event => events.push(event) });
    assert.equal(events.at(-1).type, terminal);
  }
});

test("public JSONL collection preserves real evidence, privacy and restart/replay identity", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-collector-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "result.md"), "# Result\n");
  const lines = [...start,
    { type: "item.completed", item: { id: "private", type: "reasoning", text: "synthetic-private-text" } },
    { type: "item.completed", item: { id: "file", type: "file_change", status: "completed", changes: [{ path: "result.md", kind: "add" }] } },
    { type: "item.completed", item: { id: "test", type: "command_execution", status: "completed", command: "node --test", exit_code: 0, aggregated_output: "# tests 1\n# pass 1\n# fail 0" } }, end];
  const env = { AI_QUEST_WORLD_CODEX_RUN_ID: "observed-a", AI_QUEST_WORLD_CODEX_CWD: root,
    AI_QUEST_WORLD_ARTIFACT_PATHS: "1", AI_QUEST_WORLD_DB: join(root, "world.sqlite") };
  const first = await collectCodex({ input: input(lines), env });
  assert.equal(first.quests[0].confidence, "VERIFIED");
  assert.equal(first.totals.artifact_count, 1);
  assert.equal(JSON.stringify(first).includes("synthetic-private-text"), false);
  const again = await collectCodex({ input: input(lines), env }); assert.deepEqual(again, first);
  const runtime = new PersistentWorldRuntime({ path: env.AI_QUEST_WORLD_DB });
  assert.equal(runtime.getSnapshot().quests[0].primary_domain, "Planning"); runtime.close();
});

test("collector requires stable execution identity and carries explicit recovery linkage", async () => {
  await assert.rejects(collectCodex({ input: input([]), env: {} }), /unique execution ID/);
  await assert.rejects(collectCodex({ input: input([]), env: { AI_QUEST_WORLD_CODEX_RUN_ID: "r" } }), /project root/);
  const events = [];
  await new CodexCliHarnessAdapter({ input: input([...start, end]), runId: "resume", resumedFromRunId: "original" })
    .start({ emit: async event => events.push(event) });
  assert.equal(events[0].attributes.resumed_from_run_id, "original");
});

test("unknown or unfinished file changes cannot turn an existing file into rewarded evidence", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-file-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "existing.md"), "An existing unchanged file\n");
  for (const status of [undefined, "in_progress", "unknown"]) {
    const item = { id: "file", type: "file_change", changes: [{ path: "existing.md", kind: "add" }], ...(status === undefined ? {} : { status }) };
    const runtime = new PersistentWorldRuntime({ path: ":memory:" });
    const snapshot = await runtime.runAdapter(new CodexCliHarnessAdapter({ input: input([...start, { type: "item.completed", item }, end]), runId: "unknown-file", cwd: root, artifactPaths: true }));
    assert.equal(snapshot.quests[0].status, "FAILED");
    assert.equal(snapshot.quests[0].artifact_refs.length, 0);
    assert.equal(snapshot.world.progression_totals.skill_xp, 0);
    assert.equal(snapshot.world.progression_totals.qualifying_quest_count, 0);
    assert.equal(snapshot.world.progression_totals.artifact_count, 0);
    runtime.close();
  }
});
