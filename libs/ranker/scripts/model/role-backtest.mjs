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
//                    fit window); the rest after it is held out (the report says which seasons each is) from the
//                    continuous settings' fit alone (K, w, a, b, the scale, the dispersion): fitStat chose which
//                    optional and context terms stay, and rk, on those same games, and the ratings and the game
//                    context were fit on every game, so the held-out numbers are mildly optimistic
//   the buckets      from what was known before each game only: nflverse's weekly injury reports (Out,
//                    Doubtful) and weekly rosters (reserve: IR, PUP, NFI, suspended; a reserve listing for a
//                    player who played the game is the roster's move after it, not counted), each player's work
//                    and snap shares in the games before. (The game itself says only who took the field: the rows
//                    are the ones who did, as the props fit's are, and a reserve listing beside a player in it is
//                    read as made after. A report's Doubtful counts as out though some then play: it's what was
//                    known before; the report counts the QB1-out games whose QB1 played anyway.) A game with no
//                    week (missing from the nflverse schedule) has no reports to read: its rows are counted and
//                    left out (bucket 'no-week'). A season with no injury report rows read is warned of and its
//                    period marked roster only. Each row in the first that fits, in this order:
//                      backup-qb   his team's QB1 (its quarterback with the most passes a game, recent games
//                                  counting most, a starter's 15 or more) out, and he's the quarterback next in
//                                  line (the most passes this season and last of the ones not out, then snaps: a
//                                  gadget quarterback's snaps don't make him the backup). The report counts the
//                                  QB1-out games whose eligible passer (the props' own: some prior passes, so a
//                                  debut starter isn't one) is the backup, another, or none
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
//   the fit's check  each stat's held-out check from the fit (fitProps: the eligible players' log loss at lines
//                    at their median and bias, every player's bias, the terms' gains), beside the buckets
//   before, after    --plain fits the model without the role-aware base (project.mjs: the snaps-based rate, a
//                    starting quarterback's starts, the prior's weight shrinking through the season), as it was
//                    before it; --compare <an earlier run's .json> adds a table of each bucket's bias and log
//                    loss then and now, all games and the held-out ones
//
//   node libs/ranker/scripts/model/role-backtest.mjs [--state] [--plain] [--from 2021] [--compare <earlier .json>]
//                    [--report: the .md again from the .json]
//   writes .cache/role-backtest.md (the tables) and .cache/role-backtest.json (the same numbers)

