// Keyed strings table from day one (game-universals). English only for now.

export const strings = {
  title: "COLORDROPS",
  tagline: "hold & drag to turn · catch drops with their color",
  drops: (n: number) => `DROPS ${n}`,
  par: (n: number) => `PAR ${n}`,
  best: (n: number) => `BEST ${n}`,
  locked: "LOCKED!",
  tapSelect: "tap for level select",
  tapNextBoard: "tap for next board",
  result: (drops: number, par: number) => `${drops} drops · par ${par}`,
} as const;
