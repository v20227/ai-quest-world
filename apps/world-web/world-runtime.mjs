import { LocalRuntimeObserver } from "../../observer/runtime-observer.mjs";
import { assertHarnessAdapter } from "../../packages/adapter-core/contracts.mjs";
import { SqliteEventStore } from "../../storage/sqlite/index.mjs";
import { SqliteProjectionStore } from "../../storage/sqlite/projection-store.mjs";
import { projectWorld, PROJECTION_POLICY_VERSION } from "./project-world.mjs";
import { WorldProjector } from "./projector.mjs";
import { orderRuntimeEvents } from "../../packages/uarp/run-lineage.mjs";
import { worldAtTime } from "../../core/world/world-view.mjs";
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { SqliteObservationStore } from "../../storage/sqlite/observation-store.mjs";
import { captureAdapter } from "../../observer/capture-session.mjs";
import { describeRuntimeIdentities } from "../../observer/runtime-identities.mjs";
import { milestoneCollectibles } from "../../core/game/collection-rewards.mjs";
import { SqliteCollectionStore } from "../../storage/sqlite/collection-store.mjs";
import { SqliteEconomyStore } from "../../storage/sqlite/economy-store.mjs";
import { workGoldGrants } from "../../core/game/economy-policy.mjs";

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
  #observationStore;
  #activeSessions = new Set();
  #identityCache = null;
  #identityEventCount = -1;
  #identityComputedAt = 0;
  #collectionStore;
  #economyStore;
  #projector = new WorldProjector();

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
      this.#observationStore = new SqliteObservationStore({ path });
      this.#collectionStore = new SqliteCollectionStore({ path });
      this.#economyStore = new SqliteEconomyStore({ path });
    } catch (error) {
      this.#eventStore.close();
      this.#projectionStore?.close();
      this.#observationStore?.close();
      this.#collectionStore?.close();
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
  async runAdapter(adapter, { connectionId = adapter.id } = {}) {
    this.#assertOpen();
    assertHarnessAdapter(adapter);
    await captureAdapter({ adapter, observer: this.#observer, store: this.#observationStore,
      connectionId, activeSessions: this.#activeSessions });
    return this.getSnapshot();
  }

  /** @returns {{world: Record<string, unknown>, quests: Record<string, unknown>[], progressions: Record<string, unknown>[]}} */
  getSnapshot({ at, withObservability = false } = {}) {
    this.#assertOpen();
    this.#materialize();
    const snapshot = this.#projectionStore.getSnapshot();
    if (at !== undefined) snapshot.world = worldAtTime(snapshot.world, at, snapshot.quests);
    if (withObservability) snapshot.observability = this.getObservability();
    this.#collectionStore.record(milestoneCollectibles(snapshot.world));
    snapshot.collection = this.#collectionStore.snapshot();
    this.#economyStore.recordWork(workGoldGrants(snapshot.progressions));
    snapshot.economy = this.#economyStore.snapshot();
    return snapshot;
  }

  placeCollectible(selection) {
    this.#assertOpen();
    this.getSnapshot();
    return this.#collectionStore.place(selection);
  }

  executeEconomyCommand(command) {
    this.getSnapshot();
    return this.#economyStore.execute(command);
  }

  getEconomyHistory(options) {
    this.#assertOpen();
    return this.#economyStore.history(options);
  }

  getObservability() {
    this.#assertOpen();
    const count = this.#eventStore.count();
    const now = Date.now();
    if (count !== this.#identityEventCount && now - this.#identityComputedAt > 30_000) {
      const events = this.#eventStore.list();
      this.#identityCache = describeRuntimeIdentities(events);
      this.#identityEventCount = events.length;
      this.#identityComputedAt = now;
    }
    return {
      version: "0.1",
      sessions: this.#observationStore.list(),
      session_limit: 100,
      identities: structuredClone(this.#identityCache)
    };
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
    try {
      for (const sessionId of this.#activeSessions) this.#observationStore.end(sessionId, "interrupted");
    } finally {
      this.#activeSessions.clear();
      this.#observationStore.close();
      this.#collectionStore.close();
      this.#economyStore.close();
      this.#eventStore.close();
      this.#projectionStore.close();
    }
  }

  #materialize() {
    this.#assertOpen();
    const metadata = this.#projectionStore.getMetadata();
    const total = this.#eventStore.count();
    if (metadata?.policy_version === PROJECTION_POLICY_VERSION && metadata.event_count === total) return;
    const events = this.#eventStore.list();
    // 增量路径：仅处理事件库水位之上的新事件（O(新事件)，不再全量重放）。
    if (metadata?.policy_version === PROJECTION_POLICY_VERSION && metadata.event_count === this.#projector.processedCount) {
      const result = this.#projector.ingest(events.slice(this.#projector.processedCount));
      if (!result.outOfOrder) {
        this.#projectionStore.replace(this.#projector.snapshot(), this.#memory ? {} : { expectedEventCount: total });
        return;
      }
    }
    // 全量路径：冷启动、策略变更或检测到乱序（迟到/回填事件）——按全局时间序重建。
    const ordered = orderRuntimeEvents(events);
    this.#projector = new WorldProjector();
    this.#projector.ingest(ordered);
    this.#projectionStore.replace(this.#projector.snapshot(), this.#memory ? {} : { expectedEventCount: total });
  }

  #assertOpen() {
    if (this.#closed) {
      throw new Error("PersistentWorldRuntime is closed");
    }
  }
}
