// Closing-line value, the Bot's one honest scorecard (DECISIONS.md D115, 2026-11-08; libs/ranker/scripts/model/clv.mjs
// clvOf v3, clv-table.mjs): the close's no-vig chance of the bet's side at the bet's own line (the sharpest close kept:
// Pinnacle's, else the US books' median, else DraftKings') less the chance the price we took implied, in probability
// and in cents of American odds. The vig is never handed back (v2 took the close's vig out of our price, so a shopped
// price "beat" DraftKings' closing vig price almost every time: NBA 89% beat on a mean of 0). A close at another line
// is said so and never called beat or missed. The close is DraftKings' close from ESPN, never ESPN's current (an
// in-game line), and a prop's is the bet's own rung of the ladder where the board prices it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLV_TIE, CLV_V, americanOf, centsOf, clvOf, clvSummary, fairBeat, linesOfBody, propCarry, propCloseOf, revalueClv, sharpClose } from '../libs/ranker/scripts/model/clv.mjs';
import { archiveCloses, betsOf, clvTable, clvTableText, marketKey, regradeLedger, scored } from '../libs/ranker/scripts/model/clv-table.mjs';
import { mainRung } from '../libs/ranker/scripts/model/props.mjs';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const params = { r: 6 };
const dk = (close) => ({ ...close, source: 'close' });

test('D115 a better price at the same line is positive CLV, in points and in cents; the same price is a tie; a worse one missed', () => {
  assert.equal(CLV_V, 3);
  // (a moneyline taken at -104 that closed -120 / +100 at DraftKings: the close's no-vig 52.17% for it, our price implies
  // 50.98%: +1.19 points, about +5 cents, beat)
  const c = clvOf({ market: 'ml', side: 'home', line: null, odds: -104, fair: 0.52 }, dk({ line: null, odds: -120, fair: 0.5217 }), 1.6);
  near(c.prob, 0.5217 - 104 / 204);
  assert.equal(c.beat, true);
  assert.equal(c.result, 'beat');
  assert.equal(c.line, 'same');
  assert.equal(c.book, 'draftkings');
  assert.ok(c.cents > 4 && c.cents < 6, `cents ${c.cents}`);
  assert.ok(c.ev > 0, 'ev agrees in sign');
  // (the same price as the close's no-vig: a tie, never a beat; the price at the close's vig price: missed by the vig,
  // never 0 (v2 read it as 0))
  assert.equal(clvOf({ market: 'ml', side: 'home', odds: americanOf(0.5217) }, dk({ line: null, odds: -120, fair: 0.5217 }), 1.6).result, 'tie');
  const atVig = clvOf({ market: 'prop', side: 'over', line: 0.5, odds: -159, fair: 0.5735 }, dk({ line: 0.5, odds: -159, fair: 0.5735 }), null);
  assert.equal(atVig.result, 'missed');
  assert.equal(atVig.beat, false);
  assert.ok(atVig.prob < -0.03 && atVig.prob > -0.05, `the vig, about -4 points: ${atVig.prob}`);
  assert.ok(Math.abs(atVig.prob - atVig.ev / (1 + 100 / 159)) < 0.01);
  // (the cents scale: even money 0, both sides of it continuous)
  assert.equal(centsOf(120), 20);
  assert.equal(centsOf(-115), -15);
  assert.equal(centsOf(100), 0);
  near(americanOf(0.5), -100);
  near(americanOf(0.4), 150);
  near(americanOf(0.6), -150);
  assert.ok(CLV_TIE > 0 && CLV_TIE < 0.005);
});

