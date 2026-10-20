// firestore.rules for the play-money wallet (users/{uid}/wallet/main, users/{uid}/bets, tallies, leaderboards,
// lines): run against the Firestore emulator by `npm run test:rules`; without it these skip. Its own project id,
// so its clearing between tests never touches another file's (node runs the files side by side).
import { after, before, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, deleteDoc, doc, getDoc, getDocs, collection, increment, serverTimestamp, setDoc, updateDoc, where, query, writeBatch } from 'firebase/firestore';

const ROOT = path.resolve(import.meta.dirname, '../..');
const host = process.env.FIRESTORE_EMULATOR_HOST;
const skip = host ? false : 'no Firestore emulator (npm run test:rules)';

let env;
before(async () => {
  if (skip) return;
  const [hostname, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-season-ranker-wallet',
    firestore: { host: hostname, port: Number(port), rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8') },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => env?.clearFirestore());

const as = (uid) => env.authenticatedContext(uid).firestore();
const VIS = { lists: 'public', presets: 'public', openBets: 'friends', betHistory: 'friends', tracker: 'friends' };

// (a profile, with its visibility, written past the rules)
async function seedProfile(uid, visibility = {}) {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'users', uid), { username: uid, usernameLower: uid, displayName: uid, visibility: { ...VIS, ...visibility }, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }),
  );
}

const newWallet = () => ({ balance: 500, start: 500, resets: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const later = (hours = 24) => Timestamp.fromMillis(Date.now() + hours * 36e5);
const playBet = (over = {}) => ({
  sport: 'nfl',
  event: '401872986',
  matchup: 'LV @ NE',
  start: later(),
  market: 'spread',
  side: 'home',
  line: -3.5,
  odds: -110,
  stake: 25,
  pick: 'NE -3.5',
  botPick: true,
  tier: 'love',
  kelly: 5.2,
  ref: '401872986:spread',
  run: 0,
  placedAt: serverTimestamp(),
  status: 'open',
  ...over,
});

// (a parlay's leg: a straight bet's fields without its stake, run, time or status)
const leg = (over = {}) => {
  const { stake: _s, run: _r, placedAt: _p, status: _st, ...l } = playBet(over);
  return l;
};
// (a parlay as the app places it: its games named in order, its start its first leg's, its price the legs')
const decimal = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
const parlayOf = (legs, over = {}) => {
  const dec = legs.reduce((p, l) => p * decimal(l.odds), 1);
  return {
    kind: 'parlay',
    legs,
    games: legs.map((l) => `${l.sport}_${l.event}`),
    start: legs.map((l) => l.start).sort((a, b) => a.toMillis() - b.toMillis())[0],
    odds: dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)),
    stake: 10,
    pick: `${legs.length}-leg parlay`,
    run: 0,
    placedAt: serverTimestamp(),
    status: 'open',
    ...over,
  };
};

// (a bet as the app places it: the bet and the stake out of the wallet, one batch)
function place(db, uid, id, bet = playBet(), take = bet.stake) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'bets', id), bet);
  batch.update(doc(db, 'users', uid, 'wallet', 'main'), { balance: increment(-take), lastBet: id, updatedAt: serverTimestamp() });
  return batch.commit();
}

