import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasSqliteHeader, isProtectedArtifactPath } from "../../packages/adapter-core/artifact-privacy.mjs";

const MAX_BYTES = 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".rst", ".adoc", ".json", ".csv", ".mjs", ".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".css", ".html", ".svg", ".yml", ".yaml", ".sh", ".patch", ".diff"]);

export function isLocalRequest(request) {
  const host = request.headers.host;
  const port = request.socket.localPort;
  if (![ `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}` ].includes(host)) return false;
  if (request.headers.origin && request.headers.origin !== `http://${host}`) return false;
  return !["cross-site"].includes(request.headers["sec-fetch-site"]);
}

export async function readArtifact({ root, snapshot, questId, artifactId }) {
  if (!root) return null;
  const quest = snapshot.quests.find(value => value.quest_id === questId);
  const artifact = quest?.artifact_refs.find(value => value.artifact_id === artifactId && value.durable === true);
  if (!artifact || typeof artifact.uri_or_path !== "string") return null;
  let handle;
  try {
    const directory = await realpath(root);
    const reference = artifact.uri_or_path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(reference) && !reference.startsWith("file:")) return null;
    const requested = reference.startsWith("file:") ? fileURLToPath(reference) : resolve(directory, reference);
    const fromConfiguredRoot = relative(resolve(root), requested);
    const path = fromConfiguredRoot && !isAbsolute(fromConfiguredRoot) && fromConfiguredRoot !== ".." && !fromConfiguredRoot.startsWith("../")
      ? resolve(directory, fromConfiguredRoot) : requested;
    if (!await allowedPath(directory, path)) return null;
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > MAX_BYTES) return null;
    const canonical = await realpath(path);
    if (!await allowedPath(directory, canonical)) return null;
    const current = await lstat(canonical);
    if (opened.dev !== current.dev || opened.ino !== current.ino) return null;
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let { bytesRead } = await handle.read(buffer, 0, 16, 0);
    if (hasSqliteHeader(buffer.subarray(0, bytesRead))) return null;
    while (bytesRead < buffer.length) {
      const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (bytesRead > MAX_BYTES) return null;
    const text = TEXT_EXTENSIONS.has(extname(canonical).toLowerCase());
    return { content: buffer.subarray(0, bytesRead), text, name: basename(canonical) };
  } catch { return null; }
  finally { await handle?.close(); }
}

async function allowedPath(root, path) {
  const local = relative(root, path);
  if (!local || isAbsolute(local) || local === ".." || local.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) return false;
  const parts = local.split(/[\\/]/);
  if (isProtectedArtifactPath(local)) return false;
  let cursor = root;
  for (const part of parts) {
    cursor = join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) return false;
  }
  return true;
}
