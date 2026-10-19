// The totals (DECISIONS.md D39): the Bot's own totals lean is noise at the close in every sport, so a total's trust
// starts at 0 by rule and climbs only on the Bot's own graded totals since the epoch, and a total is bet only where
// the named terms (the soft schedule terms, D34) earn it: their shift rides on the Book's fair at full weight,
// the rest of the lean at the trust.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TRUST_START, chanceAt, price, trustStart } from '../libs/ranker/scripts/model/desk.mjs';
import { cond, totalChances, totalSplit } from '../libs/ranker/scripts/model/margins.mjs';
import { repriced } from '../libs/ranker/scripts/model/backtest.mjs';
import { namedIdx } from '../libs/ranker/scripts/model/ratings.mjs';

const src = (f) => fs.readFileSync(path.resolve('libs/ranker/scripts/model', f), 'utf8');
const lines = { spread: { home: { line: -2.5, odds: -110 }, away: { line: 2.5, odds: -110 } }, total: { line: 46.5, over: -110, under: -110 }, ml: { home: -140, away: 120 } };
const params = { sigma: 13, sigmaT: 10 };

test('D39 a total starts at trust 0; the other markets at the desk\'s 0.5', () => {
  assert.deepEqual(TRUST_START, { total: 0 });
  assert.equal(trustStart('total'), 0);
  assert.equal(trustStart('spread'), 0.5);
  assert.equal(trustStart('ml', 0.4), 0.4);
});

test('D39 the split: the base is the Bot\'s total less the named terms, the named shift a chance at the line; none without a context', () => {
  const exp = { margin: 2, total: 48, homePts: 25, awayPts: 23, namedT: 1.2 };
  const t = totalSplit(exp, 46.5, 10);
  assert.ok(Math.abs(cond(t.c) - cond(totalChances(46.8, 46.5, 10))) < 1e-12, 'the base at 48 - 1.2');
  assert.ok(Math.abs(t.named - Math.round((cond(totalChances(47.7, 46.5, 10)) - 0.5) * 1e4) / 1e4) < 1e-12, 'the named shift at the line + 1.2');
  assert.ok(t.named > 0 && t.named < 0.1);
  assert.equal(totalSplit({ total: 48 }, 46.5, 10).named, null, 'no context: no shift');
  assert.equal(totalSplit({ total: 48, namedT: 0 }, 46.5, 10).named, 0, 'the terms moving nothing: a shift of 0');
  // (price carries it on both sides, signed)
  const m = price({ id: 1 }, exp, lines, params).find((x) => x.market === 'total');
  assert.equal(m.sides[0].named, t.named);
  assert.equal(m.sides[1].named, -t.named);
  assert.ok(Math.abs(m.sides[0].model - cond(t.c)) < 1e-12);
  assert.equal(price({ id: 1 }, { total: 48, margin: 2, homePts: 25, awayPts: 23 }, lines, params).find((x) => x.market === 'total').sides[0].named, undefined);
  assert.deepEqual(namedIdx({ t: [{ key: 'a' }, { key: 'b', soft: true }, { key: 'c', soft: true }] }), [1, 2]);
});

test('D39 the chance: at trust 0 the Book\'s fair plus the named shift alone, the base\'s lean at the trust on top; the backtest\'s rows carry the shift', () => {
  const p0 = chanceAt('total', 0.5, 0.56, 0, { named: 0.03 });
  assert.ok(Math.abs(p0 - 0.53) < 1e-12, `trust 0: ${p0}`);
  const p1 = chanceAt('total', 0.5, 0.56, 1, { named: 0.03 });
  assert.ok(Math.abs(p1 - 0.59) < 1e-12, `trust 1: ${p1}`);
  assert.equal(chanceAt('total', 0.5, 0.56, 0), 0.5, 'no shift: the fair alone at trust 0');
  assert.equal(chanceAt('total', 0.5, 0.56, 0, { named: -0.02 }), 0.48);
  const exp = { margin: 2, total: 48, homePts: 25, awayPts: 23, namedT: 1.2 };
  const rows = repriced([{ event: '1', market: 'total', side: 'under', line: 46.5, fair: 0.5, odds: -110 }, { event: '1', market: 'total', side: 'over', line: 46.5, fair: 0.5, odds: -110 }], () => exp, params);
  assert.ok(rows[0].named < 0 && rows[1].named > 0 && rows[0].named === -rows[1].named, 'the shift on each side, signed');
  assert.equal(repriced([{ event: '1', market: 'total', side: 'over', line: 46.5, fair: 0.5, odds: -110 }], () => ({ total: 48, margin: 2 }), params)[0].named, undefined);
});

test('D39 the live fit: a total\'s trust from the Bot\'s own graded totals since the epoch alone, from 0; the gate and the history the same; the bet carries its shift', () => {
  const run = src('run.mjs');
  assert.ok(/const evidenceOf = market === 'total' \? live\.filter\(\(b\) => b\.market === market\) : \[\.\.\.backtest\.filter/.test(run), 'never the backtest for a total');
  assert.ok(/market === 'total' \? TRUST_START\.total : START_TRUST\)/.test(run));
  assert.ok(/\.\.\.\(Number\.isFinite\(pick\.named\) \? \{ named: round\(pick\.named, 4\) \} : \{\}\)/.test(run), 'the bet carries the shift');
  assert.ok(/namedT: r\.feats \? namedT : null/.test(run), 'the live expectation carries the named terms');
  assert.ok(/exp\.namedT = fitT\.part\(f\.t, namedT\)/.test(src('ratings.mjs')), 'the replay too');
  assert.ok(/V\.desk\.fitTrust\(ledgerTotals, V\.desk\.trustStart\('total'\)\)/.test(src('gate.mjs')));
  assert.ok(/\(k\) => V\.desk\.trustStart\?\.\(k, 0\.5\) \?\? 0\.5, 'lines'/.test(src('gate-history.mjs')));
  assert.ok(/chanceAt\(b\.market, b\.fair, b\.model, t, Number\.isFinite\(b\.named\) \? \{ named: b\.named \} : null\)/.test(src('desk.mjs')), 'the trust fit prices the shift the same way');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D39.'));
});
