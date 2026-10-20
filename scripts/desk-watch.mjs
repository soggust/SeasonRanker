// The desk's watcher (DECISIONS.md D55): polls the free sources every few minutes from the owner's PC and kicks the
// bettor on GitHub (.github/workflows/model-desk.yml, by the owner's own gh sign-in) when something material
// changed, so the Bot re-prices on a trigger, not on GitHub's unreliable timer. It never runs the bettor itself
// (D13) and never spends an Odds API credit: ESPN's scoreboards (DraftKings' game lines, free), ESPN's injury
// lists and the D49 reporters' Bluesky posts (public, no auth). Sleeper is not polled here: D49 pulls its dump once
// a UTC day, as Sleeper asks.
//
//   node scripts/desk-watch.mjs            (one poll: dispatch if something material is pending and the rate allows)
//   node scripts/desk-watch.mjs --dry      (one poll, say what it would do, dispatch nothing; the state still kept)
//   node scripts/desk-watch.mjs --status   (what's pending and the dispatches today, nothing polled)
//
// Material (material, below): on a game inside its window (leagues.mjs TIMING, the lines' hours) and not started,
// DraftKings' spread or total moved MOVE.line or more, or a side's no-vig chance (moneyline, spread or total price)
// MOVE.chance or more, since the desk last ran after it was seen; a game crossing into its window or its last chance;
// an NFL kickoff inside its inactives' window (INACTIVES); a new Out or Doubtful on ESPN's injury list for a team
// playing inside the window; a reporter's post naming an out, a scratch or a goalie's start (HIGH) while the sport
// has a game inside its window. Each is pending until a desk run starts after it was seen (a scheduled, kicked or
// watched run: each run reads everything that's there).
//
// Rate (dispatchDecision): no dispatch while a desk run is queued or running (the workflow's concurrency group would
// hold it anyway), none within COOLDOWN_MIN of the last run's start, at most MAX_PER_DAY a UTC day by the watcher.
// The repo is public: its Actions minutes are free (measured 2026-10-20: a desk run 10 to 40 minutes, 24 on average).
// The task "SeasonRanker desk watch" runs it every 5 minutes while the owner is logged on (scripts/desk-watch.ps1
// -Register); the hourly "SeasonRanker desk kick" (desk-kick.ps1) stays the backstop. Log: .cache/desk-watch.log,
// state: .cache/desk-watch.json.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { linesOf } from '../libs/ranker/scripts/model/espn.mjs';
import { LEAGUES, TIMING } from '../libs/ranker/scripts/model/leagues.mjs';
import { authorPosts, handlesOf } from '../libs/ranker/scripts/model/fastnews.mjs';
import { linesSig } from '../libs/ranker/scripts/model/oddsapi.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const STATE = path.join(ROOT, '.cache', 'desk-watch.json');
const LOG = path.join(ROOT, '.cache', 'desk-watch.log');
const WORKFLOW = 'model-desk.yml';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

// The sports watched (MMA's lines are its own board's, asked by mma-desk.mjs each run with a bout due; its cards
// are days apart, so the hourly runs reach them: not watched)
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
// (a line's move that counts: its spread or total by half a point, a side's no-vig chance by 2.5 points)
export const MOVE = { line: 0.5, chance: 0.025 };
// (the rate: minutes after the last desk run's start, dispatches a UTC day)
export const COOLDOWN_MIN = 20;
export const MAX_PER_DAY = 40;
// (the NFL's inactives post about 90 minutes before a kickoff; a run that starts between 85 and 40 minutes before it
// reads them before REPRICE_BY: context.mjs LINEUP_HOURS)
export const INACTIVES = { from: 85, to: 40 };
// (a post that names a high-impact status: an out, a scratch, a season-ending injury, a goalie's start)
export const HIGH = /\b(ruled out|will not play|won't play|not playing|is out|out (?:tonight|today|sunday|monday|thursday|saturday|for (?:the )?(?:game|season|tonight|week))|scratch(?:ed)?|inactive|placed on (?:the )?(?:IR|injured reserve)|to (?:the )?IR\b|season[- ]ending|torn (?:ACL|achilles)|will start (?:in goal|tonight)|starting in goal|confirmed starter|gets the start|will miss)\b/i;
// (how long a pending item waits at most: a game started, or news a day old, is dropped)
const NEWS_KEEP_H = 12;

const HOUR = 36e5;
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const noVig = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && a && b ? implied(a) / (implied(a) + implied(b)) : null);

// A game's lines as the watcher compares them: oddsapi.mjs linesSig, the one the desk compares its quotes by
export const sigOf = linesSig;

