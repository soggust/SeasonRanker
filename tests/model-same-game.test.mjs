// Same-game sizing (audit #20; libs/ranker/scripts/model/desk.mjs fitSameGame, sizeJointly, sameGameOf, placeGame):
// a game's props' correlations, a player's own props' and the rest's, read off the graded props, each used only
// where held-out days bear it out, its edge props sized jointly with them, stakes only ever cut, and nothing
// changed where they aren't fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAME_GAME, capGame, fitSameGame, placeGame, sameGameOf, sizeJointly } from '../libs/ranker/scripts/model/desk.mjs';

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

test("sizeJointly: a player's own two props by the player rho, any other two by the game's (solved, not the closed form)", () => {
  const star = (id, units) => prop(id, 'over', units, { athlete: 'star' });
  // (his points and shots, 2u each, at 0.16: 2 / 1.16 = 1.72, by half units 1.5; the game's 0: another player's untouched)
  const out = sizeJointly([star('pts', 2), star('sog', 2), prop('x', 'over', 2, { athlete: 'other' })], [], { player: 0.16, game: 0 });
  assert.deepEqual(out.map((b) => b.units), [1.5, 1.5, 2]);
  // (one number: both kinds alike)
  const three = () => [star('a', 3), star('b', 3), prop('c', 'over', 3)];
  assert.deepEqual(sizeJointly(three(), [], 0.25).map((b) => b.units), sizeJointly(three(), [], { player: 0.25, game: 0.25 }).map((b) => b.units));
  // (an open prop of his on the other side: a hedge, his new one kept)
  const hedged = sizeJointly([star('pts', 2)], [{ side: 'under', units: 2, athlete: 'star', market: 'prop' }], { player: 0.25, game: 0 });
  assert.equal(hedged[0].units, 2);
  // (both 0: nothing)
  const same = [star('a', 2), star('b', 2)];
  assert.equal(sizeJointly(same, [], { player: 0, game: 0 }), same);
});

test('sizeJointly then capGame: a resized prop keeps sizedFrom through the cap', () => {
  const out = sizeJointly([1, 2, 3].map((i) => prop(`p${i}`, 'over', 3)), [], 0.25);
  const res = capGame(out, 0, 5);
  assert.ok(res.kept.every((b) => b.sizedFrom === 3));
  assert.ok(res.kept.reduce((t, b) => t + b.units, 0) <= 5);
});

// (graded props: g games of n props, every one's result the game's own coin with chance agree, by its side)
function ledger(games, n, agree, seed = 1, startOf = (g) => `2026-10-${String(1 + (g % 28)).padStart(2, '0')}T20:00Z`) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let g = 0; g < games; g++) {
    const coin = rnd() < 0.5;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 'over' : 'under';
      const goes = rnd() < agree ? coin : rnd() < 0.5;
      const won = side === 'over' ? goes : !goes;
      out.push(prop(`${g}:${i}`, side, 0.5, { event: `g${g}`, athlete: `a${g}:${i}`, start: startOf(g), p: 0.5, status: won ? 'won' : 'lost', profit: won ? 0.45 : -0.5 }));
    }
  }
  return out;
}

test('fitSameGame: 0 under minGames; reads a game-wide coin, shrunk; about 0 with none', () => {
  assert.equal(fitSameGame(ledger(SAME_GAME.minGames - 1, 6, 0.5)).game.rho, 0);
  assert.equal(fitSameGame(ledger(SAME_GAME.minGames - 1, 6, 0.5)).game.fitted, false);
  const hi = fitSameGame(ledger(300, 6, 0.5)).game;
  // (each result the coin half the time: their correlation about 0.25, shrunk by 300 / 330)
  assert.ok(hi.raw > 0.15 && hi.raw < 0.35, `raw ${hi.raw}`);
  assert.ok(Math.abs(hi.rho - (Math.min(SAME_GAME.max, hi.raw) === hi.raw ? (hi.raw * 300) / 330 : SAME_GAME.max)) < 1e-3);
  const none = fitSameGame(ledger(300, 6, 0)).game;
  assert.ok(Math.abs(none.raw) < 0.05, `raw ${none.raw}`);
  // (pushes, voids, the game markets: not read)
  const extra = [{ ...prop('v', 'over', 1), status: 'push', p: 0.5 }, { ...prop('w', 'over', 1), void: true, status: 'won', p: 0.5 }];
  const nothing = { rho: 0, raw: null, se: null, games: 0, pairs: 0, fitted: false };
  assert.deepEqual(fitSameGame(extra), { means: { over: 0, under: 0 }, player: nothing, game: nothing });
});

