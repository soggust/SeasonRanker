// The card's Field Map: where each player's plays went on the field, from nflverse's play-by-play. A
// quarterback's throws by zone (behind the line, short, intermediate, deep; left, middle, right) and his
// designed runs by lane; a receiver's or back's targets by the same zones, a back's carries by lane (the
// ends, tackles and guards on each side, and the middle); a kicker's field goals by distance and his extra
// points (the misses of each by how they missed: wide left or right, short, blocked, from the play's
// description); a punter's punts (gross, net, inside the 20, touchbacks, fair catches, by distance); and each
// defense's, what it allowed by zone and lane. The league's pooled the same way, what "average" is. One
// file per season: StaticData/field-maps.json for the season being played, StaticData/seasons/<year>/ for
// past ones, each with the regular season, the playoffs (null until they've begun) and both. Free: no AI.
// Beside each, heat-maps.json: the card's Heat Maps tab (the zones' more layers, the red zone, the field-position
// strip, the down & distance grid: heatSection below), from the same play-by-play.
//
//   node apps/nfl/scripts/build-field-maps.mjs              (the season being played: nightly, after update-data)
//   node apps/nfl/scripts/build-field-maps.mjs 2000-2025    (past seasons: once; a finished season doesn't change)
//
// Keys, as the card has its rows: the players by their gsisId (skill-players.json's RB, WR, TE, K and P
// rows), the quarterbacks by their ESPN id (games.json's id: players.csv's espn_id to the play-by-play's
// passer), the defenses "DEF-ARI". Only the rows the season's files have are kept (the file stays small).
// nflverse's pass_location and air_yards start in 2006 (earlier seasons: the zones all empty, the runs
// and kicks still there).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry } from '../../../libs/ranker/scripts/fetch.mjs';
import { currentSeason } from '../../../libs/ranker/scripts/wiki-staff.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const CACHE = path.join(ROOT, '.cache/nflverse');
const DATA = path.join(ROOT, 'apps/nfl/src/StaticData');
const NFLVERSE = 'https://github.com/nflverse/nflverse-data/releases/download';
// (fresh enough: the nightly run downloads the season being played again; a past season's never change)
const FRESH_HOURS = 6;

// ---- the field's parts, in the contract's fixed orders
export const DEPTHS = ['behind', 'short', 'mid', 'deep'];
export const SIDES = ['left', 'middle', 'right'];
export const LANES = ['left end', 'left tackle', 'left guard', 'middle', 'right guard', 'right tackle', 'right end'];
export const FG_BANDS = ['<30', '30-39', '40-49', '50-59', '60+'];
export const PUNT_BANDS = ['<40', '40-49', '50-59', '60+'];
// Earlier seasons' abbreviations for teams that moved, as today's (update-data.mjs's sameTeamAbbrs)
const MOVED_TEAMS = { OAK: 'LV', SD: 'LAC', STL: 'LA' };

// (the play-by-play's columns this reads)
export const COLUMNS = [
  'season_type', 'play_type', 'posteam', 'defteam', 'pass_attempt', 'sack', 'two_point_attempt', 'pass_location', 'air_yards',
  'complete_pass', 'passing_yards', 'receiving_yards', 'yards_gained', 'pass_touchdown', 'interception', 'epa', 'passer_player_id',
  'receiver_player_id', 'rusher_player_id', 'run_location', 'run_gap', 'rushing_yards', 'rush_touchdown', 'qb_scramble',
  'qb_kneel', 'field_goal_result', 'kick_distance', 'kicker_player_id', 'extra_point_result', 'punter_player_id',
  'punt_inside_twenty', 'touchback', 'punt_fair_catch', 'punt_blocked', 'return_yards', 'desc',
  // (and the Heat Maps': heat-maps.json)
  'game_id', 'yardline_100', 'down', 'ydstogo', 'pass', 'qb_spike', 'cpoe', 'yards_after_catch',
];

const num = (v) => (v === undefined || v === null || v === '' || v === 'NA' ? null : Number(v));
const yes = (v) => v === '1' || v === 1 || v === true;
const id = (v) => (v && v !== 'NA' ? v : null);
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// A zone's place in the 12 (depth-major, then side), or -1: no location or air yards
export function zoneIndex(airYards, location) {
  const ay = num(airYards);
  const side = SIDES.indexOf(location);
  if (ay === null || side < 0) return -1;
  const depth = ay < 0 ? 0 : ay < 10 ? 1 : ay < 20 ? 2 : 3;
  return depth * 3 + side;
}

