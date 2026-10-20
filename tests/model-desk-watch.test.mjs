// The desk's watcher (scripts/desk-watch.mjs; DECISIONS.md D55): ESPN's DraftKings lines read free and compared,
// a material move, a window crossed, the NFL's inactives, a new out and a reporter's high-impact post made pending;
// a desk run started after an item was seen settles it; the dispatch's rate limit (no run queued or running, the
// cooldown after the last run's start, the day's cap). And D68: the poll every minute (the far days every 5), the news on
// one game the fast lane's, its own rate, and the two lanes never stepping on each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COOLDOWN_MIN, FAR_EVERY_MIN, FAST_COOLDOWN_MIN, FAST_MAX_PER_DAY, FAST_WORKFLOW, HIGH, INACTIVES, MAX_PER_DAY, MOVE, POLL_MIN, advance, dispatchDecision, fastDecision, fastGameOf, gamesOf, injuriesOf, material, phaseAt, postGame, settle, severe, sigOf } from '../scripts/desk-watch.mjs';
import { linesOf } from '../libs/ranker/scripts/model/espn.mjs';

const H = 36e5;
const NOW = Date.parse('2026-10-20T16:00:00Z');

// (an ESPN scoreboard event as site.api.espn.com gives it, DraftKings' odds on it: the shape of 2026-10-20's NBA board)
const event = (id, hours, { spread = -4.5, sh = '-112', sa = '-108', total = 232.5, over = '-105', under = '-115', mh = '-180', ma = '+150' } = {}) => ({
  id,
  date: new Date(NOW + hours * H).toISOString().replace(/:\d\d\.\d+Z$/, 'Z'),
  shortName: `A${id} @ H${id}`,
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: `h${id}`, name: `Home${id}` } },
        { homeAway: 'away', team: { id: `a${id}`, name: `Away${id}` } },
      ],
      odds: [
        {
          provider: { id: '100', name: 'DraftKings' },
          details: `H ${spread}`,
          overUnder: total,
          moneyline: { home: { close: { odds: mh }, open: { odds: '-192' } }, away: { close: { odds: ma }, open: { odds: '+160' } } },
          pointSpread: { home: { close: { line: String(spread), odds: sh } }, away: { close: { line: String(-spread), odds: sa } } },
          total: { over: { close: { line: `o${total}`, odds: over } }, under: { close: { line: `u${total}`, odds: under } } },
        },
      ],
    },
  ],
});

test('D55 the ESPN parse: DraftKings lines off the free scoreboard, as the desk reads them (espn.mjs linesOf), into the sig', () => {
  const l = linesOf(event('1', 5));
  assert.deepEqual(l.ml, { home: -180, away: 150 });
  assert.deepEqual(l.spread.home, { line: -4.5, odds: -112 });
  assert.equal(l.total.line, 232.5);
  const s = sigOf(l);
  assert.equal(s.spread, -4.5);
  assert.equal(s.total, 232.5);
  assert.ok(Math.abs(s.ml - 0.6164) < 0.001, `ml no-vig ${s.ml}`);
  // (another book's odds only, or none: no sig)
  const other = event('2', 5);
  other.competitions[0].odds[0].provider.name = 'Caesars';
  assert.equal(sigOf(linesOf(other)), null);
});

test('D55 material: half a point of spread or total, or 2.5 points of a side\'s no-vig chance', () => {
  const a = sigOf(linesOf(event('1', 5)));
  assert.equal(material(a, a), null);
  assert.match(material(a, sigOf(linesOf(event('1', 5, { spread: -5 })))), /spread -4.5 to -5/);
  assert.match(material(a, sigOf(linesOf(event('1', 5, { total: 233 })))), /total 232.5 to 233/);
  // (a cent or two on the price: not material; -180 to -215: 3.6 points, material)
  assert.equal(material(a, sigOf(linesOf(event('1', 5, { mh: '-185', ma: '+154' })))), null);
  assert.match(material(a, sigOf(linesOf(event('1', 5, { mh: '-215', ma: '+176' })))), /moneyline/);
  assert.equal(MOVE.line, 0.5);
  assert.equal(MOVE.chance, 0.025);
});

