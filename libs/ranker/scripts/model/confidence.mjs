// The confidence layer (the owner, 2026-10-19: "the confidence algo is arguably as important as the pick algo, and
// merging them is the beauty of our app and where our edge will be"). The pick algorithm says which side has an
// edge at the price (desk.mjs chanceAt's p, the trust and the residual blend); this layer says how much to believe
// that pick, from what the Bot knows the moment it places it, and sets the band and the stake from that belief
// rather than from the raw size of the edge. The evidence that asked for it (scratchpad confidence, BANDS.md): over
// the whole priced history, at the close, the rows today's bands call LOVE and LOCK do no better than LIKE, and LOCK's
// log loss is worse than the Book's in every sport (the biggest edges are the Bot's overconfidence, not its edge).
//
//   pick      a priced row read on the Bot's side (pickOf): the side with the larger expected return at the priced
//             chance p; its chance pS, the Book's no-vig fS, the price, the edge in points (pS - fS), the stake's
//             Kelly (desk.mjs stakeKelly), the result y (the side won) and, at an open, whether it beat the close
//   features  features(): what the Bot knows at placement, nothing after. The edge's size (points, the Kelly, its
//             square), where the lean came from (the Bot's own number against the Book in logits dRaw, the anchor's
//             pull dAnch (D33), what the trust kept dTrust (D17), the residual model's move dRes (D32)), the price
//             band and the favorite side, the vig, the side (over or home), the hours before the start and whether
//             it is the close, the trust, home, a prop's edge in standard deviations of its projection (sdEdge) and
//             its gap to the Book's implied mean (imGap), the Bot's recent per-stat accuracy and the Book's recent
//             over-shade (residual.mjs runningStats, frozen a month at a time), the stat or market and a prop's line
//             bucket, each with its own slope on the edge. Only what the live desk has the same way: the move to
//             date and the player's games were tried and left out (the desk can't supply them as the history does)
//   model     logit P(the pick wins) = logit(pS) + the core (the intercept and a slope on the priced lean, lightly
//             penalized: how much of the priced edge the picks keep) + beta . x: a ridge logistic regression on the
//             features with the priced chance as the offset (OFFSET 'p': the pick algorithm's chance stands until
//             the record says how much of its edge to give back), its penalty by the one-SE rule with nothing on top
//             as a candidate (so with nothing to learn it adds nothing: measured 2026-10-19, it adds nothing in any
//             sport), fit walk-forward in
//             snapshots every EVERY_MONTHS months, each on the rows settled before its cutoff (SETTLE_MS after the
//             start), recency-weighted by season (gate-score.mjs seasonWeight relative to the snapshot's own latest
//             season), the penalty picked on the newest HOLDOUT_MONTHS by the one-standard-error rule toward more
//             shrinkage. A pick is scored by the newest snapshot whose `to` (the newest moment it learned from) is
//             at or before the bet's moment (snapshotFor): no look-ahead, pinned in tests/model-confidence.test.mjs
//             with a planted leak. A second part (beat) does the same for the close: P(the pick beats the close),
//             fit on the opens
//   output    qualityOf(): pc the calibrated chance the pick wins, q its quality (the stake's Kelly at pc: the
//             calibrated edge), pb the chance it beats the close, cap the band it may reach (tiersOf), cutoff
//   bands     LIKE is any positive edge at the priced chance, as before (the Bot bets from any edge, D21). LOVE and
//             LOCK are earned: a tier opens only where, held out over the priced history, the picks at or above its
//             bar on q made a better flat return than the picks under it beyond noise (a clustered bootstrap by
//             game) and beat the close more often (fitTiers). The owner's Kelly bands (BANDS: LOVE at 2%, LOCK at 5%
//             with a 55% chance) stay as FLOORS: never a LOVE under 2% (picks.mjs levelOf); a tier not earned caps
//             the band under it (capOf: 'medium' a LIKE at most, 'high' a LOVE at most), on the bet (picks.mjs capOf)
//             and on every board side (board.mjs). No tier earned: a two-band world (LIKE and the practice picks)
//             until the record earns one, self-tuning upward at each gate record
//   stakes    unitsOf(): Kelly on the calibrated chance (desk.mjs stakeFor at pc's expected return, the shrinkage
//             the ridge's), the practice stake (PRACTICE_UNITS) where the calibrated chance clears no edge at the
//             price (the pick is still placed: a LIKE at the practice stake, D1). Every other cap on a stake stands
//   the file  apps/<sport>/src/StaticData/model/confidence.json, written by gate.mjs --record (a shipped version) from
//             the priced history as the version priced it, never by the desk (the desk reads it: run.mjs). A sport
//             without one (MMA) keeps the Kelly bands and stakes as they were
//   loops     fit only by the gate's record on the history (tens of thousands of rows, walk-forward), never on the
//             ledger; it reads p and never moves it (the trust, the calibration, the correction, the residual and
//             the anchor are upstream and read nothing back from it); the practice picks, CHECKs and research read p
//             as before; a cap or a stake here never turns a kind of bet off (D1)

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { seasonWeight } from './gate-score.mjs';
import { SETTLE_MS, binLoss, clip, fitLogit, implied, lineBucket, logit, monthKey, monthStart, oneSe, runAt, runningStats, sigmoid, specOf } from './residual.mjs';
import { PRACTICE_UNITS, decimal, stakeFor, stakeKelly } from './desk.mjs';

