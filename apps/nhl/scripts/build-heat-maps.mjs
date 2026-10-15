// The card's Heat Maps (the NHL's): where every unblocked shot came from, from MoneyPuck's shot-by-shot file
// (moneypuck.com/data.htm: free for non-commercial use, credited on the About page), binned at build time
// into sixteen named zones of the offensive half of the rink and never shipped raw. Per skater (his own
// shots), per goalie (the shots he faced), per team (its offense's shots and what its defense allowed) and
// the league's, each zone's attempts, shots on goal, goals and expected goals, and its rebounds' share of
// them, by strength (5-on-5, the power play, the rest) and, for a goalie, by shot type. (Not the rush: the
// file's shotRush marks almost none in recent seasons, 75 of 2025-26's 119,000 shots.)
//
//   node apps/nhl/scripts/build-heat-maps.mjs              (the season being played: nightly, after update-data)
//   node apps/nhl/scripts/build-heat-maps.mjs 2009-2026    (past seasons: once; a finished season doesn't change)
//
// Three files a season, beside its skill-players.json (StaticData/ for the season being played,
// StaticData/seasons/<year>/ before it): heat-maps.json (the league, the goalies and the teams: a goalie's,
// a team's card and the AI preview's matchup maps read it), heat-maps.forwards.json and heat-maps.defense.json
// (the skaters, the centers' and wingers' and the defensemen's: a skater's card reads his own group's), each
// kept near 300 KB.
//
// Keys, as the card has its rows: the players by their NHL id (MoneyPuck's shooterPlayerId and
// goalieIdForShot are the NHL's own ids, written "8478402.0" in the older files: siteId), only the ones the
// season's files list; the teams by the abbreviation in their logo's file name ("BOS", "PHX"), MoneyPuck's
// older codes ("L.A", "N.J", "S.J", "T.B") and the Coyotes' (ARI before 2014-15, PHX on the site) mapped to
// them (teamCode). A season is named for the year it ends in (2026 is 2025-26: MoneyPuck's 2025).
//
// The file keeps sums (the expected goals in hundredths), the regular season's and the playoffs', so the
// site adds them into the whole season. A cell is a tuple in fields.cell's order, its trailing zeros
// dropped, a plain 0 when it's all zeros; a row of sixteen cells is 0 when every one is.

import { existsSync, rmSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachedDownload, fetchRetry } from '../../../libs/ranker/scripts/fetch.mjs';
import { currentSeason } from '../../../libs/ranker/scripts/wiki-staff.mjs';
import { readJson, writeIfChanged } from '../../../libs/ranker/scripts/json-files.mjs';
import { seasonsArg } from '../../../libs/ranker/scripts/cli.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const CACHE = path.join(ROOT, '.cache/moneypuck');
const DATA = path.join(ROOT, 'apps/nhl/src/StaticData');
const SHOTS = 'https://peter-tanner.com/moneypuck/downloads';
// (fresh enough: the nightly run downloads the season being played again; a past season's never change)
const FRESH_HOURS = 6;
// (the site's first season, 2008-09: MoneyPuck's shots go back a season further, to 2007-08)
export const FIRST_SEASON = 2009;

// ---- the zones: the offensive half of the rink in MoneyPuck's adjusted coordinates (feet; every shot toward
// the net at x 89, the blue line at 25, the end boards at 100; y across, positive on the shooter's left as he
// faces the net). The faceoff dots sit at x 69, y ±22, the circles' tops at x 54. In the contract's fixed
// order, near to far: the surface (libs/ranker/src/engine/heat-map/surfaces/rink.ts) draws the same ids
export const ZONE_IDS = [
  'long',
  'point-left',
  'point-middle',
  'point-right',
  'wing-left',
  'circle-left',
  'high-slot',
  'circle-right',
  'wing-right',
  'corner-left',
  'low-left',
  'slot',
  'low-right',
  'corner-right',
  'crease',
  'behind',
];
export const RINK = { goal: 89, blue: 25, dots: 69, circleTop: 54, crease: 80, slotHalf: 9, dotY: 22, boards: 100 };

// A shot's zone, its place in ZONE_IDS, or -1: no spot
export function zoneOf(x, y) {
  const fx = Number(x);
  const fy = Number(y);
  if (x === '' || y === '' || x == null || y == null || !Number.isFinite(fx) || !Number.isFinite(fy)) return -1;
  const ax = Math.abs(fy);
  const side = fy > 0 ? 'left' : 'right';
  let id;
  if (fx < RINK.blue) id = 'long';
  else if (fx <= RINK.circleTop) id = ax <= RINK.slotHalf ? 'point-middle' : `point-${side}`;
  else if (fx <= RINK.dots) id = ax <= RINK.slotHalf ? 'high-slot' : ax <= RINK.dotY ? `circle-${side}` : `wing-${side}`;
  else if (ax > RINK.dotY) id = `corner-${side}`;
  else if (fx > RINK.goal) id = 'behind';
  else if (ax > RINK.slotHalf) id = `low-${side}`;
  else id = fx > RINK.crease ? 'crease' : 'slot';
  return ZONE_IDS.indexOf(id);
}

