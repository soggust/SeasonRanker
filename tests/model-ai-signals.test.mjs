// The desk's two AI additions with their own caps (libs/ranker/scripts/model): the CHECKs' research's budget and
// every-CHECK reach (ai-budget.mjs researchBudget, research.mjs researchChecks), and the news signals (news-signals.mjs: Haiku
// reading the teams' stories for role changes, log only). No live calls: every client is a mock.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { aiBudget, CAP_WINDOWS, capsFrom, costOf, newsBudget, NEWS_CAPS, researchBudget, RESEARCH_CAPS, windowAt } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { researchChecks, measuredWords, ESTIMATE as RESEARCH_ESTIMATE } from '../libs/ranker/scripts/model/research.mjs';
import { ESTIMATE, MIN_CONF, newsSignals, pageOf, readLog, signalsOf, SIGNALS_MODEL } from '../libs/ranker/scripts/model/news-signals.mjs';
import { researchRow } from '../libs/ranker/scripts/model/picks.mjs';
import { teamStoryOf } from '../libs/ranker/scripts/model/news.mjs';
import { loadEngine } from './support/engine.mjs';

const now = new Date('2026-10-14T15:00:00Z');
const quiet = { log: () => {}, warn: () => {} };
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

test('capsFrom: the caps given unset or unreadable, a variable lowering them (never raising them) and above 0', () => {
  assert.deepEqual(capsFrom({}, 'X', { day: 0.5, month: 12 }), { day: 0.5, month: 12 });
  assert.deepEqual(capsFrom({ X_DAILY_USD: '', X_MONTHLY_USD: 'lots' }, 'X', { day: 0.5, month: 12 }), { day: 0.5, month: 12 });
  assert.deepEqual(capsFrom({ X_DAILY_USD: '0.25', X_MONTHLY_USD: '8' }, 'X', RESEARCH_CAPS), { day: 0.25, month: 8 });
  assert.deepEqual(capsFrom({ X_DAILY_USD: '50', X_MONTHLY_USD: '-3' }, 'X', RESEARCH_CAPS), { day: 4, month: 0 });
  // (the research's: $4 a day and $55 a month by default, the owner's (2026-10-18; $5 and $80 before the miss review's share came out); a variable lowers them, never
  // raises them)
  assert.deepEqual(RESEARCH_CAPS, { day: 4, month: 55 });
  assert.deepEqual(researchBudget({ env: {}, file: null, floor: null, now }).caps, { day: 4, month: 55 });
  assert.deepEqual(researchBudget({ env: { CHECK_RESEARCH_DAILY_USD: '9', CHECK_RESEARCH_MONTHLY_USD: '500' }, file: null, floor: null, now }).caps, { day: 4, month: 55 });
  assert.deepEqual(researchBudget({ env: { CHECK_RESEARCH_DAILY_USD: '2' }, file: null, floor: null, now }).caps, { day: 2, month: 55 });
});

test("the research's and the news's budgets: their own logs and caps, apart from the write-ups' (none counts the others')", () => {
  const dir = tmp('own-budgets');
  const writeups = path.join(dir, 'ai-usage.json');
  const rfile = path.join(dir, 'ai-usage-research.json');
  const nfile = path.join(dir, 'ai-usage-news.json');
  // (the write-ups' day spent to its cap: the others untouched)
  fs.writeFileSync(writeups, JSON.stringify({ entries: [{ at: now.toISOString(), what: 'writeup', cost: 1.5 }] }));
  assert.equal(aiBudget({ file: writeups, now }).left(), 0);
  const r = researchBudget({ env: {}, file: rfile, floor: null, now });
  assert.deepEqual(r.caps, RESEARCH_CAPS);
  assert.equal(r.left(), 4);
  const n = newsBudget({ env: {}, file: nfile, floor: null, now });
  assert.deepEqual(n.caps, NEWS_CAPS);
  assert.equal(n.left(), 0.15);
  // (the research's day cap: $4, the month's $55, whichever binds first)
  r.record({ what: 'check-research', cost: 3.8, usage: { input_tokens: 1 } });
  r.save();
  assert.equal(Math.round(researchBudget({ env: {}, file: rfile, floor: null, now }).left() * 100) / 100, 0.2);
  assert.equal(researchBudget({ env: {}, file: rfile, floor: null, now }).canSpend(RESEARCH_ESTIMATE), false);
  fs.writeFileSync(rfile, JSON.stringify({ entries: [{ at: '2026-10-02T00:00:00Z', cost: 54.9 }] }));
  assert.equal(researchBudget({ env: {}, file: rfile, floor: null, now }).canSpend(0.2), false);
  // (a variable lowers it)
  assert.equal(newsBudget({ env: { NEWS_SIGNALS_DAILY_USD: '0.05' }, file: nfile, floor: null, now }).left(), 0.05);
  // (the write-ups' log never saw the research's call)
  assert.equal(JSON.parse(fs.readFileSync(writeups, 'utf8')).entries.length, 1);
});

