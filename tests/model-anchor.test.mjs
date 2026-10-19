// The anchored projection (libs/ranker/scripts/model/anchor.mjs, DECISIONS.md D33): the bot's mean pulled toward the
// book's implied mean by a weight the evidence sets, 0 the bot's own number. The owner's condition: it must never
// become a weight that pulls the bot to the book once it's ahead, so on a history where the bot's mean beats the
// book's the fitted pull is 0 and the trust can reach 1; where the book's beats the bot's, the pull is positive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_K, ANCHOR_MIN, PULL_GRID, anchorEntry, anchoredChances, anchoredMean, fitAnchor, fitStatAnchor, pullLoss, pullOf, readAnchor } from '../libs/ranker/scripts/model/anchor.mjs';
import { lineChances, nbOver } from '../libs/ranker/scripts/model/project.mjs';
import { fitTrust, bucketTrustOf, chanceAt } from '../libs/ranker/scripts/model/desk.mjs';
import { rng } from '../libs/ranker/scripts/model/gate-score.mjs';

// (a seeded negative binomial: gamma-Poisson)
const sampler = (seed) => {
  const u = rng(seed);
  const normal = () => {
    let a = 0;
    while (a === 0) a = u();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
  };
  const gamma = (k, theta) => {
    if (k < 1) return gamma(k + 1, theta) * Math.pow(u(), 1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x;
      let v;
      do {
        x = normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const w = u();
      if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta;
    }
  };
  const poisson = (lambda) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= u();
    } while (p > L);
    return k - 1;
  };
  return { u, normal, nb: (mu, r) => poisson(gamma(r, mu / r)) };
};

// A synthetic priced history: n player games with a true mean around 8, the bot's mean off it by botSd (log) and the
// book's implied mean off it by bookSd; the book's main line at its implied median, the result drawn from the truth
const history = (n, botSd, bookSd, seed = 7) => {
  const s = sampler(seed);
  const params = { r: 10, rk: 0, cal: null };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const truth = 8 * Math.exp(0.3 * s.normal());
    const mu = truth * Math.exp(botSd * s.normal());
    const im = truth * Math.exp(bookSd * s.normal());
    const line = Math.floor(im) + 0.5;
    const v = s.nb(truth, 10);
    rows.push({ stat: 'rec', mu, im, line, params, mix: null, y: v > line ? 1 : v < line ? 0 : null, w: 1, fair: nbOver(line, im, 10), v });
  }
  return rows;
};

test('anchor: the mean at pull 0 is the bot\'s, at 1 the book\'s, between in log space; a missing implied mean leaves it', () => {
  assert.equal(anchoredMean(10, 20, 0), 10);
  assert.equal(anchoredMean(10, 20, 1), 20);
  assert.ok(Math.abs(anchoredMean(10, 20, 0.5) - Math.sqrt(200)) < 1e-9);
  assert.equal(anchoredMean(10, null, 0.5), 10);
  assert.equal(anchoredMean(10, 20, 1.5), 20, 'held to 1');
  // (a side's pull: pull + d over the book, pull - d under, held to 0..1; a plain number as it is; none 0)
  assert.equal(pullOf({ pull: 0.5, d: 0.2 }, 12, 10), 0.7);
  assert.equal(pullOf({ pull: 0.5, d: 0.2 }, 8, 10), 0.3);
  assert.equal(pullOf({ pull: 0.1, d: -0.3 }, 8, 10), 0.4);
  assert.equal(pullOf(0.25, 8, 10), 0.25);
  assert.equal(pullOf(null, 8, 10), 0);
  assert.equal(anchorEntry(null, 'rec'), null);
  assert.equal(anchorEntry({ stats: { rec: { pull: 0.4, d: 0 } } }, 'rec').pull, 0.4);
  // (the chances at a line from the anchored mean: the book's own chance at pull 1 on a plain shape)
  const params = { r: 10, rk: 0, cal: [0.3, 0.8] };
  const c1 = anchoredChances(7.5, 5, params, null, 0.55, { pull: 1, d: 0 });
  assert.ok(Math.abs(c1.over - 0.55) < 0.002, `the book's own chance at pull 1 (${c1.over})`);
  const c0 = anchoredChances(7.5, 5, params, null, 0.55, { pull: 0, d: 0 });
  assert.ok(Math.abs(c0.over - lineChances(7.5, 5, params, null).over) < 1e-9, 'the bot\'s own chance at pull 0, exactly as the fit calibrated it');
  assert.ok(Math.abs(c0.over - nbOver(7.5, 5, 10)) > 1e-6, 'the recalibration kept at pull 0');
  const cHalf = anchoredChances(7.5, 5, params, null, 0.55, { pull: 0.5, d: 0 });
  assert.ok(Math.abs(cHalf.over - nbOver(7.5, Math.sqrt(5 * cHalf.im), 10)) < 1e-6, 'a pull: the plain shape at the anchored mean, no recalibration');
  assert.equal(anchoredChances(7.5, 5, params, null, 0.55, null).pull, 0, 'no fit: the bot\'s own number');
});

