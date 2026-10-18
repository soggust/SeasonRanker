// The CHECKs' patterns (libs/ranker/scripts/model/check-patterns.mjs), the loosenings applied softly
// (check-learn.mjs loosenings), the role guard's thresholds read from them (props.mjs roleChangeOf role), the depth
// chart's quarterback change (props.mjs depthQbChangeOf) and the seeded labels (check-seeds.mjs): a pattern the
// research has answered the same way, its graded record bearing it out, resolves its new CHECKs by rule at a rate
// that grows with the evidence and falls back to research by itself when the record turns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_RATE, patternBook, patternKey, preResolve, replayPatterns, resolutionOf, resolutionOfFinding, ruleFinding, seenOf, unitOf } from '../libs/ranker/scripts/model/check-patterns.mjs';
import { LOOSEN_N, LOOSEN_STEP, checkLearning, loosenings } from '../libs/ranker/scripts/model/check-learn.mjs';
import { ROLE, depthQbChangeOf, roleChangeOf } from '../libs/ranker/scripts/model/props.mjs';
import { feedCheck, hollow, researchCall, researchCard, researchChecks, verdictOf } from '../libs/ranker/scripts/model/research.mjs';
import { readSeeds, seedOf } from '../libs/ranker/scripts/model/check-seeds.mjs';

const now = new Date('2026-10-18T12:00:00Z');
let n = 0;
// (a role CHECK of a sub-reason, researched (rs) or not, graded (status) or not)
function check({ sub = 'qb1-out', rs = null, status = null, at = '2026-10-17T10:00:00Z', gradedAt = '2026-10-17T23:00:00Z', out = [], id = null } = {}) {
  n++;
  return {
    id: id ?? `g${n}:prop:recYds:${n}`,
    sport: 'nfl',
    start: '2026-10-19T17:00:00Z',
    market: 'prop',
    propType: 'recYds',
    cause: 'role',
    roleReason: sub,
    reason: sub === 'qb1-out' ? "his team's starting quarterback (Lamar Jackson) out: a backup throwing to him" : 'the line',
    side: 'over',
    odds: -110,
    model: 0.7,
    fair: 0.5,
    projection: { out, vac: 0 },
    ...(rs ? { research: { at, by: 'claude', sources: ['https://x.test/a'], confidence: 'high', ...rs } } : {}),
    ...(status ? { checkResult: { status, profit: status === 'won' ? 0.909 : -1, gradedAt } } : {}),
  };
}
const HELD = { player: 'Lamar Jackson', status: 'out', explains: true, category: 'injury', moved: { input: 'Lamar Jackson out (teammate, on the report already)' } };
const NONE = { player: null, status: 'unknown', explains: false, category: 'market' };
const ROLEPASS = { player: 'X', status: 'active', explains: true, category: 'role', moved: { input: "none: a reason no input of the model's carries" } };

test('patternKey and seenOf: the cause and whether the feeds saw something missing, known before any research', () => {
  assert.equal(patternKey(check({ sub: 'qb1-out' })), 'role:qb1-out|seen');
  assert.equal(patternKey(check({ sub: 'line' })), 'role:line|unseen');
  assert.equal(patternKey(check({ sub: 'line', out: ['Breece Hall'] })), 'role:line|seen');
  assert.equal(seenOf({ cause: 'gap', projection: { vac: 0.2 } }), true);
  // (kept on its research once made: the trim drops the projection's teammates)
  assert.equal(patternKey({ ...check({ sub: 'line' }), research: { pattern: 'role:line|seen' } }), 'role:line|seen');
});

