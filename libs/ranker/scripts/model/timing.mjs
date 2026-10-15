// The desk's timing (leagues.mjs TIMING): when a coming game's markets and props are bet, the news they wait
// for, and what each bet was priced on, so a bet whose inputs change before the start is priced again.
//
//   phaseOf      a game's phase for its lines or its props: early (before the window: nothing priced or bet),
//                open (in the window: bet once its news is in), last (inside the last chance: bet with whatever's
//                known, what's missing flagged, the minimum stake). The last chance is lastChance or, the runs
//                coming further apart than that (GitHub's hourly schedule runs hours late at times), 1.5 times
//                the recent gap between runs (cadenceOf), MAX_LAST hours at most: a game the next run would
//                likely see only after its start is bet now with what's known, not missed
//   cadenceOf    the median gap between the recent runs, in hours (run.mjs keeps their times in
//                .cache/model/runs.json); null with too few
//   newsMissing  the news a bet waits for that isn't in yet: the NHL's probable goalies (both: a skater's
//                projection weighs the other side's), MLB's probable starters (a game line both; a pitcher's
//                prop his own; a batter's the other side's) and posted lineups (a game line both: its platoon
//                terms read them; a batter's prop his own; a pitcher's the other side's: his strikeouts read it). The NFL and NBA wait for the window alone
//   inputsOf     a game's inputs as the bets on it were priced: each side's injury report (out, doubtful, on
//                IR or suspended; and questionable or day-to-day), the NFL's starting quarterbacks, the NHL's
//                probable goalies (and whether confirmed), MLB's probable starters and lineups, the NFL's and
//                NBA's posted inactives (a listed player ruled inactive counted out in the out list, as the game
//                lines read him; a regular the report doesn't list in his own part, ina: putInactives) and the
//                NBA's posted starting five where it isn't the usual one (st). Each part's text, and a short hash
//                of it a bet keeps (ledger: inputs); a part that couldn't be read this run (its source failed) is
//                null, never taken for a change
//   propAsk      why The Odds API is asked for a game's props this run: its first ask, owed (its props taken
//                back and its board unpriced: the NFL's), near the start; or not at all
//   lineupNow    each player's place now from the history's rows (his team, position, name; a regular: work in
//                two of his team's last four games; the NBA's usual starter: started half of them or more, the
//                five with the most starts at most, unknown where the rows have no start flag), with his team's
//                season in them and its games there (usualStarters, putInactives: read only from LINEUP_MIN
//                games of the game's own season, so an opener isn't read against last season's last weeks)
//   putInactives a game's posted inactives (context.mjs gather: espn.mjs gameRoster) put into its own copy of the
//                injury report as out (status 'Out (inactive)'): a listed player not already out (questionable,
//                day-to-day: his status kept as was), and, with the players (lineupNow), a regular the report
//                doesn't list. A healthy scratch with no work is left out (nothing of his to count, and no
//                news to price a bet again on)
//   inputChanges what changed between a bet's inputs and the game's now: a part that's moved to a new value
//                (or read now where it was unread when the bet was placed: news it was priced without), not one
//                that's gone blank (a goalie, a lineup dropped from a source doesn't un-name him: more likely the
//                source than the news; but an MLB starter gone to none named, StatsAPI read, is the scratch
//                itself and counts), not a side's whole injury list gone empty in one run (a partial report is
//                likelier than everyone healed: it counts once a second run agrees) and not one unread now. A
//                game line's bet doesn't read ina or st (the line's context reads neither: PROPS_ONLY), a prop's
//                does
//
// Not in the inputs (they'd churn, or a failed fetch would read as news): the weather's forecast, the flags
// (each starter's flag comes from the parts above), the rosters (a trade inside the window is rare)

import { createHash } from 'node:crypto';
import { TIMING } from './leagues.mjs';

const HOUR = 36e5;

// (the words for out and questionable, the props', the context's and the inputs' alike (one pattern, so they
// can't drift apart): ESPN's NBA and NHL reports say Day-To-Day where the NFL's says Questionable)
export const OUT_STATUS = /^out|doubtful|injured reserve|suspension/i;
export const Q_STATUS = /questionable|day-to-day|game-time/i;
const OUT = OUT_STATUS;
const QUESTIONABLE = Q_STATUS;

