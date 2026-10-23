// One price a side (DECISIONS.md D79; the owner, 2026-10-22: "Bot Picks, the game board, the slip and the popover
// must ALWAYS show the same price for the same side/line"; a pick with no edge at the current price comes off Bot
// Picks). The case reported: the Bot bet Ryan Nugent-Hopkins Under 1.5 Shots at +115 (Bally Bet, the paid quote's
// best US price, D74); a later run read ESPN's free DraftKings -120 alone and the board showed -120 (a PASS) while
// Bot Picks showed the bet. Now the board holds the paid +115 while its quote is fresh (board.mjs heldPaid) and the
// page holds the same rule (paid-price.ts freshBoard); past it, both show -120 and the bet drops off Bot Picks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { loadEngine } from './support/engine.mjs';
import * as B from '../libs/ranker/scripts/model/board.mjs';
import { kellyOf } from '../libs/ranker/scripts/model/picks.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'wallet-entry.ts'), data: {} });

const PLACED = '2026-10-22T22:43:49Z';
const START = '2026-10-23T01:00:00Z';
const at = (min) => Date.parse(PLACED) + min * 60e3;

// (the bettor's priced row for the prop at ESPN's free DraftKings prices alone: over -110, under -120)
const espnRow = () => ({
  prop: { athlete: { id: 2562624, name: 'Ryan Nugent-Hopkins', team: 6 }, stat: { key: 'sog', label: 'Shots' }, line: 1.5, prices: { over: -110, under: -120 } },
  side: 'under',
  priced: true,
  sides: [
    { side: 'over', odds: -110, p: 0.4897, ev: 0.4897 * (1 + 100 / 110) - 1 },
    { side: 'under', odds: -120, p: 0.5103, ev: 0.5103 * (1 + 100 / 120) - 1 },
  ],
});
// (the last board's row: the paid quote at the bet, the under's best +115 at Bally Bet, DraftKings' own -120 in it)
const paidRow = { n: 'Ryan Nugent-Hopkins', id: '2562624', k: 'sog', l: 1.5, o: [-110, 115], pb: ['dk', 'bly'], pt: PLACED, dko: [null, -120] };

test('D79 the bettor and the page hold one rule: the same freshness and the same move', () => {
  assert.equal(B.PAID_FRESH_MS, book.PAID_FRESH_MS);
  assert.equal(B.PAID_MOVED, book.PAID_MOVED);
  assert.equal(B.PAID_FRESH_MS, 60 * 60e3, 'an hour: D55 LINES_FRESH.refresh');
  for (const [a, b] of [[-120, -120], [-120, -121], [-120, -125], [-180, -179], [115, 105]]) assert.equal(B.dkMoved(a, b), book.dkMoved(a, b), `${a} ${b}`);
  assert.ok(!B.dkMoved(-180, -179), "the API's rounding is no move");
  assert.ok(B.dkMoved(-120, -110), 'ten cents is');
  assert.ok(fs.readFileSync(new URL('../libs/ranker/scripts/model/DECISIONS.md', import.meta.url), 'utf8').includes('### D79. One price a side'));
});

