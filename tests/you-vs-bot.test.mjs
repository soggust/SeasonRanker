// You vs the Bot, same game, same bet: the bot's side on each market kept from its board (board.mjs
// botSidesOf, botSeenUpdate), found at a bet's placement and graded beside it (settle-lib.mjs botPickAt,
// gradeBot; settle.mjs botFor). Made-up boards and bets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botSeenUpdate, botSidesOf, seenUpdate } from '../libs/ranker/scripts/model/board.mjs';
import { BOT_LOOKBACK, botPickAt, gradeBot } from '../libs/ranker/scripts/accounts/settle-lib.mjs';
import { botFor } from '../libs/ranker/scripts/accounts/settle.mjs';

const T = Date.parse('2026-10-18T12:00:00Z');
const H = 36e5;
const game = (over = {}) => ({
  id: '401',
  start: '2026-10-18T17:00:00Z',
  k: {
    spread: [
      { s: 'away', l: 3.5, o: -110, ks: -0.04 },
      { s: 'home', l: -3.5, o: -110, ks: -0.01 },
    ],
    ml: [
      { s: 'away', l: null, o: 150, ks: 0.06 },
      { s: 'home', l: null, o: -180, ks: -0.09 },
    ],
  },
  p: [{ k: 'passYds', id: '77', l: 245.5, o: [-115, -105], ks: [0.02, -0.05] }],
  ...over,
});

test('the bot’s side is the higher Kelly of the two, a negative one too; kept as rows through the game', () => {
  const sides = botSidesOf(game());
  assert.deepEqual(sides['spread||'], ['home', -3.5, -110, -0.01]);
  assert.deepEqual(sides['ml||'], ['away', null, 150, 0.06]);
  assert.deepEqual(sides['prop|passYds|77'], ['over', 245.5, -115, 0.02]);
  const b1 = botSeenUpdate(null, game(), T);
  const b2 = botSeenUpdate(b1, game(), T + H);
  assert.deepEqual(b2['spread||'], [[T, T + H, 'home', -3.5, -110, -0.01]]);
  const moved = game({ k: { ...game().k, spread: [{ s: 'away', l: 3, o: -110, ks: 0.03 }, { s: 'home', l: -3, o: -110, ks: -0.08 }] } });
  const b3 = botSeenUpdate(b2, moved, T + 2 * H);
  assert.deepEqual(b3['spread||'][1], [T + 2 * H, T + 2 * H, 'away', 3, -110, 0.03]);
  // (seenUpdate carries them on each game)
  assert.ok(seenUpdate(null, { sport: 'nfl', games: [game()] }, new Date(T)).games['401'].b['ml||']);
});

const rows = botSeenUpdate(botSeenUpdate(null, game(), T), game(), T + H);
const bet = (o = {}) => ({ sport: 'nfl', event: '401', market: 'spread', side: 'away', line: 3.5, odds: -110, stake: 2, placedAt: new Date(T + 0.5 * H).toISOString(), ...o });

test('found at the placement: the row showing then, else the newest within six hours, else null', () => {
  const pick = botPickAt(bet(), rows);
  assert.deepEqual(pick, { side: 'home', line: -3.5, price: -110, units: 0.5, kelly: -0.01, forced: true });
  assert.equal(botPickAt(bet({ placedAt: new Date(T + H + BOT_LOOKBACK - 1).toISOString() }), rows).side, 'home');
  assert.equal(botPickAt(bet({ placedAt: new Date(T + H + BOT_LOOKBACK + 1).toISOString() }), rows), null);
  assert.equal(botPickAt(bet({ placedAt: new Date(T - 1).toISOString() }), rows), null);
  assert.equal(botPickAt(bet({ kind: 'parlay' }), rows), null);
  // (a prop: its own row; untested, at most 1 unit)
  const prop = botPickAt(bet({ market: 'prop', propType: 'passYds', athlete: '77', side: 'under', line: 245.5 }), rows);
  assert.equal(prop.side, 'over');
  assert.ok(prop.units >= 0.5 && prop.units <= 1);
  // (a real bet of the bot's on that side by then: its own units, not forced)
  const real = botPickAt(bet({ market: 'ml', side: 'home', line: null }), rows, [{ market: 'ml', side: 'away', units: 2, odds: 150, placedAt: new Date(T).toISOString(), status: 'open' }]);
  assert.deepEqual(real, { side: 'away', line: null, price: 150, units: 2, kelly: 0.06, forced: false });
});

test('graded beside the bet: the other side mirrored, the same side the same, a moved line from the game; void none', () => {
  const pick = { side: 'home', line: -3.5, price: -110, units: 1, kelly: -0.01, forced: true };
  assert.deepEqual(gradeBot(bet(), { status: 'won' }, pick), { ...pick, status: 'lost', profit: -1 });
  assert.equal(gradeBot(bet(), { status: 'push' }, pick).status, 'push');
  assert.equal(gradeBot(bet({ side: 'home', line: -3.5 }), { status: 'won' }, pick).profit, 0.91);
  assert.equal(gradeBot(bet(), { status: 'void' }, pick), null);
  // (away +3.5 lost by 7: the bot's home -3.5 graded from the game, won)
  const final = { final: true, hs: 24, as: 17, homeAbbr: 'NE', awayAbbr: 'BUF' };
  assert.equal(gradeBot(bet(), { status: 'lost' }, { ...pick, line: -3 }, { game: final }).status, 'won');
  assert.equal(gradeBot(bet(), { status: 'lost' }, { ...pick, line: -3 }), null);
  // (the settler's: no board rows for the game, null)
  assert.equal(botFor(bet(), { status: 'won' }, { botSeen: { nfl: {} } }), null);
  assert.equal(botFor(bet(), { status: 'lost' }, { botSeen: { nfl: { 401: rows } }, game: final }).status, 'won');
});
