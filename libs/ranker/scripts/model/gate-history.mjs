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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readHistory } from './odds-history.mjs';
import { bootDiff, binLoss, pairRows, r4, seasonWeight } from './gate-score.mjs';
import { nameKey } from './espn.mjs';
import { matchNames, nameParts } from './names.mjs';

export const CLOSE_MAX = 6 * 36e5;
const fin = Number.isFinite;
const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (t) => ET.format(new Date(t));
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
// (a sharp book's pair is a fair only where it is a two-way market: its implied chances sum to 1 or more. The data-quality
// audit (2026-10-24): the NHL's 2020 bubble archive holds 106 Pinnacle "h2h" rows at a negative vig (101/231: the
// regulation 3-way prices, the draw left out), 64 of them read as the fair; such a pair falls back to DraftKings' own
// no-vig, as D48's unseen Pinnacle does)
export const PIN_MIN_SUM = 1;
export const sharpPair = (p) => !!p && fin(p.a) && fin(p.b) && implied(p.a) + implied(p.b) >= PIN_MIN_SUM;
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
    if (l.kind !== 'o' && l.kind !== 'c' && l.kind !== 'i') continue;
    // (an intraday snapshot (D63, intradayLines): one row set a snapshot hour, both books read at its time)
    const k = l.kind === 'i' ? `${l.oid}|i|${l.h}` : `${l.oid}|${l.kind}`;
    const m = by.get(k) ?? by.set(k, {}).get(k);
    (m[l.book] ??= {})[l.market] = l;
  }
  const out = [];
  for (const [k, books] of by) {
    const [oid, kind, hh] = k.split('|');
    const h = kind === 'i' ? Number(hh) : null;
    const e = events.get(oid);
    const g = e?.id ? byGame.get(String(e.id)) : null;
    if (!g?.final || !fin(g.hs)) continue;
    const dk = books.dk;
    if (!dk) continue;
    const start = Date.parse(e.t);
    const ts = Date.parse(Object.values(dk)[0].ts);
    if (kind === 'c' && start - ts > CLOSE_MAX) continue;
    // (DECISIONS.md D48, no look-ahead: each book's open is its own first sighting and its close its own last, so
    // Pinnacle's can come after DraftKings' (measured 2026-10-19: in 10 to 28% of the daily sports' opens, a median
    // of hours later, the NFL's two thirds, days): its price is the fair only where it was seen by DraftKings' own
    // snapshot, else DraftKings' own no-vig; a moneyline reads the spread's frame only where the spread was posted by
    // then (else it isn't priced at that snapshot))
    const seenBy = (x, ts) => fin(Date.parse(x?.ts)) && Date.parse(x.ts) <= Date.parse(ts);
    const fairOf = (market) => {
      const d = dk[market];
      const p = books.pin?.[market];
      if (p && p.line === d.line && sharpPair(p) && seenBy(p, d.ts)) return devig(p.a, p.b);
      return devig(d.a, d.b);
    };
    // (whether a market's fair is the sharp book's, seen by DraftKings' snapshot: the reason tiers' books' gap, D58)
    const pinOf = (market) => {
      const d = dk[market];
      const p = books.pin?.[market];
      return !!(p && p.line === d.line && sharpPair(p) && seenBy(p, d.ts));
    };
    const spread = dk.spreads && fin(dk.spreads.a) && fin(dk.spreads.b) ? { line: dk.spreads.line, fair: fairOf('spreads') } : null;
    for (const [mk, d] of Object.entries(dk)) {
      if (!MARKET[mk] || !fin(d.a) || !fin(d.b)) continue;
      const market = MARKET[mk];
      if (market !== 'ml' && !fin(d.line)) continue;
      out.push({ id: `h:${g.id}:${market}`, event: String(g.id), when: kind === 'o' ? 'open' : kind === 'c' ? 'close' : `i${h}`, kind, ...(kind === 'i' ? { h } : {}), market, side: market === 'total' ? 'over' : 'home', line: market === 'ml' ? null : d.line, odds: d.a, otherOdds: d.b, fair: fairOf(mk), pin: pinOf(mk), anchor: 'pinnacle', ...(market === 'ml' ? { spreadHome: spread && seenBy(dk.spreads, d.ts) ? spread : false } : {}), start: e.t, season: g.season, at: d.ts });
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
    // (by the book's own name, its note kept: "Elias Pettersson (2004)" never merged with "Elias Pettersson",
    // which nameKey alone reads as one; propIndexByPlayer matches the names to the players)
    const k = `${stat}|${bookKey(p.player)}|${e.id}`;
    const x = best.get(k) ?? best.set(k, { start: e.t, season: e.season, name: String(p.player).trim(), stat, game: String(e.id) }).get(k);
    const fair = devig(p.over, p.under);
    if (!x[p.kind] || Math.abs(fair - 0.5) < Math.abs(x[p.kind].fair - 0.5)) x[p.kind] = { line: p.line, over: p.over, under: p.under, fair, ts: p.ts };
  }
  return best;
}