test("fitSameGame: a player's own two props read apart from the rest; each side centered on its own", () => {
  // (each game: one player's two props on the game's coin, four others independent)
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let g = 0; g < 200; g++) {
    const coin = rnd() < 0.5;
    for (let i = 0; i < 6; i++) {
      const goes = i < 2 ? coin : rnd() < 0.5;
      out.push(prop(`${g}:${i}`, 'over', 0.5, { event: `g${g}`, athlete: i < 2 ? `star${g}` : `a${g}:${i}`, p: 0.5, status: goes ? 'won' : 'lost', profit: 0 }));
    }
  }
  const f = fitSameGame(out);
  assert.equal(f.player.games, 200);
  assert.equal(f.player.pairs, 200);
  assert.ok(f.player.raw > 0.8, `player ${f.player.raw}`);
  assert.ok(Math.abs(f.game.raw) < 0.08, `game ${f.game.raw}`);
  // (the overs mostly lost and the unders mostly won, independent: one mean for both sides would read that gap
  // as a correlation, each pair of an over and an under a product of two misses the same way)
  const gap = [];
  for (let g = 0; g < 300; g++)
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 'over' : 'under';
      const won = side === 'over' ? rnd() < 0.3 : rnd() < 0.7;
      gap.push(prop(`${g}:${i}`, side, 0.5, { event: `g${g}`, athlete: `a${g}:${i}`, p: 0.5, status: won ? 'won' : 'lost' }));
    }
  const fg = fitSameGame(gap);
  assert.ok(fg.means.over < -0.2 && fg.means.under > 0.2, JSON.stringify(fg.means));
  assert.ok(Math.abs(fg.game.raw) < 0.06, `gap ${fg.game.raw}`);
});

test('sameGameOf: used 0 where nothing is fit, or the bets lack a start, a chance or a game', () => {
  const empty = sameGameOf([]);
  assert.deepEqual(empty.used, { player: 0, game: 0 });
  assert.equal(empty.replay.games, 0);
  const broken = ledger(40, 4, 0.5).map((b, i) => (i % 3 === 0 ? { ...b, start: undefined } : i % 3 === 1 ? { ...b, p: undefined } : { ...b, event: undefined }));
  const g = sameGameOf(broken);
  assert.deepEqual(g.used, { player: 0, game: 0 });
  // (a bet with no game or no start isn't replayed; one with no chance is, at its stake: the replay needs none)
  assert.equal(g.replay.games, 40);
  // (the fit reads only those with a chance and a game)
  assert.ok(fitSameGame(broken).game.pairs < fitSameGame(ledger(40, 4, 0.5)).game.pairs);
  // (no start on any: no replay, no held-out days, nothing used however strong the read)
  const noStart = sameGameOf(ledger(60, 4, 0.5).map((b) => ({ ...b, start: 'not a time' })));
  assert.deepEqual(noStart.used, { player: 0, game: 0 });
});

const dayOf = (g) => new Date(Date.UTC(2026, 3, 1) + g * 864e5).toISOString().slice(0, 10) + 'T20:00Z';

test("sameGameOf: a kind used only where held-out days bear it out; none where they don't, or too few", () => {
  // (a game-wide coin, one game a day for 60 days: read early, borne out after)
  const real = sameGameOf(ledger(60, 4, 0.5, 3, dayOf));
  assert.ok(real.game.held.games >= SAME_GAME.minHeld && real.game.held.gain > 0, JSON.stringify(real.game));
  assert.equal(real.used.game, real.game.rho);
  assert.equal(real.used.player, 0);
  // (no coin: whatever reads above 0 is luck, and isn't used unless the days after scored it better than 0)
  for (const seed of [5, 11, 23]) {
    const luck = sameGameOf(ledger(60, 4, 0, seed, dayOf));
    assert.equal(luck.used.game > 0, luck.game.held.gain > 0 && luck.game.held.games >= SAME_GAME.minHeld && luck.game.rho > 0);
  }
  // (fit, but every game on one day: nothing held out, not used)
  const once = sameGameOf(ledger(60, 4, 0.5, 3, () => '2026-10-01T20:00Z'));
  assert.ok(once.game.rho > 0);
  assert.equal(once.game.held.games, 0);
  assert.equal(once.used.game, 0);
});

