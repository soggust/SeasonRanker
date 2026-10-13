// The NHL props' ice time first (audit #13; libs/ranker/scripts/model/matchups.mjs, project.mjs, props.mjs): a
// skater's time on ice over a full game's 60 (the minutes base's share), his power-play time's lean, his side's
// expected shots and the betting total (CTX values), and which stat keeps which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, STATS } from '../libs/ranker/scripts/model/props.mjs';
import { fullMin, makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { nhlMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

const day = (d) => `2026-01-${String(d).padStart(2, '0')}`;
const sk = (d, pid, toi, pptoi, sog = 2, pos = 'F') => ({ pid, pos, date: `${day(d)}T00:00Z`, season: 2026, team: '1', opp: '2', game: `g${d}`, home: true, s: { toi, sog, pts: 0, goals: 0, pptoi } });

test("nhlMatchups: a skater's time on ice over 60 the game's own share (learned after it); a goalie none", () => {
  const rows = [sk(1, 'a', 18, 2), sk(1, 'b', 30, 0, 0, 'D'), { ...sk(1, 'g', 60, 0, 0, 'G'), s: { toi: 60, saves: 30 } }];
  nhlMatchups(rows);
  assert.equal(rows[0].share, 18 / 60);
  assert.equal(rows[1].share, 0.5);
  assert.equal(rows[2].share, null);
});

test("nhlMatchups ppLean: 0 before PP_LEAN_N games this season; a top unit's job lost reads under 0, the history's and live alike", () => {
  const rows = [];
  for (let d = 1; d <= 8; d++) rows.push(sk(d, 'a', 20, 4));
  for (let d = 9; d <= 12; d++) rows.push(sk(d, 'a', 17, 0.5));
  nhlMatchups(rows);
  // (before his fifth game: under 4 of his this season read, none)
  for (let i = 0; i < 4; i++) assert.equal(rows[i].ppLean, 0, String(i));
  // (steady at 4 minutes: even)
  assert.equal(rows[8].ppLean, 0);
  // (then three games on the second unit: his recent minutes well under the season's)
  assert.ok(rows[11].ppLean < -0.5, String(rows[11].ppLean));
  const m = nhlMatchups(rows.map((r) => ({ ...r })));
  const live = m.live('a', '1', '2', 'F', 2026);
  assert.ok(live.ppLean < rows[11].ppLean, `${live.ppLean} after one more game down`);
  assert.equal(CTX.ppLean({}, true, null, live), live.ppLean);
  // (a new season: none till he has the games)
  assert.equal(m.live('a', '1', '2', 'F', 2027).ppLean, 0);
  assert.equal(CTX.ppLean({}, true, null, {}), 0);
});

test("CTX teamShots reads his own side's expected shots (the saves' oppShots the other side's); mTotal the total over 6; 0 without", () => {
  const info = { more: { shots: [33, 27], shotsAvg: 30 } };
  assert.ok(Math.abs(CTX.teamShots(info, true) - Math.log(33 / 30)) < 1e-12);
  assert.ok(Math.abs(CTX.teamShots(info, false) - Math.log(27 / 30)) < 1e-12);
  assert.equal(CTX.teamShots(info, true), CTX.oppShots(info, false));
  assert.equal(CTX.teamShots({}, true), 0);
  assert.equal(CTX.teamShots(null, true), 0);
  assert.ok(Math.abs(CTX.mTotal(null, true, null, { mTotal: 6.5 }) - Math.log(6.5 / 6)) < 1e-12);
  assert.equal(CTX.mTotal(null, true, null, { mTotal: null }), 0);
});

test('the skaters as measured: shots ice time first (60) with the power-play lean; points the goalie and the expected shots', () => {
  const sog = STATS.nhl.find((s) => s.key === 'sog');
  const pts = STATS.nhl.find((s) => s.key === 'pts');
  assert.equal(sog.minutes, 60);
  assert.equal(fullMin(sog), 60);
  assert.equal(pts.minutes, undefined);
  assert.equal(fullMin({ minutes: true }), 48);
  assert.deepEqual(sog.ctx, ['ppLean']);
  assert.deepEqual(pts.ctx, ['oppGoalie', 'teamShots']);
});

test("ice time first: a skater's per-minute rate times his expected time on ice, the minutes read on a 60-minute game", () => {
  const stat = { key: 'sog', minutes: 60 };
  const BASE = { K: 2, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };
  const g = (d, sog, toi, pid = 'p') => ({ pid, pos: 'F', season: 2026, date: day(d), opp: 'o', s: { sog, toi }, share: toi / 60 });
  const plain = makeModel(stat, BASE, {});
  const toi = makeModel(stat, { ...BASE, sn: 1, sr: 1 }, {});
  // (the pool: other forwards at 0.15 shots a minute; then his six games at 12 minutes for 2 shots, three at 20 for 3)
  const others = Array.from({ length: 80 }, (_, i) => g(1, 3, 20, `o${i}`));
  const games = [...[2, 3, 4, 5, 6, 7].map((d) => g(d, 2, 12)), ...[8, 9, 10].map((d) => g(d, 3, 20))];
  for (const m of [plain, toi]) m.learn(others), m.learn(games);
  const row = { pid: 'p', pos: 'F', season: 2026, date: day(20), opp: 'o' };
  const a = plain.project(row);
  const b = toi.project(row);
  assert.equal(b.mode, 'minutes');
  assert.ok(Math.abs(b.share * 60 - 20) < 1e-9, `${b.share * 60}`);
  assert.ok(Math.abs(b.minutes.recent - 20) < 1e-9, `${b.minutes.recent}`);
  // (his promotion to 20 minutes read: over the per-game rate, which still averages the 12-minute games)
  assert.ok(b.rate > a.rate + 0.3, `${b.rate} against ${a.rate}`);
});
