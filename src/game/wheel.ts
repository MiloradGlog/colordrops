// The wheel: all pie geometry, in TURNS (1 turn = full circle), wheel space
// (rotation θ is applied only when rendering / resolving the catch angle).
//
// Inner disc = target shares, laid out from turn 0 in color order.
// Outer ring = current shares, each segment CENTERED on its inner segment's
// angular center (the user's core mental image). Because targets sum to 1,
// outer edges meet exactly at the inner boundaries when every share matches —
// the ring closes seamlessly, which is what the lock animation celebrates.

import type { Rng } from "../engine/rng";

export interface Extent {
  start: number; // unwrapped turns — may be < 0 or > 1 near the wrap seam
  end: number; // invariant: start <= end
}

/** Seeded target pie: n shares, each ≥ minShare, summing to exactly 1. */
export function genTargets(rng: Rng, n: number, minShare: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.1 + rng.next(); // floor avoids degenerate near-zero weights
    weights.push(w);
    sum += w;
  }
  const rem = 1 - n * minShare;
  const shares = weights.map((w) => minShare + (rem * w) / sum);
  const total = shares.reduce((a, b) => a + b, 0);
  return shares.map((s) => s / total);
}

/** Inner boundaries b_0..b_n (turns, b_0 = 0, b_n = 1). */
export function boundaries(targets: readonly number[]): number[] {
  const b = [0];
  let acc = 0;
  for (const t of targets) {
    acc += t;
    b.push(acc);
  }
  b[b.length - 1] = 1;
  return b;
}

/** Angular center of each inner segment (turns). */
export function centers(targets: readonly number[]): number[] {
  const b = boundaries(targets);
  const c: number[] = [];
  for (let i = 0; i < targets.length; i++) c.push((b[i]! + b[i + 1]!) / 2);
  return c;
}

/** Each outer segment's ideal extent: its share centered on its inner center. */
export function idealExtents(cs: readonly number[], shares: readonly number[]): Extent[] {
  return cs.map((c, i) => ({ start: c - shares[i]! / 2, end: c + shares[i]! / 2 }));
}

/**
 * Drawn extents: neighbors that overlap get split at the overlap midpoint —
 * liquid pressing against liquid. Undersized regions leave dark gaps.
 * Cyclic: the last/first pair is compared across the wrap seam.
 */
export function drawnExtents(ideal: readonly Extent[]): Extent[] {
  const n = ideal.length;
  const out: Extent[] = ideal.map((e) => ({ ...e }));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const r = ideal[i]!.end;
    const l = ideal[j]!.start + (j === 0 ? 1 : 0);
    if (r > l) {
      const m = (r + l) / 2;
      out[i]!.end = m;
      out[j]!.start = m - (j === 0 ? 1 : 0);
    }
  }
  for (const e of out) {
    if (e.start > e.end) e.start = e.end = (e.start + e.end) / 2; // fully squeezed
  }
  return out;
}

/** Which segment's drawn extent contains the wheel-space angle? -1 = gap. */
export function segmentAt(extents: readonly Extent[], angleTurns: number): number {
  for (let i = 0; i < extents.length; i++) {
    const e = extents[i]!;
    const w = e.end - e.start;
    if (w <= 0) continue;
    const rel = mod1(angleTurns - e.start);
    if (rel < w) return i;
  }
  return -1;
}

/** Win: every current share within ε of its target. */
export function isAligned(
  shares: readonly number[],
  targets: readonly number[],
  epsilon: number,
): boolean {
  for (let i = 0; i < shares.length; i++) {
    if (Math.abs(shares[i]! - targets[i]!) > epsilon) return false;
  }
  return true;
}

export function mod1(x: number): number {
  return ((x % 1) + 1) % 1;
}
