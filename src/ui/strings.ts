// Keyed strings table from day one (game-universals). All-caps mono is the
// Instrument voice. English only for now.

export const strings = {
  title: "COLORFALL",
  subtitle: "THE CIRCLE ALIGNMENT GAME",
  tagline: "HOLD + DRAG TO ROTATE",
  tapPlay: "TAP TO PLAY",
  drops: (n: number) => `DROPS ${n}`,
  par: (n: number) => `PAR ${n}`,
  best: (n: number) => `BEST ${n}`,
  locked: "LOCKED",
  newBest: "NEW BEST",
  tapSelect: "TAP FOR LEVEL SELECT",
  tapNextBoard: "TAP FOR NEXT BOARD",
  retryAd: "RETRY BOARD · WATCH AD",
  session: (drops: number, boards: number) =>
    `SESSION ${drops} DROPS / ${boards} BOARD${boards === 1 ? "" : "S"}`,
} as const;
