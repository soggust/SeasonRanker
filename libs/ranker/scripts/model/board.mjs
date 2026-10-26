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
//             ml [home, away]; a side { s: side, l: line (null on a moneyline), o: price (D74: the best US book's at the
//             Book's line where a paid quote brought one, pb its book's code, best-price.mjs; no pb: ESPN's board, the
//             Book's own; D81: pt the paid quote's time and dko DraftKings' own price in it (none where pb is 'dk'),
//             a fresh paid price held over a later ESPN read: heldPaid), c: the bot's trusted
//             chance it wins, ks: its Kelly score (picks.mjs kellyOf, the picks' order), b: its band (picks.mjs
//             level: lock, high (LOVE), medium (LIKE), low (PASS); check where the market is a CHECK the page
//             shows, on the model's side: never a game market's now, the gap's a shadow (checks.mjs shadowOf),
//             both sides PASS; sr its reason, D31), bot: 'bet' or 'check' where the bot has that side open (its ledger); fc: the
//             other books' consensus fair chance of that side at the book's line and cn how many books (none
//             without a consensus: oddsapi.mjs consensusOf), dv: 1 where the book's price beats it by OUTLIER
//             or more (the data's: nothing is priced off it), cap: 'medium' where the desk holds any bet on that
//             side to a LIKE at most whatever its price (cr: why, the desk's words: sideCap below, picks.mjs
//             capOf; the lines' CLV gate at the practice stake), so the Book's suggestions and the what-if never
//             show a band the Bot couldn't give it (DECISIONS.md D46). A suspect price's LIKE (desk.mjs
//             isSuspect, D23) is the price's: in b here, worked again by the page at any other price; q: the
//             confidence layer's quality of the side (confidence.mjs qualityOf, D52: the stake's Kelly at its
//             calibrated chance), and cap 'high' (a LOVE at most) or 'medium' where its tiers hold the side }
//     p      its props, each { n: player, id: ESPN athlete id, t: his team's ESPN id, k: the stat's key, lb: its
//             label, l: line, o: [over price, under price] (null a side unknown; D74 the best US book's, pb [over's book,
//             under's] where a paid quote brought them; D81 pt the quote's time, dko [over's, under's] DraftKings' own in
//             it, a fresh paid price held over a later ESPN read: heldPaid), c: the bot's trusted chance
//             over, ks: [over's Kelly, under's] and b: [over's band, under's] (null where unpriced), sk: 1 where a
//             guard has the bot pass on it (his status, the line's move, a layoff, a gap or a small role CHECK's
//             shadow (checks.mjs shadowOf, as the run judges it): its bands PASS), sw: a shadow's passAs
//             ('gap' or 'small', why it's a PASS), sr: every skip's reason in words (skipReason: the guard's why,
//             DECISIONS.md D31: no silent skip), at: when priced, bot and bk: the side the bot has open and
//             'bet' or 'check', fc and cn: the other books' consensus fair chance over and how many books, dv:
//             the side ('over' or 'under') the book's price beats it on by OUTLIER or more (as the game markets'),
//             sug: the Bot's suggestion at the latest known price (DECISIONS.md D42: the windows open a day ahead
//             and the Bot picks its own time to bet): { s: the side it sees an edge on, e: its edge in points of
//             chance over the Book's fair at that price (the full lean once the news is in or at the last chance,
//             before that the share the lineup risk lets survive), h: hours to the start when priced, k: the
//             survival the lean was held to (1 the full lean), src: where the price came from ('api' this run's
//             fresh quote, 'espn' the Book's free board, 'snapshot' the morning snapshot: a suggestion only, never
//             bet) }; none where the Bot sees no edge }
//             cap: [over's, under's] the desk's cap as a game side's (the stat's CLV gate at the practice stake on
//             both, a role bet's on its own side; null none) and cr its why, there only where a side has one }
//
// And a side's why (w; the owner, 2026-10-19: a suggestion's K-score popover says as much as a bet's): on every
// side with an edge at the board's price (ks over 0) and on the Bot's side of each market (the higher Kelly, as
// botSidesOf), none on the rest. A game side's w, a prop's w: [over's, under's] (null a side without one):
//     pr, ln  the Kelly score's two parts in points (picks.mjs scoreParts: pr + ln = ks × 100): the price's (the
//             Book's no-vig chance against the price's break-even, scaled as the stake's Kelly is) and the Bot's lean
//     t       the trust the lean was taken at ((c − f) / (m − f); none where the Bot and the Book agree)
//     m, f    the Bot's own chance of the side and the Book's no-vig one (3 places)
//     ft      1 where the market's trust is fitted (else the untested start);  fr  'pinnacle' where the no-vig
//             chance is a sharp book's (else the Book's own two prices)
//     tm      the terms that moved it most, WHY_TERMS at most, [name, amount]: a game line's context terms in points
//             of its margin (spread, ml) or total, for this side (context.mjs's labels, their weights' parts:
//             termParts); a prop's drivers in percent of his projection (writeup.mjs driversOf, its words)
//     mn, im  a prop's projection and the mean the Book's price implies at the line (props.mjs lineRatio)
//     u       a prop's usage (usage.mjs, D41): [expected, unit], where the projection reads one
//     r       the plain reason the desk writes for a bet (writeup.mjs plainOf over the side as a bet would stand:
//             the same generator, no AI) without its price sentence (priceSentence: the page says the price at the
//             latest one, which can be another than the board's), on a side the desk would bet (not a PASS); none
//             where the price sentence can't be taken out cleanly
// tm, mn, im, u and r only on a side within WHY_REACH of an edge (its Kelly over −3 points), the rest its numbers
// alone, so the board stays small. Built only where run.mjs gives the side's facts (explain); else no w.
//
// A side the desk wouldn't bet at the board's price at all (boardMarkets off: a price not the Book's own, ESPN's
// line where the desk asks The Odds API, tracked only) is a PASS with its reason (sr): never a band the Bot
// couldn't give (D46).
//
// And the board seen (seenUpdate: apps/<sport>/scripts/model/board-seen.json, committed, not deployed): every
// market, side, line and price each game's board has shown, kept a week past its start, so the play-money
// settler can check a bet's price against it after the game's gone from the board (settle-lib.mjs
// boardObservations). An entry "market|side|line|price|stat|athlete" (line, stat and athlete empty where none),
// with the first and last time a board showed it (ms), so a bet takes it only while it was on show.

