// A term's own rows' bias may run a little further under for a gain that earns it (the owner's call, 2026-10-17, the
// Emanuel Wilson case; libs/ranker/scripts/model/project.mjs ownBias): where its held-out gain is OWN_TOL_GAIN times
// its floor or more, its own rows' bias may be larger by at most OWN_TOL of the stat's unit, and within it the term is
// never in hard but comes in at its soft weight ('its own bias within tolerance', a fail the soft stage takes). Under
// the gain, or past the tolerance, 'its own bias' as before: left out, never soft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { OWN_TOL, OWN_TOL_GAIN, ownBias, softEligible } from '../libs/ranker/scripts/model/project.mjs';

const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../libs/ranker/scripts/model/project.mjs'), 'utf8');
const FLOOR = 0.0003;
// (a split's rows as biasOf returns them: the rounded bias enumerable, the raw one not; the bias projected less actual)
const rows = (biasRaw, n = 925) => {
  const out = { n, bias: Math.round(biasRaw * 10000) / 10000, mean: 12.5 };
  Object.defineProperty(out, 'biasRaw', { value: biasRaw, enumerable: false });
  return out;
};
const fails = (verdict) => (verdict ? [verdict === 'larger' ? 'its own bias' : verdict === 'within tolerance' ? 'its own bias within tolerance' : 'its own bias not measured'] : []);

test('the tolerance: 0.05 of the unit at four floors', () => {
  assert.equal(OWN_TOL, 0.05);
  assert.equal(OWN_TOL_GAIN, 4);
});

test('a gain of four floors with its own rows 0.03 further under passes to the soft stage; 0.06 fails; two floors with 0.03 fails', () => {
  // (Wilson's own numbers: -0.587 to -0.612 carries a game at +0.0014, past four floors)
  assert.equal(ownBias(rows(-0.587), rows(-0.612), 0.0014, FLOOR), 'within tolerance');
  // (exactly four floors, 0.03 further: within)
  const within = ownBias(rows(-0.5), rows(-0.53), 4 * FLOOR, FLOOR);
  assert.equal(within, 'within tolerance');
  assert.ok(softEligible('ab', { ab: 0.25 }, fails(within)), 'soft-eligible: in at its soft weight, not hard');
  assert.ok(fails(within).length, 'never a clean pass: the hard gate holds it');
  // (0.06 further: past the tolerance, left out, never soft)
  const past = ownBias(rows(-0.5), rows(-0.56), 4 * FLOOR, FLOOR);
  assert.equal(past, 'larger');
  assert.ok(!softEligible('ab', { ab: 0.25 }, fails(past)));
  // (two floors with 0.03 further: the gain doesn't earn it)
  const weak = ownBias(rows(-0.5), rows(-0.53), 2 * FLOOR, FLOOR);
  assert.equal(weak, 'larger');
  assert.ok(!softEligible('ab', { ab: 0.25 }, fails(weak)));
  // (the sign doesn't matter: over by 0.03 more at four floors is within too)
  assert.equal(ownBias(rows(0.5), rows(0.53), 4 * FLOOR, FLOOR), 'within tolerance');
  // (at the edge: 0.05 further within, a hair past not; read unrounded)
  assert.equal(ownBias(rows(-0.5), rows(-0.55), 4 * FLOOR, FLOOR), 'within tolerance');
  assert.equal(ownBias(rows(-0.5), rows(-0.55001), 4 * FLOOR, FLOOR), 'larger');
  // (a gain of 0.00119 against four floors of 0.0003: under, however it rounds)
  assert.equal(ownBias(rows(-0.5), rows(-0.53), 0.00119, FLOOR), 'larger');
});

test('as before where the tolerance has no say: smaller passes clean, a tie is larger, few rows not measured, no floor no tolerance', () => {
  assert.equal(ownBias(rows(-0.5), rows(-0.49), 0.0014, FLOOR), null);
  assert.equal(ownBias(rows(0), rows(0), 0.0014, FLOOR), null);
  assert.equal(ownBias(rows(-0.5), rows(-0.5), 0.0001, FLOOR), 'larger');
  assert.equal(ownBias(rows(-0.5, 99), rows(-0.53, 99), 0.0014, FLOOR), 'not measured');
  assert.equal(ownBias(null, null, 0.0014, FLOOR), 'not measured');
  assert.equal(ownBias(rows(-0.5), rows(-0.53), 0.0014, undefined), 'larger');
  assert.equal(ownBias(rows(-0.5), rows(-0.53), null, FLOOR), 'larger');
  // (the unrounded bias read: larger by under 0.00005 is larger, not a tie)
  assert.equal(ownBias(rows(-0.5), rows(-0.50004), 0.0001, FLOOR), 'larger');
});

test("fitStat's own-rows gate goes through ownBias on the raw gain and the term's floor, and the soft stage takes the tolerated fail", () => {
  const body = SRC.slice(SRC.indexOf('export function fitStat('));
  assert.match(body, /const on = ownBias\(o\?\.on, t\?\.on, raw, MIN_GAIN\[key\]\);/);
  assert.match(body, /on === 'within tolerance' \? 'its own bias within tolerance'/);
  assert.ok(softEligible('c_backupRun', { c_backupRun: 0.1 }, ['its own bias within tolerance']));
  assert.ok(softEligible('ab', { ab: 0.25 }, ['gain', 'its own bias within tolerance']));
  assert.ok(!softEligible('ab', { ab: 0.25 }, ['its own bias']));
  // (never the flags whose history reads the game itself: the tolerance doesn't let them in)
  assert.ok(!softEligible('c_rb1Out', { c_rb1Out: 0.1 }, ['its own bias within tolerance']));
});
