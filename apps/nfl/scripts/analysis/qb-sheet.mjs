// The numbers a QB's sheet works out for its report, so the report quotes them instead of doing the
// arithmetic itself (the rule every NFL report follows since 2026-10-14: cite only numbers in the dossier).
// What the QB previews used to compute on their own: a game's averages, a stretch of games against the
// season (the last 3 and the last 5), the change from last season, the gap to the league's average, his
// line in the games he started, a 17-game pace, a split's EPA added up. And who gets a season-end recap:
// a QB with 4 or more regular-season starts that season. Plain data in, data out: tests/nfl-qb-sheet.test.mjs.

const num = (v) => (v === '' || v === undefined || v === null || v === 'NA' ? null : Number(v));
const r = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const sum = (rows, k) => rows.reduce((t, x) => t + (num(x[k]) ?? 0), 0);
const div = (a, b) => (b ? a / b : null);
const recordText = (w, l, t) => `${w}-${l}${t ? `-${t}` : ''}`;
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

// ---- the season-end recap: only a QB who started enough of the season

export const RECAP_MIN_STARTS = 4;
// A QB's report: his team's season on, the weekly preview; over, his recap with 4+ regular-season starts,
// else nothing (no recap, and no more previews: the same stop a recap is)
export const qbModeOf = (teamOver, starts) => (!teamOver ? 'preview' : starts >= RECAP_MIN_STARTS ? 'recap' : null);

// The regular-season games a QB started (the schedule's starters: nflverse's home_qb_id / away_qb_id).
//   games  { id, type, homeQbId, awayQbId, homeScore }
export const startsOf = (games, gsis) => games.filter((g) => g.type === 'REG' && g.homeScore !== null && g.homeScore !== undefined && (g.homeQbId === gsis || g.awayQbId === gsis)).map((g) => g.id);

// ---- a line from his weekly rows (nflverse's weekly player stats; result: his team's W, L or T that game)

const RATES = ['cmpPct', 'ypa', 'anyPerDropback', 'passEpaPerDropback', 'cpoe', 'sackPct', 'tdPct', 'intPct'];
const PER_GAME = ['attempts', 'completions', 'passYards', 'passTds', 'ints', 'sacks', 'passEpa', 'carries', 'rushYards', 'pprPts'];

// The unrounded line (rates and a game's averages); rounded by lineOf
function raw(rows) {
  const s = (k) => sum(rows, k);
  const n = rows.length;
  const att = s('attempts');
  const db = att + s('sacks_suffered');
  const cpoeRows = rows.filter((x) => num(x.attempts) >= 5 && num(x.passing_cpoe) !== null);
  const totals = {
    attempts: att,
    completions: s('completions'),
    passYards: s('passing_yards'),
    passTds: s('passing_tds'),
    ints: s('passing_interceptions'),
    sacks: s('sacks_suffered'),
    passEpa: s('passing_epa'),
    carries: s('carries'),
    rushYards: s('rushing_yards'),
    rushTds: s('rushing_tds'),
    pprPts: s('fantasy_points_ppr'),
  };
  return {
    games: n,
    totals,
    rates: {
      cmpPct: div(totals.completions * 100, att),
      ypa: div(totals.passYards, att),
      anyPerDropback: div(totals.passYards + 20 * totals.passTds - 45 * totals.ints - s('sack_yards_lost'), db),
      passEpaPerDropback: div(totals.passEpa, db),
      cpoe: cpoeRows.length ? cpoeRows.reduce((t, x) => t + num(x.passing_cpoe), 0) / cpoeRows.length : null,
      sackPct: div(totals.sacks * 100, db),
      tdPct: div(totals.passTds * 100, att),
      intPct: div(totals.ints * 100, att),
    },
    perGame: Object.fromEntries(PER_GAME.map((k) => [k, div(totals[k], n)])),
  };
}
const DIGITS = { ypa: 2, anyPerDropback: 2, passEpaPerDropback: 3, cpoe: 1, passEpa: 1, pprPts: 1, passTds: 2, ints: 2, timeToThrow: 2 };
const round = (o) => compact(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v, DIGITS[k] ?? 1)])));

// A stretch of games, as the sheet shows it: the weeks, his team's record in them, the totals, the rates,
// a game's averages
export function lineOf(rows) {
  if (!rows.length) return null;
  const x = raw(rows);
  const weeks = rows.map((w) => Number(w.week));
  const res = rows.map((w) => w.result).filter(Boolean);
  return {
    games: x.games,
    weeks: weeks.length > 1 ? `W${weeks[0]}-W${weeks.at(-1)}` : `W${weeks[0]}`,
    ...(res.length ? { record: recordText(...['W', 'L', 'T'].map((k) => res.filter((y) => y === k).length)) } : {}),
    cmpAtt: `${x.totals.completions}/${x.totals.attempts}`,
    ...compact({ passYards: x.totals.passYards, passTds: x.totals.passTds, ints: x.totals.ints, sacks: x.totals.sacks, passEpa: r(x.totals.passEpa, 1), rushYards: x.totals.carries ? x.totals.rushYards : null, rushTds: x.totals.rushTds || null }),
    ...round(x.rates),
    perGame: round(x.perGame),
  };
}

