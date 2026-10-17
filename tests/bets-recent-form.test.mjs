// The Book's recent form (recent-form.ts recentForm): the user's last seven days from the settler's tally (the
// days in US Eastern), the streak and the last five settled bets from the history on hand; none without a tally
// or anything settled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const bets = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'bets-entry.ts'), data: {} });

// (Saturday Oct 17, 2026, 3pm Eastern)
const NOW = Date.parse('2026-10-17T19:00:00Z');
const day = (won, lost, push, staked, profit) => [won, lost, push, staked, profit];
const tally = {
  all: { won: 40, lost: 30, push: 2, void: 0, staked: 90, profit: 12 },
  days: {
    '2026-10-17': day(1, 0, 0, 1, 0.91),
    '2026-10-15': day(2, 1, 0, 3, 1.2),
    '2026-10-11': day(1, 2, 1, 4, -1.1),
    // (eight days back: out of the window)
    '2026-10-09': day(5, 0, 0, 5, 5),
  },
};
const bet = (id, status, over = {}) => ({
  id,
  sport: 'nhl',
  event: '1',
  matchup: 'NYR @ BOS',
  start: '2026-10-16T23:00:00Z',
  market: 'total',
  side: 'over',
  line: 6.5,
  odds: -110,
  stake: 1,
  pick: 'Over 6.5',
  run: 0,
  placedAt: '2026-10-16T20:00:00Z',
  status,
  settledAt: `2026-10-${id}T03:00:00Z`,
  profit: status === 'won' ? 0.91 : status === 'lost' ? -1 : 0,
  ...over,
});

test('recentForm: the last seven days summed from the tally, the units signed, nothing older counted', () => {
  const f = bets.recentForm(tally, [], NOW);
  assert.equal(f.record, '4–3–1');
  assert.equal(f.units, '+1.01u');
  assert.equal(f.up, true);
  assert.equal(f.streak, '–');
  assert.deepEqual(f.last, []);
});

test('recentForm: the streak and the last five from the settled bets on hand, the latest first, a void left out', () => {
  const settled = [bet('17', 'won'), bet('16', 'won'), bet('15', 'push'), bet('14', 'won'), bet('13', 'lost'), bet('12', 'void'), bet('11', 'won'), bet('10', 'lost')];
  const f = bets.recentForm(tally, settled, NOW);
  assert.equal(f.streak, 'W3');
  assert.deepEqual(
    f.last.map((b) => `${b.res} ${b.pick} ${b.units}`),
    ['W Over 6.5 +0.91u', 'W Over 6.5 +0.91u', 'P Over 6.5 0.00u', 'W Over 6.5 +0.91u', 'L Over 6.5 −1.00u'],
  );
  assert.equal(f.last[0].game, 'NHL · NYR @ BOS');
});

test('recentForm: a losing streak, a parlay named by its legs, and a quiet week with history still shown', () => {
  const settled = [bet('17', 'lost', { kind: 'parlay', legs: [{}, {}], sport: 'parlay', matchup: '' }), bet('16', 'lost'), bet('15', 'won')];
  const f = bets.recentForm({ all: tally.all, days: {} }, settled, NOW);
  assert.equal(f.record, '0–0');
  assert.equal(f.units, '0.00u');
  assert.equal(f.streak, 'L2');
  assert.equal(f.last[0].pick, '2-leg parlay');
  assert.equal(f.last[0].game, 'Parlay');
});

test('recentForm: none without a tally, or with nothing settled this week and nothing on hand', () => {
  assert.equal(bets.recentForm(null, [bet('17', 'won')], NOW), null);
  assert.equal(bets.recentForm({ all: tally.all, days: {} }, [], NOW), null);
});
