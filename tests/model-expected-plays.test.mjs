// The NFL's expected plays tonight (audit #19b; libs/ranker/scripts/model/matchups.mjs playsX, playsS, playsA;
// project.mjs ep, eg, playsFactor; props.mjs PLAYS): his team's expected plays from its own pace and the other
// side's, or the game's expected total and its share, over their average in his games, in place of the
// defense's pace (pc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel, playsFactor, searched } from '../libs/ranker/scripts/model/project.mjs';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

const day = (d) => `2025-${String(9 + Math.floor((d - 1) / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;

test("searched where it was kept (passing attempts); the other NFL stats and the other sports' not", () => {
  const on = STATS.nfl.filter((s) => searched(s, 'ep')).map((s) => s.key);
  assert.deepEqual(on, ['passAtt']);
  for (const sport of ['nba', 'nhl', 'mlb']) for (const st of STATS[sport]) assert.ok(!searched(st, 'ep'), `${sport} ${st.key}`);
});

// (a league of four teams: F runs 80 plays a game against anyone, the rest 60; each game one quarterback a side)
const league = () => {
  const rows = [];
  const teams = ['F', 'A', 'B', 'C'];
  let n = 0;
  for (let d = 1; d <= 24; d++) {
    for (const [h, a] of [[teams[d % 4], teams[(d + 1) % 4]], [teams[(d + 2) % 4], teams[(d + 3) % 4]]]) {
      const game = `g${n++}`;
      for (const [team, opp, home] of [[h, a, true], [a, h, false]]) {
        const plays = team === 'F' ? 80 : 60;
        rows.push({ pid: `${team}qb`, pos: 'QB', team, opp, game, home, date: day(d), season: 2025, s: { passAtt: plays / 2, rushAtt: plays / 2 } });
      }
    }
  }
  return rows;
};

test("expected plays: a fast team's over the league's and its share over half; its game's own plays learned after it", () => {
  const rows = league();
  const m = nflMatchups(rows);
  // (the first day: no team's tallies read, none (ep off on the row, pc as before); the second, near the league's)
  for (const r of rows.filter((r) => r.date === day(1))) assert.ok(r.playsX === null && r.playsS === null, `${r.team} ${r.playsX} ${r.playsS}`);
  for (const r of rows.filter((r) => r.date === day(2) && r.team !== 'F' && r.opp !== 'F')) assert.ok(Math.abs(r.playsX - 1) < 0.1 && Math.abs(r.playsS - 1) < 0.1, `${r.team} ${r.playsX} ${r.playsS}`);
  const last = rows.filter((r) => r.date === day(24));
  const f = last.find((r) => r.team === 'F');
  const slow = last.find((r) => r.team !== 'F' && r.opp !== 'F');
  assert.ok(f.playsX > 1.1, `F ${f.playsX}`);
  assert.ok(f.playsS > slow.playsS, `F ${f.playsS} against ${slow.playsS}`);
  // (the game's own plays, over the league's: F's above, read only after it)
  assert.ok(f.playsA > slow.playsA);
  // (live: the same tables after the last day; teams with nothing read, none, not the league's read as known)
  const live = m.live('Fqb', 'F', 'A', 'QB', 2025);
  assert.ok(live.playsX > 1.1 && live.playsS > 1, `${live.playsX} ${live.playsS}`);
  const none = m.live('Xqb', 'X', 'Y', 'QB', 2025);
  assert.ok(none.playsX === null && none.playsS === null, `${none.playsX} ${none.playsS}`);
  // (one side read: what it says)
  const half = m.live('Fqb', 'F', 'Y', 'QB', 2025);
  assert.ok(half.playsX > 1.1 && half.playsS > 1, `${half.playsX} ${half.playsS}`);
});

test("expected plays' factor: tonight's over its average in his games, by the form; nothing read, none", () => {
  const cur = { exs: 4 * 1.2, exn: 4, ess: 4 * 1.1, esn: 4, eas: 4 * 1.3, ean: 4 };
  const row = { playsX: 1.0, playsS: 1.0, playsA: 2 };
  // (each average pulled toward even by PLAYS_M (4) games)
  assert.ok(Math.abs(playsFactor(row, cur, 1) - 1 / 1.1) < 1e-9);
  assert.ok(Math.abs(playsFactor(row, cur, 2) - 1 / 1.15) < 1e-9);
  assert.ok(Math.abs(playsFactor(row, cur, 3) - 1 / 1.05) < 1e-9);
  // (tonight's own playsA never read: it's the game's own)
  assert.ok(Math.abs(playsFactor({ ...row, playsA: 9 }, cur, 2) - 1 / 1.15) < 1e-9);
  // (a player with no games this season: tonight's over even)
  assert.equal(playsFactor({ ...row, playsX: 1.08 }, {}, 1), 1.08);
  assert.equal(playsFactor({ playsS: 1 }, cur, 1), null);
});

test("in the projection: in place of the defense's pace, a row without them as before", () => {
  const stat = { key: 'passAtt', volume: 'pass', plays: true };
  const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0, pc: 1 };
  // (each model its own rows: the replay marks the rows it learns)
  const rowsOf = () => [1, 2, 3, 4].flatMap((d) => Array.from({ length: 30 }, (_, i) => ({ pid: `q${i}`, pos: 'QB', season: 2025, date: day(d), opp: 'x', pace: 1, playsX: 1.2, playsS: 1, playsA: 1, s: { passAtt: 30 } })));
  const off = makeModel(stat, BASE, {});
  const on = makeModel(stat, { ...BASE, ep: 1, eg: 1 }, {});
  const plain = makeModel({ key: 'passAtt', volume: 'pass' }, { ...BASE, ep: 1, eg: 1 }, {});
  for (const m of [off, on, plain]) {
    const rows = rowsOf();
    for (const d of [1, 2, 3, 4]) m.learn(rows.filter((r) => r.date === day(d)));
  }
  const row = { pid: 'q1', pos: 'QB', season: 2025, date: day(9), opp: 'x', pace: 1.1, playsX: 1.2 * 0.9, playsS: 1 };
  // (off: the defense's pace to the power pc; on: 1.08 over his 4 games' 1.2 pulled by 4 toward 1 (1.1), the pace not on top)
  assert.ok(Math.abs(off.project(row).paceF - 1.1) < 1e-9);
  assert.ok(Math.abs(on.project(row).paceF - 1.08 / 1.1) < 1e-9, `${on.project(row).paceF}`);
  // (a row with none read: the defense's pace as before)
  assert.ok(Math.abs(on.project({ ...row, playsX: undefined }).paceF - 1.1) < 1e-9);
  // (a stat not marked: none)
  assert.ok(Math.abs(plain.project(row).paceF - 1.1) < 1e-9);
});

test("in the projection, the kept form (eg 3): tonight's game total and share over his games', pulled toward even", () => {
  const stat = { key: 'passAtt', volume: 'pass', plays: true };
  const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0, pc: 0.5 };
  // (a fast team's quarterbacks: 4 games last season and 2 this one, every game's playsS 1.15)
  const rowsOf = () => [[2024, 1], [2024, 2], [2024, 3], [2024, 4], [2025, 1], [2025, 2]].map(([season, d]) => Array.from({ length: 30 }, (_, i) => ({ pid: `q${i}`, pos: 'QB', season, date: `${season}-09-0${d}`, opp: 'x', pace: 1, playsX: 1.15, playsS: 1.15, playsA: 1.15, s: { passAtt: 30 } })));
  const on = makeModel(stat, { ...BASE, ep: 0.5, eg: 3 }, {});
  const days = rowsOf();
  for (const d of days) on.learn(d);
  // (tonight's 1.15 over his 2 games' 1.15 pulled by 4 toward even, to the power 0.5: the defense's pace (1.3)
  // not on top; a fast team's pace partly put back early in a season, as measured: playsFactor)
  const row = { pid: 'q1', pos: 'QB', season: 2025, date: '2025-09-09', opp: 'x', pace: 1.3, playsX: 1.15, playsS: 1.15 };
  const f = on.project(row).paceF;
  assert.ok(Math.abs(f - Math.pow(1.15 / ((2 * 1.15 + 4) / 6), 0.5)) < 1e-9, `${f}`);
  // (his first game of a season (none this one yet): tonight's over even, to the power 0.5)
  const first = on.project({ ...row, pid: 'q2', season: 2026, date: '2026-09-09', playsS: 1.2 });
  assert.ok(Math.abs(first.paceF - Math.pow(1.2, 0.5)) < 1e-9, `${first.paceF}`);
  // (tonight's not read (a team unseen): the defense's pace to the power pc, as before)
  assert.ok(Math.abs(on.project({ ...row, playsS: null }).paceF - Math.pow(1.3, 0.5)) < 1e-9);
});
