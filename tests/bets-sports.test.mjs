// The Bets page's sport list (bet-sports.ts betSports): every sport the bettor covers that the site has, in the
// site's order; a sport not ready for everyone (devOnly: MMA) only behind the experimental gate (an admin, the dev
// server), so the owner sees the UFC picks and the public doesn't. And a fight's words in the game dropdown
// (game-menu.ts matchupName): "A vs B", the first-listed fighter (the matchup's home) first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'bets-entry.ts'), data: {} });

const SITE = [
  { id: 'nfl', label: 'NFL', devOnly: false },
  { id: 'mlb', label: 'MLB', devOnly: false },
  { id: 'nba', label: 'NBA', devOnly: false },
  { id: 'nhl', label: 'NHL', devOnly: false },
  { id: 'mma', label: 'MMA', devOnly: true },
];
const BETTABLE = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];

test('betSports: the public gets the four live sports, in the site\'s order, without MMA', () => {
  assert.deepEqual(
    bets.betSports(SITE, BETTABLE, false).map((s) => s.id),
    ['nfl', 'mlb', 'nba', 'nhl'],
  );
});

test('betSports: behind the experimental gate MMA is in, still in the site\'s order', () => {
  const list = bets.betSports(SITE, BETTABLE, true);
  assert.deepEqual(list.map((s) => s.id), ['nfl', 'mlb', 'nba', 'nhl', 'mma']);
  assert.deepEqual(list[4], { id: 'mma', label: 'MMA' });
});

test('betSports: a sport the bettor doesn\'t cover is out whatever the gate; a devOnly flag left off reads as live', () => {
  const site = [...SITE, { id: 'golf', label: 'Golf' }];
  assert.deepEqual(bets.betSports(site, BETTABLE, true).map((s) => s.id), ['nfl', 'mlb', 'nba', 'nhl', 'mma']);
  assert.deepEqual(bets.betSports([{ id: 'nhl', label: 'NHL' }], BETTABLE, false).map((s) => s.id), ['nhl']);
});

test('matchupName: a fight reads "A vs B", the first-listed fighter first; a game keeps its "away @ home"', () => {
  assert.equal(bets.matchupName('mma', 'Pereira @ Jones'), 'Jones vs Pereira');
  assert.equal(bets.matchupName('nfl', 'CLE @ TB'), 'CLE @ TB');
  assert.equal(bets.matchupName('mma', 'Jones'), 'Jones');
});

test('gameMenu: a UFC card\'s bouts group under the card\'s day like a game day, each bout named "A vs B"', () => {
  const days = bets.gameMenu(
    [
      { key: 'mma|Pereira @ Jones', sport: 'mma', matchup: 'Pereira @ Jones', start: '2026-10-18T02:00:00Z', count: 1 },
      { key: 'mma|Adesanya @ Strickland', sport: 'mma', matchup: 'Adesanya @ Strickland', start: '2026-10-18T01:30:00Z', count: null },
    ],
    SITE,
    'America/Chicago',
  );
  assert.equal(days.length, 1);
  assert.equal(days[0].day, 'Saturday, Oct 17');
  assert.deepEqual(days[0].sports.map((s) => s.name), ['MMA']);
  assert.deepEqual(days[0].sports[0].games.map((g) => g.label), ['Strickland vs Adesanya · 8:30 PM', 'Jones vs Pereira · 9:00 PM']);
  assert.deepEqual(days[0].sports[0].games.map((g) => g.name), ['Strickland vs Adesanya', 'Jones vs Pereira']);
  // (the key keeps the bettor's matchup: the page filters by it)
  assert.equal(days[0].sports[0].games[1].matchup, 'Pereira @ Jones');
});
