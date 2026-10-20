// The news lag (DECISIONS.md D66): a star newly ruled out while the Book's lines on his teammates haven't moved yet.
// Measured on history (D61's intraday props, the NBA's last two seasons): while the Book still posted the star's own
// prop, his teammates' points overs hit 58% at 6 hours against a 50% fair, and 98% of those lines hadn't moved since
// the first snapshot (the market didn't know yet). The history can't time the news (the box score is hindsight, D48),
// so the live bets carry a `newsLag` reason and earn its record walk-forward like every other (D58): no prior.
//
//   stars    the team's top players by the Book's own lines, kept a run to the next (the star's prop is usually
//            pulled once he's out): NBA points (the top two, or 17.5 or more), NHL shots (the top two), NFL the
//            top passing line (QB), rushing (RB1) and the top two receiving (WR1, TE1). MLB isn't read
//   seen     each star's Out or Doubtful the first run that saw it (any source the run's report carries: ESPN's,
//            Sleeper's, the reporters', D49), with his teammates' lines and over prices from the run before (the
//            price then)
//   tag      a teammate's over on a stat the star's absence feeds (the projection reads the star out and its
//            vacancy rises: vacF > 1), within LAG_FRESH_H of the first sighting, while his line hasn't moved since
//            (the line no higher, the over's no-vig chance up less than MOVE_TOL); the NBA's only while the star's
//            own prop is still posted (once the Book pulls it, the history's gap is gone)
//   review   lagReview: for the graded tagged bets, when the Book moved the prop after the bet (the price log, D54:
//            a review's reader, never a bet's) and the execution delta (the bet's price against the one after the
//            move). Pinnacle's props aren't logged (the desk asks the Book alone for props), so its move is null
//   state    .cache/model/news-lag-<sport>.json, pruned after the start; a lost one starts over (no tag on the next
//            run's sightings: their price then is unknown, so nothing is called stale)
//   never    a chance, a projection or a stake moved by the tag (only D58's tier reads it, on its own record); a tag
//            on a line that already moved; the price log read on a live bet
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CACHE } from './sources.mjs';

export const LAG_SPORTS = new Set(['nba', 'nfl', 'nhl']);
// (the stats a star's absence feeds, the teammate's over)
export const LAG_STATS = { nba: ['pts', 'reb', 'ast', 'fg3', 'pra'], nfl: ['rushYds', 'rushAtt', 'recYds', 'rec', 'rushRecYds'], nhl: ['sog', 'pts'] };
// (who's a star: by the Book's line on these stats, the top n on his team; the NBA's 17.5 points or more too)
export const STAR_BY = { nba: [{ stat: 'pts', top: 2, line: 17.5 }], nhl: [{ stat: 'sog', top: 2 }], nfl: [{ stat: 'passYds', top: 1 }, { stat: 'rushYds', top: 1 }, { stat: 'recYds', top: 2 }] };
export const LAG_STATUS = /^(out|doubtful)\b/i;
export const LAG_FRESH_H = 12;
export const MOVE_TOL = 0.03;
const KEEP_H = 6;

const fin = Number.isFinite;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
// (the over's no-vig chance; the over's implied alone without an under)
export const fairOver = (over, under) => (fin(over) && over ? (fin(under) && under ? 1 / dec(over) / (1 / dec(over) + 1 / dec(under)) : 1 / dec(over)) : null);
const rowKey = (stat, id) => `${stat}:${id}`;

// The team's stars on a board: Set of athlete ids
export function starsOf(sport, board, team) {
  const out = new Set();
  for (const by of STAR_BY[sport] ?? []) {
    const rows = (board ?? []).filter((p) => p?.stat?.key === by.stat && String(p.athlete?.team) === String(team) && fin(p.line)).sort((a, b) => b.line - a.line);
    rows.slice(0, by.top).forEach((p) => out.add(String(p.athlete.id)));
    if (fin(by.line)) rows.filter((p) => p.line >= by.line).forEach((p) => out.add(String(p.athlete.id)));
  }
  return out;
}

