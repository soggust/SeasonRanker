// What the model knows about a game beyond the two teams' ratings: rest and travel, who starts (an NFL
// team's quarterback, an NBA team's top players, an NHL team's goalie, an MLB team's pitcher) and the weather
// at an outdoor game. Each is turned into a few numbers (terms) whose sizes the replay fits from history
// (ratings.mjs); this file only gathers the facts and turns them into the terms.
//
// The facts are kept in .cache/model/context-<sport>.json (gitignored; the workflow's cache keeps it between
// runs, and a cold cache only makes a run slower: it asks for everything again) so each run only asks about the games new
// since the last): box scores' who-played for the NBA and NHL, MLB's probable pitchers, their game logs and
// ballpark weather, and the coordinates of every place a game is played. The NFL's come from nflverse each run.
// Any fact a source couldn't give leaves its term at 0 for that game: no effect, nothing guessed.
//
// More of it lives beside this file: officials.mjs (every sport's officials), football.mjs (neutral-script
// EPA, the line's continuity, the wind across the field), hockey.mjs (expected goals, goaltending above
// expected, last change), baseball.mjs (the air, the bullpens, the umpire's zone), teamstats.mjs (the
// ranker's own numbers); this file gathers and weaves them in with the rest.

import { gameRoster, goaliesInOrder, injuries, nameKey, postedMax, rosterInjuriesOf, rosterNamesOf, summary, teamNames, teamRosterBody, teamSchedule, gameOf } from './espn.mjs';
import { lineCombinations, startingGoalies } from './dailyfaceoff.mjs';
import { RANKER_TERMS, rankerOf } from './teamstats.mjs';
import { term } from './terms.mjs';
import { Q_STATUS, putInactives } from './timing.mjs';
import { recordBox } from './playerlogs.mjs';
import { OFFICIAL_TERMS, gatherOfficials, officialsOf, refereesOf } from './officials.mjs';
import { FOOTBALL_TERMS, WX_COVER, footballOf, gatherFootball } from './football.mjs';
import { HOCKEY_TERMS, gatherHockey, hockeyOf } from './hockey.mjs';
import { BASEBALL_TERMS, baseballOf, gatherBaseball } from './baseball.mjs';
import { DAY, PITCH_COLS, elevations, etDay, forecast, geocode, isoDay, miles, mlbHands, mlbPitching, mlbSchedule, nflverseGames, pitchLine, pool } from './sources.mjs';


// A term: its key, its group (rest, travel, starters, weather), whether it moves the margin (m, the home side's
// edge: a positive size favors the side it names) or the total (t), and its words
const REST = term('rest', 'rest', 'm', 'Rest edge', 'per day more rest than the other side');
const B2B = term('b2b', 'rest', 'm', 'Back-to-back', 'when the other side played yesterday');
const B2BT = term('b2bT', 'rest', 't', 'Back-to-backs (total)', 'to the total per side that played yesterday');
// (the schedule's grind, the NBA's and NHL's: a third game in four nights, a fourth in five, a back-to-back
// flying east (an hour or more of clock lost), a back-to-back climbing (Denver, Salt Lake City))
const DENSE3 = term('dense3', 'rest', 'm', '3 in 4 nights', 'when the other side plays its third game in four nights');
const DENSE4 = term('dense4', 'rest', 'm', '4 in 5 nights', 'when the other side plays its fourth game in five nights');
const EAST = term('b2bEast', 'rest', 'm', 'Back-to-back flying east', 'when the other side played last night a time zone or more west');
const ALTITUDE = term('altitude', 'travel', 'm', 'Back-to-back at altitude', "per 1,000 meters the other side climbed since last night's game");
const TRAVEL = term('travel', 'travel', 'm', 'Travel edge', 'per 1,000 miles less travel since its last game');

// The schedule's situations (the misses round, 2026-10-19: the Book's closes read backwards by situation; DECISIONS.md
// D34), each soft: never dropped by the fit's gate, shrunk by its own ridge (ratings.mjs lambdaSoft) toward 0, so a
// small real effect stays in at a small size and a nothing stays near 0. All from the schedule alone (the games list,
// the places and their clocks), known months ahead: no box score, no report, no line.
//   tzHome     time zones the away side sits east of its own home clock (west negative), less the home side's (0 at
//              home; a neutral site counts both)
//   tzMove     time zones a side has flown east since its last game (west negative; a season's first game from its
//              home), the other side's less its own: the clock lost flying east is the harder one
//   clockLate  hours the start falls past 9 PM by the other side's own home clock (an East team tipping at 10 ET on
//              the West coast: 1), less its own
//   clockEarly hours the start falls before noon by the other side's own home clock, less its own (the NFL's early
//              flag is football.mjs bodyClock, so it isn't here)
//   letdown    when the other side won its last game by a blowout (the sport's margin: NFL 17, NBA 20, NHL 3, MLB 6),
//              less its own; bounce the same for a blowout loss
//   density7   games the other side has played in the last 7 days, this one counted, less its own
//   tripLong   when the away side is on its 4th road game or more in a row
//   firstHome  when the home side opens a home stand (its first home game after a trip)
//   altitudeT  to the total at a venue over 1,000 m (Denver, Salt Lake City): the ball flies, legs tire
//   letdownT   to the total per side coming off a blowout win
//   lopsidedT  to the total per point the model's own expected margin (either way) sits over the sport's usual gap:
//              a dynamic term, set as the game is predicted from the ratings (ratings.mjs setDynamic), not a fact
const soft = (t) => ({ ...t, soft: true });
const TZ_HOME = soft(term('tzHome', 'travel', 'm', 'Time zones from home', 'per time zone the other side sits east of its own home clock (west negative), less its own'));
const TZ_MOVE = soft(term('tzMove', 'travel', 'm', 'Time zones crossed', 'per time zone the other side has flown east since its last game (west negative), less its own'));
const CLOCK_LATE = soft(term('clockLate', 'travel', 'm', 'Late by its clock', "per hour the start falls past 9 PM by the other side's own home clock, less its own"));
const CLOCK_EARLY = soft(term('clockEarly', 'travel', 'm', 'Early by its clock', "per hour the start falls before noon by the other side's own home clock, less its own"));
const LETDOWN = soft(term('letdown', 'rest', 'm', 'Off a blowout win', 'when the other side won its last game by a blowout, less its own'));
const BOUNCE = soft(term('bounce', 'rest', 'm', 'Off a blowout loss', 'when the other side lost its last game by a blowout, less its own'));
const DENSITY7 = soft(term('density7', 'rest', 'm', 'Games in 7 days', 'per game more the other side has played in the last seven days, this one counted'));
const TRIP_LONG = soft(term('tripLong', 'travel', 'm', 'Long road trip', 'when the away side is on its fourth road game or more in a row'));
const FIRST_HOME = soft(term('firstHome', 'travel', 'm', 'Home stand opener', 'when the home side is back from a trip (its first home game after it)'));
const ALTITUDE_T = soft(term('altitudeT', 'travel', 't', 'Altitude (total)', 'to the total at a venue over 1,000 meters'));
const LETDOWN_T = soft(term('letdownT', 'rest', 't', 'Off a blowout win (total)', 'to the total per side coming off a blowout win'));
// (the lopsided matchup, a dynamic term (ratings.mjs setDynamic): the model's own expected margin, either way, over
// the sport's usual gap, set as each game is predicted; the close's totals ran about a point over in the NBA's
// lopsided games and a point under in its coin flips, 7 of 7 seasons (the NFL's coin flips under too). Its center is
// the sport's typical expected gap, so a usual game reads 0)
const lopsided = (center) => soft({ ...term('lopsidedT', 'matchups', 't', 'Lopsided matchup (total)', "to the total per point the model's own expected margin, either way, sits over the usual gap"), dyn: { of: 'absMargin', center } });
// (a blowout, by sport: the margin that reads as one)
export const BLOWOUT = { nfl: 17, nba: 20, nhl: 3, mlb: 6 };
export const SCHEDULE_TERMS = {
  nfl: [TZ_HOME, TZ_MOVE, LETDOWN, BOUNCE, LETDOWN_T, lopsided(5)],
  nba: [TZ_HOME, TZ_MOVE, CLOCK_LATE, CLOCK_EARLY, LETDOWN, BOUNCE, DENSITY7, TRIP_LONG, FIRST_HOME, ALTITUDE_T, LETDOWN_T, lopsided(6)],
  nhl: [TZ_HOME, TZ_MOVE, CLOCK_LATE, CLOCK_EARLY, LETDOWN, BOUNCE, DENSITY7, TRIP_LONG, FIRST_HOME, ALTITUDE_T, LETDOWN_T],
  mlb: [TZ_HOME, TZ_MOVE, CLOCK_LATE, CLOCK_EARLY, LETDOWN, BOUNCE, TRIP_LONG, FIRST_HOME, LETDOWN_T],
};

// A place's clock: its standard-time offset from UTC in hours, by its coordinates (North America by longitude bands:
// Eastern east of 86.5 W (Indianapolis in, Nashville out), Central to 102 W, Mountain to 114.5 W (Calgary in, Las
// Vegas out), Pacific beyond); outside North America null (an international game: no body clock read)
export function zoneOf(at) {
  if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  const [lat, lon] = at;
  if (lon < -130 || lon > -50 || lat < 14 || lat > 60) return null;
  return lon > -86.5 ? -5 : lon > -102 ? -6 : lon > -114.5 ? -7 : -8;
}
// (daylight time: the second Sunday of March to the first of November, everywhere but Phoenix)
export function daylightAt(t, at) {
  if (at && Math.abs(at[0] - 33.45) < 0.4 && Math.abs(at[1] + 112.07) < 0.4) return false;
  const d = new Date(t);
  const m = d.getUTCMonth();
  const firstSunday = (month) => 1 + ((7 - new Date(Date.UTC(d.getUTCFullYear(), month, 1)).getUTCDay()) % 7);
  if (m > 2 && m < 10) return true;
  if (m === 2) return d.getUTCDate() >= firstSunday(2) + 7;
  if (m === 10) return d.getUTCDate() < firstSunday(10);
  return false;
}
// The hour (0 to 24, fractional) a start falls on by the clock of a place; null where the place has no clock
export function clockAt(t, at) {
  const z = zoneOf(at);
  if (z === null) return null;
  const d = new Date(t);
  return (d.getUTCHours() + d.getUTCMinutes() / 60 + z + (daylightAt(t, at) ? 1 : 0) + 48) % 24;
}

export const TERMS = {
  nfl: [
    REST,
    TRAVEL,
    term('qb', 'starters', 'm', 'Backup QB', 'when the other side starts a backup quarterback, by how much worse he is'),
    term('qbT', 'starters', 't', 'Backup QBs (total)', 'to the total per backup quarterback starting, by how much worse he is'),
    term('cold', 'weather', 't', 'Cold', 'to the total per 10°F below 50°F (outdoors)'),
    term('wind', 'weather', 't', 'Wind', 'to the total per 10 mph of wind over 5 (outdoors)'),
    term('precip', 'weather', 't', 'Rain or snow', 'to the total per 0.1 inch of rain and melted snow from the hour before kickoff through the third after (outdoors)'),
    term('snow', 'weather', 't', 'Snow', 'to the total per inch of snowfall over the same hours (outdoors)'),
    term('altitudeHome', 'travel', 'm', 'Altitude', "per 1,000 meters the home field sits above the visitors' own (Denver)"),
  ],
  nba: [
    REST,
    B2B,
    B2BT,
    DENSE3,
    DENSE4,
    EAST,
    ALTITUDE,
    TRAVEL,
    term('out', 'starters', 'm', 'Players out', "per 10 of the other side's missing production (pts+reb+ast+stl+blk-to a game)"),
    term('outT', 'starters', 't', 'Players out (total)', 'to the total per 10 of production missing on both sides'),
  ],
  nhl: [
    REST,
    B2B,
    B2BT,
    DENSE3,
    EAST,
    ALTITUDE,
    TRAVEL,
    term('goalie', 'starters', 'm', 'Goalie edge', "per goal a game its starting goalie saves over its usual, against the other side's"),
    term('goalieT', 'starters', 't', 'Goalies (total)', 'to the total per goal a game both starters save over their usual'),
  ],
  mlb: [
    REST,
    TRAVEL,
    term('pitcher', 'starters', 'm', 'Pitcher edge', 'per run a 9 innings its starter allows fewer than the other'),
    term('pitcherT', 'starters', 't', 'Pitchers (total)', 'to the total per run a 9 innings both starters allow under average'),
    term('temp', 'weather', 't', 'Temperature', 'to the total per 10°F over 70°F (outdoors)'),
    term('windOut', 'weather', 't', 'Wind out', 'to the total per 10 mph blowing out toward center (in: negative)'),
    term('rain', 'weather', 't', 'Rain', "to the total when it's raining at first pitch (StatsAPI's report; a coming game without one posted is none, and flagged when rain is forecast)"),
  ],
};