test('resolutionOf: held, pass, bet, input and check from what the research found and the run did', () => {
  assert.equal(resolutionOf(check({ rs: HELD })), 'held');
  assert.equal(resolutionOf(check({ rs: NONE })), 'bet');
  assert.equal(resolutionOf(check({ rs: ROLEPASS })), 'pass');
  assert.equal(resolutionOf(check({ rs: { ...HELD, moved: { input: 'Cooper Rush out (not starting (Michael Penix Jr. starts))' } } })), 'input');
  assert.equal(resolutionOf(check({ rs: { ...NONE, explains: true, category: 'injury', confidence: 'low' } })), 'check');
  // (a rule's own is no evidence; a hollow one none)
  assert.equal(resolutionOf(check({ rs: { ...NONE, by: 'rule', rule: { act: 'bet' } } })), null);
  assert.equal(resolutionOf(check({ rs: { status: 'unknown', sources: [], explains: false } })), null);
  // (a seeded label from the finding alone: the role guard's own reason names the QB the research found out)
  assert.equal(resolutionOfFinding({ player: 'Lamar Jackson', status: 'out', explains: true, category: 'injury', confidence: 'high', sources: ['https://x.test'] }, check()), 'held');
});

// (k researched held of n, graded won-lost on the held ones)
function pool(k, n, won, lost, extra = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const status = i < won ? 'won' : i < won + lost ? 'lost' : null;
    out.push(check({ rs: i < k ? HELD : ROLEPASS, status: i < k ? status : null, ...extra }));
  }
  return out;
}

test('patternBook: nothing graded resolves nothing; a strong share and a winning record resolve at a rate under MAX_RATE', () => {
  assert.equal(patternBook(pool(20, 20, 0, 0)).get('role:qb1-out|seen').rate, 0);
  const strong = patternBook(pool(30, 31, 20, 8)).get('role:qb1-out|seen');
  assert.equal(strong.top, 'held');
  assert.ok(strong.rate > 0.4 && strong.rate < MAX_RATE, `rate ${strong.rate}`);
  // (more evidence, a higher rate: self-tuning, not a switch)
  const more = patternBook(pool(60, 61, 40, 16)).get('role:qb1-out|seen');
  assert.ok(more.rate > strong.rate);
  // (a record that turns bad: back to research)
  assert.equal(patternBook(pool(30, 31, 8, 20)).get('role:qb1-out|seen').rate, 0);
  // (a split share: research)
  assert.equal(patternBook(pool(10, 20, 8, 2)).get('role:qb1-out|seen').rate, 0);
});

test('preResolve: by its own draw under the rate, the same every run; a rule kept inside a slack, dropped past it', () => {
  const book = patternBook(pool(60, 61, 40, 16));
  const e = book.get('role:qb1-out|seen');
  const ids = Array.from({ length: 400 }, (_, i) => `x${i}`);
  const hit = ids.filter((id) => preResolve(check({ id }), book)).length / ids.length;
  assert.ok(Math.abs(hit - e.rate) < 0.08, `${hit} vs ${e.rate}`);
  const id = ids.find((x) => unitOf(x) > e.rate && unitOf(x) < e.rate + 0.05);
  assert.equal(preResolve(check({ id }), book), null);
  const kept = { ...check({ id }), research: { by: 'rule', pattern: 'role:qb1-out|seen', rule: { act: 'held' } } };
  assert.equal(preResolve(kept, book)?.act, 'held');
});

test('ruleFinding: a verdict the desk reads (bet, or adjust held/pass), never hollow, no feeds, named on the call', () => {
  const book = patternBook(pool(60, 61, 40, 16));
  const c = check({ id: 'g9:prop:recYds:1' });
  const pre = { ...preResolve({ ...c, id: [...Array(500).keys()].map((i) => `y${i}`).find((x) => unitOf(x) < 0.05) }, book) };
  const f = ruleFinding(c, pre, now);
  assert.equal(f.by, 'rule');
  assert.equal(f.cost, 0);
  assert.equal(hollow(f), false);
  assert.equal(verdictOf(f), 'adjust');
  assert.equal(verdictOf({ ...f, rule: { act: 'bet' } }), 'bet');
  assert.equal(feedCheck(f, c, null), null);
  const call = researchCall(c, f, { now });
  assert.equal(call.act, 'adjust');
  assert.equal(call.rule, 'role:qb1-out|seen');
  // (the scorecard counts them apart from the research)
  const card = researchCard([], [{ ...c, research: f }, check({ rs: HELD })], null, now);
  assert.equal(card.researched, 1);
  assert.equal(card.rule.n, 1);
});

