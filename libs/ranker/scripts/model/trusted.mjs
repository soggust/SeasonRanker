// The trusted-edge bands (the owner's idea, 2026-10-20; DECISIONS.md D72): "take the pieces of the formula that are
// most weighted (most accurate) and if the bet hits those to a certain degree AND is a positive enough kelly score it
// gets a confidence". Research for the band lab (band-lab.mjs mode 'trusted'): nothing here prices or places a bet.
//
//   pieces       a bet's edge (the Bot's chance less the fair) split into the model's pieces (REPLAY_ATTR=1 on the
//                replay: ratings.mjs, backtest.mjs repriced, gate-history.mjs finish, gate.mjs propParts): a game
//                line's context groups (rest, travel, starters, weather, matchups, officials, park ...) each the chance
//                less the one with that group's terms out of the margin or total; a prop's drivers (form, role,
//                vacated, opponent, funnel, targets, pace, script, context, fit) each the chance less the one with that
//                factor out of his mean; each scaled by what the anchor and the trust kept (pCur - f over raw - f);
//                base the rest of the gap (the ratings, or his own rate, against the Book), cal the residual blend's
//   reliability  per sport and class (lines, props), walk-forward by month from the close rows settled before the
//                month only: the results' excess over the fair (y - f) regressed on every piece at once (ridge toward
//                0), each piece's slope and its standard error; the log loss against the Book's with that piece alone
//                moving the chance; a piece is proven when its slope's lower bound (1.645 SE) clears 0 over 500 rows
//                that carry it and its log loss beats the Book's
//   trusted edge the sum of a bet's pieces times each one's reliability (its slope, held to [0, 1]; 0 unproven)
//   bands        LOVE / LOCK when the trusted edge clears a bar AND the Kelly score clears a floor: absolute bars, or
//                percentiles of the trusted edge (or trusted edge times Kelly) among the bets settled before

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const fin = Number.isFinite;
export const GAME_HOURS = 3;
const MONTH = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
// (D72's research, D73's trial (gate.mjs on the replay, props.mjs live): a prop projection's pieces as log factors on its mean (project.mjs
// projection's own parts, as writeup.mjs driversOf reads them): form (his recent games' weight against his season
// rate), role (the trend, ramp and share steps), vacated (teammates' work left or taken back), opponent, funnel,
// targets, pace, script, context, and the fit's scale and middle; the rest (his own rate against the Book) is the base)
const lnOf = (v) => (Number.isFinite(v) && v > 0 ? Math.log(v) : 0);
export function propParts(p, P) {
  if (!p || !P) return {};
  const blend = Number.isFinite(p.rate) && Number.isFinite(p.recent) && Number.isFinite(P.w) ? (1 - P.w) * p.rate + P.w * p.recent : null;
  const role = (Number.isFinite(p.trendF) ? p.trendF : 1) * (Number.isFinite(p.ramp) ? p.ramp : 1) * (Number.isFinite(p.sp?.f) ? p.sp.f : 1);
  const base0 = blend !== null ? role * blend : null;
  return {
    form: blend !== null && p.rate > 0 ? lnOf(blend / p.rate) : 0,
    role: lnOf(role),
    vacated: lnOf(p.vacF) + (base0 > 0 && p.base > 0 ? Math.log(p.base / base0) : 0),
    opponent: Number.isFinite(p.opp) ? (p.oppA ?? P.a ?? 0) * lnOf(p.opp) : 0,
    funnel: lnOf(p.funnelF),
    targets: lnOf(p.tgtF),
    pace: lnOf(p.paceF),
    script: Number.isFinite(p.script) ? (P.b ?? 0) * lnOf(p.script) : 0,
    context: lnOf(p.ctxF),
    fit: lnOf(P.scale ?? 1) + lnOf(p.slF),
  };
}
export const classOf = (market) => (market === 'prop' ? 'prop' : 'line');

