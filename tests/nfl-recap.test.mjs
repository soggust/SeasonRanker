// The NFL's season-end recap (apps/nfl/scripts/analysis): where each team's season stands from the
// schedule (season-state.mjs), the recap sheet's totals and months, the weekly runs skipping a row whose
// recap is out, publishing keeping it, and the recap's prompt and checks. No network and no calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIVISIONS, conferenceOf, endedText, isRecapOf, resultsOf, teamStatus, totalsOf } from '../apps/nfl/scripts/analysis/season-state.mjs';
import { check, numbersIn, publish, recapDone, resolve, systemPrompt, NUMBERS_RULE, PREVIEW_SCHEMA, RECAP_SCHEMA } from '../apps/nfl/scripts/analysis/analyze.mjs';

const TEAMS = Object.values(DIVISIONS).flat();
// A regular season: each team two games against a stand-in (ZZZ), its wins as given (0 unless said);
// unplayed: a team whose last game isn't played yet
const regular = (wins = {}, unplayed = null) =>
  TEAMS.flatMap((t) =>
    [0, 1].map((i) => {
      const won = i < (wins[t] ?? 0);
      const pending = t === unplayed && i === 1;
      return { type: 'REG', home: t, away: 'ZZZ', homeScore: pending ? null : won ? 24 : 10, awayScore: pending ? null : 17 };
    }),
  );
const game = (type, home, away, homeScore = null, awayScore = null) => ({ type, home, away, homeScore, awayScore });
// The field: AFC's Wild Card games (DEN the bye), NFC's (SEA the bye)
const AFC_WC = [game('WC', 'JAX', 'BUF'), game('WC', 'PIT', 'HOU'), game('WC', 'NE', 'LAC')];
const NFC_WC = [game('WC', 'CHI', 'GB'), game('WC', 'PHI', 'SF'), game('WC', 'CAR', 'LA')];
const WINS = { DEN: 2, SEA: 2, BUF: 2, JAX: 2, PIT: 1, HOU: 2, NE: 2, LAC: 1, CHI: 2, GB: 1, PHI: 1, SF: 2, CAR: 1, LA: 2, KC: 1, DET: 1 };
const over = (st) => [...st].filter(([, s]) => s.over).map(([t]) => t).sort();

test('the regular season still on: no team is over, however bad', () => {
  const st = teamStatus([...regular(WINS, 'KC')]);
  assert.deepEqual(over(st), []);
});

test("the regular season done but no field on the schedule yet: no one's over", () => {
  assert.deepEqual(over(teamStatus(regular(WINS))), []);
});

test("a conference's Wild Card games set: the teams out of its field are over, not the bye; the other conference waits", () => {
  const st = teamStatus([...regular(WINS), ...AFC_WC, ...NFC_WC.slice(0, 2)]);
  const afcOut = TEAMS.filter((t) => conferenceOf(t) === 'AFC' && !['DEN', 'BUF', 'JAX', 'PIT', 'HOU', 'NE', 'LAC'].includes(t));
  assert.deepEqual(over(st), afcOut.sort());
  assert.equal(st.get('KC').why, 'missed the playoffs');
  assert.equal(st.get('DEN').over, false, 'the bye (the best record left) is in the field');
  assert.equal(st.get('BUF').over, false);
  assert.equal(st.get('DET').over, false, "NFC's field isn't set (two of its three Wild Card games)");
  assert.equal(endedText(st.get('KC')), 'Missed the playoffs');
});

test("the bye can't be told apart (a tie for the best record left): that conference's out-of-field teams wait", () => {
  const st = teamStatus([...regular({ ...WINS, KC: 2 }), ...AFC_WC]);
  assert.deepEqual(over(st), []);
});

