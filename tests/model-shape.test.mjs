// The reflected count (libs/ranker/scripts/model/project.mjs flip; DECISIONS.md D43): a left-skewed stat (a
// starter's outs) shaped as M - k at mean M - mu, the fit trying the stat's caps (props.mjs STATS flip) and keeping
// one only where the held-out games are better with it, as the dispersion's growth (rk) is kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chanceLog, chanceOver, impliedMean, lineChances, nbOver } from '../libs/ranker/scripts/model/project.mjs';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';

const pmf = (params, mu, M = 60) => Array.from({ length: M + 1 }, (_, k) => Math.exp(chanceLog(k, mu, params)));

test('D43 the reflected count: a proper distribution under its cap, left-skewed (the median at or above the mean), more mass over the line than the plain shape at the same mean', () => {
  const flip = { r: 16, rk: 0, flip: 24 };
  const plain = { r: 16, rk: 0 };
  const p = pmf(flip, 16, 24);
  // (the mass past the cap's reflection (a start of under 0 outs) is what the shape loses: a few thousandths at most)
  const total = p.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 1) < 2e-3, `sums to 1 under the cap: ${total}`);
  const mean = p.reduce((s, v, k) => s + k * v, 0);
  assert.ok(Math.abs(mean - 16) < 0.05, `the mean is the projection: ${mean}`);
  let cdf = 0;
  let median = null;
  p.forEach((v, k) => {
    cdf += v;
    if (median === null && cdf >= 0.5) median = k;
  });
  assert.ok(median >= 16, `the median at or above the mean: ${median}`);
  const skew = p.reduce((s, v, k) => s + v * (k - mean) ** 3, 0);
  assert.ok(skew < 0, 'left-skewed');
  assert.ok(chanceOver(15.5, 16, flip) > chanceOver(15.5, 16, plain), 'more over the line at the mean');
  assert.ok(chanceOver(20.5, 16, flip) < chanceOver(20.5, 16, plain), 'less far over it');
  // (over the line is the pmf's tail exactly)
  const tail = p.slice(16).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(chanceOver(15.5, 16, flip) - tail) < 1e-9);
  assert.equal(chanceOver(23.5, 16, flip), nbOver(23.5, 16, 16), "a line the cap can't clear reads the plain shape: nothing priced impossible");
  assert.equal(chanceOver(15.5, 24, flip), nbOver(15.5, 24, 16), 'a mean at the cap reads the plain shape');
  assert.equal(chanceOver(15.5, 16, { r: 16, rk: 0, flip: 0 }), nbOver(15.5, 16, 16), 'no cap: the plain shape');
  // (the implied mean is searched under the cap and inverts the shape)
  const im = impliedMean(15.5, 0.5, flip);
  assert.ok(im < 24 && Math.abs(lineChances(15.5, im, flip).over - 0.5) < 1e-6, `implied ${im}`);
});

test('D43 the outs stat tries its caps and strikeouts stay plain; the fit gates the cap held out like rk', () => {
  const outs = STATS.mlb.find((s) => s.key === 'outs');
  const k = STATS.mlb.find((s) => s.key === 'k');
  assert.deepEqual(outs.flip, [21, 24, 27]);
  assert.equal(k.flip, undefined);
  const src = fs.readFileSync(path.resolve('libs/ranker/scripts/model/project.mjs'), 'utf8');
  assert.ok(/const plain = \{ r: best\.r, rk: 0, flip: 0 \};/.test(src));
  assert.ok(/for \(const flip of Array\.isArray\(stat\.flip\) \? stat\.flip : \[\]\)/.test(src), 'the caps tried in the shape search');
  assert.ok(/if \(params\.flip\) \{\s*const without = heldOut\(\{ \.\.\.params, \.\.\.plain \}\);\s*const raw = gainOf\(without\.check, current\.check\);\s*gains\.flip = r4\(raw\);\s*if \(!\(raw > 0\)\)/.test(src), 'kept only where the held-out games are better');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D43.'));
});