// (the pieces' words, as the popover names them)
export const PIECE_NAMES = {
  base: { line: 'team ratings vs the Book', prop: "his own rate vs the Book" },
  cal: 'the calibration',
  rest: 'rest edge',
  travel: 'travel and body clock',
  starters: 'starters and lineups',
  weather: 'weather',
  matchups: 'matchup',
  officials: 'officials',
  park: 'the park',
  strength: 'strength of schedule',
  ranker: 'the rankings',
  form: 'recent form',
  role: 'his role trend',
  vacated: 'usage from teammates out',
  opponent: 'matchup vs position',
  funnel: 'the defense funnel',
  targets: 'where targets go',
  pace: 'pace',
  script: 'the game script',
  context: 'game context',
  fit: "the fit's scale",
};
export const pieceName = (k, cls = 'line') => {
  const n = PIECE_NAMES[k];
  return typeof n === 'object' ? n[cls] : (n ?? k);
};

// (solve A x = b, A symmetric positive definite: Gaussian elimination with partial pivoting; and A's inverse)
function solve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}
const inverseDiag = (A) => A.map((_, i) => solve(A, A.map((__, j) => (i === j ? 1 : 0)))[i]);

const LL = (p, y) => -Math.log(y ? Math.min(0.999, Math.max(0.001, p)) : Math.min(0.999, Math.max(0.001, 1 - p)));
export const TRUST_DEFAULTS = { minN: 500, z: 1.645, ridge: 200, cap: 1, mainMin: 0.005 };

// One class's accumulator: the joint regression's sums, each piece's log loss and main-driver tallies
function acc() {
  return { keys: [], idx: new Map(), XX: [], Xy: [], yy: 0, n: 0, sq: [], per: new Map() };
}
function keyIdx(a, k) {
  if (a.idx.has(k)) return a.idx.get(k);
  const i = a.keys.length;
  a.keys.push(k);
  a.idx.set(k, i);
  for (const r of a.XX) r.push(0);
  a.XX.push(new Array(a.keys.length).fill(0));
  a.Xy.push(0);
  a.sq.push(0);
  return i;
}
function addRow(a, f, y, attr, mainMin, cur = {}) {
  const e = y - f;
  const nz = [];
  let main = null;
  for (const [k, v] of Object.entries(attr)) {
    if (!fin(v) || Math.abs(v) < 1e-4) continue;
    const i = keyIdx(a, k);
    nz.push([i, v]);
    const g = a.per.get(k) ?? a.per.set(k, { n: 0, llBook: 0, llPiece: 0, mainN: 0, mainHit: 0, mainExp: 0, hoN: 0, hoGain: 0 }).get(k);
    g.n++;
    g.llBook += LL(f, y);
    g.llPiece += LL(f + v, y);
    if (!main || Math.abs(v) > Math.abs(main[1])) main = [k, v];
  }
  // (held out: the row read at the weights fit before its month (cur, each slope held to [0, cap]), the joint chance
  // with every piece against the one without piece k: k's out-of-sample log-loss gain where it moves the chance)
  const wOf = (k) => Math.min(TRUST_DEFAULTS.cap * 2, Math.max(0, cur[k]?.slope ?? 0));
  let full = f;
  for (const [i, v] of nz) full += wOf(a.keys[i]) * v;
  const llFull = LL(full, y);
  for (const [i, v] of nz) {
    const k = a.keys[i];
    if (!cur[k]) continue;
    const g = a.per.get(k);
    g.hoN++;
    g.hoGain += LL(full - wOf(k) * v, y) - llFull;
  }
  for (const [i, v] of nz) {
    a.Xy[i] += v * e;
    a.sq[i] += v * v;
    for (const [j, w] of nz) a.XX[i][j] += v * w;
  }
  a.yy += e * e;
  a.n++;
  if (main && Math.abs(main[1]) >= mainMin) {
    const g = a.per.get(main[0]);
    g.mainN++;
    const up = main[1] > 0;
    g.mainHit += up ? y : 1 - y;
    g.mainExp += up ? f : 1 - f;
  }
}
// (a class's reliability now: each piece's slope, SE, log-loss gain, main-driver excess, proven, and its weight)
function readAcc(a, o) {
  const K = a.keys.length;
  if (!K || a.n < 50) return {};
  const A = a.XX.map((r, i) => r.map((v, j) => v + (i === j ? o.ridge * (a.sq[i] / a.n) + 1e-9 : 0)));
  const b = solve(A, a.Xy);
  const s2 = Math.max(1e-6, a.yy / a.n);
  const inv = inverseDiag(A);
  const out = {};
  a.keys.forEach((k, i) => {
    const g = a.per.get(k);
    const se = Math.sqrt(Math.max(0, s2 * inv[i]));
    const gain = g.n ? (g.llBook - g.llPiece) / g.n : 0;
    const ho = g.hoN ? g.hoGain / g.hoN : 0;
    const proven = g.n >= o.minN && b[i] - o.z * se > 0 && g.hoN >= o.minN / 2 && ho > 0;
    out[k] = { slope: b[i], se, n: g.n, gain, hoN: g.hoN, ho, mainN: g.mainN, mainEdge: g.mainN ? (g.mainHit - g.mainExp) / g.mainN : null, proven, w: proven ? Math.min(o.cap, Math.max(0, b[i])) : 0 };
  });
  return out;
}

