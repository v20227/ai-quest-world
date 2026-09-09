# GAME RULES — AI Quest World v0.1

## 1. Purpose of the game layer

The game layer exists to turn **meaningful, real Agent work** into understandable progression and persistent memory.

It must not reward empty AI usage, token burning, repeated retries, or artificial task splitting.

Core rule:

> Real work creates adventure. Real outcomes create rewards. Long-term real use shapes the player's world.

## 2. Core loop

```text
Real Work
  ↓
Quest
  ↓
Expedition
  ↓
Outcome
  ↓
Growth
  ↓
World Change
  ↓
Return
  ↓
Memory
```

The player should not need to create a manual game task for every harness run.

## 3. Quest vs Run

### Run

A technical execution/session instance in the harness.

### Quest

A real work goal with a meaningful objective and an outcome that can be evaluated at some confidence level.

Therefore:

```text
Run != Quest
```

A Quest may contain:

- root run
- child/subagent runs
- retry runs
- review runs
- validation activity
- artifact/evidence references

Default association rule:

- a new qualifying root goal/run creates a Candidate Quest;
- child runs with a parent relationship attach to the parent Quest;
- retries/recovery runs attach to the same Quest unless there is explicit evidence of a new goal;
- multiple independent root goals are separate Candidate Quests;
- ambiguous duplicate Candidates may be manually merged.

No child run or retry receives an independent Quest Completion reward merely for existing.

## 4. Quest lifecycle

v0.1 lifecycle states:

```text
CANDIDATE
  ↓
ACTIVE
  ↓
VALIDATING (when applicable)
  ↓
COMPLETED
```

Alternative terminal states:

- FAILED
- CANCELLED

Completion confidence is separate from lifecycle terminal state and uses:

- VERIFIED
- SUPPORTED
- UNVERIFIED

### Candidate

A likely work goal has been detected, but the system may not yet know domain, difficulty, or exact title.

### Active

The goal is accepted as a Quest and meaningful work is occurring.

### Validating

The work is undergoing tests, build checks, review, comparison, or other observable validation.

### Completed

The run/work goal ended in a completion state. Completion confidence still determines reward strength.

### Failed

Observable evidence indicates the goal was not accomplished.

### Cancelled

The work was explicitly stopped/cancelled.

## 5. Progressive Quest classification

Quest properties should improve as evidence arrives.

Example start:

```text
Fix Authentication
Domain: Unknown
Difficulty: ???
Status: Active
```

Example final:

```text
Fix Authentication
Primary: Debugging
Secondary: Engineering
Difficulty: 4/5
Validation: 16/16 passed
Outcome confidence: Verified
Artifact: Authentication Refactor
```

Do not require an LLM to classify all fields at creation time.

## 6. Work domains

v0.1 domains:

### Research

Work primarily reduces information uncertainty: search, reading, comparison, evidence gathering, summarization/synthesis.

### Planning

Work primarily decides how work should be done: decomposition, prioritization, architecture, route planning, trade-offs, decision structure.

### Engineering

Work changes a system: code/config/module/file implementation, construction, technical modification.

### Debugging

Work closes the gap between expected and actual behavior: reproduce, diagnose, fix, recover, validate.

### Creation

Work creates human-facing expression: writing, visual/design/media/content output.

### Automation

Work makes future work happen automatically: scripts, workflow, triggers, orchestration, pipelines, reusable automation.

## 7. Activity Mix

A Quest is multi-domain.

Example:

```text
Engineering 48%
Debugging   22%
Planning    15%
Research    10%
Automation   5%
```

The highest meaningful share becomes Primary Domain; other meaningful shares remain secondary.

Do not calculate Activity Mix by raw event count alone. High-volume low-value activity (file reads, token deltas, polling) must not dominate a single high-impact finding/validation/delivery event.

Use semantic impact weights and phase context.

## 8. Expedition and phases

An Expedition is the game representation of the active real execution(s) for a Quest.

Base phase vocabulary:

```text
DEPART
EXPLORE
ACT
VALIDATE
RECOVER
DELIVER
RETURN
```

Domain-specific semantic labels may map into these phases.

Examples:

Research:

```text
Explore → Discover → Synthesize → Deliver
```

