// Round E (2026-10-17, the owner's "fix every logic you can with the bot"): the CHECK audit's drops, each fixed in
// libs/ranker/scripts/model: the backup quarterback's base (project.mjs bq: his team's attempts times his own rate
// per attempt, shrunk toward the pool's), the news dedupe (props.mjs: the QB-out headline whose quarterback the report
// already has out is no news CHECK), the CHECK bar by cause (props.mjs roleGateOf, ROLE_BET: a cause whose graded
// CHECKs pay is bet at the untested cap's half), and the props' CLV gate by stat (desk.mjs propGate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { ROLE_BET, ROLE_BET_N, ROLE_BET_UNITS, STATS, priceProps, roleGateOf } from '../libs/ranker/scripts/model/props.mjs';
import { LINE_GATE_MIN, propGate } from '../libs/ranker/scripts/model/desk.mjs';

const BASE = { K: 16, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0, qs: 1 };

test("bq: a few-start starter's made-up prior leans to his team's attempts times his own career rate per attempt, shrunk to the pool's by bqK; off, as before; a veteran untouched", () => {
  const stat = { key: 'passYds', starts: true };
  // (the league: 40 starters' starts of 250 yards on 33 attempts, each its own team-game (the pool's per-attempt rate
  // 250 / 33; the league's attempts a team-game 33))
  const league = Array.from({ length: 40 }, (_, i) => ({ pid: `s${i}`, pos: 'QB', season: 2025, date: '2025-09-07', game: `lg${i}`, team: `t${i}`, opp: 'o', s: { passYds: 250, passAtt: 33 }, start: true }));
  // (his team this season: 4 games of 40 attempts by its starter; he threw none of them)
  const team = [1, 2, 3, 4].map((d) => ({ pid: 'starter', pos: 'QB', season: 2026, date: `2026-09-0${d}`, game: `tg${d}`, team: 'T', opp: 'o', s: { passYds: 300, passAtt: 40 }, start: true }));
  // (the backup: last season 10 relief games of 60 yards on 10 attempts (6.0 a throw), no start)
  const relief = Array.from({ length: 10 }, (_, i) => ({ pid: 'q', pos: 'QB', season: 2025, date: `2025-10-${String(i + 1).padStart(2, '0')}`, game: `r${i}`, team: 'U', opp: 'o', s: { passYds: 60, passAtt: 10 }, start: false }));
  const run = (params) => {
    const m = makeModel(stat, params, {});
    m.learn(league);
    m.learn(relief);
    m.learn(team);
    return m.project({ pid: 'q', pos: 'QB', season: 2026, date: '2026-09-10', game: 'x', team: 'T', opp: 'o', qbStart: true });
  };
  const off = run(BASE);
  assert.equal(off.mode, 'starts');
  assert.equal(off.bq, null);
  // (no starts of his own: the few-start starters' average a start (the league's 40 of 250 and his team's starter's 4 of 300))
  const pool = (40 * 250 + 4 * 300) / 44;
  assert.ok(Math.abs(off.rate - pool) < 1e-9, `${off.rate}`);
  const on = run({ ...BASE, bq: 1, bqK: 50 });
  assert.ok(on.bq, 'the base read');
  // (his team's attempts: 4 games of 40, pulled toward the league's a team-game (54 team-games: 1320 + 100 + 160
  // attempts) by 4 games; his rate: 600 yards on 100 attempts, shrunk toward the few-start starters' per attempt
  // (11200 yards on 1480) by 50 attempts)
  const teamAtt = (160 + 4 * (1580 / 54)) / 8;
  const own = (600 + 50 * (11200 / 1480)) / 150;
  assert.ok(Math.abs(on.rate - teamAtt * own) < 1e-6, `${on.rate} vs ${teamAtt * own}`);
  assert.ok(on.rate < off.rate, 'a 6-yards-a-throw backup under the pool');
  assert.equal(on.bq.att, 100);
  // (half way at bq 0.5)
  const half = run({ ...BASE, bq: 0.5, bqK: 50 });
  assert.ok(Math.abs(half.rate - (0.5 * pool + 0.5 * teamAtt * own)) < 1e-6, `${half.rate}`);
  // (a veteran with 10 starts or more: his own starts' average, bq never reads him)
  const vet = Array.from({ length: 12 }, (_, i) => ({ pid: 'v', pos: 'QB', season: 2025, date: `2025-11-${String(i + 1).padStart(2, '0')}`, game: `v${i}`, team: 'T', opp: 'o', s: { passYds: 200, passAtt: 30 }, start: true }));
  const m = makeModel(stat, { ...BASE, bq: 1, bqK: 50 }, {});
  m.learn(league);
  m.learn(vet);
  const p = m.project({ pid: 'v', pos: 'QB', season: 2026, date: '2026-09-10', game: 'y', team: 'T', opp: 'o', qbStart: true });
  assert.equal(p.bq, null);
  assert.ok(Math.abs(p.rate - 200) < 1e-9, `${p.rate}`);
});

