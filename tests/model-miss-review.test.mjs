// The daily miss review (libs/ranker/scripts/model/miss-review.mjs): which misses it picks, how it asks (the Message
// Batches API, sent one run and read a later one), what it keeps and learns, and its caps (ai-budget.mjs missBudget,
// missBackfillBudget). No live calls: every client is a mock.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aiBudget, batchCostOf, CAP_WINDOWS, costOf, MISS_CAPS, missBackfillBudget, missBudget } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { clvLossOf, countZ, ESTIMATE, missReview, pageOf, pickMisses, recommendationsOf, reviewOf, slateDay, surpriseOf, tallyOf } from '../libs/ranker/scripts/model/miss-review.mjs';

const now = new Date('2026-10-18T13:00:00Z');
const quiet = { log: () => {}, warn: () => {} };
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
const env = { MISS_REVIEW: '1', ANTHROPIC_API_KEY: 'test' };

// (a graded prop: a mean and r, an actual, a chance)
const prop = (id, { actual = 80, mean = 40, r = 2, model = 0.6, status = 'lost', gradedAt = '2026-10-18T05:00:00Z', ...rest } = {}) => ({
  id,
  event: `e${id}`,
  sport: 'nfl',
  start: '2026-10-17T17:00Z',
  market: 'prop',
  propType: 'recYds',
  statLabel: 'Rec Yds',
  player: `P ${id}`,
  athlete: id,
  side: 'under',
  line: 45.5,
  odds: -110,
  model,
  fair: 0.5,
  pick: `P ${id} Under 45.5 Rec Yds`,
  matchup: 'A @ B',
  projection: { mean, r, role: 'WR1', snap: { last: 0.8 } },
  status,
  actual,
  final: `P ${id} ${actual} Rec Yds`,
  gradedAt,
  weight: 1,
  disrupted: [],
  ...rest,
});

const answer = (o) => ({ type: 'succeeded', result: null, message: { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 20000, output_tokens: 1000, server_tool_use: { web_search_requests: 3 } }, content: [{ type: 'text', text: JSON.stringify(o) }] } });

// (a mock of the Message Batches API: a batch ends on its second look; answer(request) gives each result)
function mockClient(answerOf) {
  const batches = new Map();
  const sent = [];
  return {
    sent,
    messages: {
      batches: {
        create: async ({ requests }) => {
          const id = `batch_${batches.size + 1}`;
          sent.push(requests);
          batches.set(id, { requests, looks: 0 });
          return { id, processing_status: 'in_progress' };
        },
        retrieve: async (id) => {
          const b = batches.get(id);
          b.looks++;
          return { id, processing_status: b.looks >= 2 ? 'ended' : 'in_progress' };
        },
        results: async (id) =>
          (async function* () {
            for (const r of batches.get(id).requests) {
              const a = answerOf(r);
              yield { custom_id: r.custom_id, result: { type: a.type, message: a.message } };
            }
          })(),
      },
    },
  };
}

const filesIn = (dir) => ({ log: path.join(dir, 'log.json'), page: path.join(dir, 'page.json'), ledger: path.join(dir, 'ledger.json') });
const noSummary = async () => null;

test("countZ: a count's mid-p under the model's negative binomial as a z (a low count's tail not overstated)", () => {
  assert.ok(Math.abs(countZ(40, 40, 1e9)) < 0.1);
  assert.ok(countZ(100, 40, 2) > 1 && countZ(100, 40, 2) < 2.5);
  // (a defenseman's 0.15 points a game, 1 point: surprising, not a 2-SD-plus outlier the naive way says)
  assert.ok(countZ(1, 0.15) < 1.6 && countZ(1, 0.15) > 0.8);
  assert.ok(countZ(0, 30, 3) < -1);
});

