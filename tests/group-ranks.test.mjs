// A collapsed group's places (group-ranks.ts, TabRanker.groupPlaces): each row's rank within the group, by
// what the group's stats added to its score (the list's own scoring: the same sliders and normalization),
// tied scores sharing a place and the next score the next place (dense: 1, 1, 2), a group with nothing
// counted having none; only a look, the list's order
// untouched. Then on real data (the NFL's QBs): the places follow the group's share of each score, move
// with the sliders, and a group whose sliders are all at 0 has no places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/group-ranks-entry.ts');
// (a score as the grid shows it: rank-why.ts scoreText, two places)
const round2 = (v) => Number(v.toFixed(2)) + 0;

test('groupRanks: best share first, ties sharing a place and the next the next (1, 1, 2), a group with no counted stat has none', async () => {
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
  assert.deepEqual(rows.map((r) => places.get('g1').get(r)), [1, 1, 2, 4, 3]);
  // g2: d 9, a 5, c 0, e 0 (tied), b -1
  assert.deepEqual(rows.map((r) => places.get('g2').get(r)), [2, 4, 3, 1, 3]);
  // (a float tie: 0.1 + 0.2 against 0.3 is one place)
  const float = groupRanks(['p', 'q'], new Map([['p', new Map([['x', 0.1 + 0.2]])], ['q', new Map([['x', 0.3]])]]), new Map([['x', 'g']]));
  assert.deepEqual([float.get('g').get('p'), float.get('g').get('q')], [1, 1]);
  // Ties as the grid shows a score, to two places: 2.3081 and 2.3126 both read 2.31 and share #1; a run of
  // three tied, then the next at #2 (dense ranking); 2.304 reads 2.30, its own place; −0.001 and 0 tie
  const near = new Map([['p', 2.3081], ['q', 2.3126], ['r', 2.31], ['s', 2.304], ['t', -0.001], ['u', 0]].map(([k, v]) => [k, new Map([['x', v]])]));
  const nearPlaces = groupRanks(['p', 'q', 'r', 's', 't', 'u'], near, new Map([['x', 'g']])).get('g');
  assert.deepEqual(['p', 'q', 'r', 's', 't', 'u'].map((k) => nearPlaces.get(k)), [1, 1, 1, 2, 3, 3]);
  // A shared grade (the Support strip: every player of a team the same): 400 rows on 30 teams rank 1 to 30,
  // never to the size of the list
  const teams = Array.from({ length: 400 }, (_, i) => [`p${i}`, new Map([['x', (i % 30) / 10]])]);
  const teamPlaces = [...groupRanks(teams.map(([k]) => k), new Map(teams), new Map([['x', 'g']])).get('g').values()];
  assert.equal(Math.max(...teamPlaces), 30);
  assert.equal(teamPlaces.filter((p) => p === 1).length, 13);
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
  const groups = new Set(counted.filter((s) => strengths.get(s.key) > 0).map((s) => statGroup(s, 'QB')));
  assert.ok(groups.size >= 2, 'more than one group counted');
  assert.deepEqual(new Set(places.keys()), groups);
  for (const group of groups) {
    const keys = counted.filter((s) => statGroup(s, 'QB') === group).map((s) => s.key);
    const share = (row) => keys.reduce((sum, key) => sum + (parts.get(row)?.get(key) ?? 0), 0);
    const own = places.get(group);
    assert.equal(own.size, ranked.length);
    for (const row of ranked) {
      // (dense ranking on the score as the grid shows one, to two places: one more than the distinct
      // better scores)
      const better = new Set(ranked.map((other) => round2(share(other))).filter((v) => v > round2(share(row)))).size;
      assert.equal(own.get(row), better + 1, `${group} ${row.name}`);
    }
  }
  // Results on the QBs: the records that tie (the undefeated starters) all read 1, the next score after them 2
  const results = places.get('results');
  const ones = ranked.filter((row) => results.get(row) === 1);
  assert.ok(ones.length >= 2, 'tied rows at #1 in Results');
  assert.ok(ranked.some((row) => results.get(row) === 2), 'the next score after the tie at #2');
  // (no place past the count of distinct places: dense)
  for (const own of places.values()) assert.equal(Math.max(...own.values()), new Set(own.values()).size);
  // Only a look: the list's order is the same, places or not
  assert.deepEqual(ranker.ranked(reader, listed, 'QB', SKILL_UNITS), ranked);

  // A group's sliders all at 0: no places (the dash); the other groups' places unchanged
  const [off, ...rest] = [...groups];
  const offKeys = SKILL_STATS.QB.filter((s) => statGroup(s, 'QB') === off).map((s) => s.key);
  const zeroed = harness(engine, { ...base, ...Object.fromEntries(offKeys.map((k) => [k, 0])) });
  assert.equal(zeroed.places.get(off), undefined);
  for (const group of rest) {
    for (const row of zeroed.ranked) {
      const same = ranked.find((r) => r.gsisId === row.gsisId);
      if (same) assert.equal(zeroed.places.get(group).get(row), places.get(group).get(same), `${group} ${row.name} moved with another group's sliders`);
    }
  }

  // The sliders within a group move its places: one stat at 100 and the rest at 0 ranks by that stat alone
  const group = [...groups].find((g) => counted.filter((s) => statGroup(s, 'QB') === g && strengths.get(s.key) > 0).length >= 2);
  assert.ok(group, 'a group with two stats counted');
  const inGroup = counted.filter((s) => statGroup(s, 'QB') === group && strengths.get(s.key) > 0).map((s) => s.key);
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

// A group is never sorted by (the owner, 2026-10-19: the category sort went): only a stat's header sorts. The
// collapsed header opens the group wherever it's clicked (chevron, icon or name), nothing in the grid's header
// isolates a group, the grid's isolation has no group column, and a saved list keeps only stat columns; a share
// link carries nothing of a sort.
test('a group never sorts: its header only opens and closes it, a saved list and a link carry stat columns only', async () => {
  const fs = await import('node:fs');
  const dir = path.join(import.meta.dirname, '../libs/ranker/src/engine/skill-rankings');
  assert.equal(fs.existsSync(path.join(dir, 'group-sort.ts')), false, 'group-sort.ts is gone');
  const html = fs.readFileSync(path.join(dir, 'skill-rankings.component.html'), 'utf8');
  const ts = fs.readFileSync(path.join(dir, 'skill-rankings.component.ts'), 'utf8');
  assert.doesNotMatch(html + ts, /groupStat|groupSortValue|groupOfKey|group-sort/);
  // (the collapsed header: one click target, the toggle)
  const head = html.split(/\r?\n/).find((l) => l.includes('class="group-rank-col"') && l.includes('data-col'));
  assert.match(head, /\(click\)="headToggle\(group\.id, \$event\)"/);
  assert.doesNotMatch(head, /isolate\(/);
  // (every isolate( in the template is a stat's)
  for (const m of html.matchAll(/isolate\((\w+), \$event\)/g)) assert.equal(m[1], 'stat');

  // A saved list keeps the grid's own order and its open groups' stat columns only
  const { gridColumns } = await loadEngine('nfl', { entry });
  const statOf = (key) => ({ key, label: key, format: 'int' });
  const grid = {
    visibleGroups: [{ id: 'box', title: 'Basic', stats: [statOf('yds')] }, { id: 'advanced', title: 'Advanced Stats', stats: [statOf('epa')] }],
    isCollapsed: (id) => id === 'box',
    reader: { label: (s) => s.label },
  };
  assert.deepEqual(gridColumns(grid).map((c) => c.stat.key), ['epa']);
  assert.ok(gridColumns({ ...grid, isCollapsed: () => true }).every((c) => ['yds', 'epa'].includes(c.stat.key)), 'stat columns only');
});

test('a share link carries no sort', async () => {
  globalThis.location = new URL('https://ranker.test/nfl/?pos=QB');
  globalThis.history = { replaceState: (_s, _t, url) => (globalThis.location = new URL(String(url))) };
  const { PositionService } = await loadEngine('nfl', { entry });
  const service = new PositionService();
  assert.equal(new URL(service.shareLink()).searchParams.has('list'), false);
  assert.ok(!JSON.stringify(service.layout).includes('group:'));
});

test("a group's ranks take the grid's value tint: #1 green, the last red, the middle plain, none uncolored", async () => {
  const { groupRankTint } = await loadEngine('nfl', { entry });
  const places = new Map(Array.from({ length: 41 }, (_, i) => [`r${i}`, i + 1]));
  // (the tint's strength, color-mix(in srgb, var(--tint-good, ...) 85%, ...), when it's that hue)
  const share = (tint, hue) => (new RegExp(hue).test(tint) ? Number(tint.match(/\) (\d+)%/)?.[1] ?? 0) : 0);
  const best = groupRankTint(places, 1);
  const worst = groupRankTint(places, 41);
  assert.match(best, /tint-good/);
  assert.match(worst, /tint-bad/);
  assert.ok(share(best, 'tint-good') > 50 && share(worst, 'tint-bad') > 50, `${best} / ${worst}`);
  // (the middle: barely tinted; a better rank greener than a worse one)
  assert.ok(share(groupRankTint(places, 21), 'tint-(good|bad)') <= 5);
  assert.ok(share(groupRankTint(places, 3), 'tint-good') > share(groupRankTint(places, 9), 'tint-good'));
  assert.equal(groupRankTint(places, null), null);
  assert.equal(groupRankTint(undefined, 1), null);
  // (one row: nothing to compare)
  assert.equal(groupRankTint(new Map([['a', 1]]), 1), null);
});

// Ties in every state: the places come from the scoring alone (the same whether the group shows open or
// collapsed: nothing in them reads the collapse), with Combine on or off: the tied rows share one place, the
// next score the next place (dense)
test('nfl QB: tied Results share a place open, collapsed and combined, the next score at #2', async () => {
  const engine = await loadEngine('nfl', { entry });
  const { presetWeights, DEFAULT_SETTINGS } = engine;
  for (const combineStats of [false, true]) {
    const saved = DEFAULT_SETTINGS.combineStats;
    DEFAULT_SETTINGS.combineStats = combineStats;
    try {
      const { ranked, places } = harness(engine, presetWeights('QB', 'default'));
      const results = places.get('results');
      const ones = ranked.filter((row) => results.get(row) === 1);
      assert.ok(ones.length >= 2, `combine ${combineStats}: tied rows at #1`);
      assert.ok(ranked.some((row) => results.get(row) === 2), `combine ${combineStats}: the next score at #2`);
    } finally {
      DEFAULT_SETTINGS.combineStats = saved;
    }
  }
});

// The chevron turns a half turn as its group opens sideways (right folded, left open), eased, still under
// reduced motion; the columns slide and fade in and out on transform and opacity only, none under reduced motion
test('the group motion: a half-turn chevron and a transform/opacity slide, none under reduced motion', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/src/engine/skill-rankings/skill-rankings.component.html'), 'utf8');
  for (const l of html.split(/\r?\n/).filter((x) => x.includes('class="group-chevron"'))) {
    assert.match(l, /\[class\.open\]="!isCollapsed\(group\.id\)" aria-hidden="true" fontIcon="chevron_right"/);
  }
  const scss = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/src/styles/components/rankings.component.scss'), 'utf8');
  assert.match(scss, /&\.open \{\s*transform: rotate\(180deg\);/);
  for (const name of ['group-cols-in', 'group-cols-out']) {
    const body = scss.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))[1];
    assert.doesNotMatch(body, /width|left|margin/, `${name}: transform and opacity only`);
  }
  assert.match(scss, /@media \(prefers-reduced-motion: reduce\) \{\s*section ul li\.player > \.col-group\.group-opening > div,\s*section ul li\.player > \.col-group\.group-closing > div \{\s*animation: none;/);
});


// An open group renders no rank cells: the grid's template draws a group's own column (header and rows) only
// inside the collapsed branch, and nothing in the open branches reads a group's rank
test('the grid template: a group\'s rank column only while it is collapsed, none in an open group', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/src/engine/skill-rankings/skill-rankings.component.html'), 'utf8');
  const lines = html.split(/\r?\n/);
  const cols = lines.map((l, i) => [l, i]).filter(([l]) => l.includes('class="group-rank-col"'));
  assert.equal(cols.length, 2, 'the header\'s and each row\'s');
  for (const [, i] of cols) {
    // (the nearest branch above it: the collapsed one, with no else between)
    const above = lines.slice(0, i).reverse().find((l) => /^\s*(@if|\} @else)/.test(l));
    assert.equal(above.trim(), '@if (isCollapsed(group.id)) {', `line ${i + 1} under "${above.trim()}"`);
  }
  // (and nothing that reads a group's rank or its column outside that branch: an open group draws none)
  lines.forEach((l, i) => {
    if (!/groupPlace|groupStat\(|group-rank-col/.test(l)) return;
    const above = lines.slice(0, i).reverse().find((x) => /^\s*(@if|\} @else)/.test(x));
    assert.equal(above.trim(), '@if (isCollapsed(group.id)) {', `line ${i + 1} reads a rank under "${above.trim()}"`);
  });
});

