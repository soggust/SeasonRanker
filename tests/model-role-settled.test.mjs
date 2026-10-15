// The role guard's group-out CHECK for an absence new to him only (props.mjs settledAbsenceOf, matchups.mjs
// absenceGames): a fill-in who's already played through the absence in the role it gives him (Emanuel Wilson,
// GB, 2026-10-18: the lead back out two games, 20-plus carries in each) isn't a CHECK; a new absence, a second
// regular newly out, or a fill-in who didn't take the work still is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';
import { ROLE, SETTLED, roleChangeOf, settledAbsenceOf, snapSettledOf } from '../libs/ranker/scripts/model/props.mjs';

// (a team's game: [pid, pos, rushAtt, targets, snaps]; the quarterback's snaps read, so who was out is known)
const game = (id, day, list, read = true) =>
  [...list, ['q', 'QB', 0, 0, 60]].map(([pid, pos, rushAtt = 0, targets = 0, snaps = 0]) => ({ pid, name: pid, pos, date: `2026-09-${String(day).padStart(2, '0')}T17:00Z`, season: 2026, team: '1', opp: '2', game: id, home: true, s: { rushAtt, targets, passAtt: pos === 'QB' ? 30 : 0, snaps: read ? snaps : 0 } }));
// (the guard as priceProps reads it: the cut in proportion, his games, the rule)
const guard = (m, pid, pos, out) => {
  const missOf = (id) => (out.includes(String(id)) ? 1 : 0);
  const vacOut = m.live(pid, '1', '2', pos, 2026, missOf).vacs[0];
  const settled = settledAbsenceOf({ vacOut, ab: m.absenceGames(pid, '1', 2026, pos, missOf) });
  return { vacOut, settled, role: roleChangeOf({ name: pid, pos, pid, qb1: { id: 'q', missing: 0 }, vacOut, settled }) };
};
const starterGames = (rows, from, to, fill = 5) => {
  for (let d = from; d <= to; d++) rows.push(...game(`g${d}`, d, [['s', 'RB', 18, 3, 45], ['b', 'RB', fill, 1, 20]]));
};

test('an absence he has already played through in the bigger role: no group-out CHECK', () => {
  const rows = [];
  starterGames(rows, 1, 4);
  // (the starter out two games; the fill-in takes his carries: 20 and 22)
  rows.push(...game('g5', 5, [['b', 'RB', 20, 3, 55]]), ...game('g6', 6, [['b', 'RB', 22, 2, 58]]));
  const g = guard(nflMatchups(rows), 'b', 'RB', ['s']);
  assert.ok(g.vacOut >= ROLE.vac, `the cut ${g.vacOut}`);
  assert.ok(g.settled, 'settled');
  assert.equal(g.settled.n, 2);
  assert.equal(g.settled.pre, 6);
  assert.ok(g.settled.work >= g.settled.need, JSON.stringify(g.settled));
  assert.equal(g.role, null);
  // (one game through it is enough)
  const one = [];
  starterGames(one, 1, 4);
  one.push(...game('g5', 5, [['b', 'RB', 21, 3, 55]]));
  assert.equal(guard(nflMatchups(one), 'b', 'RB', ['s']).role, null);
});

test('a new absence (the starter played his last game) still a group-out CHECK', () => {
  const rows = [];
  starterGames(rows, 1, 6);
  const g = guard(nflMatchups(rows), 'b', 'RB', ['s']);
  assert.equal(g.settled, null);
  assert.equal(g.role.key, 'group-out');
  // (out before, back for his last two, out again tonight: new again)
  const back = [];
  starterGames(back, 1, 2);
  back.push(...game('g3', 3, [['b', 'RB', 20, 3, 55]]));
  starterGames(back, 4, 5);
  assert.equal(guard(nflMatchups(back), 'b', 'RB', ['s']).role.key, 'group-out');
});

