// The CHECK picks: the markets the desk won't bet because the model is too far from the book (desk.mjs
// gapGuard, a game market's; props.mjs priceProps' gap guard, a prop's), or (an NFL prop's) because the player's
// role is changing (props.mjs roleChangeOf: the book reprices a role on the news, the model on the logs, so it's
// bet neither way till these show the model can read one), kept anyway as a hypothetical, so the owner can look
// into them and the desk learns whether they'd have won.
//
//   cause    why it's a CHECK: 'gap' or 'role' (an older one without it, the gap's), a role's sub-reason in
//            roleReason (backup-qb, qb-change, few-starts, qb1-out, group-out, snap-jump, part-time, line); checkSummary tallies both
//            apart, so the gap's hit rate stays the gap's
//   what     a CHECK is the market as it stood: the model's side (the side its chance is over the book's
//            fair chance; past the gap the lean is tapered to nothing, so the side the desk would price best
//            is only the cheaper vig), its line, its price and the other side's, the model's and the fair
//            chances and the gap between them, its projection (a prop's) or expected score, its context, and
//            the guard's words as its reason. Kept apart from the bets, in their own file (model/checks.json,
//            { sport, checks }: the ledger the wallet and the Algorithm tab fetch stays the size it was; the
//            run reads it as ledger.checks, and an older ledger's checks move there): no units staked, so it's
//            never in the record, the profit, the trust fit, the caps or the CLV
//   only     the gap guard alone: a market another guard would skip too (a line moved twice the limit, a long
//            shot, a juiced assumed price) isn't a CHECK, so the hit rate is the gap's alone; a role's ahead of
//            the gap (a role change with a gap is the role's)
//   when     recorded the run it's skipped, and written again by a later run only while it isn't locked
//            (REPRICE_BY before the start, timing.mjs) and only when something material changed (its side,
//            line or price, the model or the book moved a point or more, an owner's note): so the picks don't
//            churn every hour with the refits' small moves; the prices it stood at before, as the page showed
//            them (earlier: { at, side, line, odds, otherOdds }, the last EARLIER_KEPT), so a bet taken at one
//            of them still matches the board when it's settled (settle-lib.mjs botObservations)
//   graded   once its game is final, as a bet would be, at a unit, in checkResult ({ status, profit, final,
//            actual (a prop's), void, gradedAt }): what it would have done, never in the record
//   closed   when a later run prices its market and neither the gap guard nor the role guard skips it (the
//            model came back toward the book, the role settled, or another guard skips it now) before it's
//            locked: closedAt, off the page, still
//            graded but tallied apart (checkSummary's closed), out of the hit rate; a later gap opens it again
//   trimmed  a graded one, TRIM_AFTER on, loses its context and all of its projection but the mean (checkTrim):
//            the file stays small over a season, the tally untouched
//   placed   when its market is bet after all (the gap closed, or an owner's note priced it again), the bet
//            it became is noted on it (bet) and the page stops showing it as a CHECK; it's still graded
//   repriced a prop's, a run with no fresh price for it (the NFL's board has none; The Odds API not asked for
//            its game this run) prices it from its own stored prices (withStoredPrices: its side's and the
//            other's, never an assumed -110), only while its line is still the board's (or the board shows
//            none for him): its projection and every guard run again as for a priced prop, so it's written
//            again (still a CHECK), closed (no guard keeps it one), or bet (as any prop: its timing, news and
//            caps; with The Odds API to hand only at a stored price STORED_FRESH old or less (priceAt: when the
//            API last gave it), else only closed, the bet left to the next ask). An owner's note not yet
//            answered (noteOpen) is answered the same way the next run, its line moved owing its game an ask
//            (run.mjs betProps). One off a board that still shows his market (his other props, or the stat's
//            for others: pulled, the book took it down) is never bet from its stored price, only kept or closed
//            (storedBet). How it came out kept on it (resolveChecks: resolved { at, as: bet | closed | still,
//            by: note | reprice }), the page's "Noted" till then; a noted one the run couldn't re-price (no
//            price kept, its line moved and not asked again, waiting on the news) answered still, with why
//            (held), so the page doesn't promise a re-price that isn't coming
//   diagnosis what drives its disagreement with the book (check-learn.mjs diagnose: a cause, its sub-reason
//            and its numbers), made with it (checkOf) and kept through its trimming; an older one's given the
//            next run's while nothing else changes. The graded ones' hit rate by cause and the recommendations
//            they make: check-learn.mjs checkLearning (state.json's checks.learning)
//   research a news finding on it (research.mjs: CHECK_RESEARCH=1 only), made once and kept (research)
//   notes    an owner's note on it (notes.mjs, Firestore's deskNotes/{id}) kept on it (note: notes.mjs
//            publicNote's fields alone, never its words or its writer, the file being public), so its result
//            is the note's outcome: checkSummary tallies them by reason, a closed one's too, for tuning the gap later

