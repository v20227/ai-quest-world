import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { identifyValidation, validationMeasurements } from "../codex-cli/validation-command.mjs";
import { hasSqliteHeader, isProtectedArtifactPath } from "../../packages/adapter-core/artifact-privacy.mjs";

export const CODEX_DESKTOP_ADAPTER_ID = "codex-desktop";
export const CODEX_DESKTOP_ADAPTER_VERSION = "0.1.0";

const PRIVACY = Object.freeze({
  content_included: false,
  redaction_level: "strict"
});

/**
 * Read-only converter for Codex Desktop rollout JSONL files
 * (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`).
 *
 * The rollout envelope is `{timestamp, ordinal, type, payload}`. Only
 * metadata-bearing payloads are converted to UARP; reasoning, agent/user
 * messages, diffs and tool outputs are skipped entirely and never reach the
 * event store. Downstream layers receive only UARP facts.
 *
 * Event identity is derived from the stable rollout ordinal, so replaying
 * the same file produces identical event IDs (idempotent ingestion).
 * Rollouts carry no explicit terminal record; pass `assumeCompleted` to
 * synthesize `run.completed` for a file known to be a finished session.
 */

/** Payload item types that carry private content and must never be mapped. */
const SKIPPED_ITEM_TYPES = new Set([
  "reasoning", "Reasoning", "agent_message", "AgentMessage",
  "user_message", "UserMessage", "message", "Text", "text",
  "ContextCompaction", "summary_text", "input_text", "output_text", "text_result"
]);

/** Turn-level and bookkeeping event_msg payload types that are not UARP facts. */
const SKIPPED_EVENT_MSG_TYPES = new Set([
  "task_started", "task_complete", "token_count", "thread_settings_applied"
]);

/**
 * @param {string[]} lines raw rollout JSONL lines
 * @param {{
 *   runId?: string,
 *   title?: string,
 *   cwd?: string,
 *   assumeCompleted?: boolean,
 *   artifactPaths?: boolean,
 *   workspaceId?: string,
 *   projectId?: string,
 *   resumedFromRunId?: string,
 *   adapterId?: string,
 *   adapterVersion?: string
 * }} options
 *
 * Note: `session_meta.forked_from_id` is reported in `meta` but is NOT
 * auto-mapped to `resumed_from_run_id` — a fork is a fresh root until the
 * fork/spawn lineage is reconciled (docs/OBSERVER_FEASIBILITY.md risk 2).
 * Pass `resumedFromRunId` explicitly for a proven continuation.
 */
export async function parseRolloutSession(lines, options = {}) {
  const {
    runId,
    title,
    cwd: cwdOverride,
    assumeCompleted = false,
    artifactPaths = false,
    workspaceId,
    projectId,
    resumedFromRunId,
    adapterId = CODEX_DESKTOP_ADAPTER_ID,
    adapterVersion = CODEX_DESKTOP_ADAPTER_VERSION
  } = options;

  if (!Array.isArray(lines)) {
    throw new TypeError("rollout lines must be an array of strings");
  }

  const state = {
    context: {
      run_id: runId,
      ...(workspaceId === undefined ? {} : { workspace_id: workspaceId }),
      ...(projectId === undefined ? {} : { project_id: projectId })
    },
    title,
    resumedFromRunId,
    adapterId,
    adapterVersion,
    artifactPaths,
    assumeCompleted,
    events: [],
    seenTokens: new Set(),
    lastTimestampMs: 0,
    sequence: 0,
    cwd: cwdOverride,
    currentTimestamp: undefined,
    currentOrdinal: 0,
    meta: null
  };

  for (const line of lines) {
    state.sequence += 1;
    if (typeof line !== "string" || line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      emitRuntimeError(state, `jsonl-${state.sequence}`);
      continue;
    }
    await consumeRecord(state, record);
  }

  if (state.meta === null) {
    throw new Error("rollout file does not contain a session_meta record");
  }
  if (assumeCompleted) {
    emitEvent(state, "run-terminal", "run.completed", {
      native_outcome: "succeeded",
      output_summary_available: false
    }, "completed");
  }

  return { meta: state.meta, events: state.events };
}

/** Replay one rollout file into UARP events. */
export async function replayRolloutFile(filePath, options = {}) {
  const content = await readFile(filePath, "utf8");
  return parseRolloutSession(content.split("\n"), options);
}

