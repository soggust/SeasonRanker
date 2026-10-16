// The splash's own data, a season's (built by each sport's apps/<sport>/scripts/build-splash.mjs into its season
// folder, beside its rows: libs/ranker/scripts/splash/files.mjs says what each holds), each file read once and
// optional: a season without one just goes without (the props it'd fill fall back to the season's awards alone).
//   outcomes.json            how each team's season ended, by its logo name (OutcomeFile, read as the scene's
//                            Outcome: sceneOutcome)
//   numbers.json             each player's jersey number that season, by his card id
//   best-games.<TAB>.json    each player's best game that season, by his card id (BestGame), one file a tab
//   milestones.json          the season's notable marks (MLB's), by his card id, the rarest first
import { isLiveSeason } from '@ranker/engine/data';
import { SPORT } from '@sport/sport';
import type { Outcome } from './splash.scene';
import { sceneOutcome, type BestGame, type Milestone, type OutcomeFile } from './splash.outcome';

export interface SplashData {
  outcomes: Record<string, Outcome>;
  numbers: Record<string, string>;
  bestGames: Record<string, { title: string; line: string; tip: string }>;
  milestones: Record<string, { big: string; small: string; tip: string }>;
}

const seasons = new Map<string, Promise<SplashData>>();

// A season's splash data for a tab (its best games are the tab's own file)
export function splashData(season: number, tab: string): Promise<SplashData> {
  const key = `${season}/${tab}`;
  let got = seasons.get(key);
  if (!got) {
    const dir = season === SPORT.currentSeason ? 'data' : `data/seasons/${season}`;
    const live = isLiveSeason(season);
    const read = <T,>(file: string): Promise<T> =>
      fetch(`${dir}/${file}`, { cache: live ? 'no-cache' : 'default' })
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}))
        .then((json) => (json ?? {}) as T);
    got = Promise.all([
      read<Record<string, OutcomeFile>>('outcomes.json'),
      read<Record<string, string>>('numbers.json'),
      read<Record<string, BestGame>>(`best-games.${tab}.json`),
      read<Record<string, Milestone[] | Milestone>>('milestones.json'),
    ]).then(([outcomes, numbers, bestGames, milestones]) => ({
      outcomes: Object.fromEntries(
        Object.entries(outcomes).flatMap(([k, o]) => {
          const out = sceneOutcome(o, SPORT.id, season);
          return out ? [[k, out]] : [];
        }),
      ),
      numbers,
      bestGames,
      // (the rarest of a player's marks)
      milestones: Object.fromEntries(
        Object.entries(milestones).flatMap(([k, m]) => {
          const first = Array.isArray(m) ? m[0] : m;
          return first ? [[k, first]] : [];
        }),
      ),
    }));
    seasons.set(key, got);
  }
  return got;
}
