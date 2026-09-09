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
const DEFAULT_POLL_MS = 3000;
const ACTIVE_PARSE_THROTTLE_MS = 30000;
const DEFAULT_BACKFILL_MAX_BYTES = 8 * 1024 * 1024;
const MAX_BUFFER = 64 * 1024 * 1024;

export function startLiveTail({
  runtime,
  dshHome = join(homedir(), ".dsh"),
  codexHome = join(homedir(), ".codex"),
  settleMinutes = DEFAULT_SETTLE_MINUTES,
  pollMs = DEFAULT_POLL_MS,
  artifactPaths = false,
  terminalNativeOutcome = "inferred-inactivity",
  backfillDays = 3,
  maxFileBytes = 50 * 1024 * 1024,
  log = () => {}
} = {}) {
  if (runtime === null || runtime === undefined || typeof runtime.ingest !== "function") {
    throw new TypeError("startLiveTail requires a PersistentWorldRuntime");
  }
  const files = new Map();
  const titles = { map: new Map(), mtimeMs: 0 };
  const startedAtMs = Date.now();
  const backfillMs = backfillDays * 24 * 60 * 60 * 1000;
  let stopped = false;
  let polling = false;

  async function poll() {
    if (stopped || polling) return;
    polling = true;
    try {
      await refreshCodexTitles();
      const pending = [];
      await scanJoin(dshHome, "sessions", 3, name => name === "session.jsonl.zstd", "dsh", pending);
      await scanJoin(codexHome, "sessions", 3, name => name.startsWith("rollout-") && name.endsWith(".jsonl"), "codex", pending);
      if (pending.length > 0) runtime.ingest(pending);
      const now = Date.now();
      const settleEvents = [];
      const settledPaths = [];
      for (const [filePath, entry] of files) {
        if (entry.settled || now - entry.lastWriteMs <= settleMinutes * 60_000) continue;
        settleEvents.push(...await parseEvents(filePath, entry, true));
        entry.settled = true;
        settledPaths.push(filePath);
      }
      if (settleEvents.length > 0) runtime.ingest(settleEvents);
      for (const filePath of settledPaths) {
        log(`settled ${files.get(filePath)?.kind} session after inactivity: ${filePath}`);
      }
    } finally {
      polling = false;
    }
  }

  async function scanJoin(home, sub, depth, match, kind, pending) {
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
      const entry = files.get(filePath) ?? { kind, size: -1, mtimeMs: 0, lastWriteMs: 0, lastParseMs: 0, settled: false };
      if (entry.settled && info.mtimeMs <= entry.mtimeMs) continue;
      if (info.size === entry.size && info.mtimeMs === entry.mtimeMs) continue;
      // 活跃会话每隔几秒追加写入；解析+重投影代价高，同一文件节流解析，
      // 让世界以秒级而非毫秒级跟随真实工作。
      if (files.has(filePath) && Date.now() - entry.lastParseMs < ACTIVE_PARSE_THROTTLE_MS && !entry.settled) {
        entry.size = info.size;
        entry.mtimeMs = info.mtimeMs;
        entry.lastWriteMs = Date.now();
        continue;
      }
      if (!files.has(filePath)) {
        // Bound the first-run backfill: ancient or oversized history is
        // registered but never parsed or settled. Live mode is for now.
        // 归档文件（>6h 未变）用更小的解析预算：它们大多是内容流，价值密度低。
        const isArchived = startedAtMs - info.mtimeMs > 6 * 60 * 60 * 1000;
        const budget = isArchived ? Math.min(maxFileBytes, DEFAULT_BACKFILL_MAX_BYTES) : maxFileBytes;
        if (startedAtMs - info.mtimeMs > backfillMs || info.size > budget) {
          files.set(filePath, { kind, size: info.size, mtimeMs: info.mtimeMs, lastWriteMs: Date.now(), lastParseMs: 0, settled: true });
          if (info.size > budget) log(`live-tail skipping oversized history file (${Math.round(info.size / 1024 / 1024)}MB): ${filePath}`);
          continue;
        }
      }
      files.set(filePath, entry);
      pending.push(...await parseEvents(filePath, entry, false));
      entry.size = info.size;
      entry.mtimeMs = info.mtimeMs;
      entry.lastWriteMs = Date.now();
      entry.lastParseMs = Date.now();
      // 让出事件循环：回填几十个会话时 HTTP 不被饿死。
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async function parseEvents(filePath, entry, settle) {
    try {
      if (entry.kind === "dsh") {
        const output = spawnSync("zstd", ["-dc", filePath], { maxBuffer: MAX_BUFFER });
        if (output.status !== 0) return [];
        const lines = filterByWatermark(output.stdout.toString("utf8").split("\n"), entry, "seq");
        const { events } = await parseDshSession(lines, {
          artifactPaths,
          assumeCompleted: settle,
          terminalNativeOutcome
        });
        return events;
      }
      const content = await readFile(filePath, "utf8");
      const lines = filterByWatermark(content.split("\n"), entry, "ordinal");
      const { events } = await parseRolloutSession(lines, {
        artifactPaths,
        title: codexTitleFor(filePath),
        assumeCompleted: settle,
        terminalNativeOutcome
      });
      return events;
    } catch (error) {
      log(`live-tail skipped ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * 记录高水位：活跃会话会整体重写，但只有尾部是新增记录。
   * 过滤掉水位之前的记录，避免每轮轮询都重新发射/校验/去重整段历史。
   * （会话头记录无序号，永远保留；下游 event_id 去重兜底。）
   */
  function filterByWatermark(lines, entry, field) {
    if (entry.highWater === undefined) entry.highWater = 0;
    const filtered = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        const seq = Number.isSafeInteger(record[field]) ? record[field] : null;
        if (seq === null) {
          filtered.push(line);
          continue;
        }
        if (seq >= entry.highWater) {
          filtered.push(line);
          if (seq > entry.highWater) entry.highWater = seq;
        }
      } catch {
        filtered.push(line);
      }
    }
    return filtered;
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
