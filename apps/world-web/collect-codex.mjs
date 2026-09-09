import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCliHarnessAdapter } from "../../adapters/codex-cli/index.mjs";
import { PersistentWorldRuntime } from "./world-runtime.mjs";
import { createReadStream } from "node:fs";
import { ObservationInterrupted } from "../../packages/adapter-core/observation-interrupted.mjs";

export async function collectCodex({ input = process.stdin, env = process.env } = {}) {
  const runId = env.AI_QUEST_WORLD_CODEX_RUN_ID;
  if (typeof runId !== "string" || runId.trim() === "") throw new Error("Set AI_QUEST_WORLD_CODEX_RUN_ID to a unique execution ID; reuse it only when replaying that execution.");
  if (!env.AI_QUEST_WORLD_CODEX_CWD) throw new Error("Set AI_QUEST_WORLD_CODEX_CWD to the observed project root.");
  if (input.isTTY && !env.AI_QUEST_WORLD_CODEX_STREAM_PATH) throw new Error("Pipe one codex exec --json execution into this collector or provide AI_QUEST_WORLD_CODEX_STREAM_PATH.");
  const stream = env.AI_QUEST_WORLD_CODEX_STREAM_PATH ? createReadStream(env.AI_QUEST_WORLD_CODEX_STREAM_PATH) : input;
  const adapter = new CodexCliHarnessAdapter({ input: stream, runId,
    cwd: env.AI_QUEST_WORLD_CODEX_CWD, title: env.AI_QUEST_WORLD_CODEX_TITLE,
    resumedFromRunId: env.AI_QUEST_WORLD_RESUMED_FROM_RUN_ID,
    workspaceId: env.AI_QUEST_WORLD_WORKSPACE_ID, projectId: env.AI_QUEST_WORLD_PROJECT_ID,
    agentId: env.AI_QUEST_WORLD_AGENT_ID,
    artifactPaths: env.AI_QUEST_WORLD_ARTIFACT_PATHS === "1" });
  const runtime = new PersistentWorldRuntime({ path: env.AI_QUEST_WORLD_DB ?? "storage/sqlite/ai-quest-world.sqlite" });
  try {
    const snapshot = await runtime.runAdapter(adapter, { connectionId: env.AI_QUEST_WORLD_CONNECTION_ID ?? adapter.id });
    return { run_id: runId, thread_id: adapter.threadId, diagnostics: runtime.getDiagnostics(),
      quests: snapshot.quests.map(quest => ({ quest_id: quest.quest_id, status: quest.status, confidence: quest.outcome_confidence })),
      totals: snapshot.world.progression_totals, observability: snapshot.observability };
  } finally {
    if (stream !== input) stream.destroy();
    runtime.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collectCodex().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error instanceof ObservationInterrupted
      ? `Observation interrupted (${error.code}). No terminal outcome was inferred. Replay a retained complete JSONL stream with the original run ID to recover.`
      : "Collection failed. Check the run ID, project root, JSONL source and writable database path. Collection failure is not proof that the real task failed.");
    process.exitCode = error instanceof ObservationInterrupted ? 2 : 1;
  });
}