test('D55 the phases: early, the window, the last chance, started (leagues.mjs TIMING)', () => {
  assert.equal(phaseAt('nba', 50), 'early');
  assert.equal(phaseAt('nba', 20), 'window');
  assert.equal(phaseAt('nba', 2), 'last');
  assert.equal(phaseAt('nba', -0.1), 'started');
});

test('D55 the poll reads the scoreboards and the injury list free (a fetch stub: no network)', async () => {
  const urls = [];
  const fetchJson = async (u) => {
    urls.push(u);
    if (u.includes('/injuries')) return { injuries: [{ id: 'h1', injuries: [{ status: 'Out', date: '2026-10-20T15:00Z', athlete: { displayName: 'A Star', links: [{ href: 'https://www.espn.com/nba/player/_/id/123/a-star' }] } }] }] };
    return { events: [event('1', 5), event('3', 49), event('4', -1)] };
  };
  const games = await gamesOf('nba', { now: NOW, fetchJson });
  assert.ok(urls.every((u) => u.startsWith('https://site.api.espn.com/') && u.includes('/scoreboard?dates=')));
  assert.deepEqual([...games.keys()], ['1', '3']);
  assert.equal(games.get('1').phase, 'window');
  assert.equal(games.get('3').phase, 'early');
  const inj = await injuriesOf('nba', { fetchJson });
  assert.deepEqual(inj.get('h1:123'), { status: 'Out', date: '2026-10-20T15:00Z', name: 'A Star', team: 'h1' });
});

const gamesMap = (...evs) => new Map(evs.map((e) => [e.id, { id: e.id, sport: 'nba', name: e.shortName, start: Date.parse(e.date), hours: (Date.parse(e.date) - NOW) / H, phase: phaseAt('nba', (Date.parse(e.date) - NOW) / H), lines: (Date.parse(e.date) - NOW) / H <= 26, teams: [`h${e.id}`, `a${e.id}`], sig: sigOf(linesOf(e)) }]));

test('D55 pending: the first poll only learns; then a window opened, a line moved, a new out and a high-impact post are pending; a desk run started after settles them', () => {
  const first = advance(null, { games: { nba: gamesMap(event('1', 5), event('3', 50)) }, injuries: { nba: new Map() } }, NOW);
  assert.equal(first.added.length, 0);
  const later = NOW + 2 * H;
  const seen = {
    // (game 1's spread moved a point; game 3 now 47 hours out: inside its props window)
    games: { nba: gamesMap(event('1', 3, { spread: -5.5 }), event('3', 47)) },
    injuries: { nba: new Map([['h1:9', { status: 'Out', name: 'A Star', team: 'h1' }], ['zz:8', { status: 'Out', name: 'Elsewhere', team: 'zz' }]]) },
    posts: [
      { sport: 'nba', uri: 'at://1', at: new Date(later - 60e3).toISOString(), text: 'A Star (ankle) has been ruled out for tonight', handle: 'r.bsky.social' },
      { sport: 'nba', uri: 'at://2', at: new Date(later - 60e3).toISOString(), text: 'A Star had 30 points last night', handle: 'r.bsky.social' },
    ],
  };
  const { state, added } = advance(first.state, seen, later);
  const keys = added.map((a) => a.key);
  assert.ok(keys.includes('nba:3:window'), keys.join(' | '));
  assert.ok(keys.some((k) => k.startsWith('nba:1:move:')), keys.join(' | '));
  assert.ok(keys.includes('nba:injury:h1:9:Out'));
  assert.ok(!keys.some((k) => k.includes('zz:8')), 'a team not playing inside the window: not pending');
  assert.ok(keys.includes('nba:post:at://1'));
  assert.ok(!keys.includes('nba:post:at://2'), 'a post with no high-impact status: not pending');
  // (the same again: nothing new)
  assert.equal(advance(state, seen, later + 5 * 6e4).added.length, 0);
  // (a run that started before they were seen settles nothing; one after, all; the moved line's baseline is its new sig)
  assert.equal(settle(state, [{ status: 'completed', createdAt: new Date(later - 6e4).toISOString() }]).done.length, 0);
  const s = settle(state, [{ status: 'in_progress', createdAt: new Date(later + 6e4).toISOString() }]);
  assert.equal(s.state.pending.length, 0);
  assert.equal(s.state.baseline['nba:1'].spread, -5.5);
  assert.equal(advance(s.state, seen, later + 10 * 6e4).added.length, 0);
});

