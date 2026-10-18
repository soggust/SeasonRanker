// The CHECKs' research as their judgment call (libs/ranker/scripts/model/research.mjs, the owner's of 2026-10-17):
// the finding's verdict (a real reason into the inputs, nothing found a bet, can't tell a CHECK), the bets' gate
// that turns each kind off by itself, whether our feeds held the reason, the scorecard, the self-check's repeat
// reasons and the desk's panel. No live calls: every client is a mock.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aiBudget } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { checkLearning } from '../libs/ranker/scripts/model/check-learn.mjs';
import { applyNotes, noteWords } from '../libs/ranker/scripts/model/notes.mjs';
import { levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { MAX_SEARCHES, RESEARCH_GATE_N, RESEARCH_UNITS, citedUrls, feedCheck, findingOf, hollow, researchCall, researchCard, researchChecks, researchGateOf, researchNote, researchOne, searchErrors, verdictOf } from '../libs/ranker/scripts/model/research.mjs';
import { c22 } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { loadEngine } from './support/engine.mjs';

const now = new Date('2026-10-17T15:00:00Z');
const quiet = { log: () => {}, warn: () => {} };
// (a role CHECK over the CHECK bar, its game tomorrow)
const check = (over = {}) => ({ id: '401:prop:recYds:9', event: '401', sport: 'nfl', start: '2026-10-18T17:00:00Z', matchup: 'TB @ DAL', market: 'prop', propType: 'recYds', statLabel: 'Rec Yds', player: 'Mike Evans', athlete: '9', team: '27', side: 'over', line: 40, odds: -110, model: 0.7, fair: 0.5, gap: 0.2, cause: 'role', roleReason: 'snap-jump', status: 'check', projection: { mean: 55, out: ['Chris Godwin'] }, ...over });
const answer = (o) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(o) }], usage: { input_tokens: 15000, output_tokens: 800, server_tool_use: { web_search_requests: 2 } } });
function mockClient(answers) {
  const asked = [];
  const create = async (req) => {
    asked.push(req);
    return answers.shift();
  };
  return { asked, beta: { messages: { create } } };
}

test('findingOf and verdictOf: a real reason adjusts, confident nothing bets, anything unsure stays a CHECK', () => {
  const f = (o) => findingOf(JSON.stringify({ player: 'Chris Godwin', status: 'out', reason: 'injury', summary: 'Out.', sources: ['https://a.b/c'], ...o }));
  // (a reason found, high or medium: adjust)
  assert.equal(verdictOf(f({ explains: true, category: 'injury', confidence: 'high' })), 'adjust');
  assert.equal(verdictOf(f({ explains: true, category: 'role', confidence: 'medium' })), 'adjust');
  // (low confidence, or a reason of "market" (a contradiction: its confidence low): a CHECK)
  assert.equal(verdictOf(f({ explains: true, category: 'injury', confidence: 'low' })), 'check');
  const odd = f({ explains: true, category: 'market', confidence: 'high' });
  assert.deepEqual([odd.category, odd.confidence, verdictOf(odd)], ['market', 'low', 'check']);
  // (nothing found: a bet only when sure, with sources; its category market whatever it said)
  const none = f({ status: 'active', explains: false, category: 'injury', confidence: 'high' });
  assert.deepEqual([none.category, verdictOf(none)], ['market', 'bet']);
  // (medium that nothing explains it: the "no real reason" outcome, a bet too (2026-10-18); low a CHECK)
  assert.equal(verdictOf(f({ explains: false, confidence: 'medium' })), 'bet');
  assert.equal(verdictOf(f({ explains: false, confidence: 'low' })), 'check');
  assert.equal(verdictOf(f({ explains: false, confidence: 'high', sources: [] })), 'check');
  // (no verdict's fields, an older finding, or one cut short: a CHECK)
  assert.equal(verdictOf(f({})), 'check');
  assert.equal(f({}).explains, null);
  assert.equal(verdictOf({ explains: false, confidence: 'high', sources: ['https://a.b'], problem: 'stopped: max_tokens' }), 'check');
  assert.equal(verdictOf(null), 'check');
  // (the new statuses kept)
  assert.equal(f({ status: 'doubtful' }).status, 'doubtful');
  assert.equal(f({ status: 'limited' }).status, 'limited');
});

