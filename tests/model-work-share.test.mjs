// The role and work share (audit #2, libs/ranker/scripts/model): the role order by his recent healthy work
// (matchups.mjs roleW, roleUpW; project.mjs ro), a regular above him out (aheadOut; CTX aheadOut), his organic
// trend on the games with no one above him missing (trend; project.mjs ot), the next man up's target share
// floor in the volume base (leadTgt; project.mjs rp with nu), and the depth chart's role CHECK, live only
// (props.mjs readDepth, depthRoleOf). Each off, the model exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { ctxKeys, makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { CTX, DEPTH, STATS, depthRoleOf, readDepth } from '../libs/ranker/scripts/model/props.mjs';

// (a team's game: [pid, pos, targets, snaps])
const game = (id, date, list, season = 2026) =>
  list.map(([pid, pos, targets = 0, snaps = 0]) => ({ pid, name: pid, pos, date, season, team: '1', opp: '2', game: id, home: true, s: { targets, snaps, rec: 0, rushAtt: 0, passAtt: pos === 'QB' ? 30 : 0 } }));
const day = (d) => `2026-09-${String(d).padStart(2, '0')}T17:00Z`;

test("roleW: a starter who missed games stays first by his recent healthy work, where the season's targets put his fill-in ahead", () => {
  const rows = [];
  // (t1 the TE1: 7 targets a game; t2 the TE2: 2)
  for (let d = 1; d <= 2; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['t1', 'TE', 7, 60], ['t2', 'TE', 2, 25]]));
  // (t1 out three games, t2 taking 8 a game: the season's targets 30 to t2's 14 to t2's 28)
  for (let d = 3; d <= 5; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['t2', 'TE', 8, 60]]));
  rows.push(...game('a6', day(6), [['q', 'QB', 0, 70], ['t1', 'TE', 7, 60], ['t2', 'TE', 3, 30]]));
  const m = nflMatchups(rows);
  const r = rows.find((x) => x.game === 'a6' && x.pid === 't1');
  assert.equal(r.role, 'TE2+');
  assert.equal(r.roleW, 'TE1');
  // (and the fill-in, in a game with t1 out: a regular above him by the work missing (aheadOut), his role up)
  const f = rows.find((x) => x.game === 'a4' && x.pid === 't2');
  assert.equal(f.aheadOut, 1);
  assert.equal(f.roleUpW, 'TE1');
  // (with everyone here, none)
  assert.equal(rows.find((x) => x.game === 'a2' && x.pid === 't2').aheadOut, 0);
  // (at bet time: the starter out by the report)
  assert.equal(m.live('t2', '1', '2', 'TE', 2026, new Set(['t1'])).aheadOut, 1);
  assert.equal(m.live('t2', '1', '2', 'TE', 2026, null).aheadOut, 0);
  assert.equal(m.live('t1', '1', '2', 'TE', 2026, null).roleW, 'TE1');
});

test("leadTgt: the next man up sees the missing one's share of the team's targets", () => {
  const rows = [];
  for (let d = 1; d <= 3; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 70], ['t1', 'TE', 8, 56], ['t2', 'TE', 2, 28], ['w', 'WR', 10, 66]]));
  rows.push(...game('a4', day(4), [['q', 'QB', 0, 70], ['t2', 'TE', 4, 50], ['w', 'WR', 10, 66]]));
  nflMatchups(rows);
  const r = rows.find((x) => x.game === 'a4' && x.pid === 't2');
  assert.equal(r.roleUp, 'TE1');
  assert.equal(r.leadTgt, 0.4);
});

test('trend: his organic work recent over its average, the games with a regular above him out left out; none under 4 such games', () => {
  const rows = [];
  // (w2 the WR2 behind w1: 3, 4, 5, 6 targets in four organic games, then w1 out a game with w2 at 12)
  [3, 4, 5, 6].forEach((t, i) => rows.push(...game(`a${i + 1}`, day(i + 1), [['q', 'QB', 0, 70], ['w1', 'WR', 10, 66], ['w2', 'WR', t, 50]])));
  rows.push(...game('a5', day(5), [['q', 'QB', 0, 70], ['w2', 'WR', 12, 66]]));
  rows.push(...game('a6', day(6), [['q', 'QB', 0, 70], ['w1', 'WR', 10, 66], ['w2', 'WR', 6, 50]]));
  nflMatchups(rows);
  // (3 games before the 4th: none)
  assert.equal(rows.find((x) => x.game === 'a4' && x.pid === 'w2').trend, null);
  // (the 6th: his four organic games (3, 4, 5, 6), not the 12 he had filling in)
  const e = [4, 5, 6].reduce((x, t) => x + (t - x) * 0.35, 3);
  assert.equal(rows.find((x) => x.game === 'a6' && x.pid === 'w2').trend, Math.round((e / 4.5) * 1000) / 1000);
  assert.equal(rows.find((x) => x.game === 'a5' && x.pid === 'w2').aheadOut, 1);
});