async function consumeRecord(state, record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    emitRuntimeError(state, `record-${state.sequence}`);
    return;
  }
  const { type, payload, timestamp, ordinal } = record;
  state.currentTimestamp = timestamp;
  state.currentOrdinal = typeof ordinal === "number" ? ordinal : state.sequence;

  if (type === "session_meta") {
    consumeSessionMeta(state, payload);
    return;
  }
  if (state.meta === null) {
    return;
  }
  if (type === "event_msg") {
    await consumeEventMsg(state, payload);
    return;
  }
  if (type === "response_item") {
    consumeResponseItem(state, payload);
    return;
  }
  if (type === "token_usage_record") {
    consumeUsage(state, payload);
  }
}

function consumeSessionMeta(state, payload) {
  if (state.meta !== null || !isRecord(payload)) return;
  const sessionId = nonEmptyString(payload.session_id) ?? nonEmptyString(payload.id);
  if (sessionId === null) return;
  const forkedFrom = nonEmptyString(payload.forked_from_id);
  const cwd = nonEmptyString(payload.cwd);
  state.meta = {
    session_id: sessionId,
    forked_from_id: forkedFrom,
    cwd,
    originator: nonEmptyString(payload.originator) ?? "unknown",
    cli_version: nonEmptyString(payload.cli_version) ?? "unknown"
  };
  if (state.context.run_id === undefined) {
    state.context.run_id = `codex-desktop:${sessionId}`;
  }
  if (state.context.project_id === undefined && cwd !== null) {
    state.context.project_id = `cwd:${cwd}`;
  }
  if (state.cwd === undefined && cwd !== null) {
    state.cwd = cwd;
  }
  emitEvent(state, "run-started", "run.started", {
    ...(state.title === undefined ? {} : { title: state.title }),
    task_text_available: false,
    mode: "codex-desktop-replay",
    ...(state.resumedFromRunId === undefined ? {} : { resumed_from_run_id: state.resumedFromRunId })
  }, "started");
}

async function consumeEventMsg(state, payload) {
  if (!isRecord(payload)) return;
  const payloadType = payload.type;
  if (typeof payloadType !== "string") return;
  if (SKIPPED_EVENT_MSG_TYPES.has(payloadType)) return;
  if (payloadType === "item_started" || payloadType === "item_completed") {
    await consumeWorkItem(state, payload.item, payloadType === "item_started" ? "started" : "completed");
  }
}

function consumeResponseItem(state, payload) {
  if (!isRecord(payload)) return;
  if (payload.type === "custom_tool_call") {
    consumeCustomToolCall(state, payload);
  }
}

async function consumeWorkItem(state, item, phase) {
  if (!isRecord(item)) return;
  const itemType = typeof item.type === "string" ? item.type : "";
  if (itemType === "" || SKIPPED_ITEM_TYPES.has(itemType)) return;
  const itemId = nonEmptyString(item.id) ?? `line-${state.sequence}`;

  if (itemType === "CommandExecution") {
    await consumeCommandExecution(state, item, phase, itemId);
    return;
  }
  if (itemType === "FileChange") {
    await consumeFileChange(state, item, itemId);
    return;
  }
  if (["McpToolCall", "WebSearch", "WebSearchCall", "Extension"].includes(itemType)) {
    const success = phase === "completed" ? inferSuccess(item) : undefined;
    emitEvent(state,
      phase === "started" ? `tool-started-${itemId}` : `tool-completed-${itemId}`,
      phase === "started" ? "tool.started" : "tool.completed",
      {
        tool_kind: "api",
        tool_name: itemType,
        ...optionalAttribute("success", success)
      },
      phase === "started" ? "started" : statusForSuccess(success)
    );
  }
}

async function consumeCommandExecution(state, item, phase, itemId) {
  const command = commandText(item.command);
  const validation = command === null
    ? null
    : await identifyValidation(command, state.cwd ?? process.cwd());
  const success = phase === "completed" ? inferSuccess(item) : undefined;

  emitEvent(state,
    phase === "started" ? `tool-started-${itemId}` : `tool-completed-${itemId}`,
    phase === "started" ? "tool.started" : "tool.completed",
    {
      tool_kind: "shell",
      tool_name: "shell",
      category_hint: validation === null ? "other" : "validation",
      ...optionalAttribute("exit_code", safeInteger(item.exit_code)),
      ...optionalAttribute("success", success)
    },
    phase === "started" ? "started" : statusForSuccess(success)
  );

  if (validation === null) return;
  if (phase === "started") {
    emitEvent(state, `validation-started-${itemId}`, "validation.started", { ...validation }, "started");
    return;
  }
  const measurements = validationMeasurements(item.aggregated_output);
  const checked = Number.isSafeInteger(item.exit_code)
    ? item.exit_code !== 0 || success === false || (measurements.failed ?? 0) > 0
      ? false
      : validation.kind !== "test" || (measurements.passed ?? 0) > 0 ? true : undefined
    : undefined;
  emitEvent(state, `validation-completed-${itemId}`, "validation.completed",
    { ...validation, ...measurements }, validationStatusForSuccess(checked));
}