test('the Wild Card round played: its losers are over, by whom and the score (theirs first)', () => {
  const games = [...regular(WINS), game('WC', 'JAX', 'BUF', 24, 27), game('WC', 'PIT', 'HOU', 6, 30), game('WC', 'NE', 'LAC', 16, 3), ...NFC_WC];
  const st = teamStatus(games);
  assert.deepEqual(st.get('JAX'), { over: true, why: 'lost in the Wild Card round', champion: false, by: 'BUF', score: '24-27' });
  assert.equal(endedText(st.get('JAX')), 'Lost in the Wild Card round to BUF, 24-27');
  assert.equal(st.get('BUF').over, false);
  assert.equal(st.get('LAC').over, true);
  assert.equal(st.get('DEN').over, false);
});

test('the Divisional round on the schedule: the field is its teams and the Wild Card winners; the rest are out', () => {
  const games = [...regular(WINS), game('WC', 'JAX', 'BUF', 24, 27), game('WC', 'PIT', 'HOU', 6, 30), game('WC', 'NE', 'LAC', 16, 3), game('DIV', 'DEN', 'BUF'), game('DIV', 'NE', 'HOU')];
  const st = teamStatus(games);
  assert.equal(st.get('DEN').over, false);
  assert.equal(st.get('KC').over, true);
  assert.equal(st.get('HOU').over, false);
});

test('the conference champions wait for the Super Bowl; then the loser and the champion are both done', () => {
  const base = [...regular(WINS), ...AFC_WC, ...NFC_WC, game('CON', 'DEN', 'NE', 7, 10), game('CON', 'SEA', 'LA', 31, 27)];
  let st = teamStatus([...base, game('SB', 'SEA', 'NE')]);
  assert.equal(st.get('DEN').why, 'lost in the AFC Championship');
  assert.equal(endedText(st.get('LA')), 'Lost in the NFC Championship to SEA, 27-31');
  assert.equal(st.get('NE').over, false);
  assert.equal(st.get('SEA').over, false);
  st = teamStatus([...base, game('SB', 'NE', 'SEA', 13, 29)]);
  assert.equal(endedText(st.get('NE')), 'Lost in the Super Bowl to SEA, 13-29');
  assert.deepEqual(st.get('SEA'), { over: true, why: 'won the Super Bowl', champion: true, by: 'NE', score: '29-13' });
  assert.equal(endedText(st.get('SEA')), 'Won the Super Bowl over NE, 29-13');
});

test("the recap sheet's totals: points from the scores, the differential, a game, the box scores' units, playoffs apart", () => {
  const box = (passYds, rushYds, turnovers, takeaways, oppPassYds, oppRushYds) => ({ passYds, rushYds, turnovers, takeaways, sacksAllowed: 2, defSacks: 3, penaltyYds: 50, oppPassYds, oppRushYds });
  const log = [
    { score: '24-17', result: 'W', box: box(250, 120, 1, 2, 200, 100) },
    { score: '10-20', result: 'L', box: box(180, 80, 3, 0, 260, 140) },
    { score: '20-20', result: 'T', box: null },
    { score: '31-28', result: 'W', round: 'Wild Card round', box: box(300, 90, 0, 1, 280, 70) },
  ];
  const t = totalsOf(log, { wins: 1, ties: 1, winsOverExpected: -0.3 });
  const reg = t.regularSeason;
  assert.equal(reg.games, 3);
  assert.equal(reg.pointsScored, 54);
  assert.equal(reg.pointsAllowed, 57);
  assert.equal(reg.differential, -3);
  assert.equal(reg.scoredPerGame, 18);
  assert.equal(reg.differentialPerGame, -1);
  // (two games had box scores: the units over those, and it says so)
  assert.equal(reg.gamesWithBox, 2);
  assert.deepEqual(reg.offense, { passYds: 430, rushYds: 200, totalYds: 630, yardsPerGame: 315, turnovers: 4, sacksAllowed: 4, penaltyYds: 100 });
  assert.deepEqual(reg.defense, { passYdsAllowed: 460, rushYdsAllowed: 240, yardsAllowed: 700, yardsAllowedPerGame: 350, takeaways: 2, sacks: 6 });
  assert.equal(reg.turnoverDiff, -2);
  // (a tie a half win: 1.5 minus -0.3)
  assert.equal(reg.winsByDifferential, 1.8);
  assert.deepEqual([t.playoffs.games, t.playoffs.pointsScored, t.playoffs.differential, t.playoffs.gamesWithBox], [1, 31, 3, undefined]);
  assert.equal(totalsOf(log.slice(0, 2)).playoffs, undefined);
});

