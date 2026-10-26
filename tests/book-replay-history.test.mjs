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

const tally = (won, lost, push = 0, profit = 0, beat = null, beatN = 0, clv = beatN ? 0.01 : null) => ({ bets: won + lost + push, won, lost, push, staked: won + lost + push, profit, roi: won + lost + push ? profit / (won + lost + push) : null, beat, beatN, clv });
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
    live('b', 'nfl', '2026-10-20T00:00:00Z', 'lost', 'medium', 1, { clv: { pts: 0, prob: 0.01, ev: 0.03, beat: true } }),
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
  // (beat the fair close (D56): the files' 6 of 10 each, and the live b whose price returns +3% at the close's fair;
  // the mean expected return weighted by the count)
  assert.equal(h.overall.clvN, 21);
  assert.equal(Math.round(h.overall.clvBeat * 1000) / 1000, Math.round(((6 + 6 + 1) / 21) * 1000) / 1000);
  assert.equal(Math.round(h.overall.clvEv * 1e4) / 1e4, Math.round(((0.01 * 20 + 0.03) / 21) * 1e4) / 1e4);
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
    // (the day buckets (the Algorithm tab's range): the newest year's days, none past the epoch's)
    if (r.daily) {
      const days = (bands, i) => bands.reduce((t, bd) => t + Object.values(r.daily.bands[bd] ?? {}).reduce((u, d) => u + (Number(d.split(',')[i]) || 0), 0), 0);
      const n = days(['lock', 'high', 'medium'], 0) + days(['lock', 'high', 'medium'], 1) + days(['lock', 'high', 'medium'], 2);
      const newest = Object.keys(r.byYear).sort().pop();
      assert.ok(n <= r.overall.bets && n >= r.byYear[newest].all.bets, `${sport}: the days hold the newest year's bets`);
      assert.ok(Object.values(r.daily.bands).every((b) => Object.keys(b).every((d) => d >= r.daily.from)), `${sport}: no day before the buckets' first`);
      assert.ok(Object.values(r.daily.bands).every((b) => Object.keys(b).every((d) => d <= new Date(Date.parse(r.epoch) + 3 * 36e5).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))), `${sport}: no day after the epoch's`);
    }
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

test('the time range (the owner, 2026-10-19): Today to All time by the Eastern day each bet settled, the replay\'s day buckets and the live bets graded in it', () => {
  const NOW = Date.parse('2026-10-21T16:00:00Z'); // a Wednesday, Eastern
  assert.deepEqual(book.rangeDays('today', NOW), { from: '2026-10-21', to: '2026-10-21' });
  assert.deepEqual(book.rangeDays('yesterday', NOW), { from: '2026-10-20', to: '2026-10-20' });
  assert.deepEqual(book.rangeDays('week', NOW), { from: '2026-10-19', to: '2026-10-21' }, 'a week from its Monday');
  assert.deepEqual(book.rangeDays('month', NOW), { from: '2026-10-01', to: '2026-10-21' });
  assert.deepEqual(book.rangeDays('year', NOW), { from: '2026-01-01', to: '2026-10-21' });
  assert.equal(book.rangeDays('all', NOW), null);
  // (just past midnight UTC is still the evening before in the East)
  assert.deepEqual(book.rangeDays('today', Date.parse('2026-10-22T02:00:00Z')), { from: '2026-10-21', to: '2026-10-21' });
  assert.deepEqual(book.rangeDays('week', Date.parse('2026-10-19T12:00:00Z')), { from: '2026-10-19', to: '2026-10-19' }, 'a Monday is its own week');
  assert.ok(book.HISTORY_RANGES.map((r) => r.value).join() === 'today,yesterday,week,month,year,all');
  const EPOCH = '2026-10-19T17:15:00Z';
  const f = {
    ...file('nfl', EPOCH),
    daily: {
      cols: ['won', 'lost', 'push', 'staked', 'profit', 'beat', 'beatN'],
      from: '2024-12-25',
      bands: {
        lock: { '2025-12-01': '1,0,0,3,2.73' },
        high: { '2026-10-19': '0,1,0,1.5,-1.5,1,1' },
        medium: { '2026-10-18': '1,0,0,1,0.91', '2026-10-19': '2,1,1,4,0.82,1,2' },
        practice: { '2026-10-19': '1' },
      },
    },
  };
  const bets = [
    live('a', 'nfl', '2026-10-20T00:00:00Z', 'won', 'high'),
    { ...live('b', 'nfl', '2026-10-21T00:00:00Z', 'lost', 'medium'), gradedAt: '2026-10-21T04:00:00Z' },
    live('c', 'nfl', '2026-10-22T00:00:00Z', 'open', 'medium'),
  ];
  const week = book.botHistoryOf([f], bets, null, { nfl: 'NFL' }, { range: 'week', now: NOW });
  assert.equal(week.range, 'week');
  // (the replay's Monday: 2-2-1 (high's loss and medium's 2-1-1), the live a (graded the 20th) and b (graded at midnight Eastern, the 21st))
  assert.deepEqual([week.overall.won, week.overall.lost, week.overall.push, week.overall.open], [3, 3, 1, 0]);
  assert.deepEqual(week.rangeParts, { replayed: 6, live: 2, undated: 0 });
  assert.equal(week.overall.clvN, 3);
  const band = Object.fromEntries(week.byBand.map((r) => [r.label, r]));
  assert.deepEqual([band.LOCK.bets, band.LOVE.won, band.LOVE.lost, band.LIKE.won], [0, 1, 1, 2]);
  assert.deepEqual([week.practice.won, week.practice.bets], [1, 1]);
  assert.ok(week.last.every((b) => b.at >= '2026-10-19'), 'the strip in the range: the replay\'s last that settled in it');
  const today = book.botHistoryOf([f], bets, null, {}, { range: 'today', now: NOW });
  assert.deepEqual([today.overall.lost, today.overall.bets, today.rangeParts.replayed], [1, 1, 0], 'b graded at midnight Eastern: today');
  const year = book.botHistoryOf([f], bets, null, {}, { range: 'year', now: NOW });
  assert.equal(year.overall.replayed, 6, 'the 2025 lock is last year');
  // (a file without the buckets: nothing replayed in a range, its bets counted as undated)
  const old = book.botHistoryOf([file('nfl', EPOCH)], bets, null, {}, { range: 'week', now: NOW });
  assert.deepEqual([old.overall.replayed, old.rangeParts.undated], [0, 30 + 10]);
  // (All time: the whole file, as before)
  assert.equal(book.botHistoryOf([f], bets, null).overall.replayed, 30);
});

