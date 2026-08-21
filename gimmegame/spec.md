# ColorFall — spec (v3: endless-first launch)

Supersedes the v1 procedural spec on this branch. Source design doc: the
user's "Circle Alignment Game" spec (2026-08-01). Engine and core mechanic
carry over from v1 verified stages s1+s2.

## v3 launch decision (designer, 2026-08-02)

The STARTING version ships **endless mode only**: boot → title screen →
tap → endless boards, chained forever. The single difficulty mechanic is
the **ramp**: as the session goes on, drops fall more and more frequently
(interval 2.0s shrinking log-ish to a 0.9s floor, cumulative across boards,
reset when returning to title). Nothing else escalates.

The Geometry Dash structure below (handcrafted deterministic levels, level
select, difficulty labels) is BUILT AND VERIFIED but hidden from the UI —
it ships in a later update if the game finds popularity. Level cadence
stays fixed (no ramp) to preserve determinism for that day.

## Type

`arcade` core loop with a puzzle win condition, structured like Geometry
Dash: handcrafted deterministic levels, all open from the start, score
chased per level. No fail state (Sudoku model) — you finish, efficiently or
not.

## Core loop

A drop telegraphs at the top edge, condenses, and falls down the center
line; you drag left/right to rotate the whole wheel (inner + outer are one
rigid unit — rotation can NEVER fix a mismatch, only position a color under
the drop); a correct catch grows that color's outer share toward its inner
target; align every share within the level's tolerance → lock-in, the layers
fuse, level complete. Score = drops caught (all catches count); lower wins.

## The wheel (unchanged from v1)

- Inner disc: the target pie — FIXED per level (handcrafted, not random).
- Outer ring: current shares, each segment angularly centered on its inner
  twin; all start equal at 100/N. Undersized regions leave dark gaps;
  oversized neighbors press together, split at the overlap midpoint.
- One global rotation θ; drag anywhere, 1:1 at the rim, light inertia.
- The ring always sums to 100%. Redistribution rule (decided, consistent
  everywhere): **proportionally across all other segments** — visually the
  whole ring breathes, and no neighbor gets singled out.

## Catch economy

The drop lands at 12 o'clock. The ring is ALWAYS closed (designer call,
2026-08-15): segments sit edge-to-edge in color order from the same origin
as the inner pie, sized by current share — no gaps, ever. Every drop lands
on some color and is absorbed there. There is no free dodge; "dodging" now
means choosing the least-bad catcher, which under the shrink rule is the
weaponized wrong catch.

- **Correct catch** (segment color == drop color): +G to that share,
  everyone else shrinks proportionally.
- **Wrong catch** — per-level rule, a progression curve (§ levels):
  - `none` (teaching tier): absorbed, no share change.
  - `shrinkSelf` (standard tier — the designer's call, 2026-08-02): the
    segment that GRABS the drop shrinks by G; others grow proportionally.
    Whatever grabs it is reduced. Still weaponizable — deliberately park an
    overgrown color under an unwanted drop to shrink it — and it punishes
    clumsy catches directly. `shrinkDrop` (the drop's own color shrinks
    wherever it lives) remains implemented as an alternate level knob.
- **Scoring**: EVERY drop counts — the closed ring absorbs all of them, so
  score is total drops seen to alignment. The skill is routing: which color
  eats each drop, and when a wrong catch is the corrective move.
- Tolerance ε: per-level knob, generous early, brutal late.

## Behaviors

Unchanged from v1 except:
- `scheduler` → `sequencer`: levels play a FIXED, looping drop sequence
  (same colors, same order, same speeds, every attempt — leaderboard-pure
  choreography). Endless mode keeps the seeded weighted randomizer.
- `wrong catch` effect branch per the economy above.
- `tutorial hint`: teaching levels render a one-line hint until the first
  catch ("The rings turn together — grow colors by catching drops"); the
  first shrink-tier level banners "Wrong catches now shrink!".

## Relations, key elements & animations, look

Unchanged from v1 (drop physics/juice remains the product: gravity,
squash/stretch, surface-tension forming, ripple absorption, lock-snap →
fuse). Additional UI element: level-select screen — card grid, every level
open, difficulty label + personal best on each card.

## Structure — Geometry Dash model

Handcrafted levels in `src/game/levels.ts`, each fully deterministic:
`{ id, name, difficulty label, targets[], sequence[] (loops), intervalS,
gravityScale, epsilon, growth, wrongCatch, intro? }`.

Difficulty levers: color count (4 → 8 slivers), fall speed, drop interval,
tolerance, wrong-catch rule, sequence nastiness (noise drops, overshoot
traps: repeats of an already-satisfied color).

v1 ships 10 levels: 1–3 teaching (`none`), 4 introduces shrink with a
banner, 5–10 ramp to Insane (8 colors, ε 1.5pp, fast). Labels GD-style:
Easy / Normal / Hard / Harder / Insane.

**Endless mode** (side mode, one card on select): random target pie +
random weighted drops (the v1 generator), medium settings, new board each
win; best per board tracked under id `endless`.

## Scoring & fail state

Score = total catches this run; par (heuristic floor = ceil(Σ deficits /
G)) shown for reference; best per level saved locally. No fail state ever.
Post-v1: bonus-objective stars, leaderboards.

## Universals

Controls / save / audio / ads / localization: as v1. Multiplayer never.
Leaderboards are post-v1 (until then, best-per-level is local).

## Monetization

As v1: interstitial slot after every 3rd level completion; rewarded slot
reserved for "ghost guides" hint. Slots stubbed in browser.

## Post-v1 (explicitly out of scope now)

Hue-shift "Painter mode" (wrong catches drift hue; loud visual warning;
win-by-size decision pending), leaderboards, stars, Capacitor wrap.
