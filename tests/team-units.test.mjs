// The NFL's Team Offense and Team Special Teams tabs (apps/nfl/src/sport/positions.ts OFF and ST, built by
// update-data.mjs offenseUnits and specialTeamsUnits, backfilled to 2000): every team of the season is a
// row in every part, each stat the tab lists is on every row (the play-by-play has every one of them back
// to 2000: nothing is thin), what's lower-is-better counts against the unit, the ranks are worked out in
// the app (RANK_METRICS: the offense's by the Rank Base setting, the special teams' by EPA), the presets
// are pure (one job each, unnamed stats 0, nothing off its theme) and DEFAULT is every stat at 50.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, staticDir } from './support/engine.mjs';

const TABS = ['OFF', 'ST'];
const dir = staticDir('nfl');
const seasonDirs = () => [
  [2026, dir],
  ...fs
    .readdirSync(path.join(dir, 'seasons'))
    .filter((d) => /^\d{4}$/.test(d))
    .map((d) => [Number(d), path.join(dir, 'seasons', d)]),
];
const PARTS = ['skill-players.json', 'skill-players.post.json', 'skill-players.all.json'];
// Lower is better: against the unit
const AGAINST = { OFF: ['giveaways', 'sacksAllowed'], ST: ['oppReturnAvg', 'kicksBlocked'] };
// A preset's job: the stats off its theme
const OFF_THEME = {
  passing: ['rushEpa', 'rushYdsPerGame', 'rushOffRank', 'giveaways', 'ptsPerGame', 'redZoneTdPct'],
  rushing: ['passEpa', 'passYdsPerGame', 'passOffRank', 'sacksAllowed', 'giveaways', 'ptsPerGame'],
  scoring: ['giveaways', 'sacksAllowed', 'passEpa', 'rushEpa', 'passOffRank', 'rushOffRank'],
  ballSecurity: ['ptsPerGame', 'passEpa', 'rushEpa', 'offRank', 'passOffRank', 'rushOffRank', 'redZoneTdPct'],
  kicking: ['netAvg', 'inside20Pct', 'puntEpa', 'kickReturnAvg', 'puntReturnAvg', 'returnEpa', 'oppReturnAvg', 'kickoffEpa'],
  punting: ['fgPct', 'fgMade', 'patPct', 'fgEpa', 'kickReturnAvg', 'puntReturnAvg', 'returnEpa', 'oppReturnAvg', 'kickoffEpa'],
  returns: ['fgPct', 'fgMade', 'patPct', 'fgEpa', 'netAvg', 'inside20Pct', 'puntEpa', 'oppReturnAvg', 'kickoffEpa'],
  coverage: ['fgPct', 'fgMade', 'patPct', 'fgEpa', 'netAvg', 'inside20Pct', 'kickReturnAvg', 'puntReturnAvg', 'returnEpa', 'returnTds'],
};

const ENTRY = path.join(import.meta.dirname, 'support', 'def-entry.ts');
let engine;
const engineFor = async () => (engine ??= await loadEngine('nfl', { entry: ENTRY }));

