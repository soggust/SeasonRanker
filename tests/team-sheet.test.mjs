// The MLB, NBA and NHL team sheets' worked-out numbers (libs/ranker/scripts/analysis/dossier.mjs), so a
// report quotes them instead of computing them: a stretch of games and the last 5 and 10 against the
// season, a game's scoring ranked and against the league, the games left and the pace, the league's
// average of a stat and the gap to it, the goalies' saves and shots; and the check and the prompt that go
// with them (analyze.mjs). No network and no calls: plain data in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, numbersIn, resolve, systemPrompt } from '../libs/ranker/scripts/analysis/analyze.mjs';
import { gapTo, leagueAverage, recentOf, savesOf, SPORTS, stretchOf, totalsOf } from '../libs/ranker/scripts/analysis/dossier.mjs';
import { gameOf } from '../libs/ranker/scripts/analysis/season-state.mjs';

const g = (score, result, ot = false, date = '2026-10-01') => ({ date, score, result, ...(ot ? { ot: true } : {}) });

test("a stretch: the NHL's W-L-OTL (an overtime loss by its ot), points and points %; elsewhere W-L and win %", () => {
  const games = [g('3-2', 'W', true, '2026-10-01'), g('2-3', 'L', true, '2026-10-03'), g('1-4', 'L', false, '2026-10-05'), g('5-1', 'W', false, '2026-10-07')];
  const s = stretchOf(games, SPORTS.nhl);
  assert.equal(s.record, '2-1-1');
  assert.equal(s.standingsPoints, 5);
  assert.equal(s.pointsPct, 0.625);
  assert.deepEqual([s.from, s.to, s.goalsScored, s.goalsAllowed, s.differential], ['2026-10-01', '2026-10-07', 11, 10, 1]);
  assert.deepEqual([s.scoredPerGame, s.allowedPerGame, s.differentialPerGame], [2.75, 2.5, 0.25]);
  // (an extra-innings loss is a loss)
  const m = stretchOf(games, SPORTS.mlb);
  assert.equal(m.record, '2-2');
  assert.equal(m.winPct, 0.5);
  assert.equal(m.standingsPoints, undefined);
});

test('the last 5 and 10: only once more games are played, each against the season', () => {
  const played = [...Array(8)].map((_, i) => g(i < 3 ? '1-4' : '4-1', i < 3 ? 'L' : 'W'));
  const r = recentOf(played, SPORTS.nhl);
  assert.deepEqual(Object.keys(r), ['last5']);
  assert.equal(r.last5.record, '5-0-0');
  // (the season: 5-3, 23-17 in goals, 2.88 and 2.13 a game as shown; the last five: 20-5, 4 and 1)
  assert.deepEqual(r.last5.vsSeason, { pointsPct: 0.375, scoredPerGame: 1.12, allowedPerGame: -1.13, differentialPerGame: 2.25 });
  assert.equal(recentOf(played.slice(0, 5), SPORTS.nhl).last5, undefined);
  const nba = recentOf([...Array(12)].map(() => g('110-100', 'W')), SPORTS.nba);
  assert.deepEqual(Object.keys(nba), ['last5', 'last10']);
  assert.equal(nba.last10.winPct, 1);
  assert.equal(nba.last10.vsSeason.winPct, 0);
});

test("the season's totals: a game's scoring ranked and against the league, the games left, the pace", () => {
  const played = [g('4-2', 'W'), g('1-3', 'L'), g('3-2', 'W', true), g('2-3', 'L', true)];
  const rank = (low) => (v) => [v, low ? 3 : 2, 32];
  const league = { rank: { scoredPerGame: rank(false), allowedPerGame: rank(true), differentialPerGame: rank(false) }, average: 3.1 };
  const t = totalsOf({ played, stats: { wins: 2, losses: 1, ties: 1 }, cfg: SPORTS.nhl, league });
  const rs = t.regularSeason;
  assert.deepEqual(rs.scoredPerGame, [2.5, 2, 32]);
  assert.deepEqual(rs.allowedPerGame, [2.5, 3, 32]);
  assert.deepEqual(rs.differentialPerGame, [0, 2, 32]);
  assert.deepEqual(rs.vsLeague, { leaguePerGame: 3.1, scoredPerGame: -0.6, allowedPerGame: -0.6 });
  assert.equal(rs.standingsPoints, 5);
  assert.equal(rs.seasonGames, 82);
  assert.equal(rs.gamesLeft, 78);
  // (2 wins and 5 points in 4 games, over 82)
  assert.deepEqual(rs.pace, { wins: 41, standingsPoints: 103, differential: 0 });
  // the recent block once there are more than 5 games; none of it once the regular season is over
  assert.equal(t.recent, undefined);
  const over = totalsOf({ played, stats: { wins: 2, losses: 1, ties: 1 }, cfg: SPORTS.nhl, over: true });
  assert.equal(over.regularSeason.gamesLeft, undefined);
  assert.equal(over.regularSeason.pace, undefined);
  // MLB: the run differential's pace over 162
  const mlb = totalsOf({ played: [g('6-2', 'W'), g('3-4', 'L')], stats: { wins: 1, losses: 1 }, cfg: SPORTS.mlb });
  assert.deepEqual(mlb.regularSeason.pace, { wins: 81, differential: 243 });
  assert.equal(mlb.regularSeason.gamesLeft, 160);
});

