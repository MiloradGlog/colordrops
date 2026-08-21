// The Instrument design language (designer handoff, 2026-08-15):
// cool graphite ground, matte muted inks, 1px hairlines, all-mono type,
// zero glow on UI — only the liquid may glow. Every color token lives here.

// Muted ink palette. Indices 0-4 are the designer's five; 5-7 extend the
// family for the hidden 6-8 color levels. Index ↔ symbol pairing is fixed
// by the colorblind mode.
export const PALETTE = [
  "#b8433c", // red
  "#c9932f", // amber (the honey)
  "#3f8f5c", // green
  "#3d78b8", // blue
  "#75589f", // purple
  "#b05f8c", // pink (extension)
  "#3e8f89", // teal (extension)
  "#b3a03a", // olive-yellow (extension)
] as const;

export const UI = {
  bg: "#101214",
  panel: "#0c0e10",
  track: "#1a1d20",
  text: "#dfe3e6",
  muted: "#6d757c",
  good: "#3f8f5c", // NEW BEST tag; over-par stays neutral grey, never red
  hair: (a: number) => `rgba(223,227,230,${a})`,
} as const;

export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

/** Mono type with optional letter-spacing (canvas support is best-effort). */
export function setType(
  ctx: CanvasRenderingContext2D,
  weight: number,
  sizePx: number,
  lsPx = 0,
): void {
  ctx.font = `${weight} ${sizePx}px ${MONO}`;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${lsPx}px`;
  } catch {
    // older engines: spacing is a nicety, not a dependency
  }
}

/** Theoretical minimum catches: every catch adds `growth` toward the deficit. */
export function par(targets: readonly number[], startShare: number, growth: number): number {
  let deficit = 0;
  for (const t of targets) deficit += Math.max(0, t - startShare);
  return Math.max(1, Math.ceil(deficit / growth));
}
