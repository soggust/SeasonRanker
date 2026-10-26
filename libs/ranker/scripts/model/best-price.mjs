// The best price across the US books (DECISIONS.md D74; the owner, 2026-10-20: "the Book and the Bot take and show the
// best price across US sportsbooks instead of DraftKings only"). One rule for the live quotes and the replayed history:
//
//   books   the US books one region's call names (oddsapi.mjs WIDE_BOOKS less Pinnacle): DraftKings, FanDuel, BetMGM,
//           Caesars, ESPN Bet (theScore Bet), Fanatics, BetRivers, Hard Rock, Bally. Pinnacle is the fair price and never
//           a book to bet at; an offshore book (the MMA totals' anchors, fights-totals.mjs) never either
//   line    a side's best price is taken at the desk's book's own line only (the line ESPN's board, the trust and the
//           projection read), each book's pair at that same line: a book on another line is left out, never moved
//   guard   a book's pair counts only when it is a sane two-way price: both sides posted, its vig not negative
//           (implied sum at least SANE_SUM), and its no-vig chance within FAIR_TOL of the median of the books' at that
//           line (a stale or in-play line, BetMGM's 230/-286 beside DraftKings' 350/-417 on 2020-10-23, is dropped)
//   pick    each side the highest decimal price among the sane books, DraftKings first at a tie (so a tie names it)
//   fair    unchanged: Pinnacle's no-vig where it posts the line, else the desk's book's own two prices (a pair
//           of two books' best prices has less vig than any one book's and would bias the fair)
//
// Codes (board.json's pb, the user's bet's book): BOOK_CODES' short codes (deep-history.mjs); BOOK_NAMES their names.

export const US_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'espnbet', 'fanatics', 'betrivers', 'hardrockbet', 'ballybet'];
export const CODES = { draftkings: 'dk', fanduel: 'fd', betmgm: 'mgm', williamhill_us: 'czr', espnbet: 'espn', fanatics: 'fan', betrivers: 'br', hardrockbet: 'hr', ballybet: 'bly' };
export const US_CODES = new Set(Object.values(CODES));
export const BOOK_NAMES = { dk: 'DraftKings', fd: 'FanDuel', mgm: 'BetMGM', czr: 'Caesars', espn: 'ESPN Bet', fan: 'Fanatics', br: 'BetRivers', hr: 'Hard Rock Bet', bly: 'Bally Bet' };
export const SANE_SUM = 0.995;
export const FAIR_TOL = 0.04;
// (the replay: a dense snapshot this close to the row's own counts as the same snapshot; the archives are 5 to 10
// minutes apart)
export const SHOP_TOL = 10 * 6e4;

const fin = Number.isFinite;
const ok = (o) => fin(o) && Math.abs(o) >= 100;
const implied = (o) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const decimal = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
export const codeOf = (key) => CODES[key] ?? (US_CODES.has(key) ? key : null);
export const nameOf = (code) => BOOK_NAMES[code] ?? null;

// The best price of each side from the books' pairs at one line: cands [{ book (code), a, b }] (American, a the
// home's or over's). { a: { odds, book }, b: { odds, book }, n (the sane books) }, or null with no sane pair.
// dk: the desk's book's code (first at a tie)
export function bestPair(cands, dk = 'dk') {
  const two = (cands ?? []).filter((c) => c && US_CODES.has(c.book) && ok(c.a) && ok(c.b) && implied(c.a) + implied(c.b) >= SANE_SUM);
  if (!two.length) return null;
  const fairs = two.map((c) => implied(c.a) / (implied(c.a) + implied(c.b))).sort((x, y) => x - y);
  const m = fairs.length >> 1;
  const median = fairs.length % 2 ? fairs[m] : (fairs[m - 1] + fairs[m]) / 2;
  const sane = two.filter((c) => Math.abs(implied(c.a) / (implied(c.a) + implied(c.b)) - median) <= FAIR_TOL);
  if (!sane.length) return null;
  const pick = (k) => sane.reduce((best, c) => (!best || decimal(c[k]) > decimal(best[k]) + 1e-9 || (Math.abs(decimal(c[k]) - decimal(best[k])) <= 1e-9 && c.book === dk && best.book !== dk) ? c : best), null);
  const a = pick('a');
  const b = pick('b');
  return { a: { odds: a.a, book: a.book }, b: { odds: b.b, book: b.book }, n: sane.length };
}

