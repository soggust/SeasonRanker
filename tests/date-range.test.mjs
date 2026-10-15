// The bet lists' date ranges (libs/ranker/src/engine/bets/date-range.ts), shared by the Algorithm's dropdown and
// a user's Closed Bets: Today, Yesterday, This Month, This Year, All Time by the browser's calendar, and when a
// newest-first history loaded a page at a time holds the whole range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const r = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/date-range-entry.ts'), data: {} });
// (local times, so the tests read the same in any time zone)
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (...a) => at(...a).toISOString();

test('the five ranges, the Algorithm’s labels, in order', () => {
  assert.deepEqual(r.DATE_RANGES.map((x) => x.label), ['Today', 'Yesterday', 'This Month', 'This Year', 'All Time']);
  assert.ok(r.isDateRange('month'));
  assert.ok(!r.isDateRange('week'));
  assert.ok(!r.isDateRange(null));
});

test('today: local midnight to midnight', () => {
  const now = at(2026, 10, 15, 14);
  assert.ok(r.inRange('today', iso(2026, 10, 15, 0, 0), now));
  assert.ok(r.inRange('today', iso(2026, 10, 15, 23, 59), now));
  assert.ok(!r.inRange('today', iso(2026, 10, 14, 23, 59), now));
  assert.ok(!r.inRange('today', iso(2026, 10, 16, 0, 0), now));
  assert.ok(!r.inRange('today', iso(2025, 10, 15), now), 'the same day a year ago');
});

test('yesterday: the calendar’s day before, across a month’s and a year’s turn', () => {
  assert.ok(r.inRange('yesterday', iso(2026, 10, 14, 0, 0), at(2026, 10, 15, 9)));
  assert.ok(!r.inRange('yesterday', iso(2026, 10, 15, 0, 0), at(2026, 10, 15, 9)));
  assert.ok(!r.inRange('yesterday', iso(2026, 10, 13, 23, 59), at(2026, 10, 15, 9)));
  // (the 1st of a month: the last of the one before)
  assert.ok(r.inRange('yesterday', iso(2026, 9, 30, 20), at(2026, 10, 1, 8)));
  assert.ok(!r.inRange('yesterday', iso(2026, 10, 30, 20), at(2026, 10, 1, 8)));
  // (March 1st: February's last, in a leap year and not)
  assert.ok(r.inRange('yesterday', iso(2028, 2, 29), at(2028, 3, 1)));
  assert.ok(r.inRange('yesterday', iso(2026, 2, 28), at(2026, 3, 1)));
  // (New Year's Day: December 31st of the year before)
  assert.ok(r.inRange('yesterday', iso(2026, 12, 31, 22), at(2027, 1, 1, 10)));
  assert.ok(!r.inRange('yesterday', iso(2027, 12, 31, 22), at(2027, 1, 1, 10)));
  assert.ok(!r.inRange('yesterday', iso(2026, 1, 31), at(2027, 1, 1, 10)), 'the 31st of the wrong month');
});

test('this month and this year: from the 1st, and from January 1st', () => {
  const now = at(2026, 10, 15);
  assert.ok(r.inRange('month', iso(2026, 10, 1, 0, 0), now));
  assert.ok(r.inRange('month', iso(2026, 10, 31, 23), now));
  assert.ok(!r.inRange('month', iso(2026, 9, 30, 23, 59), now));
  assert.ok(!r.inRange('month', iso(2025, 10, 15), now));
  assert.ok(r.inRange('year', iso(2026, 1, 1, 0, 0), now));
  assert.ok(!r.inRange('year', iso(2025, 12, 31, 23, 59), now));
});

test('all time: everything, an unreadable date too; any other range: never an unreadable or missing one', () => {
  assert.ok(r.inRange('all', 'not a date'));
  assert.ok(r.inRange('all', undefined));
  for (const range of ['today', 'yesterday', 'month', 'year']) {
    assert.ok(!r.inRange(range, 'not a date'));
    assert.ok(!r.inRange(range, undefined));
  }
});

