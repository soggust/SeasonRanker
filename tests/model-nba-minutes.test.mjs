// The NBA props' minutes first (libs/ranker/scripts/model/project.mjs, matchups.mjs, playerlogs.mjs, props.mjs): his
// per-minute rate times the minutes he's expected tonight (his season's typical, leaning to his last three games'
// by sr), the box score's starter flag and new columns, the finals' betting lines, and the blowout by role and
// the new starter (measured, off the ctx: CTX values only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, STATS } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { nbaMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { nbaLines, pickLines } from '../libs/ranker/scripts/model/playerlogs.mjs';

const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };
const day = (d) => `2026-01-${String(d).padStart(2, '0')}`;
const g = (d, pts, min, pid = 'p') => ({ pid, pos: 'G', season: 2026, date: day(d), opp: 'o', s: { pts, min }, share: min / 48 });

test('every NBA stat is minutes first; the blowout by role and the new starter are off the ctx', () => {
  for (const st of STATS.nba) {
    assert.equal(st.minutes, true, st.key);
    for (const k of ['blowS', 'blowB', 'newStart']) assert.ok(!st.ctx.includes(k), `${st.key} ${k}`);
  }
  // (and no other sport's)
  for (const sport of ['nfl', 'nhl', 'mlb']) for (const st of STATS[sport]) assert.ok(!st.minutes, `${sport} ${st.key}`);
});

test('minutes first off (sn 0): the per-game rate as before, whatever the minutes', () => {
  const stat = { key: 'pts', minutes: true };
  const m = makeModel(stat, BASE, {});
  m.learn([1, 2, 3, 4, 5, 6].map((d) => g(d, 10, 20)));
  const p = m.project({ pid: 'p', pos: 'G', season: 2026, date: day(20), opp: 'o' });
  assert.equal(p.mode, null);
});

test("minutes first: a minutes jump over his last three games projects at the minutes now, the last three's average by sr", () => {
  const stat = { key: 'pts', minutes: true };
  const plain = makeModel(stat, { ...BASE, K: 2 }, {});
  const mins = makeModel(stat, { ...BASE, K: 2, sn: 1, sr: 1 }, {});
  // (the pool: other guards at 0.5 a minute; then his six games at 16 minutes for 8 points, then three at 32 for 16)
  const others = Array.from({ length: 50 }, (_, i) => g(1, 12, 24, `o${i}`));
  const games = [...[2, 3, 4, 5, 6, 7].map((d) => g(d, 8, 16)), ...[8, 9, 10].map((d) => g(d, 16, 32))];
  for (const m of [plain, mins]) m.learn(others), m.learn(games);
  const row = { pid: 'p', pos: 'G', season: 2026, date: day(20), opp: 'o' };
  const a = plain.project(row);
  const b = mins.project(row);
  assert.equal(b.mode, 'minutes');
  // (sr 1: his last three's 32 minutes, not his last game's alone nor his season's 21)
  assert.ok(Math.abs(b.share * 48 - 32) < 1e-9, `${b.share * 48}`);
  // (half a point a minute times 32: about 16, where the per-game rate sits near 11)
  assert.ok(b.rate > 15 && b.rate < 16.5, `minutes ${b.rate}`);
  assert.ok(a.rate < 12, `per game ${a.rate}`);
});

test("minutes first: sr 0, his season's typical minutes; one game cut short (foul trouble, a blowout) left out", () => {
  const stat = { key: 'pts', minutes: true };
  const m = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  m.learn(Array.from({ length: 50 }, (_, i) => g(1, 12, 24, `o${i}`)));
  m.learn([g(1, 15, 30), g(2, 15, 30), g(3, 15, 30), g(4, 2, 8), g(5, 15, 30)]);
  const p = m.project({ pid: 'p', pos: 'G', season: 2026, date: day(20), opp: 'o' });
  assert.ok(Math.abs(p.share * 48 - 30) < 1e-9, `${p.share * 48}`);
});

test("the NFL's snaps still lean on the last game alone (MIN_RECENT is the NBA's)", () => {
  const stat = { key: 'recYds', snaps: true };
  const m = makeModel(stat, { ...BASE, sn: 1, sr: 1 }, {});
  const wr = (d, v, share) => ({ pid: 'w', pos: 'WR', season: 2026, date: day(d), opp: 'o', s: { recYds: v }, share });
  m.learn(Array.from({ length: 30 }, (_, i) => ({ ...wr(1, 40, 0.8), pid: `o${i}` })));
  m.learn([wr(1, 30, 0.5), wr(2, 30, 0.5), wr(3, 30, 0.5), wr(4, 60, 0.9)]);
  const p = m.project({ pid: 'w', pos: 'WR', season: 2026, date: day(20), opp: 'o' });
  assert.equal(p.mode, 'snaps');
  assert.ok(Math.abs(p.share - 0.9) < 1e-9, `${p.share}`);
});

