// The game lines' history bar (libs/ranker/scripts/model/desk.mjs lineBar, barGate, bothGates; gate.mjs lineBarOf;
// DECISIONS.md D51, 2026-10-19): the priced history's flat record of the Bot's positive-edge line picks by segment
// (the market and the side class the Book's chance puts the pick in), written by gate.mjs --record, pooled with the
// live line bets since the epoch; a segment not net positive beyond noise bets at the practice stake, never off;
// the live bets (the practice ones among them) can earn it back; the desk never writes the file. No network, no
// files: the rows are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { BAR_MIN, BAR_Z, PRACTICE_UNITS, SIDE_CLASSES, addStats, barGate, barOf, barStats, bothGates, flatProfit, gatedPlacement, lineBar, lineGate, readLineBar, segmentOf } from '../libs/ranker/scripts/model/desk.mjs';
import { lineBarOf } from '../libs/ranker/scripts/model/gate.mjs';
import { MODEL_EPOCH } from '../libs/ranker/scripts/model/leagues.mjs';
import { levelOf } from '../libs/ranker/scripts/model/picks.mjs';
import { rng } from '../libs/ranker/scripts/model/gate-score.mjs';

const MODEL = path.join(import.meta.dirname, '../libs/ranker/scripts/model');
const src = (f) => fs.readFileSync(path.join(MODEL, f), 'utf8');
const after = new Date(Date.parse(MODEL_EPOCH) + 36e5).toISOString();
const before = new Date(Date.parse(MODEL_EPOCH) - 36e5).toISOString();
// (a live line bet: its side's fair chance, its price, its result)
const bet = (i, { market = 'ml', side = 'away', fair = 0.4, odds = 150, won = i % 2 === 0, placedAt = after, extra = {} } = {}) => ({ id: `b${i}`, sport: 'nhl', event: `g${i}`, market, side, fair, odds, status: won ? 'won' : 'lost', placedAt, intent: 'edge', units: 1, ...extra });
// (a prior's stats from flat picks of a mean profit m over n, spread as wins and losses would be)
const statsOf = (n, m, sd = 1) => ({ n, sum: n * m, sum2: n * (sd * sd + m * m) });

test('the segment: the market and the side class by the pick\'s own fair chance (favored over .5, the dog under), a total by its side', () => {
  assert.equal(segmentOf('ml', 'home', 0.62), 'ml:fav:late');
  assert.equal(segmentOf('ml', 'away', 0.38), 'ml:dog:late');
  assert.equal(segmentOf('spread', 'home', 0.49), 'spread:dog:late');
  assert.equal(segmentOf('spread', 'away', 0.5), 'spread:fav:late');
  assert.equal(segmentOf('total', 'over', 0.48), 'total:over:late');
  assert.equal(segmentOf('total', 'under', 0.52), 'total:under:late');
  assert.deepEqual(SIDE_CLASSES, ['fav', 'dog', 'over', 'under']);
  // (a flat pick's profit at its price)
  assert.equal(flatProfit(150, 'won'), 1.5);
  assert.equal(flatProfit(-200, 'won'), 0.5);
  assert.equal(flatProfit(-200, 'lost'), -1);
  assert.equal(flatProfit(120, 'push'), 0);
});

test('the stats add, and a segment is on only past the minimum worth and BAR_Z standard errors over 0', () => {
  const a = barStats([{ profit: 1, w: 1 }, { profit: -1, w: 0.5 }]);
  assert.deepEqual(a, { n: 1.5, sum: 0.5, sum2: 1.5 });
  const b = addStats(a, barStats([{ profit: 0.5, w: 2 }]));
  assert.equal(b.n, 3.5);
  assert.equal(b.sum, 1.5);
  // (under the minimum: practice, said so)
  const under = barOf(statsOf(BAR_MIN - 1, 0.2));
  assert.equal(under.on, false);
  assert.match(under.why, /under 40/);
  // (a mean over 0 but inside the noise: practice; well past it: on)
  const noisy = barOf(statsOf(100, 0.05, 1));
  assert.equal(noisy.on, false, 'a +5% mean over 100 picks (SE 10%) is not earned');
  assert.match(noisy.why, /practice stake/);
  const earned = barOf(statsOf(400, 0.1, 1));
  assert.equal(earned.on, true, 'a +10% mean over 400 picks (SE 5%) is');
  assert.match(earned.why, /full stakes/);
  // (a losing record never on, however many)
  assert.equal(barOf(statsOf(5000, -0.02)).on, false);
  assert.ok(BAR_Z >= 1 && BAR_MIN >= 40, 'the bar is earned, not guessed');
});

