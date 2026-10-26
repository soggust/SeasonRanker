// The intraday history (DECISIONS.md D61, 2026-10-20): The Odds API's historical game lines between the open and
// the close, DraftKings and Pinnacle, at set hours before each start (24, 12, 6, 3 and 1; MMA a week out too), the
// last two seasons a sport, bought once on the 5M plan's leftover credits (the owner's go, 2026-10-20) and committed
// beside the archive, so the price's path to the close can be read: the expected return against the fair close of
// a price taken N hours out (the CLV decay curve), and whether the Bot should bet now or wait.
//
//   snapshots  one call a sport at each whole UTC hour some game's offset lands on (a start's offset floored to
//              the hour), every game starting inside the next MAX_AHEAD hours kept from it (so a game is read at
//              its own offsets and at the hours its neighbours' asked). 10 credits x markets a call (one region:
//              the two books named); an empty answer is free
//   stored     apps/<sport>/scripts/model/odds-history/intraday/<season>.jsonl.gz, a row a price change:
//              ["I", oid, snapshot, book, market, line, a, b] (the archive's L row's shape, kind 'i'; h2h and
//              spreads framed on the archive's event's home by the names, D56), plus ["S", snapshot, n] (a snapshot
//              that saw n of the sport's coming games: a price not repeated is as last written), plus ["G", oid,
//              snapshot, book, market] (that book's market gone from the board at that snapshot: no longer standing)
//   reading    readIntraday(sport): { events (the archive's), rows by oid, snaps }
//
// The key (ODDS_API_KEY) is never printed: errors go through oddsapi.mjs redact.
//
// Usage (local; nothing in the desk's runs calls it):
//   node --env-file=.env libs/ranker/scripts/model/intraday.mjs plan [sports]
//   node --env-file=.env libs/ranker/scripts/model/intraday.mjs pull [sports] [--floor N]
//   node libs/ranker/scripts/model/intraday.mjs build [sports]
//   node libs/ranker/scripts/model/intraday.mjs curve [sports]

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { CACHE, pool } from './sources.mjs';
import { SPORT_KEYS, redact } from './oddsapi.mjs';
import { BOOKS, compactLines, compactProps, framed, historyDir, readHistory } from './odds-history.mjs';
import { API_MARKETS } from './props.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const API = 'https://api.the-odds-api.com/v4';
export const INTRADAY_SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
// (the hours before the start each game is asked at)
export const OFFSETS = { nfl: [24, 12, 6, 3, 1], nba: [24, 12, 6, 3, 1], nhl: [24, 12, 6, 3, 1], mlb: [24, 12, 6, 3, 1], mma: [168, 72, 24, 12, 6, 3, 1] };
// (the last two seasons a sport: the starts from)
export const FROM = { nfl: '2024-09-01T00:00:00Z', nba: '2024-10-15T00:00:00Z', nhl: '2024-10-01T00:00:00Z', mlb: '2025-03-15T00:00:00Z', mma: '2024-10-01T00:00:00Z' };
// (the props: each game a call at each of these hours (the archive has the open, 12 hours out (the NFL's 48), and the
// close); before the Book posts them the answer is empty and free)
export const PROP_OFFSETS = { nfl: [24, 12, 6, 3], nba: [24, 6, 3, 1], nhl: [6, 3, 1], mlb: [6, 3, 1] };
const MARKETS = { nfl: 'h2h,spreads,totals', nba: 'h2h,spreads,totals', nhl: 'h2h,spreads,totals', mlb: 'h2h,spreads,totals', mma: 'h2h,totals' };
const HOUR = 36e5;
const MAX_AHEAD = (sport) => (Math.max(...OFFSETS[sport]) + 2) * HOUR;
const CONCURRENCY = 8;
const WORK = process.env.INTRADAY_WORK || path.join(CACHE, 'intraday');
const workFile = (sport, kind = '') => path.join(WORK, `${sport}${kind}.jsonl`);
export const intradayDir = (sport) => path.join(historyDir(sport), 'intraday');

// The snapshot times: each start's offsets, floored to the whole hour, past and after FROM (ms, sorted)
export function snapshotTimes(starts, offsets, { from = 0, now = Date.now() } = {}) {
  const out = new Set();
  for (const s of starts) {
    if (!(s >= from) || s > now) continue;
    for (const h of offsets) {
      const t = Math.floor((s - h * HOUR) / HOUR) * HOUR;
      if (t < now - HOUR) out.add(t);
    }
  }
  return [...out].sort((a, b) => a - b);
}

