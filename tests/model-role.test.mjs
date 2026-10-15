// The role-change fixes (libs/ranker/scripts/model): teammates on IR, PUP, NFI or suspended, and a regular gone
// from his team's last two games, counted missing at bet time as the history counts them (espn.mjs rosterOf,
// matchups.mjs absent); a missing regular's work kept, not faded, through his first games out, and the cut in a
// player's past games measured on the same work as the cut now (matchups.mjs vacPast, project.mjs), so a fill-in
// isn't marked down while the starter is still out; the role guard (props.mjs roleChangeOf: a CHECK either way,
// cause 'role'); a line with no price -110 can't be (unpricedWhy) skipped ahead of the gap; the CHECK's cause
// kept and tallied (checks.mjs), and its write-up the role's (writeup.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rosterOf } from '../libs/ranker/scripts/model/espn.mjs';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { impliedMean, lineChances, makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { ROLE, roleChangeOf, unpricedWhy } from '../libs/ranker/scripts/model/props.mjs';
import { CHECK_KINDS, checkOf, checkSummary, upsertCheck } from '../libs/ranker/scripts/model/checks.mjs';
import { factsOf, hashOf, plainOf, validate } from '../libs/ranker/scripts/model/writeup.mjs';

// (a team's game: [pid, pos, rushAtt, targets, passAtt, snaps])
const game = (id, date, list, season = 2026) =>
  list.map(([pid, pos, rushAtt = 0, targets = 0, passAtt = 0, snaps = 0]) => ({ pid, name: pid, pos, date, season, team: '1', opp: '2', game: id, home: true, s: { rushAtt, targets, passAtt, snaps } }));

test('rosterOf: injured reserve, suspended, PUP and NFI out; the rest on it; a short roster unread', () => {
  const a = (id, status = null, pos = 'RB') => ({ id, displayName: `P${id}`, position: { abbreviation: pos }, ...(status ? { injuries: [{ status }] } : {}) });
  const body = {
    athletes: [
      { position: 'offense', items: [a('1'), a('2', 'Questionable'), a('3', 'Physically Unable to Perform'), a('4', 'Non-Football Injury')] },
      { position: 'injuredReserveOrOut', items: [a('5', 'Injured Reserve'), a('6', 'Out')] },
      { position: 'suspended', items: [a('7')] },
      { position: 'practiceSquad', items: [a('8')] },
    ],
  };
  const r = rosterOf(body, 5);
  assert.deepEqual([...r].sort(), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual([...r.out.keys()].sort(), ['3', '4', '5', '6', '7']);
  assert.equal(r.out.get('5').status, 'Injured Reserve');
  assert.equal(r.out.get('7').status, 'Suspension');
  assert.equal(rosterOf(body, 40), null);
  // (the NBA's flat list: no groups, by status alone)
  assert.equal(rosterOf({ athletes: [a('9'), a('10', 'Out')] }, 1).out.size, 0);
});

test('a missing regular keeps his work through his first games out; the fill-in still gets his cut', () => {
  const rows = [];
  for (let d = 1; d <= 3; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['s', 'RB', 18, 3], ['b', 'RB', 4, 1], ['q', 'QB', 0, 0, 30]]));
  // (the starter out two games; the fill-in takes his carries)
  for (let d = 4; d <= 5; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['b', 'RB', 20, 3], ['q', 'QB', 0, 0, 30]]));
  const m = nflMatchups(rows);
  const now = m.live('b', '1', '2', 'RB', 2026, new Set(['s']));
  // (his cut with the starter out now as it was in the fill-in's first game without him: the starter's work
  // held, not faded; and his last two games, measured on today's work, the same cut)
  const first = rows.find((r) => r.pid === 'b' && r.game === 'a4');
  assert.ok(now.vac > 0.5, `vac now ${now.vac}`);
  assert.equal(now.vacPast.n, 5, JSON.stringify(now.vacPast));
  assert.ok(Math.abs(now.vacPast.sum[0] - 2 * now.vacs[0]) < 1e-3, `${now.vacPast.sum[0]} against ${now.vacs[0]}`);
  assert.ok(first.vac > 0);
  // (absent: the starter gone two games; the quarterback the team's first)
  assert.deepEqual([...m.absent('1', 2026).keys()], ['s']);
  assert.equal(m.qb1('1', 2026).id, 'q');
  // (after FREEZE games out, his work fades)
  for (let d = 6; d <= 9; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['b', 'RB', 20, 3], ['q', 'QB', 0, 0, 30]]));
  const later = nflMatchups(rows).live('b', '1', '2', 'RB', 2026, new Set(['s']));
  assert.ok(later.vac < now.vac, `${later.vac} < ${now.vac}`);
});

