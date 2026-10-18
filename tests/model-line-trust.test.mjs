// The small-count fixes (2026-10-18, the audit: out of sample since 10-08 the raw model said .538 on lines of 1.5 or
// under for .481 against the book's .495, .579 on 2 to 3.5 for .493; the owner's "make sure small numbers aren't
// influencing K rating by % or anything crazy"): the props' trust by the line's size (desk.mjs lineBucket,
// fitBuckets, bucketTrustOf: low 1.5 or under from 0.25, mid 2 to 3.5 from 0.375, high the stat's own; every rung
// pulled toward the one above by its own evidence, never switched off), in every sport and the MMA's round totals
// (line-pool.mjs); the stake's Kelly the one the bands read (desk.mjs stakeKelly, picks.mjs kellyOf, level).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCKET_START, STAKE_SCALE, TRUST_K, bucketTrustOf, decimal, fitBuckets, kellyScale, lineBucket, shrunkTrust, stakeFor, stakeKelly } from '../libs/ranker/scripts/model/desk.mjs';
import { kellyOf, level } from '../libs/ranker/scripts/model/picks.mjs';
import { lineEvidence } from '../libs/ranker/scripts/model/line-pool.mjs';

const AT = '2026-10-18T12:00:00Z';
// (n graded props, the model at `model` against the book's `fair`, winning `rate` of them; each its own game)
function props(n, { stat = 'rec', line = 1.5, model = 0.6, fair = 0.5, rate = 0.5, sport = 'nfl', tag = stat } = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `${tag}-${line}-${i}`, event: `${tag}-${line}-${i}`, sport, market: 'prop', propType: stat, line, side: 'over', model, fair, placedAt: AT, start: AT, status: ((i * 61) % 100) / 100 < rate ? 'won' : 'lost' }));
}
const keyOf = (b) => `prop:${b.propType}`;

test('the buckets by the line alone, whatever the stat or the sport: 1.5 or under low, 2 to 3.5 mid, over high', () => {
  assert.deepEqual([0.5, 1, 1.5, 2, 2.5, 3.5, 4, 4.5, 26.5].map(lineBucket), ['low', 'low', 'low', 'mid', 'mid', 'mid', 'high', 'high', 'high']);
  assert.equal(lineBucket(undefined), 'high');
  assert.deepEqual(BUCKET_START, { low: 0.25, mid: 0.375, high: 0.5 });
});

test('no evidence: each bucket its start; a stat priced at its bucket held to its own trust', () => {
  const l = fitBuckets([], [], keyOf, ['prop:rec']);
  assert.deepEqual([l.pool.low.trust, l.pool.mid.trust, l.pool.high.trust], [0.25, 0.375, 0.5]);
  assert.deepEqual([l.keys['prop:rec'].low.trust, l.keys['prop:rec'].mid.trust, l.keys['prop:rec'].high.trust], [0.25, 0.375, 0.5]);
  const trust = { 'prop:rec': { trust: 0.5, lines: l.keys['prop:rec'] }, 'prop:sog': { trust: 0.2, lines: l.keys['prop:rec'] } };
  assert.equal(bucketTrustOf(trust, 'prop:rec', 1.5), 0.25);
  assert.equal(bucketTrustOf(trust, 'prop:rec', 2.5), 0.375);
  assert.equal(bucketTrustOf(trust, 'prop:rec', 45.5), 0.5);
  // (never more than the stat's own: the bucket only shrinks it)
  assert.equal(bucketTrustOf(trust, 'prop:sog', 2.5), 0.2);
  // (a state from before the buckets: the stat's own held to its bucket's start; none at all, 0.5 held the same)
  assert.equal(bucketTrustOf({ 'prop:pts': { trust: 0.5 } }, 'prop:pts', 0.5), 0.25);
  assert.equal(bucketTrustOf({}, 'prop:k', 4.5), 0.5);
});

test('soft: a low line whose model runs hot loses trust by its own evidence, shrunk toward its parent, never switched off', () => {
  // (said 60% against the book's 50%, won 45%: the model's lean costs; 30 games' worth, then 400)
  const few = shrunkTrust(props(30, { rate: 0.45 }), 0.25);
  const many = shrunkTrust(props(400, { rate: 0.45 }), 0.25);
  assert.ok(few.trust < 0.25 && few.trust > many.trust, `${few.trust} ${many.trust}`);
  assert.ok(Math.abs(few.weight - 30 / (30 + TRUST_K)) < 1e-3);
  assert.ok(many.trust > 0, 'shrunk, never off');
  assert.equal(many.fitted, true);
  // (and one whose lean pays earns trust over its start)
  const good = shrunkTrust(props(400, { rate: 0.62 }), 0.25);
  assert.ok(good.trust > 0.25, `${good.trust}`);
});

