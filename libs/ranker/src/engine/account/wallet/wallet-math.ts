// The play-money wallet's arithmetic, pure (no Angular, no Firebase: tests/wallet.test.mjs runs it under
// Node): a game's lines at the book off ESPN's scoreboard, a bet slip's stakes and payouts, a bet in play
// settled by the score as the settler will settle it (desk-math's provisional), the wallet's tallies, its
// curve, and the user's record beside the bot's
import { Board, CurveLine, CurveSpot, Meter, ModelBet, Settled } from '../../book/desk-model';
import { CURVE_W, UNIT_WORDS, countNowOf, edgeColorOf, meterOf, profitCurves, propState, provisional, sideTextOf, sideTitleOf } from '../../book/desk-math';
import { units } from '../../book/bet-format';

export type PlayMarket = 'spread' | 'total' | 'ml' | 'prop';
export type PlayStatus = 'open' | 'won' | 'lost' | 'push' | 'void';
// (the bot's bands as the Book names them: bet-why.ts confidenceOf's lock, high, medium, low)
import type { Tier } from '../../book/tiers';
export type { Tier };

// (the settled history's page: the wallet and Closed Bets read it this many at a time, the latest first; the
// record's tiles come from the settler's tally, not from these)
export const SETTLED_PAGE = 50;

// (play money: 500 units to start, and again on a reload. Till 2026-10-17 it was 1,000: the wallets made before
// then keep their balances and their start (the wallet's start: what its current run began at) till they reload,
// and a past run whose first bet came before the change began at 1,000)
export const START = 500;
export const OLD_START = 1000;
export const START_CHANGED = '2026-10-17T23:00:00Z';
export const runBeganAt = (firstPlaced: string | null | undefined): number =>
  firstPlaced && firstPlaced < START_CHANGED ? OLD_START : START;
// (the slip's chips, in units; a custom stake is any number of half units up to the balance)
export const CHIPS = [0.5, 1, 5, 10, 25];
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];

// A bet as users/{uid}/bets/{id} keeps it (its times as ISO strings here)
export interface PlayBet {
  id: string;
  sport: string;
  // (its game's ESPN id)
  event: string;
  matchup: string;
  start: string;
  // (a parlay's: parlay, its legs' their own)
  market: PlayMarket | 'parlay';
  side: string;
  line: number | null;
  odds: number;
  stake: number;
  pick: string;
  // (the bot's own pick on this market and side: its band and its Kelly score then)
  botPick?: boolean;
  tier?: Tier | null;
  kelly?: number | null;
  // (the bot's pick's id, for a prop: its line and price checked against it)
  ref?: string | null;
  propType?: string | null;
  athlete?: string | null;
  player?: string | null;
  statLabel?: string | null;
  // (a preview prop's: a line from ESPN's book the bot hadn't priced, bet at an assumed -110: preview-props.ts)
  preview?: boolean;
  // (the wallet's run it was placed in: its reloads at the time)
  run: number;
  placedAt: string;
  status: PlayStatus;
  // (once settled: what it paid on top of the stake (its stake lost, 0 on a push or a void), the final, a note)
  profit?: number;
  final?: string;
  note?: string;
  settledAt?: string;
  // (a parlay (kind 'parlay'): its legs, each a straight bet's fields with its own result once graded; its odds the
  // legs' combined as placed, its sport 'parlay' here (the document has none: its legs may be on several); once
  // settled with a leg dropped out, the price it paid at)
  kind?: 'parlay';
  legs?: ParlayLeg[];
  paidOdds?: number;
  // (a settled straight bet's, the settler's (settle-lib.mjs botPickAt, gradeBot): the bot's own side on the
  // same market as its board showed it when this was placed (the higher Kelly score, forced when it had no bet
  // there), at its price and units, graded; null where the board can't say, none on a bet from before)
  bot?: BotCall | null;
}

export interface BotCall {
  side: string;
  line: number | null;
  price: number;
  units: number;
  kelly: number;
  forced: boolean;
  status: 'won' | 'lost' | 'push';
  // (at its own units and price)
  profit: number;
}

// A parlay's leg as users/{uid}/bets/{id} keeps it: what a straight bet is, without the stake, and its result
// once the settler's graded it (an open parlay's legs graded as their games end)
export interface ParlayLeg {
  sport: string;
  event: string;
  matchup: string;
  start: string;
  market: PlayMarket;
  side: string;
  line: number | null;
  odds: number;
  pick: string;
  botPick?: boolean;
  tier?: Tier | null;
  kelly?: number | null;
  ref?: string | null;
  propType?: string | null;
  athlete?: string | null;
  player?: string | null;
  statLabel?: string | null;
  preview?: boolean;
  status?: PlayStatus;
  final?: string;
  note?: string;
}

// One side of one market, a price on the board
export interface Price {
  market: PlayMarket;
  side: string;
  line: number | null;
  odds: number | null;
}

