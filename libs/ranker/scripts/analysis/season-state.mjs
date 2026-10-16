// Where each team's season stands, from ESPN's free APIs (no key): the league's season and its part
// (preseason, regular season, play-in, postseason, offseason), the standings (who is in, who is
// eliminated: their clincher marks), every postseason game so far (its series and round), and a team's
// schedule. A team's season is over when it has no games left: it missed the postseason (the regular
// season over and it isn't in the field), it lost a series, or the final is done (the champion too).
//
// The status itself (teamStatus) is plain data in, data out: tests/team-analysis.test.mjs.

import { fetchRetry } from '../fetch.mjs';

const SITE = 'https://site.api.espn.com/apis';
const CORE = 'https://sports.core.api.espn.com/v2/sports';
// ESPN's season parts (season.type)
export const PRESEASON = 1;
export const REGULAR = 2;
export const POSTSEASON = 3;
export const OFFSEASON = 4;
export const PLAY_IN = 5;
// The last round, by its games' note ("World Series - Game 7", "NBA Finals - Game 4", "Stanley Cup Final - Game 6")
export const FINAL = /world series|nba finals|stanley cup final/i;

const json = (url) => fetchRetry(url, { as: 'json', attempts: 3, backoff: 2000, timeout: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The league's season now: { year, type } (league: ESPN's path, 'baseball/mlb')
export async function leagueSeason(league) {
  const board = await json(`${SITE}/site/v2/sports/${league}/scoreboard`);
  const season = board.leagues?.[0]?.season;
  return { year: Number(season?.year), type: Number(season?.type?.type ?? season?.type?.id) };
}

// The standings by division: every team's ESPN id, abbreviation, names, division and clincher mark
// ("x", "y", "z", "*", "e" eliminated, "" none yet)
export async function standings(league, year) {
  const root = await json(`${SITE}/v2/sports/${league}/standings?season=${year}&level=3`);
  const teams = [];
  const walk = (node) => {
    for (const e of node.standings?.entries ?? []) {
      const stat = (name) => e.stats?.find((s) => s.name === name || s.type === name);
      teams.push({
        id: String(e.team.id),
        abbr: e.team.abbreviation,
        name: e.team.displayName,
        nickname: e.team.name ?? e.team.shortDisplayName,
        division: node.name,
        clincher: stat('clincher')?.displayValue ?? '',
        gamesPlayed: stat('gamesPlayed')?.value ?? null,
      });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return teams;
}

// A season part's first and last day (core API; null when ESPN has none: a sport with no play-in)
async function partDates(league, year, type) {
  const [sport, lg] = league.split('/');
  try {
    const t = await json(`${CORE}/${sport}/leagues/${lg}/seasons/${year}/types/${type}`);
    return t.startDate ? { start: t.startDate.slice(0, 10), end: t.endDate?.slice(0, 10) ?? null } : null;
  } catch {
    return null;
  }
}

// A game as the status reads it: its day, season part, teams (ESPN ids), whether it's done and who won,
// its round ("NLDS"), and its series when ESPN has one ({ completed, wins: { id: wins } })
export function gameOf(e) {
  const c = e.competitions?.[0] ?? {};
  const headline = c.notes?.[0]?.headline ?? '';
  const teams = (c.competitors ?? []).map((x) => String(x.id ?? x.team?.id));
  const winner = (c.competitors ?? []).find((x) => x.winner);
  return {
    id: String(e.id),
    date: e.date,
    type: Number(e.season?.type ?? c.type?.id ?? 0),
    teams,
    home: String((c.competitors ?? []).find((x) => x.homeAway === 'home')?.id ?? ''),
    neutral: !!c.neutralSite,
    completed: !!c.status?.type?.completed,
    // (the periods played: a hockey game past its third went to overtime or a shootout)
    periods: Number(c.status?.period ?? 0) || null,
    winner: winner ? String(winner.id ?? winner.team?.id) : null,
    score: Object.fromEntries((c.competitors ?? []).map((x) => [String(x.id ?? x.team?.id), Number(x.score?.value ?? x.score ?? 0)])),
    round: headline.split(' - ')[0] || null,
    headline,
    series: c.series ? { completed: !!c.series.completed, summary: c.series.summary ?? null, wins: Object.fromEntries((c.series.competitors ?? []).map((x) => [String(x.id), Number(x.wins ?? 0)])) } : null,
  };
}

// Every postseason (and play-in) game from the first day through today: the scoreboard a day at a
// time (ESPN's ranges fail for some leagues), a few days at once
export async function postseasonGames(league, year, today = new Date()) {
  const parts = (await Promise.all([PLAY_IN, POSTSEASON].map((t) => partDates(league, year, t)))).filter(Boolean);
  if (!parts.length) return [];
  const start = parts.map((p) => p.start).sort()[0];
  const last = new Date(Math.min(today.getTime(), ...parts.map((p) => (p.end ? Date.parse(p.end) : Infinity))));
  const days = [];
  for (let d = new Date(`${start}T12:00:00Z`); d <= last; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  const games = new Map();
  for (let i = 0; i < days.length; i += 6) {
    const boards = await Promise.all(days.slice(i, i + 6).map((day) => json(`${SITE}/site/v2/sports/${league}/scoreboard?dates=${day}`)));
    for (const board of boards) for (const e of board.events ?? []) {
      const g = gameOf(e);
      if (g.type === POSTSEASON || g.type === PLAY_IN) games.set(g.id, g);
    }
    await sleep(150);
  }
  return [...games.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// A team's games in a season part (ESPN's team schedule: done and to come)
export async function teamSchedule(league, teamId, year, type = REGULAR) {
  const s = await json(`${SITE}/site/v2/sports/${league}/teams/${teamId}/schedule?season=${year}&seasontype=${type}`);
  return (s.events ?? []).map(gameOf).map((g) => ({ ...g, type: g.type || type }));
}

// Each team's status: { over, why, champion } by ESPN id.
//   season  { year, type }: the league's season now (leagueSeason)
//   teams   the standings' teams (their ids and clincher marks)
//   games   the postseason and play-in games so far (postseasonGames)
// The regular season is over once the league is past it (play-in, postseason, offseason). Then a team is
// done when: it's marked eliminated, or the postseason has games and it isn't in them (nor in its field
// by its mark, a team with a bye still waiting), or it lost a series (the play-in's losers: not in the
// postseason once it has begun), or it won the final; the offseason ends everyone's.
export function teamStatus({ season, teams, games }) {
  const out = new Map(teams.map((t) => [t.id, { over: false, why: null, champion: false, by: null }]));
  const regularOver = [POSTSEASON, OFFSEASON, PLAY_IN].includes(season.type);
  if (!regularOver) return out;
  const post = games.filter((g) => g.type === POSTSEASON);
  const playIn = games.filter((g) => g.type === PLAY_IN);
  const inPost = new Set(post.flatMap((g) => g.teams));
  const inPlayIn = new Set(playIn.flatMap((g) => g.teams));
  // (the field by the standings' marks: anything but eliminated or none)
  const berth = new Set(teams.filter((t) => t.clincher && t.clincher !== 'e').map((t) => t.id));
  // (by: the team that ended it, or the one beaten in the final)
  const done = (id, why, champion = false, by = null) => out.has(id) && !out.get(id).over && out.set(id, { over: true, why, champion, by });

  // series lost, and the final won (each series once: its last game)
  const series = new Map();
  for (const g of post) if (g.series?.completed) series.set([...g.teams].sort().join('/') + `/${g.round}`, g);
  for (const g of series.values()) {
    const [a, b] = g.teams;
    const [wa, wb] = [g.series.wins[a] ?? 0, g.series.wins[b] ?? 0];
    if (wa === wb) continue;
    const [win, lose] = wa > wb ? [a, b] : [b, a];
    const record = `${Math.max(wa, wb)}-${Math.min(wa, wb)}`;
    done(lose, `lost the ${g.round ?? 'series'} ${Math.min(wa, wb)}-${Math.max(wa, wb)}`, false, win);
    if (FINAL.test(g.headline ?? '')) done(win, `won the ${g.round} ${record}`, true, lose);
  }
  for (const t of teams) {
    if (t.clincher === 'e') done(t.id, inPlayIn.has(t.id) ? 'lost in the play-in' : 'missed the postseason');
    else if (post.length && !inPost.has(t.id) && inPlayIn.has(t.id)) done(t.id, 'lost in the play-in');
    else if (post.length && !inPost.has(t.id) && !berth.has(t.id) && !inPlayIn.has(t.id)) done(t.id, 'missed the postseason');
    else if (season.type === OFFSEASON) done(t.id, inPost.has(t.id) ? 'eliminated' : 'missed the postseason');
  }
  return out;
}
