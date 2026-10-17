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
  // (the two teams as the matchup names them, away then home, each with its logo's address when the page has
  // one (a fighter's his headshot); none known, the row shows the name alone)
  teams?: MenuTeam[];
}

export interface MenuTeam {
  abbr: string;
  logo: string | null;
}

export interface MenuGame {
  key: string;
  sport: string;
  matchup: string;
  // (the matchup as it reads: "CLE @ TB"; a fight "A vs B", the first-listed fighter (the matchup's home) first)
  name: string;
  // ("7:00 PM"; none without a kickoff)
  time: string | null;
  // ("CLE @ TB · 7:00 PM" (a fight "A vs B · 9:00 PM"): the closed dropdown's words, and the option's)
  label: string;
  at: number;
  count: number | null;
  // (the two faces before the name, in the name's order: a fight's first-listed fighter first)
  faces: MenuTeam[];
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

// (a fight's matchup is "away @ home" as the bettor keys it, the first-listed fighter the home: it reads "A vs B")
export function matchupName(sport: string, matchup: string): string {
  if (sport !== 'mma') return matchup;
  const [away, home] = matchup.split(' @ ');
  return home ? `${home} vs ${away}` : matchup;
}

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
    const name = matchupName(g.sport, g.matchup);
    const teams = g.teams ?? [];
    rows.push({
      key: g.key,
      sport: g.sport,
      matchup: g.matchup,
      name,
      time,
      label: time ? `${name} · ${time}` : name,
      at: when.getTime(),
      count: g.count,
      faces: g.sport === 'mma' ? [...teams].reverse() : teams,
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

// A sport chosen in the dropdown instead of a game (its heading, selectable): the board is that sport's best
// bets, every day's. Its value in the select, "sport:nfl", beside the games' keys and Best bets' ''
const SPORT_CHOICE = 'sport:';
export function sportChoice(sport: string): string {
  return `${SPORT_CHOICE}${sport}`;
}
// (the sport a select value names, or null for a game's key or Best bets)
export function chosenSport(value: string): string | null {
  return value.startsWith(SPORT_CHOICE) ? value.slice(SPORT_CHOICE.length) : null;
}
// (the closed dropdown's words with a sport chosen: "NFL · best bets")
export function sportFace(sport: string, sports: MenuSports): string {
  return `${sports.find((s) => s.id === sport)?.label ?? sport.toUpperCase()} · best bets`;
}

// A collapsed row's line under its pick: the game and its start, "NYJ @ NE · Sun 12:00 PM" (a fight "A vs B ·
// Sat 9:00 PM"), the two apart so a phone can keep the game alone; no kickoff, the game alone. Not the sport
// (the row's circle and the open row say it) and not the reason (the open row's paragraph)
export function gameLine(sport: string, matchup: string, kickoff: string | null | undefined, timeZone?: string): { name: string; when: string | null; text: string } {
  const name = matchupName(sport, matchup);
  const t = kickoff ? new Date(kickoff) : null;
  const when = t && !isNaN(t.getTime()) ? t.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone }).replace(',', '') : null;
  return { name, when, text: when ? `${name} · ${when}` : name };
}

// (a day's caption on its band: "Saturday, Oct 17" as "SATURDAY · OCT 17")
export function dayBand(day: string): string {
  return day.replace(', ', ' · ').toUpperCase();
}

// The list's choices in the order they're laid out (the keyboard's path through them): Best bets · every game
// (''), then under each day each sport's heading (sportChoice) and its games' keys. A sport's heading is on the
// list once each day it has a game, each the same choice
export function menuValues(days: MenuDay[]): string[] {
  return ['', ...days.flatMap((d) => d.sports.flatMap((s) => [sportChoice(s.sport), ...s.games.map((g) => g.key)]))];
}

// A key pressed with the list open, the lit choice `active`: the arrows walk the list (held at its ends), Home
// and End jump to them, PageUp and PageDown move eight, Enter and Space take the lit choice, Escape and Tab
// shut the list (Tab going on its way); any other key, nothing
export type MenuKeyAction = { kind: 'move'; value: string } | { kind: 'choose' } | { kind: 'close' } | null;
export function menuKey(key: string, values: string[], active: string): MenuKeyAction {
  if (key === 'Escape' || key === 'Tab') return { kind: 'close' };
  if (!values.length) return null;
  const at = Math.max(0, values.indexOf(active));
  const to = (i: number): MenuKeyAction => ({ kind: 'move', value: values[Math.min(values.length - 1, Math.max(0, i))] });
  switch (key) {
    case 'ArrowDown':
      return to(at + 1);
    case 'ArrowUp':
      return to(at - 1);
    case 'Home':
      return to(0);
    case 'End':
      return to(values.length - 1);
    case 'PageDown':
      return to(at + 8);
    case 'PageUp':
      return to(at - 8);
    case 'Enter':
    case ' ':
      return { kind: 'choose' };
    default:
      return null;
  }
}

// (an option's element id, for aria-activedescendant: the value's letters and digits alone; Best bets' "all")
export function menuOptionId(value: string): string {
  return `bets-game-opt-${value.replace(/[^A-Za-z0-9]+/g, '-') || 'all'}`;
}