Engineering:

```text
Explore → Build → Validate → Recover → Deliver
```

Not every Quest must visit every phase. The system should reflect observed work rather than force a fake adventure script.

## 9. Meaningful events and visibility

Raw facts are not automatically game events.

Use a visibility/importance scale:

- 0: hidden operational fact
- 1: available in technical/debug history only
- 2: Quest detail/timeline
- 3: short HUD hint
- 4: strong Quest feedback
- 5: world-level milestone

Examples:

- `file.read` → 0
- aggregated exploration activity → 2
- key finding discovered → 3
- major validation failure → 4
- first Workshop unlock → 5

Repeated related facts should be aggregated/escalated rather than spammed.

## 10. Encounter rules

An Encounter is a meaningful work development that changes uncertainty, risk, route, or completion likelihood.

Possible semantic types:

- problem
- discovery
- decision
- risk
- opportunity
- blocker
- validation failure
- recovery turning point

An ordinary error line/tool call/file read is not automatically an Encounter.

The threshold should be intentionally high enough that Encounters feel meaningful.

## 11. Boss rules

A Boss represents a major real constraint that materially blocks Quest completion.

Examples:

- critical test suite
- severe bug
- security vulnerability
- deployment blocker
- blocking review
- core dependency failure
- final acceptance gate

Boss state must be grounded in factual evidence.

If the real world has measurable evidence such as 13/16 tests passed, presentation may visualize 13/16 progress.

If the real world only has `2 blocking issues`, display two blockers; do not invent a fake HP percentage.

Rule:

> Fantasy presentation, factual state.

v0.1 may represent Boss/Encounter in panels/timelines only; complex combat is out of scope.

## 12. Dungeon rules

A Dungeon is a shape/classification of a complex multi-stage Quest, not a random fantasy map.

A Quest may qualify as Dungeon-like when it has multiple meaningful phases, repeated act/validate/recover loops, and multiple significant encounters.

v0.1 representation:

- Quest timeline/rooms metaphor
- optional compact dungeon visual vocabulary

Not required in v0.1:

- navigable dungeon map
- real-time combat
- random monsters

## 13. Campaign, Ritual, Landmark — reserved model

These concepts are part of the long-term design language but are not required for v0.1 UI completion.

### Campaign

A long real project composed of multiple Quests.

### Ritual

A real recurring work pattern. It must be based on actual recurring work, not a forced daily login mechanic.

### Landmark

A permanent world memory of a major real project/outcome.

Data structures may leave extension points, but do not let these delay the v0.1 vertical slice.

## 14. Outcome confidence

Completion and confidence are separate.

### VERIFIED

Strong observable evidence exists, such as successful validation plus relevant artifact/result.

### SUPPORTED

Useful evidence supports completion but does not reach the strongest verification standard.

### UNVERIFIED

The run says/appears complete, but the observer lacks adequate external evidence.

### FAILED

Observable evidence shows the real goal was not achieved.

### CANCELLED

Work ended by explicit cancellation.

Do not let an Agent's natural-language “done” alone produce Verified.

## 15. Reward model

The original work-result reward families remain:

1. Skill XP
2. Domain Progress
3. Artifact/Loot reference
4. Milestone

The accepted scope now also includes local Gold, a fixed-price shop, pet hatching and feeding. Gold is a separate non-negative integer balance, not converted from XP or raw tool/token counts. The concrete grant amounts and prices must be defined together before economy implementation.

### Local economy and companion rules

- Qualifying Quest outcomes may produce a uniquely identified Gold grant; child runs, retries and event replay must not multiply it.
- Every purchase must atomically validate the authoritative price and balance, debit Gold and deliver inventory. Repeating a command ID returns the same result rather than spending again; reusing it with a different payload is rejected.
- Hatching consumes an owned egg and creates one pet in the same transaction. Initial design uses explicit species rather than random paid outcomes.
- Feeding consumes an owned food item and updates pet growth atomically. Initial design has no hunger decay, death or inactivity punishment.
- Pet selection changes presentation only. Gold, pets and food do not change Harness capabilities or grant fabricated artifact evidence.
- Player actions and their results persist separately from rebuildable work-event projections, so replay cannot erase purchases or resurrect consumed inventory.
- Initial policy is economy-1 below. Any later price or reward change needs a new explicit policy; existing receipts are preserved.