test('the bar pools the file with the live line bets since the epoch: the live rows can earn a segment back, or lose it; pre-epoch rows, tracked rows, voids, open rows, props and other sports never count', () => {
  const prior = { segments: { 'ml:dog:late': statsOf(200, -0.08), 'spread:fav:late': statsOf(400, 0.12), 'total:over:late': statsOf(10, 0.3) } };
  // (no live bets: the file's verdicts)
  const base = lineBar(prior, [], 'nhl');
  assert.equal(base['ml:dog:late'].on, false);
  assert.equal(base['ml:dog:late'].practice, true);
  assert.equal(base['spread:fav:late'].on, true);
  assert.equal(base['total:over:late'].on, false);
  assert.equal(base['ml:dog:late'].live.n, 0);
  assert.equal(base['ml:dog:late'].prior.n, 200);
  // (the live bets whole, at their flat result: a hot run of dog wins at +150 earns ml:dog its stake back)
  const hot = Array.from({ length: 300 }, (_, i) => bet(i, { won: i % 5 !== 0 }));
  const earned = lineBar(prior, hot, 'nhl');
  assert.equal(earned['ml:dog:late'].on, true, earned['ml:dog:late'].why);
  assert.equal(earned['ml:dog:late'].live.n, 300);
  assert.ok(earned['ml:dog:late'].live.mean > 0.5);
  assert.equal(earned['ml:dog:late'].n, 500);
  // (a cold run loses spread:fav its stake)
  const cold = Array.from({ length: 300 }, (_, i) => bet(i, { market: 'spread', side: 'home', fair: 0.58, odds: -110, won: i % 3 === 0 }));
  assert.equal(lineBar(prior, cold, 'nhl')['spread:fav:late'].on, false);
  // (the rows that never count)
  const noise = [
    bet(1, { won: true, placedAt: before }),
    bet(2, { won: true, extra: { intent: 'track', units: 0, trackUnits: 0.5 } }),
    bet(3, { won: true, extra: { void: true } }),
    bet(4, { won: true, extra: { status: 'open' } }),
    bet(5, { won: true, market: 'prop', extra: { propType: 'sog' } }),
    bet(6, { won: true, extra: { sport: 'nba' } }),
  ];
  const none = lineBar(prior, noise, 'nhl');
  assert.equal(none['ml:dog:late'].live.n, 0);
  assert.equal(none['ml:dog:late'].on, false);
  // (a practice bet counts like any other: its flat result is how a segment earns its stake back)
  const practice = lineBar(prior, [bet(7, { won: true, extra: { units: PRACTICE_UNITS, practice: 'practice stake: the segment' } })], 'nhl');
  assert.equal(practice['ml:dog:late'].live.n, 1);
  // (a segment the file lacks shows from the live bets alone, under the minimum: practice)
  const fresh = lineBar(prior, [bet(8, { market: 'total', side: 'under', fair: 0.5, odds: -110 })], 'nhl');
  assert.equal(fresh['total:under:late'].on, false);
  assert.equal(fresh['total:under:late'].prior.n, 0);
});

