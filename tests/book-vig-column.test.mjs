// The Algorithm tab's Vig column (the owner, 2026-10-26): By Sport's and By Confidence's rows show, left of ROI, what
// the Book's margin cost their bets (or best-price shopping gained) in ROI points: actual ROI less the ROI had every
// bet been paid at its fair no-vig chance, the same results. Display only: the record, units and ROI never change.
// Pinned: the fair-price math (replay-record.mjs fairProfitOf and the tallies' fairProfit, dailyOf's vig column;
// replay-history.ts fairProfitOf, vigOf, vigText), the replay and live sides joined, the time range's buckets, the
// tracked as-if rows, "—" without fair data, ROI and units as before, and the column in both tables left of ROI
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEngine } from './support/engine.mjs';
import { addBet, dailyOf, emptyTally, fairProfitOf } from '../libs/ranker/scripts/model/replay-record.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('replay side: a bet at its fair price pays units × (1/fair − 1); the tally gains fairProfit, its record, units and ROI unchanged', () => {
  assert.equal(fairProfitOf({ res: 'W', units: 2, fair: 0.5 }), 2);
  assert.equal(fairProfitOf({ res: 'L', units: 1.5, fair: 0.5 }), -1.5);
  assert.equal(fairProfitOf({ res: 'P', units: 1, fair: 0.5 }), 0);
  assert.equal(fairProfitOf({ res: 'W', units: 1, profit: 0.91 }), null, 'no fair chance: none');
  const bets = [
    { res: 'W', units: 1, profit: 0.91, fair: 0.5, beat: null },
    { res: 'L', units: 1, profit: -1, fair: 0.5, beat: null },
  ];
  const t = bets.reduce(addBet, emptyTally());
  // (fair: +1 then −1, so 0; actual −0.09: the vig cost 4.5 points on 2 units)
  close(t.fairProfit, 0);
  // (the same bets without fair: the record, units and ROI exactly as with it)
  const plain = bets.map(({ fair, ...b }) => b).reduce(addBet, emptyTally());
  for (const k of ['bets', 'won', 'lost', 'push', 'staked', 'profit', 'roi']) assert.equal(t[k], plain[k], k);
  assert.deepEqual([t.staked, t.profit, t.roi], [2, -0.09, -0.045]);
  assert.equal(plain.fairProfit, -0.09, 'without fair a bet adds its own profit: no gap');
});

test("replay side: dailyOf's vig column (profit less fair profit), the old columns' strings as before", () => {
  const t = Date.parse('2026-10-19T15:00:00Z');
  const d = dailyOf([
    { t, band: 'medium', practice: false, res: 'W', units: 1, profit: 0.91, fair: 0.5, beat: null },
    { t, band: 'medium', practice: false, res: 'L', units: 1, profit: -1, fair: 0.5, beat: null },
    { t, band: 'high', practice: false, res: 'W', units: 1, profit: 0.91, beat: null },
  ]);
  assert.equal(d.cols[8], 'vig');
  assert.equal(d.bands.medium['2026-10-19'], '1,1,0,2,-0.09,0,0,0,-0.09');
  assert.equal(d.bands.high['2026-10-19'], '1,0,0,1,0.91', 'no fair: no vig, the string unchanged');
});

const tally = (won, lost, profit, extra = {}) => ({ bets: won + lost, won, lost, push: 0, staked: won + lost, profit, roi: (won + lost) ? profit / (won + lost) : null, beat: null, beatN: 0, clv: null, ...extra });
const file = (sport, { fair = true } = {}) => {
  const f = (t, fp) => (fair ? { ...t, fairProfit: fp } : t);
  return {
    v: 1,
    sport,
    epoch: '2026-10-19T00:00:00Z',
    at: '2026-10-19T18:00:00Z',
    from: '2025-10-01T00:00:00Z',
    through: '2026-10-18T00:00:00Z',
    n: { rows: 10, keys: 10, bets: 10, practice: 0, pass: 0 },
    // (10 units, profit 1, fair profit 1.5: the vig −5.0%)
    overall: f(tally(6, 4, 1), 1.5),
    practice: f(tally(1, 1, -0.1), 0),
    pass: f(tally(2, 2, -0.2), 0),
    byBand: { lock: f(tally(0, 0, 0), 0), high: f(tally(2, 2, 0.2), 0.4), medium: f(tally(4, 2, 0.8), 1.1) },
    byMarket: { lines: tally(3, 2, 0.5), props: tally(3, 2, 0.5) },
    bySeason: [],
    byYear: {},
    last: [],
    ...(fair ? { daily: { cols: ['won', 'lost', 'push', 'staked', 'profit', 'beat', 'beatN', 'clv', 'vig'], from: '2026-01-01', bands: { medium: { '2026-10-20': '1,1,0,2,-0.09,0,0,0,-0.09' } } } } : {}),
    flags: { timing: { open: 0, close: 10, openSeen: 0, openClean: 0, openInWindow: 0 }, context: { full: [2026], ratingsOnly: [] }, price: 'DK', placement: 'close', split: 'start', notSeen: 'gates' },
  };
};
const live = (id, status, extra = {}) => ({ id, sport: 'nba', start: '2026-10-20T23:00:00Z', placedAt: '2026-10-20T22:00:00Z', gradedAt: '2026-10-21T02:30:00Z', matchup: 'A @ B', market: 'spread', pick: 'A -2.5', odds: -110, model: 0.55, fair: 0.5, p: 0.55, ev: 0.05, units: 1, status, profit: status === 'won' ? 0.91 : status === 'lost' ? -1 : 0, publishedLevel: 'medium', ...extra });

