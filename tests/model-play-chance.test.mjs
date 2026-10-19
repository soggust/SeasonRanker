// A questionable player's chance of playing (libs/ranker/scripts/model/playchance.mjs): the table from past
// seasons' reports (each level pulled toward the one above it, a level unknown read at its parent), the levels
// kept on held-out seasons (the floor and the groups' bias), and the price reading it where a questionable
// teammate was counted at half (props.mjs priceProps missOf: the vacated work, rb1Out, qb1Out; the teammate's
// guard by the share's swing times the chance's spread); none, every one at half as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_FINAL, PLAY_LEVELS, PLAY_UNREAD, boardMissChance, choosePlayTable, fitPlayTable, missChance, playAt, playChanceSummary, playGone, playPos, playPractice, practiceFrom } from '../libs/ranker/scripts/model/playchance.mjs';
import { BOARD_K, PLAY_MISSING_MIN } from '../libs/ranker/scripts/model/board-miss.mjs';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

// (n reports of a kind, a share p of them played)
const reports = (n, p, x) => Array.from({ length: n }, (_, i) => ({ ...x, played: i < Math.round(n * p) ? 1 : 0 }));

test('the inputs: position groups, practice words, games missed', () => {
  assert.deepEqual(['QB', 'FB', 'WR', 'TE', 'CB', null].map(playPos), ['QB', 'RB', 'WR', 'TE', 'oth', 'oth']);
  assert.deepEqual(['Did Not Participate In Practice', 'Limited Participation in Practice', 'Full Participation in Practice', ''].map(playPractice), ['DNP', 'LP', 'FP', null]);
  assert.deepEqual([0, 1, 2, 5, null, undefined].map(playGone), ['0', '1', '2+', '2+', 'new', 'new']);
});

test('fitPlayTable: each level pulled toward its parent by K reports; a level unknown read at the one above', () => {
  const rows = [...reports(100, 0.8, { gone: 0, pos: 'WR', practice: 'FP' }), ...reports(100, 0.4, { gone: 0, pos: 'WR', practice: 'DNP' }), ...reports(20, 0.25, { gone: 1, pos: 'WR', practice: 'LP' })];
  const t = fitPlayTable(rows, ['gone', 'practice'], 25);
  const root = (80 + 40 + 5) / 220;
  const g0 = (120 + 25 * root) / (200 + 25);
  assert.ok(Math.abs(t.chance({ gone: 0, pos: 'WR' }) - g0) < 1e-9);
  assert.ok(Math.abs(t.chance({ gone: 0, pos: 'WR', practice: 'FP' }) - (80 + 25 * g0) / 125) < 1e-9);
  // (a cell never seen: its parent's)
  assert.ok(Math.abs(t.chance({ gone: 0, pos: 'WR', practice: 'LP' }) - g0) < 1e-9);
  // (a few reports pulled most of the way to the parent)
  const g1 = (5 + 25 * root) / 45;
  assert.ok(Math.abs(t.chance({ gone: 1, pos: 'WR' }) - g1) < 1e-9);
  assert.equal(fitPlayTable([], ['gone']), null);
});

test('choosePlayTable: a level with a steady difference kept on held-out seasons, a level with none left out; the table fit on every season', () => {
  const rows = [];
  for (let season = 2016; season <= 2025; season++) {
    // (played his last game: 75%; missed it: 45%; whatever the practice (none in it))
    for (const practice of ['DNP', 'LP', 'FP']) rows.push(...reports(60, 0.75, { season, gone: 0, pos: 'WR', practice }), ...reports(30, 0.45, { season, gone: 1, pos: 'RB', practice }));
  }
  const t = choosePlayTable(rows, { min: 100 });
  assert.deepEqual(t.levels, ['gone']);
  assert.deepEqual(t.check.held, [2023, 2024, 2025]);
  assert.ok(t.check.loss < t.check.flat);
  const tried = Object.fromEntries(t.check.tried.map((x) => [x.level, x]));
  assert.equal(tried.gone.kept, true);
  assert.equal(tried.practice.kept, false);
  assert.ok(Math.abs(t.chance({ gone: 0, pos: 'WR' }) - 0.75) < 0.01);
  assert.ok(Math.abs(t.chance({ gone: 1, pos: 'RB' }) - 0.45) < 0.03);
  // (too few reports: no table)
  assert.equal(choosePlayTable(rows.slice(0, 50)), null);
  // (the summary: by a quarterback or not and games missed)
  const s = playChanceSummary(t);
  assert.deepEqual(Object.keys(s.cells), ['QB 0', 'QB 1', 'QB 2+', 'QB new', 'other 0', 'other 1', 'other 2+', 'other new']);
  assert.equal(s.levels[0], 'gone');
});

