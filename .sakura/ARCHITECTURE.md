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
