// The learned correction (2026-10-18, the owner: "the idea that the bot is going to stop finding picks because of its
// historical record is a flaw... it should be using history to make BETTER picks, not stop playing the game
// altogether"). In place of the props' blanket shrink toward the book (desk.mjs chanceAt at the line bucket's trust,
// with the live calibration stacked under it), one fit on every graded prop, bets and tracked rows alike, across the
// epochs and the sports, of where the model beats the book's no-vig chance and where it doesn't. Its output is a
// corrected chance per row: a segment where the model reliably loses is moved toward the book or past it (its side
// can flip), one where it wins keeps its lean or gains. The trust then sizes the stake (props.mjs priceProps), never
// whether a row is played.
//
//   frame     each prop read as its over (the side's chance turned over where the row is an under): the book's
//             no-vig chance f, the model's raw chance m (modelRaw, else model: the live calibration's shift never
//             fits on itself; the correction carries it), the result y, the close's chance q
//   model     logit(p) = logit(f) + a + b·d, d = logit(m) - logit(f) (scaled by its spread, sd), a and b each a
//             global term plus the sum of the row's segment terms (FAMILIES): the sport, the stat, the line bucket
//             (desk.mjs lineBucket), the model's lean (over or under: dir), the gap's size, the over's price
//             (favorite, even, dog), home or away (where the row kept it), and how long before the start it was
//             priced. a is a bias on the over the book doesn't have; b how much of the model's lean to keep (1 all,
//             0 none, under 0 the other way)
//   evidence  as desk.mjs fitTrust reads it: each graded row's result and its close (a soft result, the market's
//             last word), half each where it has both; a game's n rows count 1 / (1 + (n - 1)·RHO) each; a row
//             whose premise broke (weight) and one priced out of the window (tw) for their share
//   shrink    every segment term ridge-shrunk toward 0 (its parent's: the sums nest, so a sparse stat borrows the
//             sport's and the bucket's), the global two free; the penalty (LAMBDAS) and the families (FULL, or the
//             side-and-bucket SIMPLE) chosen self-tuning, each run, by a time split of the rows: fit on the older
//             CORR_SPLIT, judged by the log loss of the sport's own newest results; the best kept. Under CORR_MIN
//             rows none (the old pricing stands)

import { lineBucket } from './desk.mjs';

export const CORR_MIN = 120;
export const CORR_SPLIT = 0.7;
export const LAMBDAS = [2, 6, 20, 60, 200];
const RHO = 0.3;
const CLIP = 4;

export const FAMILIES = ['sport', 'sport|stat', 'sport|stat|bucket', 'sport|bucket', 'sport|bucket|dir', 'sport|stat|bucket|dir', 'sport|gap', 'gap|dir', 'price', 'sport|price', 'home', 'timing'];
export const SIMPLE = ['sport', 'sport|bucket', 'sport|bucket|dir'];

const r4 = (v) => Math.round(v * 10000) / 10000;
const clip = (p) => Math.min(0.995, Math.max(0.005, p));
const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp = (v) => Math.max(-CLIP, Math.min(CLIP, v));

// (the over's price's class: a favorite at -125 or shorter, a dog at +115 or longer, else even; none known '?')
const priceBin = (odds) => (!Number.isFinite(odds) || !odds ? '?' : odds <= -125 ? 'fav' : odds >= 115 ? 'dog' : 'even');
const gapBin = (g) => (g < 0.04 ? 'g0' : g < 0.08 ? 'g1' : g < 0.12 ? 'g2' : 'g3');
const timingBin = (h) => (!Number.isFinite(h) ? '?' : h < 2 ? 'near' : h < 8 ? 'day' : 'early');

