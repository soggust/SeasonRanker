// The news-speed input (DECISIONS.md D49): two free sources that see injury news before ESPN's report does,
// put into the coming games' injury reports the way a CHECK's research is (escalate only, newer than ESPN's own
// entry), so every input that reads the report sees them: the statuses, the play chance (D45), the vacated work
// and the usage (D41), the missing-prop signal's status group (D45) and the re-price of an open bet (repriceOpen,
// timing.mjs inputsOf). And the Bot's own time to bet (D42): a row whose team has fast news in hand is past its
// news (lineup-risk.mjs survivalAt newsIn), bet at the practice stake till those bets' CLV earns more.
//
//   Sleeper  the public players dump (api.sleeper.app/v1/players/<nfl|nba|nhl>, no key): injury_status,
//            injury_body_part, practice_participation, news_updated, depth-chart order. Sleeper asks the dump be
//            pulled at most once a day: one pull a UTC day, the first run from SLEEPER_HOUR UTC (or any run when
//            the kept one is SLEEPER_MAX_AGE_H old), kept compact under .cache/model/sleeper-<sport>.json; the
//            intraday lighter endpoints (trending adds and drops) carry no status, so they aren't read
//   Bluesky  the curated reporters (news-handles.json: insiders' accounts and their mirrors, the injury
//            aggregators, DailyFaceoff's team accounts), each verified to exist and to post injury news; their
//            posts read by the news signals' classifier (news-signals.mjs postSignals: claude-haiku-5-5, its
//            caps NEWS_CAPS / CAP_WINDOWS) into claims, apps/<sport>/scripts/model/news-fast.json: { player,
//            team, status, kind, confidence, at (the post's time), seen (our first sight), handle, post }
//   applied  fastNotes: a status (out, doubtful, questionable; limited read as questionable) for a player of a
//            coming game's side, posted LOOK_H hours before its start at most and by now (none from after the run:
//            no look-ahead), put into that game's report copy (from 'sleeper' or 'bluesky', date its time) only
//            where it is worse than ESPN's own entry and newer than it (ESPN unlisted: it stands). A player
//            matched to an ESPN id by the dump's espn_id, else by name on the side's ESPN roster; none, not
//            applied. An owner's note or the research's entry on him wins. An "active" claim is logged, never
//            applied (a return is ESPN's or the posted roster's to say)
//   timing   fastFor: the game's fast entries on a side, posted FRESH_H hours ago at most: the side's rows read
//            the news as in (survival 1); the bet carries early.fast and is held to the practice stake until
//            fastEarned (the graded fast bets since the epoch beat the close on CLV over FAST_EARN_N bets)
//   speed    speedUpdate: each coming game's listed players by source, the run that first saw each status and
//            the source's own time (apps/<sport>/scripts/model/news-speed.json, committed with the desk), for
//            news-speed.mjs to set against the Book's price moves in board-seen.json
//
// Nothing here prices on its own; a source that fails gives nothing and the report stands as ESPN's.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { nameKey } from './espn.mjs';
import { OUT_STATUS, Q_STATUS } from './timing.mjs';
import { CACHE, get, readJson, writeAtomic } from './sources.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const SLEEPER_API = 'https://api.sleeper.app/v1';
export const BSKY_API = 'https://public.api.bsky.app/xrpc';
export const SLEEPER_SPORTS = new Set(['nfl', 'nba', 'nhl']);
export const SLEEPER_HOUR = 20;
export const SLEEPER_MAX_AGE_H = 30;
// (a status counts for a game posted this many hours before its start at most: the NFL's designations come two
// days out at most (a Sunday's on the Friday, a Monday's on the Saturday), the NBA's and NHL's the day before; an
// older one is the last game's (a status posted the morning after a game, while it was still being played, too))
export const LOOK_H = { nfl: 54, nba: 30, nhl: 30 };
export const FRESH_H = 12;
// (the sports whose rows read fast news as in for the timing: the NFL's and NBA's, whose curve otherwise runs to the
// last chance; the NHL's waits on its goalies, newsMissing, as before)
export const FAST_TIMING = new Set(['nfl', 'nba']);
export const MIN_CLAIM_CONF = 0.6;
export const FAST_EARN_N = 30;
export const SPEED_KEEP_DAYS = 10;
export const FAST_KEEP_DAYS = 21;
export const handlesFile = path.join(import.meta.dirname, 'news-handles.json');
export const fastFile = (sport) => path.join(ROOT, 'apps', sport, 'scripts/model/news-fast.json');
export const speedFile = (sport) => path.join(ROOT, 'apps', sport, 'scripts/model/news-speed.json');
export const sleeperCache = (sport) => path.join(CACHE, `sleeper-${sport}.json`);
// (the report's words for a status, the research's: limited read as questionable)
export const FAST_WORD = { out: 'Out', doubtful: 'Doubtful', questionable: 'Questionable', limited: 'Questionable' };
// (Sleeper's team abbreviations where ESPN's differ)
export const ALIAS = {
  nfl: { WAS: 'WSH', OAK: 'LV', JAC: 'JAX' },
  nba: { GSW: 'GS', SAS: 'SA', NYK: 'NY', WAS: 'WSH', NOP: 'NO', UTA: 'UTAH', PHO: 'PHX', BRK: 'BKN' },
  nhl: { UTA: 'UTAH', ARI: 'UTAH', LAK: 'LA', NJD: 'NJ', SJS: 'SJ', TBL: 'TB', WAS: 'WSH' },
};
export const espnAbbr = (sport, abbr) => {
  const a = String(abbr ?? '').toUpperCase();
  return ALIAS[sport]?.[a] ?? a;
};

