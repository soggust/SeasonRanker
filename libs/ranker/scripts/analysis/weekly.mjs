// The weekly AI team analysis for MLB, NBA and NHL (scheduled Monday mornings, Central; tried again later
// in the day; the NFL's runs Tuesdays: apps/nfl/scripts/analysis/weekly.mjs): once a day at most for each
// sport, teams only. For each sport:
//   - nothing until its data is on the season being played (the NBA before its rollover) and has games
//   - where each team's season stands, from ESPN (season-state.mjs): a team still playing gets the week's
//     preview; a team whose season is over (eliminated, or the champion once the final is done) gets its
//     recap, once: that's its last report of the season
//   - only once the site's published data (origin/master) has every game played before today, so a
//     report never cites a game the site doesn't show yet
//   - Claude through the Batch API under a hard cap on what the run can spend (analyze.mjs), then the
//     reports published for the site and pushed live
//
//   node libs/ranker/scripts/analysis/weekly.mjs mlb nba nhl     (npm run teams:analysis; one or more sports)
//   ... --dry           (no calls: the sheets built, the jobs and their worst cost listed)
//   ... --force         (again today)
//   ... --mode=recap    (only recaps, or only previews: --mode=preview)
//   ... --teams=147,115 (only these teams, by key: the Teams tab row's TM-<key>; or ESPN's abbreviation)
//   ... --limit=3       (at most this many reports a sport)
//   ... --cap=10        (the most a sport's run may spend, in $; 10 unless set)
//   ... --no-push       (publish for the site, but don't commit or push)
//
// A sport that already ran today, isn't on its season yet, or whose site data is behind stops without
// spending anything; the next scheduled try picks it up. Each run's measured cost is logged
// (.cache/analysis/spend.jsonl, and the run log).
//
// Pushing (as the NFL's): the analysis folders alone are committed on the current branch, then that commit
// is put on origin/master from a separate checkout (.cache/analysis/push-tree-teams) and pushed.

import { publishDirs } from './publish-tree.mjs';
import '../env.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDossiers, dataSeason, dayOf, ROOT, SPORTS, siteFile } from './dossier.mjs';
import { analyze, cacheDir, DEFAULT_CAP, publish, published, worstCost } from './analyze.mjs';
import { leagueSeason, OFFSEASON, PRESEASON, postseasonGames, standings, teamStatus } from './season-state.mjs';

const TREE = path.join(ROOT, '.cache/analysis/push-tree-teams');
const today = new Date().toLocaleDateString('en-CA');
const stamp = () => new Date().toLocaleString();
const log = (text) => console.log(`${stamp()}: ${text}`);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const sports = args.filter((a) => !a.startsWith('--')).map((s) => s.toLowerCase());
const DRY = flag('dry');
const MODE = option('mode');
const TEAMS = option('teams')?.split(',').map((t) => t.trim().toUpperCase()) ?? null;
const LIMIT = option('limit') ? Number(option('limit')) : null;
const CAP = option('cap') ? Number(option('cap')) : DEFAULT_CAP;