test("sameGameOf: days by US Eastern date, so an evening game is never fit on the same night's earlier ones", () => {
  // (12 games at 7pm ET, 6 at 8:30pm ET: the next UTC date, the same ET night)
  const early = ledger(12, 4, 0.5, 3, () => '2026-10-01T23:00Z');
  const late = ledger(6, 4, 0.5, 9, () => '2026-10-02T00:30Z').map((b) => ({ ...b, event: `late${b.event}`, id: `late${b.id}` }));
  const g = sameGameOf([...early, ...late]);
  assert.ok(g.game.fitted);
  assert.equal(g.game.held.games, 0);
});

// (a game-wide coin for 200 days, then games of four 3u edge overs, one a day, all won or all lost)
function floorLedger(won, games) {
  const past = ledger(200, 6, 0.6, 1, dayOf);
  const late = [];
  for (let k = 0; k < games; k++) for (let i = 1; i <= 4; i++) late.push(prop(`w${k}:${i}`, 'over', 3, { event: `late${k}`, athlete: `l${k}:${i}`, start: `2026-12-${String(1 + k).padStart(2, '0')}T20:00Z`, p: 0.55, status: won ? 'won' : 'lost', profit: won ? 2.7 : -3 }));
  return [...past, ...late];
}

test('sameGameOf: the bankroll floor turns it off only past minResized stakes cut that grew it less', () => {
  // (three games of four cut stakes that won: 12, past minResized; off)
  const lostMoney = sameGameOf(floorLedger(true, 3));
  assert.ok(lostMoney.game.rho > 0 && lostMoney.game.held.gain > 0);
  assert.ok(lostMoney.replay.inSample.resized >= SAME_GAME.minResized);
  assert.ok(lostMoney.replay.inSample.worse);
  assert.equal(lostMoney.floor, true);
  assert.deepEqual(lostMoney.used, { player: 0, game: 0 });
  // (one such game: 4 stakes, a game's luck; the floor doesn't bite)
  const oneGame = sameGameOf(floorLedger(true, 1));
  assert.ok(oneGame.replay.inSample.resized > 0 && oneGame.replay.inSample.resized < SAME_GAME.minResized);
  assert.equal(oneGame.floor, false);
  assert.equal(oneGame.used.game, oneGame.game.rho);
  // (they lost: the cut kept)
  const saved = sameGameOf(floorLedger(false, 3));
  assert.equal(saved.floor, false);
  assert.equal(saved.used.game, saved.game.rho);
});

test('sameGameOf: a live cut replayed from its stake before (context.sameGameFrom): the cut against none, not a cut on a cut', () => {
  const plain = floorLedger(true, 3);
  const g0 = sameGameOf(plain);
  // (the same bets as a live run would have cut them: units at the sized stake, profit at it, the stake before noted)
  const cutTo = new Map();
  for (const e of ['late0', 'late1', 'late2']) for (const b of sizeJointly(plain.filter((b) => b.event === e), [], g0.game.rho)) cutTo.set(b.id, b.units);
  const live = plain.map((b) => (cutTo.has(b.id) && cutTo.get(b.id) !== b.units ? { ...b, units: cutTo.get(b.id), profit: (b.profit * cutTo.get(b.id)) / b.units, context: { sameGameFrom: b.units } } : b));
  assert.ok(live.filter((b) => b.context?.sameGameFrom).length >= SAME_GAME.minResized);
  const g1 = sameGameOf(live);
  assert.deepEqual(g1.replay.inSample, g0.replay.inSample);
  assert.deepEqual(g1.replay.asOf, g0.replay.asOf);
  assert.equal(g1.floor, g0.floor);
});

