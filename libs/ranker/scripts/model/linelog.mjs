// The line log: every line the desk sees, each market's a time series, kept for the fits to come (a line-informed
// projection term can't be fit without the lines' history: board.json's seen prices are kept only a week past
// each game (board.mjs SEEN_KEEP) and its git history starts 2026-10-11). Append-only, in the desk's cache
// (.cache/model/lines: the workflow keeps it between runs, gitignored), compact: a market's row written only the
// first time it's seen and whenever its line or a price changes from the last one logged, not every run.
//
//   what     each run's game lines for every coming game the scoreboard shows with lines (ESPN's board, the
//            desk's book's: espn.mjs linesOf), The Odds API's where the run bought them (its own source), and
//            every main-line prop on a game's board the run read (props.mjs board, The Odds API's prices over it
//            where asked: withApiPrices); a CHECK's stored price is no new sighting and isn't logged
//   rows     .cache/model/lines/<sport>-<YYYY-MM>.jsonl.gz (the month the run saw it, UTC), a gzip member a run
//            appended (concatenated members read as one file: gunzipSync), a JSON array a line:
//            [t, game, key, line, a, b, src, open?]
//              t     when seen (Unix seconds);  game  ESPN's event id
//              key   'spread' (line the home side's; a, b the home and away prices), 'total' (a, b over and
//                    under), 'ml' (line null; a, b home and away), a prop's 'p:<stat key>:<ESPN athlete id>'
//                    (a, b over and under; null a side the board gave no price: the NFL's)
//              src   'e' ESPN's board, 'o' The Odds API's (the desk's book on both), 'c' the board and the game's
//                    closing lines read after the start (run.mjs captureClose: a CLV's close, in-game prices
//                    maybe). Rows carry no start: a fit taking a market's last line before the game drops the
//                    'c' rows and any row from the game's start on (the history's game date), never reading a
//                    line it couldn't have had
//              open  a key's first row only, where the board gave it: the line it opened at (a prop's; a game
//                    line's open isn't on the scoreboard's lines, only its move)
//   last     .cache/model/lines/last-<sport>.json: each market's last row logged ({ "<game>|<key>|<src>": [line,
//            a, b, start ms, seen ms] }), what a new sighting is compared with; a market dropped four days past its
//            game's start, or with no start known (a game the run's history no longer holds) LAST_KEEP_BLIND
//            past when it was last seen
//   lost     the cache is the log's only home (the workflow's, restored by prefix; evicted after a week unused
//            or past 10 GB): a run that finds the month the sport's log started in (state.json lineLog.since)
//            missing (lostSince) warns (::warning::) that the history is gone, notes it in the state's
//            lineLog.lost and starts the log's months over from its own (run.mjs logTheLines)
//   dry      --dry logs nothing (counted and said, not written): the cache's history stays the bots'
//   fails    a log that can't be read or written is warned of and skipped: never the run

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CACHE } from './sources.mjs';

export const LINES_DIR = path.join(CACHE, 'lines');
// (a market's last row kept this long past its game's start: the closing board read after it (run.mjs captureClose, a prop's up to props.mjs PROP_WAIT) still compared, not logged again as new)
export const LAST_KEEP = 4 * 864e5;
// (one with no start known kept this long past when it was last seen)
export const LAST_KEEP_BLIND = 14 * 864e5;

// (a number as logged: finite or null)
const num = (v) => (Number.isFinite(v) ? v : null);

// A game's lines as the log's rows (no time yet): from espn.mjs linesOf's shape or run.mjs liveLines' (the same
// fields), src 'e' or 'o'. A market with neither a line nor a price, none
export function gameRows(gameId, lines, src) {
  if (!lines) return [];
  const out = [];
  const add = (key, line, a, b) => {
    if (line === null && a === null && b === null) return;
    out.push({ game: String(gameId), key, line, a, b, src });
  };
  add('spread', num(lines.spread?.home?.line), num(lines.spread?.home?.odds), num(lines.spread?.away?.odds));
  add('total', num(lines.total?.line), num(lines.total?.over), num(lines.total?.under));
  add('ml', null, num(lines.ml?.home), num(lines.ml?.away));
  return out;
}

// A game's props as the log's rows: the board's (props.mjs board: { athlete, stat, line, open, prices,
// source }), a CHECK's stored one (stored) left out; src by its prices' source, or as given (captureClose's 'c')
export function propRows(gameId, board, src = null) {
  const out = [];
  for (const p of board ?? []) {
    if (!p || p.stored || !p.stat?.key || !p.athlete?.id || !Number.isFinite(p.line)) continue;
    out.push({ game: String(gameId), key: `p:${p.stat.key}:${p.athlete.id}`, line: p.line, a: num(p.prices?.over), b: num(p.prices?.under), src: src ?? (p.source === 'the odds api' ? 'o' : 'e'), open: num(p.open) });
  }
  return out;
}