test('D115 a close at another line is said so and never called beat or missed; the carried chance stays for the trust fit alone', () => {
  // (an over 43.5 that closed 44.5: a point better for the over, but no price at 43.5 closed)
  const c = clvOf({ market: 'total', side: 'over', line: 43.5, odds: -110 }, dk({ line: 44.5, odds: -110, fair: 0.5 }), 1.6);
  assert.equal(c.pts, 1);
  assert.equal(c.line, 'moved');
  assert.equal(c.result, 'line moved');
  assert.equal(c.beat, null);
  assert.equal(c.prob, null);
  assert.equal(c.cents, null);
  assert.equal(c.ev, null);
  assert.match(c.why, /the close is at 44.5, the bet at 43.5/);
  assert.ok(Number.isFinite(c.q) && c.carried === true, 'the chance carried to 43.5 for the trust fit, flagged');
  // (the gates read nothing from it: D56's fairBeat is null on a moved line)
  assert.equal(fairBeat({ market: 'total', clv: c }), null);
  // (a prop's line moved with no stat spread to carry it: q null too, still not judged, never a zero or a loss)
  const bare = clvOf({ market: 'prop', side: 'over', line: 1.5, odds: 165, fair: 0.37 }, dk({ line: 0.5, odds: -245, fair: 0.69 }), null);
  assert.equal(bare.result, 'line moved');
  assert.equal(bare.q, null);
  assert.equal(bare.carried, undefined);
  // (with the stat spread: carried, flagged)
  const carried = clvOf({ market: 'prop', side: 'over', line: 1.5, odds: 165, fair: 0.37 }, dk({ line: 0.5, odds: -245, fair: 0.69 }), null, null, propCarry(params));
  assert.ok(carried.q > 0.2 && carried.q < 0.69 && carried.carried === true, JSON.stringify(carried));
  assert.equal(carried.prob, null);
  // (the summary keeps them apart: out, lineMoved; never in the mean)
  const s = clvSummary([{ clv: c }, { clv: bare }, { clv: clvOf({ market: 'ml', side: 'home', odds: 100 }, dk({ line: null, odds: -110, fair: 0.51 }), 1) }]);
  assert.equal(s.n, 1);
  assert.equal(s.out, 2);
  assert.equal(s.lineMoved, 2);
  assert.equal(s.beat, 1);
  assert.equal(s.missed, 0);
});

test("D115 a bet at FanDuel, the close at DraftKings: compared with the close's no-vig chance, never DraftKings' vig price", () => {
  // (the NBA row that showed the fault: a rebounds under 3.5 at +120 at Hard Rock Bet, DraftKings' close +106 / -130,
  // no-vig 45.42% for the under. Our price implies 45.45%: a tie (v2 said +2.9 points and a beat, because it took
  // DraftKings' closing vig out of our price))
  const bet = { market: 'prop', side: 'under', line: 3.5, odds: 120, fair: 0.4523, book: 'Hard Rock Bet' };
  const c = clvOf(bet, dk({ line: 3.5, odds: 106, fair: 0.4542 }), null);
  assert.equal(c.result, 'tie');
  assert.equal(c.beat, null);
  near(c.prob, 0.4542 - 100 / 220);
  // (the same bet a nickel better at FanDuel, +125: +1 point, beat; at +115: missed)
  assert.equal(clvOf({ ...bet, odds: 125, book: 'FanDuel' }, dk({ line: 3.5, odds: 106, fair: 0.4542 }), null).result, 'beat');
  assert.equal(clvOf({ ...bet, odds: 115, book: 'FanDuel' }, dk({ line: 3.5, odds: 106, fair: 0.4542 }), null).result, 'missed');
  // (the close's own book never changes the answer: the same no-vig chance from any book's pair reads the same)
  const fd = clvOf({ ...bet, odds: 125 }, { line: 3.5, odds: 110, fair: 0.4542, source: 'close', book: 'fanduel' }, null);
  assert.equal(fd.prob, clvOf({ ...bet, odds: 125 }, dk({ line: 3.5, odds: 106, fair: 0.4542 }), null).prob);
  assert.equal(fd.book, 'fanduel');
});

