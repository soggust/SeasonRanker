// The NBA's files for the Overview's splash (libs/ranker/scripts/splash/files.mjs says what each holds), for a
// season the site has (named for the year it ends in):
//   outcomes.json         each team's season, from ESPN (libs/ranker/scripts/analysis/season-state.mjs: the
//                         league's season, its postseason and play-in games and their series), the standings
//                         (record, seed, division) and each team's schedule (the last game of one that missed)
//   numbers.json          each player's number (Basketball-Reference's team roster pages, its "No." column)
//   best-games.<TAB>.json each player's best game, regular season or playoffs (ESPN's player game logs:
//                         best-game.mjs's Game Score)
//
// Usage: node apps/nba/scripts/build-splash.mjs            the current season
//        node apps/nba/scripts/build-splash.mjs 2016       a past one ("2001-2025", "2019,2021", or all)
// A run asks again only what it lacks: a team's roster page when one of its players has no number yet, a
// player's game log when his games outnumber his best game's file's count (Basketball-Reference allows 20
// requests a minute: one every 3.1 s; ESPN's, a few a second).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fetchRetry, pacer } from '../../../libs/ranker/scripts/fetch.mjs';
import { currentSeason, mapBatched, seasonDir, seasonsAsked, siteRows, sortKeys, teamTable, writeBestGames, writeIfChanged } from '../../../libs/ranker/scripts/splash/files.mjs';
import { buildOutcomes, divisionRanks, gameFor } from '../../../libs/ranker/scripts/splash/outcomes.mjs';
import { bestOf, dayTitle, nbaGame } from '../../../libs/ranker/scripts/splash/best-game.mjs';
import { POSTSEASON, PLAY_IN, REGULAR, leagueSeason, postseasonGames, teamSchedule } from '../../../libs/ranker/scripts/analysis/season-state.mjs';

const LEAGUE = 'basketball/nba';
const CURRENT = currentSeason('nba');
const BBREF = 'https://www.basketball-reference.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const bbrefPace = pacer(3100);
const espnPace = pacer(200);
const espn = (url) => fetchRetry(url, { as: 'json', attempts: 3, backoff: 2000, before: espnPace, notFound: null });

// ESPN's team ids -> the franchise's code (team-colors.ts); the first Charlotte Hornets (to 2002) are ESPN's
// New Orleans franchise but the site's Charlotte
const TEAMS = teamTable('nba');
const KEY_OF_ID = Object.fromEntries(Object.entries(TEAMS).map(([k, [, id]]) => [id, k]));
const keyOf = (id, season) => (String(id) === '3' && season <= 2002 ? 'CHO' : KEY_OF_ID[String(id)] ?? null);
// The franchise's Basketball-Reference code in a season
function bbrefCode(key, season) {
  if (key === 'BRK') return season <= 2012 ? 'NJN' : 'BRK';
  if (key === 'OKC') return season <= 2008 ? 'SEA' : 'OKC';
  if (key === 'MEM') return season <= 2001 ? 'VAN' : 'MEM';
  if (key === 'CHO') return season <= 2002 ? 'CHH' : season <= 2014 ? 'CHA' : 'CHO';
  if (key === 'NOP') return season <= 2005 ? 'NOH' : season <= 2007 ? 'NOK' : season <= 2013 ? 'NOH' : 'NOP';
  return key;
}
const CONF_OF_DIVISION = { Atlantic: 'East', Central: 'East', Southeast: 'East', Northwest: 'West', Pacific: 'West', Southwest: 'West', Midwest: 'West' };
const ROUND_NAMES = { 1: 'First Round', 2: 'Semifinals', 3: 'Finals', 4: 'NBA Finals' };
const roundName = (round) => (conf) => (round === 4 ? 'NBA Finals' : conf ? `${conf === 'East' ? 'Eastern' : 'Western'} Conference ${ROUND_NAMES[round]}` : ROUND_NAMES[round] === 'First Round' ? 'First Round' : `Conference ${ROUND_NAMES[round]}`);

