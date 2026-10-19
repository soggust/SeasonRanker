// How fast each news source is (DECISIONS.md D49): for each player's status change on a game of the week, the time
// each source had it (ESPN's injury report, Sleeper's players dump, the curated Bluesky reporters) against the time
// the Book's price moved on it (board-seen.json: every price the desk's hourly runs saw, its first and last
// sighting), and each source's median lead over the Book (positive: the source had it first).
//
//   live     the speed log the desk keeps (news-speed.json, fastnews.mjs speedUpdate): each source's first sight in
//            a run and its own time, from the day the input shipped on
//   --retro  this week's games from what the sources show now: ESPN's report entries' own dates (an entry's
//            latest update), Sleeper's news_updated (its latest), the reporters' posts (paged back to the week's
//            start, a post naming the player with an injury word); each counted only where it's before the game's
//            start (a later update overwrote the pre-game one: left out) and inside its window (fastnews.mjs LOOK_H)
//   the move the Book's: the first run after the earliest source's time whose board differs from the one before it:
//            his own props' lines (one pulled, or moved); with none of his own on the board, left out (the game's
//            spread or total moves for too many reasons to time one player's news by; --lines counts them). A board seen only after the earliest time can't say, left out; no move by the
//            start, counted apart
//
// Run: node libs/ranker/scripts/model/news-speed.mjs [nfl|nba|nhl ...] [--retro] [--days N]

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { injuries, nameKey } from './espn.mjs';
import { LOOK_H, POST_RELEVANT, authorPosts, handlesOf, severityOf, sleeperPlayers, speedFile } from './fastnews.mjs';
import { LEAGUES } from './leagues.mjs';
import { get, readJson } from './sources.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const fin = Number.isFinite;
const H = 36e5;
export const SOURCES = ['espn', 'sleeper', 'bluesky'];
// (a post read as a status for the retro count: one of these words with the player's name, not a mention alone)
export const STATUS_WORDS = /\b(ruled out|out for|will not play|won't play|not expected to play|questionable|doubtful|inactive|injured reserve|IR|day-to-day|game-time decision|did not practice|DNP|limited (?:in )?practice|sidelined|scratched|out (?:Sunday|Monday|Thursday|tonight|vs\.?|against)|to miss)\b/i;

// (an offer's key: market|side|line|odds|stat|athlete)
const partsOf = (k) => {
  const [market, side, line, , stat, athlete] = k.split('|');
  return { market, side, line, stat, athlete };
};

// The game's board as the runs saw it: the runs' times, and the state at a time (his props' stat:line set, or the
// game's spread and total lines with none of his)
export function boardOf(seen) {
  const offers = Object.entries(seen?.o ?? {}).map(([k, [a, b]]) => ({ ...partsOf(k), a, b }));
  const times = [...new Set(offers.flatMap((x) => [x.a, x.b]))].sort((x, y) => x - y);
  const alive = (t) => offers.filter((x) => x.a <= t && t <= x.b);
  const own = (t, athlete) => [...new Set(alive(t).filter((x) => x.market === 'prop' && x.athlete === String(athlete)).map((x) => `${x.stat}:${x.line}`))].sort().join(',');
  const lines = (t) => [...new Set(alive(t).filter((x) => (x.market === 'spread' && x.side === 'home') || (x.market === 'total' && x.side === 'over')).map((x) => `${x.market}:${x.line}`))].sort().join(',');
  return { times, own, lines };
}

// When the Book moved on a status first had at t0: { at, on: 'props' | 'lines' } or { at: null, why }
export function bookMove(seen, { athlete = null, t0, start, lines = false }) {
  const b = boardOf(seen);
  const before = b.times.filter((t) => t <= t0).at(-1);
  if (!fin(before)) return { at: null, why: 'no board before the news' };
  const mine = athlete ? b.own(before, athlete) : '';
  if (!mine && !lines) return { at: null, why: 'none of his props on the board' };
  const state = mine ? (t) => b.own(t, athlete) : (t) => b.lines(t);
  const base = state(before);
  if (!base) return { at: null, why: 'nothing on the board' };
  for (const t of b.times) if (t > t0 && t < start && state(t) !== base) return { at: t, on: mine ? 'props' : 'lines' };
  return { at: null, why: 'no move by the start' };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Each source's lead over the Book on the events: { source: { n, median, ahead, sooner } } (hours; ahead: the share
// the source had first; sooner: its median lead over ESPN's report where both had it)
export function leads(events) {
  const out = {};
  for (const src of SOURCES) {
    const xs = events.filter((e) => fin(e.move) && fin(e[src])).map((e) => (e.move - e[src]) / H);
    const vsEspn = src === 'espn' ? [] : events.filter((e) => fin(e[src]) && fin(e.espn)).map((e) => (e.espn - e[src]) / H);
    out[src] = { n: xs.length, median: xs.length ? Math.round(median(xs) * 10) / 10 : null, ahead: xs.length ? Math.round((xs.filter((x) => x > 0).length / xs.length) * 100) / 100 : null, ...(src === 'espn' ? {} : { vsEspn: { n: vsEspn.length, median: vsEspn.length ? Math.round(median(vsEspn) * 10) / 10 : null } }) };
  }
  return out;
}

// The events from the live speed log: each entry's sources at their first sight (seen) and own time
export function liveEvents(log, seenOf) {
  const out = [];
  for (const e of Object.values(log?.entries ?? {})) {
    const start = Date.parse(e.start);
    const at = (src, k) => (e[src] ? Date.parse(e[src][k] ?? '') : NaN);
    const ev = { game: e.game, name: e.name, status: e.status, athlete: e.athlete ?? null, start };
    for (const src of SOURCES) ev[src] = at(src, 'seen');
    out.push({ ev, own: Object.fromEntries(SOURCES.map((s) => [s, at(s, 'own')])) });
  }
  return out.map(({ ev, own }) => {
    const t0 = Math.min(...SOURCES.map((s) => ev[s]).filter(fin));
    const seen = seenOf(ev.game);
    const mv = seen && fin(t0) ? bookMove(seen, { athlete: ev.athlete, t0, start: ev.start }) : { at: null, why: 'no board' };
    return { ...ev, own, move: mv.at, on: mv.on ?? null, why: mv.why ?? null };
  });
}

// The retro events of a sport's games of the week (see above)
export async function retroEvents(sport, { now = new Date(), days = 5, fetchJson = get, log = console, lines = false } = {}) {
  const cfg = LEAGUES[sport];
  const seenFile = path.join(ROOT, 'apps', sport, 'scripts/model/board-seen.json');
  const seen = readJson(seenFile, { games: {} }).games ?? {};
  const games = readJson(path.join(ROOT, 'apps', sport, 'scripts/model/games.json'), []);
  const byId = new Map(games.map((g) => [String(g.id), g]));
  const t = now.getTime();
  const week = Object.keys(seen)
    .map((id) => byId.get(id))
    .filter((g) => g && Date.parse(g.date) >= t - days * 864e5);
  const report = (await injuries(cfg.league).catch(() => null)) ?? new Map();
  const sleeper = await sleeperPlayers(sport, { now }).catch(() => null);
  const look = (LOOK_H[sport] ?? 30) * H;
  const from = Math.min(...week.map((g) => Date.parse(g.date))) - look;
  // (the reporters' posts back to the week's window, a few pages a feed)
  const posts = [];
  for (const h of handlesOf(sport)) {
    let cursor = null;
    for (let page = 0; page < 8; page++) {
      const r = await authorPosts(h.handle, { fetchJson, limit: 100, cursor });
      posts.push(...r.posts.filter((p) => POST_RELEVANT.test(p.text) && STATUS_WORDS.test(p.text)));
      cursor = r.cursor;
      if (!cursor || !r.posts.length || Date.parse(r.posts.at(-1).at) < from) break;
    }
  }
  log.log?.(`${sport}: retro: ${week.length} games, ${[...report.values()].flat().length} ESPN listings, Sleeper ${sleeper?.rows?.length ?? 0} players, ${posts.length} reporters' posts on a status`);
  const events = [];
  for (const g of week) {
    const start = Date.parse(g.date);
    const inside = (x) => fin(x) && x >= start - look && x < start && x <= t;
    for (const [team, abbr] of [
      [g.home, g.homeAbbr],
      [g.away, g.awayAbbr],
    ]) {
      const byKey = new Map();
      const add = (name, src, at, athlete = null, status = null) => {
        if (!inside(at)) return;
        const k = nameKey(name);
        const e = byKey.get(k) ?? { game: String(g.id), name, athlete, status, start };
        if (athlete && !e.athlete) e.athlete = String(athlete);
        if (status && !e.status) e.status = status;
        if (!fin(e[src]) || at < e[src]) e[src] = at;
        byKey.set(k, e);
      };
      for (const p of report.get(String(team)) ?? []) if (severityOf(p.status) > 0) add(p.name, 'espn', Date.parse(p.date ?? ''), p.id, severityOf(p.status) >= 2 ? 'out' : 'q');
      for (const p of sleeper?.rows ?? []) if (p.team === abbr && p.status) add(p.name, 'sleeper', p.news, p.espn, p.status === 'questionable' ? 'q' : 'out');
      // (a post naming one of the side's listed players, by his full name)
      const names = new Map([...(report.get(String(team)) ?? []).map((p) => [p.name, p.id]), ...(sleeper?.rows ?? []).filter((p) => p.team === abbr && p.status).map((p) => [p.name, p.espn])]);
      for (const p of posts) for (const [name, id] of names) if (name && p.text.toLowerCase().includes(name.toLowerCase())) add(name, 'bluesky', Date.parse(p.at), id);
      events.push(...byKey.values());
    }
  }
  return events.map((e) => {
    const t0 = Math.min(...SOURCES.map((s) => e[s]).filter(fin));
    const mv = bookMove(seen[e.game], { athlete: e.athlete, t0, start: e.start, lines });
    return { ...e, move: mv.at, on: mv.on ?? null, why: mv.why ?? null };
  });
}

// (the readout)
export function speedText(sport, events, mode) {
  const l = leads(events);
  const moved = events.filter((e) => fin(e.move)).length;
  const why = {};
  for (const e of events) if (!fin(e.move)) why[e.why] = (why[e.why] ?? 0) + 1;
  const part = (s) => `${s} ${l[s].n ? `${l[s].median >= 0 ? '+' : ''}${l[s].median}h over ${l[s].n} (first on ${Math.round(l[s].ahead * 100)}%)` : 'none'}${l[s].vsEspn?.n ? `, vs ESPN ${l[s].vsEspn.median >= 0 ? '+' : ''}${l[s].vsEspn.median}h on ${l[s].vsEspn.n}` : ''}`;
  const cover = SOURCES.map((s) => `${s} ${events.filter((e) => fin(e[s])).length} (first ${events.filter((e) => fin(e[s]) && SOURCES.every((o) => o === s || !fin(e[o]) || e[o] > e[s])).length})`).join(', ');
  return `${sport} (${mode}): ${events.length} status changes (had by ${cover}), the Book moved after the first source on ${moved} (${Object.entries(why).map(([k, n]) => `${n} ${k}`).join(', ')}); median lead over the Book's move: ${SOURCES.map(part).join('; ')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const retro = args.includes('--retro');
  const days = Number(args[args.indexOf('--days') + 1]) || 5;
  const sports = args.filter((a) => LEAGUES[a]);
  for (const sport of sports.length ? sports : ['nfl', 'nba', 'nhl']) {
    if (retro) {
      const events = await retroEvents(sport, { days, lines: args.includes('--lines') });
      console.log(speedText(sport, events, 'retro'));
      if (args.includes('--list')) for (const e of events.filter((x) => fin(x.move))) console.log(`  ${e.name} ${e.status ?? ''}: ${SOURCES.map((s) => `${s} ${fin(e[s]) ? new Date(e[s]).toISOString().slice(5, 16) : '-'}`).join(', ')}; Book ${new Date(e.move).toISOString().slice(5, 16)} (${e.on})`);
    } else {
      const seen = readJson(path.join(ROOT, 'apps', sport, 'scripts/model/board-seen.json'), { games: {} }).games ?? {};
      const events = liveEvents(readJson(speedFile(sport), { entries: {} }), (id) => seen[id]);
      console.log(speedText(sport, events, 'live'));
    }
  }
}
