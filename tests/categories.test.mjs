// The stat categories (each sport's GROUPS in positions.ts) are only a look: moving a stat between groups,
// renaming or re-cutting them can't move a ranking. tests/support/snapshots/rankings-<sport>.json holds every
// tab's rankings from before the categories were re-cut (snapshot-rankings.mjs): the grid as it first shows
// a season, the table's own ranking with each row's score, with Combined off, and with each group of that day
// hidden by its id. Here they're worked out again and must match to the digit; a group of that day the tab
// no longer has is hidden through legacy-groups.ts (its stats one by one), the way a share link, preset or
// pin that named it is read. Then the categories themselves: every stat of a tab in exactly one group, ids
// and tones unique, a combined pair's parts together, statGroup agreeing with skillGroups, the headline stats
// pinned, and the share link carrying new and retired ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPORTS, loadEngine } from './support/engine.mjs';
import { fixtureSeasons, ids, rankTab, scored, seasonRows } from './support/rank-snapshot.mjs';

const fixtureOf = (sport) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'support/snapshots', `rankings-${sport}.json`), 'utf8'));
const entry = path.join(import.meta.dirname, 'support/group-ranks-entry.ts');

globalThis.location ??= new URL('https://ranker.test/x/');
globalThis.history ??= { replaceState: () => {} };

const sameSet = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());

for (const sport of SPORTS) {
  test(`${sport}: the rankings are the fixture's, tab by tab, group hidden by group`, async () => {
    const engine = await loadEngine(sport, { entry });
    const { POSITIONS, gridRankings, withSeason, skillGroups, applyHiddenGroup, legacyGroupKeys, DEFAULT_SETTINGS } = engine;
    const fixture = fixtureOf(sport);
    const seasons = fixtureSeasons(engine, sport);
    assert.deepEqual(seasons.map(String).sort(), Object.keys(fixture.seasons).sort(), 'the fixture covers other seasons: rerun snapshot-rankings.mjs on purpose');
    // Each group of the fixture's day hidden the way a link, preset or pin hides it (legacy-groups.ts on the
    // position service's two setters): the group itself while the tab has it, else its stats of that day one
    // by one. (A stand-in for the service: its constructor connects the grades, which would move the rows.)
    const hides = new Map();
    const stand = () => {
      const hidden = {};
      const hiddenStats = new Set();
      return { hidden, hiddenStats, setSkillGroupHidden: (_p, id, off) => (hidden[id] = off), setStatHidden: (_p, key, off) => (off ? hiddenStats.add(key) : hiddenStats.delete(key)) };
    };
    for (const position of POSITIONS) {
      const now = skillGroups(position);
      for (const [id, keys] of Object.entries(fixture.groups[position])) {
        const own = now.find((group) => group.id === id);
        // (a group the tab still has whose stats changed: the eye hides the new set, by design)
        if (own && JSON.stringify(own.stats.map((s) => s.key).sort()) !== JSON.stringify([...keys].sort())) continue;
        if (!own) sameSet(legacyGroupKeys(position, id) ?? [], keys, `${position}: LEGACY_GROUPS.${id} isn't the group of the day`);
        const service = stand();
        assert.ok(applyHiddenGroup(service, position, id), `${position}: "${id}" hid nothing`);
        hides.set(`${position}.${id}`, { hidden: service.hidden, hiddenStats: service.hiddenStats });
      }
    }
    for (const season of seasons) {
      const tabs = fixture.seasons[season];
      const { rows, data } = seasonRows(engine, sport, season);
      const grid = gridRankings(season, rows, data);
      withSeason(season, { ...data }, () => {
        for (const position of POSITIONS) {
          const want = tabs[position];
          assert.ok(want, `${position} ${season}: not in the fixture`);
          assert.deepEqual(ids(grid[position] ?? []), want.grid, `${position} ${season}: the grid's order`);
          assert.deepEqual(scored(rankTab(engine, rows, season, position)), want.scored, `${position} ${season}: the table's order and scores`);
          assert.deepEqual(ids(rankTab(engine, rows, season, position, { settings: { ...DEFAULT_SETTINGS, combineStats: false } }).ranked), want.plain, `${position} ${season}: Combined off`);
          for (const id of Object.keys(fixture.groups[position])) {
            const hide = hides.get(`${position}.${id}`);
            if (hide) assert.deepEqual(ids(rankTab(engine, rows, season, position, hide).ranked), want.hidden[id], `${position} ${season}: "${id}" hidden`);
          }
        }
      });
    }
  });

  test(`${sport}: every stat in one group, ids and tones unique, pairs together, headlines pinned`, async () => {
    const engine = await loadEngine(sport, { entry });
    const { POSITIONS, SKILL_STATS, GROUPS, skillGroups, statGroup, headlineStats, combinedStats } = engine;
    const fixture = fixtureOf(sport);
    for (const position of POSITIONS) {
      const stats = SKILL_STATS[position].filter((stat) => !stat.positionAdjust);
      const defs = GROUPS[position];
      const groups = skillGroups(position);
      // Coverage: each stat named by exactly one def; every shown group has stats; the sport's own ids
      for (const stat of stats) {
        const named = defs.filter((def) => def.keys.includes(stat.key));
        assert.equal(named.length, 1, `${position} ${stat.key}: in ${named.length} groups (${named.map((d) => d.id)})`);
        assert.equal(statGroup(stat, position), named[0].id, `${position} ${stat.key}: statGroup disagrees with GROUPS`);
      }
      for (const def of defs) assert.equal(new Set(def.keys).size, def.keys.length, `${position} ${def.id}: a key twice`);
      assert.ok(groups.length >= 2, `${position}: fewer than two groups`);
      assert.equal(new Set(groups.map((g) => g.id)).size, groups.length, `${position}: an id twice`);
      assert.equal(new Set(groups.map((g) => g.tone)).size, groups.length, `${position}: a tone twice`);
      for (const group of groups) {
        assert.ok(group.stats.length, `${position} ${group.id}: empty`);
        assert.match(group.id, /^[a-z]+$/, `${position}: id "${group.id}"`);
        assert.ok(group.title.trim().split(/\s+/).length <= 2, `${position} ${group.id}: "${group.title}" is more than two words`);
        assert.ok(group.icon, `${position} ${group.id}: no icon`);
        assert.ok(Number.isInteger(group.tone) && group.tone >= 0 && group.tone <= 5, `${position} ${group.id}: tone ${group.tone}`);
        if (group.id === 'results') assert.equal(group.tone, 0);
        if (group.id === 'support') assert.equal(group.tone, 3);
        // (the dark grades box is the group with the grades, and only that one)
        const grades = group.stats.some((stat) => stat.format === 'grade');
        if (grades) assert.ok(group.box, `${position} ${group.id}: grades outside the box`);
        for (const stat of group.stats) assert.equal(statGroup(stat, position), group.id);
      }
      // A combined pair's parts (Total Yds) sit in one group, and the total reads as that group
      const { stats: combined } = combinedStats(SKILL_STATS[position], position);
      for (const total of combined.filter((stat) => !stat.positionAdjust && !stats.some((own) => own.key === stat.key))) {
        const parts = stats.filter((stat) => !combined.includes(stat));
        const where = new Set(parts.map((stat) => statGroup(stat, position)));
        assert.ok(where.size >= 1, `${position} ${total.key}: no parts`);
        assert.ok(where.has(statGroup(total, position)), `${position} ${total.key}: the total isn't with its parts`);
      }
      // The headline stats are the fixture's (build-comps.mjs wrote them into the careers files)
      assert.deepEqual(headlineStats(position).map((stat) => stat.key), fixture.headline[position], `${position}: headline stats`);
    }
  });
}

