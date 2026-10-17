// Unranked (UR) seasons: the NFL's RB/WR/TE/K/P lists are cut to the top so many by usage (update-data.mjs's
// SKILL_POSITIONS), and everyone else who played a season is kept beside them, in skill-players.ur.json,
// never ranked. These check the files (nobody in both, everyone in them played, every season has one), the
// careers (an unranked season a line ranked 0 of 0, the ranked lines as they were), and the card and the
// compare view on a real one: Calvin Ridley's 2025 (seven games, hurt) and 2026 (a handful of targets) seasons.
// Rank everyone: those rows load into their tabs' rows, and Min Games is the gate, so at the default he's
// ranked, and with Min Games raised past his games he's UR with his stats, never ranked, colored or leading a
// column. The careers' finished seasons are ranked the same way, at the default Min Games (build-comps.mjs),
// so his 2025 is a ranked line there too. The QBs too: the tab is each game's starters,
// so a backup who only came on in relief is unranked (unrankedQbs), from nflverse's totals, the starter's own
// stats (record, recent starts, Responsibility) empty. And each part has its own (skill-players.ur.post.json,
// .all.json): a playoff card of someone outside the playoffs' list reads his playoffs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, seasonData, seasonDir, staticDir, unrankedService } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'unranked-entry.ts');
const NFL = staticDir('nfl');
const TABS = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'EDGE', 'DL', 'LB', 'CB', 'S'];
const PARTS = ['regular', 'post', 'all'];
const RIDLEY = '00-0034837';

// Every NFL season's folder: the finished ones, then the current season's (the top of StaticData)
const seasonFolders = () => [
  ...fs.readdirSync(path.join(NFL, 'seasons')).filter((d) => /^\d{4}$/.test(d)).map((d) => [Number(d), path.join(NFL, 'seasons', d)]),
  [null, NFL],
];

// A stat the tab counts (update-data.mjs's PLAYED; a QB's games are a dropback or a carry: unrankedQbs)
const PLAYED = {
  QB: () => true,
  RB: (s) => s.carries + (s.targets ?? 0) + s.receptions > 0,
  WR: (s) => s.carries + (s.targets ?? 0) + s.receptions > 0,
  TE: (s) => s.carries + (s.targets ?? 0) + s.receptions > 0,
  K: (s) => s.fgAtt + s.patAtt > 0,
  P: (s) => s.punts > 0,
};
// (a defender: a snap, a tackle, a pass defended, a sack or an interception)
for (const tab of ['EDGE', 'DL', 'LB', 'CB', 'S']) PLAYED[tab] = (s) => (s.snaps ?? 0) + s.tackles + s.passesDefended + s.sacks + s.interceptions > 0;

// A part's file (skill-players.json, skill-players.post.json)
const partFile = (file, part) => (part === 'regular' ? file : file.replace(/\.json$/,`.${part}.json`));

// The QB tab's rows' stats (a finished season's, as build-comps.mjs wrote them)
const QB_STATS = Object.keys(readJson(path.join(NFL, 'seasons', '2025', 'units', 'QB.json'))[0].stats).sort();

