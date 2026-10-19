// The replay gate (libs/ranker/scripts/model/gate.mjs, gate-score.mjs: champion against challenger, the owner's rule
// of 2026-10-18) and the self-check's leak hunt (leaks.mjs, C23), on made-up fixtures: no network, no cache. The
// eras and the season weights; the bootstrap's word on a tie, a real gain and a real loss; the betting layer's
// numbers on a tiny slate; the walk-forward pricing never reading its own day; the verdict SHIP on a copy of the
// champion and HOLD on a worse one; the scorecard's entries; the leak hunt finding a planted leak, staying quiet on
// noise, and its causes and fixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ERAS, bootDiff, betCompare, betSummary, gateVerdict, normalCrps, normalLoss, pairRows, projCompare, rng, seasonWeight, sportVerdict, topPicks, verdictOf } from '../libs/ranker/scripts/model/gate-score.mjs';
import { addEntry, compareScores, frozenOf, pricePropsWalk, pricedProps, propRow, resolveVersion, scorecardOf } from '../libs/ranker/scripts/model/gate.mjs';
import * as correct from '../libs/ranker/scripts/model/correct.mjs';
import * as desk from '../libs/ranker/scripts/model/desk.mjs';
import { DIMS, LEAK_N, bhDiscoveries, huntLeaks, leakRows, rowGain } from '../libs/ranker/scripts/model/leaks.mjs';
import { CHECKS, TITLES, selfCheck } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { loadEngine } from './support/engine.mjs';

// ---- fixtures ----

// (a made-up history of priced rows: n slates of k props, the truth p0, the book's no-vig f a noisy read of it, the
// model's chance m another; seeded)
function slate({ days = 12, k = 30, sport = 'nhl', bias = 0, seed = 7, from = '2026-10-08' } = {}) {
  const r = rng(seed);
  const out = [];
  const t0 = Date.parse(`${from}T23:00:00Z`);
  for (let d = 0; d < days; d++)
    for (let i = 0; i < k; i++) {
      const p0 = 0.35 + 0.3 * r();
      const f = Math.min(0.95, Math.max(0.05, p0 + (r() - 0.5) * 0.06));
      const m = Math.min(0.95, Math.max(0.05, p0 + (r() - 0.5) * 0.1 + bias));
      const won = r() < p0;
      const q = Math.min(0.95, Math.max(0.05, p0 + (r() - 0.5) * 0.03));
      const side = i % 2 ? 'over' : 'under';
      const o = side === 'over';
      out.push({
        id: `${sport}-${d}-${i}`,
        event: `${sport}-g${d}-${Math.floor(i / 6)}`,
        sport,
        market: 'prop',
        propType: i % 3 ? 'shots' : 'pts',
        statLabel: i % 3 ? 'Shots' : 'Points',
        team: String(1 + (i % 8)),
        matchup: 'AAA @ BBB',
        pick: `Player ${i} ${o ? 'Over' : 'Under'} ${1.5 + (i % 4)}`,
        line: 1.5 + (i % 4),
        side,
        odds: -110,
        otherOdds: -110,
        start: new Date(t0 + d * 864e5).toISOString(),
        placedAt: new Date(t0 + d * 864e5 - (i % 3) * 5 * 36e5).toISOString(),
        // (the side's chances)
        model: o ? m : 1 - m,
        modelRaw: o ? m : 1 - m,
        fair: o ? f : 1 - f,
        p: o ? m : 1 - m,
        status: o === won ? 'won' : 'lost',
        clv: { q: o ? q : 1 - q, ev: (o ? q : 1 - q) * desk.decimal(-110) - 1 },
        intent: i % 5 ? 'track' : 'edge',
        units: i % 5 ? 0 : 1,
      });
    }
  return out;
}

// ---- gate-score.mjs ----

test('gate: the eras and the season weights (current and two back decide, inside the era)', () => {
  assert.equal(ERAS.nfl.start, 2024);
  assert.equal(ERAS.mlb.start, 2023);
  assert.ok(ERAS.nba.start && ERAS.nhl.start);
  const w = (s) => seasonWeight('nfl', s, 2026);
  assert.deepEqual([w(2026).decides, w(2025).decides, w(2024).decides, w(2023).decides], [true, true, true, false]);
  assert.equal(w(2026).w, 1);
  assert.equal(w(2025).w, 0.5);
  assert.ok(w(2023).w < 0.15 && w(2023).w > 0, 'an older season a low-weight sanity check');
  assert.equal(seasonWeight('nfl', 2027, 2026).w, 0, 'a season after the current one: out');
  // (MLB 2022 is the old game, before the pitch clock, even at two back)
  assert.equal(seasonWeight('mlb', 2022, 2024).decides, false);
  assert.equal(seasonWeight('mlb', 2023, 2025).decides, true);
});

