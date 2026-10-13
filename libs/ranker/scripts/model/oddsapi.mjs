// The Odds API (the-odds-api.com, v4), for the model desk: game lines and player props from the desk's one
// book (BOOK, leagues.mjs: DraftKings) with its prices, Pinnacle's sharp line for the fair chance, and the
// past's lines for the backtest. Paid by the credit (20,000 a month), so every call is accounted for and
// budgeted (a busy day up to BURST days' worth):
//
//   cost   /events: free (the coming games' ids); /odds: markets x regions; /events/{id}/odds: the markets it returns x regions; /historical/...: ten
//          times that. Up to 10 bookmakers named count as one region (the docs: "every group of 10 bookmakers
//          is the equivalent of 1 region"), so the desk names just its book and Pinnacle (one region's cost,
//          and Pinnacle sits in the eu region, which asking by region would add as a second) and never asks by
//          region. The live calls name the other US books too (WIDE_BOOKS: the 10 one region covers), for the
//          consensus below: a game lines call costs the same with them; a game's props ask them only for the
//          markets the desk's book returned on that game's last ask (propAsks), so they add no market of their own
//   consensus each market's fair chance by the other books (consensusOf: the median of their de-vigged pairs at
//          the desk's book's own line, from CONSENSUS_MIN books, else none), and the side the desk's book prices
//          OUTLIER or more better than that (its return at the consensus chance): kept beside the book's own
//          fair on the lines, the props, the bets, the CHECKs and the board, for the data only. Nothing is
//          priced off it yet (the desk's book's fair, Pinnacle's for game lines, as before) until the graded rows
//          show it the better chance; the other books missing, none, and nothing changes
//   usage  each call's cost and the balance after it (the API's x-requests-last and x-requests-remaining) land
//          in .cache/model/odds-usage.json, by feature (lines, props, history); each sport's state gets a summary
//   budget the cycle is a month from its first call here (an assumption: the API resets on the plan's billing
//          day, which it doesn't say; a balance that jumps back up starts a new cycle early); 2,000 credits are
//          held back, history has its own 6,000 this cycle, and the rest is split a day at a time between lines
//          and props by what's left and the days left (lines the larger share: they're the last to be cut)
//   when   (run.mjs) the lines bought only while a game inside its window (leagues.mjs TIMING), its news in
//          or at its last chance, has a market still to bet (a bet taken back to price again on news among
//          them); a game's props asked once they're due, near the start, and when they're priced again on news
//          (PROP_ASKS at most): a game days out buys nothing
//   cuts   when credits run low: history first, then props, then lines; with none, or no key, or the API down,
//          the desk prices from ESPN's free board as before
//
// The key (ODDS_API_KEY: the repo's .env, or the workflow's secret) is never printed, logged or written: a URL
// is only ever shown with it taken out.

import path from 'node:path';
import { CACHE, readJson, writeJson } from './sources.mjs';
import { BOOK } from './leagues.mjs';

const API = 'https://api.the-odds-api.com/v4';
const USAGE = path.join(CACHE, 'odds-usage.json');
export const MONTHLY = 20000;
export const RESERVE = 2000;
export const HISTORY_BUDGET = 6000;
// (the daily split of what's left for the live features, after the reserve and history's share)
const SHARES = { lines: 0.3, props: 0.7 };
// (a busy day may spend up to this many days' worth: the NFL's props come nearly all on a Sunday, and a day's
// even share can't re-ask a full slate priced again on news; the month's total and the reserve still hold, as
// the share is of what's left)
const BURST = { lines: 2, props: 4 };