// A lane's place in the 7, or -1: the middle has no gap; a left or right run without one isn't placed
export function laneIndex(location, gap) {
  if (location === 'middle') return 3;
  if (location !== 'left' && location !== 'right') return -1;
  const g = ['end', 'tackle', 'guard'].indexOf(gap);
  if (g < 0) return -1;
  return location === 'left' ? g : 6 - g;
}

export function fgBand(distance) {
  const d = num(distance);
  if (d === null) return -1;
  return d < 30 ? 0 : d < 40 ? 1 : d < 50 ? 2 : d < 60 ? 3 : 4;
}

export function puntBand(distance) {
  const d = num(distance);
  if (d === null) return -1;
  return d < 40 ? 0 : d < 50 ? 1 : d < 60 ? 2 : 3;
}

// How a field goal or an extra point missed, from the play's description (nflverse has no column for it):
// "No Good, Wide Left", "Wide Right", "Short", "Hit Left Upright" (wide left), "Hit Right Upright" (wide
// right), "Hit Crossbar" (short), "BLOCKED"; anything else (a bad hold, no reason given) "other". Its
// place in MISSES
export const MISSES = ['left', 'right', 'short', 'blocked', 'other'];
export function missKind(desc, result) {
  if (result === 'blocked') return 3;
  const m = /No Good,\s*(Wide Left|Wide Right|Short|Hit Left Upright|Hit Right Upright|Hit Crossbar)/i.exec(desc ?? '');
  if (m) {
    const how = m[1].toLowerCase();
    return how.includes('left') ? 0 : how.includes('right') ? 1 : 2;
  }
  return /\bblocked\b/i.test(desc ?? '') ? 3 : 4;
}

// ---- the tallies (sums while counting; finished into the contract's shapes at the end)
const newZones = () => DEPTHS.flatMap((depth) => SIDES.map((side) => ({ depth, side, att: 0, comp: 0, yds: 0, td: 0, int: 0, epa: 0 })));
const newLanes = () => LANES.map((lane) => ({ lane, att: 0, yds: 0, td: 0, epa: 0, success: 0 }));
const newBands = () => FG_BANDS.map((band) => ({ band, att: 0, made: 0, miss: [0, 0, 0, 0, 0] }));
const newXp = () => ({ att: 0, made: 0, miss: [0, 0, 0, 0, 0] });
const newPunt = () => ({ n: 0, kicked: 0, gross: 0, net: 0, inside20: 0, touchbacks: 0, fairCatches: 0, blocked: 0, bands: PUNT_BANDS.map((band) => ({ band, n: 0 })) });

// (yards: the passer's and a defense's the play's passing yards; a receiver's his own receiving yards, short of
// what a lateral after his catch added, as his stats count them)
function addPass(z, play, yards = 'passing_yards') {
  z.att++;
  if (yes(play.complete_pass)) {
    z.comp++;
    z.yds += num(play[yards]) ?? num(play.yards_gained) ?? 0;
  }
  if (yes(play.pass_touchdown)) z.td++;
  if (yes(play.interception)) z.int++;
  z.epa += num(play.epa) ?? 0;
}
function addRun(l, play) {
  const epa = num(play.epa) ?? 0;
  l.att++;
  l.yds += num(play.rushing_yards) ?? num(play.yards_gained) ?? 0;
  if (yes(play.rush_touchdown)) l.td++;
  l.epa += epa;
  if (epa > 0) l.success++;
}
function addPunt(p, play) {
  p.n++;
  if (yes(play.punt_blocked)) {
    p.blocked++;
    return;
  }
  const gross = num(play.kick_distance);
  if (gross === null) return;
  const tb = yes(play.touchback);
  p.kicked++;
  p.gross += gross;
  // (the NFL's net: the kick, less the return, less 20 for a touchback)
  p.net += gross - (num(play.return_yards) ?? 0) - (tb ? 20 : 0);
  if (yes(play.punt_inside_twenty)) p.inside20++;
  if (tb) p.touchbacks++;
  if (yes(play.punt_fair_catch)) p.fairCatches++;
  p.bands[puntBand(gross)].n++;
}

