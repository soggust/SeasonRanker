// The next man up and the injury return (libs/ranker/scripts/model): the role a player steps into with his
// group's missing ones out of the order and the missing one's snap share (matchups.mjs roleUp, leadShare;
// project.mjs rp, nu), and a player back from an absence (matchups.mjs back, ret; project.mjs ij, ia, ir): the
// game he left hurt and the games he was eased back in weighed down, the game tonight eased by the returners'
// ramp. Each off, the model exactly as before; the role backtest's returner bucket and its fit's tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { isBack, makeModel, typicalIdx, typicalShares } from '../libs/ranker/scripts/model/project.mjs';
import { BUCKETS, movedTable, preGame } from '../libs/ranker/scripts/model/role-backtest.mjs';

// (a team's game: [pid, pos, targets, snaps, rec])
const game = (id, date, list, season = 2026) =>
  list.map(([pid, pos, targets = 0, snaps = 0, rec = 0]) => ({ pid, name: pid, pos, date, season, team: '1', opp: '2', game: id, home: true, s: { targets, snaps, rec, rushAtt: 0, passAtt: pos === 'QB' ? 30 : 0 } }));
const day = (d) => `2026-09-${String(d).padStart(2, '0')}T17:00Z`;

test('nflMatchups: the next man up steps into the missing one\'s role (roleUp) and sees his snap share (leadShare); the role as before', () => {
  const rows = [];
  for (let d = 1; d <= 3; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['t1', 'TE', 6, 56], ['t2', 'TE', 2, 28], ['w', 'WR', 8, 66]]));
  // (the TE1 not in the game's logs: the TE2 its TE1 tonight, the TE1's 80% his to step into)
  rows.push(...game('a4', day(4), [['q', 'QB', 0, 70], ['t2', 'TE', 4, 50], ['w', 'WR', 8, 66]]));
  const m = nflMatchups(rows);
  const r = rows.find((x) => x.game === 'a4' && x.pid === 't2');
  assert.equal(r.role, 'TE2+');
  assert.equal(r.roleUp, 'TE1');
  assert.equal(r.leadShare, 0.8);
  // (with everyone here, the role as it was and no lead share)
  const r3 = rows.find((x) => x.game === 'a3' && x.pid === 't2');
  assert.equal(r3.roleUp, 'TE2+');
  assert.equal(r3.leadShare, null);
  // (at bet time: out by the report (1) promotes him; questionable (a half) doesn't)
  assert.equal(m.live('t2', '1', '2', 'TE', 2026, new Set(['t1'])).roleUp, 'TE1');
  assert.equal(m.live('t2', '1', '2', 'TE', 2026, (id) => (id === 't1' ? 0.5 : 0)).roleUp, 'TE2+');
  assert.equal(m.live('t2', '1', '2', 'TE', 2026, null).role, 'TE2+');
});

test('nflMatchups: back (his team\'s games he missed just before this one) and ret (his game since coming back, to 3)', () => {
  const rows = [];
  for (let d = 1; d <= 2; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['w', 'WR', 8, 60]]));
  // (two games out, then four back)
  for (let d = 3; d <= 4; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70]]));
  for (let d = 5; d <= 8; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['w', 'WR', 8, d === 5 ? 30 : 60]]));
  const m = nflMatchups(rows);
  const at = (d) => rows.find((x) => x.game === `a${d}` && x.pid === 'w');
  assert.equal(at(2).back, 0);
  assert.equal(at(2).ret, null);
  assert.equal(at(5).back, 2);
  assert.deepEqual(at(5).ret, { k: 1, len: 2 });
  assert.deepEqual(at(6).ret, { k: 2, len: 2 });
  assert.deepEqual(at(7).ret, { k: 3, len: 2 });
  assert.equal(at(8).ret, null);
  // (at bet time: one game out tonight's return, his first back)
  const more = [...rows, ...game('a9', day(9), [['q', 'QB', 0, 70]])];
  const live = nflMatchups(more).live('w', '1', '2', 'WR', 2026, null);
  assert.equal(live.back, 1);
  assert.deepEqual(live.ret, { k: 1, len: 1 });
  assert.equal(isBack({ ret: live.ret }, 1), true);
  assert.equal(isBack({ ret: live.ret }, 2), false);
});

