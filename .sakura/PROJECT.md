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

- Phase 1 uses dependency-free ESM JavaScript and Node's built-in test runner.
- The runtime boundaries are `packages/uarp`, `packages/adapter-core`, `adapters/first-harness`, and `observer`.
- Semantic Engine, Game Core, SQLite persistence, and Web presentation are downstream milestones.

## Commands

```sh
npm test
```
