// The learned correction (correct.mjs) and the slate's practice picks (desk.mjs PRACTICE_N, practiceTop, PRACTICE_SPLIT),
// 2026-10-18: history sharpens the choice, not the volume
import test from 'node:test';
import assert from 'node:assert/strict';
import { corrRows, correctSides, correctionReport, fitCorrection, tuneCorrection, FAMILIES, CORR_MIN } from '../libs/ranker/scripts/model/correct.mjs';
import { PRACTICE_N, PRACTICE_SPLIT, PRACTICE_UNITS, inPractice, isPracticeTop, practiceRecord, practiceTop, propGate, lineGate, record, slateQuota, trustedUnits } from '../libs/ranker/scripts/model/desk.mjs';
import { levelOf, recentOf } from '../libs/ranker/scripts/model/picks.mjs';

// (a seeded random, so the rows are the same every run)
const rand = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// Graded props: in `stat`, the model's lean runs `way` (1: the outcome follows the model, -1: the other way, 0: the
// book's chance alone), the book's no-vig at 0.5 and the model 0.38 or 0.62 (an even split of leans)
function bets(sport, stat, way, n, seed, t0 = Date.parse('2026-10-01T00:00:00Z')) {
  const r = rand(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const lean = r() < 0.5 ? 0.12 : -0.12;
    const model = 0.5 + lean;
    const truth = 0.5 + way * lean;
    const over = r() < truth;
    const start = new Date(t0 + i * 3 * 36e5).toISOString();
    // (each row the side the model takes)
    const side = lean > 0 ? 'over' : 'under';
    out.push({ id: `${sport}:${stat}:${i}`, event: `${sport}:${stat}:${i}`, sport, market: 'prop', propType: stat, line: 0.5, side, model: side === 'over' ? model : 1 - model, fair: 0.5, odds: -110, otherOdds: -110, p: 0.5, ev: -0.04, intent: 'track', status: (side === 'over') === over ? 'won' : 'lost', start, placedAt: start });
  }
  return out;
}

test('a segment proven bad is corrected past the book (its side turned over), not just shrunk toward it; one that wins keeps its lean', () => {
  const rows = corrRows([...bets('nhl', 'sog', -1, 900, 7), ...bets('nhl', 'goals', 1, 900, 11)]);
  const fit = fitCorrection(rows, { families: FAMILIES, lambda: 6 });
  const at = (stat, pOver) => correctSides(fit, { sport: 'nhl', stat, line: 0.5, pOver, fairOver: 0.5, overOdds: -110, underOdds: -110, home: null, hours: 3 });
  // (the bad one: the model at 62% over, the book at 50%: corrected under the book, the under now the side)
  const bad = at('sog', 0.62);
  assert.ok(bad.over < 0.5 - 0.03, `the losing segment's over at ${bad.over}: past the book, not between it and the model`);
  assert.ok(bad.under > bad.over);
  // (the good one: most of its lean kept)
  const good = at('goals', 0.62);
  assert.ok(good.over > 0.56, `the winning segment's over at ${good.over}: its lean kept`);
});

test('the correction self-tunes and stays near the book where the model has nothing on it', () => {
  const list = bets('nhl', 'sog', 0, 600, 3);
  const t = tuneCorrection(corrRows(list), 'nhl');
  assert.ok(t.fit, 'fit');
  const s = correctSides(t.fit, { sport: 'nhl', stat: 'sog', line: 0.5, pOver: 0.62, fairOver: 0.5, overOdds: -110, underOdds: -110, home: null, hours: 3 });
  assert.ok(Math.abs(s.over - 0.5) < 0.04, `no signal, near the book: ${s.over}`);
  assert.equal(tuneCorrection(corrRows(list.slice(0, CORR_MIN - 1)), 'nhl').fit, null, 'too few rows: none (the old pricing)');
  // (the report's numbers out of sample: every pick set judged on the later rows)
  const rep = correctionReport(corrRows([...list, ...bets('nhl', 'goals', 1, 600, 5)]), 'nhl', 6);
  for (const k of ['corrected', 'simple', 'raw', 'book', 'current']) assert.ok(Number.isFinite(rep.loss[k]), k);
  assert.ok(rep.top.corrected.n > 0);
});

