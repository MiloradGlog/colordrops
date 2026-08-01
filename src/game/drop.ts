// spec.md → Behaviors → drop. Lifecycle:
// telegraph → forming → falling → (absorbed | splashed | missed) → gone.
// Motion is honest: gravity integrated in the fixed-step sim; the squash/
// stretch and wobble are volume-preserving presentation derived from velocity.
// Contact resolution (who caught it) is a relation, so the scene mediates it.

export type DropPhase =
  | "telegraph"
  | "forming"
  | "falling"
  | "absorbed"
  | "splashed"
  | "missed"
  | "gone";

export const TELEGRAPH_S = 0.55;
export const FORMING_S = 0.65;
export const ABSORB_S = 0.4;
export const SPLASH_S = 0.5;

export interface Drop {
  colorIdx: number;
  phase: DropPhase;
  t: number; // seconds in current phase
  y: number; // center y, px
  vy: number; // px/s
  r: number; // rest radius, px
  behind: boolean; // fell through a gap; renders behind the wheel
}

export function makeDrop(colorIdx: number, radius: number): Drop {
  return { colorIdx, phase: "telegraph", t: 0, y: 0, vy: 0, r: radius, behind: false };
}

/** Advance timers/motion. Returns true when the drop just reached contactY while falling. */
export function updateDrop(d: Drop, dt: number, gravity: number, contactY: number): boolean {
  d.t += dt;
  switch (d.phase) {
    case "telegraph":
      if (d.t >= TELEGRAPH_S) enter(d, "forming");
      return false;
    case "forming":
      d.y = d.r * (0.4 + 0.6 * Math.min(1, d.t / FORMING_S)); // bulges down as it fills
      if (d.t >= FORMING_S) {
        enter(d, "falling");
        d.vy = 0;
      }
      return false;
    case "falling": {
      d.vy += gravity * dt;
      d.y += d.vy * dt;
      return !d.behind && d.y + d.r >= contactY;
    }
    case "absorbed":
      if (d.t >= ABSORB_S) enter(d, "gone");
      return false;
    case "splashed":
      if (d.t >= SPLASH_S) enter(d, "gone");
      return false;
    case "missed":
      d.vy += gravity * dt;
      d.y += d.vy * dt;
      return false;
    case "gone":
      return false;
  }
}

export function enter(d: Drop, phase: DropPhase): void {
  d.phase = phase;
  d.t = 0;
}

/** Volume-preserving squash/stretch from velocity: fast fall = tall & thin. */
export function stretch(d: Drop): { sx: number; sy: number } {
  const sy = 1 + Math.min(0.35, Math.abs(d.vy) / 2400);
  return { sx: 1 / sy, sy };
}