test("the partial workload: a fill-in who didn't take the work in the games without him still a CHECK", () => {
  const rows = [];
  starterGames(rows, 1, 4);
  // (the starter out two games; another back took his carries, the fill-in barely more than before)
  rows.push(...game('g5', 5, [['b', 'RB', 7, 1, 25], ['c', 'RB', 16, 2, 40]]), ...game('g6', 6, [['b', 'RB', 7, 1, 25], ['c', 'RB', 16, 2, 40]]));
  const g = guard(nflMatchups(rows), 'b', 'RB', ['s']);
  assert.ok(g.vacOut >= ROLE.vac, `the cut ${g.vacOut}`);
  assert.equal(g.settled, null);
  assert.equal(g.role.key, 'group-out');
  // (the rule's edge, by hand: his work there at pre plus SETTLED.share of the cut's, settled; a touch under, not)
  const ab = { own: 10, games: [{ work: 6, none: true, without: false }, { work: 13, none: false, without: true }] };
  const need = 6 + SETTLED.share * 1 * 10;
  assert.ok(settledAbsenceOf({ vacOut: 1, ab: { ...ab, games: [ab.games[0], { ...ab.games[1], work: need }] } }));
  assert.equal(settledAbsenceOf({ vacOut: 1, ab: { ...ab, games: [ab.games[0], { ...ab.games[1], work: need - 0.1 }] } }), null);
});

test('a second regular newly out, an old absence older than his last two games, a game unread: still a CHECK', () => {
  // (two receivers out tonight, one out two games already, the other newly)
  const rows = [];
  for (let d = 1; d <= 4; d++) rows.push(...game(`g${d}`, d, [['w1', 'WR', 0, 9, 55], ['w2', 'WR', 0, 7, 50], ['w3', 'WR', 0, 3, 30]]));
  for (let d = 5; d <= 6; d++) rows.push(...game(`g${d}`, d, [['w2', 'WR', 0, 9, 55], ['w3', 'WR', 0, 8, 50]]));
  const m = nflMatchups(rows);
  assert.ok(guard(m, 'w3', 'WR', ['w1']).settled, 'w1 alone: settled');
  assert.equal(guard(m, 'w3', 'WR', ['w1', 'w2']).role.key, 'group-out');
  // (his last two games without the starter's absence's snap counts read: who was out isn't known)
  const unread = [];
  starterGames(unread, 1, 4);
  unread.push(...game('g5', 5, [['b', 'RB', 20, 3, 55]], false), ...game('g6', 6, [['b', 'RB', 22, 2, 58]], false));
  assert.equal(guard(nflMatchups(unread), 'b', 'RB', ['s']).settled, null);
  // (no games, no cut, nothing known: null)
  assert.equal(settledAbsenceOf({ vacOut: 0.8, ab: null }), null);
  assert.equal(settledAbsenceOf({ vacOut: 0, ab: { own: 5, games: [{ work: 20, without: true, none: false }] } }), null);
});

test('roleChangeOf with the absence settled: group-out and part-time off, each skip named; new ones still CHECKs', () => {
  const settled = { n: 2, work: 22, pre: 6, need: 15, names: 'S' };
  const qb1 = { id: 'q', missing: 0 };
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'b', qb1, vacOut: 1.2 }).key, 'group-out');
  const skips = [];
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'b', qb1, vacOut: 1.2, settled, skips }), null);
  assert.deepEqual(skips.map((x) => x.key), ['group-out']);
  assert.match(skips[0].why, /absence not new: 2 games already without S/);
  // (part-time: a part-timer with a regular out, the absence new a CHECK, settled not)
  const pt = { latest: 0.45, avg: 0.4, n: 6, prev: 0.42 };
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'b', qb1, vacOut: 0.2, snap: pt }).key, 'part-time');
  const ptSkips = [];
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'b', qb1, vacOut: 0.2, settled, skips: ptSkips, snap: pt }), null);
  assert.deepEqual(ptSkips.map((x) => x.key), ['part-time']);
  // (a settled absence leaves a new snap jump a CHECK)
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'b', qb1, vacOut: 1.2, settled, snap: { latest: 0.8, avg: 0.5, n: 6, prev: 0.5 } }).key, 'snap-jump');
});

