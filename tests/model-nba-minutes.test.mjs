// The NBA props' minutes first (libs/ranker/scripts/model/project.mjs, matchups.mjs, playerlogs.mjs, props.mjs): his
// per-minute rate times the minutes he's expected tonight (his season's typical, leaning to his last three games'
// by sr), the box score's starter flag and new columns, the finals' betting lines, and the blowout by role and
// the new starter (measured, off the ctx: CTX values only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, STATS, minutesBackOf, ROLE_SAFE } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel, WHOLE_TOL } from '../libs/ranker/scripts/model/project.mjs';
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

test("WHOLE_TOL (the whole stat's bias tolerance) holds the minutes base and the NBA's pace alone: every other whole-stat term no larger at all", () => {
  assert.deepEqual([...WHOLE_TOL], ['sn', 'po']);
});

test("early in a season: one short opener after a full last season, his minutes pulled toward last season's", () => {
  const stat = { key: 'pts', minutes: true };
  const prior = (d, pts, min, pid = 'p') => ({ ...g(d, pts, min, pid), season: 2025, date: `2025-01-${String(d).padStart(2, '0')}` });
  const proj = (params) => {
    const m = makeModel(stat, { ...BASE, ...params }, {});
    m.learn(Array.from({ length: 50 }, (_, i) => prior(1, 12, 24, `o${i}`)));
    for (let d = 1; d <= 28; d++) m.learn([prior(d, 25, 34)]);
    // (the opener: a blowout, 20 minutes)
    m.learn([g(1, 12, 20)]);
    return m.project({ pid: 'p', pos: 'G', season: 2026, date: day(3), opp: 'o' });
  };
  const off = proj({});
  const on = proj({ sn: 0.5, sr: 0.5 });
  assert.equal(on.mode, 'minutes');
  // (one game against MIN_RECENT of last season's 34: about 30.5 minutes, not 20)
  assert.ok(on.share * 48 > 29 && on.share * 48 < 32, `${on.share * 48}`);
  // (the projection within 3% of the per-game base's, not 18% under)
  assert.ok(on.rate > 0.97 * off.rate, `${on.rate} against ${off.rate}`);
});

test('early in a season with no last season: the per-game base till he has three games of his own', () => {
  const stat = { key: 'pts', minutes: true };
  const m = makeModel(stat, { ...BASE, sn: 0.5, sr: 0.5 }, {});
  m.learn(Array.from({ length: 50 }, (_, i) => g(1, 12, 24, `o${i}`)));
  m.learn([g(2, 6, 12), g(3, 6, 12)]);
  const row = { pid: 'p', pos: 'G', season: 2026, date: day(20), opp: 'o' };
  assert.equal(m.project(row).mode, null);
  m.learn([g(4, 6, 12)]);
  assert.equal(m.project(row).mode, 'minutes');
});

test("overtime: a game's minutes held to 48 in the minutes expected tonight, the per-minute rate taking them all", () => {
  const stat = { key: 'pts', minutes: true };
  const m = makeModel(stat, { ...BASE, sn: 1, sr: 1 }, {});
  m.learn(Array.from({ length: 50 }, (_, i) => g(1, 12, 24, `o${i}`)));
  m.learn([g(1, 20, 40), g(2, 20, 40), g(3, 26, 53), g(4, 26, 53), g(5, 26, 53)]);
  const p = m.project({ pid: 'p', pos: 'G', season: 2026, date: day(20), opp: 'o' });
  assert.ok(Math.abs(p.share * 48 - 48) < 1e-9, `${p.share * 48}`);
});

test("teammates back: the minutes lean's games with a starter out are in vacHist at the lean's weight", () => {
  const stat = { key: 'pts', minutes: true, vacated: true };
  const P = { ...BASE, w: 0.2, vc: 0.5, vs: 0 };
  const run = (params) => {
    const m = makeModel(stat, params, {});
    m.learn(Array.from({ length: 50 }, (_, i) => g(1, 12, 24, `o${i}`)));
    // (ten games at 18 minutes with everyone in, then three at 30 with a starter out (0.3 of the work missing))
    for (let d = 1; d <= 10; d++) m.learn([{ ...g(d, 9, 18), vacs: [0, 0, 0] }]);
    for (let d = 11; d <= 13; d++) m.learn([{ ...g(d, 15, 30), vacs: [0.3, 0.3, 0.3] }]);
    // (tonight he's back)
    return m.project({ pid: 'p', pos: 'G', season: 2026, date: day(20), opp: 'o', vacs: [0, 0, 0] });
  };
  const off = run({ ...P, sn: 0 });
  const on = run({ ...P, sn: 0.5, sr: 0.75 });
  assert.equal(on.mode, 'minutes');
  // (the lean on the last three: their 0.3 missing at 0.75 against the season's, so vacHist larger, vacF smaller)
  assert.ok(on.vacHist > off.vacHist + 0.02, `${on.vacHist} against ${off.vacHist}`);
  assert.ok(on.vacF < off.vacF, `${on.vacF} against ${off.vacF}`);
});

test("nbaMatchups startLast: a player who missed the team's game before didn't start it (0), a start weeks ago not read", () => {
  const row = (d, pid, min, start) => ({ pid, pos: 'G', season: 2026, date: day(d), team: 't', opp: 'o', game: `g${d}`, s: { min, pts: 10, ast: 1, fga: 8, fta: 2, start } });
  const rows = [row(1, 'a', 36, 1), row(1, 'b', 12, 0), row(2, 'b', 30, 1), row(3, 'a', 30, 0), row(3, 'b', 20, 1)];
  const mu = nbaMatchups(rows);
  // (a started game 1, missed game 2: game 3's read is 0, not game 1's start)
  assert.equal(rows[3].startLast, 0);
  assert.equal(rows[4].startLast, 1);
  assert.equal(mu.live('a', 't', 'o', 'G', 2026).startLast, 0);
  assert.equal(mu.live('c', 't', 'o', 'G', 2026).startLast, null);
});

test('minutesBackOf: a minutes jump with teammates back is a role CHECK on the over; anything short of it none', () => {
  const base = { name: 'X', mode: 'minutes', minutes: { season: 20, recent: 30 }, vac: 0, vacHist: 0.2 };
  const r = minutesBackOf(base);
  assert.equal(r.key, 'minutes-back');
  assert.equal(r.safe, 'under');
  assert.equal(ROLE_SAFE['minutes-back'], 'under');
  assert.equal(minutesBackOf({ ...base, vacHist: 0.1 }), null);
  assert.equal(minutesBackOf({ ...base, minutes: { season: 20, recent: 23 } }), null);
  assert.equal(minutesBackOf({ ...base, mode: null }), null);
  assert.equal(minutesBackOf({ ...base, minutes: null }), null);
});
