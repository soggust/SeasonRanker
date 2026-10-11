// Claude's analysis for the strong picks (libs/ranker/scripts/model/writeups.mjs), with a mock client: no
// network, no key, nothing spent. The request (the frozen cached prompt, the schema, the effort, the fallbacks),
// the grounding rejections (a draft asked once more, then rejected, the plain text kept), a refusal, a call cut
// short, the caps (the logged spend and the worst case of the calls in flight), the run's limit, 3 errors in a
// row stopping the sport, a bet's facts never asked twice (its hash), the picks patched in place, the queue's
// rules, --dry building every request and calling nothing, and --validate's picks, cap and report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aiBudget, costOf } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { aiSheetOf, checkAnswer, configOf, gateOf, MODEL, projectedCost, queueOf, requestOf, runValidate, SYSTEM, validateReport, validationPicks, worstCase, writeSport } from '../libs/ranker/scripts/model/writeups.mjs';

const SAMPLES = JSON.parse(fs.readFileSync(new URL('./support/writeup-samples.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-10T13:00:00Z');
const quiet = { log: () => {}, warn: () => {} };
const clone = (x) => JSON.parse(JSON.stringify(x));

// (one sport's data: the Kmet prop (NFL, over 8.5), n copies of it as separate picks, at a level)
function sportData({ n = 1, level = 'lock', start = null } = {}) {
  const s = SAMPLES[0];
  const sib = { ...clone(s.sib), status: 'open' };
  const bets = Array.from({ length: n }, (_, i) => ({ ...clone(s.bet), id: i ? `${s.bet.id}:${i}` : s.bet.id, ...(start ? { start } : {}) }));
  const picks = { sport: 'nfl', record: { byLevel: { lock: { wins: 1, losses: 0 }, high: { wins: 3, losses: 1 } } }, picks: bets.map((b, i) => ({ id: b.id, level, edge: true, score: 0.2 - i / 100, pick: b.pick, reason: 'Plain reason.', risk: 'Plain risk.' })) };
  return { picks, ledger: { bets: [...bets, sib] }, state: null, games: [s.game], writeups: { sport: 'nfl', items: {} } };
}

const GOOD = {
  headline: 'Kmet over 8.5 on volume the market doubts',
  reason:
    "The case is volume: Cole Kmet projects for 19.5 receiving yards, well over 8.5, and 66.7% of his weighted games cleared the line. His blended rate is 17.9 over 4 games, and GB's defense takes 6.7% off. DraftKings' no-vig price says 50.6%; the desk bets 63.9% against a 53.5% break-even.",
  risk: 'The model sits 26.5 points from the market, past the 15-point gap the desk now bets, and his recent 12 gets no weight.',
  stance: 'thin',
  numbers: [
    { text: '8.5', fact: 'bet.line' },
    { text: '19.5', fact: 'projection.mean' },
    { text: '66.7', fact: 'projection.history.sideSharePct' },
    { text: '17.9', fact: 'projection.blendedRate' },
    { text: '4', fact: 'projection.gamesThisSeason' },
    { text: '6.7', fact: 'drivers[1].appliedPct' },
    { text: '50.6', fact: 'price.bookFairPct' },
    { text: '63.9', fact: 'price.betPct' },
    { text: '53.5', fact: 'price.breakEvenPct' },
    { text: '26.5', fact: 'price.gapPts' },
    { text: '15', fact: 'price.gapLimitPts' },
    { text: '12', fact: 'projection.recent' },
  ],
  cites: ['projection.mean', 'price.gapPts', 'drivers.1.appliedPct'],
};
const BAD = { ...GOOD, reason: `${GOOD.reason} Toronto saw him catch 42 yards over seven games.` };

const USAGE = { input_tokens: 600, output_tokens: 2500, cache_read_input_tokens: 2400, cache_creation_input_tokens: 0 };
const reply = (out, { stop = 'end_turn', usage = USAGE, model = MODEL } = {}) => ({ model, stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(out) }], usage });

