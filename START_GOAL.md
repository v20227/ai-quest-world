# START GOAL — AI Quest World v0.1

## Objective

Implement the first local playable vertical slice of AI Quest World without expanding product scope.

The first version must prove one thing:

> A meaningful real Agent Harness run can automatically become a Quest, produce evidence-based growth, leave real artifacts in the game world, and visibly change a persistent pixel world.

## Mandatory reading

Before coding, read:

- `AGENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/UARP_SPEC.md`
- `docs/GAME_RULES.md`
- `docs/PRESENTATION_SPEC.md`
- `docs/V0.1_SCOPE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/TEST_AND_ACCEPTANCE.md`

## First implementation sequence

Do not start by polishing the city scene.

Implement in dependency order:

1. UARP v0.1 types, event envelope, capabilities, validation.
2. Adapter Core contracts.
3. A contract-faithful mock/simulated adapter for deterministic integration tests.
4. Local Observer pipeline: dedupe, aggregation, redaction, event ingestion.
5. SQLite repositories/event store.
6. Semantic Engine v0.1 rules and work-phase state machine.
7. Quest lifecycle and Run-to-Quest association.
8. Outcome/Evidence classification.
9. Skill XP, Domain Progress, anti-abuse caps/decay.
10. World State and building unlock/activity/milestone rules.
11. Web World Scene and the five required presentation primitives.
12. Return/unlock presentation.
13. First real Harness Adapter once the adapter contract and end-to-end simulated path are green.
14. End-to-end acceptance run.

## Required vertical slice

At minimum, demonstrate:

```text
run.started
↓
Candidate Quest created
↓
resource/tool activity arrives
↓
Semantic phase changes
↓
validation.completed
↓
artifact.created
↓
run.completed
↓
Outcome = Verified/Supported/Unverified according to evidence
↓
Skill + Domain progress
↓
Artifact represented as Loot
↓
Workshop or Library reacts/unlocks
↓
SQLite persists state
↓
Restart application
↓
World state remains correct
```

## Required UI in v0.1

- World Scene
- Mini HUD
- Quest Panel
- Building Panel
- Artifact Card
- Return Overlay

World objects in first slice:

- Small Camp
- AI Gate
- Quest Guild
- Workshop
- Library

Hall is optional for the first slice and must not block completion.

## Do not implement now

No free movement, Gold, shop, pets, NPC AI, social, cloud account, leaderboard, Game→Harness control, external-AI dependency, dynamic per-quest art, or complex combat.

## Stop condition

Do not declare v0.1 complete because screens exist. Complete only when the end-to-end acceptance criteria in `docs/TEST_AND_ACCEPTANCE.md` pass.
