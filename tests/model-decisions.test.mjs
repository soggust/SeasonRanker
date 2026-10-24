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
import { EDGE_SUSPECT, EV_SUSPECT, Z_SUSPECT, choose, isSuspect, suspectOf } from '../libs/ranker/scripts/model/desk.mjs';
import { BAR_MIN, BAR_Z, barGate, barOf, bothGates, lineBar as lineBarOf, segmentOf } from '../libs/ranker/scripts/model/desk.mjs';
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
  // (the edge before the vig is the Bot's own chance (model) over the Book's no-vig, D36: at a history trust of 0 the
  // trusted chance p is the Book's)
  const row = (k, edge, priced = true) => ({ id: `${k}:ml`, boutKey: k, card: 'c', intent: 'track', model: 0.5 + edge, p: 0.5, fair: 0.5, ...(priced ? {} : { priced: false }) });
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
  // (DraftKings stays only as data: the ledger's book field and the ESPN provider it's read from; and, D74, the books'
  // names map the price's hover reads ("Best price: FanDuel", the one place a book is named) and a bet's book from it)
  const named = lines.filter(({ line }) => /DraftKings/.test(line) && !/book: (b\.book \?\? |o \? )?'DraftKings'|book \?\? 'DraftKings'|book: o \? 'DraftKings'|^\s*dk: 'DraftKings',|BOOK_NAMES = \{ dk: 'DraftKings',|book: bookName\([^)]*\) \?\? 'DraftKings'/.test(line));
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

