// The residual model: where the Book is wrong (the owner's ask, 2026-10-19: "learn where the Book is wrong"). The deep
// dive on the priced history (scratchpad deep-dive, 2026-10-19) found that only 10 to 25% of the Bot's disagreement
// with the Book's no-vig chance is signal, and that most of what is recoverable against the Book at the close is the
// Book's own over-shade, not the Bot's lean. This model's job is to learn exactly which disagreements are the real
// ones: given the Bot's own chance and the market's numbers at the moment a bet is placed, predict where the Book's
// no-vig price is off and by how much, and say "no edge" (the Book is right) the rest of the time.
//
//   frame     every row read as its over (a game line as its home or over side): the Book's no-vig chance f at the
//             bet's moment, the Book's two prices (overOdds, underOdds), the Bot's raw chance raw, the start t,
//             the bet's moment at, the open's no-vig at the same line fo (where the bet is placed later than the
//             open: the move to date is known then, never before), home (where the row has it), the result y
//   target    logit P(y) = logit(f) + g(x): the Book's error in logits, so a g of 0 is "the Book is right". g is
//             a ridge logistic regression (fitLogit) on features(): the Bot's disagreement d = logit(raw) -
//             logit(f) (held to D_CAP), its taper d·|d|, d by the stat, the line's size, the price band, the bet's
//             timing, home, the season's phase and the move to date; the Book's own shade by the stat, the price
//             band and the vig; and two walk-forward running reads (runningStats) the model learns to lean on: the
//             Bot's recent per-stat accuracy (the slope of y - f on d over its recent rows) and the Book's recent
//             per-stat over-shade. A small boosted-trees stage (fitTrees) can sit on top of the logistic margin;
//             it ships only where the walk-forward says it pays (residual-train.mjs decides)
//   time      no look-ahead. A model is a sequence of monthly snapshots (fitWalk): the snapshot for a month is
//             fit only on rows settled (t + SETTLE_MS) before the month's start, and a row is priced by the newest
//             snapshot whose cutoff is at or before the bet's moment (snapshotFor). The running stats are frozen
//             the same way, a month at a time, in the fit and at the price alike. tests/model-residual.test.mjs
//             pins it with a planted leak the earlier snapshot can't know
//   output    residualChance: the corrected chance p, the learned shift g, an edge confidence (the shift against
//             its standard error) and noEdge (the corrected chance clears neither of the Book's prices), and the
//             price the desk uses: a soft blend of the current price and the corrected one (blendChance), the
//             blend's weight fit on held-out months and stepped at most BLEND_STEP a refit (DECISIONS.md D8)
//   the rule  the model predicts the Book's error. It never pulls the Bot toward the Book because the Bot is
//             ahead: a Bot whose disagreements have been right shows as a larger learned edge (b on d grows past
//             the current trust, the blend lands past the current price), a Bot whose disagreements have been
//             noise shows as "no edge" (b near 0). Pinned in tests/model-residual.test.mjs (the owner's condition)
//   where     RESID_PRICING (on since 2026-10-19: the owner resolved O3 on the results, CLV and hit evidence, over
//             the gate's close-leg HOLD; DECISIONS.md D32, D22's exception); RESID_OFF=1 prices one run without it
//             (the gate's champion), RESID_ON=1 one run with it whatever the flag. The hook is desk.mjs chanceAt's
//             ctx: the live props (props.mjs priceProps), the game lines (desk.mjs choose, the board's sides), the
//             gate's history replay and its ledger replay all pass it. The model files
//             apps/<sport>/src/StaticData/model/residual.json are written by residual-train.mjs (weekly) with a
//             hold-out guard (guardOk) so a bad refit can't ship
//   order     a prop's chance is built once, in this order, each step reading one input and never its own output:
//             the bot's own number -> the anchor (anchor.mjs, D33: the raw this model's lean d reads) -> the live
//             calibration -> the trust (chanceAt's p: the current price) -> this blend (p and the corrected chance).
//             The trust fit and the calibration never read the blended chance; the weekly refit reads the priced
//             history, never the ledger. No step counts twice (tests/model-decisions.test.mjs D32)
//
// Plain JavaScript, no dependency. Nothing here imports the desk (desk.mjs imports this).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { seasonWeight } from './gate-score.mjs';

export const MODEL_V = 1;
// (whether the residual blend prices the rows. True since 2026-10-19: the gate HELD it on the close leg alone
// (NFL +.0005, NBA +.0001, intervals of no width) while the results log loss, the top picks' CLV and the live hit
// rates beat the Book; the owner overrode the close leg (O3: "whatever gets us closer to winning more"), the
// exception written into D22. RESID_ON=1 or RESID_OFF=1 in the environment overrides it for one run, the gate's
// challenger and champion)
export const RESID_PRICING = true;
export const residOn = () => (process.env.RESID_OFF === '1' ? false : process.env.RESID_ON === '1' ? true : RESID_PRICING);
// (a row is settled, and can teach a snapshot, SETTLE_MS after its start)
export const SETTLE_MS = 12 * 36e5;
// (a sport's first snapshot needs this many settled rows of a kind; under it the current price stands)
export const RESID_MIN = 3000;
export const D_CAP = 2.5;
export const MV_CAP = 1;
export const PG_CAP = 1;
// (the ridge penalties tried, most shrunk first, in rows: a standardized term (and the intercept: the prior is
// that the Book is right) keeps about n / (n + 4·lambda) of its own fit, so at 3000 it needs 12,000 rows' worth of
// evidence to keep half; chosen on the newest held-out months by the one-standard-error rule toward more
// shrinkage, as correct.mjs oneSe. The signal is small (the deep dive: about 0.001 log loss a row at the close),
// so the terms are few and shrunk hard)
export const LAMBDAS = [10000, 3000, 1000, 300, 100];
export const HOLDOUT_MONTHS = 3;
// (the blend of the current price and the corrected one: starts at the current price (no evidence, no weight: D8,
// shrunk by its evidence), moves at most BLEND_STEP a refit toward the weight with the lowest loss on the newest
// BLEND_MONTHS held-out months (each row priced walk-forward), never an on/off switch)
export const BLEND_START = 0;
export const BLEND_STEP = 0.25;
export const BLEND_MONTHS = 12;
// (the running reads' memory, in rows, and their shrinkage)
export const RUN_HALF = 400;
export const RUN_K = 150;

