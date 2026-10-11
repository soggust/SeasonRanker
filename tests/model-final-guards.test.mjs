// The final review's fixes: the skew guard on a prop's side against its own projection (props.mjs skewOnly), the
// write-ups' queue leaving out open bets today's guards wouldn't place (writeups.mjs guardedNow), their calls
// with no SDK retries, a deadline and a failed call counted at its worst case, writeups.json saved after each
// bet, the AI spend's committed totals carried into a lost log (ai-budget.mjs floor), the CHECK research's
// deadline and failed tries logged (research.mjs), and the CHECK learning's hit rate from known prices alone
// (check-learn.mjs tallyOf).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aiBudget } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { checkLearning, tallyOf } from '../libs/ranker/scripts/model/check-learn.mjs';
import { SKEW_MIN_LINE, skewOnly } from '../libs/ranker/scripts/model/props.mjs';
import { ESTIMATE, maybeBilled as researchBilled, researchChecks, resetDeadline } from '../libs/ranker/scripts/model/research.mjs';
import { configOf, gateOf, guardedNow, maybeBilled, queueOf, worstCase, writeOne, writeSport } from '../libs/ranker/scripts/model/writeups.mjs';

const SAMPLES = JSON.parse(fs.readFileSync(new URL('./support/writeup-samples.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-10T13:00:00Z');
const quiet = { log: () => {}, warn: () => {} };
const clone = (x) => JSON.parse(JSON.stringify(x));
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

// (the Kmet sample (placed before the gap guard), one pick at LOCK)
function sportData() {
  const s = SAMPLES[0];
  const bet = clone(s.bet);
  const sib = { ...clone(s.sib), status: 'open' };
  const picks = { sport: 'nfl', record: { byLevel: { lock: { wins: 1, losses: 0 } } }, picks: [{ id: bet.id, level: 'lock', edge: true, score: 0.2, pick: bet.pick, reason: 'Plain reason.', risk: 'Plain risk.' }] };
  return { picks, ledger: { bets: [bet, sib] }, state: null, games: [s.game], writeups: { sport: 'nfl', items: {} } };
}

test('skewOnly: a side against its own projection, from SKEW_MIN_LINE', () => {
  assert.equal(skewOnly('under', 15.82, 14.5), true);
  assert.equal(skewOnly('over', 13.9, 14.5), true);
  assert.equal(skewOnly('under', 13.9, 14.5), false);
  assert.equal(skewOnly('over', 15.82, 14.5), false);
  // (a small count's skew is real: a 0.5 line's under with the mean above it can be the likelier side)
  assert.equal(skewOnly('under', 0.6, 0.5), false);
  assert.ok(SKEW_MIN_LINE > 0.5);
  assert.equal(skewOnly('under', NaN, 14.5), false);
});

test("guardedNow: an open bet today's guards wouldn't place (past the gap, an assumed -110's unpriced line, the skew), and the queue leaves it out", () => {
  const [kmet, , , burke] = SAMPLES.map((s) => s.bet);
  assert.equal(guardedNow(kmet), 'gap');
  assert.equal(guardedNow(burke), null);
  const near = { ...clone(kmet), model: 0.6, fair: 0.5 };
  assert.equal(guardedNow(near), null);
  assert.equal(guardedNow({ ...near, side: 'under', projection: { ...near.projection, mean: 9 } }), 'skew');
  assert.equal(guardedNow({ ...near, oddsAssumed: true, line: 0.5, projection: { ...near.projection, mean: 0.7 } }), 'unpriced');
  assert.equal(guardedNow({ ...near, oddsAssumed: true, projection: { ...near.projection, fairOver: 0.7 } }), 'unpriced');
  assert.equal(guardedNow({ ...near, oddsAssumed: true, projection: { ...near.projection, fairOver: 0.5 } }), null);
  // (the queue: the Kmet bet, past the gap, not argued for; brought inside it, it is)
  assert.equal(queueOf({ sport: 'nfl', ...sportData(), now: NOW }).length, 0);
  const inside = sportData();
  Object.assign(inside.ledger.bets[0], { model: 0.6, fair: 0.5 });
  assert.equal(queueOf({ sport: 'nfl', ...inside, now: NOW }).length, 1);
});

test("the write-ups' calls: no SDK retries, the run's deadline, a failed call counted at its worst case where it may have been billed", async () => {
  // (the deadline: no call started past it)
  const budget = aiBudget({ now: NOW });
  let t = 1000;
  const gate = gateOf(budget, { deadline: 2000, clock: () => t });
  assert.equal((await gate.through(0.1, async () => 'ran')), 'ran');
  t = 2000;
  assert.deepEqual(await gate.through(0.1, async () => 'ran'), { capped: 'time' });
  // (a timeout (no status) maybe billed; a 429 or a 400 not; a 408 or a 500 maybe)
  assert.equal(maybeBilled(new Error('Request timed out.')), true);
  assert.equal(maybeBilled({ status: 429 }), false);
  assert.equal(maybeBilled({ status: 400 }), false);
  assert.equal(maybeBilled({ status: 408 }), true);
  assert.equal(maybeBilled({ status: 529 }), true);
  assert.equal(researchBilled({ status: 401 }), false);
  // (a timed-out call: logged at its worst case, the request made with no retries)
  const [item] = queueOf({ sport: 'nfl', ...sportData(), now: NOW, guarded: () => null });
  const opts = [];
  const timeout = Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
  const client = { beta: { messages: { create: async (_req, o) => (opts.push(o), Promise.reject(timeout)) } } };
  const b2 = aiBudget({ now: NOW });
  const cfg = configOf({});
  const r = await writeOne(client, { ...item }, { budget: b2, gate: gateOf(b2), cfg, log: quiet });
  assert.equal(r.status, 'error');
  assert.equal(opts[0].maxRetries, 0);
  assert.ok(opts[0].timeout <= 240000);
  assert.equal(Math.round(b2.spent().day * 1e4) / 1e4, Math.round(worstCase(cfg.maxTokens) * 1e4) / 1e4);
  // (turned away with a 429: nothing counted)
  const b3 = aiBudget({ now: NOW });
  const limited = { beta: { messages: { create: async () => Promise.reject(Object.assign(new Error('rate limited'), { status: 429 })) } } };
  await writeOne(limited, { ...item }, { budget: b3, gate: gateOf(b3), cfg, log: quiet });
  assert.equal(b3.spent().day, 0);
});

test('writeSport: onItem after each bet (main saves writeups.json there)', async () => {
  const data = sportData();
  const budget = aiBudget({ now: NOW });
  let saved = 0;
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 0 } }) } } };
  await writeSport({ sport: 'nfl', data, client, budget, gate: gateOf(budget), cfg: configOf({}), now: NOW, log: quiet, guarded: () => null, onItem: () => saved++ });
  assert.equal(saved, 1);
  assert.equal(data.writeups.items[data.picks.picks[0].id].ai.status, 'refused');
});

