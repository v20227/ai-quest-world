# AI Quest World — AGENTS.md

## Mission

Build AI Quest World v0.1: a local-first gamified observability layer for AI Agent harnesses. Real harness runtime activity is normalized into factual events, interpreted into work semantics, resolved by a deterministic headless game core, persisted locally, and rendered as a scene-based pixel world.

The product does **not** replace the connected AI tool or harness. v0.1 is read-only and must work without any additional AI API.

## Read before coding

Read these documents before making architectural or gameplay changes:

1. `START_GOAL.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/UARP_SPEC.md`
5. `docs/GAME_RULES.md`
6. `docs/PRESENTATION_SPEC.md`
7. `docs/V0.1_SCOPE.md`
8. `docs/IMPLEMENTATION_PLAN.md`
9. `docs/TEST_AND_ACCEPTANCE.md`

If documents conflict, use this priority order:

`AGENTS.md` → `V0.1_SCOPE.md` → `ARCHITECTURE.md` → `UARP_SPEC.md` / `GAME_RULES.md` → presentation details.

## Non-negotiable architecture rules

- Harness-specific code may exist only in an adapter/collector boundary.
- Game Core must never import or branch on a specific harness/product name.
- UARP describes observable runtime facts only. It must not contain `xp`, `boss`, `dungeon`, `workshop`, `loot_reward`, or other game semantics.
- Semantic Engine interprets work meaning but must not mutate World State directly.
- Game Core is the sole authority for quest state, rewards, growth, milestones, and world changes.
- Renderer only presents existing Game/World State. Animation completion must never cause game outcomes.
- Core gameplay must remain deterministic and replayable from stored normalized/semantic events where practical.
- v0.1 must work offline after dependencies are installed and must not require an external model/API.
- v0.1 is read-only with respect to the connected harness. Do not add Game → Harness control.
- Run is not Quest. Child runs/retries/subagents do not automatically create independent completion rewards.
- Event processing must be idempotent. Duplicate event IDs must never grant duplicate rewards.
- Multi-agent parent/child relationships must be representable from v0.1 (`run_id`, `parent_run_id`, `agent_id`).
- Default collection is metadata-first and content-optional.
- Do not depend on hidden chain-of-thought or private model reasoning.
- Never directly convert token usage, tool-call count, file-read count, or agent count into XP.
- Do not create game incentives that reward wasteful or meaningless AI usage.
- Artifact-as-loot requires a real artifact/evidence reference; do not fabricate loot from nothing.

## Presentation rules

- World-first, not dashboard-first.
- The first screen is a persistent World Scene, not a KPI board.
- Panels explain the world; panels never replace the world.
- v0.1 has no free walking, collision, pathfinding, or open world.
- Use scene click/selection + contextual panels + short return/unlock overlays.
- Ordinary quest returns should emphasize at most 1–3 meaningful feedback items.
- Major visual changes are reserved for milestones; common changes use state, overlay, props, and VFX.

## v0.1 scope guard

Do not implement unless explicitly moved into scope:

- Gold/economy/shop
- pets/mounts
- equipment-stat systems
- NPC AI
- PvP/social/guilds/leaderboards
- cloud account/sync
- free movement/pathfinding/collision
- open-world map generation
- mandatory external LLM/API
- dynamic per-quest art generation
- Surface SDK
- Control SDK / Game → Harness control
- complex real-time combat

When uncertain, choose the smaller implementation that proves the core loop.

## Engineering behavior

- Inspect the existing repo before adding a new framework or duplicate subsystem.
- Prefer explicit types, small interfaces, and dependency inversion at subsystem boundaries.
- Keep raw-source payloads out of Game Core.
- Add tests with each subsystem, especially idempotency, state transitions, reward anti-abuse rules, and persistence/replay.
- Do not claim a milestone complete until its acceptance checks pass.
- Keep TODOs concrete and scoped; do not silently invent future product requirements.

## Definition of v0.1 success

A real or contract-faithful harness run can flow through:

`Harness → Adapter/Observer → UARP → Semantic Engine → Quest/Outcome → Skill & Domain Growth → Artifact Loot → Persistent World State → Web Pixel World`

and this works without an additional AI API, survives restart, and visibly changes the user's world after meaningful real work.
