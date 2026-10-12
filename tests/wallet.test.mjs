// The play-money wallet: the Bets page's board read off ESPN's scoreboard, the slip's stakes and payouts, a bet
// in play settled by the score as the settler will settle it, the wallet's records and the comparison with the
// bot (wallet-math.ts); and the settler's own logic (libs/ranker/scripts/accounts/settle-lib.mjs): a bet settled
// from a final by the bettor's rules, the price check against the board, the tallies and the leaderboards.
// No network, no Firestore: the games and boards here are made up (the settler against the emulator:
// tests/rules/wallet-settle.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';
import * as lib from '../libs/ranker/scripts/accounts/settle-lib.mjs';

const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/wallet-entry.ts'), data: {} });

// ---------------------------------------------------------------------------
// A made-up scoreboard event, ESPN's shape (DraftKings' lines: close is the current one)
// ---------------------------------------------------------------------------
const side = (close, open = close) => ({ close, open });
function espnEvent({ id = '401', state = 'pre', completed = false, name = 'STATUS_SCHEDULED', hs = '', as = '', odds = true } = {}) {
  return {
    id,
    date: '2026-10-11T17:00Z',
    competitions: [
      {
        competitors: [
          { homeAway: 'home', score: hs, team: { abbreviation: 'NE', displayName: 'New England Patriots', logo: 'ne.png' } },
          { homeAway: 'away', score: as, team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders', logo: 'lv.png' } },
        ],
        status: { type: { state, completed, name, shortDetail: state === 'in' ? 'Q3 4:12' : 'Sun 1:00 PM' } },
        odds: odds
          ? [
              {
                provider: { name: 'DraftKings' },
                overUnder: 45.5,
                moneyline: { home: side({ odds: '-175' }, { odds: '-160' }), away: side({ odds: '+145' }) },
                pointSpread: { home: side({ line: '-3.5', odds: '-110' }), away: side({ line: '+3.5', odds: 'EVEN' }) },
                total: { over: side({ line: 'o45.5', odds: '-105' }), under: side({ line: 'u45.5', odds: '-115' }) },
              },
            ]
          : [],
      },
    ],
  };
}

test('the board: every market both sides at DraftKings, from the scoreboard', () => {
  const b = w.boardOf('nfl', espnEvent());
  assert.equal(b.matchup, 'LV @ NE');
  assert.equal(b.state, 'pre');
  assert.deepEqual(b.spread.home, { market: 'spread', side: 'home', line: -3.5, odds: -110 });
  // (EVEN is +100)
  assert.deepEqual(b.spread.away, { market: 'spread', side: 'away', line: 3.5, odds: 100 });
  assert.deepEqual(b.total.over, { market: 'total', side: 'over', line: 45.5, odds: -105 });
  assert.equal(b.total.under.odds, -115);
  assert.deepEqual(b.ml.home, { market: 'ml', side: 'home', line: null, odds: -175 });
  assert.equal(b.ml.away.odds, 145);
  // (no lines: no markets; a score only once it's begun)
  const bare = w.boardOf('nfl', espnEvent({ odds: false }));
  assert.equal(bare.spread, null);
  assert.equal(bare.book, null);
  assert.equal(bare.home.score, null);
  const live = w.boardOf('nfl', espnEvent({ state: 'in', hs: '17', as: '10' }));
  assert.deepEqual([live.home.score, live.away.score, live.final], [17, 10, false]);
  // (a game called off is never final)
  const off = w.boardOf('nfl', espnEvent({ state: 'post', completed: true, name: 'STATUS_POSTPONED', hs: '0', as: '0' }));
  assert.equal(off.final, false);
  assert.equal(w.priceOf('+120'), 120);
  assert.equal(w.priceOf('EVEN'), 100);
  assert.equal(w.priceOf(''), null);
  assert.equal(w.priceOf('50'), null);
  assert.equal(w.lineOf('PK'), 0);
  assert.equal(w.lineOf('u8.5'), 8.5);
});

test('the words: a bet as the bettor writes its own', () => {
  assert.equal(w.pickWords({ market: 'spread', side: 'away', line: 3.5 }, 'LV @ NE'), 'LV +3.5');
  assert.equal(w.pickWords({ market: 'spread', side: 'home', line: -3.5 }, 'LV @ NE'), 'NE -3.5');
  assert.equal(w.pickWords({ market: 'spread', side: 'home', line: 0 }, 'LV @ NE'), 'NE PK');
  assert.equal(w.pickWords({ market: 'total', side: 'under', line: 45.5 }, 'LV @ NE'), 'Under 45.5');
  assert.equal(w.pickWords({ market: 'ml', side: 'away', line: null }, 'LV @ NE'), 'LV ML');
  assert.equal(w.pickWords({ market: 'prop', side: 'over', line: 24.5, player: 'John Gibson', statLabel: 'Saves' }, 'SEA @ DET'), 'John Gibson Over 24.5 Saves');
  assert.equal(w.oddsText(150), '+150');
  assert.equal(w.oddsText(-110), '-110');
  // (ESPN files a game by its day in US Eastern time: a 7:30 PM Pacific start is the next day in UTC)
  assert.equal(w.espnDay('2026-10-12T02:30:00Z'), '20261011');
});

test('the slip: what a stake wins and pays, the totals, the chips, the stake rules', () => {
  assert.equal(w.toWin(10, -110), 9.09);
  assert.equal(w.toWin(10, 150), 15);
  assert.equal(w.toWin(25, 100), 25);
  assert.equal(w.payout(10, -110), 19.09);
  assert.equal(w.payout(100, 235), 335);
  assert.deepEqual(w.slipTotals([{ stake: 10, odds: -110 }, { stake: 5, odds: 200 }, { stake: 0, odds: -120 }]), { count: 2, stake: 15, toWin: 19.09, payout: 34.09 });
  // (chips stack, never past what's left)
  assert.equal(w.addChip(0, 25, 1000), 25);
  assert.equal(w.addChip(25, 100, 1000), 125);
  assert.equal(w.addChip(90, 25, 100), 100);
  assert.equal(w.addChip(5, 5, 7.5), 7.5);
  assert.equal(w.addChip(0, 0.5, 1000), 0.5, 'the half chip');
  assert.equal(w.addChip(5, 5, 7.75), 7.5, 'never past what is left, in halves');
  assert.equal(w.stakeProblem(0, 1000), 'Set a stake');
  assert.equal(w.stakeProblem(2.5, 1000), null, 'a half unit is fine');
  assert.equal(w.stakeProblem(2.25, 1000), 'Half units only');
  assert.equal(w.stakeProblem(600, 1000, 500), 'Only 500 units left');
  assert.equal(w.stakeProblem(1, 0.5), 'Only 0.5 units left');
  assert.equal(w.stakeProblem(1, 0.25), 'Not enough in the wallet');
  assert.equal(w.stakeProblem(500, 1000, 500), null);
  // (a game can be bet only before it begins)
  const now = Date.parse('2026-10-11T16:00Z');
  assert.equal(w.bettable('2026-10-11T17:00Z', 'pre', now), true);
  assert.equal(w.bettable('2026-10-11T17:00Z', 'in', now), false);
  assert.equal(w.bettable('2026-10-11T15:00Z', undefined, now), false);
  assert.equal(w.selectionKey({ sport: 'nfl', event: '401', market: 'spread', side: 'home' }), 'nfl|401|spread|home||');
});

const bet = (over = {}) => ({
  id: 'b1',
  sport: 'nfl',
  event: '401',
  matchup: 'LV @ NE',
  start: '2026-10-11T17:00Z',
  market: 'spread',
  side: 'home',
  line: -3.5,
  odds: -110,
  stake: 10,
  pick: 'NE -3.5',
  run: 0,
  placedAt: '2026-10-10T12:00:00.000Z',
  status: 'open',
  ...over,
});

test('in play: a bet decided by the score before the settler pays it, as desk-math decides the bot’s', () => {
  const board = (hs, as, final, state = final ? 'post' : 'in', completed = final) =>
    w.boardOf('nfl', espnEvent({ state, completed, name: final ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS', hs: String(hs), as: String(as) }));
  // (a spread: only once it's final)
  assert.equal(w.provisionalOf(bet(), board(24, 10, false), null), null);
  assert.deepEqual(w.provisionalOf(bet(), board(24, 10, true), null), { status: 'won', profit: 9.09 });
  assert.deepEqual(w.provisionalOf(bet(), board(20, 17, true), null), { status: 'lost', profit: -10 });
  // (a total: the over home as soon as the scoring's past the line)
  assert.deepEqual(w.provisionalOf(bet({ market: 'total', side: 'over', line: 45.5, odds: 100 }), board(28, 21, false), null), { status: 'won', profit: 10 });
  assert.equal(w.provisionalOf(bet({ market: 'total', side: 'over', line: 45.5 }), board(21, 21, false), null), null);
  // (a moneyline's push on a tie; a prop past its line)
  assert.deepEqual(w.provisionalOf(bet({ market: 'ml', line: null, odds: -175 }), board(20, 20, true), null), { status: 'push', profit: 0 });
  assert.deepEqual(w.provisionalOf(bet({ market: 'prop', side: 'over', line: 24.5, propType: 'saves' }), board(1, 1, false), 26), { status: 'won', profit: 9.09 });
  assert.equal(w.provisionalOf(bet({ status: 'won' }), board(24, 10, true), null), null);
  assert.equal(w.provisionalOf(bet(), undefined, null), null);
});

test('in play: an open bet’s live column, as the Algorithm’s In Play (a meter for a prop or a total, a side at the score)', () => {
  const board = (hs, as, final, state = final ? 'post' : 'in') =>
    w.boardOf('nfl', espnEvent({ state, completed: final, name: final ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS', hs: String(hs), as: String(as) }));
  // (nothing before the game's under way)
  assert.equal(w.liveOf(bet(), w.boardOf('nfl', espnEvent()), null), null);
  assert.equal(w.liveOf(bet(), undefined, null), null);
  // (a spread: covering or short at the score, colored by how far; once it's final, how it came out)
  const covering = w.liveOf(bet(), board(14, 7, false), null);
  assert.deepEqual([covering.count, covering.text, covering.title], [null, 'Covering by 3.5', 'Covering by 3.5']);
  assert.ok(covering.color.includes('var(--win)'));
  assert.equal(w.liveOf(bet(), board(7, 7, false), null).text, 'Short by 3.5');
  assert.equal(w.liveOf(bet(), board(24, 10, true), null).text, 'Won');
  // (a moneyline: leading or trailing; level, uncolored)
  assert.equal(w.liveOf(bet({ market: 'ml', side: 'away', line: null }), board(10, 3, false), null).text, 'Trailing by 7');
  assert.equal(w.liveOf(bet({ market: 'ml', line: null }), board(3, 3, false), null).color, null);
  // (a total: the game's points against the line, a bar; the under lost once it's past)
  const under = w.liveOf(bet({ market: 'total', side: 'under', line: 44.5 }), board(28, 21, false), null);
  assert.deepEqual([under.count, under.state, under.text, !!under.meter.pips], [49, 'lost', '49 / 44.5 pts', false]);
  // (a short prop: pips, one a unit up to the one past the line, lit as they come)
  const catches = w.liveOf(bet({ market: 'prop', side: 'over', line: 4.5, propType: 'rec', statLabel: 'Receptions', player: 'A. Player' }), board(7, 3, false), 3);
  assert.deepEqual([catches.state, catches.text, catches.meter.pips.map((p) => p.on)], ['alive', '3 / 4.5 Receptions', [true, true, true, false, false, false]]);
  // (a prop whose player isn't in the box score yet: no count, just under way)
  assert.equal(w.liveOf(bet({ market: 'prop', side: 'over', line: 4.5, propType: 'rec' }), board(7, 3, false), null).text, 'Under way');
});

test('the wallet’s record: won, lost, pushed and void; staked, profit, return; at risk; the curve', () => {
  const list = [
    bet({ id: 'a', status: 'won', profit: 9.09, settledAt: '2026-10-11T21:00Z' }),
    bet({ id: 'b', status: 'lost', profit: -10, stake: 10, settledAt: '2026-10-11T22:00Z' }),
    bet({ id: 'c', status: 'push', profit: 0, settledAt: '2026-10-11T23:00Z' }),
    bet({ id: 'd', status: 'void', profit: 0, note: 'price didn’t match the board' }),
    bet({ id: 'e', status: 'open', stake: 25 }),
  ];
  const t = w.playTally(list);
  assert.deepEqual({ ...t, roi: Math.round(t.roi * 1e4) / 1e4 }, { won: 1, lost: 1, push: 1, void: 1, open: 1, staked: 30, profit: -0.91, roi: -0.0303, atRisk: 25 });
  assert.equal(w.recordText(t), '1-1-1');
  assert.equal(w.recordText({ won: 3, lost: 2, push: 0 }), '3-2');
  const curve = w.playCurve(list);
  assert.deepEqual(curve.totals.map((v) => Math.round(v * 100) / 100), [0, 9.09, -0.91, -0.91]);
  const groups = w.byGame([bet({ id: 'x', event: '2', start: '2026-10-12T00:00Z' }), bet({ id: 'y' }), bet({ id: 'z', placedAt: '2026-10-09T00:00Z' })]);
  assert.deepEqual(
    groups.map((g) => [g.event, g.bets.map((b) => b.id)]),
    [
      ['401', ['z', 'y']],
      ['2', ['x']],
    ],
  );
});

test('the settled history by sport, as the Algorithm lists it: one sport, no heading; more, each in its latest game’s order', () => {
  const one = w.playBySport(w.byGame([bet({ id: 'a', status: 'won', profit: 9.09 }), bet({ id: 'b', status: 'lost', profit: -10 })], true));
  assert.deepEqual(one.map((s) => [s.sport, s.header, s.games.length, s.bets, s.profit]), [['nfl', false, 1, 2, -0.91]]);
  const games = w.byGame(
    [
      bet({ id: 'a', status: 'won', profit: 9.09 }),
      bet({ id: 'b', sport: 'nba', event: '9', start: '2026-10-12T00:00Z', status: 'lost', profit: -10 }),
      bet({ id: 'c', event: '5', start: '2026-10-09T00:00Z', status: 'won', profit: 5 }),
    ],
    true,
  );
  const many = w.playBySport(games);
  assert.deepEqual(many.map((s) => [s.sport, s.header, s.games.map((g) => g.event), s.bets, s.profit]), [
    ['nba', true, ['9'], 1, -10],
    ['nfl', true, ['401', '5'], 2, 14.09],
  ]);
});

test('you vs the bot: the bot’s published picks settled over the same stretch, by return on stakes', () => {
  const mine = [bet({ status: 'won', profit: 9.09, start: '2026-10-11T17:00Z' }), bet({ status: 'lost', profit: -10, start: '2026-10-12T17:00Z' })];
  const ledger = [
    { status: 'won', start: '2026-10-11T17:00Z', units: 2, profit: 1.8, published: true },
    { status: 'won', start: '2026-10-11T20:00Z', units: 1, profit: 0.91, published: true },
    { status: 'lost', start: '2026-10-12T17:00Z', units: 1, profit: -1, published: true },
    // (before the user's first bet, unpublished, void or open: not counted)
    { status: 'won', start: '2026-10-01T17:00Z', units: 1, profit: 1, published: true },
    { status: 'lost', start: '2026-10-11T17:00Z', units: 1, profit: -1 },
    { status: 'push', start: '2026-10-11T17:00Z', units: 1, profit: 0, published: true, void: true },
    { status: 'open', start: '2026-10-13T17:00Z', units: 1, profit: 0, published: true },
  ];
  const v = w.versusBot(mine, ledger);
  assert.equal(v.from, '2026-10-11T17:00Z');
  assert.deepEqual([v.you.won, v.you.lost, v.you.winPct], [1, 1, 0.5]);
  assert.equal(Math.round(v.you.roi * 1e4), -455);
  assert.deepEqual([v.bot.won, v.bot.lost], [2, 1]);
  assert.equal(Math.round(v.bot.roi * 1e4), 4275);
  assert.equal(w.versusBot([], ledger).from, null);
});

// ---------------------------------------------------------------------------
// The settler (settle-lib.mjs)
// ---------------------------------------------------------------------------
const game = (over = {}) => ({ id: '401', date: '2026-10-11T17:00Z', homeAbbr: 'NE', awayAbbr: 'LV', final: true, hs: 24, as: 20, ...over });
const now = Date.parse('2026-10-12T03:00Z');
const coreBody = {
  homeTeamOdds: {
    open: { pointSpread: { american: '-3' }, spread: { american: '-110' }, moneyLine: { american: '-160' } },
    close: { pointSpread: { american: '-3.5' }, spread: { american: '-108' }, moneyLine: { american: '-180' } },
  },
  awayTeamOdds: {
    open: { pointSpread: { american: '+3' }, spread: { american: '-110' }, moneyLine: { american: '+135' } },
    close: { pointSpread: { american: '+3.5' }, spread: { american: '-112' }, moneyLine: { american: '+150' } },
  },
  open: { total: { american: '44.5' }, over: { american: '-110' }, under: { american: '-110' } },
  close: { total: { american: '45.5' }, over: { american: '-105' }, under: { american: '-115' } },
};
const board = lib.coreObservations(coreBody);

test('the price check: the open, the close, the bot’s and the snapshots in their window; the line exact, the price within 10 cents', () => {
  assert.equal(lib.cents(-110), -10);
  assert.equal(lib.cents(120), 20);
  assert.ok(lib.priceNear(-105, -110));
  assert.ok(lib.priceNear(100, -110));
  assert.ok(!lib.priceNear(105, -110));
  // (a long price gets 4% of itself)
  assert.ok(lib.priceNear(800, 770));
  assert.ok(!lib.priceNear(800, 700));
  assert.equal(board.length, 12);
  // (the close's price, the open's line and price)
  assert.deepEqual(lib.checkPrice(bet({ odds: -108 }), board), { ok: true, by: 'close' });
  assert.deepEqual(lib.checkPrice(bet({ line: -3, odds: -110 }), board), { ok: true, by: 'open' });
  assert.equal(lib.checkPrice(bet({ line: -2.5 }), board).ok, false);
  assert.equal(lib.checkPrice(bet({ odds: 120 }), board).why, 'price didn’t match the board');
  assert.ok(lib.checkPrice(bet({ market: 'ml', side: 'away', line: null, odds: 150 }), board).ok);
  assert.ok(lib.checkPrice(bet({ market: 'total', side: 'under', line: 45.5, odds: -115 }), board).ok);
  // (a snapshot only within 3 hours of the bet)
  const snap = lib.observationsOf({ spread: { home: { line: -4, odds: -105 }, away: { line: 4, odds: -115 } }, total: { line: 46, over: -110, under: -110 }, ml: { home: -190, away: 160 } }, 'snap', Date.parse('2026-10-10T13:00Z'));
  assert.deepEqual(lib.checkPrice(bet({ line: -4, odds: -105 }), [...board, ...snap]), { ok: true, by: 'snap' });
  assert.equal(lib.checkPrice(bet({ line: -4, odds: -105, placedAt: '2026-10-10T20:00:00Z' }), [...board, ...snap]).ok, false);
  // (no board at all for the market: void, saying so)
  assert.match(lib.checkPrice(bet(), []).why, /no board/);
  // (a prop: the bot's own pick, its line and price)
  const bot = lib.botObservations([{ market: 'prop', side: 'under', propType: 'saves', athlete: 2590824, line: 24.5, odds: -110, placedAt: '2026-10-09T20:00Z', seen: { at: '2026-10-10T20:00Z', line: 24.5, odds: -125 } }]);
  const prop = bet({ market: 'prop', side: 'under', line: 24.5, odds: -110, propType: 'saves', athlete: '2590824' });
  assert.ok(lib.checkPrice(prop, bot).ok);
  assert.ok(lib.checkPrice({ ...prop, odds: -125 }, bot).ok);
  assert.equal(lib.checkPrice({ ...prop, line: 23.5 }, bot).ok, false);
  assert.equal(lib.checkPrice({ ...prop, athlete: '1' }, bot).ok, false);
});

test('settling: won, lost, pushed from the final by the bettor’s rules; void when it must be; null while it waits', () => {
  const opts = { observations: board, now };
  assert.deepEqual(lib.settlePlayBet(bet({ odds: -108 }), game(), opts), { status: 'won', profit: 9.26, final: 'LV 20 @ NE 24' });
  assert.deepEqual(lib.settlePlayBet(bet({ odds: -108 }), game({ hs: 23 }), opts).status, 'lost');
  assert.deepEqual(lib.settlePlayBet(bet({ line: -3, odds: -110 }), game({ hs: 23 }), opts), { status: 'push', profit: 0, final: 'LV 20 @ NE 23' });
  assert.deepEqual(lib.settlePlayBet(bet({ market: 'total', side: 'under', line: 45.5, odds: -115 }), game(), opts), { status: 'won', profit: 8.7, final: 'LV 20 @ NE 24' });
  assert.deepEqual(lib.settlePlayBet(bet({ market: 'ml', side: 'away', line: null, odds: 150 }), game(), opts), { status: 'lost', profit: -10, final: 'LV 20 @ NE 24' });
  // (not final yet: waits)
  assert.equal(lib.settlePlayBet(bet(), game({ final: false, hs: null, as: null }), opts), null);
  // (the price not on the board, placed after the start, not this game, called off)
  assert.deepEqual(lib.settlePlayBet(bet({ odds: 130 }), game(), opts), { status: 'void', profit: 0, note: 'price didn’t match the board' });
  assert.equal(lib.settlePlayBet(bet({ odds: -108, placedAt: '2026-10-11T17:30:00Z' }), game(), opts).note, 'placed after the start');
  assert.equal(lib.settlePlayBet(bet({ matchup: 'KC @ DEN' }), game(), opts).note, 'not this game');
  assert.equal(lib.settlePlayBet(bet(), game({ final: false, off: 'canceled', hs: null, as: null }), opts).note, 'game canceled');
  // (ESPN with no game: waits, then void after 3 days)
  assert.equal(lib.settlePlayBet(bet(), null, opts), null);
  assert.equal(lib.settlePlayBet(bet(), null, { ...opts, now: now + 4 * lib.DAY }).note, 'game not found');
  // (a prop: the count, or no action when he didn't play)
  const bot = lib.botObservations([{ market: 'prop', side: 'over', propType: 'saves', athlete: '9', line: 24.5, odds: -110, placedAt: '2026-10-09T20:00Z' }]);
  const prop = bet({ market: 'prop', side: 'over', line: 24.5, propType: 'saves', athlete: '9', player: 'John Gibson', statLabel: 'Saves' });
  assert.deepEqual(lib.settlePlayBet(prop, game(), { observations: bot, propValue: 27, now }), { status: 'won', profit: 9.09, final: 'John Gibson 27 Saves' });
  assert.equal(lib.settlePlayBet(prop, game(), { observations: bot, propValue: 20, now }).status, 'lost');
  assert.deepEqual(lib.settlePlayBet(prop, game(), { observations: bot, propValue: null, now }), { status: 'void', profit: 0, note: 'did not play' });
  assert.equal(lib.settlePlayBet(prop, game(), { observations: bot, propValue: undefined, now }), null);
  assert.equal(lib.settlePlayBet(prop, game(), { observations: bot, propValue: undefined, now: now + 4 * lib.DAY }).note, 'couldn’t read the stat');
  // (what goes back in the wallet)
  assert.equal(lib.creditOf(10, { status: 'won', profit: 9.09 }), 19.09);
  assert.equal(lib.creditOf(10, { status: 'lost', profit: -10 }), 0);
  assert.equal(lib.creditOf(10, { status: 'push', profit: 0 }), 10);
  assert.equal(lib.creditOf(10, { status: 'void', profit: 0 }), 10);
});

test('the tallies and the leaderboards: public players only, by profit, by period', () => {
  let t = lib.addToTally(null, bet(), { status: 'won', profit: 9.09 });
  t = lib.addToTally(t, bet({ start: '2026-10-05T17:00Z', stake: 20 }), { status: 'lost', profit: -20 });
  t = lib.addToTally(t, bet(), { status: 'void', profit: 0 });
  assert.deepEqual(t.all, { won: 1, lost: 1, push: 0, void: 1, staked: 30, profit: -10.91 });
  assert.deepEqual(t.days, { '2026-10-11': [1, 0, 0, 10, 9.09], '2026-10-05': [0, 1, 0, 20, -20] });
  // (Monday to Sunday, US Eastern; the season from August 1)
  const p = lib.periodsAt(Date.parse('2026-10-12T03:00Z'));
  assert.equal(p.week.from, '2026-10-05');
  assert.equal(p.season.from, '2026-08-01');
  assert.equal(p.season.label, '2026-27 season');
  assert.equal(lib.periodsAt(Date.parse('2027-03-01T12:00Z')).season.from, '2026-08-01');
  const profile = (username, betHistory = 'public', photo = null) => ({ username, displayName: username, photo, visibility: { betHistory } });
  const entries = [
    { uid: 'a', profile: profile('ace', 'public', { kind: 'upload', url: 'data:image/webp;base64,AAAA' }), tally: t },
    { uid: 'b', profile: profile('bo', 'public', { kind: 'provider', url: 'https://x/y.jpg' }), tally: { days: { '2026-10-11': [3, 0, 0, 30, 27] } }, wallet: { balance: 1000, resets: 2 } },
    { uid: 'c', profile: profile('cy', 'friends'), tally: { days: { '2026-10-11': [9, 0, 0, 90, 80] } } },
    { uid: 'd', profile: profile('di'), tally: { days: {} } },
  ];
  const week = lib.leaderboard(entries, '2026-10-06');
  assert.deepEqual(
    week.map((r) => [r.username, r.won, r.lost, r.profit]),
    [
      ['bo', 3, 0, 27],
      ['ace', 1, 0, 9.09],
    ],
  );
  // (an upload's data stays off the board; an address stays)
  assert.equal(week[1].photo, null);
  assert.deepEqual(week[0].photo, { kind: 'provider', url: 'https://x/y.jpg' });
  // (each row's reloads, from its wallet's resets; no wallet, none)
  assert.deepEqual(week.map((r) => r.reloads), [2, 0]);
  const all = lib.leaderboard(entries, '0000-00-00');
  assert.deepEqual(all.find((r) => r.username === 'ace'), { uid: 'a', username: 'ace', displayName: 'ace', photo: null, won: 1, lost: 1, push: 0, staked: 30, profit: -10.91, roi: -0.3637, reloads: 0 });
});

// ---------------------------------------------------------------------------
// Parlays: the slip's rules, the arithmetic (the page's and the settler's alike), every mix of legs settled
// ---------------------------------------------------------------------------
const sel = (over = {}) => ({ sport: 'nfl', event: '401', market: 'spread', side: 'home', propType: null, athlete: null, odds: -110, ...over });

test('parlays on the slip: 2 to 10 legs, one a game (no same-game parlays), at the legs’ combined price', () => {
  assert.equal(w.parlayProblem([sel()]), 'A parlay needs 2 legs or more');
  assert.equal(w.parlayProblem([sel(), sel({ event: '402' })]), null);
  assert.equal(w.parlayProblem(Array.from({ length: 10 }, (_, i) => sel({ event: String(500 + i) }))), null);
  assert.equal(w.parlayProblem(Array.from({ length: 11 }, (_, i) => sel({ event: String(500 + i) }))), 'A parlay takes 10 legs at most');
  // (both sides of one market; two markets of one game; one prop each of two players in one game)
  assert.equal(w.parlayProblem([sel(), sel({ side: 'away' })]), 'Both sides of one market can’t go in a parlay');
  assert.match(w.parlayProblem([sel(), sel({ market: 'total', side: 'over' })]), /No same-game parlays/);
  assert.match(w.parlayProblem([sel({ market: 'prop', side: 'over', propType: 'saves', athlete: '1' }), sel({ market: 'prop', side: 'over', propType: 'saves', athlete: '2' })]), /correlation/);
  // (the same game number in two sports is two games)
  assert.equal(w.parlayProblem([sel(), sel({ sport: 'nhl' })]), null);
  // (the price: the legs' decimal odds multiplied, as American; the page's and the settler's the same)
  assert.equal(w.decimalOf(150), 2.5);
  assert.equal(Math.round(w.decimalOf(-110) * 1e4), 19091);
  assert.equal(w.americanOf(2.5), 150);
  assert.equal(w.americanOf(1.5), -200);
  assert.equal(w.parlayOdds([{ odds: -110 }, { odds: -110 }]), 264);
  assert.equal(w.parlayOdds([{ odds: -110 }, { odds: 150 }, { odds: -110 }]), 811);
  assert.equal(w.parlayOdds([{ odds: -500 }, { odds: -500 }]), -227);
  assert.equal(lib.parlayOdds([{ odds: -108 }, { odds: -180 }]), 200);
  // (what the slip shows it paying: the stake at the combined price)
  assert.equal(w.payout(10, w.parlayOdds([{ odds: -110 }, { odds: -110 }])), 36.4);
});

test('a parlay’s result from its legs: any leg lost loses it; pushes and voids drop out; one leg left pays straight; all void, the stake back', () => {
  const mixes = [
    // [legs as odds:status, expected]
    [[[-110, 'won'], [150, 'won'], [-110, 'won']], { status: 'won', profit: 81.12, final: '3 of 3 hit', odds: 811 }],
    // (lost the moment a leg loses, the others still open)
    [[[-110, 'open'], [150, 'lost'], [-110, null]], { status: 'lost', profit: -10, final: '0 of 3 hit' }],
    [[[-110, 'won'], [150, 'lost'], [-110, 'won']], { status: 'lost', profit: -10, final: '2 of 3 hit' }],
    // (a leg still open, none lost: waits)
    [[[-110, 'won'], [150, 'open']], null],
    [[[-110, 'won'], [150, null]], null],
    // (a push drops out: the other two's price)
    [[[-110, 'won'], [150, 'push'], [-110, 'won']], { status: 'won', profit: 26.45, final: '2 of 3 hit, 1 pushed', odds: 264 }],
    // (a void the same)
    [[[-110, 'won'], [150, 'void'], [-110, 'won']], { status: 'won', profit: 26.45, final: '2 of 3 hit, 1 void', odds: 264 }],
    // (down to one leg: that straight bet)
    [[[-110, 'won'], [150, 'void'], [-110, 'push']], { status: 'won', profit: 9.09, final: '1 of 3 hit, 1 pushed, 1 void', odds: -110 }],
    [[[150, 'won'], [-110, 'push']], { status: 'won', profit: 15, final: '1 of 2 hit, 1 pushed', odds: 150 }],
    // (none left: every leg void, the stake back; a push among them, a push)
    [[[-110, 'void'], [150, 'void']], { status: 'void', profit: 0, final: '0 of 2 hit, 2 void', note: 'every leg void' }],
    [[[-110, 'push'], [150, 'void']], { status: 'push', profit: 0, final: '0 of 2 hit, 1 pushed, 1 void' }],
    // (a lost leg beats a push or a void)
    [[[-110, 'push'], [150, 'lost']], { status: 'lost', profit: -10, final: '0 of 2 hit' }],
  ];
  for (const [legs, want] of mixes) {
    const list = legs.map(([odds, status]) => ({ odds, status }));
    assert.deepEqual(lib.parlayOutcome(10, list), want, JSON.stringify(legs));
    // (the page's provisional reads the same)
    assert.deepEqual(w.parlayOutcome(10, list), want, `page: ${JSON.stringify(legs)}`);
  }
  // (what goes back in the wallet: the stake and the winnings, nothing, the stake)
  assert.equal(lib.creditOf(10, lib.parlayOutcome(10, [{ odds: -110, status: 'won' }, { odds: -110, status: 'won' }])), 36.45);
  assert.equal(lib.creditOf(10, lib.parlayOutcome(10, [{ odds: -110, status: 'lost' }, { odds: -110, status: 'won' }])), 0);
  assert.equal(lib.creditOf(10, lib.parlayOutcome(10, [{ odds: -110, status: 'void' }, { odds: -110, status: 'void' }])), 10);
});

test('settling a parlay: each leg graded as a straight bet (its price checked), a leg not begun waiting, a leg graded before kept', () => {
  // (two games: LV @ NE 20-24 final, CLE @ NYJ 3-7 final; a third, KC @ DEN, not begun)
  const g1 = { game: game(), observations: board };
  const g2 = { game: game({ id: '402', homeAbbr: 'NYJ', awayAbbr: 'CLE', hs: 7, as: 3 }), observations: board };
  const leg = (over = {}) => ({ sport: 'nfl', event: '401', matchup: 'LV @ NE', start: '2026-10-11T17:00Z', market: 'spread', side: 'home', line: -3.5, odds: -108, pick: 'NE -3.5', ...over });
  const nyj = leg({ event: '402', matchup: 'CLE @ NYJ', market: 'ml', line: null, odds: -180, pick: 'NYJ ML' });
  const kc = leg({ event: '403', matchup: 'KC @ DEN', start: '2026-10-12T20:00Z', market: 'ml', side: 'away', line: null, odds: 120, pick: 'KC ML' });
  const parlay = (legs, over = {}) => ({ id: 'p', kind: 'parlay', legs, stake: 10, placedAt: '2026-10-10T12:00:00.000Z', start: '2026-10-11T17:00Z', status: 'open', ...over });
  // (both hit: paid at their product, -108 and -180 as +200)
  let r = lib.settleParlay(parlay([leg(), nyj]), [g1, g2], { now });
  assert.deepEqual(r.result, { status: 'won', profit: 19.96, final: '2 of 2 hit', odds: 200 });
  assert.deepEqual(r.legs.map((l) => [l.status, l.final]), [['won', 'LV 20 @ NE 24'], ['won', 'CLE 3 @ NYJ 7']]);
  // (one lost: lost at once, the leg not begun left open)
  r = lib.settleParlay(parlay([leg({ side: 'away', line: 3.5, odds: -112, pick: 'LV +3.5' }), kc]), [g1, null], { now });
  assert.deepEqual(r.result, { status: 'lost', profit: -10, final: '0 of 2 hit' });
  assert.deepEqual(r.legs.map((l) => l.status), ['lost', undefined]);
  // (one hit, the other not begun: waits, the hit kept for the page)
  r = lib.settleParlay(parlay([leg(), kc]), [g1, null], { now });
  assert.equal(r.result, null);
  assert.deepEqual(r.legs.map((l) => l.status), ['won', undefined]);
  // (next run: the graded leg kept as it was, the other graded now: hit at +120, the two at their product)
  const later = { game: game({ id: '403', homeAbbr: 'DEN', awayAbbr: 'KC', hs: 10, as: 13, date: '2026-10-12T20:00Z' }), observations: lib.observationsOf({ ml: { home: -140, away: 120 } }, 'close') };
  r = lib.settleParlay(parlay(r.legs), [null, later], { now: now + 2 * lib.DAY });
  assert.deepEqual(r.result, { status: 'won', profit: 32.37, final: '2 of 2 hit', odds: 324 });
  // (a leg whose price wasn't on the board: void, dropping out; the other paid as a straight bet)
  r = lib.settleParlay(parlay([leg({ odds: 130 }), nyj]), [g1, g2], { now });
  assert.deepEqual(r.legs.map((l) => [l.status, l.note]), [['void', 'price didn’t match the board'], ['won', undefined]]);
  assert.deepEqual(r.result, { status: 'won', profit: 5.56, final: '1 of 2 hit, 1 void', odds: -180 });
  // (a pushed leg: NE -4 on a 4-point win; the other's price)
  r = lib.settleParlay(parlay([leg({ line: -4, odds: -110 }), nyj]), [{ ...g1, observations: [...board, ...lib.observationsOf({ spread: { home: { line: -4, odds: -110 }, away: { line: 4, odds: -110 } } }, 'close')] }, g2], { now });
  assert.equal(r.legs[0].status, 'push');
  assert.deepEqual(r.result, { status: 'won', profit: 5.56, final: '1 of 2 hit, 1 pushed', odds: -180 });
  // (every leg void: the stake back)
  r = lib.settleParlay(parlay([leg({ odds: 130 }), nyj]), [g1, { ...g2, observations: [] }], { now });
  assert.deepEqual(r.result, { status: 'void', profit: 0, final: '0 of 2 hit, 2 void', note: 'every leg void' });
  // (a leg that isn't a bet the page could place: void, without its game looked at)
  assert.equal(lib.legProblem(leg()), null);
  assert.equal(lib.legProblem(nyj), null);
  assert.equal(lib.legProblem(leg({ market: 'parlay' })), 'not a market');
  assert.equal(lib.legProblem(leg({ side: 'over' })), 'not a market');
  assert.equal(lib.legProblem(leg({ odds: 50 })), 'not a price');
  assert.equal(lib.legProblem(leg({ sport: 'mma' })), 'not a game');
  assert.equal(lib.legProblem(leg({ market: 'ml', line: -3.5 })), 'not a line');
  assert.equal(lib.legProblem(leg({ market: 'prop', side: 'over', line: 24.5 })), 'not a prop');
  r = lib.settleParlay(parlay([leg({ market: 'parlay' }), nyj]), [g1, g2], { now });
  assert.deepEqual([r.legs[0].status, r.legs[0].note, r.result.status, r.result.profit], ['void', 'not a market', 'won', 5.56]);
  // (two legs on one game, past the rules somehow: the parlay void)
  r = lib.settleParlay(parlay([leg(), leg({ market: 'total', side: 'under', line: 45.5, odds: -115 })]), [g1, g1], { now });
  assert.deepEqual(r.result, { status: 'void', profit: 0, note: 'two legs on one game' });
  // (a game ESPN never has: waits, then that leg void after three days)
  r = lib.settleParlay(parlay([leg(), nyj]), [g1, { game: null, observations: [] }], { now });
  assert.equal(r.result, null);
  r = lib.settleParlay(parlay([leg(), nyj]), [g1, { game: null, observations: [] }], { now: now + 4 * lib.DAY });
  assert.deepEqual([r.legs[1].note, r.result.status, r.result.odds], ['game not found', 'won', -108]);
  // (in the tally: one bet, its result)
  const t = lib.addToTally(null, { stake: 10, start: '2026-10-11T17:00Z' }, { status: 'won', profit: 19.96 });
  assert.deepEqual(t.all, { won: 1, lost: 0, push: 0, void: 0, staked: 10, profit: 19.96 });
});

test('a parlay on the page: one row (its own group), its legs as bets of their own, "2 of 4 hit", one bet in the record', () => {
  const p = {
    ...bet({ id: 'p1', kind: 'parlay', sport: 'parlay', event: 'p1', matchup: '', market: 'parlay', side: '', line: null, odds: 264, pick: '2-leg parlay', start: '2026-10-11T17:00Z' }),
    legs: [
      { sport: 'nfl', event: '401', matchup: 'LV @ NE', start: '2026-10-11T17:00Z', market: 'spread', side: 'home', line: -3.5, odds: -110, pick: 'NE -3.5', status: 'won', final: 'LV 20 @ NE 24' },
      { sport: 'nhl', event: '501', matchup: 'SEA @ DET', start: '2026-10-11T23:00Z', market: 'ml', side: 'home', line: null, odds: -110, pick: 'DET ML' },
    ],
  };
  const legs = w.legBets(p);
  assert.deepEqual(legs.map((l) => [l.id, l.sport, l.status, l.stake]), [['p1~0', 'nfl', 'won', 10], ['p1~1', 'nhl', 'open', 10]]);
  // (its progress: the graded leg, the other decided in play or not yet)
  assert.deepEqual(w.parlayProgress(p, ['won', null]), { hit: 1, n: 2, text: '1 of 2 hit', decided: null });
  assert.deepEqual(w.parlayProgress(p, ['won', 'won']).decided, { status: 'won', profit: 26.45, final: '2 of 2 hit', odds: 264 });
  assert.equal(w.parlayProgress(p, ['won', 'lost']).decided.status, 'lost');
  // (its own group among the games, beside a straight bet on one of its legs' games)
  const groups = w.byGame([p, bet()]);
  assert.deepEqual(groups.map((g) => [g.key, g.bets.length]), [['parlay|p1', 1], ['nfl|401', 1]]);
  // (one bet in the record, by its own result)
  const settled = { ...p, status: 'won', profit: 26.45, settledAt: '2026-10-12T05:00:00Z' };
  const t = w.playTally([settled, bet({ id: 'b2', status: 'lost', profit: -10, settledAt: '2026-10-12T04:00:00Z' })]);
  assert.deepEqual([t.won, t.lost, t.staked, t.profit], [1, 1, 20, 16.45]);
  // (a settled parlay's leg never graded (it lost on another first) stays ungraded)
  assert.deepEqual(w.legBets({ ...settled, status: 'lost' }).map((l) => l.status), ['won', 'open']);
});