export interface BoardTeam {
  abbr: string;
  name: string;
  // (ESPN's short name, "Chiefs": the ticker's words)
  short?: string;
  logo: string | null;
  score: number | null;
}

// A game on ESPN's scoreboard, its lines at the book (each side's price as it stands now: ESPN's close is the
// current line until kickoff, its open when there's no other)
export interface GameBoard {
  sport: string;
  event: string;
  matchup: string;
  start: string;
  // (ESPN's state: not begun, under way, over; the clock's words)
  state: 'pre' | 'in' | 'post';
  detail: string;
  final: boolean;
  away: BoardTeam;
  home: BoardTeam;
  book: string | null;
  spread: { away: Price; home: Price } | null;
  total: { over: Price; under: Price } | null;
  ml: { away: Price; home: Price } | null;
}

// A bet on the slip, before it's placed: what it is, and its stake
export interface Selection {
  key: string;
  sport: string;
  event: string;
  matchup: string;
  start: string;
  market: PlayMarket;
  side: string;
  line: number | null;
  odds: number;
  pick: string;
  botPick: boolean;
  tier: Tier | null;
  kelly: number | null;
  ref: string | null;
  propType: string | null;
  athlete: string | null;
  player: string | null;
  statLabel: string | null;
  // (a preview prop: its line from ESPN's book, its price an assumed -110, none posted)
  preview?: boolean;
  stake: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// (ESPN's prices as numbers: "+150", "-110"; "EVEN" is +100; null where there's none)
export function priceOf(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (/^even$/i.test(s)) return 100;
  const n = Number(s.replace('+', ''));
  return s && Number.isFinite(n) && Math.abs(n) >= 100 ? Math.round(n) : null;
}

// (ESPN's lines as numbers: "-3.5", "o47.5", "u47.5"; a pick'em is 0)
export function lineOf(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (/^(pk|pick|even)$/i.test(s)) return 0;
  const n = Number(s.replace(/^[ou]/i, ''));
  return s && Number.isFinite(n) ? n : null;
}

// (what ESPN's scoreboard event carries, as far as the board reads it)
interface EspnSide {
  close?: { line?: string; odds?: string };
  open?: { line?: string; odds?: string };
}
export interface EspnEvent {
  id: string;
  date: string;
  competitions?: {
    competitors?: { homeAway: string; score?: string | number; team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string; logo?: string } }[];
    status?: { type?: { state?: string; completed?: boolean; name?: string; shortDetail?: string; detail?: string } };
    odds?: {
      provider?: { name?: string };
      overUnder?: number;
      moneyline?: { home?: EspnSide; away?: EspnSide };
      pointSpread?: { home?: EspnSide; away?: EspnSide };
      total?: { over?: EspnSide; under?: EspnSide };
    }[];
  }[];
}

// A scoreboard event as a board: its teams and score, and the book's lines (the bettor's book, BOOK in leagues.mjs: espn.mjs
// linesOf reads the same fields), each side's line and price as they stand now
export function boardOf(sport: string, e: EspnEvent): GameBoard | null {
  const c = e.competitions?.[0];
  const home = c?.competitors?.find((t) => t.homeAway === 'home');
  const away = c?.competitors?.find((t) => t.homeAway === 'away');
  if (!c || !home || !away) return null;
  const st = c.status?.type ?? {};
  // (a game called off is never final: its 0-0 isn't a result, as gameOf)
  const off = /postponed|cancel|suspended|forfeit/i.test(st.name ?? '');
  const state = st.state === 'in' ? 'in' : st.state === 'post' || off ? 'post' : 'pre';
  const team = (t: typeof home): BoardTeam => {
    const score = Number(t.score);
    return {
      abbr: t.team?.abbreviation ?? '',
      name: t.team?.displayName ?? t.team?.abbreviation ?? '',
      short: t.team?.shortDisplayName ?? t.team?.abbreviation ?? '',
      logo: t.team?.logo ?? null,
      score: state !== 'pre' && t.score !== undefined && t.score !== '' && Number.isFinite(score) ? score : null,
    };
  };
  const o = c.odds?.find((x) => String(x.provider?.name ?? '').toLowerCase().replace(/\s/g, '') === 'draftkings' && (x.moneyline || x.pointSpread || x.total));
  const now = (s: EspnSide | undefined) => s?.close ?? s?.open ?? null;
  const price = (market: PlayMarket, side: string, s: EspnSide | undefined, withLine: boolean, fallbackLine: number | null = null): Price => ({
    market,
    side,
    line: withLine ? (lineOf(now(s)?.line) ?? fallbackLine) : null,
    odds: priceOf(now(s)?.odds),
  });
  let spread: GameBoard['spread'] = null;
  let total: GameBoard['total'] = null;
  let ml: GameBoard['ml'] = null;
  if (o?.pointSpread) {
    const s = { away: price('spread', 'away', o.pointSpread.away, true), home: price('spread', 'home', o.pointSpread.home, true) };
    if (s.away.line !== null && s.home.line !== null && (s.away.odds || s.home.odds)) spread = s;
  }
  if (o?.total) {
    const fallback = Number.isFinite(o.overUnder) ? (o.overUnder as number) : null;
    const t = { over: price('total', 'over', o.total.over, true, fallback), under: price('total', 'under', o.total.under, true, fallback) };
    if (t.over.line !== null && (t.over.odds || t.under.odds)) total = t;
  }
  if (o?.moneyline) {
    const m = { away: price('ml', 'away', o.moneyline.away, false), home: price('ml', 'home', o.moneyline.home, false) };
    if (m.away.odds || m.home.odds) ml = m;
  }
  const a = team(away);
  const h = team(home);
  return {
    sport,
    event: String(e.id),
    matchup: `${a.abbr} @ ${h.abbr}`,
    start: e.date,
    state,
    detail: st.shortDetail ?? st.detail ?? '',
    final: !!st.completed && !off,
    away: a,
    home: h,
    book: o ? 'DraftKings' : null,
    spread,
    total,
    ml,
  };
}