test('D23 the sanity guard: an edge past 12 points or 0.3 SDs of the outcome over the break-even is suspect, its ev held to the bar, the practice stake, a LIKE at most', async () => {
  assert.equal(EDGE_SUSPECT, 0.12);
  assert.equal(Z_SUSPECT, 0.3);
  assert.equal(EV_SUSPECT, 0.15);
  // (scale-aware, D24: Josh Hokit +205 at 37.86%, 5.1 points and 0.11 SDs over 32.8% to break even, ev +15.5%: not
  // suspect; Amanda Nunes +164 at 40.21%: not; McCaffrey's broken row, about 20 points at -110: suspect)
  const evAt = (p, odds) => p * (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds) - 1;
  assert.equal(suspectOf(evAt(0.3786, 205), '', 0.3786), null);
  assert.equal(isSuspect(0.4021, evAt(0.4021, 164)), false);
  assert.ok(suspectOf(evAt(0.724, -110), '', 0.724), 'a 20-point edge is suspect');
  assert.ok(isSuspect(0.66, evAt(0.66, -110)), '13.6 points at -110');
  assert.equal(isSuspect(0.62, evAt(0.62, -110)), false, '9.6 points at -110');
  assert.ok(isSuspect(0.18, evAt(0.18, 1000)), '8.9 points at +1000: past 0.3 SDs of the outcome there');
  assert.equal(isSuspect(0.12, evAt(0.12, 1000)), false, '2.9 points at +1000');
  assert.ok(isSuspect(0.3, evAt(0.3, -110)), 'either way: 22 points under');
  assert.equal(suspectOf(0.39), null, 'no chance, no read');
  // (the desk's own lines: the old bar's case, 42% at +200 (ev +0.26, 8.7 points, 0.18 SDs), is a bet at its own stake now)
  const c = choose({ market: 'total', sides: [{ side: 'over', line: 44.5, odds: 200, model: 0.42, fair: 0.36 }, { side: 'under', line: 44.5, odds: -250, model: 0.58, fair: 0.64 }] }, 1, 0.08);
  assert.ok(!c.suspect && c.side === 'over' && c.units > PRACTICE_UNITS && c.ev > EV_SUSPECT, JSON.stringify({ p: c.p, ev: c.ev, units: c.units }));
  // (the held return: a suspect row's ev at the bar at most, either way)
  const { heldEv } = await import('../libs/ranker/scripts/model/desk.mjs');
  assert.equal(heldEv(0.39), EV_SUSPECT);
  assert.equal(heldEv(-0.2), -EV_SUSPECT);
  assert.equal(heldEv(0.1), 0.1);
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
  // places a bet reads them. Since D42 (2026-10-19) suggest.mjs reads the morning snapshot for the board's
  // suggestions alone, and a row priced from it is never bet, tracked or a CHECK's stored price:
  // tests/model-lineup-risk.test.mjs pins run.mjs's hold)
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
  // (the props only (the owner's O4): a game line's ctx is declined by the hook, so the lines price as before the
  // model, the trust's chance alone, on the shipped NHL file too; choose and the board pass the ctx and get it back)
  assert.deepEqual(R.RESID_KINDS, { props: true, lines: false });
  for (const [market, side, line] of [['spread', 'home', -1.5], ['spread', 'away', 1.5], ['total', 'over', 6.5], ['total', 'under', 6.5], ['ml', 'home', null], ['ml', 'away', null]]) {
    const lctx = { ...ctx, market, stat: market, line, side };
    assert.equal(R.hookChance(lctx, 0.52), null, `${market} ${side}: the hook declines a game line`);
    assert.equal(desk.chanceAt(market, 0.5, 0.56, 0.3, lctx), desk.chanceAt(market, 0.5, 0.56, 0.3), `${market} ${side}: the trust's chance alone`);
  }
  const game = { market: 'spread', sides: [{ side: 'home', line: -1.5, odds: -110, model: 0.56, fair: 0.5 }, { side: 'away', line: 1.5, odds: -110, model: 0.44, fair: 0.5 }] };
  assert.equal(desk.choose(game, 0.3, 0.08, { sport: 'nhl', t: Date.now() + 36e5, at: Date.now(), hours: 1 }).p, desk.choose(game, 0.3, 0.08).p, 'choose with the game ctx prices as without it');
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
  // (a total's named terms' shift rides in as a named-only ctx (D44), which chanceAt reads before the hook: still the
  // current price, never the blend; tests/model-totals.test.mjs pins the chance)
  assert.match(src('desk.mjs'), /const pOf = \(b\) => Math\.min\(0\.995, Math\.max\(0\.005, chanceAt\(b\.market, b\.fair, b\.model, t, Number\.isFinite\(b\.named\) \? \{ named: b\.named \} : null\)\)\);/, 'fitTrust reads the current price, never the blend');
  assert.match(src('desk.mjs'), /if \(!ctx \|\| Object\.keys\(ctx\)\.every\(\(k\) => k === 'named'\)\) return p;/, 'a named-only ctx never reaches the blend');
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

test('D46 a suggestion never shows a band the Bot could not give the row: the desk caps on board.json (cap, cr), the same rule as levelOf; the bands themselves unchanged', async () => {
  const { BANDS, capBand, capOf, edgeLevel, levelOf } = await import('../libs/ranker/scripts/model/picks.mjs');
  const { bandOf, boardMarkets, boardProp, sideCap } = await import('../libs/ranker/scripts/model/board.mjs');
  const { boardSidesOf, boardTotalOf } = await import('../libs/ranker/scripts/model/mma-desk.mjs');
  // (the owner, 2026-10-19: "a LOVE at 2.0 is fine": the bands stay where D21 put them)
  assert.deepEqual(BANDS, { lock: 0.05, lockChance: 0.55, high: 0.02, medium: 0 });
  // (capOf is levelOf's cap: for every edge bet with an edge, levelOf is the Kelly's band held to capOf)
  const marks = [{}, { practice: 'gate' }, { suspect: { ev: 0.2 } }, { topN: { rank: 1 } }, { researchBet: { earned: false } }, { researchBet: { earned: true } }, { researchBet: { earned: true }, practice: 'gate' }, { researchAdjusted: { earned: false } }, { researchAdjusted: { earned: true } }, { context: { roleBet: { key: 'r' } } }];
  for (const m of marks) for (const [k, p] of [[0.01, 0.5], [0.03, 0.52], [0.08, 0.6]]) {
    const b = { intent: 'edge', ev: 0.05, p, ...m };
    assert.equal(levelOf(b, k, p), capBand(edgeLevel(k, p), capOf(b)), JSON.stringify({ m, k }));
  }
  assert.equal(capBand('lock', 'medium'), 'medium');
  assert.equal(capBand('low', 'medium'), 'low');
  assert.equal(capBand('check', 'medium'), 'check');
  assert.deepEqual(sideCap({}), {});
  // (a suspect price a LIKE at most on the board, D23)
  assert.equal(bandOf(0.2, 0.75, 0.36), 'medium');
  assert.equal(bandOf(0.0755, 0.3786, 0.1547), edgeLevel(0.0755, 0.3786), 'a 5-point edge at +205 keeps its Kelly band');
  // (the lines' CLV gate at practice: every side capped LIKE, its why on it; the gate passing, none)
  const ml = [{ market: 'ml', sides: [{ side: 'home', odds: -110, model: 0.545, fair: 0.5 }, { side: 'away', odds: -110, model: 0.455, fair: 0.5 }] }];
  const free = boardMarkets(ml, () => 1, null, null, { gate: { on: true } }).ml[0];
  assert.equal(free.b, 'high');
  assert.equal(free.cap, undefined);
  const gated = boardMarkets(ml, () => 1, null, null, { gate: { on: false, why: 'CLV under 0 since the epoch' } }).ml;
  assert.equal(gated[0].b, 'medium');
  assert.equal(gated[0].cap, 'medium');
  assert.ok(gated[0].cr.includes('CLV'));
  // (a price the desk wouldn't bet at all (ESPN's line): a PASS saying why, D31)
  const off = boardMarkets(ml, () => 0.5, null, null, { off: "ESPN's line" }).ml;
  assert.ok(off.every((s) => s.b === 'low' && s.sr === "ESPN's line" && !s.cap));
  // (a prop's stat gate at practice: both sides capped)
  const x = { prop: { athlete: { name: 'A', id: 1, team: 2 }, stat: { key: 'pts', label: 'Pts' }, line: 20.5, prices: { over: -110, under: -110 } }, sides: [{ side: 'over', p: 0.58, ev: 0.107 }, { side: 'under', p: 0.42, ev: -0.2 }], side: 'over' };
  assert.equal(boardProp(x, 'now').b[0], 'lock');
  const px = boardProp(x, 'now', { gate: { on: false, why: 'at the practice stake' } });
  assert.deepEqual(px.cap, ['medium', 'medium']);
  assert.equal(px.b[0], 'medium');
  // (MMA: ESPN BET's line a PASS (the desk only tracks it); a lean under the league's edge a LIKE at most; the round
  // totals under TOTAL_LIVE a LIKE at most)
  const lines = { odds: { home: -120, away: 100 }, fair: 0.5217 };
  const espn = boardSidesOf(lines, 0.5992, 0.5, 'espn bet', { edge: 0.03 });
  assert.ok(espn.every((s) => s.b === 'low' && s.sr));
  const dk = boardSidesOf(lines, 0.5992, 0.5, null, { edge: 0.03 });
  assert.equal(dk[0].b, 'high');
  const small = boardSidesOf({ odds: { home: 150, away: -170 }, fair: 0.38 }, 0.405, 1, null, { edge: 0.03 });
  assert.equal(small[0].cap, 'medium');
  assert.notEqual(small[0].b, 'high');
  const tot = boardTotalOf({ line: 2.5, odds: { over: -110, under: -110 }, fair: 0.5 }, 0.56, 1, { live: false, edge: 0.03 });
  assert.equal(tot[0].cap, 'medium');
  assert.equal(tot[0].b, 'medium');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D46.'));
});

test('D50 the NBA season start: an unread allocation at its running mean, not 1; the work missing 1 till the team has played; no role till five are ranked', async () => {
  const { trOpenOf, trNormBuf, trNormOf, OPEN_TR, OPEN_VAC } = await import('../libs/ranker/scripts/model/project.mjs');
  const { nbaMatchups } = await import('../libs/ranker/scripts/model/matchups.mjs');
  assert.ok(OPEN_TR && OPEN_VAC);
  const opener = { opener: true };
  const params = { tr: 0.25, tf: 2, trOpen: 1.031 };
  // (the replay: the read factors' running mean before the day; none read yet, 1, never the fit's own (no look-ahead))
  const nb = trNormBuf();
  for (let d = 1; d <= 3; d++) for (let i = 0; i < 10; i++) trNormOf(nb, `2025-11-0${d}`, Math.log(1.03), 3000);
  assert.ok(Math.abs(trOpenOf(params, nb, false, opener) - 1.03) < 1e-9);
  assert.equal(trOpenOf(params, undefined, false, opener), 1);
  // (live: the history's latest, as fitStat writes it; a stat not marked, a mean-preserving one, or tr off: 1)
  assert.equal(trOpenOf(params, null, true, opener), 1.031);
  assert.equal(trOpenOf(params, nb, false, {}), 1);
  assert.equal(trOpenOf({ ...params, trn: 3000 }, nb, false, opener), 1);
  assert.equal(trOpenOf({ ...params, tr: 0 }, nb, false, opener), 1);
  // (the NBA's stats carry the mark, the live price reads it, the work missing's rule keys on the team's season)
  assert.ok(/const NBA_TEAM = \{ \.\.\.TEAM, teamWhole: true, opener: true \};/.test(src('props.mjs')));
  assert.ok(/trOpenOf\(f\.params, null, true, f\.stat\)/.test(src('props.mjs')));
  assert.ok(/const teamNew = OPEN_VAC && stat\.opener && stat\.team && rosters\.get\(String\(row\.team\)\)\?\.season !== row\.season;/.test(src('project.mjs')));
  assert.ok(/params\.trOpen = /.test(src('project.mjs')));
  // (roles: a team's second and third games read none, not every player B; from five ranked on, the top five S)
  const rows = [];
  for (let d = 1; d <= 5; d++)
    for (const [team, opp, home] of [['A', 'B', true], ['B', 'A', false]])
      for (let k = 0; k < 8; k++) rows.push({ pid: `${team}${k}`, pos: 'G', date: `2025-10-${String(20 + d).padStart(2, '0')}`, season: 2026, team, opp, game: `g${d}`, home, s: { min: 40 - 4 * k, pts: 20 - 2 * k, reb: 4, ast: 3, fg3: 1 } });
  nbaMatchups(rows, {});
  const roleAt = (d, pid) => rows.find((r) => r.game === `g${d}` && r.pid === pid).role;
  for (const d of [1, 2, 3]) assert.equal(roleAt(d, 'A0'), null, `game ${d}: no role yet`);
  assert.equal(roleAt(4, 'A0'), 'S');
  assert.equal(roleAt(4, 'A7'), 'B');
  // (the board's assists and rebounds alone, never ESPN's "Total Assists and Rebounds" combination)
  const { STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const nbaStat = (name) => STATS.nba.find((st) => st.match.test(name))?.key ?? null;
  assert.equal(nbaStat('Total Assists'), 'ast');
  assert.equal(nbaStat('Total Rebounds'), 'reb');
  assert.equal(nbaStat('Total Assists and Rebounds'), null);
  assert.equal(nbaStat('Total Points, Rebounds, and Assists'), 'pra');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D50.'));
});

test("D51 the game lines' history bar: a segment (market and side class) earns full stakes only net positive past one SE over 40 picks' worth on the history pooled with the live bets; else the practice stake, never 0 or tracked; the live bets can lift it; the desk never writes the file", () => {
  assert.equal(BAR_Z, 1);
  assert.equal(BAR_MIN, 40);
  // (the segment: the market and the side the Book's chance favors or not; a total's side)
  assert.equal(segmentOf('ml', 'away', 0.3), 'ml:dog:late');
  assert.equal(segmentOf('spread', 'home', 0.56), 'spread:fav:late');
  assert.equal(segmentOf('total', 'over', 0.5), 'total:over:late');
  // (a losing history: practice; a winning one inside the noise: practice; past it: on)
  const stats = (n, m, sd = 1) => ({ n, sum: n * m, sum2: n * (sd * sd + m * m) });
  assert.equal(barOf(stats(500, -0.05)).on, false);
  assert.equal(barOf(stats(100, 0.05)).on, false);
  assert.equal(barOf(stats(400, 0.1)).on, true);
  assert.equal(barOf(stats(BAR_MIN - 1, 0.5)).on, false);
  // (the live bets since the epoch lift a losing segment when they win; pre-epoch and tracked rows never count)
  const prior = { segments: { 'ml:dog:late': stats(100, -0.05) } };
  const live = (n, placedAt, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, sport: 'nhl', market: 'ml', side: 'away', fair: 0.4, odds: 150, status: 'won', placedAt, ...extra }));
  const after = new Date(Date.parse(MODEL_EPOCH) + 36e5).toISOString();
  const before = new Date(Date.parse(MODEL_EPOCH) - 36e5).toISOString();
  assert.equal(lineBarOf(prior, [], 'nhl')['ml:dog:late'].on, false);
  assert.equal(lineBarOf(prior, live(120, after), 'nhl')['ml:dog:late'].on, true);
  assert.equal(lineBarOf(prior, live(120, before), 'nhl')['ml:dog:late'].on, false);
  assert.equal(lineBarOf(prior, live(120, after, { intent: 'track', units: 0 }), 'nhl')['ml:dog:late'].on, false);
  // (the placement under it: an edge still bet at the practice stake, a LIKE at most; no edge tracked as ever)
  const g = bothGates(lineGate([], 'nhl'), barGate(lineBarOf(prior, [], 'nhl'), 'ml', 'away', 0.4));
  assert.equal(g.on, false);
  const placed = gatedPlacement(true, 3, g);
  assert.equal(placed.intent, 'edge');
  assert.equal(placed.units, PRACTICE_UNITS);
  assert.match(placed.practice, /practice stake/);
  assert.equal(gatedPlacement(false, 3, g).intent, 'track');
  // (the desk reads the file the record writes, never writes it; every line pick goes through the segment's gate)
  assert.match(src('gate.mjs'), /line-bar\.json/);
  assert.doesNotMatch(src('run.mjs'), /write[A-Za-z]*\([^\n]*line-bar/);
  assert.match(src('run.mjs'), /bothGates\(r\.lineGate, segment\)/);
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D51.'));
});

test('D52 the confidence layer: LIKE from any edge, LOVE and LOCK earned on the record (none on 2026-10-19), the Kelly bands as floors, the cap on the bet and the board, the stake blended by a held-out weight, the file the gate\'s', async () => {
  const { BANDS, capBand, capOf, edgeLevel, levelOf } = await import('../libs/ranker/scripts/model/picks.mjs');
  const C = await import('../libs/ranker/scripts/model/confidence.mjs');
  const { PRACTICE_UNITS, stakeFor, decimal } = await import('../libs/ranker/scripts/model/desk.mjs');
  // (the owner's Kelly bands stay as the floors)
  assert.deepEqual(BANDS, { lock: 0.05, lockChance: 0.55, high: 0.02, medium: 0 });
  // (no tier earned: a LIKE at most, whatever the Kelly; a tier earned opens only at its bar; never a LOVE under 2%)
  assert.equal(C.capOf(0.3, { love: null, lock: null }), 'medium');
  assert.equal(levelOf({ intent: 'edge', ev: 0.05, p: 0.6, conf: { cap: 'medium', q: 0.3 } }, 0.08, 0.6), 'medium');
  assert.equal(levelOf({ intent: 'edge', ev: 0.05, p: 0.6, conf: { cap: 'high', q: 0.3 } }, 0.08, 0.6), 'high');
  assert.equal(levelOf({ intent: 'edge', ev: 0.05, p: 0.6, conf: { cap: null, q: 0.3 } }, 0.01, 0.6), 'medium', 'the floor');
  // (capOf is levelOf's cap, the lower of a rule's and the layer's)
  for (const conf of [null, { cap: 'medium' }, { cap: 'high' }, { cap: null }]) for (const m of [{}, { practice: 'gate' }, { topN: { rank: 1 } }]) for (const [k, p] of [[0.01, 0.5], [0.03, 0.52], [0.08, 0.6]]) {
    const b = { intent: 'edge', ev: 0.05, p, ...(conf ? { conf } : {}), ...m };
    assert.equal(levelOf(b, k, p), capBand(edgeLevel(k, p), capOf(b)));
  }
  // (a tier is earned only on held-out evidence beyond noise: a flat record earns none; the stake on the calibrated
  // chance, the practice stake where it clears no edge; the blend's weight 0 to start, a step a record)
  assert.equal(C.BLEND_START, 0);
  assert.equal(C.BLEND_STEP, 0.25);
  assert.ok(C.TIER_MIN >= 200);
  assert.equal(C.unitsOf({ pc: 0.5 }, -110, 0.08), PRACTICE_UNITS);
  assert.equal(C.unitsOf({ pc: 0.6 }, -110, 0.08), stakeFor(0.6 * decimal(-110) - 1, 0.08, -110));
  // (the committed files: no tier earned on 2026-10-19 in any sport, the blend's weight never over a step from 0 at
  // the first record, every snapshot's newest moment at or before its cutoff)
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb']) {
    const f = path.resolve(`apps/${sport}/src/StaticData/model/confidence.json`);
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(m.v, C.CONF_V);
    assert.ok(m.blend.weight >= 0 && m.blend.weight <= 1);
    if (m.tiers.love !== null) assert.ok(m.tiers.evidence.some((e) => e.tier === 'love' && e.earned && e.bar === m.tiers.love), `${sport}: a tier earned only by its evidence`);
    for (const s of m.snapshots) assert.ok(s.to <= Date.parse(`${s.cutoff}-01T00:00:00Z`) + 1, `${sport}: a snapshot learned from nothing after its cutoff`);
  }
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D52.'));
  assert.ok(decisions.includes('| The confidence layer ('));
});

test('D53 an open bet placed under a band or stake rule changed since is taken back and priced again at a fresh quote (Josh Hokit +205, held by the old ev bar)', async () => {
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  const M = await import('../libs/ranker/scripts/model/mma-desk.mjs');
  const { BANDS } = await import('../libs/ranker/scripts/model/picks.mjs');
  const now = new Date('2026-10-19T20:00:00Z');
  const V = D.rulesOf(BANDS);
  assert.equal(M.RULES_V, `${V} trust${M.MMA_TRUST_RULES}`);
  assert.match(V, new RegExp(`^cap${D.CAP_RULES} suspect ${D.EDGE_SUSPECT}/${D.Z_SUSPECT}/${D.EV_SUSPECT} bands `));
  // (Hokit as placed: a suspect by the return alone, no edge in points: the old rule; a bet with no suspect from
  // before the rules were kept reads as today's; a stamped bet compares its own)
  const hokit = { id: 'h', boutKey: 'k1', market: 'ml', status: 'open', intent: 'edge', start: '2026-11-15T05:30:00Z', side: 'away', odds: 205, units: 0.5, p: 0.3786, ev: 0.1547, placedAt: '2026-10-19T19:29:11Z', pick: 'Josh Hokit', suspect: { ev: 0.1547, why: 'ev +0.155 past the 0.15 bar' }, practice: 'suspect: ...' };
  assert.equal(D.rulesAt(hokit), 'cap1');
  assert.equal(D.rulesChanged(hokit, V), 'cap1');
  assert.equal(D.rulesChanged({ ...hokit, suspect: undefined }, V), null);
  assert.equal(D.rulesChanged({ ...hokit, suspect: { ev: 0.4, edge: 0.2, z: 0.4 } }, V), null);
  assert.equal(D.rulesChanged({ ...hokit, rules: V }, V), null);
  assert.equal(D.rulesChanged({ ...hokit, rules: 'cap1' }, V), 'cap1');
  // (taken back only on a bout not locked, open, not priced again MAX_REPRICES times; by market and bout)
  // (k6: placed under today's band rules but MMA's trust before D56's refit: priced again, the owner's call, 2026-10-20)
  const back = M.rulesBack([hokit, { ...hokit, boutKey: 'k2', start: '2026-10-19T20:10:00Z' }, { ...hokit, boutKey: 'k3', repriced: { n: D.MAX_REPRICES } }, { ...hokit, boutKey: 'k4', status: 'won' }, { ...hokit, boutKey: 'k5', rules: M.RULES_V }, { ...hokit, boutKey: 'k6', rules: V }], now);
  assert.deepEqual([...back.ml.keys()], ['k1', 'k6']);
  assert.equal(back.total.size, 0);
  // (the new bet keeps the withdrawn one honestly: its price, band, stake, the rules it was placed under, the reason)
  const re = M.withdrawnOf(hokit, now.toISOString());
  assert.equal(re.n, 1);
  assert.ok(re.why[0].startsWith(`rule changed (placed under cap1, now cap${D.CAP_RULES}`), re.why[0]);
  assert.deepEqual([re.from.odds, re.from.units, re.from.band, re.from.rules], [205, 0.5, 'medium', 'cap1']);
  // (every new bet is stamped; the withdrawal only at a fresh Odds API price (D30); run.mjs takes one back like news)
  const mma = fs.readFileSync(path.resolve('libs/ranker/scripts/model/mma-desk.mjs'), 'utf8');
  assert.match(mma, /back\.ml\.get\(bout\.key\) === open && apiPrice/);
  assert.equal((mma.match(/rules: RULES_V,/g) ?? []).length, 2);
  const run = fs.readFileSync(path.resolve('libs/ranker/scripts/model/run.mjs'), 'utf8');
  assert.match(run, /rules: RULES_V,/);
  assert.match(run, /rulesChanged\(b, RULES_V\)/);
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D53.'));
});

test('D54 the news log and the price log are logging only: the run\'s last step, nothing it reads changed, no source asked, nothing written on --dry', async () => {
  const N = await import('../libs/ranker/scripts/model/newslog.mjs');
  const os = await import('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'd54-'));
  const game = { id: '401', date: '2026-10-25T17:00:00Z', home: '25', away: '9', homeAbbr: 'SF', awayAbbr: 'GB' };
  const r = {
    sport: 'nfl',
    now: new Date('2026-10-23T21:00:00Z'),
    upcoming: [{ game, lines: { source: 'the odds api', spread: { home: { line: -3 } }, fair: { spread: 0.51 }, fairSource: { spread: 'pinnacle' } } }],
    live: new Map([[game.id, { injuries: new Map([['25', [{ id: '111', name: 'Christian Kirk', status: 'Questionable', date: '2026-10-23T20:00:00Z' }]]]), news: [{ team: '25', unit: 'offense', kind: 'coach', headline: 'New OC', at: '2026-10-23T18:00:00Z', id: 'n1', from: 'espn' }] }]]),
    inputs: new Map([[game.id, { parts: { 'qb:h': 'Brock Purdy', 'qb:a': 'Jordan Love' }, names: {} }]]),
    sleeper: { at: '2026-10-23T20:00:00Z', rows: [{ sid: '9', espn: '111', name: 'Christian Kirk', key: 'christiankirk', team: 'SF', status: 'out', raw: 'Out', news: Date.parse('2026-10-23T19:00:00Z') }] },
    claims: [{ post: 'at://did:plc:a/app.bsky.feed.post/1', player: 'Christian Kirk', team: 'SF', status: 'out', confidence: 0.9, at: '2026-10-23T19:30:00Z' }],
    fastApplied: [],
    lineRows: [{ game: '401', key: 'spread', line: -3, a: -110, b: -110, src: 'o' }],
  };
  const before = structuredClone(r);
  // (the bets' inputs untouched: the run reads the same after both logs as before them, written or dry)
  const news = N.logNews(r, { root });
  const prices = N.logPrices('nfl', N.priceRows(r.lineRows, r.upcoming), { now: r.now, games: new Map(), root });
  assert.ok(news.n >= 5 && prices.n === 2);
  assert.deepEqual(r, before);
  const dryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd54-dry-'));
  assert.ok(N.logNews(r, { root: dryRoot, dry: true }).n >= 5);
  N.logPrices('nfl', N.priceRows(r.lineRows, r.upcoming), { now: r.now, dry: true, root: dryRoot });
  assert.deepEqual(fs.readdirSync(dryRoot), []);
  assert.deepEqual(r, before);
  // (no source asked: newslog.mjs fetches nothing)
  const src = fs.readFileSync(path.resolve('libs/ranker/scripts/model/newslog.mjs'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(|(?<![.\w])get\(|from '\.\/(sources|oddsapi)\.mjs'/);
  // (run.mjs: the run's last step, after the bets are placed, the picks and board written and the state saved; a
  // failure warned of, never the run's)
  const run = fs.readFileSync(path.resolve('libs/ranker/scripts/model/run.mjs'), 'utf8');
  assert.match(run, /await timed\(r, saveState\);\s*\/\/[^\n]*\n\s*await timed\(r, logTheNews\);\s*console\.log\(`\$\{sport\}: the run's steps/);
  assert.match(run, /function logTheNews\(r\) \{\s*try \{/);
  // (only run.mjs and mma-desk.mjs import it, and MMA's after its picks and board are built)
  const dir = path.resolve('libs/ranker/scripts/model');
  const importers = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && fs.readFileSync(path.join(dir, f), 'utf8').includes("from './newslog.mjs'"));
  assert.deepEqual(importers.sort(), ['mma-desk.mjs', 'run.mjs']);
  const mma = fs.readFileSync(path.join(dir, 'mma-desk.mjs'), 'utf8');
  assert.ok(mma.indexOf('const pl = logPrices(') > mma.indexOf('const mmaBoard = buildMmaBoard(') && mma.indexOf('const pl = logPrices(') > mma.indexOf('const picks = buildFightPicks('));
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D54.'));
});

test('D55 the $30 plan never exceeded, paced to about 95%; the lines bought on a change; the props asked when posted, by value; the watcher rate-limited', async () => {
  const odds = await import('../libs/ranker/scripts/model/oddsapi.mjs');
  const { TIMING } = await import('../libs/ranker/scripts/model/leagues.mjs');
  const { propAsk, REFRESH_H } = await import('../libs/ranker/scripts/model/timing.mjs');
  const watch = await import('../scripts/desk-watch.mjs');
  assert.equal(odds.MONTHLY, 20000);
  assert.equal(odds.RESERVE, 1000);
  assert.equal(odds.TARGET, 0.95);
  // (the 5M plan's balance never lifts the month past MONTHLY: the tally binds)
  const start = Date.parse('2026-10-19T04:06:35Z');
  const u = { cycleStart: new Date(start).toISOString(), remaining: 2_670_000, used: 2_330_000, calls: [], features: {} };
  odds.recordOn(u, 'props', 11, 2_670_000, 2_330_000, new Date(start + 864e5).toISOString());
  u.cycle.spent.props = odds.MONTHLY - odds.RESERVE - 5;
  // (D61's window record cleared: the whole tally binds, as it does on spending after BIG_UNTIL)
  delete u.big;
  const b = odds.budgetOf(u, start + 29 * 864e5);
  assert.ok(b.remaining <= odds.MONTHLY - (odds.MONTHLY - odds.RESERVE - 5));
  for (const f of ['lines', 'props', 'snapshot']) assert.equal(odds.spendable(f, 11, b, 'first'), false, f);
  assert.ok(odds.projectedMonth(b, start + 29 * 864e5) < 25000, 'the projection reads the tally, not the plan');
  // (the lines: a line bet only at a paid quote (D30, D51); the quote bought where ESPN's line moved or it's stale)
  assert.equal(odds.linesWant({ at: new Date(start).toISOString(), espn: { spread: -3, total: 44, ml: 0.6, sp: 0.5, ou: 0.5 }, phase: 'window' }, { spread: -3, total: 44, ml: 0.6, sp: 0.5, ou: 0.5 }, 'window', start + 30 * 6e4), null);
  // (the props' window opens when the Book posts them, a day or more; the lines' stays 26)
  assert.deepEqual([TIMING.nfl.props, TIMING.nba.props, TIMING.nhl.props, TIMING.mlb.props], [96, 48, 30, 48]);
  for (const s of ['nfl', 'nba', 'nhl', 'mlb']) assert.equal(TIMING[s].lines, 26);
  // (by value: first, owed, news, late, near, refresh; a priced board (NBA, NHL, MLB) asks none of news, late or refresh)
  const H = 36e5;
  assert.equal(propAsk({ times: 0, max: 6, until: 90 * H }), 'first');
  assert.equal(propAsk({ times: 1, max: 6, until: 50 * H, outsChanged: true }), 'news');
  assert.equal(propAsk({ times: 1, max: 6, until: 50 * H, outsChanged: true, boardPriced: true }), null);
  assert.equal(propAsk({ times: 1, max: 6, until: 2.8 * H, last: true, held: 3 }), 'late');
  assert.equal(propAsk({ times: 2, max: 6, until: 2.8 * H, last: true, held: 3, lateAsked: true }), null);
  assert.equal(propAsk({ times: 1, max: 6, until: 40 * H, sinceAsk: REFRESH_H * H, refresh: true }), 'refresh');
  assert.equal(propAsk({ times: 1, max: 6, until: 40 * H, sinceAsk: REFRESH_H * H, refresh: false }), null);
  assert.equal(propAsk({ times: 6, max: 6, until: 40 * H, outsChanged: true }), null);
  assert.ok(odds.TIERS.first > odds.TIERS.news && odds.TIERS.late > odds.TIERS.refresh);
  // (the watcher: never while a run is queued or running, the cooldown, the day's cap)
  const now = Date.now();
  const pending = [{ key: 'k', why: 'w' }];
  assert.equal(watch.dispatchDecision({ pending, runs: [{ status: 'in_progress', createdAt: new Date(now - 3 * H).toISOString() }], now }).go, false);
  assert.equal(watch.dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: new Date(now - 5 * 6e4).toISOString() }], now }).go, false);
  assert.equal(watch.dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: new Date(now - H).toISOString() }], now }).go, true);
  const src = fs.readFileSync(path.resolve('scripts/desk-watch.mjs'), 'utf8');
  assert.ok(!/ODDS_API_KEY|the-odds-api|run\.mjs/.test(src.replace(/^\/\/.*$/gm, '')), 'the watcher spends no credit and never runs the bettor');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D55.'));
});

test('D56 a price is its competitor\'s: a snapshot that listed the sides the other way round is put back on the names, the archive\'s mirrored snapshots repaired where the prices decide it and dropped where they don\'t', async () => {
  const OH = await import('../libs/ranker/scripts/model/odds-history.mjs');
  // (by the names, the build's and the reader's: the snapshot's home is the event's away)
  const canon = { h: 'Valentina Shevchenko', a: 'Jennifer Maia' };
  const flipped = { h: 'Jennifer Maia', a: 'Valentina Shevchenko' };
  assert.deepEqual(OH.framed(flipped, canon, 'h2h', [null, 800, -1429]), [null, -1429, 800]);
  assert.deepEqual(OH.framed(flipped, canon, 'spreads', [2.5, -110, -110]), [-2.5, -110, -110]);
  assert.deepEqual(OH.framed(flipped, canon, 'totals', [2.5, -150, 120]), [2.5, -150, 120]);
  assert.deepEqual(OH.framed(canon, canon, 'h2h', [null, -1429, 800]), [null, -1429, 800]);
  assert.equal(OH.framed({ h: 'Someone Else', a: 'Jennifer Maia' }, canon, 'h2h', [null, 100, -120]), null, 'never guessed onto a side');
  // (the API's same event either way round is one event, its frame the last sighting's)
  const ev = OH.eventsSeen('mma', [
    { ts: '2020-08-22T13:55:00Z', events: [{ id: 'x', c: '2020-11-22T05:00:00Z', ...flipped }] },
    { ts: '2020-11-11T13:55:00Z', events: [{ id: 'x', c: '2020-11-22T05:00:00Z', ...canon }] },
  ]);
  assert.equal(ev.size, 1);
  assert.deepEqual([ev.get('x').h, ev.get('x').a], [canon.h, canon.a]);
  // (the archive, without its names: each snapshot read against the next later one, the share flipped and the moves'
  // scale the sport's own)
  const prior = { scale: 0.15, flip: 0.15 };
  const L = (oid, kind, ts, a, b, book = 'dk', market = 'h2h') => ({ oid, kind, ts, book, market, line: market === 'totals' ? 2.5 : null, a, b });
  const lines = [
    // (Shevchenko: +700 at the open where she closed -2000: the mirror, put back)
    L('s', 'o', '2020-08-22T13:55:00Z', 700, -1250), L('s', 'c', '2020-11-22T04:59:00Z', -2000, 1100), L('s', 'c', '2020-11-22T04:59:00Z', -1800, 1000, 'pin'),
    // (a lopsided bout that stayed lopsided: kept)
    L('k', 'o', '2021-01-01T13:55:00Z', -300, 240), L('k', 'c', '2021-01-09T04:59:00Z', -350, 280),
    // (near even, the other side favored at the close: either reading is a plausible move; dropped, never guessed)
    L('e', 'o', '2021-02-01T13:55:00Z', 105, -125), L('e', 'c', '2021-02-09T04:59:00Z', -120, 100),
    L('e', 'o', '2021-02-01T13:55:00Z', -150, 120, 'dk', 'totals'),
  ];
  const { lines: out, report } = OH.repairFrames(lines, prior);
  const at = (oid, kind, market = 'h2h', book = 'dk') => out.find((l) => l.oid === oid && l.kind === kind && l.book === book && l.market === market);
  assert.deepEqual([at('s', 'o').a, at('s', 'o').b], [-1250, 700]);
  assert.deepEqual([at('s', 'c').a, at('k', 'o').a, at('k', 'c').a], [-2000, -300, -350]);
  assert.equal(at('e', 'o'), undefined, 'the unresolved open is dropped');
  assert.ok(at('e', 'c') && at('e', 'o', 'totals'), 'its close kept (the frame), its total kept (no side)');
  assert.deepEqual([report.mirrored, report.dropped], [1, 1]);
  assert.equal(OH.FRAME_ODDS, 99);
  // (a team sport's frame is its venue's: only its neutral sites are read)
  assert.equal(OH.neutralOids('mma', new Map(), []), null);
  const tEv = new Map([
    ['n', { oid: 'n', id: '7', t: '2023-10-08T13:30:00Z' }],
    ['h', { oid: 'h', id: '8', t: '2023-10-08T17:00:00Z' }],
    ['b', { oid: 'b', id: null, t: '2020-08-04T01:00:00Z' }],
  ]);
  assert.deepEqual([...OH.neutralOids('nfl', tEv, [{ id: '7', neutral: true }, { id: '8', neutral: false }])], ['n']);
  assert.deepEqual([...OH.neutralOids('nba', tEv, [])], ['b']);
  // (the repair ran once, its record committed)
  const frames = JSON.parse(fs.readFileSync(path.resolve('apps/mma/scripts/model/odds-history/frames.json'), 'utf8'));
  assert.equal(frames.rule, 'DECISIONS.md D56');
  // (the gate's MMA close: the last price within 12 hours of the bout)
  const GM = await import('../libs/ranker/scripts/model/gate-mma.mjs');
  assert.equal(GM.MMA_CLOSE_MAX, 12 * 36e5);
  assert.ok(fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8').includes('### D56.'));
});

test('D56 the replay bets MMA only inside the live desk\'s window: an open first seen more than four weeks out waits for its close', async () => {
  const R = await import('../libs/ranker/scripts/model/replay-record.mjs');
  const V = { desk: await import('../libs/ranker/scripts/model/desk.mjs'), picks: await import('../libs/ranker/scripts/model/picks.mjs'), leagues: await import('../libs/ranker/scripts/model/leagues.mjs') };
  assert.equal(V.leagues.TIMING.mma.lines, 672);
  const H = 36e5;
  const t = Date.parse('2025-03-01T03:00:00Z');
  const row = (i, kind, lead) => ({ id: `h:${i}:ml:${kind}`, key: `h:${i}:ml`, event: String(i), sport: 'mma', market: 'ml', stat: 'ml', kind, line: null, t: t + i * 7 * 24 * H, at: t + i * 7 * 24 * H - lead * H, season: 2025, f: 0.5, p: 0.58, y: 1, overOdds: 100, underOdds: -120, band: kind === 'c' ? 'late' : lead >= 336 ? 'early' : 'mid' });
  const rows = { open: [row(1, 'o', 800), row(2, 'o', 400)], close: [row(1, 'c', 1), row(2, 'c', 1)] };
  const r = R.replayRecord(V, 'mma', rows, { names: () => ({ home: 'A', away: 'B', matchup: 'A vs B' }), epoch: '2026-10-19T00:00:00Z' });
  const timing = Object.fromEntries(r.last.map((b) => [b.id, b.timing]));
  assert.equal(timing['h:1:ml'], 'close', 'five weeks out: never asked live, so not bet at that price');
  assert.equal(timing['h:2:ml'], 'open', 'inside four weeks: bet at the open, as live');
});

test('D56 beat the fair close: the bet\'s own price has a positive expected return at the close\'s no-vig fair, a close at its own line only; the panel\'s share from 30 such bets, a dash under', async () => {
  const R = await import('../libs/ranker/scripts/model/replay-record.mjs');
  // (the dog at +120 at the open, the close's fair 47% for it: 0.47 x 2.2 - 1 = +3.4%, a beat, though the Book's raw
  // closing price on it (+130) is the better price, the old definition's loss; the favorite at -150, 53% fair: -11.7%)
  const close = { f: 0.53, line: null, overOdds: -150, underOdds: 130 };
  assert.deepEqual(R.fairBeatOf({ market: 'ml', line: null }, false, 120, close), { beat: 1, clv: Math.round((0.47 * 2.2 - 1) * 1e4) / 1e4 });
  assert.deepEqual(R.fairBeatOf({ market: 'ml', line: null }, true, -150, close), { beat: 0, clv: Math.round((0.53 * (1 + 100 / 150) - 1) * 1e4) / 1e4 });
  // (the vig in the bet's price: a -110 total at a 50% fair close returns -4.5%: no beat; nothing dropped as a tie)
  assert.deepEqual(R.fairBeatOf({ market: 'total', line: 2.5 }, true, -110, { f: 0.5, line: 2.5 }), { beat: 0, clv: -0.0455 });
  // (a moved line has no close at its line: none, never a guess at the carry)
  assert.equal(R.fairBeatOf({ market: 'spread', line: -3.5 }, true, -110, { f: 0.5, line: -4.5 }), null);
  assert.equal(R.fairBeatOf({ market: 'ml', line: null }, true, 120, null), null);
  const { loadEngine } = await import('./support/engine.mjs');
  const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
  assert.equal(book.BEAT_MIN, 30);
  assert.equal(book.beatText({ clvN: 2, clvBeat: 0 }), '—', "the NFL's panel showed 0% on 2 live bets");
  assert.equal(book.beatText({ clvN: 29, clvBeat: 0.6 }), '—');
  assert.equal(book.beatText({ clvN: 30, clvBeat: 0.6 }), '60%');
  assert.match(book.beatTip({ clvN: 1204, clvEv: 0.012 }), /1,204 with a close at their line; average return at the fair close \+1\.2%/);
  // (a live bet's: clv.mjs ev at the close's fair, its line unmoved; a moved one none)
  assert.equal(book.fairCloseOf({ clv: { pts: null, prob: 0.01, ev: 0.03, beat: true } }), 0.03);
  assert.equal(book.fairCloseOf({ clv: { pts: 1, prob: 0.02, ev: 0.05, beat: true } }), null);
});

test('D57 the slate practice picks are tracked, not staked: no pick forced into a bet in the props, MMA or the replay', async () => {
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  assert.equal(D.PRACTICE_STAKED, false);
  // (D87: still picked, never staked: the props' topN only while staked, MMA's tag on a tracked row only, the replay's
  // practice rows apart from its bets)
  assert.match(src('run.mjs'), /const topN = x\.researchPractice \?\? \(PRACTICE_STAKED \? slatePick : null\);/);
  assert.match(src('mma-desk.mjs'), /if \(!PRACTICE_STAKED\) \{\s*if \(isTracked\(b\)\) Object\.assign\(b, practiceTag\(t\)\);\s*continue;/);
  assert.match(src('replay-record.mjs'), /const staked = V\.desk\.PRACTICE_STAKED !== false;/);
  assert.match(src('replay-record.mjs'), /\(staked \? bets : tracked\)\.push\(betOf\(/);
});

test('D87 the slate practice picks keep being picked and are tagged on their tracked rows at no stake; the Algorithm tab shows them as if bet', async () => {
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  const t = { intent: 'track', units: 0, trackUnits: 0.5, status: 'won', profit: 0, odds: -110, ...D.practiceTag({ rank: 1, quota: 1, slate: 8, edge: 0.01 }) };
  assert.equal(D.isPracticeTracked(t), true);
  assert.equal(D.isPracticeTop(t), false);
  assert.equal(D.isPracticeTop(D.learnView(t)), false, 'as the learning reads it, still not a practice pick');
  assert.equal(D.record([t]).bets + D.practiceRecord([t]).bets, 0);
  assert.match(src('run.mjs'), /const forced = practicePicks\(r, candidates\);/);
  assert.match(src('mma-desk.mjs'), /const forced = mmaPracticePicks\(mlNew,/);
  const page = fs.readFileSync(path.resolve('libs/ranker/src/engine/book/replay-history.ts'), 'utf8');
  assert.match(page, /const units = practiceTrackedOf\(b\) \? PRACTICE_UNITS : 1;/);
  assert.match(page, /export const PRACTICE_UNITS = 0\.5;/);
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D87.'));
});

test('D59 the MMA fair calibrated for the favorite-longshot bias: a soft fit toward the raw fair, walk-forward, off by default till the owner\'s call, the raw fair kept as the benchmark', async () => {
  const G = await import('../libs/ranker/scripts/model/gate-mma.mjs');
  const M = await import('../libs/ranker/scripts/model/mma-desk.mjs');
  // (no evidence: the raw fair; a longshot-biased market: the dog shaded down, the favorite up)
  assert.deepEqual(G.fitFairCal([]).b, [1, 0]);
  const rows = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4000; i++) {
    const f = 0.1 + 0.8 * rnd();
    const z = Math.log(f / (1 - f));
    const truth = 1 / (1 + Math.exp(-1.25 * z));
    rows.push({ f, fd: f, y: rnd() < truth ? 1 : 0 });
  }
  const cal = G.fitFairCal(rows);
  assert.ok(cal.b[0] + cal.b[1] > 1.1, `a slope past 1: ${cal.b}`);
  const prev = process.env.MMA_FAIR_CAL;
  process.env.MMA_FAIR_CAL = '1';
  try {
    assert.ok(G.calFair(0.2, 0.2, cal) < 0.2 && G.calFair(0.8, 0.8, cal) > 0.8);
    assert.equal(G.calFair(0.5, 0.5, cal), 0.5);
    // (walk-forward: a month's rows read only the closes over before it)
    const t0 = Date.parse('2025-01-10T00:00:00Z');
    const hist = rows.slice(0, 600).map((r, i) => ({ ...r, market: 'ml', kind: 'c', t: t0 + i * 6e4 }));
    const later = { market: 'ml', kind: 'o', f: 0.2, fd: 0.2, t: Date.parse('2025-03-05T00:00:00Z'), at: Date.parse('2025-03-01T00:00:00Z') };
    const same = { market: 'ml', kind: 'o', f: 0.2, fd: 0.2, t: Date.parse('2025-01-20T00:00:00Z'), at: Date.parse('2025-01-15T00:00:00Z') };
    G.calibrateRows([...hist, later, same]);
    assert.equal(same.fc, 0.2, 'the month the closes are in reads none of them');
    assert.ok(later.fc < 0.2);
    // (the desk prices from the calibrated fair and keeps the raw fair on the side)
    M.setFairCal(cal);
    const pick = M.pickFor(0.2, { odds: { home: 300, away: -400 }, fair: 0.2 }, 0, { edge: 0.03, key: 'ml' });
    const home = pick.sides?.find?.((s) => s.side === 'home') ?? null;
    if (home) assert.equal(home.fair, 0.2);
  } finally {
    M.setFairCal(undefined);
    if (prev === undefined) delete process.env.MMA_FAIR_CAL;
    else process.env.MMA_FAIR_CAL = prev;
  }
  // (on by default since the owner's call, 2026-10-20: the calibrated fair moves a longshot's chance down)
  assert.equal(G.FAIR_CAL_ON, true);
  if (prev === undefined) assert.ok(G.calFair(0.2, 0.2, cal) < 0.2);
});

test('D60 the replay\'s guard: more units at a lower beat-the-fair-close share or return than the champion\'s is rejected; a market under 52.5% beating the fair close stakes the practice stake, never off', async () => {
  const S = await import('../libs/ranker/scripts/model/gate-score.mjs');
  const R = await import('../libs/ranker/scripts/model/replay-record.mjs');
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  const a = { profit: -10, beat: 0.5, beatN: 300, clv: -0.01 };
  assert.equal(S.replayGuard(a, { profit: 5, beat: 0.45, beatN: 300, clv: -0.01 }).pass, false);
  assert.equal(S.replayGuard(a, { profit: 5, beat: 0.5, beatN: 300, clv: -0.03 }).pass, false);
  assert.equal(S.replayGuard(a, { profit: 5, beat: 0.52, beatN: 300, clv: 0 }).pass, true);
  assert.equal(S.replayGuard(a, { profit: -20, beat: 0.3, beatN: 300, clv: -0.05 }).pass, true, 'fewer units: not this guard');
  assert.equal(S.replayGuard(a, { profit: 5, beat: 0.3, beatN: 10, clv: 0 }), null, 'too few to read');
  const v = S.sportVerdict({ proj: {}, bet: {}, replay: { a, b: { profit: 5, beat: 0.4, beatN: 300, clv: -0.01 } } });
  assert.equal(v.pass, false);
  assert.match(v.why[0], /beat the fair close less often/);
  // (the bar: walk-forward, from 40 checked bets settled before; the stake shrinks to the practice stake, a LIKE)
  assert.equal(D.BEAT_BAR, 0.525);
  const bets = [];
  for (let i = 0; i < 60; i++) bets.push({ market: 'ml', t: i * 864e5, at: i * 864e5 - 36e5, beat: i % 3 === 0 ? 1 : 0, units: 2, profit: 2, band: 'high', practice: false });
  R.beatBar(bets, { bar: 0.525, min: 40, window: 200, practiceUnits: 0.5 });
  assert.equal(bets[39].units, 2, 'under 40 settled: unchanged');
  assert.equal(bets[45].units, 0.5);
  assert.equal(bets[45].band, 'medium');
  assert.equal(bets[45].profit, 0.5);
  assert.ok(bets.every((b) => b.units > 0), 'never off');
  // (the live gates: a CLV of 0 or more but a beat share under the bar holds the practice stake)
  const live = [];
  for (let i = 0; i < 50; i++) live.push({ sport: 'nba', market: 'spread', status: 'won', placedAt: '2030-01-01T00:00:00Z', start: '2030-01-02T00:00:00Z', clv: { v: (await import('../libs/ranker/scripts/model/clv.mjs')).CLV_V, prob: 0.01, ev: 0, beat: i < 20 } });
  const g = D.lineGate(live, 'nba', '2029-01-01T00:00:00Z');
  assert.equal(g.on, false);
  assert.match(g.why, /beat the close 40% over 50, under 52.5%/);
});

test('D62 the stacked fatigue reason: the other side\'s back-to-back, travel, time zones east and altitude past its own, in the sport\'s tail, only where the Book\'s price still sits at the sharp fair; family rest (never a second rest reason)', async () => {
  const R = await import('../libs/ranker/scripts/model/reasons.mjs');
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  const sched = new Map([['g', { rest: [3, 1], b2b: [false, true] }]]);
  D.withTravel(sched, new Map([['g', { info: { miles: [0, 1800], schedule: { tzMove: [0, 2], climb: [0, 1.6] } } }]]));
  const s = sched.get('g');
  assert.deepEqual(s.trav.miles, [0, 1800]);
  const home = R.contextOf({ sport: 'nba', market: 'ml', side: 'home', fS: 0.55, odds: -118, pin: true, sched: s });
  assert.equal(home.fatigue, 1 + 1.8 + 1 + 1.6);
  const ids = R.reasonsFor(home).map((r) => r.id);
  assert.ok(ids.includes('fatigue'));
  assert.equal(R.REASONS.find((r) => r.id === 'fatigue').family, 'rest');
  // (the Book's price moved off the sharp fair for it: not the reason)
  const moved = R.contextOf({ sport: 'nba', market: 'ml', side: 'home', fS: 0.55, odds: 120, pin: true, sched: s });
  assert.ok(!R.reasonsFor(moved).map((r) => r.id).includes('fatigue'));
  // (the tired side's own pick: none; no travel facts: none)
  assert.ok(!R.reasonsFor(R.contextOf({ sport: 'nba', market: 'ml', side: 'away', fS: 0.45, odds: 122, pin: true, sched: s })).map((r) => r.id).includes('fatigue'));
  assert.equal(R.contextOf({ sport: 'nba', market: 'ml', side: 'home', sched: { rest: [3, 1], b2b: [false, true] } }).fatigue, null);
});

test('D61 the big plan\'s leftover month: the desk may spend past MONTHLY till BIG_UNTIL (the real balance binding), and the window\'s spending never counts against MONTHLY after it; the intraday snapshots at the set hours', async () => {
  const O = await import('../libs/ranker/scripts/model/oddsapi.mjs');
  const I = await import('../libs/ranker/scripts/model/intraday.mjs');
  const before = Date.parse(O.BIG_UNTIL) - 5 * 864e5;
  const after = Date.parse(O.BIG_UNTIL) + 2 * 864e5;
  let u = { calls: [], remaining: 2_000_000 };
  u = O.recordOn(u, 'props', 50_000, 2_000_000, null, new Date(before).toISOString());
  const b1 = O.budgetOf(u, before + 36e5);
  assert.equal(b1.remaining, O.BIG_MONTHLY - 50_000);
  // (after the window, the real balance the $30 plan's: the window's spending left out, the plan's month whole)
  u.remaining = 20_000;
  const b2 = O.budgetOf(u, after);
  assert.equal(b2.used, 0);
  assert.equal(b2.remaining, Math.min(20_000, O.MONTHLY));
  // (a usage without the window's record (a lost cache) counts it: under-spends, never over)
  const { big, ...lost } = u;
  assert.equal(O.budgetOf(lost, after).remaining, 0);
  assert.ok(big.spent === 50_000);
  // (the snapshot hours: each start's offsets floored to the hour, past ones only)
  const s = Date.parse('2025-01-10T00:30:00Z');
  const times = I.snapshotTimes([s], [24, 1], { now: s + 864e5 });
  assert.deepEqual(times.map((t) => new Date(t).toISOString()), ['2025-01-09T00:00:00.000Z', '2025-01-09T23:00:00.000Z']);
});

test('D63 the betting windows: a line segment leaves the old placement only on a paired gain past 1.645 SEs over 60 games, never at worse prices against the fair close; live a held pick bets at its hour and always at the last chance', async () => {
  const W = await import('../libs/ranker/scripts/model/windows.mjs');
  assert.equal(W.WIN_Z, 1.645);
  assert.equal(W.WIN_MIN, 60);
  assert.deepEqual(W.POLICIES, ['legacy', 'h24', 'h12', 'h6', 'h3', 'h1']);
  // (the old placement: the archive's open, else the close; a window: the first snapshot from its hour on with an edge)
  const cands = [{ kind: 'i', hours: 24, ev: 0.02, seg: 'ml:dog' }, { kind: 'o', hours: 12, ev: 0.01, seg: 'ml:dog' }, { kind: 'i', hours: 6, ev: 0.03, seg: 'ml:dog' }, { kind: 'c', hours: 0, ev: 0.01, seg: 'ml:dog' }];
  assert.equal(W.placeBy(cands, () => 'legacy').kind, 'o');
  assert.equal(W.placeBy(cands, () => 'h6').hours, 6);
  assert.equal(W.placeBy(cands, () => 'h24').hours, 24);
  assert.equal(W.placeBy(cands.filter((c) => c.kind !== 'o'), () => 'legacy').kind, 'c');
  // (the walk: a month reads only games settled before it; too few or within noise stays legacy)
  const t0 = Date.parse('2025-01-01T00:00:00Z');
  const many = Array.from({ length: 80 }, (_, i) => ({ t: t0 + i * 36e5, seg: 'ml:dog', any: true, by: { legacy: -1, h24: -1, h12: -1, h3: -1, h1: -1, h6: i % 5 ? 1 : -1 }, clv: { h6: { beat: 1, clv: 0.02 } } }));
  const w = W.walkWindows(many);
  assert.equal(w.at(t0, 'ml:dog'), 'legacy');
  assert.equal(w.final['ml:dog'].policy, 'h6');
  assert.equal(W.walkWindows(many.slice(0, 50)).final['ml:dog'].policy, 'legacy');
  // (unchecked against the fair close, or under D60's 52.5% there, or at worse prices than the old placement: refused)
  assert.equal(W.walkWindows(many.map((o) => ({ ...o, clv: {} }))).final['ml:dog'].policy, 'legacy');
  assert.equal(W.walkWindows(many.map((o, i) => ({ ...o, clv: { h6: { beat: i % 2, clv: 0.01 } } }))).final['ml:dog'].policy, 'legacy');
  const worse = many.map((o) => ({ ...o, clv: { legacy: { beat: 1, clv: 0.02 }, h6: { beat: 0, clv: -0.02 } } }));
  assert.equal(W.walkWindows(worse).final['ml:dog'].policy, 'legacy');
  // (live: held while the game is further than the hour; never inside the last chance; legacy never held)
  const file = { segments: { 'ml:dog': { policy: 'h6' }, 'ml:fav': { policy: 'legacy' } } };
  assert.equal(W.heldNow(file, 'ml', 'dog', 10, 3), true);
  assert.equal(W.heldNow(file, 'ml', 'dog', 6.5, 3), false);
  assert.equal(W.heldNow(file, 'ml', 'fav', 20, 3), false);
  assert.equal(W.heldNow({ segments: { 'ml:dog': { policy: 'h1' } } }, 'ml', 'dog', 2.5, 3), false);
});

test('D64 the props\' stat bar: D51\'s bar by stat and side, on only in the sports the gate shipped it for, a key without an earned record at the practice stake, never off', async () => {
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  assert.equal(D.propKey('reb', 'under'), 'prop:reb:under');
  assert.deepEqual(D.PROP_BAR_SPORTS, ['nba', 'nfl']);
  const file = { applies: true, segments: { 'prop:reb:under': { n: 200, sum: 20, sum2: 200 } } };
  const bar = D.propBar(file, [], 'nba');
  const on = D.propBarGate(bar, file, 'nba', 'reb', 'under', 0.05);
  const off = D.propBarGate(bar, file, 'nba', 'ast', 'under', 0.05);
  assert.equal(off.on, false);
  assert.equal(off.practice, true);
  assert.equal(typeof on.on, 'boolean');
  // (not on in a sport the gate didn't ship it for, nor where the file's own place stands aside)
  assert.equal(D.propBarGate(bar, file, 'nhl', 'ast', 'under', 0.05), null);
  assert.equal(D.propBarGate(bar, { ...file, applies: false }, 'nba', 'ast', 'under', 0.05), null);
  // (a barred prop still bets: the practice stake through gatedPlacement)
  const placed = D.gatedPlacement(0.05, 1, off);
  assert.equal(placed.units, D.PRACTICE_UNITS);
});

test('D65 MMA\'s Kelly bands earn their place: a LOVE or LOCK whose earlier would-be bets didn\'t beat the band below (return and beat-the-close) falls a band, its stake to that band\'s cap', async () => {
  const R = await import('../libs/ranker/scripts/model/reasons.mjs');
  const t0 = Date.parse('2025-01-01T00:00:00Z');
  // (LOVEs that lose more than the LIKEs: never placed)
  const bets = [...Array.from({ length: 60 }, (_, i) => ({ t: t0 + i * 864e5, tier: 'high', profit: -1, beat: 0 })), ...Array.from({ length: 60 }, (_, i) => ({ t: t0 + i * 864e5, tier: 'medium', profit: 0.1, beat: 1 }))];
  const p = R.placeTiers(bets);
  assert.equal(p.final.love, false);
  assert.equal(R.placed('high', p.final), 'medium');
  assert.equal(R.tierUnits(2.5, 'medium'), 1);
  const src = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/replay-record.mjs'), 'utf8');
  assert.ok(src.includes("sport === 'mma' && REASONS?.placeTiers"));
});

test('D66 the news lag: a star newly out with his teammates\' lines unmoved tags their overs newsLag, the props asked again first, a live-only reason judged on its own record (no prior), the popover\'s "Star out" line', async () => {
  const L = await import('../libs/ranker/scripts/model/news-lag.mjs');
  const R = await import('../libs/ranker/scripts/model/reasons.mjs');
  const { propAsk } = await import('../libs/ranker/scripts/model/timing.mjs');
  const { TIERS } = await import('../libs/ranker/scripts/model/oddsapi.mjs');
  const game = { id: 'g1', home: '1', away: '2', date: '2026-10-21T23:30:00Z' };
  const row = (id, name, stat, line, over = -110, under = -110, team = '1') => ({ athlete: { id, name, team }, stat: { key: stat }, line, prices: { over, under } });
  const board = [row('s', 'Star Guard', 'pts', 27.5), row('m', 'Mate One', 'pts', 14.5), row('b', 'Bench', 'pts', 6.5), row('o', 'Other Star', 'pts', 25.5, -110, -110, '2')];
  // (the stars by the Book's own lines: the top two, or 17.5 points or more)
  assert.deepEqual([...L.starsOf('nba', board, '1')].sort(), ['m', 's']);
  const state = { games: {} };
  const t0 = Date.parse('2026-10-21T12:00:00Z');
  // (a run before the news: the stars kept, the lines then)
  assert.deepEqual(L.lagUpdate(state, { sport: 'nba', game, board, injuries: new Map(), now: t0 }), []);
  const inj = new Map([['1', [{ id: 's', name: 'Star Guard', status: 'Out', from: 'bluesky' }]]]);
  // (the next run: newly out, not yet asked for: the props asked again ahead of the routine asks, at the top tier)
  assert.deepEqual(L.lagPending(state, game, inj, []), ['s']);
  assert.deepEqual(L.lagPending(state, game, inj, ['s']), []);
  assert.equal(propAsk({ starOut: true, times: 2, max: 6, boardPriced: true, until: 9e6, refresh: true, sinceAsk: 9e7 }), 'newsLag');
  assert.equal(propAsk({ starOut: true, times: 6, max: 6, until: 9e6 }), null);
  assert.ok(TIERS.newsLag > TIERS.refresh && TIERS.newsLag >= TIERS.news);
  const t1 = t0 + 10 * 6e4;
  const outs = L.lagUpdate(state, { sport: 'nba', game, board, injuries: inj, now: t1 });
  assert.equal(outs.length, 1);
  assert.equal(outs[0].then['pts:m'][0], 14.5);
  const x = { side: 'over', prop: board[1], projection: { vacF: 1.12, out: ['Star Guard'] } };
  const tag = L.lagTag('nba', outs, x, { now: t1 + 5 * 6e4, board });
  assert.equal(tag.player, 'Star Guard');
  assert.equal(tag.min, 5);
  assert.deepEqual(tag.then, { line: 14.5, odds: -110 });
  // (no tag: the under; no vacancy to him; the line already moved; the star's own prop pulled (the NBA's); stale news)
  assert.equal(L.lagTag('nba', outs, { ...x, side: 'under' }, { now: t1, board }), null);
  assert.equal(L.lagTag('nba', outs, { ...x, projection: { vacF: 1, out: ['Star Guard'] } }, { now: t1, board }), null);
  assert.equal(L.lagTag('nba', outs, { ...x, prop: { ...board[1], line: 15.5 } }, { now: t1, board }), null);
  assert.equal(L.lagTag('nba', outs, { ...x, prop: { ...board[1], prices: { over: -135, under: 105 } } }, { now: t1, board }), null);
  assert.equal(L.lagTag('nba', outs, x, { now: t1, board: board.filter((p) => p.athlete.id !== 's') }), null);
  assert.equal(L.lagTag('nba', outs, x, { now: t1 + (L.LAG_FRESH_H + 1) * 36e5, board }), null);
  assert.equal(L.lagTag('mlb', outs, x, { now: t1, board }), null);
  // (a star already out the first run the desk saw the game: no price then, no tag)
  const s2 = { games: {} };
  const o2 = L.lagUpdate(s2, { sport: 'nba', game, board, injuries: inj, now: t1 });
  assert.equal(L.lagTag('nba', o2, x, { now: t1, board }), null);
  // (the reason: family news, prop only, live-only; the replay's file never speaks for it; no prior: unproven till
  // its own graded bets clear D58's bar)
  const ctx = R.contextOf({ sport: 'nba', market: 'prop', side: 'over', stat: 'pts', kelly: 0.05, newsLag: true });
  const r = R.reasonsFor(ctx).find((y) => y.id === 'newsLag');
  assert.equal(r.family, 'news');
  assert.ok(R.LIVE_REASONS.includes('newsLag'));
  assert.equal(R.reasonsFor(R.contextOf({ sport: 'nba', market: 'prop', side: 'over', stat: 'pts' })).some((y) => y.id === 'newsLag'), false);
  const file = { markets: { prop: { newsLag: { on: true, strong: true, n: 999 } } }, place: { love: true, lock: true } };
  assert.equal(R.liveTier(file, ctx).tier, 'medium');
  assert.equal(R.liveVerdicts([], 'nba').size, 0);
  const bet = (i, lag, won) => ({ sport: 'nba', market: 'prop', intent: 'edge', units: 1, odds: -110, status: won ? 'won' : 'lost', start: new Date(Date.parse('2025-11-01T00:00:00Z') + i * 864e5 * (i % 2 ? 1 : 200)).toISOString(), ...(lag ? { newsLag: { player: 'S' } } : {}) });
  const few = Array.from({ length: 20 }, (_, i) => bet(i, true, true));
  const v = R.liveVerdicts([...few, ...Array.from({ length: 100 }, (_, i) => bet(i, false, i % 2))], 'nba');
  assert.equal(v.get('prop').get('newsLag').on, false);
  // (the popover's line)
  assert.equal(L.starOutText({ player: 'Star Guard', first: new Date(t1).toISOString() }, t1 + 12 * 6e4), 'Star out: Star Guard (news 12 min ago)');
  const rows = fs.readFileSync(path.join(MODEL, '../../src/engine/book/book-rows.ts'), 'utf8');
  assert.ok(rows.includes('Star out: ${lag.player}') && rows.includes('(news ${min} min ago)'));
  const page = fs.readFileSync(path.join(MODEL, '../../src/engine/book/book-page.component.ts'), 'utf8');
  assert.ok(page.includes('starOutText(r.lag)'));
  // (the review: t_news, t_bet, the Book's move after the bet from the price log, the delta; Pinnacle's props not logged)
  const b = { id: 'x', event: 'g1', propType: 'pts', athlete: 'm', line: 14.5, odds: -110, otherOdds: -110, placedAt: new Date(t1 + 5 * 6e4).toISOString(), newsLag: { player: 'Star Guard', first: new Date(t1).toISOString() } };
  const rv = L.lagReview(b, [[Math.floor((t1 + 2 * 6e4) / 1000), 'g1', 'p:pts:m', 16.5, -110, -110, 'e'], [Math.floor((t1 + 40 * 6e4) / 1000), 'g1', 'p:pts:m', 16.5, -110, -110, 'e']]);
  assert.equal(rv.latencyMin, 5);
  assert.equal(rv.dkAfterMin, 35);
  assert.equal(rv.delta, '+2 line');
  assert.equal(rv.pinMove, null);
  // (live: the run tags the bet and the tier reads the live verdicts)
  const run = fs.readFileSync(path.join(MODEL, 'run.mjs'), 'utf8');
  assert.ok(run.includes('newsLag: !!bet.newsLag') && run.includes('{ live: r.liveReasons ?? null }') && run.includes("why === 'newsLag' && boardPriced"));
});

test('D68 the fast lane: the watcher every minute; news on one game dispatches that game\'s props alone, never a refit or a line, in the full desk\'s concurrency group, its own rate', async () => {
  const watch = await import('../scripts/desk-watch.mjs');
  // (the rates: the full lane's unchanged, the fast lane's its own)
  assert.equal(watch.POLL_MIN, 1);
  assert.equal(watch.COOLDOWN_MIN, 20);
  assert.equal(watch.MAX_PER_DAY, 40);
  assert.equal(watch.FAST_COOLDOWN_MIN, 5);
  assert.equal(watch.FAST_MAX_PER_DAY, 30);
  assert.match(fs.readFileSync(path.resolve('scripts/desk-watch.ps1'), 'utf8'), /\[int\]\$EveryMinutes = 1\b/);
  const src = fs.readFileSync(path.resolve('scripts/desk-watch.mjs'), 'utf8');
  assert.ok(!/ODDS_API_KEY|the-odds-api|run\.mjs|sleeper\.app/.test(src.replace(/^\/\/.*$/gm, '')), 'the watcher spends no credit, never runs the bettor, never polls Sleeper');
  // (never a fast dispatch while a fast run is queued or running or a full one queued)
  const now = Date.now();
  const pending = [{ key: 'k', sport: 'nba', game: '1', fast: true, until: now + 36e5 }];
  assert.equal(watch.fastDecision({ pending, runs: [{ status: 'in_progress', createdAt: new Date(now - 6e4).toISOString() }], now }).go, false);
  assert.equal(watch.fastDecision({ pending, others: [{ status: 'pending', createdAt: new Date(now - 6e4).toISOString() }], now }).go, false);
  assert.equal(watch.fastDecision({ pending, now }).go, true);
  // (the workflow: one game's props by run.mjs --fast, the full desk's concurrency group and cache, no AI step, the data checked and committed by rebase)
  const wf = fs.readFileSync(path.resolve('.github/workflows/model-desk-fast.yml'), 'utf8');
  assert.match(wf, /concurrency:\s*\n\s*group: model-desk\s*\n\s*cancel-in-progress: false/);
  assert.match(wf, /run\.mjs "\$SPORT" "--fast=\$GAME"/);
  assert.match(wf, /key: model-desk-\$\{\{ github\.run_id \}\}/);
  assert.match(wf, /restore-keys: model-desk-/);
  assert.match(wf, /run-name: "Model desk fast: \$\{\{ inputs\.sport \}\} \$\{\{ inputs\.game \}\}"/);
  assert.ok(!/ANTHROPIC_API_KEY|CHECK_RESEARCH|--replace|--refit|odds-history\.mjs/.test(wf), 'no AI step, no re-price of everything, no refit, no snapshot');
  assert.match(wf, /git pull --rebase( --autostash)? && git push/);
  assert.match(wf, /LIVE_DATA_SOFT: "1"/);
  assert.match(fs.readFileSync(path.resolve('.github/workflows/model-desk.yml'), 'utf8'), /concurrency:\s*\n\s*group: model-desk\s*\n/);
  // (run.mjs: the fast run never refits the props, buys no lines, prices no line, takes back only its game's props, isn't in the cadence)
  const run = fs.readFileSync(path.join(MODEL, 'run.mjs'), 'utf8');
  assert.ok(run.includes("export const FAST = process.argv.find((a) => a.startsWith('--fast='))"));
  assert.ok(run.includes('spent: FAST ? Infinity : FIT_SPENT'));
  assert.ok(run.includes("if (FAST || !unbet || !canSpend('lines', 3))"));
  assert.ok(run.includes('of FAST ? [] : r.upcoming'));
  assert.ok(run.includes("if (FAST && (b.market !== 'prop' || String(b.event) !== FAST)) continue;"));
  assert.ok(run.includes('if (FAST && String(game.id) !== FAST) continue;'));
  assert.ok(run.includes('!DRY && !PICKS_ONLY && !FAST) write(RUNS'));
  const { fitPlan } = await import('../libs/ranker/scripts/model/fitcache.mjs');
  assert.equal(fitPlan({ fit: { fits: {}, seconds: 60 } }, { refit: true, must: false }, { sport: 'nba', spent: Infinity }), 'reuse');
  assert.equal(fitPlan({ fit: { fits: {}, seconds: 60 } }, { refit: true, must: true }, { sport: 'nba', spent: Infinity }), 'suggest');
  assert.equal(fitPlan(null, { refit: true, must: true }, { sport: 'nba', spent: Infinity }), 'wait');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D68.'));
});

test("D69 every season with prop odds is priced: the props' replay reads the older seasons' finals from the archive's first props season (the NBA, the NHL, MLB with its teams' codes); the NFL's already reach; GATE_PROPS_EXTEND=0 off", async () => {
  const { propsHistory, PROPS_EXTEND } = await import('../libs/ranker/scripts/model/gate.mjs');
  assert.deepEqual([...PROPS_EXTEND].sort(), ['mlb', 'nba', 'nhl']);
  const history = [{ id: '10', date: '2025-10-01T00:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'NYY', awayAbbr: 'BOS', final: true }];
  const older = [
    { id: '7', date: '2023-05-01T00:00Z', season: 2023, home: '1', away: '2', homeAbbr: '', awayAbbr: '', final: true },
    { id: '5', date: '2022-05-01T00:00Z', season: 2022, home: '1', away: '2', homeAbbr: '', awayAbbr: '', final: true },
  ];
  const events = new Map([['o1', { season: 2023 }]]);
  const props = [{ oid: 'o1' }];
  const histGames = [...older, ...history];
  const nba = propsHistory('nba', history, histGames, props, events);
  // (D75 amends: one season before the first with props too (PROPS_WF_BACK), the walk-forward fit's first base)
  assert.deepEqual(nba.map((g) => g.id), ['5', '7', '10']);
  const mlb = propsHistory('mlb', history, histGames, props, events);
  assert.equal(mlb[0].homeAbbr, 'NYY');
  assert.equal(propsHistory('nfl', history, histGames, props, events), history);
  process.env.GATE_PROPS_EXTEND = '0';
  try {
    assert.equal(propsHistory('nba', history, histGames, props, events), history);
  } finally {
    delete process.env.GATE_PROPS_EXTEND;
  }
});

test("D70 the closing-line bands: Gemini's bars with the results guard shipped; live closing lines merged with the record's tallies; a live-only reason takes no prior from the file", async () => {
  const C = await import('../libs/ranker/scripts/model/clv-bands.mjs');
  const R = await import('../libs/ranker/scripts/model/reasons.mjs');
  assert.equal(C.SHIPPED.k, 100);
  assert.deepEqual(C.SHIPPED.love, { n: 50, ev: 0.02, beat: 0.515 });
  assert.deepEqual(C.SHIPPED.lock, { n: 150, ev: 0.04, beat: 0.535 });
  assert.deepEqual(C.SHIPPED.results, { n: 50, roi: 0, z: 0 });
  assert.equal(C.SHIPPED.kellyFloor, R.LOVE_FLOOR);
  // (the record's 30 checks at +10%, and the live ledger's: 15 more short of LOVE's 50, 30 more LOVE between records)
  const stats = { n: 30, s: 3, s2: 0.3, beat: 30, rn: 30, rs: 3, rs2: 30 };
  const file = { rule: C.ruleFile(C.SHIPPED), k: 100, markets: { ml: { 'seg:ml:dog:early': { on: false, stats } }, prop: { newsLag: { on: true, stats: { ...stats, n: 400, s: 80, beat: 400, rn: 400, rs: 80 } } } } };
  assert.equal(C.isClvFile(file), true);
  const live = Array.from({ length: 15 }, () => ({ market: 'ml', ids: ['seg:ml:dog:early'], clv: 0.1, profit: 0.5 }));
  const v = C.liveMerged(file, live);
  assert.equal(v.get('ml').get('seg:ml:dog:early').on, false);
  assert.equal(C.liveMerged(file, [...live, ...live]).get('ml').get('seg:ml:dog:early').on, true);
  // (the news lag: the file's entry ignored, no live bets: nothing earned)
  assert.equal(v.get('prop').get('newsLag').on, false);
  // (the live desk's tier reads the merged verdicts for every reason under the rule)
  const ctx = R.contextOf({ sport: 'nba', market: 'ml', side: 'away', fS: 0.4, pS: 0.47, kelly: 0.05, odds: 150, early: true });
  const t = R.liveTier({ ...file, place: { love: true, lock: true } }, ctx, { live: C.liveMerged(file, [...live, ...live]) });
  assert.equal(t.tier, 'high');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D70.') && decisions.includes('### D69.'));
});

test('D71 the NFL lines bet earlier: the dense history (D67) read as the replay\'s intraday candidates inside the lines window, D61\'s hours first; the walk keeps the close until an hour earns it', async () => {
  const W = await import('../libs/ranker/scripts/model/windows.mjs');
  const { TIMING } = await import('../libs/ranker/scripts/model/leagues.mjs');
  const { intradayLines } = await import('../libs/ranker/scripts/model/gate-history.mjs');
  assert.deepEqual(W.DENSE_SPORTS, ['nfl']);
  assert.deepEqual(W.DENSE_BOOKS, ['dk', 'pin']);
  // (every dense hour inside the NFL's lines window: the 48-hour snapshots stay research)
  for (const h of W.DENSE_OFFSETS.nfl) assert.ok(h <= TIMING.nfl.lines, `${h}h`);
  assert.ok(!W.DENSE_OFFSETS.nfl.includes(48));
  // (the policies unchanged: the 2-hour snapshot is a candidate under "not before 3h", not a policy of its own)
  assert.deepEqual(W.POLICIES, ['legacy', 'h24', 'h12', 'h6', 'h3', 'h1']);
  // (a dense snapshot's state read as D61's: the last change at or before the snapshot)
  const start = Date.parse('2021-10-17T17:00:00Z');
  const at = (h) => new Date(start - h * 36e5).toISOString();
  const events = new Map([['e1', { t: new Date(start).toISOString() }]]);
  const rows = new Map([['e1', [{ ts: Date.parse(at(48)), book: 'dk', market: 'h2h', line: null, a: -150, b: 130 }, { ts: Date.parse(at(2)), book: 'dk', market: 'h2h', line: null, a: -170, b: 145 }]]]);
  const out = intradayLines(events, { rows, snaps: [at(48), at(24), at(2)] }, W.DENSE_OFFSETS.nfl);
  assert.equal(out.find((l) => l.h === 24).a, -150);
  assert.equal(out.find((l) => l.h === 2).a, -170);
  // (the gate reads them for a version that exports DENSE_SPORTS (the champion before D71 reads D61's alone), D61's
  // hours first; the research's forced window is env-only, never in a record)
  const gate = fs.readFileSync(path.resolve('libs/ranker/scripts/model/gate.mjs'), 'utf8');
  assert.ok(gate.includes('V.windows?.DENSE_SPORTS?.includes(sport)') && gate.includes('seenIntra.has('));
  assert.ok(!gate.includes('REPLAY_WINDOW_FORCE'));
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D71.'));
});

test('D71 the Algorithm tab\'s Findings: one shared file, one dated line an entry, grouped Shipped / Tested and dropped / Watching', () => {
  const f = JSON.parse(fs.readFileSync(path.resolve('apps/nfl/src/StaticData/model/findings.json'), 'utf8'));
  assert.ok(Array.isArray(f.entries) && f.entries.length > 0);
  for (const e of f.entries) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['shipped', 'dropped', 'watching'].includes(e.group), e.text);
    assert.ok(e.sport == null || ['nfl', 'nba', 'nhl', 'mlb', 'mma'].includes(e.sport), e.text);
    assert.ok(typeof e.text === 'string' && e.text.length > 0 && e.text.length <= 140 && !e.text.includes('\n'), e.text);
  }
  const html = fs.readFileSync(path.resolve('libs/ranker/src/engine/book/model-desk.component.html'), 'utf8');
  assert.ok(html.includes('label="Findings"') && html.includes("panelOpen('findings')"));
  const math = fs.readFileSync(path.resolve('libs/ranker/src/engine/book/desk-math.ts'), 'utf8');
  assert.match(math, /DESK_PANELS_OPEN: readonly DeskPanel\[\] = \['sport', 'confidence'\]/);
});

test("D72 the trusted-edge bands: measured and staged, none shipped; By Confidence shows each band's share (the pyramid), the staged rules by their names", () => {
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D72.') && decisions.includes('### D71.'));
  const html = fs.readFileSync(path.resolve('libs/ranker/src/engine/book/model-desk.component.html'), 'utf8');
  assert.ok(html.includes('desk-share-bar') && html.includes('shares: bandShares') && html.includes('stagedLabels[n] ?? n'));
  const hist = fs.readFileSync(path.resolve('libs/ranker/src/engine/book/replay-history.ts'), 'utf8');
  assert.ok(hist.includes('export function bandSharesOf(') && hist.includes('labels?: Record<string, string>'));
  // (a staged file names its rules; the live record is untouched by the lab)
  for (const sport of ['nfl', 'nba', 'nhl', 'mlb']) {
    const f = JSON.parse(fs.readFileSync(path.resolve('apps', sport, 'src/StaticData/model/replay-record.staged.json'), 'utf8'));
    assert.ok(f.order.some((n) => n.startsWith('trust-')), sport);
    for (const n of f.order) assert.ok(f.labels?.[n], `${sport} ${n}`);
  }
});

test('D73 the two-band trial: LIKE and LOVE, LOCK off, labelled a trial; LOVE on in the NHL, the LIKE stakes in the NBA; the 2% floor lowered for its LOVEs alone', async () => {
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D73.') && decisions.includes('**A trial**'));
  const T = await import('../libs/ranker/scripts/model/trusted.mjs');
  assert.deepEqual(Object.keys(T.TRIAL).sort(), ['nba', 'nhl']);
  assert.equal(T.TRIAL_OPTS.loveUnits, 2);
  assert.ok(T.trialWhy([['form', 0.01]]).startsWith('LOVE (trial): driven by proven pieces: '));
  const P = await import('../libs/ranker/scripts/model/picks.mjs');
  assert.equal(P.BANDS.high, 0.02, "the owner's 2% floor stands outside the trial");
});

// ---- D74: the best price across the US books ----
import { BOOK_NAMES, FAIR_TOL, SHOP_TOL, US_BOOKS, bestPair, shopRows, sideBest } from '../libs/ranker/scripts/model/best-price.mjs';
import { OTHER_BOOKS, WIDE_BOOKS, linesFromEvent } from '../libs/ranker/scripts/model/oddsapi.mjs';
import { propsFromBodies } from '../libs/ranker/scripts/model/props.mjs';
import { linesOf as mmaLinesOf, pricedFair as mmaPricedFair } from '../libs/ranker/scripts/model/mma-desk.mjs';
import { TOTAL_ANCHORS, TOTAL_BOOKS, totalLinesOf } from '../libs/ranker/scripts/model/fights-totals.mjs';
import { price as priceLines } from '../libs/ranker/scripts/model/desk.mjs';
import { PRICE_NOTE } from '../libs/ranker/scripts/model/replay-record.mjs';

// (an Odds API event: each book's h2h, spreads and totals as [home, away] / [over, under] decimal prices)
const evOf = (books) => ({
  id: 'e1',
  home_team: 'Home Team',
  away_team: 'Away Team',
  commence_time: '2026-10-25T17:00:00Z',
  bookmakers: Object.entries(books).map(([key, m]) => ({
    key,
    markets: [
      ...(m.h2h ? [{ key: 'h2h', outcomes: [{ name: 'Home Team', price: m.h2h[0] }, { name: 'Away Team', price: m.h2h[1] }] }] : []),
      ...(m.spreads ? [{ key: 'spreads', outcomes: [{ name: 'Home Team', point: m.spreads[0], price: m.spreads[1] }, { name: 'Away Team', point: -m.spreads[0], price: m.spreads[2] }] }] : []),
      ...(m.totals ? [{ key: 'totals', outcomes: [{ name: 'Over', point: m.totals[0], price: m.totals[1] }, { name: 'Under', point: m.totals[0], price: m.totals[2] }] }] : []),
    ],
  })),
});

test('D74 the books: every US book one region names, Pinnacle never a book to bet at, one region still', () => {
  assert.deepEqual([...US_BOOKS].sort(), [BOOK, ...OTHER_BOOKS].sort());
  assert.ok(!US_BOOKS.includes('pinnacle') && WIDE_BOOKS.length <= 10 && WIDE_BOOKS.includes('pinnacle'));
  assert.ok(TOTAL_BOOKS.length <= 10 && TOTAL_BOOKS.includes('fanduel') && !TOTAL_ANCHORS.includes('fanduel'), 'MMA: one region, the anchors unchanged');
  assert.equal(BOOK, 'draftkings', "the home book: its line, ESPN's board, the fair's fallback");
  assert.equal(BOOK_NAMES.fd, 'FanDuel');
  assert.ok(MODEL_EPOCH >= '2026-10-21T00:00:00Z', 'MODEL_EPOCH bumped for the pricing change');
});

test('D74 the best pair: the highest price of the sane books at one line, the home book first at a tie; a stale or in-play line dropped; never worse than the home book', () => {
  const b = bestPair([{ book: 'dk', a: 350, b: -417 }, { book: 'fd', a: 320, b: -400 }, { book: 'br', a: 350, b: -417 }, { book: 'mgm', a: 230, b: -286 }, { book: 'pin', a: 400, b: -300 }]);
  assert.deepEqual(b.a, { odds: 350, book: 'dk' }, 'the tie names the home book');
  assert.deepEqual(b.b, { odds: -400, book: 'fd' });
  assert.equal(b.n, 3, "BetMGM's in-play 230/-286 out (past FAIR_TOL of the median), Pinnacle never a US book");
  assert.ok(FAIR_TOL <= 0.05);
  assert.equal(bestPair([{ book: 'fd', a: 120, b: 120 }]), null, 'a negative-vig pair is no price');
  assert.deepEqual(sideBest({ odds: -115, book: 'fd' }, -110), { odds: -110, book: 'dk' });
  assert.deepEqual(sideBest({ odds: -105, book: 'fd' }, -110), { odds: -105, book: 'fd' });
});

test("D74 live game lines: each side's best US price at the Book's own line, the fair Pinnacle's as before, the Book's own prices kept", () => {
  const l = linesFromEvent(evOf({ draftkings: { h2h: [1.91, 1.91], spreads: [-3, 1.91, 1.91], totals: [45.5, 1.91, 1.91] }, fanduel: { h2h: [1.95, 1.87], spreads: [-3.5, 2.05, 1.8], totals: [45.5, 1.87, 1.95] }, pinnacle: { h2h: [2.1, 1.8], spreads: [-3, 1.95, 1.95], totals: [45.5, 1.95, 1.95] } }));
  assert.deepEqual(l.h2h.prices, { home: -110, away: -110 }, "the Book's own");
  assert.deepEqual(l.h2h.best, { home: { odds: -105, book: 'fd' }, away: { odds: -110, book: 'dk' } }, 'Pinnacle never the price');
  assert.deepEqual(l.spreads.best.home, { odds: -110, book: 'dk' }, "FanDuel's other line (-3.5) left out");
  assert.deepEqual(l.totals.best.under, { odds: -105, book: 'fd' });
  assert.ok(Math.abs(l.h2h.fair - 1 / 2.1 / (1 / 2.1 + 1 / 1.8)) < 1e-9, "the fair Pinnacle's no-vig, not the best pair's");
  // (the desk prices the side at the best, keeps the Book's own as dk for the fair and the residual's inputs; ESPN's board none)
  const lines = { ml: { home: -110, away: -110 }, spread: { home: { line: null, odds: null }, away: { line: null, odds: null } }, total: { line: null, over: null, under: null }, fair: { ml: 0.46 }, best: { ml: l.h2h.best } };
  const [ml] = priceLines({}, { margin: 1, total: 45 }, lines, { sigma: 13, sigmaT: 10 });
  assert.equal(ml.sides[0].odds, -105);
  assert.equal(ml.sides[0].book, 'fd');
  assert.equal(ml.sides[0].dk, -110);
  assert.equal(ml.sides[0].fair, 0.46);
  const [espn] = priceLines({}, { margin: 1, total: 45 }, { ...lines, best: undefined }, { sigma: 13, sigmaT: 10 });
  assert.equal(espn.sides[0].odds, -110);
  assert.equal(espn.sides[0].book, undefined, "ESPN's board: the Book's price, no book claimed");
});

test("D74 live props: each side the best US price at the Book's line, over and under the Book's own for the fair", () => {
  const body = {
    bookmakers: [
      { key: 'draftkings', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'A B', point: 20.5, price: 1.87 }, { name: 'Under', description: 'A B', point: 20.5, price: 1.95 }] }] },
      { key: 'fanduel', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'A B', point: 20.5, price: 1.95 }, { name: 'Under', description: 'A B', point: 20.5, price: 1.87 }] }] },
      { key: 'betmgm', markets: [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'A B', point: 21.5, price: 2.2 }, { name: 'Under', description: 'A B', point: 21.5, price: 1.7 }] }] },
    ],
  };
  const x = propsFromBodies('nba', [body]).get('A B|pts');
  assert.equal(x.over, -115);
  assert.deepEqual(x.best.over, { odds: -105, book: 'fd' });
  assert.deepEqual(x.best.under, { odds: -105, book: 'dk' });
});

test("D74 MMA: the moneyline and the round totals at the best US price, the fair from the Book's own pair", () => {
  const ev = {
    id: 'm',
    home_team: 'A',
    away_team: 'B',
    commence_time: '2026-10-25T02:00:00Z',
    bookmakers: [
      { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: 1.5 }, { name: 'B', price: 2.6 }] }, { key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 1.9 }, { name: 'Under', point: 2.5, price: 1.9 }] }] },
      { key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: 1.5 }, { name: 'B', price: 2.75 }] }, { key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: 1.95 }, { name: 'Under', point: 2.5, price: 1.85 }] }] },
      { key: 'betonlineag', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: 1.6 }, { name: 'B', price: 3.0 }] }] },
    ],
  };
  const l = mmaLinesOf({}, { ev, crossed: false });
  assert.deepEqual(l.dk, { home: -200, away: 160 });
  assert.equal(l.odds.away, 175);
  assert.deepEqual(l.books, { home: 'dk', away: 'fd' }, 'an offshore book never the price');
  assert.equal(mmaPricedFair({ ...l, fair: NaN }, null), mmaPricedFair({ odds: l.dk, fair: NaN }, null), "the fair read off the Book's own pair");
  const t = totalLinesOf(ev);
  assert.equal(t.odds.over, -105);
  assert.equal(t.books.over, 'fd');
  assert.deepEqual(t.dk, { over: -111, under: -111 });
});

test("D74 the replay: the best US price only where the deep history has the other books at the row's own snapshot; else the Book's, and said so", () => {
  const T = Date.parse('2022-10-16T16:00:00Z');
  const deep = {
    snaps: [new Date(T).toISOString()],
    lines: new Map([
      [
        'o1',
        [
          { ts: T - 864e5, book: 'fd', market: 'h2h', line: null, a: 130, b: -150 },
          { ts: T, book: 'dk', market: 'h2h', line: null, a: 120, b: -140 },
          { ts: T, book: 'czr', market: 'spreads', line: -3, a: -105, b: -115 },
        ],
      ],
    ]),
  };
  const rows = [
    { event: 'g1', market: 'ml', line: null, at: T + 5 * 6e4, overOdds: 120, underOdds: -140 },
    { event: 'g1', market: 'ml', line: null, at: T + SHOP_TOL + 6e4, overOdds: 120, underOdds: -140 },
    { event: 'g1', market: 'spread', line: -3.5, at: T, overOdds: -110, underOdds: -110 },
  ];
  const s = shopRows(rows, deep, () => 'o1');
  assert.deepEqual(rows[0].shop, { over: 130, overBook: 'fd', under: -140, underBook: 'dk', n: 2 }, "FanDuel's price as it stood at the snapshot (change-only rows)");
  assert.equal(rows[1].shop, undefined, "a snapshot further than SHOP_TOL: the Book's");
  assert.equal(rows[2].shop, undefined, 'another line: none');
  assert.deepEqual(s, { shopped: 1, better: 1 });
  const crossed = [{ event: 'g1', market: 'ml', line: null, at: T, overOdds: -140, underOdds: 120, crossed: true }];
  shopRows(crossed, deep, () => 'o1');
  assert.deepEqual([crossed[0].shop.over, crossed[0].shop.under], [-140, 130], 'an MMA row on the other frame read swapped');
  assert.match(PRICE_NOTE, /best US book's price.*else the Book's own/);
});

test("D74 the board: a side shows its best price and its book (pb); ESPN's board none", () => {
  const markets = [{ market: 'ml', sides: [{ side: 'home', line: null, odds: -105, dk: -110, book: 'fd', model: 0.55, fair: 0.5 }, { side: 'away', line: null, odds: -110, dk: -110, book: 'dk', model: 0.45, fair: 0.5 }] }];
  const k = boardMarkets(markets, () => 0.5);
  assert.equal(k.ml[0].o, -105);
  assert.equal(k.ml[0].pb, 'fd');
  assert.equal(k.ml[1].pb, 'dk');
  const espn = boardMarkets([{ market: 'ml', sides: markets[0].sides.map(({ dk, book, ...s }) => ({ ...s, odds: dk })) }], () => 0.5);
  assert.equal(espn.ml[0].pb, undefined);
});

// ---- D75: the props' fit walk-forward by season ----
test("D75 the props' replay is walk-forward: each season priced under settings searched on the seasons before it alone; the first row season only a base; GATE_PROPS_WF=0 the old in-sample way", async () => {
  const G = await import('../libs/ranker/scripts/model/gate.mjs');
  assert.equal(G.PROPS_WF, true, 'walk-forward is the default');
  assert.equal(G.PROPS_WF_BACK, 1);
  const rows = (seasons) => seasons.map((season) => ({ season }));
  assert.deepEqual(G.wfSeasons(rows([2022, 2023, 2024]), [2023, 2024]), [2023, 2024], 'the warm-up season never priced');
  assert.deepEqual(G.wfSeasons(rows([2023, 2024]), [2023]), [2024], 'the first row season has nothing before it: not priced');
  assert.deepEqual(G.wfSeasons(rows([2016, 2020, 2023, 2026]), [2023, 2025]), [2023, 2026]);
  assert.deepEqual(G.wfSeasons(rows([2025, 2026]), [], 2026), [2026], "the ledger's current season alone");
  assert.deepEqual(G.wfSeasons(rows([2026]), [2026]), []);
  const src = fs.readFileSync(new URL('../libs/ranker/scripts/model/gate.mjs', import.meta.url), 'utf8');
  // (the fit's rows are the seasons before S only; the pricing pass reuses those settings, never searches)
  assert.match(src, /const before = rows\.filter\(\(r\) => r\.season < S\);/);
  assert.match(src, /fitProps\(sport, before, expPts, info, facts, market, totals, listed, null, null\)/);
  assert.match(src, /emit\(V\.props\.fitProps\(sport, upTo, expPts, info, facts, market, totals, listed, soft, reuse\), upTo, S\)/);
  // (a walk-forward record's fingerprint passes the guard's fit checks on its own fits, not the desk's saved one)
  const next = { sport: 'nhl', fit: { wf: true, code: 'abc', expected: 'abc', seasons: ['2024:1000'], stats: ['sog'], want: 3 }, context: { facts: true, on: true, failed: [] }, files: { state: true, backtest: 5 } };
  const g = G.recordGuard(next, null);
  assert.deepEqual(g.hard, []);
  const decisions = fs.readFileSync(new URL('../libs/ranker/scripts/model/DECISIONS.md', import.meta.url), 'utf8');
  assert.ok(decisions.includes('### D75.'));
});

// ---- D76: the shopped-price guard ----
test('D76 the shopped-price guard: a side that clears only at another book needs the month\'s minimum return there, picked walk-forward, else the practice stake; NFL on', async () => {
  const B = await import('../libs/ranker/scripts/model/best-price.mjs');
  assert.ok(B.SHOP_GUARD.has('nfl'));
  assert.deepEqual(B.SHOP_GRID, [0, 0.01, 0.02, 0.03, 0.04, 0.06, Infinity]);
  assert.equal(B.SHOP_MIN_N, 30);
  // (shop-only: no return at DraftKings' price, some at the shopped one; DraftKings' own book never)
  assert.equal(B.shopOnly(0.52, -105, -115, 'fd'), true);
  assert.equal(B.shopOnly(0.56, -105, -110, 'fd'), false, 'clears at DraftKings too');
  assert.equal(B.shopOnly(0.52, -105, -115, 'dk'), false);
  assert.equal(B.shopOnly(0.5, -105, -115, 'fd'), false, 'no return at the shopped price either');
  // (the T: under SHOP_MIN_N none; the grid's T whose bets under it lost the most; none lost, 0)
  const lose = (ev, n) => Array.from({ length: n }, () => ({ ev, flat: -1 }));
  const win = (ev, n) => Array.from({ length: n }, () => ({ ev, flat: 0.95 }));
  assert.equal(B.shopT(lose(0.005, 10)), 0);
  assert.equal(B.shopT([...lose(0.005, 30), ...win(0.05, 30)]), 0.01);
  assert.equal(B.shopT(win(0.005, 40)), 0);
  assert.equal(B.shopT([...lose(0.005, 30), ...lose(0.08, 30)]), Infinity, "every shop-only bet lost: clear at DraftKings too");
  // (walk-forward: a month's T from the bets settled before it began, never its own)
  const T0 = Date.UTC(2025, 8, 15);
  const sept = lose(0.005, 40).map((x, i) => ({ ...x, t: T0 + i * 6e4, at: T0 + i * 6e4 - 36e5 }));
  const w = B.walkShopGuard(sept);
  assert.equal(w.at(T0), 0, "September's own losses don't move September's rule");
  assert.equal(w.at(Date.UTC(2025, 9, 2)), 0.01);
  // (live: the pick's side at its chance; guarded under T, the why naming the shopped book and D76)
  const pick = { p: 0.52, odds: -105, dk: -115, book: 'fd', ev: 0.52 * (1 + 100 / 105) - 1 };
  const v = B.shopGuardOf(pick, 0.02);
  assert.equal(v.guarded, true);
  assert.match(v.why, /FanDuel.*D76.*practice stake/);
  assert.equal(B.shopGuardOf(pick, 0).guarded, false);
  assert.equal(B.shopGuardOf({ ...pick, dk: -105, book: 'dk' }, Infinity).guarded, false, "DraftKings' own price: never guarded");
  assert.equal(B.shopTOf({ flags: { shopGuard: { next: 'dk' } } }), Infinity);
  assert.equal(B.shopTOf({ flags: { shopGuard: { next: 0.02 } } }), 0.02);
  assert.equal(B.shopTOf(null), null);
  // (the replay shrinks such a bet to the practice stake, a LIKE held through the tiers, never off)
  const rr = fs.readFileSync(new URL('../libs/ranker/scripts/model/replay-record.mjs', import.meta.url), 'utf8');
  assert.match(rr, /Object\.assign\(b, \{ units: practiceUnits, band: 'medium', profit, shopGuard: true \}\)/);
  assert.match(rr, /hold\.get\(b\)\.barred = true/);
  const run = fs.readFileSync(new URL('../libs/ranker/scripts/model/run.mjs', import.meta.url), 'utf8');
  assert.match(run, /const practice = !gate\?\.on \|\| shopG\.guarded;/);
});

// ---- D77: the news lag read from prices alone, measured and held ----
test('D77 the price-only news lag held: newsLag stays live-only with no prior, no price trigger on the desk, the NBA tag only while the star\'s prop is posted', async () => {
  const L = await import('../libs/ranker/scripts/model/news-lag.mjs');
  const R = await import('../libs/ranker/scripts/model/reasons.mjs');
  assert.ok(R.isLive('newsLag'), 'newsLag earns on its live record only');
  assert.ok(R.isLive('newsLag:pts'));
  // (the detection is the injury report's: no star counted out because his prop left the board)
  const game = { id: 'g7', home: '1', away: '2', date: '2026-10-21T23:30:00Z' };
  const row = (id, name, line, team = '1') => ({ athlete: { id, name, team }, stat: { key: 'pts' }, line, prices: { over: -110, under: -110 } });
  const state = { games: {} };
  const t0 = Date.parse('2026-10-21T12:00:00Z');
  L.lagUpdate(state, { sport: 'nba', game, board: [row('s', 'Star', 27.5), row('m', 'Mate', 14.5), row('b', 'Bench', 6.5)], injuries: new Map(), now: t0 });
  const outs = L.lagUpdate(state, { sport: 'nba', game, board: [row('m', 'Mate', 14.5), row('b', 'Bench', 6.5)], injuries: new Map(), now: t0 + 36e5 });
  assert.deepEqual(outs, [], 'a pulled prop alone is no news');
  const src = fs.readFileSync(new URL('../libs/ranker/scripts/model/news-lag.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(sport === 'nba' && !\(board \?\? \[\]\)\.some\(\(p\) => String\(p\.athlete\?\.id\) === String\(o\.id\) && p\.prices\)\) continue;/);
  const decisions = fs.readFileSync(new URL('../libs/ranker/scripts/model/DECISIONS.md', import.meta.url), 'utf8');
  assert.ok(decisions.includes('### D77.'));
});

// ---- D78: the props' four pieces measured and held; the play-by-play aggregates ----
test('D78 the props pieces held (no new context term), the play-by-play aggregates committed small and documented, the bettor reading none of them', async () => {
  const P = await import('../libs/ranker/scripts/model/props.mjs');
  for (const k of ['oppEpa', 'oppEpaPass', 'dudRate', 'blowMix', 'fatigue7', 'onOff', 'zoneMatch']) assert.equal(P.CTX[k], undefined, `${k} not a props term (D78 held)`);
  const root = new URL('../', import.meta.url);
  let bytes = 0;
  for (const sport of ['nfl', 'nba']) {
    const dir = new URL(`apps/${sport}/scripts/pbp/`, root);
    const readme = fs.readFileSync(new URL('README.md', dir), 'utf8');
    const files = fs.readdirSync(new URL('data/', dir)).filter((f) => /^\d{4}\.json$/.test(f));
    assert.ok(files.length >= 4, `${sport}: seasons built`);
    for (const f of files) {
      const buf = fs.readFileSync(new URL(`data/${f}`, dir));
      bytes += buf.length;
      const d = JSON.parse(buf);
      assert.equal(d.sport, sport);
      assert.ok(Array.isArray(d.players) && Array.isArray(d.teams));
      // (every field a player carries is listed in the README)
      for (const p of d.players.slice(0, 50)) for (const [k, v] of Object.entries(p)) {
        assert.ok(readme.includes(`\`${k}\``), `${sport} README lists ${k}`);
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const kk of Object.keys(v)) assert.ok(readme.includes(`\`${kk}\``) || readme.includes(kk), `${sport} README lists ${k}.${kk}`);
      }
    }
  }
  assert.ok(bytes < 20 * 1024 * 1024, `the committed aggregates stay under 20 MB (${bytes})`);
  // (the bettor reads none of them: no model script imports or names the pbp folders)
  const mdir = new URL('libs/ranker/scripts/model/', root);
  for (const f of fs.readdirSync(mdir).filter((x) => x.endsWith('.mjs'))) assert.ok(!/scripts\/pbp/.test(fs.readFileSync(new URL(f, mdir), 'utf8')), `${f} doesn't read the pbp aggregates`);
  const ignore = fs.readFileSync(new URL('.gitignore', root), 'utf8');
  assert.match(ignore, /^\.cache\/$/m, 'the raw play-by-play stays in the ignored cache');
  const decisions = fs.readFileSync(new URL('libs/ranker/scripts/model/DECISIONS.md', root), 'utf8');
  assert.ok(decisions.includes('### D78.'));
});

test('D79 the Bot\'s own consistent losers: a stat and side (or a line market and side) whose own earlier bets lost past the shrunk bar stakes the practice stake, still bets, still counts; walk-forward in the replay; no team, player or type term', async () => {
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  const RR = await import('../libs/ranker/scripts/model/replay-record.mjs');
  assert.equal(D.OWN_K, 20);
  assert.equal(D.OWN_THR, -0.1);
  assert.equal(D.OWN_MIN, 10);
  assert.deepEqual(D.OWN_BAR_SPORTS, ['nba', 'nhl', 'nfl', 'mlb']);
  assert.equal(D.ownKey('prop', 'reb', 'over'), 'prop:reb:over');
  assert.equal(D.ownKey('ml', 'ml', 'home'), 'ml:home');
  // (the shrunk bar: 10 straight losses (-10 / 30) held; 9 not yet; a winning key never)
  assert.equal(D.ownVerdict(10, -10).held, true);
  assert.equal(D.ownVerdict(9, -9).held, false);
  assert.equal(D.ownVerdict(100, -11).held, false);
  assert.equal(D.ownVerdict(100, -12).held, true);
  assert.equal(D.ownVerdict(50, 5).held, false);
  // (live: the file pooled with the ledger since the epoch; a held key gates to the practice stake, never off)
  const file = { keys: { 'prop:reb:over': { n: 40, sum: -8 } } };
  const ep = '2026-10-01T00:00:00Z';
  const lost = (i) => ({ sport: 'nba', market: 'prop', propType: 'reb', side: 'over', odds: -110, status: 'lost', units: 1, intent: 'edge', placedAt: `2026-10-0${2 + (i % 7)}T12:00:00Z` });
  const bar = D.ownBarOf(file, Array.from({ length: 6 }, (_, i) => lost(i)), 'nba', ep);
  assert.equal(bar['prop:reb:over'].n, 46);
  assert.equal(bar['prop:reb:over'].held, true);
  const g = D.ownBarGate(bar, 'nba', 'prop:reb:over');
  assert.equal(g.on, false);
  assert.equal(D.gatedPlacement(0.05, 1, g).units, D.PRACTICE_UNITS);
  assert.equal(D.ownBarGate(bar, 'nba', 'prop:reb:under'), null);
  assert.equal(D.ownBarGate(bar, 'mma', 'prop:reb:over'), null);
  // (the replay's walk: only bets settled before the bet's placement count; a held bet keeps betting at the practice stake)
  const t0 = Date.parse('2025-01-01T00:00:00Z');
  const bets = Array.from({ length: 14 }, (_, i) => ({ id: `b${i}`, market: 'prop', stat: 'reb', side: 'over', t: t0 + i * 864e5, at: t0 + i * 864e5 - 36e5, odds: -110, res: 'L', units: 1, profit: -1, band: 'medium' }));
  const flags = {};
  RR.ownBar(bets, { verdict: D.ownVerdict, key: D.ownKey, practiceUnits: 0.5, flags });
  assert.equal(bets[9].units, 1, 'the 10th bet sees 9 settled: not held');
  assert.equal(bets[10].units, 0.5, 'the 11th sees 10 losses: held');
  assert.equal(bets[10].profit, -0.5);
  assert.equal(flags.ownBar.held, 4);
  assert.deepEqual(flags.ownBar.keys['prop:reb:over'], { n: 14, sum: -14 });
  const src = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/replay-record.mjs'), 'utf8');
  assert.ok(src.includes('V.desk.ownBarOn?.(sport)'));
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D79.'));
});

// ---- D82: the experience weighting (the NBA's) and the against-own-lean guard (NFL, NHL) ----
test('D82 young players: seasons played tagged, the prior weight cut by the walk-forward table (NBA), never during the search; the against-own-lean guard at the practice stake', async () => {
  const E = await import('../libs/ranker/scripts/model/experience.mjs');
  const P = await import('../libs/ranker/scripts/model/project.mjs');
  const L = await import('../libs/ranker/scripts/model/lean.mjs');
  const A = await import('../libs/ranker/scripts/model/anchor.mjs');
  const Y = await import('../libs/ranker/scripts/model/young-fit.mjs');
  // (seasons played: the rows' first season (after the rows' own first), the NFL's rookie season; unknown a veteran)
  const rows = [{ pid: 'a', season: 2024 }, { pid: 'a', season: 2026 }, { pid: 'b', season: 2025 }, { pid: 'b', season: 2026 }, { pid: 'c', season: 2026 }];
  E.tagExperience('zz', rows);
  assert.deepEqual(rows.map((r) => r.yrs), [null, null, 0, 1, 0]);
  assert.equal(E.yrsOf('zz', 'b', 2027), 2);
  const nfl = [{ pid: 'q', season: 2025, draft: { year: 2024 } }];
  E.tagExperience('nfl', nfl);
  assert.equal(nfl[0].yrs, 1);
  assert.deepEqual([0, 1, 2, 3, null].map(E.expBucket), ['r', 'y2', 'y3', 'v', 'v']);
  // (the table: a season's own cell, '*' only for a season the walk hasn't reached; the knobs never set from the env here)
  const dumps = { id: [], k0x5w0: [] };
  assert.equal(Y.knobOf('k0.5w0')[0], 0.5);
  assert.equal(Y.knobOf('id')[1], 0);
  const mk = (c, l) => Array.from({ length: 400 }, (_, i) => ['pts', `p${i}`, i, 2024, l, 0]);
  const pick = Y.pickYoung({ id: mk('id', 1), 'k0.5w0': mk('k', 0.9) });
  assert.deepEqual(pick.table.pts[2024].r, [1, 0], 'nothing before 2024: the model as it is');
  assert.deepEqual(pick.table.pts['*'].r, [0.5, 0]);
  void dumps;
  assert.equal(typeof P.setYoung, 'function');
  const young = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../apps/nba/src/StaticData/model/young.json'), 'utf8'));
  for (const st of Object.keys(young.table)) for (const S of young.seasons) for (const b of ['r', 'y2', 'y3']) assert.ok(Array.isArray(young.table[st][S]?.[b]), `${st} ${S} ${b} written`);
  for (const sp of ['nhl', 'nfl', 'mlb']) assert.equal(fs.existsSync(path.join(import.meta.dirname, `../apps/${sp}/src/StaticData/model/young.json`)), false, `${sp} held (D82)`);
  const gate = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/gate.mjs'), 'utf8');
  assert.ok(/setYoung\(false\);\n\s+fits = V\.props\.fitProps\(sport, before/.test(gate.replace(/\r\n/g, '\n')), 'the search runs without the table');
  // (the anchor's pull for a young player: as the stat's unless the fit carries a multiplier (none shipped))
  assert.deepEqual(A.anchorEntry({ stats: { sog: { pull: 0.7, d: 0 } } }, 'sog', 1), { pull: 0.7, d: 0 });
  // (the lean guard: under one half by more than d, the practice stake; the walk's d from bets settled before the month)
  assert.deepEqual([...L.LEAN_SPORTS].sort(), ['nfl']);
  assert.equal(L.leanGuardOf(0.4503, 0.02).guarded, true, "Schaefer's under: his own 45% on the side");
  assert.equal(L.leanGuardOf(0.49, 0.02).guarded, false);
  assert.equal(L.leanGuardOf(0.3, null).guarded, false);
  assert.equal(L.leanD(Array.from({ length: 29 }, () => ({ g: -0.1, flat: -1 }))), null, 'under 30: no guard');
  assert.equal(L.leanD(Array.from({ length: 40 }, () => ({ g: -0.03, flat: -1 }))), 0, 'the shallowest d that loses as much');
  assert.equal(L.leanD(Array.from({ length: 40 }, () => ({ g: -0.03, flat: 1 }))), null, 'they won: no guard');
  const t0 = Date.parse('2026-01-15T00:00:00Z');
  const w = L.walkLean(Array.from({ length: 40 }, (_, i) => ({ g: -0.03, flat: -1, t: t0 + i * 36e5, at: t0 })));
  assert.equal(w.at(t0), null, "January's d reads nothing settled in January");
  assert.equal(w.at(Date.parse('2026-02-02T00:00:00Z')), 0);
  const rr = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/replay-record.mjs'), 'utf8');
  assert.ok(rr.includes('leanGuard: true') && rr.includes('LEAN.leanOn?.(sport)'));
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D82.'));
});

test('D83 weight misses: the table from the weigh-in notes, missW a soft term, a price seen before the weigh-ins reads the chance without it, the live weigh-ins read off the results article', async () => {
  const W = await import('../libs/ranker/scripts/model/weight-misses.mjs');
  const WI = await import('../libs/ranker/scripts/model/weigh-ins.mjs');
  const FM = await import('../libs/ranker/scripts/model/fights-model.mjs');
  const GM = await import('../libs/ranker/scripts/model/gate-mma.mjs');
  assert.equal(W.poundsOver('weighed in at 147.5 pounds, one and a half pounds over the featherweight limit'), 1.5);
  assert.equal(W.poundsOver('weighed in at 138.5 pounds, 2.5 pounds over the limit'), 2.5);
  assert.equal(W.poundsOver('half a pound over the limit'), 0.5);
  const card = [{ id: '1', name: 'Luana Santos' }, { id: '2', name: 'Jesus Santos Aguilar' }, { id: '3', name: 'Chris Padilla' }, { id: '4', name: 'Darren Stewart' }];
  assert.deepEqual(W.missersIn('At the weigh-ins, Jesús Santos Aguilar weighed in at 127.5 pounds, one and a half pounds over', card).map((f) => f.id), ['2'], 'a surname inside another name is not her');
  assert.deepEqual(W.missersIn('At the weigh-ins, Padilla weighed in at 158 pounds, two pounds over the limit', card).map((f) => f.id), ['3']);
  assert.deepEqual(W.missersIn('Winn was fined 20% of his purse, which went to his opponent Darren Stewart', card).map((f) => f.id), [], "the fine's recipient is not a misser");
  // (live: the results article's starred weight and its note)
  const bouts = [{ id: '9', home: { id: 'a', name: 'Iasmin Lucindo' }, away: { id: 'b', name: 'Nicolle Caliari' } }];
  assert.deepEqual(WI.missesIn('Iasmin Lucindo (115) vs. Nicolle Caliari (120.5)* *Caliari missed weight', bouts).map((m) => [m.fighter, m.lbs]), [['b', 120.5]]);
  assert.deepEqual(WI.missesIn('Iasmin Lucindo (115) vs. Nicolle Caliari (116)', bouts), []);
  assert.equal(WI.MISS_WINDOW_H, 48);
  // (the term: soft like every other, A's miss less B's, in TERMS unless FIGHT_MISS=0)
  assert.ok(FM.TERM_KEYS.includes('missW'));
  const side = (missed) => FM.sideNumbers(FM.freshFighter(), { r: 1500, rd: 100 }, null, null, Date.parse('2026-01-01'), 155, { missed });
  assert.equal(FM.featuresOf(side(true), side(false)).missW, 1);
  assert.equal(FM.featuresOf(side(false), side(true)).missW, -1);
  assert.equal(FM.featuresOf(side(false), side(false)).missW, 0);
  // (no look-ahead: a price more than 24 hours out reads the chance without the miss)
  assert.equal(GM.MISS_KNOWN_H, 24);
  const gm = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/gate-mma.mjs'), 'utf8');
  assert.ok(gm.includes('start - seenAt > MISS_KNOWN_H * 36e5) ? c.pre : c.p'), 'the history rows');
  assert.ok(gm.includes('lead > MISS_KNOWN_H) ? c.pre : c.p'), 'the ledger rows');
  const t = JSON.parse(fs.readFileSync(FM.WEIGHT_MISS_FILE, 'utf8'));
  assert.ok(t.rows.length >= 200, 'the table kept');
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D83.'));
});

test("D84 win patterns: staged in the band lab only, the owner's 2% Kelly floor by default, never read by the desk", async () => {
  const BL = await import('../libs/ranker/scripts/model/band-lab.mjs');
  const v = BL.readVariants();
  for (const k of ['pattern', 'pattern-love', 'pattern-strict', 'pattern-place']) assert.equal(v[k]?.mode, 'pattern', k);
  for (const k of ['pattern', 'pattern-love', 'pattern-strict', 'pattern-place']) assert.equal(v[k].kelly, undefined, `${k} at the default floor`);
  const lab = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/band-lab.mjs'), 'utf8');
  assert.ok(lab.includes('b.kelly >= (variant.kelly ?? 0.02)'), 'the default Kelly floor is the owner\'s 2%');
  for (const f of ['run.mjs', 'desk.mjs', 'replay-record.mjs', 'picks.mjs']) assert.ok(!fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model', f), 'utf8').includes("from './patterns.mjs'"), `${f} doesn't read the patterns (none shipped)`);
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D87.'));
});

test('D86 the history audit re-records, never changes a rule; the gate vetoes a candidate worse on the newest seasons', async () => {
  const GS = await import('../libs/ranker/scripts/model/gate-score.mjs');
  assert.deepEqual(GS.RECENT_MIN, { props: 200, lines: 40 });
  const veto = [{ layer: 'props', season: 2025, which: 'complete', rows: 900, diff: 0.002, lo: 0.001, hi: 0.003, verdict: 'worse' }];
  assert.equal(GS.sportVerdict({ proj: {}, bet: {}, recent: veto }).pass, false);
  assert.equal(GS.sportVerdict({ proj: {}, bet: {}, recent: [{ ...veto[0], verdict: 'tie' }] }).pass, true);
  const audit = fs.readFileSync(path.join(import.meta.dirname, '../scripts/history-audit.mjs'), 'utf8');
  assert.ok(!audit.includes('--accept-inputs'), 'the audit never overrides the record guard');
  assert.ok(!audit.includes('run.mjs'), 'the audit never runs the live bettor');
  assert.ok(audit.includes("'--score-only', 'worktree', '--record', sport"), 'one sport a record');
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D86.'));
});

test('D88 the weekly self-tune: a fixed menu, one change a sport a week as data (tuned.json), the epoch only for a pricing knob; the props fit kept stable', async () => {
  const TU = await import('../libs/ranker/scripts/model/tuned.mjs');
  const ST = await import('../libs/ranker/scripts/model/self-tune.mjs');
  const G = await import('../libs/ranker/scripts/model/gate.mjs');
  assert.equal(TU.KNOBS.beatBar.def, 0.525);
  assert.equal(TU.KNOBS.ownThr.def, -0.1);
  for (const [n, k] of Object.entries(TU.KNOBS)) for (const v of k.grid) assert.ok(TU.inBounds(n, v), `${n} ${v}`);
  assert.deepEqual([ST.HOLDOUT_DAYS, ST.CHOOSE_Z, ST.COOLDOWN_DAYS, ST.WEEK_DAYS, ST.RECENT_BETS], [56, 1, 28, 6, 100]);
  assert.equal(G.FIT_STABLE_K, 1);
  const audit = fs.readFileSync(path.join(import.meta.dirname, '../scripts/history-audit.mjs'), 'utf8');
  assert.ok(audit.includes("RECORD_TRIGGER: 'tune'"), 'a changed sport re-recorded');
  assert.ok(!audit.includes('--accept-inputs'));
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D88.'));
});

test('D89 injury news on a player who matters alone re-prices and kicks the watcher: Stewart-like (no games this season) ignored, a starter not', async () => {
  const T = await import('../libs/ranker/scripts/model/timing.mjs');
  const W = await import('../scripts/desk-watch.mjs');
  assert.deepEqual([T.MATTERS.nba, T.MATTERS.nhl, T.MATTERS.nfl, T.MATTER_GAMES, T.MATTER_QB_ATT], [10, 10, 0.25, 4, 10]);
  const row = (pid, season, team, game, date, s) => ({ pid, name: pid, season, team, game, date, s });
  // (MEM (29) has played this season; the starter 30 minutes, the bench 5, Stewart only last season's 30; UTAH (26) not yet)
  const rows = [
    row('star', 2027, '29', 'g1', '2026-10-22', { min: 30 }),
    row('bench', 2027, '29', 'g1', '2026-10-22', { min: 5 }),
    row('stewart', 2026, '8', 'p1', '2026-04-10', { min: 30 }),
    row('vet', 2026, '26', 'p2', '2026-04-10', { min: 25 }),
  ];
  const m = T.whoMatters(rows, 'nba');
  assert.equal(m.season, 2027);
  assert.ok(T.matters(m, 'star', '29'));
  assert.ok(!T.matters(m, 'bench', '29'), 'under the bar');
  assert.ok(!T.matters(m, 'stewart', '29'), 'no games this season, his team has played');
  assert.ok(!T.matters(m, 'nobody', '29'), 'no games either season');
  assert.ok(T.matters(m, 'vet', '26'), 'his team yet to play: last season read');
  assert.ok(T.matters(null, 'anyone', '29'), 'unknown: everyone matters');
  // (a star back from an injury that cost him every game so far: his whole last season against STAR; Stewart-type under it)
  assert.deepEqual([T.STAR, T.STAR_GAMES, T.STAR_GOALIE_STARTS], [{ nba: 25, nhl: 17, nfl: 0.6 }, { nba: 20, nhl: 20, nfl: 6 }, 40]);
  const season = (pid, n, s, pos) => Array.from({ length: n }, (_, i) => ({ ...row(pid, 2026, '29', `G${i}`, `2026-0${1 + (i % 4)}-${10 + (i % 18)}`, s), pos }));
  const ms = T.whoMatters([...rows, ...season('returning', 60, { min: 32 }), ...season('stewart2', 70, { min: 20.8 }), ...season('brief', 5, { min: 34 })], 'nba');
  assert.ok(T.matters(ms, 'returning', '29'), 'a returning star counts');
  assert.ok(!T.matters(ms, 'stewart2', '29'), 'a Stewart-type (20.8 min/g) does not');
  assert.ok(!T.matters(ms, 'brief', '29'), 'too few games last season');
  const hs = [row('x', 2027, '29', 'h0', '2026-10-20', { toi: 15 }), ...season('g1', 45, { toi: 59 }, 'G'), ...season('g2', 30, { toi: 59 }, 'G'), ...season('d1', 70, { toi: 21 }, 'D'), ...season('f3', 70, { toi: 13 }, 'F')];
  const mhs = T.whoMatters(hs, 'nhl');
  assert.deepEqual(['g1', 'g2', 'd1', 'f3'].map((id) => T.matters(mhs, id, '29')), [true, false, true, false]);
  const fs2 = [row('x', 2027, '29', 'f0', '2026-10-20', { snaps: 60 }), ...season('te', 15, { snaps: 50 }), ...season('lead', 15, { snaps: 60 }), ...season('qb1', 15, { passAtt: 30, snaps: 60 }), ...season('wr3', 15, { snaps: 30 })];
  const mfs = T.whoMatters(fs2, 'nfl');
  assert.deepEqual(['qb1', 'te', 'wr3'].map((id) => T.matters(mfs, id, '29')), [true, true, false]);
  // (the NFL: a starting QB, a defender by his side's snaps, the unknown (an offensive lineman) matters; NHL by time on ice)
  const nfl = [row('qb', 2026, '1', 'n1', '2026-10-18', { passAtt: 30, snaps: 60 }), row('wr', 2026, '1', 'n1', '2026-10-18', { snaps: 50 }), row('wr4', 2026, '1', 'n1', '2026-10-18', { snaps: 6 })];
  nfl.defense = new Map([['n1|2', [['lb', 'LB', 60], ['dl9', 'DL', 8]]]]);
  const mf = T.whoMatters(nfl, 'nfl');
  assert.deepEqual(['qb', 'wr', 'wr4', 'lb', 'dl9', 'ol'].map((id) => T.matters(mf, id, id === 'lb' || id === 'dl9' ? '2' : '1')), [true, true, false, true, false, true]);
  const mh = T.whoMatters([row('c1', 2027, '5', 'h1', '2026-10-20', { toi: 18 }), row('f4', 2027, '5', 'h1', '2026-10-20', { toi: 7 })], 'nhl');
  assert.deepEqual([T.matters(mh, 'c1', '5'), T.matters(mh, 'f4', '5')], [true, false]);
  // (the re-price: a bet stamped with the lists who matter isn't priced again on Stewart's flips; on the starter's it is)
  const game = { id: 'e1', home: '29', away: '9', homeAbbr: 'MEM', awayAbbr: 'GS', season: 2027 };
  const live = (list) => ({ injuries: new Map([['29', list], ['9', []]]) });
  const stew = (status) => ({ id: 'stewart', name: 'Isaiah Stewart', status });
  const bet = T.inputsOf('nba', game, live([stew('Out')]), null, {}, null, m);
  const flip = T.inputsOf('nba', game, live([stew('Questionable')]), null, {}, null, m);
  assert.deepEqual(T.inputChanges(bet.hash, flip, { game, before: bet.parts, names: flip.names, market: 'ml' }), []);
  assert.ok(T.inputChanges(bet.hash, flip, { game, before: bet.parts, market: 'prop' }).length === 0);
  const starOut = T.inputsOf('nba', game, live([stew('Questionable'), { id: 'star', name: 'A Star', status: 'Out' }]), null, {}, null, m);
  assert.deepEqual(T.inputChanges(flip.hash, starOut, { game, before: flip.parts, names: starOut.names, market: 'ml' }).map((c) => c.words), ['MEM out list (+A Star)']);
  // (a bet from before (no om stamped): the whole lists, as it was priced)
  const legacy = Object.fromEntries(Object.entries(bet.hash).filter(([k]) => !/^(om|qm):/.test(k)));
  assert.ok(T.inputChanges(legacy, flip, { game }).length > 0);
  // (the watcher: Stewart's new Out kicks nothing, the starter's does; no matters read, everyone does)
  const NOW = Date.parse('2026-10-23T22:00:00Z');
  const g = { id: 'e1', sport: 'nba', name: 'MEM @ GS', start: NOW + 3 * 3600e3, hours: 3, phase: 'window', lines: true, teams: ['29', '9'], sig: null };
  const first = W.advance(null, { games: { nba: new Map([['e1', g]]) }, injuries: { nba: new Map() } }, NOW);
  const inj = new Map([['29:stewart', { status: 'Out', name: 'Isaiah Stewart', team: '29' }], ['29:star', { status: 'Out', name: 'A Star', team: '29' }]]);
  const keys = (mm) => W.advance(first.state, { games: { nba: new Map([['e1', g]]) }, injuries: { nba: inj }, ...(mm ? { matters: { nba: mm } } : {}) }, NOW + 60e3).added.map((a) => a.key);
  assert.deepEqual(keys(m), ['nba:injury:29:star:Out']);
  assert.deepEqual(keys(null).sort(), ['nba:injury:29:star:Out', 'nba:injury:29:stewart:Out']);
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D89.'));
});

test("D90 the margin rule's held side is tracked, not staked: the owner's exception to D1 for this rule alone; D82's guard unchanged", async () => {
  const L = await import('../libs/ranker/scripts/model/lean.mjs');
  const D = await import('../libs/ranker/scripts/model/desk.mjs');
  assert.equal(L.MARGIN_TRACKS, true);
  assert.equal(D.gatedPlacement(L.marginEdge(true, { held: true }), 1, null).intent, D.TRACK);
  // (D82's against-own-lean guard: still the practice stake)
  assert.match(L.leanGuardOf(0.4, 0.05).why, /the practice stake \(D82\)/);
  const decisions = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D90.'));
  assert.ok(decisions.includes("the Bot doesn't really like it"));
  assert.ok(decisions.includes('**Amended (D90, the owner, 2026-10-24):**'), 'D1 names its one exception');
  const rr = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/scripts/model/replay-record.mjs'), 'utf8');
  assert.ok(rr.includes('passes.push({ x: it.x, sd: it.sd, marginHeld: true })'), 'the replay: a held bet a tracked row in the passes');
  assert.ok(rr.includes('r.sd.edge > 0 && !r.marginHeld'), 'never re-staked as a practice pick');
  assert.ok(!rr.includes('marginHeld: true });\n'), 'never re-staked at the practice stake');
});

// ---- D91: weather by market, compounding absences and fatigue x personnel measured and held ----
test('D91 no gust, wind-direction, compounding-absence or fatigue-interaction term in the game model, the props or the reasons (measured, held)', async () => {
  const C = await import('../libs/ranker/scripts/model/context.mjs');
  const F = await import('../libs/ranker/scripts/model/football.mjs');
  const P = await import('../libs/ranker/scripts/model/props.mjs');
  const R = await import('../libs/ranker/scripts/model/reasons.mjs');
  const held = /gust|alongWind|unitOut|ol2plus|dbOut|wrOut|bigsOut|centersOut|defOut2|twoOut|b2bBackup|b2bShort|penLoad|penLeash|tiredPen/i;
  const keys = [...Object.values(C.TERMS).flat(), ...F.FOOTBALL_TERMS, ...Object.values(C.SCHEDULE_TERMS).flat()].map((t) => t.key);
  for (const k of keys) assert.ok(!held.test(k), `${k}: a D91-held piece isn't a game-model term`);
  for (const k of Object.keys(P.CTX)) assert.ok(!held.test(k), `${k}: a D91-held piece isn't a props term`);
  for (const r of R.REASONS) assert.ok(!held.test(r.id), `${r.id}: a D91-held piece isn't a reason`);
  // (the existing weather terms stay: the NFL's wind and crosswind, MLB's park-oriented wind)
  assert.ok(keys.includes('wind') && keys.includes('crosswind') && keys.includes('windOut') && keys.includes('olChanges') && 'olOut' in P.CTX, 'the linear terms it built on stay');
  const decisions = fs.readFileSync(new URL('../libs/ranker/scripts/model/DECISIONS.md', import.meta.url), 'utf8');
  assert.ok(decisions.includes('### D91.'));
});
