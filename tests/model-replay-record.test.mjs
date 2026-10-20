// The replayed record (libs/ranker/scripts/model/replay-record.mjs): what today's Bot would have bet over the priced
// history, at its own placement (D42: a clean open inside the window where the edge held to the lineup risk clears,
// else the close), bands and stakes, the practice picks on their own line; what gate.mjs --record writes to
// apps/<sport>/src/StaticData/model/replay-record.json and picks.mjs merges with the live ledger since the epoch.
// Pinned: no look-ahead (every bet's placement time before its start; the first season never bets at the open,
// the risk having no evidence; a later season's from the seasons before it; nothing from the epoch on), the band
// totals sum to the record, the file's shape, and the merge with the live ledger
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as desk from '../libs/ranker/scripts/model/desk.mjs';
import * as picks from '../libs/ranker/scripts/model/picks.mjs';
import * as leagues from '../libs/ranker/scripts/model/leagues.mjs';
import * as lineupRisk from '../libs/ranker/scripts/model/lineup-risk.mjs';
import { REPLAY_LAST, REPLAY_V, caveatOf, dailyOf, cleanOpenOf, liveSince, mergeRecent, mergeRecord, replayRecord, walkRisk } from '../libs/ranker/scripts/model/replay-record.mjs';

const V = { desk, picks, leagues, lineupRisk };
const H = 36e5;
const DAY = 864e5;
const T0 = Date.parse('2024-10-20T23:00:00Z');
const EPOCH = '2026-10-19T17:15:00Z';
const names = (x) => ({ home: 'HOME', away: 'AWAY', matchup: 'AWAY @ HOME' });

// (a prop row at the open (10 hours out) and the close (an hour out), the Bot's chance p against the Book's f)
function propRows(i, { season, p, f = 0.5, y = 1, line = 20.5, lead = 10, odds = [-110, -110], pc = null } = {}) {
  const t = T0 + i * DAY + (season - 2024) * 365 * DAY;
  const key = `p:pts:${i}:${season}`;
  const row = (kind, at, chance) => ({ id: `${key}:${kind}`, key, event: `g${i}-${season}`, sport: 'nba', market: 'prop', stat: 'pts', name: `Player ${i}`, label: 'Points', kind, line, t, at, season, f, p: chance, y, overOdds: odds[0], underOdds: odds[1] });
  return { open: row('o', t - lead * H, p), close: row('c', t - 1 * H, pc ?? p) };
}
function lineRows(i, { season, p, f = 0.5, y = 1, market = 'spread', line = -3.5, lead = 10 } = {}) {
  const t = T0 + i * DAY + (season - 2024) * 365 * DAY;
  const key = `h:g${i}-${season}:${market}`;
  const row = (kind, at) => ({ id: `${key}:${kind}`, key, event: `g${i}-${season}`, sport: 'nba', market, stat: market, kind, line: market === 'ml' ? null : line, t, at, season, f, p, y, overOdds: -110, underOdds: -110 });
  return { open: row('o', t - lead * H), close: row('c', t - 1 * H) };
}
const split = (list) => ({ open: list.map((r) => r.open), close: list.map((r) => r.close) });

