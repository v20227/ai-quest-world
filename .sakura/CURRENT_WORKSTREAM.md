# Current Workstream: Quest Lifecycle and Outcome Evidence

## Outcome

Turn a normalized root run plus deterministic semantic records into one authoritative Quest lifecycle with child/retry association, evidence-based outcome confidence, and real artifact references. This slice must not award growth/rewards or mutate World State.

## Acceptance

- D1: A qualifying root `run.started` creates one `CANDIDATE` Quest with a deterministic title and root run identity.
- D2: Meaningful semantic activity promotes the Quest to `ACTIVE`; validation activity uses `VALIDATING`.
- D3: A root terminal event transitions the Quest to `COMPLETED`, `FAILED`, or `CANCELLED`.
- D4: Child runs and retry runs attach to the parent Quest and never create an independent Quest completion.
- D5: Independent root runs create separate Quests; replayed event IDs do not duplicate Quests or change their state.
- D6: `run.completed` is `VERIFIED` only with successful validation plus a durable real artifact/evidence reference; otherwise it is `SUPPORTED` or `UNVERIFIED` according to available evidence.
- D7: Failed and cancelled terminal events produce `FAILED` and `CANCELLED` confidence respectively; natural-language/native completion alone is not Verified.
- D8: Quest records preserve semantic phase/domain mix, run/agent membership, validation summary, artifact references, and deterministic timestamps without reward or World State fields.
- D9: Phase 1, persistence, and semantic tests remain green without an external AI/API.

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
| SEMANTIC-01 | Semantic types, phase state machine, domain weights, and deterministic engine | `core/semantic` | PERSIST-INT-01 | C1-C7 | Complete |
| SEMANTIC-02 | Canonical semantic timeline, Activity Mix, hierarchy, and replay tests | `tests/ai-quest-world/semantic.test.mjs` | SEMANTIC-01 contract | C1-C8 | Complete |
| SEMANTIC-INT-01 | Main-branch integration and scope review | Repository | SEMANTIC-01, SEMANTIC-02 | C1-C8 | Complete |
| QUEST-01 | Quest types, root association, lifecycle, and deterministic projections | `core/game` | SEMANTIC-INT-01 | D1-D5, D8 | Complete |
| OUTCOME-01 | Outcome/evidence policy and factual artifact references | `core/game` | QUEST-01 | D6-D8 | Complete |
| QUEST-INT-01 | Main-branch integration and scope review | Repository | QUEST-01, OUTCOME-01 | D1-D9 | Complete |

## Repair history

- G2 batch review repaired full-envelope game-semantic rejection, JSON-safe value checks, and private SQLite handle encapsulation.

## Acceptance result

G0-G3 remain green. D1-D9 pass in the Quest/outcome foundation slice; G4 growth, rewards, anti-abuse, and World State work remains.

## Completion decision

The Quest/outcome foundation slice is complete. The broader G4 milestone remains in progress until deterministic growth, rewards, anti-abuse, and artifact-reference hardening are implemented and verified.

## Exact next action

Define the next G4 batch for evidence-bounded growth, rewards, and anti-abuse rules without mutating World State.