// (research only, GATE_PROPS_INTRA=1: D61's intraday props, intraday/props-<season>.jsonl.gz: { rows: Map oid -> [{ ts,
// book, market, player, line, over, under }] (time order, DraftKings'), snaps: Map oid -> [ts] } (Q rows the change-only
// prices, T rows each event's snapshot times). Never read by a record)
export function readIntradayProps(dir) {
  const rows = new Map();
  const snaps = new Map();
  if (!existsSync(dir)) return { rows, snaps };
  for (const f of readdirSync(dir).filter((x) => x.startsWith('props-') && x.endsWith('.jsonl.gz')).sort()) {
    for (const s of gunzipSync(readFileSync(path.join(dir, f))).toString('utf8').split('\n')) {
      if (!s) continue;
      const r = JSON.parse(s);
      if (r[0] === 'T') (snaps.get(r[1]) ?? snaps.set(r[1], []).get(r[1])).push(Date.parse(r[2]));
      else if (r[0] === 'Q' && r[3] === 'dk') (rows.get(r[1]) ?? rows.set(r[1], []).get(r[1])).push({ ts: Date.parse(r[2]), book: r[3], market: r[4], player: r[5], line: r[6], over: r[7], under: r[8] });
    }
  }
  for (const list of rows.values()) list.sort((a, b) => a.ts - b.ts);
  for (const list of snaps.values()) list.sort((a, b) => a - b);
  return { rows, snaps };
}

// (research only, GATE_PROPS_INTRA=1: the intraday props onto the history's index as kind 'i', x.i = { [h]: { line,
// over, under, fair, ts } }: each DraftKings player market as it stood at the event's snapshot nearest each offset hour h
// before the start (within SNAP_TOL): the latest row of that player's market at or before the snapshot (the files keep
// one line a player a snapshot, change-only; a moved line is a new row), nearest even on a tie, as the archive's main
// line; ts the snapshot's time. Attached only to an entry the archive has (the same key); returns the count attached)
export function addIntradayProps(index, events, intra, marketStat, offsets) {
  let n = 0;
  for (const [oid, list] of intra.rows) {
    const e = events.get(oid);
    const start = Date.parse(e?.t);
    const snaps = intra.snaps.get(oid) ?? [];
    if (!e?.id || !fin(start) || !snaps.length) continue;
    const seen = new Set();
    for (const h of offsets ?? []) {
      const want = start - h * 36e5;
      const T = snaps.reduce((b, s) => (Math.abs(s - want) < Math.abs(b - want) ? s : b), snaps[0]);
      if (!(Math.abs(T - want) <= SNAP_TOL) || T >= start || seen.has(T)) continue;
      seen.add(T);
      const last = new Map();
      for (const x of list) {
        if (x.ts > T) break;
        if (!fin(x.line) || !fin(x.over) || !fin(x.under)) continue;
        const k = `${x.market}|${x.player}`;
        const fair = devig(x.over, x.under);
        const have = last.get(k);
        if (!have || x.ts > have.ts || (x.ts === have.ts && Math.abs(fair - 0.5) < Math.abs(have.fair - 0.5))) last.set(k, { ...x, fair });
      }
      for (const x of last.values()) {
        const stat = marketStat[x.market];
        if (!stat) continue;
        const entry = index.get(`${stat}|${bookKey(x.player)}|${e.id}`);
        if (!entry) continue;
        (entry.i ??= {})[h] = { line: x.line, over: x.over, under: x.under, fair: x.fair, ts: new Date(T).toISOString() };
        n++;
      }
    }
  }
  return n;
}

// (a book name's index key: its nameKey with a trailing note kept apart)
const bookKey = (name) => {
  const { key, note } = nameParts(name);
  return note ? `${key}(${note.toLowerCase()})` : key;
};

