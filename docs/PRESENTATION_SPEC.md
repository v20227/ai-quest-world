# PRESENTATION SPEC — AI Quest World v0.1

## 1. Presentation thesis

v0.1 uses Web technology, but the primary experience is a **persistent world scene**, not a collection of dashboard pages.

Rule:

> Panels explain the world. Panels never replace the world.

The first version does not need free movement to feel like a world.

## 2. Presentation stack

The visible product is composed of four layers:

```text
4. Event Overlay
   Quest Return / Unlock / Milestone

3. Context Panel
   Quest / Building / Artifact details

2. Mini HUD
   current Expedition / connection state

1. World Scene
   camp / buildings / props / VFX
```

The World Scene remains the visual anchor whenever possible.

## 3. Main World Scene

Initial state:

```text
             cloud / sky

             Small Camp

             Old Board

             Dormant Gate
```

Evolved early state:

```text
Library                 Workshop

             Main Camp

Quest Guild             AI Gate
```

Do not use a permanent left sidebar full of analytics.

## 4. Navigation model

v0.1 has no WASD/touch joystick/pathfinding.

Primary interaction:

```text
click world object
↓
object receives focus / subtle camera emphasis
↓
Context Panel appears
```

A bottom navigation can exist as mobile/accessibility/quick-access fallback:

- World
- Quests
- Chronicle
- Settings

World objects remain the preferred thematic entry points.

Settings may use normal modern UI; settings do not need RPG treatment.

## 5. Mini HUD

Keep the persistent HUD intentionally small.

Recommended always-visible information:

- product/world title or compact identity
- harness connection indicator
- active expedition count
- current Quest title/phase/progress when one is active

Example:

```text
AI QUEST WORLD                      Connected ●

Fix Authentication
Validate · 13/16
```

Do not keep these as always-visible dashboard metrics in v0.1:

- token charts
- tool-call totals
- weekly analytics
- success-rate charts
- large skill tables
- leaderboards

Detailed technical stats belong in Quest detail/diagnostics, not the world surface.

## 6. Quest Panel

Required fields, when known:

- title
- lifecycle state
- difficulty
- current semantic phase
- phase/timeline summary
- Primary Domain
- Activity Mix (compact)
- validation/evidence summary
- artifact count
- outcome confidence

Example structure:

```text
FIX AUTHENTICATION
★★★★☆

Current Phase
Validation

Expedition
Explore     ✓
Build       ✓
Validate    ...

Activity Mix
Debugging    44%
Engineering  36%
Planning     12%

Evidence
Tests 13/16
Artifact 1

Outcome
Pending
```

The panel summarizes meaning, not raw log lines.

## 7. AI Gate Panel

Responsibilities:

- connected/disconnected state
- active expeditions
- recent returns
- secondary harness identity/capability summary when useful

Do not expose adapter ports/debug logs as the primary Gate experience. Put technical settings under Settings/Diagnostics.

## 8. Quest Guild Panel

Responsibilities:

- Active/Candidate Quest list
- Recently Completed
- Failed/Cancelled when relevant
- Verified/Supported/Unverified badges
- Chronicle/history entry point

Quest Guild is not a generic Todo list.

## 9. Building Panel template

Workshop and Library should reuse one compositional component.

Suggested template:

```text
Building name / pixel illustration
Status
Primary domain progress
Secondary domain progress
Recent artifacts/discoveries
Next milestone
Available actions
```

### Workshop data

- Engineering
- Debugging
- Automation
- recent technical artifacts

### Library data

- Research
- Planning
- recent knowledge/plan artifacts

Building data can be deeper than the art. v0.1 Renderer only needs to expose enough to make growth understandable.

## 10. Artifact Card

Artifact Card represents a real output.

Required fields when available:

- display label
- artifact category
- originating Quest
- outcome confidence
- created time
- evidence/reference metadata
- action to open/view original artifact when supported

Visual vocabulary is generic; identity comes from data.

## 11. Return Overlay

This is the signature v0.1 moment.

Typical sequence:

