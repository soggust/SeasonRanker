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
function grid(engine, position, combineStats = false, more = {}) {
  const { TabRanker, StatReader, SKILL_STATS, SKILL_UNITS, skillGroups, presetWeights, emptyIn, CURRENT_SEASON, DEFAULT_SETTINGS } = engine;
  const settings = { ...DEFAULT_SETTINGS, combineStats, ...more };
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

// Show Ranks: a column reads as places ("#3"), which go by the per-game rate, so the sort goes by it too (a
// season total, Stat Base = Season, put a player with fewer games out of place: #1, #4, #2...)
test('shownValue: the rate under Show Ranks, the shown value otherwise', async () => {
  const { isolateRows, shownValue } = await loadEngine('nfl', { entry });
  const stat = { key: 'yds' };
  const a = { name: 'a', total: 1000, games: 10 };
  const b = { name: 'b', total: 800, games: 4 };
  const reader = (ranks) => ({ showsRank: () => ranks, value: (r) => r.total, rate: (r) => r.total / r.games });
  assert.deepEqual(names(isolateRows([a, b], 2, (r) => shownValue(reader(false), r, stat), false).rows), ['a', 'b']);
  assert.deepEqual(names(isolateRows([a, b], 2, (r) => shownValue(reader(true), r, stat), false).rows), ['b', 'a']);
});

test('nfl QB, Show Ranks on a season basis: every column sorted reads #1, #2, #3... down', async () => {
  const engine = await loadEngine('nfl', { entry });
  const { isolateRows, lowerIsBetter, shownValue } = engine;
  const { ranker, reader, list } = grid(engine, 'QB', false, { showRanks: true, statBasis: 'season' });
  const stats = ranker.shownGroups(reader, 'QB').groups.flatMap((g) => g.stats);
  let ranked = 0;
  let wouldMiss = 0;
  for (const stat of stats) {
    if (!reader.hasValues(stat) || !reader.showsRank(stat)) continue;
    const place = (r) => reader.listRank(r, stat)?.rank ?? Infinity;
    const inOrder = (rows) => rows.every((r, i) => !i || place(rows[i - 1]) <= place(r));
    const out = isolateRows(list, list.length, (r) => shownValue(reader, r, stat), lowerIsBetter(stat));
    assert.ok(inOrder(out.rows), `${stat.key}: ranks out of order`);
    // (by the season total instead: what went wrong before)
    if (!inOrder(isolateRows(list, list.length, (r) => reader.value(r, stat), lowerIsBetter(stat)).rows)) wouldMiss++;
    ranked++;
  }
  assert.ok(ranked > 3, 'columns shown as ranks');
  assert.ok(wouldMiss > 0, 'a volume column whose total and per-game orders differ');
});

// Share's Copy Isolated: in the menu only while a column is isolated; the ranked rows shown, in the isolated
// order, each its place by the stat ("-": none), name, team (when there is one) and the value as shown,
// under a line naming the stat; no UR rows (as the other copy)
test('Copy Isolated: shown only while isolated', async () => {
  const { copyIsolatedShown } = await loadEngine('nfl', { entry });
  assert.equal(copyIsolatedShown(null), false);
  assert.equal(copyIsolatedShown(undefined), false);
  assert.equal(copyIsolatedShown({ key: 'yds' }), true);
});

test('Copy Isolated: the isolated order, place, name, team and value, after Teams Included, no UR rows', async () => {
  const { isolateRows, isolatedCopyText, recentText, teamRows, teamKey } = await loadEngine('nfl', { entry });
  const ranked = [row('a', 5, 'BUF'), row('b', 9, 'MIA'), row('c', 7, 'BUF'), row('d', null, 'BUF'), row('e', 7, 'BUF')];
  const ur = [row('u1', 100, 'BUF')];
  const shown = teamRows(ranked, ur, 'BUF');
  const out = isolateRows(shown.rows, shown.ranked, (r) => r.v, false);
  const line = (r) => ({ place: out.places.get(r) ?? null, name: r.name, team: teamKey(r.teamLogo), value: r.v === null ? '-' : `${r.v}.0` });
  assert.equal(
    isolatedCopyText('Passing Yards', out.rows, shown.ranked, line),
    ['Passing Yards (sorted by it alone)', '1\tc\tBUF\t7.0', '1\te\tBUF\t7.0', '3\ta\tBUF\t5.0', '-\td\tBUF\t-'].join('\n'),
  );
  // (worst first, said so; no team: no team column)
  const worst = isolateRows(shown.rows, shown.ranked, (r) => r.v, true);
  assert.equal(
    isolatedCopyText('Passing Yards', worst.rows, shown.ranked, (r) => ({ place: worst.places.get(r) ?? null, name: r.name, team: null, value: String(r.v ?? '-') }), true),
    ['Passing Yards (sorted by it alone, worst first)', '1\ta\t5', '2\tc\t7', '2\te\t7', '-\td\t-'].join('\n'),
  );
  // (Recent: its results as letters, newest first)
  assert.equal(recentText([1, 0, 0.5, 1]), 'WLTW');
  assert.equal(recentText([]), '-');
});

// (the team by name where the grid has one: a logo's file is an MLB id or an NFL nickname)
test('Copy Isolated: the team by name, the logo only without one', async () => {
  const { isolatedTeam } = await loadEngine('nfl', { entry });
  assert.equal(isolatedTeam('Boston Red Sox', 'assets/MLB_Icons/111.svg'), 'Boston Red Sox');
  assert.equal(isolatedTeam(null, 'assets/MLB_Icons/111.svg'), '111');
  assert.equal(isolatedTeam(null, 'assets/NHL_Icons/BOS_secondary.svg'), 'BOS');
  assert.equal(isolatedTeam(null, undefined), null);
});
