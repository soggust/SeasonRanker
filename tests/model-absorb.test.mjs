// Who absorbs the work missing (audit #7; libs/ranker/scripts/model/matchups.mjs absorbTable, nflMatchups
// vacated's fourth split, teamWork absorb; project.mjs vl; props.mjs STATS vacLearned): a split learned from the
// history's fresh absences, by class (the NFL's position and place in its order, the NBA's position and starter or
// bench), across positions too, in place of the even ones where the held-out games are better with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';
import { nflMatchups, nbaMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

const date = (d) => new Date(Date.UTC(2025, 8, 1) + d * 864e5).toISOString().slice(0, 10);

// (an NFL league of 32 teams, each team a WR1 (8 targets), WR2 (5), TE1 (4) and RB1 (3 targets, 15 carries); the
// WR1 out every out-th day, his targets all the tight end's, the WR2's the same)
const nflLeague = (days, out = 4) => {
  const rows = [];
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < 16; i++) {
      const game = `g${d}_${i}`;
      for (const [team, opp, home] of [[`T${2 * i}`, `T${2 * i + 1}`, true], [`T${2 * i + 1}`, `T${2 * i}`, false]]) {
        const wr1Out = d % out === 0;
        const row = (pid, pos, targets, rushAtt = 0) => ({ pid: `${team}${pid}`, pos, date: date(d), season: 2025, team, opp, game, home, s: { targets, rushAtt, passAtt: 0, snaps: 50 } });
        if (!wr1Out) rows.push(row('wr1', 'WR', 8));
        rows.push(row('wr2', 'WR', 5), row('te1', 'TE', wr1Out ? 12 : 4), row('rb1', 'RB', 3, 15), { ...row('qb', 'QB', 0), s: { passAtt: 30, targets: 0, rushAtt: 2, snaps: 60 } });
      }
    }
  }
  return rows;
};

test('every NFL and NBA vacated stat has its learned split, at an index past the even ones; the NHL none', () => {
  for (const st of STATS.nfl.filter((s) => s.vacated)) assert.deepEqual(st.vacLearned, [3], st.key);
  for (const st of STATS.nba) assert.deepEqual(st.vacLearned, [6, 7], st.key);
  for (const st of [...STATS.nhl, ...STATS.mlb]) assert.ok(!st.vacLearned, st.key);
});

test("the NFL's learned split: the tight end who took the WR1's targets, not the WR2 the even split credits", () => {
  const lg = nflMatchups(nflLeague(40));
  const t = lg.absorbed();
  assert.ok(t.ready, JSON.stringify({ events: t.events, quiet: t.quiet }));
  assert.ok(t.t.WR1.TE1 > 0.8, `the tight end's share ${t.t.WR1.TE1}`);
  assert.ok(Math.abs(t.t.WR1.WR1 ?? 0) < 0.2, `the WR2 (the WR1 among the ones playing) ${t.t.WR1.WR1}`);
  const out = new Set(['T0wr1']);
  const te = lg.live('T0te1', 'T0', 'T1', 'TE', 2025, out).vacs;
  const wr2 = lg.live('T0wr2', 'T0', 'T1', 'WR', 2025, out).vacs;
  assert.equal(te.length, 4);
  assert.equal(te[0], 0, 'no tight end missing: the even split gives him none');
  assert.ok(te[3] > 0.9, `the learned: ${te[3]}`);
  assert.ok(wr2[0] > 1.2, `the even split in proportion: the WR2 ${wr2[0]}`);
  assert.ok(Math.abs(wr2[3]) < 0.3, `the learned: the WR2 ${wr2[3]}`);
  // (nobody missing: nothing either way)
  assert.deepEqual(lg.live('T0te1', 'T0', 'T1', 'TE', 2025, new Set()).vacs, [0, 0, 0, 0]);
  // (a questionable WR1 at half: half the learned cut, about)
  const half = lg.live('T0te1', 'T0', 'T1', 'TE', 2025, (id) => (id === 'T0wr1' ? 0.5 : 0)).vacs[3];
  assert.ok(Math.abs(half - te[3] / 2) < 0.05, `${half} against ${te[3]}`);
});

test('before the history has enough absences, the learned split is the split in proportion', () => {
  const lg = nflMatchups(nflLeague(8));
  assert.equal(lg.absorbed().ready, false);
  const out = new Set(['T0wr1']);
  for (const [pid, pos] of [['T0te1', 'TE'], ['T0wr2', 'WR']]) {
    const v = lg.live(pid, 'T0', 'T1', pos, 2025, out).vacs;
    assert.equal(v[3], v[0], pid);
  }
});

