// A UFC bout's own view, pure (tests/fight-view.test.mjs; the owner, 2026-10-26: "old MMA fight details viewable
// like a game view"): ESPN's bout (live-mma.ts mmaBouts) and the Bot's ledger rows on it (mma's data/model/ledger.json)
// laid out as the fight modal shows them: the two fighters (the first-listed, the board's home, first: "A vs. B"),
// the winner and how it ended ("Pico def. Smith · KO R1 2:05"), the fight's facts (division, rounds, card,
// records), and each of the Bot's rows on it with its prices (the one it took, the open, the close, the other
// side's), whether it bet or only tracked, and when. The ticker's words for a bout too (tickerFight), and where a
// ticket's game opens (gameRefOf). No Angular here.

import type { GameBoard } from '../account/wallet/wallet-math';
import { oddsText } from '../account/wallet/wallet-math';
import type { FightInfo, LiveBout } from './live-mma';
import { fightWords } from './live-mma';

// (the Bot's row on a bout as the MMA desk's ledger writes it, the parts read here)
export interface FightLedgerRow {
  id: string;
  event: string;
  sport?: string;
  start: string;
  placedAt?: string;
  matchup: string;
  fighters?: { home?: { id?: string; name?: string; country?: string }; away?: { id?: string; name?: string; country?: string } };
  market: string;
  side: string;
  line: number | null;
  odds: number;
  otherOdds?: number | null;
  p?: number;
  intent?: string;
  units?: number;
  trackUnits?: number;
  book?: string;
  pick: string;
  context?: { division?: string; rounds?: number; cardName?: string; records?: { home?: string; away?: string }; why?: string };
  seen?: { at?: string; odds?: number; line?: number | null; open?: { at?: string; odds?: { home?: number; away?: number } } };
  close?: { odds?: number | null; line?: number | null; source?: string } | null;
  clv?: { beat?: boolean | null } | null;
  status: string;
  profit?: number;
  final?: string;
  gradedAt?: string;
}

// (one fighter in the view: his name, face, record, country, and whether he won)
export interface FightSideView {
  name: string;
  last: string;
  face: string | null;
  record: string | null;
  country: string | null;
  won: boolean;
  lost: boolean;
}

// (one of the Bot's rows on the bout, as the view words it)
export interface FightBetView {
  id: string;
  market: string;
  pick: string;
  // (a staked bet, or a pass: a bout the desk priced and didn't bet (the owner, 2026-11-07: "if you are recommending
  // me to bet, you should be betting it" — a pick shown with units is a bet, so a pass shows none, no as-if units))
  kind: 'Bet' | 'Pass';
  // (a bet's stake; a pass 0)
  units: number;
  book: string | null;
  price: string;
  open: string | null;
  close: string | null;
  other: string | null;
  chance: number | null;
  placedAt: string | null;
  gradedAt: string | null;
  // (a pass's: 'pass', whatever the bout did: it's no result of the Bot's)
  status: 'won' | 'lost' | 'push' | 'open' | 'pass';
  // ("+1.25u", "-2u"; open: "Open"; a pass: "Not bet", and once the bout's over whether its side came in, as a fact, not a return)
  result: string;
  beat: boolean | null;
  why: string | null;
}

export interface FightView {
  state: 'pre' | 'in' | 'post';
  // (the clock's words: a start, "R2 3:14", "KO R1 2:05")
  words: string;
  // (the result once it's over: "Pico def. Smith · KO R1 2:05"; a draw or no contest its words; none before)
  result: string | null;
  start: string;
  // (the first-listed fighter (the board's home) first, as "A vs. B" reads)
  sides: [FightSideView, FightSideView];
  card: string | null;
  division: string | null;
  rounds: number | null;
  bets: FightBetView[];
}

