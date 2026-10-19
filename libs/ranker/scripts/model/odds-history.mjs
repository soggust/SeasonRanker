// The priced history: The Odds API's historical closes (and opens) for every game since the API's archive starts,
// bought once on the 5M-credit month (2026-10-18; the owner downgrades back to the 20K plan after) and committed,
// so the GitHub desk, the gate (gate.mjs layer b) and the weekly leak hunt (leaks.mjs) can grade the model's
// prices against the book over every season, not just the ledgers' weeks since 2026-10-08.
//
//   archive   (the docs, checked 2026-10-18, and probed): the featured markets (h2h, spreads, totals) from
//             2020-06-06, snapshots 10 minutes apart till September 2022 and 5 after; the player props from
//             2023-05-03T05:30Z (an earlier date is refused: "Historical odds are not available on this date for
//             these markets"). A historical call costs 10 x the markets it returns x the regions (up to 10 books
//             named are one region; an empty answer is free); the historical events list costs 1
//   books     DraftKings (the desk's book, BOOK) and Pinnacle (the lines' fair anchor, SHARP), named, one region
//   lines     each game's open (its first sighting in a daily snapshot at DAILY_HOUR UTC on each day with games the
//             next two days: the earliest line the pull saw, a day or more out) and its close (the last snapshot
//             before its start: one snapshot for every start within CLUSTER of each other, asked a minute before
//             the first)
//   props     every market the desk prices (props.mjs API_MARKETS), every game from the props' archive start: the
//             close (a minute before the start) and an earlier snapshot (OPEN_LEAD before it), each one call
//   mma       every bout's h2h and round totals, open and close as the lines (fighters' names, no ESPN id: the
//             MMA history isn't ESPN's games)
//   matched   each event to its ESPN game (the teams by name, nearest start within 12 hours, one to one), the ESPN
//             game's id, season, teams and final score carried on its row, so the gate can replay seasons the
//             desk's games.json doesn't keep; the unmatched logged
//
// Stored: apps/<sport>/scripts/model/odds-history/<season>.jsonl.gz, a row a line, arrays (compact):
//   ["E", oid, espnId|null, commence, season, type, homeId, awayId, hs, as, homeName, awayName]   (an event)
//   ["L", oid, kind, snapshot, book, market, line, a, b]   (a game line: h2h a home b away; spreads line the home
//                                                           side's point; totals line, a over b under; American)
//   ["P", oid, kind, snapshot, book, market, player, line, over, under]   (a prop: each line the book posted)
// kind 'o' (open) or 'c' (close); book 'dk' or 'pin'.
//
// The key (ODDS_API_KEY) is never printed: every URL shown goes through oddsapi.mjs redact.
//
// Usage (local, once, on the big plan; nothing in the desk's runs calls the pull):
//   node --env-file=.env libs/ranker/scripts/model/odds-history.mjs plan [sports]        (ESPN only: the estimate)
//   node --env-file=.env libs/ranker/scripts/model/odds-history.mjs pull [sports] [--phase daily|close|props|propsOpen] [--floor N]
//   node libs/ranker/scripts/model/odds-history.mjs build [sports]                      (the committed files)

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { CACHE, DAY, isoSecond as iso, pool } from './sources.mjs';
import { SPORT_KEYS, call, canSpend, matchNearest, redact } from './oddsapi.mjs';
import { LEAGUES } from './leagues.mjs';
import { API_MARKETS } from './props.mjs';
import { gameOf, teamIds, teamNames, teamSchedule } from './espn.mjs';
import { idOf } from './teamstats.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const API = 'https://api.the-odds-api.com/v4';
const WORK = path.join(CACHE, 'odds-history');
export const LINES_FROM = '2020-06-06T00:00:00Z';
export const PROPS_FROM = '2023-05-03T05:30:00Z';
export const BOOKS = { draftkings: 'dk', pinnacle: 'pin' };
const LINE_MARKETS = { nfl: 'h2h,spreads,totals', nba: 'h2h,spreads,totals', nhl: 'h2h,spreads,totals', mlb: 'h2h,spreads,totals', mma: 'h2h,totals' };
// (the daily snapshot's hour, UTC: 10 AM Eastern, before the day's games)
const DAILY_HOUR = 14;
// (starts this close together share a close snapshot)
const CLUSTER = 10 * 6e4;
// (the props' earlier snapshot: this long before the start)
export const OPEN_LEAD = { nfl: 48 * 36e5, nba: 12 * 36e5, nhl: 12 * 36e5, mlb: 12 * 36e5 };
const CONCURRENCY = 8;
export const HISTORY_SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
export const historyDir = (sport) => path.join(ROOT, 'apps', sport, 'scripts/model/odds-history');

