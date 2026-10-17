// The bot's recent form in each sport's picks.json (picks.mjs recentOf, buildPicks's recent): over its graded placed
// bets only (a tracked row, an open or a void one never), the last seven US Eastern days a day at a time in the
// tally's shape, the week's record and units, the current streak with its bets' settled times and the time of
// the bet that broke it, and the last five settled bets, the latest first. The page's side: book-recent-form.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPicks, recentOf } from '../libs/ranker/scripts/model/picks.mjs';
import { buildFightPicks } from '../libs/ranker/scripts/model/mma-desk.mjs';

// (Saturday Oct 17, 2026, 3pm Eastern)
const NOW = new Date('2026-10-17T19:00:00Z');
let id = 0;
const bet = (status, gradedAt, over = {}) => ({
  id: `b${++id}`,
  event: '1',
  sport: 'nfl',
  start: '2026-10-12T17:00Z',
  matchup: 'NYJ @ NE',
  market: 'total',
  side: 'over',
  line: 44.5,
  odds: -110,
  intent: 'edge',
  units: 1,
  status,
  profit: status === 'won' ? 0.91 : status === 'lost' ? -1 : 0,
  pick: 'Over 44.5',
  gradedAt,
  ...over,
});
const ledger = {
  bets: [
    bet('won', '2026-10-17T04:00:00Z'),
    bet('won', '2026-10-16T04:00:00Z', { market: 'prop', player: 'Garrett Wilson', pick: 'Garrett Wilson Over 4.5 Receptions', units: 0.5, profit: 0.45 }),
    bet('push', '2026-10-15T20:00:00Z'),
    bet('lost', '2026-10-14T20:00:00Z'),
    bet('won', '2026-10-13T20:00:00Z'),
    bet('lost', '2026-10-12T20:00:00Z'),
    // (eight days back in Eastern time: out of the week, still in the streak's reach and the history)
    bet('won', '2026-10-09T20:00:00Z'),
    // (never counted: a tracked row, a void bet, an open one)
    bet('won', '2026-10-17T05:00:00Z', { intent: 'track', units: 0, profit: 0, trackUnits: 1 }),
    bet('push', '2026-10-17T06:00:00Z', { void: true }),
    { ...bet('open', null), start: '2026-10-19T00:15Z', profit: undefined },
  ],
};

test('recentOf: the week a day at a time and in all, the streak to the loss that broke it, the last five latest first', () => {
  const r = recentOf('nfl', ledger.bets, NOW);
  // (Oct 17 04:00Z is the 17th's midnight in Eastern: the 17th, Oct 16 04:00Z the 16th)
  assert.deepEqual(r.days['2026-10-17'], [1, 0, 0, 1, 0.91]);
  assert.deepEqual(r.days['2026-10-16'], [1, 0, 0, 0.5, 0.45]);
  assert.equal(r.days['2026-10-09'], undefined);
  assert.deepEqual(r.week, { won: 3, lost: 2, push: 1, profit: 0.27 });
  assert.equal(r.streak, 'W2');
  assert.deepEqual(r.streakAt, ['2026-10-17T04:00:00Z', '2026-10-16T04:00:00Z']);
  assert.equal(r.brokeAt, '2026-10-14T20:00:00Z');
  assert.deepEqual(
    r.last.map((b) => `${b.res} ${b.pick} ${b.units}`),
    ['W Over 44.5 0.91', 'W Garrett Wilson Over 4.5 Receptions 0.45', 'P Over 44.5 0', 'L Over 44.5 -1', 'W Over 44.5 0.91'],
  );
  assert.deepEqual(r.last[1], { sport: 'nfl', pick: 'Garrett Wilson Over 4.5 Receptions', matchup: 'NYJ @ NE', market: 'prop', player: 'Garrett Wilson', res: 'W', units: 0.45, at: '2026-10-16T04:00:00Z' });
  assert.equal(r.last[0].player, null);
});

test('recentOf: nothing graded, an empty block', () => {
  assert.deepEqual(recentOf('nba', [], NOW), { days: {}, week: { won: 0, lost: 0, push: 0, profit: 0 }, streak: null, streakAt: [], brokeAt: null, last: [] });
});

test('buildPicks and buildFightPicks write the recent block into picks.json', () => {
  const out = buildPicks('nfl', structuredClone(ledger), {}, new Map(), NOW);
  assert.equal(out.recent.streak, 'W2');
  assert.equal(out.recent.last.length, 5);
  const fight = { ...bet('won', '2026-10-17T03:00:00Z'), sport: 'mma', market: 'ml', side: 'home', matchup: 'Smith vs Jones', pick: 'Jones', fighters: { away: { name: 'Smith', id: 1 }, home: { name: 'Jones', id: 2 } } };
  const mma = buildFightPicks({ bets: [fight] }, {}, new Map(), NOW);
  assert.deepEqual(mma.recent.last.map((b) => [b.sport, b.market, b.player, b.res]), [['mma', 'moneyline', 'Jones', 'W']]);
});
