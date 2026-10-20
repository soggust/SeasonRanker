// The deep history (DECISIONS.md D67, 2026-10-20): the last of the 5M plan's credits (the owner: "get every bit of
// historical data possible ... save/store it just in case"), spent on what D61's pull (intraday.mjs) left out, and
// committed beside it for research. Nothing the desk, the gate or the replay runs reads these files.
//
//   books      every call names the ten books one region's cost covers (oddsapi.mjs WIDE_BOOKS: DraftKings, Pinnacle,
//              FanDuel, BetMGM, Caesars, theScore/ESPN Bet, Fanatics, BetRivers, Hard Rock, Bally), so the other US
//              books' prices come at no extra cost (a book the API had no price for at that time is just absent)
//   lines      JOBS' 'lines' jobs: a sport's game lines at more hours before each start and over the seasons D61 left
//              out (from 2020), one call a sport at each whole hour an offset lands on (D61's way: games starting in
//              the next MAX_AHEAD hours kept), skipping every hour D61 or an earlier job already bought. 10 credits x
//              markets a call; an empty answer is free
//   props      'props' jobs: a game's player props (props.mjs API_MARKETS) at an hour before its start, one call an
//              event and hour. 10 credits x markets returned
//   markets    'markets' jobs: a game's other markets (team totals, alternate lines, halves/periods) at an hour
//              before its start, one call an event (event endpoint only; from 2023-05-03, the archive's start for them)
//   stored     apps/<sport>/scripts/model/odds-history/intraday/dense/ (a sub-folder: readIntraday never reads it):
//              <season>.jsonl.gz D61's I and S rows (the archive's L shape, framed on the archive's home by the names,
//              D56), props-<season>.jsonl.gz D61's Q and T rows, markets-<season>.jsonl.gz rows
//              ["M", oid, snapshot, book, market, name, description, point, price] (each price keyed to its outcome's
//              own name, D56) and ["T", oid, snapshot, n]. Book codes: BOOK_CODES.
//   resumable  each job's raw answers (compact) go to WORK/<job>.jsonl as they come; a key there is never bought again
//
// The key (ODDS_API_KEY) is never printed: errors go through oddsapi.mjs redact.
//
// Usage (local only):
//   node --env-file=.env libs/ranker/scripts/model/deep-history.mjs plan [jobs]
//   node --env-file=.env libs/ranker/scripts/model/deep-history.mjs pull [jobs] [--floor N]
//   node libs/ranker/scripts/model/deep-history.mjs build [sports]

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { CACHE, pool } from './sources.mjs';
import { SPORT_KEYS, WIDE_BOOKS, redact } from './oddsapi.mjs';
import { historyDir, readHistory } from './odds-history.mjs';
import { buildPropRows, buildRows } from './intraday.mjs';
import { API_MARKETS } from './props.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const API = 'https://api.the-odds-api.com/v4';
const HOUR = 36e5;
const CONCURRENCY = 8;
export const DEEP_SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
export const BOOK_CODES = { draftkings: 'dk', pinnacle: 'pin', fanduel: 'fd', betmgm: 'mgm', williamhill_us: 'czr', espnbet: 'espn', fanatics: 'fan', betrivers: 'br', hardrockbet: 'hr', ballybet: 'bly' };
const LINE_MARKETS = { nfl: 'h2h,spreads,totals', nba: 'h2h,spreads,totals', nhl: 'h2h,spreads,totals', mlb: 'h2h,spreads,totals', mma: 'h2h,totals' };
const WORK = process.env.DEEP_WORK || path.join(CACHE, 'deep');
const D61_WORK = process.env.INTRADAY_WORK || path.join(CACHE, 'intraday');
export const denseDir = (sport) => path.join(historyDir(sport), 'intraday', 'dense');

