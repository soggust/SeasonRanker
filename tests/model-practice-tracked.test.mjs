// The slate's practice candidates kept as tracked rows (DECISIONS.md D87, the owner 2026-10-23: "I want to make sure
// we are practicing timing, betting strategies, etc."): picked every run whatever PRACTICE_STAKED (run.mjs
// practicePicks, mma-desk.mjs mmaPracticePicks, the replay's practice loop) and tagged (topN, practiceTracked) on the
// tracked row at no stake. Staking stays off (D57): a tagged row is never staked, never in the record, and every
// gate, cap and fit reads it exactly as the untagged tracked row it was. The Algorithm tab shows them as if bet
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './support/engine.mjs';
import { PRACTICE_STAKED, PRACTICE_UNITS, inPractice, isPracticeTop, isPracticeTracked, learnView, lineGate, placement, practiceRecord, practiceTag, propGate, record, trackedRecord } from '../libs/ranker/scripts/model/desk.mjs';

const MODEL = path.join(ROOT, 'libs/ranker/scripts/model');
const src = (f) => fs.readFileSync(path.join(MODEL, f), 'utf8');

const row = (id, status, over = {}) => ({
  id, sport: 'nba', event: id, market: 'prop', propType: 'pts', start: '2026-10-21T00:00:00Z', placedAt: '2026-10-21T00:00:00Z', gradedAt: '2026-10-21T04:00:00Z',
  odds: -110, ...placement(false, 0.5), status, profit: 0, clv: { v: 2, prob: 0.01, ev: 0.02, beat: true, pts: 0 }, ...over,
});
const tag = practiceTag({ rank: 1, quota: 2, slate: 8, edge: 0.012 });

test('D87: a tagged tracked practice row is never staked, never in the record nor the practice line, never a practice pick', () => {
  assert.equal(PRACTICE_STAKED, false, 'staking stays off (D57)');
  const t = { ...row('1', 'won'), ...tag };
  assert.equal(t.intent, 'track');
  assert.equal(t.units, 0);
  assert.equal(t.practiceTracked, true);
  assert.deepEqual(t.topN, { rank: 1, quota: 2, slate: 8, edge: 0.012 });
  assert.equal(isPracticeTracked(t), true);
  assert.equal(isPracticeTop(t), false);
  assert.equal(inPractice(t), false);
  // (and as the learning reads it (learnView: an action bet at its trackUnits), still not a practice pick)
  assert.equal(isPracticeTop(learnView(t)), false);
  assert.equal(record([t]).bets, 0);
  assert.equal(practiceRecord([t]).bets, 0);
});

test('D87: the tag moves no gate, no learning view and no tracked record (the same as the untagged row)', () => {
  const plain = Array.from({ length: 60 }, (_, i) => row(`r${i}`, i % 3 ? 'won' : 'lost', { clv: { v: 2, prob: i % 2 ? 0.02 : -0.03, ev: 0.01, beat: i % 2 === 1, pts: 0 } }));
  const tagged = plain.map((b, i) => (i % 2 ? { ...b, ...tag } : b));
  assert.deepEqual(propGate(tagged, 'nba', null), propGate(plain, 'nba', null));
  assert.deepEqual(lineGate(tagged.map((b) => ({ ...b, market: 'spread' })), 'nba', null), lineGate(plain.map((b) => ({ ...b, market: 'spread' })), 'nba', null));
  assert.deepEqual(trackedRecord(tagged), trackedRecord(plain));
  assert.deepEqual(record(tagged.map(learnView)), record(plain.map(learnView)));
  assert.deepEqual(tagged.map(learnView).map((b) => [b.units, b.profit, b.intent]), plain.map(learnView).map((b) => [b.units, b.profit, b.intent]));
});

test('D87: the desks pick the practice candidates whatever PRACTICE_STAKED, and tag only a tracked row, at no stake', () => {
  const run = src('run.mjs');
  assert.match(run, /const forced = practicePicks\(r, candidates\);/);
  assert.match(run, /const topN = x\.researchPractice \?\? \(PRACTICE_STAKED \? slatePick : null\);/);
  assert.match(run, /if \(tagOnly && isTracked\(bet\)\) Object\.assign\(bet, practiceTag\(tagOnly\)\);/);
  const mma = src('mma-desk.mjs');
  assert.match(mma, /const forced = mmaPracticePicks\(mlNew,/);
  assert.match(mma, /if \(!PRACTICE_STAKED\) \{\s*if \(isTracked\(b\)\) Object\.assign\(b, practiceTag\(t\)\);\s*continue;/);
  const rep = src('replay-record.mjs');
  assert.match(rep, /\(staked \? bets : tracked\)\.push\(betOf\(/);
  assert.equal(PRACTICE_UNITS, 0.5);
});
