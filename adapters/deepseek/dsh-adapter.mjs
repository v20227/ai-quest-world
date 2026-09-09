import { createHash } from "node:crypto";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { identifyValidation, validationMeasurements } from "../codex-cli/validation-command.mjs";
import { hasSqliteHeader, isProtectedArtifactPath } from "../../packages/adapter-core/artifact-privacy.mjs";

export const DSH_ADAPTER_ID = "deepseek-dsh";
export const DSH_ADAPTER_VERSION = "0.1.0";

const PRIVACY = Object.freeze({
  content_included: false,
  redaction_level: "strict"
});

/**
 * Read-only converter for DeepSeek Harness (dsh) session logs
 * (`~/.dsh/sessions/<project>/<session>/session.jsonl`, zstd-compressed on
 * disk — decompress before calling).
 *
 * Verified record shapes (v0 sessions):
 * - `session` {id, createdAt, cwd, parentSession?, origin?, delegationDepth, agentPreset}
 * - `session/title` {data: {title}}
 * - `tool/call` {seq, time, data: {turn, step, callId, name, arguments}} (arguments = JSON string)
 * - `tool/result` {seq, time, data: {turn, step, message}, sourceEventSeqs: [callSeq]}
 * - `turn/start` / `turn/end`
 *
 * Content-bearing records (assistant/chunk, reasoning-chunks, text-chunks,
 * user/message, agent/inbox, request/*) are skipped entirely and never reach
 * the event store. Event identity derives from the session id + call/seq
 * tokens, so replaying the same log produces identical event IDs.
 *
 * dsh writes no explicit session-terminal record; pass `assumeCompleted` to
 * synthesize `run.completed` for a log known to be a finished session.
 * `parentSession` is reported in `meta` but NOT auto-mapped to
 * `resumed_from_run_id` (same reconciliation rule as desktop forks).
 */

const SKIPPED_TYPES = new Set([
  "assistant/chunk", "reasoning-chunks", "text-chunks", "tool-call-chunks",
  "user/message", "agent/inbox/spliced", "request/header", "request/context",
  "todo/write", "goal/change", "llm/retry", "llm/retry-started",
  "sandbox/mode", "approval/policy", "permission/preset",
  "agent-preset/selected", "session/end-seed", "subagent/descriptor",
  "step/start", "step/end", "turn/start", "turn/end"
]);

const READ_TOOLS = new Set(["read", "grep", "glob", "read_image", "list_agents"]);
const WRITE_TOOLS = new Map([["write", "created"], ["edit", "modified"], ["str_replace_editor", "modified"]]);
const API_TOOLS = new Set(["subagent", "skill", "send_message", "todo_write", "create_goal", "ask_user_question"]);

/**
 * @param {string[]} lines dsh session JSONL lines (decompressed)
 * @param {{
 *   runId?: string,
 *   title?: string,
 *   cwd?: string,
 *   assumeCompleted?: boolean,
 *   artifactPaths?: boolean,
 *   workspaceId?: string,
 *   projectId?: string,
 *   resumedFromRunId?: string
 * }} options
 */