test('snap-jump: a jump in his last game alone a CHECK; two games at the new level (Wilson: 59% after one near it) not', () => {
  const qb1 = { id: 'q', missing: 0 };
  // (new: his game before at his old level)
  const fresh = { latest: 0.59, avg: 0.4, n: 6, prev: 0.38 };
  assert.equal(snapSettledOf(fresh), false);
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'w', qb1, snap: fresh }).key, 'snap-jump');
  // (settled: his game before at SETTLED.snap of the last's share or more)
  const old = { latest: 0.59, avg: 0.4, n: 6, prev: 0.56 };
  assert.equal(snapSettledOf(old), true);
  const skips = [];
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'w', qb1, snap: old, skips }), null);
  assert.deepEqual(skips.map((x) => x.key), ['snap-jump']);
  assert.match(skips[0].why, /jump not new: 2 games at the new level already \(56% then 59%/);
  // (the edge: SETTLED.snap of the last exactly, settled; a touch under, not; no game before, not)
  assert.equal(snapSettledOf({ latest: 0.6, avg: 0.4, n: 2, prev: SETTLED.snap * 0.6 }), true);
  assert.equal(snapSettledOf({ latest: 0.6, avg: 0.4, n: 2, prev: SETTLED.snap * 0.6 - 0.01 }), false);
  assert.equal(snapSettledOf({ latest: 0.6, avg: 0.6, n: 1, prev: null }), false);
  // (a part-timer whose jump is settled, with a regular newly out: still part-time's CHECK)
  assert.equal(roleChangeOf({ pos: 'RB', pid: 'w', qb1, vacOut: 0.2, snap: old }).key, 'part-time');
});

test("nflMatchups snap: prev, the game before the last one's share", () => {
  const rows = [];
  rows.push(...game('g1', 1, [['b', 'RB', 5, 1, 20]]), ...game('g2', 2, [['b', 'RB', 5, 1, 21]]), ...game('g3', 3, [['b', 'RB', 18, 2, 36]]), ...game('g4', 4, [['b', 'RB', 20, 2, 35]]));
  const snap = nflMatchups(rows).live('b', '1', '2', 'RB', 2026, () => 0).snap;
  assert.equal(snap.n, 4);
  assert.equal(snap.prev, 0.6);
  assert.ok(snap.latest > snap.avg + ROLE.snapJump);
  assert.equal(snapSettledOf(snap), true);
});

