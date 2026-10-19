// The props' context terms (several a stat, each its own size; an old state's single c still read), the game
// script for a goalie's saves (the other side's expected shots), the weather's rain and snow, and the NFL's
// schedule facts (libs/ranker/scripts/model/project.mjs, props.mjs, sources.mjs, football.mjs, context.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctxFactor, ctxKeys, makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { CTX, STATS, ctxValues, scriptValue } from '../libs/ranker/scripts/model/props.mjs';
import { gameWindow } from '../libs/ranker/scripts/model/sources.mjs';
import { fieldKind, hourAt } from '../libs/ranker/scripts/model/football.mjs';
import { weatherOf } from '../libs/ranker/scripts/model/context.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('ctxKeys: one name or a list', () => {
  assert.deepEqual(ctxKeys({ ctx: 'wind' }), ['wind']);
  assert.deepEqual(ctxKeys({ ctx: ['wind', 'cold'] }), ['wind', 'cold']);
  assert.deepEqual(ctxKeys({}), []);
  assert.deepEqual(ctxKeys(STATS.nfl.find((s) => s.key === 'recYds')), ['backupQb', 'wind', 'precip', 'newCoach', 'qb1Out']);
  // (the lead back out: measured and on no stat's (props.mjs), receptions' held out at the rounding's floor)
  // (and a pass-catcher's yards after the catch over expected, the feeds round's (2026-10-18, soft: tests/model-ngs))
  assert.deepEqual(ctxKeys(STATS.nfl.find((s) => s.key === 'rec')), ['backupQb', 'wind', 'precip', 'newCoach', 'qb1Out', 'qbDeep', 'yacoe']);
  assert.ok(STATS.nfl.every((s) => !ctxKeys(s).includes('rb1Out')));
  // (the midseason flag and the lead back out on his quarterback's volume (rbOutPass): measured (round D, 2026-10-17)
  // and on no stat's ctx; a backup quarterback's own rushing (backupRun) on carries alone)
  assert.ok(STATS.nfl.every((s) => !ctxKeys(s).includes('midSeason')));
  assert.ok(STATS.nfl.every((s) => !ctxKeys(s).includes('rbOutPass')));
  assert.deepEqual(STATS.nfl.filter((s) => ctxKeys(s).includes('backupRun')).map((s) => s.key), ['rushAtt']);
  assert.deepEqual(ctxKeys(STATS.nfl.find((s) => s.key === 'passAtt')), ['wind', 'cold', 'precip', 'newCoach', 'lastGame', 'aggr']);
  assert.deepEqual(ctxKeys(STATS.nfl.find((s) => s.key === 'passInt')), ['wind', 'cold', 'precip', 'newCoach', 'mSpread']);
  assert.deepEqual(ctxKeys(STATS.nfl.find((s) => s.key === 'rushAtt')), ['backupQb', 'wind', 'precip', 'newCoach', 'qb1Out', 'backupRun', 'ryoeP']);
});

test("ctxFactor: each term its own size; an old state's single c is the first term's; unknown values no effect", () => {
  const st = { ctx: ['wind', 'precip'] };
  close(ctxFactor(st, { c_wind: -0.15, c_precip: -0.07 }, [2, 3]), Math.exp(-0.3 - 0.21));
  close(ctxFactor(st, { c: -0.15 }, [2, 3]), Math.exp(-0.3));
  close(ctxFactor(st, { c_wind: -0.15, c_precip: 0 }, [2, 3]), Math.exp(-0.3));
  close(ctxFactor(st, { c_wind: -0.15 }, [NaN, 3]), 1);
  close(ctxFactor(st, {}, null), 1);
});

test('ctxValues: weather outdoors only, backups and teammates by side, the blowout either way', () => {
  const info = { weather: { wind: 25, temp: 30, precip: 0.8 }, starters: { backup: [0, 1.5], missing: [20, 0] }, b2b: [1, 0] };
  assert.deepEqual(ctxValues(['wind', 'cold', 'precip'], info, true, null), [1.5, 2, 5]);
  assert.deepEqual(ctxValues(['backupQb', 'usage', 'b2b'], info, false, null), [1.5, 0, 0]);
  assert.deepEqual(ctxValues(['backupQb', 'usage', 'b2b'], info, true, null), [0, 2, 1]);
  // (a dome: no weather in the info, no effect)
  assert.deepEqual(ctxValues(['wind', 'cold', 'precip'], { weather: { roof: 'dome' } }, true, null), [0, 0, 0]);
  close(CTX.blowout(null, true, [120, 104]), 1.6);
  close(CTX.blowout(null, false, [104, 120]), 1.6);
  assert.equal(CTX.blowout(null, true, null), 0);
});