test('researchCall: a bet the model side at half a unit, a role/news/gap CHECK alone, never a game started, never with its gate off', () => {
  const rs = { explains: false, category: 'market', confidence: 'high', sources: ['https://a.b'], summary: 'Nothing on him.' };
  const bet = researchCall(check(), rs, { now });
  assert.equal(bet.act, 'bet');
  assert.equal(bet.units, RESEARCH_UNITS);
  assert.equal(RESEARCH_UNITS, 0.5);
  assert.match(bet.why, /no real-world reason/);
  assert.equal(researchCall(check({ cause: 'news' }), rs, { now }).act, 'bet');
  assert.equal(researchCall(check({ cause: 'gap' }), rs, { now }).act, 'bet');
  assert.equal(researchCall(check({ cause: 'other' }), rs, { now }).act, 'check');
  assert.equal(researchCall(check({ start: '2026-10-17T14:00:00Z' }), rs, { now }).act, 'check');
  const off = { bet: { on: false, why: 'research bets -3u over 40 graded with a close: off' }, adjusted: { on: true } };
  assert.deepEqual(researchCall(check(), rs, { now, gate: off }), { act: 'check', why: off.bet.why });
  // (a reason found: adjust, its gate its own)
  const why = { explains: true, category: 'injury', confidence: 'high', status: 'out', sources: ['https://a.b'], summary: 'Godwin out.' };
  assert.equal(researchCall(check(), why, { now, gate: off }).act, 'adjust');
  assert.equal(researchCall(check(), why, { now, gate: { adjusted: { on: false, why: 'off' } } }).act, 'check');
  assert.match(researchCall(check(), { ...why, confidence: 'low' }, { now }).why, /can't tell/);
});

test('researchChecks with a mock client: each finding with its verdict, kept on its CHECK; the log says the verdict', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-'));
  const budget = aiBudget({ file: path.join(dir, 'log.json'), now, caps: { day: 5, month: 80 } });
  const checks = [check({ id: 'a', model: 0.8 }), check({ id: 'b', model: 0.75 }), check({ id: 'c', model: 0.7 })];
  const client = mockClient([
    answer({ player: 'Chris Godwin', status: 'out', reason: 'injury', explains: true, category: 'injury', confidence: 'high', summary: 'Godwin out.', sources: ['https://a.b/1'] }),
    answer({ player: 'Mike Evans', status: 'active', reason: 'none', explains: false, category: 'market', confidence: 'high', summary: 'Nothing found.', sources: ['https://a.b/2'] }),
    answer({ player: null, status: 'unknown', reason: 'none', explains: false, category: 'market', confidence: 'low', summary: 'Thin.', sources: ['https://a.b/3'] }),
  ]);
  const lines = [];
  const report = new Map([['27', [{ id: '4241', name: 'Chris Godwin' }]]]);
  const found = await researchChecks({ sport: 'nfl', checks, now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget, client, reportOf: () => report, log: { log: (m) => lines.push(m), warn: () => {} } });
  assert.deepEqual([...found.keys()], ['a', 'b', 'c']);
  assert.deepEqual([...found.values()].map(verdictOf), ['adjust', 'bet', 'check']);
  assert.equal(found.get('a').athlete, '4241');
  assert.match(client.asked[0].system, /"explains": true \| false/);
  assert.ok(lines.some((l) => /verdict adjust \(injury, high confidence\)/.test(l)));
  assert.ok(lines.some((l) => /verdict check \(market, low confidence\)/.test(l)));
});

