# Roadmap

## Milestone 0: Repository baseline

- Project contract and scaffold merged at the repository root.
- Local Git repository is initialized on `main`.
- Phase 1 test command is defined without third-party dependencies.

## Milestone 1: Protocol and Adapter Foundation — complete

1. UARP v0.1 envelope, event types, capabilities, evidence refs, privacy metadata, and validation.
2. Adapter Core contracts and lifecycle.
3. Deterministic simulated Adapter fixture.
4. Observer ingestion, deduplication, buffering, aggregation, and redaction hooks.
5. Integrated Phase 1 fixture and regression checks.

Exit evidence: `npm test` passes all 8 Phase 1 tests, and every required event reaches the downstream sink as valid, deduplicated UARP data.

## Milestone 2: Local persistence

1. Normalized event storage.
2. Semantic, Quest, artifact, and world repositories.
3. Restart and replay safety.

## Milestone 3: Semantics and game core

1. Deterministic work-phase state machine.
2. Six-domain classification and Activity Mix.
3. Quest lifecycle and Run-to-Quest association.
4. Outcome confidence, evidence policy, rewards, anti-abuse, and world progression.

## Milestone 4: Web world

1. World Scene, Mini HUD, Quest Panel, Building Panel, Artifact Card, and Return Overlay.
2. Persistent world state and first-session moments.

## Milestone 5: Real Harness Adapter and acceptance

1. Select and implement one real adapter after the simulated path is green.
2. Run the complete v0.1 acceptance scenarios.
