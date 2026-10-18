// The MMA desk's side order (the injury audit, 2026-10-18): The Odds API's home and away the other way round from
// ESPN's, and ESPN's own order swapped between reads. Each side is matched by the fighter's name (the API) or his
// ESPN id (the board, the bet), never by place: the price, the bout's key, the bet's side and its grade stay the
// fighter's own, and nothing is voided as replaced. No network: the boards are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boutsOf, linesOf, matchBout, mergeBouts, orientBout, settleBout } from '../libs/ranker/scripts/model/mma-desk.mjs';

const H = 36e5;
const NOW = new Date('2026-10-15T12:00:00Z');
const DONE = Date.parse('2026-10-18T06:00Z');

// (ESPN's board: one card, its bouts' fighters in the order given, the first the home side)
const scoreboard = (bouts) => ({
  events: [
    {
      id: 'card1',
      name: 'UFC Fight Night',
      date: '2026-10-17T21:00Z',
      competitions: bouts.map(([id, first, second, extra = {}]) => ({
        id,
        date: '2026-10-17T21:00Z',
        type: { abbreviation: 'Welterweight' },
        format: { regulation: { periods: 3 } },
        status: { type: { completed: !!extra.completed, name: 'STATUS_SCHEDULED' } },
        competitors: [
          { id: first[0], order: 1, athlete: { displayName: first[1] }, winner: extra.winner === first[0] },
          { id: second[0], order: 2, athlete: { displayName: second[1] }, winner: extra.winner === second[0] },
        ],
      })),
    },
  ],
});
const BUCK = ['buck', 'Joaquin Buckley'];
const MAL = ['mal', 'Mike Malott'];
// (The Odds API's event: Malott its home team, Buckley 1.5 (-200), Malott 2.6 (+160) at DraftKings)
const API = {
  id: 'e1',
  commence_time: '2026-10-17T21:00:00Z',
  home_team: 'Mike Malott',
  away_team: 'Joaquin Buckley',
  bookmakers: [{ key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Mike Malott', price: 2.6 }, { name: 'Joaquin Buckley', price: 1.5 }] }] }],
};

test('side order: the book’s fighters reversed against ESPN’s priced by name, each price on its own fighter', () => {
  const [b] = boutsOf(scoreboard([['10', BUCK, MAL]]));
  assert.equal(b.home.name, 'Joaquin Buckley');
  const m = matchBout(b, [API]);
  assert.equal(m.crossed, true);
  const l = linesOf(b, m);
  assert.deepEqual(l.odds, { home: -200, away: 160 });
  assert.ok(l.fair > 0.6, `Buckley's fair ${l.fair}`);
  // (ESPN's order the API's: the same prices on the same fighters, the other way round)
  const [r] = boutsOf(scoreboard([['10', MAL, BUCK]]));
  const lr = linesOf(r, matchBout(r, [API]));
  assert.deepEqual(lr.odds, { home: 160, away: -200 });
  assert.equal(Math.round((lr.fair + l.fair) * 1e9) / 1e9, 1);
});

test('side order: ESPN’s order swapped between reads is the same bout, its key, sides and bets kept, graded by the bet’s fighter', () => {
  let kept = mergeBouts([], boutsOf(scoreboard([['10', BUCK, MAL]])), NOW);
  assert.equal(kept[0].key, '10:buck-mal');
  const b = kept[0];
  const bet = { id: '10:ml:buck-mal', boutKey: b.key, event: b.id, market: 'ml', side: 'home', odds: -200, units: 1, start: b.date, fighters: { home: b.home, away: b.away } };
  // (the next read lists Malott first: turned back to the kept order, not a new pairing beside a replaced one)
  kept = mergeBouts(kept, boutsOf(scoreboard([['10', MAL, BUCK]])), new Date(NOW.getTime() + H));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].key, '10:buck-mal');
  assert.equal(kept[0].off, null);
  assert.equal(kept[0].home.id, 'buck');
  // (its final read the swapped way: Buckley, listed second, wins; the kept bout's winner is Buckley's side)
  kept = mergeBouts(kept, boutsOf(scoreboard([['10', MAL, BUCK, { completed: true, winner: 'buck' }]])), new Date(NOW.getTime() + 60 * H));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].winner, 'home');
  assert.equal(settleBout(bet, kept[0], DONE).status, 'won');
  // (graded against a bout read the swapped way directly, by the bet's fighters' ids: the same)
  const [raw] = boutsOf(scoreboard([['10', MAL, BUCK, { completed: true, winner: 'buck' }]]));
  assert.equal(raw.winner, 'away');
  assert.equal(settleBout(bet, raw, DONE).status, 'won');
  assert.equal(settleBout({ ...bet, side: 'away', odds: 160 }, raw, DONE).status, 'lost');
  const [lost] = boutsOf(scoreboard([['10', MAL, BUCK, { completed: true, winner: 'mal' }]]));
  assert.equal(settleBout(bet, lost, DONE).status, 'lost');
  // (a real replacement still voids)
  const [other] = boutsOf(scoreboard([['10', ['z', 'Zed Zee'], BUCK, { completed: true, winner: 'buck' }]]));
  assert.equal(settleBout(bet, other, DONE).final, 'fighter replaced');
  kept = mergeBouts(mergeBouts([], boutsOf(scoreboard([['10', BUCK, MAL]])), NOW), boutsOf(scoreboard([['10', ['z', 'Zed Zee'], BUCK]])), new Date(NOW.getTime() + H));
  assert.equal(kept.find((x) => x.key === '10:buck-mal').off, 'replaced');
});

test('orientBout: the same pair the other way round swapped with its winner; any other pair, or none to turn to, left alone', () => {
  const to = { home: { id: 'x' }, away: { id: 'y' } };
  assert.equal(orientBout({ home: { id: 'x' }, away: { id: 'y' }, winner: 'home' }, to).winner, 'home');
  const o = orientBout({ home: { id: 'y' }, away: { id: 'x' }, winner: 'home' }, to);
  assert.deepEqual([o.home.id, o.away.id, o.winner], ['x', 'y', 'away']);
  assert.equal(orientBout({ home: { id: 'y' }, away: { id: 'x' }, winner: null }, to).winner, null);
  assert.equal(orientBout({ home: { id: 'y' }, away: { id: 'z' }, winner: 'home' }, to).home.id, 'y');
  assert.equal(orientBout({ home: { id: 'y' }, away: { id: 'x' } }, null).home.id, 'y');
});
