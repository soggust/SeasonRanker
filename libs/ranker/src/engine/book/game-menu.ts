// The Book's game dropdown, laid out: a header for each day (in the viewer's time zone), under it a group
// for each sport with a game that day (its icon once, then its name), and under that its every game, the
// earliest first. The games the bot picked (with how many of its bets each shows) and the ones it has only lines
// for, together: a game is where it plays, picked or not. The sports in a day by their first game (the day reads
// early to late), the site's order on a tie; games at the same time by matchup. No Angular here (tested under
// Node: tests/book-game-menu.test.mjs).

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

// The games the dropdown lists by their lines alone: on a board, not begun, with a line posted, and no row on the
// page's list (listed: the rows on show, after the practice filter, and the CHECKs an admin alone sees) on that
// game, by "sport|event" (a row's event is its pickId's first part). A game counts as picked only through a row
// on show: one whose only picks the list hides (a practice pick with no edge at the live price, book-rows.ts
// bookShows) is listed by its lines, never dropped from the dropdown (the owner, 2026-10-19: tonight's NHL games
// gone from it while the Bot's practice picks on them were hidden)
export interface LinesGameIn {
  sport: string;
  event: string;
  state: 'pre' | 'in' | 'post';
  spread: unknown;
  total: unknown;
  ml: unknown;
}
export function shownEvents(rows: readonly { sport: string; pickId?: string | null }[]): Set<string> {
  return new Set(rows.filter((r) => r.pickId).map((r) => `${r.sport}|${r.pickId!.split(':')[0]}`));
}
export function linesOnlyGames<G extends LinesGameIn>(boards: Iterable<G>, shown: ReadonlySet<string>): G[] {
  return [...boards].filter((g) => g.state === 'pre' && !!(g.spread || g.total || g.ml) && !shown.has(`${g.sport}|${g.event}`));
}

// A sport chosen in the dropdown instead of a game (its heading, selectable): the board is that sport's best
// bets, every day's. Its value in the select, "sport:nfl", beside the games' keys and Best bets' ''
const SPORT_CHOICE = 'sport:';
export function sportChoice(sport: string): string {
  return `${SPORT_CHOICE}${sport}`;
}
// (the sport a value names (a heading's own value carries its day too, groupKey), or null for a game's key or
// Best Bets)
export function chosenSport(value: string): string | null {
  return value.startsWith(SPORT_CHOICE) ? value.slice(SPORT_CHOICE.length).split('|')[0] : null;
}
// A sport's heading under one day, the list's own value for it (the same sport on two days is two rows, each
// folding its own games): "sport:nhl|Saturday, Oct 17". Chosen, it's the sport (chosenSport)
export function groupKey(day: string, sport: string): string {
  return `${sportChoice(sport)}|${day}`;
}
// (the heading a game's key sits under, or null)
export function groupOf(days: MenuDay[], key: string): string | null {
  for (const d of days) for (const s of d.sports) if (s.games.some((g) => g.key === key)) return groupKey(d.day, s.sport);
  return null;
}
// (the closed dropdown's words with a sport chosen: "NFL · Best Bets", both capitals as everywhere)
export function sportFace(sport: string, sports: MenuSports): string {
  return `${sports.find((s) => s.id === sport)?.label ?? sport.toUpperCase()} · ${BEST_BETS_LABEL}`;
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

// The list's choices in the order they're laid out (the keyboard's path through them): Best Bets (''), then under
// each day each sport's heading (groupKey: the sport, that day) and, unless the heading is folded (closed), its
// games' keys
export function menuValues(days: MenuDay[], closed: ReadonlySet<string> = new Set()): string[] {
  return ['', ...days.flatMap((d) => d.sports.flatMap((s) => (closed.has(groupKey(d.day, s.sport)) ? [groupKey(d.day, s.sport)] : [groupKey(d.day, s.sport), ...s.games.map((g) => g.key)])))];
}

// The headings folded shut when the list opens: none on a quiet day (BUSY games or fewer in all); on a busy one
// every heading but the chosen game's and the chosen sport's
export const BUSY = 12;
export function defaultClosed(days: MenuDay[], game: string, sport: string): Set<string> {
  const groups = days.flatMap((d) => d.sports.map((s) => ({ key: groupKey(d.day, s.sport), sport: s.sport, games: s.games })));
  if (groups.reduce((n, g) => n + g.games.length, 0) <= BUSY) return new Set();
  return new Set(groups.filter((g) => !(sport && g.sport === sport) && !g.games.some((x) => x.key === game)).map((g) => g.key));
}

// A key pressed with the list open, the lit choice `active`: the up and down arrows walk the list (held at its
// ends), Home and End jump to them, PageUp and PageDown move eight, Right and Left unfold and fold (a sport's
// heading; the page decides what they do on a game), Enter and Space take the lit choice, Escape and Tab shut the
// list (Tab going on its way); any other key, nothing
export type MenuKeyAction = { kind: 'move'; value: string } | { kind: 'choose' } | { kind: 'close' } | { kind: 'expand' } | { kind: 'collapse' } | null;
export function menuKey(key: string, values: string[], active: string): MenuKeyAction {
  if (key === 'Escape' || key === 'Tab') return { kind: 'close' };
  if (key === 'ArrowRight') return { kind: 'expand' };
  if (key === 'ArrowLeft') return { kind: 'collapse' };
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
  return `book-game-opt-${value.replace(/[^A-Za-z0-9]+/g, '-') || 'all'}`;
}

// The dropdown's first row and its pill's words with nothing chosen: "Best Bets", capital B, nothing after it
// (the owner's note, 2026-10-17: no "· every game")
export const BEST_BETS_LABEL = 'Best Bets';

// The views bar is drawn only when there's more than the board to show: an admin's Algorithm, the user's Open or
// Cashed bets, or the day's Live games; the board alone, no bar
export function viewsShown(v: { desk: boolean; open: boolean; closed: boolean; live: boolean }): boolean {
  return v.desk || v.open || v.closed || v.live;
}

// A chosen game's picks section's header: "The bot's picks · 3"
export function gamePicksHead(n: number): string {
  return `The Bot's picks · ${n}`;
}