// ---- a shot's other parts

// (its strength for the shooting team: 5-on-5; the power play, more skaters than the other side with its own
// goalie in; or the rest: 4-on-4, 3-on-3, shorthanded, an extra attacker)
export function strengthOf(shot) {
  const home = shot.isHomeTeam === '1';
  const own = Number(home ? shot.homeSkatersOnIce : shot.awaySkatersOnIce);
  const opp = Number(home ? shot.awaySkatersOnIce : shot.homeSkatersOnIce);
  const ownNetEmpty = (home ? shot.homeEmptyNet : shot.awayEmptyNet) === '1';
  if (own === 5 && opp === 5 && !ownNetEmpty) return 'ev';
  if (own > opp && !ownNetEmpty) return 'pp';
  return 'ot';
}

// (its type, as a goalie's map groups them: wrist and snap shots, slap shots, tips and deflections, backhands
// and wraparounds; none for an unrecorded one)
export const TYPES = ['ws', 'slap', 'tip', 'back'];
const TYPE_OF = { WRIST: 'ws', SNAP: 'ws', SLAP: 'slap', TIP: 'tip', DEFL: 'tip', BACK: 'back', WRAP: 'back' };
export const typeOf = (shotType) => TYPE_OF[shotType] ?? null;

// A player's id as the site has it: the NHL's, a whole number ("8478402.0" -> "8478402"); none for 0 or blank
export function siteId(v) {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) || n <= 0 ? null : String(Math.round(n));
}

// A MoneyPuck team code as the site's logo abbreviation (null: a team the season's files don't have)
const OLD_CODES = { 'L.A': 'LAK', 'N.J': 'NJD', 'S.J': 'SJS', 'T.B': 'TBL' };
const ALIASES = { ARI: ['PHX', 'UTA'], PHX: ['ARI'], UTA: ['ARI'] };
export function teamCode(code, known) {
  const c = OLD_CODES[code] ?? code;
  if (!known || known.has(c)) return c;
  return (ALIASES[c] ?? []).find((a) => known.has(a)) ?? null;
}

// ---- the tally

// (a cell's fields, in the file's order: attempts (unblocked), shots on goal, goals, expected goals; the same
// three for its rebounds)
export const CELL = ['att', 'sog', 'g', 'xg', 'rebAtt', 'rebG', 'rebXg'];
const W = CELL.length;
const STRENGTHS = ['ev', 'pp', 'ot'];

const newRows = () => Array.from({ length: ZONE_IDS.length }, () => new Array(W).fill(0));
const newEntry = (types) => ({ games: new Set(), ev: newRows(), pp: newRows(), ot: newRows(), ...(types ? { ty: Object.fromEntries(TYPES.map((t) => [t, newRows()])) } : {}) });

function add(rows, z, shot) {
  const c = rows[z];
  const xg = Number(shot.xGoal) || 0;
  const goal = shot.goal === '1';
  c[0]++;
  if (shot.shotWasOnGoal === '1' || goal) c[1]++;
  if (goal) c[2]++;
  c[3] += xg;
  if (shot.shotRebound === '1') {
    c[4]++;
    if (goal) c[5]++;
    c[6] += xg;
  }
}

// Every shot of a part (the regular season's, the playoffs') into its rows: the league's, each listed
// skater's (his own), each listed goalie's (faced) and each team's offense's and defense's. Empty-net shots
// left out (no goalie to beat: they'd tell nothing of a shooter's finishing or a goalie's saves), and a shot
// with no spot. keys: the site's skaters and goalies, the teams' abbreviations (null: everyone)
export function tally(shots, { skaters = null, goalies = null, teams = null } = {}) {
  const league = newEntry(true);
  const sk = new Map();
  const gk = new Map();
  const off = new Map();
  const def = new Map();
  const get = (map, key, types) => {
    if (!map.has(key)) map.set(key, newEntry(types));
    return map.get(key);
  };
  for (const s of shots) {
    if (s.shotOnEmptyNet === '1') continue;
    const z = zoneOf(s.xCordAdjusted, s.yCordAdjusted);
    if (z < 0) continue;
    const st = strengthOf(s);
    const ty = typeOf(s.shotType);
    const home = s.isHomeTeam === '1';
    const shooting = teamCode(s.teamCode, teams);
    const defending = teamCode(home ? s.awayTeamCode : s.homeTeamCode, teams);
    const into = (e) => {
      add(e[st], z, s);
      if (e.ty && ty) add(e.ty[ty], z, s);
      e.games.add(s.game_id);
    };
    into(league);
    const shooter = siteId(s.shooterPlayerId);
    if (shooter && (!skaters || skaters.has(shooter))) into(get(sk, shooter, false));
    const goalie = siteId(s.goalieIdForShot);
    if (goalie && (!goalies || goalies.has(goalie))) into(get(gk, goalie, true));
    if (shooting) into(get(off, shooting, false));
    if (defending) into(get(def, defending, false));
  }
  // (a team's games: the ones it shot in or was shot at in; the league's every team's added up, so a team's
  // per game reads against it)
  for (const [team, e] of def) {
    const o = get(off, team, false);
    for (const g of e.games) o.games.add(g);
    for (const g of o.games) e.games.add(g);
  }
  const teamGames = [...off.values()].reduce((a, e) => a + e.games.size, 0);
  return { league, teamGames, skaters: sk, goalies: gk, offense: off, defense: def };
}

