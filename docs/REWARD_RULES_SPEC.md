# REWARD RULES SPEC — AI Quest World

## 0. Status and scope

**Version: post-v0.1 (v0.2 candidate).** `V0.1_SCOPE.md` explicitly excludes
Gold/economy/shop/pets. This document defines their **future** rules only —
§4 must not be implemented until V0.1_SCOPE.md is revised. The binding design
axioms for everything here live in `GAME_RULES.md` §26 (A1 provenance,
A2 honesty over victory, A3 display not power, A4 ritual not dailies).

This spec defines the three rule layers that sit between observation and play:

1. **Process rules** — which observed facts only drive live companionship (animation, HUD), never rewards.
2. **Settlement rules** — what counts as a real outcome, per work domain, including interrupted, partial, and resumed work.
3. **Gameplay rules** — what a settlement grants, and how grants flow into the economy, pets, collection, and world systems.

It extends `GAME_RULES.md` (§9, §14–§20) and the implemented policies in
`core/game/outcome-policy.mjs`, `core/game/progression-policy.mjs`, and
`packages/uarp/run-lineage.mjs`. The economy/pet module is **new** and is not part of v0.1.

Non-goals (inherited from product direction):

- No workflow-specific semantics. Nothing may require a named development
  workflow (e.g. plan → implement → test → deliver) for observation or reward.
  A world without any workflow directory must work identically.
- No domain chauvinism. Research, writing, and creative output must be
  rewardable without executing a test suite.
- No volume-based rewards. Event counts, tokens, tool calls, file reads remain
  non-reward inputs (already enforced by `progression-policy.mjs`).

## 1. Layer separation

```text
Codex real work (UARP facts)
  ↓ PROCESS RULES     → live work-state (companion animation, HUD)   [no persistence into XP]
  ↓ SETTLEMENT RULES  → outcome confidence + bounded quest settlement [deterministic, evidence-gated]
  ↓ GAMEPLAY RULES    → XP / domain progress / gold / drops / loot    [deterministic, replay-safe]
```

Invariants:

- A live work-state is derivable from the event stream alone; it is never
  stored as progression and never survives a replay as reward.
- Settlement is bounded per quest via run lineage (`resumed_from_run_id`
  edges, `RUN_ID` / `RESUMED_FROM_RUN_ID`): child, retry, and recovery runs
  share one bounded settlement.
- Every grant is a pure function of the settlement snapshot. Replaying the
  same run produces byte-identical grants (seeded randomness, §4.3).

## 2. Process rules (live companionship)

**Principle: 有活动就有陪伴。** Live feedback does not wait for terminal events.

Mapping from UARP facts / semantic kinds to live presentation states:

| Observed fact (UARP) | Live state | Presentation | Visibility |
| --- | --- | --- | --- |
| `resource.activity` (reads/searches) | Studying / scouting | Companion reads, walks map | 0–2 |
| `resource.changed` (writes) | Crafting | Companion at workbench | 2–3 |
| `tool.started` (kind=shell/validation) | Verifying | Companion inspects machine | 2 |
| subagent run started (`parent_run_id` present) | Collaboration | Second companion appears | 3 |
| `validation.completed` (failed) | Setback | Encounter ping, recover posture | 3–4 |
| explicit waiting-for-input (harness fact when available) | Awaiting orders | Companion raises signal | 4 |
| root run terminal | Resting / return | Work summary panel opens | 4 |

Rules:

- P-1. Live states are computed by the presentation layer from the event
  stream; they MUST NOT write progression, quest state, or economy records.
- P-2. High-volume facts (`resource.activity`, token deltas) are shown as
  ambient activity only (visibility 0–2) and aggregate over time; they never
  produce discrete feedback items.
- P-3. Repeated identical facts within a short window collapse into one live
  state change (anti-spam), mirroring `GAME_RULES.md` §9.
- P-4. An interrupted run (no terminal event, no completion marker) keeps the
  companion in a resting/uncertain state, not a success or failure pose.

## 3. Settlement rules (what counts as an outcome)

**Principle: 有依据的进展才有收益。** Settlement reuses the implemented
pipeline: `classifyOutcome` → `CANDIDATE/ACTIVE/…/COMPLETED` quest lifecycle →
`calculateProgression`. The only change is that outcome evidence becomes
**domain-aware**.

### 3.1 Per-domain outcome basis

`VERIFIED` today requires successful validation + durable artifact, which is
code-biased. Replace the single rule with a domain basis table. In all rows,
"artifact" means a durable artifact with a real reference
(`artifact.durable === true && has_reference === true`, per `outcome-policy.mjs`),
and raw content is never stored.

