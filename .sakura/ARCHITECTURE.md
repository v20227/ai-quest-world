# Architecture

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

## Ownership

- `packages/uarp` owns factual event envelopes, canonical event types, capabilities, evidence references, privacy metadata, and runtime validation.
- `packages/adapter-core` owns harness-agnostic Adapter and Observer contracts.
- `adapters/first-harness` owns only deterministic simulation of native harness behavior.
- `observer` owns validation at ingestion, event identity deduplication, buffering, aggregation, and privacy hooks.
- `core/semantic` will own work-semantic interpretation after Phase 1.
- `core/game` will own Quest, outcome, reward, growth, artifact, and world state after Phase 1.
- `storage/sqlite` will own durable repositories after Phase 1.
- `apps/world-web` will own presentation after the authoritative state path exists. The initial Web slice serves a deterministic simulated read model through `/api/demo` so the visual contract can be verified without a live harness. The next Web item may replace the demo provider with SQLite-backed read models, but must keep the browser read-only and must not duplicate World State, Quest, or progression rules.

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