test('D79 the bettor: a fresh paid best price held over a later DraftKings-only ESPN read; stale or DraftKings moved, ESPN\'s', () => {
  // (fresh: 20 minutes on, DraftKings unmoved at -120: the under at +115 Bally Bet, an edge)
  const fresh = B.boardProp(espnRow(), 'T', { paid: paidRow, now: at(20) });
  assert.deepEqual(fresh.o, [-110, 115]);
  assert.deepEqual(fresh.pb, [null, 'bly']);
  assert.equal(fresh.pt, PLACED);
  assert.deepEqual(fresh.dko, [null, -120]);
  assert.equal(fresh.ks[1], kellyOf(115, 0.5103));
  assert.ok(fresh.ks[1] > 0 && fresh.b[1] !== 'low');
  // (the over's paid price was DraftKings' own, -110: no better than ESPN's now, so ESPN's, no book)
  assert.equal(fresh.o[0], -110);
  // (stale: past the hour, ESPN's -120, no book, no edge: a PASS)
  const stale = B.boardProp(espnRow(), 'T', { paid: paidRow, now: at(61) });
  assert.deepEqual(stale.o, [-110, -120]);
  assert.equal(stale.pb, undefined);
  assert.ok(stale.ks[1] < 0 && stale.b[1] === 'low');
  // (DraftKings moved since the quote (-110 then, -120 now): the quote's stale whatever its age)
  const moved = B.boardProp(espnRow(), 'T', { paid: { ...paidRow, dko: [null, -110] }, now: at(20) });
  assert.equal(moved.o[1], -120);
  // (another line: never held)
  assert.equal(B.boardProp(espnRow(), 'T', { paid: { ...paidRow, l: 2.5 }, now: at(20) }).o[1], -120);
  // (a paid quote this run: its time and DraftKings' own beside the best)
  const row = espnRow();
  row.sides[1] = { ...row.sides[1], odds: 115, book: 'bly' };
  const now = B.boardProp(row, PLACED, { now: at(0) });
  assert.deepEqual([now.o[1], now.pb[1], now.pt, now.dko[1]], [115, 'bly', PLACED, -120]);
  // (the game lines the same: a side at ESPN's price takes the last board's fresh paid one)
  const markets = [{ market: 'total', sides: [{ side: 'over', line: 6.5, odds: -110, model: 0.5, fair: 0.5 }, { side: 'under', line: 6.5, odds: -110, model: 0.5, fair: 0.5 }] }];
  const prev = { total: [{ s: 'over', l: 6.5, o: -102, pb: 'fd', pt: PLACED, dko: -110 }, { s: 'under', l: 6.5, o: -110 }] };
  const k = B.boardMarkets(markets, () => 1, null, null, { paid: prev, now: at(20) });
  assert.deepEqual([k.total[0].o, k.total[0].pb, k.total[1].o, k.total[1].pb], [-102, 'fd', -110, undefined]);
  assert.equal(B.boardMarkets(markets, () => 1, null, null, { paid: prev, now: at(61) }).total[0].o, -110);
});

// (the page: the board as written with the held price, the Bot's bet at +115)
const boardOf = (prop) => ({
  sport: 'nhl',
  at: PLACED,
  games: [{ id: '401892561', start: START, m: 'CAR @ EDM', a: ['CAR', '7'], h: ['EDM', '6'], k: {}, p: [prop] }],
});
const heldProp = () => ({ n: 'Ryan Nugent-Hopkins', id: '2562624', t: '6', k: 'sog', lb: 'Shots', l: 1.5, o: [-110, 115], pb: [null, 'bly'], pt: PLACED, dko: [null, -120], c: 0.4897, ks: [kellyOf(-110, 0.4897), kellyOf(115, 0.5103)], b: ['low', 'medium'], bot: 'under', bk: 'bet' });
const bet = () =>
  book.rowOf(
    'nhl',
    {
      id: '401892561:prop:sog:2562624', sport: 'nhl', score: 0.0845, chance: 51, level: 'medium', edge: true, kind: 'player', market: 'Shots',
      pick: 'Ryan Nugent-Hopkins Under 1.5 Shots', side: 'under', athlete: '2562624', team: '6', player: 'Ryan Nugent-Hopkins', line: 1.5, odds: 115,
      book: 'Bally Bet', model: 0.4976, fair: 0.5101, p: 0.5103, ev: 0.0971, units: 1, why: { price: 0.0841, lean: 0.0004, fair: 0.5101, p: 0.5103, trust: -0.02, fitted: true, from: 'book' },
      start: START, placedAt: PLACED, matchup: 'CAR @ EDM', teams: [{ abbr: 'CAR', logo: null }, { abbr: 'EDM', logo: null }], where: null, reason: 'x',
    },
    false,
  );

