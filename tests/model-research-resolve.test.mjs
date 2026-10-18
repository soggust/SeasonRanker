// The CHECKs the research answered resolve (the owner's, 2026-10-18: "the CHECKs never resolve"). Medium
// confidence that nothing explains the gap is the "no real reason" outcome: the model's side at the practice
// stake, priced at the trust (an edge bet, none passed, either way out of the CHECKs). A call whose search failed
// ("I hit the search limit", max_uses_exceeded) is no finding: hollow, never a verdict, asked again ahead of the
// new CHECKs. Calls run PARALLEL at once inside the run's deadline, the soonest game first, under the caps.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aiBudget } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { clearedChanceAt } from '../libs/ranker/scripts/model/desk.mjs';
import { ESTIMATE, PARALLEL, RESEARCH_UNITS, hollow, researchCall, researchChecks, researchDecision, researchOne, resetDeadline, searchFailed, verdictOf } from '../libs/ranker/scripts/model/research.mjs';

const now = new Date('2026-10-18T13:00:00Z');
const quiet = { log: () => {}, warn: () => {} };
const src = ['https://news.example/a', 'https://news.example/b'];
const check = (over = {}) => ({ id: '401872999:prop:passTd:4360423', event: '401872999', sport: 'nfl', start: '2026-10-18T17:00:00Z', market: 'prop', propType: 'passTd', player: 'Michael Penix Jr.', athlete: '4360423', team: '1', side: 'under', line: 1.5, odds: -110, model: 0.7, fair: 0.5, gap: 0.2, cause: 'role', status: 'check', projection: { mean: 1.1 }, ...over });
// (the current CHECKs' findings, as picks.json had them)
const penix = { status: 'active', reason: 'none', player: 'Michael Penix Jr.', summary: 'Penix hurt his ribs in Week 5 but practiced fully all week. He has no injury designation.', sources: src, explains: false, category: 'market', confidence: 'medium' };
const failed = [
  'I hit the search limit and found no current report on a Love injury, role change or lineup change before DAL @ GB.',
  "The search tool hit its usage limit, so I found no reports from before the game on Corum's role.",
  "The news search failed (tool limit exceeded), so I couldn't check whether Josh Jacobs or Chris Brooks is out.",
  "The news search failed because the tool limit was hit, so I couldn't check Penix's status.",
];
const corumLow = { status: 'unknown', reason: 'none', player: 'Blake Corum', summary: "No injury, role or lineup news found for this game. The book's lower under price looks like recent form plus Ronnie Rivers being out, not fresh news.", sources: src, explains: false, category: 'market', confidence: 'low' };