test('roleGateOf: a ROLE_BET cause bets once 40 graded pay on the model\'s side (profit a unit over 0, hit rate over break-even); under 40, or not paying, a CHECK; other causes never in it', () => {
  const t = (won, lost, perUnit, breakEven = 0.53) => ({ decided: won + lost, won, lost, hitRate: won / (won + lost), breakEven, perUnit });
  const g = roleGateOf({ byRole: { 'snap-jump': t(28, 15, 0.232), 'group-out': t(35, 29, 0.036), 'part-time': t(19, 7, 0.367), 'qb-change': t(33, 27, 0.023), 'qb1-out': t(5, 1, 0.546) } });
  assert.deepEqual(Object.keys(g).sort(), [...ROLE_BET].sort());
  assert.equal(g['snap-jump'].on, true);
  assert.match(g['snap-jump'].why, /43 graded CHECKs 28-15/);
  assert.equal(g['group-out'].on, true);
  // (26 graded: under the bar, whatever the record)
  assert.equal(g['part-time'].on, false);
  assert.match(g['part-time'].why, new RegExp(`under ${ROLE_BET_N}`));
  assert.equal(g['qb-change'], undefined);
  // (paying by the unit but not by the hit rate, or the other way: a CHECK)
  assert.equal(roleGateOf({ byRole: { 'snap-jump': t(22, 20, -0.01) } })['snap-jump'].on, false);
  assert.equal(roleGateOf({ byRole: { 'snap-jump': { ...t(21, 21, 0.02), breakEven: 0.55 } } })['snap-jump'].on, false);
  // (nothing learned: every cause a CHECK)
  assert.equal(roleGateOf(null)['group-out'].on, false);
});

