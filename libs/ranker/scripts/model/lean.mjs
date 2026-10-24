// The against-own-lean guard (DECISIONS.md D82, the owner's 2026-10-22 case: the NHL's Schaefer under 2.5 shots at
// +122, the Bot's own projection over 55%, bet on about a point of price edge alone).
//
//   lean    a prop bet's own chance on its side: the Bot's model chance (the anchored one, anch, the projection's own
//           where there's no anchor, raw) before the trust and the correction price it against the Book. The bet
//           goes against the lean where that chance is under one half by more than d: the projection itself says
//           the other side is more likely, so whatever edge the price shows is the Book's number and the price's
//   d       each month's from LEAN_GRID, picked on the against-lean prop bets settled before the month began, flat:
//           the d whose bets past it lost the most (none lost, or under LEAN_MIN_N bets: null, no guard). D76's
//           walk (best-price.mjs shopT), the grid the depth of the disagreement
//   then    a guarded bet is a LIKE at the practice stake, held there through the tiers as a barred one: a shrink,
//           never off (gates shrink, never stop)
export const LEAN_GRID = [0, 0.02, 0.05, 0.1];
export const LEAN_MIN_N = 30;
const fin = Number.isFinite;

// (a prop row's own over chance: the anchored, else the projection's)
export const ownOver = (x) => (fin(x?.anch) ? x.anch : fin(x?.raw) ? x.raw : null);
// (how far a side's own chance sits under one half: g = own on the side less 0.5; null unknown)
export function leanGap(x, over) {
  const o = ownOver(x);
  return o === null ? null : (over ? o : 1 - o) - 0.5;
}
// (the d for settled against-lean bets { g, flat }: the grid's d whose bets with g < -d lost the most; null none)
export function leanD(list, { grid = LEAN_GRID, minN = LEAN_MIN_N } = {}) {
  const against = list.filter((x) => fin(x.g) && x.g < 0);
  if (against.length < minN) return null;
  let best = null;
  let gain = 0;
  for (const d of grid) {
    let g = 0;
    for (const x of against) if (x.g < -d) g -= x.flat;
    if (g > gain + 1e-9) (best = d), (gain = g);
  }
  return best;
}
const monthStart = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
// The walk: bets { t: settled ms, at: placed ms, g, flat }; { at(placed) -> d or null, final }
export function walkLean(list, opts = {}) {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const memo = new Map();
  const at = (t) => {
    const k = new Date(t).toISOString().slice(0, 7);
    if (!memo.has(k)) {
      const m0 = monthStart(t);
      memo.set(k, leanD(sorted.filter((x) => x.t < m0), opts));
    }
    return memo.get(k);
  };
  return { at, final: leanD(sorted, opts) };
}
// (the sports it's on: where the walk's guarded bets lost (D82); REPLAY_LEAN overrides it in the replay)
export const LEAN_SPORTS = new Set(['nfl']);
export const leanOn = (sport) => LEAN_SPORTS.has(sport);
// (the live side's verdict for a prop pick: own, the Bot's own chance on its side (the anchored model chance before
// the trust: the ledger's modelRaw, else model), and the month's d (the replayed record's flags.leanGuard.next))
export function leanGuardOf(own, d) {
  if (d === null || d === undefined || !fin(d) || !fin(own)) return { guarded: false };
  if (!(own - 0.5 < -d)) return { guarded: false };
  return { guarded: true, why: `against the Bot's own lean (its projection ${Math.round(own * 1000) / 10}% on this side): the edge is the price's alone, the practice stake (D82)` };
}
// (the d the live desk reads: the replayed record's flags.leanGuard.next; none: null, no guard)
export const leanDOf = (record) => (fin(record?.flags?.leanGuard?.next) ? record.flags.leanGuard.next : null);

// ---- The margin rule (DECISIONS.md D88, the owner, 2026-10-23: "take the pick the Bot likes unless the price is too
// good to pass") ----
// A side S at its price: e = p - breakeven (p the Bot's priced chance on S, breakeven the price's own chance) and
// d = max(0, fair - own) (own: the Bot's own model chance on S before the trust, the Book's fair no-vig chance): how
// far the Bot's own model sits under the fair price on S. Where d > 0 (the model leans the other way) S is bet at
// full stakes only if e >= lambda * d + m; else the practice stake (D1: a shrink, never off). lambda = m = 0 is the
// rule as it was (every bet clears e >= 0). The knobs by sport and market group (lines, props): tuned.mjs
// leanLambdaLines, leanMLines, leanLambdaProps, leanMProps, tried weekly by the self-tune
import { knob } from './tuned.mjs';
const decOf = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
export function marginOf({ p, odds, fair, own }) {
  if (!fin(p) || !fin(odds) || odds === 0 || !fin(fair) || !fin(own)) return null;
  return { e: p - 1 / decOf(odds), d: Math.max(0, fair - own) };
}
export const marginOpts = (sport, group) => (group === 'props' ? { lambda: knob(sport, 'leanLambdaProps'), m: knob(sport, 'leanMProps') } : { lambda: knob(sport, 'leanLambdaLines'), m: knob(sport, 'leanMLines') });
export function marginHeld(mg, { lambda = 0, m = 0 } = {}) {
  if (!mg || !(mg.d > 0)) return false;
  return mg.e < lambda * mg.d + m - 1e-12;
}
// (the live side's verdict: { held, why })
export function marginGuardOf(sport, group, side) {
  const mg = marginOf(side);
  const o = marginOpts(sport, group);
  if (!marginHeld(mg, o)) return { held: false };
  const pt = (x) => Math.round(x * 1000) / 10;
  return { held: true, why: `the Bot's own model ${pt(mg.d)} points under the fair price on this side and the price's edge ${pt(mg.e)} points, under ${o.lambda} x ${pt(mg.d)} + ${pt(o.m)}: the practice stake (D88's margin rule)` };
}
