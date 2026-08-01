# UX/UI polish loop — honest log

Working definition of "perfectly designed": a new player understands the game
in 10 seconds without words; every game state is readable at a glance; every
action has felt feedback (visual now, audio when s6 lands); nothing clips,
overlaps, or lies; and the difficulty curve is fair on a real phone. Items
stay open until verified, not until implemented.

## Iteration 1 (2026-08-01)

Fixed:
- Within-tolerance feedback: aligned outer segments get a bright rim — the
  endgame was unreadable without it (biggest playability gap found).
- ALIGNED k/N counter in the HUD (numeric companion to the rims).
- Back chip (‹) in-game: there was NO way to leave a level mid-run.
  Tap-vs-drag discrimination so rotating near the chip doesn't exit.
- NEW BEST! celebration on the won screen (wobble, gold); BEST shown otherwise.
- Telegraph bar: 3px → 7-9px with a soft glow; was nearly invisible.
- Inner pie hairline spokes: target boundaries are goal posts, now visible.
- Level cards: honest puzzle preview (mini target pie — levels are
  deterministic so the preview IS the level); dashed "?" for Endless.
- Card titles clipped into the preview pies → constrained maxWidth.

## Open backlog (ranked, revisit every iteration)

1. Audio (s6): catch blip pitch-ramped by consecutive catches, wrong-catch
   thud, lock-in clicks (one per segment!), win chord, mute toggle. In this
   genre juice is the product — biggest remaining gap.
2. Juice pass: ~50ms hit-stop on correct catch, subtle screen shake on
   shrink, drop trail while falling, segment "liquid" wobble on grow.
3. Won-screen layout: text block overlaps the wheel arrow on short
   viewports — verify at 320×568.
4. Safe-area insets (notches) — matters at Capacitor stage; telegraph bar
   sits at y=0 which a notch could swallow in standalone/fullscreen.
5. Colorblind readability: 8 hues are distinct but untested for deutan/
   protan; consider a symbols-on-segments accessibility toggle.
6. Difficulty tuning needs HUMAN data — autopilot clears everything but
   par-vs-real-play gaps on l8-l10 are guesses. Ask the user after play.
7. Endless: surface board number + a session tally (boards cleared).
8. Settings surface (mute, maybe left-hand mode) once audio exists.
9. Rotation feel on a REAL phone (latency, 1:1 mapping, inertia damping) —
   cannot be verified headlessly; needs the user's thumb.

## Honest status

Not yet "perfectly designed". The loop continues until the backlog's
player-facing items are done and the ones needing human hands (6, 9) have
real feedback — those two can only be closed by the user playing.
