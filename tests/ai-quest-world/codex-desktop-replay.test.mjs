import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRolloutSession, replayRolloutFile, CODEX_DESKTOP_ADAPTER_ID } from "../../adapters/codex-desktop/replay-session.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";

const PRIVATE_REASONING = "synthetic-private-reasoning-marker";
const PRIVATE_AGENT_MESSAGE = "synthetic-private-agent-message-marker";
const PRIVATE_DIFF = "synthetic-private-diff-marker";

function rolloutLines({ cwd, resultPath }) {
  return [
    JSON.stringify({
      timestamp: "2026-09-08T18:00:00.000Z", ordinal: 1, type: "session_meta",
      payload: {
        session_id: "sess-1234", id: "sess-1234", forked_from_id: "sess-0000",
        forked_from_ordinal_exclusive: 0, timestamp: "2026-09-08T18:00:00.000Z",
        cwd, originator: "Codex Desktop", cli_version: "0.153.4",
        source: "vscode", thread_source: "user"
      }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:01.000Z", ordinal: 2, type: "event_msg",
      payload: { type: "task_started", turn_id: "turn-1", started_at: 1 }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:02.000Z", ordinal: 3, type: "event_msg",
      payload: { type: "item_completed", item: { id: "item-file", type: "FileChange", changes: { [resultPath]: { type: "add", unified_diff: PRIVATE_DIFF } } } }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:03.000Z", ordinal: 4, type: "event_msg",
      payload: { type: "item_started", item: { id: "item-cmd", type: "CommandExecution", command: ["/bin/zsh", "-lc", "node --test"], cwd, status: "in_progress" } }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:04.000Z", ordinal: 5, type: "event_msg",
      payload: { type: "item_completed", item: { id: "item-cmd", type: "CommandExecution", command: ["/bin/zsh", "-lc", "node --test"], cwd, status: "completed", exit_code: 0, aggregated_output: "# tests 2\n# pass 2\n# fail 0" } }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:05.000Z", ordinal: 6, type: "event_msg",
      payload: { type: "item_completed", item: { id: "item-reason", type: "Reasoning", text: PRIVATE_REASONING } }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:06.000Z", ordinal: 7, type: "event_msg",
      payload: { type: "item_completed", item: { id: "item-agent", type: "AgentMessage", text: PRIVATE_AGENT_MESSAGE } }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:07.000Z", ordinal: 8, type: "response_item",
      payload: { type: "custom_tool_call", id: "call-1", call_id: "call-1", name: "browser", status: "completed" }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:08.000Z", ordinal: 9, type: "token_usage_record",
      payload: { input_tokens: 100, output_tokens: 200, total_tokens: 300 }
    }),
    JSON.stringify({
      timestamp: "2026-09-08T18:00:09.000Z", ordinal: 10, type: "event_msg",
      payload: { type: "task_complete", turn_id: "turn-1", last_agent_message: PRIVATE_AGENT_MESSAGE }
    })
  ];
}

test("desktop rollout replay maps metadata facts, lineage and evidence into UARP", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-desktop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resultPath = join(root, "result.md");
  await writeFile(resultPath, "# Result\n");

  const { meta, events } = await parseRolloutSession(rolloutLines({ cwd: root, resultPath }), {
    runId: "desktop-run-1", title: "Synthetic desktop session",
    assumeCompleted: true, artifactPaths: true
  });

  assert.equal(meta.session_id, "sess-1234");
  assert.equal(meta.forked_from_id, "sess-0000");
  assert.equal(meta.originator, "Codex Desktop");
  assert.equal(events[0].type, "run.started");
  assert.equal(events[0].attributes.resumed_from_run_id, undefined);
  assert.equal(events[0].attributes.title, "Synthetic desktop session");

  const types = events.map(event => event.type);
  assert.ok(types.includes("tool.started") && types.includes("tool.completed"));
  const validations = events.filter(event => event.type === "validation.completed").map(event => event.attributes);
  assert.equal(validations.length, 1);
  assert.equal(validations[0].kind, "test");
  assert.equal(validations[0].passed, 2);
  assert.equal(validations[0].failed, 0);
  assert.equal(validations[0].total, 2);
  assert.ok(validations[0].target.startsWith("command:"));
  assert.deepEqual(events.filter(event => event.type === "resource.changed").map(event => event.attributes.change_type), ["created"]);
  assert.ok(types.includes("artifact.created"));
  assert.ok(types.includes("usage.reported"));
  assert.equal(events.at(-1).type, "run.completed");
  assert.ok(events.every(event => event.source.adapter_id === CODEX_DESKTOP_ADAPTER_ID));
  assert.ok(events.every(event => event.privacy.content_included === false));
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes(PRIVATE_REASONING), false);
  assert.equal(serialized.includes(PRIVATE_AGENT_MESSAGE), false);
  assert.equal(serialized.includes(PRIVATE_DIFF), false);
});

