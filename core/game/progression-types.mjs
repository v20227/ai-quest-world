import { isPlainRecord } from "../../packages/uarp/validation.mjs";
import {
  OUTCOME_CONFIDENCES,
  QUEST_STATUSES,
  validateQuest
} from "./quest-types.mjs";
import {
  SEMANTIC_DOMAINS,
  SEMANTIC_KINDS
} from "../semantic/semantic-types.mjs";

export const PROGRESSION_VERSION = "0.1";

export const PROGRESSION_RESOLUTIONS = Object.freeze([
  "PENDING",
  "RESOLVED"
]);

export class ProgressionValidationError extends Error {
  /** @param {string} path @param {string} message */
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ProgressionValidationError";
    this.path = path;
  }
}

/**
 * Validate a deterministic progression snapshot before it crosses a Game
 * Core boundary.
 *
 * @param {unknown} value
 * @param {string} [path]
 * @returns {Record<string, unknown>}
 */
export function validateProgressionSnapshot(value, path = "progression") {
  const progression = assertPlainRecord(value, path);
  assertExact(progression.progression_version, PROGRESSION_VERSION, `${path}.progression_version`);
  assertNonEmptyString(progression.quest_id, `${path}.quest_id`);
  assertNonEmptyString(progression.root_run_id, `${path}.root_run_id`);
  assertAllowed(progression.status, `${path}.status`, QUEST_STATUSES);
  if (progression.outcome_confidence !== null) {
    assertAllowed(progression.outcome_confidence, `${path}.outcome_confidence`, OUTCOME_CONFIDENCES);
  }
  assertAllowed(progression.resolution, `${path}.resolution`, PROGRESSION_RESOLUTIONS);
  assertNonNegativeInteger(progression.skill_xp, `${path}.skill_xp`);
  validateScores(progression.domain_progress, `${path}.domain_progress`, 100);
  validateSemanticCredit(progression.semantic_credit, `${path}.semantic_credit`);
  validateAntiAbuse(progression.anti_abuse, `${path}.anti_abuse`);
  validateLootRefs(progression.loot_refs, `${path}.loot_refs`);

  const quest = validateQuest(progression.quest_snapshot, `${path}.quest_snapshot`);
  if (quest.quest_id !== progression.quest_id) {
    throw new ProgressionValidationError(
      `${path}.quest_id`,
      "must match quest_snapshot.quest_id"
    );
  }
  if (quest.root_run_id !== progression.root_run_id) {
    throw new ProgressionValidationError(
      `${path}.root_run_id`,
      "must match quest_snapshot.root_run_id"
    );
  }

  return progression;
}

function validateSemanticCredit(value, path) {
  const credit = assertPlainRecord(value, path);
  assertNonNegativeInteger(credit.activity_xp, `${path}.activity_xp`);
  assertNonNegativeInteger(credit.outcome_bonus, `${path}.outcome_bonus`);
  const byKind = assertPlainRecord(credit.by_kind, `${path}.by_kind`);
  for (const kind of SEMANTIC_KINDS) {
    assertNonNegativeInteger(byKind[kind], `${path}.by_kind.${kind}`);
  }
}

function validateAntiAbuse(value, path) {
  const antiAbuse = assertPlainRecord(value, path);
  for (const key of [
    "duplicate_semantic_count",
    "unique_semantic_count",
    "repeated_failure_count",
    "repeated_failure_credit",
    "repeated_failure_credit_cap"
  ]) {
    assertNonNegativeInteger(antiAbuse[key], `${path}.${key}`);
  }
  validateStringArray(antiAbuse.capped_kinds, `${path}.capped_kinds`);
  for (const kind of antiAbuse.capped_kinds) {
    assertAllowed(kind, `${path}.capped_kinds`, SEMANTIC_KINDS);
  }
}

function validateLootRefs(value, path) {
  if (!Array.isArray(value)) {
    throw new ProgressionValidationError(path, "must be an array");
  }
  value.forEach((loot, index) => {
    const lootPath = `${path}[${index}]`;
    const record = assertPlainRecord(loot, lootPath);
    for (const key of ["artifact_id", "kind", "source_quest_id"]) {
      assertNonEmptyString(record[key], `${lootPath}.${key}`);
    }
    if (record.evidence_refs !== undefined && !Array.isArray(record.evidence_refs)) {
      throw new ProgressionValidationError(`${lootPath}.evidence_refs`, "must be an array");
    }
    for (const key of ["name", "uri_or_path", "mime_type", "relation"]) {
      if (record[key] !== undefined) {
        assertNonEmptyString(record[key], `${lootPath}.${key}`);
      }
    }
  });
}

function validateScores(value, path, maximum) {
  const scores = assertPlainRecord(value, path);
  for (const domain of SEMANTIC_DOMAINS) {
    const score = scores[domain];
    if (!Number.isSafeInteger(score) || score < 0 || score > maximum) {
      throw new ProgressionValidationError(
        `${path}.${domain}`,
        `must be an integer between 0 and ${maximum}`
      );
    }
  }
}

function validateStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw new ProgressionValidationError(path, "must be an array");
  }
  value.forEach((item, index) => assertNonEmptyString(item, `${path}[${index}]`));
}

function assertPlainRecord(value, path) {
  if (!isPlainRecord(value)) {
    throw new ProgressionValidationError(path, "must be a plain object");
  }
  return value;
}

function assertExact(value, expected, path) {
  if (value !== expected) {
    throw new ProgressionValidationError(path, `must be exactly ${expected}`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProgressionValidationError(path, "must be a non-empty string");
  }
}

function assertAllowed(value, path, allowed) {
  if (!allowed.includes(value)) {
    throw new ProgressionValidationError(path, `must be one of: ${allowed.join(", ")}`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProgressionValidationError(path, "must be a non-negative safe integer");
  }
}
