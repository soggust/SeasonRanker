// The priced history for the gate's betting layer (gate.mjs layer b, 'history'; DECISIONS.md D22, D29): The Odds
// API's archived opens and closes (odds-history.mjs, every game since 2020-06 for the lines and 2023-05 for the
// props, DraftKings' prices and Pinnacle's, committed under apps/<sport>/scripts/model/odds-history) priced by a
// version of the model and graded against the book.
//
//   rows      each matched final game's lines (the moneyline, the spread, the total: the home or over side's frame,
//             both prices) and each player game's props the desk prices (DraftKings' main line, the one nearest
//             even), at the open ('o': the pull's first sighting, a day or more out for the lines, OPEN_LEAD before
//             the start for the props) and at the close ('c': the last snapshot before the start, CLOSE_MAX at most)
//   fair      the lines' Pinnacle de-vigged at the same line where it posts it, else DraftKings' own; the props'
//             DraftKings' own (as the desk prices them)
//   model     the version's own replay, each game from the games before it only: the ratings (and the context where
//             the desk's games have it) for the lines, ESPN's games from the history's events carrying the seasons
//             games.json doesn't keep; the props' replayed projection (project.mjs) of the player's own game.
//             The fitted settings are the version's (fit over their own window: the small look-ahead layer a has too)
//   priced    walk-forward by month: each market's trust (desk.mjs fitTrust; the props' by stat and line bucket,
//             from BUCKET_START) fit only on the history's rows from the months before, then desk.mjs chanceAt
//   weights   gate-score.mjs seasonWeight (halving a season back; outside the rule era or the deciding seasons, a
//             tenth): the rows' w
//   measured  open rows (f the open's no-vig, q the close's at the same line, y the result): the gate's betCompare
//             (log loss on the results, against the close, the top picks' CLV) between versions; and each version
//             against the book at the close (vsBook: its priced chance's log loss on the results less the close's
//             no-vig's, and the raw model's), the "model vs book" table
//
// Only what the model could have known before each game: the replay's projections and the trust's months before.
// A selection the replay can't avoid: the props' rows are the player games that happened (a player ruled out late
// has none), as layer a's.

import { readHistory } from './odds-history.mjs';
import { bootDiff, binLoss, pairRows, r4, seasonWeight } from './gate-score.mjs';
import { nameKey } from './espn.mjs';

export const CLOSE_MAX = 6 * 36e5;
const fin = Number.isFinite;
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
export const devig = (a, b) => {
  const x = implied(a);
  const y = implied(b);
  return x / (x + y);
};
const MARKET = { h2h: 'ml', spreads: 'spread', totals: 'total' };

// The history's games as the ratings read them: games.json's, and the matched finals it doesn't keep (from the
// history's events: ESPN's id, start, season, type, teams, score)
export function extendedGames(history, events) {
  const have = new Set(history.map((g) => String(g.id)));
  const extra = [];
  const seen = new Set();
  for (const e of events.values()) {
    if (!e.id || have.has(String(e.id)) || seen.has(String(e.id)) || !e.home || !e.away) continue;
    seen.add(String(e.id));
    const final = fin(e.hs) && fin(e.as);
    extra.push({ id: String(e.id), date: e.t, season: e.season, type: e.type ?? 2, home: String(e.home), away: String(e.away), homeAbbr: '', awayAbbr: '', neutral: false, final, hs: final ? e.hs : null, as: final ? e.as : null, ...(e.short ? { short: e.short } : {}) });
  }
  return [...history, ...extra].sort((a, b) => a.date.localeCompare(b.date));
}

// The lines' bets in the backtest's shape (backtest.mjs repriced reads them), each game's home or over side at its
// open and close: { id, event, when, market, side, line, odds, otherOdds, fair, spreadHome, start, season, kind }
export function historyLineBets(events, lines, games) {
  const byGame = new Map(games.map((g) => [String(g.id), g]));
  const by = new Map();
  for (const l of lines) {
    if (l.kind !== 'o' && l.kind !== 'c') continue;
    const k = `${l.oid}|${l.kind}`;
    const m = by.get(k) ?? by.set(k, {}).get(k);
    (m[l.book] ??= {})[l.market] = l;
  }
  const out = [];
  for (const [k, books] of by) {
    const [oid, kind] = k.split('|');
    const e = events.get(oid);
    const g = e?.id ? byGame.get(String(e.id)) : null;
    if (!g?.final || !fin(g.hs)) continue;
    const dk = books.dk;
    if (!dk) continue;
    const start = Date.parse(e.t);
    const ts = Date.parse(Object.values(dk)[0].ts);
    if (kind === 'c' && start - ts > CLOSE_MAX) continue;
    const fairOf = (market) => {
      const d = dk[market];
      const p = books.pin?.[market];
      if (p && p.line === d.line && fin(p.a) && fin(p.b)) return devig(p.a, p.b);
      return devig(d.a, d.b);
    };
    const spread = dk.spreads && fin(dk.spreads.a) && fin(dk.spreads.b) ? { line: dk.spreads.line, fair: fairOf('spreads') } : null;
    for (const [mk, d] of Object.entries(dk)) {
      if (!MARKET[mk] || !fin(d.a) || !fin(d.b)) continue;
      const market = MARKET[mk];
      if (market !== 'ml' && !fin(d.line)) continue;
      out.push({ id: `h:${g.id}:${market}`, event: String(g.id), when: kind === 'o' ? 'open' : 'close', kind, market, side: market === 'total' ? 'over' : 'home', line: market === 'ml' ? null : d.line, odds: d.a, otherOdds: d.b, fair: fairOf(mk), anchor: 'pinnacle', ...(market === 'ml' && spread ? { spreadHome: spread } : {}), start: e.t, season: g.season, at: d.ts });
    }
  }
  return out;
}

