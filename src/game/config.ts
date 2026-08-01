// Shared palette + scoring helpers. Per-level tuning lives in levels.ts.

export const PALETTE = [
  "#ff5a5f", // red
  "#ffb400", // amber
  "#2ecc71", // green
  "#29a8ff", // blue
  "#a66bff", // purple
  "#ff7ac8", // pink
  "#00d2c6", // teal
  "#ffe14d", // yellow
] as const;

/** Theoretical minimum catches: every catch adds `growth` toward the deficit. */
export function par(targets: readonly number[], startShare: number, growth: number): number {
  let deficit = 0;
  for (const t of targets) deficit += Math.max(0, t - startShare);
  return Math.max(1, Math.ceil(deficit / growth));
}
