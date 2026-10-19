// The book's line as a news alarm outside the NFL (props.mjs lineAlarmOf), the line log (linelog.mjs) and the
// self-check's far-line check (selfcheck.mjs C20): a far line (at a count from ALARM_MIN) with a cause known before
// the game and unsized by the fit a label on the side against the market's reading, never a cut; a far line alone
// nothing; every line seen logged once and again only on a change, a gzip member a run, read back whole, the
// closing reads apart; the far lines' and the alarm's record against the book's chance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ALARM_MIN, farOf, lineAlarmOf, ROLE } from '../libs/ranker/scripts/model/props.mjs';
import { gameRows, logLines, lostSince, monthFile, newRows, propRows, pruneLast, readLines, LAST_KEEP, LAST_KEEP_BLIND } from '../libs/ranker/scripts/model/linelog.mjs';
import { c20, lineBandOf, lineRatioOf, TITLES } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { checkTrim, TRIM_AFTER } from '../libs/ranker/scripts/model/checks.mjs';

test('lineAlarmOf: a far low line with an unsized cause its way, its safe side the under', () => {
  // (questionable: the under safe, the over labeled)
  const q = lineAlarmOf({ sport: 'nba', name: 'A', mu: 20, implied: 10, line: 9.5, status: { why: 'A questionable' } });
  assert.equal(q.key, 'line-questionable');
  assert.equal(q.safe, 'under');
  assert.match(q.why, /^A questionable, and the line's price puts him at 10 against the bot's 20: the market reading a minutes cap or an early exit, which the projection doesn't size$/);
  // (an NBA starter's back-to-back where b2bS isn't kept; not a bench player's (b2bB: his ran high), not with
  // b2bS kept, never the NHL's (a confirmed goalie isn't resting) nor MLB's)
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 20, implied: 10, line: 9.5, b2b: 1, roleKnown: 'S' }).key, 'line-rest');
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 20, implied: 10, line: 9.5, b2b: 1, roleKnown: 'B' }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 20, implied: 10, line: 9.5, b2b: 1, roleKnown: 'S', b2bSized: true }), null);
  assert.equal(lineAlarmOf({ sport: 'nhl', mu: 30, implied: 15, line: 14.5, b2b: 1 }), null);
  assert.equal(lineAlarmOf({ sport: 'mlb', mu: 3, implied: 1.5, line: 1.5, b2b: 1 }), null);
  // (an NHL goalie expected, not confirmed; an MLB batter's lineup not posted)
  assert.equal(lineAlarmOf({ sport: 'nhl', name: 'G', mu: 30, implied: 15, line: 14.5, status: { why: 'G expected, not confirmed' } }).key, 'line-goalie');
  assert.equal(lineAlarmOf({ sport: 'mlb', mu: 3, implied: 1.5, line: 1.5, status: { why: 'lineup not posted (NYY)' } }).key, 'line-lineup');
  // (an MLB starter: his last two starts both under 60 pitches, a short leash, a long rest, a late debut)
  const sp = { sport: 'mlb', pitcher: true, mu: 15, implied: 6, line: 5.5 };
  assert.equal(lineAlarmOf({ ...sp, pitches: [35, 41] }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ ...sp, leash: Math.log(0.8), pitches: [80, 70] }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ ...sp, rest: 'long', pitches: [95, 99] }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ ...sp, rest: 'late' }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ ...sp, leash: 0, pitches: [95, 99] }), null);
  // (one start cut short isn't an opener: a single start, or one of the two unread)
  assert.equal(lineAlarmOf({ ...sp, pitches: [45] }), null);
  assert.equal(lineAlarmOf({ ...sp, pitches: [null, 45] }), null);
  assert.equal(lineAlarmOf({ ...sp, pitches: [95, 45] }), null);
  // (the fit's leash kept: the short leash and the opener's starts priced already; restSp kept: the long rest)
  assert.equal(lineAlarmOf({ ...sp, pitches: [35, 41], leashSized: true }), null);
  assert.equal(lineAlarmOf({ ...sp, leash: Math.log(0.8), leashSized: true }), null);
  assert.equal(lineAlarmOf({ ...sp, rest: 'long', restSized: true }), null);
});

