// Live against the replay (DECISIONS.md D93; the owner's 2026-10-24 audit item 5): each sport's live graded bets since
// its epoch against what the replay's same rules predict for bets like them, with a significance check.
//
//   expectOf(bets)   the replay's own bets (not the practice picks), the record writes it into replay-record.json
//                    (`expect`): by key (lines: the market and the market with its side; props: `prop:<stat>` and with
//                    its side; MMA's markets the same) each key's bets, flat return, the bets with a fair-close check
//                    and their beat count and mean expected return there, the Bot's chance summed and the wins
//   liveCheck(ledgerBets, expect, { since })   the ledger's staked bets (the edge bets: not the tracked rows, not the
//                    slate's practice picks) placed since `since` and graded won/lost/push, each one's expectation from
//                    the replay's key, shrunk to its parent (the side's key to the market's, the market's to lines or
//                    props, those to all) by K bets: so a key with few replayed bets reads the broader one.
//                    Returned: the flat return live against expected (z on the live bets' own spread), the Book's own
//                    expectation (the bets' price at their no-vig fair: what a bettor with no edge makes), beat the fair
//                    close live against the replay's share on the same keys (only keys the replay checks: its props
//                    are bet at the close and carry none), and the calibration: the wins against the Bot's chance
//                    summed and against the Book's fair summed, each with its z
// The same arithmetic in the Algorithm tab: libs/ranker/src/engine/book/live-check.ts (tests/live-check.test.mjs
// checks the two agree).

export const LIVE_CHECK_V = 1;
export const K = 50;
const fin = Number.isFinite;
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const r2 = (x) => (fin(x) ? Math.round(x * 100) / 100 : null);

const sideWord = (s) => (s === 'over' || s === 'under' || s === 'home' || s === 'away' ? s : s === 'h' ? 'home' : s === 'a' ? 'away' : String(s ?? ''));
// (a bet's keys, broadest last: [market with side, market, class, all])
export function keysOf(market, stat, side) {
  const m = market === 'prop' ? `prop:${stat}` : String(market);
  return [`${m}:${sideWord(side)}`, m, market === 'prop' ? 'props' : 'lines', 'all'];
}
const flatOf = (res, odds) => (res === 'W' ? dec(odds) - 1 : res === 'L' ? -1 : 0);

function add(acc, k, b) {
  const a = (acc[k] ??= { n: 0, flat: 0, beatN: 0, beat: 0, clv: 0, pN: 0, p: 0, wins: 0 });
  a.n++;
  a.flat += b.flat;
  if (b.beat === 0 || b.beat === 1) {
    a.beatN++;
    a.beat += b.beat;
    if (fin(b.clv)) a.clv += b.clv;
  }
  if (fin(b.p) && (b.res === 'W' || b.res === 'L')) {
    a.pN++;
    a.p += b.p;
    a.wins += b.res === 'W' ? 1 : 0;
  }
}

// The replay's expectation table from its bets (replay-record.mjs's, practice picks aside)
export function expectOf(bets) {
  const keys = {};
  for (const b of bets ?? []) {
    if (b.practice || !(b.res === 'W' || b.res === 'L' || b.res === 'P') || !fin(b.odds)) continue;
    const x = { flat: flatOf(b.res, b.odds), beat: b.beat, clv: b.clv, p: b.p, res: b.res };
    for (const k of keysOf(b.market, b.stat, b.side)) add(keys, k, x);
  }
  for (const a of Object.values(keys)) for (const f of ['flat', 'clv', 'p']) a[f] = r4(a[f]);
  return { v: LIVE_CHECK_V, k: K, keys };
}

// (a key's expected flat return, beat share and mean return at the fair close, each shrunk up its parents)
export function expectFor(expect, ks, k = expect?.k ?? K) {
  const T = expect?.keys ?? {};
  let flat = null;
  let beat = null;
  let clv = null;
  for (const key of [...ks].reverse()) {
    const a = T[key];
    if (!a) continue;
    flat = flat === null ? (a.n ? a.flat / a.n : null) : (a.flat + k * flat) / (a.n + k);
    if (a.beatN) {
      beat = beat === null ? a.beat / a.beatN : (a.beat + k * beat) / (a.beatN + k);
      clv = clv === null ? a.clv / a.beatN : (a.clv + k * clv) / (a.beatN + k);
    }
  }
  // (a key the replay never checked against the close has no expected beat of its own: its parents' would be
  // another market's (the props bet at the close in the replay: no check), so none)
  const own = ks.slice(0, 2).some((key) => T[key]?.beatN);
  return { flat, beat: own ? beat : null, clv: own ? clv : null };
}