test('gate: the bootstrap ties a copy, sees a real gain and a real loss, and is seeded', () => {
  const r = rng(3);
  const clusters = Array.from({ length: 200 }, () => {
    const s = r();
    return { wA: 1, sA: s, wB: 1, sB: s };
  });
  const same = bootDiff(clusters);
  assert.equal(same.diff, 0);
  assert.equal(verdictOf(same), 'tie');
  const worse = bootDiff(clusters.map((c) => ({ ...c, sB: c.sA + 0.05 + 0.01 * (r() - 0.5) })));
  assert.equal(verdictOf(worse), 'worse');
  assert.equal(verdictOf(worse, { higher: true }), 'better', 'higher better: a rise is better');
  const noisy = bootDiff(clusters.map((c) => ({ ...c, sB: c.sA + (r() - 0.5) * 0.5 })));
  assert.equal(verdictOf(noisy), 'tie', 'noise is a tie');
  assert.deepEqual(bootDiff(clusters.map((c) => ({ ...c, sB: c.sA + 0.05 }))), bootDiff(clusters.map((c) => ({ ...c, sB: c.sA + 0.05 }))), 'the same every run');
  assert.equal(bootDiff([]), null);
  assert.equal(verdictOf(null), 'n/a');
});

test('gate: proper scores of a normal (log score and CRPS) are lowest at the truth', () => {
  assert.ok(normalLoss(3, 3, 10) < normalLoss(3, 10, 10));
  assert.ok(normalCrps(3, 3, 10) < normalCrps(3, 10, 10));
  assert.ok(Math.abs(normalCrps(0, 0, 1) - (2 / Math.sqrt(2 * Math.PI) - 1 / Math.sqrt(Math.PI))) < 1e-6);
  assert.equal(normalLoss(1, 1, 0), null);
});

test('gate: the projection layer pairs by key, decides on the deciding seasons, flags the old ones', () => {
  const rows = (shift, oldShift = 0) =>
    Array.from({ length: 600 }, (_, i) => {
      const season = 2022 + (i % 5);
      const base = 1 + (i % 7) * 0.1;
      return { k: `r${i}`, c: `d${i % 60}`, season, v: base + (season >= 2024 ? shift : oldShift) };
    });
  const tie = projCompare('nfl', rows(0), rows(0), 2026);
  assert.equal(tie.decide.verdict, 'tie');
  const hurt = projCompare('nfl', rows(0), rows(0.02), 2026);
  assert.equal(hurt.decide.verdict, 'worse');
  // (worse in the old seasons only: a flag, never the deciding vote)
  const old = projCompare('nfl', rows(0), rows(0, 0.05), 2026);
  assert.equal(old.decide.verdict, 'tie');
  assert.equal(old.sanity.verdict, 'worse');
  const v = sportVerdict({ proj: { props: old } });
  assert.equal(v.pass, true);
  assert.equal(v.flags.length, 1);
  assert.equal(sportVerdict({ proj: { props: hurt } }).pass, false);
  // (rows only one version has: left out of the pairing)
  const p = pairRows([{ k: 'a', c: 1, v: 1 }, { k: 'b', c: 1, v: 1 }], [{ k: 'a', c: 1, v: 2 }]);
  assert.equal(p.n, 1);
  assert.equal(p.onlyA, 1);
});

// (the over-frame rows from the fixture's priced props, at a chance of the version's)
const frame = (bets, pOf = (b) => (b.side === 'over' ? b.p : 1 - b.p)) => bets.map((b) => propRow(b, pOf(b), { over: 1, under: 1 }));

test("gate: the betting layer's numbers on a slate: the gap to the Book, the top picks, the edge picks", () => {
  const rows = frame(slate({ days: 6 }));
  const s = betSummary(rows, { n: 4, practice: 0.5, stakeOf: (ev, o, x, side) => x.stake[side] });
  assert.equal(s.rows, rows.length);
  assert.ok(Number.isFinite(s.gap) && Number.isFinite(s.closeGap));
  assert.equal(s.top.n, 24, 'four a slate, six slates');
  assert.equal(s.top.staked, 12);
  assert.ok(s.top.hit >= 0 && s.top.hit <= 1);
  // (the top picks are each slate's biggest edges, and never a side with no price)
  const picks = topPicks(rows, 2);
  assert.ok(picks.every((p) => p.edge > 0));
  const lines = rows.map((x) => ({ ...x, underOdds: null, p: 0.2, f: 0.5 }));
  assert.equal(topPicks(lines, 3).length, 0, "a game line's other side is never picked");
});