// A row's segment levels, family by family (the key each family's terms are kept under)
export function levelsOf(x) {
  const d = logit(x.m) - logit(x.f);
  const dir = d >= 0 ? 'over' : 'under';
  const bucket = lineBucket(x.line);
  const v = { sport: x.sport, stat: x.stat, bucket, dir, gap: gapBin(Math.abs(x.m - x.f)), price: priceBin(x.overOdds), home: x.home === true ? 'home' : x.home === false ? 'away' : '?', timing: timingBin(x.hours) };
  return FAMILIES.map((fam) => `${fam}=${fam.split('|').map((k) => v[k]).join('|')}`);
}

// A row in the over's frame from a prop's numbers: { sport, stat, line, side, model (the side's raw chance), fair
// (the side's no-vig chance), odds, otherOdds, home, hours }
export function frameOf(x) {
  const o = x.side === 'over';
  return {
    sport: x.sport,
    stat: x.stat,
    line: x.line,
    m: o ? x.model : 1 - x.model,
    f: o ? x.fair : 1 - x.fair,
    overOdds: o ? x.odds : x.otherOdds,
    home: x.home,
    hours: x.hours,
  };
}

// The graded props as the fit's rows: each in the over's frame, its result (yo, the over's: null for a push), its
// close (qo, the over's: null with none), its game, when it started, its weight
export function corrRows(bets) {
  const out = [];
  for (const b of bets ?? []) {
    if (!b || b.market !== 'prop' || b.void || !b.propType || (b.side !== 'over' && b.side !== 'under')) continue;
    const model = Number.isFinite(b.modelRaw) ? b.modelRaw : b.model;
    if (!Number.isFinite(model) || !Number.isFinite(b.fair) || !Number.isFinite(b.line)) continue;
    const decided = b.status === 'won' || b.status === 'lost';
    const q = Number.isFinite(b.clv?.q) ? b.clv.q : null;
    if (!decided && q === null) continue;
    const o = b.side === 'over';
    const won = b.status === 'won';
    const hours = (Date.parse(b.start) - Date.parse(b.placedAt ?? b.start)) / 36e5;
    out.push({
      ...frameOf({ sport: b.sport, stat: b.propType, line: b.line, side: b.side, model, fair: b.fair, odds: b.odds, otherOdds: b.otherOdds, home: b.home, hours }),
      id: String(b.id ?? ''),
      event: String(b.event ?? b.id ?? ''),
      t: Date.parse(b.start) || 0,
      yo: decided ? (o === won ? 1 : 0) : null,
      qo: q === null ? null : o ? q : 1 - q,
      w: (b.weight ?? 1) * (b.tw ?? 1),
      // (what the row was priced and bet at, for the out-of-sample pick comparison: correctionReport)
      bet: { side: b.side, odds: b.odds, otherOdds: b.otherOdds, p: b.p, ev: b.ev, intent: b.intent, status: b.status, clvEv: b.clv?.ev ?? null, units: b.units },
    });
  }
  return out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

// (each row's evidence: [{ i, y, w }], the result's and the close's, halved where it has both, a game's rows shared)
function evidenceOf(rows) {
  const perGame = new Map();
  for (const x of rows) perGame.set(x.event, (perGame.get(x.event) ?? 0) + 1);
  const out = [];
  rows.forEach((x, i) => {
    const share = x.w / (1 + ((perGame.get(x.event) ?? 1) - 1) * RHO);
    const both = x.yo !== null && x.qo !== null;
    if (x.yo !== null) out.push({ i, y: x.yo, w: share * (both ? 0.5 : 1) });
    if (x.qo !== null) out.push({ i, y: x.qo, w: share * (both ? 0.5 : 1) });
  });
  return out;
}

// (a symmetric positive-definite solve, Cholesky's)
function cholSolve(A, g) {
  const n = g.length;
  const L = A.map((r) => r.slice());
  for (let j = 0; j < n; j++) {
    let s = L[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!(s > 1e-12)) s = 1e-12;
    L[j][j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) {
      let t = L[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / L[j][j];
    }
  }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let t = g[i];
    for (let k = 0; k < i; k++) t -= L[i][k] * y[k];
    y[i] = t / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let t = y[i];
    for (let k = i + 1; k < n; k++) t -= L[k][i] * x[k];
    x[i] = t / L[i][i];
  }
  return x;
}

// One fit at a penalty and a set of families: { families, lambda, sd, a0, b0, terms: { level: [a, b] }, n }
export function fitCorrection(rows, { families = FAMILIES, lambda = 20 } = {}) {
  const use = new Set(families);
  const ds = rows.map((x) => clamp(logit(x.m) - logit(x.f)));
  const sd = Math.sqrt(ds.reduce((s, d) => s + d * d, 0) / Math.max(1, ds.length)) || 1;
  const index = new Map();
  const act = rows.map((x) => {
    const lv = levelsOf(x).filter((k) => use.has(k.slice(0, k.indexOf('='))));
    return lv.map((k) => {
      if (!index.has(k)) index.set(k, index.size);
      return index.get(k);
    });
  });
  const K = index.size;
  // (parameters: 0 a0, 1 b0, then each level's a at 2 + 2k and b at 3 + 2k)
  const P = 2 + 2 * K;
  const theta = new Array(P).fill(0);
  const ev = evidenceOf(rows);
  const off = rows.map((x) => logit(x.f));
  const dn = ds.map((d) => d / sd);
  for (let it = 0; it < 25; it++) {
    const g = new Array(P).fill(0);
    const H = Array.from({ length: P }, () => new Array(P).fill(0));
    for (let j = 2; j < P; j++) {
      g[j] += lambda * theta[j];
      H[j][j] += lambda;
    }
    H[0][0] += 1e-6;
    H[1][1] += 1e-6;
    for (const e of ev) {
      const i = e.i;
      const d = dn[i];
      const idx = [0, 1];
      const val = [1, d];
      for (const k of act[i]) {
        idx.push(2 + 2 * k, 3 + 2 * k);
        val.push(1, d);
      }
      let z = off[i];
      for (let u = 0; u < idx.length; u++) z += theta[idx[u]] * val[u];
      const p = sigmoid(z);
      const r = e.w * (p - e.y);
      const h = e.w * p * (1 - p);
      for (let u = 0; u < idx.length; u++) {
        g[idx[u]] += r * val[u];
        const hu = h * val[u];
        const row = H[idx[u]];
        for (let v = 0; v < idx.length; v++) row[idx[v]] += hu * val[v];
      }
    }
    const step = cholSolve(H, g);
    let big = 0;
    for (let j = 0; j < P; j++) {
      theta[j] -= step[j];
      big = Math.max(big, Math.abs(step[j]));
    }
    if (big < 1e-6) break;
  }
  const terms = {};
  for (const [k, i] of index) terms[k] = [r4(theta[2 + 2 * i]), r4(theta[3 + 2 * i])];
  return { families: [...families], lambda, sd: r4(sd), a0: r4(theta[0]), b0: r4(theta[1]), terms, n: rows.length };
}

// The over's corrected chance of a row in the over's frame (frameOf), at a fit (none: null)
export function correctedOver(fit, x) {
  if (!fit) return null;
  const d = clamp(logit(x.m) - logit(x.f)) / (fit.sd || 1);
  let a = fit.a0;
  let b = fit.b0;
  for (const k of levelsOf(x)) {
    const t = fit.terms[k];
    if (t) (a += t[0]), (b += t[1]);
  }
  return sigmoid(logit(x.f) + a + b * d);
}

// A prop's two sides, corrected: { over, under } (summing to 1: the over's frame is the one chance), or null with no fit
export function correctSides(fit, { sport, stat, line, pOver, fairOver, overOdds, underOdds, home, hours }) {
  if (!fit) return null;
  const over = correctedOver(fit, frameOf({ sport, stat, line, side: 'over', model: pOver, fair: fairOver, odds: overOdds, otherOdds: underOdds, home, hours }));
  return { over, under: 1 - over };
}

// (a list's mean log loss on its results, at a chance per row)
export function resultLoss(rows, pOf) {
  const dec = rows.filter((x) => x.yo !== null);
  if (!dec.length) return null;
  let ll = 0;
  for (const x of dec) {
    const p = clip(pOf(x));
    ll -= Math.log(x.yo ? p : 1 - p);
  }
  return ll / dec.length;
}

// (the time split at a share of a sport's own decided rows: the time of the first row held out)
export function splitTime(rows, sport, share = CORR_SPLIT) {
  const mine = rows.filter((x) => x.sport === sport && x.yo !== null);
  if (!mine.length) return Infinity;
  return mine[Math.min(mine.length - 1, Math.floor(mine.length * share))].t;
}

// The correction a sport's run prices with, self-tuning: every family set and penalty fit on the rows before the
// time split, judged on the sport's own newest results; the best refit on every row. { fit, chosen: { families
// ('full' | 'simple'), lambda }, held: { n, loss, raw, book }, rows } or { fit: null, why }
export function tuneCorrection(rows, sport) {
  // (a sport with few rows of its own (a season just begun) judged on every sport's newest: its terms 0 till its rows
  // speak, the pooled ones its correction)
  const own = rows.filter((x) => x.sport === sport && x.yo !== null).length;
  const pooled = own < CORR_MIN;
  if (rows.filter((x) => x.yo !== null).length < CORR_MIN) return { fit: null, rows: rows.length, why: `${own} graded ${sport} props and ${rows.length} in all: under ${CORR_MIN}, the old pricing` };
  const mine = pooled ? rows : rows.filter((x) => x.sport === sport);
  const cut = pooled ? (rows.filter((x) => x.yo !== null)[Math.floor(rows.filter((x) => x.yo !== null).length * CORR_SPLIT)]?.t ?? Infinity) : splitTime(rows, sport);
  const old = rows.filter((x) => x.t < cut);
  const held = mine.filter((x) => x.t >= cut && x.yo !== null);
  let best = null;
  for (const [name, families] of [['simple', SIMPLE], ['full', FAMILIES]])
    for (const lambda of LAMBDAS) {
      const f = fitCorrection(old, { families, lambda });
      const loss = resultLoss(held, (x) => correctedOver(f, x));
      if (!best || loss < best.loss - 1e-9) best = { name, families, lambda, loss };
    }
  const fit = fitCorrection(rows, { families: best.families, lambda: best.lambda });
  return {
    fit: { ...fit, set: best.name },
    chosen: { families: best.name, lambda: best.lambda, ...(pooled ? { pooled: true } : {}) },
    held: { n: held.length, loss: r4(best.loss), raw: r4(resultLoss(held, (x) => x.m)), book: r4(resultLoss(held, (x) => x.f)) },
    rows: rows.length,
  };
}

// A compact summary for the state and the run log: the chosen set, its penalty, the global terms, the held-out loss
// against the raw model's and the book's, and the sport's biggest segment terms
export function correctionText(t, sport) {
  if (!t?.fit) return t?.why ?? 'none';
  const f = t.fit;
  const top = Object.entries(f.terms)
    .filter(([k]) => k.includes(`=${sport}`))
    .sort((a, b) => Math.abs(b[1][0]) + Math.abs(b[1][1]) - (Math.abs(a[1][0]) + Math.abs(a[1][1])))
    .slice(0, 6)
    .map(([k, [a, b]]) => `${k} a ${a} b ${b}`);
  return `${t.chosen.families} at lambda ${t.chosen.lambda} on ${t.rows} rows: global a ${f.a0}, b ${f.b0} (d per ${f.sd}); held out ${t.held.n} ${sport} results, log loss ${t.held.loss} (raw model ${t.held.raw}, book ${t.held.book}); ${top.join('; ')}`;
}

// The picks a slate makes at N (practice: desk.mjs PRACTICE_N): every row at its better side by chance over the
// book's no-vig (edge before the vig), the best N with an edge, by edge
export function slatePicks(rows, pOverOf, n) {
  const scored = rows.map((x) => {
    const po = pOverOf(x);
    const over = po - x.f >= (1 - po) - (1 - x.f);
    return { x, side: over ? 'over' : 'under', p: over ? po : 1 - po, fair: over ? x.f : 1 - x.f };
  });
  return scored
    .map((s) => ({ ...s, edge: s.p - s.fair }))
    .filter((s) => s.edge > 0)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, n);
}