test("desktop replay settles a verified quest in the persistent runtime and replays idempotently", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-desktop-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resultPath = join(root, "result.md");
  await writeFile(resultPath, "# Result\n");

  const { events } = await parseRolloutSession(rolloutLines({ cwd: root, resultPath }), {
    runId: "desktop-run-2", assumeCompleted: true, artifactPaths: true
  });

  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  try {
    const first = runtime.ingest(events);
    assert.equal(first.insertedCount, events.length);
    const quest = first.snapshot.quests[0];
    assert.equal(quest.status, "COMPLETED");
    assert.equal(quest.outcome_confidence, "VERIFIED");

    const again = runtime.ingest(events);
    assert.equal(again.duplicateCount, events.length);
    assert.deepEqual(again.snapshot.quests, first.snapshot.quests);
    assert.deepEqual(again.snapshot.world.progression_totals, first.snapshot.world.progression_totals);
  } finally {
    runtime.close();
  }
});

test("a truncated desktop rollout without a completion marker never settles a quest", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-desktop-truncated-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lines = rolloutLines({ cwd: root, resultPath: join(root, "missing.md") }).slice(0, 6);

  const { events } = await parseRolloutSession(lines, { runId: "desktop-run-3" });
  assert.equal(events.some(event => event.type.startsWith("run.")), true);
  assert.equal(events.some(event => ["run.completed", "run.failed", "run.cancelled"].includes(event.type)), false);

  const runtime = new PersistentWorldRuntime({ path: ":memory:" });
  try {
    const { snapshot } = runtime.ingest(events);
    assert.equal(snapshot.quests.length, 1);
    assert.notEqual(snapshot.quests[0].status, "COMPLETED");
    assert.equal(snapshot.quests[0].outcome_confidence ?? null, null);
    assert.equal(snapshot.world.progression_totals.qualifying_quest_count, 0);
  } finally {
    runtime.close();
  }
});

test("replayRolloutFile reads a rollout file from disk", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-desktop-file-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = join(root, "rollout-2026-09-08T18-00-00-sess-1234.jsonl");
  await writeFile(filePath, `${rolloutLines({ cwd: root, resultPath: join(root, "missing.md") }).join("\n")}\n`);

  const { meta, events } = await replayRolloutFile(filePath, { runId: "desktop-run-4" });
  assert.equal(meta.session_id, "sess-1234");
  assert.ok(events.length > 1);
  assert.equal(events.some(event => event.type === "run.started"), true);
});

test("an explicit continuation carries resumed_from_run_id and shares a bounded settlement", async t => {
  const root = await mkdtemp(join(tmpdir(), "ai-quest-world-desktop-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { events } = await parseRolloutSession(
    rolloutLines({ cwd: root, resultPath: join(root, "missing.md") }),
    { runId: "desktop-run-5", resumedFromRunId: "codex-desktop:original-run" }
  );
  assert.equal(events[0].attributes.resumed_from_run_id, "codex-desktop:original-run");
});
