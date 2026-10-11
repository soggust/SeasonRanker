// A prop CHECK evaluated again without a fresh price (libs/ranker/scripts/model/checks.mjs withStoredPrices,
// resolveChecks; run.mjs betProps and recordChecks): priced from its own stored prices while its line is still
// the board's (or the board shows none for him), never at an invented one; how it came out (still a CHECK,
// closed, or bet) kept on it as resolved; a stored price bet only while STORED_FRESH old; an owner's note not
// yet answered asks for it (by 'note'), or, the run unable to re-price it, is answered still with why (held);
// one off a board still showing his market (pulled) never bet from its stored price (storedBet), nor a stale
// one with The Odds API to hand; and picks.json's list carrying it, gone once closed or bet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORED_FRESH, checkOf, closeChecks, markPlaced, noteOpen, openCheck, priceAtOf, resolveChecks, storedBet, storedFresh, upsertCheck, withStoredPrices } from '../libs/ranker/scripts/model/checks.mjs';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';
import { buildPicks } from '../libs/ranker/scripts/model/picks.mjs';

const now = new Date('2026-10-11T15:00:00Z');
const game = { id: '401', date: '2026-10-12T00:20:00Z', home: '1', away: '33', homeAbbr: 'ATL', awayAbbr: 'BAL' };
const statOf = (key) => STATS.nfl.find((s) => s.key === key) ?? null;
const KEY = STATS.nfl[0].key;
const ID = `401:prop:${KEY}:3916`;
const ROLE = { skip: true, kind: 'role', role: 'backup-qb', why: "a backup quarterback: his role's changing" };
// (a prop CHECK at the book's prices, the under at -115 and the over at -105, written at 1am)
const propCheck = (over = {}) =>
  checkOf(
    {
      id: ID,
      event: '401',
      sport: 'nfl',
      start: game.date,
      placedAt: '2026-10-11T06:00:00Z',
      priceAt: '2026-10-11T06:00:00Z',
      matchup: 'BAL @ ATL',
      market: 'prop',
      propType: KEY,
      statLabel: 'Pass Yds',
      player: 'Tyler Huntley',
      athlete: '3916',
      team: '33',
      side: 'under',
      line: 180.5,
      odds: -115,
      otherOdds: -105,
      oddsAssumed: false,
      pricesFrom: 'the odds api',
      model: 0.8,
      fair: 0.52,
      p: 0.52,
      ev: -0.02,
      units: 0.5,
      intent: 'edge',
      status: 'open',
      profit: 0,
      pick: 'Tyler Huntley Under 180.5 Pass Yds',
      ...over,
    },
    ROLE,
  );
const row = (over = {}) => ({ athlete: { id: '3916', name: 'Tyler Huntley', pos: 'QB', team: '33' }, stat: statOf(KEY), line: 180.5, open: 175.5, prices: null, ...over });
const ledgerOf = (c = propCheck()) => {
  const ledger = { bets: [] };
  upsertCheck(ledger, c, new Date('2026-10-11T06:00:00Z'));
  return ledger;
};
const beforeOf = (ledger) => ({ bet: new Set(ledger.checks.filter((c) => c.bet).map((c) => c.id)), closed: new Set(ledger.checks.filter((c) => c.closedAt).map((c) => c.id)) });

test("withStoredPrices: an unpriced prop whose open CHECK's line is the board's priced from the CHECK's own two prices, the side's and the other's", () => {
  const ledger = ledgerOf();
  const { board, used, moved } = withStoredPrices([row(), row({ athlete: { id: '9', name: 'Other', team: '1' } })], ledger.checks, game, now, statOf);
  assert.deepEqual(board[0].prices, { over: -105, under: -115 });
  assert.deepEqual(board[0].stored, { id: ID, at: '2026-10-11T06:00:00Z' });
  assert.equal(board[0].open, 175.5);
  // (another player's prop left as it was: no CHECK, no price)
  assert.equal(board[1].prices, null);
  assert.deepEqual([...used.keys()], [ID]);
  assert.equal(moved.size, 0);
});

