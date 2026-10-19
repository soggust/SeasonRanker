// The Bot's history panel on the Algorithm tab (libs/ranker/src/engine/book/replay-history.ts botHistoryOf): each
// sport's replayed record (replay-record.json) joined to the live ledger's bets on the games since its epoch; the
// record, by band, by sport, by market, each sport's seasons, the last-20 strip and the caveat; the live part alone
// as its own line; practice picks apart. The shipped files, where the checkout has them, read whole
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEngine } from './support/engine.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

const tally = (won, lost, push = 0, profit = 0, beat = null, beatN = 0) => ({ bets: won + lost + push, won, lost, push, staked: won + lost + push, profit, roi: won + lost + push ? profit / (won + lost + push) : null, beat, beatN });
const file = (sport, epoch) => ({
  v: 1,
  sport,
  epoch,
  at: '2026-10-19T18:00:00Z',
  from: '2023-10-01T00:00:00Z',
  through: '2026-10-19T00:00:00Z',
  n: { rows: 100, keys: 60, bets: 30, practice: 10, pass: 20 },
  overall: tally(16, 13, 1, 2.5, 0.6, 10),
  practice: tally(5, 5, 0, -0.5),
  pass: tally(10, 10),
  byBand: { lock: tally(2, 1, 0, 1.5), high: tally(4, 4, 0, -0.5), medium: tally(10, 8, 1, 1.5, 0.6, 10) },
  byMarket: { lines: tally(6, 5, 1, 0.5), props: tally(10, 8, 0, 2.0, 0.6, 10) },
  bySeason: [
    { season: 2024, context: 'ratings', ...tally(6, 7, 0, -1), practice: tally(2, 2), lines: tally(6, 7, 0, -1), props: tally(0, 0) },
    { season: 2025, context: 'full', ...tally(10, 6, 1, 3.5, 0.6, 10), practice: tally(3, 3, 0, -0.5), lines: tally(0, 0), props: tally(10, 6, 1, 3.5, 0.6, 10) },
  ],
  byYear: {},
  last: [
    { id: 'r1', sport, season: 2025, pick: 'Over 45.5', matchup: 'DAL @ GB', market: 'total', player: null, band: 'medium', practice: false, units: 1, odds: -110, res: 'W', profit: 0.91, timing: 'close', beat: null, at: '2026-10-18T23:00:00Z', start: '2026-10-19T00:20:00Z', settled: '2026-10-19T03:20:00Z' },
    { id: 'r2', sport, season: 2025, pick: 'Dak Prescott Under 36.5 Pass Att', matchup: 'DAL @ GB', market: 'prop', player: 'Dak Prescott', band: 'high', practice: false, units: 1.5, odds: -126, res: 'L', profit: -1.5, timing: 'open', beat: 1, at: '2026-10-18T12:00:00Z', start: '2026-10-19T00:20:00Z', settled: '2026-10-19T03:20:00Z' },
    { id: 'r3', sport, season: 2025, pick: 'Javonte Williams Under 2.5 Receptions', matchup: 'DAL @ GB', market: 'prop', player: 'Javonte Williams', band: 'medium', practice: true, units: 0.5, odds: 103, res: 'W', profit: 0.52, timing: 'close', beat: null, at: '2026-10-18T23:00:00Z', start: '2026-10-19T00:20:00Z', settled: '2026-10-19T03:20:00Z' },
  ],
  flags: { timing: { open: 10, close: 20, openSeen: 50, openClean: 40, openInWindow: 30 }, context: { full: [2025], ratingsOnly: [2024] }, price: 'DK', placement: 'open or close', split: 'start', notSeen: 'gates' },
});
const live = (id, sport, start, status, level, units = 1, extra = {}) => ({ id, sport, start, placedAt: start, gradedAt: `${start.slice(0, 10)}T23:59:00Z`, matchup: 'KC @ BUF', market: 'spread', pick: 'KC -2.5', odds: -110, model: 0.55, fair: 0.5, p: 0.55, ev: 0.05, units, status, profit: status === 'won' ? units * 0.91 : status === 'lost' ? -units : 0, publishedLevel: level, ...extra });

