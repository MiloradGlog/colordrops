# ColorDrops

Hold your finger down and turn the wheel. That's the whole game.

Two circles: the **inner disc** is a target pie chart with randomized color
shares; the **outer ring** carries the same colors, each segment centered on
its inner twin, all starting equal. Colored drops fall from the top of the
screen — rotate the wheel so the matching color catches them. A correct catch
grows that color's ring segment (and shrinks the rest). Match every ring
segment to its target and the ring **locks** into place, merging into one
full circle. Fewer drops caught = better score.

This branch is the **handcrafted-levels variation** (Geometry Dash model):
10 authored levels with fixed target pies and fixed, looping drop sequences —
the same puzzle for everyone, so the fewest-drops score is pure skill. All
levels are open from the start with difficulty labels (Easy → Insane). Early
levels are a teaching tier where wrong catches only cost score; from "Now It
Shrinks" onward a wrong catch shrinks the drop's own color — which skilled
players can weaponize to fix overshoot. Dodging by parking a dark gap under
a drop is free. Endless mode (random boards) is the casual side mode.

Built with the [gimmegame](https://github.com/miloradglog/gimmegame) plugin:
spec in `gimmegame/spec.md`, build state in `gimmegame/progress.json`.

## Run it

```sh
npm install
npm run dev      # open the printed URL; phone viewport recommended
```

Controls: drag left/right anywhere (touch or mouse). Arrow keys work on
desktop.

## Develop

```sh
npm run check    # typecheck
npm run build    # production bundle (dist/)
npm run verify   # headless Playwright suite driving the real game
```

`npm run verify` maps 1:1 to the `verify` lines in
`gimmegame/progress.json` — it boots the game in Chromium, checks input and
rendering, unit-checks the pure sim rules, then lets an autopilot play a full
level to the locked win.

## Engine

No framework — a tiny generated engine (fixed-step loop, scene stack, named
input actions, seeded RNG) in `src/engine/`, with the game itself in
`src/game/` mirroring the behavior tree in the spec: `wheel.ts` (pie
geometry), `drop.ts` (lifecycle), `scheduler.ts` (spawns),
`behaviors/rotate.ts` and `behaviors/catch.ts` (the two rules that move the
world).
