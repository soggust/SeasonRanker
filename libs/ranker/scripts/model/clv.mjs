// Closing-line value: how each bet's line and price compare with where the market closed. The close is the
// market's last word before the game (everyone's money and news in it), so a desk that keeps getting better
// numbers than the close is finding real edges long before enough results are in to show it: the early
// skill signal.
//
//   a game market's close: ESPN's core API keeps DraftKings' opening and closing lines and prices for an event
//   after it's played; read once the game is final (run.mjs captureClose): while it's under way its close can be
//   an in-game line (LV @ NE 2026-10-11 kept +8.5 and 51.5 for a game that closed +3.5 and 45.5), and its
//   current always is one, so it's never read
//   a prop's close: its board stays up after the game too, each item at its last line and price; the bet's own
//   rung of the ladder where the board prices it, else the main line
//
// Each bet's clv (clvOf): prob, the CLV (the bet's own price against the close's no-vig chance at its line), ev
// (the expected return at the close, the vig in it), pts, beat / result, q. Before the game, each run also notes
// the line it last saw (seen), which stands in for the close where the board has no price (the NFL's).

import { get } from './sources.mjs';
import { decimal, fairPair } from './desk.mjs';
import { atLine } from './margins.mjs';
import { impliedMean, lineChances } from './project.mjs';
import { round } from './ratings.mjs';
import { ESPN_PROVIDER } from './espn.mjs';
import { BOOK } from './leagues.mjs';

const CORE = 'https://sports.core.api.espn.com/v2/sports';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const implied = (american) => 1 / decimal(american);

// An event's closing lines from ESPN's odds body (null when it has none): each side's spread and its price, the
// total and its over and under prices, each side's moneyline. The close alone: never current, the live line
export function linesOfBody(body) {
  if (!body) return null;
  const num = (v) => {
    const n = Number(String(v ?? '').replace(/^[ou+]/, ''));
    return Number.isFinite(n) && v !== undefined && v !== null && v !== '' ? n : null;
  };
  const side = (t) => {
    const c = t?.close ?? null;
    return { line: num(c?.pointSpread?.american), odds: num(c?.spread?.american), ml: num(c?.moneyLine?.american) };
  };
  const h = side(body.homeTeamOdds);
  const a = side(body.awayTeamOdds);
  const c = body.close ?? null;
  return {
    spread: { home: { line: h.line, odds: h.odds }, away: { line: a.line, odds: a.odds } },
    total: { line: num(c?.total?.american), over: num(c?.over?.american), under: num(c?.under?.american) },
    ml: { home: h.ml, away: a.ml },
  };
}
export async function closingLines(league, id) {
  if (!ESPN_PROVIDER[BOOK]) return null;
  const [kind, lg] = league.split('/');
  return linesOfBody(await get(`${CORE}/${kind}/leagues/${lg}/events/${id}/competitions/${id}/odds/${ESPN_PROVIDER[BOOK]}?lang=en&region=us`));
}

// A game bet's close (its side's line and price, and the fair chance of its side) from closing lines
export function closeOf(bet, lines) {
  if (!lines) return null;
  if (bet.market === 'spread') {
    const mine = lines.spread[bet.side];
    const other = lines.spread[bet.side === 'home' ? 'away' : 'home'];
    if (mine.line === null || !mine.odds || !other.odds) return null;
    return { line: mine.line, odds: mine.odds, fair: fairPair(mine.odds, other.odds) };
  }
  if (bet.market === 'total') {
    const t = lines.total;
    if (t.line === null || !t.over || !t.under) return null;
    const odds = bet.side === 'over' ? t.over : t.under;
    return { line: t.line, odds, fair: fairPair(odds, bet.side === 'over' ? t.under : t.over) };
  }
  const mine = lines.ml[bet.side];
  const other = lines.ml[bet.side === 'home' ? 'away' : 'home'];
  if (!mine || !other) return null;
  return { line: null, odds: mine, fair: fairPair(mine, other) };
}

