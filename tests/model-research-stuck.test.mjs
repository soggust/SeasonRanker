// The four CHECKs desk run 39149746443 (2026-10-18 17:46 UTC) left stuck, and the NHL's 0 bets after the epoch:
// a research call cut by the run's deadline counted as a failed try (Blake Corum Under 6.5 Rec Yds, MarShawn Lloyd
// Under 11.5 Carries: never asked again), a research bet a cap left out reopened as a CHECK (Blake Corum Under
// 53.5 Rush+Rec Yds), a research-passed CHECK reopened and listed (Tyler Higbee Over 32.5 Rec Yds); and the NHL's
// pricing after 940fd86a, checked to be conservatism, not an edge zeroed
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aiBudget } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { calSides } from '../libs/ranker/scripts/model/calib.mjs';
import { closeChecks, listedCheck, researchPassed } from '../libs/ranker/scripts/model/checks.mjs';
import { BUCKET_START, GAP, bucketTrustOf, chanceAt, decimal } from '../libs/ranker/scripts/model/desk.mjs';
import { CALL_TIMEOUT_MS, MIN_CALL_MS, callChecks, errorText, failedWords, researchCall, researchChecks, researchDecision, resetDeadline, retryState, unplacedCall } from '../libs/ranker/scripts/model/research.mjs';

const quiet = { log: () => {}, warn: () => {} };
const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
const now = new Date('2026-10-18T17:46:00Z');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stuck-')), 'ai-usage.json');
const prop = (o = {}) => ({ id: '401873004:prop:recYds:4429096', event: '401873004', sport: 'nfl', start: '2026-10-18T20:05Z', matchup: 'ARI @ LAR', market: 'prop', propType: 'recYds', statLabel: 'Rec Yds', player: 'Blake Corum', athlete: '4429096', side: 'under', line: 6.5, odds: -123, model: 0.7042, fair: 0.5221, gap: 0.18, cause: 'role', trust: 0.5, projection: { mean: 6.74 }, diagnosis: { cause: 'role', why: 'part-time' }, ...o });
const answer = (finding) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(finding) }], usage: { input_tokens: 20000, output_tokens: 1000, server_tool_use: { web_search_requests: 2 } } });
const found = { player: 'Blake Corum', status: 'active', reason: 'none', explains: false, category: 'market', confidence: 'medium', summary: 'Nothing new.', sources: ['https://a.b/c'] };
const timeout = () => Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
// (the old max_uses 2 answer kept on both CHECKs)
const hollowOld = { at: '2026-10-18T01:08:04Z', by: 'claude', player: 'Blake Corum', status: 'unknown', reason: 'none', explains: false, category: 'market', confidence: 'low', summary: 'The search tool hit its usage limit, so I found no reports.', sources: [] };

test("the research's tries: a deadline's cut not counted, two failed then one simpler fallback, then given up; Corum's and Lloyd's real logs reach the fallback", () => {
  assert.equal(retryState([]), 'ask');
  assert.equal(retryState([{ failed: true }]), 'ask');
  // (run 39085184575's then 39090213335's: a max_uses 2 answer, then a timeout at the deadline, logged before the cut flag)
  assert.equal(retryState([{ finding: hollowOld }, { failed: true }]), 'fallback');
  assert.equal(retryState([{ failed: true }, { finding: hollowOld }]), 'fallback');
  // (a deadline's cut not counted)
  assert.equal(retryState([{ failed: true }, { failed: true, cut: true }]), 'ask');
  assert.equal(retryState([{ failed: true }, { failed: true }, { failed: true, fallback: true, cut: true }]), 'fallback');
  assert.equal(retryState([{ failed: true }, { failed: true }, { failed: true, fallback: true }]), 'done');
  assert.equal(retryState(Array.from({ length: 5 }, () => ({ failed: true, cut: true }))), 'done');
  // (a kept finding among them: nothing to retry)
  assert.equal(retryState([{ failed: true }, { finding: found }]), null);
  // (the words: what failed and what's next, never "asked again" of one given up)
  assert.match(failedWords({ tries: 2, error: 'Request timed out.', next: 'fallback' }), /asked once more, alone and simpler/);
  const done = failedWords({ tries: 3, error: '429 rate_limit_error slow down', next: 'done' });
  assert.match(done, /last: 429 rate_limit_error slow down/);
  assert.match(done, /not asked again/);
  assert.match(researchCall(prop(), hollowOld, { now, failure: { tries: 3, error: 'x', next: 'done' } }).why, /not asked again/);
  // (the error's words: its status, the API's type, its message)
  assert.equal(errorText(Object.assign(new Error('slow down'), { status: 429, error: { error: { type: 'rate_limit_error' } } })), '429 rate_limit_error slow down');
  assert.equal(errorText(timeout()), 'APIConnectionTimeoutError Request timed out.');
});