// The props' history index by player (the grading audit's name round, 2026-10-24): Map "stat|pid|ESPN game id" ->
// the index's entry, each book name matched to one of the game's players (names.mjs matchNames: the key, then the
// nickname and the surname, never two candidates, never a name another player of the sport has exactly). rows: the
// players' games (each { pid, name, game, team }); games: the games (each { id, home, away, homeAbbr, awayAbbr }),
// the teams' codes a book's "(TEAM)" note is read against. Two names reaching one player's stat merge, each kind at
// its line nearest even. .report: { names, matched, byKey, fuzzy, unmatched } (book names, a game's each once)
export function propIndexByPlayer(index, rows, games = []) {
  const abbr = new Map();
  for (const g of games) {
    if (g.homeAbbr) abbr.set(`${g.id}|${g.home}`, g.homeAbbr);
    if (g.awayAbbr) abbr.set(`${g.id}|${g.away}`, g.awayAbbr);
  }
  const players = new Map();
  const known = new Set();
  for (const r of rows) {
    if (!r.name) continue;
    known.add(nameKey(r.name));
    if (!r.game) continue;
    const g = String(r.game);
    const m = players.get(g) ?? players.set(g, new Map()).get(g);
    if (!m.has(String(r.pid))) m.set(String(r.pid), { pid: String(r.pid), name: r.name, abbr: abbr.get(`${g}|${r.team}`) ?? null });
  }
  const names = new Map();
  for (const x of index.values()) if (x.name && x.game) (names.get(x.game) ?? names.set(x.game, new Set()).get(x.game)).add(x.name);
  const report = { names: 0, matched: 0, byKey: 0, fuzzy: 0, unmatched: 0 };
  const to = new Map();
  for (const [g, set] of names) {
    report.names += set.size;
    const m = matchNames([...set], [...(players.get(g)?.values() ?? [])], { known });
    for (const n of set) {
      const p = m.get(n);
      if (!p) {
        report.unmatched++;
        continue;
      }
      report.matched++;
      if (nameKey(n) === nameKey(p.name) && !nameParts(n).note) report.byKey++;
      else report.fuzzy++;
      to.set(`${g}|${n}`, p.pid);
    }
  }
  const out = new Map();
  const even = (y) => Math.abs(y.fair - 0.5);
  for (const x of index.values()) {
    const pid = to.get(`${x.game}|${x.name}`);
    if (!pid) continue;
    const k = `${x.stat}|${pid}|${x.game}`;
    const have = out.get(k);
    if (!have) out.set(k, { ...x, pid, ...(x.i ? { i: { ...x.i } } : {}) });
    else {
      for (const kind of ['o', 'c']) if (x[kind] && (!have[kind] || even(x[kind]) < even(have[kind]))) have[kind] = x[kind];
      // (research only, GATE_PROPS_INTRA=1: the intraday snapshots merged the same way, each hour at its line nearest even)
      if (x.i) for (const [h, y] of Object.entries(x.i)) if (!(have.i ??= {})[h] || even(y) < even(have.i[h])) have.i[h] = y;
    }
  }
  out.report = report;
  return out;
}

// (a trust for each row, walk-forward by month: keyOf(row) its group, fit on the rows of the months before only
// (desk.mjs fitTrust, the result and the close's chance), from start(key) with none; rows in the over frame { p raw,
// f, y, q, event, t })
// The map also answers at(k, t): k's trust as of the month of t, from the rows of the months before it (a row priced
// before its game's month, an open, reads the trust as of its own snapshot: no result after it, DECISIONS.md D48)
export function walkTrust(rows, keyOf, fitTrust, start) {
  const months = [...new Set(rows.map((x) => new Date(x.t).toISOString().slice(0, 7)))].sort();
  const out = new Map();
  const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
  // (each key's rows by their month, for at(k, t))
  const byKey = new Map();
  for (const x of rows) {
    const k = keyOf(x);
    (byKey.get(k) ?? byKey.set(k, []).get(k)).push(x);
  }
  const memo = new Map();
  out.at = (k, t) => {
    const m = monthOf(t);
    const id = `${k}|${m}`;
    if (memo.has(id)) return memo.get(id);
    const list = (byKey.get(k) ?? []).filter((x) => monthOf(x.t) < m).map(asBet);
    const v = list.length ? fitTrust(list, start(k)).trust : start(k);
    memo.set(id, v);
    return v;
  };
  function asBet(x) { return ({ market: x.market, model: x.raw, fair: x.f, event: x.event, status: x.y === 1 ? 'won' : x.y === 0 ? 'lost' : 'push', ...(fin(x.q) ? { clv: { q: x.q } } : {}), ...(fin(x.named) ? { named: x.named } : {}) }); }
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

// A version against the book on rows ({ p (priced over), raw (the bot's own), anch (the anchored chance, D33,
// where the version has it), f, y, w, event }): the log loss on the results, the version's (priced, raw and
// anchored) and the book's no-vig, recency-weighted (w), paired by row and clustered by game: { n, model, raw,
// anch, book, gap (model less book, under 0 better), lo, hi (its 95%), rawGap, anchGap, verdict }
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
  const anchored = dec.some((x) => fin(x.anch));
  const a = anchored ? bootDiff(pairRows(book, at((x) => (fin(x.anch) ? x.anch : x.raw))).clusters, { boot: 400 }) : null;
  return { n: pm.n, games: m.n, model: m.b, raw: r?.b ?? null, anch: a?.b ?? null, book: m.a, gap: m.diff, lo: m.lo, hi: m.hi, rawGap: r?.diff ?? null, anchGap: a?.diff ?? null, verdict: m.hi < 0 ? 'better' : m.lo > 0 ? 'worse' : 'tie' };
}