test('withStoredPrices: the line moved on the board, nothing priced (the CHECK is not evaluated again); a fresh price is left alone', () => {
  const ledger = ledgerOf();
  const movedRun = withStoredPrices([row({ line: 165.5 })], ledger.checks, game, now, statOf);
  assert.equal(movedRun.board[0].prices, null);
  assert.equal(movedRun.board[0].stored, undefined);
  assert.deepEqual([...movedRun.moved], [ID]);
  assert.equal(movedRun.used.size, 0);
  const fresh = withStoredPrices([row({ prices: { over: -110, under: -110 }, source: 'the odds api' })], ledger.checks, game, now, statOf);
  assert.deepEqual(fresh.board[0].prices, { over: -110, under: -110 });
  assert.equal(fresh.used.size, 0);
});

test("withStoredPrices: the board showing none for him, his prop is the CHECK's, off the board; never a price it didn't keep", () => {
  const ledger = ledgerOf();
  const { board, used } = withStoredPrices([], ledger.checks, game, now, statOf);
  assert.equal(board.length, 1);
  assert.deepEqual([board[0].athlete.id, board[0].athlete.team, board[0].line, board[0].stored.offBoard], ['3916', '33', 180.5, true]);
  assert.deepEqual(board[0].prices, { over: -105, under: -115 });
  assert.equal(used.size, 1);
  // (an assumed -110, no other side's price, closed, bet, graded, locked or another game's: none)
  for (const c of [propCheck({ oddsAssumed: true }), propCheck({ otherOdds: undefined })]) assert.equal(withStoredPrices([row()], ledgerOf(c).checks, game, now, statOf).used.size, 0);
  for (const mark of [{ closedAt: now.toISOString() }, { bet: { at: now.toISOString() } }, { checkResult: { status: 'won' } }]) {
    const l = ledgerOf();
    Object.assign(l.checks[0], mark);
    assert.equal(withStoredPrices([row()], l.checks, game, now, statOf).used.size, 0);
  }
  assert.equal(withStoredPrices([row()], ledgerOf().checks, game, new Date(Date.parse(game.date) - 10 * 60e3), statOf).used.size, 0);
  assert.equal(withStoredPrices([row()], ledgerOf().checks, { ...game, id: '402' }, now, statOf).used.size, 0);
  assert.equal(openCheck(ledgerOf().checks[0], now), true);
});

test('a stored-price re-evaluation still a CHECK: written again with its new projection and model, its price time kept, resolved still (once, not each run)', () => {
  const ledger = ledgerOf();
  const before = beforeOf(ledger);
  // (the run: priceProps on the stored price, the role guard still on; its new numbers)
  const again = propCheck({ placedAt: now.toISOString(), model: 0.66, fair: 0.52, projection: { mean: 150.2 }, pricesFrom: 'its CHECK (the odds api)' });
  assert.equal(upsertCheck(ledger, again, now), 'updated');
  const n = resolveChecks(ledger, new Map([[ID, 'reprice']]), before, now);
  assert.deepEqual([n.still, n.closed, n.bet], [1, 0, 0]);
  const c = ledger.checks[0];
  assert.deepEqual(c.resolved, { at: now.toISOString(), as: 'still', by: 'reprice' });
  assert.equal(c.model, 0.66);
  assert.equal(c.projection.mean, 150.2);
  // (the stored price's time, not the run's: STORED_FRESH reads it)
  assert.equal(priceAtOf(c), '2026-10-11T06:00:00Z');
  // (the next run, still: not written again)
  const later = new Date(now.getTime() + 3600e3);
  resolveChecks(ledger, new Map([[ID, 'reprice']]), beforeOf(ledger), later);
  assert.equal(c.resolved.at, now.toISOString());
  // (picks.json's row carries it: the page's note answered)
  assert.deepEqual(buildPicks('nfl', ledger, {}, new Map(), later, {}).checks[0].resolved, { at: now.toISOString(), as: 'still', by: 'reprice' });
  // (written again, its resolved kept)
  upsertCheck(ledger, propCheck({ placedAt: later.toISOString(), model: 0.9 }), later);
  assert.equal(ledger.checks[0].resolved.as, 'still');
});

