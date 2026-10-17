// The desk's weekly self-check (libs/ranker/scripts/model/selfcheck.mjs): free, no AI, pure checks on fixtures
// (no git: the state's history injected as snapshots). A planted under-drift, props losing the close, a context
// term and a trust dropped across the snapshots, a role-depth loss cluster, a stale open book, a guard bug, the
// inputs changed after placement, a selection bias, the CHECKs' advice; every check's shape on an empty desk;
// the output's canonical writing; the Algorithm tab's Self-check panel rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATUSES, TITLES, againstPts, c1, c2, c4, c6, c7, c9, c10, c13, c17, c19, canon, gameMoveOf, guardKind, lastWeekC6, moveWayOf, overBook, selfCheck, spansOf, writeIfChanged, zOf } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { VOID_AFTER } from '../libs/ranker/scripts/model/desk.mjs';
import { loadEngine } from './support/engine.mjs';

const now = new Date('2026-10-12T13:00:00Z');
const H = 36e5;
const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * H).toISOString();
let seq = 0;
// (a graded prop from two days ago, placed the day before; its result from won)
function prop(over = {}, won = true) {
  const id = over.id ?? `401:prop:${over.propType ?? 'pts'}:${++seq}`;
  const p = over.p ?? 0.55;
  return {
    id,
    event: '401',
    sport: 'nhl',
    start: at(50),
    placedAt: at(60),
    gradedAt: at(46),
    matchup: 'SJ @ EDM',
    market: 'prop',
    propType: 'pts',
    statLabel: 'Points',
    player: `Player ${seq}`,
    athlete: String(seq),
    team: '25',
    side: 'over',
    line: 0.5,
    odds: -110,
    model: 0.6,
    fair: 0.5,
    ev: 0.05,
    units: 1,
    intent: 'edge',
    pricesFrom: 'the odds api',
    projection: { mean: 0.8, role: 'C1', applied: { scale: 1 } },
    actual: won ? 1 : 0,
    status: won ? 'won' : 'lost',
    profit: won ? 0.909 : -1,
    pick: `Player ${seq} Over 0.5 Points`,
    weight: 1,
    ...over,
    p,
  };
}
// (n bets, the first k won)
const many = (n, k, over = {}) => Array.from({ length: n }, (_, i) => prop(typeof over === 'function' ? over(i) : over, i < k));
const ctxOf = (bets, extra = {}) => ({ sport: 'nhl', now, ...spansOf(now), bets, teams: {}, state: {}, ...extra });

test('the record against the expected wins: weighted, pushes and voids out', () => {
  const list = [prop({ p: 0.5 }, true), prop({ p: 0.5 }, false), prop({ p: 0.5, weight: 0.3 }, false), { ...prop({ p: 0.5 }), status: 'push' }, { ...prop({ p: 0.5 }, true), void: true }];
  const z = zOf(list);
  assert.equal(z.n, 3);
  assert.equal(z.w, 1);
  assert.equal(z.e, 1.15);
  assert.equal(z.z, Math.round(((1 - 1.15) / Math.sqrt(0.25 * 2.3)) * 1e4) / 1e4);
});

test('a line against its side: a spread more points, an over lower, an under higher; a game move by the home line', () => {
  assert.equal(againstPts('spread', 'away', 1.5, 2.5), 1);
  assert.equal(againstPts('prop', 'over', 10.5, 9.5), 1);
  assert.equal(againstPts('prop', 'under', 10.5, 9.5), -1);
  assert.equal(againstPts('total', 'under', 44, 46), 2);
  // (the home spread up 2 is the market moving away from home)
  assert.deepEqual(gameMoveOf({ market: 'spread', side: 'home', context: { move: { spread: 2, total: 0 } } }, 'nfl'), { pts: 2, limit: 1.5 });
  assert.deepEqual(gameMoveOf({ market: 'total', side: 'over', context: { move: { spread: 0, total: -1 } } }, 'nhl'), { pts: 1, limit: 1 });
  assert.deepEqual(gameMoveOf({ market: 'ml', side: 'away', context: { move: { spread: 0, total: 0, ml: 0.05 } } }, 'nhl'), { pts: 0.05, limit: 0.03 });
  assert.equal(guardKind('line moved -4 since it opened (1.3 of it explained by the context)'), 'line moved');
  assert.equal(guardKind('Alvin Kamara questionable'), 'questionable');
  assert.equal(guardKind('Linus Ullmark expected, not confirmed'), 'starter not confirmed');
});

