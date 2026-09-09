import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createSimulatedRunSequence } from "../../adapters/first-harness/simulated-adapter.mjs";
import { projectWorld } from "./project-world.mjs";
import { withGameplay } from "./gameplay-snapshot.mjs";
import { PersistentWorldRuntime } from "./world-runtime.mjs";
import { isLocalRequest, readArtifact } from "./artifact-access.mjs";
import { handleCollectionPlacement } from "./collection-api.mjs";
import { handleEconomyRequest } from "./economy-api.mjs";
import { SqliteCollectionStore } from "../../storage/sqlite/collection-store.mjs";
import { SqliteEconomyStore } from "../../storage/sqlite/economy-store.mjs";
import { milestoneCollectibles } from "../../core/game/collection-rewards.mjs";
import { workGoldGrants } from "../../core/game/economy-policy.mjs";
import { startLiveTail } from "./live-tail.mjs";

const APP_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PUBLIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/guild-desktop.css", ["guild-desktop.css", "text/css; charset=utf-8"]],
  ["/app.mjs", ["app.mjs", "text/javascript; charset=utf-8"]],
  ["/collection-view.mjs", ["collection-view.mjs", "text/javascript; charset=utf-8"]],
  ["/collection-notices.mjs", ["collection-notices.mjs", "text/javascript; charset=utf-8"]],
  ["/economy-view.mjs", ["economy-view.mjs", "text/javascript; charset=utf-8"]],
  ["/capture-view.mjs", ["capture-view.mjs", "text/javascript; charset=utf-8"]],
  ["/expedition-view.mjs", ["expedition-view.mjs", "text/javascript; charset=utf-8"]],
  ["/view-state.mjs", ["view-state.mjs", "text/javascript; charset=utf-8"]],
  ["/guild-scene.mjs", ["guild-scene.mjs", "text/javascript; charset=utf-8"]],
  ["/scene-assets.mjs", ["scene-assets.mjs", "text/javascript; charset=utf-8"]],
  ["/pixel-composition.mjs", ["pixel-composition.mjs", "text/javascript; charset=utf-8"]],
  ["/asset-preview.mjs", ["asset-preview.mjs", "text/javascript; charset=utf-8"]],
  ["/character-preferences.mjs", ["character-preferences.mjs", "text/javascript; charset=utf-8"]],
  ["/scene-motion.mjs", ["scene-motion.mjs", "text/javascript; charset=utf-8"]],
  ["/scene-frames.mjs", ["scene-frames.mjs", "text/javascript; charset=utf-8"]],
  ["/scene-objects.mjs", ["scene-objects.mjs", "text/javascript; charset=utf-8"]],
  ["/workshop-display.mjs", ["workshop-display.mjs", "text/javascript; charset=utf-8"]],
  ["/command-hall", ["command-hall.html", "text/html; charset=utf-8"]],
  ["/command-hall.html", ["command-hall.html", "text/html; charset=utf-8"]],
  ["/command-hall.css", ["command-hall.css", "text/css; charset=utf-8"]],
  ["/command-hall.mjs", ["command-hall.mjs", "text/javascript; charset=utf-8"]],
  ["/command-hall-fixtures.mjs", ["command-hall-fixtures.mjs", "text/javascript; charset=utf-8"]]
]);

const ASSET_DIRECTORY = resolve(APP_DIRECTORY, "../../assets");
const ASSET_CONTENT_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"]
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
  const { world, quests, progressions } = projectWorld(events);
  const collectionStore = new SqliteCollectionStore({ path: ":memory:" });
  const economyStore = new SqliteEconomyStore({ path: ":memory:" });
  try {
    collectionStore.record(milestoneCollectibles(world));
    economyStore.recordWork(workGoldGrants(progressions));
    return {
      world,
      quests,
      progressions,
      collection: collectionStore.snapshot(),
      economy: economyStore.snapshot()
    };
  } finally {
    collectionStore.close();
    economyStore.close();
  }
}

