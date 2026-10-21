// The Overview splash's data (libs/ranker/scripts/splash, apps/<sport>/scripts/build-splash.mjs): the outcome
// builder on plain data, the built outcomes.json files' facts (the 2023 Chiefs won it all...), and the numbers,
// best-games and milestones files' contracts, for every sport and season the site has; the uniform and helmet
// tables' shapes. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { buildOutcomes, roundsByChain, seriesOf } from '../libs/ranker/scripts/splash/outcomes.mjs';
import { bestOf, mlbHittingGame, mlbPitchingGame, nbaGame, nflGame, nflTitle, nhlGoalieGame, nhlSkaterGame, superBowl } from '../libs/ranker/scripts/splash/best-game.mjs';
import { milestonesOf } from '../libs/ranker/scripts/splash/milestones.mjs';
import { currentSeason, seasonDir, siteSeasons, teamTable } from '../libs/ranker/scripts/splash/files.mjs';
import { earlyCurrent } from './support/early-season.mjs';
import { build } from 'esbuild';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// (a sport's TypeScript table, bundled to load: its imports are types alone)
async function loadTs(file) {
  const out = path.join(os.tmpdir(), `splash-data-${process.pid}-${path.basename(path.dirname(path.dirname(path.dirname(file))))}.mjs`);
  await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  const m = await import(pathToFileURL(out).href);
  rmSync(out, { force: true });
  return m;
}

const SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const outcomesOf = (sport, season) => read(path.join(seasonDir(sport, season), 'outcomes.json'));

// ---- the builder
const game = (date, home, away, hs, as) => ({ date, teams: [home, away], home, score: { [home]: hs, [away]: as } });

test('a bracket by chain: the final is the last round, each series one round before its winner\'s next', () => {
  const games = [
    // round 1: A beats B, C beats D (best of 3 here)
    game('01', 'A', 'B', 3, 1), game('02', 'A', 'B', 2, 1),
    game('01', 'C', 'D', 1, 2), game('02', 'C', 'D', 4, 0), game('03', 'C', 'D', 5, 1),
    // the final: C beats A
    game('10', 'A', 'C', 1, 2), game('11', 'C', 'A', 2, 0),
  ];
  const series = roundsByChain(seriesOf(games, { needed: () => 2 }));
  const by = (a, b) => series.find((s) => s.teams.includes(a) && s.teams.includes(b));
  assert.equal(by('A', 'B').round, 1);
  assert.equal(by('C', 'D').round, 1);
  assert.equal(by('A', 'C').round, 2);
  assert.equal(by('A', 'C').winner, 'C');
  assert.deepEqual(by('C', 'D').wins, { C: 2, D: 1 });
  const out = buildOutcomes({
    teams: ['A', 'B', 'C', 'D', 'E'].map((key) => ({ key, conf: 'X', record: '1-1' })),
    series: series.map((s) => ({ ...s, roundName: s.round === 2 ? 'Final' : 'Semis' })),
    totalRounds: 2,
  });
  assert.equal(out.C.result, 'champion');
  assert.equal(out.C.confChamp, true);
  assert.equal(out.A.result, 'finalist');
  assert.equal(out.A.score, '0-2');
  assert.equal(out.A.opp, 'C');
  assert.equal(out.B.result, 'semis');
  assert.equal(out.E.result, 'missed');
  assert.equal(out.E.over, true);
  assert.equal(out.C.playoffs.length, 2);
  assert.equal(out.C.lastGame.result, 'W');
});

