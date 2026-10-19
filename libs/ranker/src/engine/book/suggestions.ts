// The Book's suggestions (the owner's decision, 2026-10-19): Best Bets shows every market on the boards
// (board.json per sport: each side with the Bot's chance c, its Kelly score ks, band b, price o, the Bot's open
// side bot / bk, a guard's reason sr) where the Bot's side has an edge AT THE LATEST PRICE, from the moment the
// boards carry it (the day before, once the desk's windows open). Each is priced again live: the edge, the Kelly
// score and the band worked out from the Bot's chance at the newest price the page has (ESPN's scoreboard for a
// game line where it's the fresher, the board's for a prop), with the same helpers the K popover's what-if uses
// (bet-why.ts whatIfOf, priceAt), so a suggestion's band moves as its price does and one whose price has worsened
// past its edge drops off (PASS). The Bot's own bets (picks.json, D27: every open bet) keep the price it locked,
// with the live one beside it and a "moved" note where they differ; a suggestion the Bot has since bet becomes
// that bet (one row a market). No Angular here (tests/book-suggestions.test.mjs)
import type { BoardGame, BoardProp, BoardSide, ModelBoard } from '../account/wallet/lines.service';
import type { GameBoard, Price } from '../account/wallet/wallet-math';
import { americanOdds, teamLogo } from './bet-format';
import { priceAt, whatIfOf } from './bet-why';
import { BetKind, BetRow, pickKey } from './book-rows';
import { byBand } from './desk-notes';

// (a row's market as the bettor keys it, from its id: "<event>:<market>", a prop "<event>:prop:<type>:<athlete>")
export interface MarketRef {
  event: string;
  market: 'spread' | 'total' | 'ml' | 'prop';
  propType: string | null;
  athlete: string | null;
}
export function marketOf(r: Pick<BetRow, 'pickId'>): MarketRef | null {
  const parts = (r.pickId ?? '').split(':');
  const [event, market] = parts;
  if (!event || !['spread', 'total', 'ml', 'prop'].includes(market)) return null;
  const prop = market === 'prop';
  return { event, market: market as MarketRef['market'], propType: prop ? (parts[2] ?? null) : null, athlete: prop ? (parts[3] ?? null) : null };
}
// (one key a market, either side: a suggestion on a market the Bot has bet (or holds as a CHECK) is that row)
export function marketKeyOf(r: Pick<BetRow, 'sport' | 'pickId'>): string | null {
  const m = marketOf(r);
  return m ? [r.sport, m.event, m.market, m.propType ?? '', m.athlete ?? ''].join('|') : null;
}

// The latest price for a row's side, and where it came from
export interface LiveQuote {
  odds: number;
  from: 'espn' | 'board';
}
// (what the page has on a game: ESPN's board and when the page last read it, the betting board's game and when the
// board was written)
export interface QuoteSources {
  espn?: GameBoard | null;
  espnAt?: number | null;
  model?: BoardGame | null;
  modelAt?: string | null;
}
const priced = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v !== 0;

// A side's latest price: a prop's the board's (ESPN's scoreboard has none), at the row's line; a game line's
// ESPN's where it's at the same line and read since the board was priced, else the board's at that line, else
// ESPN's at that line. A line that has moved off the row's: none (the Bot's chance is the old line's)
export function quoteOf(r: Pick<BetRow, 'pickId' | 'side' | 'line'>, src: QuoteSources): LiveQuote | null {
  const m = marketOf(r);
  if (!m || !r.side) return null;
  if (m.market === 'prop') {
    const x = src.model?.p?.find((p) => p.k === m.propType && String(p.id) === m.athlete && p.l === r.line);
    const o = x?.o[r.side === 'under' ? 1 : 0];
    return priced(o) ? { odds: o, from: 'board' } : null;
  }
  const sameLine = (l: number | null | undefined) => m.market === 'ml' || l === r.line;
  const side = src.model?.k?.[m.market]?.find((s) => s.s === r.side && sameLine(s.l));
  const espn = (src.espn?.[m.market] as Record<string, Price> | null | undefined)?.[r.side];
  const espnOk = !!espn && priced(espn.odds) && sameLine(espn.line);
  const boardAt = Date.parse(src.model?.at ?? src.modelAt ?? '');
  const espnFresher = !Number.isFinite(boardAt) || (src.espnAt ?? 0) >= boardAt;
  if (espnOk && (!side || espnFresher)) return { odds: espn!.odds!, from: 'espn' };
  if (side && priced(side.o)) return { odds: side.o, from: 'board' };
  return null;
}