// (a mock of the SDK's client: each answer in turn (the last one again), every request kept, the calls in flight
// counted; an Error answer thrown)
function mockClient(answers, { delay = 0 } = {}) {
  const asked = [];
  let live = 0;
  let peak = 0;
  return {
    asked,
    get peak() {
      return peak;
    },
    beta: {
      messages: {
        async create(req) {
          asked.push(req);
          live++;
          peak = Math.max(peak, live);
          await new Promise((r) => setTimeout(r, delay));
          live--;
          const a = answers.length > 1 ? answers.shift() : answers[0];
          if (a instanceof Error) throw a;
          return a;
        },
      },
    },
  };
}
// (the Kmet sample was placed before the gap guard: today's guards (guardedNow) left out here, tested apart)
const open = () => null;
const run = (data, client, { cfg = configOf({}), budget = aiBudget({ now: NOW }), gate = null } = {}) => writeSport({ sport: 'nfl', data, client, budget, gate: gate ?? gateOf(budget, { maxPerRun: cfg.maxPerRun }), cfg, now: NOW, log: quiet, guarded: open });

test('the settings: high by default, xhigh with more room, the caps only lowered, the kill switch', () => {
  const c = configOf({});
  assert.equal(c.on, true);
  assert.equal(c.effort, 'high');
  assert.equal(c.maxTokens, 8000);
  assert.deepEqual(c.levels, ['lock', 'high']);
  assert.equal(c.maxPerRun, 12);
  assert.deepEqual(c.caps, { day: 1.5, month: 25 });
  assert.equal(configOf({ WRITEUP_EFFORT: 'xhigh' }).maxTokens, 12000);
  assert.equal(configOf({ WRITEUP_EFFORT: 'silly' }).effort, 'high');
  assert.deepEqual(configOf({ WRITEUP_DAILY_USD: '5', WRITEUP_MONTHLY_USD: '10' }).caps, { day: 1.5, month: 10 });
  assert.equal(configOf({ WRITEUPS: 'off' }).on, false);
  // (the worst case: 8,000 out and 6,000 in at the priciest model a fallback may serve, $25 and $6.25)
  assert.equal(Math.round(worstCase(8000) * 1e4) / 1e4, 0.2375);
});

test('the request: the frozen prompt cached, the schema, the effort, the fallbacks, the sheet alone', () => {
  const s = SAMPLES[0];
  const sheet = aiSheetOf(s.bet, { sib: s.sib, game: s.game, level: 'lock' });
  assert.equal(sheet.bet.band, 'LOCK');
  assert.equal(sheet.bet.id, undefined);
  assert.equal(sheet.price.decimals, undefined);
  const req = requestOf(sheet, { effort: 'xhigh', maxTokens: 12000 });
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.max_tokens, 12000);
  assert.equal(req.output_config.effort, 'xhigh');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.deepEqual(req.output_config.format.schema.required, ['headline', 'reason', 'risk', 'stance', 'numbers', 'cites']);
  assert.deepEqual(req.system, [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }]);
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(SYSTEM), 'no timestamp in the cached prompt');
  assert.equal(req.thinking, undefined);
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.match(req.messages[0].content, /^FACT SHEET\n\{/);
  assert.equal(requestOf(sheet, { fallbacks: false }).fallbacks, undefined);
  // (a retry: fresh, one turn, with what failed)
  const retry = requestOf(sheet, { problems: ['name not on the sheet: Toronto'] });
  assert.equal(retry.messages.length, 1);
  assert.match(retry.messages[0].content, /A previous draft was rejected for: name not on the sheet: Toronto\. Write it again under the same rules\.$/);
  // (--dry's projection: the first call writes the cache, the rest read it)
  const p = projectedCost(sheet, 'high');
  assert.ok(p.first > p.cached && p.cached > 0.03 && p.first < 0.12, JSON.stringify(p));
});