// The pending bets (the owner, 2026-10-22): a bet whose game ESPN shows final counts at once with its provisional
// result (desk-math.ts provisional, the wallet's "pending settlement"), at the top of Recently closed, until the desk's
// grade lands and replaces it; counted once, the official result winning
test('withPending: a final game\'s open bets counted at once, at the top of the strip, then replaced by the graded row', () => {
  const EPOCH = '2026-10-19T17:15:00Z';
  const START = '2026-10-22T23:00:00Z';
  const END = '2026-10-23T02:05:00Z';
  const board = { hs: 24, as: 20, final: true, state: 'post' };
  const open = [
    // (home -2.5 at 24-20: won)
    live('s', 'nfl', START, 'open', 'high', 1, { event: '9', side: 'home', line: -2.5, pick: 'BUF -2.5' }),
    // (the total 44: a push to be, pending with no result)
    live('t', 'nfl', START, 'open', 'medium', 1, { event: '9', market: 'total', side: 'over', line: 44, pick: 'Over 44' }),
    // (a prop whose count isn't in the box score yet: pending, no result)
    live('p', 'nfl', START, 'open', 'medium', 1, { event: '9', market: 'prop', side: 'over', line: 60.5, propType: 'recYds', athlete: 1, pick: 'X Over 60.5 Rec Yds' }),
    // (another game, not final: open, not pending)
    live('o', 'nfl', START, 'open', 'medium', 1, { event: '10', side: 'home', line: -3 }),
  ];
  const graded = [live('g', 'nfl', '2026-10-21T00:00:00Z', 'lost', 'medium')];
  const finals = new Map([['9', END]]);
  const settle = (b) => book.provisional(b, b.event === '9' ? board : undefined, undefined);
  const ledger = book.withPending([...graded, ...open], (b) => finals.get(b.event), settle);
  const now = Date.parse('2026-10-23T02:30:00Z');
  const h = book.botHistoryOf([], ledger, null, {}, { now });
  // (the record: the graded loss and the pending win, one each; the push and the prop still out, the other game open)
  assert.deepEqual([h.overall.won, h.overall.lost, h.overall.push, h.overall.open, h.overall.pending], [1, 1, 0, 3, 1]);
  assert.equal(h.overall.profit, Math.round((0.91 - 1) * 100) / 100);
  assert.equal(h.byBand.find((r) => r.label === 'LOVE').pending, 1);
  // (the strip: the three pending first, the win with its result, the push and the prop with none; then the graded)
  assert.deepEqual(h.last.map((b) => [b.pending, b.res]), [[true, 'W'], [true, null], [true, null], [false, 'L']]);
  assert.equal(h.last.find((b) => b.res === null && b.pick === 'Over 44').units, '');
  // (Today by the game's end: the pending ones in; the graded loss from two days back out)
  const today = book.botHistoryOf([], ledger, null, {}, { now, range: 'today' });
  assert.deepEqual([today.overall.won, today.overall.lost, today.overall.pending, today.last.length], [1, 0, 1, 3]);
  // (the desk grades it: the official row replaces the pending one, counted once; here a stat correction made the
  // spread a loss and the total a void: the official results win)
  const after = [...graded, { ...open[0], status: 'lost', profit: -1, gradedAt: '2026-10-23T02:40:00Z' }, { ...open[1], status: 'push', profit: 0, void: true, gradedAt: '2026-10-23T02:40:00Z' }, open[2], open[3]];
  const h2 = book.botHistoryOf([], book.withPending(after, (b) => finals.get(b.event), settle), null, {}, { now });
  assert.deepEqual([h2.overall.won, h2.overall.lost, h2.overall.push, h2.overall.open, h2.overall.pending], [0, 2, 0, 2, 0]);
  assert.deepEqual(h2.last.map((b) => [b.pending, b.res]), [[true, null], [false, 'L'], [false, 'L']]);
  // (a tracked row made pending too (the owner, 2026-10-26), only the Practice and PASS rows reading it; a bet without a final untouched)
  const tracked = live('tr', 'nfl', START, 'open', 'medium', 0, { event: '9', intent: 'track', side: 'home', line: -2.5 });
  assert.equal(book.withPending([tracked], () => END, settle)[0].pending, true);
  assert.equal(book.withPending([open[3]], () => null, settle)[0], open[3]);
});