// ---- reading the committed history (the gate, the leak hunt) ----

// A sport's committed history: { events: Map oid -> event, lines: [...], props: [...] }, every season (or those
// given). Each event { oid, id (ESPN), t, season, type, home, away, hs, as, homeName, awayName }; each line
// { oid, kind, ts, book, market, line, a, b }; each prop { oid, kind, ts, book, market, player, line, over, under }
export function readHistory(sport, { seasons = null, props = true } = {}) {
  const dir = historyDir(sport);
  const events = new Map();
  const lines = [];
  const propRows = [];
  if (!existsSync(dir)) return { events, lines, props: propRows };
  // (the seasons' files, then the morning snapshots' (morning/<day>.jsonl.gz): an event already read keeps its row,
  // the season's file having its final)
  const files = readdirSync(dir).filter((x) => x.endsWith('.jsonl.gz')).sort().map((f) => [path.join(dir, f), Number(f.slice(0, 4))]);
  const mdir = path.join(dir, 'morning');
  if (existsSync(mdir)) files.push(...readdirSync(mdir).filter((x) => x.endsWith('.jsonl.gz')).sort().map((f) => [path.join(mdir, f), null]));
  for (const [file, season] of files) {
    if (seasons && season !== null && !seasons.includes(season)) continue;
    const text = gunzipSync(readFileSync(file)).toString('utf8');
    for (const s of text.split('\n')) {
      if (!s) continue;
      const r = JSON.parse(s);
      if (r[0] === 'E') {
        if (seasons && !seasons.includes(r[4])) continue;
        if (!events.has(r[1])) events.set(r[1], { oid: r[1], id: r[2], t: r[3], season: r[4], type: r[5], home: r[6], away: r[7], hs: r[8], as: r[9], homeName: r[10], awayName: r[11], ...(r[12] ? { short: r[12] } : {}) });
      }
      else if (r[0] === 'L') lines.push({ oid: r[1], kind: r[2], ts: r[3], book: r[4], market: r[5], line: r[6], a: r[7], b: r[8] });
      else if (r[0] === 'P' && props) propRows.push({ oid: r[1], kind: r[2], ts: r[3], book: r[4], market: r[5], player: r[6], line: r[7], over: r[8], under: r[9] });
    }
  }
  return { events, lines, props: propRows };
}

// ---- the API ----