// (an open bet is priced again on news only this far ahead of its start (a run takes minutes, and a bet taken
// back that close might not be placed again in time); from then on it's locked, and the Bets page's picks are
// published then (picks.mjs), never earlier: a published pick is never one the news could still move)
export const REPRICE_BY = 20 * 60e3;
// (the most the last chance stretches to, in hours, however far apart the runs come)
export const MAX_LAST = 12;

// The median gap between the recent runs, in hours (times: their starts, ISO; the last 9, so 8 gaps), or null
// with fewer than 3
export function cadenceOf(times) {
  const t = (times ?? [])
    .map((x) => Date.parse(x))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .slice(-9);
  if (t.length < 3) return null;
  const gaps = t
    .slice(1)
    .map((x, i) => (x - t[i]) / HOUR)
    .sort((a, b) => a - b);
  const mid = gaps.length / 2;
  return gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2;
}

// (a sport's last chance, in hours: its own, or 1.5 times the runs' recent gap where that's longer, MAX_LAST at
// most)
export const lastChanceOf = (sport, gap = null) => Math.max(TIMING[sport]?.lastChance ?? 0, Math.min(MAX_LAST, Number.isFinite(gap) ? 1.5 * gap : 0));

// A game's phase for its lines or props, by the time till its start (ms); gap: the runs' recent gap, in hours
// (cadenceOf), which can stretch the last chance (and so the window)
export function phaseOf(sport, kind, until, gap = null) {
  const t = TIMING[sport];
  if (!t) return 'open';
  if (until <= lastChanceOf(sport, gap) * HOUR) return 'last';
  if (until <= t[kind] * HOUR) return 'open';
  return 'early';
}

// (the widest window, hours: how far ahead The Odds API is asked about)
export const reach = (sport) => Math.max(TIMING[sport]?.lines ?? 96, TIMING[sport]?.props ?? 96);

// A game's props ask whose run never landed: asked before (times), the book returning prop markets on it (dk:
// the markets it returned, the anytime touchdown's not counted), and yet the published board (the repo's, the last
// run that committed) shows none of its props, its board has no prices now and no prop bet of it is open. The
// asks are counted in the desk's cache, saved before the commit, so a run whose commit failed (2026-10-14's: the
// write-ups' tests) spent the ask and lost its prices, bets and tracked rows; with no prices of its own (the
// NFL's board) the game's props were then never priced again (SEA @ DEN, 2026-10-15: 57 priced at an assumed
// -110 all day, none tracked). Owed an ask again (propAsk's 'owed'), at most PROP_ASKS in all as any
export function lostAsk({ times, dk = [], markets = null, published = 0, boardPriced = false, open = 0 }) {
  if (!(times > 0) || boardPriced || open > 0 || published > 0) return false;
  return (dk ?? []).some((m) => (markets ? markets.includes(m) : true));
}

// Why The Odds API is asked for a game's props this run, or null: 'first' (never asked: its props are due),
// 'owed' (its props were taken back, on news or by --replace, and its board has no prices of its own (the
// NFL's): without a new ask they'd never be bet again; kept across runs till an ask succeeds), 'near' (within
// 2.5 hours of the start, once, with prop bets open or owed: their last line before the close). times: the
// asks so far; max: PROP_ASKS; until: ms to the start. A board with its own prices (NBA, NHL, MLB) prices its
// owed props on them, so its re-asks don't spend the allowance the NFL's first asks need
export function propAsk({ times, max, owed = false, boardPriced = false, nearAsked = false, until, open = 0 }) {
  if (times >= max) return null;
  if (times === 0) return 'first';
  if (owed && !boardPriced) return 'owed';
  if (!nearAsked && until < 2.5 * HOUR && (open > 0 || owed)) return 'near';
  return null;
}

