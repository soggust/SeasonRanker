// The posted game-day rosters (audit #8): espn.mjs gameRosterOf (the NFL's inactives, the NBA's inactives and
// starting five, as ESPN's core API marks them), timing.mjs lineupNow / putInactives / lineupSurprise (into the
// game's own injury report, the regulars only where the report doesn't list them), the inputs' ina and st parts
// (a bet priced again on them, not on a healthy scratch; a game line's not on ina or st), and props.mjs
// lineupRoleOf (the NBA's role CHECK). No network: the facts are made up, shaped like 2026-10-11's GB at CHI final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameRosterOf } from '../libs/ranker/scripts/model/espn.mjs';
import { inputChanges, inputsOf, lineupNow, lineupSurprise, putInactives, usualStarters } from '../libs/ranker/scripts/model/timing.mjs';
import { lineupRoleOf, outOf, ROLE_SAFE } from '../libs/ranker/scripts/model/props.mjs';

const game = { id: 'g1', home: '1', away: '2', homeAbbr: 'HOM', awayAbbr: 'AWY', date: '2026-10-18T17:00Z', season: 2026 };
const entry = (id, x = {}) => ({ playerId: Number(id), displayName: `P${id}`, active: false, starter: false, didNotPlay: false, valid: true, ...x });
const nflBody = (inactive = []) => ({ entries: Array.from({ length: 53 }, (_, i) => entry(100 + i, { didNotPlay: inactive.includes(String(100 + i)) })) });

test('gameRosterOf: the NFL posted only with 40 players or more and an inactive among them', () => {
  assert.equal(gameRosterOf(null, 'nfl'), null);
  // (a 404 before it's made: get gives null)
  assert.equal(gameRosterOf({ error: { code: 404 } }, 'nfl'), null);
  // (a list with no inactive marked: not posted yet)
  assert.equal(gameRosterOf(nflBody([]), 'nfl'), null);
  // (cut short)
  assert.equal(gameRosterOf({ entries: [entry(1, { didNotPlay: true })] }, 'nfl'), null);
  const r = gameRosterOf(nflBody(['101', '120']), 'nfl');
  assert.deepEqual(r.inactive.map((x) => x.id), ['101', '120']);
  assert.equal(r.starters, null);
});

test('gameRosterOf: a count no posting could have (every entry didNotPlay, as a pre-game flag defaulted on might read) is not posted', () => {
  const all = nflBody(Array.from({ length: 53 }, (_, i) => String(100 + i)));
  assert.equal(gameRosterOf(all, 'nfl'), null);
  assert.equal(gameRosterOf(nflBody(Array.from({ length: 13 }, (_, i) => String(100 + i))), 'nfl'), null);
  assert.equal(gameRosterOf(nflBody(Array.from({ length: 12 }, (_, i) => String(100 + i))), 'nfl').inactive.length, 12);
  // (the NBA's: more than 8, or half the list; the five still read)
  const nba = { entries: Array.from({ length: 15 }, (_, i) => entry(200 + i, { didNotPlay: true, starter: i < 5 })) };
  const r = gameRosterOf(nba, 'nba');
  assert.deepEqual(r.inactive, []);
  assert.equal(r.starters.length, 5);
  assert.equal(gameRosterOf({ entries: Array.from({ length: 15 }, (_, i) => entry(200 + i, { didNotPlay: true })) }, 'nba'), null);
  assert.equal(gameRosterOf({ entries: Array.from({ length: 15 }, (_, i) => entry(200 + i, { didNotPlay: i < 3 })) }, 'nba').inactive.length, 3);
});

test('gameRosterOf: the NBA\'s starting five read only at exactly five; bare entries (hours before the tip) not posted', () => {
  const bare = { entries: Array.from({ length: 15 }, (_, i) => ({ playerId: 200 + i })) };
  assert.equal(gameRosterOf(bare, 'nba'), null);
  const five = { entries: Array.from({ length: 15 }, (_, i) => entry(200 + i, { starter: i < 5 })) };
  assert.deepEqual(gameRosterOf(five, 'nba').starters, ['200', '201', '202', '203', '204']);
  const six = { entries: Array.from({ length: 15 }, (_, i) => entry(200 + i, { starter: i < 6 })) };
  assert.equal(gameRosterOf(six, 'nba'), null);
});