test('nfl: every season and part has its unranked rows, nobody in them is ranked, and everyone in them played', () => {
  let parts = 0;
  for (const [season, dir] of seasonFolders()) for (const part of PARTS) {
    const file = path.join(dir, partFile('skill-players.ur.json', part));
    const rankedFile = path.join(dir, partFile('skill-players.json', part));
    // (a part with no ranked rows, the playoffs before they're played, has no unranked ones)
    if (!fs.existsSync(rankedFile)) {
      assert.ok(part !== 'regular', `${season}: skill-players.json`);
      assert.ok(!fs.existsSync(file), `${season} ${part}: unranked rows with no ranked ones`);
      continue;
    }
    assert.ok(fs.existsSync(file), `${season ?? 'current'}: ${path.basename(file)}`);
    parts++;
    const unranked = readJson(file);
    const ranked = readJson(rankedFile);
    // (the QB tab's: the part's starters with box stats, buildQbUnits)
    ranked.QB = readJson(path.join(dir, partFile('games.json', part))).filter((qb) => qb.box).map((qb) => ({ gsisId: `QB-${qb.id}`, stats: Object.fromEntries(QB_STATS.map((k) => [k, 0])) }));
    assert.deepEqual(Object.keys(unranked).sort(), [...TABS].sort(), `${season} ${part}: a list per tab`);
    for (const tab of TABS) {
      const listed = new Set(ranked[tab].map((p) => p.gsisId));
      const ids = new Set();
      for (const row of unranked[tab]) {
        assert.ok(!listed.has(row.gsisId), `${season} ${part} ${tab}: ${row.name} is ranked and unranked`);
        assert.ok(!ids.has(row.gsisId), `${season} ${tab}: ${row.name} twice`);
        ids.add(row.gsisId);
        assert.equal(row.ur, true, `${season} ${tab}: ${row.name} marked ur`);
        assert.ok(row.games > 0 && PLAYED[tab](row.stats), `${season} ${tab}: ${row.name} didn't play`);
        // (a row as the ranked ones are: the same stats, so the card and the compare view read it alike)
        assert.deepEqual(Object.keys(row.stats).sort(), Object.keys(ranked[tab][0].stats).sort(), `${season} ${tab}: ${row.name}'s stats`);
      }
    }
    // (a QB's: his stats from nflverse, a starter's own empty)
    for (const qb of unranked.QB) {
      assert.match(qb.gsisId, /^QB-/, `${season} ${part}: ${qb.name}'s id`);
      assert.deepEqual([qb.stats.wins, qb.stats.losses, qb.stats.winPct, qb.stats.responsibility, qb.lastFive.length], [0, 0, null, null, 0], `${season} ${qb.name}: no starts`);
    }
  }
  assert.ok(parts > 60, `the parts with unranked rows: ${parts}`);
});

test("nfl: the careers rank a season at the default Min Games, the rest a line ranked 0 of 0 (UR)", () => {
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
        // (rank everyone: under the default Min Games, 10% of the season, two games; the QBs' backups always)
        const under = games < 2 || (tab === 'QB' && unranked);
        if (rank === 0) {
          ur++;
          assert.equal(of, 0, `${tab} ${id} ${season}: UR is 0 of 0`);
          assert.ok(under, `${tab} ${id} ${season}: UR at ${games} games`);
          assert.ok(games > 0);
        } else {
          assert.ok(rank >= 1 && rank <= of, `${tab} ${id} ${season}: #${rank} of ${of}`);
          assert.ok(!under, `${tab} ${id} ${season}: ranked at ${games} games`);
        }
      }
    }
    assert.ok(ur > 0, `${tab}: unranked seasons in the careers`);
  }
  // (Ridley: 2024 ranked, and 2025's seven games too, at the default Min Games; the season being played isn't in them)
  const ridley = readJson(path.join(NFL, 'careers', 'WR.json'))[RIDLEY];
  const line = (season) => ridley.find(([s]) => s === season);
  assert.ok(line(2024)[3] >= 1, '2024 ranked');
  assert.deepEqual(line(2025).slice(0, 3), [2025, 'Titans', 7]);
  assert.ok(line(2025)[3] >= 1 && line(2025)[3] <= line(2025)[4], '2025 ranked');
  assert.equal(line(2026), undefined, 'the current season comes from its own rows');
  // (and the search's names have everyone, an unranked-only player too)
  const names = readJson(path.join(NFL, 'careers', 'names.json'));
  for (const tab of TABS) {
    const careers = readJson(path.join(NFL, 'careers', `${tab}.json`));
    for (const id of Object.keys(careers)) assert.ok(names[tab]?.[id], `${tab} ${id}: no name`);
  }
});

