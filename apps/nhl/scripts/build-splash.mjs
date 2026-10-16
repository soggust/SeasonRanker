// The NHL's files for the Overview's splash (libs/ranker/scripts/splash/files.mjs says what each holds), for a
// season the site has, from the NHL's own API (api-web.nhle.com, free, no key) and the site's game logs:
//   outcomes.json         each team's season: the playoff bracket (its rounds, seeds and series), each series'
//                         games (neutralSite: 2020's hub cities, a Global Series game), the standings on the
//                         regular season's last day (record, division, place)
//   numbers.json          each player's number (the team's roster that season: sweaterNumber)
//   best-games.<TAB>.json each player's best game, from the site's own game logs (src/StaticData/game-logs/:
//                         best-game.mjs's game score)
//
// Usage: node apps/nhl/scripts/build-splash.mjs            the current season (ONLY=outcomes: just outcomes.json)
//        node apps/nhl/scripts/build-splash.mjs 2024       a past one ("2009-2026", "2019,2021", or all)
// Paced like the nightly update (a request every 350 ms, a 429's Retry-After honored).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { currentSeason, seasonDir, seasonsAsked, siteRows, sortKeys, staticDir, writeBestGames, writeIfChanged } from '../../../libs/ranker/scripts/splash/files.mjs';
import { buildOutcomes, gameFor, seriesOf } from '../../../libs/ranker/scripts/splash/outcomes.mjs';
import { bestOf, dayTitle, nhlGoalieGame, nhlSkaterGame } from '../../../libs/ranker/scripts/splash/best-game.mjs';
import { readLogFiles } from './game-log-files.mjs';

const WEB = 'https://api-web.nhle.com/v1';
const CURRENT = currentSeason('nhl');
const seasonId = (season) => `${season - 1}${season}`;

