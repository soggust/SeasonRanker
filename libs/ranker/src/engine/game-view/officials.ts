// A game's officials when ESPN's summary has none (2026-10-26). ESPN lists every sport's crew once the game
// has started (the NFL's seven, the NBA's three, the NHL's four, MLB's umpires) and none before, so a game to
// come shows none. MLB's own stats API, free and open to the page, posts the umpires the day of: the game is
// found on its schedule by the day and the two teams (as highlights.ts finds it). The NFL's, the NBA's and the
// NHL's crews have no source the page can reach before the game (the NBA's and the NHL's own sites don't let
// another site read them): those games show no Officials until ESPN has them.
import { fetchJson } from '@ranker/core/http';
import { GameView } from './game.model';

interface MlbSchedule {
  dates?: {
    games?: {
      gameDate?: string;
      teams: { home: { team: { name: string } }; away: { team: { name: string } } };
      officials?: { official?: { fullName?: string }; officialType?: string }[];
    }[];
  }[];
}

export async function loadOfficials(game: GameView): Promise<GameView['officials']> {
  if (game.officials.length || !game.league.includes('baseball')) return game.officials;
  // (the day as MLB files it, the home park's: close enough in New York's)
  const day = new Date(game.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const schedule = await fetchJson<MlbSchedule>(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&hydrate=officials`, {});
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() || a.split(' ').at(-1)?.toLowerCase() === b.split(' ').at(-1)?.toLowerCase();
  // (a doubleheader's two: the one starting nearest the game's time)
  const gap = (g: { gameDate?: string }) => {
    const ms = Math.abs(Date.parse(g.gameDate ?? '') - Date.parse(game.date));
    return Number.isNaN(ms) ? Infinity : ms;
  };
  const found = (schedule.dates ?? [])
    .flatMap((d) => d.games ?? [])
    .filter((g) => same(g.teams.home.team.name, game.home.name) && same(g.teams.away.team.name, game.away.name))
    .sort((a, b) => gap(a) - gap(b))[0];
  // (ESPN's words for the roles: "Home Plate Umpire")
  return (found?.officials ?? [])
    .filter((o) => o.official?.fullName)
    .map((o) => ({ name: o.official!.fullName!, role: o.officialType ? `${o.officialType} Umpire` : null }));
}
