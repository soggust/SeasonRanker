// The desk's watcher (DECISIONS.md D55, D68): polls the free sources every minute from the owner's PC and kicks the
// bettor on GitHub (by the owner's own gh sign-in) when something material changed, so the Bot re-prices on a
// trigger, not on GitHub's unreliable timer. Two lanes: the full desk (.github/workflows/model-desk.yml) and the
// fast lane (.github/workflows/model-desk-fast.yml, D68: one game's props, a few minutes), for news on one game. It
// never runs the bettor itself (D13) and never spends an Odds API credit: ESPN's scoreboards (DraftKings' game
// lines, free), ESPN's injury lists and the D49 reporters' Bluesky posts (public, no auth). Sleeper is not polled
// here: D49 pulls its dump once a UTC day, as Sleeper asks.
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
// has a game inside its window. The news (the new Out or Doubtful, the post) carries its game where it names one
// (the player's team's next game inside the window; a post's one game by a team's name or a listed player's): that
// item is the fast lane's. The rest are the full desk's. Each is pending until a run that reads it starts after it
// was seen (a full run reads everything; a fast run its own game's news).
//
// Rate: the full lane (dispatchDecision): none while a desk run of either lane is queued or running, none within
// COOLDOWN_MIN of the last full run's start, at most MAX_PER_DAY a UTC day by the watcher. The fast lane
// (fastDecision): none while a fast run is queued or running or a full run is queued (both lanes share the desk's
// concurrency group, and GitHub keeps one waiting run a group: a new one would cancel the waiting one), none for a
// game within FAST_COOLDOWN_MIN of its last fast dispatch, at most FAST_MAX_PER_DAY a UTC day (past it, the news
// goes to the full lane). The repo is public: its Actions minutes are free.
// The polls kept cheap: the scoreboard days inside the lines' window every poll, the further ones (the props'
// windows, read only for a window opening) every FAR_EVERY_MIN, kept in the state between; each reporter's posts
// since his cursor, a short page. The task "SeasonRanker desk watch" runs it every minute while the owner is logged
// on (scripts/desk-watch.ps1 -Register); the hourly "SeasonRanker desk kick" (desk-kick.ps1) stays the backstop.
// Log: .cache/desk-watch.log (kept under LOG_MAX), state: .cache/desk-watch.json.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { linesOf } from '../libs/ranker/scripts/model/espn.mjs';
import { LEAGUES, TIMING } from '../libs/ranker/scripts/model/leagues.mjs';
import { authorPosts, handlesOf } from '../libs/ranker/scripts/model/fastnews.mjs';
import { linesSig } from '../libs/ranker/scripts/model/oddsapi.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const STATE = path.join(ROOT, '.cache', 'desk-watch.json');
const LOG = path.join(ROOT, '.cache', 'desk-watch.log');
const WORKFLOW = 'model-desk.yml';
export const FAST_WORKFLOW = 'model-desk-fast.yml';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