// The jobs, in the order they were bought (the plan's priorities). seasons: the archive's season numbers.
export const JOBS = [
  { id: 'nfl-lines-a', sport: 'nfl', kind: 'lines', offsets: [48, 24, 12, 6, 3, 2, 1], seasons: [2020, 2021, 2022, 2023] },
  { id: 'nfl-lines-b', sport: 'nfl', kind: 'lines', offsets: [48, 2], seasons: [2024, 2025, 2026] },
  { id: 'nba-lines-a', sport: 'nba', kind: 'lines', offsets: [6], seasons: [2020, 2021, 2022, 2023, 2024] },
  { id: 'nhl-lines-a', sport: 'nhl', kind: 'lines', offsets: [6], seasons: [2020, 2021, 2022, 2023, 2024] },
  { id: 'nfl-props-a', sport: 'nfl', kind: 'props', offsets: [3], seasons: [2023] },
  { id: 'nfl-markets-a', sport: 'nfl', kind: 'markets', markets: 'team_totals,alternate_spreads,alternate_totals,h2h_h1,spreads_h1,totals_h1', offsets: [1], seasons: [2023, 2024, 2025, 2026], from: '2023-05-03T05:30:00Z' },
  { id: 'mma-lines-a', sport: 'mma', kind: 'lines', offsets: [336, 168, 72, 24, 12, 6, 3, 1], seasons: [2020, 2021, 2022, 2023, 2024] },
  { id: 'nba-props-a', sport: 'nba', kind: 'props', offsets: [3], seasons: [2024] },
];

// ---- the API ----

const state = { remaining: null, spent: 0, calls: 0, floor: 61_000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ask(route, params) {
  if (!process.env.ODDS_API_KEY) throw new Error('no ODDS_API_KEY');
  if (state.remaining !== null && state.remaining < state.floor) throw new Error(`credits at the floor (${state.remaining} < ${state.floor})`);
  const q = new URLSearchParams({ ...params, oddsFormat: 'american', apiKey: process.env.ODDS_API_KEY });
  for (let attempt = 1; attempt <= 8; attempt++) {
    let res = null;
    try {
      res = await fetch(`${API}${route}?${q}`, { signal: AbortSignal.timeout(60e3) });
    } catch (err) {
      console.warn(`deep: ${route} failed (${redact(err?.message ?? err)})`);
    }
    if (res) {
      const rem = res.headers.get('x-requests-remaining');
      if (rem !== null) state.remaining = Number(rem);
      const last = Number(res.headers.get('x-requests-last') ?? 0);
      state.spent += last;
      state.calls++;
      if (res.ok) return { body: await res.json().catch(() => null), cost: last };
      if (res.status === 422 || res.status === 404 || res.status === 401) return { body: null, cost: last };
      if (res.status === 429 && rem !== null && Number(rem) <= 0) throw new Error('out of credits');
    }
    await sleep(Math.min(30e3, 1000 * 2 ** attempt) + Math.random() * 500);
  }
  console.warn(`deep: ${route} gave up`);
  return { body: null, cost: 0 };
}

// ---- compact answers (every book in BOOK_CODES) ----

// (D61's lines shape, every book: { dk: { h2h: [null, home, away], spreads: [pt, home, away], totals: [pt, over, under] }, fd: ... })
export function wideLines(ev) {
  const out = {};
  for (const b of ev.bookmakers ?? []) {
    const k = BOOK_CODES[b.key];
    if (!k) continue;
    const m = {};
    for (const x of b.markets ?? []) {
      const by = (fn) => (x.outcomes ?? []).find(fn);
      if (x.key === 'h2h') {
        const h = by((o) => o.name === ev.home_team);
        const a = by((o) => o.name === ev.away_team);
        if (h && a) m.h2h = [null, h.price, a.price];
      } else if (x.key === 'spreads') {
        const h = by((o) => o.name === ev.home_team);
        const a = by((o) => o.name === ev.away_team);
        if (h && a && Number.isFinite(h.point)) m.spreads = [h.point, h.price, a.price];
      } else if (x.key === 'totals') {
        const o = by((y) => /^over$/i.test(y.name));
        const u = by((y) => /^under$/i.test(y.name));
        if (o && u && o.point === u.point) m.totals = [o.point, o.price, u.price];
      }
    }
    if (Object.keys(m).length) out[k] = m;
  }
  return out;
}

// (D61's props shape, every book: [book, market, player, line, over, under])
export function wideProps(ev, markets) {
  const out = [];
  for (const b of ev?.bookmakers ?? []) {
    const k = BOOK_CODES[b.key];
    if (!k) continue;
    for (const x of b.markets ?? []) {
      if (!markets.includes(x.key)) continue;
      const by = new Map();
      for (const o of x.outcomes ?? []) {
        const key = `${o.description}|${o.point}`;
        const y = by.get(key) ?? { player: o.description, line: o.point ?? null };
        y[String(o.name).toLowerCase()] = o.price;
        by.set(key, y);
      }
      for (const y of by.values()) if (y.player && Number.isFinite(y.over) && Number.isFinite(y.under)) out.push([k, x.key, y.player, y.line, y.over, y.under]);
    }
  }
  return out;
}

// (any market's outcomes, each on its own name: [book, market, name, description, point, price])
export function wideOutcomes(ev, markets) {
  const out = [];
  for (const b of ev?.bookmakers ?? []) {
    const k = BOOK_CODES[b.key];
    if (!k) continue;
    for (const x of b.markets ?? []) {
      if (!markets.includes(x.key)) continue;
      for (const o of x.outcomes ?? []) if (Number.isFinite(o.price)) out.push([k, x.key, o.name, o.description ?? null, o.point ?? null, o.price]);
    }
  }
  return out;
}

// ---- the plan ----

const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
const readWork = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s)) : []);
const workFile = (id) => path.join(WORK, `${id}.jsonl`);
const jobsOf = (sport, kind) => JOBS.filter((j) => j.sport === sport && j.kind === kind);

