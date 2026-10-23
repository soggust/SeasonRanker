// A game off the bettor's own betting board (board.mjs's board.json) as the game view's GameBoard (wallet-math.ts
// modelGameBoard): a UFC card's bouts, each with its moneyline alone (no spread, no total, no props), every tile
// bettable with its Kelly score and band through the same game; and the dropdown listing the bouts under the
// card's day (game-menu.ts gameMenu) as "A vs B". The fixture is built by board.mjs itself, so its shape is the
// file's. Made-up bouts, no network; times in Chicago's zone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';
import { boardMarkets, buildBoard } from '../libs/ranker/scripts/model/board.mjs';

const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/wallet-entry.ts'), data: {} });
const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

const NOW = new Date('2026-10-17T20:00:00Z');
const TZ = 'America/Chicago';
// (a bout as the desk keys it: the first-listed fighter the home, the moneyline its one market)
const bout = (id, date, away, home, homeOdds, awayOdds, homeModel) => ({
  game: { id, date, awayAbbr: away[0], homeAbbr: home[0], away: away[1], home: home[1] },
  markets: [
    {
      market: 'ml',
      sides: [
        { side: 'home', line: null, odds: homeOdds, model: homeModel, fair: 0.5 },
        { side: 'away', line: null, odds: awayOdds, model: 1 - homeModel, fair: 0.5 },
      ],
    },
  ],
});
const card = [
  bout('401897388', '2026-10-18T02:45:00Z', ['Mike Malott', '3165120'], ['Joaquin Buckley', '4024714'], 114, -135, 0.53),
  bout('401897389', '2026-10-18T02:15:00Z', ['Fighter A', '1'], ['Fighter B', '2'], -180, 150, 0.6),
  bout('401897390', '2026-10-18T01:45:00Z', ['Fighter C', '3'], ['Fighter D', '4'], 100, -120, 0.5),
];
const games = new Map(card.map((b) => [b.game.id, { game: b.game, markets: boardMarkets(b.markets, () => 0.5), at: NOW.toISOString() }]));
const board = buildBoard('mma', { games, now: NOW });

test('board.json for a card: each bout its moneyline alone, both sides priced with a Kelly score and a band, no props', () => {
  assert.equal(board.sport, 'mma');
  assert.deepEqual(
    board.games.map((g) => g.m),
    ['Fighter C @ Fighter D', 'Fighter A @ Fighter B', 'Mike Malott @ Joaquin Buckley'],
  );
  for (const g of board.games) {
    assert.deepEqual(Object.keys(g.k), ['ml']);
    assert.deepEqual(g.p, []);
    assert.deepEqual(g.k.ml.map((s) => s.s), ['home', 'away']);
    for (const s of g.k.ml) {
      assert.equal(s.l, null);
      assert.ok(Number.isFinite(s.o) && Number.isFinite(s.ks) && ['lock', 'high', 'medium', 'low'].includes(s.b), JSON.stringify(s));
    }
  }
});

test('modelGameBoard: a bout as a GameBoard: the moneyline alone, the fighters with their headshots, not begun, bettable', () => {
  const g = board.games.find((x) => x.id === '401897388');
  const b = w.modelGameBoard('mma', g, NOW.getTime());
  assert.equal(b.event, '401897388');
  assert.equal(b.matchup, 'Mike Malott @ Joaquin Buckley');
  assert.equal(b.start, '2026-10-18T02:45:00Z');
  assert.equal(b.state, 'pre');
  assert.equal(b.book, 'DraftKings');
  assert.equal(b.spread, null);
  assert.equal(b.total, null);
  assert.deepEqual(b.ml, {
    away: { market: 'ml', side: 'away', line: null, odds: -135 },
    home: { market: 'ml', side: 'home', line: null, odds: 114 },
  });
  assert.deepEqual(b.away, { abbr: 'Mike Malott', name: 'Mike Malott', logo: 'https://a.espncdn.com/i/headshots/mma/players/full/3165120.png', score: null });
  assert.equal(b.home.logo, 'https://a.espncdn.com/i/headshots/mma/players/full/4024714.png');
  assert.ok(w.bettable(b.start, b.state, NOW.getTime()));
  // (the bets' words off the board's matchup: the fighter's moneyline)
  assert.equal(w.pickWords(b.ml.home, b.matchup), 'Joaquin Buckley ML');
  assert.equal(w.pickWords(b.ml.away, b.matchup), 'Mike Malott ML');
  // (the game view finds each side's Kelly score and band on the same game: the side's s and l match the price's)
  for (const p of [b.ml.away, b.ml.home]) {
    const side = g.k.ml.find((s) => s.s === p.side && s.l === p.line);
    assert.ok(side && side.o === p.odds, p.side);
  }
});

