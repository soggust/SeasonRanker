// Baseball Savant's pitch-by-pitch Statcast search (baseballsavant.mlb.com/statcast_search, MLB Advanced
// Media's data, free for non-commercial use, credited on the About page), a day of a season's regular
// season at a time: a search returns at most ~25,000 rows and a day is 3,000-6,500 pitches, so a day per
// request always fits. Each day is kept in .cache/savant/<season>/<date>.tsv.gz with only the columns the
// heat maps read (COLUMNS), a few hundredths of its CSV. A finished season's days are kept forever; the
// season being played asks again for its last few days (Savant fills a game's batted-ball numbers in over
// the next day or two) and for any it hasn't got.
//
//   node apps/mlb/scripts/statcast.mjs 2015-2025     (download only: the backfill; build-heat-maps.mjs reads it)
//
// The pace: one request at a time, a pause between them (POLITE_MS). The cache directory can be moved with
// SAVANT_CACHE (the backfill's own disk).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry } from '../../../libs/ranker/scripts/fetch.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
export const CACHE = process.env.SAVANT_CACHE ? path.resolve(process.env.SAVANT_CACHE) : path.join(ROOT, '.cache/savant');
const SEARCH = 'https://baseballsavant.mlb.com/statcast_search/csv';
const SCHEDULE = 'https://statsapi.mlb.com/api/v1/schedule';
const HEADERS = { 'User-Agent': 'sports-ranker data script (non-commercial; credits Baseball Savant)' };
// (Statcast's first season)
export const FIRST_SEASON = 2015;
// (between requests: Savant's search is a shared, free service)
const POLITE_MS = 1500;
// (the season being played: its days of the last few asked again, their batted balls filled in late)
const RECENT_DAYS = 3;
const DAY = 864e5;
// (a progress line every so many days asked: a backfill's or a nightly catch-up's)
const PROGRESS = 25;

// The columns kept, in the cache's order
export const COLUMNS = [
  'game_date',
  'game_pk',
  'at_bat_number',
  'pitch_number',
  'pitcher',
  'batter',
  'stand',
  'p_throws',
  'pitch_type',
  'release_speed',
  'plate_x',
  'plate_z',
  'sz_top',
  'sz_bot',
  'description',
  'events',
  'bb_type',
  'hc_x',
  'hc_y',
  'launch_speed',
  'launch_angle',
  'hit_distance_sc',
  'estimated_woba_using_speedangle',
  'woba_value',
  'woba_denom',
  'home_team',
  'away_team',
  'inning_topbot',
];

// ---- the CSV: Savant's quotes every text field ("des" holds commas), so a quoted split

export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else if (c !== '\r') cur += c;
  }
  out.push(cur);
  return out;
}

// A search's CSV as rows of COLUMNS (a header that isn't one: an error page, null)
export function parseSearch(text) {
  const body = text.replace(/^﻿/, '');
  const lines = body.split('\n');
  const head = splitCsvLine(lines[0]);
  if (!head.includes('pitch_type') || !head.includes('plate_x')) return null;
  const at = COLUMNS.map((c) => head.indexOf(c));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i] || lines[i] === '\r') continue;
    const cells = splitCsvLine(lines[i]);
    rows.push(at.map((k) => (k < 0 ? '' : (cells[k] ?? ''))));
  }
  return rows;
}

// ---- the cache: a day as a gzipped TSV of COLUMNS (its first line the columns, so a change shows)

const dayFile = (season, date) => path.join(CACHE, String(season), `${date}.tsv.gz`);

export function writeDay(file, rows) {
  mkdirSync(path.dirname(file), { recursive: true });
  const text = [COLUMNS.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
  writeFileSync(file, gzipSync(text));
}

// A cached day's pitches as objects by column (none: an empty list)
export function readDay(file) {
  if (!existsSync(file)) return [];
  const lines = gunzipSync(readFileSync(file)).toString('utf8').split('\n');
  const head = lines[0].split('\t');
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split('\t');
    const row = {};
    for (let k = 0; k < head.length; k++) row[head[k]] = cells[k];
    return row;
  });
}

