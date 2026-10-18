// A CHECK the research answered is decided, never left a CHECK by the guard that made it (research.mjs
// researchDecision, researchInputs' uncarried; desk.mjs clearedChanceAt; the owner's, 2026-10-18: "if the book has
// a real reason, add it to the calculation, don't auto pass"). Three ways: (a) nothing explains the gap, or the
// reason's in the inputs: priced at the market's trust (not the book's own chance the GAP's taper pins it to, its
// return only the vig), an edge bet at 0.5u at most, none passed; (b) a real reason no input carries: passed, its
// reason kept; (c) the research can't tell: a CHECK. Run 39100356476's 20 CHECKs all sat at ev about -0.055 (the
// vig): trust 0, from the book.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GAP, chanceAt, clearedChanceAt } from '../libs/ranker/scripts/model/desk.mjs';
import { RESEARCH_UNITS, researchCall, researchDecision, researchInputs, researchPriced } from '../libs/ranker/scripts/model/research.mjs';

const now = new Date('2026-10-18T05:00:00Z');
const src = ['https://news.example/a'];
// (Braelon Allen Under 14.5 Rec Yds as run 39100356476 had it: the model's 67.5% against the book's 49.6%)
const allen = { side: 'under', fair: 0.4958, model: 0.6749, odds: -110, push: 0, guarded: true, shadow: false };

test("past the GAP the plain chance is the book's own (trust 0, the vig); a cleared one keeps the lean held inside the GAP", () => {
  assert.equal(chanceAt('prop', allen.fair, allen.model, 0.5), allen.fair);
  const p = clearedChanceAt('prop', allen.fair, allen.model, 0.5);
  assert.ok(Math.abs(p - (allen.fair + 0.5 * GAP.prop / 2)) < 1e-12);
  // (inside half the GAP the two agree: a cleared CHECK is priced as any prop there)
  assert.equal(clearedChanceAt('prop', 0.5, 0.55, 0.4), chanceAt('prop', 0.5, 0.55, 0.4));
  // (the other way: the lean below the book's)
  assert.ok(clearedChanceAt('prop', 0.6, 0.3, 0.5) < 0.6);
});

test('(a) the reason in the inputs (held, on the report already): priced at the trust, an edge bet, out of the CHECKs', () => {
  const call = { act: 'adjust', note: { held: true, input: 'Breece Hall out (teammate, on the report already)' }, side: 'under' };
  assert.equal(researchPriced(call), true);
  const d = researchDecision(call, allen, 0.5);
  assert.equal(d.as, 'bet');
  assert.ok(d.p > allen.fair && d.ev > 0, `p ${d.p} ev ${d.ev}`);
  assert.match(d.why, new RegExp(`bet at ${RESEARCH_UNITS}u at most \\(researchAdjusted\\)`));
  // (a trust too low for the price: no edge, passed, never a CHECK)
  const low = researchDecision(call, { ...allen, odds: -125 }, 0.1);
  assert.equal(low.as, 'pass');
  assert.match(low.why, /no edge/);
});

test("(a) nothing explains the gap (verdict bet): priced at the trust on the side it looked into, a researchBet", () => {
  const call = { act: 'bet', side: 'under', why: 'research found no real-world reason for the gap (high confidence)' };
  const d = researchDecision(call, allen, 0.5);
  assert.equal(d.as, 'bet');
  assert.match(d.why, /researchBet/);
  assert.equal(researchDecision(call, { ...allen, side: 'over' }, 0.5), null);
});

test('(a) a stale stored price (no newer one to be had) decides it at the stored price; the book taking it down passes it; an owed ask or the news waits', () => {
  const call = { act: 'adjust', note: { held: true, input: 'x' } };
  const stale = researchDecision(call, allen, 0.5, { keyed: true, stored: 'stale' });
  assert.equal(stale.as, 'bet');
  assert.match(stale.why, /at its stored price/);
  assert.equal(researchDecision(call, allen, 0.5, { keyed: true, stored: 'pulled' }).as, 'pass');
  assert.equal(researchDecision(call, allen, 0.5, { keyed: true, priced: false, fresh: true }).as, 'pass');
  assert.equal(researchDecision(call, allen, 0.5, { keyed: true, priced: false, fresh: false, asksLeft: true }).as, 'check');
  assert.equal(researchDecision(call, allen, 0.5, { keyed: true, priced: false, fresh: false, asksLeft: false }).as, 'pass');
  assert.equal(researchDecision(call, allen, 0.5, { waiting: ['the lineups not posted'] }).as, 'check');
});

test("(b) a real reason no input carries (a role alone, another reason with no status): uncarried, passed with its reason", () => {
  const c = { id: 'g:prop:rec:1', athlete: '1', team: '2', side: 'under', start: '2026-10-18T17:00Z', cause: 'role' };
  const role = researchInputs(c, { player: 'Jalen Nailor', athlete: '1', status: 'active', reason: 'role', category: 'role', explains: true, confidence: 'medium', sources: src, at: now.toISOString() }, 'nfl', { now });
  assert.equal(role.uncarried, true);
  const other = researchInputs(c, { player: 'Blake Corum', athlete: '1', status: 'active', reason: 'none', category: 'other', explains: true, confidence: 'medium', sources: src, at: now.toISOString() }, 'nfl', { now });
  assert.equal(other.uncarried, true);
  // (a stale or unsourced finding the report contradicts: the research can't tell, not uncarried)
  const report = new Map([['2', [{ id: '9', name: 'Pat Freiermuth', status: 'Questionable' }]]]);
  assert.equal(researchInputs(c, { player: 'Pat Freiermuth', athlete: '9', status: 'questionable', reason: 'injury', category: 'injury', sources: [], at: now.toISOString() }, 'nfl', { now, report }).uncarried, undefined);
  const d = researchDecision({ act: 'pass', why: 'passed: a role alone' }, allen, 0.5);
  assert.equal(d.as, 'pass');
  assert.equal(d.why, 'passed: a role alone');
  // (only on a CHECK guard's skip; never a shadow)
  assert.equal(researchDecision({ act: 'pass', why: 'x' }, { ...allen, guarded: false }, 0.5), null);
  assert.equal(researchDecision({ act: 'pass', why: 'x' }, { ...allen, shadow: true }, 0.5), null);
});

test("(c) the research can't tell (a real reason found at low confidence, unsized): not the research's to decide, a CHECK", () => {
  const c = { id: 'g:prop:rushYds:1', side: 'under', start: '2026-10-18T17:00Z', cause: 'role' };
  const call = researchCall(c, { player: 'Cam Ward', status: 'active', reason: 'role', explains: true, category: 'role', confidence: 'low', sources: src }, { now });
  assert.equal(call.act, 'check');
  assert.equal(researchPriced(call), false);
  assert.equal(researchDecision(call, allen, 0.5), null);
});