test('the months: each one\'s record, points, a game, the record through it; the longest streaks', () => {
  const g = (date, score, result) => ({ date, score, result });
  const res = resultsOf([g('2025-09-07', '20-10', 'W'), g('2025-09-14', '21-17', 'W'), g('2025-09-21', '3-24', 'L'), g('2025-10-05', '17-17', 'T'), g('2025-10-12', '10-13', 'L'), g('2025-10-19', '7-30', 'L')]);
  assert.deepEqual(res.byMonth[0], { month: '2025-09', record: '2-1', scored: 44, allowed: 51, scoredPerGame: 14.7, allowedPerGame: 17, recordThrough: '2-1' });
  assert.equal(res.byMonth[1].record, '0-2-1');
  assert.equal(res.byMonth[1].recordThrough, '2-3-1');
  assert.equal(res.longestWinStreak, 2);
  assert.equal(res.longestLosingStreak, 2);
});

test('skipped once its recap is out: the site file or the kept report, this season only', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nfl-recap-'));
  const siteDir = path.join(dir, 'site');
  const reportsDir = path.join(dir, 'reports');
  mkdirSync(siteDir);
  mkdirSync(reportsDir);
  writeFileSync(path.join(siteDir, 'team-KC.json'), JSON.stringify({ mode: 'recap', season: '2026', at: '2027-01-06' }));
  writeFileSync(path.join(siteDir, 'team-BUF.json'), JSON.stringify({ mode: 'preview', season: '2026' }));
  writeFileSync(path.join(siteDir, 'team-NYJ.json'), JSON.stringify({ mode: 'recap', season: '2025' }));
  writeFileSync(path.join(reportsDir, '00-0033873.json'), JSON.stringify({ id: '00-0033873', mode: 'recap', season: '2026' }));
  const done = (id, file) => recapDone({ siteDir, reportsDir, id, file, season: 2026 });
  assert.equal(done('team-KC', 'team-KC'), true);
  assert.equal(done('team-BUF', 'team-BUF'), false);
  assert.equal(done('team-NYJ', 'team-NYJ'), false, "last season's recap doesn't end this one");
  assert.equal(done('00-0033873', 'QB-3139477'), true, "a QB's kept recap");
  assert.equal(done('team-DAL', 'team-DAL'), false);
  assert.equal(isRecapOf(null, 2026), false);
});

test("publishing: a recap carries its mode, season and how it ended; one out stays, a preview doesn't replace it", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nfl-publish-'));
  const siteDir = path.join(dir, 'site');
  const reportsDir = path.join(dir, 'reports');
  const base = dir;
  mkdirSync(siteDir);
  mkdirSync(reportsDir);
  mkdirSync(path.join(base, 'teams'));
  writeFileSync(path.join(base, 'index.json'), JSON.stringify([]));
  writeFileSync(path.join(base, 'team-index.json'), JSON.stringify(['KC', 'BUF', 'DAL'].map((team) => ({ team, siteIds: [`TM-${team}`, `DEF-${team}`] }))));
  const recap = { archetype: { name: 'Lost Season', definition: 'x' }, headline: 'h', recap: { finish: '6-11', body: 'b', highlights: [], lowlights: [], arc: { direction: 'falling', note: 'n' }, nextYear: 'y' }, confidence: { level: 'high', note: 'n' } };
  // KC: its recap already out, and this checkout has an older preview of it; DAL: a recap just written
  writeFileSync(path.join(siteDir, 'team-KC.json'), JSON.stringify({ at: '2027-01-06T10:00:00Z', mode: 'recap', season: '2026', ended: 'Missed the playoffs', game: null, report: recap }));
  writeFileSync(path.join(reportsDir, 'team-KC.json'), JSON.stringify({ id: 'team-KC', mode: 'preview', season: '2026', at: '2026-12-30T10:00:00Z', report: { take: 't' }, site: { take: 't', strengths: [], concerns: [] } }));
  writeFileSync(path.join(reportsDir, 'team-DAL.json'), JSON.stringify({ id: 'team-DAL', mode: 'recap', season: '2026', ended: 'Missed the playoffs', at: '2027-01-06T10:00:00Z', model: 'm', report: recap, site: recap }));
  publish({ siteDir, reportsDir, base, season: 2026 });
  const read = (f) => JSON.parse(readFileSync(path.join(siteDir, f), 'utf8'));
  assert.equal(read('team-KC.json').mode, 'recap');
  assert.deepEqual([read('team-DAL.json').mode, read('team-DAL.json').season, read('team-DAL.json').ended, read('team-DAL.json').game], ['recap', '2026', 'Missed the playoffs', null]);
  assert.ok(read('team-DAL.json').report.recap);
  assert.equal(existsSync(path.join(siteDir, 'team-BUF.json')), false);
  assert.deepEqual(read('index.json'), { 'TM-KC': 'team-KC', 'DEF-KC': 'team-KC', 'TM-DAL': 'team-DAL', 'DEF-DAL': 'team-DAL' });
});

