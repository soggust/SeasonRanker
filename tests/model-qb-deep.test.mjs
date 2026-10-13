// The backup quarterback by the receiver's depth (audit #14, libs/ranker/scripts/model): a pass-catcher's air
// yards a target before the game over the league's (matchups.mjs dep: his own pulled toward his position's, held
// at 0 or more), and qbDeep, the lead quarterback out (qb1Out) times how far it runs over the league's (a wide
// receiver's or tight end's; a back's 0: props.mjs CTX qbDeep), live the same; without the air yards read, none
// (0: the term reads nothing). On receptions and rush+rec yards, after the flat qb1Out; not receiving yards.
// Air yards nflverse left NA or blank read as unread (playerlogs.mjs airYdsOf), not 0; the role guard's qb1-out
// keeps the under as its safe side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { CTX, STATS } from '../libs/ranker/scripts/model/props.mjs';
import { ctxKeys } from '../libs/ranker/scripts/model/project.mjs';

// (a team's game: [pid, pos, targets, airYds, passAtt]; airYds null: not read)
const game = (id, date, list, season = 2026) =>
  list.map(([pid, pos, targets = 0, airYds = 0, passAtt = 0]) => ({ pid, name: pid, pos, date, season, team: '1', opp: '2', game: id, home: true, s: { rushAtt: pos === 'RB' ? 12 : 0, targets, passAtt, snaps: 0, ...(airYds === null ? {} : { airYds }) } }));
const day = (d) => new Date(Date.UTC(2026, 8, 1 + d)).toISOString().replace('.000', '');

// (30 games: a deep receiver (15 air yards a target), a short one (5), a back (-1), 20 targets a game: 600 in all)
const season = (air = true) => {
  const rows = [];
  for (let d = 0; d < 30; d++) rows.push(...game(`a${d}`, day(d), [['q', 'QB', 0, 0, 34], ['d', 'WR', 8, air ? 120 : null], ['w', 'WR', 8, air ? 40 : null], ['s', 'RB', 4, air ? -4 : null]]));
  return rows;
};

test('dep: air yards a target over the league, pulled toward the position; a back held at 0; none unread', () => {
  const rows = season();
  // (the starter out of the last game)
  rows.push(...game('z', day(31), [['k', 'QB', 0, 0, 30], ['d', 'WR', 8, 120], ['w', 'WR', 8, 40], ['s', 'RB', 4, -4]]));
  const m = nflMatchups(rows);
  const at = (pid, g) => rows.find((r) => r.pid === pid && r.game === g);
  const deep = at('d', 'z').dep;
  const short = at('w', 'z').dep;
  assert.ok(deep > 1.6 && deep < 1.95, `deep ${deep}`);
  assert.ok(short > 0.6 && short < 0.75, `short ${short}`);
  assert.equal(at('s', 'z').dep, 0);
  assert.equal(at('k', 'z').dep, null);
  // (the first games: under the league's DEPTH_MIN targets read, none)
  assert.equal(at('d', 'a0').dep, null);
  // (qbDeep: qb1Out times dep less 1 where over 0; 0 with the starter in, for a short receiver and for a back)
  assert.equal(at('d', 'a29').qbDeep, 0);
  assert.ok(at('d', 'z').qb1Out > 0);
  assert.equal(at('d', 'z').qbDeep, Math.round(at('d', 'z').qb1Out * (deep - 1) * 1000) / 1000);
  assert.equal(at('w', 'z').qbDeep, 0);
  assert.equal(at('s', 'z').qbDeep, 0);
  // (live: the same, by how surely he's missing)
  const out = m.live('d', '1', '2', 'WR', 2026, new Set(['q']));
  assert.ok(out.dep > 1.6);
  assert.equal(out.qbDeep, Math.round(out.qb1Out * (out.dep - 1) * 1000) / 1000);
  assert.ok(out.qbDeep > 0.6);
  assert.equal(m.live('d', '1', '2', 'WR', 2026, null).qbDeep, 0);
  assert.equal(m.live('q', '1', '2', 'QB', 2026, new Set(['k'])).qbDeep, 0);
});

test('dep: no air yards read at all, none; the term reads 0', () => {
  const rows = season(false);
  rows.push(...game('z', day(31), [['k', 'QB', 0, 0, 30], ['d', 'WR', 8, null], ['w', 'WR', 8, null]]));
  nflMatchups(rows);
  const r = rows.find((x) => x.pid === 'd' && x.game === 'z');
  assert.equal(r.dep, null);
  assert.equal(r.qbDeep, 0);
  assert.equal(CTX.qbDeep(null, true, null, r), 0);
  assert.equal(CTX.qbDeep(null, true, null, { qbDeep: 1.4 }), 1.4);
});