test('surpriseOf and pickMisses: a premise broken, a push or a void left out; the biggest first, 5 at most, plus the worst CLV losers', () => {
  assert.equal(surpriseOf('nfl', prop('a', { disrupted: [{ severe: true, kind: 'snaps', text: 'x' }] })), null);
  assert.equal(surpriseOf('nfl', prop('a', { weight: 0.3 })), null);
  assert.equal(surpriseOf('nfl', prop('a', { status: 'push' })), null);
  // (a loss's confidence counts as a z, a win only when its projection missed by 2.5 SDs)
  assert.ok(surpriseOf('nfl', prop('c', { actual: 46, mean: 40, model: 0.9 })).score >= 1.28);
  assert.equal(surpriseOf('nfl', prop('w', { status: 'won', actual: 42 })).score, 0);
  // (a game's total against the sport's SD)
  const tot = surpriseOf('nfl', { id: 't', market: 'total', status: 'lost', model: 0.52, miss: { total: 65, expTotal: 41.7 }, gradedAt: 'x' });
  assert.equal(tot.z, 1.73);
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => prop(`p${i}`, { actual: 60 + i * 10 })),
    prop('hurt', { actual: 200, disrupted: [{ severe: true, kind: 'early', text: 'left' }] }),
    prop('clv1', { actual: 30, status: 'won', clv: { beat: false, prob: -0.08 } }),
    prop('clv2', { actual: 30, status: 'won', clv: { beat: false, pts: -2 } }),
    prop('clv3', { actual: 30, status: 'won', clv: { beat: false, prob: -0.01 } }),
  ];
  const picks = pickMisses('nfl', rows, { skip: new Set(['p7']) });
  assert.deepEqual(picks.map((m) => m.row.id), ['p6', 'p5', 'p4', 'p3', 'p2', 'clv1', 'clv2']);
  assert.equal(picks[5].reason, 'clv');
  assert.equal(clvLossOf(rows.at(-2)), 0.06);
  assert.equal(slateDay({ start: '2026-10-19T00:20Z' }), '2026-10-18');
});

test('reviewOf: a cause from the fixed list, its confidence 0 to 1, a term named, a data bug; anything else a problem', () => {
  const r = reviewOf('Here: {"cause":"term","confidence":1.4,"evidence":"The  role factor\\n doubled him.","term":"roleFactor","bug":null,"sources":["https://x.com/a","nope"]}', ['roleFactor', 'snap']);
  assert.deepEqual(r, { cause: 'term', confidence: 1, evidence: 'The role factor doubled him.', term: 'roleFactor', bug: null, sources: ['https://x.com/a'] });
  assert.equal(reviewOf('{"cause":"term","confidence":0.5,"evidence":"","term":"made-up"}', ['snap']).termUnlisted, true);
  assert.equal(reviewOf('{"cause":"data","confidence":0.8,"evidence":"e","bug":"old inactives"}').bug, 'old inactives');
  assert.match(reviewOf('{"cause":"aliens","confidence":0.5}').problem, /no cause/);
  assert.equal(reviewOf('nothing').problem, 'no JSON');
});

test('tallyOf and recommendationsOf: a cause past the shrunk threshold (variance aside) is a recommendation and a refit candidate; data a bug', () => {
  const rv = (cause, i, extra = {}) => ({ id: `${cause}${i}`, sport: 'nfl', stat: 'Rec Yds', cause, confidence: 0.9, ...extra });
  const reviews = [...[0, 1, 2, 3].map((i) => rv('role', i)), rv('variance', 0), rv('variance', 1), rv('variance', 2), rv('variance', 3), rv('variance', 4), rv('market', 0)];
  const tally = tallyOf(reviews);
  const role = tally.find((c) => c.cause === 'role');
  // (3.6 of 10 reviews, shrunk over 10 + 5)
  assert.deepEqual([role.n, role.of, role.share], [4, 10, 0.24]);
  assert.equal(recommendationsOf(tally).length, 0);
  const more = tallyOf([...reviews, rv('role', 4), rv('role', 5), rv('role', 6), rv('data', 0), rv('data', 1), rv('data', 2), rv('term', 0, { term: 'vacF' }), rv('term', 1, { term: 'vacF' }), rv('term', 2, { term: 'snap' })]);
  const recs = recommendationsOf(more, { nfl: 'NFL' });
  const byCause = Object.fromEntries(recs.map((r) => [r.cause, r]));
  assert.ok(byCause.role && !byCause.variance && !byCause.market);
  assert.match(byCause.role.text, /^NFL Rec Yds: 7 of 19 misses reviewed came down to role or usage change the model missed: check the role and snap inputs/);
  // (shrunk 2.7 / 24: under the threshold)
  assert.equal(byCause.data, undefined);
  const sure = (cause, i, extra = {}) => rv(cause, i, { confidence: 1, ...extra });
  const data = recommendationsOf(tallyOf([sure('data', 0), sure('data', 1), sure('data', 2), sure('term', 0, { term: 'vacF' }), sure('term', 1, { term: 'vacF' }), sure('term', 2, { term: 'snap' })]));
  assert.equal(data.find((r) => r.cause === 'data').bug, true);
  assert.equal(data.find((r) => r.cause === 'term').candidate, "the vacF term's weight");
});

