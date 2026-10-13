// The book's line as a news alarm outside the NFL (props.mjs lineAlarmOf), the line log (linelog.mjs) and the
// self-check's far-line check (selfcheck.mjs C20): a far line with a cause known before the game a role CHECK on
// the side against the market's reading, a far line alone nothing; every line seen logged once and again only on a
// change, a gzip member a run, read back whole; the far lines' record against the book's chance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { lineAlarmOf, ROLE, VAC_SWING } from '../libs/ranker/scripts/model/props.mjs';
import { gameRows, logLines, monthFile, newRows, propRows, pruneLast, readLines, LAST_KEEP } from '../libs/ranker/scripts/model/linelog.mjs';
import { c20, lineRatioOf, TITLES } from '../libs/ranker/scripts/model/selfcheck.mjs';

test('lineAlarmOf: a far line with a cause its way is a role CHECK, its safe side the market reading', () => {
  // (a low line, questionable: the under safe, the over the CHECK)
  const q = lineAlarmOf({ sport: 'nba', name: 'A', mu: 20, implied: 10, status: { why: 'A questionable' } });
  assert.equal(q.key, 'line-questionable');
  assert.equal(q.safe, 'under');
  assert.match(q.why, /^A questionable, and the line's price puts him at 10 against the model's 20: the market reading a minutes cap or an early exit/);
  // (the second night of a back-to-back, the NBA's and the NHL's; MLB has none)
  assert.equal(lineAlarmOf({ sport: 'nhl', mu: 3, implied: 1.5, b2b: 1 }).key, 'line-rest');
  assert.equal(lineAlarmOf({ sport: 'mlb', mu: 3, implied: 1.5, b2b: 1 }), null);
  // (an NHL goalie expected, not confirmed; an MLB batter's lineup not posted)
  assert.equal(lineAlarmOf({ sport: 'nhl', name: 'G', mu: 30, implied: 15, status: { why: 'G expected, not confirmed' } }).key, 'line-goalie');
  assert.equal(lineAlarmOf({ sport: 'mlb', mu: 1.5, implied: 0.7, status: { why: 'lineup not posted (NYY)' } }).key, 'line-lineup');
  // (an MLB starter: an opener's last starts, a short leash, a long rest)
  assert.equal(lineAlarmOf({ sport: 'mlb', pitcher: true, mu: 15, implied: 6, pitches: [35, 41] }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ sport: 'mlb', pitcher: true, mu: 15, implied: 6, leash: Math.log(0.8), pitches: [80, 70] }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ sport: 'mlb', pitcher: true, mu: 15, implied: 6, rest: 'long', pitches: [95, 99] }).key, 'line-pitch-count');
  assert.equal(lineAlarmOf({ sport: 'mlb', pitcher: true, mu: 15, implied: 6, leash: 0, pitches: [95, 99] }), null);
  // (teammates out: a high line, the over safe; teammates back: a low one)
  const out = lineAlarmOf({ sport: 'nba', mu: 10, implied: 20, vacNow: VAC_SWING, vacThen: 0 });
  assert.deepEqual([out.key, out.safe], ['line-teammates', 'over']);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 5, vacNow: 0, vacThen: VAC_SWING }).key, 'line-back');
});

test('lineAlarmOf: a far line alone, a cause the other way, a near line, no price or the NFL: nothing (the old behavior)', () => {
  assert.equal(lineAlarmOf({ sport: 'nhl', mu: 1, implied: 2.5 }), null);
  assert.equal(lineAlarmOf({ sport: 'nhl', mu: 1, implied: 0.4 }), null);
  // (questionable explains a low line, not a high one; teammates out a high one, not a low one)
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 20, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 5, vacNow: 0.5, vacThen: 0 }), null);
  // (inside the band: ROLE.ratioLo and ROLE.ratioHi themselves aren't past it)
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 10 * ROLE.ratioLo, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: 10 * ROLE.ratioHi, vacNow: 0.5 }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 10, implied: null, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nba', mu: 0, implied: 1, status: { why: 'A questionable' } }), null);
  assert.equal(lineAlarmOf({ sport: 'nfl', mu: 10, implied: 2, status: { why: 'A questionable' } }), null);
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
  // (pruned LAST_KEEP past the start; one with no start known kept)
  const pruned = pruneLast({ ...last, 'x|ml|e': [null, 1, 2, null] }, t + 36e5 + LAST_KEEP + 1);
  assert.deepEqual(Object.keys(pruned), ['x|ml|e']);
});

