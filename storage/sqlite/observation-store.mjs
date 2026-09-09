import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { migrateDatabase } from "./schema.mjs";

export class SqliteObservationStore {
  #database;

  constructor({ path = ":memory:" } = {}) {
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

  begin({ connectionId, adapterId, capabilities }) {
    for (const value of [connectionId, adapterId]) {
      if (typeof value !== "string" || !value.trim() || value.length > 256) {
        throw new TypeError("Observation identifiers must contain 1 to 256 characters");
      }
    }
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    this.#database.prepare(`INSERT INTO observation_sessions
      (session_id, connection_id, adapter_id, capabilities_json, status, started_at, heartbeat_at)
      VALUES (?, ?, ?, ?, 'observing', ?, ?)`)
      .run(sessionId, connectionId, adapterId, JSON.stringify(capabilities), now, now);
    return sessionId;
  }

  touch(sessionId, { eventReceived = false, runId, eventId } = {}) {
    const now = new Date().toISOString();
    this.#database.prepare(`UPDATE observation_sessions SET heartbeat_at = ?,
      last_event_at = CASE WHEN ? THEN ? ELSE last_event_at END,
      last_run_id = COALESCE(?, last_run_id), last_event_id = COALESCE(?, last_event_id)
      WHERE session_id = ? AND status = 'observing'`)
      .run(now, Number(eventReceived), now, runId ?? null, eventId ?? null, sessionId);
  }

  end(sessionId, status = "ended", errorCode = status === "error" ? "CAPTURE_FAILED" : null) {
    if (!["ended", "error", "interrupted"].includes(status)) throw new TypeError("Invalid observation terminal status");
    const now = new Date().toISOString();
    this.#database.prepare(`UPDATE observation_sessions
      SET status = ?, ended_at = ?, heartbeat_at = ?, error_code = ?
      WHERE session_id = ? AND status = 'observing'`)
      .run(status, now, now, errorCode, sessionId);
  }

  list({ at = new Date().toISOString(), limit = 100 } = {}) {
    const time = Date.parse(at);
    if (!Number.isFinite(time)) throw new TypeError("Observation time must be a valid timestamp");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError("Invalid observation limit");
    return this.#database.prepare(`SELECT * FROM observation_sessions
      ORDER BY started_at DESC, session_id DESC LIMIT ?`).all(limit).map(row => {
      const stale = row.status === "observing" && time - Date.parse(row.heartbeat_at) > 45000;
      return {
        session_id: row.session_id,
        connection_id: row.connection_id,
        adapter_id: row.adapter_id,
        capabilities: JSON.parse(row.capabilities_json),
        status: stale ? "unknown" : row.status,
        freshness: stale ? "stale" : row.status === "observing" ? "live" : "historical",
        started_at: row.started_at,
        heartbeat_at: row.heartbeat_at,
        last_event_at: row.last_event_at,
        last_run_id: row.last_run_id,
        last_event_id: row.last_event_id,
        ended_at: row.ended_at,
        error_code: row.error_code
      };
    });
  }

  close() {
    this.#database?.close();
    this.#database = null;
  }
}