```text
Gate reacts / Returning
↓
QUEST COMPLETE
↓
Outcome confidence
↓
strongest validation evidence
↓
Artifact appears if real artifact exists
↓
relevant building reacts
↓
1 primary growth/world result
```

Target duration: roughly 2–5 seconds for normal Return, skippable.

Ordinary Return should feel light.

Milestone Return can be stronger:

```text
WORLD CHANGED
WORKSHOP UNLOCKED
```

Do not show more than 1–3 primary result callouts in an ordinary Return.

## 12. Chronicle

Chronicle is the meaningful game history, not a debug log.

Example:

```text
Today 13:42
Authentication fixed
16/16 validation passed
Code Artifact created

Today 11:18
Agent research completed
Research Artifact created

Yesterday
AI Gate activated
```

A future AI-enhanced mode may narrativize this into an Adventure Journal, but v0.1 uses deterministic concise text.

## 13. World visual states

Major world objects use a limited state vocabulary.

### AI Gate

- Dormant
- Connected
- Active
- Returning

### Workshop / Library

- Locked
- Idle
- Active
- Busy
- Milestone

### Quest Guild

- old/locked
- restored/idle
- active quest indicator
- return/completion indicator

The state vocabulary is more important than dozens of bespoke assets.

## 14. Asset strategy

v0.1 art is modular.

Prefer:

```text
Base Sprite
+ State Overlay
+ Prop
+ Activity VFX
+ Milestone VFX
```

Avoid per-level full redraws.

Example Workshop:

- base Workshop
- window-light overlay
- smoke overlay/animation
- machine/activity overlay
- artifact crate prop
- milestone celebration effect
- optional Tier II base sprite

### Initial asset budget guideline

Aim approximately for:

- 1 main-city scene/background/tileset composition
- Small Camp
- AI Gate
- Quest Guild
- Workshop
- Library
- max 1–2 primary visual tiers for major buildings
- 10–20 reusable world props
- 8–10 reusable VFX/state effects
- 8 generic artifact/loot icons/categories
- one coherent UI/icon vocabulary

Do not create a unique monster/building/loot sprite for each real Quest.

## 15. Visual vocabulary for generated Quest data

Domain icons/visual tokens:

- Research → books/search
- Planning → map/blueprint
- Engineering → workshop/tool
- Debugging → bug/repair
- Creation → brush/spark
- Automation → gear/mechanism

Status vocabulary:

- Active
- Blocked
- Validating
- Failed
- Verified
- Completed

Difficulty uses 1–5 stars when available.

Quest visuals are composed from data:

```text
Domain visual
+ status frame/badge
+ difficulty
+ outcome confidence
+ artifact category
```

No dynamic per-Quest art generation is required.

## 16. World change rendering

Example state:

```text
workshop.activity = active
```

Renderer can display:

- lights
- smoke
- animated mechanism

Example:

```text
workshop.props += testing_bench
```

Renderer displays Testing Bench prop.

Example:

```text
workshop.tier = 2
```

Renderer swaps the major base sprite/scene representation.

Game logic happens first; Renderer only reflects it.

## 17. Responsive behavior

The Scene must remain readable on desktop and mobile-sized web surfaces.

v0.1 can use:

- fixed logical scene coordinates
- responsive scale/letterboxing
- safe areas for HUD/panels
- bottom-sheet Context Panels on narrow screens
- side/floating Context Panel on wide screens

Do not require tiny pixel-perfect click targets for primary actions.

## 18. Accessibility / reduced motion

Provide a reduced-motion mode for return/particle/upgrade effects.

Critical state cannot be communicated by animation/color alone; include labels/badges/text.

## 19. Recommended Web implementation

A simple v0.1 can use:

```text
React/Web UI
+ scene container
+ pixel background/image layers
+ positioned building sprites
+ CSS/sprite animations
+ HTML panels/overlays
```

Do not adopt a heavier game engine until scene complexity requires it.

The authoritative world model must remain independent so a later PixiJS/Phaser/Godot renderer can replace the first Renderer without changing Game Core.
