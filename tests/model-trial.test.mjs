// The two-band trial (DECISIONS.md D73): LIKE and LOVE only, the LOVE rule and the LIKE props' stake step picked each
// month from the bets settled before it, the live desk's pieces and band
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TRIAL, TRIAL_OPTS, chooseLove, chooseMid, isLoveBy, liveParts, liveTrial, propParts, trialBand, trialFileOf, trialWalk, trialWhy, walkTrust } from '../libs/ranker/scripts/model/trusted.mjs';
import { tierKellyOf, levelOf } from '../libs/ranker/scripts/model/picks.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const DAY = 864e5;
const T0 = Date.UTC(2024, 0, 3);
// (props: a high-share band that wins 58% at -110 and the rest that win 50%; Kelly 1-2% on the high ones)
function bets(n, { seed = 1, edgeWins = 0.58 } = {}) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const hi = r() < 0.25;
    const t = T0 + i * (DAY / 4);
    return { t, at: t - 36e5, market: 'prop', kelly: hi ? 0.012 + 0.006 * r() : 0.004, share: hi ? 0.9 : 0.2, te: 0.02, units: 0.5, held: false, odds: -110, res: r() < (hi ? edgeWins : 0.5) ? 'W' : 'L' };
  });
}

test('D73 the trial: two bands, LOCK off, on in the NBA and the NHL only', () => {
  assert.deepEqual(Object.keys(TRIAL).sort(), ['nba', 'nhl']);
  // (D95: the NBA's LIKE stake step off, the trial's switches all off there; the NHL's LOVE on, fragile)
  assert.deepEqual(TRIAL.nba, { love: false, mid: false });
  assert.deepEqual(TRIAL.nhl, { love: true, mid: true });
  const b = { market: 'prop', kelly: 0.015, share: 0.95, te: 0.03, units: 0.5, held: false };
  const out = trialBand(b, { love: { share: 0.8, kellyMax: 0.02 }, mid: 0 });
  assert.deepEqual(out, { band: 'high', units: TRIAL_OPTS.loveUnits });
  // (never a LOCK: the trial has two bands)
  for (const share of [0.5, 0.9, 1.5]) for (const kelly of [0.01, 0.05, 0.2]) assert.notEqual(trialBand({ ...b, share, kelly }, { love: { share: 0.3, kellyMax: Infinity }, mid: 0 }).band, 'lock');
});

test('D73 a LOVE needs a prop, its pieces, the Kelly range, and no hold; a held bet keeps its stake', () => {
  const r = { share: 0.6, kellyMax: 0.02 };
  const b = { market: 'prop', kelly: 0.015, share: 0.7, te: 0.02, units: 0.5, held: false };
  assert.ok(isLoveBy(b, r));
  assert.ok(!isLoveBy({ ...b, market: 'spread' }, r));
  assert.ok(!isLoveBy({ ...b, held: true }, r));
  assert.ok(!isLoveBy({ ...b, kelly: 0.02 }, r), 'the ceiling');
  assert.ok(!isLoveBy({ ...b, kelly: 0.009 }, r), 'the floor');
  assert.ok(!isLoveBy({ ...b, share: 0.5 }, r));
  assert.ok(!isLoveBy({ ...b, te: 0 }, r));
  assert.ok(!isLoveBy(b, null), 'no rule earned: no LOVE');
  assert.deepEqual(trialBand({ ...b, held: true, units: 0.5 }, { love: r, mid: 0.2 }), { band: 'medium', units: 0.5 });
});

test('D73 the walk picks each month from the bets settled before it only (no look-ahead)', () => {
  const list = bets(1600);
  const w = trialWalk(list, 'nhl');
  // (a month's rule is the one chosen on the bets settled before the month starts)
  for (const [m, c] of w.months) {
    const prior = list.filter((b) => b.t + 3 * 36e5 < m);
    if (prior.length < TRIAL_OPTS.minPrior) assert.equal(c.love, null);
    else assert.deepEqual(c.love, chooseLove(prior));
  }
  // (changing a bet's result changes no rule chosen before it settled)
  const k = 1200;
  const flipped = list.map((b, i) => (i === k ? { ...b, res: b.res === 'W' ? 'L' : 'W' } : b));
  const w2 = trialWalk(flipped, 'nhl');
  for (const [m, c] of w.months) if (m <= list[k].t + 3 * 36e5) assert.deepEqual(w2.at(m), c);
  // (the high band wins here, so the walk earns a LOVE on it where LOVE is on)
  assert.ok(w.final.love?.share >= 0.3);
  assert.equal(trialWalk(list, 'nba').final.love, null, 'the NBA: LOVE off');
});