const git = (gitArgs, cwd = ROOT) => {
  const r = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

// (from a worktree of its own, the main checkout's index untouched: publish-tree.mjs)
function push(dirs, names) {
  return publishDirs({ root: ROOT, tree: TREE, dirs, message: `Update ${names.join(', ')} analysis (${today})`, log });
}

// The site's games for each team (its regular season row, and its postseason row), as published
function siteGames(sport) {
  const count = (file) => {
    const rows = file?.TM ?? null;
    const out = new Map();
    if (rows) for (const t of rows) out.set(t.teamLogo, t.games);
    else for (const c of file?.HC ?? []) out.set(c.teamLogo, (out.get(c.teamLogo) ?? 0) + c.games);
    return out;
  };
  return { regular: count(siteFile(sport, 'skill-players.json')), post: count(siteFile(sport, 'skill-players.post.json')) };
}

// One sport's run: true when it's done for today (ran, or nothing to do), false to try again later
async function runSport(sport) {
  const cfg = SPORTS[sport];
  if (!cfg) {
    log(`${sport}: not a sport here (${Object.keys(SPORTS).join(', ')})`);
    return true;
  }
  const mark = path.join(cacheDir(sport), 'last-run.json');
  if (!DRY && !flag('force') && existsSync(mark) && JSON.parse(readFileSync(mark, 'utf8')).date === today) {
    log(`${cfg.name}: already ran today`);
    return true;
  }
  git(['fetch', 'origin', 'master']);
  const season = dataSeason(sport);
  let league = await leagueSeason(cfg.espn);
  // (the data still on a finished season, ESPN on the next: the NBA's before its rollover. That season's
  // recaps, the teams without one (every team's season over), then nothing until the data rolls over: the
  // owner, 2026-10-19, the NBA's 2025-26 ended before these reports existed and had none)
  const finished = league.year > season;
  if (finished) {
    log(`${cfg.name}: the site's data is on ${cfg.label(season)}, ESPN on ${cfg.label(league.year)}; ${cfg.label(season)}'s recaps only`);
    league = { year: season, type: OFFSEASON };
  } else if (league.year !== season) {
    log(`${cfg.name}: the site's data is on ${cfg.label(season)}, ESPN on ${cfg.label(league.year)}; nothing until the data rolls over`);
    return true;
  }
  const games = siteGames(sport);
  if (league.type === PRESEASON || ![...games.regular.values()].some((g) => g > 0)) {
    log(`${cfg.name}: no games in the ${cfg.label(season)} data yet; nothing to do`);
    return true;
  }
  const label = cfg.label(season);
  const teams = await standings(cfg.espn, season);
  const postGames = await postseasonGames(cfg.espn, season);
  const status = teamStatus({ season: league, teams, games: postGames });

  // the teams to write: every one but those with this season's recap already out
  const sheets = await buildDossiers(sport, { season, status, standings: teams, games: postGames, log });
  let jobs = [];
  for (const [key, s] of sheets) {
    const done = published(sport, key, label);
    if (done?.mode === 'recap') continue;
    if (s.mode === 'preview') {
      // (a preview only with games around it: played in the last week or coming in the next)
      const lastPlayed = s.dossier.results.last10.at(-1)?.date ?? s.dossier.postseason?.series.at(-1)?.games.at(-1)?.date ?? null;
      const recent = lastPlayed && Date.parse(lastPlayed) > Date.now() - 8 * 864e5;
      if (!recent && !s.week.length) continue;
    }
    jobs.push({ key, ...s });
  }
  if (finished) jobs = jobs.filter((j) => j.mode === 'recap');
  if (MODE) jobs = jobs.filter((j) => j.mode === MODE);
  if (TEAMS) jobs = jobs.filter((j) => TEAMS.includes(j.key.toUpperCase()) || TEAMS.includes(j.dossier.team.abbr));
  if (LIMIT) jobs = jobs.slice(0, LIMIT);
  const recaps = jobs.filter((j) => j.mode === 'recap').length;
  log(`${cfg.name} ${label}: ${jobs.length} to write (${recaps} recaps, ${jobs.length - recaps} previews)${jobs.length ? `: ${jobs.map((j) => `${j.dossier.team.abbr}${j.mode === 'recap' ? ' (recap)' : ''}`).join(', ')}` : ''}`);
  if (!jobs.length) {
    if (!DRY) writeMark(mark);
    return true;
  }

  // the site caught up: every game played before today in its published data (the GitHub data update,
  // on its own schedule), for every team being written
  const behind = [];
  const before = dayOf(new Date().toISOString());
  for (const j of jobs) {
    const regular = j.playedDays.filter((day) => day < before).length;
    const post = j.postPlayedDays.filter((day) => day < before).length;
    const shownRegular = games.regular.get(j.logo) ?? 0;
    const shownPost = games.post.get(j.logo) ?? 0;
    if (shownRegular < regular || shownPost < post) behind.push(`${j.dossier.team.abbr} ${shownRegular + shownPost}/${regular + post}`);
  }
  if (behind.length) {
    log(`${cfg.name}: the site isn't caught up yet (games shown/played: ${behind.join(', ')}); trying again at the next scheduled time`);
    return DRY;
  }

  // (sheets kept for a look: .cache/analysis/<sport>/dossiers)
  const dir = path.join(cacheDir(sport), 'dossiers');
  mkdirSync(dir, { recursive: true });
  for (const j of jobs) writeFileSync(path.join(dir, `${j.key}.json`), JSON.stringify(j.dossier, null, 1));
  if (DRY) {
    // (a rough worst case without counting: the sheet's characters over 3.5 a token)
    const worst = jobs.reduce((s, j) => s + worstCost(JSON.stringify(j.dossier).length / 3.5 + 3000), 0);
    log(`${cfg.name}: dry run, no calls; at most about $${worst.toFixed(2)} for these (cap $${CAP})`);
    return true;
  }
  const { written } = await analyze(sport, jobs, { cap: CAP, log: (t) => log(t) });
  publish(sport, label);
  if (written.length) writeMark(mark);
  return true;
}

function writeMark(mark) {
  mkdirSync(path.dirname(mark), { recursive: true });
  writeFileSync(mark, JSON.stringify({ date: today, at: new Date().toISOString() }));
}

if (!sports.length) {
  console.log('usage: node libs/ranker/scripts/analysis/weekly.mjs mlb nba nhl [--dry] [--force] [--mode=recap|preview] [--teams=KEY,..] [--limit=N] [--cap=10] [--no-push]');
  process.exit(1);
}
const ran = [];
let failed = false;
for (const sport of sports) {
  try {
    const before = existsSync(path.join(cacheDir(sport), 'last-run.json')) ? readFileSync(path.join(cacheDir(sport), 'last-run.json'), 'utf8') : null;
    await runSport(sport);
    const after = existsSync(path.join(cacheDir(sport), 'last-run.json')) ? readFileSync(path.join(cacheDir(sport), 'last-run.json'), 'utf8') : null;
    if (after !== before) ran.push(sport);
  } catch (e) {
    failed = true;
    log(`${sport}: failed: ${e.stack ?? e}`);
  }
}
// (a push that never landed fails the run, as a sport's failure does)
if (ran.length && !DRY && !flag('no-push') && !push(ran.map((s) => `apps/${s}/src/StaticData/analysis`), ran.map((s) => SPORTS[s].name))) failed = true;
log('done');
process.exit(failed ? 1 : 0);
