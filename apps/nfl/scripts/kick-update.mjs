// Starts the NFL data update on GitHub from this computer (the Windows scheduled task "QBRanker NFL data
// kick", 4:30 and 7:30 AM Central): GitHub's own timer has been dropping or delaying the workflow's
// scheduled runs by hours, so a morning's update doesn't wait on it. A run with nothing new is a no-op,
// and the workflow takes one run at a time (its concurrency group), so a kick is always safe.
//
//   node apps/nfl/scripts/kick-update.mjs
//
// Skips when today's update (US Central's date) already succeeded with every game in, or one is running
// or queued. Needs the GitHub CLI (gh), signed in. Logs to .cache/kick-update.log.

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const LOG = path.join(ROOT, '.cache/kick-update.log');
const WORKFLOW = 'nfl-update-data.yml';
mkdirSync(path.dirname(LOG), { recursive: true });
const say = (line) => appendFileSync(LOG, `${new Date().toLocaleString()}: ${line}\n`);
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
// (a run today that went through: it may still have held for ESPN's stats, so one more kick costs nothing
// but a no-op; only skip the second morning kick once today's has run twice)
const doneToday = runs.filter((r) => r.conclusion === 'success' && central(r.createdAt) === today).length;
if (doneToday >= 2) {
  say(`today's update ran ${doneToday} times already; nothing to do`);
  process.exit(0);
}
const kicked = gh(['workflow', 'run', WORKFLOW, '--ref', 'master']);
say(kicked.status === 0 ? 'started the update' : `couldn't start it: ${(kicked.stderr || kicked.stdout).trim().split('\n').at(-1)}`);
process.exit(kicked.status === 0 ? 0 : 1);
