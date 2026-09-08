import { DatabaseSync } from "node:sqlite";

import { parseRuntimeEvent, validateRuntimeEvent } from "../../packages/uarp/runtime-event.mjs";
import { isPlainRecord } from "../../packages/uarp/validation.mjs";
import { migrateDatabase } from "./schema.mjs";

/**
 * @typedef {import("../../packages/uarp/runtime-event.mjs").RuntimeEvent} RuntimeEvent
 * @typedef {import("node:sqlite").DatabaseSync} DatabaseSync
 */

export class SqliteEventStoreError extends Error {
  /** @param {string} message @param {unknown=} cause */
  constructor(message, cause) {
    super(message);
    this.name = "SqliteEventStoreError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * A local, append-only repository for validated UARP runtime events.
 */
export class SqliteEventStore {
  /** @type {DatabaseSync | null} */
  #database = null;

  /**
   * @param {{path?: string}=} options
   */
  constructor({ path = ":memory:" } = {}) {
    if (typeof path !== "string" || path.length === 0) {
      throw new TypeError("SqliteEventStore path must be a non-empty string");
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
      throw new SqliteEventStoreError(`Unable to open SQLite event store at ${path}`, error);
    }
  }

  /**
   * Validate and append one event.
   *
   * @param {RuntimeEvent} event
   * @returns {{inserted: boolean, duplicate: boolean, sequence: number, event: RuntimeEvent}}
   */
  append(event) {
    const database = this.#getDatabase();
    const record = serializeEvent(event);
    return this.#insertRecord(database, record);
  }

  /**
   * Validate the complete batch before writing any row, then append atomically.
   *
   * @param {RuntimeEvent[]} events
   * @returns {{insertedCount: number, duplicateCount: number, results: Array<{inserted: boolean, duplicate: boolean, sequence: number, event: RuntimeEvent}>}}
   */
  appendMany(events) {
    const database = this.#getDatabase();
    if (!Array.isArray(events)) {
      throw new TypeError("SqliteEventStore.appendMany events must be an array");
    }

    const records = events.map(serializeEvent);
    if (records.length === 0) {
      return { insertedCount: 0, duplicateCount: 0, results: [] };
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      const results = records.map((record) => this.#insertRecord(database, record));
      database.exec("COMMIT");

      return {
        insertedCount: results.filter((result) => result.inserted).length,
        duplicateCount: results.filter((result) => result.duplicate).length,
        results
      };
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original append error.
      }
      throw new SqliteEventStoreError("SQLite event batch was rolled back", error);
    }
  }

  /**
   * @param {string} eventId
   * @returns {RuntimeEvent | null}
   */
  getById(eventId) {
    assertNonEmptyString(eventId, "eventId");
    const database = this.#getDatabase();
    const row = database
      .prepare("SELECT event_json FROM runtime_events WHERE event_id = ?")
      .get(eventId);
    return row === undefined ? null : deserializeEvent(row);
  }

  /**
   * List events in insertion order. `afterSequence` is exclusive.
   *
   * @param {{runId?: string, afterSequence?: number, limit?: number}=} options
   * @returns {RuntimeEvent[]}
   */
  list({ runId, afterSequence, limit } = {}) {
    if (runId !== undefined) {
      assertNonEmptyString(runId, "runId");
    }
    if (afterSequence !== undefined) {
      assertSafeNonNegativeInteger(afterSequence, "afterSequence");
    }
    if (limit !== undefined) {
      assertSafeNonNegativeInteger(limit, "limit");
    }

    const database = this.#getDatabase();
    const predicates = [];
    const parameters = [];

    if (runId !== undefined) {
      predicates.push("run_id = ?");
      parameters.push(runId);
    }
    if (afterSequence !== undefined) {
      predicates.push("sequence > ?");
      parameters.push(afterSequence);
    }

    let query = "SELECT event_json FROM runtime_events";
    if (predicates.length > 0) {
      query += ` WHERE ${predicates.join(" AND ")}`;
    }
    query += " ORDER BY sequence ASC";
    if (limit !== undefined) {
      query += " LIMIT ?";
      parameters.push(limit);
    }

    return database
      .prepare(query)
      .all(...parameters)
      .map(deserializeEvent);
  }

  /**
   * @param {{runId?: string}=} options
   * @returns {number}
   */
  count({ runId } = {}) {
    if (runId !== undefined) {
      assertNonEmptyString(runId, "runId");
    }

    const database = this.#getDatabase();
    const query = runId === undefined
      ? "SELECT COUNT(*) AS count FROM runtime_events"
      : "SELECT COUNT(*) AS count FROM runtime_events WHERE run_id = ?";
    const row = runId === undefined
      ? database.prepare(query).get()
      : database.prepare(query).get(runId);
    return toSafeInteger(row?.count, "event count");
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

  /** @returns {DatabaseSync} */
  #getDatabase() {
    if (this.#database === null) {
      throw new SqliteEventStoreError("SQLite event store is closed");
    }
    return this.#database;
  }

  /**
   * @param {DatabaseSync} database
   * @param {{event: RuntimeEvent, json: string}} record
   * @returns {{inserted: boolean, duplicate: boolean, sequence: number, event: RuntimeEvent}}
   */
  #insertRecord(database, record) {
    const existing = selectStoredRow(database, record.event.event_id);
    if (existing !== undefined) {
      return createAppendResult(existing, false);
    }

    try {
      database
        .prepare(`
          INSERT INTO runtime_events (
            event_id,
            run_id,
            parent_run_id,
            agent_id,
            parent_agent_id,
            event_type,
            event_timestamp,
            event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          record.event.event_id,
          record.event.context.run_id,
          record.event.context.parent_run_id ?? null,
          record.event.context.agent_id ?? null,
          record.event.context.parent_agent_id ?? null,
          record.event.type,
          record.event.timestamp,
          record.json
        );
    } catch (error) {
      const concurrentInsert = selectStoredRow(database, record.event.event_id);
      if (concurrentInsert !== undefined) {
        return createAppendResult(concurrentInsert, false);
      }
      throw error;
    }

    const inserted = selectStoredRow(database, record.event.event_id);
    if (inserted === undefined) {
      throw new SqliteEventStoreError(
        `SQLite event ${record.event.event_id} was not readable after insertion`
      );
    }
    return createAppendResult(inserted, true);
  }
}

/**
 * @param {RuntimeEvent} event
 * @returns {{event: RuntimeEvent, json: string}}
 */
function serializeEvent(event) {
  assertJsonValue(event, "event");
  const validated = validateRuntimeEvent(event);
  let json;
  try {
    json = JSON.stringify(validated);
  } catch (error) {
    throw new SqliteEventStoreError("UARP event must be JSON serializable", error);
  }
  if (typeof json !== "string") {
    throw new SqliteEventStoreError("UARP event must serialize to a JSON object");
  }
  return { event: validated, json };
}

/**
 * Reject values that JSON.stringify would silently change or omit.
 *
 * @param {unknown} value
 * @param {string} path
 * @param {Set<object>} [ancestors]
 */
function assertJsonValue(value, path, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value) && !Object.is(value, -0)) {
      return;
    }
    throw new SqliteEventStoreError(`${path} must contain only finite JSON numbers`);
  }

  if (typeof value !== "object" || value === null) {
    throw new SqliteEventStoreError(`${path} must contain only JSON-compatible values`);
  }

  if (ancestors.has(value)) {
    throw new SqliteEventStoreError(`${path} must not contain cyclic references`);
  }

  if (Array.isArray(value)) {
    ancestors.add(value);
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return;
  }

  if (!isPlainRecord(value)) {
    throw new SqliteEventStoreError(`${path} must contain only plain JSON objects`);
  }

  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    assertJsonValue(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

/**
 * @param {DatabaseSync} database
 * @param {string} eventId
 * @returns {{sequence: unknown, event_json: unknown} | undefined}
 */
function selectStoredRow(database, eventId) {
  return database
    .prepare("SELECT sequence, event_json FROM runtime_events WHERE event_id = ?")
    .get(eventId);
}

/**
 * @param {{sequence: unknown, event_json: unknown}} row
 * @param {boolean} inserted
 * @returns {{inserted: boolean, duplicate: boolean, sequence: number, event: RuntimeEvent}}
 */
function createAppendResult(row, inserted) {
  return {
    inserted,
    duplicate: !inserted,
    sequence: toSafeInteger(row.sequence, "event sequence"),
    event: deserializeEvent(row)
  };
}

/**
 * @param {{event_json: unknown}} row
 * @returns {RuntimeEvent}
 */
function deserializeEvent(row) {
  if (typeof row?.event_json !== "string") {
    throw new SqliteEventStoreError("Stored UARP event JSON is invalid");
  }
  return parseRuntimeEvent(row.event_json);
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertSafeNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function toSafeInteger(value, name) {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new SqliteEventStoreError(`SQLite ${name} is outside the safe integer range`);
  }
  return number;
}
