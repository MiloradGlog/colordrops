// spec.md → Behaviors → wheel. Drag anywhere turns the wheel 1:1 (grabbing
// the rim); arrow keys for desktop dev; light inertia with heavy damping on
// release. The behavior tree shape: conditions at branches, effects at leaves.

import { select, when, effect } from "../behavior";
import type { Input } from "../../engine/input";

export interface Rotatable {
  theta: number; // radians, applied to the whole wheel
  omega: number; // rad/s, inertia after release
  radius: number; // px — converts drag pixels to radians
  input: Input;
  locked: boolean; // true while the lock/win sequence owns the wheel
}

const KEY_SPEED = 2.8; // rad/s
const DAMPING = 0.000001; // omega multiplier per second (heavy, near-instant)

// select: dragging and released are mutually exclusive — first branch that
// applies wins the tick.
export const rotate = select<Rotatable>(
  when(
    (w) => !w.locked && w.input.pointer.down,
    effect((w, dt) => {
      const dx = w.input.consumeDragDX();
      const dTheta = dx / w.radius;
      w.theta += dTheta;
      // smoothed velocity for release inertia — last-tick spikes feel twitchy
      const inst = dt > 0 ? dTheta / dt : 0;
      w.omega += (inst - w.omega) * Math.min(1, dt * 20);
      w.omega = Math.max(-6, Math.min(6, w.omega));
    }),
  ),
  when(
    (w) => !w.locked && !w.input.pointer.down,
    effect((w, dt) => {
      w.input.consumeDragDX(); // discard stray deltas
      w.theta += w.omega * dt;
      w.omega *= Math.pow(DAMPING, dt);
      w.theta += w.input.axis() * KEY_SPEED * dt;
    }),
  ),
);