test('replay: every bet is placed before its start, at a clean open inside the window only where the risk fit on the seasons before says the edge survives; the first season waits for the close', () => {
  // (2024: a big edge at the open, nothing before it to fit the risk on; 2025: the same edge, the 2024 pairs behind
  // it, the edge whole at the close (kept 1))
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(propRows(i, { season: 2024, p: 0.62 }));
  for (let i = 0; i < 12; i++) rows.push(propRows(i, { season: 2025, p: 0.62 }));
  const r = replayRecord(V, 'nba', split(rows), { names, epoch: EPOCH });
  assert.equal(r.v, REPLAY_V);
  for (const b of r.last) {
    assert.ok(Date.parse(b.at) < Date.parse(b.start), `${b.id}: placed before the start`);
    if (b.timing === 'open') assert.ok(Date.parse(b.start) - Date.parse(b.at) > 3 * H, `${b.id}: an open bet is before the last chance`);
  }
  const by = Object.fromEntries(r.bySeason.map((s) => [s.season, s]));
  assert.equal(by[2024].bets, 12);
  assert.equal(by[2025].bets, 12);
  const last = r.last;
  assert.ok(last.filter((b) => b.season === 2024).every((b) => b.timing === 'close'), 'the first season bets at the close: no evidence the edge survives');
  // (the 2025 rows: the 2024 pairs are under RISK_MIN, so their stat reads the pooled survival, which is under
  // RISK_MIN too: none, the close again. With the risk module gone every row waits for the close)
  const none = replayRecord({ ...V, lineupRisk: null }, 'nba', split(rows), { names, epoch: EPOCH });
  assert.equal(none.flags.timing.open, 0);
  assert.equal(none.flags.timing.close, 24);
  // (a planted risk: enough 2024 pairs that keep their edge, so 2025's open bets go in early)
  const many = [];
  for (let i = 0; i < 320; i++) many.push(propRows(i, { season: 2024, p: 0.62 }));
  for (let i = 0; i < 6; i++) many.push(propRows(i, { season: 2025, p: 0.62 }));
  const early = replayRecord(V, 'nba', split(many), { names, epoch: EPOCH });
  const b25 = early.last.filter((b) => b.season === 2025);
  assert.equal(b25.length, 6);
  assert.ok(b25.every((b) => b.timing === 'open'), 'the second season bets at the open on the first season\'s evidence');
  assert.ok(b25.every((b) => b.survival === 1));
  assert.ok(early.last.filter((b) => b.season === 2024).every((b) => b.timing === 'close'), 'the first season still waits');
});

test('replay: the risk walk reads only the seasons before a row\'s; a dirty open or one outside the window goes to the close', () => {
  const pairs = [];
  for (let i = 0; i < 320; i++) pairs.push({ season: 2024, stat: 'pts', line: false, eo: 0.05, ec: 0.05, moved: false, lead: 10 });
  for (let i = 0; i < 320; i++) pairs.push({ season: 2025, stat: 'pts', line: false, eo: 0.05, ec: 0, moved: true, lead: 10 });
  const w = walkRisk(V, pairs);
  assert.equal(w.entryFor(2024, 'pts', false), null, 'the first season has no fit');
  assert.equal(w.entryFor(2025, 'pts', false).kept, 1, 'the second reads 2024\'s pairs alone');
  assert.equal(w.entryFor(2026, 'pts', false).kept, 0.5, 'the third reads both');
  // (a clean open: the snapshot after both teams' previous game; a dirty one before it)
  const events = new Map([
    ['e1', { id: 'g1', t: new Date(T0).toISOString(), homeName: 'Boston Celtics', awayName: 'Miami Heat' }],
    ['e0', { id: 'g0', t: new Date(T0 - 6 * H).toISOString(), homeName: 'Boston Celtics', awayName: 'New York Knicks' }],
  ]);
  const clean = cleanOpenOf(events);
  assert.equal(clean({ event: 'g1', t: T0, at: T0 - 1 * H }), true);
  assert.equal(clean({ event: 'g1', t: T0, at: T0 - 5 * H }), false, 'the Celtics\' previous game had not ended');
  assert.equal(clean({ event: 'g1', t: T0, at: null }), false);
  // (outside the window (TIMING.nba.props 48 hours since D55) the open is not the Bot's to bet: the close)
  const many = [];
  for (let i = 0; i < 320; i++) many.push(propRows(i, { season: 2024, p: 0.62 }));
  for (let i = 0; i < 4; i++) many.push(propRows(i, { season: 2025, p: 0.62, lead: 72 }));
  const r = replayRecord(V, 'nba', split(many), { names, epoch: EPOCH });
  assert.ok(r.last.filter((b) => b.season === 2025).every((b) => b.timing === 'close'));
});