test('D55 the NFL inactives window: once a kickoff, 85 to 40 minutes out', () => {
  const base = advance(null, { games: {} }, NOW).state;
  const g = (min) => new Map([['7', { id: '7', sport: 'nfl', name: 'X @ Y', start: NOW + min * 6e4, hours: min / 60, phase: phaseAt('nfl', min / 60), teams: ['x', 'y'], sig: null }]]);
  assert.equal(advance(base, { games: { nfl: g(120) } }, NOW).added.filter((a) => a.key.endsWith('inactives')).length, 0);
  const a = advance(base, { games: { nfl: g(70) } }, NOW);
  assert.equal(a.added.filter((x) => x.key.endsWith('inactives')).length, 1);
  assert.equal(advance(a.state, { games: { nfl: g(60) } }, NOW).added.filter((x) => x.key.endsWith('inactives')).length, 0);
  assert.deepEqual(INACTIVES, { from: 85, to: 40 });
});

test('D55 the high-impact words and the severe statuses', () => {
  for (const t of ['X has been ruled out', 'X (knee) will not play Sunday', 'X is a healthy scratch', 'X placed on injured reserve', 'Y will start in goal tonight', 'X is out tonight']) assert.ok(HIGH.test(t), t);
  for (const t of ['X scored 30', 'X is questionable', 'X practiced in full']) assert.ok(!HIGH.test(t), t);
  assert.ok(severe('Out') && severe('Doubtful') && !severe('Questionable') && !severe('Day-To-Day'));
});

test('D55 the dispatch rate limit: nothing pending, a run queued or running, the cooldown, the day\'s cap', () => {
  const pending = [{ key: 'k', why: 'w' }];
  const ago = (min) => new Date(NOW - min * 6e4).toISOString();
  assert.equal(dispatchDecision({ pending: [], now: NOW }).go, false);
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'queued', createdAt: ago(90) }], now: NOW }).go, false);
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'in_progress', createdAt: ago(90) }], now: NOW }).go, false);
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: ago(COOLDOWN_MIN - 1) }], now: NOW }).go, false);
  // (the watcher's own dispatch, not listed yet, counts for the cooldown too)
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: ago(90) }], dispatched: [ago(3)], now: NOW }).go, false);
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: ago(COOLDOWN_MIN + 1) }], now: NOW }).go, true);
  const full = Array.from({ length: MAX_PER_DAY }, (_, i) => new Date(Date.parse('2026-10-20T00:00:00Z') + i * 6e4).toISOString());
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: ago(120) }], dispatched: full, now: NOW }).go, false);
  assert.equal(COOLDOWN_MIN, 20);
  assert.equal(MAX_PER_DAY, 40);
});

// ---- D68: the fast lane (model-desk-fast.yml), the poll every minute ----

test('D68 the rates: a poll a minute, the far days every 5, the full lane 20 minutes and 40 a day unchanged, the fast lane 5 minutes a game and 30 a day', () => {
  assert.equal(POLL_MIN, 1);
  assert.equal(FAR_EVERY_MIN, 5);
  assert.equal(COOLDOWN_MIN, 20);
  assert.equal(MAX_PER_DAY, 40);
  assert.equal(FAST_COOLDOWN_MIN, 5);
  assert.equal(FAST_MAX_PER_DAY, 30);
  assert.equal(FAST_WORKFLOW, 'model-desk-fast.yml');
  const ps1 = fs.readFileSync('scripts/desk-watch.ps1', 'utf8');
  assert.match(ps1, /\[int\]\$EveryMinutes = 1\b/);
  assert.match(ps1, /-ExecutionTimeLimit \(New-TimeSpan -Minutes 3\)/);
  assert.match(ps1, /-MultipleInstances IgnoreNew/);
});

