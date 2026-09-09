import { DatabaseSync } from "node:sqlite";
import { migrateDatabase } from "./schema.mjs";

export class CollectionConflict extends Error {}

export class SqliteCollectionStore {
  #database;
  constructor({ path = ":memory:" } = {}) {
    const database = new DatabaseSync(path);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      migrateDatabase(database);
      this.#database = database;
    } catch (error) { database.close(); throw error; }
  }

  record(grants) {
    const statement = this.#database.prepare(`INSERT INTO collection_grants
      (grant_id, item_id, grant_json) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`);
    for (const grant of grants) statement.run(grant.grant_id, grant.item_id, JSON.stringify(grant));
  }

  snapshot() {
    const grants = this.#database.prepare("SELECT grant_json FROM collection_grants ORDER BY grant_id").all();
    const placement = this.#database.prepare("SELECT item_id, revision FROM collection_display WHERE slot = 'camp-memento'").get();
    return { grants: grants.map(row => JSON.parse(row.grant_json)), placement: { slot: "camp-memento", ...placement } };
  }

  place({ item_id, revision }) {
    if ((item_id !== null && item_id !== "verified-memento") || !Number.isSafeInteger(revision) || revision < 0) {
      throw new TypeError("Invalid collection placement");
    }
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      if (item_id !== null && !this.#database.prepare("SELECT 1 FROM collection_grants WHERE item_id = ?").get(item_id)) {
        throw new CollectionConflict("Item not owned");
      }
      const result = this.#database.prepare(`UPDATE collection_display SET item_id = ?, revision = revision + 1
        WHERE slot = 'camp-memento' AND revision = ?`).run(item_id, revision);
      if (Number(result.changes) !== 1) throw new CollectionConflict("Placement changed");
      this.#database.exec("COMMIT");
    } catch (error) { this.#database.exec("ROLLBACK"); throw error; }
    return this.snapshot();
  }

  close() { this.#database?.close(); this.#database = null; }
}