// A side's best as the desk keeps it ({ odds, book }), never worse than the desk's book's own (dkOdds): a best that
// isn't better than DraftKings' names DraftKings
export function sideBest(best, dkOdds) {
  if (!best || !ok(best.odds)) return ok(dkOdds) ? { odds: dkOdds, book: 'dk' } : null;
  if (ok(dkOdds) && decimal(best.odds) <= decimal(dkOdds) + 1e-9) return { odds: dkOdds, book: 'dk' };
  return { odds: best.odds, book: best.book };
}

// The replayed history (D74): each line row (gate-history.mjs, gate-mma.mjs: { event or oid, market, line, at,
// overOdds, underOdds }) given its best price (x.shop: { over, under, overBook, underBook, n }) where the deep
// history's dense lines (deep-history.mjs readDeep: D67's every-book snapshots) have a snapshot within SHOP_TOL of
// the row's own and another US book at the row's line; each book as it stood at that snapshot (the rows are
// change-only; an MMA row on the other fighter's frame, crossed, read swapped). The row's own DraftKings price stays a candidate, so a shopped price is never worse. oidOf(x): the
// row's Odds API event id. Returns the count shopped and the count better than DraftKings on either side
const DENSE_MARKET = { ml: 'h2h', spread: 'spreads', total: 'totals' };
export function shopRows(rows, deep, oidOf, { tol = SHOP_TOL } = {}) {
  const snaps = [...new Set(deep?.snaps ?? [])].map((s) => Date.parse(s)).filter(fin).sort((a, b) => a - b);
  const nearest = (t) => {
    let lo = 0;
    let hi = snaps.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (snaps[m] < t) lo = m + 1;
      else hi = m;
    }
    const c = [snaps[lo - 1], snaps[lo]].filter(fin).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    return fin(c) && Math.abs(c - t) <= tol ? c : null;
  };
  const stood = new Map();
  const at = (oid, T) => {
    const k = `${oid}|${T}`;
    if (stood.has(k)) return stood.get(k);
    const last = new Map();
    for (const x of deep.lines.get(oid) ?? []) {
      if (x.ts > T) break;
      last.set(`${x.book}|${x.market}`, x);
    }
    stood.set(k, last);
    return last;
  };
  let shopped = 0;
  let better = 0;
  for (const x of rows ?? []) {
    const market = DENSE_MARKET[x.market];
    if (!market || !fin(x.at) || !ok(x.overOdds) || !ok(x.underOdds)) continue;
    const oid = oidOf(x);
    if (!oid || !deep?.lines?.has(oid)) continue;
    const T = nearest(x.at);
    if (!fin(T)) continue;
    const same = (l) => (market === 'h2h' ? true : fin(l) && fin(x.line) && Math.abs(l - x.line) < 1e-9);
    // (a book whose market the deep files write gone by T (intraday.mjs buildRows' G row) isn't on the board: never shopped)
    const others = [...at(oid, T).values()].filter((y) => !y.gone && y.market === market && y.book !== 'dk' && US_CODES.has(y.book) && same(y.line));
    if (!others.length) continue;
    // (an MMA row framed on ESPN's first fighter where the archive's is the other (gate-mma.mjs crossed): its sides swapped)
    const flip = market === 'h2h' && x.crossed;
    const best = bestPair([{ book: 'dk', a: x.overOdds, b: x.underOdds }, ...others.map((y) => ({ book: y.book, a: flip ? y.b : y.a, b: flip ? y.a : y.b }))]);
    if (!best) continue;
    const o = sideBest(best.a, x.overOdds);
    const u = sideBest(best.b, x.underOdds);
    x.shop = { over: o.odds, overBook: o.book, under: u.odds, underBook: u.book, n: best.n };
    shopped++;
    if (o.book !== 'dk' || u.book !== 'dk') better++;
  }
  return { shopped, better };
}

