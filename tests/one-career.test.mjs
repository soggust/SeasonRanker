// One career across the position tabs (libs/ranker/src/engine/career-index.ts): a player's seasons sit on
// whichever tab he played that year, but he's one player. The search finds him once ("LeBron James",
// "SF/PF/PG/SG/C"), opening on the tab he plays now (retired: the one he played most); his card's Career
// tab has every season on every tab, each ranked on its own tab and marked with it, and the history counts
// all of them; the compare view's season picker and arcs span them too. The NFL's QBs (ESPN ids) are tied
// to the same man's other rows by his headshot (Taysom Hill), MLB's hitting and pitching are two careers,
// linked (Ohtani), and MMA's fighters are one hit across their divisions, never a pound-for-pound copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SPORTS, loadEngine, readJson, seasonData, seasonDir, staticDir, unrankedService } from './support/engine.mjs';

const ENTRY = path.join(import.meta.dirname, 'support', 'career-entry.ts');
const engines = {};
const engineFor = (sport) => (engines[sport] ??= loadEngine(sport, { entry: ENTRY }));

const LEBRON = 'jamesle01';
const TAYSOM = { QB: 'QB-2468609', TE: '00-0033357' };

// The grid on a tab of the season being played, ranked with the default sliders (the card's and the compare
// view's host), and the data service on the static files (a file that isn't there reads empty)
async function harness(sport, position) {
  const engine = await engineFor(sport);
  const { TabRanker, StatReader, SKILL_STATS, skillGroups, presetWeights, emptyIn, SKILL_UNITS, CURRENT_SEASON, DEFAULT_SETTINGS, unitsForSeason, SPORT } = engine;
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
  const dir = staticDir(sport);
  const careersDir = path.join(dir, 'careers');
  const orEmpty = (file) => (fs.existsSync(path.join(careersDir, file)) ? readJson(path.join(careersDir, file)) : {});
  const rows = new Map();
  // (the careers files asked for, by tab)
  const asked = [];
  const data = {
    rows: async (season) => {
      if (season === CURRENT_SEASON) return SKILL_UNITS;
      if (!rows.has(season)) rows.set(season, unitsForSeason(seasonData(seasonDir(sport, season, CURRENT_SEASON), SPORT.dataFiles), season));
      return rows.get(season);
    },
    tabRows: async (season, p) => readJson(path.join(dir, 'seasons', String(season), 'units', `${p}.json`)),
    careers: async (p) => (asked.push(p), orEmpty(`${p}.json`)),
    careerNames: async () => orEmpty('names.json'),
    comps: async () => ({}),
    extraFile: async () => ({}),
    ...unrankedService(sport, CURRENT_SEASON),
  };
  return { engine, host, data, asked, careers: (p) => orEmpty(`${p}.json`) };
}

// Every finished season he has in the careers files, tab by tab: [tab, season, games, rank, of]
function careerFiles(careers, tabs, id) {
  return tabs.flatMap((tab) => (careers(tab)[id] ?? []).map(([season, , games, rank, of]) => [tab, season, games, rank, of]));
}

test('nba: "lebron james" is one search hit, his positions on it, opening on the tab he plays now', async () => {
  const { engine, host, data } = await harness('nba', 'PG');
  const compare = new engine.PlayerCompare(host, data);
  await compare.start([]);
  await compare.search('lebron james');
  const hits = compare.hits.filter((h) => h.name === 'LeBron James');
  assert.equal(hits.length, 1, `one LeBron, not one a position (${compare.hits.map((h) => `${h.name} ${h.tabLabel}`)})`);
  const [hit] = hits;
  // (SF the most seasons, then PF, then PG; SG and C one each, the better one first)
  assert.deepEqual(hit.tabLabel.split('/').slice(0, 3), ['SF', 'PF', 'PG']);
  assert.deepEqual(hit.tabLabel.split('/').sort(), ['C', 'PF', 'PG', 'SF', 'SG']);
  // (he plays now: this season's tab, his id there)
  const now = Object.entries(engine.SKILL_UNITS).find(([tab, rows]) => !['TOP'].includes(tab) && rows.some((p) => p.gsisId === LEBRON))?.[0];
  assert.equal(hit.position, now ?? 'SF');
  assert.equal(hit.id, LEBRON);
  // (every season on every tab, his rookie SG year among them)
  assert.deepEqual(new Set(hit.lines.map((l) => l.position)), new Set(['SG', 'SF', 'PF', 'PG', 'C']));
  assert.equal(hit.span.split('-')[0], '2004');
  assert.ok(hit.lines.some((l) => l.position === 'SG' && l.season === 2004));
  // (a pick: his current season, on that tab; again: the next one down on it)
  await compare.pick(hit);
  assert.equal(compare.sides[0].position, hit.position);
  assert.equal(compare.sides[0].season, engine.CURRENT_SEASON);
});

