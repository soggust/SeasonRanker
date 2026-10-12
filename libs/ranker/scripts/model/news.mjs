// The teams' news (ESPN's free per-team feed, the site API's news?team=): a coaching or role change the logs
// can't see yet. A story whose headline says a team's play-calling, a coordinator or its head coach changed
// (play-calling, a play-caller, an offensive or defensive coordinator, fired, interim, a head coach named or
// out, benched, takes over a role) flags that team's unit (offense, defense, or the whole team) for its next
// games: the book reprices that on the news, the model only once the logs catch up.
//
//   read     once a UTC day a team (the cache, .cache/model/news-<sport>.json: the workflow's, as the rest;
//            each team's flagged stories kept by id NEWS_DAYS days, so one that falls off ESPN's 50 latest
//            still counts), every team of the league, 4 at a time; the NFL's on every keyword, the other
//            sports' on a head coach's (or a manager's) change alone. A team whose feed fails keeps what was
//            read before; never read, no flags: quietly, the desk as it was
//   whose    a story counts for a team only where ESPN tags it to two teams at most (a league-wide piece names
//            everyone) and its headline or summary names the team (its nickname); its kind HeadlineNews or
//            Story (a recap, a preview or a video says what happened, not what changed). The keyword is read
//            in the headline alone (a summary's words wander)
//   unit     defense where the headline says defensive (a defensive coordinator, the defense's play-calling,
//            a defender benched), the team where it's the head coach fired, interim or named; else offense
//   when     a story's unit flagged for the team's next NEWS_GAMES games (2): its games after the story
//            counted from the first story of the episode (a story with fewer than NEWS_GAMES games of the team
//            since the last one on the same unit is the same news, still: a "returns to play-calling" piece
//            after the game doesn't start the count again), NEWS_DAYS (21) at most
//   applied  (newsFlags) each coming game's flags on its live facts (news: [{ team, unit, headline, at, id,
//            from }]): its props of a flagged unit's players held as CHECKs (props.mjs, cause 'news', the
//            headline its reason, either side: the news can move him either way), its game lines' stakes cut to
//            the minimum (run.mjs, a flag), and its inputs (timing.mjs inputsOf: news:h, news:a) so an open bet
//            on it is priced again once a story lands. An owner's note with no player, reason news or other, on
//            a team (notes.mjs applyNotes) flags that team the same way for its game

import path from 'node:path';
import { CACHE, DAY, get, isoDay, pool, readJson, writeJson } from './sources.mjs';
import { teamNames } from './espn.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
export const NEWS_GAMES = 2;
export const NEWS_DAYS = 21;
// (the feed's kinds read: the news and the stories; not a recap, a preview or a video)
const KINDS = new Set(['HeadlineNews', 'Story']);
// (a story tagged to more teams than this is a league-wide piece)
const MAX_TEAMS = 2;
export const UNITS = ['offense', 'defense', 'team'];

const fileOf = (sport) => path.join(CACHE, `news-${sport}.json`);

// (the words: a change of who calls the plays, coaches, or plays)
const PLAYCALL = /\bplay[- ]?call(?:ing|er|ers|s)?\b/i;
const COORD_O = /\boffensive coordinator\b|\bOC\b/;
const COORD_D = /\bdefensive coordinator\b|\bDC\b/;
const HEAD = /\bhead coach\b|\bcoach\b|\bmanager\b/i;
const FIRED = /\bfire[sd]?\b|\bfiring\b|\binterim\b|\bdismiss(?:ed|es)?\b|\bparts? ways\b/i;
const CHANGE = /\bnam(?:ed|es)\b|\bhir(?:ed|es|ing)\b|\bpromot\w*|\b(?:takes?|taking|took) over\b|\bstrip(?:ped|s)?\b|\bdemot\w*|\breplac\w*|\blos(?:e|es|ing) (?:play|duties|job)\w*|\bout as\b|\bresign\w*|\bsteps? down\b|\bstepping down\b/i;
const BENCHED = /\bbench(?:ed|es|ing)\b/i;
const TAKES = /\b(?:takes?|taking|took) over\b/i;
const ROLE = /\b(?:starter|starting|QB1|quarterback|QB|play[- ]?call\w*|coach\w*|coordinator|offense|defense|signal[- ]?call\w*)\b/i;
// (talk of a change, not one: a call for it, a question, the hot seat)
const TALK = /\bcalls? for\b|\bhot seat\b|\bshould\b|\bcould\b|\bwould\b|\bif\b|\?\s*$/i;
const DEFENSE = /\bdefens\w*|\bDC\b|\bcornerback\b|\bCB\b|\bsafety\b|\blinebacker\b|\bpass rusher\b/i;