// ---- the season's days: the regular season's game dates (MLB's schedule)

export async function seasonDates(season) {
  const url = `${SCHEDULE}?sportId=1&season=${season}&gameType=R&fields=dates,date,games,status,detailedState`;
  const body = await fetchRetry(url, { as: 'json', headers: HEADERS });
  // (a day with a game played: a fully postponed day has nothing to ask for)
  return (body.dates ?? []).filter((d) => (d.games ?? []).some((g) => !/Postponed|Cancelled/.test(g.status?.detailedState ?? ''))).map((d) => d.date);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A day's pitches from Savant (null: it failed; an empty list: no pitches that day yet)
async function fetchDay(season, date) {
  const url = `${SEARCH}?all=true&type=details&player_type=pitcher&hfGT=R%7C&hfSea=${season}%7C&game_date_gt=${date}&game_date_lt=${date}`;
  const body = await fetchRetry(url, { headers: HEADERS, attempts: 4, backoff: 5000, timeout: 120000, rateLimit: 3 }).catch((err) => {
    console.warn(`  ${date}: ${err.message}`);
    return null;
  });
  if (body === null) return null;
  return parseSearch(body);
}

// Every regular-season day of a season into the cache (the ones it hasn't got; the season being played's
// last few again). Returns the days the season has and the ones still missing (a failed request: asked
// again next run). today: the date it is (tests)
export async function fetchSeason(season, { current = false, today = new Date().toISOString().slice(0, 10), log = console.log, deadline = Infinity } = {}) {
  const dates = (await seasonDates(season)).filter((d) => d < today);
  // (once the regular season's over, nothing's asked again)
  const since = new Date(Date.parse(today) - RECENT_DAYS * DAY).toISOString().slice(0, 10);
  const recent = new Set(current ? dates.filter((d) => d >= since) : []);
  // (the days to ask for: a run picks up where the last one stopped, every cached day skipped)
  const todo = dates.filter((d) => !existsSync(dayFile(season, d)) || recent.has(d));
  if (todo.length) log(`${season}: ${dates.length - todo.length} of ${dates.length} days cached, ${todo.length} to ask for (${todo[0]} on)`);
  const started = Date.now();
  const missing = [];
  let fetched = 0;
  let outOfTime = false;
  for (const date of todo) {
    if (Date.now() > deadline) {
      outOfTime = true;
      missing.push(date);
      continue;
    }
    const rows = await fetchDay(season, date);
    if (rows === null) missing.push(date);
    else {
      writeDay(dayFile(season, date), rows);
      fetched++;
    }
    // (progress, every PROGRESS days asked)
    const asked = fetched + missing.length;
    if (asked % PROGRESS === 0) log(`  ${season}: ${asked} of ${todo.length} asked, through ${date} (${Math.round((Date.now() - started) / 60000)} min)`);
    await sleep(POLITE_MS);
  }
  log(`${season}: ${dates.length} days, ${fetched} fetched, ${missing.length} missing${outOfTime ? ` (out of time: the rest asked for next run, from where this one stopped)` : ''}`);
  return { dates, missing };
}

// A season's cached pitches, every day's (in date order)
export function readSeason(season) {
  const dir = path.join(CACHE, String(season));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tsv.gz'))
    .sort()
    .flatMap((f) => readDay(path.join(dir, f)));
}

export const seasonsArg = (arg, fallback) =>
  !arg ? [fallback] : arg.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(arg.split('-').map(Number)) : arg.split(',').map(Number);

if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  const started = Date.now();
  for (const season of seasonsArg(process.argv[2], new Date().getFullYear()).filter((s) => s >= FIRST_SEASON)) {
    await fetchSeason(season);
    console.log(`  (${Math.round((Date.now() - started) / 60000)} min so far)`);
  }
}