// One part's plays (already that part's: REG, POST or both) tallied: the league's, each player's (by the
// play-by-play's gsis id) and each defense's (by its abbreviation). Plays are the play-by-play's rows (strings,
// as read) or the same with numbers.
export function tally(plays) {
  const league = { pass: newZones(), runs: newLanes(), fg: newBands(), xp: newXp(), punt: newPunt() };
  const players = new Map();
  const defenses = new Map();
  const player = (pid) => {
    if (!players.has(pid)) players.set(pid, {});
    return players.get(pid);
  };
  const defense = (team) => {
    if (!defenses.has(team)) defenses.set(team, { pass: newZones(), runs: newLanes() });
    return defenses.get(team);
  };
  for (const play of plays) {
    if (yes(play.two_point_attempt)) continue;
    const type = play.play_type;
    const def = MOVED_TEAMS[play.defteam] ?? play.defteam;
    if (type === 'pass' && yes(play.pass_attempt) && !yes(play.sack)) {
      const z = zoneIndex(play.air_yards, play.pass_location);
      if (z < 0) continue;
      addPass(league.pass[z], play);
      if (def && def !== 'NA') addPass(defense(def).pass[z], play);
      const passer = id(play.passer_player_id);
      if (passer) addPass(((player(passer).pass ??= newZones()))[z], play);
      const receiver = id(play.receiver_player_id);
      if (receiver) addPass(((player(receiver).targets ??= newZones()))[z], play, 'receiving_yards');
    } else if (type === 'run' && !yes(play.qb_kneel) && !yes(play.qb_scramble)) {
      const l = laneIndex(play.run_location, play.run_gap);
      if (l < 0) continue;
      addRun(league.runs[l], play);
      if (def && def !== 'NA') addRun(defense(def).runs[l], play);
      const rusher = id(play.rusher_player_id);
      if (rusher) addRun(((player(rusher).runs ??= newLanes()))[l], play);
    } else if (type === 'field_goal') {
      const b = fgBand(play.kick_distance);
      if (b < 0 || !play.field_goal_result || play.field_goal_result === 'NA') continue;
      const made = play.field_goal_result === 'made';
      const miss = made ? -1 : missKind(play.desc, play.field_goal_result);
      const add = (bands) => {
        bands[b].att++;
        if (made) bands[b].made++;
        else bands[b].miss[miss]++;
      };
      add(league.fg);
      const kicker = id(play.kicker_player_id);
      if (kicker) add((player(kicker).fg ??= newBands()));
    } else if (type === 'extra_point') {
      const r = play.extra_point_result;
      if (!r || r === 'NA' || r === 'aborted') continue;
      const miss = r === 'good' ? -1 : missKind(play.desc, r);
      const add = (xp) => {
        xp.att++;
        if (r === 'good') xp.made++;
        else xp.miss[miss]++;
      };
      add(league.xp);
      const kicker = id(play.kicker_player_id);
      if (kicker) add((player(kicker).xp ??= newXp()));
    } else if (type === 'punt') {
      addPunt(league.punt, play);
      const punter = id(play.punter_player_id);
      if (punter) addPunt((player(punter).punt ??= newPunt()), play);
    }
  }
  return { league, players, defenses };
}

// ---- finished, packed (a season's file with every zone an object was over a megabyte): each zone, lane
// and band a tuple in the order FIELDS gives (the file carries FIELDS too), in the zones', lanes' and
// bands' fixed orders; EPA and success per attempt to 3dp, yards to 1dp; the punt's averages
export const FIELDS = {
  zone: ['att', 'comp', 'yds', 'td', 'int', 'epa'],
  lane: ['att', 'yds', 'td', 'epa', 'success'],
  band: ['att', 'made'],
  miss: MISSES,
  zones: DEPTHS.flatMap((depth) => SIDES.map((side) => `${depth}-${side}`)),
  lanes: LANES,
  fgBands: FG_BANDS,
  puntBands: PUNT_BANDS,
};
const finishZones = (zones) => zones.map((z) => [z.att, z.comp, round(z.yds, 1), z.td, z.int, z.att ? round(z.epa / z.att, 3) : 0]);
const finishLanes = (lanes) =>
  lanes.map((l) => [l.att, round(l.yds, 1), l.td, l.att ? round(l.epa / l.att, 3) : 0, l.att ? round(l.success / l.att, 3) : 0]);
const finishBands = (bands) => bands.map((b) => [b.att, b.made]);
// (how each band's misses went, in MISSES' order: wide left, wide right, short, blocked, other)
const finishMisses = (bands) => bands.map((b) => b.miss);
const finishXp = (xp) => ({ att: xp.att, made: xp.made });
const finishPunt = ({ kicked, gross, net, ...p }) => ({
  n: p.n,
  gross: kicked ? round(gross / kicked, 1) : 0,
  net: kicked ? round(net / kicked, 1) : 0,
  inside20: p.inside20,
  touchbacks: p.touchbacks,
  fairCatches: p.fairCatches,
  blocked: p.blocked,
  bands: p.bands.map((b) => b.n),
});
function finishPlayer(p) {
  const out = {};
  if (p.pass) out.pass = finishZones(p.pass);
  if (p.targets) out.targets = finishZones(p.targets);
  if (p.runs) out.runs = finishLanes(p.runs);
  if (p.fg) {
    out.fg = finishBands(p.fg);
    out.fgMiss = finishMisses(p.fg);
  }
  if (p.xp) {
    out.xp = finishXp(p.xp);
    out.xpMiss = p.xp.miss;
  }
  if (p.punt) out.punt = finishPunt(p.punt);
  return out;
}

