// The other books' consensus (oddsapi.mjs consensusOf, props.mjs apiProps): the other US books asked for a
// game's props only for the markets DraftKings returned on its last ask (so they add no market, and no credit,
// of their own), their de-vigged prices at DraftKings' line taken to a median fair chance, kept beside
// DraftKings' own on the lines, the props, the rows and the board, for the data only; the other books missing,
// none, and nothing changes. The responses below are recorded in The Odds API's v4 shape (no call is made)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENSUS_MIN, OUTLIER, PROP_BOOKS, SHARP, WIDE_BOOKS, american, consensusFields, consensusOf, linesFromEvent, propAsks } from '../libs/ranker/scripts/model/oddsapi.mjs';
import { API_MARKETS, apiProps, propsFromBodies, withApiPrices } from '../libs/ranker/scripts/model/props.mjs';
import { boardMarkets, boardProp } from '../libs/ranker/scripts/model/board.mjs';
import { BOOK } from '../libs/ranker/scripts/model/leagues.mjs';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// (American odds as the API's decimal price)
const dec = (o) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

// (a book's prop market: [player, line, over, under] rows, American)
const propMarket = (key, rows) => ({ key, last_update: '2026-10-13T22:00:00Z', outcomes: rows.flatMap(([who, point, over, under]) => [{ name: 'Over', description: who, price: dec(over), point }, { name: 'Under', description: who, price: dec(under), point }]) });
const book = (key, markets) => ({ key, title: key, last_update: '2026-10-13T22:00:00Z', markets });
const eventBody = (bookmakers) => ({ id: 'ev1', sport_key: 'basketball_nba', commence_time: '2026-10-14T23:30:00Z', home_team: 'Boston Celtics', away_team: 'New York Knicks', bookmakers });

// The first ask: DraftKings alone; it posts points and rebounds, not the rest
const FIRST = eventBody([book('draftkings', [propMarket('player_points', [['Jayson Tatum', 27.5, -115, -105]]), propMarket('player_rebounds', [['Jayson Tatum', 8.5, 115, -140]])])]);
// The next: the other books too for those two (one at another line, one with a side missing), DraftKings' alone
// for the rest (assists posted since)
const WIDE = eventBody([
  book('draftkings', [propMarket('player_points', [['Jayson Tatum', 27.5, -115, -105]]), propMarket('player_rebounds', [['Jayson Tatum', 8.5, 115, -140]])]),
  book('fanduel', [propMarket('player_points', [['Jayson Tatum', 27.5, -110, -110]]), propMarket('player_rebounds', [['Jayson Tatum', 8.5, -110, -110]])]),
  book('betmgm', [propMarket('player_points', [['Jayson Tatum', 27.5, -120, 100]]), propMarket('player_rebounds', [['Jayson Tatum', 8.5, -105, -115]])]),
  book('williamhill_us', [propMarket('player_points', [['Jayson Tatum', 28.5, -110, -110]])]),
  book('fanatics', [{ key: 'player_points', outcomes: [{ name: 'Over', description: 'Jayson Tatum', price: 1.9, point: 27.5 }] }]),
]);
const OWN = eventBody([book('draftkings', [propMarket('player_assists', [['Jayson Tatum', 5.5, -120, 100]])])]);

test('the books: up to 10 named (one region), DraftKings and Pinnacle among them; props first asked of DraftKings alone', () => {
  assert.ok(WIDE_BOOKS.length <= 10, 'every 10 bookmakers named is one region');
  assert.equal(new Set(WIDE_BOOKS).size, WIDE_BOOKS.length);
  assert.ok(WIDE_BOOKS.includes(BOOK) && WIDE_BOOKS.includes(SHARP));
  assert.deepEqual(PROP_BOOKS, [BOOK]);
  const all = Object.keys(API_MARKETS.nba);
  assert.deepEqual(propAsks(all, null), [{ markets: all, bookmakers: PROP_BOOKS }]);
  assert.deepEqual(propAsks(all, []), [{ markets: all, bookmakers: PROP_BOOKS }]);
  // (DraftKings returned two: the others asked for exactly those; a market not the desk's never asked)
  const plan = propAsks(all, ['player_rebounds', 'player_points', 'player_blocks']);
  assert.deepEqual(plan[0], { markets: ['player_points', 'player_rebounds'], bookmakers: WIDE_BOOKS });
  assert.deepEqual(plan[1], { markets: all.filter((m) => m !== 'player_points' && m !== 'player_rebounds'), bookmakers: PROP_BOOKS });
  // (every market DraftKings returned: the one wide ask)
  assert.deepEqual(propAsks(all, all), [{ markets: all, bookmakers: WIDE_BOOKS }]);
});