test('the grounding: a numeral off the sheet, an unlisted one, a city, a number word, the other side, banned words', () => {
  const s = SAMPLES[0];
  const sheet = aiSheetOf(s.bet, { sib: s.sib, game: s.game, level: 'lock' });
  assert.deepEqual(checkAnswer(GOOD, sheet).hard, []);
  const bad = checkAnswer(BAD, sheet).hard.join(' | ');
  assert.match(bad, /Toronto/);
  assert.match(bad, /numeral 42 not listed/);
  assert.match(bad, /number word: seven/);
  // (a numeral paired to the wrong fact)
  assert.match(checkAnswer({ ...GOOD, numbers: GOOD.numbers.map((n) => (n.text === '19.5' ? { ...n, fact: 'projection.blendedRate' } : n)) }, sheet).hard.join(' '), /19\.5 is not projection\.blendedRate/);
  assert.match(checkAnswer({ ...GOOD, risk: `${GOOD.risk} An empty-net goal could do it.` }, sheet).hard.join(' '), /banned/);
  assert.match(checkAnswer({ ...GOOD, headline: 'Kmet under 8.5 on volume', reason: GOOD.reason.replace('well over 8.5', 'under 8.5') }, sheet).hard.join(' '), /other side/);
  assert.match(checkAnswer({ ...GOOD, stance: 'great' }, sheet).hard.join(' '), /no stance/);
  assert.deepEqual(checkAnswer(null, sheet).hard, ['no JSON answer']);
  // (lengths and cites only logged)
  const short = checkAnswer({ ...GOOD, cites: ['nowhere.at.all'] }, sheet);
  assert.deepEqual(short.hard, []);
  assert.ok(short.soft.some((x) => /cites not on the sheet/.test(x)));
  assert.ok(short.soft.some((x) => /reason \d+ characters/.test(x)));
});

test('a good answer: written, the pick patched in place (its headline, its read), the call logged at its cost', async () => {
  const data = sportData();
  const budget = aiBudget({ now: NOW });
  const client = mockClient([reply(GOOD)]);
  const t = await run(data, client, { budget });
  assert.equal(client.asked.length, 1);
  assert.equal(t.written, 1);
  assert.equal(t.picksChanged, true);
  const p = data.picks.picks[0];
  assert.equal(p.reason, GOOD.reason);
  assert.equal(p.risk, GOOD.risk);
  assert.equal(p.headline, GOOD.headline);
  assert.equal(p.by, 'claude');
  assert.equal(p.read, 'thin');
  const e = data.writeups.items[p.id];
  assert.equal(e.ai.status, 'ok');
  assert.equal(e.ai.hash, e.plain.hash);
  assert.equal(e.ai.v, 1);
  assert.equal(e.ai.effort, 'high');
  assert.equal(e.ai.sheet.bet.band, 'LOCK');
  const [logged] = budget.list();
  assert.equal(logged.what, 'writeup');
  assert.equal(logged.status, 'ok');
  assert.equal(logged.hash, e.ai.hash);
  assert.equal(logged.cost, Math.round(costOf(USAGE) * 1e5) / 1e5);
  assert.equal(logged.stance, 'thin');
  // (priced by the model that served it: a fallback's)
  const b2 = aiBudget({ now: NOW });
  await run(sportData(), mockClient([reply(GOOD, { model: 'claude-opus-5' })]), { budget: b2 });
  assert.equal(b2.list()[0].model, 'claude-opus-5');
  assert.ok(b2.list()[0].cost > logged.cost);
});