// The walk: rows [t, market, stat, f, y, attr] (the replay's -attr.json, the over's or home's side), oldest first.
// { at(t, cls): the reliability as of t's month (rows settled before the month's start), months: [[monthStart, {line,
// prop}]], final: {line, prop} (every row: what a live rule reads) }
export function walkTrust(rows, opts = {}) {
  const o = { ...TRUST_DEFAULTS, ...opts };
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const A = { line: acc(), prop: acc() };
  const months = [];
  let i = 0;
  const firstMonth = sorted.length ? MONTH(sorted[0][0]) : 0;
  const lastMonth = sorted.length ? MONTH(sorted[sorted.length - 1][0] + 40 * 864e5) : 0;
  let cur = { line: {}, prop: {} };
  for (let m = firstMonth; m <= lastMonth; m = MONTH(m + 32 * 864e5)) {
    while (i < sorted.length && sorted[i][0] + GAME_HOURS * 36e5 < m) {
      const [, market, , f, y, attr] = sorted[i++];
      addRow(A[classOf(market)], f, y, attr, o.mainMin, cur[classOf(market)]);
    }
    cur = { line: readAcc(A.line, o), prop: readAcc(A.prop, o) };
    months.push([m, cur]);
  }
  while (i < sorted.length) {
    const [, market, , f, y, attr] = sorted[i++];
    addRow(A[classOf(market)], f, y, attr, o.mainMin, cur[classOf(market)]);
  }
  const final = { line: readAcc(A.line, o), prop: readAcc(A.prop, o) };
  const at = (t, cls) => {
    let lo = 0;
    let hi = months.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (months[mid][0] <= t) (best = months[mid][1]), (lo = mid + 1);
      else hi = mid - 1;
    }
    return best?.[cls] ?? {};
  };
  return { at, months, final };
}

// A bet's trusted edge and the pieces that carried it: { te, pieces: [[key, part]] (its proven pieces' trusted parts,
// largest first, the positive ones) }
export function trustedEdge(attr, rel) {
  let te = 0;
  const pieces = [];
  for (const [k, v] of Object.entries(attr ?? {})) {
    const w = rel?.[k]?.w ?? 0;
    if (!w || !fin(v)) continue;
    te += v * w;
    if (v * w > 0) pieces.push([k, v * w]);
  }
  pieces.sort((a, b) => b[1] - a[1]);
  return { te, pieces };
}

// (the rule's score: the trusted edge, or the trusted edge times the Kelly score)
// (or 'share': the share of the bet's whole edge its proven pieces carry, "hits those pieces to a certain degree")
const scoreOf = (rule, te, kelly, edge) => (rule.score === 'teKelly' ? te * Math.max(0, kelly) : rule.score === 'share' ? (edge > 0 ? te / edge : 0) : te);