// (rows by season, each against the book: the seasons' table)
export function vsBookBySeason(rows) {
  const out = {};
  for (const s of [...new Set(rows.map((x) => x.season))].sort()) out[s] = vsBook(rows.filter((x) => x.season === s).map((x) => ({ ...x, w: 1 })));
  return out;
}

// The lines' history rows for a version: V (its modules), the sport, params and shape (its margins), expOf (game id
// -> its expectation), the games (extended), the history. { open: rows, close: rows }
// (DECISIONS.md D48, no look-ahead: expAtOf(id, at) the game's expectation as of the row's own snapshot (the ratings
// from the finals over by then, the day-of terms at what was known then; ratings.mjs replay's asOf), its factsAt the
// latest fact it read; where it can't say (a version from before it), the game's own expectation, stamped with
// factsOf(id), the latest fact that one read. Each row carries its factsAt; whole counts the rows at the game's own)
export function lineHistoryRows(V, sport, params, shape, expOf, games, hist, current, { expAtOf = null, factsOf = null } = {}) {
  const bets = historyLineBets(hist.events, hist.lines, games);
  const factsAt = new Map();
  let whole = 0;
  const expFor = (b) => {
    const at = Date.parse(b.at);
    const e = expAtOf && fin(at) ? expAtOf(b.event, at) : null;
    if (e) {
      factsAt.set(`${b.id}|${b.when}`, e.factsAt ?? null);
      return e;
    }
    const w = expOf(b.event);
    if (w) {
      whole++;
      factsAt.set(`${b.id}|${b.when}`, factsOf?.(b.event) ?? Date.parse(b.start));
    }
    return w;
  };
  const priced = V.backtest.repriced(bets, expFor, params, shape);
  const byGame = new Map(games.map((g) => [String(g.id), g]));
  const rows = [];
  for (const b of priced) {
    const g = byGame.get(b.event);
    const s = V.desk.settle(b, g);
    if (s.void) continue;
    const y = s.status === 'won' ? 1 : s.status === 'lost' ? 0 : null;
    rows.push({ id: b.kind === 'i' ? `${b.id}:i${b.h}` : `${b.id}:${b.kind}`, key: b.id, event: b.event, sport, market: b.market, stat: b.market, kind: b.kind, ...(b.kind === 'i' ? { h: b.h } : {}), line: b.line, day: etDay(Date.parse(b.start)), t: Date.parse(b.start), at: fin(Date.parse(b.at)) ? Date.parse(b.at) : null, factsAt: factsAt.get(`${b.id}|${b.when}`) ?? null, season: b.season, f: b.fair, raw: Math.min(0.999, Math.max(0.001, b.model)), y, q: null, overOdds: b.odds, underOdds: b.otherOdds, w: seasonWeight(sport, b.season, current).w, pin: !!b.pin, ...(fin(b.named) ? { named: b.named } : {}), ...(b.attr ? { attr: b.attr } : {}) });
  }
  // (a version with the totals rule (D44, desk.mjs trustStart): its totals' trust walks forward from 0, the named
  // terms' shift on each row at full weight)
  return { ...finish(V, rows, (x) => x.market, (k) => V.desk.trustStart?.(k, 0.5) ?? 0.5, 'lines'), whole };
}

