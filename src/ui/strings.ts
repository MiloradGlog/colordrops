// Keyed strings table from day one (game-universals). English only for now.

export const strings = {
  title: "COLORFALL",
  tagline: "hold & drag to turn · catch drops with their color",
  drops: (n: number) => `DROPS ${n}`,
  par: (n: number) => `PAR ${n}`,
  best: (n: number) => `BEST ${n}`,
  locked: "LOCKED!",
  newBest: "NEW BEST!",
  aligned: (k: number, n: number) => `ALIGNED ${k}/${n}`,
  tapSelect: "tap for level select",
  tapNextBoard: "tap for next board",
  tapPlay: "TAP TO PLAY",
  bestBoard: (n: number) => `BEST BOARD · ${n} drops`,
  result: (drops: number, par: number) => `${drops} drops · par ${par}`,
  session: (n: number) => `${n} board${n === 1 ? "" : "s"} cleared this session`,
} as const;