describe('wallet rules', { skip }, () => {
  test('a wallet is made once, by its owner, at 500', async () => {
    const db = as('ann');
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), { ...newWallet(), balance: 5000 }));
    // (the old 1,000 start: no more)
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), { ...newWallet(), balance: 1000, start: 1000 }));
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), { ...newWallet(), start: 1000 }));
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), { ...newWallet(), resets: 3 }));
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), { ...newWallet(), lastBet: 'x' }));
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'other'), newWallet()));
    await assertFails(setDoc(doc(as('bob'), 'users', 'ann', 'wallet', 'main'), newWallet()));
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    // (made again over itself: that's an update, and not a bet's or a reload's)
    await assertFails(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
  });

  test('a bet on a game weeks out goes on (a UFC card four weeks ahead: the owner, 2026-10-20), past 60 days not', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    await assertSucceeds(place(db, 'ann', 'far', playBet({ start: later(24 * 28) })));
    await assertFails(place(db, 'ann', 'too-far', playBet({ start: later(24 * 61) })));
  });

  test('a bet goes on only with its stake out of the wallet, in the same write', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    // (the bet alone, the wallet alone, a different amount out, someone else's)
    await assertFails(setDoc(doc(db, 'users', 'ann', 'bets', 'b1'), playBet()));
    await assertFails(updateDoc(doc(db, 'users', 'ann', 'wallet', 'main'), { balance: increment(-25), lastBet: 'b1', updatedAt: serverTimestamp() }));
    await assertFails(place(db, 'ann', 'b1', playBet(), 5));
    await assertFails(place(as('bob'), 'ann', 'b1'));
    await assertSucceeds(place(db, 'ann', 'b1'));
    assertBalance(await getDoc(doc(db, 'users', 'ann', 'wallet', 'main')), 475);
    // (another, a moneyline, a total, a prop)
    await assertSucceeds(place(db, 'ann', 'b2', playBet({ market: 'ml', line: null, odds: 145, side: 'away', pick: 'LV ML', stake: 100 })));
    await assertSucceeds(place(db, 'ann', 'b3', playBet({ market: 'total', side: 'over', line: 45.5, pick: 'Over 45.5', stake: 1 })));
    await assertSucceeds(
      place(db, 'ann', 'b4', playBet({ market: 'prop', side: 'under', line: 24.5, odds: -110, pick: 'John Gibson Under 24.5 Saves', propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', ref: '401:prop:saves:2590824', stake: 4 })),
    );
    assertBalance(await getDoc(doc(db, 'users', 'ann', 'wallet', 'main')), 370);
    // (the same bet id twice: the second is an update, never allowed)
    await assertFails(place(db, 'ann', 'b1'));
    // (the bot's call on a bet, You vs the Bot's: the settler's alone, never placed with the bet or written on it after)
    const bot = { side: 'home', line: -3.5, price: -110, units: 1, kelly: 0.02, forced: true, status: 'won', profit: 0.91 };
    await assertFails(place(db, 'ann', 'b5', playBet({ bot })));
    await assertFails(place(db, 'ann', 'b6', playBet({ bot: null })));
    await assertFails(updateDoc(doc(db, 'users', 'ann', 'bets', 'b1'), { bot }));
    await assertFails(updateDoc(doc(as('bob'), 'users', 'ann', 'bets', 'b1'), { bot }));
  });

  test('a bet: open, on a game not begun, a stake in half units no bigger than the balance, its fields as they should be', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    const bad = [
      playBet({ stake: 501 }),
      playBet({ stake: 0 }),
      playBet({ stake: 2.25 }),
      playBet({ start: later(-1) }),
      playBet({ start: later(24 * 65) }),
      playBet({ status: 'won' }),
      playBet({ profit: 50 }),
      playBet({ placedAt: Timestamp.fromMillis(Date.now() - 36e5) }),
      playBet({ odds: -99 }),
      playBet({ odds: 7.5 }),
      playBet({ run: 1 }),
      playBet({ sport: 'mma' }),
      playBet({ sport: 'nascar' }),
      playBet({ market: 'parlay' }),
      playBet({ side: 'over' }),
      playBet({ market: 'ml', line: -3.5 }),
      playBet({ market: 'total', side: 'over', line: -1 }),
      playBet({ market: 'prop', side: 'over', line: 1.5 }),
      playBet({ matchup: '<script>' }),
      playBet({ tier: 'mega' }),
      playBet({ propType: 'saves' }),
    ];
    for (const [i, b] of bad.entries()) await assertFails(place(db, 'ann', `bad${i}`, b, Number.isFinite(b.stake) ? b.stake : 25));
    // (never under 0: a stake bigger than the balance, however it's written)
    // (the band once called Bet: Like now)
    await assertSucceeds(place(db, 'ann', 'a-like', playBet({ tier: 'like', stake: 0.5 })));
    await assertSucceeds(place(db, 'ann', 'all-in', playBet({ stake: 499.5 })));
    await assertFails(place(db, 'ann', 'more', playBet({ stake: 1 })));
  });

  test('a UFC bout: its own start, not the card’s; the fighters’ names its matchup; a moneyline or a total', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    const bout = (over = {}) => playBet({ sport: 'mma', event: '401908380', matchup: 'Chelsea Chandler @ Melissa Croden', market: 'ml', side: 'away', line: null, odds: 275, pick: 'Chelsea Chandler ML', tier: 'bet', ref: '401908380:ml', stake: 10, ...over });
    // (the card's first bout begun an hour ago: a later bout, its own start ahead, still takes a bet)
    await assertSucceeds(place(db, 'ann', 'later-bout', bout({ start: later(2) })));
    await assertSucceeds(place(db, 'ann', 'bout-total', bout({ market: 'total', side: 'over', line: 2.5, odds: -120, pick: 'Over 2.5 rounds', start: later(3) })));
    await assertSucceeds(place(db, 'ann', 'accents', bout({ matchup: "Jean-Pierre O'Néill @ José Aldo Jr.", start: later(1) })));
    // (a bout begun, a spread or a prop on one, a matchup that isn't two names, a long name)
    await assertFails(place(db, 'ann', 'begun', bout({ start: later(-1) })));
    await assertFails(place(db, 'ann', 'spread', bout({ market: 'spread', side: 'home', line: -1.5 })));
    await assertFails(place(db, 'ann', 'tags', bout({ matchup: '<b> @ <i>' })));
    await assertFails(place(db, 'ann', 'one', bout({ matchup: 'Chelsea Chandler' })));
    await assertFails(place(db, 'ann', 'long', bout({ matchup: `${'A'.repeat(60)} @ B` })));
    assertBalance(await getDoc(doc(db, 'users', 'ann', 'wallet', 'main')), 470);
  });

  test("a CHECK's side (its tier check, not the bot's pick: an admin's alone), and a prop's other side with the pick's id in its ref", async () => {
    // (only an admin sees the CHECKs: anyone else's bet can't claim the tier)
    const plain = as('bob');
    await assertSucceeds(setDoc(doc(plain, 'users', 'bob', 'wallet', 'main'), newWallet()));
    await assertFails(place(plain, 'bob', 'not-mine', playBet({ tier: 'check', botPick: false, stake: 0.5 })));
    const { kelly: _k, ...noKelly } = playBet({ tier: 'check', botPick: false, stake: 0.5 });
    await assertFails(place(plain, 'bob', 'not-mine2', noKelly));
    const db = env.authenticatedContext('ann', { admin: true }).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    // (never the bot's pick, never a Kelly score)
    await assertFails(place(db, 'ann', 'as-pick', { ...noKelly, botPick: true }));
    await assertFails(place(db, 'ann', 'with-kelly', playBet({ tier: 'check', botPick: false, stake: 0.5 })));
    await assertSucceeds(place(db, 'ann', 'a-check', noKelly));
    // (the other bands as before, anyone's)
    await assertSucceeds(place(plain, 'bob', 'a-lock', playBet({ tier: 'lock', stake: 0.5 })));
    await assertSucceeds(
      place(db, 'ann', 'a-check-prop', (({ kelly: _x, ...b }) => b)(playBet({ market: 'prop', side: 'over', line: 24.5, odds: -110, pick: 'John Gibson Over 24.5 Saves', propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', ref: '401:prop:saves:2590824', tier: 'check', botPick: false, stake: 0.5 })), 0.5),
    );
    // (a prop's ref is wanted on either side: without one it's refused, so the lines send the pick's id on both)
    const { ref: _ref, tier: _tier, ...noRef } = playBet({ market: 'prop', side: 'under', line: 24.5, odds: -110, pick: 'John Gibson Under 24.5 Saves', propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', botPick: false, stake: 0.5 });
    await assertFails(place(db, 'ann', 'no-ref', noRef, 0.5));
  });

  test('a parlay: 2 to 10 legs, one a game, each leg a straight bet’s fields and no result, its stake out of the wallet', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    // (a few games, each its own event)
    const legs = [
      leg(),
      leg({ event: '401872987', matchup: 'KC @ DEN', market: 'ml', side: 'away', line: null, odds: 145, pick: 'KC ML', start: later(30) }),
      leg({ sport: 'nhl', event: '401990001', matchup: 'SEA @ DET', market: 'prop', side: 'under', line: 24.5, odds: -110, pick: 'John Gibson Under 24.5 Saves', propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', ref: '401990001:prop:saves:2590824', start: later(2) }),
    ];
    await assertSucceeds(place(db, 'ann', 'p1', parlayOf(legs)));
    assertBalance(await getDoc(doc(db, 'users', 'ann', 'wallet', 'main')), 490);
    // (ten legs, each its own game: the most)
    const ten = Array.from({ length: 10 }, (_, i) => leg({ event: String(402000000 + i), odds: -110 }));
    await assertSucceeds(place(db, 'ann', 'p10', parlayOf(ten, { stake: 0.5 })));
    const bad = {
      // (one leg, eleven)
      one: parlayOf(legs.slice(0, 1)),
      eleven: parlayOf(Array.from({ length: 11 }, (_, i) => leg({ event: String(403000000 + i) }))),
      // (two legs on one game: the same market's two sides, or two markets of it)
      bothSides: parlayOf([leg(), leg({ side: 'away', line: 3.5, pick: 'LV +3.5' })]),
      sameGame: parlayOf([leg(), leg({ market: 'total', side: 'over', line: 45.5, pick: 'Over 45.5' })]),
      // (its games list not naming its legs' games: a same-game parlay dressed up)
      lyingGames: { ...parlayOf([leg(), leg({ market: 'total', side: 'over', line: 45.5, pick: 'Over 45.5' })]), games: ['nfl_401872986', 'nfl_1'] },
      // (odds that aren't American, a payout or a result of its own, a leg with a stake or a result)
      notAmerican: parlayOf(legs, { odds: 50 }),
      payout: parlayOf(legs, { payout: 300 }),
      profit: parlayOf(legs, { profit: 300 }),
      won: parlayOf(legs, { status: 'won' }),
      legStake: parlayOf([{ ...legs[0], stake: 10 }, legs[1]]),
      legStatus: parlayOf([{ ...legs[0], status: 'won' }, legs[1]]),
      // (a leg on a game begun, or with no game)
      started: parlayOf([leg({ start: later(-1) }), legs[1]]),
      noEvent: parlayOf([(({ event: _e, ...l }) => l)(legs[0]), legs[1]]),
      // (an event that isn't a game's id: a query string for the settler's reads, a leading zero ESPN takes as the
      // same game (two legs on one game past the games check), a number)
      queryEvent: parlayOf([leg({ event: '401872986&x=/a' }), legs[1]]),
      paddedEvent: parlayOf([leg(), leg({ event: '0401872986', market: 'total', side: 'over', line: 45.5, pick: 'Over 45.5' })]),
      numberEvent: parlayOf([leg({ event: 401872986 }), legs[1]]),
      // (a leg starting past the 60 days a straight bet's can: never due, its stake held)
      farLeg: parlayOf([legs[0], leg({ event: '401872987', start: later(24 * 65) })]),
      // (its start after its first leg's: the settler would look too late)
      lateStart: parlayOf(legs, { start: later(40) }),
      // (a straight bet can't claim to be part of one)
      straightKind: playBet({ kind: 'parlay' }),
    };
    for (const [name, b] of Object.entries(bad)) {
      try {
        await assertFails(place(db, 'ann', `bad-${name}`, b, b.stake));
      } catch (error) {
        throw new Error(`${name}: ${error.message}`);
      }
    }
    // (its stake out of the wallet, exactly)
    await assertFails(place(db, 'ann', 'p-short', parlayOf(legs), 5));
    // (ten prop legs, the biggest a parlay gets: inside the rules' 1,000 expressions)
    const props = Array.from({ length: 10 }, (_, i) => leg({ sport: 'nhl', event: String(404000000 + i), matchup: 'SEA @ DET', market: 'prop', side: 'over', line: 24.5, odds: 120, pick: 'John Gibson Over 24.5 Saves', propType: 'saves', athlete: '2590824', player: 'John Gibson', statLabel: 'Saves', ref: '401990001:prop:saves:2590824' }));
    await assertSucceeds(place(db, 'ann', 'p-props', parlayOf(props, { stake: 1 })));
    // (never settled from the browser)
    await assertFails(updateDoc(doc(db, 'users', 'ann', 'bets', 'p1'), { status: 'won', profit: 50 }));
  });

  test('a preview prop (preview: true): a prop at -110, not the bot’s, no band or Kelly score; a parlay’s leg too', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    const preview = (over = {}) =>
      playBet({ market: 'prop', side: 'over', line: 221.5, odds: -110, pick: 'Sam Darnold Over 221.5 Pass Yds', botPick: false, tier: undefined, kelly: undefined, propType: 'passYds', athlete: '3912547', player: 'Sam Darnold', statLabel: 'Pass Yds', ref: '401872986:prop:passYds:3912547', preview: true, stake: 5, ...over });
    // (the page's shape: no tier, no Kelly score)
    const clean = (b) => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
    await assertSucceeds(place(db, 'ann', 'pv1', clean(preview())));
    await assertSucceeds(place(db, 'ann', 'pv2', clean(preview({ side: 'under' }))));
    const bad = {
      otherPrice: preview({ odds: -105 }),
      plusPrice: preview({ odds: 120 }),
      botPick: preview({ botPick: true }),
      tier: preview({ tier: 'love' }),
      kelly: preview({ kelly: 3.1 }),
      notTrue: preview({ preview: false }),
      notBool: preview({ preview: 'yes' }),
      spread: playBet({ preview: true, odds: -110, botPick: false, tier: undefined, kelly: undefined }),
    };
    for (const [name, b] of Object.entries(bad)) {
      try {
        await assertFails(place(db, 'ann', `pv-bad-${name}`, clean(b), b.stake));
      } catch (error) {
        throw new Error(`${name}: ${error.message}`);
      }
    }
    // (a parlay's preview legs: the leg's tag a field it may carry, its price the settler's to hold to -110)
    const pleg = (over = {}) => {
      const { stake: _s, run: _r, placedAt: _p, status: _st, ...l } = clean(preview(over));
      return l;
    };
    await assertSucceeds(place(db, 'ann', 'pv-parlay', parlayOf([pleg(), pleg({ event: '401872987', matchup: 'KC @ DEN', ref: '401872987:prop:passYds:3912547', start: later(30) })])));
    // (ten preview prop legs, the biggest: inside the rules' limit)
    const ten = Array.from({ length: 10 }, (_, i) => pleg({ event: String(405000000 + i) }));
    await assertSucceeds(place(db, 'ann', 'pv-ten', parlayOf(ten, { stake: 1 })));
  });

  test('a reload: back to 500 (its start with it), one more reset; nothing else, and no settling from the browser', async () => {
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    await assertSucceeds(place(db, 'ann', 'b1', playBet({ stake: 400 })));
    const wallet = doc(db, 'users', 'ann', 'wallet', 'main');
    const reload = (over = {}) => ({ balance: 500, start: 500, resets: increment(1), resetAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over });
    await assertFails(updateDoc(wallet, reload({ resets: increment(2) })));
    await assertFails(updateDoc(wallet, reload({ balance: 1000 })));
    await assertFails(updateDoc(wallet, reload({ balance: 1000, start: 1000 })));
    await assertFails(updateDoc(wallet, { balance: 500, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(wallet, reload({ start: 5000 })));
    await assertSucceeds(updateDoc(wallet, reload()));
    const after = (await getDoc(wallet)).data();
    assertBalance({ data: () => after }, 500);
    if (after.start !== 500) throw new Error(`start ${after.start}`);
    if (after.resets !== 1) throw new Error(`resets ${after.resets}`);
    // (a bet in the new run says so)
    await assertFails(place(db, 'ann', 'b2', playBet({ run: 0 })));
    await assertSucceeds(place(db, 'ann', 'b2', playBet({ run: 1 })));
    // (the browser never settles: no bet updates, no balance up)
    await assertFails(updateDoc(doc(db, 'users', 'ann', 'bets', 'b1'), { status: 'won', profit: 363.64 }));
    await assertFails(updateDoc(wallet, { balance: 5000, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(wallet, { balance: increment(500), lastBet: 'b1', updatedAt: serverTimestamp() }));
  });

  test('a wallet made at 1,000 before the change: its balance stands, its bets keep its start, a reload takes it to 500', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users', 'ann', 'wallet', 'main'), { balance: 1000, start: 1000, resets: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    const db = as('ann');
    const wallet = doc(db, 'users', 'ann', 'wallet', 'main');
    await assertSucceeds(place(db, 'ann', 'b1', playBet({ stake: 600 })));
    assertBalance(await getDoc(wallet), 400);
    // (a bet can't move the start)
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', 'ann', 'bets', 'b2'), playBet());
    batch.update(wallet, { balance: increment(-25), start: 500, lastBet: 'b2', updatedAt: serverTimestamp() });
    await assertFails(batch.commit());
    // (a reload: 500, not the 1,000 it began at)
    await assertFails(updateDoc(wallet, { balance: 1000, resets: increment(1), resetAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(wallet, { balance: 500, resets: increment(1), resetAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(wallet, { balance: 500, start: 500, resets: increment(1), resetAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    const after = (await getDoc(wallet)).data();
    if (after.balance !== 500 || after.start !== 500 || after.resets !== 1) throw new Error(JSON.stringify(after));
  });

  test('who sees the bets: the owner always; others by the open bets and history settings', async () => {
    await seedProfile('ann', { openBets: 'public', betHistory: 'private' });
    await seedProfile('bob');
    const db = as('ann');
    await assertSucceeds(setDoc(doc(db, 'users', 'ann', 'wallet', 'main'), newWallet()));
    await assertSucceeds(place(db, 'ann', 'b1'));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users', 'ann', 'bets', 'old'), { ...playBet(), start: later(-48), placedAt: Timestamp.now(), status: 'won', profit: 22.73 }));
    await assertSucceeds(getDoc(doc(db, 'users', 'ann', 'bets', 'old')));
    await assertSucceeds(getDocs(collection(db, 'users', 'ann', 'bets')));
    const bob = as('bob');
    await assertSucceeds(getDoc(doc(bob, 'users', 'ann', 'bets', 'b1')));
    await assertSucceeds(getDocs(query(collection(bob, 'users', 'ann', 'bets'), where('status', '==', 'open'))));
    await assertFails(getDoc(doc(bob, 'users', 'ann', 'bets', 'old')));
    await assertFails(getDocs(collection(bob, 'users', 'ann', 'bets')));
    await assertFails(getDoc(doc(bob, 'users', 'ann', 'wallet', 'main')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'ann', 'bets', 'old')));
    // (history public: the settled ones and the wallet too)
    await seedProfile('ann', { openBets: 'private', betHistory: 'public' });
    await assertSucceeds(getDoc(doc(bob, 'users', 'ann', 'bets', 'old')));
    await assertSucceeds(getDoc(doc(bob, 'users', 'ann', 'wallet', 'main')));
    await assertFails(getDoc(doc(bob, 'users', 'ann', 'bets', 'b1')));
    // (Clear history and the account going: the owner deletes; no one else)
    await assertFails(deleteDoc(doc(bob, 'users', 'ann', 'bets', 'old')));
    await assertSucceeds(deleteDoc(doc(db, 'users', 'ann', 'bets', 'old')));
    // (an open bet stays until it's settled: tests/rules/security)
    await assertFails(deleteDoc(doc(db, 'users', 'ann', 'bets', 'b1')));
    await assertSucceeds(deleteDoc(doc(db, 'users', 'ann', 'wallet', 'main')));
  });

  test('the settler’s documents: leaderboards read by anyone, tallies by the history setting, lines by no one; none written', async () => {
    await seedProfile('ann', { betHistory: 'public' });
    await seedProfile('cy', { betHistory: 'private' });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore();
      await setDoc(doc(f, 'leaderboards', 'week'), { rows: [] });
      await setDoc(doc(f, 'tallies', 'ann'), { all: { won: 1 } });
      await setDoc(doc(f, 'tallies', 'cy'), { all: { won: 1 } });
      await setDoc(doc(f, 'lines', 'nfl_401'), { snaps: [] });
    });
    const anyone = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anyone, 'leaderboards', 'week')));
    await assertSucceeds(getDoc(doc(as('bob'), 'tallies', 'ann')));
    await assertFails(getDoc(doc(as('bob'), 'tallies', 'cy')));
    await assertSucceeds(getDoc(doc(as('cy'), 'tallies', 'cy')));
    await assertFails(getDoc(doc(as('ann'), 'lines', 'nfl_401')));
    await assertFails(setDoc(doc(as('ann'), 'leaderboards', 'week'), { rows: [{ uid: 'ann', profit: 1e6 }] }));
    await assertFails(setDoc(doc(as('ann'), 'tallies', 'ann'), { all: { won: 99 } }));
    await assertFails(setDoc(doc(as('ann'), 'lines', 'nfl_401'), { snaps: [] }));
    // (the preview prop lines the settler looked at: no one's but the settler's)
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'propLines', 'nfl_401'), { seen: {} }));
    await assertFails(getDoc(doc(as('ann'), 'propLines', 'nfl_401')));
    await assertFails(setDoc(doc(as('ann'), 'propLines', 'nfl_401'), { seen: { '1|passYds': [0, 999] } }));
  });
});

function assertBalance(snap, want) {
  const got = snap.data().balance;
  if (Math.abs(got - want) > 1e-9) throw new Error(`balance ${got}, wanted ${want}`);
}
