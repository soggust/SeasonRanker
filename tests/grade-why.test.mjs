// A support grade's breakdown (its cell clicked in the grid: engine/grade-why.ts, each sport's gradeWhy): its
// parts are the grade's own inputs, each its grade times its weight, adding up to the score the grade was
// worked out from; the weights are the source's (QB Play's starts, the weapons' position shares, the
// preseason blend by games played); and the score's place on the curve gives the grade the grid shows.
// The NFL's on real data (team-grades.ts, from the tabs' default rankings); the data scripts' (MLB, NBA,
// NHL) through grades.mjs and early-season.mjs as they write gradeIn, and from the Teams and Head Coaches
// tabs for the seasons written before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { of } from 'rxjs';
import { loadEngine, seasonData, staticDir } from './support/engine.mjs';
import { curve, curvePlaces, keepGradeInput } from '../libs/ranker/scripts/grades.mjs';
import { blendWithLastSeason } from '../libs/ranker/scripts/early-season.mjs';

const close = (a, b, what, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${what}: ${a} vs ${b}`);
const sum = (values) => values.reduce((a, b) => a + b, 0);

// Every support grade cell of every tab: the unit, the stat, its shown value and the context the grid reads it in
function* gradeCells(engine, rows) {
  const { SKILL_STATS, DEFAULT_SETTINGS, statValue } = engine;
  for (const position of Object.keys(SKILL_STATS)) {
    for (const stat of SKILL_STATS[position].filter((s) => s.support && s.format === 'grade')) {
      const context = { position, settings: DEFAULT_SETTINGS.sport, rows, tableSeason: true, defaults: false };
      for (const unit of rows[position] ?? []) {
        const shown = statValue(unit, stat, context);
        if (shown !== null) yield { position, stat, unit, shown, context };
      }
    }
  }
}

// Each part's amount is its grade times its weight, and they add up to the score
function partsAddUp(why, what) {
  for (const part of why.parts) close(part.amount, part.grade * part.weight, `${what} ${part.key}: amount`);
  close(sum(why.parts.map((p) => p.amount)), why.score, `${what}: parts vs score`);
  if (why.parts.length) close(sum(why.parts.map((p) => p.weight)), 1, `${what}: weights`, 1e-6);
}

test('nfl: every support grade breaks down into its inputs, and their score curves into the grade shown', async () => {
  const engine = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/grade-nfl-entry.ts') });
  const { SPORT, SKILL_UNITS, DEFAULT_SETTINGS, defaultRanking, defaultMin, presetWeights, curveGrade, dataWeight, teamGamesPlayed, preseasonWeapons } = engine;
  // (the grades from the tabs' default rankings, as the grid has them before a tab is opened: grid-rankings.ts's host)
  const host = {
    settings$: of(DEFAULT_SETTINGS.sport),
    rankedUnits: (position, emphasis) => {
      const weights = presetWeights(position, 'default');
      const leaned = emphasis ? Object.fromEntries(Object.entries(weights).map(([key, w]) => [key, w * (emphasis[key] ?? 1)])) : weights;
      return of(defaultRanking(position, leaned, SKILL_UNITS, DEFAULT_SETTINGS.sport, defaultMin(SKILL_UNITS, position), DEFAULT_SETTINGS.combineStats));
    },
    rows: () => SKILL_UNITS,
  };
  SPORT.connect(host).subscribe();

  const seen = new Map();
  // (each grade's scores by team, to check the curve's order: one tab's, the O-line's lean is the tab's)
  const scores = new Map();
  for (const { position, stat, unit, shown, context } of gradeCells(engine, SKILL_UNITS)) {
    const why = SPORT.gradeWhy(unit, stat, shown, context);
    const what = `nfl ${position} ${unit.name} ${stat.key}`;
    assert.ok(why, `${what}: a breakdown`);
    seen.set(stat.key, (seen.get(stat.key) ?? 0) + 1);
    assert.equal(why.grade, shown, `${what}: the grade shown`);
    partsAddUp(why, what);
    if (why.curve) {
      const curved = curveGrade(why.curve.rank, why.curve.of);
      // (QB and RB Play as curved; the rest rounded to a whole grade)
      if (stat.key === 'qbPlay' || stat.key === 'rbPlay') close(curved, shown, `${what}: curve`, 1e-9);
      else assert.equal(Math.round(curved), shown, `${what}: curve #${why.curve.rank} of ${why.curve.of}`);
      const key = `${position}.${stat.key}`;
      if (!scores.has(key)) scores.set(key, new Map());
      scores.get(key).set(stat.key === 'responsibility' ? unit.gsisId : unit.teamLogo, why);
    } else {
      assert.equal(stat.key, 'defense');
      assert.equal(Math.round(why.score), shown, `${what}: the defense's spot is its grade`);
    }

    // The weights are the source's
    const team = unit.teamLogo;
    if (stat.key === 'qbPlay') {
      const qbs = SKILL_UNITS.QB.filter((qb) => (qb.starts?.[team] ?? 0) > 0);
      const starts = sum(qbs.map((qb) => qb.starts[team]));
      assert.equal(why.parts.length, qbs.length, `${what}: one part a QB with starts`);
      for (const part of why.parts) close(part.weight, SKILL_UNITS.QB.find((qb) => qb.gsisId === part.key).starts[team] / starts, `${what} ${part.label}: starts share`);
    }
    if (['weapons', 'oline', 'coaching'].includes(stat.key)) {
      const season = sum(why.parts.filter((p) => p.key !== 'preseason').map((p) => p.weight));
      const preseason = why.parts.find((p) => p.key === 'preseason');
      if (preseason) close(preseason.weight, 1 - season, `${what}: preseason's share`);
      if (season > 0) close(season, dataWeight(teamGamesPlayed(team)), `${what}: this season's share by games played`);
      if (stat.key === 'weapons') {
        if (preseason) assert.equal(preseason.grade, preseasonWeapons(team));
        const shares = { WR: 0.5, RB: 0.3, TE: 0.2 };
        const groups = why.parts.filter((p) => p.key in shares);
        const total = sum(groups.map((p) => shares[p.key]));
        for (const p of groups) close(p.weight / season, shares[p.key] / total, `${what} ${p.key}: its share of the weapons`);
      }
    }
  }
  for (const key of ["qbPlay", "rbPlay", "weapons", "oline", "coaching", "defense", "responsibility"]) assert.ok(seen.get(key) > 0, `nfl: ${key} checked`);

  // The curve's order is the scores': the team at #r has no higher score below it
  for (const [key, byTeam] of scores) {
    const all = [...byTeam.values()];
    for (const why of all) {
      const above = all.filter((o) => o.score > why.score + 1e-9).length;
      assert.ok(above < why.curve.rank, `${key}: #${why.curve.rank} with ${above} higher scores`);
    }
  }
});