// The sports watched (MMA's lines are its own board's, asked by mma-desk.mjs each run with a bout due; its cards
// are days apart, so the hourly runs reach them: not watched)
export const SPORTS = ['nfl', 'nba', 'nhl', 'mlb'];
// (a line's move that counts: its spread or total by half a point, a side's no-vig chance by 2.5 points)
export const MOVE = { line: 0.5, chance: 0.025 };
// (the full lane's rate: minutes after the last full run's start, dispatches a UTC day)
export const COOLDOWN_MIN = 20;
export const MAX_PER_DAY = 40;
// (the fast lane's, D68: minutes after a game's last fast dispatch, fast dispatches a UTC day)
export const FAST_COOLDOWN_MIN = 5;
export const FAST_MAX_PER_DAY = 30;
// (the poll: every minute (the task's); the scoreboard days past the lines' window read every FAR_EVERY_MIN)
export const POLL_MIN = 1;
export const FAR_EVERY_MIN = 5;
// (a reporter's posts asked a poll: a short page once his cursor is set, the first poll's longer)
export const POSTS_PAGE = 10;
// (the NFL's inactives post about 90 minutes before a kickoff; a run that starts between 85 and 40 minutes before it
// reads them before REPRICE_BY: context.mjs LINEUP_HOURS)
export const INACTIVES = { from: 85, to: 40 };
// (a post that names a high-impact status: an out, a scratch, a season-ending injury, a goalie's start)
export const HIGH = /\b(ruled out|will not play|won't play|not playing|is out|out (?:tonight|today|sunday|monday|thursday|saturday|for (?:the )?(?:game|season|tonight|week))|scratch(?:ed)?|inactive|placed on (?:the )?(?:IR|injured reserve)|to (?:the )?IR\b|season[- ]ending|torn (?:ACL|achilles)|will start (?:in goal|tonight)|starting in goal|confirmed starter|gets the start|will miss)\b/i;
// (how long a pending item waits at most: a game started, or news a day old, is dropped)
const NEWS_KEEP_H = 12;
// (the log trimmed to its newest half past this many bytes)
const LOG_MAX = 2e6;

const HOUR = 36e5;

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

const busyOf = (runs) => runs.find((r) => r.status && r.status !== 'completed');
const queuedOf = (runs) => runs.find((r) => r.status && r.status !== 'completed' && r.status !== 'in_progress');
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const atOf = (d) => Date.parse(typeof d === 'string' ? d : d?.at);

// Whether to dispatch the full desk now: { go, why }. runs: the full desk's recent runs (gh run list: status,
// createdAt); others: the fast lane's (only whether one is queued or running counts); dispatched: the watcher's own
// full dispatch times; pending: what's waiting for it. No dispatch with nothing pending, with a desk run of either
// lane queued or running, within cooldown minutes of the last full run's start, or past maxPerDay of the watcher's
// this UTC day
export function dispatchDecision({ runs = [], others = [], dispatched = [], pending = [], now = Date.now(), cooldown = COOLDOWN_MIN, maxPerDay = MAX_PER_DAY }) {
  if (!pending.length) return { go: false, why: 'nothing material' };
  const busy = busyOf(runs) ?? busyOf(others);
  if (busy) return { go: false, why: `a desk run is ${busy.status}` };
  const last = Math.max(0, ...runs.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite), ...dispatched.map(atOf).filter(Number.isFinite));
  if (last && now - last < cooldown * 6e4) return { go: false, why: `the last desk run started ${Math.round((now - last) / 6e4)} minutes ago (cooldown ${cooldown})` };
  const today = dispatched.filter((d) => dayOf(atOf(d)) === dayOf(now)).length;
  if (today >= maxPerDay) return { go: false, why: `${today} dispatches today already (at most ${maxPerDay})` };
  return { go: true, why: null };
}

// The fast lane's game named by a run's title (model-desk-fast.yml's run-name: "Model desk fast: <sport> <game>")
export function fastGameOf(run) {
  const m = String(run?.displayTitle ?? '').match(/fast: (\w+) (\d+)/);
  return m ? { sport: m[1], game: m[2] } : null;
}

// Whether to dispatch a fast run now (D68): { go, why, sport, game, items }. pending: the fast lane's items (each
// with its sport and game); runs: the fast lane's recent runs; others: the full desk's; dispatched: the watcher's
// fast dispatches [{ at, sport, game }]. The soonest game with news pending (its start, `until`, first) whose
// cooldown has passed; none while a fast run is queued or running or a full one is queued, or past maxPerDay
// (capped: its news then the full lane's)
export function fastDecision({ pending = [], runs = [], others = [], dispatched = [], now = Date.now(), cooldown = FAST_COOLDOWN_MIN, maxPerDay = FAST_MAX_PER_DAY }) {
  if (!pending.length) return { go: false, why: 'no news on one game' };
  const busy = busyOf(runs);
  if (busy) return { go: false, why: `a fast run is ${busy.status}` };
  const queued = queuedOf(others);
  if (queued) return { go: false, why: `a full desk run is ${queued.status}: it reads the news` };
  const today = dispatched.filter((d) => dayOf(atOf(d)) === dayOf(now)).length;
  if (today >= maxPerDay) return { go: false, capped: true, why: `${today} fast dispatches today already (at most ${maxPerDay})` };
  const same = (x, sport, game) => x?.sport === sport && String(x?.game) === String(game);
  const lastFor = (sport, game) =>
    Math.max(
      0,
      ...dispatched.filter((d) => same(d, sport, game)).map(atOf).filter(Number.isFinite),
      ...runs.filter((r) => same(fastGameOf(r), sport, game)).map((r) => Date.parse(r.createdAt)).filter(Number.isFinite),
    );
  const games = [...new Map(pending.map((p) => [`${p.sport}:${p.game}`, p])).values()].sort((a, b) => (a.until ?? Infinity) - (b.until ?? Infinity));
  for (const g of games) {
    const last = lastFor(g.sport, g.game);
    if (last && now - last < cooldown * 6e4) continue;
    return { go: true, why: null, sport: g.sport, game: String(g.game), items: pending.filter((p) => same(p, g.sport, g.game)) };
  }
  return { go: false, why: `each game's last fast run started under ${cooldown} minutes ago` };
}