test("the recap's prompt: only numbers in the dossier, no sums of its own, the totals to quote; the team's preview too", () => {
  const teamRecap = systemPrompt({ kind: 'team', mode: 'recap' });
  const qbRecap = systemPrompt({ mode: 'recap', player: {} });
  for (const p of [teamRecap, qbRecap, systemPrompt({ kind: 'team' })]) {
    assert.match(p, /Cite only numbers in the dossier/);
    assert.match(p, /don't add up, subtract, average or round/);
  }
  assert.match(teamRecap, /totals\.regularSeason/);
  assert.match(teamRecap, /status\.ended/);
  assert.match(qbRecap, /season\.playoffs/);
  assert.doesNotMatch(teamRecap, /nextGame|restOfSchedule/);
  assert.ok(teamRecap.includes(NUMBERS_RULE));
  // (the QB's weekly preview follows it too since 2026-10-14: tests/nfl-qb-sheet.test.mjs)
  assert.match(systemPrompt({ player: {} }), /Cite only numbers/);
});

test('the report shapes: a recap is its one section, as the site shows it for MLB; a preview keeps its sections', () => {
  assert.deepEqual(RECAP_SCHEMA.required, ['archetype', 'headline', 'recap', 'confidence']);
  assert.deepEqual(RECAP_SCHEMA.properties.recap.required, ['finish', 'body', 'highlights', 'lowlights', 'arc', 'nextYear']);
  assert.ok(PREVIEW_SCHEMA.required.includes('nextGame'));
  assert.equal(PREVIEW_SCHEMA.properties.bets, undefined);
});

test("a recap's check: a bad path and a number the dossier doesn't have; scores and records inside its texts count", () => {
  const dossier = { mode: 'recap', status: { ended: 'Lost in the NFC Championship to SEA, 27-31' }, team: { record: '12-5' }, totals: { regularSeason: { pointsScored: 518, differential: 172 } }, season: { team: { netEpa: [0.216, 1, 32] } } };
  assert.ok(numbersIn(dossier).has(27) && numbersIn(dossier).has(31));
  assert.deepEqual(resolve(dossier, 'season.team.netEpa'), { value: 0.216, rank: 1, of: 32 });
  assert.deepEqual(resolve(dossier, 'status.ended'), null, 'a long text is no number');
  const point = (path) => ({ title: 't', body: 'b', evidence: [{ label: 'l', path }] });
  const report = {
    headline: 'Best by net EPA',
    recap: { finish: '12-5; lost 27-31 at SEA', body: 'They scored 518 and outscored teams by 172, 41 more than anyone.', highlights: [point('totals.regularSeason.differential')], lowlights: [point('totals.regularSeason.pointsAllowed')], arc: { direction: 'steady', note: 'n' }, nextYear: 'y' },
  };
  assert.deepEqual(check(report, dossier), ['bad path: totals.regularSeason.pointsAllowed', 'unmatched number: 41']);
});
