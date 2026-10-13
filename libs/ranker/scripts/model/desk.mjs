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
// the least edge up to 3 (stakeFor); a game's edge props sized jointly with its other props by their correlation
// in a game, fit on the graded props and kept on its replay (fitSameGame, sizeJointly, sameGameOf: only ever
// cut); a game's whole stake, every market and prop, at most leagues.mjs GAME_CAP, the edge bets filled first
// (capGame); the spread and the moneyline never on the same side of a game (oneSide).
// Only an edge is bet (2026-10-13, the owner's: every bet the bot places is a LIKE or better, picks.mjs BANDS): a
// market with no edge, or one a guard cut (the old action bet, 0.5u for the data), is tracked, not bet (intent
// 'track', TRACK: units 0, never staked; what it would have staked kept, trackUnits). A tracked row is graded,
// closed and post-mortemed like a bet and is evidence for everything that learns (the trust fit, the CLV, the
// self-check, the same-game fit: learnView reads it as the action bet it once was), but never in the record, the
// bankroll, the caps, the same-game exposure or the picks (record, capGame, makeRoom, sizeJointly; picks.mjs).

import { round } from './ratings.mjs';
import { cond, mlModel, spreadChances, totalChances } from './margins.mjs';

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
export function stakeFor(ev, evScale, odds = -110) {
  const d = decimal(Number.isFinite(odds) && odds ? odds : -110);
  const e = Math.max(0, ev);
  const frac = Math.min(e / (d - 1), ((e / d) * (1 + REF)) / REF);
  const raw = 0.5 + (frac / (evScale / REF)) * 2.5;
  return Math.min(3, Math.max(0.5, Math.round(raw * 2) / 2));
}

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
// trust is fit on the pricing the desk bets with
export const chanceAt = (market, fair, model, trust) => fair + trust * leanOf(model - fair, GAP[market]);

// (a bet the live desk would never place for its model's distance from the book: gapGuard)
export const pastGap = (market, model, fair) => !!GAP[market] && Math.abs(model - fair) > GAP[market];

