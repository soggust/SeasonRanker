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

// A bet's CLV against its close (round F, 2026-10-18: the loss review's B1-B6). CLV is the bet's own price against
// the close's no-vig chance at the bet's own line, the vig out of both: prob = q - mine, where
//   q     the close's fair (no-vig) chance of the bet's side, carried to the bet's line where the line moved: a
//         spread or total through the margins' chances (dist, margins.mjs atLine; without them about 0.4 / sigma a
//         point), a prop through its stat's own spread (carry(side, fromLine, fairSide, toLine): propCarry); a
//         moved line with no way to carry it is left out with its reason (why), never counted as zero or a loss
//   mine  the bet's price with the vig out at the close's own margin on that side (its implied chance over the
//         close's implied over its fair): a price that didn't move is 0, the vig never read as lost value. With
//         no closing price, bet.fair (the book's fair when it bet)
// ev is apart: the expected return at q and the bet's own price (a push's share out), the vig in it (a bet at the
// close itself returns about minus the vig). beat: true past +CLV_TIE, false under -CLV_TIE, null a tie (result
// says which: 'beat', 'tie', 'lose'). pts: the points it got better than the close, its own side's way (spreads,
// totals, props; a fixed line's 0). v: CLV_V, the definition's version (an older row is valued again: revalueClv)
export const CLV_V = 2;
export const CLV_TIE = 0.001;
export function clvOf(bet, close, sigma, dist = null, carry = null) {
  if (!close) return null;
  // (the points it got better than the close, its own side's way)
  let pts = null;
  if (fin(close.line) && fin(bet.line)) {
    if (bet.market === 'spread') pts = bet.line - close.line;
    else if (bet.market === 'total' || bet.market === 'prop') pts = bet.side === 'over' ? close.line - bet.line : bet.line - close.line;
  }
  pts = pts === null ? null : round(pts, 2);
  const none = (why) => ({ pts, prob: null, ev: null, q: null, beat: null, result: null, why, v: CLV_V });
  if (!fin(close.fair) || close.fair <= 0 || close.fair >= 1) return none('no closing price');
  // (the closing fair chance of its side at its own line)
  let q = close.fair;
  if (pts) {
    if (bet.market === 'spread' || bet.market === 'total') q = (dist ? atLine(bet.market, bet.side, close, bet.line, dist) : null) ?? (sigma ? close.fair + pts * (0.4 / sigma) : null);
    else q = bet.market === 'prop' && carry ? carry(bet.side, close.line, close.fair, bet.line) : null;
    if (!fin(q)) return none(`line moved from ${bet.line} to ${close.line}: no equivalent line to carry the close to`);
  }
  q = Math.min(0.99, Math.max(0.01, q));
  // (the bet's own price, the vig out at the close's margin on its side)
  const k = fin(close.odds) && close.odds ? implied(close.odds) / close.fair : null;
  const mine = k && fin(bet.odds) && bet.odds ? implied(bet.odds) / k : fin(bet.fair) ? bet.fair : null;
  const prob = mine === null ? null : round(q - mine, 4);
  // (q leaves a push out, margins.mjs cond: a push gives the stake back, so only the rest is won or lost, as
  // desk.mjs choose prices it; bet.push, the model's push chance at its line, where it kept one)
  const ev = fin(bet.odds) && bet.odds ? round((1 - (bet.push ?? 0)) * (q * decimal(bet.odds) - 1), 4) : null;
  const result = prob === null ? null : prob > CLV_TIE ? 'beat' : prob < -CLV_TIE ? 'lose' : 'tie';
  return { pts, prob, ev, q: round(q, 4), beat: result === 'beat' ? true : result === 'lose' ? false : null, result, v: CLV_V, ...(prob === null ? { why: 'no price to compare' } : {}) };
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

// CLV across bets: how many have it (a price to compare: clv.prob), the share that beat the close of those that
// didn't tie it, the ties' share, the mean points (spreads, totals, props), chance (prob: the CLV) and expected
// return at the close (ev, the vig in it); out: the rows with a close and no CLV (a moved line not carried, no price)
export function clvSummary(bets) {
  const withClv = bets.filter((b) => b.clv && fin(b.clv.prob));
  const decided = withClv.filter((b) => b.clv.beat === true || b.clv.beat === false);
  const mean = (key) => {
    const v = withClv.map((b) => b.clv[key]).filter(fin);
    return v.length ? round(v.reduce((s, x) => s + x, 0) / v.length, 4) : null;
  };
  const out = bets.filter((b) => b.clv && !fin(b.clv.prob)).length;
  return { n: withClv.length, beat: decided.length ? round(decided.filter((b) => b.clv.beat).length / decided.length, 4) : null, tie: withClv.length ? round((withClv.length - decided.length) / withClv.length, 4) : null, pts: mean('pts'), prob: mean('prob'), ev: mean('ev'), ...(out ? { out } : {}) };
}