// (the hours a sport's lines have been bought at: D61's and every lines job's)
function linesHad(sport) {
  const had = new Set(readWork(path.join(D61_WORK, `${sport}.jsonl`)).map((r) => r.key.slice(2).replace('.000Z', 'Z')));
  for (const j of jobsOf(sport, 'lines')) for (const r of readWork(workFile(j.id))) had.add(r.key);
  return had;
}

const eventsOf = (sport) => [...readHistory(sport, { props: false }).events.values()].filter((e) => Number.isFinite(Date.parse(e.t)));

// A job's to-do: lines, the whole hours (iso) not bought; props/markets, { e, h, key } an event and hour
export function todoOf(job, { events = eventsOf(job.sport), had = null, now = Date.now() } = {}) {
  const seasons = new Set(job.seasons);
  const games = events.filter((e) => seasons.has(e.season) && Date.parse(e.t) < now - HOUR);
  if (job.kind === 'lines') {
    const skip = had ?? linesHad(job.sport);
    const out = new Set();
    for (const e of games) for (const h of job.offsets) out.add(iso(Math.floor((Date.parse(e.t) - h * HOUR) / HOUR) * HOUR));
    return [...out].filter((k) => !skip.has(k)).sort();
  }
  const done = had ?? new Set(readWork(workFile(job.id)).map((r) => r.key));
  const from = job.from ? Date.parse(job.from) : 0;
  return games.filter((e) => Date.parse(e.t) >= from).flatMap((e) => job.offsets.map((h) => ({ e, h, key: `${e.oid}:${h}` }))).filter((x) => !done.has(x.key));
}

const perCall = (job) => 10 * (job.kind === 'lines' ? LINE_MARKETS[job.sport] : job.markets ?? Object.keys(API_MARKETS[job.sport]).join(',')).split(',').length;

export function plan(jobs) {
  let total = 0;
  for (const job of jobs) {
    const n = todoOf(job).length;
    total += n * perCall(job);
    console.log(`${job.id}: ${n} calls to buy, at most ${n * perCall(job)} credits (${perCall(job)} a call)`);
  }
  console.log(`at most ${total} credits in all`);
}

// ---- the pulls ----

