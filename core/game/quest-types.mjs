import { isPlainRecord } from "../../packages/uarp/validation.mjs";
import {
  SEMANTIC_DOMAINS,
  SEMANTIC_PHASES
} from "../semantic/semantic-types.mjs";

export const QUEST_VERSION = "0.1";

export const QUEST_STATUSES = Object.freeze([
  "CANDIDATE",
  "ACTIVE",
  "VALIDATING",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
]);

export const OUTCOME_CONFIDENCES = Object.freeze([
  "VERIFIED",
  "SUPPORTED",
  "UNVERIFIED",
  "FAILED",
  "CANCELLED"
]);

export class QuestValidationError extends Error {
  /** @param {string} path @param {string} message */
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "QuestValidationError";
    this.path = path;
  }
}

/** @returns {Record<string, number>} */
export function createEmptyActivityMix() {
  return Object.fromEntries(SEMANTIC_DOMAINS.map((domain) => [domain, 0]));
}

/**
 * @typedef {object} Quest
 * @property {"0.1"} quest_version
 * @property {string} quest_id
 * @property {string} root_run_id
 * @property {string} title
 * @property {string} status
 * @property {string} phase
 * @property {string|null} outcome_confidence
 * @property {{estimated: number|null, observed: number|null}} [difficulty]
 * @property {string|null} primary_domain
 * @property {string[]} secondary_domains
 * @property {Record<string, number>} domain_scores
 * @property {Record<string, number>} activity_mix
 * @property {string[]} run_ids
 * @property {string[]} agent_ids
 * @property {string[]} event_ids
 * @property {{attempted: boolean, success_count: number, failure_count: number, latest_kind: string|null, latest_status: string|null, latest_passed: number|null, latest_failed: number|null, latest_total: number|null, latest_blockers: number|null}} validation_summary
 * @property {Array<Record<string, unknown>>} artifact_refs
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {unknown} value
 * @param {string} [path]
 * @returns {Quest}
 */