const fin = Number.isFinite;
export const clip = (p, lo = 0.005, hi = 0.995) => Math.min(hi, Math.max(lo, p));
export const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const implied = (o) => (fin(o) && o ? (o > 0 ? 100 / (o + 100) : -o / (-o + 100)) : NaN);
export const lineBucket = (line) => (!fin(line) ? 'high' : line <= 1.5 ? 'low' : line <= 3.5 ? 'mid' : 'high');
export const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
export const monthStart = (key) => Date.parse(`${key}-01T00:00:00Z`);
const nextMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const prevMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const r6 = (v) => (fin(v) ? Math.round(v * 1e6) / 1e6 : null);
export const binLoss = (p, y) => -Math.log(clip(y ? p : 1 - p));
export const kindOf = (row) => (row.market === 'prop' ? 'props' : 'lines');
export const statKey = (row) => `${kindOf(row)}|${row.stat ?? row.market}`;

// ---- the running reads (walk-forward, frozen a month at a time) ----

// Per stat key, the Bot's recent accuracy (b: the shrunk slope of y - f on d over its recent rows, 1 the Bot's whole
// lean right, 0 noise) and the Book's recent over-shade (shade: the shrunk mean of y - f), from rows settled before
// each month's start, with a memory of RUN_HALF rows. Map month key -> Map stat key -> { b, shade, n }. Rows need
// t, f, raw, y, and the keys statKey reads. A month with no rows before it reads none (the features then 0)
export function runningStats(rows, { half = RUN_HALF, k = RUN_K } = {}) {
  const decay = Math.pow(0.5, 1 / half);
  const store = new Map();
  const out = new Map();
  const settled = rows.filter((x) => (x.y === 0 || x.y === 1) && fin(x.t) && fin(x.f) && fin(x.raw)).sort((a, b) => a.t - b.t);
  if (!settled.length) return out;
  const freeze = () => {
    const m = new Map();
    for (const [key, s] of store) m.set(key, { b: r4(s.yd / (s.dd + k * 0.25)), shade: r4(s.r / (s.w + k)), n: Math.round(s.w) });
    return m;
  };
  let month = monthKey(settled[0].t + SETTLE_MS);
  let i = 0;
  const last = monthKey(settled[settled.length - 1].t + SETTLE_MS);
  while (month <= nextMonth(last)) {
    out.set(month, freeze());
    const end = monthStart(nextMonth(month));
    while (i < settled.length && settled[i].t + SETTLE_MS < end) {
      const x = settled[i++];
      const key = statKey(x);
      const s = store.get(key) ?? store.set(key, { w: 0, yd: 0, dd: 0, r: 0 }).get(key);
      const d = Math.max(-D_CAP, Math.min(D_CAP, logit(x.raw) - logit(x.f)));
      const e = x.y - x.f;
      s.w = s.w * decay + 1;
      s.yd = s.yd * decay + e * d;
      s.dd = s.dd * decay + d * d;
      s.r = s.r * decay + e;
    }
    month = nextMonth(month);
  }
  return out;
}

// (the reads a row sees: the newest month frozen at or before its bet's moment)
export function runAt(run, at) {
  if (!run || !run.size) return null;
  const m = monthKey(at);
  if (run.has(m)) return run.get(m);
  let best = null;
  for (const key of run.keys()) if (key <= m && (!best || key > best)) best = key;
  return best ? run.get(best) : null;
}

// ---- the features ----

