// The CHECKs' self-evaluation (libs/ranker/scripts/model/check-learn.mjs, research.mjs, ai-budget.mjs): each
// CHECK's diagnosis (the part of the projection that drives its gap), the graded ones' hit rate and profit by
// cause with a Wilson interval and the ranked recommendations (a blind spot, a lean to watch, a guard that can
// loosen: recorded, ready only at 40 graded and a clear margin, never applied); the news research behind
// CHECK_RESEARCH=1 with a mock client (no network, no real key), its caps and cost log, and its findings into
// the injury report as the owner's notes go, flagged research; the Algorithm tab's CHECKs panel rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CAUSES, checkLearning, diagnose, diagnosisOf, FIXES, LOOSEN_N, loosenFor, tallyOf, wilson } from '../libs/ranker/scripts/model/check-learn.mjs';
import { checkOf, checkTrim, TRIM_AFTER, upsertCheck } from '../libs/ranker/scripts/model/checks.mjs';
import { aiBudget, costOf } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { athleteOf, ESTIMATE, findingOf, researchChecks, researchNote, researchOne, RESEARCH_TTL_H } from '../libs/ranker/scripts/model/research.mjs';
import { applyNotes, noteWords } from '../libs/ranker/scripts/model/notes.mjs';
import { ROLE } from '../libs/ranker/scripts/model/props.mjs';
import { GAP } from '../libs/ranker/scripts/model/desk.mjs';
import { loadEngine } from './support/engine.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const applied = { scale: 1, w: 0.2, a: 1, b: 0.5 };
// (a prop CHECK: his rate 50, his recent form 50, the steps all 1 but what's given; its mean their product)
function prop(over = {}, proj = {}) {
  const pr = { rate: 50, recent: 50, opp: 1, script: 1, ctxF: 1, paceF: 1, tgtF: 1, vacF: 1, vac: 0, vacHist: 0, games: 6, priorW: 0.3, r: 2, applied, ...proj };
  const base = (1 - applied.w) * pr.rate + applied.w * pr.recent;
  pr.mean = proj.mean ?? base * pr.opp * Math.pow(pr.script, applied.b) * pr.ctxF * pr.paceF * pr.tgtF * pr.vacF;
  return { id: `401:prop:recYds:${over.athlete ?? '9'}`, event: '401', sport: 'nfl', start: '2026-10-10T17:00:00Z', placedAt: '2026-10-09T11:00:00Z', matchup: 'TB @ DAL', market: 'prop', propType: 'recYds', statLabel: 'Rec Yds', player: 'Mike Evans', athlete: '9', team: '27', side: 'over', line: 40, odds: -110, otherOdds: -110, model: 0.7, fair: 0.5, gap: 0.2, cause: 'gap', projection: pr, status: 'check', profit: 0, ...over };
}
// (a CHECK the research may ask about: a role's over the CHECK bar (checks.mjs shadowOf: a gap's never), its model
// Kelly in its gap's order)
const rprop = (over = {}, proj = {}) => prop({ cause: 'role', model: 0.5 + Math.abs(over.gap ?? 0.2), ...over }, proj);
const graded = (c, status, odds = -110) => ({ ...c, odds, checkResult: { status, profit: status === 'won' ? 100 / 110 : status === 'lost' ? -1 : 0, final: 'x', gradedAt: '2026-10-11T00:00:00Z' } });

test('diagnose: a role CHECK is its role, with its sub-reason', () => {
  const d = diagnose(prop({ cause: 'role', roleReason: 'snap-jump' }, { mean: 60 }));
  assert.equal(d.cause, 'role');
  assert.equal(d.sub, 'snap-jump');
  assert.equal(d.v, 1);
});

test('diagnose: an assumed -110 is unpriced, ahead of the projection', () => {
  assert.equal(diagnose(prop({ oddsAssumed: true }, { mean: 60 })).cause, 'unpriced');
});