// The run's update of a game's state (changed in place): the stars kept, a star's first Out or Doubtful with his
// teammates' lines from the run before, then this run's lines. Returns the game's live outs: [{ id, name, team,
// status, first, then: { key: [line, fairOver, over] } }]
export function lagUpdate(state, { sport, game, board, injuries, now }) {
  if (!LAG_SPORTS.has(sport)) return [];
  const gid = String(game.id);
  const g = (state.games ??= {})[gid] ??= { start: game.date, stars: {}, rows: {}, outs: {} };
  g.start = game.date;
  const teams = [String(game.home), String(game.away)];
  for (const team of teams) {
    const s = starsOf(sport, board, team);
    const names = Object.fromEntries((board ?? []).filter((p) => s.has(String(p.athlete?.id))).map((p) => [String(p.athlete.id), p.athlete.name]));
    // (a star stays one for the game once seen: his prop is pulled when he's out)
    g.stars[team] = { ...(g.stars[team] ?? {}), ...names };
  }
  const prev = g.rows;
  for (const team of teams) {
    for (const x of injuries?.get?.(team) ?? []) {
      const id = String(x?.id ?? '');
      if (!id || !LAG_STATUS.test(String(x.status ?? '')) || !(id in (g.stars[team] ?? {}))) continue;
      if (g.outs[id]) continue;
      g.outs[id] = { id, name: x.name || g.stars[team][id], team, status: String(x.status).split(/\s/)[0], first: new Date(now).toISOString(), src: x.from ?? 'espn', ...(x.date ? { own: x.date } : {}), then: Object.keys(prev).length ? prev : null };
    }
  }
  const rows = {};
  for (const p of board ?? []) if (p?.stat?.key && p.athlete?.id && fin(p.line) && p.prices) rows[rowKey(p.stat.key, p.athlete.id)] = [p.line, round4(fairOver(p.prices.over, p.prices.under)), p.prices.over ?? null];
  if (Object.keys(rows).length) g.rows = rows;
  return Object.values(g.outs);
}
const round4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);

// A teammate's priced row's tag, or null: { player, id, status, first, min, src, then: { line, odds } }
export function lagTag(sport, outs, x, { now, board = [] } = {}) {
  if (!LAG_SPORTS.has(sport) || x?.side !== 'over' || !(LAG_STATS[sport] ?? []).includes(x.prop?.stat?.key)) return null;
  const team = String(x.prop.athlete?.team);
  const vacF = x.projection?.vacF;
  if (!(fin(vacF) && vacF > 1)) return null;
  const outNames = new Set((x.projection?.out ?? []).map((n) => String(n).toLowerCase()));
  const key = rowKey(x.prop.stat.key, x.prop.athlete.id);
  const line = x.prop.line;
  const nowF = fairOver(x.prop.prices?.over, x.prop.prices?.under);
  for (const o of outs ?? []) {
    if (o.team !== team || String(o.id) === String(x.prop.athlete.id)) continue;
    if (outNames.size && !outNames.has(String(o.name).toLowerCase())) continue;
    const min = (now - Date.parse(o.first)) / 6e4;
    if (!(min >= 0 && min <= LAG_FRESH_H * 60)) continue;
    const then = o.then?.[key];
    if (!then) continue;
    if (!(fin(line) && fin(then[0])) || line > then[0]) continue;
    if (fin(nowF) && fin(then[1]) && line === then[0] && nowF - then[1] >= MOVE_TOL) continue;
    if (sport === 'nba' && !(board ?? []).some((p) => String(p.athlete?.id) === String(o.id) && p.prices)) continue;
    return { player: o.name, id: o.id, status: o.status, first: o.first, min: Math.round(min), src: o.src, then: { line: then[0], odds: then[2] ?? null } };
  }
  return null;
}

// The props asked again on a star's out (D66, before the game's ask): the stars kept for the game (from the runs
// before) now Out or Doubtful on either side's report and not yet asked for since: [id]
export function lagPending(state, game, injuries, asked = []) {
  const g = state?.games?.[String(game.id)];
  if (!g) return [];
  const had = new Set((asked ?? []).map(String));
  const out = [];
  for (const team of [String(game.home), String(game.away)]) {
    for (const x of injuries?.get?.(team) ?? []) {
      const id = String(x?.id ?? '');
      if (id && LAG_STATUS.test(String(x.status ?? '')) && id in (g.stars?.[team] ?? {}) && !had.has(id)) out.push(id);
    }
  }
  return out;
}

