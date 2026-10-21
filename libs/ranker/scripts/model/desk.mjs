// The desk's betting: every market of every game (the spread, the total, the moneyline) priced with the
// model's chance for each side, the better side bet at 0.5 to 3 units by how good the price is, and each bet
// graded when its game is final. Play money: a 1,000-unit bankroll, rebought when it runs out.
//
// A side's chance: the model's (margins.mjs: its expected margin or total and the history's spread around it,
// as whole numbers, the margins' shape and pushes and all; the moneyline's priced off the spread market's, so
// a model agreeing with the spread is the fair moneyline), pulled toward the book's fair price (its two prices
// with the vig taken out) by how much the model has earned trust in that market (w: 0 the book's alone, 1 the
// model's alone; fit on the desk's own graded bets). The lean is the model's less the book's, but past half
// of GAP it tapers to nothing at GAP (a disagreement that size is the market knowing something the model
// doesn't far more often than an edge), and past GAP the market isn't bet at all (gapGuard). The trust fit and
// the backtest score each bet at that same tapered chance (chanceAt). A moneyline with no spread market to
// anchor it leans nothing (the plain normal's underdog lean): the book's chance, tracked.
// Its stake: by its Kelly fraction, its expected return over what a unit pays (a long shot's edge stakes less
// than the same edge at -110; a heavy favorite's held to what its edge in chance would stake at -110), 0.5 at
// the least edge up to 3 (stakeFor); a game's edge props sized jointly with its other props by their
// correlations in a game, a player's own props' and the rest's, fit on the graded props and each used only where
// held-out days bore it out (fitSameGame, sizeJointly, sameGameOf, placeGame: only ever cut); a game's whole
// stake, every market and prop, at most leagues.mjs GAME_CAP, the edge bets filled first (capGame); the spread
// and the moneyline never on the same side of a game (oneSide).
// Only an edge is bet (2026-10-13, the owner's: every bet the bot places is a LIKE or better, picks.mjs BANDS): a
// market with no edge, or one a guard cut (the old action bet, 0.5u for the data), is tracked, not bet (intent
// 'track', TRACK: units 0, never staked; what it would have staked kept, trackUnits). A tracked row is graded,
// closed and post-mortemed like a bet and is evidence for everything that learns (the trust fit, the CLV, the
// self-check, the same-game fit: learnView reads it as the action bet it once was), but never in the record, the
// bankroll, the caps, the same-game exposure or the picks (record, capGame, makeRoom, sizeJointly; picks.mjs).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { round } from './ratings.mjs';
import { cond, mlModel, spreadChances, totalChances, totalSplit } from './margins.mjs';
import { etDay } from './sources.mjs';
import { MODEL_EPOCH } from './leagues.mjs';
import { CLV_V } from './clv.mjs';
import { hookChance } from './residual.mjs';

// (1,000 to start, so a full slate of bets leaves most of it on hand; the desk rebuys 1,000 whenever its
// balance would go under 0: the money's play money and every bet is data)
export const BANKROLL = 1000;
export const MARKETS = ['spread', 'total', 'ml'];

// American odds as the decimal payout (stake back included) and as the chance they imply
export const decimal = (american) => (american > 0 ? 1 + american / 100 : 1 + 100 / -american);
const implied = (american) => 1 / decimal(american);

// The first side's fair chance from a pair of prices (the vig taken out)
export const fairPair = (a, b) => fair(a, b)[0];

// Both sides' fair chances: the book's implied chances, the vig taken out
function fair(a, b) {
  const x = implied(a);
  const y = implied(b);
  return [x / (x + y), y / (x + y)];
}

// (the most the model's chance may be from the book's fair chance, by market, before the market isn't bet: the
// lean tapers from half of it; leanOf, gapGuard). A prop's (props.mjs priceProps) the moneyline's: a player's
// line is the market's read of his role and health, and the model 15 points off it is far more often missing
// news than an edge
export const GAP = { spread: 0.12, total: 0.12, ml: 0.15, prop: 0.15 };

// Units for a side, by its Kelly fraction (its expected return over what a unit pays at its price): 0.5 at no
// edge (what a tracked row would have staked: trackUnits), up to 3 at the desk's edge scale (the return that
// tops out at -110; a longer price needs a bigger return for the same stake, a shorter one less), by half units. A short price's fraction is
// held to what its edge in chance (p less its break-even, ev / decimal) would stake at -110: Kelly at -800
// stakes 3 on a chance a point over break-even, and the model's errors are in chance, so a heavy favorite's
// noise would buy the most (the shorter price stakes no less than -110 for the same return, and no more for the
// same edge in chance)
const REF = 100 / 110;
// The sanity guard (the 2026-10-18 audit: a --dry run priced Christian McCaffrey Under 14.5 carries about 20 points
// over its break-even, ev +0.39). No sane price has an edge past EDGE_SUSPECT points over its break-even, or past
// Z_SUSPECT standard deviations of the outcome at it (sqrt(be(1 - be)): the bar tightens at long prices, where a
// point is a bigger share of the outcome's spread), either way: such a row is a bug or a fit gone wrong until shown
// otherwise. It's logged loudly as suspect, its ev held to EV_SUSPECT at most and its stake to the practice stake, a
// LIKE at most (picks.mjs levelOf reads suspect): never bet at size, never turned off (D1). Scale-aware (D24), not by
// the return: a long price's return is big at a modest edge (Josh Hokit +205 at 37.9% against 32.8% to break even:
// 5.1 points, 0.11 SDs, ev +15.5%, a real edge, not a broken row). DECISIONS.md D23
export const EV_SUSPECT = 0.15;
export const EDGE_SUSPECT = 0.12;
export const Z_SUSPECT = 0.3;
// (the edge over the break-even from the chance and the return alone: ev = p d - 1, so the break-even 1/d is
// p / (1 + ev); its points and its SDs of the outcome; null when it's sane)
export function suspectEdge(p, ev) {
  if (!Number.isFinite(p) || !Number.isFinite(ev) || !(p > 0 && p < 1) || !(ev > -1)) return null;
  const be = Math.min(1 - 1e-9, Math.max(1e-9, p / (1 + ev)));
  const edge = p - be;
  const z = edge / Math.sqrt(be * (1 - be));
  return Math.abs(edge) > EDGE_SUSPECT || Math.abs(z) > Z_SUSPECT ? { edge, z } : null;
}
export const isSuspect = (p, ev) => !!suspectEdge(p, ev);
// (the bar a suspect row's return is held to, so it can't outrank the rest)
export const heldEv = (ev) => Math.sign(ev) * Math.min(Math.abs(ev), EV_SUSPECT);
export const suspectOf = (ev, why = '', p = null) => {
  const s = suspectEdge(p, ev);
  if (!s) return null;
  const r = (x, n) => Math.round(x * n) / n;
  return { ev: r(ev, 10000), edge: r(s.edge, 10000), z: r(s.z, 1000), why: `edge ${s.edge > 0 ? '+' : ''}${r(s.edge * 100, 10)} points over the break-even (${r(s.z, 100)} SDs of the outcome) past the ${EDGE_SUSPECT * 100}-point or ${Z_SUSPECT}-SD bar (ev ${ev > 0 ? '+' : ''}${r(ev, 1000)})${why ? `: ${why}` : ''}: its ev held to ${EV_SUSPECT} at most and the practice stake` };
};

// The rules a bet was placed under (the owner, 2026-10-19: "you can change your bet to fix it", Josh Hokit +205 held
// to the practice stake by the old ev bar). A bet keeps `rules` at placement: the cap rules' version (CAP_RULES,
// bumped by hand whenever the code of the D23 suspect bar, D46's caps or D52's layer changes how a band or a stake is
// held), the suspect bar's numbers and the bands (picks.mjs BANDS, passed in: picks.mjs imports this file). An open
// bet on a game not yet locked whose rules differ from today's is taken back and priced again at a fresh quote
// (run.mjs repriceOpen, mma-desk.mjs runMma), at most MAX_REPRICES times like a re-price on news. A bet from before
// the rules were kept reads as placed under today's, except one held by the old ev bar (its suspect with no edge in
// points: CAP_RULES 1). DECISIONS.md D53
// (1: D23 by the return, ev past 0.15; 2: D23 by the edge in points and SDs, 27a9d205; 3: the reason tiers, D58: the
// band from the proven reasons, the stake held to the tier's cap; 4: the props' stat bar, D64, and MMA's bands' place, D65; 5: the two-band trial, D73: LIKE and LOVE, a
// trial sport's props banded and staked by their trusted share)
export const CAP_RULES = 5;
// (an open bet's re-prices on news or a rule change: at most this many, counted across runs)
export const MAX_REPRICES = 6;
export const rulesOf = (bands) => `cap${CAP_RULES} suspect ${EDGE_SUSPECT}/${Z_SUSPECT}/${EV_SUSPECT} bands ${bands.lock}/${bands.lockChance}/${bands.high}/${bands.medium}`;
// (the rules a bet was placed under: its own, the old ev bar's for a pre-rules bet it held, else null: read as today's)
export const rulesAt = (bet) => bet?.rules ?? (bet?.suspect && !Number.isFinite(bet.suspect.edge) ? 'cap1' : null);
// (the rules it was placed under when they differ from today's, else null)
export function rulesChanged(bet, now) {
  const was = rulesAt(bet);
  return was !== null && was !== now ? was : null;
}

export function stakeFor(ev, evScale, odds = -110) {
  const d = decimal(Number.isFinite(odds) && odds ? odds : -110);
  const e = Math.max(0, ev);
  const frac = Math.min(e / (d - 1), ((e / d) * (1 + REF)) / REF);
  const raw = 0.5 + (frac / (evScale / REF)) * 2.5;
  return Math.min(3, Math.max(0.5, Math.round(raw * 2) / 2));
}

// The stake's Kelly: the fraction stakeFor sizes on, its edge in chance (p less the price's break-even) scaled by
// what the price pays, (b + 1) / b, held to -110's scale (1 + REF) / REF: the -110-equivalent Kelly. A short
// price's raw Kelly makes a small lean look big (a 3.75-point lean at -260 read over 5, a LOCK), and the model's
// errors are in chance, so the picks' score, their bands and every Kelly the pages show are this one (picks.mjs
// kellyOf), the stake and the band reading the same number (the owner's, 2026-10-18: "make sure small numbers
// aren't influencing K rating by % or anything crazy"). Plus money's raw Kelly is already under -110's: as it is
export const STAKE_SCALE = (1 + REF) / REF;
export function kellyScale(odds) {
  const b = decimal(Number.isFinite(odds) && odds ? odds : -110) - 1;
  return Math.min((b + 1) / b, STAKE_SCALE);
}
export const stakeKelly = (odds, p) => (p - 1 / decimal(Number.isFinite(odds) && odds ? odds : -110)) * kellyScale(odds);

// The model's lean on a side (its chance less the book's fair chance), tapered: whole to half of the market's
// GAP, then less and less, nothing at GAP (and past it the market isn't bet)
export function leanOf(gap, limit) {
  if (!limit) return gap;
  const a = Math.abs(gap);
  const half = limit / 2;
  if (a <= half) return gap;
  return Math.sign(gap) * half * Math.max(0, (limit - a) / (limit - half));
}

