# TEST & ACCEPTANCE — AI Quest World v0.1

## 1. Testing philosophy

The most important tests are not screenshot tests. They prove boundary correctness and the real loop:

`runtime facts → semantics → game decision → persistent world → presentation`.

## 2. Required test layers

### Protocol tests

- UARP event parsing/validation
- protocol version
- required IDs
- capability descriptor
- privacy metadata
- event serialization round trip

### Adapter tests

- native/fixture event → correct UARP event
- capability declaration matches actual emitted fields
- source-specific payload does not leak into Game Core types

### Observer tests

- event dedupe
- replay idempotency
- aggregation windows
- high-value event preservation
- redaction behavior

### Semantic tests

- read/search-heavy period → Explore semantic activity
- modification activity → Act/Engineering semantics when appropriate
- validation failure → Validate failure semantics
- post-failure change → Recover semantics
- later pass → recovery/validation resolution
- artifact creation → Deliver semantics
- Activity Mix is stable for known fixtures

### Quest tests

- root run creates Candidate Quest
- child run attaches to parent Quest
- retry does not generate separate completion reward
- ambiguous independent root run creates a separate candidate
- terminal states behave correctly

### Outcome tests

- run completed only → not Verified automatically
- successful validation + durable artifact + completion → can be Verified
- explicit cancellation → Cancelled
- strong failure evidence → Failed

### Reward/anti-abuse tests

- duplicate event cannot duplicate XP/progress/loot
- token count alone cannot drive XP
- tool-call count alone cannot drive XP
- child-agent count cannot multiply completion reward
- repeated identical failures cap/decay
- event replay after restart cannot re-award milestone

### Persistence tests

- world state survives restart
- Quest history survives restart
- artifact references survive restart
- processed event IDs survive restart sufficiently to prevent replay reward

### Renderer/read-model tests

- locked/unlocked building states map to expected visual state
- active/busy state does not erase permanent progress
- Return Overlay prioritizes at most 1–3 ordinary results
- world state drives presentation; UI animation does not award state

## 3. Canonical integration fixture

Build one deterministic fixture sequence:

```text
run.started: Fix Authentication
resource.activity: reads/searches
resource.changed: code modified
validation.completed: failed 13/16
resource.changed: recovery change
validation.completed: succeeded 16/16
artifact.created: auth-refactor.patch
run.completed
```

Expected semantic interpretation:

```text
Explore
Act
Validate Failure
Recover
Validate Success
Deliver
Return
```

Expected game results:

- one Quest, not one per event/run step
- Primary Domain likely Debugging or Engineering based on configured weights
- meaningful secondary Domain retained
- Outcome = Verified if evidence policy is met
- Skill/Domain growth granted within caps
- one real Code Artifact represented as Loot
- Workshop unlocks/reacts/progresses as appropriate
- Quest Guild restores/records completion if first qualifying Quest
- ordinary Return highlights only the most important results

## 4. Multi-agent fixture

Fixture:

```text
root run
├ child agent/run: research
├ child agent/run: implementation
└ child agent/run: validation
```

Expected:

- one Quest
- one completion reward
- child work contributes semantic Activity Mix
- parent/child relationships are preserved

## 5. Unverified fixture

Fixture:

```text
run.started
resource activity
resource changed
run.completed
(no validation, no durable artifact evidence)
```

Expected:

- Quest can complete lifecycle-wise
- confidence = Unverified (or at most Supported if other evidence exists)
- reward lower than Verified
- no fabricated validated outcome

## 6. Failure farming fixture

Fixture repeats the same validation failure many times.

Expected:

- UI may show escalation/continued blocker
- semantic/debug growth caps or decays
- no infinite XP farming
- no new Quest per retry

## 7. First-session acceptance scenario

Starting state:

- Small Camp
- Old Board
- Dormant Gate

Actions:

1. connect first harness/simulated adapter;
2. confirm Gate activates;
3. run first qualifying Quest;
4. complete with evidence;
5. return to world.

Expected visible results:

- AI Gate activated
- Quest existed while run was active
- Quest completion is shown
- Quest Guild restores after first qualifying completion
- relevant Workshop/Library unlocks/reacts based on real work
- artifact appears only if real artifact exists
- result persists after app restart

## 8. Non-functional acceptance

- no external AI API key is required
- app remains usable offline after dependencies/runtime are available
- no hidden chain-of-thought dependency
- no required source-code/full-transcript ingestion
- event processing remains idempotent
- a harness missing optional capabilities degrades gracefully

## 9. Product acceptance question

After a real Agent task, ask:

> Can the user clearly feel that the real work left a meaningful, persistent trace in the world without the game having distracted them during the work?

If not, v0.1 is not done even if the screens render.
