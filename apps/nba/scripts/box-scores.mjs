// The NBA's box scores, kept: every player line of every final regular-season and playoff game of a season,
// from ESPN's free scoreboard (the season's game days: its calendar, then each day's games) and its game
// summaries (each final's box score). vs-position.mjs reads them (what each team allowed to each position).
//
// Kept in scripts/box-scores/<season>.json, committed (the NBA update commits it with the data): a run asks
// only for the days since the last one it finished (through) and only for the finals it doesn't have, at a
// polite pace (PACE between requests); a finished season's file is done and never asked about again. A
// request that fails stops the run's asking: what it has is kept, the rest is asked for next run.
//
//   { season, through: 'YYYYMMDD' (every game on and before it in), last: the calendar's last day,
//     games: { <ESPN game id>: { d: 'YYYYMMDD', t: 2 regular season or 3 playoffs, h: home, a: away,
//       p: { h: [line, ...], a: [...] } } },
//     missing: [the finals ESPN has no box score for (its summary a 404, or still empty days after): left out] }
//   a line: [ESPN athlete id, ESPN's position (G, F, C...), minutes, points, rebounds, assists, threes]
//
// Teams by the site's codes (its icons: BRK, GSW, PHO...), not ESPN's. Left out: the preseason, the play-in
// (Basketball-Reference counts it in neither part), the All-Star games and the NBA Cup's final (not in the
// regular season's stats). A postponed or canceled game waits for the day it's played (ESPN lists it there).
// A final whose summary ESPN no longer has (a 404: a few of 2025-26's playoff games) is read from the model
// desk's kept lines where this machine has them (.cache/model/players-nba.json, the same summaries read
// before they went: libs/ranker/scripts/model/playerlogs.mjs); else it's missing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchRetry, pacer } from '../../../libs/ranker/scripts/fetch.mjs';

export const BOX_DIR = path.join(import.meta.dirname, 'box-scores');
const API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
// (a quarter second between requests: about four a second)
const PACE = 250;

// ESPN's team abbreviations -> the site's codes (the rest are the same); an old one its franchise's today
export const ESPN_CODE = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', NOH: 'NOP', NOK: 'NOP', UTAH: 'UTA', WSH: 'WAS', BKN: 'BRK', NJ: 'BRK', CHA: 'CHO', PHX: 'PHO', SEA: 'OKC', VAN: 'MEM' };
export const siteCode = (abbr) => ESPN_CODE[abbr] ?? abbr;

export const boxFile = (season, dir = BOX_DIR) => path.join(dir, `${season}.json`);
export function readBoxes(season, dir = BOX_DIR) {
  const file = boxFile(season, dir);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { season, through: null, last: null, games: {} };
}

// (the regular season's games that aren't in its stats: ESPN's competition types)
const NOT_COUNTED = new Set(['ALLSTAR', 'CC']);
// (a final whose box score is still empty this many days on: missing for good)
const GIVE_UP_DAYS = 3;
const UNPLAYED = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_FORFEIT']);

// (the model desk's kept NBA lines, when this machine has them: { game id: { h: [[id, name, position, minutes,
// points, rebounds, assists, threes, ...]], a } }, home and away as the scoreboard has them)
const DESK_LINES = path.resolve(import.meta.dirname, '../../../.cache/model/players-nba.json');
const deskLines = new Map();
function fromDesk(id, file) {
  if (!deskLines.has(file)) deskLines.set(file, file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
  const g = deskLines.get(file)[id];
  const side = (lines) => (lines ?? []).filter((l) => l[3] > 0).map((l) => [String(l[0]), l[2] ?? '', l[3], l[4], l[5], l[6], l[7]]);
  return g ? { h: side(g.h), a: side(g.a) } : null;
}

// (a day as ESPN's scoreboard takes it: "2025-10-21T07:00Z" -> "20251021"; today's, US Eastern)
const dayOf = (iso) => String(iso).slice(0, 10).replace(/-/g, '');
const todayET = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()).replace(/-/g, '');

// A side's players who played (a minute or more): [id, position, minutes, points, rebounds, assists, threes]
export function boxLines(side) {
  const s = side?.statistics?.[0];
  const at = (k) => (s?.labels ?? []).indexOf(k);
  return (s?.athletes ?? [])
    .filter((a) => !a.didNotPlay && a.stats?.length && Number(a.stats[at('MIN')]) > 0)
    .map((a) => {
      const n = (k) => Number(String(a.stats[at(k)] ?? '').split('-')[0]) || 0;
      return [String(a.athlete.id), a.athlete.position?.abbreviation ?? '', n('MIN'), n('PTS'), n('REB'), n('AST'), n('3PT')];
    });
}