test("nbaMatchups: each game's minutes over 48 (share) and his start in the team's game before (startLast)", () => {
  const row = (d, pid, min, start) => ({ pid, pos: 'G', season: 2026, date: day(d), team: 't', opp: 'o', game: `g${d}`, s: { min, pts: 10, ast: 1, fga: 8, fta: 2, start } });
  const rows = [row(1, 'a', 36, 1), row(1, 'b', 12, 0), row(2, 'a', 24, 0), row(2, 'b', 30, 1), row(3, 'a', 30, 1), row(3, 'b', 20, 0)];
  const mu = nbaMatchups(rows);
  assert.equal(rows[0].share, 36 / 48);
  assert.equal(rows[0].startLast, null);
  // (game 2: a started game 1, b didn't; game 3: the other way)
  assert.equal(rows[2].startLast, 1);
  assert.equal(rows[3].startLast, 0);
  assert.equal(rows[4].startLast, 0);
  assert.equal(rows[5].startLast, 1);
  // (a coming game: his start in the team's latest)
  assert.equal(mu.live('a', 't', 'o', 'G', 2026).startLast, 1);
  assert.equal(mu.live('b', 't', 'o', 'G', 2026).startLast, 0);
  // (a new season: none known)
  assert.equal(mu.live('a', 't', 'o', 'G', 2027).startLast, null);
});

test('nbaLines: the starter flag, threes tried, offensive and defensive rebounds, turnovers and fouls', () => {
  const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];
  const box = { statistics: [{ labels, athletes: [
    { athlete: { id: 1, displayName: 'A', position: { abbreviation: 'C' } }, starter: true, stats: ['30', '20', '8-15', '2-5', '2-2', '10', '3', '4', '1', '1', '3', '7', '5', '+4'] },
    { athlete: { id: 2, displayName: 'B', position: { abbreviation: 'G' } }, starter: false, stats: ['12', '4', '2-6', '0-3', '0-0', '1', '2', '1', '0', '0', '0', '1', '2', '-3'] },
    { athlete: { id: 3, displayName: 'C', position: { abbreviation: 'F' } }, didNotPlay: true, stats: [] },
  ] }] };
  const out = nbaLines(box);
  assert.deepEqual(out[0], ['1', 'A', 'C', 30, 20, 10, 3, 2, 15, 2, 1, 5, 3, 7, 4, 5]);
  assert.deepEqual(out[1], ['2', 'B', 'G', 12, 4, 1, 2, 0, 6, 0, 0, 3, 0, 1, 1, 2]);
  assert.equal(out.length, 2);
});

test("pickLines: the home side's margin (the spread is the home side's) and the total, DraftKings' first; none without", () => {
  const pc = (name, spread, overUnder) => ({ provider: { name }, spread, overUnder });
  assert.deepEqual(pickLines({ pickcenter: [pc('ESPN BET', -3, 220), pc('DraftKings', -5.5, 215.5)] }), [5.5, 215.5]);
  assert.deepEqual(pickLines({ pickcenter: [pc('ESPN BET', 4, 230)] }), [-4, 230]);
  assert.equal(pickLines({ pickcenter: [] }), null);
  assert.equal(pickLines({ pickcenter: [pc('DraftKings', null, 220)] }), null);
  assert.equal(pickLines({}), null);
});

test('CTX blowS, blowB: the spread either way per 10 by his role known before the game; newStart a bench player who started last', () => {
  const s = { roleKnown: 'S', mktSpread: -12 };
  const b = { roleKnown: 'B', mkt: [100, 110] };
  assert.equal(CTX.blowS(null, true, null, s), 1.2);
  assert.equal(CTX.blowB(null, true, null, s), 0);
  assert.equal(CTX.blowB(null, false, null, b), 1);
  assert.equal(CTX.blowS(null, false, null, b), 0);
  // (no lines, no role: 0)
  assert.equal(CTX.blowS(null, true, null, { roleKnown: 'S' }), 0);
  assert.equal(CTX.blowB(null, true, null, { mktSpread: 5 }), 0);
  assert.equal(CTX.newStart(null, true, null, { roleKnown: 'B', startLast: 1 }), 1);
  assert.equal(CTX.newStart(null, true, null, { roleKnown: 'S', startLast: 1 }), 0);
  assert.equal(CTX.newStart(null, true, null, { roleKnown: 'B', startLast: null }), 0);
});
