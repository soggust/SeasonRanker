// The game lines gated by CLV (round D, 2026-10-17, the owner's #5; libs/ranker/scripts/model/desk.mjs lineGate): a
// sport's spreads, moneylines and totals are tracked, not bet, while its CLV (each bet's ev at the close) over its
// last 200 graded line bets is negative, and bet again once it's positive; under 40 graded with a close, too few to
// judge; props never gated here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_GATE_MIN, LINE_GATE_N, lineGate } from '../libs/ranker/scripts/model/desk.mjs';

const bet = (i, ev, extra = {}) => ({ id: `b${i}`, sport: 'nhl', market: ['spread', 'ml', 'total'][i % 3], status: i % 2 ? 'won' : 'lost', gradedAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString(), clv: { ev, prob: ev / 2, beat: ev > 0 }, ...extra });

test('under the minimum graded: on, said so; props, voids, open rows and other sports never count', () => {
  const bets = [
    ...Array.from({ length: LINE_GATE_MIN - 1 }, (_, i) => bet(i, -0.05)),
    bet(100, -0.9, { market: 'prop' }),
    bet(101, -0.9, { void: true }),
    bet(102, -0.9, { status: 'open' }),
    bet(103, -0.9, { sport: 'nba' }),
    bet(104, -0.9, { clv: null }),
  ];
  const g = lineGate(bets, 'nhl');
  assert.equal(g.on, true);
  assert.equal(g.n, LINE_GATE_MIN - 1);
  assert.match(g.why, /under 40/);
  assert.equal(lineGate([], 'nfl').on, true);
});

test('negative CLV over the window: off (tracked only); positive: on; the window is the last 200 graded', () => {
  const off = lineGate(Array.from({ length: 60 }, (_, i) => bet(i, i % 2 ? -0.06 : -0.02)), 'nhl');
  assert.equal(off.on, false);
  assert.equal(off.n, 60);
  assert.ok(off.ev < 0, `ev ${off.ev}`);
  assert.match(off.why, /tracked, not bet/);
  const on = lineGate(Array.from({ length: 60 }, (_, i) => bet(i, 0.01)), 'nhl');
  assert.equal(on.on, true);
  assert.equal(on.ev, 0.01);
  assert.equal(on.beat, 1);
  // (300 graded: the oldest 100 at -0.5 fall out of the window, the last 200 at +0.01 carry it)
  const window = lineGate([...Array.from({ length: 100 }, (_, i) => bet(i, -0.5)), ...Array.from({ length: 200 }, (_, i) => bet(100 + i, 0.01))], 'nhl');
  assert.equal(window.n, LINE_GATE_N);
  assert.equal(window.on, true);
  assert.equal(window.ev, 0.01);
  // (and the other way: a sport gated comes back once its last 200 read positive)
  const back = lineGate([...Array.from({ length: 250 }, (_, i) => bet(i, -0.1)), ...Array.from({ length: 200 }, (_, i) => bet(250 + i, 0.02))], 'nhl');
  assert.equal(back.on, true);
});