### Economy-1

- A frozen RESOLVED, COMPLETED Quest progression grants20 Gold when VERIFIED,12 when SUPPORTED, otherwise0. Deduplicate by root goal identity, independently of policy version; replay or adding child runs never issues another grant for that root. The existing frozen first settlement determines the reward, without a second bonus for later evidence updates.
- Start balance0; existing eligible historical settlements backfill once, preserving source Quest and event time with a historical marker in the ledger. No login stipend or duration/call-count income.
- Signal companion egg costs40; only one egg or hatched companion of this initial species may be owned. Hatching consumes one egg immediately and deterministically creates the companion, without automatically selecting it.
- Focus apple costs4 and adds5 growth. Preferred research biscuit costs8 and adds12. Food quantities are integer1..20. Growth is capped100, with stages at0,25,60,100; no decay. Reject feeding at full growth and quantities beyond the servings needed to reach100 before consuming food. The final required serving may be partially effective, and the UI previews the actual increase.
- The initial companion is decorative and its growth is from food. Display alongside work does not claim it participated in an observed Harness run. No combat effects, free training loop, paid currency, random draw or mounts.
- Wallet records retain source Quest, confidence, amount, resulting balance and times. Player receipts retain command identity, action, consumed quantities, currency/growth changes and policy version.

### Skill XP

Represents what kinds of meaningful work the user's AI activity practiced/accomplished.

### Domain Progress

Represents permanent world-domain construction/progress.

Skill XP and Domain Progress are related but not necessarily identical values.

### Artifact/Loot

Requires a real artifact/evidence reference.

### Milestone

Reserved for genuinely important moments such as first verified delivery, first qualifying domain unlock, or a tier threshold.

## 16. Reward inputs

Do not make reward a simple count formula.

Reward may consider:

- quest outcome confidence
- estimated/actual difficulty
- validation strength
- meaningful quality evidence
- efficiency relative to similar work when enough data exists
- key discovery/turning points
- delivery/artifact presence

Token usage is only a possible efficiency input, never a direct XP source.

## 17. Difficulty

Difficulty should be dynamic/progressive rather than perfectly fixed at Quest start.

Useful dimensions:

- Scope
- Uncertainty
- Dependency complexity
- Validation burden
- Recovery complexity

Keep both conceptual values:

- estimated difficulty
- actual/observed difficulty

v0.1 may begin with heuristic star levels 1–5 and improve later.

Do not award more simply because a run emitted more events.

## 18. Failure and recovery

AI failure should create content, not player punishment.

Examples:

- validation failure → Encounter / Recover phase
- repeated meaningful failure → possible escalation subject to caps
- successful recovery → Debugging/Recovery semantic credit

A final Failed Quest can still grant limited process Skill XP because real work occurred, but it should not receive:

- full completion reward
- strong world completion progress
- completion milestone
- fabricated verified loot

No XP subtraction for ordinary AI mistakes in v0.1.

## 19. Anti-abuse rules

The system must resist reward farming.

Hard rules:

- token usage does not directly grant XP
- tool-call count does not directly grant XP
- file-read/search count does not directly grant XP
- subagent count does not directly grant XP
- child run completion does not independently grant Quest completion reward
- retries remain attached to the same Quest when they serve the same goal
- duplicate event IDs are idempotent
- repeated identical failures have diminishing/capped semantic credit
- repeated validation loops do not grant infinite Debugging XP
- replaying stored events cannot duplicate rewards
- splitting one real goal into artificial empty sessions must not multiply reward

Favor outcome/evidence and meaningful semantic transitions over volume.

## 20. Artifact-as-loot rules

Loot must correspond to something real.

v0.1 generic artifact categories:

- Code
- Document
- Research
- Plan
- Creative
- Validation
- Automation
- Major Deliverable

The visual item can be generic, while metadata preserves the real artifact identity/reference.

Example:

```text
real artifact: auth-refactor.patch
visual category: Code Artifact
label: Authentication Refactor
source quest: Fix Authentication
outcome: Verified
```

