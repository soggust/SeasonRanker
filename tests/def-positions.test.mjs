// The NFL's defensive player tabs (apps/nfl/src/sport/positions.ts: EDGE, DL, LB, CB and S under DEF, built
// by update-data.mjs defensePlayers): every tab in POSITIONS has its names, pace, stats and presets; every
// stat a defensive tab lists is on its built rows, in every season and part, null where a season has no
// source (snap counts before 2012, Pro Football Reference's charting before 2018) and never missing; a
// player is on one defensive tab a season; the presets are pure (one job each, no coverage weight on a pass
// rusher's); and the bar's family (SPORT.tabFamilies) names the five under DEF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expandRows, loadEngine, readJson, staticDir } from './support/engine.mjs';

const DEF_TABS = ['EDGE', 'DL', 'LB', 'CB', 'S'];
// What each source adds, and the first season it covers
const SNAP_STATS = ['snaps', 'snapPct'];
const PFR_STATS = ['pressures', 'hurries', 'pressureRate', 'missedTacklePct', 'targets', 'compPctAllowed', 'yardsAllowed', 'yardsPerTargetAllowed', 'tdsAllowed', 'passerRatingAllowed'];
const FIRST_SNAPS = 2013; // (nflverse's 2012 snap counts file is empty)
const FIRST_PFR = 2018;
// A tab's job: the stats that would be off its theme
const OFF_THEME = {
  passRusher: ['compPctAllowed', 'passerRatingAllowed', 'yardsPerTargetAllowed', 'tdsAllowed', 'targets', 'interceptions', 'passesDefended', 'tackles', 'tfl'],
  runStopper: ['sacks', 'pressures', 'hurries', 'pressureRate', 'interceptions', 'passesDefended'],
  playmaker: ['tackles', 'tfl', 'sacks', 'pressures', 'snapPct', 'missedTacklePct'],
  blitzer: ['tackles', 'tfl', 'compPctAllowed', 'passerRatingAllowed', 'interceptions', 'passesDefended'],
  lockdown: ['tackles', 'tfl', 'forcedFumbles', 'missedTacklePct', 'interceptions', 'passesDefended', 'sacks'],
  ballhawk: ['tackles', 'tfl', 'compPctAllowed', 'passerRatingAllowed', 'missedTacklePct', 'sacks'],
  enforcer: ['interceptions', 'passesDefended', 'compPctAllowed', 'passerRatingAllowed', 'targets'],
  coverage: ['tackles', 'tfl', 'sacks', 'pressures', 'forcedFumbles', 'missedTacklePct'],
  tackler: ['interceptions', 'passesDefended', 'compPctAllowed', 'passerRatingAllowed', 'sacks', 'pressures'],
};

const dir = staticDir('nfl');
const seasonDirs = () => [
  [2026, dir],
  ...fs
    .readdirSync(path.join(dir, 'seasons'))
    .filter((d) => /^\d{4}$/.test(d))
    .map((d) => [Number(d), path.join(dir, 'seasons', d)]),
];
const PARTS = ['skill-players.json', 'skill-players.post.json', 'skill-players.all.json'];

const ENTRY = path.join(import.meta.dirname, 'support', 'def-entry.ts');
let engine;
const engineFor = async () => (engine ??= await loadEngine('nfl', { entry: ENTRY }));

