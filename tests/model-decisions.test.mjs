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
import { PROMPT_V } from '../libs/ranker/scripts/model/writeups.mjs';
import { BET_DECIDE, CLOSE_LEG_TOL, ERAS, gateVerdict, ownerException, seasonWeight, sportVerdict } from '../libs/ranker/scripts/model/gate-score.mjs';
import { CHECKS as SELF_CHECKS } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { CAL_STEP, fitCalib, fitSpot, calRows } from '../libs/ranker/scripts/model/calib.mjs';
import { CORR_PRICING, LAMBDAS, MOVE_MAX, SEG_MIN, capMove, corrRows, moveCap, oneSe } from '../libs/ranker/scripts/model/correct.mjs';
import { mainCardOf, mmaPracticePicks } from '../libs/ranker/scripts/model/mma-desk.mjs';
import { EV_SUSPECT, choose, suspectOf } from '../libs/ranker/scripts/model/desk.mjs';
import { MOVE_FOLLOWED, ROLE, farOf, lineZ, moveFollowed } from '../libs/ranker/scripts/model/props.mjs';
import { boardMarkets, boardProp, skipReason } from '../libs/ranker/scripts/model/board.mjs';
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
  for (const s of ['nfl', 'nhl', 'mlb', 'nba', 'mma']) assert.ok(PRACTICE_N[s] > 0, `${s} has a practice N`);
  // (the MMA's, O2 closed 2026-10-18: each main-card bout with an edge before the vig plays, the prelims fill the
  // card to PRACTICE_N.mma; at the practice stake, marked topN)
  const bouts = [['m1', 18], ['m2', 18], ['p1', 16], ['p2', 16], ['p3', 16]].map(([id, h]) => ({ id, key: id, card: 'c', date: `2026-10-24T${h}:00Z` }));
  assert.deepEqual([...mainCardOf(bouts, 'c')], ['m1', 'm2']);
  const row = (k, edge, priced = true) => ({ id: `${k}:ml`, boutKey: k, card: 'c', intent: 'track', p: 0.5 + edge, fair: 0.5, ...(priced ? {} : { priced: false }) });
  const picked = mmaPracticePicks([row('m1', 0.01), row('m2', -0.01), row('p1', 0.03), row('p2', 0.02), row('p3', 0.04, false)], bouts);
  assert.deepEqual([...picked.keys()].sort(), ['m1:ml', 'p1:ml', 'p2:ml']);
  assert.equal(picked.get('m1:ml').main, true);
  assert.match(src('mma-desk.mjs'), /mmaPracticePicks\(mlNew, bouts/);
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

// (the text users read: the site's Book, wallet and game view, the bettor's scripts that write the page's fields,
// and the NFL analysis prompts; each file's code with its comments cut out (a // outside quotes, a comment line,
// an HTML comment), so only strings and markup are read)
function userText() {
  const root = path.resolve(import.meta.dirname, '..');
  const dirs = ['libs/ranker/src/engine/book', 'libs/ranker/src/engine/account/wallet', 'libs/ranker/src/engine/game-view', 'libs/ranker/scripts/model', 'apps/nfl/scripts/analysis'];
  const cut = (line) => {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '\\') i++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '/' && line[i + 1] === '/' && line[i - 1] !== ':') return line.slice(0, i);
    }
    return line;
  };
  const out = [];
  for (const d of dirs)
    for (const f of fs.readdirSync(path.join(root, d))) {
      if (!/\.(ts|html|mjs)$/.test(f) || f.endsWith('.spec.ts')) continue;
      const text = fs.readFileSync(path.join(root, d, f), 'utf8');
      if (f.endsWith('.html')) {
        text.replace(/<!--[\s\S]*?-->/g, '').split('\n').forEach((line, i) => out.push({ at: d + '/' + f + ':' + (i + 1), line }));
        continue;
      }
      let block = false;
      text.split('\n').forEach((line, i) => {
        const t = line.trim();
        if (block) return void (t.includes('*/') && (block = false));
        if (t.startsWith('/*')) return void (!t.includes('*/') && (block = true));
        if (t.startsWith('//') || t.startsWith('*')) return;
        out.push({ at: d + '/' + f + ':' + (i + 1), line: cut(line) });
      });
    }
  return out;
}