import { round } from './ratings.mjs';
import { chanceAt, decimal, gapGuard, isSuspect, isTracked, kellyScale, pickText, sideCtx } from './desk.mjs';
import { CHECK_KINDS, causeOf, shadowOf } from './checks.mjs';
import { capBand, capOf, edgeLevel, kellyOf } from './picks.mjs';
import { factsOf, plainOf, priceSentence } from './writeup.mjs';
import { qualityOf } from './confidence.mjs';

// ---------------------------------------------------------------------------------------------------------
// A side's why (w, the header's)

// (the terms a why names, the biggest first, and the least it names: a hundredth of a point, a tenth of a percent)
export const WHY_TERMS = 3;
// (the Kelly under 0 past which a why carries its numbers alone, no terms, projection or reason: a side that far
// from an edge is a few prices from any suggestion; 3 points, about a +140 side priced +150)
export const WHY_REACH = 0.03;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// The game's context terms as the board names them: each term's part of the margin (the home's) and of the total
// (its value times its weight, as run.mjs expectFor sums them), by its label; terms: context.mjs featurize's
// ({ m, t }), f the game's features, weights the fit's. None without them
export function termParts(terms, f, weights) {
  if (!terms || !f || !weights) return null;
  const on = (k) => (f[k] ?? []).map((v, i) => [terms[k]?.[i]?.label ?? terms[k]?.[i]?.key ?? `term ${i + 1}`, v * (weights[k]?.[i] ?? 0)]).filter(([, v]) => fin(v) && Math.abs(v) >= 0.05);
  return { m: on('m'), t: on('t') };
}

// (the biggest few, rounded: [name, amount])
const topTerms = (list, digits = 1) =>
  (list ?? [])
    .filter(([n, v]) => n && fin(v) && Math.abs(round(v, digits)) > 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, WHY_TERMS)
    .map(([n, v]) => [String(n), round(v, digits)]);