// The news a game's bets still wait for: a list of what's missing ([] when it's in). kind: 'lines' or
// 'props'; for a prop, home (his side) and pitcher (an MLB pitcher's)
export function newsMissing(sport, live, { kind = 'lines', home = null, pitcher = false } = {}) {
  const out = [];
  const l = live ?? {};
  if (sport === 'nhl') {
    if (!l.home?.id || !l.away?.id) out.push('the probable goalies not listed');
  }
  if (sport === 'mlb') {
    const sp = [l.hp, l.ap];
    const lu = [l.lineups?.[0]?.length, l.lineups?.[1]?.length];
    if (kind === 'lines') {
      if (!sp[0] || !sp[1]) out.push('the starting pitchers not named');
      if (!lu[0] || !lu[1]) out.push('the lineups not posted');
    } else {
      const mine = home ? 0 : 1;
      if (pitcher && !sp[mine]) out.push('his start not announced');
      // (and a starter's the other side's lineup: his strikeouts read it, audit round C's lineupK, props.mjs CTX)
      if (pitcher && !lu[1 - mine]) out.push("the other side's lineup not posted");
      if (!pitcher && !sp[1 - mine]) out.push("the other side's starting pitcher not named");
      if (!pitcher && !lu[mine]) out.push('his lineup not posted');
    }
  }
  return out;
}

const hash = (s) => (s === null || s === undefined ? null : s === '' || s === '-' ? s : createHash('sha1').update(s).digest('hex').slice(0, 8));

// (the work that makes a game count toward a regular's or a starter's place: the NFL's 10 offensive snaps or 3
// passes, carries and targets; the NBA's 12 minutes)
const WORKED = { nfl: (s) => (s.snaps ?? 0) >= 10 || (s.passAtt ?? 0) + (s.rushAtt ?? 0) + (s.targets ?? 0) >= 3, nba: (s) => (s.min ?? 0) >= 12 };
export const LINEUP_GAMES = 4;
// (the games of the game's own season a team needs before its regulars and usual five are read: fewer, an
// opener, and they'd be last season's last weeks (rest, tanking, the ones traded away still on the old team))
export const LINEUP_MIN = 2;
// (the usual starters at most: a team rotating its five through the last four has more who started half)
const FIVE = 5;

// Each player's place now (see above): Map of pid -> { team, pos, name, regular, starter, season, teamGames },
// from each team's latest season in the rows and its last LINEUP_GAMES games there (a team with one game: that
// one); season, teamGames: his team's season in the rows and its games there; starter null where none of the
// team's last games' rows has a start flag (unknown, not nobody). The NFL and NBA only (null otherwise)
export function lineupNow(rows, sport) {
  const worked = WORKED[sport];
  if (!worked || !rows?.length) return null;
  const latest = new Map();
  for (const r of rows) if (r.team && r.season > (latest.get(r.team) ?? -Infinity)) latest.set(r.team, r.season);
  const games = new Map();
  for (const r of rows) {
    if (!r.team || r.season !== latest.get(r.team)) continue;
    const g = games.get(r.team) ?? new Map();
    if (!g.has(r.game)) g.set(r.game, { date: r.date, rows: [] });
    g.get(r.game).rows.push(r);
    games.set(r.team, g);
  }
  const out = new Map();
  for (const [team, g] of games) {
    const last = [...g.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, LINEUP_GAMES);
    const need = Math.min(2, last.length);
    const tally = new Map();
    let flagged = false;
    for (const { rows: rs } of last) {
      for (const r of rs) {
        const t = tally.get(String(r.pid)) ?? { pos: r.pos ?? '', name: r.name ?? '', n: 0, starts: 0, date: '' };
        if (worked(r.s ?? {})) t.n++;
        if (r.s?.start === 1) t.starts++;
        if (r.s?.start === 0 || r.s?.start === 1) flagged = true;
        if (String(r.date) > t.date) t.date = String(r.date);
        tally.set(String(r.pid), t);
      }
    }
    // (the NBA's usual five: started half the last games or more, the five with the most starts at most (ties:
    // the more work, then the later game); none where the rows have no start flag)
    const five = new Set(
      sport === 'nba' && flagged
        ? [...tally]
            .filter(([, t]) => t.starts > 0 && t.starts * 2 >= last.length)
            .sort(([a, x], [b, y]) => y.starts - x.starts || y.n - x.n || y.date.localeCompare(x.date) || a.localeCompare(b))
            .slice(0, FIVE)
            .map(([pid]) => pid)
        : [],
    );
    const season = latest.get(team);
    for (const [pid, t] of tally) {
      // (a player in two teams' rows, traded: the team he played for last)
      const prev = out.get(pid);
      if (prev && prev.date > t.date) continue;
      out.set(pid, { team: String(team), pos: t.pos, name: t.name, date: t.date, regular: need > 0 && t.n >= need, starter: sport !== 'nba' ? false : flagged ? five.has(pid) : null, season, teamGames: g.size });
    }
  }
  return out;
}

