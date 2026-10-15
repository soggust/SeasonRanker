// The anytime touchdown (DraftKings' "Anytime TD Scorer", The Odds API's player_anytime_td), NFL backs, receivers
// and tight ends: the chance he scores a rushing or receiving touchdown in the game. TRACKED ONLY: priced, logged and
// graded like the other tracked rows (desk.mjs TRACK, intent 'track'), never staked, whatever its edge (run.mjs
// anytimeRows). Its own model, not the props' projection (project.mjs), since it's a chance of 1 or more, not a line:
//
//   looks      his red-zone work a game (football.mjs redZoneOf, from the play-by-play's field position), in six
//              kinds that don't overlap (targets and carries snapped inside the 5, from the 6 to the 10, from the
//              11 to the 20) and his end-zone targets, each his recent games' (each game back counts D times the
//              one after it; a new season's first game his last season's at half), pulled toward his position's
//              running average by K games' worth
//   per look   the league's touchdowns a look of each kind (rho), fit on the fit window's player-games by Poisson
//              regression of each game's red-zone touchdowns on its own looks (their counts that game, not a
//              projection: what a look is worth), so his looks a game times them is the touchdowns his work makes
//   finishing  his own red-zone touchdowns over what his looks made at the league's rates, recent games most,
//              pulled toward 1 by F touchdowns' worth (a goal-line back who scores on his looks, a receiver who
//              doesn't)
//   long       his touchdowns from outside the 20 a game, pulled toward his position's by L games' worth
//   script     the game's betting total and spread as his team's implied points (props.mjs marketPts, the history's
//              closing lines; else the game model's own expectation) over his team's usual (its recent games'
//              implied points, each game back 0.9 times the one after it), to the power beta: a team expected to
//              score more than it usually does makes more trips
//   chance     lambda = script x (looks x per look x finishing + long); P = 1 - e^-lambda (a Poisson's chance of 1
//              or more), then recalibrated (a + b logit P, fit on the fit window)
//
// Fit (fitAnytime) on the history's rows by date: rho on the first 70%'s games, then D, K, F, L, beta one at a
// time (twice round) for the fit window's log loss on the eligible rows (a back, receiver or tight end with
// ANY_MIN_GAMES of his games before it, this season and last; from the history's second season), then a and b;
// checked on the last 30%, held out, against the plain model (his touchdowns a game, recent games most, pulled to
// his position's, the same script and recalibration: no red zone), each one's log loss, the base rate's, and the
// held-out calibration by band. The red zone's model prices the tracked rows only where it beats the plain one
// held out (kind 'rz'); else the plain one does (kind 'plain'), the check saying so. No look-ahead: every row's
// chance is made from the games before its day, its own day's learned after it (as matchups.mjs), and the live
// chance from every final.
//
// The fit's params (rho, D, K, F, L, beta, a, b, kind) are kept with the props' fits (fitcache.mjs: fits.anyTd)
// and the runs between rebuild the model from them on the history as it is now (makeAnytime: seconds).

import { calSides } from './calib.mjs';
import { TRACK, chanceAt, decimal, fairPair } from './desk.mjs';

export const ANY_KEY = 'anyTd';
export const ANY_LABEL = 'Anytime TD';
export const ANY_LINE = 0.5;
// (the looks' kinds, in RZ order: football.mjs RZ_FIELDS read into them, end-zone targets last)
export const KINDS = ['t5', 't10', 't20', 'c5', 'c10', 'c20', 'ez'];
export const ANY_POS = ['RB', 'WR', 'TE'];
export const ANY_MIN_GAMES = 3;
const GRID = { D: [0.82, 0.88, 0.93, 0.97, 0.99], K: [0.5, 1, 2, 4, 8], F: [2, 4, 8, 16, 32], L: [1, 2, 4, 8, 16, 32], beta: [0, 0.5, 1, 1.5] };
const START = { D: 0.88, K: 2, F: 8, L: 16, beta: 1 };
const TEAM_D = 0.9;
const LG_PTS = 22;
const clip = (p) => Math.min(0.999, Math.max(0.001, p));
const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
const sig = (x) => 1 / (1 + Math.exp(-x));
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const posOf = (pos) => (pos === 'WR' ? 'WR' : pos === 'TE' ? 'TE' : pos === 'RB' || pos === 'FB' ? 'RB' : null);

