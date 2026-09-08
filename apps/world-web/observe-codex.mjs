import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CodexCliHarnessAdapter } from "../../adapters/codex-cli/index.mjs";
import { PersistentWorldRuntime } from "./world-runtime.mjs";

const DEFAULT_DATABASE = "storage/sqlite/ai-quest-world.sqlite";

/**
 * Observe one local Codex CLI run and persist the resulting world projection.
 * The command intentionally launches Codex with a read-only sandbox.
 */
async function main() {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (prompt.length === 0) {
    throw new Error("Usage: npm run observe:codex -- \"describe the local task\"");
  }

  const runtime = new PersistentWorldRuntime({
    path: process.env.AI_QUEST_WORLD_DB ?? DEFAULT_DATABASE
  });
  try {
    const adapter = new CodexCliHarnessAdapter({
      executable: process.env.AI_QUEST_WORLD_CODEX_EXECUTABLE ?? "codex",
      cwd: process.env.AI_QUEST_WORLD_CODEX_CWD ?? process.cwd(),
      prompt,
      title: process.env.AI_QUEST_WORLD_CODEX_TITLE,
      runId: process.env.AI_QUEST_WORLD_CODEX_RUN_ID,
      workspaceId: process.env.AI_QUEST_WORLD_WORKSPACE_ID,
      projectId: process.env.AI_QUEST_WORLD_PROJECT_ID,
      artifactPaths: process.env.AI_QUEST_WORLD_ARTIFACT_PATHS === "1",
      extraArgs: ["--sandbox", "read-only"]
    });

    if (!(await adapter.detect())) {
      throw new Error("Codex CLI was not detected; set AI_QUEST_WORLD_CODEX_EXECUTABLE to its path");
    }

    const snapshot = await runtime.runAdapter(adapter);
    console.log(JSON.stringify({
      run_id: adapter.runId,
      thread_id: adapter.threadId,
      diagnostics: runtime.getDiagnostics(),
      world: snapshot.world
    }, null, 2));
  } finally {
    runtime.close();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Codex observation failed");
    process.exitCode = 1;
  });
}
