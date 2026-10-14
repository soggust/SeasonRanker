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
//
// Both skip when a run is going or queued; a data run with nothing new is a no-op, and each workflow takes one
// run at a time (its concurrency group), so a kick is always safe. Needs the GitHub CLI (gh), signed in. Logs
// to .cache/kick-update.log.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const LOG = path.join(ROOT, '.cache/kick-update.log');
const DESK = process.argv.includes('--desk');
// (--sport=nhl, nba or mlb: that sport's data update instead of the NFL's)
const SPORT = process.argv.find((a) => a.startsWith('--sport='))?.slice('--sport='.length) ?? 'nfl';
if (!['nfl', 'nhl', 'nba', 'mlb'].includes(SPORT)) throw new Error(`no data update for ${SPORT}`);
const WORKFLOW = DESK ? 'model-desk.yml' : `${SPORT}-update-data.yml`;
const RECENT_MS = 45 * 60e3;
mkdirSync(path.dirname(LOG), { recursive: true });
const say = (line) => appendFileSync(LOG, `${new Date().toLocaleString()}: ${WORKFLOW}: ${line}\n`);
const gh = (args) => spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });

// (today in Central time, the day the runs are counted on)
const central = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const today = central(Date.now());

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
const kicked = gh(['workflow', 'run', WORKFLOW, '--ref', 'master']);
say(kicked.status === 0 ? 'started a run' : `couldn't start it: ${(kicked.stderr || kicked.stdout).trim().split('\n').at(-1)}`);
process.exit(kicked.status === 0 ? 0 : 1);