test('D73 no LOVE where the would-be LOVEs do not lead the LIKEs', () => {
  const list = bets(1600, { edgeWins: 0.45 });
  assert.equal(chooseLove(list), null);
  const w = trialWalk(list, 'nba');
  assert.ok(w.months.every(([, c]) => c.love === null));
});

test('D73 the LIKE props stake step: 0 keeps the stake, 9 the practice stake, else 1u past the share', () => {
  const b = { market: 'prop', kelly: 0.004, share: 0.5, te: 0.01, units: 0.8, held: false };
  assert.equal(trialBand(b, { love: null, mid: 0 }).units, 0.8);
  assert.equal(trialBand(b, { love: null, mid: 9 }).units, TRIAL_OPTS.practice);
  assert.equal(trialBand(b, { love: null, mid: 0.4 }).units, 1);
  assert.equal(trialBand(b, { love: null, mid: 0.6 }).units, TRIAL_OPTS.practice);
  assert.equal(trialBand({ ...b, market: 'ml' }, { love: null, mid: 0.4 }).units, 0.8, 'a line keeps its stake');
  assert.ok([0, 0.2, 0.4, 0.6, 9].includes(chooseMid(bets(400), null)));
});

test('D73 the live desk: the pieces as the replay splits them, the band from the file, the popover words', () => {
  // (a projection: his rate 10, recent 12 at w 0.5, the opponent 1.1 at a 1: the mean 11 * 1.1)
  const P = { w: 0.5, a: 1, scale: 1 };
  const p = { rate: 10, recent: 12, opp: 1.1 };
  const parts = propParts(p, P);
  assert.ok(Math.abs(parts.form - Math.log(1.1)) < 1e-9 && Math.abs(parts.opponent - Math.log(1.1)) < 1e-9);
  const mu = 12.1;
  const overAt = (line, m) => 1 / (1 + Math.exp(-(m - line) / 2));
  const raw = overAt(11.5, mu);
  const x = liveParts({ p, params: P, mu, line: 11.5, overAt, raw, f: 0.5, pCur: 0.5 + (raw - 0.5) * 0.5, pFinal: 0.5 + (raw - 0.5) * 0.5 + 0.004, side: 'over' });
  // (the parts add to the edge: p - f)
  const sum = Object.values(x).reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(sum - ((raw - 0.5) * 0.5 + 0.004)) < 1e-4, `${sum}`);
  assert.equal(x.cal, 0.004);
  const under = liveParts({ p, params: P, mu, line: 11.5, overAt, raw, f: 0.5, pCur: 0.5 + (raw - 0.5) * 0.5, pFinal: 0.5 + (raw - 0.5) * 0.5 + 0.004, side: 'under' });
  for (const k of Object.keys(x)) assert.equal(under[k], -x[k] || 0);
  // (the file: weights on form and the opponent, LOVE at 0.6+ in 1-2%)
  const file = { v: 1, trial: true, weights: { form: 1, opponent: 1 }, rule: { love: { share: 0.6, kellyMax: 0.02 }, mid: 0 }, loveUnits: 2, kelly: 0.01 };
  const lt = liveTrial(file, { market: 'prop', kelly: 0.015, parts: { form: 0.02, opponent: 0.01, base: 0.005 }, units: 0.5, held: false });
  assert.equal(lt.band, 'high');
  assert.equal(lt.units, 2);
  // (D101: each band's stake for the page's what-if; the step off, a LIKE's the formula's)
  assert.deepEqual(lt.stakes, { high: 2, medium: null });
  assert.deepEqual(liveTrial({ ...file, loveUnits: 2.5, rule: { ...file.rule, mid: 9 } }, { market: 'prop', kelly: 0.015, parts: { form: 0.02, opponent: 0.01, base: 0.005 }, units: 1, held: false }).stakes, { high: 2.5, medium: 0.5 });
  assert.deepEqual(liveTrial({ ...file, rule: { love: null, mid: 0.4 } }, { market: 'prop', kelly: 0.015, parts: { form: 0.02, base: 0.005 }, units: 1, held: false }).stakes, { high: null, medium: 1 }, 'no LOVE rule: none; the step at 0.4, a share past it 1u');
  assert.equal(lt.why, 'LOVE (trial): driven by proven pieces: recent form, matchup vs position');
  assert.ok(lt.why.startsWith('LOVE (trial): driven by proven pieces: '));
  assert.equal(liveTrial(file, { market: 'prop', kelly: 0.015, parts: { form: 0.002, base: 0.03 }, units: 0.5, held: false }).band, 'medium');
  assert.equal(liveTrial(file, { market: 'spread', kelly: 0.015, parts: { form: 0.02 } }), null);
  assert.equal(liveTrial({ ...file, v: 0 }, { market: 'prop', kelly: 0.015, parts: { form: 0.02 } }), null);
  assert.equal(trialWhy([['base', 0.01]]), "LOVE (trial): driven by proven pieces: his own rate vs the Book");
});

