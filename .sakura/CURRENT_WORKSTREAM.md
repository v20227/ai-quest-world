# Current Workstream: Deterministic Semantic Engine

## Outcome

Turn ordered, validated UARP facts into deterministic semantic records and a six-domain Activity Mix. The engine owns interpretation only: it must not mutate Quest, reward, growth, artifact, World State, renderer, or Harness state.

## Acceptance

- C1: The engine emits a stable semantic timeline for the canonical simulated run: `DEPART → EXPLORE → ACT → VALIDATE → RECOVER → VALIDATE → DELIVER → RETURN`.
- C2: The engine recognizes exploration, implementation, validation failure/success, recovery, delivery, and return from factual event types and attributes.
- C3: Six domains are represented: Research, Planning, Engineering, Debugging, Creation, and Automation.
- C4: Activity Mix uses deterministic semantic impact weights and does not let raw resource/token/tool counts dominate meaningful changes.
- C5: Parent/child run context contributes to one root semantic timeline while preserving source run and agent identity.
- C6: Replaying the same `event_id` is idempotent and does not duplicate semantic records or domain scores.
- C7: Semantic records are deterministic, contain no reward/game-state mutations, and can be consumed without a concrete adapter or UI.
- C8: Phase 1 and G2 persistence tests remain green without an external AI/API.

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
| SEMANTIC-01 | Semantic types, phase state machine, domain weights, and deterministic engine | `core/semantic` | PERSIST-INT-01 | C1-C7 | In progress |
| SEMANTIC-02 | Canonical semantic timeline, Activity Mix, hierarchy, and replay tests | `tests/ai-quest-world/semantic.test.mjs` | SEMANTIC-01 contract | C1-C8 | In progress |
| SEMANTIC-INT-01 | Main-branch integration and scope review | Repository | SEMANTIC-01, SEMANTIC-02 | C1-C8 | Planned |

## Repair history

- G2 batch review repaired full-envelope game-semantic rejection, JSON-safe value checks, and private SQLite handle encapsulation.

## Acceptance result

G0-G2 remain green. G3 semantic acceptance is pending C1-C8.

## Completion decision

G3 is complete only after the semantic fixture, replay/idempotency checks, Activity Mix checks, and the full regression suite pass together.

## Exact next action

Integrate the two bounded semantic changes, run the full test batch, and review that no Game Core or World State mutation has entered the semantic layer.
