// The role bets' gate reads every graded CHECK of its cause, the closed ones too (the loss review's B13, 2026-10-18;
// run.mjs roleGateOf(checkLearning(checks.map(reopened)))): checkLearning reads the open CHECKs alone, so the gate
// read a survivor set (the NFL's group-out bet at 35-31 while its every graded CHECK was 36-35, under break-even).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLearning, reopened } from '../libs/ranker/scripts/model/check-learn.mjs';
import { ROLE_BET_N, roleGateOf } from '../libs/ranker/scripts/model/props.mjs';

const check = (i, status, closed = false) => ({
  id: `c${i}`,
  market: 'prop',
  propType: 'rec',
  odds: -110,
  diagnosis: { cause: 'role', sub: 'group-out' },
  checkResult: { status, profit: status === 'won' ? 100 / 110 : -1, final: 'x', gradedAt: '2026-10-11T00:00:00Z' },
  ...(closed ? { closedAt: '2026-10-10T00:00:00Z' } : {}),
});

test('a cause whose open CHECKs pay but whose closed ones lost: its record with them all, the gate off', () => {
  // (open: 26 won, 20 lost, past break-even; closed since: 2 won, 10 lost)
  const checks = [...Array.from({ length: 46 }, (_, i) => check(i, i < 26 ? 'won' : 'lost')), ...Array.from({ length: 12 }, (_, i) => check(100 + i, i < 2 ? 'won' : 'lost', true))];
  const survivors = roleGateOf(checkLearning(checks))['group-out'];
  assert.equal(survivors.on, true, 'the open ones alone pay');
  const all = roleGateOf(checkLearning(checks.map(reopened)))['group-out'];
  assert.equal(all.n, 58);
  assert.equal(all.on, false);
  assert.ok(all.n >= ROLE_BET_N);
  // (the CHECK itself left as it was)
  assert.ok(checks[50].closedAt);
  assert.equal(reopened(checks[0]), checks[0]);
});
