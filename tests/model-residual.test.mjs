// The residual model (libs/ranker/scripts/model/residual.mjs: where the Book is wrong; DECISIONS.md D31) on made-up
// rows: no network, no cache. The features read nothing from the result; the fit recovers a planted shift and shrinks
// noise to nothing; the running reads and the snapshots never look ahead (a planted leak the earlier snapshot can't
// know); the owner's rule (a Bot that's ahead shows as a bigger learned edge, never pulled toward the Book; a Bot
// that's noise reads "no edge"); the blend soft and stepped; the hold-out guard; the desk's hook on by default (the
// owner's O3, 2026-10-19), off for a run by RESID_OFF, and the frame flipped for an under.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLEND_START,
  BLEND_STEP,
  D_CAP,
  RESID_MIN,
  RESID_PRICING,
  SETTLE_MS,
  blendChance,
  blendFit,
  design,
  features,
  fitLogit,
  fitPart,
  fitTrees,
  fitWalk,
  guardOk,
  hookChance,
  isLeanTerm,
  logit,
  monthKey,
  residOn,
  residualChance,
  runAt,
  runningStats,
  sigmoid,
  snapshotFor,
  specOf,
  topFeatures,
  treesMargin,
} from '../libs/ranker/scripts/model/residual.mjs';
import { rng } from '../libs/ranker/scripts/model/gate-score.mjs';
import { phaseOf } from '../libs/ranker/scripts/model/residual-train.mjs';

// ---- fixtures ----