test("an adjust's status into the game's report as an owner's note is: doubtful as the report words it, limited as questionable", async () => {
  const c = check();
  for (const [status, word] of [['doubtful', 'Doubtful'], ['limited', 'Questionable'], ['out', 'Out']]) {
    const live = new Map([['401', { injuries: new Map([['27', []]]) }]]);
    const note = researchNote(c, { status, reason: 'injury', athlete: '4241', sources: ['https://a.b'], at: '2026-10-17T10:00:00Z' }, 'nfl', { now, report: live.get('401').injuries });
    assert.ok(note, status);
    const applied = await applyNotes('nfl', live, [{ game: { id: '401', home: '27', away: '6' } }], new Map([[c.id, note]]), { checks: [c], rosterOf: async () => new Set(['4241']) });
    assert.equal(applied.length, 1);
    const entry = live.get('401').injuries.get('27').find((p) => p.id === '4241');
    assert.deepEqual([entry.status, entry.from], [word, 'research']);
    assert.match(noteWords(live.get('401'))[0], /^Research: /);
  }
  // (active, or a status the report already has as bad: nothing to put in, so it stays a CHECK)
  assert.equal(researchNote(c, { status: 'active', athlete: '4241', sources: ['https://a.b'], at: '2026-10-17T10:00:00Z' }, 'nfl', { now }), null);
  const listed = new Map([['27', [{ id: '4241', status: 'Out' }]]]);
  assert.equal(researchNote(c, { status: 'doubtful', athlete: '4241', sources: ['https://a.b'], at: '2026-10-17T10:00:00Z' }, 'nfl', { now, report: listed }), null);
});

test('researchGateOf: each kind off by itself once 40 graded with a close are negative in units; a bet without a close not counted', () => {
  const bet = (key, profit, clv = true) => ({ [key]: { check: 'x' }, status: profit > 0 ? 'won' : 'lost', profit, ...(clv ? { clv: { ev: 0.01, beat: true } } : {}) });
  assert.equal(RESEARCH_GATE_N, 40);
  const losing = Array.from({ length: 40 }, (_, i) => bet('researchBet', i < 18 ? 0.45 : -0.5));
  const g = researchGateOf(losing);
  assert.equal(g.bet.on, false);
  assert.equal(g.bet.n, 40);
  assert.match(g.bet.why, /off/);
  assert.equal(g.adjusted.on, true);
  assert.equal(researchGateOf(losing.slice(0, 39)).bet.on, true);
  assert.equal(researchGateOf([...losing.slice(0, 39), bet('researchBet', -0.5, false)]).bet.on, true);
  const adjustedLosing = losing.map((b) => ({ ...b, researchAdjusted: b.researchBet, researchBet: undefined }));
  // (the same game's other markets never turn the gate)
  assert.equal(researchGateOf(adjustedLosing.map((b) => ({ ...b, researchAdjusted: { own: false } }))).adjusted.on, true);
  assert.deepEqual([researchGateOf(adjustedLosing).adjusted.on, researchGateOf(adjustedLosing).bet.on], [false, true]);
  const winning = Array.from({ length: 40 }, (_, i) => bet('researchBet', i < 25 ? 0.45 : -0.5));
  assert.equal(researchGateOf(winning).bet.on, true);
});