// A row's features as of its bet's moment (everything here is known then: no result, no close): name -> value.
// run: the frozen running reads for its month (runAt). The one-hots by stat and market are named so the training
// set's vocabulary fixes the spec (specOf)
export function features(row, run = null) {
  const f = clip(row.f);
  const lf = logit(f);
  const raw = fin(row.raw) ? clip(row.raw) : f;
  const d = Math.max(-D_CAP, Math.min(D_CAP, logit(raw) - lf));
  const po = implied(row.overOdds);
  const pu = implied(row.underOdds);
  const vig = fin(po) && fin(pu) ? po + pu - 1 : 0.045;
  const late = row.kind === 'c' ? 1 : row.kind === 'o' ? 0 : fin(row.hours) ? (row.hours <= 6 ? 1 : 0) : 0;
  const home = row.home === true ? 1 : row.home === false ? -1 : 0;
  const mv = fin(row.fo) && row.fo > 0 && row.fo < 1 ? Math.max(-MV_CAP, Math.min(MV_CAP, lf - logit(row.fo))) : 0;
  const hasMv = fin(row.fo) && row.fo > 0 && row.fo < 1 ? 1 : 0;
  // (the Book's own no-vig against the anchor's: a game line's f is Pinnacle's where it posts the line, the
  // prices DraftKings'; a prop's f is DraftKings' own, so its gap is 0)
  const dkFair = fin(row.dkFair) ? row.dkFair : fin(po) && fin(pu) ? po / (po + pu) : NaN;
  const pg = fin(dkFair) && dkFair > 0 && dkFair < 1 ? Math.max(-PG_CAP, Math.min(PG_CAP, logit(dkFair) - lf)) : 0;
  const early = fin(row.phase) ? Math.max(0, 1 - row.phase) : 0;
  const key = statKey(row);
  const rs = run?.get(key) ?? null;
  const b = rs ? Math.max(-1, Math.min(2, rs.b ?? 0)) : 0;
  const shade = rs ? Math.max(-0.1, Math.min(0.1, rs.shade ?? 0)) : 0;
  const bucket = row.market === 'prop' ? lineBucket(row.line) : null;
  // (the terms, each with a reason in the deep dive: the Book's over-shade (the intercept, by stat, by home, by
  // the price band lf, by the vig); the Bot's lean d and how much of it to keep by its size (dAbs: the taper), the
  // stat, the line's size, the timing, the season's phase, the move to date and the Pinnacle gap; and the two
  // running reads)
  const x = {
    one: 1,
    lf,
    vig: vig - 0.045,
    late,
    home,
    early,
    d,
    dAbs: d * Math.abs(d),
    'd*late': d * late,
    'd*early': d * early,
    mv,
    'd*mv': d * mv,
    pg,
    'd*runB': d * b,
    runShade: shade,
  };
  if (row.market === 'prop') {
    x[`stat:${row.stat}`] = 1;
    x[`d*stat:${row.stat}`] = d;
    if (bucket !== 'high') {
      x[`bucket:${bucket}`] = 1;
      x[`d*bucket:${bucket}`] = d;
    }
  } else {
    x[`market:${row.market}`] = 1;
    x[`d*market:${row.market}`] = d;
  }
  return x;
}

// (the spec: the feature names a training set has, with variance; 'one' first)
export function specOf(featureRows) {
  const seen = new Map();
  for (const x of featureRows)
    for (const [k, v] of Object.entries(x)) {
      const s = seen.get(k) ?? seen.set(k, { n: 0, sum: 0, sum2: 0 }).get(k);
      s.n++;
      s.sum += v;
      s.sum2 += v * v;
    }
  const n = featureRows.length;
  const names = ['one'];
  for (const [k, s] of seen) {
    if (k === 'one') continue;
    const mean = s.sum / n;
    const vr = s.sum2 / n - mean * mean;
    // (a one-hot seen on fewer than 30 rows has no term of its own: it reads the shared terms)
    if (vr > 1e-9 && s.n >= 30) names.push(k);
  }
  return names;
}

// (rows' feature vectors on a spec, standardized by the training set's means and spreads (the intercept as is):
// { X: Float64Array[], mu, sd })
export function design(featureRows, spec, scale = null) {
  const p = spec.length;
  const n = featureRows.length;
  const mu = scale?.mu ?? new Array(p).fill(0);
  const sd = scale?.sd ?? new Array(p).fill(1);
  if (!scale) {
    for (let j = 1; j < p; j++) {
      let s = 0;
      let s2 = 0;
      for (const x of featureRows) {
        const v = x[spec[j]] ?? 0;
        s += v;
        s2 += v * v;
      }
      mu[j] = s / Math.max(1, n);
      sd[j] = Math.sqrt(Math.max(1e-12, s2 / Math.max(1, n) - mu[j] * mu[j]));
    }
  }
  const X = featureRows.map((x) => {
    const v = new Float64Array(p);
    v[0] = 1;
    for (let j = 1; j < p; j++) v[j] = ((x[spec[j]] ?? 0) - mu[j]) / sd[j];
    return v;
  });
  return { X, mu, sd };
}

// ---- the ridge logistic regression (L-BFGS, an offset at the Book's logit) ----