const startsOf = (sport) => [...readHistory(sport, { props: false }).events.values()].map((e) => Date.parse(e.t)).filter(Number.isFinite);

// ---- the API ----

const state = { remaining: null, spent: 0, calls: 0, floor: 50_000 };
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
      console.warn(`intraday: ${route} failed (${redact(err?.message ?? err)})`);
    }
    if (res) {
      const rem = res.headers.get('x-requests-remaining');
      if (rem !== null) state.remaining = Number(rem);
      state.spent += Number(res.headers.get('x-requests-last') ?? 0);
      state.calls++;
      if (res.ok) return res.json().catch(() => null);
      if (res.status === 422 || res.status === 404 || res.status === 401) return null;
      if (res.status === 429 && rem !== null && Number(rem) <= 0) throw new Error('out of credits');
    }
    await sleep(Math.min(30e3, 1000 * 2 ** attempt) + Math.random() * 500);
  }
  console.warn(`intraday: ${route} gave up`);
  return null;
}

// (the balance: the free sports list's headers)
export async function balance() {
  await ask('/sports', {});
  return state.remaining;
}

function readWork(sport, kind = '') {
  const f = workFile(sport, kind);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s));
}

export async function plan(sports) {
  for (const sport of sports) {
    const times = snapshotTimes(startsOf(sport), OFFSETS[sport], { from: Date.parse(FROM[sport]) });
    const done = new Set(readWork(sport).map((r) => r.key));
    const todo = times.filter((t) => !done.has(`i:${new Date(t).toISOString()}`));
    const per = 10 * MARKETS[sport].split(',').length;
    console.log(`${sport}: ${times.length} snapshots (${todo.length} to buy), about ${todo.length * per} credits at most (${per} a call; an empty answer free)`);
  }
}

async function pull(sport) {
  const times = snapshotTimes(startsOf(sport), OFFSETS[sport], { from: Date.parse(FROM[sport]) });
  const done = new Set(readWork(sport).map((r) => r.key));
  const todo = times.map((t) => `i:${new Date(t).toISOString()}`).filter((k) => !done.has(k));
  console.log(`${sport}: ${todo.length} intraday snapshots to buy (${done.size} had)`);
  mkdirSync(WORK, { recursive: true });
  let n = 0;
  await pool(todo, CONCURRENCY, async (key) => {
    const at = key.slice(2).replace('.000Z', 'Z');
    const body = await ask(`/historical/sports/${SPORT_KEYS[sport]}/odds`, { date: at, markets: MARKETS[sport], bookmakers: Object.keys(BOOKS).join(',') });
    const ts = body?.timestamp ?? at;
    const lo = Date.parse(ts);
    const events = (body?.data ?? []).filter((e) => Date.parse(e.commence_time) > lo && Date.parse(e.commence_time) <= lo + MAX_AHEAD(sport)).map((e) => ({ id: e.id, c: e.commence_time, h: e.home_team, a: e.away_team, x: compactLines(e) }));
    appendFileSync(workFile(sport), `${JSON.stringify({ key, ts, events })}\n`);
    if (++n % 200 === 0) console.log(`${sport}: ${n} of ${todo.length}, ${state.spent} credits spent, ${state.remaining} left`);
  });
}

// The props' snapshots: every archived game from FROM, at each PROP_OFFSETS hour (one call an event and hour)
async function pullProps(sport) {
  if (!PROP_OFFSETS[sport]) return;
  const markets = Object.keys(API_MARKETS[sport]);
  const events = [...readHistory(sport, { props: false }).events.values()].filter((e) => Date.parse(e.t) >= Date.parse(FROM[sport]) && Date.parse(e.t) < Date.now() - HOUR);
  const done = new Set(readWork(sport, '-props').map((r) => r.key));
  const todo = events.flatMap((e) => PROP_OFFSETS[sport].map((h) => ({ e, h, key: `p:${e.oid}:${h}` }))).filter((x) => !done.has(x.key));
  console.log(`${sport}: ${todo.length} props snapshots to buy (${markets.length} markets, ${done.size} had)`);
  mkdirSync(WORK, { recursive: true });
  let n = 0;
  await pool(todo, CONCURRENCY, async ({ e, h, key }) => {
    const at = new Date(Date.parse(e.t) - h * HOUR).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const body = await ask(`/historical/sports/${SPORT_KEYS[sport]}/events/${e.oid}/odds`, { date: at, markets: markets.join(','), bookmakers: Object.keys(BOOKS).join(',') });
    appendFileSync(workFile(sport, '-props'), `${JSON.stringify({ key, oid: e.oid, h, ts: body?.timestamp ?? at, rows: compactProps(body?.data, markets) })}\n`);
    if (++n % 500 === 0) console.log(`${sport} props: ${n} of ${todo.length}, ${state.spent} credits spent, ${state.remaining} left`);
  });
}

