// The Book's game dropdown laid out (game-menu.ts gameMenu): a day each, in it a sport each (its icon once) by
// its first game that day, the site's order on a tie, and under each sport its games early to late, ties by
// matchup; the bot's picked games and the ones with lines alone in the same lists, a game both keeping its count.
// Times in Chicago's zone, so a late game lands on its own evening, not the next UTC day. Made-up games, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

const SPORTS = [
  { id: 'nfl', label: 'NFL' },
  { id: 'mlb', label: 'MLB' },
  { id: 'nba', label: 'NBA' },
  { id: 'nhl', label: 'NHL' },
];
const TZ = 'America/Chicago';
const game = (sport, matchup, start, count = null, over = {}) => ({ key: `${sport}|${matchup}`, sport, matchup, start, count, ...over });
// (each day as "Day: SPORT [games]" for a short compare)
const shape = (days) => days.map((d) => `${d.day}: ${d.sports.map((s) => `${s.name}[${s.games.map((g) => g.label + (g.count === null ? ' lines' : ` (${g.count})`)).join(', ')}]`).join(' ')}`);

test('gameMenu: days in order, sports by their first game, each sport its games early to late', () => {
  const days = bets.gameMenu(
    [
      // (Tuesday Oct 13, Central: the NHL's 6 PM before MLB's 7 PM, the NBA's at 7 too but after MLB in the site's order)
      game('mlb', 'CLE @ TB', '2026-10-14T00:05:00Z', 3),
      game('nhl', 'BOS @ NYR', '2026-10-13T23:00:00Z'),
      game('nba', 'LAL @ GSW', '2026-10-14T02:30:00Z', 2),
      game('nba', 'BOS @ NYK', '2026-10-14T00:05:00Z'),
      game('nhl', 'EDM @ VAN', '2026-10-14T02:00:00Z', 1),
      // (Wednesday)
      game('mlb', 'LAD @ NYM', '2026-10-14T23:08:00Z'),
      game('nfl', 'TB @ DAL', '2026-10-15T00:15:00Z', 5),
    ],
    SPORTS,
    TZ,
  );
  assert.deepEqual(shape(days), [
    'Tuesday, Oct 13: NHL[BOS @ NYR · 6:00 PM lines, EDM @ VAN · 9:00 PM (1)] MLB[CLE @ TB · 7:05 PM (3)] NBA[BOS @ NYK · 7:05 PM lines, LAL @ GSW · 9:30 PM (2)]',
    'Wednesday, Oct 14: MLB[LAD @ NYM · 6:08 PM lines] NFL[TB @ DAL · 7:15 PM (5)]',
  ]);
  assert.deepEqual(days[0].sports.map((s) => s.icon), ['sports_hockey', 'sports_baseball', 'sports_basketball']);
  assert.equal(days[1].sports[1].icon, 'sports_football');
});

test('gameMenu: games at the same time by matchup; a game picked and on the boards once, with its count', () => {
  const at = '2026-10-13T23:10:00Z';
  const days = bets.gameMenu(
    [
      game('mlb', 'SEA @ HOU', at),
      game('mlb', 'CLE @ TB', at),
      game('mlb', 'NYY @ BOS', at, 4),
      // (the same game again, lines only: it stays picked, with its 4)
      game('mlb', 'NYY @ BOS', at),
      // (and the other way round: picked after its lines)
      game('mlb', 'CLE @ TB', at, 2),
    ],
    SPORTS,
    TZ,
  );
  assert.deepEqual(shape(days), ['Tuesday, Oct 13: MLB[CLE @ TB · 6:10 PM (2), NYY @ BOS · 6:10 PM (4), SEA @ HOU · 6:10 PM lines]']);
});

test('gameMenu: a pick with no kickoff on its date alone (its noon, on that day); nothing to show, no days', () => {
  const days = bets.gameMenu([game('nfl', 'KC @ BUF', null, 2, { date: '2026-10-18' }), game('nfl', 'CHI @ GB', '2026-10-20T00:15:00Z', 1)], SPORTS, TZ);
  assert.deepEqual(shape(days), ['Sunday, Oct 18: NFL[KC @ BUF (2)]', 'Monday, Oct 19: NFL[CHI @ GB · 7:15 PM (1)]']);
  assert.equal(days[0].sports[0].games[0].time, null);
  assert.deepEqual(bets.gameMenu([], SPORTS, TZ), []);
  // (a game with neither: left out, not a NaN day)
  assert.deepEqual(bets.gameMenu([game('nfl', 'KC @ BUF', null, 1)], SPORTS, TZ), []);
});