// A game's averages for the season: passing and rushing, ranked among the position's qualifiers where a
// ranker is given ({ passYards: (v) => [v, rank, of] })
export function perGameOf(rows, rankers = {}) {
  if (!rows.length) return null;
  const pg = round(raw(rows).perGame);
  return Object.fromEntries(Object.entries(pg).map(([k, v]) => [k, rankers[k] ? rankers[k](v) : v]));
}

// At his rate a game over a 17-game season
export function paceOf(rows, games = 17) {
  if (!rows.length) return null;
  const pg = raw(rows).perGame;
  return { games, ...compact(Object.fromEntries(['passYards', 'passTds', 'ints', 'sacks', 'rushYards'].map((k) => [k, pg[k] === null ? null : Math.round(pg[k] * games)]))) };
}

// The change: a minus b, key by key, rounded as the sheet shows each
const change = (a, b, keys) => compact(Object.fromEntries(keys.filter((k) => a[k] !== null && a[k] !== undefined && b[k] !== null && b[k] !== undefined).map((k) => [k, r(a[k] - b[k], DIGITS[k] ?? 1)])));

// The last n games against the whole season (none until he has played more than n): the stretch's line
// and its change from the season's rates and a game's averages (stretch minus season)
export function recentOf(rows, n) {
  if (rows.length <= n) return null;
  const sorted = [...rows].sort((a, b) => Number(a.week) - Number(b.week));
  const last = sorted.slice(-n);
  const [s, l] = [raw(sorted), raw(last)];
  return {
    ...lineOf(last),
    vsSeason: { ...change(l.rates, s.rates, RATES), perGame: change(l.perGame, s.perGame, ['passYards', 'passTds', 'ints', 'sacks', 'passEpa', 'rushYards']) },
  };
}

// His line in the games he started, when he also played in some he didn't (a relief or mop-up game)
export function asStarterOf(rows, startedIds) {
  const started = rows.filter((w) => startedIds.includes(w.game_id));
  if (!started.length || started.length === rows.length) return null;
  const { games, ...line } = lineOf(started);
  return { starts: games, ...line };
}

// This season against his last (the career line from the site's archive: rates as [value, rank, of], his
// season's passing and rushing yards over its games): last season's values and the change (this season
// minus last)
//   rows      his weekly rows this season
//   tracking  { timeToThrow, aggressivenessPct } (Next Gen Stats); pressure { badThrowPct: [v, rank, of] }
export function vsLastSeasonOf({ rows, tracking = null, pressure = null }, last) {
  if (!rows.length || !last?.games) return null;
  const v = (x) => (Array.isArray(x) ? x[0] : (x ?? null));
  const pg = (x) => (v(x) === null ? null : v(x) / last.games);
  const then = {
    rates: { cmpPct: v(last.compPct), ypa: v(last.ypa), cpoe: v(last.cpoe), timeToThrow: v(last.timeToThrow), aggressivenessPct: v(last.aggressiveness), badThrowPct: v(last.badThrowPct) === null ? null : v(last.badThrowPct) * 100 },
    perGame: { passYards: pg(last.passYards), passTds: pg(last.passTds), ints: pg(last.ints), rushYards: pg(last.rushYards) },
  };
  const x = raw(rows);
  const now = { ...x.rates, timeToThrow: tracking?.timeToThrow ?? null, aggressivenessPct: tracking?.aggressivenessPct ?? null, badThrowPct: v(pressure?.badThrowPct) };
  return {
    season: last.season,
    lastSeason: { games: last.games, ...round(then.rates), perGame: round(then.perGame) },
    change: { ...change(now, then.rates, Object.keys(then.rates)), perGame: change(x.perGame, then.perGame, Object.keys(then.perGame)) },
  };
}

// The league: the qualifiers' average of each rate and a game's passing yards, and his gap to it (his
// minus the average). lines: each qualifier's weekly rows.
export function leagueAverageOf(lines) {
  const xs = lines.filter((rows) => rows.length).map(raw);
  if (!xs.length) return null;
  const avg = (f) => {
    const v = xs.map(f).filter((y) => y !== null && Number.isFinite(y));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return { ...Object.fromEntries(RATES.map((k) => [k, avg((x) => x.rates[k])])), passYardsPerGame: avg((x) => x.perGame.passYards) };
}
export function vsLeagueOf(rows, league) {
  if (!rows.length || !league) return null;
  const x = raw(rows);
  const his = { ...x.rates, passYardsPerGame: x.perGame.passYards };
  const keys = [...RATES, 'passYardsPerGame'];
  return { leagueAverage: round(Object.fromEntries(keys.map((k) => [k, league[k]]))), overAverage: change(his, league, keys) };
}
