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

## Remaining verification

- Semantic Engine, Game Core, Web World, and real Harness integration are intentionally not implemented in this slice.
