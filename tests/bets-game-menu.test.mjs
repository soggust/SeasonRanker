// The Bets page's game dropdown laid out (game-menu.ts gameMenu): a day each, in it a sport each (its icon once) by
// its first game that day, the site's order on a tie, and under each sport its games early to late, ties by
// matchup; the bot's picked games and the ones with lines alone in the same lists, a game both keeping its count.
// Times in Chicago's zone, so a late game lands on its own evening, not the next UTC day. Made-up games, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'bets-entry.ts'), data: {} });

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
