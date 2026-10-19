// The Book lists a practice pick only with an edge at the current price (the owner's note, 2026-10-19: "Why are
// we showing super negative Kelly practice bets in Best Bets?"): book-rows.ts bookShows / bookRows, run on the
// page's one list (listed), which Best Bets, the Live tab's card (liveBoards) and a game's picks (inGame, the
// sections) all read. A real bet is never hidden; a practice pick whose live price gives it an edge shows, tagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });
const { bookShows, bookRows, rowOf, withLive, joinSuggestions } = book;

const pick = (over = {}) => ({
  id: '401:spread:away', start: '2026-10-20T00:15:00Z', matchup: 'WSH @ SF', teams: [], market: 'WSH +7.5', kind: 'spread',
  pick: 'WSH +7.5', side: 'away', line: 7.5, odds: -110, p: 0.5, chance: 50, edge: false, score: -0.045, units: 0.5, reason: '', ...over,
});
const practice = (over = {}) => rowOf('nfl', pick({ practice: true, ...over }), false);

test('a negative-Kelly practice pick is hidden; a real bet never is', () => {
  const neg = practice({ p: 0.44, score: -0.12 });
  assert.equal(neg.practice, true);
  assert.equal(bookShows(neg), false);
  // (a real bet, even one whose live price moved against it, stays: the Bot placed it past the vig)
  const real = withLive(rowOf('nfl', pick({ id: '401:total:over', kind: 'total', pick: 'Over 51.5', side: 'over', p: 0.56, score: 0.06, edge: true }), false), { odds: -160, from: 'board' });
  assert.equal(bookShows(real), true);
  // (a CHECK and a suggestion are not practice picks)
  assert.equal(bookShows({ ...neg, check: true }), true);
  assert.equal(bookShows({ ...neg, suggested: true }), true);
});

test('a practice pick whose live price gives it an edge shows, its tag kept', () => {
  const moved = withLive(practice({ p: 0.5 }), { odds: 105, from: 'espn' });
  assert.equal(bookShows(moved), true);
  assert.equal(moved.practice, true);
  // (and one moved the other way, past the vig again, is hidden)
  assert.equal(bookShows(withLive(practice({ p: 0.53 }), { odds: -130, from: 'espn' })), false);
  // (no live price: the locked price's Kelly decides)
  assert.equal(bookShows(practice({ p: 0.53, odds: -110 })), true);
  assert.equal(bookShows(practice({ p: 0.51, odds: -110 })), false);
});

test('all three surfaces read the filtered list', () => {
  const rows = [practice({ p: 0.44 }), withLive(practice({ id: '401:ml:away', kind: 'moneyline', pick: 'WSH', p: 0.3, odds: 300 }), { odds: 300, from: 'board' }), rowOf('nfl', pick({ id: '401:total:under', kind: 'total', pick: 'Under 51.5', side: 'under', p: 0.57, edge: true, score: 0.07 }), false)].map((r, i) => ({ ...r, id: i }));
  const listed = bookRows(joinSuggestions(rows, [], () => 0));
  assert.deepEqual(listed.map((r) => r.pick).sort(), ['Under 51.5', 'WSH'].sort());
  assert.ok(listed.find((r) => r.pick === 'WSH').practice);
  // (the page: listed is the one list; Best Bets (shown, sections, favorable), a game's picks (inGame) and the
  // Live tab's card (liveBoards) all come from it)
  const ts = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/src/engine/book/book-page.component.ts'), 'utf8');
  assert.match(ts, /bookRows\(this\.withSuggestions\(/);
  assert.match(ts, /get inGame\(\)[\s\S]{0,80}const rows = this\.listed;/);
  assert.match(ts, /get liveBoards\(\)[\s\S]{0,80}const list = this\.listed;/);
  assert.match(ts, /get shown\(\)[\s\S]{0,300}this\.inGame;/);
});