// The props' history by player game: Map "stat|name key|ESPN game id" -> { o, c } (each { line, over, under, fair,
// ts }: DraftKings' main line, the one nearest even), the stat by the desk's market keys (marketStat: props.mjs
// API_MARKETS[sport])
export function historyPropIndex(events, props, marketStat) {
  const best = new Map();
  for (const p of props) {
    if (p.book !== 'dk' || (p.kind !== 'o' && p.kind !== 'c')) continue;
    const stat = marketStat[p.market];
    const e = events.get(p.oid);
    if (!stat || !e?.id || !fin(p.line) || !fin(p.over) || !fin(p.under)) continue;
    if (p.kind === 'c' && Date.parse(e.t) - Date.parse(p.ts) > CLOSE_MAX) continue;
    const k = `${stat}|${nameKey(p.player)}|${e.id}`;
    const x = best.get(k) ?? best.set(k, { start: e.t, season: e.season }).get(k);
    const fair = devig(p.over, p.under);
    if (!x[p.kind] || Math.abs(fair - 0.5) < Math.abs(x[p.kind].fair - 0.5)) x[p.kind] = { line: p.line, over: p.over, under: p.under, fair, ts: p.ts };
  }
  return best;
}

// (a trust for each row, walk-forward by month: keyOf(row) its group, fit on the rows of the months before only
// (desk.mjs fitTrust, the result and the close's chance), from start(key) with none; rows in the over frame { p raw,
// f, y, q, event, t })
export function walkTrust(rows, keyOf, fitTrust, start) {
  const months = [...new Set(rows.map((x) => new Date(x.t).toISOString().slice(0, 7)))].sort();
  const out = new Map();
  const asBet = (x) => ({ market: x.market, model: x.raw, fair: x.f, event: x.event, status: x.y === 1 ? 'won' : x.y === 0 ? 'lost' : 'push', ...(fin(x.q) ? { clv: { q: x.q } } : {}) });
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  const prior = new Map();
  let i = 0;
  for (const m of months) {
    const mine = [];
    while (i < sorted.length && new Date(sorted[i].t).toISOString().slice(0, 7) === m) mine.push(sorted[i++]);
    const cache = new Map();
    for (const x of mine) {
      const k = keyOf(x);
      if (!cache.has(k)) {
        const list = prior.get(k) ?? [];
        cache.set(k, list.length ? fitTrust(list, start(k)).trust : start(k));
      }
      out.set(x, cache.get(k));
    }
    for (const x of mine) {
      const k = keyOf(x);
      (prior.get(k) ?? prior.set(k, []).get(k)).push(asBet(x));
    }
  }
  return out;
}

// A version against the book on rows ({ p (priced over), raw, f, y, w, event }): the log loss on the results, the
// version's (priced and raw) and the book's no-vig, recency-weighted (w), paired by row and clustered by game:
// { n, model, raw, book, gap (model less book, under 0 better), lo, hi (its 95%), rawGap, verdict }
export function vsBook(rows) {
  const dec = rows.filter((x) => (x.y === 0 || x.y === 1) && (x.w ?? 1) > 0);
  if (!dec.length) return null;
  const at = (f) => dec.map((x) => ({ k: x.id, c: x.event, w: x.w ?? 1, v: binLoss(f(x), x.y) }));
  const book = at((x) => x.f);
  const pm = pairRows(book, at((x) => x.p));
  const pr = pairRows(book, at((x) => x.raw));
  const m = bootDiff(pm.clusters, { boot: 400 });
  const r = bootDiff(pr.clusters, { boot: 400 });
  if (!m) return null;
  return { n: pm.n, games: m.n, model: m.b, raw: r?.b ?? null, book: m.a, gap: m.diff, lo: m.lo, hi: m.hi, rawGap: r?.diff ?? null, verdict: m.hi < 0 ? 'better' : m.lo > 0 ? 'worse' : 'tie' };
}