// A side's chance at a trust: the book's fair chance and the model's lean, tapered by its market's GAP (a prop's
// too). The one chance choose bets with and fitTrust and the backtest score, so the
// trust is fit on the pricing the desk bets with.
// With a ctx (the row: its sport, stat, line, side, the Book's two prices, the start and the bet's moment) and the
// residual model on (residual.mjs residOn: RESID_PRICING, on since the owner's O3 of 2026-10-19; RESID_OFF=1 the
// gate's champion; DECISIONS.md D32), the model's soft blend of this chance with its corrected one: this chance is
// the current price the blend starts from, the ctx's raw (the anchored chance, before the calibration and the
// trust) the lean the model reads, so nothing is counted twice. Off, or with no ctx or no model, this chance as it is
// (the trust's start by market (D44): a total's 0, climbing only on the Bot's own graded totals since the epoch
// (run.mjs refitTrust); the rest the desk's 0.5. A total's chance carries the named terms' shift (ctx.named: the
// soft schedule terms' part of the Bot's total at the Book's line, D34) at full weight, since their ridge already
// sizes them, and the rest of its lean at the trust)
export const TRUST_START = { total: 0 };
export const trustStart = (market, fallback = 0.5) => TRUST_START[market] ?? fallback;
export const chanceAt = (market, fair, model, trust, ctx = null) => {
  const named = Number.isFinite(ctx?.named) ? ctx.named : 0;
  const p = Math.min(0.995, Math.max(0.005, fair + named + trust * leanOf(model - fair, GAP[market])));
  if (!ctx || Object.keys(ctx).every((k) => k === 'named')) return p;
  const r = hookChance({ ...ctx, market: ctx.market ?? market, f: ctx.f ?? fair, raw: ctx.raw ?? model }, p);
  return r ? r.p : p;
};

// A researched CHECK's chance (run.mjs betProps): the research found nothing to explain the gap, or a reason the
// model's inputs carry already, so the gap's doubt (the market knowing something the model doesn't) is answered
// and the taper's nothing past the GAP (the book's own chance, its return only the vig: a pass every time) no
// longer applies. Priced as a prop inside the GAP is, at the market's trust, its lean held at the most one inside
// the GAP keeps (half of it, where leanOf's taper starts): shrunk, never the whole gap
export function clearedChanceAt(market, fair, model, trust) {
  const half = (GAP[market] ?? 0) / 2;
  const gap = model - fair;
  return fair + trust * (half ? Math.sign(gap) * Math.min(Math.abs(gap), half) : gap);
}

// (a bet the live desk would never place for its model's distance from the book: gapGuard)
export const pastGap = (market, model, fair) => !!GAP[market] && Math.abs(model - fair) > GAP[market];

// Why a market isn't bet for its model's distance from the book (skip; kind 'gap': the bettor keeps it as a
// CHECK, checks.mjs), or null
export function gapGuard(market, model, fair) {
  const limit = GAP[market];
  if (!limit || !Number.isFinite(model) || !Number.isFinite(fair) || Math.abs(model - fair) <= limit) return null;
  return { skip: true, kind: 'gap', why: `the Bot's ${Math.round(model * 100)}% against the Book's ${Math.round(fair * 100)}%: too far from the market to trust` };
}

// Each market's two sides, priced: the line, the price, the model's chance (a push left out: margins.mjs cond)
// and its push, the book's fair chance (the lines' own fair chance of the first side where they bring one:
// Pinnacle's, from The Odds API; else the two prices with the vig taken out). shape: the margins' (margins.mjs
// fitMargins; none, the plain normal cut into whole numbers)
export function price(game, exp, lines, params, shape = null) {
  const out = [];
  const fairOf = (market, a, b) => {
    const given = lines.fair?.[market];
    return Number.isFinite(given) ? given : fair(a, b)[0];
  };
  const both = (market, a, b, fa) => out.push({ market, sides: [{ ...a, fair: fa }, { ...b, fair: 1 - fa }] });
  const { spread, total, ml } = lines;
  let spreadHome = null;
  if (spread.home.line !== null && spread.away.line !== null && spread.home.odds && spread.away.odds) {
    // (home covers when its margin plus its line is over 0; away the same with its own: the shape is the same
    // both ways)
    const h = spreadChances(exp.margin, spread.home.line, params.sigma, shape);
    const a = spreadChances(-exp.margin, spread.away.line, params.sigma, shape);
    const f = fairOf('spread', spread.home.odds, spread.away.odds);
    spreadHome = { line: spread.home.line, fair: f };
    both(
      'spread',
      { side: 'home', line: spread.home.line, odds: spread.home.odds, model: cond(h), push: h.push },
      { side: 'away', line: spread.away.line, odds: spread.away.odds, model: cond(a), push: a.push },
      f,
    );
  }
  if (total.line !== null && total.over && total.under) {
    // (D44: the Bot's total less its named terms is the model the trust reads (0 by rule till its own record earns
    // it), and the named terms' shift at the Book's line rides on each side at full weight (named: the over's,
    // the under's its negative); with no context the plain total as before)
    const t = totalSplit(exp, total.line, params.sigmaT);
    both('total', { side: 'over', line: total.line, odds: total.over, model: cond(t.c), push: t.c.push, ...(t.named === null ? {} : { named: t.named }) }, { side: 'under', line: total.line, odds: total.under, model: 1 - cond(t.c), push: t.c.push, ...(t.named === null ? {} : { named: -t.named }) }, fairOf('total', total.over, total.under));
  }
  if (ml.home && ml.away) {
    // (off the spread market where it has one: margins.mjs mlModel. Without one (no spread line or price on
    // either side) it's the plain normal's, the underdog lean the spread's anchor takes out: anchored false,
    // and choose leans it nothing (the book's fair chance alone, an action bet at most). The spread it was
    // anchored to kept beside it, so a graded bet can be priced again the same way: backtest.mjs repriced)
    const f = fairOf('ml', ml.home, ml.away);
    const c = mlModel(exp.margin, params.sigma, shape, f, spreadHome);
    const anchor = c.anchored ? { anchored: true, spreadHome: { line: spreadHome.line, fair: round(spreadHome.fair, 4) } } : { anchored: false };
    both('ml', { side: 'home', line: null, odds: ml.home, model: cond(c), push: c.push, ...anchor }, { side: 'away', line: null, odds: ml.away, model: 1 - cond(c), push: c.push, ...anchor }, f);
  }
  return out;
}

// A game market's side as the residual model's ctx (residual.mjs hookChance, D32): the game's ctx ({ sport, t (the
// start), at (now), hours }) with the market, the side's line, its fair chance and model chance (the side's own;
// the hook mirrors an away or under side), and the two prices as the home's or over's and the away's or under's.
// None without a game ctx (the backtest, the self-check: the trust's chance alone). With a total's named terms'
// shift (D44, s.named) that rides along either way: chanceAt reads it before the hook
export const sideCtx = (market, s, ctx) => {
  const base = ctx ? { ...ctx, market: market.market, stat: market.market, line: s.line ?? null, side: s.side, f: s.fair, raw: s.model, overOdds: market.sides[0].odds, underOdds: market.sides[1].odds, home: null } : null;
  if (!Number.isFinite(s.named)) return base;
  return { ...(base ?? {}), named: s.named };
};

// The bet a market gets: the side with the better expected return at the desk's trust in the model (every
// market gets one; the lean tapered by leanOf: chanceAt), staked by its Kelly fraction; the other side's, scored
// the same, beside it (other: oneSide). A moneyline the spread didn't anchor leans nothing: the book's chance.
// ctx: the game's, for the residual model (sideCtx; run.mjs betGames passes it, so the live lines are priced as
// the gate's history replay prices them)
export function choose(market, trust, evScale, ctx = null) {
  const scored = market.sides.map((s) => {
    const p = s.anchored === false ? s.fair : chanceAt(market.market, s.fair, s.model, trust, sideCtx(market, s, ctx));
    // (a push gives the stake back: only the rest of the chance is won or lost)
    const ev0 = (1 - (s.push ?? 0)) * (p * decimal(s.odds) - 1);
    // (the sanity guard: an edge past the bar (suspectOf), its ev held to EV_SUSPECT at most, the practice stake, and the row marked)
    const suspect = suspectOf(ev0, `${market.market} ${s.side}${s.line !== null && s.line !== undefined ? ` ${s.line}` : ''} at ${s.odds}: p ${Math.round(p * 10000) / 10000}, the Book's no-vig ${Math.round(s.fair * 10000) / 10000}`, p);
    if (suspect) return { ...s, p, ev: heldEv(ev0), units: PRACTICE_UNITS, suspect };
    return { ...s, p, ev: ev0, units: stakeFor(ev0, evScale, s.odds) };
  });
  const [a, b] = scored;
  const pick = a.ev >= b.ev ? a : b;
  return { ...pick, other: pick === a ? b : a };
}

// The spread and the moneyline never on the same side of one game (the two win together: one bet twice).
// picks: this run's for the game ({ market, pick }); placed: its open bets already placed. Of two new on the
// same side, an edge bet over one to be tracked (its guard on it, x.guard), then the better return keeps it;
// a new one against a placed one gives way (run.mjs passes no tracked row as placed). The one giving way takes
// the other side if that has an edge (its pick replaced, flipped), else isn't bet (drop: why)
export function oneSide(picks, placed = []) {
  const s = picks.find((x) => x.market === 'spread');
  const m = picks.find((x) => x.market === 'ml');
  const sideOf = (market) => placed.find((b) => b.market === market)?.side;
  let loser = null;
  // (an edge bet before one that would be tracked (no edge, or a guard cut it: placement), then the better return)
  const bets = (x) => x.pick.ev > 0 && !x.guard;
  if (s && m && s.pick.side === m.pick.side) loser = bets(s) !== bets(m) ? (bets(s) ? m : s) : s.pick.ev >= m.pick.ev ? m : s;
  else if (s && sideOf('ml') === s.pick.side) loser = s;
  else if (m && sideOf('spread') === m.pick.side) loser = m;
  if (!loser) return picks;
  const other = loser.pick.other;
  return picks.map((x) => {
    if (x !== loser) return x;
    if (other && other.ev > 0) return { ...x, pick: { ...other, other: x.pick }, flipped: true };
    return { ...x, drop: `the ${x.market === 'ml' ? 'spread' : 'moneyline'} has its side already, and the other side has no edge` };
  });
}

// The open action bets on a game to take back so its new edge bets fit under the cap: across runs the cap fills
// first come, first served (an MLB lineup's batter props, 0.5u action bets each, can be placed hours before
// the game lines wait out the other lineup), so an action bet, with no edge, would otherwise keep an edge bet
// from the room capGame gives it within a run. open: the game's open bets ({ id, units, ev, intent }); need:
// the new edge bets' units; takeable(bet): whether it may still be taken back (not locked, run.mjs). The
// least worth having first (a prop before a game market, the lower return first), only as many as the room
// needs (all of them, if it needs more: capGame then scales the edge bets into what there is). Since action
// bets are tracked instead (TRACK), only the older ones still open are taken back: a tracked row stakes
// nothing, so it frees no room and is never taken back
export function makeRoom(open, need, cap, takeable = () => true) {
  const used = open.reduce((t, b) => t + b.units, 0);
  let short = need - (cap - used);
  if (short <= 1e-9) return [];
  const pool = open.filter((b) => intentOf(b) !== 'edge' && !isTracked(b) && b.units > 0 && takeable(b)).sort((a, b) => (b.market === 'prop') - (a.market === 'prop') || a.ev - b.ev);
  const out = [];
  for (const b of pool) {
    if (short <= 1e-9) break;
    out.push(b);
    short -= b.units;
  }
  return out;
}