test('diagnose: the market far over his projection and his form, no one missing seen: a teammate unseen; far under: his own status', () => {
  const up = diagnose(prop({ side: 'under', line: 70 }, { recent: 50, mean: 50 }));
  assert.equal(up.cause, 'missing-starter-not-seen');
  assert.equal(up.sub, 'teammate-out');
  assert.equal(up.n.lineMean, 1.4);
  const down = diagnose(prop({ side: 'over', line: 30 }, { mean: 50 }));
  assert.equal(down.sub, 'own-status');
  // (a teammate out seen: not this cause)
  assert.notEqual(diagnose(prop({ side: 'under', line: 70 }, { mean: 50, vac: 0.2, out: ['A'] })).cause, 'missing-starter-not-seen');
});

test('diagnose: the vacated term toward the model\'s side; against it, not', () => {
  const d = diagnose(prop({ line: 52 }, { vacF: 1.15, vac: 0.3, vacHist: 0.05 }));
  assert.equal(d.cause, 'vacated-fade');
  assert.equal(d.sub, 'boost');
  assert.equal(d.n.vacF, 1.15);
  assert.notEqual(diagnose(prop({ side: 'under', line: 52 }, { vacF: 1.15 })).cause, 'vacated-fade');
});

test('diagnose: early in the season with the prior carrying him toward the model\'s side', () => {
  const d = diagnose(prop({ line: 48 }, { games: 3, priorW: 0.6, rate: 55, recent: 45, mean: 53 }));
  assert.equal(d.cause, 'early-season-prior');
  assert.equal(d.sub, 'prior-weight');
  // (the prior pulling the other way: not it)
  assert.notEqual(diagnose(prop({ line: 48 }, { games: 3, priorW: 0.6, rate: 45, recent: 55, mean: 53 })).cause, 'early-season-prior');
  // (an older CHECK without priorW: by its games)
  assert.equal(diagnose(prop({ line: 48 }, { games: 2, priorW: undefined, rate: 55, recent: 45, mean: 53 })).sub, 'few-games');
});

test('diagnose: the driver that moves him most toward the model\'s side; near the line, the spread\'s shape; else unknown', () => {
  const m = diagnose(prop({ line: 52 }, { opp: 1.2 }));
  assert.equal(m.cause, 'matchup');
  assert.equal(m.sub, 'opponent');
  assert.deepEqual(m.n.driver, { name: 'opponent', pct: 20 });
  assert.equal(diagnose(prop({ line: 52 }, { script: 1.44 })).cause, 'game-script');
  assert.notEqual(diagnose(prop({ line: 52 }, { ctxF: 0.85 })).cause, 'context-term');
  assert.equal(diagnose(prop({ side: 'under', line: 52 }, { ctxF: 0.85 })).cause, 'context-term');
  assert.equal(diagnose(prop({ line: 52 })).cause, 'dispersion');
  assert.equal(diagnose(prop({ line: 43 })).cause, 'unknown');
  for (const c of [prop({ line: 52 }), prop({ line: 43 })]) assert.ok(CAUSES.includes(diagnose(c).cause));
});

test("diagnose: a game market's context adjustment, its distance from the line, else the ratings", () => {
  const g = (over) => ({ id: '401:total', market: 'total', side: 'over', line: 44.5, expTotal: 50, expMargin: 3, model: 0.7, fair: 0.5, gap: 0.2, context: { adj: { margin: 0, total: 0 } }, ...over });
  assert.equal(diagnose(g({ context: { adj: { total: 4, margin: 0 } } })).cause, 'context-term');
  assert.equal(diagnose(g({ context: { adj: { total: -4, margin: 0 } } })).cause, 'matchup');
  assert.equal(diagnose(g({ line: 49 })).cause, 'dispersion');
  const s = diagnose({ id: '401:spread', market: 'spread', side: 'away', line: 6.5, expMargin: -2, model: 0.68, fair: 0.5, context: { adj: { margin: -3 } } });
  assert.equal(s.n.dist, 8.5);
  assert.equal(s.cause, 'matchup');
  assert.equal(s.sub, 'ratings');
});