// (an ESPN scoreboard event as the watcher keeps it: its id, name, start, teams by id and by name, lines' sig)
function gameOfEvent(e) {
  const comps = e.competitions?.[0]?.competitors ?? [];
  return {
    id: String(e.id),
    name: e.shortName ?? e.name ?? e.id,
    start: Date.parse(e.date),
    teams: comps.map((c) => String(c.team?.id ?? c.id)),
    names: [...new Set(comps.flatMap((c) => [c.team?.name, c.team?.displayName, c.team?.shortDisplayName]).filter((n) => typeof n === 'string' && n.length >= 3))],
    sig: sigOf(linesOf(e)),
  };
}

// One poll's games: the sport's scoreboard days from today through its window, each game not started with its
// start, phase and lines' sig. boards: the state's kept days (a day past the lines' window read again only every
// FAR_EVERY_MIN, its games kept there between; none, every day read). fetchJson: a test's
export async function gamesOf(sport, { now = Date.now(), fetchJson = getJson, boards = null } = {}) {
  const span = (hours) => {
    const days = new Set();
    for (let t = now; t <= now + hours * HOUR; t += 12 * HOUR) days.add(new Date(t - 5 * HOUR).toISOString().slice(0, 10).replace(/-/g, ''));
    days.add(new Date(now + hours * HOUR - 5 * HOUR).toISOString().slice(0, 10).replace(/-/g, ''));
    return days;
  };
  const days = span(Math.max(TIMING[sport].lines, TIMING[sport].props) + 2);
  const near = span(TIMING[sport].lines + 2);
  const out = new Map();
  for (const d of days) {
    const kept = boards?.[d];
    let list;
    if (boards && !near.has(d) && kept && now - kept.at < FAR_EVERY_MIN * 6e4) list = kept.games;
    else {
      const body = await fetchJson(`${ESPN}/${LEAGUES[sport].league}/scoreboard?dates=${d}&limit=200`).catch(() => null);
      list = body ? (body.events ?? []).map(gameOfEvent) : (kept?.games ?? []);
      // (a far day's games kept, their sig left out: a game past the lines' window has no move to read)
      if (boards && body && !near.has(d)) boards[d] = { at: now, games: list.map((g) => ({ ...g, sig: null })) };
    }
    for (const g of list) {
      if (!Number.isFinite(g.start) || g.start <= now || out.has(g.id)) continue;
      const h = (g.start - now) / HOUR;
      out.set(g.id, { ...g, sport, hours: h, phase: phaseAt(sport, h), lines: h <= TIMING[sport].lines });
    }
  }
  if (boards) for (const d of Object.keys(boards)) if (!days.has(d) || near.has(d)) delete boards[d];
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

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The one game a post is about, of the games inside their window (D68): those whose team it names (its nickname or
// full name, as written) or whose listed player it names (ESPN's injury list); exactly one, else null (the full lane)
export function postGame(text, games, list = new Map()) {
  const hit = new Set();
  for (const g of games) {
    if (g.phase === 'early') continue;
    if ((g.names ?? []).some((n) => new RegExp(`\\b${escape(n)}\\b`).test(text))) hit.add(g);
  }
  for (const v of list?.values?.() ?? []) {
    if (!v.name || !new RegExp(`\\b${escape(v.name)}\\b`, 'i').test(text)) continue;
    const g = games.find((x) => x.phase !== 'early' && x.teams.includes(v.team));
    if (g) hit.add(g);
  }
  return hit.size === 1 ? [...hit][0] : null;
}

// The poll's pending items from the last state and what's seen now: lines moved, windows crossed, the NFL's
// inactives, new outs, reporters' posts. Pure: state in, { state, added } out (the state's baselines and pending
// updated). seen: { games: Map by sport, injuries: Map by sport, posts: [{ sport, uri, at, text, handle }] }. A new
// out and a post on one game carry it (game, until its start, fast): the fast lane's (D68)
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
  const live = new Map();
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
    live.set(sport, [...games.values()].sort((a, b) => a.start - b.start));
  }
  // (the news on one game: the fast lane's, held till the game starts)
  const onGame = (g) => (g ? { game: g.id, fast: true, until: g.start } : { until: now + NEWS_KEEP_H * HOUR });
  // (ESPN's injury list: a new or worsened out or doubtful on a team playing inside its window, on its next game)
  for (const [sport, list] of Object.entries(seen.injuries ?? {})) {
    // (a sport's list first read: learned, nothing pending)
    const first = !(sport in (state?.injuries ?? {}));
    const known = (s.injuries[sport] ??= {});
    for (const [k, v] of list) {
      const was = known[k];
      known[k] = v.status;
      if (first || !severe(v.status) || severe(was)) continue;
      if (!inWindow.get(sport)?.has(v.team)) continue;
      const g = (live.get(sport) ?? []).find((x) => x.phase !== 'early' && x.teams.includes(v.team));
      add({ key: `${sport}:injury:${k}:${v.status}`, sport, why: `${sport.toUpperCase()} ${v.name}: ${was ? `${was} to ` : ''}${v.status} on ESPN's list`, ...onGame(g) });
    }
  }
  // (a reporter's post naming a high-impact status, the sport with a game inside its window; on its one game if it names one)
  for (const p of seen.posts ?? []) {
    if (!HIGH.test(p.text) || !(inWindow.get(p.sport)?.size > 0)) continue;
    if (now - Date.parse(p.at) > NEWS_KEEP_H * HOUR) continue;
    const g = postGame(p.text, live.get(p.sport) ?? [], seen.injuries?.[p.sport]);
    add({ key: `${p.sport}:post:${p.uri}`, sport: p.sport, why: `${p.sport.toUpperCase()} ${p.handle}: "${p.text.replace(/\s+/g, ' ').slice(0, 90)}"`, ...onGame(g) });
  }
  // (pending past its time: dropped)
  s.pending = s.pending.filter((p) => !(p.until <= now));
  return { state: s, added };
}

