// spec.md → Behaviors → wheel. One verb: horizontal drag turns the wheel.
// Vertical finger motion is ignored entirely — only left/right exists.
//
// The gain is screen-relative and velocity-adaptive (good mouse-acceleration
// feel): a slow, deliberate finger gets GAIN_SLOW — one full screen-width of
// drag is exactly one full turn, so 360° is always reachable left-to-right —
// while a fast flick ramps smoothly up to GAIN_FAST for whip-speed spins.
// Releasing mid-flick hands the wheel its smoothed angular velocity, braked
// exponentially; touching down again grabs it dead, instantly.

import { select, when, effect } from "../behavior";
import type { Input } from "../../engine/input";

export interface Rotatable {
  theta: number; // radians, applied to the whole wheel
  omega: number; // rad/s, release inertia
  speed: number; // smoothed |finger speed| px/s — adaptive-gain state
  width: number; // px, screen width — gain is turns-per-screen-width
  input: Input;
  locked: boolean; // true while the lock/win sequence owns the wheel
}

const TAU = Math.PI * 2;
const KEY_SPEED = 3.5; // rad/s, desktop arrows
const GAIN_SLOW = 1.0; // turns per screen-width at precision speed
const GAIN_FAST = 2.2; // turns per screen-width at flick speed
const V0 = 140; // px/s — at or below: full precision
const V1 = 1500; // px/s — at or above: full speed
const DAMP = 0.004; // omega multiplier per second after release
const OMEGA_MAX = 14; // rad/s cap on release spin

function smooth(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

// select: dragging and released are mutually exclusive — first branch that
// applies wins the tick.
export const rotate = select<Rotatable>(
  when(
    (w) => !w.locked && w.input.pointer.down,
    effect((w, dt) => {
      const dx = w.input.consumeDragDX();
      const inst = dt > 0 ? Math.abs(dx) / dt : 0;
      w.speed += (inst - w.speed) * Math.min(1, dt * 14);
      const k = smooth((w.speed - V0) / (V1 - V0));
      const gain = (TAU / Math.max(1, w.width)) * (GAIN_SLOW + (GAIN_FAST - GAIN_SLOW) * k);
      const dTheta = dx * gain;
      w.theta += dTheta;
      // smoothed velocity for release inertia — last-tick spikes feel twitchy
      const instOmega = dt > 0 ? dTheta / dt : 0;
      w.omega += (instOmega - w.omega) * Math.min(1, dt * 20);
      w.omega = Math.max(-OMEGA_MAX, Math.min(OMEGA_MAX, w.omega));
    }),
  ),
  when(
    (w) => !w.locked && !w.input.pointer.down,
    effect((w, dt) => {
      w.input.consumeDragDX(); // discard stray deltas
      w.theta += w.omega * dt;
      w.omega *= Math.pow(DAMP, dt);
      w.speed *= Math.pow(0.01, dt);
      w.theta += w.input.axis() * KEY_SPEED * dt;
    }),
  ),
);
