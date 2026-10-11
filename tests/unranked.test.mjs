// Unranked (UR) seasons: the NFL's RB/WR/TE/K/P lists are cut to the top so many by usage (update-data.mjs's
// SKILL_POSITIONS), and everyone else who played a season is kept beside them, in skill-players.ur.json,
// never ranked. These check the files (nobody in both, everyone in them played, every season has one), the
// careers (an unranked season a line ranked 0 of 0, the ranked lines as they were), and the card and the
// compare view on a real one: Calvin Ridley's 2025 (seven games, hurt) and 2026 (a handful of targets) seasons,
// UR with their stats, never ranked, colored or leading a column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, seasonData, seasonDir, staticDir, unrankedService } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'unranked-entry.ts');
const NFL = staticDir('nfl');
const TABS = ['RB', 'WR', 'TE', 'K', 'P'];
const RIDLEY = '00-0034837';

// Every NFL season's folder: the finished ones, then the current season's (the top of StaticData)
const seasonFolders = () => [
  ...fs.readdirSync(path.join(NFL, 'seasons')).filter((d) => /^\d{4}$/.test(d)).map((d) => [Number(d), path.join(NFL, 'seasons', d)]),
  [null, NFL],
];

// A stat the tab counts (update-data.mjs's PLAYED)
const PLAYED = {
  RB: (s) => s.carries + (s.targets ?? 0) + s.receptions > 0,
  WR: (s) => s.carries + (s.targets ?? 0) + s.receptions > 0,
  TE: (s) => s.carries + (s.targets ?? 0) + s.receptions > 0,
  K: (s) => s.fgAtt + s.patAtt > 0,
  P: (s) => s.punts > 0,
};

test('nfl: every season has its unranked rows, nobody in them is ranked, and everyone in them played', () => {
  for (const [season, dir] of seasonFolders()) {
    const file = path.join(dir, 'skill-players.ur.json');
    assert.ok(fs.existsSync(file), `${season ?? 'current'}: skill-players.ur.json`);
    const unranked = readJson(file);
    const ranked = readJson(path.join(dir, 'skill-players.json'));
    assert.deepEqual(Object.keys(unranked).sort(), [...TABS].sort(), `${season}: a list per tab`);
    for (const tab of TABS) {
      const listed = new Set(ranked[tab].map((p) => p.gsisId));
      const ids = new Set();
      for (const row of unranked[tab]) {
        assert.ok(!listed.has(row.gsisId), `${season} ${tab}: ${row.name} is ranked and unranked`);
        assert.ok(!ids.has(row.gsisId), `${season} ${tab}: ${row.name} twice`);
        ids.add(row.gsisId);
        assert.equal(row.ur, true, `${season} ${tab}: ${row.name} marked ur`);
        assert.ok(row.games > 0 && PLAYED[tab](row.stats), `${season} ${tab}: ${row.name} didn't play`);
        // (a row as the ranked ones are: the same stats, so the card and the compare view read it alike)
        assert.deepEqual(Object.keys(row.stats).sort(), Object.keys(ranked[tab][0].stats).sort(), `${season} ${tab}: ${row.name}'s stats`);
      }
    }
  }
});

test("nfl: the careers have an unranked season as a line ranked 0 of 0, and the ranked ones' ranks stay ranks", () => {
  const unrankedIn = new Map();
  for (const [season, dir] of seasonFolders()) {
    if (season === null) continue;
    unrankedIn.set(season, readJson(path.join(dir, 'skill-players.ur.json')));
  }
  for (const tab of TABS) {
    const careers = readJson(path.join(NFL, 'careers', `${tab}.json`));
    let ur = 0;
    for (const [id, lines] of Object.entries(careers)) {
      const seasons = lines.map(([season]) => season);
      assert.deepEqual(seasons, [...seasons].sort((a, b) => a - b), `${tab} ${id}: seasons in order`);
      assert.equal(new Set(seasons).size, seasons.length, `${tab} ${id}: a season twice`);
      for (const [season, , games, rank, of] of lines) {
        const unranked = unrankedIn.get(season)[tab].some((p) => p.gsisId === id);
        if (rank === 0) {
          ur++;
          assert.equal(of, 0, `${tab} ${id} ${season}: UR is 0 of 0`);
          assert.ok(unranked, `${tab} ${id} ${season}: UR but not in the season's unranked rows`);
          assert.ok(games > 0);
        } else {
          assert.ok(rank >= 1 && rank <= of, `${tab} ${id} ${season}: #${rank} of ${of}`);
          assert.ok(!unranked, `${tab} ${id} ${season}: ranked and unranked`);
        }
      }
    }
    assert.ok(ur > 0, `${tab}: unranked seasons in the careers`);
  }
  // (Ridley: his ranked seasons ranked, his 2021 and 2025 unranked; the season being played isn't in them)
  const ridley = readJson(path.join(NFL, 'careers', 'WR.json'))[RIDLEY];
  const line = (season) => ridley.find(([s]) => s === season);
  assert.ok(line(2024)[3] >= 1, '2024 ranked');
  assert.deepEqual(line(2025).slice(0, 5), [2025, 'Titans', 7, 0, 0], '2025 UR');
  assert.equal(line(2026), undefined, 'the current season comes from its own rows');
  // (and the search's names have everyone, an unranked-only player too)
  const names = readJson(path.join(NFL, 'careers', 'names.json'));
  for (const tab of TABS) {
    const careers = readJson(path.join(NFL, 'careers', `${tab}.json`));
    for (const id of Object.keys(careers)) assert.ok(names[tab]?.[id], `${tab} ${id}: no name`);
  }
});

