import {
  assertAllowed,
  assertBoolean,
  assertInteger,
  assertOptionalAllowed,
  assertOptionalBoolean,
  assertOptionalInteger,
  assertOptionalNonNegativeInteger,
  assertOptionalNonNegativeNumber,
  assertOptionalString,
  assertRecord,
  assertString,
  isPlainRecord,
  UarpValidationError
} from "./validation.mjs";
import { validateEvidenceRef } from "./evidence.mjs";
import { UARP_VERSION } from "./version.mjs";

export { UARP_VERSION } from "./version.mjs";

export const RUNTIME_EVENT_TYPES = Object.freeze([
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "agent.started",
  "agent.completed",
  "agent.failed",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "resource.activity",
  "resource.changed",
  "validation.started",
  "validation.completed",
  "artifact.created",
  "artifact.updated",
  "error.observed",
  "error.resolved",
  "usage.reported",
  "outcome.reported"
]);

export const RUNTIME_STATUSES = Object.freeze([
  "started",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "completed",
  "unknown"
]);

const RESOURCE_KINDS = ["file", "web", "database", "memory", "other"];
const RESOURCE_SCOPES = ["project", "workspace", "external", "mixed", "unknown"];
const RESOURCE_CHANGE_TYPES = ["created", "modified", "deleted", "renamed", "unknown"];
const TOOL_KINDS = ["shell", "search", "browser", "editor", "filesystem", "database", "api", "other"];
const TOOL_CATEGORIES = ["validation", "build", "search", "write", "read", "other"];
const VALIDATION_KINDS = ["test", "build", "lint", "typecheck", "review", "deploy", "acceptance", "other"];
const ARTIFACT_KINDS = ["code", "document", "research", "plan", "creative", "validation", "automation", "other"];
const ARTIFACT_RELATIONS = ["created", "updated", "submitted", "committed", "published", "other"];
const ERROR_SEVERITIES = ["info", "warning", "error", "critical"];
const ERROR_SOURCE_KINDS = ["tool", "validation", "runtime", "resource", "other"];

const FORBIDDEN_GAME_KEYS = new Set([
  "xp",
  "boss",
  "dungeon",
  "workshop",
  "loot_reward",
  "quest",
  "quest_state",
  "reward",
  "loot",
  "milestone",
  "skill_xp",
  "domain_progress",
  "building_state",
  "game_event"
]);

/**
 * @typedef {object} RuntimeEvent
 * @property {"0.1"} uarp_version
 * @property {string} event_id
 * @property {string} timestamp
 * @property {{adapter_id: string, adapter_version: string, harness_family?: string, harness_version?: string}} source
 * @property {{run_id: string, workspace_id?: string, project_id?: string, parent_run_id?: string, agent_id?: string, parent_agent_id?: string}} context
 * @property {string} type
 * @property {string=} status
 * @property {Record<string, unknown>} attributes
 * @property {Array<import("./evidence.mjs").EvidenceRef>=} evidence_refs
 * @property {{content_included: boolean, redaction_level: string, fields_redacted?: string[]}} privacy
 */

/** @param {unknown} value @returns {RuntimeEvent} */
export function validateRuntimeEvent(value) {
  const event = assertRecord(value, "event");
  assertNoGameSemantics(event, "event");

  if (event.uarp_version !== UARP_VERSION) {
    throw new UarpValidationError(
      "event.uarp_version",
      `must be exactly ${UARP_VERSION}`
    );
  }

  assertString(event.event_id, "event.event_id");
  validateTimestamp(event.timestamp);
  validateSource(event.source);
  validateContext(event.context);
  assertAllowed(event.type, "event.type", RUNTIME_EVENT_TYPES);
  assertOptionalAllowed(event.status, "event.status", RUNTIME_STATUSES);
  const attributes = assertRecord(event.attributes, "event.attributes");
  assertNoGameSemantics(attributes, "event.attributes");
  validateAttributes(event.type, attributes);
  validateEvidenceRefs(event.evidence_refs);
  validatePrivacy(event.privacy);

  return event;
}

export function parseRuntimeEvent(input) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      throw new UarpValidationError("event", "must be valid JSON");
    }
  }

  return validateRuntimeEvent(value);
}

function validateTimestamp(value) {
  assertString(value, "event.timestamp");
  if (Number.isNaN(Date.parse(value))) {
    throw new UarpValidationError("event.timestamp", "must be a valid ISO-8601 timestamp");
  }
}

