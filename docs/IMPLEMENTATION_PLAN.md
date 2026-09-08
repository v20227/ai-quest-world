# IMPLEMENTATION PLAN — AI Quest World v0.1

## 1. Strategy

Build the factual/event path first, then the game rules, then the renderer.

Do not spend the first phase polishing pixel art before a real/simulated run can change authoritative World State.

## 2. Recommended milestone order

### Milestone 0 — Repository baseline

Goals:

- inspect existing repository
- preserve coherent existing stack if present
- if empty, establish a small TypeScript workspace suitable for local runtime + Web renderer
- establish lint/typecheck/test commands
- add architecture dependency checks where practical

Exit criteria:

- one command runs unit tests
- one command runs typecheck
- directory boundaries match the spec

### Milestone 1 — UARP v0.1

Implement:

- event envelope
- event type union
- event attribute schemas/types
- capability descriptor
- evidence refs
- privacy metadata
- runtime validation/parsing

Tests:

- valid examples parse
- missing required identifiers reject
- version handling works
- no game-layer fields appear in protocol contracts

Exit criteria:

- mock events can be serialized/deserialized/validated

### Milestone 2 — Adapter Core + simulated adapter

Implement:

- `HarnessAdapter` contract
- `RuntimeObserver`/event sink contract
- adapter lifecycle
- capabilities
- deterministic simulated adapter producing a realistic run sequence

Simulated flow should include:

- root run
- optional child run
- aggregated resource activity
- resource change
- validation fail
- recovery activity
- validation pass
- artifact create
- run complete

Exit criteria:

- simulated adapter emits valid UARP and can be started/stopped cleanly

### Milestone 3 — Local Observer

Implement:

- event ingestion
- event ID dedupe
- optional ordering buffer
- high-volume aggregation utilities
- privacy/redaction hooks
- diagnostics logging separated from gameplay data

Tests:

- duplicate event does not flow twice
- aggregate window produces one resource.activity
- high-value validation/artifact events remain intact

Exit criteria:

- reliable normalized event stream available to downstream layers

### Milestone 4 — SQLite persistence

Implement repositories for:

- normalized events
- semantic events
- Quests/run associations
- artifacts
- world state
- settings

Requirements:

- schema migrations from the first committed DB version
- transactional game state updates when possible
- restart persistence

Exit criteria:

- a simulated run can be stored and retrieved
- duplicate processing can be detected after restart

### Milestone 5 — Semantic Engine v0.1

Implement deterministic rules for:

- Explore
- Act/Build/Create
- Validate
- Recover
- Deliver
- Return

Implement six-domain scoring and impact weights.

Requirements:

- raw counts alone cannot dominate scoring
- repeated identical semantic events are capped/decayed
- Semantic Engine emits semantic records; it cannot edit World State

Exit criteria:

- fixture streams produce stable expected semantic timelines/activity mix

### Milestone 6 — Quest Engine

Implement:

- Candidate Quest creation on qualifying root run
- child/retry association
- lifecycle transitions
- progressive title/domain/difficulty updates
- manual merge domain method/API if included

Exit criteria:

- a multi-run simulated scenario produces one correct Quest

### Milestone 7 — Outcome / Evidence Engine

Implement:

- Verified
- Supported
- Unverified
- Failed
- Cancelled

Evidence policy should distinguish native “success” from strong verification evidence.

Exit criteria:

- fixtures demonstrate correct confidence classification
- a `run.completed` with no evidence is not automatically Verified

### Milestone 8 — Rewards / growth / anti-abuse

Implement:

- Skill XP
- Domain Progress
- Artifact→Loot reference
- Milestone triggers
- reward caps/decay
- duplicate/replay protection

Explicit tests:

- 10x token use does not directly create 10x reward
- 20 identical failures do not grant 20x Debugging growth
- subagent count does not multiply completion rewards

Exit criteria:

- deterministic reward snapshots pass

### Milestone 9 — World State

Implement:

- Small Camp baseline
- Gate activation/activity/return
- Guild restore/activity
- Workshop unlock/activity/progress/milestone
- Library unlock/activity/progress/milestone
- prop/milestone state hooks
- activity decay separate from permanent progress

Exit criteria:

- the same simulated run visibly changes authoritative world data
- restart preserves it

### Milestone 10 — Web Pixel World

Implement presentation primitives:

- World Scene
- Mini HUD
- Quest Panel
- Building Panel
- Artifact Card
- Return Overlay

Rules:

- no dashboard-first landing page
- no free movement
- world scene persists behind contextual UI

Exit criteria:

- all major state can be understood without raw logs

### Milestone 11 — Return / onboarding moments

Implement:

- Gate Awakening
- First Expedition indication
- Quest Return
- first Guild restore
- Workshop/Library unlock presentation
- artifact appearance
- short skippable milestone feedback

Exit criteria:

- the first three “magic moments” are coherent and not spammy

### Milestone 12 — First real Harness Adapter

Only after the simulated vertical slice is green, implement the first chosen real harness adapter.

Steps:

- research the harness's supported observable interfaces
- map capabilities honestly
- keep all source-specific code inside adapter boundary
- do not force unsupported capabilities
- add recorded/fixture-based tests for its event mapping

Exit criteria:

- real harness run reaches the same downstream UARP/Game flow without Game Core changes

### Milestone 13 — Full acceptance

Run the acceptance scenarios in `TEST_AND_ACCEPTANCE.md`.

Do not mark v0.1 complete until they pass.

## 3. Preferred implementation discipline

At every milestone:

1. implement minimal API/data structure;
2. add focused unit tests;
3. add fixture/integration test;
4. run typecheck/lint/test;
5. confirm no scope violation;
6. commit a coherent milestone.

## 4. Decisions deliberately deferred

- final public SDK packaging
- chosen cloud architecture
- Godot/Pixi/Phaser migration
- multi-harness UI design beyond capability model
- Game→Harness control protocol
- economy
- social systems
- advanced narrative AI

Do not block v0.1 on these.
