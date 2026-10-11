// The role backtest (measurement only: never run by the hourly bot, changes nothing it does): how far the NFL
// props' projections (project.mjs, each game projected from the games before it only, replayed a day at a time)
// miss what the players actually did, by the situation each player was in before the game. Built to size the
// role fix (a backup quarterback starting, a fill-in for a hurt regular, a player whose snaps grew, the early
// weeks' shrink toward last season) on outcomes, not on the gap to the market.
//
//   the projections  the bettor's own pipeline offline: games.json, the ratings and the context fit as run.mjs
//                    fits them (the props' game script and context terms), the player rows (playerlogs.mjs),
//                    each stat's settings fit as fitProps fits them (--state: the committed state.json's
//                    instead, quicker but fit on the code the bot last ran: on 2026-10-11 it didn't reproduce,
//                    receptions 14.5% high overall against 0.5% with the fit; use it for a quick look only), then
//                    every row replayed with them. The settings are fit on 30% to 70% of the history by date (the
//                    fit window); the rest after it is held out (the report says which seasons each is)
//   the buckets      from what was known before each game only: nflverse's weekly injury reports (Out,
//                    Doubtful) and weekly rosters (reserve: IR, PUP, NFI, suspended; a reserve listing for a
//                    player who played the game is the roster's move after it, not counted), each player's work
//                    and snap shares in the games before. (The game itself says only who took the field: the rows
//                    are the ones who did, as the props fit's are, and a reserve listing beside a player in it is
//                    read as made after.) Each row in the first that fits, in this order:
//                      backup-qb   his team's QB1 (its quarterback with the most passes a game, recent games
//                                  counting most, a starter's 15 or more) out, and he's the quarterback next in
//                                  line (the most snaps this season and last of the ones not out)
//                      qb1-out     any other player on a team whose QB1 is out
//                      next-up     a regular at his position group out (RB: 8 touches a game or more; WR: 4.5
//                                  targets; TE: 3.5), and he's the group's next man up (its most-used non-regular)
//                      group-out   a regular at his position group out, and he's another of its regulars
//                      snap-jump   his last game's share of the offensive snaps 10 points over his season's
//                                  (the bettor's own snap-jump: props.mjs roleChangeOf)
//                      role-grew   his season's snap share 10 points over last season's (4 games or more of it)
//                      starter-w1-4, starter-w5-8, starter-w9+   an established starter (last season 8 games or
//                                  more at 60% of the snaps or more) by the week of the season: the shrink toward
//                                  last season early on
//                      other       everyone else
//   the numbers      per stat and bucket, on the eligible players (the ones a book posts props for: props.mjs
//                    markEligible) from 2021: the bias (their total over the projections' total, less 1:
//                    under 0 the model ran high), the negative binomial's log loss a game at the stat's own
//                    dispersion (lower is better; only comparable within a stat), each with a 95% interval from
//                    a bootstrap clustered by team-week (a team's game resampled whole, BOOT times, seeded); the
//                    log loss a bucket would save were its projections scaled by its own bias (in sample: a rough
//                    ceiling on what a bucket term could earn; under 0 where the dispersion grows with the projection
//                    (rk) and the scaled one sits wider), and how often the player went over his projection
//
//   node libs/ranker/scripts/model/role-backtest.mjs [--state] [--from 2021] [--report: the .md again from the .json]
//   writes .cache/role-backtest.md (the tables) and .cache/role-backtest.json (the same numbers)

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEAGUES } from './leagues.mjs';
import { fit, fitContext, replay, round } from './ratings.mjs';
import { featurize, gather } from './context.mjs';
import { playerRows } from './playerlogs.mjs';
import { STATS, envFor, fitProps, markEligible } from './props.mjs';
import { nflMatchups } from './matchups.mjs';
import { nbLog, rAt, replayStat } from './project.mjs';
import { CACHE, nflverseRows, readJson } from './sources.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');

