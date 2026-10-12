// The CHECK rule (libs/ranker/scripts/model/checks.mjs shadowOf, 2026-10-12, the owner's "CHECKs should be for
// crazy value, not inappropriate math"): a gap's skip a PASS kept as a shadow, a role's a CHECK only at a model
// Kelly of +10 or more (else a shadow, 'small'), the news's always; the shadows graded but out of everything a
// CHECK acts on (the page, the board's marks, the research, the notes, the re-pricing, the tallies but their own),
// and a shown one that turns a shadow passed, its price frozen. The board and the run judge it alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_KELLY, CHECK_RULE, checkOf, checkSummary, closeChecks, listedCheck, markPlaced, modelKelly, openCheck, PASSED_SHOWN, resolveChecks, shadowOf, upsertCheck } from '../libs/ranker/scripts/model/checks.mjs';
import { checkLearning } from '../libs/ranker/scripts/model/check-learn.mjs';
import { boardProp, buildBoard } from '../libs/ranker/scripts/model/board.mjs';
import { buildPicks, kellyOf } from '../libs/ranker/scripts/model/picks.mjs';
import { researchChecks } from '../libs/ranker/scripts/model/research.mjs';
import { applyNotes } from '../libs/ranker/scripts/model/notes.mjs';

const now = new Date('2026-10-09T12:00:00Z');
const later = (h) => new Date(now.getTime() + h * 3600e3);
const ROLE = { skip: true, kind: 'role', role: 'group-out', why: 'a regular at his position out' };
const GAP = { skip: true, kind: 'gap', why: 'too far from the market' };
const NEWS = { skip: true, kind: 'news', news: 'offense', why: 'news (offense): a new play-caller' };
// (Ty Johnson's receptions under 1.5 at +139: the model's 57.45% against the book's 39.47%)
const prop = (over = {}) => ({ id: '401:prop:rec:9', event: '401', sport: 'nfl', start: '2026-10-10T17:00:00Z', placedAt: '2026-10-09T11:00:00Z', matchup: 'BUF @ NYJ', market: 'prop', propType: 'rec', statLabel: 'Receptions', player: 'Ty Johnson', athlete: 9, team: 2, side: 'under', line: 1.5, odds: 139, otherOdds: -170, model: 0.5745, fair: 0.3947, p: 0.42, ev: 0, units: 0.5, intent: 'action', pick: 'Ty Johnson Under 1.5 Receptions', projection: { mean: 1.48, implied: 2.2, fairOver: 0.6, record: 10.5 }, status: 'open', profit: 0, ...over });

