// "Beat the close" as the market's move (DECISIONS.md D106): whether the market went the bet's way from the bet to
// the close (the line toward it, or the no-vig chance of its side up), ties for no move. The bettor's (clv.mjs moveOf,
// moveSummary; replay-record.mjs fairMoveOf, the tallies and the daily buckets) and the page's (desk-math.ts moveOf,
// replay-history.ts moveText, moveTip, botHistoryOf). The old share (the bet's own price against the close's fair:
// clv.beat, beatText) stays apart for what reads it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CLV_TIE, clvOf, clvSummary, moveOf, moveSummary } from '../libs/ranker/scripts/model/clv.mjs';
import { DAILY_COLS, MOVE_TIE, addBet, dailyOf, emptyTally, fairMoveOf } from '../libs/ranker/scripts/model/replay-record.mjs';
import { loadEngine } from './support/engine.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

test('moveOf: the fair from the bet to the close at the same line; a moved line by its own way; ties for no move', () => {
  // (a shopped price better than the close's fair while the market moved away: the old share's beat, the move against)
  const shopped = { market: 'prop', side: 'under', line: 0.5, odds: 100, fair: 0.5 };
  const c = clvOf(shopped, { line: 0.5, odds: -115, fair: 0.4951 }, null);
  assert.equal(c.beat, true, 'its price beat the close');
  assert.deepEqual(moveOf({ ...shopped, clv: c }), { dir: -1, by: -0.0049 }, 'the market moved against it');
  // (toward, and a tie at CLV_TIE or less)
  assert.equal(moveOf({ fair: 0.5, clv: { pts: 0, q: 0.52 } }).dir, 1);
  assert.equal(moveOf({ fair: 0.5, clv: { pts: 0, q: 0.5 + CLV_TIE / 2 } }).dir, 0);
  assert.equal(moveOf({ fair: 0.5, clv: { pts: null, q: 0.47 } }).dir, -1, 'a moneyline (no line) by its fair');
  // (a moved line: the points it got better than the close, its own side's way, with no carried chance)
  assert.deepEqual(moveOf({ fair: 0.5, clv: { pts: 1, q: null } }), { dir: 1, by: null });
  assert.deepEqual(moveOf({ fair: 0.5, clv: { pts: -0.5, q: 0.6 } }), { dir: -1, by: null });
  // (nothing to read)
  assert.equal(moveOf({ fair: 0.5 }), null);
  assert.equal(moveOf({ clv: { pts: 0, q: 0.5 } }), null);
});

test('moveSummary and clvSummary: the share toward of the untied, ties counted apart, the old beat kept beside it', () => {
  const bets = [
    { fair: 0.5, clv: { pts: 0, q: 0.53, prob: 0.03, beat: true } },
    { fair: 0.5, clv: { pts: 0, q: 0.48, prob: 0.01, beat: true } },
    { fair: 0.5, clv: { pts: 0, q: 0.47, prob: 0.02, beat: true } },
    { fair: 0.5, clv: { pts: 0, q: 0.5, prob: 0, beat: null } },
    { fair: 0.5, clv: { pts: 1.5, q: null, prob: null, beat: null } },
  ];
  const m = moveSummary(bets);
  assert.deepEqual([m.n, m.toward, m.against, m.tie], [5, 2, 2, 1]);
  assert.equal(m.share, 0.5);
  assert.equal(m.by, -0.005, 'the mean move of the same-line four');
  const s = clvSummary(bets);
  assert.equal(s.beat, 1, 'the old share: every untied price beat the close');
  assert.deepEqual(s.moved, m, 'the move beside it');
});