const resOf = (status) => (status === 'won' ? 'W' : status === 'lost' ? 'L' : status === 'push' ? 'P' : null);
// (the ledger's bets the check reads: staked edge bets, graded, placed since `since`)
export function liveBets(bets, since = null) {
  const t0 = since ? Date.parse(since) : -Infinity;
  return (bets ?? []).filter((b) => b && b.units > 0 && b.intent !== 'track' && b.intent !== 'action' && !b.practice && !b.void && resOf(b.status) && fin(b.odds) && Date.parse(b.placedAt ?? b.start) >= t0);
}

const zOf = (d, se) => (se > 0 && fin(d) ? r2(d / se) : null);
// (the two-sided chance of a z this far from 0 under the normal: Abramowitz and Stegun 7.1.26)
export function pTwo(z) {
  if (!fin(z)) return null;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return r4(1 - erf);
}

export function liveCheck(ledgerBets, expect, { since = null } = {}) {
  const list = liveBets(ledgerBets, since);
  const out = { v: LIVE_CHECK_V, since, n: list.length };
  if (!list.length) return out;
  let flat = 0;
  let flat2 = 0;
  let exp = 0;
  let book = 0;
  let staked = 0;
  let profit = 0;
  const beat = { n: 0, beat: 0, clv: 0, expN: 0, exp: 0, expClv: 0, mine: 0, mineClv: 0 };
  const cal = { n: 0, wins: 0, p: 0, pv: 0, f: 0, fv: 0 };
  for (const b of list) {
    const res = resOf(b.status);
    const f = flatOf(res, b.odds);
    flat += f;
    flat2 += f * f;
    staked += b.units;
    profit += fin(b.profit) ? b.profit : 0;
    const e = expectFor(expect, keysOf(b.market, b.propType ?? b.stat, b.side));
    exp += fin(e.flat) ? e.flat : 0;
    if (fin(b.fair)) book += b.fair * dec(b.odds) - 1;
    // (beat the fair close as the replay reads it (D56: a positive expected return at the close's no-vig, clv.ev), not
    // clv.beat (the no-vig chance moved the bet's way), which a bet can "beat" while its price still loses to the close)
    const bt = fin(b.clv?.ev) ? b.clv.ev > 0 : null;
    if (bt === true || bt === false) {
      beat.n++;
      beat.beat += bt ? 1 : 0;
      if (fin(b.clv?.ev)) beat.clv += b.clv.ev;
      if (fin(e.beat)) {
        beat.expN++;
        beat.exp += e.beat;
        beat.expClv += fin(e.clv) ? e.clv : 0;
        beat.mine += bt ? 1 : 0;
        beat.mineClv += fin(b.clv?.ev) ? b.clv.ev : 0;
      }
    }
    if ((res === 'W' || res === 'L') && fin(b.p)) {
      cal.n++;
      cal.wins += res === 'W' ? 1 : 0;
      cal.p += b.p;
      cal.pv += b.p * (1 - b.p);
      if (fin(b.fair)) {
        cal.f += b.fair;
        cal.fv += b.fair * (1 - b.fair);
      }
    }
  }
  const n = list.length;
  const mean = flat / n;
  const sd = n > 1 ? Math.sqrt(Math.max(0, (flat2 - n * mean * mean) / (n - 1))) : null;
  const se = sd !== null ? sd / Math.sqrt(n) : null;
  out.flat = r4(mean);
  out.exp = r4(exp / n);
  out.book = r4(book / n);
  out.se = r4(se);
  out.z = zOf(mean - exp / n, se);
  out.p = pTwo(out.z);
  out.zBook = zOf(mean - book / n, se);
  out.staked = r2(staked);
  out.profit = r2(profit);
  out.beat = beat.n
    ? {
        n: beat.n,
        share: r4(beat.beat / beat.n),
        clv: r4(beat.clv / beat.n),
        // (the bets on keys the replay checked against the close: their share against the replay's on the same keys)
        keyed: beat.expN,
        mine: beat.expN ? r4(beat.mine / beat.expN) : null,
        exp: beat.expN ? r4(beat.exp / beat.expN) : null,
        z: beat.expN ? zOf(beat.mine - beat.exp, Math.sqrt(Math.max(1e-9, (beat.exp * (1 - beat.exp / beat.expN))))) : null,
      }
    : null;
  out.cal = cal.n ? { n: cal.n, wins: cal.wins, p: r2(cal.p), zP: zOf(cal.wins - cal.p, Math.sqrt(cal.pv)), f: r2(cal.f), zF: zOf(cal.wins - cal.f, Math.sqrt(cal.fv)) } : null;
  return out;
}
