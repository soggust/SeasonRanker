// Bot Stats (libs/ranker/src/engine/book/bot-stats.ts; the owner, 2026-11-04: the Algorithm tab made everyone's,
// with charts): the units curve off the replay's day buckets and the live bets the record counts, its ticks, the
// run the Bot is on, the tables' bars on one scale, the last twenty as squares; and the page's pins (the tab named
// Bot Stats, everyone's; no Live / Staged switch, no replayed-or-live note; the research's panels an admin's)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

// (a replay file with two days in its LIKE bucket and one in its practice bucket, which the record never counts)
const file = (sport, through) => ({
  v: 1,
  sport,
  epoch: through,
  through,
  from: '2026-09-10T00:00:00Z',
  overall: { profit: -0.1 },
  daily: {
    cols: ['won', 'lost', 'push', 'staked', 'profit', 'beat', 'beatN', 'clv', 'vig'],
    bands: { medium: { '2026-10-01': '2,1,0,1.5,0.9,0,0,0,0', '2026-10-03': '0,2,0,1,-1,0,0,0,0' }, practice: { '2026-10-02': '5,0,0,2.5,2.3,0,0,0,0' } },
  },
});
const bet = (over) => ({ id: 'x', sport: 'nfl', start: '2026-10-20T17:00:00Z', gradedAt: '2026-10-20T21:00:00Z', status: 'won', profit: 0.5, units: 0.5, odds: -110, market: 'spread', pick: 'BUF -3', matchup: 'BUF @ KC', ...over });

test('the units curve: the record bands by day, then the live bets since the replay, running from 0; practice and tracked never in it', () => {
  const c = book.unitsCurve([file('nfl', '2026-10-10T00:00:00Z')], [bet(), bet({ id: 'y', topN: 1 }), bet({ id: 'z', intent: 'track', units: 0 }), bet({ id: 'w', start: '2026-10-05T17:00:00Z', gradedAt: '2026-10-05T21:00:00Z' })], null, 'all', Date.parse('2026-11-04T12:00:00Z'));
  assert.ok(c);
  assert.deepEqual(c.points.map((p) => p.day), ['start', '2026-10-01', '2026-10-03', '2026-10-20']);
  assert.deepEqual(c.points.map((p) => p.total), [0, 0.9, -0.1, 0.4]);
  assert.equal(c.profit, 0.4);
  assert.equal(c.bets, 6);
  assert.equal(c.solo, 'nfl', 'one sport: its line is the total');
  assert.equal(c.lines.length, 0);
  assert.ok(c.ticks.some((t) => t.value === 0), 'zero among the ticks');
  assert.ok(c.path.startsWith('M0.0,'));
  // (a range: only its days)
  const oct = book.unitsCurve([file('nfl', '2026-10-10T00:00:00Z')], [bet()], null, 'month', Date.parse('2026-10-25T12:00:00Z'));
  assert.deepEqual(oct.points.map((p) => p.day), ['start', '2026-10-01', '2026-10-03', '2026-10-20']);
  assert.equal(book.unitsCurve([], [], null, 'today', Date.parse('2026-11-04T12:00:00Z')), null, 'nothing: no chart');
});

test('every sport on show: a line each that adds up to the total at every day', () => {
  const c = book.unitsCurve([file('nfl', '2026-10-10T00:00:00Z'), file('nba', '2026-10-10T00:00:00Z')], [], null, 'all');
  assert.deepEqual(c.lines.map((l) => l.sport), ['nfl', 'nba']);
  for (const p of c.points) assert.ok(Math.abs(p.total - (p.by.nfl + p.by.nba)) < 1e-9);
  assert.equal(book.unitsCurve([file('nfl', '2026-10-10T00:00:00Z'), file('nba', '2026-10-10T00:00:00Z')], [], 'nba', 'all').lines.length, 0, 'one sport chosen: no split');
});

test("All time: the months before the days, then the days; what neither holds the opening point, so it ends on the record's units", () => {
  const f = { ...file('nfl', '2026-10-10T00:00:00Z'), overall: { profit: 3.9 }, monthly: { cols: ['won', 'lost', 'push', 'staked', 'profit'], to: '2026-10-01', bands: { medium: { '2026-09': '3,0,0,1.5,2' } } } };
  const c = book.unitsCurve([f], [], null, 'all');
  assert.deepEqual(c.points.map((p) => p.day), ['before', '2026-09', '2026-10-01', '2026-10-03']);
  assert.equal(c.points[0].total, 2, 'the record less the months and days drawn');
  assert.equal(c.profit, 3.9, "the end is the record's");
  assert.equal(c.from, '2026-09-09', "the span from the replay's first game (Eastern)");
  // (a range: the days alone, from zero)
  assert.equal(book.unitsCurve([f], [], null, 'month', Date.parse('2026-10-20T12:00:00Z')).points[0].day, 'start');
});