test('replay: the band totals, the markets, the seasons and the years each sum to the record; the practice picks on their own line; nothing from the epoch on', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(propRows(i, { season: 2025, p: [0.51, 0.56, 0.6, 0.66][i % 4], y: i % 3 === 0 ? 0 : 1 }));
  for (let i = 0; i < 10; i++) rows.push(lineRows(i, { season: 2025, p: i % 2 ? 0.58 : 0.5, y: i % 2 }));
  // (a game after the epoch: never in the replay)
  rows.push(propRows(900, { season: 2026, p: 0.7 }));
  rows[rows.length - 1].open.t = Date.parse(EPOCH) + DAY;
  rows[rows.length - 1].close.t = Date.parse(EPOCH) + DAY;
  const r = replayRecord(V, 'nba', split(rows), { names, epoch: EPOCH, now: Date.parse('2026-10-19T20:00:00Z') });
  const sum = (list) => list.reduce((t, x) => ({ bets: t.bets + x.bets, profit: Math.round((t.profit + x.profit) * 100) / 100 }), { bets: 0, profit: 0 });
  assert.deepEqual(sum(Object.values(r.byBand)), { bets: r.overall.bets, profit: r.overall.profit });
  assert.deepEqual(sum([r.byMarket.lines, r.byMarket.props]), { bets: r.overall.bets, profit: r.overall.profit });
  assert.deepEqual(sum(r.bySeason), { bets: r.overall.bets, profit: r.overall.profit });
  assert.deepEqual(sum(Object.values(r.byYear).map((y) => y.all)), { bets: r.overall.bets, profit: r.overall.profit });
  assert.equal(r.overall.won + r.overall.lost + r.overall.push, r.overall.bets);
  assert.ok(r.n.practice > 0, 'a slate with rows short of the vig has practice picks');
  assert.equal(r.practice.bets, r.n.practice);
  assert.ok(r.last.filter((b) => b.practice).every((b) => b.units === desk.PRACTICE_UNITS && b.band === 'medium'));
  assert.equal(r.n.bets + r.n.practice + r.n.pass, r.n.keys);
  assert.ok(Date.parse(r.through) < Date.parse(EPOCH), 'nothing from the epoch on');
  assert.ok(r.last.every((b) => Date.parse(b.start) < Date.parse(EPOCH)));
  assert.ok(!r.last.some((b) => b.season === 2026));
  // (a bet's band is its Kelly's at the chance it was bet at, a LIKE at the least; its stake the desk's table)
  for (const b of r.last.filter((b) => !b.practice)) {
    assert.ok(['lock', 'high', 'medium'].includes(b.band));
    assert.ok(b.units >= 0.5 && b.units <= 3);
    assert.equal(b.res === 'W' ? b.profit > 0 : b.res === 'L' ? b.profit === -b.units : b.profit === 0, true);
  }
});