test('a stored-price re-evaluation no guard keeps a CHECK: closed, resolved closed; its row gone from picks.json', () => {
  const ledger = ledgerOf();
  const picks = (l) => buildPicks('nfl', l, {}, new Map(), now, {}).checks.map((c) => c.id);
  assert.deepEqual(picks(ledger), [ID]);
  const before = beforeOf(ledger);
  // (priced from the stored price, no CHECK kind: betProps' unchecked, closeChecks)
  assert.equal(closeChecks(ledger, new Set([ID]), now), 1);
  resolveChecks(ledger, new Map([[ID, 'reprice']]), before, now);
  assert.deepEqual(ledger.checks[0].resolved, { at: now.toISOString(), as: 'closed', by: 'reprice' });
  assert.deepEqual(picks(ledger), []);
});

test("a stored-price re-evaluation with an edge: bet at the stored price, resolved bet; the pick a normal one with its band, the CHECK's row gone", () => {
  const ledger = ledgerOf();
  const before = beforeOf(ledger);
  const { checkResult: _r, intent: _i, cause: _c, roleReason: _rr, reason: _re, gap: _g, diagnosis: _d, status: _s, firstAt: _f, n: _n, ...base } = ledger.checks[0];
  ledger.bets.push({ ...base, placedAt: now.toISOString(), status: 'open', intent: 'edge', units: 1, model: 0.58, p: 0.56, ev: 0.04, priceAt: '2026-10-11T06:00:00Z', pricesFrom: 'its CHECK (the odds api)' });
  // (recordChecks' order: markPlaced, then closeChecks, which leaves a bet one alone)
  assert.equal(markPlaced(ledger), 1);
  assert.equal(closeChecks(ledger, new Set([ID]), now), 0);
  const n = resolveChecks(ledger, new Map([[ID, 'note']]), before, now);
  assert.equal(n.bet, 1);
  assert.deepEqual(ledger.checks[0].resolved, { at: now.toISOString(), as: 'bet', by: 'note' });
  const out = buildPicks('nfl', ledger, {}, new Map(), now, {});
  assert.deepEqual(out.checks, []);
  assert.deepEqual(out.picks.map((p) => [p.id, p.level !== 'check']), [[ID, true]]);
});

test('storedFresh: a stored price bet with The Odds API to hand only while STORED_FRESH old', () => {
  assert.equal(STORED_FRESH, 6 * 3600e3);
  assert.equal(storedFresh('2026-10-11T10:00:00Z', now), true);
  assert.equal(storedFresh('2026-10-11T09:00:00Z', now), true);
  assert.equal(storedFresh('2026-10-11T06:00:00Z', now), false);
  assert.equal(storedFresh(null, now), false);
});

test("an owner's note not yet answered asks for the re-evaluation (by 'note'); answered, it doesn't; an edited one does again", () => {
  const ledger = ledgerOf();
  const c = ledger.checks[0];
  const note = { id: ID, reason: 'role', player: null, status: null, at: '2026-10-11T14:30:00Z' };
  assert.equal(noteOpen(c, note), true);
  assert.equal(noteOpen(c, null), false);
  // (nothing else changed: the same numbers, the note alone asks; still a CHECK, answered)
  assert.equal(upsertCheck(ledger, propCheck(), now), null);
  resolveChecks(ledger, new Map([[ID, noteOpen(c, note) ? 'note' : 'reprice']]), beforeOf(ledger), now);
  assert.deepEqual(c.resolved, { at: now.toISOString(), as: 'still', by: 'note' });
  assert.equal(noteOpen(c, note), false);
  // (the note edited after: open again; a reprice's still then never written over it)
  const edited = { ...note, at: '2026-10-11T15:30:00Z' };
  assert.equal(noteOpen(c, edited), true);
  const later = new Date('2026-10-11T16:00:00Z');
  resolveChecks(ledger, new Map([[ID, 'note']]), beforeOf(ledger), later);
  assert.equal(c.resolved.at, later.toISOString());
});