test('checkOf diagnoses the CHECK it makes; upsertCheck keeps its research and gives an older one a diagnosis', () => {
  const c = checkOf({ ...prop({ line: 52 }, { opp: 1.2 }), units: 0.5, intent: 'edge' }, { skip: true, kind: 'gap', why: 'too far' });
  assert.equal(c.diagnosis.cause, 'matchup');
  const { diagnosis: _d, ...old } = c;
  const ledger = { checks: [{ ...old, research: { status: 'out', at: 'x' } }] };
  assert.equal(upsertCheck(ledger, c, now), null);
  assert.equal(ledger.checks[0].diagnosis.cause, 'matchup');
  assert.equal(upsertCheck(ledger, { ...c, line: 53 }, now), 'updated');
  assert.equal(ledger.checks[0].research.status, 'out');
  // (trimmed: the diagnosis kept)
  const done = [{ ...c, checkResult: { status: 'won', gradedAt: new Date(now.getTime() - TRIM_AFTER - 1).toISOString() } }];
  checkTrim(done, now);
  assert.equal(done[0].diagnosis.cause, 'matchup');
  assert.equal(done[0].projection.rate, undefined);
  assert.equal(diagnosisOf({ trimmed: true, cause: 'gap', projection: { mean: 3 } }).cause, 'unknown');
});

test('wilson and tallyOf: the interval, the break-even of the prices, the profit a CHECK', () => {
  assert.deepEqual(wilson(5, 10), [0.2366, 0.7634]);
  assert.equal(wilson(0, 0), null);
  const t = tallyOf([graded(prop(), 'won'), graded(prop(), 'lost'), graded(prop(), 'push'), { ...prop(), checkResult: { status: 'push', void: true, profit: 0 } }]);
  assert.equal(t.n, 3);
  assert.equal(t.hitRate, 0.5);
  assert.equal(t.breakEven, 0.5238);
  assert.equal(t.profit, -0.09);
  assert.equal(t.perUnit, -0.03);
});

test('checkLearning: a confirmed blind spot, a lean to watch, a guard that can loosen (ready only at 40 and a clear margin), never applied', () => {
  const vac = prop({ line: 52 }, { vacF: 1.15 });
  const opp = prop({ line: 52 }, { opp: 1.2 });
  const role = prop({ cause: 'role', roleReason: 'snap-jump' });
  const early = prop({ line: 48 }, { games: 3, priorW: 0.6, rate: 55, recent: 45, mean: 53 });
  const list = [
    ...Array.from({ length: 30 }, (_, i) => graded({ ...vac, id: `v${i}` }, i < 6 ? 'won' : 'lost')),
    ...Array.from({ length: 12 }, (_, i) => graded({ ...opp, id: `o${i}` }, i < 5 ? 'won' : 'lost')),
    ...Array.from({ length: 30 }, (_, i) => graded({ ...role, id: `r${i}` }, i < 25 ? 'won' : 'lost')),
    ...Array.from({ length: 50 }, (_, i) => graded({ ...early, id: `e${i}` }, i < 42 ? 'won' : 'lost')),
    // (closed and open ones out of the tally; the open counted by cause)
    graded({ ...vac, id: 'closed', closedAt: 'x' }, 'won'),
    { ...vac, id: 'open' },
  ];
  const l = checkLearning(list);
  assert.equal(l.graded, 122);
  assert.equal(l.open, 1);
  assert.deepEqual(l.openByCause, { 'vacated-fade': 1 });
  assert.equal(l.byCause['vacated-fade'].n, 30);
  assert.equal(l.byRole['snap-jump'].won, 25);
  assert.equal(l.byCauseStat['vacated-fade']['prop:recYds'].lost, 24);
  const [first, ...rest] = l.recommendations;
  assert.equal(first.kind, 'blind-spot');
  assert.equal(first.cause, 'vacated-fade');
  assert.equal(first.confirmed, true);
  assert.match(first.text, /6-24, 20% \[10-37%\] against 52% to break even/);
  assert.ok(first.text.includes(FIXES['vacated-fade']));
  const early_ = rest.find((x) => x.cause === 'early-season-prior');
  assert.equal(early_.kind, 'loosen');
  assert.equal(early_.change.ready, true);
  assert.equal(early_.change.applied, false);
  assert.equal(early_.change.from, GAP.prop);
  const snap = rest.find((x) => x.cause === 'role:snap-jump');
  assert.equal(snap.kind, 'loosen');
  // (30 graded: under LOOSEN_N, recorded, not ready)
  assert.ok(30 < LOOSEN_N);
  assert.equal(snap.change.ready, false);
  assert.deepEqual([snap.change.guard, snap.change.from, snap.change.to], ['ROLE.snapJump', ROLE.snapJump, 0.15]);
  const watch = rest.find((x) => x.cause === 'matchup');
  assert.equal(watch.kind, 'watch');
  assert.deepEqual(l.recommendations.map((x) => x.rank), [1, 2, 3, 4]);
  // (blind spots, then the loosenings (the ready first), then the watches)
  assert.deepEqual(l.recommendations.map((x) => x.kind), ['blind-spot', 'loosen', 'loosen', 'watch']);
  assert.equal(l.recommendations[1].cause, 'early-season-prior');
  // (fewer than MIN_N graded: no advice)
  assert.deepEqual(checkLearning(list.slice(0, 5)).recommendations, []);
});

