// The owner's decisions for the bettor, pinned (libs/ranker/scripts/model/DECISIONS.md). Each test's name starts with
// its decision's id: a failure here means a change undid one of the owner's rules. Read DECISIONS.md, and take the
// conflict to the owner rather than editing the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUCKET_START,
  PRACTICE_N,
  PRACTICE_SPLIT,
  PRACTICE_UNITS,
  bucketTrustOf,
  decimal,
  gatedPlacement,
  lineGate,
  practiceGates,
  practiceRecord,
  practiceTop,
  propGate,
  record,
  slateQuota,
  stakeKelly,
  trustedUnits,
} from '../libs/ranker/scripts/model/desk.mjs';
import { BOOK, MODEL_EPOCH } from '../libs/ranker/scripts/model/leagues.mjs';
import { CLV_V } from '../libs/ranker/scripts/model/clv.mjs';
import { BET_DECIDE, ERAS, gateVerdict, seasonWeight, sportVerdict } from '../libs/ranker/scripts/model/gate-score.mjs';
import { CHECKS as SELF_CHECKS } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { CAL_STEP, fitCalib, fitSpot, calRows } from '../libs/ranker/scripts/model/calib.mjs';
import { corrRows } from '../libs/ranker/scripts/model/correct.mjs';
import { RESEARCH_LEVEL_N, hollow, researchDecision, researchGateOf, researchLevelOf, verdictOf } from '../libs/ranker/scripts/model/research.mjs';
import { CAP_WINDOWS, MISS_CAPS, NEWS_CAPS, RESEARCH_CAPS, DAY_CAP, MONTH_CAP, capsFrom, scheduledCaps } from '../libs/ranker/scripts/model/ai-budget.mjs';
import { MAX_RATE, preResolve } from '../libs/ranker/scripts/model/check-patterns.mjs';
import { recommendationsOf } from '../libs/ranker/scripts/model/miss-review.mjs';
import { freshInactives } from '../libs/ranker/scripts/model/context.mjs';
import { ROLE_BET_N, roleGateOf } from '../libs/ranker/scripts/model/props.mjs';
import { BANDS, levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { botPickAt } from '../libs/ranker/scripts/accounts/settle-lib.mjs';
import { liveRunAllowed } from '../libs/ranker/scripts/model/run.mjs';

const MODEL = path.resolve(import.meta.dirname, '../libs/ranker/scripts/model');
const src = (f) => fs.readFileSync(path.join(MODEL, f), 'utf8');
const after = (h) => new Date(Date.parse(MODEL_EPOCH) + h * 36e5).toISOString();
const before = (h) => new Date(Date.parse(MODEL_EPOCH) - h * 36e5).toISOString();
// (n graded line bets since the epoch, every one losing to the close)
const losingLines = (n, at = after) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${i}`, sport: 'nhl', market: 'spread', status: i % 2 ? 'won' : 'lost', placedAt: at(1 + i / 100), start: at(2 + i / 100), clv: { v: CLV_V, prob: -0.02, ev: -0.06, beat: false } }));

test('D1 gates shrink, never stop: a failing CLV gate bets an edge at the practice stake, never 0 units or tracked', () => {
  const gate = lineGate(losingLines(60), 'nhl');
  assert.equal(gate.on, false);
  const placed = gatedPlacement(true, 2.5, gate);
  assert.equal(placed.intent, 'edge');
  assert.equal(placed.units, PRACTICE_UNITS);
  assert.ok(placed.units > 0);
  assert.match(placed.practice, /practice stake/);
  // (no edge: tracked as it would be anyway, not for the gate's sake)
  assert.equal(gatedPlacement(false, 2.5, gate).intent, 'track');
  // (the research gate turned into a cap, never an off switch)
  const research = researchGateOf(Array.from({ length: 45 }, (_, i) => ({ researchBet: {}, status: 'lost', profit: -1, clv: { ev: -0.1 }, id: `r${i}` })));
  assert.equal(research.bet.on, false);
  const capped = practiceGates(research);
  assert.equal(capped.bet.on, true);
  assert.equal(capped.bet.practice, true);
  // (the props' gate the same way)
  const props = propGate(losingLines(60).map((b) => ({ ...b, market: 'prop', propType: 'sog' })), 'nhl');
  assert.equal(gatedPlacement(true, 3, props.sog).units, PRACTICE_UNITS);
});

test('D2 every slate is played: a sport whose record loses still places its top N by edge before the vig', () => {
  for (const s of ['nfl', 'nhl', 'mlb', 'nba']) assert.ok(PRACTICE_N[s] > 0, `${s} has a practice N`);
  // (none clears the vig; each has an edge before it: the best N play, whatever the sport's record)
  const cands = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, ev: -0.03, edge: 0.05 - i * 0.004 }));
  assert.equal(practiceTop(cands, 4).size, 4);
  assert.equal(practiceTop.length <= 3, true, 'practiceTop reads no record: candidates, a quota and what is placed');
  // (every game at least one, a late game never starved)
  assert.equal(slateQuota(15, 40), 1);
  assert.equal(slateQuota(6, 2), 3);
  // (the run's practice picks never wait on the correction's fit: DECISIONS.md D2's 2026-10-18 fix)
  assert.doesNotMatch(src('run.mjs'), /if \(!r\.correction\?\.fit \|\| !PRACTICE_N\[sport\]\) return forced/);
});

test('D3 PRACTICE_SPLIT: a practice pick is out of the record and the CLV gates, on its own Practice line', () => {
  assert.equal(PRACTICE_SPLIT, true);
  const bets = [
    { id: 'a', sport: 'nhl', market: 'prop', propType: 'sog', status: 'won', units: 1, profit: 0.9, placedAt: after(1), clv: { v: CLV_V, prob: 0.01, ev: 0 } },
    { id: 'b', sport: 'nhl', market: 'prop', propType: 'sog', status: 'lost', units: 0.5, profit: -0.5, topN: { rank: 1 }, intent: 'edge', placedAt: after(1), clv: { v: CLV_V, prob: -0.5, ev: -0.5 } },
  ];
  assert.equal(record(bets).bets, 1);
  assert.equal(practiceRecord(bets).bets, 1);
  assert.equal(practiceRecord(bets).profit, -0.5);
  assert.equal(propGate(bets, 'nhl').sog.n, 1, 'the gate reads the bet that cleared the vig alone');
  assert.equal(levelOf({ intent: 'edge', topN: { rank: 1 }, p: 0.9 }, 0.2, 0.9), 'medium', 'a LIKE at most');
});

test('D4 the epoch: the gates count only the bets since MODEL_EPOCH, so a change restarts them', () => {
  assert.ok(Number.isFinite(Date.parse(MODEL_EPOCH)));
  const old = lineGate(losingLines(60, before), 'nhl');
  assert.equal(old.n, 0);
  assert.equal(old.on, true);
  assert.equal(lineGate(losingLines(60), 'nhl').n, 60);
});

const guarded = { side: 'over', fair: 0.5, model: 0.75, odds: -110, push: 0, guarded: true, shadow: false, hard: null };

test("D5 a research reason goes into the price: one the inputs carry is priced, never passed for the gap", () => {
  const held = { act: 'adjust', note: { held: true, inputs: [], input: 'Hurts out (on the report already)' } };
  const d = researchDecision(held, guarded, 0.5);
  assert.equal(d.as, 'bet');
  assert.ok(d.p > guarded.fair && d.p < guarded.model, 'priced at the trust, its lean held inside the GAP');
  // (no edge at that price: passed with its reason, a price's verdict, not the gap's)
  const flat = researchDecision(held, { ...guarded, model: 0.51 }, 0.5);
  assert.equal(flat.as, 'pass');
  assert.match(flat.why, /no edge/);
});

test("D6 research found nothing: the model's side is bet, at low confidence too", () => {
  assert.equal(verdictOf({ explains: false, confidence: 'low', status: 'none', sources: ['https://x'], summary: 'No injury, role or lineup news found' }), 'bet');
  assert.equal(researchDecision({ act: 'bet', side: 'over' }, guarded, 0.5).as, 'bet');
  // (a low answer naming a reason it can't size stays a CHECK)
  assert.equal(verdictOf({ explains: true, confidence: 'low', category: 'role', sources: ['https://x'], summary: 'maybe a role change' }), 'check');
});

test('D7 a failed search is no finding: hollow, no verdict, asked again', () => {
  const failed = { explains: false, confidence: 'medium', status: 'none', sources: ['https://x'], summary: 'I hit the search limit before finding anything.' };
  assert.equal(hollow(failed), true);
  assert.equal(verdictOf(failed), 'check');
  assert.equal(hollow({ explains: false, status: 'unknown', sources: [], summary: '' }), true);
  // (the research asks a hollow one again ahead of new CHECKs)
  assert.match(src('research.mjs'), /hollow\(c\.research\)/);
});

test('D8 soft, self-tuning: the calibration steps a capped amount a UTC day, toward 0 too, never at once (B12)', () => {
  const EPOCH = '2026-10-01T00:00:00Z';
  // (old rows hot, new ones cold: it loses its gate, and steps toward 0 rather than jumping)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = (n, p, hit, from) => Array.from({ length: n }, (_, i) => ({ id: `x${from + i}`, market: 'prop', propType: 'pts', side: 'over', line: 0.5, model: p, status: rnd() < hit ? 'won' : 'lost', placedAt: new Date(Date.parse(EPOCH) + (from + i) * 36e5).toISOString(), start: new Date(Date.parse(EPOCH) + (from + i) * 36e5).toISOString() }));
  const turned = [...mk(840, 0.5, 0.3, 0), ...mk(360, 0.5, 0.7, 840)];
  const f = fitSpot(calRows(turned, EPOCH), -0.2);
  assert.equal(f.passed, false);
  assert.ok(Math.abs(f.shift - (-0.2 + CAL_STEP)) < 1e-9);
  // (a kept spot: the second run of the same UTC day doesn't step again)
  const hot = mk(1500, 0.5, 0.36, 2000);
  const c1 = fitCalib(hot, EPOCH, null, [], new Date('2026-11-02T01:00:00Z'));
  const c2 = fitCalib(hot, EPOCH, c1, [], new Date('2026-11-02T22:00:00Z'));
  const c3 = fitCalib(hot, EPOCH, c2, [], new Date('2026-11-03T01:00:00Z'));
  assert.equal(c2.pool['0.5'].shift, c1.pool['0.5'].shift);
  assert.ok(Math.abs(c3.pool['0.5'].shift - c1.pool['0.5'].shift - -CAL_STEP) < 1e-9);
});

test('D9 the dated AI caps revert by themselves on 2026-11-01, and the variables can only lower them', () => {
  const at = (iso) => new Date(iso);
  assert.deepEqual(scheduledCaps('research', at('2026-10-31T23:59:00Z'), RESEARCH_CAPS), { day: 8, month: 60 });
  assert.deepEqual(scheduledCaps('research', at('2026-11-01T00:00:00Z'), RESEARCH_CAPS), { day: 4, month: 55 });
  assert.deepEqual(scheduledCaps('news', at('2026-11-01T00:00:00Z'), NEWS_CAPS), { day: 0.15, month: 4 });
  assert.deepEqual(scheduledCaps('miss', at('2026-11-01T00:00:00Z'), MISS_CAPS), { day: 1, month: 25 });
  for (const list of Object.values(CAP_WINDOWS)) for (const w of list) assert.ok(Date.parse(w.to) <= Date.parse('2026-11-01T00:00:00Z'), 'no window past Oct 31');
  assert.deepEqual(capsFrom({ CHECK_RESEARCH_DAILY_USD: '100', CHECK_RESEARCH_MONTHLY_USD: '2' }, 'CHECK_RESEARCH', { day: 4, month: 55 }), { day: 4, month: 2 });
  assert.equal(DAY_CAP, 1.5);
  assert.equal(MONTH_CAP, 25);
  assert.match(src('writeups.mjs'), /env\.WRITEUP_LEVELS \|\| 'lock,high'/, 'write-ups for LOVE and LOCK alone');
});

test('D10 the miss review recommends, never moves a weight', () => {
  const recs = recommendationsOf([
    { sport: 'nfl', stat: 'Receptions', cause: 'role', n: 4, of: 10, share: 0.4, terms: {} },
    { sport: 'nfl', stat: 'Receptions', cause: 'variance', n: 9, of: 10, share: 0.9, terms: {} },
  ]);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].cause, 'role');
  assert.doesNotMatch(src('miss-review.mjs'), /state\.json|saveState|params\s*\[/, 'it writes its own log and page alone');
});

test('D11 the CHECK patterns keep research measuring: a rule resolves at most MAX_RATE of a pattern, none without a rate', () => {
  assert.ok(MAX_RATE < 1);
  const c = { id: 'x', cause: 'role', roleReason: 'line', diagnosis: { cause: 'role', sub: 'line' } };
  assert.equal(preResolve(c, new Map()), null);
  assert.equal(preResolve(c, new Map([['role:line|unseen', { top: 'bet', rate: 0 }]])), null);
});

test('D13 GitHub is the only bettor: a run that is not --dry is refused off GitHub', () => {
  assert.equal(liveRunAllowed({ dry: false, env: {} }), false);
  assert.equal(liveRunAllowed({ dry: true, env: {} }), true);
  assert.equal(liveRunAllowed({ dry: false, env: { GITHUB_ACTIONS: 'true' } }), true);
  assert.equal(liveRunAllowed({ dry: false, env: { MODEL_DESK_LOCAL: '1' } }), true);
});

test('D14 You vs the Bot: a parlay or a bet with no bot row is never paired', () => {
  assert.equal(botPickAt({ kind: 'parlay', market: 'spread' }, {}), null);
  assert.equal(botPickAt({ market: 'spread', placedAt: '2026-10-18T00:00:00Z' }, {}), null);
});

test('D15 the slot machine is gone for good', () => {
  const dir = path.resolve(import.meta.dirname, '../libs/ranker/src/engine/book');
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.doesNotMatch(text, /slot[- ]?machine|\breel\b|spinning/i, `${f}: no slot machine`);
  }
});

test("D16 a stale inactive list is ignored: only the names new since the team's last game count", () => {
  const prev = { inactive: [{ id: '1' }, { id: '2' }] };
  assert.deepEqual(freshInactives({ inactive: [{ id: '1' }, { id: '2' }] }, prev).inactive, []);
  assert.deepEqual(freshInactives({ inactive: [{ id: '1' }, { id: '3' }] }, prev).inactive, [{ id: '3' }]);
  assert.deepEqual(freshInactives({ inactive: [{ id: '9' }] }, null).inactive, [], 'no last game read: nothing from the list');
});

test('D17 small counts never read big: a low line trusts no more than its bucket, the Kelly held to -110s scale', () => {
  assert.equal(BUCKET_START.low, 0.25);
  const trust = { 'prop:rec': { trust: 0.5, lines: { low: { trust: 0.3 } } } };
  assert.equal(bucketTrustOf(trust, 'prop:rec', 1.5), 0.3);
  assert.equal(bucketTrustOf({ 'prop:rec': { trust: 0.2, lines: { low: { trust: 0.3 } } } }, 'prop:rec', 1.5), 0.2, 'held to the stat');
  // (a 3.75-point lean at -260: the stake's Kelly, not the raw one)
  const p = 1 / decimal(-260) + 0.0375;
  const raw = (p * decimal(-260) - 1) / (decimal(-260) - 1);
  assert.ok(stakeKelly(-260, p) < raw);
});

test('D18 the correction fits the raw chance and prices from the raw chance: no double count with the calibration; the trust only sizes', () => {
  const rows = corrRows([{ id: 'a', market: 'prop', propType: 'rec', side: 'over', line: 1.5, model: 0.6, modelRaw: 0.55, fair: 0.5, status: 'won', start: '2026-10-10T00:00:00Z' }]);
  assert.equal(rows[0].m, 0.55);
  assert.match(src('props.mjs'), /correctSides\(correction, \{[^}]*\bpOver,/, 'priceProps passes the raw over');
  assert.equal(trustedUnits(3, 0), 0.5, 'no trust: the minimum, never 0');
  assert.equal(trustedUnits(3, 0.5), 3);
});

test('D19 research earns its level at 40 graded over break-even with CLV 0 or better, practice before, never off', () => {
  const won = (n, i0 = 0) => Array.from({ length: n }, (_, i) => ({ id: `w${i0 + i}`, researchBet: {}, status: i % 3 ? 'won' : 'lost', odds: -110, clv: { prob: 0.01 } }));
  assert.equal(researchLevelOf(won(RESEARCH_LEVEL_N - 1)).earned, false);
  assert.equal(researchLevelOf(won(RESEARCH_LEVEL_N)).earned, true);
  assert.equal(levelOf({ intent: 'edge', researchBet: { earned: true }, p: 0.6 }, 0.06, 0.6), 'lock', 'earned: LOVE and LOCK possible');
  assert.equal(levelOf({ intent: 'edge', researchBet: {}, p: 0.6 }, 0.06, 0.6), 'medium', 'not earned: a LIKE');
});

test('D20 role bets: never under 40 graded CHECKs of a cause', () => {
  assert.equal(ROLE_BET_N, 40);
  const t = { decided: 39, won: 30, lost: 9, hitRate: 0.77, breakEven: 0.52, perUnit: 0.4 };
  assert.equal(roleGateOf({ byRole: { 'snap-jump': t } })['snap-jump'].on, false);
  assert.equal(roleGateOf({ byRole: { 'snap-jump': { ...t, decided: 40 } } })['snap-jump'].on, true);
});

test('D21 bands and the book: DraftKings alone; LIKE any edge, LOVE 2%, LOCK 5% at 55%', () => {
  assert.equal(BOOK, 'draftkings');
  assert.deepEqual(BANDS, { lock: 0.05, lockChance: 0.55, high: 0.02, medium: 0 });
});

test('D22 every change faces the gate: a layer worse beyond noise holds it, the old seasons only flag, the eras split, C23 hunts leaks', () => {
  assert.deepEqual(BET_DECIDE, ['ll', 'close', 'topClv']);
  assert.deepEqual([ERAS.nfl.start, ERAS.mlb.start], [2024, 2023]);
  assert.equal(seasonWeight('nfl', 2023, 2026).decides, false, 'before the 2024 kickoff: sanity only');
  assert.equal(seasonWeight('nfl', 2024, 2026).decides, true);
  const worse = { verdict: 'worse', diff: 0.01, lo: 0.001, hi: 0.02 };
  const tie = { verdict: 'tie', diff: 0, lo: -0.01, hi: 0.01 };
  assert.equal(gateVerdict({ nfl: sportVerdict({ proj: { games: { decide: worse, sanity: tie } } }) }).verdict, 'HOLD');
  assert.equal(gateVerdict({ nfl: sportVerdict({ proj: { games: { decide: tie, sanity: worse } } }) }).verdict, 'SHIP', 'older seasons flag, never decide');
  assert.equal(gateVerdict({ nfl: sportVerdict({ bet: { props: { ll: tie, close: tie, topClv: { ...worse, verdict: 'worse' } } } }) }).verdict, 'HOLD');
  assert.ok(SELF_CHECKS.some((f) => f.name === 'c23'), 'the weekly leak hunt');
  assert.ok(fs.existsSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/gate.mjs')));
});