test('placeGame: sized before the room and the cap; the open props fixed, the open markets not; the notes', () => {
  const mine = () => [1, 2, 3].map((i) => prop(`p${i}`, 'over', 3, { athlete: `a${i}` }));
  const rho = { player: 0, game: 0.25 };
  // (an open 3u total over: not in the sizing, only in the cap's room)
  const total = { id: 't', event: 'g', market: 'total', side: 'over', units: 3, intent: 'edge', ev: 0.05 };
  const a = placeGame(mine(), [total], rho, 99);
  // (3 / 1.5 = 2 each)
  assert.deepEqual(a.kept.map((x) => x.units), [2, 2, 2]);
  assert.deepEqual(placeGame(mine(), [], rho, 99).kept.map((x) => x.units), [2, 2, 2]);
  assert.equal(a.sized, 3);
  assert.equal(a.open, 3);
  assert.equal(a.kept[0].context.sameGameFrom, 3);
  assert.equal(a.kept[0].context.sameGame, "3u sized to 2u with the game's other props (same-game rho a player's own 0, the game's 0.25)");
  assert.ok(a.kept.every((x) => !('sizedFrom' in x) && !('cappedFrom' in x)));
  // (an open 3u prop over: counted as placed, each cut further)
  const c = placeGame(mine(), [prop('o', 'over', 3, { athlete: 'o' })], rho, 99);
  assert.ok(c.kept.every((x) => x.units < 2));
  // (room made for the sized 6u, not the 9u asked: a 0.5u open action prop under a 7u cap stays)
  const act = prop('act', 'under', 0.5, { athlete: 'z', start: '2026-10-01T20:00Z' });
  assert.deepEqual(placeGame(mine(), [act], rho, 7).out, []);
  assert.deepEqual(placeGame(mine(), [act], 0, 7).out, [act]);
  // (then the cap past it: both notes, the sizing's from its stake to the one before the cap)
  const e = placeGame(mine(), [{ ...act, intent: 'edge' }], rho, 5);
  const cut = e.kept.find((x) => x.context?.cap);
  assert.ok(cut, 'capped');
  assert.match(cut.context.sameGame, /^3u sized to 2u /);
  assert.match(cut.context.cap, /^2u cut to [\d.]+u: the game's 5u cap$/);
  assert.equal(e.capped, e.kept.filter((x) => x.context?.cap).length);
  // (an open action prop the room takes back: the edge props sized again without it, not cut for a bet that's gone;
  // 1.5u each with it counted, so 4.5u asked of a 6u cap with 2u open)
  const along = prop('along', 'over', 2, { athlete: 'z', intent: 'action', start: '2026-10-01T20:00Z' });
  assert.deepEqual(placeGame(mine(), [along], rho, 8).kept.map((x) => x.units), [1.5, 1.5, 1.5]);
  const gone = placeGame(mine(), [along], rho, 6);
  assert.deepEqual(gone.out, [along]);
  assert.deepEqual(gone.kept.map((x) => x.units), [2, 2, 2]);
  // (no rho: the stakes as they came)
  assert.deepEqual(placeGame(mine(), [], { player: 0, game: 0 }, 99).kept.map((x) => x.units), [3, 3, 3]);
});

test('a tracked row (no edge, not bet): evidence for the fit, never exposure, never sized, taken back or staked in the replay', () => {
  const tracked = (b) => ({ ...b, intent: 'track', units: 0, trackUnits: 0.5, profit: 0 });
  // (every row tracked: the fits and the held-out scores read the same results, the replay stakes nothing)
  const bet = sameGameOf(ledger(60, 4, 0.5, 3, dayOf));
  const seen = sameGameOf(ledger(60, 4, 0.5, 3, dayOf).map(tracked));
  assert.deepEqual(seen.game.rho, bet.game.rho);
  assert.deepEqual(seen.game.held, bet.game.held);
  assert.deepEqual(seen.used, bet.used);
  assert.equal(seen.replay.games, 0);
  // (open tracked props on the game, even a big lean of them, and new tracked ones: the edge props sized as with none)
  const mine = () => [1, 2, 3].map((i) => prop(`p${i}`, 'over', 3, { athlete: `a${i}` }));
  const rho = { player: 0, game: 0.25 };
  const openT = Array.from({ length: 6 }, (_, i) => tracked(prop(`t${i}`, 'over', 1, { athlete: `t${i}`, start: '2026-10-01T20:00Z' })));
  const newT = tracked(prop('n', 'over', 1, { athlete: 'n' }));
  const plan = placeGame([...mine(), newT], openT, rho, 6);
  assert.deepEqual(plan.out, []);
  assert.equal(plan.open, 0);
  assert.deepEqual(plan.kept.map((x) => x.units), [2, 2, 2, 0]);
  assert.equal(plan.kept[3].intent, 'track');
  assert.ok(!plan.kept[3].context?.sameGame && !plan.kept[3].context?.cap);
  // (a flagged edge prop at the 0.5 minimum: never sized below it, counted as placed)
  const flagged = prop('f', 'over', 0.5, { athlete: 'f', intent: 'edge', ev: 0.03 });
  const withFlag = placeGame([...mine(), flagged], [], rho, 99);
  assert.equal(withFlag.kept[3].units, 0.5);
  assert.ok(withFlag.kept.slice(0, 3).every((x) => x.units <= 2));
});
