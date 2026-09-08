import {
  SEMANTIC_DOMAINS,
  SEMANTIC_KINDS,
  validateSemanticRecord
} from "../semantic/semantic-types.mjs";
import { validateQuest } from "./quest-types.mjs";
import {
  PROGRESSION_VERSION,
  validateProgressionSnapshot
} from "./progression-types.mjs";

export const SEMANTIC_XP_WEIGHTS = Object.freeze({
  run_started: 0,
  exploration_activity: 2,
  implementation_activity: 6,
  validation_started: 1,
  validation_failure: 4,
  recovery_activity: 5,
  validation_success: 6,
  artifact_delivered: 8,
  run_completed: 0,
  run_failed: 0,
  run_cancelled: 0
});

export const SEMANTIC_XP_CAPS = Object.freeze({
  run_started: 0,
  exploration_activity: 4,
  implementation_activity: 12,
  validation_started: 2,
  validation_failure: 4,
  recovery_activity: 10,
  validation_success: 8,
  artifact_delivered: 8,
  run_completed: 0,
  run_failed: 0,
  run_cancelled: 0
});

export const OUTCOME_MULTIPLIERS = Object.freeze({
  VERIFIED: 1,
  SUPPORTED: 0.75,
  UNVERIFIED: 0.4,
  FAILED: 0.25,
  CANCELLED: 0.1
});

export const OUTCOME_BONUSES = Object.freeze({
  VERIFIED: 12,
  SUPPORTED: 6,
  UNVERIFIED: 1,
  FAILED: 0,
  CANCELLED: 0
});

export const DOMAIN_PROGRESS_CAP = 12;
export const VALIDATION_FAILURE_CREDIT_CAP = SEMANTIC_XP_CAPS.validation_failure;

export function describeProgression(input) {
  const progression = validateProgressionSnapshot(input);
  return {
    quest_id: progression.quest_id,
    resolution: progression.resolution,
    outcome_confidence: progression.outcome_confidence,
    outcome_multiplier: progression.resolution === "RESOLVED" ? OUTCOME_MULTIPLIERS[progression.outcome_confidence] : 0,
    activity_xp: progression.semantic_credit.activity_xp,
    outcome_bonus: progression.semantic_credit.outcome_bonus,
    total_xp: progression.skill_xp,
    contributions: Object.entries(progression.semantic_credit.by_kind).filter(([, xp]) => xp > 0).map(([kind, xp]) => ({ kind, xp })),
    capped_kinds: [...progression.anti_abuse.capped_kinds],
    domain_progress: { ...progression.domain_progress },
    domain_progress_cap: DOMAIN_PROGRESS_CAP,
    credited_artifact_ids: progression.loot_refs.map(artifact => artifact.artifact_id),
    settled_at: progression.resolution === "RESOLVED" ? progression.quest_snapshot.updated_at : null
  };
}

const DOMAIN_CREDIT_CAP = 20;

/**
 * Calculate a deterministic, bounded progression snapshot from one Quest.
 * Raw volume metrics are intentionally absent from the inputs and cannot
 * become progression by accident.
 *
 * @param {unknown} questInput
 * @param {unknown[]|{records?: unknown[]}} [semanticInputs]
 * @returns {Record<string, unknown>}
 */
