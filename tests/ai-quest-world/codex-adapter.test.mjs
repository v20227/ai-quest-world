import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";

import {
  CODEX_CLI_ADAPTER_ID,
  CodexCliHarnessAdapter
} from "../../adapters/codex-cli/index.mjs";
import { PersistentWorldRuntime } from "../../apps/world-web/world-runtime.mjs";
import { assertHarnessAdapter, getValidatedCapabilities } from "../../packages/adapter-core/contracts.mjs";
import { validateRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";

function fakeSpawn(lines, { exitCode = 0 } = {}) {
  return (_executable, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.args = args;
    child.kill = () => {
      child.stdout.end();
      queueMicrotask(() => child.emit("close", null, "SIGTERM"));
    };
    queueMicrotask(() => {
      for (const line of lines) {
        child.stdout.write(`${typeof line === "string" ? line : JSON.stringify(line)}\n`);
      }
      child.stdout.end();
      child.emit("close", exitCode, null);
    });
    return child;
  };
}

function collectingObserver() {
  const events = [];
  return {
    events,
    async emit(event) {
      validateRuntimeEvent(event);
      events.push(event);
    }
  };
}

const fixedClock = (() => {
  let tick = 0;
  return () => new Date(Date.parse("2026-09-08T12:00:00.000Z") + tick++).toISOString();
})();

test("Codex CLI adapter declares honest capabilities and maps public JSONL facts", async () => {
  const lines = [
    { type: "thread.started", thread_id: "thread-codex-001" },
    { type: "turn.started" },
    { type: "item.started", item: { id: "item-command", type: "command_execution", status: "in_progress", command: "node --test" } },
    { type: "item.completed", item: { id: "item-command", type: "command_execution", status: "completed", exit_code: 0, command: "node --test", aggregated_output: "# tests 1\n# pass 1\n# fail 0" } },
    { type: "item.completed", item: { id: "item-reasoning", type: "reasoning", summary: "private reasoning must not cross the adapter" } },
    { type: "item.completed", item: { id: "item-message", type: "agent_message", text: "visible response is not runtime metadata" } },
    { type: "item.completed", item: { id: "item-file", type: "file_change", status: "completed", changes: [{ path: "/workspace/src/AuthService.js", kind: "add" }] } },
    { type: "turn.completed", usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }
  ];
  const adapter = new CodexCliHarnessAdapter({
    prompt: "Inspect the project",
    title: "Inspect the project",
    runId: "run-codex-001",
    cwd: "/workspace",
    clock: fixedClock,
    spawnProcess: fakeSpawn(lines)
  });
  const observer = collectingObserver();

  assert.doesNotThrow(() => assertHarnessAdapter(adapter));
  const capabilities = await getValidatedCapabilities(adapter);
  assert.equal(capabilities.adapter_id, CODEX_CLI_ADAPTER_ID);
  assert.equal(capabilities.observe.tool_calls, true);
  assert.equal(capabilities.observe.validation, true);
  assert.equal(capabilities.observe.artifacts, false);
  assert.equal(capabilities.observe.outcome_evidence, true);
  assert.equal(capabilities.observe.usage_tokens, true);
  assert.equal(capabilities.content.tool_arguments, false);
  assert.equal(capabilities.content.artifact_paths, false);

  assert.equal(await adapter.detect(), true);

  await adapter.start(observer);

  assert.equal(adapter.isRunning, false);
  assert.equal(adapter.threadId, "thread-codex-001");
  assert.deepEqual(observer.events.map((event) => event.type), [
    "run.started",
    "tool.started",
    "validation.started",
    "tool.completed",
    "validation.completed",
    "resource.changed",
    "usage.reported",
    "run.completed"
  ]);
  assert.equal(observer.events.find((event) => event.type === "tool.completed").attributes.success, true);
  assert.equal(observer.events.find((event) => event.type === "validation.completed").status, "succeeded");
  assert.equal(observer.events.find((event) => event.type === "resource.changed").attributes.resource_kind, "file");
  assert.equal(observer.events.some((event) => event.type.startsWith("artifact.")), false);
  assert.equal(observer.events.find((event) => event.type === "usage.reported").attributes.total_tokens, 20);
  assert.equal(observer.events.some((event) => JSON.stringify(event).includes("private reasoning")), false);
  assert.equal(observer.events.some((event) => JSON.stringify(event).includes("visible response")), false);
  assert.equal(observer.events.every((event) => event.privacy.content_included === false), true);
});

test("Codex CLI adapter reports a failed terminal without exposing process output", async () => {
  const adapter = new CodexCliHarnessAdapter({
    prompt: "Run the task",
    runId: "run-codex-failed",
    clock: fixedClock,
    spawnProcess: fakeSpawn([{ type: "turn.failed" }], { exitCode: 1 })
  });
  const observer = collectingObserver();

  await adapter.start(observer);

  assert.equal(observer.events.at(-1).type, "run.failed");
  assert.equal(observer.events.some((event) => event.type === "error.observed"), true);
  assert.equal(observer.events.at(-1).status, "failed");
});

test("Codex CLI adapter interrupts observation on malformed JSONL without fabricating an outcome", async () => {
  const adapter = new CodexCliHarnessAdapter({
    prompt: "Run the task",
    runId: "run-codex-malformed",
    clock: fixedClock,
    spawnProcess: fakeSpawn(["not-json"])
  });
  const observer = collectingObserver();

  await assert.rejects(adapter.start(observer), /reliable terminal evidence/);

  assert.equal(observer.events.some((event) => event.type === "run.failed"), false);
  assert.equal(observer.events.some((event) => event.type === "run.completed"), false);
});

test("Codex-shaped JSONL reaches the persistent World State without Game Core changes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ai-quest-world-codex-runtime-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "feature.js"), "export const value = 1;\n");
  const runtime = new PersistentWorldRuntime({ path: join(directory, "world.sqlite") });
  t.after(() => runtime.close());

  const adapter = new CodexCliHarnessAdapter({
    prompt: "Create and verify the change",
    title: "Create and verify the change",
    runId: "run-codex-runtime-001",
    cwd: directory,
    artifactPaths: true,
    clock: fixedClock,
    spawnProcess: fakeSpawn([
      { type: "thread.started", thread_id: "thread-codex-runtime-001" },
      { type: "item.completed", item: { id: "item-file", type: "file_change", changes: [{ path: "feature.js", kind: "add" }], status: "completed" } },
      { type: "item.started", item: { id: "item-test", type: "command_execution", command: "node --test", status: "in_progress" } },
      { type: "item.completed", item: { id: "item-test", type: "command_execution", command: "node --test", exit_code: 0, status: "completed", aggregated_output: "# tests 1\n# pass 1\n# fail 0" } },
      { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }
    ])
  });

  const snapshot = await runtime.runAdapter(adapter);

  assert.equal(snapshot.quests.length, 1);
  assert.equal(snapshot.quests[0].status, "COMPLETED");
  assert.equal(snapshot.quests[0].outcome_confidence, "VERIFIED");
  assert.equal(snapshot.progressions[0].loot_refs.length, 1);
  assert.equal(snapshot.world.guild.state, "RESTORED");
  assert.equal(snapshot.world.workshop.state, "IDLE");
  assert.equal(snapshot.world.progression_totals.artifact_count, 1);
  assert.equal(runtime.getDiagnostics().event_count, 9);

  runtime.close();
  const reopenedRuntime = new PersistentWorldRuntime({ path: join(directory, "world.sqlite") });
  t.after(() => reopenedRuntime.close());
  assert.deepEqual(reopenedRuntime.getSnapshot(), snapshot);

  const replayedSnapshot = await reopenedRuntime.runAdapter(adapter);
  assert.deepEqual(replayedSnapshot, snapshot);
  assert.equal(reopenedRuntime.getDiagnostics().event_count, 9);
});
