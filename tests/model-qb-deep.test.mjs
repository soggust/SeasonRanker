// The backup quarterback by the receiver's depth (audit #14, libs/ranker/scripts/model): a pass-catcher's air
// yards a target before the game over the league's (matchups.mjs dep: his own pulled toward his position's, held
// at 0 or more), and qbDeep, the lead quarterback out (qb1Out) times how far it runs over the league's (a wide
// receiver's or tight end's; a back's 0: props.mjs CTX qbDeep), live the same; without the air yards read, none
// (0: the term reads nothing). On receptions and rush+rec yards, after the flat qb1Out; not receiving yards.
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