// (four team games, newest last: a regular works in two of the last four)
const rowsOf = (team, pid, works, extra = {}) => works.map((w, i) => ({ pid, name: `N${pid}`, pos: extra.pos ?? 'WR', team, season: 2026, game: `${team}-${i}`, date: `2026-09-${10 + i * 7}T17:00Z`, s: { snaps: w ? 40 : 2, targets: w ? 5 : 0, ...(extra.s?.(i) ?? {}) } }));

test('lineupNow: a regular has work in two of his team\'s last four games; the NBA\'s usual starter started half', () => {
  const rows = [...rowsOf('1', '101', [1, 1, 0, 0]), ...rowsOf('1', '102', [0, 0, 0, 1]), ...rowsOf('1', '103', [0, 0, 1, 1])];
  const p = lineupNow(rows, 'nfl');
  assert.equal(p.get('101').regular, true);
  assert.equal(p.get('101').season, 2026);
  assert.equal(p.get('101').teamGames, 4);
  assert.equal(p.get('102').regular, false);
  assert.equal(p.get('103').regular, true);
  assert.equal(p.get('103').team, '1');
  assert.equal(lineupNow(rows, 'mlb'), null);
  assert.equal(lineupNow([], 'nfl'), null);
  const nba = [0, 1, 2, 3].map((i) => ({ pid: '9', name: 'N9', pos: 'G', team: '1', season: 2027, game: `n${i}`, date: `2026-11-0${i + 1}`, s: { min: 30, start: i >= 2 ? 1 : 0 } }));
  assert.equal(lineupNow(nba, 'nba').get('9').starter, true);
  assert.equal(lineupNow(nba.map((r, i) => ({ ...r, s: { ...r.s, start: i === 3 ? 1 : 0 } })), 'nba').get('9').starter, false);
  // (rows with no start flag: unknown, not nobody)
  assert.equal(lineupNow(nba.map((r) => ({ ...r, s: { min: 30 } })), 'nba').get('9').starter, null);
});

test('lineupNow / usualStarters: the usual five the five with the most starts; none read from last season or too few games', () => {
  // (seven players rotating: four start all four, three start two of four)
  const nba = [];
  for (let i = 0; i < 4; i++) for (let p = 1; p <= 7; p++) nba.push({ pid: String(p), name: `N${p}`, pos: 'G', team: '1', season: 2027, game: `n${i}`, date: `2026-11-0${i + 1}`, s: { min: p === 7 ? 14 : 30, start: p <= 4 || (p === 5 && i < 2) || (p === 6 && i >= 2) || (p === 7 && i % 2) ? 1 : 0 } });
  const players = lineupNow(nba, 'nba');
  const usual = usualStarters(players, '1', 2027);
  assert.equal(usual.size, 5);
  assert.ok(['1', '2', '3', '4'].every((id) => usual.has(id)));
  // (a game of the next season: not read from this one's)
  assert.equal(usualStarters(players, '1', 2028), null);
  assert.equal(usualStarters(players, '1', undefined), null);
  assert.equal(usualStarters(lineupNow(nba.filter((r) => r.game === 'n0'), 'nba'), '1', 2027), null);
  assert.equal(usualStarters(lineupNow(nba.map((r) => ({ ...r, s: { min: 30 } })), 'nba'), '1', 2027), null);
  assert.equal(usualStarters(null, '1', 2027), null);
});