test("gameMenu: a series' games on consecutive days each their own (lines-only keyed by event); two of a key, the picked then the earlier", () => {
  const tue = '2026-10-13T23:08:00Z';
  const wed = '2026-10-14T23:08:00Z';
  const days = bets.gameMenu(
    [
      // (Wednesday's board read first: both still listed, each on its own day)
      game('mlb', 'CLE @ TB', wed, null, { key: 'mlb|CLE @ TB|402' }),
      game('mlb', 'CLE @ TB', tue, null, { key: 'mlb|CLE @ TB|401' }),
    ],
    SPORTS,
    TZ,
  );
  assert.deepEqual(shape(days), ['Tuesday, Oct 13: MLB[CLE @ TB · 6:08 PM lines]', 'Wednesday, Oct 14: MLB[CLE @ TB · 6:08 PM lines]']);
  assert.deepEqual(
    days.map((d) => d.sports[0].games[0].key),
    ['mlb|CLE @ TB|401', 'mlb|CLE @ TB|402'],
  );
  // (the same key twice, Wednesday's met first: Tuesday's kept; a picked one over an earlier one's lines alone)
  assert.deepEqual(shape(bets.gameMenu([game('mlb', 'CLE @ TB', wed), game('mlb', 'CLE @ TB', tue)], SPORTS, TZ)), ['Tuesday, Oct 13: MLB[CLE @ TB · 6:08 PM lines]']);
  assert.deepEqual(shape(bets.gameMenu([game('mlb', 'CLE @ TB', tue), game('mlb', 'CLE @ TB', wed, 2)], SPORTS, TZ)), ['Wednesday, Oct 14: MLB[CLE @ TB · 6:08 PM (2)]']);
});

// The ticker's sides (bet-format.ts tickerSide; the owner's notes, 2026-10-17): a team's logo and its short name
// beside it (its abbreviation when the board has no short name); a fighter's board headshot, round, his last name
test('the ticker shows a team logo or a fighter\'s face, the words behind it', () => {
  const det = bets.tickerSide('nfl', { abbr: 'DET', name: 'Detroit Lions', short: 'Lions', logo: null });
  assert.equal(det.label, 'Lions');
  assert.equal(bets.tickerSide('nhl', { abbr: 'WPG', name: 'Winnipeg Jets', logo: null }).label, 'WPG');
  assert.equal(det.face, false);
  assert.match(det.pic, /teamlogos\/nfl\/500-dark\/det\.png/);
  const shot = 'https://a.espncdn.com/i/headshots/mma/players/full/1.png';
  assert.deepEqual(bets.tickerSide('mma', { abbr: 'Joaquin Buckley', name: 'Joaquin Buckley', logo: shot }), { label: 'Buckley', pic: shot, face: true });
  assert.deepEqual(bets.tickerSide('mma', { abbr: 'Malott', name: '', logo: null }), { label: 'Malott', pic: null, face: true });
});

// A game view's columns (bet-format.ts boardColumns) and a fight's round totals (totalTop on the tile, legWords on the ticket): the
// owner's notes, 2026-10-17
test("a game shows only its priced markets, and a fight's total reads Over 2.5 on its tile, its rounds on the ticket", () => {
  const p = (odds) => ({ odds });
  assert.deepEqual(bets.boardColumns({ spread: null, total: { over: p(-120), under: p(100) }, ml: { away: p(150), home: p(-170) } }), ['total', 'ml']);
  assert.deepEqual(bets.boardColumns({ spread: { away: p(null), home: p(null) }, total: null, ml: { away: p(150), home: p(-170) } }), ['ml']);
  assert.deepEqual(bets.boardColumns({ spread: { away: p(-110), home: p(-110) }, total: { over: p(-110), under: p(-110) }, ml: { away: p(150), home: p(-170) } }), ['spread', 'total', 'ml']);
  assert.equal(bets.totalTop('mma', 'over', 2.5), 'Over 2.5');
  assert.equal(bets.totalTop('mma', 'under', 1.5), 'Under 1.5');
  assert.equal(bets.totalTop('nfl', 'over', 47.5), 'O 47.5');
  assert.equal(bets.legWords({ sport: 'mma', market: 'total', pick: 'Over 2.5' }), 'Over 2.5 rounds');
  assert.equal(bets.legWords({ sport: 'mma', market: 'total', pick: 'Under 2.5 rounds' }), 'Under 2.5 rounds');
  assert.equal(bets.legWords({ sport: 'nfl', market: 'total', pick: 'Over 47.5' }), 'Over 47.5');
  assert.equal(bets.legWords({ sport: 'mma', market: 'ml', pick: 'Buckley ML' }), 'Buckley ML');
});