test('ai-budget life: the calls measured counted for good in the totals file, a failure or a carried total not', () => {
  const dir = tmp('life');
  const file = path.join(dir, 'log.json');
  const floor = path.join(dir, 'spend.json');
  const b = aiBudget({ file, floor, now, caps: { day: 5, month: 50 } });
  assert.equal(b.life().calls, 0);
  assert.equal(measuredWords(b), 'no calls measured yet');
  b.record({ what: 'check-research', cost: 0.1, usage: { input_tokens: 10 } });
  b.record({ what: 'check-research', cost: 0.3, usage: { input_tokens: 10 } });
  b.record({ what: 'check-research', cost: 0.43, usage: null, failed: true });
  b.save();
  const t = JSON.parse(fs.readFileSync(floor, 'utf8'));
  assert.deepEqual(t.life, { calls: 2, usd: 0.4, mean: 0.2, max: 0.3 });
  assert.match(measuredWords(b), /^2 calls measured: mean \$0\.200, highest \$0\.300$/);
  // (the log lost (a cold cache): the totals file keeps the count)
  fs.unlinkSync(file);
  const again = aiBudget({ file, floor, now, caps: { day: 5, month: 50 } });
  assert.equal(again.life().calls, 2);
  again.record({ what: 'check-research', cost: 0.2, usage: { input_tokens: 1 } });
  assert.equal(again.life().calls, 3);
  assert.equal(again.life().max, 0.3);
});

// (a mock of the SDK's client: each answer in turn, every request kept)
function mockClient(answers) {
  const asked = [];
  const create = async (req) => {
    asked.push(JSON.parse(JSON.stringify(req)));
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return a;
  };
  return { asked, messages: { create }, beta: { messages: { create } } };
}

// (a role CHECK over the CHECK bar the research may ask about)
const rcheck = (id, gap = 0.2) => ({ id, event: '401', sport: 'nfl', start: '2026-10-16T17:00:00Z', matchup: 'TB @ DAL', market: 'prop', propType: 'recYds', statLabel: 'Rec Yds', player: 'Mike Evans', athlete: '9', team: '27', side: 'over', line: 40, odds: -110, model: 0.5 + gap, fair: 0.5, gap, cause: 'role', status: 'check' });
const finding = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"player":null,"status":"unknown","reason":"none","summary":"","sources":["https://a.b/n"]}' }], usage: { input_tokens: 15000, output_tokens: 800, server_tool_use: { web_search_requests: 2 } } };

test("every open CHECK researched (the trial over): the biggest model Kelly first, one call each, till the day's cap bites", async () => {
  const env = { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' };
  const dir = tmp('every');
  const file = path.join(dir, 'ai-usage-research.json');
  // (calls of other sports today: no trial's room any more, every sport researching its own)
  const at = now.toISOString();
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at, what: 'check-research', sport: 'nba', id: 'x', cost: 0.1, usage: { input_tokens: 1 } }, { at, what: 'check-research', sport: 'nba', id: 'y', cost: 0.1, usage: { input_tokens: 1 } }] }));
  const checks = Array.from({ length: 8 }, (_, i) => rcheck(`c${i}`, 0.1 + i * 0.03));
  const client = mockClient(Array.from({ length: 8 }, () => ({ ...finding })));
  const lines = [];
  const found = await researchChecks({ sport: 'nfl', checks, now, env, budget: researchBudget({ env, file, floor: null, now }), client, log: { log: (m) => lines.push(m), warn: () => {} } });
  assert.equal(client.asked.length, 8);
  assert.equal(found.size, 8);
  // (the biggest first: the page's order)
  assert.match(client.asked[0].messages[0].content, /"modelChance":0.81/);
  const costLine = lines.find((l) => /CHECK research cost/.test(l));
  assert.match(costLine, /this call \$0\.0960 \(15,000 in, 800 out, 2 searches\); 3 calls measured: mean \$0\.099, highest \$0\.100; today \$0\.30 of \$4\.00, month \$0\.30 of \$55/);
  assert.ok(!lines.some((l) => /trial/.test(l)));
  // (the cap bites: $3.50 spent today, room for one worst case ($0.31) and then not another; the biggest go first)
  fs.writeFileSync(file, JSON.stringify({ entries: [{ at, what: 'check-research', sport: 'nba', id: 'x', cost: 3.5, usage: { input_tokens: 1 } }] }));
  const tight = mockClient(Array.from({ length: 8 }, () => ({ ...finding, usage: { input_tokens: 40000, output_tokens: 5000, server_tool_use: { web_search_requests: 2 } } })));
  const some = await researchChecks({ sport: 'nfl', checks, now, env, budget: researchBudget({ env, file, floor: null, now }), client: tight, log: quiet });
  assert.equal(tight.asked.length, 1);
  assert.deepEqual([...some.keys()], ['c7']);
});