test("the fill-in isn't marked down while the starter's still out; he is when the starter's back", () => {
  const rows = [];
  for (let d = 1; d <= 4; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['s', 'RB', 18, 3], ['b', 'RB', 5, 1], ['c', 'RB', 2, 0]]));
  for (let d = 5; d <= 8; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['b', 'RB', 17, 3], ['c', 'RB', 4, 0]]));
  const m = nflMatchups(rows);
  const stat = { key: 'rushAtt', vacated: true };
  const model = makeModel(stat, { K: 4, w: 0.4, a: 0, b: 0, vc: 0.5, vs: 0, roleK: Infinity }, {});
  const sorted = rows.filter((r) => r.pos === 'RB').sort((a, b) => a.date.localeCompare(b.date));
  for (let d = 1; d <= 8; d++) model.learn(sorted.filter((r) => r.game === `a${d}`));
  const at = (missing) => ({ pid: 'b', pos: 'RB', season: 2026, date: '2026-09-10', opp: '2', ...m.live('b', '1', '2', 'RB', 2026, missing) });
  const out = model.project(at(new Set(['s'])));
  const back = model.project(at(new Set()));
  assert.ok(out.vacF >= 1, `starter still out: vacF ${out.vacF}`);
  assert.ok(back.vacF < 1, `starter back: vacF ${back.vacF}`);
});

test('snap shares: his last game against his season', () => {
  const rows = [];
  rows.push(...game('a1', '2026-09-01T17:00Z', [['q', 'QB', 0, 0, 30, 60], ['w', 'WR', 0, 2, 0, 18]]));
  rows.push(...game('a2', '2026-09-02T17:00Z', [['q', 'QB', 0, 0, 30, 60], ['w', 'WR', 0, 8, 0, 54]]));
  const snap = nflMatchups(rows).live('w', '1', '2', 'WR', 2026, null).snap;
  assert.deepEqual(snap, { latest: 0.9, avg: 0.6, n: 2, prev: 0.3 });
});

