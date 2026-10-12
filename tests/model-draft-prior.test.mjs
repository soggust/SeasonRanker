// The NFL props' draft prior (libs/ranker/scripts/model/project.mjs dp, playerlogs.mjs row.draft): a player in his
// first two seasons with a short run of his own has the position's prior times his draft slot's ratio (what that
// slot's rookies did against the position's prior before each game), learned as the replay goes; off (0), a
// veteran, or no draft known: the model as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftBucket, makeModel } from '../libs/ranker/scripts/model/project.mjs';
import { STATS } from '../libs/ranker/scripts/model/props.mjs';

const BASE = { K: 4, w: 0, a: 0, b: 0, roleK: Infinity, vc: 0 };
const stat = { key: 'recYds', draft: true };
const at = (d) => `2026-09-${String(d).padStart(2, '0')}`;
const wr = (pid, d, v, draft, extra = {}) => ({ pid, pos: 'WR', season: 2026, date: at(d), opp: 'o', s: { recYds: v }, draft, ...extra });
const VET = { year: 2015, pick: 40 };

// (the history: 30 veterans' games at 40, then 30 first-round rookies' at 80 and 30 undrafted rookies' at 20)
function history(m) {
  m.learn(Array.from({ length: 30 }, (_, i) => wr(`v${i}`, 1, 40, VET)));
  m.learn([
    ...Array.from({ length: 30 }, (_, i) => wr(`f${i}`, 2, 80, { year: 2026, pick: 5 + (i % 5) })),
    ...Array.from({ length: 30 }, (_, i) => wr(`u${i}`, 2, 20, { year: 2026, pick: 0 })),
  ]);
}
// (a player's two games at 50, then his projection)
function projected(m, pid, draft) {
  m.learn([wr(pid, 3, 50, draft), wr(pid, 4, 50, draft)]);
  return m.project({ pid, pos: 'WR', season: 2026, date: at(10), opp: 'o' });
}

test('draftBucket: the slots by overall pick, undrafted its own', () => {
  assert.equal(draftBucket(1), '10');
  assert.equal(draftBucket(32), '32');
  assert.equal(draftBucket(33), '64');
  assert.equal(draftBucket(151), 'late');
  assert.equal(draftBucket(0), 'undrafted');
  assert.equal(draftBucket(undefined), 'undrafted');
});

test('dp off: a rookie projects from the position prior, his draft or none', () => {
  const a = makeModel(stat, BASE, {});
  const b = makeModel(stat, BASE, {});
  history(a), history(b);
  const p = projected(a, 'r', { year: 2026, pick: 3 });
  const q = projected(b, 'r', null);
  assert.ok(Math.abs(p.rate - q.rate) < 1e-9, `${p.rate} ${q.rate}`);
  assert.equal(p.draft, null);
});

test("dp on: a first-rounder's prior up, an undrafted rookie's down, his own games fading it by K", () => {
  const off = makeModel(stat, BASE, {});
  const on = makeModel(stat, { ...BASE, dp: 1 }, {});
  history(off), history(on);
  const first = { year: 2026, pick: 7 };
  const undrafted = { year: 2026, pick: 0 };
  const p0 = projected(off, 'r', first);
  const p1 = projected(on, 'r', first);
  assert.ok(p1.rate > p0.rate + 5, `${p1.rate} vs ${p0.rate}`);
  assert.ok(p1.draft.factor > 1.3 && p1.draft.factor < 2, `${p1.draft.factor}`);
  assert.equal(p1.draft.pick, 7);
  const u0 = projected(off, 'u', undrafted);
  const u1 = projected(on, 'u', undrafted);
  assert.ok(u1.rate < u0.rate - 3, `${u1.rate} vs ${u0.rate}`);
  // (the prior's weight K / (games + K): two games in, a third of his rate his own)
  assert.ok(Math.abs(p1.rate - (100 + 4 * p1.prior) / 6) < 1e-9);
});

test('dp on: a veteran (his first season long ago), a third-year player or no draft known: as before', () => {
  for (const draft of [VET, { year: 2024, pick: 3 }, null]) {
    const off = makeModel(stat, BASE, {});
    const on = makeModel(stat, { ...BASE, dp: 1 }, {});
    history(off), history(on);
    const a = projected(off, 'x', draft);
    const b = projected(on, 'x', draft);
    assert.ok(Math.abs(a.rate - b.rate) < 1e-9, `${JSON.stringify(draft)}: ${a.rate} ${b.rate}`);
    assert.equal(b.draft, null);
  }
});

test('dp on: a coming game (no draft on its row) reads his draft from his games; only rookies teach the slots', () => {
  const on = makeModel(stat, { ...BASE, dp: 1 }, {});
  history(on);
  // (second-year first-rounders far under: not their rookie season, so not in the slot's table)
  on.learn(Array.from({ length: 30 }, (_, i) => wr(`s${i}`, 5, 0, { year: 2025, pick: 6 })));
  const p = projected(on, 'r', { year: 2026, pick: 2 });
  assert.ok(p.draft?.factor > 1.3, `${p.draft?.factor}`);
});

test('every NFL prop has the draft prior to fit; no other sport does', () => {
  for (const st of STATS.nfl) assert.equal(st.draft, true, st.key);
  for (const sport of ['nba', 'nhl', 'mlb']) for (const st of STATS[sport]) assert.ok(!st.draft, `${sport} ${st.key}`);
});