test('anchor: where the bot\'s mean beats the book\'s the fitted pull is 0 (and the trust reaches 1); where the book\'s beats the bot\'s it is positive', () => {
  // (the bot near the truth, the book noisy)
  const botBetter = history(6000, 0, 0.15);
  const f1 = fitStatAnchor(botBetter);
  assert.equal(f1.pull, 0, `the pull is 0 where the bot is ahead (own ${f1.own})`);
  assert.equal(f1.own, 0);
  // (the trust on the anchored chances, fit as the desk fits it (desk.mjs fitTrust): the grid reaches 1, and here it
  // gets there, so the bot's own number carries the whole price; the bucket's rung holds nothing back)
  const bets = botBetter.filter((x) => x.y !== null).map((x, i) => ({ market: 'prop', model: anchoredChances(x.line, x.mu, x.params, null, x.fair, { pull: 0, d: 0 }).over, fair: x.fair, event: `g${i}`, status: x.y ? 'won' : 'lost' }));
  const t = fitTrust(bets, 0.5);
  assert.equal(t.trust, 1, `the trust rises to 1 on evidence (${t.trust})`);
  assert.equal(bucketTrustOf({ 'prop:rec': { trust: 1, lines: { high: { trust: 1 } } } }, 'prop:rec', 7.5), 1);
  assert.equal(chanceAt('prop', 0.5, 0.56, 1), 0.56);
  // (the book near the truth, the bot noisy: the pull is positive, shrunk by the rows' worth toward 0)
  const bookBetter = history(6000, 0.2, 0, 11);
  const f2 = fitStatAnchor(bookBetter);
  assert.ok(f2.own >= 0.7, `the book's number wins most of the way (own ${f2.own})`);
  assert.ok(f2.pull > 0 && Math.abs(f2.pull - (f2.n / (f2.n + ANCHOR_K)) * f2.own) < 1e-3, `shrunk toward 0 by the rows' worth, never toward the book (${f2.pull} of ${f2.own} on ${f2.n})`);
  assert.ok(f2.gain > 0);
  // (the fit's loss falls with the pull where the book is better, and rises where the bot is)
  assert.ok(pullLoss(bookBetter, 0.8) < pullLoss(bookBetter, 0));
  assert.ok(pullLoss(botBetter, 0.8) > pullLoss(botBetter, 0));
  // (too few rows: 0, the bot's own number; and the grid runs 0 to 1)
  assert.equal(fitStatAnchor(bookBetter.slice(0, ANCHOR_MIN - 1)).pull, 0);
  assert.equal(PULL_GRID[0], 0);
  assert.equal(PULL_GRID[PULL_GRID.length - 1], 1);
  // (every stat its own: a stat where the bot is ahead sits at 0 beside one where it isn't)
  const fit = fitAnchor([...botBetter, ...bookBetter.map((x) => ({ ...x, stat: 'recYds' }))], { at: 'test' });
  assert.equal(fit.stats.rec.pull, 0);
  assert.ok(fit.stats.recYds.pull > 0);
  assert.equal(readAnchor('/nowhere', 'nfl'), null);
});
