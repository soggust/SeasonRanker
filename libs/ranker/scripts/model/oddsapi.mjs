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
//          (an answer with no data is free, the docs: the desk's book asked alone for the markets it didn't post
//          last time costs only what it posts now; odds-usage.json's cost line for each call shows it). A wide
//          game lines call refused is asked again of the desk's book and Pinnacle alone (gameLines), so the
//          pricing never waits on the consensus books
//   consensus each market's fair chance by the other books (consensusOf: the median of their de-vigged pairs at
//          the desk's book's own line, from CONSENSUS_MIN books, else none), and the side the desk's book prices
//          OUTLIER or more better than that (its return at the consensus chance): kept beside the book's own
//          fair on the lines, the props, the bets, the CHECKs and the board, for the data only. Nothing is
//          priced off it yet (the desk's book's fair, Pinnacle's for game lines, as before) until the graded rows
//          show it the better chance; the other books missing, none, and nothing changes
//   best   D74 (the owner, 2026-10-20): each side is bet and shown at the best price among the US books at the desk's
//          book's own line (best-price.mjs bestPair: sane pairs only, Pinnacle never), never worse than the desk's
//          book's; the fair stays Pinnacle's (else the desk's book's own pair). The first props ask names the other
//          books for the markets ESPN's free board already lists (run.mjs), so they still add no market of their own
//   usage  each call's cost and the balance after it (the API's x-requests-last and x-requests-remaining) land
//          in .cache/model/odds-usage.json, by feature (lines, props, history); each sport's state gets a summary
//   budget the cycle is a month from its first call here (an assumption: the API resets on the plan's billing
//          day, which it doesn't say; a balance that jumps back up starts a new cycle early); the $30 plan's
//          MONTHLY never exceeded: the desk's own tally of the cycle (mirrored in the repo, SPEND_FILE) and the
//          API's balance, the lower, bind (D55); RESERVE held back, and the rest paced a day at a time between lines
//          and props by what's left over the days left (lines the larger share of the cuts: they're the last cut),
//          the props' asks by value (TIERS), the optional refreshes only while the month projects under TARGET
//   when   (run.mjs) the lines bought only while a game inside its window (leagues.mjs TIMING), its news in
//          or at its last chance, has a market still to bet (a bet taken back to price again on news among
//          them); a game's props asked once they're due, near the start, and when they're priced again on news
//          (PROP_ASKS at most): a game days out buys nothing
//   cuts   when credits run low: the snapshot first, then history, then props, then lines; with none, or no key, or the API down,
//          the desk prices from ESPN's free board as before
//
// The key (ODDS_API_KEY: the repo's .env, or the workflow's secret) is never printed, logged or written: a URL
// is only ever shown with it taken out.

import path from 'node:path';
import { CACHE, readJson, writeJson } from './sources.mjs';
import { BOOK } from './leagues.mjs';
import { bestPair, codeOf, sideBest } from './best-price.mjs';