// (a game's score as the desk's provisional settling reads it: home and away, and whether it's over)
export function scoreOf(b: GameBoard | undefined): Board | undefined {
  if (!b || b.state === 'pre' || b.home.score === null || b.away.score === null) return undefined;
  return { hs: b.home.score, as: b.away.score, final: b.final, state: b.state };
}

// The day ESPN files a game under (its dates= parameter): the day in US Eastern time, "20261011"
export function espnDay(iso: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

// (a line with its sign: "+3.5", "-7", a pick'em "PK")
export const lineText = (v: number | null): string => (v === null ? '' : v === 0 ? 'PK' : v > 0 ? `+${v}` : String(v));
export const oddsText = (v: number | null): string => (v === null ? '-' : v > 0 ? `+${v}` : String(v));

// A bet's words, as the bettor writes its own (desk.mjs pickText): "SEA -3.5", "Over 47.5", "SEA ML"; a prop
// "Cale Makar Over 0.5 Points"
export function pickWords(p: { market: PlayMarket; side: string; line: number | null; player?: string | null; statLabel?: string | null }, matchup: string): string {
  const [away, home] = matchup.split(' @ ');
  const team = p.side === 'home' ? home : away;
  if (p.market === 'total') return `${p.side === 'over' ? 'Over' : 'Under'} ${p.line}`;
  if (p.market === 'spread') return `${team} ${lineText(p.line)}`;
  if (p.market === 'ml') return `${team} ML`;
  return `${p.player ?? ''} ${p.side === 'over' ? 'Over' : 'Under'} ${p.line} ${p.statLabel ?? ''}`.trim();
}

// (one bet on the slip a market's side: a prop also its player and its stat)
export const selectionKey = (p: { sport: string; event: string; market: PlayMarket | 'parlay'; side: string; propType?: string | null; athlete?: string | null }): string =>
  [p.sport, p.event, p.market, p.side, p.propType ?? '', p.athlete ?? ''].join('|');

// ---------------------------------------------------------------------------
// The slip
// ---------------------------------------------------------------------------

// (what a stake wins on top of itself at American odds, to the cent)
export const toWin = (stake: number, odds: number): number => round2(odds > 0 ? (stake * odds) / 100 : (stake * 100) / -odds);
// (what comes back if it wins: the stake and the winnings)
export const payout = (stake: number, odds: number): number => round2(stake + toWin(stake, odds));

// A stake's problem, if any: in half units, at least a half, no more than what's left of the balance
// after the slip's other stakes
export function stakeProblem(stake: number, balance: number, others = 0): string | null {
  if (!Number.isFinite(stake) || stake <= 0) return 'Set a stake';
  if (!Number.isInteger(stake * 2)) return 'Half units only';
  if (stake > balance - others + 1e-9) return balance - others >= 0.5 ? `Only ${Math.floor((balance - others) * 2) / 2} units left` : 'Not enough in the wallet';
  return null;
}

// The slip added up: how many bets have a stake, the stakes, what they'd win, what they'd pay back
export function slipTotals(list: Pick<Selection, 'stake' | 'odds'>[]): { count: number; stake: number; toWin: number; payout: number } {
  const staked = list.filter((s) => s.stake > 0);
  const stake = staked.reduce((t, s) => t + s.stake, 0);
  const win = round2(staked.reduce((t, s) => t + toWin(s.stake, s.odds), 0));
  return { count: staked.length, stake, toWin: win, payout: round2(stake + win) };
}

// ---------------------------------------------------------------------------
// Parlays: the slip's selections as one bet, 2 to 10 legs, each on a game of its own; the settler grades each
// leg as a straight bet (settle-lib.mjs settleParlay: the same arithmetic as here)
// ---------------------------------------------------------------------------
export const PARLAY_MIN = 2;
export const PARLAY_MAX = 10;

// (American odds as decimal, what a unit pays back: -110 is 1.909, +150 is 2.5; and back, a whole number)
export const decimalOf = (odds: number): number => (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds);
export const americanOf = (dec: number): number => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));
// (the legs' combined price: the product of their decimal odds, as American)
export const parlayOdds = (legs: { odds: number }[]): number => americanOf(legs.reduce((p, l) => p * decimalOf(l.odds), 1));
// (what a stake wins on the legs together, to the cent, as the settler pays it: from the product itself, not the
// rounded American price, which can be a few cents off)
export const parlayToWin = (stake: number, legs: { odds: number }[]): number => round2(stake * (legs.reduce((p, l) => p * decimalOf(l.odds), 1) - 1));
// (what a bet wins if it wins: a straight bet at its price, a parlay on its legs')
export const betToWin = (b: Pick<PlayBet, 'kind' | 'legs' | 'stake' | 'odds'>): number =>
  b.kind === 'parlay' && b.legs?.length ? parlayToWin(b.stake, b.legs) : toWin(b.stake, b.odds);