// A side's Kelly parts and chances (picks.mjs scoreParts' math, in points): { pr, ln, t, m, f } at its price
export function whyParts(odds, p, model, fair) {
  const p0 = 1 / decimal(odds);
  const score = kellyOf(odds, p) * 100;
  const pr = round((fair - p0) * kellyScale(odds) * 100, 2);
  const gap = model - fair;
  return { pr, ln: round(score - pr, 2), ...(Math.abs(gap) > 1e-6 ? { t: round((p - fair) / gap, 2) + 0 } : {}), m: round(model, 3), f: round(fair, 3) };
}

// A side's why from the side as a bet would stand (bet: the ledger's fields, run.mjs betGames' and propBet's), its
// facts (ex: { game, sib, state }: writeup.mjs factsOf's), its terms (a game line's, termParts' for its side), and
// whether the reason's written (an edge the desk would bet). A write-up that fails is left out, never the board
function whyOf(bet, { ex, fitted = false, terms = null, reason = false }) {
  const w = { ...whyParts(bet.odds, bet.p, bet.model, bet.fair), ...(fitted ? { ft: 1 } : {}), ...(bet.fairFrom === 'pinnacle' ? { fr: 'pinnacle' } : {}) };
  // (the words only on a side within reach of an edge (WHY_REACH): the board stays small, the numbers on every why)
  if (!(kellyOf(bet.odds, bet.p) > -WHY_REACH)) return w;
  let sheet = null;
  try {
    sheet = factsOf(bet, { game: ex?.game ?? null, sib: ex?.sib ?? null, state: ex?.state ?? null });
  } catch {
    sheet = null;
  }
  const tm = topTerms(bet.market === 'prop' ? (sheet?.drivers ?? []).map((d) => [d.what, d.appliedPct]) : terms);
  if (tm.length) w.tm = tm;
  const pj = bet.projection;
  if (bet.market === 'prop' && pj) {
    if (fin(pj.mean)) w.mn = round(pj.mean, 2);
    const im = fin(pj.implied) ? pj.implied : fin(pj.lineRatio) && fin(pj.mean) ? pj.lineRatio * pj.mean : null;
    if (fin(im)) w.im = round(im, 2);
    if (fin(pj.usage?.expected)) w.u = [round(pj.usage.expected, pj.usage.expected < 1 ? 2 : 1), String(pj.usage.unit ?? pj.usage.kind ?? '')];
  }
  if (reason && sheet) {
    try {
      const whole = plainOf(sheet).reason;
      const price = priceSentence(sheet);
      const r = typeof whole === 'string' && price && whole.includes(price) ? whole.replace(price, '').replace(/\s+/g, ' ').trim() : '';
      if (r) w.r = r;
    } catch {
      // (no reason: the numbers alone)
    }
  }
  return w;
}

// ---------------------------------------------------------------------------------------------------------
// One price a side (DECISIONS.md D81: the owner, 2026-10-22: Bot Picks, the game board, the slip and the popover
// always show the same price for the same side and line). A side's price on the board is the best the Bot knows
// now: a paid quote's best US price (D74) while it's fresh, else ESPN's free DraftKings one. A paid quote is fresh
// PAID_FRESH_MS (an hour, D55's shortest stale quote, LINES_FRESH.refresh: the other books move without DraftKings)
// from its time (pt), and only while DraftKings' own price hasn't moved since it (ESPN's now against the quote's
// dko by PAID_MOVED, half a point of the side's chance: D55's LINES_MOVED.chance; the API's rounding is less). The
// site's paid-price.ts holds the same rule (tests/book-paid-price.test.mjs pins the two equal)
export const PAID_FRESH_MS = 60 * 60e3;
export const PAID_MOVED = 0.005;
const impliedOf = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
// (DraftKings' price moved from the quote's: both known and half a point of chance apart)
export const dkMoved = (now, then) => fin(now) && fin(then) && Math.abs(impliedOf(now) - impliedOf(then)) >= PAID_MOVED - 1e-9;
// (a paid quote's time still fresh at now)
export const paidFresh = (pt, now) => {
  const t = Date.parse(pt ?? '');
  return Number.isFinite(t) && now - t < PAID_FRESH_MS;
};
// The price a side shows where this run read ESPN's free price alone (free: DraftKings' at the side's line) over the
// last board's same side (was: { o, pb, pt, dko } at the same line): the held paid price { o, pb, pt, dko? } where
// the quote is fresh, DraftKings unmoved since and its price strictly better than DraftKings' now; else null (the
// free price, no book: never a later DraftKings read silently over a fresh better paid one, never a stale one held)
export function heldPaid(free, was, now = Date.now()) {
  if (!was?.pb || !fin(was.o) || !fin(free) || !paidFresh(was.pt, now)) return null;
  const dk = fin(was.dko) ? was.dko : was.pb === 'dk' ? was.o : null;
  if (dk === null || dkMoved(free, dk)) return null;
  if (!(decimal(was.o) > decimal(free) + 1e-9)) return null;
  return { o: was.o, pb: was.pb, pt: was.pt, ...(fin(was.dko) ? { dko: was.dko } : {}) };
}
// (a fresh paid side's fields: its book, the quote's time, DraftKings' own where another book's is shown)
const paidFields = (book, pt, dk) => (book ? { pb: book, ...(pt ? { pt } : {}), ...(book !== 'dk' && fin(dk) ? { dko: dk } : {}) } : {});