// A game's posted inactives put into its own copy of the injury report (see above). l: its live facts (l.gameRosters:
// Map of team id -> espn.mjs gameRosterOf); players: lineupNow's, or null (the listed ones alone). Returns the
// ones put in ([{ team, id, name, was }]: was the status he was listed at, null for one unlisted)
export function putInactives(l, game, players = null) {
  const put = [];
  if (!l || l.injuriesFailed || !(l.injuries instanceof Map) || !(l.gameRosters instanceof Map)) return put;
  let mine = null;
  for (const team of [String(game.home), String(game.away)]) {
    const posted = l.gameRosters.get(team);
    if (!posted?.inactive?.length) continue;
    const list = [...((mine ?? l.injuries).get(team) ?? [])];
    let changed = false;
    for (const p of posted.inactive) {
      const i = list.findIndex((x) => String(x.id) === p.id);
      if (i >= 0) {
        const x = list[i];
        if (x.inactive || OUT.test(x.status ?? '')) continue;
        list[i] = { ...x, status: 'Out (inactive)', inactive: true, was: x.status ?? '' };
        put.push({ team, id: p.id, name: x.name || p.name, was: x.status ?? '' });
        changed = true;
        continue;
      }
      // (a regular unlisted: read only from this season's games, LINEUP_MIN of them; at week 1, the listed alone)
      const who = players?.get(p.id);
      if (!who?.regular || who.team !== team || !seasonRead(who, game.season)) continue;
      list.push({ id: p.id, name: who.name || p.name, pos: who.pos ?? '', status: 'Out (inactive)', date: null, inactive: true });
      put.push({ team, id: p.id, name: who.name || p.name, was: null });
      changed = true;
    }
    if (!changed) continue;
    mine ??= new Map(l.injuries);
    mine.set(team, list);
  }
  if (mine) l.injuries = mine;
  return put;
}

// (a player's place read from the game's own season, LINEUP_MIN of its games or more: lineupNow's season and
// teamGames; a game with no season known: not read)
const seasonRead = (who, season) => season !== null && season !== undefined && who?.season === season && (who.teamGames ?? 0) >= LINEUP_MIN;

// A team's usual starting five by starts (lineupNow's starter), read from the game's season: a Set of ids, or
// null unknown (no start flag in the rows, too few of this season's games, none marked)
export function usualStarters(players, team, season) {
  if (!players?.size) return null;
  const mine = [...players].filter(([, x]) => x.team === String(team));
  if (!mine.length || !seasonRead(mine[0][1], season) || mine.every(([, x]) => x.starter === null || x.starter === undefined)) return null;
  const usual = new Set(mine.filter(([, x]) => x.starter === true).map(([id]) => id));
  return usual.size ? usual : null;
}

// (the NBA's posted starting five against the usual one (usualStarters): the ones starting who usually don't,
// and the usual starters not in it who aren't out; '' none, null not posted or the usual one unknown)
export function lineupSurprise(l, team, players, season) {
  const five = l?.gameRosters instanceof Map ? l.gameRosters.get(String(team))?.starters : null;
  if (!five) return null;
  const usual = usualStarters(players, team, season);
  if (!usual) return null;
  const report = l.injuries instanceof Map ? (l.injuries.get(String(team)) ?? []) : [];
  const out = new Set(report.filter((p) => OUT.test(p.status ?? '')).map((p) => String(p.id)));
  const s = new Set(five);
  return [...five.filter((id) => !usual.has(id)), ...[...usual].filter((id) => !s.has(id) && !out.has(id))].sort().join(',');
}

