// The betting windows (DECISIONS.md D63): when a game line is bet, learned walk-forward on the priced history's
// intraday snapshots (D61: the lines at 24, 12, 6, 3 and 1 hours before each start, the last two seasons a sport).
//
//   segment   a line pick's market and side class (the favored side or the dog by the Book's own chance, a total's
//             over or under): `ml:fav`, `spread:dog`, `total:over`
//   policy    'legacy' (the archive's clean open, else the close: the replay as it was, D42/D47) or a "not before"
//             hour H (POLICY_HOURS): the pick is held till H hours before the start and bet at the first snapshot
//             from then on where its edge clears the price (the close the last), at that snapshot's price
//   the walk  (walkWindows) each segment's policy as of a moment, from the outcomes of the games settled before it
//             alone: every policy's flat result on every game of the segment that had intraday snapshots, paired
//             against 'legacy' on the same games; a policy replaces 'legacy' only where its paired gain is positive
//             past WIN_Z standard errors over WIN_MIN games with a pick under either, the largest such gain winning.
//             So a segment with no evidence stays as it was; the evidence is the Bot's own picks at its own prices
//   live      run.mjs reads the record's verdicts (windows.json, written by gate.mjs --record, never the desk) and
//             holds a line pick whose segment's policy is an hour H while the game is more than H hours away
//             (holdFor); the last chance always bets (a pick is never lost to the wait). Props aren't held here:
//             the replay prices them at the close (their day-of facts, D48), so they have no earlier evidence
//
// Free; reads only what it is given. Never moves a chance or a stake: only the moment a pick is placed.

export const WINDOWS_V = 1;
// (D71: the deep history's dense lines (D67) beside D61's as the replay's intraday candidates, for the sports whose
// archive opens outside the lines' window (the NFL's opens are 48 hours out, so its replay bet every line at the close
// and none had a fair-close check), at DENSE_OFFSETS' hours (inside TIMING's 26-hour window), the Book's and the sharp
// book's prices alone. gate.mjs reads them for a version that exports these; a version without them, D61's files only)
export const DENSE_SPORTS = ['nfl'];
export const DENSE_OFFSETS = { nfl: [24, 12, 6, 3, 2, 1] };
export const DENSE_BOOKS = ['dk', 'pin'];
export const POLICY_HOURS = [24, 12, 6, 3, 1];
export const POLICIES = ['legacy', ...POLICY_HOURS.map((h) => `h${h}`)];
// (a snapshot is up to 45 minutes off its offset hour: intraday.mjs's nearest snapshot)
export const HOUR_TOL = 0.75;
export const WIN_Z = 1.645;
export const WIN_MIN = 60;
export const GUARD_TOL = 0.005;
// (D60's beat-the-close bar, desk.mjs BEAT_BAR, and the guard's minimum of checks, gate-score.mjs GUARD_MIN)
export const WIN_BEAT = 0.525;
export const WIN_BEAT_N = 30;
const fin = Number.isFinite;

// The sharp lag (DECISIONS.md D92, the owner's "predict the price's direction", 2026-10-24): a game line pick whose
// Book's own no-vig on its side sits LAG_PTS or more over the sharp book's (Pinnacle's, at the same line, seen by
// then) is a price the Book has yet to bring in line, and it usually does before the start: measured on every season
// of the priced history (the open, D61's and D67's snapshots inside the 26-hour window, against the fair close), such
// a side's price at the last chance beat its price when first seen by 1 to 2.7 points of return in every team sport
// and nearly every season, the results agreeing. So such a pick waits while the gap lasts and its game is further
// than the last chance (lagHeld), then bets at the price then (the gap closed, or the last chance: never lost to the
// wait). LAG_SPORTS: the NBA, the NHL and MLB; the NFL's replay failed D60's guard (more units, fewer bets beating
// the fair close) and MMA's desk (mma-desk.mjs) is apart, its gain the smallest.
export const LAG_PTS = 0.01;
export const LAG_SPORTS = ['nba', 'nhl', 'mlb'];
const impOf = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
// (a side's lag: the Book's own no-vig on it less the sharp book's; null without both)
export function lagOf(dkSide, dkOther, sharpSide) {
  if (!fin(dkSide) || !fin(dkOther) || !fin(sharpSide)) return null;
  const a = impOf(dkSide);
  const b = impOf(dkOther);
  return a / (a + b) - sharpSide;
}
// (whether a pick waits on the lag: LAG_PTS or more, its game further than the last chance and a snapshot's slack)
export const lagHeld = (sport, lag, hours, lastChance = 3) => LAG_SPORTS.includes(sport) && fin(lag) && lag >= LAG_PTS - 1e-9 && fin(hours) && hours > lastChance + HOUR_TOL;

export const classOf = (market, over, fS) => (market === 'total' ? (over ? 'over' : 'under') : fS >= 0.5 ? 'fav' : 'dog');
export const segOf = (market, cls) => `${market}:${cls}`;
export const hoursOf = (policy) => (policy === 'legacy' || !policy ? null : Number(String(policy).slice(1)));