test('missChance: 1 less the chance he plays; no table, half as before', () => {
  assert.equal(missChance(null, { pos: 'WR', gone: 0 }), 0.5);
  const t = fitPlayTable(reports(100, 0.7, { gone: 0, pos: 'WR' }), []);
  assert.equal(missChance(t, { pos: 'WR', gone: 0 }), 0.3);
});

test("goneOf: a player's team games missed in a row; null for one not yet played for it this season", () => {
  const g = (id, date, list) => list.map((pid) => ({ pid, name: pid, pos: 'WR', date, season: 2026, team: '1', opp: '2', game: id, home: true, s: { targets: 6, snaps: 40 } }));
  const m = nflMatchups([...g('g1', '2026-09-10', ['a', 'b']), ...g('g2', '2026-09-17', ['a']), ...g('g3', '2026-09-24', ['a'])]);
  assert.equal(m.goneOf('1', 2026, 'a'), 0);
  assert.equal(m.goneOf('1', 2026, 'b'), 2);
  assert.equal(m.goneOf('1', 2026, 'zz'), null);
});

test('priceProps: a questionable teammate missing by his chance (the play table), half without it; the guard by the swing times the chance spread', async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'recYds');
  const seen = [];
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => {
      seen.push(missOf('q'));
      // (his cut of the work left: 0.4 with the questionable one out, none with him in)
      return { vacs: [0.4 * missOf('q'), 0, 0], vac: 0.4 * missOf('q'), snap: { latest: 0.7, avg: 0.7, n: 3 } };
    },
    qb1: () => null,
    absent: () => new Map(),
    regulars: () => [{ id: 'q', v: 6 }],
    goneOf: (team, season, id) => (id === 'q' ? 0 : null),
  };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const fitted = { recYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', [[2026, 40], [2026, 45], [2026, 55], [2026, 60]]]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1, vc: 0.5, vs: 0 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: (id) => (id === 'q' ? 'WR' : 'WR'), name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'q']);
  rosterSet.out = new Map();
  const live = { injuries: new Map([['1', [{ id: 'q', name: 'Q Receiver', pos: 'WR', status: 'Questionable' }]]]), rosters: new Map([['1', rosterSet]]) };
  const props = [{ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 50.5, open: null, prices: { over: -110, under: -110 } }];
  // (without a table: the questionable one at half)
  seen.length = 0;
  const before = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1).priced[0];
  assert.equal(seen[0], 0.5);
  assert.equal(before.projection.qPlay, undefined);
  // (with one: played his last game, a receiver, 75% to play, so 25% missing)
  const play = fitPlayTable(reports(400, 0.75, { gone: 0, pos: 'WR' }), ['gone']);
  seen.length = 0;
  const after = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1, play).priced[0];
  assert.equal(seen[0], 0.25);
  assert.deepEqual(after.projection.qPlay, { 'Q Receiver': 0.75 });
  // (the guard: a swing of 0.4 at half is 0.4 (flagged, as before); at 25% missing, 0.4 * 2 sqrt(0.1875) = 0.35, still)
  assert.match(before.guard?.why ?? '', /teammate questionable/);
  assert.match(after.guard?.why ?? '', /teammate questionable/);
  // (a sure starter: 97% to play, the swing's spread 0.34 x 0.4 = 0.14, under the guard's 0.15)
  const sure = fitPlayTable(reports(2000, 0.97, { gone: 0, pos: 'WR' }), ['gone'], 1);
  const calm = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1, sure).priced[0];
  assert.doesNotMatch(calm.guard?.why ?? '', /teammate questionable/);
  // (another sport: half whatever the table)
  seen.length = 0;
  priceProps('nba', gameRow, props.map((p) => ({ ...p })), fitted, idx, { homePts: 110, awayPts: 105 }, null, live, {}, 0.1, play);
  assert.equal(seen[0], 0.5);
});