test('the research run: no call started the deadline would cut; a timeout the deadline brought on logged cut with its error, not a try; the fallback alone and first', async () => {
  resetDeadline();
  let t = 0;
  const clock = () => t;
  const file = tmp();
  // (an NBA call at 0 sets the run's deadline at 180s)
  const first = { beta: { messages: { create: async () => answer(found) } } };
  await researchChecks({ sport: 'nba', checks: [prop({ id: 'n1', sport: 'nba' })], now, env, budget: aiBudget({ file, now, log: quiet }), client: first, log: quiet, clock });
  // (120s in, 60s left: started, its request's timeout the 60s; timing out there, cut)
  t = 120_000;
  const seen = [];
  const late = { beta: { messages: { create: async (_req, o) => (seen.push(o.timeout), Promise.reject(timeout())) } } };
  await researchChecks({ sport: 'nfl', checks: [prop()], now, env, budget: aiBudget({ file, now, log: quiet }), client: late, log: quiet, clock });
  assert.deepEqual(seen, [60_000]);
  assert.ok(seen[0] < CALL_TIMEOUT_MS);
  const e = aiBudget({ file, now, log: quiet }).list().find((x) => x.id === prop().id);
  assert.equal(e.failed, true);
  assert.equal(e.cut, true);
  assert.equal(e.error, 'APIConnectionTimeoutError Request timed out.');
  assert.equal(retryState([e]), 'ask');
  // (under MIN_CALL_MS left: nothing started)
  t = 180_000 - MIN_CALL_MS + 1;
  const idle = { beta: { messages: { create: async () => assert.fail('started with too little time left') } } };
  await researchChecks({ sport: 'mlb', checks: [prop({ id: 'm1', sport: 'mlb' })], now, env, budget: aiBudget({ file, now, log: quiet }), client: idle, log: quiet, clock });
  resetDeadline();
  // (the fallback: Lloyd's two failed tries, asked first and alone (nothing in flight beside it), simpler; then
  // the new CHECK)
  const file2 = tmp();
  const lloyd = prop({ id: '401873007:prop:rushAtt:4429023', player: 'MarShawn Lloyd', propType: 'rushAtt', statLabel: 'Carries', line: 11.5, start: '2026-10-19T00:20Z', research: { ...hollowOld, player: 'MarShawn Lloyd' } });
  fs.writeFileSync(file2, JSON.stringify({ entries: [{ at: '2026-10-18T01:08:39Z', what: 'check-research', sport: 'nfl', id: lloyd.id, cost: 0.31, failed: true }, { at: '2026-10-18T01:49:10Z', what: 'check-research', sport: 'nfl', id: lloyd.id, cost: 0.12, finding: { ...hollowOld, player: 'MarShawn Lloyd' } }] }));
  let inFlight = 0;
  const order = [];
  const client = {
    beta: {
      messages: {
        create: async (req) => {
          order.push({ uses: req.tools[0].max_uses, beside: inFlight++ });
          await new Promise((res) => setTimeout(res, 5));
          inFlight--;
          return answer(found);
        },
      },
    },
  };
  const got = await researchChecks({ sport: 'nfl', checks: [lloyd, prop({ id: 'new' })], now, env, budget: aiBudget({ file: file2, now, log: quiet }), client, log: quiet });
  assert.deepEqual(order, [{ uses: 3, beside: 0 }, { uses: 5, beside: 0 }]);
  assert.ok(got.has(lloyd.id));
  assert.equal(aiBudget({ file: file2, now, log: quiet }).list().at(-2).fallback, true);
  resetDeadline();
});

