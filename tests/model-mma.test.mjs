// The model desk's MMA league (libs/ranker/scripts/model/mma-desk.mjs, fights-model.mjs, leagues.mjs mma): the
// cards' bouts from ESPN's board and their matching to The Odds API's by name, the point-in-time rows the model
// fits on, the fit itself on made-up bouts, the pick's edge rule and stakes, the grading and the voids, and the
// picks file. No network: the boards are made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES, TIMING } from '../libs/ranker/scripts/model/leagues.mjs';
import { SPORT_KEYS } from '../libs/ranker/scripts/model/oddsapi.mjs';
import { boutsOf, buildFightPicks, linesOf, matchBout, mergeBouts, nameKey, nameMatch, pickFor, reasonOf, settleBout } from '../libs/ranker/scripts/model/mma-desk.mjs';
import { TERM_KEYS, advance, backtest, buildRows, featuresOf, fitLogistic, fitRows, fitSoft, freshFighter, predict, ratesOf, resultOf, sideNumbers } from '../libs/ranker/scripts/model/fights-model.mjs';
import { isTracked } from '../libs/ranker/scripts/model/desk.mjs';

const H = 36e5;
const NOW = new Date('2026-10-15T12:00:00Z');

test('leagues: mma is a fights league with its Odds API key, a 72-hour window and a 4-hour last chance', () => {
  assert.equal(LEAGUES.mma.fights, true);
  assert.equal(LEAGUES.mma.league, 'mma/ufc');
  assert.equal(SPORT_KEYS.mma, 'mma_mixed_martial_arts');
  assert.deepEqual(TIMING.mma, { lines: 72, props: 72, lastChance: 4 });
  assert.ok(LEAGUES.mma.edge > 0 && LEAGUES.mma.guard.ml > 0);
});

test('names: accents, spacing and case drop out; a shortened first name matches on the surname and initial; a changed surname never', () => {
  assert.equal(nameKey('Lucia Szabová'), nameKey('lucia szabova'));
  assert.equal(nameMatch('SuYoung You', 'Su Young You'), 2);
  assert.equal(nameMatch('Cristian Pérez', 'Cristian Perez'), 2);
  assert.equal(nameMatch('Alexander Volkanovski', 'Alex Volkanovski'), 1);
  assert.equal(nameMatch('Timmy Cuamba', 'Timothy Cuamba'), 1);
  assert.equal(nameMatch('Katlyn Cerminara', 'Katlyn Chookagian'), 0);
  assert.equal(nameMatch('Yana Santos', 'Luana Santos'), 0);
});

const bout = (home, away, date = '2026-10-17T21:00Z', more = {}) => ({ id: '1', key: '1:h-a', card: 'c', cardName: 'UFC Fight Night', date, division: 'Welterweight', rounds: 3, home: { id: 'h', name: home }, away: { id: 'a', name: away }, final: false, winner: null, off: null, ...more });
const event = (home, away, commence = '2026-10-18T02:45:00Z', books = null) => ({
  id: 'e1',
  commence_time: commence,
  home_team: home,
  away_team: away,
  bookmakers: books ?? [
    { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: home, price: 1.8 }, { name: away, price: 2.1 }] }] },
    { key: 'pinnacle', markets: [{ key: 'h2h', outcomes: [{ name: home, price: 1.85 }, { name: away, price: 2.05 }] }] },
  ],
});

test("matchBout: both fighters match (one exact at least) inside two days, the API's sides mapped to the bout's; a loose pair, a changed name or a far day don't", () => {
  const b = bout('Joaquin Buckley', 'Mike Malott');
  const straight = matchBout(b, [event('Joaquin Buckley', 'Mike Malott')]);
  assert.equal(straight.crossed, false);
  const crossed = matchBout(b, [event('Mike Malott', 'Joaquin Buckley')]);
  assert.equal(crossed.crossed, true);
  // (a shortened first name beside an exact one)
  assert.ok(matchBout(bout('Alexander Volkanovski', 'Movsar Evloev'), [event('Alex Volkanovski', 'Movsar Evloev')]));
  // (two loose matches: not taken)
  assert.equal(matchBout(bout('Alexander Volkanovski', 'Movsar Evloev'), [event('Alex Volkanovski', 'M. Evloev')]), null);
  // (a surname that changed: left unmatched, never guessed)
  assert.equal(matchBout(bout('Katlyn Cerminara', 'Mackenzie Stiller'), [event('Mackenzie Stiller', 'Katlyn Chookagian')]), null);
  // (a bout a week away from the event's time: another card)
  assert.equal(matchBout(b, [event('Joaquin Buckley', 'Mike Malott', '2026-10-25T02:45:00Z')]), null);
});

