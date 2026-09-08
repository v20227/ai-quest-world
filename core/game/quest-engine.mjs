import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import {
  createEmptyDomainScores,
  validateSemanticRecord
} from "../semantic/semantic-types.mjs";
import {
  createEmptyActivityMix,
  QUEST_VERSION,
  validateQuest
} from "./quest-types.mjs";
import { classifyOutcome } from "./outcome-policy.mjs";

/**
 * Deterministic Quest and Run-to-Quest state machine.
 * It is the authority for Quest state, but does not award growth/rewards or
 * mutate World State in this slice.
 */
export class QuestEngine {
  #states = new Map();
  #runToQuest = new Map();
  #runRoots = new Map();
  #processedEventIds = new Set();

  /**
   * @param {unknown} input
   * @param {import("../semantic/semantic-types.mjs").SemanticRecord|null} [semanticRecord]
   * @returns {import("./quest-types.mjs").Quest|null}
   */
  ingest(input, semanticRecord = null) {
    const event = parseRuntimeEvent(input);
    if (this.#processedEventIds.has(event.event_id)) {
      return null;
    }

    const semantic = semanticRecord === null || semanticRecord === undefined
      ? null
      : validateSemanticRecord(semanticRecord);
    const rootRunId = this.#resolveRootRunId(event.context);
    if (semantic !== null && semantic.root_run_id !== rootRunId) {
      throw new QuestEngineError(
        `semantic record ${semantic.source_event_id} does not belong to root run ${rootRunId}`
      );
    }

    const state = this.#getOrCreateState(rootRunId, event);
    const quest = state.quest;
    const rootTerminal = isRootTerminal(event, rootRunId);
    const wasTerminal = isTerminalStatus(quest.status);

    state.events.push(cloneJson(event));
    addUnique(quest.event_ids, event.event_id);
    addUnique(quest.run_ids, event.context.run_id);
    if (event.context.agent_id !== undefined) {
      addUnique(quest.agent_ids, event.context.agent_id);
    }
    this.#runToQuest.set(event.context.run_id, quest.quest_id);

    if (isRootRunStarted(event, rootRunId) && quest.title === `Run ${rootRunId}`) {
      const title = event.attributes.title;
      if (title !== undefined) {
        quest.title = title;
      }
    }

    if (!wasTerminal && semantic !== null && !(isTerminalSemantic(semantic) && !rootTerminal)) {
      applySemanticRecord(quest, semantic);
    }

    const outcome = classifyOutcome(state.events, { rootRunId });
    quest.validation_summary = outcome.validation_summary;
    quest.artifact_refs = outcome.artifact_refs;

    if (!wasTerminal && rootTerminal) {
      quest.outcome_confidence = outcome.confidence;
      quest.status = outcome.confidence === "FAILED" ? "FAILED" : statusForTerminal(event.type);
      quest.phase = "RETURN";
    } else if (!wasTerminal) {
      applyLifecycleProgress(quest, event, semantic);
    }

    quest.updated_at = event.timestamp;
    validateQuest(quest);
    this.#processedEventIds.add(event.event_id);

    return cloneJson(quest);
  }

  /**
   * Ingest an event sequence and optionally match semantic records by source event ID.
   *
   * @param {unknown[]} events
   * @param {import("../semantic/semantic-types.mjs").SemanticRecord[]|{records?: import("../semantic/semantic-types.mjs").SemanticRecord[]}} [semanticRecords]
   * @returns {import("./quest-types.mjs").Quest[]}
   */
  process(events, semanticRecords = []) {
    if (!Array.isArray(events)) {
      throw new TypeError("events must be an array");
    }
    const records = Array.isArray(semanticRecords) ? semanticRecords : semanticRecords.records ?? [];
    const recordsByEventId = new Map(records.map((record) => [record.source_event_id, record]));
    for (const event of events) {
      const eventId = typeof event === "string" ? parseRuntimeEvent(event).event_id : event?.event_id;
      this.ingest(event, recordsByEventId.get(eventId) ?? null);
    }
    return this.getQuests();
  }