test('missReview: sent as a batch one run (its worst case reserved), read a later one (real cost logged, the reservation given back), once a UTC day', async () => {
  const dir = tmp('miss');
  const files = filesIn(dir);
  const rows = [prop('a', { actual: 120 }), prop('b', { actual: 100 }), prop('c', { actual: 90, athlete: 'c' }), prop('old', { actual: 200, gradedAt: '2026-10-10T00:00:00Z' })];
  const client = mockClient((r) => {
    const data = r.params.messages[0].content.includes('P b ');
    return answer(data ? { cause: 'data', confidence: 0.8, evidence: 'The inactives list was a day old.', term: null, bug: 'stale inactives', sources: [] } : { cause: 'role', confidence: 0.7, evidence: 'He ran 90% of routes with the WR1 out.', term: null, bug: null, sources: ['https://espn.com/x'] });
  });
  const usage = path.join(dir, 'usage.json');
  const budgetAt = (t) => missBudget({ env: {}, file: usage, floor: null, now: t });
  const lines = [];
  const log = { log: (m) => lines.push(m), warn: (m) => lines.push(m) };
  // (run 1: three picked (the old one's before the lookback), one batch sent, $0.42 reserved of the $2 day)
  const one = await missReview('nfl', { now, env, budget: budgetAt(now), client, rows, files, summaryOf: noSummary, log });
  assert.deepEqual([one.picked, one.sent], [3, 1 * 3]);
  assert.equal(client.sent.length, 1);
  const req = client.sent[0][0].params;
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }]);
  assert.match(req.messages[0].content, /"projection":\{"mean":40/);
  assert.equal(Math.round(budgetAt(now).left() * 100) / 100, Math.round((2 - 3 * ESTIMATE) * 100) / 100);
  // (run 2, an hour on: the batch still running: nothing new sent, not due again today)
  const t2 = new Date(now.getTime() + 36e5);
  const two = await missReview('nfl', { now: t2, env, budget: budgetAt(t2), client, rows, files, summaryOf: noSummary, log });
  assert.equal(two.pending, 'batch_1');
  assert.equal(client.sent.length, 1);
  // (run 3: read; reviews kept with their real cost, the reservation back, the data one an error annotation)
  const t3 = new Date(now.getTime() + 2 * 36e5);
  const three = await missReview('nfl', { now: t3, env, budget: budgetAt(t3), client, rows, files, summaryOf: noSummary, log });
  assert.equal(three.reviewed, 3);
  assert.equal(client.sent.length, 1);
  const kept = JSON.parse(fs.readFileSync(files.log, 'utf8'));
  assert.equal(kept.pending, null);
  assert.equal(kept.reviews.length, 3);
  const call = batchCostOf({ input_tokens: 20000, output_tokens: 1000, server_tool_use: { web_search_requests: 3 } });
  assert.equal(kept.reviews[0].cost, Math.round(call * 1e5) / 1e5);
  assert.ok(!('prompt' in kept.reviews[0]));
  assert.equal(Math.round(budgetAt(t3).spent().day * 1e4) / 1e4, Math.round(3 * call * 1e4) / 1e4);
  assert.equal(budgetAt(t3).life().calls, 3);
  assert.ok(lines.some((l) => /^::error title=Miss review found bad data \(nfl\)::P b Under 45.5 Rec Yds \(A @ B\): stale inactives/.test(l)));
  const page = JSON.parse(fs.readFileSync(files.page, 'utf8'));
  assert.equal(page.reviews.length, 3);
  assert.equal(page.count.reviewed, 3);
  assert.deepEqual(page.tally.map((c) => [c.cause, c.n]), [['role', 2], ['data', 1]]);
  // (the next day before noon UTC: not due; at noon: due, the rows graded since the cut only)
  const t4 = new Date('2026-10-19T11:00:00Z');
  assert.equal((await missReview('nfl', { now: t4, env, budget: budgetAt(t4), client, rows: [...rows, prop('new', { actual: 150, gradedAt: '2026-10-19T04:00:00Z' })], files, summaryOf: noSummary, log: quiet })).picked, 0);
  const t5 = new Date('2026-10-19T12:30:00Z');
  const five = await missReview('nfl', { now: t5, env, budget: budgetAt(t5), client, rows: [...rows, prop('new', { actual: 150, gradedAt: '2026-10-19T04:00:00Z' })], files, summaryOf: noSummary, log: quiet });
  assert.equal(five.picked, 1);
  // (off: nothing)
  assert.equal(await missReview('nfl', { now: t5, env: {}, budget: budgetAt(t5), client, rows, files, log: quiet }), null);
});

