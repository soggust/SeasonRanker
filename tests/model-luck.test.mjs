import { test } from 'node:test';
import assert from 'node:assert/strict';
import { luckOf, playable, rng } from '../libs/ranker/scripts/model/luck.mjs';

test('luck.mjs: the no-skill band centres on the vig, a planted edge is found with enough bets, pushes and unstaked rows left out', () => {
  const r = rng(3);
  const bets = Array.from({ length: 4000 }, () => ({ odds: -110, units: 1, fair: 0.5, p: 0.53, res: r() < 0.5 ? 'W' : 'L' }));
  assert.equal(playable([...bets, { odds: -110, units: 1, fair: 0.5, res: 'P' }, { odds: -110, units: 0, fair: 0.5, res: 'W' }]).length, 4000);
  const x = luckOf(bets, { sims: 2000 });
  // (at -110 and a fair coin each bet loses about 4.5% of its stake)
  assert.ok(Math.abs(x.luck.mean - -4000 * 0.0455) < 15, `the no-skill mean ${x.luck.mean}`);
  assert.ok(x.luck.p5 < x.luck.mean && x.luck.mean < x.luck.p95);
  assert.ok(x.claim.mean > x.luck.mean, 'the Bot claiming 53% promises more than no skill');
  const big = x.planted.find((p) => p.edge === 0.05);
  assert.ok(big.power > 0.95, '5 points over 4000 bets is found almost always');
  const small = x.planted.find((p) => p.edge === 0.01);
  assert.ok(small.power < big.power && small.need > 4000, 'a 1-point edge needs more bets than this');
  assert.deepEqual(luckOf(bets, { sims: 500 }), luckOf(bets, { sims: 500 }), 'seeded: the same every run');
});
