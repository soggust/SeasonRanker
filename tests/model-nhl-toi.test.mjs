// The NHL props' ice time first (audit #13; libs/ranker/scripts/model/matchups.mjs, project.mjs, props.mjs): a
// skater's time on ice over a full game's 60 (the minutes base's share), his power-play time's lean, his side's
// expected shots and the betting total (CTX values), and which stat keeps which.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, MIN_BACK, ROLE_SAFE, STATS, iceJumpOf, minutesBackOf } from '../libs/ranker/scripts/model/props.mjs';
import { WHOLE_TOL, fitCtxs, fullMin, makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { boxTotals, recordBox } from '../libs/ranker/scripts/model/playerlogs.mjs';
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

// (a team-game's power play: his minutes, four teammates' at 4 each and a fifth's (the man who takes his spot))
const ppGame = (d, mine, fifth = 0, scale = 1, season = 2026) =>
  [sk(d, 'a', 20, mine * scale), ...['b', 'c', 'd', 'e'].map((p) => sk(d, p, 18, 4 * scale)), sk(d, 'f', 15, fifth * scale)].map((r) => ({ ...r, season, date: `${season}-01-${String(d).padStart(2, '0')}T00:00Z`, game: `g${season}-${d}` }));
const mine = (rows) => rows.filter((r) => r.pid === 'a');

test("nhlMatchups ppLean: 0 before PP_LEAN_N games this season; a top unit's job lost reads under 0, the history's and live alike", () => {
  const rows = [];
  for (let d = 1; d <= 8; d++) rows.push(...ppGame(d, 4));
  for (let d = 9; d <= 12; d++) rows.push(...ppGame(d, 0.5, 3.5));
  nhlMatchups(rows);
  const a = mine(rows);
  // (before his fifth game: under 4 of his this season read, none)
  for (let i = 0; i < 4; i++) assert.equal(a[i].ppLean, 0, String(i));
  // (steady at his team's whole power play: even)
  assert.equal(a[8].ppLean, 0);
  // (then three games on the second unit: his recent share well under the season's)
  assert.ok(a[11].ppLean < -0.5, String(a[11].ppLean));
  const m = nhlMatchups(rows.map((r) => ({ ...r })));
  const live = m.live('a', '1', '2', 'F', 2026);
  assert.ok(live.ppLean < rows[11].ppLean, `${live.ppLean} after one more game down`);
  assert.equal(CTX.ppLean({}, true, null, live), live.ppLean);
  // (a new season: none till he has the games)
  assert.equal(m.live('a', '1', '2', 'F', 2027).ppLean, 0);
  assert.equal(CTX.ppLean({}, true, null, {}), 0);
});

test("nhlMatchups ppLean: his share of his team's power play, not his minutes (fewer power plays drawn lately aren't a job lost); this season's alone", () => {
  const rows = [];
  for (let d = 1; d <= 8; d++) rows.push(...ppGame(d, 4));
  // (his team drawing half the power plays for four games: his minutes halve, his share doesn't)
  for (let d = 9; d <= 12; d++) rows.push(...ppGame(d, 4, 0, 0.5));
  nhlMatchups(rows);
  assert.equal(mine(rows)[11].ppLean, 0);
  // (a new season: a second unit's man last season, the first unit's this one; his lean waits for this season's
  // games and reads them alone, not against last season's)
  const two = [];
  for (let d = 1; d <= 8; d++) two.push(...ppGame(d, 0.5, 3.5, 1, 2026));
  for (let d = 1; d <= 6; d++) two.push(...ppGame(d, 4, 0, 1, 2027));
  nhlMatchups(two);
  const b = mine(two).filter((r) => r.season === 2027);
  for (let i = 0; i < 4; i++) assert.equal(b[i].ppLean, 0, String(i));
  assert.equal(b[5].ppLean, 0);
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

test('the skaters as measured: shots ice time first (60) with the power-play lean; points the goalie and the expected shots (the power play by the other side’s penalties kept in its search)', () => {
  const sog = STATS.nhl.find((s) => s.key === 'sog');
  const pts = STATS.nhl.find((s) => s.key === 'pts');
  assert.equal(sog.minutes, 60);
  assert.equal(fullMin(sog), 60);
  assert.equal(pts.minutes, undefined);
  assert.equal(fullMin({ minutes: true }), 48);
  assert.deepEqual(sog.ctx, ['ppLean']);
  assert.deepEqual(pts.ctx, ['pp', 'oppGoalie', 'teamShots']);
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

test('iceJumpOf: the NHL ice-time base after a jump in his time on ice is a role CHECK on the over, teammates back or not; short of it none', () => {
  const base = { name: 'X', mode: 'minutes', minutes: { season: 15, recent: 19 } };
  const r = iceJumpOf(base);
  assert.equal(r.key, 'ice-jump');
  assert.equal(r.safe, 'under');
  assert.equal(ROLE_SAFE['ice-jump'], 'under');
  assert.match(r.why, /minutes on ice/);
  assert.equal(iceJumpOf({ ...base, minutes: { season: 15, recent: 15 * MIN_BACK.jump } }).key, 'ice-jump');
  assert.equal(iceJumpOf({ ...base, minutes: { season: 15, recent: 17.5 } }), null);
  assert.equal(iceJumpOf({ ...base, mode: null }), null);
  assert.equal(iceJumpOf({ ...base, minutes: null }), null);
  assert.equal(iceJumpOf({ ...base, minutes: { season: 0, recent: 10 } }), null);
  // (a fill-in's jump with a teammate back: minutesBackOf's work back is never reached on the NHL's time on ice
  // (at most 0.07 held out), so the jump alone flags him)
  assert.equal(minutesBackOf({ ...base, vac: 0, vacHist: 0.05 }), null);
  assert.equal(iceJumpOf(base).key, 'ice-jump');
});

test("fitCtxs: the market total's term searched only where the history has totals (env.totN), the rest as before", () => {
  assert.deepEqual(fitCtxs({ ctx: ['mTotal'] }, { totN: 0 }), []);
  assert.deepEqual(fitCtxs({ ctx: ['mTotal'] }, {}), []);
  assert.deepEqual(fitCtxs({ ctx: ['mTotal'] }, { totN: 5 }), ['c_mTotal']);
  assert.deepEqual(fitCtxs({ ctx: ['pp', 'teamShots', 'mTotal'] }, { totN: 0 }), ['c_pp', 'c_teamShots']);
  // (the skaters' late flags on the whole stat's one budget)
  for (const k of ['c_ppLean', 'c_teamShots', 'c_mTotal', 'sn']) assert.ok(WHOLE_TOL.has(k), k);
});

test("recordBox: an NHL final's total kept (t) from the summary's pickcenter, none without one; boxTotals reads it", () => {
  const line = (id, name) => ({ team: { id }, statistics: [{ name: 'forwards', labels: ['TOI', 'S', 'G', 'A', 'PPTOI'], athletes: [{ athlete: { id: `${name}1`, displayName: name }, stats: ['18:00', '3', '0', '1', '2:00'] }] }] });
  const body = (pc) => ({ boxscore: { players: [line('h', 'H'), line('a', 'A')] }, ...(pc ? { pickcenter: pc } : {}) });
  const g1 = { id: 'test-rv-nhl-1', home: 'h', away: 'a' };
  const g2 = { id: 'test-rv-nhl-2', home: 'h', away: 'a' };
  recordBox('nhl', g1, body([{ provider: { name: 'DraftKings' }, spread: 1.5, overUnder: 6.5 }]));
  recordBox('nhl', g2, body(null));
  const t = boxTotals('nhl');
  assert.equal(t.get('test-rv-nhl-1'), 6.5);
  assert.equal(t.has('test-rv-nhl-2'), false);
  // (a final with no box at all: nothing kept)
  recordBox('nhl', { id: 'test-rv-nhl-3', home: 'h', away: 'a' }, {});
  assert.equal(boxTotals('nhl').has('test-rv-nhl-3'), false);
});