// ---- packing: hundredths, trailing zeros dropped, all-zero cells and rows a plain 0

export function packCell(c) {
  const out = c.map((v, i) => (i === 3 || i === 6 ? Math.round(v * 100) : v));
  let n = out.length;
  while (n && !out[n - 1]) n--;
  return n ? out.slice(0, n) : 0;
}
export function packRows(rows) {
  const cells = rows.map(packCell);
  return cells.some((c) => c !== 0) ? cells : 0;
}
// (a goalie's shot types only once he's faced enough of them to say something: a backup's few would be
// greyed in every zone)
export const TYPE_MIN = 250;
function packEntry(e, { games = true } = {}) {
  const out = {};
  if (games) out.gp = e.games.size;
  for (const st of STRENGTHS) out[st] = packRows(e[st]);
  const faced = STRENGTHS.reduce((a, st) => a + e[st].reduce((b, c) => b + c[0], 0), 0);
  if (e.ty && faced >= TYPE_MIN) {
    const ty = Object.fromEntries(TYPES.map((t) => [t, packRows(e.ty[t])]).filter(([, r]) => r !== 0));
    if (Object.keys(ty).length) out.ty = ty;
  }
  return out;
}
const sorted = (map, pack) => Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([k, e]) => [k, pack(e)]));

// A part's files: the league, goalies and teams (heat-maps.json), the forwards and the defensemen
// (heat-maps.forwards.json, heat-maps.defense.json)
export function section(shots, keys = {}) {
  const t = tally(shots, keys);
  if (!t.league.games.size) return null;
  const main = {
    league: { ...packEntry(t.league, { games: false }), gp: t.teamGames },
    goalies: sorted(t.goalies, (e) => packEntry(e)),
    offense: sorted(t.offense, (e) => packEntry(e)),
    defense: sorted(t.defense, (e) => packEntry(e)),
  };
  // (a skater's games: the site has them; his rows alone, in his group's file: forwards or defensemen)
  const group = (g) => sorted(new Map([...t.skaters].filter(([id]) => (keys.groups?.get(id) ?? 'F') === g)), (e) => packEntry(e, { games: false }));
  return { main, forwards: group('F'), defense: group('D') };
}

// ---- reading the file: the zip's one CSV, only the columns above

export const COLUMNS = [
  'game_id', 'isPlayoffGame', 'event', 'goal', 'shotWasOnGoal', 'xGoal', 'xCordAdjusted', 'yCordAdjusted', 'shooterPlayerId', 'goalieIdForShot',
  'teamCode', 'homeTeamCode', 'awayTeamCode', 'isHomeTeam', 'homeSkatersOnIce', 'awaySkatersOnIce', 'homeEmptyNet', 'awayEmptyNet',
  'shotOnEmptyNet', 'shotType', 'shotRebound',
];

// (MoneyPuck's CSV has no quoted fields: a plain split; only the columns above kept)
export function parseShots(text, columns = COLUMNS) {
  const lines = text.split('\n');
  const head = lines[0].replace(/\r$/, '').split(',');
  const at = columns.map((c) => [c, head.indexOf(c)]).filter(([, k]) => k >= 0);
  const missing = columns.filter((c) => !head.includes(c));
  if (missing.length) throw new Error(`MoneyPuck's shots file has no ${missing.join(', ')}`);
  const shots = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line === '\r') continue;
    const row = line.replace(/\r$/, '').split(',');
    const shot = {};
    for (const [c, k] of at) shot[c] = row[k];
    shots.push(shot);
  }
  return shots;
}