// A part's section, as the contract has it: the tallies keyed the card's way. keys: the gsis ids the
// season's skill-player rows have (kept under themselves), qbs: games.json's QB ids (ESPN) by gsis id,
// teams: the defenses' abbreviations the season has (null: every one).
export function section(plays, { keys = null, qbs = new Map(), teams = null } = {}) {
  const t = tally(plays);
  const players = {};
  for (const [gsis, p] of t.players) {
    if (!keys || keys.has(gsis)) players[gsis] = finishPlayer(p);
    const espn = qbs.get(gsis);
    if (espn) players[espn] = finishPlayer(p);
  }
  const defenses = {};
  for (const [team, d] of [...t.defenses].sort(([a], [b]) => a.localeCompare(b))) {
    if (teams && !teams.has(team)) continue;
    defenses[`DEF-${team}`] = { pass: finishZones(d.pass), runs: finishLanes(d.runs) };
  }
  return {
    league: {
      pass: finishZones(t.league.pass),
      runs: finishLanes(t.league.runs),
      fg: finishBands(t.league.fg),
      fgMiss: finishMisses(t.league.fg),
      xp: finishXp(t.league.xp),
      xpMiss: t.league.xp.miss,
      punt: finishPunt(t.league.punt),
    },
    players,
    defenses,
  };
}

// ---- the Heat Maps (heat-maps.json, beside field-maps.json: the card's Heat Maps tab). The same zones with
// more layers (success, CPOE, yards after the catch); the red zone (snaps inside the 20: its throws by where on
// the field the ball went, the 20 to the end zone, and its runs by lane and where they started; and a player's
// share of his team's targets and carries there, inside the 10 and inside the 5, in the games he played); the field-position strip (ten 10-yard bands, his own goal line to theirs); and
// the down & distance grid (downs 1-4 by short 1-3, medium 4-7, long 8+ to go). Every number a sum, not a
// rate (EPA, CPOE and YAC added up), so the regular season and the playoffs add up to the whole season on the
// site: only those two parts are kept. Plays: passes (sacks and scrambles counted as dropbacks) and runs,
// not two-point tries, kneels or spikes.

// (a band's place, 0 his own 1 to 10 up to 9 their 10 to the goal line, from the play's yards to go to score)
export function bandIndex(yardline100) {
  const y = num(yardline100);
  if (y === null || y <= 0 || y > 100) return -1;
  return Math.min(9, Math.floor((100 - y) / 10));
}
export const BAND_NAMES = Array.from({ length: 10 }, (_, k) => (k < 5 ? `own ${k * 10}-${k * 10 + 10}` : `opp ${100 - k * 10}-${90 - k * 10}`));

// (a down and distance's place in the 12: down-major, then short (1-3 to go), medium (4-7), long (8+))
export const DISTANCES = ['short', 'medium', 'long'];
export function downIndex(down, togo) {
  const d = num(down);
  const t = num(togo);
  if (!d || d < 1 || d > 4 || t === null || t < 1) return -1;
  return (d - 1) * 3 + (t <= 3 ? 0 : t <= 7 ? 1 : 2);
}
export const DOWN_NAMES = [1, 2, 3, 4].flatMap((d) => DISTANCES.map((k) => `${d}-${k}`));

// (inside the 20; and a throw into the end zone: as far in the air as the goal line is away)
export const inRedZone = (yardline100) => {
  const y = num(yardline100);
  return y !== null && y > 0 && y <= 20;
};
export const intoEndZone = (airYards, yardline100) => {
  const a = num(airYards);
  const y = num(yardline100);
  return a !== null && y !== null && a >= y;
};

// The red zone's spots, near to far (the 20 to the 10, the 10 to the 5, the 5 to the goal line, the end zone),
// three across (left, middle, right): a throw's where the ball went, its target spot (the snap's yards to go
// less its air yards; as far as the goal line or past it, the end zone); a designed run's where it started, in
// its lane (nflverse's run_location: no run starts in the end zone)
export const RZ_ROWS = ['i20', 'i10', 'i5', 'ez'];
export const RZ_SPOTS = RZ_ROWS.flatMap((r) => SIDES.map((s) => `${r}-${s}`));
// (a spot's row from its yards to the goal line: none or less the end zone, 1-5, 6-10, 11 on; a throw behind the
// line from the 18 lands in the 20-to-10 row)
export function rzRow(toGo) {
  return toGo <= 0 ? 3 : toGo <= 5 ? 2 : toGo <= 10 ? 1 : 0;
}
export function rzPassSpot(airYards, yardline100, location) {
  const ay = num(airYards);
  const side = SIDES.indexOf(location);
  if (ay === null || side < 0 || !inRedZone(yardline100)) return -1;
  return rzRow(num(yardline100) - ay) * 3 + side;
}
export function rzRunSpot(yardline100, location) {
  const side = SIDES.indexOf(location);
  if (side < 0 || !inRedZone(yardline100)) return -1;
  return rzRow(num(yardline100)) * 3 + side;
}

