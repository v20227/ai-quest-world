# AI Quest World Visual Collection Reward Asset Catalog

## Outcome

AI Quest World owns a visual collection layer in which apparel, equipment, companions, food, recovery items, containers, tokens, seats, artifacts, milestones, props, UI icons, and effects are collectible visual content.

Every entry is visual-only. Collection state may change what the player sees, but no entry changes harness behavior, quest calculation, skill values, combat, economy, consumption, or progression math.

## Collection contract

- Game Core remains the only authority that grants a collection entry.
- Renderer only presents the collection state it receives.
- A collection entry has no stat, price, balance, consumable effect, combat effect, or workflow modifier.
- Coins, gems, and similar tokens are decorative collection objects, not spendable currency.
- Food and medicine are collectible visual objects, not consumables or health systems.
- Pets and mounts are collectible visual companions or seats; they do not create an active pet, mount, or movement system.
- Chests and cases are collectible containers. Open and closed variants are visual states, not random loot mechanics.
- Duplicate event processing is idempotent. A duplicate collection grant does not create a second reward or a compensating currency value.
- A real Artifact still requires a real artifact or evidence reference. Visual collection content must not fabricate evidence.

## Content groups

| Group | Product role | Initial coverage target | Display targets |
| --- | --- | ---: | --- |
| `apparel` | Headwear, clothing, cloaks, scarves, eyewear, gloves, and cosmetic badges | 24 | Agent, collection gallery |
| `equipment` | Signal, research, validation, repair, and automation tools with weapon-like silhouettes | 24 | Agent, collection gallery, Workshop |
| `companion` | Original AI-themed visual companions with idle, working, returning, and celebrate states | 32 base/state entries | Agent, Camp, collection gallery |
| `food` | Focus supplies, camp food, celebration food, and field rations | 24–32 | Camp, collection gallery, reward card |
| `medicine` | Fictional recovery and repair objects with no health meaning | 6–8 | Workshop, collection gallery, reward card |
| `container` | Evidence capsules, archive cases, folios, field crates, and milestone cases | 8–10 | Return Overlay, Artifact Card, world props |
| `token` | Decorative signal shards, knowledge crystals, seals, and medallions | 8–12 | Collection gallery, milestone display |
| `seat` | Stools, chairs, benches, archive seats, and observatory seats | 12 | Camp, Workshop, Library, collection gallery |
| `artifact` | Code, Document, Research, Plan, Creative, Validation, Automation, and Major Deliverable visuals | 8 | Artifact Card, world props |
| `milestone` | Verified badges, plaques, trophies, flags, and unlock markers | 12 | Return Overlay, buildings, collection gallery |
| `world-prop` | Notice boards, lanterns, terminals, books, blueprints, tools, beacons, crates, and decor | 16 | Small Camp, Gate, Guild, Workshop, Library |
| `ui` | Collection frames, state badges, selection markers, arrows, locks, and category icons | 16–24 | Collection panel, Artifact Card, contextual panels |
| `fx` | Signal pulses, activity sparks, validation rings, return particles, smoke, and unlock bursts | 10 | World Scene, Return Overlay |
| `seasonal` | Small visual variants for seasonal world decoration | 12 | World Scene, collection gallery |

The collection catalog may be larger than the active world. The active world continues to use a small context-relevant set so the scene remains readable. Collection ownership does not require every item to appear on the first screen at the same time.

## Semantic translation rules

The new content preserves a category's visual purpose, not its original silhouette or identity.

| Visual purpose | New AI Quest World translation |
| --- | --- |
| Cute animal or pet | Signal moth, archive owl, debugging beetle, blueprint fox, spark sprite, gear drone, moss monitor, cloudlet, or another original companion |
| Snack or food | Focus tea, research biscuit, camp ration, recovery soup, map fruit, or celebration food |
| Medicine | Repair patch, calm circuit tonic, validation capsule, or other fictional work-recovery collectible |
| Chest | Evidence capsule, archive case, blueprint case, guild parcel, or milestone case |
| Gem or coin | Signal shard, knowledge crystal, verification seal, or decorative medallion with no balance value |
| Appearance variant | Original apparel, equipment skin, companion colorway, seat, or collection frame |
| Achievement card | Milestone plaque, verified badge, world ornament, or return reward card |
| Game or shop icon | Collection category icon, building marker, Artifact icon, or state indicator |

## Visual production rules

- Use original silhouettes, names, symbols, and compositions.
- Use the Signal Camp palette: deep navy, charcoal, desaturated teal, cyan, violet, warm amber, cream, and muted green.
- Author at a low logical pixel resolution with a consistent 1x grid.
- Use hard pixel edges, compact pixel clusters, and a consistent dark outline.
- Keep final objects independently placeable with transparent backgrounds.
- Keep base sprites, cosmetic overlays, props, state overlays, and effects as separate roles.
- Do not bake collection labels, prices, rarity text, or gameplay numbers into the art.
- Use fixed anchor contracts: bottom-center for ground objects, center for icons, and slot anchors for Agent layers.
- Concept sheets may use a presentation background. Runtime assets must not inherit that background.

## Runtime composition model

```text
Collection Entry
  -> visual asset
  -> optional state or appearance variant
  -> selected display target
  -> world, Agent, Artifact Card, or collection gallery
```

Examples:

```text
Agent Display
  = agent_base
  + apparel
  + equipment
  + companion
```

```text
World Display
  = building_base
  + world_prop
  + collection_display
  + state_overlay
  + fx
```

```text
Artifact Display
  = real_artifact_reference
  + artifact_visual
  + milestone_or_verified_badge
```

## Production sequence

1. Lock the category and ID catalog.
2. Produce representative concept sheets for every group.
3. Review silhouette consistency, semantic readability, and collection balance.
4. Expand each approved group in batches.
5. Select final variants and clean each item into an independent asset.
6. Convert the selected assets to real RGBA transparent PNG files.
7. Normalize logical dimensions, anchors, palette, and pixel scale.
8. Generate the runtime manifest and validate every path.
9. Integrate only the context-relevant display subset into the World Scene and collection surfaces.

Alpha cleanup is deliberately a late production stage. Concept sheets are not runtime assets and must remain in the concept area until individual files pass the final asset gate.

## Final asset gate

An asset is ready for runtime only when:

- it is an independent PNG with a real alpha channel;
- it has no checkerboard, black, or presentation background;
- it has no text, watermark, or accidental source mark;
- its logical size and anchor match its group contract;
- its pixels remain crisp at the supported display sizes;
- its manifest ID and path are unique and valid;
- its visual role does not imply an excluded gameplay system;
- its collection grant can be replayed without duplicate effects.

## Current delivery boundary

This catalog defines visual collection content. It does not add a shop, currency balance, pet care, medicine effects, equipment stats, combat, mounts, movement, or a mandatory collection economy. Those systems require separate product decisions and are not implied by the presence of their visual assets.