// ---- outcomes
async function outcomes(season) {
  const root = await espn(`https://site.api.espn.com/apis/v2/sports/${LEAGUE}/standings?season=${season}&level=3`);
  const teams = [];
  const walk = (node) => {
    for (const e of node.standings?.entries ?? []) {
      const stat = (name) => e.stats?.find((s) => s.name === name);
      const key = keyOf(e.team.id, season);
      if (!key) continue;
      const division = node.name?.replace(/ Division$/, '') ?? null;
      teams.push({ key, espnId: String(e.team.id), abbr: e.team.abbreviation, division, conf: CONF_OF_DIVISION[division] ?? null, w: stat('wins')?.value ?? 0, l: stat('losses')?.value ?? 0, seed0: stat('playoffSeed')?.value ?? null });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(root ?? {});
  const now = season === CURRENT ? await leagueSeason(LEAGUE) : null;
  const regDone = season < CURRENT || [POSTSEASON, PLAY_IN, 4].includes(now?.type) || (now?.year ?? 0) > season;
  const abbr = Object.fromEntries(teams.map((t) => [t.key, t.abbr]));
  const games = regDone ? await postseasonGames(LEAGUE, season) : [];
  const asGame = (g) => ({ date: new Date(Date.parse(g.date) - 5 * 36e5).toISOString().slice(0, 10), teams: g.teams.map((id) => keyOf(id, season)), home: keyOf(g.home, season), score: Object.fromEntries(Object.entries(g.score).map(([id, v]) => [keyOf(id, season), v])), final: g.completed });
  const playIn = games.filter((g) => g.type === PLAY_IN && g.completed).map(asGame);
  // (the series: Basketball-Reference's playoffs page, whole for every season; ESPN's older postseasons are missing games)
  const series = regDone ? await bbrefSeries(season) : [];
  const field = new Set(series.flatMap((s) => s.teams));
  for (const t of teams) {
    t.seed = field.has(t.key) ? t.seed0 : null;
    t.record = `${t.w}-${t.l}`;
  }
  const ranks = divisionRanks(teams, (t) => t.w / Math.max(1, t.w + t.l));
  for (const t of teams) {
    t.divRank = ranks[t.key];
    t.divChamp = regDone && ranks[t.key] === 1;
  }
  if (regDone && field.size) {
    for (const conf of ['East', 'West']) {
      const mine = teams.filter((t) => t.conf === conf);
      const inField = mine.filter((t) => field.has(t.key));
      const cut = Math.min(...inField.map((t) => t.w - t.l));
      for (const t of mine) if (!field.has(t.key)) t.gamesBack = Math.max(0, (cut - (t.w - t.l)) / 2);
    }
  }
  // (the last game of a team out of the postseason: its play-in game, else its schedule's last)
  const lastGames = {};
  for (const t of teams.filter((x) => !field.has(x.key) && !playIn.some((g) => g.teams.includes(x.key)))) {
    const sched = await teamSchedule(LEAGUE, t.espnId, season, REGULAR).catch(() => []);
    const g = sched.filter((x) => x.completed).at(-1);
    if (g) lastGames[t.key] = gameFor(asGame(g), t.key, (k) => abbr[k] ?? k);
  }
  return { out: buildOutcomes({ teams, series, totalRounds: 4, playIn, lastGames, fieldSet: regDone && field.size > 0, abbrOf: (k) => abbr[k] ?? k }), abbr };
}
// A season's playoff series from Basketball-Reference's playoffs page: each series' round, its teams, the wins
// its games add up to, its winner ("X over Y"), and its games (the box scores' links: the day and the home team)
const BBREF_FRANCHISE = { NJN: 'BRK', SEA: 'OKC', VAN: 'MEM', CHH: 'CHO', CHA: 'CHO', NOH: 'NOP', NOK: 'NOP' };
const ROUND_OF = (name) => (/^finals$/i.test(name) ? 4 : /conference finals/i.test(name) ? 3 : /semifinals/i.test(name) ? 2 : /first round/i.test(name) ? 1 : 0);
export function parsePlayoffSeries(html) {
  const table = html.slice(html.indexOf('id="all_playoffs"'));
  const out = [];
  const heads = [...table.matchAll(/<strong>([^<]+)<\/strong><\/span><\/td>\s*<td>([\s\S]*?)<\/td>/g)];
  heads.forEach((m, i) => {
    const round = ROUND_OF(m[1].trim());
    if (!round) return;
    const teams = [...m[2].matchAll(/\/teams\/([A-Z]{3})\//g)].map((x) => BBREF_FRANCHISE[x[1]] ?? x[1]);
    if (teams.length !== 2) return;
    const over = /<\/a>\s*over\s*<a/.test(m[2]);
    const body = table.slice(m.index + m[0].length, heads[i + 1]?.index ?? undefined);
    const games = [];
    for (const g of body.matchAll(/\/boxscores\/(\d{4})(\d\d)(\d\d)0([A-Z]{3})\.html[\s\S]*?<td>[^<]*<\/td>\s*<td>([^<]*)<\/td>\s*<td>(\d+)<\/td><td>@ ([^<]*)<\/td>\s*<td>(\d+)<\/td>/g)) {
      const home = BBREF_FRANCHISE[g[4]] ?? g[4];
      const away = teams.find((k) => k !== home);
      games.push({ date: `${g[1]}-${g[2]}-${g[3]}`, home, score: { [away]: Number(g[6]), [home]: Number(g[8]) } });
    }
    const wins = Object.fromEntries(teams.map((k) => [k, games.filter((g) => g.score[k] > g.score[teams.find((x) => x !== k)]).length]));
    out.push({ round, roundName: roundName(round), teams, wins, winner: over ? teams[0] : null, games });
  });
  return out;
}
async function bbrefSeries(season) {
  const html = await fetchRetry(`${BBREF}/playoffs/NBA_${season}.html`, { headers: { 'User-Agent': UA }, attempts: 3, backoff: 5000, before: bbrefPace, rateLimit: 2, notFound: '' });
  return parsePlayoffSeries(html);
}

// ---- jerseys: Basketball-Reference's roster pages, for the teams with a player still lacking a number
async function rosterNumbers(code, season) {
  const html = await fetchRetry(`${BBREF}/teams/${code}/${season}.html`, { headers: { 'User-Agent': UA }, attempts: 3, backoff: 5000, before: bbrefPace, rateLimit: 2, notFound: '' });
  const out = new Map();
  for (const m of html.matchAll(/data-stat="number"\s*>([^<]*)<\/th><td class="left "\s*data-append-csv="([^"]+)"/g)) {
    // (two numbers in a season, "8, 24": the later one)
    const num = m[1].split(',').map((x) => x.trim()).filter(Boolean).at(-1);
    if (num) out.set(m[2], num);
  }
  return out;
}

// ---- best games: ESPN's game log
async function gameLog(espnId, season) {
  const log = await espn(`https://site.web.api.espn.com/apis/common/v3/sports/${LEAGUE}/athletes/${espnId}/gamelog?season=${season}`);
  if (!log?.events) return [];
  const labels = log.labels ?? [];
  const out = [];
  for (const type of log.seasonTypes ?? []) {
    const post = /post|playoff/i.test(type.displayName ?? '');
    if (/play-?in|preseason/i.test(type.displayName ?? '')) continue;
    for (const cat of type.categories ?? []) {
      for (const ev of cat.events ?? []) {
        const e = log.events[ev.eventId];
        if (!e) continue;
        const s = nbaGame(Object.fromEntries(labels.map((l, i) => [l, ev.stats?.[i]])));
        if (!s) continue;
        const home = e.atVs !== '@';
        const [hs, as] = [Number(e.homeTeamScore), Number(e.awayTeamScore)];
        const [us, them] = home ? [hs, as] : [as, hs];
        const date = new Date(Date.parse(e.gameDate) - 5 * 36e5).toISOString().slice(0, 10);
        const opp = e.opponent?.abbreviation ?? '';
        out.push({ value: s.value, date, opp, oppTeam: keyOf(e.opponent?.id, season), home, ...(e.gameResult ? { result: e.gameResult } : {}), ...(Number.isFinite(us) ? { score: `${us}-${them}` } : {}), title: dayTitle(date, opp, home), line: s.line, ...(post ? { post: true } : {}) });
      }
    }
  }
  return out;
}

const readOld = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

async function players(season, dir, rows) {
  const known = readOld(path.join(dir, 'numbers.json'));
  const jerseys = {};
  const want = new Map();
  for (const [tab, list] of Object.entries(rows)) {
    if (tab === 'HC') continue;
    for (const row of list) {
      if (known[row.cardId]) jerseys[row.cardId] = known[row.cardId];
      else if (row.team) (want.get(row.team) ?? want.set(row.team, new Set()).get(row.team)).add(row.cardId);
    }
  }
  for (const [team, ids] of want) {
    const nums = await rosterNumbers(bbrefCode(team, season), season).catch((err) => (console.warn(`  ${team} ${season} roster: ${err.message}`), new Map()));
    for (const id of ids) if (nums.get(id)) jerseys[id] = nums.get(id);
    // (a player traded away: his number with his other team, from its page if it was read)
  }
  const best = {};
  const jobs = [];
  for (const [tab, list] of Object.entries(rows)) {
    if (tab === 'HC') continue;
    const old = readOld(path.join(dir, `best-games.${tab}.json`));
    for (const row of list) {
      if (!row.id) continue;
      const had = old[row.cardId];
      // (asked again when his log may have grown: the season being played, his games past the log's; a finished
      // season's ESPN log can be a game or two short of the site's count, kept as it is)
      if (had && (season < CURRENT ? had.games >= row.games || had.games >= row.maxGames - 2 : had.games >= row.maxGames)) (best[tab] ??= {})[row.cardId] = had;
      else jobs.push({ tab, row, had });
    }
  }
  await mapBatched(jobs, 4, async ({ tab, row, had }) => {
    // (a log ESPN couldn't give this time: the one already kept stands)
    const games = await gameLog(row.id, season).catch((err) => (console.warn(`  ${row.name} ${season}: ${err.message}`), null));
    if (!games) {
      if (had) (best[tab] ??= {})[row.cardId] = had;
      return;
    }
    const top = bestOf(games);
    if (top) (best[tab] ??= {})[row.cardId] = { ...top, games: games.length };
  });
  return { jerseys, best, asked: jobs.length };
}

async function main() {
  for (const season of seasonsAsked('nba')) {
    const dir = seasonDir('nba', season);
    if (!dir) {
      console.log(`NBA ${season}: not a season the site has`);
      continue;
    }
    const { out: o } = await outcomes(season);
    const written = [writeIfChanged(path.join(dir, 'outcomes.json'), sortKeys(o))];
    const p = await players(season, dir, siteRows(dir));
    if (Object.keys(p.jerseys).length) written.push(writeIfChanged(path.join(dir, 'numbers.json'), sortKeys(p.jerseys)));
    written.push(...writeBestGames(dir, p.best));
    const champ = Object.entries(o).find(([, v]) => v.result === 'champion')?.[0] ?? 'none yet';
    console.log(
      `NBA ${season}: ${Object.keys(o).length} teams (champion ${champ}), ${Object.keys(p.jerseys).length} numbers, ` +
        `${Object.values(p.best).reduce((s, x) => s + Object.keys(x).length, 0)} best games (${p.asked} logs asked); ` +
        written.map((w) => `${path.basename(w.file)} ${(w.size / 1024).toFixed(1)} KB${w.same ? ' (same)' : ''}`).join(', '),
    );
  }
}

await main();