test("scriptValue: a side's expected points over the average; a goalie's saves also by the other side's expected shots (a log, its size a power)", () => {
  const env = { avg: 110 };
  close(scriptValue({}, env, null, [121, 99], true), 1.1);
  close(scriptValue({ script: 'opp' }, env, null, [121, 99], true), 0.9);
  close(scriptValue({ script: 'opp' }, env, null, [121, 99], false), 1.1);

  close(CTX.oppShots({ more: { shots: [33, 27], shotsAvg: 30 } }, true), Math.log(0.9));
  close(CTX.oppShots({ more: { shots: [33, 27], shotsAvg: 30 } }, false), Math.log(1.1));
  assert.equal(CTX.oppShots({}, true), 0);
});

test('makeModel: the projection carries every context term at its size', () => {
  const st = { key: 'v', ctx: ['wind', 'precip'] };
  const env = { ctx: (row) => row.cv, script: () => 1, mean: 10 };
  const params = { K: 4, w: 0, a: 0, b: 0, c_wind: -0.1, c_precip: -0.2 };
  const m = makeModel(st, params, env);
  const row = (game, v, cv) => ({ pid: '1', pos: 'WR', date: `2025-09-0${game}T17:00Z`, season: 2025, team: 'a', opp: 'b', game: String(game), home: true, s: { v }, cv });
  m.learn([row(1, 10, [0, 0])]);
  m.learn([row(2, 10, [0, 0])]);
  const calm = m.project(row(3, 0, [0, 0]));
  const wet = m.project(row(3, 0, [1, 2]));
  close(wet.mu / calm.mu, Math.exp(-0.1 - 0.4));
  close(wet.ctxF, Math.exp(-0.5));
});

test("gameWindow: the four hours from kickoff's, rain and snow summed; a gap there, null", () => {
  const h = { precipitation: [0, 0.1, 0.2, 0, 0.05, 1], snowfall: [0, 0, 0.5, 0.5, 0, 0] };
  assert.deepEqual(gameWindow(h, 1), { precip: 0.35, snow: 1 });
  assert.equal(gameWindow(h, 4), null);
  assert.equal(gameWindow({ precipitation: [0, null, 0, 0], snowfall: [] }, 0), null);
});

test("weatherOf: StatsAPI's report with whether it's raining (not under a roof)", () => {
  assert.deepEqual(weatherOf({ temp: '61', condition: 'Rain', wind: '8 mph, Out To CF' }), [61, 8, 0, 1]);
  assert.deepEqual(weatherOf({ temp: '72', condition: 'Partly Cloudy', wind: '5 mph, In From LF' }), [72, -3.5, 0, 0]);
  assert.deepEqual(weatherOf({ temp: '72', condition: 'Roof Closed', wind: '0 mph, None' }), [72, 0, 1, 0]);
  assert.equal(weatherOf({ temp: '' }), null);
});

test("hourAt and fieldKind: a team's own clock at kickoff (Arizona keeps standard time); grass or turf", () => {
  // (1 p.m. Eastern on a September Sunday: 10 a.m. in Seattle and Arizona, 11 in Denver, noon in Chicago)
  const t = '2025-09-14T17:00Z';
  assert.equal(hourAt('NE', t), 13);
  assert.equal(hourAt('SEA', t), 10);
  assert.equal(hourAt('ARI', t), 10);
  assert.equal(hourAt('DEN', t), 11);
  assert.equal(hourAt('CHI', t), 12);
  // (after the clocks go back, Arizona is two hours behind Eastern)
  assert.equal(hourAt('ARI', '2025-12-07T18:00Z'), 11);
  assert.equal(fieldKind('grass '), 'grass');
  assert.equal(fieldKind('dessograss'), 'grass');
  assert.equal(fieldKind('fieldturf'), 'turf');
  assert.equal(fieldKind(''), null);
});