test("priceProps: a settled absence's fill-in not a role CHECK, its skip logged once; a new one's still is", async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'rushYds');
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => ({ vacs: [missOf('ir') === 1 ? 0.9 : 0, 0, 0], vac: 0, snap: { latest: 0.7, avg: 0.7, n: 3 } }),
    absenceGames: (pid) => ({ ids: ['ir'], own: 12, games: [{ work: 6, none: true, without: false }, { work: 22, none: false, without: pid === 'old' }, { work: pid === 'old' ? 23 : 6, none: pid !== 'old', without: pid === 'old' }] }),
    qb1: () => ({ id: 'q', v: 30 }),
    absent: () => new Map(),
    regulars: () => [{ id: 'ir', v: 15 }],
  };
  const project = () => ({ mu: 50, rate: 50, recent: 50, base: 50, opp: 1, posOpp: 1, roleOpp: null, role: null, funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const vals = [[2026, 40], [2026, 45], [2026, 55], [2026, 60]];
  const fitted = { rushYds: { stat: st, env: { mean: 50, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['old', vals], ['new', vals]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-18T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['old', 'new', 'ir', 'q']);
  rosterSet.out = new Map([['ir', { name: 'Hurt Back', pos: 'RB', status: 'Injured Reserve' }]]);
  const live = { injuries: new Map([['1', []]]), rosters: new Map([['1', rosterSet]]) };
  const props = ['old', 'new'].flatMap((id) => [49.5, 51.5].map((line) => ({ athlete: { id, name: id, team: '1' }, stat: st, line, open: null, prices: { over: -110, under: -110 } })));
  const logged = [];
  const log = console.log;
  console.log = (s) => logged.push(String(s));
  let priced;
  try {
    ({ priced } = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1));
  } finally {
    console.log = log;
  }
  const of = (id) => priced.filter((x) => x.prop.athlete.id === id);
  assert.ok(of('old').every((x) => x.guard?.kind !== 'role'), JSON.stringify(of('old').map((x) => x.guard)));
  assert.ok(of('new').some((x) => x.guard?.kind === 'role' && x.guard.role === 'group-out'));
  const skips = logged.filter((s) => /absence not new/.test(s));
  assert.equal(skips.length, 1, logged.join('\n'));
  assert.match(skips[0], /role CHECK \(group-out\) skipped for old \(g\): absence not new: 2 games already without Nir/);
});

test("priceProps: the promoted back's receiving CHECK off where the absence is settled, on where it's new", async () => {
  const { priceProps, STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const st = STATS.nfl.find((s) => s.key === 'recYds');
  // (no cut big enough for group-out (0.2), no part-time (snaps 70%): only the promoted back's receiving)
  const matchups = {
    live: (pid, team, opp, pos, season, missOf) => ({ vacs: [missOf('ir') === 1 ? 0.2 : 0, 0, 0], vac: 0, role: 'RB2', snap: { latest: 0.7, avg: 0.7, n: 3, prev: 0.7 } }),
    absenceGames: (pid) => ({ ids: ['ir'], own: 12, games: [{ work: 6, none: true, without: false }, { work: 14, none: pid !== 'old', without: pid === 'old' }, { work: 14, none: pid !== 'old', without: pid === 'old' }] }),
    qb1: () => ({ id: 'q', v: 30 }),
    absent: () => new Map(),
    regulars: () => [{ id: 'ir', v: 15 }],
  };
  const project = () => ({ mu: 20, rate: 20, recent: 20, base: 20, opp: 1, posOpp: 1, roleOpp: null, role: 'RB1', funnel: null, funnelF: 1, paceF: 1, tgtF: 1, vac: 0, vacHist: 0, vacF: 1, games: 4, prevGames: 16 });
  const vals = [[2026, 15], [2026, 18], [2026, 22], [2026, 25]];
  const fitted = { recYds: { stat: st, env: { mean: 20, avg: 1 }, model: { project, roleTable: () => [] }, values: new Map([['old', vals], ['new', vals]]), matchups, params: { r: 6, a: 1, b: 0, scale: 1 }, snapGap: null } };
  const idx = { pid: (a) => a.id, pos: () => 'RB', name: (id) => `N${id}` };
  const gameRow = { id: 'g', date: '2026-10-18T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const rosterSet = new Set(['old', 'new', 'ir', 'q']);
  rosterSet.out = new Map([['ir', { name: 'Hurt Back', pos: 'RB', status: 'Injured Reserve' }]]);
  const live = { injuries: new Map([['1', []]]), rosters: new Map([['1', rosterSet]]) };
  const props = ['old', 'new'].flatMap((id) => [18.5, 21.5].map((line) => ({ athlete: { id, name: id, team: '1' }, stat: st, line, open: null, prices: { over: -110, under: -110 } })));
  const logged = [];
  const log = console.log;
  console.log = (s) => logged.push(String(s));
  let priced;
  try {
    ({ priced } = priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1));
  } finally {
    console.log = log;
  }
  const of = (id) => priced.filter((x) => x.prop.athlete.id === id);
  assert.ok(of('old').every((x) => x.guard?.kind !== 'role'), JSON.stringify(of('old').map((x) => x.guard)));
  assert.ok(of('new').every((x) => x.guard?.kind === 'role' && x.guard.role === 'group-out'), JSON.stringify(of('new').map((x) => x.guard)));
  const skips = logged.filter((s) => /skipped for/.test(s));
  assert.deepEqual(skips.map((s) => s.match(/role CHECK \((\S+)\) skipped for (\w+)/).slice(1).join(' ')), ['promoted old']);
});