const state = { remaining: null, used: null, spent: 0, calls: 0, floor: 1_500_000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (a historical call: the body, or null (a refusal, an empty answer); 429 and 5xx retried with backoff)
async function ask(route, params) {
  if (!process.env.ODDS_API_KEY) throw new Error('no ODDS_API_KEY');
  if (state.remaining !== null && state.remaining < state.floor) throw new Error(`credits at the floor (${state.remaining} < ${state.floor})`);
  const q = new URLSearchParams({ ...params, oddsFormat: 'american', apiKey: process.env.ODDS_API_KEY });
  const url = `${API}${route}?${q}`;
  for (let attempt = 1; attempt <= 8; attempt++) {
    let res = null;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(60e3) });
    } catch (err) {
      console.warn(`odds history: ${redact(route)} failed (${redact(err?.message ?? err)})`);
    }
    if (res) {
      const rem = res.headers.get('x-requests-remaining');
      const last = Number(res.headers.get('x-requests-last') ?? 0);
      if (rem !== null) state.remaining = Number(rem);
      const used = res.headers.get('x-requests-used');
      if (used !== null) state.used = Number(used);
      state.spent += last;
      state.calls++;
      if (res.ok) return res.json().catch(() => null);
      if (res.status === 422 || res.status === 404 || res.status === 401) return null;
      if (res.status === 429 && rem !== null && Number(rem) <= 0) throw new Error('out of credits');
    }
    await sleep(Math.min(30e3, 1000 * 2 ** attempt) + Math.random() * 500);
  }
  console.warn(`odds history: ${redact(route)} gave up`);
  return null;
}

// ---- the work files (.cache/model/odds-history/<sport>/) ----