// What a headline flags: 'offense', 'defense', 'team' or null. sport: the NFL's every keyword; the others'
// a head coach's (a manager's) change alone
export function unitOf(sport, headline) {
  const h = String(headline ?? '');
  if (!h || TALK.test(h)) return null;
  const coordO = COORD_O.test(h);
  const coordD = COORD_D.test(h);
  const coord = coordO || coordD ? (coordD && !coordO ? 'defense' : 'offense') : null;
  // (a firing or an interim: a coordinator's unit, else the team's where a coach is named)
  if (FIRED.test(h)) {
    if (coord && sport === 'nfl') return coord;
    if (HEAD.test(h)) return 'team';
    return null;
  }
  // (a head coach named, hired, out, replaced)
  if (/\bhead coach\b|\bmanager\b/i.test(h) && CHANGE.test(h) && !coord) return 'team';
  if (sport !== 'nfl') return null;
  if (PLAYCALL.test(h)) return DEFENSE.test(h) ? 'defense' : 'offense';
  if (coord && CHANGE.test(h)) return coord;
  if (BENCHED.test(h)) return DEFENSE.test(h) ? 'defense' : 'offense';
  if (TAKES.test(h) && ROLE.test(h)) return DEFENSE.test(h) ? 'defense' : 'offense';
  return null;
}

// (a story's teams, by ESPN's tags)
const teamsOf = (a) => [...new Set((a?.categories ?? []).filter((c) => c?.type === 'team').map((c) => String(c.teamId ?? c.team?.id ?? '')).filter(Boolean))];

// A story as a flag for team (ESPN's { id, nick, name }), or null: its kind, its tags (the team's among two at
// most), the team named in its headline or summary, a flagging headline
export function storyOf(sport, a, team) {
  if (!a || !KINDS.has(a.type)) return null;
  const tags = teamsOf(a);
  if (!tags.includes(String(team.id)) || tags.length > MAX_TEAMS) return null;
  const text = `${a.headline ?? ''} ${a.description ?? ''}`;
  const names = [team.nick, team.name].filter((x) => typeof x === 'string' && x.length >= 3);
  if (names.length && !names.some((n) => text.toLowerCase().includes(n.toLowerCase()))) return null;
  const unit = unitOf(sport, a.headline);
  const at = Date.parse(a.published ?? a.lastModified ?? '');
  if (!unit || !Number.isFinite(at)) return null;
  return { id: String(a.id ?? a.dataSourceIdentifier ?? `${at}:${a.headline}`), unit, headline: String(a.headline).slice(0, 200), at: new Date(at).toISOString() };
}

// Every team's flagged stories (team id -> [story]), the cache's brought up to date: a team not read today
// asked again (its stories merged in by id, the ones older than NEWS_DAYS dropped). null where nothing was ever
// read. teams: ESPN's ({ id, nick, name }), else the league's asked for; fetchImpl: a URL's JSON (a test's)
export async function readNews(sport, cfg, { now = new Date(), teams = null, file = fileOf(sport), fetchJson = get, log = console } = {}) {
  try {
    const cache = readJson(file, null) ?? { teams: {} };
    cache.teams ??= {};
    const list = teams ?? (await teamNames(cfg.league).catch(() => []));
    const today = isoDay(now);
    const stale = list.filter((t) => cache.teams[t.id]?.day !== today);
    let read = 0;
    await pool(stale, 4, async (t) => {
      const body = await fetchJson(`${ESPN}/${cfg.league}/news?team=${t.id}&limit=50`);
      if (!Array.isArray(body?.articles)) return;
      const kept = new Map((cache.teams[t.id]?.stories ?? []).map((s) => [s.id, s]));
      for (const a of body.articles) {
        const s = storyOf(sport, a, t);
        if (s) kept.set(s.id, s);
      }
      cache.teams[t.id] = { day: today, stories: [...kept.values()] };
      read++;
    });
    // (the stories too old to count, gone)
    for (const v of Object.values(cache.teams)) v.stories = (v.stories ?? []).filter((s) => now.getTime() - Date.parse(s.at) <= NEWS_DAYS * DAY);
    if (stale.length) writeJson(file, cache);
    if (stale.length && !read) log.warn?.(`${sport}: teams' news not read (${stale.length} feeds failed)`);
    if (!Object.keys(cache.teams).length) return null;
    return new Map(Object.entries(cache.teams).map(([id, v]) => [String(id), v.stories ?? []]));
  } catch (err) {
    log.warn?.(`${sport}: teams' news not read (${String(err?.message ?? err).slice(0, 120)})`);
    return null;
  }
}