import { diagnose } from './check-learn.mjs';
import { round } from './ratings.mjs';
import { REPRICE_BY } from './timing.mjs';

// (the most CHECK picks the page shows a sport, the biggest gap first)
export const CHECK_TOP = 20;

// (a CHECK locked: its game starts within REPRICE_BY, or has started; nothing writes it again from here)
export const checkLocked = (c, now) => Date.parse(c.start) - now.getTime() <= REPRICE_BY;

// (how long after its grading a CHECK keeps its context and projection: checkTrim)
export const TRIM_AFTER = 3 * 24 * 3600e3;

// (the guards whose skip is kept as a CHECK: the gap (desk.mjs gapGuard, props.mjs) and a role changing (an NFL
// prop's: props.mjs roleChangeOf); a CHECK's cause, an older one's the gap)
export const CHECK_KINDS = new Set(['gap', 'role']);
export const causeOf = (guard) => (guard?.kind === 'role' ? 'role' : 'gap');

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
  const c = {
    ...rest,
    intent: 'check',
    units: 0,
    gap: round(bet.model - bet.fair, 4),
    // (why it's a CHECK: the gap, or his role changing (a prop's, props.mjs roleChangeOf: its sub-reason))
    cause: causeOf(guard),
    ...(guard?.kind === 'role' && guard.role ? { roleReason: guard.role } : {}),
    reason: guard?.why ?? 'too far from the market',
    status: 'check',
    profit: 0,
  };
  // (what drives the disagreement: check-learn.mjs diagnose, from its own numbers; a failure leaves none, and
  // the learning diagnoses it later)
  try {
    const d = diagnose(c);
    if (d) c.diagnosis = d;
  } catch {
    // (none kept)
  }
  return c;
}

// (how many of a CHECK's earlier prices it keeps: an hourly bettor's moves before the lock, with room over)
export const EARLIER_KEPT = 16;

// (a CHECK's price as the page showed it: its side, line and the two prices)
const priceOf = (c) => ({ at: c.placedAt, side: c.side, line: c.line ?? null, odds: c.odds, otherOdds: c.otherOdds ?? null });
const samePrice = (a, b) => a.side === b.side && (a.line ?? null) === (b.line ?? null) && a.odds === b.odds && (a.otherOdds ?? null) === (b.otherOdds ?? null);

// (what a CHECK's material facts are: the ones whose change writes it again)
const material = (c) => [c.cause ?? 'gap', c.roleReason ?? '', c.side, c.line, c.odds, c.otherOdds ?? null, Math.round(c.model * 100), Math.round(c.fair * 100), c.note ? `${c.note.reason}:${c.note.player ?? ''}:${c.note.status ?? ''}:${c.note.at ?? ''}` : ''].join('|');

// A run's CHECK added to the ledger's (ledger.checks), or the one there written again: only while it's open
// (not graded), not locked, and something material changed; its first time kept (firstAt) and how many times
// it was written (n). One closed (closeChecks) is opened again: the gap is back. Returns 'new', 'updated' or null
export function upsertCheck(ledger, check, now) {
  ledger.checks ??= [];
  const at = ledger.checks.findIndex((c) => c.id === check.id);
  if (at < 0) {
    ledger.checks.push({ ...check, firstAt: check.placedAt, n: 1 });
    return 'new';
  }
  const was = ledger.checks[at];
  if (was.checkResult || checkLocked(was, now)) return null;
  // (its research kept: research.mjs, a finding made once; and how its last re-evaluation came out: resolved)
  const next = { ...check, ...(was.note ? { note: was.note } : {}), ...(was.bet ? { bet: was.bet } : {}), ...(was.research ? { research: was.research } : {}), ...(was.resolved ? { resolved: was.resolved } : {}) };
  if (!was.closedAt && material(next) === material(was)) {
    // (an older one without a diagnosis given this run's, nothing else written)
    if (!was.diagnosis && check.diagnosis) was.diagnosis = check.diagnosis;
    // (the same price asked of The Odds API again: when it was last seen moved up, so a run that prices it
    // from this CHECK knows how old it is (STORED_FRESH))
    if (check.priceAt && !(Date.parse(was.priceAt ?? '') >= Date.parse(check.priceAt))) was.priceAt = check.priceAt;
    return null;
  }
  // (the price it stood at, kept when this one's another)
  const earlier = [...(Array.isArray(was.earlier) ? was.earlier : []), ...(samePrice(was, next) ? [] : [priceOf(was)])].slice(-EARLIER_KEPT);
  ledger.checks[at] = { ...next, ...(earlier.length ? { earlier } : {}), firstAt: was.firstAt ?? was.placedAt, n: (was.n ?? 1) + 1 };
  return 'updated';
}

