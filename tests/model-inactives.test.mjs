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

// ESPN's game roster carries the team's last game's didNotPlay flags, before and after the game's own post
// (2026-10-18: the Eagles' list kept DeVonta Smith, playing, from the Jaguars game): context.mjs freshInactives, only
// the names new since the last game count; lastGameOf the team's last game
test('freshInactives and lastGameOf: last week’s names carried over are left to the injury report', async () => {
  const { freshInactives, lastGameOf } = await import('../libs/ranker/scripts/model/context.mjs');
  const list = (...ids) => ({ inactive: ids.map((id) => ({ id: String(id), name: '' })), starters: null });
  const ids = (r) => r.inactive.map((x) => x.id);
  assert.deepEqual(ids(freshInactives(list(1, 2, 3), list(3, 2, 1))), []);
  assert.deepEqual(ids(freshInactives(list(1, 2, 3, 4, 5), list(1, 2, 3))), ['4', '5']);
  assert.deepEqual(ids(freshInactives(list(1, 2), list())), ['1', '2']);
  assert.deepEqual(ids(freshInactives(list(1, 2), null)), []);
  assert.equal(freshInactives(null, list(1)), null);
  const history = [
    { id: 'a', home: '21', away: '30', date: '2026-10-04T17:00Z' },
    { id: 'b', home: '30', away: '21', date: '2026-10-11T13:30Z' },
    { id: 'c', home: '5', away: '6', date: '2026-10-12T17:00Z' },
  ];
  assert.equal(lastGameOf(history, '21', Date.parse('2026-10-18T17:00Z')), 'b');
  assert.equal(lastGameOf(history, '21', Date.parse('2026-10-10T17:00Z')), 'a');
  assert.equal(lastGameOf(history, '99', Date.parse('2026-10-18T17:00Z')), null);
});

// The NFL's injury report keeps a team's last game's listings after it (2026-10-18: the Broncos' and Seahawks'
// Thursday inactives still Out three days on, Te'Cory Couch questionable from a 10-04 in-game hamstring): context.mjs
// staleReport takes a game's own inactives (tag INACTIVE) and its questionable and doubtful ones from before the
// team's last game (its start plus STALE_AFTER) off the report; an Out or IR one stays (a multi-week injury's
// isn't posted again each week)
test('staleReport: the last game’s inactives and questionables taken off the report, a long Out kept, the report untouched', async () => {
  const { staleReport, STALE_AFTER } = await import('../libs/ranker/scripts/model/context.mjs');
  assert.equal(STALE_AFTER, 4 * 36e5);
  const history = [
    { id: 'a', home: '7', away: '26', date: '2026-10-16T00:15Z', final: true },
    { id: 'b', home: '7', away: '9', date: '2026-10-25T17:00Z', final: false },
  ];
  const p = (id, status, date, tag = null) => ({ id, name: `P${id}`, pos: 'WR', status, tag, date });
  const report = new Map([
    ['7', [p('1', 'Out', '2026-10-15T22:49Z', 'INACTIVE'), p('2', 'Questionable', '2026-10-16T01:30Z', 'QUESTIONABLE'), p('3', 'Out', '2026-10-13T15:52Z', 'OUT'), p('4', 'Injured Reserve', '2026-09-01T00:00Z', 'IR'), p('5', 'Questionable', '2026-10-21T20:00Z', 'QUESTIONABLE'), p('6', 'Out', '2026-10-22T20:00Z', 'INACTIVE'), p('8', 'Doubtful', '2026-10-15T20:00Z', 'DOUBTFUL')]],
    ['9', [p('10', 'Questionable', '2026-10-01T00:00Z')]],
  ]);
  const { report: r, stale } = staleReport(report, history, Date.parse('2026-10-24T17:00Z'));
  const st = (team) => Object.fromEntries(r.get(team).map((x) => [x.id, x.status]));
  // (1, 2 and 8 the Thursday game's, 2 posted mid-game; 3 and 4 a long injury's; 5 and 6 this week's)
  assert.deepEqual(st('7'), { 3: 'Out', 4: 'Injured Reserve', 5: 'Questionable', 6: 'Out' });
  assert.deepEqual(stale.map((x) => x.name), ['P1', 'P2', 'P8']);
  // (a team with no final in the history: as listed; the report itself untouched)
  assert.equal(st('9')['10'], 'Questionable');
  assert.equal(report.get('7')[0].status, 'Out');
});