test('lineAlarmOf: a far line alone, a high line, a low count, a near line, no price or the NFL: nothing (the old behavior)', () => {
  assert.equal(lineAlarmOf({ sport: 'nhl', mu: 3, implied: 1.5, line: 1.5 }), null);
  // (a high line has no cause: teammates out or back are the fit's vacancy or the unsized skip's)
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 20, line: 19.5, status: { why: 'A questionable' }, vacNow: 0.5 }), null);
  // (a low count's gap is small in SDs of the count (farOf, lineZ: D24, never a ratio): 0.5 against 0.2 is -0.42;
  // 0.6 against 1.0 +0.52 where its ratio 1.67 was far; 8 against 14 +1.8 at r 20, far)
  assert.equal(lineAlarmOf({ sport: 'nhl', mu: 0.5, implied: 0.2, line: 0.5, status: { why: 'A day-to-day' } }), null);
  assert.equal(farOf(0.6, 1.2), null);
  assert.equal(farOf(1.0, 0.6, 1000), null);
  assert.equal(farOf(14, 8, 20), 'hi');
  assert.equal(farOf(3, 8, 20), 'lo');
  assert.equal(farOf(0.6, 0.3), null);
  assert.equal(ALARM_MIN, 1.5);
  // (inside the band: ROLE.zLo itself isn't past it)
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 10 + ROLE.zLo * Math.sqrt(10), line: 5.5, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: null, line: 5.5, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 0, implied: 1, line: 5.5, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 5, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nfl', mu: 10, implied: 2, line: 2.5, status: { why: 'A questionable' } }), null);
});

test('the line log: rows from the lines and the board, new only on a change, the first with its open', () => {
  const lines = { spread: { home: { line: -1.5, odds: 150 }, away: { line: 1.5, odds: -180 } }, total: { line: 6.5, over: -110, under: -110 }, ml: { home: -120, away: 100 } };
  const g = gameRows('401', lines, 'e');
  assert.deepEqual(g.map((r) => r.key), ['spread', 'total', 'ml']);
  assert.deepEqual(g[0], { game: '401', key: 'spread', line: -1.5, a: 150, b: -180, src: 'e' });
  assert.deepEqual(gameRows('401', { spread: { home: {}, away: {} }, total: {}, ml: {} }, 'e'), []);
  const board = [
    { athlete: { id: 7 }, stat: { key: 'sog' }, line: 2.5, open: 3.5, prices: { over: 120, under: -150 } },
    { athlete: { id: 8 }, stat: { key: 'pts' }, line: 0.5, open: null, prices: null },
    { athlete: { id: 9 }, stat: { key: 'sog' }, line: 1.5, open: 1.5, prices: { over: 100, under: -120 }, stored: { at: 'x' } },
    { athlete: { id: 7 }, stat: { key: 'pts' }, line: 0.5, open: 0.5, prices: { over: 110, under: -140 }, source: 'the odds api' },
  ];
  const p = propRows('401', board);
  assert.equal(p.length, 3);
  assert.deepEqual(p[0], { game: '401', key: 'p:sog:7', line: 2.5, a: 120, b: -150, src: 'e', open: 3.5 });
  assert.deepEqual([p[1].a, p[1].b], [null, null]);
  assert.equal(p[2].src, 'o');
  const last = {};
  const t = Date.parse('2026-10-13T12:00:00Z');
  const first = newRows([...g, ...p], last, t, new Map([['401', t + 36e5]]));
  assert.equal(first.length, 6);
  assert.deepEqual(first.find((r) => r[2] === 'p:sog:7'), [t / 1000, '401', 'p:sog:7', 2.5, 120, -150, 'e', 3.5]);
  // (seen again unchanged: nothing; a price moved: that one, without its open)
  assert.equal(newRows([...g, ...p], last, t + 36e5).length, 0);
  const moved = newRows([{ ...p[0], a: 130 }], last, t + 72e5);
  assert.deepEqual(moved, [[(t + 72e5) / 1000, '401', 'p:sog:7', 2.5, 130, -150, 'e']]);
  // (the index keeps the start and when it was last seen; pruned LAST_KEEP past the start; one with no start
  // known LAST_KEEP_BLIND past when it was last seen, an older index's with no time seen kept)
  assert.equal(last['401|p:sog:7|e'][4], t + 72e5);
  const at = t + 36e5 + LAST_KEEP + 1;
  const pruned = pruneLast({ ...last, 'x|ml|e': [null, 1, 2, null], 'y|ml|e': [null, 1, 2, null, at - LAST_KEEP_BLIND + 1], 'z|ml|e': [null, 1, 2, null, at - LAST_KEEP_BLIND - 1] }, at);
  assert.deepEqual(Object.keys(pruned), ['x|ml|e', 'y|ml|e']);
  // (the closing reads after the start (captureClose) their own src: never one series with the pre-game rows)
  assert.deepEqual([...new Set([...propRows('401', board, 'c'), ...gameRows('401', lines, 'c')].map((r) => r.src))], ['c']);
});