test('the replay: fairMoveOf at the same line and a moved one, in the frame of the bet; tallies and daily buckets', () => {
  assert.equal(MOVE_TIE, CLV_TIE);
  const close = { line: 220.5, f: 0.46 };
  // (an over at fair 0.5, the close's over 0.46: against; the under at 0.5: toward)
  assert.deepEqual(fairMoveOf({ market: 'total', line: 220.5 }, true, 0.5, close), { dir: -1, by: -0.04 });
  assert.deepEqual(fairMoveOf({ market: 'total', line: 220.5 }, false, 0.5, close), { dir: 1, by: 0.04 });
  // (a moved total: an over at 220.5 closed at 222.5 got two points better: toward; its under against)
  assert.equal(fairMoveOf({ market: 'total', line: 220.5 }, true, 0.5, { line: 222.5, f: 0.5 }).dir, 1);
  assert.equal(fairMoveOf({ market: 'total', line: 220.5 }, false, 0.5, { line: 222.5, f: 0.5 }).dir, -1);
  // (a spread, the home's line: the home at -3 closed -4 is a point better for the home; the away worse)
  assert.equal(fairMoveOf({ market: 'spread', line: -3 }, true, 0.5, { line: -4, f: 0.5 }).dir, 1);
  assert.equal(fairMoveOf({ market: 'spread', line: -3 }, false, 0.5, { line: -4, f: 0.5 }).dir, -1);
  assert.equal(fairMoveOf({ market: 'ml', line: null }, true, 0.6, { line: null, f: 0.6 }).dir, 0);
  assert.equal(fairMoveOf({ market: 'ml', line: null }, true, 0.6, null), null);
  // (the tally: mvN with ties, toward and against apart; a bet with no move adds none)
  const bets = [1, 1, -1, 0, null].map((mv, i) => ({ res: i % 2 ? 'L' : 'W', units: 1, profit: i % 2 ? -1 : 0.9, mv, t: Date.UTC(2026, 9, 10 + i), band: 'medium' }));
  const t = bets.reduce(addBet, emptyTally());
  assert.deepEqual([t.mvN, t.toward, t.against], [4, 2, 1]);
  const d = dailyOf(bets, (b) => b.t);
  const col = (k) => DAILY_COLS.indexOf(k);
  const sum = (k) => Object.values(d.bands.medium).reduce((s, x) => s + (Number(x.split(',')[col(k)]) || 0), 0);
  assert.deepEqual([sum('mvN'), sum('toward'), sum('against')], [4, 2, 1]);
});

test('the page: Beats the close reads the move, the replay and the live bets joined; ties on the hover; the old share kept', () => {
  assert.equal(book.moveOf({ fair: 0.5, clv: { pts: 0, prob: 0.03, ev: 0.02, beat: true, q: 0.49 } }), -1);
  assert.equal(book.moveOf({ fair: 0.5, clv: { pts: 2, prob: null, ev: null, beat: null } }), 1);
  assert.equal(book.moveText({ mvN: 29, mvToward: 20, mvAgainst: 9 }), '—', 'from BEAT_MIN bets');
  assert.equal(book.moveText({ mvN: 40, mvToward: 10, mvAgainst: 20 }), '33%', 'ties out of the share');
  assert.match(book.moveTip({ mvN: 40, mvToward: 10, mvAgainst: 20 }), /10 toward, 20 against, 10 with no move/);
  assert.equal(book.moveTip({ mvN: 0 }), 'No bets with a close yet');
  // (the replay's tallies (a file with the move) and a live bet joined on the row; the old share apart)
  const EPOCH = '2026-10-19T17:15:00Z';
  const tally = { bets: 10, won: 5, lost: 5, push: 0, staked: 10, profit: 0, roi: 0, beat: 0.9, beatN: 10, clv: 0.02, toward: 3, against: 6, mvN: 10 };
  const f = { v: 1, sport: 'nfl', epoch: EPOCH, at: EPOCH, from: EPOCH, through: EPOCH, n: { bets: 10 }, overall: tally, practice: { ...tally, bets: 0, won: 0, lost: 0, staked: 0, toward: 0, against: 0, mvN: 0 }, byBand: { lock: null, high: null, medium: tally }, byMarket: { lines: tally, props: null }, bySeason: [], last: [], flags: {} };
  const live = { id: 'x', sport: 'nfl', event: '1', start: '2026-10-20T00:00:00Z', placedAt: '2026-10-19T20:00:00Z', market: 'spread', side: 'home', line: -3, odds: -110, fair: 0.5, model: 0.55, p: 0.52, ev: 0.01, intent: 'edge', units: 1, status: 'won', profit: 0.91, publishedLevel: 'medium', clv: { pts: 0, prob: 0.02, ev: 0.03, beat: true, q: 0.53 } };
  const h = book.botHistoryOf([f], [live], null, { nfl: 'NFL' });
  assert.deepEqual([h.overall.mvN, h.overall.mvToward, h.overall.mvAgainst], [11, 4, 6]);
  assert.equal(h.overall.clvN, 11, 'the old price share still tallied');
});