// A season's box scores brought up to date (and saved when anything's new): the kept file's games
// (onSummary: handed each new final's summary as it's read, with its kept game, for another reader of the same
// plays: shot-zones.mjs's shots, so the night asks ESPN once a game)
export async function updateBoxes(season, { dir = BOX_DIR, fetch, log = console.log, today = todayET(), pace = PACE, desk = DESK_LINES, onSummary } = {}) {
  const kept = readBoxes(season, dir);
  kept.missing ??= [];
  // (a finished season: every day of its calendar in, and past July (the calendar of a season under way ends
  // with the regular season until the playoffs are set, so it's asked for again each run))
  if (kept.last && kept.through === kept.last && today > `${season}0731`) return kept;
  const before = pacer(pace);
  const get = (url, notFound) => fetchRetry(url, { as: 'json', before, fetch, ...(notFound !== undefined ? { notFound } : {}) });
  const daysAgo = (day) => (Date.parse(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`) - Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`)) / 864e5;
  const save = () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(boxFile(season, dir), JSON.stringify(kept));
  };
  let added = 0;
  try {
    // (the season's game days: any day of it has the calendar; February's is in every season)
    const board = await get(`${API}/scoreboard?dates=${season}0201`);
    const league = board.leagues?.[0];
    if (Number(league?.season?.year) !== season) throw new Error(`ESPN's ${season}0201 scoreboard is for ${league?.season?.year}`);
    const days = (league.calendar ?? []).map(dayOf).filter((d) => d.length === 8).sort();
    kept.last = days.at(-1) ?? null;
    let clean = true;
    for (const day of days) {
      if (kept.through && day <= kept.through) continue;
      if (day > today) break;
      const events = (await get(`${API}/scoreboard?dates=${day}`)).events ?? [];
      for (const e of events) {
        const type = Number(e.season?.type);
        const comp = e.competitions?.[0];
        if ((type !== 2 && type !== 3) || NOT_COUNTED.has(comp?.type?.abbreviation)) continue;
        if (kept.games[e.id] || kept.missing.includes(e.id)) continue;
        if (!e.status?.type?.completed) {
          // (one still to come holds the day; one postponed or canceled doesn't)
          if (!UNPLAYED.has(e.status?.type?.name)) clean = false;
          continue;
        }
        const side = (w) => comp.competitors.find((c) => c.homeAway === w);
        const [home, away] = [side('home'), side('away')];
        const body = await get(`${API}/summary?event=${e.id}`, null);
        const players = body?.boxscore?.players ?? [];
        const of = (team) => players.find((p) => String(p.team?.id) === String(team?.team?.id));
        // (no summary: the desk's lines, if this machine has them)
        const fromKept = body ? null : fromDesk(e.id, desk);
        const [h, a] = fromKept ? [fromKept.h, fromKept.a] : [boxLines(of(home)), boxLines(of(away))];
        if (!h.length || !a.length) {
          // (a final whose box isn't up yet: asked again next run; none to be had (a 404), or still none days
          // on: missing, left out)
          if (!body || daysAgo(day) > GIVE_UP_DAYS) {
            kept.missing.push(e.id);
            log(`${season}: no box score for ${e.id} (${e.shortName ?? ''}, ${day}): left out`);
          } else clean = false;
          continue;
        }
        kept.games[e.id] = { d: day, t: type, h: siteCode(home.team.abbreviation), a: siteCode(away.team.abbreviation), p: { h, a } };
        if (body && onSummary) onSummary(e.id, body, kept.games[e.id]);
        // (a long first run saved as it goes: a stop keeps what it has)
        if (++added % 100 === 0) save();
      }
      if (clean && day < today) kept.through = day;
    }
  } catch (err) {
    log(`${season}: box scores stopped (${err.message}); ${Object.keys(kept.games).length} kept, the rest next run`);
  }
  if (added || existsSync(boxFile(season, dir))) save();
  log(`${season}: ${added} new box scores, ${Object.keys(kept.games).length} kept (through ${kept.through ?? '-'})`);
  return kept;
}
