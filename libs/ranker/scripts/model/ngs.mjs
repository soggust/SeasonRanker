// The NFL's Next Gen Stats for the props (the owner, 2026-10-18: "the bettor should ABSOLUTELY be knowing about
// any stats we have including NGS"): nflverse's weekly NGS rows (release nextgen_stats: ngs_passing, ngs_receiving,
// ngs_rushing, one file each for every season since 2016), read into a table that answers, for a player before a
// game, his NGS numbers so far as they'd have been published by then (props.mjs CTX cpoe, ttt, aggr, sep, cush,
// yacoe, ryoe, box8, oppBox). Each value is 0 at the league's level and 0 unread (a backup NGS never listed).
//
// No look-ahead: NGS posts a week's rows after its last game (about Tuesday). A row of (season, week) counts
// only from its week's last kickoff plus NGS_PUB_HOURS (pubOf), so a week's row informs later weeks' games
// only, never its own (a Thursday game of the next week reads it: 36 hours after a Monday night's kickoff is
// Wednesday morning). The week-0 rows (NGS's season totals) are never read: a season's own total holds its
// later games. Live, a game's numbers are those published by the earlier of its start and now (the file holds
// nothing later anyway). tests/model-ngs.test.mjs pins the rule.
//
// His numbers: this season's weekly rows counted in full, last season's at half (as matchups.mjs proe), older
// none, each weighted by its volume (attempts, targets, receptions, carries), pulled toward the league's level by
// a prior of K's volume at it (the league's: every row published by then, this season's and last at the same
// weights; by position for the receivers' separation and cushion, a tight end's and a back's apart from a wide
// receiver's), then over the league's per the unit below:
//   cpoe    a passer's completion % over expected (NGS's), per 5 points (K 200 attempts)
//   ttt     his time to throw over the league's, per 0.25 s (K 100 attempts)
//   aggr    his aggressiveness (% of throws into tight windows) over the league's, per 5 points (K 100)
//   sep     a pass-catcher's separation at the catch or incompletion over his position's, per 0.5 yards (K 30 targets)
//   cush    his cushion at the snap over his position's, per yard (K 30 targets)
//   yacoe   his yards after the catch over expected, a catch, per yard (K 20 receptions)
//   ryoe    a rusher's rushing yards over expected a carry, per 0.5 yards (K 60 carries); ryoeP the same, 0 under 0
//   box8    the share of his carries against 8 or more in the box over the league's, per 10 points (K 60)
//   oppBox  the other side's defense's: the share of the carries against it with 8 or more in the box (every
//           rusher NGS lists against it), over the league's, per 10 points (K 100 carries)

import { nflverseGames, nflverseRows } from './sources.mjs';

export const NGS_PUB_HOURS = 36;
const HOUR = 36e5;
const r3 = (x) => Math.round(x * 1000) / 1000;

// (each metric: its file's kind, its column, the volume column it's weighted by, its prior K, its unit, and
// whether the league's level is by position)
export const NGS_METRICS = {
  cpoe: { kind: 'passing', col: 'completion_percentage_above_expectation', vol: 'attempts', K: 200, unit: 5 },
  ttt: { kind: 'passing', col: 'avg_time_to_throw', vol: 'attempts', K: 100, unit: 0.25 },
  aggr: { kind: 'passing', col: 'aggressiveness', vol: 'attempts', K: 100, unit: 5 },
  sep: { kind: 'receiving', col: 'avg_separation', vol: 'targets', K: 30, unit: 0.5, byPos: true },
  cush: { kind: 'receiving', col: 'avg_cushion', vol: 'targets', K: 30, unit: 1, byPos: true },
  yacoe: { kind: 'receiving', col: 'avg_yac_above_expectation', vol: 'receptions', K: 20, unit: 1 },
  ryoe: { kind: 'rushing', col: 'rush_yards_over_expected_per_att', vol: 'rush_attempts', K: 60, unit: 0.5 },
  box8: { kind: 'rushing', col: 'percent_attempts_gte_eight_defenders', vol: 'rush_attempts', K: 60, unit: 10 },
};
export const OPP_BOX = { K: 100, unit: 10 };
export const NGS_KEYS = [...Object.keys(NGS_METRICS), 'ryoeP', 'oppBox'];

