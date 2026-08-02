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

## Iteration 2 (2026-08-01)

Fixed:
- Audio (s6): zero-asset procedural WebAudio synth — catch blip pitch-ramps
  a semitone per consecutive catch (streak resets on wrong catch), teaching
  plop vs shrink thud, one mechanical click per segment during the lock
  sequence, rising chord on the fuse. Mute chip on select screen, persisted;
  verified across reload.
- Juice: 50ms hit-stop on correct catch; screen shake on shrink wrong
  catches; fading trail behind the falling drop.
- Ads stub (s6): interstitial slot on every 3rd level completion (endless
  excluded) — machine-verified to fire exactly at 3/6/9 across 11 wins.
- Won screen text block now centers in the space above the wheel — no more
  overlap on short viewports (was broken at 320×568).

Caveat: sound *design* (are the blips pleasant? levels balanced?) can't be
verified headlessly — needs the user's ears. Flagged in backlog.

## Iteration 3 (2026-08-02)

Fixed:
- Liquid feel: displayShares now follow an underdamped spring (slosh +
  overshoot on grow/shrink) instead of exponential ease.
- Colorblind-assist symbols mode (◆ chip on select, persisted): a distinct
  shape per color stamped on outer segments, inner slices, the forming
  droplet, and the falling drop — drop→segment pairing no longer depends on
  hue. Verified toggle persistence + screenshot.
- Endless won screen shows a session tally (boards cleared).

## Iteration 4 (2026-08-02)

Fixed:
- prefers-reduced-motion respected: shake and hit-stop disabled, share
  spring overdamped (no wobble) when the OS asks for less motion.

## Remaining — ALL human-feedback-gated

1. Difficulty tuning: par-vs-real-play gaps on l8–l10 are authored guesses;
   needs the user's runs.
2. Sound design taste (blip timbre, levels, chord) — needs human ears.
3. Rotation feel on a real phone (latency, 1:1 rim mapping, inertia
   damping) — needs the user's thumb on glass.
4. Safe-area insets — deferred to the Capacitor ship stage (s5-ship) where
   fullscreen/notch actually applies; in-browser play is unaffected.

## Design correction from the designer (2026-08-02)

User feedback: wrong catches must shrink THE SEGMENT THAT GRABS the drop
(shrinkSelf), not the drop's color. Flipped all shrink-tier levels +
endless, updated spec + autopilot (weaponize = park an overgrown color to
grab unwanted drops). All 10 levels re-verified winnable; autopilot scores
actually improved on l9/l10/endless — the rule is more controllable.

## Drop-birth fluidity pass (designer request, 2026-08-02)

"Roughly what I wanted... but more fluid, more clear." Rebuilt the birth:
- Bar drains toward center with a meniscus gradient; its volume flows into
  a pendant bead (∛ growth), which sags, necks, and pinches off — satellite
  droplet + surface-tension recoil bead at detach.
- Freed drops ring with a decaying prolate↔oblate oscillation on top of
  velocity stretch; specular highlight on the bead.
- Clarity: dotted guide line from falling drop to the catch point; the
  catch marker tints and glows in the incoming drop's color.
- Correct catches splash tangentially along the rim.
Frame-by-frame captures verified the neck/pinch renders correctly.

## Honest status — loop closed 2026-08-02

Everything machine-verifiable is done and verified (28 automated checks).
"Perfectly designed" cannot be honestly claimed by an autopilot: the three
open items above are taste and feel, and only the player can close them.
The polish loop stops here; it resumes the moment play feedback arrives.