test('the ladder: a sparse stat leans on its sport, a sparse sport on every sport pooled; each stat its own once it has rows', () => {
  // (the NHL's 1.5s plenty and running hot; the NFL's receptions 10 games, its passing TDs 300 that pay)
  const nhl = props(600, { stat: 'sog', sport: 'nhl', rate: 0.45 });
  const rec = props(10, { stat: 'rec', rate: 0.45 });
  const td = props(300, { stat: 'passTd', line: 0.5, rate: 0.62 });
  const mine = [...rec, ...td];
  const l = fitBuckets([...nhl, ...mine], mine, keyOf, ['prop:rec', 'prop:passTd', 'prop:recYds']);
  assert.ok(l.pool.low.trust < BUCKET_START.low, 'the pool learned from the NHL');
  assert.equal(l.sport.low.parent, l.pool.low.trust);
  // (receptions' 10 games: about its sport's; passing TDs' 300: its own, over the sport's)
  const r = l.keys['prop:rec'].low;
  assert.ok(r.weight < 0.25 && r.parent === l.sport.low.trust && Math.abs(r.trust - r.parent) <= r.weight * Math.abs(r.own - r.parent) + 1e-3);
  assert.ok(l.keys['prop:passTd'].low.trust > l.sport.low.trust);
  // (a stat with no rows at a bucket: its sport's; the high bucket untouched by the low lines)
  assert.equal(l.keys['prop:recYds'].low.trust, l.sport.low.trust);
  assert.equal(l.keys['prop:recYds'].high.trust, 0.5);
});

test("the pool's evidence: every sport's props and the MMA's round totals, graded or closed, since the epoch; never a game line", () => {
  const b = { market: 'prop', line: 1.5, status: 'won', placedAt: AT };
  assert.equal(lineEvidence(b, '2026-10-17T00:00:00Z'), true);
  assert.equal(lineEvidence(b, '2026-10-19T00:00:00Z'), false);
  assert.equal(lineEvidence({ ...b, void: true }, '2026-10-17T00:00:00Z'), false);
  assert.equal(lineEvidence({ ...b, status: 'open' }, '2026-10-17T00:00:00Z'), false);
  assert.equal(lineEvidence({ ...b, status: 'open', clv: { q: 0.5 } }, '2026-10-17T00:00:00Z'), true);
  assert.equal(lineEvidence({ ...b, market: 'total', sport: 'mma', line: 2.5 }, '2026-10-17T00:00:00Z'), true);
  assert.equal(lineEvidence({ ...b, market: 'total', sport: 'nfl', line: 47.5 }, '2026-10-17T00:00:00Z'), false);
});

test("the stake's Kelly: the score the bands read, held to -110's scale, so a short price's small lean is no LOCK; the stake sized on it", () => {
  assert.ok(Math.abs(STAKE_SCALE - 2.1) < 1e-12);
  assert.ok(Math.abs(kellyScale(-110) - 2.1) < 1e-12);
  assert.ok(Math.abs(kellyScale(150) - 2.5 / 1.5) < 1e-12);
  assert.ok(Math.abs(kellyScale(-260) - 2.1) < 1e-12);
  // (-260, the book's 70%, the trusted chance 3.75 points over it: a +5.5 plain Kelly, a LOCK; the stake's +3.2, a LOVE)
  const p = 0.7375;
  const plain = (decimal(-260) * p - 1) / (decimal(-260) - 1);
  assert.equal(level(plain, p), 'lock');
  assert.ok(Math.abs(stakeKelly(-260, p) - (p - 1 / decimal(-260)) * 2.1) < 1e-12);
  assert.equal(kellyOf(-260, p), Math.round(stakeKelly(-260, p) * 1e4) / 1e4);
  assert.equal(level(kellyOf(-260, p), p), 'high');
  // (the stake: stakeFor's fraction the same number, so the stake and the band agree)
  const ev = p * decimal(-260) - 1;
  const evScale = 0.1;
  const REF = 100 / 110;
  assert.equal(stakeFor(ev, evScale, -260), Math.min(3, Math.max(0.5, Math.round((0.5 + (stakeKelly(-260, p) / (evScale / REF)) * 2.5) * 2) / 2)));
  // (a real LOCK still reads as one: 5 points over the break-even at -110 with a 57% chance)
  assert.equal(level(kellyOf(-110, 0.575), 0.575), 'lock');
});
