// The Book's dropdown and a game's props, the owner's bug of 2026-10-19 ("my dropdown has no NHL lines for
// tonight ... when I open an NHL game, player props show no K score, they say 'assumed'"). Tonight's four NHL
// games had DraftKings lines and priced props on board.json, and the Bot's only picks on them were practice picks
// the list hides (book-rows.ts bookShows: no edge at the live price). The dropdown skipped a game with picks on it
// as "picked" while the picked list, built from the rows on show, didn't have it: the games were in neither, so the
// owner could only open tomorrow's, whose props aren't priced yet (the preview's -110 assumed). Now a game is
// picked only through a row on show (game-menu.ts linesOnlyGames, shownEvents), and a board game is found by its
// id as text (wallet-math.ts modelGameOf), so a board prop with prices never falls to the preview. Made-up rows in
// the board's own shape, no network; times in Chicago's zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/wallet-entry.ts'), data: {} });
const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const { gameMenu, linesOnlyGames, shownEvents, bookRows, rowOf } = book;

const NOW = Date.parse('2026-10-19T17:30:00Z');
const TZ = 'America/Chicago';
const SPORTS = [
  { id: 'nfl', label: 'NFL' },
  { id: 'mlb', label: 'MLB' },
  { id: 'nba', label: 'NBA' },
  { id: 'nhl', label: 'NHL' },
];
const side = (s, l, o, ks) => ({ s, l, o, c: 0.5, ks, b: 'low' });
// (a board.json game: its lines with the Book's prices, and its props with both prices and Kelly scores)
const boardGame = (id, m, start, props = []) => {
  const [a, h] = m.split(' @ ');
  return {
    id,
    start,
    m,
    a: [a, '1'],
    h: [h, '2'],
    k: { spread: [side('home', -1.5, 160, -0.03), side('away', 1.5, -192, -0.04)], total: [side('over', 6.5, -110, -0.06), side('under', 6.5, -110, -0.03)], ml: [side('home', null, -154, -0.04), side('away', null, 130, -0.03)] },
    p: props,
  };
};
const fox = { n: 'Adam Fox', id: '4197146', t: '2', k: 'pts', lb: 'Points', l: 0.5, o: [-190, 140], c: 0.601, ks: [-0.1128, -0.0667], b: ['low', 'low'] };
const NHL = { sport: 'nhl', at: '2026-10-19T16:29:16.693Z', games: [boardGame('401892535', 'ANA @ NYR', '2026-10-19T23:00Z', [fox]), boardGame('401892539', 'SJ @ MTL', '2026-10-20T23:00Z')] };
const MLB = { sport: 'mlb', at: '2026-10-19T16:29:24.911Z', games: [boardGame('401908028', 'CLE @ TB', '2026-10-20T00:00Z')] };
const boards = [...NHL.games.map((g) => w.modelGameBoard('nhl', g, NOW)), ...MLB.games.map((g) => w.modelGameBoard('mlb', g, NOW))];

// (the Bot's practice pick on tonight's game: placed short of the vig, its Kelly negative at the price)
const practice = rowOf(
  'nhl',
  { id: '401892535:prop:saves:4697705', start: '2026-10-19T23:00Z', matchup: 'ANA @ NYR', teams: [], market: 'Saves', kind: 'player', pick: 'Dylan Garand Under 23.5 Saves', side: 'under', line: 23.5, odds: -115, p: 0.5, chance: 50, edge: true, practice: true, score: -0.0588, units: 0.5, reason: '' },
  false,
);

const menuOf = (listed) =>
  gameMenu(
    linesOnlyGames(boards, shownEvents(listed)).map((g) => ({ key: `${g.sport}|${g.matchup}|${g.event}`, sport: g.sport, matchup: g.matchup, start: g.start, count: null })),
    SPORTS,
    TZ,
  );
const names = (days) => days.map((d) => `${d.day}: ${d.sports.map((s) => `${s.sport} ${s.games.map((g) => g.matchup).join(', ')}`).join(' / ')}`);

test('a board game with lines is in the dropdown, its picks hidden or not', () => {
  // (the practice pick is off the list: no edge at its price)
  const listed = bookRows([practice]);
  assert.equal(listed.length, 0);
  assert.deepEqual(names(menuOf(listed)), ['Monday, Oct 19: nhl ANA @ NYR / mlb CLE @ TB', 'Tuesday, Oct 20: nhl SJ @ MTL']);
  // (each one off the board's lines: the model's GameBoard has its prices)
  for (const g of boards) assert.ok(g.spread && g.total && g.ml, g.matchup);
});

test('a game with a row on show is the picked list\'s, not listed twice by its lines', () => {
  const shown = { ...practice, practice: false };
  const lines = linesOnlyGames(boards, shownEvents([shown])).map((g) => g.matchup);
  assert.deepEqual(lines, ['SJ @ MTL', 'CLE @ TB']);
  // (a game begun, or one with no line posted, isn't there to bet)
  const begun = { ...boards[2], state: 'in' };
  const bare = { ...boards[1], spread: null, total: null, ml: null };
  assert.deepEqual(linesOnlyGames([begun, bare], new Set()), []);
});

test('a board prop with prices is found and never falls to the preview\'s assumed -110', () => {
  // (by its id as text or as a number)
  assert.equal(w.modelGameOf(NHL.games, '401892535')?.m, 'ANA @ NYR');
  assert.equal(w.modelGameOf(NHL.games, 401892535)?.m, 'ANA @ NYR');
  assert.equal(w.modelGameOf(NHL.games, '1'), undefined);
  const g = w.modelGameOf(NHL.games, boards[0].event);
  assert.deepEqual(g.p[0].o, [-190, 140]);
  assert.ok(g.p[0].ks.every(Number.isFinite));
  // (the page: the game view's props are the board's (model, propRows), and the preview (-110 assumed) is only for
  // a board with none of them)
  const dir = path.join(import.meta.dirname, '../libs/ranker/src/engine');
  const gl = fs.readFileSync(path.join(dir, 'account/wallet/game-lines.component.ts'), 'utf8');
  assert.match(gl, /readonly model = computed<BoardGame \| undefined>\(\(\) => this\.lines\.modelGame\(this\.sport, this\.event\)\)/);
  assert.match(gl, /readonly propRows = computed<PropRow\[\]>\(\(\) => \{\s*const g = this\.model\(\);[\s\S]{0,400}\(g\?\.p \?\? \[\]\)\.map\(\(x\) => this\.rowOf\(x, pickOf\(x\)\)\)/);
  assert.match(gl, /readonly previewWanted = computed\(\(\) => !this\.onlyPick\(\) && !this\.propRows\(\)\.length\)/);
  const ls = fs.readFileSync(path.join(dir, 'account/wallet/lines.service.ts'), 'utf8');
  assert.match(ls, /modelGame\(sport: string, event: string\): BoardGame \| undefined \{\s*return modelGameOf\(this\.modelAll\(\)\.get\(sport\)\?\.games, event\);/);
  // (and the dropdown's lines-only games are the rows on show's complement)
  const bp = fs.readFileSync(path.join(dir, 'book/book-page.component.ts'), 'utf8');
  assert.match(bp, /linesOnlyGames\(this\.lines\.boards\(\)\.values\(\), shownEvents\(this\.listed\)\)/);
});
