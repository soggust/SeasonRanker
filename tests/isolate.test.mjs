// The grid's isolation (isolate.ts): a header clicked sorts the rows shown by that stat alone, best first
// (lower first for a lower-is-better stat or a rank), rows without a value last, ties in the list's order,
// the UR rows still below the ranked ones (sorted the same among themselves), each ranked row's place by
// the stat (tied values sharing one). Only a look: the list it was given is left as it was. Then on real
// data: every column shown on a few tabs (combined pairs, grades, ranks, Recent), sorted as its values say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/isolate-entry.ts');
const row = (name, v, team = 'BUF') => ({ gsisId: name, name, v, teamLogo: `assets/X/${team}.png` });
const names = (rows) => rows.map((r) => r.name);

test('isolateRows: best first either way, no value last, ties in the list order sharing a place', async () => {
  const { isolateRows, lowerIsBetter } = await loadEngine('nfl', { entry });
  const rows = [row('a', 10), row('b', 30), row('c', null), row('d', 30), row('e', 20), row('f', NaN), row('g', 5)];
  const before = names(rows);
  const value = (r) => r.v;

  const high = isolateRows(rows, rows.length, value, false);
  assert.deepEqual(names(high.rows), ['b', 'd', 'e', 'a', 'g', 'c', 'f']);
  assert.deepEqual(high.rows.map((r) => high.places.get(r)), [1, 1, 3, 4, 5, null, null]);

  const low = isolateRows(rows, rows.length, value, true);
  assert.deepEqual(names(low.rows), ['g', 'a', 'e', 'b', 'd', 'c', 'f']);
  assert.deepEqual(low.rows.map((r) => low.places.get(r)), [1, 2, 3, 4, 4, null, null]);

  // (the list itself untouched)
  assert.deepEqual(names(rows), before);

  // Lower is better: a negative stat, or any rank (#1 the best)
  assert.equal(lowerIsBetter({ negative: true, format: 'int' }), true);
  assert.equal(lowerIsBetter({ format: 'rank' }), true);
  assert.equal(lowerIsBetter({ format: 'dec1' }), false);
  assert.equal(lowerIsBetter({ format: 'grade' }), false);
});

test('isolateRows: the UR rows stay below the ranked ones, sorted among themselves, with no place', async () => {
  const { isolateRows } = await loadEngine('nfl', { entry });
  const ranked = [row('a', 1), row('b', 3), row('c', 2)];
  const ur = [row('u1', 99), row('u2', null), row('u3', 50)];
  const asked = [];
  const out = isolateRows([...ranked, ...ur], ranked.length, (r, isUr) => (asked.push([r.name, isUr]), r.v), false);
  assert.deepEqual(names(out.rows), ['b', 'c', 'a', 'u1', 'u3', 'u2']);
  assert.deepEqual([...out.places.keys()].map((r) => r.name).sort(), ['a', 'b', 'c']);
  // (each read by its own reader: a UR row's values aren't placed against the list)
  assert.deepEqual(asked.filter(([, isUr]) => isUr).map(([n]) => n).sort(), ['u1', 'u2', 'u3']);
  // (nobody ranked shown: the UR rows alone, sorted)
  assert.deepEqual(names(isolateRows(ur, 0, (r) => r.v, true).rows), ['u3', 'u1', 'u2']);
});

test('isolateRows after Teams Included: one team\'s rows sorted, places among them, its UR rows below', async () => {
  const { isolateRows, teamRows } = await loadEngine('nfl', { entry });
  const ranked = [row('a', 5, 'BUF'), row('b', 9, 'MIA'), row('c', 7, 'BUF'), row('d', 8, 'NYJ'), row('e', 6, 'BUF')];
  const ur = [row('u1', 100, 'MIA'), row('u2', 1, 'BUF'), row('u3', 3, 'BUF')];
  const shown = teamRows(ranked, ur, 'BUF');
  const out = isolateRows(shown.rows, shown.ranked, (r) => r.v, false);
  assert.deepEqual(names(out.rows), ['c', 'e', 'a', 'u3', 'u2']);
  assert.deepEqual(out.rows.slice(0, shown.ranked).map((r) => out.places.get(r)), [1, 2, 3]);
  // (each keeps its league rank, the ranking's, for the tile's hover)
  assert.deepEqual(out.rows.slice(0, shown.ranked).map((r) => shown.leagueIndex.get(r) + 1), [3, 5, 1]);
});