test('a draft that fails the grounding: asked once more, fresh; failing again rejected, the plain text kept', async () => {
  const data = sportData();
  const client = mockClient([reply(BAD), reply(BAD)]);
  const t = await run(data, client);
  assert.equal(client.asked.length, 2);
  assert.match(client.asked[1].messages[0].content, /A previous draft was rejected for: .*Toronto/);
  assert.equal(client.asked[1].messages.length, 1);
  assert.equal(t.rejected, 1);
  assert.equal(t.retried, 1);
  const p = data.picks.picks[0];
  assert.equal(p.reason, 'Plain reason.');
  assert.equal(p.by, undefined);
  const ai = data.writeups.items[p.id].ai;
  assert.equal(ai.status, 'rejected');
  assert.equal(ai.attempts, 2);
  assert.ok(ai.problems.some((x) => /Toronto/.test(x)));
  assert.equal(ai.draft.reason, BAD.reason);
  // (rejected for these facts: never asked again)
  const again = mockClient([reply(GOOD)]);
  await run(data, again);
  assert.equal(again.asked.length, 0);
  // (the retry passing: written)
  const fixed = sportData();
  const c2 = mockClient([reply(BAD), reply(GOOD)]);
  const t2 = await run(fixed, c2);
  assert.equal(t2.written, 1);
  assert.equal(t2.retried, 1);
  assert.equal(fixed.picks.picks[0].by, 'claude');
});

test("a bet's facts written once: the same hash skipped, a re-price written again", async () => {
  const data = sportData();
  await run(data, mockClient([reply(GOOD)]));
  const same = mockClient([reply(GOOD)]);
  const t = await run(data, same);
  assert.equal(same.asked.length, 0);
  assert.equal(t.queue, 0);
  // (a re-price: a new stake, a new hash; written again)
  data.ledger.bets[0].units = 1.5;
  const repriced = mockClient([reply(GOOD)]);
  await run(data, repriced);
  assert.equal(repriced.asked.length, 1);
});

test('a refusal is final; a call cut short is a failed try, asked again till 3 calls', async () => {
  const data = sportData();
  const t = await run(data, mockClient([reply({}, { stop: 'refusal' })]));
  assert.equal(t.refused, 1);
  assert.equal(data.writeups.items[data.picks.picks[0].id].ai.status, 'refused');
  const again = mockClient([reply(GOOD)]);
  await run(data, again);
  assert.equal(again.asked.length, 0);

  const cut = sportData();
  for (let i = 0; i < 3; i++) await run(cut, mockClient([reply({}, { stop: 'max_tokens', usage: { input_tokens: 600, output_tokens: 8000 } })]));
  const ai = cut.writeups.items[cut.picks.picks[0].id].ai;
  assert.equal(ai.status, 'error');
  assert.equal(ai.attempts, 3);
  const fourth = mockClient([reply(GOOD)]);
  await run(cut, fourth);
  assert.equal(fourth.asked.length, 0);
});

test('the caps: the logged spend and the worst case of the calls in flight, the run limit', async () => {
  // (today's logged spend leaves less than a call's worst case: nothing called, skipped-budget, asked next run)
  const budget = aiBudget({ now: NOW });
  budget.record({ what: 'check-research', sport: 'nfl', cost: 1.4 });
  const data = sportData();
  const client = mockClient([reply(GOOD)]);
  const t = await run(data, client, { budget });
  assert.equal(client.asked.length, 0);
  assert.equal(t.skipped, 1);
  assert.equal(data.writeups.items[data.picks.picks[0].id].ai.status, 'skipped-budget');
  assert.equal(data.picks.picks[0].reason, 'Plain reason.');
  const later = mockClient([reply(GOOD)]);
  await run(data, later);
  assert.equal(later.asked.length, 1);

  // (room for two calls' worst case: never more than two in flight, the rest wait their turn, all written)
  const roomy = aiBudget({ now: NOW, caps: { day: worstCase(8000) * 2.5, month: 25 } });
  const four = sportData({ n: 4 });
  const slow = mockClient([reply(GOOD, { usage: { input_tokens: 10, output_tokens: 10 } })], { delay: 5 });
  const t4 = await run(four, slow, { budget: roomy });
  assert.equal(slow.asked.length, 4);
  assert.ok(slow.peak <= 2, `peak ${slow.peak}`);
  assert.equal(t4.written, 4);

  // (the run's limit: the rest left, unmarked, for the next run)
  const cfg = { ...configOf({}), maxPerRun: 2 };
  const three = sportData({ n: 3 });
  const lim = mockClient([reply(GOOD)]);
  const t3 = await run(three, lim, { cfg });
  assert.equal(lim.asked.length, 2);
  assert.equal(t3.skipped, 1);
  assert.equal(Object.values(three.writeups.items).filter((e) => e.ai).length, 2);
});