// (the buckets, in the order a row is put in the first that fits)
export const BUCKETS = ['backup-qb', 'qb1-out', 'next-up', 'group-out', 'snap-jump', 'role-grew', 'starter-w1-4', 'starter-w5-8', 'starter-w9+', 'other'];
// (a regular at his position group: his recent work a game, recent games counting most (RATE a game): a back's
// carries and targets, a receiver's or tight end's targets)
export const REGULAR = { RB: 8, WR: 4.5, TE: 3.5 };
// (a team's QB1: his passes a game, recent games counting most, this many or more)
export const QB1_MIN = 15;
export const RATE = 0.35;
// (a snap share's jump, a role grown, and an established starter's last season)
export const JUMP = 0.1;
export const STARTER = { games: 8, share: 0.6 };
const BOOT = 1000;

const GROUP = (pos) => (pos === 'RB' || pos === 'FB' ? 'RB' : pos === 'WR' ? 'WR' : pos === 'TE' ? 'TE' : pos === 'QB' ? 'QB' : null);
const touches = (r, g) => (g === 'QB' ? (r.s.passAtt ?? 0) : g === 'RB' ? (r.s.rushAtt ?? 0) + (r.s.targets ?? 0) : (r.s.targets ?? 0));

// Each row's situation before its game (by `${game}|${pid}`: { bucket, flags, week }), walked a day at a time:
// a day's games read from what was known before the day, then learned from. weekOf(game): { season, week } or
// null; outOf(season, week, team): Map of pid to 'report' (Out, Doubtful) or 'reserve' (the roster's IR, PUP,
// NFI, suspended); rosterOf(season, week, team): a Set of the team's pids that week, or null (then a player's
// team is the one he last played for)
export function preGame(rows, { weekOf, outOf, rosterOf = () => null }) {
  const sorted = [...rows].filter((r) => r.team && r.game).sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map();
  // (each player: his last team and season, his work a game in his group, his passes a game (a quarterback's,
  // not faded while he's out), his snap shares by season, his snaps this season and last)
  const pl = new Map();
  const of = (pid) => {
    let p = pl.get(pid);
    if (!p) pl.set(pid, (p = { team: null, season: null, group: null, work: null, att: null, shares: new Map(), snaps: new Map() }));
    return p;
  };
  // (each team's players seen, by team: pids)
  const seen = new Map();
  let i = 0;
  while (i < sorted.length) {
    const day = sorted[i].date.slice(0, 10);
    let j = i;
    while (j < sorted.length && sorted[j].date.slice(0, 10) === day) j++;
    const batch = sorted.slice(i, j);
    const games = new Map();
    for (const r of batch) {
      const key = `${r.game}|${r.team}`;
      games.set(key, [...(games.get(key) ?? []), r]);
    }
    for (const list of games.values()) {
      const { game, team, season } = list[0];
      const wk = weekOf(game);
      const week = wk ? Number(wk.week) : null;
      const playing = new Set(list.map((r) => String(r.pid)));
      const listed = wk ? outOf(season, week, team) : new Map();
      // (out: on the report, or on reserve and not in the game: a reserve listing for one who played is the
      // roster's move after it)
      const isOut = (pid) => {
        const k = listed.get(String(pid));
        return k === 'report' || (k === 'reserve' && !playing.has(String(pid)));
      };
      const roster = wk ? rosterOf(season, week, team) : null;
      // (the team's players now: its roster that week, else the ones whose last team it is; played this season
      // or last)
      const members = [...new Set([...(seen.get(team) ?? []), ...(roster ?? [])])].filter((pid) => {
        const p = pl.get(pid);
        if (!p || !(p.season >= season - 1)) return false;
        return roster ? roster.has(pid) : p.team === team;
      });
      // (QB1, and the next in line when he's out)
      const qbs = members.filter((pid) => pl.get(pid).group === 'QB' && pl.get(pid).att !== null);
      const qb1 = qbs.sort((a, b) => pl.get(b).att - pl.get(a).att)[0] ?? null;
      const qb1Out = !!qb1 && pl.get(qb1).att >= QB1_MIN && isOut(qb1);
      const snapsOf = (pid) => {
        const s = pl.get(pid).snaps;
        return (s.get(season) ?? 0) + (s.get(season - 1) ?? 0);
      };
      const nextQb = qb1Out ? (qbs.filter((pid) => pid !== qb1 && !isOut(pid)).sort((a, b) => snapsOf(b) - snapsOf(a))[0] ?? null) : null;
      // (each group's regulars out, its regulars here, and its next man up)
      const groups = {};
      for (const g of ['RB', 'WR', 'TE']) {
        const mine = members.filter((pid) => pl.get(pid).group === g && pl.get(pid).work !== null);
        const reg = (pid) => pl.get(pid).work >= REGULAR[g];
        const gone = mine.filter((pid) => reg(pid) && isOut(pid));
        const next = gone.length ? (mine.filter((pid) => !reg(pid) && !isOut(pid)).sort((a, b) => pl.get(b).work - pl.get(a).work)[0] ?? null) : null;
        groups[g] = { gone: gone.length, next, regs: new Set(mine.filter((pid) => reg(pid) && !isOut(pid))) };
      }
      for (const r of list) {
        const pid = String(r.pid);
        const p = pl.get(pid);
        const g = GROUP(r.pos);
        const shares = p?.shares.get(season) ?? [];
        const last = p?.shares.get(season - 1) ?? [];
        const avg = (a) => a.reduce((t, x) => t + x, 0) / a.length;
        const flags = {
          backupQb: qb1Out && g === 'QB' && pid === nextQb,
          qb1Out: qb1Out && pid !== qb1 && g !== 'QB',
          nextUp: !!g && g !== 'QB' && groups[g]?.gone > 0 && groups[g].next === pid,
          groupOut: !!g && g !== 'QB' && groups[g]?.gone > 0 && groups[g].regs.has(pid),
          snapJump: shares.length >= 2 && shares[shares.length - 1] > avg(shares) + JUMP,
          roleGrew: shares.length >= 1 && last.length >= 4 && avg(shares) > avg(last) + JUMP,
          starter: last.length >= STARTER.games && avg(last) >= STARTER.share,
        };
        const bucket =
          flags.backupQb ? 'backup-qb'
          : flags.qb1Out ? 'qb1-out'
          : flags.nextUp ? 'next-up'
          : flags.groupOut ? 'group-out'
          : flags.snapJump ? 'snap-jump'
          : flags.roleGrew ? 'role-grew'
          : flags.starter && week ? (week <= 4 ? 'starter-w1-4' : week <= 8 ? 'starter-w5-8' : 'starter-w9+')
          : 'other';
        out.set(`${r.game}|${pid}`, { bucket, flags, week, team: r.team, season });
      }
    }
    // (then the day learned: work, passes, snap shares, snaps; the team's players seen)
    for (const list of games.values()) {
      const most = Math.max(0, ...list.map((r) => r.s.snaps ?? 0));
      for (const r of list) {
        const pid = String(r.pid);
        const g = GROUP(r.pos);
        const p = of(pid);
        p.team = r.team;
        p.season = r.season;
        if (g) {
          p.group = g;
          if (g === 'QB') p.att = p.att === null ? touches(r, g) : p.att + (touches(r, g) - p.att) * RATE;
          else p.work = p.work === null ? touches(r, g) : p.work + (touches(r, g) - p.work) * RATE;
        }
        if (most > 0 && r.s.snaps > 0) {
          p.shares.set(r.season, [...(p.shares.get(r.season) ?? []), Math.min(1, r.s.snaps / most)]);
          p.snaps.set(r.season, (p.snaps.get(r.season) ?? 0) + r.s.snaps);
        }
        if (!seen.has(r.team)) seen.set(r.team, new Set());
        seen.get(r.team).add(pid);
      }
    }
    i = j;
  }
  return out;
}

