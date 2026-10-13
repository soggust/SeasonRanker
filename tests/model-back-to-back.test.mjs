// The back-to-backs on the props (audit #6): the other side's (oppB2b), the NBA's own by role (b2bS, b2bB), the
// stats that carry them (an NHL goalie's saves his side's; an NBA bench player's own in place of one size for
// every player) and the write-up's words (libs/ranker/scripts/model/props.mjs CTX, STATS; writeup.mjs ctxWhat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctxKeys } from '../libs/ranker/scripts/model/project.mjs';
import { CTX, STATS, ctxValues } from '../libs/ranker/scripts/model/props.mjs';
import { ctxWhat } from '../libs/ranker/scripts/model/writeup.mjs';

test("the back-to-backs by side: his own, the other side's, and none known (no effect)", () => {
  const info = { b2b: [1, 0] };
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], info, true, null), [1, 0]);
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], info, false, null), [0, 1]);
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], {}, true, null), [0, 0]);
  assert.deepEqual(ctxValues(['b2b', 'oppB2b'], null, false, null), [0, 0]);
});

test("an NBA player's own back-to-back by his role: a starter's or a bench player's, none without a role", () => {
  const info = { b2b: [1, 1] };
  assert.equal(CTX.b2bS(info, true, null, { role: 'S' }), 1);
  assert.equal(CTX.b2bB(info, true, null, { role: 'S' }), 0);
  assert.equal(CTX.b2bB(info, false, null, { role: 'B' }), 1);
  assert.equal(CTX.b2bS(info, false, null, { role: 'B' }), 0);
  // (no role read (under three games): neither, the old projection)
  assert.equal(CTX.b2bB(info, true, null, { role: null }), 0);
  assert.equal(CTX.b2bB(info, true, null, null), 0);
  // (his side not on one: 0 whatever his role)
  assert.equal(CTX.b2bB({ b2b: [0, 1] }, true, null, { role: 'B' }), 0);
});

test("the stats' back-to-backs: the NBA's bench one in place of the one size, the NHL's on a goalie's saves", () => {
  for (const st of STATS.nba) {
    assert.ok(ctxKeys(st).includes('b2bB'), st.key);
    assert.ok(!ctxKeys(st).includes('b2b') && !ctxKeys(st).includes('b2bS') && !ctxKeys(st).includes('oppB2b'), st.key);
  }
  assert.deepEqual(ctxKeys(STATS.nhl.find((s) => s.key === 'saves')), ['oppShots', 'b2b']);
  assert.deepEqual(ctxKeys(STATS.nhl.find((s) => s.key === 'sog')), ['pp']);
  assert.deepEqual(ctxKeys(STATS.nhl.find((s) => s.key === 'pts')), ['pp', 'oppGoalie']);
});

test("the write-up names a back-to-back when it moved the projection most", () => {
  const bet = (ctx, applied) => ({ projection: { ctx, applied } });
  assert.equal(ctxWhat(bet({ usage: 0, b2bB: 1 }, { c_b2bB: 0.1 }), { bet: { team: 'BOS' } }), 'a back-to-back (more bench minutes)');
  assert.equal(ctxWhat(bet({ oppShots: 0, b2b: 1 }, { c_b2b: 0.03 }), { bet: { team: 'BOS', opponent: 'TOR' } }), 'a back-to-back');
  assert.equal(ctxWhat(bet({ oppB2b: 1 }, { c_oppB2b: 0.05 }), { bet: { team: 'BOS', opponent: 'TOR' } }), 'TOR on a back-to-back');
});