// The bands on bets (each { t, at, market, kelly, attr, units, suspect, barred }): rule { bars: 'abs' | 'pct', love,
// lock (absolute trusted edge, or the top shares: lock 0.05 the top 5%, love 0.20 the top 20% with the LOCKs), kelly
// (the floor under both), lockKelly (LOCK's own floor), score ('te' | 'teKelly'), minPrior (bets settled before
// needed to read a percentile) }; walk from walkTrust. Returns each bet's { band, te, pieces }
export function trustBands(bets, walk, rule) {
  const order = bets.map((b, i) => i).sort((a, b) => bets[a].at - bets[b].at);
  const settled = [];
  const out = new Array(bets.length);
  // (the prior bets' scores by settle time, read each bet's month so a percentile is the months before only)
  const done = bets.map((b) => b.t + GAME_HOURS * 36e5);
  const bySettle = bets.map((b, i) => i).sort((a, b) => done[a] - done[b]);
  let s = 0;
  let cache = { n: -1, sorted: [] };
  const scores = bets.map((b) => {
    const { te, pieces } = trustedEdge(b.attr, walk.at(b.at, classOf(b.market)));
    const edge = Object.values(b.attr ?? {}).reduce((a, v) => a + (fin(v) ? v : 0), 0);
    return { te, pieces, score: scoreOf(rule, te, b.kelly, edge) };
  });
  for (const i of order) {
    const b = bets[i];
    const m = MONTH(b.at);
    while (s < bySettle.length && done[bySettle[s]] < m) {
      const j = bySettle[s++];
      // (the pool: every bet settled before the month (the pyramid's shares are of all the bets), its score)
      if (bets[j].kelly > 0) settled.push(scores[j].score);
    }
    const { te, pieces, score } = scores[i];
    let band = 'medium';
    const kOk = fin(b.kelly) && b.kelly >= (rule.kelly ?? 0.02);
    if (kOk && te > 0) {
      if (rule.bars === 'pct') {
        if (settled.length >= (rule.minPrior ?? 200)) {
          if (cache.n !== settled.length) cache = { n: settled.length, sorted: [...settled].sort((a, c) => c - a) };
          const { sorted } = cache;
          const q = (share) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(share * sorted.length) - 1))];
          if (rule.lock > 0 && score >= q(rule.lock) && b.kelly >= (rule.lockKelly ?? rule.kelly ?? 0.02)) band = 'lock';
          else if (score >= q(rule.love)) band = 'high';
        }
      } else if (rule.lock > 0 && scores[i].score >= rule.lock && b.kelly >= (rule.lockKelly ?? rule.kelly ?? 0.02)) band = 'lock';
      else if (scores[i].score >= rule.love) band = 'high';
    }
    if ((b.suspect || b.barred) && band !== 'medium') band = 'medium';
    out[i] = { band, te, pieces };
  }
  return out;
}

// The popover's words: "Driven by: rest edge (proven), matchup vs position (proven)"
export const drivenBy = (pieces, cls) => (pieces?.length ? `Driven by: ${pieces.slice(0, 3).map(([k]) => `${pieceName(k, cls)} (proven)`).join(', ')}` : null);

// ---- The two-band trial (DECISIONS.md D73; the owner, 2026-10-20: "I'm fine going two-band until we find a more
// proven model") ----
// LIKE and LOVE only, LOCK off (the biggest edges were the worst band in every sport, D52 and D72). A prop bet is a
// LOVE where its proven pieces carry at least `share` of its edge (the trusted share) and its Kelly score sits in
// [kelly, kellyMax): the threshold and the ceiling picked each month from the bets settled before it alone (the
// pair whose LOVEs led the LIKEs by the most standard errors in flat return, nMin LOVEs at least, their own return
// positive and their lead zMin or more); none earned that month: no LOVE. A LOVE stakes loveUnits. With `mid` on
// (the NBA), a prop LIKE outside the stat bar stakes 1u where its trusted share is past the month's `mid`, else the
// practice stake, `mid` picked the same way (the prior props' units at each step of mids; 0 the stake as it was,
// 9 every one at the practice stake). Each piece on only where it beat the rule as it was out of sample (TRIAL: the NHL's
// LOVE, 22 bets; the NBA's LIKE stakes, its LOVE lost on the current replay, -0.4% against +2.2%); every
// gate and cap stays on top (a suspect price, a barred stat, D60's bar, a practice pick: a LIKE at the stake they
// set). Lines stay LIKE: their pieces are almost never proven (D72) and the live desk can't split them.
// (D95, the testing audit's third recommendation, 2026-10-26: the NBA's LIKE stake step off (on the re-recorded replay it
// cost 8.2u against the stake as it was); the NBA stays a trial sport (LIKE only, LOCK off) with nothing on. The NHL's
// LOVE stays on, fragile: 35 walk-forward LOVEs at the audit)
export const TRIAL = { nba: { love: false, mid: false }, nhl: { love: true, mid: false } };
export const TRIAL_OPTS = { shares: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8], kellyMax: [0.02, Infinity], kelly: 0.01, nMin: 30, zMin: 0, loveUnits: 2, mids: [0, 0.2, 0.4, 0.6, 9], minPrior: 200, practice: 0.5 };
export const trialOn = (sport) => TRIAL[sport] ?? null;
export const TRIAL_V = 1;

