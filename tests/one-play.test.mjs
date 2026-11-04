// A stat counted in whole plays (a volume stat shown as a whole number) is read with a spread of at least one
// play (unit-scoring.ts weightedTotals onePlay; the list's median): with nearly everyone at 0, one play was worth
// seven standard deviations (the owner, 2026-11-04: Devin Lloyd's one defensive TD at +7.62 among 177
// linebackers). Nothing is capped: three plays score three. One play is 1 on season totals; per game, 1 over his
// games; at a full season's pace, the pace over them (StatReader.onePlay), and the ranker hands it over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const unit = (name, games, v) => ({ name, gsisId: name, games, stats: { tds: v, yards: v * 10 + 0.5 } });

test('a whole-number volume stat: a spread of at least one play; a fractional stat as it is; three plays score three', async () => {
  const { weightedTotals, DEFAULT_SETTINGS } = await loadEngine('nfl');
  const tds = { key: 'tds', label: 'TDs', kind: 'volume', format: 'int' };
  const yards = { key: 'yards', label: 'Yds', kind: 'volume', format: 'dec1' };
  // (twenty at 0, one at 1, one at 3: the standard deviation is 0.64 of a touchdown)
  const list = [...Array.from({ length: 20 }, (_, i) => unit(`z${i}`, 10, 0)), unit('one', 10, 1), unit('three', 10, 3)];
  const value = (u, s) => u.stats[s.key];
  const parts = new Map();
  weightedTotals(list, [tds, yards], { tds: 50, yards: 50 }, value, null, DEFAULT_SETTINGS, list, parts);
  const vals = list.map((u) => u.stats.tds);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  assert.ok(sd < 1, `sd ${sd}`);
  const one = parts.get(list[20]);
  const three = parts.get(list[21]);
  assert.ok(Math.abs(one.get('tds') - (1 - mean)) < 1e-9, `one TD ${one.get('tds')}: read over one play, not ${(1 - mean) / sd}`);
  assert.ok(Math.abs(three.get('tds') - (3 - mean)) < 1e-9, 'three: three times as far, no cap');
  // (yards: a fractional stat, the plain standard score even at this spread)
  const yv = list.map((u) => u.stats.yards);
  const ym = yv.reduce((a, b) => a + b, 0) / yv.length;
  const ysd = Math.sqrt(yv.reduce((a, b) => a + (b - ym) ** 2, 0) / yv.length);
  assert.ok(Math.abs(one.get('yards') - (10.5 - ym) / ysd) < 1e-9, 'a fractional stat is not floored');
  // (a wide stat is left alone: the floor only lifts a spread under one play)
  const wide = Array.from({ length: 10 }, (_, i) => unit(`w${i}`, 10, i * 3));
  const wp = new Map();
  weightedTotals(wide, [tds], { tds: 50 }, value, null, DEFAULT_SETTINGS, wide, wp);
  const wv = wide.map((u) => u.stats.tds);
  const wm = wv.reduce((a, b) => a + b, 0) / wv.length;
  const wsd = Math.sqrt(wv.reduce((a, b) => a + (b - wm) ** 2, 0) / wv.length);
  assert.ok(Math.abs(wp.get(wide[9]).get('tds') - (27 - wm) / wsd) < 1e-9);
  // (per game: one play is the list's median of 1 over games)
  const pp = new Map();
  weightedTotals(list, [tds], { tds: 50 }, (u, s) => u.stats[s.key] / u.games, null, DEFAULT_SETTINGS, list, pp, undefined, undefined, (u) => 1 / u.games);
  assert.ok(Math.abs(pp.get(list[20]).get('tds') - (0.1 - mean / 10) / 0.1) < 1e-9, 'per game: floored at one over ten games');
});

test('StatReader.onePlay: 1 on totals, 1 over his games per game, the pace over them at pace; the ranker hands it over', async () => {
  const { StatReader, SKILL_STATS, DEFAULT_SETTINGS } = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'skills-entry.ts') });
  const stat = SKILL_STATS.LB.find((s) => s.key === 'defTds');
  const pct = SKILL_STATS.LB.find((s) => s.kind !== 'volume');
  const player = { name: 'x', gsisId: 'x', games: 6, stats: { defTds: 1 } };
  const reader = (statBasis) => new StatReader({ position: 'LB', settings: { ...DEFAULT_SETTINGS, statBasis }, rows: { LB: [player] }, list: [player], tableSeason: true, season: 2026, empty: () => false, weights: {} });
  assert.equal(reader('season').onePlay(player, stat), 1);
  assert.equal(reader('perGame').onePlay(player, stat), 1 / 6);
  assert.equal(reader('pace17').onePlay(player, stat), reader('pace17').value(player, stat), 'his one TD at pace is what one play shows');
  assert.equal(reader('perGame').onePlay(player, stat), reader('perGame').value(player, stat));
  assert.equal(reader('perGame').onePlay(player, pct), 1, 'not a volume stat: as it is');
  assert.equal(reader('perGame').onePlay({ ...player, games: 0 }, stat), 1, 'no games yet');
  const ranker = fs.readFileSync(path.join(import.meta.dirname, '..', 'libs/ranker/src/engine/skill-rankings/tab-ranker.ts'), 'utf8');
  assert.ok(/adjustFor\(position, mix\), \(player, stat\) => reader\.onePlay\(player, stat\)\)/.test(ranker), 'the ranker passes onePlay');
});