const lastName = (name: string): string => name.trim().split(/\s+/).pop() || name;
const units = (v: number): string => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Number(Math.abs(v).toFixed(2))}u`;
const HEADSHOT = (id: string) => `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`;

// (a bout turned round to the ledger's own fighters: ESPN orders its fighters by its own rule, the bettor's board
// by its; where the ledger's home is ESPN's away (its ids), the winner and records swap with the names)
export function orientBout<B extends GameBoard & { fight: FightInfo }>(b: B, homeId: string | null | undefined): B {
  const ids = b.fight.ids;
  if (!ids || !homeId || homeId !== ids[0] || homeId === ids[1]) return b;
  const w = b.fight.winner;
  return {
    ...b,
    away: b.home,
    home: b.away,
    matchup: `${b.home.name} @ ${b.away.name}`,
    fight: { ...b.fight, winner: w === 'home' ? 'away' : w === 'away' ? 'home' : null, records: [b.fight.records[1], b.fight.records[0]], ids: [ids[1], ids[0]] },
  };
}

// A bout's result in words once it's over: "Pico def. Smith · KO R1 2:05", a decision "Pico def. Smith · SPLIT DEC";
// no winner (a draw, a no contest) its words alone; null before it ends
export function fightResult(b: Pick<LiveBout, 'state' | 'start' | 'detail' | 'fight' | 'away' | 'home'>): string | null {
  if (b.state !== 'post') return null;
  const words = fightWords(b);
  const w = b.fight.winner;
  if (!w) return words;
  const win = w === 'home' ? b.home : b.away;
  const lose = w === 'home' ? b.away : b.home;
  return `${lastName(win.name)} def. ${lastName(lose.name)} · ${words}`;
}

// The ticker's bout (the owner, 2026-10-26: a finished fight read "started", and "Fighter @ Fighter"): which
// fighter first and the word between them, and the state's words. To come or under way, the first-listed (the
// home) first, "vs."; over with a winner, the winner first, "def.", then how and when ("KO R1 2:05"); over with
// none, "vs." and its words (a draw, a no contest). A bout the scoreboard hasn't read (the betting board's alone),
// under way "LIVE" (never "started"). Not a fight: null
export interface TickerFight {
  first: 'home' | 'away';
  sep: 'vs.' | 'def.';
  text: string | null;
}
export function tickerFight(g: Pick<GameBoard, 'sport' | 'state' | 'start' | 'detail'> & { fight?: FightInfo }, now = Date.now()): TickerFight | null {
  if (g.sport !== 'mma') return null;
  if (g.state === 'pre') return { first: 'home', sep: 'vs.', text: null };
  if (!g.fight) return { first: 'home', sep: 'vs.', text: g.state === 'post' ? 'FINAL' : 'LIVE' };
  const words = fightWords({ state: g.state, start: g.start, detail: g.detail, fight: g.fight }, now);
  if (g.state === 'post' && g.fight.winner) return { first: g.fight.winner, sep: 'def.', text: words };
  return { first: 'home', sep: 'vs.', text: words };
}

// (a ledger row's market as the view names it)
const MARKET_WORDS: Record<string, string> = { ml: 'Moneyline', total: 'Rounds', spread: 'Spread' };

// One of the Bot's rows on the bout, worded: the price it took and when, the open (the ledger's first look at the
// bout, a moneyline's side), the close, the other side's price, a bet with its units or a pass with none, and how it
// came out (a pass: whether its side came in, as a fact; never a return it didn't take)
export function fightBetOf(r: FightLedgerRow): FightBetView {
  const staked = (r.units ?? 0) > 0 && r.intent !== 'track';
  const u = staked ? (r.units ?? 0) : 0;
  const graded: 'won' | 'lost' | 'push' | 'open' = r.status === 'won' || r.status === 'lost' || r.status === 'push' ? r.status : r.status === 'void' ? 'push' : 'open';
  const status: FightBetView['status'] = staked ? graded : 'pass';
  const open = r.market === 'ml' ? r.seen?.open?.odds?.[r.side === 'home' ? 'home' : 'away'] : undefined;
  const closeOdds = r.close?.odds;
  // (what it came to: a bet its profit; a pass "Not bet", and the side's fate once the bout's graded)
  const won = graded === 'won' ? u * (r.odds > 0 ? r.odds / 100 : 100 / Math.abs(r.odds)) : graded === 'lost' ? -u : 0;
  const result = !staked
    ? graded === 'open' ? 'Not bet' : graded === 'push' ? 'Not bet · push' : `Not bet · side ${graded === 'won' ? 'came in' : 'missed'}`
    : graded === 'open' ? 'Open' : graded === 'push' ? 'Push' : units(r.profit ?? won);
  return {
    id: r.id,
    market: MARKET_WORDS[r.market] ?? r.market,
    pick: r.pick,
    kind: staked ? 'Bet' : 'Pass',
    units: Number(u.toFixed(2)),
    book: r.book ?? null,
    price: oddsText(r.odds),
    open: Number.isFinite(open) ? oddsText(open as number) : null,
    close: closeOdds !== null && closeOdds !== undefined && Number.isFinite(closeOdds) ? oddsText(closeOdds) : null,
    other: r.otherOdds !== null && r.otherOdds !== undefined && Number.isFinite(r.otherOdds) ? oddsText(r.otherOdds) : null,
    chance: Number.isFinite(r.p) ? Math.round((r.p as number) * 100) : null,
    placedAt: r.placedAt ?? r.seen?.at ?? null,
    gradedAt: r.gradedAt ?? null,
    status,
    result,
    beat: r.clv?.beat ?? null,
    why: r.context?.why ?? null,
  };
}

// The view of a bout: ESPN's (turned to the ledger's fighters) where it's been read, else the ledger's own words
// (its fighters, records, card and division); the Bot's rows on it, the moneyline first. Neither: null
export function fightViewOf(bout: LiveBout | null | undefined, rows: readonly FightLedgerRow[], now = Date.now()): FightView | null {
  const first = rows[0];
  if (!bout && !first) return null;
  const b = bout ? orientBout(bout, first?.fighters?.home?.id) : null;
  const ctx = rows.find((r) => r.context)?.context;
  const side = (which: 'home' | 'away'): FightSideView => {
    const led = first?.fighters?.[which];
    const name = b ? b[which].name : (led?.name ?? '');
    const face = b?.[which].logo ?? (led?.id ? HEADSHOT(led.id) : null);
    const record = b ? b.fight.records[which === 'away' ? 0 : 1] : null;
    const w = b?.state === 'post' ? b.fight.winner : null;
    return { name, last: lastName(name), face, record: record ?? ctx?.records?.[which] ?? null, country: led?.country ?? null, won: w === which, lost: !!w && w !== which };
  };
  const order = { ml: 0, total: 1, spread: 2 } as Record<string, number>;
  const bets = [...rows].sort((x, y) => (order[x.market] ?? 9) - (order[y.market] ?? 9) || x.id.localeCompare(y.id)).map(fightBetOf);
  // (no scoreboard: a row the desk graded is over, its words the ledger's final)
  const graded = rows.some((r) => r.status !== 'open');
  const start = b?.start || first?.start || '';
  const state = b?.state ?? (graded ? 'post' : Date.parse(start) > now ? 'pre' : 'in');
  return {
    state,
    words: b ? fightWords(b, now) : state === 'post' ? 'FINAL' : state === 'in' ? 'LIVE' : '',
    result: b ? fightResult(b) : (rows.find((r) => r.final)?.final ?? null),
    start,
    sides: [side('home'), side('away')],
    card: b?.fight.card || ctx?.cardName || null,
    division: b?.fight.weight || ctx?.division || null,
    rounds: ctx?.rounds ?? b?.fight.rounds ?? null,
    bets,
  };
}

// Where a ticket's game opens (the owner, 2026-10-26: a ticket's game, begun or over, opens its modal): a fight its
// fight view, a team sport's game the game view by ESPN's league; a leg with no ESPN id, nowhere
const LEAGUES: Record<string, string> = { nfl: 'football/nfl', nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb' };
export type GameRef = { kind: 'fight'; event: string; start: string; matchup: string } | { kind: 'game'; event: string; league: string } | null;
export function gameRefOf(b: { sport: string; event?: string | null; start?: string | null; matchup?: string | null }): GameRef {
  const event = String(b.event ?? '');
  if (!/^\d{1,20}$/.test(event)) return null;
  if (b.sport === 'mma') return { kind: 'fight', event, start: b.start ?? '', matchup: b.matchup ?? '' };
  const league = LEAGUES[b.sport];
  return league ? { kind: 'game', event, league } : null;
}

// A bout on the boards (lines.service boards): the betting board's lines, matchup and faces in its own order, with
// ESPN's state, clock and the fight's facts turned to it (the owner, 2026-10-26: the ticker read a finished fight
// as "started", the betting board knowing only its start). No betting board for it: ESPN's bout as it is
export function boutOnBoard(lined: GameBoard | null, bout: LiveBout, homeId?: string | null): LiveBout {
  const b = orientBout(bout, homeId);
  if (!lined) return b;
  return { ...lined, state: b.state, detail: b.detail, final: b.final, fight: b.fight };
}