export const HEAT_FIELDS = {
  zone: ['att', 'comp', 'td', 'int', 'epa', 'success', 'cpoe', 'yac'],
  // (the red zone's throws and runs by spot: rzSpots's order)
  rzZone: ['att', 'comp', 'td', 'int', 'epa', 'success'],
  rzRun: ['att', 'yds', 'td', 'epa', 'success'],
  rzSpots: RZ_SPOTS,
  lane: ['att', 'yds', 'td', 'epa', 'success'],
  band: ['plays', 'epa', 'success', 'td'],
  // (a player's, the team's targets and carries beside his own in that spot, in his games: his shares)
  down: ['plays', 'pass', 'success', 'epa', 'teamTargets', 'teamCarries'],
  share: ['targets', 'carries', 'endZone', 'targets10', 'carries10', 'targets5', 'carries5', 'td', 'teamTargets', 'teamCarries', 'teamTargets10', 'teamCarries10', 'teamTargets5', 'teamCarries5'],
  zones: FIELDS.zones,
  lanes: LANES,
  bands: BAND_NAMES,
  downs: DOWN_NAMES,
};

const rows = (n, width) => Array.from({ length: n }, () => new Array(width).fill(0));

// A unit's or a player's tallies: the zones (a passer's throws, a catcher's targets: their own), the red
// zone's, the strip, the grid
const newHeat = (player = false) => ({
  pass: null,
  targets: null,
  rz: { pass: null, targets: null, runs: null, share: player ? new Array(8).fill(0) : null },
  band: rows(10, 4),
  down: rows(12, player ? 6 : 4),
  games: player ? new Set() : null,
});

// (a throw: tried, caught, a touchdown, picked, its EPA, a success)
function addZone(z, play, epa) {
  z[0]++;
  if (yes(play.complete_pass)) z[1]++;
  if (yes(play.pass_touchdown)) z[2]++;
  if (yes(play.interception)) z[3]++;
  z[4] += epa;
  if (epa > 0) z[5]++;
}
// (the whole field's: its CPOE, added up over the throws (nflverse's, every charted throw has one), and the
// yards after the catch on a catch)
function addLayers(z, play) {
  z[6] += num(play.cpoe) ?? 0;
  if (yes(play.complete_pass)) z[7] += num(play.yards_after_catch) ?? 0;
}
function addLane(l, play, epa) {
  l[0]++;
  l[1] += num(play.rushing_yards) ?? num(play.yards_gained) ?? 0;
  if (yes(play.rush_touchdown)) l[2]++;
  l[3] += epa;
  if (epa > 0) l[4]++;
}