test('a season still being played: the furthest each has got, nothing over yet; no field, no misses', () => {
  const series = [{ round: 1, roundName: 'R1', teams: ['A', 'B'], wins: { A: 1, B: 0 }, winner: null, games: [{ date: '01', home: 'A', score: { A: 3, B: 1 } }] }];
  const out = buildOutcomes({ teams: ['A', 'B', 'C'].map((key) => ({ key })), series, totalRounds: 4, fieldSet: true });
  assert.equal(out.A.result, 'playoffs');
  assert.equal(out.A.over, false);
  assert.equal(out.C.result, 'missed');
  const early = buildOutcomes({ teams: [{ key: 'A' }], series: [], totalRounds: 4, fieldSet: false });
  assert.equal(early.A.result, null);
  assert.equal(early.A.over, false);
  // (a team through to the final, still being played)
  const final = buildOutcomes({ teams: [{ key: 'A' }, { key: 'B' }], series: [{ round: 4, roundName: 'F', teams: ['A', 'B'], wins: { A: 0, B: 0 }, winner: null, games: [] }], totalRounds: 4 });
  assert.equal(final.A.result, 'finalist');
  assert.equal(final.A.score, null);
});

test('a game at a neutral site: its round and its last game say so; home still says which side it was listed on', () => {
  const sb = { date: '2024-02-11', teams: ['KC', 'SF'], home: 'KC', score: { KC: 25, SF: 22 }, neutral: true };
  const [made] = seriesOf([sb], { needed: () => 1 });
  assert.equal(made.games[0].neutral, true);
  const out = buildOutcomes({
    teams: [{ key: 'KC' }, { key: 'SF' }, { key: 'X' }],
    series: [{ round: 1, roundName: 'Super Bowl', teams: ['KC', 'SF'], wins: { KC: 1, SF: 0 }, winner: 'KC', single: true, games: [sb] }],
    totalRounds: 1,
    lastGames: { X: { date: '2024-01-07', opp: 'Y', oppTeam: 'Y', home: false, result: 'L', score: '1-2' } },
  });
  assert.equal(out.SF.playoffs[0].neutral, true);
  assert.equal(out.SF.playoffs[0].home, false);
  assert.equal(out.SF.lastGame.neutral, true);
  assert.equal(out.SF.lastGame.home, false);
  assert.equal(out.KC.lastGame.neutral, true);
  assert.equal(out.X.lastGame.neutral, undefined);
  // (a home game is no neutral one)
  const home = buildOutcomes({ teams: [{ key: 'A' }, { key: 'B' }], series: [{ round: 1, roundName: 'F', teams: ['A', 'B'], wins: { A: 1, B: 0 }, winner: 'A', single: true, games: [{ ...sb, teams: ['A', 'B'], home: 'A', score: { A: 2, B: 1 }, neutral: false }] }], totalRounds: 1 });
  assert.equal(home.B.playoffs[0].neutral, undefined);
  assert.equal(home.B.lastGame.neutral, undefined);
});

// ---- the built files: facts
test('NFL outcomes: the 2023 Chiefs champion over the 49ers, the 49ers finalist, the 2024 Jaguars missed', () => {
  const o23 = outcomesOf('nfl', 2023);
  assert.equal(o23.Chiefs.result, 'champion');
  assert.equal(o23.Chiefs.roundName, 'Super Bowl');
  assert.equal(o23.Chiefs.opp, 'SF');
  assert.equal(o23.Chiefs.score, '25-22');
  assert.equal(o23.Chiefs.ot, true);
  assert.equal(o23.Chiefs.seed, 3);
  assert.equal(o23.Chiefs.confChamp, true);
  assert.equal(o23['49ers'].result, 'finalist');
  assert.equal(o23['49ers'].seed, 1);
  // (Super Bowl LVIII, Las Vegas: a neutral site, the Chiefs listed at home)
  assert.equal(o23['49ers'].lastGame.neutral, true);
  assert.equal(o23['49ers'].lastGame.home, false);
  assert.equal(o23['49ers'].playoffs.at(-1).neutral, true);
  assert.equal(o23.Chiefs.lastGame.neutral, true);
  assert.equal(o23['49ers'].playoffs[0].neutral, undefined, 'the divisional round at home');
  assert.equal(o23.Ravens.result, 'semis');
  assert.equal(o23.Ravens.roundName, 'AFC Championship');
  assert.equal(o23.Texans.result, 'playoffs');
  assert.equal(o23.Texans.divChamp, true);
  const o24 = outcomesOf('nfl', 2024);
  assert.equal(o24.Jaguars.result, 'missed');
  assert.equal(o24.Jaguars.record, '4-13');
  assert.deepEqual(o24.Jaguars.playoffs, []);
  assert.equal(o24.Eagles.result, 'champion');
  // (2000, before nfldata's standings: the seeds by hand)
  const o00 = outcomesOf('nfl', 2000);
  assert.equal(o00.Ravens.result, 'champion');
  assert.equal(o00.Ravens.seed, 4);
  assert.equal(o00.Giants.result, 'finalist');
  assert.equal(Object.keys(o00).length, 31);
});