// Why the slip's selections can't go together as a parlay, if they can't: too few or too many legs, both sides
// of one market, or two legs on one game (a same-game parlay's price carries the book's correlation adjustments,
// which can't be replicated here, so they aren't offered)
export function parlayProblem(list: Pick<Selection, 'sport' | 'event' | 'market' | 'side' | 'propType' | 'athlete'>[]): string | null {
  if (list.length < PARLAY_MIN) return `A parlay needs ${PARLAY_MIN} legs or more`;
  if (list.length > PARLAY_MAX) return `A parlay takes ${PARLAY_MAX} legs at most`;
  const market = (s: (typeof list)[number]) => [s.sport, s.event, s.market, s.propType ?? '', s.athlete ?? ''].join('|');
  const markets = list.map(market);
  if (new Set(markets).size < markets.length) return 'Both sides of one market can’t go in a parlay';
  const games = list.map((s) => `${s.sport}|${s.event}`);
  if (new Set(games).size < games.length) return 'No same-game parlays: their prices carry correlation adjustments the Book makes, which can’t be replicated here. One leg per game';
  return null;
}

// A parlay's result from its legs' (each its odds and its status: won, lost, push or void, or open (or null)
// while it waits), as the settler comes to it: a leg lost loses it; a pushed or void leg drops out, the rest's
// product the price (one leg left, that straight bet's; none, its stake back); null while a leg's open and none
// has lost. With the price it paid at, and "2 of 4 hit"
export interface ParlayResult {
  status: Exclude<PlayStatus, 'open'>;
  profit: number;
  final: string;
  odds?: number;
  note?: string;
}
export function parlayOutcome(stake: number, legs: { odds: number; status?: string | null }[]): ParlayResult | null {
  const n = legs.length;
  const of = (s: string) => legs.filter((l) => l.status === s).length;
  const hit = `${of('won')} of ${n} hit`;
  if (of('lost')) return { status: 'lost', profit: -stake, final: hit };
  if (legs.some((l) => !l.status || l.status === 'open')) return null;
  const won = legs.filter((l) => l.status === 'won');
  const out = [of('push') && `${of('push')} pushed`, of('void') && `${of('void')} void`].filter(Boolean).join(', ');
  const final = out ? `${hit}, ${out}` : hit;
  if (!won.length) return of('push') ? { status: 'push', profit: 0, final } : { status: 'void', profit: 0, final, note: 'every leg void' };
  const odds = won.length === 1 ? won[0].odds : parlayOdds(won);
  const profit = won.length === 1 ? toWin(stake, odds) : parlayToWin(stake, won);
  return { status: 'won', profit, final, odds };
}

// A parlay's legs as bets of their own, for the page's leg rows (their games' scores, a prop's count, the live
// column): each with the parlay's stake and run, its own result once graded, else open (one never graded on a
// settled parlay, lost on another leg first, stays so: the page reads it live only while the parlay's open)
export function legBets(p: PlayBet): PlayBet[] {
  return (p.legs ?? []).map((l, i) => ({
    ...l,
    id: `${p.id}~${i}`,
    stake: p.stake,
    run: p.run,
    placedAt: p.placedAt,
    botPick: !!l.botPick,
    line: l.line ?? null,
    status: l.status ?? 'open',
    profit: undefined,
  }));
}

// A parlay as it stands: its legs' results so far (each its stored one, else its result decided in play, else
// null), how many hit ("2 of 4 hit"), and its own result once they decide it (pending settlement)
export function parlayProgress(p: PlayBet, states: (PlayStatus | null | undefined)[]): { hit: number; n: number; text: string; decided: ParlayResult | null } {
  const legs = p.legs ?? [];
  const hit = states.filter((s) => s === 'won').length;
  const decided = p.status === 'open' ? parlayOutcome(p.stake, legs.map((l, i) => ({ odds: l.odds, status: states[i] ?? null }))) : null;
  return { hit, n: legs.length, text: `${hit} of ${legs.length} hit`, decided };
}

