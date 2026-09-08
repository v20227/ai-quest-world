# Development Pack Manifest

## Root

- `AGENTS.md` — hard project rules and scope guard
- `START_GOAL.md` — overall v0.1 objective and implementation sequence
- `CODEX_START_PROMPT.md` — first prompt to paste into Codex
- `README.md` — project overview and usage

## Product / engineering docs

- `docs/PRODUCT_SPEC.md` — product definition, boundaries, first-session experience
- `docs/ARCHITECTURE.md` — subsystem boundaries and dependency rules
- `docs/UARP_SPEC.md` — Universal Agent Runtime Protocol v0.1
- `docs/GAME_RULES.md` — Quest, Expedition, outcomes, rewards, anti-abuse, world progression
- `docs/PRESENTATION_SPEC.md` — World Scene, HUD, panels, Return presentation, asset strategy
- `docs/V0.1_SCOPE.md` — must-have, should-have, explicit non-goals
- `docs/IMPLEMENTATION_PLAN.md` — milestone order and exit criteria
- `docs/PHASE_1_TASK.md` — first executable engineering task
- `docs/TEST_AND_ACCEPTANCE.md` — required tests and end-to-end acceptance scenarios

## Scaffold directories

- `packages/uarp/`
- `packages/adapter-core/`
- `adapters/first-harness/`
- `observer/`
- `core/semantic/`
- `core/game/`
- `storage/sqlite/`
- `apps/world-web/`

These directories are intentionally empty except for `.gitkeep`; Codex should implement them according to the docs rather than receiving a premature framework scaffold.