// A game's inputs: { parts: { key: text or null }, hash: { key: short hash or null }, names: { id: name } }.
// live: its live facts (context.mjs gather); info: its context's info (starters); ok: which sources worked
// this run ({ nflverse, injuries, statsapi }: false, unread); players: lineupNow's (the NBA's starting five
// read against the usual one; none, that part unread)
export function inputsOf(sport, game, live, info, ok = {}, players = null) {
  const parts = {};
  const names = {};
  const l = live ?? {};
  const sides = [
    ['h', game.home],
    ['a', game.away],
  ];
  if (sport !== 'mlb') {
    const report = ok.injuries === false || l.injuriesFailed ? null : (l.injuries ?? null);
    for (const [s, team] of sides) {
      const all = report ? (report.get(String(team)) ?? []) : null;
      const key = (p) => String(p.id ?? p.name);
      if (all) for (const p of all) names[key(p)] = p.name;
      // (the report with a listed one ruled inactive (putInactives) out, as the game lines' context read it: the
      // same once ESPN's report has him out too, so that update is no second change; a regular put in unlisted
      // in his own part below, which the lines never read)
      const list = all ? all.filter((p) => !p.inactive || p.was !== undefined) : null;
      parts[`out:${s}`] = list ? list.filter((p) => OUT.test(p.status)).map(key).sort().join(',') : null;
      parts[`q:${s}`] = list ? list.filter((p) => !OUT.test(p.status) && QUESTIONABLE.test(p.status)).map(key).sort().join(',') : null;
      // (the NFL's and NBA's regulars the report doesn't list, posted inactive (run.mjs inactivesNow), once the
      // side's posted (l.gameRosters); null before. The props' alone: PROPS_ONLY)
      if (sport === 'nfl' || sport === 'nba') {
        const posted = l.gameRosters instanceof Map ? l.gameRosters.get(String(team)) : null;
        parts[`ina:${s}`] = all && posted ? all.filter((p) => p.inactive && p.was === undefined).map(key).sort().join(',') : null;
      }
      // (the NBA's starting five where it isn't the usual one, once posted; the props' alone)
      if (sport === 'nba') {
        const st = all ? lineupSurprise(l, team, players, game.season) : null;
        if (st) for (const id of st.split(',')) names[id] ??= players?.get(id)?.name ?? id;
        parts[`st:${s}`] = st;
      }
    }
  }
  // (the news flags on each side (news.mjs: l.news, its unit and story; '' none), once the teams' news was
  // read (l.newsRead): a story landing, or one running out, prices an open bet on the game again)
  for (const [s, team] of sides) parts[`news:${s}`] = l.newsRead ? (l.news ?? []).filter((x) => x.team === String(team)).map((x) => `${x.unit}:${x.id}`).sort().join(',') : null;
  if (sport === 'nfl') {
    const known = ok.nflverse !== false && !!l.row;
    const st = info?.starters;
    for (const [s, where] of [
      ['h', 'home'],
      ['a', 'away'],
    ]) {
      // (the quarterback the context priced: his name, or a backup unnamed; '-' when nflverse has none yet)
      const qb = st ? (st[where] ?? (st.backup?.[s === 'h' ? 0 : 1] ? 'a backup' : null)) : null;
      parts[`qb:${s}`] = known ? (qb ?? '-') : null;
    }
  }
  if (sport === 'nhl') {
    for (const [s, where] of [
      ['h', 'home'],
      ['a', 'away'],
    ]) {
      const g = l[where];
      if (g?.id) names[g.id] = g.name;
      parts[`g:${s}`] = g?.id ? `${g.id}${/confirmed/i.test(g.status ?? '') ? ' confirmed' : ''}` : '-';
    }
  }
  if (sport === 'mlb') {
    const known = ok.statsapi !== false && !!l.pk;
    for (const [s, i] of [
      ['h', 0],
      ['a', 1],
    ]) {
      const sp = i === 0 ? l.hp : l.ap;
      if (sp && l.names?.[i]) names[sp] = l.names[i];
      parts[`sp:${s}`] = known ? (sp ? String(sp) : '-') : null;
      parts[`lu:${s}`] = known ? (l.lineups?.[i]?.length ? l.lineups[i].join(',') : '-') : null;
    }
  }
  return { parts, hash: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, hash(v)])), names };
}

