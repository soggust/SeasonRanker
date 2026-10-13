// The NBA props' positions and pace (libs/ranker/scripts/model/project.mjs ps, po; matchups.mjs nbaMatchups
// pace, paceG, nbaPossessions; props.mjs nbaPos): the opponent's table and the priors by guards, forwards and
// centers where the fit keeps them, and the other side's possessions a game over the league's (audit #10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS, nbaPos } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { nbaMatchups, nbaPossessions } from '../libs/ranker/scripts/model/matchups.mjs';

const BASE = { K: 4, w: 0, a: 1, b: 0, roleK: Infinity, vc: 0 };
const day = (d) => `2026-01-${String(d).padStart(2, '0')}`;

test('every NBA stat has positions and pace; no other sport has either', () => {
  for (const st of STATS.nba) {
    assert.equal(st.pace, true, st.key);
    assert.equal(st.positions, nbaPos, st.key);
    assert.equal(st.posGroup('C'), 'all', `${st.key}: one pool where ps is left out`);
  }
  for (const sport of ['nfl', 'nhl', 'mlb']) for (const st of STATS[sport]) assert.ok(!st.pace && !st.positions, `${sport} ${st.key}`);
});

test("ESPN's positions in three groups, an unknown one a forward", () => {
  assert.deepEqual(['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', '', null].map(nbaPos), ['G', 'G', 'G', 'F', 'F', 'F', 'C', 'F', 'F']);
});

test("a team's possessions a 48 minutes from its box; a line missing a column unread", () => {
  const line = (min, fga, fta, oreb, tov) => ({ s: { min, fga, fta, oreb, tov } });
  // (five players' 240 minutes: 85 + 0.44 x 25 + 14 - 10 = 100)
  const list = [line(48, 17, 5, 2, 3), line(48, 17, 5, 2, 3), line(48, 17, 5, 2, 3), line(48, 17, 5, 2, 3), line(48, 17, 5, 2, 2)];
  assert.ok(Math.abs(nbaPossessions(list) - 100) < 1e-9);
  // (an overtime game's 265 minutes: per 48)
  const ot = list.map((x, i) => ({ s: { ...x.s, min: i === 0 ? 73 : 48 } }));
  assert.ok(Math.abs(nbaPossessions(ot) - (100 * 240) / 265) < 1e-9);
  assert.equal(nbaPossessions([...list, { s: { min: 5, fga: 1, fta: 0, oreb: undefined, tov: 0 } }]), null);
});

test("pace: the other side's possessions over the league's, the game's expected their product, 1 till it's known", () => {
  // (a fast team F (110 a game, its games' both sides) that never plays B (100 every game); five players' lines a side)
  const side = (game, date, team, opp, poss) =>
    Array.from({ length: 5 }, (_, i) => ({ pid: `${team}${i}`, pos: 'G', season: 2026, date, game, team, opp, s: { min: 48, fga: poss / 5, fta: 0, oreb: 0, tov: 0 } }));
  const rows = [];
  let n = 0;
  const teams = ['F', 'A', 'B', 'C'];
  for (let d = 1; d <= 40; d++) {
    for (const [h, a] of [[teams[d % 4], teams[(d + 1) % 4]], [teams[(d + 2) % 4], teams[(d + 3) % 4]]]) {
      const id = `g${n++}`;
      const poss = (h === 'F' || a === 'F' ? 110 : 100);
      rows.push(...side(id, day(d), h, a, poss), ...side(id, day(d), a, h, poss));
    }
  }
  const m = nbaMatchups(rows);
  const first = rows.filter((r) => r.date === day(1));
  for (const r of first) assert.deepEqual([r.pace, r.paceG], [1, 1]);
  const last = rows.filter((r) => r.date === day(40));
  const vsF = last.find((r) => r.opp === 'F');
  const vsSlow = last.find((r) => r.opp === 'B');
  assert.ok(vsF.pace > 1.02, `${vsF.pace}`);
  assert.ok(vsSlow.pace < 1, `${vsSlow.pace}`);
  // (live: the same tables, after the last day)
  const live = m.live('A0', 'A', 'F', 'G', 2026);
  assert.ok(live.pace > 1.02 && Math.abs(live.paceG - live.pace * (m.live('A0', 'F', 'A', 'G', 2026).pace)) < 1e-9);
  // (another season, no league's of its own yet: last season's, each team's pulled toward its last season)
  assert.ok(m.live('A0', 'A', 'F', 'G', 2027).pace > 1);
});

