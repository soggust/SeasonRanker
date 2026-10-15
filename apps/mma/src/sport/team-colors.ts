// MMA's one team look (libs/ranker/src/engine/team-look.ts): there are no team colors in fighting, so every
// fighter's flag (his country's, from ESPN) sits on the same dark canvas-red chip. scripts/build-team-looks.mjs
// writes it into libs/ranker/src/engine/team-looks/mma.json (npm run team-looks after changing it).
export const DEFAULT_LOOK = {
  face: '#3a1416',
  rim: '#7a3a3c',
  // (a side's color: the board's light grey, Compare's palette takes over)
  accent: '#c9b8b4',
};