test('finalAtOf: the minute it was seen to go final, else the start plus the game\'s length, never later than now', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');
  assert.equal(book.finalAtOf('2026-10-22T23:00:00Z', now, true), '2026-10-23T12:00:00.000Z');
  assert.equal(book.finalAtOf('2026-10-22T23:00:00Z', now, false), '2026-10-23T02:00:00.000Z');
  assert.equal(book.finalAtOf('2026-10-23T11:00:00Z', now, false), '2026-10-23T12:00:00.000Z');
});

test('the panel transition: a bet leaves In Play the minute ESPN shows its game final and is at the top of Recently closed, pending; never in neither', () => {
  const START = '2026-10-22T23:00:00Z';
  const now = Date.parse('2026-10-23T01:00:00Z');
  const bet = live('s', 'nfl', START, 'open', 'high', 1, { event: '9', side: 'home', line: -2.5, pick: 'BUF -2.5' });
  const later = live('l', 'nfl', '2026-10-24T00:00:00Z', 'open', 'medium', 1, { event: '11', side: 'home', line: -1 });
  const where = (board, finals) => {
    const split = book.splitOpenOf([bet, later], now, (b) => (b.event === '9' ? board : undefined));
    const ledger = book.withPending([bet, later], (b) => finals.get(b.event), (b) => book.provisional(b, b.event === '9' ? board : undefined, undefined));
    const strip = book.botHistoryOf([], ledger, null, {}, { now }).last;
    const ids = (list) => list.map((b) => b.id);
    return { open: ids(split.open), live: ids(split.live), over: ids(split.over), strip: strip.map((b) => [b.pick, b.res, b.pending]) };
  };
  // (under way: In Play, not in the strip)
  assert.deepEqual(where({ hs: 21, as: 20, final: false, state: 'in' }, new Map()), { open: ['l'], live: ['s'], over: [], strip: [] });
  // (final: out of In Play, pending at the top of Recently closed with its result off the final)
  const final = { hs: 24, as: 20, final: true, state: 'post' };
  assert.deepEqual(where(final, new Map([['9', '2026-10-23T01:00:00Z']])), { open: ['l'], live: [], over: ['s'], strip: [['BUF -2.5', 'W', true]] });
  // (over without a final (put off): back with the open bets, never pending)
  assert.deepEqual(where({ hs: 0, as: 0, final: false, state: 'post' }, new Map()), { open: ['s', 'l'], live: [], over: [], strip: [] });
  // (graded: the desk's row, pending no more)
  const graded = { ...bet, status: 'won', profit: 0.91, gradedAt: '2026-10-23T01:20:00Z' };
  assert.deepEqual(book.botHistoryOf([], book.withPending([graded], () => '2026-10-23T01:00:00Z', () => null), null, {}, { now }).last.map((b) => [b.res, b.pending]), [['W', false]]);
});

test("a re-record never hides the real bets after the replay's last game: the live side starts at its through, not its new epoch (the owner, 2026-10-23)", () => {
  // (the history re-recorded today, its epoch now, while the price archive (and so the replay) ends days before)
  const f = { ...file('nfl', '2026-10-23T05:30:00Z'), through: '2026-10-19T00:23:00Z' };
  const bets = [
    live('lastNight', 'nfl', '2026-10-22T23:00:00Z', 'won', 'medium', 1, { pick: 'Last night' }),
    live('covered', 'nfl', '2026-10-18T20:00:00Z', 'lost', 'medium'),
  ];
  const h = book.botHistoryOf([f], bets, null, { nfl: 'NFL' });
  // (last night's bet counted and first in the strip; the one on a replayed game still left to the replay)
  assert.equal(h.overall.live, 1);
  assert.equal(h.last[0].pick, 'Last night');
});