// Whether a game's lines moved materially from a to b (sigOf's): the words, or null
export function material(a, b, move = MOVE) {
  if (!a || !b) return null;
  const out = [];
  const line = (k, label) => {
    if (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(b[k] - a[k]) >= move.line - 1e-9) out.push(`${label} ${a[k]} to ${b[k]}`);
  };
  line('spread', 'spread');
  line('total', 'total');
  for (const [k, label] of [['ml', 'moneyline'], ['sp', 'spread price'], ['ou', 'total price']]) {
    if (Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(b[k] - a[k]) >= move.chance - 1e-9) out.push(`${label} ${Math.round(a[k] * 1000) / 10}% to ${Math.round(b[k] * 1000) / 10}%`);
  }
  return out.length ? out.join(', ') : null;
}

// The phase of a game h hours out: 'early' (before its windows: the props' opens first since D55), 'window', 'last'
// (inside its last chance), 'started'
export function phaseAt(sport, h) {
  const t = TIMING[sport];
  if (h <= 0) return 'started';
  if (h <= t.lastChance) return 'last';
  if (h <= Math.max(t.lines, t.props)) return 'window';
  return 'early';
}

// Whether to dispatch now: { go, why }. runs: the desk's recent runs (gh run list: status, createdAt); dispatched:
// the watcher's own dispatch times; pending: what's waiting. No dispatch with nothing pending, with a run queued or
// running, within cooldown minutes of the last run's start, or past maxPerDay of the watcher's this UTC day
export function dispatchDecision({ runs = [], dispatched = [], pending = [], now = Date.now(), cooldown = COOLDOWN_MIN, maxPerDay = MAX_PER_DAY }) {
  if (!pending.length) return { go: false, why: 'nothing material' };
  const busy = runs.find((r) => r.status && r.status !== 'completed');
  if (busy) return { go: false, why: `a desk run is ${busy.status}` };
  const last = Math.max(0, ...runs.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite), ...dispatched.map((d) => Date.parse(d)).filter(Number.isFinite));
  if (last && now - last < cooldown * 6e4) return { go: false, why: `the last desk run started ${Math.round((now - last) / 6e4)} minutes ago (cooldown ${cooldown})` };
  const day = new Date(now).toISOString().slice(0, 10);
  const today = dispatched.filter((d) => String(d).slice(0, 10) === day).length;
  if (today >= maxPerDay) return { go: false, why: `${today} dispatches today already (at most ${maxPerDay})` };
  return { go: true, why: null };
}

// One poll's games: the sport's scoreboard days from today through its window, each game not started with its
// start, phase and lines' sig. fetchJson: a test's
export async function gamesOf(sport, { now = Date.now(), fetchJson = getJson } = {}) {
  const hours = Math.max(TIMING[sport].lines, TIMING[sport].props) + 2;
  const days = new Set();
  for (let t = now; t <= now + hours * HOUR; t += 12 * HOUR) days.add(new Date(t - 5 * HOUR).toISOString().slice(0, 10).replace(/-/g, ''));
  days.add(new Date(now + hours * HOUR - 5 * HOUR).toISOString().slice(0, 10).replace(/-/g, ''));
  const out = new Map();
  for (const d of days) {
    const body = await fetchJson(`${ESPN}/${LEAGUES[sport].league}/scoreboard?dates=${d}&limit=200`).catch(() => null);
    for (const e of body?.events ?? []) {
      const start = Date.parse(e.date);
      if (!Number.isFinite(start) || start <= now || out.has(e.id)) continue;
      const teams = (e.competitions?.[0]?.competitors ?? []).map((c) => String(c.team?.id ?? c.id));
      out.set(String(e.id), { id: String(e.id), sport, name: e.shortName ?? e.name ?? e.id, start, hours: (start - now) / HOUR, phase: phaseAt(sport, (start - now) / HOUR), lines: (start - now) / HOUR <= TIMING[sport].lines, teams, sig: sigOf(linesOf(e)) });
    }
  }
  return out;
}

// ESPN's injury list of a sport: Map of `${team}:${athlete}` -> { status, date, name, team }
export async function injuriesOf(sport, { fetchJson = getJson } = {}) {
  const body = await fetchJson(`${ESPN}/${LEAGUES[sport].league}/injuries`).catch(() => null);
  const out = new Map();
  for (const t of body?.injuries ?? []) {
    for (const i of t.injuries ?? []) {
      const href = (i.athlete?.links ?? []).map((l) => l.href).find((h) => /\/id\/\d+/.test(h ?? '')) ?? '';
      const id = href.match(/\/id\/(\d+)/)?.[1] ?? i.athlete?.displayName;
      if (!id) continue;
      out.set(`${t.id}:${id}`, { status: String(i.status ?? ''), date: i.date ?? null, name: i.athlete?.displayName ?? id, team: String(t.id) });
    }
  }
  return out;
}