test('feedCheck: a reason our feeds held is a model gap (the feed named), one none held a missing source; no reason, no tag', () => {
  const rs = { explains: true, category: 'injury', confidence: 'high', status: 'out', player: 'Chris Godwin', athlete: '4241', sources: ['https://a.b'] };
  const live = { injuries: new Map([['27', [{ id: '4241', name: 'Chris Godwin', status: 'Questionable' }]]]) };
  assert.deepEqual(feedCheck(rs, check({ projection: { mean: 55 } }), live), { inOurFeeds: true, feed: 'injury report' });
  assert.deepEqual(feedCheck({ ...rs, athlete: '1' , player: 'Nobody' }, check({ projection: { mean: 55 } }), { injuries: new Map() }), { inOurFeeds: false, feed: null });
  assert.equal(feedCheck({ ...rs, athlete: '1', player: 'Chris Godwin' }, check(), null).feed, 'teammates out (the projection)');
  assert.equal(feedCheck({ ...rs, category: 'role', athlete: null, player: 'Mike Evans' }, check({ projection: {} }), { news: [{ team: '27', unit: 'offense', headline: 'x' }] }).feed, 'news headlines');
  assert.equal(feedCheck({ ...rs, category: 'weather', athlete: null, player: null }, check({ projection: {} }), { weather: { wind: 22 } }).feed, 'weather forecast');
  assert.equal(feedCheck({ explains: false, confidence: 'high', sources: ['https://a.b'] }, check(), live), null);
  assert.equal(feedCheck({ ...rs, confidence: 'low' }, check(), live), null);
});

test('researchCard and the learning: the bets and the adjusted tallied apart with their CLV, the verdicts and categories, the feeds by category and cause', () => {
  const at = '2026-10-16T12:00:00Z';
  const bets = [
    { id: '1', researchBet: { check: 'a', category: 'market' }, status: 'won', profit: 0.45, clv: { ev: 0.02, beat: true } },
    { id: '2', researchBet: { check: 'b', category: 'market' }, status: 'lost', profit: -0.5 },
    { id: '3', researchAdjusted: { checks: ['c'], category: 'injury' }, status: 'open', profit: 0 },
    { id: '4', status: 'won', profit: 1 },
    { id: '5', researchAdjusted: { checks: ['c'], own: false, category: 'injury' }, status: 'lost', profit: -0.5 },
  ];
  const graded = (st) => ({ status: st, profit: st === 'won' ? 0.91 : -1 });
  const checks = [
    check({ id: 'a', research: { at, explains: false, category: 'market', confidence: 'high', sources: ['https://a.b'] }, checkResult: graded('won') }),
    check({ id: 'c', research: { at, explains: true, category: 'injury', confidence: 'high', status: 'questionable', sources: ['https://a.b'], feeds: { inOurFeeds: true, feed: 'injury report' } }, diagnosis: { cause: 'role', sub: 'snap-jump' } }),
    check({ id: 'd', research: { at, explains: true, category: 'role', confidence: 'medium', sources: ['https://a.b'], feeds: { inOurFeeds: false, feed: null } }, diagnosis: { cause: 'vacated-fade' }, checkResult: graded('lost') }),
    check({ id: 'e', research: { at, explains: false, category: 'market', confidence: 'low' } }),
  ];
  const card = researchCard(bets, checks, researchGateOf(bets), now);
  assert.deepEqual([card.bets.n, card.bets.won, card.bets.lost, card.bets.units, card.bets.withClose, card.bets.clv], [2, 1, 1, -0.05, 1, 0.02]);
  assert.deepEqual([card.adjusted.n, card.adjusted.open, Object.keys(card.adjusted.byCategory)], [0, 1, ['injury']]);
  assert.deepEqual([card.sameGame.n, card.sameGame.units], [1, -0.5]);
  assert.equal(card.researched, 4);
  assert.deepEqual([card.verdicts.adjust.n, card.verdicts.bet.n, card.verdicts.check.n], [2, 1, 1]);
  assert.deepEqual(card.feeds.inOurFeeds, { 'injury|role:snap-jump': 1 });
  assert.deepEqual(card.feeds.missing, { 'role|vacated-fade': 1 });
  assert.deepEqual(card.reasons.map((r) => [r.category, r.status, r.stat, r.inOurFeeds]).sort(), [['injury', 'questionable', 'recYds', true], ['role', null, 'recYds', false]]);
  // (the learning: each cause's research categories, for a later round)
  const l = checkLearning(checks);
  assert.equal(l.byCauseResearch['role:snap-jump'].market.researched, 2);
  assert.equal(l.byCauseResearch['role:snap-jump'].injury.researched, 1);
  assert.equal(l.byCauseResearch['vacated-fade'].role.lost, 1);
});

