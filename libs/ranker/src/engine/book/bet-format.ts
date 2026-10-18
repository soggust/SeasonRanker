import { TEAM_SHORT } from './team-short';
// How the Book and the Algorithm desk write their numbers, and ESPN's pictures they show (pure: tested
// under Node, tests/model-desk.test.mjs)

// (American odds with their sign: "+150", "-110")
export const americanOdds = (american: number): string => (american > 0 ? `+${american}` : String(american));

// (a share as a percent, a dash for none: "52.4%")
export const pct = (v: number | null | undefined, digits = 1): string => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(digits)}%`);

// (units won or lost, signed: "+1.82u")
export const units = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}u`;

// (a size with its sign: "+0.4")
export const signed = (v: number): string => `${v > 0 ? '+' : ''}${v}`;

// (a number to a few places, a dash for none)
export const num = (v: number | null | undefined, digits = 3): string => (v === null || v === undefined ? '-' : v.toFixed(digits));

const ESPN_IMG = 'https://a.espncdn.com/combiner/i?img=/i';

// (a team's logo, small, by its abbreviation: the version for a dark background, where a navy wordmark like
// the Capitals' would vanish on the board; hideImage falls back to the plain one)
export const teamLogo = (sport: string, abbr: string): string => `${ESPN_IMG}/teamlogos/${sport}/500-dark/${abbr.toLowerCase()}.png&w=40&h=40`;

// (a player's ESPN headshot, by his ESPN id)
export const headshot = (sport: string, athlete: string | number | null | undefined): string => `${ESPN_IMG}/headshots/${sport}/players/full/${athlete}.png&w=96&h=70`;

// (a league's logo)
export const leagueLogo = (sport: string): string => `https://a.espncdn.com/i/teamlogos/leagues/500/${sport}.png`;

// (a league's mark on the desk: the four leagues' ESPN logos; a UFC fight has none (ESPN's leagues/500/mma.png
// doesn't exist), so null, and the desk draws the gloves the Book's dropdown uses (sports_mma))
export const deskLeagueLogo = (sport: string): string | null => (sport === 'mma' ? null : leagueLogo(sport));

// (a fighter's ESPN headshot by his id, as the Book's board carries it (picks.json teams[].logo); none without one)
export const fighterHeadshot = (id: string | number | null | undefined): string | null =>
  id === null || id === undefined || id === '' ? null : `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`;

// A fight on the desk (the owner's note, 2026-10-17): the bettor keys it "away @ home", the home the first-listed
// fighter, so it reads "A vs B" as the Book's does (game-menu.ts matchupName), each fighter with his face (the
// ledger's fighters, by ESPN id; an older bet without them, his name alone, the gloves standing in)
export interface FightSide {
  name: string;
  pic: string | null;
}
type Fighter = { id?: string | number; name?: string };
type FightBet = { matchup: string; fighters?: { home?: Fighter; away?: Fighter } };

function fightSide(b: FightBet, side: 'home' | 'away'): FightSide {
  const [away, home] = b.matchup.split(' @ ');
  const f = b.fighters?.[side];
  return { name: (f?.name || (side === 'home' ? home : away) || '').trim(), pic: fighterHeadshot(f?.id) };
}

// (its two fighters in reading order: the home first, "vs", then the away)
export const fightSides = (b: FightBet): [FightSide, FightSide] => [fightSide(b, 'home'), fightSide(b, 'away')];

// (the fighter a moneyline took)
export const fightPick = (b: FightBet & { side?: string }): FightSide => fightSide(b, b.side === 'home' ? 'home' : 'away');

// (an image ESPN doesn't have: a dark-background logo falls back to the plain one, anything else steps out of
// the way, keeping its space)
export function hideImage(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.src.includes('/500-dark/')) img.src = img.src.replace('/500-dark/', '/500/');
  else img.style.visibility = 'hidden';
}