test("the research's calls on a CHECK closed or passed earlier: decided again while its game's to come (Higbee's pass, Corum's bet)", () => {
  const call = { act: 'pass', why: 'passed: the research says so', at: '2026-10-18T13:05:39Z', decided: true };
  const higbee = prop({ id: 'h', hidden: true, research: { ...found, explains: true, category: 'role', call } });
  const corum = prop({ id: 'c', closedAt: '2026-10-18T13:59:41Z', research: { ...found, call: { act: 'bet', why: 'research found no real-world reason' } } });
  const plain = prop({ id: 'p', research: found });
  const closedNoCall = prop({ id: 'x', closedAt: '2026-10-18T13:59:41Z', research: found });
  const started = prop({ id: 's', hidden: true, start: '2026-10-18T17:00Z', research: { ...found, call } });
  const graded = prop({ id: 'g', checkResult: { status: 'won' }, research: { ...found, call } });
  assert.deepEqual(callChecks([higbee, corum, plain, closedNoCall, started, graded], (c) => c.research, now).map((c) => c.id), ['h', 'c', 'p']);
});

test('a research bet a cap leaves out: passed with the cap, decided, closed and never listed; a passed one never listed whatever reopened it', () => {
  // (Corum Under 53.5 at 13:59: ev +0.0138 at the cleared chance, a bet; the one-prop-a-player cap left it out)
  const call = { act: 'bet', units: 0.5, why: 'research found no real-world reason for the gap (medium confidence): nothing new' };
  const d = researchDecision(call, { side: 'under', fair: 0.4958, model: 0.6195, odds: -110, push: 0, guarded: true, shadow: false }, 0.5, { keyed: true, priced: true, fresh: true });
  assert.equal(d.as, 'bet');
  assert.ok(d.ev > 0);
  const out = unplacedCall(call, 'one prop a player a game: Rush Yds bet on him at a better return');
  assert.equal(out.act, 'pass');
  assert.equal(out.decided, true);
  assert.match(out.why, /^passed: its research bet not placed \(one prop a player a game/);
  const c = prop({ id: 'c', research: { ...found, call: { ...out, at: now.toISOString() } } });
  assert.equal(researchPassed(c), true);
  assert.equal(listedCheck(c, now), false);
  const ledger = { checks: [c] };
  assert.equal(closeChecks(ledger, new Set(['c']), now), 1);
  // (Higbee's: the research's pass, decided, on a CHECK its guard opened again: not listed)
  const higbee = prop({ id: 'h', pick: 'Tyler Higbee Over 32.5 Rec Yds', research: { ...found, call: { act: 'pass', why: 'passed: a role change no input carries', decided: true } } });
  assert.equal(listedCheck(higbee, now), false);
  assert.equal(listedCheck(prop({ id: 'o', research: { ...found, call: { act: 'check', why: 'still a CHECK' } } }), now), true);
});

test("the NHL after the epoch: 0 bets is the trust's conservatism, not an edge zeroed (calibration once, the line's own bucket, the lean's ceiling under the vig at 0.25)", () => {
  // (Damon Severson Over 0.5 Points +200, desk run 39149746443: raw 0.407, the spot's shift -0.06 (the pool's
  // -0.03 and the sport's -0.03), model 0.3926, the book's 0.3115, priced 0.3287 at the low bucket's 0.25)
  const calib = { spots: { 'pts|over|0.5': { kept: true, shift: -0.06 }, 'pts|under|0.5': { kept: true, shift: -0.06 } } };
  const s = calSides(calib, 'pts', 0.5, 0.407);
  assert.equal(Math.round(s.over * 1e4) / 1e4, 0.3926);
  // (the trust: the line's own bucket, held to the stat's own)
  const trust = { 'prop:pts': { trust: 0.5, lines: { low: { trust: 0.25 }, mid: { trust: 0.375 }, high: { trust: 0.5 } } } };
  assert.equal(bucketTrustOf(trust, 'prop:pts', 0.5), 0.25);
  assert.equal(bucketTrustOf(trust, 'prop:pts', 2.5), 0.375);
  assert.equal(bucketTrustOf(trust, 'prop:pts', 4.5), 0.5);
  assert.equal(bucketTrustOf({}, 'prop:pts', 1.5), BUCKET_START.low);
  const p = chanceAt('prop', 0.3115, s.over, 0.25);
  assert.equal(Math.round(p * 1e4) / 1e4, 0.3287);
  // (the most a lean can add at a trust: trust x half the GAP; at 0.25, 1.9 points, under -110's vig (2.4 points
  // over the no-vig 50%): no low line at a standard price can show an edge till the trust moves on graded rows)
  const most = (tr) => tr * (GAP.prop / 2);
  const evAt = (tr) => (0.5 + most(tr)) * decimal(-110) - 1;
  assert.ok(evAt(0.25) < 0);
  assert.ok(evAt(0.375) > 0);
  assert.ok(evAt(0.5) > 0);
});
