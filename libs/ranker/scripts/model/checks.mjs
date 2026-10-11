// The CHECK picks: the markets the desk won't bet because the model is too far from the book (desk.mjs
// gapGuard, a game market's; props.mjs priceProps' gap guard, a prop's), kept anyway as a hypothetical, so the
// owner can look into them and the desk learns whether they'd have won.
//
//   what     a CHECK is the market as it stood: the model's side (the side its chance is over the book's
//            fair chance; past the gap the lean is tapered to nothing, so the side the desk would price best
//            is only the cheaper vig), its line, its price and the other side's, the model's and the fair
//            chances and the gap between them, its projection (a prop's) or expected score, its context, and
//            the guard's words as its reason. Kept on the ledger apart from the bets (ledger.checks, never
//            ledger.bets): no units staked, so it's never in the record, the profit, the trust fit, the caps or
//            the CLV
//   when     recorded the run it's skipped, and written again by a later run only while it isn't locked
//            (REPRICE_BY before the start, timing.mjs) and only when something material changed (its side,
//            line or price, the model or the book moved a point or more, an owner's note): so the picks don't
//            churn every hour with the refits' small moves
//   graded   once its game is final, as a bet would be, at a unit, in checkResult ({ status, profit, final,
//            actual (a prop's), void, gradedAt }): what it would have done, never in the record
//   placed   when its market is bet after all (the gap closed, or an owner's note priced it again), the bet
//            it became is noted on it (bet) and the page stops showing it as a CHECK; it's still graded
//   notes    an owner's note on it (notes.mjs, Firestore's deskNotes/{id}) kept on it (note), so its result
//            is the note's outcome: checkSummary tallies them by reason, for tuning the gap later

import { round } from './ratings.mjs';
import { REPRICE_BY } from './timing.mjs';

// (the most CHECK picks the page shows a sport, the biggest gap first)
export const CHECK_TOP = 20;

// (a CHECK locked: its game starts within REPRICE_BY, or has started; nothing writes it again from here)
export const checkLocked = (c, now) => Date.parse(c.start) - now.getTime() <= REPRICE_BY;

// The model's side of a market's two (each { side, model, fair, ... }): the one whose chance is over the
// book's, the other beside it (other)
export function modelSide(sides) {
  const [a, b] = sides;
  const pick = a.model - a.fair >= b.model - b.fair ? a : b;
  return { ...pick, other: pick === a ? b : a };
}

// A CHECK from what the bet would have been (bet: the would-be bet's fields, its side the model's) and the
// guard that stopped it: no units, intent 'check', the guard's words its reason, the gap signed for its side
export function checkOf(bet, guard) {
  const { units: _units, intent: _intent, ...rest } = bet;
  return {
    ...rest,
    intent: 'check',
    units: 0,
    gap: round(bet.model - bet.fair, 4),
    reason: guard?.why ?? 'too far from the market',
    status: 'check',
    profit: 0,
  };
}

// (what a CHECK's material facts are: the ones whose change writes it again)
const material = (c) => [c.side, c.line, c.odds, c.otherOdds ?? null, Math.round(c.model * 100), Math.round(c.fair * 100), c.note ? `${c.note.reason}:${c.note.player ?? ''}:${c.note.status ?? ''}:${c.note.at ?? ''}` : ''].join('|');

// A run's CHECK added to the ledger's (ledger.checks), or the one there written again: only while it's open
// (not graded), not locked, and something material changed; its first time kept (firstAt) and how many times
// it was written (n). Returns 'new', 'updated' or null
export function upsertCheck(ledger, check, now) {
  ledger.checks ??= [];
  const at = ledger.checks.findIndex((c) => c.id === check.id);
  if (at < 0) {
    ledger.checks.push({ ...check, firstAt: check.placedAt, n: 1 });
    return 'new';
  }
  const was = ledger.checks[at];
  if (was.checkResult || checkLocked(was, now)) return null;
  const next = { ...check, ...(was.note ? { note: was.note } : {}), ...(was.bet ? { bet: was.bet } : {}) };
  if (material(next) === material(was)) return null;
  ledger.checks[at] = { ...next, firstAt: was.firstAt ?? was.placedAt, n: (was.n ?? 1) + 1 };
  return 'updated';
}

// (a CHECK whose market was bet after all: the bet it became, noted once; the page stops showing it)
export function markPlaced(ledger) {
  let n = 0;
  const bets = new Map(ledger.bets.map((b) => [b.id, b]));
  for (const c of ledger.checks ?? []) {
    const b = bets.get(c.id);
    if (c.bet || !b || Date.parse(b.placedAt ?? '') < Date.parse(c.firstAt ?? c.placedAt ?? '')) continue;
    c.bet = { at: b.placedAt, side: b.side, line: b.line, odds: b.odds, units: b.units, intent: b.intent ?? null };
    n++;
  }
  return n;
}

// A CHECK's result from a bet's (desk.mjs settle or voidOf, props.mjs settleProp, at a unit): what it would
// have done, and when it was graded
export function checkResultOf(res, at) {
  return { status: res.status, profit: round(res.profit ?? 0, 3), ...(res.void ? { void: true } : {}), ...(res.actual !== undefined ? { actual: res.actual } : {}), final: res.final ?? null, gradedAt: at };
}

// (a CHECK at a unit, for the graders, which stake bet.units)
export const atUnit = (c) => ({ ...c, units: 1 });

// The CHECKs' tally: how many, open and graded, their record had each been bet a unit (a void one not
// counted), the hit rate, and the same by market and by the owner's note's reason (the self-check's, for
// tuning the gap)
export function checkSummary(checks = []) {
  const tally = (list) => {
    const done = list.filter((c) => c.checkResult && !c.checkResult.void);
    const won = done.filter((c) => c.checkResult.status === 'won').length;
    const lost = done.filter((c) => c.checkResult.status === 'lost').length;
    return {
      n: list.length,
      open: list.filter((c) => !c.checkResult).length,
      won,
      lost,
      push: done.length - won - lost,
      hitRate: won + lost ? round(won / (won + lost), 4) : null,
      profit: round(done.reduce((t, c) => t + (c.checkResult.profit ?? 0), 0), 2),
      bet: list.filter((c) => c.bet).length,
    };
  };
  const by = (key) => Object.fromEntries([...new Set(checks.map(key).filter(Boolean))].sort().map((k) => [k, tally(checks.filter((c) => key(c) === k))]));
  return {
    ...tally(checks),
    byMarket: by((c) => (c.market === 'prop' ? `prop:${c.propType}` : c.market)),
    byReason: by((c) => c.note?.reason ?? null),
    noted: checks.filter((c) => c.note).length,
  };
}