// The props' rows: ["Q", oid, snapshot, book, market, player, line, over, under], a row a price change of a player's
// line at a book (the archive's P row's shape)
export function buildPropRows(snaps, events) {
  const season = new Map(events.map((e) => [e.oid, e.season]));
  const last = new Map();
  const out = new Map();
  for (const s of [...snaps].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const se = season.get(s.oid);
    if (se == null) continue;
    for (const [book, market, player, line, over, under] of s.rows ?? []) {
      const k = `${s.oid}|${book}|${market}|${player}|${line}`;
      const sig = `${over},${under}`;
      if (last.get(k) === sig) continue;
      last.set(k, sig);
      (out.get(se) ?? out.set(se, []).get(se)).push(['Q', s.oid, s.ts, book, market, player, line, over, under]);
    }
    (out.get(se) ?? out.set(se, []).get(se)).push(['T', s.oid, s.ts, (s.rows ?? []).length]);
  }
  return out;
}

// The committed files from the work file: each event matched to the archive's (its id, else its two names and a start
// within 12 hours), framed on the archive's home by the names, a row a price change
export function buildRows(sport, snaps, events, { ahead = null } = {}) {
  const byId = new Map(events.map((e) => [e.oid, e]));
  const byNames = new Map();
  for (const e of events) {
    const k = [e.homeName, e.awayName].sort().join('|');
    (byNames.get(k) ?? byNames.set(k, []).get(k)).push(e);
  }
  const matchOf = (x) => {
    if (byId.has(x.id)) return byId.get(x.id);
    const list = byNames.get([x.h, x.a].sort().join('|')) ?? [];
    return list.find((e) => Math.abs(Date.parse(e.t) - Date.parse(x.c)) <= 12 * HOUR) ?? null;
  };
  const last = new Map();
  // (each event's book and market prices standing: written and not since gone)
  const standing = new Map();
  const out = new Map();
  const put = (season, row) => (out.get(season) ?? out.set(season, []).get(season)).push(row);
  let unmatched = 0;
  let gone = 0;
  for (const s of [...snaps].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    const seasons = new Set();
    const lo = Date.parse(s.ts);
    // (the window this snapshot kept every coming game from: the pull's MAX_AHEAD, or the deep job's own)
    const span = Number.isFinite(s.ahead) ? s.ahead : Number.isFinite(ahead) ? ahead : null;
    const posted = new Map();
    for (const x of s.events ?? []) {
      const e = matchOf(x);
      if (!e) {
        unmatched++;
        continue;
      }
      seasons.add(e.season);
      const here = posted.get(e.oid) ?? posted.set(e.oid, new Set()).get(e.oid);
      for (const [book, ms] of Object.entries(x.x ?? {})) {
        for (const [market, v] of Object.entries(ms)) {
          const f = framed({ h: x.h, a: x.a }, { h: e.homeName, a: e.awayName }, market, v);
          if (!f) continue;
          const k = `${e.oid}|${book}|${market}`;
          here.add(`${book}|${market}`);
          (standing.get(e.oid) ?? standing.set(e.oid, new Set()).get(e.oid)).add(`${book}|${market}`);
          const sig = f.join(',');
          if (last.get(k) === sig) continue;
          last.set(k, sig);
          put(e.season, ['I', e.oid, s.ts, book, market, f[0], f[1], f[2]]);
        }
      }
    }
    // (the data-quality audit, 2026-10-24: a change-only row stood until its next change, so a price the book had pulled,
    // or an event the snapshot no longer listed, read as still posted hours or days later. A book's market standing on
    // an event this snapshot listed without it, or on a coming event inside the snapshot's window the snapshot didn't
    // list at all, is written gone: ["G", oid, snapshot, book, market]; its next sighting is written again)
    for (const [oid, keys] of standing) {
      const e = byId.get(oid);
      const start = Date.parse(e?.t);
      if (!(start > lo)) {
        standing.delete(oid);
        continue;
      }
      const here = posted.get(oid);
      if (!here && !(span !== null && start <= lo + span)) continue;
      for (const key of [...keys]) {
        if (here?.has(key)) continue;
        const [book, market] = key.split('|');
        put(e.season, ['G', oid, s.ts, book, market]);
        seasons.add(e.season);
        keys.delete(key);
        last.delete(`${oid}|${key}`);
        gone++;
      }
    }
    for (const season of seasons) put(season, ['S', s.ts, (s.events ?? []).length]);
  }
  return { out, unmatched, gone };
}