async function pullLines(job) {
  const todo = todoOf(job);
  const maxAhead = (Math.max(...job.offsets) + 2) * HOUR;
  console.log(`${job.id}: ${todo.length} snapshots to buy`);
  mkdirSync(WORK, { recursive: true });
  let n = 0;
  await pool(todo, CONCURRENCY, async (key) => {
    const { body, cost } = await ask(`/historical/sports/${SPORT_KEYS[job.sport]}/odds`, { date: key, markets: LINE_MARKETS[job.sport], bookmakers: WIDE_BOOKS.join(',') });
    const ts = body?.timestamp ?? key;
    const lo = Date.parse(ts);
    const events = (body?.data ?? []).filter((e) => Date.parse(e.commence_time) > lo && Date.parse(e.commence_time) <= lo + maxAhead).map((e) => ({ id: e.id, c: e.commence_time, h: e.home_team, a: e.away_team, x: wideLines(e) }));
    appendFileSync(workFile(job.id), `${JSON.stringify({ key, ts, cost, events })}\n`);
    if (++n % 250 === 0) console.log(`${job.id}: ${n} of ${todo.length}, ${state.spent} credits spent, ${state.remaining} left`);
  });
}

async function pullEvents(job) {
  const todo = todoOf(job);
  const markets = job.markets ? job.markets.split(',') : Object.keys(API_MARKETS[job.sport]);
  console.log(`${job.id}: ${todo.length} event snapshots to buy (${markets.length} markets)`);
  mkdirSync(WORK, { recursive: true });
  let n = 0;
  await pool(todo, CONCURRENCY, async ({ e, h, key }) => {
    const at = iso(Date.parse(e.t) - h * HOUR);
    const { body, cost } = await ask(`/historical/sports/${SPORT_KEYS[job.sport]}/events/${e.oid}/odds`, { date: at, markets: markets.join(','), bookmakers: WIDE_BOOKS.join(',') });
    const rows = job.kind === 'props' ? wideProps(body?.data, markets) : wideOutcomes(body?.data, markets);
    appendFileSync(workFile(job.id), `${JSON.stringify({ key, oid: e.oid, h, ts: body?.timestamp ?? at, cost, rows })}\n`);
    if (++n % 500 === 0) console.log(`${job.id}: ${n} of ${todo.length}, ${state.spent} credits spent, ${state.remaining} left`);
  });
}

// ---- the committed files ----

const writeGz = (file, rows) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 }));
  console.log(`${path.relative(ROOT, file)} ${rows.length} rows, ${Math.round(readFileSync(file).length / 1024)} KB`);
};

// (the markets' rows: a row a price change of an outcome at a book)
export function buildMarketRows(snaps, events) {
  const season = new Map(events.map((e) => [e.oid, e.season]));
  const last = new Map();
  const out = new Map();
  for (const s of [...snaps].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const se = season.get(s.oid);
    if (se == null) continue;
    const put = (r) => (out.get(se) ?? out.set(se, []).get(se)).push(r);
    for (const [book, market, name, desc, point, price] of s.rows ?? []) {
      const k = `${s.oid}|${book}|${market}|${name}|${desc}|${point}`;
      if (last.get(k) === price) continue;
      last.set(k, price);
      put(['M', s.oid, s.ts, book, market, name, desc, point, price]);
    }
    put(['T', s.oid, s.ts, (s.rows ?? []).length]);
  }
  return out;
}

export function build(sports) {
  for (const sport of sports) {
    const events = eventsOf(sport);
    const lines = jobsOf(sport, 'lines').flatMap((j) => readWork(workFile(j.id)));
    if (lines.length) {
      const { out, unmatched } = buildRows(sport, lines, events);
      for (const [season, rows] of out) writeGz(path.join(denseDir(sport), `${season}.jsonl.gz`), rows);
      console.log(`${sport}: ${lines.length} snapshots, ${unmatched} sightings not in the archive`);
    }
    const props = jobsOf(sport, 'props').flatMap((j) => readWork(workFile(j.id)));
    if (props.length) for (const [season, rows] of buildPropRows(props, events)) writeGz(path.join(denseDir(sport), `props-${season}.jsonl.gz`), rows);
    const markets = jobsOf(sport, 'markets').flatMap((j) => readWork(workFile(j.id)));
    if (markets.length) for (const [season, rows] of buildMarketRows(markets, events)) writeGz(path.join(denseDir(sport), `markets-${season}.jsonl.gz`), rows);
  }
}

