// A collapsed group's places (group-ranks.ts, TabRanker.groupPlaces): each row's rank within the group, by
// what the group's stats added to its score (the list's own scoring: the same sliders and normalization),
// tied scores sharing a place, a group with nothing counted having none; only a look, the list's order
// untouched. Then on real data (the NFL's QBs): the places follow the group's share of each score, move
// with the sliders, and a group whose sliders are all at 0 has no places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/group-ranks-entry.ts');

test('groupRanks: best share first, ties sharing a place (1, 1, 3), a group with no counted stat has none', async () => {
  const { groupRanks } = await loadEngine('nfl', { entry });
  const rows = ['a', 'b', 'c', 'd', 'e'];
  const parts = new Map([
    ['a', new Map([['x', 1], ['y', 2], ['z', 5]])],
    ['b', new Map([['x', 2], ['y', 1], ['z', -1]])],
    ['c', new Map([['x', 0.1 + 0.2], ['y', 0], ['z', 0]])],
    ['d', new Map([['x', -1], ['y', -1], ['z', 9]])],
    // (e: no shares at all, 0 in every group)
  ]);
  const groupOf = new Map([['x', 'g1'], ['y', 'g1'], ['z', 'g2']]);
  const before = [...rows];
  const places = groupRanks(rows, parts, groupOf);
  // g1: a 3, b 3 (tied), c 0.3, e 0, d -2
  assert.deepEqual(rows.map((r) => places.get('g1').get(r)), [1, 1, 3, 5, 4]);
  // g2: d 9, a 5, c 0, e 0 (tied), b -1
  assert.deepEqual(rows.map((r) => places.get('g2').get(r)), [2, 5, 3, 1, 3]);
  // (a float tie: 0.1 + 0.2 against 0.3 is one place)
  const float = groupRanks(['p', 'q'], new Map([['p', new Map([['x', 0.1 + 0.2]])], ['q', new Map([['x', 0.3]])]]), new Map([['x', 'g']]));
  assert.deepEqual([float.get('g').get('p'), float.get('g').get('q')], [1, 1]);
  // A group with no counted stat: no places (the strip's dash)
  assert.equal(places.get('g3'), undefined);
  // Only a look: the rows as they were
  assert.deepEqual(rows, before);
});

// The NFL's QBs as the grid ranks them, with the sliders given
function harness(engine, weights) {
  const { TabRanker, StatReader, SKILL_STATS, SKILL_UNITS, skillGroups, emptyIn, CURRENT_SEASON, DEFAULT_SETTINGS } = engine;
  const position = 'QB';
  const settings = { ...DEFAULT_SETTINGS };
  const table = { position, stats: SKILL_STATS[position], groups: skillGroups(position), hidden: {}, weights };
  const positions = { settings, statHiddenState: {}, skillHiddenGroups: () => ({}), getWeights: () => weights, isStatHidden: () => false };
  const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => table, () => {});
  const listed = ranker.listed(SKILL_UNITS, CURRENT_SEASON, position);
  const reader = new StatReader({ position, settings, rows: SKILL_UNITS, list: listed, tableSeason: true, season: CURRENT_SEASON, empty: (key) => emptyIn(SKILL_UNITS[position] ?? [], key), weights: ranker.mixWeights(position) });
  const ranked = ranker.ranked(reader, listed, position, SKILL_UNITS);
  return { ranker, reader, listed, ranked, places: ranker.groupPlaces(reader, listed, position, SKILL_UNITS, ranked) };
}