test('NBA, NHL and MLB outcomes: their champions and finalists', () => {
  const facts = [
    ['nba', 2016, 'CLE', 'champion', 'NBA Finals', '4-3'],
    ['nba', 2016, 'GSW', 'finalist', 'NBA Finals', '3-4'],
    ['nba', 2016, 'LAL', 'missed', null, null],
    ['nhl', 2024, 'FLA', 'champion', 'Stanley Cup Final', '4-3'],
    ['nhl', 2024, 'EDM', 'finalist', 'Stanley Cup Final', '3-4'],
    ['nhl', 2024, 'NYR', 'semis', 'Eastern Conference Finals', '2-4'],
    ['mlb', 2022, '117', 'champion', 'World Series', '4-2'],
    ['mlb', 2022, '143', 'finalist', 'World Series', '2-4'],
    ['mlb', 2022, '147', 'semis', 'ALCS', '0-4'],
  ];
  for (const [sport, season, team, result, roundName, score] of facts) {
    const o = outcomesOf(sport, season)[team];
    assert.equal(o?.result, result, `${sport} ${season} ${team}`);
    assert.equal(o.roundName, roundName, `${sport} ${season} ${team}`);
    assert.equal(o.score, score, `${sport} ${season} ${team}`);
  }
});

test('every outcomes.json: a finished season has one champion and one finalist, every team its shape', () => {
  const RESULTS = new Set(['champion', 'finalist', 'semis', 'playoffs', 'missed', null]);
  for (const sport of SPORTS) {
    const teams = teamTable(sport);
    const seasons = siteSeasons(sport);
    for (const season of seasons) {
      const file = path.join(seasonDir(sport, season), 'outcomes.json');
      assert.ok(existsSync(file), `${sport} ${season}: outcomes.json`);
      const o = read(file);
      const rows = Object.entries(o);
      assert.ok(rows.length >= 29, `${sport} ${season}: ${rows.length} teams`);
      for (const [team, v] of rows) {
        assert.ok(teams[team], `${sport} ${season}: ${team} is a team-colors.ts key`);
        assert.ok(RESULTS.has(v.result), `${sport} ${season} ${team}: result ${v.result}`);
        assert.equal(typeof v.over, 'boolean');
        assert.ok(Array.isArray(v.playoffs));
        assert.match(String(v.record), /^\d+-\d+(-\d+)?$/, `${sport} ${season} ${team}: record`);
        if (v.result === 'missed') assert.equal(v.playoffs.length, 0);
        if (v.lastGame) assert.match(v.lastGame.date, /^\d{4}-\d\d-\d\d$/);
      }
      const past = season < Math.max(...seasons) || rows.every(([, v]) => v.over);
      if (!past) continue;
      assert.equal(rows.filter(([, v]) => v.result === 'champion').length, 1, `${sport} ${season}: one champion`);
      assert.equal(rows.filter(([, v]) => v.result === 'finalist').length, 1, `${sport} ${season}: one finalist`);
      assert.equal(rows.filter(([, v]) => v.result === 'semis').length, 2, `${sport} ${season}: two semifinal losers`);
      for (const [team, v] of rows) assert.equal(v.over, true, `${sport} ${season} ${team}: over`);
    }
  }
});