// ---------------------------------------------------------------------------
// The shopped-price guard (DECISIONS.md D76, the owner's: best price added about 300 borderline NFL lines at the close
// that lose). A bet whose side clears only at another book's price (shopOnly: its expected return at DraftKings' own
// price 0 or less, above 0 at the shopped one) needs a minimum return at the shopped price (the walk's T), or it is
// bet at the practice stake, a LIKE: a shrink, never an off switch (gates shrink, never stop). T is picked walk-forward
// by month from SHOP_GRID on the shop-only bets settled before the month began (flat units: the T whose shrunk bets
// lost the most; none lost, T 0, no guard), SHOP_MIN_N of them before any guard. Infinity is "clear at DraftKings
// too". SHOP_GUARD: the sports it applies in, those where the walk's own months gained out of sample (D76's table)
// ---------------------------------------------------------------------------
export const SHOP_GRID = [0, 0.01, 0.02, 0.03, 0.04, 0.06, Infinity];
export const SHOP_MIN_N = 30;
export const SHOP_GUARD = new Set(['nfl', 'nhl']);
export const shopGuardOn = (sport) => SHOP_GUARD.has(sport);
// (a side that clears only at a shopped price: pS its chance, odds the price bet, dkOdds DraftKings' own on that side,
// book the price's book code)
export function shopOnly(pS, odds, dkOdds, book) {
  if (!book || book === 'dk' || !Number.isFinite(pS) || !Number.isFinite(odds) || !Number.isFinite(dkOdds) || !odds || !dkOdds) return false;
  return pS * decimal(dkOdds) - 1 <= 0 && pS * decimal(odds) - 1 > 0;
}
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const monthStart = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
// (the T for a list of settled shop-only bets { ev, flat }: the grid's T whose bets under it lost the most, flat;
// 0 under minN or where none lost)
export function shopT(list, { grid = SHOP_GRID, minN = SHOP_MIN_N } = {}) {
  if (list.length < minN) return 0;
  let best = 0;
  let gain = 0;
  for (const T of grid) {
    let g = 0;
    for (const x of list) if (x.ev < T) g -= x.flat;
    if (g > gain + 1e-9) (best = T), (gain = g);
  }
  return best;
}
// The walk: list of shop-only bets { t: settled ms, at: placed ms, ev, flat }; { at(placed) -> T, final, months }
export function walkShopGuard(list, opts = {}) {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const memo = new Map();
  const at = (t) => {
    const k = monthKey(t);
    if (!memo.has(k)) {
      const m0 = monthStart(t);
      memo.set(k, shopT(sorted.filter((x) => x.t < m0), opts));
    }
    return memo.get(k);
  };
  return { at, final: shopT(sorted, opts), months: () => [...memo].sort() };
}
// (the live side's verdict: { guarded, why } for a pick { p (its side's chance), odds, dk, book, ev } at the rule's T)
export function shopGuardOf(pick, T, push = 0) {
  if (!Number.isFinite(T) && T !== Infinity) return { guarded: false };
  const pS = pick?.p;
  const dkEv = Number.isFinite(pick?.dk) ? (1 - push) * (pS * decimal(pick.dk) - 1) : null;
  if (!pick?.book || pick.book === 'dk' || !Number.isFinite(pick?.dk) || !(dkEv <= 0) || !(pick.ev > 0)) return { guarded: false };
  if (pick.ev >= T) return { guarded: false };
  return { guarded: true, why: `clears only at ${nameOf(pick.book) ?? 'a shopped'} price (${Math.round(pick.ev * 1000) / 10}% there, none at the Book's): under the shopped-price guard's ${T === Infinity ? 'clear-at-the-Book rule' : `${Math.round(T * 1000) / 10}% minimum`} (D76), the practice stake` };
}
// (the T the live desk reads: the replayed record's (replay-record.json) flags.shopGuard.next; 'dk' clear there too;
// none (no record, no shop-only bets): null, no guard)
export function shopTOf(record) {
  const n = record?.flags?.shopGuard?.next;
  return n === 'dk' ? Infinity : Number.isFinite(n) ? n : null;
}