// A group of one stat (MLB's Teams tab Fielding: Fielding Runs alone) never collapses (the owner, 2026-10-19):
// it starts open, a toggle, a link's or a saved list's state for it changes nothing and isn't written, while the
// tab's other groups collapse as ever; in every sport and tab, each one-stat group is open from the start. The
// template draws a chevron button only for a collapsible group (a one-stat group keeps its icon alone).
test('a one-stat group is never collapsed: no chevron, its saved state ignored', async () => {
  globalThis.location ??= new URL('https://ranker.test/mlb/');
  globalThis.history ??= { replaceState: () => {} };
  const { PositionService, skillGroups } = await loadEngine('mlb', { entry });
  const service = new PositionService();
  const fielding = skillGroups('TM').find((g) => g.id === 'fielding');
  assert.equal(fielding?.stats.length, 1, "MLB TM's Fielding is one stat");
  assert.equal(service.isGroupCollapsible('TM', 'fielding'), false);
  assert.equal(service.isGroupCollapsed('TM', 'fielding'), false, 'open from the start');
  service.toggleGroupCollapsed('TM', 'fielding');
  assert.equal(service.isGroupCollapsed('TM', 'fielding'), false, 'a toggle changes nothing');
  service.applyLayout({ collapsed: { TM: ['fielding'] }, expanded: { TM: ['fielding'] } });
  assert.equal(service.isGroupCollapsed('TM', 'fielding'), false, "a link's state is ignored");
  assert.ok(!(service.layout.expanded.TM ?? []).includes('fielding'), 'nothing written for it');
  // (the tab's other groups: collapsed until opened, as ever)
  const multi = skillGroups('TM').find((g) => g.stats.length > 1);
  assert.equal(service.isGroupCollapsed('TM', multi.id), true);
  service.toggleGroupCollapsed('TM', multi.id);
  assert.equal(service.isGroupCollapsed('TM', multi.id), false);

  // Every sport: each tab's one-stat groups open from the start, the rest collapsed
  for (const sport of ['nfl', 'mlb', 'nba', 'nhl', 'mma']) {
    const engine = await loadEngine(sport, { entry });
    const fresh = new engine.PositionService();
    for (const position of engine.POSITIONS) {
      for (const group of engine.skillGroups(position)) {
        assert.equal(fresh.isGroupCollapsed(position, group.id), group.stats.length > 1, `${sport} ${position} ${group.id}`);
      }
    }
  }

  // The template: every chevron button sits under a collapsible group's branch
  const fs = await import('node:fs');
  const html = fs.readFileSync(path.join(import.meta.dirname, '../libs/ranker/src/engine/skill-rankings/skill-rankings.component.html'), 'utf8');
  const buttons = html.split(/\r?\n/).filter((l) => l.includes('class="group-chevron"'));
  assert.ok(buttons.length >= 4);
  for (const l of buttons) assert.match(l, /@if \(isCollapsible\(group\.id\)\) \{<button type="button" class="group-toggle"/);
});