test('loosenFor: each role sub-reason its own threshold, a gap cause its market\'s gap', () => {
  assert.equal(loosenFor('role', 'group-out').guard, 'ROLE.vac');
  assert.equal(loosenFor('role', 'backup-qb').to, 'priced and bet as any prop');
  assert.deepEqual(loosenFor('matchup', null, 'total'), { guard: 'GAP.total for CHECKs diagnosed matchup', from: GAP.total, to: 0.17 });
});

test('ai-budget: the real cost from the usage, the day and month caps, an unreadable log spends nothing, a dry one writes nothing', () => {
  assert.equal(costOf({ input_tokens: 1e6, output_tokens: 1e5, server_tool_use: { web_search_requests: 3 } }), 4 + 2 + 0.03);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-budget-'));
  const file = path.join(dir, 'ai-usage.json');
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at: '2026-10-09T01:00:00Z', cost: 1.3 }, { at: '2026-10-01T01:00:00Z', cost: 23 }] }));
  const b = aiBudget({ file, now });
  assert.equal(Math.round(b.left() * 100) / 100, 0.2);
  assert.equal(b.canSpend(0.3), false);
  assert.equal(b.canSpend(0.1), true);
  b.record({ what: 't', cost: 0.1 });
  assert.equal(b.save(), true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).entries.length, 3);
  // (the month's cap)
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at: '2026-10-02T01:00:00Z', cost: 24.9 }] }));
  assert.equal(aiBudget({ file, now }).canSpend(0.3), false);
  fs.writeFileSync(file, '{ not json');
  const warned = [];
  const broken = aiBudget({ file, now, log: { warn: (m) => warned.push(m) } });
  assert.equal(broken.canSpend(0.01), false);
  assert.equal(warned.length, 1);
  broken.record({ cost: 1 });
  assert.equal(broken.save(), false);
  const dry = aiBudget({ file: path.join(dir, 'dry.json'), now, dry: true });
  dry.record({ cost: 0.1 });
  assert.equal(dry.save(), false);
  assert.equal(fs.existsSync(path.join(dir, 'dry.json')), false);
});