test('medium confidence that nothing explains the gap: the model side at 0.5u, priced at the trust, an edge bet, none passed with its reason', () => {
  assert.equal(verdictOf(penix), 'bet');
  const call = researchCall(check(), penix, { now });
  assert.equal(call.act, 'bet');
  assert.equal(call.units, RESEARCH_UNITS);
  assert.equal(call.confidence, 'medium');
  assert.match(call.why, /no real-world reason for the gap \(medium confidence\)/);
  // (priced the 19d41785 way: the trust 0.5, the lean held at half the GAP)
  const edge = { side: 'under', fair: 0.5, model: 0.7, odds: +100, push: 0, guarded: true, shadow: false };
  const d = researchDecision({ ...call, side: 'under' }, edge, 0.5);
  assert.equal(d.as, 'bet');
  assert.equal(d.p, Math.round(clearedChanceAt('prop', 0.5, 0.7, 0.5) * 1e4) / 1e4);
  assert.ok(d.ev > 0);
  assert.match(d.why, /bet at 0\.5u at most \(researchBet\), out of the CHECKs/);
  // (at -125 the held lean doesn't beat the price: passed, the reason said, out of the CHECKs)
  const vig = researchDecision({ ...call, side: 'under' }, { ...edge, odds: -125 }, 0.5);
  assert.equal(vig.as, 'pass');
  assert.ok(vig.ev <= 0);
  assert.match(vig.why, /^no edge \(ev -[\d.]+ on the under .*passed, out of the CHECKs/);
  // (a high one too; no sources, or a game started, still not)
  assert.equal(verdictOf({ ...penix, confidence: 'high' }), 'bet');
  assert.equal(verdictOf({ ...penix, sources: [] }), 'check');
  assert.equal(researchCall(check({ start: '2026-10-18T12:00:00Z' }), penix, { now }).act, 'check');
});

test('a call whose search failed is hollow: never a verdict, said so; a genuine low finding stays a CHECK, not hollow', () => {
  for (const summary of failed) {
    const f = { ...penix, summary, status: 'unknown', confidence: 'low', sources: summary.includes('Love') ? ['https://www.packers.com/news/2025'] : [] };
    assert.ok(searchFailed(f), summary);
    assert.ok(hollow(f), summary);
    assert.equal(verdictOf(f), 'check');
    // (whatever confidence it claims)
    assert.equal(verdictOf({ ...f, confidence: 'medium', sources: src }), 'check');
    assert.match(researchCall(check(), f, { now }).why, /the research call failed/);
  }
  assert.ok(!searchFailed(penix));
  assert.ok(!hollow(corumLow));
  assert.equal(verdictOf(corumLow), 'check');
  assert.match(researchCall(check(), corumLow, { now }).why, /can't tell \(low confidence\)/);
  // (a reason found is never hollow, whatever it says of the search)
  assert.ok(!hollow({ ...penix, explains: true, category: 'injury', summary: failed[0] }));
});

test("researchOne: the search tool's error under an answer that found nothing is a failed call, asked again, never kept", async () => {
  const answer = { stop_reason: 'end_turn', content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', tool_use_id: 'x', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }, { type: 'text', text: JSON.stringify(penix) }], usage: { input_tokens: 20000, output_tokens: 900, server_tool_use: { web_search_requests: 5 } } };
  const client = { beta: { messages: { create: async () => structuredClone(answer) } } };
  const r = await researchOne(client, check(), 'nfl');
  assert.equal(r.retry, true);
  assert.equal(r.finding.problem, 'stopped: search failed (search errors: max_uses_exceeded)');
  // (an error in a paused turn counts too)
  const turns = [{ ...structuredClone(answer), stop_reason: 'pause_turn', content: answer.content.slice(0, 2) }, { ...structuredClone(answer), content: [answer.content[2]] }];
  const paused = { beta: { messages: { create: async () => turns.shift() } } };
  assert.equal((await researchOne(paused, check(), 'nfl', aiBudget({ now, caps: { day: 10, month: 25 }, log: quiet }))).retry, true);
  // (the answer saying so, no error block: the same)
  const said = { ...structuredClone(answer), content: [{ type: 'text', text: JSON.stringify({ ...penix, summary: failed[0], confidence: 'low' }) }] };
  assert.match((await researchOne({ beta: { messages: { create: async () => said } } }, check(), 'nfl')).finding.problem, /^stopped: search failed \(the answer says/);
});

test('researchChecks: a failed call re-asked first, then the soonest game; PARALLEL at once; the caps hold every running worst case', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-'));
  const file = path.join(dir, 'log.json');
  const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
  const hollowOld = { ...penix, at: '2026-10-18T01:48:50Z', summary: failed[3], status: 'unknown', confidence: 'low', sources: [] };
  const checks = [
    check({ id: 'late-big', start: '2026-10-19T00:20:00Z', model: 0.9 }),
    check({ id: 'soon', start: '2026-10-18T17:00:00Z', model: 0.6 }),
    check({ id: 'mid', start: '2026-10-18T20:05:00Z', model: 0.8 }),
    check({ id: 'failed', start: '2026-10-19T00:20:00Z', model: 0.68, research: hollowOld }),
    check({ id: 'soon2', start: '2026-10-18T17:00:00Z', model: 0.65 }),
    check({ id: 'mid2', start: '2026-10-18T20:05:00Z', model: 0.62 }),
  ];
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at: hollowOld.at, what: 'check-research', sport: 'nfl', id: 'failed', cost: 0.2, finding: hollowOld }] }));
  const order = [];
  let live = 0;
  let most = 0;
  const client = {
    beta: {
      messages: {
        create: async (req) => {
          order.push(Number(/"modelChance":([\d.]+)/.exec(req.messages[0].content)[1]));
          live++;
          most = Math.max(most, live);
          await new Promise((r) => setTimeout(r, 5));
          live--;
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(penix) }], usage: { input_tokens: 20000, output_tokens: 900, server_tool_use: { web_search_requests: 2 } } };
        },
      },
    },
  };
  resetDeadline();
  const found = await researchChecks({ sport: 'nfl', checks, now, env, budget: aiBudget({ file, now, caps: { day: 5, month: 80 }, log: quiet }), client, log: quiet });
  resetDeadline();
  // (the failed one first, then by start, the bigger model Kelly first on a tie)
  assert.deepEqual(order, [0.68, 0.65, 0.6, 0.8, 0.62, 0.9]);
  assert.equal(found.size, 6);
  assert.equal(most, PARALLEL);
  // (room for two worst cases alone: two at once, a third only once one's real cost is known)
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at: now.toISOString(), what: 'other', cost: 5 - 2.2 * ESTIMATE }] }));
  live = 0;
  most = 0;
  order.length = 0;
  resetDeadline();
  const budget = aiBudget({ file, now, caps: { day: 5, month: 80 }, log: quiet });
  await researchChecks({ sport: 'nfl', checks: checks.map((c) => ({ ...c, research: undefined })), now, env, budget, client, log: quiet });
  resetDeadline();
  assert.equal(most, 2);
  assert.ok(order.length >= 2);
  assert.ok(budget.spent().day <= 5);
});