// (a team's games' starts, every one the history and the coming games hold, in order)
function startsOf(games) {
  const by = new Map();
  for (const g of games) {
    const t = Date.parse(g.date);
    if (!Number.isFinite(t)) continue;
    for (const id of [g.home, g.away]) {
      const k = String(id);
      if (!by.has(k)) by.set(k, new Map());
      by.get(k).set(String(g.id), t);
    }
  }
  return new Map([...by].map(([k, m]) => [k, [...m.values()].sort((a, b) => a - b)]));
}

// The flags in force for a team's game starting at start: each unit's episode (its stories, a new one only
// after NEWS_GAMES games of the team without one) whose first story came before the game with fewer than
// NEWS_GAMES of the team's games between them, NEWS_DAYS at most. The latest story of each its headline
export function flagsFor(stories, starts, start) {
  const out = [];
  const between = (a, b) => starts.filter((t) => t > a && t < b).length;
  for (const unit of UNITS) {
    const mine = (stories ?? []).filter((s) => s.unit === unit && Date.parse(s.at) < start).sort((a, b) => a.at.localeCompare(b.at));
    if (!mine.length) continue;
    let first = mine[0];
    for (let i = 1; i < mine.length; i++) if (between(Date.parse(mine[i - 1].at), Date.parse(mine[i].at)) >= NEWS_GAMES) first = mine[i];
    const t0 = Date.parse(first.at);
    if (start - t0 > NEWS_DAYS * DAY || between(t0, start) >= NEWS_GAMES) continue;
    const last = mine[mine.length - 1];
    out.push({ unit, headline: last.headline, at: last.at, id: last.id, since: first.at });
  }
  return out;
}

// Each coming game's flags put on its live facts (l.news: [{ team, unit, headline, at, id, from: 'espn' }]);
// news: readNews's (null: none, the desk as it was). history and upcoming ({ game }): the games counted
export function newsFlags(news, live, history, upcoming) {
  let n = 0;
  if (!news || !live) return n;
  const starts = startsOf([...(history ?? []), ...(upcoming ?? []).map((u) => u.game)]);
  for (const { game } of upcoming ?? []) {
    const l = live.get(game.id);
    if (!l) continue;
    const start = Date.parse(game.date);
    for (const team of [String(game.home), String(game.away)]) {
      for (const f of flagsFor(news.get(team), starts.get(team) ?? [], start)) {
        l.news = [...(l.news ?? []).filter((x) => !(x.team === team && x.unit === f.unit)), { team, ...f, from: 'espn' }];
        n++;
      }
    }
  }
  return n;
}

// (a player's unit by his position: the NFL's defenders and the rest; another sport's every player the team's)
const DEF_POS = /^(DE|DT|NT|DL|LB|ILB|OLB|MLB|CB|S|FS|SS|DB|EDGE)$/;
export const unitOfPos = (sport, pos) => (sport !== 'nfl' ? 'team' : DEF_POS.test(String(pos ?? '')) ? 'defense' : 'offense');

// The flag on a player's unit for his game, or null: his team's for his unit, or for the whole team
export function newsOn(sport, live, team, pos) {
  const mine = (live?.news ?? []).filter((x) => x.team === String(team));
  const unit = unitOfPos(sport, pos);
  return mine.find((x) => x.unit === unit) ?? mine.find((x) => x.unit === 'team' || unit === 'team') ?? null;
}

// (a game's flags as words for its lines: "news: DEN offense: Sean Payton says he's taking over playcalling")
export const newsWords = (l, abbrOf = (t) => t) => (l?.news ?? []).map((x) => `news (${abbrOf(x.team)} ${x.unit}): ${x.headline}`);

// (a game's flags as one of its inputs a side: each flag's unit and story, sorted; '' none)
export const newsPart = (l, team) => (l?.news ?? []).filter((x) => x.team === String(team)).map((x) => `${x.unit}:${x.id}`).sort().join(',');