test('findingOf: the JSON alone, its fields checked; athleteOf: his own id or the report\'s; researchNote: out or questionable with a source and an id', () => {
  const f = findingOf('Here: {"player":"Chris Godwin Jr.","status":"out","reason":"injury","summary":"Ruled out Friday.","sources":["https://x.com/a","javascript:alert(1)"]} done');
  assert.deepEqual(f, { player: 'Chris Godwin Jr.', status: 'out', reason: 'injury', summary: 'Ruled out Friday.', sources: ['https://x.com/a'] });
  assert.equal(findingOf('no json').status, 'unknown');
  assert.equal(findingOf('{"status":"benched"}').status, 'unknown');
  const c = prop();
  const report = new Map([['27', [{ id: '4241', name: 'Chris Godwin' }]]]);
  assert.equal(athleteOf(c, 'Mike Evans', report), '9');
  assert.equal(athleteOf(c, 'chris godwin jr', report), '4241');
  assert.equal(athleteOf(c, 'Someone Else', report), null);
  const rs = { ...f, athlete: '4241', at: '2026-10-09T12:00:00Z' };
  assert.deepEqual(researchNote(c, rs, 'nfl', { now }), { id: c.id, reason: 'news', player: '4241', status: 'out', team: null, sport: 'nfl', note: null, by: null, at: rs.at, from: 'research' });
  assert.equal(researchNote(c, { ...rs, sources: [] }, 'nfl', { now }), null);
  assert.equal(researchNote(c, { ...rs, status: 'active' }, 'nfl', { now }), null);
  assert.equal(researchNote(c, { ...rs, athlete: null }, 'nfl', { now }), null);
});

test('researchNote: the official report wins (never Out made Questionable, a listing since the research, a player cleared), and a finding expires', () => {
  const c = prop();
  const rs = { status: 'questionable', reason: 'injury', athlete: '4241', sources: ['https://a.b'], at: '2026-10-09T06:00:00Z' };
  const rep = (status, date) => new Map([['27', [{ id: '4241', name: 'Chris Godwin', status, ...(date ? { date } : {}) }]]]);
  // (fresh, not on the report: applied)
  assert.equal(researchNote(c, rs, 'nfl', { now, report: new Map() })?.status, 'questionable');
  // (the report lists him Out: never made Questionable; nor a report's Questionable made Questionable again)
  assert.equal(researchNote(c, rs, 'nfl', { now, report: rep('Out', '2026-10-08T00:00Z') }), null);
  assert.equal(researchNote(c, rs, 'nfl', { now, report: rep('Questionable', '2026-10-08T00:00Z') }), null);
  // (research out over an older Questionable: applied; over one dated since, or undated: the report's word)
  const out = { ...rs, status: 'out' };
  assert.equal(researchNote(c, out, 'nfl', { now, report: rep('Questionable', '2026-10-08T00:00Z') })?.status, 'out');
  assert.equal(researchNote(c, out, 'nfl', { now, report: rep('Questionable', '2026-10-09T10:00Z') }), null);
  assert.equal(researchNote(c, out, 'nfl', { now, report: rep('Questionable') }), null);
  // (an owner's note's entry isn't the report's)
  assert.equal(researchNote(c, out, 'nfl', { now, report: new Map([['27', [{ id: '4241', status: 'Out', from: 'owner note' }]]]) })?.status, 'out');
  // (on the report when researched, off it now: cleared)
  assert.equal(researchNote(c, { ...out, onReport: 'Questionable' }, 'nfl', { now, report: new Map() }), null);
  // (RESEARCH_TTL_H hours on, or no time: no longer applied)
  assert.equal(researchNote(c, out, 'nfl', { now: new Date(Date.parse(rs.at) + (RESEARCH_TTL_H + 1) * 36e5), report: new Map() }), null);
  assert.equal(researchNote(c, { ...out, at: 'x' }, 'nfl', { now }), null);
});

// (a mock of the SDK's client: each answer in turn, every request kept)
function mockClient(answers) {
  const asked = [];
  return { asked, beta: { messages: { create: async (req) => (asked.push(JSON.parse(JSON.stringify(req))), answers.shift()) } } };
}
const answer = (finding, over = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'text', text: JSON.stringify(finding) }], usage: { input_tokens: 20000, output_tokens: 1000, server_tool_use: { web_search_requests: 2 } }, ...over });