test('botHistoryOf: the replay before the epoch plus the live bets on games since it; by band, by sport, by market; the live part on its own line; practice apart', () => {
  const EPOCH = '2026-10-19T17:15:00Z';
  const files = [file('nfl', EPOCH), file('nhl', EPOCH), null];
  const bets = [
    live('a', 'nfl', '2026-10-20T00:00:00Z', 'won', 'high'),
    live('b', 'nfl', '2026-10-20T00:00:00Z', 'lost', 'medium', 1, { clv: { pts: 0, prob: 0.01, ev: 0, beat: true } }),
    live('c', 'nfl', '2026-10-21T00:00:00Z', 'open', 'medium'),
    // (before the epoch by its start: the replay's part covers that game)
    live('old', 'nfl', '2026-10-18T00:00:00Z', 'won', 'lock'),
    // (a practice pick: its own line; a tracked row: never)
    live('p', 'nfl', '2026-10-20T01:00:00Z', 'won', 'medium', 0.5, { topN: { rank: 1, quota: 1, slate: 1, edge: 0.01 } }),
    live('t', 'nfl', '2026-10-20T01:00:00Z', 'won', 'medium', 0, { intent: 'track', trackUnits: 1 }),
    // (a sport with no replay file: its live ledger alone, every bet)
    live('m', 'mma', '2026-10-01T00:00:00Z', 'won', 'medium', 1, { market: 'ml', pick: 'Fighter A ML', matchup: 'A vs B' }),
  ];
  const h = book.botHistoryOf(files, bets, null, { nfl: 'NFL', nhl: 'NHL', mma: 'MMA' });
  assert.equal(h.replayed, 2);
  // (the record: two files' 16-13-1 each, plus the live a (won) and b (lost) and the MMA bet)
  assert.deepEqual([h.overall.won, h.overall.lost, h.overall.push, h.overall.open], [16 * 2 + 2, 13 * 2 + 1, 2, 1]);
  assert.equal(h.overall.replayed, 60);
  assert.equal(h.overall.live, 3);
  assert.equal(h.overall.profit, Math.round((2.5 * 2 + 0.91 - 1 + 0.91) * 100) / 100);
  // (beat the close: the files' 6 of 10 each, and the live b that beat it)
  assert.equal(h.overall.clvN, 21);
  assert.equal(Math.round(h.overall.clvBeat * 1000) / 1000, Math.round(((6 + 6 + 1) / 21) * 1000) / 1000);
  assert.deepEqual([h.live.won, h.live.lost, h.live.push], [2, 1, 0]);
  assert.deepEqual([h.practice.won, h.practice.lost], [11, 10]);
  const band = Object.fromEntries(h.byBand.map((r) => [r.label, r]));
  assert.equal(band.LOCK.won, 4, 'the old bet before the epoch is not counted');
  assert.equal(band.LOVE.won, 9);
  assert.equal(band.LIKE.won, 21);
  assert.equal(band.PASS, undefined, 'no PASS row without a live action bet');
  const sport = Object.fromEntries(h.bySport.map((r) => [r.label, r]));
  assert.deepEqual([sport.NFL.won, sport.NFL.lost, sport.NFL.open], [17, 14, 1]);
  assert.deepEqual([sport.NHL.won, sport.NHL.lost], [16, 13]);
  assert.deepEqual([sport.MMA.won, sport.MMA.replayed, sport.MMA.live], [1, 0, 1]);
  const market = Object.fromEntries(h.byMarket.map((r) => [r.label, r]));
  assert.equal(market['Game lines'].won, 12 + 1 + 1, "the files' lines, the live spread won and the MMA moneyline");
  assert.equal(market.Props.won, 20);
  // (each sport's seasons: the replay's rows, the live bets on the newest)
  const nfl = h.sports.find((s) => s.sport === 'nfl');
  assert.deepEqual(nfl.seasons.map((s) => `${s.season} ${s.context} ${s.won}-${s.lost}-${s.push}`), ['2024 ratings 6-7-0', '2025 full 11-7-1']);
  assert.equal(nfl.epoch, EPOCH);
  assert.match(nfl.caveat, /10 bets at a clean open/);
  // (the strip: the live graded since the epoch and the files' last, newest settled first, the practice pick tagged)
  assert.equal(h.last[0].replayed, false);
  assert.equal(h.last[0].timing, 'live');
  assert.ok(h.last.some((b) => b.replayed && b.timing === 'open' && b.band === 'LOVE' && b.price === '-126'));
  assert.ok(h.last.some((b) => b.practice && b.pick === 'Javonte Williams Under 2.5 Receptions'));
  assert.ok(!h.last.some((b) => b.pick === 'KC -2.5' && b.units === '0.00u' && b.res === 'W' && b.timing === 'live' && b.at < EPOCH), 'the old live bet is not on the strip');
  assert.match(h.caveat, /NFL full context 2025, lines by the ratings alone 2024/);
  assert.match(h.caveat, /Practice picks apart/);
  // (one sport chosen: its file and its live bets alone)
  const one = book.botHistoryOf(files, bets, 'nhl', { nhl: 'NHL' });
  assert.deepEqual([one.overall.won, one.overall.lost, one.bySport.length, one.sports.length], [16, 13, 1, 1]);
  // (no file at all: the panel says so, the live ledger alone)
  const none = book.botHistoryOf([null, null], bets, null);
  assert.equal(none.replayed, 0);
  assert.match(none.caveat, /No replayed record yet/);
  assert.equal(none.overall.won, 3, 'every live bet, there being no epoch to split at (the practice pick and the tracked row apart)');
  assert.equal(book.recordText(h.overall), '34–27–2');
  assert.equal(book.dayLabel(EPOCH), 'Oct 19, 2026');
});