test("the AI spend's committed totals: a lost log can't reset the caps; written beside it; unreadable spends nothing", () => {
  const dir = tmp('ai-floor');
  const file = path.join(dir, 'ai-usage.json');
  const floor = path.join(dir, 'ai-spend.json');
  const now = new Date('2026-10-11T15:00:00Z');
  fs.writeFileSync(floor, JSON.stringify({ day: '2026-10-11', dayUsd: 1.2, month: '2026-10', monthUsd: 10, at: '2026-10-11T14:00:00Z' }));
  // (the log lost (a cold cache): the totals carried into it)
  const b = aiBudget({ file, floor, now, log: quiet });
  assert.equal(Math.round(b.spent().day * 100) / 100, 1.2);
  assert.equal(Math.round(b.spent().month * 100) / 100, 10);
  assert.equal(b.canSpend(0.5), false);
  assert.equal(b.canSpend(0.25), true);
  // (a log that already holds them: nothing carried)
  b.record({ what: 'writeup', cost: 0.1 });
  b.save();
  const t = JSON.parse(fs.readFileSync(floor, 'utf8'));
  assert.equal(t.dayUsd, 1.3);
  assert.equal(t.monthUsd, 10.1);
  const again = aiBudget({ file, floor, now, log: quiet });
  assert.equal(Math.round(again.spent().day * 100) / 100, 1.3);
  assert.equal(again.list().filter((e) => e.what === 'carried').length, 2);
  // (another day: only the month's carried)
  const tomorrow = aiBudget({ file: path.join(dir, 'none.json'), floor, now: new Date('2026-10-12T01:00:00Z'), log: quiet });
  assert.equal(tomorrow.spent().day, 0);
  assert.equal(Math.round(tomorrow.spent().month * 100) / 100, 10.1);
  // (a dry budget writes neither)
  const dry = aiBudget({ file: path.join(dir, 'dry.json'), floor: path.join(dir, 'dry-floor.json'), now, dry: true, log: quiet });
  dry.record({ cost: 1 });
  dry.save();
  assert.equal(fs.existsSync(path.join(dir, 'dry-floor.json')), false);
  // (unreadable: nothing spent)
  fs.writeFileSync(floor, '{ nope');
  assert.equal(aiBudget({ file, floor, now, log: quiet }).canSpend(0.01), false);
});