// A chip on a stake: added to it (a casino's chips stack), never past the balance
export const addChip = (stake: number, chip: number, room: number): number => Math.max(0, Math.min(Math.floor(room * 2) / 2, (stake > 0 ? stake : 0) + chip));

// (whether a game can still be bet: not begun, and its start not passed)
export const bettable = (start: string, state: GameBoard['state'] | undefined, now: number): boolean => (state === undefined || state === 'pre') && Date.parse(start) > now;

// A game on the bettor's own betting board (data/model/board.json, board.mjs's shape: the games not started,
// each market's two sides with its line and price) as a GameBoard, for a game ESPN's scoreboard has none of the book's
// lines on (a UFC bout: the card's board carries each bout's moneyline alone, no spread, no total, no props). The
// matchup the board's "A @ B" (a fight's the fighters, the first-listed the home); a fighter's picture his ESPN
// headshot (his id beside his name), a team's none (the page draws its logo by its abbreviation); no scores; its
// state by the clock (the board drops a game once it starts, but it's rewritten hourly). A market with neither
// side priced is left out; a game with no market at all, null. The bands and Kelly scores come from the same
// game through game-lines' call, as any board's do
export interface ModelBoardSideIn {
  s: string;
  l: number | null;
  o: number;
}
export interface ModelBoardGameIn {
  id: string;
  start: string;
  m: string;
  a: [string, string];
  h: [string, string];
  k: { spread?: ModelBoardSideIn[]; total?: ModelBoardSideIn[]; ml?: ModelBoardSideIn[] };
}
export function modelGameBoard(sport: string, g: ModelBoardGameIn, now: number): GameBoard | null {
  const fight = sport === 'mma';
  const team = ([abbr, id]: [string, string]): BoardTeam => ({ abbr, name: abbr, logo: fight && id ? `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png` : null, score: null });
  const price = (market: PlayMarket, side: string, sides: ModelBoardSideIn[] | undefined): Price => {
    const s = sides?.find((x) => x.s === side);
    return { market, side, line: market === 'ml' ? null : (s?.l ?? null), odds: s && Number.isFinite(s.o) ? s.o : null };
  };
  const pair = (market: PlayMarket, a: string, b: string, sides: ModelBoardSideIn[] | undefined): [Price, Price] | null => {
    const x = price(market, a, sides);
    const y = price(market, b, sides);
    return (x.odds || y.odds) && (market === 'ml' || (x.line !== null && y.line !== null)) ? [x, y] : null;
  };
  const spread = pair('spread', 'away', 'home', g.k?.spread);
  const total = pair('total', 'over', 'under', g.k?.total);
  const ml = pair('ml', 'away', 'home', g.k?.ml);
  if (!spread && !total && !ml) return null;
  const started = !(Date.parse(g.start) > now);
  return {
    sport,
    event: String(g.id),
    matchup: g.m,
    start: g.start,
    state: started ? 'in' : 'pre',
    detail: started ? 'Started' : '',
    final: false,
    away: team(g.a),
    home: team(g.h),
    book: 'DraftKings',
    spread: spread ? { away: spread[0], home: spread[1] } : null,
    total: total ? { over: total[0], under: total[1] } : null,
    ml: ml ? { away: ml[0], home: ml[1] } : null,
  };
}

// ---------------------------------------------------------------------------
// In play: settled by the score as the settler will (desk-math's provisional)
// ---------------------------------------------------------------------------

// (a play bet in the desk's shape: its stake its units)
export function asDeskBet(b: PlayBet): ModelBet {
  return {
    id: b.id,
    event: b.event,
    sport: b.sport,
    start: b.start,
    placedAt: b.placedAt,
    matchup: b.matchup,
    market: b.market as ModelBet['market'],
    propType: b.propType ?? undefined,
    statLabel: b.statLabel ?? undefined,
    player: b.player ?? undefined,
    athlete: b.athlete ?? undefined,
    line: b.line,
    side: b.side,
    pick: b.pick,
    odds: b.odds,
    model: 0,
    fair: 0,
    p: 0,
    ev: 0,
    units: b.stake,
    status: b.status === 'open' ? 'open' : b.status === 'void' ? 'push' : b.status,
    profit: b.profit ?? 0,
  };
}

// An open bet's result as soon as the score decides it (pending settlement: the settler pays it); null until
export function provisionalOf(b: PlayBet, board: GameBoard | undefined, propNow: number | null | undefined): Settled | null {
  if (b.status !== 'open') return null;
  const r = provisional(asDeskBet(b), scoreOf(board), propNow);
  return r ? { status: r.status, profit: round2(r.profit) } : null;
}

