// The splash's own data, a season's (built by the sport's update scripts into its season folder, beside its
// rows), each file read once a season and optional: a season the scripts haven't written one for just goes
// without (the props it'd fill fall back to the season's awards alone).
//   outcomes.json     how each team's season ended, by its logo name (splash.scene.ts Outcome)
//   numbers.json      each player's jersey number that season, by his card id
//   best-games.json   each player's best game that season, by his card id: { title, line, tip }
//   milestones.json   a milestone a player reached that season, by his card id: { big, small, tip }
import { isLiveSeason } from '@ranker/engine/data';
import { SPORT } from '@sport/sport';
import type { Outcome } from './splash.scene';

export interface SplashData {
  outcomes: Record<string, Outcome>;
  numbers: Record<string, string>;
  bestGames: Record<string, { title: string; line: string; tip: string }>;
  milestones: Record<string, { big: string; small: string; tip: string }>;
}

const FILES: [keyof SplashData, string][] = [
  ['outcomes', 'outcomes.json'],
  ['numbers', 'numbers.json'],
  ['bestGames', 'best-games.json'],
  ['milestones', 'milestones.json'],
];

const seasons = new Map<number, Promise<SplashData>>();

export function splashData(season: number): Promise<SplashData> {
  let got = seasons.get(season);
  if (!got) {
    const dir = season === SPORT.currentSeason ? 'data' : `data/seasons/${season}`;
    const live = isLiveSeason(season);
    got = Promise.all(
      FILES.map(([key, file]) =>
        fetch(`${dir}/${file}`, { cache: live ? 'no-cache' : 'default' })
          .then((res) => (res.ok ? res.json() : {}))
          .catch(() => ({}))
          .then((json) => [key, json ?? {}] as const),
      ),
    ).then((pairs) => Object.fromEntries(pairs) as unknown as SplashData);
    seasons.set(season, got);
  }
  return got;
}
