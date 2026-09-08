import { DatabaseSync } from "node:sqlite";

import { validateProgressionSnapshot } from "../../core/game/progression-types.mjs";
import { validateQuest } from "../../core/game/quest-types.mjs";
import { migrateDatabase } from "./schema.mjs";

/**
 * Local read-model repository for Quest and progression projections. It does
 * not calculate game outcomes; Game Core remains the authority that supplies
 * the validated projections.
 */
export class SqliteQuestStore {
  #database = null;

  /** @param {{path?: string}=} options */
  constructor({ path = ":memory:" } = {}) {
    if (typeof path !== "string" || path.length === 0) {
      throw new TypeError("SqliteQuestStore path must be a non-empty string");
    }

    let database;
    try {
      database = new DatabaseSync(path);
      migrateDatabase(database);
      this.#database = database;
    } catch (error) {
      try {
        database?.close();
      } catch {
        // Preserve the original open or migration error.
      }
      throw new SqliteQuestStoreError(`Unable to open SQLite Quest store at ${path}`, error);
    }
  }

  /**
   * Save the newest Quest projection for a root run.
   *
   * @param {unknown} input
   * @returns {{saved: boolean, quest: Record<string, unknown>}}
   */
  saveQuest(input) {
    const quest = validateQuest(input);
    const json = serializeJson(quest, "Quest");
    const database = this.#getDatabase();
    const existing = database
      .prepare("SELECT updated_at, quest_json FROM quests WHERE quest_id = ?")
      .get(quest.quest_id);

    if (existing !== undefined && shouldKeepExisting(existing.updated_at, quest.updated_at)) {
      return { saved: false, quest: parseQuestJson(existing.quest_json) };
    }
    if (existing !== undefined && existing.updated_at === quest.updated_at && existing.quest_json === json) {
      return { saved: false, quest: cloneJson(quest) };
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(`
          INSERT INTO quests (quest_id, root_run_id, updated_at, quest_json)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(quest_id) DO UPDATE SET
            root_run_id = excluded.root_run_id,
            updated_at = excluded.updated_at,
            quest_json = excluded.quest_json
        `)
        .run(quest.quest_id, quest.root_run_id, quest.updated_at, json);
      database.exec("COMMIT");
      return { saved: true, quest: cloneJson(quest) };
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw new SqliteQuestStoreError("SQLite Quest transaction was rolled back", error);
    }
  }

  /** @param {string} questId @returns {Record<string, unknown>|null} */
  getQuest(questId) {
    assertNonEmptyString(questId, "questId");
    const row = this.#getDatabase()
      .prepare("SELECT quest_json FROM quests WHERE quest_id = ?")
      .get(questId);
    return row === undefined ? null : parseQuestJson(row.quest_json);
  }

  /** @param {string} rootRunId @returns {Record<string, unknown>|null} */
  getQuestByRootRun(rootRunId) {
    assertNonEmptyString(rootRunId, "rootRunId");
    const row = this.#getDatabase()
      .prepare("SELECT quest_json FROM quests WHERE root_run_id = ?")
      .get(rootRunId);
    return row === undefined ? null : parseQuestJson(row.quest_json);
  }

  /** @param {{limit?: number}=} options @returns {Record<string, unknown>[]} */
  listQuests({ limit } = {}) {
    validateLimit(limit);
    let query = "SELECT quest_json FROM quests ORDER BY updated_at ASC, quest_id ASC";
    const parameters = [];
    if (limit !== undefined) {
      query += " LIMIT ?";
      parameters.push(limit);
    }
    return this.#getDatabase()
      .prepare(query)
      .all(...parameters)
      .map((row) => parseQuestJson(row.quest_json));
  }

