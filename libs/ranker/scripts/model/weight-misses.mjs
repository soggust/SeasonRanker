// The weight-miss table (DECISIONS.md D83, 2026-10-23): every UFC bout in the history where a fighter missed weight,
// from Wikipedia's event pages (free: the List of UFC events, then each event's wikitext by Special:Export, 40 pages
// a request, 10 seconds apart). Each page's weigh-in notes ("X weighed in at 147.5 pounds, one and a half pounds over
// the featherweight non-title fight limit", "X and Y missed weight") are matched to the history's bouts on the
// event's date (a day either side) and the fighters' names: a fighter misses where his name sits before the note's
// verb ("weighed in at", "missed weight", "came in at") and not after "went to", "opponent" or "fined". Written to
// apps/mma/scripts/weight-misses.json ({ rows: [[bout, fighter, pounds over or null, name, date, source]] }), which
// fights-model.mjs reads (the missW term). The live desk adds the weigh-in results it reads (weigh-ins.mjs) to the
// same file, so the history grows with each card.
//
//   node libs/ranker/scripts/model/weight-misses.mjs [--refetch]   (the pages cached in .cache/model/wiki-ufc)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { keptFights } from '../../../../apps/mma/scripts/fights.mjs';
import { WEIGHT_MISS_FILE } from './fights-model.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const RAW = path.join(ROOT, '.cache/model/wiki-ufc');
const UA = { 'User-Agent': 'SeasonRankerResearch/1.0 (UFC weigh-in notes)' };
const wait = (ms) => new Promise((s) => setTimeout(s, ms));
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');