// (a player-game's red-zone record (football.mjs RZ_FIELDS) as the looks' kinds: [t5, t10, t20, c5, c10, c20,
// ez], his red-zone touchdowns and his long ones; null without one, a game whose red zone wasn't read)
export function looksOf(x) {
  if (!Array.isArray(x)) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const [tgt20, car20, tgt10, car10, tgt5, car5, ez, rzTd, longTd] = x;
  return [tgt5, tgt10 - tgt5, tgt20 - tgt10, car5, car10 - car5, car20 - car10, ez, rzTd, longTd];
}

// The history's rows as the anytime model reads them, by day, in date order: each back's, receiver's or tight
// end's game (rows: playerlogs.mjs's; rz: the context's facts.rz by game; market: game to the closing lines'
// [home, away] implied points; expPts: game to the game model's) with his looks, touchdowns and his team's
// implied points. A game without its red zone read (rz null or missing) is kept with no looks (rz false): it
// teaches nothing, and is never scored
export function anytimeRows(rows, rz, market = null, expPts = null) {
  const out = [];
  for (const r of rows) {
    const pos = posOf(r.pos);
    if (!r.team || !r.game) continue;
    const g = rz?.[r.game];
    const pts = market?.get?.(r.game) ?? market?.get?.(String(r.game)) ?? expPts?.get?.(r.game) ?? null;
    const implied = Array.isArray(pts) && Number.isFinite(pts[r.home ? 0 : 1]) ? pts[r.home ? 0 : 1] : null;
    const td = (r.s?.rushTd ?? 0) + (r.s?.recTd ?? 0);
    out.push({ pid: String(r.pid), pos, team: String(r.team), game: String(r.game), date: r.date, day: r.date.slice(0, 10), season: r.season, implied, y: td >= 1 ? 1 : 0, rz: !!g, looks: g ? looksOf(g.p?.[String(r.pid)]) : null });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// The model's state through the days learned, at its params: project a row (or a coming game's player) before its
// day, learn a day's rows after it. kind 'rz' the red zone's model; 'plain' his touchdowns a game alone
export function makeAnytime(params) {
  const { rho, D, K, F, L, beta, a = 0, b = 1, kind = 'rz' } = params;
  const players = new Map();
  const teams = new Map();
  // (each position's running averages a game: its looks of each kind, its long touchdowns, its touchdowns)
  const pos = new Map(ANY_POS.map((p) => [p, { n: 0, looks: KINDS.map(() => 0), long: 0, td: 0 }]));
  const perLook = (looks) => KINDS.reduce((t, _, i) => t + rho[i] * looks[i], 0);
  const scriptOf = (team, implied) => {
    const t = teams.get(team);
    if (!Number.isFinite(implied) || !beta) return 1;
    const base = t && t.w > 0 ? t.sum / t.w : LG_PTS;
    return Math.pow(Math.max(0.3, implied / base), beta);
  };
  // (his state at a season: last season's at half on his first game of a new one)
  const stateOf = (pid, season) => {
    const p = players.get(pid);
    if (!p) return null;
    if (p.season === season) return p;
    const k = p.season === season - 1 ? 0.5 : 0;
    return { ...p, season, g: p.g * k, looks: p.looks.map((x) => x * k), td: p.td * k, rzTd: p.rzTd * k, exp: p.exp * k, long: p.long * k, cnt: 0, prev: p.season === season - 1 ? p.cnt : 0 };
  };
  const project = (x) => {
    const P = pos.get(x.pos);
    if (!P) return null;
    const p = stateOf(x.pid, x.season);
    const g = p?.g ?? 0;
    const s = scriptOf(x.team, x.implied);
    let lambda;
    const parts = {};
    if (kind === 'plain') {
      const lgTd = P.n ? P.td / P.n : 0.3;
      lambda = (s * ((p?.td ?? 0) + K * lgTd)) / (g + K);
      parts.td = r4(((p?.td ?? 0) + K * lgTd) / (g + K));
    } else {
      const looks = KINDS.map((_, i) => ((p?.looks[i] ?? 0) + K * (P.n ? P.looks[i] / P.n : 0)) / (g + K));
      const fin = ((p?.rzTd ?? 0) + F) / ((p?.exp ?? 0) + F);
      const lgLong = P.n ? P.long / P.n : 0.05;
      const long = ((p?.long ?? 0) + L * lgLong) / (g + L);
      const rzL = perLook(looks) * fin;
      lambda = s * (rzL + long);
      Object.assign(parts, { looks: looks.map(r4), rz: r4(rzL), fin: r4(fin), long: r4(long) });
    }
    const raw = 1 - Math.exp(-Math.max(0, lambda));
    const pAny = sig(a + b * logit(raw));
    return { p: pAny, raw, lambda: r4(lambda), script: r4(s), games: Math.round(g * 100) / 100, count: (p?.cnt ?? 0) + (p?.prev ?? 0), ...parts };
  };
  // (a day's rows learned, after every one of them is projected: his looks, touchdowns and long ones; his team's
  // implied points once a team-game; his position's averages)
  const learn = (day) => {
    const seenTeam = new Set();
    for (const x of day) {
      if (Number.isFinite(x.implied) && !seenTeam.has(`${x.game}|${x.team}`)) {
        seenTeam.add(`${x.game}|${x.team}`);
        const t = teams.get(x.team) ?? { sum: 0, w: 0 };
        teams.set(x.team, { sum: t.sum * TEAM_D + x.implied, w: t.w * TEAM_D + 1 });
      }
      if (!x.rz || !x.pos) continue;
      const lk = x.looks.slice(0, KINDS.length);
      const rzTd = x.looks[7];
      const long = x.looks[8];
      const p = stateOf(x.pid, x.season) ?? { season: x.season, g: 0, looks: KINDS.map(() => 0), td: 0, rzTd: 0, exp: 0, long: 0, cnt: 0, prev: 0 };
      players.set(x.pid, { season: x.season, g: p.g * D + 1, looks: p.looks.map((v, i) => v * D + lk[i]), td: p.td * D + x.y, rzTd: p.rzTd * D + rzTd, exp: p.exp * D + perLook(lk), long: p.long * D + long, cnt: p.cnt + 1, prev: p.prev });
      const P = pos.get(x.pos);
      P.n++;
      for (let i = 0; i < KINDS.length; i++) P.looks[i] += lk[i];
      P.long += long;
      P.td += x.y;
    }
  };
  return { project, learn, params };
}

// (the days of a list of rows, in order)
export function daysOf(list) {
  const out = [];
  for (const x of list) {
    if (!out.length || out.at(-1)[0].day !== x.day) out.push([]);
    out.at(-1).push(x);
  }
  return out;
}

// (a row the check scores: a back, receiver or tight end with his red zone read and ANY_MIN_GAMES of his games before
// it, this season and last, from the history's second season)
const scored = (x, pr, first) => x.pos && x.rz && x.season > first && pr && pr.count >= ANY_MIN_GAMES;

// Every row's chance at params, each made before its day: [{ x, pr }] for the scored ones
export function replayAnytime(days, params, first) {
  const m = makeAnytime(params);
  const out = [];
  for (const day of days) {
    for (const x of day) {
      if (!x.pos) continue;
      const pr = m.project(x);
      if (scored(x, pr, first)) out.push({ x, pr });
    }
    m.learn(day);
  }
  return out;
}

// (the log loss of chances against outcomes)
export const logLoss = (list, pOf) => list.reduce((t, o) => t - Math.log(clip(o.x.y ? pOf(o) : 1 - pOf(o))), 0) / Math.max(1, list.length);

// (the recalibration a + b logit P that fits a list's raw chances best: Newton's, from 0 and 1)
export function calibrate(list) {
  let a = 0;
  let b = 1;
  for (let it = 0; it < 25; it++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (const o of list) {
      const z = logit(o.pr.raw);
      const p = sig(a + b * z);
      const e = o.x.y - p;
      const w = p * (1 - p);
      g0 += e;
      g1 += e * z;
      h00 += w;
      h01 += w * z;
      h11 += w * z * z;
    }
    const det = h00 * h11 - h01 * h01;
    if (!(Math.abs(det) > 1e-12)) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a += da;
    b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  return { a: r4(a), b: r4(b) };
}

// (the touchdowns a look of each kind is worth: Poisson regression of each player-game's red-zone touchdowns on
// its own looks, multiplicative updates (each rate stays 0 or more), on the fit window's games)
export function fitRho(list, iters = 200) {
  const rows = list.filter((x) => x.rz && x.pos);
  let rho = [0.25, 0.15, 0.08, 0.35, 0.15, 0.06, 0.1];
  for (let it = 0; it < iters; it++) {
    const num = rho.map(() => 0);
    const den = rho.map(() => 0);
    for (const x of rows) {
      const n = x.looks;
      let mu = 0;
      for (let i = 0; i < rho.length; i++) mu += rho[i] * n[i];
      if (!(mu > 0)) continue;
      for (let i = 0; i < rho.length; i++) {
        if (!n[i]) continue;
        num[i] += (n[i] * n[7]) / mu;
        den[i] += n[i];
      }
    }
    rho = rho.map((v, i) => (den[i] > 0 ? v * (num[i] / den[i]) : v));
  }
  return rho.map(r4);
}

// The calibration's bands: by the chance said (each 0.1 wide), how many, the mean said and how often he scored
export function bandsOf(list, pOf) {
  const out = new Map();
  for (const o of list) {
    const p = pOf(o);
    const band = Math.min(0.9, Math.floor(p * 10) / 10);
    const c = out.get(band) ?? { band, n: 0, said: 0, was: 0 };
    c.n++;
    c.said += p;
    c.was += o.x.y;
    out.set(band, c);
  }
  return [...out.values()].sort((x, y) => x.band - y.band).map((c) => ({ band: c.band, n: c.n, said: r4(c.said / c.n), was: r4(c.was / c.n) }));
}

// The fit (header): params and the check, or null with too few rows. cut: the share of the scored rows' dates the
// fit window takes (0.7)
export function fitAnytime(list, { cut = 0.7, grid = GRID } = {}) {
  const days = daysOf(list);
  if (!days.length) return null;
  const first = list[0].season;
  const eligibleDates = list.filter((x) => x.pos && x.rz && x.season > first).map((x) => x.day);
  if (eligibleDates.length < 2000) return null;
  const cutDay = eligibleDates[Math.floor(eligibleDates.length * cut)];
  const inFit = (o) => o.x.day < cutDay;
  const rho = fitRho(list.filter((x) => x.day < cutDay));
  const score = (p) => {
    const all = replayAnytime(days, p, first);
    const fitPart = all.filter(inFit);
    const cal = calibrate(fitPart);
    return { all, cal, ll: logLoss(fitPart, (o) => sig(cal.a + cal.b * logit(o.pr.raw))) };
  };
  // (the search: each setting in turn, twice round, the fit window's log loss after its recalibration)
  const search = (kind, keys) => {
    let p = { rho, ...START, kind, a: 0, b: 1 };
    let best = score(p);
    for (let round = 0; round < 2; round++) {
      for (const k of keys) {
        for (const v of grid[k]) {
          if (v === p[k]) continue;
          const s = score({ ...p, [k]: v });
          if (s.ll < best.ll - 1e-7) (best = s), (p = { ...p, [k]: v });
        }
      }
    }
    p = { ...p, ...best.cal };
    const held = best.all.filter((o) => !inFit(o));
    const pOf = (o) => sig(p.a + p.b * logit(o.pr.raw));
    return { params: p, fit: r4(best.ll), held, logLoss: r4(logLoss(held, pOf)), pOf };
  };
  const rz = search('rz', ['D', 'K', 'F', 'L', 'beta']);
  const plain = search('plain', ['D', 'K', 'beta']);
  const rate = rz.held.reduce((t, o) => t + o.x.y, 0) / Math.max(1, rz.held.length);
  const baseLL = r4(logLoss(rz.held, () => rate));
  const win = rz.logLoss <= plain.logLoss ? rz : plain;
  const params = { ...win.params, kind: win === rz ? 'rz' : 'plain' };
  const check = {
    cutDay,
    rows: rz.held.length,
    fitRows: list.filter((x) => x.pos && x.rz && x.day < cutDay).length,
    scored: rate === 0 ? 0 : r4(rate),
    logLoss: win.logLoss,
    rz: rz.logLoss,
    plain: plain.logLoss,
    base: baseLL,
    gain: r4(plain.logLoss - rz.logLoss),
    fit: { rz: rz.fit, plain: plain.fit },
    calibration: bandsOf(win.held, win.pOf),
    plainParams: { D: plain.params.D, K: plain.params.K, beta: plain.params.beta, a: plain.params.a, b: plain.params.b },
  };
  return { params, check };
}

// The model for the live chances: made from the fit's params and taught every final in the history (a coming
// game's chance from all of it)
export function anytimeModel(list, params) {
  const m = makeAnytime(params);
  for (const day of daysOf(list)) m.learn(day);
  return m;
}

// ---------------------------------------------------------------------------
// Pricing a coming game's anytime touchdowns: tracked only
// ---------------------------------------------------------------------------

// (what an anytime row would have staked as an action bet: desk.mjs placement's trackUnits, for learnView alone)
export const ANY_TRACK_UNITS = 0.5;
// (its placement whatever its edge: tracked, units 0, never staked (desk.mjs TRACK))
export const anytimePlacement = () => ({ intent: TRACK, units: 0, trackUnits: ANY_TRACK_UNITS });
// (an anytime row held to tracked: one that somehow isn't (an edge's placement, units over 0) made tracked, its stake
// 0; any other bet as it is. run.mjs placeBets runs every new bet through it)
export function trackOnly(bet) {
  if (bet?.propType !== ANY_KEY || (bet.intent === TRACK && !bet.units)) return bet;
  return Object.assign(bet, { intent: TRACK, units: 0, trackUnits: ANY_TRACK_UNITS });
}

// A coming game's anytime touchdowns priced (run.mjs anytimeTracked turns each into its tracked row):
//   prices   The Odds API's (props.mjs propsFromBodies' anytime: player name to the desk's book's Yes, its No where
//            posted, the other books' consensus)
//   whoOf    a name to { pid, name, pos, team } (the game's board's athletes, else the history's rows of the two
//            teams), or null
//   model    the fit's (fitProps' anytime.model); season: the game's
//   implied  team id to its implied points tonight (the lines', else the game model's)
//   out      a player id to true when he's listed out, doubtful or on IR (not priced)
//   calib    the live calibration (calib.mjs calSides, its spot anyTd|over|0.5); trust the prop type's (0.5 unfit)
// Each: { who, yes, no, consensus, model, modelRaw, cal, fair, fairAssumed, p, ev, projection }. The fair chance:
// the Yes and No with the vig out; with no No posted, the Yes's own price, vig in (fairAssumed), a little low
export function priceAnytime({ prices, whoOf, model, season, implied, out = () => false, calib = null, trust = 0.5 }) {
  const priced = [];
  const skipped = { unmatched: 0, position: 0, out: 0 };
  for (const [name, x] of prices ?? []) {
    const who = whoOf(name);
    if (!who) {
      skipped.unmatched++;
      continue;
    }
    const pos = posOf(who.pos);
    if (!pos) {
      skipped.position++;
      continue;
    }
    if (out(who.pid)) {
      skipped.out++;
      continue;
    }
    const pr = model.project({ pid: String(who.pid), pos, team: String(who.team), season, implied: implied(String(who.team)) });
    if (!pr) continue;
    const c = calSides(calib, ANY_KEY, ANY_LINE, pr.p);
    const fair = Number.isFinite(x.no) ? fairPair(x.yes, x.no) : 1 / decimal(x.yes);
    const p = chanceAt('prop', fair, c.over, trust);
    const ev = p * decimal(x.yes) - 1;
    priced.push({ who: { ...who, pos }, yes: x.yes, no: Number.isFinite(x.no) ? x.no : null, consensus: x.consensus ?? null, model: c.over, modelRaw: pr.p, cal: c.so, fair, fairAssumed: !Number.isFinite(x.no), p, ev, projection: { mean: pr.lambda, kind: model.params.kind, pAny: r4(pr.p), raw: r4(pr.raw), lambda: pr.lambda, script: pr.script, implied: Number.isFinite(implied(String(who.team))) ? Math.round(implied(String(who.team)) * 10) / 10 : null, games: pr.games, ...(pr.looks ? { looks: Object.fromEntries(KINDS.map((k, i) => [k, pr.looks[i]])), rz: pr.rz, fin: pr.fin, long: pr.long } : { td: pr.td }) } });
  }
  return { priced, skipped };
}
