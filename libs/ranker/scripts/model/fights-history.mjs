// The MMA priced history matched to our bouts, fights-history.mjs (the owner, 2026-10-19: "Do we not have historical
// bet data on MMA? That's arguably more valuable than other sports."). The Odds API's archive (odds-history.mjs,
// apps/mma/scripts/model/odds-history/<year>.jsonl.gz: every bout's moneyline (h2h) and round total at DraftKings and
// Pinnacle, the open and the close, about 600 bouts a year since 2020-06) keeps each bout by its two fighters' names
// and its start, with no ESPN id. This joins each of its events to the fights archive (apps/mma/scripts/fights:
// ESPN's bouts with the result, the method, the round and the clock) by the fighters' names and the date, so the gate
// (gate.mjs, gate-mma.mjs) can grade the fight model against the Book over every season it has.
//
//   names     a name's key drops accents, case, spacing and punctuation (nameKey, as mma-desk.mjs matches the live
//             board); a Jr., Sr., II or III suffix is dropped; a pair matches when both fighters match, one of them
//             exactly, the other at least by surname and first initial (a nickname, a shortened first name) or, where
//             the pair is the only candidate on the day, by surname alone (a first name the books write differently:
//             "Abdul-Rakhman" / "Abdulrakhman" is already the same key)
//   dates     the API's start is the bout's own, UTC; ESPN's date is the card's day: a bout matches a fight within
//             DAY_WINDOW of its start
//   sides     the API's home_team is whichever side it listed first; ESPN's first fighter is its own. Each match
//             carries crossed: true where the API's home is ESPN's second fighter, so a price lands on its own
//             fighter (mma-desk.mjs matchBout does the same for the live board)
//   unmatched each event with no fight, grouped by its card's day, for the report (the big cards missing)
//
// Usage: node libs/ranker/scripts/model/fights-history.mjs   (the match report: the rate by year, the unmatched cards)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keptFights } from '../../../../apps/mma/scripts/fights.mjs';
import { readHistory } from './odds-history.mjs';

export const DAY_WINDOW = 36 * 36e5;
const SUFFIX = /\b(jr|sr|junior|ii|iii|iv)$/;
// (a surname the books keep where ESPN carries the married or changed one: both sides of each are one key)
export const SURNAME_ALIAS = { chookagian: 'cerminara', kunitskaya: 'santos', torres: 'pennington', ansaroff: 'nunes', macedo: 'hardy', mathetha: 'diamond', waterson: 'watersongomez' };

// A name's key (mma-desk.mjs nameKey, with the suffix dropped)
export const nameKey = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

export const tokensOf = (name) => {
  const t = String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
  while (t.length > 1 && SUFFIX.test(t.at(-1))) t.pop();
  return t;
};
const keyOf = (name) => tokensOf(name).join('');
// (a surname: the last token; a two-token surname's last word is enough for the index)
export const surnameOf = (name) => tokensOf(name).at(-1) ?? '';

// (the edit distance between two words, capped: a transliteration's one letter, "Spivak" and "Spivac",
// "Abdurahimov" and "Abdurakhimov")
export function editDistance(a, b, cap = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}
const alias = (w) => SURNAME_ALIAS[w] ?? w;
// (a surname near enough: the same, one an alias of the other, one the end of the other (a two-word surname and its
// last word), or a letter apart over six letters or more)
const sameSurname = (a, b) => {
  const [x, y] = [alias(a), alias(b)];
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.endsWith(y) || y.endsWith(x))) return true;
  return Math.min(x.length, y.length) >= 6 && editDistance(x, y, 1) <= 1;
};

