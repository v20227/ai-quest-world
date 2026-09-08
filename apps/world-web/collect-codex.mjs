import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCliHarnessAdapter } from "../../adapters/codex-cli/index.mjs";
import { PersistentWorldRuntime } from "./world-runtime.mjs";

export async function collectCodex({ input = process.stdin, env = process.env } = {}) {
  const runId = env.AI_QUEST_WORLD_CODEX_RUN_ID;
  if (typeof runId !== "string" || runId.trim() === "") throw new Error("Set AI_QUEST_WORLD_CODEX_RUN_ID to a unique execution ID; reuse it only when replaying that execution.");
  if (!env.AI_QUEST_WORLD_CODEX_CWD) throw new Error("Set AI_QUEST_WORLD_CODEX_CWD to the observed project root.");
  if (input.isTTY) throw new Error("Pipe one codex exec --json execution into this collector.");
  const adapter = new CodexCliHarnessAdapter({ input, runId,
    cwd: env.AI_QUEST_WORLD_CODEX_CWD, title: env.AI_QUEST_WORLD_CODEX_TITLE,
    resumedFromRunId: env.AI_QUEST_WORLD_RESUMED_FROM_RUN_ID,
    workspaceId: env.AI_QUEST_WORLD_WORKSPACE_ID, projectId: env.AI_QUEST_WORLD_PROJECT_ID,
    artifactPaths: env.AI_QUEST_WORLD_ARTIFACT_PATHS === "1" });
  const runtime = new PersistentWorldRuntime({ path: env.AI_QUEST_WORLD_DB ?? "storage/sqlite/ai-quest-world.sqlite" });
  try {
    const snapshot = await runtime.runAdapter(adapter);
    return { run_id: runId, thread_id: adapter.threadId, diagnostics: runtime.getDiagnostics(),
      quests: snapshot.quests.map(quest => ({ quest_id: quest.quest_id, status: quest.status, confidence: quest.outcome_confidence })),
      totals: snapshot.world.progression_totals };
  } finally { runtime.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collectCodex().then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {
    console.error("Collection failed. Check the required run ID, project root, JSONL stream and writable database path.");
    process.exitCode = 1;
  });
}
