// The anchored projection (DECISIONS.md D33, the owner, 2026-10-19): a priced prop's chance read from the bot's own
// projection pulled toward the book's implied mean by a weight the evidence sets, never a rule.
//
//   why       on the priced history (every DraftKings close since 2023, gate-history.mjs) the bot's disagreement
//             with the book's line is mostly noise: of the distance between the two, 10% to 25% is real (the slope
//             of the result on it), the rest costs log loss carried at full weight. The spread around the
//             projection is about right and the bot's average level is as good as the book's; it's wrong row by
//             row, where the book's close knows roles, injuries, lineups and leashes the bot reads late or never.
//             A weight on that distance is the one structural fix: the bot's own view still picks the side, the
//             book's number says how far to lean
//   mean      mu' = mu x (im / mu)^pull: the bot's mean mu pulled toward the book's implied mean im (project.mjs
//             impliedMean: the mean at which the stat's own spread goes over the line as often as the book's fair
//             chance says) by pull, 0 the bot's own number, 1 the book's. In log space, so a pull means the same
//             on a 3-catch line and a 250-yard one. The chance at the line is the stat's own shape at mu' (its
//             dispersion, early-exit mixture and push), with no recalibration: the recalibration (project.mjs
//             cal) was fit on the bot's own chances and does part of this job badly (it shrinks the lean on
//             every row alike); at the book's mean it only hurts (measured: +0.002 to +0.015 a row)
//   pull      a side's: pullUp where the bot sits over the book, pullDn under it (the owner's asymmetry: far over
//             the book the bot has been about 0% right, far under about 40%). Each stat's pair is pull +- d:
//             pull the stat's own held-out best on a grid, d its asymmetry, each shrunk by its evidence toward 0
//             (ANCHOR_K rows' worth to count half). Toward 0, never toward the book: with no evidence the chance
//             is the bot's own, and a stat where the bot's number beats the book's implied mean out of sample
//             sits at exactly 0 (the owner: "I don't want it to become a weight that pulls us TO the book if we
//             ever get ahead"). No floor, no cap short of 1
//   fit       walk-forward by season in the gate's history layer (gate-history.mjs propHistoryRows): a season's
//             rows read the pull fit on the seasons before it; the first season reads 0. The fit on every season to
//             date is written by gate.mjs --record to apps/<sport>/src/StaticData/model/anchor.json, which the live
//             desk reads (run.mjs, props.mjs priceProps). The desk never fits it: the ledger's few hundred rows are
//             no match for the history's tens of thousands, and a weight re-fit hourly on ten days of results would
//             be the drift the owner forbids (DECISIONS.md D33's loops)
//   then      the trust (desk.mjs chanceAt) prices the anchored chance against the book as before, by line bucket
//             (D17), and the live calibration (calib.mjs) shifts it where its rows say so: both read the anchored
//             chance as the model's (modelRaw), so nothing is counted twice. With the anchor doing the shrinking,
//             the trust's fit climbs toward 1 (fitTrust's grid reaches it); the owner's rule is that it may
//
// Measured 2026-10-19 (the priced history, recency-weighted, log loss at the close against the book's, under 0
// better; walk-forward by season, a season's pull from the ones before, the first season's 0): NFL props, the bot's
// own number +.0168, the current pricing (its own number at the trust) -.0001, the anchored chance alone -.0005
// (+.021 in the unanchored first season, -.0009 and -.0016 in the two newest), anchored then trusted -.0011; NBA
// one season, so nothing anchored yet; NHL and MLB ties. By stat the pull runs about 0.7 to 0.9 on the NFL's yards
// and catches (the bot's number 10% to 30% of the distance), 0.4 to 0.6 on its attempts and completions, about 0.9
// on NHL points and MLB hits (the book's number nearly outright: the bot's distance there is almost all noise),
// 0.7 to 0.8 on NHL shots, MLB strikeouts, outs and total bases.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chanceLog, chanceOver, impliedMean, lineChances } from './project.mjs';

