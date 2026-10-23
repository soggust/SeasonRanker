// One price a side (DECISIONS.md D81; the owner, 2026-10-22: Bot Picks, the game board, the slip and the popover
// always show the same price for the same side and line). The bettor's board carries each side's best price the
// Bot knows (board.mjs heldPaid: a paid quote's best US price while it's fresh, else ESPN's free DraftKings one),
// with the quote's time (pt) and DraftKings' own price in it (dko). The page holds the same rule: a paid price
// stands PAID_FRESH_MS from its quote and only while DraftKings' price hasn't moved since (PAID_MOVED, half a point
// of the side's chance); past it the side falls back to DraftKings' own, no best claimed, its Kelly and band worked
// again there. The board as loaded goes through freshBoard once (lines.service model), so the game board's buttons,
// the Bot Picks rows (suggestions.ts quoteOf) and the slip all read one price. The bettor's constants are pinned
// equal to these (tests/book-paid-price.test.mjs). No Angular here
import type { BoardBand, BoardProp, BoardSide, ModelBoard } from '../account/wallet/lines.service';
import { confidenceOf, kellyOf } from './bet-why';

export const PAID_FRESH_MS = 60 * 60e3;
export const PAID_MOVED = 0.005;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const impliedOf = (o: number) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));

// (DraftKings' price moved from the quote's: both known and half a point of chance apart)
export function dkMoved(now: number | null | undefined, then: number | null | undefined): boolean {
  return fin(now) && fin(then) && now !== 0 && then !== 0 && Math.abs(impliedOf(now) - impliedOf(then)) >= PAID_MOVED - 1e-9;
}
// (a paid quote still fresh at now; a side without its quote's time (an older board, MMA's paid-only board) as it is)
export function paidFresh(pt: string | null | undefined, now: number): boolean {
  if (!pt) return true;
  const t = Date.parse(pt);
  return Number.isFinite(t) && now - t < PAID_FRESH_MS;
}
// (DraftKings' own price behind a shopped side: dko, or the side's own where DraftKings was the best)
export function dkOf(o: number | null | undefined, pb: string | null | undefined, dko: number | null | undefined): number | null {
  return fin(dko) ? dko : pb === 'dk' && fin(o) ? o : null;
}

// A side's band at a price it wasn't judged at, as game-lines' call does: a CHECK kept, a guard's pass (its reason,
// or a PASS with an edge at its own price) a PASS, else the Kelly score's band at the side's chance, held to the
// desk's cap (D46, D52)
export function bandAt(b: BoardBand | null, ks: number | null, c: number, odds: number, cap: 'medium' | 'high' | null | undefined, sr: string | undefined): { ks: number | null; b: BoardBand | null } {
  if (b === 'check') return { ks, b };
  const kelly = kellyOf(c, odds);
  if (kelly === null) return { ks, b };
  if (sr || (b === 'low' && (ks ?? 0) > 0)) return { ks: kelly, b: 'low' };
  const raw = confidenceOf(kelly, c, true) as BoardBand;
  const held = cap === 'medium' && (raw === 'lock' || raw === 'high') ? 'medium' : cap === 'high' && raw === 'lock' ? 'high' : raw;
  return { ks: kelly, b: held };
}

// (a game side past its paid quote: DraftKings' own price, no book, its Kelly and band there)
function freshSide(s: BoardSide, now: number): BoardSide {
  if (!s.pb || paidFresh(s.pt, now)) return s;
  const dk = dkOf(s.o, s.pb, s.dko);
  const { pb: _pb, pt: _pt, dko: _dko, ...rest } = s;
  if (dk === null || dk === s.o) return rest as BoardSide;
  const at = bandAt(s.b, s.ks, s.c, dk, s.cap, s.sr);
  return { ...rest, o: dk, ks: at.ks ?? s.ks, b: at.b ?? s.b } as BoardSide;
}
// (a prop past its paid quote: each shopped side at DraftKings' own, no book)
function freshProp(x: BoardProp, now: number): BoardProp {
  if (!x.pb || paidFresh(x.pt, now)) return x;
  const o = [...x.o] as BoardProp['o'];
  const ks = [...x.ks] as BoardProp['ks'];
  const b = [...x.b] as BoardProp['b'];
  ([0, 1] as const).forEach((i) => {
    if (!x.pb![i]) return;
    const dk = dkOf(x.o[i], x.pb![i], x.dko?.[i]);
    if (dk === null || dk === x.o[i]) return;
    o[i] = dk;
    if (x.c === null || !(x.c > 0 && x.c < 1)) return;
    const at = x.sk ? { ks: kellyOf(i ? 1 - x.c : x.c, dk), b: 'low' as BoardBand } : bandAt(x.b[i], x.ks[i], i ? 1 - x.c : x.c, dk, x.cap?.[i], x.sr);
    ks[i] = at.ks;
    b[i] = at.b;
  });
  const { pb: _pb, pt: _pt, dko: _dko, ...rest } = x;
  return { ...rest, o, ks, b };
}

// The board as the page shows it at now: every side whose paid quote has gone stale at DraftKings' own price
// (freshSide, freshProp); the rest as written. The same board object where nothing's stale
export function freshBoard<B extends ModelBoard>(board: B, now: number): B {
  let changed = false;
  const games = board.games.map((g) => {
    const k: typeof g.k = {};
    let moved = false;
    for (const [m, sides] of Object.entries(g.k ?? {}) as [keyof typeof g.k, BoardSide[]][]) {
      const next = (sides ?? []).map((s) => freshSide(s, now));
      if (next.some((s, i) => s !== sides[i])) moved = true;
      k[m] = next;
    }
    const p = g.p?.map((x) => freshProp(x, now));
    if (p && p.some((x, i) => x !== g.p![i])) moved = true;
    if (!moved) return g;
    changed = true;
    return { ...g, k, ...(p ? { p } : {}) };
  });
  return changed ? { ...board, games } : board;
}