// A sport's deep files read: { lines: Map oid -> [{ ts, book, market, line, a, b }], props: [Q rows], markets: [M rows], snaps: [ts] }
export function readDeep(sport, dir = denseDir(sport)) {
  const lines = new Map();
  const props = [];
  const markets = [];
  const snaps = [];
  if (!existsSync(dir)) return { lines, props, markets, snaps };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl.gz')).sort()) {
    for (const s of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) {
      if (!s) continue;
      const r = JSON.parse(s);
      if (r[0] === 'S') snaps.push(r[1]);
      else if (r[0] === 'I') (lines.get(r[1]) ?? lines.set(r[1], []).get(r[1])).push({ ts: Date.parse(r[2]), book: r[3], market: r[4], line: r[5], a: r[6], b: r[7] });
      else if (r[0] === 'Q') props.push(r);
      else if (r[0] === 'M') markets.push(r);
    }
  }
  for (const list of lines.values()) list.sort((x, y) => x.ts - y.ts);
  return { lines, props, markets, snaps };
}

// (one call, its cost read from the headers: the pricing checked before buying)
async function probe() {
  const nfl = SPORT_KEYS.nfl;
  const at = '2021-10-17T16:00:00Z';
  const two = await ask(`/historical/sports/${nfl}/odds`, { date: at, markets: 'h2h,spreads,totals', bookmakers: 'draftkings,pinnacle' });
  const ten = await ask(`/historical/sports/${nfl}/odds`, { date: at, markets: 'h2h,spreads,totals', bookmakers: WIDE_BOOKS.join(',') });
  const books = new Set((ten.body?.data ?? []).flatMap((e) => (e.bookmakers ?? []).map((b) => b.key)));
  console.log(`lines, 2 books: ${two.cost} credits; 10 books: ${ten.cost} credits, ${ten.body?.data?.length} games, books seen: ${[...books].join(',')}`);
  const ev = eventsOf('nfl').find((e) => e.season === 2023 && Date.parse(e.t) > Date.parse('2023-10-15'));
  const t = iso(Date.parse(ev.t) - 3 * HOUR);
  const mk = 'team_totals,alternate_spreads,alternate_totals,h2h_h1,spreads_h1,totals_h1,spreads_q1';
  const x = await ask(`/historical/sports/${nfl}/events/${ev.oid}/odds`, { date: t, markets: mk, bookmakers: WIDE_BOOKS.join(',') });
  const got = new Set((x.body?.data?.bookmakers ?? []).flatMap((b) => b.markets.map((m) => m.key)));
  console.log(`event markets (${mk.split(',').length} asked): ${x.cost} credits, returned ${[...got].join(',')}; ${state.remaining} left`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  if (val('--floor')) state.floor = Number(val('--floor'));
  const named = args.slice(1).filter((a) => !a.startsWith('--') && a !== val('--floor'));
  if (cmd === 'build') return void build(named.length ? named.filter((s) => DEEP_SPORTS.includes(s)) : DEEP_SPORTS);
  if (cmd === 'probe') return void (await probe());
  const jobs = named.length ? JOBS.filter((j) => named.includes(j.id) || named.includes(j.sport)) : JOBS;
  if (cmd === 'plan') return void plan(jobs);
  if (cmd !== 'pull') throw new Error('usage: plan | pull | build | probe');
  for (const job of jobs) {
    const before = state.spent;
    await (job.kind === 'lines' ? pullLines(job) : pullEvents(job));
    console.log(`${job.id}: ${state.spent - before} credits, ${state.calls} calls so far; ${state.remaining} left`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(redact(err?.stack ?? String(err)));
    process.exit(1);
  });
}