test('the history: replay fairProfit and live fair prices joined into each row; ROI and units as before; "—" without fair data', () => {
  const bets = [live('w', 'won'), live('l', 'lost')];
  const h = book.botHistoryOf([file('nba')], bets, null, { nba: 'NBA' }, { now: Date.parse('2026-10-22T12:00:00Z') });
  const nba = h.bySport[0];
  // (replay: 10u, gap 1 − 1.5 = −0.5; live: 2u, gap −0.09 − 0 = −0.09: −0.59 on 12u)
  close(book.vigOf(nba), -0.59 / 12);
  assert.equal(book.vigText(nba), '−4.9%');
  assert.equal(book.vigText(h.byBand.find((r) => r.label === 'LIKE')), '−4.9%', 'LIKE: (0.8 − 1.1 − 0.09) / 8');
  // (the record, units and ROI: exactly what the same history gives without any fair data)
  const plain = book.botHistoryOf([file('nba', { fair: false })], bets.map(({ fair, ...b }) => b), null, { nba: 'NBA' }, { now: Date.parse('2026-10-22T12:00:00Z') });
  for (const k of ['bets', 'won', 'lost', 'push', 'staked', 'profit', 'roi']) {
    assert.equal(nba[k], plain.bySport[0][k], k);
    assert.equal(h.overall[k], plain.overall[k], k);
  }
  assert.equal(nba.staked, 12);
  close(nba.profit, 0.91);
  assert.equal(book.vigText(plain.bySport[0]), '—');
  assert.equal(book.vigText(plain.overall), '—');
});

test('the history: a bet bought better than fair shows a gain; the tracked as-if rows and pending bets computed the same way; the time range reads the vig buckets', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  // (a win at +110 against a fair 0.5 (even money): it made 0.1u more than fair)
  const h = book.botHistoryOf([], [live('w', 'won', { odds: 110, profit: 1.1 })], null, {}, { now });
  assert.equal(book.vigText(h.overall), '+10.0%');
  // (a tracked PASS row as if bet at 1u flat: its fair price joins the PASS row)
  const tracked = live('t', 'lost', { units: 0, profit: 0, intent: 'track' });
  const ht = book.botHistoryOf([], [tracked], null, {}, { now });
  assert.equal(ht.pass.tracked, 1);
  assert.equal(book.vigText(ht.pass), '0.0%', 'a loss costs the same at any price');
  const tw = book.botHistoryOf([], [{ ...tracked, status: 'won' }], null, {}, { now });
  assert.equal(book.vigText(tw.pass), '−9.1%', 'as if bet at -110: 100/110 against an even fair');
  // (a pending bet, its provisional win before the desk grades it)
  const open = live('p', 'open', { profit: 0, gradedAt: undefined });
  const pend = book.withPending([open], () => '2026-10-21T02:30:00Z', () => ({ status: 'won', profit: 0.91 }));
  const hp = book.botHistoryOf([], pend, null, {}, { now });
  assert.equal(hp.overall.pending, 1);
  assert.equal(book.vigText(hp.overall), '−9.0%');
  // (the week: the replay's day buckets' vig, −0.09 on 2u; a file's buckets without the column: "—")
  const week = book.botHistoryOf([file('nba')], [], null, {}, { now, range: 'week' });
  assert.equal(book.vigText(week.overall), '−4.5%');
  const old = file('nba');
  old.daily = { cols: ['won', 'lost', 'push', 'staked', 'profit', 'beat', 'beatN', 'clv'], from: '2026-01-01', bands: { medium: { '2026-10-20': '1,1,0,2,-0.09' } } };
  const wOld = book.botHistoryOf([old], [], null, {}, { now, range: 'week' });
  assert.equal(wOld.overall.staked, 2);
  assert.equal(book.vigText(wOld.overall), '—');
});

test('the column: Vig left of ROI in By Sport and By Confidence, its cell before the ROI cell, the hover written', () => {
  const html = fs.readFileSync(path.join(ROOT, 'libs/ranker/src/engine/book/model-desk.component.html'), 'utf8');
  const heads = [...html.matchAll(/<thead>\s*<tr>(.*?)<\/tr>/gs)].map((m) => [...m[1].matchAll(/>([^<>]*)<\/th>/g)].map((x) => x[1]));
  const history = heads.filter((h) => h.includes('Beat close') && h.includes('Record'));
  assert.equal(history.length, 2);
  for (const h of history) assert.deepEqual(h.slice(h.indexOf('Units')), ['Units', 'Vig', 'ROI', 'Beat close']);
  const row = html.match(/<ng-template #histRow[\s\S]*?<\/ng-template>/)[0];
  assert.ok(row.indexOf('vigText(t)') > row.indexOf('units(t.profit)') && row.indexOf('vigText(t)') < row.indexOf('pct(t.roi)'));
  assert.match(book.VIG_TIP, /What the Book's margin cost \(or best-price shopping gained\)/);
});
