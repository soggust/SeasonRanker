// The NFL QB's sheet (apps/nfl/scripts/analysis/qb-sheet.mjs): the numbers worked out for his report (a
// game's averages, a 17-game pace, his last 3 and 5 games against the season, the change from last season,
// the gap to the league, his line as a starter), so the weekly preview quotes them under the same rule as
// every other NFL report; who gets a season-end recap (4+ regular-season starts); the prompt, the check
// and the weekly jobs. No network and no calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asStarterOf, leagueAverageOf, lineOf, paceOf, perGameOf, qbModeOf, recentOf, startsOf, vsLastSeasonOf, vsLeagueOf, RECAP_MIN_STARTS } from '../apps/nfl/scripts/analysis/qb-sheet.mjs';
import { check, jobs, numbersIn, resolve, systemPrompt, QB_NUMBERS_RULE } from '../apps/nfl/scripts/analysis/analyze.mjs';

// A week of nflverse's weekly stats (its numbers as the CSV's strings), his team's result that game
const week = (n, { att = 30, cmp = 20, yds = 240, td = 2, int = 0, sacks = 2, sackYds = 12, epa = 6, cpoe = 3, car = 4, rush = 20, ppr = 20 } = {}, result = 'W') => ({
  week: String(n),
  game_id: `G${n}`,
  attempts: String(att),
  completions: String(cmp),
  passing_yards: String(yds),
  passing_tds: String(td),
  passing_interceptions: String(int),
  sacks_suffered: String(sacks),
  sack_yards_lost: String(sackYds),
  passing_epa: String(epa),
  passing_cpoe: String(cpoe),
  carries: String(car),
  rushing_yards: String(rush),
  rushing_tds: '0',
  fantasy_points_ppr: String(ppr),
  result,
});
// Five games: three good, then two bad (the last two), a loss and a tie among them
const SEASON = [week(1), week(2), week(3, {}, 'L'), week(4, { att: 40, cmp: 20, yds: 160, td: 0, int: 2, sacks: 5, epa: -12, cpoe: -6 }, 'L'), week(5, { att: 30, cmp: 15, yds: 150, td: 1, int: 1, sacks: 4, epa: -8, cpoe: -4 }, 'T')];

test('the recap: only with 4+ regular-season starts once his team is done; under that nothing (no more previews either)', () => {
  assert.equal(RECAP_MIN_STARTS, 4);
  assert.equal(qbModeOf(false, 0), 'preview', 'his team still playing: the preview, starts or not');
  assert.equal(qbModeOf(true, 4), 'recap');
  assert.equal(qbModeOf(true, 17), 'recap');
  assert.equal(qbModeOf(true, 3), null);
  assert.equal(qbModeOf(true, 0), null);
});

test("his starts: the regular-season games played with him the schedule's starter, home or away", () => {
  const g = (id, type, homeQbId, awayQbId, homeScore = 20) => ({ id, type, homeQbId, awayQbId, homeScore });
  const games = [g('a', 'REG', 'QB1', 'X'), g('b', 'REG', 'X', 'QB1'), g('c', 'REG', 'QB2', 'X'), g('d', 'WC', 'QB1', 'X'), g('e', 'REG', 'QB1', 'X', null)];
  assert.deepEqual(startsOf(games, 'QB1'), ['a', 'b'], 'not a playoff game, not one still to play');
});

test("a game's averages, ranked where asked; the 17-game pace", () => {
  const pg = perGameOf(SEASON, { passYards: (v) => [v, 3, 40] });
  assert.deepEqual(pg.passYards, [206, 3, 40]);
  assert.equal(pg.passTds, 1.4);
  assert.equal(pg.attempts, 32);
  assert.equal(pg.passEpa, -0.4);
  assert.deepEqual(paceOf(SEASON), { games: 17, passYards: 3502, passTds: 24, ints: 10, sacks: 51, rushYards: 340 });
  const line = lineOf(SEASON);
  assert.equal(line.weeks, 'W1-W5');
  assert.equal(line.record, '2-2-1');
  assert.equal(line.cmpAtt, '95/160');
  assert.equal(line.cmpPct, 59.4);
  assert.equal(line.ypa, 6.44);
  assert.equal(line.passEpa, -2);
});

test('his last 3 and 5 games against the season: none until he has played more; the change is the stretch minus the season', () => {
  assert.equal(recentOf(SEASON, 5), null, 'five games: the last 5 is the season');
  const last3 = recentOf(SEASON, 3);
  assert.equal(last3.weeks, 'W3-W5');
  assert.equal(last3.record, '0-2-1');
  assert.equal(last3.cmpAtt, '55/100');
  assert.equal(last3.passEpa, -14);
  assert.equal(last3.perGame.passYards, 183.3);
  // (the season 206 a game, the stretch 183.3: 22.7 fewer)
  assert.equal(last3.vsSeason.perGame.passYards, -22.7);
  assert.equal(last3.vsSeason.cmpPct, -4.4);
  assert.ok(last3.vsSeason.passEpaPerDropback < 0);
  // (out of order in, the last by week)
  assert.equal(recentOf([...SEASON].reverse(), 3).weeks, 'W3-W5');
});

test('as a starter: only when he also played in games he did not start', () => {
  assert.equal(asStarterOf(SEASON, SEASON.map((w) => w.game_id)), null);
  const s = asStarterOf(SEASON, ['G1', 'G2', 'G3']);
  assert.equal(s.starts, 3);
  assert.equal(s.record, '2-1');
  assert.equal(s.perGame.passYards, 240);
});