export const CONF_V = 1;
// (picks a sport's first snapshot needs (the bets alone, FIT_ON: a season or two of them); under it a pick has no
// quality: the Kelly bands and stakes as before)
export const CONF_MIN = 1000;
// (the picks the fit reads: 'bets' the rows with a positive edge at the price (the picks the bands are about), 'edge'
// every row the Bot leans on, 'all' every row; and the weight of a bet among the rest)
export const FIT_ON = 'bets';
export const BET_WEIGHT = 1;
// (the win part's prior: 'p' the priced chance is right (the pick algorithm's chance stands until the record says how
// much of its edge to give back; no evidence, no change), 'f' the Book is right (the pick a coin at the price))
export const OFFSET = 'p';
const offsetOf = (k, offset) => (offset === 'p' ? logit(k.pS) : offset === 'f' ? logit(k.fS) : 0);
// (the penalties tried, most shrunk first, in rows: a standardized term keeps about n / (n + 4 lambda) of its fit)
export const LAMBDAS = [30000, 10000, 3000, 1000, 300];
export const HOLDOUT_MONTHS = 3;
export const EVERY_MONTHS = 3;
export const D_CAP = 2.5;
// (a tier's bar on q is picked from this grid; it needs TIER_MIN picks at or over the bar, held out)
export const TIER_GRID = [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08];
export const TIER_MIN = 200;
// (the closing-line route's rows: the opens at or over the bar it needs, and the lead on LIKE's beat-the-close share)
export const CLV_MIN = 300;
export const CLV_LEAD = 0.05;
// (the blend of the calibrated chance into the priced one: starts at the priced chance (no evidence, no weight), moves
// by evidence alone: at most BLEND_STEP a record, up or down, and only on BLEND_NEW graded bets since the last record's
// (its `through`); the same data recorded again leaves it where it is)
export const BLEND_START = 0;
export const BLEND_STEP = 0.25;
export const BLEND_MONTHS = 12;
export const BLEND_NEW = 100;
export const BOOT = 400;
const fin = Number.isFinite;
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const r6 = (v) => (fin(v) ? Math.round(v * 1e6) / 1e6 : null);
const nextMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const addMonths = (key, n) => {
  let k = key;
  for (let i = 0; i < n; i++) k = nextMonth(k);
  return k;
};
export const kindOf = (row) => (row.market === 'prop' ? 'props' : 'lines');

// ---- the pick: a row on the Bot's side ----

// A priced row in the over frame ({ market, stat, line, f, raw, anch?, pCur?, p, overOdds, underOdds, t, at?, kind?,
// fo?, home?, trust?, mu?, sd?, im?, games?, y?, q?, season?, w?, event, sport }) read on the Bot's side: the side
// with the larger expected return at p (over or home on a tie). side given ('over' | 'under' | 'home' | 'away')
// reads that side instead (the live desk's bet). Null without a chance or both prices
export function pickOf(row, side = null) {
  if (!fin(row?.p) || !fin(row?.f) || !row.overOdds || !row.underOdds) return null;
  const evA = row.p * decimal(row.overOdds) - 1;
  const evB = (1 - row.p) * decimal(row.underOdds) - 1;
  const a = side ? side === 'over' || side === 'home' : evA >= evB;
  const flip = (v) => (fin(v) ? (a ? v : 1 - v) : null);
  const pS = flip(row.p);
  const fS = flip(row.f);
  const price = a ? row.overOdds : row.underOdds;
  const other = a ? row.underOdds : row.overOdds;
  const pCur = fin(row.pCur) ? flip(row.pCur) : pS;
  const raw = fin(row.raw) ? flip(row.raw) : fS;
  const anch = fin(row.anch) ? flip(row.anch) : raw;
  const y = row.y === 1 || row.y === 0 ? ((row.y === 1) === a ? 1 : 0) : null;
  const qS = fin(row.q) ? flip(row.q) : null;
  return {
    row,
    a,
    side: side ?? (a ? 'over' : 'under'),
    pS,
    fS,
    rawS: raw,
    anchS: anch,
    pCurS: pCur,
    price,
    other,
    ev: a ? evA : evB,
    edge: pS - fS,
    kelly: stakeKelly(price, pS),
    y,
    beat: qS === null ? null : qS > fS ? 1 : qS < fS ? 0 : null,
    clv: qS === null ? null : qS - fS,
  };
}

// ---- the features ----