test("rb1Out: the team's lead back missing, for its quarterback and pass-catchers; a back's own 0; a committee's under LEAD_MIN none", () => {
  const rows = [];
  for (let d = 1; d <= 3; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['s', 'RB', 18, 3], ['b', 'RB', 4, 1], ['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]]));
  // (the lead back out of the fourth game: its rows read him missing, from before the game)
  rows.push(...game('a4', '2026-09-04T17:00Z', [['b', 'RB', 18, 3], ['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]]));
  const m = nflMatchups(rows);
  const at = (pid, g) => rows.find((r) => r.pid === pid && r.game === g).rb1Out;
  assert.deepEqual([at('q', 'a3'), at('w', 'a3'), at('q', 'a4'), at('w', 'a4'), at('b', 'a4')], [0, 0, 1, 1, 0]);
  // (a coming game: out, questionable at half, in; a back's own 0)
  assert.equal(m.live('q', '1', '2', 'QB', 2026, new Set(['s'])).rb1Out, 1);
  assert.equal(m.live('w', '1', '2', 'WR', 2026, (id) => (id === 's' ? 0.5 : 0)).rb1Out, 0.5);
  assert.equal(m.live('w', '1', '2', 'WR', 2026, null).rb1Out, 0);
  assert.equal(m.live('b', '1', '2', 'RB', 2026, new Set(['s'])).rb1Out, 0);
  // (a committee, no back with 8 touches a game: no lead back, nothing missing)
  const split = [];
  for (let d = 1; d <= 3; d++) split.push(...game(`c${d}`, `2026-09-0${d}T17:00Z`, [['x', 'RB', 5, 1], ['y', 'RB', 5, 1], ['q', 'QB', 0, 0, 30]]));
  assert.equal(nflMatchups(split).live('q', '1', '2', 'QB', 2026, new Set(['x'])).rb1Out, 0);
  // (back from his absence: the game he's in reads 0)
  const back = [...rows, ...game('a5', '2026-09-05T17:00Z', [['s', 'RB', 18, 3], ['b', 'RB', 4, 1], ['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]])];
  nflMatchups(back);
  assert.deepEqual([back.find((r) => r.pid === 'w' && r.game === 'a5').rb1Out, back.find((r) => r.pid === 'q' && r.game === 'a5').rb1Out], [0, 0]);
  // (last season's bell cow, gone: not this season's lead back, his absence nothing in its rows or a coming game)
  const gone = [];
  for (let d = 1; d <= 3; d++) gone.push(...game(`g${d}`, `2025-10-0${d}T17:00Z`, [['s', 'RB', 18, 3], ['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]], 2025));
  for (let d = 1; d <= 2; d++) gone.push(...game(`h${d}`, `2026-09-0${d}T17:00Z`, [['b', 'RB', 4, 1], ['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]]));
  const gm = nflMatchups(gone);
  assert.deepEqual(gone.filter((r) => r.season === 2026 && r.pid === 'w').map((r) => r.rb1Out), [0, 0]);
  assert.equal(gm.live('w', '1', '2', 'WR', 2026, new Set(['s'])).rb1Out, 0);
});

test("qb1Out: the team's lead quarterback missing, for its backs and pass-catchers; a quarterback's own 0; last season's gone, none", () => {
  const rows = [];
  for (let d = 1; d <= 3; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['q', 'QB', 0, 0, 34], ['k', 'QB', 0, 0, 2], ['s', 'RB', 18, 3], ['w', 'WR', 0, 7]]));
  // (the starter out of the fourth game: his backs' and receivers' rows read him missing, the backup's own 0)
  rows.push(...game('a4', '2026-09-04T17:00Z', [['k', 'QB', 0, 0, 33], ['s', 'RB', 18, 3], ['w', 'WR', 0, 7]]));
  const m = nflMatchups(rows);
  const at = (pid, g) => rows.find((r) => r.pid === pid && r.game === g).qb1Out;
  assert.deepEqual([at('w', 'a3'), at('s', 'a3'), at('w', 'a4'), at('s', 'a4'), at('k', 'a4')], [0, 0, 1, 1, 0]);
  // (a coming game: out, questionable at half, in, each times the share of his games this season the starter
  // played in (3 of 4: the fourth already the backup's); a quarterback's own 0)
  assert.equal(m.live('w', '1', '2', 'WR', 2026, new Set(['q'])).qb1Out, 0.75);
  assert.equal(m.live('s', '1', '2', 'RB', 2026, (id) => (id === 'q' ? 0.5 : 0)).qb1Out, 0.375);
  // (how surely he's missing kept apart (the write-up's words): out 1 though the term's value is 0.75)
  assert.equal(m.live('w', '1', '2', 'WR', 2026, new Set(['q'])).qb1Miss, 1);
  assert.equal(m.live('s', '1', '2', 'RB', 2026, (id) => (id === 'q' ? 0.5 : 0)).qb1Miss, 0.5);
  assert.equal(rows.find((r) => r.pid === 'w' && r.game === 'a4').qb1Miss, 1);
  assert.equal(m.live('w', '1', '2', 'WR', 2026, null).qb1Out, 0);
  assert.equal(m.live('k', '1', '2', 'QB', 2026, new Set(['q'])).qb1Out, 0);
  // (last season's starter, gone: not this season's lead, his absence nothing)
  const gone = [];
  for (let d = 1; d <= 3; d++) gone.push(...game(`g${d}`, `2025-10-0${d}T17:00Z`, [['q', 'QB', 0, 0, 34], ['w', 'WR', 0, 7]], 2025));
  for (let d = 1; d <= 2; d++) gone.push(...game(`h${d}`, `2026-09-0${d}T17:00Z`, [['k', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]]));
  const gm = nflMatchups(gone);
  assert.deepEqual(gone.filter((r) => r.season === 2026 && r.pid === 'w').map((r) => r.qb1Out), [0, 0]);
  assert.equal(gm.live('w', '1', '2', 'WR', 2026, new Set(['q'])).qb1Out, 0);
});

test("teamGame: the team's game number tonight, from 1 each season; the midseason flag on its 5th to 8th", async () => {
  const { CTX } = await import('../libs/ranker/scripts/model/props.mjs');
  const rows = [];
  for (let d = 1; d <= 2; d++) rows.push(...game(`p${d}`, `2025-10-0${d}T17:00Z`, [['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]], 2025));
  for (let d = 1; d <= 6; d++) rows.push(...game(`a${d}`, `2026-09-0${d}T17:00Z`, [['q', 'QB', 0, 0, 30], ['w', 'WR', 0, 7]]));
  const m = nflMatchups(rows);
  const w = rows.filter((r) => r.pid === 'w');
  assert.deepEqual(w.map((r) => r.teamGame), [1, 2, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(w.map((r) => CTX.midSeason({}, true, null, r)), [0, 0, 0, 0, 0, 0, 1, 1]);
  assert.equal(m.live('w', '1', '2', 'WR', 2026, null).teamGame, 7);
  assert.equal(CTX.midSeason({}, true, null, { teamGame: 9 }), 0);
  assert.equal(CTX.midSeason({}, true, null, {}), 0);
});

test("the role backtest's tables: by the team's game (its week where missing), by season, and the fit's qb1Out rows by the reports", async () => {
  const { weekTable, seasonTable, qb1FitTable } = await import('../libs/ranker/scripts/model/role-backtest.mjs');
  const it = (o) => ({ v: 10, mu: 8, base: 10, season: 2025, held: false, bucket: 'other', pos: 'WR', fitQb1Out: 0, qbListed: false, ...o });
  // (a bye in week 5: the team's 5th game is week 6, grouped as w5-8 by its game; the week only where no game)
  const items = [it({ week: 6, teamGame: 4 }), it({ week: 6, teamGame: 5, mu: 10 }), it({ week: 5, teamGame: null, mu: 5 })];
  const w = weekTable(items);
  assert.equal(w['w1-4'].all.n, 1);
  assert.equal(w['w5-8'].all.n, 2);
  assert.ok(Math.abs(w['w5-8'].all.bias - (20 / 15 - 1)) < 1e-9);
  assert.ok(Math.abs(w['w5-8'].all.factors - (15 / 20 - 1)) < 1e-9);
  assert.equal(w['w5-8'].all.overBase, 0);
  const s = seasonTable([it({ season: 2024 }), it({ season: 2025, held: true, mu: 12.5 })]);
  assert.deepEqual(Object.keys(s), ['2024', '2025']);
  assert.ok(Math.abs(s[2025].heldBias - (10 / 12.5 - 1)) < 1e-9);
  assert.equal(s[2024].heldBias, null);
  const q = qb1FitTable([it({ fitQb1Out: 1, qbListed: true, mu: 12.5 }), it({ fitQb1Out: 0.5, qbListed: false }), it({ fitQb1Out: 0 })]);
  assert.equal(q.listed.n, 1);
  assert.equal(q['not listed'].n, 1);
  assert.equal(q['not listed'].value, 0.5);
  assert.ok(Math.abs(q.listed.bias - (10 / 12.5 - 1)) < 1e-9);
});

test('roleChangeOf: a backup quarterback, the starter out, a regular out, a snap jump, a part-timer, a far line', () => {
  const base = { name: 'X', pos: 'WR', pid: 'x', qb1: { id: 'x', name: 'X', missing: 0 }, vacOut: 0, snap: { latest: 0.8, avg: 0.78, n: 4 }, mu: 50, implied: 50 };
  assert.equal(roleChangeOf(base), null);
  // (a backup starting for a starter who's out: his passing read from his starts, his rushing still a CHECK)
  assert.equal(roleChangeOf({ ...base, pos: 'QB', qb1: { id: 'y', name: 'Y', missing: 1 } }), null);
  assert.equal(roleChangeOf({ ...base, pos: 'QB', qb1: { id: 'y', name: 'Y', missing: 1 }, rushing: true }).key, 'backup-qb');
  assert.equal(roleChangeOf({ ...base, pos: 'QB', qb1: { id: 'y', name: 'Y', missing: 1 }, starts: 3 }).key, 'few-starts');
  assert.equal(roleChangeOf({ ...base, pos: 'QB', qb1: { id: 'y', name: 'Y', missing: 0 } }).key, 'backup-qb');
  assert.equal(roleChangeOf({ ...base, qb1: { id: 'y', name: 'Y', missing: 1 } }).key, 'qb1-out');
  assert.equal(roleChangeOf({ ...base, qb1: { id: 'y', name: 'Y', missing: 0 } }), null);
  assert.equal(roleChangeOf({ ...base, vacOut: ROLE.vac }).key, 'group-out');
  assert.equal(roleChangeOf({ ...base, snap: { latest: 0.9, avg: 0.75, n: 3 } }).key, 'snap-jump');
  assert.equal(roleChangeOf({ ...base, snap: { latest: 0.9, avg: 0.75, n: 1 } }), null);
  assert.equal(roleChangeOf({ ...base, snap: { latest: 0.4, avg: 0.4, n: 3 }, vacOut: 0.1 }).key, 'part-time');
  assert.equal(roleChangeOf({ ...base, snap: { latest: 0.4, avg: 0.4, n: 3 } }), null);
  assert.equal(roleChangeOf({ ...base, implied: 81 }).key, 'line');
  assert.equal(roleChangeOf({ ...base, implied: 29 }).key, 'line');
  assert.equal(roleChangeOf({ ...base, implied: 79 }), null);
  assert.match(roleChangeOf({ ...base, pos: 'QB', qb1: { id: 'y', name: 'Lamar Jackson', missing: 1 }, rushing: true }).why, /Lamar Jackson, out/);
});

test("impliedMean: the mean a line's price implies (an even price's, the line its median); unpricedWhy", () => {
  const params = { r: 4 };
  const m = impliedMean(45.5, 0.5, params);
  assert.ok(Math.abs(lineChances(45.5, m, params).over - 0.5) < 1e-6);
  assert.ok(impliedMean(45.5, 0.7, params) > m);
  // (a 0.5 line at even: the mean whose chance of 1 or more is a half)
  const z = impliedMean(0.5, 0.5, params);
  assert.ok(z > 0.5 && z < 1, String(z));
  assert.equal(impliedMean(45.5, null, params), null);
  assert.match(unpricedWhy(4.5, 0.2), /far from his usual/);
  assert.match(unpricedWhy(0.5, 0.5), /0\.5 line/);
  assert.equal(unpricedWhy(4.5, 0.5), null);
});

test("a role CHECK keeps its cause and sub-reason, tallied apart from the gap's; an older one's the gap's", () => {
  const bet = { id: 'g:prop:rushYds:1', start: '2030-01-01T18:00Z', placedAt: '2029-12-31T12:00Z', market: 'prop', propType: 'rushYds', side: 'under', line: 40.5, odds: -110, model: 0.6, fair: 0.5, units: 1, intent: 'action' };
  const role = checkOf(bet, { skip: true, kind: 'role', role: 'group-out', why: 'a regular at his position out' });
  assert.equal(role.cause, 'role');
  assert.equal(role.roleReason, 'group-out');
  assert.equal(role.units, 0);
  const gap = checkOf({ ...bet, id: 'g2' }, { skip: true, kind: 'gap', why: 'too far' });
  assert.equal(gap.cause, 'gap');
  assert.equal(gap.roleReason, undefined);
  assert.ok(CHECK_KINDS.has('role') && CHECK_KINDS.has('gap') && !CHECK_KINDS.has('unpriced'));
  // (the gap's a shadow now (checks.mjs shadowOf), the role's at a model Kelly of +16 shown: an older shown gap
  // CHECK, without the shadow's marks, tallied as the gap's)
  assert.deepEqual([gap.hidden, gap.passAs, role.hidden], [true, 'gap', undefined]);
  const { hidden: _h, passAs: _p, passWhy: _w, ...older } = gap;
  const s = checkSummary([role, gap, { ...older, id: 'old', cause: undefined }]);
  assert.equal(s.byCause.role.n, 1);
  assert.equal(s.byCause.gap.n, 1);
  assert.equal(s.byPassAs.gap.n, 1);
  assert.equal(s.byRole['group-out'].n, 1);
  // (a gap CHECK that becomes a role's is written again, shown)
  const ledger = { checks: [] };
  const now = new Date('2029-12-31T13:00Z');
  assert.equal(upsertCheck(ledger, gap, now), 'new');
  assert.equal(upsertCheck(ledger, checkOf({ ...bet, id: 'g2' }, { skip: true, kind: 'role', role: 'snap-jump', why: 'his snaps jumped' }), now), 'updated');
  assert.deepEqual([ledger.checks[0].cause, ledger.checks[0].hidden], ['role', undefined]);
});

test("a role CHECK's write-up: the role it's kept for, its question and risk, passing the validator; its hash the role's", () => {
  const SAMPLES = JSON.parse(fs.readFileSync(new URL('./support/writeup-samples.json', import.meta.url), 'utf8'));
  const { bet, sib, game: g } = SAMPLES.find((s) => s.bet.id.startsWith('401872990'));
  const check = { ...bet, intent: 'check', units: 0, cause: 'role', roleReason: 'group-out', reason: 'a regular at his position out, the work he leaves 45% of his own: a bigger role' };
  const sheet = factsOf(check, { game: g, sib });
  const { reason, risk } = plainOf(sheet);
  assert.match(reason, /Not bet on this side: a regular at his position is out/);
  assert.match(reason, /The question: how much of the work is his now/);
  assert.match(risk, /^A big Kelly on the model's own number isn't value by itself/);
  assert.deepEqual(validate(`${reason} ${risk}`, sheet), []);
  // (the hash: a role CHECK's differs from the same pick's gap CHECK; a bet's as it was)
  const asGap = { ...check, cause: 'gap', roleReason: undefined };
  assert.notEqual(hashOf(check, sib), hashOf(asGap, sib));
  assert.equal(hashOf(asGap, sib), hashOf({ ...asGap, cause: undefined }, sib));
});

test('priceProps: a teammate on IR missing; a role change a CHECK either side, ahead of the gap; an unpriced line skipped as unpriced', async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  const seen = [];
  // (a stub fit: every projection 50 yards; the matchups say who's missing as they're asked)
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => {
      seen.push(missOf('ir'), missOf('gone2'), missOf('here'));
      return { vacs: [pid === 'b' && missOf('ir') === 1 ? 0.6 : 0, 0, 0], vac: 0, snap: { latest: 0.7, avg: 0.7, n: 3 } };
    },
    qb1: () => ({ id: 'q', v: 30 }),
    absent: () => new Map([['gone2', { gone: 2, pos: 'RB' }]]),
    regulars: () => [{ id: 'ir', v: 15 }],
  };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', [[2026, 40], [2026, 45], [2026, 55], [2026, 60]]], ['b', [[2026, 40], [2026, 45], [2026, 55], [2026, 60]]], ['c', [[2026, 40], [2026, 45], [2026, 55], [2026, 60]]]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'b', 'c', 'ir', 'gone2', 'here', 'q']);
  rosterSet.out = new Map([['ir', { name: 'Hurt Back', pos: 'RB', status: 'Injured Reserve' }]]);
  const live = { injuries: new Map([['1', []]]), rosters: new Map([['1', rosterSet]]) };
  const props = [
    // (a: no role change, an even line near his usual (above his projection, so its under isn't the skew's alone); b: a regular at his position on IR, a big cut; c: a line
    // far from his usual with no price)
    { athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 50.5, open: null, prices: { over: -110, under: -110 } },
    { athlete: { id: 'b', name: 'B', team: '1' }, stat: st, line: 49.5, open: null, prices: { over: -110, under: -110 } },
    { athlete: { id: 'c', name: 'C', team: '1' }, stat: st, line: 70.5, open: null, prices: null },
  ];
  const { priced } = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1);
  // (the IR'd teammate and the one gone two games, off the report, missing; the one here not)
  assert.deepEqual(seen.slice(0, 3), [1, 1, 0]);
  const by = Object.fromEntries(priced.map((x) => [x.prop.athlete.id, x]));
  assert.equal(by.a.guard?.kind, undefined);
  assert.equal(by.b.guard.kind, 'role');
  assert.equal(by.b.guard.role, 'group-out');
  assert.ok(by.b.projection.out.includes('Hurt Back'));
  assert.equal(by.c.guard.kind, 'unpriced');
});

test("absent: his games out counted from a new season's first; one gone the last two games of the last isn't absent in week 1", () => {
  const rows = [];
  for (let d = 1; d <= 3; d++) rows.push(...game(`a${d}`, `2025-12-0${d}T17:00Z`, [['s', 'RB', 18, 3], ['b', 'RB', 4, 1]], 2025));
  for (let d = 4; d <= 5; d++) rows.push(...game(`a${d}`, `2025-12-0${d}T17:00Z`, [['b', 'RB', 20, 3]], 2025));
  const m = nflMatchups(rows);
  assert.deepEqual([...m.absent('1', 2025).keys()], ['s']);
  assert.deepEqual([...m.absent('1', 2026).keys()], []);
});

test('roleChangeOf: a change at quarterback (the starter of late off the board, another on it), the quarterback and his receivers', () => {
  const base = { name: 'X', pos: 'WR', pid: 'x', qb1: { id: 'y', name: 'Y', missing: 0 }, vacOut: 0, snap: { latest: 0.8, avg: 0.78, n: 4 }, mu: 50, implied: 50 };
  assert.equal(roleChangeOf({ ...base, boardQbs: new Set(['z']) }).key, 'qb-change');
  const qb = roleChangeOf({ ...base, name: 'Z', pos: 'QB', pid: 'z', boardQbs: new Set(['z']) });
  assert.equal(qb.key, 'qb-change');
  assert.match(qb.why, /a change at quarterback/);
  // (the starter on the board too: his backup's a backup, the receivers as they were; the starter out, as before)
  assert.equal(roleChangeOf({ ...base, name: 'Z', pos: 'QB', pid: 'z', boardQbs: new Set(['y', 'z']) }).key, 'backup-qb');
  assert.equal(roleChangeOf({ ...base, boardQbs: new Set(['y', 'z']) }), null);
  assert.equal(roleChangeOf({ ...base, boardQbs: new Set() }), null);
  assert.equal(roleChangeOf({ ...base, qb1: { id: 'y', name: 'Y', missing: 1 }, boardQbs: new Set(['z']) }).key, 'qb1-out');
});

test("priceProps: an absent regular with his own prop on the board isn't missing; the report's questionable over the roster's IR; one who's left not named; a role CHECK only at a price that can be known", async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  const seen = new Map();
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => {
      if (!seen.has(pid)) seen.set(pid, { back: missOf('back'), irq: missOf('irq'), left: missOf('left') });
      return { vacs: [pid === 'u' ? 0.6 : 0, 0, 0], vac: 0, snap: { latest: 0.7, avg: 0.7, n: 3 } };
    },
    qb1: () => ({ id: 'q', v: 30 }),
    absent: () => new Map([['back', { gone: 3, pos: 'RB' }], ['left', { gone: 2, pos: 'RB' }]]),
    regulars: () => [{ id: 'irq', v: 15 }],
  };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const usual = [[2026, 40], [2026, 45], [2026, 55], [2026, 60]];
  const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map(['a', 'back', 'u'].map((id) => [id, usual])), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'back', 'u', 'irq', 'q']);
  rosterSet.out = new Map([['irq', { name: 'Due Back', pos: 'RB', status: 'Injured Reserve' }]]);
  const live = { injuries: new Map([['1', [{ id: 'irq', name: 'Due Back', pos: 'RB', status: 'Questionable' }]]]), rosters: new Map([['1', rosterSet]]) };
  const props = [
    // (a: a teammate; back: absent three games, activated with no designation, his own prop posted; u: a big
    // cut and no price at a line -110 can't be)
    { athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 49.5, open: null, prices: { over: -110, under: -110 } },
    { athlete: { id: 'back', name: 'Back', team: '1' }, stat: st, line: 49.5, open: null, prices: { over: -110, under: -110 } },
    { athlete: { id: 'u', name: 'U', team: '1' }, stat: st, line: 70.5, open: null, prices: null },
  ];
  const { priced } = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1);
  assert.deepEqual(seen.get('a'), { back: 0, irq: 0.5, left: 1 });
  const by = Object.fromEntries(priced.map((x) => [x.prop.athlete.id, x]));
  // (neither the one back nor the one who's left named out; the questionable one named questionable, not out)
  assert.equal(by.a.projection.out, undefined);
  assert.deepEqual(by.a.projection.questionable, ['Due Back']);
  // (a role change on a line with no price -110 can be: skipped with both words, no CHECK)
  assert.equal(by.u.guard.kind, undefined);
  assert.equal(by.u.guard.skip, true);
  assert.match(by.u.guard.why, /a regular at his position out.*; no price/);
});

test('typicalShares: a game cut short (under half his median) left out of the share expected tonight; two in a row a role cut, kept', async () => {
  const { typicalShares } = await import('../libs/ranker/scripts/model/project.mjs');
  assert.deepEqual(typicalShares([0.95, 0.97, 0.119]), [0.95, 0.97]);
  assert.deepEqual(typicalShares([0.9, 0.2, 0.15]), [0.9, 0.2, 0.15]);
  assert.deepEqual(typicalShares([0.3, 0.35, 0.8]), [0.3, 0.35, 0.8]);
  assert.deepEqual(typicalShares([0.7, 0.1]), [0.7, 0.1]);
});

test('roleChangeOf: each reason names its safe side (the model\'s known error there makes it conservative)', async () => {
  const { roleChangeOf, ROLE, ROLE_SAFE } = await import('../libs/ranker/scripts/model/props.mjs');
  assert.equal(ROLE_SAFE['group-out'], 'over');
  assert.equal(ROLE_SAFE['qb1-out'], 'under');
  assert.equal(ROLE_SAFE['qb-change'], null);
  const qb = { name: 'X', pos: 'QB', pid: 'x', qb1: { id: 'x', name: 'X', missing: 0 } };
  assert.equal(roleChangeOf({ ...qb, starts: 2, rushing: true }).safe, 'over');
  assert.equal(roleChangeOf({ ...qb, starts: 2 }).safe, 'under');
  const wr = { name: 'W', pos: 'WR', pid: 'w', qb1: { id: 'q', name: 'Q', missing: 0 }, mu: 50 };
  assert.equal(roleChangeOf({ ...wr, implied: 50 * ROLE.ratioHi + 1 }).safe, 'over');
  assert.equal(roleChangeOf({ ...wr, implied: 50 * ROLE.ratioLo - 1 }).safe, 'under');
});
