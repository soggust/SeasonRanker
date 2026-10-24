// The history audit (libs/ranker/scripts/model/DECISIONS.md D86, the owner, 2026-10-23: "run history on every change
// ... history always up to date with the latest algo so we can ensure we're improving"). Every sport's replayed
// history re-recorded with origin/master's code, the self-check run, and the records pushed, so the Algorithm tab,
// Recent Form and the Book's record show today's Bot. It never changes a rule: the algorithm changes only through
// the gate (D22); this re-fits and re-records what the code already fits.
//
// It runs in its own full clone (C:\dev\qbr-audit, its own npm ci; never a worktree of the main checkout), reset to
// origin/master each run, on the owner's always-on PC: the cache is local and large (.cache/model, seeded from and
// topped up with the main checkout's files it lacks; the main cache is only ever read).
//
//   node scripts/history-audit.mjs --mode weekly    the cache rebuilt (gate.mjs --rebuild-cache: context facts,
//                                                   players' games, injuries, weather; passes again while a source
//                                                   failed), then every sport re-recorded
//   node scripts/history-audit.mjs --mode nightly   every sport re-recorded on the cache as it is (the walk-forward
//                                                   fits reused: keyed by the fit's code and rows); the day's graded
//                                                   bets refit the trust, the bands, the own bar
//   node scripts/history-audit.mjs --mode code      as nightly, for a new model commit on origin/master
//   node scripts/history-audit.mjs --mode check     the 15-minute check: a model commit (libs/ranker/scripts/model,
//                                                   not its .md files) since the last audited one, not the audit's
//                                                   own or a "Model desk:" commit, the newest 30 minutes old or more:
//                                                   runs --mode code; else says why not
//   [--dry] (everything but the push)  [--refit] (gate.mjs --refit: every walk-forward fit searched again, hours)
//   [--sports nfl,nba]  [--main <dir>] (the main checkout whose cache is read; C:\dev\QBRanker2026)
//
// One run at a time (a lock in .cache); a sport the record guard refuses (exit 3) or that fails is left as it was,
// logged, and given a "watching" line on the Algorithm tab's Findings (cleared once it records again). The log:
// <main>/.cache/history-audit.log. scripts/history-audit.ps1 -Register makes the scheduled tasks.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb', 'mma'];
export const MODES = ['weekly', 'nightly', 'code', 'check'];
// (the code check waits this long after the newest model commit, so a burst of commits records once)
export const DEBOUNCE_MIN = 30;
// (the paths whose change re-records: the bettor's code and config; its docs don't)
export const MODEL_PATHS = ['libs/ranker/scripts/model', ':(exclude,glob)libs/ranker/scripts/model/**/*.md'];
// (the files a re-record writes, the only ones the audit commits)
export const RECORD_PATHS = [':(glob)apps/*/src/StaticData/model/**', ':(glob)apps/*/scripts/model/**'];
export const FINDINGS = 'apps/nfl/src/StaticData/model/findings.json';
export const REF = 'D86';
// (a lock older than this is a crashed run's)
export const LOCK_HOURS = 20;

// (the audit's own commits and the desk's never trigger a code run: no loops)
export function isAuditCommit(subject) {
  return /^(Weekly|Nightly|Code) audit:/.test(subject ?? '') || /^Model desk\b/.test(subject ?? '');
}

// Whether the code check runs: commits [{ sha, at (ms), subject }] since the last audited sha that touched the model
// (newest first, as git log lists them). { run, why, sha }
export function codeDue(commits, now, debounceMin = DEBOUNCE_MIN) {
  const real = commits.filter((c) => !isAuditCommit(c.subject));
  if (!real.length) return { run: false, why: 'no model commit since the last audit', sha: null };
  const newest = real.reduce((a, c) => (c.at > a.at ? c : a));
  const mins = (now - newest.at) / 60000;
  if (mins < debounceMin) return { run: false, why: `the newest model commit ${newest.sha.slice(0, 8)} is ${Math.round(mins)} minutes old: waiting for ${debounceMin}`, sha: newest.sha };
  return { run: true, why: `${real.length} model commit${real.length === 1 ? '' : 's'}, the newest ${newest.sha.slice(0, 8)} (${newest.subject.slice(0, 80)})`, sha: newest.sha };
}

// The record guard's reasons in a gate run's output (gate.mjs guardRecords: "  REFUSED: ..." and "  HELD: ...")
export function guardReasons(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s+(REFUSED|HELD): (.+)$/))
    .filter(Boolean)
    .map((m) => `${m[1].toLowerCase()}: ${m[2].trim()}`);
}