test("the CHECK research: a failed try logged at a turn's worst case (counted toward its tries); nothing started past the run's deadline", async () => {
  const dir = tmp('research-fail');
  const file = path.join(dir, 'ai-usage.json');
  const now = new Date('2026-10-09T12:00:00Z');
  const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
  const check = { id: '401:prop:recYds:9', event: '401', sport: 'nfl', start: '2026-10-10T17:00:00Z', market: 'prop', propType: 'recYds', player: 'Mike Evans', athlete: '9', side: 'over', line: 40, model: 0.7, fair: 0.5, gap: 0.2, projection: { mean: 50 } };
  const opts = [];
  const client = { beta: { messages: { create: async (_req, o) => (opts.push(o), Promise.reject(new Error('Request timed out.'))) } } };
  resetDeadline();
  const budget = aiBudget({ file, now, log: quiet });
  await researchChecks({ sport: 'nfl', checks: [check], now, env, budget, client, log: quiet });
  assert.equal(opts.length, 1);
  assert.equal(opts[0].maxRetries, 0);
  assert.ok(opts[0].timeout <= 90000);
  const logged = aiBudget({ file, now, log: quiet }).list();
  assert.equal(logged.length, 1);
  assert.equal(logged[0].failed, true);
  assert.equal(Math.round(logged[0].cost * 1e4) / 1e4, Math.round(ESTIMATE * 1e4) / 1e4);
  // (the run's deadline past: nothing started)
  resetDeadline();
  let t = 0;
  const idle = { beta: { messages: { create: async () => assert.fail('called past the deadline') } } };
  await researchChecks({ sport: 'nba', checks: [{ ...check, sport: 'nba' }], now, env, budget: aiBudget({ now, log: quiet }), client: idle, log: quiet, clock: () => (t++ ? 1e12 : 0) });
  resetDeadline();
});

test("the CHECK learning: the hit rate, break-even and profit from known prices alone; an assumed -110's counted apart", () => {
  const g = (status, oddsAssumed = false) => ({ id: `${Math.random()}`, market: 'prop', propType: 'recYds', odds: -110, oddsAssumed, cause: 'gap', projection: { mean: 50 }, line: 40, side: 'over', model: 0.7, fair: 0.5, checkResult: { status, profit: status === 'won' ? 100 / 110 : -1 } });
  const t = tallyOf([g('won'), g('lost'), g('won', true), g('won', true)]);
  assert.equal(t.n, 4);
  assert.equal(t.won, 3);
  assert.equal(t.unpriced, 2);
  assert.equal(t.decided, 2);
  assert.equal(t.hitRate, 0.5);
  assert.equal(t.profit, Math.round((100 / 110 - 1) * 100) / 100);
  // (unpriced alone: no advice drawn from them)
  const learn = checkLearning(Array.from({ length: 30 }, () => g('won', true)));
  assert.equal(learn.recommendations.length, 0);
});
