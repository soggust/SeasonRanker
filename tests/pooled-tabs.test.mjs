// Pooled tabs (SPORT.pooledTabs: the Top 50, every position together; libs/ranker/src/engine/pooled-tabs.ts),
// on the real data: the season being played, the latest finished one and its playoffs. The tab is the
// pooled tabs' rows again, each player once on a copy tagged with his own tab (theirs untouched); its
// Position Adjustment is a slider at 0 by default that ranks nothing as a stat, and up measures each stat
// partly within his own position's players (all the way up, wholly: his z there); Min Games still only
// leaves players out; the view shows the top 50 of a longer ranking; a pooled row's card, compare side and
// search hit are his own tab's; and build-comps skips the tab (no Top 50 careers until asked for).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SPORTS, expandRows, loadEngine, readJson, seasonData, seasonDir, staticDir, unrankedService } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'unranked-entry.ts');
// (the sports with a pooled tab, by their sport.ts: the others' bundles aren't built here)
const POOLING = SPORTS.filter((sport) => /\bpooledTabs:/.test(fs.readFileSync(path.join(ROOT, 'apps', sport, 'src/sport/sport.ts'), 'utf8')));

const engines = {};
const engineFor = (sport) => (engines[sport] ??= loadEngine(sport, { entry: ENTRY }));

// (no network: the card asks ESPN for the hero's team color)
globalThis.fetch = async () => {
  throw new Error('offline');
};

// The season being played, the latest finished one, and that one's playoffs: [label, season, data]
function seasonsOf(sport, engine) {
  const { CURRENT_SEASON, SPORT } = engine;
  const dir = path.join(staticDir(sport), 'seasons');
  const finished = fs.readdirSync(dir).filter((d) => /^\d{4}$/.test(d)).map(Number).filter((s) => s < CURRENT_SEASON).sort((a, b) => b - a)[0];
  const out = [[`${CURRENT_SEASON}`, CURRENT_SEASON, seasonData(seasonDir(sport, CURRENT_SEASON, CURRENT_SEASON), SPORT.dataFiles)]];
  const data = seasonData(seasonDir(sport, finished, CURRENT_SEASON), SPORT.dataFiles);
  out.push([`${finished}`, finished, data]);
  const post = path.join(seasonDir(sport, finished, CURRENT_SEASON), 'skill-players.post.json');
  if (fs.existsSync(post)) {
    const { unrankedRows: _, ...rest } = data;
    out.push([`${finished} playoffs`, finished, { ...rest, skillPlayers: expandRows(readJson(post)) }]);
  }
  return out;
}

// A stand-in for the grid on a tab of the season being played (its default sliders, or weights given), the
// card's and the compare view's host, and the data service on the static files (tests/compare.test.mjs's)
function harness(engine, sport, position, { settings: changed = {}, weights } = {}) {
  const { TabRanker, StatReader, SKILL_STATS, skillGroups, presetWeights, emptyIn, SKILL_UNITS, CURRENT_SEASON, DEFAULT_SETTINGS, unitsForSeason, SPORT } = engine;
  const settings = { ...DEFAULT_SETTINGS, ...changed };
  const weightsOf = (p) => (p === position && weights ? weights : presetWeights(p, 'default'));
  const positions = {
    settings,
    statHiddenState: {},
    skillHiddenGroups: () => ({}),
    getWeights: weightsOf,
    isStatHidden: () => false,
    orderedGroups: (_p, groups) => groups,
    orderedStats: (_p, group) => group.stats,
    seasonUnitOrder: () => null,
  };
  const tab = (p) => ({ position: p, stats: SKILL_STATS[p], groups: skillGroups(p), hidden: {}, weights: weightsOf(p) });
  const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => tab(position), () => {});
  const readerOf = (context) =>
    new StatReader({
      position: context.position,
      settings,
      rows: context.rows,
      list: context.list,
      tableSeason: false,
      season: context.season,
      empty: context.empty,
      weights: ranker.mixWeights(context.position),
    });
  const host = {
    position,
    season: CURRENT_SEASON,
    stats: SKILL_STATS[position],
    colorValues: false,
    playerList: [],
    reader: null,
    readerFor: (context) => (context ? readerOf(context) : host.reader),
    seasonContext(season, rows, p = position) {
      const context = { season, rows, list: [], empty: (key) => emptyIn(rows[p] ?? [], key), position: p, min: ranker.minFor({ [p]: rows[p] }, p) };
      context.list = host.rankedIn(context, ranker.listed({ [p]: rows[p] }, season, p));
      return context;
    },
    rankedIn: (context, players) => ranker.ranked(readerOf(context), players, context.position, context.rows),
    shownGroups: (reader, p = position) => ranker.shownGroups(reader, p).groups,
    headshot: () => null,
    noHeadshot: () => {},
  };
  const table = host.seasonContext(CURRENT_SEASON, SKILL_UNITS, position);
  host.playerList = table.list;
  host.reader = readerOf(table);
  const careersDir = path.join(staticDir(sport), 'careers');
  const orEmpty = (file) => (fs.existsSync(path.join(careersDir, file)) ? readJson(path.join(careersDir, file)) : {});
  const data = {
    rows: async (season) => (season === CURRENT_SEASON ? SKILL_UNITS : unitsForSeason(seasonData(seasonDir(sport, season, CURRENT_SEASON), SPORT.dataFiles), season)),
    tabRows: async () => [],
    careers: async (p) => orEmpty(`${p}.json`),
    careerNames: async () => orEmpty('names.json'),
    comps: async () => ({}),
    extraFile: async () => ({}),
    ...unrankedService(sport, CURRENT_SEASON),
  };
  return { host, data, ranker, settings };
}

