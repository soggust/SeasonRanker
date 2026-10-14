// The teams' news (ESPN's free per-team feed, the site API's news?team=): a coaching or role change the logs
// can't see yet. A story whose headline says a team's play-calling, a coordinator or its head coach changed
// (play-calling, a play-caller, an offensive or defensive coordinator, fired, interim, a head coach named or
// out, benched, takes over a role) flags that team's unit (offense, defense, or the whole team) for its next
// games: the book reprices that on the news, the model only once the logs catch up.
//
//   read     once a UTC day a team, and a team with a game within SOON_HOURS (36) every REREAD_HOURS (3), so
//            a game day's change is seen before its kickoff (the cache, .cache/model/news-<sport>.json: the
//            workflow's, as the rest; each team's flagged stories kept by id while its unit's latest is
//            NEWS_DAYS old or less, NEWS_KEEP (90) at most, so one that falls off ESPN's 50 latest still
//            counts and an episode keeps its first story; each read again by today's words, so a rule fixed
//            unflags what it no longer reads), every team of the league, 4 at a time; the NFL's on every
//            keyword, the other sports' on a head coach's (or a manager's) change alone. A team whose feed
//            fails keeps what was read before; never read, no flags: quietly, the desk as it was (no cache
//            before, logged: a story already off the 50 latest is lost)
//   whose    a story counts for a team only where ESPN tags it to two teams at most (a league-wide piece names
//            everyone) and its headline or summary names the team (its nickname); its kind HeadlineNews or
//            Story (a recap, a preview or a video says what happened, not what changed). The keyword is read
//            in the headline alone (a summary's words wander)
//   unit     defense where the headline says defensive (a defensive coordinator, the defense's play-calling,
//            a defender benched), the team where it's the head coach fired, interim or named (a coordinator
//            made interim head coach the team's too; "Raiders fire Pete Carroll", no role named, the head
//            coach's); else offense. Not: talk or a denial ("not playcalling", "not benched", won't, denies),
//            fire's other senses (on fire, fired up, fires back), a position coach, an assistant or the front
//            office fired, the play-calling mentioned with no verb of change by it (its praise, its critics)
//   when     a story's unit flagged for the team's next NEWS_GAMES games (2): its games after the story
//            counted from the first story of the episode (a story with fewer than NEWS_GAMES games of the team
//            since the last one on the same unit is the same news, still: a "returns to play-calling" piece
//            after the game doesn't start the count again), NEWS_DAYS (21) at most
//   applied  (newsFlags) each coming game's flags on its live facts (news: [{ team, unit, headline, at, id,
//            from }]): its props of a flagged unit's players held as CHECKs (props.mjs, cause 'news', the
//            headline its reason, either side: the news can move him either way), its game lines' stakes cut to
//            the minimum (run.mjs, a flag), and its inputs (timing.mjs inputsOf: news:h, news:a) so an open bet
//            on it is priced again once a story lands. An owner's note with no player, reason news, on a team
//            (notes.mjs teamNotes) flags that team the same way for its game