test('levelOf: a research bet a LIKE whatever its score, a research-adjusted one a LIKE at most', () => {
  const b = { intent: 'edge', p: 0.7 };
  assert.equal(levelOf(b, 0.2, 0.7), 'lock');
  assert.equal(levelOf({ ...b, researchBet: { check: 'x' } }, 0.2, 0.7), 'medium');
  assert.equal(levelOf({ ...b, researchBet: { check: 'x' } }, -0.01, 0.7), 'medium');
  assert.equal(levelOf({ ...b, researchAdjusted: { checks: ['x'] } }, 0.2, 0.7), 'medium');
  assert.equal(levelOf({ ...b, researchAdjusted: { checks: ['x'] } }, -0.01, 0.7), 'low');
});

test("the self-check's C22: the week's reasons grouped and ranked, known-unused apart from missing; a watch at 3 of one", () => {
  const at = '2026-10-16T12:00:00Z';
  const e = (over) => ({ at, id: 'x', category: 'injury', status: 'questionable', cause: 'role:snap-jump', stat: 'prop:rec', inOurFeeds: true, feed: 'injury report', ...over });
  const reasons = [e({ stat: 'rec' }), e({ stat: 'rec' }), e({ stat: 'recYds' }), e({ category: 'role', status: null, inOurFeeds: false, feed: null }), e({ at: '2026-10-01T00:00:00Z' })];
  const out = c22({ now, state: { checks: { research: { reasons } } } });
  assert.equal(out.status, 'watch');
  assert.equal(out.n, 4);
  assert.deepEqual(out.rows.map((r) => [r.key, r.n]), [['questionable-status known, unused', 3], ['role not in our feeds', 1]]);
  assert.equal(out.rows[0].text, 'questionable-status known, unused: 3 this week (props: rec, recYds)');
  assert.equal(c22({ now, state: {} }).status, 'partial');
  assert.equal(c22({ now, state: { checks: { research: { reasons: [] } } } }).status, 'thin');
});

test("the desk's CHECK panel: the research's bets and adjusted bets with their CLV, its verdicts; the popover's verdict in words", async () => {
  const desk = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
  const tally = (o) => ({ n: 0, won: 0, lost: 0, push: 0, units: 0, withClose: 0, clv: null, beat: null, open: 0, ...o });
  const research = {
    gate: { bet: { on: true, n: 2, units: 0, why: 'on' }, adjusted: { on: false, n: 40, units: -3, why: 'research-adjusted bets -3u over 40 graded with a close: off' } },
    bets: tally({ n: 2, won: 1, lost: 1, units: -0.05, withClose: 1, clv: 0.02, open: 1, byCategory: { market: tally({ won: 1, lost: 1 }) } }),
    adjusted: tally({ n: 40, won: 15, lost: 25, units: -3 }),
    researched: 5,
    verdicts: { adjust: { n: 2, graded: 1, won: 0, lost: 1, units: -1 }, bet: { n: 2, graded: 1, won: 1, lost: 0, units: 0.9 }, check: { n: 1, graded: 0, won: 0, lost: 0, units: 0 } },
    feeds: { inOurFeeds: { 'injury|role:snap-jump': 1 }, missing: { 'role|gap': 2 }, byFeed: {} },
  };
  const rows = desk.researchPanelOf([{ sport: 'nfl', label: 'NFL', checks: { research } }, { sport: 'nba', label: 'NBA', checks: { research: { ...research, researched: 0 } } }]);
  assert.deepEqual(rows.map((r) => [r.key, r.record, r.units, r.clv]), [['bet', '1-1', -0.05, 0.02], ['adjusted', '15-25', -3, null], ['verdicts', '-', null, null]]);
  assert.equal(rows[0].note, 'market 1-1');
  assert.match(rows[1].note, /off/);
  assert.equal(rows[2].note, '2 into the inputs, 2 bet, 1 still CHECKs; reasons in our feeds 1, not 2');
  const ui = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'ai-signals-entry.ts'), data: {} });
  const v = ui.researchView({ status: 'doubtful', verdict: 'adjust', act: 'check', actWhy: "no input of the model's takes it", category: 'injury', confidence: 'high', inOurFeeds: true, feed: 'injury report', sources: [] });
  assert.equal(v.status, 'Doubtful');
  assert.match(v.verdict, /^Reason found/);
  assert.equal(v.actWhy, "no input of the model's takes it");
  assert.equal(v.detail, 'Injury / limited, high confidence');
  assert.match(v.feeds, /^Our feeds had it \(injury report\)/);
  assert.match(ui.researchView({ verdict: 'bet', act: 'bet' }).verdict, /^Nothing found/);
  assert.equal(ui.researchView({ verdict: 'bet', act: 'bet' }).actWhy, null);
  assert.match(ui.researchView({}).verdict, /^Can.t tell/);
});

