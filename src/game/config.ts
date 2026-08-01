// Level curves and palette — every difficulty knob from spec.md's Structure
// section lives here and nowhere else.

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

export interface LevelConfig {
  level: number;
  seed: number;
  n: number; // color count
  intervalS: number; // seconds between drop telegraphs
  gravity: number; // px/s², scaled to a 800px-tall reference viewport
  epsilon: number; // win tolerance, as a fraction (2.5pp = 0.025)
  growth: number; // share gained per catch, as a fraction
  minShare: number; // smallest target share the generator may deal
}

export function levelConfig(level: number, seed: number): LevelConfig {
  const n = Math.min(8, 4 + Math.floor((level - 1) / 3));
  const intervalS = Math.max(1.2, 2.6 - 0.35 * Math.log2(level));
  const gravity = Math.min(2600, 1400 * Math.pow(1.08, level - 1));
  const epsilon = Math.max(0.015, 0.025 - 0.001 * (level - 1));
  const growth = 0.16 / n;
  return { level, seed, n, intervalS, gravity, epsilon, growth, minShare: 0.08 };
}

/** Theoretical minimum catches: every catch adds `growth` toward the deficit. */
export function par(targets: readonly number[], startShare: number, growth: number): number {
  let deficit = 0;
  for (const t of targets) deficit += Math.max(0, t - startShare);
  return Math.max(1, Math.ceil(deficit / growth));
}
