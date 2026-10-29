// Polymarket as a free market signal (DECISIONS.md D100, the owner's research round of 2026-10-29): the public Gamma,
// data and CLOB APIs read for the sharps' trades and the market's own price, cached under .cache/polymarket (never
// committed; downloaded data is untrusted input and is only ever parsed as JSON, never executed). No account, no key,
// no trading, no paid plan: every endpoint here is the public one, rate-limited (REQ_GAP between calls, a back-off on
// 429 and 5xx), and a download already on disk is never asked for twice.
//
//   events       gamma-api /events?tag_slug=<league>&closed=true (100 a page, offset paged): each league's game events
//                (slug <league>-<away>-<home>-<yyyy-mm-dd>, title "Away vs. Home") with their moneyline, spread and
//                total markets (sportsMarketType moneyline | spreads | totals; line, outcomes, clobTokenIds,
//                conditionId, gameStartTime, outcomePrices once resolved, closedTime). Props and halves left out
//                (the owner: props stay out of scope; Polymarket does not cover the desk's)
//   leaderboard  data-api /v1/leaderboard?category=sports&timePeriod=all|month (the API has day, week, month, all:
//                no 12-month window exists, so "all" (sports trading began in 2024) and "month" stand in for it)
//   trades       data-api /trades?user=<wallet>&limit=500&end=<ts>: a wallet's trades walked back in time by the
//                oldest timestamp of the page before (the offset is capped at 10,000, the time walk isn't), each
//                trade's time, side (BUY/SELL), token, condition, price, size, event slug, outcome. A wallet is
//                walked back to SINCE or MAX_CALLS pages, whichever first; the file says whether it is complete
//   prices       clob /prices-history?market=<token>&startTs&endTs&fidelity: a token's price (its chance, no vig)
//                by the minute over a window before the game's start, for the market's own close
//
//   node libs/ranker/scripts/model/polymarket.mjs events nba nhl mlb nfl
//   node libs/ranker/scripts/model/polymarket.mjs leaderboard
//   node libs/ranker/scripts/model/polymarket.mjs trades [--top N] [--max-calls K] [--since ISO]
//   node libs/ranker/scripts/model/polymarket.mjs prices <league> <jobs.json>   (jobs: [{ token, start, end }])
//
// The matching to the desk's games (by sport, ET day and team nickname), the scoring of the wallets and every
// measurement live in research/polymarket-sharps.mjs; the candidate's pricing hook is polySignal below.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const CACHE = path.join(ROOT, '.cache/polymarket');
export const GAMMA = 'https://gamma-api.polymarket.com';
export const DATA = 'https://data-api.polymarket.com';
export const CLOB = 'https://clob.polymarket.com';
export const LEAGUES = ['nba', 'nhl', 'mlb', 'nfl'];
export const MARKET_TYPES = { moneyline: 'ml', spreads: 'spread', totals: 'total' };
// (the leaderboard's pages: 50 a call, whatever limit is asked; the top ALL_TOP of all time and MONTH_TOP of the month)
export const ALL_TOP = 300;
export const MONTH_TOP = 100;
export const REQ_GAP = 220;
export const MAX_RETRY = 6;
const fin = Number.isFinite;
const dir = (p) => mkdirSync(p, { recursive: true });
const readJson = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const write = (f, v) => {
  dir(path.dirname(f));
  writeFileSync(f, JSON.stringify(v));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let last = 0;
let calls = 0;
export const callCount = () => calls;
// One public GET, rate-limited and retried (429 and 5xx: a back-off doubling from 2s); a 404 is reported, never guessed around
export async function getJson(url) {
  for (let i = 0; ; i++) {
    const wait = last + REQ_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    calls++;
    let res;
    try {
      res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'seasonranker-research/1.0' } });
    } catch (err) {
      if (i >= MAX_RETRY) throw err;
      await sleep(2000 * 2 ** i);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (i >= MAX_RETRY) throw new Error(`${res.status} after ${i} retries: ${url}`);
      await sleep(2000 * 2 ** i);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}

// ---- events (Gamma) ----

export const WINDOW_MS = 7 * 864e5;
export const GAME_SLUG = /^(nba|nhl|mlb|nfl)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})(?:-.*)?$/;
export const eventsFile = (league) => path.join(CACHE, 'events', `${league}.json`);