/** @param {{runtime?: PersistentWorldRuntime|null}=} options @returns {import("node:http").Server} */
export function createWorldWebServer({ runtime = null, artifactRoot = null } = {}) {
  return createServer(async (request, response) => {
    try {
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("referrer-policy", "no-referrer");
      if (!isLocalRequest(request)) {
        response.writeHead(403); response.end("Local origin required"); return;
      }
      await handleRequest(request, response, runtime, artifactRoot);
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
  host = "127.0.0.1",
  path = process.env.AI_QUEST_WORLD_DB ?? "storage/sqlite/ai-quest-world.sqlite",
  artifactRoot = process.env.AI_QUEST_WORLD_ARTIFACT_ROOT ?? null
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("port must be an integer between 0 and 65535");
  }
  const runtime = new PersistentWorldRuntime({ path });
  const server = createWorldWebServer({ runtime, artifactRoot });
  server.on("close", () => runtime.close());
  if (process.env.AI_QUEST_WORLD_LIVE === "1") {
    const tail = startLiveTail({
      runtime,
      artifactPaths: process.env.AI_QUEST_WORLD_ARTIFACT_PATHS === "1",
      settleMinutes: Number(process.env.AI_QUEST_WORLD_LIVE_SETTLE_MINUTES ?? 15),
      backfillDays: Number(process.env.AI_QUEST_WORLD_LIVE_BACKFILL_DAYS ?? 3),
      maxFileBytes: Number(process.env.AI_QUEST_WORLD_LIVE_MAX_FILE_MB ?? 50) * 1024 * 1024,
      log: message => console.log(`[live-tail] ${message}`)
    });
    server.on("close", () => tail.stop());
  }
  server.listen(port, host, () => {
    const address = server.address();
    const resolvedPort = typeof address === "object" && address !== null ? address.port : port;
    console.log(`AI Quest World is running at http://${host}:${resolvedPort}`);
  });
  return server;
}

async function handleRequest(request, response, runtime, artifactRoot) {
  const economyUrl = new URL(request.url ?? "/", "http://localhost");
  if (["/api/economy/command", "/api/economy/history"].includes(economyUrl.pathname)) {
    await handleEconomyRequest(request, response, runtime, economyUrl);
    return;
  }
  if (request.method === "POST" && new URL(request.url ?? "/", "http://localhost").pathname === "/api/collection/placement") {
    await handleCollectionPlacement(request, response, runtime);
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (requestUrl.pathname === "/api/artifact") {
    const artifact = runtime === null ? null : await readArtifact({ root: artifactRoot, snapshot: runtime.getSnapshot(),
      questId: requestUrl.searchParams.get("quest"), artifactId: requestUrl.searchParams.get("artifact") });
    if (artifact === null) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      response.end("Artifact unavailable. Enable the project artifact root and check that the original file still exists."); return;
    }
    response.writeHead(200, {
      "content-type": artifact.text ? "text/plain; charset=utf-8" : "application/octet-stream",
      "content-disposition": `${artifact.text ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
      "cache-control": "no-store", "content-security-policy": "sandbox; default-src 'none'", "cross-origin-resource-policy": "same-origin"
    });
    response.end(artifact.content); return;
  }
  if (requestUrl.pathname === "/api/demo") {
    const mode = requestUrl.searchParams.get("mode") ?? "canonical";
    if (!["canonical", "unverified"].includes(mode)) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "mode must be canonical or unverified" }));
      return;
    }
    const snapshot = buildDemoSnapshot({ mode });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(withGameplay(snapshot)));
    return;
  }

  if (requestUrl.pathname === "/api/world") {
    if (runtime === null) {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Persistent World runtime is not configured" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ...withGameplay(runtime.getSnapshot({ at: new Date().toISOString(), withObservability: true })), display_namespace: runtime.getDisplayNamespace(), capabilities: { artifact_view: artifactRoot !== null }, diagnostics: runtime.getDiagnostics() }));
    return;
  }

  if (requestUrl.pathname.startsWith("/assets/")) {
    let relativePath;
    try {
      relativePath = decodeURIComponent(requestUrl.pathname.slice("/assets/".length));
    } catch {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Invalid asset path");
      return;
    }
    const pathSegments = relativePath.split(/[\\/]+/);
    if (pathSegments.some((segment) => segment.startsWith("."))) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const requestedPath = resolve(ASSET_DIRECTORY, relativePath);
    const requestedExtension = extname(requestedPath).toLowerCase();
    if (!ASSET_CONTENT_TYPES.has(requestedExtension)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    let assetRootPath;
    let assetPath;
    try {
      assetRootPath = await realpath(ASSET_DIRECTORY);
      assetPath = await realpath(requestedPath);
      if (assetPath !== assetRootPath && !assetPath.startsWith(`${assetRootPath}${sep}`)) {
        throw new Error("Asset path escaped the configured root");
      }
      if (!(await stat(assetPath)).isFile()) {
        throw new Error("Asset path is not a file");
      }
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const content = await readFile(assetPath);
    response.writeHead(200, {
      "content-type": ASSET_CONTENT_TYPES.get(extname(assetPath).toLowerCase()),
      "cache-control": "public, max-age=300",
      "cross-origin-resource-policy": "same-origin"
    });
    response.end(content);
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
