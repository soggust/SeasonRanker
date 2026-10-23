// The Book's sport filter (a sport's heading chosen in the game dropdown: game-menu.ts sportChoice, book-rows.ts
// sportRows and sumRecords) and the closed row's line under its pick (game-menu.ts gameLine): the rows the board
// keeps, the bands' counts and seasons recomputed from them, the pill's words, and clearing it. Made-up rows, no
// network; times in Chicago's zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

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
  assert.equal(bets.sportFace('nfl', SPORTS), 'NFL · Bot Picks');
  assert.equal(bets.sportFace('nhl', SPORTS), 'NHL · Bot Picks');
  // (a sport the site has no name for: its id in caps)
  assert.equal(bets.sportFace('mma', SPORTS), 'MMA · Bot Picks');
});

test("gameLine: a closed row's line is the game and its start alone, no sport, no reason; a fight reads A vs B; no kickoff, the game alone", () => {
  const line = bets.gameLine('nfl', 'NYJ @ NE', '2026-10-18T17:00:00Z', TZ);
  assert.deepEqual(line, { name: 'NYJ @ NE', when: 'Sun 12:00 PM', text: 'NYJ @ NE · Sun 12:00 PM' });
  assert.ok(!line.text.includes('NFL'));
  assert.deepEqual(bets.gameLine('mma', 'B @ A', '2026-10-18T01:00:00Z', TZ), { name: 'A vs. B', when: 'Sat 8:00 PM', text: 'A vs. B · Sat 8:00 PM' });
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

const SAT = 'Saturday, Oct 17';
const SUN = 'Sunday, Oct 18';
const NHL = bets.groupKey(SAT, 'nhl');
const MMA = bets.groupKey(SAT, 'mma');
const NFL = bets.groupKey(SUN, 'nfl');
const ALL_NHL = bets.allKey(SAT, 'nhl');
const ALL_MMA = bets.allKey(SAT, 'mma');
const ALL_NFL = bets.allKey(SUN, 'nfl');

test("menuValues: Best Bets first, then each day its sports (the heading, its own by day, then its \"All ...\" row, then its games) in the list's order; a folded heading keeps its row and games out", () => {
  assert.deepEqual(bets.menuValues(MENU), ['', NHL, ALL_NHL, 'nhl|CAR @ WPG', 'nhl|VAN @ TB', MMA, ALL_MMA, 'mma|B @ A', NFL, ALL_NFL, 'nfl|NYJ @ NE']);
  assert.deepEqual(bets.menuValues(MENU, new Set([NHL, NFL])), ['', NHL, MMA, ALL_MMA, 'mma|B @ A', NFL]);
  assert.deepEqual(bets.menuValues([]), ['']);
  // (a heading's value is still its sport when chosen; a game's and Best Bets' none)
  assert.equal(bets.chosenSport(NHL), 'nhl');
  assert.equal(bets.chosenSport('sport:nhl'), 'nhl');
  assert.equal(bets.groupOf(MENU, 'mma|B @ A'), MMA);
  assert.equal(bets.groupOf(MENU, ALL_NFL), NFL);
  assert.equal(bets.groupOf(MENU, 'nhl|gone'), null);
});

test("allKey: a sport's \"All ...\" row chooses the sport (allOf), never reads as a heading (chosenSport) or a game; its words per sport", () => {
  assert.equal(ALL_NHL, 'all:nhl|Saturday, Oct 17');
  assert.equal(bets.allOf(ALL_NHL), 'nhl');
  assert.equal(bets.allOf(NHL), null);
  assert.equal(bets.allOf('nhl|CAR @ WPG'), null);
  assert.equal(bets.allOf(''), null);
  assert.equal(bets.chosenSport(ALL_NHL), null);
  assert.notEqual(bets.menuOptionId(ALL_NHL), bets.menuOptionId(NHL));
  assert.equal(bets.allLabel('nhl', 'NHL'), 'All NHL games');
  assert.equal(bets.allLabel('nfl', 'NFL'), 'All NFL games');
  assert.equal(bets.allLabel('nba', 'NBA'), 'All NBA games');
  assert.equal(bets.allLabel('mlb', 'MLB'), 'All MLB games');
  // (MMA's rows by their card, ESPN's event name (the owner, 2026-10-20); none known, "Fight Night")
  assert.equal(bets.allLabel('mma', 'MMA'), 'Fight Night');
  assert.equal(bets.allLabel('mma', 'MMA', 'UFC 333: Volkanovski vs. Evloev'), 'UFC 333');
  assert.equal(bets.allLabel('nba', 'NBA', 'UFC 333: Volkanovski vs. Evloev'), 'All NBA games');
});

test('cardLabel: a numbered card by its number, a UFC Fight Night by its headliners, any other card by its name', () => {
  assert.equal(bets.cardLabel('UFC 333: Volkanovski vs. Evloev'), 'UFC 333');
  assert.equal(bets.cardLabel('UFC 334: Gane vs. Hokit'), 'UFC 334');
  assert.equal(bets.cardLabel('UFC 334'), 'UFC 334');
  assert.equal(bets.cardLabel('UFC Fight Night: Buckley vs. Malott'), 'Fight Night: Buckley vs. Malott');
  assert.equal(bets.cardLabel('UFC Fight Night'), 'Fight Night');
  assert.equal(bets.cardLabel('PFL 24: Smith vs. Jones'), 'PFL 24');
  assert.equal(bets.cardLabel('PFL World Tournament 2026: Semifinals'), 'PFL World Tournament 2026');
  assert.equal(bets.cardLabel('Bellator Champions Series: Paris'), 'Bellator Champions Series: Paris');
  assert.equal(bets.cardLabel(''), 'Fight Night');
  assert.equal(bets.cardLabel(null), 'Fight Night');
  // (a Fight Night by its city when the board has one (ESPN's venue's), its headliners without; a numbered card or
  // any other never by its city)
  assert.equal(bets.cardLabel('UFC Fight Night: Moicano vs. Nolan', 'Las Vegas'), 'Fight Night: Las Vegas');
  assert.equal(bets.cardLabel('UFC Fight Night', 'Edmonton'), 'Fight Night: Edmonton');
  assert.equal(bets.cardLabel('UFC Fight Night: Buckley vs. Malott', ' '), 'Fight Night: Buckley vs. Malott');
  assert.equal(bets.cardLabel('UFC Fight Night: Buckley vs. Malott', null), 'Fight Night: Buckley vs. Malott');
  assert.equal(bets.cardLabel('UFC 333: Volkanovski vs. Evloev', 'Abu Dhabi'), 'UFC 333');
  assert.equal(bets.cardLabel('PFL 24: Smith vs. Jones', 'Chicago'), 'PFL 24');
  assert.equal(bets.allLabel('mma', 'MMA', 'UFC Fight Night: Moicano vs. Nolan', 'Las Vegas'), 'Fight Night: Las Vegas');
});

test("an \"All ...\" row: a team sport's one a day with every game in start order; MMA's one a card, each with its fights alone", () => {
  const fight = (matchup, start, card) => ({ ...menuGame('mma', matchup, start), card });
  const menu = bets.gameMenu(
    [
      menuGame('nba', 'LAL @ BOS', '2026-10-24T23:30:00Z', 2),
      menuGame('nba', 'NYK @ MIA', '2026-10-24T23:00:00Z'),
      fight('B @ A', '2026-10-24T20:30:00Z', 'UFC 333: Volkanovski vs. Evloev'),
      fight('D @ C', '2026-10-24T14:00:00Z', 'UFC 333: Volkanovski vs. Evloev'),
      fight('F @ E', '2026-10-24T22:00:00Z', 'PFL 24: Smith vs. Jones'),
    ],
    [...SPORTS, { id: 'mma', label: 'MMA' }],
    TZ,
  );
  const day = 'Saturday, Oct 24';
  const [mma, nba] = menu[0].sports;
  assert.deepEqual(nba.alls.map((a) => [a.key, a.label, a.games.map((g) => g.key)]), [[bets.allKey(day, 'nba'), 'All NBA games', ['nba|NYK @ MIA', 'nba|LAL @ BOS']]]);
  const ufc = bets.allKey(day, 'mma', 'UFC 333: Volkanovski vs. Evloev');
  const pfl = bets.allKey(day, 'mma', 'PFL 24: Smith vs. Jones');
  assert.deepEqual(mma.alls.map((a) => [a.key, a.label, a.games.map((g) => g.key)]), [
    [ufc, 'UFC 333', ['mma|D @ C', 'mma|B @ A']],
    [pfl, 'PFL 24', ['mma|F @ E']],
  ]);
  // (each its own choice: in the list's order before the fights, under its heading, found again by its value)
  assert.equal(bets.allOf(pfl), 'mma');
  assert.deepEqual(bets.menuValues(menu).slice(0, 4), ['', bets.groupKey(day, 'mma'), ufc, pfl]);
  assert.equal(bets.groupOf(menu, pfl), bets.groupKey(day, 'mma'));
  assert.equal(bets.allRow(menu, pfl)?.label, 'PFL 24');
  assert.equal(bets.allRow(menu, bets.allKey('Sunday, Oct 25', 'nba')), null);
  // (a Fight Night's row by its city, the first of its fights' the board names; none, its headliners)
  const night = 'UFC Fight Night: Moicano vs. Nolan';
  const vegas = bets.gameMenu(
    [
      { ...fight('H @ G', '2026-10-31T20:00:00Z', night), city: null },
      { ...fight('J @ I', '2026-10-31T23:00:00Z', night), city: 'Las Vegas' },
      fight('L @ K', '2026-10-31T22:00:00Z', 'UFC Fight Night: Buckley vs. Malott'),
    ],
    [{ id: 'mma', label: 'MMA' }],
    TZ,
  );
  assert.deepEqual(vegas[0].sports[0].alls.map((a) => a.label), ['Fight Night: Las Vegas', 'Fight Night: Buckley vs. Malott']);
});

test('defaultClosed: a quiet list opens every sport; a busy one (more than 12 games) folds every sport but the chosen game\'s and the chosen sport\'s', () => {
  assert.deepEqual([...bets.defaultClosed(MENU, '', '')], []);
  const busy = bets.gameMenu(
    [...Array(13).keys()].map((i) => menuGame(i < 7 ? 'nhl' : 'nba', `A${i} @ B${i}`, i < 7 ? '2026-10-17T19:30:00Z' : '2026-10-18T19:30:00Z', i % 3 ? null : 1)),
    [...SPORTS, { id: 'nba', label: 'NBA' }],
    TZ,
  );
  assert.deepEqual([...bets.defaultClosed(busy, '', '')], [bets.groupKey(SAT, 'nhl'), bets.groupKey(SUN, 'nba')]);
  assert.deepEqual([...bets.defaultClosed(busy, 'nba|A8 @ B8', '')], [bets.groupKey(SAT, 'nhl')]);
  assert.deepEqual([...bets.defaultClosed(busy, '', 'nhl')], [bets.groupKey(SUN, 'nba')]);
});

test('menuKey: the arrows walk the list and hold at its ends, Home/End and PageUp/PageDown jump, Enter and Space take, Escape and Tab shut', () => {
  const values = bets.menuValues(MENU);
  assert.deepEqual(bets.menuKey('ArrowDown', values, ''), { kind: 'move', value: NHL });
  // (the heading, then its "All ..." row, then its games)
  assert.deepEqual(bets.menuKey('ArrowDown', values, NHL), { kind: 'move', value: ALL_NHL });
  assert.deepEqual(bets.menuKey('ArrowDown', values, ALL_NHL), { kind: 'move', value: 'nhl|CAR @ WPG' });
  assert.deepEqual(bets.menuKey('ArrowUp', values, 'nhl|CAR @ WPG'), { kind: 'move', value: ALL_NHL });
  assert.deepEqual(bets.menuKey('ArrowDown', values, 'nhl|CAR @ WPG'), { kind: 'move', value: 'nhl|VAN @ TB' });
  assert.deepEqual(bets.menuKey('ArrowUp', values, NHL), { kind: 'move', value: '' });
  // (Right and Left: unfold and fold, the page's to apply to a heading)
  assert.deepEqual(bets.menuKey('ArrowRight', values, NHL), { kind: 'expand' });
  assert.deepEqual(bets.menuKey('ArrowLeft', values, 'nhl|CAR @ WPG'), { kind: 'collapse' });
  // (held at the ends, no wrap)
  assert.deepEqual(bets.menuKey('ArrowUp', values, ''), { kind: 'move', value: '' });
  assert.deepEqual(bets.menuKey('ArrowDown', values, 'nfl|NYJ @ NE'), { kind: 'move', value: 'nfl|NYJ @ NE' });
  assert.deepEqual(bets.menuKey('End', values, ''), { kind: 'move', value: 'nfl|NYJ @ NE' });
  assert.deepEqual(bets.menuKey('Home', values, MMA), { kind: 'move', value: '' });
  assert.deepEqual(bets.menuKey('PageDown', values, ''), { kind: 'move', value: NFL });
  assert.deepEqual(bets.menuKey('PageUp', values, 'nfl|NYJ @ NE'), { kind: 'move', value: ALL_NHL });
  // (a lit choice gone from the list (a game dropped): the walk starts from the top)
  assert.deepEqual(bets.menuKey('ArrowDown', values, 'nhl|gone'), { kind: 'move', value: NHL });
  assert.deepEqual(bets.menuKey('Enter', values, NHL), { kind: 'choose' });
  assert.deepEqual(bets.menuKey(' ', values, NHL), { kind: 'choose' });
  assert.deepEqual(bets.menuKey('Enter', values, ALL_NHL), { kind: 'choose' });
  assert.deepEqual(bets.menuKey('Escape', values, NHL), { kind: 'close' });
  assert.deepEqual(bets.menuKey('Tab', values, ''), { kind: 'close' });
  assert.deepEqual(bets.menuKey('Escape', [], ''), { kind: 'close' });
  // (any other key: nothing)
  assert.equal(bets.menuKey('a', values, ''), null);
  assert.equal(bets.menuKey('ArrowDown', [], ''), null);
});

test("dayBand and menuOptionId: a day's caption on its band; an option's id from its value, letters and digits alone", () => {
  assert.equal(bets.dayBand('Saturday, Oct 17'), 'SATURDAY · OCT 17');
  assert.equal(bets.dayBand(MENU[0].day), 'SATURDAY · OCT 17');
  assert.equal(bets.menuOptionId(''), 'book-game-opt-all');
  assert.equal(bets.menuOptionId('sport:nhl'), 'book-game-opt-sport-nhl');
  assert.equal(bets.menuOptionId('mlb|CLE @ TB|401700123'), 'book-game-opt-mlb-CLE-TB-401700123');
  assert.notEqual(bets.menuOptionId('nhl|CAR @ WPG'), bets.menuOptionId('nhl|CAR @ WPG|401'));
});

test("faces: a game's two teams before its name in the name's order, a fight's first-listed fighter first; none given, none", () => {
  const nhl = MENU[0].sports.find((s) => s.sport === 'nhl').games;
  assert.deepEqual(nhl[0].faces, [{ abbr: 'CAR', logo: '/nhl/assets/NHL_Icons/CAR.svg' }, { abbr: 'WPG', logo: null }]);
  assert.deepEqual(nhl[1].faces, []);
  const fight = MENU[0].sports.find((s) => s.sport === 'mma').games[0];
  assert.equal(fight.name, 'A vs. B');
  assert.deepEqual(fight.faces.map((f) => f.abbr), ['A', 'B']);
});

test("playerCardHref: a prop's player's card is his sport's page with his name on the link; a side or a total, none", () => {
  assert.equal(bets.playerCardHref({ sport: 'nfl', betType: 'player', player: 'Drake Maye' }), '/nfl/?name=Drake+Maye');
  assert.equal(bets.playerCardHref({ sport: 'nhl', betType: 'player', player: 'Logan Stanley' }), '/nhl/?name=Logan+Stanley');
  assert.equal(bets.playerCardHref({ sport: 'nfl', betType: 'spread', player: null }), null);
  assert.equal(bets.playerCardHref({ sport: 'nfl', betType: 'player', player: '' }), null);
});

test("the Book's words and bars: Best Bets, the views bar only with more than the board, a game's picks header", () => {
  assert.equal(bets.BEST_BETS_LABEL, 'Bot Picks');
  const none = { desk: false, open: false, closed: false, live: false };
  assert.equal(bets.viewsShown(none), false);
  for (const k of Object.keys(none)) assert.equal(bets.viewsShown({ ...none, [k]: true }), true, k);
  assert.equal(bets.gamePicksHead(3), "The Bot's picks · 3");
});

test("rowClickToggles: a click on the row toggles it, not one on its controls or inside its open content", () => {
  // (a stand-in element: closest answers whether the target sits inside one of the ignored kinds)
  const el = (inside) => ({ closest: (sel) => (inside && sel === bets.ROW_CLICK_IGNORES ? {} : null) });
  assert.equal(bets.rowClickToggles(el(false)), true);
  assert.equal(bets.rowClickToggles(el(true)), false);
  assert.equal(bets.rowClickToggles(null), false);
  for (const k of ['button', 'a', '[role="button"]', 'input', '.bet-reasons']) assert.ok(bets.ROW_CLICK_IGNORES.includes(k), k);
});

test("barClickToggles: a click anywhere on a folding panel's bar folds it, not one on the bar's own controls", () => {
  // (a stand-in element inside the given kinds: closest answers whether any of the selector list's parts is among them)
  const el = (...inside) => ({ closest: (sel) => (sel.split(',').map((s) => s.trim()).some((s) => inside.includes(s)) ? {} : null) });
  // (the bar itself, its title text, a note or a stat on it: folds)
  assert.equal(bets.barClickToggles(el()), true);
  assert.equal(bets.barClickToggles(el('h3')), true);
  assert.equal(bets.barClickToggles(el('.wp-bar-note')), true);
  // (its controls: the chevron's own button (it folds on its own click, so the bar's must not fold it back), a link,
  // a range select, a field, a tab, the page's controls on a card panel's right, a drag grip: never)
  for (const k of ['button', 'a', 'select', 'input', 'textarea', 'label', '[role="button"]', '[role="tab"]', '[role="switch"]', 'mat-select', '[panel-actions]', '.cdk-drag-handle']) {
    assert.ok(bets.BAR_CLICK_IGNORES.includes(k), k);
    assert.equal(bets.barClickToggles(el(k)), false, k);
  }
  assert.equal(bets.barClickToggles(null), false);
  assert.equal(bets.barClickToggles({}), false);
});