test('researchOne: Opus 5.5 with the web search tool and the fallback, a paused turn continued, its usage summed', async () => {
  const client = mockClient([
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search' }], usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 1 } } },
    answer({ player: 'Mike Evans', status: 'questionable', reason: 'injury', summary: 'Hamstring.', sources: ['https://a.b/c'] }),
  ]);
  const r = await researchOne(client, prop(), 'nfl', aiBudget({ now }));
  assert.equal(client.asked.length, 2);
  assert.equal(client.asked[0].model, 'claude-opus-5-5');
  assert.equal(client.asked[0].tools[0].type, 'web_search_20260209');
  assert.equal(client.asked[0].fallbacks, 'default');
  assert.equal(client.asked[1].messages.length, 2);
  assert.equal(r.finding.status, 'questionable');
  assert.equal(r.usage.server_tool_use.web_search_requests, 3);
  assert.equal(Math.round(r.cost * 1e4) / 1e4, Math.round(((21000 * 4 + 1100 * 20) / 1e6 + 0.03) * 1e4) / 1e4);
  const refused = await researchOne(mockClient([{ stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 0 } }]), prop(), 'nfl');
  assert.equal(refused.finding.status, 'unknown');
  assert.equal(refused.retry, false);
  // (cut short at max_tokens: an unknown, to be asked once more)
  const cut = await researchOne(mockClient([{ stop_reason: 'max_tokens', content: [], usage: { input_tokens: 10, output_tokens: 8000 } }]), prop(), 'nfl');
  assert.equal(cut.retry, true);
  // (the citations split one reply's text mid-JSON: joined as they come)
  const json = JSON.stringify({ player: 'Mike Evans', status: 'out', reason: 'injury', summary: 'Ruled out with a hamstring injury on Friday.', sources: ['https://a.b/c'] });
  const i = json.indexOf('hamstring');
  const split = { stop_reason: 'end_turn', content: [{ type: 'text', text: json.slice(0, i) }, { type: 'text', text: json.slice(i, i + 9), citations: [{ type: 'web_search_result_location', url: 'https://a.b/c' }] }, { type: 'text', text: json.slice(i + 9) }], usage: { input_tokens: 10, output_tokens: 10 } };
  const joined = await researchOne(mockClient([split]), prop(), 'nfl');
  assert.equal(joined.finding.status, 'out');
  assert.equal(joined.finding.summary, 'Ruled out with a hamstring injury on Friday.');
});

test('researchOne: a paused turn continued only while the caps hold its worst case; the day stays under the cap', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-cap-'));
  const file = path.join(dir, 'ai-usage.json');
  // (a big turn: 60,000 in, 4,000 out, three searches: $0.35 each)
  const big = { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search' }], usage: { input_tokens: 60000, output_tokens: 4000, server_tool_use: { web_search_requests: 3 } } };
  const pausing = () => mockClient([{ ...big }, { ...big }, { ...big }]);
  const quiet = { log: () => {}, warn: () => {} };
  const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
  // ($1.25 spent today: $0.25 left, under a turn's worst case ($0.28): nothing asked)
  assert.equal(Math.round(ESTIMATE * 100) / 100, 0.28);
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at: now.toISOString(), what: 'other', cost: 1.25 }] }));
  let client = pausing();
  await researchChecks({ sport: 'nfl', checks: [rprop({ id: 'a' })], now, env, budget: aiBudget({ file, now }), client, log: quiet });
  assert.equal(client.asked.length, 0);
  // ($0.70 spent: the first turn fits, the second's worst case (the first's history re-sent) doesn't: stopped
  // there, cut short, the day under the cap)
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at: now.toISOString(), what: 'other', cost: 0.7 }] }));
  client = pausing();
  const budget = aiBudget({ file, now });
  assert.ok(budget.canSpend(ESTIMATE));
  const found = await researchChecks({ sport: 'nfl', checks: [rprop({ id: 'a' }), rprop({ id: 'b', gap: 0.1 })], now, env, budget, client, log: quiet });
  assert.equal(client.asked.length, 1);
  assert.equal(found.size, 0);
  assert.ok(budget.spent().day <= 1.5);
  const log = JSON.parse(fs.readFileSync(file, 'utf8')).entries.filter((e) => e.what === 'check-research');
  assert.deepEqual(log.map((e) => [e.id, !!e.retry]), [['a', true]]);
  // (plenty left: continued to MAX_TURNS, each turn's worst case checked, still a cut-short call)
  client = pausing();
  const roomy = await researchOne(client, rprop(), 'nfl', aiBudget({ now, caps: { day: 10, month: 25 } }));
  assert.equal(client.asked.length, 3);
  assert.equal(roomy.retry, true);
});

