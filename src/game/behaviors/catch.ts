// spec.md → Catch economy. The only ways shares ever change.
// Redistribution is always proportional across all other segments (decided
// in spec.md) so the ring visibly "breathes" and the sum stays exactly 1.
// Pure — the sim and tests both call these.

/** Correct catch: grow the caught color by `growth`, everyone else shrinks. */
export function applyCatch(shares: readonly number[], caught: number, growth: number): number[] {
  const v = shares[caught];
  if (v === undefined) throw new Error(`no color ${caught}`);
  const rest = 1 - v;
  const g = Math.min(growth, rest * 0.95); // a color can never devour the pie
  const out = shares.map((s, i) => (i === caught ? s + g : s - (g * s) / rest));
  const total = out.reduce((a, b) => a + b, 0);
  return out.map((s) => s / total); // renormalize away float drift
}

const MIN_SHARE = 0.01; // a segment may become a sliver but never vanish

/** Shrink-tier wrong catch: shrink `colorIdx` by `amount`, others grow. */
export function applyShrink(shares: readonly number[], colorIdx: number, amount: number): number[] {
  const v = shares[colorIdx];
  if (v === undefined) throw new Error(`no color ${colorIdx}`);
  const g = Math.min(amount, v - MIN_SHARE);
  if (g <= 0) return [...shares];
  const rest = 1 - v;
  const out = shares.map((s, i) => (i === colorIdx ? s - g : s + (g * s) / rest));
  const total = out.reduce((a, b) => a + b, 0);
  return out.map((s) => s / total);
}
