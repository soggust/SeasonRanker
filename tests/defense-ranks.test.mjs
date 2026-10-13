// The NFL DEF tab's Pass D Rank and Run D Rank: the per-game splits update-data.mjs writes
// (defense-splits.mjs: sacks with the passes, QB scrambles with the runs, the offense's own touchdowns)
// and the league ranks the app works out from them by the Rank Base setting (team-grades.ts: 1 the
// least allowed, ties share a rank, a missing value has none), and its Def Rank (points allowed, the
// scoring defense, or yards allowed). Display only: not in the default ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defenseSplits } from '../apps/nfl/scripts/defense-splits.mjs';
import { loadEngine } from './support/engine.mjs';

const play = (fields) => ({ defteam: 'CLE', posteam: 'PIT', pass: '0', rush: '0', qb_scramble: '0', touchdown: '0', td_team: 'NA', yards_gained: '0', ...fields });

test('defense splits: sacks pass, scrambles run, only the offense\'s touchdowns, per game', () => {
  const plays = [
    play({ pass: '1', yards_gained: '20' }),
    play({ pass: '1', yards_gained: '-8' }), // a sack
    play({ pass: '1', qb_scramble: '1', yards_gained: '12' }), // a scramble: a run
    play({ rush: '1', yards_gained: '4' }),
    play({ pass: '1', yards_gained: '30', touchdown: '1', td_team: 'PIT' }),
    play({ rush: '1', yards_gained: '1', touchdown: '1', td_team: 'PIT' }),
    play({ pass: '1', yards_gained: '0', touchdown: '1', td_team: 'CLE' }), // a pick six: not allowed
    play({ defteam: 'PIT', posteam: 'CLE', pass: '1', yards_gained: '50' }), // the other side's
    play({ yards_gained: '40' }), // a punt
  ];
  assert.deepEqual(defenseSplits(plays, 'CLE', 2), {
    passYdsAllowedPerGame: 21,
    rushYdsAllowedPerGame: 8.5,
    passTdsAllowedPerGame: 0.5,
    rushTdsAllowedPerGame: 0.5,
    yardsAllowedPerGame: 29.5,
  });
  assert.deepEqual(Object.values(defenseSplits(plays, 'CLE', 0)), [null, null, null, null, null]);
});

test('Pass D / Run D Rank: ties share, nulls get none, by points (touchdowns) or yards', async () => {
  const { SPORT, SKILL_STATS, statGroup } = await loadEngine('nfl');
  const stat = (key) => SKILL_STATS.DEF.find((s) => s.key === key);
  const unit = (team, passYds, rushYds, passTds, rushTds, pts) => ({
    gsisId: `DEF-${team}`,
    name: team,
    teamLogo: team,
    games: 5,
    stats: {
      passYdsAllowedPerGame: passYds,
      rushYdsAllowedPerGame: rushYds,
      passTdsAllowedPerGame: passTds,
      rushTdsAllowedPerGame: rushTds,
      yardsAllowedPerGame: passYds === null ? null : passYds + rushYds,
      ptsAllowedPerGame: pts,
    },
  });
  const rows = [unit('A', 180, 120, 1.2, 0.4, 21.5), unit('B', 200, 90, 1.2, 0.8, 18), unit('C', 180, 140, 0.8, null, 21.5), unit('D', null, 100, null, 0.4, 25)];
  const ranks = (key, rankBasis) =>
    rows.map((row) => SPORT.computedValue(row, stat(key), { position: 'DEF', settings: { rankBasis, garbageTime: true }, rows: { DEF: rows }, tableSeason: true, defaults: false }));
  assert.deepEqual(ranks('passDefRank', 'yards'), [1, 3, 1, null]);
  assert.deepEqual(ranks('runDefRank', 'yards'), [3, 1, 4, 2]);
  assert.deepEqual(ranks('passDefRank', 'points'), [2, 2, 1, null]);
  assert.deepEqual(ranks('runDefRank', 'points'), [1, 3, null, 1]);
  // (Def Rank: the scoring defense by points, yards allowed in all by yards)
  assert.deepEqual(ranks('defRank', 'points'), [2, 1, 2, 4]);
  assert.deepEqual(ranks('defRank', 'yards'), [2, 1, 3, null]);
  // (the setting switched back: worked out again, not the other basis's cached)
  assert.deepEqual(ranks('passDefRank', 'yards'), [1, 3, 1, null]);
  // A season written before the splits: every rank by them "-", Def Rank by points as ever
  const old = rows.map((row) => ({ ...row, stats: { ptsAllowedPerGame: row.stats.ptsAllowedPerGame } }));
  const oldRank = (key, rankBasis) => SPORT.computedValue(old[1], stat(key), { position: 'DEF', settings: { rankBasis, garbageTime: true }, rows: { DEF: old }, tableSeason: true, defaults: false });
  assert.equal(oldRank('runDefRank', 'yards'), null);
  assert.equal(oldRank('defRank', 'yards'), null);
  assert.equal(oldRank('defRank', 'points'), 1);
  // In Results, each a slider (the owner's call: sorted by best pass or run D, weighted like any stat)
  for (const key of ['defRank', 'passDefRank', 'runDefRank']) {
    assert.ok(!stat(key).infoOnly && stat(key).format === 'rank' && stat(key).negative, `${key}: a scored rank, lower better`);
    assert.equal(statGroup(stat(key)), 'results', `${key}: not in Results`);
  }
  assert.equal(SPORT.statLabel(stat('passDefRank'), { rankBasis: 'points' }, 'DEF'), 'Pass D Rank (TDs)');
  assert.equal(SPORT.statLabel(stat('runDefRank'), { rankBasis: 'yards' }, 'DEF'), 'Run D Rank (Yds)');
  assert.equal(SPORT.statLabel(stat('defRank'), { rankBasis: 'points' }, 'DEF'), 'Def Rank (Pts)');
  assert.equal(SPORT.statName(stat('passDefRank'), 'DEF', { rankBasis: 'points' }), 'Pass Defense Rank (by Touchdowns)');
});
