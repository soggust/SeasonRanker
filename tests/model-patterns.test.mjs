// The win patterns (DECISIONS.md D84): a bet's segments from what was known at placement, and the walk that earns a
// segment a band only on the bets settled before the month.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyOf, patternBand, patternIds, patternWalk } from '../libs/ranker/scripts/model/patterns.mjs';

test('pattern ids: the chance, edge, price, stat and side, the driving piece, minutes, role, rest, venue, seasons played, month', () => {
  const b = { market: 'prop', stat: 'reb', side: 'under', p: 0.62, odds: -120, t: Date.parse('2025-11-10T00:00:00Z'), attr: { opponent: 0.03, form: -0.01, base: 0.2, vacated: 0.01 } };
  const ids = patternIds(b, { min5: 31, min20: 26, gp: 20, rest: 1, home: false, yrs: 1 });
  for (const id of ['stat:reb:under', 'chance:60+', 'edge:7+', 'price:fav', 'piece:opponent+', 'role:vacated', 'minutes:28-34', 'role:up', 'rest:b2b', 'venue:away', 'young:2nd', 'month:oct-jan']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((id) => id.startsWith('piece:base')), 'the base is not a piece that drives');
  const line = patternIds({ market: 'ml', side: 'away', p: 0.45, odds: 140, t: Date.parse('2025-04-01T00:00:00Z'), timing: 'open' });
  assert.deepEqual(line, ['stat:ml:away', 'chance:u50', 'edge:2-4', 'price:dog', 'month:apr+', 'timing:open']);
  assert.equal(familyOf('role:up'), 'role');
});

test('the pattern walk reads only bets settled before the month; a LOCK needs two families or one strong', () => {
  const t0 = Date.parse('2024-01-05T00:00:00Z');
  const mk = (i, id, flat, season) => ({ t: t0 + i * 864e5 * 3, at: t0 + i * 864e5 * 3 - 36e5, season, cls: 'prop', ids: [id], flat });
  const list = [];
  for (let i = 0; i < 200; i++) list.push(mk(i, i % 2 ? 'chance:60+' : 'chance:50-55', i % 2 ? (i % 4 === 1 ? 0.9 : 0.9) : -1, i < 100 ? 2024 : 2025));
  const w = patternWalk(list);
  assert.equal(w.at(t0, 'prop').size, 0, 'nothing earned before anything settled');
  const late = w.at(t0 + 199 * 864e5 * 3, 'prop');
  assert.equal(late.get('chance:60+') !== undefined, true, 'earned on its record before the month');
  assert.equal(late.has('chance:50-55'), false, 'a losing segment never earns');
  const earned = new Map([['chance:60+', 'love'], ['piece:opponent+', 'love'], ['edge:7+', 'love']]);
  assert.equal(patternBand(['chance:60+'], earned).band, 'high');
  assert.equal(patternBand(['chance:60+', 'piece:opponent+'], earned).band, 'lock');
  assert.equal(patternBand(['stat:reb:under'], earned).band, 'medium');
  assert.equal(patternBand(['chance:60+'], new Map([['chance:60+', 'lock']])).band, 'lock');
});
