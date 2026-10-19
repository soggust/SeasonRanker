// The feeds round's shots from ESPN's play-by-play (libs/ranker/scripts/model/plays.mjs) and their tables
// (matchups.mjs shotTable, zoneTable): each shooter's attempts by kind or zone read right, and a game's shots
// never inform its own rows, only the days after it (the tables learn a day after its rows are read).

import assert from 'node:assert/strict';
import test from 'node:test';
import { nbaShots, nhlShots } from '../libs/ranker/scripts/model/plays.mjs';
import { nbaMatchups, nhlMatchups, shotTable, zoneTable } from '../libs/ranker/scripts/model/matchups.mjs';

const play = (type, x, y, parts) => ({ type: { text: type }, coordinate: { x, y }, participants: parts.map(([t, id]) => ({ type: t, athlete: { id } })) });

test("NHL: on goal, missed, blocked by the shooter; the slot by the distance to the nearer net", () => {
  const sh = nhlShots({
    plays: [play('Shot', 80, 0, [['shooter', '1'], ['saver', '9']]), play('Goal', -85, 3, [['scorer', '1'], ['assister', '2']]), play('Missed', 40, 20, [['shooter', '1']]), play('Blocked', 50, -10, [['shooter', '2'], ['defender', '7']]), play('Hit', 0, 0, [['hitter', '3']])],
  });
  assert.deepEqual(sh['1'].slice(0, 4), [2, 1, 0, 2]);
  assert.deepEqual(sh['2'].slice(0, 4), [0, 0, 1, 0]);
  assert.equal(sh['1'][5], 3);
  assert.ok(Math.abs(sh['1'][4] - (9 + Math.hypot(4, 3) + Math.hypot(49, 20))) < 0.2);
  assert.equal(sh['3'], undefined);
});

test('NBA: field goals by zone, free throws left out, the shooter the first participant (a block too)', () => {
  const s = (text, x, y, made, id, type = 'Jump Shot') => ({ shootingPlay: true, scoringPlay: made, text, type: { text: type }, coordinate: { x, y }, participants: [{ athlete: { id } }, { athlete: { id: '99' } }] });
  const sh = nbaShots({
    plays: [s('A makes dunk', 25, 1, true, '1', 'Dunk Shot'), s('A misses 15-foot jumper', 25, 15, false, '1'), s('A makes 25-foot three point jumper', 10, 20, true, '1'), s('B blocks A two point shot', 25, 2, false, '1', 'Layup Shot'), s('A makes free throw 1 of 2', -2e8, -2e8, true, '1', 'Free Throw - 1 of 2')],
  });
  assert.deepEqual(sh['1'], [2, 1, 1, 0, 1, 1]);
  assert.equal(sh['99'], undefined);
});

// (a day's rows for one NHL game: a shooter on each side; sh as nhlShots keeps it)
const nhlDay = (day, game, sh) => [
  { pid: 'a', pos: 'F', team: 'T', opp: 'U', season: 2026, date: `${day}T23:00Z`, game, home: true, s: { toi: 18, sog: sh[0], pts: 0, goals: 0 }, sh },
  { pid: 'b', pos: 'F', team: 'U', opp: 'T', season: 2026, date: `${day}T23:00Z`, game, home: false, s: { toi: 18, sog: 2, pts: 0, goals: 0 }, sh: [2, 1, 1, 1, 60, 4] },
];

test("NHL rink zones: a game's shots read only from the next day, never in its own rows", () => {
  // (enough league volume first: 400 days of a steady shooter)
  const rows = [];
  for (let i = 0; i < 400; i++) rows.push(...nhlDay(new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10), `g${i}`, [2, 1, 1, 1, 60, 4]));
  // (then a day where 'a' misses everything, and the day after)
  const odd = nhlDay('2026-03-01', 'odd', [0, 10, 10, 0, 800, 20]);
  const after = nhlDay('2026-03-02', 'after', [2, 1, 1, 1, 60, 4]);
  nhlMatchups([...rows, ...odd, ...after]);
  const a0 = odd[0];
  const a1 = after[0];
  assert.ok(Math.abs(a1.shOn) > Math.abs(a0.shOn), `${a0.shOn} ${a1.shOn}`);
  assert.ok(a1.shDist > a0.shDist);
});