const API = 'https://api.the-odds-api.com/v4';
const USAGE = path.join(CACHE, 'odds-usage.json');
// (the $30 plan's credits a month: never exceeded, whatever the API's balance says (DECISIONS.md D55; the 5M plan of
// 2026-10-19's month reads millions): the desk's own tally of the cycle binds with the API's balance, the lower)
export const MONTHLY = 20000;
// (the 5M plan's leftover month, the owner's go of 2026-10-20 (DECISIONS.md D61): until BIG_UNTIL the desk's cycle may
// spend up to BIG_MONTHLY, the API's real balance still binding (the lower of the two); what it spent before
// BIG_UNTIL in the same cycle (u.big, recordOn) never counts against MONTHLY after it, so the $30 plan's reset finds
// its month whole. A usage file without u.big (a lost cache) counts the window's spending: it under-spends, never over)
export const BIG_UNTIL = '2026-11-09T00:00:00Z';
export const BIG_MONTHLY = 150000;
export const monthlyAt = (now = Date.now()) => (now < Date.parse(BIG_UNTIL) ? BIG_MONTHLY : MONTHLY);
// (held back so the cycle never runs dry: 5%, so about 95% of the month is used, TARGET)
export const RESERVE = 1000;
export const TARGET = 0.95;
// (history's own cap: bought only by a local backtest (backtest.mjs --buy, odds-history.mjs pull), whose usage file is
// that machine's; the desk no longer holds it back from the live features (D55), its spending counts in the tally)
export const HISTORY_BUDGET = 6000;
// The morning snapshot (odds-history.mjs morning, once a day from 10 AM Eastern: every coming game's lines and the
// day's props at the desk's book and Pinnacle, kept in the priced history; the owner's ask of 2026-10-18,
// DECISIONS.md D29): its own feature, at most dayCap a UTC day, and the first cut when credits run low: it stops
// while hold more than the reserve is left, before props or lines feel it
export const SNAPSHOT = { dayCap: 300, hold: 2000 };
// (the daily split of what's left for the live features, past the reserve)
const SHARES = { lines: 0.3, props: 0.7 };
// (a busy day may spend up to this many days' worth: the NFL's props come nearly all on a Sunday, and a day's
// even share can't re-ask a full slate priced again on news; the month's total and the reserve still hold, as
// the share is of what's left)
const BURST = { lines: 2, props: 4 };
// (and the month on a straight line: by any moment the cycle may have spent at most its share of MONTHLY less the reserve
// for the time gone plus AHEAD_DAYS, so a greedy week can't spend the month's end and the slow days bank credits
// for the NFL's Sundays)
export const AHEAD_DAYS = 3;
// (the props' asks by value, D55: each may spend this share of the day's props allowance, so with credits short the
// first asks (props soon after their window opens) come before the asks on news or owed (bets taken back), those
// before the late ones (the last chance, where the stat's line moves by the close: D42's lineup risk) and the near
// ones (the close's line for the open bets), and the optional refreshes last)
export const TIERS = { first: 1, newsLag: 1, news: 0.9, owed: 0.9, late: 0.8, near: 0.8, refresh: 0.6 };
// (the tally mirrored where the desk commits (GitHub only: a local run's calls are that machine's), so a lost cache
// can't reset the month: read back when the cache has no cycle, or a smaller tally of the same cycle)
export const SPEND_FILE = path.resolve(import.meta.dirname, '../../../../apps/nfl/scripts/model/odds-spend.json');

// The sports' keys, and the books: the desk's own (its prices are the ones it bets) and Pinnacle (its line, the
// vig taken out, is the fair chance); for props, the desk's book alone (Pinnacle's props are thin)
// (mma: one key for every promotion's bouts, h2h and totals; mma-desk.mjs asks it for the whole board at once, 2 credits)
export const SPORT_KEYS = { nfl: 'americanfootball_nfl', nba: 'basketball_nba', nhl: 'icehockey_nhl', mlb: 'baseball_mlb', mma: 'mma_mixed_martial_arts' };
export const SHARP = 'pinnacle';
export const LINE_BOOKS = [BOOK, SHARP];
export const PROP_BOOKS = [BOOK];
// (and the other US books, for the consensus only: with the desk's book and Pinnacle the 10 that one region's
// cost covers (The Odds API's keys, checked against its bookmaker list 2026-10-13: williamhill_us is Caesars,
// espnbet theScore Bet (formerly ESPN BET, the key kept); fanduel, betmgm, fanatics, betrivers in its us region,
// espnbet, hardrockbet, ballybet in us2, named all the same), never more, or a call costs a second region)
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

// The usage file: the cycle, the calls, the balance, the cycle's tally by feature (cycle) and the UTC day's (day)
function usage() {
  return readJson(USAGE, null) ?? { cycleStart: null, remaining: null, used: null, calls: [], features: {} };
}
function saveUsage(u) {
  u.calls = u.calls.slice(-3000);
  writeJson(USAGE, u);
  // (the mirror: GitHub's runs only)
  if (process.env.GITHUB_ACTIONS === 'true') writeJson(SPEND_FILE, mirrorOf(u));
}
// (what the mirror keeps: the cycle, its tally, the day's, the API's last balance)
export const mirrorOf = (u) => ({ about: 'The Odds API credits the desk spent this cycle (oddsapi.mjs, DECISIONS.md D55): the cache\'s tally mirrored, so a lost cache cannot reset the month', cycleStart: u.cycleStart, cycle: u.cycle ?? null, day: u.day ?? null, remaining: u.remaining ?? null });
const readMirror = () => readJson(SPEND_FILE, null);

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