test('WEATHER.nfl: rain only once the archive has filled the history, a forecast at half, a retractable roof unknown', async () => {
  const { WEATHER, FORECAST_WET } = await import('../libs/ranker/scripts/model/context.mjs');
  const rows = new Map([
    ['f1', { roof: 'outdoors', temp: '40', wind: '15', stadium_id: 'A' }],
    ['f2', { roof: 'outdoors', temp: '60', wind: '5', stadium_id: 'A' }],
    ['c1', { roof: 'outdoors', temp: '', wind: '', stadium_id: 'A' }],
    ['o1', { roof: 'open', temp: '70', wind: '0', stadium_id: 'R' }],
    ['c2', { roof: '', temp: '', wind: '', stadium_id: 'R' }],
  ]);
  const live = new Map([
    ['c1', { weather: { temp: 35, wind: 20, precip: 0.4, snow: 0 } }],
    ['c2', {}],
  ]);
  const facts = (share) => ({ nfl: rows, wx: { f1: [0.3, 0] }, wxCover: { share, of: 100 } });
  // (filled: a final's rain as it fell, one not filled unknown (no effect), a coming game's at half)
  let w = WEATHER.nfl(facts(0.97), live);
  assert.equal(w({ id: 'f1', final: true }).terms.precip, 3);
  assert.equal(w({ id: 'f2', final: true }).terms.precip, 0);
  assert.equal(w({ id: 'f2', final: true }).info.precip, null);
  const c = w({ id: 'c1', final: false });
  assert.equal(c.info.precip, 0.4 * FORECAST_WET);
  assert.equal(c.info.precipForecast, 0.4);
  assert.equal(c.terms.precip, 0.4 * FORECAST_WET * 10);
  // (not filled yet: no rain anywhere, the wind and cold as before)
  w = WEATHER.nfl(facts(0.5), live);
  assert.equal(w({ id: 'f1', final: true }).terms.precip, 0);
  assert.equal(w({ id: 'c1', final: false }).terms.precip, 0);
  assert.equal(w({ id: 'c1', final: false }).info.rainUnfit, true);
  assert.equal(w({ id: 'f1', final: true }).terms.wind, 1);
  // (a coming game under a retractable roof that's been open: unknown, marked missing, no game flag)
  assert.deepEqual(w({ id: 'c2', final: false }), { info: { roof: 'retractable', missing: true } });
});

test("selectTerms (the loss review's B7): a term dropped while a correlated one was in is taken back once that one leaves, where it pays its 1 nat", async () => {
  const { selectTerms } = await import('../libs/ranker/scripts/model/ratings.mjs');
  // (a and b carry the same signal (either alone 2 nats, both together 2.2); c is noise. Per game scores over n = 100)
  const n = 100;
  const nats = (on) => (on.has('a') || on.has('b') ? 2 : 0) + (on.has('a') && on.has('b') ? 0.2 : 0) + (on.has('c') ? 0.3 : 0);
  const gates = ['a', 'b', 'c'];
  const runOf = (off) => ({ score: -nats(new Set(gates.filter((g) => !off.has(g)))) / n, off: [...off] });
  const off = new Set();
  const best = selectTerms(gates, off, runOf(off), runOf, n);
  // (a leaves first (b covers it), then b alone pays 2 nats and stays; c never pays)
  assert.deepEqual([...off].sort(), ['a', 'c']);
  assert.ok(Math.abs(best.score - -2 / n) < 1e-12);
  // (a greedy drop that left both out is undone: the best one back)
  const both = new Set(['a', 'b', 'c']);
  selectTerms(gates, both, runOf(both), runOf, n);
  assert.equal(both.size, 2);
  assert.ok(!both.has('a') || !both.has('b'));
});

// ---- the schedule's situations (the misses round, 2026-10-19; DECISIONS.md D34) ----

