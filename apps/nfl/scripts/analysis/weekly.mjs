// The weekly NFL analysis run (scheduled after Monday night; tried again later in the day): once a day at
// most, and only once nflverse has every finished game and the site shows them too (Monday night's included).
// Rebuilds the dossiers from fresh data, batch-runs every team and QB, publishes them for the site and pushes
// them live.
//
// Season's end (as MLB, NBA and NHL's: libs/ranker/scripts/analysis/weekly.mjs): a team whose season is over
// (season-state.mjs, from the schedule: its regular season done without a playoff spot, a playoff loss, or
// the Super Bowl played) gets its recap, the year in one section, and so do its QBs. That's its last report
// of the season: the runs after it skip the team and its QBs (analyze.mjs's jobs).
//
// No betting angles (2026-10-14, the owner's: every sport's analysis matches, MLB/NBA/NHL's have none; the
// Bets page has the bets, at live prices). The bet desk that edited the reports' bets into a weekly sheet
// (bet-desk.mjs, grade.mjs, ledger.mjs and --desk) is retired, and its scheduled task "QBRanker NFL bet
// desk" disabled (not deleted).
//
//   node apps/nfl/scripts/analysis/weekly.mjs               (npm run nfl:analysis)
//   node apps/nfl/scripts/analysis/weekly.mjs --push-only   (just commit and push what's published)
//
// A run that's already done today, or whose data is behind (dossier.mjs exits 3), stops without spending
// anything; the next scheduled try picks it up.
//
// Pushing: the analysis folder alone is committed on the current branch (whatever else is in progress stays
// as it is), then that commit is put on origin/master from a separate checkout (.cache/analysis/push-tree)
// and pushed, again if the data bots got there first. A later rebase of the branch drops the duplicate.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const MARK = path.join(ROOT, '.cache/analysis/last-run.json');
const SITE_DIR = 'apps/nfl/src/StaticData/analysis';
const TREE = path.join(ROOT, '.cache/analysis/push-tree');
const today = new Date().toLocaleDateString('en-CA');
const stamp = () => new Date().toLocaleString();

const run = (script, args) => spawnSync(process.execPath, [path.join(import.meta.dirname, script), ...args], { cwd: ROOT, stdio: 'inherit' }).status;
const git = (args, cwd = ROOT) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

function push() {
  // the analysis folder, committed on its own
  git(['add', '-A', '--', SITE_DIR]);
  if (git(['diff', '--cached', '--quiet', '--', SITE_DIR]).ok) {
    console.log(`${stamp()}: no analysis changes to push`);
    return true;
  }
  const committed = git(['commit', '-m', `Update NFL analysis (${today})`, '--', SITE_DIR]);
  if (!committed.ok) {
    console.log(`${stamp()}: commit failed: ${committed.out}`);
    return false;
  }
  const commit = git(['rev-parse', 'HEAD']).out;
  // onto origin/master from a checkout of its own, tried again when someone pushed in between
  for (let attempt = 1; attempt <= 4; attempt++) {
    git(['fetch', 'origin', 'master']);
    if (existsSync(TREE)) git(['worktree', 'remove', '--force', TREE]);
    rmSync(TREE, { recursive: true, force: true });
    git(['worktree', 'prune']);
    if (!git(['worktree', 'add', '--detach', TREE, 'origin/master']).ok) break;
    const picked = git(['cherry-pick', commit], TREE);
    if (!picked.ok) {
      console.log(`${stamp()}: cherry-pick failed: ${picked.out}`);
      git(['cherry-pick', '--abort'], TREE);
      break;
    }
    const pushed = git(['push', 'origin', 'HEAD:master'], TREE);
    if (pushed.ok) {
      console.log(`${stamp()}: pushed to master`);
      git(['worktree', 'remove', '--force', TREE]);
      return true;
    }
    console.log(`${stamp()}: push rejected (try ${attempt}): ${pushed.out.split('\n').at(-1)}`);
  }
  git(['worktree', 'remove', '--force', TREE]);
  console.log(`${stamp()}: couldn't push; the commit is on the local branch (push it by hand)`);
  return false;
}

if (process.argv.includes('--push-only')) process.exit(push() ? 0 : 1);

// (the retired bet desk's own runs: nothing to do; its scheduled task is disabled)
if (process.argv.includes('--desk')) {
  console.log(`${stamp()}: the bet desk is retired (no betting angles in the analysis); nothing to do`);
  process.exit(0);
}

if (existsSync(MARK) && JSON.parse(readFileSync(MARK, 'utf8')).date === today) {
  console.log(`${stamp()}: already ran today`);
  process.exit(0);
}

console.log(`${stamp()}: building dossiers`);
const built = run('dossier.mjs', ['--fresh', '--require-complete']);
if (built === 3) {
  console.log(`${stamp()}: nflverse hasn't every finished game yet; trying again at the next scheduled time`);
  process.exit(0);
}
if (built !== 0) process.exit(built ?? 1);

// The site's own numbers caught up too (the GitHub data update, on its own schedule): every finished game in
// its team-games (data-grades.json on origin/master), so a report never cites a game (Monday night's) the
// site doesn't show yet
{
  git(['fetch', 'origin', 'master']);
  const shown = git(['show', 'origin/master:apps/nfl/src/StaticData/data-grades.json']);
  const [head, ...lines] = readFileSync(path.join(ROOT, '.cache/nflverse/games.csv'), 'utf8').trim().split('\n');
  const at = Object.fromEntries(head.split(',').map((c, i) => [c, i]));
  const season = String(Math.max(...lines.map((l) => +l.split(',')[at.season]).filter(Number.isFinite)));
  const finished = lines.map((l) => l.split(',')).filter((c) => c[at.season] === season && c[at.game_type] === 'REG' && c[at.home_score] && c[at.home_score] !== 'NA').length;
  let siteGames = -1;
  try {
    siteGames = Object.values(JSON.parse(shown.out).teams ?? {}).reduce((s, t) => s + (t.games ?? 0), 0);
  } catch {}
  if (!shown.ok || siteGames < finished * 2) {
    console.log(`${stamp()}: the site isn't caught up yet (${siteGames} team-games shown, ${finished * 2} played); trying again at the next scheduled time`);
    process.exit(0);
  }
}

// Nothing new since the last run (the offseason): don't pay to write the same reports again
const lastRun = existsSync(MARK) ? JSON.parse(readFileSync(MARK, 'utf8')).at : null;
const [header, ...rows] = readFileSync(path.join(ROOT, '.cache/nflverse/games.csv'), 'utf8').trim().split('\n');
const cols = header.split(',');
const [dayCol, scoreCol] = [cols.indexOf('gameday'), cols.indexOf('home_score')];
const latestGame = rows
  .map((line) => line.split(','))
  .filter((c) => c[scoreCol] && c[scoreCol] !== 'NA')
  .map((c) => c[dayCol])
  .sort()
  .at(-1);
if (lastRun && latestGame && latestGame < lastRun.slice(0, 10)) {
  console.log(`${stamp()}: no games since the last run (${lastRun.slice(0, 10)}); nothing to do`);
  process.exit(0);
}

console.log(`${stamp()}: analyzing every team and QB`);
const analyzed = run('analyze.mjs', ['--batch', '--teams', '--qbs']);
if (analyzed !== 0) process.exit(analyzed ?? 1);

writeFileSync(MARK, JSON.stringify({ date: today, at: new Date().toISOString() }));
push();
console.log(`${stamp()}: done`);