let lastRequest = 0;
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + 350 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'sports-ranker data script' }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (res.status === 429 && attempt < 6) {
        await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after')) || 30) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

// (a game's day where it was played: its UTC start, back five hours)
const localDay = (utc) => new Date(Date.parse(utc) - 5 * 36e5).toISOString().slice(0, 10);
const abbrOf = (t) => (typeof t?.abbrev === 'string' ? t.abbrev : t?.abbrev?.default ?? t?.teamAbbrev?.default ?? t?.teamAbbrev);
const CONF = { Eastern: 'East', Western: 'West' };
// A round's name: "Eastern Conference First Round" style for the conference rounds
function roundName(title, conf, season) {
  if (/stanley cup final/i.test(title)) return 'Stanley Cup Final';
  if (/qualif/i.test(title)) return 'Stanley Cup Qualifiers';
  const confName = conf ? `${conf === 'East' ? 'Eastern' : 'Western'} Conference` : null;
  if (/^conference/i.test(title)) return confName ? `${confName} ${title.replace(/^conference /i, '')}` : title;
  if (/1st round/i.test(title)) return 'First Round';
  if (/2nd round/i.test(title)) return 'Second Round';
  if (season === 2021 && /semifinal/i.test(title)) return 'Stanley Cup Semifinals';
  return title;
}

async function outcomes(season) {
  const seasons = await get(`${WEB}/standings-season`);
  const info = seasons.seasons.find((s) => s.id === Number(seasonId(season)));
  const day = season === CURRENT ? new Date().toISOString().slice(0, 10) : info.standingsEnd;
  const standings = (await get(`${WEB}/standings/${day}`))?.standings ?? [];
  const regDone = season < CURRENT || Date.now() > Date.parse(info.standingsEnd) + 864e5;
  const bracket = regDone ? await get(`${WEB}/playoff-bracket/${season}`) : null;
  const list = (bracket?.series ?? []).filter((s) => s.topSeedTeam && s.bottomSeedTeam);
  // (2020's qualifying round is round 0: everything after it a round later)
  const shift = list.some((s) => s.playoffRound === 0) ? 1 : 0;
  const totalRounds = 4 + shift;
  const seedOf = {};
  const series = [];
  for (const s of list) {
    const [top, bottom] = [abbrOf(s.topSeedTeam), abbrOf(s.bottomSeedTeam)];
    // (the seed a team had in its first series)
    seedOf[top] ??= [s.topSeedRank, s.topSeedRankAbbrev];
    seedOf[bottom] ??= [s.bottomSeedRank, s.bottomSeedRankAbbrev];
    const sched = await get(`${WEB}/schedule/playoff-series/${seasonId(season)}/${s.seriesLetter.toLowerCase()}`);
    const games = (sched?.games ?? [])
      .filter((g) => ['OFF', 'FINAL'].includes(g.gameState))
      .map((g) => ({
        date: localDay(g.startTimeUTC),
        teams: [abbrOf(g.homeTeam), abbrOf(g.awayTeam)],
        home: abbrOf(g.homeTeam),
        score: { [abbrOf(g.homeTeam)]: g.homeTeam.score, [abbrOf(g.awayTeam)]: g.awayTeam.score },
        ot: g.gameOutcome?.lastPeriodType && g.gameOutcome.lastPeriodType !== 'REG',
        neutral: !!g.neutralSite,
      }));
    const [made] = games.length ? seriesOf(games) : [{ teams: [top, bottom], wins: { [top]: 0, [bottom]: 0 }, games: [] }];
    const winner = s.winningTeamId ? (s.winningTeamId === s.topSeedTeam.id ? top : bottom) : null;
    const wins = { [top]: s.topSeedWins ?? made.wins[top] ?? 0, [bottom]: s.bottomSeedWins ?? made.wins[bottom] ?? 0 };
    series.push({ round: s.playoffRound + shift, title: s.seriesTitle, teams: [top, bottom], wins, winner, games: made.games });
  }
  const confOf = Object.fromEntries(standings.map((t) => [t.teamAbbrev.default, CONF[t.conferenceName] ?? null]));
  for (const s of series) s.roundName = (conf) => roundName(s.title, conf ?? confOf[s.teams[0]], season);
  // the field: the bracket's teams, or (2020) the qualifiers' and the round robin's
  const field = new Set(series.flatMap((s) => s.teams));
  const teams = standings.map((t) => {
    const key = t.teamAbbrev.default;
    return {
      key,
      conf: CONF[t.conferenceName] ?? null,
      division: t.divisionName ? `${t.divisionName}` : null,
      divRank: t.divisionSequence ?? null,
      seed: regDone ? seedOf[key]?.[0] ?? null : null,
      seedLabel: regDone ? seedOf[key]?.[1] ?? null : null,
      record: `${t.wins}-${t.losses}-${t.otLosses}`,
      divChamp: regDone && t.divisionSequence === 1,
      points: t.points,
    };
  });
  // how far a team missed by: points behind its conference's last team in
  if (regDone) {
    for (const conf of new Set(teams.map((t) => t.conf))) {
      const mine = teams.filter((t) => t.conf === conf);
      const inField = mine.filter((t) => field.has(t.key));
      if (!inField.length) continue;
      const cut = Math.min(...inField.map((t) => t.points));
      for (const t of mine) if (!field.has(t.key)) t.gamesBack = Math.max(0, cut - t.points);
    }
  }
  // each team's last game: its last playoff game, else its regular season's last (its schedule)
  const lastGames = {};
  for (const t of teams.filter((x) => !field.has(x.key))) {
    const sched = await get(`${WEB}/club-schedule-season/${t.key}/${seasonId(season)}`);
    const g = (sched?.games ?? []).filter((x) => x.gameType === 2 && ['OFF', 'FINAL'].includes(x.gameState)).at(-1);
    if (g) lastGames[t.key] = gameFor({ date: g.gameDate, home: abbrOf(g.homeTeam), score: { [abbrOf(g.homeTeam)]: g.homeTeam.score, [abbrOf(g.awayTeam)]: g.awayTeam.score }, ot: g.gameOutcome?.lastPeriodType && g.gameOutcome.lastPeriodType !== 'REG', neutral: !!g.neutralSite }, t.key);
  }
  const out = buildOutcomes({ teams, series, totalRounds, lastGames, fieldSet: regDone && list.length > 0 });
  // (points behind, in the NHL: the file's gamesBack)
  return out;
}

// ---- jerseys (each team's roster that season) and best games (the site's logs)
async function players(season, rows, teamKeys, known = {}) {
  const numbers = new Map();
  for (const team of teamKeys) {
    const roster = await get(`${WEB}/roster/${team}/${seasonId(season)}`);
    for (const group of ['forwards', 'defensemen', 'goalies']) {
      for (const p of roster?.[group] ?? []) if (p.sweaterNumber !== undefined && p.sweaterNumber !== null) (numbers.get(String(p.id)) ?? numbers.set(String(p.id), []).get(String(p.id))).push({ team, num: String(p.sweaterNumber) });
    }
  }
  const { logs, playoffs } = readLogFiles(path.join(staticDir('nhl'), 'game-logs'), season);
  // ("Apr 30" in a season's log: October to December the year before; 2020's playoffs ran in August and September)
  const MONTH = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const dateOf = (text) => {
    const [mon, d] = text.split(' ');
    const m = MONTH[mon];
    const year = m >= 10 || (m === 9 && season !== 2020) ? season - 1 : season;
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  // (a player the season-end rosters don't have (traded, called up and sent down, a team since moved): the
  // number he wore in his latest game, from its box score, found by the opponent's schedule)
  const schedules = new Map();
  const boxes = new Map();
  const numberInGame = async (id, game) => {
    const [day, vs] = game;
    const opp = vs.replace(/^(vs|@) /, '');
    if (!schedules.has(opp)) schedules.set(opp, (await get(`${WEB}/club-schedule-season/${opp}/${seasonId(season)}`))?.games ?? []);
    const date = dateOf(day);
    const g = schedules.get(opp).find((x) => x.gameDate === date);
    if (!g) return null;
    if (!boxes.has(g.id)) {
      const box = (await get(`${WEB}/gamecenter/${g.id}/boxscore`))?.playerByGameStats ?? {};
      const m = new Map();
      for (const side of ['homeTeam', 'awayTeam']) for (const group of ['forwards', 'defense', 'goalies']) for (const p of box[side]?.[group] ?? []) m.set(String(p.playerId), String(p.sweaterNumber));
      boxes.set(g.id, m);
    }
    return boxes.get(g.id).get(id) ?? null;
  };
  const jerseys = {};
  const best = {};
  for (const [tab, list] of Object.entries(rows)) {
    if (tab === 'HC') continue;
    for (const row of list) {
      const id = String(row.cardId);
      const nums = numbers.get(id);
      const log = logs[id] ?? [];
      if (nums?.length) jerseys[id] ??= (nums.find((x) => x.team === row.team) ?? nums.at(-1)).num;
      else if (known[id]) jerseys[id] ??= known[id];
      else if (log.length && !jerseys[id]) {
        const num = await numberInGame(id, log[0]).catch(() => null);
        if (num) jerseys[id] = num;
      }
      const post = playoffs[id] ?? 0;
      const scored = log.flatMap((g, i) => {
        const [day, vs, result, ...stats] = g;
        const s = g.length === 7 ? nhlGoalieGame(stats) : nhlSkaterGame(stats);
        if (!s) return [];
        const home = vs.startsWith('vs');
        const opp = vs.replace(/^(vs|@) /, '');
        const date = dateOf(day);
        return [{ value: s.value, date, opp, oppTeam: opp, home, ...(result ? { result } : {}), title: dayTitle(date, opp, home), line: s.line, ...(i < post ? { post: true } : {}) }];
      });
      const top = bestOf(scored);
      if (top) (best[tab] ??= {})[id] = { ...top, games: scored.length };
    }
  }
  return { jerseys, best };
}

async function main() {
  for (const season of seasonsAsked('nhl')) {
    const dir = seasonDir('nhl', season);
    if (!dir) {
      console.log(`NHL ${season}: not a season the site has`);
      continue;
    }
    const o = await outcomes(season);
    const written = [writeIfChanged(path.join(dir, 'outcomes.json'), sortKeys(o))];
    // (ONLY=outcomes: the outcomes alone, the players' files left as they are)
    if (process.env.ONLY === 'outcomes') {
      console.log(`NHL ${season}: outcomes (champion ${Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet'})`);
      continue;
    }
    // (the numbers already found from box scores: kept, not asked again each night)
    const known = (() => { try { return JSON.parse(readFileSync(path.join(dir, 'numbers.json'), 'utf8')); } catch { return {}; } })();
    const p = await players(season, siteRows(dir), Object.keys(o), known);
    if (Object.keys(p.jerseys).length) written.push(writeIfChanged(path.join(dir, 'numbers.json'), sortKeys(p.jerseys)));
    written.push(...writeBestGames(dir, p.best));
    const champ = Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet';
    console.log(
      `NHL ${season}: ${Object.keys(o).length} teams (champion ${champ}), ${Object.keys(p.jerseys).length} numbers, ` +
        `${Object.values(p.best).reduce((s, x) => s + Object.keys(x).length, 0)} best games; ` +
        written.map((w) => `${path.basename(w.file)} ${(w.size / 1024).toFixed(1)} KB${w.same ? ' (same)' : ''}`).join(', '),
    );
  }
}

await main();