test('the line log: a gzip member a run appended to the month file, read back whole; dry writes nothing; a lost history told', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linelog-'));
  try {
    const t = Date.parse('2026-10-13T12:00:00Z');
    const rows = gameRows('401', { spread: { home: { line: -1.5, odds: 150 }, away: { line: 1.5, odds: -180 } } }, 'e');
    assert.equal(logLines('nhl', rows, { now: t, dir, dry: true }), 1);
    assert.equal(fs.existsSync(dir) && fs.readdirSync(dir).length, 0);
    assert.equal(lostSince('nhl', '2026-10', dir), true);
    assert.equal(logLines('nhl', rows, { now: t, dir }), 1);
    assert.equal(logLines('nhl', rows, { now: t + 36e5, dir }), 0);
    assert.equal(logLines('nhl', [{ ...rows[0], line: -2.5 }], { now: t + 72e5, dir }), 1);
    const file = monthFile('nhl', t, dir);
    assert.ok(file.endsWith('nhl-2026-10.jsonl.gz'));
    assert.equal(gunzipSync(fs.readFileSync(file)).toString().trim().split('\n').length, 2);
    const back = readLines('nhl', dir);
    assert.deepEqual(back.map((r) => r[3]), [-1.5, -2.5]);
    assert.deepEqual(readLines('nba', dir), []);
    // (its first month's file there: not lost; none started: not lost; an earlier month's gone: lost)
    assert.equal(lostSince('nhl', '2026-10', dir), false);
    assert.equal(lostSince('nhl', null, dir), false);
    assert.equal(lostSince('nhl', '2026-09', dir), true);
    // (an index unreadable: started over, the next sighting logged again, nothing thrown)
    fs.writeFileSync(path.join(dir, 'last-nhl.json'), '{');
    assert.equal(logLines('nhl', [{ ...rows[0], line: -2.5 }], { now: t + 108e5, dir }), 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// (a graded prop at the book's even price, its line's ratio kept)
let seq = 0;
const prop = (ratio, side, won, over = {}) => ({ id: `p${++seq}`, market: 'prop', side, line: 2.5, fair: 0.5, p: 0.55, units: 1, status: won ? 'won' : 'lost', profit: won ? 0.91 : -1, projection: { mean: 2, lineRatio: ratio }, ...over });

test('C20: the far lines bet against the market doing worse than the near ones a watch; too few a report; a low count near; the alarm apart', () => {
  assert.equal(TITLES.C20, 'Line far from the projection (all graded)');
  // (an estimated ratio: the bet's line, fair chance and dispersion; an assumed price none)
  const est = lineRatioOf({ market: 'prop', side: 'under', fair: 0.5, line: 2.5, projection: { mean: 1, r: 1000 } });
  assert.equal(est.by, 'estimated');
  assert.ok(est.ratio > 2.5 && est.ratio < 3.2);
  assert.equal(lineRatioOf({ market: 'prop', oddsAssumed: true, side: 'under', fair: 0.5, line: 2.5, projection: { mean: 1, lineRatio: 3 } }), null);
  // (a 0.5 line near however far its ratio, every sport the same: its gap in SDs of the count (D24))
  const low = prop(2, 'under', true, { line: 0.5, projection: { mean: 0.3, lineRatio: 2 } });
  assert.equal(lineBandOf(lineRatioOf(low), low, 'nhl'), 'near');
  assert.equal(lineBandOf(lineRatioOf(low), low, 'nfl'), 'near');
  const bets = [
    ...Array.from({ length: 70 }, (_, i) => prop(2, 'under', i < 20)),
    ...Array.from({ length: 70 }, (_, i) => prop(1, i % 2 ? 'over' : 'under', i < 35)),
  ];
  const checks = [{ ...prop(0.4, 'over', true), checkResult: { status: 'won', profit: 1 }, status: 'check', cause: 'role', roleReason: 'line-rest' }];
  const c = c20({ sport: 'nhl', bets, checks });
  assert.equal(c.id, 'C20');
  assert.equal(c.status, 'watch');
  assert.match(c.headline, /did worse against the book than the near ones \(z -2\.54\): the far line alone is news, a PASS/);
  assert.equal(c.rows.find((r) => r.key === 'bets: line far over, the bot against it').n, 70);
  assert.equal(c.rows.find((r) => r.key === "CHECKs: the line alarm's (a far line with its cause)").n, 1);
  const few = c20({ sport: 'nhl', bets: bets.slice(50, 100), checks: [] });
  assert.equal(few.status, 'thin');
  // (the alarm's labeled bets doing worse than the near ones: promote it to a CHECK)
  const labeled = Array.from({ length: 70 }, (_, i) => prop(0.4, 'over', i < 20, { projection: { mean: 2, lineRatio: 0.4, lineAlarm: { key: 'line-questionable' } } }));
  const a = c20({ sport: 'nba', bets: [...labeled, ...bets.slice(70)], checks: [] });
  assert.equal(a.rows.find((r) => r.key === "bets: the line alarm's (a far line with its cause)").n, 70);
  assert.match(a.headline, /the line alarm's label .* did worse against the book than the near ones \(z -2\.54\): the alarm could be a role CHECK/);
});

test('checkTrim keeps the line ratio and the alarm key C20 reads', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const c = { checkResult: { gradedAt: new Date(now.getTime() - TRIM_AFTER - 1).toISOString() }, context: {}, projection: { mean: 2, r: 9, lineRatio: 0.4, lineAlarm: { key: 'line-rest', why: 'x' } } };
  assert.equal(checkTrim([c], now), 1);
  assert.deepEqual(c.projection, { mean: 2, lineRatio: 0.4, lineAlarm: { key: 'line-rest' } });
});

test('priceProps (the NHL): a far low line on a day-to-day player labeled (line-questionable), its guard the same as without the cause; every priced prop its line ratio', async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nhl.find((s) => s.key === 'sog');
  const project = () => ({ mu: 4, rate: 4, recent: 4, base: 4, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 10, prevGames: 60 });
  const fitted = { sog: { stat: st, env: { mean: 2, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map(), params: { r: 20, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'C', name: (id) => `N${id}` };
  const game = { id: 'g', date: '2026-10-14T23:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const props = [{ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 1.5, open: 1.5, prices: { over: -110, under: -110 } }];
  const run = (injuries) => priceProps('nhl', game, props.map((p) => ({ ...p })), fitted, idx, { homePts: 3, awayPts: 3 }, null, { injuries }, {}, 0.1).priced[0];
  const hurt = run(new Map([['1', [{ id: 'a', name: 'A', pos: 'C', status: 'Day-To-Day' }]]]));
  assert.equal(hurt.side, 'over');
  assert.equal(hurt.projection.lineAlarm?.key, 'line-questionable');
  assert.match(hurt.projection.lineAlarm.why, /^A day-to-day, and the line's price puts him at /);
  assert.ok(hurt.projection.lineZ < ROLE.zLo);
  const plain = run(new Map());
  assert.equal(plain.projection.lineAlarm, undefined);
  assert.equal(plain.projection.lineRatio, hurt.projection.lineRatio);
  // (the label cuts nothing: the same guard, side and stake as without the cause)
  assert.equal(hurt.guard?.kind, 'gap');
  assert.equal(plain.guard?.kind, 'gap');
  assert.deepEqual([hurt.side, hurt.units], [plain.side, plain.units]);
});