test('errors: a bad request rejected, 3 transient ones in a row stop the sport', async () => {
  const bad = Object.assign(new Error('output_config.format: bad'), { status: 400 });
  const data = sportData();
  const t = await run(data, mockClient([bad]));
  assert.equal(t.rejected, 1);
  assert.match(data.writeups.items[data.picks.picks[0].id].ai.problems[0], /bad request/);

  const busy = Object.assign(new Error('overloaded'), { status: 529 });
  const five = sportData({ n: 5 });
  const client = mockClient([busy]);
  const t5 = await run(five, client, { cfg: { ...configOf({}), concurrency: 1 } });
  assert.equal(client.asked.length, 3);
  assert.equal(t5.stopped, '3 errors in a row');
  assert.equal(t5.errors, 3);
});

test('the queue: lock and high only, edge and unguarded, not within 20 minutes of the start, lock first', () => {
  const data = sportData({ n: 3 });
  data.picks.picks[0].level = 'medium';
  data.picks.picks[1].level = 'high';
  data.picks.picks[2].level = 'lock';
  const q = queueOf({ sport: 'nfl', ...data, now: NOW, guarded: open });
  assert.deepEqual(
    q.map((x) => x.level),
    ['lock', 'high'],
  );
  // (the top N by score whatever the band: the owner's)
  assert.equal(queueOf({ sport: 'nfl', ...sportData({ n: 3, level: 'medium' }), now: NOW, cfg: { ...configOf({}), topN: 2 }, guarded: open }).length, 2);
  // (an action bet, a guarded game, a start 10 minutes off: none)
  const action = sportData();
  action.ledger.bets[0].intent = 'action';
  assert.equal(queueOf({ sport: 'nfl', ...action, now: NOW, guarded: open }).length, 0);
  const guarded = sportData();
  guarded.ledger.bets[0].context = { ...guarded.ledger.bets[0].context, guard: 'starters not posted' };
  assert.equal(queueOf({ sport: 'nfl', ...guarded, now: NOW, guarded: open }).length, 0);
  assert.equal(queueOf({ sport: 'nfl', ...sportData({ start: new Date(NOW.getTime() + 10 * 60e3).toISOString() }), now: NOW, guarded: open }).length, 0);
  // (--dry: every request built, nothing called)
  for (const it of q) assert.ok(requestOf(it.sheet).messages[0].content.length > 500);
});

// (the four samples as one desk's ledgers: their sports' bets placed within the month)
function validationData() {
  const by = {};
  for (const s of SAMPLES) {
    const sport = s.bet.sport;
    by[sport] ??= { ledger: { bets: [] }, state: null, games: [], picks: null };
    by[sport].ledger.bets.push(clone(s.bet));
    if (s.sib && s.sib !== s.bet && s.sib.id !== s.bet.id) by[sport].ledger.bets.push(clone(s.sib));
    if (s.game) by[sport].games.push(s.game);
  }
  return by;
}