// (who's ranked and the list size, against the compare view's host's list for a season; the order is
// checked against the grid's own below)
test("nfl: the careers' finished seasons rank who the grid ranks by default, out of as many (every tab, 2024 and 2025)", async () => {
  const { engine, host, data } = await harness();
  for (const season of [2024, 2025]) {
    const rows = await data.rows(season);
    for (const tab of TABS) {
      const careers = readJson(path.join(NFL, 'careers', `${tab}.json`));
      const list = host.seasonContext(season, rows, tab).list;
      assert.ok(list.length > 20, `${season} ${tab}: a list`);
      const at = new Map(list.map((p, i) => [p.gsisId.replace(/^QB-/, ''), i + 1]));
      let ranked = 0;
      for (const [id, lines] of Object.entries(careers)) {
        const line = lines.find(([s]) => s === season);
        if (!line) continue;
        const listed = at.has(id.replace(/^QB-/, ''));
        assert.deepEqual([line[3] > 0, line[4]], [listed, listed ? list.length : 0], `${season} ${tab} ${id}: ranked as the grid`);
        if (listed) ranked++;
      }
      assert.equal(ranked, list.length, `${season} ${tab}: everyone in the grid's list in the careers`);
    }
  }
});

// The order too: a finished season's career ranks are the grid's as the page first opens on that season and
// tab, the app's own pieces (the season loaded as the year selector loads it, a fresh PositionService whose
// sportChanged$ works out the grades from other tabs from their default rankings, a TabRanker on it and
// the table's StatReader), every setting and slider at its default: Combine on (a pair counts as its total),
// no Recent for a finished season, the grades from other tabs counted. (Before, the careers ranked by
// defaultRanking with each pair's parts apart and those grades average, so Nacua's 2024 was #5 there and
// #18 in the grid.)
test("nfl: the careers' finished seasons in the grid's own order, as it first opens (every tab's top 20, 2024 and 2025)", async () => {
  globalThis.location ??= new URL('http://localhost/');
  globalThis.history ??= { replaceState: () => {} };
  const engine = await loadEngine('nfl', { entry: ENTRY });
  const { TabRanker, StatReader, PositionService, SKILL_STATS, SKILL_UNITS, skillGroups, presetWeights, emptyIn } = engine;
  const careers = Object.fromEntries(TABS.map((tab) => [tab, readJson(path.join(NFL, 'careers', `${tab}.json`))]));
  for (const season of [2024, 2025]) {
    await engine.loadData(season, 'regular');
    engine.rebuildUnits();
    const positions = new PositionService();
    const grades = positions.sportChanged$.subscribe();
    for (const tab of TABS) {
      const table = { position: tab, stats: SKILL_STATS[tab], groups: skillGroups(tab), hidden: {}, weights: presetWeights(tab, 'default') };
      const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => table, () => {});
      const list = ranker.listed(SKILL_UNITS, season, tab);
      const reader = new StatReader({ position: tab, settings: positions.settings, rows: SKILL_UNITS, list, tableSeason: true, season, empty: (key) => emptyIn(SKILL_UNITS[tab], key), weights: ranker.mixWeights(tab) });
      const grid = ranker.ranked(reader, list, tab, SKILL_UNITS).map((p) => p.gsisId.replace(/^QB-/, ''));
      const ranks = [];
      for (const [id, lines] of Object.entries(careers[tab])) {
        const line = lines.find(([s]) => s === season);
        if (line?.[3] > 0) ranks[line[3] - 1] = id.replace(/^QB-/, '');
      }
      assert.equal(ranks.length, grid.length, `${season} ${tab}: as many ranked`);
      assert.deepEqual(ranks.slice(0, 20), grid.slice(0, 20), `${season} ${tab}: the top 20 in the grid's order`);
      assert.deepEqual(ranks, grid, `${season} ${tab}: every rank the grid's`);
    }
    grades.unsubscribe();
  }
});