// (a seeded generator: the bootstrap's draws the same every run)
export function rng(seed = 2026) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A bucket's numbers from its items ({ v, mu, ll, llScaled?, cluster }): its count, totals, bias, log loss a
// game, how often over the projection, and the 95% intervals on the bias and the log loss from BOOT draws of its
// clusters (team-weeks) whole
export function summarize(items, { boot = BOOT, seed = 2026 } = {}) {
  const n = items.length;
  if (!n) return null;
  const by = new Map();
  for (const x of items) {
    const c = by.get(x.cluster) ?? { v: 0, mu: 0, ll: 0, n: 0 };
    c.v += x.v;
    c.mu += x.mu;
    c.ll += x.ll;
    c.n++;
    by.set(x.cluster, c);
  }
  const cs = [...by.values()];
  const sum = (k) => items.reduce((t, x) => t + x[k], 0);
  const v = sum('v');
  const mu = sum('mu');
  const ll = sum('ll');
  const rand = rng(seed);
  const biases = [];
  const lls = [];
  for (let b = 0; b < boot; b++) {
    let sv = 0;
    let sm = 0;
    let sl = 0;
    let sn = 0;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[Math.floor(rand() * cs.length)];
      sv += c.v;
      sm += c.mu;
      sl += c.ll;
      sn += c.n;
    }
    biases.push(sm ? sv / sm - 1 : 0);
    lls.push(sn ? sl / sn : 0);
  }
  const ci = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return [s[Math.floor(0.025 * (s.length - 1))], s[Math.ceil(0.975 * (s.length - 1))]];
  };
  const scaled = items.every((x) => Number.isFinite(x.llScaled)) ? sum('llScaled') : null;
  return {
    n,
    clusters: cs.length,
    actual: v / n,
    proj: mu / n,
    bias: mu ? v / mu - 1 : null,
    biasCi: ci(biases),
    ll: ll / n,
    llCi: ci(lls),
    gainScaled: scaled === null ? null : (ll - scaled) / n,
    over: items.filter((x) => x.v > x.mu).length / n,
  };
}

