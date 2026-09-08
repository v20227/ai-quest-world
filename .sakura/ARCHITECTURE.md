# Architecture

## Trusted-loop runtime

- `packages/uarp/run-lineage.mjs` owns explicit factual parent/resume resolution and stable event-time ordering. Cycles/conflicting direct relationships are withheld from derived rewards.
- `SemanticEngine.process` returns the complete current interpretation snapshot. `QuestEngine.process` retains raw history but replaces semantic records wholesale, including retractions. For out-of-order/re-associated incremental input, pass `semantic.process([event])` to `quest.ingest(event, records)`; scalar append rejects unsafe history changes.
- `apps/world-web/project-world.mjs` composes one full deterministic projection. `storage/sqlite/projection-store.mjs` replaces Quest, progression, world and applied-input rows atomically under schema4, recording policy version and raw event count. Runtime no longer coordinates separate Quest/World repository writes. Raw facts remain intact through policy rebuilds.
- `core/world/world-view.mjs` advances temporary activity for a requested display time without persisting rounded decay or changing permanent progress. Core-generated return history carries stable identities. Browser helpers select active/latest tasks and combine factual artifacts with reward references without granting rewards.
- `core/game/difficulty-policy.mjs` computes optional descriptive difficulty from bounded semantic dimensions. It never changes progression weights. `apps/world-web/collect-codex.mjs` composes the existing adapter/runtime around a supplied stdin stream, without process control.
- `packages/adapter-core/artifact-privacy.mjs` shares local file privacy predicates between collection and viewing. `apps/world-web/artifact-access.mjs` enforces explicit project-root and exact durable-identity access; the server exposes only bounded local reads, while the existing renderer escapes fetched text into the artifact card without storing content.

## Phase 1 module map

```text
packages/uarp/
  runtime-event.mjs
  capabilities.mjs
  evidence.mjs
packages/adapter-core/
  contracts.mjs
adapters/first-harness/
  simulated-adapter.mjs
adapters/codex-cli/
  codex-cli-adapter.mjs
  index.mjs
observer/
  runtime-observer.mjs
  aggregation.mjs
tests/ai-quest-world/
  phase1.test.mjs
```

## Milestone 2 module map

```text
storage/sqlite/
  schema.mjs
  event-store.mjs
tests/ai-quest-world/
  persistence.test.mjs
```

- `schema.mjs` owns the versioned SQLite migration and event indexes.
- `event-store.mjs` owns validated append, idempotent event identity, replay ordering, filtering, and local database lifecycle.
- The event store persists the complete UARP envelope while exposing no raw SQLite handle.

## Milestone 3 module map

```text
core/semantic/
  semantic-types.mjs
  semantic-engine.mjs
tests/ai-quest-world/
  semantic.test.mjs
```

- `semantic-types.mjs` owns the semantic phase/domain vocabulary and record shape.
- `semantic-engine.mjs` consumes validated UARP facts, maintains only interpretation state, and emits deterministic semantic records/snapshots.
- Semantic Engine state is not authoritative game state and has no dependency on SQLite, Game Core, UI, or a concrete Harness Adapter.

## Quest and outcome module map

```text
core/game/
  index.mjs
  quest-types.mjs
  quest-engine.mjs
  outcome-policy.mjs
  progression-types.mjs
  progression-policy.mjs
tests/ai-quest-world/
  quest.test.mjs
  progression.test.mjs
```

- `quest-types.mjs` owns the serializable Quest projection and lifecycle vocabulary.
- `quest-engine.mjs` owns deterministic root-run association, lifecycle transitions, semantic projections, and replay idempotency.
- `outcome-policy.mjs` classifies terminal confidence from validation and factual artifact/evidence references; native completion alone is never Verified.
- The Quest/outcome slice stores normalized event facts internally for classification but exposes no reward, growth, loot, or World State fields.
- `progression-types.mjs` owns the serializable progression snapshot and anti-abuse diagnostics.
- `progression-policy.mjs` calculates bounded Skill XP, Domain Progress, and artifact rewards from semantic records and Quest evidence; it has no token/tool/file/agent-volume reward path and no World State dependency.
- Activity Mix projections clamp rounded percentages against the remaining 100-point budget so every domain remains within the valid range.

## World State module map

```text
core/world/
  index.mjs
  world-state-types.mjs
  world-state-engine.mjs
storage/sqlite/
  schema.mjs
  quest-store.mjs
  world-state-store.mjs
tests/ai-quest-world/
  world-state.test.mjs
  read-model.test.mjs
```

- `world-state-types.mjs` owns the Small Camp baseline, building states, cumulative totals, active runs, and the three-highlight return budget.
- `world-state-engine.mjs` is the authoritative deterministic projector: runtime lifecycle events control temporary Gate activity, while resolved progression controls permanent unlocks and totals.
- `world-state-store.mjs` atomically persists one validated World State row and applied-input markers in the shared SQLite schema; duplicate events and Quest progressions are no-ops after restart.
- `quest-store.mjs` persists the newest validated Quest and progression read models monotonically so the Web layer can restart without recalculating or becoming a second authority.
- `apps/world-web/world-runtime.mjs` orchestrates the local Observer, event store, Semantic Engine, Quest/Progression policies, and World State repository; it exposes read models to the Web server without moving any game rules into the browser.

## Ownership

- `packages/uarp` owns factual event envelopes, canonical event types, capabilities, evidence references, privacy metadata, and runtime validation.
- `packages/adapter-core` owns harness-agnostic Adapter and Observer contracts.
- `adapters/first-harness` owns only deterministic simulation of native harness behavior.
- `adapters/codex-cli` owns only the public Codex CLI JSONL process boundary; it emits strict, metadata-first UARP facts and never passes reasoning, agent-message text, commands, or paths downstream.
- `observer` owns validation at ingestion, event identity deduplication, buffering, aggregation, and privacy hooks.
- `core/semantic` will own work-semantic interpretation after Phase 1.
- `core/game` will own Quest, outcome, reward, growth, artifact, and world state after Phase 1.
- `storage/sqlite` will own durable repositories after Phase 1.
- `apps/world-web` owns presentation after the authoritative state path exists. The root page reads the SQLite-backed read model through `/api/world`; `/api/demo` is an explicit deterministic fixture for visual verification. `world-runtime.mjs` is the local orchestration boundary for Observer events and keeps the browser read-only without duplicating World State, Quest, or progression rules.
- `apps/world-web/observe-codex.mjs` is the explicit local entry point for one read-only Codex CLI observation; it reuses `PersistentWorldRuntime` and does not add a second game pipeline.

## Dependency direction

```text
adapter → uarp
observer → uarp + adapter-core
semantic → uarp/domain semantic types
game → semantic types + repository contracts
storage → repository contracts
renderer → read models / UI API
```

UARP has no game semantics. Game Core has no concrete adapter or UI dependency. The Observer has no knowledge of XP, Quest state, or building rules.
