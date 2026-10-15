// The other side's key defenders out tonight, and recency in the defense tables (audit #15;
// libs/ranker/scripts/model/matchups.mjs defenseOut, nhlMatchups oppD; project.mjs od; props.mjs CTX oppOut,
// oppD, oppDB, oppFront): who counts as a key defender missing, the history's and live alike, and the tables'
// latest games counting most.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTX, oppMissOf } from '../libs/ranker/scripts/model/props.mjs';
import { makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { defGroup, defenseOut, nflMatchups, nhlMatchups } from '../libs/ranker/scripts/model/matchups.mjs';

test('defGroup: cornerbacks and safeties the secondary, linemen and linebackers the front seven, the rest none', () => {
  for (const p of ['CB', 'S', 'FS', 'SS', 'DB']) assert.equal(defGroup(p), 'DB', p);
  for (const p of ['DE', 'DT', 'NT', 'DL', 'LB', 'OLB', 'ILB', 'MLB']) assert.equal(defGroup(p), 'FR', p);
  for (const p of ['WR', 'QB', null, undefined]) assert.equal(defGroup(p), null, String(p));
});

test("defenseOut: a core defender (DEF_CORE of the snaps) out counts at once, a fringe regular from his second game out, a part-timer never", () => {
  const d = defenseOut();
  // (cb1 every snap, s2 60%, lb3 30%)
  const game = (who) => [['cb1', 'CB', 60], ['s2', 'S', 36], ['lb3', 'LB', 18], ['dl', 'DE', 60]].filter((x) => who.includes(x[0]));
  for (let i = 0; i < 4; i++) d.learn('T', 2026, game(['cb1', 's2', 'lb3', 'dl']));
  const out = (ids) => (id) => (ids.includes(id) ? 1 : 0);
  // (cb1 out: his share, about 1, at once)
  assert.ok(d.missing('T', 2026, out(['cb1'])).DB > 0.95);
  assert.equal(d.missing('T', 2026, out(['cb1'])).FR, 0);
  // (s2's first game out: a fringe one's one game is a coach's call; the part-timer never)
  assert.equal(d.missing('T', 2026, out(['s2'])).DB, 0);
  assert.equal(d.missing('T', 2026, out(['lb3'])).FR, 0);
  // (a questionable core one at his chance)
  const half = d.missing('T', 2026, (id) => (id === 'cb1' ? 0.5 : 0)).DB;
  assert.ok(half > 0.45 && half < 0.55, String(half));
  // (s2 missed one game: his second out counts, at his share before he went out)
  d.learn('T', 2026, game(['cb1', 'lb3', 'dl']));
  assert.equal(d.missing('T', 2026, out(['s2'])).DB, 0.6);
  // (and his third, the last of his first OUT_MAX (3) games out in a row; his fourth left to the tables)
  d.learn('T', 2026, game(['cb1', 'lb3', 'dl']));
  assert.equal(d.missing('T', 2026, out(['s2'])).DB, 0.6);
  d.learn('T', 2026, game(['cb1', 'lb3', 'dl']));
  assert.equal(d.missing('T', 2026, out(['s2'])).DB, 0);
  // (none missing, none read)
  assert.deepEqual(d.missing('T', 2026, () => 0), { DB: 0, FR: 0 });
  assert.deepEqual(d.missing('X', 2026, out(['cb1'])), { DB: 0, FR: 0 });
  // (a new season: last season's shares at half, a starter not counted till he's played)
  assert.equal(d.missing('T', 2027, out(['cb1'])).DB, 0);
});

test("defenseOut: only what the live side can see too: last season's starter gone in the offseason, a traded one and a 'pfr:' id never count", () => {
  const d = defenseOut();
  const out = (ids) => (id) => (ids.includes(id) ? 1 : 0);
  // (cb1 every snap all last season, gone in the offseason: never counted for T this season)
  for (let i = 0; i < 6; i++) d.learn('T', 2025, [['cb1', 'CB', 60], ['cb2', 'CB', 60], ['pfr:X', 'S', 60], ['dl', 'DE', 60]]);
  for (let i = 0; i < 3; i++) d.learn('T', 2026, [['cb2', 'CB', 60], ['pfr:X', 'S', 60], ['dl', 'DE', 60]]);
  assert.equal(d.missing('T', 2026, out(['cb1'])).DB, 0);
  // (cb2 played this season: counted (his share back up from last season's half); the 'pfr:' one, no report carries him, never)
  assert.ok(d.missing('T', 2026, out(['cb2'])).DB > 0.8);
  assert.equal(d.missing('T', 2026, out(['pfr:X'])).DB, 0);
  // (cb2 traded: once he's played for U he isn't missing for T)
  d.learn('U', 2026, [['cb2', 'CB', 60]]);
  assert.equal(d.missing('T', 2026, out(['cb2'])).DB, 0);
});

test("oppMissOf: the other side's report first (out 1, questionable half, listed otherwise 0), its roster's out group for the ones it doesn't list; none read 0", () => {
  const live = {
    injuries: new Map([['B', [{ id: 'o', status: 'Out' }, { id: 'q', status: 'Questionable' }, { id: 'r', status: 'Questionable' }, { id: 'p', status: 'Probable' }]]]),
    rosters: new Map([['B', { out: new Map([['r', {}], ['ir', {}], ['p', {}]]) }]]),
  };
  const m = oppMissOf('nfl', live, 'B');
  assert.equal(m('o'), 1);
  assert.equal(m('q'), 0.5);
  // (questionable on the report, on the roster's IR (designated to return): the report's half)
  assert.equal(m('r'), 0.5);
  // (on the roster's out group, not on the report: out)
  assert.equal(m('ir'), 1);
  assert.equal(m('p'), 0);
  assert.equal(m('x'), 0);
  // (the other team's report isn't this one's; none read, none missing)
  assert.equal(oppMissOf('nfl', live, 'A')('o'), 0);
  assert.equal(oppMissOf('nfl', null, 'B')('o'), 0);
});

// (an NFL team-game: the offense's rows and each side's defenders by playerlogs.mjs)
const nflGame = (d, cbPlays, rows, defense) => {
  const game = `g${d}`;
  const date = `2026-09-${String(d).padStart(2, '0')}T17:00Z`;
  rows.push({ pid: 'wr', pos: 'WR', date, season: 2026, team: 'A', opp: 'B', game, home: true, s: { targets: 8, rec: 5, recYds: 60, rushAtt: 0, passAtt: 0, snaps: 50 } });
  rows.push({ pid: 'wr2', pos: 'WR', date, season: 2026, team: 'B', opp: 'A', game, home: false, s: { targets: 8, rec: 5, recYds: 60, rushAtt: 0, passAtt: 0, snaps: 50 } });
  defense.set(`${game}|B`, [...(cbPlays ? [['cb1', 'CB', 60]] : []), ['s', 'S', 60], ['lb', 'LB', 60]]);
  defense.set(`${game}|A`, [['x', 'CB', 60]]);
};

test("nflMatchups: the other side's key defenders out on a row (oppDB, oppFront), before the game; live by the other side's report; none without the snap counts", () => {
  const rows = [];
  const defense = new Map();
  for (let d = 1; d <= 4; d++) nflGame(d, true, rows, defense);
  nflGame(5, false, rows, defense);
  rows.defense = defense;
  const m = nflMatchups(rows);
  const wr = rows.filter((r) => r.pid === 'wr');
  assert.equal(wr[3].oppDB, 0);
  assert.ok(wr[4].oppDB > 0.95, String(wr[4].oppDB));
  assert.equal(wr[4].oppFront, 0);
  // (live: the other side's report says who's out; without it none)
  assert.ok(m.live('wr', 'A', 'B', 'WR', 2026, null, { oppMiss: (id) => (id === 'lb' ? 1 : 0) }).oppFront > 0.95);
  assert.equal(m.live('wr', 'A', 'B', 'WR', 2026).oppDB, 0);
  assert.equal(CTX.oppDB(null, true, null, wr[4]), wr[4].oppDB);
  assert.equal(CTX.oppFront(null, true, null, {}), 0);
  // (no snap counts read: unknown, 0)
  const bare = rows.map((r) => ({ ...r }));
  nflMatchups(bare);
  assert.ok(bare.every((r) => r.oppDB === 0 && r.oppFront === 0));
});

test("nhlMatchups oppD: the other side's top-four defensemen missing, their time on ice over 60; live by its report", () => {
  const rows = [];
  const sk = (d, team, opp, pid, pos, toi) => ({ pid, pos, date: `2026-01-${String(d).padStart(2, '0')}T00:00Z`, season: 2026, team, opp, game: `g${d}`, home: team === 'H', s: { toi, sog: 2, pts: 0, pptoi: 0 } });
  for (let d = 1; d <= 5; d++) {
    rows.push(sk(d, 'H', 'A', 'f', 'F', 18));
    rows.push(sk(d, 'A', 'H', 'f2', 'F', 18));
    if (d < 5) rows.push(sk(d, 'A', 'H', 'd1', 'D', 24));
    rows.push(sk(d, 'A', 'H', 'd5', 'D', 14));
  }
  const m = nhlMatchups(rows);
  const f = rows.filter((r) => r.pid === 'f');
  assert.equal(f[3].oppD, 0);
  assert.ok(f[4].oppD > 0.35 && f[4].oppD < 0.42, String(f[4].oppD));
  // (his own side's: none missing)
  assert.equal(rows.filter((r) => r.pid === 'f2')[4].oppD, 0);
  assert.ok(m.live('f', 'H', 'A', 'F', 2026, null, { oppMiss: (id) => (id === 'd1' ? 1 : 0) }).oppD > 0.3);
  assert.equal(m.live('f', 'H', 'A', 'F', 2026).oppD, 0);
  assert.equal(CTX.oppD(null, true, null, f[4]), f[4].oppD);
});

test("CTX oppOut: the NBA's other side's production missing per 10, about its average; 0 unknown", () => {
  const info = { starters: { missing: [10, 53] } };
  assert.ok(Math.abs(CTX.oppOut(info, true) - (5.3 - 3.3)) < 1e-9);
  assert.ok(Math.abs(CTX.oppOut(info, false) - (1 - 3.3)) < 1e-9);
  assert.equal(CTX.oppOut({}, true), 0);
  assert.equal(CTX.oppOut(null, true), 0);
});

test("od: the defense tables' latest games count most (a side's sums times 1 - od at each new game of it), od 0 the season's sums", () => {
  const stat = { key: 'pts' };
  const BASE = { K: 4, w: 0, a: 1, b: 0, roleK: Infinity, vc: 0 };
  const row = (d, pid, opp, v) => ({ pid, pos: 'G', season: 2026, date: `2026-01-${String(d).padStart(2, '0')}`, game: `g${d}-${opp}`, opp, s: { pts: v } });
  const plain = makeModel(stat, BASE, {});
  const recent = makeModel(stat, { ...BASE, od: 0.2 }, {});
  // (ten players at 10 a game; the defense O allowing them 10 for six games, then 20 for two)
  const days = [];
  for (let d = 1; d <= 8; d++) days.push(Array.from({ length: 10 }, (_, i) => row(d, `p${i}`, 'O', d <= 6 ? 10 : 20)));
  for (let d = 1; d <= 8; d++) days.push(Array.from({ length: 10 }, (_, i) => row(d, `p${i}`, 'Q', 10)).map((r) => ({ ...r, date: `2026-02-${String(d).padStart(2, '0')}` })));
  for (const m of [plain, recent]) for (const b of days) m.learn(b);
  const next = { pid: 'p0', pos: 'G', season: 2026, date: '2026-03-01', opp: 'O' };
  const a = plain.project(next).opp;
  const b = recent.project(next).opp;
  assert.ok(a > 1 && b > a, `${b} against ${a}: its two latest games weigh more`);
});

test('as measured: the tables\' recency searched on no stat (rebounds\' keep not held on other stretches, 2026-10-14), the defenders-out terms on no stat\'s ctx', async () => {
  const { STATS } = await import('../libs/ranker/scripts/model/props.mjs');
  const { searched } = await import('../libs/ranker/scripts/model/project.mjs');
  for (const [sport, list] of Object.entries(STATS)) {
    for (const st of list) {
      assert.equal(searched(st, 'od'), false, `${sport} ${st.key}`);
      const ctx = Array.isArray(st.ctx) ? st.ctx : st.ctx ? [st.ctx] : [];
      for (const k of ['oppOut', 'oppD', 'oppDB', 'oppFront']) assert.ok(!ctx.includes(k), `${sport} ${st.key} ${k}`);
    }
  }
});