// (a row's negative-binomial log loss at a projection, the stat's dispersion there)
export const nbLoss = (v, mu, params) => -nbLog(v, mu, rAt(params, mu));

// ---------------------------------------------------------------------------
// The run (offline as far as the caches go: the sources as run.mjs reads them, nothing committed written)
// ---------------------------------------------------------------------------

// (an nflverse file from the shared cache, .csv.gz or .csv, asked for only when neither is kept)
async function nflverseFile(release, base, columns) {
  for (const file of [`${base}.csv.gz`, `${base}.csv`]) {
    const rows = await nflverseRows(release, file, columns, 1e9).catch(() => null);
    if (rows?.length) return rows;
  }
  return [];
}

// (the reports and rosters, by season, week and team code: out (pid -> 'report' | 'reserve') and the roster)
async function reportsOf(seasons, espnOfGsis) {
  const out = new Map();
  const rosters = new Map();
  const put = (season, week, code, pid, kind) => {
    const key = `${season}|${Number(week)}|${code}`;
    if (!out.has(key)) out.set(key, new Map());
    const m = out.get(key);
    if (m.get(pid) !== 'report') m.set(pid, kind);
  };
  for (const season of seasons) {
    const inj = await nflverseFile('injuries', `injuries_${season}`, ['team', 'week', 'gsis_id', 'report_status']);
    for (const x of inj) {
      const pid = espnOfGsis.get(x.gsis_id);
      if (pid && (x.report_status === 'Out' || x.report_status === 'Doubtful')) put(season, x.week, x.team, pid, 'report');
    }
    const ros = await nflverseFile('weekly_rosters', `roster_weekly_${season}`, ['team', 'week', 'status', 'gsis_id', 'espn_id']);
    for (const x of ros) {
      const pid = x.espn_id && x.espn_id !== 'NA' ? String(Number(x.espn_id)) : espnOfGsis.get(x.gsis_id);
      if (!pid) continue;
      const key = `${season}|${Number(x.week)}|${x.team}`;
      // (the team that week: its active, inactive and reserve players; one cut, retired or traded isn't)
      if (!['ACT', 'INA', 'RES'].includes(x.status)) continue;
      if (!rosters.has(key)) rosters.set(key, new Set());
      rosters.get(key).add(pid);
      if (x.status === 'RES') put(season, x.week, x.team, pid, 'reserve');
    }
    console.log(`role backtest: ${season}: ${inj.length} report rows, ${ros.length} roster rows`);
  }
  return { out, rosters };
}

// (the stats' settings from the committed state, an Infinity saved as null)
function stateParams() {
  const state = readJson(path.join(ROOT, 'apps/nfl/src/StaticData/model/state.json'), {});
  return Object.fromEntries((state.props?.types ?? []).map((t) => [t.key, { ...t.params, roleK: t.params.roleK ?? Infinity }]));
}