// A week's rows' publication time (ms): its last kickoff (nflverse's schedule: gameday and gametime, US Eastern)
// plus NGS_PUB_HOURS; null for a week the schedule doesn't have (its rows never read)
export function pubTimes(schedule) {
  const last = new Map();
  for (const g of schedule ?? []) {
    if (!g.gameday || !(Number(g.week) > 0)) continue;
    const t = Date.parse(`${g.gameday}T${/^\d\d:\d\d$/.test(g.gametime ?? '') ? g.gametime : '20:00'}:00-04:00`);
    if (!Number.isFinite(t)) continue;
    const key = `${Number(g.season)}|${Number(g.week)}`;
    if (!(last.get(key) >= t)) last.set(key, t);
  }
  return (season, week) => {
    const t = last.get(`${Number(season)}|${Number(week)}`);
    return Number.isFinite(t) ? t + NGS_PUB_HOURS * HOUR : null;
  };
}

// The table, from the rows already read: rows { kind, season, week, pid (ESPN's), pos, opp (the other side's ESPN
// id, or null), ...the columns }, pubOf(season, week) as above. of(pid, oppId, season, at): his values before a
// game in that season starting at `at` (ms)
export function ngsTable(rows, pubOf) {
  const mine = new Map();
  const lg = [];
  const def = new Map();
  for (const x of rows) {
    const week = Number(x.week);
    if (!(week > 0)) continue;
    const pub = pubOf(x.season, week);
    if (!Number.isFinite(pub)) continue;
    const e = { season: Number(x.season), pub, kind: x.kind, pos: x.pos, v: {} };
    for (const [k, m] of Object.entries(NGS_METRICS)) {
      if (m.kind !== x.kind) continue;
      const val = Number(x[m.col]);
      const w = Number(x[m.vol]);
      if (x[m.col] !== '' && x[m.col] !== 'NA' && Number.isFinite(val) && w > 0) e.v[k] = [val, w];
    }
    if (!Object.keys(e.v).length) continue;
    if (x.pid) mine.set(x.pid, [...(mine.get(x.pid) ?? []), e]);
    lg.push(e);
    if (x.kind === 'rushing' && x.opp && e.v.box8) def.set(String(x.opp), [...(def.get(String(x.opp)) ?? []), e]);
  }
  lg.sort((a, b) => a.pub - b.pub);
  const wOf = (e, season, at) => (e.pub > at ? 0 : e.season === season ? 1 : e.season === season - 1 ? 0.5 : 0);
  // (the league's level by metric (and position) at a time: memoized by season and the published count)
  const pubs = lg.map((e) => e.pub);
  const upto = (at) => {
    let lo = 0;
    let hi = pubs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pubs[mid] <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const memo = new Map();
  const league = (season, at) => {
    const n = upto(at);
    const key = `${season}|${n}`;
    if (memo.has(key)) return memo.get(key);
    const s = {};
    for (let i = 0; i < n; i++) {
      const e = lg[i];
      const w = e.season === season ? 1 : e.season === season - 1 ? 0.5 : 0;
      if (!w) continue;
      for (const [k, [val, vol]] of Object.entries(e.v)) {
        for (const g of NGS_METRICS[k].byPos ? [k, `${k}|${e.pos}`] : [k]) {
          const t = (s[g] ??= [0, 0]);
          t[0] += w * vol * val;
          t[1] += w * vol;
        }
      }
    }
    const out = Object.fromEntries(Object.entries(s).filter(([, t]) => t[1] > 0).map(([g, t]) => [g, t[0] / t[1]]));
    memo.set(key, out);
    return out;
  };
  return {
    of: (pid, oppId, season, at) => {
      const out = Object.fromEntries(NGS_KEYS.map((k) => [k, 0]));
      if (!Number.isFinite(at)) return out;
      const lv = league(Number(season), at);
      const list = mine.get(String(pid)) ?? [];
      for (const [k, m] of Object.entries(NGS_METRICS)) {
        let sv = 0;
        let sw = 0;
        let pos = null;
        for (const e of list) {
          const w = wOf(e, Number(season), at);
          if (!w || !e.v[k]) continue;
          sv += w * e.v[k][1] * e.v[k][0];
          sw += w * e.v[k][1];
          pos = e.pos;
        }
        const base = m.byPos ? (lv[`${k}|${pos}`] ?? lv[k]) : lv[k];
        if (!(sw > 0) || !Number.isFinite(base)) continue;
        out[k] = r3(((sv + m.K * base) / (sw + m.K) - base) / m.unit);
      }
      const d = def.get(String(oppId)) ?? [];
      let sv = 0;
      let sw = 0;
      for (const e of d) {
        const w = wOf(e, Number(season), at);
        if (!w) continue;
        sv += w * e.v.box8[1] * e.v.box8[0];
        sw += w * e.v.box8[1];
      }
      // (his yards over expected on its good side alone: an efficient back's carries rise with it, a poor one's
      // don't fall the same way (measured 2026-10-18, INPUTS.md))
      out.ryoeP = Math.max(0, out.ryoe);
      if (sw > 0 && Number.isFinite(lv.box8)) out.oppBox = r3(((sv + OPP_BOX.K * lv.box8) / (sw + OPP_BOX.K) - lv.box8) / OPP_BOX.unit);
      return out;
    },
  };
}

// nflverse's NGS files read and joined to ESPN's ids: the players by nflverse's players file (gsis to ESPN), the
// other side by the schedule (season, week and team to the game's other team, then to ESPN's team id from the
// history's games). null when the files can't be read (every NGS term reads 0: the stat as without them)
export async function nflNgs(history) {
  try {
    const schedule = await nflverseGames();
    if (!schedule.length) return null;
    const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'espn_id'], 24 * 7);
    const espnOf = new Map((players ?? []).filter((p) => p.espn_id && p.espn_id !== 'NA').map((p) => [p.gsis_id, String(Number(p.espn_id))]));
    const games = new Map((history ?? []).map((g) => [String(g.id), g]));
    const teamId = new Map();
    const oppCode = new Map();
    for (const g of schedule) {
      const h = games.get(String(g.espn));
      if (h) {
        teamId.set(`${g.season}|${g.home_team}`, String(h.home));
        teamId.set(`${g.season}|${g.away_team}`, String(h.away));
      }
      oppCode.set(`${g.season}|${g.week}|${g.home_team}`, g.away_team);
      oppCode.set(`${g.season}|${g.week}|${g.away_team}`, g.home_team);
    }
    const cols = { passing: ['attempts', 'completion_percentage_above_expectation', 'avg_time_to_throw', 'aggressiveness'], receiving: ['targets', 'receptions', 'avg_separation', 'avg_cushion', 'avg_yac_above_expectation'], rushing: ['rush_attempts', 'rush_yards_over_expected_per_att', 'percent_attempts_gte_eight_defenders'] };
    const rows = [];
    for (const [kind, extra] of Object.entries(cols)) {
      const got = await nflverseRows('nextgen_stats', `ngs_${kind}.csv.gz`, ['season', 'season_type', 'week', 'player_gsis_id', 'player_position', 'team_abbr', ...extra], 12);
      if (!got?.length) return null;
      for (const x of got) {
        const opp = oppCode.get(`${x.season}|${Number(x.week)}|${x.team_abbr}`);
        rows.push({ ...x, kind, pid: espnOf.get(x.player_gsis_id) ?? null, pos: x.player_position === 'FB' ? 'RB' : x.player_position, opp: opp ? (teamId.get(`${x.season}|${opp}`) ?? null) : null });
      }
    }
    const table = ngsTable(rows, pubTimes(schedule));
    console.log(`nfl: Next Gen Stats read: ${rows.length} weekly rows (${rows.filter((x) => x.pid).length} matched to ESPN's ids)`);
    return table;
  } catch (err) {
    console.warn(`nfl: Next Gen Stats not read (${err.message ?? err}): its terms read 0`);
    return null;
  }
}