test('nfl: every tab in POSITIONS has its names, pace, stats and presets, the five defensive ones after DEF', async () => {
  const { POSITIONS, SKILL_STATS, SKILL_PRESETS, SPORT, PACE_GAMES, STAT_NAMES, DEF_PLAYER_TABS } = await engineFor();
  for (const tab of POSITIONS) {
    assert.ok(SPORT.positionNames[tab], `${tab}: positionNames`);
    assert.ok(SPORT.tabNames[tab], `${tab}: tabNames`);
    assert.ok(Array.isArray(SKILL_STATS[tab]) && SKILL_STATS[tab].length > 2, `${tab}: SKILL_STATS`);
    assert.ok(Array.isArray(SKILL_PRESETS[tab]) && SKILL_PRESETS[tab].length >= 2, `${tab}: presets`);
    // (every stat's full name for its hover, where the key's own label doesn't say it)
    for (const stat of SKILL_STATS[tab]) assert.ok(stat.label && stat.description, `${tab} ${stat.key}: label and description`);
  }
  assert.deepEqual(POSITIONS.slice(POSITIONS.indexOf('DEF'), POSITIONS.indexOf('DEF') + 6), ['DEF', ...DEF_TABS]);
  for (const tab of POSITIONS) assert.equal(PACE_GAMES[tab], 17, `${tab}: pace`);
  assert.deepEqual(DEF_PLAYER_TABS, DEF_TABS);
  for (const tab of DEF_TABS) for (const stat of SKILL_STATS[tab]) assert.ok(STAT_NAMES[stat.key] || stat.name, `${tab} ${stat.key}: a full name`);
  // The bar: the five sit under DEF in its sub-row, Team D first; the phone's groups name every tab once
  const family = SPORT.tabFamilies.find((f) => f.parent === 'DEF');
  assert.deepEqual(Object.keys(family.names), ['DEF', ...DEF_TABS]);
  assert.equal(family.names.DEF, 'Team D');
  assert.equal(family.label, 'Defense position');
  const grouped = SPORT.tabGroups.flatMap((g) => g.tabs);
  assert.deepEqual([...grouped].sort(), [...POSITIONS].sort(), 'tabGroups name every tab once');
});

test('nfl: a defensive tab lists only its own stats, Games first, snaps for context', async () => {
  const { SKILL_STATS } = await engineFor();
  for (const tab of DEF_TABS) {
    const stats = SKILL_STATS[tab];
    assert.equal(stats[0].key, 'games', `${tab}: Games first`);
    assert.ok(stats[0].infoOnly && stats[1].key === 'snaps' && stats[1].infoOnly, `${tab}: snaps for context`);
    assert.equal(new Set(stats.map((s) => s.key)).size, stats.length, `${tab}: no stat twice`);
    // Every "allowed" stat and the missed tackles count against him; the charted stats score average when PFR has no line
    for (const stat of stats) {
      if (/Allowed$|missedTacklePct/.test(stat.key)) assert.ok(stat.negative, `${tab} ${stat.key}: lower is better`);
      if ([...PFR_STATS, ...SNAP_STATS].includes(stat.key) && !stat.infoOnly) assert.ok(stat.missingIsAverage, `${tab} ${stat.key}: missing scores average`);
    }
  }
  const keys = (tab) => SKILL_STATS[tab].map((s) => s.key);
  assert.ok(!keys('EDGE').includes('compPctAllowed') && !keys('DL').includes('compPctAllowed'), 'no coverage on the front');
  assert.ok(keys('CB').includes('passerRatingAllowed') && keys('S').includes('passerRatingAllowed') && keys('LB').includes('passerRatingAllowed'));
  assert.ok(!keys('CB').includes('sacks') && keys('S').includes('sacks'), 'sacks on the safeties, not the corners');
});

test('nfl: the defensive presets are pure, one job each, DEFAULT every stat at 50', async () => {
  const { SKILL_STATS, SKILL_PRESETS, presetWeights } = await engineFor();
  for (const tab of DEF_TABS) {
    const stats = SKILL_STATS[tab].filter((s) => !s.infoOnly);
    const def = presetWeights(tab, 'default');
    for (const stat of stats) assert.equal(def[stat.key], 50, `${tab} DEFAULT ${stat.key}`);
    assert.ok(SKILL_PRESETS[tab].length >= 3, `${tab}: three jobs`);
    for (const preset of SKILL_PRESETS[tab]) {
      const weights = presetWeights(tab, preset.key);
      const named = Object.keys(preset.weights);
      for (const key of named) {
        assert.ok(stats.some((s) => s.key === key), `${tab} ${preset.label}: names ${key}, not on the tab`);
        assert.ok(preset.weights[key] > 0 && preset.weights[key] <= 100, `${tab} ${preset.label} ${key}: ${preset.weights[key]}`);
      }
      assert.ok(named.some((key) => preset.weights[key] === 100), `${tab} ${preset.label}: a lead at 100`);
      for (const stat of stats) if (!named.includes(stat.key)) assert.equal(weights[stat.key], 0, `${tab} ${preset.label}: ${stat.key} not 0`);
      for (const key of OFF_THEME[preset.key] ?? []) assert.ok(!(key in preset.weights), `${tab} ${preset.label}: ${key} is off its theme`);
    }
  }
});

