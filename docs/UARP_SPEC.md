# UARP SPEC — Universal Agent Runtime Protocol v0.1

## 1. Purpose

UARP is the stable factual boundary between harness-specific runtime integrations and the rest of AI Quest World.

It normalizes observable Agent Harness activity into a vendor-neutral event format.

UARP must answer **what happened**, not **what it means in the game**.

## 2. Non-goals

UARP does not define:

- Quest
- XP/rewards
- Dungeon/Boss/Encounter
- Workshop/Library progress
- visual effects
- player progression
- AI-generated narration

Those belong to later layers.

## 3. Core envelope

Recommended TypeScript shape:

```ts
export interface RuntimeEvent<TAttributes = Record<string, unknown>> {
  uarp_version: '0.1';
  event_id: string;
  timestamp: string; // ISO-8601 UTC recommended

  source: {
    adapter_id: string;
    adapter_version: string;
    harness_family?: string;
    harness_version?: string;
  };

  context: {
    workspace_id?: string;
    project_id?: string;
    run_id: string;
    parent_run_id?: string;
    agent_id?: string;
    parent_agent_id?: string;
  };

  type: RuntimeEventType;
  status?: RuntimeStatus;
  attributes: TAttributes;
  evidence_refs?: EvidenceRef[];

  privacy: {
    content_included: boolean;
    redaction_level: 'none' | 'standard' | 'strict';
    fields_redacted?: string[];
  };
}
```

## 4. Event identity

`event_id` must be stable enough to make processing idempotent.

Preferred sources:

1. native harness event ID if stable;
2. adapter-generated deterministic ID from native identifiers;
3. generated UUID persisted before retry.

Do not generate a new event ID every time the same native event is replayed.

## 5. Context identity

### `run_id`

Required for all v0.1 events.

A run is a technical runtime execution/session, not a game Quest.

### `parent_run_id`

Use when the harness exposes child/subagent/retry hierarchy.

### `agent_id`

Use when the runtime exposes an agent/subagent identity.

Multi-agent support is part of the base protocol, even when an adapter cannot provide it.

## 6. Runtime status vocabulary

Recommended generic statuses:

```text
started
running
succeeded
failed
cancelled
completed
unknown
```

Event-specific schemas may narrow these values.

## 7. Capability handshake

Each adapter exposes a capability descriptor before/while observation begins.

Suggested shape:

```ts
export interface HarnessCapabilities {
  uarp_version: '0.1';
  adapter_id: string;

  observe: {
    run_lifecycle: boolean;
    subagents: boolean;
    tool_calls: boolean;
    resource_reads: boolean;
    resource_changes: boolean;
    validation: boolean;
    artifacts: boolean;
    errors: boolean;
    usage_tokens: boolean;
    usage_cost: boolean;
    outcome_evidence: boolean;
  };

  content: {
    task_title: boolean;
    task_text: boolean;
    tool_arguments: boolean;
    resource_paths: boolean;
    artifact_paths: boolean;
    output_summary: boolean;
  };
}
```

Capabilities indicate what is observable, not what the Game Core must require.

## 8. Compatibility level

### Level 0 — lifecycle minimum

A harness can participate with:

- `run.started`
- one terminal run event
- `run_id`
- `timestamp`

This supports a basic Expedition lifecycle but limited semantic depth.

### Higher depth

Additional capabilities unlock richer interpretation:

- tool/resource events improve work-phase inference
- validation improves outcome confidence
- artifact events support Loot
- subagent hierarchy improves multi-agent expedition representation
- usage supports optional efficiency analytics

Do not reject a harness solely because it lacks token usage or detailed resources.

## 9. Event taxonomy

v0.1 canonical event types:

### Run lifecycle

- `run.started`
- `run.completed`
- `run.failed`
- `run.cancelled`

### Agent lifecycle

- `agent.started`
- `agent.completed`
- `agent.failed`

### Tool activity

- `tool.started`
- `tool.completed`
- `tool.failed`

### Resource activity

- `resource.activity`
- `resource.changed`

### Validation

- `validation.started`
- `validation.completed`

### Artifact

- `artifact.created`
- `artifact.updated`

### Error / blocker facts

- `error.observed`
- `error.resolved`

### Usage

- `usage.reported`

### Optional factual outcome/evidence reports

- `outcome.reported`

`outcome.reported` is a factual harness/native statement and must not be treated as Verified merely because it says success. Game Core outcome confidence uses independent evidence policy.

## 10. Run lifecycle schemas

### `run.started`

Suggested attributes:

```ts
interface RunStartedAttributes {
  title?: string;
  task_text_available?: boolean;
  resumed_from_run_id?: string;
  mode?: string;
}
```

Do not require task content.

### `run.completed` / `run.failed` / `run.cancelled`

Suggested attributes:

```ts
interface RunTerminalAttributes {
  native_outcome?: string;
  duration_ms?: number;
  output_summary_available?: boolean;
}
```

Terminal run status is not enough by itself to imply Verified Quest completion.

## 11. Agent lifecycle schemas

Suggested attributes:

```ts
interface AgentLifecycleAttributes {
  role?: string;
  name?: string;
  purpose?: string;
}
```

Keep role/name optional. Do not force vendor-specific agent concepts into the core protocol.

## 12. Tool schemas

Suggested attributes:

```ts
interface ToolAttributes {
  tool_kind?: 'shell' | 'search' | 'browser' | 'editor' | 'filesystem' | 'database' | 'api' | 'other';
  tool_name?: string;
  duration_ms?: number;
  exit_code?: number;
  success?: boolean;
  category_hint?: 'validation' | 'build' | 'search' | 'write' | 'read' | 'other';
}
```

