// The soft terms (libs/ranker/scripts/model/project.mjs softWeight, softStep, softJoint, fitStat's soft stage): a
// late term the gate leaves out on its gain (or the whole stat's bias) alone comes in at a weight from its held-out
// evidence, shrunk to 0 when it's weak, flips or loses a half; each run's weight moves at most SOFT_DAY a day from
// the last run's (params.soft, saved with the fit in state.json); the set is kept only while the held-out log loss
// is lower with it and the eligible players' and every player's bias no larger, else the hard-gated model alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOFT_DAY, SOFT_Z, fitStat, softEligible, softFrom, softJoint, softSize, softStep, softWeight, softable } from '../libs/ranker/scripts/model/project.mjs';

// (mulberry32: a deterministic stream of 0..1)
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// (paired held-out losses: n lines, the term's gain a line (mean), its noise (sd: alternating, so z is exact), and the
// second half's gain apart)
function pairs(n, mean, sd, { seed = 3, late = mean } = {}) {
  const r = rng(seed);
  const off = new Map();
  const on = new Map();
  for (let i = 0; i < n; i++) {
    const row = { i };
    const l0 = 0.6 + r() * 0.2;
    const g = (i < n / 2 ? mean : late) + (i % 2 ? sd : -sd);
    off.set(row, l0);
    on.set(row, l0 - g);
  }
  return [off, on];
}

test('the shrink: no evidence, none; a weak steady effect a small weight; a strong one near 1; a hurt or a flip 0', () => {
  assert.equal(SOFT_Z, 1);
  assert.equal(softWeight(new Map(), new Map()).w, 0);
  assert.equal(softWeight(...pairs(50, 0.001, 0.01)).why, 'too few lines');
  // (z about 1.4: a weight about half)
  const weak = softWeight(...pairs(4000, 0.00022, 0.01));
  assert.ok(weak.z > 1 && weak.z < 2.5, `z ${weak.z}`);
  assert.ok(weak.w > 0 && weak.w < 0.85, `w ${weak.w}`);
  assert.ok(Math.abs(weak.w - (1 - 1 / weak.z ** 2)) < 0.01);
  // (the same effect on four times the lines: z doubles, the weight grows)
  const more = softWeight(...pairs(16000, 0.00022, 0.01));
  assert.ok(more.w > weak.w);
  const strong = softWeight(...pairs(4000, 0.002, 0.01));
  assert.ok(strong.w > 0.95);
  assert.equal(softWeight(...pairs(4000, -0.0005, 0.01)).w, 0);
  // (a gain all in one half: the other half lost, none)
  const flip = softWeight(...pairs(4000, 0.0012, 0.01, { late: -0.0003 }));
  assert.ok(flip.z > 1);
  assert.equal(flip.w, 0);
  assert.equal(flip.why, 'a half lost');
});

test('the step cap: at most SOFT_DAY a day either way, a first run one day, held to 0..1', () => {
  assert.equal(SOFT_DAY, 0.25);
  assert.equal(softStep(0, 0.8), 0.25);
  assert.equal(softStep(0, 0.1), 0.1);
  assert.equal(softStep(0, 0.8, 1 / 24), 0.01);
  assert.equal(softStep(0.5, 0, 1), 0.25);
  assert.equal(softStep(0.5, 0, 3), 0.25);
  assert.equal(softStep(0.9, 1, 1), 1);
  assert.equal(softStep(0.2, 0.2, 0), 0.2);
  // (a week of hourly runs reaches a target of 0.6 and stays)
  let w = 0;
  for (let h = 0; h < 24 * 7; h++) w = softStep(w, 0.6, 1 / 24);
  assert.equal(w, 0.6);
});

test('which terms can be soft: a context flag or a blend off at 0, its own size and form; never the leak-prone or the ones off at another size', () => {
  for (const k of ['c_parkTB', 'c_qb1Out', 'pl', 'sp', 'tr', 'po', 'nt', 'sl']) assert.ok(softable(k), k);
  for (const k of ['mk', 'vl', 'vcM', 'ps', 'cs', 'ex', 'ep', 'od', 'rp', 'ij', 'ro', 'sn', 'dp', 'hl']) assert.ok(!softable(k), k);
  assert.ok(softEligible('c_parkTB', { c_parkTB: 0.5 }, ['gain']));
  assert.ok(softEligible('c_parkTB', { c_parkTB: 0.5 }, ['gain', 'bias', "all players' bias"]));
  assert.ok(softEligible('tr', { tr: 0.25, tf: 3 }, ['gain']));
  // (its own rows' bias, a side's, the fifths: not the whole stat's, never soft)
  assert.ok(!softEligible('c_qb1Out', { c_qb1Out: -0.1 }, ['gain', 'its own bias']));
  assert.ok(!softEligible('c_homeBat', { c_homeBat: 0.01 }, ["the favorites' bias"]));
  assert.ok(!softEligible('sl', { sl: 0.1 }, ['gain', 'fifths']));
  // (a size that moved another term with it (po's a): not its own)
  assert.ok(!softEligible('po', { po: 1, pg: 2, a: 0.5 }, ['gain']));
  assert.deepEqual(softSize('tr', { tr: 0.25, tf: 3 }, 0.4), { tr: 0.1, tf: 3 });
  assert.deepEqual(softSize('c_lastGame', { c_lastGame: -0.05 }, 0.5), { c_lastGame: -0.025 });
});