// Made-up priced rows over months: the truth p0 a noisy read around the Book's f; the Bot's raw chance either the
// truth seen through noise (botRight: the Bot ahead, its lean worth keeping) or pure noise around f (the Bot's
// disagreement meaning nothing); the Book's own over-shade (shade: the truth sits that far under f); results drawn
// from the truth. Rows at the open (kind 'o') with the close's q, and at the close with the open's fo
function rows({ months = 14, perMonth = 600, botRight = false, shade = 0, seed = 11, from = '2025-01', stat = 'shots', leak = null } = {}) {
  const r = rng(seed);
  const gauss = () => {
    const u = Math.max(1e-9, r());
    const v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const out = [];
  let [y0, m0] = from.split('-').map(Number);
  for (let m = 0; m < months; m++) {
    const key = `${y0}-${String(m0).padStart(2, '0')}`;
    const start = Date.parse(`${key}-03T00:00:00Z`);
    for (let i = 0; i < perMonth; i++) {
      const f = Math.min(0.8, Math.max(0.2, 0.5 + 0.08 * gauss()));
      const lf = logit(f);
      let truth = sigmoid(lf - shade + (leak && leak.month === key ? leak.shift : 0));
      let raw;
      if (botRight) {
        // (the truth moves with the Bot's read: a real lean of 0.5 logits, read with noise)
        const lean = 0.5 * gauss();
        truth = sigmoid(logit(truth) + lean);
        raw = sigmoid(lf + lean + 0.15 * gauss());
      } else raw = sigmoid(lf + 0.5 * gauss());
      const t = start + i * 36e5 * 1.5;
      const y = r() < truth ? 1 : 0;
      const q = Math.min(0.95, Math.max(0.05, f + 0.02 * gauss()));
      const line = i % 3 ? 2.5 : 0.5;
      // (the Book's two prices: its no-vig with a 4.5% vig split in proportion, as its real prices de-vig to f)
      const american = (p) => Math.round(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
      const odds = (nv) => ({ overOdds: american(nv * 1.045), underOdds: american((1 - nv) * 1.045) });
      const base = { id: `${key}-${i}`, event: `g${key}-${Math.floor(i / 8)}`, sport: 'nhl', market: 'prop', stat, line, t, season: y0, y, home: i % 2 === 0, phase: 0.5, pcur: f + 0.3 * (raw - f) };
      out.push({ ...base, ...odds(f), kind: 'o', f, raw, at: t - 12 * 36e5, q, fo: null });
      out.push({ ...base, ...odds(q), id: `${base.id}:c`, kind: 'c', f: q, raw, at: t - 3e5, q: null, fo: f });
    }
    m0++;
    if (m0 > 12) {
      m0 = 1;
      y0++;
    }
  }
  return out;
}
const ll = (rs, pOf) => rs.reduce((s, x) => s - Math.log(Math.max(1e-9, x.y ? pOf(x) : 1 - pOf(x))), 0) / rs.length;

// ---- the features ----

test('the features read only what is known at the bet: the result, the close and the other side never change them', () => {
  const row = { sport: 'nhl', market: 'prop', stat: 'shots', line: 2.5, f: 0.52, raw: 0.6, overOdds: -120, underOdds: 100, t: 1e12, at: 1e12 - 36e5, kind: 'c', fo: 0.5, home: true, phase: 0.2 };
  const a = features(row);
  const b = features({ ...row, y: 1, q: 0.9, pcur: 0.1, v: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.one, 1);
  assert.ok(Math.abs(a.d - (logit(0.6) - logit(0.52))) < 1e-9);
  assert.ok(a.mv > 0, 'the move to date is read at the close');
  assert.equal(features({ ...row, kind: 'o', fo: null }).mv, 0, 'at the open there is no move yet');
  assert.equal(a['stat:shots'], 1);
  assert.equal(a['bucket:mid'], 1);
  assert.ok(Math.abs(features({ ...row, raw: 0.999 }).d - D_CAP) < 1e-9, 'the lean is held to its cap');
  assert.ok(isLeanTerm('d') && isLeanTerm('d*stat:shots') && isLeanTerm('dAbs') && !isLeanTerm('home') && !isLeanTerm('stat:shots'));
});

test('a prop reads no Pinnacle gap (its no-vig is the Book\'s own); a game line reads the Book against the anchor', () => {
  const prop = features({ sport: 'nhl', market: 'prop', stat: 'shots', line: 2.5, f: 0.5217, raw: 0.55, overOdds: -120, underOdds: 100 });
  assert.ok(Math.abs(prop.pg) < 1e-3);
  const line = features({ sport: 'nhl', market: 'spread', stat: 'spread', line: -1.5, f: 0.4, raw: 0.45, overOdds: -120, underOdds: 100 });
  assert.ok(line.pg > 0.3, 'DraftKings dearer than the anchor on this side');
});

// ---- the fit ----

test('the ridge logistic fit recovers a planted shift on the Book and shrinks noise toward nothing', () => {
  const rs = rows({ months: 10, perMonth: 400, botRight: true, shade: 0.1 }).filter((x) => x.kind === 'o');
  const feats = rs.map((x) => features(x));
  const spec = specOf(feats);
  const { X } = design(feats, spec);
  const y = Float64Array.from(rs, (x) => x.y);
  const w = new Float64Array(rs.length).fill(1);
  const off = Float64Array.from(rs, (x) => logit(x.f));
  const fit = fitLogit(X, y, w, off, { lambda: 10 });
  assert.ok(fit.iters > 0);
  const bookLoss = ll(rs, (x) => x.f);
  const pFit = rs.map((x, i) => sigmoid(off[i] + X[i].reduce((s, v, j) => s + v * fit.beta[j], 0)));
  const fitLoss = rs.reduce((s, x, i) => s - Math.log(x.y ? pFit[i] : 1 - pFit[i]), 0) / rs.length;
  assert.ok(fitLoss < bookLoss - 0.005, `the fit beats the Book in sample (${fitLoss} against ${bookLoss})`);
  assert.ok(fit.beta[spec.indexOf('d')] > 0.05, 'the lean term positive where the Bot is right');
  assert.ok(fit.beta[0] < 0, 'the intercept reads the over-shade (the truth under f)');
  const hard = fitLogit(X, y, w, off, { lambda: 1e7 });
  for (let j = 0; j < spec.length; j++) assert.ok(Math.abs(hard.beta[j]) < 0.01, `at a huge penalty every term is near 0 (${spec[j]} ${hard.beta[j]})`);
});

test('fitPart standardizes, tunes its penalty on the newest months and reports its terms', () => {
  const rs = rows({ months: 12, perMonth: 400, botRight: true });
  const part = fitPart(rs, runningStats(rs), { lambdas: [3000, 300, 30] });
  assert.equal(part.spec[0], 'one');
  assert.equal(part.beta.length, part.spec.length);
  assert.ok([3000, 300, 30].includes(part.lambda));
  assert.ok(part.tuned && part.tuned.n > 0);
  const top = topFeatures(part, 5);
  assert.ok(top.length === 5 && top.every((f) => f.name !== 'one'));
});

test('the trees stage fits a Newton step on what the logistic left and predicts the same margin', () => {
  const r = rng(3);
  const n = 3000;
  const X = Array.from({ length: n }, () => Float64Array.from([1, r() * 2 - 1, r() * 2 - 1]));
  const y = Float64Array.from(X, (x) => (r() < sigmoid(1.5 * (x[1] > 0 ? 1 : -1) * (x[2] > 0.2 ? 1 : 0)) ? 1 : 0));
  const w = new Float64Array(n).fill(1);
  const margin0 = new Float64Array(n);
  const tr = fitTrees(X, y, w, margin0, { trees: 30, depth: 2, lr: 0.3, minLeaf: 50, lambda: 1 });
  assert.equal(tr.trees.length, 30);
  const base = y.reduce((s, v) => s - Math.log(0.5), 0) / n;
  assert.ok(tr.loss < base - 0.05, `the trees learn the planted interaction (${tr.loss} against ${base})`);
  let m = 0;
  for (const t of tr.trees) {
    const walk = (node, x) => (node.value !== undefined ? node.value : x[node.feat] <= node.thr ? walk(node.left, x) : walk(node.right, x));
    m += walk(t, X[0]);
  }
  assert.ok(Math.abs(treesMargin(tr, X[0]) - m) < 1e-12);
});

// ---- no look-ahead ----

test('the running reads are frozen a month at a time from rows settled before it: a stat first seen in a month is unknown to that month', () => {
  const rs = rows({ months: 4, perMonth: 200, from: '2025-01' });
  const late = rows({ months: 1, perMonth: 200, from: '2025-04', stat: 'goals' });
  const run = runningStats([...rs, ...late]);
  const april = runAt(run, Date.parse('2025-04-10T00:00:00Z'));
  assert.ok(april.has('props|shots'), 'shots have reads by April');
  assert.ok(!april.has('props|goals'), "goals first priced in April have none in April's reads");
  const may = runAt(run, Date.parse('2025-05-10T00:00:00Z'));
  assert.ok(may.has('props|goals'), 'and reads in May');
  for (const [key, s] of may) assert.ok(Number.isFinite(s.b) && Number.isFinite(s.shade) && s.n > 0, key);
});

test('a snapshot learns only from rows settled before its cutoff, a row reads only a snapshot settled before its bet (a planted leak the earlier fit cannot know)', () => {
  // (the last month's truth sits 0.8 logits over the Book: a leak only rows from that month could teach)
  const leakMonth = '2026-02';
  const rs = rows({ months: 14, perMonth: 500, from: '2025-01', leak: { month: leakMonth, shift: 0.8 } });
  const model = fitWalk(rs, { sport: 'nhl' });
  assert.ok(model.snapshots.length >= 6);
  for (const s of model.snapshots) {
    assert.ok(Number.isFinite(s.to) && s.to < Date.parse(`${s.cutoff}-01T00:00:00Z`) + 1, `${s.cutoff}: learned from nothing settled after its cutoff`);
    const seen = rs.filter((x) => x.t + SETTLE_MS <= s.to && (x.y === 0 || x.y === 1));
    assert.equal(s.n, seen.length, `${s.cutoff}: its rows are exactly the settled ones before it`);
  }
  const inLeak = rs.filter((x) => monthKey(x.t) === leakMonth && x.kind === 'o');
  const priced = inLeak.map((x) => ({ x, r: residualChance(model, x, x.pcur) })).filter((z) => z.r);
  assert.ok(priced.length > 100);
  for (const { x, r } of priced) {
    const snap = snapshotFor(model, x.at);
    assert.ok(snap.to <= x.at, 'the snapshot used settled before the bet');
    assert.ok(snap.cutoff <= leakMonth && snap.cutoff !== leakMonth ? true : snap.to <= x.at);
  }
  const meanShift = priced.reduce((s, z) => s + z.r.g, 0) / priced.length;
  assert.ok(Math.abs(meanShift) < 0.15, `the leak month's rows priced with no knowledge of the leak (mean shift ${meanShift.toFixed(3)} against a planted 0.8)`);
  // (and a row after the leak month, priced by a snapshot that saw it, can read it)
  const after = { ...inLeak[0], t: Date.parse('2026-03-10T00:00:00Z'), at: Date.parse('2026-03-09T00:00:00Z') };
  const r = residualChance(model, after, after.pcur);
  assert.ok(r && r.g > meanShift, 'the later snapshot learned from the leak month');
});

test('snapshotFor never hands a row a fit that learned from after its bet, and the live desk reads the newest fit', () => {
  const model = { v: 1, snapshots: [{ cutoff: '2025-02', to: 100, parts: {} }, { cutoff: '2025-03', to: 200, parts: {} }, { cutoff: '2025-04', to: 300, parts: {} }] };
  assert.equal(snapshotFor(model, 50), null);
  assert.equal(snapshotFor(model, 100).cutoff, '2025-02');
  assert.equal(snapshotFor(model, 250).cutoff, '2025-03');
  assert.equal(snapshotFor(model, Date.now()).cutoff, '2025-04');
});

// ---- the owner's rule: the model predicts the Book's error, never pulls an ahead Bot toward the Book ----

test('a Bot whose disagreements have been right shows as a bigger learned edge: the corrected chance lands past the current price, toward the Bot', () => {
  const rs = rows({ months: 14, perMonth: 600, botRight: true, seed: 5 });
  const model = fitWalk(rs, { sport: 'nhl' });
  const last = model.snapshots[model.snapshots.length - 1].parts.props;
  assert.ok(last.beta[last.spec.indexOf('d')] > 0, 'the lean term positive');
  const newest = rs.filter((x) => x.kind === 'o' && monthKey(x.t) >= '2026-01');
  let further = 0;
  let n = 0;
  let edgeRes = 0;
  let edgeCur = 0;
  for (const x of newest) {
    const r = residualChance(model, x, x.pcur);
    if (!r) continue;
    n++;
    // (the lean's direction: the corrected chance moves off the Book the Bot's way)
    const dir = Math.sign(x.raw - x.f);
    edgeRes += dir * (r.pRes - x.f);
    edgeCur += dir * (x.pcur - x.f);
    if (dir * (r.p - x.f) >= dir * (x.pcur - x.f) - 1e-9) further++;
  }
  assert.ok(n > 500);
  assert.ok(edgeRes / n > edgeCur / n, `the learned edge the Bot's way is larger than the current price's (${(edgeRes / n).toFixed(4)} against ${(edgeCur / n).toFixed(4)})`);
  assert.ok(further / n > 0.9, `the blend never pulls an ahead Bot back toward the Book (${further} of ${n} rows at or past the current price)`);
  const blend = model.snapshots[model.snapshots.length - 1].blend.props;
  assert.ok(blend >= BLEND_START, `the blend's weight grew where the correction paid (${blend})`);
});

test('a Bot whose disagreements are noise reads "no edge": the corrected chance stays near the Book, the lean term near 0', () => {
  const rs = rows({ months: 14, perMonth: 600, botRight: false, seed: 9 });
  const model = fitWalk(rs, { sport: 'nhl' });
  const last = model.snapshots[model.snapshots.length - 1].parts.props;
  assert.ok(Math.abs(last.beta[last.spec.indexOf('d')]) < 0.05, `the lean term near 0 (${last.beta[last.spec.indexOf('d')]})`);
  const newest = rs.filter((x) => x.kind === 'o' && monthKey(x.t) >= '2026-01');
  let noEdge = 0;
  let n = 0;
  let dist = 0;
  for (const x of newest) {
    const r = residualChance(model, x, x.pcur);
    if (!r) continue;
    n++;
    if (r.noEdge) noEdge++;
    dist += Math.abs(r.pRes - x.f);
  }
  assert.ok(noEdge / n > 0.8, `no edge on most rows (${noEdge} of ${n})`);
  assert.ok(dist / n < 0.01, `the corrected chance within a point of the Book on average (${(dist / n).toFixed(4)})`);
});

// ---- the blend ----

test('the blend is soft: weight 0 the current price, 1 the corrected chance, between them on the logit scale; its fit steps at most BLEND_STEP', () => {
  assert.ok(Math.abs(blendChance(0.5, 0.6, 0) - 0.5) < 1e-9);
  assert.ok(Math.abs(blendChance(0.5, 0.6, 1) - 0.6) < 1e-9);
  const mid = blendChance(0.5, 0.6, 0.5);
  assert.ok(mid > 0.5 && mid < 0.6);
  const rs = rows({ months: 3, perMonth: 300, botRight: true, seed: 2 }).filter((x) => x.kind === 'o');
  // (the corrected chance the Bot's own read of the truth: the best weight is high (the read's noise keeps it under
  // 1), and one refit moves at most a step toward it)
  const fit = blendFit(rs, (x) => x.raw, (x) => x.pcur, BLEND_START);
  assert.ok(fit.target >= 0.7, `the target high (${fit.target})`);
  assert.ok(fit.weight > BLEND_START && fit.weight <= BLEND_START + BLEND_STEP + 1e-9, `one step at most (${fit.weight})`);
  const back = blendFit(rs, (x) => 1 - x.raw, (x) => x.pcur, 0.4);
  assert.equal(back.target, 0);
  assert.ok(Math.abs(back.weight - Math.max(0, 0.4 - BLEND_STEP)) < 1e-9);
});

// ---- the guard ----

test('the hold-out guard refuses a refit worse than the shipped file on most shared months and in total, or worse than the Book on the newest months', () => {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  const good = Object.fromEntries(months.map((m) => [m, { props: { n: 1000, resid: 0.68, cur: 0.69, book: 0.69 } }]));
  const old = Object.fromEntries(months.map((m) => [m, { props: { n: 1000, resid: 0.685, cur: 0.69, book: 0.69 } }]));
  assert.ok(guardOk(good, null).ok);
  assert.ok(guardOk(good, old).ok, 'better than the shipped one');
  const worse = Object.fromEntries(months.map((m) => [m, { props: { n: 1000, resid: 0.687, cur: 0.69, book: 0.69 } }]));
  assert.ok(!guardOk(worse, old).ok, 'worse on every shared month');
  const bad = Object.fromEntries(months.map((m) => [m, { props: { n: 1000, resid: 0.695, cur: 0.69, book: 0.69 } }]));
  assert.ok(!guardOk(bad, null).ok, 'worse than the Book');
  assert.ok(!guardOk({}, null).ok);
  // (a kind at a time: the lines worse than the Book are held at the current price, the props still ship)
  const mixed = Object.fromEntries(months.map((m) => [m, { props: { n: 1000, resid: 0.68, cur: 0.69, book: 0.69 }, lines: { n: 1000, resid: 0.695, cur: 0.69, book: 0.69 } }]));
  const g = guardOk(mixed, null);
  assert.ok(g.ok && g.kinds.props.ok && !g.kinds.lines.ok);
  assert.deepEqual(g.heldKinds, ['lines']);
});

// ---- the desk's hook ----

test('the hook is on by default (RESID_PRICING true since the owner\'s O3, 2026-10-19), the environment turns it off for a run, and it never throws', () => {
  assert.equal(RESID_PRICING, true);
  const was = { on: process.env.RESID_ON, off: process.env.RESID_OFF };
  delete process.env.RESID_ON;
  delete process.env.RESID_OFF;
  assert.equal(residOn(), true);
  process.env.RESID_OFF = '1';
  assert.equal(residOn(), false, 'RESID_OFF prices a run without it (the gate\'s champion)');
  process.env.RESID_ON = '1';
  assert.equal(residOn(), false, 'RESID_OFF wins');
  delete process.env.RESID_OFF;
  delete process.env.RESID_ON;
  if (was.on !== undefined) process.env.RESID_ON = was.on;
  if (was.off !== undefined) process.env.RESID_OFF = was.off;
  const ctx = { sport: 'nhl', market: 'prop', stat: 'shots', line: 2.5, f: 0.5, raw: 0.6, overOdds: -110, underOdds: -110, t: Date.now() + 36e5 };
  assert.equal(hookChance(ctx, 0.53, { on: () => false, model: { v: 1, snapshots: [] } }), null, 'off: nothing');
  assert.equal(hookChance(null, 0.53, { on: () => true }), null);
  assert.equal(hookChance({ junk: true }, 0.53, { on: () => true, model: { v: 1, snapshots: [{ cutoff: 'x', to: 0, parts: { props: { spec: null } } }] } }), null);
});

test('the hook prices a row by the model and flips the frame for an under', () => {
  const rs = rows({ months: 14, perMonth: 600, botRight: true, seed: 5 });
  const model = fitWalk(rs, { sport: 'nhl' });
  const ctx = { sport: 'nhl', market: 'prop', stat: 'shots', line: 2.5, side: 'over', f: 0.5, raw: 0.62, overOdds: -110, underOdds: -110, t: Date.now() + 36e5, at: Date.now(), home: true };
  const over = hookChance(ctx, 0.536, { on: () => true, model });
  assert.ok(over && over.p > 0.536 && over.p < 0.62, `over: past the current price toward the Bot (${over?.p})`);
  const under = hookChance({ ...ctx, side: 'under', f: 0.5, raw: 0.38 }, 0.464, { on: () => true, model });
  assert.ok(under && Math.abs(under.p - (1 - over.p)) < 1e-9, 'the under is the over\'s mirror');
  assert.ok(Number.isFinite(over.conf) && over.conf >= 0 && over.conf <= 1);
});

test('the season phase reads only the season\'s first start', () => {
  const phase = phaseOf([[2025, Date.parse('2025-10-01T00:00:00Z')], [2025, Date.parse('2025-10-05T00:00:00Z')], [2026, Date.parse('2026-10-01T00:00:00Z')]]);
  assert.equal(phase(2025, Date.parse('2025-10-01T00:00:00Z')), 0);
  assert.ok(Math.abs(phase(2025, Date.parse('2025-11-15T00:00:00Z')) - 0.5) < 0.01);
  assert.equal(phase(2025, Date.parse('2026-03-01T00:00:00Z')), 1);
  assert.equal(phase(2024, 0), 0);
});

test(`RESID_MIN keeps a thin sport at the current price: no snapshot under ${RESID_MIN} settled rows`, () => {
  const rs = rows({ months: 3, perMonth: 300 });
  const model = fitWalk(rs, { sport: 'nhl' });
  assert.equal(model.snapshots.length, 0);
  assert.equal(residualChance(model, rs[0], rs[0].pcur), null);
});