// The day-of facts (DECISIONS.md D48, no look-ahead in the replay): the terms whose value for a final comes from what
// happened on the day (who played, who started in goal or on the mound, the posted lineups, the weather at the start,
// the crew), each with the hours before the start its fact is known (DAY_OF_LEAD: the inactives 30 minutes before a
// tip, a goalie at the warmups, a starter or lineup card an hour before, the weather at the hour, a crew the morning
// of). A price taken before that (an open, a close posted early) reads the term at what was known then (featurize's
// dayOf: the prior game's absentees for the NBA's missing production, the no-probable rule's goalie for the NHL, none
// for the rest, the term's 0); ratings.mjs featsAt swaps them in. The rest of a game's terms come from the schedule and
// the games before it (known once both sides' previous game is over)
export const DAY_OF_LEAD = { inactives: 0.5, goalies: 0.5, probables: 1, lineups: 1, starters: 1.5, weather: 0.5, officials: 6 };
const REFS = { refTotal: ['officials'], refHome: ['officials'], refWhistle: ['officials'] };
export const DAY_OF_TERMS = {
  nfl: { qb: ['starters'], qbT: ['starters'], olChanges: ['starters'], cold: ['weather'], wind: ['weather'], precip: ['weather'], snow: ['weather'], crosswind: ['weather'], ...REFS },
  nba: { out: ['inactives'], outT: ['inactives'], ...REFS },
  nhl: { goalie: ['goalies'], goalieT: ['goalies'], goalieX: ['goalies'], ...REFS },
  mlb: { pitcher: ['probables'], pitcherT: ['probables'], platoon: ['lineups', 'probables'], platoonT: ['lineups', 'probables'], 'parkL:': ['lineups', 'probables'], 'parkLT:': ['lineups', 'probables'], temp: ['weather'], windOut: ['weather'], rain: ['weather'], airThin: ['weather'], ...REFS, refZoneX: ['officials', 'probables'] },
};
// (a term's day-of facts, [] for none: by its key, a park's lean by its prefix)
export function dayOfFacts(sport, key) {
  const t = DAY_OF_TERMS[sport] ?? {};
  if (t[key]) return t[key];
  const i = key.indexOf(':');
  return i > 0 ? (t[key.slice(0, i + 1)] ?? []) : [];
}
// (when a term's facts are all known for a game starting at t: the latest-posted of them)
export const dayOfKnownAt = (facts, t) => (facts.length ? t - Math.min(...facts.map((f) => DAY_OF_LEAD[f])) * 36e5 : null);
// (the earliest a game's day-of facts could be known for a sport, hours before the start: a prop's projection reads
// the game's context whole (props.mjs, the info and the expected points), so a prop priced earlier than this read
// facts it couldn't have had)
export const dayOfMinLead = (sport) => {
  const facts = [...new Set(Object.values(DAY_OF_TERMS[sport] ?? {}).flat())];
  return facts.length ? Math.min(...facts.map((f) => DAY_OF_LEAD[f])) : null;
};

// (questionable: timing.mjs's pattern, the props' too; out: theirs and MLB's injured list)
const QUESTIONABLE = Q_STATUS;
const OUT = /^out|doubtful|injured reserve|il$|-il|suspension/i;

// ---------------------------------------------------------------------------
// Gathering: the facts, kept current
// ---------------------------------------------------------------------------

// The history's games, filled in where ESPN's first fetch left gaps: each game's place (from the teams'
// schedules, the last two seasons), and for the NFL, older seasons from nflverse (from cfg.deepen on: more
// history to fit on). Changes the games in place.
export async function enrich(sport, cfg, games) {
  if (sport === 'nfl' && cfg.deepen) await deepenNfl(cfg, games).catch((err) => console.warn(`nfl: older seasons skipped (${err.message})`));
  const all = [...games.values()];
  const latest = Math.max(...all.map((g) => g.season ?? 0));
  const missing = all.filter((g) => g.venue === undefined && g.season >= latest - 1);
  if (missing.length < 10) return;
  const teams = [...new Set(missing.flatMap((g) => [g.home, g.away]))];
  const seasons = [...new Set(missing.map((g) => g.season))];
  const asks = teams.flatMap((id) => seasons.flatMap((season) => [2, 3].map((type) => ({ id, season, type }))));
  await pool(asks, 4, async ({ id, season, type }) => {
    for (const e of await teamSchedule(cfg.league, id, season, type)) {
      const g = gameOf(e);
      const kept = g && games.get(g.id);
      if (kept && g.venue && kept.venue === undefined) kept.venue = g.venue;
    }
  });
  // (tried once: a game ESPN gave no place for keeps its home team's)
  for (const g of missing) if (g.venue === undefined) g.venue = '';
  console.log(`${sport}: places filled for ${missing.filter((g) => g.venue).length} of ${missing.length} games`);
}

// (nflverse's old team codes, by the ones ESPN's teams use now)
const NFL_MOVED = { OAK: 'LV', SD: 'LAC', STL: 'LA' };

// Older NFL seasons from nflverse (finals only, ESPN's ids), so the ratings and the terms have more games to learn from
async function deepenNfl(cfg, games) {
  const rows = await nflverseGames();
  if (!rows.length) return;
  const team = new Map();
  for (const r of rows) {
    const g = games.get(r.espn);
    if (!g) continue;
    team.set(r.home_team, { id: g.home, abbr: g.homeAbbr });
    team.set(r.away_team, { id: g.away, abbr: g.awayAbbr });
  }
  let added = 0;
  for (const r of rows) {
    const season = Number(r.season);
    if (season < cfg.deepen || !r.espn || games.has(r.espn) || r.home_score === '' || r.away_score === '') continue;
    const h = team.get(NFL_MOVED[r.home_team] ?? r.home_team);
    const a = team.get(NFL_MOVED[r.away_team] ?? r.away_team);
    if (!h || !a) continue;
    games.set(r.espn, {
      id: r.espn,
      date: easternToUtc(r.gameday, r.gametime || '13:00'),
      season,
      type: r.game_type === 'REG' ? 2 : 3,
      home: h.id,
      away: a.id,
      homeAbbr: h.abbr,
      awayAbbr: a.abbr,
      neutral: r.location === 'Neutral',
      final: true,
      hs: Number(r.home_score),
      as: Number(r.away_score),
    });
    added++;
  }
  if (added) console.log(`nfl: ${added} older games added from nflverse (${cfg.deepen} on)`);
}

// A US Eastern day and time as ESPN writes UTC ("2025-09-05T00:20Z"): daylight time from March's second
// Sunday to November's first
function easternToUtc(day, time) {
  const [y, m, d] = day.split('-').map(Number);
  const sunday = (month, nth) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (nth - 1);
  };
  const t = Date.UTC(y, m - 1, d);
  const daylight = t >= Date.UTC(y, 2, sunday(2, 2)) && t < Date.UTC(y, 10, sunday(10, 1));
  const [hh, mm] = time.split(':').map(Number);
  return new Date(t + ((hh + (daylight ? 4 : 5)) * 60 + mm) * 6e4).toISOString().slice(0, 16) + 'Z';
}

// The sources a run can do without: each one's terms. One is only asked while a term it feeds has earned its
// place (or is new), and otherwise again once a week or once the history has 30% more games, so a term left
// out can earn its way back in (run.mjs decides: want). The rest (each sport's schedule, box scores or
// StatsAPI, the injury report, places) feed kept terms in every sport, and the props; so do the NFL's
// forecasts and its finals' rain and snow (the props' weather context is fit apart from the game lines', so
// they're asked every run: the rain and snow only for finals not asked yet)
export const OPTIONAL = {
  nfl: { plays: ['nsEpa', 'nsEpaT', 'refWhistle', 'funnelT', 'paceT'], snaps: ['olChanges'], fields: ['crosswind'] },
  nba: { officials: ['refTotal', 'refHome', 'refWhistle'] },
  nhl: { officials: ['refTotal', 'refHome', 'refWhistle'], xg: ['xgEdge', 'xgT', 'goalieX'] },
  mlb: { air: ['airThin'], bullpens: ['penTired', 'penTiredT'] },
};

// The facts for every game the history has and the coming ones: the kept ones brought up to date, plus each
// coming game's live ones (injury reports, probable starters, the forecast, the NFL's and NBA's game-day
// rosters). Never throws: a source that fails just adds nothing, except the injury report, whose failure marks
// every coming game (injuriesFailed: none of them bet this run). want(source): whether to ask an optional one.
// Each step's time and whether it worked land in times.
export async function gather(sport, cfg, history, upcoming, facts, want = () => true, times = {}) {
  facts.places ??= {};
  facts.games ??= {};
  const live = new Map(upcoming.map(({ game }) => [game.id, {}]));
  const step = async (what, fn) => {
    const t0 = Date.now();
    try {
      await fn();
      times[what] = { ms: Date.now() - t0, ok: true };
    } catch (err) {
      times[what] = { ms: Date.now() - t0, ok: false, error: err.message };
      console.warn(`${sport}: ${what} skipped (${err.message})`);
    }
  };
  await step('places', () => places(history, upcoming, facts));
  await step('team names', async () => {
    const names = await teamNames(cfg.league);
    if (names.length) facts.teams = names;
  });
  if (sport === 'nfl') await step('nflverse', () => nflFacts(cfg, upcoming, facts, live));
  if (sport === 'nba') await step('box scores', () => boxFacts(cfg, history, facts, 'nba'));
  if (sport === 'nhl') await step('box scores', () => boxFacts(cfg, history, facts, 'nhl'));
  if (sport === 'mlb') await step('StatsAPI', () => mlbFacts(history, upcoming, facts, live));
  if (sport === 'nfl') for (const part of ['plays', 'snaps', 'fields']) if (want(part)) await step(part, () => gatherFootball(cfg, history, upcoming, facts, live, part));
  if (sport === 'nfl') await step('precip', () => gatherFootball(cfg, history, upcoming, facts, live, 'precip'));
  // (the NFL's red zone, every run (not optional: the props' red-zone term and the anytime touchdown read it; a
  // season's play-by-play read only when one of its finals is missing it): football.mjs redZoneOf)
  if (sport === 'nfl') await step('red zone', () => gatherFootball(cfg, history, upcoming, facts, live, 'rz'));
  if (sport === 'nhl' && want('xg')) await step('xg', () => gatherHockey(history, facts));
  if (sport === 'mlb') for (const part of ['air', 'bullpens']) if (want(part)) await step(part, () => gatherBaseball(history, upcoming, facts, live, part));
  if ((sport === 'nba' || sport === 'nhl') && want('officials')) await step('officials', () => gatherOfficials(sport, cfg, upcoming, live));
  if (sport !== 'mlb') {
    // (no report, or an empty one (there's always someone hurt in season): every coming game marked, and
    // run.mjs bets none of them this run, rather than as if everyone were healthy)
    for (const l of live.values()) l.injuriesFailed = true;
    await step('injuries', async () => {
      const report = await injuries(cfg.league);
      if (!report || (!report.size && live.size)) throw new Error('no injury report');
      // (the NFL's listings for a team's last game, left on the report after it, taken off it: staleReport)
      let read = report;
      if (sport === 'nfl') {
        const s = staleReport(report, history);
        read = s.report;
        if (s.stale.length) console.log(`nfl: injury report: ${s.stale.length} listings from before the teams' last games taken off it: ${s.stale.map((x) => `${x.name} (${x.status} ${x.date?.slice(5, 10)})`).join(', ')}`);
      }
      // (the NHL's: a coming game's team the report leaves out entirely (2026-10-18 Columbus) listed from its own
      // roster's injuries and DailyFaceoff's off ice: fallbackInjuries. Any failure: that team as before, unlisted)
      if (sport === 'nhl') read = await fallbackInjuries(cfg, upcoming, read, facts).catch((err) => (console.warn(`nhl: injury fallback skipped (${err.message})`), read));
      for (const l of live.values()) (l.injuries = read), delete l.injuriesFailed;
    });
  }
  if (sport === 'nhl') {
    // (the probable starting goalies ESPN lists for each coming game: confirmed or expected)
    for (const { game, event } of upcoming) {
      const sides = event?.competitions?.[0]?.competitors ?? [];
      for (const c of sides) {
        const p = (c.probables ?? []).find((x) => /Goalie/i.test(x.name ?? ''));
        if (p?.athlete?.id) live.get(game.id)[c.homeAway === 'home' ? 'home' : 'away'] = { id: String(p.athlete.id), name: p.athlete.displayName, status: p.status?.type ?? '' };
      }
    }
    // (and DailyFaceoff's, weighed against ESPN's: a confirmed starter from either beats an expected one; two
    // unconfirmed ones that differ are both kept, the goalie read as either (goalieOf). Failed: ESPN's alone)
    if (live.size) await step('goalies', () => goaliesBoth(cfg, upcoming, live, facts));
  }
  // (the NFL's, NBA's and NHL's game-day rosters, a game within LINEUP_HOURS of its start: its inactives (the
  // NHL's healthy scratches), when posted, into its own injury report (the listed ones here, the regulars unlisted
  // once the rows are read: run.mjs), the NBA's starting five kept (l.gameRosters). Unposted, or failed: nothing,
  // the report as it was)
  if ((sport === 'nfl' || sport === 'nba' || sport === 'nhl') && live.size) await step('inactives', () => gameRosters(sport, cfg, upcoming, live, history));
  if (sport === 'nfl') await step('forecasts', () => nflForecasts(upcoming, facts, live));
  return live;
}