test("priceProps: a snap-jump's risky side a CHECK with the gate off; with it on, a bet at ROLE_BET_UNITS at most with the cause on it; the safe side bets as before either way", () => {
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  // (his last game 90% of the snaps against 60% this season: a snap jump, new (no game before at the level))
  const matchups = { live: () => ({ vacs: [0, 0, 0], vac: 0 }), qb1: () => ({ id: 'q', v: 30 }), absent: () => new Map(), regulars: () => [] };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const usual = [[2026, 40], [2026, 45], [2026, 55], [2026, 60]];
  const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', usual]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-19T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'q']);
  rosterSet.out = new Map();
  const live = { injuries: new Map([['1', []]]), rosters: new Map([['1', rosterSet]]) };
  const prop = (line) => ({ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line, open: null, prices: { over: -110, under: -110 } });
  const snap = { latest: 0.9, avg: 0.6, n: 3, prev: 0.55 };
  const price = (line, roleGate) => priceProps('nfl', gameRow, [prop(line)], { ...fitted, rushYds: { ...fitted.rushYds, matchups: { ...matchups, live: () => ({ vacs: [0, 0, 0], vac: 0, snap }) } } }, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1, null, null, null, roleGate).priced[0];
  // (the model's side the under (the line over the mean): the snap-jump's risky side, a CHECK)
  const check = price(55.5, null);
  assert.equal(check.side, 'under');
  assert.equal(check.guard?.kind, 'role');
  assert.equal(check.guard.role, 'snap-jump');
  assert.equal(check.roleBet, undefined);
  // (the gate on for snap-jump: no CHECK, a bet at the cap, the cause and the record on it)
  const gate = roleGateOf({ byRole: { 'snap-jump': { decided: 43, won: 28, lost: 15, hitRate: 28 / 43, breakEven: 0.528, perUnit: 0.232 } } });
  const bet = price(55.5, gate);
  assert.equal(bet.side, 'under');
  assert.ok(!bet.guard);
  assert.equal(bet.roleBet.key, 'snap-jump');
  assert.match(bet.roleBet.gate, /43 graded/);
  assert.ok(bet.units <= ROLE_BET_UNITS && bet.units > 0, `${bet.units}`);
  // (the safe side (the over, the line under the mean): no CHECK, no role bet, as any prop)
  const safe = price(45.5, gate);
  assert.equal(safe.side, 'over');
  assert.ok(!safe.guard);
  assert.equal(safe.roleBet, undefined);
  // (another cause's gate says nothing for this one)
  assert.equal(price(55.5, roleGateOf({ byRole: { 'group-out': { decided: 64, won: 35, lost: 29, hitRate: 35 / 64, breakEven: 0.52, perUnit: 0.036 } } })).guard?.kind, 'role');
});

test("priceProps: a gated snap-jump past the market gap is bet at ROLE_BET_UNITS at most (the gap guard took it before, a PASS: the 10-17 slate's Jalen Brooks under); a qb1-out row stays a CHECK, gate or no gate", () => {
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const usual = [[2026, 40], [2026, 45], [2026, 55], [2026, 60]];
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-19T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const prop = (line) => ({ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line, open: null, prices: { over: -110, under: -110 } });
  const gateAll = roleGateOf({ byRole: { 'snap-jump': { decided: 43, won: 28, lost: 15, hitRate: 28 / 43, breakEven: 0.528, perUnit: 0.232 }, 'group-out': { decided: 64, won: 35, lost: 29, hitRate: 35 / 64, breakEven: 0.52, perUnit: 0.036 } } });
  // (qb: whether the usual starter 'q' is on the roster; snap: his snaps, a jump or none)
  const price = (line, roleGate, { qb = true, snap = null } = {}) => {
    const rosterSet = new Set(qb ? ['a', 'q'] : ['a']);
    rosterSet.out = new Map();
    const live = { injuries: new Map([['1', []]]), rosters: new Map([['1', rosterSet]]) };
    const matchups = { live: () => ({ vacs: [0, 0, 0], vac: 0, ...(snap ? { snap } : {}) }), qb1: () => ({ id: 'q', v: 30 }), absent: () => new Map(), regulars: () => [] };
    const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', usual]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
    return priceProps('nfl', gameRow, [prop(line)], fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1, null, null, null, roleGate).priced[0];
  };
  const jump = { latest: 0.9, avg: 0.6, n: 3, prev: 0.55 };
  // (the line far over his mean: the under the model's side, past the gap)
  const off = price(80.5, null, { snap: jump });
  assert.equal(off.side, 'under');
  assert.ok(off.model - off.fair > 0.15, `${off.model} vs ${off.fair}`);
  assert.equal(off.guard?.kind, 'role');
  const bet = price(80.5, gateAll, { snap: jump });
  assert.equal(bet.side, 'under');
  assert.ok(!bet.guard, JSON.stringify(bet.guard));
  assert.equal(bet.roleBet?.key, 'snap-jump');
  assert.ok(bet.units > 0 && bet.units <= ROLE_BET_UNITS, `${bet.units}`);
  // (no snap jump: the far line's own cause (line), not gated, held as before)
  const plain = price(80.5, gateAll);
  assert.ok(plain.guard?.skip);
  assert.equal(plain.roleBet, undefined);
  // (his starting quarterback out: qb1-out's risky side the over, a CHECK whatever the other causes' gates say, near
  // the line or past the gap)
  for (const line of [45.5, 25.5]) {
    const qb1 = price(line, gateAll, { qb: false, snap: jump });
    assert.equal(qb1.side, 'over');
    assert.equal(qb1.guard?.kind, 'role');
    assert.equal(qb1.guard.role, 'qb1-out');
    assert.equal(qb1.roleBet, undefined);
  }
});