test('share links: new ids round-trip; a retired id hides its stats of the day; a stale order puts nothing first', async () => {
  const engine = await loadEngine('nfl', { entry });
  const { PositionService, POSITIONS, skillGroups, legacyGroupKeys, LEGACY_GROUPS } = engine;
  const page = 'https://ranker.test/nfl/?pos=X';
  const setAddress = (href) => {
    globalThis.location = new URL(href);
  };
  const encode = (shared) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(shared)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tab = POSITIONS[0];
  const group = skillGroups(tab)[1].id;

  // A group hidden by its (new) id comes back as that group hidden
  setAddress(page);
  const a = new PositionService();
  a.setSkillGroupHidden(tab, group, true);
  setAddress(a.shareLink());
  const b = new PositionService();
  assert.deepEqual(b.skillHiddenGroups(tab), { [group]: true });
  assert.deepEqual(b.statHiddenState, {});

  // A retired id (a sport's LEGACY_GROUPS; here a made-up one through a tab that has it, if any): its stats
  // hidden one by one, no stray group id
  const legacy = Object.entries(LEGACY_GROUPS).flatMap(([position, groups]) => Object.keys(groups).map((id) => [position, id]))[0];
  if (legacy) {
    const [position, id] = legacy;
    setAddress(`${page}&list=${encode({ v: 1, g: { [position]: [id] } })}`);
    const c = new PositionService();
    assert.deepEqual(c.skillHiddenGroups(position), {});
    const want = Object.fromEntries(legacyGroupKeys(position, id).map((key) => [`${position}.${key}`, true]));
    assert.deepEqual(Object.fromEntries(Object.entries(c.statHiddenState).filter(([, off]) => off)), want);
  }
  // An id nobody knows: ignored
  setAddress(`${page}&list=${encode({ v: 1, g: { [tab]: ['nope'] } })}`);
  const d = new PositionService();
  assert.deepEqual(d.skillHiddenGroups(tab), {});
  assert.deepEqual(d.statHiddenState, {});

  // A stale card order (ids the tab doesn't have, a group it does missing): the named group first, the rest
  // in the tab's own order, nothing unknown at the front
  const own = skillGroups(tab);
  setAddress(`${page}&list=${encode({ v: 1, go: { [tab]: ['gone', own[own.length - 1].id] } })}`);
  const e = new PositionService();
  const order = e.orderedGroups(tab, own).map((g) => g.id);
  assert.deepEqual(order, [own[own.length - 1].id, ...own.slice(0, -1).map((g) => g.id)]);
  // (and the default order is the tab's own)
  setAddress(page);
  assert.deepEqual(new PositionService().orderedGroups(tab, own).map((g) => g.id), own.map((g) => g.id));
});