// A zip's first file (MoneyPuck's hold one CSV): read from its central directory, inflated
export function unzipFirst(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const central = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(central) !== 0x02014b50) throw new Error('no central directory');
  const method = buf.readUInt16LE(central + 10);
  const size = buf.readUInt32LE(central + 20);
  const local = buf.readUInt32LE(central + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip method ${method}`);
}

async function download(season, current) {
  const file = `shots_${season - 1}.zip`;
  // (kept in .cache/moneypuck: libs/ranker/scripts/fetch.mjs cachedDownload; a season's file is ~20 MB, a
  // longer limit)
  const body = await cachedDownload(
    path.join(CACHE, file),
    () => fetchRetry(`${SHOTS}/${file}`, { as: 'buffer', attempts: 3, timeout: 300000, notFound: null, headers: { 'User-Agent': 'sports-ranker data script' } }),
    { current, freshHours: FRESH_HOURS },
  );
  return body?.length ? body : null;
}

// (a team's abbreviation from its logo's file name: "assets/NHL_Icons/WSH_secondary.svg" -> "WSH")
export const logoAbbr = (logo) => /([A-Z]{2,3})[^/]*\.svg$/.exec(logo ?? '')?.[1] ?? null;

// The season's rows, every part's: who gets a key (and each skater's group: F, a center or a winger; D)
export const GROUPS = { F: 'forwards', D: 'defense' };
export function seasonKeys(dir) {
  const skaters = new Set();
  const groups = new Map();
  const goalies = new Set();
  const teams = new Set();
  const names = new Map();
  for (const suffix of ['', '.post', '.all']) {
    const file = readJson(path.join(dir, `skill-players${suffix}.json`));
    for (const pos of ['C', 'LW', 'RW', 'D'])
      for (const row of file?.[pos] ?? []) {
        const id = row.gsisId ? String(row.gsisId) : null;
        if (!id) continue;
        skaters.add(id);
        if (!groups.has(id)) groups.set(id, pos === 'D' ? 'D' : 'F');
      }
    for (const row of file?.G ?? []) if (row.gsisId) goalies.add(String(row.gsisId));
    for (const pos of ['C', 'LW', 'RW', 'D', 'G', 'HC'])
      for (const row of file?.[pos] ?? []) {
        const abbr = logoAbbr(row.teamLogo);
        if (!abbr) continue;
        teams.add(abbr);
        if (row.teamName && (pos === 'HC' || !names.has(abbr))) names.set(abbr, row.teamName);
      }
  }
  return { skaters, goalies, teams, groups, names };
}

async function buildSeason(season, current) {
  const dir = current ? DATA : path.join(DATA, 'seasons', String(season));
  if (!existsSync(path.join(dir, 'skill-players.json'))) return null;
  const zip = await download(season, current);
  // (no shots yet for a new season: last season's files at the top of StaticData/ taken down, archived already)
  if (!zip) {
    if (current) for (const name of ['heat-maps.json', ...Object.values(GROUPS).map((g) => `heat-maps.${g}.json`)]) if (readJson(path.join(dir, name))?.season !== season) rmSync(path.join(dir, name), { force: true });
    return null;
  }
  const shots = parseShots(unzipFirst(zip).toString('utf8'));
  const keys = seasonKeys(dir);
  const regular = section(
    shots.filter((s) => s.isPlayoffGame !== '1'),
    keys,
  );
  const post = section(
    shots.filter((s) => s.isPlayoffGame === '1'),
    keys,
  );
  const head = { season, fields: { cell: CELL, zones: ZONE_IDS, types: TYPES }, updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
  return [
    // (each team's name by its abbreviation, "BOS" -> "Boston Bruins": a matchup map's title)
    writeIfChanged(path.join(dir, 'heat-maps.json'), { ...head, teams: Object.fromEntries([...keys.names].sort(([a], [b]) => a.localeCompare(b))), regular: regular?.main ?? null, post: post?.main ?? null }),
    ...Object.values(GROUPS).map((g) => writeIfChanged(path.join(dir, `heat-maps.${g}.json`), { ...head, regular: regular?.[g] ?? null, post: post?.[g] ?? null })),
  ];
}

async function main() {
  const CURRENT_SEASON = currentSeason(path.join(import.meta.dirname, '..'));
  const arg = process.argv[2];
  const seasons = seasonsArg(arg, CURRENT_SEASON);
  for (const season of seasons.filter((s) => s >= FIRST_SEASON)) {
    try {
      const files = await buildSeason(season, season === CURRENT_SEASON);
      const said = (r) => `${path.basename(r.file)} ${r.same ? 'unchanged' : 'written'} (${Math.round(r.size / 1024)} KB)`;
      console.log(files ? `${season}: ${files.map(said).join(', ')}` : `${season}: no season files or no MoneyPuck shots, skipped`);
    } catch (err) {
      console.log(`${season}: FAILED ${err.message}`);
      // (the others still built, but the run fails: the workflow says so, not a season quietly left out)
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