test('researchChecks: the quota from the usage log; a finding paid for but never saved back from it; a cut-short CHECK asked once more, no more', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-log-'));
  const file = path.join(dir, 'ai-usage.json');
  const quiet = { log: () => {}, warn: () => {} };
  const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
  const at = now.toISOString();
  const kept = { at, by: 'claude', status: 'out', athlete: '4241', sources: ['https://a.b'] };
  fs.writeFileSync(
    file,
    JSON.stringify({
      entries: [
        { at, what: 'check-research', sport: 'nfl', id: 'a', cost: 0.1, finding: kept },
        { at, what: 'check-research', sport: 'nfl', id: 'b', cost: 0.1, retry: true },
        { at, what: 'check-research', sport: 'nfl', id: 'c', cost: 0.1, retry: true },
        { at, what: 'check-research', sport: 'nfl', id: 'c', cost: 0.1, retry: true },
      ],
    }),
  );
  const client = mockClient([answer({ player: null, status: 'unknown', reason: 'none', summary: '', sources: [] }), answer({})]);
  const checks = [rprop({ id: 'a', gap: 0.5 }), rprop({ id: 'b', gap: 0.4 }), rprop({ id: 'c', gap: 0.3 }), rprop({ id: 'd', gap: 0.2 })];
  const found = await researchChecks({ sport: 'nfl', checks, now, env, budget: aiBudget({ file, now }), client, log: quiet });
  // (a's finding back from the log, never asked again; three asked about today already (a, b, c): the quota
  // spent, so b's second try waits, c's tries done, d not reached)
  assert.deepEqual([...found.keys()], ['a']);
  assert.equal(found.get('a').status, 'out');
  assert.equal(client.asked.length, 0);
  // (a new day: b asked once more, c not again, d asked)
  const tomorrow = new Date(now.getTime() + 864e5);
  const later = await researchChecks({ sport: 'nfl', checks: checks.map((c) => ({ ...c, start: '2026-10-12T17:00:00Z' })), now: tomorrow, env, budget: aiBudget({ file, now: tomorrow }), client, log: quiet });
  assert.equal(client.asked.length, 2);
  assert.deepEqual([...later.keys()].sort(), ['a', 'b', 'd']);
});

