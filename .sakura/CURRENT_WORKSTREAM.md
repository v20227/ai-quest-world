# Current Workstream: AI Quest World v0.1 Trusted Loop

## Current acceptance gate

The earlier delivery decision below is historical and superseded. v0.1 remains open until the following integrated conditions pass. Existing architectural boundaries, offline operation, metadata-first collection, deterministic replay, and the original scope remain mandatory.

- T1: Ordinary commands are not validation; failed file operations are not artifacts; referenced outputs are real; later unresolved validation failures prevent Verified. Check: adapter/outcome adversarial tests.
- T2: Empty runs earn no rewards; explicit child/resume relationships share one Quest and bounded settlement. Check: progression, association, restart/replay tests.
- T3: Supported real CLI entry and capability limits are explicit; engineering and non-code work reach the same runtime without source-specific Game Core changes. Check: isolated real-run acceptance plus fixture regressions.
- T4: World updates automatically, selects the correct active/latest Quest, presents each new return once, and preserves all task artifacts. Check: multi-Quest browser/integration tests.
- T5: Temporary activity decays without losing permanent growth; old derived data can be rebuilt safely from stored facts after policy changes. Check: migration/reprojection and clock-controlled restart tests.
- T6: Difficulty is a bounded deterministic estimate with Unknown when unsupported; original scene, artifact access, and 1–3 short return highlights communicate actual results. Check: core and browser acceptance.

| ID | Result | Owner | Prerequisite | Check | State |
| --- | --- | --- | --- | --- | --- |
| TRUST-01 | Conservative adapter evidence, outcome and empty-run settlement | adapters / core/game | Existing foundation | T1, T2 | Batch verified; integration pending |
| TRUST-02 | Explicit resume association and safe derived-state rebuilding | core / storage / runtime | TRUST-01 contracts | T2, T5 | In progress |
| LIVE-01 | Continuous multi-Quest world, durable return identity and clock projection | runtime / renderer | TRUST-02 | T4, T5 | Pending |
| EXPERIENCE-01 | Minimal difficulty, artifact access and scoped world feedback | core / renderer | LIVE-01 | T6 | Pending |
| ACCEPT-01 | Real engineering/non-code, negative paths, browser, restart and independent review | Integration | All preceding | T1–T6 | Pending |

## Current repair history

- TRUST-F01 at `57ca8f8`: empty lifecycle yielded 1 XP; `echo test` plus failed file change yielded Verified/32 XP/one loot; pass followed by failed validation yielded Verified/36 XP/one loot. Root causes: keyword classification, unconditional durable artifacts, any historical pass, unconditional unverified bonus. No repairs attempted before this workstream.
- LIVE-F01 at `57ca8f8`: no automatic snapshot refresh; live refresh suppresses return; first-array task selection; no seen-return cursor or integrated time advance. Existing passing tests do not cover these user paths.
- TRUST-F02 independent review: version/config-only tool modes could verify; pending/unknown retries could reuse an old pass or erase failure. Added mode exclusions and per-target unresolved-attempt tracking. The initial 71-test pass did not cover these cases; new regressions are required before commit.

## Historical foundation records

## Outcome

Deliver the v0.1 local-first world pipeline. The Codex adapter remains a strict source boundary; the Game Core remains the only writer of building, unlock, activity, and cumulative progression state; the Web layer presents returned state and never recalculates game outcomes.

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
| CODEX-ADAPTER-01 | Codex CLI JSONL adapter with strict metadata-first mapping | `adapters/codex-cli` | WORLD-WEB-02 | adapter contract and privacy tests | Complete |
| CODEX-RUNTIME-01 | Stream a Codex-shaped run through persistent runtime and World State | `apps/world-web` | CODEX-ADAPTER-01 | persistent end-to-end adapter test | Complete |
| G8-ACCEPTANCE-01 | Execute the full v0.1 acceptance matrix and release gate | Repository | CODEX-RUNTIME-01 | `npm test` plus real local smoke | Complete |

## Repair history

- G2 batch review repaired full-envelope game-semantic rejection, JSON-safe value checks, and private SQLite handle encapsulation.
- VERSION-RECONCILIATION-01 repaired the stale Sakura display-version ledger by counting every Git commit once and associating each increment with its triggering commit.

## Acceptance result

G0-G5 and E1-E8 remain green. W1-W8 pass for the persistent World State slice.

## Completion decision

The persistent World State slice is complete: fresh-state, active/returning Gate, credible unlock, negative-evidence, duplicate replay, SQLite restart, temporary activity decay, milestone hooks, durable read models, and highlight-budget fixtures pass together.

The Web presentation slice is complete: the scene is world-first, desktop uses a contextual side panel, narrow screens use an accessible bottom drawer/navigation, the Return Overlay exposes only bounded World State highlights, and the root page reads SQLite-backed projections. The deterministic fixture remains an explicit visual-verification lens rather than the default world source.

The Codex adapter slice is complete: live public JSONL was checked in an isolated local smoke, source-specific events are normalized at the adapter boundary, malformed streams fail closed, and a Codex-shaped run reaches Verified Quest, artifact loot, and persistent World State without changes to Game Core.

The v0.1 acceptance gate is complete: 62/62 automated tests pass, the real read-only Codex command has completed and survived SQLite restart, and the browser presentation checks remain green.

## Exact next action

Follow the current acceptance gate and `.sakura/STATE.md`; the earlier v0.2 handoff is withdrawn.