// Fit g = X·beta on rows with offset off (logit f), results y, weights w (normalized to a mean of 1), the ridge
// penalty lambda (rows) on every term, the intercept too (the prior: the Book is right). { beta, loss (mean
// weighted log loss), iters, hessDiag }
export function fitLogit(X, y, w, off, { lambda = 100, beta0 = null, maxIter = 300, tol = 1e-7, m = 8 } = {}) {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (!n || !p) return { beta: new Float64Array(p), loss: NaN, iters: 0, hessDiag: new Float64Array(p) };
  let W = 0;
  for (let i = 0; i < n; i++) W += w[i];
  const wn = Float64Array.from(w, (v) => (v * n) / W);
  const grad = new Float64Array(p);
  const pr = new Float64Array(n);
  const evalAt = (beta) => {
    let loss = 0;
    grad.fill(0);
    for (let i = 0; i < n; i++) {
      const x = X[i];
      let z = off[i];
      for (let j = 0; j < p; j++) z += beta[j] * x[j];
      const pi = sigmoid(z);
      pr[i] = pi;
      const yi = y[i];
      loss -= wn[i] * (yi ? Math.log(Math.max(1e-12, pi)) : Math.log(Math.max(1e-12, 1 - pi)));
      const r = wn[i] * (pi - yi);
      for (let j = 0; j < p; j++) grad[j] += r * x[j];
    }
    for (let j = 0; j < p; j++) {
      loss += (lambda / 2) * beta[j] * beta[j];
      grad[j] += lambda * beta[j];
    }
    return loss;
  };
  let beta = beta0 && beta0.length === p ? Float64Array.from(beta0) : new Float64Array(p);
  let loss = evalAt(beta);
  let g = Float64Array.from(grad);
  const S = [];
  const Y = [];
  const R = [];
  let iters = 0;
  const dir = new Float64Array(p);
  for (; iters < maxIter; iters++) {
    let gn = 0;
    for (let j = 0; j < p; j++) gn += g[j] * g[j];
    if (Math.sqrt(gn) < tol * n) break;
    // (two-loop recursion)
    dir.set(g);
    const alpha = new Array(S.length);
    for (let k = S.length - 1; k >= 0; k--) {
      let sd = 0;
      for (let j = 0; j < p; j++) sd += S[k][j] * dir[j];
      alpha[k] = R[k] * sd;
      for (let j = 0; j < p; j++) dir[j] -= alpha[k] * Y[k][j];
    }
    if (S.length) {
      const k = S.length - 1;
      let sy = 0;
      let yy = 0;
      for (let j = 0; j < p; j++) {
        sy += S[k][j] * Y[k][j];
        yy += Y[k][j] * Y[k][j];
      }
      const gamma = sy / Math.max(1e-12, yy);
      for (let j = 0; j < p; j++) dir[j] *= gamma;
    } else {
      for (let j = 0; j < p; j++) dir[j] /= Math.max(1, n / 4);
    }
    for (let k = 0; k < S.length; k++) {
      let yd = 0;
      for (let j = 0; j < p; j++) yd += Y[k][j] * dir[j];
      const b = R[k] * yd;
      for (let j = 0; j < p; j++) dir[j] += S[k][j] * (alpha[k] - b);
    }
    for (let j = 0; j < p; j++) dir[j] = -dir[j];
    let slope = 0;
    for (let j = 0; j < p; j++) slope += g[j] * dir[j];
    if (slope >= 0) {
      // (not a descent direction: restart from the gradient)
      S.length = Y.length = R.length = 0;
      for (let j = 0; j < p; j++) dir[j] = -g[j] / Math.max(1, n / 4);
      slope = 0;
      for (let j = 0; j < p; j++) slope += g[j] * dir[j];
    }
    // (Armijo backtracking)
    let step = 1;
    let next = null;
    let nextLoss = Infinity;
    for (let tries = 0; tries < 30; tries++) {
      next = Float64Array.from(beta, (b, j) => b + step * dir[j]);
      nextLoss = evalAt(next);
      if (nextLoss <= loss + 1e-4 * step * slope) break;
      step *= 0.5;
    }
    if (!(nextLoss < loss)) {
      evalAt(beta);
      break;
    }
    const s = Float64Array.from(next, (b, j) => b - beta[j]);
    const yv = Float64Array.from(grad, (gj, j) => gj - g[j]);
    let sy = 0;
    for (let j = 0; j < p; j++) sy += s[j] * yv[j];
    if (sy > 1e-12) {
      S.push(s);
      Y.push(yv);
      R.push(1 / sy);
      if (S.length > m) {
        S.shift();
        Y.shift();
        R.shift();
      }
    }
    const improved = loss - nextLoss;
    beta = next;
    loss = nextLoss;
    g = Float64Array.from(grad);
    if (improved < tol) break;
  }
  // (the curvature's diagonal at the fit: each term's standard error, roughly)
  const hessDiag = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    const x = X[i];
    const v = wn[i] * pr[i] * (1 - pr[i]);
    for (let j = 0; j < p; j++) hessDiag[j] += v * x[j] * x[j];
  }
  for (let j = 0; j < p; j++) hessDiag[j] += lambda;
  let pen = 0;
  for (let j = 0; j < p; j++) pen += (lambda / 2) * beta[j] * beta[j];
  return { beta, loss: (loss - pen) / n, iters, hessDiag };
}

// ---- the boosted trees (binned, depth-limited, Newton steps on the logistic loss) ----