// A game's new bets under its cap: the units already open on it (placed) and the new ones' at most cap. Filled
// in order of worth: the edge bets first, at their full stakes while they fit (over the room on their own,
// scaled down alike among themselves, by half units, 0.5 the least, the smaller return dropped first); then
// what room is left to the action bets at their stakes (a game market's before a prop's: the main markets'
// data teach their trust and CLV; the bigger return first), the rest dropped. So an action bet, with no edge,
// never takes room an edge bet would have had. Each bet: { units, ev, intent, market }; kept (at its units;
// cappedFrom, what it would have staked) and dropped. A tracked row (TRACK) stakes nothing: always kept, after
// the bets, outside the cap
export function capGame(bets, placed, cap) {
  const tracked = bets.filter(isTracked);
  const res = capStaked(bets.filter((b) => !isTracked(b)), placed, cap);
  return { kept: [...res.kept, ...tracked], dropped: res.dropped };
}

function capStaked(bets, placed, cap) {
  const rank = (b) => (b.intent === 'edge' ? 0 : b.market === 'prop' ? 2 : 1);
  const order = [...bets].sort((a, b) => rank(a) - rank(b) || b.ev - a.ev);
  const room = cap - placed;
  const sum = order.reduce((t, b) => t + b.units, 0);
  if (sum <= room + 1e-9) return { kept: order, dropped: [] };
  const edges = order.filter((b) => b.intent === 'edge');
  const edgeSum = edges.reduce((t, b) => t + b.units, 0);
  // (the edge bets over the room on their own: each scaled down, by half units, 0.5 the least)
  let scaled = null;
  if (edgeSum > room) {
    const scale = Math.max(0, room) / edgeSum;
    scaled = new Map(edges.map((b) => [b, Math.max(0.5, Math.floor(b.units * scale * 2) / 2)]));
    let total = [...scaled.values()].reduce((t, u) => t + u, 0);
    // (over the room even so: the smaller returns dropped)
    for (let i = edges.length - 1; i >= 0 && total > room + 1e-9; i--) {
      total -= scaled.get(edges[i]);
      scaled.delete(edges[i]);
    }
    // (the room the rounding left back to the edge bets, the better first, a half unit at a time up to their
    // own stakes: not to an action bet)
    for (let more = true; more; ) {
      more = false;
      for (const b of edges) {
        if (!scaled.has(b) || scaled.get(b) >= b.units || total + 0.5 > room + 1e-9) continue;
        scaled.set(b, scaled.get(b) + 0.5);
        total += 0.5;
        more = true;
      }
    }
  }
  const kept = [];
  const dropped = [];
  let used = 0;
  for (const b of order) {
    const units = scaled && b.intent === 'edge' ? (scaled.get(b) ?? Infinity) : b.units;
    if (used + units <= room + 1e-9) {
      kept.push(units === b.units ? b : { ...b, units, cappedFrom: b.units });
      used += units;
    } else dropped.push(b);
  }
  return { kept, dropped };
}

// Same-game sizing (audit #20): a game's props share its pace and its script, so they win or lose together a
// little, overs with overs and unders with unders, an over against an under the other way; one player's two
// props (his points and his shots) more so. Two correlations between a game's props' results, signed by their
// sides (rho·s_i·s_j, s +1 an over, -1 an under), by the pair's kind: player, the same player's two props;
// game, any other two in the game. Each fit on the sport's graded props (fitSameGame), used only where the days
// after its fit bore it out (sameGameOf), and a game's edge props sized jointly with them (sizeJointly), so a
// game's props leaning one way stake like fewer, bigger bets on it, and the ones a hedge balances stake as they
// were. Stakes only: never a bet added or dropped, never a stake raised.
//   minGames    games with a pair of a kind before its rho is read at all (0 till then: the stakes as before)
//   shrink      games: a kind's read pulled toward 0 by shrink / (games + shrink), so a few games' luck stakes
//               nothing
//   max         the most a rho may be
//   minHeld     held-out games a kind's rho must have been scored on (sameGameOf) before it's used
//   minResized  stakes a replay must have resized before its bankroll growth can turn the sizing off (fewer:
//               a game or two's luck)
export const SAME_GAME = { minGames: 10, shrink: 30, max: 0.25, minHeld: 5, minResized: 10 };
export const SAME_GAME_KINDS = ['player', 'game'];
const sideSign = (b) => (b.side === 'over' ? 1 : b.side === 'under' ? -1 : 0);
// (a pair's kind: one player's two props, or any other two)
const kindOf = (a, b) => (a.athlete != null && a.athlete === b.athlete ? 'player' : 'game');
// (the NFL's anytime touchdowns (anytime.mjs: 'anyTd', tracked only) never among them: a market the desk never
// stakes, so its rows don't move how the staked props are sized together)
const gradedProps = (list) => list.filter((b) => b.market === 'prop' && b.propType !== 'anyTd' && !b.void && (b.status === 'won' || b.status === 'lost') && b.p > 0 && b.p < 1 && sideSign(b) && b.event != null);
const missOf = (b) => ((b.status === 'won') - b.p) / Math.sqrt(b.p * (1 - b.p));
const byEvent = (list) => {
  const out = new Map();
  for (const b of list) out.set(b.event, [...(out.get(b.event) ?? []), b]);
  return out;
};
// (one game's graded props' pairs: [kind, the product of their misses, each less its side's mean, times their signs])
function pairsOf(bets, means) {
  const z = bets.map((b) => (missOf(b) - (means[b.side] ?? 0)) * sideSign(b));
  const out = [];
  for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) out.push([kindOf(bets[i], bets[j]), z[i] * z[j]]);
  return out;
}

// Each kind's rho from the graded props (won or lost; a push or a void isn't a result): each one's standardized
// miss, (won − p) / sqrt(p(1 − p)), less the mean miss of its side (a model that ran low on every over isn't a
// correlation within games: centered by one mean for both sides, the gap between the overs' and the unders'
// misses read as one, about a tenth of the NHL's), and every pair in a game: the product of their misses times
// their signs, averaged over the kind's pairs. raw, that average; se, its jackknife by game; rho, raw past 0
// shrunk and held to max, 0 under minGames; means, the sides' mean misses. Measured 2026-10-13 on the ledgers,
// each side centered: NHL a player's own (his points and his shots) +0.156 (se 0.073, 275 pairs in 19 games),
// the rest +0.029 (0.016, 11440 pairs in 27; same side and opposite alike, the same team or not); NFL the rest
// +0.042 (0.056, 14 games), one player pair; MLB 4 games; NBA none. The game markets with the props: NHL +0.003
// (2124 pairs), left out
export function fitSameGame(list) {
  const graded = gradedProps(list);
  const means = {};
  for (const side of ['over', 'under']) {
    const xs = graded.filter((b) => b.side === side);
    means[side] = xs.length ? xs.reduce((t, b) => t + missOf(b), 0) / xs.length : 0;
  }
  const sums = Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, []]));
  for (const bets of byEvent(graded).values()) {
    if (bets.length < 2) continue;
    const t = Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, [0, 0]]));
    for (const [k, x] of pairsOf(bets, means)) (t[k][0] += x), t[k][1]++;
    for (const k of SAME_GAME_KINDS) if (t[k][1]) sums[k].push(t[k]);
  }
  const out = { means: { over: round(means.over, 4), under: round(means.under, 4) } };
  for (const k of SAME_GAME_KINDS) {
    const s = sums[k];
    const S = s.reduce((t, x) => t + x[0], 0);
    const N = s.reduce((t, x) => t + x[1], 0);
    const games = s.length;
    if (!N) {
      out[k] = { rho: 0, raw: null, se: null, games: 0, pairs: 0, fitted: false };
      continue;
    }
    const raw = S / N;
    // (the jackknife by game: each game left out in turn)
    const jk = games > 1 ? s.map(([a, n]) => (S - a) / (N - n)) : [];
    const jm = jk.reduce((t, x) => t + x, 0) / Math.max(1, jk.length);
    const se = jk.length > 1 ? Math.sqrt(((jk.length - 1) / jk.length) * jk.reduce((t, x) => t + (x - jm) ** 2, 0)) : null;
    const fitted = games >= SAME_GAME.minGames;
    const rho = fitted ? Math.min(SAME_GAME.max, (Math.max(0, raw) * games) / (games + SAME_GAME.shrink)) : 0;
    out[k] = { rho: round(rho, 4), raw: round(raw, 4), se: se === null ? null : round(se, 4), games, pairs: N, fitted };
  }
  return out;
}

