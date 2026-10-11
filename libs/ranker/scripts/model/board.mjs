// The betting board: every market the bettor priced on the games not started, each side with the bot's Kelly
// score and band, so a user can play-bet any of them (the bot's picks only its suggestions, lit by band). Main
// lines only, the stats the bot models; a prop once the bot has priced it at the book's own price (never at an
// assumed -110). Written each run when it changes (run.mjs writeBoard: apps/<sport>/src/StaticData/model/
// board.json, served at /<sport>/data/model/board.json); a game gone from it once it starts.
//
//   sport   the board's sport;  at  when it was written
//   games   the games not started, the soonest first, each:
//     id      ESPN's event id;  start  its start (ISO);  m  its matchup, "AWY @ HOM"
//     a, h    the away and home teams: [abbreviation, ESPN team id]
//     at      when its game lines were last priced
//     k       its game markets, each a list of its two sides: spread [home, away], total [over, under],
//             ml [home, away]; a side { s: side, l: line (null on a moneyline), o: price, c: the bot's trusted
//             chance it wins, ks: its Kelly score (picks.mjs kellyOf, the picks' order), b: its band (picks.mjs
//             level: lock, high (LOVE), medium (LIKE), low (PASS); check where the market is a CHECK, on the
//             model's side), bot: 'bet' or 'check' where the bot has that side open (its ledger) }
//     p       its props, each { n: player, id: ESPN athlete id, t: his team's ESPN id, k: the stat's key, lb: its
//             label, l: line, o: [over price, under price] (null a side unknown), c: the bot's trusted chance
//             over, ks: [over's Kelly, under's] and b: [over's band, under's] (null where unpriced), sk: 1 where a
//             guard has the bot pass on it (his status, the line's move, a layoff: its bands PASS), at: when
//             priced, bot and bk: the side the bot has open and 'bet' or 'check' }
//
// And the board seen (seenUpdate: apps/<sport>/scripts/model/board-seen.json, committed, not deployed): every
// market, side, line and price each game's board has shown, kept a week past its start, so the play-money
// settler can check a bet's price against it after the game's gone from the board (settle-lib.mjs
// boardObservations). An entry "market|side|line|price|stat|athlete" (line, stat and athlete empty where none),
// with the first and last time a board showed it (ms), so a bet takes it only while it was on show.

import { round } from './ratings.mjs';
import { chanceAt, decimal, gapGuard } from './desk.mjs';
import { CHECK_KINDS } from './checks.mjs';
import { kellyOf, level } from './picks.mjs';

// (a game's seen prices kept this long past its start: past the settler's longest wait, props.mjs PROP_WAIT)
export const SEEN_KEEP = 8 * 864e5;

// (a side's band: check where it's a CHECK; PASS with no edge or a guard's pass; else its Kelly score's)
const bandOf = (kelly, p, ev, { check = false, pass = false } = {}) => (check ? 'check' : pass || !(ev > 0) ? 'low' : level(kelly, p));

// A game's markets as the board's (desk.mjs price's: each market's two sides, the model's chance and the book's
// fair one), each side at its trusted chance (desk.mjs chanceAt, choose's), trust: a market's key to its trust
export function boardMarkets(markets, trustOf) {
  const out = {};
  for (const m of markets ?? []) {
    const [s0] = m.sides;
    // (past the market's gap, a CHECK on the model's side: run.mjs betGames' guard)
    const checkSide = gapGuard(m.market, s0.model, s0.fair) ? (s0.model - s0.fair >= 0 ? s0.side : m.sides[1].side) : null;
    out[m.market] = m.sides.map((s) => {
      const p = s.anchored === false ? s.fair : chanceAt(m.market, s.fair, s.model, trustOf(m.market));
      const ev = (1 - (s.push ?? 0)) * (p * decimal(s.odds) - 1);
      const ks = kellyOf(s.odds, p);
      return { s: s.side, l: m.market === 'ml' ? null : s.line, o: s.odds, c: round(p, 3), ks, b: bandOf(ks, p, ev, { check: s.side === checkSide }) };
    });
  }
  return out;
}

// A priced prop (props.mjs priceProps's) as the board's, at its book price (none: null)
export function boardProp(x, at) {
  const by = Object.fromEntries((x.sides ?? []).map((s) => [s.side, s]));
  const check = CHECK_KINDS.has(x.guard?.kind);
  const pass = !!x.guard?.skip && !check;
  const prices = x.prop.prices ?? {};
  const side = (k) => {
    const s = by[k];
    const o = Number.isFinite(prices[k]) ? prices[k] : null;
    if (!s || o === null) return { o, ks: null, b: null };
    const ks = kellyOf(o, s.p);
    return { o, ks, b: bandOf(ks, s.p, s.ev, { check: check && x.side === k, pass }) };
  };
  const over = side('over');
  const under = side('under');
  return {
    n: x.prop.athlete.name,
    id: String(x.prop.athlete.id),
    t: x.prop.athlete.team != null ? String(x.prop.athlete.team) : null,
    k: x.prop.stat.key,
    lb: x.prop.stat.label,
    l: x.prop.line,
    o: [over.o, under.o],
    c: by.over ? round(by.over.p, 3) : by.under ? round(1 - by.under.p, 3) : null,
    ks: [over.ks, under.ks],
    b: [over.b, under.b],
    ...(pass ? { sk: 1 } : {}),
    at,
  };
}