const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
// (a pick's result, flat 1u at its side's price (-110 where none was kept), and its CLV (expected return at the
// close's chance, its own price))
function gradePick(s) {
  const x = s.x;
  const recOver = x.bet.side === 'over';
  const odds = s.side === x.bet.side ? x.bet.odds : x.bet.otherOdds;
  const price = Number.isFinite(odds) && odds ? odds : -110;
  const won = s.side === 'over' ? x.yo === 1 : x.yo === 0;
  const q = x.qo === null ? null : s.side === 'over' ? x.qo : 1 - x.qo;
  void recOver;
  return { won, profit: won ? dec(price) - 1 : -1, clv: q === null ? null : q * dec(price) - 1 };
}
const summary = (picks) => {
  const g = picks.map(gradePick);
  const c = g.filter((x) => x.clv !== null);
  return { n: g.length, hit: g.length ? r4(g.filter((x) => x.won).length / g.length) : null, units: r4(g.reduce((s, x) => s + x.profit, 0)), roi: g.length ? r4(g.reduce((s, x) => s + x.profit, 0) / g.length) : null, clv: c.length ? r4(c.reduce((s, x) => s + x.clv, 0) / c.length) : null };
};

// Out of sample for a sport (the brief's proof): the correction tuned and fit on every row before the sport's
// time split (the other sports' too), judged on the sport's own later results. Log loss of the corrected chance
// against the raw model's, the book's and the current design's (the chance each row was priced at, p), and the top
// N a slate (a US Eastern day) by corrected edge against the raw model's top N and the bets the current design
// placed (intent edge), each flat at 1u
export function correctionReport(rows, sport, n) {
  const cut = splitTime(rows, sport);
  const train = rows.filter((x) => x.t < cut);
  const test = rows.filter((x) => x.sport === sport && x.t >= cut && x.yo !== null);
  const tuned = tuneCorrection(train, sport);
  const simple0 = fitCorrection(train, { families: SIMPLE, lambda: 20 });
  const fit = tuned.fit ?? simple0;
  const simple = fitCorrection(train, { families: SIMPLE, lambda: tuned.chosen?.lambda ?? 20 });
  const cur = (x) => (Number.isFinite(x.bet.p) ? (x.bet.side === 'over' ? x.bet.p : 1 - x.bet.p) : x.f);
  const loss = { corrected: r4(resultLoss(test, (x) => correctedOver(fit, x))), simple: r4(resultLoss(test, (x) => correctedOver(simple, x))), raw: r4(resultLoss(test, (x) => x.m)), book: r4(resultLoss(test, (x) => x.f)), current: r4(resultLoss(test, cur)) };
  const slates = new Map();
  for (const x of test) {
    const k = ET.format(new Date(x.t));
    slates.set(k, [...(slates.get(k) ?? []), x]);
  }
  const pick = { corrected: [], simple: [], raw: [], current: [] };
  for (const list of slates.values()) {
    pick.corrected.push(...slatePicks(list, (x) => correctedOver(fit, x), n));
    pick.simple.push(...slatePicks(list, (x) => correctedOver(simple, x), n));
    pick.raw.push(...slatePicks(list, (x) => x.m, n));
    pick.current.push(...list.filter((x) => x.bet.intent === 'edge').map((x) => ({ x, side: x.bet.side })));
  }
  return { sport, n, train: train.length, test: test.length, slates: slates.size, chosen: tuned.chosen ?? null, loss, top: Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, summary(v)])) };
}
