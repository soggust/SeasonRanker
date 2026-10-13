// The start-of-season prior (libs/ranker/scripts/model/project.mjs sp, audit #11): a veteran's base, where his own
// longer run is his prior, by how the prior's games have run against the stat's level, learned as the replay goes
// by his position, his age and whether he's on a new team, to the power sp x the prior's weight in his base.
// Off, the model exactly as before; a rookie (the position's prior) and a row with no table untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeModel, fitStat, SP_EARLY } from '../libs/ranker/scripts/model/project.mjs';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';

const STAT = { key: 'rec', start: true };
const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };
const day = (season, g) => new Date(Date.UTC(season, 8, 1 + g * 7)).toISOString().replace('.000Z', 'Z');
const row = (pid, season, g, v, extra = {}) => ({ pid, pos: 'WR', season, date: day(season, g), opp: 'o', team: 't1', game: `${pid}-${season}-${g}`, s: { rec: v }, ...extra });
// (veterans: last season 16 games at 5 a game; this season their first games at 3 (old, or on a new team: the
// prior's games under), the rest at 5; the young ones on their team at 5 throughout)
function history() {
  const out = [];
  for (let i = 0; i < 40; i++) {
    const old = i < 20;
    const pid = `${old ? 'old' : 'yng'}${i}`;
    const born = old ? '1990-01-01' : '2001-01-01';
    for (let g = 0; g < 16; g++) out.push(row(pid, 2024, g, 5, { born }));
    for (let g = 0; g < 16; g++) out.push(row(pid, 2025, g, old && g < SP_EARLY ? 3 : 5, { born }));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
function model(params, rows = history(), stat = STAT) {
  const m = makeModel(stat, params, {});
  let i = 0;
  while (i < rows.length) {
    const d = rows[i].date.slice(0, 10);
    let j = i;
    while (j < rows.length && rows[j].date.slice(0, 10) === d) j++;
    m.learn(rows.slice(i, j));
    i = j;
  }
  return m;
}
// (a veteran's 2026 opener: none of this season's games yet, his prior his own)
const opener = (pid, born, team = 't1') => ({ pid, pos: 'WR', season: 2026, date: day(2026, 0), opp: 'o', team, game: `${pid}-open`, born });

test('sp off (absent or 0): the projection exactly as before, the table learned either way', () => {
  const plain = model(BASE);
  const zero = model({ ...BASE, sp: 0 });
  const p = plain.project(opener('old1', '1990-01-01'));
  assert.deepEqual(zero.project(opener('old1', '1990-01-01')), p);
  assert.equal(p.sp.f, 1);
  assert.ok(p.sp.g < 0);
});

test('sp: the old veterans\' openers come down, the young ones\' by their own cell; fading with the prior\'s weight', () => {
  const off = model(BASE);
  const on = model({ ...BASE, sp: 1 });
  const [o0, o1] = [off.project(opener('old1', '1990-01-01')), on.project(opener('old1', '1990-01-01'))];
  const [y0, y1] = [off.project(opener('yng25', '2001-01-01')), on.project(opener('yng25', '2001-01-01'))];
  assert.ok(o1.mu < o0.mu, 'the old veteran lowered');
  assert.ok(Math.abs(Math.log(y1.mu / y0.mu)) < Math.abs(Math.log(o1.mu / o0.mu)), 'the young one moved less');
  // (exactly: (1 + g)^(sp x priorW) on the base, priorW 1 on an opener)
  assert.equal(o1.priorW, 1);
  assert.ok(Math.abs(o1.base - o0.base * (1 + o1.sp.g)) < 1e-9);
  assert.equal(o1.sp.cell, 'WR|31+|same');
  assert.equal(y1.sp.cell, 'WR|25-27|same');
  // (sp 2: twice the power on the log)
  const two = model({ ...BASE, sp: 2 }).project(opener('old1', '1990-01-01'));
  assert.ok(Math.abs(Math.log(two.base / o0.base) - 2 * Math.log(o1.base / o0.base)) < 1e-9);
});

test('sp: a new team is its own cell; unknown age its own; a rookie (the position\'s prior) untouched', () => {
  const m = model({ ...BASE, sp: 1 });
  assert.equal(m.project(opener('old2', '1990-01-01', 't9')).sp.cell, 'WR|31+|new');
  assert.equal(m.project({ ...opener('old3', null), born: undefined }).sp.cell, 'WR|31+|same', "his birth date from his history's rows");
  // (a player with under 10 games of a longer run: no table, the factor none)
  const rows = [...history(), row('rook', 2025, 14, 4), row('rook', 2025, 15, 4)].sort((a, b) => a.date.localeCompare(b.date));
  const r = model({ ...BASE, sp: 1 }, rows).project(opener('rook', null));
  assert.equal(r.sp, null);
  const r0 = model(BASE, rows).project(opener('rook', null));
  assert.equal(r.mu, r0.mu);
  // (a player whose rows carry no birth date anywhere: the unknown age's cell)
  const nb = history().map((x) => (x.pid === 'old4' ? { ...x, born: null } : x));
  assert.equal(model({ ...BASE, sp: 1 }, nb).project({ ...opener('old4', null) }).sp.cell, 'WR|u|same');
});

test('sp: the startTable reads each level, the old cell under the young', () => {
  const t = model(BASE).startTable();
  assert.ok(t['*'] && t['pos WR'] && t['WR|31+|same'] && t['WR|<25|same']);
  assert.ok(t['WR|31+|same'].g < t['WR|<25|same'].g);
  assert.ok(t['WR|31+|same'].g < 0);
});

test('sp\'s stats: the NFL\'s and the NBA\'s marked (the NBA\'s none held out till a second season)', () => {
  assert.deepEqual(STATS.nfl.filter((s) => s.start).map((s) => s.key), ['rushYds', 'recYds', 'rushRecYds']);
  assert.deepEqual(STATS.nba.filter((s) => s.start).map((s) => s.key), ['pts', 'reb', 'ast', 'fg3', 'pra']);
  assert.deepEqual(STATS.mlb.filter((s) => s.start), []);
  assert.deepEqual(STATS.nhl.filter((s) => s.start), []);
});

test('sp on a stat not marked start: no table read or learned, the projection the same', () => {
  const un = { key: 'rec' };
  const m = model({ ...BASE, sp: 1 }, history(), un);
  const p = m.project(opener('old1', '1990-01-01'));
  assert.equal(p.sp, null);
  assert.deepEqual(m.startTable(), {});
  assert.equal(p.mu, model(BASE, history(), un).project(opener('old1', '1990-01-01')).mu);
  assert.equal(p.mu, model(BASE).project(opener('old1', '1990-01-01')).mu);
});

test('sp: the table learned with it on the same as off (learned against the base without its factor)', () => {
  const on = model({ ...BASE, sp: 1 }).startTable();
  const off = model(BASE).startTable();
  assert.deepEqual(on, off);
  assert.ok(off['WR|31+|same'].ne > 0 && off['WR|31+|same'].ne <= off['WR|31+|same'].n);
});

test('sp: a mid-season game on a new team reads the new cell (the team he ended last season with)', () => {
  // (old1 moved at the turn: his 2026 games on t9; his 3rd of the season projected)
  const rows = [...history(), row('old1', 2026, 0, 4, { born: '1990-01-01', team: 't9' }), row('old1', 2026, 1, 4, { born: '1990-01-01', team: 't9' })].sort((a, b) => a.date.localeCompare(b.date));
  const m = model({ ...BASE, sp: 1 }, rows);
  const third = { ...row('old1', 2026, 2, 0, { born: '1990-01-01', team: 't9' }) };
  delete third.s;
  const p = m.project(third);
  assert.equal(p.sp.cell, 'WR|31+|new');
  assert.ok(p.priorW < 1 && p.priorW > 0);
  // (one who stayed: same)
  const stay = [...history(), row('old2', 2026, 0, 4, { born: '1990-01-01' }), row('old2', 2026, 1, 4, { born: '1990-01-01' })].sort((a, b) => a.date.localeCompare(b.date));
  const q = { ...row('old2', 2026, 2, 0, { born: '1990-01-01' }) };
  delete q.s;
  assert.equal(model({ ...BASE, sp: 1 }, stay).project(q).sp.cell, 'WR|31+|same');
});

test("sp's gate: too few early games held out or on the fit window, not searched and not set", () => {
  // (two seasons: the 2025 openers all fall in the fit window (the last 30% held out is 2025's later games))
  const fit = fitStat({ key: 'rec', start: true }, history().map((x) => ({ ...x, eligible: true })), {});
  assert.ok(fit);
  assert.ok(!fit.params.sp);
  assert.equal(fit.floors.sp.size, null);
  assert.ok(fit.floors.sp.fails.includes('too few early games held out'));
  assert.equal(fit.floors.sp.held, 0);
  assert.ok(fit.floors.sp.fit >= 100);
  assert.equal(fit.start.held, 0);
});
