# Current Workstream: Protocol and Adapter Foundation

## Outcome

Prove that a deterministic simulated Agent Harness can emit a realistic multi-step run through Adapter Core and Observer as valid, deduplicated UARP v0.1 events without touching gameplay UI or Game Core.

## Acceptance

- A1: Valid UARP fixtures parse and serialize without losing factual fields.
- A2: Missing `event_id`, missing `run_id`, and unsupported `uarp_version` are rejected clearly.
- A3: Capabilities and Adapter lifecycle contracts are exposed, and simulated start/stop are safe.
- A4: Duplicate event IDs reach the downstream sink at most once.
- A5: Resource activity can be aggregated while validation and artifact events remain intact.
- A6: The canonical simulated event order and run context remain coherent.
- A7: Parent and child run/agent relationships survive the Adapter → Observer boundary.
- A8: Phase 1 contains no XP, Quest state, UI, SQLite world schema, external AI, or Game → Harness control.

## Work items

| ID | Result | Owner | Prerequisite | Check | State |
| --- | --- | --- | --- | --- | --- |
| BASE-01 | Merge project contract, scaffold, and test command | Repository | None | package and repository checks | Complete |
| UARP-01 | Factual UARP v0.1 contracts and runtime validation | `packages/uarp` | BASE-01 | A1, A2 | Complete |
| ADAPTER-01 | Harness Adapter and Runtime Observer contracts | `packages/adapter-core` | UARP-01 | A3 | Complete |
| SIM-01 | Deterministic simulated Adapter fixture | `adapters/first-harness` | ADAPTER-01 | A3, A6, A7 | Complete |
| OBS-01 | Ingestion, dedupe, buffering, aggregation, and redaction hooks | `observer` | UARP-01, ADAPTER-01 | A4, A5, A7 | Complete |
| PHASE1-INT-01 | Integrated simulated stream and regression tests | `tests/ai-quest-world` | SIM-01, OBS-01 | A1-A8 | Complete |

## Repair history

No Phase 1 repair has been recorded.

## Acceptance result

- A1 PASS: valid fixture parsing and JSON round-trip.
- A2 PASS: missing event/run IDs, unsupported versions, and game-semantic attributes are rejected.
- A3 PASS: capability validation, Adapter contracts, and safe simulated lifecycle.
- A4 PASS: duplicate event IDs are forwarded at most once.
- A5 PASS: resource activity aggregation preserves validation and artifact events.
- A6 PASS: canonical simulated event order is stable.
- A7 PASS: parent/child run and agent IDs survive ingestion.
- A8 PASS: Phase 1 has no gameplay UI, Game Core, SQLite world schema, external AI, or control path.

## Completion decision

Phase 1 is green. Stop at the milestone boundary; the next workstream is local persistence and is not started in this change.

## Exact next action

Resume with Milestone 2 planning when requested: define the smallest local event persistence slice without changing the Phase 1 public boundaries.