test('replay: the file\'s shape, its honesty flags and the one-line caveat', () => {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(propRows(i, { season: 2025, p: 0.6 }));
  for (let i = 0; i < 8; i++) rows.push(lineRows(i, { season: 2023, p: 0.58 }));
  const r = replayRecord(V, 'nba', split(rows), { names, epoch: EPOCH });
  for (const k of ['v', 'sport', 'epoch', 'at', 'from', 'through', 'n', 'overall', 'practice', 'pass', 'byBand', 'byMarket', 'bySeason', 'byYear', 'days', 'practiceDays', 'daily', 'streak', 'streakAt', 'brokeAt', 'last', 'flags']) assert.ok(k in r, `the file carries ${k}`);
  for (const k of ['bets', 'won', 'lost', 'push', 'staked', 'profit', 'roi', 'beat', 'beatN']) assert.ok(k in r.overall, `a tally carries ${k}`);
  assert.deepEqual(Object.keys(r.byBand), ['lock', 'high', 'medium']);
  assert.ok(r.last.length <= REPLAY_LAST);
  for (const b of r.last) for (const k of ['id', 'sport', 'season', 'pick', 'matchup', 'market', 'player', 'band', 'practice', 'units', 'res', 'profit', 'timing', 'beat', 'at', 'start', 'settled', 'odds']) assert.ok(k in b, `a last bet carries ${k}`);
  assert.deepEqual(r.flags.context, { full: [2025], ratingsOnly: [2023] });
  assert.equal(r.flags.timing.open + r.flags.timing.close, r.n.bets);
  assert.match(r.flags.price, /the Book's price nearest the placement/);
  assert.match(caveatOf(r), /replayed on every priced game before its latest version/);
  // (the day buckets by band (dailyOf): the newest year's, summing to its bets at most the record)
  const daySum = (bands, i) => bands.reduce((t, bd) => t + Object.values(r.daily.bands[bd] ?? {}).reduce((v, d) => v + (Number(d.split(',')[i]) || 0), 0), 0);
  assert.deepEqual(r.daily.cols, ['won', 'lost', 'push', 'staked', 'profit', 'beat', 'beatN']);
  assert.ok(Object.values(r.daily.bands).every((days) => Object.keys(days).every((d) => d >= r.daily.from)));
  assert.ok(daySum(['lock', 'high', 'medium'], 0) + daySum(['lock', 'high', 'medium'], 1) + daySum(['lock', 'high', 'medium'], 2) <= r.overall.bets);
  assert.match(caveatOf(r), /full context \(props and lines\) 2025, lines by the ratings alone 2023/);
  assert.equal(r.last[0].pick, 'Player 7 Over 20.5 Points');
  assert.equal(r.last[0].market, 'prop');
  const spread = r.last.find((b) => b.market === 'spread');
  assert.equal(spread.pick, 'HOME -3.5');
  assert.equal(spread.matchup, 'AWAY @ HOME');
});

test('merge: the record is the replay before the epoch plus the live ledger\'s bets on games since it, by band, by market, this calendar year, each part kept alone', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(propRows(i, { season: 2025, p: 0.62, y: i % 2 }));
  const replay = replayRecord(V, 'nba', split(rows), { names, epoch: EPOCH, now: Date.parse('2026-10-19T20:00:00Z') });
  const live = (id, start, status, level, units = 1, extra = {}) => ({ id, sport: 'nba', start, status, publishedLevel: level, published: true, intent: 'edge', units, profit: status === 'won' ? units * 0.91 : status === 'lost' ? -units : 0, market: 'prop', odds: -110, ...extra });
  const published = [
    live('a', '2026-10-20T00:00:00Z', 'won', 'high'),
    live('b', '2026-10-20T00:00:00Z', 'lost', 'medium'),
    live('c', '2026-10-21T00:00:00Z', 'open', 'medium'),
    // (before the epoch by its start: the replay's part covers that game; never counted twice)
    live('old', '2026-10-18T00:00:00Z', 'won', 'lock'),
    // (a practice pick: its own line)
    live('p', '2026-10-20T01:00:00Z', 'won', 'medium', 0.5, { topN: true }),
  ];
  assert.equal(liveSince(published[3], EPOCH), false);
  assert.equal(liveSince(published[0], EPOCH), true);
  const rec = mergeRecord(replay, published, { epoch: EPOCH, now: Date.parse('2026-10-21T00:00:00Z'), record: desk.record, practiceOf: desk.practiceRecord });
  assert.equal(rec.overall.wins, replay.overall.won + 1);
  assert.equal(rec.overall.losses, replay.overall.lost + 1);
  assert.equal(rec.overall.profit, Math.round((replay.overall.profit + 0.91 - 1) * 100) / 100);
  assert.equal(rec.byLevel.high.wins, replay.byBand.high.won + 1);
  assert.equal(rec.byLevel.lock.wins, replay.byBand.lock.won, 'the old bet before the epoch is not counted');
  assert.equal(rec.byLevel.low.wins, 0);
  assert.equal(rec.practice.wins, replay.practice.won + 1);
  assert.equal(rec.byMarket.props.wins, replay.byMarket.props.won + 1);
  assert.equal(rec.live.overall.wins, 1);
  assert.equal(rec.live.overall.losses, 1);
  assert.equal(rec.live.from, EPOCH);
  assert.equal(rec.replay.overall.wins, replay.overall.won);
  assert.equal(rec.year.year, 2026);
  // (this year: the replay's 2026 rows (none here: the rows are 2025's) plus the live ones)
  assert.equal(rec.year.overall.wins, 1);
  assert.equal(rec.year.byLevel.high.wins, 1);
  assert.equal(rec.year.practice.wins, 1);
  assert.match(rec.caveat, /replayed/);
  // (no replay file: the live ledger alone, every published bet, as before)
  const alone = mergeRecord(null, published, { epoch: EPOCH, record: desk.record, practiceOf: desk.practiceRecord });
  assert.equal(alone.overall.wins, 2);
  assert.equal(alone.replay, null);
});

