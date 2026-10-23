// The Book's sport list (bet-sports.ts betSports): every sport the bettor covers that the site has, in the
// site's order; a sport not ready for everyone (devOnly: MMA) only behind the experimental gate (an admin, the dev
// server), so the owner sees the UFC picks and the public doesn't. And a fight's words in the game dropdown
// (game-menu.ts matchupName): "A vs B", the first-listed fighter (the matchup's home) first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

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
  assert.equal(bets.matchupName('mma', 'Pereira @ Jones'), 'Jones vs. Pereira');
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
  assert.deepEqual(days[0].sports[0].games.map((g) => g.label), ['Strickland vs. Adesanya · 8:30 PM', 'Jones vs. Pereira · 9:00 PM']);
  assert.deepEqual(days[0].sports[0].games.map((g) => g.name), ['Strickland vs. Adesanya', 'Jones vs. Pereira']);
  // (the key keeps the bettor's matchup: the page filters by it)
  assert.equal(days[0].sports[0].games[1].matchup, 'Pereira @ Jones');
});

// The admin flag arriving after the picks (book-rows.ts): MMA's rows join the page once, the sports already on it
// untouched; the flag gone, MMA's rows go
const pick = (sport, matchup, pick, score, extra = {}) => ({
  id: `${sport}:${matchup}:${pick}`, sport, score, chance: 60, level: 'high', kind: 'spread', market: 'Spread', pick, line: -3, odds: -110, book: 'DraftKings',
  start: '2026-10-18T20:00:00Z', matchup, teams: [], where: null, reason: 'why', p: 0.6, edge: true, why: { price: -110 }, ...extra,
});
const NFL = { at: '2026-10-17T10:00:00Z', picks: [pick('nfl', 'CHI @ GB', 'GB -3', 0.05), pick('nfl', 'DAL @ PHI', 'PHI -4', 0.02)], checks: [], record: { byLevel: { high: { wins: 3, losses: 1 } } } };
const MMA = { at: '2026-10-17T12:00:00Z', picks: [pick('mma', 'Pereira @ Jones', 'Jones', 0.03, { kind: 'moneyline', market: 'Moneyline' })], checks: [pick('mma', 'A @ B', 'B', 0, { level: 'check', gap: 8 })] };

test('mergeSportRows: a dev-only sport\'s rows join the page once, after the flag flips, the loaded sports\' rows as they were', () => {
  const places = new Map();
  let rows = bets.mergeSportRows([], 'nfl', bets.fileRows('nfl', NFL, places));
  assert.deepEqual(rows.map((r) => r.pickId), ['nfl:CHI @ GB:GB -3', 'nfl:DAL @ PHI:PHI -4']);
  const nflIds = rows.map((r) => r.id);
  // (the flag flips: MMA's file read and joined)
  rows = bets.mergeSportRows(rows, 'mma', bets.fileRows('mma', MMA, places));
  assert.deepEqual(rows.map((r) => r.sport).sort(), ['mma', 'mma', 'nfl', 'nfl']);
  // (the NFL's rows keep their ids (an open row stays open), MMA's come after them, every id its own)
  assert.deepEqual(rows.filter((r) => r.sport === 'nfl').map((r) => r.id), nflIds);
  assert.equal(new Set(rows.map((r) => r.id)).size, 4);
  assert.ok(rows.filter((r) => r.sport === 'mma').every((r) => r.id > Math.max(...nflIds)));
  // (the board's order: the CHECK under the LOCKs and over the bets)
  assert.deepEqual(rows.map((r) => r.confidence), ['lock', 'check', 'high', 'high']);
  assert.equal(rows[1].check, true);
  // (the same file again (the flag or the page asking twice): no doubles)
  const again = bets.mergeSportRows(rows, 'mma', bets.fileRows('mma', MMA, places));
  assert.deepEqual(again.map((r) => r.pickId).sort(), rows.map((r) => r.pickId).sort());
  assert.equal(again.length, 4);
});

test('dropSportRows: the flag gone, the sport\'s rows go and the rest stay', () => {
  const places = new Map();
  const rows = bets.mergeSportRows(bets.mergeSportRows([], 'nfl', bets.fileRows('nfl', NFL, places)), 'mma', bets.fileRows('mma', MMA, places));
  const left = bets.dropSportRows(rows, 'mma');
  assert.deepEqual(left.map((r) => r.sport), ['nfl', 'nfl']);
  // (an unread file: nothing joins)
  assert.equal(bets.mergeSportRows(left, 'mlb', bets.fileRows('mlb', null, places)).length, 2);
});

test('gameMenu: a late sport\'s bouts reach the dropdown once its rows are on the page', () => {
  const places = new Map();
  const rows = bets.mergeSportRows(bets.mergeSportRows([], 'nfl', bets.fileRows('nfl', NFL, places)), 'mma', bets.fileRows('mma', MMA, places));
  const games = rows.filter((r) => !r.check).map((r) => ({ key: `${r.sport}|${r.game.matchup}`, sport: r.sport, matchup: r.game.matchup, start: r.game.kickoff, count: 1 }));
  const days = bets.gameMenu(games, SITE, 'America/Chicago');
  assert.deepEqual(days.flatMap((d) => d.sports.map((s) => s.name)), ['NFL', 'MMA']);
  assert.deepEqual(days[0].sports[1].games.map((g) => g.name), ['Jones vs. Pereira']);
});