// (a pick's features as of its bet's moment; run: the frozen running reads for its month (residual.mjs runAt), keyed
// as the residual keys them (props|<stat>, lines|<market>), in the over frame: the Bot's recent accuracy b is the
// same on either side, the Book's over-shade is read on the pick's side)
export function features(k, run = null) {
  const x = k.row;
  const lf = logit(k.fS);
  const d = Math.max(-D_CAP, Math.min(D_CAP, logit(k.rawS) - lf));
  const dAnch = Math.max(-D_CAP, Math.min(D_CAP, logit(k.anchS) - logit(k.rawS)));
  const dTrust = Math.max(-D_CAP, Math.min(D_CAP, logit(k.pCurS) - lf));
  const dRes = Math.max(-D_CAP, Math.min(D_CAP, logit(k.pS) - logit(k.pCurS)));
  const po = implied(x.overOdds);
  const pu = implied(x.underOdds);
  const vig = fin(po) && fin(pu) ? po + pu - 1 : 0.045;
  const late = x.kind === 'c' ? 1 : x.kind === 'o' ? 0 : fin(x.hours) ? (x.hours <= 6 ? 1 : 0) : 0;
  const hours = fin(x.hours) ? x.hours : fin(x.at) && fin(x.t) ? (x.t - x.at) / 36e5 : late ? 1 : 24;
  const lhours = Math.log1p(Math.max(0, Math.min(240, hours)));
  const home = x.market === 'prop' ? (x.home === true ? 1 : x.home === false ? -1 : 0) : x.market === 'total' ? 0 : k.a ? 1 : -1;
  const prop = x.market === 'prop';
  const sdEdge = prop && fin(x.mu) && fin(x.sd) && x.sd > 0 && fin(x.line) ? Math.max(-3, Math.min(3, ((k.a ? 1 : -1) * (x.mu - x.line)) / x.sd)) : 0;
  const imGap = prop && fin(x.mu) && fin(x.sd) && x.sd > 0 && fin(x.im) && x.im > 0 ? Math.max(-3, Math.min(3, ((k.a ? 1 : -1) * (x.mu - x.im)) / x.sd)) : 0;
  const key = `${kindOf(x)}|${x.stat ?? x.market}`;
  const rs = run?.get(key) ?? null;
  const b = rs ? Math.max(-1, Math.min(2, rs.b ?? 0)) : 0;
  const shade = rs ? Math.max(-0.1, Math.min(0.1, rs.shade ?? 0)) * (k.a ? 1 : -1) : 0;
  const trust = fin(x.trust) ? Math.max(0, Math.min(1, x.trust)) : 0.5;
  const e = k.edge;
  const f = {
    one: 1,
    edge: e,
    edge2: e * Math.abs(e),
    kelly: k.kelly,
    dRaw: d,
    dAnch,
    dTrust,
    dRes,
    lf,
    fav: k.fS >= 0.5 ? 1 : 0,
    vig: vig - 0.045,
    over: k.a ? 1 : 0,
    'edge*over': e * (k.a ? 1 : 0),
    late,
    lhours,
    'edge*late': e * late,
    trust,
    'edge*trust': e * trust,
    home,
    sdEdge,
    imGap,
    runB: b,
    'edge*runB': e * b,
    runShade: shade,
  };
  if (prop) {
    f[`stat:${x.stat}`] = 1;
    f[`edge*stat:${x.stat}`] = e;
    const bucket = lineBucket(x.line);
    if (bucket !== 'high') {
      f[`bucket:${bucket}`] = 1;
      f[`edge*bucket:${bucket}`] = e;
    }
  } else {
    f[`market:${x.market}`] = 1;
    f[`edge*market:${x.market}`] = e;
  }
  return f;
}

// ---- the fit ----

// (a feature standardized by the training set's mean and spread, held to Z_CAP either way: a near-constant feature in
// a small training set (its spread a few hundredths) would otherwise put a later row on its rare side twenty
// spreads out, and one small weight would swing the chance by whole logits)
export const Z_CAP = 4;
const zOf = (v, mu, sd) => Math.max(-Z_CAP, Math.min(Z_CAP, ((fin(v) ? v : 0) - mu) / sd));
function designOf(featureRows, spec) {
  const p = spec.length;
  const n = featureRows.length;
  const mu = new Array(p).fill(0);
  const sd = new Array(p).fill(1);
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
  const X = featureRows.map((x) => {
    const v = new Float64Array(p);
    v[0] = 1;
    for (let j = 1; j < p; j++) v[j] = zOf(x[spec[j]], mu[j], sd[j]);
    return v;
  });
  return { X, mu, sd };
}

// (the core of a part: the priced lean dP = logit(pS) - logit(fS), what the pick algorithm added to the Book's chance)
export const dPOf = (k) => Math.max(-D_CAP, Math.min(D_CAP, logit(k.pS) - logit(k.fS)));
// (the core's penalty, in rows, on its two terms (the intercept and the slope on dP): light, so a few thousand picks
// say how much of the priced edge survives on the picks themselves)
export const CORE_LAMBDA = 30;