export async function parseDshSession(lines, options = {}) {
  const {
    runId,
    title,
    cwd: cwdOverride,
    assumeCompleted = false,
    artifactPaths = false,
    workspaceId,
    projectId,
    resumedFromRunId
  } = options;

  if (!Array.isArray(lines)) {
    throw new TypeError("dsh session lines must be an array of strings");
  }

  const records = [];
  for (const [index, line] of lines.entries()) {
    if (typeof line !== "string" || line.trim() === "") continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      throw new Error(`dsh session line ${index + 1} is not valid JSON`);
    }
  }

  const header = records.find(record => record?.type === "session");
  if (header === undefined) {
    throw new Error("dsh session log does not contain a session record");
  }
  const titleRecord = records.find(record => record?.type === "session/title");
  const meta = {
    session_id: nonEmptyString(header.id),
    cwd: nonEmptyString(header.cwd),
    parent_session: nonEmptyString(header.parentSession),
    origin: nonEmptyString(header.origin),
    delegation_depth: Number.isSafeInteger(header.delegationDepth) ? header.delegationDepth : 0,
    agent_preset: nonEmptyString(header.agentPreset),
    title: title ?? nonEmptyString(titleRecord?.data?.title)
  };
  if (meta.session_id === null) {
    throw new Error("dsh session record is missing an id");
  }

  const state = {
    context: {
      run_id: runId ?? `dsh:${meta.session_id}`,
      ...(workspaceId === undefined ? {} : { workspace_id: workspaceId }),
      ...(projectId === undefined && meta.cwd !== null
        ? { project_id: `cwd:${meta.cwd}` }
        : projectId === undefined ? {} : { project_id: projectId })
    },
    title: meta.title,
    resumedFromRunId,
    artifactPaths,
    events: [],
    seenTokens: new Set(),
    lastTimestampMs: 0,
    pendingCalls: new Map(),
    readCount: 0,
    cwd: cwdOverride ?? meta.cwd ?? undefined,
    meta
  };

  for (const record of records) {
    await consumeRecord(state, record);
  }
  flushReadAggregate(state);
  if (assumeCompleted) {
    emitEvent(state, "run-terminal", "run.completed", {
      native_outcome: "succeeded",
      output_summary_available: false
    }, "completed", undefined, undefined);
  }

  return { meta, events: state.events };
}

/** Replay one dsh session log file (plain JSONL) into UARP events. */
export async function replayDshSessionFile(filePath, options = {}) {
  const content = await readFile(filePath, "utf8");
  return parseDshSession(content.split("\n"), options);
}

async function consumeRecord(state, record) {
  if (!isRecord(record)) return;
  const type = record.type;
  if (typeof type !== "string" || SKIPPED_TYPES.has(type)) return;
  const time = Number.isFinite(record.time) ? record.time
    : Number.isFinite(record.createdAt) ? record.createdAt : undefined;
  const seq = Number.isSafeInteger(record.seq) ? record.seq : null;

  if (type === "session") {
    emitEvent(state, "run-started", "run.started", {
      ...(state.title === undefined ? {} : { title: state.title }),
      task_text_available: false,
      mode: "deepseek-dsh-replay",
      ...(state.resumedFromRunId === undefined ? {} : { resumed_from_run_id: state.resumedFromRunId })
    }, "started", time, undefined);
    return;
  }
  if (type === "tool/call") {
    await consumeToolCall(state, record.data, seq, time);
    return;
  }
  if (type === "tool/result") {
    const sourceSeq = Array.isArray(record.sourceEventSeqs) && Number.isSafeInteger(record.sourceEventSeqs[0])
      ? record.sourceEventSeqs[0]
      : null;
    await consumeToolResult(state, record.data, sourceSeq, seq, time);
  }
}

async function consumeToolCall(state, data, seq, time) {
  if (!isRecord(data)) return;
  const name = nonEmptyString(data.name);
  const callId = nonEmptyString(data.callId) ?? `seq-${seq}`;
  if (name === null) return;
  const args = parseArguments(data.arguments);

  if (name === "bash") {
    const command = nonEmptyString(args?.command);
    const validation = command === null ? null : await identifyValidation(command, state.cwd ?? process.cwd());
    state.pendingCalls.set(callId, { kind: "bash", validation, seq });
    emitEvent(state, `tool-started-${callId}`, "tool.started", {
      tool_kind: "shell",
      tool_name: "bash",
      category_hint: validation === null ? "other" : "validation"
    }, "started", time, undefined);
    if (validation !== null) {
      emitEvent(state, `validation-started-${callId}`, "validation.started", { ...validation }, "started", time, undefined);
    }
    return;
  }
  if (READ_TOOLS.has(name)) {
    state.readCount += 1;
    return;
  }
  if (WRITE_TOOLS.has(name)) {
    const path = nonEmptyString(args?.path) ?? nonEmptyString(args?.file_path) ?? nonEmptyString(args?.filePath);
    const changeType = name === "str_replace_editor" && args?.command === "create"
      ? "created"
      : WRITE_TOOLS.get(name);
    state.pendingCalls.set(callId, { kind: "write", changeType, path, seq });
    return;
  }
  if (API_TOOLS.has(name)) {
    state.pendingCalls.set(callId, { kind: "api", name, seq });
    emitEvent(state, `tool-started-${callId}`, "tool.started", {
      tool_kind: "api",
      tool_name: name
    }, "started", time, undefined);
  }
}