test('C4: a planted under-drift (40 unders at 60%, 14 won) is a flag, the balanced stat ok', () => {
  const unders = many(40, 14, { side: 'under', p: 0.6, placedAt: at(30), propType: 'pts' });
  const shots = [...many(10, 6, { propType: 'sog', statLabel: 'Shots', side: 'over', placedAt: at(30) }), ...many(10, 5, { propType: 'sog', statLabel: 'Shots', side: 'under', placedAt: at(30) })];
  const c = c4(ctxOf([...unders, ...shots]));
  assert.equal(c.status, 'flag');
  assert.equal(c.rows[0].key, 'pts:under');
  assert.equal(c.rows[0].w, 14);
  assert.equal(c.rows[0].e, 24);
  assert.ok(c.rows[0].z <= -2.5);
  assert.match(c.headline, /^Points Under: 14 won vs 24 expected \(z -3\.23\), 100% of its stat's props, ROI/);
  assert.equal(c.tested, 3);
  assert.deepEqual(c.rows.filter((r) => r.key.startsWith('sog')).map((r) => r.status), ['ok', 'ok']);
});

test('C6: props losing the close are a flag; a mean CLV under -1 point two weeks running too', () => {
  const lost = many(30, 15, (i) => ({ propType: 'sog', clv: { beat: i < 3, prob: i < 3 ? 0.01 : -0.03, ev: -0.08 } }));
  const c = c6(ctxOf(lost));
  assert.equal(c.status, 'flag');
  assert.equal(c.rows[0].key, 'prop:sog');
  assert.equal(c.rows[0].beat, 0.1);
  // (the beat rate fine, the mean CLV under -1 point: a flag only with last week's under it too)
  const drift = many(20, 10, (i) => ({ propType: 'pts', clv: { beat: i % 2 === 0, prob: -0.02, ev: -0.04 } }));
  assert.equal(c6(ctxOf(drift)).status, 'ok');
  const prev = { at: at(7 * 24), checks: [{ id: 'C6', rows: [{ key: 'prop:pts', n: 22, beat: 0.5, prob: -0.015, ev: -0.04 }] }] };
  const again = c6(ctxOf(drift, { prevC6: lastWeekC6(prev, now) }));
  assert.equal(again.status, 'flag');
  assert.equal(again.rows[0].lastWeek.prob, -0.015);
  // (a run again the same week: the file it reads is this week's, its carried rows the ones compared)
  const rerun = { at: at(2), checks: [{ id: 'C6', rows: [{ key: 'prop:pts', prob: 0.02 }] }], prevC6: lastWeekC6(prev, now) };
  assert.equal(lastWeekC6(rerun, now).rows[0].prob, -0.015);
  assert.equal(lastWeekC6({ at: at(2), checks: [] }, now), null);
});

test("C9: a term kept 4 weeks then dropped, and a fitted trust gone to 0, flags across injected snapshots; an untested start's first fit isn't a drop", () => {
  const term = (kept, size = 0.5) => ({ key: 'goalie', label: 'Goalie edge', kept, size: kept ? size : 0 });
  const stateOf = (kept, trust, size) => ({ context: { terms: [term(kept, size), { key: 'rest', label: 'Rest edge', kept: true, size: 1 }] }, trust, props: { types: [{ key: 'sog', label: 'Shots', params: { w: 0, a: 0.5, b: 0.5, c: 0.2, scale: 1.08 } }] } });
  const snaps = [];
  for (let d = 34; d >= 1; d--) {
    const day = new Date(now.getTime() - d * 864e5).toISOString().slice(0, 10);
    snaps.push({ day, state: stateOf(true, { total: { trust: 0.3, fitted: true }, ml: { trust: 0.5, fitted: false } }) });
  }
  const state = {
    ...stateOf(false, { total: { trust: 0, fitted: true }, ml: { trust: 0, fitted: true } }),
    context: { terms: [term(false), { key: 'rest', label: 'Rest edge', kept: true, size: 2 }] },
    props: { types: [{ key: 'sog', label: 'Shots', params: { w: 0, a: 1, b: 0.5, c: 0, scale: 1.08 } }] },
    changelog: [{ at: at(20), what: 'total trust in the model', from: 0.3, to: 0, why: 'best fit to 169 graded total bets' }],
  };
  const c = c9(ctxOf([], { state, snaps }));
  assert.equal(c.status, 'flag');
  const byKey = Object.fromEntries(c.rows.map((r) => [r.key, r]));
  assert.equal(byKey['term:goalie'].what, 'dropped');
  assert.equal(byKey['term:goalie'].status, 'flag');
  assert.ok(byKey['term:goalie'].keptDays >= 21);
  assert.equal(byKey['trust:total'].status, 'flag');
  assert.equal(byKey['trust:ml'], undefined);
  assert.equal(byKey['term:rest'].what, 'size moved half');
  assert.equal(byKey['prop:sog:c'].what, 'term dropped');
  assert.equal(byKey['prop:sog:a'].status, 'info');
  assert.ok(c.rows.some((r) => r.what === 'changelog' && r.why === 'best fit to 169 graded total bets'));
  // (no history: partial, never a guess)
  const none = c9(ctxOf([], { state, snaps: [] }));
  assert.equal(none.status, 'partial');
  assert.ok(none.needs.length);
});

test('C7: a role-depth loss cluster (15 TE2+ props all lost at 60%) is the worst cell, flagged', () => {
  const rest = many(45, 27, (i) => ({ p: 0.6, propType: 'recYds', projection: { mean: 40, role: i % 2 ? 'WR1' : 'RB1' } }));
  const te = many(15, 0, () => ({ p: 0.6, propType: 'recYds', projection: { mean: 30, role: 'TE2+' } }));
  const c = c7(ctxOf([...rest, ...te]));
  assert.equal(c.status, 'flag');
  assert.equal(c.rows[0].key, 'role: TE2+');
  assert.ok(c.rows[0].z <= -3);
  assert.ok(c.tested > 5);
  assert.equal(c.rows.length, 5);
  assert.equal(c.examples.length, 5);
  assert.ok(c.examples.every((id) => te.some((b) => b.id === id)));
});

test('C13: a stale open book (10 open past the gap) and a bet past VOID_AFTER are flags; 4 stale is ok, 5 a watch', () => {
  const future = (n, over = {}) => Array.from({ length: n }, () => ({ ...prop({ start: new Date(now.getTime() + 20 * H).toISOString(), model: 0.8, fair: 0.5, ...over }), status: 'open', profit: 0, gradedAt: undefined }));
  assert.equal(c13(ctxOf(future(4))).status, 'ok');
  assert.equal(c13(ctxOf(future(5))).status, 'watch');
  const c = c13(ctxOf(future(10)));
  assert.equal(c.status, 'flag');
  assert.match(c.headline, /^10 open bets stale \(run the desk with replace\)/);
  const late = { ...prop({ start: new Date(now.getTime() - VOID_AFTER - H).toISOString() }), status: 'open', profit: 0 };
  assert.equal(c13(ctxOf([late])).status, 'flag');
  // (published at LOVE, today's trust 0: the chance falls to the book's, a PASS now)
  const pub = future(1, { model: 0.6, fair: 0.5, p: 0.58, publishedLevel: 'high', odds: -110 });
  const one = c13(ctxOf(pub, { state: { trust: { 'prop:pts': { trust: 0, fitted: true } } } }));
  assert.match(one.rows[0].why[0], /published LOVE, PASS at today's trust/);
});

test('C2: a prop placed past twice the guard limit is a guard bug, a flag', () => {
  const bug = prop({ placedAt: at(30), line: 14.5, context: { move: { open: 10.5, now: 14.5 } } });
  const fine = prop({ placedAt: at(30), line: 10.5, context: { move: { open: 10.5, now: 11.5 } } });
  const c = c2(ctxOf([bug, fine]));
  assert.equal(c.status, 'flag');
  assert.equal(c.rows.find((r) => r.key === 'guard bugs').n, 1);
  assert.deepEqual(c.examples, [bug.id]);
});

test('C1: game bets whose book moved after placement; partial at ok without inputsAtStart, the hash row with it', () => {
  const game = (moved, over = {}) => ({ ...prop({ market: 'total', side: 'over', line: 6, fair: 0.5, seen: { at: at(52), line: moved ? 5.5 : 6, odds: -110, fair: moved ? 0.46 : 0.5 }, ...over }), propType: undefined });
  const all = [...Array.from({ length: 4 }, () => game(true)), ...Array.from({ length: 16 }, () => game(false))];
  const c = c1(ctxOf(all));
  assert.equal(c.status, 'partial');
  assert.equal(c.rows[0].changed, 4);
  assert.ok(c.needs[0].startsWith('inputsAtStart'));
  const flagged = c1(ctxOf([...Array.from({ length: 9 }, () => game(true)), ...Array.from({ length: 11 }, () => game(false))]));
  assert.equal(flagged.status, 'flag');
  assert.ok(flagged.needs);
  const hashed = c1(ctxOf(all.map((b, i) => ({ ...b, inputs: { 'out:h': 'a' }, inputsAtStart: { 'out:h': i < 3 ? 'b' : 'a' } }))));
  assert.equal(hashed.needs, null);
  assert.equal(hashed.rows.at(-1).changed, 3);
});

test("C10: the bets' own Overs projected high three times the all-player bias is a selection flag", () => {
  const state = { props: { types: [{ key: 'sog', label: 'Shots', check: { mae: 1.2 }, allPlayersBias: 0.05 }] } };
  const overs = many(30, 10, () => ({ propType: 'sog', projection: { mean: 3, role: 'F1' }, actual: 2 }));
  const c = c10(ctxOf(overs, { state }));
  assert.equal(c.status, 'flag');
  assert.equal(c.rows[0].selection, 'over');
  assert.equal(c.rows[0].over.bias, 1);
  assert.match(c.headline, /^Shots Overs: the bets projected \+1\.00 off/);
  const plain = c10(ctxOf([], { state: { props: { types: [{ key: 'pts', label: 'Points', check: { mae: 0.7 }, allPlayersBias: 0.2 }] } } }));
  assert.equal(plain.status, 'flag');
  assert.equal(plain.rows[0].r, 0.2857);
});

test("C17: a confirmed blind spot in the CHECKs' advice is a flag; no learning partial", () => {
  const learning = { graded: 14, open: 3, byCause: { 'vacated-fade': { n: 12, won: 2, lost: 10, push: 0, hitRate: 0.17, ci: [0.05, 0.45], breakEven: 0.52, profit: -8.2, perUnit: -0.68 } }, openByCause: { 'vacated-fade': 3 }, recommendations: [{ rank: 1, kind: 'blind-spot', cause: 'vacated-fade', confirmed: true, text: 'Blind spot: Vacated work, the market right' }] };
  const c = c17(ctxOf([], { state: { checks: { learning } } }));
  assert.equal(c.status, 'flag');
  assert.equal(c.headline, 'Blind spot: Vacated work, the market right');
  assert.equal(c.rows[0].open, 3);
  assert.equal(c17(ctxOf([])).status, 'partial');
});

test('every check on an empty desk: all 19, each status allowed, its numbers finite or null, nothing thrown', () => {
  const out = selfCheck({ sport: 'nfl', now, ledger: { bets: [] }, state: {}, snaps: [] });
  assert.equal(out.checks.length, Object.keys(TITLES).length);
  assert.deepEqual(out.window, { from: '2026-10-05', to: '2026-10-12' });
  for (const c of out.checks) {
    assert.ok(STATUSES.includes(c.status), `${c.id}: ${c.status}`);
    assert.notEqual(c.status, 'ok', `${c.id}: ok on nothing`);
    for (const k of ['value', 'n', 'tested']) assert.ok(c[k] === null || Number.isFinite(c[k]), `${c.id}.${k}`);
    assert.equal(typeof c.headline, 'string');
  }
  const total = STATUSES.reduce((t, s) => t + out.summary[s], 0);
  assert.equal(total, out.checks.length);
  // (flags first, then watches, then partial)
  const rank = out.checks.map((c) => STATUSES.indexOf(c.status));
  assert.deepEqual(rank, [...rank].sort((a, b) => a - b));
  assert.equal(out.writeups.calls, 0);
});

test("the output: keys sorted, numbers to 4 places, written only when more than its `at` changed", () => {
  assert.deepEqual(Object.keys(canon({ b: 1, a: { d: 0.123456, c: [1 / 3] } })), ['a', 'b']);
  assert.deepEqual(canon({ a: { d: 0.123456, c: [1 / 3] } }), { a: { c: [0.3333], d: 0.1235 } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfcheck-'));
  const file = path.join(dir, 'selfcheck.json');
  const out = selfCheck({ sport: 'nhl', now, ledger: { bets: many(20, 10, { placedAt: at(30) }) }, state: {}, snaps: [] });
  assert.equal(writeIfChanged(file, out), true);
  assert.equal(writeIfChanged(file, { ...out, at: new Date(now.getTime() + H).toISOString() }), false);
  assert.equal(writeIfChanged(file, { ...out, notes: ['something new'] }), true);
  const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(kept), [...Object.keys(kept)].sort());
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the Algorithm tab's Self-check panel: flags, watches and partial ones shown in order, the rest folded under their counts", async () => {
  const desk = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
  const out = canon(selfCheck({ sport: 'nhl', now, ledger: { bets: [...many(40, 14, { side: 'under', p: 0.6, placedAt: at(30) })] }, state: {}, snaps: [] }));
  const [v] = desk.selfCheckPanelOf([out, null], { nhl: 'NHL' });
  assert.equal(v.label, 'NHL');
  assert.equal(v.week, 'Oct 5-12');
  assert.ok(v.shown.length >= 1);
  assert.equal(v.shown[0].status, 'flag');
  assert.ok(v.shown.every((c) => ['flag', 'watch', 'partial'].includes(c.status)));
  assert.ok(v.folded.every((c) => !['flag', 'watch', 'partial'].includes(c.status)));
  assert.match(v.foldedLine, /too thin/);
  const c4row = v.shown.find((c) => c.id === 'C4');
  assert.equal(c4row.key, 'nhl:C4');
  assert.ok(c4row.columns.includes('z'));
  assert.equal(c4row.cells[0].length, c4row.columns.length);
  assert.equal(desk.weekLabel('2026-09-28', '2026-10-04'), 'Sep 28-Oct 4');
  assert.equal(desk.selfCheckCell('share', 0.4567), '45.7%');
  assert.equal(desk.selfCheckCell('overBook', -0.1116), '-11.2%');
  assert.equal(desk.selfCheckCell('clvProb', 0.004), '0.40%');
  assert.equal(desk.selfCheckCell('clvSe', 0.0011), '0.11%');
  assert.equal(desk.selfCheckCell('n', 12), '12');
  assert.equal(desk.selfCheckCell('dogs', { n: 3, z: -1.234 }), 'n 3 · z -1.23');
  assert.equal(desk.selfCheckCell('x', null), '-');
});

test("C19: a line's move its side's way; the bets moved against doing worse against the book a watch to cut them, and too few a report", () => {
  // (an over's line down a point is against it; under the prop guard's limit (12% of 10.5): not past it)
  assert.deepEqual(moveWayOf({ market: 'prop', side: 'over', line: 9.5, context: { move: { open: 10.5, now: 9.5 } } }, 'nfl'), { way: 'against', pts: 1, past: false });
  assert.deepEqual(moveWayOf({ market: 'prop', side: 'under', line: 4.5, context: { move: { open: 2.5, now: 4.5 } } }, 'nfl'), { way: 'against', pts: 2, past: true });
  assert.equal(moveWayOf({ market: 'prop', side: 'under', line: 2.5, context: { move: { open: 4.5, now: 2.5 } } }, 'nfl').way, 'with');
  assert.equal(moveWayOf({ market: 'prop', side: 'over', line: 2.5, context: { move: { open: null, now: 2.5 } } }, 'nfl'), null);
  assert.deepEqual(moveWayOf({ market: 'spread', side: 'home', context: { move: { spread: 2, total: 0 } } }, 'nfl'), { way: 'against', pts: 2, past: true });
  // (80 moved against, 25 won at the book's even chance; 80 unmoved, 45 won)
  const moved = many(80, 25, { context: { move: { open: 1.5, now: 0.5 } } });
  const still = many(80, 45, { context: { move: { open: 0.5, now: 0.5 } } });
  const c = c19(ctxOf([...moved, ...still]));
  assert.equal(c.id, 'C19');
  assert.equal(c.status, 'watch');
  assert.match(c.headline, /^props: the bets moved against did worse against the book than the rest \(z -3\.16\): cut their stake or pass/);
  const row = c.rows.find((r) => r.key === 'bets props: moved against');
  assert.equal(row.n, 80);
  assert.equal(row.overBook, -0.1875);
  assert.ok(c.rows.find((r) => r.key === 'bets props: unmoved'));
  // (the same split on 20 a side: too few to say, a report)
  const few = c19(ctxOf([...many(20, 4, { context: { move: { open: 1.5, now: 0.5 } } }), ...many(40, 30, { context: { move: { open: 0.5, now: 0.5 } } })]));
  assert.equal(few.status, 'info');
  assert.match(few.headline, /^60 graded \(60 bets, 0 CHECKs\), 20 with a line moved since it opened: no difference/);
  assert.equal(c19(ctxOf([])).status, 'thin');
});

test("C19: a prop's unmoved line read by its kept open price; a premise-broken bet weighted as zOf; a bet placed after its start in neither the buckets nor the split; game lines moved their way doing worse a watch", () => {
  // (the line unmoved: the over's fair chance down 4 points is against an over, with an under; under 2.5 points none; no open price none, unread)
  assert.deepEqual(moveWayOf({ market: 'prop', side: 'over', line: 0.5, context: { move: { open: 0.5, now: 0.5, openFair: 0.55, nowFair: 0.51 } } }, 'nhl'), { way: 'against', pts: 0, past: false, price: true, by: 'price', prob: -0.04 });
  assert.equal(moveWayOf({ market: 'prop', side: 'under', line: 0.5, context: { move: { open: 0.5, now: 0.5, openFair: 0.55, nowFair: 0.51 } } }, 'nhl').way, 'with');
  assert.equal(moveWayOf({ market: 'prop', side: 'over', line: 0.5, context: { move: { open: 0.5, now: 0.5, openFair: 0.55, nowFair: 0.54 } } }, 'nhl').way, 'none');
  assert.deepEqual(moveWayOf({ market: 'prop', side: 'over', line: 0.5, context: { move: { open: 0.5, now: 0.5 } } }, 'nhl'), { way: 'none', pts: 0, past: false, price: false });
  // (a line that moved: the line's way, the price not read)
  assert.equal(moveWayOf({ market: 'prop', side: 'over', line: 1.5, context: { move: { open: 0.5, now: 1.5, openFair: 0.6, nowFair: 0.4 } } }, 'nhl').way, 'with');
  // (the rows: 'unmoved' all, 'unmoved, its price too' the read ones alone)
  const c = c19(ctxOf([...many(10, 5, { context: { move: { open: 0.5, now: 0.5, openFair: 0.5, nowFair: 0.5 } } }), ...many(10, 5, { context: { move: { open: 0.5, now: 0.5 } } }), ...many(10, 5, { context: { move: { open: 0.5, now: 0.5, openFair: 0.55, nowFair: 0.5 } } })]));
  assert.equal(c.rows.find((r) => r.key === 'bets props: unmoved').n, 20);
  assert.equal(c.rows.find((r) => r.key === 'bets props: unmoved, its price too').n, 10);
  assert.equal(c.rows.find((r) => r.key === 'bets props: moved against').n, 10);
  // (overBook weighted: a 0.3 bet won counts 0.3 of a full one)
  const ob = overBook([{ status: 'won', fair: 0.5, weight: 0.3 }, { status: 'lost', fair: 0.5 }]);
  assert.equal(ob.n, 2);
  assert.ok(Math.abs(ob.d - (0.3 * 0.5 - 0.5) / 1.3) < 1e-9);
  // (placed after its start: out of both)
  const t = c19(ctxOf([...many(10, 5), ...many(5, 2, { placedAt: '2026-10-11T20:00:00Z', start: '2026-10-11T18:00:00Z' })]));
  const split = t.rows.find((r) => r.key === 'bets props: 6h or more before, against later');
  const buckets = t.rows.filter((r) => /^bets props: placed/.test(r.key)).reduce((s, r) => s + r.n, 0);
  assert.equal(split.n, buckets);
  assert.equal(split.n, 10);
  assert.match(t.threshold, /record against the book the same way at z 1 or more/);
});

test('C19: the CHECKs graded in their own rows, never in the advice; bets placed early beating the close and the book a watch to bet earlier', () => {
  const checks = many(70, 10, { context: { move: { open: 1.5, now: 0.5 } } }).map((b) => ({ ...b, status: 'check', units: 0, profit: 0, checkResult: { status: b.status, profit: b.profit } }));
  const c = c19(ctxOf(many(70, 40, { context: { move: { open: 0.5, now: 0.5 } } }), { checks }));
  assert.equal(c.status, 'info');
  const row = c.rows.find((r) => r.key === 'CHECKs props: moved against');
  assert.equal(row.n, 70);
  assert.equal(row.roi, Math.round(((10 * 0.909 - 60) / 70) * 1e4) / 1e4);
  // (placed 10 hours before, the close 2 points better, 50 of 80 won; placed 2 hours before, no better, 38 of 80)
  const early = many(80, 50, (i) => ({ clv: { prob: 0.02 + (i % 2 ? 0.01 : -0.01), beat: true } }));
  const late = many(80, 38, (i) => ({ placedAt: at(52), clv: { prob: i % 2 ? 0.01 : -0.01, beat: false } }));
  const t = c19(ctxOf([...early, ...late]));
  assert.equal(t.status, 'watch');
  assert.match(t.headline, /^props: the bets placed 6h or more before the start beat the close more than the later ones \(CLV z 12\.86, the record against the book z 1\.9\): bet earlier$/);
  assert.ok(t.rows.find((r) => r.key === 'bets props: placed 6-12h before'));
  assert.ok(t.rows.find((r) => r.key === 'bets props: placed 0-3h before'));
});