const fin = Number.isFinite;
const iso = (t) => new Date(t).toISOString();

// A Sleeper injury_status as the report's class: out, doubtful, questionable, or null (none, or one that isn't a
// game status: NA, DNR)
export function sleeperStatus(s) {
  const x = String(s ?? '').trim();
  if (/^(out|ir|pup|sus|cov|nfi)$/i.test(x) || /injured reserve|suspen/i.test(x)) return 'out';
  if (/^doubtful$/i.test(x)) return 'doubtful';
  if (/^(questionable|dtd|gtd|day-to-day)$/i.test(x)) return 'questionable';
  return null;
}
// (Sleeper's practice_participation as the play table's level: DNP, LP, FP, or null)
export const sleeperPractice = (s) => (/^dnp$|did not/i.test(s ?? '') ? 'DNP' : /^lp$|limited/i.test(s ?? '') ? 'LP' : /^fp$|full/i.test(s ?? '') ? 'FP' : null);
// (a status's weight, the research's: out 2, questionable or limited 1, else 0)
export const severityOf = (s) => (s === 'out' || s === 'doubtful' || OUT_STATUS.test(String(s ?? '')) ? 2 : s === 'questionable' || s === 'limited' || Q_STATUS.test(String(s ?? '')) ? 1 : 0);

// The dump, compact: each player on a team, { sid, espn, name, key, team (ESPN's abbreviation), pos, status (the
// class), raw, body, practice, news (ms), depth }
export function compactSleeper(sport, body) {
  const out = [];
  for (const p of Object.values(body && typeof body === 'object' ? body : {})) {
    if (!p?.team || !(p.full_name || p.first_name)) continue;
    const name = p.full_name ?? `${p.first_name} ${p.last_name}`;
    out.push({
      sid: String(p.player_id ?? ''),
      espn: p.espn_id ? String(p.espn_id) : null,
      name,
      key: nameKey(name),
      team: espnAbbr(sport, p.team),
      pos: p.position ?? '',
      status: sleeperStatus(p.injury_status),
      raw: p.injury_status ?? null,
      body: p.injury_body_part ?? null,
      practice: sleeperPractice(p.practice_participation),
      news: fin(Number(p.news_updated)) ? Number(p.news_updated) : null,
      depth: p.depth_chart_position ? `${p.depth_chart_position}${p.depth_chart_order ?? ''}` : null,
    });
  }
  return out;
}