test('pace in the projection: po 0 none; po 1 the ratio; pg 1 the game form', () => {
  const stat = { key: 'pts', pace: true };
  const rows = [1, 2, 3, 4].flatMap((d) => Array.from({ length: 30 }, (_, i) => ({ pid: `o${i}`, pos: 'G', season: 2026, date: day(d), opp: 'x', s: { pts: 10 } })));
  const row = { pid: 'o1', pos: 'G', season: 2026, date: day(9), opp: 'x', pace: 1.05, paceG: 1.1 };
  const off = makeModel(stat, BASE, {});
  const on = makeModel(stat, { ...BASE, po: 1 }, {});
  const game = makeModel(stat, { ...BASE, po: 1, pg: 1 }, {});
  for (const m of [off, on, game]) for (const d of [1, 2, 3, 4]) m.learn(rows.filter((r) => r.date === day(d)));
  assert.equal(off.project(row).paceF, 1);
  assert.ok(Math.abs(on.project(row).paceF - 1.05) < 1e-9);
  assert.ok(Math.abs(game.project(row).paceF - 1.1) < 1e-9);
  assert.ok(Math.abs(on.project(row).mu / off.project(row).mu - 1.05) < 1e-9);
  // (a row with no pace read: 1)
  assert.equal(on.project({ ...row, pace: undefined }).paceF, 1);
});

test("positions (ps): a center's rebounds against a defense centers feast on, apart from its guards'", () => {
  const stat = { key: 'reb', positions: nbaPos, posGroup: () => 'all', roles: true };
  // (defense X gives centers 14 against their usual 10, guards 4 against their usual 4)
  const hist = [];
  for (let d = 1; d <= 12; d++) {
    for (let i = 0; i < 4; i++) {
      hist.push({ pid: `c${i}`, pos: 'C', season: 2026, date: day(d), opp: d % 2 ? 'X' : 'Y', s: { reb: d % 2 ? 14 : 10 } });
      hist.push({ pid: `g${i}`, pos: 'G', season: 2026, date: day(d), opp: d % 2 ? 'X' : 'Y', s: { reb: 4 } });
    }
  }
  const byDay = new Map();
  for (const r of hist) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const one = makeModel(stat, BASE, {});
  const split = makeModel(stat, { ...BASE, ps: 1 }, {});
  for (const m of [one, split]) for (const list of byDay.values()) m.learn(list);
  const c = { pid: 'c0', pos: 'C', season: 2026, date: day(20), opp: 'X' };
  const gd = { pid: 'g0', pos: 'G', season: 2026, date: day(20), opp: 'X' };
  // (one pool: the guards' even games dilute X's centers' edge; by position, the guards' none and the centers' more)
  assert.ok(split.project(c).opp > one.project(c).opp, `${split.project(c).opp} ${one.project(c).opp}`);
  assert.ok(Math.abs(split.project(gd).opp - 1) < Math.abs(one.project(gd).opp - 1));
});

test('positions with ps 2: the role table keyed by role and position', () => {
  const stat = { key: 'reb', positions: nbaPos, posGroup: () => 'all', roles: true };
  const m = makeModel(stat, { ...BASE, ps: 2, roleK: 8 }, {});
  const rows = Array.from({ length: 6 }, (_, i) => ({ pid: `c${i}`, pos: 'C', role: 'S', season: 2026, date: day(1), opp: 'X', s: { reb: 10 } }));
  m.learn(rows);
  m.learn(rows.map((r) => ({ ...r, date: day(2) })));
  m.learn(rows.map((r) => ({ ...r, date: day(3) })));
  m.learn(rows.map((r) => ({ ...r, date: day(4) })));
  const p = m.project({ pid: 'c0', pos: 'C', role: 'S', season: 2026, date: day(9), opp: 'X' });
  assert.equal(p.roleKey, 'S-C');
  assert.ok(m.roleTable('S-C', 2026).length === 1 && m.roleTable('S', 2026).length === 0);
});