// (a status that counts: out or doubtful, the desk's severity 2)
export const severe = (s) => /^(out|doubtful|suspension|injured reserve|ir)\b/i.test(String(s ?? '').trim());

// The poll's pending items from the last state and what's seen now: lines moved, windows crossed, the NFL's
// inactives, new outs, reporters' posts. Pure: state in, { state, added } out (the state's baselines and pending
// updated). seen: { games: Map by sport, injuries: Map by sport, posts: [{ sport, uri, at, text, handle }] }
export function advance(state, seen, now = Date.now()) {
  const s = { baseline: {}, phases: {}, injuries: {}, pending: [], cursors: {}, dispatched: [], ...structuredClone(state ?? {}) };
  const added = [];
  // (the first poll only learns what's there: the phases and lines as they are, nothing pending)
  const fresh = !state?.phases;
  const add = (item) => {
    if (fresh || s.pending.some((p) => p.key === item.key) || (s.done ?? []).includes(item.key)) return;
    const x = { ...item, seen: new Date(now).toISOString() };
    s.pending.push(x);
    added.push(x);
  };
  const inWindow = new Map();
  for (const [sport, games] of Object.entries(seen.games ?? {})) {
    const teams = new Set();
    for (const g of games.values()) {
      const k = `${sport}:${g.id}`;
      if (g.phase !== 'early') for (const t of g.teams) teams.add(t);
      // (the phase crossed: into the window, or into the last chance; a game first seen already inside counts once)
      const before = s.phases[k];
      if (before !== g.phase && (g.phase === 'window' || g.phase === 'last')) add({ key: `${k}:${g.phase}`, sport, game: g.id, why: `${sport.toUpperCase()} ${g.name}: ${g.phase === 'last' ? 'its last chance' : 'its window'} opened (${Math.round(g.hours * 10) / 10}h out)`, until: g.start });
      s.phases[k] = g.phase;
      // (the NFL's inactives' window: once a kickoff)
      const min = g.hours * 60;
      if (sport === 'nfl' && min <= INACTIVES.from && min >= INACTIVES.to) add({ key: `${k}:inactives`, sport, game: g.id, why: `NFL ${g.name}: the inactives' window (${Math.round(min)} minutes out)`, until: g.start });
      // (the lines: a move from the baseline (the lines when the desk last ran after they were seen), inside the lines' window)
      if (g.sig && !s.baseline[k]) s.baseline[k] = g.sig;
      const moved = g.lines && g.sig ? material(s.baseline[k], g.sig) : null;
      if (moved) add({ key: `${k}:move:${JSON.stringify(g.sig)}`, sport, game: g.id, why: `${sport.toUpperCase()} ${g.name}: ${moved}`, until: g.start, sig: g.sig, line: k });
    }
    inWindow.set(sport, teams);
  }
  // (ESPN's injury list: a new or worsened out or doubtful on a team playing inside its window)
  for (const [sport, list] of Object.entries(seen.injuries ?? {})) {
    // (a sport's list first read: learned, nothing pending)
    const first = !(sport in (state?.injuries ?? {}));
    const known = (s.injuries[sport] ??= {});
    for (const [k, v] of list) {
      const was = known[k];
      known[k] = v.status;
      if (first || !severe(v.status) || severe(was)) continue;
      if (!inWindow.get(sport)?.has(v.team)) continue;
      add({ key: `${sport}:injury:${k}:${v.status}`, sport, why: `${sport.toUpperCase()} ${v.name}: ${was ? `${was} to ` : ''}${v.status} on ESPN's list`, until: now + NEWS_KEEP_H * HOUR });
    }
  }
  // (a reporter's post naming a high-impact status, the sport with a game inside its window)
  for (const p of seen.posts ?? []) {
    if (!HIGH.test(p.text) || !(inWindow.get(p.sport)?.size > 0)) continue;
    if (now - Date.parse(p.at) > NEWS_KEEP_H * HOUR) continue;
    add({ key: `${p.sport}:post:${p.uri}`, sport: p.sport, why: `${p.sport.toUpperCase()} ${p.handle}: "${p.text.replace(/\s+/g, ' ').slice(0, 90)}"`, until: now + NEWS_KEEP_H * HOUR });
  }
  // (pending past its time: dropped)
  s.pending = s.pending.filter((p) => !(p.until <= now));
  return { state: s, added };
}