// The rows that are news against the last ones logged (last: the index, changed in place), each with its time
// t (ms) and, the first time a key's seen, its open: [t, game, key, line, a, b, src, open?]. starts: game id ->
// its start (ms), kept on the index for pruning with when it was last seen (t, a sighting unchanged too). A row
// seen twice in one run, the later one counted
export function newRows(rows, last, t, starts = new Map()) {
  const out = [];
  const sec = Math.floor(t / 1000);
  for (const r of rows) {
    const id = `${r.game}|${r.key}|${r.src}`;
    const was = last[id];
    if (was && was[0] === r.line && was[1] === r.a && was[2] === r.b) {
      was[3] = starts.get(r.game) ?? was[3] ?? null;
      was[4] = t;
      continue;
    }
    const row = [sec, r.game, r.key, r.line, r.a, r.b, r.src];
    if (!was && r.open !== null && r.open !== undefined) row.push(r.open);
    out.push(row);
    last[id] = [r.line, r.a, r.b, starts.get(r.game) ?? was?.[3] ?? null, t];
  }
  return out;
}

// (the index without the markets whose game started LAST_KEEP ago or more, nor the ones with no start known last
// seen LAST_KEEP_BLIND ago or more (an older index's, with no time seen, kept till it's seen again))
export function pruneLast(last, now) {
  const out = {};
  for (const [k, v] of Object.entries(last ?? {})) {
    if (Number.isFinite(v?.[3]) ? v[3] < now - LAST_KEEP : Number.isFinite(v?.[4]) && v[4] < now - LAST_KEEP_BLIND) continue;
    out[k] = v;
  }
  return out;
}

// (a month's file for a sport, by the run's time)
export const monthFile = (sport, t, dir = LINES_DIR) => path.join(dir, `${sport}-${new Date(t).toISOString().slice(0, 7)}.jsonl.gz`);

// (a sport's month files, in order)
export const monthsOf = (sport, dir = LINES_DIR) => (existsSync(dir) ? readdirSync(dir).filter((x) => x.startsWith(`${sport}-`) && x.endsWith('.jsonl.gz')).sort() : []);

// (the log's history lost from the cache: its first month's file (since, 'YYYY-MM': state.json lineLog.since)
// missing. A cache missed or evicted restores nothing, and a run after that would save a log holding only the
// months since, so the first month's file is the one to look for)
export const lostSince = (sport, since, dir = LINES_DIR) => !!since && !existsSync(path.join(dir, `${sport}-${since}.jsonl.gz`));

// A sport's logged rows, every month's file in order (a fit's reader): [[t, game, key, line, a, b, src, open?]];
// a file that can't be read skipped with a warning
export function readLines(sport, dir = LINES_DIR) {
  const out = [];
  for (const f of monthsOf(sport, dir)) {
    try {
      for (const l of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) if (l) out.push(JSON.parse(l));
    } catch (err) {
      console.warn(`${sport}: the line log's ${f} not read (${err.message})`);
    }
  }
  return out;
}

// A run's sightings logged (rows: gameRows' and propRows'; starts: game id -> start ms): the new ones appended
// as one gzip member to the month's file and the index written. dry: counted, nothing written. Returns the
// count of new rows (null where the log failed: warned, never thrown)
export function logLines(sport, rows, { now = Date.now(), starts = new Map(), dry = false, dir = LINES_DIR } = {}) {
  try {
    const lastFile = path.join(dir, `last-${sport}.json`);
    let last = {};
    try {
      last = existsSync(lastFile) ? JSON.parse(readFileSync(lastFile, 'utf8')) : {};
    } catch {
      // (an index unreadable: started over, every market's next sighting logged again, nothing lost)
      last = {};
    }
    last = pruneLast(last, now);
    const fresh = newRows(rows, last, now, starts);
    if (dry) return fresh.length;
    mkdirSync(dir, { recursive: true });
    if (fresh.length) appendFileSync(monthFile(sport, now, dir), gzipSync(fresh.map((x) => JSON.stringify(x)).join('\n') + '\n'));
    writeFileSync(lastFile, JSON.stringify(last));
    return fresh.length;
  } catch (err) {
    console.warn(`${sport}: the line log not written (${err.message})`);
    return null;
  }
}