import { readFileSync, writeFileSync } from 'node:fs';
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
// team is the one he last played for). The map's qbOut: each team-game with its QB1 out ({ game, team, qb1,
// season, kind: his listing, played: whether he played anyway, next: the backup named })
export function preGame(rows, { weekOf, outOf, rosterOf = () => null }) {
  const sorted = [...rows].filter((r) => r.team && r.game).sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map();
  out.qbOut = [];
  // (each player: his last team and season, his work a game in his group, his passes a game (a quarterback's,
  // not faded while he's out), his snap shares by season, his snaps and passes by season)
  const pl = new Map();
  const of = (pid) => {
    let p = pl.get(pid);
    if (!p) pl.set(pid, (p = { team: null, season: null, group: null, work: null, att: null, shares: new Map(), snaps: new Map(), passes: new Map() }));
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
      const twoSeasons = (s) => (s.get(season) ?? 0) + (s.get(season - 1) ?? 0);
      const nextQb = qb1Out
        ? (qbs.filter((pid) => pid !== qb1 && !isOut(pid)).sort((a, b) => twoSeasons(pl.get(b).passes) - twoSeasons(pl.get(a).passes) || twoSeasons(pl.get(b).snaps) - twoSeasons(pl.get(a).snaps))[0] ?? null)
        : null;
      if (qb1Out) out.qbOut.push({ game, team, season, qb1, kind: listed.get(String(qb1)), played: playing.has(String(qb1)), next: nextQb });
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
          // (his team's QB1 listed out but in the game anyway: a Doubtful who played)
          qb1Played: qb1Out && playing.has(String(qb1)),
          nextUp: !!g && g !== 'QB' && groups[g]?.gone > 0 && groups[g].next === pid,
          groupOut: !!g && g !== 'QB' && groups[g]?.gone > 0 && groups[g].regs.has(pid),
          snapJump: shares.length >= 2 && shares[shares.length - 1] > avg(shares) + JUMP,
          roleGrew: shares.length >= 1 && last.length >= 4 && avg(shares) > avg(last) + JUMP,
          starter: last.length >= STARTER.games && avg(last) >= STARTER.share,
        };
        // (no week: no reports read, so no bucket can be told: 'no-week', left out of the tables)
        const bucket =
          !week ? 'no-week'
          : flags.backupQb ? 'backup-qb'
          : flags.qb1Out ? 'qb1-out'
          : flags.nextUp ? 'next-up'
          : flags.groupOut ? 'group-out'
          : flags.snapJump ? 'snap-jump'
          : flags.roleGrew ? 'role-grew'
          : flags.starter ? (week <= 4 ? 'starter-w1-4' : week <= 8 ? 'starter-w5-8' : 'starter-w9+')
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
          if (g === 'QB') {
            p.att = p.att === null ? touches(r, g) : p.att + (touches(r, g) - p.att) * RATE;
            p.passes.set(r.season, (p.passes.get(r.season) ?? 0) + touches(r, g));
          }
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

// The QB1-out team-games' coverage (from FROM): how many, how many with the QB1 in the game anyway (a Doubtful
// who played), and whose is the eligible passer's row (items: a passing stat's, { game, team, pid, bucket }): the
// backup named, QB1 himself, another quarterback (bucketed elsewhere), or none eligible (a debut starter: no
// prior passes, so not the props' passer)
export function qbCoverage(qbOut, items, from = 0) {
  const by = new Map();
  for (const x of items) {
    const k = `${x.game}|${x.team}`;
    by.set(k, [...(by.get(k) ?? []), x]);
  }
  const c = { games: 0, qb1Played: 0, backup: 0, qb1: 0, another: 0, none: 0 };
  for (const q of qbOut) {
    if (q.season < from) continue;
    c.games++;
    if (q.played) c.qb1Played++;
    const mine = by.get(`${q.game}|${q.team}`) ?? [];
    if (mine.some((x) => x.bucket === 'backup-qb')) c.backup++;
    else if (mine.some((x) => x.pid === String(q.qb1))) c.qb1++;
    else if (mine.length) c.another++;
    else c.none++;
  }
  return c;
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
  // (the seasons with no injury report read: their outs from the rosters' reserve alone)
  const rosterOnly = [];
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
    if (!inj.length) {
      rosterOnly.push(season);
      console.warn(`role backtest: WARNING ${season}: no injury report rows read: its outs from the rosters' reserve alone (its period marked roster only)`);
    }
    if (!ros.length) console.warn(`role backtest: WARNING ${season}: no weekly roster rows read`);
  }
  return { out, rosters, rosterOnly };
}

// (the stats' settings from the committed state, an Infinity saved as null)
function stateParams() {
  const state = readJson(path.join(ROOT, 'apps/nfl/src/StaticData/model/state.json'), {});
  return Object.fromEntries((state.props?.types ?? []).map((t) => [t.key, { ...t.params, roleK: t.params.roleK ?? Infinity }]));
}

