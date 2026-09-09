import { DatabaseSync } from "node:sqlite";
import { migrateDatabase } from "./schema.mjs";
import { applyEconomyCommand, companionStage } from "../../core/game/economy-policy.mjs";
import { validateEconomyCommand, EconomyError, SHOP_CATALOG, ECONOMY_VERSION, COMPANION } from "../../packages/game-contracts/economy.mjs";

export class SqliteEconomyStore {
  #database;
  constructor({ path = ":memory:" } = {}) {
    const database = new DatabaseSync(path);
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      migrateDatabase(database);
      database.prepare("INSERT OR IGNORE INTO economy_state VALUES (1, ?)").run(JSON.stringify({
        revision: 0, gold: 0, inventory: {}, pets: [], selected_pet_id: null, activated_at: new Date().toISOString()
      }));
      this.#database = database;
    } catch (error) { database.close(); throw error; }
  }

  #state() { return JSON.parse(this.#database.prepare("SELECT state_json FROM economy_state WHERE singleton = 1").get().state_json); }
  #save(state) { this.#database.prepare("UPDATE economy_state SET state_json = ? WHERE singleton = 1").run(JSON.stringify(state)); }
  #entry(value) { this.#database.prepare("INSERT INTO economy_ledger(entry_json) VALUES (?)").run(JSON.stringify(value)); }

  #transaction(operation) {
    this.#database.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.#database.exec("COMMIT"); return result; }
    catch (error) { this.#database.exec("ROLLBACK"); throw error; }
  }

  recordWork(grants) {
    if (!grants.length) return;
    this.#transaction(() => {
      const state = this.#state();
      let changed = false;
      const statement = this.#database.prepare("INSERT OR IGNORE INTO economy_work_grants VALUES (?, ?)");
      for (const grant of grants) {
        if (!Number(statement.run(grant.root_run_id, JSON.stringify(grant)).changes)) continue;
        const balance = state.gold + grant.amount;
        if (!Number.isSafeInteger(balance)) throw new EconomyError("LIMIT_REACHED", "金币余额已达上限。");
        state.gold = balance;
        this.#entry({ type: "work_reward", ...grant, gold_delta: grant.amount, balance_after: balance,
          recorded_at: new Date().toISOString(), historical: Date.parse(grant.occurred_at) < Date.parse(state.activated_at) });
        changed = true;
      }
      if (changed) { state.revision += 1; this.#save(state); }
    });
  }

  execute(input) {
    const command = validateEconomyCommand(input);
    const payload = JSON.stringify(command);
    const result = this.#transaction(() => {
      const previous = this.#database.prepare("SELECT * FROM economy_commands WHERE command_id = ?").get(command.command_id);
      if (previous) {
        if (previous.payload_json !== payload) throw new EconomyError("COMMAND_REUSED", "同一个操作标识不能用于不同请求。");
        return { receipt: JSON.parse(previous.receipt_json), replayed: true };
      }
      const state = this.#state();
      if (state.revision !== command.revision) throw new EconomyError("STALE_STATE", "世界状态已更新，请刷新后确认操作。");
      const { state: next, receipt } = applyEconomyCommand(state, command, new Date().toISOString());
      this.#save(next);
      this.#database.prepare("INSERT INTO economy_commands VALUES (?, ?, ?)").run(command.command_id, payload, JSON.stringify(receipt));
      this.#entry({ type: "player_action", ...receipt });
      return { receipt, replayed: false };
    });
    return { ...result, economy: this.snapshot() };
  }

  history({ before } = {}) {
    if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new EconomyError("INVALID_COMMAND", "记录游标无效。");
    const rows = before === undefined
      ? this.#database.prepare("SELECT * FROM economy_ledger ORDER BY sequence DESC LIMIT 51").all()
      : this.#database.prepare("SELECT * FROM economy_ledger WHERE sequence < ? ORDER BY sequence DESC LIMIT 51").all(before);
    return { entries: rows.slice(0, 50).map(row => ({ ...JSON.parse(row.entry_json), sequence: Number(row.sequence) })),
      next_before: rows.length > 50 ? Number(rows[49].sequence) : null };
  }

  snapshot() {
    const state = this.#state();
    return { version: ECONOMY_VERSION, ...state, catalog: SHOP_CATALOG,
      pets: state.pets.map(pet => ({ ...pet, stage: companionStage(pet.growth), max_growth: COMPANION.max_growth,
        next_growth: [25, 60, 100].find(value => value > pet.growth) ?? null })), history: this.history(),
      reward_policy: { verified: 20, supported: 12, other: 0, backfill: true } };
  }

  close() { this.#database?.close(); this.#database = null; }
}
