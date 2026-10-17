// The fit's gates read unrounded numbers (round D, 2026-10-17; libs/ranker/scripts/model/project.mjs llOf, biasRawOf,
// gainOf): every held-out number is kept to 4 places for the logs and the state, and the compares used to read those,
// so a gain of 0.00025 could read as two log losses 4 places apart (0.0003) and pass the floor, and a bias larger by
// under 0.00005 could read "no larger". The raw values ride along, not enumerable, and every gate reads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { biasRawOf, gainOf, llOf } from '../libs/ranker/scripts/model/project.mjs';

const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../libs/ranker/scripts/model/project.mjs'), 'utf8');
// (a check as check() returns it: the rounded number enumerable, the raw one not)
const checkLike = (llRaw, biasRaw = 0) => {
  const out = { logLoss: Math.round(llRaw * 10000) / 10000, bias: Math.round(biasRaw * 10000) / 10000 };
  Object.defineProperty(out, 'llRaw', { value: llRaw, enumerable: false });
  Object.defineProperty(out, 'biasRaw', { value: biasRaw, enumerable: false });
  return out;
};

test('gainOf: a gain of 0.00025 that rounds to 0.0003 fails a 0.0003 floor; the rounded numbers are for show', () => {
  // (0.65015 rounds to 0.6502, 0.6499 stays: rounded, the gain reads 0.0003; raw, 0.00025)
  const off = checkLike(0.65015);
  const on = checkLike(0.6499);
  assert.equal(off.logLoss - on.logLoss > 0.00029, true, 'the rounded difference reads 0.0003');
  const raw = gainOf(off, on);
  assert.ok(Math.abs(raw - 0.00025) < 1e-9, `raw ${raw}`);
  assert.equal(raw >= 0.0003, false, 'the floor fails on the raw gain');
  // (a check without its raw (an older saved one) falls back to the rounded number; a side not measured counts 0)
  assert.equal(llOf({ logLoss: 0.61 }), 0.61);
  assert.equal(llOf(null), null);
  assert.equal(gainOf({ logLoss: 0.61 }, null), 0.61);
});

test('biasRawOf: a bias larger by under 0.00005 is larger, not a tie', () => {
  const off = checkLike(0.6, 0.01);
  const on = checkLike(0.6, 0.01004);
  assert.equal(Math.abs(on.bias) <= Math.abs(off.bias), true, 'rounded, a tie');
  assert.equal(Math.abs(biasRawOf(on)) <= Math.abs(biasRawOf(off)), false, 'raw, larger');
  assert.equal(biasRawOf({ bias: -0.2 }), -0.2);
  // (the raw values never reach the state: not enumerable)
  assert.deepEqual(Object.keys(on), ['logLoss', 'bias']);
  assert.equal(JSON.stringify(on).includes('Raw'), false);
});

test('every gate in fitStat reads the raw numbers: the five floors through gainOf, the biases through biasRawOf', () => {
  const body = SRC.slice(SRC.indexOf('export function fitStat('));
  // (the floors: the late terms' (MIN_GAIN, sp's early lines), the draft prior's, the recency weight's and the
  // recalibration by side's (DRAFT_GAIN), each on a raw gain from gainOf)
  assert.match(body, /const raw = key === 'lp' \? gainOf\(off\.nonEligCheck, tried\.nonEligCheck\) : gainOf\(off\.check, tried\.check\);/);
  assert.match(body, /const spRaw = [^\n]*gainOf\(off\.early, tried\.early\)/);
  assert.match(body, /\(key === 'sp' \? spRaw : raw\) >= MIN_GAIN\[key\]/);
  assert.equal((body.match(/const raw = gainOf\(off\.check, tried\.check\);\s*\r?\n\s*gains\.(dp|hl) = r4\(raw\);/g) ?? []).length, 2, "the draft prior's and the recency weight's");
  assert.equal((body.match(/if \(!\(raw >= DRAFT_GAIN\)\) fails\.push\('gain'\)/g) ?? []).length, 2);
  assert.match(body, /const csRaw = sided\.calSide \? gainOf\(current\.check, sided\.check\) : null;/);
  assert.match(body, /if \(!\(csRaw >= DRAFT_GAIN\)\) fails\.push\('gain'\)/);
  // (the optional terms' and the dispersion growth's keep: the raw gain over 0)
  assert.equal((body.match(/const raw = gainOf\(without\.check, current\.check\);/g) ?? []).length, 2);
  // (no compare left on a rounded log loss or bias)
  assert.doesNotMatch(body, /\.logLoss \?\? 0\) - \(/, 'a gain from rounded log losses');
  assert.doesNotMatch(body, /(fine|no)\([a-zA-Z?.]*\.bias,/, 'a bias compare on the rounded number');
  assert.doesNotMatch(body, /\b[a-z0-9]+\.logLoss > [a-z0-9]+\.logLoss\b/, 'a log loss compare on the rounded number');
  assert.doesNotMatch(body, /gains\[key\] (<=|>) 0/, 'a keep decided on the rounded gain');
});
