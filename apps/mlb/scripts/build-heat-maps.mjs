// The card's Heat Maps (MLB's), from Baseball Savant (MLB Advanced Media's Statcast data: free for
// non-commercial use, credited on the About page), binned at build time and never shipped pitch by pitch:
//   pitch location   every pitch's spot over the plate in a 5 x 5 grid, the zone's nine boxes and the ring
//                    around them (the chase area and beyond), by the batter's height (Statcast's sz_top and
//                    sz_bot for him), from the catcher's view: pitches, swings, whiffs, the plate appearances
//                    ended there and their expected wOBA, balls in play, their exit velocity and expected wOBA.
//                    A pitcher's by pitch type and batter side (his hand kept), a hitter's by the pitcher's hand,
//                    and the league's by both and each pitch type
//   spray            every ball in play by direction from the hitter's view (pull, center, opposite: 15
//                    degrees either side of center field) and type (ground ball, line drive, fly ball,
//                    popup): a hitter's by the pitcher's hand, the league's; and where his home runs went
//                    (their angle off center and distance)
//   defense          Outs Above Average by position (1B to RF): each team's (Savant's team leaderboard by
//                    position), each fielder's at each position he played (with his directional OAA, his
//                    success rate against the expected, and his outs there from the Fielding Run Value board)
//
//   node apps/mlb/scripts/build-heat-maps.mjs              (the season being played, and last season while its
//                                                           files aren't there: nightly, after update-data)
//   node apps/mlb/scripts/build-heat-maps.mjs 2015-2025    (past seasons: once; a finished season doesn't change)
//
// The pitches come a day at a time (statcast.mjs: Savant's search caps a query near 25,000 rows), cached in
// .cache/savant (the workflow keeps it between runs). A season whose days aren't all in (a request failed, or
// the run's time ran out: HEAT_MAPS_MINUTES) keeps its last files: a half-downloaded season is never written
// over a whole one. Backfilled 2015-2026 from a cold cache: 2,070 days, 8.15 million pitches, about 5.7 GB of
// CSV asked for (some 700 bytes a pitch), two or three requests at a time, in 2 hours 13 minutes; the cache keeps
// 362 MB of it (15-33 MB a season), the files 26.4 MB (124 of them, 1.6-2.5 MB a season, none over 290 KB).
//
// Files, beside the season's skill-players.json (StaticData/ for the season being played, StaticData/seasons/
// <year>/ before it), each kept under ~300 KB:
//   heat-maps.json         the fields, the league's cells, each team's defense, the parks, how the players split
//   heat-maps.p<k>.json    the pitchers whose MLBAM id leaves k over the season's pitcher count (buckets.p)
//   heat-maps.h<k>.json    the hitters likewise (buckets.h)
// A cell is a tuple in its fields' order, trailing zeros dropped, a plain 0 when it's all zeros; a row of cells
// 0 when every one is. The regular season only (Savant's hfGT=R): the playoffs' few pitches say little a map
// can show.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry } from '../../../libs/ranker/scripts/fetch.mjs';
import { currentSeason } from '../../../libs/ranker/scripts/wiki-staff.mjs';
import { readJson, writeIfChanged } from '../../../libs/ranker/scripts/json-files.mjs';
import { CACHE, FIRST_SEASON, fetchSeason, readSeason, splitCsvLine } from './statcast.mjs';
import { seasonsArg } from '../../../libs/ranker/scripts/cli.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DATA = path.join(ROOT, 'apps/mlb/src/StaticData');
const HEADERS = { 'User-Agent': 'sports-ranker data script (non-commercial; credits Baseball Savant)' };
// (each file under this; the players spread over more files till they are)
export const MAX_BYTES = 290 * 1024;
// (Outs Above Average's first season)
export const OAA_FIRST = 2016;