// Each stat's score as weightedTotals counts it alone (its slider at 50: strength 1), by unit
function statScores(engine, units, stat, adjust) {
  const parts = new Map();
  engine.weightedTotals(units, [stat], { [stat.key]: 50 }, (u, s) => u.stats[s.key] ?? null, null, undefined, units, parts, undefined, adjust);
  return new Map(units.map((u) => [u, parts.get(u)?.get(stat.key)]));
}

const zOf = (values, v) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return Math.max(-2.5, Math.min(2.5, (v - mean) / sd));
};
// (how far his group's average sits from the pool's, on the pool's spread)
const shiftOf = (values, all) => {
  const g = values.reduce((a, b) => a + b, 0) / values.length;
  const m = all.reduce((a, b) => a + b, 0) / all.length;
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - m) ** 2, 0) / all.length);
  return Math.max(-2.5, Math.min(2.5, (g - m) / sd));
};

test('the sports with a pooled tab: MLB, the NBA and the NHL as each one gets its Top 50; never the NFL or MMA', () => {
  for (const sport of ['mlb', 'nba', 'nhl']) assert.ok(POOLING.includes(sport), `pooling: ${POOLING}`);
  assert.ok(!POOLING.includes('nfl') && !POOLING.includes('mma'));
});

for (const sport of POOLING) {
  test(`${sport}: each pooled tab is its tabs' rows, each player once on a tagged copy, in every season and part`, async () => {
    const engine = await engineFor(sport);
    const { SPORT, POOLED, POSITIONS, withSeason, unitsForSeason, SKILL_STATS, isPooled } = engine;
    for (const [pooled, { tabs }] of Object.entries(POOLED)) {
      assert.equal(POSITIONS[POSITIONS.indexOf(pooled) - 1], 'TM', `${pooled}: right after Teams`);
      assert.equal(POSITIONS[0], 'TM', 'the app still opens on Teams');
      assert.equal(SPORT.tabNames[pooled], 'Top 50');
      assert.ok(isPooled(pooled) && !tabs.some(isPooled));
      assert.ok(Object.keys(SKILL_STATS).indexOf(pooled) >= 0);
    }
    for (const [label, season, data] of seasonsOf(sport, engine)) {
      withSeason(season, data, () => {
        const rows = unitsForSeason(data, season);
        for (const [pooled, { tabs }] of Object.entries(POOLED)) {
          const own = new Map();
          for (const tab of tabs) for (const row of rows[tab] ?? []) (own.get(row.gsisId) ?? own.set(row.gsisId, []).get(row.gsisId)).push([tab, row]);
          const top = rows[pooled];
          assert.ok(top.length > 50, `${label}: ${top.length} rows`);
          assert.equal(new Set(top.map((r) => r.gsisId)).size, top.length, `${label}: each player once`);
          assert.deepEqual(top.map((r) => r.gsisId).sort(), [...own.keys()].sort(), `${label}: the pooled tabs' players`);
          for (const row of top) {
            const homes = own.get(row.gsisId);
            const home = homes.find(([tab]) => tab === row.homeTab);
            assert.ok(home, `${label}: ${row.name} tagged with a tab he's on`);
            assert.notEqual(row, home[1], 'a copy, not his own row');
            assert.equal(row.stats, home[1].stats, 'sharing his stats');
            assert.equal(engine.homeTab(row, pooled), row.homeTab);
            // (in two tabs: the one with more playing time)
            for (const [, other] of homes) assert.ok(SPORT.playingTime.of(home[1]) >= SPORT.playingTime.of(other));
          }
          for (const tab of tabs) assert.ok((rows[tab] ?? []).every((r) => r.homeTab === undefined), `${label} ${tab}: its own rows untouched`);
          assert.deepEqual(Object.keys(rows).slice(-Object.keys(POOLED).length), Object.keys(POOLED), 'the pooled tabs last');
        }
      });
    }
  });

  test(`${sport}: the Position Adjustment: a slider at 0 by default, no column, no stat; up, each stat partly within his own position`, async () => {
    const engine = await engineFor(sport);
    const { POOLED, SKILL_STATS, SKILL_PRESETS, presetWeights, skillGroups, adjustFor, defaultRanking, weightedTotals, byTotals, SKILL_UNITS, statValue, DEFAULT_SPORT_SETTINGS } = engine;
    for (const [pooled, { group = (tab) => tab }] of Object.entries(POOLED)) {
      const adjusters = SKILL_STATS[pooled].filter((s) => s.positionAdjust);
      assert.equal(adjusters.length, 1, 'one Position Adjustment');
      const [adj] = adjusters;
      assert.equal(adj.key, 'posAdj');
      assert.ok(skillGroups(pooled).every((g) => g.stats.every((s) => !s.positionAdjust)), 'never a column, tile or compare row');
      for (const tab of Object.keys(SKILL_STATS)) if (tab !== pooled) assert.ok(SKILL_STATS[tab].every((s) => !s.positionAdjust), `${tab}: none`);
      // (neutral by default, in every preset that doesn't name it)
      assert.equal(presetWeights(pooled, 'default').posAdj, 0);
      for (const preset of SKILL_PRESETS[pooled]) assert.equal(presetWeights(pooled, preset.key).posAdj, preset.weights.posAdj ?? 0, preset.key);
      assert.equal(adjustFor(pooled, presetWeights(pooled, 'default')), undefined, 'at 0: none');
      assert.equal(adjustFor('TM', { posAdj: 100 }), undefined, 'none on another tab');

      // At 0, the ranking is the stats' alone (the slider ranks nothing as a stat)
      const weights = presetWeights(pooled, 'default');
      const units = SKILL_UNITS[pooled];
      const context = { position: pooled, settings: DEFAULT_SPORT_SETTINGS, rows: SKILL_UNITS, tableSeason: false, defaults: true, weights };
      const plain = engine.combinedStats(SKILL_STATS[pooled].filter((s) => !s.positionAdjust), pooled).stats;
      const totals = weightedTotals(units, plain, engine.combinedWeights(pooled, weights, true), (u, s) => statValue(u, s, context));
      const ids = (list) => list.map((u) => u.gsisId);
      assert.deepEqual(ids(defaultRanking(pooled, weights)), ids(byTotals(units, totals)), 'at 0: the stats alone');
      // (the slider at 100 on a weightedTotals without the adjustment: still nothing)
      const loud = weightedTotals(units, [adj], { posAdj: 100 }, () => 1);
      assert.ok([...loud.values()].every((v) => v === 0), 'never a stat');

      // Up: each stat's score is his z against everyone less share x his group's shift (its average's distance
      // from the pool's, on the pool's spread): one shift a group, so two players at one position keep their order
      const stats = SKILL_STATS[pooled].filter((s) => !s.infoOnly && !s.support && !s.positionAdjust && !s.scale && s.format !== 'record' && s.format !== 'recent');
      assert.ok(stats.length >= 5);
      const groupOf = (u) => group(u.homeTab);
      let checked = 0;
      for (const stat of stats.slice(0, 6)) {
        const known = units.filter((u) => typeof u.stats[stat.key] === 'number');
        const better = stat.negative ? -1 : 1;
        const all = known.map((u) => u.stats[stat.key]);
        const byGroup = new Map();
        for (const u of known) (byGroup.get(groupOf(u)) ?? byGroup.set(groupOf(u), []).get(groupOf(u))).push(u.stats[stat.key]);
        for (const share of [0.5, 1]) {
          const scores = statScores(engine, units, stat, adjustFor(pooled, { posAdj: share * 100 }));
          for (const u of known) {
            const values = byGroup.get(groupOf(u));
            const spread = new Set(values).size > 1;
            const shift = values.length >= 5 && spread ? shiftOf(values, all) : 0;
            const want = better * zOf(all, u.stats[stat.key]) - share * better * shift;
            assert.ok(Math.abs(scores.get(u) - want) < 1e-9, `${stat.key} at ${share * 100}: ${u.name} ${scores.get(u)} vs ${want}`);
            checked++;
          }
        }
      }
      assert.ok(checked > 500, `${checked} scores checked`);
      // (and it moves the order: a big enough pool's top 50 changes somewhere)
      const adjusted = defaultRanking(pooled, { ...weights, posAdj: 100 });
      assert.notDeepEqual(ids(adjusted).slice(0, 50), ids(defaultRanking(pooled, weights)).slice(0, 50), 'the Top 50 moves at 100');
      // (but never within a position: two players at one position keep their order at every share, the
      // owner's Witt and De La Cruz)
      const within = (list) => {
        const out = new Map();
        for (const u of list) (out.get(groupOf(u)) ?? out.set(groupOf(u), []).get(groupOf(u))).push(u.gsisId);
        return out;
      };
      const before = within(defaultRanking(pooled, weights));
      for (const [g, order] of within(adjusted)) assert.deepEqual(order, before.get(g), `${pooled} ${g}: the same order within the position`);
      // (every row's parts still add up to his total, adjusted)
      const parts = new Map();
      const adjust = adjustFor(pooled, { posAdj: 60 });
      const sums = weightedTotals(units, plain, engine.combinedWeights(pooled, weights, true), (u, s) => statValue(u, s, context), null, undefined, units, parts, undefined, adjust);
      for (const u of units.slice(0, 80)) {
        const sum = [...(parts.get(u)?.values() ?? [])].reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - sums.get(u)) < 1e-9, `${u.name}: the breakdown adds up`);
      }
    }
  });

  test(`${sport}: Min Games only leaves players out of the Top 50, adjusted or not, and the view shows its top 50`, async () => {
    const engine = await engineFor(sport);
    const { POOLED, SPORT, presetWeights, gridRankings, CURRENT_SEASON, SKILL_UNITS } = engine;
    for (const pooled of Object.keys(POOLED)) {
      assert.equal(SPORT.listLimit?.(pooled), 50);
      for (const posAdj of [0, 50]) {
        const weights = { ...presetWeights(pooled, 'default'), posAdj };
        const lists = [0, 25, 50, 75].map((minShare) => {
          const { host } = harness(engine, sport, pooled, { settings: { minShare }, weights });
          return host.playerList.map((p) => p.gsisId);
        });
        for (const list of lists.slice(1)) {
          const kept = new Set(list);
          assert.deepEqual(list, lists[0].filter((id) => kept.has(id)), `posAdj ${posAdj}: reordered`);
          assert.ok(list.length < lists[0].length);
        }
      }
      // (the list as the grid first opens it is longer than 50: the view's cap shows exactly 50)
      const grid = gridRankings(CURRENT_SEASON)[pooled];
      assert.ok(grid.length > 50, `${grid.length} ranked`);
      assert.ok(grid.every((row) => SKILL_UNITS[pooled].includes(row)));
    }
  });

  test(`${sport}: a Top 50 dragged by hand, then Show all: the rest follow the ranking, not the file's order`, async () => {
    const engine = await engineFor(sport);
    const { POOLED, SKILL_UNITS, CURRENT_SEASON } = engine;
    for (const pooled of Object.keys(POOLED)) {
      const { host, ranker } = harness(engine, sport, pooled);
      const listed = ranker.listed(SKILL_UNITS, CURRENT_SEASON, pooled);
      const { ranked } = ranker.rankedTotals(host.reader, listed, pooled, SKILL_UNITS);
      assert.ok(ranked.length > 60);
      // (the 50 that showed, the first two swapped: all the tab saved)
      const top = ranked.slice(0, 50).map((p) => p.gsisId);
      [top[0], top[1]] = [top[1], top[0]];
      const order = ranker.inOrder(listed, top, ranked);
      assert.deepEqual(order.slice(0, 50).map((p) => p.gsisId), top, 'the dragged top as saved');
      assert.deepEqual(order.slice(50), ranked.slice(50), 'everyone after in the ranking');
      // (without the ranking, the rest kept the file's order: what Show all showed before)
      assert.notDeepEqual(ranker.inOrder(listed, top).slice(50), ranked.slice(50));
    }
  });

  test(`${sport}: a Top 50 row's card, compare side and search hit are his own tab's`, async () => {
    const engine = await engineFor(sport);
    const { POOLED, CURRENT_SEASON } = engine;
    for (const pooled of Object.keys(POOLED)) {
      const { host, data } = harness(engine, sport, pooled);
      const [first, second] = host.playerList;

      // His card on his own tab, ranked there; "#1 in Top 50"; the arrows walk the Top 50
      const cards = new engine.PlayerCards(host, data);
      await cards.openFromPool(first, host.playerList);
      assert.equal(cards.card.player.gsisId, first.gsisId);
      assert.equal(cards.tabPosition, first.homeTab, 'on his own tab');
      assert.ok(cards.card.list.every((p) => p.homeTab === undefined), "ranked in his own tab's list");
      assert.equal(cards.card.positionName, engine.SPORT.positionNames[first.homeTab]);
      assert.equal(cards.poolPlace(cards.card), '#1 in Top 50');
      cards.step(1);
      for (let i = 0; i < 200 && cards.card.player.gsisId !== second.gsisId; i++) await new Promise((r) => setImmediate(r));
      assert.equal(cards.card.player.gsisId, second.gsisId, 'down: the Top 50\'s #2');
      assert.equal(cards.tabPosition, second.homeTab);
      assert.equal(cards.poolPlace(cards.card), '#2 in Top 50');
      cards.close();
      // (opened from his own tab: no Top 50 place)
      await cards.openLinked({ position: first.homeTab, gsisId: first.gsisId }, CURRENT_SEASON);
      assert.equal(cards.poolPlace(cards.card), null);

      // The game view's names, and a roster's links: never the pooled tab
      const games = {};
      cards.connectGames(games);
      const found = await games.findPlayers(CURRENT_SEASON);
      assert.ok(found.size > 0 && [...found.values()].every((p) => p.position !== pooled), 'findPlayers: own tabs');

      // Compare from the Top 50: each side on his own tab; the search lists each player once, on his tab
      const compare = new engine.PlayerCompare(host, data);
      await compare.start([first, second]);
      assert.deepEqual(compare.sides.map((s) => s.position), [first.homeTab, second.homeTab]);
      await compare.search(engine.surname(first.name));
      const hits = compare.hits.filter((h) => h.id === first.gsisId);
      assert.ok(hits.length >= 1 && compare.hits.every((h) => h.position !== pooled), 'no Top 50 hits');
      assert.ok(hits.some((h) => h.position === first.homeTab));
    }
  });

  test(`${sport}: build-comps skips the pooled tab (no Top 50 units, careers or comps)`, async () => {
    const units = await loadEngine(sport, { entry: path.join(ROOT, 'libs/ranker/scripts/comps/units.ts') });
    const pooled = Object.keys(units.SKILL_STATS).filter(units.isPooled);
    assert.deepEqual(pooled, ['TOP']);
    assert.ok(!fs.existsSync(path.join(staticDir(sport), 'careers', 'TOP.json')), 'no careers file');
    const names = readJson(path.join(staticDir(sport), 'careers', 'names.json'));
    assert.ok(!('TOP' in names));
  });
}