test('this season against his last: last year a game from its line, and the change', () => {
  const last = { season: 2025, games: 16, compPct: [65, 10, 60], ypa: [7.2, 12, 60], cpoe: [1.2, 20, 60], passYards: [3520, 15, 60], passTds: [24, 12, 60], ints: [8, 20, 60], rushYards: [160, 30, 60], timeToThrow: 2.8, aggressiveness: 15, badThrowPct: [0.15, 20, 60] };
  const v = vsLastSeasonOf({ rows: SEASON, tracking: { timeToThrow: 2.6, aggressivenessPct: 18 }, pressure: { badThrowPct: [12, 5, 36] } }, last);
  assert.equal(v.season, 2025);
  assert.equal(v.lastSeason.perGame.passYards, 220);
  assert.equal(v.lastSeason.badThrowPct, 15);
  assert.equal(v.change.perGame.passYards, -14, '206 a game now, 220 then');
  assert.equal(v.change.cmpPct, -5.6);
  assert.equal(v.change.timeToThrow, -0.2);
  assert.equal(v.change.aggressivenessPct, 3);
  assert.equal(v.change.badThrowPct, -3);
  assert.equal(vsLastSeasonOf({ rows: SEASON }, null), null, 'no line last season: nothing');
});

test("the league: the qualifiers' average and his gap to it", () => {
  const other = [week(1, { att: 30, cmp: 21, yds: 210, epa: 3 }), week(2, { att: 30, cmp: 21, yds: 210, epa: 3 })];
  const league = leagueAverageOf([SEASON, other]);
  assert.equal(league.passYardsPerGame, (206 + 210) / 2);
  const v = vsLeagueOf(SEASON, league);
  assert.equal(v.leagueAverage.passYardsPerGame, 208);
  assert.equal(v.overAverage.passYardsPerGame, -2);
  assert.equal(v.overAverage.cmpPct, Number((95 / 160 * 100 - (95 / 160 * 100 + 70) / 2).toFixed(1)));
});

test("the QB preview's rule: only the dossier's numbers, the arithmetic worked out in it, the thinking still his", () => {
  const p = systemPrompt({ player: {} });
  assert.ok(p.includes(QB_NUMBERS_RULE));
  assert.match(p, /don't add up, subtract, average or round/);
  assert.doesNotMatch(p, /directly derivable/);
  for (const block of ['season.perGame', 'season.pace17', 'season.recent', 'season.vsLastSeason', 'season.vsLeague', 'season.asStarter', 'epaTotal']) assert.ok(p.includes(block), block);
  assert.match(p, /about arithmetic, not about thinking/);
  assert.match(p, /take a clear position/);
  assert.match(p, /restOfSeason\.projections/);
  // (his recap reads the same blocks)
  assert.match(systemPrompt({ mode: 'recap', player: {} }), /season\.vsLastSeason/);
});

test("the check: a report's own projections are its to quote; a fraction as a whole percent; a path without its season.", () => {
  const dossier = { season: { totals: { passYards: 1030 }, pressure: { badThrowPct: [12.4, 5, 36] }, ranked: { cmpPct: [64.1, 9, 40] } }, splits: { short: { success: 0.432 } }, nextGame: { oppVsPosition: { targetShare: { TE: [0.21, 0.19] } } } };
  assert.ok(numbersIn(dossier).has(43), '.432 -> 43%');
  assert.deepEqual(resolve(dossier, 'pressure.badThrowPct'), { value: 12.4, rank: 5, of: 36 });
  assert.deepEqual(resolve(dossier, 'nextGame.oppVsPosition.targetShare.TE'), { value: 0.21 });
  const point = (p) => ({ title: 't', body: 'b', evidence: [{ label: 'l', path: p }] });
  const report = {
    headline: 'h',
    take: '1,030 yards, a 43% success rate short; 230-250 yards a game from here, 1,500 more by January.',
    strengths: [point('season.ranked.cmpPct')],
    concerns: [point('pressure.badThrowPct')],
    trend: { direction: 'steady', note: 'n' },
    nextGame: null,
    restOfSeason: { body: 'b', projections: [{ stat: 'Passing yards / game', low: 230, high: 250 }], swingFactors: [] },
  };
  assert.deepEqual(check(report, dossier), ['unmatched number: 1,500']);
});

test('the weekly jobs: a QB whose team is done with under 4 starts gets nothing, by --qbs or by name', () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'nfl-qb-jobs-'));
  writeFileSync(
    path.join(base, 'index.json'),
    JSON.stringify([
      { gsis: 'Q1', pos: 'QB', siteId: 'QB-1', name: 'Long Starter', mode: 'recap' },
      { gsis: 'Q2', pos: 'QB', siteId: 'QB-2', name: 'Spot Starter', mode: 'none' },
      { gsis: 'Q3', pos: 'QB', siteId: 'QB-3', name: 'Still Playing', mode: 'preview' },
    ]),
  );
  writeFileSync(path.join(base, 'team-index.json'), JSON.stringify([]));
  const dirs = { base, reportsDir: path.join(base, 'reports') };
  assert.deepEqual(jobs(['--qbs'], dirs).sort(), ['Q1', 'Q3']);
  assert.deepEqual(jobs(['spot'], dirs), []);
  assert.deepEqual(jobs(['still'], dirs), ['Q3']);
});
