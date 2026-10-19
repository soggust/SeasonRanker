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
//             level: lock, high (LOVE), medium (LIKE), low (PASS); check where the market is a CHECK the page
//             shows, on the model's side: never a game market's now, the gap's a shadow (checks.mjs shadowOf),
//             both sides PASS; sr its reason, D31), bot: 'bet' or 'check' where the bot has that side open (its ledger); fc: the
//             other books' consensus fair chance of that side at the book's line and cn how many books (none
//             without a consensus: oddsapi.mjs consensusOf), dv: 1 where the book's price beats it by OUTLIER
//             or more (the data's: nothing is priced off it), cap: 'medium' where the desk holds any bet on that
//             side to a LIKE at most whatever its price (cr: why, the desk's words: sideCap below, picks.mjs
//             capOf; the lines' CLV gate at the practice stake), so the Book's suggestions and the what-if never
//             show a band the Bot couldn't give it (DECISIONS.md D36). A suspect price's LIKE (desk.mjs
//             EV_SUSPECT, D23) is the price's: in b here, worked again by the page at any other price }
//     p      its props, each { n: player, id: ESPN athlete id, t: his team's ESPN id, k: the stat's key, lb: its
//             label, l: line, o: [over price, under price] (null a side unknown), c: the bot's trusted chance
//             over, ks: [over's Kelly, under's] and b: [over's band, under's] (null where unpriced), sk: 1 where a
//             guard has the bot pass on it (his status, the line's move, a layoff, a gap or a small role CHECK's
//             shadow (checks.mjs shadowOf, as the run judges it): its bands PASS), sw: a shadow's passAs
//             ('gap' or 'small', why it's a PASS), sr: every skip's reason in words (skipReason: the guard's why,
//             DECISIONS.md D31: no silent skip), at: when priced, bot and bk: the side the bot has open and
//             'bet' or 'check', fc and cn: the other books' consensus fair chance over and how many books, dv:
//             the side ('over' or 'under') the book's price beats it on by OUTLIER or more (as the game markets'),
//             cap: [over's, under's] the desk's cap as a game side's (the stat's CLV gate at the practice stake on
//             both, a role bet's on its own side; null none) and cr its why, there only where a side has one }
//
// A side the desk wouldn't bet at the board's price at all (boardMarkets off: a price not the Book's own, ESPN's
// line where the desk asks The Odds API, tracked only) is a PASS with its reason (sr): never a band the Bot
// couldn't give (D36).
//
// And the board seen (seenUpdate: apps/<sport>/scripts/model/board-seen.json, committed, not deployed): every
// market, side, line and price each game's board has shown, kept a week past its start, so the play-money
// settler can check a bet's price against it after the game's gone from the board (settle-lib.mjs
// boardObservations). An entry "market|side|line|price|stat|athlete" (line, stat and athlete empty where none),
// with the first and last time a board showed it (ms), so a bet takes it only while it was on show.

import { round } from './ratings.mjs';
import { EV_SUSPECT, chanceAt, decimal, gapGuard, isTracked, sideCtx } from './desk.mjs';
import { CHECK_KINDS, causeOf, shadowOf } from './checks.mjs';
import { capBand, capOf, edgeLevel, kellyOf } from './picks.mjs';

// (a game's seen prices kept this long past its start: past the settler's longest wait, props.mjs PROP_WAIT)
export const SEEN_KEEP = 8 * 864e5;

// (a game market's side's consensus (c: its market's, the first side's fair: oddsapi.mjs consensusOf): fc, cn, dv)
const consensusOf = (c, side, first) => (Number.isFinite(c?.fair) ? { fc: round(side === first ? c.fair : 1 - c.fair, 4), cn: c.n, ...(c.outlier === side ? { dv: 1 } : {}) } : {});

// (a side's band: check where it's a CHECK; PASS with no edge or a guard's pass; else its Kelly score's, LIKE at the
// least, held to the desk's cap (picks.mjs capBand) and a suspect price's LIKE (desk.mjs EV_SUSPECT, D23))
export const bandOf = (kelly, p, ev, { check = false, pass = false, cap = null } = {}) =>
  check ? 'check' : pass || !(ev > 0) ? 'low' : capBand(edgeLevel(kelly, p), Math.abs(ev) > EV_SUSPECT ? 'medium' : cap);

// The desk's cap on a side from the marks a bet on it would carry (picks.mjs capOf: a gate's practice stake, a role
// bet, a research pick not earned): the board's { cap, cr } where there is one (DECISIONS.md D36), else {}
export function sideCap(marks) {
  const cap = marks ? capOf(marks) : null;
  if (!cap) return {};
  const role = marks.context?.roleBet;
  const why = [marks.practice, role ? `a role bet (${role.why ?? role.key ?? 'its cause'}): a LIKE at most` : null].find((v) => typeof v === 'string' && v.trim());
  return { cap, ...(why ? { cr: skipReason({ why }) } : {}) };
}

