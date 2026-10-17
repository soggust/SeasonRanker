// The Overview splash's data files (apps/<sport>/scripts/build-splash.mjs): where a season's files go and what
// the site already has for it. Each season's sit beside its other files: the current season's in
// apps/<sport>/src/StaticData/, a past one's in its seasons/<year>/:
//
//   outcomes.json             how each team's season ended (outcomes.mjs)
//   numbers.json              each player's number that season: { <card id>: "16" }
//   best-games.<TAB>.json     each player's best game that season, one file per tab (best-game.mjs)
//   milestones.json           the season's notable marks (MLB: 40 HR, 200 K, a cycle, a no-hitter...)
//   lockers.json              the NFL's team lockers: each team's roster that season by its logo name, each man's
//                             number and popularity (apps/nfl/scripts/build-splash.mjs lockersOf)
//
// A card id is the row's gsisId, as the card's link keys it (the NFL's GSIS id or "QB-<ESPN id>", the NBA's
// Basketball-Reference id, the NHL's id, MLB's "H-<id>" / "P-<id>"); a team is its logo's name (team-colors.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const staticDir = (sport) => path.join(ROOT, 'apps', sport, 'src', 'StaticData');

// The sport's current season (its update-data.mjs's CURRENT_SEASON, as scripts/rollover.mjs reads it)
export function currentSeason(sport) {
  const text = readFileSync(path.join(ROOT, 'apps', sport, 'scripts', 'update-data.mjs'), 'utf8');
  const season = Number(text.match(/^const CURRENT_SEASON = (\d+);/m)?.[1]);
  if (!season) throw new Error(`No CURRENT_SEASON in apps/${sport}/scripts/update-data.mjs`);
  return season;
}

// A season's folder, or null when the site hasn't the season
export function seasonDir(sport, season) {
  if (season === currentSeason(sport)) return staticDir(sport);
  const dir = path.join(staticDir(sport), 'seasons', String(season));
  return existsSync(dir) ? dir : null;
}

// Every season the site has, oldest first (the past ones, then the current)
export function siteSeasons(sport) {
  const past = readdirSync(path.join(staticDir(sport), 'seasons'))
    .filter((d) => /^\d{4}$/.test(d))
    .map(Number);
  return [...new Set([...past, currentSeason(sport)])].sort((a, b) => a - b);
}

