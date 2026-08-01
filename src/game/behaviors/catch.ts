// spec.md → Behaviors → catching. The only way shares ever change.
// Grow the caught color by `growth`; shrink every other color proportionally
// so the pie always sums to exactly 1. Pure — the sim and tests both call it.

export function applyCatch(shares: readonly number[], caught: number, growth: number): number[] {
  const v = shares[caught];
  if (v === undefined) throw new Error(`no color ${caught}`);
  const rest = 1 - v;
  const g = Math.min(growth, rest * 0.95); // a color can never devour the pie
  const out = shares.map((s, i) => (i === caught ? s + g : s - (g * s) / rest));
  const total = out.reduce((a, b) => a + b, 0);
  return out.map((s) => s / total); // renormalize away float drift
}
