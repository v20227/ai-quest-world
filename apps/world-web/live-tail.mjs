import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseDshSession } from "../../adapters/deepseek/dsh-adapter.mjs";
import { parseRolloutSession } from "../../adapters/codex-desktop/replay-session.mjs";

/**
 * Live tail: watch local harness session stores and stream normalized UARP
 * events into the world runtime as work happens.
 *
 * Sources (read-only, metadata-first — adapters skip all content payloads):
 * - DeepSeek Harness: `~/.dsh/sessions/<project>/<session>/session.jsonl.zstd`
 *   (whole-file re-decompress on change; record seq high-water + event_id
 *   dedupe make this idempotent)
 * - Codex Desktop: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
 *
 * Neither harness writes an explicit session-terminal record, so a session
 * settles only after `settleMinutes` of inactivity, and the synthesized
 * terminal is honestly labeled `native_outcome: "inferred-inactivity"`.
 * The world shows ACTIVE expeditions live; settlement waits for evidence
 * the work actually ended.
 */

const DEFAULT_SETTLE_MINUTES = 15;
const DEFAULT_POLL_MS = 2000;
const MAX_BUFFER = 64 * 1024 * 1024;

export function startLiveTail({
  runtime,
  dshHome = join(homedir(), ".dsh"),
  codexHome = join(homedir(), ".codex"),
  settleMinutes = DEFAULT_SETTLE_MINUTES,
  pollMs = DEFAULT_POLL_MS,
  artifactPaths = false,
  terminalNativeOutcome = "inferred-inactivity",
  log = () => {}
} = {}) {
  if (runtime === null || runtime === undefined || typeof runtime.ingest !== "function") {
    throw new TypeError("startLiveTail requires a PersistentWorldRuntime");
  }
  const files = new Map();
  const titles = { map: new Map(), mtimeMs: 0 };
  let stopped = false;
  let polling = false;

  async function poll() {
    if (stopped || polling) return;
    polling = true;
    try {
      await refreshCodexTitles();
      await scanJoin(dshHome, "sessions", 3, name => name === "session.jsonl.zstd", "dsh");
      await scanJoin(codexHome, "sessions", 3, name => name.startsWith("rollout-") && name.endsWith(".jsonl"), "codex");
      const now = Date.now();
      for (const [filePath, entry] of files) {
        if (entry.settled || now - entry.lastWriteMs <= settleMinutes * 60_000) continue;
        await processFile(filePath, entry, true);
        entry.settled = true;
        log(`settled ${entry.kind} session after inactivity: ${filePath}`);
      }
    } finally {
      polling = false;
    }
  }

  async function scanJoin(home, sub, depth, match, kind) {
    const root = join(home, sub);
    let found;
    try {
      found = await listFiles(root, depth);
    } catch {
      return;
    }
    for (const filePath of found) {
      if (!match(filePath.split("/").pop())) continue;
      let info;
      try {
        info = await stat(filePath);
      } catch {
        continue;
      }
      const entry = files.get(filePath) ?? { kind, size: -1, mtimeMs: 0, lastWriteMs: 0, settled: false };
      if (entry.settled && info.mtimeMs <= entry.mtimeMs) continue;
      if (info.size === entry.size && info.mtimeMs === entry.mtimeMs) continue;
      files.set(filePath, entry);
      await processFile(filePath, entry, false);
      entry.size = info.size;
      entry.mtimeMs = info.mtimeMs;
      entry.lastWriteMs = Date.now();
    }
  }

  async function processFile(filePath, entry, settle) {
    try {
      if (entry.kind === "dsh") {
        const output = spawnSync("zstd", ["-dc", filePath], { maxBuffer: MAX_BUFFER });
        if (output.status !== 0) return;
        const { events } = await parseDshSession(output.stdout.toString("utf8").split("\n"), {
          artifactPaths,
          assumeCompleted: settle,
          terminalNativeOutcome
        });
        runtime.ingest(events);
        return;
      }
      const content = await readFile(filePath, "utf8");
      const { events } = await parseRolloutSession(content.split("\n"), {
        artifactPaths,
        title: codexTitleFor(filePath),
        assumeCompleted: settle,
        terminalNativeOutcome
      });
      runtime.ingest(events);
    } catch (error) {
      log(`live-tail skipped ${filePath}: ${error.message}`);
    }
  }

  async function listFiles(root, depth) {
    if (depth < 0) return [];
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    const result = [];
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        result.push(...await listFiles(path, depth - 1));
      } else if (entry.isFile()) {
        result.push(path);
      }
    }
    return result;
  }

  async function refreshCodexTitles() {
    try {
      const indexPath = join(codexHome, "session_index.jsonl");
      const info = await stat(indexPath);
      if (info.mtimeMs === titles.mtimeMs) return;
      const content = await readFile(indexPath, "utf8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (typeof record.id === "string" && typeof record.thread_name === "string") {
            titles.map.set(record.id, record.thread_name);
          }
        } catch { /* skip malformed index lines */ }
      }
      titles.mtimeMs = info.mtimeMs;
    } catch { /* index optional */ }
  }

  function codexTitleFor(filePath) {
    const name = filePath.split("/").pop() ?? "";
    const match = name.match(/^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/);
    return match === null ? undefined : titles.map.get(match[1]);
  }

  const timer = setInterval(() => { void poll(); }, pollMs);
  void poll();
  log(`live-tail watching ${join(dshHome, "sessions")} and ${join(codexHome, "sessions")} (settle after ${settleMinutes}m idle)`);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    get watchedFileCount() {
      return files.size;
    }
  };
}