// A bet's trusted share: { te, pieces, edge (the parts' sum: the bet's edge), share (te / edge; 0 where either isn't
// positive) }
export function shareOf(attr, rel) {
  const { te, pieces } = trustedEdge(attr, rel);
  const edge = Object.values(attr ?? {}).reduce((a, v) => a + (fin(v) ? v : 0), 0);
  return { te, pieces, edge, share: edge > 0 && te > 0 ? te / edge : 0 };
}
const decOf = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
export const flatOf = (b) => (b.res === 'W' ? decOf(b.odds) - 1 : b.res === 'L' ? -1 : 0);
// (a trial bet: { at, t, market, kelly, share, te, units (its stake as the rules left it), held (a suspect price or a
// barred stat: never a LOVE, its stake as it is), res, odds })
export const isLoveBy = (b, r, o = TRIAL_OPTS) => !!r && b.market === 'prop' && !b.held && b.te > 0 && b.share >= r.share && fin(b.kelly) && b.kelly >= o.kelly && b.kelly < (r.kellyMax ?? Infinity);
export const midUnits = (b, mid, o = TRIAL_OPTS) => (b.market !== 'prop' || b.held || !mid ? b.units : mid >= 9 ? o.practice : b.share >= mid ? 1 : o.practice);
// (the LOVE rule from bets settled before: the share and ceiling whose LOVEs lead by the most SEs, or null)
export function chooseLove(prior, o = TRIAL_OPTS) {
  let best = null;
  for (const share of o.shares)
    for (const kellyMax of o.kellyMax) {
      const r = { share, kellyMax };
      let n1 = 0;
      let s1 = 0;
      let q1 = 0;
      let n0 = 0;
      let s0 = 0;
      let q0 = 0;
      for (const b of prior) {
        const f = b.flat ?? flatOf(b);
        if (isLoveBy(b, r, o)) {
          n1++;
          s1 += f;
          q1 += f * f;
        } else {
          n0++;
          s0 += f;
          q0 += f * f;
        }
      }
      if (n1 < o.nMin || n0 < o.nMin) continue;
      const m1 = s1 / n1;
      const m0 = s0 / n0;
      const se = Math.sqrt(Math.max(1e-12, (q1 / n1 - m1 * m1) / n1 + (q0 / n0 - m0 * m0) / n0));
      const z = (m1 - m0) / se;
      if (m1 > 0 && z >= o.zMin && (!best || z > best.z)) best = { ...r, z: Math.round(z * 100) / 100, n: n1, roi: Math.round(m1 * 1e4) / 1e4, rest: Math.round(m0 * 1e4) / 1e4 };
    }
  return best;
}
// (the LIKE props' stake step from bets settled before: the mid whose stakes made the most units on them)
export function chooseMid(prior, r, o = TRIAL_OPTS) {
  let best = null;
  for (const mid of o.mids) {
    let u = 0;
    for (const b of prior) if (b.market === 'prop' && !b.held && !isLoveBy(b, r, o)) u += midUnits(b, mid, o) * (b.flat ?? flatOf(b));
    if (!best || u > best.u + 1e-9) best = { mid, u };
  }
  return best?.mid ?? 0;
}
const settleOf = (b) => b.t + GAME_HOURS * 36e5;
// The walk: each month's rule from the bets settled before its start (minPrior of them, else none). { at(t), months:
// [[monthStart, { love, mid }]], final (on every bet: what the live desk reads), opts }
export function trialWalk(bets, sport, opts = {}) {
  const o = { ...TRIAL_OPTS, ...opts };
  const on = o.on ?? trialOn(sport) ?? {};
  const list = bets.map((b) => ({ ...b, flat: b.flat ?? flatOf(b), done: settleOf(b) })).sort((a, b) => a.done - b.done);
  const choose = (prior) => {
    if (prior.length < o.minPrior) return { love: null, mid: 0 };
    const love = on.love ? chooseLove(prior, o) : null;
    return { love, mid: on.mid ? chooseMid(prior, love, o) : 0 };
  };
  const ats = bets.map((b) => b.at).filter(fin).sort((a, b) => a - b);
  const months = [];
  if (ats.length) {
    let i = 0;
    for (let m = MONTH(ats[0]); m <= MONTH(ats[ats.length - 1]); m = MONTH(m + 32 * 864e5)) {
      while (i < list.length && list[i].done < m) i++;
      months.push([m, choose(list.slice(0, i))]);
    }
  }
  const at = (t) => {
    let best = { love: null, mid: 0 };
    for (const [m, c] of months) if (m <= t) best = c;
    return best;
  };
  return { at, months, final: choose(list), opts: o };
}
// A bet's band and stake under a month's rule: { band ('high' | 'medium'), units }
export function trialBand(b, choice, o = TRIAL_OPTS) {
  if (isLoveBy(b, choice?.love, o)) return { band: 'high', units: o.loveUnits };
  return { band: 'medium', units: midUnits(b, choice?.mid ?? 0, o) };
}
// (the popover's words on a LOVE, drivenBy's pieces: "LOVE (trial): driven by proven pieces: his own rate vs the
// Book, recent form")
export const trialWhy = (pieces, cls = 'prop') => `LOVE (trial): driven by proven pieces: ${(pieces ?? []).slice(0, 3).map(([k]) => pieceName(k, cls)).join(', ') || 'none named'}`;