// (the desk's word on a side as a suggestion, where the board carries one (sug): off, practice, or nothing said)
export function sugOf(sug: unknown): 'off' | 'practice' | null {
  if (sug === false || sug === 0) return 'off';
  if (sug === 'practice' || (typeof sug === 'object' && sug !== null && (sug as { practice?: unknown }).practice === true)) return 'practice';
  return null;
}

// (a side the Bot could suggest at some price: not a CHECK (an admin's, picks.json's checks), not a guard's pass
// (its reason, sr; or a PASS with an edge at the board's own price: the board's guard), not one the desk keeps off)
function open(band: string | null | undefined, ks: number | null | undefined, sr: string | undefined, bot: string | undefined, sug: unknown): boolean {
  if (band === 'check' || bot === 'check' || sr || sugOf(sug) === 'off') return false;
  return !(band === 'low' && (ks ?? 0) > 0);
}

const LABEL: Record<string, string> = { spread: 'Spread', total: 'Game total', ml: 'Moneyline' };
const KIND: Record<string, BetKind> = { spread: 'spread', total: 'total', ml: 'moneyline' };
const lineText = (l: number | null) => (l === null ? '' : l > 0 ? `+${l}` : String(l));

// A suggestion's words in its open row, at its price: the Bot's chance against the price's break-even
export function suggestionReason(chance: number, odds: number): string {
  const d = odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds;
  return `Suggested by price: the Bot makes it ${Math.round(chance * 1000) / 10}% to win, and at ${sign(odds)} it needs ${Math.round(1000 / d) / 10}%.`;
}
const sign = (odds: number) => americanOdds(odds).replace('-', '−');

// A suggestion at a price: its band, Kelly score, expected return and stake worked again from the Bot's chance
// (whatIfOf over the row, a price the Bot didn't take; priceAt at the new price), a practice side held a LIKE, and
// one the desk caps (board.json cap: a gate's practice stake, a role pick; DECISIONS.md D36) a LIKE at most at the
// practice stake, never a band the Bot couldn't give it; no edge there (PASS), none
export function repriced(row: BetRow, odds: number, from: LiveQuote['from'] = 'board'): BetRow | null {
  const base = whatIfOf({ ...row, confidence: null, ev: undefined, units: undefined }, false);
  if (!base) return null;
  const at = priceAt(base, odds);
  if (at.level === 'low' || at.level === 'check') return null;
  return {
    ...row,
    confidence: row.practice ? 'medium' : at.level,
    sureness: at.kelly,
    price: at.odds,
    odds: americanOdds(at.odds),
    ev: at.ev,
    ...(at.units === null ? {} : { units: at.units }),
    livePrice: at.odds,
    liveFrom: from,
    reason: suggestionReason(base.p, at.odds),
  };
}

// (a game's two sides as the rows show them: their abbreviations and logos (ESPN's where the page has its board, a
// fighter's headshot off the board), the away first)
function teamsOf(sport: string, g: BoardGame, espn: GameBoard | null | undefined): { abbr: string; logo: string | null }[] {
  const one = (t: [string, string, string?], live: { logo: string | null } | undefined) => ({
    abbr: t[0],
    logo: sport === 'mma' ? (t[2] ?? null) : (live?.logo ?? teamLogo(sport, t[0])),
  });
  return [one(g.a as [string, string, string?], espn?.away), one(g.h as [string, string, string?], espn?.home)];
}