const fin = Number.isFinite;
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const clip = (p) => Math.min(0.995, Math.max(0.005, p));
export const ANCHOR_V = 1;
// (the pull's grid, 0 the bot's own number to 1 the book's; and the asymmetry's, either way)
export const PULL_GRID = Array.from({ length: 21 }, (_, i) => i / 20);
export const ASYM_GRID = [-0.3, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3];
// (rows' worth of evidence a fit needs to count half: the shrink toward 0, the bot's own number. Measured on the
// NFL walk-forward 2026-10-19 at 0, 100, 300, 500 and 1500: the priced chance -0.0011 against the book at every K
// to 500 and -0.0007 at 1500, where a stat's first season (1,000 to 2,000 rows) kept under half its fit and the
// anchored chance alone still trailed the book; at 300 a stat with a thousand rows keeps three quarters of its own)
export const ANCHOR_K = 300;
// (a fit under this many decided rows is 0: the bot's own number)
export const ANCHOR_MIN = 300;
// (a pull or an asymmetry is taken only where it beats the bot's own number by this much held-out log loss a row:
// noise never buys a pull toward the book. The real gains run 0.001 to 0.025 a row)
export const ANCHOR_GAIN = 0.0003;

// The bot's mean pulled toward the book's implied mean: mu x (im / mu)^pull (0 the bot's, 1 the book's); mu where
// either is missing
export const anchoredMean = (mu, im, pull) => (fin(im) && im > 0 && fin(mu) && mu > 0 && fin(pull) && pull > 0 ? mu * Math.pow(im / mu, Math.min(1, pull)) : mu);

// The sports the anchor prices (the gate's verdict, 2026-10-19): the NFL (better beyond noise against the Book at the
// close), the NBA and the NHL (ties). MLB held: at the open its rows ran 0.0002 a row worse beyond noise over
// 149k rows (the close tied), so its pull is fit and recorded for the readout but prices nothing till a gate says
// otherwise (DECISIONS.md D33)
export const ANCHOR_SPORTS = new Set(['nfl', 'nba', 'nhl']);
export const anchorOn = (sport) => ANCHOR_SPORTS.has(sport);

// A stat's pull for a row: its side's (pullUp where the bot's mean is over the book's, pullDn under), from a fit's
// entry { pull, d } (or a plain number); 0 with none
export function pullOf(entry, mu, im) {
  if (entry === null || entry === undefined) return 0;
  if (typeof entry === 'number') return Math.min(1, Math.max(0, entry));
  const p = fin(entry.pull) ? entry.pull : 0;
  const d = fin(entry.d) ? entry.d : 0;
  const up = fin(mu) && fin(im) && mu > im;
  return Math.min(1, Math.max(0, up ? p + d : p - d));
}

// A fit's entry for a stat: its own, else none (0: the bot's own number). fit: anchor.json's { stats: { <stat>: {
// pull, d } } } or null
export const anchorEntry = (fit, stat) => fit?.stats?.[stat] ?? null;

// The chances at a line from the anchored mean (the stat's own shape at it, no recalibration): { over, under, push,
// im, mean, pull }; null where the book's implied mean can't be had (then the caller keeps the bot's own chances)
export function anchoredChances(line, mu, params, mix, fairOver, entry) {
  if (!fin(line) || !fin(mu) || !params) return null;
  const im = impliedMean(line, fin(fairOver) ? fairOver : 0.5, params, mix);
  if (im === null) return null;
  const pull = pullOf(entry, mu, im);
  // (no pull: the bot's own chance exactly as the fit calibrated it (project.mjs cal), nothing changed; a pull: the
  // stat's own shape at the anchored mean with no recalibration, which was fit on the bot's own chances and only
  // hurts at a mean the book has had a say in: measured 2026-10-19, +0.002 to +0.015 a row at the book's mean)
  const mean = anchoredMean(mu, im, pull);
  const c = pull > 0 ? lineChances(line, mean, { ...params, cal: null, calSide: null }, mix) : lineChances(line, mu, params, mix);
  return { over: c.over, under: c.under, push: c.push, im: r4(im), mean: r4(mean), pull: r4(pull) };
}

// (a row's over chance at a pull: rows carry mu, im, line, params, mix; the push left out of both sides as
// lineChances does)
function overAt(x, pull) {
  const mean = anchoredMean(x.mu, x.im, pull);
  let p = chanceOver(x.line, mean, x.params, x.mix);
  if (Number.isInteger(x.line) && x.line >= 0) {
    const push = Math.min(0.99, Math.exp(chanceLog(x.line, mean, x.params, x.mix)));
    p = Math.min(1, p / (1 - push));
  }
  return p;
}
const loss = (p, y) => -Math.log(clip(y ? p : 1 - p));