test('gate: a candidate whose chances sit nearer the truth beats; a copy ties', () => {
  const bets = slate({ days: 14, k: 40, seed: 11 });
  const truth = slate({ days: 14, k: 40, seed: 11 });
  const a = frame(bets);
  // (the candidate: halfway from the champion's chance to the close's)
  const b = frame(truth, (x) => {
    const o = x.side === 'over';
    const m = o ? x.p : 1 - x.p;
    const q = o ? x.clv.q : 1 - x.clv.q;
    return 0.5 * m + 0.5 * q;
  });
  const copy = betCompare(a, a, { n: 6 });
  assert.equal(copy.ll.verdict, 'tie');
  assert.equal(copy.close.verdict, 'tie');
  const better = betCompare(a, b, { n: 6 });
  assert.equal(better.close.verdict, 'better');
  const worse = betCompare(b, a, { n: 6 });
  assert.equal(worse.close.verdict, 'worse');
  assert.equal(sportVerdict({ bet: { props: worse } }).pass, false);
  assert.equal(gateVerdict({ nhl: sportVerdict({ bet: { props: better } }) }).verdict, 'SHIP');
  assert.equal(gateVerdict({ nhl: sportVerdict({ bet: { props: worse } }) }).verdict, 'HOLD');
  assert.equal(gateVerdict({}).verdict, 'NO DATA');
});

// ---- gate.mjs ----

test("gate: the props' walk-forward pricing never reads its own day or a later one", () => {
  const bets = [...slate({ days: 10, k: 30, sport: 'nhl', seed: 5 }), ...slate({ days: 10, k: 20, sport: 'nfl', seed: 6 })];
  const V = { correct, desk };
  const all = pricedProps({ nhl: { bets: bets.filter((b) => b.sport === 'nhl') }, nfl: { bets: bets.filter((b) => b.sport === 'nfl') } });
  const mOf = (b) => b.modelRaw;
  const p1 = pricePropsWalk(V, 'nhl', all, mOf);
  assert.equal(p1.size, 300);
  // (every result of the last day turned over: no earlier day's price may move)
  const lastDay = bets.filter((b) => b.sport === 'nhl').at(-1).start.slice(0, 10);
  const flipped = all.map((b) => (b.start.slice(0, 10) === lastDay ? { ...b, status: b.status === 'won' ? 'lost' : 'won' } : b));
  const p2 = pricePropsWalk(V, 'nhl', flipped, mOf);
  for (const [id, p] of p1) {
    const b = all.find((x) => String(x.id) === id);
    if (b.start.slice(0, 10) <= lastDay) assert.equal(p2.get(id), p, `${id}: priced off its own day's results`);
  }
  // (a version from before the correction (no correct.mjs): the trust's shrink, each chance between the book's and
  // the model's. The residual blend (residual.mjs, on since 2026-10-19) may land past the model's chance by design,
  // so it is off for this check, as the gate's champion runs it: RESID_OFF)
  const wasOff = process.env.RESID_OFF;
  process.env.RESID_OFF = '1';
  const p3 = pricePropsWalk({ correct: null, desk }, 'nhl', all, mOf);
  if (wasOff === undefined) delete process.env.RESID_OFF;
  else process.env.RESID_OFF = wasOff;
  for (const b of all.filter((x) => x.sport === 'nhl')) {
    const o = b.side === 'over';
    const f = o ? b.fair : 1 - b.fair;
    const m = o ? b.modelRaw : 1 - b.modelRaw;
    const p = p3.get(String(b.id));
    assert.ok(p >= Math.min(f, m) - 1e-9 && p <= Math.max(f, m) + 1e-9, `${b.id}: ${p} outside ${f} and ${m}`);
  }
});

// (a made-up score as the child process writes it)
function scoreOf(bets, { shift = 0, gamesShift = 0 } = {}) {
  const props = frame(bets, (b) => Math.min(0.99, Math.max(0.01, (b.side === 'over' ? b.p : 1 - b.p) + shift))).map((x) => ({ ...x, stake: { over: 1, under: 1 } }));
  const games = Array.from({ length: 300 }, (_, i) => [`g${i}`, `2026-10-${String(1 + (i % 18)).padStart(2, '0')}`, 2026 - (i % 3), 2 + (i % 5) * 0.1 + gamesShift, 3 + (i % 4) * 0.1, 1, 1]);
  return { sport: 'nhl', current: 2026, epoch: '2026-10-19T00:19:00Z', notes: [], proj: { games, props: null }, bet: { props: { saved: props, replay: null }, lines: { saved: [], replay: null } }, meta: { practiceN: 6, practiceUnits: 0.5 } };
}

