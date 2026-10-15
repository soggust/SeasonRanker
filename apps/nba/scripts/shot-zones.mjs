// The NBA's Heat Maps data: every shot from the floor, from ESPN's game summaries (each play's spot on the
// court, about a foot apart, its shooter and assister, made or missed, two or three, the period, the clock and
// the score), binned at build time into the standard shot zones and written as heat-maps.json beside the
// season's other files (src/StaticData/heat-maps.json for the season being played, seasons/<year>/ before it).
// The site never gets a shot: only the zones' sums.
//
// The zones (ZONES; rim-relative feet, X across the court as you look at the basket, Y out from the rim):
//   ra                 the restricted area: 4 feet of the rim
//   paint              the rest of the lane (16 feet wide, to the free-throw line)
//   mid-lb ... mid-rb  mid-range twos outside the lane, by their angle from the rim: the left baseline (out to
//                      36 degrees off it), the left elbow (to 72), the center (72-108), the right elbow, the
//                      right baseline (a shot behind the rim's line is a baseline one)
//   c3-l, c3-r         corner threes: a three no more than 9 feet out from the rim (the corner's straight line
//                      ends 8.95 feet out, where the arc begins)
//   atb-l/c/r          threes above the break: the left wing (past 108 degrees), the top (72-108), the right
//   (a heave from past half court is left out: the backcourt, nothing to read in a zone)
// Two or three is ESPN's word (the play's points tried, else its text, else a make's points), never the spot's:
// a three a foot inside the arc by the rounding is a three, a long two on the line a two. The rim's place in
// ESPN's grid moved a foot between seasons (y 0, then 1 from 2023-24): each game's is fit to its own shots' "26-
// foot" distances (rimFit).
//
// Sums, not rates, as the NFL's heat-maps.json: the regular season's and the playoffs' kept apart (the whole
// season the two added up), each with its league, players (by ESPN id), offenses and defenses (by the team's
// code, its icon's: what the team's opponents shot against it). A row's zones a flat tuple [tried, made] a zone
// (a plain 0: none); its clutch shots (the last five minutes of the fourth or overtime, the score within 5, the
// NBA's own definition) the same; its assists by where they became shots (12 counts); its assisted makes (a
// defense's: allowed). And
// each row's last 10 games (the season's, playoffs in).
//
// Kept between runs (gitignored, apps/nba/scripts/.cache/shots/<season>.json): each game's shots in a compact
// tuple, so a rebuild never asks ESPN again. The night's update reads them off the summaries box-scores.mjs
// already fetches (its onSummary); a season it has no box scores for walks ESPN's calendar (box-scores.mjs's,
// its kept box scores in the cache too), at box-scores.mjs's polite pace.
//
//   node apps/nba/scripts/shot-zones.mjs 2026 2025      fetch what's missing, then build those seasons
//   node apps/nba/scripts/shot-zones.mjs --build 2026   build from what's kept, no fetching
//
// ESPN's grid has shots from the 2003-04 season on (2001-02 and 2002-03 have them in about half the games:
// left out). FIRST_SEASON.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchRetry, pacer } from '../../../libs/ranker/scripts/fetch.mjs';
import { BOX_DIR, boxFile, siteCode, updateBoxes } from './box-scores.mjs';

export const FIRST_SEASON = 2004;
export const SHOT_DIR = path.join(import.meta.dirname, '.cache/shots');
// (a season whose box scores aren't kept in the repo: its calendar walked into the cache instead)
const CACHE_BOX_DIR = path.join(import.meta.dirname, '.cache/boxes');
const STATIC = path.resolve(import.meta.dirname, '../src/StaticData');
const API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const PACE = 250;

// ---- the zones

export const ZONES = ['ra', 'paint', 'mid-lb', 'mid-lw', 'mid-c', 'mid-rw', 'mid-rb', 'c3-l', 'c3-r', 'atb-l', 'atb-c', 'atb-r'];
export const ZONE_INDEX = new Map(ZONES.map((z, i) => [z, i]));
// (the court in rim-relative feet: the arc's radius, the corner's line, how far out the corner runs, the lane's
// half-width and its length from the rim, the restricted area's radius, half court)
export const ARC = 23.75;
export const CORNER_X = 22;
export const CORNER_Y = 9;
export const LANE_X = 8;
export const LANE_Y = 14;
export const RA = 4;
export const HALF_COURT = 41.75;

// (a shot's angle from the rim: 0 along the baseline to the right, 90 straight out, 180 to the left)
const angleOf = (x, y) => (Math.atan2(y, x) * 180) / Math.PI;