test("the research's request: Opus 5.5, five searches, 5,000 tokens out; a worst case of $0.31 under the day's $5", async () => {
  assert.equal(Math.round(RESEARCH_ESTIMATE * 100) / 100, 0.31);
  const client = mockClient([{ ...finding }]);
  const dir = tmp('req');
  await researchChecks({ sport: 'nfl', checks: [rcheck('a')], now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, budget: researchBudget({ env: {}, file: path.join(dir, 'log.json'), floor: null, now }), client, log: quiet });
  assert.equal(client.asked[0].max_tokens, 5000);
  assert.equal(client.asked[0].tools[0].max_uses, 5);
});

test("picks.mjs researchRow: a finding for the page, its fields checked again; the popover's view in plain words", async () => {
  const row = researchRow({ status: 'out', reason: 'injury', player: ' Chris  Godwin ', summary: 'Ruled out Friday.', sources: ['https://www.espn.com/a', 'javascript:alert(1)'], at: '2026-10-14T12:00:00.000Z', cost: 0.12, model: 'x', applied: true });
  assert.deepEqual(row, { status: 'out', reason: 'injury', player: 'Chris Godwin', summary: 'Ruled out Friday.', sources: ['https://www.espn.com/a'], at: '2026-10-14T12:00:00.000Z', applied: true, verdict: 'check' });
  assert.equal(researchRow({ status: 'benched' }).status, 'unknown');
  const ui = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'ai-signals-entry.ts'), data: {} });
  const v = ui.researchView(row);
  assert.equal(v.status, 'Out');
  assert.equal(v.tone, 'bad');
  assert.equal(v.reason, 'Injury');
  assert.deepEqual(v.sources, [{ url: 'https://www.espn.com/a', host: 'espn.com' }]);
  assert.equal(v.applied, true);
  assert.equal(ui.researchView({ status: 'unknown', sources: [] }).status, 'Nothing found');
  assert.equal(ui.researchView(null), null);
});

// (ESPN's team stories: one on a role, one a recap, one league-wide)
const team = { id: '20', abbr: 'NYJ', nick: 'Jets', name: 'New York Jets' };
const story = (id, over = {}) => ({ id, type: 'Story', headline: `Jets: Breece Hall to get more carries ${id}`, description: 'The Jets will lean on Hall.', published: '2026-10-14T09:00:00Z', categories: [{ type: 'team', teamId: 20 }, { type: 'athlete', athleteId: 4427366, description: 'Breece Hall' }], ...over });
const feed = (articles) => async () => ({ articles });
const answerOf = (signals, usage = { input_tokens: 3000, output_tokens: 400 }) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ signals }) }], usage });

test('teamStoryOf: a team story with its tags and athletes; a recap or a league-wide piece none', () => {
  const s = teamStoryOf(story('1'), team);
  assert.deepEqual(s.athletes, [{ id: '4427366', name: 'Breece Hall' }]);
  assert.deepEqual(s.teams, ['20']);
  assert.equal(teamStoryOf(story('2', { type: 'Recap' }), team), null);
  assert.equal(teamStoryOf(story('3', { categories: [1, 2, 3].map((t) => ({ type: 'team', teamId: t })).concat([{ type: 'team', teamId: 20 }]) }), team), null);
});

