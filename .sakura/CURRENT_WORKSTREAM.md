# Current Workstream: Web World Presentation Boundary

## Outcome

Turn the authoritative World State and Quest/progression read models into a world-first local Web scene. The Game Core remains the only writer of building, unlock, activity, and cumulative progression state; the Web layer presents the returned state and never recalculates game outcomes.

## Acceptance

- W1: A fresh World State starts with Small Camp active, AI Gate dormant, Quest Guild old, and Workshop/Library locked.
- W2: Root run start activates the Gate and records active runs; terminal events remove runs and produce a Returning Gate state.
- W3: A credible completed Quest restores the Guild once, unlocks Workshop for Engineering/Debugging/Automation progress, and unlocks Library for Research/Planning progress.
- W4: Skill XP, Domain Progress, qualifying Quest count, and real artifact count accumulate exactly once per Quest progression.
- W5: Unverified, Failed, and Cancelled outcomes do not unlock buildings or fabricate artifacts; limited progression already calculated by G4 may still be recorded.
- W6: Duplicate runtime event IDs and duplicate resolved Quest progressions are idempotent in memory and after SQLite restart.
- W7: World State has a versioned schema, validates all building states, and exposes at most three deterministic return highlights.
- W8: Phase 1, persistence, semantic, Quest, and progression tests remain green without an external AI/API.

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
| WORLD-01 | Versioned World State model and deterministic event/progression projection | `core/world` | PROGRESSION-INT-01 | W1-W5, W7 | Complete |
| WORLD-PERSIST-01 | SQLite World State row and applied-input idempotency store | `storage/sqlite` | WORLD-01 | W6-W7 | Complete |
| WORLD-READ-01 | Durable Quest and progression read models | `storage/sqlite` | QUEST-INT-01, PROGRESSION-INT-01 | W4, W6 | Complete |
| WORLD-INT-01 | Main-branch integration and restart/scope review | Repository | WORLD-01, WORLD-PERSIST-01, WORLD-READ-01 | W1-W8 | Complete |
| WORLD-WEB-01 | World Scene, Mini HUD, contextual panels, and Return Overlay | `apps/world-web` | WORLD-INT-01 | G6 presentation slice | Complete |
| WORLD-WEB-02 | Wire the Web endpoint to SQLite-backed read models and live Observer flow | `apps/world-web` / `storage/sqlite` | WORLD-WEB-01 | G6 live read-model checks | Complete |

## Repair history

- G2 batch review repaired full-envelope game-semantic rejection, JSON-safe value checks, and private SQLite handle encapsulation.

## Acceptance result

G0-G5 and E1-E8 remain green. W1-W8 pass for the persistent World State slice.

## Completion decision

The persistent World State slice is complete: fresh-state, active/returning Gate, credible unlock, negative-evidence, duplicate replay, SQLite restart, temporary activity decay, milestone hooks, durable read models, and highlight-budget fixtures pass together.

The Web presentation slice is complete: the scene is world-first, desktop uses a contextual side panel, narrow screens use an accessible bottom drawer/navigation, the Return Overlay exposes only bounded World State highlights, and the root page reads SQLite-backed projections. The deterministic fixture remains an explicit visual-verification lens rather than the default world source.

## Exact next action

Select and implement the first real Harness Adapter behind the existing Adapter/Observer boundary, then feed one real local run into the persistent Web world.