test('merge: the recent form joins the replay\'s days, its last bets and its streak onto the live block', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(propRows(i, { season: 2025, p: 0.62, y: 1 }));
  const now = Date.parse('2025-11-10T20:00:00Z');
  const replay = replayRecord(V, 'nba', split(rows), { names, epoch: '2025-11-09T00:00:00Z', now });
  assert.equal(replay.streak, 'W20');
  const liveBlock = { days: { '2025-11-09': [1, 0, 0, 1, 0.91] }, week: { won: 1, lost: 0, push: 0, profit: 0.91 }, streak: 'W1', streakAt: ['2025-11-10T02:00:00.000Z'], brokeAt: null, last: [{ sport: 'nba', pick: 'Live Over 1.5', matchup: 'A @ B', market: 'prop', player: 'Live', res: 'W', units: 0.91, at: '2025-11-10T02:00:00.000Z' }] };
  const m = mergeRecent(replay, liveBlock, { now });
  assert.equal(m.last.length, 5);
  assert.equal(m.last[0].pick, 'Live Over 1.5');
  assert.equal(m.last[1].replayed, true);
  assert.equal(m.streak, 'W21', 'the live run reaches the end of the live bets and continues into the replay\'s');
  assert.ok(m.streakAt.length >= 21);
  assert.ok(m.week.won > 1, 'the replay\'s days inside the week are added');
  // (a live loss breaks it: the replay's run is not joined)
  const lost = mergeRecent(replay, { ...liveBlock, streak: 'L1', last: [{ ...liveBlock.last[0], res: 'L', units: -1 }] }, { now });
  assert.equal(lost.streak, 'L1');
  assert.equal(lost.brokeAt, replay.streakAt[0]);
  // (no replay: the live block as it is)
  assert.equal(mergeRecent(null, liveBlock), liveBlock);
});

test("dailyOf: the newest year's bets (from a week before it) by the Eastern day each settled and its band, the counts, units and closes in a compact line", () => {
  const at = (iso) => Date.parse(iso) - 3 * 36e5; // (its start: settled three hours on)
  const bets = [
    { t: at('2026-10-19T02:00:00Z'), band: 'medium', practice: false, res: 'W', units: 1, profit: 0.91, beat: 1 },
    { t: at('2026-10-19T03:00:00Z'), band: 'medium', practice: false, res: 'L', units: 1.5, profit: -1.5, beat: 0 },
    { t: at('2026-10-19T18:00:00Z'), band: 'high', practice: false, res: 'P', units: 2, profit: 0, beat: null },
    { t: at('2026-10-19T18:00:00Z'), band: 'medium', practice: true, res: 'W', units: 0.5, profit: 0.45, beat: null },
    // (the week before the year: kept; earlier: All time's alone)
    { t: at('2025-12-28T18:00:00Z'), band: 'lock', practice: false, res: 'W', units: 3, profit: 2.73, beat: null },
    { t: at('2025-06-01T18:00:00Z'), band: 'lock', practice: false, res: 'W', units: 3, profit: 2.73, beat: null },
  ];
  const d = dailyOf(bets);
  assert.equal(d.from, '2025-12-25');
  assert.deepEqual(d.bands, {
    high: { '2026-10-19': '0,0,1,2' },
    lock: { '2025-12-28': '1,0,0,3,2.73' },
    // (02:00 and 03:00 UTC are the evening before in the East)
    medium: { '2026-10-18': '1,1,0,2.5,-0.59,1,2' },
    practice: { '2026-10-19': '1,0,0,0.5,0.45' },
  });
  assert.deepEqual(dailyOf([]).bands, {});
});