test('the line log: a gzip member a run appended to the month file, read back whole; dry writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linelog-'));
  try {
    const t = Date.parse('2026-10-13T12:00:00Z');
    const rows = gameRows('401', { spread: { home: { line: -1.5, odds: 150 }, away: { line: 1.5, odds: -180 } } }, 'e');
    assert.equal(logLines('nhl', rows, { now: t, dir, dry: true }), 1);
    assert.equal(fs.existsSync(dir) && fs.readdirSync(dir).length, 0);
    assert.equal(logLines('nhl', rows, { now: t, dir }), 1);
    assert.equal(logLines('nhl', rows, { now: t + 36e5, dir }), 0);
    assert.equal(logLines('nhl', [{ ...rows[0], line: -2.5 }], { now: t + 72e5, dir }), 1);
    const file = monthFile('nhl', t, dir);
    assert.ok(file.endsWith('nhl-2026-10.jsonl.gz'));
    assert.equal(gunzipSync(fs.readFileSync(file)).toString().trim().split('\n').length, 2);
    const back = readLines('nhl', dir);
    assert.deepEqual(back.map((r) => r[3]), [-1.5, -2.5]);
    assert.deepEqual(readLines('nba', dir), []);
    // (an index unreadable: started over, the next sighting logged again, nothing thrown)
    fs.writeFileSync(path.join(dir, 'last-nhl.json'), '{');
    assert.equal(logLines('nhl', [{ ...rows[0], line: -2.5 }], { now: t + 108e5, dir }), 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// (a graded prop at the book's even price, its line's ratio kept)
let seq = 0;
const prop = (ratio, side, won, over = {}) => ({ id: `p${++seq}`, market: 'prop', side, fair: 0.5, p: 0.55, units: 1, status: won ? 'won' : 'lost', profit: won ? 0.91 : -1, projection: { mean: 2, lineRatio: ratio }, ...over });

test('C20: the far lines bet against the market doing worse than the near ones a watch; too few a report; the alarm CHECKs apart', () => {
  assert.equal(TITLES.C20, 'Line far from the projection (all graded)');
  // (an estimated ratio: the bet's line, fair chance and dispersion; an assumed price none)
  const est = lineRatioOf({ market: 'prop', side: 'under', fair: 0.5, line: 2.5, projection: { mean: 1, r: 1000 } });
  assert.equal(est.by, 'estimated');
  assert.ok(est.ratio > 2.5 && est.ratio < 3.2);
  assert.equal(lineRatioOf({ market: 'prop', oddsAssumed: true, side: 'under', fair: 0.5, line: 2.5, projection: { mean: 1, lineRatio: 3 } }), null);
  const bets = [
    ...Array.from({ length: 70 }, (_, i) => prop(2, 'under', i < 20)),
    ...Array.from({ length: 70 }, (_, i) => prop(1, i % 2 ? 'over' : 'under', i < 35)),
  ];
  const checks = [{ ...prop(0.4, 'over', true), checkResult: { status: 'won', profit: 1 }, status: 'check', cause: 'role', roleReason: 'line-rest' }];
  const c = c20({ sport: 'nhl', bets, checks });
  assert.equal(c.id, 'C20');
  assert.equal(c.status, 'watch');
  assert.match(c.headline, /did worse against the book than the near ones \(z -2\.54\): the far line alone is news, a PASS/);
  assert.equal(c.rows.find((r) => r.key === 'bets: line far over, the model against it').n, 70);
  assert.equal(c.rows.find((r) => r.key === "CHECKs: the line alarm's (a far line with its cause)").n, 1);
  const few = c20({ sport: 'nhl', bets: bets.slice(50, 100), checks: [] });
  assert.equal(few.status, 'thin');
});

test('priceProps (the NHL): a far low line on a day-to-day player a role CHECK (line-questionable) ahead of the gap; without the cause, the gap as before; every priced prop its line ratio', async () => {
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
  assert.equal(hurt.guard?.kind, 'role');
  assert.equal(hurt.guard?.role, 'line-questionable');
  assert.match(hurt.guard.why, /^A day-to-day, and the line's price puts him at /);
  assert.ok(hurt.projection.lineRatio < ROLE.ratioLo);
  assert.ok(Number.isFinite(hurt.projection.implied));
  const plain = run(new Map());
  assert.equal(plain.guard?.kind, 'gap');
  assert.equal(plain.projection.lineRatio, hurt.projection.lineRatio);
});