// A desk run started after an item was seen reads it: the item done, a moved line's baseline its sig then. Pure
export function settle(state, runs) {
  const started = Math.max(0, ...runs.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite));
  const s = structuredClone(state);
  // (the run's own setup takes a few minutes before it reads ESPN: an item seen before its start is in it)
  const done = s.pending.filter((p) => Date.parse(p.seen) < started);
  for (const p of done) if (p.line && p.sig) s.baseline[p.line] = p.sig;
  s.pending = s.pending.filter((p) => !done.includes(p));
  // (the keys settled, the last 500: the same post or out never pending twice)
  s.done = [...(s.done ?? []), ...done.map((p) => p.key)].slice(-500);
  return { state: s, done };
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20e3), headers: { 'user-agent': 'SeasonRanker desk watch' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function gh(args) {
  const bin = ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'].find((b) => {
    try {
      execFileSync(b, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!bin) throw new Error('gh not found');
  return execFileSync(bin, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readState() {
  try {
    return existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
  } catch {
    return null;
  }
}
function writeState(s) {
  mkdirSync(path.dirname(STATE), { recursive: true });
  // (the dispatch times of the last 3 days, the injuries and phases of what's still listed)
  s.dispatched = (s.dispatched ?? []).filter((d) => Date.now() - Date.parse(d) < 3 * 24 * HOUR);
  writeFileSync(`${STATE}.tmp`, JSON.stringify(s));
  renameSync(`${STATE}.tmp`, STATE);
}
function say(line, dry) {
  const entry = `${new Date().toISOString()}${dry ? ' (dry)' : ''}: ${line}`;
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${entry}\n`);
  console.log(entry);
}

async function main() {
  const dry = process.argv.includes('--dry');
  const state = readState() ?? {};
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify({ pending: state.pending ?? [], dispatched: state.dispatched ?? [] }, null, 1));
    return;
  }
  const now = Date.now();
  const seen = { games: {}, injuries: {}, posts: [] };
  for (const sport of SPORTS) {
    const games = await gamesOf(sport, { now });
    if (!games.size) continue;
    seen.games[sport] = games;
    if ([...games.values()].some((g) => g.phase !== 'early')) seen.injuries[sport] = await injuriesOf(sport);
  }
  // (the reporters' posts since each account's last one seen: the first poll only sets the cursor)
  const cursors = { ...(state.cursors ?? {}) };
  for (const sport of Object.keys(seen.games)) {
    for (const h of handlesOf(sport)) {
      const { posts, ok } = await authorPosts(h.handle, { fetchJson: getJson, limit: 25 }).catch(() => ({ posts: [], ok: false }));
      if (!ok) continue;
      const since = cursors[h.handle];
      if (since) for (const p of posts) if (p.at > since) seen.posts.push({ ...p, sport });
      const newest = posts.map((p) => p.at).sort().pop();
      if (newest && (!since || newest > since)) cursors[h.handle] = newest;
    }
  }
  let { state: next, added } = advance(state, seen, now);
  next.cursors = cursors;
  let runs = [];
  try {
    runs = JSON.parse(gh(['run', 'list', '--workflow', WORKFLOW, '--limit', '10', '--json', 'status,createdAt,event']));
  } catch (err) {
    say(`couldn't list the desk's runs (${String(err?.message ?? err).split('\n')[0]}); nothing dispatched`, dry);
    writeState(next);
    return;
  }
  const settled = settle(next, runs);
  next = settled.state;
  for (const a of added) if (!settled.done.includes(a)) say(`seen: ${a.why}`, dry);
  const d = dispatchDecision({ runs, dispatched: next.dispatched, pending: next.pending, now });
  if (!d.go) {
    if (next.pending.length) say(`${next.pending.length} pending, not dispatched: ${d.why}`, dry);
    writeState(next);
    return;
  }
  const reason = `watch: ${next.pending.slice(0, 3).map((p) => p.why).join('; ')}${next.pending.length > 3 ? `; and ${next.pending.length - 3} more` : ''}`.slice(0, 300);
  if (dry) {
    say(`would dispatch ${WORKFLOW} (${reason})`, dry);
    writeState(next);
    return;
  }
  try {
    gh(['workflow', 'run', WORKFLOW, '--ref', 'master', '-f', `reason=${reason}`]);
  } catch (err) {
    say(`couldn't dispatch ${WORKFLOW} (${String(err?.message ?? err).split('\n')[0]})`, dry);
    writeState(next);
    return;
  }
  next.dispatched = [...(next.dispatched ?? []), new Date(now).toISOString()];
  say(`dispatched ${WORKFLOW} (${reason})`, dry);
  writeState(next);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((err) => {
    say(`failed: ${String(err?.stack ?? err).split('\n')[0]}`, process.argv.includes('--dry'));
    process.exitCode = 1;
  });
}