async function consumeFileChange(state, item, itemId) {
  const changes = isRecord(item.changes) ? Object.entries(item.changes)
    : [{ path: item.path, value: item }];
  let index = 0;
  for (const [path, value] of changes) {
    index += 1;
    if (typeof path !== "string" || path === "") continue;
    const changeType = inferChangeType(isRecord(value) ? value.type : undefined);
    const token = `${itemId}-${index}`;
    emitEvent(state, `resource-changed-${token}`, "resource.changed", {
      resource_kind: "file",
      change_type: changeType,
      ...optionalAttribute("extension", normalizeExtension(path) || undefined)
    }, "succeeded");
    if (state.artifactPaths === true && ["created", "modified", "renamed"].includes(changeType)) {
      await emitArtifact(state, path, changeType, token);
    }
  }
}

function consumeCustomToolCall(state, payload) {
  const itemId = nonEmptyString(payload.call_id) ?? `line-${state.sequence}`;
  const success = inferSuccess(payload);
  emitEvent(state, `tool-completed-${itemId}`, "tool.completed", {
    tool_kind: "api",
    tool_name: nonEmptyString(payload.name) ?? "custom-tool",
    ...optionalAttribute("success", success)
  }, statusForSuccess(success));
}

function consumeUsage(state, payload) {
  if (!isRecord(payload)) return;
  const attributes = {};
  for (const key of ["input_tokens", "output_tokens", "total_tokens", "tool_calls", "model_calls", "duration_ms"]) {
    const value = typeof payload[key] === "number" && Number.isFinite(payload[key]) && payload[key] >= 0
      ? payload[key]
      : undefined;
    if (value !== undefined) attributes[key] = value;
  }
  if (Object.keys(attributes).length > 0) {
    emitEvent(state, `usage-${state.currentOrdinal}`, "usage.reported", attributes);
  }
}

async function emitArtifact(state, path, changeType, token) {
  const artifact = await resolveArtifact(state, path);
  if (artifact === null) return;
  const artifactId = `codex-desktop:${state.context.run_id}:artifact:${artifact.id}`;
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

function emitRuntimeError(state, token) {
  emitEvent(state, `error-${token}`, "error.observed", {
    error_id: `codex-desktop-${token}`,
    kind: "codex-desktop-rollout",
    severity: "error",
    blocking: true,
    source_kind: "runtime"
  }, "failed");
}

function emitEvent(state, token, type, attributes, status, evidenceRefs) {
  if (state.seenTokens.has(token)) return;
  state.seenTokens.add(token);
  const event = {
    uarp_version: "0.1",
    event_id: `${state.adapterId}:${state.context.run_id}:${token}`,
    timestamp: nextTimestamp(state),
    source: {
      adapter_id: state.adapterId,
      adapter_version: state.adapterVersion,
      harness_family: "codex-desktop"
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

function nextTimestamp(state) {
  const parsed = Date.parse(state.currentTimestamp);
  const base = Number.isNaN(parsed) ? Date.now() : parsed;
  const next = Math.max(base, state.lastTimestampMs + 1);
  state.lastTimestampMs = next;
  return new Date(next).toISOString();
}

function commandText(command) {
  if (typeof command === "string" && command.trim() !== "") return command;
  if (Array.isArray(command) && command.every(part => typeof part === "string")) {
    const shell = command[0].match(/^(?:\/(?:usr\/)?bin\/)?(?:ba|z)?sh$/);
    if (shell !== null && /^-[lc]+$/.test(command[1] ?? "") && command.length === 3) {
      return command[2];
    }
    return command.join(" ");
  }
  return null;
}

function inferSuccess(item) {
  if (item.status === "failed" || item.status === "error") return false;
  if (typeof item.success === "boolean") return item.success;
  const exitCode = safeInteger(item.exit_code);
  if (exitCode !== undefined) return exitCode === 0;
  if (item.status === "completed" || item.status === "succeeded") return true;
  return undefined;
}

function statusForSuccess(success) {
  return success === false ? "failed" : success === true ? "succeeded" : "completed";
}

function validationStatusForSuccess(success) {
  return success === false ? "failed" : success === true ? "succeeded" : "unknown";
}

function inferChangeType(changeType) {
  switch (changeType) {
    case "add":
    case "create":
    case "created":
      return "created";
    case "delete":
    case "deleted":
      return "deleted";
    case "move":
    case "rename":
    case "renamed":
      return "renamed";
    case "update":
    case "updated":
    case "modify":
    case "modified":
      return "modified";
    default:
      return "unknown";
  }
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

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : undefined;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