test('a pick\'s gate: its segment\'s; one the bar never priced is the practice stake, said so; with the CLV gate, either failing is the practice stake with its reason, never 0 units, a LIKE at most', () => {
  const bar = lineBar({ segments: { 'ml:dog:late': statsOf(200, -0.08), 'spread:fav:late': statsOf(400, 0.12) } }, [], 'nhl');
  const dog = barGate(bar, 'ml', 'away', 0.3);
  assert.equal(dog.on, false);
  assert.equal(dog.segment, 'ml:dog:late');
  const fav = barGate(bar, 'spread', 'home', 0.6);
  assert.equal(fav.on, true);
  const unknown = barGate(bar, 'total', 'over', 0.5);
  assert.equal(unknown.on, false);
  assert.match(unknown.why, /no history priced yet/);
  // (no file at all: every segment at the practice stake till the live bets earn it)
  assert.equal(barGate(lineBar(null, [], 'nhl'), 'ml', 'home', 0.6).on, false);
  // (the two gates together)
  const clvOn = lineGate([], 'nhl');
  assert.equal(clvOn.on, true);
  assert.equal(bothGates(clvOn, fav).on, true);
  const both = bothGates(clvOn, dog);
  assert.equal(both.on, false);
  assert.equal(both.practice, true);
  assert.match(both.why, /practice stake/);
  // (the placement: an edge still bet, at the practice stake, tagged; no edge tracked as it would be anyway)
  const placed = gatedPlacement(true, 2.5, both);
  assert.equal(placed.intent, 'edge');
  assert.equal(placed.units, PRACTICE_UNITS);
  assert.match(placed.practice, /practice stake/);
  assert.equal(gatedPlacement(false, 2.5, both).intent, 'track');
  assert.equal(gatedPlacement(true, 2.5, bothGates(clvOn, fav)).units, 2.5);
  // (a LIKE at most on the Book)
  assert.equal(levelOf({ ...placed, market: 'ml', odds: 150, p: 0.5, fair: 0.4, ev: 0.25, status: 'open' }), 'low');
  // (the bar's segment on the bet is the pick's side's)
  assert.match(src('run.mjs'), /barGate\(r\.lineBar, key, pick\.side, pick\.fair, \{ hours: ahead \/ 36e5, ev: pick\.ev, reasons, aside: r\.lineBarAside \}\)/);
  assert.match(src('run.mjs'), /gatedPlacement\(pick\.ev > 0 && !noPrice, units, gate\)/);
});