// A game's markets as the board's (desk.mjs price's: each market's two sides, the model's chance and the book's
// fair one), each side at its trusted chance (desk.mjs chanceAt, choose's), trust: a market's key to its trust;
// consensus: the other books' by market (the lines', oddsapi.mjs consensusOf's), the data's, beside each side;
// ctx: the game's, for the residual model (desk.mjs sideCtx, D32), so the board shows the chance the desk bets at.
// gate: the lines' CLV gate (desk.mjs lineGate's; off, every side at the practice stake: cap LIKE); off: why the desk
// wouldn't bet these prices at all (not the Book's own: ESPN's line), every side a PASS saying so (D31, D36)
export function boardMarkets(markets, trustOf, consensus = null, ctx = null, { gate = null, off = null } = {}) {
  const capped = gate && gate.on === false ? sideCap({ practice: String(gate.why || 'the game lines at the practice stake') }) : {};
  const out = {};
  for (const m of markets ?? []) {
    const [s0] = m.sides;
    // (past the market's gap, run.mjs betGames' guard skips it: a CHECK on the model's side only where the run
    // shows it one (checks.mjs shadowOf: the gap's never), else a PASS both sides)
    const gapped = gapGuard(m.market, s0.model, s0.fair);
    const mine = s0.model - s0.fair >= 0 ? s0 : m.sides[1];
    const checkSide = gapped && !shadowOf({ cause: 'gap', odds: mine.odds, model: mine.model, fair: mine.fair }) ? mine.side : null;
    const pass = (!!gapped && !checkSide) || !!off;
    const sr = off ? skipReason({ why: off }) : pass ? skipReason(gapped) : null;
    out[m.market] = m.sides.map((s) => {
      const p = s.anchored === false ? s.fair : chanceAt(m.market, s.fair, s.model, trustOf(m.market), sideCtx(m, s, ctx));
      const ev = (1 - (s.push ?? 0)) * (p * decimal(s.odds) - 1);
      const ks = kellyOf(s.odds, p);
      return { s: s.side, l: m.market === 'ml' ? null : s.line, o: s.odds, c: round(p, 3), ks, b: bandOf(ks, p, ev, { check: s.side === checkSide && !off, pass, cap: capped.cap }), ...(sr ? { sr } : {}), ...(pass ? {} : capped), ...consensusOf(consensus?.[m.market], s.side, s0.side) };
    });
  }
  return out;
}

// A skip's reason as the board says it (DECISIONS.md D31: no silent skip): the guard's own words, its first SR_MAX
// characters; a guard with none says so, never an empty PASS
export const SR_MAX = 200;
export const skipReason = (guard) => {
  const why = String(guard?.why ?? '').trim();
  if (!why) return 'a guard with no reason recorded';
  return why.length > SR_MAX ? `${why.slice(0, SR_MAX - 1).trimEnd()}…` : why;
};