test("nflMatchups: an absence with a game whose snap counts weren't read is no return, and no one is promoted in such a game", () => {
  const rows = [];
  for (let d = 1; d <= 2; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['t1', 'TE', 6, 56], ['t2', 'TE', 2, 28]]));
  // (game 3's counts not read: only the players with a stat in its logs, the TE1 among the missing)
  rows.push(...game('a3', day(3), [['q', 'QB', 0, 0], ['t2', 'TE', 3, 0]]));
  rows.push(...game('a4', day(4), [['q', 'QB', 0, 70], ['t1', 'TE', 6, 56], ['t2', 'TE', 2, 28]]));
  const m = nflMatchups(rows);
  const at = (d, pid) => rows.find((x) => x.game === `a${d}` && x.pid === pid);
  assert.equal(at(3, 't2').roleUp, 'TE2+');
  assert.equal(at(3, 't2').leadShare, null);
  assert.equal(at(4, 't1').back, 0);
  assert.equal(at(4, 't1').ret, null);
  // (live: the latest game unread, the same)
  const more = [...rows, ...game('a5', day(5), [['q', 'QB', 0, 0], ['t2', 'TE', 3, 0]])];
  const live = nflMatchups(more).live('t1', '1', '2', 'TE', 2026, null);
  assert.equal(live.back, 0);
  assert.equal(live.ret, null);
});

test("nflMatchups: a leader traded away gives no lead share from his new team's games", () => {
  const rows = [];
  for (let d = 1; d <= 2; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['t1', 'TE', 6, 56], ['t2', 'TE', 2, 28]]));
  // (t1 now with team 3, 30% of its snaps)
  const away = game('b3', day(3), [['q3', 'QB', 0, 70], ['t1', 'TE', 2, 21]]).map((r) => ({ ...r, team: '3', opp: '4' }));
  rows.push(...away, ...game('a3', day(3), [['q', 'QB', 0, 70], ['t2', 'TE', 4, 50]]));
  rows.push(...game('a4', day(4), [['q', 'QB', 0, 70], ['t2', 'TE', 4, 50]]));
  nflMatchups(rows);
  const r3 = rows.find((x) => x.game === 'a3' && x.pid === 't2');
  const r4 = rows.find((x) => x.game === 'a4' && x.pid === 't2');
  // (game 3's day: his new team's game not yet learned, his old team's 80%; after it, none)
  assert.equal(r3.leadShare, 0.8);
  assert.equal(r4.leadShare, null);
});

// (a pass-catcher's season for the model: his games' receptions and snap shares, with the back and ret a
// matchups pass gives; the position's pool from a few others)
const STAT = { key: 'rec', snaps: true, roles: true };
const BASE = { K: 4, w: 0.4, a: 0, b: 0, roleK: Infinity, vc: 0, sn: 0.5, sr: 0.5 };
const row = (d, v, share, extra = {}) => ({ pid: 'p', pos: 'TE', season: 2026, date: day(d), opp: 'o', team: '1', game: `g${d}`, s: { rec: v }, share, back: 0, ret: null, ...extra });
const pool = Array.from({ length: 30 }, (_, i) => ({ pid: `o${i}`, pos: 'TE', season: 2026, date: day(1), opp: 'o', team: '9', game: 'z', s: { rec: 3 }, share: 0.7 }));
const season = [row(2, 4, 0.75), row(3, 4, 0.72), row(4, 1, 0.4)];