// (a prop's key on its game: its stat and player)
const propKey = (p) => `${p.k}:${p.id}`;
// (a board row without its time or the bot's marks: what's compared run to run)
const bare = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'at' || k === 'bot' || k === 'bk' ? undefined : v)));

// The board: this run's priced games (games: id -> { game, markets (boardMarkets's), at }) and props (props: id
// -> { rows (boardProp's), whole: true when the game's board was asked fresh this run (The Odds API's, or a
// board with prices of its own), so a prop not on it is gone; lines: stat:athlete -> the line the book shows
// now }), over the last board (prev): a game or prop not priced this run kept as it was (the NFL's props are
// asked a few times a game: between asks the last price stands), unless its line has moved on the book's
// board since; the games started dropped. bets, checks: the ledger's, its open ones marked (bot)
export function buildBoard(sport, { prev = null, games = new Map(), props = new Map(), bets = [], checks = [], now = new Date() } = {}) {
  const t = now.getTime();
  const out = new Map();
  for (const g of prev?.games ?? []) if (Date.parse(g.start) > t) out.set(String(g.id), { ...g, k: g.k ?? {}, p: g.p ?? [] });
  for (const [id, { game, markets, at }] of games) {
    if (Date.parse(game.date) <= t) continue;
    const was = out.get(String(id));
    // (its time kept while its prices are the same: the file changes only when the board does)
    const same = was && JSON.stringify(bare(was.k)) === JSON.stringify(bare(markets));
    out.set(String(id), { id: String(id), start: game.date, m: `${game.awayAbbr} @ ${game.homeAbbr}`, a: [game.awayAbbr, String(game.away)], h: [game.homeAbbr, String(game.home)], at: same ? was.at : at, k: markets, p: was?.p ?? [] });
  }
  for (const [id, { rows, whole, lines }] of props) {
    const g = out.get(String(id));
    if (!g) continue;
    const kept = whole ? [] : (g.p ?? []).filter((p) => !lines?.has(propKey(p)) || lines.get(propKey(p)) === p.l);
    const before = new Map((g.p ?? []).map((p) => [propKey(p), p]));
    const fresh = new Map(rows.map((p) => [propKey(p), before.has(propKey(p)) && JSON.stringify(bare(before.get(propKey(p)))) === JSON.stringify(bare(p)) ? { ...p, at: before.get(propKey(p)).at } : p]));
    g.p = [...kept.filter((p) => !fresh.has(propKey(p))), ...fresh.values()].sort((x, y) => x.n.localeCompare(y.n) || x.k.localeCompare(y.k));
  }
  // (the bot's open sides: its bets, and its CHECKs not closed, graded or bet after all, as the picks' list)
  const marks = [...bets.filter((b) => b.status === 'open' && !b.void).map((b) => [b, 'bet']), ...checks.filter((c) => !c.checkResult && !c.bet && !c.closedAt).map((c) => [c, 'check'])];
  for (const g of out.values()) {
    for (const k of Object.values(g.k)) for (const s of k) delete s.bot;
    for (const p of g.p) delete p.bot, delete p.bk;
  }
  for (const [b, kind] of marks) {
    const g = out.get(String(b.event));
    if (!g) continue;
    if (b.market === 'prop') {
      const p = g.p.find((x) => x.k === b.propType && x.id === String(b.athlete));
      if (p && !(p.bk === 'bet' && kind === 'check')) Object.assign(p, { bot: b.side, bk: kind });
    } else {
      const s = g.k[b.market]?.find((x) => x.s === b.side);
      if (s && s.bot !== 'bet') s.bot = kind;
    }
  }
  const list = [...out.values()].sort((x, y) => x.start.localeCompare(y.start) || x.id.localeCompare(y.id));
  return { sport, at: now.toISOString(), games: list };
}

// (a board's prices as the seen entries: "market|side|line|price|stat|athlete")
export function seenOf(g) {
  const out = [];
  for (const [market, sides] of Object.entries(g.k ?? {})) for (const s of sides) if (Number.isFinite(s.o)) out.push(`${market}|${s.s}|${s.l ?? ''}|${s.o}||`);
  for (const p of g.p ?? []) for (const [i, side] of ['over', 'under'].entries()) if (Number.isFinite(p.o?.[i])) out.push(`prop|${side}|${p.l}|${p.o[i]}|${p.k}|${p.id}`);
  return out;
}

// The board seen brought up to date: each game's entries with this board's added, the games a week past their
// start dropped; an entry shown again its last time now. seen: { sport, games: { [event]: { start, o: { [entry]:
// [firstAt, lastAt] } } } }
export function seenUpdate(seen, board, now = new Date()) {
  const t = now.getTime();
  const games = { ...(seen?.games ?? {}) };
  for (const g of board.games) {
    const was = games[g.id]?.o;
    const o = was && !Array.isArray(was) ? { ...was } : {};
    for (const e of seenOf(g)) o[e] = [o[e]?.[0] ?? t, t];
    games[g.id] = { start: g.start, o };
  }
  for (const [id, g] of Object.entries(games)) if (!(Date.parse(g.start) > now.getTime() - SEEN_KEEP)) delete games[id];
  return { sport: board.sport, games };
}