// A tab's default list as the grid ranks it, and its reader
function grid(engine, position, combineStats = false) {
  const { TabRanker, StatReader, SKILL_STATS, SKILL_UNITS, skillGroups, presetWeights, emptyIn, CURRENT_SEASON, DEFAULT_SETTINGS } = engine;
  const settings = { ...DEFAULT_SETTINGS, combineStats };
  const table = { position, stats: SKILL_STATS[position], groups: skillGroups(position), hidden: {}, weights: presetWeights(position, 'default') };
  const positions = {
    settings,
    statHiddenState: {},
    skillHiddenGroups: () => ({}),
    getWeights: (p) => presetWeights(p, 'default'),
    isStatHidden: () => false,
    orderedGroups: (p, groups) => groups,
    orderedStats: (p, group) => group.stats,
  };
  const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => table, () => {});
  const listed = ranker.listed(SKILL_UNITS, CURRENT_SEASON, position);
  // (the table's reader: its list the ranked rows, as the grid's playerList)
  const source = { position, settings, rows: SKILL_UNITS, list: listed, tableSeason: true, season: CURRENT_SEASON, empty: (key) => emptyIn(SKILL_UNITS[position] ?? [], key), weights: ranker.mixWeights(position) };
  const reader = new StatReader(source);
  source.list = ranker.ranked(reader, listed, position, SKILL_UNITS);
  return { ranker, reader, list: source.list };
}

// (MMA: its first tab with a list)
for (const [sport, position, combine] of [['nfl', 'QB', false], ['nfl', 'RB', true], ['nfl', 'DEF', false], ['nba', 'PG', false], ['nhl', 'C', false], ['mlb', 'SP', false], ['mma', null, false]]) {
  test(`${sport} ${position ?? 'first tab'}${combine ? ' (Combine)' : ''}: every column shown sorts as its values say`, async () => {
    const engine = await loadEngine(sport, { entry });
    const { isolateRows, lowerIsBetter, SKILL_STATS, SKILL_UNITS } = engine;
    const tab = position ?? Object.keys(SKILL_STATS).find((p) => SKILL_UNITS[p]?.length > 5);
    const { ranker, reader, list } = grid(engine, tab, combine);
    assert.ok(list.length > 5, 'a list to check');
    const order = names(list);
    const stats = ranker.shownGroups(reader, tab).groups.flatMap((g) => g.stats);
    assert.ok(stats.length > 3, 'columns to check');
    let sorted = 0;
    for (const stat of stats) {
      if (!reader.hasValues(stat)) continue;
      const lower = lowerIsBetter(stat);
      const value = (r) => reader.value(r, stat);
      const out = isolateRows(list, list.length, value, lower);
      assert.equal(out.rows.length, list.length);
      const values = out.rows.map(value).map((v) => (Number.isFinite(v) ? v : null));
      const firstNone = values.indexOf(null);
      const known = firstNone < 0 ? values : values.slice(0, firstNone);
      assert.ok(firstNone < 0 || values.slice(firstNone).every((v) => v === null), `${stat.key}: no value last`);
      for (let i = 1; i < known.length; i++) {
        assert.ok(lower ? known[i - 1] <= known[i] : known[i - 1] >= known[i], `${sport} ${tab} ${stat.key}: ${known[i - 1]} then ${known[i]}`);
        // (ties: in the ranking's order, sharing a place)
        if (known[i - 1] === known[i]) {
          assert.ok(list.indexOf(out.rows[i - 1]) < list.indexOf(out.rows[i]), `${stat.key}: a tie out of the ranking's order`);
          assert.equal(out.places.get(out.rows[i]), out.places.get(out.rows[i - 1]));
        } else assert.equal(out.places.get(out.rows[i]), i + 1);
      }
      if (stat.format === 'rank') assert.ok(lower, `${stat.key}: a rank sorts #1 first`);
      sorted++;
    }
    assert.ok(sorted > 3);
    // (the ranking as it was)
    assert.deepEqual(names(list), order);
  });
}