test('--validate: the props and game lines picked across the sports, both efforts, its cap, the report', async () => {
  const data = validationData();
  const now = new Date('2026-10-11T00:00:00Z');
  const chosen = validationPicks(data, { now });
  const props = chosen.filter((c) => c.bet.market === 'prop');
  assert.ok(props.length >= 3, `props ${props.length}`);
  assert.ok(chosen.some((c) => c.bet.market !== 'prop'));
  assert.ok(new Set(props.map((c) => c.sport)).size >= 2, 'across the sports');
  assert.ok(chosen.length <= 12);

  const budget = aiBudget({ now, caps: { day: 1e9, month: 25 } });
  const client = mockClient([reply(GOOD)]);
  const v = await runValidate({ data, client, budget, now, log: quiet });
  // (each bet at high, then at xhigh with more room: retries where the mock's answer doesn't fit its sheet)
  assert.ok(client.asked.some((r) => r.output_config.effort === 'high' && r.max_tokens === 8000));
  assert.ok(client.asked.some((r) => r.output_config.effort === 'xhigh' && r.max_tokens === 12000));
  assert.equal(v.results.length, chosen.length);
  for (const r of v.results) assert.ok(r.by.high && r.by.xhigh);
  assert.ok(budget.list().every((e) => e.what === 'writeup-validate'));
  assert.match(v.report, /^# Claude write-ups: the measured validation run/);
  assert.match(v.report, /\| Effort \| Bets \| Calls \|/);
  assert.match(v.report, /\| high \| \d+ \| \d+ \|/);
  assert.match(v.report, /\| xhigh \| \d+ \| \d+ \|/);
  assert.match(v.report, /Cache read from the 2nd call: yes/);
  assert.match(v.report, /## 1\. NFL prop: Cole Kmet Over 8\.5 Rec Yds/);
  assert.match(v.report, /\| \| high \| xhigh \|/);
  assert.match(v.report, /\| Reason \| The case is volume/);
  assert.match(v.report, /\| Devil's Advocate \|/);

  // (the cap: one call's worst case and no more fits, the rest skipped and said so)
  const tight = await runValidate({ data, client: mockClient([reply(GOOD)]), budget: aiBudget({ now, caps: { day: 1e9, month: 25 } }), now, cap: 0.3, log: quiet });
  const calls = tight.results.flatMap((r) => Object.values(r.by)).flatMap((x) => x.calls);
  assert.ok(calls.length >= 1 && tight.spent <= 0.3, `${calls.length} calls, $${tight.spent}`);
  assert.ok(tight.stopped);
  assert.match(tight.report, /stopped:/);
});

test("validate's report: both efforts side by side, pipes and line breaks kept out of the table", () => {
  const usage = { input_tokens: 1000, output_tokens: 3000, cache_read_input_tokens: 2400, cache_creation_input_tokens: 0 };
  const md = validateReport(
    [
      {
        sport: 'nhl',
        kind: 'line',
        pick: 'MIN +1.5',
        id: '1:spread',
        level: 'high',
        by: {
          high: { status: 'ok', out: { headline: 'A | B', reason: 'line one\nline two', risk: 'r', stance: 'fair' }, problems: [], soft: [], calls: [{ usage, cost: 0.07 }] },
          xhigh: { status: 'rejected', out: null, problems: ['numeral 42 not listed'], soft: [], calls: [{ usage, cost: 0.12 }, { usage, cost: 0.12 }] },
        },
      },
    ],
    { at: NOW, spent: 0.31 },
  );
  assert.match(md, /\| Headline \| A \\\| B \| - \|/);
  assert.match(md, /\| Reason \| line one line two \| - \|/);
  assert.match(md, /\| Status \| ok \| rejected: numeral 42 not listed \|/);
  assert.match(md, /\| Cost \| \$0\.0700 \| \$0\.2400 \|/);
  assert.match(md, /\| Tokens \(in \/ cache write \/ cache read \/ out\) \| 1,000 \/ 0 \/ 2,400 \/ 3,000 \| 2,000 \/ 0 \/ 4,800 \/ 6,000 \|/);
  assert.match(md, /\| xhigh \| 1 \| 2 \| 0 \| 1 \|/);
  assert.match(md, /\$0\.31 spent of the \$4 cap/);
});