test("D115 the sharpest close: Pinnacle's where the archive has it, else the US books' median, else DraftKings'", () => {
  const pin = sharpClose([{ book: 'draftkings', line: 0.5, odds: -110, fair: 0.49 }, { book: 'pinnacle', line: 0.5, odds: -105, fair: 0.5 }]);
  assert.equal(pin.book, 'pinnacle');
  assert.equal(pin.fair, 0.5);
  const mid = sharpClose([{ book: 'draftkings', line: 0.5, odds: -110, fair: 0.49 }, { book: 'fanduel', line: 0.5, odds: -105, fair: 0.5 }, { book: 'betmgm', line: 0.5, odds: -105, fair: 0.52 }]);
  assert.deepEqual([mid.book, mid.fair, mid.n, mid.odds], ['consensus', 0.5, 3, -110]);
  assert.equal(sharpClose([{ book: 'draftkings', line: 0.5, odds: -110, fair: 0.49 }]).book, 'draftkings');
  assert.equal(sharpClose([{ book: 'draftkings', line: 0.5, odds: -110, fair: null }]), null);
  assert.equal(sharpClose([]), null);
});

test('D115 the scorecard: sport x market x book rows, the staked graded bets alone, ties and misses in the beat share, ROI on every stake', () => {
  const row = (x) => ({ sport: 'nba', market: 'prop', propType: 'reb', book: 'FanDuel', intent: 'edge', units: 1, status: 'won', profit: 0.9, ...x });
  const bets = [
    row({ clv: { prob: 0.02, cents: 8, beat: true, line: 'same' } }),
    row({ clv: { prob: -0.03, cents: -12, beat: false, line: 'same' }, status: 'lost', profit: -1 }),
    row({ clv: { prob: 0, cents: 0, beat: null, result: 'tie', line: 'same' }, book: 'DraftKings' }),
    row({ clv: { prob: null, beat: null, result: 'line moved', line: 'moved', pts: 1 } }),
    row({ clv: null }),
    row({ clv: { prob: 0.05, beat: true }, intent: 'track', units: 0 }),
    row({ clv: { prob: 0.05, beat: true }, status: 'open' }),
    row({ market: 'ml', propType: undefined, clv: { prob: 0.01, cents: 4, beat: true, line: 'same' }, book: 'BetMGM', units: 2, profit: -2, status: 'lost' }),
  ];
  assert.equal(scored(bets[5]), false);
  assert.equal(scored(bets[6]), false);
  assert.equal(marketKey(bets[0]), 'prop:reb');
  const t = clvTable(bets, 'nba');
  const at = (m, b) => t.find((r) => r.market === m && r.book === b);
  assert.deepEqual(t.map((r) => `${r.market}|${r.book}`), ['all|all', 'ml|all', 'ml|BetMGM', 'prop:reb|all', 'prop:reb|FanDuel', 'prop:reb|DraftKings'], 'the lines first, all at the head, the books by bets');
  const reb = at('prop:reb', 'all');
  assert.deepEqual([reb.bets, reb.judged, reb.moved, reb.noClose], [5, 3, 1, 1]);
  near(reb.prob, (0.02 - 0.03 + 0) / 3);
  near(reb.cents, (8 - 12 + 0) / 3, 0.051);
  near(reb.beat, 1 / 3);
  near(reb.missed, 1 / 3);
  near(reb.roi, (0.9 - 1 + 0.9 + 0.9 + 0.9) / 5);
  const all = at('all', 'all');
  assert.deepEqual([all.bets, all.judged], [6, 4]);
  near(all.roi, (0.9 - 1 + 0.9 + 0.9 + 0.9 - 2) / 7);
  const text = clvTableText(t);
  assert.match(text, /\| market \| book \| bets \| judged \| mean CLV \(pts\) \| mean cents \| beat \| ROI \|/);
  assert.match(text, /\| \*\*prop:reb\*\* \| all books \| 5 \| 3 \(\+1 line moved\) \| \*\*-0\.33\*\* \| \*\*-1\.3\*\* \| \*\*33\.3%\*\* \| \*\*52\.0%\*\* \|/);
  assert.match(text, /\| prop:reb \| FanDuel \| 4 \|/);
  assert.equal(clvTableText(t, { books: false }).split('\n').length, 2 + 3, 'the all-books rows alone');
  assert.deepEqual(betsOf({ sport: 'nba', bets }), bets);
  assert.deepEqual(betsOf(bets), bets);
  assert.deepEqual(betsOf({ x: 1, rows: bets }), bets);
});

