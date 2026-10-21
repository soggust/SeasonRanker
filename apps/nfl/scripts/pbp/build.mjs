// The NFL's play-by-play aggregates (README.md here lists every field): nflverse's play-by-play (the desk's cache,
// .cache/model/play_by_play_<season>.csv.gz, never committed) read into small per-player-season and per-team-season
// files, apps/nfl/scripts/pbp/data/<season>.json, and a per-player-game file the bettor's research reads
// (.cache/pbp/nfl/games-<season>.json, not committed).
//
//   node apps/nfl/scripts/pbp/build.mjs [--seasons 2016,...,2026]
// Free; no network (the files are the desk's: playerlogs.mjs / context.mjs fetch them).
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const CACHE = path.join(ROOT, '.cache/model');
export const OUT = path.join(import.meta.dirname, 'data');
export const GAMES_DIR = path.join(ROOT, '.cache/pbp/nfl');
export const RZ = 20; // the red zone: the ball at the opponent's 20 or closer
export const DEEP = 20; // a deep target: 20 air yards or more
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

export function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
const num = (v) => (v === '' || v === 'NA' || v === undefined ? null : Number(v));

// One play's facts the aggregates read (null for a play that isn't a run or a pass: kicks, penalties without a play,
// kneels, spikes, two-point tries)
export function playOf(r) {
  const type = r.play_type;
  if (type !== 'pass' && type !== 'run') return null;
  if (r.qb_kneel === '1' || r.qb_spike === '1' || r.two_point_attempt === '1') return null;
  if (r.season_type && r.season_type !== 'REG' && r.season_type !== 'POST') return null;
  return {
    game: r.game_id, week: num(r.week), off: r.posteam, def: r.defteam, pass: type === 'pass', yl: num(r.yardline_100), epa: num(r.epa), success: num(r.success),
    air: num(r.air_yards), yac: num(r.yards_after_catch), xyac: num(r.xyac_mean_yardage), loc: r.pass_location || null, runLoc: r.run_location || null, gap: r.run_gap || null,
    complete: r.complete_pass === '1', sack: r.sack === '1', scramble: r.qb_scramble === '1', td: r.touchdown === '1', cpoe: num(r.cpoe), xpass: num(r.xpass),
    passer: r.passer_player_id || null, receiver: r.receiver_player_id || null, rusher: r.rusher_player_id || null,
    passerName: r.passer_player_name || null, receiverName: r.receiver_player_name || null, rusherName: r.rusher_player_name || null,
  };
}

const blank = () => ({ g: new Set(), tgt: 0, air: 0, airN: 0, rec: 0, recYds: 0, yac: 0, yacX: 0, yacN: 0, rzTgt: 0, deepTgt: 0, midTgt: 0, locN: 0, ezTgt: 0, recEpa: 0, recSucc: 0, car: 0, rushYds: 0, rzCar: 0, i5Car: 0, rushEpa: 0, rushSucc: 0, gaps: { end: 0, tackle: 0, guard: 0, middle: 0 }, db: 0, att: 0, passAir: 0, passAirN: 0, cpoe: 0, cpoeN: 0, dbEpa: 0, dbSucc: 0, sacks: 0, deepAtt: 0, rzAtt: 0, teamTgt: 0, teamAir: 0, teamRzTgt: 0, teamCar: 0, teamRzCar: 0 });
const tblank = () => ({ g: new Set(), plays: 0, passes: 0, xpassN: 0, proe: 0, epa: 0, succ: 0, rz: 0, rzTd: 0, tgt: 0, air: 0, airN: 0, deep: 0, mid: 0, locN: 0, rbTgt: 0, epaPass: 0, epaRun: 0, runs: 0 });