async function consumeToolResult(state, data, sourceSeq, seq, time) {
  if (!isRecord(data)) return;
  const callId = findPendingCallId(state, sourceSeq) ?? oldestPendingCallId(state);
  if (callId === null) return;
  const pending = state.pendingCalls.get(callId);
  state.pendingCalls.delete(callId);

  if (pending.kind === "bash") {
    const error = resultIsError(data);
    emitEvent(state, `tool-completed-${callId}`, "tool.completed", {
      tool_kind: "shell",
      tool_name: "bash",
      category_hint: pending.validation === null ? "other" : "validation",
      ...(error === undefined ? {} : { success: !error })
    }, error === undefined ? "completed" : error ? "failed" : "succeeded", time, undefined);
    if (pending.validation !== null) {
      const measurements = validationMeasurements(resultText(data));
      const checked = error === true || (measurements.failed ?? 0) > 0
        ? false
        : pending.validation.kind !== "test" || (measurements.passed ?? 0) > 0 ? true : undefined;
      emitEvent(state, `validation-completed-${callId}`, "validation.completed",
        { ...pending.validation, ...measurements }, validationStatusForSuccess(checked), time, undefined);
    }
    return;
  }
  if (pending.kind === "write") {
    if (pending.path === null) return;
    const token = `write-${callId}`;
    emitEvent(state, `resource-changed-${token}`, "resource.changed", {
      resource_kind: "file",
      change_type: pending.changeType,
      ...optionalAttribute("extension", normalizeExtension(pending.path) || undefined)
    }, "succeeded", time, undefined);
    if (state.artifactPaths === true && ["created", "modified", "renamed"].includes(pending.changeType)) {
      await emitArtifact(state, pending.path, pending.changeType, time);
    }
    return;
  }
  if (pending.kind === "api") {
    emitEvent(state, `tool-completed-${callId}`, "tool.completed", {
      tool_kind: "api",
      tool_name: pending.name
    }, "completed", time, undefined);
  }
}

function findPendingCallId(state, sourceSeq) {
  if (!Number.isSafeInteger(sourceSeq)) return null;
  for (const [callId, pending] of state.pendingCalls) {
    if (pending.seq === sourceSeq) return callId;
  }
  return null;
}

function oldestPendingCallId(state) {
  const first = state.pendingCalls.keys().next();
  return first.done ? null : first.value;
}

function flushReadAggregate(state) {
  if (state.readCount === 0) return;
  emitEvent(state, "resource-activity-reads", "resource.activity", {
    resource_kind: "file",
    read_count: state.readCount,
    scope: "project"
  }, "succeeded", undefined, undefined);
}

async function emitArtifact(state, path, changeType, time) {
  const artifact = await resolveArtifact(state, path);
  if (artifact === null) return;
  const artifactId = `deepseek-dsh:${state.context.run_id}:artifact:${artifact.id}`;
  emitEvent(state, `artifact-${artifact.id}`,
    changeType === "created" ? "artifact.created" : "artifact.updated",
    {
      artifact_id: artifactId,
      kind: inferArtifactKind(path),
      uri_or_path: artifact.uri,
      durable: true,
      relation: changeType === "created" ? "created" : "updated"
    },
    undefined,
    time,
    [{ id: artifactId, kind: "artifact", uri: artifact.uri, content_available: false }]);
}

