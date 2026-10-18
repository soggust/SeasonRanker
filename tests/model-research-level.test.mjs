// The research says it likes it, and earns its level (the owner's, 2026-10-18: "when you can't find info like
// Corum, at a certain point we have to just say we like it"). A real answer (its searches ran, sources read, not
// hollow) that found nothing is the "no real reason" outcome at low confidence too: the model's side priced at the
// trust, its lean held at half the GAP, an edge bet, none passed. Only a low answer naming a real reason it can't
// size stays a CHECK. And the research bets graduate on their own scorecard, as check-learn's graded causes do a
// role (props.mjs roleGateOf): the practice stake and a LIKE at most under 40 graded; at 40 or more over
// break-even with the CLV 0 or better, the Kelly stake and level (LOVE and LOCK possible); else practice, never off.

import assert from 'node:assert/strict';
import test from 'node:test';
import { clearedChanceAt, practiceGates } from '../libs/ranker/scripts/model/desk.mjs';
import { levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { RESEARCH_LEVEL_N, RESEARCH_UNITS, researchCall, researchCard, researchDecision, researchEarned, researchGateOf, researchLevelOf, verdictOf } from '../libs/ranker/scripts/model/research.mjs';

const now = new Date('2026-10-18T13:00:00Z');
const src = ['https://www.rotowire.com/football/player/blake-corum-17690', 'https://www.foxsports.com/nfl/ronnie-rivers-player'];
const check = (over = {}) => ({ id: '401872777:prop:receptions:4429096', event: '401872777', start: '2026-10-18T20:05:00Z', market: 'prop', propType: 'receptions', player: 'Blake Corum', side: 'under', line: 1.5, odds: -110, model: 0.72, fair: 0.5, cause: 'gap', ...over });
// (Blake Corum Under 1.5 Receptions, as checks.json has it)
const corum = { player: 'Blake Corum', status: 'unknown', reason: 'none', summary: 'No injury, role or lineup news found for this game. Corum is still Kyren Williams\' backup and caught 3 of 4 targets in Week 5.', sources: src, explains: false, category: 'market', confidence: 'low' };
const x = { side: 'under', fair: 0.5, model: 0.72, odds: +100, push: 0, guarded: true, shadow: false };
// (a graded research bet: won or lost at a price, its close)
const graded = (status, { odds = -110, clv = 0.01, kind = 'researchBet' } = {}) => ({ [kind]: kind === 'researchBet' ? { check: 'x' } : { checks: ['x'], own: true }, status, odds, profit: status === 'won' ? 0.909 : -1, clv: Number.isFinite(clv) ? { ev: clv - 0.045, prob: clv, beat: clv > 0 } : null });
const record = (won, lost, opts) => [...Array.from({ length: won }, () => graded('won', opts)), ...Array.from({ length: lost }, () => graded('lost', opts))];

test("Corum: a real answer that found nothing at low confidence is a bet verdict, priced at the trust with the lean held at half the GAP", () => {
  assert.equal(verdictOf(corum), 'bet');
  const call = researchCall(check(), corum, { now });
  assert.equal(call.act, 'bet');
  assert.equal(call.units, RESEARCH_UNITS);
  assert.equal(call.confidence, 'low');
  assert.ok(!call.earned);
  assert.match(call.why, /no real-world reason for the gap \(low confidence\): No injury, role or lineup news found/);
  const d = researchDecision({ ...call, side: 'under' }, x, 0.5);
  assert.equal(d.as, 'bet');
  assert.equal(d.p, Math.round(clearedChanceAt('prop', 0.5, 0.72, 0.5) * 1e4) / 1e4);
  assert.ok(d.ev > 0);
  assert.match(d.why, /bet at 0\.5u at most \(researchBet\), out of the CHECKs/);
  // (no edge at the price: passed with the reason, out of the CHECKs, never a CHECK)
  const vig = researchDecision({ ...call, side: 'under' }, { ...x, odds: -130 }, 0.5);
  assert.equal(vig.as, 'pass');
  assert.match(vig.why, /^no edge .*passed, out of the CHECKs/);
});

test('only a low answer naming a real reason stays a CHECK; a failed or hollow call is still re-asked, never a bet', () => {
  assert.equal(verdictOf({ ...corum, explains: true, category: 'role', reason: 'role', summary: 'Rivers is out, so Corum may see more passing-down work.' }), 'check');
  assert.match(researchCall(check(), { ...corum, explains: true, category: 'role' }, { now }).why, /can't tell \(low confidence\)/);
  // (no sources: no search read, no answer)
  assert.equal(verdictOf({ ...corum, sources: [] }), 'check');
  // (the search failed: hollow, asked again)
  const failed = { ...corum, summary: 'The search tool hit its usage limit, so I found no reports on Corum.', sources: [] };
  assert.equal(verdictOf(failed), 'check');
  assert.match(researchCall(check(), failed, { now }).why, /the research call failed/);
  assert.equal(verdictOf({ ...corum, problem: 'stopped: search failed (search errors: max_uses_exceeded)' }), 'check');
  // (an older finding without the verdict's fields: a CHECK as before)
  const { explains: _e, category: _c, confidence: _f, ...old } = corum;
  assert.equal(verdictOf(old), 'check');
});

test('researchLevelOf: under 40 graded the practice stake; at 40+ over break-even with CLV 0 or better earned; below, practice', () => {
  const few = researchLevelOf(record(30, 9));
  assert.equal(few.earned, false);
  assert.equal(few.n, 39);
  assert.match(few.why, /practice stake \(0\.5u, a LIKE at most\): 39 graded 30-9 .*under 40/);
  const good = researchLevelOf(record(28, 15));
  assert.equal(RESEARCH_LEVEL_N, 40);
  assert.equal(good.earned, true);
  assert.deepEqual([good.n, good.won, good.lost], [43, 28, 15]);
  assert.equal(good.breakEven, Math.round((110 / 210) * 1e4) / 1e4);
  assert.match(good.why, /^research bets at their Kelly stake and level: 43 graded 28-15 \(65%, break-even 52%\), CLV \+0\.01/);
  // (the record under break-even, or the CLV negative, or none closed: practice still, never off)
  assert.equal(researchLevelOf(record(20, 23)).earned, false);
  assert.match(researchLevelOf(record(20, 23)).why, /not over break-even with the CLV 0 or better/);
  assert.equal(researchLevelOf(record(28, 15, { clv: -0.01 })).earned, false);
  assert.equal(researchLevelOf(record(28, 15, { clv: null })).earned, false);
  // (research-adjusted bets on their own market count; the game's other markets priced with them, voids and open ones don't)
  const mixed = [...record(14, 7), ...record(14, 8, { kind: 'researchAdjusted' })];
  assert.equal(researchLevelOf(mixed).n, 43);
  const others = [{ researchAdjusted: { own: false }, status: 'won', odds: -110, clv: { ev: 0.1 } }, { researchBet: {}, status: 'won', void: true }, { researchBet: {}, status: 'open' }];
  assert.equal(researchLevelOf([...mixed, ...others]).n, 43);
});

test('an earned level: the call carries earned (no 0.5u cap), unless its own gate is at practice; the decision says its Kelly stake', () => {
  const level = researchLevelOf(record(28, 15));
  const gate = practiceGates(researchGateOf(record(28, 15)));
  assert.ok(researchEarned(level, gate, 'bet'));
  const call = researchCall(check(), corum, { now, gate, level });
  assert.equal(call.act, 'bet');
  assert.equal(call.earned, true);
  assert.equal(call.units, undefined);
  const d = researchDecision({ ...call, side: 'under' }, x, 0.5);
  assert.match(d.why, /bet at its Kelly stake \(the research has earned its level\) \(researchBet\)/);
  // (the kind's own gate at practice (its units negative over 40): the practice stake, the level notwithstanding)
  const practicing = { ...gate, bet: { ...gate.bet, practice: true } };
  assert.equal(researchEarned(level, practicing, 'bet'), false);
  assert.equal(researchCall(check(), corum, { now, gate: practicing, level }).units, RESEARCH_UNITS);
  // (not earned: as before)
  assert.equal(researchCall(check(), corum, { now, gate, level: researchLevelOf(record(10, 2)) }).units, RESEARCH_UNITS);
  // (the scorecard carries the level)
  assert.equal(researchCard([], [], gate, now, level).level.earned, true);
});

test('levelOf: a research bet a LIKE at most till earned; earned, its Kelly band (LOVE, LOCK possible), a LIKE at least; practice holds it', () => {
  const b = { intent: 'edge', p: 0.6, researchBet: { check: 'x' } };
  assert.equal(levelOf(b, 0.06, 0.6), 'medium');
  assert.equal(levelOf({ ...b, researchBet: { check: 'x', earned: true } }, 0.06, 0.6), 'lock');
  assert.equal(levelOf({ ...b, researchBet: { check: 'x', earned: true } }, 0.03, 0.52), 'high');
  assert.equal(levelOf({ ...b, researchBet: { check: 'x', earned: true } }, -0.002, 0.52), 'medium');
  assert.equal(levelOf({ ...b, researchBet: { check: 'x', earned: true }, practice: 'props CLV gate' }, 0.06, 0.6), 'medium');
  const a = { intent: 'edge', p: 0.6, researchAdjusted: { checks: ['x'], own: true } };
  assert.equal(levelOf(a, 0.06, 0.6), 'medium');
  assert.equal(levelOf({ ...a, researchAdjusted: { ...a.researchAdjusted, earned: true } }, 0.06, 0.6), 'lock');
});