test('D68 the far scoreboard days read every FAR_EVERY_MIN, kept between; the days inside the lines\' window every poll', async () => {
  const urls = [];
  const fetchJson = async (u) => {
    urls.push(u);
    return { events: [event('1', 5), event('3', 40)] };
  };
  const boards = {};
  const a = await gamesOf('nba', { now: NOW, fetchJson, boards });
  const first = urls.length;
  assert.ok(first >= 3, `${first} days read`);
  assert.ok(Object.keys(boards).length >= 1, 'a far day kept');
  urls.length = 0;
  const b = await gamesOf('nba', { now: NOW + 6e4, fetchJson, boards });
  assert.ok(urls.length < first, `the next minute reads only the near days (${urls.length} of ${first})`);
  assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort());
  assert.equal(b.get('3').phase, 'window');
  assert.deepEqual(b.get('1').names, ['Home1', 'Away1']);
  urls.length = 0;
  await gamesOf('nba', { now: NOW + FAR_EVERY_MIN * 6e4, fetchJson, boards });
  assert.equal(urls.length, first, 'after FAR_EVERY_MIN every day read again');
});

test('D68 the news on one game is the fast lane\'s: a new out on the player\'s team\'s game, a post by the team\'s name or a listed player\'s; one naming none or two games the full lane\'s', () => {
  const games = (...ids) => new Map(ids.map((id) => [id, { id, sport: 'nba', name: `A${id} @ H${id}`, start: NOW + 5 * H, hours: 5, phase: 'window', lines: true, teams: [`h${id}`, `a${id}`], names: [`Home${id}`, `Away${id}`], sig: null }]));
  const base = advance(null, { games: { nba: games('1', '2') }, injuries: { nba: new Map() } }, NOW).state;
  const later = NOW + 6e4;
  const post = (uri, text) => ({ sport: 'nba', uri, at: new Date(later - 3e4).toISOString(), text, handle: 'r.bsky.social' });
  const { added } = advance(base, {
    games: { nba: games('1', '2') },
    injuries: { nba: new Map([['h1:9', { status: 'Out', name: 'A Star', team: 'h1' }], ['a2:7', { status: 'Questionable', name: 'B Guard', team: 'a2' }]]) },
    posts: [post('at://a', 'Home2 say their center is ruled out tonight'), post('at://b', 'B Guard will not play'), post('at://c', 'Someone is out tonight'), post('at://d', 'Home1 and Away2 both: X ruled out')],
  }, later);
  const by = Object.fromEntries(added.map((x) => [x.key, x]));
  assert.equal(by['nba:injury:h1:9:Out'].fast, true);
  assert.equal(by['nba:injury:h1:9:Out'].game, '1');
  assert.equal(by['nba:injury:h1:9:Out'].until, NOW + 5 * H, 'held till the game starts');
  assert.equal(by['nba:post:at://a'].game, '2');
  assert.equal(by['nba:post:at://b'].game, '2', 'a listed player named: his team\'s game');
  assert.ok(!by['nba:post:at://c'].fast && !by['nba:post:at://c'].game, 'no game named: the full lane');
  assert.ok(!by['nba:post:at://d'].fast, 'two games named: the full lane');
  assert.equal(postGame('Home1 out', [...games('1').values()]).id, '1');
  assert.equal(postGame('home1 out', [...games('1').values()]), null, 'a team\'s name as written');
});

