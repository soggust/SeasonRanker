// The Bot's own time to bet (libs/ranker/scripts/model/lineup-risk.mjs, suggest.mjs, leagues.mjs TIMING; DECISIONS.md
// D42): the windows open the day before for every sport but MMA; before the news is in a prop's lean is held to the
// share that survived to the close for its stat (fit on the priced history, blended with the Bot's own record), and
// it is bet early only where that still clears the price; a fresh quote is bought only when the Bot is about to bet;
// the morning snapshot prices suggestions and never a bet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EDGE_MIN, HOUR_BUCKETS, RISK_K, RISK_MIN, bucketOf, fitLineupRisk, ledgerRisk, readLineupRisk, riskAt, riskChance, riskText, survivalAt } from '../libs/ranker/scripts/model/lineup-risk.mjs';
import { morningPrices, withSnapshot } from '../libs/ranker/scripts/model/suggest.mjs';
import { TIMING } from '../libs/ranker/scripts/model/leagues.mjs';
import { nameKey } from '../libs/ranker/scripts/model/espn.mjs';

const src = (f) => fs.readFileSync(path.resolve('libs/ranker/scripts/model', f), 'utf8');

test('D42 the windows open the day before for every sport but MMA', () => {
  for (const s of ['nfl', 'nba', 'nhl', 'mlb']) {
    assert.equal(TIMING[s].lines, 26, `${s} lines`);
    assert.equal(TIMING[s].props, 26, `${s} props`);
  }
  assert.equal(TIMING.mma.lines, 72);
});

test('D42 the survival: 1 inside the last chance or with the news in, the fit at the open lead, a line between, 0 with no fit', () => {
  const e = { kept: 0.4, lead: 12 };
  assert.equal(survivalAt(e, 2, { last: 3 }), 1);
  assert.equal(survivalAt(e, 20, { last: 3, newsIn: true }), 1);
  assert.equal(survivalAt(e, 12, { last: 3 }), 0.4);
  assert.equal(survivalAt(e, 26, { last: 3 }), 0.4);
  assert.ok(Math.abs(survivalAt(e, 7.5, { last: 3 }) - 0.7) < 1e-9, 'halfway');
  assert.equal(survivalAt(null, 10, { last: 3 }), 0, 'no evidence: the Bot waits');
  assert.equal(survivalAt({ kept: null }, 10, { last: 3 }), 0);
  // (a lead inside the last chance reads as the last chance: the fit alone past it)
  assert.equal(survivalAt({ kept: 0.5, lead: 1 }, 5, { last: 3 }), 0.5);
});

test('D42 the fit: the share of the open edge still there at the close, on the rows the Bot would have bet; pooled under RISK_MIN; held to 0 and 1', () => {
  const pairs = [];
  for (let i = 0; i < 400; i++) pairs.push({ stat: 'pts', eo: 0.04, ec: 0.02, moved: i % 2 === 0, lead: 12 });
  for (let i = 0; i < 400; i++) pairs.push({ stat: 'pts', eo: 0.005, ec: -0.1, moved: false, lead: 12 });
  for (let i = 0; i < 100; i++) pairs.push({ stat: 'reb', eo: 0.03, ec: 0.03, moved: false, lead: 12 });
  for (let i = 0; i < 400; i++) pairs.push({ stat: 'ast', eo: 0.03, ec: -0.03, moved: true, lead: 12 });
  const fit = fitLineupRisk(pairs, { at: 'now' });
  assert.equal(fit.stats.pts.n, 400, `only the rows with ${EDGE_MIN} of edge at the open count`);
  assert.equal(fit.stats.pts.kept, 0.5);
  assert.equal(fit.stats.pts.from, 'own');
  assert.equal(fit.stats.pts.moved, 0.25);
  assert.equal(fit.stats.pts.lead, 12);
  // (ast: the close went the other way: held to 0, the raw kept on the side)
  assert.equal(fit.stats.ast.kept, 0);
  assert.equal(fit.stats.ast.keptRaw, -1);
  // (reb: under RISK_MIN, the pooled survival)
  assert.ok(fit.stats.reb.n < RISK_MIN);
  assert.equal(fit.stats.reb.from, 'pooled');
  assert.equal(fit.stats.reb.kept, fit.pooled.kept);
  assert.ok(fit.pooled.ok);
  // (too few everywhere: none)
  const few = fitLineupRisk(pairs.slice(0, 50));
  assert.equal(few.stats.pts.from, 'none');
  assert.equal(few.stats.pts.kept, null);
  assert.ok(riskText(fit).includes('pts 0.5'));
});

