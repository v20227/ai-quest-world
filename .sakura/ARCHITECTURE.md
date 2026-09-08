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

## Ownership

- `packages/uarp` owns factual event envelopes, canonical event types, capabilities, evidence references, privacy metadata, and runtime validation.
- `packages/adapter-core` owns harness-agnostic Adapter and Observer contracts.
- `adapters/first-harness` owns only deterministic simulation of native harness behavior.
- `observer` owns validation at ingestion, event identity deduplication, buffering, aggregation, and privacy hooks.
- `core/semantic` will own work-semantic interpretation after Phase 1.
- `core/game` will own Quest, outcome, reward, growth, artifact, and world state after Phase 1.
- `storage/sqlite` will own durable repositories after Phase 1.
- `apps/world-web` will own presentation after the authoritative state path exists.

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