// The CHECKs whose markets this run priced without the gap guard skipping them (ids): closed, the gap gone
// (closedAt), only while open, not bet and not locked (it's graded as it stood then). Returns how many
export function closeChecks(ledger, ids, now) {
  let n = 0;
  for (const c of ledger.checks ?? []) {
    if (!ids.has(c.id) || c.checkResult || c.bet || c.closedAt || checkLocked(c, now)) continue;
    c.closedAt = now.toISOString();
    n++;
  }
  return n;
}

// (a CHECK still to be priced again: not graded, closed, bet or locked)
export const openCheck = (c, now) => !!c && !c.checkResult && !c.closedAt && !c.bet && !checkLocked(c, now);

// (how old a CHECK's stored price may be and still be bet at, with The Odds API to hand: a real price that
// recent stands in for the one the run didn't ask for; older, the CHECK is only closed, the bet left to the next
// ask. When it was priced: priceAt, The Odds API's ask (an older one without it, when it was last written))
export const STORED_FRESH = 6 * 3600e3;
export const priceAtOf = (c) => c?.priceAt ?? c?.placedAt ?? null;
export const storedFresh = (at, now) => now.getTime() - Date.parse(at ?? '') <= STORED_FRESH;

// (whether a prop priced from its CHECK's stored price (withStoredPrices' stored) may be bet: null if so, else
// why not: 'pulled' (off a board that still shows his market: the book took it down, on news as often as not,
// whatever the price's age) or 'stale' (with The Odds API to hand, keyed, older than STORED_FRESH). Either way
// its CHECK is still evaluated, kept or closed; a prop with a price of its own this run (no stored), null)
export function storedBet(stored, keyed, now) {
  if (!stored) return null;
  if (stored.pulled) return 'pulled';
  if (keyed && !storedFresh(stored.at, now)) return 'stale';
  return null;
}

// (a CHECK's owner's note not yet answered by a re-evaluation: its note (notes.mjs, the run's read of it) later
// than its last resolved, or none resolved)
export const noteOpen = (c, note) => !!note && !(Date.parse(c?.resolved?.at ?? '') >= (Date.parse(note.at ?? '') || 0));

// A game's prop board with its open CHECKs' stored prices on it: a prop the run has no price for (the NFL's
// board has none of its own; The Odds API not asked for its game this run) priced from its CHECK's (its side's
// odds and the other side's, the book's as the CHECK kept them), only where the CHECK's line is still the one
// the board shows, or the board shows none for him (then his prop is the CHECK's, its line and its open, off
// the board: offBoard, left out of the board's players; pulled too when the board still shows his market, his
// other props or the stat's for others, so the book took his down: storedBet). Never invented: a CHECK at an assumed -110, or without
// both prices, gives none. checks: the ledger's; statOf(key): the stat a CHECK's propType names. Returns
// { board, used: Map(id -> the price's time), moved: Set(ids: the line moved, nothing priced) }
export function withStoredPrices(board_, checks, game, now, statOf) {
  const used = new Map();
  const moved = new Set();
  const out = [...board_];
  for (const c of checks ?? []) {
    if (c.market !== 'prop' || String(c.event) !== String(game.id) || !openCheck(c, now)) continue;
    if (c.oddsAssumed || !Number.isFinite(c.odds) || !Number.isFinite(c.otherOdds) || !Number.isFinite(c.line) || (c.side !== 'over' && c.side !== 'under')) continue;
    const prices = c.side === 'over' ? { over: c.odds, under: c.otherOdds } : { over: c.otherOdds, under: c.odds };
    const at = priceAtOf(c);
    const stored = { id: c.id, at };
    const i = out.findIndex((p) => String(p.athlete?.id) === String(c.athlete) && p.stat?.key === c.propType);
    if (i >= 0) {
      const p = out[i];
      // (a price of its own this run: the fresh one prices it)
      if (p.prices) continue;
      if (p.line !== c.line) {
        moved.add(c.id);
        continue;
      }
      out[i] = { ...p, prices, source: 'its CHECK (the odds api)', stored };
    } else {
      const stat = statOf(c.propType);
      if (!stat || !c.athlete) continue;
      const pulled = board_.some((p) => String(p.athlete?.id) === String(c.athlete) || p.stat?.key === c.propType);
      out.push({ athlete: { id: String(c.athlete), name: c.player, pos: '', team: c.team ?? null }, stat, line: c.line, open: c.context?.move?.open ?? null, prices, source: 'its CHECK (the odds api)', stored: { ...stored, offBoard: true, ...(pulled ? { pulled: true } : {}) } });
    }
    used.set(c.id, at);
  }
  return { board: out, used, moved };
}