test('D42 self-tuning: the Bot\'s own record by stat and hour bucket blends into the history\'s survival by its rows\' worth, soft', () => {
  assert.deepEqual(HOUR_BUCKETS.slice(0, 5), [2, 4, 8, 14, 27]);
  assert.equal(bucketOf(1), 0);
  assert.equal(bucketOf(10), 3);
  assert.equal(bucketOf(30), 5);
  const bets = [];
  for (let i = 0; i < 40; i++) bets.push({ market: 'prop', propType: 'pts', side: 'over', p: 0.55, fair: 0.5, clv: { q: 0.55 }, placedAt: '2026-10-20T10:00:00Z', start: '2026-10-20T20:00:00Z' });
  bets.push({ market: 'prop', propType: 'pts', side: 'over', p: 0.5, fair: 0.5, clv: { q: 0.6 }, placedAt: '2026-10-20T10:00:00Z', start: '2026-10-20T20:00:00Z' }, { market: 'prop', propType: 'pts', side: 'over', p: 0.55, fair: 0.5, placedAt: '2026-10-20T10:00:00Z', start: '2026-10-20T20:00:00Z' }, { market: 'prop', propType: 'pts', side: 'over', p: 0.55, fair: 0.5, clv: { q: 0.55 }, placedAt: '2026-10-01T10:00:00Z', start: '2026-10-01T20:00:00Z' });
  const live = ledgerRisk(bets, { epoch: '2026-10-10T00:00:00Z' });
  assert.equal(live.pts[3].n, 40, 'no edge, no close, before the epoch: not evidence');
  assert.equal(live.pts[3].kept, 1);
  const hist = { stats: { pts: { kept: 0.4, lead: 12 } } };
  const r = riskAt(hist, live, 'pts', 12, { last: 3 });
  // (the history's 0.4 at the lead, the record's 1 at 40 of 80 weight: 0.7)
  assert.ok(Math.abs(r.s - 0.7) < 1e-9, `blend ${r.s}`);
  assert.equal(r.live.w, Math.round((40 / (40 + RISK_K)) * 1000) / 1000);
  assert.equal(riskAt(hist, null, 'pts', 12, { last: 3 }).s, 0.4);
  assert.ok(Math.abs(riskAt(hist, null, 'pts', 7.5, { last: 3 }).s - 0.7) < 1e-9, 'halfway up the curve');
  assert.equal(riskAt(hist, live, 'pts', 2, { last: 3 }).s, 1);
  assert.equal(riskAt(null, live, 'reb', 10, { last: 3 }).s, 0, 'no fit for the stat: the Bot waits');
  assert.ok(Math.abs(riskChance(0.5, 0.6, 0.5) - 0.55) < 1e-9);
  assert.equal(readLineupRisk(path.resolve('.'), 'none'), null);
});

test('D42 the snapshot prices a suggestion, never a bet: rows marked, a moved line left unpriced, nothing with no file', () => {
  const snap = new Map([[`pts|${nameKey('J. Doe')}`, { line: 20.5, over: -115, under: -105, at: 't' }], [`reb|${nameKey('J. Doe')}`, { line: 8.5, over: -110, under: -110, at: 't' }]]);
  const board_ = [{ athlete: { name: 'J. Doe' }, stat: { key: 'pts' }, line: 20.5, prices: null }, { athlete: { name: 'J. Doe' }, stat: { key: 'reb' }, line: 9.5, prices: null }, { athlete: { name: 'J. Doe' }, stat: { key: 'ast' }, line: 5.5, prices: { over: -120, under: 100 } }];
  const out = withSnapshot(board_, snap);
  assert.deepEqual(out[0].prices, { over: -115, under: -105 });
  assert.deepEqual(out[0].snapshot, { at: 't' });
  assert.equal(out[0].source, 'morning snapshot');
  assert.equal(out[1].prices, null, 'the line moved since the snapshot');
  assert.equal(out[2].snapshot, undefined, 'a priced row keeps its own');
  assert.equal(morningPrices('nfl', { id: 'none' }, Date.UTC(2000, 0, 1)).size, 0);
  // (run.mjs: a snapshot row is never a candidate; the first ask is deferred only with a free price and before the
  // last chance, and bought when a surviving lean clears it; a row held for the risk is neither bet nor tracked; an
  // early bet carries its hours and survival)
  const run = src('run.mjs');
  assert.ok(/if \(x\.prop\.snapshot\) \{\s*run\.snapshotHeld = \(run\.snapshotHeld \?\? 0\) \+ 1;\s*continue;/.test(run));
  assert.ok(/const defer = why === 'first' && phase !== 'last' && !owed && !!u\.lines\.oddsEvent && !DRY && \(boardPriced \|\| \(snap\?\.size \?\? 0\) > 0\)/.test(run));
  assert.ok(/const want = bets\.some\(\(x\) => x\.priced && !x\.guard\?\.skip && riskOf\(game, x, phase\)\.ev > 0\);\s*if \(want && \(await askNow\(\)\)\)/.test(run));
  assert.ok(/if \(!\(rk\.ev > 0\)\) \{\s*run\.heldRisk = \(run\.heldRisk \?\? 0\) \+ 1;\s*continue;/.test(run));
  assert.ok(/\.\.\.\(x\.early \? \{ early: x\.early \} : \{\}\)/.test(run));
  assert.ok(!/odds-history/.test(run), 'run.mjs reads the snapshot through suggest.mjs alone');
  assert.ok(/\.\.\.\(x\.sug \? \{ sug: x\.sug \} : \{\}\)/.test(src('board.mjs')), 'the board carries the suggestion');
  const decisions = fs.readFileSync(path.resolve('libs/ranker/scripts/model/DECISIONS.md'), 'utf8');
  assert.ok(decisions.includes('### D42.'));
});