// The file the record writes (apps/<sport>/src/StaticData/model/trusted.json) and the desk reads: the prop pieces'
// weights at the end of the history and the rule the walk would use next
export function trialFileOf(sport, trust, walk, { at = new Date().toISOString(), epoch = null, record = null } = {}) {
  const weights = Object.fromEntries(Object.entries(trust.final.prop ?? {}).filter(([, v]) => v.w > 0).map(([k, v]) => [k, Math.round(v.w * 1e4) / 1e4]));
  const love = walk.final.love ? { ...walk.final.love, kellyMax: fin(walk.final.love.kellyMax) ? walk.final.love.kellyMax : null } : null;
  return { v: TRIAL_V, sport, trial: true, at, epoch, on: trialOn(sport), rule: { love, mid: walk.final.mid }, loveUnits: walk.opts.loveUnits, kelly: walk.opts.kelly, weights, record };
}
// A live prop's band and stake from the file: bet { market, kelly, parts (its pieces on its side), units, held }.
// { band, units, share, pieces, why } or null (no file, no parts)
export function liveTrial(file, bet) {
  if (!file?.trial || file.v !== TRIAL_V || bet.market !== 'prop' || !bet.parts) return null;
  const rel = Object.fromEntries(Object.entries(file.weights ?? {}).map(([k, w]) => [k, { w }]));
  const s = shareOf(bet.parts, rel);
  const o = { ...TRIAL_OPTS, loveUnits: file.loveUnits ?? TRIAL_OPTS.loveUnits, kelly: file.kelly ?? TRIAL_OPTS.kelly };
  const love = file.rule?.love ? { ...file.rule.love, kellyMax: file.rule.love.kellyMax ?? Infinity } : null;
  // (a piece switched off in TRIAL since the file was written stays off live, D95: the file's rule is the walk's, the switch the code's)
  const on = trialOn(file.sport) ?? {};
  const { band, units } = trialBand({ ...bet, share: s.share, te: s.te }, { love: on.love === false ? null : love, mid: on.mid === false ? 0 : (file.rule?.mid ?? 0) }, o);
  return { band, units, share: Math.round(s.share * 1e3) / 1e3, pieces: s.pieces, why: band === 'high' ? trialWhy(s.pieces) : null };
}

