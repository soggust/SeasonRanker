// The Book's suggestions (suggestions.ts, the owner's decision of 2026-10-19): every side on a sport's board with
// an edge at the latest price, priced again live from the Bot's chance (the K popover's what-if math: a
// suggestion's band moves with its price and drops off at PASS); the Bot's bets keep the price they locked, the
// live one beside it and "moved" where they differ; a suggestion on a market the Bot holds is that row; the tags
// (practice, "Bet at −109 · 2:05 PM"; a suggestion untagged); and the Live tab's read with the same split.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const live = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'live-entry.ts'), data: {} });
const { suggestionsOf, quoteOf, repriced, withLive, joinSuggestions, lockedText, sugOf, rowOf, marketKeyOf } = book;

const NOW = Date.parse('2026-10-19T15:00:00Z');
const START = '2026-10-20T00:15:00Z';
const BOARD_AT = '2026-10-19T14:00:00Z';

// (a game on the board: WSH @ SF, the away side's spread with an edge at -110 (the Bot 54%), a guard's pass, a
// CHECK, and a prop with an edge on the over)
const game = (over = {}) => ({
  id: '401',
  start: START,
  m: 'WSH @ SF',
  a: ['WSH', '28'],
  h: ['SF', '25'],
  k: {
    spread: [
      { s: 'home', l: -7.5, o: -110, c: 0.46, ks: -0.08, b: 'low' },
      { s: 'away', l: 7.5, o: -110, c: 0.54, ks: 0.034, b: 'high' },
    ],
    total: [
      { s: 'over', l: 51.5, o: -110, c: 0.6, ks: 0.16, b: 'low', sr: 'a moved line' },
      { s: 'under', l: 51.5, o: -110, c: 0.4, ks: -0.2, b: 'low' },
    ],
    ml: [
      { s: 'home', l: null, o: -400, c: 0.9, ks: 0.2, b: 'check' },
      { s: 'away', l: null, o: 320, c: 0.1, ks: -0.5, b: 'low' },
    ],
  },
  p: [
    { n: 'Jayden Daniels', id: '4426348', t: '28', k: 'rushYds', lb: 'Rush Yds', l: 39.5, o: [-110, -110], c: 0.56, ks: [0.076, -0.17], b: ['lock', 'low'] },
    { n: 'Brian Robinson', id: '4360939', t: '28', k: 'rushYds', lb: 'Rush Yds', l: 49.5, o: [-110, -110], c: 0.6, ks: [0.16, -0.25], b: ['low', 'low'], sk: 1, sr: 'questionable' },
  ],
  ...over,
});
const board = (g = game()) => ({ sport: 'nfl', at: BOARD_AT, games: [g] });
// (ESPN's board for the game: its spread at a price, read at a time)
const espn = (away, home = -110, line = 7.5) => ({
  spread: { away: { market: 'spread', side: 'away', line, odds: away }, home: { market: 'spread', side: 'home', line: -line, odds: home } },
  total: null,
  ml: null,
});

test('suggestionsOf: the sides with an edge at the price, never a guard\'s pass, a CHECK, a skipped prop or a game begun', () => {
  const rows = suggestionsOf('nfl', board(), NOW, () => ({}));
  assert.deepEqual(rows.map((r) => r.pick), ['WSH +7.5', 'Jayden Daniels Over 39.5 Rush Yds']);
  const [spread, prop] = rows;
  assert.equal(spread.suggested, true);
  assert.equal(spread.confidence, 'high');
  assert.equal(spread.pickId, '401:spread');
  assert.equal(spread.side, 'away');
  assert.equal(spread.odds, '-110');
  assert.equal(prop.confidence, 'lock');
  assert.equal(prop.pickId, '401:prop:rushYds:4426348');
  assert.equal(prop.athleteId, '4426348');
  assert.match(spread.reason, /Suggested by price: the Bot makes it 54% to win, and at −110 it needs 52\.4%/);
  assert.deepEqual(suggestionsOf('nfl', board(), Date.parse(START) + 1, () => ({})), []);
});

