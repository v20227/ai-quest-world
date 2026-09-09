import { parseRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import {
  SEMANTIC_DOMAINS
} from "../semantic/semantic-types.mjs";
import { validateProgressionSnapshot } from "../game/progression-types.mjs";
import {
  ACTIVITY_HALF_LIFE_MS,
  WORLD_MILESTONE_IDS,
  createInitialWorldState,
  validateWorldState
} from "./world-state-types.mjs";

const WORKSHOP_DOMAINS = ["Engineering", "Debugging", "Automation"];
const LIBRARY_DOMAINS = ["Research", "Planning"];
const CREDIBLE_OUTCOMES = new Set(["VERIFIED", "SUPPORTED"]);
const TERMINAL_EVENT_TYPES = new Set(["run.completed", "run.failed", "run.cancelled"]);

export function describeWorldGoals(input) {
  const world = validateWorldState(input);
  return [
    { goal_id: "gate_connected", target: "gate", achieved: world.gate.first_connected_at !== null, requirement: "observed_run_started", domains: [] },
    { goal_id: "guild_restored", target: "guild", achieved: world.guild.state === "RESTORED", requirement: "credible_completion", domains: [] },
    { goal_id: "workshop_unlocked", target: "workshop", achieved: world.workshop.state !== "LOCKED", requirement: "credible_domain_progress", domains: [...WORKSHOP_DOMAINS] },
    { goal_id: "library_unlocked", target: "library", achieved: world.library.state !== "LOCKED", requirement: "credible_domain_progress", domains: [...LIBRARY_DOMAINS] },
    ...["first_qualifying_completion", "first_artifact", "first_verified_outcome"].map(goalId => ({
      goal_id: goalId, target: "chronicle", achieved: world.milestones.some(milestone => milestone.milestone_id === goalId),
      requirement: goalId, domains: []
    }))
  ];
}

/**
 * Deterministic authoritative World State projection.
 * Runtime events control activity; resolved progression controls permanent
 * cumulative progress and unlocks. A renderer is never involved here.
 */
export class WorldStateEngine {
  #state;
  #repository;
  #appliedInputIds = new Set();

  /**
   * @param {{repository?: {getState: () => unknown, commitInput: Function}, initialState?: unknown}=} options
   */
  constructor({ repository = null, initialState } = {}) {
    if (repository !== null && (
      typeof repository.getState !== "function" ||
      typeof repository.commitInput !== "function"
    )) {
      throw new TypeError("WorldStateEngine repository must expose getState and commitInput");
    }

    this.#repository = repository;
    this.#state = repository === null
      ? initialState === undefined ? createInitialWorldState() : validateWorldState(initialState)
      : validateWorldState(repository.getState());
    validateWorldState(this.#state);
  }

  /** @returns {Record<string, unknown>} */
  getState() {
    return cloneJson(this.#state);
  }

  /**
   * Apply one normalized runtime event. Every valid event is marked as
   * applied, including events that do not change a building state.
   *
   * @param {unknown} input
   * @returns {Record<string, unknown>|null}
   */
  ingest(input) {
    const event = parseRuntimeEvent(input);
    const inputId = `event:${event.event_id}`;
    if (this.#isApplied(inputId)) {
      return null;
    }

    const nextState = applyRuntimeEvent(this.#state, event);
    const result = this.#commit(inputId, "runtime_event", nextState);
    this.#state = validateWorldState(result.state);
    if (!result.applied) {
      return null;
    }
    this.#appliedInputIds.add(inputId);
    return this.getState();
  }

  /**
   * Apply one resolved Quest progression. Pending progressions are previews,
   * not rewards, and therefore do not create an applied-input marker.
   *
   * @param {unknown} input
   * @returns {Record<string, unknown>|null}
   */
  applyProgression(input) {
    const progression = validateProgressionSnapshot(input);
    if (progression.resolution !== "RESOLVED") {
      return null;
    }

    const inputId = `progression:${progression.quest_id}`;
    if (this.#isApplied(inputId)) {
      return null;
    }

    const nextState = applyProgression(this.#state, progression);
    const result = this.#commit(inputId, "quest_progression", nextState);
    this.#state = validateWorldState(result.state);
    if (!result.applied) {
      return null;
    }
    this.#appliedInputIds.add(inputId);
    return this.getState();
  }

  /**
   * Decay temporary activity to a supplied deterministic timestamp. Permanent
   * progression and unlocks are untouched.
   *
   * @param {string} timestamp
   * @returns {Record<string, unknown>|null}
   */
  advanceTo(timestamp) {
    assertTimestamp(timestamp, "timestamp");
    const inputId = `decay:${timestamp}`;
    if (this.#isApplied(inputId)) {
      return null;
    }

    const nextState = decayWorldActivity(this.#state, timestamp);
    const result = this.#commit(inputId, "activity_decay", nextState);
    this.#state = validateWorldState(result.state);
    if (!result.applied) {
      return null;
    }
    this.#appliedInputIds.add(inputId);
    return this.getState();
  }

  /**
   * Reset an in-memory projection. Durable repositories are intentionally
   * never cleared by this method.
   */
  reset() {
    if (this.#repository !== null) {
      throw new WorldStateEngineError("cannot reset a repository-backed World State");
    }
    this.#state = createInitialWorldState();
    this.#appliedInputIds.clear();
  }

  #isApplied(inputId) {
    if (this.#appliedInputIds.has(inputId)) {
      return true;
    }
    return false;
  }

  #commit(inputId, inputKind, nextState) {
    if (this.#repository === null) {
      return { applied: true, state: nextState };
    }
    return this.#repository.commitInput(inputId, inputKind, nextState);
  }
}

export class WorldStateEngineError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "WorldStateEngineError";
  }
}

function applyRuntimeEvent(state, event) {
  const next = cloneJson(state);
  next.updated_at = maxTimestamp(next.updated_at, event.timestamp);

  if (event.type === "run.started") {
    addUnique(next.active_run_ids, event.context.run_id);
    next.gate.connection_count += event.context.parent_run_id === undefined ? 1 : 0;
    next.gate.first_connected_at ??= event.timestamp;
    next.gate.state = "ACTIVE";
    next.gate.last_event_at = event.timestamp;
    setActivity(next.activity.gate, 100, event.timestamp);
  } else if (TERMINAL_EVENT_TYPES.has(event.type)) {
    removeValue(next.active_run_ids, event.context.run_id);
    next.gate.last_event_at = event.timestamp;
    next.gate.state = next.active_run_ids.length > 0
      ? "ACTIVE"
      : next.gate.first_connected_at === null ? "DORMANT" : "RETURNING";
    next.last_return_at = event.timestamp;
    setActivity(next.activity.gate, 60, event.timestamp);
  }

  return validateWorldState(next);
}

function applyProgression(state, progression) {
  const next = cloneJson(state);
  const quest = progression.quest_snapshot;
  const timestamp = quest.updated_at;
  const credible = CREDIBLE_OUTCOMES.has(progression.outcome_confidence);
  const qualifyingCompletion = quest.status === "COMPLETED" && credible;
  const changes = [];

  next.progression_totals.skill_xp += progression.skill_xp;
  for (const domain of SEMANTIC_DOMAINS) {
    next.progression_totals.domain_progress[domain] = Math.min(
      100,
      next.progression_totals.domain_progress[domain] + progression.domain_progress[domain]
    );
  }
  next.progression_totals.artifact_count += progression.loot_refs.length;
  next.last_quest_id = quest.quest_id;
  next.last_return_at = timestamp;
  next.updated_at = timestamp;

  if (qualifyingCompletion) {
    next.progression_totals.qualifying_quest_count += 1;
    next.guild.qualifying_quest_count += 1;
    if (addMilestone(next, "first_qualifying_completion", timestamp, quest.quest_id)) {
      changes.push(createHighlight("milestone_unlocked", "first_qualifying_completion", "First qualifying Quest", 5, quest.quest_id));
    }
    if (next.guild.state === "OLD") {
      next.guild.state = "RESTORED";
      next.guild.restored_at = timestamp;
      changes.push(createHighlight("guild_restored", "quest-guild", "Quest Guild restored", 5, quest.quest_id));
    }
  }

  if (credible && hasDomainProgress(progression, WORKSHOP_DOMAINS)) {
    addBuildingProgress(next.workshop, progression.domain_progress, WORKSHOP_DOMAINS);
    setActivity(next.activity.workshop, 85, timestamp);
    if (next.workshop.state === "LOCKED") {
      next.workshop.state = "IDLE";
      next.workshop.unlocked_at = timestamp;
      changes.push(createHighlight("building_unlocked", "workshop", "Workshop unlocked", 5, quest.quest_id));
    }
  }

  if (credible && hasDomainProgress(progression, LIBRARY_DOMAINS)) {
    addBuildingProgress(next.library, progression.domain_progress, LIBRARY_DOMAINS);
    setActivity(next.activity.library, 85, timestamp);
    if (next.library.state === "LOCKED") {
      next.library.state = "IDLE";
      next.library.unlocked_at = timestamp;
      changes.push(createHighlight("building_unlocked", "library", "Library unlocked", 5, quest.quest_id));
    }
  }

  if (progression.loot_refs.length > 0) {
    const firstLoot = progression.loot_refs[0];
    if (addMilestone(next, "first_artifact", timestamp, quest.quest_id)) {
      changes.push(createHighlight("milestone_unlocked", "first_artifact", "First real artifact", 5, quest.quest_id));
    }
    changes.push(createHighlight(
      "artifact_received",
      "artifact",
      firstLoot.name ?? "Real artifact received",
      4,
      quest.quest_id
    ));
  }

  if (progression.outcome_confidence === "VERIFIED" && addMilestone(next, "first_verified_outcome", timestamp, quest.quest_id)) {
    changes.push(createHighlight("milestone_unlocked", "first_verified_outcome", "First Verified outcome", 5, quest.quest_id));
  }

  if (quest.status === "COMPLETED") {
    changes.push(createHighlight("quest_completed", "quest-guild", quest.title, 3, quest.quest_id));
  } else if (quest.status === "FAILED") {
    changes.push(createHighlight("quest_failed", "quest-guild", `${quest.title} failed`, 2, quest.quest_id));
  } else if (quest.status === "CANCELLED") {
    changes.push(createHighlight("quest_cancelled", "quest-guild", `${quest.title} cancelled`, 2, quest.quest_id));
  }

  next.return_highlights = changes
    .sort((left, right) => right.priority - left.priority || left.target.localeCompare(right.target))
    .slice(0, 3);
  next.return_history ??= [];
  next.return_history.push({
    return_id: `return:${quest.quest_id}:${quest.event_ids.at(-1)}`,
    quest_id: quest.quest_id,
    title: quest.title,
    timestamp,
    highlights: cloneJson(next.return_highlights)
  });
  return validateWorldState(next);
}

function addBuildingProgress(building, domainProgress, domains) {
  for (const domain of domains) {
    building.domain_progress[domain] = Math.min(
      100,
      building.domain_progress[domain] + domainProgress[domain]
    );
  }
}

function hasDomainProgress(progression, domains) {
  return domains.some((domain) => progression.domain_progress[domain] > 0);
}

function addMilestone(state, milestoneId, timestamp, questId) {
  if (!WORLD_MILESTONE_IDS.includes(milestoneId) || state.milestones.some((milestone) => milestone.milestone_id === milestoneId)) {
    return false;
  }
  state.milestones.push({
    milestone_id: milestoneId,
    unlocked_at: timestamp,
    quest_id: questId
  });
  return true;
}

function decayWorldActivity(state, timestamp) {
  const next = cloneJson(state);
  for (const building of ["gate", "workshop", "library"]) {
    decayActivity(next.activity[building], timestamp);
  }
  next.updated_at = maxTimestamp(next.updated_at, timestamp);
  return validateWorldState(next);
}

function decayActivity(activity, timestamp) {
  if (activity.last_at === null) {
    return;
  }
  const elapsed = Date.parse(timestamp) - Date.parse(activity.last_at);
  if (elapsed <= 0) {
    return;
  }
  activity.level = Math.max(
    0,
    Math.round(activity.level * (2 ** (-elapsed / ACTIVITY_HALF_LIFE_MS)))
  );
  activity.last_at = timestamp;
}

function setActivity(activity, level, timestamp) {
  if (activity.last_at !== null && Date.parse(timestamp) < Date.parse(activity.last_at)) {
    return;
  }
  activity.level = level;
  activity.last_at = timestamp;
}

function maxTimestamp(left, right) {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function createHighlight(kind, target, label, priority, questId) {
  return {
    kind,
    target,
    label,
    priority,
    quest_id: questId
  };
}

function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function removeValue(values, value) {
  const index = values.indexOf(value);
  if (index !== -1) {
    values.splice(index, 1);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertTimestamp(value, name) {
  if (typeof value !== "string" || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be a valid ISO-8601 timestamp`);
  }
}