// (the usage with the mirror's word where it knows more: a cache with no cycle takes the mirror's while that cycle
// runs; the same cycle, each feature's larger tally)
export function withMirror(u, mirror, now = Date.now()) {
  if (!mirror?.cycleStart) return u;
  const mc = cycleOf(mirror, now);
  if (!mc) return u;
  if (!u.cycleStart) return { ...u, cycleStart: mirror.cycleStart, cycle: structuredClone(mirror.cycle ?? null), day: structuredClone(mirror.day ?? null), remaining: u.remaining ?? mirror.remaining ?? null };
  const uc = cycleOf(u, now);
  if (!uc || uc.start.getTime() !== mc.start.getTime() || !mirror.cycle || mirror.cycle.start !== u.cycle?.start) return u;
  const max = (a = {}, b = {}) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) => [k, Math.max(a[k] ?? 0, b[k] ?? 0)]));
  const day = u.day && mirror.day && u.day.date === mirror.day.date ? { date: u.day.date, spent: max(u.day.spent, mirror.day.spent) } : u.day;
  return { ...u, cycle: { start: u.cycle.start, spent: max(u.cycle.spent, mirror.cycle.spent) }, day };
}

// (the cycle's tally: the running count (cycle), or, from a usage file before it, the calls kept since the start)
function tallyOf(u, cycle) {
  if (!cycle) return {};
  if (u.cycle?.start === cycle.start.toISOString()) return { ...u.cycle.spent };
  if (u.cycle) return {};
  const out = {};
  for (const c of u.calls ?? []) if (Date.parse(c.at) >= cycle.start.getTime()) out[c.feature] = (out[c.feature] ?? 0) + c.cost;
  return out;
}

// What this cycle has spent, by feature, and what's left: budgetOf on the usage file and its mirror
export function budget(now = Date.now()) {
  return budgetOf(usage(), now, { mirror: readMirror() });
}
// (the same on a usage (a test's), with a mirror: remaining is the lower of the API's balance and MONTHLY less the
// cycle's tally; the live features' allowance today is what's left past the reserve over the days left, each its
// share, a busy day up to its burst)
export function budgetOf(u0, now = Date.now(), { mirror = null } = {}) {
  const u = withMirror(u0, mirror, now);
  const cycle = cycleOf(u, now);
  const zero = { lines: 0, props: 0, history: 0, snapshot: 0, other: 0 };
  const spent = { ...zero, ...tallyOf(u, cycle) };
  const day = new Date(now).toISOString().slice(0, 10);
  const today = { ...zero };
  if (u.day?.date === day) Object.assign(today, u.day.spent);
  else if (!u.day) for (const c of u.calls ?? []) if (c.at.slice(0, 10) === day) today[c.feature] = (today[c.feature] ?? 0) + c.cost;
  const cap = monthlyAt(now);
  // (after the window, the window's own spending in this cycle left out: D61)
  const big = now >= Date.parse(BIG_UNTIL) && cycle && u.big?.cycle === cycle.start.toISOString() && Number.isFinite(u.big.spent) ? u.big.spent : 0;
  const used = Math.max(0, Object.values(spent).reduce((s, v) => s + v, 0) - big);
  const remaining = Math.max(0, Math.min(Number.isFinite(u.remaining) ? u.remaining : cap, cap - used));
  const daysLeft = cycle ? Math.max(1, Math.ceil((cycle.end.getTime() - now) / 864e5)) : 30;
  const free = Math.max(0, remaining - RESERVE);
  // (the straight line: what the cycle may have spent by now)
  const span = cycle ? (cycle.end.getTime() - cycle.start.getTime()) / 864e5 : 30;
  const gone = cycle ? (now - cycle.start.getTime()) / 864e5 : 0;
  const schedule = Math.floor((cap - RESERVE) * Math.min(1, (gone + AHEAD_DAYS) / span));
  const allowance = Object.fromEntries(Object.entries(SHARES).map(([f, s]) => [f, Math.min(Math.floor(free * s), Math.floor(((free * s) / daysLeft) * (BURST[f] ?? 1)))]));
  return {
    cycleStart: cycle?.start.toISOString() ?? null,
    cycleEnd: cycle?.end.toISOString() ?? null,
    daysLeft,
    remaining,
    apiRemaining: Number.isFinite(u.remaining) ? u.remaining : null,
    used,
    spent,
    today,
    allowance,
    schedule,
    historyLeft: Math.min(Math.max(0, HISTORY_BUDGET - spent.history), free),
  };
}

