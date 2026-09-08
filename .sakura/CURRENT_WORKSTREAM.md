# Current Workstream: Local Persistence — Normalized Event Storage

## Outcome

Persist validated normalized UARP v0.1 event envelopes in a versioned local SQLite store with stable ordering, replay queries, and restart-safe event identity. Keep the Phase 1 public boundaries unchanged and do not start Semantic Engine, Game Core, or UI work in this slice.

## Acceptance

- B1: Opening a new database applies a versioned schema migration and supports an in-memory test database.
- B2: Appending an event validates it through the UARP boundary before writing and stores the complete factual envelope.
- B3: Repeating an event ID is a no-op in one process and after closing/reopening the database.
- B4: Replay queries preserve insertion order and factual fields, including parent/child context, evidence references, and privacy metadata.
- B5: Invalid events are rejected without a row; an invalid item in a batch does not leave partial writes.
- B6: The existing Phase 1 suite and the new persistence suite pass together with no external AI/API.
- B7: This slice adds no Semantic Engine, Quest, reward, world-state, renderer, or Game → Harness control.

## Work items

| ID | Result | Owner | Prerequisite | Check | State |
| --- | --- | --- | --- | --- | --- |
| BASE-01 | Merge project contract, scaffold, and test command | Repository | None | package and repository checks | Complete |
| UARP-01 | Factual UARP v0.1 contracts and runtime validation | `packages/uarp` | BASE-01 | A1, A2 | Complete |
| ADAPTER-01 | Harness Adapter and Runtime Observer contracts | `packages/adapter-core` | UARP-01 | A3 | Complete |
| SIM-01 | Deterministic simulated Adapter fixture | `adapters/first-harness` | ADAPTER-01 | A3, A6, A7 | Complete |
| OBS-01 | Ingestion, dedupe, buffering, aggregation, and redaction hooks | `observer` | UARP-01, ADAPTER-01 | A4, A5, A7 | Complete |
| PHASE1-INT-01 | Integrated simulated stream and regression tests | `tests/ai-quest-world` | SIM-01, OBS-01 | A1-A8 | Complete |
| PERSIST-01 | Versioned SQLite schema and normalized event store | `storage/sqlite` | PHASE1-INT-01 | B1-B4 | Complete |
| PERSIST-02 | Restart, idempotency, validation, atomic batch, and replay tests | `tests/ai-quest-world/persistence.test.mjs` | PERSIST-01 contract | B2-B6 | Complete |
| PERSIST-INT-01 | Main-branch integration and scope review | Repository | PERSIST-01, PERSIST-02 | B1-B7 | Complete |

## Repair history

- Added full-envelope game-semantic rejection, JSON-safe value checks, and private SQLite handle encapsulation after batch review.

## Acceptance result

- B1 PASS: schema version 1 migrates on file and in-memory databases.
- B2 PASS: UARP validation runs before persistence and complete factual envelopes round-trip.
- B3 PASS: duplicate event IDs remain no-ops in-process and after restart.
- B4 PASS: insertion order, run filtering, context, evidence, and privacy metadata survive replay.
- B5 PASS: malformed events are rejected and invalid batches leave no partial writes.
- B6 PASS: combined Phase 1 and persistence suites pass 17/17 without an external AI/API.
- B7 PASS: no Semantic Engine, Quest, reward, world-state, renderer, or Game → Harness control was added.

## Completion decision

Milestone 2 normalized event storage is green and ready for the next milestone.

## Exact next action

Start Milestone 3 planning with a deterministic semantic-event contract that reads UARP facts and cannot mutate Game/World State.
