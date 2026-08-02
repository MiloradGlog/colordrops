// spec.md → Structure. Handcrafted, deterministic levels: fixed target pie,
// fixed looping drop sequence — same puzzle every attempt, every player.
// Difficulty levers per level: color count, fall speed, drop interval,
// tolerance, wrong-catch rule, sequence nastiness (noise & overshoot traps).

import { Rng } from "../engine/rng";
import { genTargets } from "./wheel";

export type WrongCatch = "none" | "shrinkDrop" | "shrinkSelf";

export interface RunConfig {
  id: string;
  name: string;
  label: "Easy" | "Normal" | "Hard" | "Harder" | "Insane" | "Endless";
  targets: number[];
  epsilon: number;
  growth: number;
  intervalS: number;
  gravity: number; // px/s² at the 800px reference viewport
  wrongCatch: WrongCatch;
  sequence: number[] | null; // fixed looping choreography; null = endless RNG
  seed: number; // used only when sequence is null
  hint?: string; // shown until the first catch (teaching levels)
  intro?: string; // banner on level start (rule changes)
}

const G_BASE = 0.16; // growth = G_BASE / colorCount unless a level overrides

function level(
  id: string,
  name: string,
  label: RunConfig["label"],
  targets: number[],
  opts: Partial<RunConfig> & { sequence: number[] },
): RunConfig {
  const total = targets.reduce((a, b) => a + b, 0);
  return {
    id,
    name,
    label,
    targets: targets.map((t) => t / total),
    epsilon: 0.03,
    growth: G_BASE / targets.length,
    intervalS: 2.4,
    gravity: 1400,
    wrongCatch: "none",
    seed: 0,
    ...opts,
  };
}

export const LEVELS: RunConfig[] = [
  level("l1", "First Drops", "Easy", [0.4, 0.25, 0.2, 0.15], {
    epsilon: 0.035,
    intervalS: 2.6,
    hint: "The rings turn together — grow colors by catching drops",
    sequence: [0, 0, 1, 0, 2, 1, 0, 1, 3, 0, 1, 2, 0, 1, 0, 3],
  }),
  level("l2", "Balance", "Easy", [0.35, 0.3, 0.2, 0.15], {
    epsilon: 0.03,
    intervalS: 2.5,
    gravity: 1470,
    sequence: [0, 1, 1, 0, 2, 1, 0, 3, 1, 0, 2, 1, 3, 0, 1, 0, 2, 1],
  }),
  level("l3", "Slivers", "Normal", [0.3, 0.25, 0.2, 0.15, 0.1], {
    epsilon: 0.028,
    intervalS: 2.3,
    gravity: 1540,
    sequence: [0, 1, 2, 0, 1, 4, 0, 2, 1, 3, 0, 1, 2, 4, 1, 0, 3, 2, 0, 1],
  }),
  level("l4", "Now It Shrinks", "Normal", [0.4, 0.3, 0.18, 0.12], {
    epsilon: 0.028,
    intervalS: 2.3,
    gravity: 1610,
    wrongCatch: "shrinkSelf",
    intro: "Wrong catches now shrink!",
    sequence: [0, 1, 0, 2, 1, 0, 3, 1, 0, 2, 1, 0, 1, 3, 0, 1, 2, 0],
  }),
  level("l5", "Noise", "Normal", [0.32, 0.26, 0.18, 0.14, 0.1], {
    epsilon: 0.025,
    intervalS: 2.1,
    gravity: 1680,
    wrongCatch: "shrinkSelf",
    sequence: [0, 4, 1, 2, 0, 3, 1, 4, 0, 2, 1, 3, 2, 0, 4, 1, 0, 3, 1, 2, 4, 0],
  }),
  level("l6", "Six Pack", "Hard", [0.28, 0.22, 0.18, 0.12, 0.11, 0.09], {
    epsilon: 0.024,
    intervalS: 2.0,
    gravity: 1750,
    wrongCatch: "shrinkSelf",
    sequence: [0, 1, 2, 5, 0, 3, 1, 4, 2, 0, 5, 1, 3, 0, 2, 4, 1, 0, 5, 2, 3, 1, 4, 0],
  }),
  level("l7", "Thin Ice", "Hard", [0.3, 0.24, 0.16, 0.12, 0.1, 0.08], {
    epsilon: 0.022,
    intervalS: 1.8,
    gravity: 1890,
    wrongCatch: "shrinkSelf",
    sequence: [0, 1, 5, 2, 0, 4, 1, 3, 0, 2, 5, 1, 0, 3, 2, 4, 1, 0, 2, 5, 1, 3, 0, 4],
  }),
  level("l8", "Overshoot", "Harder", [0.26, 0.2, 0.16, 0.12, 0.1, 0.09, 0.07], {
    epsilon: 0.02,
    intervalS: 1.7,
    gravity: 1960,
    wrongCatch: "shrinkSelf",
    // trap choreography: long runs of one color bait overshoot
    sequence: [0, 0, 0, 1, 2, 1, 1, 3, 0, 4, 2, 2, 5, 1, 0, 6, 3, 1, 2, 0, 5, 4, 1, 6, 2, 0],
  }),
  level("l9", "Sliver Storm", "Harder", [0.22, 0.18, 0.15, 0.12, 0.1, 0.09, 0.08, 0.06], {
    epsilon: 0.018,
    intervalS: 1.5,
    gravity: 2100,
    wrongCatch: "shrinkSelf",
    sequence: [0, 1, 2, 3, 0, 4, 1, 5, 2, 6, 0, 7, 1, 3, 2, 4, 0, 5, 1, 6, 2, 7, 3, 0, 4, 1, 5, 2],
  }),
  level("l10", "Full Spectrum", "Insane", [0.24, 0.19, 0.14, 0.11, 0.1, 0.09, 0.07, 0.06], {
    epsilon: 0.015,
    intervalS: 1.35,
    gravity: 2240,
    wrongCatch: "shrinkSelf",
    sequence: [0, 1, 0, 2, 3, 1, 4, 0, 5, 2, 1, 6, 0, 7, 3, 1, 2, 0, 4, 5, 1, 0, 6, 2, 3, 7, 1, 0, 2, 4],
  }),
];

/** Endless side mode: random board each time, medium settings. */
export function endlessConfig(board: number): RunConfig {
  const seed = (0xc0104d + board * 7919) >>> 0;
  const rng = new Rng(seed);
  const n = 5;
  return {
    id: "endless",
    name: `Endless · board ${board}`,
    label: "Endless",
    targets: genTargets(rng, n, 0.08),
    epsilon: 0.025,
    growth: G_BASE / n,
    intervalS: 2.0,
    gravity: 1750,
    wrongCatch: "shrinkSelf",
    sequence: null,
    seed,
  };
}