// ---- jerseys, best games, milestones: the contracts
test('numbers.json: every season has one, a card id to a number as a string', () => {
  for (const sport of SPORTS) {
    for (const season of siteSeasons(sport)) {
      const file = path.join(seasonDir(sport, season), 'numbers.json');
      assert.ok(existsSync(file), `${sport} ${season}: numbers.json`);
      const j = read(file);
      // (the season being played its first days in: the few teams that have played)
      if (!(season === currentSeason(sport) && earlyCurrent(sport))) assert.ok(Object.keys(j).length > 100, `${sport} ${season}: ${Object.keys(j).length} numbers`);
      for (const [id, num] of Object.entries(j)) assert.match(num, /^\d{1,2}$/, `${sport} ${season} ${id}: ${num}`);
    }
  }
  assert.equal(read(path.join(seasonDir('nfl', 2023), 'numbers.json'))['QB-3139477'], '15');
  assert.equal(read(path.join(seasonDir('nba', 2016), 'numbers.json')).jamesle01, '23');
  assert.equal(read(path.join(seasonDir('nhl', 2024), 'numbers.json'))['8478402'], '97');
  assert.equal(read(path.join(seasonDir('mlb', 2022), 'numbers.json'))['H-592450'], '99');
});

test('best-games.<TAB>.json: a card id to its best game, with its date, opponent, title and line', () => {
  for (const sport of SPORTS) {
    for (const season of siteSeasons(sport)) {
      const dir = seasonDir(sport, season);
      const files = readdirSync(dir).filter((f) => /^best-games\.[A-Z0-9]+\.json$/.test(f));
      assert.ok(files.length >= 4, `${sport} ${season}: best-games files`);
      for (const f of files) {
        for (const [id, g] of Object.entries(read(path.join(dir, f)))) {
          const where = `${sport} ${season} ${f} ${id}`;
          assert.match(g.date, /^\d{4}-\d\d-\d\d$/, where);
          assert.equal(typeof g.opp, 'string', where);
          assert.equal(typeof g.home, 'boolean', where);
          assert.ok(g.title && g.line, where);
          assert.ok(Number.isFinite(g.value), where);
          assert.ok(g.games >= 1, where);
          if (g.result) assert.match(g.result, /^[WLT]$/, where);
        }
      }
    }
  }
  const lamar = read(path.join(seasonDir('nfl', 2023), 'best-games.QB.json'))['QB-3916387'];
  assert.equal(lamar.title, 'Wk 17 vs MIA');
  assert.equal(lamar.line, '321 yds · 5 TD');
});

test('milestones.json (MLB): Judge\'s 62 in 2022; each mark its ball\'s words', () => {
  for (const season of siteSeasons('mlb')) {
    const m = read(path.join(seasonDir('mlb', season), 'milestones.json'));
    for (const [id, marks] of Object.entries(m)) for (const x of marks) assert.ok(x.mark && x.big && x.small && x.tip, `${season} ${id}`);
  }
  const judge = read(path.join(seasonDir('mlb', 2022), 'milestones.json'))['H-592450'];
  assert.deepEqual(judge[0], { mark: 'home-runs', big: '62', small: 'HR', tip: '62 home runs' });
});