test('putInactives: a questionable one ruled inactive is out (his listed status kept as was); a regular unlisted out; a healthy scratch left out; the shared report untouched', () => {
  const report = new Map([
    ['1', [{ id: '101', name: 'Q One', pos: 'WR', status: 'Questionable' }, { id: '105', name: 'O Five', pos: 'RB', status: 'Out' }]],
    ['2', []],
  ]);
  const players = new Map([
    ['103', { team: '1', pos: 'TE', name: 'R Three', regular: true, season: 2026, teamGames: 5 }],
    ['104', { team: '1', pos: 'WR', name: 'B Four', regular: false, season: 2026, teamGames: 5 }],
  ]);
  const l = { injuries: report, gameRosters: new Map([['1', { inactive: [{ id: '101', name: 'One' }, { id: '103', name: 'Three' }, { id: '104', name: 'Four' }, { id: '105', name: 'Five' }, { id: '199', name: 'OL' }], starters: null }]]) };
  // (before the rows: the listed one alone)
  const first = putInactives(l, game);
  assert.deepEqual(first.map((x) => x.id), ['101']);
  assert.notEqual(l.injuries, report);
  assert.equal(report.get('1')[0].status, 'Questionable');
  const second = putInactives(l, game, players);
  assert.deepEqual(second.map((x) => x.id), ['103']);
  const list = l.injuries.get('1');
  assert.equal(list.find((p) => p.id === '101').status, 'Out (inactive)');
  assert.equal(list.find((p) => p.id === '101').was, 'Questionable');
  assert.equal(list.find((p) => p.id === '103').pos, 'TE');
  assert.equal(list.some((p) => p.id === '104' || p.id === '199'), false);
  // (the props read them out)
  const out = outOf('nfl', l, '1', 'WR');
  assert.ok(out.ids.has('101') && out.ids.has('103') && out.ids.has('105'));
  assert.equal(out.questionable.has('101'), false);
  // (a report that failed: nothing put in)
  assert.deepEqual(putInactives({ ...l, injuriesFailed: true }, game, players), []);
  assert.deepEqual(putInactives({ injuries: report }, game, players), []);
  // (week 1: the regulars read from last season's games, or this season's one, aren't put in; the listed one is)
  for (const who of [{ season: 2025, teamGames: 17 }, { season: 2026, teamGames: 1 }]) {
    const l2 = { injuries: report, gameRosters: l.gameRosters };
    const old = new Map([['103', { ...players.get('103'), ...who }]]);
    assert.deepEqual(putInactives(l2, game, old).map((x) => x.id), ['101']);
  }
  assert.deepEqual(putInactives({ injuries: report, gameRosters: l.gameRosters }, { ...game, season: undefined }, players).map((x) => x.id), ['101']);
});

test('inputsOf: a listed one ruled inactive moves the out list (as the lines read him), stable once the report has him out; a regular unlisted his own part; a healthy scratch none', () => {
  const report = new Map([['1', [{ id: '101', name: 'Q One', pos: 'WR', status: 'Questionable' }]], ['2', []]]);
  const before = inputsOf('nfl', game, { injuries: report }, null, { nflverse: false });
  assert.equal(before.parts['ina:h'], null);
  // (posted: a healthy scratch only)
  const quiet = { injuries: report, gameRosters: new Map([['1', { inactive: [{ id: '199', name: 'OL' }] }], ['2', { inactive: [{ id: '299', name: 'OL2' }] }]]) };
  putInactives(quiet, game, new Map());
  const q = inputsOf('nfl', game, quiet, null, { nflverse: false });
  assert.equal(q.parts['ina:h'], '');
  assert.deepEqual(inputChanges(before.hash, q), []);
  // (posted: the questionable one inactive, out now for every market)
  const posted = new Map([['1', { inactive: [{ id: '101', name: 'One' }] }]]);
  const l = { injuries: report, gameRosters: posted };
  putInactives(l, game);
  const now = inputsOf('nfl', game, l, null, { nflverse: false });
  assert.equal(now.parts['out:h'], '101');
  assert.equal(now.parts['q:h'], '');
  assert.equal(now.parts['ina:h'], '');
  for (const market of ['spread', 'prop']) {
    const ch = inputChanges(before.hash, now, { game, before: before.parts, names: now.names, market });
    assert.deepEqual(ch.map((c) => c.words), ['HOM out list (+Q One)', 'HOM questionable list (-Q One)']);
  }
  // (and ESPN's report then has him out: the same inputs, no second change)
  const later = { injuries: new Map([['1', [{ id: '101', name: 'Q One', pos: 'WR', status: 'Out' }]], ['2', []]]), gameRosters: posted };
  putInactives(later, game);
  const after = inputsOf('nfl', game, later, null, { nflverse: false });
  assert.deepEqual(inputChanges(now.hash, after, { before: now.parts }), []);
  // (a regular unlisted: the props' part alone, a game line's bet not priced again on it)
  const players = new Map([['103', { team: '1', pos: 'TE', name: 'R Three', regular: true, season: 2026, teamGames: 5 }]]);
  const lu = { injuries: report, gameRosters: new Map([['1', { inactive: [{ id: '103', name: 'Three' }] }]]) };
  putInactives(lu, game, players);
  const un = inputsOf('nfl', game, lu, null, { nflverse: false });
  assert.equal(un.parts['out:h'], before.parts['out:h']);
  assert.equal(un.parts['ina:h'], '103');
  assert.deepEqual(inputChanges(before.hash, un, { game, market: 'spread' }), []);
  assert.deepEqual(inputChanges(q.hash, un, { game, market: 'total' }), []);
  const ch = inputChanges(q.hash, un, { game, names: un.names, market: 'prop' });
  assert.equal(ch.length, 1);
  assert.equal(ch[0].words, 'HOM inactives off the report (R Three)');
  // (no market given: every part)
  assert.equal(inputChanges(q.hash, un).length, 1);
});

