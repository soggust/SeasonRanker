// The NFL props' role-aware base (libs/ranker/scripts/model/project.mjs, matchups.mjs, props.mjs): a back's or
// pass-catcher's rate a full game's snaps times the share he's expected tonight, a starting quarterback's
// numbers from his starts alone, the prior's weight shrinking through the season; each off (0) the model as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS, markEligible } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { nflMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };
const at = (d) => `2026-09-${String(d).padStart(2, '0')}`;
const wr = (d, v, share, extra = {}) => ({ pid: 'w', pos: 'WR', season: 2026, date: at(d), opp: 'o', s: { recYds: v }, share, ...extra });

test('the role-aware base off (sn, qs, kd 0): the per-game rate as before, whatever the snap shares', () => {
  const stat = { key: 'recYds', snaps: true, starts: true, early: true };
  const m = makeModel(stat, BASE, {});
  // (last season 10 games of 40 a game: his own prior; this season 4 of 80)
  m.learn(Array.from({ length: 10 }, (_, i) => ({ ...wr(i + 1, 40, 0.5), season: 2025, date: `2025-09-${String(i + 1).padStart(2, '0')}` })));
  m.learn([1, 2, 3, 4].map((d) => wr(d, 80, 0.9)));
  const p = m.project({ pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' });
  assert.equal(p.mode, null);
  assert.ok(Math.abs(p.rate - (4 * 80 + 4 * 40) / 8) < 1e-9, `${p.rate}`);
});

test("snaps: a role grown since last season projects at his share now, last season's rate a full game's snaps", () => {
  const stat = { key: 'recYds', snaps: true };
  const plain = makeModel(stat, BASE, {});
  const snaps = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  // (last season a part-timer: 40 a game at half the snaps, 80 a full game's; this season two games at 90%)
  const last = Array.from({ length: 12 }, (_, i) => ({ ...wr(i + 1, 40, 0.5), season: 2025, date: `2025-09-${String(i + 1).padStart(2, '0')}` }));
  const now = [wr(1, 72, 0.9), wr(2, 72, 0.9)];
  for (const m of [plain, snaps]) m.learn(last), m.learn(now);
  const row = { pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' };
  const a = plain.project(row);
  const b = snaps.project(row);
  assert.equal(b.mode, 'snaps');
  assert.ok(Math.abs(b.share - 0.9) < 1e-9);
  // (the per-game rate leans on his part-time 40; the snaps' rate is 80 a full game, at 90%: 72)
  assert.ok(a.rate < 55, `per game ${a.rate}`);
  assert.ok(Math.abs(b.rate - 72) < 1e-6, `snaps ${b.rate}`);
});

test('snaps: a 1-snap game counts for its one snap, not a game; the expected share weighs his last game by sr', () => {
  const stat = { key: 'recYds', snaps: true };
  const m = makeModel(stat, { ...BASE, K: 2, sn: 1, sr: 1 }, {});
  const pool = makeModel(stat, { ...BASE, K: 2, sn: 1, sr: 0 }, {});
  // (the position's pool: other receivers at 50 a full game; then his four games at 60% for 30 each (50 a full
  // game), then one snap (2%) for 0)
  const others = Array.from({ length: 30 }, (_, i) => ({ pid: `o${i}`, pos: 'WR', season: 2026, date: at(1), opp: 'o', s: { recYds: 40 }, share: 0.8 }));
  m.learn(others);
  pool.learn(others);
  const games = [wr(1, 30, 0.6), wr(2, 30, 0.6), wr(3, 30, 0.6), wr(4, 30, 0.6), wr(5, 0, 0.02)];
  m.learn(games);
  pool.learn(games);
  const row = { pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' };
  const p = m.project(row);
  const q = pool.project(row);
  // (sr 1: his last game's share, the 2%; sr 0: his season's)
  assert.ok(Math.abs(p.share - 0.02) < 1e-9);
  assert.ok(Math.abs(q.share - (0.6 * 4 + 0.02) / 5) < 1e-9);
  // (the rate a full game near 50 (the pool's prior pulls it), not dragged down by the one-snap 0)
  assert.ok(q.rate / q.share > 45, `${q.rate / q.share}`);
});

test("snaps: where the snap counts are missing, the per-game rate as before", () => {
  const stat = { key: 'recYds', snaps: true };
  const m = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  m.learn([wr(1, 30, null), wr(2, 50, null), wr(3, 40, null)]);
  const p = m.project({ pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' });
  assert.equal(p.mode, null);
});

test("starts: a backup's relief games left out of his numbers once he's the starter; a starter's prior made up to 10 starts", () => {
  const stat = { key: 'passAtt', starts: true };
  const qb = (d, v, start, season = 2026) => ({ pid: 'q', pos: 'QB', season, date: `${season}-09-${String(d).padStart(2, '0')}`, opp: 'o', s: { passAtt: v }, start });
  const plain = makeModel(stat, { ...BASE, K: 16 }, {});
  const starts = makeModel(stat, { ...BASE, K: 16, qs: 1 }, {});
  // (the league's starters: 40 starts at 33 attempts, another quarterback's)
  const league = Array.from({ length: 40 }, (_, i) => ({ pid: `s${i}`, pos: 'QB', season: 2025, date: '2025-08-01', opp: 'o', s: { passAtt: 33 }, start: true }));
  // (last season 10 relief games of 4 attempts; this season 4 starts of 30)
  const hist = [...Array.from({ length: 10 }, (_, i) => qb(i + 1, 4, false, 2025)), ...[1, 2, 3, 4].map((d) => qb(d, 30, true))];
  for (const m of [plain, starts]) m.learn(league), m.learn(hist);
  const row = { pid: 'q', pos: 'QB', season: 2026, date: at(10), opp: 'o', qbStart: true };
  const a = plain.project(row);
  const b = starts.project(row);
  assert.equal(b.mode, 'starts');
  // (the plain rate leans K = 16 on his relief games' 4; his starts' on the starters' average (no starts
  // before), the league's 40 and his own 4)
  assert.ok(a.rate < 12, `plain ${a.rate}`);
  const starters = (40 * 33 + 4 * 30) / 44;
  assert.ok(Math.abs(b.rate - (4 * 30 + 16 * starters) / 20) < 1e-9, `starts ${b.rate}`);
  // (and a quarterback not his team's passer tonight: the plain rate)
  assert.equal(starts.project({ ...row, qbStart: false }).mode, null);
});

test("kd: the prior's weight shrinks as his season's games come in", () => {
  const stat = { key: 'recYds', early: true };
  const plain = makeModel(stat, { ...BASE, K: 16 }, {});
  const kd = makeModel(stat, { ...BASE, K: 16, kd: 0.5 }, {});
  const last = Array.from({ length: 12 }, (_, i) => ({ ...wr(i + 1, 40, 0.8), season: 2025, date: `2025-09-${String(i + 1).padStart(2, '0')}` }));
  const now = [1, 2, 3, 4, 5, 6].map((d) => wr(d, 80, 0.8));
  for (const m of [plain, kd]) m.learn(last), m.learn(now);
  const row = { pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' };
  // (K 16 against 16 / (1 + 0.5 x 6) = 4)
  assert.ok(Math.abs(plain.project(row).rate - (6 * 80 + 16 * 40) / 22) < 1e-9);
  assert.ok(Math.abs(kd.project(row).rate - (6 * 80 + 4 * 40) / 10) < 1e-9);
});

test("nflMatchups: each row's own snap share and a quarterback's start, learned after the game", () => {
  const r = (pid, pos, snaps, passAtt, game = 'g1', date = '2026-09-07T17:00Z') => ({ pid, name: pid, pos, date, season: 2026, team: '1', opp: '2', game, home: true, s: { snaps, passAtt, rushAtt: 0, targets: 0 } });
  // (the starter hurt early: 15 of 60 snaps; his backup 45; a receiver at 60, another at 30; one with no counts)
  const rows = [r('a', 'QB', 15, 8), r('b', 'QB', 45, 25), r('w', 'WR', 30, 0), r('x', 'WR', 0, 0), r('y', 'WR', 60, 0)];
  // (a split with neither at 70%: the most snaps of the team's quarterbacks)
  const split = [r('a', 'QB', 25, 10, 'g3', '2026-09-21T17:00Z'), r('b', 'QB', 35, 20, 'g3', '2026-09-21T17:00Z'), r('y', 'WR', 60, 0, 'g3', '2026-09-21T17:00Z')];
  // (a game with no snap counts: the most passes is the start)
  const none = [r('a', 'QB', 0, 30, 'g2', '2026-09-14T17:00Z'), r('b', 'QB', 0, 2, 'g2', '2026-09-14T17:00Z')];
  nflMatchups([...rows, ...none, ...split]);
  assert.equal(rows[0].share, 0.25);
  assert.equal(rows[2].share, 0.5);
  assert.equal(rows[3].share, null);
  assert.equal(rows[0].start, false);
  assert.equal(rows[1].start, true);
  assert.equal(split[0].start, false);
  assert.equal(split[1].start, true);
  assert.equal(none[0].start, true);
  assert.equal(none[1].start, false);
  assert.equal(none[0].share, null);
});

test("markEligible: a quarterback's qbStart is his team's passer by the usage before the game", () => {
  const st = STATS.nfl.find((s) => s.key === 'rushAtt');
  const r = (pid, pos, game, date, passAtt) => ({ pid, name: pid, pos, date, season: 2026, team: '1', opp: '2', game, home: true, s: { passAtt, rushAtt: 3, targets: 0 } });
  const rows = [r('a', 'QB', 'g1', '2026-09-07T17:00Z', 30), r('b', 'QB', 'g1', '2026-09-07T17:00Z', 2), r('a', 'QB', 'g2', '2026-09-14T17:00Z', 1), r('b', 'QB', 'g2', '2026-09-14T17:00Z', 35)];
  markEligible('nfl', st, rows);
  // (game 2: a was the passer before it, whatever the game itself held)
  assert.equal(rows[2].qbStart, true);
  assert.equal(rows[3].qbStart, false);
  // (and the stats carry the base's flags: passing a quarterback's starts, the rest the snaps)
  assert.ok(STATS.nfl.find((s) => s.key === 'passYds').starts);
  assert.ok(STATS.nfl.find((s) => s.key === 'recYds').snaps);
  assert.ok(!STATS.nba.some((s) => s.snaps || s.starts || s.early));
});

test("snaps: a season whose counts are missing after one with them, or a latest game unread, is the per-game rate (not last season's share)", () => {
  const stat = { key: 'recYds', snaps: true };
  const plain = makeModel(stat, BASE, {});
  const snaps = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  // (last season 20 a game at 40% of the snaps; this season 6 games of 90 whose counts weren't read)
  const last = Array.from({ length: 12 }, (_, i) => ({ ...wr(i + 1, 20, 0.4), season: 2025, date: `2025-09-${String(i + 1).padStart(2, '0')}` }));
  const now = [1, 2, 3, 4, 5, 6].map((d) => wr(d, 90, null));
  for (const m of [plain, snaps]) m.learn(last), m.learn(now);
  const row = { pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' };
  const b = snaps.project(row);
  assert.equal(b.mode, null);
  assert.ok(Math.abs(b.rate - plain.project(row).rate) < 1e-9);
  assert.ok(b.rate > 55, `${b.rate}`);
  // (counts read for his first four, his latest unread (the counts a week behind): the per-game rate; one
  // earlier game unread and his latest read: the snaps')
  const lag = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  lag.learn(last);
  lag.learn([wr(1, 30, 0.5), wr(2, 30, 0.5), wr(3, 30, 0.5), wr(4, 30, 0.5), wr(5, 80, null)]);
  assert.equal(lag.project(row).mode, null);
  const gap = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  gap.learn(last);
  gap.learn([wr(1, 30, 0.5), wr(2, 30, null), wr(3, 30, 0.5), wr(4, 30, 0.5), wr(5, 30, 0.5)]);
  assert.equal(gap.project(row).mode, 'snaps');
});

test("snaps: a long run with few counted games has its per-snap prior made up to 5 games' worth with the position's", () => {
  const stat = { key: 'recYds', snaps: true };
  const m = makeModel(stat, { ...BASE, sn: 1, sr: 0 }, {});
  // (the position: 50 a full game; his last season 12 games, two of them counted, at 100 a full game)
  m.learn(Array.from({ length: 30 }, (_, i) => ({ pid: `o${i}`, pos: 'WR', season: 2025, date: '2025-08-01', opp: 'o', s: { recYds: 40 }, share: 0.8 })));
  m.learn(Array.from({ length: 12 }, (_, i) => ({ ...wr(i + 1, 50, i < 2 ? 0.5 : null), season: 2025, date: `2025-09-${String(i + 1).padStart(2, '0')}` })));
  m.learn([wr(1, 30, 0.6)]);
  const p = m.project({ pid: 'w', pos: 'WR', season: 2026, date: at(10), opp: 'o' });
  assert.equal(p.mode, 'snaps');
  // (his prior (100 x 1 + the pool's x 4) / 5, near 60 a full game, not his own 100; the pool's taken with his
  // own games in)
  const pool = (30 * 40 + 2 * 50 + 30) / (30 * 0.8 + 2 * 0.5 + 0.6);
  const priorS = (2 * 50 + 4 * pool) / 5;
  assert.ok(Math.abs(p.rate - ((30 + 4 * priorS) / (0.6 + 4)) * 0.6) < 1e-9, `${p.rate}`);
});

test("starts: a start is his team's passer as known before the game (one he left hurt counts); a few-start starter's prior the few-start starters' average", () => {
  const stat = { key: 'passAtt', starts: true };
  const m = makeModel(stat, { ...BASE, K: 16, qs: 1 }, {});
  // (veterans: 3 with 30 starts each at 36 (their first 10 apiece in the few-start pool too); then 30 rookies'
  // first starts at 28)
  const vets = [];
  for (let v = 0; v < 3; v++) for (let i = 0; i < 30; i++) vets.push({ pid: `v${v}`, pos: 'QB', season: 2025, date: `2025-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`, opp: 'o', s: { passAtt: 36 }, qbStart: true });
  const rookies = Array.from({ length: 30 }, (_, i) => ({ pid: `r${i}`, pos: 'QB', season: 2025, date: '2025-12-01', opp: 'o', s: { passAtt: 28 }, qbStart: true }));
  m.learn(vets);
  m.learn(rookies);
  // (his: a relief game, then two starts, the second left hurt early (no start by the snaps, his team's passer
  // before it all the same))
  m.learn([{ pid: 'q', pos: 'QB', season: 2026, date: at(1), opp: 'o', s: { passAtt: 3 }, qbStart: false, start: false }]);
  m.learn([{ pid: 'q', pos: 'QB', season: 2026, date: at(2), opp: 'o', s: { passAtt: 30 }, qbStart: true, start: true }]);
  m.learn([{ pid: 'q', pos: 'QB', season: 2026, date: at(3), opp: 'o', s: { passAtt: 6 }, qbStart: true, start: false }]);
  const p = m.project({ pid: 'q', pos: 'QB', season: 2026, date: at(10), opp: 'o', qbStart: true });
  assert.equal(p.mode, 'starts');
  assert.equal(p.starts, 2);
  assert.equal(p.careerStarts, 2);
  // (the few-start pool: the veterans' first 10 each (30 at 36), the rookies' 30 at 28, and his own 2)
  const few = (30 * 36 + 30 * 28 + 36) / 62;
  assert.ok(Math.abs(p.rate - (36 + 16 * few) / 18) < 1e-9, `${p.rate}`);
});

test('roleChangeOf: no usual starter known for his team, a quarterback with a prop a CHECK, his receivers not; a few-start quarterback a CHECK', async () => {
  const { roleChangeOf } = await import('../libs/ranker/scripts/model/props.mjs');
  assert.equal(roleChangeOf({ name: 'Q', pos: 'QB', pid: 'q', qb1: null }).key, 'backup-qb');
  assert.equal(roleChangeOf({ name: 'W', pos: 'WR', pid: 'w', qb1: null }), null);
  // (his team's usual starter with few starts: under 6 a CHECK, under 16 on a rushing prop)
  const qb1 = { id: 'q', name: 'Q', missing: 0 };
  assert.equal(roleChangeOf({ name: 'Q', pos: 'QB', pid: 'q', qb1, starts: 5 }).key, 'few-starts');
  assert.equal(roleChangeOf({ name: 'Q', pos: 'QB', pid: 'q', qb1, starts: 6 }), null);
  assert.equal(roleChangeOf({ name: 'Q', pos: 'QB', pid: 'q', qb1, starts: 12, rushing: true }).key, 'few-starts');
  assert.equal(roleChangeOf({ name: 'Q', pos: 'QB', pid: 'q', qb1, starts: 16, rushing: true }), null);
  assert.equal(roleChangeOf({ name: 'Q', pos: 'QB', pid: 'q', qb1 }), null);
});

test("priceProps with the real model: a quarterback's projection from his starts and a receiver's from his snaps where the fit kept them (baseBy, starts, share); an old fit without them prices as before", async () => {
  const { priceProps } = await import('../libs/ranker/scripts/model/props.mjs');
  const env = { mean: 30, avg: 1 };
  const gameRow = { id: 'g', date: '2026-10-11T17:00Z', season: 2026, home: '1', away: '2', homeAbbr: 'H', awayAbbr: 'A' };
  const live = { injuries: new Map([['1', []]]), rosters: new Map() };
  const matchups = { live: () => ({ vacs: [0, 0, 0], vac: 0 }), qb1: () => ({ id: 'q', v: 30 }), absent: () => new Map(), regulars: () => [] };
  const price = (key, pid, pos, hist, params) => {
    const st = STATS.nfl.find((s) => s.key === key);
    const model = makeModel(st, params, env);
    model.learn(hist);
    const fitted = { [key]: { stat: st, env, model, values: new Map([[pid, hist.filter((r) => r.pid === pid).map((r) => [r.season, r.s[key]])]]), matchups, params: { r: 6, ...params }, snapGap: null } };
    const props = [{ athlete: { id: pid, name: pid.toUpperCase(), team: '1' }, stat: st, line: 25.5, open: null, prices: { over: -110, under: -110 } }];
    const idx = { pid: (a) => a.id, pos: () => pos, name: (id) => id };
    return priceProps('nfl', gameRow, props, fitted, idx, { homePts: 24, awayPts: 21 }, null, live, {}, 0.1).priced[0];
  };
  const qbRow = (d, v, qbStart) => ({ pid: 'q', pos: 'QB', season: 2026, date: at(d), opp: 'o', team: '1', s: { passAtt: v }, qbStart });
  const qbHist = [qbRow(1, 4, false), qbRow(2, 32, true), qbRow(3, 34, true), qbRow(4, 30, true)];
  const old = { K: 4, w: 0.2, a: 0, b: 0, roleK: Infinity, scale: 1 };
  const plainQ = price('passAtt', 'q', 'QB', qbHist, old);
  assert.equal(plainQ.projection.baseBy, undefined);
  const qs = price('passAtt', 'q', 'QB', qbHist, { ...old, qs: 1 });
  assert.equal(qs.projection.baseBy, 'starts');
  assert.equal(qs.projection.starts, 3);
  // (three starts before tonight: a few-start quarterback, a CHECK)
  assert.equal(qs.guard?.kind, 'role');
  assert.equal(qs.guard?.role, 'few-starts');
  assert.ok(qs.projection.mean > plainQ.projection.mean);
  // (the old fit's rate the plain model's, to the digit)
  const m = makeModel(STATS.nfl.find((s) => s.key === 'passAtt'), old, env);
  m.learn(qbHist);
  assert.equal(plainQ.projection.rate, Math.round(m.project({ pid: 'q', pos: 'QB', season: 2026, date: gameRow.date, opp: '2', qbStart: true }).rate * 100) / 100);
  const others = Array.from({ length: 30 }, (_, i) => ({ pid: `o${i}`, pos: 'WR', season: 2025, date: '2025-08-01', opp: 'o', team: '1', s: { recYds: 40 }, share: 0.8 }));
  const wrHist = [...others, ...[1, 2, 3, 4].map((d) => ({ ...wr(d, 40, 0.8), team: '1' }))];
  const sn = price('recYds', 'w', 'WR', wrHist, { ...old, vc: 0, sn: 1, sr: 0 });
  assert.equal(sn.projection.baseBy, 'snaps');
  assert.equal(sn.projection.share, 0.8);
  assert.equal(price('recYds', 'w', 'WR', wrHist, old).projection.baseBy, undefined);
});