// ---- the measures
test('the measures: an NFL week, an NBA game, an NHL game, an MLB game', () => {
  assert.deepEqual(nflGame({ passing_yards: '357', passing_tds: '3', rushing_yards: '36', fantasy_points_ppr: '28.4' }, 'QB'), { value: 28.4, line: '357 yds · 3 TD' });
  assert.equal(nflGame({ receptions: '9', receiving_yards: '172', receiving_tds: '2', fantasy_points_ppr: '38.2' }, 'WR').line, '9 rec · 172 yds · 2 TD');
  assert.equal(nflGame({ fg_att: '5', fg_made: '5', fg_long: '56', pat_made: '2' }, 'K').value, 17);
  assert.equal(nflTitle({ season: 2023, week: 7, type: 'REG', opp: 'DET', home: true }), 'Wk 7 vs DET');
  assert.equal(superBowl(2023), 'Super Bowl LVIII');
  const nba = nbaGame({ MIN: '40', FG: '20-30', FT: '9-10', REB: '12', AST: '8', STL: '1', BLK: '0', PF: '2', TO: '3', PTS: '51' });
  assert.equal(nba.line, '51 pts · 12 reb · 8 ast');
  assert.ok(nba.value > 40);
  assert.equal(nhlSkaterGame([2, 2, 4, '+2', 5]).line, '2 G · 2 A · 5 SOG · +2');
  assert.equal(nhlGoalieGame([30, 0]).line, '30 saves · 0 GA · shutout');
  assert.equal(mlbHittingGame({ plateAppearances: 5, atBats: 4, hits: 3, homeRuns: 2, rbi: 5, totalBases: 9, runs: 2 }).value, 16);
  assert.equal(mlbPitchingGame({ outs: 27, hits: 0, strikeOuts: 10, baseOnBalls: 1, runs: 0, homeRuns: 0, earnedRuns: 0, inningsPitched: '9.0' }).value, 102);
  // (a tie: the later game)
  assert.equal(bestOf([{ value: 3, date: '2023-01-01' }, { value: 3, date: '2023-02-01' }]).date, '2023-02-01');
  const marks = milestonesOf('H', { homeRuns: 41 }, [{ date: '2022-06-06', opp: 'SD', home: false, stat: { hits: 4, doubles: 1, triples: 1, homeRuns: 1 } }]);
  assert.deepEqual(marks.map((m) => m.mark), ['cycle', 'home-runs']);
  assert.equal(milestonesOf('P', {}, [{ date: '2022-05-10', opp: 'TB', home: true, stat: { completeGames: 1, hits: 0, outs: 27, battersFaced: 27 } }])[0].mark, 'perfect');
});

// ---- the uniform and helmet tables
test('the uniform tables: every team key, eras oldest first and contiguous, the last one open-ended', async () => {
  const FIRST = { nfl: 2000, nba: 2001, nhl: 2009, mlb: 2000 };
  const hex = /^#[0-9a-f]{6}$/;
  const kitOk = (k, where) => {
    for (const f of ['body', 'num', 'outline', 'name', 'collar']) assert.match(k[f], hex, `${where} ${f}`);
    assert.ok(['stripes', 'none'].includes(k.sleeve), where);
  };
  for (const sport of SPORTS) {
    const { UNIFORM_ERAS } = await loadTs(path.resolve(import.meta.dirname, `../apps/${sport}/src/sport/uniform-eras.ts`));
    const teams = Object.keys(teamTable(sport));
    assert.deepEqual(Object.keys(UNIFORM_ERAS).sort(), [...teams].sort(), `${sport}: keys`);
    for (const [team, eras] of Object.entries(UNIFORM_ERAS)) {
      assert.ok(eras.length >= 1, `${sport} ${team}`);
      assert.ok(eras[0].from >= FIRST[sport], `${sport} ${team}: starts ${eras[0].from}`);
      eras.forEach((e, i) => {
        const where = `${sport} ${team} ${e.from}`;
        kitOk(e.home, `${where} home`);
        kitOk(e.away, `${where} away`);
        if (e.alt) kitOk(e.alt, `${where} alt`);
        if (i < eras.length - 1) {
          assert.ok(e.to >= e.from, where);
          // (a franchise that sat seasons out, the Charlotte NBA team in 2003-04, may skip them)
          assert.ok(eras[i + 1].from > e.to, `${where}: in order`);
        }
      });
    }
  }
  const { HELMET_ERAS } = await loadTs(path.resolve(import.meta.dirname, '../apps/nfl/src/sport/uniform-eras.ts'));
  assert.equal(Object.keys(HELMET_ERAS).length, 32);
  for (const [team, eras] of Object.entries(HELMET_ERAS)) {
    for (const e of eras) {
      assert.match(e.shell, hex, team);
      assert.match(e.mask, hex, team);
      assert.ok(['none', 'single', 'double', 'triple'].includes(e.stripe), team);
    }
    assert.equal(eras.at(-1).to, undefined, `${team}: open-ended`);
  }
});