test('qbDeep on receptions and rush+rec yards, after the flat qb1Out', () => {
  for (const k of ['rec', 'rushRecYds']) {
    const keys = ctxKeys(STATS.nfl.find((s) => s.key === k));
    assert.ok(keys.indexOf('qbDeep') > keys.indexOf('qb1Out'), k);
  }
  for (const k of ['recYds', 'rushYds', 'rushAtt', 'passYds']) assert.ok(!ctxKeys(STATS.nfl.find((s) => s.key === k)).includes('qbDeep'), k);
});

test("air yards NA or blank read as unread, not 0: a season of them leaves his depth as without it", async () => {
  const { airYdsOf } = await import('../libs/ranker/scripts/model/playerlogs.mjs');
  assert.deepEqual(['12', '-3.5', '0', 'NA', '', undefined, 'x'].map(airYdsOf), [12, -3.5, 0, undefined, undefined, undefined, undefined]);
  // (last season's every row NA (airYds unread), this season's read: his depth this season's alone)
  const day25 = (d) => new Date(Date.UTC(2025, 8, 1 + d)).toISOString().replace('.000', '');
  const last = [];
  for (let d = 0; d < 30; d++) last.push(...game(`b${d}`, day25(d), [['q', 'QB', 0, 0, 34], ['d', 'WR', 8, airYdsOf('NA') ?? null], ['w', 'WR', 8, airYdsOf('') ?? null]], 2025));
  const end = () => game('z', day(31), [['k', 'QB', 0, 0, 30], ['d', 'WR', 8, 120], ['w', 'WR', 8, 40]]);
  const both = [...last, ...season(), ...end()];
  const alone = [...season(), ...end()];
  nflMatchups(both);
  nflMatchups(alone);
  const dep = (rows) => rows.find((r) => r.pid === 'd' && r.game === 'z').dep;
  assert.ok(dep(alone) > 1.6);
  assert.equal(dep(both), dep(alone));
  // (the same season read as 0s instead (the old reading): his and the league's averages pulled down, his depth
  // moved)
  const zeros = [...last.map((r) => ({ ...r, s: { ...r.s, airYds: 0 } })), ...season(), ...end()];
  nflMatchups(zeros);
  assert.notEqual(dep(zeros), dep(alone));
});

test("the role guard's qb1-out keeps the under safe with the depth term on (the listed absences' rows still under)", async () => {
  const { ROLE_SAFE, roleChangeOf } = await import('../libs/ranker/scripts/model/props.mjs');
  const r = roleChangeOf({ name: 'D', pos: 'WR', pid: 'd', qb1: { id: 'q', name: 'Q', missing: 1 } });
  assert.equal(r.key, 'qb1-out');
  assert.equal(r.safe, undefined);
  assert.equal(ROLE_SAFE['qb1-out'], 'under');
});

test("a questionable starting quarterback flagged where a kept term reads him (qbDeep): the swing in or out times his chance's spread", async () => {
  const { priceProps, QB_Q_SWING } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'rec');
  // (a deep receiver, depth 1.6: qbDeep his chance of missing times 0.6, qb1Out the chance itself)
  let miss = 0.5;
  const matchups = {
    live: () => ({ vacs: [0, 0, 0], vac: 0, qb1Out: miss, qb1Miss: miss, qbDeep: Math.round(miss * 0.6 * 1000) / 1000 }),
    qb1: () => null,
    absent: () => new Map(),
    regulars: () => [],
    goneOf: () => null,
  };
  const project = () => ({ mu: 5, rate: 5, recent: 5, base: 5, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const fit = (c) => ({ rec: { stat: st, env: { mean: 5, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', [[2026, 4], [2026, 5], [2026, 6], [2026, 5]]]]), matchups, params: { r: 20, a: 1, b: 0, scale: 1, c_qbDeep: c }, snapGap: null } });
  const idx = { pid: (a) => a.id, pos: () => 'WR', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const props = [{ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 4.5, open: null, prices: { over: -110, under: -110 } }];
  const run = (c) => priceProps('nfl', gameRow, props.map((p) => ({ ...p })), fit(c), idx, { homePts: 24, awayPts: 21 }, null, {}, {}, 0.1).priced[0];
  // (at half: -0.3 x 0.6 = 0.18 on the log, over the bar)
  assert.ok(0.18 >= QB_Q_SWING);
  assert.match(run(-0.3).guard?.why ?? '', /starting quarterback questionable.*50%/);
  // (no kept term: nothing reads him, no flag)
  assert.doesNotMatch(run(0).guard?.why ?? '', /quarterback questionable/);
  // (a sure starter, 1% missing: the spread 0.2 x 0.18 = 0.036, under the bar)
  miss = 0.01;
  assert.doesNotMatch(run(-0.3).guard?.why ?? '', /quarterback questionable/);
  // (out: the role guard's, not this flag)
  miss = 1;
  assert.doesNotMatch(run(-0.3).guard?.why ?? '', /quarterback questionable/);
});
