# ColorDrops — spec

## Type

`arcade` (one verb: drag to rotate; score-chaser structure) with a puzzle win
condition. Arcade reference owns the core loop; no fail state in MVP — the
pressure is the score, not death.

## Core loop

A drop of a random color telegraphs at the top edge, forms, and falls down the
screen's center line; you drag left/right to rotate the whole wheel so the
matching-color outer segment sits at the wheel's top when the drop lands; a
correct catch grows that color's outer share (and shrinks the others
proportionally); align every outer share with the inner target pie within
tolerance → the ring locks in, merges into one full circle, you win. Score =
drops caught; fewer is better.

## The wheel (the one mechanic — from the user, do not reinvent)

- **N colors** per level (4 at level 1).
- **Inner disc**: the *target* — a pie chart with seeded-random shares
  (min 8%, sum 100%), fixed for the level.
- **Outer ring** (donut): the *current* state — same colors, each segment
  **angularly centered on the center of its inner segment**. All start at
  equal shares (100/N each). Because inner shares sum to 100%, when every
  outer share equals its inner share, adjacent outer segments meet exactly at
  the inner boundaries — the ring closes seamlessly. Mid-game, undersized
  regions show dark ring gaps; oversized neighbors press against each other
  (drawn split at the overlap midpoint, like liquid under pressure).
- **Rotation**: one global angle θ applied to the whole wheel (inner + outer
  rotate together, always in sync). Drag left/right anywhere on screen turns
  it. That is the only player verb.
- **Catching**: the drop lands at the wheel's top point (12 o'clock). The
  outer segment whose *drawn* extent spans that world angle is the catcher.
  - Matching color → that share grows by **G percentage points** (level knob,
    4pp at level 1); every other share shrinks proportionally so the sum
    stays 100.
  - Wrong color → nothing happens to shares; drop splashes off.
  - Dark gap at top → drop falls through, nothing happens.
  Deliberately dodging unwanted drops is the core skill: overshooting a color
  past its target means catching *other* colors to shrink it back.
- **Win**: every |outer − target| ≤ **ε** (2.5pp at level 1, tightens with
  level). Then the lock sequence plays and the level ends.

## Behaviors

- `wheel` (player-controlled)
  - when drag active → θ += drag delta (1:1 angular mapping, immediate,
    same-frame; slight inertia on release, heavy damping)
  - when win condition met → enter `locking` (input disabled)
- `drop` (spawned by scheduler) — states: `telegraph → forming → falling →
  (absorbed | splashed | missed)`
  - telegraph: top screen edge tints with the drop's color
  - forming: the tint gathers toward the top-center, bulges into a droplet
    (surface-tension squash/stretch), detaches when full
  - falling: gravity acceleration down the center line, slight wobble
  - on contact with outer ring top point:
    - color matches segment there → `absorbed`: ripple + segment grow pulse
    - else → `splashed`: burst particles, no share change
  - past the wheel uncaught → `missed`: falls offscreen, no penalty
- `scheduler`
  - every `interval` seconds (level knob) → pick next color (seeded RNG,
    weighted toward colors still below target — 70/30 useful/noise), start
    its telegraph
  - never two drops in the air at once in MVP
- `ring-segment` (per color)
  - on absorb of own color → grow animation to new share
  - on any other absorb → ease to shrunken share
  - on lock → snap to exact target extent, mechanical "click" into place,
    one segment after another (Iron Man suit lock), then ring and disc merge
    into a single full pie + flash

## Relations

- drop —lands-on→ outer ring segment (top point test)
- outer segment —grows/shrinks→ sibling segments (sum locked at 100)
- outer segment —compares-to→ inner segment (win check, per color)
- scheduler —spawns→ drop; wheel θ —positions→ all segments

## Key elements & animations

| Entity | States (each = one animation) |
|---|---|
| drop | telegraph, forming, falling, absorbed (ripple), splashed, missed |
| outer segment | idle, grow-pulse, shrink, lock-snap, merged |
| inner disc | idle, merged |
| wheel | rotating (continuous), locking (sequence) |
| HUD | drop-counter tick, new-best celebration |

Drop motion must be mathematically honest: real gravity (integrated in the
fixed-step sim), volume-preserving squash/stretch, drip-detach easing. The
drop animation is the product — budget it in s2, not s4.

## Look

Dark near-black background with a soft radial vignette; vibrant, saturated,
clearly distinct hues (red, amber, green, blue, purple, pink, teal, yellow —
in that order as N grows); flat 2D with subtle glow on the active drop;
liquid feel everywhere (ripples, wobble). Minimal HUD: level, drop count,
best. One accent color: the *next drop's* color (the UI itself telegraphs).

## Structure

Levels, procedurally generated from a seed:
- `N(level)`: 4 + floor((level−1)/3), capped at 8
- `interval(level)`: 2.6s → 1.2s (log-ish decay)
- `fallSpeed(level)`: gravity scales up ~8%/level, capped
- `ε(level)`: 2.5pp → 1.5pp
- `G(level)`: 4pp, shrinking slightly as N grows (G = 16/N)
- Par shown per level ≈ ceil(Σ max(0, target−start) / G); rating = drops vs par.
MVP: endless level chain with the curve above; 10 levels is a full session.

## Universals

- Controls: MVP (drag anywhere = rotate; ArrowLeft/Right for desktop dev)
- Save/profile: MVP (current level, best per level, settings; versioned blob)
- Audio: s4 (catch blip pitch-ramped by streak, splash, lock clicks, win)
- Ads: s4 slots stubbed (no-op in browser)
- Multiplayer/co-op: never
- Localization: strings table from day one, English only

## Monetization

Ads model: interstitial after every 3rd completed level (never before first
play, never mid-fall); rewarded (post-MVP): "ghost guides" — briefly show the
target boundaries projected onto the ring.