// (a·x = y by elimination, partial pivoting; null where it can't be solved)
function solve(a, y) {
  const n = y.length;
  const m = a.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (!(Math.abs(m[p][c]) > 1e-9)) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

// A game's new bets sized jointly (fitSameGame's rhos, { player, game }, or one number for both): its edge
// props (more than the 0.5 minimum) are the stakes that move; every other prop on the game, this run's action
// ones and the ones already open on it (fixed: a list of { side, units, athlete }), counts as placed. Kelly for
// bets that correlated (stakes in units as the stakes' scale; each bet's spread about alike near even money): the
// stakes u solving R·u = u0 on the edge props' rows, u0 each one's own stake and R the correlations, the pair's
// kind's rho·s_i·s_j off the diagonal (a player's two props by the player rho, any other two by the game's), the
// placed ones' stakes on the right. A stake that would rise (a hedge's) stays its own, one under 0.5 is 0.5, and
// those fixed, the rest solved again; then by half units. So n edge props on one side at a stake, all one kind,
// each stake 1 / (1 + (n − 1)·rho) of it. The game markets aren't in it (their results with the props' measured
// at about 0). Unsolvable: the stakes as they were. A tracked row (TRACK) stakes nothing: no exposure, never among
// the props it counts. Returns the bets, a resized one with sizedFrom (its own stake)
export function sizeJointly(bets, fixed, rho) {
  const rhoOf = (a, b) => (typeof rho === 'number' ? rho : (rho?.[kindOf(a, b)] ?? 0));
  if (!(typeof rho === 'number' ? rho > 0 : SAME_GAME_KINDS.some((k) => rho?.[k] > 0))) return bets;
  const moves = (b) => b.market === 'prop' && intentOf(b) === 'edge' && b.units > 0.5 && sideSign(b);
  let free = bets.filter(moves);
  if (!free.length) return bets;
  // (a tracked row stakes nothing: no exposure, never counted)
  const held = [...bets.filter((b) => b.market === 'prop' && !moves(b)), ...fixed].filter((b) => sideSign(b) && !isTracked(b));
  const r = (a, b) => rhoOf(a, b) * sideSign(a) * sideSign(b);
  const pinned = new Map();
  let u = new Map();
  for (let pass = 0; pass <= bets.length; pass++) {
    const placed = [...held.map((b) => [b, b.units]), ...pinned];
    const x = solve(
      free.map((a, i) => free.map((b, j) => (i === j ? 1 : r(a, b)))),
      free.map((a) => a.units - placed.reduce((t, [b, units]) => t + r(a, b) * units, 0))
    );
    if (!x) return bets;
    u = new Map(free.map((b, i) => [b, x[i]]));
    const out = free.filter((b) => u.get(b) > b.units + 1e-9 || u.get(b) < 0.5 - 1e-9);
    if (!out.length) break;
    for (const b of out) pinned.set(b, u.get(b) > b.units ? b.units : 0.5);
    free = free.filter((b) => !pinned.has(b));
    if (!free.length) break;
  }
  return bets.map((b) => {
    if (!moves(b)) return b;
    const x = pinned.has(b) ? pinned.get(b) : u.get(b);
    const units = Math.min(b.units, Math.max(0.5, Math.round(x * 2) / 2));
    return units === b.units ? b : { ...b, units, sizedFrom: b.units };
  });
}

// (the rhos used, in words: a bet's note and the run log)
export const sameGameRhoText = (used) => `a player's own ${used?.player ?? 0}, the game's ${used?.game ?? 0}`;

// The same-game sizing the desk bets with (run.mjs placeBets): each kind's rho fit on every graded prop
// (fitSameGame), used only where held-out days bore it out. Held out: the graded days in order (each its US
// Eastern date, the slate's, so an evening game's isn't fit on the same night's earlier games), each day's prop
// pairs scored against the rho fit on the days before (its sides' means the same days'), the squared miss of
// their products against that rho and against 0: held.gain, their difference summed (more than 0: the rho read
// before was nearer what happened than none). A kind is used at its rho where it's fit, it was scored on minHeld
// games or more and gained; else 0 (no evidence, no sizing). Then the floor, on the bankroll: the graded games
// replayed, each one's props sized jointly (one batch, nothing open before it: the live runs size each run's
// against the ones already open) from the stakes before any sizing (context.sameGameFrom, where a live run cut
// one), every bet's profit at its stake that way, log growth on the bankroll against those stakes; twice, asOf
// at the rhos fit on the days before each game's (no look-ahead), inSample at the rhos used now (fit on those
// games themselves, but the stakes they'd cut today). Either one having resized minResized stakes or more and
// grown the bankroll less: both 0 (floor). Read 2026-10-13 (each side centered): NHL a player's own +0.156 (se
// 0.073, 19 games), the game's +0.029 (27 games); NFL 1 player pair, the game's +0.042 (14 games); MLB, NBA
// under minGames. A tracked row (TRACK, not bet) is evidence for the fits and the held-out scores (its result, as
// every fit reads one: learnView) but stakes nothing in the replay, as it stakes nothing live
export function sameGameOf(list) {
  const fit = fitSameGame(list);
  const at = (b) => Date.parse(b.start);
  // (the evidence: every graded prop with a game and a start, tracked rows among them; done: the staked ones, replayed)
  const evid = gradedProps(list).filter((b) => Number.isFinite(at(b)));
  const done = list.filter((b) => !b.void && (b.status === 'won' || b.status === 'lost' || b.status === 'push') && Number.isFinite(b.profit) && b.units > 0 && !isTracked(b) && b.event != null && Number.isFinite(at(b)));
  const dayOf = new Map([...evid, ...done].map((b) => [b, etDay(at(b))]));
  const days = [...new Set(dayOf.values())].sort();
  const before = new Map(days.map((d) => [d, fitSameGame(evid.filter((b) => dayOf.get(b) < d))]));
  const held = Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, { games: 0, pairs: 0, gain: 0 }]));
  for (const d of days) {
    const f = before.get(d);
    for (const bets of byEvent(evid.filter((b) => dayOf.get(b) === d)).values()) {
      const seen = new Set();
      for (const [k, x] of pairsOf(bets, f.means)) {
        const rho = f[k].rho;
        if (!(rho > 0)) continue;
        held[k].gain += rho * (2 * x - rho);
        held[k].pairs++;
        seen.add(k);
      }
      for (const k of seen) held[k].games++;
    }
  }
  const used = Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, fit[k].fitted && fit[k].rho > 0 && held[k].games >= SAME_GAME.minHeld && held[k].gain > 0 ? fit[k].rho : 0]));
  const games = [...byEvent(done).values()].sort((a, b) => at(a[0]) - at(b[0]));
  const replay = (rhoFor) => {
    const br = { asBet: BANKROLL, joint: BANKROLL };
    const growth = { asBet: 0, joint: 0 };
    let resized = 0;
    let trimmed = 0;
    for (const g of games) {
      // (each bet from its stake before any sizing: a live cut undone)
      const from = g.map((b) => (b.context?.sameGameFrom > b.units ? b.context.sameGameFrom : b.units));
      const sized = sizeJointly(g.map((b, i) => (from[i] === b.units ? b : { ...b, units: from[i] })), [], rhoFor(g));
      const p = { asBet: 0, joint: 0 };
      for (let i = 0; i < g.length; i++) {
        p.asBet += (g[i].profit * from[i]) / g[i].units;
        p.joint += (g[i].profit * sized[i].units) / g[i].units;
        if (sized[i].units !== from[i]) (resized++, (trimmed += from[i] - sized[i].units));
      }
      for (const k of ['asBet', 'joint']) {
        growth[k] += Math.log(Math.max(1e-9, br[k] + p[k]) / br[k]);
        br[k] = br[k] + p[k] > 0 ? br[k] + p[k] : BANKROLL;
      }
    }
    const worse = resized >= SAME_GAME.minResized && growth.joint < growth.asBet - 1e-12;
    return { resized, trimmed: round(trimmed, 1), asBet: round(growth.asBet * 1e3, 3), joint: round(growth.joint * 1e3, 3), worse };
  };
  const asOf = replay((g) => Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, used[k] > 0 ? before.get(dayOf.get(g[0]))[k].rho : 0])));
  const inSample = replay(() => used);
  const floor = SAME_GAME_KINDS.some((k) => used[k] > 0) && (asOf.worse || inSample.worse);
  const out = Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, { ...fit[k], held: { games: held[k].games, pairs: held[k].pairs, gain: round(held[k].gain, 3) } }]));
  return { ...out, used: floor ? Object.fromEntries(SAME_GAME_KINDS.map((k) => [k, 0])) : used, floor, replay: { games: games.length, asOf, inSample } };
}

// A game's new bets placed (run.mjs placeBets): its edge props sized jointly at the rhos used (sizeJointly; its
// props standing open counted as placed), then room made among its open action bets for its edge bets
// (makeRoom: takeable, which of them may go; a prop it takes back sized against no longer: the edge props sized
// again without it, so a stake isn't cut for a bet that's gone), then the game's cap (capGame) on what's left
// open; a tracked row (TRACK) stakes nothing, in none of the three (kept outside the cap, never sized against,
// never taken back). Returns out
// (the open bets taken back), open (the units still open on it), dropped, and kept: each with its notes, the
// sizing's (context.sameGame in words and context.sameGameFrom, its stake before, for sameGameOf's replay) and
// the cap's, and sized and capped (how many each cut)
export function placeGame(mine, standing, rho, cap, takeable = () => true) {
  let bets = sizeJointly(mine, standing.filter((b) => b.market === 'prop'), rho);
  const need = bets.filter((b) => intentOf(b) === 'edge').reduce((t, b) => t + b.units, 0);
  const out = makeRoom(standing, need, cap, takeable);
  if (out.some((b) => b.market === 'prop')) bets = sizeJointly(mine, standing.filter((b) => b.market === 'prop' && !out.includes(b)), rho);
  const open = standing.filter((b) => !out.includes(b)).reduce((t, b) => t + b.units, 0);
  const res = capGame(bets, open, cap);
  let sized = 0;
  let capped = 0;
  const kept = res.kept.map(({ cappedFrom, sizedFrom, ...b }) => {
    if (sizedFrom) {
      sized++;
      b.context = { ...b.context, sameGame: `${sizedFrom}u sized to ${cappedFrom ?? b.units}u with the game's other props (same-game rho ${sameGameRhoText(rho)})`, sameGameFrom: sizedFrom };
    }
    if (cappedFrom) {
      capped++;
      b.context = { ...b.context, cap: `${cappedFrom}u cut to ${b.units}u: the game's ${cap}u cap` };
    }
    return b;
  });
  return { out, open, dropped: res.dropped, kept, sized, capped };
}

// The guard for a market: why to cut its stake (or skip it), or null
// Only a move against the bet's side counts (the market's money on the other side: steam); one toward it is
// the market agreeing, and isn't held against it. A move the model's own context explains (it saw the backup
// QB the line moved for, and moved its number the same way) doesn't count against the bet either: only what's
// left of the move once the context's shift is taken off it does. A context shift the other way explains
// nothing. Each in the line's own units: the home side's points (a home spread moving down is the market
// moving toward home), the total's points, the moneyline's home chance (its points through the margin spread:
// a chance near even moves about 0.4 / sigma a point). side: the bet's (none: a move either way counts).
// One to watch (selfcheck.mjs C19, 2026-10-13): the NFL's game bets moved past the limit their way, which this
// lets through, ran 28 points under the book's chance on 9 bets (its z -1.61 against that chance; 1 unmoved
// to set it against): not past noise; C19 says when it is
export function guardOf(limits, market, move, flags, adj = { m: 0, t: 0 }, sigma = null, side = null) {
  const limit = limits?.[market];
  const moved = move?.[market];
  if (limit && moved !== null && moved !== undefined && moved !== 0) {
    const toPoints = market === 'ml' ? (sigma ? sigma / 0.4 : null) : 1;
    // (the market's move and the context's shift, both as points toward home / onto the total)
    const market_ = market === 'spread' ? -moved : market === 'total' ? moved : toPoints ? moved * toPoints : null;
    // (the move's way, and the bet's: home or over +1, away or under -1)
    const way = Math.sign(market_ ?? moved);
    const mine = side === 'home' || side === 'over' ? 1 : side === 'away' || side === 'under' ? -1 : 0;
    if (!mine || way !== mine) {
      const shift = market === 'total' ? adj.t : adj.m;
      const explained = market_ !== null && Math.sign(shift) === Math.sign(market_) ? Math.min(Math.abs(shift), Math.abs(market_)) : 0;
      const left = market_ === null ? Math.abs(moved) : (Math.abs(market_) - explained) / (toPoints ?? 1);
      if (left >= limit) {
        const why = `line moved ${moved > 0 ? '+' : ''}${moved} since it opened${mine ? ', against it' : ''}${explained ? ` (${round(explained, 1)} of it explained by the context)` : ''}`;
        return left >= 2 * limit ? { skip: true, why } : { why };
      }
    }
  }
  if (flags.length) return { why: flags.join('; ') };
  return null;
}

// (a bet with no edge, placed for the data, or one it saw value in; bets from before the intent was kept go
// by their EV. From 2026-10-13 one with no edge is tracked, not bet: 'track')
export const intentOf = (bet) => bet.intent ?? (bet.ev > 0 ? 'edge' : 'action');

// (a market tracked, not bet: no edge (from 2026-10-13; a guard's cut with an edge is bet at the minimum).
// Graded and learned from like a bet, never staked)
export const TRACK = 'track';
export const isTracked = (bet) => bet?.intent === TRACK;

// A new row's intent and stake: an edge bet at its units; anything else tracked, units 0, what it would have
// staked as the old action bet kept (trackUnits: learnView's)
export const placement = (edge, units) => (edge ? { intent: 'edge', units } : { intent: TRACK, units: 0, trackUnits: units });

// A row as the learning reads it: a tracked one as the action bet it would have been (intent 'action', its
// trackUnits staked, its profit at them by its result: as settle and props.mjs settleProp would have paid it),
// so every fit, measure and check over the ledger comes out as it did when they were placed; a bet as it is
export function learnView(bet) {
  if (!isTracked(bet)) return bet;
  const units = Number.isFinite(bet.trackUnits) ? bet.trackUnits : 0.5;
  const profit = bet.status === 'won' && !bet.void ? round(units * (decimal(bet.odds) - 1), 3) : bet.status === 'lost' ? -units : 0;
  return { ...bet, intent: 'action', units, profit };
}