| Domain | Primary evidence | Secondary evidence | VERIFIED requires | SUPPORTED | UNVERIFIED |
| --- | --- | --- | --- | --- | --- |
| Engineering / Debugging | `validation.completed` with real counts (test/build/lint/typecheck) | code artifact + `resource.changed` pattern | validation success after last change + durable code artifact | either alone | run.completed with neither |
| Research | durable research/document artifact | aggregated exploration (`resource.activity`) + a synthesis artifact | durable artifact + confirm-equivalent (§3.2) | durable artifact | only narrative claims |
| Planning | durable plan artifact | decision/structure record in artifact metadata | durable artifact + confirm-equivalent | durable artifact | only narrative claims |
| Creation | durable creative/document artifact | publication/submission `relation` (`published`, `committed`) | durable artifact with publish/submit relation, or + confirm-equivalent | durable artifact | only narrative claims |
| Automation | durable automation artifact | observed second execution that succeeds without new authoring | validation success or observed re-execution + artifact | either alone | only claims |

Rules:

- S-1. Size/word-count/count metrics are metadata for difficulty estimation
  only. They are never XP or gold inputs.
- S-2. An agent's natural-language "done" is never evidence by itself
  (already enforced: `outcome.reported` is factual, not Verified).
- S-3. Domain is derived from semantic `domain_contributions`, not from a
  required workflow stage. A quest with no validation events at all can still
  settle as SUPPORTED through its artifact basis.
- S-4. Unknown stays Unknown. Missing evidence yields UNVERIFIED, never a
  guess; the observed value is recorded at settlement time.

### 3.2 Lazy user confirmation

User confirmation is an evidence type (`outcome.reported` with
`source.agent_id = "user"`, `content_included = false`), used sparingly:

- Asked only when a terminal UNVERIFIED quest has meaningful work (semantic
  records beyond run lifecycle), or when candidate quests are ambiguous.
- One tap: "this outcome is real" / "not really". Never per-task checkbox
  busywork; the default flow is no confirmation at all.
- Rate-limited: at most N confirmations per day count toward VERIFIED
  (default N = 8) to prevent confirm-spam farming.
- A confirmation upgrades evidence one level at most
  (UNVERIFIED → SUPPORTED-grade basis; artifact-bearing SUPPORTED → VERIFIED
  only where the domain table allows confirm-equivalent).

### 3.3 Interrupted, partial, and resumed work

| Situation | Settlement behavior |
| --- | --- |
| Stream truncated, no completion marker | No settlement. Quest stays ACTIVE; last live state is resting/uncertain (P-4). |
| `run.failed` with unresolved validation failure | FAILED. Bounded process Skill XP only (existing `OUTCOME_MULTIPLIERS.FAILED = 0.25`); no loot, no milestone, no strong world progress. |
| `run.cancelled` | CANCELLED (×0.1 multiplier). Real partial artifacts may still be *visible* in the quest timeline but are not rewarded loot unless a later quest settles with them. |
| Resume (`resumed_from_run_id`) | Child/recovery activity joins the parent quest's one bounded settlement (run-lineage edges). No duplicate completion reward. |
| Repeated identical failures | Diminishing credit, already capped in `progression-policy.mjs` (validation_failure cap). |
| User continues editing after VERIFIED settlement | Later `resource.changed` events belong to a new candidate quest or an explicit continuation run; the settled snapshot is immutable. |

## 4. Gameplay rules (what settlement grants)

**Principle: 有真实产物才有成果收藏；游戏掉落是游戏物品，不是工作产物。**
Game items (gold, food, eggs, potions, pets) are fictional play objects granted
by deterministic rules. They never claim to be real files, and real artifacts
never become consumables.

### 4.1 Grant families

Existing (keep): Skill XP, Domain Progress, Artifact/Loot reference, Milestone.

New (economy module):

| Grant | Source | Determinism |
| --- | --- | --- |
| Gold | settlement only: `gold = round((activity_xp + outcome_bonus) × 0.5)`, hard cap 40/quest | pure function of progression snapshot |
| Item drops | settlement only, seeded roll (§4.3) | seeded by `hash(quest_id + sorted settlement event ids)` |
| Pet hatch | player action: egg + potion from inventory | player-triggered, idempotent per pet key |
| Pet growth / maturity | player action: feeding | bounded 5→50 scale (§4.4) |
| Milestone items | first-verified-delivery, first domain unlock, tier threshold (existing §15 Milestone family) | one-time flags |

Anti-model: no gold for tokens/events/reads; no purchasable XP; no purchasable
verification (confirmation cannot be bought or automated); shop catalog is
display-only per A3 (decorations, pet supplies, building accessories) — no
efficiency or stat items ever.

### 4.2 Economy bounds (Habitica-calibrated anchors)

Reference economy anchors extracted from Habitica's implementation
(`website/common/script/`), adapted to per-quest settlement instead of
per-task-tick:

- Gold income expectation: a settled quest yields roughly 10–40 gold
  (Habitica tasks yield ~1–2 gold each; a quest here represents many tasks).
- Shop prices: egg 3 gold; hatching potion 2 (common) / 3 / 4 / 5 (very rare)
  gold; food 2–5 gold — mirroring `content/eggs.js` (`value: 3`) and
  `content/hatching-potions.js` (`value: 2..5`).
- Daily gold cap optional but recommended (e.g. 120/day) to survive future
  quest-volume growth.

### 4.3 Work-derived drops (A1 provenance, replay-safe)