test("signalsOf: the answer's JSON, each signal checked (its story, team, kind, direction, confidence; his id from the story's tags alone)", () => {
  const stories = [teamStoryOf(story('1'), team)];
  const text = `Here: ${JSON.stringify({
    signals: [
      { story: stories[0].id, team: '20', player: 'Breece Hall', athlete: '999', kind: 'role', direction: 'up', confidence: 0.85 },
      { story: stories[0].id, team: '20', player: 'Breece Hall', athlete: null, kind: 'role', direction: 'up', confidence: 0.85 },
      { story: 'nope', team: '20', player: 'X', athlete: null, kind: 'role', direction: 'up', confidence: 0.9 },
      { story: stories[0].id, team: '99', player: 'X', athlete: null, kind: 'role', direction: 'up', confidence: 0.9 },
      { story: stories[0].id, team: '20', player: 'Y', athlete: null, kind: 'traded', direction: 'up', confidence: 0.9 },
      { story: stories[0].id, team: '20', player: 'Z', athlete: null, kind: 'benched', direction: 'down', confidence: MIN_CONF - 0.1 },
      { story: stories[0].id, team: '20', player: 'Aaron Glenn', athlete: '4427366', kind: 'coaching', direction: 'none', confidence: 1.4 },
    ],
  })}`;
  const { signals, problem } = signalsOf(text, stories, { abbrOf: () => 'NYJ', day: '2026-10-14' });
  assert.equal(problem, undefined);
  // (the first: his id by name from the tags (the 999 given isn't the story's); the second the same signal; a team
  // the story isn't tagged to its one team's; a story not asked about, a kind not listed, a low confidence out; the
  // coaching one's athlete none, its confidence held to 1)
  assert.deepEqual(signals.map((s) => [s.player, s.athlete, s.kind, s.direction, s.confidence, s.abbr]), [['Breece Hall', '4427366', 'role', 'up', 0.85, 'NYJ'], ['X', null, 'role', 'up', 0.9, 'NYJ'], ['Aaron Glenn', null, 'coaching', 'none', 1, 'NYJ']]);
  // (a story tagged to two teams: a team it isn't tagged to dropped)
  const two = [{ ...stories[0], teams: ['20', '21'] }];
  assert.equal(signalsOf(JSON.stringify({ signals: [{ story: '1', team: '99', player: 'X', athlete: null, kind: 'role', direction: 'up', confidence: 0.9 }] }), two).signals.length, 0);
  assert.equal(signals[0].model, SIGNALS_MODEL);
  assert.equal(signalsOf('no json', stories).problem, 'no JSON');
  assert.equal(signalsOf(null, stories).problem, 'no text');
});

test('newsSignals: off by default, no key or a dry run calls nothing; on, Haiku reads each new story once, logs its cost, writes the log and the page', async () => {
  const dir = tmp('signals');
  const files = { log: path.join(dir, 'log.json'), page: path.join(dir, 'page.json') };
  const budgetFile = path.join(dir, 'usage.json');
  const fetchJson = feed([story('1'), story('2'), story('old', { published: '2026-10-01T00:00:00Z' })]);
  const none = mockClient([]);
  assert.equal(await newsSignals('nfl', { now, env: {}, client: none, teams: [team], fetchJson, files, log: quiet }), null);
  assert.equal(await newsSignals('nfl', { now, env: { NEWS_SIGNALS: '1' }, client: none, teams: [team], fetchJson, files, log: quiet }), null);
  const dryLines = [];
  const dry = await newsSignals('nfl', { now, env: { NEWS_SIGNALS: '1' }, dry: true, client: none, teams: [team], fetchJson, files, log: { log: (m) => dryLines.push(m) } });
  assert.equal(dry.stories, 2);
  assert.match(dryLines[0], /would read 2 new stories of 1 teams in 1 calls/);
  assert.equal(none.asked.length, 0);
  assert.equal(fs.existsSync(files.log), false);
  // (on: one call, Haiku at low effort with the schema)
  const env = { NEWS_SIGNALS: '1', ANTHROPIC_API_KEY: 'test' };
  const client = mockClient([answerOf([{ story: '1', team: '20', player: 'Breece Hall', athlete: '4427366', kind: 'role', direction: 'up', confidence: 0.8 }])]);
  const budget = newsBudget({ env, file: budgetFile, floor: null, now });
  const out = await newsSignals('nfl', { now, env, budget, client, teams: [team], fetchJson, files, log: quiet });
  assert.deepEqual([out.stories, out.calls, out.signals], [2, 1, 1]);
  assert.equal(client.asked[0].model, 'claude-haiku-5-5');
  assert.equal(client.asked[0].output_config.effort, 'low');
  assert.equal(client.asked[0].output_config.format.type, 'json_schema');
  assert.equal(Math.round(out.cost * 1e6) / 1e6, costOf({ input_tokens: 3000, output_tokens: 400 }, 'claude-haiku-5-5'));
  const kept = readLog(files.log);
  assert.deepEqual(Object.keys(kept.seen).sort(), ['1', '2']);
  assert.equal(kept.read['20'], '2026-10-14');
  assert.equal(kept.signals.length, 1);
  const page = JSON.parse(fs.readFileSync(files.page, 'utf8'));
  assert.equal(page.signals[0].player, 'Breece Hall');
  assert.equal(JSON.parse(fs.readFileSync(budgetFile, 'utf8')).entries[0].what, 'news-signals');
  // (the same day again: the team read, nothing asked; the next day, its stories seen: nothing asked)
  const again = mockClient([]);
  await newsSignals('nfl', { now, env, budget, client: again, teams: [team], fetchJson, files, log: quiet });
  await newsSignals('nfl', { now: new Date(now.getTime() + 864e5), env, budget, client: again, teams: [team], fetchJson, files, log: quiet });
  assert.equal(again.asked.length, 0);
});