test('missReview: a paused turn continued in the next batch; a failure asked again once, then given up; the caps send only what fits', async () => {
  const dir = tmp('miss-pause');
  const files = filesIn(dir);
  const rows = [prop('a', { actual: 120 }), prop('b', { actual: 100 })];
  let paused = false;
  const client = mockClient((r) => {
    if (r.params.messages[0].content.includes('P b ')) return { type: 'errored' };
    if (!paused) {
      paused = true;
      return { type: 'succeeded', message: { model: 'claude-opus-5-5', stop_reason: 'pause_turn', usage: { input_tokens: 10000, output_tokens: 200 }, content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }] } };
    }
    assert.equal(r.params.messages.length, 2);
    return answer({ cause: 'variance', confidence: 0.6, evidence: 'Nothing changed.', term: null, bug: null, sources: [] });
  });
  const usage = path.join(dir, 'usage.json');
  const b = (t) => missBudget({ env: {}, file: usage, floor: null, now: t });
  const at = (h) => new Date(now.getTime() + h * 36e5);
  await missReview('nfl', { now: at(0), env, budget: b(at(0)), client, rows, files, summaryOf: noSummary, log: quiet });
  await missReview('nfl', { now: at(1), env, budget: b(at(1)), client, rows, files, summaryOf: noSummary, log: quiet });
  const read = await missReview('nfl', { now: at(2), env, budget: b(at(2)), client, rows, files, summaryOf: noSummary, log: quiet });
  // (the paused one sent again, its turns so far with it)
  assert.equal(client.sent.length, 2);
  assert.equal(read.sent, 1);
  let kept = JSON.parse(fs.readFileSync(files.log, 'utf8'));
  assert.deepEqual(kept.retry.map((x) => [x.id, x.tries]), [['b', 1]]);
  await missReview('nfl', { now: at(3), env, budget: b(at(3)), client, rows, files, summaryOf: noSummary, log: quiet });
  await missReview('nfl', { now: at(4), env, budget: b(at(4)), client, rows, files, summaryOf: noSummary, log: quiet });
  kept = JSON.parse(fs.readFileSync(files.log, 'utf8'));
  const a = kept.reviews.find((r) => r.id === 'a');
  assert.equal(a.cause, 'variance');
  // (its cost both turns')
  assert.ok(a.cost > batchCostOf({ input_tokens: 20000, output_tokens: 1000, server_tool_use: { web_search_requests: 3 } }));
  // (the failed one asked again the next due day, then given up)
  const t = new Date('2026-10-19T12:30:00Z');
  await missReview('nfl', { now: t, env, budget: b(t), client, rows, files, summaryOf: noSummary, log: quiet });
  for (const h of [1, 2]) await missReview('nfl', { now: new Date(t.getTime() + h * 36e5), env, budget: b(t), client, rows, files, summaryOf: noSummary, log: quiet });
  kept = JSON.parse(fs.readFileSync(files.log, 'utf8'));
  assert.equal(kept.retry.length, 0);
  assert.equal(kept.reviews.find((r) => r.id === 'b').failed, true);
  // (the caps: room for one worst case, so one sent and the other left for the next due day)
  const dir2 = tmp('miss-caps');
  const tight = mockClient(() => answer({ cause: 'role', confidence: 0.5, evidence: 'x', term: null, bug: null, sources: [] }));
  const capped = aiBudget({ file: path.join(dir2, 'u.json'), now, caps: { day: ESTIMATE * 1.5, month: 10 } });
  const out = await missReview('nfl', { now, env, budget: capped, client: tight, rows, files: filesIn(dir2), summaryOf: noSummary, log: quiet });
  assert.equal(out.sent, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir2, 'log.json'), 'utf8')).retry.map((x) => x.why), ['the caps']);
});

