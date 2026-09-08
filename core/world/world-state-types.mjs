import { isPlainRecord } from "../../packages/uarp/validation.mjs";
import { SEMANTIC_DOMAINS } from "../semantic/semantic-types.mjs";

export const WORLD_STATE_VERSION = "0.1";
export const INITIAL_WORLD_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export const GATE_STATES = Object.freeze([
  "DORMANT",
  "CONNECTED",
  "ACTIVE",
  "RETURNING"
]);

export const GUILD_STATES = Object.freeze([
  "OLD",
  "RESTORED",
  "ACTIVE"
]);

export const WORKSHOP_STATES = Object.freeze([
  "LOCKED",
  "IDLE",
  "ACTIVE",
  "BUSY",
  "MILESTONE"
]);

export const LIBRARY_STATES = Object.freeze([
  "LOCKED",
  "IDLE",
  "ACTIVE",
  "BUSY",
  "MILESTONE"
]);

export class WorldStateValidationError extends Error {
  /** @param {string} path @param {string} message */
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "WorldStateValidationError";
    this.path = path;
  }
}

/** @returns {Record<string, unknown>} */
export function createInitialWorldState() {
  return {
    world_version: WORLD_STATE_VERSION,
    camp: {
      building_id: "small-camp",
      state: "ACTIVE"
    },
    gate: {
      building_id: "ai-gate",
      state: "DORMANT",
      connection_count: 0,
      first_connected_at: null,
      last_event_at: null
    },
    guild: {
      building_id: "quest-guild",
      state: "OLD",
      qualifying_quest_count: 0,
      restored_at: null
    },
    workshop: {
      building_id: "workshop",
      state: "LOCKED",
      unlocked_at: null,
      domain_progress: {
        Engineering: 0,
        Debugging: 0,
        Automation: 0
      }
    },
    library: {
      building_id: "library",
      state: "LOCKED",
      unlocked_at: null,
      domain_progress: {
        Research: 0,
        Planning: 0
      }
    },
    progression_totals: {
      skill_xp: 0,
      domain_progress: createEmptyDomainProgress(),
      qualifying_quest_count: 0,
      artifact_count: 0
    },
    active_run_ids: [],
    last_quest_id: null,
    last_return_at: null,
    return_highlights: [],
    updated_at: INITIAL_WORLD_TIMESTAMP
  };
}

/**
 * @param {unknown} value
 * @param {string} [path]
 * @returns {Record<string, unknown>}
 */
export function validateWorldState(value, path = "world_state") {
  const world = assertPlainRecord(value, path);
  assertExact(world.world_version, WORLD_STATE_VERSION, `${path}.world_version`);
  validateCamp(world.camp, `${path}.camp`);
  validateGate(world.gate, `${path}.gate`);
  validateGuild(world.guild, `${path}.guild`);
  validateDomainBuilding(world.workshop, `${path}.workshop`, "workshop", WORKSHOP_STATES, [
    "Engineering",
    "Debugging",
    "Automation"
  ]);
  validateDomainBuilding(world.library, `${path}.library`, "library", LIBRARY_STATES, [
    "Research",
    "Planning"
  ]);
  validateProgressionTotals(world.progression_totals, `${path}.progression_totals`);
  validateStringArray(world.active_run_ids, `${path}.active_run_ids`);
  validateNullableString(world.last_quest_id, `${path}.last_quest_id`);
  validateNullableTimestamp(world.last_return_at, `${path}.last_return_at`);
  validateHighlights(world.return_highlights, `${path}.return_highlights`);
  assertTimestamp(world.updated_at, `${path}.updated_at`);
  return world;
}

function validateCamp(value, path) {
  const camp = assertPlainRecord(value, path);
  assertExact(camp.building_id, "small-camp", `${path}.building_id`);
  assertExact(camp.state, "ACTIVE", `${path}.state`);
}

function validateGate(value, path) {
  const gate = assertPlainRecord(value, path);
  assertExact(gate.building_id, "ai-gate", `${path}.building_id`);
  assertAllowed(gate.state, `${path}.state`, GATE_STATES);
  assertNonNegativeInteger(gate.connection_count, `${path}.connection_count`);
  validateNullableTimestamp(gate.first_connected_at, `${path}.first_connected_at`);
  validateNullableTimestamp(gate.last_event_at, `${path}.last_event_at`);
}

