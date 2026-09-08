# ARCHITECTURE — AI Quest World v0.1

## 1. Architecture goals

The architecture must preserve four separations:

1. **Harness facts** are separate from product-specific APIs.
2. **Work semantics** are separate from raw telemetry.
3. **Game decisions** are separate from semantic interpretation.
4. **Presentation** is separate from authoritative world state.

These boundaries are more important than framework choice.

## 2. Reference architecture

```text
AI App / IDE / CLI
        ↓
   Agent Harness
        ↓
Harness-specific Collector / Adapter
        ↓
Local Observer Pipeline
        ↓
UARP — Universal Agent Runtime Protocol
        ↓
Semantic Engine
        ↓
Headless Game Core
        ↓
Persistent World State
        ↓
Repositories / SQLite
        ↓
Web Pixel World Renderer
```

Future optional direction:

```text
World / Player intent
        ↓
Universal Control Protocol
        ↓
Harness-specific control adapter
        ↓
Agent workflow
```

This reverse path is explicitly out of v0.1.

## 3. Component responsibilities

### Harness Adapter

Knows the concrete harness and converts its native event/log/hook/stream representation into UARP facts.

Allowed responsibilities:

- product-specific discovery
- connection/listener lifecycle
- capability declaration
- raw payload parsing
- mapping native IDs into stable run/agent IDs
- emitting UARP-compatible facts

Forbidden responsibilities:

- awarding XP
- classifying Boss/Dungeon
- mutating World State
- implementing Web UI

### Local Observer

Owns local ingestion quality and privacy boundaries.

Responsibilities:

- deduplication by event identity
- ordering metadata where possible
- buffering/retry
- high-volume event aggregation
- redaction
- metadata-first filtering
- local event persistence/append path
- forwarding normalized UARP events

The Observer should not need to understand game mechanics.

### UARP

A versioned factual runtime protocol.

UARP answers:

- what observable runtime fact occurred?
- when?
- in what run/agent/project context?
- with what factual status/measurements?
- what evidence reference exists?
- what privacy/content policy applies?

It does not answer what the fact means as a game event.

### Semantic Engine

Turns normalized facts/aggregates into meaningful work semantics.

Examples:

- repeated project reads/searches → exploration activity
- first meaningful modification phase → implementation activity
- validation failure after implementation → solution_not_verified
- subsequent changes after failure → recovery activity
- artifact plus completion → delivery activity

v0.1 uses deterministic rules, state machines, and heuristics. Optional AI interpretation is a later enhancement and may never be required by Game Core.

### Headless Game Core

Sole authority for game state.

Owns:

- Quest lifecycle
- Run-to-Quest association policy
- domain/activity scoring
- outcome confidence
- reward rules
- anti-abuse rules
- skill/domain growth
- artifact-to-loot representation
- building/world progress
- unlocks/milestones
- world-change budget / presentation priority data

Game Core must have no dependency on a concrete harness or UI framework.

### Repositories / SQLite

Persist local durable state.

Recommended repository abstractions:

- `EventRepository`
- `QuestRepository`
- `WorldRepository`
- `ArtifactRepository`
- `SettingsRepository`

Game Core should depend on repository contracts, not SQLite APIs directly.

### Web Pixel World Renderer

Renders the authoritative world and contextual UI.

It may animate based on state transitions/events but may not award progress or mutate outcomes because an animation finished.

## 4. Process model

v0.1 may be implemented as one local application/process or multiple local services. The logical boundary is more important than physical process separation.

A minimal implementation can be:

```text
Local Node/TS runtime
  - adapters
  - observer
  - semantic engine
  - game core
  - SQLite
  - local API/event channel

Web UI
  - world scene
  - HUD/panels/overlays
```

If the repository is empty, a TypeScript monorepo is a reasonable default because it allows shared protocol/types across local runtime and Web UI. Do not force a new stack if an existing repository already has a coherent baseline.

## 5. Data-flow example

Native harness event:

```text
process/tool reports `npm test` completed with 3 failing tests
```

Adapter:

```text
maps native payload into `validation.completed`
```

UARP:

```json
{
  "type": "validation.completed",
  "status": "failed",
  "attributes": {
    "kind": "test",
    "passed": 13,
    "failed": 3,
    "total": 16
  }
}
```

Semantic Engine:

```text
solution_not_verified
validation_failure
```

Game Core:

```text
Quest → Validating/Recovering
possible Encounter escalation
Debugging activity credit subject to caps
```

Renderer:

```text
Quest panel shows 13/16 validation evidence.
If the Game Core labels a major blocker encounter, present a restrained boss/encounter visual.
```

## 6. World model

World data exists independently from rendering.

Suggested conceptual entities:

```text
World
PlayerProfile
Building
Quest
Expedition
RunRef
SemanticEvent
GameEvent
ArtifactRef
SkillProfile
DomainProgress
Milestone
```

Example building state:

```ts
interface BuildingState {
  id: string;
  type: 'gate' | 'guild' | 'workshop' | 'library' | 'hall';
  unlocked: boolean;
  tier: number;
  permanentProgress: number;
  activity: 'idle' | 'active' | 'busy' | 'milestone';
  props: string[];
  lastActiveAt?: string;
}
```

The Renderer may ignore fields it does not yet visualize. This allows the data model to remain richer than v0.1 art.

## 7. Event authority and idempotency

Every important inbound UARP event needs stable identity.

At minimum:

- `event_id`
- `timestamp`
- `run_id`
- `type`
- protocol version

Processing must be idempotent. A replayed `validation.completed` or `run.completed` must not create duplicate Quest completion, duplicate XP, duplicate milestone, or duplicate loot.

Recommended flow:

```text
receive event
↓
check event_id already processed?
↓ yes → ignore/no-op
↓ no
persist normalized event
↓
semantic processing
↓
game processing
↓
transactionally persist resulting state/events
```

## 8. Replay/debug model

Where practical, keep enough normalized/semantic history to replay or inspect why a Quest/world state was reached.

Do not require full source content for replay. Prefer factual event/evidence metadata.

This improves:

- deterministic testing
- bug diagnosis
- migration safety
- reward auditability

## 9. Privacy model

Default flow:

```text
Harness
↓
Local Adapter/Observer
↓
redact / aggregate / minimize
↓
store factual metadata locally
```

Content inclusion is opt-in/capability-specific, not assumed.

Never treat secret-bearing streams as safe by default. Explicitly exclude credentials/environment/secrets where collectors can identify them.

## 10. Dependency rules

Allowed direction:

```text
adapter → uarp
observer → uarp
semantic → uarp/domain semantic types
game → semantic types + repository contracts
storage → repository contracts
authoritative app service → game/storage
renderer → read models / UI API
```

Forbidden examples:

```text
game → codex adapter
game → React
game → LLM client
uarp → Workshop/Boss types
semantic → SQLite world mutation
renderer → reward calculation
```

## 11. Capability model

Every adapter declares what it can observe.

Examples:

- run lifecycle
- subagents
- tools
- resource events
- validation
- artifacts
- usage/tokens
- errors
- outcome evidence

Capabilities control depth of interpretation; absence of a capability must degrade gracefully rather than make the product unusable.

Compatibility Level 0 should need only run lifecycle basics.

## 12. Local-first storage and future cloud

v0.1 uses local persistence.

Do not couple Game Core to “local forever.” Repository contracts should allow a future Sync/Cloud implementation without changing game rules.

Cloud/social/sync are not v0.1 acceptance requirements.