// (the open rows' close chance at the same line (q), the close rows' open chance at it (fo: the move to date, known
// at the close), the trust walk-forward on the close rows, each row priced: desk.mjs chanceAt with the row as its
// ctx (a version with the residual model's hook, residual.mjs, reads it; an older chanceAt ignores a fifth argument))
// (exported for the MMA's rows, gate-mma.mjs, which prices its moneylines and round totals the same way)
export function finish(V, rows, keyOf, start, kind) {
  const close = new Map(rows.filter((x) => x.kind === 'c').map((x) => [x.key, x]));
  const open = new Map(rows.filter((x) => x.kind === 'o').map((x) => [x.key, x]));
  for (const x of rows) {
    const other = x.kind !== 'c' ? close.get(x.key) : open.get(x.key);
    if (!other || !(other.line === x.line || (other.line === null && x.line === null))) continue;
    if (x.kind !== 'c') x.q = other.f;
    else x.fo = other.f;
  }
  const closeRows = rows.filter((x) => x.kind === 'c');
  // (the model the trust reads and prices: the anchored chance where the version has it (anch, D33), else the
  // bot's own (raw))
  const modelOf = (x) => (fin(x.anch) ? x.anch : x.raw);
  const trust = walkTrust(closeRows.map((x) => ({ ...x, raw: modelOf(x) })), keyOf, V.desk.fitTrust, start);
  const trustOf = new Map([...trust].map(([x, t]) => [x.id, t]));
  // (a close row at its own month's trust; an open row at the trust as of its own snapshot (the months before the
  // snapshot's: no result after it), its game's close row's where it has no snapshot time)
  for (const x of rows) {
    // (research only: an optimistic intraday prop row (GATE_PROPS_INTRA) reads its close's own trust, as the close)
    const t = x.optimistic && close.get(x.key) ? (trustOf.get(close.get(x.key).id) ?? start(keyOf(x))) : x.kind !== 'c' && fin(x.at) ? trust.at(keyOf(x), x.at) : (trustOf.get(x.kind === 'c' ? x.id : close.get(x.key)?.id) ?? start(keyOf(x)));
    const ctx = { sport: x.sport, event: x.event, market: kind === 'lines' ? x.market : 'prop', stat: x.stat, line: x.line, side: 'over', f: x.f, raw: modelOf(x), overOdds: x.overOdds, underOdds: x.underOdds, t: x.t, at: fin(x.at) ? x.at : x.t - (x.kind === 'o' ? 24 * 36e5 : 36e5), kind: x.kind, ...(x.kind === 'i' && fin(x.at) ? { hours: (x.t - x.at) / 36e5 } : {}), fo: x.fo ?? null, home: x.home ?? null, season: x.season, ...(fin(x.named) ? { named: x.named } : {}) };
    x.p = Math.min(0.999, Math.max(0.001, V.desk.chanceAt(kind === 'lines' ? x.market : 'prop', x.f, modelOf(x), t, ctx)));
    // (the current price before the residual blend (the trust's chance), what the confidence layer reads as the
    // blend's start: confidence.mjs features, D52)
    x.pCur = Math.min(0.999, Math.max(0.001, V.desk.chanceAt(kind === 'lines' ? x.market : 'prop', x.f, modelOf(x), t)));
    x.trust = t;
    // (research only (REPLAY_ATTR, D72): the pieces' parts of the edge (p - f): each projection piece's part of the
    // Bot's own chance less the fair, scaled by what the anchor and the trust kept of it (pCur - f over raw - f), the
    // rest of the projection's gap the base (the ratings, or the player's own rate, against the Book), and the
    // calibration's (the residual blend: p - pCur))
    if (x.attr || process.env.REPLAY_ATTR === '1') {
      x.attr ??= {};
      const gap = x.raw - x.f;
      const lam = Math.abs(gap) > 1e-4 ? (x.pCur - x.f) / gap : 0;
      const out = {};
      let sum = 0;
      for (const [k, v] of Object.entries(x.attr)) {
        out[k] = v * lam;
        sum += out[k];
      }
      out.base = x.pCur - x.f - sum;
      out.cal = x.p - x.pCur;
      x.attr = out;
      x.lam = lam;
    }
  }
  return { open: rows.filter((x) => x.kind === 'o'), close: closeRows, intra: rows.filter((x) => x.kind === 'i') };
}

// The intraday lines (DECISIONS.md D63, intraday.mjs readIntraday's { rows, snaps }) as the archive's line rows of kind
// 'i': each event's book and market as they stood at the snapshot nearest each offset hour before its start (within
// SNAP_TOL), h the offset; both books read at the snapshot's time (a change-only row stands until its next one)
export const SNAP_TOL = 0.75 * 36e5;
export function intradayLines(events, intra, offsets) {
  const snaps = [...new Set(intra?.snaps ?? [])].map((s) => Date.parse(s)).filter(fin).sort((a, b) => a - b);
  const nearest = (t) => {
    let lo = 0;
    let hi = snaps.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (snaps[m] < t) lo = m + 1;
      else hi = m;
    }
    const c = [snaps[lo - 1], snaps[lo]].filter(fin).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    return fin(c) && Math.abs(c - t) <= SNAP_TOL ? c : null;
  };
  const out = [];
  for (const [oid, list] of intra?.rows ?? []) {
    const e = events.get(oid);
    const start = Date.parse(e?.t);
    if (!e || !fin(start)) continue;
    const seen = new Set();
    for (const h of offsets ?? []) {
      const T = nearest(start - h * 36e5);
      if (!fin(T) || T >= start || seen.has(T)) continue;
      seen.add(T);
      const last = new Map();
      for (const x of list) {
        if (x.ts > T) break;
        last.set(`${x.book}|${x.market}`, x);
      }
      const ts = new Date(T).toISOString();
      // (a price the files write gone by then (intraday.mjs buildRows' G row, the data-quality audit 2026-10-24) isn't
      // on the board at T: that book's market has no row there, never its older price carried forward)
      for (const x of last.values()) if (!x.gone) out.push({ oid, kind: 'i', h, ts, book: x.book, market: x.market, line: x.line, a: x.a, b: x.b });
    }
  }
  return out;
}