// Whether a rebuild pass left a context source failed ("(failed: weather, ...: run it again)")
export const rebuildFailed = (output) => /\(failed: [^)]*run it again\)/.test(String(output ?? ''));

// The findings file with a sport's audit line set (text) or cleared (null): one "watching" line a sport, ref D86
export function setFinding(file, sport, text, date) {
  const f = file && Array.isArray(file.entries) ? file : { v: 1, entries: [] };
  const mine = (e) => e.ref === REF && e.group === 'watching' && e.sport === sport && /^History audit:/.test(e.text ?? '');
  const entries = f.entries.filter((e) => !mine(e));
  if (text) entries.push({ date, group: 'watching', sport, ref: REF, text: `History audit: ${text}`.slice(0, 220) });
  return { ...f, entries };
}

// A sport's replayed record in brief, for the log (replay-record.json's overall)
export function recordBrief(r) {
  const o = r?.overall;
  if (!o) return 'none';
  return `${o.won}-${o.lost}-${o.push} ${o.profit >= 0 ? '+' : ''}${o.profit}u on ${o.bets} bets (ROI ${o.roi === null ? '-' : `${(o.roi * 100).toFixed(1)}%`})`;
}

export const commitMessage = (mode, date, sha = null) => `${mode[0].toUpperCase()}${mode.slice(1)} audit: history re-recorded with today's Bot (${date}${mode === 'code' && sha ? `, code ${sha.slice(0, 8)}` : ''})`;

export function parseArgs(argv) {
  const val = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mode = val('--mode') ?? 'nightly';
  if (!MODES.includes(mode)) throw new Error(`--mode is one of ${MODES.join(', ')}`);
  const sports = (val('--sports') ?? SPORTS.join(',')).split(',').filter((s) => SPORTS.includes(s));
  return { mode, dry: argv.includes('--dry'), refit: argv.includes('--refit'), sports, main: val('--main') ?? 'C:\\dev\\QBRanker2026', reexec: argv.includes('--reexec') };
}

// ---- the run ----

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = path.join(ROOT, 'libs/ranker/scripts/model/gate.mjs');
const STATE = path.join(ROOT, '.cache/history-audit.json');
const LOCK = path.join(ROOT, '.cache/history-audit.lock');
const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function takeLock(mode) {
  const held = readJson(LOCK, null);
  if (held && alive(held.pid) && Date.now() - Date.parse(held.at) < LOCK_HOURS * 3600e3) return held;
  mkdirSync(path.dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, mode, at: new Date().toISOString() }));
  return null;
}
const dropLock = () => {
  if (readJson(LOCK, null)?.pid === process.pid) rmSync(LOCK, { force: true });
};

// (the main checkout's cache files the clone lacks, copied; its props fits only where they are this code's and the
// clone's aren't: another checkout's experiment never replaces the clone's. Never writes the main cache)
function syncCache(main, fitCode, say) {
  let copied = 0;
  const walk = (from, to, fits) => {
    if (!existsSync(from)) return;
    for (const name of readdirSync(from)) {
      const a = path.join(from, name);
      const b = path.join(to, name);
      const st = statSync(a);
      if (st.isDirectory()) {
        walk(a, b, fits || name === 'fits');
        continue;
      }
      let take = !existsSync(b);
      if (!take && fits && name.endsWith('.json')) take = readJson(a, null)?.code === fitCode && readJson(b, null)?.code !== fitCode;
      if (!take) continue;
      mkdirSync(to, { recursive: true });
      copyFileSync(a, b);
      copied++;
    }
  };
  for (const dir of ['.cache/model', '.cache/nflverse']) walk(path.join(main, dir), path.join(ROOT, dir), false);
  say(`cache: ${copied} file${copied === 1 ? '' : 's'} copied from ${main}`);
}