// (a bet by how far it finished past its line, its side's way: won over 0, lost under, a push at 0; what it
// paid, its stake back not counted: settle and props.mjs settleProp)
export function outcomeOf(bet, edge) {
  const status = edge > 0 ? 'won' : edge < 0 ? 'lost' : 'push';
  const profit = status === 'won' ? bet.units * (decimal(bet.odds) - 1) : status === 'lost' ? -bet.units : 0;
  return { status, profit: round(profit, 3) };
}

// A bet's words: "DAL -8.5", "Over 47.5", "TB ML"
export function pickText(bet, game) {
  const abbr = bet.side === 'home' ? game.homeAbbr : game.awayAbbr;
  if (bet.market === 'total') return `${bet.side === 'over' ? 'Over' : 'Under'} ${bet.line}`;
  if (bet.market === 'spread') return `${abbr} ${bet.line > 0 ? '+' : ''}${bet.line}`;
  return `${abbr} ML`;
}

// A bet against its game's final: won, lost or a push, and what it paid. An MLB game shortened (rain: called
// before 9 innings, or 8 and a half with the home side ahead; espn.mjs gameOf's short) is official, so its
// moneyline stands, but DraftKings voids its run line and total: no action, stake back
export function settle(bet, game) {
  if (game.short && (bet.market === 'spread' || bet.market === 'total')) {
    const final = `${game.awayAbbr} ${game.as} @ ${game.homeAbbr} ${game.hs} (${game.short} innings)`;
    return { status: 'push', profit: 0, void: true, final, why: `Void: game shortened to ${game.short} innings` };
  }
  const margin = game.hs - game.as;
  let edge;
  if (bet.market === 'spread') edge = (bet.side === 'home' ? margin : -margin) + bet.line;
  else if (bet.market === 'total') edge = (bet.side === 'over' ? 1 : -1) * (game.hs + game.as - bet.line);
  else edge = bet.side === 'home' ? margin : -margin;
  return { ...outcomeOf(bet, edge), final: `${game.awayAbbr} ${game.as} @ ${game.homeAbbr} ${game.hs}` };
}

// (DraftKings' rule for a game called off, the desk's book: a bet on one canceled, or forfeit, is void as soon
// as a run sees it; one postponed or suspended stands only if the game's played to its final within 48 hours
// of the start it was bet on, else it's void too. A game moved more than 48 hours with no word of it is a
// postponement; one seen called off whose final no run saw inside the 48 hours counts as finished after them)
export const VOID_AFTER = 48 * 36e5;

// A bet's void, if its game was called off (a void prop's own: a push, its stake back, no action, out of the
// record, the ROI and the trust fit); null for one still open or to be graded on its final
export function voidOf(bet, game, now) {
  if (!game) return null;
  const start = Date.parse(bet.start);
  const late = now - start > VOID_AFTER;
  const moved = Date.parse(game.date) - start > VOID_AFTER;
  let why = null;
  if (game.off === 'canceled' || game.off === 'forfeit') why = game.off;
  else if (game.final) why = moved || (bet.off && late) ? 'not played within 48 hours' : null;
  else if (late && (game.off || bet.off || moved)) why = `${game.off ?? bet.off ?? 'postponed'}, not played within 48 hours`;
  if (!why) return null;
  return { status: 'push', profit: 0, void: true, ...(bet.market === 'prop' ? { actual: null } : {}), final: why, why: `Void: game ${why}` };
}

// The trust in the model a market has earned: of 0 to 1 (never more than the model's own chance), the one that
// would have made its bets' chances closest to what happened, less a cost for trusting it at all. Two kinds of
// evidence, as log-likelihoods: each graded bet's result (a bet whose premise broke in the game, a starter hurt
// or a goalie pulled, counts for its weight, less than 1: noise, not evidence), and each bet's closing chance
// (clv.mjs: the market's fair chance of its side at the close, its last word with everyone's money and news in
// it; a model whose chances run ahead of where the market closes is worth trusting long before enough results
// are in to say so; a void bet, no action, is neither). A bet with both counts once, half each; and a game's
// n bets count less each, 1 / (1 + (n - 1)·RHO) (the props of one game share its pace and its script: the
// design effect of bets that correlated, so 10 on one game weigh as about 2.7; eff, the bets' worth all told).
// Each bet scored at the chance the desk bets with (chanceAt: the lean tapered past half of GAP), and one past
// GAP, which the desk never places, left out. A bet placed under other timing (tw: run.mjs counts a live bet
// placed well before its sport's window opens, from before the desk waited for the news, at half) counts for
// that share of both kinds.
// A tracked row (TRACK: no edge, not bet) is evidence the same as a placed bet: the fit reads its result and its
// close, never its stake.
// Until a market has 40 bets with either, the starting trust.
const RHO = 0.3;
export function fitTrust(list, start, { min = 40 } = {}) {
  // (a bet past its market's GAP is one the desk would never place (gapGuard): not evidence for its trust)
  const bets = list.filter((b) => !pastGap(b.market, b.model, b.fair));
  const decided = bets.filter((b) => b.status === 'won' || b.status === 'lost');
  const closed = bets.filter((b) => !b.void && b.clv && b.clv.q !== null && b.clv.q !== undefined && Number.isFinite(b.fair) && Number.isFinite(b.model));
  const isDecided = new Set(decided);
  const isClosed = new Set(closed);
  const all = new Set([...decided, ...closed]);
  const perGame = new Map();
  const gameOf = (b) => b.event ?? b.id;
  for (const b of all) perGame.set(gameOf(b), (perGame.get(gameOf(b)) ?? 0) + 1);
  const share = (b) => 1 / (1 + ((perGame.get(gameOf(b)) ?? 1) - 1) * RHO);
  const eff = round([...all].reduce((s, b) => s + share(b), 0), 1);
  if (all.size < Math.max(1, min)) return { trust: start, n: decided.length, clvN: closed.length, eff, fitted: false };
  // (each piece of evidence's weight: its game's share, halved where the bet has the other kind too)
  const wResult = (b) => (b.weight ?? 1) * (b.tw ?? 1) * share(b) * (isClosed.has(b) ? 0.5 : 1);
  const wClose = (b) => (b.tw ?? 1) * share(b) * (isDecided.has(b) ? 0.5 : 1);
  const n = decided.reduce((s, b) => s + wResult(b), 0) + closed.reduce((s, b) => s + wClose(b), 0);
  let best = { trust: start, loss: Infinity };
  for (let t = 0; t <= 1.0001; t += 0.05) {
    let loss = 0;
    // (the chance the desk would bet with at this trust: the lean tapered as choose tapers it, chanceAt)
    const pOf = (b) => Math.min(0.995, Math.max(0.005, chanceAt(b.market, b.fair, b.model, t, Number.isFinite(b.named) ? { named: b.named } : null)));
    for (const b of decided) loss -= wResult(b) * Math.log(b.status === 'won' ? pOf(b) : 1 - pOf(b));
    // (the closing chance as a soft result: best matched by a chance equal to it)
    for (const b of closed) loss -= wClose(b) * (b.clv.q * Math.log(pOf(b)) + (1 - b.clv.q) * Math.log(1 - pOf(b)));
    // (trusting the model has to be earned: each unit of trust costs 2 nats, so luck over a few dozen bets
    // doesn't buy it, and with no real edge the fit settles near the book)
    const penalized = loss + 2 * t * t;
    if (penalized < best.loss) best = { trust: round(t, 2), loss: penalized, raw: loss };
  }
  return { trust: best.trust, n: decided.length, clvN: closed.length, eff, fitted: true, logLoss: round(best.raw / n, 4) };
}

// The props' trust by the line's size (2026-10-18, the audit: out of sample since 10-08 the raw model said .538 on
// lines of 1.5 or under and hit .481 against the book's .495, .579 on 2 to 3.5 for .493; the NFL's receptions at
// 1.5 or under .588 for .429). A count that small is a few events, where the model's spread is least sure, so a
// low line's trust is its own, fit on its own graded record and closes against the book (fitTrust), never the
// stat's alone. Bucketed by the line's size, whatever the stat or the sport (a 0.5 line is a 0 against any 1, in
// hits, goals, threes, blocks or rounds): low 1.5 or under, mid 2 to 3.5, high over 3.5 (yards, points, saves:
// the stat's own trust). Each bucket's start (BUCKET_START: low 0.25, mid 0.375, high the desk's 0.5) the root of
// a ladder, each rung pulled toward the one above by its own evidence (soft, never an off switch: shrunkTrust,
// eff / (eff + TRUST_K) of its own fit kept): every sport's props in the bucket pooled (pool), the sport's
// (sport), the stat's (its key's). Priced at the stat's bucket's trust, held to the stat's own (bucketTrustOf: the
// bucket only ever shrinks it). The MMA's round totals by the same buckets (mma-desk.mjs)
export const BUCKETS = ['low', 'mid', 'high'];
export const BUCKET_START = { low: 0.25, mid: 0.375, high: 0.5 };
export const TRUST_K = 40;
export const lineBucket = (line) => (!Number.isFinite(line) ? 'high' : line <= 1.5 ? 'low' : line <= 3.5 ? 'mid' : 'high');
export const bucketKey = (key, line) => `${key}@${lineBucket(line)}`;
// (a rung's trust: its fit on its own evidence (any amount: fitTrust's min 1), kept by eff / (eff + TRUST_K),
// the rest its parent's)
export function shrunkTrust(list, parent) {
  const f = fitTrust(list, parent, { min: 1 });
  const w = f.eff > 0 ? f.eff / (f.eff + TRUST_K) : 0;
  return { trust: round(parent + w * (f.trust - parent), 3), parent: round(parent, 3), own: f.trust, n: f.n, clvN: f.clvN, eff: f.eff, weight: round(w, 3), fitted: f.eff >= TRUST_K };
}
// The ladder: { pool: { <bucket>: rung }, sport: { <bucket>: rung }, keys: { <key>: { <bucket>: rung } } }. pool:
// the evidence of every sport's props (and the MMA's totals) placed since the epoch, this sport's among them;
// mine: this sport's; keyOf(b): a bet's key (prop:<stat>); keys: the keys to fit. A key's rungs ride on its
// trust (trust[key].lines), the pool's and the sport's in state.lineTrust
export function fitBuckets(pool, mine, keyOf, keys) {
  const out = { pool: {}, sport: {}, keys: Object.fromEntries(keys.map((k) => [k, {}])) };
  for (const bk of BUCKETS) {
    const inB = (b) => lineBucket(b.line) === bk;
    const root = shrunkTrust(pool.filter(inB), BUCKET_START[bk]);
    out.pool[bk] = root;
    const own = mine.filter(inB);
    const sport = shrunkTrust(own, root.trust);
    out.sport[bk] = sport;
    for (const k of keys) out.keys[k][bk] = shrunkTrust(own.filter((b) => keyOf(b) === k), sport.trust);
  }
  return out;
}
// A prop's (or a total's) trust at its line: its key's bucket's rung (trust[key].lines), held to the key's own
// trust; one with no rung (a state from before the buckets) the key's own, held to the bucket's start
export function bucketTrustOf(trust, key, line, fallback = 0.5) {
  const own = trust?.[key]?.trust ?? fallback;
  const rung = trust?.[key]?.lines?.[lineBucket(line)]?.trust;
  return Math.min(own, Number.isFinite(rung) ? rung : BUCKET_START[lineBucket(line)]);
}

