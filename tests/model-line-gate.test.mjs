// The game lines gated by CLV (round D, 2026-10-17, the owner's #5; libs/ranker/scripts/model/desk.mjs lineGate),
// made a practice stake the same day (the owner: "why would it stop betting? it should reset everything on an
// algorithm change, and it needs practice and data"): while a sport's CLV (each bet's ev at the close) over its last
// 200 graded line bets since the epoch is negative, its lines are still bet by their normal rules at 0.5u, never
// tracked for the gate's sake; under 40 graded with a close since the epoch, too few to judge, full stakes. The
// props' gate by stat the same, and the research bets' auto-off a 0.5u cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_GATE_MIN, LINE_GATE_N, PRACTICE_UNITS, gatedPlacement, lineGate, practiceGates, propGate } from '../libs/ranker/scripts/model/desk.mjs';
import { MODEL_EPOCH } from '../libs/ranker/scripts/model/leagues.mjs';
import { levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { researchCall, researchGateOf } from '../libs/ranker/scripts/model/research.mjs';
import { TOTAL_LIVE, liveCount, totalPickFor } from '../libs/ranker/scripts/model/fights-totals.mjs';

const bet = (i, ev, extra = {}) => ({ id: `b${i}`, sport: 'nhl', market: ['spread', 'ml', 'total'][i % 3], status: i % 2 ? 'won' : 'lost', gradedAt: new Date(Date.UTC(2026, 9, 1, i)).toISOString(), clv: { ev, prob: ev / 2, beat: ev > 0 }, ...extra });

test('under the minimum graded: full stakes, said so; props, voids, open rows and other sports never count', () => {
  const bets = [
    ...Array.from({ length: LINE_GATE_MIN - 1 }, (_, i) => bet(i, -0.05)),
    bet(100, -0.9, { market: 'prop' }),
    bet(101, -0.9, { void: true }),
    bet(102, -0.9, { status: 'open' }),
    bet(103, -0.9, { sport: 'nba' }),
    bet(104, -0.9, { clv: null }),
  ];
  const g = lineGate(bets, 'nhl', null);
  assert.equal(g.on, true);
  assert.equal(g.practice, false);
  assert.equal(g.n, LINE_GATE_MIN - 1);
  assert.match(g.why, /under 40/);
  assert.equal(lineGate([], 'nfl').on, true);
});

test('negative CLV over the window: the practice stake; positive: full stakes; the window is the last 200 graded', () => {
  const off = lineGate(Array.from({ length: 60 }, (_, i) => bet(i, i % 2 ? -0.06 : -0.02)), 'nhl', null);
  assert.equal(off.on, false);
  assert.equal(off.practice, true);
  assert.equal(off.n, 60);
  assert.ok(off.ev < 0, `ev ${off.ev}`);
  assert.equal(off.why, `practice stake: CLV ${off.ev} over 60`);
  const on = lineGate(Array.from({ length: 60 }, (_, i) => bet(i, 0.01)), 'nhl', null);
  assert.equal(on.on, true);
  assert.equal(on.ev, 0.01);
  assert.equal(on.beat, 1);
  // (300 graded: the oldest 100 at -0.5 fall out of the window, the last 200 at +0.01 carry it)
  const window = lineGate([...Array.from({ length: 100 }, (_, i) => bet(i, -0.5)), ...Array.from({ length: 200 }, (_, i) => bet(100 + i, 0.01))], 'nhl', null);
  assert.equal(window.n, LINE_GATE_N);
  assert.equal(window.on, true);
  assert.equal(window.ev, 0.01);
  const back = lineGate([...Array.from({ length: 250 }, (_, i) => bet(i, -0.1)), ...Array.from({ length: 200 }, (_, i) => bet(250 + i, 0.02))], 'nhl', null);
  assert.equal(back.on, true);
});

test('a failing CLV gate yields 0.5u bets, never tracked rows; an edge still needed; a LIKE at most', () => {
  const off = lineGate(Array.from({ length: 60 }, (_, i) => bet(i, -0.04)), 'nhl', null);
  const placed = gatedPlacement(true, 2, off);
  assert.equal(placed.intent, 'edge');
  assert.equal(placed.units, PRACTICE_UNITS);
  assert.equal(PRACTICE_UNITS, 0.5);
  assert.equal(placed.practice, 'practice stake: CLV -0.04 over 60');
  // (no edge: tracked as ever, the gate not the reason)
  const none = gatedPlacement(false, 2, off);
  assert.equal(none.intent, 'track');
  assert.equal(none.practice, undefined);
  // (a passing gate, or none: full stakes)
  assert.deepEqual(gatedPlacement(true, 2, { on: true }), { intent: 'edge', units: 2 });
  assert.deepEqual(gatedPlacement(true, 2, null), { intent: 'edge', units: 2 });
  // (a practice bet a LIKE ('medium') at most, whatever its Kelly)
  assert.equal(levelOf({ intent: 'edge', p: 0.7, practice: placed.practice }, 0.3), 'medium');
  // (the props' gate the same: a failing stat bet at 0.5u)
  const props = propGate(Array.from({ length: 50 }, (_, i) => bet(i, -0.03, { market: 'prop', propType: 'sog' })), 'nhl', null);
  assert.equal(props.sog.practice, true);
  assert.equal(gatedPlacement(true, 1.5, props.sog).units, 0.5);
  assert.equal(gatedPlacement(true, 1.5, props.sog).intent, 'edge');
});

test('the epoch reset: only bets placed since MODEL_EPOCH count, so a model change starts every gate over at full stakes', () => {
  const before = new Date(Date.parse(MODEL_EPOCH) - 864e5).toISOString();
  const after = new Date(Date.parse(MODEL_EPOCH) + 36e5).toISOString();
  const old = Array.from({ length: 185 }, (_, i) => bet(i, -0.0347, { placedAt: before }));
  const g = lineGate(old, 'nhl');
  assert.equal(g.epoch, MODEL_EPOCH);
  assert.equal(g.n, 0);
  assert.equal(g.on, true);
  assert.deepEqual(propGate(old.map((b) => ({ ...b, market: 'prop', propType: 'pts' })), 'nhl'), {});
  // (since the epoch, 40 negative: the practice stake again)
  const fresh = [...old, ...Array.from({ length: LINE_GATE_MIN }, (_, i) => bet(500 + i, -0.02, { placedAt: after }))];
  const h = lineGate(fresh, 'nhl');
  assert.equal(h.n, LINE_GATE_MIN);
  assert.equal(h.practice, true);
  // (and MMA's round totals counted since the league's own start)
  const tot = (at) => ({ market: 'total', status: 'won', clv: { q: 0.5 }, placedAt: at });
  assert.equal(liveCount([tot(before), tot(after)], MODEL_EPOCH), 1);
  assert.equal(liveCount([tot(before), tot(after)]), 2);
});

test("the research bets' auto-off becomes a 0.5u cap: the research still bets, at the practice stake", () => {
  const rb = (profit) => ({ researchBet: { check: 'x' }, status: profit > 0 ? 'won' : 'lost', profit, clv: { ev: 0.01, beat: true } });
  const raw = researchGateOf(Array.from({ length: 40 }, (_, i) => rb(i < 18 ? 0.45 : -0.5)));
  assert.equal(raw.bet.on, false);
  const g = practiceGates(raw);
  assert.equal(g.bet.on, true);
  assert.equal(g.bet.practice, true);
  assert.match(g.bet.why, /^practice stake \(0.5u at most\)/);
  assert.equal(g.adjusted.practice, false);
  // (a CHECK the research found no reason for: the verdict isn't turned away by the gate)
  const c = { id: 'c1', start: new Date(Date.now() + 864e5).toISOString(), cause: 'gap' };
  const rs = { explains: false, confidence: 'high', category: 'market', summary: 'nothing', sources: ['https://a.b'] };
  const offCall = researchCall(c, rs, { now: new Date(), gate: raw });
  const call = researchCall(c, rs, { now: new Date(), gate: g });
  assert.notEqual(call.why, raw.bet.why);
  if (offCall.act === 'check' && offCall.why === raw.bet.why) assert.equal(call.act, 'bet');
  if (call.act === 'bet') assert.ok(call.units <= PRACTICE_UNITS);
});

test('MMA round totals: under TOTAL_LIVE graded with a close, an edge is bet at the practice stake, not tracked', () => {
  const lines = { line: 2.5, odds: { over: -110, under: -110 }, fair: 0.5 };
  const p = totalPickFor(0.56, lines, 0.5, { live: false });
  assert.equal(p.placed.intent, 'edge');
  assert.equal(p.placed.units, PRACTICE_UNITS);
  assert.match(p.placed.practice, new RegExp(`till ${TOTAL_LIVE}`));
  assert.equal(totalPickFor(0.5, lines, 0.5, { live: false }).placed.intent, 'track');
});