test("choosePlayTable: a side (the quarterbacks') not beating the flat half held out read at half; practice kept and read live (D45)", () => {
  const rows = [];
  for (let season = 2016; season <= 2025; season++) {
    // (the rest: 75% whatever the practice; quarterbacks: their share falling season by season, 80% to 20%)
    for (const practice of ['DNP', 'LP', 'FP']) rows.push(...reports(60, 0.75, { season, gone: 0, pos: 'WR', practice }));
    // (the quarterbacks with no practice status read: their falling share is the side's, not a practice cell's)
    rows.push(...reports(40, 0.8 - (season - 2016) * 0.067, { season, gone: 0, pos: 'QB', practice: null }));
    // (a practice that matters: a DNP plays a third of the time)
    rows.push(...reports(60, 0.33, { season, gone: 0, pos: 'TE', practice: 'DNP' }), ...reports(60, 0.9, { season, gone: 0, pos: 'TE', practice: 'FP' }));
  }
  const t = choosePlayTable(rows, { min: 100 });
  assert.deepEqual(t.half, ['QB']);
  assert.equal(t.check.sides.QB.half, true);
  assert.ok(t.check.sides.other.loss < t.check.flat);
  assert.equal(t.chance({ pos: 'QB', gone: 0 }), 0.5);
  assert.notEqual(t.chance({ pos: 'WR', gone: 0 }), 0.5);
  // (practice: a level read live since D45, kept on its held-out gain)
  const practice = t.check.tried.find((x) => x.level === 'practice');
  assert.equal(practice.unread, undefined);
  assert.equal(practice.kept, true);
  assert.ok(practice.gain > 0.003);
  assert.ok(t.levels.includes('practice'));
  assert.ok(t.chance({ pos: 'TE', gone: 0, practice: 'DNP' }) < t.chance({ pos: 'TE', gone: 0, practice: 'FP' }), 'a DNP plays less than an FP');
  assert.deepEqual(playChanceSummary(t).half, ['QB']);
});

test('playAt: the table only once the final report is out (PLAY_FINAL hours before the kickoff); missChance: a non-regular at half', () => {
  const t = fitPlayTable(reports(100, 0.7, { gone: 0, pos: 'WR' }), []);
  const kick = '2026-10-11T17:00:00Z';
  assert.equal(playAt(t, kick, Date.parse(kick) - (PLAY_FINAL + 1) * 36e5), null);
  assert.equal(playAt(t, kick, Date.parse(kick) - (PLAY_FINAL - 1) * 36e5), t);
  assert.equal(playAt(t, null, Date.parse(kick)), null);
  assert.equal(playAt(null, kick, Date.parse(kick)), null);
  assert.equal(missChance(t, { pos: 'WR', gone: 0, regular: false }), 0.5);
  assert.equal(missChance(t, { pos: 'WR', gone: 0, regular: true }), 0.3);
});

test("priceProps: the questionable guard over his position's regulars alone (a questionable linebacker moves none of his share)", async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'recYds');
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => ({ vacs: [0.4 * missOf('q'), 0, 0], vac: 0.4 * missOf('q'), snap: { latest: 0.7, avg: 0.7, n: 3 } }),
    qb1: () => null,
    absent: () => new Map(),
    regulars: (team, season, pos) => (pos === 'WR' ? [{ id: 'q', v: 6 }] : []),
    goneOf: (team, season, id) => (id === 'q' ? 0 : null),
  };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const fitted = { recYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', [[2026, 40], [2026, 45], [2026, 55], [2026, 60]]]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1, vc: 0.5, vs: 0 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: (id) => (id === 'lb' ? 'LB' : 'WR'), name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'q', 'lb']);
  rosterSet.out = new Map();
  const props = [{ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 50.5, open: null, prices: { over: -110, under: -110 } }];
  // (one who's played his last game 97% to play; one not yet played for the team (a linebacker reads so: not in
  // the work history) half)
  const sure = fitPlayTable([...reports(2000, 0.97, { gone: 0, pos: 'WR' }), ...reports(2000, 0.5, { gone: null, pos: 'WR' })], ['gone'], 1);
  const report = (list) => ({ injuries: new Map([['1', list]]), rosters: new Map([['1', rosterSet]]) });
  const q = { id: 'q', name: 'Q Receiver', pos: 'WR', status: 'Questionable' };
  const lb = { id: 'lb', name: 'L Backer', pos: 'LB', status: 'Questionable' };
  // (the sure receiver alone, and with a questionable linebacker beside him: calm both)
  for (const list of [[q], [q, lb]]) {
    const x = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, report(list), {}, 0.1, sure).priced[0];
    assert.doesNotMatch(x.guard?.why ?? '', /teammate questionable/);
  }
  // (the linebacker alone: no regular of his questionable, no flag)
  const alone = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, report([lb]), {}, 0.1, sure).priced[0];
  assert.doesNotMatch(alone.guard?.why ?? '', /teammate questionable/);
  // (the receiver not a regular (no work at the vacated threshold): half, and no flag (his work isn't the
  // vacated term's))
  const notReg = { ...fitted, recYds: { ...fitted.recYds, matchups: { ...matchups, regulars: () => [] } } };
  const seen = [];
  notReg.recYds.matchups.live = (pid, team, opp, pos, season, missOf) => (seen.push(missOf('q')), matchups.live(pid, team, opp, pos, season, missOf));
  priceProps('nfl', gameRow, props, notReg, idx, { homePts: 24, awayPts: 21 }, null, report([q]), {}, 0.1, sure);
  assert.equal(seen[0], 0.5);
  assert.equal(missChance(sure, { pos: 'LB', gone: null }), 0.5);
});