// A record: won, lost, pushed, units staked and won, the return on them (a void bet, no action, isn't in it,
// nor a tracked row: never bet; nor, while PRACTICE_SPLIT, a slate's practice pick: practice, theirs alone)
export function record(bets, { practice = false } = {}) {
  const r = { bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0 };
  for (const b of bets) {
    if (b.status === 'open' || b.void || isTracked(b)) continue;
    if (inPractice(b) !== practice) continue;
    r.bets++;
    r[b.status === 'won' ? 'won' : b.status === 'lost' ? 'lost' : 'push']++;
    r.staked += b.units;
    r.profit += b.profit;
  }
  return { ...r, staked: round(r.staked, 2), profit: round(r.profit, 2), roi: r.staked ? round(r.profit / r.staked, 4) : null };
}

// The slate's practice picks (2026-10-18, the owner: "the idea that the bot is going to stop finding picks because of
// its historical record is a flaw... it should be using history to make BETTER picks, not stop playing the game
// altogether"). Each slate (a sport's US Eastern day) plays its best candidates by their corrected edge (correct.mjs:
// the chance over the book's no-vig one, before the vig): every row clearing the vig bet as ever, and the best of
// the rest with an edge before the vig bet at PRACTICE_UNITS, a LIKE at most, so the slate has about PRACTICE_N
// (slateQuota: PRACTICE_N over the slate's games, at least one a game). Placed, shown on the Book with a practice
// tag, graded and learned from like any bet (the correction, the trust, the calibration read them). PRACTICE_SPLIT
// (the owner's, the same day: "not set on practice bets counting in the real record"): on, they're tallied on their
// own Practice line (record's practice, picks.mjs recentOf's practice, the Algorithm tab's Practice panel), out of
// the bot's record, its recent form and the CLV gates, which stay the bets that cleared the vig; off, one record.
// The one flag: state.json carries it (practiceSplit) for the page
export const PRACTICE_SPLIT = true;
// (and staked at all: off since 2026-10-20 (the owner: "make them tracked only"; on the replayed history they lost
// about the vig, NFL -71u, NBA -58u, NHL -85u, MLB -192u): no slate pick is forced into a bet, so the best of the rest
// stay tracked rows like every other one short of the vig, graded and learned from at no stake. DECISIONS.md D57
export const PRACTICE_STAKED = false;
export const PRACTICE_N = { nfl: 15, nhl: 6, mlb: 3, nba: 8, mma: 3 };
// (a slate's practice pick: placed for the slate, not for clearing the vig)
export const isPracticeTop = (b) => !!b?.topN;
// (one kept off the main record: a practice pick while the split's on)
export const inPractice = (b) => PRACTICE_SPLIT && isPracticeTop(b);
// (a game's share of its slate's N: N over the slate's games, at least one; each game's its own, so a game whose
// props open late is never starved by the ones bet before it)
export const slateQuota = (n, games) => Math.max(1, Math.round((n ?? 0) / Math.max(1, games ?? 1)));
// The practice picks of one game this run: its candidates ({ id, ev, edge }: edge the corrected chance less the
// book's no-vig, before the vig) that don't clear the vig but have an edge, best first, as many as the game's quota
// leaves after what it has played already (placed: its bets standing) and this run's that clear the vig. Their ids
export function practiceTop(cands, quota, placed = 0) {
  const need = Math.max(0, quota - placed - cands.filter((c) => c.ev > 0).length);
  return new Set(
    cands
      .filter((c) => !(c.ev > 0) && c.edge > 0)
      .sort((a, b) => b.edge - a.edge)
      .slice(0, need)
      .map((c) => c.id),
  );
}
// (the practice line: the practice picks' record at their stakes; none while the split's off)
export const practiceRecord = (bets) => (PRACTICE_SPLIT ? record(bets, { practice: true }) : null);
// (a stake by the trust it has earned: the Kelly stake's units over the minimum kept in proportion to the trust, whole
// at the desk's full trust (0.5, BUCKET_START.high) or more, by half units: the trust sizes, never decides)
export function trustedUnits(units, trust) {
  const k = Math.min(1, Math.max(0, (Number.isFinite(trust) ? trust : 0.5) / 0.5));
  return Math.max(0.5, Math.round((0.5 + (units - 0.5) * k) * 2) / 2);
}

// The tracked rows' own record (TRACK: not bet), at a unit each as if they had been: what they'd have made,
// apart from the record (state.json's tracked; the Algorithm tab's Tracked panel)
export const trackedRecord = (bets) => record(bets.filter(isTracked).map((b) => learnView({ ...b, trackUnits: 1 })));

// The game lines gated by CLV (round D, 2026-10-17, the owner's #5), made a practice stake the same day (the owner:
// "why would it stop betting? it should reset everything on an algorithm change, and it needs practice and data;
// it's play money; don't chase a perfect record via confidence, improve the choices"): while a sport's closing-line
// value over its last LINE_GATE_N graded line bets is negative, its spreads, moneylines and totals are still bet by
// their normal rules (an edge still needed), each at the minimum (PRACTICE_UNITS, a LIKE at most: picks.mjs
// levelOf), never turned off; positive again, full stakes per the trust. The CLV read is each bet's prob (clv.mjs
// clvOf, round F 2026-10-18: its own price against the close's no-vig chance at its line, the vig out of both; it
// read ev, the return at the close, which is about minus the vig on any fairly priced row, so a market at the close
// read as losing: NHL lines -0.0347 on prob near 0), averaged over the rows of the current definition (clv.v CLV_V)
// with one (a moved line not carried is out, never a zero); the tracked rows count as evidence like the bets. Only the bets placed since the epoch count (MODEL_EPOCH,
// leagues.mjs): an algorithm change resets the gate. Props never gated here (propGate). Fewer than LINE_GATE_MIN
// graded with a close since the epoch: too few to judge, full stakes. { on, practice, n, ev, prob, beat, min,
// window, epoch, why }: on is full stakes, practice its opposite; state.json's lineGate, the Algorithm tab's
// Tracked panel
export const LINE_GATE_N = 200;
export const LINE_GATE_MIN = 40;
// (the beat-the-close bar, DECISIONS.md D60 (Gemini's guard, 2026-10-20): a market earns more than the practice stake
// only while its bets beat the fair close at least this often (with a CLV of 0 or more), from LINE_GATE_MIN graded
// with a close; under it the stake shrinks to PRACTICE_UNITS, never off (D1))
export const BEAT_BAR = 0.525;
const beatOk = (beat) => beat == null || beat >= BEAT_BAR;
const beatWord = (beat) => (beat == null ? '' : `, beat the close ${Math.round(beat * 1000) / 10}%`);
export const PRACTICE_UNITS = 0.5;
// (a bet placed since the epoch; epoch null: every bet)
const sinceEpoch = (epoch) => (epoch == null ? () => true : (b) => Date.parse(b.placedAt ?? b.start ?? '') >= Date.parse(epoch));
const signed = (ev) => `${ev >= 0 ? '+' : ''}${ev}`;
// (a row whose CLV the gates read: of the current definition, with a price to compare)
const clvIn = (b) => b.clv?.v === CLV_V && Number.isFinite(b.clv?.prob);
// (the share that beat the close of those that didn't tie it)
const beatOf = (list) => {
  const d = list.filter((b) => b.clv.beat === true || b.clv.beat === false);
  return d.length ? round(d.filter((b) => b.clv.beat).length / d.length, 4) : null;
};
// The props gated by CLV, by stat (round E, 2026-10-17, the brief's #7: the line gate's twin): a stat's props (its
// propType, e.g. recYds) bet at the practice stake (PRACTICE_UNITS, by their normal rules, an edge still needed)
// while the closing-line value of its last LINE_GATE_N graded prop bets with a close since the epoch is negative;
// positive, or under LINE_GATE_MIN since the epoch, full stakes. { [stat]: { on, practice, n, ev, beat, why } } for
// the stats with any graded prop since the epoch; a stat not in it isn't gated. state.json's propGate, the
// Algorithm tab's Tracked panel
export function propGate(bets, sport, epoch = MODEL_EPOCH) {
  const out = {};
  const graded = (bets ?? []).filter((b) => b.sport === sport && b.market === 'prop' && !b.void && !inPractice(b) && ['won', 'lost', 'push'].includes(b.status) && clvIn(b) && b.propType).filter(sinceEpoch(epoch));
  const by = new Map();
  for (const b of graded) by.set(b.propType, [...(by.get(b.propType) ?? []), b]);
  for (const [stat, list] of by) {
    const last = list.sort((a, b) => Date.parse(a.gradedAt ?? a.start ?? 0) - Date.parse(b.gradedAt ?? b.start ?? 0)).slice(-LINE_GATE_N);
    const n = last.length;
    const ev = round(last.reduce((t, b) => t + (b.clv.ev ?? 0), 0) / n, 4);
    const prob = round(last.reduce((t, b) => t + b.clv.prob, 0) / n, 4);
    const beat = beatOf(last);
    const on = n < LINE_GATE_MIN || (prob >= 0 && beatOk(beat));
    out[stat] = { on, practice: !on, n, prob, ev, beat, bar: BEAT_BAR, min: LINE_GATE_MIN, window: LINE_GATE_N, epoch, why: on ? (n < LINE_GATE_MIN ? `${n} graded ${stat} props with a close since the epoch: under ${LINE_GATE_MIN}, full stakes` : `CLV ${signed(prob)}${beatWord(beat)} over the last ${n} graded ${stat} props: full stakes`) : prob < 0 ? `practice stake: CLV ${prob} over ${n}` : `practice stake: beat the close ${Math.round(beat * 1000) / 10}% over ${n}, under ${BEAT_BAR * 100}%` };
  }
  return out;
}
export function lineGate(bets, sport, epoch = MODEL_EPOCH) {
  const graded = (bets ?? []).filter((b) => b.sport === sport && b.market !== 'prop' && !b.void && !inPractice(b) && ['won', 'lost', 'push'].includes(b.status) && clvIn(b)).filter(sinceEpoch(epoch));
  const last = graded.sort((a, b) => Date.parse(a.gradedAt ?? a.start ?? 0) - Date.parse(b.gradedAt ?? b.start ?? 0)).slice(-LINE_GATE_N);
  const n = last.length;
  const mean = (k) => (n ? round(last.reduce((t, b) => t + (b.clv[k] ?? 0), 0) / n, 4) : null);
  const ev = mean('ev');
  const prob = mean('prob');
  const beat = n ? beatOf(last) : null;
  const on = n < LINE_GATE_MIN || (prob >= 0 && beatOk(beat));
  return { on, practice: !on, n, ev, prob, beat, bar: BEAT_BAR, min: LINE_GATE_MIN, window: LINE_GATE_N, epoch, why: on ? (n < LINE_GATE_MIN ? `${n} graded line bets with a close since the epoch: under ${LINE_GATE_MIN}, full stakes` : `CLV ${signed(prob)}${beatWord(beat)} over the last ${n} graded line bets: full stakes`) : prob < 0 ? `practice stake: CLV ${prob} over ${n}` : `practice stake: beat the close ${Math.round(beat * 1000) / 10}% over ${n}, under ${BEAT_BAR * 100}%` };
}

