// Round D (2026-10-17), the owner's backlog (libs/ranker/scripts/model): the next man up one deeper (matchups.mjs
// promotion: with the lead and his fill-in both out, the third back steps into the lead's role and the lead's share),
// a backup quarterback's own flag (qbBackup, CTX backupRun) and the low-usage prior (project.mjs lp: a skater under
// the eligible pool's prior leaning to the pool's floor; the eligible players exactly as before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { CTX } from '../libs/ranker/scripts/model/props.mjs';

// (a team's game: [pid, pos, carries, snaps, passes])
const day = (d) => `2026-09-${String(d).padStart(2, '0')}T17:00Z`;
const game = (id, date, list) =>
  list.map(([pid, pos, rushAtt = 0, snaps = 0, passAtt = 0]) => ({ pid, name: pid, pos, date, season: 2026, team: '1', opp: '2', game: id, home: true, s: { targets: 0, snaps, rec: 0, rushAtt, passAtt } }));

test('the next man up one deeper: the lead and his fill-in both out, the third back is the RB1 at the lead\'s share; a backup quarterback flagged', () => {
  const rows = [];
  // (four games: r1 the lead (18 carries, 60 of 70 snaps), r2 behind him (6, 25), r3 the third (2, 10); q the passer)
  for (let d = 1; d <= 4; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70, 32], ['r1', 'RB', 18, 60], ['r2', 'RB', 6, 25], ['r3', 'RB', 2, 10]]));
  // (the 5th: r1 out, r2 the lead; the 6th: r1 and r2 out, r3 alone; q2 throws for q in the 6th)
  rows.push(...game('a5', day(5), [['q', 'QB', 0, 70, 32], ['r2', 'RB', 17, 55], ['r3', 'RB', 7, 20]]));
  rows.push(...game('a6', day(6), [['q2', 'QB', 0, 70, 30], ['r3', 'RB', 19, 58]]));
  const m = nflMatchups(rows);
  const at = (g, pid) => rows.find((x) => x.game === g && x.pid === pid);
  // (the 5th: r2 steps into RB1 with r1 out, the lead's share his)
  const r2 = at('a5', 'r2');
  assert.equal(r2.role, 'RB2+');
  assert.equal(r2.roleUp, 'RB1');
  assert.ok(r2.leadShare > 0.7 && r2.leadShare <= 1, `lead share ${r2.leadShare}`);
  // (the 6th: r3, third by the carries, is the RB1 with both out, at the most-used missing one's share (r1's), not
  // r2's: one deeper)
  const r3 = at('a6', 'r3');
  assert.equal(r3.role, 'RB2+');
  assert.equal(r3.roleUp, 'RB1');
  assert.equal(r3.leadShare, r2.leadShare, "the lead's share, the deepest missing");
  // (the 4th, everyone in: no promotion)
  assert.equal(at('a4', 'r3').roleUp, 'RB2+');
  // (live, both out: the same)
  const live = m.live('r3', '1', '2', 'RB', 2026, (id) => (['r1', 'r2'].includes(id) ? 1 : 0));
  assert.equal(live.roleUp, 'RB1');
  assert.equal(live.leadShare, r2.leadShare);
  // (the backup quarterback: q2 threw for a team whose lead is q; q's own 0; a back never)
  assert.equal(at('a6', 'q2').qbBackup, 1);
  assert.equal(at('a5', 'q').qbBackup, 0);
  assert.equal(at('a6', 'r3').qbBackup, 0);
  assert.equal(CTX.backupRun(null, true, null, at('a6', 'q2')), 1);
  assert.equal(CTX.backupRun(null, true, null, at('a5', 'q')), 0);
  // (live: a quarterback priced who isn't the lead is the backup; the lead 0)
  assert.equal(m.live('q2', '1', '2', 'QB', 2026, () => 0).qbBackup, 1);
  assert.equal(m.live('q', '1', '2', 'QB', 2026, () => 0).qbBackup, 0);
  // (the lead back out on his quarterback's volume: the quarterback's rows alone)
  assert.equal(CTX.rbOutPass(null, true, null, { pos: 'QB', rb1Out: 1 }), 1);
  assert.equal(CTX.rbOutPass(null, true, null, { pos: 'WR', rb1Out: 1 }), 0);
});

// (the low-usage prior: NHL points, a stat marked lowPool)
const STAT = { key: 'pts', lowPool: true };
const BASE = { K: 4, w: 0.4, a: 0, b: 0, lp: 0 };
const skater = (pid, d, v, season, eligible) => ({ pid, pos: 'D', season, date: `${season}-01-${String(d).padStart(2, '0')}T00:00Z`, opp: 'o', team: '1', game: `${season}g${d}`, s: { pts: v }, eligible });
const learned = (p) => {
  const m = makeModel(STAT, p, {});
  // (the pool: six eligible defensemen, 8 games each this season at 1.0, 0.9, 0.8, 0.7, 0.6 and 0.5 points a game: the
  // floor is 0.5; and a third-pair man (x) with 12 games last season at 0.1, under the pool)
  for (let d = 1; d <= 12; d++) m.learn([skater('x', d, d % 10 === 0 ? 1 : 0, 2025, false)]);
  for (let d = 1; d <= 8; d++) m.learn([1, 0.9, 0.8, 0.7, 0.6, 0.5].map((rate, i) => skater(`e${i}`, d, Math.round(rate * d) - Math.round(rate * (d - 1)), 2026, true)));
  return m;
};

test('lp: a skater under the eligible pool has his prior leaned toward the pool\'s floor; off, as before; an eligible player untouched', () => {
  const tonight = skater('x', 9, 0, 2026, false);
  const off = learned(BASE).project(tonight);
  const on = learned({ ...BASE, lp: 0.5 }).project(tonight);
  assert.ok(off.prior < 0.15, `his own run alone: ${off.prior}`);
  // (half his own 0.083 and half the floor 0.5)
  assert.ok(Math.abs(on.prior - (0.5 * off.prior + 0.5 * 0.5)) < 0.02, `leaned to the floor: ${on.prior} from ${off.prior}`);
  assert.ok(on.mu > off.mu);
  // (an eligible defenseman's projection the same either way)
  const e = skater('e3', 9, 0, 2026, true);
  assert.equal(learned({ ...BASE, lp: 0.5 }).project(e).mu, learned(BASE).project(e).mu);
  // (a stat without lowPool: lp does nothing)
  const m = makeModel({ key: 'pts' }, { ...BASE, lp: 0.5 }, {});
  for (let d = 1; d <= 12; d++) m.learn([skater('x', d, d % 10 === 0 ? 1 : 0, 2025, false)]);
  for (let d = 1; d <= 8; d++) m.learn([1, 0.9, 0.8, 0.7, 0.6, 0.5].map((rate, i) => skater(`e${i}`, d, Math.round(rate * d) - Math.round(rate * (d - 1)), 2026, true)));
  assert.ok(Math.abs(m.project(tonight).prior - off.prior) < 1e-9);
});