test('D115 the re-grade: every kept close valued again under v3 from the row itself, Pinnacle\'s archived close in its place where there is one, a moved line\'s carried chance kept', async () => {
  const v2 = (prob, extra = {}) => ({ pts: 0, prob, ev: prob - 0.04, q: 0.5, beat: prob > 0, result: prob > 0 ? 'beat' : 'lose', v: 2, ...extra });
  const bets = [
    // (the shopped price v2 called a beat: a tie now)
    { id: 'a', market: 'prop', side: 'under', line: 3.5, odds: 120, book: 'Hard Rock Bet', close: { line: 3.5, odds: 106, fair: 0.4542, source: 'close' }, clv: v2(0.0289, { q: 0.4542 }) },
    // (a moved line v2 carried: not judged now, its q kept and flagged)
    { id: 'b', market: 'prop', side: 'over', line: 2.5, odds: 120, close: { line: 3.5, odds: -150, fair: 0.58, source: 'close' }, clv: v2(0.03, { pts: -1, q: 0.44 }) },
    // (a moved line v2 couldn't carry: still not judged, q null)
    { id: 'c', market: 'prop', side: 'over', line: 2.5, odds: 120, close: { line: 3.5, odds: -150, fair: 0.58, source: 'close' }, clv: { pts: -1, prob: null, ev: null, q: null, beat: null, result: null, why: 'line moved from 2.5 to 3.5: no equivalent line to carry the close to', v: 2 } },
    // (no close ever: its reason kept, the version the current one)
    { id: 'd', market: 'ml', side: 'home', odds: 150, clv: { pts: null, prob: null, ev: null, q: null, beat: null, result: null, why: 'no close', v: 2 } },
    // (an open bet with nothing: untouched)
    { id: 'e', market: 'ml', side: 'home', odds: 150 },
    // (a moneyline with Pinnacle's archived close: the sharper close takes over, DraftKings' kept beside it)
    { id: 'f', market: 'ml', side: 'away', line: null, odds: 310, book: 'DraftKings', close: { line: null, odds: 320, fair: 0.2285, source: 'close' }, clv: v2(-0.0056, { q: 0.2285 }) },
  ];
  const r = regradeLedger(bets, new Map([['f', [{ book: 'pinnacle', line: null, odds: 330, fair: 0.235 }, { book: 'draftkings', line: null, odds: 320, fair: 0.2285 }]]]));
  assert.deepEqual([r.valued, r.sharper], [4, 1]);
  assert.equal(bets[0].clv.result, 'tie');
  assert.equal(bets[0].clv.v, CLV_V);
  assert.equal(bets[0].clv.book, 'draftkings');
  assert.deepEqual([bets[1].clv.result, bets[1].clv.q, bets[1].clv.carried, bets[1].clv.prob], ['line moved', 0.44, true, null]);
  assert.deepEqual([bets[2].clv.result, bets[2].clv.q, bets[2].clv.prob], ['line moved', null, null]);
  assert.equal(bets[3].clv.why, 'no close');
  assert.equal(bets[3].clv.v, CLV_V);
  assert.equal(bets[4].clv, undefined);
  assert.equal(bets[5].close.book, 'pinnacle');
  assert.equal(bets[5].close.source, 'archive close');
  assert.deepEqual(bets[5].close.draftkings, { line: null, odds: 320, fair: 0.2285 });
  near(bets[5].clv.prob, 0.235 - 100 / 410);
  assert.equal(bets[5].clv.book, 'pinnacle');
  // (the archive reader: nothing to read, nothing bought; a sport with no bets gives an empty map)
  assert.equal((await archiveCloses('nhl', [])).size, 0);
});

