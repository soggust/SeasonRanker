// How much of a sport's replayed record is luck, and how big an edge its history could prove (the owner, 2026-10-26:
// "is there a way to practice/simulate games to test our algo for future"). Reads the replay's bets as the record wrote
// them (replay-record.mjs, REPLAY_DUMP=<dir>: <sport>-bets.json) and plays each sport's bets again 10,000 times at
// their own stakes and odds:
//   - the luck band: each bet won at the Book's fair chance (no skill): the record's spread, and how often a Bot with
//     no edge does as well as this one did (its luck percentile)
//   - the Bot's claim: each bet won at the Bot's own chance: the record its chances promise
//   - planted edges: each bet won at the fair chance plus 1, 2, 3 or 5 points: how often the record clears the luck
//     band's 95th percentile (its power), and the bets that edge would need for 80% power
// Independent bets (a game's bets move together, so the true band is a little wider: cluster.mjs's error bars). Free:
// no API calls, never the bettor.
//
//   node libs/ranker/scripts/model/luck.mjs <dump dir> [nfl nba ...] [--json <file>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SPORTS = ['nba', 'nhl', 'nfl', 'mlb', 'mma'];
export const SIMS = 10000;
export const EDGES = [0.01, 0.02, 0.03, 0.05];
const fin = Number.isFinite;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

// (a seeded generator: the same numbers every run)
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// (the bets a sim plays: staked, graded W or L, with odds and the fair chance; a push is no action)
export const playable = (bets) => bets.filter((b) => (b.res === 'W' || b.res === 'L') && fin(b.odds) && fin(b.units) && b.units > 0 && fin(b.fair) && b.fair > 0 && b.fair < 1);

// The profit of one replay of the bets, each won at chance(b)
export function once(bets, chance, r) {
  let u = 0;
  for (const b of bets) u += r() < chance(b) ? b.units * (dec(b.odds) - 1) : -b.units;
  return u;
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
const clip = (p) => Math.min(0.99, Math.max(0.01, p));

export function luckOf(bets, { sims = SIMS, edges = EDGES, seed = 7 } = {}) {
  const r = rng(seed);
  const mine = playable(bets);
  const actual = mine.reduce((a, b) => a + (b.res === 'W' ? b.units * (dec(b.odds) - 1) : -b.units), 0);
  const staked = mine.reduce((a, b) => a + b.units, 0);
  const run = (chance) => Array.from({ length: sims }, () => once(mine, chance, r)).sort((a, b) => a - b);
  const nul = run((b) => b.fair);
  const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const sd = (xs, m = mean(xs)) => Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  const m0 = mean(nul);
  const s0 = sd(nul, m0);
  const bar = pct(nul, 0.95);
  const claim = run((b) => (fin(b.p) ? clip(b.p) : b.fair));
  const planted = edges.map((e) => {
    const xs = run((b) => clip(b.fair + e));
    const power = xs.filter((x) => x > bar).length / xs.length;
    const z = (mean(xs) - m0) / s0;
    // (80% power at one-sided 5%: z 1.645 + 0.842, the shift growing with the root of the bets)
    const need = z > 0 ? Math.ceil(mine.length * ((1.645 + 0.842) / z) ** 2) : null;
    return { edge: e, power: +power.toFixed(3), mean: +mean(xs).toFixed(1), need };
  });
  return {
    bets: mine.length,
    staked: +staked.toFixed(1),
    actual: +actual.toFixed(2),
    luck: { mean: +m0.toFixed(1), sd: +s0.toFixed(1), p5: +pct(nul, 0.05).toFixed(1), p95: +bar.toFixed(1), percentile: +(nul.filter((x) => x < actual).length / nul.length).toFixed(3) },
    claim: { mean: +mean(claim).toFixed(1), p5: +pct(claim, 0.05).toFixed(1), p95: +pct(claim, 0.95).toFixed(1) },
    planted,
  };
}

function main() {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json');
  const jsonOut = ji >= 0 ? args[ji + 1] : null;
  const rest = args.filter((a, i) => i !== ji && i !== ji + 1);
  const dir = rest[0];
  if (!dir) throw new Error('usage: luck.mjs <dump dir> [sports] [--json <file>]');
  const sports = rest.slice(1).length ? rest.slice(1) : SPORTS;
  const out = {};
  for (const s of sports) {
    const f = path.join(dir, `${s}-bets.json`);
    if (!existsSync(f)) {
      console.log(`${s}: no ${f}`);
      continue;
    }
    const bets = JSON.parse(readFileSync(f, 'utf8'));
    const all = luckOf(bets);
    const bands = {};
    for (const band of [...new Set(bets.map((b) => b.band).filter(Boolean))]) bands[band] = luckOf(bets.filter((b) => b.band === band), { sims: 4000 });
    out[s] = { ...all, bands };
    const L = all.luck;
    console.log(`${s}: ${all.bets} bets, ${all.actual >= 0 ? '+' : ''}${all.actual}u; no-skill band ${L.p5}u to ${L.p95}u (mean ${L.mean}u), the record beats ${(L.percentile * 100).toFixed(1)}% of no-skill runs; the Bot's own chances promise ${all.claim.mean}u; planted ${all.planted.map((p) => `+${p.edge * 100}pt: power ${(p.power * 100).toFixed(0)}%, needs ${p.need ?? '-'}`).join('; ')}`);
    for (const [band, x] of Object.entries(bands)) console.log(`  ${band}: ${x.bets} bets ${x.actual}u, beats ${(x.luck.percentile * 100).toFixed(1)}% of no-skill runs (band ${x.luck.p5} to ${x.luck.p95})`);
  }
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(out, null, 1)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