const pct = (x, d = 1) => (x === null || x === undefined ? '' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`);
const num = (x, d = 3) => (x === null || x === undefined ? '' : x.toFixed(d));

// (--compare <path>: an earlier run's results, for the before and after; null without it)
function compareOf() {
  const at = process.argv.indexOf('--compare');
  if (at < 0) return null;
  const file = process.argv[at + 1];
  if (!file) throw new Error("--compare wants an earlier run's .json");
  const last = JSON.parse(readFileSync(file, 'utf8'));
  if (!last?.results) throw new Error(`${file} has no results to compare with`);
  return last.results;
}

async function main() {
  const t0 = Date.now();
  // (--report: the tables written again from the last run's numbers, nothing fit)
  if (process.argv.includes('--report')) {
    const last = readJson(path.join(ROOT, '.cache/role-backtest.json'), null);
    if (!last?.results) throw new Error('no .cache/role-backtest.json to report from: run without --report first');
    writeFileSync(path.join(ROOT, '.cache/role-backtest.md'), report(last.results, { from: last.from, useState: last.settings === 'state.json', plain: !!last.plain, at: last.at, coverage: last.coverage, rosterOnly: last.rosterOnly, before: compareOf() }));
    console.log('role backtest: .cache/role-backtest.md written again from .cache/role-backtest.json');
    return;
  }
  const useState = process.argv.includes('--state');
  // (--plain: the model as it was before the role-aware base, its stats' flags for it taken off)
  const plain = process.argv.includes('--plain');
  if (plain) for (const st of STATS.nfl) delete st.snaps, delete st.starts, delete st.early;
  const earlier = compareOf();
  const fromAt = process.argv.indexOf('--from');
  const FROM = fromAt > 0 ? Number(process.argv[fromAt + 1]) : 2021;
  // (a bad --from fails before minutes of fitting, never a report of empty buckets over the last good one)
  if (!Number.isInteger(FROM) || FROM < 2000 || FROM > 2100) throw new Error(`--from wants a season's year (e.g. 2021), not ${process.argv[fromAt + 1]}`);
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
  const { out: reports, rosters, rosterOnly } = await reportsOf(seasons, espnOfGsis);
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
  let coverage = null;
  const tag = (name, seasons) => (seasons.some((s) => rosterOnly.includes(s)) ? `${name} (roster only)` : name);
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
    let noWeek = 0;
    for (const x of out) {
      if (x.row.eligible === false || x.row.season < FROM) continue;
      const s = situations.get(`${x.row.game}|${x.row.pid}`);
      if (!s) continue;
      // (a game with no week: counted, left out)
      if (s.bucket === 'no-week') {
        noWeek++;
        continue;
      }
      items.push({ ...s, game: x.row.game, pid: String(x.row.pid), v: x.v, mu: x.p.mu, ll: nbLoss(x.v, x.p.mu, f.params), cluster: `${x.row.team}|${s.season}|${s.week}`, held: x.row.date.slice(0, 10) >= cuts[1], date: x.row.date });
    }
    if (noWeek) console.warn(`role backtest: WARNING ${st.key}: ${noWeek} eligible rows in games with no week left out`);
    if (st.key === 'passAtt') coverage = qbCoverage(situations.qbOut, items, FROM);
    // (the fit's own held-out check, where it was fit here)
    const fitCheck = f.check ? { n: f.check.n, logLoss: f.check.logLoss, logLossBase: f.check.logLossBase, bias: f.check.bias, allBias: f.checkAll?.bias ?? null, gains: f.gains } : null;
    const block = { cuts, params: f.params, noWeek, fit: fitCheck, buckets: {}, periods: {} };
    const add = (list) => {
      // (the log loss with the bucket's projections scaled by its own bias: in sample)
      const s = list.reduce((t, x) => t + x.v, 0) / Math.max(1e-9, list.reduce((t, x) => t + x.mu, 0));
      return summarize(list.map((x) => ({ ...x, llScaled: nbLoss(x.v, Math.max(0.05, x.mu * s), f.params) })));
    };
    for (const b of BUCKETS) block.buckets[b] = add(items.filter((x) => x.bucket === b));
    block.buckets.all = add(items);
    const PERIODS = {
      [tag(`${FROM}-${Math.max(FROM, 2022)}`, seasons.filter((s) => s >= FROM && s <= 2022))]: (x) => x.season <= 2022,
      [tag('2023-2025', [2023, 2024, 2025])]: (x) => x.season >= 2023 && x.season <= 2025,
      [tag('2026 so far', seasons.filter((s) => s >= 2026))]: (x) => x.season >= 2026,
      'held out': (x) => x.held,
    };
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
  writeFileSync(path.join(ROOT, '.cache/role-backtest.json'), JSON.stringify({ at: new Date().toISOString(), from: FROM, settings: useState ? 'state.json' : 'fit', plain, coverage, rosterOnly, results }, null, 1));
  writeFileSync(path.join(ROOT, '.cache/role-backtest.md'), report(results, { from: FROM, useState, plain, coverage, rosterOnly, before: earlier }));
  console.log(`role backtest: written .cache/role-backtest.md in ${Math.round((Date.now() - t0) / 1000)}s`);
}

