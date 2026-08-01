// Seeded RNG (mulberry32). The sim must use THIS, never Math.random(), so that
// replays, deterministic combat, and multiplayer stay possible for free.

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(minIncl: number, maxExcl: number): number {
    return minIncl + Math.floor(this.next() * (maxExcl - minIncl));
  }

  pick<T>(arr: readonly T[]): T {
    const v = arr[this.int(0, arr.length)];
    if (v === undefined) throw new Error("pick from empty array");
    return v;
  }

  /** Fisher–Yates, in place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      const a = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = a;
    }
    return arr;
  }
}