// The props' history rows: the replay's player games (each { stat, name, game, pid, v (what he did), mu (the
// version's projection), params, mix (its shape), over (its own over chance at a line: fn) }) matched to the
// history's index. Each row's raw is the bot's own chance (the version's recalibrated projection at the line);
// where the version has the anchor (anchor.mjs, D33) its anch is the anchored chance, the one the trust prices,
// at the pull fit walk-forward by season: a season's rows read the fit on the close rows of the seasons before it
// (the first season 0: the bot's own number). { open, close, anchor: { all (the fit on every season: what
// --record writes for the live desk), bySeason (each season's fit as read), current (the newest season's) } }
// (factsLead (DECISIONS.md D48): hours before the start the game's day-of facts are known at the earliest (context.mjs
// dayOfMinLead); the player game's projection reads the game's context whole (its info, its expected points), so each
// row's factsAt is the start less it: a row priced before then read facts it couldn't have had, and the replay never
// bets it there)
// (research only (REPLAY_ATTR, D72): a prop row's pieces, each the over's chance less the one with that piece's factor
// taken out of the projection (m.parts: each driver's log factor, gate.mjs))
function propAttr(m, line, raw) {
  const out = {};
  for (const [k, lf] of Object.entries(m.parts)) {
    if (!fin(lf) || !lf) continue;
    const q0 = m.overMu(line, m.mu / Math.exp(lf));
    if (fin(q0)) out[k] = raw - q0;
  }
  return out;
}
export function propHistoryRows(V, sport, index, matches, current, { factsLead = null } = {}) {
  const rows = [];
  for (const m of matches) {
    // (an index by player, propIndexByPlayer's, by his id; an older one by his name's key)
    const h = index.get(`${m.stat}|${m.pid}|${m.game}`) ?? index.get(`${m.stat}|${nameKey(m.name)}|${m.game}`);
    if (!h) continue;
    for (const kind of ['o', 'c']) {
      const x = h[kind];
      if (!x) continue;
      const raw = m.over(x.line);
      if (!fin(raw)) continue;
      const y = m.v > x.line ? 1 : m.v < x.line ? 0 : null;
      const id = `p:${m.stat}:${m.pid}:${m.game}`;
      rows.push({ id: `${id}:${kind}`, key: id, event: String(m.game), sport, market: 'prop', stat: m.stat, name: m.name ?? null, kind, yrs: m.yrs ?? null, line: x.line, day: etDay(Date.parse(h.start)), t: Date.parse(h.start), at: fin(Date.parse(x.ts)) ? Date.parse(x.ts) : null, factsAt: fin(factsLead) ? Date.parse(h.start) - factsLead * 36e5 : null, home: m.home ?? null, season: h.season, f: x.fair, raw: Math.min(0.999, Math.max(0.001, raw)), y, q: null, overOdds: x.over, underOdds: x.under, w: seasonWeight(sport, h.season, current).w, m, ...(m.parts && m.overMu ? { attr: propAttr(m, x.line, raw) } : {}) });
    }
    // (research only, GATE_PROPS_INTRA=1: the intraday snapshots (addIntradayProps' x.i) as rows of kind 'i' at their own
    // line and price, the projection at the close's facts (an OPTIMISTIC bound: the day-of facts a fair early row can't
    // have), so no factsAt stamp: the replay holds them to the lineup risk's surviving share at their hours instead)
    if (h.i && process.env.GATE_PROPS_INTRA === '1') {
      for (const [hh, x] of Object.entries(h.i)) {
        const raw = m.over(x.line);
        if (!fin(raw)) continue;
        const id = `p:${m.stat}:${m.pid}:${m.game}`;
        rows.push({ id: `${id}:i${hh}`, key: id, event: String(m.game), sport, market: 'prop', stat: m.stat, name: m.name ?? null, kind: 'i', h: Number(hh), optimistic: true, yrs: m.yrs ?? null, line: x.line, day: etDay(Date.parse(h.start)), t: Date.parse(h.start), at: Date.parse(x.ts), factsAt: null, home: m.home ?? null, season: h.season, f: x.fair, raw: Math.min(0.999, Math.max(0.001, raw)), y: m.v > x.line ? 1 : m.v < x.line ? 0 : null, q: null, overOdds: x.over, underOdds: x.under, w: seasonWeight(sport, h.season, current).w, m });
      }
    }
  }
  let anchor = null;
  // (a version with the anchor fits it on every sport (the readout); it prices only the sports it's on for
  // (anchor.mjs anchorOn: the gate's verdict by sport), the rest at the bot's own chance)
  const priceIt = !!V.anchor?.anchorOn?.(sport);
  if (V.anchor?.fitAnchor && V.project?.impliedMean) {
    // (each row's implied mean at its own line and fair, once)
    for (const x of rows) x.im = fin(x.m.mu) && x.m.params ? V.project.impliedMean(x.line, x.f, x.m.params, x.m.mix) : null;
    const fitRows = (list) => list.filter((x) => x.kind === 'c' && fin(x.im) && x.im > 0).map((x) => ({ stat: x.stat, mu: x.m.mu, im: x.im, line: x.line, params: x.m.params, mix: x.m.mix, y: x.y, w: x.w }));
    const seasons = [...new Set(rows.map((x) => x.season))].sort((a, b) => a - b);
    const bySeason = {};
    for (const s of seasons) {
      const before = rows.filter((x) => x.season < s);
      const fit = before.length ? V.anchor.fitAnchor(fitRows(before), { at: `before ${s}` }) : null;
      bySeason[s] = fit;
      for (const x of rows) {
        if (x.season !== s) continue;
        const c = priceIt && fin(x.im) && x.im > 0 ? V.anchor.anchoredChances(x.line, x.m.mu, x.m.params, x.m.mix, x.f, V.anchor.anchorEntry(fit, x.stat)) : null;
        x.anch = c ? Math.min(0.999, Math.max(0.001, c.over)) : x.raw;
        x.pull = c ? c.pull : 0;
      }
    }
    // (the experience pull (D82, measuring: YOUNG_PULL, the multipliers tried on a young player's pull): each
    // season's multiplier by stat and experience picked on the closes of the seasons before it, 1 under YP_MIN rows)
    const YP = process.env.YOUNG_PULL ? process.env.YOUNG_PULL.split(',').map(Number).filter(fin) : null;
    const young = {};
    if (YP?.length && priceIt) {
      const bk = (x) => (!fin(x.yrs) || x.yrs >= 3 ? null : x.yrs <= 0 ? 'r' : x.yrs === 1 ? 'y2' : 'y3');
      for (const x of rows) {
        const b = bk(x);
        if (!b || !fin(x.im) || !(x.im > 0)) continue;
        const e = V.anchor.anchorEntry(bySeason[x.season], x.stat);
        x._am = YP.map((m) => {
          const ent = e && typeof e === 'object' ? { ...e, pull: (e.pull ?? 0) * m, d: (e.d ?? 0) * m } : fin(e) ? e * m : null;
          const c = V.anchor.anchoredChances(x.line, x.m.mu, x.m.params, x.m.mix, x.f, ent);
          return c ? Math.min(0.999, Math.max(0.001, c.over)) : x.anch;
        });
        x._ak = `${x.stat}|${b}`;
      }
      const ll = (p, y) => -(y ? Math.log(p) : Math.log(1 - p));
      for (const s of seasons) {
        const tally = new Map();
        for (const x of rows) if (x._am && x.season < s && x.kind === 'c' && (x.y === 0 || x.y === 1)) {
          const t = tally.get(x._ak) ?? { n: 0, l: YP.map(() => 0) };
          t.n++;
          x._am.forEach((p, i) => (t.l[i] += ll(p, x.y)));
          tally.set(x._ak, t);
        }
        const pick = {};
        for (const [k, t] of tally) {
          const one = YP.indexOf(1);
          let best = one >= 0 ? one : 0;
          if (t.n >= 300) t.l.forEach((v, i) => { if (v < t.l[best] - 1e-9) best = i; });
          pick[k] = { m: YP[best], n: t.n };
        }
        young[s] = pick;
        for (const x of rows) if (x._am && x.season === s) {
          const m = pick[x._ak]?.m ?? 1;
          const i = YP.indexOf(m);
          if (i >= 0) x.anch = x._am[i];
        }
      }
      for (const x of rows) delete x._am, delete x._ak;
    }
    anchor = { all: { ...V.anchor.fitAnchor(fitRows(rows)), on: priceIt }, bySeason, current: bySeason[seasons[seasons.length - 1]] ?? null, on: priceIt, ...(YP?.length ? { young } : {}) };
  }
  // (the projection's mean and spread, and the Book's implied mean, kept on the row for the confidence layer's
  // features (confidence.mjs sdEdge, imGap; D52): the edge in standard deviations of the Bot's own number)
  for (const x of rows) {
    const mu = x.m?.mu;
    if (fin(mu) && x.m.params) {
      x.mu = mu;
      const r = V.project?.rAt ? V.project.rAt(x.m.params, mu) : null;
      x.sd = fin(r) && r > 0 ? Math.sqrt(mu + (mu * mu) / r) : Math.sqrt(Math.max(0, mu));
      if (!fin(x.im) && V.project?.impliedMean) {
        const im = V.project.impliedMean(x.line, x.f, x.m.params, x.m.mix);
        x.im = fin(im) ? im : null;
      }
    }
    delete x.m;
  }
  const B = V.desk.BUCKET_START ?? { low: 0.25, mid: 0.375, high: 0.5 };
  const bucket = V.desk.lineBucket ?? ((l) => (l <= 1.5 ? 'low' : l <= 3.5 ? 'mid' : 'high'));
  const done = finish(V, rows, (x) => `${x.stat}@${bucket(x.line)}`, (k) => B[k.split('@')[1]] ?? 0.5, 'props');
  // (the lineup risk (lineup-risk.mjs, D42): each player game's open against its close on the Bot's own side at the
  // open, both at the priced chance (the trust's, the anchor's where the version has it): the share of its edge that
  // survived to the close, by stat; what --record writes for the live desk. A version without the module has none)
  let risk = null;
  if (V.lineupRisk?.fitLineupRisk) {
    const closeBy = new Map(done.close.map((x) => [x.key, x]));
    const pairs = [];
    for (const o of done.open) {
      const c = closeBy.get(o.key);
      if (!c || !fin(o.p) || !fin(c.p) || !fin(o.f) || !fin(c.f)) continue;
      const side = o.p >= o.f ? 1 : -1;
      pairs.push({ stat: o.stat, eo: side * (o.p - o.f), ec: side * (c.p - c.f), moved: o.line !== c.line || Math.abs(c.f - o.f) >= (V.lineupRisk.MOVED_PTS ?? 0.05), lead: fin(o.at) ? (o.t - o.at) / 36e5 : null });
    }
    risk = V.lineupRisk.fitLineupRisk(pairs, { at: new Date().toISOString() });
  }
  return { ...done, anchor, risk };
}