// Whether the day's pull is due: none kept, one from another UTC day once the hour's reached, or one too old
export function sleeperDue(kept, now = new Date()) {
  const at = Date.parse(kept?.at ?? '');
  if (!fin(at)) return true;
  if (now.getTime() - at > SLEEPER_MAX_AGE_H * 36e5) return true;
  return iso(at).slice(0, 10) !== iso(now).slice(0, 10) && now.getUTCHours() >= SLEEPER_HOUR;
}

// The sport's dump as kept, pulled again when due: { at, rows, pulled } or null (no sport of Sleeper's, or none
// ever had). A failed pull keeps the last one
export async function sleeperPlayers(sport, { now = new Date(), fetchJson = get, file = sleeperCache(sport), log = console } = {}) {
  if (!SLEEPER_SPORTS.has(sport)) return null;
  const kept = readJson(file, null);
  if (!sleeperDue(kept, now)) return { ...kept, pulled: false };
  const body = await fetchJson(`${SLEEPER_API}/players/${sport}`).catch(() => null);
  const rows = body ? compactSleeper(sport, body) : [];
  if (!rows.length) {
    log.warn?.(`${sport}: Sleeper's players not pulled${kept ? `, the one from ${kept.at} kept` : ''}`);
    return kept ? { ...kept, pulled: false } : null;
  }
  const out = { at: iso(now), rows };
  writeAtomic(file, JSON.stringify(out));
  return { ...out, pulled: true };
}

// The curated handles of a sport (news-handles.json)
export function handlesOf(sport, file = handlesFile) {
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'));
    return (o?.sports?.[sport] ?? []).filter((h) => h?.handle);
  } catch {
    return [];
  }
}