// A prop bet's close from its game's board after kickoff: the bet's own rung where the board's ladder prices both
// its sides (props.mjs board: ladder), else the player's main line for the stat (its prices where the board has them)
export function propCloseOf(bet, board) {
  const p = board.find((x) => String(x.athlete.id) === String(bet.athlete) && x.stat.key === bet.propType);
  if (!p) return null;
  const rung = (p.ladder ?? []).find((x) => x.line === bet.line && x.prices);
  const line = rung ? rung.line : p.line;
  const prices = rung ? rung.prices : p.prices;
  const odds = prices ? (bet.side === 'over' ? prices.over : prices.under) : null;
  const fair = prices ? (bet.side === 'over' ? fairPair(prices.over, prices.under) : fairPair(prices.under, prices.over)) : null;
  return { line, odds, fair };
}

// A bet's CLV against its close (DECISIONS.md D115, 2026-11-08; before it round F's v2, 2026-10-18). One honest
// number: how much better the price we took was than the market's closing price for the same thing. prob is the
// close's no-vig chance of the bet's side at the bet's own line (q, the sharpest close kept: close.book) less the
// chance the price we took implies (its vig in it: 1 / decimal(odds)), in probability (0.0123 is 1.23 points);
// cents the same in cents of American odds (the bet's price less the fair closing price at q, both on one scale
// where even money is 0: +120 against a fair +110 is +10, -105 against a fair -115 is +10). A price with no edge on
// the close is under 0 by about the vig: the vig is never handed back (v2 took the close's vig out of our price, so
// a shopped price beat DraftKings' closing vig price almost every time: NBA 89% beat on a mean CLV of about 0).
//   beat     true past +CLV_TIE, false under -CLV_TIE, null a tie or no judgement; result says which: 'beat', 'missed',
//            'tie', 'line moved', or null (no price to compare)
//   line     'same' where the close is at the bet's line (a moneyline always), 'moved' where it isn't: a moved line is
//            never called beat or missed (prob, cents, ev null; result 'line moved', why says the lines). q is then
//            the close carried to the bet's line where the fit can (the margins' chances, a prop's stat spread), kept
//            for the trust fit alone and flagged carried: true; null where it can't
//   pts      the points the bet's line is better than the close's, its own side's way (spreads, totals, props; a
//            moneyline's null); 0 at the same line
//   ev       the expected return of the bet's own price at q, a push's share out (the same sign as prob: D56's
//            fairBeat reads it, so the gates and the replay's bar agree with beat up to the tie band)
//   book     the close's book: 'pinnacle', 'consensus' (the US books' median), 'draftkings' (ESPN's close), or none
//   v        CLV_V, the definition's version (an older row is valued again: revalueClv)
export const CLV_V = 3;
export const CLV_TIE = 0.001;
// (American odds from a chance, and odds on the cents scale: even money 0, +120 is 20, -115 is -15)
export const americanOf = (p) => (p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
export const centsOf = (american) => (american > 0 ? american - 100 : american + 100);
export function clvOf(bet, close, sigma, dist = null, carry = null) {
  if (!close) return null;
  // (the points it got better than the close, its own side's way)
  let pts = null;
  if (fin(close.line) && fin(bet.line)) {
    if (bet.market === 'spread') pts = bet.line - close.line;
    else if (bet.market === 'total' || bet.market === 'prop') pts = bet.side === 'over' ? close.line - bet.line : bet.line - close.line;
  }
  pts = pts === null ? null : round(pts, 2);
  const moved = pts !== null && pts !== 0;
  const book = close.book ?? (close.source === 'close' ? 'draftkings' : null);
  const base = { pts, prob: null, cents: null, ev: null, q: null, beat: null, result: null, line: moved ? 'moved' : 'same', ...(book ? { book } : {}), v: CLV_V };
  if (!fin(close.fair) || close.fair <= 0 || close.fair >= 1) return { ...base, why: 'no closing price' };
  if (moved) {
    // (the close carried to the bet's line for the trust fit (desk.mjs fitTrust reads q), never judged: the market
    // moved the line, so no price at the bet's line closed)
    let q = null;
    if (bet.market === 'spread' || bet.market === 'total') q = (dist ? atLine(bet.market, bet.side, close, bet.line, dist) : null) ?? (sigma ? close.fair + pts * (0.4 / sigma) : null) ?? (carry ? carry(bet.side, close.line, close.fair, bet.line) : null);
    else q = carry ? carry(bet.side, close.line, close.fair, bet.line) : null;
    q = fin(q) ? round(Math.min(0.99, Math.max(0.01, q)), 4) : null;
    return { ...base, q, ...(q === null ? {} : { carried: true }), result: 'line moved', why: `the close is at ${close.line}, the bet at ${bet.line}: no closing price at the bet's line, not judged` };
  }
  const q = Math.min(0.99, Math.max(0.01, close.fair));
  if (!fin(bet.odds) || !bet.odds) return { ...base, q: round(q, 4), why: 'no price to compare' };
  const prob = round(q - implied(bet.odds), 4);
  const cents = round(centsOf(bet.odds) - centsOf(americanOf(q)), 1);
  // (q leaves a push out, margins.mjs cond: a push gives the stake back, so only the rest is won or lost, as desk.mjs
  // choose prices it; bet.push, the model's push chance at its line, where it kept one)
  const ev = round((1 - (bet.push ?? 0)) * (q * decimal(bet.odds) - 1), 4);
  const result = prob > CLV_TIE ? 'beat' : prob < -CLV_TIE ? 'missed' : 'tie';
  return { ...base, prob, cents, ev, q: round(q, 4), beat: result === 'beat' ? true : result === 'missed' ? false : null, result };
}

// The sharpest close among the closes kept for a bet's side at its line (D115): Pinnacle's no-vig where the archive
// has it, else the median no-vig of two or more US books' closes, else DraftKings' own, else the first. Each candidate
// { book, line, odds, fair } (fair its side's no-vig chance; odds its price there, null where unknown). null with none
export function sharpClose(candidates) {
  const ok = (candidates ?? []).filter((c) => c && fin(c.fair) && c.fair > 0 && c.fair < 1);
  if (!ok.length) return null;
  const pin = ok.find((c) => c.book === 'pinnacle');
  if (pin) return { ...pin, book: 'pinnacle' };
  const us = ok.filter((c) => c.book && c.book !== 'pinnacle' && c.book !== 'consensus');
  if (us.length >= 2) {
    const fairs = us.map((c) => c.fair).sort((a, b) => a - b);
    const mid = fairs.length % 2 ? fairs[(fairs.length - 1) / 2] : (fairs[fairs.length / 2 - 1] + fairs[fairs.length / 2]) / 2;
    const dk = us.find((c) => c.book === 'draftkings');
    return { line: us[0].line ?? null, odds: dk?.odds ?? null, fair: round(mid, 4), book: 'consensus', n: us.length };
  }
  const dk = ok.find((c) => c.book === 'draftkings');
  return dk ? { ...dk, book: 'draftkings' } : { ...ok[0] };
}

// Beat the fair close, D56's one definition, for a live bet (DECISIONS.md D95: the live gates read it as the replay
// does, replay-record.mjs fairBeatOf): its own price has a positive expected return at the close's no-vig fair chance of
// its side (clv.ev, the vig in its price and out of the fair), at the bet's own line only (a moneyline always; a moved
// spread, total or prop has no close to read: null, never the carried guess clv.prob reads). 1, 0 or null
export function fairBeat(bet) {
  const c = bet?.clv;
  if (!c || !fin(c.ev)) return null;
  if (!(bet.market === 'ml' || c.pts === 0)) return null;
  return c.ev > 0 ? 1 : 0;
}

// A prop's close carried to another line through its stat's spread (project.mjs: the mean the close's fair chance
// implies at its line, then that mean's chance at the bet's line, no recalibration either way): (side, fromLine,
// fairSide, toLine) -> the side's chance at toLine, or null (no mean found). null without params
export function propCarry(params) {
  if (!params) return null;
  const plain = { ...params, cal: null, calSide: null };
  return (side, fromLine, fairSide, toLine) => {
    const fairOver = side === 'over' ? fairSide : 1 - fairSide;
    const mu = impliedMean(fromLine, fairOver, plain);
    if (!fin(mu)) return null;
    const c = lineChances(toLine, mu, plain);
    return side === 'over' ? c.over : c.under;
  };
}

// A bet's CLV valued again from the close it kept where it's of an older definition (CLV_V): sigma and dist as
// clvOf's; carryOf(propType), a prop's carry (propCarry) or null. True where it was valued again
export function revalueClv(bet, sigma, dist, carryOf = () => null) {
  if (!bet.close || bet.clv?.v === CLV_V) return false;
  bet.clv = clvOf(bet, bet.close, sigma, bet.market === 'prop' ? null : dist, bet.market === 'prop' ? carryOf(bet.propType) : null);
  return true;
}

// The market's move on a bet (DECISIONS.md D106: what "beat the close" means on the page): whether the market went its
// way from the bet to the close. A close at another line: the line's own way (clv.pts, the points it got better than
// the close, its own side's way: over 0 the market moved toward the bet, under 0 against). A close at the bet's own
// line (a moneyline, pts 0, or a market with no line): the close's no-vig chance of its side (clv.q) less the fair
// chance when it bet (bet.fair), toward past CLV_TIE, against under -CLV_TIE, else a tie (the market didn't move).
// { dir: 1 | -1 | 0, by (the fair's move, a same-line close's; null for a moved line) } or null (no close, no fair).
// Apart from clv.beat and clv.ev (the bet's own price against the close: a shopped price is usually better than the
// close's fair even when the market moved away), which the gates and the replay's bars still read
export function moveOf(bet) {
  const c = bet?.clv;
  if (!c) return null;
  if (fin(c.pts) && c.pts !== 0) return { dir: Math.sign(c.pts), by: null };
  if (!fin(c.q) || !fin(bet.fair)) return null;
  const by = round(c.q - bet.fair, 4);
  return { dir: by > CLV_TIE ? 1 : by < -CLV_TIE ? -1 : 0, by };
}
// (the moves across bets: n with one, toward, against and tied; share the toward of the untied; by the mean move of
// the same-line ones)
export function moveSummary(bets) {
  const m = bets.map(moveOf).filter(Boolean);
  const toward = m.filter((x) => x.dir === 1).length;
  const against = m.filter((x) => x.dir === -1).length;
  const by = m.map((x) => x.by).filter(fin);
  return { n: m.length, toward, against, tie: m.length - toward - against, share: toward + against ? round(toward / (toward + against), 4) : null, by: by.length ? round(by.reduce((s, x) => s + x, 0) / by.length, 4) : null };
}

// CLV across bets (D115): n the bets judged (a close at their line and a price to compare: clv.prob); beat the share of
// them that beat the close (ties and misses in the denominator), missed the share that missed it, tie the ties';
// prob the mean CLV (probability), cents the mean in cents, ev the mean return at the close; pts the mean points on
// the bets with a line; out the rows with a close and no judgement (a moved line, no price), lineMoved of them the
// lines that moved; moved the market's move (moveOf, D106), the page's "beat the close"
export function clvSummary(bets) {
  const withClv = bets.filter((b) => b.clv && fin(b.clv.prob));
  const mean = (list, key) => {
    const v = list.map((b) => b.clv[key]).filter(fin);
    return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length, 4) : null;
  };
  const share = (pred) => (withClv.length ? round(withClv.filter(pred).length / withClv.length, 4) : null);
  const outRows = bets.filter((b) => b.clv && !fin(b.clv.prob));
  const out = outRows.length;
  const lineMoved = outRows.filter((b) => b.clv.line === 'moved' || b.clv.result === 'line moved').length;
  return { n: withClv.length, moved: moveSummary(bets), beat: share((b) => b.clv.beat === true), missed: share((b) => b.clv.beat === false), tie: share((b) => b.clv.beat === null), pts: mean(bets.filter((b) => b.clv), 'pts'), prob: mean(withClv, 'prob'), cents: mean(withClv, 'cents'), ev: mean(withClv, 'ev'), ...(out ? { out, lineMoved } : {}) };
}