// The seasons a run asks for: "2018-2021", "2019,2021", one season, ALL (every one the site has) or none (the
// current)
export function seasonsAsked(sport, arg = process.argv[2], all = process.env.ALL === '1') {
  if (all || arg === 'all') return siteSeasons(sport);
  if (!arg) return [currentSeason(sport)];
  if (arg.includes('-')) {
    const [a, b] = arg.split('-').map(Number);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return arg.split(',').map(Number);
}

// A logo's name from its path: "assets/NFL_Icons/Bucs.png" -> "Bucs", "assets/NHL_Icons/PHX_20032004-20132014.svg"
// -> "PHX", "assets/MLB_Icons/147.svg" -> "147"
export const teamKeyOf = (logo) => (logo ? path.basename(String(logo)).replace(/\.(png|svg)$/, '').split('_')[0] : null);

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

// The season's rows as the site has them, every part (regular, .post, .all, the NFL's .ur) and tab: { tab: [row] }
// (the NFL's QBs come from games.json: tab QB, card id "QB-<ESPN id>"). A row: { id, cardId, name, team
// (its logo's name), teamName, games, maxGames (the most of any part's: the regular season and playoffs
// together), stats }
export function siteRows(dir) {
  const tabs = {};
  const seen = new Map();
  const add = (tab, row) => {
    const key = `${tab}|${row.cardId}`;
    const had = seen.get(key);
    // (a part's row beside the regular season's: the regular season's kept; maxGames, the most any part has)
    if (had) {
      had.maxGames = Math.max(had.maxGames ?? 0, row.games ?? 0);
      return;
    }
    row.maxGames = row.games ?? 0;
    seen.set(key, row);
    (tabs[tab] ??= []).push(row);
  };
  const files = readdirSync(dir).filter((f) => /^(skill-players|games)(\.(ur|post|all|ur\.post|ur\.all))?\.json$/.test(f));
  // (the regular season's first: its team and games stand for the season)
  files.sort((a, b) => a.split('.').length - b.split('.').length);
  for (const file of files) {
    const json = readJson(path.join(dir, file));
    if (Array.isArray(json)) {
      // (the NFL's QBs: games.json)
      for (const r of json) add('QB', { id: r.id, cardId: `QB-${r.id}`, name: r.name, team: teamKeyOf(r.teamLogo), teamName: r.team, games: r.box?.games ?? r.wins + r.losses, stats: r.box ?? {} });
      continue;
    }
    for (const [tab, rows] of Object.entries(json ?? {})) {
      if (!Array.isArray(rows)) continue;
      for (const r of rows) if (r?.gsisId) add(tab, { id: r.id, cardId: r.gsisId, name: r.name, team: teamKeyOf(r.teamLogo), teamName: r.teamName, games: r.games, stats: r.stats ?? {}, awards: r.awards });
    }
  }
  return tabs;
}

// Stable JSON: keys in order, so a night with nothing new writes the same bytes
export const sortKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

// A file written only when its contents change (no churn in the nightly commit); its size
export function writeIfChanged(file, value) {
  const text = JSON.stringify(value);
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return { file, size: text.length, same: true };
  writeFileSync(file, text);
  return { file, size: text.length, same: false };
}

// A best game's tip, the game itself: "W 38-6 vs DET · Oct 22, 2023" (best-game.mjs)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const longDate = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
export const tipOf = (g) => [[g.result, g.score, `${g.home ? 'vs' : 'at'} ${g.opp}`].filter(Boolean).join(' '), g.round, longDate(g.date)].filter(Boolean).join(' · ');

// The best-games files, one per tab, each game with its tip
export function writeBestGames(dir, byTab) {
  const out = [];
  for (const [tab, games] of Object.entries(byTab)) {
    if (!Object.keys(games).length) continue;
    const tipped = Object.fromEntries(Object.entries(games).map(([id, g]) => [id, { ...g, tip: tipOf(g) }]));
    out.push(writeIfChanged(path.join(dir, `best-games.${tab}.json`), sortKeys(tipped)));
  }
  return out;
}

// The team-colors.ts table: { logo name: [ESPN abbreviation, ESPN id, color, second color] }
export function teamTable(sport) {
  const text = readFileSync(path.join(ROOT, 'apps', sport, 'src', 'sport', 'team-colors.ts'), 'utf8');
  const block = text.slice(text.indexOf('export const TEAMS'));
  const out = {};
  for (const m of block.matchAll(/^\s+'?([A-Za-z0-9]+)'?: \['([^']*)', '([^']*)'/gm)) {
    out[m[1]] = [m[2], m[3]];
    if (m.index > block.indexOf('};')) break;
  }
  return out;
}

// The roster source a build read, kept for the tests (tests/splash-roster.test.mjs checks the numbers files and
// the team lockers against it, no network): .cache/<sport>/rosters/<season>.json, each player's teams that
// season and the number he wore with each: { <player id>: [[<team key>, "16"], ...] }. The NFL's source is
// nflverse's roster CSV, kept in .cache/nflverse as it is.
export function cacheRoster(sport, season, numbers) {
  const dir = path.join(ROOT, '.cache', sport, 'rosters');
  mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [id, list] of numbers) out[id] = list.map((x) => [String(x.team), String(x.num)]);
  writeFileSync(path.join(dir, `${season}.json`), JSON.stringify(sortKeys(out)));
}
export function cachedRoster(sport, season) {
  return readJson(path.join(ROOT, '.cache', sport, 'rosters', `${season}.json`));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Map in small batches (a polite pace)
export async function mapBatched(items, size, fn, pause = 0) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    if (pause) await sleep(pause);
  }
  return out;
}