// A run started after an item was seen reads it: a full run every item, a fast run (fastRuns, its game in its title)
// its own game's news; the item done, a moved line's baseline its sig then. Pure
export function settle(state, runs, fastRuns = []) {
  const started = Math.max(0, ...runs.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite));
  const s = structuredClone(state);
  const fastStart = (p) => (p.fast ? Math.max(0, ...fastRuns.filter((r) => fastGameOf(r)?.sport === p.sport && fastGameOf(r)?.game === String(p.game)).map((r) => Date.parse(r.createdAt)).filter(Number.isFinite)) : 0);
  // (the run's own setup takes a few minutes before it reads ESPN: an item seen before its start is in it)
  const done = s.pending.filter((p) => Date.parse(p.seen) < Math.max(started, fastStart(p)));
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
  s.dispatched = (s.dispatched ?? []).filter((d) => Date.now() - atOf(d) < 3 * 24 * HOUR);
  s.fastDispatched = (s.fastDispatched ?? []).filter((d) => Date.now() - atOf(d) < 3 * 24 * HOUR);
  writeFileSync(`${STATE}.tmp`, JSON.stringify(s));
  renameSync(`${STATE}.tmp`, STATE);
}
function say(line, dry) {
  const entry = `${new Date().toISOString()}${dry ? ' (dry)' : ''}: ${line}`;
  mkdirSync(path.dirname(LOG), { recursive: true });
  try {
    if (existsSync(LOG) && statSync(LOG).size > LOG_MAX) {
      const text = readFileSync(LOG, 'utf8');
      writeFileSync(LOG, text.slice(text.indexOf('\n', text.length / 2) + 1));
    }
  } catch {}
  appendFileSync(LOG, `${entry}\n`);
  console.log(entry);
}

const reasonOf = (items) => `watch: ${items.slice(0, 3).map((p) => p.why).join('; ')}${items.length > 3 ? `; and ${items.length - 3} more` : ''}`.slice(0, 300);