// (each part's words, for the changelog)
const WORDS = { out: 'out list', q: 'questionable list', qb: 'quarterback', g: 'goalie', sp: 'starting pitcher', lu: 'lineup', news: 'news flags', ina: 'inactives off the report', st: 'starting five' };

// (the parts only a prop reads: the regulars put in unlisted come after the game lines' context is fit (run.mjs
// inactivesNow), and nothing on the lines' side reads the NBA's five; a game line's bet priced again on them
// would be the same numbers at the line now, its closing value given up for no news)
export const PROPS_ONLY = new Set(['ina', 'st']);

// What changed between a bet's inputs (hashes) and the game's now: [{ key, words }]; before: the game's
// parts as a run before saw them (the cache: the names who joined or left a list), when it has them; market:
// the bet's (a game line's skips PROPS_ONLY; none given: every part)
export function inputChanges(was, now, { game = null, before = null, names = {}, market = null } = {}) {
  if (!was || !now) return [];
  const out = [];
  // (a side's whole injury list gone empty since the run before, which had names on it: a partial report (one
  // team's entry dropped) is likelier than everyone healed, so it waits for a second run to agree)
  const vanished = (s) => !!before && now.parts?.[`out:${s}`] === '' && now.parts?.[`q:${s}`] === '' && !!(before[`out:${s}`] || before[`q:${s}`]);
  for (const [key, h] of Object.entries(now.hash)) {
    const then = was[key];
    const [kind, s] = key.split(':');
    if (market && market !== 'prop' && PROPS_ONLY.has(kind)) continue;
    // (an MLB starter gone to none named with StatsAPI read (unread, the part is null, not '-'): the scratch
    // itself, news)
    const scratched = kind === 'sp' && h === '-' && typeof then === 'string' && then !== '-';
    // (unread now, blank now, or not kept then (a bet from before the part was): not a change; unread then
    // and read now is: the news the bet was priced without)
    if (h === null || h === undefined || then === undefined || (h === '-' && !scratched) || h === then) continue;
    if ((kind === 'out' || kind === 'q') && vanished(s)) continue;
    // (the news unread then and nothing flagged now: nothing the bet missed)
    // (the inactives or the starting five posted with nothing in them that matters: the bet missed nothing)
    if ((kind === 'news' || kind === 'ina' || kind === 'st') && then === null && h === '') continue;
    const team = game ? (s === 'h' ? game.homeAbbr : game.awayAbbr) : s === 'h' ? 'home' : 'away';
    let detail = '';
    const prev = before?.[key];
    if ((kind === 'out' || kind === 'q') && typeof prev === 'string' && hash(prev) === then) {
      const a = new Set(prev ? prev.split(',') : []);
      const b = new Set(now.parts[key] ? now.parts[key].split(',') : []);
      const joined = [...b].filter((x) => !a.has(x)).map((x) => names[x] ?? x);
      const left = [...a].filter((x) => !b.has(x)).map((x) => names[x] ?? x);
      detail = [...joined.map((x) => `+${x}`), ...left.map((x) => `-${x}`)].join(', ');
    } else if (kind === 'qb') detail = now.parts[key];
    else if (scratched) detail = 'none named now';
    else if (kind === 'g' || kind === 'sp') {
      const [id, conf] = String(now.parts[key]).split(' ');
      detail = `${names[id] ?? id}${conf ? ' confirmed' : ''}`;
    } else if (kind === 'lu') detail = then === '-' || then === null ? 'posted' : 'changed';
    else if (kind === 'ina' || kind === 'st') detail = now.parts[key] ? now.parts[key].split(',').map((x) => names[x] ?? x).join(', ') : 'none now';
    else if (kind === 'news') detail = now.parts[key] ? now.parts[key].split(',').map((x) => x.split(':')[0]).join(', ') : 'cleared';
    out.push({ key, words: `${team} ${WORDS[kind] ?? kind}${detail ? ` (${detail})` : ''}` });
  }
  return out;
}