test('the bar walk-forward (the replayed record): a segment is on only from the month after the picks that earned it, never on its own month; no history, the practice stake; the replay stakes a barred line at the practice units', async () => {
  const { walkBar } = await import('../libs/ranker/scripts/model/desk.mjs');
  const t = (m, d = 1) => Date.UTC(2026, m - 1, d, 12);
  // (ml:dog wins big through March, then the verdict: on from April; spread:fav never earns it)
  const picks = [];
  for (let m = 1; m <= 3; m++) for (let i = 0; i < 100; i++) picks.push({ t: t(m, 1 + (i % 27)), season: 2026, segment: 'ml:dog:late', profit: i % 4 === 0 ? -1 : 1.5 });
  for (let i = 0; i < 100; i++) picks.push({ t: t(2, 1 + (i % 27)), season: 2026, segment: 'spread:fav:late', profit: i % 2 ? -1 : 0.9 });
  const at = walkBar(picks);
  assert.equal(at(t(1, 15), 'ml:dog:late'), false, 'the first month has no history');
  assert.equal(at(t(4, 15), 'ml:dog:late'), true, 'three months of wins earn it');
  assert.equal(at(t(9, 15), 'ml:dog:late'), true, 'a later month with no picks reads the last verdict');
  assert.equal(at(t(4, 15), 'spread:fav:late'), false);
  assert.equal(at(t(4, 15), 'total:over:late'), false, 'a segment never priced');
  assert.equal(at(t(2, 15), 'ml:dog:late'), barOf({ n: 100, sum: 100 * (0.75 * 1.5 - 0.25), sum2: 100 * (0.75 * 2.25 + 0.25) }).on, "February reads January's 100 alone");
  // (the replayed record stakes a barred line at the practice units, a LIKE, and counts it)
  const src_ = src('replay-record.mjs');
  assert.match(src_, /V\.desk\.walkBar\(/);
  assert.match(src_, /(?:const|let) units = barred \? practiceUnits : fullUnits/);
  assert.match(src_, /barred: flags\.barred/);
});

test("the gate's bar of a version: the positive-edge picks on the history's closes, flat at their own price, by segment, weighted by season; written by --record, read by the desk, never written by it", () => {
  const r = rng(7);
  const rows = [];
  for (let i = 0; i < 600; i++) {
    const f = 0.3 + 0.4 * r();
    // (ml rows: the Bot leans the dog a little; the dog's "edge" loses as the de-vig's shade says)
    const market = i % 3 === 0 ? 'total' : 'ml';
    const p = market === 'ml' ? f - 0.03 : f + 0.03;
    const y = r() < (market === 'ml' ? f + 0.02 : f) ? 1 : 0;
    const over = Math.round(-100 * (f / (1 - f)) * 1.04);
    const under = Math.round(-100 * ((1 - f) / f) * 1.04);
    rows.push({ id: `h:${i}:${market}:c`, event: `g${i}`, market, stat: market, line: market === 'total' ? 5.5 : null, day: '2026-01-01', t: Date.UTC(2026, 0, 1 + (i % 28)), season: 2026, f, p, raw: p, y, q: null, overOdds: over > 0 ? over : over, underOdds: under, w: i < 300 ? 1 : 0.5 });
  }
  const V = { desk: { BAR_Z, BAR_MIN, segmentOf, barStats, barOf } };
  const bar = lineBarOf(V, rows, 2026);
  assert.equal(bar.z, BAR_Z);
  assert.equal(bar.min, BAR_MIN);
  assert.ok(bar.picks > 100, `${bar.picks} picks`);
  assert.ok(Object.keys(bar.segments).length >= 2);
  for (const [k, s] of Object.entries(bar.segments)) {
    assert.ok(s.n <= s.rows, `${k}: the worth never over the rows (the weights halve)`);
    assert.equal(typeof s.on, 'boolean');
    assert.ok(s.sum2 >= 0);
  }
  // (the file round-trips through the desk's reader and pools as a prior)
  const dir = mkdtempSync(path.join(tmpdir(), 'line-bar-'));
  fs.mkdirSync(path.join(dir, 'apps/nhl/src/StaticData/model'), { recursive: true });
  writeFileSync(path.join(dir, 'apps/nhl/src/StaticData/model/line-bar.json'), JSON.stringify({ sport: 'nhl', ...bar }));
  const read = readLineBar(dir, 'nhl');
  assert.ok(read?.segments);
  const live = lineBar(read, [], 'nhl');
  for (const k of Object.keys(bar.segments)) assert.equal(live[k].on, bar.segments[k].on, `${k} as recorded`);
  assert.equal(readLineBar(dir, 'nba'), null);
  // (the record writes it; the desk only reads: run.mjs never writes line-bar.json)
  assert.match(src('gate.mjs'), /line-bar\.json/);
  assert.doesNotMatch(src('run.mjs'), /write[A-Za-z]*\([^\n]*line-bar/);
  assert.match(src('run.mjs'), /readLineBar\(ROOT, sport\)/);
});

test('the timing: a line bet EARLY_HOURS or more before its start is an early segment of its own, nearer (or with no hours) a late one; the history\'s clean opens and closes alike', async () => {
  const { EARLY_HOURS, timingOf } = await import('../libs/ranker/scripts/model/desk.mjs');
  assert.equal(EARLY_HOURS, 6);
  assert.equal(timingOf(26), 'early');
  assert.equal(timingOf(6), 'early');
  assert.equal(timingOf(5.9), 'late');
  assert.equal(timingOf(null), 'late');
  assert.equal(segmentOf('ml', 'away', 0.3, 20), 'ml:dog:early');
  assert.equal(segmentOf('total', 'under', 0.5, 1), 'total:under:late');
  // (a live bet's timing from its placement: an early winner earns the early segment, never the late one)
  const start = new Date(Date.parse(after) + 20 * 36e5).toISOString();
  const early = Array.from({ length: 300 }, (_, i) => bet(i, { won: i % 5 !== 0, extra: { start } }));
  const bar = lineBar(null, early, 'nhl');
  assert.equal(bar['ml:dog:early'].on, true);
  assert.equal(bar['ml:dog:late'], undefined);
  assert.equal(barGate(bar, 'ml', 'away', 0.4, { hours: 20, ev: 0.05 }).on, true);
  assert.equal(barGate(bar, 'ml', 'away', 0.4, { hours: 2, ev: 0.05 }).on, false, 'the same pick at the close is the late segment');
});

test('the minimum edge: a key is on from the smallest EDGE_GRID return its picks at or over are net positive past the noise; a pick under it is the practice stake, said so', async () => {
  const { EDGE_GRID, edgeStats, keyVerdict, addEdgeStats } = await import('../libs/ranker/scripts/model/desk.mjs');
  assert.deepEqual(EDGE_GRID, [0, 0.01, 0.02, 0.03, 0.05]);
  // (small edges lose, the 3%-plus win well)
  const picks = [];
  for (let i = 0; i < 600; i++) picks.push({ ev: 0.005, profit: i % 3 === 0 ? 0.85 : -1, w: 1 });
  for (let i = 0; i < 300; i++) picks.push({ ev: 0.04, profit: i % 3 === 0 ? -1 : 0.95, w: 1 });
  const st = edgeStats(picks);
  assert.equal(st.n, 900);
  assert.equal(st.edges[0.03].n, 300);
  const v = keyVerdict(st);
  assert.equal(v.on, true);
  assert.equal(v.minEdge, 0.01, 'the smallest step whose picks clear: the 4% ones alone from 1%');
  const added = addEdgeStats(st, edgeStats([{ ev: 0.04, profit: -1, w: 1 }]));
  assert.equal(added.edges[0.03].n, 301);
  const bar = lineBar({ segments: { 'ml:fav:late': st } }, [], 'nhl');
  assert.equal(barGate(bar, 'ml', 'home', 0.6, { hours: 1, ev: 0.04 }).on, true);
  const low = barGate(bar, 'ml', 'home', 0.6, { hours: 1, ev: 0.005 });
  assert.equal(low.on, false);
  assert.match(low.why, /under the segment's minimum edge/);
  // (a losing key: no step on, off)
  assert.equal(keyVerdict(edgeStats(picks.slice(0, 600))).on, false);
});

test('the named reasons: from the schedule alone (the rest by the Eastern calendar, a back-to-back a game the day before); a pick carrying a reason whose record is on bets at full stakes whatever its segment; a reason with no record does nothing', async () => {
  const { scheduleRest, reasonsOf, LINE_REASONS, REST_CAP } = await import('../libs/ranker/scripts/model/desk.mjs');
  const games = [
    { id: 1, date: '2026-10-01T23:00Z', home: 'A', away: 'B' },
    { id: 2, date: '2026-10-02T23:30Z', home: 'C', away: 'A' },
    { id: 3, date: '2026-10-06T00:00Z', home: 'C', away: 'B' },
  ];
  const s = scheduleRest(games);
  assert.deepEqual(s.get('1'), { rest: [REST_CAP, REST_CAP], b2b: [false, false] });
  assert.deepEqual(s.get('2'), { rest: [REST_CAP, 1], b2b: [false, true] });
  // (game 3 starts 8 PM Eastern on Oct 5: C three days since Oct 2, B four (capped))
  assert.deepEqual(s.get('3').rest, [3, 4]);
  assert.deepEqual(reasonsOf('nhl', 'ml', 'home', s.get('2')), ['reason:restedVsB2b:ml']);
  assert.deepEqual(reasonsOf('nhl', 'ml', 'away', s.get('2')), []);
  assert.deepEqual(reasonsOf('nhl', 'spread', 'home', s.get('2')), ['reason:restedVsB2b:spread', 'reason:rest2:spread'], 'three days more rest too');
  assert.deepEqual(reasonsOf('nhl', 'total', 'over', s.get('2')), [], 'never a total');
  assert.deepEqual(reasonsOf('mlb', 'ml', 'home', s.get('2')), [], "MLB's back-to-backs are every series: no reason");
  assert.deepEqual(reasonsOf('nba', 'spread', 'home', { rest: [3, 1], b2b: [false, true] }), ['reason:rest2:spread']);
  assert.deepEqual(reasonsOf('nhl', 'ml', 'home', null), []);
  assert.ok(Object.values(LINE_REASONS).flat().every((x) => x.markets.every((m) => m === 'ml' || m === 'spread')));
  // (the reason's own record lifts a pick its segment holds at the practice stake)
  const stats = (n, m, sd = 1) => ({ n, sum: n * m, sum2: n * (sd * sd + m * m), edges: {} });
  const bar = lineBar({ segments: { 'ml:dog:late': stats(400, -0.05), 'reason:restedVsB2b:ml': stats(600, 0.12) } }, [], 'nhl');
  const g = barGate(bar, 'ml', 'home', 0.45, { hours: 2, ev: 0.03, reasons: ['reason:restedVsB2b:ml'] });
  assert.equal(g.on, true);
  assert.equal(g.reason, 'reason:restedVsB2b:ml');
  assert.match(g.why, /restedVsB2b/);
  assert.equal(barGate(bar, 'ml', 'home', 0.45, { hours: 2, ev: 0.03, reasons: [] }).on, false);
  assert.equal(barGate(bar, 'ml', 'home', 0.45, { hours: 2, ev: 0.03, reasons: ['reason:rest2:ml'] }).on, false, 'a reason with no record');
  // (a live bet's reasons pool into its reasons' keys)
  const live = lineBar(null, [bet(1, { won: true, extra: { reasons: ['reason:restedVsB2b:ml'] } })], 'nhl');
  assert.equal(live['reason:restedVsB2b:ml'].live.n, 1);
  // (the desk stores the reasons on the bet and reads the schedule for them, never a line or a box score)
  assert.match(src('run.mjs'), /const sched = scheduleRest\(r\.history\)/);
  assert.match(src('run.mjs'), /\.\.\.\(reasons\.length \? \{ reasons \} : \{\}\)/);
});

test('the bar walk-forward by keys and edge: a pick is on where any of its keys (its segment, its reasons) was on by the month before at its return', async () => {
  const { walkBar } = await import('../libs/ranker/scripts/model/desk.mjs');
  const t = (m, d = 1) => Date.UTC(2026, m - 1, d, 12);
  const picks = [];
  for (let m = 1; m <= 3; m++) for (let i = 0; i < 100; i++) picks.push({ t: t(m, 1 + (i % 27)), season: 2026, keys: ['ml:dog:late', 'reason:restedVsB2b:ml'], ev: 0.04, profit: i % 4 === 0 ? -1 : 1.5 });
  for (let m = 1; m <= 3; m++) for (let i = 0; i < 300; i++) picks.push({ t: t(m, 1 + (i % 27)), season: 2026, keys: ['ml:dog:late'], ev: 0.005, profit: i % 5 === 0 ? 1.5 : -1 });
  const at = walkBar(picks);
  assert.equal(at(t(4, 10), ['ml:dog:late'], 0.04), true, 'the segment at a 4% return (its minimum edge cuts the small ones)');
  assert.equal(at(t(4, 10), ['ml:dog:late'], 0.005), false, "under the segment's minimum edge");
  assert.equal(at(t(4, 10), ['reason:restedVsB2b:ml'], 0.04), true);
  assert.equal(at(t(1, 10), ['ml:dog:late', 'reason:restedVsB2b:ml'], 0.04), false, 'no month before');
  // (the replay judges a line by its keys and its return; the gate's bar reads the clean opens and the reasons)
  assert.match(src('replay-record.mjs'), /barAt\(x\.t, keysOf\(x, sd\), sd\.ev\)/);
  assert.match(src('gate.mjs'), /openRows: histLines\.open, clean: V\.replay\?\.cleanOpenOf/);
});

test("the bar's own place: by season, the bar stakes a season's lines only where, on every season before, its lines earned at least the full stakes'; the first season the bar's; the verdict for what comes next from every season; where it stands aside every line is at its own stake, said so", async () => {
  const { barPlace } = await import('../libs/ranker/scripts/model/replay-record.mjs');
  const { barAside } = await import('../libs/ranker/scripts/model/desk.mjs');
  // (MLB's shape: the barred lines won at their Kelly stakes; the bar cost units every season)
  const bets = [];
  for (const season of [2021, 2022, 2023]) {
    for (let i = 0; i < 10; i++) bets.push({ season, profit: i % 2 ? 0.5 : -0.5, full: { units: 2, band: 'high', profit: i % 2 ? 2 : -1 } });
    bets.push({ season, profit: 1 });
  }
  const p = barPlace(bets);
  assert.deepEqual(p.bySeason, { 2021: true, 2022: false, 2023: false });
  assert.equal(p.applies, false);
  assert.ok(p.fullUnits > p.barUnits);
  // (a bar that saves units keeps its place)
  const saves = bets.map((b) => (b.full ? { ...b, full: { ...b.full, profit: b.profit - 1 } } : b));
  assert.equal(barPlace(saves).applies, true);
  assert.equal(barPlace([]).applies, true, 'nothing to judge on: the bar');
  // (the desk reads the file's verdict: aside, every line at its own stake with the reason; the gate on)
  assert.equal(barAside(null), null);
  assert.equal(barAside({ applies: true }), null);
  const why = barAside({ applies: false, place: { fullUnits: 2.5, barUnits: -13.7 } });
  assert.match(why, /stands aside/);
  const bar = lineBar({ segments: { 'ml:dog:late': { n: 400, sum: -20, sum2: 420, edges: {} } } }, [], 'mlb');
  assert.equal(barGate(bar, 'ml', 'away', 0.4, { hours: 1, ev: 0.03 }).on, false);
  const aside = barGate(bar, 'ml', 'away', 0.4, { hours: 1, ev: 0.03, aside: why });
  assert.equal(aside.on, true);
  assert.equal(aside.aside, true);
  // (the replay restores a season's barred lines to their full stakes where the bar stands aside; the record writes
  // the place into line-bar.json; the desk passes it to every line's gate)
  assert.match(src('replay-record.mjs'), /bar\.bySeason\[b\.season\] === false/);
  assert.match(src('gate.mjs'), /applies: place\.applies, place/);
  assert.match(src('run.mjs'), /aside: r\.lineBarAside/);
});