// (quantile edges per feature, from the training rows: the thresholds a tree can split at)
export function binEdges(X, bins = 32) {
  const p = X[0]?.length ?? 0;
  const n = X.length;
  const edges = [];
  const sample = n > 20000 ? X.filter((_, i) => i % Math.ceil(n / 20000) === 0) : X;
  for (let j = 0; j < p; j++) {
    const vals = Float64Array.from(sample, (x) => x[j]).sort();
    const e = [];
    for (let b = 1; b < bins; b++) {
      const v = vals[Math.floor((b * vals.length) / bins)];
      if (!e.length || v > e[e.length - 1]) e.push(v);
    }
    edges.push(e);
  }
  return edges;
}
const binOf = (v, e) => {
  let lo = 0;
  let hi = e.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (v > e[mid]) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// Boosted trees on the rows' margin (margin0: logit f plus the logistic's g): trees of depth, each leaf a Newton
// step (lr), a leaf at least minLeaf rows, lambda the leaf penalty. { trees: [{ feat, thr, left, right } | { value }],
// edges, loss }. Predict with treesMargin
export function fitTrees(X, y, w, margin0, { trees = 60, depth = 3, lr = 0.1, minLeaf = 300, bins = 32, lambda = 20, edges = null } = {}) {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  if (!n || !p || !trees) return { trees: [], edges: edges ?? [], loss: NaN };
  edges ??= binEdges(X, bins);
  const B = edges.map((e, j) => Uint8Array.from(X, (x) => binOf(x[j], e)));
  const z = Float64Array.from(margin0);
  const G = new Float64Array(n);
  const H = new Float64Array(n);
  const out = [];
  const idxAll = Uint32Array.from({ length: n }, (_, i) => i);
  const build = (idx, dep) => {
    let g = 0;
    let h = 0;
    for (const i of idx) {
      g += G[i];
      h += H[i];
    }
    const leaf = () => ({ value: (-lr * g) / (h + lambda) });
    if (dep >= depth || idx.length < 2 * minLeaf) return leaf();
    let best = { gain: 0 };
    const base = (g * g) / (h + lambda);
    for (let j = 0; j < p; j++) {
      const nb = edges[j].length + 1;
      if (nb < 2) continue;
      const hg = new Float64Array(nb);
      const hh = new Float64Array(nb);
      const hc = new Uint32Array(nb);
      const bj = B[j];
      for (const i of idx) {
        const b = bj[i];
        hg[b] += G[i];
        hh[b] += H[i];
        hc[b]++;
      }
      let gl = 0;
      let hl = 0;
      let cl = 0;
      for (let b = 0; b < nb - 1; b++) {
        gl += hg[b];
        hl += hh[b];
        cl += hc[b];
        if (cl < minLeaf || idx.length - cl < minLeaf) continue;
        const gain = (gl * gl) / (hl + lambda) + ((g - gl) * (g - gl)) / (h - hl + lambda) - base;
        if (gain > best.gain) best = { gain, feat: j, bin: b };
      }
    }
    if (!(best.gain > 1e-9)) return leaf();
    const L = [];
    const Rr = [];
    const bj = B[best.feat];
    for (const i of idx) (bj[i] <= best.bin ? L : Rr).push(i);
    return { feat: best.feat, thr: edges[best.feat][best.bin], left: build(Uint32Array.from(L), dep + 1), right: build(Uint32Array.from(Rr), dep + 1) };
  };
  const walk = (node, x) => (node.value !== undefined ? node.value : x[node.feat] <= node.thr ? walk(node.left, x) : walk(node.right, x));
  for (let t = 0; t < trees; t++) {
    for (let i = 0; i < n; i++) {
      const pi = sigmoid(z[i]);
      G[i] = w[i] * (pi - y[i]);
      H[i] = Math.max(1e-6, w[i] * pi * (1 - pi));
    }
    const tree = build(idxAll, 0);
    out.push(tree);
    for (let i = 0; i < n; i++) z[i] += walk(tree, X[i]);
  }
  let loss = 0;
  let W = 0;
  for (let i = 0; i < n; i++) {
    loss += w[i] * binLoss(sigmoid(z[i]), y[i]);
    W += w[i];
  }
  return { trees: out, edges, loss: loss / W };
}
export function treesMargin(model, x) {
  if (!model?.trees?.length) return 0;
  const walk = (node) => (node.value !== undefined ? node.value : x[node.feat] <= node.thr ? walk(node.left) : walk(node.right));
  let s = 0;
  for (const t of model.trees) s += walk(t);
  return s;
}

// ---- a kind's model (props or lines) ----

// Rows of one kind to a fitted part: { spec, mu, sd, beta, se, lambda, n, trees? }. holdout: the newest months'
// rows judged for the penalty (the one-SE rule toward more shrinkage); none, the middle penalty. beta0 by name
// warm-starts the fit
export function fitPart(rows, run, { lambdas = LAMBDAS, holdoutMonths = HOLDOUT_MONTHS, prev = null, trees = 0, treeOpts = {}, weightOf = null } = {}) {
  const feats = rows.map((x) => features(x, runAt(run, x.at ?? x.t)));
  const spec = specOf(feats);
  const { X, mu, sd } = design(feats, spec);
  const y = Float64Array.from(rows, (x) => x.y);
  const w = Float64Array.from(rows, (x) => {
    const v = weightOf ? weightOf(x) : x.w;
    return fin(v) && v > 0 ? v : 1;
  });
  const off = Float64Array.from(rows, (x) => logit(x.f));
  const warm = prev?.spec ? Float64Array.from(spec, (k) => prev.beta[prev.spec.indexOf(k)] ?? 0) : null;
  // (the penalty: fit on the rows before the newest holdout months, judged on them, paired row by row)
  const months = [...new Set(rows.map((x) => monthKey(x.t)))].sort();
  const cut = months.length > holdoutMonths + 2 ? months[months.length - holdoutMonths] : null;
  let lambda = lambdas[Math.floor(lambdas.length / 2)];
  let tuned = null;
  if (cut) {
    const fitIdx = [];
    const outIdx = [];
    rows.forEach((x, i) => (monthKey(x.t) < cut ? fitIdx : outIdx).push(i));
    if (fitIdx.length >= RESID_MIN / 2 && outIdx.length >= 100) {
      const Xf = fitIdx.map((i) => X[i]);
      const yf = Float64Array.from(fitIdx, (i) => y[i]);
      const wf = Float64Array.from(fitIdx, (i) => w[i]);
      const of = Float64Array.from(fitIdx, (i) => off[i]);
      const losses = lambdas.map((lam) => {
        const f = fitLogit(Xf, yf, wf, of, { lambda: lam, beta0: warm });
        return outIdx.map((i) => {
          let z = off[i];
          for (let j = 0; j < spec.length; j++) z += f.beta[j] * X[i][j];
          return w[i] * binLoss(sigmoid(z), y[i]);
        });
      });
      const pick = oneSe(losses);
      lambda = lambdas[pick.index];
      tuned = { cut, n: outIdx.length, losses: losses.map((l) => r6(l.reduce((s, v) => s + v, 0) / l.length)), pick: pick.index };
    }
  }
  const fit = fitLogit(X, y, w, off, { lambda, beta0: warm });
  const se = Array.from(fit.hessDiag, (h) => (h > 0 ? 1 / Math.sqrt(h) : 0));
  const part = { spec, mu: mu.map(r6), sd: sd.map(r6), beta: Array.from(fit.beta, r6), se: se.map(r6), lambda, n: rows.length, loss: r6(fit.loss), iters: fit.iters, tuned };
  if (trees > 0) {
    const margin = Float64Array.from(rows, (x, i) => {
      let z = off[i];
      for (let j = 0; j < spec.length; j++) z += fit.beta[j] * X[i][j];
      return z;
    });
    const tr = fitTrees(X, y, w, margin, { trees, ...treeOpts });
    part.trees = { trees: tr.trees, edges: tr.edges, loss: r6(tr.loss) };
  }
  return part;
}

// (the one-standard-error rule, as correct.mjs: among candidates' per-row losses (paired), the most shrunk (first)
// within one SE of the best)
export function oneSe(lossLists) {
  const means = lossLists.map((l) => l.reduce((s, v) => s + v, 0) / Math.max(1, l.length));
  let best = 0;
  for (let i = 1; i < means.length; i++) if (means[i] < means[best]) best = i;
  const n = lossLists[best].length;
  for (let i = 0; i < lossLists.length; i++) {
    if (i === best) break;
    let s = 0;
    for (let k = 0; k < n; k++) s += (lossLists[i][k] - lossLists[best][k]) ** 2;
    const se = Math.sqrt(Math.max(0, s / n - ((means[i] - means[best]) ** 2)) / n);
    if (means[i] - means[best] <= se) return { index: i, best, means };
  }
  return { index: best, best, means };
}

// (a term about the Bot's lean: d and its interactions; the rest are the Book's own shade)
export const isLeanTerm = (name) => name === 'd' || name === 'dAbs' || name.startsWith('d*');

// A part's shift g and its standard error for a row: { g, se, lean (the lean terms' share of g), shade (the rest) }.
// leanOnly: the lean terms alone (the decomposition's variant; the trees stage left out)
export function partShift(part, row, run, { leanOnly = false } = {}) {
  if (!part?.spec) return null;
  const x = features(row, run);
  let g = 0;
  let lean = 0;
  let v = 0;
  const vec = new Float64Array(part.spec.length);
  for (let j = 0; j < part.spec.length; j++) {
    const z = j === 0 ? 1 : ((x[part.spec[j]] ?? 0) - part.mu[j]) / part.sd[j];
    vec[j] = z;
    const term = part.beta[j] * z;
    const isLean = isLeanTerm(part.spec[j]);
    if (isLean) lean += term;
    if (leanOnly && !isLean) continue;
    g += term;
    v += z * z * part.se[j] * part.se[j];
  }
  if (!leanOnly && part.trees?.trees?.length) g += treesMargin(part.trees, vec);
  return { g, se: Math.sqrt(v), lean, shade: g - lean };
}

// ---- the walk-forward snapshots ----

// Rows of a sport (both kinds) to monthly snapshots: each month's fit on the rows settled before its start, from
// the first month with RESID_MIN settled rows of the kind. Each snapshot { cutoff, parts: { props, lines }, run (the
// reads frozen for the month, as a plain object), blend: { props, lines } }. opts.every: fit every n-th month
// (the others reuse the last fit: the penalty search is the cost), opts.trees for the trees stage, opts.months a
// list to restrict to. The blend's weight per kind is fit on each snapshot's own held-out months (blendFit)
export function fitWalk(rows, { sport = null, every = 1, trees = 0, treeOpts = {}, log = () => {}, months: only = null, pcur = (x) => x.pcur } = {}) {
  const run = runningStats(rows);
  const settled = rows.filter((x) => (x.y === 0 || x.y === 1) && fin(x.t) && fin(x.f) && fin(x.raw)).sort((a, b) => a.t - b.t);
  const months = [...new Set(settled.map((x) => monthKey(x.t + SETTLE_MS)))].sort();
  const snaps = [];
  let prev = { props: null, lines: null };
  let blend = { props: BLEND_START, lines: BLEND_START };
  let k = 0;
  const lastKey = months[months.length - 1];
  for (let m = nextMonth(months[0]); m <= nextMonth(lastKey); m = nextMonth(m)) {
    if (only && !only.includes(m)) continue;
    const start = monthStart(m);
    // (recency as the gate weighs it, relative to the snapshot's own latest season, never today's: halving a
    // season back, a tenth outside the rule era (gate-score.mjs seasonWeight))
    const before = settled.filter((x) => x.t + SETTLE_MS < start);
    let cur = null;
    for (const x of before) if (fin(x.season) && (cur === null || x.season > cur)) cur = x.season;
    const weightOf = (x) => (sport && fin(cur) && fin(x.season) ? Math.max(0.02, seasonWeight(sport, x.season, cur).w) : 1);
    const parts = {};
    let any = false;
    for (const kind of ['props', 'lines']) {
      const mine = before.filter((x) => kindOf(x) === kind);
      if (mine.length < RESID_MIN) continue;
      if (prev[kind] && k % every !== 0) parts[kind] = prev[kind];
      else {
        const t0 = Date.now();
        parts[kind] = fitPart(mine, run, { prev: prev[kind], trees, treeOpts, weightOf });
        log(`${m} ${kind}: ${mine.length} rows, lambda ${parts[kind].lambda}, ${parts[kind].iters} iters, ${Date.now() - t0}ms`);
      }
      any = true;
    }
    if (!any) continue;
    // (the blend's weight: the newest BLEND_MONTHS months before the cutoff, each row priced by the snapshot current
    // at its moment (walk-forward, never one that saw it): an honest read of how the corrected chance did against
    // the current price)
    if (snaps.length) {
      let lo = m;
      for (let i = 0; i < BLEND_MONTHS; i++) lo = prevMonth(lo);
      const cutLo = monthStart(lo);
      const soFar = { v: MODEL_V, snapshots: snaps };
      const held = before.filter((x) => x.t >= cutLo && fin(pcur(x)));
      for (const kind of ['props', 'lines']) {
        const mine = held.filter((x) => kindOf(x) === kind);
        if (mine.length < 100) continue;
        const pres = new Map(mine.map((x) => [x, residualChance(soFar, x, pcur(x))?.pRes]));
        const scored = mine.filter((x) => fin(pres.get(x)));
        if (scored.length < 100) continue;
        blend = { ...blend, [kind]: blendFit(scored, (x) => pres.get(x), pcur, blend[kind]).weight };
      }
    }
    // (to: the latest moment this snapshot learned from, the newest training row's settle; a row may read it only
    // from that moment on (snapshotFor), so the live desk reads the newest fit and the replay never a fit that saw
    // the row)
    let to = 0;
    for (const x of before) if (x.t + SETTLE_MS > to) to = x.t + SETTLE_MS;
    const snap = { cutoff: m, to, n: before.length, parts, run: Object.fromEntries([...(runAt(run, start) ?? new Map())]), blend: { ...blend } };
    snaps.push(snap);
    prev = { props: parts.props ?? prev.props, lines: parts.lines ?? prev.lines };
    k++;
  }
  return { v: MODEL_V, snapshots: snaps };
}

// (the newest snapshot that learned from nothing settled after the bet's moment (its to at or before at): a row is
// never priced by a fit that saw it, and the live desk reads the newest fit)
export function snapshotFor(model, at) {
  if (!model?.snapshots?.length || !fin(at)) return null;
  let best = null;
  for (const s of model.snapshots) {
    const to = fin(s.to) ? s.to : monthStart(s.cutoff);
    if (to <= at && (!best || to > (fin(best.to) ? best.to : monthStart(best.cutoff)))) best = s;
  }
  return best;
}

// The blend's weight on the corrected chance: the grid 0 to 1 by 0.1 with the lowest held-out loss (the rows
// weighted as given), stepped at most BLEND_STEP from the previous weight (soft, D8: the evidence moves it, never
// flips it). { weight, target, losses }
export function blendFit(rows, pResOf, pCurOf, previous = BLEND_START) {
  const grid = Array.from({ length: 11 }, (_, i) => i / 10);
  const losses = grid.map((lam) => {
    let s = 0;
    let W = 0;
    for (const x of rows) {
      const pr = pResOf(x);
      const pc = pCurOf(x);
      if (!fin(pr) || !fin(pc)) continue;
      const w = fin(x.w) && x.w > 0 ? x.w : 1;
      s += w * binLoss(sigmoid(logit(pc) + lam * (logit(pr) - logit(pc))), x.y);
      W += w;
    }
    return W ? s / W : Infinity;
  });
  let best = 0;
  for (let i = 1; i < grid.length; i++) if (losses[i] < losses[best]) best = i;
  const target = grid[best];
  const weight = Math.max(0, Math.min(1, previous + Math.max(-BLEND_STEP, Math.min(BLEND_STEP, target - previous))));
  return { weight: Math.round(weight * 100) / 100, target, losses: losses.map(r6) };
}

// (the current price and the corrected one blended on the logit scale; a weight of 0 the current price, 1 the
// corrected chance)
export const blendChance = (pCur, pRes, weight) => clip(sigmoid(logit(pCur) + weight * (logit(pRes) - logit(pCur))), 0.001, 0.999);

// A row priced by the model at its bet's moment: { p (the blend the desk uses), pRes (the corrected chance), g (the
// learned shift in logits), se, conf (0 to 1: how sure the shift is, two-sided), noEdge (the corrected chance clears
// neither of the Book's prices), weight (the blend's), cutoff }, or null where the model has no snapshot for the
// row yet (the current price stands). pCur: the current price (desk.mjs chanceAt's) to blend with
export function residualChance(model, row, pCur, opts = {}) {
  const snap = snapshotFor(model, row.at ?? row.t);
  if (!snap) return null;
  const part = snap.parts?.[kindOf(row)];
  if (!part) return null;
  const run = snap.run ? new Map(Object.entries(snap.run)) : null;
  const s = partShift(part, row, run, opts);
  if (!s || !fin(s.g)) return null;
  const pRes = clip(sigmoid(logit(row.f) + s.g), 0.001, 0.999);
  const weight = fin(snap.blend?.[kindOf(row)]) ? snap.blend[kindOf(row)] : BLEND_START;
  const p = fin(pCur) ? blendChance(pCur, pRes, weight) : pRes;
  const z = s.se > 0 ? Math.abs(s.g) / s.se : 0;
  const conf = Math.round((2 * Phi(z) - 1) * 1000) / 1000;
  const po = implied(row.overOdds);
  const pu = implied(row.underOdds);
  const noEdge = fin(po) && fin(pu) ? pRes <= po && 1 - pRes <= pu : Math.abs(pRes - row.f) < 0.02;
  return { p, pRes, g: s.g, lean: s.lean, shade: s.shade, se: s.se, conf, noEdge, weight, cutoff: snap.cutoff };
}
export function Phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? p : 1 - p;
}

