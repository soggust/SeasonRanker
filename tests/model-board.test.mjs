// The betting board (board.mjs): every market the bettor priced, each side's Kelly score and band, and the
// settler's price check taking any price the board showed (settle-lib.mjs boardObservations)
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardMarkets, boardProp, buildBoard, seenOf, seenUpdate, SEEN_KEEP } from '../libs/ranker/scripts/model/board.mjs';
import { kellyOf, scoreParts } from '../libs/ranker/scripts/model/picks.mjs';
import { boardObservations, checkPrice } from '../libs/ranker/scripts/accounts/settle-lib.mjs';

const NOW = new Date('2026-10-11T12:00:00Z');
const game = { id: '401', date: '2026-10-12T00:20:00Z', awayAbbr: 'KC', homeAbbr: 'BUF', away: 12, home: 2 };
const markets = [
  { market: 'spread', sides: [{ side: 'home', line: -3.5, odds: -110, model: 0.56, fair: 0.5, push: 0 }, { side: 'away', line: 3.5, odds: -110, model: 0.44, fair: 0.5, push: 0 }] },
  { market: 'total', sides: [{ side: 'over', line: 47.5, odds: -105, model: 0.8, fair: 0.49 }, { side: 'under', line: 47.5, odds: -115, model: 0.2, fair: 0.51 }] },
  { market: 'ml', sides: [{ side: 'home', line: null, odds: -170, model: 0.6, fair: 0.61 }, { side: 'away', line: null, odds: 145, model: 0.4, fair: 0.39 }] },
];
const prop = (over, under, extra = {}) => ({
  prop: { athlete: { id: 3139477, name: 'Patrick Mahomes', team: 12 }, stat: { key: 'passYds', label: 'Passing Yards' }, line: 245.5, prices: { over, under } },
  side: 'over',
  sides: [
    { side: 'over', odds: over, p: 0.58, ev: 0.1 },
    { side: 'under', odds: under, p: 0.42, ev: -0.2 },
  ],
  ...extra,
});

test('kellyOf is the picks’ Kelly score', () => {
  const bet = { market: 'spread', odds: -110, p: 0.56, fair: 0.5, model: 0.6 };
  assert.equal(kellyOf(bet.odds, bet.p), scoreParts(bet, {}).score);
});

test('boardMarkets: both sides of each market, Kelly score and band; past the gap a PASS both sides (the gap a shadow, never a CHECK)', () => {
  const k = boardMarkets(markets, () => 1);
  assert.deepEqual(Object.keys(k), ['spread', 'total', 'ml']);
  const [home, away] = k.spread;
  assert.equal(home.s, 'home');
  assert.equal(home.l, -3.5);
  assert.equal(home.o, -110);
  assert.equal(home.ks, kellyOf(-110, 0.56));
  assert.equal(home.b, 'lock', 'a 7.6% Kelly at a 56% chance: a lock since the 55% bar');
  assert.equal(away.b, 'low');
  // (the total's model 31 points off the book: skipped, a PASS both sides (checks.mjs shadowOf: the gap's a
  // shadow, as the run keeps it))
  assert.equal(k.total[0].b, 'low');
  assert.equal(k.total[1].b, 'low');
  assert.equal(k.ml[0].l, null);
});

test('boardProp: both prices, each side’s Kelly and band; an unknown side null; a CHECK’s side check', () => {
  const p = boardProp(prop(-115, -105), 'T');
  assert.deepEqual(p.o, [-115, -105]);
  assert.equal(p.id, '3139477');
  assert.equal(p.t, '12');
  assert.equal(p.k, 'passYds');
  assert.equal(p.c, 0.58);
  assert.equal(p.ks[0], kellyOf(-115, 0.58));
  assert.equal(p.b[1], 'low');
  const half = boardProp(prop(-115, null), 'T');
  assert.deepEqual([half.o[1], half.ks[1], half.b[1]], [null, null, null]);
  // (a CHECK the run shows (a role's at a model Kelly of +10 or more) its side check; a gap's, or a role's
  // under the bar, a shadow: a PASS, sk)
  // (a shadow's why its sw; at an assumed price (not priced) a role's a shadow, no Kelly to judge it by)
  const role = { priced: true, guard: { skip: true, kind: 'role', role: 'group-out' }, odds: -115, model: 0.7, fair: 0.5 };
  const chk = boardProp(prop(-115, -105, role), 'T');
  assert.deepEqual([chk.b, chk.sk, chk.sw], [['check', 'low'], undefined, undefined]);
  const small = boardProp(prop(-115, -105, { ...role, model: 0.55 }), 'T');
  assert.deepEqual([small.b, small.sk, small.sw], [['low', 'low'], 1, 'small']);
  const assumed = boardProp(prop(-115, -105, { ...role, priced: false }), 'T');
  assert.deepEqual([assumed.b, assumed.sk, assumed.sw], [['low', 'low'], 1, 'small']);
  const gap = boardProp(prop(-115, -105, { ...role, guard: { skip: true, kind: 'gap' } }), 'T');
  assert.deepEqual([gap.b, gap.sk, gap.sw], [['low', 'low'], 1, 'gap']);
  const pass = boardProp(prop(-115, -105, { guard: { skip: true, why: 'out' } }), 'T');
  assert.deepEqual([pass.b, pass.sk, pass.sw], [['low', 'low'], 1, undefined]);
});