// (the state's file, kept in the cache; a lost or unreadable one starts over)
export const lagFile = (sport) => path.join(CACHE, `news-lag-${sport}.json`);
export function readLag(sport) {
  try {
    const f = lagFile(sport);
    const s = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    return s && typeof s.games === 'object' ? s : { games: {} };
  } catch {
    return { games: {} };
  }
}

// (the state pruned: games over KEEP_H hours past their start)
export function lagPrune(state, now) {
  for (const [id, g] of Object.entries(state.games ?? {})) if (!(Date.parse(g.start) + KEEP_H * 36e5 > now)) delete state.games[id];
  return state;
}

// The popover's line: "Star out: Name (news 12 min ago)"
export function starOutText(lag, now = Date.now()) {
  if (!lag?.player) return null;
  const min = fin(Date.parse(lag.first)) ? Math.max(0, Math.round((now - Date.parse(lag.first)) / 6e4)) : lag.min;
  return `Star out: ${lag.player}${fin(min) ? ` (news ${min} min ago)` : ''}`;
}

// ---- the review (Gemini's): t_news, t_bet, the Book's move after the bet, the execution delta ----

// A tagged bet against the price log's rows ([sec, game, key, line, over, under, src]): { tNews, tBet, dkMove (the
// first row after the bet with a higher line or the over's no-vig up MOVE_TOL), dkLine, dkOdds, pinMove: null,
// delta (the over's no-vig chance after the move less at the bet, in points; a line move as its own: +line) }
export function lagReview(bet, rows) {
  const tBet = Date.parse(bet.placedAt);
  const key = `p:${bet.propType}:${bet.athlete}`;
  const f0 = fairOver(bet.odds, bet.otherOdds ?? null);
  let move = null;
  for (const r of rows ?? []) {
    if (!Array.isArray(r) || r[0] === 'g' || r[0] === 'h' || String(r[1]) !== String(bet.event) || r[2] !== key || r[0] * 1000 <= tBet) continue;
    const f = fairOver(r[4], r[5]);
    if (r[3] > bet.line || (r[3] === bet.line && fin(f) && fin(f0) && f - f0 >= MOVE_TOL)) {
      move = { t: new Date(r[0] * 1000).toISOString(), line: r[3], odds: r[4], f };
      break;
    }
  }
  return {
    id: bet.id,
    player: bet.player,
    star: bet.newsLag?.player ?? null,
    tNews: bet.newsLag?.first ?? null,
    tBet: bet.placedAt,
    latencyMin: bet.newsLag?.first ? Math.round((tBet - Date.parse(bet.newsLag.first)) / 6e4) : null,
    dkMove: move?.t ?? null,
    dkAfterMin: move ? Math.round((Date.parse(move.t) - tBet) / 6e4) : null,
    dkLine: move?.line ?? null,
    dkOdds: move?.odds ?? null,
    pinMove: null,
    delta: move ? (move.line > bet.line ? `+${Math.round((move.line - bet.line) * 10) / 10} line` : fin(move.f) && fin(f0) ? `+${Math.round((move.f - f0) * 1000) / 10} pts` : null) : null,
  };
}

// (the price log's rows for the months a list of bets touch)
function priceRowsFor(sport, bets, root) {
  const dir = path.join(root, 'apps', sport, 'scripts/model/price-log');
  if (!existsSync(dir)) return [];
  const months = new Set(bets.map((b) => String(b.placedAt).slice(0, 7)));
  const out = [];
  for (const f of readdirSync(dir).filter((x) => months.has(x.slice(0, 7)))) {
    for (const s of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) if (s) out.push(JSON.parse(s));
  }
  return out;
}

// node news-lag.mjs <sport> [ledger.json]: the tagged bets' review, a table
if (String(process.argv[1] ?? '').replace(/\\/g, '/').endsWith('/news-lag.mjs')) {
  const root = path.resolve(import.meta.dirname, '../../../..');
  const sport = process.argv[2] ?? 'nba';
  const file = process.argv[3] ?? path.join(root, 'apps', sport, 'src/StaticData/model/ledger.json');
  const bets = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).bets ?? []).filter((b) => b.newsLag) : [];
  const rows = priceRowsFor(sport, bets, root);
  console.log(`${sport}: ${bets.length} news-lag bets`);
  for (const b of bets) console.log(JSON.stringify(lagReview(b, rows)));
}
