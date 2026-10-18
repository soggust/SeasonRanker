// CLV defined right (round F, 2026-10-18, the loss review's B1-B6; libs/ranker/scripts/model/clv.mjs): the bet's own
// price against the close's no-vig chance at the bet's own line. A price that didn't move is 0 (the vig never read as
// lost value); a moved line is carried to the bet's line (the margins' chances, a prop's stat spread) or left out
// with its reason, never a zero or a loss; beat / tie / lose. The close is DraftKings' close, never ESPN's current
// (an in-game line), and a prop's is the bet's own rung of the ladder where the board prices it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLV_TIE, CLV_V, clvOf, clvSummary, linesOfBody, propCarry, propCloseOf, revalueClv } from '../libs/ranker/scripts/model/clv.mjs';
import { mainRung } from '../libs/ranker/scripts/model/props.mjs';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const params = { r: 6 };

test('a price unchanged at the close is a tie at 0, whatever the vig; ev keeps the vig apart', () => {
  // (a hits over at -159 that closed at -159: the old prop row read ev -0.0659, the gates a loss)
  const c = clvOf({ market: 'prop', side: 'over', line: 0.5, odds: -159, fair: 0.5735 }, { line: 0.5, odds: -159, fair: 0.5735 }, null);
  assert.equal(c.prob, 0);
  assert.equal(c.result, 'tie');
  assert.equal(c.beat, null);
  assert.ok(c.ev < -0.05, `ev ${c.ev}`);
  assert.equal(c.v, CLV_V);
  // (a moneyline whose fair came from another book when it bet: its own price, not the other book's fair, is compared)
  const ml = clvOf({ market: 'ml', side: 'home', line: null, odds: -192, fair: 0.6341 }, { line: null, odds: -192, fair: 0.6309 }, 1.6);
  assert.equal(ml.prob, 0);
  // (a better price than the close: beat; a worse one: lose)
  assert.equal(clvOf({ market: 'ml', side: 'home', line: null, odds: -120, fair: 0.53 }, { line: null, odds: -135, fair: 0.55 }, 1.6).result, 'beat');
  assert.equal(clvOf({ market: 'ml', side: 'home', line: null, odds: -140, fair: 0.56 }, { line: null, odds: -125, fair: 0.535 }, 1.6).result, 'lose');
  assert.ok(CLV_TIE > 0 && CLV_TIE < 0.005);
});

test('a prop whose line moved is carried to its own line through the stat spread, or left out with its reason', () => {
  const carry = propCarry(params);
  // (Kyle Connor's over 1.5 at +165, the board's main closing 0.5 at -245: valued at 1.5)
  const bet = { market: 'prop', side: 'over', line: 1.5, odds: 165, fair: 0.37 };
  const close = { line: 0.5, odds: -245, fair: 0.69 };
  const c = clvOf(bet, close, null, null, carry);
  assert.ok(Number.isFinite(c.prob) && c.q < 0.69 && c.q > 0.2, JSON.stringify(c));
  assert.equal(c.pts, -1);
  // (the carry is consistent: the close's own line gives back its own fair chance)
  near(carry('over', 0.5, 0.69, 0.5), 0.69, 1e-3);
  near(carry('under', 2.5, 0.55, 2.5), 0.55, 1e-3);
  // (an over's line rising for the close: the bet's lower line worth more than the close's fair)
  assert.ok(carry('over', 3.5, 0.5, 2.5) > 0.5);
  // (no stat spread: left out, said why, never a zero)
  const out = clvOf(bet, close, null);
  assert.equal(out.prob, null);
  assert.equal(out.beat, null);
  assert.match(out.why, /line moved from 1.5 to 0.5/);
  // (no closing price: left out)
  assert.equal(clvOf(bet, { line: 1.5, odds: null, fair: null }, null).why, 'no closing price');
  // (the summary: rows left out counted apart, never in the mean)
  const s = clvSummary([{ clv: c }, { clv: out }, { clv: clvOf(bet, { line: 1.5, odds: 165, fair: 0.37 }, null) }]);
  assert.equal(s.n, 2);
  assert.equal(s.out, 1);
  assert.equal(s.tie, 0.5);
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

test('revalueClv: an older row valued again from its kept close, once', () => {
  const bet = { market: 'prop', propType: 'sog', side: 'over', line: 2.5, odds: 120, fair: 0.44, close: { line: 3.5, odds: -150, fair: 0.58, source: 'close' }, clv: { pts: -1, prob: null, ev: null, beat: false } };
  assert.equal(revalueClv(bet, null, null, () => propCarry(params)), true);
  assert.equal(bet.clv.v, CLV_V);
  assert.ok(bet.clv.prob > 0, `the close carried to 2.5 from an over-favored 3.5: ${bet.clv.prob}`);
  assert.equal(revalueClv(bet, null, null, () => null), false);
});