test('live re-pricing: a suggestion\'s band moves with ESPN\'s price, and it drops off at PASS as the price worsens', () => {
  const at = (odds) => suggestionsOf('nfl', board(), NOW, () => ({ espn: espn(odds), espnAt: Date.parse(BOARD_AT) + 60e3 })).find((r) => r.betType === 'spread');
  assert.equal(at(-110).confidence, 'high');
  const worse = at(-114);
  assert.equal(worse.confidence, 'medium');
  assert.equal(worse.odds, '-114');
  assert.equal(worse.livePrice, -114);
  assert.equal(worse.liveFrom, 'espn');
  assert.ok(worse.sureness < at(-110).sureness);
  // (past its edge: PASS, off the list)
  assert.equal(at(-120), undefined);
  // (and back on as the price comes back)
  assert.equal(at(-105).confidence, 'high');
});

test("quoteOf: ESPN's at the same line, the price the game board shows (D81: one price a side, whenever ESPN was read); else the board's; a moved line none from ESPN", () => {
  const row = { pickId: '401:spread', side: 'away', line: 7.5 };
  const g = game();
  assert.deepEqual(quoteOf(row, { espn: espn(-115), espnAt: Date.parse(BOARD_AT) + 1, model: g, modelAt: BOARD_AT }), { odds: -115, from: 'espn' });
  assert.deepEqual(quoteOf(row, { espn: espn(-115), espnAt: Date.parse(BOARD_AT) - 1, model: g, modelAt: BOARD_AT }), { odds: -115, from: 'espn' });
  assert.deepEqual(quoteOf(row, { espn: espn(-115, -105, 7), espnAt: Date.parse(BOARD_AT) + 1, model: g, modelAt: BOARD_AT }), { odds: -110, from: 'board' });
  // (a prop: the board's, at its line)
  assert.deepEqual(quoteOf({ pickId: '401:prop:rushYds:4426348', side: 'under', line: 39.5 }, { model: g }), { odds: -110, from: 'board' });
  assert.equal(quoteOf({ pickId: '401:prop:rushYds:4426348', side: 'over', line: 40.5 }, { model: g }), null);
});

test('repriced: the K popover\'s what-if math, a price the Bot did not take', () => {
  const [row] = suggestionsOf('nfl', board(), NOW, () => ({}));
  assert.equal(repriced(row, -150), null);
  const better = repriced(row, 100);
  assert.equal(better.confidence, 'high');
  assert.equal(better.price, 100);
  assert.equal(better.odds, '+100');
  assert.ok(Math.abs(better.sureness - 0.08) < 1e-9);
});

// (one of the Bot's bets, as picks.json has it)
const pick = (over = {}) => ({
  id: '401:spread',
  sport: 'nfl',
  score: 0.03,
  chance: 54,
  level: 'high',
  edge: true,
  kind: 'spread',
  market: 'Spread',
  pick: 'WSH +7.5',
  side: 'away',
  line: 7.5,
  odds: -109,
  book: 'DraftKings',
  p: 0.54,
  why: { price: -0.02, lean: 0.05, fair: 0.5, trust: 0.4, fitted: false, from: 'book' },
  start: START,
  matchup: 'WSH @ SF',
  teams: [{ abbr: 'WSH', logo: null }, { abbr: 'SF', logo: null }],
  where: null,
  reason: 'The Bot likes WSH.',
  placedAt: '2026-10-19T19:05:00Z',
  ...over,
});

test('withLive: a bet keeps the price it locked, its band and its Kelly score; the live price beside it, moved where they differ', () => {
  const bet = rowOf('nfl', pick(), false);
  assert.equal(bet.placedAt, '2026-10-19T19:05:00Z');
  const moved = withLive(bet, { odds: -125, from: 'espn' });
  assert.equal(moved.price, -109);
  assert.equal(moved.odds, '-109');
  assert.equal(moved.confidence, bet.confidence);
  assert.equal(moved.sureness, bet.sureness);
  assert.equal(moved.livePrice, -125);
  assert.equal(moved.moved, true);
  assert.equal(withLive(bet, { odds: -109, from: 'board' }).moved, false);
  assert.equal(withLive(bet, null).moved, false);
});