// A part's plays tallied for the Heat Maps: the league's, each player's (by gsis id), each defense's and each
// offense's (by abbreviation)
export function heatTally(plays) {
  const league = newHeat();
  const players = new Map();
  const defenses = new Map();
  const offenses = new Map();
  // (each team's targets and carries in each game: in each down and distance, and in the red zone, inside the
  // 10 and the 5; a player's shares are his against his team's in the games he played)
  const teamGames = new Map();
  const of = (map, key, make) => {
    if (!map.has(key)) map.set(key, make());
    return map.get(key);
  };
  for (const play of plays) {
    const type = play.play_type;
    if ((type !== 'pass' && type !== 'run') || yes(play.two_point_attempt) || yes(play.qb_kneel) || yes(play.qb_spike)) continue;
    const epa = num(play.epa);
    if (epa === null) continue;
    const off = MOVED_TEAMS[play.posteam] ?? id(play.posteam);
    const def = MOVED_TEAMS[play.defteam] ?? id(play.defteam);
    const yl = num(play.yardline_100);
    const b = bandIndex(yl);
    const d = downIndex(play.down, play.ydstogo);
    const rz = inRedZone(yl);
    const scramble = yes(play.qb_scramble);
    const dropback = play.pass === undefined || play.pass === '' ? type === 'pass' || scramble : yes(play.pass);
    const thrown = type === 'pass' && yes(play.pass_attempt) && !yes(play.sack);
    const designed = type === 'run' && !scramble;
    const td = yes(play.pass_touchdown) || yes(play.rush_touchdown);
    const passer = id(play.passer_player_id);
    const receiver = thrown ? id(play.receiver_player_id) : null;
    const rusher = id(play.rusher_player_id);
    const z = thrown ? zoneIndex(play.air_yards, play.pass_location) : -1;
    // (inside the 20: a throw's target spot, a designed run's lane and start)
    const rzPass = thrown && rz ? rzPassSpot(play.air_yards, yl, play.pass_location) : -1;
    const rzRun = designed && rz ? rzRunSpot(yl, play.run_location) : -1;
    const ez = thrown && intoEndZone(play.air_yards, yl);
    const gameKey = `${play.game_id}|${off}`;

    if (off && play.game_id) {
      const tg = of(teamGames, gameKey, () => ({ down: rows(12, 2), rz: new Array(6).fill(0) }));
      const target = !!receiver;
      const carry = designed && !!rusher;
      if (d >= 0) {
        if (target) tg.down[d][0]++;
        if (carry) tg.down[d][1]++;
      }
      if (rz && (target || carry)) {
        const k = target ? 0 : 1;
        tg.rz[k]++;
        if (yl <= 10) tg.rz[2 + k]++;
        if (yl <= 5) tg.rz[4 + k]++;
      }
    }

    // (the league, the defense on the field, the offense: every play)
    const units = [league, def ? of(defenses, def, () => newHeat()) : null, off ? of(offenses, off, () => newHeat()) : null];
    for (const u of units) {
      if (!u) continue;
      if (b >= 0) addBand(u.band[b], epa, td);
      if (d >= 0) addDown(u.down[d], epa, dropback);
      if (z >= 0) {
        const zone = (u.pass ??= rows(12, 8))[z];
        addZone(zone, play, epa);
        addLayers(zone, play);
      }
      if (rzPass >= 0) addZone((u.rz.pass ??= rows(12, 6))[rzPass], play, epa);
      if (rzRun >= 0) addLane((u.rz.runs ??= rows(12, 5))[rzRun], play, epa);
    }

    // (each player on it once: the passer, the target, the runner)
    for (const pid of new Set([passer, receiver, rusher])) {
      if (!pid) continue;
      const p = of(players, pid, () => newHeat(true));
      if (play.game_id && off) p.games.add(gameKey);
      // (his own pass plays: his dropbacks, a QB's scrambles too, or his targets)
      const own = pid === passer || pid === receiver || (pid === rusher && scramble);
      if (b >= 0) addBand(p.band[b], epa, td);
      if (d >= 0) addDown(p.down[d], epa, own);
      if (pid === passer && z >= 0) {
        const zone = (p.pass ??= rows(12, 8))[z];
        addZone(zone, play, epa);
        addLayers(zone, play);
      }
      if (pid === receiver && z >= 0) {
        const zone = (p.targets ??= rows(12, 8))[z];
        addZone(zone, play, epa);
        addLayers(zone, play);
      }
      if (pid === passer && rzPass >= 0) addZone((p.rz.pass ??= rows(12, 6))[rzPass], play, epa);
      if (pid === receiver && rzPass >= 0) addZone((p.rz.targets ??= rows(12, 6))[rzPass], play, epa);
      if (pid === rusher && rzRun >= 0) addLane((p.rz.runs ??= rows(12, 5))[rzRun], play, epa);
      // (his red-zone looks: targets, carries, end-zone targets, inside the 10 and the 5, touchdowns)
      if (rz) {
        const s = p.rz.share;
        const k = pid === receiver ? 0 : designed && pid === rusher ? 1 : -1;
        if (k >= 0) {
          s[k]++;
          if (yl <= 10) s[3 + k]++;
          if (yl <= 5) s[5 + k]++;
          if (k === 0 && ez) s[2]++;
          if (td) s[7]++;
        }
      }
    }
  }
  return { league, players, defenses, offenses, teamGames };
}

function addBand(t, epa, td) {
  t[0]++;
  t[1] += epa;
  if (epa > 0) t[2]++;
  if (td) t[3]++;
}
function addDown(t, epa, pass) {
  t[0]++;
  if (pass) t[1]++;
  if (epa > 0) t[2]++;
  t[3] += epa;
}

// ---- packed: sums to 1dp, a tuple of nothing but zeros a plain 0, a list of them left out
const pack = (t) => (t.every((v) => !v) ? 0 : t.map((v) => (Number.isInteger(v) ? v : round(v, 1))));
const packRows = (list) => (list && list.some((t) => t.some((v) => v)) ? list.map(pack) : undefined);