test('gate: SHIP on a copy of the champion, HOLD on worse projections or a worse pricing', () => {
  const bets = slate({ days: 12, k: 30, seed: 9 });
  const champ = scoreOf(bets);
  const same = compareScores('nhl', champ, scoreOf(bets));
  assert.equal(same.verdict.pass, true);
  assert.equal(gateVerdict({ nhl: same.verdict }).verdict, 'SHIP');
  const worseGames = compareScores('nhl', champ, scoreOf(bets, { gamesShift: 0.01 }));
  assert.equal(worseGames.proj.games.decide.verdict, 'worse');
  assert.equal(gateVerdict({ nhl: worseGames.verdict }).verdict, 'HOLD');
  // (every over pushed 25 points: the props' log loss worse beyond noise)
  const worseBets = compareScores('nhl', champ, scoreOf(bets, { shift: 0.25 }));
  assert.equal(worseBets.bet.props.ll.verdict, 'worse');
  assert.equal(gateVerdict({ nhl: worseBets.verdict }).verdict, 'HOLD');
});

test("gate: the scorecard's frozen and rolling sets, and an entry a version (a run again replaces it)", () => {
  const bets = slate({ days: 20, k: 20, seed: 4, from: '2026-10-01' });
  const frozen = frozenOf({ nhl: { bets }, nfl: { bets: [] }, nba: { bets: [] }, mlb: { bets: [] } }, '2026-10-15T00:00:00Z');
  assert.ok(frozen.sports.nhl.props.length > 0);
  assert.ok(frozen.sports.nhl.props.every((id) => bets.find((b) => b.id === id).start < '2026-10-15'), 'the frozen set ends where it was fixed');
  assert.ok(!frozen.sports.nhl.props.some((id) => bets.find((b) => b.id === id).start < '2026-10-08'), 'and starts with the saved prices');
  const sc = scorecardOf(scoreOf(bets), frozen, { now: Date.parse('2026-10-21T00:00:00Z') });
  assert.equal(sc.frozen.props.n, frozen.sports.nhl.props.length);
  assert.ok(sc.rolling.props.n > 0 && sc.rolling.props.from);
  for (const k of ['gap', 'closeGap', 'clv', 'hit']) assert.ok(Number.isFinite(sc.frozen.props[k]), k);
  const e = { sport: 'nhl', epoch: 'E1', commit: 'abc', at: '2026-10-19T00:00:00Z', ...sc };
  let file = addEntry(null, e);
  file = addEntry(file, { ...e, at: '2026-10-19T01:00:00Z' });
  assert.equal(file.entries.length, 1, 'the same epoch and commit: replaced');
  file = addEntry(file, { ...e, epoch: 'E0', commit: 'old' });
  assert.deepEqual(file.entries.map((x) => x.epoch), ['E0', 'E1'], 'oldest first');
});

test('gate: a flag candidate is the working tree with its env set', () => {
  const v = resolveVersion('env:GATE_TRY=1,OTHER=x');
  assert.deepEqual(v.env, { GATE_TRY: '1', OTHER: 'x' });
  assert.equal(path.basename(v.dir), 'model');
});

// ---- leaks.mjs and the self-check's C23 ----

test('leaks: the gain over the Book, the rows read and the false discovery rate', () => {
  assert.ok(rowGain({ p: 0.7, fair: 0.5, status: 'won', clv: { q: 0.6 } }).gain > 0);
  assert.ok(rowGain({ p: 0.3, fair: 0.5, status: 'won', clv: { q: 0.6 } }).gain < 0);
  assert.equal(rowGain({ p: 0.5, fair: 0.5, status: 'open' }), null);
  assert.equal(leakRows([{ p: 0.5, fair: 0.5, status: 'open', id: 'x' }, { p: 0.5, fair: 0.5, void: true, status: 'won', id: 'y' }]).length, 0);
  // (Benjamini-Hochberg: one strong p among nulls is found; nulls alone aren't)
  assert.deepEqual([...bhDiscoveries([0.0001, 0.4, 0.6, 0.8])], [0]);
  assert.equal(bhDiscoveries([0.04, 0.3, 0.5, 0.9, 0.7, 0.2, 0.6, 0.45]).size, 0);
  assert.ok(Object.keys(DIMS).includes('timing') && Object.keys(DIMS).includes('stat+line'));
});