async function main() {
  const dry = process.argv.includes('--dry');
  const state = readState() ?? {};
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify({ pending: state.pending ?? [], dispatched: state.dispatched ?? [], fastDispatched: state.fastDispatched ?? [] }, null, 1));
    return;
  }
  const now = Date.now();
  const seen = { games: {}, injuries: {}, posts: [] };
  const boards = (state.boards ??= {});
  for (const sport of SPORTS) {
    const games = await gamesOf(sport, { now, boards: (boards[sport] ??= {}) });
    if (!games.size) continue;
    seen.games[sport] = games;
    if ([...games.values()].some((g) => g.phase !== 'early')) seen.injuries[sport] = await injuriesOf(sport);
  }
  // (the reporters' posts since each account's last one seen: the first poll only sets the cursor)
  const cursors = { ...(state.cursors ?? {}) };
  for (const sport of Object.keys(seen.games)) {
    for (const h of handlesOf(sport)) {
      const since = cursors[h.handle];
      const { posts, ok } = await authorPosts(h.handle, { fetchJson: getJson, limit: since ? POSTS_PAGE : 25 }).catch(() => ({ posts: [], ok: false }));
      if (!ok) continue;
      if (since) for (const p of posts) if (p.at > since) seen.posts.push({ ...p, sport });
      const newest = posts.map((p) => p.at).sort().pop();
      if (newest && (!since || newest > since)) cursors[h.handle] = newest;
    }
  }
  let { state: next, added } = advance(state, seen, now);
  next.cursors = cursors;
  let runs = [];
  let fastRuns = [];
  try {
    const list = (wf) => JSON.parse(gh(['run', 'list', '--workflow', wf, '--limit', '10', '--json', 'status,createdAt,event,displayTitle']));
    runs = list(WORKFLOW);
    // (the fast lane's runs not listed (its workflow not on GitHub yet, a hiccup): no fast dispatch, its news the full lane's)
    try {
      fastRuns = list(FAST_WORKFLOW);
    } catch {
      fastRuns = null;
    }
  } catch (err) {
    say(`couldn't list the desk's runs (${String(err?.message ?? err).split('\n')[0]}); nothing dispatched`, dry);
    writeState(next);
    return;
  }
  const settled = settle(next, runs, fastRuns ?? []);
  next = settled.state;
  for (const a of added) if (!settled.done.includes(a)) say(`seen: ${a.why}${a.fast ? ` (fast lane: ${a.sport} game ${a.game})` : ''}`, dry);
  // (the fast lane first: news on one game; capped for the day, its news goes to the full lane)
  const fastItems = next.pending.filter((p) => p.fast);
  const f = fastRuns ? fastDecision({ pending: fastItems, runs: fastRuns, others: runs, dispatched: next.fastDispatched ?? [], now }) : { go: false, capped: true, why: "the fast lane's runs not listed" };
  const fullItems = next.pending.filter((p) => !p.fast || f.capped);
  if (f.go) {
    const reason = reasonOf(f.items);
    if (dry) say(`would dispatch ${FAST_WORKFLOW} for ${f.sport} game ${f.game} (${reason})`, dry);
    else {
      try {
        gh(['workflow', 'run', FAST_WORKFLOW, '--ref', 'master', '-f', `sport=${f.sport}`, '-f', `game=${f.game}`, '-f', `reason=${reason}`]);
        next.fastDispatched = [...(next.fastDispatched ?? []), { at: new Date(now).toISOString(), sport: f.sport, game: f.game }];
        say(`dispatched ${FAST_WORKFLOW} for ${f.sport} game ${f.game} (${reason})`, dry);
      } catch (err) {
        say(`couldn't dispatch ${FAST_WORKFLOW} (${String(err?.message ?? err).split('\n')[0]})`, dry);
      }
    }
    // (the full lane waits a poll: the fast run now queued or running holds it, dispatchDecision)
    writeState(next);
    return;
  }
  if (fastItems.length && !f.capped) say(`${fastItems.length} pending for the fast lane, not dispatched: ${f.why}`, dry);
  const d = dispatchDecision({ runs, others: fastRuns ?? [], dispatched: next.dispatched, pending: fullItems, now });
  if (!d.go) {
    if (fullItems.length) say(`${fullItems.length} pending, not dispatched: ${d.why}`, dry);
    writeState(next);
    return;
  }
  const reason = reasonOf(fullItems);
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
