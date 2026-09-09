# OBSERVER FEASIBILITY — Codex Desktop passive observation

Status: recon completed 2026-09-09 (read-only inspection on a live machine).
Conclusion: **feasible with file-tail only — no IPC hooking, no app patching.**

## What was verified on disk

### 1. Desktop sessions write the same rollout JSONL as CLI

`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl`

Verified from a live `Codex Desktop` session (`originator: "Codex Desktop"`,
`source: "vscode"`, `thread_source: "user"`):

- `session_meta` payload carries: `session_id`, **`forked_from_id`** +
  `forked_from_ordinal_exclusive` (built-in lineage), `cwd`, timestamp,
  `cli_version`, model provider.
- Payload item types observed in one desktop session:
  `CommandExecution` ×220, `custom_tool_call` ×236 (+ `_output` ×237),
  `FileChange` ×33, `Reasoning`, `AgentMessage`, `Text`, `token_count`,
  `token_usage_record`, `item_completed`, `event_msg`, `response_item`.

This is the same JSONL vocabulary the existing passive collector
(`apps/world-web/collect-codex.mjs`) already consumes from
`codex exec --json`. The adapter's event parsing is reusable almost as-is.

### 2. Codex maintains the subagent graph for us

`~/.codex/state_5.sqlite` (WAL mode, opens fine with `sqlite3 -readonly`):

```sql
CREATE TABLE thread_spawn_edges (
    parent_thread_id TEXT NOT NULL,
    child_thread_id  TEXT NOT NULL PRIMARY KEY,
    status           TEXT NOT NULL
);
```

Live rows exist. This directly answers the "多会话协作 / 子会话派发与返回"
observation requirement: parent/child thread relations are persisted by Codex
itself — the observer does not need to infer hidden subagent relationships.

### 3. Session index gives titles without reading content

`~/.codex/session_index.jsonl`:
`{"id": "...", "thread_name": "...", "updated_at": "..."}` — covers desktop
and CLI threads. Enough for Candidate Quest titles with zero content access.

Other local stores exist (`thread_history_1.sqlite` with `thread_items` /
`thread_turns`, `logs_2.sqlite`, `queue_1.sqlite`) — useful later, not needed
for the first slice.

## Proposed design: `adapters/codex-desktop/` passive observer

```text
fs.watch(~/.codex/sessions/**)  +  periodic session_index/state_5 read (read-only)
  ↓ incremental tail (byte offset per file, resumable)
filter to metadata vocabulary: session_meta, CommandExecution, custom_tool_call,
FileChange, token_count, terminal events
  ↓ (skip Reasoning/AgentMessage/Text payloads entirely)
UARP runtime events (existing adapter-core contracts)
  ↓ run lineage: session_id as run_id, forked_from_id / thread_spawn_edges
    as parent_run_id edges
existing Semantic → Quest → World pipeline (unchanged)
```

Key properties:

- Read-only: never writes into `~/.codex`; SQLite opened with `mode=ro`.
- Metadata-first: reasoning and message content are never persisted (matches
  the existing collector's privacy posture and `REWARD_RULES_SPEC.md`).
- Idempotent: per-file byte offsets + stable `event_id` derivation from
  `session_id + ordinal` (rollout lines already carry `ordinal`).
- Live process states (P-1 in the reward spec) derive from the tail stream:
  FileChange → crafting, CommandExecution → verifying, fork/spawn →
  collaboration companion. "Waiting for input" has no explicit event; infer
  conservatively as an inactivity timeout, never as a hard fact.

## Risks / open points

1. Rollout format is undocumented and may change between CLI versions
   (`cli_version` is in `session_meta` — pin parsing per version).
2. `forked_from_id` vs `thread_spawn_edges` overlap: reconcile once against
   real sessions; treat spawn edges as authoritative for subagents, forks as
   continuation/resume edges (`RESUMED_FROM_RUN_ID` semantics).
3. Multiple concurrent desktop + CLI sessions across cwds: quest association
   must use `cwd` (+ workspace identity) — matches the existing
   `AI_QUEST_WORLD_CODEX_CWD` discipline.
4. Only local-machine, single-user: acceptable per local-first product scope.

## Suggested first slice

1. Tail one directory day (glob `sessions/YYYY/MM/DD/*.jsonl`), replay a full
   past desktop session into UARP → existing pipeline; assert quest
   settlement against a known real session.
2. Then add fs.watch + offsets for live updates.