test('researchChecks: off, without a key or on a dry run nothing asked; on, the biggest model Kelly first (a gap never), the day\'s quota, the caps, each cost logged', async () => {
  const quiet = { log: () => {}, warn: () => {} };
  const checks = [rprop({ id: 'a', gap: 0.2 }), rprop({ id: 'b', gap: -0.3 }), rprop({ id: 'c', gap: 0.25 }), rprop({ id: 'd', gap: 0.4, checkResult: { status: 'won' } }), rprop({ id: 'e', gap: 0.5, start: '2026-10-09T12:10:00Z' }), rprop({ id: 'f', gap: 0.21, research: { at: '2026-10-09T02:00:00Z' } })];
  const none = mockClient([]);
  assert.equal((await researchChecks({ sport: 'nfl', checks, now, env: {}, client: none, log: quiet })).size, 0);
  assert.equal((await researchChecks({ sport: 'nfl', checks, now, env: { CHECK_RESEARCH: '1' }, client: none, log: quiet })).size, 0);
  const dryLog = [];
  assert.equal((await researchChecks({ sport: 'nfl', checks, now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, dry: true, client: none, log: { log: (m) => dryLog.push(m) } })).size, 0);
  assert.equal(none.asked.length, 0);
  assert.match(dryLog[0], /would look into 2/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-'));
  const budget = aiBudget({ file: path.join(dir, 'ai-usage.json'), now });
  const client = mockClient([answer({ player: 'Chris Godwin', status: 'out', reason: 'injury', summary: 'Out.', sources: ['https://a.b/c'] }), answer({ player: null, status: 'unknown', reason: 'none', summary: '', sources: [] })]);
  const report = new Map([['27', [{ id: '4241', name: 'Chris Godwin' }]]]);
  const found = await researchChecks({ sport: 'nfl', checks, now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget, client, reportOf: () => report, log: quiet });
  // (b and c, the biggest open model Kellys; one done today already, so two of the three; e locked, d graded)
  assert.deepEqual([...found.keys()], ['b', 'c']);
  assert.equal(found.get('b').athlete, '4241');
  assert.equal(found.get('b').status, 'out');
  assert.equal(found.get('c').status, 'unknown');
  const log = JSON.parse(fs.readFileSync(path.join(dir, 'ai-usage.json'), 'utf8')).entries;
  assert.deepEqual(log.map((e) => [e.what, e.id]), [['check-research', 'b'], ['check-research', 'c']]);
  assert.equal(log[0].cost, 0.12);
  // (the caps reached: nothing asked)
  const tight = aiBudget({ file: path.join(dir, 'ai-usage.json'), now, caps: { day: 0.3, month: 25 } });
  const more = mockClient([answer({})]);
  assert.equal((await researchChecks({ sport: 'nfl', checks: [rprop({ id: 'g', gap: 0.3 })], now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget: tight, client: more, log: quiet })).size, 0);
  assert.equal(more.asked.length, 0);
});

test("a research finding goes into the injury report as an owner's note does, flagged research", async () => {
  const c = prop();
  const live = new Map([['401', { injuries: new Map([['27', [{ id: '4241', name: 'Chris Godwin', pos: 'WR', status: 'Questionable', date: '2026-10-08T00:00Z' }]]]) }]]);
  const notes = new Map([[c.id, researchNote(c, { status: 'out', reason: 'injury', athlete: '4241', sources: ['https://a.b'], at: '2026-10-09T10:00:00Z' }, 'nfl', { now, report: live.get('401').injuries })]]);
  const applied = await applyNotes('nfl', live, [{ game: { id: '401', home: '27', away: '6' } }], notes, { checks: [c] });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].from, 'research');
  const entry = live.get('401').injuries.get('27').find((p) => p.id === '4241');
  assert.deepEqual([entry.status, entry.from], ['Out', 'research']);
  assert.deepEqual(noteWords(live.get('401')), ['Research: Chris Godwin out']);
});

test("the Algorithm tab's CHECKs panel: a cause a row (a role's sub-reasons their own), the open ones counted, the advice blind spots first", async () => {
  const desk = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'bets-entry.ts'), data: {} });
  const vac = prop({ line: 52 }, { vacF: 1.15 });
  const learning = checkLearning([...Array.from({ length: 12 }, (_, i) => graded({ ...vac, id: `v${i}` }, i < 2 ? 'won' : 'lost')), prop({ cause: 'role', roleReason: 'line', id: 'open' })]);
  const { rows, advice } = desk.checkPanelOf([{ sport: 'nfl', label: 'NFL', checks: { learning } }, { sport: 'nba', label: 'NBA', checks: null }]);
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.n, r.open]), [['vacated-fade', 'Vacated work', 12, 0], ['role:line', 'Role change (line)', 0, 1]]);
  assert.equal(rows[0].stats, 'recYds 2-10');
  assert.equal(advice.length, 1);
  assert.equal(advice[0].kind, 'blind-spot');
  assert.equal(advice[0].sport, 'NFL');
});