// A shot's zone, from its rim-relative spot (feet: x across, y out), whether it's a three (true, false, or
// null when ESPN doesn't say: then the spot's), and ESPN's own distance in feet when it gives one (-1: none).
// null: a heave from the backcourt
export function shotZone(x, y, three, feet = -1) {
  if (y > HALF_COURT) return null;
  const d = Math.hypot(x, y);
  const isThree = three ?? (feet >= 0 ? feet >= 24 || (y <= CORNER_Y && Math.abs(x) >= CORNER_X) : y <= CORNER_Y ? Math.abs(x) >= CORNER_X : d >= ARC);
  if (isThree) {
    if (y <= CORNER_Y) return x < 0 ? 'c3-l' : 'c3-r';
    const a = angleOf(x, y);
    return a < 72 ? 'atb-r' : a <= 108 ? 'atb-c' : 'atb-l';
  }
  if ((feet >= 0 ? feet : d) <= RA) return 'ra';
  if (Math.abs(x) <= LANE_X && y <= LANE_Y) return 'paint';
  if (y < 0) return x < 0 ? 'mid-lb' : 'mid-rb';
  const a = angleOf(x, y);
  return a < 36 ? 'mid-rb' : a < 72 ? 'mid-rw' : a <= 108 ? 'mid-c' : a <= 144 ? 'mid-lw' : 'mid-lb';
}

// Whether a play is a three by ESPN's word: its points tried, else its text ("27-foot three point jumper",
// "25-foot 3 point shot", "Two Point Jumper"), else a make's points; null when none says
export function isThree(play) {
  if (play.pointsAttempted === 3) return true;
  if (play.pointsAttempted === 2) return false;
  const text = play.text ?? '';
  if (/three point|3[- ]point|3pt/i.test(text)) return true;
  if (/two point|2[- ]point/i.test(text)) return false;
  if (play.scoringPlay && (play.scoreValue === 2 || play.scoreValue === 3)) return play.scoreValue === 3;
  return null;
}

// (a clock as seconds left in the period: "11:45" 705, "34.5" 34.5)
export function clockSeconds(text) {
  const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(text ?? '').trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = String(text ?? '').trim() === '' ? NaN : Number(text);
  return Number.isFinite(s) ? s : 720;
}

// The NBA's clutch: the fourth quarter or overtime, five minutes or less left, the score within 5 (before the shot)
export const isClutch = (period, seconds, margin) => period >= 4 && seconds <= 300 && Math.abs(margin) <= 5;

// ---- a game's shots, from its summary

// A shot kept: [side (0 home, 1 away), shooter, assister (0: none), x, y, made, three (1, 0, -1 unknown),
// period, seconds left, the shooting side's margin before it, ESPN's distance in feet (-1: none)]
export function gameShots(body, game) {
  const comp = body?.header?.competitions?.[0];
  const teamIds = new Map((comp?.competitors ?? []).map((c) => [String(c.team?.id), c.homeAway === 'home' ? 0 : 1]));
  // (a player's side by the box score: a block's play can carry the blocker's team)
  const sideOf = new Map();
  for (const t of body?.boxscore?.players ?? []) {
    const side = teamIds.get(String(t.team?.id));
    for (const a of t.statistics?.[0]?.athletes ?? []) if (side !== undefined) sideOf.set(String(a.athlete?.id), side);
  }
  const shots = [];
  for (const p of body?.plays ?? []) {
    if (!p.shootingPlay || /free throw/i.test(p.type?.text ?? '') || /free throw/i.test(p.text ?? '')) continue;
    const c = p.coordinate;
    // (ESPN marks a shot it couldn't place far off the board, or at 0,0)
    if (!c || typeof c.x !== 'number' || typeof c.y !== 'number' || Math.abs(c.x) > 1000 || Math.abs(c.y) > 1000 || (c.x === 0 && c.y === 0)) continue;
    const shooter = String(p.participants?.[0]?.athlete?.id ?? '');
    const side = sideOf.get(shooter) ?? teamIds.get(String(p.team?.id));
    if (!shooter || side === undefined) continue;
    const made = p.scoringPlay ? 1 : 0;
    // (the second named on a make is the assist: on a miss it's the blocker)
    const assister = made && /assist/i.test(p.text ?? '') ? Number(p.participants?.[1]?.athlete?.id ?? 0) : 0;
    const three = isThree(p);
    const points = made ? Number(p.scoreValue) || 0 : 0;
    const [home, away] = [Number(p.homeScore) || 0, Number(p.awayScore) || 0];
    const margin = side === 0 ? home - points - away : away - points - home;
    const feet = /(\d+)[- ](?:foot|ft)\b/i.exec(p.text ?? '');
    shots.push([side, Number(shooter), assister, c.x, c.y, made, three === null ? -1 : three ? 1 : 0, Number(p.period?.number) || 1, clockSeconds(p.clock?.displayValue), margin, feet ? Number(feet[1]) : -1]);
  }
  return { d: game.d, t: game.t, h: game.h, a: game.a, r: rimFit(shots), s: shots };
}