test('researchChecks: a CHECK the rule resolves this run never asked; one a rule dropped asked again', async () => {
  const lines = [];
  const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
  const a = { ...check({ id: 'a1' }), research: { by: 'rule', pattern: 'role:qb1-out|seen', rule: { act: 'held' }, at: now.toISOString() } };
  const b = check({ id: 'b1' });
  await researchChecks({ sport: 'nfl', checks: [a, b], now, env, dry: true, skip: new Set(['b1']), log: { log: (m) => lines.push(m), warn: () => {} } });
  assert.match(lines.join('\n'), /would look into 1: .*/);
  assert.ok(!lines.join('\n').includes('b1'));
});

test('replayPatterns: each judged on the book before its research, no look-ahead; the calls and dollars saved', () => {
  const early = pool(40, 41, 28, 10, { at: '2026-10-10T10:00:00Z', gradedAt: '2026-10-11T00:00:00Z' });
  const late = Array.from({ length: 30 }, () => ({ ...check({ rs: { ...HELD, cost: 0.2 }, at: '2026-10-15T10:00:00Z', status: 'won', gradedAt: '2026-10-16T00:00:00Z' }) }));
  const r = replayPatterns([...early, ...late], Date.parse('2026-10-14T00:00:00Z'));
  assert.equal(r.researched, 30);
  assert.ok(r.preResolved > 0 && r.preResolved < 30);
  assert.equal(r.agreed, r.preResolved);
  assert.equal(r.dollarsSaved, Math.round(r.preResolved * 0.2 * 100) / 100);
  // (none before its first research: nothing graded yet, nothing resolved)
  assert.equal(replayPatterns(early, 0).rows[0].rule, null);
});

// (a learning whose part-time role cause is graded won-lost at -110)
function learned(won, lost) {
  const list = [];
  for (let i = 0; i < won + lost; i++) list.push({ ...check({ sub: 'part-time', status: i < won ? 'won' : 'lost' }), diagnosis: { cause: 'role', sub: 'part-time' } });
  return checkLearning(list);
}

test('loosenings: none till ready, then a soft weight stepped LOOSEN_STEP a run, the role threshold moved, and back down', () => {
  const early = loosenings(learned(20, 7));
  assert.deepEqual(early.weights, {});
  assert.equal(early.role.partTime, ROLE.partTime);
  const ready = learned(Math.round(LOOSEN_N * 1.5 * 0.75), Math.round(LOOSEN_N * 1.5 * 0.25));
  const one = loosenings(ready);
  const w1 = one.weights['role:part-time'];
  assert.ok(w1 > 0 && w1 <= LOOSEN_STEP);
  assert.ok(one.role.partTime < ROLE.partTime && one.role.partTime > ROLE.partTime - 0.1);
  assert.match(one.applied[0].text, /ROLE\.partTime 0\.5 -> /);
  const two = loosenings(ready, one.weights);
  assert.ok(two.weights['role:part-time'] >= w1);
  // (the record turns: stepping back down from the last run's weight)
  const back = loosenings(learned(20, 7), { 'role:part-time': 0.4 });
  assert.equal(back.weights['role:part-time'], 0.15);
  // (a cause with no threshold: a pattern's rule rate)
  const gap = loosenings({ recommendations: [{ kind: 'loosen', cause: 'matchup', evidence: { won: 70, lost: 20, ci: [0.68, 0.84], breakEven: 0.52 }, change: { ready: true } }] });
  assert.ok(gap.causes.matchup > 0);
});

test('roleChangeOf: reads the thresholds it is given (a loosened part-time no CHECK)', () => {
  const args = { name: 'X', pos: 'RB', pid: '1', vacOut: 0.1, snap: { latest: 0.45, avg: 0.45, n: 3 } };
  assert.equal(roleChangeOf(args)?.key, 'part-time');
  assert.equal(roleChangeOf({ ...args, role: { ...ROLE, partTime: 0.42 } }), null);
});