test('the range’s start: local midnight, yesterday’s across the turns', () => {
  assert.equal(r.rangeStart('all', at(2026, 10, 15)), null);
  assert.equal(r.rangeStart('today', at(2026, 10, 15, 14)).getTime(), at(2026, 10, 15, 0).getTime());
  assert.equal(r.rangeStart('yesterday', at(2026, 10, 1, 8)).getTime(), at(2026, 9, 30, 0).getTime());
  assert.equal(r.rangeStart('yesterday', at(2027, 1, 1, 8)).getTime(), at(2026, 12, 31, 0).getTime());
  assert.equal(r.rangeStart('month', at(2026, 10, 15)).getTime(), at(2026, 10, 1, 0).getTime());
  assert.equal(r.rangeStart('year', at(2026, 10, 15)).getTime(), at(2026, 1, 1, 0).getTime());
});

test('a newest-first history holds the range once its oldest loaded is before the range’s start', () => {
  const now = at(2026, 10, 15, 14);
  assert.ok(!r.pastRange('today', iso(2026, 10, 15, 0, 30), now), 'still today: the next page may have more');
  assert.ok(r.pastRange('today', iso(2026, 10, 14, 23, 59), now));
  assert.ok(!r.pastRange('yesterday', iso(2026, 10, 14, 1), now));
  assert.ok(r.pastRange('yesterday', iso(2026, 10, 13, 23), now));
  assert.ok(!r.pastRange('year', iso(2026, 1, 1, 0, 1), now));
  assert.ok(r.pastRange('year', iso(2025, 12, 31, 23), now));
  assert.ok(!r.pastRange('all', iso(2000, 1, 1), now), 'All Time pages on asking');
  assert.ok(!r.pastRange('today', undefined, now), 'nothing loaded yet');
});

test('Closed Bets: the settled bets in the range by their games’ dates, the pages loaded until it’s all here', () => {
  // (the wallet's settled history, the latest settled first, a page at a time; each settled after its game)
  const now = at(2026, 10, 15, 14);
  const bets = [
    { id: 'a', start: iso(2026, 10, 15, 12), settledAt: iso(2026, 10, 15, 13) },
    { id: 'b', start: iso(2026, 10, 14, 19), settledAt: iso(2026, 10, 15, 1) },
    { id: 'c', start: iso(2026, 10, 14, 13), settledAt: iso(2026, 10, 14, 17) },
    { id: 'd', start: iso(2026, 9, 30, 19), settledAt: iso(2026, 10, 1, 0) },
    { id: 'e', start: iso(2025, 12, 31, 19), settledAt: iso(2026, 1, 1, 1) },
  ];
  const shown = (range, loaded) => loaded.filter((b) => r.inRange(range, b.start, now)).map((b) => b.id);
  // (a page of two, then the next, as the wallet's effect asks while the range isn't covered)
  const pagesFor = (range) => {
    let n = 2;
    while (n < bets.length && !r.pastRange(range, bets[n - 1].settledAt, now)) n += 2;
    return Math.min(n, bets.length);
  };
  // (the first page's oldest settled today, after midnight: the next page could hold today's games too)
  assert.equal(pagesFor('today'), 4);
  assert.deepEqual(shown('today', bets.slice(0, pagesFor('today'))), ['a']);
  // (yesterday's game settled after midnight sits on the first page, yesterday's afternoon on the second)
  assert.equal(pagesFor('yesterday'), 4);
  assert.deepEqual(shown('yesterday', bets.slice(0, pagesFor('yesterday'))), ['b', 'c']);
  assert.deepEqual(shown('month', bets.slice(0, pagesFor('month'))), ['a', 'b', 'c']);
  // (New Year's Eve's game settled on the 1st: in last year, not this one)
  assert.deepEqual(shown('year', bets.slice(0, pagesFor('year'))), ['a', 'b', 'c', 'd']);
  assert.deepEqual(shown('all', bets), ['a', 'b', 'c', 'd', 'e']);
});
