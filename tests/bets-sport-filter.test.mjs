// The Bets page's sport filter (a sport's heading chosen in the game dropdown: game-menu.ts sportChoice, bets-rows.ts
// sportRows and sumRecords) and the closed row's line under its pick (game-menu.ts gameLine): the rows the board
// keeps, the bands' counts and seasons recomputed from them, the pill's words, and clearing it. Made-up rows, no
// network; times in Chicago's zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'bets-entry.ts'), data: {} });

const SPORTS = [
  { id: 'nfl', label: 'NFL' },
  { id: 'nhl', label: 'NHL' },
  { id: 'nba', label: 'NBA' },
];
const TZ = 'America/Chicago';
const row = (id, sport, confidence, matchup, extra = {}) => ({ id, sport, confidence, sureness: 0.03, pick: `pick ${id}`, game: { matchup, kickoff: '2026-10-18T17:00:00Z', date: '2026-10-18' }, ...extra });
const ROWS = [
  row(1, 'nfl', 'lock', 'NYJ @ NE'),
  row(2, 'nhl', 'check', 'BOS @ NYR', { check: true }),
  row(3, 'nfl', 'high', 'KC @ BUF'),
  row(4, 'nhl', 'high', 'EDM @ VAN'),
  row(5, 'nba', 'medium', 'LAL @ GSW'),
  row(6, 'nfl', 'medium', 'NYJ @ NE'),
  row(7, 'nfl', 'low', 'CHI @ GB'),
];
// (the board's bands as the page builds them: each band's rows among those on show)
const bands = (rows) => Object.fromEntries(['lock', 'check', 'high', 'medium', 'low'].map((b) => [b, rows.filter((r) => r.confidence === b).length]).filter(([, n]) => n));

test('sportRows: a sport chosen keeps its rows alone, every game of it, in their order; the bands and their counts follow', () => {
  const nfl = bets.sportRows(ROWS, 'nfl');
  assert.deepEqual(nfl.map((r) => r.id), [1, 3, 6, 7]);
  assert.deepEqual(bands(nfl), { lock: 1, high: 1, medium: 1, low: 1 });
  // (the NHL's: its CHECK among them for an admin, no LOCK band at all)
  assert.deepEqual(bands(bets.sportRows(ROWS, 'nhl')), { check: 1, high: 1 });
  // (the bets alone, the CHECK out, the way the dropdown's count reads them)
  assert.equal(bets.sportRows(ROWS, 'nhl').filter((r) => !r.check).length, 1);
  // (a sport without a pick: an empty board, not an error)
  assert.deepEqual(bets.sportRows(ROWS, 'mlb'), []);
});

test('sportRows: no sport chosen, every row, a copy (the page keys its caches on identity)', () => {
  const all = bets.sportRows(ROWS, '');
  assert.deepEqual(all, ROWS);
  assert.notEqual(all, ROWS);
});

test("sumRecords: the bands' seasons from the chosen sport's file alone; none chosen, every file summed; a band no file graded, absent", () => {
  const files = [
    ['nfl', { lock: { wins: 3, losses: 1, profit: 2.5 }, high: { wins: 10, losses: 8, pushes: 1, profit: 1.25 } }],
    ['nhl', { high: { wins: 4, losses: 6, profit: -2.75 }, medium: { wins: 12, losses: 10, profit: 0.4 } }],
    // (a file without a record yet, and one not read)
    ['nba', undefined],
    ['mlb', null],
  ];
  const nfl = bets.sumRecords(files, 'nfl');
  assert.deepEqual([...nfl.keys()], ['lock', 'high']);
  assert.deepEqual(nfl.get('high'), { wins: 10, losses: 8, pushes: 1, profit: 1.25 });
  const all = bets.sumRecords(files, '');
  assert.deepEqual(all.get('high'), { wins: 14, losses: 14, pushes: 1, profit: -1.5 });
  assert.deepEqual(all.get('medium'), { wins: 12, losses: 10, pushes: 0, profit: 0.4 });
  assert.equal(all.get('low'), undefined);
  assert.equal(bets.sumRecords(files, 'nba').size, 0);
});

test("sportChoice: the dropdown's value for a sport, read back; a game's key and Best bets are no sport; the pill's words", () => {
  assert.equal(bets.sportChoice('nhl'), 'sport:nhl');
  assert.equal(bets.chosenSport('sport:nhl'), 'nhl');
  assert.equal(bets.chosenSport('nfl|NYJ @ NE'), null);
  assert.equal(bets.chosenSport('mlb|CLE @ TB|401700123'), null);
  // (Best bets · every game: '' is no sport, the page's clearing of both filters)
  assert.equal(bets.chosenSport(''), null);
  assert.equal(bets.sportFace('nfl', SPORTS), 'NFL · best bets');
  assert.equal(bets.sportFace('nhl', SPORTS), 'NHL · best bets');
  // (a sport the site has no name for: its id in caps)
  assert.equal(bets.sportFace('mma', SPORTS), 'MMA · best bets');
});

test("gameLine: a closed row's line is the game and its start alone, no sport, no reason; a fight reads A vs B; no kickoff, the game alone", () => {
  const line = bets.gameLine('nfl', 'NYJ @ NE', '2026-10-18T17:00:00Z', TZ);
  assert.deepEqual(line, { name: 'NYJ @ NE', when: 'Sun 12:00 PM', text: 'NYJ @ NE · Sun 12:00 PM' });
  assert.ok(!line.text.includes('NFL'));
  assert.deepEqual(bets.gameLine('mma', 'B @ A', '2026-10-18T01:00:00Z', TZ), { name: 'A vs B', when: 'Sat 8:00 PM', text: 'A vs B · Sat 8:00 PM' });
  assert.deepEqual(bets.gameLine('nfl', 'KC @ BUF', null, TZ), { name: 'KC @ BUF', when: null, text: 'KC @ BUF' });
  assert.deepEqual(bets.gameLine('nfl', 'KC @ BUF', 'not a date', TZ).when, null);
});

