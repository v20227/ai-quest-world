# ADAPTER GUIDE — Connecting any AI software

AI Quest World is harness-agnostic by design. This guide explains the rules
and the recipe for onboarding **any AI agent software** — Codex, Claude Code,
Cursor, Gemini CLI, Windsurf, a home-grown agent, anything that does
observable work.

## 1. The hard rules (from AGENTS.md, non-negotiable)

- Harness-specific code may exist **only** inside an adapter/collector boundary
  (`adapters/<name>/` + optionally an observer entrypoint).
- Game Core, Semantic Engine, storage, and renderer must **never import or
  branch on a harness/product name**. Adding a harness must require zero core
  changes.
- The boundary between a harness and the world is **UARP**
  (`docs/UARP_SPEC.md`): vendor-neutral runtime facts. No XP, no game
  semantics, no harness branding.
- Collection is read-only and metadata-first by default.
- Event processing is idempotent; stable `event_id` per native event.

## 2. Minimum bar: Compatibility Level 0

Any harness can participate with just three things (`UARP_SPEC.md` §8):

| Level 0 requirement | Source |
| --- | --- |
| `run.started` event with a `run_id` | any session start signal |
| one terminal event (`run.completed` / `failed` / `cancelled`) | any session end signal |
| `timestamp` on each event | wall clock is fine |

Level 0 yields quest lifecycle + live expedition presence. Everything richer
is progressive, declared via the capability handshake — never required.

## 3. Capability handshake

Each adapter declares what it can observe (`packages/uarp/capabilities.mjs`,
`validateHarnessCapabilities`). The core adapts its interpretation to the
declared capabilities; missing capabilities degrade gracefully (e.g. no
validation events → outcome basis falls back to artifact, then UNVERIFIED —
see `docs/REWARD_RULES_SPEC.md` §3.1).

```js
// inside adapters/<name>/
import { createCapabilities } from "../../packages/uarp/capabilities.mjs";
export const capabilities = createCapabilities("my-harness", {
  observe: { run_lifecycle: true, tool_calls: true, resource_changes: true,
             subagents: false, validation: false, artifacts: true, /* ... */ },
  content: { task_title: true, artifact_paths: true, /* ... */ }
});
```

## 4. Mapping guide: common AI-tool signals → UARP

Most AI software exposes a subset of these signal shapes. Map what exists,
skip what does not:

| Native signal (typical) | UARP event |
| --- | --- |
| session/turn start, prompt received | `run.started` (+ `title` if available) |
| session end / exit / abort | `run.completed` / `run.failed` / `run.cancelled` |
| subagent / task dispatch | child `run.started` with `parent_run_id` (+ `agent_id`) |
| shell/command execution | `tool.started` / `tool.completed` (`tool_kind: "shell"`) |
| web search / docs lookup | `tool.completed` (`tool_kind: "search"`, or `resource.activity`) |
| file reads / codebase search | `resource.activity` (aggregate reads/searches) |
| file create / edit / patch | `resource.changed` (`change_type`, path metadata only) |
| test/build/lint run | `validation.started` / `validation.completed` (+ counts if available) |
| generated file / report / image | `artifact.created` (`kind`, `durable`, `uri_or_path`) |
| errors / recovery | `error.observed` / `error.resolved` |
| token usage reports | `usage.reported` (optional, never an XP input) |

Privacy defaults: omit tool arguments, message bodies, reasoning, file
contents; `content_included: false`.

## 5. Data-source archetypes (how to physically obtain the stream)

1. **CLI JSONL stream** — harness prints structured events (Codex
   `exec --json`). Easiest; the existing collector consumes it live.
2. **Local session files** — harness persists transcripts/sessions on disk
   (Codex Desktop rollouts, Claude Code project transcripts, Gemini CLI
   history). Observer = read-only tail/glob + offset tracking. See
   `docs/OBSERVER_FEASIBILITY.md` for the verified Codex Desktop example.
3. **SDK / hook / plugin** — harness offers lifecycle hooks or an extension
   API. Wrap them; emit UARP from the hook callbacks.
4. **Manual/file-drop** — export a log and feed the file to the collector.
   Lowest fidelity, still Level 0-able.

## 6. Adapter checklist

- [ ] `adapter_id` unique, stable; version it independently of UARP.
- [ ] Deterministic `event_id` (native ID, or `hash(adapter_id, session_id, ordinal)`).
- [ ] `run_id` mapping is stable across replays; child runs carry `parent_run_id`.
- [ ] Resumption/fork signals mapped to `resumed_from_run_id` when available.
- [ ] Capabilities declared truthfully; do not claim `validation: true`
      without parseable counts.
- [ ] Read-only toward the harness; no writes into its storage.
- [ ] Metadata-first; content only behind explicit opt-in flags.
- [ ] Works with the harness fully offline (no external API requirement).

## 7. Current adapters

| Adapter | Status | Source archetype |
| --- | --- | --- |
| `adapters/first-harness` (simulated) | reference implementation, test suite anchor | synthetic stream |
| `adapters/codex-cli` | implemented (passive collector + observe entry) | CLI JSONL stream |
| `adapters/codex-desktop` | designed, feasibility verified (`docs/OBSERVER_FEASIBILITY.md`) | local session files + state DB |

New harnesses follow this pattern: copy the codex-cli adapter shape, swap the
source reader, map the event vocabulary per §4, keep the core untouched.