// A posted NFL side (names new on its list, and the report's own inactives for the game or three new names):
// a questionable or doubtful one on none of the list plays (ESPN's report keeps him Questionable through the game)
test('putInactives: a posted NFL side’s questionable or doubtful players left off its list read as Active; one on the list (new or carried) not', async () => {
  const { reportPosted } = await import('../libs/ranker/scripts/model/context.mjs');
  const report = new Map([
    ['1', [
      { id: '11', name: 'Q1', pos: 'RB', status: 'Questionable', date: '2026-10-17T00:00Z' },
      { id: '12', name: 'Q2', pos: 'WR', status: 'Questionable', date: '2026-10-17T00:00Z' },
      { id: '13', name: 'D1', pos: 'TE', status: 'Doubtful', date: '2026-10-17T00:00Z' },
      { id: '14', name: 'Q3', pos: 'WR', status: 'Questionable', date: '2026-10-17T00:00Z' },
      { id: '15', name: 'O1', pos: 'LB', status: 'Out', tag: 'INACTIVE', date: '2026-10-18T15:33Z' },
      { id: '16', name: 'Q5', pos: 'CB', status: 'Questionable', date: '2026-10-17T00:00Z' },
    ]],
    ['2', [{ id: '21', name: 'Q4', pos: 'WR', status: 'Questionable', date: '2026-10-17T00:00Z' }]],
  ]);
  assert.equal(reportPosted(report, '1', game.date), true);
  assert.equal(reportPosted(report, '2', game.date), false);
  assert.equal(reportPosted(report, '1', '2026-10-19T00:20Z'), false);
  const l = {
    injuries: report,
    gameRosters: new Map([
      // (12 new on the list; 14 on it carried over: can't be told from a name inactive again, so left as listed)
      // (16 questionable on IR, designated to return, not activated: not on the game-day roster, left as listed)
      ['1', { inactive: [{ id: '12', name: 'Q2' }, { id: '15', name: 'O1' }], starters: null, posted: true, listed: ['12', '14', '15'], ids: ['11', '12', '13', '14', '15', '30', '31'] }],
      // (not posted for this game: nothing cleared)
      ['2', { inactive: [{ id: '99', name: 'X' }], starters: null }],
    ]),
  };
  const put = putInactives(l, game);
  const st = (team) => Object.fromEntries(l.injuries.get(team).map((x) => [x.id, x.status]));
  assert.deepEqual(st('1'), { 11: 'Active (not inactive)', 12: 'Out (inactive)', 13: 'Active (not inactive)', 14: 'Questionable', 15: 'Out', 16: 'Questionable' });
  assert.deepEqual(st('2'), { 21: 'Questionable' });
  assert.deepEqual(put.map((x) => x.id), ['12']);
  assert.deepEqual(put.cleared.map((x) => [x.id, x.was]), [['11', 'Questionable'], ['13', 'Doubtful']]);
  assert.equal(report.get('1')[0].status, 'Questionable');
  // (read again: nothing more)
  assert.deepEqual(putInactives(l, game), []);
  // (the props and the inputs read him active: no longer questionable)
  assert.equal(outOf('nfl', l, '1', 'RB').questionable.has('11'), false);
  const parts = inputsOf('nfl', game, l, null, {}).parts;
  assert.equal(parts['q:h'], '14,16');
  // (no game-day roster's ids: nothing cleared)
  const l2 = { injuries: report, gameRosters: new Map([['1', { inactive: [{ id: '12', name: 'Q2' }], starters: null, posted: true, listed: ['12'] }]]) };
  assert.equal(putInactives(l2, game).cleared, undefined);
});

// The count a posting could have judged on the new names alone: a coming game's list carries its last game's
// (2026-10-18 TEN's 12, 9 of them the last game's), so it's asked uncapped (gameRosterOf cap false) and judged
// after freshInactives (espn.mjs postedMax)
test('gameRosterOf cap false and postedMax: a list carrying last week’s names isn’t read as unposted for its size', async () => {
  const { postedMax } = await import('../libs/ranker/scripts/model/espn.mjs');
  const thirteen = nflBody(Array.from({ length: 13 }, (_, i) => String(100 + i)));
  assert.equal(gameRosterOf(thirteen, 'nfl'), null);
  const r = gameRosterOf(thirteen, 'nfl', false);
  assert.equal(r.inactive.length, 13);
  assert.equal(r.n, 53);
  assert.equal(r.ids.length, 53);
  assert.equal(postedMax('nfl', 13, 53), true);
  assert.equal(postedMax('nfl', 6, 53), false);
  assert.equal(postedMax('nfl', 12, 40), true);
  assert.equal(postedMax('mlb', 30, 40), false);
});