test('ij off: the model exactly as before, back and ret or not; on: the game he left hurt weighs 1 - ij once he\'s missed games after it', () => {
  const tonight = row(10, 0, null, { back: 1, ret: { k: 1, len: 1 } });
  const run = (params) => {
    const m = makeModel(STAT, params, {});
    m.learn(pool);
    for (const r of season) m.learn([r]);
    return m.project(tonight);
  };
  const plain = run(BASE);
  const off = run({ ...BASE, ij: 0, ia: 1, ir: 0 });
  assert.deepEqual(off, plain);
  // (ia 2: a one-game absence isn't one)
  const two = run({ ...BASE, ij: 1, ia: 2, ir: 0 });
  assert.equal(two.mu, plain.mu);
  // (ia 1: his 40% game, under 90% of his healthy 73.5%, left out: his expected share his healthy one, his
  // last five and per-game rate without the 1)
  const on = run({ ...BASE, ij: 1, ia: 1, ir: 0 });
  assert.ok(Math.abs(on.share - 0.735) < 1e-9, `share ${on.share}`);
  assert.ok(plain.share < 0.6, `plain share ${plain.share}`);
  assert.ok(on.recent > plain.recent && on.rate > plain.rate, `${on.recent} ${plain.recent} ${on.rate} ${plain.rate}`);
  assert.ok(on.mu > plain.mu);
  // (half: between)
  const half = run({ ...BASE, ij: 0.5, ia: 1, ir: 0 });
  assert.ok(half.mu > plain.mu && half.mu < on.mu);
});

test('ij: a game he was eased back in (under 90% of his healthy share) weighs 1 - ij; the ramp (ir) learned from returners eases his game back', () => {
  const m = makeModel(STAT, { ...BASE, ij: 1, ia: 2, ir: 1 }, {});
  m.learn(pool);
  // (other returners first: back from two games out, their first game 1 catch against their usual 3)
  for (let i = 0; i < 20; i++) {
    const pid = `r${i}`;
    for (let d = 1; d <= 3; d++) m.learn([{ pid, pos: 'TE', season: 2026, date: day(d), opp: 'o', team: '3', game: `x${i}${d}`, s: { rec: 3 }, share: 0.8, back: 0, ret: null }]);
    m.learn([{ pid, pos: 'TE', season: 2026, date: day(6), opp: 'o', team: '3', game: `x${i}6`, s: { rec: 1 }, share: 0.4, back: 2, ret: { k: 1, len: 2 } }]);
  }
  for (const r of season.slice(0, 2)) m.learn([r]);
  const back = row(7, 1, 0.5, { back: 2, ret: { k: 1, len: 2 } });
  const p = m.project(back);
  // (his first game back eased by the returners' first: well under even)
  assert.ok(p.ramp < 0.7 && p.ramp > 0.4, `ramp ${p.ramp}`);
  assert.deepEqual(p.back, { k: 1, len: 2 });
  m.learn([back]);
  // (his second game back: the eased game (50%, under 90% of his healthy 73.5%) weighed out, his last game's
  // sr with it: his share his healthy one again)
  const next = m.project(row(8, 0, null, { ret: { k: 2, len: 2 } }));
  assert.ok(Math.abs(next.share - 0.735) < 1e-9, `share ${next.share}`);
});