async function fetchPages(refetch) {
  mkdirSync(RAW, { recursive: true });
  const tf = path.join(RAW, 'titles.json');
  if (refetch || !existsSync(tf)) {
    const r = await fetch('https://en.wikipedia.org/w/api.php?action=parse&page=List_of_UFC_events&prop=wikitext&format=json', { headers: UA });
    const w = (await r.json()).parse.wikitext['*'];
    const titles = [...new Set([...w.matchAll(/\[\[((?:UFC|The Ultimate Fighter)[^\]|#]*)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim()))].filter((t) => !/^UFC (Hall|Apex|Fight Pass|BJJ|on Fox$|on ESPN$|Fight Night$)/.test(t));
    writeFileSync(tf, JSON.stringify(titles));
  }
  const titles = JSON.parse(readFileSync(tf, 'utf8'));
  for (let i = 0; i < titles.length; i += 40) {
    const f = path.join(RAW, `x${String(i / 40).padStart(3, '0')}.xml`);
    if (!refetch && existsSync(f)) continue;
    for (let k = 0; k < 5; k++) {
      const body = new URLSearchParams({ pages: titles.slice(i, i + 40).join('\n'), curonly: '1', action: 'submit' });
      const r = await fetch('https://en.wikipedia.org/w/index.php?title=Special:Export', { method: 'POST', body, headers: UA });
      if (r.ok) {
        writeFileSync(f, await r.text());
        break;
      }
      await wait(30000 * (k + 1));
    }
    await wait(10000);
  }
  const pages = [];
  for (const f of readdirSync(RAW).filter((x) => x.endsWith('.xml'))) for (const m of readFileSync(path.join(RAW, f), 'utf8').matchAll(/<page>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<\/page>/g)) pages.push({ title: unesc(m[1]), text: unesc(m[2]) });
  return pages;
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z' -]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
// (the pounds over: "2.5 pounds over", "two and a half pounds over", "half a pound over", "3.5 lb overweight")
export function poundsOver(s) {
  const m = s.match(/(\d+(?:\.\d+)?|[a-z]+(?: and a (?:half|quarter))?|half a|a quarter of a)\s*(?:pounds?|lbs?\.?)\s*(?:over|overweight|heavy)/i);
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (/^\d/.test(t)) return Number(t);
  if (t === 'half a') return 0.5;
  if (t === 'a quarter of a') return 0.25;
  const [a, h] = t.split(' and a ');
  const v = (WORDS[a] ?? NaN) + (h === 'half' ? 0.5 : h === 'quarter' ? 0.25 : 0);
  return Number.isFinite(v) ? v : null;
}
const VERB = / (weighed in at|missed weight|missed the|came in at|coming in|was overweight|weighing in at)/g;
const LEAD_WORDS = /^(the|at|and|ins|in|weigh-ins|weigh|da|dos|de|both|also|newcomer|newcomers|former|undefeated|prospect|veteran|while|but|however|addition|then|challenger|champion|winner|alum|medalist|contender|fighter|meanwhile|day|of|for|after|whereas|as)$/;
const NOT_HIM =/(went to|opponent|against|to face|faced|with |fine to|purse to|fined)/;
// (the fighters a note names as missing: a name before a verb, nothing in between that makes him the other side)
export function missersIn(sentence, fighters) {
  const ns = ` ${norm(sentence)} `;
  const verbs = [...ns.matchAll(VERB)].map((m) => m.index);
  if (!verbs.length) return [];
  return fighters.filter((me) => {
    const full = norm(me.name);
    const parts = full.split(' ');
    const last = parts.at(-1).length >= 3 ? parts.at(-1) : full;
    // (a surname alone counts only where the word before it isn't another first name: "Jesus Santos Aguilar" is not
    // Luana Santos)
    const at = [...ns.matchAll(new RegExp(` (${full}|${last}) `, 'g'))].filter((m) => {
      if (m[1] === full) return true;
      const prev = ns.slice(0, m.index).trim().split(' ').at(-1) ?? '';
      return !prev || LEAD_WORDS.test(prev) || parts.includes(prev) || (prev.length >= 3 && prev.slice(0, 3) === parts[0].slice(0, 3));
    }).map((m) => m.index);
    return at.some((a) => {
      const v = verbs.find((x) => x > a);
      if (v === undefined) return false;
      const between = ns.slice(a, v);
      return !NOT_HIM.test(between) && between.length < 140;
    });
  });
}

// The table from the pages and the history's UFC bouts: [[bout, fighter, over, name, date, 'wikipedia']]
export function missTable(pages, fights) {
  const byDate = new Map();
  for (const f of fights) (byDate.get(f.date) ?? byDate.set(f.date, []).get(f.date)).push(f);
  const shift = (d, k) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
  const dateOf = (text) => {
    const m = text.match(/\|\s*date\s*=\s*\{\{\s*start date[^|]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
  };
  const out = new Map();
  const stats = { pages: pages.length, withNotes: 0, notes: 0, noBouts: 0 };
  for (const { title, text } of pages) {
    const clean = text.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '');
    const notes = clean.split(/(?<=[.;])\s+|\n/).filter((s) => /(missed weight|pounds? over|lbs?\.? over|overweight|over the [a-z' ]*limit)/i.test(s) && !/\bmade weight\b/i.test(s));
    if (!notes.length) continue;
    stats.withNotes++;
    const d = dateOf(text);
    let bouts = d ? ([d, shift(d, 1), shift(d, -1)].map((x) => byDate.get(x) ?? []).find((x) => x.length) ?? []) : [];
    if (!bouts.length) bouts = fights.filter((f) => f.event === title);
    if (!bouts.length) {
      stats.noBouts++;
      continue;
    }
    for (const s of notes) {
      stats.notes++;
      for (const f of bouts) for (const me of missersIn(s, f.fighters)) {
        const k = `${f.id}|${me.id}`;
        if (out.has(k)) continue;
        const last = norm(me.name).split(' ').at(-1);
        out.set(k, [String(f.id), String(me.id), poundsOver(s.slice(Math.max(0, s.toLowerCase().indexOf(last)))), me.name, f.date, 'wikipedia']);
      }
    }
  }
  return { rows: [...out.values()].sort((a, b) => a[4].localeCompare(b[4])), stats };
}

// (the file kept: the rows merged by bout and fighter, the live desk's beside the table's)
export function writeMisses(rows, extra = {}, file = WEIGHT_MISS_FILE) {
  let old = [];
  try {
    old = JSON.parse(readFileSync(file, 'utf8')).rows ?? [];
  } catch {}
  // (a rebuild from Wikipedia replaces the table's own rows; the desk's live rows stay, a row of each kind kept once)
  const rebuild = rows.some((r) => r[5] === 'wikipedia');
  const by = new Map(old.filter((r) => !rebuild || r[5] !== 'wikipedia').map((r) => [`${r[0]}|${r[1]}`, r]));
  for (const r of rows) if (!by.has(`${r[0]}|${r[1]}`) || r[5] === 'wikipedia') by.set(`${r[0]}|${r[1]}`, r);
  const all = [...by.values()].sort((a, b) => String(a[4]).localeCompare(String(b[4])));
  writeFileSync(file, `${JSON.stringify({ about: 'UFC bouts where a fighter missed weight (DECISIONS.md D83): [bout (ESPN id), fighter (ESPN id), pounds over or null, name, date, source]. Built by libs/ranker/scripts/model/weight-misses.mjs from Wikipedia; the desk adds the weigh-in results it reads (weigh-ins.mjs).', at: new Date().toISOString(), ...extra, rows: all })}\n`);
  return all.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const pages = await fetchPages(process.argv.includes('--refetch'));
  const fights = (await keptFights()).filter((f) => f.league === 'ufc');
  const { rows, stats } = missTable(pages, fights);
  const n = writeMisses(rows, { stats });
  console.log(`weight misses: ${rows.length} from ${stats.withNotes} pages with weigh-in notes (${stats.notes} notes, ${stats.noBouts} pages with no bouts in the history); ${n} in the file`);
}
