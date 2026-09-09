/**
 * @typedef {import("node:sqlite").DatabaseSync} DatabaseSync
 */

export const CURRENT_SCHEMA_VERSION = 8;

/** @type {ReadonlyMap<number, (database: DatabaseSync) => void>} */
const MIGRATIONS = new Map([
  [1, (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS runtime_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        parent_run_id TEXT,
        agent_id TEXT,
        parent_agent_id TEXT,
        event_type TEXT NOT NULL,
        event_timestamp TEXT NOT NULL,
        event_json TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_events_event_id
        ON runtime_events (event_id);

      CREATE INDEX IF NOT EXISTS idx_runtime_events_run_sequence
        ON runtime_events (run_id, sequence);

      CREATE INDEX IF NOT EXISTS idx_runtime_events_sequence
        ON runtime_events (sequence);
    `);
  }],
  [2, (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS world_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS world_applied_inputs (
        input_id TEXT PRIMARY KEY,
        input_kind TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_world_applied_inputs_kind
        ON world_applied_inputs (input_kind);
    `);
  }],
  [3, (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS quests (
        quest_id TEXT PRIMARY KEY,
        root_run_id TEXT NOT NULL UNIQUE,
        updated_at TEXT NOT NULL,
        quest_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS progressions (
        quest_id TEXT PRIMARY KEY,
        updated_at TEXT NOT NULL,
        progression_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_quests_updated_at
        ON quests (updated_at);

      CREATE INDEX IF NOT EXISTS idx_progressions_updated_at
        ON progressions (updated_at);
    `);
  }],
  [4, (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS projection_metadata (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        policy_version TEXT NOT NULL CHECK (length(trim(policy_version)) > 0),
        event_count INTEGER NOT NULL CHECK (event_count >= 0)
      );
    `);
  }],
  [5, (database) => {
    database.exec(`
      CREATE TABLE observation_sessions (
        session_id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('observing', 'ended', 'error', 'interrupted')),
        started_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        last_event_at TEXT,
        ended_at TEXT,
        error_code TEXT
      );
      CREATE INDEX idx_observation_sessions_connection
        ON observation_sessions(connection_id, started_at);
    `);
  }],
  [6, (database) => {
    database.exec(`
      CREATE TABLE collection_grants (
        grant_id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL UNIQUE,
        grant_json TEXT NOT NULL
      );
      CREATE TABLE collection_display (
        slot TEXT PRIMARY KEY CHECK(slot = 'camp-memento'),
        item_id TEXT REFERENCES collection_grants(item_id),
        revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
      );
      INSERT INTO collection_display(slot) VALUES ('camp-memento');
    `);
  }],
  [7, (database) => {
    database.exec(`
      CREATE TABLE economy_state (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), state_json TEXT NOT NULL);
      CREATE TABLE economy_work_grants (root_run_id TEXT PRIMARY KEY, grant_json TEXT NOT NULL);
      CREATE TABLE economy_commands (command_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, receipt_json TEXT NOT NULL);
      CREATE TABLE economy_ledger (sequence INTEGER PRIMARY KEY AUTOINCREMENT, entry_json TEXT NOT NULL);
    `);
  }],
  [8, (database) => {
    database.exec(`ALTER TABLE observation_sessions ADD COLUMN last_run_id TEXT;
      ALTER TABLE observation_sessions ADD COLUMN last_event_id TEXT;`);
  }]
]);

/**
 * Apply all schema migrations required by the event store.
 *
 * @param {DatabaseSync} database
 * @returns {number} The resulting schema version.
 */
export function migrateDatabase(database) {
  database.exec("PRAGMA foreign_keys = ON");

  const row = database.prepare("PRAGMA user_version").get();
  const currentVersion = Number(row?.user_version ?? 0);

  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
    throw new Error("SQLite schema version is invalid");
  }

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `SQLite schema version ${currentVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`
    );
  }

  for (let nextVersion = currentVersion + 1; nextVersion <= CURRENT_SCHEMA_VERSION; nextVersion += 1) {
    const migration = MIGRATIONS.get(nextVersion);
    if (migration === undefined) {
      throw new Error(`SQLite migration ${nextVersion} is not defined`);
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      migration(database);
      database.exec(`PRAGMA user_version = ${nextVersion}`);
      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original migration error.
      }
      throw error;
    }
  }

  return CURRENT_SCHEMA_VERSION;
}
