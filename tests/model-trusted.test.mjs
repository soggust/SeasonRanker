// The trusted-edge bands (DECISIONS.md D72): the pieces' reliability walk-forward, the trusted edge, the bands
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { drivenBy, pieceName, trustBands, trustedEdge, walkTrust } from '../libs/ranker/scripts/model/trusted.mjs';
import { readVariants } from '../libs/ranker/scripts/model/band-lab.mjs';
import { SHIPPED } from '../libs/ranker/scripts/model/clv-bands.mjs';

// (a seeded generator: the rows the same every run)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const T0 = Date.UTC(2024, 0, 5);
const DAY = 864e5;
// (rows [t, market, stat, f, y, attr]: piece 'real' moves the result as it says, 'noise' doesn't)
function rows(n, { from = T0, days = 120 } = {}) {
  const r = rng(7);
  const out = [];
  for (let i = 0; i < n; i++) {
    const real = (r() - 0.5) * 0.2;
    const noise = (r() - 0.5) * 0.2;
    const f = 0.5;
    const y = r() < f + real ? 1 : 0;
    out.push([from + Math.floor((i / n) * days) * DAY, 'prop', 'pts', f, y, { real, noise }]);
  }
  return out;
}

test('D72 reliability: a piece that moves the results is proven, one that does not is not; its weight its slope held to [0, 1]', () => {
  const w = walkTrust(rows(6000));
  const { real, noise } = w.final.prop;
  assert.ok(real.proven && real.slope - 1.645 * real.se > 0 && real.ho > 0, JSON.stringify(real));
  assert.ok(!noise.proven, JSON.stringify(noise));
  assert.ok(real.w > 0 && real.w <= 1);
  assert.equal(noise.w, 0);
});

test('D72 walk-forward: a month reads only the rows settled before it starts', () => {
  const list = rows(3000, { from: Date.UTC(2024, 0, 1), days: 28 });
  const w = walkTrust(list);
  // (January's rows: nothing known in January; February reads them)
  assert.deepEqual(w.at(Date.UTC(2024, 0, 20), 'prop'), {});
  assert.ok(w.at(Date.UTC(2024, 1, 10), 'prop').real?.n > 0);
  // (a later row never moves an earlier month's reliability)
  const more = walkTrust([...list, ...rows(3000, { from: Date.UTC(2024, 1, 1), days: 28 }).map((x) => [x[0], x[1], x[2], x[3], 1 - x[4], x[5]])]);
  assert.deepEqual(more.at(Date.UTC(2024, 1, 10), 'prop'), w.at(Date.UTC(2024, 1, 10), 'prop'));
  // (lines and props apart)
  assert.deepEqual(w.at(Date.UTC(2024, 1, 10), 'line'), {});
});

test("D72 the trusted edge: each part times its piece's weight, unproven pieces none; the popover names the proven ones", () => {
  const rel = { opponent: { w: 1 }, form: { w: 0.5 }, base: { w: 0 } };
  const { te, pieces } = trustedEdge({ opponent: 0.02, form: 0.02, base: 0.05, rest: 0.03 }, rel);
  assert.ok(Math.abs(te - 0.03) < 1e-12);
  assert.deepEqual(pieces.map(([k]) => k), ['opponent', 'form']);
  assert.equal(drivenBy(pieces, 'prop'), 'Driven by: matchup vs position (proven), recent form (proven)');
  assert.equal(pieceName('base', 'line'), 'team ratings vs the Book');
  assert.equal(drivenBy([], 'line'), null);
});

test('D72 the bands: the Kelly floor, the caps (a suspect or barred bet a LIKE at most), percentiles of the bets settled before only', () => {
  const walk = { at: () => ({ a: { w: 1 } }) };
  const bet = (i, te, kelly = 0.03, extra = {}) => ({ t: T0 + i * DAY, at: T0 + i * DAY - 36e5, market: 'prop', kelly, attr: { a: te }, ...extra });
  const abs = { bars: 'abs', love: 0.02, lock: 0.04, kelly: 0.02 };
  const out = trustBands([bet(0, 0.05), bet(1, 0.03), bet(2, 0.05, 0.01), bet(3, 0.05, 0.03, { barred: true }), bet(4, 0.01)], walk, abs);
  assert.deepEqual(out.map((o) => o.band), ['lock', 'high', 'medium', 'medium', 'medium']);
  // (percentiles: no band before minPrior bets have settled; then the top shares of those)
  const many = Array.from({ length: 400 }, (_, i) => bet(i, (i % 100) / 1000));
  const pct = trustBands(many, walk, { bars: 'pct', lock: 0.05, love: 0.2, kelly: 0.005, minPrior: 200 });
  const first = pct.slice(0, 150);
  assert.ok(first.every((o) => o.band === 'medium'));
  const late = pct.slice(300);
  const share = (b) => late.filter((o) => o.band === b).length / late.length;
  assert.ok(share('lock') > 0 && share('lock') <= 0.1, `${share('lock')}`);
  assert.ok(share('high') > share('lock') && share('high') <= 0.25, `${share('high')}`);
});

test('D72 held: the live rule stays clv-results; every staged variant has a readable name; the attribution is env-only', () => {
  assert.equal(SHIPPED.name, 'clv-results');
  const V = readVariants();
  for (const [k, v] of Object.entries(V)) assert.ok(typeof v.label === 'string' && v.label.length > 0 && v.label.length <= 60, k);
  assert.ok(Object.values(V).some((v) => v.mode === 'trusted'));
  for (const f of ['ratings.mjs', 'backtest.mjs', 'gate-history.mjs', 'gate.mjs', 'replay-record.mjs']) {
    const src = fs.readFileSync(path.resolve('libs/ranker/scripts/model', f), 'utf8');
    assert.ok(src.includes("process.env.REPLAY_ATTR === '1'"), f);
  }
  // (D72's research bands stay off the desk; D73's trial is the one way the desk reads the module: liveTrial, readTrusted)
  for (const f of ['desk.mjs', 'reasons.mjs', 'clv-bands.mjs']) assert.ok(!fs.readFileSync(path.resolve('libs/ranker/scripts/model', f), 'utf8').includes('trusted.mjs'), f);
  const run = fs.readFileSync(path.resolve('libs/ranker/scripts/model/run.mjs'), 'utf8');
  assert.ok(run.includes("import { betParts, liveTrial, readTrusted, trialOn } from './trusted.mjs';") && !run.includes('trustBands'));
});
