# Current Workstream: Evidence-Bounded Progression and Anti-Abuse

## Outcome

Turn a completed Quest plus deterministic semantic records into bounded Skill XP, Domain Progress, and real artifact rewards. Replays, high-volume facts, repeated failures, child runs, and retries must not multiply progression, and this slice must not mutate World State.

## Acceptance

- E1: Only terminal Quest outcomes produce progression; active and validating Quests remain pending.
- E2: Verified, Supported, Unverified, Failed, and Cancelled outcomes use deterministic bounded multipliers; failures may receive limited process credit but never full completion credit.
- E3: Skill XP is based on fixed semantic transition weights and outcome evidence, not token usage, tool-call count, file-read/search count, or agent count.
- E4: Repeated semantic kinds use diminishing credit and per-kind caps; twenty identical validation failures cannot produce twenty times the first failure credit.
- E5: Domain Progress is bounded per Quest and follows semantic domain contributions plus outcome confidence.
- E6: A real artifact reward requires `durable=true` and a URI/path or evidence reference; failed/cancelled/unverified outcomes do not fabricate artifact rewards.
- E7: Duplicate semantic IDs/source event IDs are idempotent, child/retry records remain within the root Quest, and the output is deterministic.
- E8: Phase 1, persistence, semantic, and Quest tests remain green without an external AI/API.

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
| PROGRESSION-01 | Evidence-bounded Skill XP, Domain Progress, and artifact reward policy | `core/game` | QUEST-INT-01 | E1-E6 | Complete |
| ANTIABUSE-01 | Replay protection, diminishing credits, and reward caps | `core/game` | PROGRESSION-01 | E3-E7 | Complete |
| PROGRESSION-INT-01 | Main-branch integration and scope review | Repository | PROGRESSION-01, ANTIABUSE-01 | E1-E8 | Complete |

## Repair history

- G2 batch review repaired full-envelope game-semantic rejection, JSON-safe value checks, and private SQLite handle encapsulation.

## Acceptance result

G0-G4 and D1-D9 remain green. E1-E8 pass for the progression/anti-abuse slice.

## Completion decision

The progression/anti-abuse slice is complete: deterministic snapshots, duplicate replay, high-volume, repeated-failure, child/retry, and artifact-evidence fixtures pass together without World State mutation.

## Exact next action

Define the smallest persistent World State repository and projection slice that consumes completed Quest progression without changing reward authority.
