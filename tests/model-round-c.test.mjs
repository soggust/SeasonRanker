// Audit round C (libs/ranker/scripts/model/matchups.mjs batterTables, nflRoundC; props.mjs CTX): MLB's lineup
// strikeouts and on-base against a starter, the ballpark, plate appearances by slot, the air and home; the NFL's
// own line changed, its pass rate over expected, a back's late load and passing-down role, the last regular-season
// game. Each read from before the game (no look-ahead), 0 where its data is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX } from '../libs/ranker/scripts/model/props.mjs';
import { batterTables, mlbMatchups, nflMatchups, nflRoundC, paAt } from '../libs/ranker/scripts/model/matchups.mjs';

// (a batter's game row: pa, hits, total bases, strikeouts, walks)
const dayOf = (d) => new Date(Date.UTC(2025, 3, 1) + (d - 1) * 864e5).toISOString().slice(0, 10);
const bRow = (pid, d, { pa = 4, hits = 1, tb = 1, so = 1, bb = 0, game = `g${d}`, home = true, team = 'T', opp = 'O', slot = null } = {}) => ({
  pid: `mlb:${pid}`, pos: 'B', date: `${dayOf(d)}T23:00Z`, season: 2025, team, opp, game, home, start: slot ? true : null, slot, s: { pa, hits, tb, hr: 0, ...(so === null ? {} : { so, bb }) },
});

test('batterTables: a lineup of strikeout hitters reads over the league, a contact one under; none before the league has enough', () => {
  const t = batterTables();
  // (nothing learned: no lineup read)
  assert.deepEqual(t.lineupOf(['1', '2', '3', '4', '5', '6', '7', '8', '9'], 2025), {});
  // (18 batters over 40 days: 1-9 strike out half the time, 11-19 never)
  const day = [];
  for (let d = 1; d <= 40; d++) for (let i = 1; i <= 9; i++) day.push(bRow(i, d, { so: 2 }), bRow(10 + i, d, { so: 0, bb: 1 }));
  t.learn(day, () => null);
  const k = t.lineupOf(['1', '2', '3', '4', '5', '6', '7', '8', '9'], 2025, 'X');
  const c = t.lineupOf(['11', '12', '13', '14', '15', '16', '17', '18', '19'], 2025, 'X');
  assert.ok(k.lineupK > 0.3, `${k.lineupK}`);
  assert.ok(c.lineupK < -0.3, `${c.lineupK}`);
  // (the contact lineup walks more: its on-base over the league's)
  assert.ok(c.lineupOb > 0 && k.lineupOb < 0);
  // (no usual for the other side yet: lineupKd 0)
  assert.equal(k.lineupKd, 0);
  // (fewer than 7 batters read, or no order: none)
  assert.deepEqual(t.lineupOf(['1', '2', '3', '4', '5', '6', '97', '98', '99'], 2025), {});
  assert.deepEqual(t.lineupOf(null, 2025), {});
});

test("batterTables: a cache without strikeouts reads no lineup (fail safe)", () => {
  const t = batterTables();
  const day = [];
  for (let d = 1; d <= 40; d++) for (let i = 1; i <= 9; i++) day.push(bRow(i, d, { so: null }));
  t.learn(day, () => null);
  assert.deepEqual(t.lineupOf(['1', '2', '3', '4', '5', '6', '7', '8', '9'], 2025), {});
});

test("batterTables: a ballpark's hits over what its batters hit elsewhere; plate appearances by slot and home", () => {
  const t = batterTables();
  // (everyone hits 1 in 4 everywhere; at park P they hit 2 in 4)
  for (let d = 1; d <= 60; d++) {
    const rows = [];
    for (let i = 1; i <= 9; i++) rows.push(bRow(i, d, { hits: d % 2 ? 2 : 1, tb: d % 2 ? 2 : 1, game: d % 2 ? 'P' : 'Q', slot: i, home: !!(d % 2) }));
    t.learn(rows, (r) => r.game);
  }
  const atP = t.batterOf('mlb:1', 2025, 1, true, 'P');
  const atQ = t.batterOf('mlb:1', 2025, 1, true, 'Q');
  assert.ok(atP.parkH > 0.05 && atQ.parkH < 0, `${atP.parkH} ${atQ.parkH}`);
  assert.ok(atP.parkTB > 0);
  // (an unknown ballpark: no park value; no slot: no paX)
  assert.equal(t.batterOf('mlb:1', 2025, null, true, null).parkH, undefined);
  assert.equal(t.batterOf('mlb:1', 2025, null, true, null).paX, undefined);
  // (his 4 a game: leading off reads over a ninth's)
  assert.ok(t.batterOf('mlb:1', 2025, 1, false, null).paX > t.batterOf('mlb:1', 2025, 9, false, null).paX);
});

test('mlbMatchups: the starter reads the other side\'s posted order, learned from the games before it only', () => {
  const facts = { games: {}, hands: {}, pitchers: {} };
  const rows = [];
  for (let d = 1; d <= 50; d++) {
    const g = `g${d}`;
    facts.games[g] = { lo: [['1', '2', '3', '4', '5', '6', '7', '8', '9'], ['11', '12', '13', '14', '15', '16', '17', '18', '19']], v: 'V' };
    for (let i = 1; i <= 9; i++) rows.push({ ...bRow(i, d, { so: 2, game: g, slot: i }), start: undefined, slot: undefined }, { ...bRow(10 + i, d, { so: 0, game: g, home: false, team: 'O', opp: 'T', slot: i }), start: undefined, slot: undefined });
    rows.push({ pid: 'mlb:p', pos: 'SP', date: `${dayOf(d)}T23:00Z`, season: 2025, team: 'O', opp: 'T', game: g, home: false, s: { k: 6, outs: 18 } });
  }
  mlbMatchups(rows, facts);
  const sp = rows.filter((r) => r.pos === 'SP');
  // (the first day: nothing learned, none)
  assert.equal(sp[0].lineupK, undefined);
  // (later: the home side's strikeout lineup over the league's)
  assert.ok(sp[49].lineupK > 0.2, `${sp[49].lineupK}`);
  const b = rows.find((r) => r.pos === 'B' && r.game === 'g50' && r.pid === 'mlb:1');
  assert.ok(Number.isFinite(b.parkH) && Number.isFinite(b.paX));
});