test("D45 the practice days read live: the week's rows by ESPN id, another week's and an unknown player's left out; the level is in PLAY_LEVELS and no longer unread", () => {
  assert.deepEqual(PLAY_LEVELS, ['qb', 'gone', 'practice']);
  assert.deepEqual(PLAY_UNREAD, []);
  const espnOf = new Map([['00-1', '123'], ['00-2', '456']]);
  const rows = [{ week: '7', gsis_id: '00-1', practice_status: 'Did Not Participate In Practice' }, { week: '6', gsis_id: '00-2', practice_status: 'Full Participation in Practice' }, { week: '7', gsis_id: '00-9', practice_status: 'Limited Participation in Practice' }, { week: '7', gsis_id: '00-2', practice_status: '' }];
  assert.deepEqual([...practiceFrom(rows, espnOf, 7)], [['123', 'DNP']]);
  assert.equal(practiceFrom(rows, espnOf, 6).get('456'), 'FP');
  assert.equal(practiceFrom(null, espnOf, 7).size, 0);
});

test('D45 the missing-prop signal: the rates by report status group, none without them; the constants', () => {
  const rates = { none: { missing: 0.28, listed: 0.08 }, q: { missing: 0.45, listed: 0.27 } };
  assert.equal(boardMissChance(rates, 'none'), 0.28);
  assert.equal(boardMissChance(rates, 'q'), 0.45);
  assert.equal(boardMissChance(rates, 'q', false), 0.27);
  assert.equal(boardMissChance(null, 'none'), null);
  assert.equal(boardMissChance({ none: {} }, 'none'), null);
  assert.equal(BOARD_K, 25);
  assert.equal(PLAY_MISSING_MIN, 2);
});

test("D45 priceProps: a regular with no prop on the board while two teammates at his position have one misses by the rate (not on the report: none's; questionable: q's); a guard's fixed view as it was; nothing without the rates", async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'recYds');
  const seen = [];
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => {
      seen.push({ m: missOf('m'), q: missOf('q'), b: missOf('b') });
      return { vacs: [0, 0, 0], vac: 0, snap: { latest: 0.7, avg: 0.7, n: 3 } };
    },
    qb1: () => null,
    absent: () => new Map(),
    regulars: () => [{ id: 'm', v: 6 }, { id: 'q', v: 5 }, { id: 'a', v: 7 }, { id: 'b', v: 4 }],
    goneOf: () => 0,
  };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const fitted = { recYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', [[2026, 40], [2026, 45], [2026, 55], [2026, 60]]]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'WR', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'b', 'm', 'q']);
  rosterSet.out = new Map();
  const rates = { none: { missing: 0.28, listed: 0.08 }, q: { missing: 0.45, listed: 0.27 } };
  const live = { injuries: new Map([['1', [{ id: 'q', name: 'Q Receiver', pos: 'WR', status: 'Questionable' }]]]), rosters: new Map([['1', rosterSet]]), boardMiss: rates };
  // (a and b listed at the position; m and q not)
  const props = ['a', 'b'].map((id) => ({ athlete: { id, name: id.toUpperCase(), team: '1' }, stat: st, line: 50.5, open: null, prices: { over: -110, under: -110 } }));
  const play = fitPlayTable(reports(400, 0.75, { gone: 0, pos: 'WR' }), ['gone']);
  seen.length = 0;
  priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1, play);
  assert.equal(seen[0].m, 0.28, 'not on the report, no prop: the none rate');
  assert.equal(seen[0].q, 0.45, "questionable with no prop: the q rate, not the table's 0.25");
  assert.equal(seen[0].b, 0, 'listed: as before');
  // (one listed teammate only: no signal; the questionable one reads the table)
  seen.length = 0;
  priceProps('nfl', gameRow, props.slice(0, 1), fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1, play);
  assert.equal(seen[0].m, 0);
  assert.equal(seen[0].q, 0.25);
  // (no rates: as before)
  seen.length = 0;
  priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, { ...live, boardMiss: null }, {}, 0.1, play);
  assert.equal(seen[0].m, 0);
  assert.equal(seen[0].q, 0.25);
});