test('the ticks are clean steps; the hover finds the nearest day', () => {
  assert.equal(book.niceStep(37), 10);
  assert.equal(book.niceStep(7), 2);
  assert.deepEqual(book.niceTicks(-3, 12), [0, 5, 10]);
  const c = book.unitsCurve([file('nfl', '2026-10-10T00:00:00Z')], [], null, 'all');
  assert.equal(book.pointAt(c, 0).day, 'start');
  assert.equal(book.pointAt(c, 1).day, '2026-10-03');
  assert.equal(book.pointAt(c, 0.6).day, '2026-10-01');
});

test('the run, the bars and the form', () => {
  const s = (res, pending = false) => ({ res, pending, pick: 'p', sport: 'nfl', stake: 1, units: '+0.9u' });
  assert.deepEqual(book.streakOf([s(null, true), s('W'), s('P'), s('W'), s('L')]), { kind: 'W', n: 2 });
  assert.deepEqual(book.streakOf([]), { kind: null, n: 0 });
  const bars = book.barsOf([{ profit: 30 }, { profit: -10 }, { profit: 0 }]);
  assert.equal(bars.zero, 25);
  assert.deepEqual(bars.rows.map((r) => [r.left, r.width, r.up]), [[25, 75, true], [0, 25, false], [25, 0, true]]);
  assert.equal(book.barsOf([{ profit: 4 }, { profit: 2 }]).zero, 0, 'every row up: zero at the left edge');
  const f = book.squaresOf([s('W'), s('L'), s(null, true)]);
  assert.deepEqual(f.map((x) => x.res), ['W', 'L', null], 'newest first, on the left');
  assert.equal(book.winPctOf({ won: 3, lost: 1 }), 0.75);
  assert.equal(book.signedUnits(-4), '−4.0u');
});

test('the page: Bot Stats, everyone\'s; one record (no staged switch, no replayed note); the research panels an admin\'s', () => {
  const root = path.join(import.meta.dirname, '..', 'libs/ranker/src/engine/book');
  const page = fs.readFileSync(path.join(root, 'book-page.component.html'), 'utf8');
  assert.ok(page.includes('>Bot Stats</button>') && !page.includes('>Algorithm</button>'));
  const ts = fs.readFileSync(path.join(root, 'book-page.component.ts'), 'utf8');
  assert.ok(ts.includes('readonly botStats = (): boolean => true;'));
  const desk = fs.readFileSync(path.join(root, 'model-desk.component.html'), 'utf8');
  assert.ok(!desk.includes('stagedNames') && !desk.includes('rangeNote') && !desk.includes('desk-history-replay'));
  assert.ok(desk.includes('@if (checks.length && admin())') && desk.includes('trends.length && admin()'));
  assert.ok(desk.includes('class="bs-curve-wrap"') && !desk.includes('label="The Climb"') && desk.includes('class="bs-hero"'));
});

test("the record: the bets before the daily buckets by month and band, the record's alone (replay-record.mjs monthlyOf)", async () => {
  const { monthlyOf, dailyOf } = await import('../libs/ranker/scripts/model/replay-record.mjs');
  const at = (d) => Date.parse(d + 'T12:00:00Z');
  const b = (d, band, res, profit, extra = {}) => ({ t: at(d), band, res, units: 1, profit, ...extra });
  const bets = [b('2024-05-03', 'medium', 'W', 0.9), b('2024-05-20', 'medium', 'L', -1), b('2024-06-01', 'high', 'W', 1.8), b('2024-06-02', 'medium', 'W', 0.5, { practice: true }), b('2026-10-01', 'medium', 'W', 0.9)];
  const m = monthlyOf(bets, (x) => x.t);
  assert.equal(m.to, dailyOf(bets, (x) => x.t).from, 'up to where the days begin');
  assert.deepEqual(m.bands, { high: { '2024-06': '1,0,0,1,1.8' }, medium: { '2024-05': '1,1,0,2,-0.1' } }, 'never a practice pick, never the days');
  assert.deepEqual(monthlyOf([], (x) => x.t).bands, {});
});
