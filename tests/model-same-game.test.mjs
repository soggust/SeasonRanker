// Same-game sizing (audit #20; libs/ranker/scripts/model/desk.mjs fitSameGame, sizeJointly, sameGameOf): a game's
// props' correlation read off the graded props, its edge props sized jointly with it, stakes only ever cut, and
// nothing changed where it isn't fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAME_GAME, capGame, fitSameGame, sameGameOf, sizeJointly } from '../libs/ranker/scripts/model/desk.mjs';

const prop = (id, side, units, extra = {}) => ({ id, event: 'g', market: 'prop', side, units, intent: units > 0.5 ? 'edge' : 'action', ev: units > 0.5 ? 0.05 : 0, ...extra });

test('sizeJointly: n edge props on one side stake 1 / (1 + (n - 1) rho) of their own; nothing at rho 0', () => {
  const bets = [1, 2, 3, 4].map((i) => prop(`p${i}`, 'over', 3));
  assert.deepEqual(sizeJointly(bets, [], 0), bets);
  const out = sizeJointly(bets, [], 0.2);
  // (3 / (1 + 3 x 0.2) = 1.875: by half units, 2)
  for (const b of out) assert.equal(b.units, 2), assert.equal(b.sizedFrom, 3);
});

test('sizeJointly: an over and an under hedge (never raised); the action props and the open ones count as placed', () => {
  const pair = sizeJointly([prop('a', 'over', 2), prop('b', 'under', 2)], [], 0.25);
  assert.deepEqual(pair.map((b) => b.units), [2, 2]);
  assert.ok(pair.every((b) => !b.sizedFrom));
  // (one 2u over among eight 0.5u overs, three open 1u overs: cut; the action props never move)
  const bets = [prop('e', 'over', 2), ...Array.from({ length: 8 }, (_, i) => prop(`x${i}`, 'over', 0.5))];
  const out = sizeJointly(bets, [{ side: 'over', units: 1 }, { side: 'over', units: 1 }, { side: 'over', units: 1 }], 0.1);
  // (T = 0.9 x 7 + 2 = 8.3; u = (2 - 0.83) / 0.9 = 1.3: 1.5)
  assert.equal(out[0].units, 1.5);
  assert.ok(out.slice(1).every((b) => b.units === 0.5 && !b.sizedFrom));
  // (the same among unders on the other side: the over's room back)
  const hedged = sizeJointly([prop('e', 'over', 2), ...Array.from({ length: 8 }, (_, i) => prop(`x${i}`, 'under', 0.5))], [], 0.1);
  assert.equal(hedged[0].units, 2);
  // (a game market, a side it doesn't know: left alone)
  const game = { id: 'm', event: 'g', market: 'total', side: 'over', units: 3, intent: 'edge', ev: 0.05 };
  assert.equal(sizeJointly([game, prop('e', 'over', 2)], [], 0.25)[0], game);
});

test('sizeJointly then capGame: a resized prop keeps sizedFrom through the cap', () => {
  const out = sizeJointly([1, 2, 3].map((i) => prop(`p${i}`, 'over', 3)), [], 0.25);
  const res = capGame(out, 0, 5);
  assert.ok(res.kept.every((b) => b.sizedFrom === 3));
  assert.ok(res.kept.reduce((t, b) => t + b.units, 0) <= 5);
});

// (graded props: g games of n props, every one's result the game's own coin with chance agree, by its side)
function ledger(games, n, agree, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let g = 0; g < games; g++) {
    const coin = rnd() < 0.5;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 'over' : 'under';
      const goes = rnd() < agree ? coin : rnd() < 0.5;
      const won = side === 'over' ? goes : !goes;
      out.push(prop(`${g}:${i}`, side, 0.5, { event: `g${g}`, start: `2026-10-${String(1 + (g % 28)).padStart(2, '0')}T20:00Z`, p: 0.5, status: won ? 'won' : 'lost', profit: won ? 0.45 : -0.5 }));
    }
  }
  return out;
}

test('fitSameGame: 0 under minGames; reads a game-wide coin, shrunk; about 0 with none', () => {
  assert.equal(fitSameGame(ledger(SAME_GAME.minGames - 1, 6, 0.5)).rho, 0);
  assert.equal(fitSameGame(ledger(SAME_GAME.minGames - 1, 6, 0.5)).fitted, false);
  const hi = fitSameGame(ledger(300, 6, 0.5));
  // (each result the coin half the time: their correlation about 0.25, shrunk by 300 / 330)
  assert.ok(hi.raw > 0.15 && hi.raw < 0.35, `raw ${hi.raw}`);
  assert.ok(Math.abs(hi.rho - (Math.min(SAME_GAME.max, hi.raw) === hi.raw ? (hi.raw * 300) / 330 : SAME_GAME.max)) < 1e-3);
  const none = fitSameGame(ledger(300, 6, 0));
  assert.ok(Math.abs(none.raw) < 0.05, `raw ${none.raw}`);
  // (pushes, voids, the game markets: not read)
  const extra = [{ ...prop('v', 'over', 1), status: 'push', p: 0.5 }, { ...prop('w', 'over', 1), void: true, status: 'won', p: 0.5 }];
  assert.deepEqual(fitSameGame(extra), { rho: 0, raw: null, se: null, games: 0, pairs: 0, fitted: false });
});

test('sameGameOf: no look-ahead in its replay, used 0 where nothing is fit', () => {
  const empty = sameGameOf([]);
  assert.equal(empty.used, 0);
  assert.equal(empty.replay.games, 0);
  const g = sameGameOf(ledger(40, 4, 0.5));
  // (all action props: the replay resizes nothing, so the fit's rho is used)
  assert.equal(g.replay.resized, 0);
  assert.equal(g.used, g.rho);
});

test('sameGameOf: left out (used 0) where the stakes it would have cut won', () => {
  const past = ledger(200, 6, 0.6).map((b) => ({ ...b, start: '2026-09-01T20:00Z' }));
  const late = [1, 2, 3, 4].map((i) => prop(`w${i}`, 'over', 3, { event: 'late', start: '2026-10-01T20:00Z', p: 0.55, status: 'won', profit: 2.7 }));
  const g = sameGameOf([...past, ...late]);
  assert.ok(g.rho > 0);
  assert.ok(g.replay.resized >= 4);
  assert.ok(g.replay.joint < g.replay.asBet);
  assert.equal(g.used, 0);
  // (the same game lost: the cut kept, used)
  const lost = sameGameOf([...past, ...late.map((b) => ({ ...b, status: 'lost', profit: -3 }))]);
  assert.equal(lost.used, lost.rho);
});
