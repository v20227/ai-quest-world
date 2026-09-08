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
  codex-cli/

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

To observe one local Codex CLI run and write its normalized facts into the same persistent world, use the read-only adapter command:

```sh
AI_QUEST_WORLD_CODEX_EXECUTABLE=/path/to/codex \
AI_QUEST_WORLD_CODEX_CWD=/path/to/project \
npm run observe:codex -- "describe the task to observe"
```

This entry launches a new read-only Codex CLI task; it does not observe existing desktop conversations. It stores Quest and World State locally. Reasoning, agent messages and full commands are not stored. Unknown validation commands remain ordinary tool operations; a successful process exit is not proof that a test suite ran.

File paths and artifact collection are disabled by default. Set `AI_QUEST_WORLD_ARTIFACT_PATHS=1` only for a project whose output paths you permit to be saved locally. Then successfully observed file changes may become artifact references after the adapter confirms a regular file inside the project still exists at run end. Hidden paths, common credential files and paths outside the project are excluded. File contents are not archived. Run `npm run dev` separately to view the world.

### Observe your own CLI execution

Use the passive collector when Codex is doing real work. Start the world in one terminal, then pipe a single public JSONL execution into the collector from another terminal. Both commands run from this project's root:

```sh
AI_QUEST_WORLD_DB=/path/to/world.sqlite \
AI_QUEST_WORLD_ARTIFACT_ROOT=/path/to/working-project \
npm run dev
```

```sh
set -o pipefail
codex exec --json --ephemeral --sandbox workspace-write \
  -C /path/to/working-project "your real task" | \
AI_QUEST_WORLD_DB=/path/to/world.sqlite \
AI_QUEST_WORLD_CODEX_CWD=/path/to/working-project \
AI_QUEST_WORLD_CODEX_RUN_ID=work-20260908-001 \
AI_QUEST_WORLD_CODEX_TITLE="Your task title" \
AI_QUEST_WORLD_ARTIFACT_PATHS=1 \
node apps/world-web/collect-codex.mjs
```

The collector never launches or sends commands to Codex. Choose Codex permissions for your task yourself. The world refreshes automatically and presents each new return once in the same browser profile. This entry does not attach to existing desktop conversations or infer hidden subagent relationships.

Use a unique `AI_QUEST_WORLD_CODEX_RUN_ID` for each execution and reuse it only when replaying the same execution. For an explicit continuation of the same goal, additionally set `AI_QUEST_WORLD_RESUMED_FROM_RUN_ID` to the preceding execution ID; child/recovery activity shares one bounded Quest settlement. Do not concatenate different executions into one collector input. A truncated stream without a completion marker is not successful work.

Artifact collection and viewing are separate opt-ins. `AI_QUEST_WORLD_ARTIFACT_ROOT` allows the Web server to open registered files in that project only. In the Quest or Workshop/Library panel, select an artifact and choose **View original file**. Text/code appears as escaped plain text in the card; other file types offer a download. The current file must still exist, be a permitted regular file and be at most 1 MiB. No content is archived; paths alone are not a permanent file backup. A factual artifact may be visible without being rewarded.

Difficulty is a coarse 1–5 estimate from meaningful phase and domain breadth. Unsupported evidence stays Unknown, and the observed value is recorded at settlement. It is not an XP multiplier. Validation remains conservative: Node test summaries with nonzero executed tests are recognized; unsupported runner output can remain Unknown even when its process exits successfully.

## Before implementation

Read `AGENTS.md`, then `START_GOAL.md`.

The docs are intentionally split: `AGENTS.md` contains hard rules; detailed product/game/architecture decisions live under `docs/`.