test("zoneOf, daylightAt, clockAt: a place's clock from its coordinates; outside North America none", async () => {
  const { zoneOf, daylightAt, clockAt } = await import('../libs/ranker/scripts/model/context.mjs');
  const LA = [34.05, -118.24];
  const NY = [40.71, -74.0];
  const DEN = [39.74, -104.99];
  const PHX = [33.45, -112.07];
  const CGY = [51.05, -114.07];
  const LV = [36.17, -115.14];
  const IND = [39.77, -86.16];
  const NSH = [36.16, -86.78];
  assert.deepEqual([zoneOf(LA), zoneOf(NY), zoneOf(DEN), zoneOf(CGY), zoneOf(LV), zoneOf(IND), zoneOf(NSH)], [-8, -5, -7, -7, -8, -5, -6]);
  assert.equal(zoneOf([51.5, -0.1]), null, 'London: no clock read');
  assert.equal(zoneOf(null), null);
  // (a 10 PM Eastern tip in January: 7 PM by a Los Angeles clock; in July Phoenix keeps standard time)
  const jan = Date.parse('2026-01-15T03:00Z');
  assert.equal(clockAt(jan, NY), 22);
  assert.equal(clockAt(jan, LA), 19);
  assert.equal(daylightAt(jan, NY), false);
  const jul = Date.parse('2026-07-15T02:00Z');
  assert.equal(daylightAt(jul, DEN), true);
  assert.equal(daylightAt(jul, PHX), false);
  assert.equal(clockAt(jul, DEN), 20);
  assert.equal(clockAt(jul, PHX), 19);
  // (the second Sunday of March 2026 is the 8th; the first of November the 1st)
  assert.equal(daylightAt(Date.parse('2026-03-08T12:00Z'), NY), true);
  assert.equal(daylightAt(Date.parse('2026-03-07T12:00Z'), NY), false);
  assert.equal(daylightAt(Date.parse('2026-11-01T12:00Z'), NY), false);
  assert.equal(daylightAt(Date.parse('2026-10-31T12:00Z'), NY), true);
  assert.equal(clockAt(jan, [51.5, -0.1]), null);
});

// (a made-up schedule: an East team (home Boston) and a West team (home Los Angeles) and two more, over a fortnight;
// the places by venue)
function schedule() {
  const places = { 'Boston|MA|USA': [42.36, -71.06], 'Los Angeles|CA|USA': [34.05, -118.24], 'Denver|CO|USA': [39.74, -104.99], 'Chicago|IL|USA': [41.88, -87.63] };
  const elev = { 'Denver|CO|USA': 1609, 'Boston|MA|USA': 5, 'Los Angeles|CA|USA': 90, 'Chicago|IL|USA': 180 };
  const g = (id, date, home, away, venue, hs, as) => ({ id, date, season: 2026, type: 2, home, away, homeAbbr: home, awayAbbr: away, neutral: false, final: hs !== null, hs, as, venue });
  const games = [
    g('1', '2026-01-02T00:00Z', 'E', 'C', 'Boston|MA|USA', 100, 70),
    g('2', '2026-01-03T00:00Z', 'W', 'D', 'Los Angeles|CA|USA', 90, 120),
    g('3', '2026-01-04T00:00Z', 'E', 'D', 'Boston|MA|USA', 100, 99),
    g('4', '2026-01-05T00:00Z', 'C', 'E', 'Chicago|IL|USA', 95, 100),
    g('5', '2026-01-06T00:00Z', 'D', 'E', 'Denver|CO|USA', 95, 100),
    // (the East team's third road game in a row, a 10 PM Eastern tip in Los Angeles)
    g('6', '2026-01-08T03:00Z', 'W', 'E', 'Los Angeles|CA|USA', 100, 90),
    // (the West team home again the next night, off a win by 10; its home stand runs on)
    g('7', '2026-01-09T03:00Z', 'W', 'C', 'Los Angeles|CA|USA', 100, 80),
    g('8', '2026-01-11T00:00Z', 'E', 'W', 'Boston|MA|USA', null, null),
  ];
  return { games, facts: { places, elev } };
}