test('nfl: every defensive tab is built for every season and part, each stat on every row, a player on one tab a season', async () => {
  const { SKILL_STATS } = await engineFor();
  const counts = {};
  for (const [season, where] of seasonDirs()) {
    for (const file of PARTS) {
      const full = path.join(where, file);
      if (!fs.existsSync(full)) continue;
      const rows = expandRows(readJson(full));
      const seen = new Map();
      for (const tab of DEF_TABS) {
        assert.ok(Array.isArray(rows[tab]) && rows[tab].length >= 20, `${season} ${file} ${tab}: ${rows[tab]?.length ?? 'no'} rows`);
        if (file === 'skill-players.json') counts[`${season} ${tab}`] = rows[tab].length;
        for (const row of rows[tab]) {
          assert.ok(row.gsisId && row.name && row.teamLogo && row.games > 0, `${season} ${file} ${tab}: ${row.name} incomplete`);
          assert.ok(!seen.has(row.gsisId), `${season} ${file}: ${row.name} on ${seen.get(row.gsisId)} and ${tab}`);
          seen.set(row.gsisId, tab);
          for (const stat of SKILL_STATS[tab]) {
            if (stat.key === 'games') continue;
            assert.ok(stat.key in row.stats, `${season} ${file} ${tab}: ${row.name} has no ${stat.key}`);
            const v = row.stats[stat.key];
            assert.ok(v === null || Number.isFinite(v), `${season} ${file} ${tab}: ${row.name} ${stat.key} = ${v}`);
          }
        }
        // The sources' first seasons: before them the column is empty for everyone (hidden in the app)
        for (const [keys, first] of [[SNAP_STATS, FIRST_SNAPS], [PFR_STATS, FIRST_PFR]]) {
          for (const key of keys) {
            if (!SKILL_STATS[tab].some((s) => s.key === key)) continue;
            const filled = rows[tab].filter((r) => r.stats[key] !== null).length;
            if (season < first) assert.equal(filled, 0, `${season} ${file} ${tab} ${key}: ${filled} rows have it before ${first}`);
            else if (file === 'skill-players.json') assert.ok(filled >= rows[tab].length * 0.5, `${season} ${tab} ${key}: only ${filled} of ${rows[tab].length} rows have it`);
          }
        }
      }
    }
  }
  // 2025's ranked pools, for the record
  assert.ok(counts['2025 EDGE'] >= 80 && counts['2025 CB'] >= 80 && counts['2025 S'] >= 60, JSON.stringify(counts).slice(0, 200));
});

test('nfl: the 2025 rows read right (Garrett an edge rusher with 23 sacks, Chris Jones inside, Sauce Gardner a corner)', () => {
  const rows = readJson(path.join(dir, 'seasons', '2025', 'skill-players.json'));
  const find = (tab, name) => rows[tab].find((r) => r.name === name);
  const garrett = find('EDGE', 'Myles Garrett');
  assert.ok(garrett, 'Garrett on EDGE');
  assert.equal(garrett.stats.sacks, 23);
  assert.ok(garrett.stats.pressures > 40 && garrett.stats.pressureRate > 0.04 && garrett.stats.snapPct > 0.7);
  assert.equal(garrett.stats.splashPlays, garrett.stats.sacks + garrett.stats.interceptions + garrett.stats.forcedFumbles + garrett.stats.passesDefended);
  assert.ok(find('DL', 'Chris Jones') && find('CB', 'Sauce Gardner') && find('LB', 'Zaire Franklin'));
  const sauce = find('CB', 'Sauce Gardner');
  assert.ok(sauce.stats.targets > 20 && sauce.stats.compPctAllowed > 0 && sauce.stats.compPctAllowed < 1 && sauce.stats.passerRatingAllowed > 0);
  // (a UR season sits in the unranked file, marked, with the same stats)
  const ur = readJson(path.join(dir, 'seasons', '2025', 'skill-players.ur.json'));
  for (const tab of DEF_TABS) {
    assert.ok(Array.isArray(ur[tab]) && ur[tab].length > 0 && ur[tab].every((r) => r.ur === true && 'tackles' in r.stats), `${tab}: UR rows`);
    const ranked = new Set(rows[tab].map((r) => r.gsisId));
    assert.ok(ur[tab].every((r) => !ranked.has(r.gsisId)), `${tab}: a UR row that's ranked`);
  }
});