// Whether a candidate placement (kind 'o' the archive's open, 'i' an intraday snapshot, 'c' the close; hours before
// the start) is one the policy may bet at
export function allows(policy, kind, hours) {
  if (kind === 'c') return true;
  if (!policy || policy === 'legacy') return kind === 'o';
  const h = hoursOf(policy);
  return fin(hours) && hours <= h + HOUR_TOL;
}

// The placement a policy makes from a key's candidates (time order, earliest first; each { kind, hours, ev, seg }),
// for the segment seg alone (null: any): the first it allows with a positive return, or null
export function placeBy(cands, policyOf, seg = null) {
  for (const c of cands) {
    if (seg && c.seg !== seg) continue;
    if (!(c.ev > 0)) continue;
    // (D92: a candidate the sharp lag holds is never the placement; a later one is, the close the last)
    if (c.lag) continue;
    if (allows(policyOf(c), c.kind, c.hours)) return c;
  }
  return null;
}

// The walk: outcomes [{ t (settled), seg, by: { policy: profit (flat, 0 no pick) } , any (a pick under some policy) }]
// -> { at(moment, seg) the policy then, final { seg: { policy, n, gain, se } } }. Recomputed at each month's start
// from the outcomes settled before it
export function walkWindows(outcomes, { z = WIN_Z, min = WIN_MIN } = {}) {
  const list = outcomes.filter((o) => fin(o.t) && o.seg).sort((a, b) => a.t - b.t);
  const verdictOf = (rows) => {
    const by = new Map();
    for (const o of rows) (by.get(o.seg) ?? by.set(o.seg, []).get(o.seg)).push(o);
    const out = {};
    for (const [seg, os] of by) {
      let best = { policy: 'legacy', n: 0, gain: 0, se: null };
      for (const p of POLICIES) {
        if (p === 'legacy') continue;
        const d = os.filter((o) => o.any).map((o) => (o.by[p] ?? 0) - (o.by.legacy ?? 0));
        if (d.length < min) continue;
        const m = d.reduce((a, b) => a + b, 0) / d.length;
        const v = d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1);
        const se = Math.sqrt(v / d.length);
        // (D60's guard on the window too: more units at worse prices is no gain. Its picks placed before the close beat
        // the fair close at least as often as the old placement's (GUARD_TOL) at no lower a mean return there)
        const priceOf = (q) => {
          const xs = os.map((o) => o.clv?.[q]).filter(Boolean);
          return xs.length ? { n: xs.length, beat: xs.reduce((a, b) => a + b.beat, 0) / xs.length, clv: xs.reduce((a, b) => a + b.clv, 0) / xs.length } : null;
        };
        const mine = priceOf(p);
        const old = priceOf('legacy');
        // (and D60's bar: its picks placed before the close beat the fair close WIN_BEAT of the time on WIN_BEAT_N checks or
        // more, else it hasn't shown its earlier price is a better one)
        const worse = !mine || mine.n < WIN_BEAT_N || mine.beat < WIN_BEAT || (!!old && (mine.beat < old.beat - GUARD_TOL || mine.clv < old.clv));
        if (m > 0 && m > z * se && m > best.gain && !worse) best = { policy: p, n: d.length, gain: m, se };
      }
      if (best.policy === 'legacy') best.n = os.filter((o) => o.any).length;
      out[seg] = { ...best, gain: Math.round(best.gain * 1e4) / 1e4, se: fin(best.se) ? Math.round(best.se * 1e4) / 1e4 : null };
    }
    return out;
  };
  const monthOf = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };
  const cache = new Map();
  const at = (moment, seg) => {
    if (!fin(moment)) return 'legacy';
    const m = monthOf(moment);
    if (!cache.has(m)) cache.set(m, verdictOf(list.filter((o) => o.t < m)));
    return cache.get(m)[seg]?.policy ?? 'legacy';
  };
  return { at, final: verdictOf(list) };
}

// (live: the hours a line pick is held to, from the record's file; null where its segment bets as before)
export function holdFor(file, market, cls) {
  const v = file?.segments?.[segOf(market, cls)];
  return v && v.policy !== 'legacy' ? hoursOf(v.policy) : null;
}
// (live: whether a pick is held now: its game further away than its segment's hour, and not inside the last chance)
export function heldNow(file, market, cls, hoursToStart, lastChance = 0) {
  const h = holdFor(file, market, cls);
  if (!fin(h) || !fin(hoursToStart)) return false;
  if (hoursToStart <= lastChance) return false;
  return hoursToStart > h + HOUR_TOL;
}

// (the record's file: apps/<sport>/src/StaticData/model/windows.json, { v, sport, at, segments: { seg: { policy, n,
// gain, se } } }, written by gate.mjs --record from the replay's walk on the whole history; {} where none)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
export const windowsFile = (root, sport) => path.join(root, 'apps', sport, 'src/StaticData/model/windows.json');
export function readWindows(root, sport) {
  try {
    const f = windowsFile(root, sport);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  } catch {
    return null;
  }
}
export const fileOf = (sport, final, { at = new Date().toISOString() } = {}) => ({ v: WINDOWS_V, sport, at, segments: final ?? {} });