// (the Bot's side of a market: the higher Kelly, as botSidesOf)
const botIndex = (ks) => (fin(ks[0]) && (!fin(ks[1]) || ks[0] >= ks[1]) ? 0 : fin(ks[1]) ? 1 : -1);

// (a game's seen prices kept this long past its start: past the settler's longest wait, props.mjs PROP_WAIT)
export const SEEN_KEEP = 8 * 864e5;

// (a game market's side's consensus (c: its market's, the first side's fair: oddsapi.mjs consensusOf): fc, cn, dv)
const consensusOf = (c, side, first) => (Number.isFinite(c?.fair) ? { fc: round(side === first ? c.fair : 1 - c.fair, 4), cn: c.n, ...(c.outlier === side ? { dv: 1 } : {}) } : {});

// (a side's band: check where it's a CHECK; PASS with no edge or a guard's pass; else its Kelly score's, LIKE at the
// least, held to the desk's cap (picks.mjs capBand) and a suspect price's LIKE (desk.mjs isSuspect, D23))
export const bandOf = (kelly, p, ev, { check = false, pass = false, cap = null } = {}) =>
  check ? 'check' : pass || !(ev > 0) ? 'low' : capBand(edgeLevel(kelly, p), isSuspect(p, ev) ? 'medium' : cap);

// The desk's cap on a side from the marks a bet on it would carry (picks.mjs capOf: a gate's practice stake, a role
// bet, a research pick not earned): the board's { cap, cr } where there is one (DECISIONS.md D46), else {}
export function sideCap(marks) {
  const cap = marks ? capOf(marks) : null;
  if (!cap) return {};
  const role = marks.context?.roleBet;
  const why = [marks.practice, role ? `a role bet (${role.why ?? role.key ?? 'its cause'}): a LIKE at most` : null].find((v) => typeof v === 'string' && v.trim());
  return { cap, ...(why ? { cr: skipReason({ why }) } : {}) };
}

// (the confidence layer's read of a side (confidence.mjs qualityOf, DECISIONS.md D52): its quality q and the band it
// may reach by the tiers (its cap: 'medium' a LIKE at most, 'high' a LOVE at most), with the cap's why in the desk's
// words; none without the model or a priced side. row: the side in the over frame as the desk's bets carry it)
const CONF_WHY = { medium: "the confidence layer (D52): LOVE isn't earned on the record yet, a LIKE at most", high: "the confidence layer (D52): LOCK isn't earned on the record yet, a LOVE at most" };
export function sideQuality(model, row) {
  if (!model || !row || !Number.isFinite(row.f) || !Number.isFinite(row.p) || !row.overOdds || !row.underOdds) return null;
  try {
    const qy = qualityOf(model, row);
    return qy ? { q: qy.q, cap: qy.cap, cr: qy.cap ? CONF_WHY[qy.cap] : null } : null;
  } catch {
    return null;
  }
}
const RANK = { low: 0, medium: 1, high: 2, lock: 3 };
const lowerCap = (x, y) => (!x ? (y ?? null) : !y ? x : RANK[x] <= RANK[y] ? x : y);