test("the league's average and the gap to it; a stat centered on 0 has none", () => {
  assert.equal(Math.round(leagueAverage([0.8, 0.82, null, 0.78]) * 1000) / 1000, 0.8);
  assert.equal(leagueAverage([1.2, -0.8, -0.4]), null);
  assert.equal(leagueAverage([]), null);
  assert.deepEqual(gapTo(0.905, 0.8), { league: 0.8, gap: 0.105 });
  assert.deepEqual(gapTo(113, 115.83), { league: 115.8, gap: -2.8 });
  assert.equal(gapTo(null, 1), null);
});

test("the goalies' saves and the shots they faced, each one's saves over his save %", () => {
  const sv = savesOf([{ stats: { saves: 115, savePct: 0.906 } }, { stats: { saves: 65, savePct: 0.903 } }, { stats: { saves: null, savePct: null } }]);
  assert.deepEqual(sv, { saves: 180, shots: 199 });
  assert.equal(Math.round((sv.saves / sv.shots) * 1000) / 1000, 0.905);
});

test("ESPN's game: the periods played, so a team's side knows overtime", () => {
  const e = { id: 1, date: '2026-10-10T02:00Z', competitions: [{ status: { period: 4, type: { completed: true } }, competitors: [] }] };
  assert.equal(gameOf(e).periods, 4);
  assert.equal(gameOf({ id: 2, competitions: [{}] }).periods, null);
});

// A sheet with the new blocks, as the check reads it
const sheet = {
  season: {
    team: { record: '6-2-0', pdo: 100.9, pkPct: [0.8, 17, 32] },
    finishing: { shPct: [0.118, 15, 32], svPct: [0.905, 8, 32], pdoAll: [102.2, 14, 32] },
    vsLeague: { pkPct: { league: 0.796, gap: 0.004 } },
  },
  history: [{ season: '2025-26', record: '39-26-17', standingsPoints: 95 }],
  totals: { regularSeason: { games: 8, seasonGames: 82, gamesLeft: 74, pace: { standingsPoints: 123 } } },
};
const report = (body, projections = []) => ({
  headline: 'h',
  take: body,
  strengths: [],
  concerns: [],
  trend: { note: '' },
  weekAhead: { body: '', watch: '', keyMatchups: [] },
  restOfSeason: { body: '', projections },
});

test('a team stat cited without its block resolves from season.team, season.finishing or season.ratings', () => {
  assert.deepEqual(resolve(sheet, 'season.pdo'), { value: 100.9 });
  assert.deepEqual(resolve(sheet, 'season.svPct'), { value: 0.905, rank: 8, of: 32 });
  assert.equal(resolve(sheet, 'season.nope'), null);
});

test("the check: the new blocks' numbers are known, the report's projections are its own, a decade or a band isn't a figure", () => {
  const known = numbersIn(sheet);
  for (const n of [95, 74, 82, 123, 79.6, 80, 0.905, 90.5, 102.2]) assert.ok(known.has(n), String(n));
  assert.deepEqual(check(report('A 95-point year, 74 games left, a .905 save % and a pace of 123.'), sheet), []);
  assert.deepEqual(check(report('Expect 105 points.', [{ stat: 'Final standings points', low: 98, high: 105 }]), sheet), []);
  assert.deepEqual(check(report('Like the Sabres of the early 2020s, a kill in the mid-70s.'), sheet), []);
  assert.deepEqual(check(report('Every regular above 62% xGF.'), sheet), ['unmatched number: 62']);
});

test('the prompt: the worked-out blocks to quote, each sport its own, and sharp all the same', () => {
  for (const sport of ['mlb', 'nba', 'nhl']) {
    for (const mode of ['preview', 'recap']) {
      const p = systemPrompt(sport, mode);
      assert.match(p, /Worked out for you \(quote these instead of computing\)/);
      assert.match(p, /totals\.recent\.last5 and last10/);
      assert.match(p, /season\.vsLeague/);
      assert.match(p, /no differentials, gaps, per-game rates or paces you work out/);
      assert.match(p, /That rule is about arithmetic, not about thinking: be as sharp as ever/);
      assert.match(p, /restOfSeason\.projections, your own estimates/);
    }
  }
  assert.match(systemPrompt('nhl', 'preview'), /season\.finishing .*shPct.*svPct.*pdoAll/);
  assert.match(systemPrompt('nhl', 'preview'), /W-L-OTL/);
  assert.match(systemPrompt('nba', 'preview'), /season\.ratings \(ortg and drtg/);
  assert.match(systemPrompt('mlb', 'preview'), /full 162-game season/);
  assert.doesNotMatch(systemPrompt('mlb', 'preview'), /season\.finishing|season\.ratings/);
});