// Reads a season's file: { players: Map id -> tallies, teams: Map team -> { off, def }, games: player-game rows }
export async function readSeason(season, file = path.join(CACHE, `play_by_play_${season}.csv.gz`)) {
  const players = new Map();
  const teams = new Map();
  const pg = new Map(); // `${game}|${id}` -> per-game tallies (the research's)
  const teamGame = new Map(); // `${game}|${team}` -> { tgt, air, rzTgt, car, rzCar }
  const names = new Map();
  const pos = new Map();
  const rl = readline.createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  let cols = null;
  for await (const line of rl) {
    if (!cols) {
      cols = splitCsv(line);
      continue;
    }
    const v = splitCsv(line);
    const r = {};
    for (const c of ['game_id', 'week', 'season_type', 'play_type', 'qb_kneel', 'qb_spike', 'two_point_attempt', 'posteam', 'defteam', 'yardline_100', 'epa', 'success', 'air_yards', 'yards_after_catch', 'xyac_mean_yardage', 'pass_location', 'run_location', 'run_gap', 'complete_pass', 'sack', 'qb_scramble', 'touchdown', 'cpoe', 'xpass', 'passer_player_id', 'receiver_player_id', 'rusher_player_id', 'passer_player_name', 'receiver_player_name', 'rusher_player_name', 'receiving_yards', 'rushing_yards']) r[c] = v[cols.indexOf(c)];
    const p = playOf(r);
    if (!p) continue;
    const P = (id, name) => {
      if (name) names.set(id, name);
      const x = players.get(id) ?? players.set(id, { ...blank(), team: new Map() }).get(id);
      x.g.add(p.game);
      x.team.set(p.off, (x.team.get(p.off) ?? 0) + 1);
      const k = `${p.game}|${id}`;
      const y = pg.get(k) ?? pg.set(k, { game: p.game, week: p.week, id, team: p.off, opp: p.def, ...blank(), g: undefined }).get(k);
      return [x, y];
    };
    const T = (team) => teams.get(team) ?? teams.set(team, { off: tblank(), def: tblank() }).get(team);
    const tg = teamGame.get(`${p.game}|${p.off}`) ?? teamGame.set(`${p.game}|${p.off}`, { tgt: 0, air: 0, rzTgt: 0, car: 0, rzCar: 0 }).get(`${p.game}|${p.off}`);
    const rz = Number.isFinite(p.yl) && p.yl <= RZ;
    for (const [side, t] of [['off', T(p.off).off], ['def', T(p.def).def]]) {
      t.g.add(p.game);
      t.plays++;
      if (Number.isFinite(p.epa)) t.epa += p.epa;
      if (p.success === 1) t.succ++;
      if (p.pass) {
        t.passes++;
        if (Number.isFinite(p.epa)) t.epaPass += p.epa;
      } else {
        t.runs++;
        if (Number.isFinite(p.epa)) t.epaRun += p.epa;
      }
      if (Number.isFinite(p.xpass)) {
        t.xpassN++;
        t.proe += (p.pass ? 1 : 0) - p.xpass;
      }
      if (rz) {
        t.rz++;
        if (p.td) t.rzTd++;
      }
      if (p.pass && p.receiver) {
        t.tgt++;
        if (Number.isFinite(p.air)) (t.air += p.air), t.airN++, p.air >= DEEP && t.deep++;
        if (p.loc) (t.locN++, p.loc === 'middle' && t.mid++);
      }
      void side;
    }
    if (p.pass && p.receiver) {
      tg.tgt++;
      if (Number.isFinite(p.air)) tg.air += p.air;
      if (rz) tg.rzTgt++;
      for (const x of P(p.receiver, p.receiverName)) {
        x.tgt++;
        if (Number.isFinite(p.air)) (x.air += p.air), x.airN++, p.air >= DEEP && x.deepTgt++;
        if (p.loc) (x.locN++, p.loc === 'middle' && x.midTgt++);
        if (rz) x.rzTgt++;
        if (Number.isFinite(p.yl) && Number.isFinite(p.air) && p.air >= p.yl) x.ezTgt++;
        if (p.complete) {
          x.rec++;
          x.recYds += num(r.receiving_yards) ?? 0;
          if (Number.isFinite(p.yac) && Number.isFinite(p.xyac)) (x.yac += p.yac), (x.yacX += p.xyac), x.yacN++;
        }
        if (Number.isFinite(p.epa)) x.recEpa += p.epa;
        if (p.success === 1) x.recSucc++;
      }
    }
    if (!p.pass && p.rusher) {
      tg.car++;
      if (rz) tg.rzCar++;
      for (const x of P(p.rusher, p.rusherName)) {
        x.car++;
        x.rushYds += num(r.rushing_yards) ?? 0;
        if (rz) x.rzCar++;
        if (Number.isFinite(p.yl) && p.yl <= 5) x.i5Car++;
        if (Number.isFinite(p.epa)) x.rushEpa += p.epa;
        if (p.success === 1) x.rushSucc++;
        if (p.gap && x.gaps[p.gap] !== undefined) x.gaps[p.gap]++;
        else if (p.runLoc === 'middle') x.gaps.middle++;
      }
    }
    if (p.pass && p.passer) {
      for (const x of P(p.passer, p.passerName)) {
        x.db++;
        if (p.sack) x.sacks++;
        else if (!p.scramble) {
          x.att++;
          if (Number.isFinite(p.air)) (x.passAir += p.air), x.passAirN++, p.air >= DEEP && x.deepAtt++;
          if (rz) x.rzAtt++;
        }
        if (Number.isFinite(p.cpoe)) (x.cpoe += p.cpoe), x.cpoeN++;
        if (Number.isFinite(p.epa)) x.dbEpa += p.epa;
        if (p.success === 1) x.dbSucc++;
      }
    }
  }
  // the team's shares, by the player's games
  for (const y of pg.values()) {
    const tg = teamGame.get(`${y.game}|${y.team}`);
    if (tg) Object.assign(y, { teamTgt: tg.tgt, teamAir: tg.air, teamRzTgt: tg.rzTgt, teamCar: tg.car, teamRzCar: tg.rzCar });
  }
  for (const [id, x] of players) {
    for (const g of x.g) {
      const pr = pg.get(`${g}|${id}`);
      const tg = pr && teamGame.get(`${g}|${pr.team}`);
      if (tg) (x.teamTgt += tg.tgt), (x.teamAir += tg.air), (x.teamRzTgt += tg.rzTgt), (x.teamCar += tg.car), (x.teamRzCar += tg.rzCar);
    }
  }
  return { players, teams, games: [...pg.values()], names, pos };
}