test('known designs: the Bruins\' yoke and laces, the Rangers\' bands, the Steelers\' stripes, the Cowboys\' numbers, the Jaguars\' plain helmet', async () => {
  const hex = /^#[0-9a-f]{6}$/;
  const { UNIFORM_ERAS: NHL } = await loadTs(path.resolve(import.meta.dirname, '../apps/nhl/src/sport/uniform-eras.ts'));
  const { UNIFORM_ERAS: NFL, HELMET_ERAS } = await loadTs(path.resolve(import.meta.dirname, '../apps/nfl/src/sport/uniform-eras.ts'));
  const era = (eras, season) => eras.find((e) => season >= e.from && season <= (e.to ?? 9999));

  // every hockey sweater says how it's cut: arm bands (or none), a hem, a collar style, a number font
  for (const [team, eras] of Object.entries(NHL)) {
    for (const e of eras) {
      for (const kit of [e.home, e.away, e.alt].filter(Boolean)) {
        const where = `${team} ${e.from}`;
        assert.ok(Array.isArray(kit.bands) || kit.sleeve === 'none', `${where}: bands`);
        for (const c of [...(kit.bands ?? []), ...(kit.hem ?? [])]) assert.match(c, hex, where);
        assert.ok(['v', 'lace', 'round'].includes(kit.collarStyle), `${where}: collar`);
        assert.ok(['block', 'rounded', 'varsity', 'bruins', 'ducks', 'flames', 'sabres', 'wild'].includes(kit.numberFont), `${where}: font`);
        if (kit.yoke) assert.match(kit.yoke, hex, where);
      }
    }
  }
  // the Bruins: a black yoke and a lace collar on the white, laces on the black too, gold-and-white bands
  const bos = era(NHL.BOS, 2019);
  assert.equal(bos.away.yoke, '#111111');
  assert.equal(bos.away.collarStyle, 'lace');
  assert.equal(bos.home.collarStyle, 'lace');
  assert.equal(bos.home.yoke, undefined);
  assert.ok(bos.home.bands.includes('#ffb81c') && bos.home.hem.includes('#ffb81c'));
  // the Rangers: no yoke (the diagonal wordmark leaves the chest clear), red-white-red arm and hem bands,
  // white numbers trimmed red on the blue
  const nyr = era(NHL.NYR, 2022);
  assert.equal(nyr.home.yoke, undefined);
  assert.deepEqual(nyr.home.bands, ['#ce1126', '#f3f2ee', '#ce1126']);
  assert.deepEqual(nyr.home.hem, ['#ce1126', '#f3f2ee', '#ce1126']);
  assert.equal(nyr.home.num, '#f3f2ee');
  assert.equal(nyr.home.outline, '#ce1126');
  // the Canadiens' white: a red yoke; the Leafs' white: a blue one, laces since 2011; the Flyers: wings as a yoke
  assert.equal(era(NHL.MTL, 2015).away.yoke, '#af1e2d');
  assert.equal(era(NHL.TOR, 2015).away.yoke, '#00205b');
  assert.equal(era(NHL.TOR, 2015).away.collarStyle, 'lace');
  assert.equal(era(NHL.TOR, 2010).away.collarStyle, 'v');
  assert.equal(era(NHL.PHI, 2015).home.yoke, '#f3f2ee');
  assert.equal(era(NHL.PHI, 2015).home.sleeve, 'none');

  // the Steelers: gold-black-gold sleeve stripes on the black (black-gold-black on the white), untrimmed white
  // numbers; the gold numbers only on the Color Rush alternate
  const pit = era(NFL.Steelers, 2023);
  assert.deepEqual(pit.home.bands, ['#ffb612', '#000000', '#ffb612']);
  assert.deepEqual(pit.away.bands, ['#000000', '#ffb612', '#000000']);
  assert.equal(pit.home.num, '#ffffff');
  assert.equal(pit.home.outline, '#ffffff');
  assert.equal(pit.alt.num, '#ffb612');
  assert.equal(era(NFL.Steelers, 2010).alt, undefined);
  // the Cowboys: blue numbers trimmed navy on the white home; the Thanksgiving throwback navy with white
  // shoulders and no TV numbers
  const dal = era(NFL.Cowboys, 2023);
  assert.equal(dal.home.body, '#f3f2ee');
  assert.equal(dal.home.num, '#003594');
  assert.equal(dal.home.outline, '#041e42');
  assert.equal(dal.alt.body, '#041e42');
  assert.equal(dal.alt.yoke, '#ffffff');
  assert.equal(dal.alt.tv, false);
  assert.equal(era(NFL.Cowboys, 2016).alt, undefined);
  // the Jaguars: a helmet with no stripe in every era; the 2013-17 black with teal sleeve caps
  for (const e of HELMET_ERAS.Jaguars) assert.equal(e.stripe, 'none');
  assert.equal(era(NFL.Jaguars, 2015).home.cap, '#006778');
  // the Bengals' 2004-20 set had no TV numbers; the Giants' blue is plain; the Panthers' helmet stripe is black
  // in blue; the Lions' 2024 helmet has a blue mask; the Football Team kept its stripes
  assert.equal(era(NFL.Bengals, 2010).home.tv, false);
  assert.equal(era(NFL.Giants, 2010).home.sleeve, 'none');
  assert.deepEqual(era(HELMET_ERAS.Panthers, 2020).colors, ['#101820', '#0085ca']);
  assert.equal(era(HELMET_ERAS.Lions, 2024).mask, '#0076b6');
  assert.equal(era(HELMET_ERAS.Commanders, 2021).stripe, 'triple');
});