test('the backfill: every slate day before the daily cut by the same rule, under its own $30 budget, its reviews marked backfill', async () => {
  const dir = tmp('miss-back');
  const files = filesIn(dir);
  const day1 = Array.from({ length: 7 }, (_, i) => prop(`d1-${i}`, { actual: 70 + i * 10, start: '2026-10-09T17:00Z', gradedAt: '2026-10-10T00:00:00Z' }));
  const day2 = [prop('d2', { actual: 150, start: '2026-10-12T17:00Z', gradedAt: '2026-10-13T00:00:00Z' })];
  const client = mockClient(() => answer({ cause: 'availability', confidence: 0.7, evidence: 'The WR1 sat.', term: null, bug: null, sources: [] }));
  const usage = path.join(dir, 'back.json');
  const back = missBackfillBudget({ file: usage, floor: null, now });
  assert.deepEqual(back.caps, { day: 30, month: 30 });
  assert.deepEqual(missBackfillBudget({ file: null, floor: null, now, cap: 99 }).caps, { day: 30, month: 30 });
  const first = await missReview('nfl', { now, env: {}, force: true, backfill: true, budget: back, client, rows: [...day1, ...day2], files, summaryOf: noSummary, log: quiet });
  assert.equal(first.picked, 6);
  for (const h of [1, 2]) await missReview('nfl', { now: new Date(now.getTime() + h * 6e4), env: {}, force: true, backfill: true, pickNew: false, budget: back, client, rows: [...day1, ...day2], files, summaryOf: noSummary, log: quiet });
  const kept = JSON.parse(fs.readFileSync(files.log, 'utf8'));
  assert.equal(kept.reviews.length, 6);
  assert.ok(kept.reviews.every((r) => r.backfill));
  assert.deepEqual([...new Set(kept.reviews.map((r) => r.day))], ['2026-10-09', '2026-10-12']);
  // (the daily's cut set to now: the daily never picks the days the backfill covered)
  assert.equal(kept.cut, now.toISOString());
  // (its spend in its own log, none against the daily's)
  assert.equal(missBudget({ env: {}, file: path.join(dir, 'daily.json'), floor: null, now }).spent().day, 0);
  assert.ok(back.spent().month > 0);
  const page = pageOf('nfl', kept, now);
  assert.equal(page.count.backfill, 6);
  assert.equal(page.tally[0].cause, 'availability');
});

test("the miss review's caps: $2 a day and $40 through Oct 31, $1 and $25 standing; a batch call's tokens at half price", () => {
  const caps = (iso, e = {}) => missBudget({ env: e, file: null, floor: null, now: new Date(iso) }).caps;
  assert.deepEqual(caps('2026-10-17T23:00:00Z'), MISS_CAPS);
  assert.deepEqual(caps('2026-10-18T13:00:00Z'), { day: 2, month: 40 });
  assert.deepEqual(caps('2026-10-31T23:59:00Z'), { day: 2, month: 40 });
  assert.deepEqual(caps('2026-11-01T00:00:00Z'), { day: 1, month: 25 });
  assert.deepEqual(caps('2026-10-20T00:00:00Z', { MISS_REVIEW_DAILY_USD: '9', MISS_REVIEW_MONTHLY_USD: '10' }), { day: 2, month: 10 });
  assert.equal(CAP_WINDOWS.miss.length, 1);
  const u = { input_tokens: 10000, output_tokens: 1000, server_tool_use: { web_search_requests: 2 } };
  assert.equal(Math.round(batchCostOf(u) * 1e6) / 1e6, Math.round(((costOf(u) - 0.02) / 2 + 0.02) * 1e6) / 1e6);
  assert.equal(Math.round(ESTIMATE * 100) / 100, 0.14);
});