// The history a sport has, loaded once: { events, lines, props } (odds-history.mjs readHistory)
// (lines quarantined from the gate's history, by sport: [from, to) on the event's start. MLB's 2020 opening week
// (the shortened season's exhibitions and first games to the night of 07-31 Eastern): the data-quality audit
// (2026-10-24) found DraftKings and Pinnacle at the same snapshot more than 5 points apart on 72 of the week's 188
// pairs against 5 of the rest of 2020's 1,347 (20 of the week's mirror images, Pinnacle at placeholder prices like
// -104/-112 on several, DraftKings' own no-vig the worse on the results: log loss 0.729 against 0.669 at the opens);
// the side DraftKings priced past Pinnacle's no-vig went +30.8u on 91 flat bets (+34%) against -12.5u the rest of 2020.
// No per-row test removes exactly the bad ones (the mirror test catches 20 of the 72; the placeholder prices aren't
// mirrors), so the week's lines (702 rows, 112 events) are left out whole: its events and finals stay (the ratings read
// them), its prices are never a row, a fair or a close)
export const LINE_QUARANTINE = { mlb: [['2020-07-20T00:00:00Z', '2020-08-01T10:00:00Z']] };
export function quarantined(sport, t, windows = LINE_QUARANTINE) {
  const at = Date.parse(t);
  return (windows[sport] ?? []).some(([a, b]) => at >= Date.parse(a) && at < Date.parse(b));
}
export function loadHistory(sport, { windows = LINE_QUARANTINE } = {}) {
  const hist = readHistory(sport);
  if (!windows[sport]?.length) return hist;
  const out = [];
  let dropped = 0;
  for (const l of hist.lines) {
    if (quarantined(sport, hist.events.get(l.oid)?.t, windows)) dropped++;
    else out.push(l);
  }
  hist.lines = out;
  hist.quarantined = dropped;
  return hist;
}

// (rows slimmed for the score file: what betCompare and vsBook read)
export const slim = (rows) => rows.map((x) => ({ id: x.id, event: x.event, sport: x.sport, stat: x.stat, line: x.line, day: x.day, t: x.t, season: x.season, f: r4(x.f), p: r4(x.p), raw: r4(x.raw), ...(fin(x.anch) ? { anch: r4(x.anch), pull: r4(x.pull) } : {}), y: x.y, q: x.q === null ? null : r4(x.q), overOdds: x.overOdds, underOdds: x.underOdds, w: r4(x.w) }));
