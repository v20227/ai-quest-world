# Evidence

## Repository baseline

- The supplied development pack passed SHA-256 verification and `unzip -t` integrity checks before extraction.
- The project root is a Git repository on `main` with the GitHub remote `https://github.com/v20227/ai-quest-world.git`.
- Node 24.12.0 and npm 11.6.2 are available; the local runtime uses built-in `node:sqlite` and the Node test runner.

## Phase 1

- `node --check` passed for every Phase 1 ESM module.
- `npm test` passed: 8/8 tests, 0 failures.
- The simulated Adapter emitted the complete root/child fixture in stable order; the Observer forwarded 11 unique events after a replayed start.
- Duplicate `event_id` values were accepted at most once, including events queued before flush.
- Redaction preserved event identity and recorded strict privacy metadata.
- Resource aggregation combined only `resource.activity` events and preserved validation/artifact events and their relative order.
- The validator rejected missing IDs, unsupported protocol versions, and game-semantic attribute keys.

## Milestone 2 normalized event persistence

- `node --check` passed for the SQLite schema and event-store modules.
- The persistence suite passed: 9/9 tests, 0 failures.
- The combined Phase 1 and persistence suites passed: 15/15 tests, 0 failures.
- File-backed SQLite restart preserved event identity, full UARP envelope, parent/child context, evidence references, and privacy metadata.
- Duplicate event IDs remained idempotent in one process and after reopening the database.
- Invalid single events were rejected without rows, and invalid batches rolled back without partial writes.
- Schema version 1 and the event identity/run/replay indexes were verified.
- Batch review repairs now reject game-semantic keys across the complete UARP envelope, reject JSON values that would be silently changed, and keep the raw SQLite handle private.

## G3 deterministic semantic interpretation

- The semantic suite passed: 9/9 tests, 0 failures.
- The combined Phase 1, persistence, and semantic suites passed: 26/26 tests, 0 failures.
- The canonical simulated run produced the stable eight-node phase timeline from DEPART through EXPLORE, ACT, VALIDATE, RECOVER, DELIVER, and RETURN.
- Fixed semantic impact weights and repeated resource-activity suppression kept large raw counts from changing the interpretation or Activity Mix.
- Parent/child run and agent context was preserved under one root semantic timeline.
- Replaying an event ID did not duplicate semantic records or domain scores.
- Semantic records remained free of reward, Quest, building, and World State mutation fields.

## G4 Quest and outcome foundation

- `node --check` passed for the Quest types, Quest engine, outcome policy, and Game Core entry point.
- The Quest suite passed: 11/11 tests, 0 failures.
- The combined Phase 1, persistence, semantic, and Quest suites passed: 37/37 tests, 0 failures.
- The canonical simulated run produced one completed Quest with child-run membership, validation history, Activity Mix, and a durable artifact reference.
- Candidate, Active, Validating, Completed, Failed, and Cancelled lifecycle states were verified, including independent root separation and child/retry attachment.
- Native completion alone remained Unverified; successful validation plus a durable referenced artifact was required for Verified.
- Artifact updates merged factual references without discarding previously observed durable evidence.
- Quest projections remained free of reward, loot, growth, and World State mutation fields.

## G4 progression and anti-abuse

- `node --check` passed for progression types, policy, and the updated semantic/Quest projections.
- The progression suite passed: 7/7 tests, 0 failures.
- The combined Phase 1, persistence, semantic, Quest, and progression suites passed: 44/44 tests, 0 failures.
- Active and validating Quests produced pending zero progression; terminal outcomes resolved bounded Skill XP and Domain Progress.
- Verified, Supported, Unverified, Failed, and Cancelled outcomes used deterministic confidence multipliers; failed work retained only limited process credit.
- Raw resource volume changes did not change progression, and duplicate semantic records changed only anti-abuse diagnostics.
- Twenty repeated validation failures produced the same capped validation credit as one initial failure after diminishing credit was applied.
- Real artifact loot required a durable artifact with a path or evidence reference; failed and unverified outcomes produced no fabricated loot.
- Activity Mix rounding was clamped to a valid non-negative 0-100 range for every semantic and Quest projection.

## G5 World State and read-model foundation

- `node --check` passed for the World State model, projector, SQLite repository, and schema migration.
- The World State suite passed: 8/8 tests, 0 failures.
- The Quest/progression read-model suite passed: 2/2 tests, 0 failures.
- The combined Phase 1, persistence, semantic, Quest, progression, World State, and read-model suites passed: 54/54 tests, 0 failures.
- A fresh state contains an active Small Camp, dormant AI Gate, old Quest Guild, and locked Workshop/Library.
- Root run lifecycle events activate the Gate, track active runs, and leave a returning state after completion.
- Credible completed progression restores the Guild, unlocks domain-relevant buildings, accumulates bounded totals, and keeps at most three return highlights.
- Unverified progression records limited totals without unlocking buildings or fabricating artifact state.
- Duplicate runtime event IDs and resolved Quest progression remain idempotent in memory and across SQLite restart.
- Temporary Gate/building activity decays at a deterministic half-life while permanent unlocks, milestones, and cumulative progress remain unchanged.
- First qualifying completion, first real artifact, and first Verified outcome are persisted as unique milestone hooks.
- Quest and progression projections survive restart, reject stale replacement, and expose a stable read-only repository boundary for the Web layer.

## G6 Web World

- The Web suite and browser verification passed: the world-first scene, Mini HUD, contextual panels, Artifact Card, Return Overlay, mobile drawer/navigation, theme settings, reduced-motion setting, and zero browser console errors were verified.
- The root Web page reads SQLite-backed `/api/world`; the deterministic canonical and unverified fixtures remain explicit `/api/demo` modes.
- A persistent Web endpoint replayed a simulated run after SQLite restart without changing the world projection.

## G7 Codex CLI adapter

- `CodexCliHarnessAdapter` consumes the public `codex exec --json` JSONL stream behind the existing Adapter Core boundary.
- Capabilities and tests cover lifecycle, shell tools, recognized validation commands, file changes, artifact evidence references, usage metadata, process/stream errors, and strict privacy redaction.
- Reasoning, agent-message text, full commands, and file paths do not cross into UARP events.
- A local Codex CLI smoke in an isolated Git directory completed successfully through `npm run observe:codex`; the resulting SQLite database reopened with the same Quest and World State.
- A Codex-shaped end-to-end fixture reached a Verified Quest, one artifact loot reference, Guild restoration, Workshop unlock, and persistent World State without Game Core changes.

## G8 v0.1 acceptance

- The full regression suite passes: `npm test` reports 62/62 tests with 0 failures.
- Canonical, multi-agent, unverified, failed, cancellation, failure-farming, replay, restart, Web, and privacy acceptance scenarios remain covered by the test suites.
- The real read-only Codex observation correctly produced an Unverified Quest when it performed no validation or file change; no artifact or unlock was fabricated.
- The project root and `origin/main` are synchronized at the v0.1 delivery commit.

## Remaining verification

- No v0.1 acceptance checks remain. Further work should begin as a separately scoped v0.2 goal.