Tool arguments/content should be omitted by default unless explicitly enabled and redacted.

## 13. Resource schemas

### `resource.activity`

This is the preferred aggregate for high-volume read/search activity.

Suggested attributes:

```ts
interface ResourceActivityAttributes {
  resource_kind?: 'file' | 'web' | 'database' | 'memory' | 'other';
  read_count?: number;
  search_count?: number;
  write_count?: number;
  resource_count?: number;
  duration_ms?: number;
  scope?: 'project' | 'workspace' | 'external' | 'mixed' | 'unknown';
}
```

This remains a factual aggregate; it does not say “exploration completed.”

### `resource.changed`

Suggested attributes:

```ts
interface ResourceChangedAttributes {
  resource_kind: 'file' | 'database' | 'remote' | 'other';
  change_type: 'created' | 'modified' | 'deleted' | 'renamed' | 'unknown';
  path_or_name?: string;
  extension?: string;
  size_delta?: number;
}
```

Path/name exposure follows privacy settings.

## 14. Validation schemas

Validation is high-value and should generally not be aggregated away.

Suggested attributes:

```ts
interface ValidationAttributes {
  kind: 'test' | 'build' | 'lint' | 'typecheck' | 'review' | 'deploy' | 'acceptance' | 'other';
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  blockers?: number;
  duration_ms?: number;
  target?: string;
}
```

Examples:

```json
{
  "kind": "test",
  "passed": 13,
  "failed": 3,
  "total": 16
}
```

```json
{
  "kind": "review",
  "blockers": 2
}
```

Do not invent `total` or percentages when the harness does not provide them.

## 15. Artifact schemas

Suggested attributes:

```ts
interface ArtifactAttributes {
  artifact_id: string;
  kind: 'code' | 'document' | 'research' | 'plan' | 'creative' | 'validation' | 'automation' | 'other';
  name?: string;
  uri_or_path?: string;
  mime_type?: string;
  durable?: boolean;
  relation?: 'created' | 'updated' | 'submitted' | 'committed' | 'published' | 'other';
}
```

An artifact event is factual. “Loot rarity” does not belong here.

## 16. Error schemas

Suggested attributes:

```ts
interface ErrorAttributes {
  error_id?: string;
  kind?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  blocking?: boolean;
  source_kind?: 'tool' | 'validation' | 'runtime' | 'resource' | 'other';
}
```

Avoid storing raw stack traces by default in the universal event if they can contain sensitive content. Keep references/diagnostic storage separate when needed.

## 17. Usage schemas

Suggested attributes:

```ts
interface UsageAttributes {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  tool_calls?: number;
  model_calls?: number;
  duration_ms?: number;
  estimated_cost?: number;
  currency?: string;
}
```

Usage is telemetry. Game rules must not directly award XP from usage volume.

## 18. Evidence references

Evidence references allow the game/outcome engine to know that real proof exists without embedding full content into every event.

Suggested shape:

```ts
export interface EvidenceRef {
  id: string;
  kind: 'validation' | 'artifact' | 'commit' | 'review' | 'deployment' | 'result' | 'other';
  uri?: string;
  local_ref?: string;
  content_available?: boolean;
}
```

Examples:

```text
test result reference
artifact path/reference
commit ID reference
review result reference
deployment result reference
```

Evidence references should be resolvable only through allowed local permissions/capabilities.

## 19. Privacy rules

Default UARP emission should prefer metadata.

Do not require:

- complete prompt text
- conversation transcript
- hidden reasoning
- full file contents
- full stdout/stderr
- secrets/keys/cookies/tokens
- environment-variable dumps

If content is explicitly enabled, the event must mark `content_included: true` and apply configured redaction.

## 20. High-volume aggregation

The Adapter/Observer may aggregate high-volume facts before semantic interpretation.

Good candidates:

- repeated resource reads
- repeated search calls
- token deltas
- progress ticks
- polling
- repeated stdout chunks

Do not aggregate away high-value transitions such as:

- run terminal state
- validation result
- artifact creation
- important tool failure
- explicit error/blocker resolution when available

## 21. Ordering and timestamps

Events may arrive out of order in some harnesses.

v0.1 should preserve:

- source timestamp where available
- local observed timestamp if useful internally
- stable run association

Semantic/Game layers should tolerate reasonable reordering and avoid assuming perfect streams unless the adapter declares stronger guarantees.

## 22. Versioning

Every event includes `uarp_version`.

v0.1 breaking changes require an explicit protocol version bump or migration policy.

Adapter version is independent from UARP version.

## 23. Example event

```json
{
  "uarp_version": "0.1",
  "event_id": "evt_0184_validation_03",
  "timestamp": "2026-09-08T20:31:22Z",
  "source": {
    "adapter_id": "example-harness",
    "adapter_version": "0.1.0",
    "harness_family": "example"
  },
  "context": {
    "project_id": "proj_27",
    "run_id": "run_184",
    "agent_id": "agent_3"
  },
  "type": "validation.completed",
  "status": "failed",
  "attributes": {
    "kind": "test",
    "passed": 13,
    "failed": 3,
    "total": 16,
    "duration_ms": 12400
  },
  "evidence_refs": [
    {
      "id": "evidence_test_184_03",
      "kind": "validation",
      "local_ref": "validation://run_184/03",
      "content_available": true
    }
  ],
  "privacy": {
    "content_included": false,
    "redaction_level": "standard"
  }
}
```

Game Core may later interpret this as validation trouble/encounter state, but that meaning is intentionally absent from UARP.
