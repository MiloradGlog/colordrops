// Layer 4: behaviors as trees — conditions at the branches, EFFECTS AT THE
// LEAVES. Shared behaviors are modules many entities reference; per-scene
// overrides wrap them. Keep one behavior per file under src/game/behaviors/
// so the file tree mirrors the design tree in gimmegame/spec.md.

export type Status = "running" | "done" | "failed";

export interface Behavior<E> {
  tick(entity: E, dt: number): Status;
}

/** Branch: run children in order until one fails. */
export function sequence<E>(...children: Behavior<E>[]): Behavior<E> {
  return {
    tick(e, dt) {
      for (const c of children) {
        const s = c.tick(e, dt);
        if (s !== "done") return s;
      }
      return "done";
    },
  };
}

/** Branch: first child that doesn't fail wins. */
export function select<E>(...children: Behavior<E>[]): Behavior<E> {
  return {
    tick(e, dt) {
      for (const c of children) {
        const s = c.tick(e, dt);
        if (s !== "failed") return s;
      }
      return "failed";
    },
  };
}

/** Branch: gate a subtree behind a condition. */
export function when<E>(cond: (e: E) => boolean, child: Behavior<E>): Behavior<E> {
  return { tick: (e, dt) => (cond(e) ? child.tick(e, dt) : "failed") };
}

/** Leaf: an effect. This is where the game actually happens. */
export function effect<E>(fn: (e: E, dt: number) => void): Behavior<E> {
  return {
    tick(e, dt) {
      fn(e, dt);
      return "done";
    },
  };
}