test('leaks: a planted leak is found and ranked with its causes and fix; plain noise stays quiet', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const noise = slate({ days: 12, k: 40, seed: 21 }).map((b) => ({ ...b, p: b.fair, model: b.fair }));
  const quiet = huntLeaks(noise, { sport: 'nhl', now });
  assert.equal(quiet.leaks, 0, `noise made leaks: ${quiet.headline}`);
  // (the Points overs priced 20 points over the truth, the rest at the book)
  const planted = slate({ days: 12, k: 40, seed: 21 }).map((b) => {
    if (b.propType === 'pts' && b.side === 'over') return { ...b, p: Math.min(0.95, b.fair + 0.2), units: 1, intent: 'edge' };
    return { ...b, p: b.fair };
  });
  const review = { reviews: planted.filter((b) => b.propType === 'pts' && b.side === 'over' && b.status === 'lost').slice(0, 5).map((b) => ({ day: b.start.slice(0, 10), pick: b.pick, matchup: b.matchup, cause: 'role' })), tally: [] };
  const h = huntLeaks(planted, { sport: 'nhl', now, review });
  assert.ok(h.leaks >= 1, h.headline);
  const top = h.rows.find((r) => r.kind === 'leak' && /Points/.test(r.segment));
  assert.ok(top, `no Points leak: ${h.rows.map((r) => r.segment).join(', ')}`);
  assert.ok(top.loss > 0 && top.n >= LEAK_N);
  assert.match(top.causes, /role/);
  assert.match(top.fix, /gate\.mjs/);
  assert.equal(h.status, 'flag');
  // (ranked by the units at risk)
  const risks = h.rows.filter((r) => r.kind === 'leak').map((r) => r.atRisk);
  assert.deepEqual(risks, [...risks].sort((a, b) => b - a));
});

test('self-check: C23 the leak hunt runs with the others and reads whole', () => {
  assert.ok(CHECKS.some((f) => f.name === 'c23'));
  assert.equal(TITLES.C23, 'Leaks against the Book (priced history)');
  const bets = slate({ days: 10, k: 30, seed: 2 });
  const out = selfCheck({ sport: 'nhl', now: new Date('2026-10-19T12:00:00Z'), ledger: { bets }, checks: [], state: {}, snaps: [], prev: null, teams: {} });
  const c = out.checks.find((x) => x.id === 'C23');
  assert.ok(c, 'C23 in the output');
  assert.ok(['flag', 'watch', 'ok', 'thin'].includes(c.status));
  assert.equal(typeof c.headline, 'string');
  assert.ok(Array.isArray(c.rows));
  assert.ok(Number.isFinite(c.n) && Number.isFinite(c.tested));
});

// ---- the Algorithm tab's Scorecard (scorecard.ts) ----

test("scorecard panel: a chart a sport, a point per version, the edge's sign turned so up beats the Book", async () => {
  const desk_ = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
  const n = (gap, clv = 0.01) => ({ n: 100, gap, clv, hit: 0.55 });
  const file = {
    v: 1,
    sport: 'nhl',
    entries: [
      { sport: 'nhl', epoch: '2026-10-18T05:00:00Z', commit: 'aaa', at: 'x', frozen: { props: n(0.002) }, rolling: { props: n(0.001) } },
      { sport: 'nhl', epoch: '2026-10-19T00:19:00Z', commit: 'bbb', at: 'y', frozen: { props: n(-0.003) }, rolling: { props: null } },
    ],
  };
  const charts = desk_.scorecardPanelOf([file, null, { v: 1, sport: 'mlb', entries: [] }], { nhl: 'NHL' });
  assert.equal(charts.length, 1);
  const c = charts[0];
  assert.equal(c.label, 'NHL');
  assert.equal(c.layer, 'props');
  assert.equal(c.versions, 2);
  const [fz, roll] = c.series;
  assert.equal(fz.points.length, 2);
  assert.equal(roll.points.length, 1, 'a version with no rolling numbers: no point');
  assert.ok(fz.points[1].y < fz.points[0].y, 'the better version higher on the chart');
  assert.ok(fz.points[1].y < c.zeroY && fz.points[0].y > c.zeroY, 'above the zero line beats the Book');
  assert.match(fz.points[1].title, /bbb/);
  assert.match(fz.path, /^M[\d.]+,[\d.]+ L/);
  assert.match(c.latest, /bbb: frozen \+0\.30/);
});