test("persistence: the last run's weight read on this run's size (same form and sign), else from 0", () => {
  const prev = { w: 0.4, size: { tr: 0.5, tf: 2 }, at: '2026-10-15T00:00:00Z' };
  assert.equal(softFrom(prev, 'tr', { tr: 0.5, tf: 2 }), 0.4);
  // (the grid's size halved: the same effect, twice the weight)
  assert.equal(softFrom(prev, 'tr', { tr: 0.25, tf: 2 }), 0.8);
  assert.equal(softFrom(prev, 'tr', { tr: 0.1, tf: 2 }), 1);
  assert.equal(softFrom(prev, 'tr', { tr: 0.5, tf: 3 }), 0);
  assert.equal(softFrom({ w: 0.4, size: { c_x: 0.05 } }, 'c_x', { c_x: -0.05 }), 0);
  assert.equal(softFrom(null, 'c_x', { c_x: 0.05 }), 0);
  assert.equal(softFrom({ w: 0, size: { c_x: 0.05 } }, 'c_x', { c_x: 0.05 }), 0);
});

test('the joint check: log loss lower than without the last term, both biases no larger than the hard-gated model; unmeasured fails', () => {
  const at = (ll, bias, all) => ({ check: Object.defineProperty({ bias }, 'llRaw', { value: ll }), all: { bias: all } });
  const hard = at(0.65, -0.2, 0.1);
  assert.deepEqual(softJoint(hard, at(0.649, -0.19, 0.1)), []);
  assert.deepEqual(softJoint(hard, at(0.65, -0.19, 0.1)), ['log loss']);
  assert.deepEqual(softJoint(hard, at(0.649, -0.21, 0.1)), ['bias']);
  assert.deepEqual(softJoint(hard, at(0.649, 0.2, -0.11)), ["all players' bias"]);
  // (against the set so far for the log loss, the hard-gated model for the bias)
  const mid = at(0.648, -0.15, 0.05);
  assert.deepEqual(softJoint(hard, at(0.6485, -0.18, 0.09), mid), ['log loss']);
  assert.deepEqual(softJoint(hard, at(0.6475, -0.18, 0.09), mid), []);
  assert.deepEqual(softJoint(hard, { check: { bias: 0 }, all: { bias: 0 } }), ['log loss not measured']);
  assert.deepEqual(softJoint(hard, at(0.6, null, 0)), ['bias']);
});

// (three seasons of a stat with the seasons' carryover searched (pl): every player's level his own, steady)
function carryRows() {
  const day = (season, g) => new Date(Date.UTC(season, 8, 1 + g * 7)).toISOString().replace('.000Z', 'Z');
  const r = rng(29);
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const lvl = 2 + (i % 6);
    for (const season of [2023, 2024, 2025]) {
      for (let g = 0; g < 16; g++) rows.push({ pid: `p${i}`, pos: 'WR', season, date: day(season, g), opp: `o${g % 4}`, team: `t${i % 8}`, game: `p${i}-${season}-${g}`, eligible: true, s: { rec: Math.max(0, Math.round(lvl + (r() - 0.5) * 4)) } });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

test("fitStat's soft stage: a term soft last run fades by the step (SOFT_DAY a day), kept only on the joint check, its weight saved for the next run; no soft state, the stat as the hard gate leaves it", () => {
  const rows = carryRows();
  const now = Date.parse('2026-10-15T12:00:00Z');
  const plain = fitStat({ key: 'rec', carry: true }, rows, {});
  // (nothing soft last run and none a candidate here (or one is): the soft stage leaves the hard-gated fit as it was
  // unless its joint check passed)
  assert.ok(plain.floors.soft);
  if (!plain.params.soft) assert.ok(!plain.floors.soft.terms.some((e) => e.kept));
  // (pl soft at 0.5 six hours ago, at 0.5 of its size: its weight moves at most a quarter of a day's step)
  const prev = { pl: { w: 0.5, target: 0.5, z: 1.5, size: { pl: 0.5 }, at: new Date(now - 6 * 36e5).toISOString() } };
  const fit = fitStat({ key: 'rec', carry: true }, rows, { soft: { prev, now } });
  const e = fit.floors.soft.terms.find((x) => x.key === 'pl');
  if (plain.params.pl) {
    // (the gate kept it outright: hard, in at its full size, nothing soft about it)
    assert.ok(fit.floors.soft.hard.includes('pl'));
    assert.equal(e, undefined);
    return;
  }
  assert.ok(e, 'pl among the soft terms');
  // (faded at its last size, or a candidate again at this run's: the last weight read on it)
  assert.equal(e.w0, softFrom(prev.pl, 'pl', { pl: e.size }));
  assert.ok(Math.abs(e.tried - e.w0) <= SOFT_DAY / 4 + 1e-9, `tried ${e.tried}`);
  if (e.kept) {
    assert.equal(fit.params.soft.pl.w, e.tried);
    assert.deepEqual(fit.params.soft.pl.size, { pl: e.size });
    assert.equal(fit.params.soft.pl.at, new Date(now).toISOString());
    assert.ok(Math.abs(fit.params.pl - fit.params.soft.pl.size.pl * e.tried) < 1e-4);
    assert.deepEqual(fit.floors.soft.joint.fails, []);
    assert.ok(fit.floors.soft.joint.soft.logLoss < fit.floors.soft.joint.hard.logLoss);
    // (the next run reads it back: same size, its weight where this run left it)
    assert.equal(softFrom(fit.params.soft.pl, 'pl', fit.params.soft.pl.size), e.tried);
  } else {
    // (the joint check failed: the hard-gated model alone, nothing soft saved)
    assert.ok(e.fails.length > 0 || fit.floors.soft.joint?.fails.length > 0);
    assert.equal(fit.params.soft, undefined);
    assert.ok(!fit.params.pl);
    assert.equal(fit.check.logLoss, plain.check.logLoss);
  }
});