test('D26 users read "the Bot" and "the Book", never "the model" or "DraftKings": the site\'s text, the bettor\'s, the Claude prompts', () => {
  const page = fs.readFileSync(path.resolve(import.meta.dirname, '../libs/ranker/src/engine/book/book-page.component.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(page, /\b[Tt]he model\b|\bModel(['’]s)? /, 'book-page: the Bot');
  const lines = userText();
  assert.ok(lines.length > 10000, 'the files read');
  // (DraftKings stays only as data: the ledger's book field and the ESPN provider it's read from)
  const named = lines.filter(({ line }) => /DraftKings/.test(line) && !/book: (b\.book \?\? |o \? )?'DraftKings'|book \?\? 'DraftKings'|book: o \? 'DraftKings'/.test(line));
  assert.deepEqual(named.map((x) => x.at), [], 'the sportsbook is the Book');
  // (both are names: "the Bot", "the Book", capitalized mid-sentence too)
  const lower = lines.filter(({ line }) => /\b[Tt]he (bot|book)\b/.test(line));
  assert.deepEqual(lower.map((x) => x.at), [], 'the Bot and the Book, capitalized');
  assert.match(src('writeups.mjs'), /Call the betting side the Bot \(the Bot projects, the Bot's chance\), never the model, and the sportsbook the Book \(the Book's price, the Book's chance\), never by its name/);
  assert.ok(PROMPT_V >= 3, 'the write-ups written again with the words');
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

test('D18 the correction is shrunk by its evidence: the penalty from 20, no term under SEG_MIN rows, its move capped, the one-SE rule toward more shrinkage (the 2026-10-18 audit)', () => {
  // (the gate held the correction against the trust pricing (2026-10-18): off, a candidate behind CORR_ON=1)
  assert.equal(CORR_PRICING, false);
  assert.equal(Math.min(...LAMBDAS), 20);
  assert.deepEqual(LAMBDAS, [...LAMBDAS].sort((a, b) => b - a), 'most shrunk first');
  assert.equal(SEG_MIN, 30);
  // (4 graded rows move a prop at most about 2.6 points off even; the model's own lean is never exceeded)
  assert.ok(moveCap(4) < 0.12 && moveCap(400) > 0.4 && moveCap(1e6) <= MOVE_MAX);
  assert.equal(capMove(1, 0.2, 1e6), 0.2);
  assert.equal(capMove(-1, 0.2, 0), -moveCap(0), 'turned, held to its cap');
  // (the one-SE rule: a more shrunk candidate within a standard error of the best is taken, one clearly worse isn't)
  const best = [0.6, 0.7, 0.5, 0.65, 0.6];
  assert.equal(oneSe([best.map((v, i) => v + (i % 2 ? 0.02 : -0.01)), best]), 0);
  assert.equal(oneSe([best.map((v) => v + 0.2), best]), 1);
});

test('D18 the correction fits the raw chance and prices from the raw chance: no double count with the calibration; the trust only sizes', () => {
  const rows = corrRows([{ id: 'a', market: 'prop', propType: 'rec', side: 'over', line: 1.5, model: 0.6, modelRaw: 0.55, fair: 0.5, status: 'won', start: '2026-10-10T00:00:00Z' }]);
  assert.equal(rows[0].m, 0.55);
  // (the raw over is the anchored chance since D33 (pA): the correction and the calibration read the one raw)
  assert.match(src('props.mjs'), /correctSides\(correction, \{[^}]*\bpOver: pA,/, 'priceProps passes the raw (anchored) over');
  assert.match(src('props.mjs'), /calSides\(calib, prop\.stat\.key, prop\.line, pA,/, 'the calibration shifts the same raw');
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

test('D23 the sanity guard: an ev past EV_SUSPECT is logged as suspect, held to the bar and the practice stake, a LIKE at most', () => {
  assert.equal(EV_SUSPECT, 0.15);
  assert.equal(suspectOf(0.14), null);
  assert.ok(suspectOf(0.39));
  assert.ok(suspectOf(-0.2));
  const c = choose({ market: 'total', sides: [{ side: 'over', line: 44.5, odds: 200, model: 0.42, fair: 0.36 }, { side: 'under', line: 44.5, odds: -250, model: 0.58, fair: 0.64 }] }, 1, 0.08);
  assert.ok(c.suspect && c.ev === EV_SUSPECT && c.units === PRACTICE_UNITS);
  assert.equal(levelOf({ intent: 'edge', suspect: { ev: 0.39 } }, 0.2, 0.7), 'medium');
  assert.match(src('props.mjs'), /SUSPECT PRICE/);
  assert.match(src('run.mjs'), /if \(x\.suspect\) Object\.assign\(bet/);
  assert.match(src('mma-desk.mjs'), /SUSPECT PRICE/);
});

test('D24 gaps are scale-aware: SDs of the count or probability points, never a ratio of the means', () => {
  // (the owner's two: 0.6 against 1.0 at 0.5, 8 catches against 14 at 10.5)
  assert.ok(Math.abs(lineZ(1.0, 0.6, 1000)) < 0.6);
  assert.ok(lineZ(14, 8, 20) > 1.7);
  assert.equal(farOf(1.0, 0.6, 1000), null);
  assert.equal(farOf(14, 8, 20), 'hi');
  assert.equal(ROLE.ratioHi, undefined);
  assert.equal(ROLE.ratioLo, undefined);
  assert.ok(Number.isFinite(ROLE.zHi) && Number.isFinite(ROLE.zLo));
  for (const f of ['props.mjs', 'check-learn.mjs', 'selfcheck.mjs']) assert.doesNotMatch(src(f), /ratioHi|ratioLo|MISSING_RATIO|RECENT_RATIO/, f);
});

test('D25 research found nothing on a small line: its corrected chance decides, else a practice pick (O1, 2026-10-18)', () => {
  assert.equal(researchDecision({ act: 'bet', side: 'over' }, guarded, 0.25, { low: true, corrected: { p: 0.5, ev: -0.045 } }).as, 'practice');
  assert.equal(researchDecision({ act: 'bet', side: 'over' }, guarded, 0.25, { low: true, corrected: { p: 0.56, ev: 0.07 } }).as, 'bet');
  // (a bigger line as D6)
  assert.equal(researchDecision({ act: 'bet', side: 'over' }, guarded, 0.5).as, 'bet');
  assert.match(src('run.mjs'), /d\?\.as === 'practice'/);
  assert.match(src('run.mjs'), /const topN = x\.researchPractice \?\?/);
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

test('D22 the owner\'s exception (O3, 2026-10-19): only the close leg worse by at most 0.0005 with results and CLV better beyond noise; the verdict stays HOLD', () => {
  assert.equal(CLOSE_LEG_TOL, 0.0005, 'the tolerance is pinned: widening it is a decision');
  const tie = { verdict: 'tie', diff: 0, lo: -0.01, hi: 0.01 };
  const better = { verdict: 'better', diff: -0.0006, lo: -0.0009, hi: -0.0004 };
  const betterClv = { verdict: 'better', diff: 0.01, lo: 0.0035, hi: 0.0162 };
  const closeWorse = (diff) => ({ verdict: 'worse', diff, lo: diff - 0.0001, hi: diff + 0.0001 });
  // (the D32 pattern: NFL's close +0.0005 and NBA's +0.0001 worse, NBA's results and CLV better, NHL's CLV better,
  // the projections tied)
  const d32 = {
    nfl: sportVerdict({ proj: { props: { decide: tie } }, bet: { props: { ll: tie, close: closeWorse(0.0005), topClv: tie } } }),
    nba: sportVerdict({ proj: { props: { decide: tie } }, bet: { props: { ll: better, close: closeWorse(0.0001), topClv: betterClv } } }),
    nhl: sportVerdict({ bet: { props: { ll: tie, close: tie, topClv: betterClv } } }),
    mlb: sportVerdict({ bet: { props: { ll: tie, close: tie, topClv: tie } } }),
  };
  const v = gateVerdict(d32);
  assert.equal(v.verdict, 'HOLD', 'the exception never turns a HOLD into a SHIP by itself');
  assert.equal(v.exception.eligible, true);
  assert.ok(v.exception.why.some((w) => w.includes('results log loss better')) && v.exception.why.some((w) => w.includes("CLV better")));
  // (each condition on its own closes it)
  const withNfl = (bet) => ({ ...d32, nfl: sportVerdict({ proj: { props: { decide: tie } }, bet: { props: bet } }) });
  assert.equal(gateVerdict(withNfl({ ll: tie, close: closeWorse(0.0006), topClv: tie })).exception.eligible, false, 'the close leg past the tolerance');
  assert.equal(gateVerdict(withNfl({ ll: closeWorse(0.0001), close: closeWorse(0.0005), topClv: tie })).exception.eligible, false, 'a results leg worse anywhere');
  assert.equal(gateVerdict(withNfl({ ll: tie, close: closeWorse(0.0005), topClv: { verdict: 'worse', diff: -0.002, lo: -0.003, hi: -0.001 } })).exception.eligible, false, 'a CLV leg worse anywhere');
  assert.equal(gateVerdict({ ...d32, nfl: sportVerdict({ proj: { props: { decide: { verdict: 'worse', diff: 0.01, lo: 0.001, hi: 0.02 } } }, bet: { props: { ll: tie, close: closeWorse(0.0005), topClv: tie } } }) }).exception.eligible, false, 'a projection layer worse');
  assert.equal(gateVerdict({ ...d32, nba: sportVerdict({ bet: { props: { ll: tie, close: closeWorse(0.0001), topClv: betterClv } } }) }).exception.eligible, false, 'results better nowhere');
  assert.equal(gateVerdict({ ...d32, nba: sportVerdict({ bet: { props: { ll: better, close: closeWorse(0.0001), topClv: tie } } }), nhl: sportVerdict({ bet: { props: { ll: tie, close: tie, topClv: tie } } }) }).exception.eligible, false, 'CLV better nowhere');
  assert.equal(ownerException({ nfl: sportVerdict({ bet: { props: { ll: better, close: tie, topClv: betterClv } } }) }).eligible, false, 'nothing worse: no exception needed (a SHIP)');
  assert.equal(gateVerdict({ nfl: sportVerdict({ bet: { props: { ll: better, close: tie, topClv: betterClv } } }) }).exception, undefined, 'a SHIP carries none');
  // (the rule written down with it)
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('CLOSE_LEG_TOL') && decisions.includes('OWNER MAY SHIP'));
});

test('D27 every bet the bot placed is a pick: a guard’s 0.5u cut one and a practice one too, past TOP too', async () => {
  const { buildPicks, TOP } = await import('../libs/ranker/scripts/model/picks.mjs');
  const now = new Date('2026-10-18T12:00:00Z');
  const row = (id, extra = {}) => ({ id, sport: 'nfl', event: '1', start: '2026-10-20T00:15:00Z', matchup: 'WSH @ SF', market: 'ml', side: 'away', line: null, odds: 150, model: 0.45, fair: 0.4, p: 0.42, ev: 0.05, intent: 'edge', units: 0.5, pick: 'WSH ML', status: 'open', profit: 0, context: {}, ...extra });
  const bets = [row('plain', { units: 1 }), row('guarded', { context: { guard: 'line moved +0.101 since it opened, against it' } }), row('practice', { topN: 1 }), row('tracked', { intent: 'track', units: 0, trackUnits: 0.5 })];
  const out = buildPicks('nfl', { bets }, {}, new Map(), now);
  assert.deepEqual(out.picks.map((p) => p.id).sort(), ['guarded', 'plain', 'practice']);
  assert.equal(out.picks.find((p) => p.id === 'practice').practice, true);
  const many = Array.from({ length: TOP + 5 }, (_, i) => row(`m${i}`));
  assert.equal(buildPicks('nfl', { bets: many }, {}, new Map(), now).picks.length, TOP + 5);
  // (the fights' picks the same: no guard filter, no TOP cut)
  assert.ok(!src('mma-desk.mjs').includes('!b.context?.guard'), 'mma-desk.mjs buildFightPicks hides guarded bets');
  assert.ok(!src('mma-desk.mjs').includes('scored.slice(0, TOP)'), 'mma-desk.mjs buildFightPicks cuts to TOP');
});

test('D28 every input with no look-ahead: an NGS week informs only later weeks, week-0 totals never; the inventory kept', async () => {
  const { NGS_PUB_HOURS, ngsTable, pubTimes } = await import('../libs/ranker/scripts/model/ngs.mjs');
  assert.equal(NGS_PUB_HOURS, 36);
  const pubOf = pubTimes([{ season: '2025', week: '5', gameday: '2025-10-06', gametime: '20:15' }]);
  const rec = (week, pid, sep, targets) => ({ kind: 'receiving', season: '2025', week: String(week), pid, pos: 'WR', targets: String(targets), receptions: '5', avg_separation: String(sep), avg_cushion: '6', avg_yac_above_expectation: '0' });
  const t = ngsTable([rec(5, 'lg', 3, 100), rec(5, 'me', 5, 10), rec(0, 'me', 9, 100)], pubOf);
  assert.equal(t.of('me', null, 2025, Date.parse('2025-10-06T20:15:00-04:00')).sep, 0);
  assert.ok(t.of('me', null, 2025, Date.parse('2025-10-09T20:15:00-04:00')).sep > 0);
  const inputs = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/INPUTS.md'), 'utf8');
  for (const sport of ['## NFL', '## NBA', '## NHL', '## MLB', '## MMA', '## The AI analyses']) assert.ok(inputs.includes(sport), sport);
});

test('D29 the priced history and the morning snapshot: archived closes graded in the gate; the snapshot its own capped budget, cut first', async () => {
  const { SNAPSHOT, RESERVE, spendable } = await import('../libs/ranker/scripts/model/oddsapi.mjs');
  const { LINES_FROM, PROPS_FROM, MORNING_HOUR, morningDue, morningRows, readHistory } = await import('../libs/ranker/scripts/model/odds-history.mjs');
  assert.equal(SNAPSHOT.dayCap, 300);
  assert.equal(MORNING_HOUR, 10);
  assert.deepEqual([LINES_FROM.slice(0, 10), PROPS_FROM.slice(0, 10)], ['2020-06-06', '2023-05-03']);
  const b = (remaining, snapshot = 0, historyLeft = 0) => ({ remaining, historyLeft, today: { snapshot, lines: 0, props: 0 }, allowance: { lines: 1000, props: 1000 } });
  assert.equal(spendable('snapshot', 10, b(20000)), true);
  assert.equal(spendable('snapshot', 10, b(20000, 295)), false, "the day's cap");
  // (cut first: with credits low the snapshot stops while history and the live features still spend)
  const low = b(RESERVE + SNAPSHOT.hold + 5, 0, 0);
  assert.equal(spendable('snapshot', 10, low), false);
  assert.equal(spendable('lines', 10, low), true);
  assert.equal(spendable('history', 10, { ...low, historyLeft: 100 }), true);
  // (due from 10 AM Eastern, once a day: its day's file written, not again)
  assert.equal(morningDue('nba', Date.parse('2026-10-20T13:30:00Z'), () => false), false, '9:30 AM Eastern');
  assert.equal(morningDue('nba', Date.parse('2026-10-20T14:05:00Z'), () => false), true);
  assert.equal(morningDue('nba', Date.parse('2026-10-20T14:05:00Z'), () => true), false);
  // (a morning's rows: kind 'm', the coming games only, both books' lines and DraftKings' props)
  const ev = { id: 'x1', commence_time: '2026-10-20T23:30:00Z', home_team: 'Boston Celtics', away_team: 'New York Knicks', bookmakers: [{ key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Boston Celtics', price: -150 }, { name: 'New York Knicks', price: 130 }] }] }] };
  const past = { ...ev, id: 'x0', commence_time: '2026-10-20T13:00:00Z' };
  const props = new Map([['x1', { bookmakers: [{ key: 'draftkings', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'Jayson Tatum', point: 27.5, price: -115 }, { name: 'Under', description: 'Jayson Tatum', point: 27.5, price: -105 }] }] }] }]]);
  const games = [{ id: '401', date: '2026-10-20T23:30Z', season: 2027, type: 2, home: '2', away: '18' }];
  const teams = [{ id: '2', name: 'Boston Celtics', nick: 'Celtics', place: 'Boston' }, { id: '18', name: 'New York Knicks', nick: 'Knicks', place: 'New York' }];
  const rows = morningRows('nba', [ev, past], props, games, teams, '2026-10-20T14:17:00Z');
  assert.deepEqual(rows.map((r) => r[0]), ['E', 'L', 'P']);
  assert.equal(rows[0][2], '401', 'matched to its ESPN game');
  assert.deepEqual(rows[1].slice(2, 9), ['m', '2026-10-20T14:17:00Z', 'dk', 'h2h', null, -150, 130]);
  assert.deepEqual(rows[2].slice(4), ['dk', 'player_points', 'Jayson Tatum', 27.5, -115, -105]);
  assert.equal(typeof readHistory, 'function');
});

test('D30 every bet at the price offered the moment it is placed: never a stored price, a snapshot or the odds history', async () => {
  const { STORED_FRESH, storedBet, storedFresh } = await import('../libs/ranker/scripts/model/checks.mjs');
  const now = new Date('2026-10-20T15:00:00Z');
  assert.equal(STORED_FRESH, 0, 'only a price quoted in the current run');
  assert.equal(storedFresh('2026-10-20T14:59:59Z', now), false);
  assert.equal(storedBet({ id: 'a', at: '2026-10-20T14:00:00Z' }, true, now), 'stale');
  assert.equal(storedBet({ id: 'a', at: '2026-10-20T14:00:00Z' }, false, now), 'stale', 'no key: no fresher');
  // (the history and the morning snapshot are for history, learning and the gate only: nothing that prices or
  // places a bet reads them)
  const dir = path.join(import.meta.dirname, '../libs/ranker/scripts/model');
  for (const f of ['run.mjs', 'desk.mjs', 'props.mjs', 'checks.mjs', 'picks.mjs', 'board.mjs', 'mma-desk.mjs', 'fights-totals.mjs', 'research.mjs', 'timing.mjs', 'anytime.mjs', 'clv.mjs', 'backtest.mjs']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/odds-history|gate-history/.test(src), `${f} must not read the odds history`);
  }
});

test("D31 no silent skip: a line move the projection followed is priced, and every skip carries its reason to the board", () => {
  // (Rachaad White, 2026-10-19: rush yards opened 20.5, 47.5 with the two backs ahead of him out on the report, his
  // projection 47.15 with them out: the move is the inputs' own, priced; a projection left at the open still skips)
  assert.equal(MOVE_FOLLOWED, 0.5);
  assert.equal(moveFollowed({ open: 20.5, line: 47.5, mu: 47.15, r: 2.5 }), true);
  assert.equal(moveFollowed({ open: 20.5, line: 47.5, mu: 22, r: 2.5 }), false);
  assert.equal(moveFollowed({ open: 47.5, line: 47.5, mu: 47.15, r: 2.5 }), false);
  // (the guard chain reads the followed move: never a skip by it alone, nor the "also" that strips a CHECK's kind)
  const props = src('props.mjs');
  assert.ok(props.includes('const movedSkip = Math.abs(moved) >= 2 * limit && !followed'));
  assert.ok(!props.includes('Math.abs(moved) >= 2 * limit ? movedWhy'));
  assert.ok(props.includes("else if (movedSkip) guard = { skip: true, kind: 'moved'"));
  // (every pass on the board says why: a prop's sr, a gapped game market's sides' sr)
  const row = (guard) => ({ prop: { athlete: { id: 1, name: 'A', team: 2 }, stat: { key: 'rushYds', label: 'Rush Yds' }, line: 47.5, prices: { over: -110, under: -114 } }, side: 'under', sides: [{ side: 'over', p: 0.46, ev: -0.1 }, { side: 'under', p: 0.54, ev: 0.01 }], guard });
  assert.equal(boardProp(row({ skip: true, kind: 'moved', why: 'line moved +27 since it opened, against it' }), 'T').sr, 'line moved +27 since it opened, against it');
  assert.ok(boardProp(row({ skip: true }), 'T').sr.length > 0);
  assert.equal(boardProp(row({ why: 'flagged only' }), 'T').sr, undefined);
  assert.ok(skipReason({ why: 'x'.repeat(500) }).length <= 200);
  const gapped = boardMarkets([{ market: 'total', sides: [{ side: 'over', line: 45.5, odds: -110, model: 0.85, fair: 0.5 }, { side: 'under', line: 45.5, odds: -110, model: 0.15, fair: 0.5 }] }], () => 1);
  assert.ok(gapped.total.every((s) => s.b === 'low' && /too far from the market/.test(s.sr)));
});

test('D32 the residual model, on since the owner\'s O3: every live path passes the ctx, the blend sits once on the trusted chance and reads the anchored raw, RESID_OFF gives the current price back; it predicts the Book\'s error and never pulls an ahead Bot toward the Book; no look-ahead; a soft blend; the guard', async () => {
  const R = await import('../libs/ranker/scripts/model/residual.mjs');
  const desk = await import('../libs/ranker/scripts/model/desk.mjs');
  // (on: the owner's override of 2026-10-19 (O3), over the gate's close-leg HOLD by D22's exception; RESID_OFF=1
  // prices one run without it, the gate's champion. Never both the correction and the residual)
  assert.equal(R.RESID_PRICING, true);
  assert.ok(!(CORR_PRICING && R.RESID_PRICING), 'the correction and the residual are never both on');
  const was = { on: process.env.RESID_ON, off: process.env.RESID_OFF };
  delete process.env.RESID_ON;
  delete process.env.RESID_OFF;
  assert.equal(R.residOn(), true);
  // (the live chance with a ctx is the hook's blend of the four-argument chance (the current price: anchor, then
  // the calibration, then the trust) with the corrected one, on the shipped NHL file; the lean the model reads is
  // the ctx's raw (the anchored chance), not the calibrated model chance, so nothing is counted twice)
  const ctx = { sport: 'nhl', market: 'prop', stat: 'shots', line: 2.5, side: 'over', f: 0.5, raw: 0.6, overOdds: -110, underOdds: -110, t: Date.now() + 36e5, at: Date.now(), home: true, hours: 1 };
  const pCur = desk.chanceAt('prop', 0.5, 0.62, 0.4);
  const p = desk.chanceAt('prop', 0.5, 0.62, 0.4, ctx);
  const h = R.hookChance(ctx, pCur);
  assert.ok(h && Number.isFinite(h.p), 'the shipped NHL file prices the row');
  assert.ok(Math.abs(p - h.p) < 1e-12, 'the live chance is the hook\'s blend of the current price');
  assert.ok(Math.abs(p - R.blendChance(pCur, h.pRes, h.weight)) < 1e-12, 'blended once, on the logit scale, at the file\'s weight');
  assert.notEqual(desk.chanceAt('prop', 0.5, 0.62, 0.4, { ...ctx, raw: 0.7 }), p, 'a different anchored raw moves the chance');
  // (a different calibrated chance with the same raw moves it only through the current price)
  const pCur2 = desk.chanceAt('prop', 0.5, 0.58, 0.4);
  assert.ok(Math.abs(desk.chanceAt('prop', 0.5, 0.58, 0.4, ctx) - R.hookChance(ctx, pCur2).p) < 1e-12);
  // (RESID_OFF: the current price back; a sport with no file: the current price)
  process.env.RESID_OFF = '1';
  assert.equal(R.residOn(), false);
  assert.equal(desk.chanceAt('prop', 0.5, 0.62, 0.4, ctx), pCur);
  delete process.env.RESID_OFF;
  assert.equal(desk.chanceAt('prop', 0.5, 0.62, 0.4, { ...ctx, sport: 'zzz' }), pCur);
  if (was.on !== undefined) process.env.RESID_ON = was.on;
  if (was.off !== undefined) process.env.RESID_OFF = was.off;
  // (every live path passes the ctx: the props with the anchored raw and only where the Book priced the prop; the
  // game lines through choose and the board; the trust fit and the backtest never (four arguments: the current
  // price the blend sits on); the weekly collector with the blend off in its process)
  assert.match(src('props.mjs'), /chanceAt\('prop', x\.fair, x\.model, t, rctx && \{ \.\.\.rctx, side: x\.side, f: x\.fair, raw: x\.raw \}\)/, 'priceProps passes the side\'s ctx with its raw');
  assert.match(src('props.mjs'), /const rctx = prop\.prices && residOn\(\) \?/, 'only a prop the Book priced');
  assert.match(src('props.mjs'), /\{ side: 'over', model: cal\.over, raw: pA,/, 'the raw is the anchored chance');
  assert.match(src('desk.mjs'), /export function choose\(market, trust, evScale, ctx = null\)/);
  assert.match(src('desk.mjs'), /chanceAt\(market\.market, s\.fair, s\.model, trust, sideCtx\(market, s, ctx\)\)/);
  assert.match(src('run.mjs'), /choose\(market, trust\[market\.market\]\?\.trust \?\? START_TRUST, EV_SCALE, rctx\)/);
  assert.match(src('board.mjs'), /chanceAt\(m\.market, s\.fair, s\.model, trustOf\(m\.market\), sideCtx\(m, s, ctx\)\)/);
  assert.match(src('desk.mjs'), /const pOf = \(b\) => Math\.min\(0\.995, Math\.max\(0\.005, chanceAt\(b\.market, b\.fair, b\.model, t\)\)\);/, 'fitTrust reads the current price, never the blend');
  assert.match(src('backtest.mjs'), /const pOf = \(b\) => chanceAt\(b\.market, b\.fair, b\.model, trust\);/);
  assert.match(src('residual-train.mjs'), /^process\.env\.RESID_OFF = '1';/m, 'the collector prices its current price with the blend off');
  // (the epoch restarted on it, D4)
  assert.ok(MODEL_EPOCH > '2026-10-19T10:00:00Z', 'MODEL_EPOCH bumped past the anchor round\'s');
  // (the blend soft: never 0 or 1 by a switch, a step of BLEND_STEP at most a refit, from the current price)
  assert.equal(R.BLEND_START, 0);
  assert.ok(R.BLEND_STEP <= 0.25);
  assert.ok(Math.abs(R.blendChance(0.52, 0.6, 0) - 0.52) < 1e-9 && Math.abs(R.blendChance(0.52, 0.6, 1) - 0.6) < 1e-9);
  // (the model predicts the Book's error off the Book's own logit: a lean term is the Bot's disagreement, the shift
  // adds to it, so a Bot that's ahead reads as a larger edge, never a pull toward the Book: the lean terms named)
  assert.ok(R.isLeanTerm('d') && R.isLeanTerm('d*stat:shots') && !R.isLeanTerm('home'));
  // (no look-ahead: a snapshot is read only from the moment it last learned)
  const model = { v: R.MODEL_V, snapshots: [{ cutoff: '2026-02', to: 200, parts: {} }, { cutoff: '2026-03', to: 300, parts: {} }] };
  assert.equal(R.snapshotFor(model, 250).cutoff, '2026-02');
  assert.equal(R.snapshotFor(model, 100), null);
  assert.ok(R.SETTLE_MS >= 6 * 36e5);
  // (the guard: a refit worse than the Book on its newest months is held at the current price, never shipped)
  const bad = Object.fromEntries(['2026-01', '2026-02', '2026-03'].map((m) => [m, { props: { n: 1000, resid: 0.7, cur: 0.69, book: 0.69 } }]));
  assert.ok(!R.guardOk(bad, null).ok);
  // (the rules written down with it)
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D32.'));
});
test('D33 the anchored projection: the pull toward the book is evidence-set, shrunk toward 0 (the bot number), never toward the book; 0 where the bot is ahead; the trust may reach 1; the desk never fits it', async () => {
  const A = await import('../libs/ranker/scripts/model/anchor.mjs');
  const { nbOver } = await import('../libs/ranker/scripts/model/project.mjs');
  const { rng } = await import('../libs/ranker/scripts/model/gate-score.mjs');
  // (a history where the bot is nearer the truth than the book: pull 0; one where the book is: positive)
  const u = rng(3);
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  const rows = (botSd, bookSd) => Array.from({ length: 8000 }, () => {
    const truth = 6 * Math.exp(0.3 * normal());
    const mu = truth * Math.exp(botSd * normal());
    const im = truth * Math.exp(bookSd * normal());
    const line = Math.floor(im) + 0.5;
    // (the result drawn from the truth's own chance over the line, a coin at it)
    const y = u() < nbOver(line, truth, 10) ? 1 : 0;
    return { stat: 'x', mu, im, line, params: { r: 10, rk: 0 }, mix: null, y, w: 1 };
  });
  const ahead = A.fitStatAnchor(rows(0, 0.15));
  assert.equal(ahead.pull, 0, 'the bot ahead: no pull toward the book');
  const behind = A.fitStatAnchor(rows(0.2, 0));
  assert.ok(behind.pull > 0 && behind.pull <= (behind.n / (behind.n + A.ANCHOR_K)) * behind.own + 1e-3, 'the book ahead: a pull, shrunk toward 0 by the rows worth');
  assert.equal(A.fitStatAnchor(rows(0.2, 0).slice(0, A.ANCHOR_MIN - 1)).pull, 0, 'too few rows: the bot number');
  assert.equal(A.PULL_GRID[A.PULL_GRID.length - 1], 1, 'no cap short of 1');
  assert.equal(A.pullOf(null, 5, 6), 0, 'no fit: the bot number');
  assert.equal(A.anchoredMean(5, 6, 0), 5);
  // (the trust can reach 1: the grid and the bucket hold nothing back)
  assert.ok(/t <= 1\.0001/.test(src('desk.mjs')), 'fitTrust grid reaches 1');
  assert.equal(bucketTrustOf({ 'prop:x': { trust: 1, lines: { high: { trust: 1 } } } }, 'prop:x', 7.5), 1);
  // (the desk reads the fit and never makes it; the pull is written by the gate; the raw stays beside it)
  assert.ok(!/fitAnchor|fitStatAnchor/.test(src('run.mjs')), 'run.mjs never fits the anchor');
  assert.ok(/readAnchor/.test(src('run.mjs')) && /anchoredChances/.test(src('props.mjs')), 'the desk reads the fit and prices the anchored chance');
  assert.ok(/anchor\.json/.test(src('gate.mjs')) && /fitAnchor/.test(src('gate-history.mjs')), 'the gate fits and writes it');
  assert.ok(/modelPure/.test(src('props.mjs')), 'the bot own chance stays on the row');
});

test('D33 the anchor prices the sports the gate passed (NFL, NBA, NHL) and not MLB, whose pull is recorded for the readout only', async () => {
  const A = await import('../libs/ranker/scripts/model/anchor.mjs');
  assert.deepEqual([...A.ANCHOR_SPORTS].sort(), ['nba', 'nfl', 'nhl']);
  assert.equal(A.anchorOn('mlb'), false);
  assert.equal(A.readAnchor(path.resolve(import.meta.dirname, '..'), 'mlb'), null, 'the desk reads no MLB anchor');
  assert.ok(/anchorOn/.test(src('gate-history.mjs')), 'the gate prices only the sports the anchor is on for');
});

test("D34 the game model's schedule terms are soft: every one from the schedule alone, in at its own ridge (never under the fit's), never gated one by one, off only as the whole set's safety fallback; the loops can't touch them", async () => {
  const { SCHEDULE_TERMS, BLOWOUT, TERMS, featurize } = await import('../libs/ranker/scripts/model/context.mjs');
  const { fitContext } = await import('../libs/ranker/scripts/model/ratings.mjs');
  const { LEAGUES } = await import('../libs/ranker/scripts/model/leagues.mjs');
  // (every schedule term is soft, on the margin or the total, and none is a gated term's twin)
  for (const [sport, list] of Object.entries(SCHEDULE_TERMS)) {
    assert.ok(list.length >= 4, `${sport} has schedule terms`);
    for (const t of list) {
      assert.equal(t.soft, true, `${sport} ${t.key} soft`);
      assert.ok(['m', 't'].includes(t.on));
      assert.ok(!TERMS[sport].some((x) => x.key === t.key), `${sport} ${t.key} is not also a gated term`);
    }
    assert.ok(BLOWOUT[sport] > 0);
  }
  // (from the schedule alone: a coming game with no facts cache at all still gets every schedule term, as a final does)
  const g = (id, date, home, away, hs, as) => ({ id, date, season: 2026, type: 2, home, away, homeAbbr: home, awayAbbr: away, neutral: false, final: hs !== null, hs, as, venue: `${home}|XX|USA` });
  const games = [g('1', '2026-01-02T00:00Z', 'A', 'B', 130, 100), g('2', '2026-01-03T00:00Z', 'B', 'A', 100, 99), g('3', '2026-01-05T00:00Z', 'A', 'B', null, null)];
  const f = featurize('nba', LEAGUES.nba, games, {}, new Map());
  const soft = f.terms.m.filter((t) => t.soft).map((t) => t.key);
  assert.ok(soft.includes('letdown') && soft.includes('density7'));
  const v = (id, key) => f.feats.get(id).m[f.terms.m.findIndex((t) => t.key === key)];
  assert.equal(v('2', 'letdown'), 1, 'A (away) won game 1 by 30: a blowout, the term reads +1 for the home side');
  assert.equal(v('3', 'density7'), 0, 'both have played the same two games in the week');
  assert.ok(Number.isFinite(v('3', 'letdown')), 'a coming game has its schedule terms');
  // (the fit: soft gates never in off while the set isn't the fallback; lambdaSoft from the fit's own lambda up by a grid
  // of multiples, never under it)
  const rs = src('ratings.mjs');
  assert.ok(rs.includes('const softGates = new Set(all.filter((t) => t.soft).map(gateOf))'));
  assert.ok(rs.includes('selectTerms(gates.filter((g) => seenGate(g) && !softGates.has(g))'), 'the soft terms are never asked one by one');
  assert.ok(rs.includes('for (const mult of [1, 4, 16, 64, 256, 1024])') && rs.includes('lambdaSoft = best.lambda * mult'), "the soft ridge is a multiple of the fit's, 1 or more");
  assert.ok(rs.includes('if ((pick.score - best.score) * n <= 1)'), 'the fallback: the whole set, only past 1 nat worse');
  assert.ok(rs.includes('t.soft && ctx.lambdaSoft ? ctx.lambdaSoft'), 'online() shrinks a soft term at lambdaSoft');
  // (a tiny fit: two soft terms, one real, neither gated off, the ridge at or over the fit's)
  let seed = 5;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const list = [];
  const feats = new Map();
  let day = Date.parse('2026-01-01T00:00Z');
  for (let i = 0; i < 600; i++) {
    const x = [rnd() < 0.5 ? 1 : -1, rnd() < 0.5 ? 1 : -1];
    const id = String(i);
    const home = String(i % 5);
    const away = String((i + 1 + Math.floor(i / 5)) % 5);
    if (home === away) continue;
    list.push({ id, date: new Date((day += 36e5 * 8)).toISOString(), season: 2026, type: 2, home, away, final: true, hs: 100 + Math.round(3 * x[0] + 10 * (rnd() - 0.5)), as: 100 });
    feats.set(id, { m: x, t: [] });
  }
  const terms = { m: [{ key: 'sReal', group: 'x', on: 'm', label: 'a', unit: 'u', soft: true }, { key: 'sNoise', group: 'x', on: 'm', label: 'b', unit: 'u', soft: true }], t: [] };
  const fit = fitContext(list, { k: 0.05, hfa: 2, revert: 0.7, kO: 0.03, sigma: 12, sigmaT: 18, avg: 100 }, feats, terms);
  assert.equal(fit.ctx.off.size, 0, 'no soft term gated off');
  assert.ok(fit.ctx.lambdaSoft >= fit.ctx.lambda);
  // (the loops: the miss review never writes a weight (D10); the calibration, the correction and check-learn read props
  // only; nothing but ratings.mjs sets a context term's size)
  for (const f of ['miss-review.mjs', 'calib.mjs', 'correct.mjs', 'check-learn.mjs', 'selfcheck.mjs', 'desk.mjs']) assert.ok(!/lambdaSoft|SCHEDULE_TERMS|fitContext/.test(src(f)), `${f} leaves the game context's terms alone`);
  assert.ok(src('DECISIONS.md').includes('### D34.'));
});

test('D35 the season-start vacancy: a regular gone since last season vacates his work net of the ones brought in; the newcomer is in the pool at the work he brings; a departure with no arrival vacates in full', async () => {
  const { nflMatchups } = await import('../libs/ranker/scripts/model/matchups.mjs');
  // (a 32-team league's 2025: each team a lead back (15 carries, 3 targets), a second back (4 and 1), a receiver,
  // a tight end and a quarterback; 2026 not yet played)
  const date = (season, d) => new Date(Date.UTC(season, 8, 1) + d * 864e5).toISOString().slice(0, 10);
  const rows = [];
  const add = (season, d, team, opp, home, pid, pos, targets, rushAtt, passAtt = 0) => rows.push({ pid, pos, date: date(season, d), season, team, opp, game: `g${season}_${d}_${team < opp ? team : opp}`, home, s: { targets, rushAtt, passAtt, snaps: 50 } });
  for (let d = 1; d <= 6; d++)
    for (let i = 0; i < 16; i++)
      for (const [team, opp, home] of [[`T${2 * i}`, `T${2 * i + 1}`, true], [`T${2 * i + 1}`, `T${2 * i}`, false]]) {
        add(2025, d, team, opp, home, `${team}rb1`, 'RB', 3, 15);
        add(2025, d, team, opp, home, `${team}rb2`, 'RB', 1, 4);
        add(2025, d, team, opp, home, `${team}wr1`, 'WR', 8, 0);
        add(2025, d, team, opp, home, `${team}te1`, 'TE', 4, 0);
        add(2025, d, team, opp, home, `${team}qb`, 'QB', 0, 2, 30);
      }
  const lg = nflMatchups(rows, null, {});
  // (T0's lead back left in the offseason)
  const missOf = (id) => (id === 'T0rb1' ? 1 : 0);
  const vac = (pid, extra) => lg.live(pid, 'T0', 'T1', 'RB', 2026, missOf, extra).vacs[0];
  // (no roster read: his work vacates to the second back alone, the week-1 overshoot at the cap, as before)
  assert.equal(vac('T0rb2'), 3);
  // (T1's second back signed: in the pool at the work he brings, the departed's work netted against it; the
  // second back's cut is real (the role player's signal) but no longer the cap, and the newcomer's is the same cut
  // (the split in proportion))
  const present = new Map([['T0rb2', 'RB'], ['T1rb2', 'RB'], ['T0wr1', 'WR'], ['T0te1', 'TE'], ['T0qb', 'QB']]);
  const pooled = vac('T0rb2', { present });
  assert.ok(pooled > 1 && pooled < 1.5, `the second back with a newcomer in the pool: ${pooled}`);
  assert.equal(vac('T1rb2', { present }), pooled, 'the newcomer takes the same cut over his own work');
  // (a lead back signed in his place: like for like, nothing vacates)
  assert.equal(vac('T0rb2', { present: new Map([['T0rb2', 'RB'], ['T1rb1', 'RB']]) }), 0);
  // (a rookie with a prop on the board counts as an arrival at the floor; a roster's back with no history and no
  // prop isn't one)
  const rookie = vac('T0rb2', { present: new Map([...present, ['T0rook', 'RB']]), board: new Set(['T0rook']) });
  assert.ok(rookie < pooled && rookie > 1, `a rookie on the board nets a little: ${rookie}`);
  assert.equal(vac('T0rb2', { present: new Map([...present, ['T0rook', 'RB']]) }), pooled, "a roster's back who won't play isn't an arrival");
  // (this season's absences are untouched: a regular hurt in-season vacates as before, newcomer or not)
  assert.ok(/x\.cur \? \(gone \+= m \* x\.v\) : \(dep \+= m \* x\.v\)/.test(src('matchups.mjs')));
  // (the history passes the game's players, the desk the roster and the board)
  assert.ok(/vacated\(g\.team, g\.season, r\.pid, r\.pos, \(id\) => \(playing\.has\(id\) \? 0 : 1\), present\)/.test(src('matchups.mjs')));
  assert.ok(/present, board: onBoard/.test(src('props.mjs')));
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D35.'));
});
