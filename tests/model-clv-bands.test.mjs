// The closing-line bands (libs/ranker/scripts/model/clv-bands.mjs) and the band lab (band-lab.mjs): DECISIONS.md D70
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLV_RULE, bandBets, ebK, judge, tierClv, walkClv, asVerdicts } from '../libs/ranker/scripts/model/clv-bands.mjs';
import { applyVariant, monotonic, tally } from '../libs/ranker/scripts/model/band-lab.mjs';
import { reasonsFor, contextOf, isLive, reasonMeta } from '../libs/ranker/scripts/model/reasons.mjs';

const H = 36e5;
const g = (clvs, profits = []) => {
  const x = { n: 0, s: 0, s2: 0, beat: 0, rn: 0, rs: 0, rs2: 0 };
  for (const c of clvs) {
    x.n++;
    x.s += c;
    x.s2 += c * c;
    if (c > 0) x.beat++;
  }
  for (const p of profits) {
    x.rn++;
    x.rs += p;
    x.rs2 += p * p;
  }
  return x;
};

test('D70 the shrink: w = n / (n + k) toward the prior; LOVE needs n, the shrunk EV and the beat share; LOCK the higher bar', () => {
  // (50 bets at +6% mean, 30 of 50 beating: shrunk at k 100 to +2%: LOVE exactly; not LOCK (n under 150))
  const clvs = [...Array(30).fill(0.1), ...Array(20).fill(0)];
  const v = judge(g(clvs), CLV_RULE, { k: 100, prior: 0 });
  assert.equal(v.n, 50);
  assert.ok(Math.abs(v.evS - 0.02) < 1e-9);
  assert.equal(v.beat, 0.6);
  assert.equal(v.love, true);
  assert.equal(v.lock, false);
  // (49 bets: under LOVE's n)
  assert.equal(judge(g(clvs.slice(1)), CLV_RULE, { k: 100, prior: 0 }).love, false);
  // (150 at +8%, 60% beating: shrunk +4.8%: LOCK)
  const big = [...Array(90).fill(0.2), ...Array(60).fill(-0.1)];
  const b = judge(g(big), CLV_RULE, { k: 100, prior: 0 });
  assert.equal(b.lock, true);
  // (a beat share under 51.5% holds LOVE whatever the mean)
  assert.equal(judge(g([...Array(25).fill(0.5), ...Array(35).fill(-0.01)]), CLV_RULE, { k: 100, prior: 0 }).love, false);
  // (the results guard: a rule that asks the flat results too)
  const withRes = { ...CLV_RULE, results: { n: 10, roi: 0, z: 0 } };
  assert.equal(judge(g(clvs, Array(20).fill(-1)), withRes, { k: 100, prior: 0 }).love, false);
  assert.equal(judge(g(clvs, Array(20).fill(0.5)), withRes, { k: 100, prior: 0 }).love, true);
});

test('D70 the empirical-Bayes k: within over between; no spread between groups, the cap', () => {
  const same = [g(Array(100).fill(0.01).map((x, i) => (i % 2 ? x + 0.1 : x - 0.1))), g(Array(100).fill(0.01).map((x, i) => (i % 2 ? x + 0.1 : x - 0.1))), g(Array(100).fill(0.01).map((x, i) => (i % 2 ? x + 0.1 : x - 0.1)))];
  assert.equal(ebK(same), 2000);
  const apart = [g(Array(100).fill(0.2)), g(Array(100).fill(-0.2)), g(Array(100).fill(0))];
  assert.equal(ebK(apart), 20);
});

test('D70 walk-forward: a pick reads only the picks settled before its own placement (no look-ahead)', () => {
  const picks = [];
  for (let i = 0; i < 60; i++) picks.push({ t: i * H + 3 * H, at: i * H, market: 'ml', ids: ['seg:ml:fav:early'], clv: 0.1, profit: 0.5, season: 2025, beat: 1 });
  // (the 61st placed before any of them settled: no evidence; the 62nd after all of them: LOVE's evidence)
  picks.push({ t: 1e9, at: 2 * H, market: 'ml', ids: ['seg:ml:fav:early'], clv: null, profit: 0, season: 2025, beat: null });
  picks.push({ t: 1e9, at: 200 * H, market: 'ml', ids: ['seg:ml:fav:early'], clv: null, profit: 0, season: 2025, beat: null });
  const w = walkClv(picks, CLV_RULE);
  assert.equal(w.at(60).get('seg:ml:fav:early').n, 0);
  const late = w.at(61).get('seg:ml:fav:early');
  assert.equal(late.n, 60);
  assert.equal(late.love, true);
  // (the final verdicts as reasons.mjs reads them: on LOVE's bar, strong LOCK's)
  const f = asVerdicts(w.final);
  assert.equal(f.ml['seg:ml:fav:early'].on, true);
  assert.equal(f.ml['seg:ml:fav:early'].strong, false);
});