If there is no durable artifact/evidence object, do not fabricate a loot box just to make the game feel busier.

## 21. World progression

v0.1 world change priority:

```text
Activity > Unlock > Decoration > Tier Upgrade
```

### Activity

Frequent and temporary. Expresses recent real work.

Examples:

- Workshop lights/smoke/machines
- Library lights/books/activity
- Gate glow/particles

Activity decays with time; permanent progress never decays merely because the building becomes idle.

### Unlock

A permanent first-time threshold.

Recommended v0.1 rules:

- first harness connection → AI Gate activated
- first qualifying Quest completion → Quest Guild restored
- first credible Engineering/Debugging/Automation result → Workshop unlocked
- first credible Research/Planning result → Library unlocked

### Decoration

Permanent low-cost visual memory after a small number of meaningful outcomes.

Examples:

- tool rack
- testing bench
- book pile
- map table
- project plaque
- crate/flag

### Tier Upgrade

Rare. Changes major building sprite/shape.

v0.1: maximum 1–2 major visual tiers per building.

## 22. World-change presentation budget

Game Core may record multiple changes from one Quest, but Return presentation must prioritize them.

Ordinary Return:

- show 1–3 meaningful feedback items
- do not stack level-up + achievement + loot + unlock + record + multiple XP banners simultaneously

Milestone Return:

- may use a stronger overlay/animation
- prioritize the permanent world change

This preserves rarity and prevents “mobile ad” feedback spam.

## 23. Onboarding pacing

Early feedback is intentionally denser.

Suggested sequence:

1. first harness connection → Gate Awakening
2. first real Expedition → Active Quest feedback
3. first completion → Guild restored
4. first domain-qualifying outcome → Workshop or Library unlock
5. first real artifact → first Loot
6. first Verified outcome → first trophy/milestone marker

After onboarding, unlock frequency slows and activity/decoration become the common feedback layers.

## 24. Player interaction in v0.1

The player is not merely a spectator, but v0.1 interaction is deliberately light.

Allowed meaningful actions:

- inspect active Expedition/Quest
- inspect evidence/outcome
- merge mistakenly separate Candidate Quests
- accept/continue/archive an unverified result when needed
- inspect/open Artifact
- inspect building/world growth

Out of v0.1:

- strategy loadout that changes harness behavior
- equipment workflow modifiers
- active combat commands
- manual skill-point allocation
- mandatory daily/streak pressure

## 25. Long-term design principle

Future Skill/Equipment/Building systems should eventually correspond to real workflow improvements rather than fake combat stats.

Example future direction:

- `Validation Harness` → stricter real validation workflow
- `Second Opinion` → independent review run
- `Deep Investigation` → stronger pre-implementation investigation phase

But core AI capabilities must never be artificially locked behind game levels. Growth should improve composition/automation/usability, not disable normal AI functionality for new users.

## 26. Product axioms (post-v0.1 direction)

These axioms govern every future gameplay system (economy, pets, shop,
collection, Ritual). They are binding for `docs/REWARD_RULES_SPEC.md` and any
post-v0.1 gameplay implementation. They do not change v0.1 scope.

### A1 — Provenance: nothing without an origin

Everything visible in the world must trace back to real observed work.

- No decoration, item, pet, or world change exists without a real origin.
- Item themes, species, and rarity derive from real quest properties
  (domain, difficulty, outcome), not from uniform luck.
- Fantasy presentation, factual state — also for rewards.

### A2 — Honesty over victory

- Successful work builds the world; failed work creates stories
  (encounters, scars, unconfirmed manuscripts) — never penalties, and never
  fabricated success.
- Player-confirmed outcomes must remain visually distinguishable from
  system-verified outcomes forever.
- Real work is irregular; the world values honesty, not winning.

### A3 — Display, not power

- Currency and shop items serve display, collection, and care
  (decorations, pet supplies, building accessories).
- No purchasable advantage, no purchasable verification, no stat inflation
  from spending. Coins end at display, never at efficiency.

### A4 — Ritual, not dailies

- Retention comes from recognizing real recurring work patterns, never from
  forced login pressure, streak guilt, or mandatory daily tasks.
