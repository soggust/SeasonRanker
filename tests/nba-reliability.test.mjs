// The NBA's rates count in proportion to minutes a game (SPORT.reliability, unit-scoring.ts trust): a full
// share at 24 and above, half at 12, so a few garbage-time minutes can't make a ranking (the owner,
// 2026-11-04: a 2.5-minute guard #2 overall once the cap on scores came off). Per-game volume stats, a
// team's record and the support grades (settled) aren't scaled; a row without minutes isn't either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './support/engine.mjs';

const player = (name, games, minutes, stats) => ({ name, gsisId: name, games, stats: { minutes, ...stats } });

test('nba: a rate counts in proportion to minutes a game, full at 24; volume, the record and the grades in full', async () => {
  const { SPORT, SKILL_STATS, weightedTotals, DEFAULT_SETTINGS } = await loadEngine('nba');
  const stat = (key) => SKILL_STATS.PG.find((s) => s.key === key);
  assert.equal(SPORT.reliability(player('starter', 10, 360, {}), stat('per')), 1);
  assert.equal(SPORT.reliability(player('bench', 10, 120, {}), stat('per')), 0.5);
  assert.equal(SPORT.reliability(player('garbage', 2, 5, {}), stat('per')), 2.5 / 24);
  assert.equal(SPORT.reliability({ name: 'team', gsisId: 'TM-X', games: 10, stats: {} }, stat('per')), 1, 'a row without minutes');
  assert.equal(SPORT.reliability({ name: 'none', gsisId: 'n', games: 0, stats: { minutes: 0 } }, stat('per')), 1, 'no games yet');
  for (const key of ['winPct', 'teammates', 'coaching', 'ws', 'dws', 'vorp']) assert.equal(stat(key).settled, true, `${key} isn't his own sample`);
  for (const key of ['per', 'tsPct', 'usgPct', 'bpm', 'onOff', 'astPct']) assert.ok(stat(key).kind === 'efficiency' && !stat(key).settled, `${key} is scaled`);

  // Ten starters at 30 a game around PER 15 and two guards at 2.5 a game with PER 30: the same PER scores the
  // 30-minute one in full and the 2.5-minute one at about a tenth; points a game are left alone
  const pers = [10, 12, 13, 14, 15, 15, 16, 17, 18, 20];
  const list = [...pers.map((per, i) => player(`s${i}`, 10, 300, { per, points: 15 })), player('star', 10, 300, { per: 30, points: 25 }), player('garbage', 2, 5, { per: 30, points: 25 })];
  const stats = [stat('per'), stat('points')];
  const value = (u, s) => u.stats[s.key] ?? null;
  const totals = weightedTotals(list, stats, { per: 50, points: 50 }, value, SPORT.reliability, DEFAULT_SETTINGS);
  const parts = new Map();
  weightedTotals(list, stats, { per: 50, points: 50 }, value, SPORT.reliability, DEFAULT_SETTINGS, list, parts);
  const star = parts.get(list[10]);
  const garbage = parts.get(list[11]);
  assert.ok(Math.abs(garbage.get('per') / star.get('per') - 2.5 / 24) < 1e-9, `PER ${garbage.get('per')} against ${star.get('per')}`);
  assert.equal(garbage.get('points'), star.get('points'), 'points a game untouched');
  assert.ok(totals.get(list[10]) > totals.get(list[11]), 'the starter ranks above the garbage-time twin');
});