// Whether a feature may spend cost credits now: history from its own budget, while the reserve holds; lines and
// props from today's allowance (a props ask its tier's share of it, TIERS); the morning snapshot to its day's cap
// while SNAPSHOT.hold is left over the reserve (cut in that order as credits run low: snapshot, history, props, lines)
export function canSpend(feature, cost, tier = undefined) {
  if (!hasKey()) return false;
  return spendable(feature, cost, budget(), tier);
}
// (canSpend's rule on a budget (budget()'s, or a test's), the key aside)
export function spendable(feature, cost, b, tier = undefined) {
  if (b.remaining - cost < RESERVE) return false;
  if (Number.isFinite(b.schedule) && (b.used ?? 0) + cost > b.schedule) return false;
  if (feature === 'snapshot') return b.remaining - cost >= RESERVE + SNAPSHOT.hold && (b.today?.snapshot ?? 0) + cost <= SNAPSHOT.dayCap;
  if (feature === 'history') return b.historyLeft >= cost;
  const share = feature === 'props' ? (TIERS[tier] ?? 1) : 1;
  return (b.today[feature] ?? 0) + cost <= Math.floor((b.allowance[feature] ?? 0) * share);
}

// The anytime touchdown's market (player_anytime_td; props.mjs apiProps asks it with the NFL's props, run.mjs
// anytimeTracked prices it: TRACKED ONLY, never staked). Billed as every props market is: an event's odds cost the
// markets it returns times the regions (the docs: "[number of unique markets returned] x [number of regions
// specified]"; up to 10 bookmakers named are one region, and the desk names WIDE_BOOKS at most), so it adds 1 credit
// to each NFL props ask whose book posts it, whichever books answer (unique markets, not one a book), none where
// none does. Measured 2026-10-09 to 10-15 (state.json's odds, the NFL's props asks): the NFL's asks cost about 10
// credits each (its 10 markets), about 63 asks a week for its 15 or 16 games (each asked when due, near the start
// and again on news: 4 to 5 asks a game), so the market costs about 63 a week, monthly (MONTHLY_COST) about 280
// asked on every ask of every game, 70 on one ask a game. On (on) only while the month's projected total
// (projectedMonth, with it in) stays under cap of MONTHLY; else the asks leave it out and the anytime rows wait
export const ANYTIME_TD = { market: 'player_anytime_td', on: true, cap: 0.85, monthlyCost: 280 };

// (the cycle's projected total: the desk's own tally this cycle (never the API's used count, which on a bigger plan
// is the plan's), plus the live features' (lines, props, snapshot, other) pace this cycle a day over the days left;
// history (bought only by a local backtest) not carried forward. No cycle yet: what's used)
export function projectedMonth(b = budget(), now = Date.now()) {
  const used = Number.isFinite(b.used) ? b.used : MONTHLY - (b.remaining ?? MONTHLY);
  if (!b.cycleStart) return used;
  const elapsed = Math.max(1, (now - Date.parse(b.cycleStart)) / 864e5);
  const live = (b.spent?.lines ?? 0) + (b.spent?.props ?? 0) + (b.spent?.snapshot ?? 0) + (b.spent?.other ?? 0);
  return Math.round(used + (live / elapsed) * (b.daysLeft ?? 0));
}