// (how near its start a game's posted roster is asked for, hours: the NFL's inactives post about 90 minutes
// before a kickoff, the NBA's starters about 30 before a tip; a run inside it asks each side once a run. Read
// here, at the run's start, but the bets are priced again only after the fits (run.mjs repriceOpen: about 15
// minutes into the NFL's run on GitHub, the props' fit alone about 12; the NBA's after the NFL's, so 15 more),
// and not inside REPRICE_BY (20 minutes) of the start: so an NFL game's inactives count only when a run starts
// between about 90 and 35 minutes before its kickoff (1:00 ET: 15:30 to 16:25 UTC in EDT, 16:30 to 17:25 in
// EST; 4:05/4:25 ET: 18:35 to 19:50 EDT, 19:35 to 20:50 EST; the night games' 8:15/8:20 ET: about 22:45 to
// 23:45 EDT, 23:45 to 00:45 EST), and the NBA's five almost never (posted 30 minutes before a tip, priced again
// 20 before at the latest, the run's NBA part 15 in). GitHub runs the hourly schedule about five times a day,
// not 24 (2026-10-11 and 12: 01:00, 07:11, 14:02, 18:53, 22:53; 02:23, 10:47, 20:17), so a window is caught
// when a run happens to land in it; the Sunday and night-game triggers in .github/workflows/model-desk.yml
// add tries, and repriceOpen logs how many minutes before the lock each posted game's re-price came). The NHL's
// healthy scratches: ESPN's game roster carries its scratched flags once the lineup's in (a final's has them; a
// coming game's five hours out none), when before the puck drop not yet seen live, so asked from 2.5 hours
export const LINEUP_HOURS = { nfl: 2.5, nba: 2, nhl: 2.5 };

// Each coming game's posted game-day rosters (espn.mjs gameRoster) on its live facts (l.gameRosters: Map of team id
// -> { inactive, starters }, the sides posted), its listed inactives put into its injury report (putInactives)
// (ESPN's game roster for a coming game carries the team's last game's didNotPlay flags, and keeps them once the
// game's own inactives post (adding those): 2026-10-18 the Eagles' at 11:23 ET read L. Johnson, Epps, Greenard,
// Barkley, Brown, D. Smith, Kendall, the Jaguars game's list to the name, and at 11:41 the same seven and M. Carter
// II, Epenesa, Milton III, Hunt, DeVonta Smith (off the injury report, playing) on it both times. So a game-day list
// counts only for the names new on it since the team's last game (freshInactives); one carried over keeps its
// injury report's status (Barkley's Out stays Out), and no last game read, nothing from the list)
export function freshInactives(posted, prev) {
  if (!posted) return posted;
  if (!prev) return { ...posted, inactive: [] };
  const was = new Set((prev.inactive ?? []).map((x) => String(x.id)));
  return { ...posted, inactive: (posted.inactive ?? []).filter((x) => !was.has(String(x.id))) };
}
// The NFL's injury report's listings for a team's last game, still on it after that game: taken off the report (as
// a player this week's report doesn't list: the roster's IR and the absent regulars' rules read him then). ESPN
// leaves a game's own inactives (its tag INACTIVE) and its questionable and doubtful ones, an in-game "questionable to return" among them, on the report after the game
// till the team's next report replaces them, and not always then: 2026-10-18 the Broncos' and Seahawks' Thursday
// inactives (Surtain, Hufanga, Milroe and the rest) still Out three days on, Te'Cory Couch (BUF) questionable from
// his 10-04 in-game hamstring, the Dolphins' 10-11 in-game ones the same. A weekly report lists each player again
// for each game, so a listing from before the last game (its date before that game's start plus STALE_AFTER, the
// game's own length) is that game's, not this one's. An Out or IR listing stays: a multi-week injury's isn't
// posted again each week (Tanner Hudson's torn pectoral, out since 10-13). history: the finals (each team's last
// start before now). -> { report: a new Map, stale: [{ team, name, status, date }] the ones taken off }
export const STALE_AFTER = 4 * 36e5;
export function staleReport(report, history, now = Date.now()) {
  const last = new Map();
  for (const g of history ?? []) {
    const t = Date.parse(g.date);
    if (!(t < now) || g.final === false) continue;
    for (const team of [String(g.home), String(g.away)]) if (!(last.get(team) >= t)) last.set(team, t);
  }
  const stale = [];
  const out = new Map();
  for (const [team, list] of report ?? []) {
    const t = last.get(String(team));
    out.set(
      team,
      (list ?? []).filter((p) => {
        const d = Date.parse(p.date ?? '');
        const forOne = p.tag === 'INACTIVE' || /questionable|doubtful/i.test(p.status ?? '');
        if (t === undefined || !Number.isFinite(d) || !forOne || d >= t + STALE_AFTER || /^active$/i.test(p.status ?? '')) return true;
        stale.push({ team: String(team), name: p.name, status: p.status, date: p.date });
        return false;
      }),
    );
  }
  return { report: out, stale };
}

// (the NFL's report with a side's own inactives for a game on it: an INACTIVE listing dated inside LINEUP_HOURS
// before its start)
export function reportPosted(report, team, start) {
  const t = Date.parse(start ?? '');
  if (!(report instanceof Map) || !Number.isFinite(t)) return false;
  return (report.get(String(team)) ?? []).some((p) => {
    const d = Date.parse(p.date ?? '');
    return p.tag === 'INACTIVE' && d <= t && t - d <= LINEUP_HOURS.nfl * 36e5;
  });
}

// The NBA's starting five on a coming game's roster: the posted one, or null. ESPN's game roster carries the team's
// last game's flags before the game's own post (the NFL's inactives 2026-10-18: the Eagles' the Jaguars game's to the
// name, 90 minutes out), and the NBA's lineups are out about 30 minutes before the tip, so a five read earlier than
// FIVE_EARLY that's the last game's own (or with the last game's unread) isn't posted yet: read, it's the last
// game's lineup taken for tonight's (a starter missing last night read as benched tonight). A five unlike the last
// game's is tonight's, posted early. until: ms to the tip
export const FIVE_EARLY = 45 * 60e3;
export function freshStarters(posted, prev, until) {
  const five = posted?.starters;
  if (!five?.length) return null;
  if (until <= FIVE_EARLY) return five;
  const was = prev?.starters;
  if (!was?.length) return null;
  const s = new Set(was.map(String));
  return five.length === s.size && five.every((id) => s.has(String(id))) ? null : five;
}

// The NHL's healthy scratches on a coming game's roster (espn.mjs gameRosterOf: its scratched flags), with the
// NFL's carry-over guard (freshInactives) and the NBA's early one (freshStarters): ESPN's game roster has carried a
// team's last game's flags before the game's own post (the NFL's, 2026-10-18), and a team's scratches are often the
// same night to night, so a list read earlier than SCRATCH_EARLY that's the last game's own, or with the last game's
// unread, isn't posted yet (the injury report alone, as before any post); one unlike it is tonight's. A lineup
// dresses 20 (18 skaters, two goalies; 19 a cap-strapped night): a list leaving fewer or more dressed isn't one
// lineup (the last game's flags on top of tonight's, say), so only the names new on it since the last game count
// (freshInactives: carried ones, and all with the last game's unread, left to the report). until: ms to the puck
// drop. -> the posting with its inactive list as read, or null (not posted)
export const SCRATCH_EARLY = 60 * 60e3;
export const DRESSED = { min: 19, max: 20 };
export function freshScratches(posted, prev, until) {
  if (!posted) return null;
  const whole = posted.dressed >= DRESSED.min && posted.dressed <= DRESSED.max;
  if (!whole) {
    const fresh = freshInactives(posted, prev);
    return fresh.inactive.length ? fresh : null;
  }
  if (until <= SCRATCH_EARLY) return posted;
  if (!prev) return null;
  const was = new Set((prev.inactive ?? []).map((x) => String(x.id)));
  const now = posted.inactive ?? [];
  return now.length === was.size && now.every((x) => was.has(String(x.id))) ? null : posted;
}

// An NHL side's starting goalie from ESPN's probable (espn: { id, name, status: confirmed or expected }) and
// DailyFaceoff's (dfo: { id (ESPN's, found by name on the team's roster; null not found), name, strength:
// confirmed, likely or unconfirmed }), either missing. A confirmed starter from either beats an expected one; the
// two naming the same goalie, him (confirmed if either says so). Two that differ, neither confirmed (2026-10-18
// CGY: ESPN expected Wolf, DailyFaceoff unconfirmed Cooley), aren't settled by a coin: both are kept, the side's
// goalie read as either (alt; share: the named one's chance by each source's word, GOALIE_WORD: DailyFaceoff's
// Likely over ESPN's expected over its own projection, ties ESPN's), the game model's goalie term the blend of the
// two (context nhl), a saves prop on either flagged at the minimum stake and waiting for the news till the last
// chance (props.mjs statusOf, timing.mjs newsMissing). Both confirmed, differing (not seen): the same, at a half.
// -> { id, name, status, from, alt?, share?, split? } or null
export const GOALIE_WORD = { espn: { expected: 1 }, dfo: { likely: 1.5, unconfirmed: 1 } };
export function goalieOf(espn, dfo) {
  const e = espn?.id ? { id: String(espn.id), name: espn.name ?? '', confirmed: /^confirmed$/i.test(espn.status ?? ''), w: GOALIE_WORD.espn.expected, from: 'espn' } : null;
  const d = dfo?.name ? { id: dfo.id ? String(dfo.id) : null, name: dfo.name, confirmed: dfo.strength === 'confirmed', w: GOALIE_WORD.dfo[dfo.strength] ?? 1, from: 'dailyfaceoff' } : null;
  const as = (x, confirmed, more = {}) => ({ id: x.id, name: x.name, status: confirmed ? 'confirmed' : 'expected', from: x.from, ...more });
  if (e && d && (e.id === d.id || nameKey(e.name) === nameKey(d.name))) return as(e, e.confirmed || d.confirmed, { from: 'both' });
  if (!d?.id && !e) return null;
  if (!e) return as(d, d.confirmed);
  if (!d) return as(e, e.confirmed);
  if (e.confirmed !== d.confirmed) return e.confirmed ? as(e, true) : d.id ? as(d, true) : as(e, false, { split: true, alt: { id: null, name: d.name }, share: 0.5 });
  const [one, two] = d.w > e.w && d.id ? [d, e] : [e, d];
  const share = Math.round((one.confirmed ? 0.5 : one.w / (one.w + two.w)) * 100) / 100;
  return as(one, false, { split: true, alt: { id: two.id, name: two.name }, share });
}