test('featurize: the schedule terms from the games alone, each soft; a coming game gets them too', async () => {
  const { featurize, SCHEDULE_TERMS, BLOWOUT } = await import('../libs/ranker/scripts/model/context.mjs');
  const { LEAGUES } = await import('../libs/ranker/scripts/model/leagues.mjs');
  const { games, facts } = schedule();
  const f = featurize('nba', LEAGUES.nba, games, facts, new Map());
  const at = (id, key) => {
    const i = f.terms.m.findIndex((t) => t.key === key);
    if (i >= 0) return f.feats.get(id).m[i];
    return f.feats.get(id).t[f.terms.t.findIndex((t) => t.key === key)];
  };
  for (const t of SCHEDULE_TERMS.nba) assert.equal(t.soft, true, `${t.key} is soft`);
  assert.equal(BLOWOUT.nba, 20);
  // game 6: the East team (away) sits three zones west of its home clock; the tip at 10 PM Eastern is an hour past 9
  // by its clock, none by the West team's own (7 PM); its third road game in a row (4 at Chicago, 5 at Denver, 6 here)
  // is not yet a long trip; the West team's stand runs from game 2, so it's no opener
  assert.equal(at('6', 'tzHome'), -3);
  assert.equal(at('6', 'tzMove'), -1, 'E flew Denver to Los Angeles, one zone west; W stayed');
  assert.equal(at('8', 'tzMove'), 0, 'both flew Los Angeles to Boston: the difference is 0');
  assert.equal(at('5', 'tzMove'), 1, 'E came from Chicago (one zone west), D from Boston (two): the home side moved more');
  assert.equal(at('2', 'tzMove'), -1, "a season's first game counts from home: D from Denver");
  assert.equal(at('6', 'clockLate'), 1);
  assert.equal(at('6', 'clockEarly'), 0);
  assert.equal(at('6', 'tripLong'), 0, 'the third road game is not yet a long trip');
  assert.equal(at('6', 'firstHome'), 0);
  assert.equal(at('6', 'density7'), 5 - 2, 'E has played 5 in 7 nights (games 1, 3, 4, 5, 6), W 2 (games 2, 6)');
  // game 7: the West team is off a win by 10 (no blowout), Chicago off a loss by 5: no letdown, no bounce; the game is
  // not at altitude
  assert.equal(at('7', 'letdown'), 0);
  assert.equal(at('7', 'bounce'), 0);
  assert.equal(at('7', 'altitudeT'), 0);
  // game 2: the West team's first game, D's too: no last game, so every term off the last game is 0; the clocks are the
  // schedule's (D's home is Denver, one zone east of Los Angeles: tzHome -1 for the away side)
  for (const key of ['clockLate', 'letdown', 'bounce', 'density7', 'tripLong', 'letdownT']) assert.equal(at('2', key), 0, `${key} at a first game`);
  assert.equal(at('2', 'tzHome'), -1);
  // game 3: E won game 1 by 30 and D won game 2 by 30 (120-90 at Los Angeles): both off a blowout win, so the margin's
  // letdown cancels (0) and the total's letdownT counts both (2); no bounce
  assert.equal(at('3', 'letdown'), 0);
  assert.equal(at('3', 'bounce'), 0);
  assert.equal(at('3', 'letdownT'), 2);
  // game 6: W is off its blowout loss of game 2 (a bounce for the home side: -1); E off a win by 5
  assert.equal(at('6', 'bounce'), -1);
  assert.equal(at('6', 'letdown'), 0);
  // game 5 at Denver: altitude on the total
  assert.equal(at('5', 'altitudeT'), 1);
  assert.equal(at('5', 'tripLong'), 0);
  // game 8, a coming game: E home after its trip (its stand opens: firstHome 1); W (away) sits three zones east of its
  // home clock; the 7 PM Eastern tip is 4 PM by its clock: neither late nor early
  assert.equal(at('8', 'firstHome'), 1);
  assert.equal(at('8', 'tzHome'), 3);
  assert.equal(at('8', 'clockLate'), 0);
  assert.equal(at('8', 'clockEarly'), 0);
  assert.equal(at('8', 'tripLong'), 0);
  assert.deepEqual(f.feats.get('6').info.schedule.tzHome, [0, -3]);
  // (no places at all: every clock term 0, nothing thrown)
  const bare = featurize('nba', LEAGUES.nba, games, {}, new Map());
  for (const key of ['tzHome', 'clockLate', 'clockEarly']) assert.equal(bare.feats.get('6').m[bare.terms.m.findIndex((t) => t.key === key)], 0);
  // (the lopsided matchup is a dynamic term: 0 as featurized, set from the ratings' own expectation as a game is
  // predicted, the replay's and a coming game's alike)
  const { dynamicTerms, setDynamic, replay } = await import('../libs/ranker/scripts/model/ratings.mjs');
  const lop = f.terms.t.find((t) => t.key === 'lopsidedT');
  assert.deepEqual(lop.dyn, { of: 'absMargin', center: 6 });
  assert.equal(lop.soft, true);
  assert.equal(at('6', 'lopsidedT'), 0);
  const dyn = dynamicTerms(f.terms);
  assert.deepEqual(dyn.map((d) => [d.on, d.t.key]), [['t', 'lopsidedT']]);
  const probe = { m: [], t: f.terms.t.map(() => 0) };
  setDynamic(dyn, probe, { margin: -10.5 });
  assert.equal(probe.t[dyn[0].i], 4.5);
  setDynamic(dyn, probe, { margin: 2 });
  assert.equal(probe.t[dyn[0].i], -4);
  // (in the replay: each final's value is its own expectation's, set before the fit reads it)
  const seenValues = [];
  replay(games, { ...LEAGUES.nba.priors }, 0, { feats: f.feats, terms: f.terms, scale: { m: f.terms.m.map(() => 1), t: f.terms.t.map(() => 1) }, lambda: 64, lambdaSet: null, lambdaSoft: 64, off: new Set() }, (g, e) => seenValues.push([g.id, f.feats.get(g.id).t[dyn[0].i]]));
  assert.equal(seenValues.length, 7);
  assert.ok(seenValues.every(([, v]) => Number.isFinite(v)));
  assert.ok(seenValues.some(([, v]) => v !== 0), 'the expectation moves the term once the ratings have learned');
});