// A season of rows for the data sports' test: a few teams, a player-wide grade (Lineup, Teammates) and a
// team-wide one, curved as the scripts curve them, then blended early in the season
function scriptSeason({ last }) {
  const teams = ['a', 'b', 'c', 'd'];
  const units = Array.from({ length: 12 }, (_, i) => ({
    gsisId: `p${i}`,
    teamLogo: `logo/${teams[i % 4]}.svg`,
    games: last ? 30 : 3 + (i % 4) * 4,
    stats: {},
    _score: Math.sin(i + 1) * 3,
  }));
  const playerScores = new Map(units.map((u) => [u.gsisId, u._score]));
  const teamScores = new Map(teams.map((t, i) => [`logo/${t}.svg`, [4.2, -1.5, 0.3, 4.2][i]]));
  const lineup = curve(playerScores);
  const lineupPlaces = curvePlaces(playerScores);
  const team = curve(teamScores);
  const teamPlaces = curvePlaces(teamScores);
  for (const u of units) {
    u.stats.lineup = lineup.get(u.gsisId);
    u.stats.defense = team.get(u.teamLogo);
    keepGradeInput(u, 'lineup', u._score, lineupPlaces.get(u.gsisId));
    keepGradeInput(u, 'defense', teamScores.get(u.teamLogo), teamPlaces.get(u.teamLogo));
    delete u._score;
  }
  return { X: units };
}