// A stand-in for the grid on the WR tab of the season being played (default sliders), the card's and the
// compare view's host, and the data service on the static files (as tests/compare.test.mjs's)
async function harness() {
  const engine = await loadEngine('nfl', { entry: ENTRY });
  const { TabRanker, StatReader, SKILL_STATS, skillGroups, presetWeights, emptyIn, SKILL_UNITS, CURRENT_SEASON, DEFAULT_SETTINGS, unitsForSeason, SPORT } = engine;
  const position = 'WR';
  const settings = { ...DEFAULT_SETTINGS };
  const positions = {
    settings,
    statHiddenState: {},
    skillHiddenGroups: () => ({}),
    getWeights: (p) => presetWeights(p, 'default'),
    isStatHidden: () => false,
    orderedGroups: (_p, groups) => groups,
    orderedStats: (_p, group) => group.stats,
    seasonUnitOrder: () => null,
  };
  const tab = (p) => ({ position: p, stats: SKILL_STATS[p], groups: skillGroups(p), hidden: {}, weights: presetWeights(p, 'default') });
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
    colorValues: true,
    playerList: [],
    reader: null,
    readerFor: (context) => (context ? readerOf(context) : host.reader),
    seasonContext(season, rows, p = position) {
      const context = { season, rows, list: [], empty: (key) => emptyIn(rows[p] ?? [], key), position: p };
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
  const careers = (file) => readJson(path.join(NFL, 'careers', file));
  const rows = new Map();
  const data = {
    rows: async (season) => {
      if (season === CURRENT_SEASON) return SKILL_UNITS;
      if (!rows.has(season)) rows.set(season, unitsForSeason(seasonData(seasonDir('nfl', season, CURRENT_SEASON), SPORT.dataFiles), season));
      return rows.get(season);
    },
    tabRows: async (season, p) => readJson(path.join(NFL, 'seasons', String(season), 'units', `${p}.json`)),
    careers: async (p) => careers(`${p}.json`),
    careerNames: async () => careers('names.json'),
    comps: async () => ({}),
    extraFile: async () => ({}),
    ...unrankedService('nfl', CURRENT_SEASON),
  };
  return { engine, host, data };
}

// (the card asks ESPN for the hero's team color, after the test's done with it: no network in these tests)
globalThis.fetch = async () => {
  throw new Error('offline');
};

test("nfl: Ridley's unranked seasons on his card: UR in the rank tile and the Career tab, his stats, no ranks or colors", async () => {
  const { engine, host, data } = await harness();
  assert.ok(!host.playerList.some((p) => p.gsisId === RIDLEY), 'not in the table');
  const cards = new engine.PlayerCards(host, data);
  for (const season of [2025, engine.CURRENT_SEASON]) {
    assert.ok(await cards.openSeason(season, RIDLEY), `${season}: his card opens`);
    const card = cards.card;
    assert.equal(card.ur, true, `${season}: unranked`);
    assert.equal(card.rank, 0);
    assert.equal(card.player.name, 'Calvin Ridley');
    assert.deepEqual(card.awards, []);
    assert.ok(!card.list.includes(card.player), `${season}: never put in the list`);
    const stats = card.groups.flatMap((g) => g.stats);
    const targets = stats.find((s) => s.key === 'targets');
    assert.ok(targets && Number(targets.display) > 0, `${season}: his targets shown`);
    assert.ok(stats.every((s) => s.rank === null && s.pct === null && s.tint === null), `${season}: no rank or color on a stat`);
    assert.deepEqual(card.overview.skills, [], 'no skills against a list he is not in');
    assert.equal(card.overview.archetype, 'Unranked season');
  }
  // (his Career lines: the ranked seasons ranked, 2025 and 2026 UR, never a career best)
  const lines = await engine.careerLines(data, host.season, 'WR', RIDLEY);
  const of = (season) => lines.find((l) => l.season === season);
  assert.ok(of(2024).rank >= 1 && !of(2024).ur);
  for (const season of [2025, engine.CURRENT_SEASON]) {
    assert.equal(of(season).ur, true, `${season}: UR`);
    assert.equal(of(season).rank, 0);
    assert.ok(of(season).stats[0].value > 0, `${season}: his headline stats`);
    assert.ok(of(season).stats.every((s) => !s.best), `${season}: no career best`);
  }
});

test("nfl: the arrow keys on a UR card: up opens the list's last, down its #1", async () => {
  const { engine, host, data } = await harness();
  const cards = new engine.PlayerCards(host, data);
  assert.ok(await cards.openSeason(2025, RIDLEY));
  const list = cards.card.list;
  cards.step(1);
  assert.equal(cards.card.player, list[0], 'down: #1');
  assert.ok(await cards.openSeason(2025, RIDLEY));
  cards.step(-1);
  assert.equal(cards.card.player, list.at(-1), 'up: the last');
  cards.step(-1);
  assert.equal(cards.card.player, list.at(-2), 'then on up the list as ever');
});

test("nfl: Ridley's 2025 in the compare view: UR, his values, no ranks, never a column's leader, a hollow dot on his arc", async () => {
  const { engine, host, data } = await harness();
  const compare = new engine.PlayerCompare(host, data);
  await compare.start(host.playerList.slice(0, 1));
  await compare.add('WR', 2025, RIDLEY);
  assert.equal(compare.sides.length, 2, 'his 2025 added');
  const side = compare.sides[1];
  assert.equal(side.ur, true);
  assert.equal(side.rank, 0);
  assert.equal(side.archetype, 'Unranked season');
  assert.deepEqual(side.skills, []);
  const rows = compare.view.groups.flatMap((g) => g.rows);
  const targets = rows.find((r) => r.key.startsWith('targets|'));
  assert.ok(targets && targets.cells[1].text !== '-', 'his targets shown');
  for (const row of rows) {
    assert.equal(row.cells[1].pct, null, `${row.key}: no rank`);
    assert.equal(row.cells[1].tint, null, `${row.key}: no color`);
    assert.ok(!row.leaders.includes(1), `${row.key}: an unranked season leads`);
  }
  // (his career: the picker has 2025 as UR; the arc's dot for it hollow, on the bottom, off the line)
  for (let i = 0; i < 500 && compare.sides.some((s) => s.career === null); i++) await new Promise((r) => setImmediate(r));
  const ur = side.career.find((l) => l.season === 2025);
  assert.equal(ur.ur, true);
  await compare.rankCareer(side);
  assert.equal(compare.sides[1].career.find((l) => l.season === 2025).ur, true, 'still UR with your sliders');
  const line = compare.arcs.lines[1];
  const dots = line.dots.filter((d) => d.ur);
  assert.ok(dots.length >= 2, 'his unranked seasons on the arc');
  assert.ok(dots.every((d) => !line.points.includes(`${d.x},${d.y}`)), 'off the line');
  // (the search finds him, his best season a ranked one)
  await compare.search('calvin ridley');
  const hit = compare.hits.find((h) => h.id === RIDLEY);
  assert.ok(hit && hit.best.rank >= 1, 'found, his best a ranked season');
  assert.ok(hit.seasons.includes(2025) && hit.seasons.includes(engine.CURRENT_SEASON), 'his unranked seasons among his seasons');
});

test("nfl: the ranking never sees an unranked row: the table's list is skill-players.json's alone", async () => {
  const { engine, host } = await harness();
  const unranked = readJson(path.join(NFL, 'skill-players.ur.json'));
  const ids = new Set(unranked.WR.map((p) => p.gsisId));
  assert.ok(ids.size > 0);
  assert.ok(!engine.SKILL_UNITS.WR.some((p) => ids.has(p.gsisId) || p.ur), 'no unranked row in the rows');
  assert.ok(!host.playerList.some((p) => ids.has(p.gsisId)), 'none in the table');
});