test("apiProps: the markets parameter of the other books' ask is exactly DraftKings' returned set; their consensus at its line", async () => {
  const calls = [];
  const recorded = (bodies) => async (feature, route, params) => {
    calls.push({ feature, route, params });
    return bodies[params.bookmakers === PROP_BOOKS.join(',') ? 'own' : 'wide'];
  };
  const afford = () => true;
  // (the first ask: DraftKings alone, every market)
  const first = await apiProps('nba', 'ev1', { known: null, ask: recorded({ own: FIRST }), afford });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].feature, 'props');
  assert.equal(calls[0].route, '/sports/basketball_nba/events/ev1/odds');
  assert.equal(calls[0].params.bookmakers, 'draftkings');
  assert.equal(calls[0].params.markets, Object.keys(API_MARKETS.nba).join(','));
  assert.deepEqual(first.dkMarkets.sort(), ['player_points', 'player_rebounds']);
  assert.equal(first.get('Jayson Tatum|pts').consensus, null, 'DraftKings alone: no consensus');
  // (the next ask, by what it returned)
  calls.length = 0;
  const next = await apiProps('nba', 'ev1', { known: first.dkMarkets, ask: recorded({ wide: WIDE, own: OWN }), afford });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params.markets.split(',').sort(), [...first.dkMarkets].sort(), "the others asked only for DraftKings' returned markets");
  assert.equal(calls[0].params.bookmakers, WIDE_BOOKS.join(','));
  assert.deepEqual(calls[1].params, { markets: 'player_assists,player_threes,player_points_rebounds_assists', bookmakers: 'draftkings' });
  assert.deepEqual(next.dkMarkets.sort(), ['player_assists', 'player_points', 'player_rebounds']);
  // (points: FanDuel and BetMGM at 27.5 with both sides; Caesars at another line and Fanatics one-sided left out)
  const pts = next.get('Jayson Tatum|pts');
  assert.equal(pts.over, -115);
  assert.equal(pts.under, -105);
  assert.equal(pts.consensus.n, 2);
  const mgm = (120 / 220) / (120 / 220 + 100 / 200);
  near(pts.consensus.fair, (0.5 + mgm) / 2);
  assert.equal(pts.consensus.outlier, undefined, 'no side 3% better at DraftKings');
  // (rebounds: DraftKings' +115 over against a consensus near even: its outlier)
  const reb = next.get('Jayson Tatum|reb');
  assert.equal(reb.consensus.outlier, 'over');
  assert.ok(reb.consensus.by >= OUTLIER);
  assert.equal(next.get('Jayson Tatum|ast').consensus, null);
  // (a failed call: nothing, as before)
  assert.equal(await apiProps('nba', 'ev1', { known: first.dkMarkets, ask: async () => null, afford }), null);
  // (the allowance can't pay: nothing asked)
  calls.length = 0;
  assert.equal(await apiProps('nba', 'ev1', { ask: recorded({ own: FIRST }), afford: () => false }), null);
  assert.equal(calls.length, 0);
});

test("consensusOf: the median of the other books' de-vigged pairs, CONSENSUS_MIN of them or none; the outlier side by its return", () => {
  assert.equal(CONSENSUS_MIN, 2);
  assert.equal(consensusOf([[-110, -110]], [-110, -110], ['over', 'under']), null);
  assert.equal(consensusOf([], [-110, -110], ['over', 'under']), null);
  const c = consensusOf([[-110, -110], [-130, 110], [-150, 130]], [-110, -110], ['home', 'away']);
  assert.equal(c.n, 3);
  near(c.fair, (130 / 230) / (130 / 230 + 100 / 210));
  assert.equal(c.outlier, 'home', "-110 on a 56% side: DraftKings' price beats the consensus");
  near(c.by, c.fair * dec(-110) - 1);
  // (a broken pair skipped)
  assert.equal(consensusOf([[-110, null], [NaN, -110], [-110, -110]], [-110, -110], ['over', 'under']), null);
});

test("consensusFields: a row's side's fair by the other books, how many, and DraftKings' outlier side; none without", () => {
  const c = { fair: 0.56, n: 4, outlier: 'home', by: 0.069 };
  assert.deepEqual(consensusFields(c, 'home', 'home'), { fairConsensus: 0.56, consensusN: 4, dkOutlier: 'home', dkBy: 0.069 });
  assert.deepEqual(consensusFields(c, 'away', 'home'), { fairConsensus: 0.44, consensusN: 4, dkOutlier: 'home', dkBy: 0.069 });
  assert.deepEqual(consensusFields({ fair: 0.5, n: 2 }, 'under', 'over'), { fairConsensus: 0.5, consensusN: 2 });
  assert.deepEqual(consensusFields(null, 'over', 'over'), {});
  assert.deepEqual(consensusFields(undefined, 'home', 'home'), {});
});