test('shadowOf: the gap a PASS always; a role a CHECK only at a model Kelly of +10 or more; the news always a CHECK', () => {
  assert.deepEqual(CHECK_RULE, { kelly: 0.1 });
  assert.equal(CHECK_KELLY, 0.1);
  // (the model's Kelly: picks.mjs kellyOf at the price and the model's chance)
  assert.equal(modelKelly(139, 0.5745), kellyOf(139, 0.5745));
  assert.ok(modelKelly(139, 0.5745) > 0.26);
  assert.equal(shadowOf({ cause: 'gap', odds: 139, model: 0.5745, fair: 0.3947 }).passAs, 'gap');
  assert.match(shadowOf({ cause: 'gap', odds: 139, model: 0.5745, fair: 0.3947 }).why, /18 points off the book with nothing to explain it/);
  assert.equal(shadowOf({ cause: 'role', odds: 139, model: 0.5745, fair: 0.3947 }), null);
  const small = shadowOf({ cause: 'role', odds: -110, model: 0.55, fair: 0.45 });
  assert.equal(small.passAs, 'small');
  assert.match(small.why, /a \+5\.50 Kelly on the model's own number: under the CHECK bar \(\+10\)/);
  // (no price or chance to judge it by: a shadow, never a confident CHECK)
  assert.equal(shadowOf({ cause: 'role', odds: null, model: 0.7 }).passAs, 'small');
  assert.equal(shadowOf({ cause: 'news', odds: -110, model: 0.51, fair: 0.5 }), null);
  // (at the bar exactly (+100 at 55%: a Kelly of 0.10): a CHECK)
  assert.equal(shadowOf({ cause: 'role', odds: 100, model: 0.55 }), null);
  assert.equal(shadowOf({ cause: 'role', odds: 100, model: 0.549 }).passAs, 'small');
});

test("checkOf: a shadow marked hidden with its passAs and words; a shown one as before", () => {
  const gap = checkOf(prop(), GAP);
  assert.deepEqual([gap.hidden, gap.passAs, gap.cause], [true, 'gap', 'gap']);
  assert.match(gap.passWhy, /usually the model missing something/);
  const small = checkOf(prop({ odds: -110, model: 0.55 }), ROLE);
  assert.deepEqual([small.hidden, small.passAs, small.cause], [true, 'small', 'role']);
  const big = checkOf(prop(), ROLE);
  assert.deepEqual([big.hidden, big.passAs], [undefined, undefined]);
  const news = checkOf(prop({ odds: -110, model: 0.51 }), NEWS);
  assert.equal(news.hidden, undefined);
});

test('a shown CHECK that turns a shadow: passed, its price frozen as shown, shown in that state a while; back over the bar, written as any CHECK', () => {
  const ledger = { bets: [] };
  assert.equal(upsertCheck(ledger, checkOf(prop(), ROLE), now), 'new');
  // (the price moved, its Kelly under the bar: passed, never written over)
  const t1 = later(1);
  assert.equal(upsertCheck(ledger, checkOf(prop({ odds: -110, model: 0.55, placedAt: t1.toISOString() }), ROLE), t1), 'passed');
  const c = ledger.checks[0];
  assert.deepEqual([c.odds, c.model, c.hidden, c.passAs, c.resolved.as, c.passedAt], [139, 0.5745, true, 'small', 'passed', t1.toISOString()]);
  assert.match(c.resolved.why, /under the CHECK bar/);
  // (still a shadow: frozen)
  assert.equal(upsertCheck(ledger, checkOf(prop({ odds: -120, model: 0.56 }), ROLE), later(2)), null);
  assert.equal(ledger.checks[0].odds, 139);
  // (the page lists it in its passed state for PASSED_SHOWN, then not)
  assert.ok(listedCheck(c, later(2)));
  assert.ok(!listedCheck(c, new Date(t1.getTime() + PASSED_SHOWN)));
  // (back over the bar: written again, shown, its passing dropped)
  assert.equal(upsertCheck(ledger, checkOf(prop({ odds: 150 }), ROLE), later(3)), 'updated');
  const back = ledger.checks[0];
  assert.deepEqual([back.odds, back.hidden, back.resolved, back.passedAt], [150, undefined, undefined, undefined]);
  // (a shadow from the start written again as any while it's one: never shown, so never frozen)
  const l2 = { bets: [] };
  upsertCheck(l2, checkOf(prop(), GAP), now);
  assert.equal(upsertCheck(l2, checkOf(prop({ odds: 150 }), GAP), later(1)), 'updated');
  assert.equal(l2.checks[0].odds, 150);
  // (a shadow shown with the same numbers: written again, its hidden mark material)
  const l3 = { bets: [] };
  upsertCheck(l3, { ...checkOf(prop(), ROLE), hidden: true, passAs: 'small' }, now);
  assert.equal(upsertCheck(l3, checkOf(prop(), ROLE), later(1)), 'updated');
  assert.equal(l3.checks[0].hidden, undefined);
});

test('a shadow is never re-priced, bet after all, resolved, researched, a note\'s player, nor marked on the board; closed as any', async () => {
  const shadow = checkOf(prop(), GAP);
  const ledger = { bets: [{ ...prop({ intent: 'edge', units: 1, placedAt: '2026-10-09T14:00:00Z' }) }], checks: [shadow] };
  assert.equal(openCheck(shadow, now), false);
  assert.equal(markPlaced(ledger), 0);
  const n = resolveChecks(ledger, new Map([[shadow.id, 'note']]), { bet: new Set(), closed: new Set() }, now, new Map([[shadow.id, 'held']]));
  assert.deepEqual([n.still, n.held, shadow.resolved], [0, 0, undefined]);
  // (its market priced with no guard skipping it: closed, as any CHECK)
  assert.equal(closeChecks(ledger, new Set([shadow.id]), now), 1);
  // (the research: never asked about; a dry run names none)
  const said = [];
  await researchChecks({ sport: 'nfl', checks: [checkOf(prop(), GAP)], now, env: { CHECK_RESEARCH: '1', ANTHROPIC_API_KEY: 'test' }, dry: true, log: { log: (x) => said.push(x), warn: () => {} } });
  assert.deepEqual(said, []);
  // (the board's marks: a shadow none)
  const board = buildBoard('nfl', { games: new Map([['401', { game: { id: '401', date: '2026-10-10T17:00:00Z', awayAbbr: 'BUF', homeAbbr: 'NYJ', away: 2, home: 20 }, markets: {}, at: 'T' }]]), props: new Map([['401', { rows: [{ n: 'Ty Johnson', id: '9', t: '2', k: 'rec', lb: 'Receptions', l: 1.5, o: [-170, 139], c: 0.4, ks: [0, 0], b: ['low', 'low'], at: 'T' }], whole: true, lines: new Map() }]]), checks: [checkOf(prop(), GAP)], now });
  assert.equal(board.games[0].p[0].bk, undefined);
  // (an owner's note on a shadow's id: its player's team not read off the shadow)
  const live = new Map([['401', { injuries: new Map() }]]);
  const upcoming = [{ game: { id: '401', home: 20, away: 2 } }];
  const notes = new Map([['401:prop:rec:9', { id: '401:prop:rec:9', player: '9', status: 'out' }]]);
  assert.deepEqual(await applyNotes('nfl', live, upcoming, notes, { checks: [checkOf(prop(), GAP)] }), []);
  assert.equal((await applyNotes('nfl', live, upcoming, notes, { checks: [checkOf(prop(), ROLE)] })).length, 1);
});

test('the tallies: a shadow only in its own byPassAs; the learning and its advice the shown ones alone', () => {
  const won = { status: 'won', profit: 1.39 };
  const lost = { status: 'lost', profit: -1 };
  const list = [
    { ...checkOf(prop({ id: 'a' }), ROLE), checkResult: won },
    { ...checkOf(prop({ id: 'b' }), GAP), checkResult: lost },
    { ...checkOf(prop({ id: 'c', odds: -110, model: 0.55 }), ROLE), checkResult: won },
    checkOf(prop({ id: 'd' }), GAP),
  ];
  const s = checkSummary(list);
  assert.deepEqual([s.n, s.won, s.lost], [1, 1, 0]);
  assert.deepEqual(Object.keys(s.byCause), ['role']);
  assert.deepEqual([s.byPassAs.gap.n, s.byPassAs.gap.lost, s.byPassAs.gap.open, s.byPassAs.small.won], [2, 1, 1, 1]);
  const l = checkLearning(list);
  assert.equal(l.graded, 1);
  assert.deepEqual(Object.keys(l.byCause), ['role']);
  assert.deepEqual([l.byPassAs.gap.lost, l.byPassAs.gap.open, l.byPassAs.small.won], [1, 1, 1]);
});

test('buildPicks: the shown CHECKs alone (a passed one a while, in its passed state), the biggest model Kelly first; the rule and the numbers the page leads with', () => {
  const t1 = later(1);
  const passed = { ...checkOf(prop({ id: 'p' }), ROLE), hidden: true, passAs: 'small', passedAt: t1.toISOString(), resolved: { at: t1.toISOString(), as: 'passed', why: 'a +5.50 Kelly on the model\'s own number: under the CHECK bar (+10)' } };
  const ledger = {
    bets: [],
    checks: [checkOf(prop({ id: 'big' }), ROLE), checkOf(prop({ id: 'bigger', odds: 160 }), ROLE), checkOf(prop({ id: 'gap' }), GAP), checkOf(prop({ id: 'small', odds: -110, model: 0.55 }), ROLE), passed],
  };
  const out = buildPicks('nfl', ledger, {}, new Map(), later(2));
  assert.deepEqual(out.checks.map((c) => c.id), ['bigger', 'big', 'p']);
  assert.deepEqual(out.checkRule, CHECK_RULE);
  const big = out.checks.find((c) => c.id === 'big');
  assert.deepEqual([big.checkCause, big.roleReason, big.modelKelly, big.mean, big.implied, big.lineRecord], ['role', 'group-out', modelKelly(139, 0.5745), 1.48, 2.2, { over: 0.6, n: 10.5 }]);
  // (the write-up: the model's Kelly first, then the chances, the means to two decimals, then why)
  assert.match(big.reason, /Would be a \+26\.\d\d Kelly bet on the model's own number \(the under 57% against DraftKings' no-vig 39%\); model 1\.48 vs the book's 2\.20 catches\. Not bet on this side/);
  assert.match(big.risk, /isn't value by itself/);
  const p = out.checks.find((c) => c.id === 'p');
  assert.deepEqual([p.resolved.as, p.level], ['passed', 'check']);
  assert.match(p.resolved.why, /under the CHECK bar/);
  // (past PASSED_SHOWN: gone)
  assert.deepEqual(buildPicks('nfl', ledger, {}, new Map(), new Date(t1.getTime() + PASSED_SHOWN)).checks.map((c) => c.id), ['bigger', 'big']);
});

test('the board and the run judge a prop alike: a check band exactly where the run keeps a shown CHECK', () => {
  for (const odds of [-150, -110, 100, 139]) {
    for (let m = 0.4; m <= 0.75; m += 0.0125) {
      for (const guard of [ROLE, GAP, NEWS]) {
        const x = { prop: { athlete: { id: 9, name: 'Ty Johnson', team: 2 }, stat: { key: 'rec', label: 'Receptions' }, line: 1.5, prices: { over: -170, under: odds } }, side: 'under', odds, model: m, fair: 0.45, guard, sides: [{ side: 'over', odds: -170, p: 0.5, ev: 0 }, { side: 'under', odds, p: 0.5, ev: 0 }] };
        const row = boardProp(x, 'T');
        const c = checkOf(prop({ odds, model: Math.round(m * 1e4) / 1e4, fair: 0.45 }), guard);
        assert.equal(row.b[1] === 'check', !c.hidden, `${guard.kind} ${odds} ${m}`);
      }
    }
  }
});