test("nfl QB: each group's places follow its share of the score, move with the sliders, and none at 0", async () => {
  const engine = await loadEngine('nfl', { entry });
  const { presetWeights, SKILL_STATS, SKILL_UNITS, statGroup } = engine;
  const base = presetWeights('QB', 'default');
  const { ranker, reader, listed, ranked, places } = harness(engine, base);
  assert.ok(ranked.length > 10, 'a list to check');

  // The places are the group's shares of the scores, ranked (from the list's own scoring)
  const parts = new Map();
  const strengths = new Map();
  const { counted } = ranker.scores(reader, listed, 'QB', SKILL_UNITS, parts, strengths);
  const groups = new Set(counted.filter((s) => strengths.get(s.key) > 0).map((s) => statGroup(s)));
  assert.ok(groups.size >= 2, 'more than one group counted');
  assert.deepEqual(new Set(places.keys()), groups);
  for (const group of groups) {
    const keys = counted.filter((s) => statGroup(s) === group).map((s) => s.key);
    const share = (row) => keys.reduce((sum, key) => sum + (parts.get(row)?.get(key) ?? 0), 0);
    const own = places.get(group);
    assert.equal(own.size, ranked.length);
    for (const row of ranked) {
      const better = ranked.filter((other) => share(other) > share(row) + 1e-9 * Math.max(1, Math.abs(share(row)))).length;
      assert.equal(own.get(row), better + 1, `${group} ${row.name}`);
    }
  }
  // Only a look: the list's order is the same, places or not
  assert.deepEqual(ranker.ranked(reader, listed, 'QB', SKILL_UNITS), ranked);

  // A group's sliders all at 0: no places (the dash); the other groups' places unchanged
  const [off, ...rest] = [...groups];
  const offKeys = SKILL_STATS.QB.filter((s) => statGroup(s) === off).map((s) => s.key);
  const zeroed = harness(engine, { ...base, ...Object.fromEntries(offKeys.map((k) => [k, 0])) });
  assert.equal(zeroed.places.get(off), undefined);
  for (const group of rest) {
    for (const row of zeroed.ranked) {
      const same = ranked.find((r) => r.gsisId === row.gsisId);
      if (same) assert.equal(zeroed.places.get(group).get(row), places.get(group).get(same), `${group} ${row.name} moved with another group's sliders`);
    }
  }

  // The sliders within a group move its places: one stat at 100 and the rest at 0 ranks by that stat alone
  const group = [...groups].find((g) => counted.filter((s) => statGroup(s) === g && strengths.get(s.key) > 0).length >= 2);
  assert.ok(group, 'a group with two stats counted');
  const inGroup = counted.filter((s) => statGroup(s) === group && strengths.get(s.key) > 0).map((s) => s.key);
  const solo = inGroup[0];
  const only = harness(engine, { ...base, ...Object.fromEntries(inGroup.map((k) => [k, k === solo ? 100 : 0])) });
  const soloParts = new Map();
  only.ranker.scores(only.reader, only.listed, 'QB', SKILL_UNITS, soloParts);
  const soloShare = (row) => soloParts.get(row)?.get(solo) ?? 0;
  const best = [...only.ranked].sort((a, b) => soloShare(b) - soloShare(a))[0];
  assert.equal(only.places.get(group).get(best), 1);
  const moved = only.ranked.some((row) => {
    const same = ranked.find((r) => r.gsisId === row.gsisId);
    return same && only.places.get(group).get(row) !== places.get(group).get(same);
  });
  assert.ok(moved, `${group}: the places didn't move with its sliders`);
});

test('every group starts collapsed; a group opened stays open, and closes again', async () => {
  globalThis.location ??= new URL('https://ranker.test/nfl/');
  globalThis.history ??= { replaceState: () => {} };
  const { PositionService, skillGroups } = await loadEngine('nfl', { entry });
  const service = new PositionService();
  const ids = skillGroups('QB').map((g) => g.id);
  assert.ok(ids.every((id) => service.isGroupCollapsed('QB', id)), 'a group started open');
  service.toggleGroupCollapsed('QB', ids[0]);
  assert.equal(service.isGroupCollapsed('QB', ids[0]), false);
  assert.ok(ids.slice(1).every((id) => service.isGroupCollapsed('QB', id)));
  assert.deepEqual(service.layout.expanded, { QB: [ids[0]] });
  service.toggleGroupCollapsed('QB', ids[0]);
  assert.equal(service.isGroupCollapsed('QB', ids[0]), true);
  assert.deepEqual(service.layout.expanded, { QB: [] });
  // (an older link's collapsed list: collapsed, the rest as they are)
  service.toggleGroupCollapsed('QB', ids[1]);
  service.applyLayout({ collapsed: { QB: [ids[1]] }, expanded: { QB: [ids[2]] } });
  assert.equal(service.isGroupCollapsed('QB', ids[1]), true);
  assert.equal(service.isGroupCollapsed('QB', ids[2]), false);
});