// A stand-in for the grid on a tab (the WR tab) of the season being played (default sliders), the card's and the
// compare view's host, and the data service on the static files (as tests/compare.test.mjs's). load: another
// season and part in the table (the app's loadData, its files read from disk), the data service the app's own
async function harness({ position = 'WR', load } = {}) {
  const engine = await loadEngine('nfl', { entry: ENTRY });
  const { TabRanker, StatReader, SKILL_STATS, skillGroups, presetWeights, emptyIn, SKILL_UNITS, CURRENT_SEASON, DEFAULT_SETTINGS, unitsForSeason, SPORT } = engine;
  if (load) {
    await engine.loadData(load.season, load.part);
    engine.rebuildUnits();
  }
  const tableSeason = engine.dataSeason;
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
    season: tableSeason,
    stats: SKILL_STATS[position],
    colorValues: true,
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
  const table = host.seasonContext(tableSeason, SKILL_UNITS, position);
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
  return { engine, host, settings, ranker, data: load ? new engine.SeasonDataService() : data };
}

// (the card asks ESPN for the hero's team color, after the test's done with it: no network in these tests;
// the site's own files, data/..., are read from StaticData, as the host serves them)
globalThis.fetch = async (url) => {
  const own = String(url).match(/^data\/(.+)$/);
  if (!own) throw new Error('offline');
  const file = path.join(NFL, own[1]);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => readJson(file) };
};

test("nfl: Ridley's seasons under Min Games on his card: UR in the rank tile, his stats, no ranks or colors", async () => {
  const { engine, host, data, settings } = await harness();
  // (rank everyone: his three games this season meet the default Min Games, so he's ranked in the table)
  assert.ok(host.playerList.some((p) => p.gsisId === RIDLEY), 'ranked in the table at the default Min Games');
  const cards = new engine.PlayerCards(host, data);
  assert.ok(await cards.openSeason(2025, RIDLEY));
  assert.ok(!cards.card.ur && cards.card.rank >= 1, '2025 (seven games) ranked at the default Min Games');
  // (Min Games raised to every game: both seasons fall under it, and the table sorts again)
  settings.minShare = 100;
  host.playerList = host.seasonContext(host.season, engine.SKILL_UNITS, 'WR').list;
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
  // (his Career lines: the default settings', so 2025 and this season ranked at the default Min Games, as
  // his card was; the careers file's 2025 where the grid ranks him by default)
  const lines = await engine.careerLines(data, host.season, 'WR', RIDLEY);
  const of = (season) => lines.find((l) => l.season === season);
  assert.ok(of(2024).rank >= 1 && !of(2024).ur);
  settings.minShare = engine.DEFAULT_SETTINGS.minShare;
  const grid2025 = host.seasonContext(2025, await data.rows(2025), 'WR').list;
  assert.ok(!of(2025).ur && of(2025).rank >= 1, '2025: ranked in the careers file');
  assert.equal(of(2025).of, grid2025.length, "2025: out of the grid's default list");
  assert.ok(of(2025).stats[0].value > 0, '2025: his headline stats');
  const now = of(engine.CURRENT_SEASON);
  assert.ok(now.rank >= 1 && now.rank <= now.of && !now.ur, 'this season ranked at the default Min Games');
});

test("nfl: a row the list's other filters leave out (Injured Players off) is ranked where he'd fall on his card and in compare, never UR", async () => {
  const { engine, host, data, settings } = await harness();
  settings.showInjured = false;
  const table = host.seasonContext(host.season, engine.SKILL_UNITS, 'WR');
  host.playerList = table.list;
  const hurt = engine.SKILL_UNITS.WR.find((p) => p.injured && engine.SPORT.playingTime.of(p) >= table.min);
  assert.ok(hurt, 'an injured WR at Min Games');
  assert.ok(!table.list.includes(hurt), 'left out of the list');
  const cards = new engine.PlayerCards(host, data);
  assert.ok(await cards.openSeason(host.season, hurt.gsisId));
  assert.ok(!cards.card.ur && cards.card.rank >= 1, `${hurt.name}: ranked where he'd fall`);
  const compare = new engine.PlayerCompare(host, data);
  await compare.start(host.playerList.slice(0, 1));
  await compare.add('WR', host.season, hurt.gsisId);
  assert.equal(compare.sides.length, 2, 'his season added');
  assert.ok(!compare.sides[1].ur && compare.sides[1].rank >= 1, `${hurt.name}: ranked in compare`);
});