function validateGuild(value, path) {
  const guild = assertPlainRecord(value, path);
  assertExact(guild.building_id, "quest-guild", `${path}.building_id`);
  assertAllowed(guild.state, `${path}.state`, GUILD_STATES);
  assertNonNegativeInteger(guild.qualifying_quest_count, `${path}.qualifying_quest_count`);
  validateNullableTimestamp(guild.restored_at, `${path}.restored_at`);
}

function validateDomainBuilding(value, path, buildingId, states, domains) {
  const building = assertPlainRecord(value, path);
  assertExact(building.building_id, buildingId, `${path}.building_id`);
  assertAllowed(building.state, `${path}.state`, states);
  validateNullableTimestamp(building.unlocked_at, `${path}.unlocked_at`);
  validateScores(building.domain_progress, `${path}.domain_progress`, domains);
}

function validateProgressionTotals(value, path) {
  const totals = assertPlainRecord(value, path);
  assertNonNegativeInteger(totals.skill_xp, `${path}.skill_xp`);
  validateScores(totals.domain_progress, `${path}.domain_progress`, SEMANTIC_DOMAINS);
  assertNonNegativeInteger(totals.qualifying_quest_count, `${path}.qualifying_quest_count`);
  assertNonNegativeInteger(totals.artifact_count, `${path}.artifact_count`);
}

function validateScores(value, path, domains) {
  const scores = assertPlainRecord(value, path);
  for (const domain of domains) {
    const score = scores[domain];
    if (!Number.isSafeInteger(score) || score < 0 || score > 100) {
      throw new WorldStateValidationError(
        `${path}.${domain}`,
        "must be an integer between 0 and 100"
      );
    }
  }
}

function validateHighlights(value, path) {
  if (!Array.isArray(value)) {
    throw new WorldStateValidationError(path, "must be an array");
  }
  if (value.length > 3) {
    throw new WorldStateValidationError(path, "must contain at most three highlights");
  }
  value.forEach((highlight, index) => {
    const highlightPath = `${path}[${index}]`;
    const record = assertPlainRecord(highlight, highlightPath);
    assertNonEmptyString(record.kind, `${highlightPath}.kind`);
    assertNonEmptyString(record.target, `${highlightPath}.target`);
    assertNonEmptyString(record.label, `${highlightPath}.label`);
    if (!Number.isSafeInteger(record.priority) || record.priority < 0 || record.priority > 5) {
      throw new WorldStateValidationError(
        `${highlightPath}.priority`,
        "must be an integer between 0 and 5"
      );
    }
    validateNullableString(record.quest_id, `${highlightPath}.quest_id`);
  });
}

function validateStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw new WorldStateValidationError(path, "must be an array");
  }
  value.forEach((item, index) => assertNonEmptyString(item, `${path}[${index}]`));
}

function validateNullableString(value, path) {
  if (value !== null) {
    assertNonEmptyString(value, path);
  }
}

function validateNullableTimestamp(value, path) {
  if (value !== null) {
    assertTimestamp(value, path);
  }
}

function assertPlainRecord(value, path) {
  if (!isPlainRecord(value)) {
    throw new WorldStateValidationError(path, "must be a plain object");
  }
  return value;
}

function assertExact(value, expected, path) {
  if (value !== expected) {
    throw new WorldStateValidationError(path, `must be exactly ${expected}`);
  }
}

function assertAllowed(value, path, allowed) {
  if (!allowed.includes(value)) {
    throw new WorldStateValidationError(path, `must be one of: ${allowed.join(", ")}`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorldStateValidationError(path, "must be a non-empty string");
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WorldStateValidationError(path, "must be a non-negative safe integer");
  }
}

function assertTimestamp(value, path) {
  assertNonEmptyString(value, path);
  if (Number.isNaN(Date.parse(value))) {
    throw new WorldStateValidationError(path, "must be a valid ISO-8601 timestamp");
  }
}

function createEmptyDomainProgress() {
  return Object.fromEntries(SEMANTIC_DOMAINS.map((domain) => [domain, 0]));
}