test('buildBoard: the games not started, the bot’s sides marked, a prop kept between asks unless its line moved', () => {
  const k = boardMarkets(markets, () => 1);
  const row = boardProp(prop(-115, -105), 'T1');
  const other = { ...row, id: '99', n: 'Isiah Pacheco', k: 'rushYds', l: 60.5 };
  const started = { id: '400', start: '2026-10-11T11:00:00Z', m: 'A @ B', k: {}, p: [] };
  const games = new Map([['401', { game, markets: k, at: 'T1' }]]);
  const props = new Map([['401', { rows: [row, other], whole: true, lines: new Map() }]]);
  const bets = [{ event: '401', market: 'spread', side: 'home', status: 'open' }];
  const checks = [{ event: '401', market: 'prop', propType: 'passYds', athlete: 3139477, side: 'over' }];
  const b = buildBoard('nfl', { prev: { games: [started] }, games, props, bets, checks, now: NOW });
  assert.equal(b.games.length, 1);
  const g = b.games[0];
  assert.deepEqual([g.id, g.m, g.a, g.h], ['401', 'KC @ BUF', ['KC', '12'], ['BUF', '2']]);
  assert.equal(g.k.spread[0].bot, 'bet');
  assert.equal(g.p.find((p) => p.k === 'passYds').bk, 'check');
  // (the next run: its props not asked; one's line moved on the book's board, the other kept at its price)
  const next = buildBoard('nfl', { prev: JSON.parse(JSON.stringify(b)), games: new Map([['401', { game, markets: boardMarkets(markets, () => 1), at: 'T2' }]]), props: new Map([['401', { rows: [], whole: false, lines: new Map([['rushYds:99', 62.5], ['passYds:3139477', 245.5]]) }]]), now: NOW });
  assert.deepEqual(next.games[0].p.map((p) => p.k), ['passYds']);
  // (its time kept: nothing changed)
  assert.equal(next.games[0].at, 'T1');
  assert.equal(next.games[0].p[0].bk, undefined);
  // (once it starts, gone)
  assert.equal(buildBoard('nfl', { prev: next, now: new Date(game.date) }).games.length, 0);
});

test('seenUpdate keeps every price shown, its first and last showing, a week past the start', () => {
  const b = buildBoard('nfl', { games: new Map([['401', { game, markets: boardMarkets(markets, () => 1), at: 'T' }]]), props: new Map([['401', { rows: [boardProp(prop(-115, -105), 'T')], whole: true }]]), now: NOW });
  const s1 = seenUpdate(null, b, NOW);
  const t = NOW.getTime();
  assert.deepEqual(s1.games['401'].o['prop|over|245.5|-115|passYds|3139477'], [t, t]);
  assert.deepEqual(s1.games['401'].o['ml|away||145||'], [t, t]);
  const moved = JSON.parse(JSON.stringify(b));
  moved.games[0].p[0].o = [-125, 105];
  const later = new Date(t + 36e5);
  const s2 = seenUpdate(s1, moved, later);
  assert.equal(Object.keys(s2.games['401'].o).length, seenOf(b.games[0]).length + 2);
  // (each entry's first and last showing: one gone from the board keeps its last)
  assert.deepEqual(s2.games['401'].o['ml|away||145||'], [t, later.getTime()]);
  assert.deepEqual(s2.games['401'].o['prop|over|245.5|-115|passYds|3139477'], [t, t]);
  assert.deepEqual(s2.games['401'].o['prop|over|245.5|-125|passYds|3139477'], [later.getTime(), later.getTime()]);
  assert.deepEqual(seenUpdate(s2, { sport: 'nfl', games: [] }, new Date(Date.parse(game.date) + SEEN_KEEP + 1)).games, {});
});

test('the settler takes a bet on any market the board showed, at its price', () => {
  const b = buildBoard('nfl', { games: new Map([['401', { game, markets: boardMarkets(markets, () => 1), at: 'T' }]]), props: new Map([['401', { rows: [boardProp(prop(-115, -105), 'T')], whole: true }]]), now: NOW });
  const obs = boardObservations(seenUpdate(null, b, NOW).games['401'].o);
  const bet = { market: 'prop', side: 'under', line: 245.5, odds: -105, propType: 'passYds', athlete: '3139477', placedAt: '2026-10-11T13:00:00Z' };
  assert.deepEqual(checkPrice(bet, obs), { ok: true, by: 'board' });
  // (a prop the board never showed: no board for it; a price far off it: not matched)
  assert.equal(checkPrice({ ...bet, athlete: '1' }, obs).ok, false);
  assert.equal(checkPrice({ ...bet, odds: 150 }, obs).ok, false);
  assert.deepEqual(checkPrice({ market: 'ml', side: 'away', line: null, odds: 145, placedAt: bet.placedAt }, obs), { ok: true, by: 'board' });
  assert.deepEqual(checkPrice({ market: 'total', side: 'under', line: 47.5, odds: -115, placedAt: bet.placedAt }, obs), { ok: true, by: 'board' });
  assert.equal(checkPrice({ market: 'total', side: 'under', line: 46.5, odds: -115, placedAt: bet.placedAt }, obs).ok, false);
  // (only while the board showed it: not before, nor long after its last showing)
  assert.equal(checkPrice({ ...bet, placedAt: '2026-10-11T11:00:00Z' }, obs).ok, false);
  assert.equal(checkPrice({ ...bet, placedAt: '2026-10-11T13:31:00Z' }, obs).ok, false);
  assert.equal(checkPrice({ ...bet, placedAt: '2026-10-11T13:29:00Z' }, obs).ok, true);
});