const slimMarket = (m) => {
  const type = MARKET_TYPES[m.sportsMarketType];
  if (!type) return null;
  const arr = (s) => {
    try {
      const v = typeof s === 'string' ? JSON.parse(s) : s;
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  const outcomes = arr(m.outcomes);
  const tokens = arr(m.clobTokenIds);
  const prices = arr(m.outcomePrices)?.map(Number) ?? null;
  if (!outcomes || !tokens || outcomes.length !== 2 || tokens.length !== 2) return null;
  return { id: String(m.id), cid: m.conditionId, slug: m.slug, q: m.question, type, line: fin(Number(m.line)) && m.line !== null && m.line !== undefined ? Number(m.line) : null, outcomes, tokens, prices, closed: !!m.closed, closedTime: m.closedTime ?? null, resolved: m.umaResolutionStatus === 'resolved', volume: Number(m.volume) || 0, gst: m.gameStartTime ?? null };
};

const slimEvent = (e) => {
  const mk = GAME_SLUG.exec(e.slug ?? '');
  if (!mk) return null;
  const markets = (e.markets ?? []).map(slimMarket).filter(Boolean);
  if (!markets.length) return null;
  const gst = markets.map((m) => m.gst).find(Boolean) ?? null;
  return { id: String(e.id), slug: e.slug, title: e.title, league: mk[1], day: mk[4], awayAbbr: mk[2], homeAbbr: mk[3], start: gst ? new Date(gst.replace(' ', 'T').replace(/\+00$/, 'Z')).toISOString() : null, endDate: e.endDate ?? null, volume: Number(e.volume) || 0, markets };
};

// Every closed game event of a league since `since` (Gamma pages of 100 by startDate, a week's window at a time:
// Gamma refuses an offset past about 2,000 ("use /events/keyset"), and start_date_max keeps a window under it; an
// MLB month lists more than 2,000 events), slimmed; resumed from the file by window
export async function pullEvents(league, { since = '2025-08-01T00:00:00Z', log = console.log } = {}) {
  const file = eventsFile(league);
  const have = readJson(file, { league, since, windows: {}, done: false, events: [] });
  const byId = new Map(have.events.map((e) => [e.id, e]));
  const windows = have.windows ?? {};
  const months = [];
  for (let d = Date.parse(since); d < Date.now(); d += WINDOW_MS) months.push([new Date(d).toISOString(), new Date(d + WINDOW_MS).toISOString()]);
  for (const [lo, hi] of months) {
    if (windows[lo]?.done) continue;
    let offset = windows[lo]?.offset ?? 0;
    for (;;) {
      const url = `${GAMMA}/events?tag_slug=${league}&closed=true&limit=100&offset=${offset}&start_date_min=${encodeURIComponent(lo)}&start_date_max=${encodeURIComponent(hi)}&order=startDate&ascending=true`;
      const page = await getJson(url);
      if (!Array.isArray(page)) throw new Error(`events: not a list at offset ${offset}`);
      for (const e of page) {
        const s = slimEvent(e);
        if (s) byId.set(s.id, s);
      }
      offset += page.length;
      windows[lo] = { offset, done: page.length < 100 };
      const out = { league, since, windows, done: months.every(([m]) => windows[m]?.done), events: [...byId.values()].sort((a, b) => (a.start ?? a.day).localeCompare(b.start ?? b.day)), pulled: new Date().toISOString() };
      write(file, out);
      log(`${league} ${lo.slice(0, 7)}: ${offset} events read, ${out.events.length} games kept`);
      if (windows[lo].done) break;
    }
  }
  return readJson(file);
}

export const readEvents = (league) => readJson(eventsFile(league), { events: [] }).events;

// ---- leaderboard (data API) ----

export const leaderboardFile = (period) => path.join(CACHE, `leaderboard-${period}.json`);

export async function pullLeaderboard({ periods = { all: ALL_TOP, month: MONTH_TOP }, log = console.log } = {}) {
  const out = {};
  for (const [period, top] of Object.entries(periods)) {
    const file = leaderboardFile(period);
    const have = readJson(file, null);
    if (have?.rows?.length >= top) {
      out[period] = have.rows;
      continue;
    }
    const rows = [];
    for (let offset = 0; offset < top; offset += 50) {
      const page = await getJson(`${DATA}/v1/leaderboard?category=sports&timePeriod=${period}&limit=50&offset=${offset}`);
      if (!Array.isArray(page) || !page.length) break;
      rows.push(...page.map((r) => ({ rank: Number(r.rank), wallet: String(r.proxyWallet).toLowerCase(), name: r.userName ?? null, vol: Number(r.vol) || 0, pnl: Number(r.pnl) || 0 })));
      if (page.length < 50) break;
    }
    write(file, { period, pulled: new Date().toISOString(), rows });
    log(`leaderboard ${period}: ${rows.length} wallets`);
    out[period] = rows;
  }
  return out;
}

// ---- trades (data API) ----

export const tradesFile = (wallet) => path.join(CACHE, 'trades', `${wallet.toLowerCase()}.json`);
const slimTrade = (t) => ({ t: Number(t.timestamp), side: t.side, asset: String(t.asset), cid: t.conditionId, price: Number(t.price), size: Number(t.size), slug: t.eventSlug || t.slug || '', mslug: t.slug || '', outcome: t.outcome ?? null, oi: fin(Number(t.outcomeIndex)) ? Number(t.outcomeIndex) : null, tx: t.transactionHash ?? null });
const tradeKey = (x) => `${x.tx}|${x.asset}|${x.side}|${x.size}|${x.price}|${x.t}`;

// A wallet's trades back to `since`, 500 a page by the `end` time walk; at most maxCalls pages (a market maker's
// year is millions of trades): the file says `complete` and how far back it reached
export async function pullTrades(wallet, { since = '2025-10-01T00:00:00Z', maxCalls = 120, log = console.log } = {}) {
  const w = wallet.toLowerCase();
  const file = tradesFile(w);
  const have = readJson(file, null);
  if (have && (have.complete || have.calls >= maxCalls)) return have;
  const sinceTs = Math.floor(Date.parse(since) / 1000);
  const seen = new Set((have?.trades ?? []).map(tradeKey));
  const trades = have?.trades ?? [];
  let end = have?.oldest ?? null;
  let n = have?.calls ?? 0;
  let complete = false;
  while (n < maxCalls) {
    const url = `${DATA}/trades?user=${w}&limit=500${end ? `&end=${end}` : ''}`;
    const page = await getJson(url);
    n++;
    if (!Array.isArray(page) || !page.length) {
      complete = true;
      break;
    }
    let fresh = 0;
    for (const t of page) {
      const x = slimTrade(t);
      const k = tradeKey(x);
      if (seen.has(k)) continue;
      seen.add(k);
      trades.push(x);
      fresh++;
    }
    const oldest = Math.min(...page.map((t) => Number(t.timestamp)));
    // (a page of nothing new at the same second: step past it)
    end = fresh ? oldest : oldest - 1;
    if (oldest < sinceTs || page.length < 500) {
      complete = true;
      break;
    }
  }
  const out = { wallet: w, since, calls: n, complete, oldest: end, pulled: new Date().toISOString(), trades: trades.sort((a, b) => a.t - b.t) };
  write(file, out);
  log(`${w.slice(0, 10)}: ${out.trades.length} trades in ${n} calls${complete ? '' : ' (capped)'}, back to ${new Date((out.trades[0]?.t ?? 0) * 1000).toISOString().slice(0, 10)}`);
  return out;
}

export const readTrades = (wallet) => readJson(tradesFile(wallet), null);

// ---- prices (CLOB) ----

export const pricesFile = (token) => path.join(CACHE, 'prices', `${token.slice(0, 24)}.json`);

// A token's price history over [start, end] (unix seconds) by the minute (fidelity minutes); cached by token
export async function pullPrices(token, start, end, { fidelity = 5 } = {}) {
  const file = pricesFile(token);
  const have = readJson(file, null);
  if (have && have.token === token && have.start <= start && have.end >= end) return have;
  const r = await getJson(`${CLOB}/prices-history?market=${token}&startTs=${start}&endTs=${end}&fidelity=${fidelity}`);
  const out = { token, start, end, fidelity, pulled: new Date().toISOString(), history: (r?.history ?? []).map((h) => [Number(h.t), Number(h.p)]) };
  write(file, out);
  return out;
}

export const readPrices = (token) => readJson(pricesFile(token), null);

// The last price at or before `ts` (unix seconds) in a history, null without one
export const priceAt = (hist, ts) => {
  let p = null;
  for (const [t, v] of hist ?? []) {
    if (t > ts) break;
    p = v;
  }
  return p;
};

// ---- the candidate's hook (research, D100): the sharps' flow before the bet's moment as a shift of the fair ----
//
// POLY_SIGNAL=<variant> (shift1 | shift2) turns it on for one run (the gate's candidate `env:POLY_SIGNAL=shift1`);
// off, nothing priced moves (the champion). The signal file (.cache/polymarket/signal/<sport>.json, written by
// research/polymarket-sharps.mjs) carries, per ESPN event id and market and line, the scored wallets' trades on the
// home/over side less the away/under side in USDC at each moment, so the lookup at the bet's moment `at` reads
// only trades before it (no look-ahead: the wallets' scores are as of the trade's day, the flow is the trades before
// `at`). The fair moves toward the sharps' side by KAPPA[variant] points at a net of SATURATE USDC or more, less in
// proportion under it, nothing under the floor NET_MIN.
export const KAPPA = { shift1: 0.01, shift2: 0.02 };
export const NET_MIN = 1000;
export const SATURATE = 10000;
export const polyVariant = () => (KAPPA[process.env.POLY_SIGNAL] ? process.env.POLY_SIGNAL : null);
const signalCache = new Map();
export const signalFile = (sport) => path.join(CACHE, 'signal', `${sport}.json`);
function loadSignal(sport) {
  if (signalCache.has(sport)) return signalCache.get(sport);
  const f = signalFile(sport);
  const v = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  signalCache.set(sport, v);
  return v;
}
// The net flow (USDC, home/over side positive) of the scored wallets on a market before `at` (ms), null without one
export function flowBefore(sport, event, market, line, at) {
  const S = loadSignal(sport);
  const rows = S?.[`${event}|${market}|${line === null || line === undefined ? '' : line}`];
  if (!rows) return null;
  let net = 0;
  let n = 0;
  for (const [t, usd] of rows) {
    if (t >= at) break;
    net += usd;
    n++;
  }
  return n ? net : null;
}
export const flowShift = (net, variant) => {
  if (!fin(net) || Math.abs(net) < NET_MIN) return 0;
  return Math.sign(net) * (KAPPA[variant] ?? 0) * Math.min(1, Math.abs(net) / SATURATE);
};
// The priced chance with the sharps' shift (the row's ctx: sport, event, market, line, at, side), or null when off
export function polySignal(ctx, p) {
  const v = polyVariant();
  if (!v || !ctx?.sport || !ctx.event || !fin(ctx.at) || !fin(p)) return null;
  const market = ctx.market === 'h2h' ? 'ml' : ctx.market;
  if (!['ml', 'spread', 'total'].includes(market)) return null;
  const net = flowBefore(ctx.sport, String(ctx.event), market, fin(ctx.line) ? ctx.line : null, ctx.at);
  if (net === null) return null;
  const flip = ctx.side === 'under' || ctx.side === 'away';
  const shift = flowShift(net, v) * (flip ? -1 : 1);
  if (!shift) return null;
  return { p: Math.min(0.995, Math.max(0.005, p + shift)), net, shift, variant: v };
}

// ---- cli ----

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  if (cmd === 'events') {
    for (const league of args.slice(1).filter((x) => LEAGUES.includes(x))) await pullEvents(league);
  } else if (cmd === 'leaderboard') {
    await pullLeaderboard();
  } else if (cmd === 'trades') {
    const top = Number(val('--top') ?? ALL_TOP);
    const maxCalls = Number(val('--max-calls') ?? 120);
    const since = val('--since') ?? '2025-10-01T00:00:00Z';
    const lb = await pullLeaderboard();
    const wallets = [...new Set([...lb.all.slice(0, top), ...lb.month].map((r) => r.wallet))];
    console.log(`${wallets.length} wallets`);
    for (const w of wallets) await pullTrades(w, { since, maxCalls });
  } else if (cmd === 'prices') {
    const jobs = JSON.parse(readFileSync(args[2], 'utf8'));
    let n = 0;
    for (const j of jobs) {
      await pullPrices(j.token, j.start, j.end);
      if (++n % 200 === 0) console.log(`${args[1]}: ${n} of ${jobs.length} price histories`);
    }
    console.log(`${args[1]}: ${jobs.length} price histories (${calls} calls)`);
  } else console.log('usage: polymarket.mjs events <league...> | leaderboard | trades [--top N] [--max-calls K] [--since ISO] | prices <league> <jobs.json>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