export function calculateProgression(questInput, semanticInputs = []) {
  const quest = validateQuest(questInput);
  if (quest.settlement_snapshot !== undefined) {
    const records = Array.isArray(semanticInputs) ? semanticInputs : semanticInputs.records;
    if (!Array.isArray(records)) throw new TypeError("semantic records must be an array");
    const ids = new Set(quest.settlement_snapshot.event_ids);
    return calculateProgression(quest.settlement_snapshot, records.filter(record => ids.has(record.source_event_id)));
  }
  const inputs = Array.isArray(semanticInputs)
    ? semanticInputs
    : semanticInputs !== null && typeof semanticInputs === "object" && Array.isArray(semanticInputs.records)
      ? semanticInputs.records
      : null;
  if (inputs === null) {
    throw new TypeError("semantic records must be an array or an object with a records array");
  }

  const records = [];
  const seenSourceEventIds = new Set();
  let duplicateSemanticCount = 0;
  for (const input of inputs) {
    const record = validateSemanticRecord(input);
    if (record.root_run_id !== quest.root_run_id) {
      throw new ProgressionPolicyError(
        `semantic record ${record.source_event_id} does not belong to Quest ${quest.quest_id}`
      );
    }
    if (!quest.event_ids.includes(record.source_event_id)) {
      throw new ProgressionPolicyError(
        `semantic record ${record.source_event_id} is not attached to Quest ${quest.quest_id}`
      );
    }
    if (seenSourceEventIds.has(record.source_event_id)) {
      duplicateSemanticCount += 1;
      continue;
    }
    seenSourceEventIds.add(record.source_event_id);
    records.push(record);
  }

  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(quest.status);
  const outcomeConfidence = isTerminal ? quest.outcome_confidence ?? "UNVERIFIED" : null;
  const outcomeMultiplier = isTerminal ? OUTCOME_MULTIPLIERS[outcomeConfidence] : 0;
  const resolution = isTerminal ? "RESOLVED" : "PENDING";
  const kindOccurrences = new Map();
  const rawCreditByKind = Object.fromEntries(SEMANTIC_KINDS.map((kind) => [kind, 0]));
  const rawDomainProgress = Object.fromEntries(SEMANTIC_DOMAINS.map((domain) => [domain, 0]));
  const cappedKinds = new Set();
  let repeatedFailureCount = 0;
  let repeatedFailureRawCredit = 0;

  for (const record of records) {
    const occurrence = (kindOccurrences.get(record.kind) ?? 0) + 1;
    kindOccurrences.set(record.kind, occurrence);
    if (record.kind === "validation_failure" && occurrence > 1) {
      repeatedFailureCount += 1;
    }

    const diminishingFactor = creditFactor(occurrence);
    const rawCredit = Math.min(
      SEMANTIC_XP_WEIGHTS[record.kind] * diminishingFactor,
      Math.max(0, SEMANTIC_XP_CAPS[record.kind] - rawCreditByKind[record.kind])
    );
    rawCreditByKind[record.kind] += rawCredit;
    if (record.kind === "validation_failure" && occurrence > 1) {
      repeatedFailureRawCredit += rawCredit;
    }
    if (rawCreditByKind[record.kind] >= SEMANTIC_XP_CAPS[record.kind] && SEMANTIC_XP_CAPS[record.kind] > 0) {
      cappedKinds.add(record.kind);
    }

    for (const domain of SEMANTIC_DOMAINS) {
      rawDomainProgress[domain] = Math.min(
        DOMAIN_CREDIT_CAP,
        rawDomainProgress[domain] + record.domain_contributions[domain] * diminishingFactor
      );
    }
  }

  const creditByKind = Object.fromEntries(
    SEMANTIC_KINDS.map((kind) => [kind, roundNonNegative(rawCreditByKind[kind] * outcomeMultiplier)])
  );
  const activityXp = Object.values(creditByKind).reduce((sum, credit) => sum + credit, 0);
  const hasMeaningfulWork = records.some(record => !["run_started", "run_completed", "run_failed", "run_cancelled"].includes(record.kind));
  const outcomeBonus = isTerminal && hasMeaningfulWork ? OUTCOME_BONUSES[outcomeConfidence] : 0;
  const domainProgress = Object.fromEntries(
    SEMANTIC_DOMAINS.map((domain) => [
      domain,
      isTerminal
        ? Math.min(DOMAIN_PROGRESS_CAP, roundNonNegative(rawDomainProgress[domain] * outcomeMultiplier))
        : 0
    ])
  );

  const progression = {
    progression_version: PROGRESSION_VERSION,
    quest_id: quest.quest_id,
    root_run_id: quest.root_run_id,
    status: quest.status,
    outcome_confidence: quest.outcome_confidence,
    resolution,
    skill_xp: activityXp + outcomeBonus,
    domain_progress: domainProgress,
    semantic_credit: {
      activity_xp: activityXp,
      outcome_bonus: outcomeBonus,
      by_kind: creditByKind
    },
    anti_abuse: {
      duplicate_semantic_count: duplicateSemanticCount,
      unique_semantic_count: records.length,
      repeated_failure_count: repeatedFailureCount,
      repeated_failure_credit: roundNonNegative(repeatedFailureRawCredit * outcomeMultiplier),
      repeated_failure_credit_cap: VALIDATION_FAILURE_CREDIT_CAP,
      capped_kinds: [...cappedKinds]
    },
    loot_refs: createLootReferences(quest),
    quest_snapshot: cloneJson(quest)
  };

  validateProgressionSnapshot(progression);
  return cloneJson(progression);
}

export class ProgressionPolicyError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ProgressionPolicyError";
  }
}

function creditFactor(occurrence) {
  if (occurrence === 1) {
    return 1;
  }
  if (occurrence === 2) {
    return 0.5;
  }
  if (occurrence === 3) {
    return 0.25;
  }
  return 0.1;
}

function createLootReferences(quest) {
  if (quest.status !== "COMPLETED" || !["VERIFIED", "SUPPORTED"].includes(quest.outcome_confidence)) {
    return [];
  }

  return quest.artifact_refs
    .filter(isRealArtifactReference)
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id))
    .map((artifact) => ({
      artifact_id: artifact.artifact_id,
      kind: artifact.kind,
      source_quest_id: quest.quest_id,
      ...(artifact.name === undefined ? {} : { name: artifact.name }),
      ...(artifact.uri_or_path === undefined ? {} : { uri_or_path: artifact.uri_or_path }),
      ...(artifact.mime_type === undefined ? {} : { mime_type: artifact.mime_type }),
      ...(artifact.relation === undefined ? {} : { relation: artifact.relation }),
      evidence_refs: cloneJson(artifact.evidence_refs ?? [])
    }));
}

function isRealArtifactReference(artifact) {
  if (artifact.durable !== true || artifact.has_reference === false) {
    return false;
  }
  return artifact.has_reference === true ||
    (typeof artifact.uri_or_path === "string" && artifact.uri_or_path.trim().length > 0) ||
    (Array.isArray(artifact.evidence_refs) && artifact.evidence_refs.length > 0);
}

function roundNonNegative(value) {
  return Math.max(0, Math.round(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