function validateSource(value) {
  const source = assertRecord(value, "event.source");
  assertString(source.adapter_id, "event.source.adapter_id");
  assertString(source.adapter_version, "event.source.adapter_version");
  assertOptionalString(source.harness_family, "event.source.harness_family");
  assertOptionalString(source.harness_version, "event.source.harness_version");
}

function validateContext(value) {
  const context = assertRecord(value, "event.context");
  assertString(context.run_id, "event.context.run_id");
  assertOptionalString(context.workspace_id, "event.context.workspace_id");
  assertOptionalString(context.project_id, "event.context.project_id");
  assertOptionalString(context.parent_run_id, "event.context.parent_run_id");
  assertOptionalString(context.agent_id, "event.context.agent_id");
  assertOptionalString(context.parent_agent_id, "event.context.parent_agent_id");
}

function validateEvidenceRefs(value) {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new UarpValidationError("event.evidence_refs", "must be an array");
  }
  value.forEach((item, index) => validateEvidenceRef(item, `event.evidence_refs[${index}]`));
}

function validatePrivacy(value) {
  const privacy = assertRecord(value, "event.privacy");
  assertBoolean(privacy.content_included, "event.privacy.content_included");
  assertAllowed(privacy.redaction_level, "event.privacy.redaction_level", ["none", "standard", "strict"]);
  if (privacy.fields_redacted !== undefined) {
    if (!Array.isArray(privacy.fields_redacted)) {
      throw new UarpValidationError("event.privacy.fields_redacted", "must be an array");
    }
    privacy.fields_redacted.forEach((field, index) => {
      assertString(field, `event.privacy.fields_redacted[${index}]`);
    });
  }
}

function validateAttributes(type, attributes) {
  switch (type) {
    case "run.started":
      assertOptionalString(attributes.title, "event.attributes.title");
      assertOptionalBoolean(attributes.task_text_available, "event.attributes.task_text_available");
      assertOptionalString(attributes.resumed_from_run_id, "event.attributes.resumed_from_run_id");
      assertOptionalString(attributes.mode, "event.attributes.mode");
      break;
    case "run.completed":
    case "run.failed":
    case "run.cancelled":
      assertOptionalString(attributes.native_outcome, "event.attributes.native_outcome");
      assertOptionalNonNegativeInteger(attributes.duration_ms, "event.attributes.duration_ms");
      assertOptionalBoolean(attributes.output_summary_available, "event.attributes.output_summary_available");
      break;
    case "agent.started":
    case "agent.completed":
    case "agent.failed":
      validateAgentAttributes(attributes);
      break;
    case "tool.started":
    case "tool.completed":
    case "tool.failed":
      validateToolAttributes(attributes);
      break;
    case "resource.activity":
      validateResourceActivityAttributes(attributes);
      break;
    case "resource.changed":
      validateResourceChangedAttributes(attributes);
      break;
    case "validation.started":
    case "validation.completed":
      validateValidationAttributes(attributes);
      break;
    case "artifact.created":
    case "artifact.updated":
      validateArtifactAttributes(attributes);
      break;
    case "error.observed":
    case "error.resolved":
      validateErrorAttributes(attributes);
      break;
    case "usage.reported":
      validateUsageAttributes(attributes);
      break;
    case "outcome.reported":
      assertOptionalString(attributes.native_outcome, "event.attributes.native_outcome");
      assertOptionalString(attributes.summary, "event.attributes.summary");
      break;
    default:
      throw new UarpValidationError("event.type", `unsupported type ${type}`);
  }
}

function validateAgentAttributes(attributes) {
  assertOptionalString(attributes.role, "event.attributes.role");
  assertOptionalString(attributes.name, "event.attributes.name");
  assertOptionalString(attributes.purpose, "event.attributes.purpose");
}

function validateToolAttributes(attributes) {
  assertOptionalAllowed(attributes.tool_kind, "event.attributes.tool_kind", TOOL_KINDS);
  assertOptionalString(attributes.tool_name, "event.attributes.tool_name");
  assertOptionalNonNegativeInteger(attributes.duration_ms, "event.attributes.duration_ms");
  assertOptionalInteger(attributes.exit_code, "event.attributes.exit_code");
  assertOptionalBoolean(attributes.success, "event.attributes.success");
  assertOptionalAllowed(attributes.category_hint, "event.attributes.category_hint", TOOL_CATEGORIES);
}

