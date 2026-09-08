import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { WorldStateEngine } from "../../core/world/world-state-engine.mjs";

const APP_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PUBLIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.mjs", ["app.mjs", "text/javascript; charset=utf-8"]]
]);

/**
 * Build the browser read model from the same deterministic core used by the
 * tests. The browser receives state; it does not become a game authority.
 *
 * @param {{mode?: "canonical"|"unverified"}=} options
 * @returns {{world: Record<string, unknown>, quests: Record<string, unknown>[], progressions: Record<string, unknown>[]}}
 */
export function buildDemoSnapshot({ mode = "canonical" } = {}) {
  if (!["canonical", "unverified"].includes(mode)) {
    throw new TypeError("demo mode must be canonical or unverified");
  }

  const fullEvents = createSimulatedRunSequence({
    includeChildRun: mode === "canonical"
  });
  const events = mode === "unverified"
    ? fullEvents.filter((event) => [
      "run.started",
      "resource.activity",
      "resource.changed",
      "run.completed"
    ].includes(event.type))
    : fullEvents;
  const semantic = analyzeRuntimeEvents(events);
  const questEngine = new QuestEngine();
  questEngine.process(events, semantic.records);
  const quests = questEngine.getQuests();
  const progressions = quests.map((quest) => calculateProgression(
    quest,
    semantic.records.filter((record) => record.root_run_id === quest.root_run_id)
  ));
  const worldEngine = new WorldStateEngine();
  for (const event of events) {
    worldEngine.ingest(event);
  }
  for (const progression of progressions) {
    worldEngine.applyProgression(progression);
  }

  return {
    world: worldEngine.getState(),
    quests,
    progressions
  };
}

/** @returns {import("node:http").Server} */
export function createWorldWebServer() {
  return createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      }
      response.end(JSON.stringify({ error: "World Web server error" }));
      console.error(error);
    }
  });
}

/** @param {{port?: number, host?: string}=} options */
export function startWorldWebServer({
  port = Number(process.env.AI_QUEST_WORLD_PORT ?? 4173),
  host = "127.0.0.1"
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("port must be an integer between 0 and 65535");
  }
  const server = createWorldWebServer();
  server.listen(port, host, () => {
    const address = server.address();
    const resolvedPort = typeof address === "object" && address !== null ? address.port : port;
    console.log(`AI Quest World is running at http://${host}:${resolvedPort}`);
  });
  return server;
}

async function handleRequest(request, response) {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (requestUrl.pathname === "/api/demo") {
    const mode = requestUrl.searchParams.get("mode") ?? "canonical";
    if (!["canonical", "unverified"].includes(mode)) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "mode must be canonical or unverified" }));
      return;
    }
    const snapshot = buildDemoSnapshot({ mode });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(snapshot));
    return;
  }

  const fileEntry = PUBLIC_FILES.get(requestUrl.pathname);
  if (fileEntry === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const [fileName, contentType] = fileEntry;
  const content = await readFile(join(APP_DIRECTORY, fileName));
  response.writeHead(200, { "content-type": contentType });
  response.end(content);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startWorldWebServer();
}