  /**
   * Save the newest progression projection for a Quest. A resolved snapshot
   * cannot be replaced by a later pending snapshot.
   *
   * @param {unknown} input
   * @returns {{saved: boolean, progression: Record<string, unknown>}}
   */
  saveProgression(input) {
    const progression = validateProgressionSnapshot(input);
    const json = serializeJson(progression, "progression");
    const updatedAt = progression.quest_snapshot.updated_at;
    const database = this.#getDatabase();
    const existing = database
      .prepare("SELECT updated_at, progression_json FROM progressions WHERE quest_id = ?")
      .get(progression.quest_id);

    if (existing !== undefined) {
      const existingProgression = parseProgressionJson(existing.progression_json);
      if (existingProgression.resolution === "RESOLVED" && progression.resolution !== "RESOLVED") {
        return { saved: false, progression: existingProgression };
      }
      if (shouldKeepExisting(existing.updated_at, updatedAt)) {
        return { saved: false, progression: existingProgression };
      }
      if (existing.updated_at === updatedAt && existing.progression_json === json) {
        return { saved: false, progression: cloneJson(progression) };
      }
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(`
          INSERT INTO progressions (quest_id, updated_at, progression_json)
          VALUES (?, ?, ?)
          ON CONFLICT(quest_id) DO UPDATE SET
            updated_at = excluded.updated_at,
            progression_json = excluded.progression_json
        `)
        .run(progression.quest_id, updatedAt, json);
      database.exec("COMMIT");
      return { saved: true, progression: cloneJson(progression) };
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw new SqliteQuestStoreError("SQLite progression transaction was rolled back", error);
    }
  }

  /** @param {string} questId @returns {Record<string, unknown>|null} */
  getProgression(questId) {
    assertNonEmptyString(questId, "questId");
    const row = this.#getDatabase()
      .prepare("SELECT progression_json FROM progressions WHERE quest_id = ?")
      .get(questId);
    return row === undefined ? null : parseProgressionJson(row.progression_json);
  }

  /** @param {{limit?: number}=} options @returns {Record<string, unknown>[]} */
  listProgressions({ limit } = {}) {
    validateLimit(limit);
    let query = "SELECT progression_json FROM progressions ORDER BY updated_at ASC, quest_id ASC";
    const parameters = [];
    if (limit !== undefined) {
      query += " LIMIT ?";
      parameters.push(limit);
    }
    return this.#getDatabase()
      .prepare(query)
      .all(...parameters)
      .map((row) => parseProgressionJson(row.progression_json));
  }

  /** @returns {number} */
  countQuests() {
    return countRows(this.#getDatabase(), "quests");
  }

  /** @returns {number} */
  countProgressions() {
    return countRows(this.#getDatabase(), "progressions");
  }

  /** Close the database. Calling close more than once is safe. */
  close() {
    if (this.#database === null) {
      return;
    }
    const database = this.#database;
    this.#database = null;
    database.close();
  }

  #getDatabase() {
    if (this.#database === null) {
      throw new SqliteQuestStoreError("SQLite Quest store is closed");
    }
    return this.#database;
  }
}

export class SqliteQuestStoreError extends Error {
  /** @param {string} message @param {unknown=} cause */
  constructor(message, cause) {
    super(message);
    this.name = "SqliteQuestStoreError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function parseQuestJson(value) {
  return cloneJson(validateQuest(parseJson(value, "Stored Quest"), "stored_quest"));
}

function parseProgressionJson(value) {
  return cloneJson(validateProgressionSnapshot(parseJson(value, "Stored progression"), "stored_progression"));
}

function parseJson(value, label) {
  if (typeof value !== "string") {
    throw new SqliteQuestStoreError(`${label} JSON is invalid`);
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new SqliteQuestStoreError(`${label} JSON is invalid`, error);
  }
}

function serializeJson(value, label) {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") {
      throw new Error("value did not serialize to JSON");
    }
    return json;
  } catch (error) {
    throw new SqliteQuestStoreError(`${label} must be JSON serializable`, error);
  }
}

function shouldKeepExisting(existingUpdatedAt, incomingUpdatedAt) {
  return Date.parse(existingUpdatedAt) > Date.parse(incomingUpdatedAt);
}

function validateLimit(limit) {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new TypeError("limit must be a non-negative safe integer");
  }
}

function countRows(database, table) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  const count = typeof row?.count === "bigint" ? Number(row.count) : row?.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new SqliteQuestStoreError(`SQLite ${table} count is invalid`);
  }
  return count;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
