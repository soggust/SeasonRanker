// The role backtest (libs/ranker/scripts/model/role-backtest.mjs, measurement only): each row's situation from
// what was known before its game (a backup quarterback starting, a fill-in for a regular out, a snap jump, an
// established starter by week, everyone else), and a bucket's bias and log loss with intervals from a bootstrap
// clustered by team-week.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCKETS, nbLoss, preGame, report, summarize } from '../libs/ranker/scripts/model/role-backtest.mjs';

// (a team's game: [pid, pos, passAtt, rushAtt, targets, snaps])
const game = (id, date, season, list) =>
  list.map(([pid, pos, passAtt = 0, rushAtt = 0, targets = 0, snaps = 0]) => ({ pid, pos, date, season, team: '1', opp: '2', game: id, s: { passAtt, rushAtt, targets, snaps } }));
const full = (id, date) =>
  game(id, date, 2026, [
    ['q1', 'QB', 30, 2, 0, 60],
    ['q2', 'QB', 0, 0, 0, 2],
    ['r1', 'RB', 0, 15, 3, 40],
    ['r2', 'RB', 0, 3, 0, 15],
    ['w1', 'WR', 0, 0, 8, 55],
    ['w2', 'WR', 0, 0, 2, 20],
  ]);

test('preGame: a backup quarterback starting, the next man up, a snap jump, a starter by week, from before each game', () => {
  const last = Array.from({ length: 8 }, (_, k) => game(`p${k}`, `2025-10-${String(k + 10).padStart(2, '0')}`, 2025, [['w1', 'WR', 0, 0, 8, 55], ['x', 'QB', 30, 0, 0, 60]]).map((r) => (r.pid === 'x' ? { ...r, team: '9' } : r))).flat();
  const rows = [
    ...last,
    ...full('g1', '2026-09-10'),
    ...full('g2', '2026-09-17'),
    // (week 3: the regular back on reserve and not in the game; the depth receiver's snaps jump)
    ...full('g3', '2026-09-24').filter((r) => r.pid !== 'r1').map((r) => (r.pid === 'w2' ? { ...r, s: { ...r.s, snaps: 50 } } : r)),
    // (week 4: the quarterback ruled out, his backup starts)
    ...full('g4', '2026-10-01').filter((r) => r.pid !== 'q1').map((r) => (r.pid === 'q2' ? { ...r, s: { ...r.s, passAtt: 31, snaps: 60 } } : r)),
  ];
  const weeks = { g1: 1, g2: 2, g3: 3, g4: 4 };
  const listed = { 3: new Map([['r1', 'reserve']]), 4: new Map([['q1', 'report'], ['r1', 'reserve']]) };
  const s = preGame(rows, { weekOf: (g) => (weeks[g] ? { season: 2026, week: weeks[g] } : { season: 2025, week: 9 }), outOf: (season, week) => listed[week] ?? new Map() });
  const at = (g, pid) => s.get(`${g}|${pid}`);
  // (week 3: the next man up behind the back on reserve; the receiver who'd started all last season by week)
  assert.equal(at('g3', 'r2').bucket, 'next-up');
  assert.equal(at('g3', 'w1').bucket, 'starter-w1-4');
  assert.equal(at('g3', 'q2').bucket, 'other');
  // (the jump is read from the games before: week 3's own snaps don't count for week 3)
  assert.equal(at('g3', 'w2').flags.snapJump, false);
  // (week 4: the backup quarterback, the teammates of a team whose QB1 is out; the depth receiver's jump seen)
  assert.equal(at('g4', 'q2').bucket, 'backup-qb');
  assert.equal(at('g4', 'w1').bucket, 'qb1-out');
  assert.equal(at('g4', 'w2').flags.snapJump, true);
  assert.equal(at('g1', 'w1').week, 1);
  // (a reserve listing for one who played is the roster's move after the game: not out)
  const played = preGame(full('g1', '2026-09-10').concat(full('g2', '2026-09-17')), { weekOf: (g) => ({ season: 2026, week: g === 'g1' ? 1 : 2 }), outOf: (season, week) => (week === 2 ? new Map([['r1', 'reserve']]) : new Map()) });
  assert.equal(played.get('g2|r2').bucket, 'other');
  for (const v of s.values()) assert.ok(BUCKETS.includes(v.bucket));
});

test('summarize: bias, log loss and how often over, the intervals from whole team-weeks, the same every run', () => {
  const items = [];
  for (let c = 0; c < 40; c++) for (let k = 0; k < 3; k++) items.push({ v: 10 + ((c * 7 + k) % 9), mu: 12, ll: 2 + (c % 5) / 10, cluster: `t${c}` });
  const a = summarize(items, { boot: 200 });
  const b = summarize(items, { boot: 200 });
  assert.deepEqual(a, b);
  assert.equal(a.n, 120);
  assert.equal(a.clusters, 40);
  const v = items.reduce((t, x) => t + x.v, 0);
  assert.ok(Math.abs(a.bias - (v / (12 * 120) - 1)) < 1e-12);
  assert.ok(a.biasCi[0] <= a.bias && a.bias <= a.biasCi[1]);
  assert.ok(a.llCi[0] <= a.ll && a.ll <= a.llCi[1]);
  assert.equal(a.gainScaled, null);
  assert.equal(summarize([]), null);
  // (a projection scaled by its own bias saves log loss, in sample)
  const params = { r: 10 };
  const biased = items.map((x) => ({ ...x, ll: nbLoss(x.v, x.mu, params), llScaled: nbLoss(x.v, x.mu * (v / (12 * 120)), params) }));
  assert.ok(summarize(biased, { boot: 50 }).gainScaled > 0);
});

test('report: a headline line and a table per stat', () => {
  const s = summarize([{ v: 5, mu: 4, ll: 1, cluster: 'a' }, { v: 6, mu: 4, ll: 1, cluster: 'b' }], { boot: 20 });
  const md = report({ rec: { cuts: ['2020-01-01', '2023-01-01'], params: { K: 2 }, buckets: { 'backup-qb': s, all: s }, periods: { 'held out': { all: s } } } });
  assert.match(md, /^# Role backtest/);
  assert.match(md, /## rec/);
  assert.match(md, /\| backup-qb \| 2 \| 2 \|/);
});