// ---- the strike zone: 5 x 5 from the catcher's view, rows top to bottom, columns his left to right. The
// middle 3 x 3 the rulebook zone (the plate's 17 inches and a ball's width each side; the batter's own top
// and bottom), the ring around it one box's width or height more, everything further out clamped into it

export const ZONE_IDS = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => `z${r}${c}`)).flat();
// (feet: half the plate and a ball's radius; a box's width)
const HALF = (17 / 2 + 1.45) / 12;
const BOX = (2 * HALF) / 3;
const BALL = 1.45 / 12;

// A pitch's cell, its place in ZONE_IDS, or -1: no spot
export function zoneCell(plateX, plateZ, szTop, szBot) {
  const x = Number(plateX);
  const z = Number(plateZ);
  if (plateX === '' || plateZ === '' || plateX == null || plateZ == null || !Number.isFinite(x) || !Number.isFinite(z)) return -1;
  let top = Number(szTop);
  let bot = Number(szBot);
  if (!(top > bot) || !Number.isFinite(top) || !Number.isFinite(bot)) [top, bot] = [3.4, 1.6];
  // (the zone's height with a ball's width over the top and under the bottom, in thirds)
  const lo = bot - BALL;
  const hi = top + BALL;
  const rowH = (hi - lo) / 3;
  const col = x < -HALF ? 0 : x >= HALF ? 4 : 1 + Math.min(2, Math.floor((x + HALF) / BOX));
  const row = z >= hi ? 0 : z < lo ? 4 : 1 + Math.min(2, Math.floor((hi - z) / rowH));
  return row * 5 + col;
}

// ---- a pitch's parts

// (Savant's pitch types grouped as the map's picker has them; pitchouts and intentional balls left out)
const TYPE_OF = { FF: 'FF', FA: 'FF', SI: 'SI', FT: 'SI', FC: 'FC', SL: 'SL', ST: 'ST', SV: 'ST', CU: 'CU', KC: 'CU', CS: 'CU', CH: 'CH', SC: 'CH', FS: 'FS', FO: 'FS', KN: 'KN', EP: 'OT' };
export const PITCH_TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'CH', 'FS', 'KN', 'OT'];
export const typeOf = (code) => (code === 'PO' || code === 'IN' || code === 'AB' ? null : (TYPE_OF[code] ?? 'OT'));

const WHIFFS = new Set(['swinging_strike', 'swinging_strike_blocked']);
const CONTACT = new Set(['foul', 'foul_tip', 'hit_into_play', 'hit_into_play_no_out', 'hit_into_play_score']);
export const isWhiff = (d) => WHIFFS.has(d);
export const isSwing = (d) => WHIFFS.has(d) || CONTACT.has(d);

// The plate appearance a pitch ended and what it was worth by the expected: a ball in play its expected wOBA
// (its exit velocity and angle's), a walk or strikeout or hit batter its wOBA (Statcast's woba_value); null:
// the plate appearance went on
export function paValue(p) {
  if (p.woba_denom !== '1') return null;
  const est = p.estimated_woba_using_speedangle;
  if (p.bb_type && est !== '' && est != null && Number.isFinite(Number(est))) return Number(est);
  const v = Number(p.woba_value);
  return Number.isFinite(v) ? v : 0;
}

// (a cell's fields: pitches, swings, whiffs, plate appearances ended, their expected wOBA in thousandths,
// balls in play, their exit velocity in tenths (summed over the evn of them measured), and their expected wOBA
// in thousandths (the quality of contact: a hitter's damage there, apart from the walks a chase pitch ends in))
export const ZONE_FIELDS = ['n', 'sw', 'wh', 'pa', 'xw', 'bip', 'ev', 'evn', 'bxw'];