// A new row's placement under a CLV gate (lineGate's, or a stat's propGate): the gate passing (or none), placement's;
// failing, the same rule (an edge still bet, none tracked) at PRACTICE_UNITS, the bet marked practice (the gate's why:
// a LIKE at most, picks.mjs levelOf). Never a tracked row for the gate's sake
export function gatedPlacement(edge, units, gate) {
  if (!gate || gate.on) return placement(edge, units);
  const placed = placement(edge, PRACTICE_UNITS);
  return placed.intent === 'edge' ? { ...placed, practice: gate.why } : placed;
}

// A research gate (research.mjs researchGateOf's { bet, adjusted }) as a practice cap, never an off switch: a kind
// whose record would turn it off stays on, its stake held to PRACTICE_UNITS (the research bets' own cap already,
// RESEARCH_UNITS: run.mjs researchTag), the why saying so. The bets it reads: the caller's, since the epoch
export const practiceGates = (gates) =>
  Object.fromEntries(Object.entries(gates ?? {}).map(([k, g]) => [k, g.on ? { ...g, practice: false } : { ...g, on: true, practice: true, why: `practice stake (${PRACTICE_UNITS}u at most): ${String(g.why).replace(/: off, the research a label only for them$/, '')}` }]));

// ---- The game lines' history bar (DECISIONS.md D51, 2026-10-19) ----
//
// The priced history's verdict on the Bot's line "edges": a positive-edge game-line pick, graded flat at its own
// price, loses in every sport and market at the close (NFL −11.6% on 874, NHL −6.3% on 1,904, MLB −4.0% on 1,525,
// NBA −0.1% on 949), and no minimum edge (in points or Kelly) nor any side makes a market net positive walk-forward
// beyond noise. Most of the "edge" is no lean of the Bot's at all: at a trust of 0 the trusted chance is the fair
// chance, Pinnacle's no-vig where it posts the line (oddsapi.mjs linesFromEvent), so the row's return at
// DraftKings' price is the two books' disagreement, a dog's most of all (the proportional de-vig's shade: NFL ML
// dogs −19.5% on 321). So a line's real stake has to be earned by its segment: its market and the side class the
// Book's own chance puts it in (segmentOf: the favored side (over .5) or the dog, the over or the under). A segment
// whose flat record (the history's closes as the shipped version prices them, recency-weighted by season, written by
// gate.mjs --record to apps/<sport>/src/StaticData/model/line-bar.json; pooled with the live line bets placed since
// the epoch, whole, the practice ones among them: they are what can earn a segment its stake back) is net positive
// past BAR_Z standard errors over BAR_MIN picks' worth bets at full stakes; any other segment, and one with no
// history, bets by its normal rules at the practice stake (PRACTICE_UNITS, a LIKE at most: gatedPlacement), never
// turned off (D1): an edge is still needed, the pick is still placed, graded, on the Book and in the Practice
// line (D3). Free to rise: a season of live bets weighs as much as the history. The desk reads the file and never
// writes it
export const BAR_Z = 1;
export const BAR_MIN = 40;
// (the props' stat bar (DECISIONS.md D64): D51's bar on the props by stat and side, in the replay and the live desk; PROP_BAR=0 off)
export const PROP_BAR = process.env.PROP_BAR !== '0';
export const SIDE_CLASSES = ['fav', 'dog', 'over', 'under'];
// (the timing classes: a line bet placed EARLY_HOURS or more before its start is an early one, nearer a late one.
// The priced history's clean opens (DraftKings' first price, 8 to 14 hours out in the NBA, NHL and MLB, days out in
// the NFL) are early, its closes (inside 3 hours) late; the live desk bets inside its 26-hour window, so a line
// bet at the window's open is early and one at the last chance late. The two are segments of their own: the
// history's opens beat its closes in every sport, the two books' disagreement most of all, so neither timing's
// record decides the other's stake)
export const EARLY_HOURS = 6;
export const TIMINGS = ['early', 'late'];
export const timingOf = (hours) => (Number.isFinite(hours) && hours >= EARLY_HOURS ? 'early' : 'late');
// (a pick's segment: "<market>:<class>:<timing>", the class by the pick's own side's fair chance, a total's by its
// side; the timing by the hours before the start it was placed at (timingOf; none, late))
export const segmentOf = (market, side, fair, hours) => `${market}:${market === 'total' ? (side === 'under' ? 'under' : 'over') : Number.isFinite(fair) && fair < 0.5 ? 'dog' : 'fav'}:${timingOf(hours)}`;
// (the minimum edges a key is judged at: its picks at a return of each or more; the smallest at which they are net
// positive beyond noise is the key's minimum edge, below it a pick is the practice stake)
export const EDGE_GRID = [0, 0.01, 0.02, 0.03, 0.05];
// (a pick's flat-unit profit at its price by its result)
export const flatProfit = (odds, status) => (status === 'won' ? decimal(Number.isFinite(odds) && odds ? odds : -110) - 1 : status === 'lost' ? -1 : 0);
// (the sufficient statistics of a set of flat picks { profit, w }: the picks' worth, the weighted sum and sum of
// squares of their profit; two sets add)
export function barStats(picks) {
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  for (const p of picks ?? []) {
    const w = Number.isFinite(p.w) ? p.w : 1;
    if (!(w > 0) || !Number.isFinite(p.profit)) continue;
    n += w;
    sum += w * p.profit;
    sum2 += w * p.profit * p.profit;
  }
  return { n: round(n, 3), sum: round(sum, 4), sum2: round(sum2, 4) };
}
export const addStats = (a, b) => ({ n: (a?.n ?? 0) + (b?.n ?? 0), sum: (a?.sum ?? 0) + (b?.sum ?? 0), sum2: (a?.sum2 ?? 0) + (b?.sum2 ?? 0) });
// (a key's statistics by minimum edge: the picks { profit, w, ev } whole (an edge of 0), and edges: the ones at a
// return of each EDGE_GRID step or more; two add step by step)
export function edgeStats(picks) {
  const list = picks ?? [];
  const edges = {};
  for (const t of EDGE_GRID.slice(1)) edges[t] = barStats(list.filter((p) => !Number.isFinite(p.ev) || p.ev >= t));
  return { ...barStats(list), edges };
}
export function addEdgeStats(a, b) {
  const edges = {};
  for (const t of EDGE_GRID.slice(1)) edges[t] = addStats(a?.edges?.[t], b?.edges?.[t]);
  return { ...addStats(a, b), edges };
}
// (a segment's verdict from its stats: on at full stakes where its mean profit a pick is over z standard errors
// above 0 with min picks' worth; else the practice stake. { on, n, mean, se, why })
export function barOf(stats, { min = BAR_MIN, z = BAR_Z } = {}) {
  const n = stats?.n ?? 0;
  const pctOf = (v) => `${v >= 0 ? '+' : ''}${round(v * 100, 1)}%`;
  if (!(n >= min)) return { on: false, n: round(n, 1), mean: null, se: null, why: `${round(n, 1)} picks' worth of history and live bets: under ${min}, the practice stake till the segment earns it` };
  const mean = stats.sum / n;
  const se = Math.sqrt(Math.max(0, stats.sum2 / n - mean * mean) / n);
  const on = mean - z * se > 0;
  return { on, n: round(n, 1), mean: round(mean, 4), se: round(se, 4), why: on ? `net ${pctOf(mean)} a pick over ${round(n, 1)} picks' worth, past ${z} SE (${pctOf(se)}): full stakes` : `practice stake: net ${pctOf(mean)} a pick over ${round(n, 1)} picks' worth, not past ${z} SE (${pctOf(se)})` };
}
// (a key's verdict with its minimum edge: the smallest EDGE_GRID step whose picks at that return or more are on
// (barOf); none, the whole set's verdict, off. { on, minEdge, n, mean, se, why })
export function keyVerdict(stats, opts) {
  for (const t of EDGE_GRID) {
    const st = t === 0 ? stats : stats?.edges?.[t];
    if (!st) continue;
    const v = barOf(st, opts);
    if (v.on) return { ...v, minEdge: t, why: t > 0 ? `${v.why} at a return of ${round(t * 100, 1)}% or more` : v.why };
  }
  return { ...barOf(stats, opts), on: false, minEdge: null };
}
// The named reasons a line may be bet on (the lines round's winners table, DECISIONS.md D51: the pre-game facts the
// sides that beat the close shared in most seasons, past the false-discovery guard): each is a key of the bar of its
// own, "reason:<key>:<market>", its flat record on the history's picks that carry it pooled with the live bets that
// did; a pick carrying a reason whose record is on bets at full stakes whatever its segment's. Soft: a reason is only
// a key the record judges, never a weight on the chance; one whose record isn't net positive beyond noise does
// nothing. From the schedule alone (scheduleRest), so a coming game has it as a final did
//   restedVsB2b  the other side played yesterday and this one didn't (the NHL: the side against a back-to-back beat
//                the close by about 4 points, 7 of 7 seasons; every such moneyline +4.1% flat at the close, +6.1%
//                at the open)
//   rest2        two or more days more rest than the other side (the NBA: spreads +5.2% at the close, 5 of 6
//                seasons; the NHL's spreads +7.6% at the open)
export const LINE_REASONS = {
  nhl: [
    { key: 'restedVsB2b', markets: ['ml', 'spread'], label: 'rested against a back-to-back', test: (me, op) => op.b2b && !me.b2b },
    { key: 'rest2', markets: ['spread'], label: 'two or more days more rest', test: (me, op) => me.rest - op.rest >= 2 },
  ],
  nba: [{ key: 'rest2', markets: ['ml', 'spread'], label: 'two or more days more rest', test: (me, op) => me.rest - op.rest >= 2 }],
  nfl: [],
  mlb: [],
};
export const REST_CAP = 4;
// (each game's rest by side from the schedule: { rest: [home, away] days since each side's last game by the US
// Eastern calendar, REST_CAP at most (a first game the cap), b2b: [home, away] a game the day before }, by game id)
export function scheduleRest(games) {
  const sorted = [...(games ?? [])].filter((g) => g?.date && g.home != null && g.away != null).sort((a, b) => a.date.localeCompare(b.date));
  const last = new Map();
  const out = new Map();
  const days = (a, b) => Math.round((Date.parse(`${etDay(Date.parse(b))}T12:00:00Z`) - Date.parse(`${etDay(Date.parse(a))}T12:00:00Z`)) / 864e5);
  for (const g of sorted) {
    const side = (tm) => {
      const prev = last.get(String(tm));
      const rest = prev ? Math.min(REST_CAP, Math.max(0, days(prev, g.date))) : REST_CAP;
      return { rest, b2b: !!prev && rest === 1 };
    };
    const h = side(g.home);
    const a = side(g.away);
    out.set(String(g.id), { rest: [h.rest, a.rest], b2b: [h.b2b, a.b2b] });
    last.set(String(g.home), g.date);
    last.set(String(g.away), g.date);
  }
  return out;
}
// The schedule's travel beside its rest (DECISIONS.md D62, the stacked fatigue reason): each game's miles since its
// last game, time zones moved east and meters climbed (context.mjs featurize's info, [home, away]), on the entry
// scheduleRest made for it (trav). feats: the context's Map of game id to its features; none, the entries as they are
export function withTravel(sched, feats) {
  if (!sched || !feats?.size) return sched;
  for (const [id, f] of feats) {
    const s = sched.get(String(id));
    const i = f?.info;
    if (!s || !i) continue;
    s.trav = { miles: i.miles ?? null, tz: i.schedule?.tzMove ?? null, climb: i.schedule?.climb ?? null };
  }
  return sched;
}
// (the named reasons a pick carries: its sport's LINE_REASONS whose test the pick's side meets, as bar keys; side
// 'home' or 'away'; sched a game's scheduleRest entry, or its context's info ({ rest, b2b } [home, away]))
export function reasonsOf(sport, market, side, sched) {
  if (!sched || !Array.isArray(sched.rest) || (side !== 'home' && side !== 'away')) return [];
  const i = side === 'home' ? 0 : 1;
  const me = { rest: sched.rest[i], b2b: !!sched.b2b?.[i] };
  const op = { rest: sched.rest[1 - i], b2b: !!sched.b2b?.[1 - i] };
  if (!Number.isFinite(me.rest) || !Number.isFinite(op.rest)) return [];
  return (LINE_REASONS[sport] ?? []).filter((x) => x.markets.includes(market) && x.test(me, op)).map((x) => `reason:${x.key}:${market}`);
}
export const reasonLabel = (sport, key) => (LINE_REASONS[sport] ?? []).find((x) => key.startsWith(`reason:${x.key}:`))?.label ?? key;
// (a live line bet's hours before its start at placement)
const hoursOf = (b) => (Number.isFinite(Date.parse(b.start)) && Number.isFinite(Date.parse(b.placedAt)) ? (Date.parse(b.start) - Date.parse(b.placedAt)) / 36e5 : null);
// The bar this run: the file's keys (prior: line-bar.json's { segments: { <key>: stats by edge } }: the segments and
// the named reasons) pooled with the sport's live line bets placed since the epoch (graded, not void, never a
// tracked row; practice bets included, each at its flat result, by its own segment (its timing from its placement)
// and the reasons it carried (b.reasons)). { <key>: { on, practice, minEdge, n, mean, se, why, prior, live } }
export function lineBar(prior, bets, sport, epoch = MODEL_EPOCH) {
  const live = (bets ?? []).filter((b) => b.sport === sport && MARKETS.includes(b.market) && !b.void && !isTracked(b) && ['won', 'lost', 'push'].includes(b.status) && Number.isFinite(b.fair) && Number.isFinite(b.odds)).filter(sinceEpoch(epoch));
  const keysOf = (b) => [segmentOf(b.market, b.side, b.fair, hoursOf(b)), ...(Array.isArray(b.reasons) ? b.reasons : [])];
  const keys = new Set([...Object.keys(prior?.segments ?? {}), ...live.flatMap(keysOf)]);
  const out = {};
  for (const k of keys) {
    const l = edgeStats(live.filter((b) => keysOf(b).includes(k)).map((b) => ({ profit: flatProfit(b.odds, b.status), w: 1, ev: b.ev })));
    const p = prior?.segments?.[k] ?? { n: 0, sum: 0, sum2: 0 };
    const v = keyVerdict(addEdgeStats(p, l));
    out[k] = { ...v, practice: !v.on, prior: { n: round(p.n ?? 0, 1), mean: p.n ? round(p.sum / p.n, 4) : null }, live: { n: round(l.n, 1), mean: l.n ? round(l.sum / l.n, 4) : null }, z: BAR_Z, min: BAR_MIN, epoch };
  }
  return out;
}
// (a pick's gate from the bar: its segment's (by its market, side class and timing) at the segment's minimum edge;
// else a named reason it carries whose record is on at its edge; else the practice stake, said so. at: { hours
// before the start, ev the pick's return, reasons its keys (reasonsOf) })
export function barGate(bar, market, side, fair, { hours = null, ev = null, reasons = [], aside = null } = {}) {
  const segment = segmentOf(market, side, fair, hours);
  // (the bar standing aside in a sport whose full stakes out-earned it on the history (the file's applies false,
  // D51's barPlace): every line at its own stake, said so)
  if (aside) return { on: true, segment, reasons, aside: true, why: aside };
  const g = bar?.[segment];
  const clears = (v) => v?.on && (!Number.isFinite(ev) || ev >= (v.minEdge ?? 0));
  if (clears(g)) return { ...g, segment, reasons };
  for (const k of reasons ?? []) if (clears(bar?.[k])) return { ...bar[k], segment, reason: k, reasons, why: `${k}: ${bar[k].why}` };
  const below = g?.on && Number.isFinite(ev) && ev < g.minEdge;
  const why = !g ? `${segment}: no history priced yet, the practice stake till it earns it` : below ? `${segment}: a return of ${round(ev * 100, 1)}%, under the segment's minimum edge of ${round(g.minEdge * 100, 1)}%: the practice stake` : `${segment}: ${g.why}`;
  return { ...(g ?? { n: 0 }), on: false, practice: true, segment, reasons, why };
}
// (two gates on one row (the sport's CLV gate and the pick's segment's): both on, the first; either failing, the
// practice stake with each failing one's reason)
export function bothGates(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.on && b.on) return a;
  return { on: false, practice: true, why: [a.on ? null : a.why, b.on ? null : b.why].filter(Boolean).join('; ') };
}
// The bar walk-forward (the replayed record, replay-record.mjs, D47 and D51): picks { t, season, keys, ev, profit }
// (the history's line picks at the close and the clean opens, flat; keys their segment and named reasons);
// at(t, keys, ev) is whether any of the keys is on at that return, judged on the picks of the months before t's
// month alone, recency-weighted by season from that month's, so a replayed line bet is staked as the live desk
// would have staked it with the history to that day. No month priced yet: the practice stake
export function walkBar(picks) {
  const monthOf = (t) => new Date(t).toISOString().slice(0, 7);
  const byMonth = new Map();
  for (const p of picks ?? []) {
    const keys = p?.keys ?? (p?.segment ? [p.segment] : []);
    if (!Number.isFinite(p?.t) || !Number.isFinite(p.profit) || !keys.length) continue;
    (byMonth.get(monthOf(p.t)) ?? byMonth.set(monthOf(p.t), []).get(monthOf(p.t))).push({ ...p, keys });
  }
  const months = [...byMonth.keys()].sort();
  const verdicts = new Map();
  const prior = new Map();
  for (const m of months) {
    const season = byMonth.get(m).find((p) => Number.isFinite(p.season))?.season;
    const v = new Map();
    for (const [k, list] of prior) v.set(k, keyVerdict(edgeStats(list.map((p) => ({ profit: p.profit, ev: p.ev, w: Number.isFinite(season) && Number.isFinite(p.season) ? 0.5 ** Math.max(0, season - p.season) : 1 })))));
    verdicts.set(m, v);
    for (const p of byMonth.get(m)) for (const k of p.keys) (prior.get(k) ?? prior.set(k, []).get(k)).push(p);
  }
  return (t, keys, ev = null) => {
    const m = monthOf(t);
    let use = null;
    for (const k of months) {
      if (k > m) break;
      use = k;
    }
    if (use === null) return false;
    const list = typeof keys === 'string' ? [keys] : (keys ?? []);
    return list.some((k) => {
      const v = verdicts.get(use).get(k);
      return !!v?.on && (!Number.isFinite(ev) || ev >= v.minEdge);
    });
  };
}
// The sport's bar file as the live desk reads it: apps/<sport>/src/StaticData/model/line-bar.json, written by
// gate.mjs --record (the shipped version's picks on the priced history's closes); null with none or one it can't
// read (every segment at the practice stake then, till the live bets earn it)
// (the bar's own place from the file: null where it stakes the lines; else why it stands aside)
export function barAside(file) {
  if (!file || file.applies !== false) return null;
  const p = file.place ?? {};
  return `the history bar stands aside: the lines at full stakes earned ${p.fullUnits ?? '-'}u on the history against ${p.barUnits ?? '-'}u as the bar staked them`;
}
// ---- The props' stat bar (DECISIONS.md D64, 2026-10-20) ----
// D51's bar on the props: a prop pick's real stake is earned by its key, "prop:<stat>:<over|under>", on the priced
// history's prop picks (every positive-edge close, flat, recency-weighted by season: gate.mjs propBarOf, written by
// --record to prop-bar.json) pooled with the sport's live prop bets since the epoch, at the key's minimum edge; else
// the practice stake (never off, D1). Its own place by season as the lines' (replay-record.mjs barPlace on the props):
// a file with applies false stands aside. On in the sports the gate shipped it for (PROP_BAR_SPORTS: the replay's
// verdict by sport, as anchor.mjs anchorOn)
export const PROP_BAR_SPORTS = ['nba', 'nfl'];
export const propBarOn = (sport) => PROP_BAR && PROP_BAR_SPORTS.includes(sport);
export const propKey = (stat, side) => `prop:${stat}:${side}`;
export function propBar(prior, bets, sport, epoch = MODEL_EPOCH) {
  const live = (bets ?? []).filter((b) => b.sport === sport && b.market === 'prop' && !b.void && !isTracked(b) && ['won', 'lost', 'push'].includes(b.status) && Number.isFinite(b.odds) && (!epoch || Date.parse(b.placedAt ?? b.start) >= Date.parse(epoch)));
  const keyOf = (b) => propKey(b.propType ?? b.stat, b.side);
  const keys = new Set([...Object.keys(prior?.segments ?? {}), ...live.map(keyOf)]);
  const out = {};
  for (const k of keys) {
    const l = edgeStats(live.filter((b) => keyOf(b) === k).map((b) => ({ profit: flatProfit(b.odds, b.status), w: 1, ev: b.ev })));
    const p = prior?.segments?.[k] ?? { n: 0, sum: 0, sum2: 0 };
    const v = keyVerdict(addEdgeStats(p, l));
    out[k] = { ...v, practice: !v.on, prior: { n: round(p.n ?? 0, 1), mean: p.n ? round(p.sum / p.n, 4) : null }, live: { n: round(l.n, 1), mean: l.n ? round(l.sum / l.n, 4) : null }, z: BAR_Z, min: BAR_MIN, epoch };
  }
  return out;
}
// (a prop pick's gate from the bar: null where the bar isn't on in the sport or stands aside)
export function propBarGate(bar, file, sport, stat, side, ev = null) {
  if (!propBarOn(sport) || !file || file.applies === false) return null;
  const k = propKey(stat, side);
  const g = bar?.[k];
  if (g?.on && (!Number.isFinite(ev) || ev >= (g.minEdge ?? 0))) return { ...g, key: k };
  const why = !g ? `${k}: no history priced yet, the practice stake till it earns it` : g.on ? `${k}: a return of ${round(ev * 100, 1)}%, under the stat's minimum edge of ${round(g.minEdge * 100, 1)}%` : `${k}: ${g.why ?? 'not net positive beyond noise on the record'}`;
  return { ...(g ?? { n: 0 }), on: false, practice: true, key: k, why };
}
export function readPropBar(root, sport) {
  const file = path.join(root, 'apps', sport, 'src/StaticData/model/prop-bar.json');
  try {
    if (!existsSync(file)) return null;
    const bar = JSON.parse(readFileSync(file, 'utf8'));
    return bar && bar.segments && typeof bar.segments === 'object' ? bar : null;
  } catch {
    return null;
  }
}
export function readLineBar(root, sport) {
  const file = path.join(root, 'apps', sport, 'src/StaticData/model/line-bar.json');
  try {
    if (!existsSync(file)) return null;
    const bar = JSON.parse(readFileSync(file, 'utf8'));
    return bar && bar.segments && typeof bar.segments === 'object' ? bar : null;
  } catch {
    return null;
  }
}
