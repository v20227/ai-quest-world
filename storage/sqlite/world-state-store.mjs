import { DatabaseSync } from "node:sqlite";

import { migrateDatabase } from "./schema.mjs";
import {
  createInitialWorldState,
  validateWorldState
} from "../../core/world/world-state-types.mjs";

/**
 * A local repository for the single authoritative World State projection and
 * its applied-input identity markers.
 */
export class SqliteWorldStateStore {
  #database = null;

  /** @param {{path?: string}=} options */
  constructor({ path = ":memory:" } = {}) {
    if (typeof path !== "string" || path.length === 0) {
      throw new TypeError("SqliteWorldStateStore path must be a non-empty string");
    }

    let database;
    try {
      database = new DatabaseSync(path);
      migrateDatabase(database);
      this.#database = database;
      this.#ensureInitialState();
    } catch (error) {
      try {
        database?.close();
      } catch {
        // Preserve the original open or migration error.
      }
      throw new SqliteWorldStateStoreError(
        `Unable to open SQLite World State store at ${path}`,
        error
      );
    }
  }

  /** @returns {Record<string, unknown>} */
  getState() {
    return readState(this.#getDatabase());
  }

  /** @param {string} inputId @returns {boolean} */
  hasApplied(inputId) {
    assertNonEmptyString(inputId, "inputId");
    const row = this.#getDatabase()
      .prepare("SELECT 1 AS present FROM world_applied_inputs WHERE input_id = ?")
      .get(inputId);
    return row !== undefined;
  }

  /** @returns {number} */
  countApplied() {
    const row = this.#getDatabase()
      .prepare("SELECT COUNT(*) AS count FROM world_applied_inputs")
      .get();
    const count = typeof row?.count === "bigint" ? Number(row.count) : row?.count;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new SqliteWorldStateStoreError("SQLite applied-input count is invalid");
    }
    return count;
  }

  /**
   * Atomically apply a new input marker and replace the World State. A
   * duplicate marker returns the durable current state without writing it.
   *
   * @param {string} inputId
   * @param {string} inputKind
   * @param {unknown} state
   * @returns {{applied: boolean, state: Record<string, unknown>}}
   */
  commitInput(inputId, inputKind, state) {
    assertNonEmptyString(inputId, "inputId");
    assertNonEmptyString(inputKind, "inputKind");
    const validatedState = validateWorldState(state);
    const stateJson = JSON.stringify(validatedState);
    const database = this.#getDatabase();

    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database
        .prepare("SELECT 1 AS present FROM world_applied_inputs WHERE input_id = ?")
        .get(inputId);
      if (existing !== undefined) {
        database.exec("COMMIT");
        return { applied: false, state: readState(database) };
      }

      database
        .prepare(`
          INSERT INTO world_state (singleton, state_json)
          VALUES (1, ?)
          ON CONFLICT(singleton) DO UPDATE SET state_json = excluded.state_json
        `)
        .run(stateJson);
      database
        .prepare("INSERT INTO world_applied_inputs (input_id, input_kind) VALUES (?, ?)")
        .run(inputId, inputKind);
      database.exec("COMMIT");
      return { applied: true, state: cloneJson(validatedState) };
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw new SqliteWorldStateStoreError("SQLite World State transaction was rolled back", error);
    }
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

  #ensureInitialState() {
    const database = this.#getDatabase();
    database
      .prepare("INSERT OR IGNORE INTO world_state (singleton, state_json) VALUES (1, ?)")
      .run(JSON.stringify(createInitialWorldState()));
  }

  #getDatabase() {
    if (this.#database === null) {
      throw new SqliteWorldStateStoreError("SQLite World State store is closed");
    }
    return this.#database;
  }
}

export class SqliteWorldStateStoreError extends Error {
  /** @param {string} message @param {unknown=} cause */
  constructor(message, cause) {
    super(message);
    this.name = "SqliteWorldStateStoreError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function readState(database) {
  const row = database
    .prepare("SELECT state_json FROM world_state WHERE singleton = 1")
    .get();
  if (typeof row?.state_json !== "string") {
    throw new SqliteWorldStateStoreError("Stored World State is missing");
  }

  let parsed;
  try {
    parsed = JSON.parse(row.state_json);
  } catch (error) {
    throw new SqliteWorldStateStoreError("Stored World State JSON is invalid", error);
  }
  return cloneJson(validateWorldState(parsed));
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