test('D79 the page: a fresh paid price, every reader +115; stale, every reader -120 and the bet off Bot Picks', () => {
  // (fresh, 20 minutes on: the board as loaded unchanged, Bot Picks' quote the game board's +115 at Bally Bet)
  const fresh = book.freshBoard(boardOf(heldProp()), at(20));
  const x = fresh.games[0].p[0];
  assert.deepEqual([x.o[1], x.pb[1]], [115, 'bly'], "the game board's button");
  const q = book.quoteOf(bet(), { model: fresh.games[0] });
  assert.deepEqual(q, { odds: 115, from: 'board', book: 'bly' }, "Bot Picks' and the slip's price");
  const kept = book.rejudged(bet(), q);
  assert.ok(kept, 'the edge holds: on Bot Picks');
  assert.equal(kept.livePrice, 115);
  assert.equal(kept.moved, false);
  // (stale, past the hour: DraftKings' own -120, no book, its Kelly and band worked again there: a PASS)
  const stale = book.freshBoard(boardOf(heldProp()), at(61));
  const y = stale.games[0].p[0];
  assert.deepEqual([y.o[1], y.pb], [-120, undefined], "the game board's button");
  assert.ok(y.ks[1] < 0 && y.b[1] === 'low', 'a PASS at -120');
  const q2 = book.quoteOf(bet(), { model: stale.games[0] });
  assert.deepEqual(q2, { odds: -120, from: 'board' });
  assert.equal(book.rejudged(bet(), q2), null, 'no edge at -120: off Bot Picks (the bet stays in Open Bets and the Algorithm tab)');
  // (and no suggestion on it either: the same rule)
  assert.equal(book.suggestionsOf('nhl', stale, at(61), () => ({})).length, 0);
});

test('D79 the page: a bet judged again where its edge holds shows its band and Kelly at the current price, its own kept', () => {
  const row = bet();
  const r = book.rejudged(row, { odds: 110, from: 'board', book: 'fd' });
  assert.ok(r && r.moved);
  assert.equal(r.price, 115, "the bet's locked price ('Bet at +115')");
  assert.equal(r.livePrice, 110);
  assert.ok(Math.abs(r.sureness - kellyOf(110, 0.5103)) < 1e-3, 'Kelly at the current price');
  assert.equal(r.locked.sureness, row.sureness);
  assert.equal(r.locked.confidence, row.confidence);
  // (no quote (its game off the board): the bet as it stands)
  assert.equal(book.rejudged(row, null).sureness, row.sureness);
});

test("D79 the game lines in the browser: DraftKings moved on ESPN's board since the paid quote, ESPN's price and no best claimed", () => {
  const price = { market: 'total', side: 'over', line: 6.5, odds: -110 };
  assert.equal(w.bestPriceOf(price, { s: 'over', l: 6.5, o: -102, pb: 'fd', dko: -110 }).odds, -102, 'unmoved: the shopped price');
  const moved = w.bestPriceOf({ ...price, odds: -125 }, { s: 'over', l: 6.5, o: -102, pb: 'fd', dko: -110 });
  assert.deepEqual([moved.odds, moved.pb], [-125, undefined]);
  // (a stale paid game side: DraftKings' own on the board as loaded, no book)
  const g = { id: '1', start: START, m: 'A @ B', a: ['A', '1'], h: ['B', '2'], k: { total: [{ s: 'over', l: 6.5, o: -102, pb: 'fd', pt: PLACED, dko: -110, c: 0.5, ks: 0.01, b: 'medium' }] } };
  const side = book.freshBoard({ sport: 'nhl', at: PLACED, games: [g] }, at(61)).games[0].k.total[0];
  assert.deepEqual([side.o, side.pb, side.b], [-110, undefined, 'low']);
  assert.ok(book.freshBoard({ sport: 'nhl', at: PLACED, games: [g] }, at(30)).games[0] === g, 'fresh: the same object');
});
