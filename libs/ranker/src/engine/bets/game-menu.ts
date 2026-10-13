// The Bets page's game dropdown, laid out: a header for each day (in the viewer's time zone), under it a group
// for each sport with a game that day (its icon once, then its name), and under that its every game, the
// earliest first. The games the bot picked (with how many of its bets each shows) and the ones it has only lines
// for, together: a game is where it plays, picked or not. The sports in a day by their first game (the day reads
// early to late), the site's order on a tie; games at the same time by matchup. No Angular here (tested under
// Node: tests/bets-game-menu.test.mjs).

// (each sport's icon in the dropdown: Material Icons' own ball, puck or glove)
export const SPORT_ICONS: Record<string, string> = {
  nfl: 'sports_football',
  mlb: 'sports_baseball',
  nba: 'sports_basketball',
  nhl: 'sports_hockey',
  mma: 'sports_mma',
};

// A game for the dropdown: its key (the game filter's: "nfl|CHI @ GB"; a lines-only game's its event too,
// "mlb|CLE @ TB|401700123", so a series' next game is its own), its start (its date alone when the
// picks have no kickoff), and how many bets it shows (null: lines only, the bot has no pick on it)
export interface MenuGameIn {
  key: string;
  sport: string;
  matchup: string;
  start: string | null;
  date?: string | null;
  count: number | null;
}

export interface MenuGame {
  key: string;
  sport: string;
  matchup: string;
  // ("7:00 PM"; none without a kickoff)
  time: string | null;
  // ("CLE @ TB · 7:00 PM": the closed dropdown's words, and the option's)
  label: string;
  at: number;
  count: number | null;
}

export interface MenuSport {
  sport: string;
  name: string;
  icon: string;
  games: MenuGame[];
}

export interface MenuDay {
  day: string;
  sports: MenuSport[];
}

// (the sports' names and order: the site's, sports.json)
export type MenuSports = { id: string; label: string }[];

export function gameMenu(games: MenuGameIn[], sports: MenuSports, timeZone?: string): MenuDay[] {
  const order = (sport: string) => {
    const i = sports.findIndex((s) => s.id === sport);
    return i < 0 ? sports.length : i;
  };
  // (one entry a key: a game the bot picked keeps its count over the same game's lines alone, and of two the
  // same, the earlier start (the page keys a lines-only game by its event too, so a series' games on consecutive
  // days are each their own; this is only the rule for when two do meet), whichever order they come in)
  const startOf = (g: MenuGameIn) => {
    const t = Date.parse(g.start ?? (g.date ? `${g.date}T12:00:00` : ''));
    return isNaN(t) ? Infinity : t;
  };
  const byKey = new Map<string, MenuGameIn>();
  for (const g of games) {
    const had = byKey.get(g.key);
    const picked = (x: MenuGameIn) => x.count !== null;
    if (!had || (picked(g) !== picked(had) ? picked(g) : startOf(g) < startOf(had))) byKey.set(g.key, g);
  }
  const rows: (MenuGame & { day: string })[] = [];
  for (const g of byKey.values()) {
    const kickoff = g.start ? new Date(g.start) : null;
    // (no kickoff: the date's noon, so it lands on its own day in any time zone near ours)
    const when = kickoff && !isNaN(kickoff.getTime()) ? kickoff : g.date ? new Date(`${g.date}T12:00:00`) : null;
    if (!when || isNaN(when.getTime())) continue;
    const time = kickoff && when === kickoff ? kickoff.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }) : null;
    rows.push({
      key: g.key,
      sport: g.sport,
      matchup: g.matchup,
      time,
      label: time ? `${g.matchup} · ${time}` : g.matchup,
      at: when.getTime(),
      count: g.count,
      day: when.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone }),
    });
  }
  rows.sort((a, b) => a.at - b.at || order(a.sport) - order(b.sport) || a.matchup.localeCompare(b.matchup));
  // (in time order, so each day and each sport in it is met at its first game)
  const days: MenuDay[] = [];
  for (const { day, ...game } of rows) {
    let d = days.at(-1);
    if (d?.day !== day) days.push((d = { day, sports: [] }));
    let s = d.sports.find((x) => x.sport === game.sport);
    if (!s) {
      s = { sport: game.sport, name: sports.find((x) => x.id === game.sport)?.label ?? game.sport.toUpperCase(), icon: SPORT_ICONS[game.sport] ?? 'sports', games: [] };
      d.sports.push(s);
    }
    s.games.push(game);
  }
  return days;
}