test("priceProps: the QB-out headline is no news CHECK once the report has the quarterback out (the projection and the role guard carry it); with him not on the report, the news CHECK as before", () => {
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  const matchups = { live: () => ({ vacs: [0, 0, 0], vac: 0, snap: { latest: 0.7, avg: 0.7, n: 3, prev: 0.7 } }), qb1: () => ({ id: 'q', v: 30 }), absent: () => new Map(), regulars: () => [] };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const usual = [[2026, 40], [2026, 45], [2026, 55], [2026, 60]];
  const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['a', usual]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-19T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['a', 'q']);
  rosterSet.out = new Map();
  const news = [{ team: '1', unit: 'offense', kind: 'injury', headline: 'Eagles QB Jalen Hurts ruled out vs. Panthers with blood clot in calf', id: 'x', from: 'espn' }];
  const price = (injuries, line) => priceProps('nfl', gameRow, [{ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line, open: null, prices: { over: -110, under: -110 } }], fitted, idx, { homePts: 24, awayPts: 21 }, null, { injuries: new Map([['1', injuries]]), rosters: new Map([['1', rosterSet]]), news }, {}, 0.1).priced[0];
  // (the quarterback not on the report: the headline is the news, a CHECK either side)
  assert.equal(price([], 45.5).guard?.kind, 'news');
  assert.equal(price([], 55.5).guard?.kind, 'news');
  // (on the report, Out: no news CHECK; the role guard's qb1-out holds the over (the risky side), the under bets)
  const out = [{ id: 'q', name: 'Q', pos: 'QB', status: 'Out' }];
  const over = price(out, 45.5);
  assert.equal(over.side, 'over');
  assert.equal(over.guard?.kind, 'role');
  assert.equal(over.guard.role, 'qb1-out');
  const under = price(out, 55.5);
  assert.equal(under.side, 'under');
  assert.ok(!under.guard);
  // (a coaching headline isn't deduped: the report says nothing of it)
  const coach = { ...news[0], kind: 'coach', headline: 'Coach takes over playcalling' };
  assert.equal(priceProps('nfl', gameRow, [{ athlete: { id: 'a', name: 'A', team: '1' }, stat: st, line: 45.5, open: null, prices: { over: -110, under: -110 } }], fitted, idx, { homePts: 24, awayPts: 21 }, null, { injuries: new Map([['1', out]]), rosters: new Map([['1', rosterSet]]), news: [coach] }, {}, 0.1).priced[0].guard?.kind, 'news');
});

