// The pull toward the middle (sl) and the recalibration by side (cs): libs/ranker/scripts/model/project.mjs
// middleF, calAt, lineChances, impliedMean, fifthsOf, and the live projection's (props.mjs) the same as the
// history's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SL_CAP, calAt, fifthsOf, impliedMean, lineChances, makeModel, middleF, nbOver, recal } from '../libs/ranker/scripts/model/project.mjs';
import { SKEW_MIN_LINE } from '../libs/ranker/scripts/model/props.mjs';

test('middleF: off at sl 0 or no rm; a low projection pulled up, a high one down, held to SL_CAP', () => {
  assert.equal(middleF({ sl: 0, rm: 4 }, 1), 1);
  assert.equal(middleF({ sl: 0.2 }, 1), 1);
  assert.equal(middleF({ sl: 0.2, rm: 4 }, 0), 1);
  assert.equal(middleF({ sl: 0.2, rm: 4 }, 4), 1);
  const low = middleF({ sl: 0.2, rm: 4 }, 2);
  const high = middleF({ sl: 0.2, rm: 4 }, 8);
  assert.ok(low > 1 && high < 1);
  // (on the log: x' = rm x (x / rm)^(1 - sl))
  assert.ok(Math.abs(2 * low - 4 * Math.pow(0.5, 0.8)) < 1e-9);
  // (a backup's tiny projection isn't tripled)
  assert.equal(middleF({ sl: 0.4, rm: 50 }, 0.1), SL_CAP);
  assert.equal(middleF({ sl: 0.4, rm: 0.1 }, 50), 1 / SL_CAP);
  // (under 0: pushed out)
  assert.ok(middleF({ sl: -0.1, rm: 4 }, 2) < 1);
});

test('makeModel: the pull on the factors before the lean, its factor on the projection (slF)', () => {
  const stat = { key: 'rec' };
  const base = { K: 4, w: 0, a: 0, b: 0, scale: 1, rm: 4 };
  const rows = [1, 2, 3, 4].map((d) => ({ pid: 'x', pos: 'WR', season: 2025, date: `2025-09-0${d}`, opp: 'o', s: { rec: 2 } }));
  const at = (params) => {
    const m = makeModel(stat, params, {});
    m.learn(rows);
    return m.project({ pid: 'x', pos: 'WR', season: 2025, date: '2025-09-10', opp: 'o' });
  };
  const off = at(base);
  const on = at({ ...base, sl: 0.25 });
  assert.equal(off.slF, 1);
  assert.ok(on.slF > 1, `pulled up: ${on.slF}`);
  assert.ok(Math.abs(on.mu - off.mu * on.slF) < 1e-9);
});

test('calAt / lineChances: each side of the projection its own recalibration where the fit kept it, else cal', () => {
  const cal = [0.1, 1];
  const calSide = [[0.3, 1], [-0.2, 1.1]];
  assert.deepEqual(calAt({ cal }, 5, 4.5), cal);
  assert.deepEqual(calAt({ cal, calSide }, 5, 4.5), calSide[0]);
  assert.deepEqual(calAt({ cal, calSide }, 4, 4.5), calSide[1]);
  // (a side with too few lines: none of its own, cal)
  assert.deepEqual(calAt({ cal, calSide: [null, calSide[1]] }, 5, 4.5), cal);
  assert.equal(calAt({}, 5, 4.5), null);
  const params = { r: 10, cal, calSide };
  assert.ok(Math.abs(lineChances(4.5, 5, params).over - recal(nbOver(4.5, 5, 10), calSide[0])) < 1e-9);
  assert.ok(Math.abs(lineChances(5.5, 5, params).over - recal(nbOver(5.5, 5, 10), calSide[1])) < 1e-9);
  // (the price's implied mean reads the spread alone, no recalibration either way)
  assert.equal(impliedMean(5.5, 0.5, params), impliedMean(5.5, 0.5, { r: 10 }));
});

test("fifthsOf: the lowest to the highest fifth by projection, each one's actual over projected", () => {
  assert.equal(fifthsOf([]), null);
  // (projections 1 to 100; the low ones ran 20% over, the rest even)
  const list = Array.from({ length: 100 }, (_, i) => ({ p: { mu: i + 1 }, v: i < 20 ? (i + 1) * 1.2 : i + 1 }));
  const f = fifthsOf(list);
  assert.equal(f.length, 5);
  assert.equal(f[0].n, 20);
  assert.equal(f[0].lo, 1);
  assert.equal(f[4].hi, 100);
  assert.ok(Math.abs(f[0].ratio - 0.2) < 1e-4);
  assert.equal(f[3].ratio, 0);
});

test('SKEW_MIN_LINE: props.mjs reads project.mjs\'s, the held-out check\'s skew rows the same', () => {
  assert.equal(SKEW_MIN_LINE, 5);
});