// The weighted log loss of a pull on rows ({ mu, im, line, params, mix, y (1 over, 0 under), w }), each side's
// pull its own where asym is given (pull + d over the book, pull - d under)
export function pullLoss(rows, pull, d = 0) {
  let s = 0;
  let w = 0;
  for (const x of rows) {
    const side = Math.min(1, Math.max(0, x.mu > x.im ? pull + d : pull - d));
    s += x.w * loss(overAt(x, side), x.y);
    w += x.w;
  }
  return w > 0 ? s / w : null;
}

// A stat's fit on its rows: the pull with the lowest log loss on the grid (0 where 0 ties the best: the bot's own
// number wins a tie), then the asymmetry d with the lowest on its grid at that pull (0 wins a tie); each shrunk by
// the rows' worth toward 0 (n / (n + ANCHOR_K)); under ANCHOR_MIN rows, 0 and 0. { pull, d, own, ownD, n, gain
// (the log loss at 0 less at the fit: the bot's own number's over the fit's, above 0 the fit better) }
export function fitStatAnchor(rows, { k: K = ANCHOR_K } = {}) {
  const n = rows.filter((x) => x.y === 0 || x.y === 1).length;
  const out = { pull: 0, d: 0, own: 0, ownD: 0, n, gain: 0 };
  if (n < ANCHOR_MIN) return out;
  const l0 = pullLoss(rows, 0);
  let best = { pull: 0, ll: l0 };
  for (const pull of PULL_GRID) {
    if (pull === 0) continue;
    const ll = pullLoss(rows, pull);
    if (ll < best.ll - 1e-12) best = { pull, ll };
  }
  // (the floor: a pull that doesn't beat the bot's own number by ANCHOR_GAIN is noise, 0)
  if (best.ll > l0 - ANCHOR_GAIN) best = { pull: 0, ll: l0 };
  // (the asymmetry is the pull's: none without a pull (a one-sided pull toward the book where the bot's number
  // wins would be the drift the owner forbids), and it too must beat the floor)
  let bestD = { d: 0, ll: best.ll };
  if (best.pull > 0)
    for (const d of ASYM_GRID) {
      if (d === 0) continue;
      const ll = pullLoss(rows, best.pull, d);
      if (ll < bestD.ll - 1e-12) bestD = { d, ll };
    }
  if (bestD.ll > best.ll - ANCHOR_GAIN) bestD = { d: 0, ll: best.ll };
  const k = n / (n + K);
  return { pull: r4(k * best.pull), d: r4(k * bestD.d), own: best.pull, ownD: bestD.d, n, gain: r4(l0 - bestD.ll) };
}

// Every stat's fit on the rows (each row's stat): { v, at, rows, stats: { <stat>: fitStatAnchor's } }
export function fitAnchor(rows, { at = null, k = ANCHOR_K } = {}) {
  const byStat = new Map();
  for (const x of rows) {
    if (!(x.w > 0) || !fin(x.im) || !(x.im > 0) || !(x.mu > 0) || (x.y !== 0 && x.y !== 1)) continue;
    (byStat.get(x.stat) ?? byStat.set(x.stat, []).get(x.stat)).push(x);
  }
  const stats = {};
  for (const [stat, list] of [...byStat].sort((a, b) => a[0].localeCompare(b[0]))) stats[stat] = fitStatAnchor(list, { k });
  return { v: ANCHOR_V, at: at ?? new Date().toISOString(), rows: rows.length, stats };
}

// The sport's anchor as the live desk reads it: apps/<sport>/src/StaticData/model/anchor.json, written by gate.mjs
// --record (the fit on every season of the priced history to date); null with none (every stat the bot's own
// number) or one it can't read. ANCHOR_OFF=1 (the gate's flag candidate): none
export function readAnchor(root, sport) {
  if (process.env.ANCHOR_OFF === '1' || !anchorOn(sport)) return null;
  const file = path.join(root, 'apps', sport, 'src/StaticData/model/anchor.json');
  try {
    if (!existsSync(file)) return null;
    const fit = JSON.parse(readFileSync(file, 'utf8'));
    return fit && fit.stats && typeof fit.stats === 'object' ? fit : null;
  } catch {
    return null;
  }
}

// The run log's line: each stat's pull and asymmetry
export const anchorText = (fit) => (fit?.stats ? Object.entries(fit.stats).map(([k, v]) => `${k} ${v.pull}${v.d ? ` (${v.d > 0 ? '+' : ''}${v.d} over the Book)` : ''} on ${v.n}`).join(', ') : 'none: the Bot\'s own numbers');