test("linesOf: DraftKings' prices for the bout's sides, Pinnacle's pair the fair chance where it has both, else DraftKings' own", () => {
  const b = bout('Joaquin Buckley', 'Mike Malott');
  const m = matchBout(b, [event('Mike Malott', 'Joaquin Buckley')]);
  const l = linesOf(b, m);
  // (crossed: the API's home is the bout's away)
  assert.equal(l.odds.home, 110);
  assert.equal(l.odds.away, -125);
  assert.equal(l.fairFrom, 'pinnacle');
  assert.ok(l.fair > 0.45 && l.fair < 0.5, `home fair ${l.fair}`);
  const own = linesOf(b, matchBout(b, [event('Joaquin Buckley', 'Mike Malott', '2026-10-18T02:45:00Z', [{ key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Joaquin Buckley', price: 1.5 }, { name: 'Mike Malott', price: 2.6 }] }] }])]));
  assert.equal(own.fairFrom, 'its own prices');
  assert.ok(own.fair > 0.6);
  // (a book without both prices: no lines)
  assert.equal(linesOf(b, matchBout(b, [event('Joaquin Buckley', 'Mike Malott', '2026-10-18T02:45:00Z', [{ key: 'pinnacle', markets: [] }])])), null);
});

const scoreboard = (bouts) => ({
  events: [
    {
      id: 'card1',
      name: 'UFC Fight Night: A vs. B',
      date: '2026-10-17T21:00Z',
      competitions: bouts.map(([id, h, a, extra = {}]) => ({
        id,
        date: '2026-10-17T21:00Z',
        type: { abbreviation: 'Lightweight' },
        format: { regulation: { periods: 3 } },
        status: { type: { completed: !!extra.completed, name: extra.status ?? 'STATUS_SCHEDULED' } },
        competitors: [
          { id: h, order: 1, athlete: { displayName: `Home ${h}` }, winner: extra.winner === 'home' },
          { id: a, order: 2, athlete: { displayName: `Away ${a}` }, winner: extra.winner === 'away' },
        ],
      })),
    },
  ],
});

test("boutsOf / mergeBouts: ESPN's bouts with their card, the first fighter listed the home side; a bout gone from a listed card is cancelled, one with a fighter replaced is off and the new pairing kept", () => {
  const first = boutsOf(scoreboard([['10', 'h1', 'a1'], ['11', 'h2', 'a2'], ['12', 'h3', 'a3']]));
  assert.equal(first.length, 3);
  assert.equal(first[0].home.name, 'Home h1');
  assert.equal(first[0].card, 'card1');
  let kept = mergeBouts([], first, NOW);
  assert.equal(kept.length, 3);
  assert.equal(kept[0].key, '10:h1-a1');
  // (bout 11 gone, bout 12's away fighter replaced, bout 10 as before)
  const next = boutsOf(scoreboard([['10', 'h1', 'a1'], ['12', 'h3', 'a9']]));
  kept = mergeBouts(kept, next, new Date(NOW.getTime() + H));
  const by = Object.fromEntries(kept.map((b) => [b.key, b]));
  assert.equal(by['10:h1-a1'].off, null);
  assert.equal(by['11:h2-a2'].off, 'cancelled');
  assert.equal(by['12:h3-a3'].off, 'replaced');
  assert.equal(by['12:h3-a9'].off, null);
  assert.ok(by['12:h3-a9'].firstSeen > by['10:h1-a1'].firstSeen);
  // (a final with its winner)
  const done = boutsOf(scoreboard([['10', 'h1', 'a1', { completed: true, winner: 'away' }]]));
  assert.equal(done[0].final, true);
  assert.equal(done[0].winner, 'away');
  const nc = boutsOf(scoreboard([['10', 'h1', 'a1', { completed: true }]]));
  assert.equal(nc[0].winner, null);
  const off = boutsOf(scoreboard([['10', 'h1', 'a1', { status: 'STATUS_CANCELED' }]]));
  assert.equal(off[0].off, 'canceled');
});

test('settleBout: won or lost on the winner; a draw or a no contest, a replaced fighter, a cancelled bout void; a postponed one void after 48 hours; a tracked row pays nothing', () => {
  const bet = { side: 'home', odds: -125, units: 1, start: '2026-10-17T21:00Z', fighters: { home: { id: 'h' }, away: { id: 'a' } } };
  const b = bout('H', 'A');
  const now = Date.parse('2026-10-18T06:00Z');
  assert.equal(settleBout(bet, b, now), null);
  assert.deepEqual(settleBout(bet, { ...b, final: true, winner: 'home' }, now), { status: 'won', profit: 0.8, final: 'H vs A: H won' });
  assert.equal(settleBout(bet, { ...b, final: true, winner: 'away' }, now).status, 'lost');
  assert.equal(settleBout(bet, { ...b, final: true, winner: 'away' }, now).profit, -1);
  assert.equal(settleBout(bet, { ...b, final: true, winner: null }, now).void, true);
  assert.equal(settleBout(bet, { ...b, away: { id: 'z', name: 'Z' } }, now).final, 'fighter replaced');
  assert.equal(settleBout(bet, { ...b, off: 'cancelled' }, now).void, true);
  assert.equal(settleBout(bet, { ...b, off: 'postponed' }, now), null);
  assert.equal(settleBout(bet, { ...b, off: 'postponed' }, now + 50 * H).void, true);
  const tracked = { ...bet, intent: 'track', units: 0, trackUnits: 0.5 };
  assert.equal(settleBout(tracked, { ...b, final: true, winner: 'home' }, now).profit, 0);
});

test("pickFor: the better side at the trusted chance; an edge bet only past the league's edge with a positive return, else tracked; 1u at most untested; a guard cuts it to 0.5; past the gap it's skipped", () => {
  // (Pinnacle's fair 52% home; DraftKings -110 / +100)
  const lines = { odds: { home: -110, away: 100 }, fair: 0.52 };
  // (the model 6 points over the book on the home side at trust 0.5: an edge)
  const edge = pickFor(0.58, lines, 0.5, { edge: 0.03, untested: true });
  assert.equal(edge.pick.side, 'home');
  assert.equal(edge.placed.intent, 'edge');
  assert.equal(edge.placed.units, 1, 'untested: 1u at most');
  assert.ok(edge.pick.p > 0.5 && edge.pick.p < 0.58);
  // (tested: the Kelly stake, up to 3)
  const tested = pickFor(0.58, lines, 1, { edge: 0.03, untested: false });
  assert.ok(tested.placed.units >= 1);
  // (under the edge: tracked at what it would have staked)
  const thin = pickFor(0.54, lines, 0.5, { edge: 0.03, untested: true });
  assert.equal(thin.placed.intent, 'track');
  assert.equal(thin.placed.units, 0);
  assert.ok(thin.placed.trackUnits >= 0.5);
  assert.match(thin.why, /under the league's edge/);
  // (the model on the dog: the away side)
  const dog = pickFor(0.42, lines, 0.5, { edge: 0.03, untested: true });
  assert.equal(dog.pick.side, 'away');
  assert.equal(dog.placed.intent, 'edge');
  // (a guard: the minimum, still an edge bet)
  const guarded = pickFor(0.58, lines, 0.5, { edge: 0.03, untested: true, guard: 'line moved -0.07 against it' });
  assert.equal(guarded.placed.units, 0.5);
  assert.deepEqual(guarded.flags, ['line moved -0.07 against it']);
  // (no API price: tracked whatever the edge)
  assert.equal(pickFor(0.58, lines, 0.5, { edge: 0.03, untested: true, apiPrice: false }).placed.intent, 'track');
  // (too far from the book: skipped)
  assert.match(pickFor(0.72, lines, 0.5, { edge: 0.03, untested: true }).skip, /too far from the market/);
});

// Made-up fights: ids, dates, a winner and a method (both fighters' stats in the cache by bout)
const fight = (id, date, a, b, method = 'UD', winner = 'a', rounds = 3, period = 3, clock = 300) => ({ id, league: 'ufc', event: 'UFC', date, division: 'Lightweight', rounds, period, clock, method, fighters: [{ id: a, name: a, winner: winner === 'a' }, { id: b, name: b, winner: winner === 'b' }] });

test('point in time: a bout’s row reads each fighter’s stats and record from the bouts before it alone; the terms are antisymmetric', () => {
  const fights = [fight('f1', '2024-01-06', 'X', 'Y', 'KO', 'a', 3, 1, 120), fight('f2', '2024-06-01', 'X', 'Z', 'UD', 'b'), fight('f3', '2025-01-11', 'X', 'Y', 'UD', 'a')];
  const cache = {
    X: { stats: { f1: [20, 40, 1, 0, 0, 0, 0, 0], f2: [60, 150, 0, 3, 5, 1, 2, 0], f3: [50, 100, 0, 0, 0, 0, 0, 0] }, bio: { age: 30, reach: 72, height: 70 }, bioAt: Date.parse('2026-10-01') },
    Y: { stats: { f1: [5, 20, 0, 0, 1, 0, 0, 0], f3: [40, 90, 0, 1, 2, 0, 0, 0] }, bio: { age: 34, reach: 74 }, bioAt: Date.parse('2026-10-01') },
    Z: { stats: { f2: [70, 140, 0, 0, 0, 0, 0, 0] }, bio: { age: 28, reach: 70 } },
  };
  const { rows, states } = buildRows(fights, cache);
  assert.equal(rows.length, 3);
  // (the first bout: debutants, no stats, the rating's starting chance: every stat term 0)
  assert.equal(rows[0].experienced, false);
  for (const k of ['slpm', 'strAcc', 'td15', 'streak', 'layoff']) assert.equal(rows[0].x[k], 0, k);
  // (X's reach over Y's, and his age under hers: read whatever the bouts)
  assert.equal(rows[0].x.reach, -2);
  assert.ok(rows[0].x.age < 0);
  // (the second bout: X has 2 minutes of stats (under the 15 that count: the averages), a knockout win, a streak of 1)
  assert.equal(rows[1].x.streak, 1 / 5);
  assert.equal(rows[1].x.slpm, 0, 'under 15 minutes: the average on both sides');
  // (the third bout: X's stats are f1 and f2 only, never f3's own; his streak -1 after the loss, Y's 0 after her one
  // loss... as a loss: -1 too, so the difference is 0)
  const X = states.get('X');
  assert.equal(X.n, 3);
  assert.equal(X.wins, 2);
  assert.equal(X.finishes, 1);
  const beforeF3 = rows[2].x;
  assert.equal(beforeF3.streak, 0);
  // (X: 20 + 60 landed in 120 + 900 seconds = 4.71 a minute; Y under 15 minutes: the average 3.6)
  assert.ok(Math.abs(beforeF3.slpm - (80 / 17 - 3.6)) < 1e-9, `slpm ${beforeF3.slpm}`);
  // (the row is antisymmetric: the same bout from Y's side flips every term)
  const sX = sideNumbers(freshFighter(), { r: 1600, rd: 100 }, cache.X.bio, cache.X.bioAt, Date.parse('2025-01-11'), 155);
  const sY = sideNumbers(freshFighter(), { r: 1500, rd: 120 }, cache.Y.bio, cache.Y.bioAt, Date.parse('2025-01-11'), 155);
  const xy = featuresOf(sX, sY);
  const yx = featuresOf(sY, sX);
  for (const k of TERM_KEYS) assert.ok(Math.abs(xy[k] + yx[k]) < 1e-9, `${k} not antisymmetric`);
  assert.ok(xy.rating > 0);
  // (a draw: no result, no streak; a no contest: nothing but a bout)
  assert.equal(resultOf(fight('d', '2025-02-01', 'X', 'Y', 'DRAW', 'none')), null);
  const s = freshFighter();
  advance(s, freshFighter(), fight('d', '2025-02-01', 'X', 'Y', 'DRAW', 'none'), null, null, false, 155);
  assert.equal(s.draws, 1);
  assert.equal(s.streak, 0);
  assert.deepEqual(ratesOf(freshFighter()).slpm, 3.6);
});

test('the fit: a made-up history where the better-rated fighter wins 70% puts a positive weight on the rating; a pure-noise term shrinks to 0; the prediction is a chance', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = [];
  for (let i = 0; i < 3000; i++) {
    const rating = rnd() * 2 - 1;
    const noise = rnd() * 2 - 1;
    const p = 1 / (1 + Math.exp(-1.2 * rating));
    const y = rnd() < p ? 1 : 0;
    const x = Object.fromEntries(TERM_KEYS.map((k) => [k, 0]));
    x.rating = rating;
    x.exp = noise;
    rows.push({ id: String(i), date: `2020-01-${String(1 + (i % 28)).padStart(2, '0')}`, x, y });
  }
  const fit = fitLogistic(rows, ['rating', 'exp']);
  assert.ok(fit.w[0] > 0 && fit.z[0] > 5, `rating w ${fit.w[0]} z ${fit.z[0]}`);
  assert.ok(Math.abs(fit.z[1]) < 3, `noise z ${fit.z[1]}`);
  const soft = fitSoft(rows, ['rating', 'exp']);
  const byKey = Object.fromEntries(soft.terms.map((t) => [t.key, t]));
  assert.ok(byKey.rating.soft > 0.9, `rating soft ${byKey.rating.soft}`);
  assert.equal(byKey.exp.weight, 0, 'noise: no weight');
  const { p } = predict(soft, { rating: 1, exp: 5 });
  assert.ok(p > 0.5 && p < 0.97);
  assert.ok(Math.abs(predict(soft, { rating: 0 }).p - 0.5) < 1e-9);
});

test("backtest: walks forward by half-year over the fit's leagues, each half scored against the rating alone and a coin", () => {
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = [];
  for (let i = 0; i < 2400; i++) {
    const year = 2022 + Math.floor(i / 600);
    const month = 1 + Math.floor((i % 600) / 50);
    const rating = rnd() * 2 - 1;
    const p = 1 / (1 + Math.exp(-rating));
    const x = Object.fromEntries(TERM_KEYS.map((k) => [k, 0]));
    x.rating = rating;
    rows.push({ id: String(i), date: `${year}-${String(month).padStart(2, '0')}-10`, league: 'ufc', experienced: true, x, y: rnd() < p ? 1 : 0, ratingP: p });
  }
  const bt = backtest(rows, { now: new Date('2026-01-15T00:00:00Z'), years: 2 });
  assert.ok(bt.halves.length >= 3, `${bt.halves.length} halves`);
  for (const h of bt.halves) {
    assert.ok(h.model.n > 0);
    assert.ok(h.coin.logLoss > 0.69 && h.coin.logLoss < 0.6932);
    assert.ok(h.model.logLoss < h.coin.logLoss);
  }
  assert.ok(bt.calibration.length >= 3);
  assert.equal(fitRows(rows.map((r) => ({ ...r, league: 'lfa' }))).length, 0, 'the regional archive is not fit on');
});

test('buildFightPicks: the open edge bets by their Kelly score with the page’s fields, published once locked; tracked rows and guarded bets never; the plain write-up reads the bet’s own numbers', () => {
  const start = new Date(NOW.getTime() + 30 * H).toISOString();
  const base = { event: '1', boutKey: '1:h-a', sport: 'mma', start, placedAt: NOW.toISOString(), matchup: 'Mike Malott @ Joaquin Buckley', fighters: { home: { id: 'h', name: 'Joaquin Buckley' }, away: { id: 'a', name: 'Mike Malott' } }, market: 'ml', line: null, book: 'DraftKings', fairFrom: 'pinnacle', status: 'open', profit: 0 };
  const edge = { ...base, id: '1:ml', side: 'home', odds: -125, model: 0.6, fair: 0.52, p: 0.56, ev: 0.008, intent: 'edge', units: 1, pick: 'Joaquin Buckley', context: { parts: { rating: 0.3, age: -0.1, strDef: 0.05 }, trust: 0.5, untested: true, flags: [] } };
  const tracked = { ...base, id: '2:ml', event: '2', side: 'away', odds: 110, model: 0.5, fair: 0.48, p: 0.49, ev: -0.02, intent: 'track', units: 0, trackUnits: 0.5, pick: 'Mike Malott', context: { parts: {}, flags: [] } };
  const guarded = { ...edge, id: '3:ml', event: '3', units: 0.5, context: { ...edge.context, guard: 'line moved' } };
  const ledger = { sport: 'mma', bets: [edge, tracked, guarded] };
  const trust = { ml: { trust: 0.5, fitted: false } };
  const out = buildFightPicks(ledger, trust, new Map(), NOW);
  assert.equal(out.sport, 'mma');
  assert.equal(out.picks.length, 1);
  const row = out.picks[0];
  assert.equal(row.pick, 'Joaquin Buckley');
  assert.equal(row.kind, 'moneyline');
  assert.equal(row.level, 'medium');
  assert.equal(row.teams.length, 2);
  assert.equal(row.teams[1].abbr, 'Joaquin Buckley');
  assert.match(row.teams[1].logo, /headshots\/mma\/players\/full\/h\.png/);
  assert.equal(row.athlete, 'h');
  assert.equal(edge.shown, true, 'shown, not yet locked');
  assert.ok(!edge.published);
  assert.equal(edge.publishedLevel, 'medium');
  // (locked: published)
  const late = new Date(Date.parse(start) - 10 * 60e3);
  buildFightPicks(ledger, trust, new Map(), late);
  assert.equal(edge.published, true);
  assert.ok(!isTracked(edge));
  const reason = reasonOf(edge);
  assert.match(reason, /60% chance against the book's 52%/);
  assert.match(reason, /the rating/);
  assert.match(reason, /untested/);
  assert.match(reason, /56%/);
});