test('nfl: OFF and ST are team tabs with their names, pace, stats and presets, each in its family', async () => {
  const { POSITIONS, SKILL_STATS, SKILL_PRESETS, SPORT, PACE_GAMES, STAT_NAMES, RANK_METRICS, rankBasisShort, rankBasisLabel, statGroup } = await engineFor();
  assert.deepEqual(POSITIONS, ['TM', 'OFF', 'QB', 'RB', 'WR', 'TE', 'OL', 'DEF', 'EDGE', 'DL', 'LB', 'CB', 'S', 'ST', 'K', 'P', 'HC']);
  for (const tab of TABS) {
    assert.ok(SPORT.teamTabs.includes(tab), `${tab}: a team tab`);
    assert.equal(PACE_GAMES[tab], 17);
    assert.ok(SKILL_PRESETS[tab].length === 4, `${tab}: four presets`);
    const stats = SKILL_STATS[tab];
    assert.equal(stats[0].key, 'games');
    assert.equal(new Set(stats.map((s) => s.key)).size, stats.length, `${tab}: no stat twice`);
    for (const stat of stats) {
      assert.ok(stat.label && stat.description, `${tab} ${stat.key}: label and description`);
      assert.ok(STAT_NAMES[stat.key] || stat.name || /[a-z] [A-Z%]/.test(stat.label) || stat.label.length > 6, `${tab} ${stat.key}: a full name for its hover`);
      if (AGAINST[tab].includes(stat.key)) assert.ok(stat.negative && !stat.support, `${tab} ${stat.key}: lower is better`);
      // (a rank is read, lower the better, in Results; a league rank isn't a stat to double up on)
      if (stat.format === 'rank') {
        assert.ok(stat.negative && stat.key in RANK_METRICS, `${tab} ${stat.key}: a rank from RANK_METRICS`);
        assert.equal(statGroup(stat), 'results');
      }
    }
  }
  assert.equal(SPORT.positionNames.OFF, 'Offense');
  assert.equal(SPORT.positionNames.ST, 'Special Teams');
  assert.equal(SPORT.rowHeader('OFF'), 'Offense');
  assert.equal(SPORT.rowHeader('ST'), 'Special Teams');
  // The offense's ranks go by the Rank Base setting (touchdowns standing in for points on the pass and run
  // splits, as the defenses'); the special teams' by EPA either way
  assert.deepEqual(RANK_METRICS.passOffRank, { points: ['passTdsPerGame', true], yards: ['passYdsPerGame', true] });
  assert.deepEqual(RANK_METRICS.rushOffRank, { points: ['rushTdsPerGame', true], yards: ['rushYdsPerGame', true] });
  assert.deepEqual(RANK_METRICS.stRank.points, RANK_METRICS.stRank.yards);
  assert.equal(rankBasisShort('passOffRank', 'points'), 'TDs');
  assert.equal(rankBasisShort('offRank', 'yards'), 'Yds');
  assert.equal(rankBasisShort('stRank', 'points'), 'EPA');
  assert.equal(rankBasisLabel('stRank', 'yards'), 'EPA per Play');
  assert.equal(rankBasisLabel('rushOffRank', 'points'), 'Touchdowns');
});

test('nfl: the OFF and ST presets are pure, one job each, DEFAULT every stat at 50', async () => {
  const { SKILL_STATS, SKILL_PRESETS, presetWeights } = await engineFor();
  for (const tab of TABS) {
    const stats = SKILL_STATS[tab].filter((s) => !s.infoOnly);
    const def = presetWeights(tab, 'default');
    for (const stat of stats) assert.equal(def[stat.key], 50, `${tab} DEFAULT ${stat.key}`);
    for (const preset of SKILL_PRESETS[tab]) {
      const weights = presetWeights(tab, preset.key);
      const named = Object.keys(preset.weights);
      assert.ok(named.length >= 3, `${tab} ${preset.label}: names its theme`);
      for (const key of named) {
        assert.ok(stats.some((s) => s.key === key), `${tab} ${preset.label}: names ${key}, not on the tab`);
        assert.ok(preset.weights[key] > 0 && preset.weights[key] <= 100, `${tab} ${preset.label} ${key}: ${preset.weights[key]}`);
      }
      assert.ok(named.some((key) => preset.weights[key] === 100), `${tab} ${preset.label}: a lead at 100`);
      // (a stat beside the theme, not of it, at a token 10 at most)
      assert.ok(named.filter((key) => preset.weights[key] <= 10).length <= 1, `${tab} ${preset.label}: one token at most`);
      for (const stat of stats) if (!named.includes(stat.key)) assert.equal(weights[stat.key], 0, `${tab} ${preset.label}: ${stat.key} not 0`);
      for (const key of OFF_THEME[preset.key]) assert.ok(!(key in preset.weights), `${tab} ${preset.label}: ${key} is off its theme`);
      assert.ok(!('defense' in preset.weights) && !('coaching' in preset.weights), `${tab} ${preset.label}: no support grade`);
    }
  }
});

