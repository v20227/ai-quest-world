import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { RunLineage, orderRuntimeEvents } from "../../packages/uarp/run-lineage.mjs";
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
import { createDifficultyBasis, estimateDifficulty, updateDifficultyBasis } from "./difficulty-policy.mjs";
import { buildExpedition } from "./expedition-policy.mjs";

/**
 * Deterministic Quest and Run-to-Quest state machine.
 * It is the authority for Quest state, but does not award growth/rewards or
 * mutate World State in this slice.
 */
export class QuestEngine {
  #states = new Map();
  #runToQuest = new Map();
  #lineage = new RunLineage();
  #processedEventIds = new Set();
  #history = new Map();
  #semanticHistory = new Map();

  /**
   * @param {unknown} input
   * @param {import("../semantic/semantic-types.mjs").SemanticRecord|null} [semanticRecord]
   * @returns {import("./quest-types.mjs").Quest|null}
   */
  ingest(input, semanticRecord = null) {
    const event = parseRuntimeEvent(input);
    if (this.#history.has(event.event_id)) return null;
    const snapshot = Array.isArray(semanticRecord);
    const events = orderRuntimeEvents([...this.#history.values(), event]);
    const lineage = new RunLineage(events);
    if (!snapshot && (events.at(-1).event_id !== event.event_id || [...this.#history.values()].some(previous =>
      lineage.rootFor(previous.context.run_id) !== this.#lineage.rootFor(previous.context.run_id)))) {
      throw new QuestEngineError("Late or re-associated input requires the complete current semantic record array");
    }
    this.process([event], snapshot ? semanticRecord : [...this.#semanticHistory.values(), ...(semanticRecord === null ? [] : [semanticRecord])]);
    return this.getQuestForRun(event.context.run_id);
  }

  #ingestKnown(input, semanticRecord = null, { clone = true } = {}) {
    const event = parseRuntimeEvent(input);
    if (this.#processedEventIds.has(event.event_id)) {
      return null;
    }

    const semantic = semanticRecord === null || semanticRecord === undefined
      ? null
      : validateSemanticRecord(semanticRecord);
    this.#lineage.observe(event);
    const rootRunId = this.#lineage.rootFor(event.context.run_id);
    if (rootRunId === null) return null;
    if (semantic !== null && semantic.root_run_id !== rootRunId) {
      throw new QuestEngineError(
        `semantic record ${semantic.source_event_id} does not belong to root run ${rootRunId}`
      );
    }

    const state = this.#getOrCreateState(rootRunId, event);
    const quest = state.quest;
    const driver = this.#lineage.isDriver(event.context.run_id);
    const finalSettlement = quest.settlement_snapshot?.status === "COMPLETED"
      && ["VERIFIED", "SUPPORTED"].includes(quest.settlement_snapshot.outcome_confidence);
    if (event.type === "run.started" && driver && !finalSettlement) {
      state.driver = event.context.run_id;
      quest.status = "CANDIDATE";
      quest.outcome_confidence = null;
      quest.phase = "DEPART";
      quest.difficulty.observed = null;
    }
    const rootTerminal = driver && event.context.run_id === state.driver && isTerminalType(event.type);
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
      updateDifficultyBasis(state.difficultyBasis, semantic);
      quest.difficulty.estimated = estimateDifficulty(state.difficultyBasis);
    }

    // 结果证据只在验证/产物/结算事件时变化——其余事件不重算（否则随任务增长退化为 O(n²)）。
    let outcome = null;
    const affectsOutcome = rootTerminal || state.events.length === 1
      || event.type.startsWith("validation.") || event.type.startsWith("artifact.");
    if (affectsOutcome) {
      outcome = classifyOutcome(state.events, { rootRunId: state.driver, primaryDomain: quest.primary_domain });
      quest.validation_summary = outcome.validation_summary;
      quest.artifact_refs = outcome.artifact_refs;
    }

    if (!wasTerminal && rootTerminal) {
      state.terminalEventIds.add(event.event_id);
      quest.outcome_confidence = outcome.confidence;
      quest.status = outcome.confidence === "FAILED" ? "FAILED" : statusForTerminal(event.type);
      quest.phase = "RETURN";
      quest.difficulty.observed = quest.difficulty.estimated;
    } else if (!wasTerminal) {
      applyLifecycleProgress(quest, event, semantic);
    }

    quest.updated_at = event.timestamp;
    // 远征足迹：同一阶段内的连续事件不重算（否则每个事件全量重扫 = O(n²)），
    // 仅在阶段/类型推进或结算时重建；结束时全量重建一次保证精确水位。
    const lastRecord = semantic;
    const lastStep = quest.expedition?.steps?.at(-1);
    const continuesStep = lastRecord !== null && lastStep !== undefined
      && lastRecord.phase === lastStep.phase && lastRecord.kind === lastStep.kind;
    if (rootTerminal || !quest.expedition || !continuesStep) {
      quest.expedition = buildExpedition(quest, state.events, [...this.#semanticHistory.values()], state.terminalEventIds);
    }
    if (!wasTerminal && rootTerminal) {
      const { settlement_snapshot, ...settlement } = quest;
      quest.settlement_snapshot = cloneJson(settlement);
    }
    validateQuest(quest);
    this.#processedEventIds.add(event.event_id);

    return clone ? cloneJson(quest) : quest;
  }

  /**
   * Retain factual history and replace its semantic projection with the complete
   * current record snapshot, including removal of retracted interpretations.
   *
   * @param {unknown[]} events
   * @param {import("../semantic/semantic-types.mjs").SemanticRecord[]|{records?: import("../semantic/semantic-types.mjs").SemanticRecord[]}} [semanticRecords]
   * @returns {import("./quest-types.mjs").Quest[]}
   */
  /**
   * 增量入口：事件按全局时间序到达时，仅处理新事件（保留任务状态与谱系），
   * 不清空、不重放历史。返回本批触碰到的任务快照。
   * @param {unknown[]} events 已按全局序排列的事件批次
   * @param {import("../semantic/semantic-types.mjs").SemanticRecord[]} records 本批新产生的语义记录
   * @returns {Array<Record<string, unknown>>}
   */
  ingestBatch(events, records = []) {
    if (!Array.isArray(events)) {
      throw new TypeError("events must be an array");
    }
    for (const record of records) {
      this.#semanticHistory.set(record.source_event_id, validateSemanticRecord(record));
    }
    const touchedStates = new Set();
    for (const input of events) {
      const quest = this.#ingestKnown(input, this.#semanticHistory.get(parseRuntimeEvent(input).event_id) ?? null, { clone: false });
      if (quest !== null) touchedStates.add(quest);
    }
    // 每个任务只在批次末尾克隆一次——逐事件克隆会让内存分配随任务长度退化为 O(n²)。
    return [...touchedStates].map(quest => cloneJson(quest));
  }

  process(events, semanticRecords = []) {    if (!Array.isArray(events)) {
      throw new TypeError("events must be an array");
    }
    const records = Array.isArray(semanticRecords) ? semanticRecords : semanticRecords.records ?? [];
    for (const event of events.map(parseRuntimeEvent)) if (!this.#history.has(event.event_id)) this.#history.set(event.event_id, event);
    this.#semanticHistory.clear();
    for (const record of records) this.#semanticHistory.set(record.source_event_id, validateSemanticRecord(record));
    events = orderRuntimeEvents([...this.#history.values()]);
    this.#states.clear();
    this.#runToQuest.clear();
    this.#processedEventIds.clear();
    this.#lineage = new RunLineage(events);
    for (const event of events) {
      if (this.#lineage.rootFor(event.context.run_id) === null) continue;
      const record = this.#semanticHistory.get(event.event_id);
      this.#ingestKnown(event, record ? { ...record, root_run_id: this.#lineage.rootFor(event.context.run_id) } : null);
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
    this.#lineage = new RunLineage();
    this.#processedEventIds.clear();
    this.#history.clear();
    this.#semanticHistory.clear();
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
      difficulty: { estimated: null, observed: null },
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
    state = { quest, events: [], driver: rootRunId, terminalEventIds: new Set(), difficultyBasis: createDifficultyBasis() };
    this.#states.set(rootRunId, state);
    this.#runToQuest.set(rootRunId, quest.quest_id);
    return state;
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

function isTerminalType(type) { return ["run.completed", "run.failed", "run.cancelled"].includes(type); }

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
