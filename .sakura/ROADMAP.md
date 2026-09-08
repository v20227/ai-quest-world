# Roadmap

## Confirmed delivery goal

Build AI Quest World v0.1 as a local-first, read-only, offline-capable observability game layer: a meaningful real Agent Harness run becomes factual runtime events, deterministic work semantics, Quest and evidence-based growth, and a persistent Web pixel world without requiring an additional AI API.

## Delivery targets

Current backend gate: TRUST-01 → TRUST-02 → LIVE-01 → EXPERIENCE-01 → ACCEPT-01 passed current T1–T6 checks on the existing root world; GitHub integration follows the isolated backend release event. Current evidence is in `EVIDENCE.md`, not the historical fixture-only statements below. Separate frontend and asset work retains its own acceptance. v0.2 remains deferred.

- G0: Repository and GitHub collaboration baseline — complete.
- G1: UARP, Adapter Core, simulated Harness, and Observer foundation — complete.
- G2: Local SQLite event persistence and restart-safe replay — complete.
- G3: Deterministic Semantic Engine and work-phase state machine — complete.
- G4: Quest lifecycle, outcome/evidence policy, growth, anti-abuse, and artifact references — complete.
- G5: Persistent World State and building progression — complete.
- G6: Web pixel world and return/unlock presentation — complete.
- G7: First real Harness Adapter behind the existing adapter boundary — complete for the Codex CLI read-only slice.
- G8: End-to-end v0.1 acceptance — complete.

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

## Milestone 2: Local persistence — complete

Completed slice: normalized UARP event storage only.

1. Persist validated event envelopes in local SQLite with a versioned schema.
2. Preserve stable insertion order, run/agent context, evidence, and privacy metadata.
3. Make duplicate event IDs idempotent across restart and expose read-only replay queries.

Exit evidence: versioned SQLite event storage, full-envelope replay, restart-safe event identity, atomic batch validation, and 17/17 combined tests.

Deferred to later milestones: semantic, Quest, artifact, world, and settings repositories.

## Milestone 3: Semantics and game core

Completed slice: deterministic Semantic Engine only. Quest, outcome, rewards, growth, and World State remain deferred to G4/G5.

1. Deterministic work-phase state machine.
2. Six-domain classification and Activity Mix.
3. Quest lifecycle and Run-to-Quest association.
4. Outcome confidence, evidence policy, rewards, anti-abuse, and world progression.

G3 exit evidence: canonical semantic timeline, bounded impact weights, six-domain Activity Mix, hierarchy preservation, event replay idempotency, and 26/26 combined tests.

G4 complete: Candidate Quest lifecycle, Run-to-Quest association, outcome/evidence classification, factual artifact references, evidence-bounded Skill XP and Domain Progress, real artifact rewards, replay protection, diminishing repeated-failure credit, and deterministic per-Quest caps. World State remains the next milestone.

G4 exit evidence: the combined Phase 1, persistence, semantic, Quest, and progression suites pass 44/44; high-volume facts do not alter progression, repeated validation failures are capped, duplicate semantic records are idempotent, and failed/unverified outcomes do not fabricate artifact loot.

G5 complete: versioned World State baseline, Gate activity/return projection, credible Guild/Workshop/Library unlocks, cumulative progression/artifact totals, temporary activity decay separate from permanent progress, milestone hooks, return highlight budget, and restart-safe applied-input plus Quest/progression read-model persistence.

G5 foundation exit evidence: the combined Phase 1, persistence, semantic, Quest, progression, and World State suites pass 51/51; the canonical simulated run survives SQLite restart with one applied progression, returning Gate state, restored Guild, relevant building unlocks, cumulative totals, and no duplicate replay effects.

G5 exit evidence: the combined Phase 1, persistence, semantic, Quest, progression, World State, and read-model suites pass 54/54; activity decays over deterministic time without reducing permanent progress, first-session milestones persist, and stale/pending read models cannot replace newer resolved projections.

Quest/outcome foundation evidence: Quest lifecycle, child/retry association, independent-root separation, replay idempotency, validation/artifact confidence policy, and factual artifact-reference merging are covered by the Quest suite and remain included in the overall 44/44 regression suite.

## Milestone 4: Web world

1. World Scene, Mini HUD, Quest Panel, Building Panel, Artifact Card, and Return Overlay — complete for both local and deterministic read models.
2. Persistent world state and first-session moments — complete through SQLite-backed `/api/world`, the Observer path, conservative empty-state rendering, and the fixture lens.

G6 exit evidence: `npm test` passes 58/58; the Web contract covers canonical and unverified snapshots, GET-only static/API serving, SQLite restart/idempotent Observer projection, conservative unlock presentation, and the browser check confirms desktop scene/context layout, mobile drawer/navigation, return overlay, world-object selection, theme/motion settings, and zero browser console errors.

## Milestone 5: Real Harness Adapter and acceptance

G7 exit evidence: the Codex CLI adapter consumes the public `codex exec --json` JSONL boundary, maps lifecycle/tool/recognized validation/file-change/artifact/usage/error facts without exposing content, and feeds the existing persistent runtime. The adapter contract, privacy, malformed-stream, failure, and Codex-shaped end-to-end tests pass in the 62-test regression suite. An isolated local CLI smoke confirmed the live `file_change.changes[{path,kind}]` shape.

G8 exit evidence: the complete v0.1 acceptance matrix is green. `npm test` passes 62/62; the canonical and negative fixtures cover semantics, Quest/outcome, progression/anti-abuse, World State, Web presentation, privacy, and restart/idempotency. A real read-only Codex observation completed through `npm run observe:codex`, and its SQLite projection was reopened successfully without fabricating validation, artifact, or unlock state.

1. v0.1 is complete and ready for a separately scoped v0.2 goal.
