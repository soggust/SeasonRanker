// The Book's best price (the owner, 2026-10-20): the Book and the wallet show and take the best US price, the
// board's o (board.json pb its book), with a hover saying whose ("Best price: FanDuel"); ESPN's free price (the
// home book's) beats it only where strictly better at the same line, and is never claimed the best where the board
// didn't shop the side; the bet keeps the book's code (wallet.service pickFields, firestore.rules book)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'wallet-entry.ts'), data: {} });
const b = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

const START = '2026-10-21T00:15:00Z';
const BOARD_AT = '2026-10-20T14:00:00Z';
const espn = (away, home = -110, line = 7.5) => ({
  sport: 'nfl', event: '401', matchup: 'WSH @ SF', start: START, state: 'pre', detail: '', final: false,
  away: { abbr: 'WSH', name: 'WSH', logo: null, score: null }, home: { abbr: 'SF', name: 'SF', logo: null, score: null }, book: 'x',
  spread: { away: { market: 'spread', side: 'away', line, odds: away }, home: { market: 'spread', side: 'home', line: -line, odds: home } },
  total: null,
  ml: { away: { market: 'ml', side: 'away', line: null, odds: 300 }, home: { market: 'ml', side: 'home', line: null, odds: -380 } },
});
const game = (spread, ml) => ({
  id: '401', start: START, m: 'WSH @ SF', a: ['WSH', '28'], h: ['SF', '25'],
  k: { spread, ml },
  p: [{ n: 'Jayden Daniels', id: '4426348', t: '28', k: 'rushYds', lb: 'Rush Yds', l: 39.5, o: [105, -110], pb: ['fd', null], c: 0.56, ks: [0.1, -0.17], b: ['lock', 'low'] }],
});
const side = (s, l, o, pb) => ({ s, l, o, c: 0.54, ks: 0.03, b: 'high', ...(pb ? { pb } : {}) });

test('the names and the hover: a code is its book, no code no title', () => {
  assert.equal(b.bestPriceTitle('fd'), 'Best price: FanDuel');
  assert.equal(b.bestPriceTitle('dk'), 'Best price: DraftKings');
  assert.equal(b.bestPriceTitle(undefined), '');
  assert.equal(b.bestPriceTitle('zz'), '');
  assert.equal(b.withBookTitle('NE -3.5 -110 at the Book', 'czr'), 'NE -3.5 -110 at the Book\nBest price: Caesars');
  assert.equal(b.bookCode('FanDuel'), 'fd');
  assert.equal(b.bookCode('Hard Rock Bet'), 'hr');
  assert.equal(b.bookCode('mgm'), 'mgm');
  assert.equal(b.bookCode('Nobody'), null);
  assert.ok(b.pricier(-105, -110) && b.pricier(100, -105) && !b.pricier(-110, -110) && !b.pricier(-100, 100));
});

test('bestPriceOf / withBestPrices: the shopped price at the same line, ESPN only where strictly better; another line or no pb, ESPN as it is', () => {
  const g = game([side('away', 7.5, -102, 'fd'), side('home', -7.5, -112)], [side('away', null, 320, 'mgm'), side('home', null, -380, 'dk')]);
  const out = w.withBestPrices(espn(-110), g);
  assert.deepEqual(out.spread.away, { market: 'spread', side: 'away', line: 7.5, odds: -102, pb: 'fd' });
  // (a side the board didn't shop: ESPN's, no best claimed)
  assert.deepEqual(out.spread.home, { market: 'spread', side: 'home', line: -7.5, odds: -110 });
  assert.deepEqual(out.ml.away, { market: 'ml', side: 'away', line: null, odds: 320, pb: 'mgm' });
  assert.equal(out.ml.home.pb, 'dk');
  // (ESPN strictly better: ESPN's, the home book the best; equal: the board's)
  assert.deepEqual(w.withBestPrices(espn(-100), g).spread.away, { market: 'spread', side: 'away', line: 7.5, odds: -100, pb: 'dk' });
  assert.deepEqual(w.withBestPrices(espn(-102), g).spread.away.pb, 'fd');
  // (the line has moved: ESPN's at its own line, no claim)
  assert.deepEqual(w.withBestPrices(espn(-110, -110, 7), g).spread.away, { market: 'spread', side: 'away', line: 7, odds: -110 });
  // (not on the betting board: as it is)
  assert.equal(w.withBestPrices(espn(-110), null).spread.away.pb, undefined);
  // (a game off the betting board alone (a bout): its sides carry pb)
  const mma = w.modelGameBoard('mma', { ...g, k: { ml: g.k.ml } }, Date.parse(BOARD_AT));
  assert.equal(mma.ml.away.pb, 'mgm');
});

test('quoteOf: a shopped side is the board\'s price at its book unless ESPN is strictly better at the line; unshopped, as before (no book)', () => {
  const row = { pickId: '401:spread', side: 'away', line: 7.5 };
  const shopped = game([side('away', 7.5, -102, 'fd'), side('home', -7.5, -112)]);
  const fresh = { espnAt: Date.parse(BOARD_AT) + 60e3, model: shopped, modelAt: BOARD_AT };
  // (ESPN fresher but worse: the board's at FanDuel, never ESPN's as the best)
  assert.deepEqual(b.quoteOf(row, { ...fresh, espn: espn(-110) }), { odds: -102, from: 'board', book: 'fd' });
  // (ESPN as the page has it, the shopped price already over it: the same)
  assert.deepEqual(b.quoteOf(row, { ...fresh, espn: w.withBestPrices(espn(-110), shopped) }), { odds: -102, from: 'board', book: 'fd' });
  // (ESPN strictly better: ESPN's, the home book named)
  assert.deepEqual(b.quoteOf(row, { ...fresh, espn: espn(-101) }), { odds: -101, from: 'espn', book: 'dk' });
  // (ESPN at another line: the board's at the row's line)
  assert.deepEqual(b.quoteOf(row, { ...fresh, espn: espn(-101, -110, 7) }), { odds: -102, from: 'board', book: 'fd' });
  // (unshopped: ESPN's where fresher, no book)
  const plain = game([side('away', 7.5, -102), side('home', -7.5, -112)]);
  assert.deepEqual(b.quoteOf(row, { ...fresh, model: plain, espn: espn(-110) }), { odds: -110, from: 'espn' });
  // (a prop: its side's book where the board has one)
  assert.deepEqual(b.quoteOf({ pickId: '401:prop:rushYds:4426348', side: 'over', line: 39.5 }, { model: shopped }), { odds: 105, from: 'board', book: 'fd' });
  assert.deepEqual(b.quoteOf({ pickId: '401:prop:rushYds:4426348', side: 'under', line: 39.5 }, { model: shopped }), { odds: -110, from: 'board' });
  // (a bet's row and a suggestion carry it: liveBook)
  assert.equal(b.withLive({ price: -110 }, { odds: -102, from: 'board', book: 'fd' }).liveBook, 'fd');
  assert.equal(b.withLive({ price: -110 }, { odds: -110, from: 'espn' }).liveBook, null);
  const [sug] = b.suggestionsOf('nfl', { sport: 'nfl', at: BOARD_AT, games: [shopped] }, Date.parse(BOARD_AT), () => ({ espn: espn(-110), espnAt: Date.parse(BOARD_AT) + 60e3 })).filter((r) => r.betType === 'spread');
  assert.equal(sug.livePrice, -102);
  assert.equal(sug.liveBook, 'fd');
});