// An open bet's live column, as the Algorithm's In Play (desk-math.ts): a prop or a total its count so far
// against the line, as a meter (pips or a bar with the line notched), lit by how it stands; a spread or a
// moneyline where it stands at the score (covering, leading, or how it came out), colored by how far. Null
// before its game's under way (no score yet)
export interface PlayLive {
  // (a prop's or a total's count so far; null for a side, or a prop whose player isn't in the box score yet)
  count: number | null;
  state: 'won' | 'lost' | 'push' | 'alive' | null;
  meter: Meter | null;
  // (what it counts: the prop's stat, or the game's points, goals or runs)
  unit: string;
  // (the rest: its words, their hover, their color)
  text: string;
  title: string;
  color: string | null;
}

export function liveOf(b: PlayBet, board: GameBoard | undefined, propNow: number | null | undefined): PlayLive | null {
  const game = scoreOf(board);
  if (b.status !== 'open' || !game) return null;
  const d = asDeskBet(b);
  const count = countNowOf(d, game, propNow);
  const unit = b.market === 'prop' ? (b.statLabel ?? '') : (UNIT_WORDS[b.sport] ?? 'pts');
  if (count !== null) {
    const state = provisional(d, game, propNow)?.status ?? propState(d, count);
    // (a prop with no stat label: its count bare, no space left hanging)
    const of = unit ? ` ${unit}` : '';
    return { count, state, meter: meterOf(d, count), unit, text: `${count} / ${b.line}${of}`, title: `${b.market === 'prop' ? b.player + ': ' : 'The game: '}${count}${of} so far, ${b.side} ${b.line}`, color: null };
  }
  return { count: null, state: provisional(d, game, propNow)?.status ?? null, meter: null, unit, text: sideTextOf(d, game), title: sideTitleOf(d, game), color: edgeColorOf(d, game) };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface PlayTally {
  won: number;
  lost: number;
  push: number;
  void: number;
  open: number;
  // (the settled ones' stakes and their profit, the return on them; voids out of all three)
  staked: number;
  profit: number;
  roi: number | null;
  // (the open ones' stakes)
  atRisk: number;
}

export function playTally(bets: PlayBet[]): PlayTally {
  const t: PlayTally = { won: 0, lost: 0, push: 0, void: 0, open: 0, staked: 0, profit: 0, roi: null, atRisk: 0 };
  for (const b of bets) {
    if (b.status === 'open') {
      t.open++;
      t.atRisk += b.stake;
      continue;
    }
    t[b.status]++;
    if (b.status === 'void') continue;
    t.staked += b.stake;
    t.profit += b.profit ?? 0;
  }
  t.profit = round2(t.profit);
  t.roi = t.staked ? t.profit / t.staked : null;
  return t;
}

// (a record as "12-9-1": the pushes only when there are any)
export const recordText = (t: { won: number; lost: number; push: number }): string => `${t.won}-${t.lost}${t.push ? `-${t.push}` : ''}`;

// (the settled ones, in the order they were settled)
export const settledOrder = (bets: PlayBet[]): PlayBet[] =>
  bets.filter((b) => b.status !== 'open' && b.status !== 'void').sort((a, b) => (a.settledAt ?? a.start).localeCompare(b.settledAt ?? b.start) || a.start.localeCompare(b.start));

// The profit after each settled bet, drawn as the Algorithm's is (desk-math profitCurves: each sport its own
// line once there's more than one)
export function playCurve(bets: PlayBet[]) {
  const graded = settledOrder(bets).map((b) => ({ ...asDeskBet(b), gradedAt: b.settledAt }));
  return profitCurves(graded, START, (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// The whole record, from the settler's tally (tallies/{uid}: settle-lib.mjs addToTally), not the history's
// loaded pages: one document however many bets, and kept through a cleared history
// ---------------------------------------------------------------------------
export interface LifetimeTally {
  won: number;
  lost: number;
  push: number;
  void: number;
  staked: number;
  profit: number;
}
export interface TallyDoc {
  all: LifetimeTally;
  // (each game day's [won, lost, push, staked, profit], US Eastern "2026-10-11")
  days: Record<string, [number, number, number, number, number]>;
  // (each day's profit by sport, a parlay's 'parlay': version 2 on; an older tally's filled in by the settler)
  sports?: Record<string, Record<string, number>>;
  v?: number;
}

// (a tally document as read: its parts checked, null if it isn't one)
export function tallyFrom(d: Record<string, unknown> | null | undefined): TallyDoc | null {
  const all = d?.['all'] as Partial<LifetimeTally> | undefined;
  if (!all || typeof all !== 'object') return null;
  const n = (v: unknown) => (Number.isFinite(v) ? (v as number) : 0);
  return {
    all: { won: n(all.won), lost: n(all.lost), push: n(all.push), void: n(all.void), staked: n(all.staked), profit: n(all.profit) },
    days: (d?.['days'] as TallyDoc['days']) ?? {},
    ...(d?.['sports'] ? { sports: d['sports'] as TallyDoc['sports'] } : {}),
    ...(d?.['v'] !== undefined ? { v: n(d['v']) } : {}),
  };
}

// The wallet's tiles: the settled record from the tally (every bet ever settled), the open ones from the open
// bets; without a tally (none yet, or not read yet), the bets on hand as before
export function recordOf(tally: TallyDoc | null, bets: PlayBet[]): PlayTally {
  const t = playTally(bets);
  if (!tally) return t;
  const a = tally.all;
  return { ...t, won: a.won, lost: a.lost, push: a.push, void: a.void, staked: round2(a.staked), profit: round2(a.profit), roi: a.staked ? a.profit / a.staked : null };
}

// (how many bets the tally's settled, voids too: the history's count however much of it is loaded)
export const settledCount = (tally: TallyDoc | null): number | null => (tally ? tally.all.won + tally.all.lost + tally.all.push + tally.all.void : null);

// (a time's day in US Eastern, "2026-10-11": the tally's days')
export const etDay = (t: string | number | Date): string => {
  const d = espnDay(t);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

// The profit by game day from the tally, drawn as the Algorithm's curve is (desk-math profitCurves: each sport's
// own line once there's more than one, from the tally's sports): a point a day, not a bet, so the whole record
// is a few hundred points at most
export function dayCurve(tally: TallyDoc) {
  const days = Object.keys(tally.days).sort();
  const sports = SPORTS.filter((s) => days.some((d) => tally.sports?.[d]?.[s] !== undefined));
  const running: Record<string, number> = Object.fromEntries(sports.map((s) => [s, 0]));
  let sum = 0;
  const points = [{ total: 0, by: { ...running } }];
  for (const d of days) {
    sum = round2(sum + (tally.days[d]?.[4] ?? 0));
    for (const s of sports) running[s] = round2(running[s] + (tally.sports?.[d]?.[s] ?? 0));
    points.push({ total: sum, by: { ...running } });
  }
  const lines = sports.length > 1 ? sports : [];
  const values = points.flatMap((p) => [p.total, ...lines.map((s) => p.by[s])]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const last = points.length - 1;
  const step = CURVE_W / Math.max(1, last);
  const yOf = (v: number) => 110 - ((v - min) / span) * 100;
  const pathOf = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const spots: CurveSpot[] = points.map((p, i) => {
    const day = days[i - 1];
    const row = day ? tally.days[day] : null;
    const split = lines.length ? ` · ${lines.map((s) => `${s.toUpperCase()} ${units(p.by[s])}`).join(', ')}` : '';
    const date = day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
    const title = row ? `${date}: ${units(row[4])} on ${recordText({ won: row[0], lost: row[1], push: row[2] })}, ${units(p.total)} in all${split}` : 'Start: 0u';
    return { x: Math.max(0, i * step - step / 2), w: i === 0 || i === last ? step / 2 : step, px: i * step, y: yOf(p.total), title };
  });
  const totals = points.map((p) => p.total);
  return {
    totals,
    path: pathOf(totals),
    range: { min, max },
    spots,
    zeroY: yOf(0),
    end: spots[last],
    profit: sum,
    lines: lines.map((sport): CurveLine => {
      const values = points.map((p) => p.by[sport]);
      return { sport, values, path: pathOf(values), profit: running[sport] };
    }),
    // (the one sport whose bets these all are, if so (no parlays among them): the total is its line)
    solo: sports.length === 1 && days.every((d) => Object.keys(tally.sports?.[d] ?? {}).every((s) => s === sports[0])) ? sports[0] : null,
  };
}

// You vs the bot from the tally: your whole record from your first game day on, and the bot's published picks
// settled over the same days (versusBot's, from the bets on hand, when there's no tally)
export function versusDays(tally: TallyDoc, ledger: Parameters<typeof versusBot>[1]): Versus {
  const days = Object.keys(tally.days)
    .filter((d) => tally.days[d][0] + tally.days[d][1] + tally.days[d][2] > 0)
    .sort();
  const empty = { won: 0, lost: 0, push: 0, winPct: null, roi: null, profit: 0 };
  if (!days.length) return { from: null, you: empty, bot: empty };
  const side = (list: { status: string; stake: number; profit: number }[]) => {
    const t = { won: 0, lost: 0, push: 0, staked: 0, profit: 0 };
    for (const b of list) {
      if (b.status === 'won' || b.status === 'lost' || b.status === 'push') t[b.status]++;
      t.staked += b.stake;
      t.profit += b.profit;
    }
    return t;
  };
  const words = (t: { won: number; lost: number; push: number; staked: number; profit: number }) => ({
    won: t.won,
    lost: t.lost,
    push: t.push,
    winPct: t.won + t.lost ? t.won / (t.won + t.lost) : null,
    roi: t.staked ? round2(t.profit) / t.staked : null,
    profit: round2(t.profit),
  });
  const you = { won: 0, lost: 0, push: 0, staked: 0, profit: 0 };
  for (const d of days) {
    const [won, lost, push, staked, profit] = tally.days[d];
    you.won += won;
    you.lost += lost;
    you.push += push;
    you.staked += staked;
    you.profit += profit;
  }
  const bot = ledger.filter((b) => b.published && !b.void && b.status !== 'open' && etDay(b.start) >= days[0]).map((b) => ({ status: b.status, stake: b.units, profit: b.profit }));
  return { from: `${days[0]}T12:00:00Z`, you: words(you), bot: words(side(bot)) };
}

// Bets by game, the soonest (or the latest settled) first, each game's bets in the order placed; a parlay a
// group of its own (its sport 'parlay', its start its first leg's)
export function byGame(bets: PlayBet[], latestFirst = false): { key: string; sport: string; matchup: string; start: string; event: string; bets: PlayBet[] }[] {
  const groups = new Map<string, { key: string; sport: string; matchup: string; start: string; event: string; bets: PlayBet[] }>();
  for (const b of bets) {
    const key = b.kind === 'parlay' ? `parlay|${b.id}` : `${b.sport}|${b.event}`;
    const g = groups.get(key) ?? { key, sport: b.sport, matchup: b.matchup, start: b.start, event: b.event, bets: [] };
    g.bets.push(b);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  for (const g of list) g.bets.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  return list.sort((a, b) => (latestFirst ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)) || a.matchup.localeCompare(b.matchup));
}

// The games by sport, as the Algorithm's lists (desk-columns.ts gamesBySport): with more than one sport, each
// sport once in the order its first game comes, its games under it, their bets and profit counted; else one
// group without a heading
export type PlayGame = ReturnType<typeof byGame>[number];
export interface PlaySport {
  sport: string;
  header: boolean;
  games: PlayGame[];
  bets: number;
  profit: number;
}
export function playBySport(games: PlayGame[]): PlaySport[] {
  const count = (gs: PlayGame[]) => ({
    bets: gs.reduce((n, g) => n + g.bets.length, 0),
    profit: round2(gs.reduce((n, g) => n + g.bets.reduce((p, b) => p + (b.profit ?? 0), 0), 0)),
  });
  const sports = [...new Set(games.map((g) => g.sport))];
  if (sports.length < 2) return [{ sport: sports[0] ?? '', header: false, games, ...count(games) }];
  return sports.map((sport) => {
    const gs = games.filter((g) => g.sport === sport);
    return { sport, header: true, games: gs, ...count(gs) };
  });
}

// ---------------------------------------------------------------------------
// You vs the bot: the user's record beside the bot's published picks (the Book's) settled over the same
// stretch, from the user's first bet's game on. Units differ (the bot stakes 0.5 to 3, a user anything), so
// the return on what was staked is the fair comparison
// ---------------------------------------------------------------------------
export interface Versus {
  from: string | null;
  you: { won: number; lost: number; push: number; winPct: number | null; roi: number | null; profit: number };
  bot: { won: number; lost: number; push: number; winPct: number | null; roi: number | null; profit: number };
}

export function versusBot(mine: PlayBet[], ledger: (Pick<ModelBet, 'status' | 'start' | 'units' | 'profit'> & { published?: boolean; void?: boolean })[]): Versus {
  const settled = mine.filter((b) => b.status === 'won' || b.status === 'lost' || b.status === 'push');
  const from = settled.length ? settled.map((b) => b.start).sort()[0] : null;
  const side = (list: { status: string; stake: number; profit: number }[]) => {
    const won = list.filter((b) => b.status === 'won').length;
    const lost = list.filter((b) => b.status === 'lost').length;
    const push = list.filter((b) => b.status === 'push').length;
    const staked = list.reduce((t, b) => t + b.stake, 0);
    const profit = round2(list.reduce((t, b) => t + b.profit, 0));
    return { won, lost, push, winPct: won + lost ? won / (won + lost) : null, roi: staked ? profit / staked : null, profit };
  };
  const bot = from
    ? ledger.filter((b) => b.published && !b.void && b.status !== 'open' && b.start >= from).map((b) => ({ status: b.status, stake: b.units, profit: b.profit }))
    : [];
  return { from, you: side(settled.map((b) => ({ status: b.status, stake: b.stake, profit: b.profit ?? 0 }))), bot: side(bot) };
}

// ---------------------------------------------------------------------------
// The leaderboards (leaderboards/{week|season|all}, written by the settler)
// ---------------------------------------------------------------------------
export interface LeaderRow {
  uid: string;
  username: string;
  displayName?: string;
  photo?: { kind: 'provider' | 'upload' | 'logo'; url: string } | null;
  won: number;
  lost: number;
  push: number;
  staked: number;
  profit: number;
  roi: number | null;
  // (the wallet's reloads (its resets), the settler's: a record over several bankrolls)
  reloads?: number;
}
export interface Leaderboard {
  period: 'week' | 'season' | 'all';
  label: string;
  rows: LeaderRow[];
  updatedAt?: string;
}