// Both sources' goalies on each coming NHL game's live facts (l.home, l.away: goalieOf), DailyFaceoff's starting
// goalies page for each US Eastern day with a game, its goalie found on ESPN's team roster by name where it isn't
// ESPN's own. A day's page not had: ESPN's alone that day
export async function goaliesBoth(cfg, upcoming, live, facts) {
  const days = [...new Set(upcoming.map(({ game }) => etDay(game.date)))];
  const pages = new Map(await Promise.all(days.map(async (d) => [d, await startingGoalies(d).catch(() => null)])));
  if (![...pages.values()].some(Boolean)) throw new Error("DailyFaceoff's starting goalies not read");
  const teamName = (id) => facts.teams?.find((t) => String(t.id) === String(id))?.name ?? null;
  const rosters = new Map();
  const idOf = async (team, name) => {
    if (!rosters.has(team)) rosters.set(team, await teamRosterBody(cfg.league, team).then(rosterNamesOf).catch(() => new Map()));
    return rosters.get(team).get(nameKey(name))?.id ?? null;
  };
  const said = [];
  for (const { game } of upcoming) {
    const l = live.get(game.id);
    const page = pages.get(etDay(game.date));
    if (!l || !page) continue;
    const [hn, an] = [teamName(game.home), teamName(game.away)].map(nameKey);
    const g = page.find((x) => nameKey(x.home.team) === hn && nameKey(x.away.team) === an && Math.abs(Date.parse(x.start) - Date.parse(game.date)) < 12 * 36e5);
    if (!g) continue;
    for (const [where, team, abbr] of [['home', game.home, game.homeAbbr], ['away', game.away, game.awayAbbr]]) {
      const d = g[where];
      if (!d?.name) continue;
      const e = l[where] ?? null;
      const id = e && nameKey(e.name) === nameKey(d.name) ? e.id : await idOf(String(team), d.name);
      const both = goalieOf(e, { ...d, id });
      if (both) l[where] = both;
      if (both?.split) said.push(`${abbr}: ${both.name} or ${both.alt.name} (ESPN ${e?.name ?? 'none'} ${e?.status ?? ''}, DailyFaceoff ${d.name} ${d.strength}), ${both.name} at ${both.share}`);
      else if (both && e && both.id !== e.id) said.push(`${abbr}: ${both.name} (DailyFaceoff ${d.strength}) over ESPN's ${e.name} (${e.status})`);
      else if (both && e && both.status === 'confirmed' && !/^confirmed$/i.test(e.status ?? '')) said.push(`${abbr}: ${both.name} confirmed by DailyFaceoff (ESPN: ${e.status})`);
    }
  }
  console.log(`nhl: goalies: DailyFaceoff read for ${days.filter((d) => pages.get(d)).length} of ${days.length} days${said.length ? `; ${said.join('; ')}` : ''}`);
}

// The NHL's injury report filled in for a coming game's team it leaves out entirely (2026-10-18: Columbus, absent
// from ESPN's NHL report though Provorov, Lundestrom and Fabbro were on injured reserve): its listings from ESPN's
// team roster (each athlete's injuries) and DailyFaceoff's off-ice group on its line combinations page (mergeFallback),
// in a new report (the one read untouched). The NHL's api-web has no injury data (its roster lists the injured as
// rostered), so it can't be the fallback. Both unread: the team left unlisted, as before
export async function fallbackInjuries(cfg, upcoming, report, facts) {
  const teams = [...new Set(upcoming.flatMap(({ game }) => [String(game.home), String(game.away)]))].filter((t) => !report.has(t));
  if (!teams.length) return report;
  const out = new Map(report);
  const said = [];
  for (const team of teams) {
    const name = facts.teams?.find((t) => String(t.id) === team)?.name ?? null;
    const [body, dfo] = await Promise.all([teamRosterBody(cfg.league, team).catch(() => null), name ? lineCombinations(name).catch(() => null) : null]);
    const season = upcoming.find(({ game }) => String(game.home) === team || String(game.away) === team)?.game.season;
    const list = mergeFallback(rosterInjuriesOf(body), dfo, rosterNamesOf(body), Number.isFinite(season) ? Date.UTC(season - 1, 7, 1) : -Infinity);
    if (!list) {
      said.push(`${name ?? team}: neither source read, left unlisted`);
      continue;
    }
    out.set(team, list);
    said.push(`${name ?? team}: ${list.length ? list.map((p) => `${p.name} (${p.status}, ${p.from})`).join(', ') : 'none listed'}`);
  }
  console.log(`nhl: injury report: ${teams.length} coming teams missing from it, filled in: ${said.join('; ')}`);
  return out;
}
// (a missing team's listings: ESPN's roster's (rosterList: espn.mjs rosterInjuriesOf, null unread) and DailyFaceoff's
// off ice (dfo: dailyfaceoff.mjs lineCombinationsOf, null unread), one each, ESPN's first (his id, his date). A roster
// listing from before the season (since: its start) that DailyFaceoff, read, doesn't carry is left off: last
// season's, never cleared (2026-10-18 CBJ's Brendan Smith, injured reserve since 2026-01-08, on no lineup or
// off-ice list). DailyFaceoff's alone found on the roster by name for his ESPN id (none found: by name alone, as
// the report's own can be). names: espn.mjs rosterNamesOf. -> the list, or null with both unread)
export function mergeFallback(rosterList, dfo, names, since = -Infinity) {
  if (!rosterList && !dfo) return null;
  const off = new Set((dfo?.off ?? []).map((p) => nameKey(p.name)));
  const out = [];
  const have = new Set();
  for (const r of rosterList ?? []) {
    if (dfo && !off.has(nameKey(r.name)) && Date.parse(r.date ?? '') < since) continue;
    out.push({ ...r, from: 'espn roster' });
    have.add(nameKey(r.name));
  }
  for (const p of dfo?.off ?? []) {
    const k = nameKey(p.name);
    if (have.has(k)) continue;
    have.add(k);
    const on = names?.get(k);
    out.push({ id: on?.id ?? null, name: on?.name ?? p.name, pos: on?.pos ?? p.pos ?? '', status: p.status, tag: null, date: dfo.updated ?? null, from: 'dailyfaceoff' });
  }
  return out;
}

// (a team's last game before this one in the history: its event id, or null)
export function lastGameOf(history, team, before) {
  let best = null;
  for (const g of history ?? []) {
    if (String(g.home) !== team && String(g.away) !== team) continue;
    const t = Date.parse(g.date);
    if (!(t < before)) continue;
    if (!best || t > best.t) best = { id: String(g.id), t };
  }
  return best?.id ?? null;
}
async function gameRosters(sport, cfg, upcoming, live, history = [], now = Date.now()) {
  const soon = upcoming.filter(({ game }) => {
    const until = Date.parse(game.date) - now;
    return until > 0 && until <= LINEUP_HOURS[sport] * 36e5;
  });
  const asks = soon.flatMap(({ game }) => [game.home, game.away].map((team) => ({ game, team: String(team) })));
  // (uncapped: the count a posting could have judged on the names new on it, below)
  const got = await pool(asks, 4, ({ game, team }) => gameRoster(cfg.league, game.id, team, sport, false));
  // (each side's last game's list: only the names new since it count, freshInactives. The last game's list not
  // had (the ask failed, or none there) is unread, not empty: every name the coming one carries would read as
  // new, today's DeVonta Smith again. No last game read (none in the history), nothing from the list either:
  // ESPN's injury report lists each game's inactives itself, Out, within minutes of the posting (2026-10-18:
  // every posted side's, coach's decisions too), so the list adds only what the report hasn't caught up to)
  const prevs = await pool(asks, 4, async ({ game, team }, i) => {
    if (!got[i]?.inactive?.length && !got[i]?.starters && !(sport === 'nhl' && got[i])) return null;
    const prev = lastGameOf(history, team, Date.parse(game.date));
    return prev ? gameRoster(cfg.league, prev, team, sport, false) : null;
  });
  let carried = 0;
  let unread = 0;
  let early = 0;
  let held = 0;
  asks.forEach(({ game, team }, i) => {
    // (the NHL's healthy scratches: the whole list once it's tonight's lineup, freshScratches; the count no
    // posting could have, read as not posted)
    if (sport === 'nhl') {
      if (!got[i]) return;
      const fresh = freshScratches(got[i], prevs[i], Date.parse(game.date) - now);
      if (!fresh) {
        if (got[i].inactive.length) held++;
        got[i] = null;
        return;
      }
      if (postedMax(sport, fresh.inactive.length, got[i].n ?? 0)) {
        console.warn(`nhl: a game-day roster with ${fresh.inactive.length} of ${got[i].n} scratched (${game.awayAbbr} @ ${game.homeAbbr}, ${team}), more than any lineup: read as not posted`);
        got[i] = null;
        return;
      }
      got[i] = fresh.inactive.length ? fresh : null;
      return;
    }
    // (the NBA's five, the last game's before the lineups are out: not posted, freshStarters)
    if (got[i]?.starters) {
      const five = freshStarters(got[i], prevs[i], Date.parse(game.date) - now);
      if (!five) early++;
      got[i] = { ...got[i], starters: five };
      if (!got[i].inactive.length && !five) got[i] = null;
    }
    if (!got[i]?.inactive?.length) return;
    if (!prevs[i]) unread++;
    const fresh = freshInactives(got[i], prevs[i]);
    carried += got[i].inactive.length - fresh.inactive.length;
    if (postedMax(sport, fresh.inactive.length, got[i].n ?? 0)) {
      console.warn(`${sport}: a game-day roster with ${fresh.inactive.length} of ${got[i].n} new inactive (${game.awayAbbr} @ ${game.homeAbbr}, ${team}), more than any posting: read as not posted`);
      fresh.inactive = [];
    }
    // (the NFL's side posted for this game: names new on its list, and its report's own inactives for it, its
    // INACTIVE listings dated inside LINEUP_HOURS of the start, or three new names: a questionable one left off
    // the list then plays, putInactives)
    if (sport === 'nfl' && fresh.inactive.length && (fresh.inactive.length >= 3 || reportPosted(live.get(game.id)?.injuries, team, game.date))) Object.assign(fresh, { posted: true, listed: got[i].inactive.map((x) => x.id) });
    got[i] = fresh.inactive.length || fresh.starters ? fresh : null;
  });
  if (carried) console.log(`${sport}: game-day rosters: ${carried} names carried over from the teams' last games left to the injury report`);
  if (unread) console.log(`${sport}: game-day rosters: ${unread} sides' last game's list not read: their lists left to the injury report`);
  if (early) console.log(`${sport}: game-day rosters: ${early} sides' starting five the last game's, before the lineups are out: not posted`);
  if (held) console.log(`nhl: game-day rosters: ${held} sides' scratches the last game's (or it unread) more than ${SCRATCH_EARLY / 60e3} minutes out: not posted yet`);
  let posted = 0;
  asks.forEach(({ game, team }, i) => {
    if (!got[i]) return;
    const l = live.get(game.id);
    if (!l) return;
    (l.gameRosters ??= new Map()).set(team, got[i]);
    posted++;
  });
  const puts = soon.map(({ game }) => putInactives(live.get(game.id), game));
  const put = puts.flatMap((x) => x.map((y) => `${y.name} (${y.was})`));
  const cleared = puts.flatMap((x) => (x.cleared ?? []).map((y) => `${y.name} (${y.was})`));
  const scratched = sport === 'nhl' ? asks.flatMap((_, i) => (got[i]?.inactive ?? []).map((x) => x.name)) : [];
  if (asks.length) console.log(`${sport}: game-day rosters posted for ${posted} of ${asks.length} sides within ${LINEUP_HOURS[sport]}h${scratched.length ? `; scratched: ${scratched.join(', ')}` : ''}${put.length ? `; listed and now inactive: ${put.join(', ')}` : ''}${cleared.length ? `; listed, not inactive, so playing: ${cleared.join(', ')}` : ''}`);
}

// Every place a game is played, as coordinates (asked once per place, kept; a failed ask is asked again)
async function places(history, upcoming, facts) {
  const wanted = new Set([...history.map((g) => g.venue), ...upcoming.map(({ game }) => game.venue)].filter(Boolean));
  const fresh = [...wanted].filter((p) => !(p in facts.places));
  const found = await pool(fresh, 3, geocode);
  fresh.forEach((p, i) => found[i] !== undefined && (facts.places[p] = found[i]));
  // (and each place's elevation, meters)
  facts.elev ??= {};
  const high = Object.keys(facts.places).filter((p) => facts.places[p] && !(p in facts.elev));
  if (high.length) {
    const got = await elevations(high.map((p) => facts.places[p]));
    high.forEach((p, i) => Number.isFinite(got[i]) && (facts.elev[p] = got[i]));
  }
}

// The NFL: nflverse's schedule (each game's starting quarterbacks, roof, temperature and wind; the coming
// games' expected starters), read fresh each run
async function nflFacts(cfg, upcoming, facts, live) {
  const rows = await nflverseGames();
  if (!rows.length) throw new Error('nflverse schedule unavailable');
  facts.nfl = new Map(rows.filter((r) => r.espn && Number(r.season) >= (cfg.deepen ?? 2000)).map((r) => [r.espn, r]));
  for (const { game } of upcoming) if (facts.nfl.has(game.id)) live.get(game.id).row = facts.nfl.get(game.id);
}