test('the tables read nothing before they learn', () => {
  assert.deepEqual(shotTable().of('a', 'U', 2026), { shOn: 0, shSlot: 0, shDist: 0, oppBlk: 0 });
  assert.deepEqual(zoneTable().of('a', 'U', 2026), { zoneEdge: 0, opp3: 0, zone3: 0 });
});

test("NBA zones: the other side's rim defense moves a rim scorer's edge only after the game it was seen in", () => {
  const row = (day, game, pid, team, opp, sh) => ({ pid, pos: 'G', team, opp, season: 2026, date: `${day}T23:00Z`, game, home: team === 'T', s: { min: 30, pts: 10, reb: 0, ast: 0, fg3: 0, pra: 10 }, sh });
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const d = new Date(Date.UTC(2025, 9, 1) + i * 864e5).toISOString().slice(0, 10);
    rows.push(row(d, `g${i}`, 'a', 'T', 'X', [5, 3, 5, 2, 5, 2]), row(d, `g${i}`, 'x', 'X', 'T', [5, 3, 5, 2, 5, 2]));
  }
  // (a game where U lets every rim shot in, then 'a' against U the next day)
  const leak = [row('2026-08-01', 'L', 'z', 'Z', 'U', [400, 400, 0, 0, 0, 0])];
  const vs = [row('2026-08-01', 'V0', 'a', 'T', 'U', [5, 3, 5, 2, 5, 2]), row('2026-08-02', 'V1', 'a', 'T', 'U', [5, 3, 5, 2, 5, 2])];
  nbaMatchups([...rows, ...leak, ...vs]);
  assert.equal(vs[0].zoneEdge, 0);
  assert.ok(vs[1].zoneEdge > 0, `${vs[1].zoneEdge}`);
});

test("MLB: Statcast's balls in play by game and batter (savant.mjs contactOf)", async () => {
  const { contactOf } = await import('../libs/ranker/scripts/model/savant.mjs');
  const head = '"game_pk","batter","events","type","estimated_ba_using_speedangle","estimated_slg_using_speedangle","launch_speed","launch_speed_angle","bb_type","hc_x","hc_y","stand"';
  const rows = ['1,7,"single","X",0.6,0.7,101,4,"line_drive",80,120,"R"', '1,7,"field_out","X",0.2,0.3,88,2,"fly_ball",170,100,"R"', '1,7,"","S",,,,,,,,"R"', '1,7,"home_run","X",0.9,3.5,108,6,"fly_ball",60,60,"R"'];
  const got = contactOf([head, ...rows].join('\n'));
  // (3 in play, 2 hits for 5 bases, xBA 1.7, xSLG 4.5, 2 hard hit, 1 barrel, 2 pulled in the air by a righty)
  assert.deepEqual(got['1|7'], [3, 2, 5, 1.7, 4.5, 2, 1, 2]);
});

test("MLB contact: a game's balls in play inform only the days after it", async () => {
  const { mlbMatchups } = await import('../libs/ranker/scripts/model/matchups.mjs');
  const row = (day, pid, sv) => ({ pid, pos: 'B', team: 'T', opp: 'U', season: 2026, date: `${day}T23:00Z`, game: null, home: true, s: { pa: 4, hits: 1, tb: 1, hr: 0 }, sv });
  const rows = [];
  for (let i = 0; i < 1000; i++) rows.push(row(new Date(Date.UTC(2026, 3, 1) + i * 36e5 * 3).toISOString().slice(0, 10), `p${i % 30}`, [3, 1, 1, 1, 1.5, 1, 0, 0]));
  // (an unlucky day for 'u': xBA 3 on 4 in play, no hits; then the next day)
  const odd = row('2026-09-01', 'u', [4, 0, 0, 3, 4, 3, 1, 1]);
  const next = row('2026-09-02', 'u', [3, 1, 1, 1, 1.5, 1, 0, 0]);
  mlbMatchups([...rows, odd, next]);
  assert.equal(odd.xHit, 0);
  assert.ok(next.xHit > 0, `${next.xHit}`);
});