test("D70 the tier: LOVE one reason past LOVE's bar, LOCK one past LOCK's or two families past LOVE's, the owner's 2% Kelly floor under both", () => {
  const v = new Map([
    ['seg:ml:dog:early', { love: true, lock: false }],
    ['openGap', { love: true, lock: false }],
    ['cleanOpen', { love: true, lock: false }],
  ]);
  assert.equal(tierClv(['seg:ml:dog:early'], v, 0.03).tier, 'high');
  // (segment and timing: two families)
  assert.equal(tierClv(['seg:ml:dog:early', 'openGap'], v, 0.03).tier, 'lock');
  // (openGap and cleanOpen share the timing family: no double count)
  assert.equal(tierClv(['openGap', 'cleanOpen'], v, 0.03).tier, 'high');
  assert.equal(tierClv(['seg:ml:dog:early', 'openGap'], v, 0.01).tier, 'medium');
  assert.equal(tierClv(['seg:ml:dog:early', 'openGap'], v, 0.03, { ...CLV_RULE, twoLove: false }).tier, 'high');
});

test('D70 the bands on bets: a suspect or barred bet a LIKE at most, each band held to its stake cap, the stake never raised', () => {
  const mk = (i, extra = {}) => ({ id: `b${i}`, t: i * H, at: i * H - H, market: 'ml', season: 2025, odds: 110, kelly: 0.04, res: 'W', profit: 3.3, units: 3, beat: 1, clv: 0.1, practice: false, lab: { ids: ['seg:ml:dog:early'], before: { band: 'lock', units: 3, profit: 3.3 }, suspect: false, barred: false }, ...extra });
  const bets = Array.from({ length: 80 }, (_, i) => mk(i * 10));
  bets.push(mk(2000), mk(2001, { lab: { ids: ['seg:ml:dog:early'], before: { band: 'lock', units: 3, profit: 3.3 }, suspect: true, barred: false } }));
  bandBets(bets, CLV_RULE);
  assert.equal(bets[0].band, 'medium');
  assert.equal(bets[0].units, 1);
  assert.equal(bets[80].band, 'high');
  assert.equal(bets[80].units, 2);
  assert.ok(Math.abs(bets[80].profit - 2.2) < 1e-9);
  assert.equal(bets[81].band, 'medium');
});

test('D70 the lab: the d58 variant reproduces the replay as recorded; the monotonic check reads each band against the one below', () => {
  const bets = [{ id: 'a', t: 0, at: -H, market: 'ml', season: 2025, odds: 100, kelly: 0.01, res: 'L', profit: -1, units: 1, band: 'medium', beat: 0, clv: -0.02, fair: 0.5, practice: false, lab: { ids: ['seg:ml:fav:early'], before: { band: 'medium', units: 1, profit: -1 }, suspect: false, barred: false } }];
  const dump = { sport: 'nba', practiceUnits: 0.5, beatBar: null, bets, passed: [], args: { flags: {} } };
  const { bets: out } = applyVariant(dump, { mode: 'd58' });
  assert.equal(out[0].band, 'medium');
  assert.equal(out[0].units, 1);
  const by = { lock: tally([]), high: tally([{ ...out[0], res: 'W', profit: 1, units: 1, odds: 100 }]), medium: tally(out) };
  assert.equal(monotonic(by)[0].ok, null);
  assert.equal(monotonic(by)[1].ok, true);
});

test('D70 the news lag by stat: a tagged points over carries newsLag and newsLag:pts, both the news family and live-only', () => {
  const ids = reasonsFor(contextOf({ sport: 'nba', market: 'prop', side: 'over', stat: 'pts', newsLag: true })).map((r) => r.id);
  assert.ok(ids.includes('newsLag'));
  assert.ok(ids.includes('newsLag:pts'));
  assert.equal(reasonMeta('newsLag:pts').family, 'news');
  assert.equal(isLive('newsLag:pts'), true);
  assert.equal(isLive('stat:pts:over'), false);
  assert.ok(!reasonsFor(contextOf({ sport: 'mlb', market: 'prop', side: 'over', stat: 'k', newsLag: true })).some((r) => r.id.startsWith('newsLag')));
});
