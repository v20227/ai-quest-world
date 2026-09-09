import { RunLineage, orderRuntimeEvents } from "../../packages/uarp/run-lineage.mjs";
import { supportedCodexEvidence } from "../../adapters/codex-cli/legacy-evidence.mjs";
import { SemanticEngine } from "../../core/semantic/semantic-engine.mjs";
import { QuestEngine } from "../../core/game/quest-engine.mjs";
import { calculateProgression } from "../../core/game/progression-policy.mjs";
import { WorldStateEngine } from "../../core/world/world-state-engine.mjs";
import { PROJECTION_POLICY_VERSION } from "./project-world.mjs";

/**
 * 有状态投影器：projectWorld 的增量形态。
 *
 * 与全量重放的 projectWorld 保持同一处理顺序（全局时间序）与同一引擎调用，
 * 但只在事件到达时处理该事件——持久化引擎保留各自的语义状态、任务状态、
 * 谱系与世界状态。事件按序到达时，结果与全量重放逐字节一致；
 * 检测到乱序批次时返回 `outOfOrder`，由运行时回退全量有序重建。
 */
export class WorldProjector {
  #lineage = new RunLineage();
  #semantic = new SemanticEngine();
  #quests = new QuestEngine();
  #world = new WorldStateEngine();
  #questsById = new Map();
  #progressionsById = new Map();
  #appliedInputs = [];
  #lastTimestamp = "";
  #eventCount = 0;

  /**
   * @param {unknown[]} rawEvents 一个到达批次（不含已处理事件）
   * @returns {{outOfOrder?: boolean}}
   */
  ingest(rawEvents) {
    const supported = rawEvents.map(supportedCodexEvidence).filter(Boolean);
    if (supported.length === 0) {
      this.#eventCount += rawEvents.length;
      return {};
    }
    for (const event of supported) this.#lineage.observe(event);
    const events = orderRuntimeEvents(supported).filter(event => this.#lineage.rootFor(event.context.run_id) !== null);
    if (events.length === 0) {
      this.#eventCount += rawEvents.length;
      return {};
    }
    // 乱序检测：新批次的时间早于已处理水位，说明有迟到/回填事件插入历史，
    // 增量语义不再等价于全量重放——交还运行时做有序全量重建。
    if (this.#lastTimestamp !== "" && events[0].timestamp < this.#lastTimestamp) {
      return { outOfOrder: true };
    }

    const records = [];
    for (const event of events) {
      const record = this.#semantic.ingestOrdered(event);
      if (record !== null) records.push(record);
    }
    const touchedQuests = this.#quests.ingestBatch(events, records);
    // ingestBatch 为每个触碰事件返回一个任务快照；成长计算只看每个任务的最终状态。
    const finalQuestStates = new Map();
    for (const quest of touchedQuests) finalQuestStates.set(quest.quest_id, quest);

    const settlementsByEventId = new Map();
    for (const quest of finalQuestStates.values()) {
      this.#questsById.set(quest.quest_id, quest);
      // 成长计算使用该根运行的**全部**保留语义记录（与全量重放一致），
      // 而非仅本批新增——跨批次任务的 Activity Mix 不能只算尾巴。
      const progression = calculateProgression(quest, this.#semantic.getRecords(quest.root_run_id));
      this.#progressionsById.set(progression.quest_id, progression);
      if (progression.resolution === "RESOLVED") {
        const settlementEventId = progression.quest_snapshot.event_ids.at(-1);
        if (settlementEventId !== undefined) settlementsByEventId.set(settlementEventId, progression);
      }
    }

    for (const event of events) {
      this.#world.ingest(event);
      this.#appliedInputs.push({ input_id: `event:${event.event_id}`, input_kind: "runtime_event" });
      const settlement = settlementsByEventId.get(event.event_id);
      if (settlement) {
        this.#world.applyProgression(settlement);
        this.#appliedInputs.push({ input_id: `progression:${settlement.quest_id}`, input_kind: "quest_progression" });
      }
    }

    this.#eventCount += rawEvents.length;
    this.#lastTimestamp = events.at(-1).timestamp;
    return {};
  }

  /** @returns {{world: Record<string, unknown>, quests: unknown[], progressions: unknown[], appliedInputs: Array<{input_id: string, input_kind: string}>, policyVersion: string, eventCount: number}} */
  snapshot() {
    return {
      world: this.#world.getState(),
      quests: [...this.#questsById.values()],
      progressions: [...this.#progressionsById.values()],
      appliedInputs: [...this.#appliedInputs],
      policyVersion: PROJECTION_POLICY_VERSION,
      eventCount: this.#eventCount
    };
  }

  /** 已增量处理的事件数量（与事件库 sequence 水位对齐）。 */
  get processedCount() {
    return this.#eventCount;
  }
}