test('D68 the fast lane\'s rate: none while a fast run is queued or running or a full one queued; a running full one doesn\'t stop it; 5 minutes a game; 30 a day, then the full lane', () => {
  const ago = (min) => new Date(NOW - min * 6e4).toISOString();
  const item = (game, startH = 5) => ({ key: `k${game}`, sport: 'nba', game, fast: true, until: NOW + startH * H, why: 'w' });
  const pending = [item('1')];
  assert.equal(fastDecision({ pending: [], now: NOW }).go, false);
  assert.equal(fastDecision({ pending, runs: [{ status: 'queued', createdAt: ago(1), displayTitle: 'Model desk fast: nba 2' }], now: NOW }).go, false);
  assert.equal(fastDecision({ pending, runs: [{ status: 'in_progress', createdAt: ago(1), displayTitle: 'Model desk fast: nba 2' }], now: NOW }).go, false);
  assert.equal(fastDecision({ pending, others: [{ status: 'queued', createdAt: ago(1) }], now: NOW }).go, false);
  const go = fastDecision({ pending, others: [{ status: 'in_progress', createdAt: ago(3) }], now: NOW });
  assert.deepEqual([go.go, go.sport, go.game, go.items.length], [true, 'nba', '1', 1]);
  // (the game's own cooldown, by the watcher's dispatch or the run's title; another game goes)
  assert.equal(fastDecision({ pending, dispatched: [{ at: ago(FAST_COOLDOWN_MIN - 1), sport: 'nba', game: '1' }], now: NOW }).go, false);
  assert.equal(fastDecision({ pending, runs: [{ status: 'completed', createdAt: ago(2), displayTitle: 'Model desk fast: nba 1' }], now: NOW }).go, false);
  assert.equal(fastDecision({ pending, dispatched: [{ at: ago(FAST_COOLDOWN_MIN + 1), sport: 'nba', game: '1' }], now: NOW }).go, true);
  assert.equal(fastDecision({ pending: [item('1'), item('2')], dispatched: [{ at: ago(1), sport: 'nba', game: '1' }], now: NOW }).game, '2');
  // (the soonest game first)
  assert.equal(fastDecision({ pending: [item('1', 20), item('2', 3)], now: NOW }).game, '2');
  const full = Array.from({ length: FAST_MAX_PER_DAY }, (_, i) => ({ at: new Date(Date.parse('2026-10-20T00:00:00Z') + i * 6e4).toISOString(), sport: 'nba', game: String(100 + i) }));
  const capped = fastDecision({ pending, dispatched: full, now: NOW });
  assert.equal(capped.go, false);
  assert.equal(capped.capped, true);
  assert.deepEqual(fastGameOf({ displayTitle: 'Model desk fast: nhl 401892543' }), { sport: 'nhl', game: '401892543' });
  assert.equal(fastGameOf({ displayTitle: 'Model Desk - Bets' }), null);
});

test('D68 the full lane with two lanes: none while a fast run is queued or running; a fast run\'s start not its cooldown; a fast run settles only its own game\'s news', () => {
  const ago = (min) => new Date(NOW - min * 6e4).toISOString();
  const pending = [{ key: 'k', why: 'w' }];
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: ago(90) }], others: [{ status: 'in_progress', createdAt: ago(1) }], now: NOW }).go, false);
  assert.equal(dispatchDecision({ pending, runs: [{ status: 'completed', createdAt: ago(90) }], others: [{ status: 'completed', createdAt: ago(1) }], now: NOW }).go, true);
  const seenAt = new Date(NOW - 5 * 6e4).toISOString();
  const state = { pending: [{ key: 'a', sport: 'nba', game: '1', fast: true, seen: seenAt }, { key: 'b', sport: 'nba', game: '2', fast: true, seen: seenAt }, { key: 'c', sport: 'nba', game: '1', seen: seenAt }], baseline: {} };
  const s = settle(state, [{ status: 'completed', createdAt: ago(60) }], [{ status: 'in_progress', createdAt: ago(1), displayTitle: 'Model desk fast: nba 1' }]);
  assert.deepEqual(s.done.map((p) => p.key), ['a']);
  assert.deepEqual(settle(state, [{ status: 'in_progress', createdAt: ago(1) }], []).done.map((p) => p.key), ['a', 'b', 'c']);
});