Habitica drops are random per task tick; AI Quest World replaces this with a
single seeded roll per settlement so replays cannot mint items. But the seed
only decides **whether** a roll succeeds and **which slot** it lands in —
**what the item is derives from the settled quest's real properties** (A1:
nothing without an origin):

```
seed        = SHA-256(quest_id + sorted(settlement.event_ids))
roll        = deterministicRNG(seed)   // one roll per settled quest
chance      = 0.30 × outcome_confidence_factor
              // VERIFIED 1.0, SUPPORTED 0.75, UNVERIFIED 0.4 (reuse OUTCOME_MULTIPLIERS)
difficulty_bonus = +0.03 × (difficulty_estimate − 1)   // from difficulty-policy.mjs
daily_cap   = 3 drops/day (first-drop guarantee: if inventory has zero eggs and zero
              potions, next eligible settlement drops one — Habitica firstDrops pattern)
```

On a successful roll, the seeded roll picks a slot with Habitica's
distribution (`fns/randomDrop.js`): Food 40% / Egg 30% / Hatching potion 30%.
The slot's **content** is then derived, not rolled:

| Slot | Content derivation (all deterministic) |
| --- | --- |
| Food | flavor rotates per quest primary domain (favorite-matching per §4.4 preserved) |
| Egg | species derived from quest primary domain (domain-themed species sets) |
| Hatching potion | rarity derived from observed difficulty: 1–2 → common, 3 → uncommon, 4 → rare, 5 → very-rare |

Luck decides the slot; the work decides the substance. Every granted item
records `source_quest_id` in the ledger (§4.5), so any item can be traced to
the real quest that produced it.

Rules:

- Drops exist only for COMPLETED quests with VERIFIED/SUPPORTED outcomes.
- FAILED/CANCELLED settlements roll nothing (multiplier 0 for items), though
  process XP already covers effort.
- Failed *validation during* a quest can grant a single consolation food item
  at most once per quest (recovery flavor, not a farming surface).

### 4.4 Pets: hatch, feed, mature

Directly adapted from Habitica `ops/hatch.js` + `ops/feed.js`, using world
language instead of life-sim language:

- **Hatch**: `pet_key = egg × potion` from inventory; both consumed; pet
  starts at growth 5; duplicate pet keys are rejected (idempotent).
  - Collection achievements mirror Habitica's set logic: same-color set,
    same-species set, full color collection.
- **Provenance (A1)**: every pet records the `source_quest_id` of the quest
  whose egg hatched it and keeps a visible origin tag ("born from
  *<quest title>*"). Pets are fictional game objects — but their existence
  must trace to real work.
- **Feed**: favorite food (matches pet's potion family) +5 growth; other food
  +2; overfeeding past 50 rejected.
- **Mature**: at growth ≥ 50 the pet becomes a world companion/mount
  (`pets[key] = -1; companions[key] = true` in Habitica terms), one-way.
- A milestone item ("saddle" equivalent) instantly matures one pet.
- Pets are pure game objects: no artifact reference, no evidence, no claim
  about real work. This is the deliberate Habitica split: the *collection
  board* is fiction; the *trophy/artifact board* is fact.

### 4.5 Ledger and idempotency

- Every grant/spend writes an append-only ledger row:
  `{tx_id, ts, kind: "grant"|"spend", source_quest_id?, item, qty, balance_after}`.
- `tx_id` is derived from the settlement snapshot hash + grant kind, so
  replaying a settlement attempts no second write (unique index).
- Wallet, inventory, pets, and shop are read models rebuilt from the ledger;
  the ledger is the source of truth.

### 4.6 Failure tells a story (A2)

- FAILED/CANCELLED quests produce encounter/scar records in the quest
  timeline and may add a bounded world "scar" prop (capped, e.g. latest 10) —
  never penalties, and never fabricated success.
- UNVERIFIED artifacts appear as "unconfirmed manuscripts": visible,
  inspectable, not rewarded. A later lazy confirmation (§3.2) may upgrade
  them, but the confirmation badge stays visually distinct from
  system-verified evidence forever (A2).
- Recovery after failure earns Debugging/Recovery semantic credit within the
  existing progression caps. The world remembers the struggle as story,
  not as score.

## 5. Integration notes

- `semantic-types.mjs` stays game-free; FORBIDDEN_GAME_KEYS still applies.
  Economy lives strictly behind `core/game` and a new `core/economy`.
- `calculateProgression` gains a `game_grants` section (gold amount, drop
  seed, drop result) computed inside the same pure function, so the existing
  snapshot validation covers it.
- SQLite additions: `ledger`, `inventory`, `pets`, `wallet` tables; shops are
  static config, not tables.
- Web presentation: live work-states come from the event stream (P-1); owned
  items/pets/world changes come from the read models.

## 6. Open questions

1. ~~Domain-themed egg species~~ — resolved by A1/§4.3: species derives from
   quest primary domain. Remaining: how many species per domain set to author.
2. Whether UNVERIFIED-with-confirmation quests should roll drops (currently:
   yes, at ×0.4 chance) — revisit after observing confirm-rate in practice.
3. Pet visual language: reuse pixel-world companion sprites vs abstract
   creatures — presentation spec, not this spec.