test('data grades: gradeIn as the scripts write it gives back the grade, early season blend and all', async () => {
  const { dataGradeWhy, curveGrade } = await loadEngine('mlb', { entry: path.join(import.meta.dirname, 'support/grade-entry.ts') });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-why-'));
  try {
    fs.mkdirSync(path.join(dir, 'seasons', '2025'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'seasons', '2025', 'skill-players.json'), JSON.stringify(scriptSeason({ last: true })));
    const rows = scriptSeason({ last: false });
    await blendWithLastSeason({ staticDir: dir, season: 2026, rows, keys: ['lineup', 'defense'], fullAt: 40 });
    const spec = { label: 'Score', format: (v) => v.toFixed(2), among: 'players', about: 'A test score' };
    let blended = 0;
    for (const unit of rows.X) {
      for (const key of ['lineup', 'defense']) {
        const input = unit.gradeIn[key];
        assert.equal(input.length, 5, `${unit.gsisId} ${key}: early season keeps last season's grade and the share`);
        const shown = unit.stats[key];
        const why = dataGradeWhy(unit, { key }, shown, spec, { position: 'X', rows, settings: {}, tableSeason: true, defaults: false });
        partsAddUp(why, `${unit.gsisId} ${key}`);
        // (the curve's grade, then the blend, each to a tenth as the scripts round them)
        assert.equal(why.parts[0].grade, Math.round(curveGrade(input[1], input[2]) * 10) / 10);
        close(why.parts[0].weight, input[4], `${unit.gsisId} ${key}: this season's share`);
        close(why.parts[1].grade, input[3], `${unit.gsisId} ${key}: last season's grade`);
        assert.ok(Math.abs(why.score - shown) <= 0.051, `${unit.gsisId} ${key}: ${why.score} adds up to ${shown}`);
        blended++;
      }
    }
    assert.ok(blended > 0);
    // (a finished season: the curve alone, one part, the grade itself)
    const done = scriptSeason({ last: true });
    for (const unit of done.X) {
      const why = dataGradeWhy(unit, { key: 'lineup' }, unit.stats.lineup, spec, { position: 'X', rows: done, settings: {}, tableSeason: true, defaults: false });
      assert.equal(why.parts.length, 1);
      assert.equal(why.score, unit.stats.lineup);
      assert.equal(why.curve.of, 12);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The team-wide grades of a season written before gradeIn, worked out from the Teams or Head Coaches tab:
// the same grade the data shows (a finished season: no early-season blend), on every row
const TEAM_ROWS = [
  ['nba', '2026', ['coaching']],
  ['nhl', '2026', ['coaching']],
  ['mlb', null, ['defense', 'park']],
];
for (const [sport, season, keys] of TEAM_ROWS) {
  test(`${sport}: team-wide grades from the season's team rows match the grades shown`, async () => {
    const dir = season ? path.join(staticDir(sport), 'seasons', season) : staticDir(sport);
    const engine = await loadEngine(sport, { entry: path.join(import.meta.dirname, 'support/grade-entry.ts'), data: seasonData(dir) });
    const { SPORT, SKILL_UNITS } = engine;
    const checked = new Map();
    for (const { position, stat, unit, shown, context } of gradeCells(engine, SKILL_UNITS)) {
      if (!keys.includes(stat.key)) continue;
      const why = SPORT.gradeWhy(unit, stat, shown, context);
      const what = `${sport} ${position} ${unit.name} ${stat.key}`;
      assert.ok(why, `${what}: a breakdown`);
      partsAddUp(why, what);
      assert.equal(why.parts.length, 1, `${what}: the season's input alone`);
      assert.ok(Math.abs(why.score - shown) < 0.051, `${what}: ${why.score} vs ${shown} (#${why.curve.rank} of ${why.curve.of})`);
      assert.equal(why.notes.length, 0, `${what}: no early-season note`);
      checked.set(stat.key, (checked.get(stat.key) ?? 0) + 1);
    }
    for (const key of keys) assert.ok(checked.get(key) > 0, `${sport}: ${key} checked`);
  });
}
