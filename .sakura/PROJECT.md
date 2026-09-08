# AI Quest World v0.1

## Outcome

Build a local-first, read-only observability layer for Agent Harnesses. Observable runtime facts become UARP events, deterministic work semantics, persistent game state, and a later scene-based pixel world.

## Accepted boundary

- No additional AI API is required.
- Harness integration is read-only; Game Core never controls a harness.
- UARP contains factual runtime data only.
- Game Core is the sole authority for Quest, outcome, reward, growth, artifact, and world decisions.
- Event processing is idempotent and replayable where practical.
- Default collection is metadata-first and content-optional.
- v0.1 excludes economy, free movement, NPC AI, social systems, cloud sync, dynamic Quest art, and complex combat.

## Technical baseline

- The project uses dependency-free ESM JavaScript, Node's built-in test runner, and Node's built-in SQLite runtime (`node:sqlite`); Node 22.13.0 or newer is required.
- The runtime boundaries are `packages/uarp`, `packages/adapter-core`, `adapters/first-harness`, `observer`, and `core`.
- SQLite persistence covers the normalized UARP event store and the versioned World State repository. Semantic, Quest, progression, and World State projections remain headless and renderer-independent; Web presentation and real Harness integration remain downstream.

## Commands

```sh
npm test
```