// A priced prop (props.mjs priceProps's) as the board's, at its book price (none: null); gate: its stat's CLV gate
// (desk.mjs propGate's; off, both sides at the practice stake: cap LIKE), and a role bet's cap on its own side
export function boardProp(x, at, { gate = null } = {}) {
  const by = Object.fromEntries((x.sides ?? []).map((s) => [s.side, s]));
  // (a CHECK the page shows: a CHECK's guard and not a shadow, judged on the model's side's price and chances as
  // the run's CHECK is (checks.mjs checkOf); a shadow a PASS)
  const shadow = CHECK_KINDS.has(x.guard?.kind) ? shadowOf({ cause: causeOf(x.guard), odds: x.odds, model: x.model, fair: x.fair, oddsAssumed: !x.priced, trust: x.trust, line: x.prop?.line }) : null;
  const check = CHECK_KINDS.has(x.guard?.kind) && !shadow;
  const pass = !!x.guard?.skip && !check;
  const prices = x.prop.prices ?? {};
  const gated = gate && gate.on === false ? `${x.prop.stat.key} ${gate.why || 'at the practice stake'}` : null;
  const capOn = (k) => (pass ? {} : sideCap({ practice: gated, context: x.roleBet && x.side === k ? { roleBet: x.roleBet } : null }));
  const side = (k) => {
    const s = by[k];
    const o = Number.isFinite(prices[k]) ? prices[k] : null;
    const c = capOn(k);
    if (!s || o === null) return { o, ks: null, b: null, c };
    const ks = kellyOf(o, s.p);
    return { o, ks, b: bandOf(ks, s.p, s.ev, { check: check && x.side === k, pass, cap: c.cap }), c };
  };
  const over = side('over');
  const under = side('under');
  const cr = over.c.cr ?? under.c.cr;
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
    ...(pass && shadow ? { sw: shadow.passAs } : {}),
    ...(pass ? { sr: skipReason(x.guard) } : {}),
    ...(over.c.cap || under.c.cap ? { cap: [over.c.cap ?? null, under.c.cap ?? null], ...(cr ? { cr } : {}) } : {}),
    ...(Number.isFinite(x.prop.consensus?.fair) ? { fc: x.prop.consensus.fair, cn: x.prop.consensus.n, ...(x.prop.consensus.outlier ? { dv: x.prop.consensus.outlier } : {}) } : {}),
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
  // (the bot's open sides: its bets, and its CHECKs not closed, graded or bet after all, as the picks' list; a
  // shadow never, checks.mjs shadowOf; a tracked row never: not bet, desk.mjs TRACK)
  const marks = [...bets.filter((b) => b.status === 'open' && !b.void && !isTracked(b)).map((b) => [b, 'bet']), ...checks.filter((c) => !c.hidden && !c.checkResult && !c.bet && !c.closedAt).map((c) => [c, 'check'])];
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

// (the bot's side on each of a game's markets as the board shows it: the side with the higher Kelly score, a
// negative one too (a side it would pass on), at that side's line and price; key "market|stat|athlete" (stat
// and athlete empty off a prop) -> [side, line, price, kelly]. A side with no price or score loses to one with)
export function botSidesOf(g) {
  const out = {};
  const better = (a, b) => (!Number.isFinite(b?.[3]) ? a : !Number.isFinite(a?.[3]) ? b : b[3] > a[3] ? b : a);
  for (const [market, sides] of Object.entries(g.k ?? {})) {
    const [x, y] = (sides ?? []).filter((s) => Number.isFinite(s.o)).map((s) => [s.s, market === 'ml' ? null : (s.l ?? null), s.o, Number.isFinite(s.ks) ? s.ks : null]);
    const pick = better(x, y);
    if (pick && Number.isFinite(pick[3])) out[`${market}||`] = pick;
  }
  for (const p of g.p ?? []) {
    const [x, y] = ['over', 'under'].map((side, i) => (Number.isFinite(p.o?.[i]) ? [side, p.l, p.o[i], Number.isFinite(p.ks?.[i]) ? p.ks[i] : null] : null));
    const pick = better(x, y);
    if (pick && Number.isFinite(pick[3])) out[`prop|${p.k}|${p.id}`] = pick;
  }
  return out;
}

// The bot's sides seen (botSidesOf's) kept through the game's life, for You vs the Bot (the play-money settler,
// settle-lib.mjs botPickAt): each market a list of [from, to, side, line, price, kelly], a new row when the
// side, line, price or the Kelly score to two places moves, else the last row's to brought up to now
export function botSeenUpdate(was, g, t) {
  const out = {};
  for (const [k, rows] of Object.entries(was && typeof was === 'object' ? was : {})) if (Array.isArray(rows)) out[k] = rows.slice();
  for (const [k, [side, line, price, kelly]] of Object.entries(botSidesOf(g))) {
    const rows = (out[k] ??= []);
    const last = rows[rows.length - 1];
    const same = last && last[2] === side && last[3] === line && last[4] === price && Math.round(last[5] * 100) === Math.round(kelly * 100);
    if (same) rows[rows.length - 1] = [last[0], Math.max(last[1], t), ...last.slice(2)];
    else rows.push([t, t, side, line, price, round(kelly, 4)]);
  }
  return out;
}

// The board seen brought up to date: each game's entries with this board's added, the games a week past their
// start dropped; an entry shown again its last time now; the bot's sides too (botSeenUpdate). seen: { sport,
// games: { [event]: { start, o: { [entry]: [firstAt, lastAt] }, b: { [market key]: rows } } } }
export function seenUpdate(seen, board, now = new Date()) {
  const t = now.getTime();
  const games = { ...(seen?.games ?? {}) };
  for (const g of board.games) {
    const was = games[g.id]?.o;
    const o = was && !Array.isArray(was) ? { ...was } : {};
    for (const e of seenOf(g)) o[e] = [o[e]?.[0] ?? t, t];
    games[g.id] = { start: g.start, o, b: botSeenUpdate(games[g.id]?.b, g, t) };
  }
  for (const [id, g] of Object.entries(games)) if (!(Date.parse(g.start) > now.getTime() - SEEN_KEEP)) delete games[id];
  return { sport: board.sport, games };
}
