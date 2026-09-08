# PRODUCT SPEC — AI Quest World v0.1

## 1. Product definition

AI Quest World is not a new AI Agent product and not a wrapper that places multiple AI products inside one UI.

It is a **local-first game layer that grows beside AI Agent harnesses**. It observes real runtime work, converts meaningful work into game progression, and preserves that progression in a persistent pixel world.

User-facing statement:

> I go use AI to do real work. When I return, my world has changed because of what actually happened.

Technical statement:

> A local-first gamified observability layer for AI Agent harnesses, where real runtime activity continuously shapes a persistent game world.

## 2. What the product observes

The stable integration target is the Agent Harness / Agent Runtime, not a specific vendor UI.

The system cares about observable facts such as:

- run lifecycle
- parent/child runs
- agent lifecycle
- tool execution
- resource access/change metadata
- validation/test/build/review results
- artifact production
- errors/blockers
- usage metadata
- outcome/evidence

A product may be an IDE, CLI, desktop app, browser app, or custom runtime. The core system should remain agnostic after adapter normalization.

## 3. Product boundary

### The product does

- observe real Agent Harness activity
- normalize runtime facts
- infer basic work semantics from observable evidence
- automatically create and evolve Candidate Quests
- classify work domains and phases
- evaluate outcome confidence using evidence
- grant game growth without rewarding waste
- preserve real artifacts as loot references
- change a persistent world state
- present that world through a Web pixel scene

### The product does not do in v0.1

- replace the AI Agent or Harness
- perform the user's original coding/research/design task itself
- require an additional LLM
- control the Harness
- read hidden chain-of-thought
- become a full telemetry/log analytics platform
- become a task-manager clone
- become a Dashboard with pixel decoration

## 4. Core product loop

```text
REAL WORK
  ↓
QUEST
  ↓
EXPEDITION
  ↓
OUTCOME
  ↓
GROWTH
  ↓
WORLD CHANGE
  ↓
RETURN
  ↓
MEMORY
```

The loop should work without the user manually creating a game task.

### Example

A user asks an Agent Harness to fix an authentication bug.

The system:

1. observes a root run start;
2. creates a Candidate Quest;
3. sees exploration/resource activity;
4. sees implementation changes;
5. sees failed validation and later recovery;
6. sees 16/16 tests pass;
7. sees a real code artifact/commit/reference;
8. classifies the Quest outcome as Verified;
9. grants Debugging/Engineering growth;
10. turns the real artifact into a Loot reference;
11. activates or progresses Workshop;
12. persists all relevant state;
13. shows a short Return sequence when the user opens the world.

## 5. First-session experience

The initial world is deliberately small and quiet:

```text
        Small Camp

        Old Board

       Dormant Gate
```

The player should understand that the world has not been awakened yet.

### First major moments

#### Moment 1 — World Awakening

Connecting the first compatible harness changes Dormant Gate into AI Gate.

This explains the product without a long tutorial: the real AI environment is now connected to the game world.

#### Moment 2 — First Return

The first meaningful completed Quest triggers a short return sequence:

- Gate reacts
- Quest result appears
- evidence/validation is shown if present
- real artifact appears as Loot if one exists
- a relevant building reacts/unlocks

#### Moment 3 — First Permanent Change

The first qualifying Engineering/Debugging/Automation result may unlock Workshop; the first qualifying Research/Planning result may unlock Library.

This is the moment the user learns the central rule:

> Real AI work leaves permanent traces in the world.

## 6. World objects in v0.1

### Small Camp

The player's starting anchor and neutral center of the first scene. It does not need complex mechanics.

### AI Gate

Represents harness connection and active/returning expeditions.

States:

- Dormant
- Connected
- Active
- Returning

AI Gate is not a vendor catalog. Product/harness identity may be shown as secondary metadata, but the world should not be organized around vendor brands.

### Quest Guild

Represents current and historical real work goals.

It shows:

- Candidate/Active quests
- completed/failed/cancelled outcomes
- Verified/Supported/Unverified confidence
- evidence summary
- recent expeditions

It is not a Todo application.

### Workshop

Represents Engineering, Debugging, and Automation growth.

It can be locked, idle, active, busy, or at a milestone. Visual activity should respond to recent work; permanent progress persists.

### Library

Represents Research, Planning, and knowledge-oriented artifact growth.

It can be locked, idle, active, busy, or at a milestone.

### Hall

Reserved for major long-term achievements/landmarks. It may be deferred from the first vertical slice.

## 7. Work domains

v0.1 uses six work domains:

1. Research — reducing information uncertainty through search, reading, comparison, evidence gathering, synthesis.
2. Planning — deciding how work should be approached: decomposition, ordering, architecture, trade-offs, routes.
3. Engineering — changing a system: code, configuration, modules, implementation, technical construction.
4. Debugging — narrowing the gap between expected and actual behavior: reproduction, diagnosis, fix/recovery, validation.
5. Creation — producing human-facing expression: writing, design, visual/media/content creation.
6. Automation — making future work execute automatically: scripts, workflows, orchestration, triggers, pipelines.

A Quest has a Primary Domain plus an Activity Mix. It is not forced into only one category.

## 8. The player role

In v0.1 the player is not required to micromanage AI work.

Meaningful v0.1 player actions:

- connect/configure a harness adapter
- inspect an active Quest
- merge mistaken duplicate Candidate Quests
- accept/continue/archive an unverified result when system evidence is insufficient
- inspect/open a real artifact
- inspect world growth and history

Future versions may add strategy/loadout/workflow control. v0.1 must remain read-only.

## 9. Product success criteria

The first version succeeds if the following feeling is real:

> I did useful work with an Agent. The game did not distract me while I worked. When I came back, it understood enough of what happened to turn it into an understandable Quest, preserved my real result, and visibly changed my world.

It fails if the experience feels like:

- a token dashboard
- a log viewer with sprites
- a forced productivity streak app
- a generic RPG disconnected from real outcomes
- a tool that requires another paid model just to function