// The report: the headlines (each bucket's bias whose interval leaves out 0, per stat), then each stat's table
// and its bias by period
export function report(results, { from = 2021, useState = false, plain = false, at = null, coverage = null, rosterOnly = [], before = null } = {}) {
  const lines = [];
  lines.push('# Role backtest: the NFL props\' projections against what happened, by situation');
  lines.push('');
  lines.push(`Generated ${(at ?? new Date().toISOString()).slice(0, 10)} by \`node libs/ranker/scripts/model/role-backtest.mjs${useState ? ' --state' : ''}${plain ? ' --plain' : ''}\` (measurement only; the bettor unchanged). Eligible players' games from ${from}; settings ${useState ? "from the committed state.json" : 'fit as fitProps fits them'}${plain ? ', the role-aware base left out (the model as before it)' : ''}. Bias = sum actual / sum projected - 1 (under 0: the model ran high). LL = the negative binomial's log loss a game at the stat's dispersion (only comparable within a stat). 95% intervals: bootstrap clustered by team-week. "LL saved" = log loss saved a game were the bucket's projections scaled by its own bias (in sample, a rough ceiling on a bucket term; under 0 where the dispersion grows with the projection). "Held out" = the games after the fit window: held out from the continuous settings' fit (K, w, a, b, the scale, the dispersion), but fitStat chose which optional and context terms stay, and rk, on these same games, and the ratings and game context were fit on every game, so the held-out numbers are mildly optimistic. Buckets from pre-game information only (nflverse injury reports, Doubtful counted as out, and weekly rosters, prior work and snaps), each row in the first that fits; eligible players only, so a debut starter at quarterback (no prior passes) is in no passing row.${rosterOnly?.length ? ` Seasons with no injury report read (outs from the rosters' reserve alone, the period marked roster only): ${rosterOnly.join(", ")}.` : ""}`);
  lines.push('');
  // (the QB1-out games' coverage: whose the passing row is)
  if (coverage) {
    const c = coverage;
    lines.push(`QB1-out team-games from ${from}: ${c.games}; the QB1 in the game anyway (a Doubtful who played) ${c.qb1Played}. The eligible passer's row: the backup named (backup-qb) ${c.backup}, the QB1 himself ${c.qb1}, another quarterback (bucketed elsewhere) ${c.another}, none eligible (e.g. a debut starter) ${c.none}.`);
    lines.push('');
  }
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
  // (the same on the held-out games alone: the continuous settings never fit on them, the terms chosen on them)
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
  // (each stat's fit's own held-out check: the eligible players' log loss at their median lines and bias (the
  // projection less the actual a game), every player's bias, and the role-aware terms' gains)
  if (Object.values(results).some((b) => b.fit)) {
    lines.push('');
    lines.push("## The fit's held-out check (fitProps: the eligible players' log loss at lines at their median, its plain base's, the bias a game (projected less actual), every player's bias a game)");
    lines.push('');
    lines.push(`| stat | n | log loss | base's |${before ? ' log loss then | bias then | all-player bias then |' : ''} bias | all-player bias | role-aware terms (held-out gain) |`);
    lines.push(`|---|---:|---:|---:|${before ? '---:|---:|---:|' : ''}---:|---:|---|`);
    for (const [key, block] of Object.entries(results)) {
      const f = block.fit;
      if (!f) continue;
      const b = before?.[key]?.fit;
      const terms = ['sn', 'qs', 'kd'].filter((k) => k in (f.gains ?? {})).map((k) => `${k} ${block.params[k]}${k === 'sn' && block.params.sn ? `/sr ${block.params.sr}` : ''} (${f.gains[k] === null ? 'not taken' : f.gains[k] > 0 ? `+${f.gains[k]}` : `${f.gains[k]}, left out`})`);
      lines.push(`| ${key} | ${f.n} | ${num(f.logLoss, 4)} | ${num(f.logLossBase, 4)} |${before ? ` ${num(b?.logLoss, 4)} | ${num(b?.bias, 3)} | ${num(b?.allBias, 3)} |` : ''} ${num(f.bias, 3)} | ${num(f.allBias, 3)} | ${terms.join(', ') || 'none'} |`);
    }
  }
  // (each bucket then (an earlier run's .json: --compare) and now: its bias and log loss, all games and held out)
  if (before) {
    lines.push('');
    lines.push('## Before and after (each bucket\'s bias and log loss a game, then and now: all games from the start season, and the held-out ones)');
    for (const [key, block] of Object.entries(results)) {
      const was = before[key];
      if (!was) continue;
      lines.push('');
      lines.push(`### ${key}`);
      lines.push('');
      lines.push('| bucket | n | bias then | bias now | LL then | LL now | held-out n | held-out bias then | now | held-out LL then | now |');
      lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
      for (const b of [...BUCKETS, 'all']) {
        const [t, n] = [was.buckets?.[b], block.buckets[b]];
        const [ht, hn] = [was.periods?.['held out']?.[b], block.periods?.['held out']?.[b]];
        if (!t && !n) continue;
        lines.push(`| ${b === 'all' ? '**all**' : b} | ${n?.n ?? 0} | ${pct(t?.bias)} | ${pct(n?.bias)} | ${num(t?.ll)} | ${num(n?.ll)} | ${hn?.n ?? 0} | ${pct(ht?.bias)} | ${pct(hn?.bias)} | ${num(ht?.ll)} | ${num(hn?.ll)} |`);
      }
    }
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
