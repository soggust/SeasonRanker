// The team's game first, then its players' (audit #19c; libs/ranker/scripts/model/project.mjs tr, tf, squadF,
// squadUp, makeModel's squad and squadMates; props.mjs TEAM): each team-game's players' projections summed
// against the team's own expected total of the stat, each player's shrunk toward his share of it by tr.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';
import { SQUAD_N, SQUAD_REG, TR_MIN, makeModel, replayStat, searched, squadF, squadMkt, squadSum } from '../libs/ranker/scripts/model/project.mjs';

const day = (d) => `2025-${String(9 + Math.floor((d - 1) / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;

test('searched on the stats a team splits among its players where it was kept or came close: the NFL rushing, the NBA, the NHL shots', () => {
  assert.deepEqual(STATS.nfl.filter((s) => searched(s, 'tr')).map((s) => s.key), ['rushYds', 'rushAtt']);
  assert.deepEqual(STATS.nba.filter((s) => searched(s, 'tr')).map((s) => s.key), ['pts', 'reb', 'ast', 'fg3', 'pra']);
  assert.deepEqual(STATS.nhl.filter((s) => searched(s, 'tr')).map((s) => s.key), ['sog']);
  // (a quarterback's passing, a goalie's saves, a pitcher's: his team's alone, nothing to allocate)
  for (const st of [...STATS.mlb, ...STATS.nfl.filter((s) => s.key.startsWith('pass')), ...STATS.nhl.filter((s) => s.key === 'saves')]) assert.ok(!searched(st, 'tr'), st.key);
});

test("the factor: (T / S)^tr held to 2 either way, the lines' points by the form; off or unread, 1", () => {
  const sq = { S: 100, T: 120, m: null };
  assert.equal(squadF({}, sq), 1);
  assert.equal(squadF({ tr: 0.5, tf: 1 }, null), 1);
  assert.equal(squadF({ tr: 0.5, tf: 1 }, { ...sq, T: null }), 1);
  assert.equal(squadF({ tr: 0.5, tf: 1 }, { ...sq, S: 0 }), 1);
  assert.ok(Math.abs(squadF({ tr: 0.5, tf: 1 }, sq) - Math.sqrt(1.2)) < 1e-12);
  assert.ok(Math.abs(squadF({ tr: 1, tf: 1 }, { S: 10, T: 100 }) - 2) < 1e-12);
  assert.ok(Math.abs(squadF({ tr: 1, tf: 1 }, { S: 100, T: 10 }) - 0.5) < 1e-12);
  // (tf 1 never reads the lines; 2 their square root, 3 in full)
  assert.ok(Math.abs(squadF({ tr: 1, tf: 1 }, { ...sq, m: 1.1 }) - 1.2) < 1e-12);
  assert.ok(Math.abs(squadF({ tr: 1, tf: 2 }, { ...sq, m: 1.1 }) - 1.2 * Math.sqrt(1.1)) < 1e-12);
  assert.ok(Math.abs(squadF({ tr: 1, tf: 3 }, { ...sq, m: 1.1 }) - 1.32) < 1e-12);
  // (the lines' implied points for his side over their average; none without them)
  assert.equal(squadMkt({ home: false, mkt: [24, 20] }, { avgMkt: 22 }), 20 / 22);
  assert.equal(squadMkt({ home: true, mkt: null }, { avgMkt: 22 }), null);
  assert.equal(squadMkt({ home: true, mkt: [24, 20] }, {}), null);
});

// (a league of four teams, three players each, two games a day: team F's players put up 12 a game between them,
// the rest 6; each player his team's third)
const league = (days = 12) => {
  const rows = [];
  const teams = ['F', 'A', 'B', 'C'];
  let n = 0;
  for (let d = 1; d <= days; d++) {
    for (const [h, a] of [[teams[d % 4], teams[(d + 1) % 4]], [teams[(d + 2) % 4], teams[(d + 3) % 4]]]) {
      const game = `g${n++}`;
      for (const [team, opp, home] of [[h, a, true], [a, h, false]]) {
        for (let i = 0; i < 3; i++) rows.push({ pid: `${team}${i}`, pos: 'WR', team, opp, game, home, date: day(d), season: 2025, s: { x: team === 'F' ? 4 : 2 } });
      }
    }
  }
  return rows;
};
const STAT = { key: 'x', team: true };
const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };

test("the team's expected total: its projected players' a game, by the other side's allowed, after TR_MIN games and 20 of the league's", () => {
  const m = makeModel(STAT, BASE, {});
  const rows = league();
  for (let d = 1; d <= 12; d++) {
    const today = rows.filter((r) => r.date === day(d));
    // (none till the league has 20 team-games (each team's first two games aren't projected: no total either))
    if (d <= 2) for (const r of today) assert.equal(m.squad(r), null);
    m.learn(today);
  }
  // (F's total about 12 against an average side, the rest's about 6, each against F's defense its own (F allows
  // what the rest score))
  const f = m.squad({ team: 'F', opp: 'A', season: 2025 });
  const a = m.squad({ team: 'A', opp: 'B', season: 2025 });
  assert.ok(f > 10 && f < 13, `F ${f}`);
  assert.ok(a > 5 && a < 7, `A ${a}`);
  // (a team with no games this season, or under TR_MIN: none)
  assert.equal(m.squad({ team: 'X', opp: 'A', season: 2025 }), null);
  assert.equal(m.squad({ team: 'F', opp: 'A', season: 2026 }), null);
  assert.ok(TR_MIN >= 1);
  // (a stat not marked team: none)
  const plain = makeModel({ key: 'x' }, BASE, {});
  for (let d = 1; d <= 12; d++) plain.learn(rows.filter((r) => r.date === day(d)));
  assert.equal(plain.squad({ team: 'F', opp: 'A', season: 2025 }), null);
});

test("his team's sum: his own projection in full, each teammate's latest by his share of the last games and his chance tonight", () => {
  const mates = [{ pid: 'a', w: 1, mu: 3 }, { pid: 'b', w: 0.4, mu: 5 }, { pid: 'c', w: 1, mu: 2 }];
  // (his own (a) at tonight's 4 in place of his latest 3; b at 0.4 of his 5)
  assert.equal(squadSum(mates, 'a', 4, () => 1), 4 + 2 + 2);
  // (c out tonight: none of his)
  assert.equal(squadSum(mates, 'a', 4, (x) => (x.pid === 'c' ? 0 : 1)), 4 + 2);
  // (not one of them yet (back from an absence): his own on top)
  assert.equal(squadSum(mates, 'z', 1, () => 1), 1 + 3 + 2 + 2);
  // (none read: null)
  assert.equal(squadSum(null, 'a', 4, () => 1), null);
  assert.equal(squadSum([], 'a', 4, () => 1), null);
  assert.equal(squadSum(mates, 'a', 0, () => 1), null);
});

test("in the replay: a regular not playing out of the sum (as an absence), the rest of it before the game; tr 1 to the team's, tr 0 as before", () => {
  const rows = league();
  // (A0 out of A's games from day 9: his part leaves the sum, the two left lifted toward the team's 6)
  const short = rows.filter((r) => !(r.pid === 'A0' && r.date >= day(9)));
  const off = replayStat(STAT, short, { ...BASE, scale: 1, trRead: true }, {}, ['0000', '0000']).out;
  const on = replayStat(STAT, short, { ...BASE, scale: 1, tr: 1, tf: 1 }, {}, ['0000', '0000']).out;
  assert.equal(off.length, on.length);
  const key = (x) => `${x.row.game}|${x.row.pid}`;
  const offBy = new Map(off.map((x) => [key(x), x]));
  let read = 0;
  for (const x of on) {
    const o = offBy.get(key(x));
    assert.ok(o.p.squad, key(x));
    // (off: the projection as it was (its sums read for the search: trRead); on: times T / S)
    if (!(x.p.squad.T > 0 && x.p.squad.S > 0)) {
      assert.ok(Math.abs(x.p.mu - o.p.mu) < 1e-9, key(x));
      continue;
    }
    read++;
    assert.ok(Math.abs(x.p.mu - o.p.mu * Math.min(2, Math.max(0.5, x.p.squad.T / x.p.squad.S))) < 1e-9, key(x));
  }
  assert.ok(read >= 20, `${read}`);
  // (A's last games: A0 a regular, out of the sum; A1's sum about his own and A2's only)
  const late = on.filter((x) => x.row.team === 'A' && x.row.date >= day(10));
  assert.ok(late.length > 0);
  for (const x of late) assert.ok(x.p.squad.S < 4.6 && x.p.mu > 2.5, `${x.row.pid} ${x.p.squad.S} ${x.p.mu}`);
  for (const x of off.filter((x) => x.row.team === 'A' && x.row.date >= day(10))) assert.ok(x.p.mu < 2.2, `${x.row.pid} ${x.p.mu}`);
  // (the ones who played, summed, on each row: the log's gap)
  for (const x of late) assert.ok(x.p.squad.sum > 0);
  // (neither on nor searched: no sums at all, nothing paid for them)
  for (const x of replayStat(STAT, short, { ...BASE, scale: 1 }, {}, ['0000', '0000']).out) assert.equal(x.p.squad, undefined);
});

test("in the replay: who got in tonight isn't read, a part-timer's share of the last games counted whether or not he plays", () => {
  // (A3 plays in every other one of A's games (a part-timer, under SQUAD_REG of the last ones): A1's teammates' part
  // of his sum steady night to night, with A3's share in it whether or not he's in)
  const rows = league();
  const aGames = [...new Map(rows.filter((r) => r.team === 'A').map((r) => [r.game, r])).values()];
  const extra = aGames.filter((_, i) => i % 2 === 0).map((r) => ({ ...r, pid: 'A3', s: { x: 1 } }));
  const all = [...rows, ...extra].sort((a, b) => a.date.localeCompare(b.date));
  const out = replayStat(STAT, all, { ...BASE, scale: 1, trRead: true }, {}, ['0000', '0000']).out;
  const a1 = out.filter((x) => x.row.pid === 'A1' && x.row.date >= day(8));
  assert.ok(a1.length >= 4);
  assert.ok(SQUAD_REG > 0.5);
  const s = a1.map((x) => x.p.squad.S - x.p.mu);
  for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i] - s[i - 1]) < 0.3, `${s}`);
});

test("who's likely to play: each of the team's players by how many of its last SQUAD_N games he played in, with his latest projection", () => {
  const m = makeModel(STAT, BASE, {});
  const rows = league().filter((r) => !(r.pid === 'A0' && r.date >= day(9)));
  for (let d = 1; d <= 12; d++) m.learn(rows.filter((r) => r.date === day(d)));
  const mates = m.squadMates('A', 2025);
  const w = Object.fromEntries(mates.map((x) => [x.pid, x.w]));
  assert.equal(w.A1, 1);
  assert.equal(w.A2, 1);
  // (A0 out of A's games from day 9 (A plays every day): one of its last SQUAD_N, day 8's; out of every one of them,
  // left out)
  assert.equal(SQUAD_N, 5);
  assert.ok(Math.abs(w.A0 - 1 / 5) < 1e-12, `${w.A0}`);
  const gone = makeModel(STAT, BASE, {});
  const rows2 = league().filter((r) => !(r.pid === 'A0' && r.date >= day(8)));
  for (let d = 1; d <= 12; d++) gone.learn(rows2.filter((r) => r.date === day(d)));
  assert.equal(gone.squadMates('A', 2025).find((x) => x.pid === 'A0'), undefined);
  assert.equal(m.squadMates('A', 2026), null);
  assert.equal(m.squadMates('X', 2025), null);
});