// (one part, in two stages. The core: a logistic on the intercept and the priced lean dP alone, offset at the prior
// (OFFSET: the priced chance), lightly penalized: it learns how much of the priced edge the picks keep (a slope
// under 0 on the offset 'p' gives part of it back toward the Book; an intercept under 0 says the picks as a whole
// win less than priced). The rest: the ridge logistic on every feature, offset at the core's margin, its penalty by
// the one-SE rule on the newest holdout months toward more shrinkage, so with nothing to learn it adds nothing)
function fitPart(picks, run, yOf, wOf, { lambdas = LAMBDAS, holdoutMonths = HOLDOUT_MONTHS, prev = null, min = CONF_MIN, offset = OFFSET } = {}) {
  const rows = picks.filter((k) => yOf(k) === 0 || yOf(k) === 1);
  if (!rows.length) return null;
  const y = Float64Array.from(rows, (k) => yOf(k));
  const w = Float64Array.from(rows, (k) => {
    const v = wOf(k);
    return fin(v) && v > 0 ? v : 1;
  });
  const off0 = Float64Array.from(rows, (k) => offsetOf(k, offset));
  // (the core)
  const Xc = rows.map((k) => Float64Array.from([1, dPOf(k)]));
  const coreFit = fitLogit(Xc, y, w, off0, { lambda: CORE_LAMBDA, beta0: prev?.core ? Float64Array.from(prev.core.beta) : null });
  const core = { beta: Array.from(coreFit.beta, r6), se: Array.from(coreFit.hessDiag, (h) => r6(h > 0 ? 1 / Math.sqrt(h) : 0)) };
  const off = Float64Array.from(rows, (k, i) => off0[i] + coreFit.beta[0] + coreFit.beta[1] * Xc[i][1]);
  // (the rest)
  const feats = rows.map((k) => features(k, runAt(run, k.row.at ?? k.row.t)));
  const spec = specOf(feats);
  const { X, mu, sd } = designOf(feats, spec);
  const warm = prev?.spec ? Float64Array.from(spec, (name) => prev.beta[prev.spec.indexOf(name)] ?? 0) : null;
  const months = [...new Set(rows.map((k) => monthKey(k.row.t)))].sort();
  const cut = months.length > holdoutMonths + 2 ? months[months.length - holdoutMonths] : null;
  let lambda = lambdas[0];
  let tuned = null;
  if (cut) {
    const fitIdx = [];
    const outIdx = [];
    rows.forEach((k, i) => (monthKey(k.row.t) < cut ? fitIdx : outIdx).push(i));
    if (fitIdx.length >= min / 2 && outIdx.length >= 100) {
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
      // (the core alone as a candidate too: the rest is kept only where it beats nothing-on-top by the same rule)
      const none = outIdx.map((i) => w[i] * binLoss(sigmoid(off[i]), y[i]));
      const pick = oneSe([none, ...losses]);
      lambda = pick.index === 0 ? null : lambdas[pick.index - 1];
      tuned = { cut, n: outIdx.length, none: r6(none.reduce((s, v) => s + v, 0) / none.length), losses: losses.map((l) => r6(l.reduce((s, v) => s + v, 0) / l.length)), pick: pick.index - 1 };
    }
  }
  const fit = lambda === null ? null : fitLogit(X, y, w, off, { lambda, beta0: warm });
  const se = fit ? Array.from(fit.hessDiag, (h) => (h > 0 ? 1 / Math.sqrt(h) : 0)) : spec.map(() => 0);
  return { offset, core, spec, mu: mu.map(r6), sd: sd.map(r6), beta: fit ? Array.from(fit.beta, r6) : spec.map(() => 0), se: se.map(r6), lambda, n: rows.length, loss: r6(fit ? fit.loss : coreFit.loss), iters: fit?.iters ?? 0, tuned };
}

// (a part's shift for a pick: g (the core's and the rest's) and its standard error)
export function partShift(part, k, run) {
  if (!part?.core) return null;
  const dP = dPOf(k);
  let g = part.core.beta[0] + part.core.beta[1] * dP;
  let v = part.core.se[0] ** 2 + dP * dP * part.core.se[1] ** 2;
  if (part.spec && part.lambda !== null) {
    const x = features(k, run);
    for (let j = 0; j < part.spec.length; j++) {
      const z = j === 0 ? 1 : zOf(x[part.spec[j]], part.mu[j], part.sd[j]);
      g += part.beta[j] * z;
      v += z * z * part.se[j] * part.se[j];
    }
  }
  return { g, se: Math.sqrt(v) };
}