// The model's top features by their standardized weight (|beta|, the intercept aside) in a part: [{ name, beta }]
export function topFeatures(part, n = 8) {
  if (!part?.spec) return [];
  return part.spec
    .map((name, j) => ({ name, beta: r4(part.beta[j]), z: part.se[j] > 0 ? r4(part.beta[j] / part.se[j]) : null }))
    .filter((x) => x.name !== 'one')
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
    .slice(0, n);
}

// ---- the hold-out guard (a bad refit can't ship) ----

// The new walk-forward's held-out months against the shipped file's record of the same months (each { n, resid,
// book } per kind: the mean log loss), a kind at a time: a kind is refused where its corrected chance is worse than
// the Book by GUARD_TOL a row over the newest months (it then ships at the current price: its blend held at 0,
// heldKinds), or worse than the shipped file's on most shared months and in total. The file is refused outright when
// every kind is. { ok, why, kinds: { props: { ok, why }, lines: { ok, why } }, heldKinds }
export const GUARD_TOL = 0.0015;
export function guardOk(oos, prevOos, { months = HOLDOUT_MONTHS } = {}) {
  const keys = Object.keys(oos ?? {}).sort();
  if (!keys.length) return { ok: false, why: 'no held-out months', kinds: {}, heldKinds: [] };
  const newest = keys.slice(-months);
  const kinds = {};
  for (const kind of ['props', 'lines']) {
    let resid = 0;
    let book = 0;
    let n = 0;
    for (const m of newest) {
      const x = oos[m]?.[kind];
      if (!x?.n) continue;
      resid += x.resid * x.n;
      book += x.book * x.n;
      n += x.n;
    }
    if (!n) {
      kinds[kind] = { ok: false, why: 'no held-out rows' };
      continue;
    }
    if (n >= 500 && resid / n > book / n + GUARD_TOL) {
      kinds[kind] = { ok: false, why: 'worse than the Book on the newest ' + newest.length + ' months (' + r4(resid / n) + ' against ' + r4(book / n) + ')' };
      continue;
    }
    let shared = 0;
    let worse = 0;
    let sumNew = 0;
    let sumOld = 0;
    for (const m of keys) {
      const a = oos[m]?.[kind];
      const b = prevOos?.[m]?.[kind];
      if (!a?.n || !b?.n) continue;
      shared++;
      if (a.resid > b.resid) worse++;
      sumNew += a.resid * a.n;
      sumOld += b.resid * b.n;
    }
    if (shared >= 4 && worse > shared / 2 && sumNew > sumOld) kinds[kind] = { ok: false, why: 'worse than the shipped model on ' + worse + ' of ' + shared + ' shared months and in total' };
    else kinds[kind] = { ok: true, why: !prevOos ? 'no earlier record' : shared ? 'no worse than the shipped model (' + worse + ' of ' + shared + ' shared months worse)' : 'no shared months' };
  }
  const heldKinds = Object.entries(kinds).filter(([, v]) => !v.ok).map(([k]) => k);
  const ok = Object.values(kinds).some((v) => v.ok);
  return { ok, why: Object.entries(kinds).map(([k, v]) => k + ': ' + (v.ok ? 'ok' : 'held at the current price') + ' (' + v.why + ')').join('; '), kinds, heldKinds };
}