// How well two names match: 3 the same key; 2 the same surname and first initial, the same tokens in another
// order (the books' "Xiaonan Yan" for ESPN's "Yan Xiaonan"), the shorter name's words all in the longer ("Ian Garry"
// and "Ian Machado Garry"), a name the books join ("Alatengheili" for "Heili Alateng"), or a surname a letter apart
// with the first initial; 1 the same surname alone; 0 not
export function nameScore(a, b) {
  const ka = keyOf(a);
  const kb = keyOf(b);
  if (ka && ka === kb) return 3;
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.length > 1 && [...ta].sort().join('') === [...tb].sort().join('')) return 2;
  // (one word against two joined either way round)
  if ((ta.length === 1 && tb.length === 2) || (tb.length === 1 && ta.length === 2)) {
    const [one, two] = ta.length === 1 ? [ta[0], tb] : [tb[0], ta];
    if (one === two.join('') || one === [two[1], two[0]].join('')) return 2;
  }
  // (the shorter's words all in the longer, two or more of them)
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length >= 2 && short.length < long.length && short.every((w) => long.includes(w))) return 2;
  if (!sameSurname(ta.at(-1), tb.at(-1))) return 0;
  if (ta.length < 2 || tb.length < 2) return 1;
  return ta[0][0] === tb[0][0] ? 2 : 1;
}

// The pair's score for an event against a fight: { score, crossed } (the better orientation), score 0 where either
// fighter fails
function pairScore(e, f) {
  const [a, b] = f.fighters;
  const straight = [nameScore(e.homeName, a.name), nameScore(e.awayName, b.name)];
  const crossed = [nameScore(e.homeName, b.name), nameScore(e.awayName, a.name)];
  const sum = (x) => (x[0] && x[1] ? x[0] + x[1] : 0);
  const s = sum(straight);
  const c = sum(crossed);
  if (s >= c) return { score: s, crossed: false, exact: Math.max(...straight) === 3 };
  return { score: c, crossed: true, exact: Math.max(...crossed) === 3 };
}

// Every event matched to its fight: Map oid -> { fight, crossed, score }; and the unmatched events. fights: the
// archive (keptFights), events: the history's (readHistory(sport).events)
export function matchHistory(events, fights, { closed = new Set() } = {}) {
  // (fights by the day they're on, for the window; each fight's day as a number)
  const byDay = new Map();
  for (const f of fights) {
    const d = Math.floor(Date.parse(`${f.date}T12:00:00Z`) / 864e5);
    (byDay.get(d) ?? byDay.set(d, []).get(d)).push(f);
  }
  const matched = new Map();
  const taken = new Set();
  const unmatched = [];
  // (the surest first: a pair with both exact wins its fight over a looser one)
  const cands = [];
  for (const e of events.values()) {
    const t = Date.parse(e.t);
    if (!Number.isFinite(t)) continue;
    const d0 = Math.floor(t / 864e5);
    const list = [];
    for (let d = d0 - 2; d <= d0 + 2; d++)
      for (const f of byDay.get(d) ?? []) {
        const gap = Math.abs(Date.parse(`${f.date}T12:00:00Z`) - t);
        if (gap > DAY_WINDOW + 12 * 36e5) continue;
        const ps = pairScore(e, f);
        // (one exact and the other by surname and initial at least; or, where it's the day's only pair, one exact
        // and a surname alone, or both by surname and initial)
        if (ps.score < 4) continue;
        list.push({ f, gap, ...ps });
      }
    if (!list.length) {
      unmatched.push(e);
      continue;
    }
    list.sort((x, y) => y.score - x.score || x.gap - y.gap);
    const best = list[0];
    if ((best.score === 4 || !best.exact) && !(best.score >= 5 && best.exact) && list.length > 1) {
      unmatched.push(e);
      continue;
    }
    cands.push({ e, ...best });
  }
  // (two listings of one bout (the API re-issued it, or a bout moved to a later card): the one priced to the bell
  // wins the fight)
  cands.sort((x, y) => y.score - x.score || (closed.has(y.e.oid) ? 1 : 0) - (closed.has(x.e.oid) ? 1 : 0) || x.gap - y.gap);
  for (const c of cands) {
    if (taken.has(c.f.id)) {
      unmatched.push(c.e);
      continue;
    }
    taken.add(c.f.id);
    matched.set(c.e.oid, { fight: c.f, crossed: c.crossed, score: c.score });
  }
  return { matched, unmatched };
}