function validateResourceActivityAttributes(attributes) {
  assertOptionalAllowed(attributes.resource_kind, "event.attributes.resource_kind", RESOURCE_KINDS);
  assertOptionalNonNegativeInteger(attributes.read_count, "event.attributes.read_count");
  assertOptionalNonNegativeInteger(attributes.search_count, "event.attributes.search_count");
  assertOptionalNonNegativeInteger(attributes.write_count, "event.attributes.write_count");
  assertOptionalNonNegativeInteger(attributes.resource_count, "event.attributes.resource_count");
  assertOptionalNonNegativeInteger(attributes.duration_ms, "event.attributes.duration_ms");
  assertOptionalAllowed(attributes.scope, "event.attributes.scope", RESOURCE_SCOPES);
}

function validateResourceChangedAttributes(attributes) {
  assertAllowed(attributes.resource_kind, "event.attributes.resource_kind", [
    ...RESOURCE_KINDS,
    "remote"
  ]);
  assertAllowed(attributes.change_type, "event.attributes.change_type", RESOURCE_CHANGE_TYPES);
  assertOptionalString(attributes.path_or_name, "event.attributes.path_or_name");
  assertOptionalString(attributes.extension, "event.attributes.extension");
  if (attributes.size_delta !== undefined) {
    assertInteger(attributes.size_delta, "event.attributes.size_delta");
  }
}

function validateValidationAttributes(attributes) {
  assertAllowed(attributes.kind, "event.attributes.kind", VALIDATION_KINDS);
  assertOptionalNonNegativeInteger(attributes.passed, "event.attributes.passed");
  assertOptionalNonNegativeInteger(attributes.failed, "event.attributes.failed");
  assertOptionalNonNegativeInteger(attributes.skipped, "event.attributes.skipped");
  assertOptionalNonNegativeInteger(attributes.total, "event.attributes.total");
  assertOptionalNonNegativeInteger(attributes.blockers, "event.attributes.blockers");
  assertOptionalNonNegativeInteger(attributes.duration_ms, "event.attributes.duration_ms");
  assertOptionalString(attributes.target, "event.attributes.target");

  if (attributes.total !== undefined) {
    const reported = [attributes.passed, attributes.failed, attributes.skipped]
      .filter((value) => value !== undefined)
      .reduce((sum, value) => sum + value, 0);
    if (reported > attributes.total) {
      throw new UarpValidationError(
        "event.attributes",
        "passed, failed, and skipped cannot exceed total"
      );
    }
  }
}

function validateArtifactAttributes(attributes) {
  assertString(attributes.artifact_id, "event.attributes.artifact_id");
  assertAllowed(attributes.kind, "event.attributes.kind", ARTIFACT_KINDS);
  assertOptionalString(attributes.name, "event.attributes.name");
  assertOptionalString(attributes.uri_or_path, "event.attributes.uri_or_path");
  assertOptionalString(attributes.mime_type, "event.attributes.mime_type");
  assertOptionalBoolean(attributes.durable, "event.attributes.durable");
  assertOptionalAllowed(attributes.relation, "event.attributes.relation", ARTIFACT_RELATIONS);
}

function validateErrorAttributes(attributes) {
  assertOptionalString(attributes.error_id, "event.attributes.error_id");
  assertOptionalString(attributes.kind, "event.attributes.kind");
  assertOptionalAllowed(attributes.severity, "event.attributes.severity", ERROR_SEVERITIES);
  assertOptionalBoolean(attributes.blocking, "event.attributes.blocking");
  assertOptionalAllowed(attributes.source_kind, "event.attributes.source_kind", ERROR_SOURCE_KINDS);
}

function validateUsageAttributes(attributes) {
  for (const key of ["input_tokens", "output_tokens", "total_tokens", "tool_calls", "model_calls", "duration_ms"]) {
    assertOptionalNonNegativeNumber(attributes[key], `event.attributes.${key}`);
  }
  assertOptionalNonNegativeNumber(attributes.estimated_cost, "event.attributes.estimated_cost");
  assertOptionalString(attributes.currency, "event.attributes.currency");
}

function assertNoGameSemantics(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoGameSemantics(item, `${path}[${index}]`));
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_GAME_KEYS.has(key.toLowerCase())) {
      throw new UarpValidationError(
        `${path}.${key}`,
        "game semantics are not allowed in UARP attributes"
      );
    }
    assertNoGameSemantics(child, `${path}.${key}`);
  }
}