// A game's markets as the board's (desk.mjs price's: each market's two sides, the model's chance and the book's
// fair one), each side at its trusted chance (desk.mjs chanceAt, choose's), trust: a market's key to its trust;
// consensus: the other books' by market (the lines', oddsapi.mjs consensusOf's), the data's, beside each side;
// ctx: the game's, for the residual model (desk.mjs sideCtx, D32), so the board shows the chance the desk bets at.
// gate: the lines' CLV gate (desk.mjs lineGate's; off, every side at the practice stake: cap LIKE); off: why the desk
// wouldn't bet these prices at all (not the Book's own: ESPN's line), every side a PASS saying so (D31, D46)
// explain: the facts for each side's why (w, the header's): { sport, game (run.mjs's upcoming game), exp (its
// expected margin and total), seen (the context it saw, a bet's context), fairFrom (by market), state ({ trust,
// context }: the write-ups'), terms (termParts'), fitted (market -> whether its trust is fitted) }; none, no w
// confidence: the confidence layer's model (D52): each side's quality q and the cap its tiers put on it (the lower of
// the two caps where the gate's is there too)
// paid, at, now (D81): the last board's sides of this game (its k) and this run's time: a side this run priced at
// ESPN's free price alone takes the last board's fresh paid price (heldPaid); a side a paid quote priced this run
// carries pt (at) and dko
export function boardMarkets(markets, trustOf, consensus = null, ctx = null, { gate = null, off = null, explain = null, confidence = null, paid = null, at = null, now = Date.now() } = {}) {
  // (the market's own CLV gate where the gate is by market (desk.mjs lineGate, D95), else the gate whole)
  const cappedOf = (market) => {
    const g = gate?.markets ? (gate.markets[market] ?? null) : gate;
    return g && g.on === false ? sideCap({ practice: String(g.why || 'the game lines at the practice stake') }) : {};
  };
  const out = {};
  for (const m of markets ?? []) {
    const capped = cappedOf(m.market);
    const [s0] = m.sides;
    // (past the market's gap, run.mjs betGames' guard skips it: a CHECK on the model's side only where the run
    // shows it one (checks.mjs shadowOf: the gap's never), else a PASS both sides)
    const gapped = gapGuard(m.market, s0.model, s0.fair);
    const mine = s0.model - s0.fair >= 0 ? s0 : m.sides[1];
    const checkSide = gapped && !shadowOf({ cause: 'gap', odds: mine.odds, model: mine.model, fair: mine.fair }) ? mine.side : null;
    const pass = (!!gapped && !checkSide) || !!off;
    const sr = off ? skipReason({ why: off }) : pass ? skipReason(gapped) : null;
    const rows = m.sides.map((own, i) => {
      // (D81: the side's price the best the Bot knows now: this run's paid one, else the last board's fresh paid one
      // held over ESPN's, else ESPN's)
      const was = own.book ? null : (paid?.[m.market] ?? []).find((x) => x.s === own.side && (m.market === 'ml' || x.l === own.line));
      const held = was ? heldPaid(own.odds, was, now) : null;
      const s = held ? { ...own, odds: held.o } : own;
      const pf = held ? { pb: held.pb, pt: held.pt, ...(held.dko ? { dko: held.dko } : {}) } : paidFields(s.book, at, s.dk);
      const p = s.anchored === false ? s.fair : chanceAt(m.market, s.fair, s.model, trustOf(m.market), sideCtx(m, s, ctx));
      const ev = (1 - (s.push ?? 0)) * (p * decimal(s.odds) - 1);
      const ks = kellyOf(s.odds, p);
      // (the confidence layer's read of the side, in the over (home) frame: the first side's chances, both prices)
      const first = i === 0;
      const fl = (v) => (first ? v : 1 - v);
      const cq = pass || !confidence || s.anchored === false ? null : sideQuality(confidence, { sport: ctx?.sport, market: m.market, stat: m.market, line: s.line ?? null, side: first ? 'home' : 'away', f: fl(s.fair), raw: fl(s.model), pCur: fl(p), p: fl(p), overOdds: m.sides[0].dk ?? m.sides[0].odds, underOdds: m.sides[1].dk ?? m.sides[1].odds, t: ctx?.t, at: ctx?.at, hours: ctx?.hours, trust: trustOf(m.market), named: s.named });
      const cap = lowerCap(capped.cap ?? null, cq?.cap ?? null);
      const cr = capped.cr ?? cq?.cr ?? null;
      return { s: s.side, l: m.market === 'ml' ? null : s.line, o: s.odds, ...pf, c: round(p, 3), ks, b: bandOf(ks, p, ev, { check: s.side === checkSide && !off, pass, cap }), ...(sr ? { sr } : {}), ...(pass || !cap ? {} : { cap, ...(cr ? { cr } : {}) }), ...(cq && Number.isFinite(cq.q) ? { q: cq.q } : {}), ...consensusOf(consensus?.[m.market], s.side, s0.side), _p: p, _ev: ev };
    });
    // (each side's why: the edge sides' and the Bot's side's, the header's w)
    const bot = botIndex(rows.map((x) => x.ks));
    rows.forEach((row, i) => {
      const s = { ...m.sides[i], odds: row.o };
      const { _p: p, _ev: ev } = row;
      delete row._p;
      delete row._ev;
      if (!explain || !(row.ks > 0 || i === bot) || !fin(s.odds) || !fin(s.model) || !fin(s.fair)) return;
      const g = explain.game;
      const bet = {
        id: `${g?.id ?? ''}:${m.market}`,
        event: g?.id,
        sport: explain.sport,
        start: g?.date,
        matchup: g ? `${g.awayAbbr} @ ${g.homeAbbr}` : '',
        market: m.market,
        side: s.side,
        line: m.market === 'ml' ? null : s.line,
        odds: s.odds,
        model: round(s.model, 4),
        fair: round(s.fair, 4),
        p: round(p, 4),
        ev: round(ev, 4),
        ...(s.push ? { push: round(s.push, 4) } : {}),
        intent: 'edge',
        ...(fin(explain.exp?.margin) ? { expMargin: round(explain.exp.margin, 2), expTotal: round(explain.exp.total, 2) } : {}),
        fairFrom: explain.fairFrom?.[m.market] ?? null,
        context: explain.seen ?? null,
      };
      if (g) bet.pick = pickText(bet, g);
      // (the terms on this side: the margin's for the home and its negative for the away; the total's for the over)
      const sign = s.side === 'away' || s.side === 'under' ? -1 : 1;
      const terms = (explain.terms?.[m.market === 'total' ? 't' : 'm'] ?? []).map(([n, v]) => [n, sign * v]);
      row.w = whyOf(bet, { ex: { game: g, state: explain.state }, fitted: !!explain.fitted?.(m.market), terms, reason: !pass });
    });
    out[m.market] = rows;
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
// explain: the facts for each side's why (w, the header's): { sport, game, exp, sib (its game's context, a bet's
// sibling: writeup.mjs sibOf), state, fitted (whether the stat's trust is fitted) }; none, no w
// confidence: the confidence layer's model (D52) and start the game's start: each side's quality q and its tier cap
// paid, now (D81): the last board's row of this prop (its o, pb, pt, dko): a side priced at ESPN's free price alone
// takes its fresh paid price (heldPaid) at the same line; a side a paid quote priced this run carries pt (at) and dko
export function boardProp(x, at, { gate = null, explain = null, confidence = null, start = null, paid = null, now = Date.now() } = {}) {
  const by = Object.fromEntries((x.sides ?? []).map((s) => [s.side, s]));
  // (a CHECK the page shows: a CHECK's guard and not a shadow, judged on the model's side's price and chances as
  // the run's CHECK is (checks.mjs checkOf); a shadow a PASS)
  const shadow = CHECK_KINDS.has(x.guard?.kind) ? shadowOf({ cause: causeOf(x.guard), odds: x.odds, model: x.model, fair: x.fair, oddsAssumed: !x.priced, trust: x.trust, line: x.prop?.line }) : null;
  const check = CHECK_KINDS.has(x.guard?.kind) && !shadow;
  const pass = !!x.guard?.skip && !check;
  const prices = x.prop.prices ?? {};
  const gated = gate && gate.on === false ? `${x.prop.stat.key} ${gate.why || 'at the practice stake'}` : null;
  const capOn = (k) => (pass ? {} : sideCap({ practice: gated, context: x.roleBet && x.side === k ? { roleBet: x.roleBet } : null }));
  const pOver = by.over ? by.over.p : by.under ? 1 - by.under.p : null;
  const fOver = Number.isFinite(x.fair) ? (x.side === 'over' ? x.fair : 1 - x.fair) : null;
  const mOver = Number.isFinite(x.model) ? (x.side === 'over' ? x.model : 1 - x.model) : null;
  const cOver = Number.isFinite(x.pTrust) ? (x.side === 'over' ? x.pTrust : 1 - x.pTrust) : pOver;
  const proj = x.projection ?? null;
  const mu = proj && Number.isFinite(proj.mean) ? proj.mean : null;
  const sd = mu !== null && Number.isFinite(proj.r) && proj.r > 0 ? Math.sqrt(mu + (mu * mu) / proj.r) : mu !== null ? Math.sqrt(Math.max(0, mu)) : null;
  const t = start ? Date.parse(start) : NaN;
  const side = (k) => {
    const s = by[k];
    // (D74: the side's best US price where this run's quote brought one (its book on pb), else the Book's own)
    const i = k === 'over' ? 0 : 1;
    const paidNow = Number.isFinite(prices[k]) && Number.isFinite(by[k]?.odds) && !!by[k]?.book;
    // (D81: a side at ESPN's free price this run takes the last board's fresh paid one at the same line, heldPaid)
    const was = !paidNow && paid && paid.l === x.prop.line && paid.pb?.[i] ? { o: paid.o?.[i], pb: paid.pb[i], pt: paid.pt, dko: paid.dko?.[i] ?? null } : null;
    const held = was && Number.isFinite(prices[k]) ? heldPaid(prices[k], was, now) : null;
    const o = Number.isFinite(prices[k]) ? (paidNow ? by[k].odds : held ? held.o : prices[k]) : null;
    const paidAs = paidNow ? { pb: by[k].book, pt: at, dko: by[k].book !== 'dk' ? prices[k] : null } : held ? { pb: held.pb, pt: held.pt, dko: held.dko ?? null } : null;
    const c = capOn(k);
    if (!s || o === null) return { o, ks: null, b: null, c, paidAs };
    const ks = kellyOf(o, s.p);
    // (the confidence layer's read of the side (D52): the over frame's chances, both prices)
    const cq = pass || !confidence || !x.priced ? null : sideQuality(confidence, { sport: x.sport ?? confidence.sport, market: 'prop', stat: x.prop.stat.key, line: x.prop.line, side: k, f: fOver, raw: mOver, pCur: cOver, p: pOver, overOdds: prices.over, underOdds: prices.under, t: Number.isFinite(t) ? t : Date.now() + 864e5, at: Date.now(), hours: Number.isFinite(t) ? (t - Date.now()) / 36e5 : 24, home: typeof x.home === 'boolean' ? x.home : null, trust: Number.isFinite(x.trust) ? x.trust : null, mu, sd, im: Number.isFinite(proj?.anchored?.implied) ? proj.anchored.implied : null });
    const cap = lowerCap(c.cap ?? null, cq?.cap ?? null);
    // (the side's return at the price shown: the run's ev at its own price, worked again where a paid one is held)
    const ev = held ? (1 - (s.push ?? 0)) * (s.p * decimal(o) - 1) : s.ev;
    return { o, paidAs, ks, b: bandOf(ks, s.p, ev, { check: check && x.side === k, pass, cap }), c: { ...c, cap, ...(c.cr ? {} : cq?.cr ? { cr: cq.cr } : {}) }, ...(cq && Number.isFinite(cq.q) ? { q: cq.q } : {}) };
  };
  const over = side('over');
  const under = side('under');
  const cr = over.c.cr ?? under.c.cr;
  // (each side's why: the edge sides' and the Bot's side's, the header's w; the model's and the Book's chances of
  // the side the run didn't pick are its pick's complements)
  const bot = botIndex([over.ks, under.ks]);
  const w = ['over', 'under'].map((k, i) => {
    const one = i ? under : over;
    const s = by[k];
    if (!explain || !s || !fin(one.o) || !(one.ks > 0 || i === bot) || !fin(x.model) || !fin(x.fair)) return null;
    const mine = x.side === k;
    const g = explain.game;
    const bet = {
      id: `${g?.id ?? ''}:prop:${x.prop.stat.key}:${x.prop.athlete.id}`,
      event: g?.id,
      sport: explain.sport,
      start: g?.date,
      matchup: g ? `${g.awayAbbr} @ ${g.homeAbbr}` : '',
      market: 'prop',
      propType: x.prop.stat.key,
      statLabel: x.prop.stat.label,
      player: x.prop.athlete.name,
      athlete: x.prop.athlete.id,
      team: x.prop.athlete.team ?? null,
      side: k,
      line: x.prop.line,
      odds: one.o,
      model: round(mine ? x.model : 1 - x.model, 4),
      fair: round(mine ? x.fair : 1 - x.fair, 4),
      p: round(s.p, 4),
      ev: round(s.ev, 4),
      intent: 'edge',
      ...(fin(explain.exp?.margin) ? { expMargin: round(explain.exp.margin, 2), expTotal: round(explain.exp.total, 2) } : {}),
      ...(typeof explain.tested === 'boolean' ? { tested: explain.tested } : {}),
      projection: x.projection ?? null,
      context: { move: x.move ?? null },
    };
    bet.pick = `${bet.player} ${k === 'over' ? 'Over' : 'Under'} ${bet.line} ${bet.statLabel}`;
    return whyOf(bet, { ex: { game: g, sib: explain.sib ?? null, state: explain.state }, fitted: !!explain.fitted, reason: !pass });
  });
  return {
    n: x.prop.athlete.name,
    id: String(x.prop.athlete.id),
    t: x.prop.athlete.team != null ? String(x.prop.athlete.team) : null,
    k: x.prop.stat.key,
    lb: x.prop.stat.label,
    l: x.prop.line,
    o: [over.o, under.o],
    ...(over.paidAs || under.paidAs ? paidPair(over.paidAs, under.paidAs) : {}),
    c: by.over ? round(by.over.p, 3) : by.under ? round(1 - by.under.p, 3) : null,
    ks: [over.ks, under.ks],
    b: [over.b, under.b],
    ...(pass ? { sk: 1 } : {}),
    ...(pass && shadow ? { sw: shadow.passAs } : {}),
    ...(pass ? { sr: skipReason(x.guard) } : {}),
    ...(over.c.cap || under.c.cap ? { cap: [over.c.cap ?? null, under.c.cap ?? null], ...(cr ? { cr } : {}) } : {}),
    // (the confidence layer's quality of each side (D52), where the model read it)
    ...(Number.isFinite(over.q) || Number.isFinite(under.q) ? { q: [over.q ?? null, under.q ?? null] } : {}),
    ...(Number.isFinite(x.prop.consensus?.fair) ? { fc: x.prop.consensus.fair, cn: x.prop.consensus.n, ...(x.prop.consensus.outlier ? { dv: x.prop.consensus.outlier } : {}) } : {}),
    // (the suggestion (D42): the side the Bot sees an edge on at the latest known price, run.mjs betProps)
    ...(x.sug ? { sug: x.sug } : {}),
    ...(w.some(Boolean) ? { w } : {}),
    at,
  };
}

// (a prop's paid fields (D81): pb [over's, under's], the quote's time pt (one ask prices both sides; a held side's
// own where only it is), dko [over's, under's] where another book's is shown)
function paidPair(a, b) {
  const pt = a?.pt ?? b?.pt ?? null;
  const dko = [a?.dko ?? null, b?.dko ?? null];
  return { pb: [a?.pb ?? null, b?.pb ?? null], ...(pt ? { pt } : {}), ...(dko.some(fin) ? { dko } : {}) };
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
// (outs: game id to the athlete ids its injury report has out or doubtful (OUT_STATUS): their props off the board, so a
// price the props' asks can't refresh (2026-10-26: DeVonta Smith out a day, his Thursday price still buyable) is never
// offered on a player who won't play)
export function buildBoard(sport, { prev = null, games = new Map(), props = new Map(), bets = [], checks = [], now = new Date(), outs = null } = {}) {
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
  if (outs) for (const g of out.values()) { const o = outs.get(String(g.id)); if (o?.size) g.p = (g.p ?? []).filter((p) => !o.has(String(p.id))); }
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