test('propGate: a stat whose CLV over its last 200 graded props is negative is bet at the practice stake; positive, or under 40 graded, bet; game markets, voids and other sports never count', () => {
  const bet = (i, type, ev, extra = {}) => ({ id: `p${i}`, sport: 'nfl', market: 'prop', propType: type, status: i % 2 ? 'won' : 'lost', gradedAt: new Date(Date.UTC(2026, 9, 1, i % 24, Math.floor(i / 24))).toISOString(), clv: { ev: ev - 0.06, prob: ev, beat: ev > 0, v: 2 }, ...extra });
  const bets = [
    ...Array.from({ length: LINE_GATE_MIN }, (_, i) => bet(i, 'recYds', -0.03)),
    ...Array.from({ length: LINE_GATE_MIN }, (_, i) => bet(100 + i, 'rec', 0.02)),
    ...Array.from({ length: LINE_GATE_MIN - 1 }, (_, i) => bet(200 + i, 'passYds', -0.2)),
    bet(300, 'rushYds', -0.9, { market: 'spread' }),
    bet(301, 'recYds', 0.9, { void: true }),
    bet(302, 'recYds', 0.9, { sport: 'nba' }),
    bet(303, 'recYds', 0.9, { status: 'open' }),
  ];
  const g = propGate(bets, 'nfl', null);
  assert.equal(g.recYds.on, false);
  assert.equal(g.recYds.n, LINE_GATE_MIN);
  assert.match(g.recYds.why, /^practice stake: CLV -0.03 over 40$/);
  assert.equal(g.rec.on, true);
  assert.equal(g.passYds.on, true);
  assert.match(g.passYds.why, /under 40/);
  assert.equal(g.rushYds, undefined);
  assert.deepEqual(propGate([], 'nfl'), {});
});

test("picks: a role bet's band is a LIKE at most, whatever its Kelly; an ordinary edge's as before", async () => {
  const { levelOf } = await import('../libs/ranker/scripts/model/picks.mjs');
  const edge = { intent: 'edge', p: 0.6, context: {} };
  assert.equal(levelOf(edge, 0.08, 0.6), 'lock');
  assert.equal(levelOf({ ...edge, context: { roleBet: 'snap-jump: a bigger role' } }, 0.08, 0.6), 'medium');
  assert.equal(levelOf({ ...edge, context: { roleBet: 'snap-jump: a bigger role' } }, 0.03, 0.6), 'medium');
  // (under 0 too: past the gap its trusted chance is the book's, its Kelly the vig's; bet on its cause's record)
  assert.equal(levelOf({ ...edge, context: { roleBet: 'snap-jump: a bigger role' } }, -0.05, 0.43), 'medium');
  assert.equal(levelOf({ ...edge, intent: 'track' }, 0.08, 0.6), 'low');
});