// The walk-forward fit of a sport's rows (the over frame, both kinds, opens and closes): a snapshot every
// EVERY_MONTHS months, each on the picks settled before its cutoff, from the first with CONF_MIN settled picks.
// { v, sport, at, snapshots: [{ cutoff, to, n, parts: { win, beat }, run }] }. The win part on every pick (a positive
// edge at the price counted twice: the picks the bands are about), the beat part on the opens with a close at the
// same line. Recency as the gate weighs it, relative to the snapshot's own latest season
export function fitWalk(rows, { sport = null, every = EVERY_MONTHS, log = () => {}, only = FIT_ON, betWeight = BET_WEIGHT, min = CONF_MIN, offset = OFFSET } = {}) {
  const all = rows.map((x) => pickOf(x)).filter(Boolean);
  const picks = only === 'bets' ? all.filter((k) => k.ev > 0) : only === 'edge' ? all.filter((k) => k.edge > 0) : all;
  const settled = picks.filter((k) => k.y !== null && fin(k.row.t)).sort((a, b) => a.row.t - b.row.t);
  if (!settled.length) return { v: CONF_V, sport, at: new Date().toISOString(), snapshots: [] };
  const run = runningStats(rows.filter((x) => fin(x.raw) && fin(x.f)));
  const months = [...new Set(settled.map((k) => monthKey(k.row.t + SETTLE_MS)))].sort();
  const snaps = [];
  let prev = { win: null, beat: null };
  let i = 0;
  const lastKey = nextMonth(months[months.length - 1]);
  for (let m = nextMonth(months[0]); m <= lastKey; m = addMonths(m, every)) {
    const start = monthStart(m);
    while (i < settled.length && settled[i].row.t + SETTLE_MS < start) i++;
    const before = settled.slice(0, i);
    if (before.length < min) continue;
    let cur = null;
    for (const k of before) if (fin(k.row.season) && (cur === null || k.row.season > cur)) cur = k.row.season;
    const wOf = (k) => (sport && fin(cur) && fin(k.row.season) ? Math.max(0.02, seasonWeight(sport, k.row.season, cur).w) : 1) * (k.ev > 0 ? betWeight : 1);
    const t0 = Date.now();
    const win = fitPart(before, run, (k) => k.y, wOf, { prev: prev.win, min, offset });
    // (the beat part's prior is a coin: whether a pick beats the close has nothing to do with its chance at the price)
    const opens = before.filter((k) => k.row.kind === 'o' && k.beat !== null);
    const beat = opens.length >= min / 2 ? fitPart(opens, run, (k) => k.beat, wOf, { prev: prev.beat, min, offset: 'none' }) : prev.beat;
    let to = 0;
    for (const k of before) if (k.row.t + SETTLE_MS > to) to = k.row.t + SETTLE_MS;
    const snap = { cutoff: m, to, n: before.length, parts: { win, beat }, run: Object.fromEntries([...(runAt(run, start) ?? new Map())]) };
    snaps.push(snap);
    prev = { win, beat };
    log(`${m}: ${before.length} picks, win lambda ${win?.lambda}, ${win?.iters} iters${beat ? `, beat on ${opens.length} opens` : ''}, ${Date.now() - t0}ms`);
  }
  return { v: CONF_V, sport, at: new Date().toISOString(), snapshots: snaps };
}

// (the newest snapshot that learned from nothing settled after the bet's moment: its to at or before at)
export function snapshotFor(model, at) {
  if (!model?.snapshots?.length || !fin(at)) return null;
  let best = null;
  for (const s of model.snapshots) {
    const to = fin(s.to) ? s.to : monthStart(s.cutoff);
    if (to <= at && (!best || to > (fin(best.to) ? best.to : monthStart(best.cutoff)))) best = s;
  }
  return best;
}

// ---- the quality of a pick ----

// A pick's quality by the model at its bet's moment: { pc (the calibrated chance it wins), q (its calibrated edge:
// the stake's Kelly at pc), pb (the chance it beats the close; null without the part), g, se, cap (the band it may
// reach by the tiers: null any, 'high' a LOVE at most, 'medium' a LIKE at most), cutoff }; null where the model has
// no snapshot for the moment (the Kelly bands and stakes as before). k: a pick (pickOf), or an over-frame row with
// its side (ctx.side) for the live desk
export function qualityOf(model, k, { tiers = model?.tiers ?? null, weight = model?.blend?.weight ?? BLEND_START } = {}) {
  const pick = k?.row ? k : pickOf(k, k?.side ?? null);
  if (!pick) return null;
  const at = pick.row.at ?? pick.row.t;
  const snap = snapshotFor(model, at);
  if (!snap?.parts?.win) return null;
  const run = snap.run ? new Map(Object.entries(snap.run)) : null;
  const s = partShift(snap.parts.win, pick, run);
  if (!s || !fin(s.g)) return null;
  const pcRaw = clip(sigmoid(offsetOf(pick, snap.parts.win.offset ?? 'f') + s.g), 0.005, 0.995);
  const pc = blendChance(pick.pS, pcRaw, weight);
  const q = r4(stakeKelly(pick.price, pc));
  const b = snap.parts.beat ? partShift(snap.parts.beat, pick, run) : null;
  const pb = b && fin(b.g) ? r4(clip(sigmoid(offsetOf(pick, snap.parts.beat.offset ?? 'none') + b.g), 0.005, 0.995)) : null;
  return { pc: r4(pc), pcRaw: r4(pcRaw), q, pb, g: r4(s.g), se: r4(s.se), weight, cap: capOf(q, tiers), cutoff: snap.cutoff };
}

