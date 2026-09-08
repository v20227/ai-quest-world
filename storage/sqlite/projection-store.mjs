import { DatabaseSync } from "node:sqlite";

import { validateQuest } from "../../core/game/quest-types.mjs";
import { validateProgressionSnapshot } from "../../core/game/progression-types.mjs";
import { createInitialWorldState, validateWorldState } from "../../core/world/world-state-types.mjs";
import { isPlainRecord } from "../../packages/uarp/validation.mjs";
import { migrateDatabase } from "./schema.mjs";

export class SqliteProjectionStore {
  #database = null;

  /** @param {{path?: string}=} options */
  constructor({ path = ":memory:" } = {}) {
    assertString(path, "path");
    const database = new DatabaseSync(path);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      migrateDatabase(database);
      this.#database = database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  /**
   * @param {{world: unknown, quests: unknown[], progressions: unknown[], appliedInputs: Array<{input_id: string, input_kind: string}>, policyVersion: string, eventCount: number}} input
   * @param {{expectedEventCount?: number}=} options
   * @returns {boolean}
   */
  replace({ world, quests, progressions, appliedInputs, policyVersion, eventCount }, { expectedEventCount } = {}) {
    const database = this.#getDatabase();
    assertString(policyVersion, "policyVersion");
    assertCount(eventCount, "eventCount");
    if (expectedEventCount !== undefined) assertCount(expectedEventCount, "expectedEventCount");
    for (const [name, value] of Object.entries({ quests, progressions, appliedInputs })) {
      if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
    }
    const worldJson = serialize(world, validateWorldState);
    const questRecords = Array.from(quests, (quest) => {
      const json = serialize(quest, validateQuest);
      const record = JSON.parse(json);
      return [record.quest_id, record.root_run_id, record.updated_at, json];
    });
    const progressionRecords = Array.from(progressions, (progression) => {
      const json = serialize(progression, validateProgressionSnapshot);
      const record = JSON.parse(json);
      return [record.quest_id, record.quest_snapshot.updated_at, json];
    });
    const markers = Array.from(appliedInputs, (input) => {
      if (!isPlainRecord(input)) throw new TypeError("applied input must be a plain object");
      assertString(input.input_id, "input_id");
      assertString(input.input_kind, "input_kind");
      return [input.input_id, input.input_kind];
    });

    database.exec("BEGIN IMMEDIATE");
    try {
      if (expectedEventCount !== undefined) {
        const { count } = database.prepare("SELECT COUNT(*) AS count FROM runtime_events").get();
        if (count !== expectedEventCount) {
          database.exec("ROLLBACK");
          return false;
        }
      }
      database.exec(`
        DELETE FROM progressions;
        DELETE FROM quests;
        DELETE FROM world_state;
        DELETE FROM world_applied_inputs;
        DELETE FROM projection_metadata;
      `);
      const insertQuest = database.prepare("INSERT INTO quests (quest_id, root_run_id, updated_at, quest_json) VALUES (?, ?, ?, ?)");
      for (const record of questRecords) insertQuest.run(...record);
      const insertProgression = database.prepare("INSERT INTO progressions (quest_id, updated_at, progression_json) VALUES (?, ?, ?)");
      for (const record of progressionRecords) insertProgression.run(...record);
      database.prepare("INSERT INTO world_state (singleton, state_json) VALUES (1, ?)").run(worldJson);
      const insertMarker = database.prepare("INSERT INTO world_applied_inputs (input_id, input_kind) VALUES (?, ?)");
      for (const marker of markers) insertMarker.run(...marker);
      database.prepare("INSERT INTO projection_metadata (singleton, policy_version, event_count) VALUES (1, ?, ?)")
        .run(policyVersion, eventCount);
      database.exec("COMMIT");
      return true;
    } catch (error) {
      rollback(database);
      throw error;
    }
  }

  /** @returns {{world: Record<string, unknown>, quests: unknown[], progressions: unknown[]}} */
  getSnapshot() {
    const database = this.#getDatabase();
    database.exec("BEGIN");
    try {
      const row = database.prepare("SELECT state_json FROM world_state WHERE singleton = 1").get();
      const world = row === undefined ? createInitialWorldState() : validateWorldState(JSON.parse(row.state_json));
      const quests = database.prepare("SELECT quest_json FROM quests ORDER BY updated_at ASC, quest_id ASC")
        .all().map((record) => validateQuest(JSON.parse(record.quest_json)));
      const progressions = database.prepare("SELECT progression_json FROM progressions ORDER BY updated_at ASC, quest_id ASC")
        .all().map((record) => validateProgressionSnapshot(JSON.parse(record.progression_json)));
      database.exec("COMMIT");
      return { world, quests, progressions };
    } catch (error) {
      rollback(database);
      throw error;
    }
  }

  /** @returns {{policy_version: string, event_count: number}|null} */
  getMetadata() {
    const row = this.#getDatabase().prepare("SELECT policy_version, event_count FROM projection_metadata WHERE singleton = 1").get();
    return row === undefined ? null : { policy_version: row.policy_version, event_count: row.event_count };
  }

  /** @returns {number} */
  countApplied() {
    return this.#getDatabase().prepare("SELECT COUNT(*) AS count FROM world_applied_inputs").get().count;
  }

  close() {
    if (this.#database === null) return;
    const database = this.#database;
    this.#database = null;
    database.close();
  }

  #getDatabase() {
    if (this.#database === null) throw new Error("SQLite projection store is closed");
    return this.#database;
  }
}

function serialize(value, validate) {
  validate(value);
  const json = JSON.stringify(value);
  validate(JSON.parse(json));
  return json;
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function rollback(database) {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the transaction error.
  }
}