test('depthQbChangeOf: the chart lists another QB first, the starter of late behind him and not on the report', () => {
  const depth = new Map([['10', [{ group: 'QB', order: ['20', '30', '10'], at: '2026-10-18T08:00:00Z', team: 'ATL' }]]]);
  const base = { depth, team: 'ATL', teamId: '1', qb1: '10', at: '2026-10-18T17:00:00Z', now: now.getTime() };
  assert.equal(depthQbChangeOf(base)?.starter, '20');
  // (the report's word wins: listed at all, nothing)
  assert.equal(depthQbChangeOf({ ...base, report: new Map([['1', [{ id: '10', status: 'Questionable' }]]]) }), null);
  // (the chart's first out on the report: the next one)
  assert.equal(depthQbChangeOf({ ...base, report: new Map([['1', [{ id: '20', status: 'Out' }]]]) })?.starter, '30');
  // (the starter of late first: no change; a stale chart or one made after the kickoff: nothing)
  assert.equal(depthQbChangeOf({ ...base, qb1: '20', depth: new Map([['20', [{ group: 'QB', order: ['20', '10'], at: '2026-10-18T08:00:00Z', team: 'ATL' }]]]) }), null);
  assert.equal(depthQbChangeOf({ ...base, now: Date.parse('2026-10-25T00:00:00Z') }), null);
});

test('check-seeds: a seed read as a CHECK whose finding is seeded, its pattern kept, weighed in the book', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seeds-'));
  const dir = path.join(root, 'apps/nfl/scripts/model');
  fs.mkdirSync(dir, { recursive: true });
  const seeds = pool(30, 31, 20, 8).map((c) => seedOf(c, { ...c.research, at: '2026-10-09T00:00:00Z' }));
  assert.equal(seeds[0].seed.seeded, true);
  assert.equal(seeds[0].pattern, 'role:qb1-out|seen');
  fs.writeFileSync(path.join(dir, 'check-seeds.json'), JSON.stringify({ sport: 'nfl', seeds }));
  const read = readSeeds('nfl', root);
  assert.equal(read.length, 31);
  assert.equal(resolutionOf(read[0]), 'held');
  assert.ok(patternBook(read).get('role:qb1-out|seen').rate > 0);
  assert.deepEqual(readSeeds('nhl', root), []);
});

test('seed-checks: a batch result priced at half its tokens and the searches in full; its finding as the live one; the candidates', async () => {
  const { batchCost, candidatesOf, findingOfMessage, SCOPE } = await import('../libs/ranker/scripts/model/seed-checks.mjs');
  const { costOf } = await import('../libs/ranker/scripts/model/ai-budget.mjs');
  const u = { input_tokens: 20000, output_tokens: 2000, server_tool_use: { web_search_requests: 3 } };
  assert.ok(Math.abs(batchCost(u) - ((costOf(u) - 0.03) / 2 + 0.03)) < 1e-9);
  const json = JSON.stringify({ player: 'Lamar Jackson', status: 'out', reason: 'injury', summary: 'Out with a hamstring.', sources: ['https://x.test/a'], explains: true, category: 'injury', confidence: 'high' });
  const f = findingOfMessage({ stop_reason: 'end_turn', content: [{ type: 'text', text: json }] });
  assert.equal(f.problem, undefined);
  assert.equal(resolutionOfFinding(f, check()), 'held');
  assert.match(findingOfMessage({ stop_reason: 'pause_turn', content: [] }).problem, /pause_turn/);
  const past = { ...check({ status: 'won' }), start: '2026-10-01T17:00:00Z' };
  const live = { ...check({ status: 'won', rs: HELD }), start: '2026-10-01T17:00:00Z' };
  assert.deepEqual(candidatesOf([past, live, check()]).map((c) => c.id), [past.id]);
  assert.deepEqual(candidatesOf([past], new Set([past.id])), []);
  assert.match(SCOPE('2026-10-01T17:00:00Z'), /before that start/);
});
