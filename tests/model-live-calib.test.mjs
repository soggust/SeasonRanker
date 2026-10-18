// The props' live calibration (libs/ranker/scripts/model/calib.mjs) and the projection fits' recency weight
// (project.mjs hl): a spot's shift 0 with no evidence or too little, shrunk toward 0 by its evidence, held to its
// cap and its step a run, kept only where its newest rows' log loss is lower with it; the two sides never adding
// to more than 1; the self-check's report (selfcheck.mjs C21); the recency's gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAL_CAP, CAL_HOLD_MIN, CAL_K, CAL_MIN, CAL_SPLIT, CAL_STEP, calAt, calRows, calSides, calibText, fitCalib, fitShift, fitSpot, lineClass, logLoss, shiftOf, shrinkOf, shrunk, spotKey } from '../libs/ranker/scripts/model/calib.mjs';
import { c21, TITLES } from '../libs/ranker/scripts/model/selfcheck.mjs';
import { HL, TRY_HL, fitStat } from '../libs/ranker/scripts/model/project.mjs';

const EPOCH = '2026-10-14T06:00:00Z';
const T0 = Date.parse(EPOCH);
// (a deterministic stream of 0..1: the rows' outcomes)
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
// (n graded props of a spot: the model said p, they won at rate q; one an hour from the epoch on)
function bets(n, p, q, { stat = 'pts', side = 'over', line = 0.5, intent = 'track', seed = 7, from = 0, ...extra } = {}) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const won = r() < q;
    const at = new Date(T0 + (from + i) * 36e5).toISOString();
    return { id: `${stat}-${side}-${from + i}`, market: 'prop', propType: stat, side, line, model: p, intent, units: intent === 'track' ? 0 : 0.5, placedAt: at, start: at, status: won ? 'won' : 'lost', ...extra };
  });
}

test('line classes and spot keys: 0.5, 1.5, 2.5, over 2.5', () => {
  assert.equal(lineClass(0.5), '0.5');
  assert.equal(lineClass(1), '1.5');
  assert.equal(lineClass(1.5), '1.5');
  assert.equal(lineClass(2.5), '2.5');
  assert.equal(lineClass(3.5), '>2.5');
  assert.equal(lineClass(26.5), '>2.5');
  assert.equal(spotKey('pts', 'over', 0.5), 'pts|over|0.5');
});

test('zero evidence: no rows, no spots, every shift 0 and the chances exactly as they were', () => {
  const c = fitCalib([], EPOCH, null);
  assert.deepEqual(c.spots, {});
  assert.equal(c.rows, 0);
  assert.equal(shiftOf(c, 'pts', 'over', 0.5), 0);
  assert.deepEqual(calSides(c, 'pts', 0.5, 0.42), { over: 0.42, under: 1 - 0.42, so: 0, su: 0 });
  assert.deepEqual(calSides(null, 'pts', 0.5, 0.42), { over: 0.42, under: 1 - 0.42, so: 0, su: 0 });
  assert.equal(calAt(0.37, 0), 0.37);
  assert.match(calibText(c), /no graded props/);
});

test('the rows: since the epoch only, won or lost (pushes, voids, open ones out), tracked rows in, the raw chance read', () => {
  const list = [
    ...bets(3, 0.5, 1),
    { ...bets(1, 0.5, 1)[0], id: 'old', placedAt: '2026-10-13T00:00:00Z', start: '2026-10-13T00:00:00Z' },
    { ...bets(1, 0.5, 1)[0], id: 'push', status: 'push' },
    { ...bets(1, 0.5, 1)[0], id: 'void', status: 'lost', void: true },
    { ...bets(1, 0.5, 1)[0], id: 'open', status: 'open' },
    { ...bets(1, 0.5, 1)[0], id: 'game', market: 'total' },
    { ...bets(1, 0.6, 1, { intent: 'edge' })[0], id: 'shifted', modelRaw: 0.64, cal: -0.1 },
  ];
  const rows = calRows(list, EPOCH);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((x) => x.id).sort(), ['pts-over-0', 'pts-over-1', 'pts-over-2', 'shifted'].sort());
  // (a shifted one's raw chance: the shift never fits on itself)
  assert.equal(rows.find((x) => x.id === 'shifted').p, 0.64);
});