// (the band a quality may reach under the tiers: no tier earned, a LIKE at most; the LOVE tier earned and q at or
// over its bar, a LOVE at most unless the LOCK tier is earned and q at or over its bar; the Kelly floors are
// picks.mjs's. No tiers (an older file), no cap)
export function capOf(q, tiers) {
  if (!tiers) return null;
  const love = fin(tiers.love) ? tiers.love : Infinity;
  const lock = fin(tiers.lock) ? tiers.lock : Infinity;
  if (!fin(q) || q < love) return 'medium';
  return q < lock ? 'high' : null;
}

// The stake on the calibrated chance: desk.mjs stakeFor at pc's expected return at the price (a push's share
// kept), the practice stake where pc clears no edge there. null without a quality (the stake as before)
export function unitsOf(quality, price, evScale, { push = 0 } = {}) {
  if (!quality || !fin(quality.pc) || !fin(price) || !price) return null;
  const ev = (1 - (push ?? 0)) * (quality.pc * decimal(price) - 1);
  return ev > 0 ? stakeFor(ev, evScale, price) : PRACTICE_UNITS;
}

// ---- the tiers from the evidence ----

// (a clustered bootstrap of the difference of means of v between two lists, clusters by key: { diff, lo, hi })
function bootDiff(above, below, vOf, keyOf, { boot = BOOT, seed = 20261019 } = {}) {
  const group = (list) => {
    const by = new Map();
    for (const r of list) {
      const c = by.get(keyOf(r)) ?? by.set(keyOf(r), { s: 0, n: 0 }).get(keyOf(r));
      c.s += vOf(r);
      c.n++;
    }
    return [...by.values()];
  };
  const A = group(above);
  const B = group(below);
  if (!A.length || !B.length) return null;
  let st = seed >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  const meanOf = (cl, draw) => {
    let s = 0;
    let n = 0;
    for (let i = 0; i < cl.length; i++) {
      const c = draw ? cl[Math.floor(rnd() * cl.length)] : cl[i];
      s += c.s;
      n += c.n;
    }
    return n ? s / n : 0;
  };
  const diffs = [];
  for (let b = 0; b < boot; b++) diffs.push(meanOf(A, true) - meanOf(B, true));
  diffs.sort((a, b) => a - b);
  // (a 99% interval: the bar is picked from a grid of TIER_GRID.length looks, so one look's 95% would be found by chance)
  return { diff: meanOf(A) - meanOf(B), lo: diffs[Math.floor(boot * 0.005)], hi: diffs[Math.floor(boot * 0.995) - 1] };
}