const workOf = (sport, name) => path.join(WORK, sport, name);
function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((s) => JSON.parse(s));
}
const append = (file, row) => {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(row)}\n`);
};

// (an event's books' line markets, compact: { dk: { h2h: [home, away], spreads: [pt, home, away], totals: [pt, over, under] }, pin: ... })
export function compactLines(ev) {
  const out = {};
  for (const b of ev.bookmakers ?? []) {
    const k = BOOKS[b.key];
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

// (an event's props, compact: [book, market, player, line, over, under] for each line with both sides)
export function compactProps(ev, markets) {
  const out = [];
  for (const b of ev?.bookmakers ?? []) {
    const k = BOOKS[b.key];
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

// ---- ESPN's games, every season the archive covers ----

const seasonsOf = (sport) => {
  const now = new Date();
  const y = now.getUTCFullYear();
  if (sport === 'nfl' || sport === 'mlb') return Array.from({ length: y - 2020 + 1 }, (_, i) => 2020 + i);
  // (NBA and NHL: ESPN's season year is the spring's; 2020 the bubble's)
  return Array.from({ length: y + 1 - 2020 + 1 }, (_, i) => 2020 + i);
};

// Every ESPN game of the sport from 2020: { id, date, season, type, home, away, hs, as, names: [home's, away's] }
export async function espnGames(sport) {
  const file = workOf(sport, 'espn.json');
  const have = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  if (have && Date.now() - have.at < 2 * DAY) return have.games;
  const league = LEAGUES[sport].league;
  const ids = await teamIds(league);
  const games = new Map();
  const jobs = [];
  for (const season of seasonsOf(sport)) for (const id of ids) for (const type of [2, 3]) jobs.push([season, id, type]);
  await pool(jobs, 8, async ([season, id, type]) => {
    for (const e of await teamSchedule(league, id, season, type)) {
      const g = gameOf(e, { innings: sport === 'mlb' });
      if (!g || games.has(g.id)) continue;
      const c = e.competitions?.[0];
      const nm = (w) => c?.competitors?.find((t) => t.homeAway === w)?.team?.displayName ?? null;
      games.set(g.id, { id: g.id, date: g.date, season: g.season ?? season, type: g.type ?? type, home: g.home, away: g.away, hs: g.hs, as: g.as, names: [nm('home'), nm('away')], ...(g.off ? { off: g.off } : {}), ...(g.short ? { short: g.short } : {}) });
    }
  });
  const list = [...games.values()].filter((g) => Date.parse(g.date) >= Date.parse(LINES_FROM)).sort((a, b) => a.date.localeCompare(b.date));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at: Date.now(), games: list }));
  return list;
}

// ---- the plan ----

// (the days to snapshot: each day with a game that day or the next, from the archive's start to now)
function dailyDates(games, now = Date.now()) {
  const days = new Set();
  for (const g of games) {
    const t = Date.parse(g.date);
    if (t > now) continue;
    for (const k of [0, -1, -2]) days.add(new Date(t + k * DAY).toISOString().slice(0, 10));
  }
  return [...days].filter((d) => Date.parse(`${d}T${String(DAILY_HOUR).padStart(2, '0')}:00:00Z`) >= Date.parse(LINES_FROM) && Date.parse(`${d}T00:00:00Z`) < now).sort();
}
// (the close snapshots: one a minute before the first of each cluster of starts)
export function closeTimes(starts) {
  const sorted = [...new Set(starts)].sort((a, b) => a - b);
  const out = [];
  let first = null;
  for (const t of sorted) {
    if (first === null || t - first > CLUSTER) {
      first = t;
      out.push(t - 6e4);
    }
  }
  return out;
}

export async function plan(sports) {
  const out = {};
  for (const sport of sports) {
    if (sport === 'mma') {
      out.mma = { note: 'from the API: about 50 cards a year, ~6 starts a card', daily: 6 * 52 * 3 * 20, close: 6 * 52 * 8 * 20 };
      continue;
    }
    const games = (await espnGames(sport)).filter((g) => Date.parse(g.date) < Date.now());
    const markets = Object.keys(API_MARKETS[sport]).length;
    const days = dailyDates(games);
    const closes = closeTimes(games.map((g) => Date.parse(g.date)));
    const propGames = games.filter((g) => Date.parse(g.date) >= Date.parse(PROPS_FROM)).length;
    out[sport] = { games: games.length, daily: days.length * 30, close: closes.length * 30, propsClose: propGames * markets * 10, propsOpen: propGames * markets * 10, propGames };
  }
  let total = 0;
  for (const [s, x] of Object.entries(out)) {
    const t = (x.daily ?? 0) + (x.close ?? 0) + (x.propsClose ?? 0) + (x.propsOpen ?? 0);
    x.total = t;
    total += t;
    console.log(`${s}: ${JSON.stringify(x)}`);
  }
  console.log(`the most it could cost: ${total} credits (an empty or partial answer costs less)`);
  return out;
}

// ---- the pull ----

async function pullDaily(sport) {
  const file = workOf(sport, 'snaps.jsonl');
  const done = new Set(readLines(file).map((r) => r.key));
  let dates;
  if (sport === 'mma') {
    dates = [];
    for (let t = Date.parse(LINES_FROM); t < Date.now(); t += DAY) dates.push(new Date(t).toISOString().slice(0, 10));
    // (MMA: cards are weekends: a snapshot on Wednesdays and Saturdays)
    dates = dates.filter((d) => [3, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
  } else dates = dailyDates(await espnGames(sport));
  const todo = dates.map((d) => `d:${d}`).filter((k) => !done.has(k));
  console.log(`${sport}: daily snapshots ${todo.length} to buy (${done.size} had)`);
  await pool(todo, CONCURRENCY, async (key) => {
    const at = `${key.slice(2)}T${String(DAILY_HOUR).padStart(2, '0')}:00:00Z`;
    const body = await ask(`/historical/sports/${SPORT_KEYS[sport]}/odds`, { date: at, markets: LINE_MARKETS[sport], bookmakers: Object.keys(BOOKS).join(',') });
    const ts = body?.timestamp ?? at;
    const events = (body?.data ?? []).filter((ev) => Date.parse(ev.commence_time) > Date.parse(ts)).map((ev) => ({ id: ev.id, c: ev.commence_time, h: ev.home_team, a: ev.away_team, x: compactLines(ev) }));
    append(file, { key, ts, events });
  });
}

// (every event the snapshots saw: its latest-seen start and teams. The API gave some games a new id in the
// days before them (2020-21: a game's week-ahead id replaced by another), so the ids of the same teams at the same
// start are one event, the id seen last its own: alias maps every id to it)
function eventsSeen(sport, snaps = readLines(workOf(sport, 'snaps.jsonl'))) {
  const last = new Map();
  const keyOf = new Map();
  for (const s of [...snaps].sort((a, b) => a.ts.localeCompare(b.ts)))
    for (const e of s.events) {
      const key = `${e.h}|${e.a}|${e.c}`;
      keyOf.set(e.id, key);
      last.set(key, { id: e.id, c: e.c, h: e.h, a: e.a });
    }
  const ev = new Map([...last.values()].map((e) => [e.id, e]));
  ev.alias = new Map([...keyOf].map(([id, key]) => [id, last.get(key).id]));
  return ev;
}

async function pullClose(sport) {
  const file = workOf(sport, 'snaps.jsonl');
  const done = new Set(readLines(file).map((r) => r.key));
  const ev = eventsSeen(sport);
  const times = closeTimes([...ev.values()].map((e) => Date.parse(e.c)).filter((t) => t < Date.now() - 36e5));
  const todo = times.map((t) => `c:${iso(t)}`).filter((k) => !done.has(k));
  console.log(`${sport}: close snapshots ${todo.length} to buy (${ev.size} events seen)`);
  await pool(todo, CONCURRENCY, async (key) => {
    const at = key.slice(2);
    const body = await ask(`/historical/sports/${SPORT_KEYS[sport]}/odds`, { date: at, markets: LINE_MARKETS[sport], bookmakers: Object.keys(BOOKS).join(',') });
    const ts = body?.timestamp ?? at;
    // (only the games starting inside this cluster: later ones get their own close)
    const lo = Date.parse(at);
    const events = (body?.data ?? []).filter((e) => Date.parse(e.commence_time) > Date.parse(ts) && Date.parse(e.commence_time) <= lo + 6e4 + CLUSTER).map((e) => ({ id: e.id, c: e.commence_time, h: e.home_team, a: e.away_team, x: compactLines(e) }));
    append(file, { key, ts, events });
  });
}

async function pullProps(sport, kind) {
  if (sport === 'mma') return;
  const file = workOf(sport, 'props.jsonl');
  const done = new Set(readLines(file).map((r) => r.key));
  const markets = Object.keys(API_MARKETS[sport]);
  const ev = [...eventsSeen(sport).values()].filter((e) => Date.parse(e.c) >= Date.parse(PROPS_FROM) && Date.parse(e.c) < Date.now() - 36e5);
  const todo = ev.filter((e) => !done.has(`${kind}:${e.id}`));
  console.log(`${sport}: props (${kind === 'pc' ? 'close' : 'open'}) ${todo.length} events to buy (${markets.length} markets)`);
  await pool(todo, CONCURRENCY, async (e) => {
    const at = iso(Date.parse(e.c) - (kind === 'pc' ? 6e4 : OPEN_LEAD[sport]));
    const body = await ask(`/historical/sports/${SPORT_KEYS[sport]}/events/${e.id}/odds`, { date: at, markets: markets.join(','), bookmakers: Object.keys(BOOKS).join(',') });
    append(file, { key: `${kind}:${e.id}`, ts: body?.timestamp ?? at, rows: compactProps(body?.data, markets) });
  });
}

// ---- the build: the work files to the committed history ----

const season0 = (sport, t) => {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (sport === 'nfl') return m >= 3 ? y : y - 1;
  if (sport === 'mlb' || sport === 'mma') return y;
  // (NBA, NHL: the spring's year; the 2020 bubble ran to October)
  if (y === 2020 && m <= 10) return 2020;
  return m >= 9 ? y + 1 : y;
};

// The odds events matched to ESPN's games: the teams by name (ESPN's name that season, else idOf's), the nearest
// start within 12 hours, one to one. A Map oid -> game, and the unmatched events
export function matchEvents(events, games, teams) {
  const nameId = new Map();
  for (const g of games) {
    if (g.names?.[0]) nameId.set(g.names[0], g.home);
    if (g.names?.[1]) nameId.set(g.names[1], g.away);
  }
  const idFor = (n) => nameId.get(n) ?? idOf(teams, n);
  const byDay = new Map();
  for (const g of games) {
    const k = Math.floor(Date.parse(g.date) / DAY);
    for (const d of [k - 1, k, k + 1]) (byDay.get(d) ?? byDay.set(d, []).get(d)).push(g);
  }
  const cand = [];
  for (const e of events) {
    const t = Date.parse(e.c);
    const h = idFor(e.h);
    const a = idFor(e.a);
    for (const g of byDay.get(Math.floor(t / DAY)) ?? []) {
      const dt = Math.abs(Date.parse(g.date) - t);
      if (dt > 12 * 36e5) continue;
      if (h && a && g.home === h && g.away === a) cand.push([e.id, g, dt]);
      // (one side's name unknown (a renamed or moved team): the other's side in place, a day's penalty)
      else if ((h && !a && g.home === h) || (a && !h && g.away === a)) cand.push([e.id, g, dt + DAY]);
      // (home and away listed the other way round (a neutral site))
      else if (h && a && g.home === a && g.away === h) cand.push([e.id, g, dt + 2 * DAY]);
    }
  }
  const m = matchNearest(cand);
  return { matched: m, unmatched: events.filter((e) => !m.has(e.id)) };
}

export async function build(sports) {
  const report = {};
  for (const sport of sports) {
    const snaps = readLines(workOf(sport, 'snaps.jsonl')).sort((a, b) => a.ts.localeCompare(b.ts));
    const propsW = readLines(workOf(sport, 'props.jsonl'));
    const ev = eventsSeen(sport, snaps);
    for (const [id, e] of ev) if (Date.parse(e.c) > Date.now()) ev.delete(id);
    // (each event's open, by book and market: its first sighting; its close: its last before the start (the close
    // snapshot, or a daily one nearer the start)). id -> "book|market" -> { ts, v }
    const open = new Map();
    const close = new Map();
    for (const s of snaps) {
      for (const e of s.events) {
        const id = ev.alias.get(e.id);
        if (!ev.has(id) || Date.parse(s.ts) >= Date.parse(ev.get(id).c)) continue;
        for (const [book, m] of Object.entries(e.x ?? {}))
          for (const [market, v] of Object.entries(m)) {
            const k = `${book}|${market}`;
            const o = open.get(id) ?? open.set(id, new Map()).get(id);
            if (!o.has(k)) o.set(k, { ts: s.ts, v });
            const c = close.get(id) ?? close.set(id, new Map()).get(id);
            if (!c.has(k) || s.ts > c.get(k).ts) c.set(k, { ts: s.ts, v });
          }
      }
    }
    const withProps = new Set(propsW.map((p) => p.key.slice(3)));
    let matched = new Map();
    let unmatched = [];
    if (sport !== 'mma') {
      const games = await espnGames(sport);
      const teams = await teamNames(LEAGUES[sport].league);
      ({ matched, unmatched } = matchEvents([...ev.values()], games, teams));
    }
    const bySeason = new Map();
    const push = (season, row) => (bySeason.get(season) ?? bySeason.set(season, []).get(season)).push(row);
    const seasonOf = new Map();
    for (const e of ev.values()) {
      const g = matched.get(e.id);
      if (!open.has(e.id) && !close.has(e.id) && !withProps.has(e.id)) continue;
      const season = g?.season ?? season0(sport, Date.parse(e.c));
      seasonOf.set(e.id, season);
      push(season, ['E', e.id, g?.id ?? null, e.c, season, g?.type ?? null, g?.home ?? null, g?.away ?? null, g?.hs ?? null, g?.as ?? null, e.h, e.a, ...(g?.short ? [g.short] : [])]);
    }
    // (an open and a close for each book and market; one sighting is both)
    for (const [kind, by] of [['o', open], ['c', close]])
      for (const [id, m] of by) {
        if (!seasonOf.has(id)) continue;
        for (const [k, { ts, v }] of m) {
          const [book, market] = k.split('|');
          push(seasonOf.get(id), ['L', id, kind, ts, book, market, v[0], v[1], v[2]]);
        }
      }
    let propN = 0;
    for (const p of propsW) {
      const id = p.key.slice(3);
      if (!seasonOf.has(id)) continue;
      const kind = p.key.startsWith('pc:') ? 'c' : 'o';
      for (const r of p.rows) {
        push(seasonOf.get(id), ['P', id, kind, p.ts, ...r]);
        propN++;
      }
    }
    const dir = historyDir(sport);
    mkdirSync(dir, { recursive: true });
    let bytes = 0;
    for (const [season, rows] of [...bySeason].sort((a, b) => a[0] - b[0])) {
      // (events first, then lines and props by event and time: compresses best)
      const rank = (r) => (r[0] === 'E' ? 0 : 1);
      rows.sort((a, b) => rank(a) - rank(b) || String(a[1]).localeCompare(String(b[1])) || String(a[3]).localeCompare(String(b[3])));
      const gz = gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 });
      writeFileSync(path.join(dir, `${season}.jsonl.gz`), gz);
      bytes += gz.length;
    }
    const unm = unmatched.filter((e) => seasonOf.has(e.id));
    writeFileSync(path.join(WORK, sport, 'unmatched.json'), JSON.stringify(unm, null, 1));
    report[sport] = { events: seasonOf.size, matched: [...seasonOf.keys()].filter((id) => matched.has(id)).length, unmatched: unm.length, open: open.size, close: close.size, props: propN, bytes };
    console.log(`${sport}: ${JSON.stringify(report[sport])}`);
  }
  return report;
}

// ---- the morning snapshot (the owner's ask, 2026-10-18; DECISIONS.md D29) ----
//
// Once a day from MORNING_HOUR Eastern (the desk's hourly workflow calls it; a sport whose day's file is written is
// done): every coming game's lines (h2h, spreads, totals) and, for each game starting inside MORNING_PROPS_H,
// the props the desk prices, at DraftKings and Pinnacle, kind 'm' in the same rows, apps/<sport>/scripts/model/
// odds-history/morning/<ET day>.jsonl.gz (written once: a day's file is never rewritten, so the repo grows by the
// day's few KB). Paid from oddsapi.mjs's snapshot feature (its day's cap, the first cut when credits run low); a
// sport out of season answers empty (free) and writes nothing. Failing soft: an error is a warning.
// For history, learning and the gate only (the owner, 2026-10-18; D30): the bettor never prices or places a bet
// off a snapshot's price; nothing in run.mjs, props.mjs, desk.mjs or checks.mjs reads this module's files.
export const MORNING_HOUR = 10;
// (the props' window: today's games and tonight's, up to the next morning's run, so each game's props are bought
// once, on its own morning)
export const MORNING_PROPS_H = 26;
const ETH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
const ETD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export const morningFile = (sport, day) => path.join(historyDir(sport), 'morning', `${day}.jsonl.gz`);
// (whether the morning's snapshot is due: from MORNING_HOUR Eastern, its day's file not yet written)
export const morningDue = (sport, now = Date.now(), exists = existsSync) => Number(ETH.format(new Date(now))) >= MORNING_HOUR && !exists(morningFile(sport, ETD.format(new Date(now))));

// The rows of a morning's answers: the lines' events (lines: /odds's body), props by event id (props: Map id ->
// event body), the ESPN games and teams to match; at the snapshot time ts
export function morningRows(sport, lines, props, games, teams, ts) {
  const now = Date.parse(ts);
  const evs = (lines ?? []).filter((e) => Date.parse(e.commence_time) > now).map((e) => ({ id: e.id, c: e.commence_time, h: e.home_team, a: e.away_team, raw: e }));
  const { matched } = sport === 'mma' ? { matched: new Map() } : matchEvents(evs, games, teams);
  const rows = [];
  for (const e of evs) {
    const g = matched.get(e.id);
    rows.push(['E', e.id, g?.id ?? null, e.c, g?.season ?? season0(sport, Date.parse(e.c)), g?.type ?? null, g?.home ?? null, g?.away ?? null, null, null, e.h, e.a]);
    for (const [book, m] of Object.entries(compactLines(e.raw))) for (const [market, v] of Object.entries(m)) rows.push(['L', e.id, 'm', ts, book, market, v[0], v[1], v[2]]);
    const p = props?.get(e.id);
    if (p) for (const r of compactProps(p, Object.keys(API_MARKETS[sport] ?? {}))) rows.push(['P', e.id, 'm', ts, ...r]);
  }
  return rows;
}

export async function morning(sports, { now = Date.now(), ask = call, afford = (n) => canSpend('snapshot', n), log = console.log } = {}) {
  const out = {};
  for (const sport of sports) {
    try {
      if (!morningDue(sport, now)) continue;
      const markets = LINE_MARKETS[sport];
      if (!afford(markets.split(',').length)) {
        log(`${sport}: morning snapshot skipped (the snapshot budget, oddsapi.mjs SNAPSHOT)`);
        continue;
      }
      const ts = iso(now);
      const lines = await ask('snapshot', `/sports/${SPORT_KEYS[sport]}/odds`, { markets, bookmakers: Object.keys(BOOKS).join(','), oddsFormat: 'american' });
      if (!Array.isArray(lines) || !lines.length) {
        log(`${sport}: morning snapshot: no coming games`);
        continue;
      }
      const props = new Map();
      const pm = Object.keys(API_MARKETS[sport] ?? {});
      if (pm.length)
        for (const e of lines.filter((x) => Date.parse(x.commence_time) > now && Date.parse(x.commence_time) - now <= MORNING_PROPS_H * 36e5)) {
          if (!afford(pm.length)) break;
          const body = await ask('snapshot', `/sports/${SPORT_KEYS[sport]}/events/${e.id}/odds`, { markets: pm.join(','), bookmakers: Object.keys(BOOKS).join(','), oddsFormat: 'american' });
          if (body) props.set(e.id, body);
        }
      const games = sport === 'mma' ? [] : JSON.parse(readFileSync(path.join(ROOT, 'apps', sport, 'scripts/model/games.json'), 'utf8'));
      const teams = sport === 'mma' ? [] : await teamNames(LEAGUES[sport].league);
      const rows = morningRows(sport, lines, props, games, teams, ts);
      const file = morningFile(sport, ETD.format(new Date(now)));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'), { level: 9 }));
      out[sport] = { events: lines.length, props: props.size, rows: rows.length };
      log(`${sport}: morning snapshot of ${lines.length} games, ${props.size} with props (${rows.length} rows)`);
    } catch (err) {
      console.warn(`${sport}: morning snapshot failed (${redact(err?.message ?? err)})`);
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const sports = args.slice(1).filter((a) => HISTORY_SPORTS.includes(a));
  const list = sports.length ? sports : HISTORY_SPORTS;
  if (val('--floor')) state.floor = Number(val('--floor'));
  if (cmd === 'plan') return void (await plan(list));
  if (cmd === 'build') return void (await build(list));
  if (cmd === 'morning') return void (await morning(list));
  if (cmd !== 'pull') throw new Error('usage: plan | pull | build');
  const phases = val('--phase') ? [val('--phase')] : ['daily', 'close', 'props', 'propsOpen'];
  for (const phase of phases) {
    for (const sport of list) {
      const before = state.spent;
      if (phase === 'daily') await pullDaily(sport);
      else if (phase === 'close') await pullClose(sport);
      else if (phase === 'props') await pullProps(sport, 'pc');
      else if (phase === 'propsOpen') await pullProps(sport, 'po');
      console.log(`${sport} ${phase}: ${state.spent - before} credits, ${state.calls} calls so far; remaining ${state.remaining}, used ${state.used}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(redact(err?.stack ?? err));
    process.exit(1);
  });
}