// ---- the web search's answers as the API returns them (tests/support/research-web-search.json: a live call's
// response, recorded 2026-10-17 and trimmed). Desk run 39085218876's every finding came back "unknown (none), 0
// sources": the tool's dynamic filtering runs its searches from code, every one counting toward max_uses, and at 2
// its loop of three failed, so the model saw no results ----
const recorded = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'support', 'research-web-search.json'), 'utf8'));
const copy = (m) => JSON.parse(JSON.stringify(m));

test('the research asks with room for the code-run searches: max_uses 5, the system prompt says how many', async () => {
  const client = mockClient([copy(recorded.fixed)]);
  await researchOne(client, check(), 'nfl', aiBudget({ now, caps: { day: 5, month: 80 } }));
  const req = client.asked[0];
  assert.equal(req.tools[0].type, 'web_search_20260209');
  assert.equal(req.tools[0].max_uses, MAX_SEARCHES);
  assert.equal(MAX_SEARCHES, 5);
  assert.match(req.system, /You have 5 web searches in all, counting each one run from code/);
  // (the prompt carries the player, the game and its start)
  assert.match(req.messages[0].content, /"player":"Mike Evans"/);
  assert.match(req.messages[0].content, /"game":"TB @ DAL"/);
  assert.match(req.messages[0].content, /"start":"2026-10-18T17:00:00Z"/);
});