test('neutral sites in every sport: Super Bowls and a moved wild card, 2020 bubbles, the 2020 World Series', () => {
  for (const season of siteSeasons('nfl')) {
    const o = outcomesOf('nfl', season);
    const champ = Object.values(o).find((t) => t.result === 'champion');
    if (champ) assert.equal(champ.lastGame.neutral, true, `${season}: the Super Bowl`);
  }
  // (the 2024 Rams' wild card against the Vikings, moved to Glendale by the fires)
  assert.equal(outcomesOf('nfl', 2024).Vikings.lastGame.neutral, true);
  assert.equal(outcomesOf('nfl', 2024).Rams.playoffs[0].neutral, true);
  assert.equal(outcomesOf('nfl', 2024).Rams.lastGame.neutral, undefined, 'the divisional round at PHI');
  // (the NHL's 2020 hubs, the NBA's bubble, MLB's 2020 World Series in Arlington)
  assert.equal(outcomesOf('nhl', 2020).TBL.lastGame.neutral, true);
  assert.equal(outcomesOf('nhl', 2020).TBL.playoffs.at(-1).neutral, true);
  const nba20 = Object.values(outcomesOf('nba', 2020)).find((t) => t.result === 'champion');
  assert.equal(nba20.lastGame.neutral, true);
  assert.equal(nba20.playoffs.at(-1).neutral, true);
  const mlb20 = Object.values(outcomesOf('mlb', 2020)).find((t) => t.result === 'champion');
  assert.equal(mlb20.lastGame.neutral, true);
  // (and an ordinary final at home is not)
  assert.equal(Object.values(outcomesOf('nhl', 2024)).find((t) => t.result === 'champion').lastGame.neutral, undefined);
  assert.equal(Object.values(outcomesOf('nba', 2024)).find((t) => t.result === 'champion').lastGame.neutral, undefined);
  assert.equal(Object.values(outcomesOf('mlb', 2024)).find((t) => t.result === 'champion').lastGame.neutral, undefined);
});