test('newsSignals fail safe: the caps reached, a failed call or an unreadable log: no signals, the stories read again later', async () => {
  const dir = tmp('signals-safe');
  const files = { log: path.join(dir, 'log.json'), page: path.join(dir, 'page.json') };
  const env = { NEWS_SIGNALS: '1', ANTHROPIC_API_KEY: 'test' };
  const fetchJson = feed([story('1')]);
  // (the day's $0.15 spent: nothing asked, the team not marked read)
  const budgetFile = path.join(dir, 'usage.json');
  fs.writeFileSync(budgetFile, JSON.stringify({ entries: [{ at: now.toISOString(), what: 'news-signals', cost: 0.15 }] }));
  const client = mockClient([]);
  const capped = await newsSignals('nfl', { now, env, budget: newsBudget({ env, file: budgetFile, floor: null, now }), client, teams: [team], fetchJson, files, log: quiet });
  assert.equal(client.asked.length, 0);
  assert.match(capped.stopped, /the caps/);
  assert.equal(readLog(files.log).read['20'], undefined);
  assert.ok(ESTIMATE < 0.01);
  // (a failed call: logged at its worst case (a server's error may be billed), nothing seen)
  fs.writeFileSync(budgetFile, JSON.stringify({ entries: [] }));
  const err = Object.assign(new Error('overloaded'), { status: 529 });
  const failing = mockClient([err]);
  const b = newsBudget({ env, file: budgetFile, floor: null, now });
  const failed = await newsSignals('nfl', { now, env, budget: b, client: failing, teams: [team], fetchJson, files, log: quiet });
  assert.match(failed.stopped, /a failed call/);
  assert.equal(Object.keys(readLog(files.log).seen).length, 0);
  const logged = JSON.parse(fs.readFileSync(budgetFile, 'utf8')).entries;
  assert.equal(logged[0].failed, true);
  assert.equal(logged[0].cost, Math.round(ESTIMATE * 1e5) / 1e5);
  // (a log that can't be read: nothing asked, nothing written over it)
  fs.writeFileSync(files.log, '{ broken');
  const warned = [];
  assert.equal(await newsSignals('nfl', { now, env, budget: b, client: mockClient([]), teams: [team], fetchJson, files, log: { log: () => {}, warn: (m) => warned.push(m) } }), null);
  assert.equal(fs.readFileSync(files.log, 'utf8'), '{ broken');
  assert.equal(warned.length, 1);
  // (the page: the last two days' signals alone)
  const p = pageOf('nfl', { signals: [{ at: '2026-10-14T00:00:00Z', confidence: 1, kind: 'role' }, { at: '2026-10-01T00:00:00Z', confidence: 1, kind: 'role' }] }, now);
  assert.equal(p.signals.length, 1);
});

