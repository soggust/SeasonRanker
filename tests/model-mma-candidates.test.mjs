// The fight model's candidates of the history round (libs/ranker/scripts/model/fights-model.mjs, fights-totals.mjs;
// DECISIONS.md D36): recency weights on the fit's rows, the first-listed (corner) term, the rating's deviation terms,
// the weight classes' offsets on the round totals' base. Each measured through the gate on 2026-10-19 and held (the
// numbers in the headers), so each stays a candidate behind its flag: off by default, the shipped model unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORNER, RATING_RD, RECENCY_HL, TERM_KEYS, featuresOf, freshFighter, recencyWeights, sideNumbers } from '../libs/ranker/scripts/model/fights-model.mjs';
import { CLASS_K, CLASS_OFFSETS, classOf, predictTotal } from '../libs/ranker/scripts/model/fights-totals.mjs';

test('the candidates are off by default: no recency half-life, no corner or deviation terms, no class offsets', () => {
  assert.equal(RECENCY_HL, null);
  assert.equal(CORNER, false);
  assert.equal(RATING_RD, false);
  assert.equal(CLASS_OFFSETS, false);
  for (const k of ['corner', 'rdGap', 'ratingRd']) assert.ok(!TERM_KEYS.includes(k), `${k} in the shipped terms`);
  const a = sideNumbers(freshFighter(), { r: 1600, rd: 100 }, null, null, Date.parse('2025-01-11'), 155);
  const b = sideNumbers(freshFighter(), { r: 1500, rd: 120 }, null, null, Date.parse('2025-01-11'), 155);
  const x = featuresOf(a, b);
  assert.ok(!('corner' in x) && !('rdGap' in x), 'no candidate term on a row');
});

test('recencyWeights: each row halves every hl years of age at the newest row, on top of its own weight; none without a half-life', () => {
  const rows = [
    { date: '2024-01-01', w: 1 },
    { date: '2022-01-01', w: 0.5 },
    { date: '2020-01-01' },
  ];
  const w = recencyWeights(rows, 2).map((r) => r.w);
  assert.ok(Math.abs(w[0] - 1) < 1e-9);
  assert.ok(Math.abs(w[1] - 0.25) < 1e-3, `two years back at a 2-year half-life: half, times its own half: ${w[1]}`);
  assert.ok(Math.abs(w[2] - 0.25) < 1e-3, `four years back: a quarter: ${w[2]}`);
  assert.deepEqual(recencyWeights(rows, null), rows);
  assert.deepEqual(recencyWeights([], 2), []);
});

test("predictTotal: a fit with class offsets adds the bout's class's shift to the line's base; without them, or for a class it has none for, the base alone", () => {
  const fit = { base: { l3_25: 0.4, l3_15: 1.2 }, means: { tTime: 1.4 }, terms: [{ key: 'tTime', weight: 0.5, scale: 0.2 }], classOffset: { Heavyweight: -0.3 } };
  const tx = { tTime: 1.4 };
  const base = predictTotal(fit, tx, 2.5, 3).p;
  const heavy = predictTotal(fit, tx, 2.5, 3, 'Heavyweight').p;
  const light = predictTotal(fit, tx, 2.5, 3, 'Lightweight').p;
  assert.ok(Math.abs(base - 1 / (1 + Math.exp(-0.4))) < 1e-9);
  assert.ok(Math.abs(heavy - 1 / (1 + Math.exp(-0.1))) < 1e-9, `the class's shift: ${heavy}`);
  assert.equal(light, base);
  assert.equal(predictTotal({ ...fit, classOffset: undefined }, tx, 2.5, 3, 'Heavyweight').p, base);
  assert.equal(predictTotal(fit, tx, 3.5, 3, 'Heavyweight'), null, 'a line its rounds do not carry');
  assert.equal(classOf('W Catch Weight 120'), 'W Catch Weight');
  assert.equal(classOf('Catchweight'), 'Catch Weight');
  assert.ok(CLASS_K > 0);
});