test('the 2023 49ers\' Super Bowl stub reads "49ers vs KC", not "at": a neutral site', async () => {
  const { sceneOutcome } = await loadTs(path.resolve(import.meta.dirname, '../libs/ranker/src/engine/player-card/splash/splash.outcome.ts'));
  const out = path.join(os.tmpdir(), `splash-data-scene-${process.pid}.mjs`);
  await build({ entryPoints: [path.resolve(import.meta.dirname, '../libs/ranker/src/engine/player-card/splash/splash.scene.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  const { buildScene, vsAt } = await import(pathToFileURL(out).href);
  rmSync(out, { force: true });
  assert.equal(vsAt(false, true), 'vs');
  assert.equal(vsAt(true), 'vs');
  assert.equal(vsAt(false), 'at');
  const niners = sceneOutcome(outcomesOf('nfl', 2023)['49ers'], 'nfl', 2023);
  assert.equal(niners.lastGame.neutral, true);
  const s = buildScene({ sport: 'nfl', tab: 'TM', id: 'TM-49ers', season: 2023, seasonLabel: '2023', current: false, team: true, name: 'San Francisco 49ers', teamName: 'San Francisco 49ers', abbr: 'SF', awards: [{ id: 'conf', title: '2023 NFC Champion' }], outcome: niners });
  const stub = s.items.find((i) => i.t === 'stub');
  assert.ok(stub, 'the ticket stub of the game it ended in');
  assert.equal(stub.lines[1], '49ers vs KC');
  // (the Chiefs' game ball: W ... vs SF)
  assert.match(sceneOutcome(outcomesOf('nfl', 2023).Chiefs, 'nfl', 2023).gameBall.tip, /^W 25-22 OT vs SF/);
});

// ---- the card's reading of the files (libs/ranker/src/engine/player-card/splash/splash.outcome.ts)
test('the scene reads outcomes: a champion its title game, a finalist its stub, a near miss the bubble', async () => {
  const { sceneOutcome } = await loadTs(path.resolve(import.meta.dirname, '../libs/ranker/src/engine/player-card/splash/splash.outcome.ts'));
  const chiefs = sceneOutcome(outcomesOf('nfl', 2023).Chiefs, 'nfl', 2023);
  assert.equal(chiefs.result, 'champion');
  assert.deepEqual(chiefs.lastGame, { round: 'Super Bowl LVIII', opp: 'SF', home: true, neutral: true, score: '25-22 OT', won: true, date: 'Feb 11, 2024' });
  assert.equal(chiefs.gameBall.title, 'Super Bowl LVIII');
  assert.equal(chiefs.division, 'AFC West');
  assert.deepEqual(chiefs.roundWon, { round: 'AFC Championship', result: 'W 17-10 at BAL' });
  const niners = sceneOutcome(outcomesOf('nfl', 2023)['49ers'], 'nfl', 2023);
  assert.equal(niners.result, 'finalist');
  assert.equal(niners.confChamp, true);
  assert.equal(niners.lastGame.won, false);
  const texans = sceneOutcome(outcomesOf('nfl', 2024).Texans, 'nfl', 2024);
  assert.equal(texans.result, 'playoffs');
  assert.equal(texans.division, 'AFC South');
  assert.equal(texans.roundWon.round, 'Wild Card');
  const jags = sceneOutcome(outcomesOf('nfl', 2024).Jaguars, 'nfl', 2024);
  assert.equal(jags.result, 'missed');
  assert.equal(jags.lastGame.round, 'Regular season');
  const bengals = sceneOutcome(outcomesOf('nfl', 2024).Bengals, 'nfl', 2024);
  assert.equal(bengals.result, 'bubble');
  assert.equal(bengals.missedBy, 'a game');
  // (a season still being played: no outcome yet)
  assert.equal(sceneOutcome({ ...outcomesOf('nfl', 2024).Jaguars, over: false, result: null }, 'nfl', 2024), null);
});
