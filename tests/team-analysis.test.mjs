// The weekly AI team analysis for MLB, NBA and NHL (libs/ranker/scripts/analysis): where each team's season
// stands (a preview while it plays, its recap once it's over), the hard cap on what a run may spend, and
// the checks of a report against its sheet. No network and no calls: plain data in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamStatus, POSTSEASON, PLAY_IN, REGULAR, OFFSEASON } from '../libs/ranker/scripts/analysis/season-state.mjs';
import { check, numbersIn, resolve, underCap, worstCost, MAX_TOKENS, PRICE, PREVIEW_SCHEMA, RECAP_SCHEMA } from '../libs/ranker/scripts/analysis/analyze.mjs';

const team = (id, clincher = '') => ({ id, abbr: id, clincher });
// A postseason game between a and b, its series' wins after it
const game = (a, b, wins, { round = 'ALDS', completed = true, type = POSTSEASON, headline = `${round} - Game 1` } = {}) => ({
  type,
  teams: [a, b],
  completed: true,
  winner: a,
  round,
  headline,
  series: { completed, wins },
});

test('in the regular season no team is over, eliminated or not', () => {
  const st = teamStatus({ season: { year: 2026, type: REGULAR }, teams: [team('A', 'x'), team('B', 'e')], games: [] });
  assert.equal(st.get('A').over, false);
  assert.equal(st.get('B').over, false);
});

test('the postseason: out of the field, a lost series and the bye still waiting', () => {
  const teams = [team('MIL', '*'), team('SD', 'y'), team('CHC', 'y'), team('COL', 'e'), team('LAD', 'x')];
  // (the wild card round done: SD beat CHC; MIL and LAD with byes, not played yet)
  const st = teamStatus({ season: { year: 2026, type: POSTSEASON }, teams, games: [game('SD', 'CHC', { SD: 2, CHC: 0 }, { round: 'NLWC' })] });
  assert.deepEqual(st.get('CHC'), { over: true, why: 'lost the NLWC 0-2', champion: false, by: 'SD' });
  assert.equal(st.get('COL').over, true);
  assert.equal(st.get('COL').why, 'missed the postseason');
  for (const alive of ['MIL', 'SD', 'LAD']) assert.equal(st.get(alive).over, false, alive);
});

test('a series still going ends no one; a team with no mark and no games is out once the postseason plays', () => {
  const teams = [team('A', 'x'), team('B', 'y'), team('C', '')];
  const st = teamStatus({ season: { year: 2026, type: POSTSEASON }, teams, games: [game('A', 'B', { A: 2, B: 1 }, { completed: false })] });
  assert.equal(st.get('A').over, false);
  assert.equal(st.get('B').over, false);
  assert.equal(st.get('C').over, true);
});

test('the final: the loser and the champion are both done', () => {
  const teams = [team('LAD', 'x'), team('NYY', 'y')];
  const st = teamStatus({ season: { year: 2026, type: POSTSEASON }, teams, games: [game('LAD', 'NYY', { LAD: 4, NYY: 2 }, { round: 'World Series', headline: 'World Series - Game 6' })] });
  assert.deepEqual(st.get('NYY'), { over: true, why: 'lost the World Series 2-4', champion: false, by: 'LAD' });
  assert.deepEqual(st.get('LAD'), { over: true, why: 'won the World Series 4-2', champion: true, by: 'NYY' });
});

test("the NBA's play-in: its losers are out once the playoffs start, not before", () => {
  const teams = [team('A', 'x'), team('B', 'pi'), team('C', 'pi')];
  const playIn = game('B', 'C', {}, { type: PLAY_IN, round: 'Play-In', headline: 'Play-In - Game 1', completed: false });
  playIn.series = null;
  let st = teamStatus({ season: { year: 2026, type: PLAY_IN }, teams, games: [playIn] });
  assert.equal(st.get('C').over, false);
  st = teamStatus({ season: { year: 2026, type: POSTSEASON }, teams, games: [playIn, game('A', 'B', { A: 1, B: 0 }, { completed: false, round: 'East 1st Round' })] });
  assert.equal(st.get('C').over, true);
  assert.equal(st.get('C').why, 'lost in the play-in');
  assert.equal(st.get('B').over, false);
});

