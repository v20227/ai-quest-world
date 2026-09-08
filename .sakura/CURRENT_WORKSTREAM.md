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
| PERSIST-01 | Versioned SQLite schema and normalized event store | `storage/sqlite` | PHASE1-INT-01 | B1-B4 | In progress |
| PERSIST-02 | Restart, idempotency, validation, atomic batch, and replay tests | `tests/ai-quest-world/persistence.test.mjs` | PERSIST-01 contract | B2-B6 | In progress |
| PERSIST-INT-01 | Main-branch integration and scope review | Repository | PERSIST-01, PERSIST-02 | B1-B7 | Planned |

## Repair history

No persistence repair has been recorded.

## Acceptance result

Phase 1 remains green. Milestone 2 persistence acceptance is pending B1-B7.

## Completion decision

The normalized event storage slice is complete only after the implementation and test worker changes are reviewed together and the full suite passes.

## Exact next action

Wait for the two bounded workers, inspect their file lists and tests, then integrate only the agreed persistence slice on `main`.