test('the fit: the log loss minimum on the log-odds; shrinkage 0 under CAL_MIN rows, growing with them', () => {
  // (said 50%, won 40%: logit(0.4) = -0.405)
  const rows = Array.from({ length: 1000 }, (_, i) => ({ p: 0.5, y: i % 10 < 4 ? 1 : 0 }));
  assert.ok(Math.abs(fitShift(rows) - Math.log(0.4 / 0.6)) < 1e-6);
  assert.ok(logLoss(rows, fitShift(rows)) < logLoss(rows, 0));
  assert.equal(shrinkOf(0), 0);
  assert.equal(shrinkOf(CAL_MIN - 1), 0);
  assert.equal(shrinkOf(CAL_MIN), 0);
  assert.ok(Math.abs(shrinkOf(CAL_MIN + CAL_K) - 0.5) < 1e-12);
  assert.ok(shrinkOf(2000) > shrinkOf(1000) && shrinkOf(1000) > shrinkOf(500) && shrinkOf(100000) < 1);
});

test('the cap: a spot far off is held to CAL_CAP either way however many rows', () => {
  assert.equal(shrunk(-0.9, 1e6), -CAL_CAP);
  assert.equal(shrunk(0.9, 1e6), CAL_CAP);
  assert.equal(shrunk(-0.9, CAL_MIN - 1), 0);
  // (and the chance it moves: at most about 6 points of a coin flip)
  assert.ok(Math.abs(calAt(0.5, CAL_CAP) - 0.5) < 0.065);
});

test('too few rows: a spot hot by 10 points stays 0 under CAL_MIN, and with too few to hold out', () => {
  const few = fitSpot(calRows(bets(CAL_MIN - 1, 0.5, 0.35), EPOCH), 0);
  assert.equal(few.shift, 0);
  assert.equal(few.kept, false);
  assert.match(few.why, /too few rows/);
  // (CAL_MIN rows in all: the older CAL_SPLIT of them under CAL_MIN, nothing to fit the gate on)
  const n = Math.ceil(CAL_MIN / CAL_SPLIT) - 2;
  const hold = fitSpot(calRows(bets(n, 0.5, 0.35), EPOCH), 0);
  assert.equal(hold.shift, 0);
  assert.match(hold.why, /too few to hold out/);
  assert.ok(n - Math.floor(n * CAL_SPLIT) >= CAL_HOLD_MIN, 'the held-out rows enough: the older ones the short side');
});

test('the gate: a spot running hot on old and new rows alike kept (the shift down, its held-out gain over 0); one hot only in its older rows not', () => {
  const hot = fitSpot(calRows(bets(1200, 0.5, 0.38), EPOCH), -CAL_CAP);
  assert.equal(hot.kept, true);
  assert.ok(hot.gain > 0);
  assert.ok(hot.shift < 0 && hot.target < 0);
  assert.ok(Math.abs(hot.target) <= CAL_CAP);
  // (hot on the older rows, cold on the newest: the newest's log loss worse with the old rows' shift, 0)
  const turned = [...bets(840, 0.5, 0.3, { seed: 3 }), ...bets(360, 0.5, 0.7, { seed: 5, from: 840 })];
  const t = fitSpot(calRows(turned, EPOCH), -0.1);
  assert.equal(t.kept, false);
  assert.equal(t.shift, 0, 'losing the gate: 0 at once, whatever the last run had');
  assert.ok(t.gain <= 0);
  // (well calibrated: nothing to fit, no gain, 0)
  const fine = fitSpot(calRows(bets(1500, 0.5, 0.5, { seed: 11 }), EPOCH), 0);
  assert.ok(Math.abs(fine.shift) <= CAL_STEP);
});