// (a post worth the classifier: names an injury, a status or a role)
export const POST_RELEVANT = /\b(out|ruled out|questionable|doubtful|probable|inactive|injur\w*|DNP|did not practice|limited|full participant|IR\b|injured reserve|sidelined|day-to-day|game-time|scratch\w*|lineup|starting|start\w*|benched|return\w*|activated|cleared|will play|won't play|miss\w*|week-to-week|concussion|hamstring|ankle|knee|groin|calf|shoulder|illness|suspend\w*|minutes restriction)\b/i;

// One feed's page of posts (app.bsky.feed.getAuthorFeed, public, no auth): { uri, handle, at, text }, the
// author's own (no reposts), newest first
export async function authorPosts(handle, { fetchJson = get, limit = 50, cursor = null } = {}) {
  const url = `${BSKY_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${limit}&filter=posts_no_replies${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const body = await fetchJson(url).catch(() => null);
  const posts = [];
  for (const f of body?.feed ?? []) {
    if (f?.reason) continue;
    const rec = f?.post?.record;
    const at = Date.parse(rec?.createdAt ?? '');
    if (!f.post?.uri || !fin(at) || typeof rec?.text !== 'string') continue;
    const ext = f.post.embed?.external?.title ?? '';
    posts.push({ uri: f.post.uri, handle, at: iso(at), text: `${rec.text}${ext && !rec.text.includes(ext) ? ` [${ext}]` : ''}`.slice(0, 600) });
  }
  return { posts, cursor: body?.cursor ?? null, ok: !!body };
}

// The claims as the bettor reads them (news-fast.json), those of KEEP days; [] with none or one unreadable
export function readClaims(sport, file = fastFile(sport)) {
  if (!existsSync(file)) return [];
  try {
    const o = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(o?.claims) ? o.claims : [];
  } catch {
    return [];
  }
}

// The candidates for one side of a game: Sleeper's rows on the team with a status, and the claims naming the team
// (or no team: matched by name on the side's roster below), each at its own time, posted inside the game's LOOK_H
// and not after now (no look-ahead)
export function candidatesFor(sport, game, side, { sleeper = null, claims = [], now = Date.now() } = {}) {
  const abbr = espnAbbr(sport, side === 'home' ? game.homeAbbr : game.awayAbbr);
  const start = Date.parse(game.date);
  const from = start - (LOOK_H[sport] ?? 30) * 36e5;
  const inside = (t) => fin(t) && t >= from && t <= now && t < start;
  const out = [];
  for (const p of sleeper?.rows ?? []) {
    if (p.team !== abbr || !p.status || !inside(p.news)) continue;
    out.push({ source: 'sleeper', name: p.name, key: p.key, espn: p.espn, status: p.status, at: p.news, seen: Date.parse(sleeper.at) || now, why: `Sleeper: ${p.raw}${p.body ? ` (${p.body})` : ''}` });
  }
  for (const c of claims ?? []) {
    const t = Date.parse(c.at ?? '');
    if (!c.player || !FAST_WORD[c.status] || !(c.confidence >= MIN_CLAIM_CONF) || !inside(t)) continue;
    if (c.team && espnAbbr(sport, c.team) !== abbr) continue;
    out.push({ source: 'bluesky', name: c.player, key: nameKey(c.player), espn: null, status: c.status === 'limited' ? 'questionable' : c.status, at: t, seen: Date.parse(c.seen ?? '') || t, why: `@${c.handle}: ${String(c.text ?? '').slice(0, 120)}`, anyTeam: !c.team });
  }
  // (a player's latest word wins: a later post or update stands over an earlier one)
  const latest = new Map();
  for (const c of out.sort((a, b) => a.at - b.at)) latest.set(c.key, c);
  return [...latest.values()];
}

// The fast entries into each coming game's report copy (see above); returns the ones put in. rosterOf(team): the
// side's ESPN roster (espn.mjs rosterOf: ids with info), null when it can't be had
export async function fastNotes(sport, live, upcoming, { sleeper = null, claims = [], now = Date.now(), rosterOf = async () => null } = {}) {
  const applied = [];
  for (const { game } of upcoming ?? []) {
    const l = live?.get(game.id);
    if (!l || l.injuriesFailed || !(Date.parse(game.date) > now)) continue;
    for (const side of ['home', 'away']) {
      const team = String(side === 'home' ? game.home : game.away);
      const cands = candidatesFor(sport, game, side, { sleeper, claims, now });
      if (!cands.length) continue;
      const report = l.injuries instanceof Map ? l.injuries : new Map();
      const roster = await rosterOf(team).catch(() => null);
      for (const c of cands) {
        // (his ESPN id: the dump's, else his name on the side's roster; a claim with no team must be on it)
        let id = c.espn && (!roster || roster.has(c.espn)) ? c.espn : null;
        let name = c.name;
        let pos = '';
        if (!id && roster?.info) {
          for (const [pid, x] of roster.info) {
            if (nameKey(x?.name) === c.key) {
              id = String(pid);
              name = x.name || name;
              pos = x.pos ?? '';
              break;
            }
          }
        }
        if (!id) continue;
        const list = report.get(team) ?? [];
        const official = list.find((p) => !p.from && String(p.id) === id);
        const other = list.find((p) => p.from && String(p.id) === id);
        if (other) continue;
        if (official) {
          if (severityOf(official.status) >= severityOf(c.status)) continue;
          const dated = Date.parse(official.date ?? '');
          if (fin(dated) && dated >= c.at) continue;
        }
        const mine = new Map(l.injuries instanceof Map ? l.injuries : []);
        mine.set(team, [...(mine.get(team) ?? []).filter((p) => String(p.id) !== id), { id, name: official?.name || name, pos: official?.pos || pos, status: FAST_WORD[c.status], from: c.source, date: iso(c.at) }]);
        l.injuries = mine;
        const one = { event: String(game.id), team, player: id, name: official?.name || name, status: c.status, was: official?.status ?? null, source: c.source, at: iso(c.at), seen: iso(c.seen), why: c.why };
        l.fastNews = [...(l.fastNews ?? []), one];
        applied.push(one);
      }
    }
  }
  return applied;
}

// The fast news on a side of a game posted FRESH_H hours ago at most (the timing's newsIn): its entries, newest first
export function fastFor(live, team, now = Date.now()) {
  return (live?.fastNews ?? []).filter((x) => String(x.team) === String(team) && now - Date.parse(x.at) <= FRESH_H * 36e5).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// Whether the early fast-news bets have earned their stake: FAST_EARN_N graded ones since the epoch with a close,
// their mean CLV (the close's chance at the bet's price less the bet's no-vig) above 0
export function fastEarned(bets, { epoch = null } = {}) {
  const graded = (bets ?? []).filter((b) => b?.early?.fast && !b.void && fin(b.clv?.q) && fin(b.fair) && (!epoch || Date.parse(b.placedAt) >= Date.parse(epoch)));
  if (graded.length < FAST_EARN_N) return { earned: false, n: graded.length };
  const clv = graded.reduce((t, b) => t + (b.clv.q - b.fair), 0) / graded.length;
  return { earned: clv > 0, n: graded.length, clv: Math.round(clv * 1e4) / 1e4 };
}

// The NFL's practice by ESPN id with Sleeper's filling the players nflverse's file has none for (its news inside
// the game's week, before now): a Map, the given one's entries first. rosters: a Map of ESPN team abbreviation ->
// the side's ESPN roster (espn.mjs rosterOf), his ESPN id by the dump's, else by his name there
export function withSleeperPractice(practice, sleeper, game, { now = Date.now(), rosters = null } = {}) {
  const out = new Map(practice ?? []);
  const start = Date.parse(game?.date ?? '');
  if (!sleeper?.rows || !fin(start)) return out;
  const teams = new Set([espnAbbr('nfl', game.homeAbbr), espnAbbr('nfl', game.awayAbbr)]);
  const byName = new Map();
  for (const [abbr, ids] of rosters instanceof Map ? rosters : []) for (const [pid, x] of ids?.info ?? []) byName.set(`${espnAbbr('nfl', abbr)}|${nameKey(x?.name)}`, String(pid));
  for (const p of sleeper.rows) {
    if (!p.practice || !teams.has(p.team) || !fin(p.news) || p.news > now || p.news < start - 7 * 864e5) continue;
    const id = p.espn ?? byName.get(`${p.team}|${p.key}`) ?? null;
    if (id && !out.has(String(id))) out.set(String(id), p.practice);
  }
  return out;
}

// The speed log: each coming game's listed players (a status of out or questionable class) by source, the run's
// time each was first seen there and the source's own time. log: { entries: { key: entry } }; key game|name|class
export function speedUpdate(log, sport, { upcoming = [], live = null, sleeper = null, claims = [], now = Date.now() } = {}) {
  const entries = { ...(log?.entries ?? {}) };
  const cls = (s) => (severityOf(s) >= 2 ? 'out' : severityOf(s) === 1 ? 'q' : null);
  const put = (game, side, name, status, source, own, seen = now, extra = {}, athlete = null) => {
    const c = cls(status);
    if (!c || !name) return;
    const team = side === 'home' ? game.home : game.away;
    const key = `${game.id}|${nameKey(name)}|${c}`;
    const e = entries[key] ?? { game: String(game.id), start: game.date, team: String(team), name, status: c };
    if (athlete && !e.athlete) e.athlete = String(athlete);
    if (!e[source]) e[source] = { seen: iso(Math.min(seen, now)), own: fin(own) ? iso(own) : null, ...extra };
    entries[key] = e;
  };
  for (const { game } of upcoming ?? []) {
    const start = Date.parse(game.date);
    if (!(start > now)) continue;
    const l = live?.get(game.id);
    for (const side of ['home', 'away']) {
      const team = String(side === 'home' ? game.home : game.away);
      for (const p of (l?.injuries instanceof Map ? l.injuries.get(team) : null) ?? []) if (!p.from) put(game, side, p.name, p.status, 'espn', Date.parse(p.date ?? ''), now, {}, p.id);
      for (const c of candidatesFor(sport, game, side, { sleeper, claims, now })) put(game, side, c.name, c.status, c.source, c.at, c.seen, c.source === 'bluesky' ? { why: c.why.slice(0, 80) } : {}, c.espn);
    }
  }
  const keepFrom = now - SPEED_KEEP_DAYS * 864e5;
  return { sport, entries: Object.fromEntries(Object.entries(entries).filter(([, e]) => Date.parse(e.start) >= keepFrom)) };
}