import path from 'node:path';
import { CACHE, DAY, get, isoDay, pool, readJson, writeJson } from './sources.mjs';
import { teamNames } from './espn.mjs';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
export const NEWS_GAMES = 2;
export const NEWS_DAYS = 21;
// (a unit's stories kept no longer than this, its episode's however long; a team with a game within SOON_HOURS
// read again every REREAD_HOURS)
export const NEWS_KEEP = 90;
export const SOON_HOURS = 36;
export const REREAD_HOURS = 3;
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
// (a head coach, a manager; not a general manager)
const HEAD = /\bhead coach\b|(?<!\bgeneral )\bmanager\b/i;
// (a position's coach, an assistant: not the team's head coach, nor a coordinator)
const POS_COACH = /\b(?:line|linebackers?|receivers?|quarterbacks?|QBs?|running backs?|RBs?|tight ends?|secondary|backs?|special teams|position|assistant|associate|pitching|hitting|bullpen|base|bench|strength|conditioning|goalie|goaltending|skills|passing game|run game)\s+coach(?:es)?\b/i;
// (the front office's: a firing of theirs changes no one on the field)
const FRONT = /\bgeneral manager\b|\bGM\b|\bpresident\b|\bexecutive\b|\bowner\b|\bscout\w*|\btrainer\b|\bdoctor\b/i;
// (fire's other senses, taken out before anything's read: on fire, under fire, fired up, fires back)
const IDIOM = /\bon fire\b|\bunder fire\b|\b(?:catch(?:es|ing)?|caught) fire\b|\bfire[sd]?[- ](?:back|up|away)\b|\bfiring (?:back|away|on)\b/gi;
const FIRE_ACT = /\bfire[sd]?\b|\bfiring\b|\bous(?:t|ts|ted)\b/i;
const FIRED = /\bfire[sd]?\b|\bfiring\b|\bous(?:t|ts|ted)\b|\binterim\b|\bdismiss(?:ed|es)?\b|\bparts? ways\b/i;
const CHANGE = /\bnam(?:e|ed|es|ing)\b|\bhir(?:e|ed|es|ing)\b|\bpromot\w*|\b(?:takes?|taking|took) over\b|\bstrip(?:ped|s)?\b|\bdemot\w*|\breplac\w*|\blos(?:e|es|ing) (?:play|duties|job)\w*|\bout as\b|\bresign\w*|\bsteps? down\b|\bstepping down\b/i;
// (a change of who calls the plays, by the play-calling's words: a bare mention (its praise, its critics) none)
const PC_CHANGE = /\bhand(?:s|ed|ing)?(?: \w+){0,3} (?:over|off|back|to)\b|\bgiv(?:e|es|ing) up\b|\bgave up\b|\brelinquish\w*|\breturn(?:s|ed|ing)? to\b|\bchang(?:e|es|ed|ing)\b|\bswitch(?:es|ed|ing)?\b|\bshake-?up\b|\bwill (?:now )?call\b|\bcall(?:s|ing)? (?:the )?plays\b|\bexpand(?:s|ed|ing)? (?:his |her |the )?role\b|\bnew play[- ]?caller\b/i;
// (a benching: the word, or the verb on a name, a starter or a QB; the bench as a place, a coach or a press not)
const BENCHED = /\bbench(?:ed|es|ing)\b/i;
const BENCH = /(?<!\b(?:the|from|off|on|a|his|their|of|to) )\b[Bb]ench (?:[A-Z]|QB|quarterback|starter|the starter|starting)/;
// (a starter named, gone with, turned to)
const STARTER = /\b(?:nam(?:e|ed|es|ing)|go(?:es|ing)? with|turn(?:s|ed|ing)? to)\b.*\b(?:starter|starting (?:QB|quarterback)|QB1)\b/i;
const TAKES = /\b(?:takes?|taking|took) over\b/i;
const ROLE = /\b(?:starter|starting|QB1|quarterback|QB|play[- ]?call\w*|coach\w*|coordinator|offense|defense|signal[- ]?call\w*)\b/i;
// (talk of a change, not one: a call for it, a question, the hot seat, a maybe)
const TALK = /\bcalls? for\b|\bhot seat\b|\bshould\b|\bcould\b|\bwould\b|\bif\b|\bmight\b|\bconsider(?:s|ed|ing)?\b|\bweigh(?:s|ing)\b|\bopen to\b|\?\s*$/i;
// (a denial: no change, not the play-calling, not benched, won't, rules it out)
const DENY = /\bden(?:y|ies|ied|ying)\b|\bwon['\u2019]t\b|\bwill not\b|\bno plans?\b|\bno change\b|\bnot (?:be |being |getting |a |expected to |going to )?(?:play[- ]?call\w*|bench\w*|fir\w*|replac\w*|chang\w*|tak\w* over|demot\w*|happening|expected|the (?:issue|problem))|\brules? out\b|\bshoots? down\b|\bdismiss(?:es|ed)? (?:talk|reports?|rumou?rs?|idea|speculation)\b/i;
const DEFENSE = /\bdefens\w*|\bDC\b|\bcornerback\b|\bCB\b|\bsafety\b|\blinebacker\b|\bpass rusher\b/i;
const sideOf = (h) => (DEFENSE.test(h) ? 'defense' : 'offense');

// What a headline flags: 'offense', 'defense', 'team' or null. sport: the NFL's every keyword; the others'
// a head coach's (a manager's) change alone. Read in order: talk or a denial none (fire's other senses taken
// out first); a firing or an interim the head coach's first (the team's: a coordinator made interim head coach
// too), else a coordinator's unit, a position coach's, an assistant's or the staff's none, a firing with no
// role named ("Raiders fire Pete Carroll", ESPN's usual words) the head coach's, the front office's none; then
// the play-calling changed (a verb of change by it: a mention alone none), a head coach named or out, a
// coordinator's change, a benching, a starter named, a takeover of a role
export function unitOf(sport, headline) {
  const raw = String(headline ?? '');
  if (!raw || TALK.test(raw) || DENY.test(raw)) return null;
  const h = raw.replace(IDIOM, ' ');
  const nfl = sport === 'nfl';
  const coordO = COORD_O.test(h);
  const coordD = COORD_D.test(h);
  const coord = coordO || coordD ? (coordD && !coordO ? 'defense' : 'offense') : null;
  const pos = POS_COACH.test(h);
  const change = CHANGE.test(h);
  if (FIRED.test(h)) {
    if (HEAD.test(h) || (/\b[Cc]oach [A-Z]/.test(h) && !pos)) return 'team';
    if (coord) return nfl ? coord : null;
    if (pos || /\bcoach(?:es|ing)?\b|\bcoordinator\b|\bstaff\b/i.test(h)) return null;
    if (FIRE_ACT.test(h) && !FRONT.test(h)) return 'team';
  }
  if (!nfl) return HEAD.test(h) && change ? 'team' : null;
  if (PLAYCALL.test(h) && (change || PC_CHANGE.test(h))) return sideOf(h);
  if (HEAD.test(h) && change) return 'team';
  if (coord && change) return coord;
  if (BENCHED.test(h) || BENCH.test(h)) return sideOf(h);
  if (STARTER.test(h)) return sideOf(h);
  if (TAKES.test(h) && ROLE.test(h)) return sideOf(h);
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

// A story as the news signals read it (news-signals.mjs), or null: the same kinds, tags and team naming as a
// flag's (storyOf), whatever its headline says: { id, headline, summary, at, teams (ESPN's ids), athletes ([{ id,
// name }], ESPN's tags) }
export function teamStoryOf(a, team) {
  if (!a || !KINDS.has(a.type)) return null;
  const tags = teamsOf(a);
  if (!tags.includes(String(team.id)) || tags.length > MAX_TEAMS) return null;
  const text = `${a.headline ?? ''} ${a.description ?? ''}`;
  const names = [team.nick, team.name].filter((x) => typeof x === 'string' && x.length >= 3);
  if (names.length && !names.some((n) => text.toLowerCase().includes(n.toLowerCase()))) return null;
  const at = Date.parse(a.published ?? a.lastModified ?? '');
  if (!a.headline || !Number.isFinite(at)) return null;
  const athletes = (a.categories ?? [])
    .filter((c) => c?.type === 'athlete')
    .map((c) => ({ id: String(c.athleteId ?? c.athlete?.id ?? ''), name: String(c.description ?? c.athlete?.description ?? '').slice(0, 80) }))
    .filter((x) => /^\d{1,12}$/.test(x.id) && x.name);
  return {
    id: String(a.id ?? a.dataSourceIdentifier ?? `${at}:${a.headline}`),
    headline: String(a.headline).replace(/\s+/g, ' ').slice(0, 200),
    summary: String(a.description ?? '').replace(/\s+/g, ' ').slice(0, 400),
    at: new Date(at).toISOString(),
    teams: tags,
    athletes: athletes.slice(0, 8),
  };
}

// Every team's flagged stories (team id -> [story]), the cache's brought up to date: a team not read today
// asked again, and one with a game within SOON_HOURS asked again every REREAD_HOURS (a game day's change, a
// play-caller's or a starter's that morning, seen before its kickoff); its stories merged in by id. A story the
// cache kept read again by today's words (its unit as unitOf says now: none, gone), and a unit's stories kept
// while its latest is NEWS_DAYS old or less (an episode's first story with them, so a long episode's count
// doesn't start again from a later one), NEWS_KEEP days at most. null where nothing was ever read; no cache
// before (a cold one), logged: a story already off ESPN's 50 latest is lost. teams: ESPN's ({ id, nick, name
// }), else the league's asked for; soon: the team ids with a game within SOON_HOURS; fetchJson: a URL's JSON
// (a test's)
export async function readNews(sport, cfg, { now = new Date(), teams = null, soon = null, file = fileOf(sport), fetchJson = get, log = console } = {}) {
  try {
    const prior = readJson(file, null);
    const cache = prior ?? { teams: {} };
    cache.teams ??= {};
    const list = teams ?? (await teamNames(cfg.league).catch(() => []));
    const today = isoDay(now);
    const t = now.getTime();
    const stale = list.filter((x) => {
      const c = cache.teams[x.id];
      if (c?.day !== today) return true;
      return !!soon?.has?.(String(x.id)) && !(t - Date.parse(c.readAt ?? '') < REREAD_HOURS * 3600e3);
    });
    if (!prior && list.length) log.log?.(`${sport}: teams' news: no cache before, read fresh (a story already off ESPN's 50 latest unseen)`);
    let read = 0;
    await pool(stale, 4, async (team) => {
      const body = await fetchJson(`${ESPN}/${cfg.league}/news?team=${team.id}&limit=50`);
      if (!Array.isArray(body?.articles)) return;
      const kept = new Map((cache.teams[team.id]?.stories ?? []).map((s) => [s.id, s]));
      for (const a of body.articles) {
        const s = storyOf(sport, a, team);
        if (s) kept.set(s.id, s);
      }
      cache.teams[team.id] = { day: today, readAt: now.toISOString(), stories: [...kept.values()] };
      read++;
    });
    let changed = false;
    for (const v of Object.values(cache.teams)) {
      const before = JSON.stringify(v.stories ?? []);
      v.stories = keepStories(sport, v.stories, t);
      if (JSON.stringify(v.stories) !== before) changed = true;
    }
    if (stale.length || changed) writeJson(file, cache);
    if (stale.length && !read) log.warn?.(`${sport}: teams' news not read (${stale.length} feeds failed)`);
    if (!Object.keys(cache.teams).length) return null;
    return new Map(Object.entries(cache.teams).map(([id, v]) => [String(id), v.stories ?? []]));
  } catch (err) {
    log.warn?.(`${sport}: teams' news not read (${String(err?.message ?? err).slice(0, 120)})`);
    return null;
  }
}

// (a team's stories as the cache keeps them: each read again by today's words (none: gone), a unit's kept while
// its latest is NEWS_DAYS old or less, NEWS_KEEP days at most)
export function keepStories(sport, stories, t) {
  const now = (stories ?? []).flatMap((s) => {
    const unit = unitOf(sport, s?.headline);
    const at = Date.parse(s?.at ?? '');
    return unit && Number.isFinite(at) && t - at <= NEWS_KEEP * DAY ? [unit === s.unit ? s : { ...s, unit }] : [];
  });
  const latest = new Map();
  for (const s of now) latest.set(s.unit, Math.max(latest.get(s.unit) ?? -Infinity, Date.parse(s.at)));
  return now.filter((s) => t - latest.get(s.unit) <= NEWS_DAYS * DAY);
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