// A live prop's pieces on its side (D73), as the replay splits a close row (gate-history.mjs propAttr and finish):
// each piece the over's chance less the one with that piece's factor out of his mean, scaled by what the anchor and
// the trust kept (pCur - f over raw - f), the rest of the gap the base, the residual blend's move the cal; the
// under's the over's turned. x: { p (the projection), params, mix, line, mu, overAt(line, mu) (project.mjs
// lineChances' over), raw (the over's own chance), f (the over's fair), pCur (the over's trusted chance before the
// blend), pFinal (the over's priced chance), side }
export function liveParts(x) {
  const clamp = (v) => Math.min(0.999, Math.max(0.001, v));
  if ((!x?.logParts && (!x?.p || !x.params)) || !fin(x.mu) || !fin(x.raw) || !fin(x.f) || !fin(x.pCur) || !fin(x.pFinal)) return null;
  const raw = clamp(x.raw);
  const out = {};
  let sum = 0;
  const gap = raw - x.f;
  const lam = Math.abs(gap) > 1e-4 ? (x.pCur - x.f) / gap : 0;
  for (const [k, lf] of Object.entries(x.logParts ?? propParts(x.p, x.params))) {
    if (!fin(lf) || !lf) continue;
    const q0 = x.overAt(x.line, Math.max(0.05, x.mu / Math.exp(lf)));
    if (!fin(q0)) continue;
    out[k] = (raw - q0) * lam;
    sum += out[k];
  }
  out.base = x.pCur - x.f - sum;
  out.cal = x.pFinal - x.pCur;
  const s = x.side === 'under' ? -1 : 1;
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(s * v * 1e5) / 1e5]));
}

// (the committed file, apps/<sport>/src/StaticData/model/trusted.json; null where it's missing or another version's)
export const trustedFile = (sport, root) => path.join(root, 'apps', sport, 'src/StaticData/model/trusted.json');
export function readTrusted(sport, root) {
  try {
    const f = trustedFile(sport, root);
    if (!existsSync(f)) return null;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    return m?.trial && m.v === TRIAL_V ? m : null;
  } catch {
    return null;
  }
}

// (the live desk's log factors from the bet's own projection (props.mjs projection, the fields writeup.mjs driversOf
// reads), so props.mjs, a fit file (fitcache.mjs FIT_FILES), is untouched: form, the opponent, the funnel, targets,
// pace, the script, context and the fit's scale and middle as propParts; role his ramp back from an absence; vacated
// the rest of his mean against his blended rate (his teammates' work and the same-games step, as propParts' vacated
// with the role's trend and share steps and the squad's step beside it))
export function projectionParts(pr) {
  const A = pr?.applied ?? {};
  if (!pr || !fin(pr.mean) || !fin(pr.rate) || !(pr.rate > 0) || !fin(A.w)) return null;
  const recent = fin(pr.recent) ? pr.recent : pr.rate;
  const blend = (1 - A.w) * pr.rate + A.w * recent;
  if (!(blend > 0) || !(pr.mean > 0)) return null;
  const out = {
    form: lnOf(blend / pr.rate),
    role: lnOf(pr.back?.ramp ?? 1),
    opponent: fin(pr.opp) ? (A.a ?? 0) * lnOf(pr.opp) : 0,
    funnel: lnOf(pr.funnelF),
    targets: lnOf(pr.tgtF),
    pace: lnOf(pr.paceF),
    script: fin(pr.script) ? (A.b ?? 0) * lnOf(pr.script) : 0,
    context: lnOf(pr.ctxF),
    fit: lnOf(A.scale ?? 1) + lnOf(pr.slF ?? 1),
  };
  const known = Object.entries(out).reduce((a, [k, v]) => (k === 'form' ? a : a + v), 0);
  out.vacated = Math.log(pr.mean / blend) - known;
  return out;
}
// A live bet's pieces (run.mjs withTrial): bet { side, line, p, pTrust?, fair, projection }, overAt(line, mu) the stat's
// over chance (project.mjs lineChances at its fit and the projection's early exit)
export function betParts(bet, overAt) {
  const pr = bet?.projection;
  const lf = projectionParts(pr);
  if (!lf || !fin(pr.pOver) || !fin(bet.fair) || !fin(bet.p) || !fin(bet.line)) return null;
  const over = bet.side !== 'under';
  const toOver = (v) => (over ? v : 1 - v);
  const pFinal = toOver(bet.p);
  const pCur = fin(bet.pTrust) ? toOver(bet.pTrust) : pFinal;
  return liveParts({ logParts: lf, mu: pr.mean, line: bet.line, overAt, raw: pr.pOver, f: toOver(bet.fair), pCur, pFinal, side: bet.side });
}