function addZone(cell, p) {
  cell[0]++;
  if (isSwing(p.description)) cell[1]++;
  if (isWhiff(p.description)) cell[2]++;
  const v = paValue(p);
  if (v !== null) {
    cell[3]++;
    cell[4] += Math.round(v * 1000);
  }
  if (p.bb_type) {
    cell[5]++;
    const ev = Number(p.launch_speed);
    if (p.launch_speed !== '' && Number.isFinite(ev) && ev > 0) {
      cell[6] += Math.round(ev * 10);
      cell[7]++;
    }
    const est = Number(p.estimated_woba_using_speedangle);
    if (p.estimated_woba_using_speedangle !== '' && Number.isFinite(est)) cell[8] += Math.round(est * 1000);
  }
}

// ---- the spray: the direction off center field (degrees; negative to left field), from Gameday's hit
// coordinates (home plate at 125.42, 198.27), and the hitter's side: pull, center or opposite

export const SPRAY_DIRS = ['pull', 'center', 'oppo'];
export const SPRAY_TYPES = ['gb', 'ld', 'fb', 'pu'];
const BB = { ground_ball: 'gb', line_drive: 'ld', fly_ball: 'fb', popup: 'pu' };
// (the cells: each type, near to far, its three directions)
export const SPRAY_IDS = SPRAY_TYPES.flatMap((t) => SPRAY_DIRS.map((d) => `${d}-${t}`));
export const PULL_DEG = 15;