// A final's day, part and teams from its own summary (a game box-scores.mjs didn't keep)
export function gameOf(body) {
  const comp = body?.header?.competitions?.[0];
  const side = (w) => siteCode(comp?.competitors?.find((c) => c.homeAway === w)?.team?.abbreviation ?? '');
  return { d: String(comp?.date ?? '').slice(0, 10).replace(/-/g, ''), t: Number(body?.header?.season?.type) === 3 ? 3 : 2, h: side('home'), a: side('away') };
}

// Where the rim sits in the game's grid (y 0 or 1, x 25): the one its shots' own distances fit best; null
// with too few to say (the season's then)
export function rimFit(shots) {
  const told = shots.filter((s) => s[10] > 0);
  if (told.length < 12) return null;
  const err = (ry) => told.reduce((a, s) => a + Math.abs(Math.hypot(s[3] - 25, s[4] - ry) - s[10]), 0);
  return err(1) < err(0) ? 1 : 0;
}

// ---- kept between runs

export const shotFile = (season, dir = SHOT_DIR) => path.join(dir, `${season}.json`);
export function readShots(season, dir = SHOT_DIR) {
  const file = shotFile(season, dir);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { season, games: {}, missing: [] };
}
function saveShots(kept, dir = SHOT_DIR) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(shotFile(kept.season, dir), JSON.stringify(kept));
}

// A season's shots brought up to date: the box scores' new finals read as they come (box-scores.mjs's
// onSummary), then any final whose shots aren't kept (a cache lost, a season whose box scores were already
// in) asked for on its own. Returns the kept shots and the box scores
export async function updateShots(season, { fetch, log = console.log, pace = PACE, dir = SHOT_DIR, boxDir, today } = {}) {
  const kept = readShots(season, dir);
  kept.missing ??= [];
  const boxesAt = boxDir ?? (existsSync(boxFile(season)) ? BOX_DIR : CACHE_BOX_DIR);
  let added = 0;
  const take = (id, body, game) => {
    const g = gameShots(body, game);
    if (g.s.length) {
      kept.games[id] = g;
      added++;
    } else if (!kept.missing.includes(id)) kept.missing.push(id);
  };
  const boxes = await updateBoxes(season, { dir: boxesAt, fetch, log, pace, ...(today ? { today } : {}), onSummary: take });
  const before = pacer(pace);
  // (and the finals box-scores.mjs left out for an empty box score: ESPN has their plays all the same, about 170
  // games a season in 2012-13 through 2017-18; their day, part and teams from the summary itself)
  const left = [...Object.entries(boxes.games ?? {}), ...(boxes.missing ?? []).map((id) => [id, null])].filter(([id]) => !kept.games[id] && !kept.missing.includes(id));
  if (left.length) log(`${season}: ${left.length} finals' shots to read`);
  try {
    for (const [id, game] of left) {
      const body = await fetchRetry(`${API}/summary?event=${id}`, { as: 'json', before, fetch, notFound: null });
      if (body) take(id, body, game ?? gameOf(body));
      else kept.missing.push(id);
      if (added && added % 100 === 0) saveShots(kept, dir);
    }
  } catch (err) {
    log(`${season}: shots stopped (${err.message}); the rest next run`);
  }
  saveShots(kept, dir);
  log(`${season}: ${added} games' shots read, ${Object.keys(kept.games).length} kept`);
  return { kept, boxes };
}

// ---- the season's zones

const Z = ZONES.length;
const zeros = (n) => new Array(n).fill(0);
const newRow = () => ({ s: zeros(Z * 2), c: zeros(Z * 2), a: zeros(Z), am: 0, g: new Set() });
const newPart = () => ({ league: newRow(), players: new Map(), offenses: new Map(), defenses: new Map() });
const rowOf = (map, key) => {
  if (!map.has(key)) map.set(key, newRow());
  return map.get(key);
};