test('the step: a kept spot moves at most CAL_STEP from the last run, so one night cannot swing it', () => {
  const rows = calRows(bets(1500, 0.5, 0.36), EPOCH);
  const first = fitSpot(rows, 0);
  assert.equal(first.kept, true);
  assert.equal(first.shift, -CAL_STEP);
  const second = fitSpot(rows, first.shift);
  assert.ok(Math.abs(second.shift - 2 * -CAL_STEP) < 1e-9);
  // (near the target: at it, not past it)
  const near = fitSpot(rows, first.target + 0.01);
  assert.equal(near.shift, first.target);
  // (fitCalib carries the last run's shift by rung: the pool's, the sport's and the spot's own each a step, the spot
  // their sum; across epochs too, the rows being every graded prop's (2026-10-18))
  const list = bets(1500, 0.5, 0.36);
  const c1 = fitCalib(list, EPOCH, null);
  const c2 = fitCalib(list, EPOCH, c1);
  assert.equal(c1.pool['0.5'].shift, -CAL_STEP);
  assert.equal(c1.sport['0.5'].shift, -CAL_STEP);
  assert.equal(c1.spots['pts|over|0.5'].own, -CAL_STEP);
  assert.ok(Math.abs(c1.spots['pts|over|0.5'].shift + 3 * CAL_STEP) < 1e-9);
  assert.ok(Math.abs(c2.spots['pts|over|0.5'].shift + 6 * CAL_STEP) < 1e-9);
  const c3 = fitCalib(list, EPOCH, { ...c2, epoch: '2026-01-01T00:00:00Z' });
  assert.ok(c3.spots['pts|over|0.5'].shift < c2.spots['pts|over|0.5'].shift, 'no restart on another epoch');
  assert.ok(Math.abs(c3.spots['pts|over|0.5'].shift) <= CAL_CAP + 1e-12);
});

test('pooled: a sparse spot borrows its line class from every sport and its own sport, its own rung 0 till its rows speak; across epochs', () => {
  // (50 rows of NFL receptions under 1.5, said 58% and won 43%: too few alone; the other sports' 1.5s, 1,200 of them
  // said 55% and won 48%: the pool's shift, kept, on the sparse spot too)
  const mine = bets(50, 0.58, 0.43, { stat: 'rec', side: 'under', line: 1.5, seed: 21 });
  const others = bets(1200, 0.55, 0.48, { stat: 'sog', side: 'over', line: 1.5, seed: 22, from: 100 });
  const alone = fitCalib(mine, EPOCH, null);
  assert.equal(shiftOf(alone, 'rec', 'under', 1.5), 0);
  const c = fitCalib(mine, null, null, others);
  assert.equal(c.poolRows, 1200);
  assert.equal(c.pool['1.5'].kept, true);
  assert.equal(c.pool['1.5'].shift, -CAL_STEP);
  assert.equal(c.spots['rec|under|1.5'].ownKept, false);
  assert.equal(c.spots['rec|under|1.5'].own, 0);
  assert.equal(c.spots['rec|under|1.5'].shift, -CAL_STEP);
  assert.equal(shiftOf(c, 'rec', 'under', 1.5), -CAL_STEP);
  // (a spot with no rows of its own at that class: the pool's and the sport's)
  assert.equal(shiftOf(c, 'tgt', 'over', 1), -CAL_STEP);
  // (another class: untouched)
  assert.equal(shiftOf(c, 'rec', 'under', 4.5), 0);
  assert.ok(calSides(c, 'rec', 1.5, 0.42).under < 0.58);
  assert.match(calibText(c), /1200 more from the other sports/);
  // (across epochs: from null reads a row from before any epoch; a from date leaves it out)
  const old = { ...mine[0], id: 'old', placedAt: '2025-10-01T00:00:00Z', start: '2025-10-01T00:00:00Z' };
  assert.equal(calRows([old], null).length, 1);
  assert.equal(calRows([old], EPOCH).length, 0);
});

