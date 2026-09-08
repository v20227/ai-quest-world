import { LocalRuntimeObserver } from "../../observer/runtime-observer.mjs";
import { assertHarnessAdapter } from "../../packages/adapter-core/contracts.mjs";
import { SqliteEventStore } from "../../storage/sqlite/index.mjs";
import { SqliteProjectionStore } from "../../storage/sqlite/projection-store.mjs";
import { projectWorld, PROJECTION_POLICY_VERSION } from "./project-world.mjs";
import { worldAtTime } from "../../core/world/world-view.mjs";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

/**
 * Local projection runtime for the Web app. It owns orchestration only: the
 * existing Semantic, Quest, Progression, and World State modules remain the
 * authorities for their respective decisions.
 */
export class PersistentWorldRuntime {
  #eventStore;
  #projectionStore;
  #memory;
  #observer;
  #closed = false;
  #displayNamespace;

  /** @param {{path?: string}=} options */
  constructor({ path = "storage/sqlite/ai-quest-world.sqlite" } = {}) {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new TypeError("PersistentWorldRuntime path must be a non-empty string");
    }

    this.#eventStore = new SqliteEventStore({ path });
    this.#displayNamespace = path === ":memory:" ? randomUUID() : createHash("sha256").update(realpathSync(path)).digest("hex");
    this.#memory = path === ":memory:";
    try {
      this.#projectionStore = new SqliteProjectionStore({ path });
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

  /**
   * Observe one adapter run through the same durable path used by the Web
   * endpoint. The runtime coordinates boundaries but does not interpret or
   * mutate harness state itself.
   *
   * @param {import("../../packages/adapter-core/contracts.mjs").HarnessAdapter} adapter
   * @returns {Promise<ReturnType<PersistentWorldRuntime["getSnapshot"]>>}
   */
  async runAdapter(adapter) {
    this.#assertOpen();
    assertHarnessAdapter(adapter);
    await adapter.start(this.#observer);
    return this.getSnapshot();
  }

  /** @returns {{world: Record<string, unknown>, quests: Record<string, unknown>[], progressions: Record<string, unknown>[]}} */
  getSnapshot({ at } = {}) {
    this.#assertOpen();
    this.#materialize();
    const snapshot = this.#projectionStore.getSnapshot();
    if (at !== undefined) snapshot.world = worldAtTime(snapshot.world, at, snapshot.quests);
    return snapshot;
  }

  /** @returns {{event_count: number, quest_count: number, progression_count: number, applied_input_count: number}} */
  getDiagnostics() {
    this.#assertOpen();
    const snapshot = this.getSnapshot();
    return {
      event_count: this.#eventStore.count(),
      quest_count: snapshot.quests.length,
      progression_count: snapshot.progressions.length,
      applied_input_count: this.#projectionStore.countApplied()
    };
  }

  getDisplayNamespace() {
    this.#assertOpen();
    return this.#displayNamespace;
  }

  /** Close all local repositories. Calling close more than once is safe. */
  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#eventStore.close();
    this.#projectionStore.close();
  }

  #materialize() {
    this.#assertOpen();
    const metadata = this.#projectionStore.getMetadata();
    if (metadata?.policy_version === PROJECTION_POLICY_VERSION && metadata.event_count === this.#eventStore.count()) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const events = this.#eventStore.list();
      if (this.#projectionStore.replace(projectWorld(events), this.#memory ? {} : { expectedEventCount: events.length })) return;
    }
    throw new Error("Event history changed during projection; retry after current ingestion completes");
  }

  #assertOpen() {
    if (this.#closed) {
      throw new Error("PersistentWorldRuntime is closed");
    }
  }
}