test("a game line's close is ESPN's close, never its current (an in-game line)", () => {
  const body = {
    homeTeamOdds: { close: { pointSpread: { american: '-3.5' }, spread: { american: '-108' }, moneyLine: { american: '-180' } }, current: { pointSpread: { american: '-8.5' }, spread: { american: '-112' } } },
    awayTeamOdds: { close: { pointSpread: { american: '+3.5' }, spread: { american: '-112' }, moneyLine: { american: '+150' } }, current: { pointSpread: { american: '+8.5' } } },
    close: { total: { american: '45.5' }, over: { american: '-110' }, under: { american: '-110' } },
    current: { total: { american: '51.5' } },
  };
  const l = linesOfBody(body);
  assert.equal(l.spread.away.line, 3.5);
  assert.equal(l.total.line, 45.5);
  // (no close kept: none, not the live line)
  const live = linesOfBody({ homeTeamOdds: { current: body.homeTeamOdds.current }, awayTeamOdds: { current: body.awayTeamOdds.current }, current: body.current });
  assert.equal(live.spread.home.line, null);
  assert.equal(live.total.line, null);
});

test("B3: the main rung is the one priced nearest even, not the most listed; a prop's close is its own rung where priced", () => {
  const it = (line, odds) => ({ current: { target: { value: line } }, odds: { american: { value: String(odds) } } });
  // (0.5 at -165 / +120 and 1.5 at +300 / -450, the 1.5 listed twice as often: 0.5 is the main)
  const list = [it(0.5, -165), it(0.5, 120), it(1.5, 300), it(1.5, -450), it(1.5, 300), it(1.5, -450)];
  const m = mainRung(list);
  assert.equal(m.line, 0.5);
  assert.deepEqual(m.ladder.map((x) => x.line), [0.5, 1.5]);
  // (no prices, the NFL's board: the most listed, as before)
  const bare = (line) => ({ current: { target: { value: line } } });
  assert.equal(mainRung([bare(42.5), bare(42.5), bare(40.5)]).line, 42.5);
  // (the close at the bet's own rung)
  const board = [{ athlete: { id: 7 }, stat: { key: 'pts' }, line: 0.5, prices: { over: -165, under: 120 }, ladder: [{ line: 0.5, prices: { over: -165, under: 120 } }, { line: 1.5, prices: { over: 300, under: -450 } }] }];
  const c = propCloseOf({ athlete: '7', propType: 'pts', line: 1.5, side: 'under' }, board);
  assert.equal(c.line, 1.5);
  assert.equal(c.odds, -450);
  assert.equal(propCloseOf({ athlete: '7', propType: 'pts', line: 2.5, side: 'over' }, board).line, 0.5);
});

test('revalueClv: an older row valued again from its kept close, once; the live desk brings every v2 row to v3 the same way', () => {
  const bet = { market: 'prop', propType: 'sog', side: 'over', line: 2.5, odds: 120, fair: 0.44, close: { line: 3.5, odds: -150, fair: 0.58, source: 'close' }, clv: { pts: -1, prob: null, ev: null, beat: false } };
  assert.equal(revalueClv(bet, null, null, () => propCarry(params)), true);
  assert.equal(bet.clv.v, CLV_V);
  assert.equal(bet.clv.result, 'line moved');
  assert.ok(Number.isFinite(bet.clv.q) && bet.clv.carried, `the close carried to 2.5 for the trust fit: ${JSON.stringify(bet.clv)}`);
  assert.equal(revalueClv(bet, null, null, () => null), false);
  const same = { market: 'prop', side: 'over', line: 0.5, odds: 175, close: { line: 0.5, odds: 155, fair: 0.3666, source: 'close' }, clv: { pts: 0, prob: 0.0267, ev: 0.0083, q: 0.3666, beat: true, result: 'beat', v: 2 } };
  assert.equal(revalueClv(same, null, null), true);
  near(same.clv.prob, 0.3666 - 100 / 275);
  assert.equal(same.clv.result, 'beat');
  assert.equal(same.clv.cents, 2.2, "+175 against a fair +172.8");
});