// The season's heat-maps.json from its kept games: each shot in its zone, by part (the regular season, the
// playoffs), for the league, its shooter, its assister, its team and the team it was taken against; and each
// row's last 10 games
export function buildHeat(kept) {
  const games = Object.entries(kept.games ?? {}).sort(([a, x], [b, y]) => x.d.localeCompare(y.d) || a.localeCompare(b));
  // (the season's own rim, for a game with too few distances to fit its own)
  const fits = games.map(([, g]) => g.r).filter((r) => r !== null && r !== undefined);
  const seasonRim = fits.filter((r) => r === 1).length * 2 > fits.length ? 1 : 0;
  const parts = { regular: newPart(), post: newPart() };
  // (each row's games in order, a game's own zones: for the last 10)
  const byGame = { players: new Map(), offenses: new Map(), defenses: new Map() };
  const gameRow = (kind, key, id) => {
    if (!byGame[kind].has(key)) byGame[kind].set(key, new Map());
    const m = byGame[kind].get(key);
    if (!m.has(id)) m.set(id, zeros(Z * 2));
    return m.get(id);
  };
  let shots = 0;
  for (const [id, g] of games) {
    const part = g.t === 3 ? parts.post : parts.regular;
    const ry = g.r ?? seasonRim;
    const teams = [g.h, g.a];
    for (const [side, shooter, assister, x, y, made, three, period, seconds, margin, feet] of g.s) {
      const zone = shotZone(x - 25, y - ry, three === -1 ? null : three === 1, feet);
      if (zone === null) continue;
      const i = ZONE_INDEX.get(zone);
      const clutch = isClutch(period, seconds, margin);
      const team = teams[side];
      const opp = teams[1 - side];
      const rows = [part.league, rowOf(part.players, String(shooter)), rowOf(part.offenses, team), rowOf(part.defenses, opp)];
      for (const r of rows) {
        r.s[i * 2]++;
        r.s[i * 2 + 1] += made;
        if (clutch) {
          r.c[i * 2]++;
          r.c[i * 2 + 1] += made;
        }
        r.g.add(id);
      }
      if (made && assister) {
        for (const r of [part.league, rowOf(part.players, String(assister)), rowOf(part.offenses, team)]) r.a[i]++;
        for (const r of [part.league, rowOf(part.players, String(shooter)), rowOf(part.offenses, team), rowOf(part.defenses, opp)]) r.am++;
      }
      for (const [kind, key] of [
        ['players', String(shooter)],
        ['offenses', team],
        ['defenses', opp],
      ]) {
        const t = gameRow(kind, key, id);
        t[i * 2]++;
        t[i * 2 + 1] += made;
      }
      shots++;
    }
  }
  // (a tuple of zeros a plain 0)
  const pack = (t) => (t.some(Boolean) ? t : 0);
  const packRow = (r) => {
    const out = { s: pack(r.s) };
    if (r.c.some(Boolean)) out.c = r.c;
    if (r.a.some(Boolean)) out.a = r.a;
    if (r.am) out.am = r.am;
    out.g = r.g.size;
    return out;
  };
  // (a player with a shot or an assist; the rest have nothing to draw)
  const packRows = (m) => Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b)).map(([k, r]) => [k, packRow(r)]));
  const packPart = (p) => (p.league.g.size ? { league: packRow(p.league), players: packRows(p.players), offenses: packRows(p.offenses), defenses: packRows(p.defenses) } : null);
  const last10 = (m) =>
    Object.fromEntries(
      [...m]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, perGame]) => {
          const sum = zeros(Z * 2);
          for (const t of [...perGame.values()].slice(-10)) t.forEach((v, j) => (sum[j] += v));
          return [k, pack(sum)];
        }),
    );
  return {
    season: kept.season,
    fields: { zone: ZONES },
    games: games.length,
    shots,
    regular: packPart(parts.regular),
    post: packPart(parts.post),
    l10: { players: last10(byGame.players), offenses: last10(byGame.offenses), defenses: last10(byGame.defenses) },
  };
}

// Where a season's file goes: under seasons/<year> once that season is archived there, else the top (the
// season being played)
export function heatPath(season, staticDir = STATIC) {
  const archived = path.join(staticDir, 'seasons', String(season));
  return existsSync(path.join(archived, 'skill-players.json')) ? path.join(archived, 'heat-maps.json') : path.join(staticDir, 'heat-maps.json');
}

// The season's file written from what's kept (nothing kept: none written); its size in KB
export function writeHeat(kept, file = heatPath(kept.season), log = console.log) {
  if (!Object.keys(kept.games ?? {}).length) return log(`${kept.season}: no shots kept, no heat-maps.json`);
  const out = JSON.stringify(buildHeat(kept));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, out);
  log(`${kept.season}: heat-maps.json ${Math.round(out.length / 1024)} KB (${Object.keys(kept.games).length} games) -> ${path.relative(path.resolve(STATIC, '../..'), file)}`);
}

// Run on its own: fetch the seasons named (or build them from what's kept, --build), then write their files
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const build = args.includes('--build');
  const seasons = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
  for (const season of seasons) {
    if (season < FIRST_SEASON) {
      console.log(`${season}: before ESPN's shot spots (${FIRST_SEASON} on), skipped`);
      continue;
    }
    const kept = build ? readShots(season) : (await updateShots(season)).kept;
    writeHeat(kept);
  }
}