test("the MMA board (the owner's add-on): every bout coming priced from what the run has (this run's lines, else the last board's DraftKings price), both sides with the price, chance, Kelly and band; ESPN BET's line marked; a bout off, done or started gone; the bot's open side marked", async () => {
  const { buildMmaBoard, boardLinesOf, headshot } = await import('../libs/ranker/scripts/model/mma-desk.mjs');
  const { fairPair } = await import('../libs/ranker/scripts/model/desk.mjs');
  const now = new Date('2026-10-17T12:00Z');
  const bout = (id, h, a, extra = {}) => ({ id, key: `${id}:${h}-${a}`, card: 'c1', cardName: 'UFC 999', date: '2026-10-17T21:00Z', rounds: 3, home: { id: h, name: `Home ${h}` }, away: { id: a, name: `Away ${a}` }, final: false, off: null, ...extra });
  const bouts = [bout('10', 'h1', 'a1'), bout('11', 'h2', 'a2'), bout('12', 'h3', 'a3'), bout('13', 'h4', 'a4'), bout('14', 'h5', 'a5', { off: 'cancelled' }), bout('15', 'h6', 'a6', { final: true }), bout('16', 'h7', 'a7', { date: '2026-10-17T11:00Z' })];
  const dk = { odds: { home: -150, away: 130 }, fair: fairPair(-150, 130), fairFrom: 'its own prices' };
  const lines = new Map([
    ['10:h1-a1', { lines: dk, src: null }],
    ['12:h3-a3', { lines: { odds: { home: -200, away: 170 }, fair: fairPair(-200, 170), fairFrom: 'espn bet' }, src: 'espn bet' }],
  ]);
  const prev = { sport: 'mma', at: '2026-10-17T11:00Z', games: [
    { id: '11', start: '2026-10-17T21:00Z', m: 'x', a: ['Away a2', 'a2'], h: ['Home h2', 'h2'], at: '2026-10-17T10:00Z', k: { ml: [{ s: 'home', l: null, o: -120, c: 0.5, ks: 0, b: 'low' }, { s: 'away', l: null, o: 100, c: 0.5, ks: 0, b: 'low' }] }, p: [] },
    { id: '13', start: '2026-10-17T21:00Z', m: 'x', a: ['Away a4', 'a4'], h: ['Home h4', 'h4'], at: '2026-10-17T10:00Z', k: { ml: [{ s: 'home', l: null, o: -120, c: 0.5, ks: 0, b: 'low', src: 'espn bet' }, { s: 'away', l: null, o: 100, c: 0.5, ks: 0, b: 'low', src: 'espn bet' }] }, p: [] },
    { id: '99', start: '2026-10-18T21:00Z', m: 'x', a: ['Away z', 'z'], h: ['Home y', 'y'], at: '2026-10-17T10:00Z', k: { ml: [] }, p: [] },
  ] };
  const bets = [{ id: '10:ml:h1-a1', event: '10', market: 'ml', side: 'home', status: 'open', units: 1, intent: 'edge' }];
  const board = buildMmaBoard({ bouts, lines, chance: () => 0.65, trust: 0.5, bets, prev, now });
  assert.equal(board.sport, 'mma');
  // (10 and 12 priced this run, 11 from the last board's DraftKings price, 13 as the last board had it (ESPN BET's, read
  // again live each run till a DraftKings price comes); 14 off, 15 done, 16 started, 99 no longer coming)
  assert.deepEqual(board.games.map((g) => g.id), ['10', '11', '12', '13']);
  assert.ok(board.games.find((g) => g.id === '13').k.ml.every((s) => s.src === 'espn bet'));
  for (const g of board.games) {
    assert.equal(g.k.ml.length, 2);
    assert.deepEqual(g.k.ml.map((s) => s.s), ['home', 'away']);
    for (const s of g.k.ml) {
      assert.ok(Number.isFinite(s.o) && s.o !== 0, `${g.id} ${s.s} price`);
      assert.ok(s.c > 0 && s.c < 1 && Number.isFinite(s.ks));
      assert.ok(['lock', 'high', 'medium', 'low'].includes(s.b), s.b);
    }
    assert.equal(g.p.length, 0);
    assert.equal(g.card, 'UFC 999');
  }
  const g10 = board.games.find((g) => g.id === '10');
  assert.equal(g10.m, 'Away a1 @ Home h1');
  assert.deepEqual(g10.a, ['Away a1', 'a1', headshot('a1')]);
  assert.deepEqual(g10.h, ['Home h1', 'h1', headshot('h1')]);
  // (the model at 65% on the home side against the book's 58%: an edge, a LIKE at the least; the bot's open side marked)
  assert.ok(g10.k.ml[0].c > 0.58 && g10.k.ml[0].b !== 'low', JSON.stringify(g10.k.ml[0]));
  assert.equal(g10.k.ml[0].bot, 'bet');
  assert.equal(g10.k.ml[1].bot, undefined);
  assert.equal(g10.k.ml[0].src, undefined);
  assert.ok(board.games.find((g) => g.id === '12').k.ml.every((s) => s.src === 'espn bet'));
  assert.equal(board.games.find((g) => g.id === '11').k.ml[0].o, -120);
  // (the last board's DraftKings price read back, never its ESPN BET one)
  assert.deepEqual(boardLinesOf(prev, '11').odds, { home: -120, away: 100 });
  assert.equal(boardLinesOf(prev, '13'), null);
  assert.equal(boardLinesOf(null, '11'), null);
});
