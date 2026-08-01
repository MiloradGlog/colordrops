// Keyed strings table from day one (game-universals). English only for now.

export const strings = {
  level: (n: number) => `LEVEL ${n}`,
  drops: (n: number) => `DROPS ${n}`,
  par: (n: number) => `PAR ${n}`,
  best: (n: number) => `BEST ${n}`,
  locked: "LOCKED!",
  tapNext: "tap for next level",
  result: (drops: number, par: number) => `${drops} drops · par ${par}`,
} as const;
