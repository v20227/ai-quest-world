# AI Quest World v0.1

AI Quest World is a local-first gamified observability layer for AI Agent harnesses.

The product watches **observable runtime work** from an Agent Harness, normalizes it into a universal factual protocol, interprets meaningful work phases, resolves progression through a deterministic game core, persists the result locally, and renders a persistent pixel world.

The user-facing promise is simple:

> I go use AI to do real work. When I come back, my world has grown a little because of what actually happened.

## v0.1 principles

- Local-first
- Read-only harness integration
- Web-first renderer
- World-first presentation
- Scene-based interaction
- No free movement
- No extra AI API required
- Metadata-first, content-optional
- Real outcome/evidence drives rewards
- Real artifacts become loot

## Core flow

```text
Agent Harness
    ↓
Local Observer / Collector
    ↓
Harness Adapter
    ↓
UARP (factual runtime events)
    ↓
Semantic Engine
    ↓
Headless Game Core
    ↓
Persistent World State
    ↓
SQLite
    ↓
Web Pixel World Renderer
```

## Repository layout

```text
AGENTS.md
START_GOAL.md
README.md

docs/
  PRODUCT_SPEC.md
  ARCHITECTURE.md
  UARP_SPEC.md
  GAME_RULES.md
  PRESENTATION_SPEC.md
  V0.1_SCOPE.md
  IMPLEMENTATION_PLAN.md
  TEST_AND_ACCEPTANCE.md

packages/
  uarp/
  adapter-core/

adapters/
  first-harness/

observer/
core/
  semantic/
  game/
storage/
  sqlite/
apps/
  world-web/
```

## Use with Codex

For a new project, unzip/copy this pack into the project root, initialize Git if needed, then open that root folder in Codex.

For an existing project, merge these files into the repository root rather than nesting the pack one level deeper. Preserve existing application code and let Codex inspect conflicts before changing architecture.

Then paste the contents of `CODEX_START_PROMPT.md` into Codex. Codex should implement `docs/PHASE_1_TASK.md` first and stop after the phase is green.

Do not paste the entire design discussion into every Codex turn; the repository documents are the source of truth.

## Local verification

The local runtime uses Node's built-in SQLite and test runner; no third-party dependency or external AI API is required. Use Node 22.13.0 or newer, then run:

```sh
npm test
```

The test command covers the Phase 1 protocol/adapter/observer suite, the Milestone 2 normalized event persistence suite, the deterministic Semantic Engine suite, the Quest lifecycle/outcome suite, the evidence-bounded progression/anti-abuse suite, the persistent World State suite, the Quest/progression read-model suite, and the Web presentation contract suite.

To preview the current world-first Web slice locally:

```sh
npm run dev
```

Then open `http://127.0.0.1:4173`. The root page reads the local SQLite-backed World State, Quest, and progression read models through `/api/world`; a fresh database correctly starts as an empty Small Camp. Add `?source=demo` when you need the deterministic evidence-rich fixture for visual checks. The API also accepts incremental Observer events through the existing local runtime boundary; no external AI API is needed.

The default database is `storage/sqlite/ai-quest-world.sqlite` and can be changed with `AI_QUEST_WORLD_DB=/path/to/world.sqlite npm run dev`.

## Before implementation

Read `AGENTS.md`, then `START_GOAL.md`.

The docs are intentionally split: `AGENTS.md` contains hard rules; detailed product/game/architecture decisions live under `docs/`.