test('nfl: every team is an OFF and an ST row in every season and part, every stat on every row', async () => {
  const { SKILL_STATS } = await engineFor();
  for (const [season, where] of seasonDirs()) {
    for (const file of PARTS) {
      const full = path.join(where, file);
      if (!fs.existsSync(full)) continue;
      const rows = readJson(full);
      const teams = season <= 2001 ? 31 : 32;
      for (const tab of TABS) {
        assert.ok(Array.isArray(rows[tab]), `${season} ${file}: no ${tab}`);
        // (the regular season and both: every team; the playoffs: the 12 or 14 in them)
        if (file === 'skill-players.post.json') assert.ok(rows[tab].length >= 12 && rows[tab].length <= 14, `${season} playoffs ${tab}: ${rows[tab].length} rows`);
        else assert.equal(rows[tab].length, teams, `${season} ${file} ${tab}: ${rows[tab].length} rows`);
        const ids = new Set();
        for (const row of rows[tab]) {
          assert.match(row.gsisId, new RegExp(`^${tab}-[A-Z]{2,3}$`), `${season} ${file} ${tab}: ${row.gsisId}`);
          assert.ok(!ids.has(row.gsisId), `${season} ${file} ${tab}: ${row.gsisId} twice`);
          ids.add(row.gsisId);
          assert.ok(row.id === null && row.name && row.teamLogo && Number.isInteger(row.games) && row.games > 0, `${season} ${file} ${tab}: ${row.name} incomplete`);
          for (const stat of SKILL_STATS[tab]) {
            if (stat.key === 'games' || stat.format === 'rank' || stat.support) continue;
            assert.ok(stat.key in row.stats, `${season} ${file} ${tab}: ${row.name} has no ${stat.key}`);
            // (a rate with nothing under it is null: a team out of the playoffs after a game without an extra
            // point try has no XP %; the full season has every one)
            const v = row.stats[stat.key];
            assert.ok(Number.isFinite(v) || (v === null && file === 'skill-players.post.json'), `${season} ${file} ${tab}: ${row.name} ${stat.key} = ${v}`);
          }
          // (the ranks' bases, which the app ranks on, are on the row too; the offense has its garbage-time copy)
          if (tab === 'OFF') {
            for (const key of ['passYdsPerGame', 'rushYdsPerGame', 'passTdsPerGame', 'rushTdsPerGame']) assert.ok(Number.isFinite(row.stats[key]), `${season} ${tab} ${row.name} ${key}`);
            assert.ok(row.competitive && 'epaPerPlay' in row.competitive && 'giveaways' in row.competitive, `${season} ${tab} ${row.name}: competitive`);
          } else {
            assert.ok(!('competitive' in row), `${season} ${tab} ${row.name}: special teams have no garbage time`);
          }
        }
      }
    }
  }
});

test('nfl: the 2025 rows read right (the Lions scored, every offense took a sack, the kickers made most of theirs)', () => {
  const rows = readJson(path.join(dir, 'seasons', '2025', 'skill-players.json'));
  const lions = rows.OFF.find((r) => r.gsisId === 'OFF-DET');
  assert.ok(lions.stats.ptsPerGame > 25 && lions.stats.passYdsPerGame > 200 && lions.stats.epaPerPlay > 0, JSON.stringify(lions.stats));
  assert.ok(Math.abs(lions.stats.passYdsPerGame + lions.stats.rushYdsPerGame - lions.stats.yardsPerGame) < 0.2, 'the splits add up');
  for (const r of rows.OFF) {
    assert.ok(r.stats.sacksAllowed > 0 && r.stats.giveaways > 0 && r.stats.successRate > 0.3 && r.stats.successRate < 0.6, r.name);
    assert.ok(r.stats.playsPerGame > 50 && r.stats.playsPerGame < 80 && r.stats.topPerGame > 24 && r.stats.topPerGame < 36, `${r.name} pace`);
  }
  for (const r of rows.ST) {
    assert.ok(r.stats.fgPct > 0.6 && r.stats.fgPct <= 1 && r.stats.patPct > 0.8 && r.stats.patPct <= 1, `${r.name} kicking`);
    assert.ok(r.stats.netAvg > 35 && r.stats.netAvg < 50 && r.stats.inside20Pct > 0.2, `${r.name} punting`);
    assert.ok(r.stats.kickReturnAvg > 15 && r.stats.kickReturnAvg < 40 && r.stats.puntReturnAvg >= 0 && r.stats.puntReturnAvg < 25, `${r.name} returns`);
    assert.ok(r.stats.oppReturnAvg > 5 && r.stats.oppReturnAvg < 35, `${r.name} coverage`);
    assert.ok(Math.abs(r.stats.stEpaPerPlay) < 0.5 && Math.abs(r.stats.kickoffEpa) < 1, `${r.name} EPA`);
  }
  // (every block made was a kick blocked against someone; a kickoff's EPA is the receiving team's, so the
  // kicking teams' average is under zero)
  const sum = (key) => rows.ST.reduce((a, r) => a + r.stats[key], 0);
  assert.ok(sum('kickoffEpa') < 0, 'kickoffs read from the kicking side');
  assert.equal(sum('blocksMade'), sum('kicksBlocked'));
  assert.equal(sum('returnTds') > 0, true);
});