test('CTX round C: MLB air and home, 0 without the report; the NFL line, PROE, a back by the script', () => {
  assert.equal(CTX.airTemp({ weather: { temp: 90, windOut: 5 } }), 2);
  assert.equal(CTX.windOutB({ weather: { temp: 90, windOut: 5 } }), 0.5);
  // (a closed roof, or the NFL's weather (no windOut): 0)
  assert.equal(CTX.airTemp({ roof: 'closed' }), 0);
  assert.equal(CTX.airTemp({ weather: { temp: 30, wind: 12 } }), 0);
  assert.equal(CTX.homeBat({}, true), 1);
  assert.equal(CTX.homeBat({}, false), -1);
  assert.equal(CTX.lineupK({}, true, null, { lineupK: 0.12 }), 0.12);
  assert.equal(CTX.lineupK({}, true, null, {}), 0);
  assert.equal(CTX.olOut({ more: { olChanged: [2, 0] } }, true), 2);
  assert.equal(CTX.olOut({ more: { olChanged: [2, 0] } }, false), 0);
  assert.equal(CTX.olOut({}, true), 0);
  assert.equal(CTX.proe({}, true, null, { proe: 0.05 }), 0.5);
  // (a passing back, his side a 7-point underdog (home, the home side's margin -7): over 0; the favorite under)
  assert.ok(Math.abs(CTX.rbPass({}, true, null, { rbRole: 0.1, mktSpread: -7 }) - 0.7) < 1e-9);
  assert.ok(CTX.rbPass({}, false, null, { rbRole: 0.1, mktSpread: -7 }) < 0);
  assert.equal(CTX.rbPass({}, true, null, { rbRole: 0.1 }), 0);
  assert.equal(CTX.lastGame({}, true, null, { lastGame: 1 }), 1);
});

test("nflRoundC: a team's pass rate over expected, a back's late load and role, the last regular-season game", () => {
  const t = nflRoundC();
  assert.deepEqual(t.of('rb', 'A', 2025, 'RB', 1), { proe: 0, rbLoad: 0, rbRole: 0, lastGame: 0 });
  for (let n = 1; n <= 14; n++) t.learn({ team: 'A', season: 2025, rows: [{ pid: 'rb', pos: 'RB', s: { rushAtt: 20, targets: 5 } }, { pid: 'rb2', pos: 'RB', s: { rushAtt: 20, targets: 0 } }] }, { over: 3, xn: 30 });
  const late = t.of('rb', 'A', 2025, 'RB', 15);
  assert.ok(late.proe > 0);
  assert.ok(Math.abs(late.rbLoad - 20 / 15) < 1e-3);
  assert.equal(t.of('rb', 'A', 2025, 'RB', 12).rbLoad, 0);
  assert.ok(late.rbRole > 0 && t.of('rb2', 'A', 2025, 'RB', 15).rbRole < 0);
  // (a wide receiver: no back's terms)
  assert.equal(t.of('wr', 'A', 2025, 'WR', 15).rbLoad, 0);
  assert.equal(t.of('rb', 'A', 2025, 'RB', 17).lastGame, 1);
  assert.equal(t.of('rb', 'A', 2020, 'RB', 16).lastGame, 1);
  assert.equal(t.of('rb', 'A', 2025, 'RB', 16).lastGame, 0);
  // (last season's pass rate at half; two seasons back none)
  assert.ok(t.of('x', 'A', 2026, 'QB', 1).proe < late.proe);
  assert.equal(t.of('x', 'A', 2027, 'QB', 1).proe, 0);
});

test('nflMatchups: the round C fields on each row, from the games before it', () => {
  const rows = [];
  for (let d = 1; d <= 6; d++) rows.push({ pid: 'rb', pos: 'RB', team: 'A', opp: 'B', game: `g${d}`, home: true, date: `2025-09-0${d}`, season: 2025, s: { rushAtt: 18, targets: 2 } });
  nflMatchups(rows);
  assert.equal(rows[0].rbRole, 0);
  assert.ok(Number.isFinite(rows[5].rbRole));
  assert.equal(rows[5].lastGame, 0);
  assert.ok(paAt(1) > paAt(9));
});

test('kept where the held-out games bore them out: lineupK on MLB strikeouts, lastGame on NFL passing yards and attempts; the rest on no stat', async () => {
  const { STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const { ctxKeys, ROUND_C } = await import('../libs/ranker/scripts/model/project.mjs');
  const on = Object.entries(STATS).flatMap(([sport, list]) => list.flatMap((st) => ctxKeys(st).filter((k) => ROUND_C.includes(`c_${k}`)).map((k) => `${sport} ${st.key} ${k}`)));
  assert.deepEqual(on, ['nfl passYds lastGame', 'nfl passAtt lastGame', 'mlb k lineupK']);
  // (the shrinkage tried again with them on MLB strikeouts and total bases: left out, the pull on hits alone)
  assert.ok(!STATS.mlb.find((s) => s.key === 'k').middle && !STATS.mlb.find((s) => s.key === 'tb').middle);
});
