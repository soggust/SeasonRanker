// Bundled by build-comps.mjs (esbuild) so the script reads each season's rows, stats and default
// ranking exactly the way the app does. prefill.ts runs first and fills DATA from globalThis.__DATA,
// since unit-scoring reads the rows as soon as it loads.
import './prefill';
import { DATA, withSeason } from '@ranker/engine/data';
import { DEFAULT_SPORT_SETTINGS, SKILL_UNITS, defaultRanking, rebuildUnits } from '@ranker/engine/unit-scoring';
import { defaultMin } from '@ranker/engine/playing-time';
import { SKILL_STATS, headlineStats, presetWeights, statGroup, unitStat } from '@sport/positions';

// (season: the season the files are, as the app loads it: dataSeason says so while its rows are built, so
// the NFL blends no preseason grades into a finished season's)
export function unitsFor(data: object, season?: number) {
  Object.assign(DATA, data);
  if (season === undefined) rebuildUnits();
  else withSeason(season, data as never, rebuildUnits);
  return SKILL_UNITS;
}

// The loaded season's tabs as the grid first shows each one, in the grid's order (the engine's
// gridRankings, the one the card's Career line ranks the season being played with). Call after unitsFor
// (the season in DATA).
export { gridRankings } from '@ranker/engine/skill-rankings/grid-rankings';

export { SKILL_STATS, DEFAULT_SPORT_SETTINGS, defaultMin, defaultRanking, headlineStats, presetWeights, statGroup, unitStat };
