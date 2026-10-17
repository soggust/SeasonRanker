// Starts a GitHub workflow from this computer: GitHub's own timer has been dropping or delaying this repo's
// scheduled runs by hours, so the morning's NFL data update and the bettor's runs don't wait on it.
//
//   node apps/nfl/scripts/kick-update.mjs           (the NFL data update, nfl-update-data.yml: the scheduled
//                                                    task "QBRanker NFL data kick", 4:30 and 7:30 AM Central;
//                                                    skipped once today's has run twice)
//   node apps/nfl/scripts/kick-update.mjs --sport=nhl  (another sport's data update, <sport>-update-data.yml:
//                                                    nhl, nba or mlb; the same task kicks each in turn)
//   node apps/nfl/scripts/kick-update.mjs --desk   (the bettor, model-desk.yml: the task "QBRanker desk kick",
//                                                    hourly through the day; skipped when one started in the
//                                                    last 45 minutes, as its own hourly schedule would have)
//   node apps/nfl/scripts/kick-update.mjs --desk-games
//                                                   (the bettor ahead of a game window (round D, 2026-10-17): the
//                                                    task "QBRanker desk kick games", Central time every day 5:30 to
//                                                    9:00 PM each half hour (NBA fives post about 30 minutes before
//                                                    the tip, NHL and MLB evening starts), Sunday 10:30 AM, 2:00 and
//                                                    6:00 PM and Monday and Thursday 6:00 PM (NFL inactives post 90
//                                                    minutes before the kickoff and a run prices about 15 minutes in:
//                                                    context.mjs LINEUP_HOURS), Saturday 4:00 and 7:00 PM (UFC cards).
//                                                    First it asks ESPN's boards (kick-window.mjs, free) whether any
//                                                    sport has a game starting within 3 hours; none, it does nothing:
//                                                    no run, no Odds API credits. One started in the last 20 minutes
//                                                    is enough (the half-hour cadence). The run's reason is logged on
//                                                    the workflow (its reason input). Created DISABLED: the owner
//                                                    enables it)
//
// All skip when a run is going or queued; a data run with nothing new is a no-op, and each workflow takes one
// run at a time (its concurrency group), so a kick is always safe. Needs the GitHub CLI (gh), signed in. Logs
// to .cache/kick-update.log.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { WINDOW_HOURS, gamesSoon } from './kick-window.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const LOG = path.join(ROOT, '.cache/kick-update.log');
const DESK_GAMES = process.argv.includes('--desk-games');
const DESK = DESK_GAMES || process.argv.includes('--desk');
// (--sport=nhl, nba or mlb: that sport's data update instead of the NFL's)
const SPORT = process.argv.find((a) => a.startsWith('--sport='))?.slice('--sport='.length) ?? 'nfl';
if (!['nfl', 'nhl', 'nba', 'mlb'].includes(SPORT)) throw new Error(`no data update for ${SPORT}`);
const WORKFLOW = DESK ? 'model-desk.yml' : `${SPORT}-update-data.yml`;
// (one started this lately is enough: the hourly kick's 45 minutes, the game-window kick's 20 (its half hours))
const RECENT_MS = (DESK_GAMES ? 20 : 45) * 60e3;
mkdirSync(path.dirname(LOG), { recursive: true });
const say = (line) => appendFileSync(LOG, `${new Date().toLocaleString()}: ${WORKFLOW}${DESK_GAMES ? ' (games)' : ''}: ${line}\n`);
const gh = (args) => spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });

// (today in Central time, the day the runs are counted on)
const central = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const today = central(Date.now());

// (the game-window kick: a game starting within WINDOW_HOURS in some sport, else nothing to do; the first one's the
// run's reason)
let reason = null;
if (DESK_GAMES) {
  const { soon, failed } = await gamesSoon(WINDOW_HOURS);
  if (failed.length) say(`boards not read: ${failed.join('; ')}`);
  if (!soon.length) {
    say(`no game starting within ${WINDOW_HOURS} hours; nothing to do`);
    process.exit(0);
  }
  const first = soon[0];
  reason = `game window: ${first.league.toUpperCase()} ${first.name} in ${first.minutes} min${soon.length > 1 ? ` (+${soon.length - 1} more within ${WINDOW_HOURS}h)` : ''}`;
}

const listed = gh(['run', 'list', '--workflow', WORKFLOW, '--limit', '10', '--json', 'status,conclusion,createdAt']);
if (listed.status !== 0) {
  say(`couldn't list runs: ${(listed.stderr || listed.stdout).trim().split('\n').at(-1)}`);
  process.exit(1);
}
const runs = JSON.parse(listed.stdout || '[]');
const busy = runs.find((r) => r.status !== 'completed');
if (busy) {
  say(`a run is already ${busy.status}; nothing to do`);
  process.exit(0);
}
if (DESK) {
  // (the bettor: one started lately, by its schedule or a kick, is enough)
  const latest = Math.max(...runs.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite));
  if (Date.now() - latest < RECENT_MS) {
    say(`one started ${Math.round((Date.now() - latest) / 60e3)} minutes ago; nothing to do`);
    process.exit(0);
  }
} else {
  // (a run today that went through: it may still have held for ESPN's stats, so one more kick costs nothing
  // but a no-op; only skip the second morning kick once today's has run twice)
  const doneToday = runs.filter((r) => r.conclusion === 'success' && central(r.createdAt) === today).length;
  if (doneToday >= 2) {
    say(`today's update ran ${doneToday} times already; nothing to do`);
    process.exit(0);
  }
}
// (the reason as one argument: gh is run through the shell on Windows, which splits on spaces, so it's quoted,
// its own quotes dropped)
const quoted = (s) => (process.platform === 'win32' ? `"${s.replace(/"/g, "'")}"` : s);
const kicked = gh(['workflow', 'run', WORKFLOW, '--ref', 'master', ...(reason ? ['-f', quoted(`reason=${reason}`)] : [])]);
say(kicked.status === 0 ? `started a run${reason ? ` (${reason})` : ''}` : `couldn't start it: ${(kicked.stderr || kicked.stdout).trim().split('\n').at(-1)}`);
process.exit(kicked.status === 0 ? 0 : 1);