// The events priced to the bell: a close inside closeMax of the start (a listing the books kept till the bout: one
// that happened; the rest are bouts the API listed that were moved, pulled or never made)
export function closedEvents(hist, closeMax = 6 * 36e5) {
  const out = new Set();
  for (const l of hist.lines) {
    if (l.kind !== 'c') continue;
    const e = hist.events.get(l.oid);
    if (e && Date.parse(e.t) - Date.parse(l.ts) <= closeMax) out.add(l.oid);
  }
  return out;
}

// The report: the rate by season (every event, and the ones priced to the bell), and the unmatched grouped by day
// (the cards), biggest first
export function matchReport(events, matched, unmatched, fights, closed = new Set()) {
  const bySeason = {};
  for (const e of events.values()) {
    const s = bySeason[e.season] ?? (bySeason[e.season] = { events: 0, matched: 0, closed: 0, closedMatched: 0 });
    s.events++;
    if (matched.has(e.oid)) s.matched++;
    if (closed.has(e.oid)) {
      s.closed++;
      if (matched.has(e.oid)) s.closedMatched++;
    }
  }
  const byDay = new Map();
  for (const e of unmatched) {
    const day = String(e.t).slice(0, 10);
    const x = byDay.get(day) ?? byDay.set(day, { day, n: 0, bouts: [] }).get(day);
    x.n++;
    x.bouts.push(`${e.homeName} v ${e.awayName}`);
  }
  // (the card's name from the archive's fights on the day, where any matched)
  const cardOf = new Map();
  for (const f of fights) if (!cardOf.has(f.date)) cardOf.set(f.date, f.event);
  const cards = [...byDay.values()].sort((a, b) => b.n - a.n || a.day.localeCompare(b.day)).map((x) => ({ ...x, card: cardOf.get(x.day) ?? cardOf.get(new Date(Date.parse(x.day) - 864e5).toISOString().slice(0, 10)) ?? null }));
  const total = events.size;
  const closedN = [...events.keys()].filter((oid) => closed.has(oid)).length;
  const closedM = [...matched.keys()].filter((oid) => closed.has(oid)).length;
  return { total, matched: matched.size, closed: closedN, closedMatched: closedM, closedRate: closedN ? Math.round((closedM / closedN) * 1e4) / 1e4 : null, rate: total ? Math.round((matched.size / total) * 1e4) / 1e4 : null, bySeason, cards };
}

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export { ROOT };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fights = await keptFights();
  const hist = readHistory('mma', { props: false });
  const closed = closedEvents(hist);
  const { matched, unmatched } = matchHistory(hist.events, fights, { closed });
  const r = matchReport(hist.events, matched, unmatched, fights, closed);
  console.log(`${r.matched} of ${r.total} events matched (${(r.rate * 100).toFixed(1)}%); of the ${r.closed} priced to the bell (a close inside 6 hours: the bouts that happened), ${r.closedMatched} (${(r.closedRate * 100).toFixed(1)}%)`);
  for (const [s, x] of Object.entries(r.bySeason)) console.log(`  ${s}: ${x.matched} of ${x.events} (${((100 * x.matched) / x.events).toFixed(1)}%); priced to the bell ${x.closedMatched} of ${x.closed}`);
  const leagues = {};
  let crossed = 0;
  for (const m of matched.values()) {
    leagues[m.fight.league] = (leagues[m.fight.league] ?? 0) + 1;
    if (m.crossed) crossed++;
  }
  console.log(`  by promotion: ${Object.entries(leagues).map(([k, v]) => `${k} ${v}`).join(', ')}; the API's first side ESPN's second (crossed) on ${crossed}`);
  const missed = unmatched.filter((e) => closed.has(e.oid));
  console.log(`unmatched: ${unmatched.length} on ${r.cards.length} days; ${missed.length} of them priced to the bell: ${missed.map((e) => `${e.t.slice(0, 10)} ${e.homeName} v ${e.awayName}`).join('; ')}`);
  console.log('the biggest days of unmatched listings:');
  for (const c of r.cards.slice(0, 12)) console.log(`  ${c.day} ${c.card ?? '(no card in the archive that day)'}: ${c.n}: ${c.bouts.slice(0, 4).join('; ')}${c.bouts.length > 4 ? '...' : ''}`);
}