export function build(sports) {
  for (const sport of sports) {
    const snaps = readWork(sport);
    if (!snaps.length) {
      console.log(`${sport}: no intraday snapshots`);
      continue;
    }
    const { events } = readHistory(sport, { props: false });
    const { out, unmatched, gone } = buildRows(sport, snaps, [...events.values()], { ahead: MAX_AHEAD(sport) });
    mkdirSync(intradayDir(sport), { recursive: true });
    for (const [season, rows] of out) {
      const file = path.join(intradayDir(sport), `${season}.jsonl.gz`);
      writeFileSync(file, gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 }));
      console.log(`${sport}: ${path.relative(ROOT, file)} ${rows.length} rows, ${Math.round(readFileSync(file).length / 1024)} KB`);
    }
    console.log(`${sport}: ${snaps.length} snapshots, ${unmatched} event sightings not in the archive, ${gone} prices written gone`);
    const ps = readWork(sport, '-props');
    if (!ps.length) continue;
    for (const [season, rows] of buildPropRows(ps, [...events.values()])) {
      const file = path.join(intradayDir(sport), `props-${season}.jsonl.gz`);
      writeFileSync(file, gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 }));
      console.log(`${sport}: ${path.relative(ROOT, file)} ${rows.length} rows, ${Math.round(readFileSync(file).length / 1024)} KB`);
    }
  }
}

// A sport's intraday rows: { rows: Map oid -> [{ ts, book, market, line, a, b }] (time order), snaps: [ts] }
export function readIntraday(sport) {
  const dir = intradayDir(sport);
  const rows = new Map();
  const snaps = [];
  if (!existsSync(dir)) return { rows, snaps };
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl.gz') && !x.startsWith('props-')).sort()) {
    for (const s of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) {
      if (!s) continue;
      const r = JSON.parse(s);
      if (r[0] === 'S') snaps.push(r[1]);
      else if (r[0] === 'I') (rows.get(r[1]) ?? rows.set(r[1], []).get(r[1])).push({ ts: Date.parse(r[2]), book: r[3], market: r[4], line: r[5], a: r[6], b: r[7] });
      // (a price gone from the board at that snapshot (buildRows' G row): it no longer stands. No prices, so every
      // reader that checks a price skips it; intradayLines and shopRows read the book as absent there)
      else if (r[0] === 'G') (rows.get(r[1]) ?? rows.set(r[1], []).get(r[1])).push(goneRow(r));
    }
  }
  for (const list of rows.values()) list.sort((x, y) => x.ts - y.ts);
  return { rows, snaps };
}

// (a G row as a reader's row: the book's market gone from the board at that snapshot)
export const goneRow = (r) => ({ ts: Date.parse(r[2]), book: r[3], market: r[4], line: null, a: null, b: null, gone: true });

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const list = args.slice(1).filter((a) => INTRADAY_SPORTS.includes(a));
  const sports = list.length ? list : INTRADAY_SPORTS;
  if (val('--floor')) state.floor = Number(val('--floor'));
  if (cmd === 'plan') return void (await plan(sports));
  if (cmd === 'build') return void build(sports);
  if (cmd === 'balance') return void console.log(`credits left: ${await balance()}`);
  if (cmd === 'curve') return void (await import('./intraday-curve.mjs')).main(sports);
  if (cmd === 'pcurve') return void (await import('./intraday-curve.mjs')).propsMain(sports);
  if (cmd !== 'pull' && cmd !== 'props') throw new Error('usage: plan | pull | props | build | curve | balance');
  for (const sport of sports) {
    const before = state.spent;
    await (cmd === 'props' ? pullProps(sport) : pull(sport));
    console.log(`${sport}: ${state.spent - before} credits, ${state.calls} calls so far; ${state.remaining} left`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(redact(err?.stack ?? String(err)));
    process.exit(1);
  });
}