test('nba: LeBron\'s card has every season from every position in one Career, each ranked on its own tab', async () => {
  const { engine, host, data, careers, asked } = await harness('nba', 'SF');
  const files = careerFiles(careers, ['PG', 'SG', 'SF', 'PF', 'C'], LEBRON);
  assert.equal(new Set(files.map(([tab]) => tab)).size, 5, 'he played all five');
  const cards = new engine.PlayerCards(host, data);
  assert.ok(await cards.openSeason(engine.CURRENT_SEASON, LEBRON));
  for (let i = 0; i < 500 && !cards.card.seasons; i++) await new Promise((r) => setImmediate(r));
  const lines = cards.card.seasons;
  // (the careers files' seasons, every tab's, then this season)
  const finished = lines.filter((l) => l.season !== engine.CURRENT_SEASON);
  assert.deepEqual(
    finished.map((l) => [l.position, l.season, l.games, l.rank, l.of]),
    [...files].sort((a, b) => a[1] - b[1]),
    'every finished season, its tab, games and rank there',
  );
  assert.ok(lines.some((l) => l.season === engine.CURRENT_SEASON && l.position === 'SF'), 'and this season');
  assert.ok(lines.every((l) => l.id === LEBRON));
  // (oldest first, one line a season: he never played two tabs in one)
  assert.deepEqual(lines.map((l) => l.season), [...new Set(lines.map((l) => l.season))].sort((a, b) => a - b));
  // (the career's totals span every tab: his games, all of them)
  const games = lines.reduce((n, l) => n + l.games, 0);
  const nowGames = engine.SKILL_UNITS.SF.find((p) => p.gsisId === LEBRON).games;
  assert.equal(games, files.reduce((n, f) => n + f[2], 0) + nowGames);
  // (the headline stats of a PF season: the card's (SF's) columns, the ones the PF tab shares by key)
  const pf = lines.find((l) => l.position === 'PF');
  assert.equal(pf.stats.length, engine.headlineStats('SF').length);
  assert.ok(pf.stats.some((s) => s.value !== null), 'a PF season shows its stats');
  // (only the careers files of the tabs he played)
  assert.deepEqual([...new Set(asked)].sort(), ['C', 'PF', 'PG', 'SF', 'SG']);
  // (the Career tab ranks each season on its own tab with the sliders: a PF season among that year's PFs)
  cards.selectTab('seasons');
  for (let i = 0; i < 2000 && !lines.filter((l) => !l.ur).every((l) => l.yours); i++) await new Promise((r) => setImmediate(r));
  const pfList = host.seasonContext(pf.season, { PF: await data.tabRows(pf.season, 'PF') }, 'PF').list;
  assert.equal(pf.rank, pfList.findIndex((p) => p.gsisId === LEBRON) + 1, `${pf.season}: ranked among the PFs`);
  assert.equal(pf.of, pfList.length);
  // (the history's "Nth season" counts every one of them, all tabs)
  const stage = cards.card.overview.flags.find((f) => /season/.test(f.text) && /\(\d+(st|nd|rd|th) season|seasons since/.test(f.text));
  assert.ok(stage, `a career stage (${cards.card.overview.flags.map((f) => f.text)})`);
  assert.match(stage.text, new RegExp(`${lines.length}(st|nd|rd|th) season|${lines.length} seasons since`));
  // (a season on another tab opens his card there)
  assert.ok(await cards.openLine(pf));
  assert.equal(cards.tabPosition, 'PF');
  assert.equal(cards.card.season, pf.season);
  for (let i = 0; i < 500 && !cards.card.seasons; i++) await new Promise((r) => setImmediate(r));
  assert.equal(cards.card.seasons.length, lines.length, 'the same career from the PF card');
});

test('nba: a retired player on several tabs is one hit too, opening on the tab he played most', async () => {
  const { engine, host, data } = await harness('nba', 'PG');
  const compare = new engine.PlayerCompare(host, data);
  const entries = await compare.entries();
  const retired = entries.filter((e) => e.lines.length >= 4 && new Set(e.lines.map((l) => l.position)).size >= 2 && !e.lines.some((l) => l.season === engine.CURRENT_SEASON));
  assert.ok(retired.length > 50, `retired players on several tabs: ${retired.length}`);
  for (const e of retired) {
    const count = (tab) => e.lines.filter((l) => l.position === tab).length;
    const most = Math.max(...e.lines.map((l) => count(l.position)));
    assert.equal(count(e.position), most, `${e.name}: opens on his most-played tab (${e.tabLabel})`);
    assert.equal(e.tabLabel.split('/')[0], e.position, `${e.name}: that tab first`);
    assert.deepEqual(e.seasons, e.lines.filter((l) => l.position === e.position).map((l) => l.season), `${e.name}: the seasons a pick walks are that tab's`);
  }
});

test('every sport: one search entry a career, no tab id in two of them, no pooled-tab copies', async () => {
  for (const sport of SPORTS) {
    const { engine, host, data } = await harness(sport, Object.keys((await engineFor(sport)).SKILL_STATS)[0]);
    const compare = new engine.PlayerCompare(host, data);
    const entries = await compare.entries();
    const seen = new Map();
    for (const e of entries) {
      assert.ok(engine.careerGroup(e.position) !== null, `${sport}: ${e.name} on a pooled tab (${e.position})`);
      for (const l of e.lines) {
        const key = `${l.position}/${l.id}`;
        assert.ok(!seen.has(key) || seen.get(key) === e, `${sport}: ${key} in two entries`);
        seen.set(key, e);
      }
    }
  }
});

test('nfl: Taysom Hill\'s QB seasons (an ESPN id) and his TE ones are one career', async () => {
  const { engine, host, data, careers } = await harness('nfl', 'TE');
  const compare = new engine.PlayerCompare(host, data);
  await compare.start([]);
  await compare.search('taysom hill');
  const hits = compare.hits.filter((h) => h.name === 'Taysom Hill');
  assert.equal(hits.length, 1, 'one Taysom Hill');
  assert.equal(hits[0].tabLabel, 'TE/QB');
  const lines = await engine.careerLines(data, host.season, 'TE', TAYSOM.TE);
  const files = careerFiles(careers, ['QB', 'TE'], TAYSOM.TE).concat(careerFiles(careers, ['QB'], TAYSOM.QB));
  assert.deepEqual(
    lines.filter((l) => l.season !== engine.CURRENT_SEASON).map((l) => [l.position, l.season]).sort(),
    files.map(([tab, season]) => [tab, season]).sort(),
    'his TE and QB seasons',
  );
  // (his 2020 on both tabs: the TE card's first, each with its own id and rank)
  const y2020 = lines.filter((l) => l.season === 2020);
  assert.deepEqual(y2020.map((l) => [l.position, l.id]), [['TE', TAYSOM.TE], ['QB', TAYSOM.QB]]);
  assert.deepEqual(engine.seasonByYear(lines, 'TE').filter((l) => l.season === 2020).map((l) => l.position), ['TE'], 'once a year on the arcs');
  // (the same career from his QB card)
  const fromQb = await engine.careerLines(data, host.season, 'QB', TAYSOM.QB);
  assert.equal(fromQb.length, lines.length);
  // (someone else's name alone isn't him: Alex Smith the QB and Alex Smith the TE stay two)
  await compare.search('alex smith');
  assert.ok(compare.hits.filter((h) => h.name === 'Alex Smith').length >= 2, 'two Alex Smiths');
});

test('mlb: Ohtani\'s hitting and pitching are two careers, linked', async () => {
  const { engine, host, data } = await harness('mlb', 'DH');
  const compare = new engine.PlayerCompare(host, data);
  await compare.start([]);
  await compare.search('ohtani');
  const hits = compare.hits.filter((h) => h.name === 'Shohei Ohtani');
  assert.equal(hits.length, 2, 'a hitter and a pitcher');
  const hitter = hits.find((h) => h.id === 'H-660271');
  const pitcher = hits.find((h) => h.id === 'P-660271');
  assert.ok(hitter && pitcher);
  assert.ok(hitter.lines.every((l) => !['SP', 'RP'].includes(l.position)), 'his hitting career: no pitching tab');
  assert.ok(pitcher.lines.every((l) => ['SP', 'RP'].includes(l.position)));
  const linked = await engine.linkedCareers(data, host.season, hitter.position, hitter.id);
  assert.deepEqual(linked.map((l) => [l.label, l.id]), [['Pitching', 'P-660271']]);
  assert.ok(['SP', 'RP'].includes(linked[0].position) && linked[0].season >= 2018);
  const back = await engine.linkedCareers(data, host.season, pitcher.position, pitcher.id);
  assert.deepEqual(back.map((l) => [l.label, l.id]), [['Hitting', 'H-660271']]);
  // (a position player who moved around: one hitting career, every tab of it)
  const entries = await compare.entries();
  const movers = entries.filter((e) => e.tabLabel.includes('/') && e.lines.every((l) => !['SP', 'RP'].includes(l.position)));
  assert.ok(movers.length > 100, `hitters on several tabs: ${movers.length}`);
});

test('mma: a fighter in two divisions is one hit, never a pound-for-pound copy', async () => {
  const { engine, host, data } = await harness('mma', 'LW');
  const compare = new engine.PlayerCompare(host, data);
  await compare.start([]);
  await compare.search('max holloway');
  const hits = compare.hits.filter((h) => h.name === 'Max Holloway');
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].tabLabel.split('/').sort(), ['FW', 'LW']);
  assert.ok(!/P4P/.test(hits[0].tabLabel));
});