// The tracked rows as if bet (DECISIONS.md D87, the owner 2026-10-23: "I have 0-0 practice and pass bets"): the slate's
// practice candidates (tracked, tagged practiceTracked) on the Practice row at 0.5u, the other tracked rows on PASS at
// 1u flat, live after the replay's through plus the replay's own practice and pass tallies; never in LIKE/LOVE/LOCK,
// the record or a total; the time range and the sport followed
test('botHistoryOf: a tracked practice row on Practice as if 0.5u, a tracked pass on PASS as if 1u; never the record; the range and the sport followed', () => {
  const EPOCH = '2026-10-19T17:15:00Z';
  const f = { ...file('nfl', EPOCH), daily: { cols: ['won', 'lost', 'push', 'staked', 'profit'], from: '2025-12-25', bands: { practice: { '2026-10-19': '1,0,0,0.5,0.45' }, pass: { '2026-10-19': '0,2,0,2,-2', '2026-10-10': '1,0,0,1,0.91' } } } };
  const tracked = (id, start, status, extra = {}) => live(id, 'nfl', start, status, 'medium', 0, { intent: 'track', trackUnits: 0.5, profit: 0, odds: 150, ...extra });
  const bets = [
    live('a', 'nfl', '2026-10-20T00:00:00Z', 'won', 'medium'),
    tracked('tp', '2026-10-20T01:00:00Z', 'won', { topN: { rank: 1, quota: 2, slate: 15, edge: 0.01 }, practiceTracked: true }),
    tracked('tx', '2026-10-20T02:00:00Z', 'lost'),
    tracked('ty', '2026-10-21T02:00:00Z', 'won', { odds: -120 }),
    tracked('to', '2026-10-21T05:00:00Z', 'open'),
    // (before the replay's through: the replay's part)
    tracked('told', '2026-10-18T01:00:00Z', 'won'),
    tracked('nhl', '2026-10-20T01:00:00Z', 'won', { sport: 'nhl' }),
  ];
  const all = book.botHistoryOf([f], bets, 'nfl', { nfl: 'NFL' });
  // (Practice: the file's 5-5 (-0.5u) and the tracked candidate won at +150 as if 0.5u)
  assert.deepEqual([all.practice.won, all.practice.lost, all.practice.staked, all.practice.profit], [6, 5, 10.5, 0.25]);
  assert.equal(all.practice.tracked, 1);
  assert.equal(all.practice.asIf, true);
  // (PASS: the file's 10-10 at a flat unit, the tracked tx lost and ty won at -120, each as if 1u)
  assert.deepEqual([all.pass.won, all.pass.lost, all.pass.staked], [11, 11, 22]);
  assert.equal(all.pass.profit, Math.round((-1 + 100 / 120) * 100) / 100);
  assert.equal(all.pass.tracked, 2);
  assert.equal(all.pass.asIf, true);
  // (never the record: the file's 16-13-1 and the live a alone; no band holds a tracked row)
  assert.deepEqual([all.overall.won, all.overall.lost, all.overall.push], [17, 13, 1]);
  const band = Object.fromEntries(all.byBand.map((r) => [r.label, r]));
  assert.equal(band.LIKE.live, 1);
  assert.equal(band.PASS, undefined);
  assert.equal(all.sports[0].pass.tracked, 2);
  // (the time range: this week (Monday the 19th to the 21st): the file's buckets and the live rows graded in it)
  const week = book.botHistoryOf([f], bets, 'nfl', { nfl: 'NFL' }, { range: 'week', now: Date.parse('2026-10-21T20:00:00Z') });
  assert.deepEqual([week.practice.won, week.practice.bets], [2, 2]);
  assert.deepEqual([week.pass.won, week.pass.lost], [1, 3], 'the 10th\'s pass is last week');
  assert.deepEqual([week.overall.won, week.overall.bets], [1, 1]);
  const yesterday = book.botHistoryOf([f], bets, 'nfl', {}, { range: 'today', now: Date.parse('2026-10-21T12:00:00Z') });
  assert.deepEqual([yesterday.pass.won, yesterday.pass.lost, yesterday.practice.bets], [1, 0, 0], 'today the 21st: ty alone');
  // (By Sport: the NHL's tracked row on its own sport only)
  const nhl = book.botHistoryOf([f], bets, 'nhl', {});
  assert.deepEqual([nhl.pass.won, nhl.practice.bets], [1, 0]);
  assert.equal(book.botHistoryOf([f], bets, null, {}).pass.won, 12);
});