// Why a market isn't bet for its model's distance from the book (skip; kind 'gap': the bettor keeps it as a
// CHECK, checks.mjs), or null
export function gapGuard(market, model, fair) {
  const limit = GAP[market];
  if (!limit || !Number.isFinite(model) || !Number.isFinite(fair) || Math.abs(model - fair) <= limit) return null;
  return { skip: true, kind: 'gap', why: `the model's ${Math.round(model * 100)}% against the book's ${Math.round(fair * 100)}%: too far from the market to trust` };
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
    const c = totalChances(exp.total, total.line, params.sigmaT);
    both('total', { side: 'over', line: total.line, odds: total.over, model: cond(c), push: c.push }, { side: 'under', line: total.line, odds: total.under, model: 1 - cond(c), push: c.push }, fairOf('total', total.over, total.under));
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

// The bet a market gets: the side with the better expected return at the desk's trust in the model (every
// market gets one; the lean tapered by leanOf: chanceAt), staked by its Kelly fraction; the other side's, scored
// the same, beside it (other: oneSide). A moneyline the spread didn't anchor leans nothing: the book's chance
export function choose(market, trust, evScale) {
  const scored = market.sides.map((s) => {
    const p = s.anchored === false ? s.fair : chanceAt(market.market, s.fair, s.model, trust);
    // (a push gives the stake back: only the rest of the chance is won or lost)
    const ev = (1 - (s.push ?? 0)) * (p * decimal(s.odds) - 1);
    return { ...s, p, ev, units: stakeFor(ev, evScale, s.odds) };
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
// little, overs with overs and unders with unders, an over against an under the other way. One correlation, rho,
// between any two of a game's props' results, signed by their sides (rho·s_i·s_j, s +1 an over, -1 an under):
// fit on the sport's graded props (fitSameGame), and a game's edge props sized jointly with it (sizeJointly), so
// a game's props leaning one way stake like fewer, bigger bets on it, and the ones a hedge balances stake as
// they were. Stakes only: never a bet added or dropped, never a stake raised.
//   minGames  games with two or more graded props before rho is read at all (0 till then: the stakes as before)
//   shrink    games: the read pulled toward 0 by shrink / (games + shrink), so a few games' luck stakes nothing
//   max       the most rho may be
export const SAME_GAME = { minGames: 10, shrink: 30, max: 0.25 };
const sideSign = (b) => (b.side === 'over' ? 1 : b.side === 'under' ? -1 : 0);

// rho from the graded props (won or lost; a push or a void isn't a result): each one's standardized miss,
// (won − p) / sqrt(p(1 − p)), less the sport's mean miss (a model that ran low on every prop isn't a correlation
// within games), and every pair in a game: the product of their misses times their signs, averaged over all the
// pairs (a game with more props, more pairs: the games sizing changes most). raw, that average; se, its
// jackknife by game; rho, raw past 0 shrunk and held to max, 0 under minGames. Measured 2026-10-13 on the
// ledgers (prop pairs, the misses centered): NHL same side +0.044 (se 0.024, 5984 pairs in 27 games), opposite
// sides −0.027 (0.018, 5731), the same team or not alike (same side +0.042 and +0.045); NFL same side +0.004,
// opposite −0.084 (14 games, se 0.07); MLB 4 games. The game markets with the props: NHL +0.003 (2124 pairs),
// left out. A tracked row (TRACK) is a result like a bet's: read (its stake never is)
export function fitSameGame(list) {
  const graded = list.filter((b) => b.market === 'prop' && !b.void && (b.status === 'won' || b.status === 'lost') && b.p > 0 && b.p < 1 && sideSign(b));
  const none = { rho: 0, raw: null, se: null, games: 0, pairs: 0, fitted: false };
  if (!graded.length) return none;
  const zOf = (b) => ((b.status === 'won') - b.p) / Math.sqrt(b.p * (1 - b.p));
  const mean = graded.reduce((t, b) => t + zOf(b), 0) / graded.length;
  const byGame = new Map();
  for (const b of graded) byGame.set(b.event, [...(byGame.get(b.event) ?? []), b]);
  const sums = [];
  for (const bets of byGame.values()) {
    if (bets.length < 2) continue;
    const z = bets.map((b) => (zOf(b) - mean) * sideSign(b));
    let s = 0;
    for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) s += z[i] * z[j];
    sums.push([s, (z.length * (z.length - 1)) / 2]);
  }
  const S = sums.reduce((t, x) => t + x[0], 0);
  const N = sums.reduce((t, x) => t + x[1], 0);
  const games = sums.length;
  if (!N) return none;
  const raw = S / N;
  // (the jackknife by game: each game left out in turn)
  const jk = sums.length > 1 ? sums.map(([s, n]) => (S - s) / (N - n)) : [];
  const jm = jk.reduce((t, x) => t + x, 0) / Math.max(1, jk.length);
  const se = jk.length > 1 ? Math.sqrt(((jk.length - 1) / jk.length) * jk.reduce((t, x) => t + (x - jm) ** 2, 0)) : null;
  const fitted = games >= SAME_GAME.minGames;
  const rho = fitted ? Math.min(SAME_GAME.max, (Math.max(0, raw) * games) / (games + SAME_GAME.shrink)) : 0;
  return { rho: round(rho, 4), raw: round(raw, 4), se: se === null ? null : round(se, 4), games, pairs: N, fitted };
}

// A game's new bets sized jointly at rho (fitSameGame): its edge props (more than the 0.5 minimum) are the
// stakes that move; every other prop on the game, this run's action ones and the ones already open on it
// (fixed: a list of { side, units }), counts as placed. Kelly for bets that correlated (stakes in units as the
// stakes' scale; each bet's spread about alike near even money): the stakes u solving R·u = u0 on the edge
// props' rows, u0 each one's own stake and R the correlations, rho·s_i·s_j off the diagonal. With one rho that
// has a closed form: T, the game's signed units (overs less unders) all told, is ((1 − rho)·T_fixed + Σ s·u0) /
// (1 − rho + m·rho) over the m edge props, and each u = (u0 − rho·s·T) / (1 − rho). A stake that would rise (a
// hedge's) stays its own, one under 0.5 is 0.5, and those fixed, the rest solved again; then by half units. So n
// edge props on one side at a stake each stake 1 / (1 + (n − 1)·rho) of it. The game markets aren't in it (their
// results with the props' measured at about 0). A tracked row (TRACK) stakes nothing: no exposure, never among
// the props it counts. Returns the bets, a resized one with sizedFrom (its own stake)
export function sizeJointly(bets, fixed, rho) {
  if (!(rho > 0)) return bets;
  const moves = (b) => b.market === 'prop' && intentOf(b) === 'edge' && b.units > 0.5 && sideSign(b);
  let free = bets.filter(moves);
  if (!free.length) return bets;
  const held = [...bets.filter((b) => b.market === 'prop' && !moves(b)), ...fixed].filter((b) => sideSign(b) && !isTracked(b));
  const pinned = new Map();
  let u = new Map();
  for (let pass = 0; pass <= bets.length; pass++) {
    const tFixed = held.reduce((t, b) => t + sideSign(b) * b.units, 0) + [...pinned].reduce((t, [b, x]) => t + sideSign(b) * x, 0);
    const m = free.length;
    const T = ((1 - rho) * tFixed + free.reduce((t, b) => t + sideSign(b) * b.units, 0)) / (1 - rho + m * rho);
    u = new Map(free.map((b) => [b, (b.units - rho * sideSign(b) * T) / (1 - rho)]));
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

// The same-game sizing the desk bets with (run.mjs placeBets): rho fit on every graded prop (fitSameGame), and
// kept only where the graded games show it no worse. The replay: each game's graded bets in the order played,
// its props sized jointly (one batch, nothing open before it: the live runs size each run's against the ones
// already open) at the rho fit on the days before its own (no look-ahead), every bet's profit at its stake
// that way; log growth on the bankroll, each game at once, against the stakes as bet. Kept (used: rho) where it
// resized nothing (no evidence either way, and nothing it does) or grew the bankroll no less; else used 0, the
// stakes as before. Read 2026-10-13: NFL rho 0.014 (raw +0.043, se 0.053, 14 games), NHL 0.017 (raw +0.035, se
// 0.018, 27 games), MLB under minGames: no stake resized in the replay. At the NHL's raw rho, unshrunk, 6 edge
// props would have been cut 3u and the bankroll 1.3u worse (they won more than they lost): the shrink stays.
// A tracked row (TRACK, not bet) is evidence for the fit, each day's too (its result, as every fit reads one),
// but stakes nothing in the replay, as it stakes nothing live
export function sameGameOf(list) {
  const fit = fitSameGame(list);
  const done = list.filter((b) => !b.void && (b.status === 'won' || b.status === 'lost' || b.status === 'push') && Number.isFinite(b.profit) && b.units > 0 && !isTracked(b));
  const day = (b) => String(b.start).slice(0, 10);
  const games = new Map();
  for (const b of done) games.set(b.event, [...(games.get(b.event) ?? []), b]);
  const order = [...games.values()].sort((a, b) => Date.parse(a[0].start) - Date.parse(b[0].start));
  const rhoOn = new Map();
  let br = { asBet: BANKROLL, joint: BANKROLL };
  const growth = { asBet: 0, joint: 0 };
  let resized = 0;
  let trimmed = 0;
  for (const g of order) {
    const d = day(g[0]);
    if (!rhoOn.has(d)) rhoOn.set(d, fitSameGame(list.filter((b) => day(b) < d)).rho);
    const sized = sizeJointly(g, [], rhoOn.get(d));
    const p = { asBet: g.reduce((t, b) => t + b.profit, 0), joint: sized.reduce((t, b, i) => t + (g[i].profit * b.units) / g[i].units, 0) };
    for (let i = 0; i < g.length; i++) if (sized[i].units !== g[i].units) (resized++, (trimmed += g[i].units - sized[i].units));
    for (const k of ['asBet', 'joint']) {
      growth[k] += Math.log(Math.max(1e-9, br[k] + p[k]) / br[k]);
      br[k] = br[k] + p[k] > 0 ? br[k] + p[k] : BANKROLL;
    }
  }
  const kept = fit.rho > 0 && (!resized || growth.joint >= growth.asBet - 1e-12);
  return { ...fit, used: kept ? fit.rho : 0, replay: { games: order.length, resized, trimmed: round(trimmed, 1), asBet: round(growth.asBet * 1e3, 3), joint: round(growth.joint * 1e3, 3) } };
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
export function fitTrust(list, start) {
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
  if (all.size < 40) return { trust: start, n: decided.length, clvN: closed.length, eff, fitted: false };
  // (each piece of evidence's weight: its game's share, halved where the bet has the other kind too)
  const wResult = (b) => (b.weight ?? 1) * (b.tw ?? 1) * share(b) * (isClosed.has(b) ? 0.5 : 1);
  const wClose = (b) => (b.tw ?? 1) * share(b) * (isDecided.has(b) ? 0.5 : 1);
  const n = decided.reduce((s, b) => s + wResult(b), 0) + closed.reduce((s, b) => s + wClose(b), 0);
  let best = { trust: start, loss: Infinity };
  for (let t = 0; t <= 1.0001; t += 0.05) {
    let loss = 0;
    // (the chance the desk would bet with at this trust: the lean tapered as choose tapers it, chanceAt)
    const pOf = (b) => Math.min(0.995, Math.max(0.005, chanceAt(b.market, b.fair, b.model, t)));
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

// A record: won, lost, pushed, units staked and won, the return on them (a void bet, no action, isn't in it,
// nor a tracked row: never bet)
export function record(bets) {
  const r = { bets: 0, won: 0, lost: 0, push: 0, staked: 0, profit: 0 };
  for (const b of bets) {
    if (b.status === 'open' || b.void || isTracked(b)) continue;
    r.bets++;
    r[b.status === 'won' ? 'won' : b.status === 'lost' ? 'lost' : 'push']++;
    r.staked += b.units;
    r.profit += b.profit;
  }
  return { ...r, staked: round(r.staked, 2), profit: round(r.profit, 2), roi: r.staked ? round(r.profit / r.staked, 4) : null };
}

// The tracked rows' own record (TRACK: not bet), at a unit each as if they had been: what they'd have made,
// apart from the record (state.json's tracked; the Algorithm tab's Tracked panel)
export const trackedRecord = (bets) => record(bets.filter(isTracked).map((b) => learnView({ ...b, trackUnits: 1 })));