test('joinSuggestions: a suggestion the Bot has bet is that bet (either side of the market); one row a side; band order', () => {
  const bet = { ...rowOf('nfl', pick({ side: 'home', pick: 'SF -7.5', line: -7.5 }), false), id: 0 };
  const sugs = suggestionsOf('nfl', board(), NOW, () => ({}));
  const ids = new Map();
  const idOf = (k) => (ids.has(k) ? ids.get(k) : (ids.set(k, 100 + ids.size), ids.get(k)));
  const list = joinSuggestions([bet], [...sugs, ...sugs], idOf);
  assert.deepEqual(list.map((r) => [r.pick, !!r.suggested]), [
    ['Jayden Daniels Over 39.5 Rush Yds', true],
    ['SF -7.5', false],
  ]);
  assert.equal(marketKeyOf(bet), marketKeyOf(sugs[0]));
  // (the ids by side, the same each time the prices move)
  const again = joinSuggestions([bet], suggestionsOf('nfl', board(), NOW, () => ({ espn: espn(-105) })), idOf);
  assert.equal(again.find((r) => r.suggested).id, list.find((r) => r.suggested).id);
  // (no bet on the market: the suggestion stays)
  assert.equal(joinSuggestions([], sugs, idOf).length, 2);
});

test('tags: "Bet at −109 · 2:05 PM" with the time, the price alone without; the desk\'s practice and off marks', () => {
  const at = new Date('2026-10-19T19:05:00Z');
  const text = lockedText({ price: -109, placedAt: at.toISOString() }, at.getTime());
  assert.equal(text, `Bet at −109 · ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
  assert.match(lockedText({ price: -109, placedAt: at.toISOString() }, at.getTime() + 3 * 864e5), /^Bet at −109 · [A-Z][a-z]{2} \d/);
  assert.equal(lockedText({ price: 350, placedAt: null }), 'Bet at +350');
  assert.equal(sugOf('practice'), 'practice');
  assert.equal(sugOf({ practice: true }), 'practice');
  assert.equal(sugOf(0), 'off');
  assert.equal(sugOf(undefined), null);
  const g = game();
  g.k.spread[1].sug = 'practice';
  g.p[0].sug = false;
  const rows = suggestionsOf('nfl', board(g), NOW, () => ({}));
  // (a practice suggestion: off Bot Picks since practice picks are tracked, D57; the owner, 2026-10-23: no Bot Pick the
  // Bot wouldn't stake. A side the desk tracks (tr) the same)
  assert.deepEqual(rows, []);
  const h = game();
  h.k.spread[1].tr = 1;
  assert.ok(!suggestionsOf('nfl', board(h), NOW, () => ({})).some((r) => r.pick === 'WSH +7.5'));
});

test('splitRead: the Live tab reads the Bot\'s bet with its locked price, else its suggestion', () => {
  const { splitRead } = live;
  assert.equal(splitRead([{ pick: 'WSH +7.5', confidence: 'high', odds: '-109' }], [{ pick: 'Over 51.5', confidence: 'lock', odds: '-105' }]), 'WSH +7.5 · LOVE · bet at −109');
  assert.equal(splitRead([], [{ pick: 'Over 51.5', confidence: 'medium', odds: '-105' }]), 'Over 51.5 · LIKE · at −105');
  assert.equal(splitRead([{ pick: 'SF -7.5', confidence: 'low' }], []), 'pass');
  assert.equal(splitRead([], []), null);
});

test('a side the desk caps (board.json cap, DECISIONS.md D46): a LIKE at most at the practice stake at every price, a PASS still with no edge; the what-if held the same', () => {
  const g = game();
  g.k.spread[1] = { ...g.k.spread[1], cap: 'medium', cr: 'the lines at the practice stake' };
  g.p[0] = { ...g.p[0], cap: ['medium', null], cr: 'rushYds at the practice stake' };
  const rows = suggestionsOf('nfl', board(g), NOW, () => ({}));
  const [spread, prop] = rows;
  assert.equal(spread.confidence, 'medium');
  assert.equal(spread.cap, 'medium');
  assert.equal(spread.capWhy, 'the lines at the practice stake');
  assert.equal(spread.units, 0.5);
  assert.equal(prop.confidence, 'medium');
  // (at a price with no edge it's gone, as any suggestion)
  assert.equal(repriced(spread, -150), null);
  // (the what-if never above LIKE at a better price, PASS at a worse one)
  const wi = book.whatIfOf(spread, false);
  assert.equal(wi.most, 'medium');
  assert.equal(book.priceAt(wi, 150).level, 'medium');
  assert.equal(book.priceAt(wi, 150).units, 0.5);
  assert.equal(book.priceAt(wi, -150).level, 'low');
  // (uncapped, the same side a LOVE)
  assert.equal(suggestionsOf('nfl', board(), NOW, () => ({}))[0].confidence, 'high');
});

test('the K popover says the edge in points at its price (bet-why.ts edgeLine): Volkov at −120', () => {
  const base = { odds: -120, p: 0.558, bet: false, cap: null, unitsCap: null, win: 1, blend: null };
  const at = book.priceAt(base, -120);
  assert.equal(book.edgeLine(0.558, at), 'Edge +1.3 pts: the Bot 55.8% vs 54.5% to break even at −120 · Kelly 2.6% of bankroll');
  assert.equal(at.level, 'high');
  assert.ok(book.edgeLine(0.5, book.priceAt({ ...base, p: 0.5 }, -120)).startsWith('Edge −4.5 pts'));
});

// (the owner, 2026-10-19: a suggestion's K-score popover says as much as a bet's: the board's why (w) gives its row the
// Bot's own chance, the Book's no-vig, the trust, the terms and the desk's plain write-up, so betWhy splits its score
// into the price and the lean and whyFacts says the rest)
test("a suggestion with the board's why reads as a bet in the popover: its parts, its facts, the desk's write-up", () => {
  const w = { pr: -5, ln: 8.4, t: 0.5, m: 0.6, f: 0.5, ft: 1, tm: [['Starting QB', 1.2], ['Rest', -0.4]], r: 'WSH +7.5: the Bot has it close.' };
  const g = game();
  g.k.spread[1] = { ...g.k.spread[1], w };
  const rows = suggestionsOf('nfl', { sport: 'nfl', at: BOARD_AT, games: [g] }, NOW, () => ({}));
  const s = rows.find((r) => r.pick === 'WSH +7.5');
  assert.ok(s, 'the spread suggestion');
  assert.equal(s.model, 0.6);
  assert.equal(s.fair, 0.5);
  assert.equal(s.why.trust, 0.5);
  assert.equal(s.reason, "WSH +7.5: the Bot has it close. The Bot makes it 54%; at −110 it needs 52.4%, and the Book's no-vig price says 50%.", "the desk's write-up, the price said at the latest");
  const bw = book.betWhy([s], 0);
  assert.deepEqual(bw.parts.map((p) => p.key), ['price', 'lean']);
  assert.ok(Math.abs(bw.parts[0].amount + bw.parts[1].amount - bw.score) < 1e-9, 'the parts add to the score');
  assert.ok(Math.abs(bw.parts[0].amount - w.pr) < 0.01, "the price's part the board's at its price");
  assert.deepEqual(bw.facts.map((f) => f.label), ['What moved it']);
  assert.equal(bw.facts[0].value, 'Starting QB +1.2 pts · Rest −0.4 pts');
  // (at another price: the parts worked again there, the price sentence that price's)
  const moved = repriced(s, -105, 'espn');
  assert.match(moved.reason, /^WSH \+7\.5: the Bot has it close\. The Bot makes it 54%; at −105 it needs 51\.2%/);
  const mw = book.betWhy([moved], 0);
  assert.ok(Math.abs(mw.parts[0].amount + mw.parts[1].amount - mw.score) < 1e-9);
  // (a prop's: its projection against the Book's implied mean, and his usage)
  const facts = book.whyFacts({ market: 'Passing Yards', player: 'J. Daniels', mean: 262.4, implied: 246.66, usage: [36.5, 'dropbacks'], terms: [['the opponent', 4.1]] });
  assert.deepEqual(facts.map((f) => `${f.label}: ${f.value}`), ['Bot vs Book mean: 262.40 vs 246.66', 'Usage: 36.5 dropbacks', 'What moved it: the opponent +4.1%']);
  // (a side without a why: the price's words alone, as before)
  const bare = suggestionsOf('nfl', { sport: 'nfl', at: BOARD_AT, games: [game()] }, NOW, () => ({})).find((r) => r.pick === 'WSH +7.5');
  assert.match(bare.reason, /^Suggested by price/);
});
