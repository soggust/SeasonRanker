// The weigh-ins read live (DECISIONS.md D83, 2026-10-23): a coming card's weight misses, before the bouts, for the
// fights model's missW term. The source: MMA Fighting's Bluesky account (the public AppView, no key; D49's reader),
// whose "<card> weigh-in results" post links its article, free to read; the article lists every bout with both
// weights, a miss starred ("Iasmin Lucindo (115) vs. Nicolle Caliari (120.5)*", "*Caliari missed weight"). Each named
// misser is matched to the card's bouts by name (weight-misses.mjs missersIn). Read only inside MISS_WINDOW_H of a
// bout's start (the weigh-ins are the morning before); a read that fails is no miss (the term then says nothing).
import { get } from './sources.mjs';
import { missersIn, writeMisses } from './weight-misses.mjs';

export const WEIGH_IN_SOURCE = 'mmafighting.bsky.social';
const BSKY = 'https://public.api.bsky.app/xrpc';
// (a card's weigh-ins are read from this many hours before its first bout to its start)
export const MISS_WINDOW_H = 48;
const fin = Number.isFinite;

// (the article's text: tags out, entities read, spaces folded)
export const textOf = (html) =>
  String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

// The fighters of these bouts an article names as missing: "*X missed weight" notes, and a weight starred after a
// name ("X (120.5)*"). [{ bout, fighter, name, lbs }]
export function missesIn(text, bouts) {
  const out = new Map();
  const notes = String(text).split(/(?<=[.!?])\s+|\*/).filter((s) => /missed weight|missing weight|failed to make weight/i.test(s));
  for (const b of bouts) {
    const fighters = [b.home, b.away].filter((f) => f?.id && f?.name);
    for (const s of notes) for (const f of missersIn(s.replace(/failed to make weight|missing weight/gi, 'missed weight'), fighters)) out.set(`${b.id}|${f.id}`, { bout: String(b.id), fighter: String(f.id), name: f.name, lbs: null });
    // (a starred weight: "Nicolle Caliari (120.5)*")
    for (const f of fighters) {
      const esc = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = String(text).match(new RegExp(`${esc}\\s*\\((\\d{3}(?:\\.\\d+)?)\\)\\s*\\*`, 'i'));
      if (m) out.set(`${b.id}|${f.id}`, { bout: String(b.id), fighter: String(f.id), name: f.name, lbs: Number(m[1]) });
    }
  }
  return [...out.values()];
}

// The source's weigh-in posts of the last days: [{ at, title, uri }]
export async function weighInPosts({ fetchJson = get, now = Date.now(), days = 3 } = {}) {
  const body = await fetchJson(`${BSKY}/app.bsky.feed.getAuthorFeed?actor=${WEIGH_IN_SOURCE}&limit=100&filter=posts_no_replies`).catch(() => null);
  const out = [];
  for (const f of body?.feed ?? []) {
    const ext = f?.post?.embed?.external;
    const at = Date.parse(f?.post?.record?.createdAt ?? '');
    if (!ext?.uri || !fin(at) || now - at > days * 864e5) continue;
    if (!/weigh-in results/i.test(`${ext.title ?? ''} ${f.post.record.text ?? ''}`)) continue;
    if (!/^https:\/\/www\.mmafighting\.com\//.test(ext.uri)) continue;
    out.push({ at: new Date(at).toISOString(), title: ext.title ?? '', uri: ext.uri });
  }
  return out;
}

// The coming bouts' misses, set on each bout as missed: [home, away] (the fights model's chance reads it); the
// misses found are added to the history's table (weight-misses.json) unless dry. { found, read, posts }
export async function markMisses(bouts, { now = new Date(), dry = false, fetchJson = get, fetchText = (u) => get(u, { text: true }), log = console } = {}) {
  const t = now instanceof Date ? now.getTime() : now;
  const near = (bouts ?? []).filter((b) => !b.final && !b.off && fin(Date.parse(b.start ?? b.date)) && Date.parse(b.start ?? b.date) - t <= MISS_WINDOW_H * 36e5 && Date.parse(b.start ?? b.date) > t);
  if (!near.length) return { found: [], read: 0, posts: 0 };
  const posts = await weighInPosts({ fetchJson, now: t }).catch(() => []);
  const found = new Map();
  let read = 0;
  for (const p of posts) {
    const html = await fetchText(p.uri).catch(() => null);
    if (!html) continue;
    read++;
    for (const m of missesIn(textOf(html), near)) found.set(`${m.bout}|${m.fighter}`, { ...m, source: p.uri, at: p.at });
  }
  for (const b of near) b.missed = [found.has(`${b.id}|${b.home?.id}`), found.has(`${b.id}|${b.away?.id}`)];
  const list = [...found.values()];
  if (list.length) log.log?.(`mma: weigh-ins: ${list.map((m) => `${m.name} missed weight${fin(m.lbs) ? ` (${m.lbs})` : ''}`).join(', ')} (${WEIGH_IN_SOURCE})`);
  if (list.length && !dry) {
    const day = (id) => String(near.find((b) => String(b.id) === id)?.date ?? '').slice(0, 10);
    writeMisses(list.map((m) => [m.bout, m.fighter, null, m.name, day(m.bout), 'mmafighting']));
  }
  return { found: list, read, posts: posts.length };
}