// Whether the optional refreshes are on (D55: a game's lines asked again when the quote is an hour old rather than
// LINES_FRESH.base, a game's props asked again mid-window, TIERS.refresh): only while the month's projection is under
// TARGET of MONTHLY. The month's hard cap is spendable's either way
export function refreshOn(b = budget(), now = Date.now()) {
  return projectedMonth(b, now) < TARGET * monthlyAt(now);
}

// A game's DraftKings lines as compared free (espn.mjs linesOf's shape: ml, spread.home/away, total): the spread's
// home line, the total's line, and the home, home-spread and over sides' no-vig chances. null without them
export function linesSig(l) {
  if (!l) return null;
  const imp = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  const nv = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && a && b ? Math.round((imp(a) / (imp(a) + imp(b))) * 1e4) / 1e4 : null);
  const s = { spread: l.spread?.home?.line ?? null, total: l.total?.line ?? null, ml: nv(l.ml?.home, l.ml?.away), sp: nv(l.spread?.home?.odds, l.spread?.away?.odds), ou: nv(l.total?.over, l.total?.under) };
  return Object.values(s).some((v) => v !== null) ? s : null;
}

// (how long a game's paid lines stand before they're asked again with nothing moved on ESPN's free board: Pinnacle,
// the fair chance, moves without DraftKings; an hour while the refreshes are on, three otherwise)
export const LINES_FRESH = { base: 3, refresh: 1 };
// (a move on ESPN's board since the quote that counts: half a point of line, half a point of no-vig chance (the API's
// decimal prices round a cent or two off ESPN's American ones, 0.1 to 0.3 points: not a move))
export const LINES_MOVED = { line: 0.5, chance: 0.005 };

// Why a due game's lines are bought this run, or null (D55): never quoted; ESPN's DraftKings line moved since the quote
// (q.espn: the free board's sig when it was bought); into its last chance since; the quote stale. q: the game's last
// quote { at, espn, phase }; sig: ESPN's now (linesSig); phase: the game's now
export function linesWant(q, sig, phase, now = Date.now(), { refresh = false } = {}) {
  if (!q?.at) return 'never quoted';
  const a = q.espn;
  if (a && sig) {
    for (const k of ['spread', 'total']) if (Number.isFinite(a[k]) && Number.isFinite(sig[k]) && Math.abs(sig[k] - a[k]) >= LINES_MOVED.line - 1e-9) return `the Book's line on ESPN's board: ${k} moved ${a[k]} to ${sig[k]} since the quote`;
    for (const k of ['ml', 'sp', 'ou']) if (Number.isFinite(a[k]) && Number.isFinite(sig[k]) && Math.abs(sig[k] - a[k]) >= LINES_MOVED.chance - 1e-9) return `the Book's line on ESPN's board: price moved since the quote (${k} ${a[k]} to ${sig[k]})`;
    // (a market posted since)
    for (const k of ['spread', 'total', 'ml']) if (!Number.isFinite(a[k]) && Number.isFinite(sig[k])) return `ESPN's board shows a ${k} posted since the quote`;
  }
  if (phase === 'last' && q.phase !== 'last') return 'into its last chance since the quote';
  const age = (now - Date.parse(q.at)) / 36e5;
  const fresh = refresh ? LINES_FRESH.refresh : LINES_FRESH.base;
  return age >= fresh ? `the quote stale (${Math.round(age * 10) / 10}h, ${fresh}h)` : null;
}