test("the dated cap schedule (CAP_WINDOWS): the owner's credit window through Oct 31, reverting itself on Nov 1", () => {
  const at = (iso) => new Date(iso);
  const caps = (iso, env = {}) => ({ research: researchBudget({ env, file: null, floor: null, now: at(iso) }).caps, news: newsBudget({ env, file: null, floor: null, now: at(iso) }).caps });
  // (before the window: the standing caps)
  assert.deepEqual(caps('2026-10-17T23:59:59Z'), { research: RESEARCH_CAPS, news: NEWS_CAPS });
  assert.equal(windowAt('news', at('2026-10-17T23:59:59Z')), null);
  // (the 18th: $100 the research's day and month; the news $1 and $10, every run)
  assert.deepEqual(caps('2026-10-18T23:59:00Z'), { research: { day: 100, month: 100 }, news: { day: 1, month: 10 } });
  assert.equal(windowAt('news', at('2026-10-18T23:59:00Z')).everyRun, true);
  // (the 19th to the 31st: the research $8 a day, $60 the month (the miss review's $2 and $40 out of its $10 and $100))
  assert.deepEqual(caps('2026-10-19T00:00:00Z'), { research: { day: 8, month: 60 }, news: { day: 1, month: 10 } });
  assert.deepEqual(caps('2026-10-31T23:59:00Z'), { research: { day: 8, month: 60 }, news: { day: 1, month: 10 } });
  assert.equal(windowAt('news', at('2026-10-31T23:59:59.999Z')).everyRun, true);
  // (Nov 1: the standing caps again, the news once a day)
  assert.deepEqual(caps('2026-11-01T00:00:00Z'), { research: { day: 4, month: 55 }, news: { day: 0.15, month: 4 } });
  assert.equal(windowAt('research', at('2026-11-01T00:00:00Z')), null);
  assert.equal(windowAt('news', at('2026-11-01T00:00:00Z')), null);
  // (a variable lowers the schedule's caps, never raises them)
  assert.deepEqual(caps('2026-10-18T12:00:00Z', { CHECK_RESEARCH_DAILY_USD: '100', CHECK_RESEARCH_MONTHLY_USD: '100' }).research, { day: 100, month: 100 });
  assert.deepEqual(caps('2026-10-20T12:00:00Z', { CHECK_RESEARCH_DAILY_USD: '100', CHECK_RESEARCH_MONTHLY_USD: '100' }).research, { day: 8, month: 60 });
  assert.deepEqual(caps('2026-11-01T00:00:00Z', { CHECK_RESEARCH_DAILY_USD: '100', CHECK_RESEARCH_MONTHLY_USD: '100' }).research, { day: 4, month: 55 });
  assert.deepEqual(caps('2026-10-20T12:00:00Z', { CHECK_RESEARCH_DAILY_USD: '3', NEWS_SIGNALS_DAILY_USD: '0.5' }), { research: { day: 3, month: 60 }, news: { day: 0.5, month: 10 } });
  // (the windows in order, none overlapping)
  for (const ws of Object.values(CAP_WINDOWS)) for (let i = 1; i < ws.length; i++) assert.ok(Date.parse(ws[i].from) >= Date.parse(ws[i - 1].to));
});

test('newsSignals in the everyRun window (through Oct 31): a team read today is read again the next run, each story still once; Nov 1 once a day again', async () => {
  const dir = tmp('signals-window');
  const files = { log: path.join(dir, 'log.json'), page: path.join(dir, 'page.json') };
  const env = { NEWS_SIGNALS: '1', ANTHROPIC_API_KEY: 'test' };
  const runAt = async (iso, articles, answers) => {
    const at = new Date(iso);
    const client = mockClient(answers);
    let fetched = 0;
    const fetchJson = async () => (fetched++, { articles });
    const budget = newsBudget({ env, file: path.join(dir, 'usage.json'), floor: null, now: at });
    const out = await newsSignals('nfl', { now: at, env, budget, client, teams: [team], fetchJson, files, log: quiet });
    return { out, fetched, asked: client.asked.length, caps: budget.caps };
  };
  const pub = (iso) => ({ published: iso });
  const a = await runAt('2026-10-31T22:00:00Z', [story('w1', pub('2026-10-31T20:00:00Z'))], [answerOf([])]);
  assert.deepEqual([a.fetched, a.asked, a.caps.day], [1, 1, 1]);
  // (an hour later, the same UTC day: the team's feed read again; the old story not asked again, the new one is)
  const b = await runAt('2026-10-31T23:00:00Z', [story('w1', pub('2026-10-31T20:00:00Z')), story('w2', pub('2026-10-31T22:30:00Z'))], [answerOf([])]);
  assert.deepEqual([b.fetched, b.asked, b.out.stories], [1, 1, 1]);
  // (Nov 1: the standing caps, a team once a day)
  const c = await runAt('2026-11-01T00:00:00Z', [story('n1', pub('2026-10-31T23:30:00Z'))], [answerOf([])]);
  assert.deepEqual([c.fetched, c.asked, c.caps.day], [1, 1, 0.15]);
  const d = await runAt('2026-11-01T01:00:00Z', [story('n2', pub('2026-11-01T00:30:00Z'))], []);
  assert.deepEqual([d.fetched, d.asked], [0, 0]);
});