function finishHeat(h, teamGames) {
  const out = {};
  if (h.games) {
    // (his team's targets and carries in his games, beside his own: the grid's cells and the red zone)
    const team = { down: rows(12, 2), rz: new Array(6).fill(0) };
    for (const g of h.games) {
      const tg = teamGames.get(g);
      if (!tg) continue;
      tg.down.forEach((c, i) => {
        team.down[i][0] += c[0];
        team.down[i][1] += c[1];
      });
      tg.rz.forEach((v, i) => (team.rz[i] += v));
    }
    h.down.forEach((c, i) => {
      c[4] = team.down[i][0];
      c[5] = team.down[i][1];
    });
    if (h.rz.share.some((v) => v)) out.share = [...h.rz.share, ...team.rz];
  }
  const pass = packRows(h.pass);
  const targets = packRows(h.targets);
  if (pass) out.pass = pass;
  if (targets) out.targets = targets;
  const rz = {};
  for (const k of ['pass', 'targets', 'runs']) {
    const r = packRows(h.rz[k]);
    if (r) rz[k] = r;
  }
  if (out.share) {
    rz.share = out.share;
    delete out.share;
  }
  if (Object.keys(rz).length) out.rz = rz;
  const band = packRows(h.band);
  const down = packRows(h.down);
  if (band) out.band = band;
  if (down) out.down = down;
  return out;
}

// A part's Heat Maps section, keyed as the Field Map's (keys, qbs, teams as section's); offenses by their
// Teams-tab row ("TM-Ravens": nicknames, abbreviation -> the logo's name)
export function heatSection(plays, { keys = null, qbs = new Map(), teams = null, nicknames = new Map() } = {}) {
  const t = heatTally(plays);
  const players = {};
  for (const [gsis, p] of t.players) {
    const espn = qbs.get(gsis);
    if (keys && !keys.has(gsis) && !espn) continue;
    const e = finishHeat(p, t.teamGames);
    if (!Object.keys(e).length) continue;
    if (!keys || keys.has(gsis)) players[gsis] = e;
    if (espn) players[espn] = e;
  }
  const units = (map, key) =>
    Object.fromEntries(
      [...map]
        .filter(([team]) => !teams || teams.has(team))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([team, u]) => [key(team), finishHeat(u, t.teamGames)])
        .filter(([k]) => k),
    );
  return {
    league: finishHeat(t.league, t.teamGames),
    players,
    defenses: units(t.defenses, (team) => `DEF-${team}`),
    offenses: units(t.offenses, (team) => (nicknames.get(team) ? `TM-${nicknames.get(team)}` : null)),
  };
}

// ---- reading the play-by-play: only the columns above (a season's file is ~370 columns, 50,000 plays)
export function parsePlays(text, columns = COLUMNS) {
  let i = 0;
  const n = text.length;
  // (one line's fields; quoted ones, the play descriptions, can hold commas and newlines)
  const readRow = () => {
    const row = [];
    while (i < n) {
      let field;
      if (text[i] === '"') {
        let j = i + 1;
        let out = '';
        for (;;) {
          const q = text.indexOf('"', j);
          if (q < 0) {
            out += text.slice(j);
            j = n;
            break;
          }
          out += text.slice(j, q);
          if (text[q + 1] === '"') {
            out += '"';
            j = q + 2;
          } else {
            j = q + 1;
            break;
          }
        }
        field = out;
        i = j;
      } else {
        let j = i;
        while (j < n && text[j] !== ',' && text[j] !== '\n' && text[j] !== '\r') j++;
        field = text.slice(i, j);
        i = j;
      }
      row.push(field);
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '\r') i++;
      if (text[i] === '\n') i++;
      break;
    }
    return row;
  };
  const head = readRow();
  const at = columns.map((c) => [c, head.indexOf(c)]).filter(([, k]) => k >= 0);
  const plays = [];
  while (i < n) {
    const row = readRow();
    if (row.length < 2) continue;
    const play = {};
    for (const [c, k] of at) play[c] = row[k];
    plays.push(play);
  }
  return plays;
}

async function download(file, url, current) {
  const to = path.join(CACHE, file);
  if (existsSync(to) && (!current || Date.now() - statSync(to).mtimeMs < FRESH_HOURS * 36e5)) return readFileSync(to);
  // (the big play-by-play files get longer: libs/ranker/scripts/fetch.mjs)
  const body = await fetchRetry(url, { as: 'buffer', attempts: 2, timeout: 300000 });
  mkdirSync(CACHE, { recursive: true });
  if (body.length) writeFileSync(to, body);
  return body;
}

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

