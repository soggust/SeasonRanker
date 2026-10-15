// Every UFC bout's strikes by position and target, and its grappling, both fighters', from ESPN's core API
// (each competitor's statistics in a bout: sigDistanceHeadStrikesLanded / Attempted and the rest, FightMetric's
// UFC stats as ESPN carries them, back to the archive's first UFC year, 1997). Kept in scripts/strikes/ufc/<year>.json,
// one entry a bout: { e: its event's id, s: { <fighter id>: [STRIKE_FIELDS...] | 0 } } (0: ESPN has nothing
// for that side). A bout is fetched once and kept forever; one with a side missing is asked again only while
// it's fresh (ESPN posts a night's stats a little after the card), and a call that failed (not a 404) isn't
// kept, so it's asked again next run. The core API keeps these for the UFC alone: the PFL's, Bellator's,
// the WEC's and Strikeforce's bouts answer 404.
//
// Usage: node apps/mma/scripts/strikes.mjs (fetch what's new; the heat maps' build runs it too)
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchRetry } from '../../../libs/ranker/scripts/fetch.mjs';

const DIR = path.join(import.meta.dirname, 'strikes', 'ufc');
const FIGHTS = path.join(import.meta.dirname, 'fights', 'ufc');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
// (a bout this recent with a side missing is asked again; older, what's kept stands)
const FRESH_DAYS = 21;

// A side's numbers in a bout, in this order: significant strikes landed and attempted by position (distance,
// clinch, ground) and target (head, body, leg), then knockdowns, takedowns landed and attempted, control time
// (seconds), ground advances, submission attempts and reversals
export const POSITIONS = ['dist', 'clinch', 'ground'];
export const TARGETS = ['head', 'body', 'leg'];
const ESPN_POSITION = { dist: 'sigDistance', clinch: 'sigClinch', ground: 'sigGround' };
const ESPN_TARGET = { head: 'Head', body: 'Body', leg: 'Leg' };
export const STRIKE_FIELDS = [
  ...POSITIONS.flatMap((p) => TARGETS.flatMap((t) => [`${p}-${t}`, `${p}-${t}-att`])),
  'kd',
  'tdl',
  'tda',
  'ctrl',
  'adv',
  'sub',
  'rev',
];
const ESPN_NAMES = [
  ...POSITIONS.flatMap((p) => TARGETS.flatMap((t) => [`${ESPN_POSITION[p]}${ESPN_TARGET[t]}StrikesLanded`, `${ESPN_POSITION[p]}${ESPN_TARGET[t]}StrikesAttempted`])),
  'knockDowns',
  'takedownsLanded',
  'takedownsAttempted',
  'timeInControl',
  'advances',
  'submissions',
  'reversals',
];

// A competitor's statistics (the core API's answer) as STRIKE_FIELDS, or 0 when there's nothing in it: no
// categories, or not a strike, takedown or submission tried (the old cards ESPN lists without numbers)
export function parseStrikes(data) {
  const byName = new Map();
  for (const c of data?.splits?.categories ?? []) for (const s of c.stats ?? []) byName.set(String(s.name ?? '').trim(), Number(s.value) || 0);
  const row = ESPN_NAMES.map((n) => Math.max(0, Math.round(byName.get(n) ?? 0)));
  const tried = STRIKE_FIELDS.reduce((a, f, i) => a + (f.endsWith('-att') || f === 'tda' || f === 'sub' ? row[i] : 0), 0);
  return tried > 0 ? row : 0;
}

// A polite pace: a few calls in flight, a little apart, each tried again on a failure
let gate = Promise.resolve();
function get(url) {
  const turn = gate.then(() => new Promise((r) => setTimeout(r, 60)));
  gate = turn;
  return turn.then(() => fetchRetry(url, { as: 'json', headers: { 'User-Agent': 'Mozilla/5.0 (sports-ranker data script)' }, attempts: 4, backoff: 2000, notFound: null }));
}
async function pool(items, size, work) {
  let at = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (at < items.length) await work(items[at++]);
    }),
  );
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// A year's event ids by bout (its scoreboard), asked once when a bout needs one
async function eventIds(year) {
  const board = await get(`${SITE}/scoreboard?dates=${year}&limit=1000`).catch(() => null);
  const out = new Map();
  for (const event of board?.events ?? []) for (const c of event.competitions ?? []) out.set(String(c.id), String(event.id));
  return out;
}

// Whether a kept bout is done: both sides answered, or it's old enough that what's missing stays missing
const settled = (kept, fight, now) => {
  if (!kept?.s) return false;
  const sides = fight.fighters.map((f) => kept.s[f.id]);
  if (sides.every((s) => s !== undefined && s !== 0)) return true;
  if (sides.some((s) => s === undefined)) return false;
  return (now - Date.parse(fight.date)) / 864e5 > FRESH_DAYS;
};

// Fetch what's new: every UFC bout in scripts/fights/ufc not yet kept (or fresh and missing a side), a year at
// a time, each year's file written as it finishes. Returns the counts.
export async function updateStrikes({ log = console.log, years = null, now = Date.now() } = {}) {
  const files = (await readdir(FIGHTS)).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  let asked = 0;
  let found = 0;
  for (const file of files) {
    const year = Number(file.slice(0, 4));
    if (years && !years.includes(year)) continue;
    const fights = await readJson(path.join(FIGHTS, file), []);
    const out = path.join(DIR, file);
    const kept = await readJson(out, {});
    const todo = fights.filter((f) => f.fighters?.length === 2 && !settled(kept[f.id], f, now));
    if (!todo.length) continue;
    const events = todo.some((f) => !kept[f.id]?.e) ? await eventIds(year) : new Map();
    let failed = 0;
    await pool(todo, 6, async (fight) => {
      const e = kept[fight.id]?.e ?? events.get(fight.id);
      if (!e) return;
      const s = { ...(kept[fight.id]?.s ?? {}) };
      for (const { id } of fight.fighters) {
        if (s[id]) continue;
        asked++;
        try {
          const data = await get(`${CORE}/events/${e}/competitions/${fight.id}/competitors/${id}/statistics`);
          s[id] = parseStrikes(data);
          if (s[id]) found++;
        } catch {
          // (a call that failed: not kept, asked again next run)
          failed++;
        }
      }
      kept[fight.id] = { e, s };
    });
    await mkdir(DIR, { recursive: true });
    // (the bouts in the year's order, so a rerun writes the same file)
    const ordered = Object.fromEntries(fights.filter((f) => kept[f.id]).map((f) => [f.id, kept[f.id]]));
    await writeFile(out, JSON.stringify(ordered));
    log(`strikes ${year}: ${todo.length} bouts asked${failed ? `, ${failed} calls failed` : ''}`);
  }
  return { asked, found };
}

// Every kept bout's sides: bout id -> { fighter id -> STRIKE_FIELDS row } (sides with nothing left out)
export async function keptStrikes(dir = DIR) {
  const out = new Map();
  const files = await readdir(dir).catch(() => []);
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    for (const [bout, entry] of Object.entries(await readJson(path.join(dir, file), {}))) {
      const sides = Object.fromEntries(Object.entries(entry.s ?? {}).filter(([, row]) => Array.isArray(row)));
      if (Object.keys(sides).length) out.set(bout, sides);
    }
  }
  return out;
}

// Run on its own: fetch what's new (node strikes.mjs [year ...])
if (process.argv[1]?.endsWith('strikes.mjs')) {
  const years = process.argv.slice(2).map(Number).filter(Boolean);
  const { asked, found } = await updateStrikes({ years: years.length ? years : null });
  console.log(`${asked} sides asked, ${found} with numbers`);
}
