// Bundled by build-comps.mjs (esbuild) so the script reads each season's rows, stats and default
// ranking exactly the way the app does. prefill.ts runs first and fills DATA from globalThis.__DATA,
// since unit-scoring reads the rows as soon as it loads.
import './prefill';
import { merge, of } from 'rxjs';
import { DATA, withSeason } from '@ranker/engine/data';
import { DEFAULT_SPORT_SETTINGS, SKILL_UNITS, defaultRanking, rebuildUnits, statIsEmpty } from '@ranker/engine/unit-scoring';
import { defaultMin } from '@ranker/engine/playing-time';
import { DEFAULT_SETTINGS } from '@ranker/engine/position.service';
import { connectRosterGrades } from '@ranker/engine/roster-grades';
import type { EngineHost } from '@ranker/engine/sport';
import { TabRanker } from '@ranker/engine/skill-rankings/tab-ranker';
import { StatReader } from '@ranker/engine/stat-reader';
import { SPORT } from '@sport/sport';
import { SKILL_STATS, SkillPlayer, SkillPosition, headlineStats, presetWeights, skillGroups, statGroup, unitStat } from '@sport/positions';

// (season: the season the files are, as the app loads it: dataSeason says so while its rows are built, so
// the NFL blends no preseason grades into a finished season's)
export function unitsFor(data: object, season?: number) {
  Object.assign(DATA, data);
  if (season === undefined) rebuildUnits();
  else withSeason(season, data as never, rebuildUnits);
  return SKILL_UNITS;
}

// The loaded season's tabs as the grid first shows each one (the page opened on that tab, every setting
// and slider at its default): its list (the rows at the default Min Games) in the grid's order. The grid's
// own code (TabRanker, StatReader, the table's season), so it counts what the grid counts: combined pairs
// as their totals (the Combine setting's default), no Recent for a finished season, and the grades from
// other tabs (SPORT.connect, the roster grades), from those tabs' default rankings, as the engine's
// rankedUnits gives them before they're opened. Call after unitsFor (the season in DATA).
export function gridRankings(season: number): Record<string, SkillPlayer[]> {
  return withSeason(season, { ...DATA }, () => ranked(season));
}

function ranked(season: number): Record<string, SkillPlayer[]> {
  const settings = DEFAULT_SETTINGS;
  const weightsOf = (position: SkillPosition) => presetWeights(position, 'default');
  // (position.service's rankedUnits for a tab not opened: its default ranking, leaned by an emphasis)
  const host: EngineHost = {
    settings$: of(settings.sport),
    rankedUnits: (position, emphasis) => {
      const tab = position as SkillPosition;
      const weights = weightsOf(tab);
      const leaned = emphasis ? Object.fromEntries(Object.entries(weights).map(([key, w]) => [key, (w as number) * (emphasis[key] ?? 1)])) : weights;
      return of(defaultRanking(tab, leaned, SKILL_UNITS, settings.sport, defaultMin(SKILL_UNITS, tab), settings.combineStats));
    },
    rows: () => SKILL_UNITS,
  };
  // (the grades set as they're worked out: every stream emits at once, then completes)
  merge(SPORT.connect?.(host) ?? of(null), connectRosterGrades(host)).subscribe();

  const out: Record<string, SkillPlayer[]> = {};
  for (const position of Object.keys(SKILL_STATS) as SkillPosition[]) {
    const positions = {
      settings,
      statHiddenState: {},
      skillHiddenGroups: () => ({}),
      getWeights: weightsOf,
      isStatHidden: () => false,
    };
    const table = { position, stats: SKILL_STATS[position], groups: skillGroups(position), hidden: {}, weights: weightsOf(position) };
    const ranker = new TabRanker(positions as never, { firstSeasons: async () => ({}) } as never, () => table, () => {});
    const list = ranker.listed(SKILL_UNITS, season, position);
    const reader = new StatReader({
      position,
      settings,
      rows: SKILL_UNITS,
      list,
      tableSeason: true,
      season,
      empty: (key) => statIsEmpty(position, key),
      weights: ranker.mixWeights(position),
    });
    out[position] = ranker.ranked(reader, list, position, SKILL_UNITS);
  }
  return out;
}

export { SKILL_STATS, DEFAULT_SPORT_SETTINGS, defaultMin, defaultRanking, headlineStats, presetWeights, statGroup, unitStat };