export function validateQuest(value, path = "quest") {
  const quest = assertPlainRecord(value, path);
  assertExact(quest.quest_version, QUEST_VERSION, `${path}.quest_version`);
  assertNonEmptyString(quest.quest_id, `${path}.quest_id`);
  assertNonEmptyString(quest.root_run_id, `${path}.root_run_id`);
  assertNonEmptyString(quest.title, `${path}.title`);
  assertAllowed(quest.status, `${path}.status`, QUEST_STATUSES);
  assertAllowed(quest.phase, `${path}.phase`, SEMANTIC_PHASES);
  if (quest.difficulty !== undefined) {
    const difficulty = assertPlainRecord(quest.difficulty, `${path}.difficulty`);
    for (const key of ["estimated", "observed"]) {
      const level = difficulty[key];
      if (level !== null && (!Number.isInteger(level) || level < 1 || level > 5)) {
        throw new QuestValidationError(`${path}.difficulty.${key}`, "must be null or an integer between 1 and 5");
      }
    }
    if (difficulty.observed !== null && !["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status)) {
      throw new QuestValidationError(`${path}.difficulty.observed`, "requires a terminal Quest");
    }
  }
  if (quest.outcome_confidence !== null) {
    assertAllowed(quest.outcome_confidence, `${path}.outcome_confidence`, OUTCOME_CONFIDENCES);
  }
  if (quest.primary_domain !== null) {
    assertAllowed(quest.primary_domain, `${path}.primary_domain`, SEMANTIC_DOMAINS);
  }
  validateStringArray(quest.secondary_domains, `${path}.secondary_domains`);
  for (const domain of quest.secondary_domains) {
    assertAllowed(domain, `${path}.secondary_domains`, SEMANTIC_DOMAINS);
  }
  validateScores(quest.domain_scores, `${path}.domain_scores`, Number.POSITIVE_INFINITY);
  validateScores(quest.activity_mix, `${path}.activity_mix`, 100);
  validateStringArray(quest.run_ids, `${path}.run_ids`);
  validateStringArray(quest.agent_ids, `${path}.agent_ids`);
  validateStringArray(quest.event_ids, `${path}.event_ids`);
  validateValidationSummary(quest.validation_summary, `${path}.validation_summary`);
  validateArtifactRefs(quest.artifact_refs, `${path}.artifact_refs`);
  assertTimestamp(quest.created_at, `${path}.created_at`);
  assertTimestamp(quest.updated_at, `${path}.updated_at`);
  if (quest.settlement_snapshot !== undefined) {
    const settlement = assertPlainRecord(quest.settlement_snapshot, `${path}.settlement_snapshot`);
    if (settlement.settlement_snapshot !== undefined) throw new QuestValidationError(path, "settlement cannot be nested");
    validateQuest(settlement, `${path}.settlement_snapshot`);
    if (settlement.quest_id !== quest.quest_id || settlement.root_run_id !== quest.root_run_id || !["COMPLETED", "FAILED", "CANCELLED"].includes(settlement.status)) {
      throw new QuestValidationError(path, "settlement must be terminal and belong to this Quest");
    }
  }

  return quest;
}

function validateValidationSummary(value, path) {
  const summary = assertPlainRecord(value, path);
  if (typeof summary.attempted !== "boolean") {
    throw new QuestValidationError(`${path}.attempted`, "must be a boolean");
  }
  assertNonNegativeInteger(summary.success_count, `${path}.success_count`);
  assertNonNegativeInteger(summary.failure_count, `${path}.failure_count`);
  for (const key of ["latest_kind", "latest_status"]) {
    if (summary[key] !== null && (typeof summary[key] !== "string" || summary[key].trim().length === 0)) {
      throw new QuestValidationError(`${path}.${key}`, "must be a non-empty string or null");
    }
  }
  for (const key of ["latest_passed", "latest_failed", "latest_total", "latest_blockers"]) {
    if (summary[key] !== null) {
      assertNonNegativeInteger(summary[key], `${path}.${key}`);
    }
  }
}

function validateArtifactRefs(value, path) {
  if (!Array.isArray(value)) {
    throw new QuestValidationError(path, "must be an array");
  }
  value.forEach((artifact, index) => {
    const artifactPath = `${path}[${index}]`;
    const record = assertPlainRecord(artifact, artifactPath);
    assertNonEmptyString(record.artifact_id, `${artifactPath}.artifact_id`);
    assertNonEmptyString(record.kind, `${artifactPath}.kind`);
    for (const key of ["name", "uri_or_path", "mime_type", "relation"]) {
      if (record[key] !== undefined && (typeof record[key] !== "string" || record[key].trim().length === 0)) {
        throw new QuestValidationError(`${artifactPath}.${key}`, "must be a non-empty string");
      }
    }
    if (record.durable !== undefined && typeof record.durable !== "boolean") {
      throw new QuestValidationError(`${artifactPath}.durable`, "must be a boolean");
    }
    if (record.evidence_refs !== undefined && !Array.isArray(record.evidence_refs)) {
      throw new QuestValidationError(`${artifactPath}.evidence_refs`, "must be an array");
    }
  });
}

function validateScores(value, path, maximum) {
  const scores = assertPlainRecord(value, path);
  for (const domain of SEMANTIC_DOMAINS) {
    const score = scores[domain];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > maximum) {
      throw new QuestValidationError(`${path}.${domain}`, `must be a finite number between 0 and ${maximum}`);
    }
  }
}

function validateStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw new QuestValidationError(path, "must be an array");
  }
  value.forEach((item, index) => assertNonEmptyString(item, `${path}[${index}]`));
}

function assertPlainRecord(value, path) {
  if (!isPlainRecord(value)) {
    throw new QuestValidationError(path, "must be a plain object");
  }
  return value;
}

function assertExact(value, expected, path) {
  if (value !== expected) {
    throw new QuestValidationError(path, `must be exactly ${expected}`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new QuestValidationError(path, "must be a non-empty string");
  }
}

function assertAllowed(value, path, allowed) {
  if (!allowed.includes(value)) {
    throw new QuestValidationError(path, `must be one of: ${allowed.join(", ")}`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new QuestValidationError(path, "must be a non-negative safe integer");
  }
}

function assertTimestamp(value, path) {
  assertNonEmptyString(value, path);
  if (Number.isNaN(Date.parse(value))) {
    throw new QuestValidationError(path, "must be a valid ISO-8601 timestamp");
  }
}
