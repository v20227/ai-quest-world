# PHASE 1 TASK — Protocol & Adapter Foundation

## Goal

Build the smallest factual runtime foundation without touching gameplay UI.

Phase 1 is complete when a deterministic simulated harness can emit a realistic multi-step run through the Adapter/Observer boundary as valid, deduplicated UARP v0.1 events.

## In scope

### UARP package

Create protocol/runtime validation for:

- `RuntimeEvent`
- `HarnessCapabilities`
- `EvidenceRef`
- canonical event type union
- event-specific attribute types/schemas
- version checking

Required event types for the first fixture:

- `run.started`
- `agent.started` (optional child run fixture)
- `resource.activity`
- `resource.changed`
- `validation.completed`
- `artifact.created`
- `agent.completed`
- `run.completed`

### Adapter Core

Create minimal contracts for:

```ts
interface HarnessAdapter {
  id: string;
  detect(): Promise<boolean>;
  getCapabilities(): Promise<HarnessCapabilities>;
  start(observer: RuntimeObserver): Promise<void>;
  stop(): Promise<void>;
}

interface RuntimeObserver {
  emit(event: RuntimeEvent): Promise<void> | void;
}
```

Adjust exact async/signature details if the repository baseline requires it, but preserve the boundary.

### Simulated adapter

Implement a deterministic simulated adapter/fixture representing:

```text
run.started: Fix Authentication
resource.activity: read/search burst
resource.changed: code modification
validation.completed: failed 13/16
resource.changed: recovery modification
validation.completed: succeeded 16/16
artifact.created: auth-refactor.patch
run.completed
```

Optional extension:

- a child agent/run attached to the root run

### Observer minimum

Implement:

- event ingestion
- event ID dedupe
- simple local buffering
- validation of inbound UARP
- an aggregation utility test for high-volume resource activity
- privacy/redaction hook interfaces

Do not build the full Semantic Engine in this phase.

## Tests required

- valid UARP fixture parses
- invalid/missing `event_id` fails
- invalid/missing `run_id` fails
- unsupported UARP version fails clearly
- duplicate event ID is emitted downstream at most once
- simulated adapter start/stop is safe
- emitted event order/context is coherent
- parent/child run IDs survive the boundary
- high-value validation/artifact event is not accidentally collapsed

## Out of scope

- XP
- Quest Game State
- Workshop/Library logic
- Web UI
- SQLite world schema beyond any tiny event-store spike needed for testing
- external AI
- real harness integration

## Deliverable

A testable foundation proving:

```text
Simulated Harness
→ Adapter Core
→ Observer
→ valid UARP stream
```

Once this is green, proceed to persistence and Semantic Engine according to `IMPLEMENTATION_PLAN.md`.