const div = (a, b, d = r3) => (b > 0 ? d(a / b) : null);
export function playerSeason(id, x, name) {
  const team = [...x.team].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    id, name: name ?? null, team, games: x.g.size,
    receiving: x.tgt ? { targets: x.tgt, targetShare: div(x.tgt, x.teamTgt), airYards: r1(x.air), airYardsShare: div(x.air, x.teamAir), adot: div(x.air, x.airN, r1), deepTargetRate: div(x.deepTgt, x.airN), middleTargetRate: div(x.midTgt, x.locN), redZoneTargets: x.rzTgt, redZoneTargetShare: div(x.rzTgt, x.teamRzTgt), endZoneTargets: x.ezTgt, receptions: x.rec, receivingYards: x.recYds, catchRate: div(x.rec, x.tgt), yacPerRec: div(x.yac, x.yacN, r1), yacOverExpected: div(x.yac - x.yacX, x.yacN, r1), epaPerTarget: div(x.recEpa, x.tgt), successRate: div(x.recSucc, x.tgt), wopr: x.teamTgt && x.teamAir ? r3(1.5 * (x.tgt / x.teamTgt) + 0.7 * (x.air / x.teamAir)) : null } : null,
    rushing: x.car ? { carries: x.car, carryShare: div(x.car, x.teamCar), rushingYards: x.rushYds, redZoneCarries: x.rzCar, redZoneCarryShare: div(x.rzCar, x.teamRzCar), inside5Carries: x.i5Car, epaPerRush: div(x.rushEpa, x.car), successRate: div(x.rushSucc, x.car), gapShare: x.car ? Object.fromEntries(Object.entries(x.gaps).map(([k, v]) => [k, div(v, x.car)])) : null } : null,
    passing: x.db >= 20 ? { dropbacks: x.db, attempts: x.att, adot: div(x.passAir, x.passAirN, r1), deepAttemptRate: div(x.deepAtt, x.passAirN), cpoe: div(x.cpoe, x.cpoeN, r1), epaPerDropback: div(x.dbEpa, x.db), successRate: div(x.dbSucc, x.db), sackRate: div(x.sacks, x.db), redZoneAttempts: x.rzAtt } : null,
  };
}
export function teamSeason(team, t) {
  const side = (s) => ({ games: s.g.size, plays: s.plays, passRate: div(s.passes, s.plays), passRateOverExpected: div(s.proe, s.xpassN), epaPerPlay: div(s.epa, s.plays), epaPerPass: div(s.epaPass, s.passes), epaPerRush: div(s.epaRun, s.runs), successRate: div(s.succ, s.plays), redZonePlays: s.rz, redZoneTdRate: div(s.rzTd, s.rz), adot: div(s.air, s.airN, r1), deepTargetRate: div(s.deep, s.airN), middleTargetRate: div(s.mid, s.locN) });
  return { team, offense: side(t.off), defense: side(t.def) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const arg = process.argv.indexOf('--seasons');
  const seasons = arg > 0 ? process.argv[arg + 1].split(',').map(Number) : Array.from({ length: 11 }, (_, i) => 2016 + i);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(GAMES_DIR, { recursive: true });
  for (const season of seasons) {
    const file = path.join(CACHE, `play_by_play_${season}.csv.gz`);
    if (!existsSync(file)) {
      console.log(`nfl pbp ${season}: no file`);
      continue;
    }
    const t0 = Date.now();
    const s = await readSeason(season, file);
    const players = [...s.players].map(([id, x]) => playerSeason(id, x, s.names.get(id))).filter((p) => p.games > 0).sort((a, b) => (a.team ?? '').localeCompare(b.team ?? '') || a.id.localeCompare(b.id));
    const teams = [...s.teams].map(([t, x]) => teamSeason(t, x)).sort((a, b) => a.team.localeCompare(b.team));
    writeFileSync(path.join(OUT, `${season}.json`), JSON.stringify({ v: 1, sport: 'nfl', season, source: 'nflverse play-by-play', players, teams }));
    writeFileSync(path.join(GAMES_DIR, `games-${season}.json`), JSON.stringify(s.games));
    console.log(`nfl pbp ${season}: ${players.length} players, ${teams.length} teams (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
}