test('applied: the over spot moves the over chance only; both sides never add past 1; a spot not kept moves nothing', () => {
  const calib = { spots: { 'pts|over|0.5': { kept: true, shift: -0.2 }, 'pts|under|0.5': { kept: false, shift: 0.3 }, 'sog|over|2.5': { kept: true, shift: 0.2 }, 'sog|under|2.5': { kept: true, shift: 0.2 } } };
  const a = calSides(calib, 'pts', 0.5, 0.45);
  assert.ok(a.over < 0.45);
  assert.equal(a.under, 0.55);
  assert.equal(a.so, -0.2);
  assert.equal(a.su, 0);
  // (both raised: the excess taken out of both alike, the sum 1)
  const b = calSides(calib, 'sog', 2.5, 0.5);
  assert.ok(Math.abs(b.over + b.under - 1) < 1e-12);
  assert.ok(Math.abs(b.over - b.under) < 1e-12);
  // (another stat or line class: untouched)
  assert.deepEqual(calSides(calib, 'pts', 1.5, 0.3), { over: 0.3, under: 0.7, so: 0, su: 0 });
});

test("the self-check's C21: each spot's shift and rows, the week's said against won; partial with no state, thin with no rows", () => {
  assert.equal(TITLES.C21, 'Live calibration by spot');
  const now = new Date(T0 + 70 * 864e5);
  const span = { from: now.getTime() - 7 * 864e5, to: now.getTime() };
  assert.equal(c21({ state: {}, bets: [], week: span }).status, 'partial');
  assert.equal(c21({ state: { calib: fitCalib([], EPOCH, null) }, bets: [], week: span }).status, 'thin');
  const list = bets(1500, 0.5, 0.36).map((b) => ({ ...b, gradedAt: new Date(now.getTime() - 864e5).toISOString() }));
  const calib = fitCalib(list, EPOCH, null);
  const c = c21({ state: { calib }, bets: list, week: span });
  assert.equal(c.status, 'info');
  assert.equal(c.value, 1);
  const row = c.rows.find((r) => r.key === 'pts|over|0.5');
  assert.equal(row.n, 1500);
  assert.equal(row.week, 1500);
  assert.ok(row.shifted < row.said);
  assert.match(c.headline, /pts\|over\|0\.5/);
});

test('the recency weight: tried on every stat, its half-lives 3, 2, 1 seasons; kept only with a held-out gain of DRAFT_GAIN (0.0003) or more and no larger bias, else the stat as without it', () => {
  assert.equal(TRY_HL, true);
  assert.deepEqual(HL, [3, 2, 1]);
  // (three seasons, every player's level rising each season: the league's drift)
  const day = (season, g) => new Date(Date.UTC(season, 8, 1 + g * 7)).toISOString().replace('.000Z', 'Z');
  const r = rng(17);
  const rows = [];
  for (let i = 0; i < 30; i++) {
    for (const [season, lvl] of [[2023, 3], [2024, 4], [2025, 5.5]]) {
      for (let g = 0; g < 16; g++) rows.push({ pid: `p${i}`, pos: 'WR', season, date: day(season, g), opp: `o${g % 4}`, team: `t${i % 8}`, game: `p${i}-${season}-${g}`, eligible: true, s: { rec: Math.max(0, Math.round(lvl + (r() - 0.5) * 4)) } });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const fit = fitStat({ key: 'rec' }, rows, {});
  assert.ok(fit.floors.hl);
  const h = fit.floors.hl;
  assert.ok(Number.isFinite(h.seconds));
  if (fit.params.hl) {
    assert.ok(HL.includes(fit.params.hl));
    assert.ok(fit.gains.hl >= 0.0003);
    assert.ok(Math.abs(h.bias[1]) <= Math.abs(h.bias[0]));
    assert.ok(Math.abs(h.allBias[1]) <= Math.abs(h.allBias[0]));
    assert.equal(fit.params.scale, h.scale[1]);
  } else {
    assert.ok(h.fails.length > 0);
    assert.equal(fit.params.hl, undefined);
  }
});
