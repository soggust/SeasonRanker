import { merge, of } from 'rxjs';
import { AppData, CURRENT_SEASON, DATA, dataVersion, withSeason } from '@ranker/engine/data';
import { SKILL_UNITS, defaultRanking, emptyIn } from '@ranker/engine/unit-scoring';
import { defaultMin } from '@ranker/engine/playing-time';
import { DEFAULT_SETTINGS } from '@ranker/engine/position.service';
import { connectRosterGrades, keepRosterGrades } from '@ranker/engine/roster-grades';
import type { EngineHost } from '@ranker/engine/sport';
import { TabRanker } from '@ranker/engine/skill-rankings/tab-ranker';
import { StatReader } from '@ranker/engine/stat-reader';
import { SPORT } from '@sport/sport';
import { SKILL_STATS, SkillPlayer, SkillPosition, presetWeights, skillGroups } from '@sport/positions';

type Rows = Record<SkillPosition, SkillPlayer[]>;

// A season's tabs as the grid first shows each one (the page opened on that tab, every setting and slider
// at its default): its list (the rows at the default Min Games) in the grid's order. The grid's own code
// (TabRanker, StatReader, the table's season), so it counts what the grid counts: combined pairs as their
// totals (the Combine setting's default), Recent only for the season being played, and the grades from
// other tabs (SPORT.connect, the roster grades), from those tabs' default rankings, as the engine's
// rankedUnits gives them before they're opened. rows and data: the season's rows and files (the loaded
// season's by default). The grades it works out are its own: the table's are put back after, so the
// card can ask while the table's sliders are moved (SPORT.keepGrades, keepRosterGrades).
export function gridRankings(season: number, rows: Rows = SKILL_UNITS, data: AppData = DATA): Rows {
  const restore = [SPORT.keepGrades?.(), keepRosterGrades()];
  try {
    return withSeason(season, { ...data }, () => ranked(season, rows));
  } finally {
    for (const put of restore) put?.();
  }
}

function ranked(season: number, rows: Rows): Rows {
  const settings = DEFAULT_SETTINGS;
  const weightsOf = (position: SkillPosition) => presetWeights(position, 'default');
  // (position.service's rankedUnits for a tab not opened: its default ranking, leaned by an emphasis)
  const host: EngineHost = {
    settings$: of(settings.sport),
    rankedUnits: (position, emphasis) => {
      const tab = position as SkillPosition;
      const weights = weightsOf(tab);
      const leaned = emphasis ? Object.fromEntries(Object.entries(weights).map(([key, w]) => [key, (w as number) * (emphasis[key] ?? 1)])) : weights;
      return of(defaultRanking(tab, leaned, rows, settings.sport, defaultMin(rows, tab), settings.combineStats));
    },
    rows: () => rows,
  };
  // (the grades set as they're worked out: every stream emits at once, then completes)
  merge(SPORT.connect?.(host) ?? of(null), connectRosterGrades(host)).subscribe();

  const out = {} as Rows;
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
    const list = ranker.listed(rows, season, position);
    const reader = new StatReader({
      position,
      settings,
      rows,
      list,
      tableSeason: true,
      season,
      empty: (key) => emptyIn(rows[position] ?? [], key),
      weights: ranker.mixWeights(position),
    });
    out[position] = ranker.ranked(reader, list, position, rows);
  }
  return out;
}

// The season being played as the grid first shows it (gridRankings), for the card's Career line and the
// compare view's search: from the table's rows when it's on that season (rows: SKILL_UNITS, worked out
// again when the table loads), else from that season's own rows and files (the data service's). Worked
// out once each: every tab is ranked at once.
let live: { version: number; ranked: Rows } | null = null;
const others = new WeakMap<object, Rows>();
export async function currentGrid(
  data: { rows(season: number): Promise<Rows>; files(season: number): Promise<AppData> },
  rows: Rows,
): Promise<Rows> {
  if (rows === SKILL_UNITS) {
    if (live?.version !== dataVersion) live = { version: dataVersion, ranked: gridRankings(CURRENT_SEASON) };
    return live.ranked;
  }
  let ranked = others.get(rows);
  if (!ranked) {
    const files = await data.files(CURRENT_SEASON);
    ranked = others.get(rows) ?? gridRankings(CURRENT_SEASON, rows, files);
    others.set(rows, ranked);
  }
  return ranked;
}
