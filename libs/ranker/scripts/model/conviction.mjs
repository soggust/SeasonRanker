// The conviction challenger (DECISIONS.md D107, the owner, 2026-11-06: "the bot is a bit too worried about value and not
// simply winning bets"). Measuring only: REPLAY_CONVICTION=1 in the replay (replay-record.mjs; the gate's candidate
// env:REPLAY_CONVICTION=1), walkConviction by day for the live ledger's staked bets; nothing the desk prices or
// stakes reads it.
//
//   c       a bet's conviction: the Bot's own model chance on its side before any shrink (a game line's margins chance,
//           x.raw; a prop's projection at the line, x.raw / the ledger's projection.pOver, not the anchored one) less
//           the Book's no-vig fair on that side. Not the trust (desk.mjs chanceAt: p = fair + trust x lean), which is
//           the fitted share of the same lean: the challenger reads the lean whole and replaces the price's stake
//           with it, so the two are never added (no double count). D88's margin rule (lean.mjs marginHeld: a side the
//           own model is under the fair on, tracked unless the price edge is big) is the c < 0 half of it; the
//           challenger tracks every c <= 0 bet, so it runs with D88's knobs at their shipped 0 (no double count)
//   select  a priced bet (the price's return over 0, as now) is tracked where c <= 0: the model doesn't side with it
//   minimum a soft one: c in (0, cMin] is bet at the practice stake (a shrink, never off). cMin walked by month on the
//           group's (lines, props) bets with c > 0 settled before the month: the grid's value whose bets at or under it
//           lost the most flat (none lost, or under MIN_N: 0)
//   stake   past cMin: 0.5u + 2.5u x (c - cMin) / span, by half units, 3u at most; span the 90th percentile of the
//           settled bets' c - cMin (under MIN_N: SPAN0). The price's edge no longer sizes it
export const C_GRID = [0, 0.01, 0.02, 0.05, 0.1];
export const MIN_N = 30;
export const SPAN0 = 0.1;
export const CONVICTION = process.env.REPLAY_CONVICTION === '1';
const fin = Number.isFinite;

// (a side's conviction: own chance of the side less its fair; null unknown)
export function convictionOf(ownOver, over, fairSide) {
  if (!fin(ownOver) || !fin(fairSide)) return null;
  return (over ? ownOver : 1 - ownOver) - fairSide;
}

// (the fit on settled bets { c, flat }: { cMin, span, n })
export function fitConviction(list, { grid = C_GRID, minN = MIN_N, span0 = SPAN0 } = {}) {
  const pos = list.filter((x) => fin(x.c) && x.c > 0 && fin(x.flat));
  if (pos.length < minN) return { cMin: 0, span: span0, n: pos.length };
  let cMin = 0;
  let loss = 0;
  for (const t of grid) {
    let l = 0;
    for (const x of pos) if (x.c <= t) l -= x.flat;
    if (l > loss + 1e-9) (cMin = t), (loss = l);
  }
  const over = pos.map((x) => x.c - cMin).filter((v) => v > 0).sort((a, b) => a - b);
  const span = over.length >= minN ? Math.max(0.01, over[Math.min(over.length - 1, Math.floor(over.length * 0.9))]) : span0;
  return { cMin, span, n: pos.length };
}

// (the stake at c under a fit: 0 tracked, else 0.5 to 3)
export function convictionUnits(c, fit, { practice = 0.5, max = 3 } = {}) {
  if (!fin(c) || c <= 0) return 0;
  if (c <= fit.cMin) return practice;
  const raw = practice + (max - practice) * Math.min(1, (c - fit.cMin) / fit.span);
  return Math.min(max, Math.max(practice, Math.round(raw * 2) / 2));
}

const monthStart = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
// The walk: settled bets { t: settled ms, group, c, flat }; at(placed ms, group) -> the fit from the bets settled before
// the month began (by=day: before the day, the ledger's short window)
export function walkConviction(list, { by = 'month', ...opts } = {}) {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const memo = new Map();
  return (at, group) => {
    const cut = by === 'day' ? Math.floor(at / 864e5) * 864e5 : monthStart(at);
    const k = `${group}|${cut}`;
    if (!memo.has(k)) memo.set(k, fitConviction(sorted.filter((x) => x.group === group && x.t < cut), opts));
    return memo.get(k);
  };
}