test('the shipped replay-record.json files (gate.mjs --record): the file\'s shape, the bands summing to the record, nothing from the epoch on, every last bet placed before its start', () => {
  for (const sport of ['nfl', 'nhl', 'nba', 'mlb', 'mma']) {
    const f = path.join(ROOT, 'apps', sport, 'src/StaticData/model/replay-record.json');
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(r.v, 1, `${sport}: v`);
    assert.equal(r.sport, sport);
    assert.ok(r.epoch && Number.isFinite(Date.parse(r.epoch)), `${sport}: the epoch`);
    const sum = (list) => list.reduce((t, x) => t + x.bets, 0);
    assert.equal(sum(Object.values(r.byBand)), r.overall.bets, `${sport}: the bands sum to the record`);
    assert.equal(sum([r.byMarket.lines, r.byMarket.props]), r.overall.bets, `${sport}: the markets sum to the record`);
    assert.equal(sum(r.bySeason), r.overall.bets, `${sport}: the seasons sum to the record`);
    assert.equal(sum(Object.values(r.byYear).map((y) => y.all)), r.overall.bets, `${sport}: the years sum to the record`);
    assert.equal(r.overall.won + r.overall.lost + r.overall.push, r.overall.bets);
    assert.equal(r.flags.timing.open + r.flags.timing.close, r.n.bets, `${sport}: every bet at the open or the close`);
    assert.ok(Date.parse(r.through) < Date.parse(r.epoch), `${sport}: nothing from the epoch on`);
    assert.ok(r.last.length <= 20 && r.last.length > 0);
    for (const b of r.last) {
      assert.ok(Date.parse(b.at) < Date.parse(b.start), `${sport} ${b.id}: placed before the start`);
      assert.ok(Date.parse(b.start) < Date.parse(r.epoch), `${sport} ${b.id}: before the epoch`);
      assert.ok(['lock', 'high', 'medium'].includes(b.band));
      assert.ok(typeof b.pick === 'string' && b.pick.length > 0 && typeof b.matchup === 'string');
    }
    const practice = r.last.filter((b) => b.practice);
    assert.ok(practice.every((b) => b.units === 0.5 && b.band === 'medium'), `${sport}: a practice pick at 0.5u, a LIKE`);
    assert.ok(fs.statSync(f).size < 60000, `${sport}: the file stays small (${fs.statSync(f).size} bytes)`);
  }
});
