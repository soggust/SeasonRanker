// A bout's markets in the other books' order and the props by Kelly score (the owner, 2026-10-26): a fight's
// moneyline before its rounds on the game view's grid (bet-format.ts boardColumns with the sport) and on the
// Algorithm tab's game section (marketRank); the game view's player props the highest K score first (byPropKelly),
// a row with no K score last, ties in the order they came.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const p = (odds) => ({ odds });

test("a fight's moneyline comes before its rounds; a team game keeps spread, total, moneyline", () => {
  const fight = { spread: null, total: { over: p(-120), under: p(100) }, ml: { away: p(150), home: p(-170) } };
  assert.deepEqual(bets.boardColumns(fight, 'mma'), ['ml', 'total']);
  assert.deepEqual(bets.boardColumns(fight), ['total', 'ml']);
  const full = { spread: { away: p(-110), home: p(-110) }, total: { over: p(-110), under: p(-110) }, ml: { away: p(150), home: p(-170) } };
  assert.deepEqual(bets.boardColumns(full, 'nfl'), ['spread', 'total', 'ml']);
  assert.deepEqual(bets.boardColumns({ spread: null, total: null, ml: { away: p(150), home: p(-170) } }, 'mma'), ['ml']);
  const order = (sport) => ['spread', 'total', 'ml'].sort((a, b) => bets.marketRank(sport, a) - bets.marketRank(sport, b));
  assert.deepEqual(order('mma'), ['ml', 'total', 'spread']);
  assert.deepEqual(order('nba'), ['total', 'ml', 'spread']);
  assert.equal(bets.marketRank('nfl', 'prop'), 9);
});

test('props by K score: the best side of each row, highest first, none last, ties as they came', () => {
  const row = (key, ...ks) => ({ key, sides: ks.map((kelly) => ({ kelly })) });
  const rows = [row('a', 0.01, null), row('b', null, null), row('c', -0.02, 0.05), row('d', 0.05, -0.1), row('e', -0.03, -0.01)];
  assert.equal(bets.propKelly(rows[1]), null);
  assert.equal(bets.propKelly(rows[2]), 0.05);
  const sorted = bets.byPropKelly(rows);
  assert.deepEqual(sorted.map((r) => r.key), ['c', 'd', 'a', 'e', 'b']);
  // (a new list: the rows given unchanged)
  assert.deepEqual(rows.map((r) => r.key), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(bets.byPropKelly([]), []);
});