// Whether the anytime touchdown's market is asked now: the setting on, and the cycle's projected total with the
// market's own monthly cost in it (counted again even once its asks are in the pace: headroom) under cap of
// MONTHLY. { on, projected, limit, why }
export function anytimeOn(b = budget(), setting = ANYTIME_TD, now = Date.now()) {
  const limit = Math.round(setting.cap * MONTHLY);
  if (!setting.on) return { on: false, projected: null, limit, why: 'off by the setting (oddsapi.mjs ANYTIME_TD)' };
  const projected = projectedMonth(b, now) + setting.monthlyCost;
  return projected <= limit ? { on: true, projected, limit, why: null } : { on: false, projected, limit, why: `the month's projected credits ${projected} over ${limit} (${Math.round(setting.cap * 100)}% of ${MONTHLY})` };
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
  const u = withMirror(usage(), readMirror(), Date.now());
  recordOn(u, feature, cost, remaining, used, new Date().toISOString(), route);
  saveUsage(u);
}
// (record's rule on a usage (a test's): the cycle, the balance, the call, the cycle's and the day's tallies)
export function recordOn(u, feature, cost, remaining, used, at = new Date().toISOString(), route = '') {
  const t = Date.parse(at);
  if (!u.cycleStart || (u.remaining !== null && u.remaining !== undefined && remaining !== null && remaining > u.remaining + 1000)) {
    u.cycleStart = at;
    u.cycle = null;
  }
  if (remaining !== null) u.remaining = remaining;
  if (used !== null) u.used = used;
  const cycle = cycleOf(u, t);
  // (the tally carried from a file before it: its calls since the start, once)
  if (!u.cycle) u.cycle = { start: cycle.start.toISOString(), spent: tallyOf({ calls: u.calls }, cycle) };
  if (u.cycle.start !== cycle.start.toISOString()) u.cycle = { start: cycle.start.toISOString(), spent: {} };
  const day = at.slice(0, 10);
  if (u.day?.date !== day) u.day = { date: day, spent: {} };
  // (a free call (the event list) leaves no line: the log keeps the cycle's spending, and is cut to its last 3,000)
  if (cost) {
    u.calls = u.calls ?? [];
    u.calls.push({ at, feature, route: String(route).replace(/\/events\/[^/]+\//, '/events/{id}/'), cost });
    u.cycle.spent[feature] = (u.cycle.spent[feature] ?? 0) + cost;
    u.day.spent[feature] = (u.day.spent[feature] ?? 0) + cost;
    // (the big window's spending, by its cycle: D61)
    if (t < Date.parse(BIG_UNTIL)) {
      if (u.big?.cycle !== u.cycle.start) u.big = { cycle: u.cycle.start, spent: 0 };
      u.big.spent += cost;
    }
  }
  return u;
}

// The summary a sport's state shows: the cycle, what's spent by feature and today, the allowance
export function usageSummary() {
  const b = budget();
  // (D55: the month's projected total, its target, and whether the optional refreshes are on)
  return { monthly: MONTHLY, reserve: RESERVE, target: Math.round(TARGET * MONTHLY), projected: projectedMonth(b), refresh: refreshOn(b), historyBudget: HISTORY_BUDGET, ...b, assumed: 'the cycle runs a month from the first call (the API resets monthly; its day is assumed)' };
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

// A sport's coming games' lines (run.mjs liveLines): asked of WIDE_BOOKS, and, that call failing (a key the API
// refused, an error), once more of the desk's book and Pinnacle alone (LINE_BOOKS), the call before the
// consensus: the pricing never depends on the other books. null when neither answers. ask: the call (a test's)
export async function gameLines(sport, range, ask = call) {
  const at = (books) => ask('lines', `/sports/${SPORT_KEYS[sport]}/odds`, { markets: 'h2h,spreads,totals', bookmakers: books.join(','), ...range });
  const wide = await at(WIDE_BOOKS);
  if (Array.isArray(wide)) return wide;
  const own = await at(LINE_BOOKS);
  return Array.isArray(own) ? own : null;
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
    // (D74: each side's best price across the US books at the desk's book's line (best-price.mjs bestPair: a sane
    // pair at the same line, Pinnacle never), never worse than the desk's book's own; prices and the fair stay its own)
    const cands = (ev.bookmakers ?? [])
      .filter((b) => codeOf(b.key))
      .map((b) => [codeOf(b.key), read(b, key)])
      .filter(([, x]) => at(x))
      .map(([code, x]) => ({ book: code, a: x[sides[0]].odds, b: x[sides[1]].odds }));
    const bp = bestPair(cands);
    const best = { [sides[0]]: sideBest(bp?.a, mine[sides[0]].odds), [sides[1]]: sideBest(bp?.b, mine[sides[1]].odds) };
    out[key] = { line: mine[sides[0]].line, prices: Object.fromEntries(sides.map((s) => [s, mine[s].odds])), best, fair: pin ?? own, own, sharp: pin, consensus };
  }
  return out;
}