// (one side of a game on the Book's ticker: a team's logo and its short name beside it ("Chiefs", ESPN's
// shortDisplayName, else its abbreviation), a fighter's round headshot from the board and his last name; the
// owner's notes, 2026-10-17)
export interface TickerSide {
  label: string;
  pic: string | null;
  face: boolean;
}

export function tickerSide(sport: string, t: { abbr: string; name: string; short?: string; logo: string | null }): TickerSide {
  if (sport === 'mma') {
    const name = (t.name || t.abbr).trim();
    return { label: name.split(/\s+/).pop() || name, pic: t.logo, face: true };
  }
  return { label: t.short || TEAM_SHORT[sport]?.[t.abbr] || t.abbr, pic: t.abbr ? teamLogo(sport, t.abbr) : null, face: false };
}

// (a ticker game clicked: a team sport's opens the game view (game-view.service.ts open, by ESPN's league): one
// under way on its Summary (the live view), a final on its box score, one to come on its Preview; a UFC bout has
// no ESPN game summary, so it's chosen in the Book's game dropdown instead: its key there, the bot's picked game
// ("mma|A @ B") or the lines-only one ("mma|A @ B|event"), whichever the dropdown has. The owner's note, 2026-10-17)
const TICK_LEAGUES: Record<string, string> = { nfl: 'football/nfl', nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb' };
export type TickerTarget = { kind: 'game'; event: string; league: string | null; tab: 'summary' | 'box' | 'preview' } | { kind: 'bout'; keys: string[] };
export function tickerTarget(g: { sport: string; event: string; matchup: string; state: 'pre' | 'in' | 'post' }): TickerTarget {
  if (g.sport === 'mma') return { kind: 'bout', keys: [`${g.sport}|${g.matchup}`, `${g.sport}|${g.matchup}|${g.event}`] };
  return { kind: 'game', event: g.event, league: TICK_LEAGUES[g.sport] ?? null, tab: g.state === 'pre' ? 'preview' : g.state === 'in' ? 'summary' : 'box' };
}

// (a ticker game's words for a screen reader: "Open Lions at Packers")
export const tickerAria = (away: { label: string }, home: { label: string }): string => `Open ${away.label} at ${home.label}`;
// (a game view's market columns: only the markets with a price posted, in the board's order; a fight with round
// totals but no spread shows Total and Moneyline, no empty Spread column: the owner's note, 2026-10-17)
type Side = { odds: number | null } | null | undefined;
export function boardColumns(b: { spread: { away: Side; home: Side } | null; total: { over: Side; under: Side } | null; ml: { away: Side; home: Side } | null }): ('spread' | 'total' | 'ml')[] {
  const priced = (...s: Side[]): boolean => s.some((x) => x?.odds != null);
  const cols: ('spread' | 'total' | 'ml')[] = [];
  if (b.spread && priced(b.spread.away, b.spread.home)) cols.push('spread');
  if (b.total && priced(b.total.over, b.total.under)) cols.push('total');
  if (b.ml && priced(b.ml.away, b.ml.home)) cols.push('ml');
  return cols;
}

// (a total's tile words: "O 47.5"; a fight's round total "Over 2.5", its rounds in the column's head (Rounds), the
// tile's label and the ticket (the owner's note, 2026-10-17: "rounds" on the tile made the buttons too tall))
export function totalTop(sport: string, side: string, line: number | null | undefined): string {
  const over = side === 'over';
  return sport === 'mma' ? `${over ? 'Over' : 'Under'} ${line ?? ''}` : `${over ? 'O' : 'U'} ${line ?? ''}`;
}

// (a bet's words on the ticket: a fight's round total says its rounds, "Over 2.5 rounds"; the stored words as
// they are)
export function legWords(s: { sport: string; market: string; pick: string }): string {
  return s.sport === 'mma' && s.market === 'total' && !/rounds?$/i.test(s.pick) ? `${s.pick} rounds` : s.pick;
}