  /** @param {string} questId @returns {import("./quest-types.mjs").Quest|null} */
  getQuest(questId) {
    assertNonEmptyString(questId, "questId");
    const state = [...this.#states.values()].find((candidate) => candidate.quest.quest_id === questId);
    return state === undefined ? null : cloneJson(state.quest);
  }

  /** @param {string} runId @returns {import("./quest-types.mjs").Quest|null} */
  getQuestForRun(runId) {
    assertNonEmptyString(runId, "runId");
    const questId = this.#runToQuest.get(runId);
    return questId === undefined ? null : this.getQuest(questId);
  }

  /** @param {string} rootRunId @returns {import("./quest-types.mjs").Quest|null} */
  getQuestByRootRun(rootRunId) {
    assertNonEmptyString(rootRunId, "rootRunId");
    return this.getQuestForRun(rootRunId);
  }

  /** @returns {import("./quest-types.mjs").Quest[]} */
  getQuests() {
    return [...this.#states.values()].map((state) => cloneJson(state.quest));
  }

  reset() {
    this.#states.clear();
    this.#runToQuest.clear();
    this.#runRoots.clear();
    this.#processedEventIds.clear();
  }

  #getOrCreateState(rootRunId, event) {
    let state = this.#states.get(rootRunId);
    if (state !== undefined) {
      return state;
    }

    const title = isRootRunStarted(event, rootRunId) && event.attributes.title !== undefined
      ? event.attributes.title
      : `Run ${rootRunId}`;
    const domainScores = createEmptyDomainScores();
    const quest = {
      quest_version: QUEST_VERSION,
      quest_id: `quest:${rootRunId}`,
      root_run_id: rootRunId,
      title,
      status: "CANDIDATE",
      phase: "DEPART",
      outcome_confidence: null,
      primary_domain: null,
      secondary_domains: [],
      domain_scores: domainScores,
      activity_mix: createEmptyActivityMix(),
      run_ids: [],
      agent_ids: [],
      event_ids: [],
      validation_summary: createEmptyValidationSummary(),
      artifact_refs: [],
      created_at: event.timestamp,
      updated_at: event.timestamp
    };
    validateQuest(quest);
    state = { quest, events: [] };
    this.#states.set(rootRunId, state);
    this.#runToQuest.set(rootRunId, quest.quest_id);
    return state;
  }

  #resolveRootRunId(context) {
    const knownRoot = this.#runRoots.get(context.run_id);
    if (knownRoot !== undefined) {
      return knownRoot;
    }

    const rootRunId = context.parent_run_id === undefined
      ? context.run_id
      : this.#runRoots.get(context.parent_run_id) ?? context.parent_run_id;
    this.#runRoots.set(context.run_id, rootRunId);
    if (context.parent_run_id !== undefined && !this.#runRoots.has(context.parent_run_id)) {
      this.#runRoots.set(context.parent_run_id, rootRunId);
    }
    return rootRunId;
  }
}

export class QuestEngineError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "QuestEngineError";
  }
}

function applySemanticRecord(quest, record) {
  quest.phase = record.phase;
  for (const [domain, contribution] of Object.entries(record.domain_contributions)) {
    quest.domain_scores[domain] += contribution;
  }

  const rankedDomains = rankDomains(quest.domain_scores);
  quest.primary_domain = rankedDomains[0] ?? null;
  quest.secondary_domains = rankedDomains.slice(1);
  quest.activity_mix = calculateActivityMix(quest.domain_scores);
}

function applyLifecycleProgress(quest, event, semantic) {
  if (event.type === "validation.started" || event.type === "validation.completed" || semantic?.phase === "VALIDATE") {
    quest.status = "VALIDATING";
    return;
  }
  if (quest.status === "CANDIDATE" && semantic !== null && semantic.kind !== "run_started") {
    quest.status = "ACTIVE";
  }
}

function statusForTerminal(type) {
  switch (type) {
    case "run.completed":
      return "COMPLETED";
    case "run.failed":
      return "FAILED";
    case "run.cancelled":
      return "CANCELLED";
    default:
      throw new QuestEngineError(`unsupported terminal event ${type}`);
  }
}

function createEmptyValidationSummary() {
  return {
    attempted: false,
    success_count: 0,
    failure_count: 0,
    latest_kind: null,
    latest_status: null,
    latest_passed: null,
    latest_failed: null,
    latest_total: null,
    latest_blockers: null
  };
}

function rankDomains(domainScores) {
  return Object.keys(domainScores)
    .filter((domain) => domainScores[domain] > 0)
    .sort((left, right) => {
      const difference = domainScores[right] - domainScores[left];
      if (difference !== 0) {
        return difference;
      }
      return Object.keys(domainScores).indexOf(left) - Object.keys(domainScores).indexOf(right);
    });
}

function calculateActivityMix(domainScores) {
  const domains = Object.keys(domainScores);
  const total = domains.reduce((sum, domain) => sum + domainScores[domain], 0);
  if (total === 0) {
    return createEmptyActivityMix();
  }

  const mix = createEmptyActivityMix();
  let remaining = 100;
  domains.slice(0, -1).forEach((domain) => {
    const value = Math.min(
      remaining,
      roundPercentage((domainScores[domain] / total) * 100)
    );
    mix[domain] = value;
    remaining = Math.max(0, roundPercentage(remaining - value));
  });
  mix[domains.at(-1)] = roundPercentage(remaining);
  return mix;
}

function roundPercentage(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRootRunStarted(event, rootRunId) {
  return event.type === "run.started" &&
    event.context.run_id === rootRunId &&
    event.context.parent_run_id === undefined;
}

function isRootTerminal(event, rootRunId) {
  return event.context.run_id === rootRunId &&
    event.context.parent_run_id === undefined &&
    ["run.completed", "run.failed", "run.cancelled"].includes(event.type);
}

function isTerminalSemantic(record) {
  return ["run_completed", "run_failed", "run_cancelled"].includes(record.kind);
}

function isTerminalStatus(status) {
  return ["COMPLETED", "FAILED", "CANCELLED"].includes(status);
}

function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