test("a sport whose model loses still places its top N: every candidate short of the vig, the best by edge before it bet at practice", () => {
  // (nothing clears the vig: ev under 0 everywhere, the edge before the vig small but over 0 on most)
  const cands = [0.03, 0.02, 0.012, 0.005, -0.01, 0.001].map((edge, i) => ({ id: `p${i}`, ev: -0.02, edge }));
  const quota = slateQuota(PRACTICE_N.nhl, 6);
  assert.equal(quota, 1);
  assert.deepEqual([...practiceTop(cands, 3)], ['p0', 'p1', 'p2']);
  // (one a game at the least, whatever the slate's size; a big night's games one each)
  assert.equal(slateQuota(PRACTICE_N.nhl, 13), 1);
  assert.equal(slateQuota(PRACTICE_N.mlb, 1), 3);
  assert.equal(slateQuota(PRACTICE_N.nfl, 1), 15);
  // (what the game has played already counts toward its share, and the ones clearing the vig first)
  assert.deepEqual([...practiceTop(cands, 3, 2)], ['p0']);
  assert.deepEqual([...practiceTop([...cands, { id: 'v', ev: 0.01, edge: 0.06 }], 3)], ['p0', 'p1']);
  // (never one with no edge before the vig)
  assert.deepEqual([...practiceTop([{ id: 'x', ev: -0.05, edge: -0.001 }], 3)], []);
});

test('practice picks: a LIKE with its tag, apart from the record, the gates and the recent form while PRACTICE_SPLIT', () => {
  assert.equal(PRACTICE_SPLIT, true);
  const now = new Date('2026-10-18T20:00:00Z');
  const base = { sport: 'nhl', market: 'prop', propType: 'sog', odds: -110, intent: 'edge', start: '2026-10-17T23:00:00Z', gradedAt: '2026-10-18T02:00:00Z', placedAt: '2026-10-18T22:45:00Z', clv: { ev: -0.05, beat: false, q: 0.5 } };
  const real = { ...base, id: 'a', status: 'won', units: 1, profit: 0.91 };
  const practice = { ...base, id: 'b', status: 'lost', units: PRACTICE_UNITS, profit: -PRACTICE_UNITS, topN: { rank: 1, quota: 1, slate: 6, edge: 0.01 }, practice: 'practice' };
  assert.ok(isPracticeTop(practice) && inPractice(practice) && !inPractice(real));
  assert.equal(levelOf(practice, -0.03, 0.51), 'medium');
  assert.deepEqual([record([real, practice]).won, record([real, practice]).lost], [1, 0]);
  assert.deepEqual([practiceRecord([real, practice]).won, practiceRecord([real, practice]).lost], [0, 1]);
  // (the CLV gates read the bets that cleared the vig alone)
  const many = Array.from({ length: 60 }, (_, i) => ({ ...practice, id: `p${i}` }));
  assert.equal(propGate(many, 'nhl', '2026-10-18T00:00:00Z').sog, undefined);
  assert.equal(lineGate(many.map((b) => ({ ...b, market: 'total' })), 'nhl', '2026-10-18T00:00:00Z').n, 0);
  const rec = recentOf('nhl', [real, practice], now);
  assert.deepEqual(rec.week, { won: 1, lost: 0, push: 0, profit: 0.91 });
  assert.deepEqual(rec.practice, { won: 0, lost: 1, push: 0, profit: -0.5 });
});

test('the trust sizes the stake, never whether to play', () => {
  assert.equal(trustedUnits(3, 0.5), 3);
  assert.equal(trustedUnits(3, 0.25), 2);
  assert.equal(trustedUnits(3, 0), 0.5);
  assert.equal(trustedUnits(0.5, 0.1), 0.5);
});