// The forecast at each coming outdoor NFL game (its roof per nflverse: outdoors or open); one that can't be
// had (no place for it, the forecast failed or has no rain in it) marked (weatherMissing: its weather terms
// at 0 and the game flagged, its markets and weather-touched props at the least stake)
async function nflForecasts(upcoming, facts, live) {
  await pool(upcoming, 3, async ({ game }) => {
    const l = live.get(game.id);
    const roof = l.row?.roof ?? '';
    if (!['outdoors', 'open'].includes(roof)) return;
    const at = facts.places[game.venue];
    l.weather = at ? await forecast(at, game.date) : null;
    if (!l.weather || !Number.isFinite(l.weather.precip)) l.weatherMissing = true;
  });
}

// The NBA's and NHL's box scores (ESPN's summaries, new finals only): each side's players and minutes and
// production (NBA), or its goalies and their shots and goals against, the starter first (gs: 1), and its scorers
// (NHL); the game's referees (r) and their whistle (w: each side's free throws and fouls in the NBA, power
// plays and penalty minutes in the NHL). (v: 2, the facts' version: a game kept before officials were is
// asked again once)
async function boxFacts(cfg, history, facts, sport) {
  // (an NHL game kept before the goalies were put in the order they went in (gs) has ESPN's: the one in net at
  // the end first, a pulled starter after his reliever; turned round once, no summary asked again)
  if (sport === 'nhl') {
    for (const f of Object.values(facts.games ?? {})) {
      if (f?.v !== 2 || f.gs) continue;
      for (const w of ['h', 'a']) if (Array.isArray(f[w]) && f[w].length > 1) f[w] = [...f[w]].reverse();
      f.gs = 1;
    }
  }
  const todo = history.filter((g) => g.final && g.hs !== null && facts.games[g.id]?.v !== 2);
  if (!todo.length) return;
  const t0 = Date.now();
  let done = 0;
  await pool(todo, 6, async (g) => {
    const body = await summary(cfg.league, g.id);
    recordBox(sport, g, body);
    const box = body?.boxscore?.players;
    if (!box?.length) return;
    const side = { v: 2, ...(sport === 'nhl' ? { gs: 1 } : {}) };
    const whereOf = (t) => (String(t?.id) === String(g.home) ? 'h' : String(t?.id) === String(g.away) ? 'a' : null);
    for (const p of box) {
      const where = whereOf(p.team);
      if (!where) continue;
      side[where] = sport === 'nba' ? nbaPlayers(p) : nhlGoalies(p, body.article?.story);
      if (sport === 'nhl') side[`${where}g`] = nhlScorers(p);
    }
    side.r = refereesOf(body);
    const stat = (t, name) => Number(t.statistics?.find((x) => x.name === name)?.displayValue?.split('-').at(-1)) || 0;
    const teams = Object.fromEntries((body.boxscore?.teams ?? []).map((t) => [whereOf(t.team), t]));
    if (teams.h && teams.a) {
      const keys = sport === 'nba' ? ['freeThrowsMade-freeThrowsAttempted', 'fouls'] : ['powerPlayOpportunities', 'penaltyMinutes'];
      side.w = keys.flatMap((k) => [stat(teams.h, k), stat(teams.a, k)]);
    }
    if (side.h && side.a) facts.games[g.id] = side;
    if (++done % 250 === 0) console.log(`${sport}: box scores ${done}/${todo.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
  });
  console.log(`${sport}: box scores for ${done} of ${todo.length} new finals`);
}

// (an NBA side's players who played: [ESPN id, minutes, production])
function nbaPlayers(p) {
  const s = p.statistics?.[0];
  const labels = s?.labels ?? [];
  const at = (k) => labels.indexOf(k);
  const num = (stats, k) => Number(stats[at(k)]) || 0;
  return (s?.athletes ?? [])
    .filter((a) => !a.didNotPlay && a.stats?.length)
    .map((a) => {
      const st = a.stats;
      const eff = num(st, 'PTS') + num(st, 'REB') + num(st, 'AST') + num(st, 'STL') + num(st, 'BLK') - num(st, 'TO');
      return [String(a.athlete.id), num(st, 'MIN'), eff];
    })
    .filter((x) => x[1] > 0);
}

// (an NHL side's scorers: [ESPN id, goals], skaters with one or more)
function nhlScorers(p) {
  return (p.statistics ?? [])
    .filter((x) => x.name === 'forwards' || x.name === 'defenses')
    .flatMap((s) => (s.athletes ?? []).map((a) => [String(a.athlete.id), Number(a.stats[s.labels.indexOf('G')]) || 0]))
    .filter((x) => x[1] > 0);
}

// (an NHL side's goalies: [ESPN id, shots against, goals against], the starter first: espn.mjs goaliesInOrder,
// ESPN's own list putting a pulled starter after his reliever)
function nhlGoalies(p, story) {
  const s = (p.statistics ?? []).find((x) => x.name === 'goalies');
  const labels = s?.labels ?? [];
  return goaliesInOrder(s?.athletes, story).map((a) => [String(a.athlete.id), Number(a.stats[labels.indexOf('SA')]) || 0, Number(a.stats[labels.indexOf('GA')]) || 0]);
}

// (StatsAPI's team codes that differ from ESPN's)
const MLB_CODES = { AZ: 'ARI', CWS: 'CHW' };

// MLB: StatsAPI's schedule matched to ESPN's games (probable pitchers, lineups by hand, the weather, which
// ballpark and where), the coming games' too, and every starter's pitching lines (this season's game log and
// last season's)
async function mlbFacts(history, upcoming, facts, live) {
  facts.pitchers ??= {};
  facts.hands ??= {};
  facts.venues ??= {};
  const today = isoDay(Date.now());
  // (a final StatsAPI has no match for is tried once, then left neutral)
  facts.umps ??= {};
  facts.mlbTeams ??= {};
  // (a game kept before its umpire was is asked again once: u, null when StatsAPI hasn't one; and one kept
  // before its weather said whether it rained (w's fourth): its weather read again once; and one kept before
  // its lineups' order was (lo: each side's starting nine in batting order, null when StatsAPI hasn't them),
  // for the batters' props (matchups.mjs mlbMatchups))
  const stale = (f) => !f?.v || !('u' in f) || (Array.isArray(f.w) && f.w.length < 4) || !('lo' in f);
  const todo = history.filter((g) => g.final && stale(facts.games[g.id]) && !facts.games[g.id]?.tried);
  const wanted = [...todo.map((g) => g.date), ...upcoming.map(({ game }) => game.date)].sort();
  const rows = [];
  if (wanted.length) {
    // (in month-long asks over the days needed)
    let from = Date.parse(wanted[0].slice(0, 10)) - DAY;
    const end = Date.parse(wanted.at(-1).slice(0, 10)) + DAY;
    const asks = [];
    for (; from <= end; from += 31 * DAY) asks.push([isoDay(from), isoDay(Math.min(end, from + 30 * DAY))]);
    for (const got of await pool(asks, 3, ([a, b]) => mlbSchedule(a, b))) rows.push(...(got ?? []));
  }
  const byTeams = new Map();
  for (const r of rows) {
    const code = (t) => MLB_CODES[t.team?.abbreviation] ?? t.team?.abbreviation;
    for (const side of [r.teams.home, r.teams.away]) if (side.team?.id) facts.mlbTeams[side.team.id] = code(side);
    const key = `${code(r.teams.home)}|${code(r.teams.away)}`;
    byTeams.set(key, [...(byTeams.get(key) ?? []), r]);
  }
  const used = new Set();
  const match = (g) => {
    const list = byTeams.get(`${g.homeAbbr}|${g.awayAbbr}`) ?? [];
    let best = null;
    for (const r of list) {
      const off = Math.abs(Date.parse(r.gameDate) - Date.parse(g.date));
      if (used.has(r.gamePk) || off > 14 * 36e5 || r.status?.detailedState === 'Postponed') continue;
      if (!best || off < best.off) best = { r, off };
    }
    if (best) used.add(best.r.gamePk);
    return best?.r ?? null;
  };
  const factsOf = (r) => {
    const loc = r.venue?.location?.defaultCoordinates;
    return {
      pk: r.gamePk,
      hp: r.teams.home.probablePitcher ? String(r.teams.home.probablePitcher.id) : null,
      ap: r.teams.away.probablePitcher ? String(r.teams.away.probablePitcher.id) : null,
      w: weatherOf(r.weather),
      at: loc ? [loc.latitude, loc.longitude] : null,
      az: r.venue?.location?.azimuthAngle ?? null,
      roof: r.venue?.fieldInfo?.roofType ?? null,
      names: [r.teams.home.probablePitcher?.fullName ?? null, r.teams.away.probablePitcher?.fullName ?? null],
      v: r.venue?.id ? String(r.venue.id) : null,
      u: (() => {
        const o = (r.officials ?? []).find((x) => x.officialType === 'Home Plate');
        if (o) facts.umps[o.official.id] = o.official.fullName;
        return o ? String(o.official.id) : null;
      })(),
      vn: r.venue?.name ?? null,
      lineups: r.lineups?.homePlayers?.length && r.lineups?.awayPlayers?.length ? [r.lineups.homePlayers.map((p) => String(p.id)), r.lineups.awayPlayers.map((p) => String(p.id))] : null,
      lineupNames: [r.lineups?.homePlayers?.map((p) => p.fullName) ?? [], r.lineups?.awayPlayers?.map((p) => p.fullName) ?? []],
    };
  };
  // (every lineup's batters and every probable starter: how each bats and throws, asked once per player)
  const handsFor = async (list) => {
    const ids = [...new Set(list.flatMap((f) => [...(f.lineups?.flat() ?? []), f.hp, f.ap]).filter((id) => id && !facts.hands[id]))];
    if (ids.length) for (const [id, h] of await mlbHands(ids)) facts.hands[id] = h;
  };
  // (a lineup as how many bat left, right and both ways)
  const counts = (ids) => ['L', 'R', 'S'].map((side) => ids.filter((id) => (facts.hands[id] ?? 'R')[0] === side).length);
  const matched = todo.map((g) => [g, match(g)]).filter(([, r]) => r);
  const found = matched.map(([g, r]) => [g, factsOf(r)]);
  await handsFor(found.map(([, f]) => f));
  const hit = new Set(matched.map(([g]) => g.id));
  // (one matched before (pk) and not now is a failed ask, asked again next run; one never matched, tried)
  if (rows.length) for (const g of todo) if (!hit.has(g.id) && !facts.games[g.id]?.pk) facts.games[g.id] = { ...(facts.games[g.id] ?? {}), tried: 1 };
  for (const [g, f] of found) {
    // (asked again for what it lacked: what it had kept where the new ask has none)
    const was = facts.games[g.id] ?? {};
    facts.games[g.id] = { ...was, pk: f.pk, hp: f.hp ?? was.hp ?? null, ap: f.ap ?? was.ap ?? null, w: f.w ?? was.w ?? null, at: f.at ?? was.at ?? null, v: f.v ?? was.v ?? null, u: f.u ?? was.u ?? null, lu: f.lineups ? f.lineups.map(counts) : (was.lu ?? null), lo: f.lineups ?? was.lo ?? null };
    if (f.v) facts.venues[f.v] = f.vn;
    for (const [id, name] of [
      [f.hp, f.names[0]],
      [f.ap, f.names[1]],
    ]) {
      if (id) facts.pitchers[id] = { n: name, logs: {}, totals: {}, at: {}, ...(facts.pitchers[id] ?? {}) };
    }
  }
  // (the coming games: their probables, the posted weather or else the forecast at an open-air park, with
  // the wind's push toward center field by which way the park faces)
  for (const { game } of upcoming) {
    const r = match(game);
    if (!r) continue;
    const f = factsOf(r);
    await handsFor([f]);
    const l = live.get(game.id);
    Object.assign(l, f, { lu: f.lineups ? f.lineups.map(counts) : null });
    if (f.v) facts.venues[f.v] = f.vn;
    for (const [id, name] of [
      [f.hp, f.names[0]],
      [f.ap, f.names[1]],
    ]) {
      if (id) facts.pitchers[id] = { n: name, logs: {}, totals: {}, at: {}, ...(facts.pitchers[id] ?? {}) };
    }
    if (!f.w && f.roof === 'Open' && f.at) {
      const fc = await forecast(f.at, game.date);
      if (fc) {
        const toward = ((fc.from ?? 0) + 180) % 360;
        const out = f.az === null || fc.from === null ? 0 : fc.wind * Math.cos(((toward - f.az) * Math.PI) / 180);
        // (rain: the history's is StatsAPI's report at first pitch, so a game without one posted yet is no
        // rain (the same thing a forecast can't say); one whose forecast has a tenth of an inch or more over its
        // first hours, or no rain in it at all, flagged: WEATHER.mlb)
        l.w = [fc.temp, Math.round(out * 10) / 10, 0, 0];
        l.forecast = fc;
        if (!Number.isFinite(fc.precip)) l.weatherMissing = 'its forecast has no rain in it';
        else if (fc.precip >= 0.1) l.weatherMissing = `rain forecast (${fc.precip} in) and no weather report posted yet`;
      } else l.weatherMissing = 'no forecast for an open-air park';
    }
  }
  await pitcherLines(history, upcoming, facts, live, today);
}

// (a StatsAPI weather report as [temperature, wind toward center (mph; in from it, negative), indoors 1/0,
// raining 1/0 (its condition: rain, drizzle, showers, a storm)])
export function weatherOf(w) {
  if (!w || w.temp === undefined || w.temp === '') return null;
  const indoor = /dome|roof closed/i.test(w.condition ?? '') ? 1 : 0;
  const mph = Number((w.wind ?? '').match(/(\d+)\s*mph/)?.[1] ?? 0);
  const dir = w.wind ?? '';
  const push = /out to cf/i.test(dir) ? 1 : /out to (lf|rf)/i.test(dir) ? 0.7 : /in from cf/i.test(dir) ? -1 : /in from (lf|rf)/i.test(dir) ? -0.7 : 0;
  const rain = !indoor && /rain|drizzle|shower|storm/i.test(w.condition ?? '') ? 1 : 0;
  return [Number(w.temp), mph * push, indoor, rain];
}

// Each starter's lines for the seasons he starts in: the season's game log (asked again once he's started
// since, or is about to) and last season's totals
async function pitcherLines(history, upcoming, facts, live, today) {
  const need = new Map();
  const add = (id, season, date) => {
    if (!id) return;
    const key = `${season}`;
    const p = facts.pitchers[id];
    if (!p) return;
    // (and a log kept before its pitch counts were (sources.mjs PITCH_COLS): asked again once, for the props'
    // leash and rest (matchups.mjs mlbMatchups))
    const stale = !p.logs[key] || (p.at[key] < today && date >= p.at[key]) || (p.logs[key].length > 0 && p.logs[key][0].length < PITCH_COLS);
    if (stale) need.set(`${id}|${season}`, { id, season });
    if (!p.logs[season - 1] && !p.totals[season - 1]) need.set(`${id}|${season - 1}|t`, { id, season: season - 1, totals: true });
  };
  for (const g of history) {
    const f = facts.games[g.id];
    if (f?.pk) for (const id of [f.hp, f.ap]) add(id, g.season, g.date.slice(0, 10));
  }
  for (const { game } of upcoming) {
    const l = live.get(game.id);
    for (const id of [l?.hp, l?.ap]) add(id, game.season, today);
  }
  const groups = new Map();
  for (const n of need.values()) {
    const key = `${n.season}|${n.totals ? 'season' : 'gameLog'}`;
    groups.set(key, [...(groups.get(key) ?? []), n.id]);
  }
  for (const [key, ids] of groups) {
    const [season, type] = key.split('|');
    const got = await mlbPitching(ids, season, type);
    for (const id of ids) {
      const p = facts.pitchers[id];
      const g = got.get(id);
      if (!g) continue;
      if (type === 'season') p.totals[season] = g.splits.length ? pitchLine(g.splits[0].stat) : [0, 0, 0, 0, 0, 0, 0];
      else {
        p.logs[season] = g.splits.filter((s) => s.date).map((s) => [Number(s.date.replace(/-/g, '')), ...pitchLine(s.stat)]);
        p.at[season] = today;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The terms: each game's numbers, worked out in date order from what was known before it
// ---------------------------------------------------------------------------

// Every game's terms (margin terms m, total terms t, by TERMS order) and what they came from (info, for the
// ledger), the coming games' from their live facts. games: the history and the coming ones, any order.
export function featurize(sport, cfg, games, facts, live) {
  const list = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const lineups = sport === 'mlb' ? lineupsOf(list, facts, live) : null;
  const more = { nfl: FOOTBALL_TERMS, nhl: HOCKEY_TERMS, mlb: BASEBALL_TERMS }[sport] ?? [];
  const terms = [...TERMS[sport], ...(SCHEDULE_TERMS[sport] ?? []), ...more, ...OFFICIAL_TERMS[sport], ...RANKER_TERMS[sport], ...(lineups?.terms ?? [])];
  const blowout = BLOWOUT[sport] ?? Infinity;
  const mTerms = terms.filter((t) => t.on === 'm');
  const tTerms = terms.filter((t) => t.on === 't');
  const ranker = rankerOf(sport, facts.teams ?? []);
  const out = new Map();
  const home = homePlaces(list);
  const where = (g) => {
    const f = facts.games?.[g.id];
    if (f?.at) return f.at;
    return facts.places?.[g.venue] ?? facts.places?.[home.get(g.home)] ?? null;
  };
  const last = new Map();
  const starters = STARTERS[sport](cfg, facts, live);
  const weather = WEATHER[sport]?.(facts, live) ?? (() => null);
  const bb = sport === 'mlb' ? baseballOf(facts, live) : null;
  const second = sport === 'nfl' ? footballOf(facts, live) : sport === 'nhl' ? hockeyOf(facts, live) : sport === 'mlb' ? bb.of : () => null;
  const officials = officialsOf(sport, facts, live, bb?.extra);
  const elevOf = (g) => facts.elev?.[g.venue] ?? facts.elev?.[home.get(g.home)] ?? null;
  for (const g of list) {
    const t = Date.parse(g.date);
    const at = where(g);
    const elev = elevOf(g);
    const side = (id, isHome) => {
      const prev = last.get(id);
      const fresh = !prev || prev.season !== g.season;
      const rest = fresh ? cfg.context.restCap : Math.min(cfg.context.restCap, Math.round((t - prev.t) / DAY));
      const own = facts.places?.[home.get(id)] ?? null;
      const from = fresh ? own : prev.at;
      const b2b = !fresh && rest <= 1 ? 1 : 0;
      // (games in the last four, five and seven nights, this one counted; a back-to-back's clock and climb)
      const times = fresh ? [t] : [...prev.times, t];
      const within = (days) => times.filter((x) => t - x < days * DAY - 6 * 36e5).length;
      const east = b2b && at && prev.at && at[1] - prev.at[1] >= 10 ? 1 : 0;
      const climb = b2b && elev !== null && prev.elev !== null ? Math.max(0, elev - prev.elev) / 1000 : 0;
      // (the schedule's situations, SCHEDULE_TERMS: the side's clock against its home's, the start by its own home
      // clock, its last result, its trip or stand so far)
      const zHere = zoneOf(at);
      const zOwn = zoneOf(own);
      const zFrom = zoneOf(from);
      const tzHome = zHere !== null && zOwn !== null ? zHere - zOwn : 0;
      const tzMove = zHere !== null && zFrom !== null ? zHere - zFrom : 0;
      const clock = clockAt(t, own);
      const late = clock === null ? 0 : Math.max(0, clock - 21);
      const early = clock === null ? 0 : Math.max(0, 12 - clock);
      const prevMargin = fresh || !Number.isFinite(prev.margin) ? null : prev.margin;
      const letdown = prevMargin !== null && prevMargin >= blowout ? 1 : 0;
      const bounce = prevMargin !== null && prevMargin <= -blowout ? 1 : 0;
      const trip = isHome ? 0 : fresh || !prev.away ? 1 : prev.trip + 1;
      const stand = !isHome ? 0 : fresh || prev.away ? 1 : prev.stand + 1;
      return { rest, b2b, miles: at && from ? Math.round(miles(from, at)) : 0, times: times.slice(-6), dense3: within(4) >= 3 ? 1 : 0, dense4: within(5) >= 4 ? 1 : 0, east, climb, tzHome, tzMove, late, early, letdown, bounce, in7: within(7), trip, stand };
    };
    const h = side(g.home, true);
    const a = side(g.away, false);
    const s = starters(g, { b2b: [h.b2b, a.b2b] });
    const w = weather(g);
    const r = ranker(g);
    const lu = lineups?.of(g);
    const x2 = second(g);
    const o = officials(g);
    const v = {
      ...(x2?.terms ?? {}),
      ...(o?.terms ?? {}),
      dense3: a.dense3 - h.dense3,
      dense4: a.dense4 - h.dense4,
      b2bEast: a.east - h.east,
      altitude: a.climb - h.climb,
      ...(r?.terms ?? {}),
      ...(lu?.terms ?? {}),
      rest: h.rest - a.rest,
      b2b: a.b2b - h.b2b,
      b2bT: a.b2b + h.b2b,
      travel: (a.miles - h.miles) / 1000,
      // (the schedule's situations: SCHEDULE_TERMS)
      tzHome: a.tzHome - h.tzHome,
      tzMove: a.tzMove - h.tzMove,
      clockLate: a.late - h.late,
      clockEarly: a.early - h.early,
      letdown: a.letdown - h.letdown,
      bounce: a.bounce - h.bounce,
      density7: a.in7 - h.in7,
      tripLong: a.trip >= 4 ? 1 : 0,
      firstHome: h.stand === 1 && !g.neutral ? 1 : 0,
      altitudeT: elev !== null && elev > 1000 ? 1 : 0,
      letdownT: a.letdown + h.letdown,
      // (lopsidedT: set as the game is predicted, from the ratings' own expectation: ratings.mjs setDynamic)
      lopsidedT: 0,
      // (the NFL's home field above the visitors' own: its elevation less theirs (their home's), per 1,000 m)
      ...(sport === 'nfl' ? { altitudeHome: g.neutral || elev === null ? 0 : Math.max(0, elev - (facts.elev?.[home.get(g.away)] ?? elev)) / 1000 } : {}),
      ...(s?.terms ?? {}),
      ...(w?.terms ?? {}),
    };
    // (the day-of terms at what was known before their facts were posted (DAY_OF_TERMS): the starters' and the
    // hockey module's own fallback where they give one, else none; each entry [index, that value, when known])
    const before = { ...(x2?.early ?? {}), ...(s?.early ?? {}) };
    const dayOf = (list) => {
      const out = [];
      list.forEach((x, i) => {
        const facts = dayOfFacts(sport, x.key);
        if (!facts.length) return;
        const full = v[x.key] ?? 0;
        const early = before[x.key] ?? 0;
        if (full !== early) out.push([i, early, dayOfKnownAt(facts, t)]);
      });
      return out;
    };
    out.set(g.id, {
      m: mTerms.map((x) => v[x.key] ?? 0),
      t: tTerms.map((x) => v[x.key] ?? 0),
      dayOf: { m: dayOf(mTerms), t: dayOf(tTerms) },
      info: { rest: [h.rest, a.rest], b2b: [h.b2b, a.b2b], miles: [h.miles, a.miles], ...(s?.info ? { starters: s.info } : {}), ...(w?.info ? { weather: w.info } : {}), ...(r ? { ranker: r.info } : {}), ...(lu?.info ? { lineups: lu.info } : {}), ...(x2?.info ? { more: x2.info } : {}), ...(o?.info ? { officials: o.info } : {}), schedule: { dense: [h.dense3 + h.dense4, a.dense3 + a.dense4], east: [h.east, a.east], climb: [h.climb, a.climb], tzHome: [h.tzHome, a.tzHome], tzMove: [h.tzMove, a.tzMove], clock: [h.late - h.early, a.late - a.early], last: [h.letdown - h.bounce, a.letdown - a.bounce], in7: [h.in7, a.in7], trip: a.trip, stand: h.stand }, flags: [...(s?.flags ?? []), ...(x2?.flags ?? []), ...(w?.flags ?? [])] },
    });
    // (each side's game kept for its next: when and where, its margin once final (the schedule terms' last result),
    // whether it was away and how long its trip or stand has run)
    const margin = g.final && g.hs !== null && g.as !== null ? g.hs - g.as : null;
    for (const [id, x, isHome] of [
      [g.home, h, true],
      [g.away, a, false],
    ])
      last.set(id, { t, season: g.season, at, elev, times: x.times, margin: margin === null ? null : isHome ? margin : -margin, away: !isHome, trip: x.trip, stand: x.stand });
    if (g.final) {
      x2?.learn?.();
      o?.learn?.();
    }
    if (g.final) s?.learn?.();
    if (g.final) lineups?.learn?.();
  }
  return { terms: { m: mTerms, t: tTerms }, feats: out };
}

// MLB's lineups by hand: each side's share of batters with the platoon edge on the other's starter (a lefty
// against a righty, a switch hitter always), and each ballpark's own terms, fit per park: its runs (the
// total there, beyond the home edge) and its lean by hand (the lefty share of each lineup against the
// starter it faces, as an edge to the side with more and as runs to the total). Lineups not posted yet: the
// team's last 10. Parks with fewer than 40 games in the history get none.
function lineupsOf(list, facts, live) {
  const seen = new Map();
  for (const g of list) {
    const v = g.final && facts.games?.[g.id]?.v;
    if (v && !g.neutral) seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  const parks = [...seen].filter(([, n]) => n >= 40).map(([v]) => v);
  const name = (v) => facts.venues?.[v] ?? `park ${v}`;
  const terms = [
    { key: 'platoon', group: 'starters', on: 'm', label: 'Platoon edge', unit: "per whole lineup more with the platoon edge on the other side's starter" },
    { key: 'platoonT', group: 'starters', on: 't', label: 'Platoon edges (total)', unit: 'to the total per whole lineup with the platoon edge, both sides, over 55%' },
    ...parks.map((v) => ({ key: `park:${v}`, gate: 'park', group: 'park', on: 't', label: name(v), unit: 'to the total at this park' })),
    ...parks.map((v) => ({ key: `parkL:${v}`, gate: 'parkHand', group: 'park', on: 'm', label: name(v), unit: 'per whole lineup more lefties (against the starter faced) than the other side, at this park' })),
    ...parks.map((v) => ({ key: `parkLT:${v}`, gate: 'parkHand', group: 'park', on: 't', label: name(v), unit: 'to the total per whole lineup of lefties on both sides over 40%, at this park' })),
  ];
  const known = new Set(parks);
  const recent = new Map();
  const avg = (team) => {
    const r = recent.get(team) ?? [];
    return r.length ? [0, 1, 2].map((i) => r.reduce((s, x) => s + x[i], 0) / r.length) : null;
  };
  return {
    terms,
    of(g) {
      this.learn = null;
      const f = g.final ? facts.games?.[g.id] : live.get(g.id);
      if (!f?.pk) return null;
      const luH = f.lu?.[0] ?? avg(g.home);
      const luA = f.lu?.[1] ?? avg(g.away);
      const pending = g.final && f.lu ? f.lu : null;
      this.learn = () => {
        if (!pending) return;
        recent.set(g.home, [...(recent.get(g.home) ?? []), pending[0]].slice(-10));
        recent.set(g.away, [...(recent.get(g.away) ?? []), pending[1]].slice(-10));
      };
      if (!luH || !luA) return null;
      const throws = (id) => (id ? (facts.hands?.[id] ?? 'RR')[1] : 'R');
      const n = (lu) => Math.max(1, lu[0] + lu[1] + lu[2]);
      // (what a lineup does against a starter's throwing hand: its lefty share and its platoon-edge share)
      const vs = (lu, hand) => ({ left: (lu[0] + (hand === 'R' ? lu[2] : 0)) / n(lu), edge: ((hand === 'R' ? lu[0] : lu[1]) + lu[2]) / n(lu) });
      const h = vs(luH, throws(f.ap));
      const a = vs(luA, throws(f.hp));
      const v = !g.neutral && known.has(f.v) ? f.v : null;
      const r3 = (x) => Math.round(x * 1000) / 1000;
      return {
        terms: {
          platoon: h.edge - a.edge,
          platoonT: h.edge + a.edge - 1.1,
          ...(v ? { [`park:${v}`]: 1, [`parkL:${v}`]: h.left - a.left, [`parkLT:${v}`]: h.left + a.left - 0.8 } : {}),
        },
        info: { lefties: [r3(h.left), r3(a.left)], platoon: [r3(h.edge), r3(a.edge)], posted: !!f.lu, park: v ? name(v) : null },
      };
    },
    learn: null,
  };
}

// (each team's home: where it played most of its latest season's home games)
function homePlaces(list) {
  const counts = new Map();
  for (const g of list) {
    if (!g.venue || g.neutral) continue;
    const c = counts.get(g.home) ?? new Map();
    c.set(g.venue, (c.get(g.venue) ?? 0) + 1 + g.season * 1000);
    counts.set(g.home, c);
  }
  return new Map([...counts].map(([id, c]) => [id, [...c].sort((x, y) => y[1] - x[1])[0][0]]));
}

// An injury report's status for a player (by ESPN id, or by name): 'out', 'questionable' or null
function statusOf(report, teamId, { id, name }) {
  const list = report?.get(String(teamId)) ?? [];
  const hit = list.find((p) => (id && p.id === id) || (name && p.name === name));
  if (!hit) return null;
  return OUT.test(hit.status) ? 'out' : QUESTIONABLE.test(hit.status) ? 'questionable' : null;
}

// Starters, per sport: a function of a game that gives its starter terms, what they came from and any
// worries (flags: a key player questionable, a starter unknown), and learns from it once it's final
// (one sport's starters read, for the tests: STARTERS[sport](cfg, facts, live))
export const startersOf = (sport, cfg, facts, live) => STARTERS[sport](cfg, facts, live);
const STARTERS = {
  // The NFL: whether each side starts its usual quarterback (the one with most of its last 4 starts this season;
  // before its first start, last season's last 4: a team's week 1 is measured against the one it ended with),
  // and if not, how much worse the one starting is: each quarterback's offense's EPA a play on neutral downs in
  // his starts (recent seasons counting most), pulled toward a backup's by 6 starts; the usual one's less the
  // starter's, over 0.15 (a typical starter against a typical backup), from -3 (far better: a starter back
  // from an injury long enough for his backup to become the usual one) to 3 (far worse); a starter not known
  // yet (the usual one out, no one named): a typical backup. A coming game flagged (the stake cut to the
  // minimum) where a side's starter isn't its usual one and his own starts are too few to measure him (under
  // 3), or its usual one is out with no one named, or there's no usual one to measure against
  nfl: (cfg, facts, live) => {
    const starts = new Map();
    const quality = new Map();
    const BACKUP = -0.08;
    const qOf = (qb) => {
      const x = quality.get(qb);
      return x ? (x.sum + BACKUP * 6) / (x.n + 6) : BACKUP;
    };
    let pending = null;
    return (g) => {
      const row = facts.nfl?.get(g.id);
      const l = live.get(g.id);
      const flags = [];
      const one = (team, where) => {
        const qb = row?.[`${where}_qb_id`] || null;
        const name = row?.[`${where}_qb_name`] || null;
        const all = starts.get(team) ?? [];
        const now = all.filter((s) => s.season === g.season);
        const mine = (now.length ? now : all.filter((s) => s.season === g.season - 1)).slice(-4);
        const tally = new Map();
        for (const s of mine) tally.set(s.qb, (tally.get(s.qb) ?? 0) + 1);
        const usual = [...tally].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
        const usualName = mine.findLast((s) => s.qb === usual)?.name ?? null;
        let backup = usual && qb && qb !== usual ? 1 : 0;
        const abbr = where === 'home' ? g.homeAbbr : g.awayAbbr;
        let usualOut = false;
        if (l && usual) {
          const st = statusOf(l.injuries, team, { name: usualName });
          if (st === 'out') (backup = 1), (usualOut = true);
          if (st === 'questionable') flags.push(`QB ${usualName} questionable`);
        }
        const starter = backup && qb && qb !== usual ? qb : null;
        if (backup) backup = Math.round(Math.max(-3, Math.min(3, (qOf(usual) - (starter ? qOf(starter) : BACKUP)) / 0.15)) * 100) / 100;
        // (a coming game's quarterback the model can't measure well: flagged, the stake cut to the minimum)
        if (l && !g.final) {
          if (!usual && qb) flags.push(`QB ${name}: no usual quarterback to measure him against (${abbr})`);
          else if (starter && (quality.get(starter)?.n ?? 0) < 3) flags.push(`QB ${name ?? 'a backup'} starts for ${usualName}, with too few starts to measure him (${abbr})`);
          else if (usualOut && !starter) flags.push(`QB ${usualName} out, his starter not named (${abbr})`);
        }
        return { backup, name: backup && !qb ? null : name, usual: usualName };
      };
      const h = one(g.home, 'home');
      const a = one(g.away, 'away');
      pending = row ? { g, row } : null;
      return {
        terms: { qb: a.backup - h.backup, qbT: a.backup + h.backup },
        info: { home: h.name, away: a.name, backup: [h.backup, a.backup] },
        flags,
        learn: () => {
          if (!pending) return;
          for (const [team, where] of [
            [pending.g.home, 'home'],
            [pending.g.away, 'away'],
          ]) {
            const qb = pending.row[`${where}_qb_id`];
            if (qb) starts.set(team, [...(starts.get(team) ?? []).slice(-20), { season: pending.g.season, qb, name: pending.row[`${where}_qb_name`] }]);
            // (his start's EPA a play, a season back counting 0.7)
            const plays = facts.plays?.[pending.g.id];
            const at = where === 'home' ? 0 : 2;
            if (qb && plays && plays[at + 1] >= 15) {
              const x = quality.get(qb) ?? { sum: 0, n: 0, season: pending.g.season };
              const fade = Math.pow(0.7, pending.g.season - x.season);
              quality.set(qb, { sum: x.sum * fade + plays[at] / plays[at + 1], n: x.n * fade + 1, season: pending.g.season });
            }
          }
        },
      };
    };
  },

  // The NBA: the production of each side's regulars (20+ minutes a game, 3+ games, seen in its last 10) who
  // aren't playing: missing from the box score, or listed out on the injury report (questionable: half)
  nba: (cfg, facts, live) => {
    let season = null;
    const players = new Map();
    const roster = new Map();
    const played = new Map();
    const regulars = (team) =>
      [...(roster.get(team) ?? [])]
        .map((id) => [id, players.get(id)])
        .filter(([, p]) => p.team === team && p.gp >= 3 && p.min / p.gp >= 20 && (played.get(team) ?? 0) - p.last < 10)
        .map(([id, p]) => ({ id, eff: p.eff / p.gp }));
    return (g) => {
      if (g.season !== season) {
        season = g.season;
        players.clear();
        roster.clear();
        played.clear();
      }
      const box = facts.games?.[g.id];
      const l = live.get(g.id);
      const flags = [];
      const missing = (team, where) => {
        let out = 0;
        const names = [];
        const regs = regulars(team);
        if (box && g.final) {
          const in_ = new Set(box[where].map((p) => p[0]));
          for (const r of regs) if (!in_.has(r.id)) (out += r.eff), names.push(r.id);
        } else if (l?.injuries) {
          for (const r of regs) {
            const st = statusOf(l.injuries, team, { id: r.id });
            if (st === 'out') (out += r.eff), names.push(r.id);
            if (st === 'questionable') {
              out += r.eff / 2;
              if (r.eff >= 20) flags.push(`a top player questionable (${where === 'h' ? g.homeAbbr : g.awayAbbr})`);
            }
          }
        }
        // (a coming game: a regular (20+ minutes, 3+ games) gone 10 or more of its games, so off the list above,
        // and not listed out now: back, maybe, or about to be, and the team's rating learned from the games
        // without him; nothing here prices his return, so it's flagged, the stake cut to the minimum)
        if (!g.final && l?.injuries) {
          const n = played.get(team) ?? 0;
          for (const id of roster.get(team) ?? []) {
            const p = players.get(id);
            if (!p || p.team !== team || p.gp < 3 || p.min / p.gp < 20 || n - p.last < 10) continue;
            if (statusOf(l.injuries, team, { id }) === 'out') continue;
            flags.push(`a regular back from ${n - p.last} games out, maybe (${where === 'h' ? g.homeAbbr : g.awayAbbr}): his return not priced`);
            break;
          }
        }
        // (what was known before the inactives (DAY_OF_TERMS): the regulars who missed the team's last game)
        const n = played.get(team) ?? 0;
        const early = regs.reduce((s, r) => s + (players.get(r.id).last < n ? r.eff : 0), 0);
        return { out: Math.round(out * 10) / 10, players: names.length, early: Math.round(early * 10) / 10 };
      };
      const h = box || l ? missing(g.home, 'h') : { out: 0, players: 0, early: 0 };
      const a = box || l ? missing(g.away, 'a') : { out: 0, players: 0, early: 0 };
      return {
        terms: { out: (a.out - h.out) / 10, outT: (a.out + h.out) / 10 },
        early: { out: (a.early - h.early) / 10, outT: (a.early + h.early) / 10 },
        info: { missing: [h.out, a.out], playersOut: [h.players, a.players] },
        flags,
        learn: () => {
          if (!box) return;
          for (const [team, where] of [
            [g.home, 'h'],
            [g.away, 'a'],
          ]) {
            const n = (played.get(team) ?? 0) + 1;
            played.set(team, n);
            const r = roster.get(team) ?? new Set();
            for (const [id, min, eff] of box[where]) {
              const p = players.get(id) ?? { gp: 0, min: 0, eff: 0 };
              players.set(id, { team, gp: p.gp + 1, min: p.min + min, eff: p.eff + eff, last: n });
              r.add(id);
            }
            roster.set(team, r);
          }
        },
      };
    };
  },

  // The NHL: each starting goalie's save rate to date (last season's at half weight, pulled toward the league's
  // by 500 shots of it) as goals a game saved over an average goalie's 30 shots, against the team's usual (its
  // last 10 starters' average, which its rating already carries): a backup's start is what moves it. A coming
  // game with no probable goalie listed: the last starter, but on the second night of a back-to-back his backup
  // (flagged either way: the stake cut to the minimum)
  nhl: (cfg, facts, live) => {
    const goalies = new Map();
    let lgSa = 30000;
    let lgGa = 2700;
    const lastStarter = new Map();
    const recent = new Map();
    const quality = (id, season) => {
      const lg = 1 - lgGa / lgSa;
      const s = goalies.get(id);
      if (!s) return 0;
      const w = s.season === season ? 1 : 0.5;
      const sv = (w * (s.sa - s.ga) + 500 * lg) / (w * s.sa + 500);
      return Math.round((sv - lg) * 30 * 1000) / 1000;
    };
    // (a team's backup: the goalie who started most of its last 10 other than its last starter; null with none)
    const backupOf = (team) => {
      const tally = new Map();
      for (const x of recent.get(team) ?? []) if (x !== lastStarter.get(team)) tally.set(x, (tally.get(x) ?? 0) + 1);
      return [...tally].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    };
    return (g, sched = {}) => {
      const box = facts.games?.[g.id];
      const l = live.get(g.id);
      const flags = [];
      const one = (team, where) => {
        let id = null;
        let name = null;
        // (the sources split on the goalie (goalieOf: neither confirmed): his quality the blend of the two by the
        // named one's share, a soft term, not a coin; one of them out, the other alone; flagged)
        let blend = null;
        if (box && g.final) id = box[where][0]?.[0] ?? null;
        else if (l) {
          let p = l[where === 'h' ? 'home' : 'away'];
          const abbr = where === 'h' ? g.homeAbbr : g.awayAbbr;
          if (p?.split && p.alt) {
            const outs = [p.id, p.alt.id].map((x) => !!x && statusOf(l.injuries, team, { id: x }) === 'out');
            if (outs[0] && !outs[1] && p.alt.id) p = { ...p.alt, status: 'expected' };
            else if (!outs[0] && !outs[1]) {
              blend = { alt: p.alt.id ?? null, altName: p.alt.name ?? null, share: Number.isFinite(p.share) ? p.share : 0.5 };
              flags.push(`goalie unsettled (${abbr}): ${p.name} or ${p.alt.name}, the sources split`);
            }
          }
          if (p && statusOf(l.injuries, team, { id: p.id }) !== 'out') ({ id, name } = p);
          // (none named on the second night of a back-to-back: last night's starter rarely goes again, so his
          // backup (or, with none seen, an average goalie: no id); otherwise the last starter)
          else if (sched.b2b?.[where === 'h' ? 0 : 1]) {
            id = backupOf(team);
            flags.push(`no probable goalie on a back-to-back (${abbr}): ${id ? 'his backup' : 'an average goalie'} assumed`);
          } else {
            id = lastStarter.get(team) ?? null;
            flags.push(`no probable goalie (${abbr})`);
          }
        }
        const q0 = id ? quality(id, g.season) : 0;
        const q = blend && id ? Math.round((blend.share * q0 + (1 - blend.share) * (blend.alt ? quality(blend.alt, g.season) : 0)) * 1000) / 1000 : q0;
        const usual = recent.get(team) ?? [];
        const norm = usual.length ? usual.reduce((s, x) => s + quality(x, g.season), 0) / usual.length : q;
        // (what was known before the goalies (DAY_OF_TERMS): the no-probable rule above, the last starter, his
        // backup on the second night of a back-to-back)
        const eid = sched.b2b?.[where === 'h' ? 0 : 1] ? backupOf(team) : (lastStarter.get(team) ?? null);
        const eq = eid ? quality(eid, g.season) : 0;
        const enorm = usual.length ? norm : eq;
        return { id, name: blend && name && blend.altName ? name + ' or ' + blend.altName : name, q, vs: Math.round((q - norm) * 1000) / 1000, early: Math.round((eq - enorm) * 1000) / 1000 };
      };
      const h = box || l ? one(g.home, 'h') : { q: 0, vs: 0, early: 0 };
      const a = box || l ? one(g.away, 'a') : { q: 0, vs: 0, early: 0 };
      return {
        terms: { goalie: h.vs - a.vs, goalieT: h.vs + a.vs },
        early: { goalie: h.early - a.early, goalieT: h.early + a.early },
        info: { home: h.name ?? h.id ?? null, away: a.name ?? a.id ?? null, saved: [h.q, a.q], vsUsual: [h.vs, a.vs] },
        flags,
        learn: () => {
          if (!box) return;
          for (const [team, where] of [
            [g.home, 'h'],
            [g.away, 'a'],
          ]) {
            if (box[where][0]) {
              lastStarter.set(team, box[where][0][0]);
              recent.set(team, [...(recent.get(team) ?? []), box[where][0][0]].slice(-10));
            }
            for (const [id, sa, ga] of box[where]) {
              const s = goalies.get(id);
              const keep = s && s.season === g.season ? 1 : s ? 0.5 : 0;
              goalies.set(id, { sa: (s?.sa ?? 0) * keep + sa, ga: (s?.ga ?? 0) * keep + ga, season: g.season });
              lgSa += sa;
              lgGa += ga;
            }
          }
        },
      };
    };
  },

  // MLB: each probable starter's runs a 9 innings to date (half his runs allowed, half his strikeouts, walks and
  // home runs as runs: FIP), this season's plus last season's at half weight, pulled toward the league's by 40
  // innings of it, as runs a 9 innings fewer than average
  mlb: (cfg, facts, live) => {
    const all = Object.values(facts.pitchers ?? {}).flatMap((p) => Object.values(p.logs ?? {}).flat());
    const sum = (rows) => rows.reduce((s, r) => s.map((v, i) => v + (r[i + 1] ?? 0)), [0, 0, 0, 0, 0, 0, 0]);
    const lgLine = all.length ? sum(all) : [3e5, 4.4e4, 4e4, 7.7e4, 2.8e4, 3.3e3, 9e3];
    const ra9 = (x) => (27 * x[1]) / Math.max(1, x[0]);
    const fipRaw = (x) => (13 * x[6] + 3 * (x[4] + x[5]) - 2 * x[3]) / Math.max(1, x[0] / 3);
    const lgRa9 = ra9(lgLine);
    const fipC = lgRa9 - fipRaw(lgLine);
    const quality = (id, season, day) => {
      const p = facts.pitchers?.[id];
      if (!p) return 0;
      const cur = sum((p.logs?.[season] ?? []).filter((r) => r[0] < day));
      const prevRows = p.logs?.[season - 1];
      const prev = prevRows ? sum(prevRows) : (p.totals?.[season - 1] ?? [0, 0, 0, 0, 0, 0, 0]);
      const K = 120;
      const line = cur.map((v, i) => v + 0.5 * prev[i] + (K * lgLine[i]) / Math.max(1, lgLine[0]));
      const est = 0.5 * ra9(line) + 0.5 * (fipRaw(line) + fipC);
      return Math.round((lgRa9 - est) * 1000) / 1000;
    };
    return (g) => {
      const f = g.final ? facts.games?.[g.id] : live.get(g.id);
      const flags = [];
      if (!f?.pk) return null;
      // (the game's day as StatsAPI's logs date it, the US Eastern one: by ESPN's UTC date a night game out
      // west falls on the next day, and its own line would count as before it)
      const day = Number(etDay(Date.parse(g.date)).replace(/-/g, ''));
      const hq = f.hp ? quality(f.hp, g.season, day) : 0;
      const aq = f.ap ? quality(f.ap, g.season, day) : 0;
      if (!g.final && (!f.hp || !f.ap)) flags.push('a starting pitcher not announced');
      return {
        terms: { pitcher: hq - aq, pitcherT: hq + aq },
        info: { home: facts.pitchers?.[f.hp]?.n ?? null, away: facts.pitchers?.[f.ap]?.n ?? null, saved: [hq, aq] },
        flags,
      };
    };
  },
};

// (the share of a forecast's rain and snow taken as what will fall: half, till past forecasts can be fit)
export const FORECAST_WET = 0.5;

// Weather, per sport (outdoor games only; anything indoors, under a closed roof or unknown is no effect)
export const WEATHER = {
  nfl: (facts, live) => {
    // (the rain and snow fit only once the archive has filled the history (football.mjs WX_COVER of its
    // outdoor finals known): till then a final not filled yet would count as a dry one, so they're no effect
    // anywhere, the props' too)
    const wet = (facts.wxCover?.share ?? 0) >= WX_COVER;
    // (the stadiums with a retractable roof: nflverse has a coming game's roof blank there, and their finals
    // open or closed)
    const opens = new Set([...(facts.nfl?.values() ?? [])].filter((r) => r.roof === 'open').map((r) => r.stadium_id));
    return (g) => {
      const row = facts.nfl?.get(g.id);
      const l = live.get(g.id);
      const roof = row?.roof ?? '';
      // (a coming game under a retractable roof not yet said open or closed: its weather unknown, and marked
      // missing (no game flag: the roof's usually shut in bad weather) so the props that weigh the weather are
      // cut, and its total too (run.mjs))
      if (!g.final && !roof && row && opens.has(row.stadium_id)) return { info: { roof: 'retractable', missing: true } };
      if (!['outdoors', 'open'].includes(roof)) return row ? { info: { roof: roof || 'unknown' } } : null;
      const temp = l?.weather ? l.weather.temp : row.temp === '' || row.temp === 'NA' ? null : Number(row.temp);
      const wind = l?.weather ? l.weather.wind : row.wind === '' || row.wind === 'NA' ? null : Number(row.wind);
      // (the rain and snow over its window: a final's from the archive (football.mjs facts.wx), a coming game's
      // from the forecast at FORECAST_WET of what it says (a forecast's rain is far noisier than its wind or
      // its cold, and a big one comes in smaller on average: the fit's sizes are the archive's, what fell);
      // unknown, null: no effect, and a coming game's flagged (its forecast failed))
      const wx = g.final ? facts.wx?.[g.id] : null;
      const fc = (v) => (Number.isFinite(v) ? Math.round(v * FORECAST_WET * 100) / 100 : null);
      const precip = !wet ? null : g.final ? (wx?.[0] ?? null) : fc(l?.weather?.precip);
      const snow = !wet ? null : g.final ? (wx?.[1] ?? null) : fc(l?.weather?.snow);
      const missing = !g.final && !!l && (!l.weather || !!l.weatherMissing);
      return {
        // (rain capped at half an inch and snow at four over the window: past that it's all one storm)
        terms: { cold: temp === null ? 0 : Math.max(0, 50 - temp) / 10, wind: wind === null ? 0 : Math.max(0, wind - 5) / 10, precip: precip === null ? 0 : Math.min(0.5, precip) * 10, snow: snow === null ? 0 : Math.min(4, snow) },
        info: { roof, temp, wind, precip, snow, ...(!g.final && Number.isFinite(l?.weather?.precip) ? { precipForecast: l.weather.precip } : {}), forecast: !!l?.weather, ...(wet ? {} : { rainUnfit: true }), ...(missing ? { missing: true } : {}) },
        flags: missing ? ['no forecast for an outdoor game: its weather unseen'] : [],
      };
    };
  },
  mlb: (facts, live) => (g) => {
    const f = g.final ? facts.games?.[g.id] : live.get(g.id);
    const w = f?.w;
    // (a coming game at an open-air park whose weather can't be fully seen, flagged: its markets at the least
    // stake)
    const flags = !g.final && f?.weatherMissing ? [`${f.weatherMissing}: its weather unseen`] : [];
    if (!w || w[2]) return w ? { info: { roof: 'closed' } } : flags.length ? { info: { missing: true }, flags } : null;
    // (rain: w[3], 1 or 0, StatsAPI's report at first pitch; a game kept before it was, or a coming one
    // without a report posted, unknown: none)
    const rain = w[3] === 1 ? 1 : 0;
    return { terms: { temp: (w[0] - 70) / 10, windOut: w[1] / 10, rain }, info: { temp: w[0], windOut: w[1], rain: w.length > 3 ? !!rain : null, forecast: !!f.forecast, ...(flags.length ? { missing: true } : {}) }, flags };
  },
};