// The tiers from scored picks ([{ k (the pick), q, kelly }], each scored walk-forward: the bets the Bot would have
// placed, a positive edge at the priced chance, not suspect): for the LOVE tier, the lowest bar on the grid where
// the picks at or over it (with the Kelly floor) made a better flat return than the picks under it, beyond noise
// (the bootstrap's 95% wholly over 0), and beat the close at least as often; for the LOCK tier the same against the
// LOVE picks, over the LOVE bar, with LOCK's floors. { love, lock, evidence: [{ tier, bar, n, roi, roiBelow, lo, hi,
// beat, beatBelow, earned }] }; a tier not earned is null
export function fitTiers(scored, { floors = { love: 0.02, lock: 0.05, lockChance: 0.55 }, grid = TIER_GRID, min = TIER_MIN } = {}) {
  const evidence = [];
  const profit = (r) => (r.k.y === null ? 0 : r.k.y ? decimal(r.k.price) - 1 : -1);
  const keyOf = (r) => String(r.k.row.event ?? r.k.row.id);
  const beatOf = (list) => {
    const d = list.filter((r) => r.k.beat === 0 || r.k.beat === 1);
    return d.length ? d.reduce((s, r) => s + r.k.beat, 0) / d.length : null;
  };
  const roiOf = (list) => (list.length ? list.reduce((s, r) => s + profit(r), 0) / list.length : null);
  const judge = (tier, pool, inTier) => {
    let earned = null;
    for (const bar of grid) {
      const above = pool.filter((r) => inTier(r) && r.q >= bar);
      const below = pool.filter((r) => !(inTier(r) && r.q >= bar));
      if (above.length < min || below.length < min) continue;
      const bd = bootDiff(above, below, profit, keyOf);
      const beat = beatOf(above);
      const beatBelow = beatOf(below);
      // (two routes. By the results: the flat return over the rest beyond noise, the close beaten at least as often. By
      // the close (the AI pass, 2026-10-19: a return gap takes thousands of picks a tier to show, the close converges
      // in a few hundred): on CLV_MIN opens or more, the close beaten CLV_LEAD more often than the rest beyond noise,
      // a better mean closing-line value, and the return not under the rest's)
      const byResults = !!bd && bd.lo > 0 && (beat === null || beatBelow === null || beat >= beatBelow);
      const opensA = above.filter((r) => r.k.beat === 0 || r.k.beat === 1);
      const opensB = below.filter((r) => r.k.beat === 0 || r.k.beat === 1);
      const bb = opensA.length >= CLV_MIN && opensB.length >= min ? bootDiff(opensA, opensB, (r) => r.k.beat, keyOf) : null;
      const clvOf = (list) => { const c = list.filter((r) => fin(r.k.clv)); return c.length ? c.reduce((s, r) => s + r.k.clv, 0) / c.length : null; };
      const byClose = !!bb && bb.lo > CLV_LEAD && (clvOf(opensA) ?? -1) > (clvOf(opensB) ?? 0) && roiOf(above) >= roiOf(below);
      const ok = byResults || byClose;
      evidence.push({ tier, bar, n: above.length, roi: r4(roiOf(above)), roiBelow: r4(roiOf(below)), lo: r4(bd?.lo), hi: r4(bd?.hi), beat: r4(beat), beatBelow: r4(beatBelow), opens: opensA.length, beatLo: r4(bb?.lo), clv: r4(clvOf(opensA)), clvBelow: r4(clvOf(opensB)), earned: ok, by: ok ? (byResults ? 'results' : 'close') : null });
    }
    // (the bar: the lowest that clears with the bar above it clearing too (or none above it with the rows), so a
    // lone look never earns a tier; marked on the evidence)
    const mine = evidence.filter((e) => e.tier === tier);
    for (let i = 0; i < mine.length; i++) {
      const next = mine[i + 1];
      if (mine[i].earned && (!next || next.earned)) {
        earned = mine[i].bar;
        break;
      }
    }
    for (const e of mine) e.earned = e.earned && earned !== null && e.bar >= earned;
    return earned;
  };
  const love = judge('love', scored, (r) => r.kelly >= floors.love);
  let lock = null;
  if (love !== null) {
    const loves = scored.filter((r) => r.kelly >= floors.love && r.q >= love);
    lock = judge('lock', loves, (r) => r.kelly >= floors.lock && r.k.pS >= floors.lockChance);
    if (lock !== null && lock <= love) lock = null;
  }
  return { love, lock, evidence };
}

// Every pick of the rows scored walk-forward by the model: [{ k, q, pc, pb, kelly, bet (a positive edge at the price,
// not suspect: a bet the Bot would place) }], the rows the model can score
export function scoreRows(model, rows, { suspect = 0.15, weight = model?.blend?.weight ?? BLEND_START } = {}) {
  const out = [];
  for (const x of rows) {
    const k = pickOf(x);
    if (!k) continue;
    const qy = qualityOf(model, k, { tiers: null, weight });
    if (!qy) continue;
    out.push({ k, q: qy.q, pc: qy.pc, pcRaw: qy.pcRaw, pb: qy.pb, kelly: r4(k.kelly), bet: k.ev > 0 && Math.abs(k.ev) <= suspect });
  }
  return out;
}

// The blend's weight on the calibrated chance, by evidence (the coordinator, 2026-10-19: a weight that stepped up on
// every record of the same data is no evidence). previous: the last file's blend ({ weight, through }; a number or a
// file before `through`, as no evidence yet: BLEND_START, every bet new). The new evidence is the graded bets after
// `through`, each scored walk-forward; with fewer than BLEND_NEW of them the weight holds. Else it moves one
// BLEND_STEP to the neighbor (down, or up) with the lower log loss on those new bets, or holds where neither is
// lower; and never over 0 where the calibrated chance doesn't beat the priced one on them (the guard). `through`
// moves only when the weight is judged, so held bets pile up to the next record. The newest BLEND_MONTHS months'
// grid (target, losses) stays a readout. { weight, through, target, losses, n, fresh }
export function blendFit(scored, previous = BLEND_START) {
  const prev = typeof previous === 'number' ? { weight: BLEND_START, through: null } : { weight: fin(previous?.weight) && fin(previous?.through) ? previous.weight : BLEND_START, through: fin(previous?.through) ? previous.through : null };
  const bets = scored.filter((r) => r.bet && r.k.y !== null && fin(r.pcRaw));
  const lossAt = (list, lam) => list.reduce((t, r) => t + binLoss(blendChance(r.k.pS, r.pcRaw, lam), r.k.y), 0) / Math.max(1, list.length);
  if (!bets.length) return { weight: Math.min(prev.weight, 0), through: prev.through, target: 0, losses: null, n: 0, fresh: 0 };
  const newest = Math.max(...bets.map((r) => r.k.row.t));
  const since = newest - BLEND_MONTHS * 30.4375 * 864e5;
  const held = bets.filter((r) => r.k.row.t >= since);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const losses = grid.map((lam) => lossAt(held, lam));
  let best = 0;
  for (let i = 1; i < grid.length; i++) if (losses[i] < losses[best] - 1e-9) best = i;
  const target = held.length >= 100 ? grid[best] : 0;
  const fresh = prev.through === null ? bets : bets.filter((r) => r.k.row.t > prev.through);
  let weight = prev.weight;
  let through = prev.through;
  if (fresh.length >= BLEND_NEW) {
    const at = lossAt(fresh, weight);
    const down = weight > 0 ? Math.max(0, weight - BLEND_STEP) : null;
    const up = weight < 1 ? Math.min(1, weight + BLEND_STEP) : null;
    const lDown = down === null ? Infinity : lossAt(fresh, down);
    const lUp = up === null ? Infinity : lossAt(fresh, up);
    if (lDown < at - 1e-9 && lDown <= lUp) weight = down;
    else if (lUp < at - 1e-9) weight = up;
    if (weight > 0 && !(lossAt(fresh, weight) < lossAt(fresh, 0) - 1e-9)) weight = 0;
    through = newest;
  }
  return { weight: Math.round(weight * 100) / 100, through, target, losses: losses.map(r6), n: held.length, fresh: fresh.length };
}
export const blendChance = (pCur, pRes, weight) => (!(weight > 0) ? pCur : clip(sigmoid(logit(pCur) + weight * (logit(pRes) - logit(pCur))), 0.005, 0.995));

