// The NFL receiving props' volume-based base and the opponent by position group (libs/ranker/scripts/model/
// project.mjs vol, a_<group>): his expected targets times what he makes of one, blended in by vol; the
// defense's power fit for wide receivers, tight ends and backs apart; each off the model as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';

const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };
const stat = { key: 'recYds', perTarget: true };
const day = (season, d) => `${season}-09-${String(d).padStart(2, '0')}`;
// (a team-game: his line and a teammate's, the team's targets their total)
const game = (season, d, mine, mate = { tg: 25, v: 200 }, team = 'A') => [
  { pid: `w${team}`, pos: 'WR', season, date: day(season, d), team, opp: 'o', game: `${team}${season}${d}`, s: { recYds: mine.v, targets: mine.tg } },
  { pid: `t${team}`, pos: 'WR', season, date: day(season, d), team, opp: 'o', game: `${team}${season}${d}`, s: { recYds: mate.v, targets: mate.tg } },
];
const row = { pid: 'wA', pos: 'WR', season: 2026, date: day(2026, 20), team: 'A', opp: 'o' };

// (last season 12 games at 10 targets for 90 yards (9 a target), the team 35 targets a game; this season 4 at
// 10 targets for 50 (5 a target): the same usage, the efficiency dipped)
const history = (m) => {
  for (let d = 1; d <= 12; d++) m.learn([...game(2025, d, { tg: 10, v: 90 }), ...game(2025, d, { tg: 8, v: 60 }, undefined, 'B')]);
  for (let d = 1; d <= 4; d++) m.learn(game(2026, d, { tg: 10, v: 50 }));
};

test('volume off (vol 0): the per-game rate as before, no volume read', () => {
  const m = makeModel(stat, BASE, {});
  history(m);
  const p = m.project(row);
  assert.equal(p.volume, null);
  assert.ok(Math.abs(p.rate - (4 * 50 + 4 * 90) / 8) < 1e-9, `${p.rate}`);
});

test("volume: his share of the team's targets times its targets a game times his yards a target, his efficiency pulled toward his usual by yk targets", () => {
  const m = makeModel(stat, { ...BASE, vol: 1, yk: 100 }, {});
  history(m);
  const p = m.project(row);
  assert.ok(p.volume, 'volume read');
  // (his share 10 of 35 throughout; the team 35 a game this season and last)
  assert.ok(Math.abs(p.volume.share - 10 / 35) < 1e-9, `${p.volume.share}`);
  assert.ok(Math.abs(p.volume.team - 35) < 1e-9, `${p.volume.team}`);
  // (9 a target over 120 targets his prior, 100 targets' worth of it against his 40 at 5: 7.86)
  const perT = (200 + 100 * 9) / (40 + 100);
  assert.ok(Math.abs(p.volume.perTarget - perT) < 1e-9, `${p.volume.perTarget}`);
  assert.ok(Math.abs(p.rate - 10 * perT) < 1e-9, `${p.rate}`);
  // (the usage's credit: above the per-game rate's 70, which takes his 50s at their word)
  assert.ok(p.rate > 70, `${p.rate}`);
});

test("volume: a game without its targets read in his recent games, the per-game rate as before", () => {
  const m = makeModel(stat, { ...BASE, vol: 1, yk: 40 }, {});
  history(m);
  for (let d = 5; d <= 6; d++) {
    const g = game(2026, d, { tg: 10, v: 50 });
    delete g[0].s.targets;
    m.learn(g);
  }
  const p = m.project(row);
  assert.equal(p.volume, null);
  assert.ok(Math.abs(p.rate - (6 * 50 + 4 * 90) / 10) < 1e-9, `${p.rate}`);
});

test('the opponent by position group: a tight end at a_TE, a wide receiver at the stat\'s a; a fullback a back', () => {
  const m = makeModel({ key: 'recYds' }, { ...BASE, a: 0, a_TE: 1, a_RB: 0.5 }, {});
  const tgts = { WR: 'WR', TE: 'TE', FB: 'FB' };
  for (const pos of Object.keys(tgts)) {
    for (let d = 1; d <= 4; d++) m.learn([{ pid: pos, pos, season: 2026, date: day(2026, d), team: 'A', opp: 'x', s: { recYds: 40 } }]);
  }
  const at = (pos) => m.project({ pid: pos, pos, season: 2026, date: day(2026, 20), team: 'A', opp: 'o' });
  assert.equal(at('WR').oppA, 0);
  assert.equal(at('TE').oppA, 1);
  assert.equal(at('FB').oppA, 0.5);
});

test("the NFL's stats: receiving yards reads volume, it and receptions fit the opponent by group; rushing by back and quarterback", () => {
  const by = Object.fromEntries(STATS.nfl.map((s) => [s.key, s]));
  for (const k of ['recYds', 'rec']) assert.ok(by[k].oppPos.includes('TE'), k);
  assert.ok(by.recYds.perTarget);
  // (not receptions': it ran the established starters' weeks 5-8 further under, held out)
  assert.ok(!by.rec.perTarget);
  assert.ok(!by.rushRecYds.perTarget);
  assert.deepEqual(by.rushYds.oppPos, ['RB', 'QB']);
  assert.ok(!by.passYds.oppPos);
});

test("volume: a playerlogs row whose targets were blank (read as 0) beside his yards leaves the game unread, the per-game rate as before", () => {
  const m = makeModel(stat, { ...BASE, vol: 1, yk: 40 }, {});
  history(m);
  for (let d = 5; d <= 6; d++) m.learn(game(2026, d, { tg: 0, v: 50 }));
  const p = m.project(row);
  assert.equal(p.volume, null);
  assert.ok(Math.abs(p.rate - (6 * 50 + 4 * 90) / 10) < 1e-9, `${p.rate}`);
});

test("volume: the prior's weight blended in by vol, its halves' own (yk against his targets, K games of his team's against his season's)", () => {
  const m = makeModel(stat, { ...BASE, vol: 0.5, yk: 100 }, {});
  history(m);
  const p = m.project(row);
  assert.ok(p.volume, 'volume read');
  const plain = 4 / (4 + 4);
  const wY = 100 / (40 + 100);
  const wS = (4 * 35) / (4 * 35 + 140);
  assert.ok(Math.abs(p.priorW - (0.5 * plain + 0.5 * ((wY + wS) / 2))) < 1e-9, `${p.priorW}`);
});