// How each CHECK re-evaluated this run came out (reEval: id -> 'note' | 'reprice', the note's when an owner's
// note unanswered asked for it): bet (its market bet this run: markPlaced), closed (closeChecks, this run) or
// still a CHECK; kept on it as resolved { at, as, by }. before: the ids bet and closed before this run's
// recording. A reprice's 'still' written once, not each run, so the file doesn't churn. held: id -> why, an
// open one with an owner's note unanswered the run couldn't re-price (run.mjs betProps): answered still, its
// why kept (held), so the note isn't left "Noted" for a re-price that isn't coming; a later re-evaluation
// writes over it. Returns the counts and each one's outcome (items: { check, as, by, held? })
export function resolveChecks(ledger, reEval, before, now, held = null) {
  const n = { bet: 0, closed: 0, still: 0, held: 0, items: [] };
  const at = now.toISOString();
  for (const c of ledger.checks ?? []) {
    const by = reEval?.get(c.id);
    const why = by ? null : held?.get(c.id);
    if (why && !c.checkResult && !c.bet && !c.closedAt) {
      n.held++;
      n.items.push({ check: c, as: 'still', by: 'note', held: why });
      c.resolved = { at, as: 'still', by: 'note', held: why };
      continue;
    }
    if (!by || c.checkResult) continue;
    const as = c.bet && !before.bet.has(c.id) ? 'bet' : c.closedAt && !before.closed.has(c.id) ? 'closed' : !c.bet && !c.closedAt ? 'still' : null;
    if (!as) continue;
    n[as]++;
    n.items.push({ check: c, as, by });
    if (as === 'still' && by === 'reprice' && c.resolved?.as === 'still' && !c.resolved.held) continue;
    c.resolved = { at, as, by };
  }
  return n;
}

// The graded CHECKs' bulk dropped TRIM_AFTER after their grading (their context, their projection but its
// mean): what they'd have done and the tally kept. Returns how many
export function checkTrim(checks = [], now) {
  let n = 0;
  for (const c of checks) {
    const at = Date.parse(c.checkResult?.gradedAt ?? '');
    if (!(now.getTime() - at >= TRIM_AFTER) || c.trimmed) continue;
    delete c.context;
    if (c.projection) c.projection = { mean: c.projection.mean ?? null };
    c.trimmed = true;
    n++;
  }
  return n;
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
// tuning the gap). The closed ones (the gap closed before the lock) tallied apart (closed), out of the rest;
// by reason too (each reason's closed), so a note whose CHECK closed (the bot came round to it) still counts
export function checkSummary(all = []) {
  const checks = all.filter((c) => !c.closedAt);
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
  const reasonOf = (c) => c.note?.reason ?? null;
  const shut = all.filter((c) => c.closedAt);
  const byReason = Object.fromEntries(
    [...new Set(all.map(reasonOf).filter(Boolean))].sort().map((k) => [k, { ...tally(checks.filter((c) => reasonOf(c) === k)), closed: tally(shut.filter((c) => reasonOf(c) === k)) }]),
  );
  return {
    ...tally(checks),
    byMarket: by((c) => (c.market === 'prop' ? `prop:${c.propType}` : c.market)),
    // (by why each is a CHECK (an older one's the gap), and a role's by its sub-reason)
    byCause: by((c) => c.cause ?? 'gap'),
    byRole: by((c) => (c.cause === 'role' ? (c.roleReason ?? 'role') : null)),
    byReason,
    noted: checks.filter((c) => c.note).length,
    closed: { ...tally(shut), noted: shut.filter((c) => c.note).length },
  };
}