test("linesFromEvent: the other books' consensus at DraftKings' line only (Pinnacle among them); the fair chance still Pinnacle's or DraftKings'", () => {
  const outcomes = (a, b, point = null) => ({ outcomes: [{ name: 'Dallas Cowboys', price: a, ...(point === null ? {} : { point }) }, { name: 'Tampa Bay Buccaneers', price: b, ...(point === null ? {} : { point: -point }) }] });
  const ev = (others) => ({
    home_team: 'Dallas Cowboys',
    away_team: 'Tampa Bay Buccaneers',
    bookmakers: [
      { key: 'draftkings', markets: [{ key: 'spreads', ...outcomes(1.91, 1.91, -3.5) }, { key: 'h2h', ...outcomes(1.5, 2.6) }] },
      { key: 'pinnacle', markets: [{ key: 'spreads', ...outcomes(2.0, 1.83, -3.5) }] },
      ...others,
    ],
  });
  // (Pinnacle alone at the line: one book, no consensus; the fair chance Pinnacle's as before)
  const alone = linesFromEvent(ev([{ key: 'fanduel', markets: [{ key: 'spreads', ...outcomes(1.91, 1.91, -3) }] }]));
  assert.equal(alone.spreads.consensus, null);
  near(alone.spreads.fair, alone.spreads.sharp);
  assert.equal(alone.h2h.consensus, null);
  // (FanDuel and BetMGM at -3.5 too: three books, the median; Pinnacle's still the fair chance)
  const three = linesFromEvent(ev([
    { key: 'fanduel', markets: [{ key: 'spreads', ...outcomes(1.87, 1.95, -3.5) }, { key: 'h2h', ...outcomes(1.5, 2.6) }] },
    { key: 'betmgm', markets: [{ key: 'spreads', ...outcomes(1.91, 1.91, -3.5) }, { key: 'h2h', ...outcomes(1.55, 2.5) }] },
  ]));
  assert.equal(three.spreads.consensus.n, 3);
  const fd = (1 / 1.87) / (1 / 1.87 + 1 / 1.95);
  near(three.spreads.consensus.fair, [three.spreads.sharp, fd, 0.5].sort((a, b) => a - b)[1]);
  near(three.spreads.fair, three.spreads.sharp);
  assert.equal(three.h2h.consensus.n, 2);
  assert.equal(three.totals, undefined);
  assert.equal(american(1.91), -110);
});

test("the props' consensus rides to the board and its rows; missing, nothing's added", () => {
  const api = propsFromBodies('nba', [WIDE]);
  const espn = [{ athlete: { id: 4065648, name: 'Jayson Tatum', team: 2 }, stat: { key: 'reb', label: 'Rebounds' }, line: 8.5, prices: null }, { athlete: { id: 1, name: 'Jaylen Brown', team: 2 }, stat: { key: 'pts', label: 'Points' }, line: 24.5, prices: null }];
  const [tatum, brown] = withApiPrices(espn, api);
  assert.equal(tatum.consensus.n, 2);
  assert.equal(brown.consensus, undefined, 'not on The Odds API: as before');
  const x = { prop: tatum, side: 'over', sides: [{ side: 'over', odds: 115, p: 0.5, ev: 0.05 }, { side: 'under', odds: -140, p: 0.5, ev: -0.1 }] };
  const row = boardProp(x, 'T');
  assert.equal(row.fc, tatum.consensus.fair);
  assert.equal(row.cn, 2);
  assert.equal(row.dv, 'over');
  const bare = boardProp({ ...x, prop: { ...tatum, consensus: undefined } }, 'T');
  assert.equal('fc' in bare || 'cn' in bare || 'dv' in bare, false);
  // (DraftKings alone: the main lines with a null consensus, the board as before)
  const own = withApiPrices(espn, propsFromBodies('nba', [FIRST]));
  assert.equal('consensus' in own[0], false);
});

test("boardMarkets: each side's consensus fair, its count, DraftKings' outlier side marked; none without", () => {
  const markets = [
    { market: 'spread', sides: [{ side: 'home', line: -3.5, odds: -110, model: 0.56, fair: 0.5, push: 0 }, { side: 'away', line: 3.5, odds: -110, model: 0.44, fair: 0.5, push: 0 }] },
    { market: 'total', sides: [{ side: 'over', line: 47.5, odds: -105, model: 0.5, fair: 0.49 }, { side: 'under', line: 47.5, odds: -115, model: 0.5, fair: 0.51 }] },
  ];
  const k = boardMarkets(markets, () => 1, { spread: { fair: 0.56, n: 4, outlier: 'home', by: 0.069 } });
  assert.deepEqual([k.spread[0].fc, k.spread[0].cn, k.spread[0].dv], [0.56, 4, 1]);
  assert.deepEqual([k.spread[1].fc, k.spread[1].cn, k.spread[1].dv], [0.44, 4, undefined]);
  assert.equal('fc' in k.total[0], false);
  const plain = boardMarkets(markets, () => 1);
  assert.equal('fc' in plain.spread[0], false);
  // (the rest of a side as before)
  assert.deepEqual(Object.keys(plain.spread[0]), ['s', 'l', 'o', 'c', 'ks', 'b']);
});