// The dropdown's open list, the page's own listbox (game-menu.ts menuValues, menuKey, dayBand, menuOptionId): the
// choices in their laid-out order, the keys that walk, take and shut it, a day's band, the options' ids, and the
// two faces before a game's name (a fight's first-listed fighter first)
const menuGame = (sport, matchup, start, count = null, teams) => ({ key: `${sport}|${matchup}`, sport, matchup, start, count, teams });
const MENU = bets.gameMenu(
  [
    menuGame('nhl', 'CAR @ WPG', '2026-10-17T19:30:00Z', 1, [{ abbr: 'CAR', logo: '/nhl/assets/NHL_Icons/CAR.svg' }, { abbr: 'WPG', logo: null }]),
    menuGame('nhl', 'VAN @ TB', '2026-10-17T20:00:00Z'),
    menuGame('nfl', 'NYJ @ NE', '2026-10-18T17:00:00Z', 2),
    menuGame('mma', 'B @ A', '2026-10-18T01:00:00Z', null, [{ abbr: 'B', logo: 'https://a.espncdn.com/b.png' }, { abbr: 'A', logo: 'https://a.espncdn.com/a.png' }]),
  ],
  SPORTS,
  TZ,
);

test('menuValues: Best bets first, then each day its sports (the heading before its games) in the list\'s order', () => {
  assert.deepEqual(bets.menuValues(MENU), ['', 'sport:nhl', 'nhl|CAR @ WPG', 'nhl|VAN @ TB', 'sport:mma', 'mma|B @ A', 'sport:nfl', 'nfl|NYJ @ NE']);
  assert.deepEqual(bets.menuValues([]), ['']);
});

test('menuKey: the arrows walk the list and hold at its ends, Home/End and PageUp/PageDown jump, Enter and Space take, Escape and Tab shut', () => {
  const values = bets.menuValues(MENU);
  assert.deepEqual(bets.menuKey('ArrowDown', values, ''), { kind: 'move', value: 'sport:nhl' });
  assert.deepEqual(bets.menuKey('ArrowDown', values, 'nhl|CAR @ WPG'), { kind: 'move', value: 'nhl|VAN @ TB' });
  assert.deepEqual(bets.menuKey('ArrowUp', values, 'sport:nhl'), { kind: 'move', value: '' });
  // (held at the ends, no wrap)
  assert.deepEqual(bets.menuKey('ArrowUp', values, ''), { kind: 'move', value: '' });
  assert.deepEqual(bets.menuKey('ArrowDown', values, 'nfl|NYJ @ NE'), { kind: 'move', value: 'nfl|NYJ @ NE' });
  assert.deepEqual(bets.menuKey('End', values, ''), { kind: 'move', value: 'nfl|NYJ @ NE' });
  assert.deepEqual(bets.menuKey('Home', values, 'sport:mma'), { kind: 'move', value: '' });
  assert.deepEqual(bets.menuKey('PageDown', values, ''), { kind: 'move', value: 'nfl|NYJ @ NE' });
  assert.deepEqual(bets.menuKey('PageUp', values, 'nfl|NYJ @ NE'), { kind: 'move', value: '' });
  // (a lit choice gone from the list (a game dropped): the walk starts from the top)
  assert.deepEqual(bets.menuKey('ArrowDown', values, 'nhl|gone'), { kind: 'move', value: 'sport:nhl' });
  assert.deepEqual(bets.menuKey('Enter', values, 'sport:nhl'), { kind: 'choose' });
  assert.deepEqual(bets.menuKey(' ', values, 'sport:nhl'), { kind: 'choose' });
  assert.deepEqual(bets.menuKey('Escape', values, 'sport:nhl'), { kind: 'close' });
  assert.deepEqual(bets.menuKey('Tab', values, ''), { kind: 'close' });
  assert.deepEqual(bets.menuKey('Escape', [], ''), { kind: 'close' });
  // (any other key: nothing)
  assert.equal(bets.menuKey('a', values, ''), null);
  assert.equal(bets.menuKey('ArrowDown', [], ''), null);
});

test("dayBand and menuOptionId: a day's caption on its band; an option's id from its value, letters and digits alone", () => {
  assert.equal(bets.dayBand('Saturday, Oct 17'), 'SATURDAY · OCT 17');
  assert.equal(bets.dayBand(MENU[0].day), 'SATURDAY · OCT 17');
  assert.equal(bets.menuOptionId(''), 'bets-game-opt-all');
  assert.equal(bets.menuOptionId('sport:nhl'), 'bets-game-opt-sport-nhl');
  assert.equal(bets.menuOptionId('mlb|CLE @ TB|401700123'), 'bets-game-opt-mlb-CLE-TB-401700123');
  assert.notEqual(bets.menuOptionId('nhl|CAR @ WPG'), bets.menuOptionId('nhl|CAR @ WPG|401'));
});

test("faces: a game's two teams before its name in the name's order, a fight's first-listed fighter first; none given, none", () => {
  const nhl = MENU[0].sports.find((s) => s.sport === 'nhl').games;
  assert.deepEqual(nhl[0].faces, [{ abbr: 'CAR', logo: '/nhl/assets/NHL_Icons/CAR.svg' }, { abbr: 'WPG', logo: null }]);
  assert.deepEqual(nhl[1].faces, []);
  const fight = MENU[0].sports.find((s) => s.sport === 'mma').games[0];
  assert.equal(fight.name, 'A vs B');
  assert.deepEqual(fight.faces.map((f) => f.abbr), ['A', 'B']);
});
