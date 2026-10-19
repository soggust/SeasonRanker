// A sport's rankings as a fixture (snapshot-rankings.mjs writes them, categories.test.mjs holds the site to
// them): for the season being played and the latest finished one, every tab's top 50 as the grid first shows
// it (gridRankings), the table's own ranking with the default sliders (TabRanker, with each row's score) and
// with Combined off, and the ranking with each stat group hidden in turn by its id (the sidebar eye; the ids
// of the day the fixture was written, so an old link that hid "Basic" still ranks as its author saw it), plus
// each tab's headline stats and each group's stats. The groups' names and membership are free to change;
// none of these lists may.
import { seasonData, seasonDir } from './engine.mjs';

export const TOP = 50;
const round = (n) => Math.round(n * 1e9) / 1e9;

// The table's own ranking of a tab, as group-ranks.test.mjs's harness does it: default sliders, the groups
// in hidden switched off, the stats in hiddenStats switched off (the per-stat eye)
export function rankTab(engine, rows, season, position, { settings, hidden = {}, hiddenStats = new Set() } = {}) {
  const { TabRanker, StatReader, SKILL_STATS, skillGroups, emptyIn, presetWeights, DEFAULT_SETTINGS } = engine;
  settings ??= { ...DEFAULT_SETTINGS };
  const weights = presetWeights(position, 'default');
  const table = { position, stats: SKILL_STATS[position], groups: skillGroups(position), hidden, weights };
  const positions = {
    settings,
    statHiddenState: {},
    skillHiddenGroups: () => hidden,
    getWeights: () => weights,
    isStatHidden: (_position, key) => hiddenStats.has(key),
  };
  const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => table, () => {});
  const listed = ranker.listed(rows, season, position);
  const reader = new StatReader({ position, settings, rows, list: listed, tableSeason: true, season, empty: (key) => emptyIn(rows[position] ?? [], key), weights: ranker.mixWeights(position) });
  return ranker.rankedTotals(reader, listed, position, rows);
}

export const ids = (list) => list.slice(0, TOP).map((row) => row.gsisId);
export const scored = ({ ranked, totals }) => ranked.slice(0, TOP).map((row) => [row.gsisId, round(totals.get(row) ?? 0)]);

// The season a sport's fixture covers: the latest FINISHED one it keeps, whose files never change (the season
// being played is updated hourly by the data jobs, so a fixture of it failed CI on every update: 2026-10-19,
// cf31529f). A sport with no finished season on hand (MMA, in its first) has no ranking fixture at all, only its
// groups and headlines: its files change with every card.
export function fixtureSeasons(engine, sport) {
  const { CURRENT_SEASON, SEASONS } = engine;
  const last = SEASONS.find((season) => season !== CURRENT_SEASON && seasonExists(sport, season, CURRENT_SEASON));
  return last ? [last] : [];
}

function seasonExists(sport, season, current) {
  try {
    return !!seasonData(seasonDir(sport, season, current), undefined).skillPlayers;
  } catch {
    return false;
  }
}

// A season's rows and files, as the app loads them
export function seasonRows(engine, sport, season) {
  const { CURRENT_SEASON, SKILL_UNITS, DATA, unitsForSeason, SPORT } = engine;
  if (season === CURRENT_SEASON) return { rows: SKILL_UNITS, data: DATA };
  const data = seasonData(seasonDir(sport, season, CURRENT_SEASON), SPORT.dataFiles);
  return { rows: unitsForSeason(data, season), data };
}

// The whole fixture for a sport: legacy names the group ids whose hidden rankings to take (the groups of the
// day), given as id -> the keys of that group per tab (groupKeys), so the test can hide them by key later
export function snapshotSport(engine, sport, { legacy } = {}) {
  const { POSITIONS, SKILL_STATS, gridRankings, withSeason, headlineStats, statGroup, skillGroups, DEFAULT_SETTINGS } = engine;
  const out = { sport, seasons: {}, headline: {}, groups: {} };
  for (const position of POSITIONS) {
    out.headline[position] = headlineStats(position).map((stat) => stat.key);
    out.groups[position] = Object.fromEntries(skillGroups(position).map((group) => [group.id, group.stats.map((stat) => stat.key)]));
  }
  for (const season of fixtureSeasons(engine, sport)) {
    const { rows, data } = seasonRows(engine, sport, season);
    const grid = gridRankings(season, rows, data);
    const tabs = {};
    withSeason(season, { ...data }, () => {
      for (const position of POSITIONS) {
        const tab = { grid: ids(grid[position] ?? []), scored: scored(rankTab(engine, rows, season, position)), plain: ids(rankTab(engine, rows, season, position, { settings: { ...DEFAULT_SETTINGS, combineStats: false } }).ranked), hidden: {} };
        const groups = legacy?.[position] ?? Object.fromEntries(skillGroups(position).map((g) => [g.id, g.stats.map((s) => s.key)]));
        for (const [id, keys] of Object.entries(groups)) {
          // (by the id when the tab still has the group, else by its keys: the same stats left out either way)
          const own = skillGroups(position).some((g) => g.id === id);
          const run = own ? rankTab(engine, rows, season, position, { hidden: { [id]: true } }) : rankTab(engine, rows, season, position, { hiddenStats: new Set(keys) });
          tab.hidden[id] = ids(run.ranked);
        }
        tabs[position] = tab;
      }
    });
    out.seasons[season] = tabs;
  }
  return out;
}