// (the projections: a tight end's receptions)
const STAT = { key: 'rec', snaps: true, roles: true };
const BASE = { K: 4, w: 0.4, a: 0, b: 0, roleK: Infinity, vc: 0, sn: 0.5, sr: 0.5 };
const pr = (d, v, share, extra = {}) => ({ pid: 'p', pos: 'TE', season: 2026, date: day(d), opp: 'o', team: '1', game: `g${d}`, s: { rec: v }, share, back: 0, ret: null, ...extra });
const pool = Array.from({ length: 30 }, (_, i) => ({ pid: `o${i}`, pos: 'TE', season: 2026, date: day(1), opp: 'o', team: '9', game: 'z', s: { rec: 3 }, share: 0.7 }));
const learned = (p) => {
  const m = makeModel(STAT, p, {});
  m.learn(pool);
  for (const r of [pr(2, 4, 0.75), pr(3, 4, 0.72), pr(4, 3, 0.7)]) m.learn([r]);
  return m;
};

test('ot: off, the model as before with a trend on the row; on, the base times the trend to the power ot, held to TREND_CAP', () => {
  const tonight = pr(10, 0, null, { role: 'TE1', trend: 1.5 });
  const a = learned(BASE).project(tonight);
  const b = learned({ ...BASE, ot: 0 }).project(tonight);
  assert.deepEqual(b, a);
  const c = learned({ ...BASE, ot: 0.5 }).project(tonight);
  assert.ok(Math.abs(c.base - a.base * Math.sqrt(1.5)) < 1e-9, `${c.base} ${a.base}`);
  assert.ok(Math.abs(c.trendF - Math.sqrt(1.5)) < 1e-9);
  const d = learned({ ...BASE, ot: 1 }).project({ ...tonight, trend: 5 });
  assert.ok(Math.abs(d.base - a.base * 2) < 1e-9, `${d.base}`);
  // (none on the row: as before)
  const e = learned({ ...BASE, ot: 1 }).project({ ...tonight, trend: null });
  assert.equal(e.base, a.base);
});

test('ro: off, his role by the season; on, by his recent healthy work (roleW, roleUpW with rp)', () => {
  const tonight = pr(10, 0, null, { role: 'TE2+', roleW: 'TE1', roleUp: 'TE2+', roleUpW: 'TE1' });
  assert.equal(learned(BASE).project(tonight).role, 'TE2+');
  assert.equal(learned({ ...BASE, ro: 1 }).project(tonight).role, 'TE1');
  // (an older row without roleW: as before)
  assert.equal(learned({ ...BASE, ro: 1 }).project(pr(10, 0, null, { role: 'TE2+' })).role, 'TE2+');
});

test("rp in the volume base: the next man up's target share at least nu of the missing one's (leadTgt); rp off, as before", () => {
  const stat = { key: 'recYds', perTarget: true, snaps: true, roles: true };
  const P = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0, vol: 1, yk: 40 };
  const g = (season, d, mine) => [
    { pid: 'b', pos: 'TE', season, date: `${season}-09-${String(d).padStart(2, '0')}`, team: 'A', opp: 'o', game: `A${season}${d}`, s: { recYds: mine.v, targets: mine.tg } },
    { pid: 'a', pos: 'TE', season, date: `${season}-09-${String(d).padStart(2, '0')}`, team: 'A', opp: 'o', game: `A${season}${d}`, s: { recYds: 60, targets: 7 } },
    { pid: 'w', pos: 'WR', season, date: `${season}-09-${String(d).padStart(2, '0')}`, team: 'A', opp: 'o', game: `A${season}${d}`, s: { recYds: 150, targets: 23 } },
  ];
  const run = (p) => {
    const m = makeModel(stat, p, {});
    for (let d = 1; d <= 20; d++) m.learn(g(2025, d, { tg: 2, v: 16 }));
    for (let d = 1; d <= 4; d++) m.learn(g(2026, d, { tg: 2, v: 16 }));
    return m.project({ pid: 'b', pos: 'TE', season: 2026, date: '2026-09-20', team: 'A', opp: 'o', role: 'TE2+', roleUp: 'TE1', leadTgt: 0.25, leadShare: null });
  };
  const off = run(P);
  assert.ok(Math.abs(off.volume.share - 2 / 32) < 1e-9, `${off.volume.share}`);
  const on = run({ ...P, rp: 1, nu: 0.8 });
  assert.ok(Math.abs(on.volume.share - 0.2) < 1e-9, `${on.volume.share}`);
  assert.ok(on.rate > off.rate * 2, `${on.rate} ${off.rate}`);
  // (rp with nu 0: the role alone, the share his own)
  assert.ok(Math.abs(run({ ...P, rp: 1, nu: 0 }).volume.share - 2 / 32) < 1e-9);
});