test("a game with an absence going on (not fresh, not settled) isn't learned from", () => {
  // (nobody ever missing, then the WR1 out four games running twice: only his first game out each time is a fresh
  // absence, the next three (his work still moving into theirs) not learned from)
  const lg = nflMatchups(nflLeague(40, 1000));
  assert.equal(lg.absorbed().events, 0, 'nobody ever missing: no absences');
  const days = new Set([5, 6, 7, 8, 21, 22, 23, 24]);
  const away = nflLeague(40, 1000).filter((r) => !(r.pid.endsWith('wr1') && days.has(Math.round((Date.parse(r.date) - Date.UTC(2025, 8, 1)) / 864e5))));
  const lg2 = nflMatchups(away);
  // (16 games a day, 32 teams: their first game out each time, 2 x 32)
  assert.equal(lg2.absorbed().events, 64);
});

// (an NBA league of 30 teams: starters G, G, F, F, C at 38 minutes, a bench G (20), F (16), C (12); the first
// starting guard out every fourth day, his minutes all the bench guard's, who starts in his place)
const nbaLeague = (days) => {
  const rows = [];
  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < 15; i++) {
      const game = `n${d}_${i}`;
      for (const [team, opp] of [[`A${2 * i}`, `A${2 * i + 1}`], [`A${2 * i + 1}`, `A${2 * i}`]]) {
        const gOut = d % 4 === 0;
        const row = (pid, pos, min) => ({ pid: `${team}${pid}`, pos, date: date(d), season: 2026, team, opp, game, s: { min, fga: min / 3, fta: 2, ast: 2, pts: min / 2, oreb: 1, tov: 1 } });
        if (!gOut) rows.push(row('g1', 'PG', 38));
        rows.push(row('g2', 'SG', 38), row('f1', 'SF', 38), row('f2', 'PF', 38), row('c1', 'C', 38), row('gb', 'PG', gOut ? 58 : 20), row('fb', 'SF', 16), row('cb', 'C', 12));
      }
    }
  }
  return rows;
};

test("the NBA's learned split: the bench guard who stepped into the five took the starting guard's minutes, not the starters the even split credits", () => {
  // (its last day one the starting guard played: his work as a starter's)
  const lg = nbaMatchups(nbaLeague(39));
  const t = lg.absorbed();
  assert.ok(t.ready, JSON.stringify({ events: t.events, quiet: t.quiet }));
  // (the bench guard among the five playing: a starter's class)
  assert.ok(t['0'].GS.GS > 0.7, `the starting guards' share of a starting guard's minutes ${t['0'].GS.GS}`);
  const out = new Set(['A0g1']);
  const gb = lg.live('A0gb', 'A0', 'A1', 'PG', 2026, out).vacs;
  const f1 = lg.live('A0f1', 'A0', 'A1', 'SF', 2026, out).vacs;
  assert.equal(gb.length, 8);
  // (the even split in proportion: a starter's cut by his minutes, the bench guard's by his fewer)
  assert.ok(f1[0] > 0 && gb[0] > 0);
  // (his class's share, his part of it by his minutes among the starting guards playing)
  assert.ok(gb[6] > 0.3 && gb[6] > 2 * gb[0], `the learned, minutes: the bench guard ${gb[6]}`);
  assert.ok(Math.abs(f1[6]) < 0.15, `the learned, minutes: a starting forward ${f1[6]}`);
  // (nobody missing: nothing either way)
  assert.deepEqual(lg.live('A0gb', 'A0', 'A1', 'PG', 2026, new Set()).vacs, [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('off the search (learned false: project.mjs TRY_VL, as props.mjs passes it), the table is learned but not read', () => {
  const lg = nflMatchups(nflLeague(40), null, { learned: false });
  assert.equal(lg.absorbed().read, false);
  assert.ok(lg.absorbed().ready);
  const v = lg.live('T0te1', 'T0', 'T1', 'TE', 2025, new Set(['T0wr1'])).vacs;
  assert.equal(v[3], v[0]);
  const nb = nbaMatchups(nbaLeague(39), { learned: false });
  assert.equal(nb.absorbed().read, false);
  const g = nb.live('A0gb', 'A0', 'A1', 'PG', 2026, new Set(['A0g1'])).vacs;
  assert.deepEqual([g[6], g[7]], [g[0], g[3]]);
});