test("upsertCheck: the same price asked again moves its price time up (priceAt), nothing else written", () => {
  const ledger = ledgerOf();
  assert.equal(upsertCheck(ledger, propCheck({ placedAt: '2026-10-11T12:00:00Z', priceAt: '2026-10-11T12:00:00Z' }), now), null);
  assert.equal(ledger.checks[0].priceAt, '2026-10-11T12:00:00Z');
  assert.equal(ledger.checks[0].placedAt, '2026-10-11T06:00:00Z');
});

test("withStoredPrices: off a board that still shows his market (his other props, or the stat's for others), pulled; a board without the stat at all, not", () => {
  const ledger = ledgerOf();
  const OTHER = STATS.nfl.find((x) => x.key !== KEY).key;
  // (his other prop on the board, this one gone: the book took it down)
  const his = withStoredPrices([row({ stat: statOf(OTHER) })], ledger.checks, game, now, statOf);
  assert.deepEqual([his.board[1].stored.offBoard, his.board[1].stored.pulled], [true, true]);
  // (the stat's market for another player, his gone)
  const stat = withStoredPrices([row({ athlete: { id: '9', name: 'Other', team: '1' } })], ledger.checks, game, now, statOf);
  assert.equal(stat.board[1].stored.pulled, true);
  // (the board showing another stat for another player only, or nothing: it can't tell, not pulled)
  const other = withStoredPrices([row({ athlete: { id: '9', name: 'Other', team: '1' }, stat: statOf(OTHER) })], ledger.checks, game, now, statOf);
  assert.equal(other.board[1].stored.pulled, undefined);
  assert.equal(withStoredPrices([], ledger.checks, game, now, statOf).board[0].stored.pulled, undefined);
});

test("storedBet (betProps' bets loop): a stored price bet only while fresh with The Odds API to hand, and never one pulled; a fresh price's prop untouched", () => {
  const fresh = { id: ID, at: '2026-10-11T12:00:00Z' };
  const stale = { id: ID, at: '2026-10-11T06:00:00Z' };
  assert.equal(storedBet(undefined, true, now), null);
  assert.equal(storedBet(fresh, true, now), null);
  assert.equal(storedBet(stale, true, now), 'stale');
  assert.equal(storedBet({ id: ID }, true, now), 'stale');
  // (no key: the stored price the best there is)
  assert.equal(storedBet(stale, false, now), null);
  // (pulled: whatever its age or the key)
  for (const keyed of [true, false]) assert.equal(storedBet({ ...fresh, offBoard: true, pulled: true }, keyed, now), 'pulled');
  assert.equal(storedBet({ ...fresh, offBoard: true }, true, now), null);
});

test("a noted CHECK the run couldn't re-price: answered still with why (held), the note no longer open, picks.json carrying it; a later re-evaluation writes over it", () => {
  const ledger = ledgerOf();
  const c = ledger.checks[0];
  const note = { id: ID, reason: 'role', player: null, status: null, at: '2026-10-11T14:30:00Z' };
  const why = 'its line moved on the board, no fresh price for the new one yet';
  const n = resolveChecks(ledger, new Map(), beforeOf(ledger), now, new Map([[ID, why]]));
  assert.deepEqual([n.held, n.still], [1, 0]);
  assert.deepEqual(c.resolved, { at: now.toISOString(), as: 'still', by: 'note', held: why });
  assert.equal(noteOpen(c, note), false);
  assert.deepEqual(buildPicks('nfl', ledger, {}, new Map(), now, {}).checks[0].resolved, { at: now.toISOString(), as: 'still', by: 'note', held: why });
  // (re-evaluated later from its stored price: still, written over the held one)
  const later = new Date(now.getTime() + 3600e3);
  resolveChecks(ledger, new Map([[ID, 'reprice']]), beforeOf(ledger), later);
  assert.deepEqual(c.resolved, { at: later.toISOString(), as: 'still', by: 'reprice' });
  // (closed or bet already: nothing held on it)
  const done = ledgerOf();
  done.checks[0].closedAt = now.toISOString();
  assert.equal(resolveChecks(done, new Map(), beforeOf(done), now, new Map([[ID, why]])).held, 0);
  assert.equal(done.checks[0].resolved, undefined);
});