test('CTX aheadOut: the row\'s flag, 0 without it; measured and on no stat\'s ctx', () => {
  assert.equal(CTX.aheadOut(null, true, null, { aheadOut: 1 }), 1);
  assert.equal(CTX.aheadOut(null, true, null, {}), 0);
  assert.ok(STATS.nfl.every((s) => !ctxKeys(s).includes('aheadOut')));
});

test("readDepth and depthRoleOf: the chart's starter the model has lower a CHECK on the under (the over safe), the model's top man behind on the chart the other way; the spots and stats it reads; a stale chart nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-'));
  const at = '2026-10-12T12:00:00Z';
  fs.writeFileSync(
    path.join(dir, 'Rams.json'),
    JSON.stringify({
      team: 'LA',
      at,
      slots: [
        { side: 'offense', key: 'TE10', depth: ['g1', 'g2', 'espn:30'] },
        { side: 'offense', key: 'RB11', depth: ['g4', 'g5'] },
        { side: 'offense', key: 'WR1', depth: ['g6'] },
      ],
      players: { g1: { espnId: '10' }, g2: { espnId: '20' }, g4: { espnId: '40' }, g5: { espnId: '50' }, g6: { espnId: '60' } },
    }),
  );
  const depth = readDepth(dir);
  assert.deepEqual(depth.get('20').order, ['10', '20', '30']);
  assert.equal(depth.get('40').group, 'RB');
  assert.equal(depth.get('60'), undefined);
  assert.equal(readDepth(path.join(dir, 'none')).size, 0);
  const now = Date.parse('2026-10-12T15:00:00Z');
  const kick = '2026-10-12T17:00:00Z';
  const none = () => 0;
  const base = { depth, missOf: none, at: kick, now };
  // (the chart's TE1 the model has as TE2+: the over safe)
  assert.deepEqual(depthRoleOf({ ...base, pos: 'TE', pid: '10', stat: 'recYds', role: 'TE2+' })?.safe, 'over');
  // (the model's TE1 the chart has second: the under safe; with the one ahead out, he's first: nothing)
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '20', stat: 'rec', role: 'TE1' })?.safe, 'under');
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '20', stat: 'rec', role: 'TE1', missOf: (id) => (id === '10' ? 1 : 0) }), null);
  // (questionable isn't out)
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '20', stat: 'rec', role: 'TE1', missOf: (id) => (id === '10' ? 0.5 : 0) })?.key, 'depth');
  // (the two agreeing: nothing)
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '10', stat: 'rec', role: 'TE1' }), null);
  // (a back's rushing read, his receiving not; a tight end's rushing not)
  assert.equal(depthRoleOf({ ...base, pos: 'RB', pid: '40', stat: 'rushYds', role: 'RB2+' })?.safe, 'over');
  assert.equal(depthRoleOf({ ...base, pos: 'RB', pid: '40', stat: 'rec', role: 'RB2+' }), null);
  assert.ok(DEPTH.stats.TE.includes('rushRecYds') && !DEPTH.stats.RB.includes('rushRecYds'));
  // (stale, stamped after the kickoff, no chart, not on it: nothing)
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '10', stat: 'rec', role: 'TE2+', now: Date.parse(at) + DEPTH.fresh + 1 }), null);
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '10', stat: 'rec', role: 'TE2+', at: '2026-10-12T11:00:00Z' }), null);
  assert.equal(depthRoleOf({ ...base, depth: null, pos: 'TE', pid: '10', stat: 'rec', role: 'TE2+' }), null);
  assert.equal(depthRoleOf({ ...base, pos: 'TE', pid: '99', stat: 'rec', role: 'TE2+' }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
