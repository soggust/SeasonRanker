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