test("the recorded answers: the fixed call's finding has its sources and a real verdict; the broken call's hollow answer is never kept, asked once more", async () => {
  const ok = await researchOne(mockClient([copy(recorded.fixed)]), check(), 'nfl');
  assert.equal(ok.retry, false);
  assert.equal(ok.finding.problem, undefined);
  assert.equal(ok.finding.player, 'Michael Penix Jr.');
  assert.equal(ok.finding.status, 'active');
  assert.equal(ok.finding.sources.length, 4);
  assert.ok(ok.finding.sources.every((u) => /^https:\/\//.test(u)));
  assert.equal(ok.finding.explains, false);
  assert.equal(ok.finding.confidence, 'medium');
  const bad = await researchOne(mockClient([copy(recorded.broken)]), check(), 'nfl');
  assert.equal(bad.finding.sources.length, 0);
  assert.equal(bad.retry, true);
  // (its answer says the search hit its limit: a failed search, asked once more)
  assert.match(bad.finding.problem, /^stopped: search failed/);
  // (a reply's search error named in the problem)
  const errored = copy(recorded.broken);
  errored.content.splice(2, 0, { type: 'web_search_tool_result', tool_use_id: 'x', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } });
  assert.deepEqual(searchErrors(errored.content), ['max_uses_exceeded']);
  assert.match((await researchOne(mockClient([errored]), check(), 'nfl')).finding.problem, /search errors: max_uses_exceeded/);
});

test('sources from the citations: an answer whose JSON lists none but whose text cites results is never a 0-sources finding', async () => {
  const m = copy(recorded.fixed);
  const text = m.content.find((b) => b.type === 'text');
  const o = JSON.parse(text.text.slice(text.text.indexOf('{'), text.text.lastIndexOf('}') + 1));
  o.sources = [];
  o.status = 'unknown';
  const json = JSON.stringify(o);
  const i = json.indexOf('ribs');
  // (the reply's text split by its citations, as the API returns a cited answer)
  const cite = (url) => ({ type: 'web_search_result_location', url, title: 'x', encrypted_index: '(trimmed)', cited_text: 'Penix practiced fully' });
  m.content.splice(m.content.indexOf(text), 1, { type: 'text', text: json.slice(0, i) }, { type: 'text', text: json.slice(i, i + 4), citations: [cite('https://www.nfl.com/news/a'), cite('https://www.espn.com/b'), cite('https://www.nfl.com/news/a'), cite('javascript:alert(1)')] }, { type: 'text', text: json.slice(i + 4) });
  assert.deepEqual(citedUrls(m.content), ['https://www.nfl.com/news/a', 'https://www.espn.com/b']);
  const r = await researchOne(mockClient([m]), check(), 'nfl');
  assert.deepEqual(r.finding.sources, ['https://www.nfl.com/news/a', 'https://www.espn.com/b']);
  assert.equal(r.finding.problem, undefined);
  assert.equal(r.retry, false);
  assert.ok(!hollow(r.finding));
});

test("tonight's hollow findings asked again: a CHECK whose research is a hollow one is open, a hollow logged try counts as cut short, two tries at most", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-'));
  const file = path.join(dir, 'log.json');
  const at = '2026-10-17T01:48:50.892Z';
  const old = { at, by: 'claude', model: 'claude-opus-5-5', player: 'Mike Evans', status: 'unknown', reason: 'none', summary: 'The search tool hit its usage limit.', sources: [], explains: false, category: 'market', confidence: 'low' };
  assert.ok(hollow(old));
  // (one that found nothing with a source or a status, its search fine: a finding; one whose search failed is
  // hollow whatever it lists)
  const quiet2 = { ...old, summary: 'No news found.' };
  assert.ok(!hollow({ ...quiet2, sources: ['https://a.b/c'] }));
  assert.ok(!hollow({ ...quiet2, status: 'active' }));
  assert.ok(hollow({ ...old, sources: ['https://a.b/c'], status: 'active' }));
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at, what: 'check-research', sport: 'nfl', id: 'a', cost: 0.12, finding: old }] }));
  const checks = [check({ id: 'a', research: old }), check({ id: 'b', model: 0.65, research: { ...quiet2, sources: ['https://a.b/c'], status: 'active' } })];
  const client = mockClient([copy(recorded.fixed)]);
  const found = await researchChecks({ sport: 'nfl', checks, now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget: aiBudget({ file, now, caps: { day: 5, month: 80 } }), client, log: quiet });
  // (a re-asked, its hollow finding not brought back from the log; b's real finding stands)
  assert.equal(client.asked.length, 1);
  assert.deepEqual([...found.keys()], ['a']);
  assert.equal(found.get('a').sources.length, 4);
  // (a second hollow answer: not kept; then its two tries are spent)
  const again = mockClient([copy(recorded.broken), copy(recorded.broken)]);
  const file2 = path.join(dir, 'log2.json');
  fs.writeFileSync(file2, JSON.stringify({ entries: [{ at, what: 'check-research', sport: 'nfl', id: 'a', cost: 0.12, finding: old }] }));
  const b2 = aiBudget({ file: file2, now, caps: { day: 5, month: 80 } });
  assert.equal((await researchChecks({ sport: 'nfl', checks: [checks[0]], now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget: b2, client: again, log: quiet })).size, 0);
  assert.equal(again.asked.length, 1);
  await researchChecks({ sport: 'nfl', checks: [checks[0]], now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget: aiBudget({ file: file2, now, caps: { day: 5, month: 80 } }), client: again, log: quiet });
  assert.equal(again.asked.length, 1);
});