test("D73 the trial's Kelly range stands in for the 2% LOVE floor on its bets alone (the owner's \"just lowering thresholds\")", () => {
  const bet = { intent: 'edge', p: 0.56, conf: { tier: 'high', trial: { kelly: [0.01, 0.02] } } };
  assert.deepEqual(tierKellyOf(bet), [0.01, 0.02]);
  assert.equal(levelOf(bet, 0.015), 'high');
  assert.equal(levelOf(bet, 0.025), 'medium');
  // (a D70 tier without the trial: the 2% floor as before)
  const plain = { intent: 'edge', p: 0.56, conf: { tier: 'high' } };
  assert.equal(levelOf(plain, 0.015), 'medium');
  assert.equal(levelOf(plain, 0.025), 'high');
});

test('D73 the record writes trusted.json for a trial sport; the desk reads it; the UI shows two bands', () => {
  const trust = walkTrust([]);
  const f = trialFileOf('nba', trust, { final: { love: { share: 0.8, kellyMax: Infinity, n: 40, z: 1 }, mid: 0.2 }, opts: TRIAL_OPTS });
  assert.equal(f.trial, true);
  assert.equal(f.rule.love.kellyMax, null);
  const gate = fs.readFileSync(path.resolve('libs/ranker/scripts/model/gate.mjs'), 'utf8');
  assert.ok(gate.includes("src/StaticData/model/trusted.json") && gate.includes("V.trusted?.trialOn?.(sport)"));
  const rec = fs.readFileSync(path.resolve('libs/ranker/scripts/model/replay-record.mjs'), 'utf8');
  assert.ok(rec.includes('TR.trialWalk(list, sport') && rec.includes("needs the props' pieces"));
  const run = fs.readFileSync(path.resolve('libs/ranker/scripts/model/run.mjs'), 'utf8');
  assert.ok(run.includes('return withTrial(r, withTier(r, bet, x));'));
  for (const sport of Object.keys(TRIAL)) {
    const file = path.resolve('apps', sport, 'src/StaticData/model/trusted.json');
    assert.ok(fs.existsSync(file), sport);
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(m.trial, true);
    assert.ok(Object.keys(m.weights).length > 0, sport);
  }
  const ts = fs.readFileSync(path.resolve('libs/ranker/src/engine/book/model-desk.component.ts'), 'utf8');
  assert.ok(ts.includes('lock.bets ? [lock] : []'));
});

test("D73 the live split reads the bet's own projection (props.mjs, a fit file, untouched): the pieces add to its edge", async () => {
  const { betParts, projectionParts } = await import('../libs/ranker/scripts/model/trusted.mjs');
  const pr = { mean: 12.1 * 1.05, rate: 10, recent: 12, opp: 1.1, ctxF: 1.05, applied: { w: 0.5, a: 1, scale: 1 }, pOver: 0.6 };
  const lf = projectionParts(pr);
  assert.ok(Math.abs(lf.form - Math.log(1.1)) < 1e-9 && Math.abs(lf.context - Math.log(1.05)) < 1e-9 && Math.abs(lf.vacated) < 1e-9);
  const overAt = (line, m) => 1 / (1 + Math.exp(-(m - line) / 2));
  const bet = { side: 'under', line: 11.5, p: 0.45, fair: 0.47, projection: { ...pr, pOver: overAt(11.5, pr.mean) } };
  const x = betParts(bet, overAt);
  const sum = Object.values(x).reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(sum - (0.45 - 0.47)) < 1e-4, `${sum}`);
  const run = fs.readFileSync(path.resolve('libs/ranker/scripts/model/run.mjs'), 'utf8');
  assert.ok(run.includes('betParts(bet, (line, mu) => lineChances(line, mu, params, mix).over)'));
  assert.ok(!fs.readFileSync(path.resolve('libs/ranker/scripts/model/props.mjs'), 'utf8').includes('trusted.mjs'), 'props.mjs untouched');
});