const pct = (x, d = 1) => (x === null || x === undefined ? '' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`);
const num = (x, d = 3) => (x === null || x === undefined ? '' : x.toFixed(d));

async function main() {
  const t0 = Date.now();
  // (--report: the tables written again from the last run's numbers, nothing fit)
  if (process.argv.includes('--report')) {
    const last = readJson(path.join(ROOT, '.cache/role-backtest.json'), null);
    if (!last?.results) throw new Error('no .cache/role-backtest.json to report from: run without --report first');
    writeFileSync(path.join(ROOT, '.cache/role-backtest.md'), report(last.results, { from: last.from, useState: last.settings === 'state.json', at: last.at }));
    console.log('role backtest: .cache/role-backtest.md written again from .cache/role-backtest.json');
    return;
  }
  const useState = process.argv.includes('--state');
  const fromAt = process.argv.indexOf('--from');
  const FROM = fromAt > 0 ? Number(process.argv[fromAt + 1]) : 2021;
  const sport = 'nfl';
  const cfg = LEAGUES[sport];
  // (the history and the ratings, as run.mjs fits them)
  const history = readJson(path.join(ROOT, 'apps/nfl/scripts/model/games.json'), []).filter((g) => g.type === 2 || g.type === 3);
  const saved = readJson(path.join(ROOT, 'apps/nfl/src/StaticData/model/state.json'), {});
  const before = saved.params ?? cfg.priors;
  const best = fit(history, { ...cfg.priors, sigma: before.sigma ?? cfg.priors.sigma, sigmaT: before.sigmaT ?? cfg.priors.sigmaT }, cfg.grid);
  const params = best?.params ?? before;
  const facts = readJson(path.join(CACHE, 'context-nfl.json'), {});
  const live = await gather(sport, cfg, history, [], facts, () => true, {});
  const feats = featurize(sport, cfg, history, facts, live);
  const ctxFit = fitContext(history, params, feats.feats, feats.terms);
  if (ctxFit) Object.assign(params, { sigma: round(ctxFit.after.sigma, 3), sigmaT: round(ctxFit.after.sigmaT, 3) });
  const expPts = new Map();
  replay(history, params, 0, ctxFit?.ctx ?? null, (g, e) => expPts.set(g.id, [e.homePts, e.awayPts]));
  const info = new Map([...feats.feats].map(([id, f]) => [id, f.info]));
  console.log(`role backtest: ratings and context in ${Math.round((Date.now() - t0) / 1000)}s`);
  // (the player rows, and each stat's settings: fit as fitProps fits them, or the committed state's)
  const rows = await playerRows(sport, cfg, history, facts);
  let fitted;
  if (useState) {
    nflMatchups(rows, facts.plays);
    const sp = stateParams();
    fitted = Object.fromEntries(STATS.nfl.filter((st) => sp[st.key]).map((st) => [st.key, { stat: st, params: sp[st.key] }]));
  } else fitted = fitProps(sport, rows, expPts, info, facts);
  console.log(`role backtest: ${rows.length} player rows, settings ${useState ? 'from state.json' : 'fit'} in ${Math.round((Date.now() - t0) / 1000)}s`);
  // (the buckets, from before each game)
  const weekOf = (game) => {
    const x = facts.nfl?.get(game);
    return x ? { season: Number(x.season), week: Number(x.week) } : null;
  };
  const games = new Map(history.map((g) => [g.id, g]));
  const codeOf = new Map();
  for (const x of facts.nfl?.values() ?? []) {
    const g = games.get(x.espn);
    if (!g) continue;
    codeOf.set(`${x.season}|${g.home}`, x.home_team);
    codeOf.set(`${x.season}|${g.away}`, x.away_team);
  }
  const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'espn_id'], 1e9);
  const espnOfGsis = new Map((players ?? []).filter((p) => p.espn_id && p.espn_id !== 'NA').map((p) => [p.gsis_id, String(Number(p.espn_id))]));
  const seasons = [...new Set(rows.map((r) => r.season))].filter((s) => s >= FROM - 2).sort();
  const { out: reports, rosters } = await reportsOf(seasons, espnOfGsis);
  const situations = preGame(
    rows.filter((r) => r.season >= FROM - 2),
    {
      weekOf,
      outOf: (season, week, team) => reports.get(`${season}|${week}|${codeOf.get(`${season}|${team}`)}`) ?? new Map(),
      rosterOf: (season, week, team) => rosters.get(`${season}|${week}|${codeOf.get(`${season}|${team}`)}`) ?? null,
    },
  );
  // (each stat's rows replayed with its settings, every row projected; its fit window's dates kept)
  const results = {};
  for (const st of STATS.nfl) {
    const f = fitted[st.key];
    if (!f) continue;
    const mine = markEligible(sport, st, rows.filter((r) => r.team && r.opp && st.played(r)).map((r) => ({ ...r })));
    const sorted = [...mine].sort((a, b) => a.date.localeCompare(b.date));
    const at = (q) => sorted[Math.floor(sorted.length * q)].date.slice(0, 10);
    const cuts = [at(0.3), at(0.7)];
    const env = envFor(sport, st, expPts, info, mine);
    const { out } = replayStat(st, sorted, f.params, env, ['0000', '0000']);
    const items = [];
    for (const x of out) {
      if (x.row.eligible === false || x.row.season < FROM) continue;
      const s = situations.get(`${x.row.game}|${x.row.pid}`);
      if (!s) continue;
      items.push({ ...s, v: x.v, mu: x.p.mu, ll: nbLoss(x.v, x.p.mu, f.params), cluster: `${x.row.team}|${s.season}|${s.week}`, held: x.row.date.slice(0, 10) >= cuts[1], date: x.row.date });
    }
    const block = { cuts, params: f.params, buckets: {}, periods: {} };
    const add = (list) => {
      // (the log loss with the bucket's projections scaled by its own bias: in sample)
      const s = list.reduce((t, x) => t + x.v, 0) / Math.max(1e-9, list.reduce((t, x) => t + x.mu, 0));
      return summarize(list.map((x) => ({ ...x, llScaled: nbLoss(x.v, Math.max(0.05, x.mu * s), f.params) })));
    };
    for (const b of BUCKETS) block.buckets[b] = add(items.filter((x) => x.bucket === b));
    block.buckets.all = add(items);
    const PERIODS = { [`${FROM}-${Math.max(FROM, 2022)}`]: (x) => x.season <= 2022, '2023-2025': (x) => x.season >= 2023 && x.season <= 2025, '2026 so far': (x) => x.season >= 2026, 'held out': (x) => x.held };
    for (const [name, keep] of Object.entries(PERIODS)) {
      block.periods[name] = {};
      for (const b of [...BUCKETS, 'all']) {
        const list = items.filter((x) => keep(x) && (b === 'all' || x.bucket === b));
        block.periods[name][b] = list.length ? summarize(list, { boot: 300 }) : null;
      }
    }
    results[st.key] = block;
    console.log(`role backtest: ${st.key}: ${items.length} eligible rows from ${FROM} (fit window ${cuts[0]} to ${cuts[1]})`);
  }
  writeFileSync(path.join(ROOT, '.cache/role-backtest.json'), JSON.stringify({ at: new Date().toISOString(), from: FROM, settings: useState ? 'state.json' : 'fit', results }, null, 1));
  writeFileSync(path.join(ROOT, '.cache/role-backtest.md'), report(results, { from: FROM, useState }));
  console.log(`role backtest: written .cache/role-backtest.md in ${Math.round((Date.now() - t0) / 1000)}s`);
}

// The report: the headlines (each bucket's bias whose interval leaves out 0, per stat), then each stat's table
// and its bias by period
export function report(results, { from = 2021, useState = false, at = null } = {}) {
  const lines = [];
  lines.push('# Role backtest: the NFL props\' projections against what happened, by situation');
  lines.push('');
  lines.push(`Generated ${(at ?? new Date().toISOString()).slice(0, 10)} by \`node libs/ranker/scripts/model/role-backtest.mjs${useState ? ' --state' : ''}\` (measurement only; the bettor unchanged). Eligible players' games from ${from}; settings ${useState ? "from the committed state.json" : 'fit as fitProps fits them'}. Bias = sum actual / sum projected - 1 (under 0: the model ran high). LL = the negative binomial's log loss a game at the stat's dispersion (only comparable within a stat). 95% intervals: bootstrap clustered by team-week. "LL saved" = log loss saved a game were the bucket's projections scaled by its own bias (in sample, a rough ceiling on a bucket term; under 0 where the dispersion grows with the projection). "Held out" = the games after the fit window, the settings (the scale among them) never fit on them. Buckets from pre-game information only (nflverse injury reports and weekly rosters, prior work and snaps), each row in the first that fits.`);
  lines.push('');
  lines.push('## Headlines (bias intervals that leave out 0, buckets of 100 games or more)');
  lines.push('');
  for (const [key, block] of Object.entries(results)) {
    const hits = [...BUCKETS]
      .map((b) => [b, block.buckets[b]])
      .filter(([, s]) => s && s.n >= 100 && (s.biasCi[0] > 0 || s.biasCi[1] < 0))
      .map(([b, s]) => `${b} ${pct(s.bias)} [${pct(s.biasCi[0])}, ${pct(s.biasCi[1])}] (n ${s.n})`);
    const all = block.buckets.all;
    lines.push(`- **${key}** (all ${pct(all?.bias)}, n ${all?.n ?? 0}): ${hits.length ? hits.join('; ') : 'none'}`);
  }
  // (the same on the held-out games alone: the settings, the scale among them, never fit on them)
  lines.push('');
  lines.push('## Held out only (after the fit window: bias intervals that leave out 0, buckets of 50 games or more)');
  lines.push('');
  for (const [key, block] of Object.entries(results)) {
    const held = block.periods?.['held out'] ?? {};
    const hits = [...BUCKETS]
      .map((b) => [b, held[b]])
      .filter(([, s]) => s && s.n >= 50 && (s.biasCi[0] > 0 || s.biasCi[1] < 0))
      .map(([b, s]) => `${b} ${pct(s.bias)} [${pct(s.biasCi[0])}, ${pct(s.biasCi[1])}] (n ${s.n})`);
    lines.push(`- **${key}** (all ${pct(held.all?.bias)}, n ${held.all?.n ?? 0}): ${hits.length ? hits.join('; ') : 'none'}`);
  }
  for (const [key, block] of Object.entries(results)) {
    lines.push('');
    lines.push(`## ${key}`);
    lines.push('');
    lines.push(`Fit window ${block.cuts[0]} to ${block.cuts[1]}; held out after. Settings: ${Object.entries(block.params).filter(([k]) => !['cal'].includes(k)).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    lines.push('');
    lines.push('| bucket | n | team-weeks | actual/g | proj/g | bias [95% CI] | LL [95% CI] | LL saved | over proj |');
    lines.push('|---|---:|---:|---:|---:|---|---|---:|---:|');
    for (const b of [...BUCKETS, 'all']) {
      const s = block.buckets[b];
      if (!s) {
        lines.push(`| ${b} | 0 | | | | | | | |`);
        continue;
      }
      lines.push(`| ${b === 'all' ? '**all**' : b} | ${s.n} | ${s.clusters} | ${num(s.actual, 2)} | ${num(s.proj, 2)} | ${pct(s.bias)} [${pct(s.biasCi[0])}, ${pct(s.biasCi[1])}] | ${num(s.ll)} [${num(s.llCi[0])}, ${num(s.llCi[1])}] | ${num(s.gainScaled, 4)} | ${pct(s.over, 0).replace('+', '')} |`);
    }
    lines.push('');
    const names = Object.keys(block.periods);
    lines.push(`| bias by period | ${names.join(' | ')} |`);
    lines.push(`|---|${names.map(() => '---').join('|')}|`);
    for (const b of [...BUCKETS, 'all']) {
      lines.push(`| ${b} | ${names.map((p) => {
        const s = block.periods[p][b];
        return s ? `${pct(s.bias)} [${pct(s.biasCi[0], 0)}, ${pct(s.biasCi[1], 0)}] n ${s.n}` : '';
      }).join(' | ')} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// (only when run as the script itself: imported (a test), it reads and fits nothing)
if (process.argv[1] && path.relative(process.argv[1], fileURLToPath(import.meta.url)) === '') {
  main().catch((err) => {
    console.error(err.stack ?? err);
    process.exitCode = 1;
  });
}
