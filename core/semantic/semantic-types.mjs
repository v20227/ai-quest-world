import { isPlainRecord } from "../../packages/uarp/validation.mjs";

export const SEMANTIC_VERSION = "0.1";

export const SEMANTIC_PHASES = Object.freeze([
  "DEPART",
  "EXPLORE",
  "ACT",
  "VALIDATE",
  "RECOVER",
  "DELIVER",
  "RETURN"
]);

export const SEMANTIC_DOMAINS = Object.freeze([
  "Research",
  "Planning",
  "Engineering",
  "Debugging",
  "Creation",
  "Automation"
]);

export const SEMANTIC_KINDS = Object.freeze([
  "run_started",
  "exploration_activity",
  "implementation_activity",
  "validation_started",
  "validation_failure",
  "recovery_activity",
  "validation_success",
  "artifact_delivered",
  "run_completed",
  "run_failed",
  "run_cancelled"
]);

const FORBIDDEN_GAME_KEYS = new Set([
  "xp",
  "boss",
  "dungeon",
  "quest",
  "quest_state",
  "reward",
  "loot",
  "loot_reward",
  "milestone",
  "skill_xp",
  "domain_progress",
  "building_state",
  "world_state",
  "game_event"
]);

export class SemanticValidationError extends Error {
  /** @param {string} path @param {string} message */
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "SemanticValidationError";
    this.path = path;
  }
}

/**
 * @typedef {object} SemanticContext
 * @property {string} run_id
 * @property {string=} workspace_id
 * @property {string=} project_id
 * @property {string=} parent_run_id
 * @property {string=} agent_id
 * @property {string=} parent_agent_id
 */

/**
 * @typedef {object} SemanticRecord
 * @property {"0.1"} semantic_version
 * @property {string} semantic_id
 * @property {string} source_event_id
 * @property {string} timestamp
 * @property {{adapter_id: string, adapter_version: string, harness_family?: string, harness_version?: string}} source
 * @property {SemanticContext} context
 * @property {string} root_run_id
 * @property {string} phase
 * @property {string} kind
 * @property {number} impact
 * @property {number} visibility
 * @property {Record<string, number>} domain_contributions
 * @property {string} signal
 */

/** @returns {Record<string, number>} */
export function createEmptyDomainScores() {
  return Object.fromEntries(SEMANTIC_DOMAINS.map((domain) => [domain, 0]));
}

/**
 * Validate a semantic record without introducing game-state authority.
 *
 * @param {unknown} value
 * @param {string} [path]
 * @returns {SemanticRecord}
 */
export function validateSemanticRecord(value, path = "semantic_record") {
  const record = assertPlainRecord(value, path);
  assertNoGameSemantics(record, path);

  if (record.semantic_version !== SEMANTIC_VERSION) {
    throw new SemanticValidationError(
      `${path}.semantic_version`,
      `must be exactly ${SEMANTIC_VERSION}`
    );
  }

  assertNonEmptyString(record.semantic_id, `${path}.semantic_id`);
  assertNonEmptyString(record.source_event_id, `${path}.source_event_id`);
  assertTimestamp(record.timestamp, `${path}.timestamp`);
  validateSource(record.source, `${path}.source`);
  validateContext(record.context, `${path}.context`);
  assertNonEmptyString(record.root_run_id, `${path}.root_run_id`);
  assertAllowed(record.phase, `${path}.phase`, SEMANTIC_PHASES);
  assertAllowed(record.kind, `${path}.kind`, SEMANTIC_KINDS);
  assertBoundedNumber(record.impact, `${path}.impact`, 0, 5);
  assertBoundedInteger(record.visibility, `${path}.visibility`, 0, 5);
  validateDomainContributions(record.domain_contributions, `${path}.domain_contributions`);
  assertNonEmptyString(record.signal, `${path}.signal`);

  return record;
}

function validateSource(value, path) {
  const source = assertPlainRecord(value, path);
  assertNonEmptyString(source.adapter_id, `${path}.adapter_id`);
  assertNonEmptyString(source.adapter_version, `${path}.adapter_version`);
  assertOptionalString(source.harness_family, `${path}.harness_family`);
  assertOptionalString(source.harness_version, `${path}.harness_version`);
}

function validateContext(value, path) {
  const context = assertPlainRecord(value, path);
  assertNonEmptyString(context.run_id, `${path}.run_id`);
  for (const key of [
    "workspace_id",
    "project_id",
    "parent_run_id",
    "agent_id",
    "parent_agent_id"
  ]) {
    assertOptionalString(context[key], `${path}.${key}`);
  }
}

function validateDomainContributions(value, path) {
  const scores = assertPlainRecord(value, path);
  for (const domain of SEMANTIC_DOMAINS) {
    assertBoundedNumber(scores[domain], `${path}.${domain}`, 0, 5);
  }
}

function assertPlainRecord(value, path) {
  if (!isPlainRecord(value)) {
    throw new SemanticValidationError(path, "must be a plain object");
  }
  return value;
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SemanticValidationError(path, "must be a non-empty string");
  }
}

function assertOptionalString(value, path) {
  if (value !== undefined) {
    assertNonEmptyString(value, path);
  }
}

function assertAllowed(value, path, allowed) {
  if (!allowed.includes(value)) {
    throw new SemanticValidationError(path, `must be one of: ${allowed.join(", ")}`);
  }
}

function assertTimestamp(value, path) {
  assertNonEmptyString(value, path);
  if (Number.isNaN(Date.parse(value))) {
    throw new SemanticValidationError(path, "must be a valid ISO-8601 timestamp");
  }
}

function assertBoundedNumber(value, path, minimum, maximum) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new SemanticValidationError(
      path,
      `must be a finite number between ${minimum} and ${maximum}`
    );
  }
}

function assertBoundedInteger(value, path, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new SemanticValidationError(
      path,
      `must be an integer between ${minimum} and ${maximum}`
    );
  }
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
      throw new SemanticValidationError(
        `${path}.${key}`,
        "game state and reward fields are not allowed"
      );
    }
    assertNoGameSemantics(child, `${path}.${key}`);
  }
}