test('rp: the next man up projected in the role he steps into (its opponent table, learned by it), nu his share up to the missing one\'s', () => {
  const learnAll = (m) => {
    m.learn(pool);
    // (the defense o: TE1s held to a third of their usual, TE2s at theirs)
    for (let i = 0; i < 10; i++) m.learn([{ pid: `a${i}`, pos: 'TE', season: 2026, date: day(2), opp: 'o', team: `t${i}`, game: `y${i}`, role: 'TE1', roleUp: 'TE1', s: { rec: 1 }, share: 0.8 }, { pid: `b${i}`, pos: 'TE', season: 2026, date: day(2), opp: 'o', team: `t${i}`, game: `y${i}`, role: 'TE2+', roleUp: 'TE2+', s: { rec: 3 }, share: 0.4 }]);
    for (const r of season) m.learn([{ ...r, role: 'TE2+', roleUp: 'TE2+' }]);
  };
  const tonight = row(10, 0, null, { role: 'TE2+', roleUp: 'TE1', leadShare: 0.9 });
  const P = { ...BASE, roleK: 4 };
  const plain = makeModel(STAT, P, {});
  const rp = makeModel(STAT, { ...P, rp: 1, nu: 0 }, {});
  const nu = makeModel(STAT, { ...P, rp: 1, nu: 1 }, {});
  for (const m of [plain, rp, nu]) learnAll(m);
  const [a, b, c] = [plain, rp, nu].map((m) => m.project(tonight));
  assert.equal(a.role, 'TE2+');
  assert.equal(b.role, 'TE1');
  assert.ok(b.roleOpp < a.roleOpp, `${b.roleOpp} < ${a.roleOpp}`);
  assert.equal(b.share, a.share);
  assert.ok(Math.abs(c.share - 0.9) < 1e-9, `nu share ${c.share}`);
  // (rp 0 with roleUp on the rows: as before)
  const off = makeModel(STAT, { ...P, rp: 0, nu: 1 }, {});
  learnAll(off);
  assert.deepEqual(off.project(tonight), a);
});

test('typicalIdx: the places typicalShares keeps', () => {
  assert.deepEqual(typicalIdx([0.8, 0.1, 0.7]), [0, 2]);
  assert.deepEqual(typicalShares([0.8, 0.1, 0.7]), [0.8, 0.7]);
  assert.deepEqual(typicalIdx([0.8, 0.1, 0.1]), [0, 1, 2]);
  assert.deepEqual(typicalShares(null), []);
});

test("the role backtest: a returner bucket (his 1st to 3rd game back from 2 of his team's games or more out), the fit's moved rows", () => {
  const rows = [];
  const g = (id, d, list) => list.map(([pid, pos, targets]) => ({ pid, pos, date: day(d), season: 2026, team: '1', opp: '2', game: id, s: { targets, snaps: 50 } }));
  for (let d = 1; d <= 2; d++) rows.push(...g(`a${d}`, d, [['q', 'QB', 0], ['w', 'WR', 6], ['v', 'WR', 2]]));
  for (let d = 3; d <= 4; d++) rows.push(...g(`a${d}`, d, [['q', 'QB', 0], ['v', 'WR', 5]]));
  for (let d = 5; d <= 8; d++) rows.push(...g(`a${d}`, d, [['q', 'QB', 0], ['w', 'WR', 6], ['v', 'WR', 2]]));
  const s = preGame(rows, { weekOf: (id) => ({ season: 2026, week: Number(id.slice(1)) }), outOf: () => new Map() });
  assert.ok(BUCKETS.includes('returner'));
  assert.deepEqual(s.get('a5|w').back, { k: 1, len: 2 });
  assert.equal(s.get('a5|w').bucket, 'returner');
  assert.equal(s.get('a7|w').bucket, 'returner');
  assert.notEqual(s.get('a8|w').bucket, 'returner');
  assert.notEqual(s.get('a5|v').bucket, 'returner');
  const items = [
    { v: 3, mu: 2, held: true, pos: 'TE', promoted: true, fitBack: null },
    { v: 1, mu: 2, held: false, pos: 'WR', promoted: false, fitBack: { k: 1, len: 1 } },
    { v: 2, mu: 2, held: false, pos: 'WR', promoted: false, fitBack: { k: 2, len: 3 } },
  ];
  const t = movedTable(items);
  assert.equal(t.promoted.n, 1);
  assert.ok(Math.abs(t.promoted.bias - 0.5) < 1e-9);
  assert.equal(t['promoted TE'].heldN, 1);
  assert.ok(Math.abs(t['back 1 game, game 1'].bias + 0.5) < 1e-9);
  assert.equal(t['back 2+ games, game 2'].n, 1);
});