async function buildSeason(season, current, { espnToGsis, byName }) {
  const dir = current ? DATA : path.join(DATA, 'seasons', String(season));
  if (!existsSync(path.join(dir, 'skill-players.json'))) return null;
  const plays = parsePlays(gunzipSync(await download(`play_by_play_${season}.csv.gz`, `${NFLVERSE}/pbp/play_by_play_${season}.csv.gz`, current)).toString());

  // (the rows the season's files have, every part's: who gets a key)
  const keys = new Set();
  const teams = new Set();
  const qbs = new Map();
  const nicknames = new Map();
  // (a QB whose ESPN id players.csv has another of, Shaun Hill's: by his name, among the season's passers)
  const passers = new Set(plays.map((p) => p.passer_player_id));
  const gsisOf = (row) => espnToGsis.get(Number(row.id)) ?? (byName.get(row.name) ?? []).find((g) => passers.has(g));
  for (const suffix of ['', '.post', '.all']) {
    const skill = readJson(path.join(dir, `skill-players${suffix}.json`));
    for (const pos of ['RB', 'WR', 'TE', 'K', 'P']) for (const row of skill?.[pos] ?? []) if (row.gsisId) keys.add(row.gsisId);
    for (const row of skill?.DEF ?? []) {
      const team = row.gsisId.replace(/^DEF-/, '');
      teams.add(team);
      // (its offense keyed as its Teams-tab row: "TM-" and its logo's name)
      const nick = /([^/]+)\.png$/.exec(row.teamLogo ?? '')?.[1];
      if (nick) nicknames.set(team, nick);
    }
    for (const row of readJson(path.join(dir, `games${suffix}.json`)) ?? []) {
      const gsis = gsisOf(row);
      if (gsis) qbs.set(gsis, String(row.id));
    }
  }
  const opts = { keys, qbs, teams };
  const regular = plays.filter((p) => p.season_type === 'REG');
  const post = plays.filter((p) => p.season_type === 'POST');
  const out = {
    season,
    fields: FIELDS,
    updated: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    regular: section(regular, opts),
    post: post.length ? section(post, opts) : null,
    all: section(plays, opts),
  };
  // (the Heat Maps': the regular season and the playoffs, the site adds them up for the whole season)
  const heat = {
    season,
    fields: HEAT_FIELDS,
    updated: out.updated,
    // (each team's Teams-tab name by its abbreviation: an opponent's offense, "KC" -> "TM-Chiefs")
    teams: Object.fromEntries([...nicknames].sort(([a], [b]) => a.localeCompare(b))),
    regular: heatSection(regular, { ...opts, nicknames }),
    post: post.length ? heatSection(post, { ...opts, nicknames }) : null,
  };
  return [write(path.join(dir, 'field-maps.json'), out), write(path.join(dir, 'heat-maps.json'), heat)];
}

// (nothing new: the file as it was, its "updated" too, so a quiet night commits nothing)
function write(file, out) {
  const old = readJson(file);
  if (old && JSON.stringify({ ...old, updated: null }) === JSON.stringify({ ...out, updated: null })) return { file, size: statSync(file).size, same: true };
  writeFileSync(file, JSON.stringify(out));
  return { file, size: statSync(file).size, same: false };
}

async function main() {
  const CURRENT_SEASON = currentSeason(path.join(import.meta.dirname, '..'));
  const arg = process.argv[2];
  const seasons = !arg
    ? [CURRENT_SEASON]
    : arg.includes('-')
      ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))(arg.split('-').map(Number))
      : arg.split(',').map(Number);
  const players = parsePlays(gunzipSync(await download('players.csv.gz', `${NFLVERSE}/players/players.csv.gz`, true)).toString(), ['gsis_id', 'espn_id', 'display_name']);
  const espnToGsis = new Map(players.filter((p) => id(p.espn_id) && id(p.gsis_id)).map((p) => [Number(p.espn_id), p.gsis_id]));
  const byName = new Map();
  for (const p of players) if (id(p.gsis_id) && p.display_name) byName.set(p.display_name, [...(byName.get(p.display_name) ?? []), p.gsis_id]);
  for (const season of seasons) {
    try {
      const files = await buildSeason(season, season === CURRENT_SEASON, { espnToGsis, byName });
      const said = (r) => `${path.basename(r.file)} ${r.same ? 'unchanged' : 'written'} (${Math.round(r.size / 1024)} KB)`;
      console.log(files ? `${season}: ${files.map(said).join(', ')}` : `${season}: no season files, skipped`);
    } catch (err) {
      console.log(`${season}: FAILED ${err.message}`);
    }
  }
}

if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