test('inputsOf / lineupSurprise: the NBA\'s starting five a part only where it isn\'t the usual one', () => {
  const players = new Map([
    ...['1', '2', '3', '4', '5'].map((id) => [id, { team: '1', name: `S${id}`, starter: true, regular: true, season: 2026, teamGames: 4 }]),
    ['6', { team: '1', name: 'B6', starter: false, regular: true, season: 2026, teamGames: 4 }],
  ]);
  const report = new Map([['1', [{ id: '5', name: 'S5', status: 'Out' }]], ['2', []]]);
  const l = (five) => ({ injuries: report, gameRosters: new Map([['1', { inactive: [], starters: five }]]) });
  assert.equal(lineupSurprise(l(['1', '2', '3', '4', '6']), '1', players, 2026), '6');
  assert.equal(lineupSurprise(l(['1', '2', '3', '6', '7']), '1', players, 2026), '4,6,7');
  assert.equal(lineupSurprise(l(['1', '2', '3', '4', '5']), '1', players, 2026), '');
  assert.equal(lineupSurprise(l(null), '1', players, 2026), null);
  // (an opener: the usual five not read from last season's games; no start flags: unknown, never all five a surprise)
  assert.equal(lineupSurprise(l(['1', '2', '3', '4', '6']), '1', players, 2027), null);
  const unflagged = new Map([...players].map(([id, x]) => [id, { ...x, starter: null }]));
  assert.equal(lineupSurprise(l(['1', '2', '3', '4', '6']), '1', unflagged, 2026), null);
  const was = inputsOf('nba', game, { injuries: report }, null, {}, players);
  assert.equal(was.parts['st:h'], null);
  const usual = inputsOf('nba', game, l(['1', '2', '3', '4', '6']), null, {}, players);
  assert.equal(usual.parts['st:h'], '6');
  const ch = inputChanges(was.hash, usual, { game, names: usual.names, market: 'prop' });
  assert.ok(ch.some((c) => c.key === 'st:h' && /starting five \(B6\)/.test(c.words)));
  // (a game line's bet isn't priced again on the five: the line doesn't read it)
  for (const market of ['spread', 'total', 'moneyline']) assert.deepEqual(inputChanges(was.hash, usual, { game, market }), []);
  // (no players read: unread, never a change)
  assert.equal(inputsOf('nba', game, l(['1', '2', '3', '4', '6']), null, {}, null).parts['st:h'], null);
});

test('lineupRoleOf: one not usually starting in the posted five a CHECK on the under, a usual starter not in it on the over (by starts, as the st part); nothing posted or no usual five, nothing', () => {
  const five = ['1', '2', '3', '4', '6'];
  const usual = new Set(['1', '2', '3', '4', '5']);
  assert.equal(lineupRoleOf({ pid: '6', usual, starters: five }).key, 'lineup-start');
  assert.equal(ROLE_SAFE['lineup-start'], 'over');
  assert.equal(lineupRoleOf({ pid: '5', usual, starters: five }).key, 'lineup-bench');
  assert.equal(ROLE_SAFE['lineup-bench'], 'under');
  assert.equal(lineupRoleOf({ pid: '1', usual, starters: five }), null);
  // (a sixth man, high in minutes but not a usual starter, not in the five: nothing, every night)
  assert.equal(lineupRoleOf({ pid: '7', usual, starters: five }), null);
  assert.equal(lineupRoleOf({ pid: '6', usual, starters: null }), null);
  assert.equal(lineupRoleOf({ pid: '6', usual: null, starters: five }), null);
  assert.equal(lineupRoleOf({ pid: '6', usual: new Set(), starters: five }), null);
});