// (rows by season, each against the book: the seasons' table)
export function vsBookBySeason(rows) {
  const out = {};
  for (const s of [...new Set(rows.map((x) => x.season))].sort()) out[s] = vsBook(rows.filter((x) => x.season === s).map((x) => ({ ...x, w: 1 })));
  return out;
}

// The lines' history rows for a version: V (its modules), the sport, params and shape (its margins), expOf (game id
// -> its expectation), the games (extended), the history. { open: rows, close: rows }
export function lineHistoryRows(V, sport, params, shape, expOf, games, hist, current) {
  const bets = historyLineBets(hist.events, hist.lines, games);
  const priced = V.backtest.repriced(bets, (b) => expOf(b.event), params, shape);
  const byGame = new Map(games.map((g) => [String(g.id), g]));
  const rows = [];
  for (const b of priced) {
    const g = byGame.get(b.event);
    const s = V.desk.settle(b, g);
    if (s.void) continue;
    const y = s.status === 'won' ? 1 : s.status === 'lost' ? 0 : null;
    rows.push({ id: `${b.id}:${b.kind}`, key: b.id, event: b.event, sport, market: b.market, stat: b.market, kind: b.kind, line: b.line, day: etDay(Date.parse(b.start)), t: Date.parse(b.start), season: b.season, f: b.fair, raw: Math.min(0.999, Math.max(0.001, b.model)), y, q: null, overOdds: b.odds, underOdds: b.otherOdds, w: seasonWeight(sport, b.season, current).w });
  }
  return finish(V, rows, (x) => x.market, () => 0.5, 'lines');
}

// (the open rows' close chance at the same line, the trust walk-forward on the close rows, each row priced)
function finish(V, rows, keyOf, start, kind) {
  const close = new Map(rows.filter((x) => x.kind === 'c').map((x) => [x.key, x]));
  for (const x of rows) {
    if (x.kind !== 'o') continue;
    const c = close.get(x.key);
    if (c && (c.line === x.line || (c.line === null && x.line === null))) x.q = c.f;
  }
  const closeRows = rows.filter((x) => x.kind === 'c');
  const trust = walkTrust(closeRows, keyOf, V.desk.fitTrust, start);
  // (an open row at its close row's trust: the same game's month)
  for (const x of rows) {
    const t = trust.get(x.kind === 'c' ? x : close.get(x.key)) ?? start(keyOf(x));
    x.p = Math.min(0.999, Math.max(0.001, V.desk.chanceAt(kind === 'lines' ? x.market : 'prop', x.f, x.raw, t)));
    x.trust = t;
  }
  return { open: rows.filter((x) => x.kind === 'o'), close: closeRows };
}

// The props' history rows: the replay's player games (each { stat, name, game, v (what he did), over (the version's
// raw over chance at a line: fn) }) matched to the history's index. { open, close }
export function propHistoryRows(V, sport, index, matches, current) {
  const rows = [];
  for (const m of matches) {
    const h = index.get(`${m.stat}|${nameKey(m.name)}|${m.game}`);
    if (!h) continue;
    for (const kind of ['o', 'c']) {
      const x = h[kind];
      if (!x) continue;
      const raw = m.over(x.line);
      if (!fin(raw)) continue;
      const y = m.v > x.line ? 1 : m.v < x.line ? 0 : null;
      const id = `p:${m.stat}:${m.pid}:${m.game}`;
      rows.push({ id: `${id}:${kind}`, key: id, event: String(m.game), sport, market: 'prop', stat: m.stat, kind, line: x.line, day: etDay(Date.parse(h.start)), t: Date.parse(h.start), season: h.season, f: x.fair, raw: Math.min(0.999, Math.max(0.001, raw)), y, q: null, overOdds: x.over, underOdds: x.under, w: seasonWeight(sport, h.season, current).w });
    }
  }
  const B = V.desk.BUCKET_START ?? { low: 0.25, mid: 0.375, high: 0.5 };
  const bucket = V.desk.lineBucket ?? ((l) => (l <= 1.5 ? 'low' : l <= 3.5 ? 'mid' : 'high'));
  return finish(V, rows, (x) => `${x.stat}@${bucket(x.line)}`, (k) => B[k.split('@')[1]] ?? 0.5, 'props');
}

// The history a sport has, loaded once: { events, lines, props } (odds-history.mjs readHistory)
export const loadHistory = (sport) => readHistory(sport);

// (rows slimmed for the score file: what betCompare and vsBook read)
export const slim = (rows) => rows.map((x) => ({ id: x.id, event: x.event, sport: x.sport, stat: x.stat, line: x.line, day: x.day, t: x.t, season: x.season, f: r4(x.f), p: r4(x.p), raw: r4(x.raw), y: x.y, q: x.q === null ? null : r4(x.q), overOdds: x.overOdds, underOdds: x.underOdds, w: r4(x.w) }));