// The sports' keys, and the books: the desk's own (its prices are the ones it bets) and Pinnacle (its line, the
// vig taken out, is the fair chance); for props, the desk's book alone (Pinnacle's props are thin)
export const SPORT_KEYS = { nfl: 'americanfootball_nfl', nba: 'basketball_nba', nhl: 'icehockey_nhl', mlb: 'baseball_mlb' };
export const SHARP = 'pinnacle';
export const LINE_BOOKS = [BOOK, SHARP];
export const PROP_BOOKS = [BOOK];
// (and the other US books, for the consensus only: with the desk's book and Pinnacle the 10 that one region's
// cost covers (The Odds API's keys; williamhill_us is Caesars), never more, or a call costs a second region)
export const OTHER_BOOKS = ['fanduel', 'betmgm', 'williamhill_us', 'espnbet', 'fanatics', 'betrivers', 'hardrockbet', 'ballybet'];
export const WIDE_BOOKS = [BOOK, SHARP, ...OTHER_BOOKS];
// (the consensus: from this many other books at the desk's book's line, else none; the desk's book an outlier on
// a side whose price returns this much or more at the consensus chance)
export const CONSENSUS_MIN = 2;
export const OUTLIER = 0.03;

// (a URL with its key taken out, for anything shown)
export const redact = (s) => String(s).replace(/apiKey=[^&\s"']+/gi, 'apiKey=***');

// (a --dry run, a check on the code, prices from ESPN's free board and spends nothing, unless --paid asks
// for The Odds API's lines too)
const DRY_FREE = process.argv.includes('--dry') && !process.argv.includes('--paid');
export const hasKey = () => !!process.env.ODDS_API_KEY && !DRY_FREE;

// The usage file: the cycle, the calls, the balance
function usage() {
  const u = readJson(USAGE, null) ?? { cycleStart: null, remaining: null, used: null, calls: [], features: {} };
  return u;
}
function saveUsage(u) {
  u.calls = u.calls.slice(-3000);
  writeJson(USAGE, u);
}

// (the cycle's start: the first call here, a month at a time after it)
function cycleOf(u, now = Date.now()) {
  if (!u.cycleStart) return null;
  let start = new Date(u.cycleStart);
  for (;;) {
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next.getTime() > now) return { start, end: next };
    start = next;
  }
}

// What this cycle has spent, by feature, and what's left
export function budget(now = Date.now()) {
  const u = usage();
  const cycle = cycleOf(u, now);
  const spent = { lines: 0, props: 0, history: 0, other: 0 };
  const today = { lines: 0, props: 0, history: 0, other: 0 };
  const day = new Date(now).toISOString().slice(0, 10);
  for (const c of u.calls) {
    if (cycle && Date.parse(c.at) < cycle.start.getTime()) continue;
    spent[c.feature] = (spent[c.feature] ?? 0) + c.cost;
    if (c.at.slice(0, 10) === day) today[c.feature] = (today[c.feature] ?? 0) + c.cost;
  }
  const remaining = u.remaining ?? MONTHLY;
  const daysLeft = cycle ? Math.max(1, Math.ceil((cycle.end.getTime() - now) / 864e5)) : 30;
  // (what the live features may spend today: what's left past the reserve and history's unspent share, over
  // the days left, split by share)
  const historyLeft = Math.max(0, HISTORY_BUDGET - spent.history);
  const free = Math.max(0, remaining - RESERVE - historyLeft);
  const allowance = Object.fromEntries(Object.entries(SHARES).map(([f, s]) => [f, Math.min(Math.floor(free * s), Math.floor(((free * s) / daysLeft) * (BURST[f] ?? 1)))]));
  return {
    cycleStart: cycle?.start.toISOString() ?? null,
    cycleEnd: cycle?.end.toISOString() ?? null,
    daysLeft,
    remaining,
    used: u.used,
    spent,
    today,
    allowance,
    historyLeft: Math.min(historyLeft, Math.max(0, remaining - RESERVE)),
  };
}

// Whether a feature may spend cost credits now: history from its own budget, while the reserve holds; lines and
// props from today's allowance (cut in that order as credits run low: history, props, lines)
export function canSpend(feature, cost) {
  if (!hasKey()) return false;
  const b = budget();
  if (b.remaining - cost < RESERVE) return false;
  if (feature === 'history') return b.historyLeft >= cost;
  return (b.today[feature] ?? 0) + cost <= (b.allowance[feature] ?? 0);
}

// A call: the JSON body (null on any failure, the reason shown with the key taken out), its cost and the
// balance recorded under the feature
export async function call(feature, route, params = {}) {
  if (!hasKey()) return null;
  const query = new URLSearchParams({ ...params, apiKey: process.env.ODDS_API_KEY });
  const url = `${API}${route}?${query}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res = null;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30e3) });
    } catch (err) {
      console.warn(`odds api: ${redact(route)} failed (${redact(err?.message ?? err)})`);
    }
    if (res) {
      const last = Number(res.headers.get('x-requests-last') ?? 0);
      const remaining = res.headers.get('x-requests-remaining');
      const used = res.headers.get('x-requests-used');
      record(feature, route, last, remaining === null ? null : Number(remaining), used === null ? null : Number(used));
      if (res.ok) return res.json().catch(() => null);
      if (res.status === 401 || res.status === 422 || res.status === 404) {
        console.warn(`odds api: ${redact(route)} refused (${res.status})`);
        return null;
      }
      // (429: too many at once, or out of credits; 5xx: try again shortly)
      if (res.status === 429 && remaining !== null && Number(remaining) <= 0) return null;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return null;
}

// (a call's cost and the balance after it; a balance that's grown back starts a new cycle)
function record(feature, route, cost, remaining, used) {
  const u = usage();
  const at = new Date().toISOString();
  if (!u.cycleStart || (u.remaining !== null && remaining !== null && remaining > u.remaining + 1000)) u.cycleStart = at;
  if (remaining !== null) u.remaining = remaining;
  if (used !== null) u.used = used;
  // (a free call (the event list) leaves no line: the log keeps the cycle's spending, and is cut to its last 3,000)
  if (cost) u.calls.push({ at, feature, route: route.replace(/\/events\/[^/]+\//, '/events/{id}/'), cost });
  saveUsage(u);
}

// The summary a sport's state shows: the cycle, what's spent by feature and today, the allowance
export function usageSummary() {
  const b = budget();
  return { monthly: MONTHLY, reserve: RESERVE, historyBudget: HISTORY_BUDGET, ...b, assumed: 'the cycle runs a month from the first call (the API resets monthly; its day is assumed)' };
}

// ---------------------------------------------------------------------------
// Reading what comes back: an event's books' prices, the best US price and the fair chance for each market
// ---------------------------------------------------------------------------

// Pairs matched one to one, nearest first: of every candidate pair ([a, b, distance]), the closest taken, then
// the closest of what's left, each a and each b used once (an MLB doubleheader's two games, the same two
// teams hours apart, each get their own event, never both the first). A Map from a to b
export function matchNearest(candidates) {
  const out = new Map();
  const used = new Set();
  for (const [a, b] of [...candidates].sort((x, y) => x[2] - y[2])) {
    if (out.has(a) || used.has(b)) continue;
    out.set(a, b);
    used.add(b);
  }
  return out;
}

// American odds from decimal
export const american = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));
const implied = (american_) => (american_ > 0 ? 100 / (american_ + 100) : -american_ / (-american_ + 100));
// (both sides' fair chances from a pair of prices: the vig taken out)
const devig = (a, b) => {
  const x = implied(a);
  const y = implied(b);
  return [x / (x + y), y / (x + y)];
};

// The consensus on a market: the other books' price pairs at the desk's book's line (pairs: [first side's,
// second's], American), each de-vigged, their median the first side's fair chance; and the side (of sides)
// whose price at the desk's book (dk, the same pair) returns OUTLIER or more at that chance, its return (by). From
// CONSENSUS_MIN books, else null
export function consensusOf(pairs, dk, sides) {
  const ok = (x) => Array.isArray(x) && x.length === 2 && x.every((o) => Number.isFinite(o) && Math.abs(o) >= 100);
  const fairs = (pairs ?? []).filter(ok).map(([a, b]) => devig(a, b)[0]).sort((a, b) => a - b);
  if (fairs.length < CONSENSUS_MIN) return null;
  const mid = fairs.length >> 1;
  const fair = fairs.length % 2 ? fairs[mid] : (fairs[mid - 1] + fairs[mid]) / 2;
  const out = { fair: Math.round(fair * 1e4) / 1e4, n: fairs.length };
  if (!ok(dk)) return out;
  const ret = [fair / implied(dk[0]) - 1, (1 - fair) / implied(dk[1]) - 1];
  const i = ret[0] >= ret[1] ? 0 : 1;
  return ret[i] >= OUTLIER ? { ...out, outlier: sides[i], by: Math.round(ret[i] * 1e4) / 1e4 } : out;
}

// A row's consensus fields (a bet's, a CHECK's) from its market's consensus (consensusOf's: its first side's
// fair, first): fairConsensus its side's fair chance by the other books, consensusN how many, dkOutlier the side
// the desk's book prices OUTLIER better than them (either side, the row's or not) and dkBy its return there;
// none without a consensus
export function consensusFields(c, side, first) {
  if (!c || !Number.isFinite(c.fair)) return {};
  return { fairConsensus: Math.round((side === first ? c.fair : 1 - c.fair) * 1e4) / 1e4, consensusN: c.n, ...(c.outlier ? { dkOutlier: c.outlier, dkBy: c.by } : {}) };
}

// A game's props asks: the markets the desk's book returned on its last ask (known) of all the desk's book and
// the other books (WIDE_BOOKS), the rest of the desk's book alone (PROP_BOOKS). A call's cost is the markets it
// returns, so the other books, asked only for markets the desk's book posts, add none of their own (one it has
// taken down since its last ask the most: what canSpend already holds for), and a market it posts later is
// asked of it alone, the others joining on the ask after. The first ask: the desk's book alone, as before
export function propAsks(markets, known = null) {
  const seen = new Set(known ?? []);
  const wide = markets.filter((m) => seen.has(m));
  const own = markets.filter((m) => !seen.has(m));
  return [...(wide.length ? [{ markets: wide, bookmakers: WIDE_BOOKS }] : []), ...(own.length ? [{ markets: own, bookmakers: PROP_BOOKS }] : [])];
}

// An event's game lines as the desk prices them: for each market, the desk's book's line and both sides'
// prices there, and the fair chance of the home (or over) side: Pinnacle's at that same line, the vig taken
// out, when it posts it; else the desk's book's own, de-vigged (both kept: the backtest compares them); and the
// other books' consensus at that line (consensusOf, Pinnacle among them; null without CONSENSUS_MIN), the data's
export function linesFromEvent(ev) {
  const book = (ev.bookmakers ?? []).find((b) => b.key === BOOK);
  const sharp = (ev.bookmakers ?? []).find((b) => b.key === SHARP);
  if (!book) return null;
  const sideOf = (m, o) => (m.key === 'totals' ? o.name.toLowerCase() : o.name === ev.home_team ? 'home' : 'away');
  // (a market's two sides: each one's line (a spread's is its own side's) and price)
  const read = (b, key) => {
    const m = b?.markets?.find((x) => x.key === key);
    if (!m) return null;
    const out = {};
    for (const o of m.outcomes ?? []) out[sideOf(m, o)] = { line: o.point ?? null, odds: american(o.price) };
    return out;
  };
  const out = { book: BOOK };
  for (const key of ['h2h', 'spreads', 'totals']) {
    const mine = read(book, key);
    const sides = key === 'totals' ? ['over', 'under'] : ['home', 'away'];
    if (!mine?.[sides[0]] || !mine?.[sides[1]]) continue;
    const own = devig(mine[sides[0]].odds, mine[sides[1]].odds)[0];
    const theirs = read(sharp, key);
    const same = theirs?.[sides[0]] && theirs?.[sides[1]] && theirs[sides[0]].line === mine[sides[0]].line;
    const pin = same ? devig(theirs[sides[0]].odds, theirs[sides[1]].odds)[0] : null;
    // (the other books' pairs at the desk's book's line, both sides)
    const at = (x) => x?.[sides[0]] && x?.[sides[1]] && sides.every((s) => x[s].line === mine[s].line);
    const pairs = (ev.bookmakers ?? [])
      .filter((b) => b.key !== BOOK)
      .map((b) => read(b, key))
      .filter(at)
      .map((x) => sides.map((s) => x[s].odds));
    const consensus = consensusOf(pairs, sides.map((s) => mine[s].odds), sides);
    out[key] = { line: mine[sides[0]].line, prices: Object.fromEntries(sides.map((s) => [s, mine[s].odds])), fair: pin ?? own, own, sharp: pin, consensus };
  }
  return out;
}
