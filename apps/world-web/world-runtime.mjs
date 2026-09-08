import { LocalRuntimeObserver } from "../../observer/runtime-observer.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { analyzeRuntimeEvents } from "../../core/semantic/semantic-engine.mjs";
import { WorldStateEngine } from "../../core/world/world-state-engine.mjs";
import {
  SqliteEventStore,
  SqliteQuestStore,
  SqliteWorldStateStore
} from "../../storage/sqlite/index.mjs";

/**
 * Local projection runtime for the Web app. It owns orchestration only: the
 * existing Semantic, Quest, Progression, and World State modules remain the
 * authorities for their respective decisions.
 */
export class PersistentWorldRuntime {
  #eventStore;
  #questStore;
  #worldStore;
  #observer;
  #closed = false;

  /** @param {{path?: string}=} options */
  constructor({ path = "storage/sqlite/ai-quest-world.sqlite" } = {}) {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new TypeError("PersistentWorldRuntime path must be a non-empty string");
    }

    this.#eventStore = new SqliteEventStore({ path });
    try {
      this.#questStore = new SqliteQuestStore({ path });
      this.#worldStore = new SqliteWorldStateStore({ path });
    } catch (error) {
      this.#eventStore.close();
      throw error;
    }

    this.#observer = new LocalRuntimeObserver({
      downstream: {
        emit: async (event) => {
          this.#assertOpen();
          this.#eventStore.append(event);
          this.#materialize();
        }
      }
    });
    this.#materialize();
  }

  /**
   * Append a validated batch and materialize every authoritative read model.
   * The event store remains the durable identity boundary, so a replayed batch
   * is safe across process restarts.
   *
   * @param {unknown[]} events
   * @returns {{insertedCount: number, duplicateCount: number, snapshot: ReturnType<PersistentWorldRuntime["getSnapshot"]>}}
   */
  ingest(events) {
    this.#assertOpen();
    const result = this.#eventStore.appendMany(events);
    this.#materialize();
    return {
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
      snapshot: this.getSnapshot()
    };
  }

  /**
   * Return the Observer used by a live Adapter. A caller may emit events
   * incrementally or flush a buffered observer; both paths use the same
   * durable event and projection boundaries.
   */
  createObserver() {
    this.#assertOpen();
    return this.#observer;
  }

  /** @returns {{world: Record<string, unknown>, quests: Record<string, unknown>[], progressions: Record<string, unknown>[]}} */
  getSnapshot() {
    this.#assertOpen();
    return {
      world: this.#worldStore.getState(),
      quests: this.#questStore.listQuests(),
      progressions: this.#questStore.listProgressions()
    };
  }

  /** @returns {{event_count: number, quest_count: number, progression_count: number, applied_input_count: number}} */
  getDiagnostics() {
    this.#assertOpen();
    return {
      event_count: this.#eventStore.count(),
      quest_count: this.#questStore.countQuests(),
      progression_count: this.#questStore.countProgressions(),
      applied_input_count: this.#worldStore.countApplied()
    };
  }

  /** Close all local repositories. Calling close more than once is safe. */
  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#eventStore.close();
    this.#questStore.close();
    this.#worldStore.close();
  }

  #materialize() {
    this.#assertOpen();
    const events = this.#eventStore.list();
    if (events.length === 0) {
      return;
    }

    const semantic = analyzeRuntimeEvents(events);
    const questEngine = new QuestEngine();
    questEngine.process(events, semantic.records);
    const quests = questEngine.getQuests();

    for (const quest of quests) {
      this.#questStore.saveQuest(quest);
      const progression = calculateProgression(
        quest,
        semantic.records.filter((record) => record.root_run_id === quest.root_run_id)
      );
      this.#questStore.saveProgression(progression);
    }

    const worldEngine = new WorldStateEngine({ repository: this.#worldStore });
    for (const event of events) {
      worldEngine.ingest(event);
    }
    for (const progression of this.#questStore.listProgressions()) {
      worldEngine.applyProgression(progression);
    }
  }

  #assertOpen() {
    if (this.#closed) {
      throw new Error("PersistentWorldRuntime is closed");
    }
  }
}