test('the offseason ends every season', () => {
  const st = teamStatus({ season: { year: 2026, type: OFFSEASON }, teams: [team('A', 'x'), team('B', 'e')], games: [] });
  assert.equal(st.get('A').over, true);
  assert.equal(st.get('B').over, true);
});

test("the cap: a request's worst cost is its input and all of max_tokens, batched at half", () => {
  assert.equal(worstCost(10000), (0.5 * (10000 * PRICE.input + MAX_TOKENS * PRICE.output)) / 1e6);
  assert.equal(worstCost(10000, false), (10000 * PRICE.input + MAX_TOKENS * PRICE.output) / 1e6);
});

test('the cap: requests past it are left out, recaps first', () => {
  const jobs = [
    { name: 'p1', mode: 'preview', worst: 4 },
    { name: 'r1', mode: 'recap', worst: 4 },
    { name: 'p2', mode: 'preview', worst: 4 },
    { name: 'r2', mode: 'recap', worst: 1 },
  ];
  const { kept, left, worst } = underCap(jobs, 10);
  assert.deepEqual(kept.map((j) => j.name), ['r1', 'r2', 'p1']);
  assert.deepEqual(left.map((j) => j.name), ['p2']);
  assert.equal(worst, 9);
  assert.ok(worst <= 10);
  assert.deepEqual(underCap(jobs, 0.5).kept, []);
});

const sheet = {
  team: { record: '93-68', siteRank: [5, 30] },
  status: { ended: 'Lost the ALDS 0-3 to TB' },
  season: { label: '2026', team: { era: [3.23, 1, 30], offRank: 8, rotation: 'A+' } },
  roster: { rotation: [{ name: 'Cam Schlittler', stats: { era: 1.95, kPct: 0.314, strikeOuts: 239 } }] },
  results: { byMonth: [{ month: '2026-07', record: '14-11', scored: 93, allowed: 95 }] },
};

test('evidence: a ranked number, a plain one, a place on a tab and a grade resolve; a bad path or a section does not', () => {
  assert.deepEqual(resolve(sheet, 'season.team.era'), { value: 3.23, rank: 1, of: 30 });
  assert.deepEqual(resolve(sheet, 'roster.rotation.0.stats.era'), { value: 1.95 });
  assert.deepEqual(resolve(sheet, 'team.siteRank'), { value: '#5 of 30' });
  assert.deepEqual(resolve(sheet, 'season.team.rotation'), { value: 'A+' });
  assert.equal(resolve(sheet, 'season.team.whip'), null);
  assert.equal(resolve(sheet, 'season.team'), null);
});

test("the sheet's numbers: inside its texts too, rounded, and fractions as percents", () => {
  const known = numbersIn(sheet);
  for (const n of [93, 68, 2026, 3.23, 1.95, 239, 31.4, 31, 14, 11]) assert.ok(known.has(n), String(n));
  assert.ok(!known.has(3.5));
});

const point = (path, body = 'x') => ({ title: 't', body, evidence: [{ label: 'l', path }] });
test("a recap's check: bad paths and numbers the sheet doesn't have", () => {
  const report = {
    headline: 'A 93-68 year that ended in three one-run losses',
    recap: {
      finish: '93-68; lost the ALDS 0-3 to TB',
      body: 'The rotation led the league with a 3.23 ERA, Schlittler at 1.95 with 239 strikeouts and a 31.4% strikeout rate. July went 14-11.',
      highlights: [point('season.team.era'), point('roster.rotation.0.stats.era')],
      lowlights: [point('season.team.ops', 'Scored 4.7 a game.')],
      arc: { direction: 'steady', note: 'Steady.' },
      nextYear: 'The rotation carries over.',
    },
    confidence: { level: 'high', note: 'full season' },
  };
  assert.deepEqual(check(report, sheet), ['bad path: season.team.ops', 'unmatched number: 4.7']);
});

test('the report shapes: a recap is its one section; a preview has the week ahead and no betting angles', () => {
  assert.deepEqual(RECAP_SCHEMA.required, ['archetype', 'headline', 'recap', 'confidence']);
  assert.ok(PREVIEW_SCHEMA.required.includes('weekAhead'));
  assert.ok(!PREVIEW_SCHEMA.required.includes('bets') && !('bets' in PREVIEW_SCHEMA.properties));
  assert.ok(!('nextGame' in PREVIEW_SCHEMA.properties));
});