// One sport's suggestions off its board: every side open to suggesting on a game not begun, priced again at its
// latest price (quoteOf; src gives each game's sources), the ones with an edge there. Each row's id -1 (the page
// gives it one: joinSuggestions)
export function suggestionsOf(sport: string, board: ModelBoard | null | undefined, now: number, src: (g: BoardGame) => QuoteSources): BetRow[] {
  const out: BetRow[] = [];
  for (const g of board?.games ?? []) {
    if (!(Date.parse(g.start) > now)) continue;
    const sources = { modelAt: board!.at, ...src(g), model: g };
    const teams = teamsOf(sport, g, sources.espn);
    const game = { week: 0, date: g.start.slice(0, 10), kickoff: g.start, matchup: g.m, teams, line: null };
    const [away, home] = g.m.split(' @ ');
    const push = (row: BetRow) => {
      const q = quoteOf(row, sources);
      const r = q ? repriced(row, q.odds, q.from) : null;
      if (r) out.push(r);
    };
    for (const market of ['spread', 'total', 'ml'] as const) {
      for (const s of (g.k?.[market] ?? []) as BoardSide[]) {
        if (!open(s.b, s.ks, s.sr, s.bot, s.sug) || !(s.c > 0 && s.c < 1) || !priced(s.o)) continue;
        const team = s.s === 'home' ? home : away;
        const pick = market === 'total' ? `${s.s === 'over' ? 'Over' : 'Under'} ${s.l}` : market === 'spread' ? `${team} ${lineText(s.l)}` : `${team} ML`;
        const kind = KIND[market];
        push({
          ...base(sport, g, game, s.c, s.o, sugOf(s.sug) === 'practice', s.cap ?? null, s.cr),
          market: LABEL[market],
          pick,
          key: pickKey(sport, g.m, kind, pick),
          betType: kind,
          side: s.s,
          player: sport === 'mma' && market === 'ml' ? team : null,
          line: market === 'ml' ? null : s.l,
          pickId: `${g.id}:${market}`,
        });
      }
    }
    for (const x of (g.p ?? []) as BoardProp[]) {
      if (x.sk || x.c === null || !(x.c > 0 && x.c < 1)) continue;
      (['over', 'under'] as const).forEach((side, i) => {
        const o = x.o[i];
        if (!priced(o) || !open(x.b[i], x.ks[i], x.sr, x.bk, x.sug)) return;
        const pick = `${x.n} ${side === 'over' ? 'Over' : 'Under'} ${x.l} ${x.lb}`;
        push({
          ...base(sport, g, game, i ? 1 - x.c! : x.c!, o, sugOf(x.sug) === 'practice', x.cap?.[i] ?? null, x.cr),
          market: x.lb,
          pick,
          key: pickKey(sport, g.m, 'player', pick),
          betType: 'player',
          side,
          player: x.n,
          athleteId: x.id,
          playerTeam: x.t,
          line: x.l,
          pickId: `${g.id}:prop:${x.k}:${x.id}`,
        });
      });
    }
  }
  return out;
}

// (what every suggestion row has: its game, the Bot's chance, the board's price till it's priced again)
// (cap, why: the desk's cap on the side, board.json's cap and cr)
function base(sport: string, _g: BoardGame, game: BetRow['game'], p: number, odds: number, practice: boolean, cap: 'medium' | null = null, why?: string) {
  return {
    id: -1,
    sport,
    game,
    strength: 'like' as const,
    reason: '',
    confidence: null,
    ...(practice ? { practice: true } : {}),
    ...(cap === 'medium' ? { cap, ...(why ? { capWhy: why } : {}) } : {}),
    sureness: 0,
    chance: Math.round(p * 100),
    p,
    edge: true,
    price: odds,
    odds: americanOdds(odds),
    book: 'DraftKings',
    suggested: true,
  };
}

// A bet of the Bot's with its side's latest price beside the one it locked: moved where they differ. Its band, its
// Kelly score and its price stay the bet's
export function withLive(row: BetRow, q: LiveQuote | null): BetRow {
  const live = q?.odds ?? null;
  return { ...row, livePrice: live, liveFrom: q?.from ?? null, moved: live !== null && Number.isFinite(row.price) && live !== row.price };
}

// The list: the Bot's rows (its bets and an admin's CHECKs) with the suggestions on markets it holds nothing on,
// one row a market (a suggestion the Bot has since bet is that bet), in the board's order (desk-notes byBand: the
// bands, then the Kelly score). A suggestion's id from idOf (the page keeps one a side, so an open row stays open
// as its price moves)
export function joinSuggestions(rows: readonly BetRow[], suggestions: readonly BetRow[], idOf: (key: string) => number): BetRow[] {
  const held = new Set(rows.map(marketKeyOf).filter((k): k is string => !!k));
  const seen = new Set<string>();
  const kept: BetRow[] = [];
  for (const s of suggestions) {
    const key = marketKeyOf(s);
    if (!key || held.has(key)) continue;
    const own = `${key}|${s.side}`;
    if (seen.has(own)) continue;
    seen.add(own);
    kept.push({ ...s, id: idOf(own) });
  }
  return [...rows, ...kept].sort(byBand);
}

// A bet's locked price and when, for its row: "Bet at −109 · 2:05 PM" (another day's, its weekday first: "Sun
// 2:05 PM"); a file without the time, the price alone
export function lockedText(r: Pick<BetRow, 'price' | 'placedAt'>, now = Date.now()): string | null {
  if (!priced(r.price)) return null;
  const at = r.placedAt ? new Date(r.placedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return `Bet at ${sign(r.price)}`;
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = new Date(now).toDateString() === at.toDateString();
  return `Bet at ${sign(r.price)} · ${sameDay ? time : `${at.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`}`;
}

// (a moved bet's note's hover: the live price against the locked one)
export function movedTitle(r: Pick<BetRow, 'price' | 'livePrice'>): string | null {
  if (!priced(r.price) || !priced(r.livePrice)) return null;
  return `The price has moved since the Bot bet it: ${sign(r.livePrice)} now, the Bot locked ${sign(r.price)}. Its band and Kelly score are the locked price's`;
}