async function resolveArtifact(state, path) {
  if (typeof path !== "string" || path.length === 0 || state.cwd === undefined) return null;
  try {
    const root = await realpath(state.cwd);
    const resolved = await realpath(resolve(root, path));
    const local = relative(root, resolved);
    if (isAbsolute(local) || local.startsWith("..") || isProtectedArtifactPath(local)) return null;
    if (!(await stat(resolved)).isFile()) return null;
    const handle = await open(resolved, "r");
    try {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, 16, 0);
      if (hasSqliteHeader(header.subarray(0, bytesRead))) return null;
    } finally {
      await handle.close();
    }
    return { id: createHash("sha256").update(resolved).digest("hex"), uri: pathToFileURL(resolved).href };
  } catch {
    return null;
  }
}

function emitEvent(state, token, type, attributes, status, time, evidenceRefs) {
  if (state.seenTokens.has(token)) return;
  state.seenTokens.add(token);
  const event = {
    uarp_version: "0.1",
    event_id: `${DSH_ADAPTER_ID}:${state.context.run_id}:${token}`,
    timestamp: nextTimestamp(state, time),
    source: {
      adapter_id: DSH_ADAPTER_ID,
      adapter_version: DSH_ADAPTER_VERSION,
      harness_family: "deepseek-dsh"
    },
    context: { ...state.context },
    type,
    attributes,
    privacy: { ...PRIVACY },
    ...(evidenceRefs === undefined ? {} : { evidence_refs: evidenceRefs }),
    ...(status === undefined ? {} : { status })
  };
  parseRuntimeEvent(event);
  state.events.push(event);
}

function nextTimestamp(state, epochMs) {
  const base = Number.isFinite(epochMs) ? epochMs : Date.now();
  const next = Math.max(base, state.lastTimestampMs + 1);
  state.lastTimestampMs = next;
  return new Date(next).toISOString();
}

function parseArguments(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resultText(data) {
  const texts = [];
  collectText(data?.message?.content, texts, 0);
  return texts.join("\n");
}

function collectText(value, texts, depth) {
  if (depth > 4 || texts.length > 64) return;
  if (typeof value === "string") {
    texts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const part of value) collectText(part, texts, depth + 1);
    return;
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      texts.push(value.text);
      return;
    }
    if (Array.isArray(value.content)) {
      collectText(value.content, texts, depth + 1);
    }
  }
}

function resultIsError(data) {
  const content = data?.message?.content;
  if (!Array.isArray(content)) return undefined;
  const toolResult = content.find(part => isRecord(part) && part.type === "tool-result");
  return typeof toolResult?.isError === "boolean" ? toolResult.isError : undefined;
}

function validationStatusForSuccess(success) {
  return success === false ? "failed" : success === true ? "succeeded" : "unknown";
}

function inferArtifactKind(path) {
  const extension = normalizeExtension(path);
  if (["c", "cc", "cpp", "css", "go", "h", "hpp", "java", "js", "jsx", "kt", "mjs",
    "php", "py", "rb", "rs", "swift", "ts", "tsx", "vue"].includes(extension)) return "code";
  if (["md", "mdx", "rst", "txt", "adoc", "doc", "docx", "pdf"].includes(extension)) return "document";
  if (["bat", "ps1", "sh", "workflow", "yml", "yaml"].includes(extension)) return "automation";
  if (["gif", "jpeg", "jpg", "mov", "mp3", "mp4", "png", "svg", "wav", "webp"].includes(extension)) return "creative";
  return "other";
}

function normalizeExtension(value) {
  if (typeof value !== "string") return "";
  return value.toLowerCase().split(/[\\/.]/).pop() ?? "";
}

function optionalAttribute(key, value) {
  return value === undefined ? {} : { [key]: value };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
