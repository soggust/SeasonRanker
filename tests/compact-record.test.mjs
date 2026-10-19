// The Bot's big records written compact (bet-format.ts compactCount, compactRecord, recordTip; the owner,
// 2026-10-19: the replayed history's "6,198-2,205" broke the Algorithm tab's layout): under 1,000 as it is, one
// decimal and a k from 1,000, a whole k from 10,000, the exact figure on hover; units keep their own format
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const f = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

test('a count: 999 as it is, 1,000 "1.0k", 6,198 "6.2k", 12,345 "12k"', () => {
  assert.equal(f.compactCount(0), '0');
  assert.equal(f.compactCount(999), '999');
  assert.equal(f.compactCount(1000), '1.0k');
  assert.equal(f.compactCount(6198), '6.2k');
  assert.equal(f.compactCount(9949), '9.9k');
  // (9,950 would read "10.0k": a whole k from there)
  assert.equal(f.compactCount(9950), '10k');
  assert.equal(f.compactCount(12345), '12k');
  assert.equal(f.countTip(999), null);
  assert.equal(f.countTip(12345), '12,345');
});

test('a record: each part on its own, the push only when there is one, the exact one on hover once shortened', () => {
  assert.equal(f.compactRecord({ won: 999, lost: 998, push: 0 }), '999–998');
  assert.equal(f.recordTip({ won: 999, lost: 998, push: 0 }), null);
  assert.equal(f.compactRecord({ won: 6198, lost: 2205, push: 0 }), '6.2k–2.2k');
  assert.equal(f.recordTip({ won: 6198, lost: 2205 }), '6,198–2,205');
  assert.equal(f.compactRecord({ won: 12345, lost: 1000, push: 41 }), '12k–1.0k–41');
  assert.equal(f.recordTip({ won: 12345, lost: 1000, push: 41 }), '12,345–1,000–41');
  assert.equal(f.compactRecord({ won: 1750, lost: 999, push: 1200 }, '-'), '1.8k-999-1.2k');
  assert.equal(f.fullRecord({ won: 1750, lost: 999, push: 1200 }, '-'), '1,750-999-1,200');
  // (the desk's and the history's record the same writer: replay-history.ts recordText)
  assert.equal(f.recordText({ won: 6198, lost: 2205, push: 10 }), '6.2k–2.2k–10');
  // (units unchanged)
  assert.equal(f.units(-39.04), '-39.04u');
  assert.equal(f.units(1234.5), '+1234.50u');
});

// The Algorithm tab's build line (replay-history.ts buildOf): the epoch, the replay's commit short and what changed
// (gate.mjs --record writes DECISIONS.md's latest heading as the file's note)
test("the build: the desk's epoch, the newest replay's commit and note, the sport on show's when one is", () => {
  const file = (sport, at, commit, note) => ({ v: 1, sport, at, epoch: '2026-10-19T17:15:00Z', commit, note, through: '2026-10-18T23:00:00Z' });
  const files = [file('nfl', '2026-10-19T17:00:00Z', '3675f828abc', 'D47. The history'), file('nhl', '2026-10-19T18:00:00Z', 'aaaabbbbcc', 'D48. Next'), null];
  assert.deepEqual(f.buildOf(files, null, '2026-10-19T17:15:00Z'), { at: '2026-10-19T17:15:00Z', commit: 'aaaabbbb', note: 'D48. Next', through: '2026-10-18T23:00:00Z' });
  assert.equal(f.buildOf(files, 'nfl', null).commit, '3675f828');
  assert.equal(f.buildOf(files, 'nfl', null).at, '2026-10-19T17:15:00Z');
  assert.deepEqual(f.buildOf([], null, null), { at: null, commit: null, note: null, through: null });
  assert.equal(f.buildLabel('2026-10-19T17:15:00Z'), 'Oct 19, 2026, 12:15 PM CDT');
});
