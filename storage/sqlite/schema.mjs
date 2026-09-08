/**
 * @typedef {import("node:sqlite").DatabaseSync} DatabaseSync
 */

export const CURRENT_SCHEMA_VERSION = 1;

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