test('modelGameBoard: a bout begun is under way and not bettable; a team game keeps its spread and total, no picture of its own; nothing priced, null', () => {
  const g = board.games.find((x) => x.id === '401897390');
  const later = w.modelGameBoard('mma', g, Date.parse('2026-10-18T01:50:00Z'));
  assert.equal(later.state, 'in');
  assert.ok(!w.bettable(later.start, later.state, Date.parse('2026-10-18T01:50:00Z')));
  const team = w.modelGameBoard(
    'nhl',
    {
      id: '401892520',
      start: '2026-10-17T23:30Z',
      m: 'CAR @ WPG',
      a: ['CAR', '7'],
      h: ['WPG', '28'],
      k: {
        spread: [{ s: 'home', l: 1.5, o: -154 }, { s: 'away', l: -1.5, o: 130 }],
        total: [{ s: 'over', l: 6.5, o: 110 }, { s: 'under', l: 6.5, o: -130 }],
        ml: [{ s: 'home', l: null, o: 170 }, { s: 'away', l: null, o: -204 }],
      },
    },
    NOW.getTime(),
  );
  assert.deepEqual(team.spread, { away: { market: 'spread', side: 'away', line: -1.5, odds: 130 }, home: { market: 'spread', side: 'home', line: 1.5, odds: -154 } });
  assert.deepEqual(team.total, { over: { market: 'total', side: 'over', line: 6.5, odds: 110 }, under: { market: 'total', side: 'under', line: 6.5, odds: -130 } });
  assert.equal(team.ml.home.odds, 170);
  assert.equal(team.away.logo, null);
  assert.equal(w.modelGameBoard('mma', { id: '1', start: '2026-10-18T02:00:00Z', m: 'A @ B', a: ['A', '1'], h: ['B', '2'], k: {} }, NOW.getTime()), null);
});

test("the dropdown: the card's bouts under the card's day as A vs B, early to late, the picked one with its count", () => {
  const boards = board.games.map((g) => w.modelGameBoard('mma', g, NOW.getTime()));
  // (as the Book lists them: the bot's picked bout from its rows, the rest from the boards, lines only)
  const picked = { key: 'mma|Mike Malott @ Joaquin Buckley', sport: 'mma', matchup: 'Mike Malott @ Joaquin Buckley', start: '2026-10-18T02:45:00Z', count: 1 };
  const lines = boards.filter((b) => b.event !== '401897388').map((b) => ({ key: `${b.sport}|${b.matchup}|${b.event}`, sport: b.sport, matchup: b.matchup, start: b.start, count: null }));
  const days = bets.gameMenu([picked, ...lines], [{ id: 'nfl', label: 'NFL' }, { id: 'mma', label: 'MMA' }], TZ);
  assert.equal(days.length, 1);
  assert.equal(days[0].day, 'Saturday, Oct 17');
  assert.deepEqual(days[0].sports.map((s) => s.name), ['MMA']);
  assert.deepEqual(
    days[0].sports[0].games.map((g) => `${g.label}${g.count === null ? ' lines' : ` (${g.count})`}`),
    ['Fighter D vs. Fighter C · 8:45 PM lines', 'Fighter B vs. Fighter A · 9:15 PM lines', 'Joaquin Buckley vs. Mike Malott · 9:45 PM (1)'],
  );
});
