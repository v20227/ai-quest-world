import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { realpath, stat, open } from "node:fs/promises";
import { relative, resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { identifyValidation, validationMeasurements } from "./validation-command.mjs";
import { hasSqliteHeader, isProtectedArtifactPath } from "../../packages/adapter-core/artifact-privacy.mjs";

import { createCapabilities } from "../../packages/uarp/capabilities.mjs";
import { assertRuntimeObserver } from "../../packages/adapter-core/contracts.mjs";
import { ObservationInterrupted } from "../../packages/adapter-core/observation-interrupted.mjs";

export const CODEX_CLI_ADAPTER_ID = "codex-cli";
export const CODEX_CLI_ADAPTER_VERSION = "0.1.3";

const PRIVACY = Object.freeze({
  content_included: false,
  redaction_level: "strict"
});

/**
 * Read-only adapter for the public `codex exec --json` JSONL stream.
 * Source-specific parsing ends here; downstream layers receive only UARP
 * facts and never see Codex reasoning or message content.
 */
export class CodexCliHarnessAdapter {
  #executable;
  #cwd;
  #env;
  #prompt;
  #title;
  #runId;
  #workspaceId;
  #projectId;
  #agentId;
  #extraArgs;
  #ephemeral;
  #clock;
  #spawnProcess;
  #child = null;
  #running = false;
  #stopRequested = false;
  #outputSequence = 0;
  #lastTimestamp = 0;
  #hadTurnFailure = false;
  #threadId = null;
  #artifactPaths;
  #seenTokens = new Set();
  #pendingArtifacts = new Map();
  #input;
  #lineReader = null;
  #turnCompleted = false;
  #turnCount = 0;
  #resumedFromRunId;
  #streamPhase = "thread";

  /**
   * @param {{
   *   executable?: string,
   *   cwd?: string,
   *   env?: NodeJS.ProcessEnv,
   *   prompt: string,
   *   title?: string,
   *   runId?: string,
   *   workspaceId?: string,
   *   projectId?: string,
   *   agentId?: string,
   *   extraArgs?: string[],
   *   ephemeral?: boolean,
   *   clock?: () => string,
   *   spawnProcess?: typeof spawn
   *   artifactPaths?: boolean
   * }} options
   */
  constructor({
    executable = "codex",
    cwd = process.cwd(),
    env = process.env,
    prompt,
    title,
    runId = `codex-cli-${Date.now().toString(36)}`,
    workspaceId,
    projectId,
    agentId,
    extraArgs = [],
    ephemeral = true,
    clock = () => new Date().toISOString(),
    spawnProcess = spawn,
    artifactPaths = false,
    input = null,
    resumedFromRunId
  } = {}) {
    assertNonEmptyString(executable, "executable");
    assertNonEmptyString(cwd, "cwd");
    if (input === null) assertNonEmptyString(prompt, "prompt");
    else if (typeof input[Symbol.asyncIterator] !== "function") throw new TypeError("input must be a readable stream");
    assertNonEmptyString(runId, "runId");
    if (title !== undefined) {
      assertNonEmptyString(title, "title");
    }
    if (workspaceId !== undefined) {
      assertNonEmptyString(workspaceId, "workspaceId");
    }
    if (projectId !== undefined) {
      assertNonEmptyString(projectId, "projectId");
    }
    if (agentId !== undefined) assertNonEmptyString(agentId, "agentId");
    this.#agentId = agentId;
    if (typeof ephemeral !== "boolean") {
      throw new TypeError("ephemeral must be a boolean");
    }
    if (!Array.isArray(extraArgs) || extraArgs.some((argument) => typeof argument !== "string")) {
      throw new TypeError("extraArgs must be an array of strings");
    }
    if (typeof clock !== "function") {
      throw new TypeError("clock must be a function");
    }
    if (typeof spawnProcess !== "function") {
      throw new TypeError("spawnProcess must be a function");
    }

    this.#executable = executable;
    this.#cwd = cwd;
    this.#env = env;
    this.#prompt = prompt;
    this.#title = title;
    this.#runId = runId;
    this.#workspaceId = workspaceId;
    this.#projectId = projectId;
    this.#extraArgs = [...extraArgs];
    this.#ephemeral = ephemeral;
    this.#clock = clock;
    this.#spawnProcess = spawnProcess;
    if (typeof artifactPaths !== "boolean") throw new TypeError("artifactPaths must be boolean");
    this.#artifactPaths = artifactPaths;
    if (resumedFromRunId !== undefined) assertNonEmptyString(resumedFromRunId, "resumedFromRunId");
    this.#input = input;
    this.#resumedFromRunId = resumedFromRunId;
  }

  /** @returns {Promise<boolean>} */
  async detect() {
    if (this.#input !== null) return true;
    return new Promise((resolve) => {
      let probe;
      try {
        probe = this.#spawnProcess(this.#executable, ["--version"], {
          cwd: this.#cwd,
          env: this.#env,
          stdio: "ignore"
        });
      } catch {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (available) => {
        if (!settled) {
          settled = true;
          resolve(available);
        }
      };
      probe.once("error", () => finish(false));
      probe.once("close", (code) => finish(code === 0));
    });
  }

  /** @returns {Promise<import("../../packages/uarp/capabilities.mjs").HarnessCapabilities>} */
  async getCapabilities() {
    return createCapabilities(CODEX_CLI_ADAPTER_ID, {
      observe: {
        run_lifecycle: true,
        subagents: false,
        tool_calls: true,
        resource_reads: false,
        resource_changes: true,
        validation: true,
        artifacts: this.#artifactPaths,
        errors: true,
        usage_tokens: true,
        usage_cost: false,
        outcome_evidence: true
      },
      content: {
        task_title: this.#title !== undefined,
        task_text: false,
        tool_arguments: false,
        resource_paths: false,
        artifact_paths: this.#artifactPaths,
        output_summary: false
      }
    });
  }

  /**
   * Start one Codex CLI run and translate its JSONL events until the process
   * exits. Codex itself remains the actor; this adapter only observes output.
   *
   * @param {import("../../packages/adapter-core/contracts.mjs").RuntimeObserver} observer
   * @returns {Promise<void>}
   */
  async start(observer) {
    assertRuntimeObserver(observer);
    if (this.#running) {
      return;
    }

    this.#running = true;
    this.#stopRequested = false;
    this.#outputSequence = 0;
    this.#lastTimestamp = 0;
    this.#hadTurnFailure = false;
    this.#threadId = null;
    this.#seenTokens.clear();
    this.#pendingArtifacts.clear();
    this.#turnCompleted = false;
    this.#turnCount = 0;
    this.#streamPhase = "thread";

    try {
      if (this.#input !== null) {
        this.#lineReader = createInterface({ input: this.#input });
        await this.#consumeOutput(this.#lineReader, observer);
        if (this.#stopRequested) throw new ObservationInterrupted("COLLECTOR_STOPPED");
        if (!this.#hadTurnFailure && (this.#threadId === null || !this.#turnCompleted)) throw new ObservationInterrupted();
        const outcome = this.#hadTurnFailure ? "failed" : "completed";
        await this.#emitTerminal(observer, outcome);
        return;
      }

      const args = ["exec", "--json"];
      if (this.#ephemeral) {
        args.push("--ephemeral");
      }
      args.push("--cd", this.#cwd, ...this.#extraArgs, this.#prompt);

      let child;
      try {
        child = this.#spawnProcess(this.#executable, args, {
          cwd: this.#cwd,
          env: this.#env,
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (error) {
        throw new ObservationInterrupted("PROCESS_UNAVAILABLE");
      }
      this.#child = child;
      child.stderr?.resume();

      const lineReader = createInterface({ input: child.stdout });
      const outputPromise = this.#consumeOutput(lineReader, observer).then(() => null, error => error);
      const result = await waitForExit(child);
      const outputError = await outputPromise;
      if (outputError) throw outputError;
      if (this.#stopRequested) throw new ObservationInterrupted("COLLECTOR_STOPPED");
      if (result.error !== null || result.code === null) throw new ObservationInterrupted("PROCESS_UNAVAILABLE");
      if (result.code === 0 && !this.#hadTurnFailure && (this.#threadId === null || !this.#turnCompleted)) throw new ObservationInterrupted();
      await this.#emitTerminal(observer, result.code === 0 && !this.#hadTurnFailure ? "completed" : "failed");
    } finally {
      this.#child = null;
      this.#lineReader = null;
      this.#running = false;
    }
  }

  /** Stop the active CLI process without sending it any new instruction. */
  async stop() {
    this.#stopRequested = true;
    this.#lineReader?.close();
    this.#child?.kill?.("SIGTERM");
  }

  get id() {
    return CODEX_CLI_ADAPTER_ID;
  }

  get isRunning() {
    return this.#running;
  }

  get runId() {
    return this.#runId;
  }

  get threadId() {
    return this.#threadId;
  }

  async #consumeOutput(lineReader, observer) {
    try {
      for await (const line of lineReader) {
        await this.#consumeLine(line, observer);
      }
    } finally {
      lineReader.close();
    }
  }

  async #consumeLine(line, observer) {
    this.#outputSequence += 1;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      throw new ObservationInterrupted("STREAM_INVALID");
    }
    if (!isRecord(message) || typeof message.type !== "string") {
      throw new ObservationInterrupted("STREAM_INVALID");
    }
    if (this.#input !== null && !this.#validPassiveMessage(message)) {
      throw new ObservationInterrupted("STREAM_INVALID");
    }

    switch (message.type) {
      case "thread.started":
        if (this.#threadId !== null && this.#threadId !== message.thread_id) {
          throw new ObservationInterrupted("STREAM_INVALID");
        }
        this.#threadId = typeof message.thread_id === "string" ? message.thread_id : null;
        if (this.#threadId === null) throw new ObservationInterrupted("STREAM_INVALID");
        await this.#emit(observer, "run.started", "run.started", {
          title: this.#title,
          task_text_available: false,
          mode: this.#input === null ? "codex-cli" : "codex-cli-stream",
          ...optionalAttribute("resumed_from_run_id", this.#resumedFromRunId)
        }, "started");
        return;
      case "turn.started":
        this.#turnCount += 1;
        if (this.#turnCount > 1) throw new ObservationInterrupted("STREAM_INVALID");
        return;
      case "item.started":
        if (this.#turnCompleted) throw new ObservationInterrupted("STREAM_INVALID");
        await this.#handleItem(message.item, "started", observer);
        return;
      case "item.completed":
        if (this.#turnCompleted) throw new ObservationInterrupted("STREAM_INVALID");
        await this.#handleItem(message.item, "completed", observer);
        return;
      case "turn.completed":
        if (this.#turnCompleted) return;
        this.#turnCompleted = true;
        await this.#handleUsage(message.usage, observer);
        return;
      case "turn.failed":
        this.#hadTurnFailure = true;
        await this.#emitRuntimeError(observer, "turn-failed");
        return;
      case "error":
      case "response.failed":
        this.#hadTurnFailure = true;
        await this.#emitRuntimeError(observer, "stream-error");
        return;
      default:
        return;
    }
  }

  async #handleItem(item, phase, observer) {
    if (!isRecord(item)) {
      return;
    }
    const itemType = typeof item.type === "string" ? item.type.toLowerCase() : "";
    const itemId = typeof item.id === "string" && item.id.length > 0
      ? item.id
      : `line-${this.#outputSequence}`;
    if (itemType === "error") { await this.#emitRuntimeError(observer, `item-${itemId}`); return; }

    if (itemType === "command_execution") {
      const success = phase === "completed" ? inferSuccess(item) : undefined;
      const validation = await identifyValidation(item.command, this.#cwd);
      const attributes = {
        tool_kind: "shell",
        tool_name: "shell",
        category_hint: validation === null ? "other" : "validation",
        ...optionalAttribute("exit_code", safeInteger(item.exit_code)),
        ...optionalAttribute("success", success)
      };
      await this.#emit(
        observer,
        phase === "started" ? `tool-started-${itemId}` : `tool-completed-${itemId}`,
        phase === "started" ? "tool.started" : "tool.completed",
        attributes,
        phase === "started" ? "started" : statusForSuccess(success)
      );
      if (validation !== null) {
        if (phase === "started") {
          await this.#emit(observer, `validation-started-${itemId}`, "validation.started", {
            ...validation
          }, "started");
        } else {
          const measurements = validationMeasurements(item.aggregated_output);
          const checked = Number.isSafeInteger(item.exit_code)
            ? item.exit_code !== 0 || success === false || (measurements.failed ?? 0) > 0
              ? false
              : validation.kind !== "test" || (measurements.passed ?? 0) > 0 ? true : undefined
            : undefined;
          await this.#emit(observer, `validation-completed-${itemId}`, "validation.completed", {
            ...validation,
            ...measurements
          }, validationStatusForSuccess(checked));
        }
      }
      return;
    }

    if (itemType === "file_change") {
      if (phase === "completed" && inferSuccess(item) === true) {
        const changes = Array.isArray(item.changes) && item.changes.length > 0
          ? item.changes
          : [item];
        for (const [index, change] of changes.entries()) {
          const normalizedChange = isRecord(change) ? change : {};
          const changeType = inferChangeType(normalizedChange, item);
          const token = `${itemId}-${index}`;
          const path = normalizedChange.path ?? normalizedChange.new_path ?? item.path;
          const artifact = this.#artifactPaths ? await this.#resolveArtifact(path) : null;
          await this.#emit(observer, `resource-changed-${token}`, "resource.changed", {
            resource_kind: "file",
            change_type: changeType,
            ...optionalAttribute("extension", normalizeExtension(path) || undefined)
          });
          if (artifact !== null && ["created", "modified", "renamed"].includes(changeType)) {
            this.#pendingArtifacts.set(artifact.id, { path, changeType });
          }
        }
      }
      return;
    }

    if (itemType.includes("tool_call") || itemType.includes("web_search_call")) {
      const success = phase === "completed" ? inferSuccess(item) : undefined;
      await this.#emit(
        observer,
        phase === "started" ? `tool-started-${itemId}` : `tool-completed-${itemId}`,
        phase === "started" ? "tool.started" : "tool.completed",
        {
          tool_kind: "api",
          tool_name: "external-tool",
          ...optionalAttribute("success", success)
        },
        phase === "started" ? "started" : statusForSuccess(success)
      );
    }
  }

  #validPassiveMessage(message) {
    if (["error", "response.failed"].includes(message.type)) return true;
    if (message.type === "thread.started") {
      if (this.#streamPhase !== "thread" || typeof message.thread_id !== "string" || !message.thread_id.trim()) return false;
      this.#streamPhase = "turn"; return true;
    }
    if (message.type === "turn.started") {
      if (this.#streamPhase !== "turn") return false;
      this.#streamPhase = "active"; return true;
    }
    if (["turn.completed", "turn.failed"].includes(message.type)) {
      if (this.#streamPhase !== "active") return false;
      this.#streamPhase = "ended"; return true;
    }
    if (!["item.started", "item.updated", "item.completed"].includes(message.type) || this.#streamPhase !== "active") return false;
    const item = message.item;
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || !["agent_message", "reasoning", "command_execution", "file_change", "mcp_tool_call", "web_search", "web_search_call", "todo_list", "error"].includes(item.type)) return false;
    if (item.type === "command_execution" && (typeof item.command !== "string" || !item.command.trim())) return false;
    if (item.type === "file_change" && (!Array.isArray(item.changes) || item.changes.some(change => !isRecord(change) || typeof change.path !== "string" || !change.path.trim() || typeof change.kind !== "string"))) return false;
    if (message.type === "item.completed" && item.type === "file_change" && !["completed", "succeeded", "failed", "error"].includes(item.status)) return false;
    return true;
  }

  async #handleUsage(usage, observer) {
    if (!isRecord(usage)) {
      return;
    }
    const attributes = {};
    for (const key of ["input_tokens", "output_tokens", "total_tokens", "tool_calls", "model_calls", "duration_ms"]) {
      const value = safeNonNegativeNumber(usage[key]);
      if (value !== undefined) {
        attributes[key] = value;
      }
    }
    if (Object.keys(attributes).length > 0) {
      await this.#emit(observer, `usage-${this.#outputSequence}`, "usage.reported", attributes);
    }
  }

  async #emitRuntimeError(observer, token) {
    await this.#emit(observer, `error-${token}`, "error.observed", {
      error_id: `codex-${token}`,
      kind: "codex-cli-stream",
      severity: "error",
      blocking: true,
      source_kind: "runtime"
    }, "failed");
    this.#hadTurnFailure = true;
  }

  async #emitTerminal(observer, outcome) {
    for (const { path, changeType } of this.#pendingArtifacts.values()) {
      const artifact = await this.#resolveArtifact(path);
      if (artifact === null) continue;
      const artifactId = `codex:${this.#runId}:artifact:${artifact.id}`;
      await this.#emit(observer, `artifact-${artifact.id}`,
        changeType === "created" ? "artifact.created" : "artifact.updated",
        { artifact_id: artifactId, kind: inferArtifactKind(path), uri_or_path: artifact.uri,
          durable: true, relation: changeType === "created" ? "created" : "updated" },
        undefined, [{ id: artifactId, kind: "artifact", uri: artifact.uri, content_available: false }]);
    }
    const type = outcome === "completed"
      ? "run.completed"
      : outcome === "cancelled" ? "run.cancelled" : "run.failed";
    const status = outcome === "completed"
      ? "completed"
      : outcome === "cancelled" ? "cancelled" : "failed";
    await this.#emit(observer, "run-terminal", type, {
      native_outcome: outcome === "completed" ? "succeeded" : outcome,
      output_summary_available: false
    }, status);
  }

  async #emit(observer, token, type, attributes, status, evidenceRefs) {
    if (this.#seenTokens.has(token)) return;
    this.#seenTokens.add(token);
    const event = {
      uarp_version: "0.1",
      event_id: `codex-cli:${this.#runId}:${token}`,
      timestamp: this.#nextTimestamp(),
      source: {
        adapter_id: CODEX_CLI_ADAPTER_ID,
        adapter_version: CODEX_CLI_ADAPTER_VERSION,
        harness_family: "codex-cli"
      },
      context: {
        run_id: this.#runId,
        ...(this.#workspaceId === undefined ? {} : { workspace_id: this.#workspaceId }),
        ...(this.#projectId === undefined ? {} : { project_id: this.#projectId }),
        ...(this.#agentId === undefined ? {} : { agent_id: this.#agentId })
      },
      type,
      attributes,
      privacy: { ...PRIVACY },
      ...(evidenceRefs === undefined ? {} : { evidence_refs: evidenceRefs }),
      ...(status === undefined ? {} : { status })
    };
    await observer.emit(event);
  }

  async #resolveArtifact(path) {
    if (typeof path !== "string" || path.length === 0) return null;
    try {
      const root = await realpath(this.#cwd);
      const resolved = await realpath(resolve(root, path));
      const local = relative(root, resolved);
      if (isAbsolute(local) || local.startsWith("..") || isProtectedArtifactPath(local)) return null;
      if (!(await stat(resolved)).isFile()) return null;
      const handle = await open(resolved, "r");
      try {
        const header = Buffer.alloc(16); const { bytesRead } = await handle.read(header, 0, 16, 0);
        if (hasSqliteHeader(header.subarray(0, bytesRead))) return null;
      } finally { await handle.close(); }
      return { id: createHash("sha256").update(resolved).digest("hex"), uri: pathToFileURL(resolved).href };
    } catch { return null; }
  }

  #nextTimestamp() {
    const value = Date.parse(this.#clock());
    if (Number.isNaN(value)) {
      throw new CodexCliAdapterError("clock must return a valid ISO-8601 timestamp");
    }
    const next = Math.max(value, this.#lastTimestamp + 1);
    this.#lastTimestamp = next;
    return new Date(next).toISOString();
  }
}

export class CodexCliAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "CodexCliAdapterError";
  }
}

function waitForExit(child) {
  return new Promise((resolve) => {
    let error = null;
    child.once("error", (value) => {
      error = value;
    });
    child.once("close", (code, signal) => resolve({ code, signal, error }));
  });
}

function inferSuccess(item) {
  if (item.status === "failed" || item.status === "error") return false;
  if (typeof item.success === "boolean") {
    return item.success;
  }
  const exitCode = safeInteger(item.exit_code);
  if (exitCode !== undefined) {
    return exitCode === 0;
  }
  if (item.status === "failed" || item.status === "error") {
    return false;
  }
  if (item.status === "completed" || item.status === "succeeded") {
    return true;
  }
  return undefined;
}

function statusForSuccess(success) {
  return success === false ? "failed" : success === true ? "succeeded" : "completed";
}

function validationStatusForSuccess(success) {
  return success === false ? "failed" : success === true ? "succeeded" : "unknown";
}

function inferChangeType(change, item) {
  const value = change.kind ?? change.change_type ?? item.change_type;
  switch (value) {
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
    case "modify":
    case "modified":
    case "update":
    case "updated":
      return "modified";
    default:
      return "unknown";
  }
}

function inferArtifactKind(path) {
  const extension = normalizeExtension(path);
  if ([
    "c", "cc", "cpp", "css", "go", "h", "hpp", "java", "js", "jsx", "kt", "mjs",
    "php", "py", "rb", "rs", "swift", "ts", "tsx", "vue"
  ].includes(extension)) {
    return "code";
  }
  if (["md", "mdx", "rst", "txt", "adoc", "doc", "docx", "pdf"].includes(extension)) {
    return "document";
  }
  if (["bat", "ps1", "sh", "workflow", "yml", "yaml"].includes(extension)) {
    return "automation";
  }
  if (["gif", "jpeg", "jpg", "mov", "mp3", "mp4", "png", "svg", "wav", "webp"].includes(extension)) {
    return "creative";
  }
  return "other";
}

function normalizeExtension(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase().split(/[\\/.]/).pop() ?? "";
}

function optionalAttribute(key, value) {
  return value === undefined ? {} : { [key]: value };
}

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : undefined;
}

function safeNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