// The whole fit for a sport's history rows: the snapshots, the tiers on the walk-forward scores of the bets (the
// closes and the props' opens: the lines' opens are left out of the tiers, the replay's ratings reading the game's
// own facts there), and the held-out record (the log loss of pc, p and the Book on the scored picks). The model
// the desk reads
export function fitConfidence(rows, { sport = null, log = () => {}, previous = null, ...opts } = {}) {
  const model = fitWalk(rows, { sport, log, ...opts });
  const raw = scoreRows(model, rows, { weight: 0 });
  model.blend = blendFit(raw, previous?.blend ?? null);
  const scored = scoreRows(model, rows);
  const forTiers = scored.filter((r) => r.bet && (r.k.row.kind === 'c' || r.k.row.market === 'prop'));
  model.tiers = fitTiers(forTiers);
  const ll = (list, pOf) => (list.length ? r4(list.reduce((s, r) => s + binLoss(pOf(r), r.k.y), 0) / list.length) : null);
  const dec = scored.filter((r) => r.k.y !== null);
  const bets = dec.filter((r) => r.bet);
  model.held = {
    n: dec.length,
    bets: bets.length,
    ll: { pc: ll(dec, (r) => r.pc), p: ll(dec, (r) => r.k.pS), book: ll(dec, (r) => r.k.fS) },
    betLl: { pc: ll(bets, (r) => r.pc), p: ll(bets, (r) => r.k.pS), book: ll(bets, (r) => r.k.fS) },
    top: topFeatures(model.snapshots[model.snapshots.length - 1]?.parts?.win, 10),
  };
  log(`blend ${model.blend.weight} (target ${model.blend.target} on ${model.blend.n} bets: losses ${(model.blend.losses ?? []).join(' / ')}); tiers: love ${model.tiers.love}, lock ${model.tiers.lock}; held out log loss on ${bets.length} bets: pc ${model.held.betLl.pc}, p ${model.held.betLl.p}, the Book ${model.held.betLl.book}`);
  return model;
}

// (a part's top features by their standardized weight, the intercept aside)
export function topFeatures(part, n = 8) {
  if (!part?.spec) return [];
  return part.spec
    .map((name, j) => ({ name, beta: r4(part.beta[j]), z: part.se[j] > 0 ? r4(part.beta[j] / part.se[j]) : null }))
    .filter((x) => x.name !== 'one')
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
    .slice(0, n);
}

// ---- the file ----

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const modelFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/confidence.json');
const loaded = new Map();
export function loadModel(sport, root = ROOT) {
  const key = `${root}|${sport}`;
  if (loaded.has(key)) return loaded.get(key);
  let m = null;
  try {
    const f = modelFile(sport, root);
    if (existsSync(f)) m = JSON.parse(readFileSync(f, 'utf8'));
    if (m && m.v !== CONF_V) m = null;
  } catch {
    m = null;
  }
  loaded.set(key, m);
  return m;
}
export const forgetModels = () => loaded.clear();

// (the model slimmed for the file: the snapshots' parts and reads, the tiers and the held-out record)
export const slim = (model) => ({ v: model.v, sport: model.sport, at: model.at, blend: model.blend ?? { weight: BLEND_START }, tiers: model.tiers ?? null, held: model.held ?? null, snapshots: (model.snapshots ?? []).map((s) => ({ cutoff: s.cutoff, to: s.to, n: s.n, parts: s.parts, run: s.run })) });