test("nfl: the arrow keys on a UR card: up opens the list's last, down its #1", async () => {
  const { engine, host, data, settings } = await harness();
  settings.minShare = 100;
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

test("nfl: Ridley's 2025 under Min Games in the compare view: UR, his values, no ranks, never a column's leader, a hollow dot on his arc", async () => {
  const { engine, host, data, settings } = await harness();
  const compare = new engine.PlayerCompare(host, data);
  await compare.start(host.playerList.slice(0, 1));
  settings.minShare = 100;
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
  // (his career: the picker has 2025 ranked, the default Min Games'; with yours, raised past his games, UR,
  // the arc's dot for it hollow, on the bottom, off the line)
  for (let i = 0; i < 500 && compare.sides.some((s) => s.career === null); i++) await new Promise((r) => setImmediate(r));
  assert.ok(!side.career.find((l) => l.season === 2025).ur, 'ranked at the default Min Games');
  await compare.rankCareer(side);
  assert.equal(compare.sides[1].career.find((l) => l.season === 2025).ur, true, 'UR with your Min Games');
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

test("nfl: rank everyone: the tab's rows are both files', Min Games decides who's ranked, and the rest are UR below", async () => {
  const { engine, host, settings, ranker } = await harness();
  const { SKILL_UNITS, SPORT } = engine;
  const unranked = readJson(path.join(NFL, 'skill-players.ur.json'));
  const ranked = readJson(path.join(NFL, 'skill-players.json'));
  const rowIds = new Set(SKILL_UNITS.WR.map((p) => p.gsisId));
  assert.ok(unranked.WR.length > 0);
  assert.ok([...ranked.WR, ...unranked.WR].every((p) => rowIds.has(p.gsisId)), "every WR of both files in the tab's rows");
  assert.equal(rowIds.size, SKILL_UNITS.WR.length, 'nobody twice');
  assert.ok(!SKILL_UNITS.WR.some((p) => p.ur), 'no row keeps a ur mark: UR is under Min Games');
  // (the table: the rows at Min Games; the UR rows: the rest the filters keep, none of them in the list)
  for (const minShare of [0, 50, 100]) {
    settings.minShare = minShare;
    const min = ranker.minFor(SKILL_UNITS, 'WR');
    const list = ranker.listed(SKILL_UNITS, host.season, 'WR');
    const ur = ranker.unranked(host.reader, [], host.season, 'WR', SKILL_UNITS);
    assert.ok(list.every((p) => SPORT.playingTime.of(p) >= min), `Min ${minShare}%: the list at Min Games`);
    assert.ok(ur.every((p) => SPORT.playingTime.of(p) < min && !list.includes(p)), `Min ${minShare}%: the UR rows under it`);
    assert.equal(list.length + ur.length, ranker.listed(SKILL_UNITS, host.season, 'WR', SKILL_UNITS.WR, 0).length, `Min ${minShare}%: everyone listed once`);
    // (the ranking measured against the list alone: the UR rows never move it)
    const order = (rows) => ranker.ranked(host.reader, list, 'WR', rows).map((p) => p.gsisId);
    assert.deepEqual(order(SKILL_UNITS), order({ ...SKILL_UNITS, WR: list }), `Min ${minShare}%: the UR rows moved the ranking`);
  }
  settings.minShare = 100;
  assert.ok(ranker.unranked(host.reader, [], host.season, 'WR', SKILL_UNITS).some((p) => p.gsisId === RIDLEY), 'Ridley UR at every game');
});

// A backup's season: Tyson Bagent's 2025 (two relief appearances behind Caleb Williams), and Mac Jones's 2025
// playoffs (ranked in the regular season, a relief snap or two in the playoffs: unranked there)
const BAGENT = 'QB-4434153';
const MAC_JONES = 'QB-4241464';

test("nfl: a backup QB's season has a UR card: his stats from nflverse, a starter's own '-', never ranked or colored", async () => {
  const { engine, host, data } = await harness({ position: 'QB' });
  const cards = new engine.PlayerCards(host, data);
  assert.ok(await cards.openSeason(2025, BAGENT), 'his card opens');
  const card = cards.card;
  assert.equal(card.ur, true);
  assert.equal(card.rank, 0);
  assert.equal(card.player.name, 'Tyson Bagent');
  assert.ok(!card.list.includes(card.player), 'never put in the list');
  const stats = card.groups.flatMap((g) => g.stats);
  const shown = (key) => stats.find((s) => s.key === key)?.display;
  // (47 passing yards and 7 rushing: their total, the Combine setting's default)
  assert.equal(shown('totalYards'), '54');
  assert.equal(shown('compPct'), '75.0%');
  assert.equal(shown('rating'), '113.5');
  assert.equal(shown('winPct'), '-', 'no record as a starter');
  assert.ok(stats.every((s) => s.rank === null && s.pct === null && s.tint === null), 'no rank or color on a stat');
  // (his Career: 2025 a UR line)
  const lines = await engine.careerLines(data, host.season, 'QB', BAGENT);
  const line = lines.find((l) => l.season === 2025);
  assert.ok(line?.ur && line.rank === 0, '2025 UR on his Career tab');
  // (the QB tab never sees him: the ranked QBs are games.json's starters, as they were)
  assert.ok(!engine.SKILL_UNITS.QB.some((p) => p.ur), 'no unranked row among the QBs');
  const ranked = (await data.rows(2025)).QB;
  assert.ok(!ranked.some((p) => p.gsisId === BAGENT || p.ur), 'not among 2025 QBs');
  assert.deepEqual(
    ranked.map((p) => p.gsisId).sort(),
    readJson(path.join(NFL, 'seasons', '2025', 'games.json')).filter((qb) => qb.box).map((qb) => `QB-${qb.id}`).sort(),
    "2025's QBs are its starters",
  );
});

test("nfl: the table on 2025's playoffs: a UR card reads his playoffs (skill-players.ur.post.json), another season the regular season's", async () => {
  const { engine, host, data } = await harness({ position: 'QB', load: { season: 2025, part: 'post' } });
  assert.deepEqual([engine.dataSeason, engine.dataPart], [2025, 'post']);
  assert.ok(!host.playerList.some((p) => p.gsisId === MAC_JONES), 'not a playoff starter');
  const cards = new engine.PlayerCards(host, data);
  assert.ok(await cards.openSeason(2025, MAC_JONES), 'his playoff card opens');
  assert.equal(cards.card.ur, true);
  const stats = cards.card.groups.flatMap((g) => g.stats);
  assert.equal(stats.find((s) => s.key === 'totalYards').display, '11', 'his playoffs: 4 passing yards and 7 rushing');
  // (the data service's part: the table's for its season, the regular season for another; a part with no
  // file has no unranked rows)
  assert.ok((await data.unranked(2025)).QB.some((p) => p.gsisId === MAC_JONES));
  assert.ok(!(await data.unranked(2025, 'regular')).QB.some((p) => p.gsisId === MAC_JONES), 'ranked in the regular season');
  assert.ok((await data.unranked(2025, 'regular')).QB.some((p) => p.gsisId === BAGENT));
  assert.equal((await data.unrankedRow(2024, 'WR', RIDLEY))?.ur, undefined, 'another season: the regular season (2024 ranked)');
  assert.deepEqual(await data.unranked(engine.CURRENT_SEASON, 'post'), {}, 'no playoffs yet: none');
});

// The season being played the same way: the card's Career line (careerLines) ranks it as the grid first opens
// on its tab (currentGrid: the grid's own code at the default settings, the grades from other tabs counted),
// not the default ranking with those grades average. Checked against a fresh PositionService's grid, as the
// finished seasons are above, with the table on this season (its own rows) and on 2025 (this season's rows
// and files from the data service); and the table's grades are left as they were.
test("nfl: this season's Career line in the grid's own order, as it first opens (every tab's top 20, the table on it or on 2025)", async () => {
  globalThis.location ??= new URL('http://localhost/');
  globalThis.history ??= { replaceState: () => {} };
  const { engine, data } = await harness();
  const { TabRanker, StatReader, PositionService, SKILL_STATS, SKILL_UNITS, CURRENT_SEASON, skillGroups, presetWeights, emptyIn, careerLines } = engine;
  const tabs = Object.keys(SKILL_STATS);
  const positions = new PositionService();
  const grades = positions.sportChanged$.subscribe();
  const gridOf = (tab) => {
    const table = { position: tab, stats: SKILL_STATS[tab], groups: skillGroups(tab), hidden: {}, weights: presetWeights(tab, 'default') };
    const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, () => table, () => {});
    const list = ranker.listed(SKILL_UNITS, CURRENT_SEASON, tab);
    const reader = new StatReader({ position: tab, settings: positions.settings, rows: SKILL_UNITS, list, tableSeason: true, season: CURRENT_SEASON, empty: (key) => emptyIn(SKILL_UNITS[tab], key), weights: ranker.mixWeights(tab) });
    return ranker.ranked(reader, list, tab, SKILL_UNITS).map((p) => p.gsisId);
  };
  const grids = Object.fromEntries(tabs.map((tab) => [tab, gridOf(tab)]));
  // (each tab's careers read once)
  const careers = new Map();
  const cached = (service) => Object.assign(Object.create(service), { careers: (p) => (careers.has(p) ? careers.get(p) : careers.set(p, service.careers(p)).get(p)) });
  // (the Career line's top 20: everyone the season's rows have, by the rank on his line)
  const top20 = async (service, tableSeason, rows) => {
    const out = {};
    for (const tab of tabs) {
      const ranks = [];
      for (const p of rows[tab] ?? []) {
        const line = (await careerLines(service, tableSeason, tab, p.gsisId)).find((s) => s.season === CURRENT_SEASON);
        if (line?.rank > 0 && line.rank <= 20) ranks[line.rank - 1] = p.gsisId;
        if (line?.rank > 0) assert.equal(line.of, grids[tab].length, `${tab} ${p.gsisId}: out of the grid's list`);
      }
      out[tab] = ranks;
    }
    return out;
  };
  const onIt = await top20(cached(data), CURRENT_SEASON, SKILL_UNITS);
  for (const tab of tabs) {
    assert.ok(grids[tab].length >= 20, `${tab}: a list`);
    assert.deepEqual(onIt[tab], grids[tab].slice(0, 20), `${tab}: the top 20 in the grid's order`);
    // (the grid's ranking worked out its own grades: the table's are back, so the grid ranks as it did)
    assert.deepEqual(gridOf(tab), grids[tab], `${tab}: the table's grades put back`);
  }
  grades.unsubscribe();

  // The table on 2025: this season's rows and files from the data service, its grades its own
  await engine.loadData(2025, 'regular');
  engine.rebuildUnits();
  const service = new engine.SeasonDataService();
  const current = await service.rows(CURRENT_SEASON);
  const onAnother = await top20(cached(service), 2025, current);
  for (const tab of tabs) assert.deepEqual(onAnother[tab].map((id) => id.replace(/^QB-/, '')), grids[tab].slice(0, 20).map((id) => id.replace(/^QB-/, '')), `${tab} (the table on 2025): the top 20 in the grid's order`);
});