export function sprayAngle(hcX, hcY) {
  const x = Number(hcX);
  const y = Number(hcY);
  if (hcX === '' || hcY === '' || hcX == null || hcY == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (Math.atan2(x - 125.42, 198.27 - y) * 180) / Math.PI;
}

// A ball in play's direction for the hitter: a right-handed hitter pulls to left field, a left-handed one to
// right; null without a spot
export function sprayDir(angle, stand) {
  if (angle === null || angle === undefined || !Number.isFinite(angle)) return null;
  if (Math.abs(angle) <= PULL_DEG) return 'center';
  const left = angle < 0;
  return left === (stand !== 'L') ? 'pull' : 'oppo';
}

// Its cell, its place in SPRAY_IDS, or -1
export function sprayCell(p) {
  const type = BB[p.bb_type];
  const dir = sprayDir(sprayAngle(p.hc_x, p.hc_y), p.stand);
  if (!type || !dir) return -1;
  return SPRAY_IDS.indexOf(`${dir}-${type}`);
}

// (a cell's fields: balls in play, their expected wOBA in thousandths, exit velocity in tenths (over evn of
// them), hits, home runs)
export const SPRAY_FIELDS = ['n', 'xw', 'ev', 'evn', 'h', 'hr'];
const HITS = new Set(['single', 'double', 'triple', 'home_run']);

function addSpray(cell, p) {
  cell[0]++;
  const est = Number(p.estimated_woba_using_speedangle);
  if (p.estimated_woba_using_speedangle !== '' && Number.isFinite(est)) cell[1] += Math.round(est * 1000);
  const ev = Number(p.launch_speed);
  if (p.launch_speed !== '' && Number.isFinite(ev) && ev > 0) {
    cell[2] += Math.round(ev * 10);
    cell[3]++;
  }
  if (HITS.has(p.events)) cell[4]++;
  if (p.events === 'home_run') cell[5]++;
}

// A home run as the file keeps it: its angle off center (whole degrees, negative to left field), its distance
// (feet), exit velocity (whole mph) and the pitcher's hand (1 left)
export function homeRun(p) {
  const angle = sprayAngle(p.hc_x, p.hc_y);
  const dist = Math.round(Number(p.hit_distance_sc));
  if (angle === null || !Number.isFinite(dist) || dist <= 0) return null;
  return [Math.round(angle), dist, Math.round(Number(p.launch_speed)) || 0, p.p_throws === 'L' ? 1 : 0];
}

// ---- the tally

const rows = (n, w) => Array.from({ length: n }, () => new Array(w).fill(0));
const HANDS = ['L', 'R'];
const hand = (h) => (h === 'L' ? 'L' : 'R');

// Every pitch of a season into its rows: the league's (by batter side and pitcher hand, each pitch type), each
// listed pitcher's (by pitch type and batter side, and each type's speed), each listed hitter's (by pitcher hand:
// location and spray, his side's balls in play, his home runs). keys: the site's ids (null: everyone)
export function tally(pitches, { pitchers = null, hitters = null } = {}) {
  const league = { zone: {}, spray: { L: rows(SPRAY_IDS.length, SPRAY_FIELDS.length), R: rows(SPRAY_IDS.length, SPRAY_FIELDS.length) } };
  const P = new Map();
  const H = new Map();
  const leagueZone = (key, type) => {
    league.zone[key] ??= {};
    return (league.zone[key][type] ??= rows(25, ZONE_FIELDS.length));
  };
  for (const p of pitches) {
    const type = typeOf(p.pitch_type);
    if (!type) continue;
    const z = zoneCell(p.plate_x, p.plate_z, p.sz_top, p.sz_bot);
    const stand = hand(p.stand);
    const throws = hand(p.p_throws);
    const s = p.bb_type ? sprayCell(p) : -1;
    if (z >= 0) addZone(leagueZone(stand + throws, type)[z], p);
    if (s >= 0) addSpray(league.spray[throws][s], p);
    const pid = p.pitcher;
    if (pid && (!pitchers || pitchers.has(pid))) {
      if (!P.has(pid)) P.set(pid, { t: {}, v: {}, h: { L: 0, R: 0 } });
      const e = P.get(pid);
      e.h[throws]++;
      e.t[type] ??= { L: rows(25, ZONE_FIELDS.length), R: rows(25, ZONE_FIELDS.length) };
      if (z >= 0) addZone(e.t[type][stand][z], p);
      e.v[type] ??= [0, 0];
      const mph = Number(p.release_speed);
      if (p.release_speed !== '' && Number.isFinite(mph) && mph > 0) {
        e.v[type][0]++;
        e.v[type][1] += Math.round(mph * 10);
      }
    }
    const bid = p.batter;
    if (bid && (!hitters || hitters.has(bid))) {
      if (!H.has(bid)) H.set(bid, { z: { L: rows(25, ZONE_FIELDS.length), R: rows(25, ZONE_FIELDS.length) }, s: { L: rows(SPRAY_IDS.length, SPRAY_FIELDS.length), R: rows(SPRAY_IDS.length, SPRAY_FIELDS.length) }, b: { L: [0, 0], R: [0, 0] }, hr: [] });
      const e = H.get(bid);
      if (z >= 0) addZone(e.z[throws][z], p);
      if (s >= 0) {
        addSpray(e.s[throws][s], p);
        e.b[throws][stand === 'L' ? 0 : 1]++;
      }
      if (p.events === 'home_run') {
        const hr = homeRun(p);
        if (hr) e.hr.push(hr);
      }
    }
  }
  return { league, pitchers: P, hitters: H };
}

// ---- packing: trailing zeros dropped, all-zero cells and rows a plain 0

export function packCell(c) {
  let n = c.length;
  while (n && !c[n - 1]) n--;
  return n ? c.slice(0, n) : 0;
}
export function packRows(list) {
  const cells = list.map(packCell);
  return cells.some((c) => c !== 0) ? cells : 0;
}
const sumRows = (cells) => cells.reduce((a, c) => a + c[0], 0);

// (a pitch type of his kept on its own once it's 2% of his pitches or 30 of them; the rest his "other")
export const TYPE_MIN = { share: 0.02, n: 30 };

// (a pitcher's cells keep the first five fields: his balls in play's exit velocity isn't on his maps)
export const PITCHER_FIELDS = ZONE_FIELDS.slice(0, 5);
const pitcherRows = (list) => packRows(list.map((c) => c.slice(0, PITCHER_FIELDS.length)));

export function packPitcher(e) {
  const total = Object.values(e.t).reduce((a, s) => a + sumRows(s.L) + sumRows(s.R), 0);
  const kept = {};
  const other = { L: rows(25, ZONE_FIELDS.length), R: rows(25, ZONE_FIELDS.length) };
  const otherV = [0, 0];
  let folded = false;
  for (const type of PITCH_TYPES) {
    const s = e.t[type];
    if (!s) continue;
    const n = sumRows(s.L) + sumRows(s.R);
    if (type !== 'OT' && (n >= TYPE_MIN.n || n >= total * TYPE_MIN.share) && n) kept[type] = s;
    else if (n) {
      folded = true;
      for (const h of HANDS) s[h].forEach((c, i) => c.forEach((v, k) => (other[h][i][k] += v)));
      otherV[0] += e.v[type]?.[0] ?? 0;
      otherV[1] += e.v[type]?.[1] ?? 0;
    }
  }
  if (folded) kept.OT = other;
  const t = {};
  const v = {};
  for (const [type, s] of Object.entries(kept)) {
    t[type] = { L: pitcherRows(s.L), R: pitcherRows(s.R) };
    v[type] = type === 'OT' ? otherV : (e.v[type] ?? [0, 0]);
  }
  // (his hand: the one most of his pitches came from; a switch-pitcher's rare other side in it)
  return { h: e.h.L > e.h.R ? 'L' : 'R', t, v };
}

export function packHitter(e, defense) {
  const out = { z: { L: packRows(e.z.L), R: packRows(e.z.R) }, s: { L: packRows(e.s.L), R: packRows(e.s.R) }, b: e.b };
  if (e.hr.length) out.hr = e.hr;
  if (defense) out.d = defense;
  return out;
}

// ---- the defense: Savant's Outs Above Average leaderboards (a fielder's at each position, each team's at
// each), and the Fielding Run Value board's outs at each (a fielder's time there)

export const DEF_POSITIONS = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const POS_NUM = { '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
// (a position's numbers: OAA, its runs prevented, OAA coming in, toward the third-base line, toward the
// first-base line, going back, the success rate against the expected (thousandths), and the outs there (a
// fielder's; FRV's), with its range and arm runs in tenths)
export const DEF_FIELDS = ['oaa', 'frp', 'in', 'to3b', 'to1b', 'back', 'sr', 'xsr', 'outs', 'range', 'arm'];

const pct = (v) => {
  const n = Number(String(v ?? '').replace('%', ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

// A leaderboard CSV's rows as objects (null: not a CSV)
export function parseBoard(text) {
  const body = String(text ?? '').replace(/^﻿/, '');
  const lines = body.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  const head = splitCsvLine(lines[0]);
  if (head.length < 3 || /<html/i.test(lines[0])) return null;
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
  });
}

// A fielder's or a team's row at a position as DEF_FIELDS (the success rates' percents as thousandths)
export function defRow(oaa, frv) {
  const sr = pct(oaa?.actual_success_rate_formatted);
  const xsr = pct(oaa?.adj_estimated_success_rate_formatted);
  return [
    num(oaa?.outs_above_average),
    num(oaa?.fielding_runs_prevented),
    num(oaa?.outs_above_average_infront),
    num(oaa?.outs_above_average_lateral_toward3bline),
    num(oaa?.outs_above_average_lateral_toward1bline),
    num(oaa?.outs_above_average_behind),
    sr === null ? 0 : Math.round(sr * 10),
    xsr === null ? 0 : Math.round(xsr * 10),
    frv ? num(frv.outs_total) : 0,
    frv ? Math.round(num(frv.range_runs) * 10) : 0,
    frv ? Math.round(num(frv.arm_runs) * 10) : 0,
  ];
}

// (the board's CSVs, cached: a finished season's kept forever, the season being played's six hours)
async function board(season, name, url, current) {
  const file = path.join(CACHE, String(season), `${name}.csv`);
  if (existsSync(file) && (!current || Date.now() - statSync(file).mtimeMs < 6 * 36e5)) return parseBoard(readFileSync(file, 'utf8'));
  const text = await fetchRetry(url, { headers: HEADERS, attempts: 3, backoff: 4000, timeout: 60000 }).catch(() => null);
  const parsed = parseBoard(text);
  if (!parsed) return existsSync(file) ? parseBoard(readFileSync(file, 'utf8')) : null;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  await new Promise((r) => setTimeout(r, 800));
  return parsed;
}

const OAA_URL = (season, type, pos) =>
  `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=${type}&startYear=${season}&endYear=${season}&split=no&team=&range=year&min=1&pos=${pos}&roles=&viz=hide&csv=true`;
const FRV_URL = (season, pos) => `https://baseballsavant.mlb.com/leaderboard/fielding-run-value?gameType=Regular&seasonStart=${season}&seasonEnd=${season}&type=fielder&position=${pos}&minInnings=0&minResults=1&csv=true`;

// Every position's boards: each team's row there, each fielder's (by MLBAM id), and the fielders' names and
// teams for a team's cell ("Witt Jr. +24")
export async function fetchDefense(season, current) {
  if (season < OAA_FIRST) return null;
  const teams = {};
  const players = {};
  for (const pos of DEF_POSITIONS) {
    const n = POS_NUM[pos];
    const [team, fielders, frv] = [
      await board(season, `oaa-team-${n}`, OAA_URL(season, 'Fielding_Team', n), current),
      await board(season, `oaa-fielder-${n}`, OAA_URL(season, 'Fielder', n), current),
      await board(season, `frv-${n}`, FRV_URL(season, n), current),
    ];
    if (!team || !fielders) return null;
    const outs = new Map((frv ?? []).map((r) => [String(r.id), r]));
    teams[pos] = team;
    players[pos] = fielders.map((r) => ({ ...r, frv: outs.get(String(r.player_id)) ?? null }));
  }
  return { teams, players };
}

// The defense's file parts: each team's row a position (by team id), its fielders there, who played it most
// first (their name and OAA: the team's cell's hover), and each fielder's rows by position; the spread of the teams' and the
// fielders' OAA at a position (the cells' tint)
export function defenseOf(def) {
  const teamIds = new Map();
  const teams = {};
  for (const pos of DEF_POSITIONS)
    for (const r of def.teams[pos]) {
      const id = String(r.team_id);
      teamIds.set(r.team_name, id);
      (teams[id] ??= { rows: {}, who: {} }).rows[pos] = packCell(defRow(r, null));
    }
  const fielders = new Map();
  const spread = (list) => {
    if (list.length < 2) return null;
    const mean = list.reduce((a, v) => a + v, 0) / list.length;
    return Math.round(Math.sqrt(list.reduce((a, v) => a + (v - mean) ** 2, 0) / (list.length - 1)) * 100) / 100;
  };
  const sd = { team: {}, fielder: {} };
  for (const pos of DEF_POSITIONS) {
    sd.team[pos] = spread(def.teams[pos].map((r) => num(r.outs_above_average)));
    const regulars = [];
    for (const r of def.players[pos]) {
      const id = String(r.player_id);
      const row = defRow(r, r.frv);
      if (!fielders.has(id)) fielders.set(id, {});
      fielders.get(id)[pos] = packCell(row);
      // (a regular's: a few hundred outs there, the spread among the ones who play it)
      if (row[8] >= 1500) regulars.push(row[0]);
      const team = teamIds.get(r.display_team_name);
      if (team && teams[team]) {
        const [last, first] = String(r['last_name, first_name'] ?? '').split(', ');
        (teams[team].who[pos] ??= []).push([first ? `${first[0]}. ${last}` : last, row[0], row[8]]);
      }
    }
    sd.fielder[pos] = spread(regulars);
  }
  for (const t of Object.values(teams)) for (const pos of Object.keys(t.who)) t.who[pos] = t.who[pos].sort((a, b) => b[2] - a[2] || Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([name, oaa]) => [name, oaa]);
  return { teams, fielders, sd };
}

// ---- the season's rows: who gets a key (the season's files' players, every part's)

const HITTER_TABS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const PITCHER_TABS = ['SP', 'RP'];

export function seasonKeys(dir) {
  const hitters = new Set();
  const pitchers = new Set();
  for (const suffix of ['', '.post', '.all']) {
    const file = readJson(path.join(dir, `skill-players${suffix}.json`));
    for (const tab of HITTER_TABS) for (const row of file?.[tab] ?? []) if (row.id) hitters.add(String(row.id));
    for (const tab of PITCHER_TABS) for (const row of file?.[tab] ?? []) if (row.id) pitchers.add(String(row.id));
  }
  return { hitters, pitchers };
}

// The season's parks by team id (MLB's teams that season, their home park's name: the map draws its walls)
async function seasonParks(season) {
  const body = await fetchRetry(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}&fields=teams,id,venue,name`, { as: 'json', headers: HEADERS }).catch(() => null);
  return Object.fromEntries((body?.teams ?? []).filter((t) => t.venue?.name).map((t) => [String(t.id), t.venue.name]).sort(([a], [b]) => Number(a) - Number(b)));
}

// ---- the files

// Rows spread over k files by id (an MLBAM id's remainder over k): the fewest files each under MAX_BYTES
export function bucketize(entries, head, max = MAX_BYTES) {
  const ids = Object.keys(entries).sort((a, b) => Number(a) - Number(b));
  for (let k = 1; k <= 64; k++) {
    const files = Array.from({ length: k }, (_, b) => ({ ...head, bucket: b, rows: Object.fromEntries(ids.filter((id) => Number(id) % k === b).map((id) => [id, entries[id]])) }));
    if (files.every((f) => JSON.stringify(f).length <= max)) return files;
  }
  throw new Error('rows too big to spread under the cap');
}

export function buildFiles(season, pitches, { keys = {}, defense = null, parks = {} } = {}) {
  const t = tally(pitches, keys);
  if (!pitches.length) return null;
  const def = defense ? defenseOf(defense) : null;
  const pitchers = Object.fromEntries([...t.pitchers].map(([id, e]) => [id, packPitcher(e)]));
  const hitterIds = new Set([...t.hitters.keys(), ...(def ? [...def.fielders.keys()].filter((id) => !keys.hitters || keys.hitters.has(id)) : [])]);
  const hitters = Object.fromEntries(
    [...hitterIds].map((id) => {
      const e = t.hitters.get(id);
      const d = def?.fielders.get(id) ?? null;
      return [id, e ? packHitter(e, d) : { d }];
    }),
  );
  const head = { season };
  const pFiles = bucketize(pitchers, { ...head, kind: 'p' });
  const hFiles = bucketize(hitters, { ...head, kind: 'h' });
  const league = {
    zone: Object.fromEntries(Object.entries(t.league.zone).sort().map(([k, types]) => [k, Object.fromEntries(PITCH_TYPES.filter((ty) => types[ty]).map((ty) => [ty, packRows(types[ty])]))])),
    spray: { L: packRows(t.league.spray.L), R: packRows(t.league.spray.R) },
  };
  const main = {
    season,
    fields: { zone: ZONE_FIELDS, pitcher: PITCHER_FIELDS, spray: SPRAY_FIELDS, def: DEF_FIELDS, zones: ZONE_IDS, sprays: SPRAY_IDS, types: PITCH_TYPES, positions: DEF_POSITIONS },
    buckets: { p: pFiles.length, h: hFiles.length },
    pitches: pitches.length,
    league,
    parks,
    defense: def ? { teams: def.teams, sd: def.sd } : null,
  };
  return { main, pitchers: pFiles, hitters: hFiles };
}

const mainFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => /^heat-maps(.[ph]d+)?.json$/.test(name)) : []);

async function buildSeason(season, current, { deadline }) {
  const dir = current ? DATA : path.join(DATA, 'seasons', String(season));
  if (!existsSync(path.join(dir, 'skill-players.json'))) return null;
  const { dates, missing } = await fetchSeason(season, { current, deadline });
  // (a season not all in: its files as they were, the rest asked for next run)
  if (missing.length) throw new Error(`${missing.length} of ${dates.length} days not in yet (${missing.slice(0, 3).join(', ')}...): files kept`);
  if (!dates.length) {
    // (a new season before its first game: last season's files at the top of StaticData/ taken down, archived
    // already)
    if (current && readJson(path.join(dir, 'heat-maps.json'))?.season !== season) for (const name of mainFiles(dir)) rmSync(path.join(dir, name));
    return null;
  }
  const pitches = readSeason(season);
  // (the boards settle a week after the regular season's last game: asked again till then)
  const settled = Date.now() - Date.parse(dates[dates.length - 1]) > 7 * 864e5;
  const [defense, parks] = [await fetchDefense(season, current && !settled), await seasonParks(season)];
  const built = buildFiles(season, pitches, { keys: seasonKeys(dir), defense, parks });
  if (!built) return null;
  const updated = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const written = [
    writeIfChanged(path.join(dir, 'heat-maps.json'), { ...built.main, updated }),
    ...built.pitchers.map((f, k) => writeIfChanged(path.join(dir, `heat-maps.p${k}.json`), f)),
    ...built.hitters.map((f, k) => writeIfChanged(path.join(dir, `heat-maps.h${k}.json`), f)),
  ];
  // (fewer buckets than before: the old ones beyond them gone)
  for (const name of readdirSync(dir)) {
    const m = /^heat-maps\.([ph])(\d+)\.json$/.exec(name);
    if (m && Number(m[2]) >= built.main.buckets[m[1]]) rmSync(path.join(dir, name));
  }
  return written;
}

async function main() {
  const CURRENT_SEASON = currentSeason(path.join(import.meta.dirname, '..'));
  // (the nightly run: the season being played, and last season too while its files aren't there, a rollover
  // whose archive ran out of time)
  const lastDir = path.join(DATA, 'seasons', String(CURRENT_SEASON - 1));
  const behind = !process.argv[2] && CURRENT_SEASON - 1 >= FIRST_SEASON && existsSync(path.join(lastDir, 'skill-players.json')) && !existsSync(path.join(lastDir, 'heat-maps.json'));
  const seasons = [...(behind ? [CURRENT_SEASON - 1] : []), ...seasonsArg(process.argv[2], CURRENT_SEASON)].filter((s) => s >= FIRST_SEASON && s <= CURRENT_SEASON);
  // (the nightly run's share of its time: a new season's backfill goes on next run)
  const deadline = process.env.HEAT_MAPS_MINUTES ? Date.now() + Number(process.env.HEAT_MAPS_MINUTES) * 60000 : Infinity;
  let failed = false;
  for (const season of seasons) {
    const started = Date.now();
    try {
      const files = await buildSeason(season, season === CURRENT_SEASON, { deadline });
      const total = files ? files.reduce((a, r) => a + r.size, 0) : 0;
      const said = (r) => `${path.basename(r.file)} ${Math.round(r.size / 1024)} KB${r.same ? ' (same)' : ''}`;
      console.log(files ? `${season}: ${files.length} files, ${Math.round(total / 1024)} KB (${Math.round((Date.now() - started) / 1000)}s): ${files.map(said).join(', ')}` : `${season}: no season files or no pitches, skipped`);
    } catch (err) {
      failed = true;
      console.log(`${season}: FAILED ${err.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