test("fitContext: a soft term is never gated off; it is shrunk at its own ridge, never under the fit's; a nothing stays near 0", async () => {
  const { fitContext, gateOf } = await import('../libs/ranker/scripts/model/ratings.mjs');
  const { term } = await import('../libs/ranker/scripts/model/terms.mjs');
  // (a made-up season: a real soft term worth 3 points a game, a noise soft term, a real gated term; seeded)
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
  const games = [];
  const feats = new Map();
  const terms = { m: [term('real', 'x', 'm', 'Real', 'u'), { ...term('softReal', 'x', 'm', 'Soft real', 'u'), soft: true }, { ...term('softNoise', 'x', 'm', 'Soft noise', 'u'), soft: true }], t: [] };
  let day = Date.parse('2026-01-01T00:00Z');
  for (let i = 0; i < 900; i++) {
    const h = teams[i % 6];
    const a = teams[(i + 1 + Math.floor(i / 6)) % 6];
    if (h === a) continue;
    const x = [rnd() < 0.5 ? 1 : -1, rnd() < 0.5 ? 1 : -1, rnd() < 0.5 ? 1 : -1];
    const margin = Math.round(2 + 3 * x[0] + 3 * x[1] + 10 * gauss());
    const id = String(i);
    games.push({ id, date: new Date((day += 36e5 * 8)).toISOString(), season: 2026, type: 2, home: h, away: a, final: true, hs: 100 + margin, as: 100 });
    feats.set(id, { m: x, t: [] });
  }
  const params = { k: 0.05, hfa: 2, revert: 0.7, kO: 0.03, sigma: 12, sigmaT: 18, avg: 100 };
  const fit = fitContext(games, params, feats, terms);
  assert.ok(!fit.ctx.off.has('softReal') && !fit.ctx.off.has('softNoise'), 'soft terms are in, never gated one by one');
  assert.ok(fit.ctx.lambdaSoft >= fit.ctx.lambda, "the soft ridge is never under the fit's");
  const size = (key) => fit.weights.m[terms.m.findIndex((t) => t.key === key)];
  assert.ok(size('softReal') > 1.5 && size('softReal') < 3.5, `the real soft term earns its size (${size('softReal')})`);
  assert.ok(Math.abs(size('softNoise')) < 0.8, `the noise stays near 0 (${size('softNoise')})`);
  assert.ok(size('real') > 1.5, `the gated real term is in (${size('real')})`);
  assert.equal(gateOf(terms.m[1]), 'softReal');
});