// ---- the files (the desk reads them) ----

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const modelFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/residual.json');
const loaded = new Map();
// (a sport's shipped model, read once; null where there is none or it can't be read)
export function loadModel(sport, root = ROOT) {
  const key = `${root}|${sport}`;
  if (loaded.has(key)) return loaded.get(key);
  let m = null;
  try {
    const f = modelFile(sport, root);
    if (existsSync(f)) m = JSON.parse(readFileSync(f, 'utf8'));
    if (m && m.v !== MODEL_V) m = null;
  } catch {
    m = null;
  }
  loaded.set(key, m);
  return m;
}
export const forgetModels = () => loaded.clear();

// The desk's hook (desk.mjs chanceAt with a ctx): the blended chance for a row, or null where the flag is off, the
// ctx lacks what the features need, or the sport has no snapshot yet. ctx: { sport, market, stat, line, side, f,
// raw, overOdds, underOdds, t (start ms), at (the bet's moment ms; now where live), fo?, home?, kind?, hours?,
// phase? }. f, raw, fo and pCur are the side's chances (side 'under' or 'away' is read as its over's mirror and the
// answer mirrored back); the odds are always the over's and the under's. Never throws
export function hookChance(ctx, pCur, { on = residOn, model = null } = {}) {
  try {
    if (!on() || !ctx || !ctx.sport || !fin(ctx.f) || !fin(ctx.raw)) return null;
    const m = model ?? loadModel(ctx.sport);
    if (!m) return null;
    const flip = ctx.side === 'under' || ctx.side === 'away';
    const row = { ...ctx, market: ctx.market ?? 'prop', at: fin(ctx.at) ? ctx.at : Date.now(), f: flip ? 1 - ctx.f : ctx.f, raw: flip ? 1 - ctx.raw : ctx.raw, fo: flip && fin(ctx.fo) ? 1 - ctx.fo : ctx.fo };
    const r = residualChance(m, row, flip && fin(pCur) ? 1 - pCur : pCur);
    if (!r || !fin(r.p)) return null;
    return flip ? { ...r, p: 1 - r.p, pRes: 1 - r.pRes, g: -r.g, lean: -r.lean, shade: -r.shade } : r;
  } catch {
    return null;
  }
}