// (a child run, its output teed to the sport's log; resolves { code, out, secs })
function run(args, { env = {}, logFile, timeoutH = 6 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const take = (d) => {
      const s = d.toString();
      out += s;
      if (out.length > 4e6) out = out.slice(-2e6);
      if (logFile) appendFileSync(logFile, s);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => child.kill(), timeoutH * 3600e3);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, secs: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const LOG = path.join(opts.main, '.cache/history-audit.log');
  mkdirSync(path.dirname(LOG), { recursive: true });
  const say = (line) => {
    const entry = `${new Date().toISOString().replace('T', ' ').slice(0, 19)}Z ${opts.mode}${opts.dry ? ' (dry)' : ''}: ${line}`;
    appendFileSync(LOG, `${entry}\n`);
    console.log(entry);
  };
  const state = readJson(STATE, {});
  const held = takeLock(opts.mode);
  // (the 15-minute check says so on the console only: a long run would fill the log with it)
  if (held) return (opts.mode === "check" ? console.log : say)(`a ${held.mode} run (pid ${held.pid}, since ${held.at}) is in progress: skipped`);
  try {
    // (the nightly after a clean run of any kind in the last 6 hours (Monday's weekly) adds nothing)
    if (opts.mode === 'nightly' && state.last?.ok && !state.last.dry && Date.now() - Date.parse(state.last.at) < 6 * 3600e3) return say(`a clean ${state.last.mode} run finished ${state.last.at}: skipped`);
    git(['fetch', '-q', 'origin', 'master']);
    const origin = git(['rev-parse', 'origin/master']).trim();
    let mode = opts.mode;
    let codeSha = null;
    if (mode === 'check') {
      if (!state.recordedSha) {
        writeFileSync(STATE, JSON.stringify({ ...state, recordedSha: origin }, null, 1));
        return say(`no audited commit yet: ${origin.slice(0, 8)} taken as the start`);
      }
      const log = git(['log', '--format=%H%x09%ct%x09%s', `${state.recordedSha}..${origin}`, '--', ...MODEL_PATHS]).trim();
      const commits = log ? log.split('\n').map((l) => l.split('\t')).map(([sha, ct, ...s]) => ({ sha, at: Number(ct) * 1000, subject: s.join('\t') })) : [];
      const due = codeDue(commits, Date.now());
      if (!due.run) {
        if (!commits.filter((c) => !isAuditCommit(c.subject)).length) writeFileSync(STATE, JSON.stringify({ ...state, recordedSha: origin }, null, 1));
        return console.log(due.why);
      }
      say(`code run due: ${due.why}`);
      mode = 'code';
      codeSha = due.sha;
    }
    // (the clone at origin/master, its record files as committed; a newer copy of this script runs itself)
    const before = createHash('sha1').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
    git(['reset', '-q', '--hard', 'origin/master']);
    git(['clean', '-q', '-fd', '--', ...RECORD_PATHS]);
    const after = createHash('sha1').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
    if (before !== after && !opts.reexec) {
      dropLock();
      say('this script changed on origin/master: running the new one');
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2).filter((a, i, all) => a !== '--mode' && all[i - 1] !== '--mode'), '--mode', mode, '--reexec'], { stdio: 'inherit' });
      process.exitCode = r.status ?? 1;
      return;
    }
    if (existsSync(path.join(ROOT, 'package-lock.json')) && state.lock !== createHash('sha1').update(readFileSync(path.join(ROOT, 'package-lock.json'))).digest('hex')) {
      say('npm ci (the lock changed)');
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
      state.lock = createHash('sha1').update(readFileSync(path.join(ROOT, 'package-lock.json'))).digest('hex');
    }
    const t0 = Date.now();
    const F = await import(new URL('../libs/ranker/scripts/model/fitcache.mjs', import.meta.url));
    const fitCode = F.fitCode();
    say(`start at ${origin.slice(0, 8)} (fit code ${fitCode}); ${opts.sports.join(', ')}${opts.refit ? '; --refit' : ''}`);
    syncCache(opts.main, fitCode, say);
    const day = today();
    const logDir = path.join(ROOT, '.cache/history-audit', day);
    mkdirSync(logDir, { recursive: true });
    const recFile = (s) => path.join(ROOT, 'apps', s, 'src/StaticData/model/replay-record.json');
    const results = [];
    // (the weekly's cache rebuilt first, a sport's passes repeated while a source failed: the NFL's weather)
    if (mode === 'weekly')
      for (const sport of opts.sports.filter((s) => s !== 'mma'))
        for (let pass = 1; pass <= 3; pass++) {
          const r = await run(['--max-old-space-size=8192', GATE, '--rebuild-cache', sport, ...(opts.refit ? ['--refit'] : [])], { logFile: path.join(logDir, `${sport}-rebuild.log`) });
          const failed = rebuildFailed(r.out);
          say(`${sport}: cache rebuilt, pass ${pass} (${r.secs}s${r.code ? `, exit ${r.code}` : ''}${failed ? ', a source failed' : ''})`);
          if (r.code || !failed) break;
        }
    const findings0 = readJson(path.join(ROOT, FINDINGS), null);
    let findings = findings0;
    for (const sport of opts.sports) {
      const was = readJson(recFile(sport), null);
      const r = await run([GATE, '--score-only', 'worktree', '--record', sport, ...(opts.refit ? ['--refit'] : [])], { env: { RECORD_TRIGGER: mode }, logFile: path.join(logDir, `${sport}-record.log`) });
      const now = readJson(recFile(sport), null);
      const reasons = guardReasons(r.out);
      let why = null;
      if (r.code === 3) why = `the record guard refused: ${reasons.join('; ') || 'see the log'}`;
      else if (r.code) why = `the gate failed (exit ${r.code}): ${r.out.trim().split(/\r?\n/).slice(-3).join(' / ').slice(0, 300)}`;
      if (why) {
        // (a refused or failed sport keeps its committed files)
        git(['checkout', '-q', 'origin/master', '--', `apps/${sport}`]);
        git(['clean', '-q', '-fd', '--', `apps/${sport}/src/StaticData/model`, `apps/${sport}/scripts/model`]);
      }
      results.push({ sport, ok: !why, why, secs: r.secs, before: recordBrief(was), after: why ? recordBrief(was) : recordBrief(now), units: [was?.overall?.profit ?? null, why ? (was?.overall?.profit ?? null) : (now?.overall?.profit ?? null)] });
      say(`${sport}: ${why ? `NOT re-recorded, ${why}` : `re-recorded ${recordBrief(was)} -> ${recordBrief(now)}`} (${Math.round(r.secs / 60)} min)`);
      findings = setFinding(findings, sport, why ? `${day} ${mode} re-record held. ${why}` : null, day);
    }
    if (JSON.stringify(findings) !== JSON.stringify(findings0)) writeFileSync(path.join(ROOT, FINDINGS), `${JSON.stringify(findings, null, 1)}\n`);
    const sc = await run([path.join(ROOT, 'libs/ranker/scripts/model/selfcheck.mjs')], { logFile: path.join(logDir, 'selfcheck.log'), timeoutH: 1 });
    say(`self-check ${sc.code ? `failed (exit ${sc.code})` : 'run'} (${sc.secs}s)`);
    // (the hourly desk's test asserts these files' shapes: a file that fails it would stop every desk commit)
    const dt = await run(['--test', 'tests/data.test.mjs'], { logFile: path.join(logDir, 'data-test.log'), timeoutH: 1 });
    if (dt.code) {
      say(`the data test failed (exit ${dt.code}): nothing committed (${path.join(logDir, 'data-test.log')})`);
      process.exitCode = 1;
      return;
    }
    git(['add', '--', ...RECORD_PATHS]);
    const staged = git(['diff', '--cached', '--name-only']).trim();
    const mins = Math.round((Date.now() - t0) / 60000);
    if (!staged) say(`nothing changed (${mins} min)`);
    else {
      const body = results.map((x) => `${x.sport}: ${x.ok ? `${x.before} -> ${x.after}` : `not re-recorded (${x.why.slice(0, 200)})`}`).join('\n');
      git(['commit', '-q', '-F', '-'], { input: `${commitMessage(mode, day, codeSha ?? origin)}\n\n${body}\n\n${mins} minutes on ${origin.slice(0, 8)}.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n` });
      const sha = git(['rev-parse', 'HEAD']).trim();
      if (opts.dry) say(`committed ${sha.slice(0, 8)} locally, not pushed (dry; the next run resets it)`);
      else {
        let pushed = false;
        for (let attempt = 1; attempt <= 3 && !pushed; attempt++) {
          try {
            // (the records are the audit's own files: on a conflict, its version)
            git(['pull', '-q', '--rebase', '--autostash', '-X', 'theirs', 'origin', 'master']);
            git(['push', '-q', 'origin', 'HEAD:master']);
            pushed = true;
          } catch (e) {
            try {
              git(['rebase', '--abort']);
            } catch {
              // (no rebase in progress)
            }
            say(`push attempt ${attempt} failed: ${String(e.message).split('\n')[0]}`);
          }
        }
        say(pushed ? `pushed ${git(['rev-parse', 'HEAD']).trim().slice(0, 8)} (${staged.split('\n').length} files, ${mins} min)` : 'NOT pushed after 3 attempts');
        if (!pushed) process.exitCode = 1;
      }
    }
    const ok = results.every((x) => x.ok);
    writeFileSync(STATE, JSON.stringify({ ...state, recordedSha: opts.dry ? state.recordedSha : origin, last: { mode, at: new Date().toISOString(), sha: origin, minutes: mins, ok, dry: opts.dry, sports: results.map(({ sport, ok: k, secs }) => ({ sport, ok: k, secs })) } }, null, 1));
    say(`done in ${mins} min: ${results.map((x) => `${x.sport} ${x.ok ? 'ok' : 'HELD'}`).join(', ')}`);
  } finally {
    dropLock();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
