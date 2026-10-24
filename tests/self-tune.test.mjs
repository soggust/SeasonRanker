// The weekly self-tune (libs/ranker/scripts/model/self-tune.mjs, tuned.mjs; DECISIONS.md D88): the menu's bounds,
// one change a sport a week, the cooldown, the held-out confirmation, the recency veto, D60's guards, and that a
// change is data (tuned.json), never code
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as TU from '../libs/ranker/scripts/model/tuned.mjs';
import * as ST from '../libs/ranker/scripts/model/self-tune.mjs';
import * as DESK from '../libs/ranker/scripts/model/desk.mjs';
import * as WIN from '../libs/ranker/scripts/model/windows.mjs';
import { TRIAL_OPTS } from '../libs/ranker/scripts/model/trusted.mjs';
import { stableVerdict, FIT_STABLE, FIT_STABLE_K } from '../libs/ranker/scripts/model/gate.mjs';
import * as HA from '../scripts/history-audit.mjs';

const MODEL = path.resolve(import.meta.dirname, '../libs/ranker/scripts/model');

test('D88 the menu: every default the shipped constant, every grid value and default inside its bounds', () => {
  const K = TU.KNOBS;
  assert.deepEqual(Object.keys(K).sort(), ['barMin', 'barZ', 'beatBar', 'beatMin', 'leanLambdaLines', 'leanLambdaProps', 'leanMLines', 'leanMProps', 'loveUnits', 'mmaOpenFav', 'ownMin', 'ownThr', 'trialKelly', 'windowMin', 'windowZ', 'youngShrink'].sort());
  assert.equal(K.beatBar.def, DESK.BEAT_BAR);
  assert.equal(K.beatMin.def, DESK.LINE_GATE_MIN);
  assert.equal(K.barZ.def, DESK.BAR_Z);
  assert.equal(K.barMin.def, DESK.BAR_MIN);
  assert.equal(K.ownThr.def, DESK.OWN_THR);
  assert.equal(K.ownMin.def, DESK.OWN_MIN);
  assert.equal(K.windowZ.def, WIN.WIN_Z);
  assert.equal(K.windowMin.def, WIN.WIN_MIN);
  assert.equal(K.trialKelly.def, TRIAL_OPTS.kelly);
  assert.equal(K.loveUnits.def, TRIAL_OPTS.loveUnits);
  assert.equal(K.youngShrink.def, 1);
  for (const [name, k] of Object.entries(K)) {
    assert.ok(TU.inBounds(name, k.def), `${name}'s default in bounds`);
    assert.ok(k.grid.includes(k.def), `${name}'s grid is around its default`);
    for (const v of k.grid) assert.ok(TU.inBounds(name, v), `${name} ${v} in bounds`);
    assert.ok(k.grid.length <= 5, `${name}: a small grid`);
    assert.ok(['staking', 'pricing'].includes(k.kind));
    assert.ok(/^D\d+/.test(k.ref));
  }
  assert.deepEqual(Object.keys(K).filter((n) => K[n].kind === 'pricing'), ['youngShrink'], 'the one pricing knob');
  // (the bounds pinned: never widened silently)
  assert.deepEqual(K.beatBar.bounds, [0.5, 0.56]);
  assert.deepEqual(K.barZ.bounds, [0.5, 2]);
  assert.deepEqual(K.ownThr.bounds, [-0.2, -0.03]);
  assert.deepEqual(K.youngShrink.bounds, [0, 1]);
  assert.equal(ST.HOLDOUT_DAYS, 56);
  assert.equal(ST.CHOOSE_Z, 1);
  assert.equal(ST.COOLDOWN_DAYS, 28);
  assert.equal(ST.WEEK_DAYS, 6);
  assert.equal(ST.RECENT_BETS, 100);
});

test('D88 a change is data: the desk reads tuned.json, an out-of-bounds or off-menu value reads the default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuned-'));
  const dir = path.join(root, 'apps/nfl/src/StaticData/model');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tuned.json'), JSON.stringify({ v: 1, sport: 'nfl', knobs: { beatBar: 0.5375, barZ: 9, trialKelly: 0.02 }, changes: [] }));
  TU.clearTuned();
  assert.equal(TU.knob('nfl', 'beatBar', root), 0.5375, 'the file read');
  assert.equal(TU.knob('nfl', 'barZ', root), 1, 'out of bounds: the default');
  assert.equal(TU.knob('nfl', 'trialKelly', root), 0.01, 'not on the NFL menu: the default');
  assert.equal(TU.knob('nba', 'beatBar', root), 0.525, 'no file: the default');
  TU.setOverride('nfl', { beatBar: 0.55 });
  assert.equal(TU.knob('nfl', 'beatBar', root), 0.55, "the self-tune's in-process override first");
  TU.setOverride('nfl', null);
  assert.equal(TU.knob('nfl', 'beatBar', root), 0.5375);
  assert.throws(() => TU.knob('nfl', 'nope'));
  TU.clearTuned();
  // (the live desk and the replay read them by sport)
  assert.deepEqual(DESK.beatOpts('nba'), { bar: 0.525, min: 40 });
  assert.deepEqual(DESK.barOpts('nba'), { z: 1, min: 40 });
  assert.deepEqual(DESK.ownOpts('nba'), { thr: -0.1, min: 10 });
  assert.equal(DESK.ownVerdict(12, -4, { thr: -0.1, min: 10 }).held, true);
  assert.equal(DESK.ownVerdict(12, -4, { thr: -0.15, min: 10 }).held, false);
  const rr = fs.readFileSync(path.join(MODEL, 'replay-record.mjs'), 'utf8');
  for (const k of ['beatBar', 'beatMin', 'windowZ', 'windowMin', 'trialKelly', 'loveUnits']) assert.ok(rr.includes(`T('${k}'`), `the replay reads ${k}`);
  assert.ok(rr.includes('V.desk.ownOpts') && rr.includes('V.desk.barOpts'));
  // (the self-tune writes tuned.json, findings and, for a pricing knob alone, MODEL_EPOCH: no other code)
  const st = fs.readFileSync(path.join(MODEL, 'self-tune.mjs'), 'utf8');
  const writes = [...st.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(writes)].sort(), ['empty', 'ff', 'gridFile', 'lf', 'log', 'out', 'tunedFile(sport)', "val('--json')"].sort());
  assert.ok(st.includes("r.decision?.ship?.kind === 'pricing'"), 'the epoch only for a pricing knob');
  assert.equal(ST.bumpEpoch("x\nexport const MODEL_EPOCH = '2026-10-23T05:30:00Z';\ny", '2026-11-02T09:00:00Z'), "x\nexport const MODEL_EPOCH = '2026-11-02T09:00:00Z';\ny");
});

test('D88 one change a sport a week, a changed knob cools down 4 weeks, never off its grid', () => {
  const fresh = ST.readTunedFile('nonesuch');
  const all = ST.candidatesOf('nfl', fresh, '2026-10-26');
  assert.ok(all.cands.length > 10);
  assert.ok(all.cands.every((c) => c.value !== c.from && TU.KNOBS[c.knob].grid.includes(c.value)));
  assert.ok(all.cands.every((c) => TU.onMenu('nfl', c.knob)));
  assert.ok(!all.cands.some((c) => c.knob === 'youngShrink' || c.knob === 'trialKelly'), "off the NFL's menu");
  const file = { knobs: { beatBar: 0.5375 }, changes: [{ date: '2026-10-26', knob: 'beatBar', from: 0.525, to: 0.5375 }] };
  assert.equal(ST.candidatesOf('nfl', file, '2026-10-30').cands.length, 0, 'a change 4 days ago: nothing tried');
  assert.match(ST.candidatesOf('nfl', file, '2026-10-30').blocked[0], /one a week/);
  const week = ST.candidatesOf('nfl', file, '2026-11-02');
  assert.ok(week.cands.length > 0, 'a week on, the others');
  assert.ok(!week.cands.some((c) => c.knob === 'beatBar'), 'beatBar cooling down');
  assert.ok(week.blocked.some((b) => /beatBar changed 2026-10-26: cooling down till 2026-11-23/.test(b)));
  const later = ST.candidatesOf('nfl', file, '2026-11-23');
  assert.ok(later.cands.some((c) => c.knob === 'beatBar' && c.from === 0.5375 && c.value !== 0.5375), '4 weeks on, tried again from its new value');
});

// (a series: [day, season, profit, staked, bets, checked, beat, clv, units checked, units beat, units x clv])
const series = (days, profit) => ({ overall: { bets: days.length * 5, profit: days.reduce((t, d) => t + profit(d), 0), staked: days.length * 5, beat: 0.5, beatN: days.length * 4, clv: 0 }, days: days.map((d) => [d.day, d.season, profit(d), 5, 5, 4, 2, 0, 4, 2, 0]) });
const daysOf = () => {
  const out = [];
  for (let i = 0; i < 400; i++) {
    const t = Date.parse('2025-01-01T12:00:00Z') + i * 864e5;
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, season: day < '2025-09-01' ? 2025 : 2026, i });
  }
  return out;
};

test('D88 the verdict: the choice made before the held-out 8 weeks, confirmed in them, the newest seasons not worse', () => {
  const days = daysOf();
  const base = series(days, (d) => (d.i % 2 ? 1 : -1));
  // (better everywhere, steadily)
  const good = series(days, (d) => (d.i % 2 ? 1 : -1) + 0.2);
  const g = ST.judge(base, good);
  assert.equal(g.pass, true, g.why.join('; '));
  assert.ok(g.hold.gain > 0 && g.choose.gain > g.choose.se);
  // (better before the held-out weeks only: held)
  const early = series(days, (d) => (d.i % 2 ? 1 : -1) + (d.day < g.cut ? 0.2 : -0.05));
  const e = ST.judge(base, early);
  assert.equal(e.checks.holdout, false);
  assert.equal(e.pass, false);
  // (no change at all in the held-out weeks: no win, held)
  const flat = series(days, (d) => (d.i % 2 ? 1 : -1) + (d.day < g.cut ? 0.2 : 0));
  assert.equal(ST.judge(base, flat).checks.holdout, false);
  // (more units overall but worse in the last complete season (2025): the recency veto)
  const old = series(days, (d) => (d.i % 2 ? 1 : -1) + (d.season === 2025 ? -0.05 : 0.5));
  const o = ST.judge(base, old);
  assert.equal(o.checks.lastSeason, false);
  assert.equal(o.pass, false);
  // (the sport's current season with no bets yet (the NBA's in October): the last complete one is the season before it)
  const off = ST.judge(base, old, { current: 2027 });
  assert.equal(off.last.season, 2026);
  assert.equal(off.current.bets, 0);
  assert.equal(off.checks.lastSeason, true);
  // (noise: a gain under one SE before the held-out weeks isn't chosen)
  const noisy = series(days, (d) => (d.i % 2 ? 1 : -1) + (d.i % 7 === 0 ? 3 : d.i % 7 === 1 ? -2.9 : 0));
  assert.equal(ST.judge(base, noisy).checks.choose, false);
  // (the held-out window is 8 weeks of play: an off-season gap counts a week at most)
  assert.equal(ST.holdoutCut(['2026-01-01', '2026-01-08', '2026-07-01', '2026-07-08'], 14), '2026-07-01');
  assert.equal(ST.holdoutCut(['2026-01-01', '2026-01-02', '2026-01-03'], 56), '2026-01-01');
});

test("D88 D60's guards: more units at worse prices, plain or stake-weighted, are held", () => {
  const days = daysOf();
  const base = series(days, (d) => (d.i % 2 ? 1 : -1));
  const cand = series(days, (d) => (d.i % 2 ? 1 : -1) + 0.2);
  // (the same bets, the stake moved to the ones that beat the close less often)
  cand.days = cand.days.map((r) => [...r.slice(0, 8), 4, 1, 0]);
  const j = ST.judge(base, cand);
  assert.equal(j.checks.stakeGuard, false);
  assert.equal(j.pass, false);
  const worse = { ...series(days, (d) => (d.i % 2 ? 1 : -1) + 0.2) };
  worse.overall = { ...worse.overall, beat: 0.45 };
  assert.equal(ST.judge(base, worse).checks.guard, false, "the replay's guard (gate-score.mjs replayGuard)");
});

test('D88 the decision: the top choice alone, shipped only if it passes; a pricing knob needs D22 too', () => {
  const days = daysOf();
  const base = series(days, (d) => (d.i % 2 ? 1 : -1));
  const a = { id: 'beatBar=0.5375', knob: 'beatBar', value: 0.5375, from: 0.525, kind: 'staking', ref: 'D60', j: ST.judge(base, series(days, (d) => (d.i % 2 ? 1 : -1) + 0.2)) };
  const b = { id: 'barZ=1.25', knob: 'barZ', value: 1.25, from: 1, kind: 'staking', ref: 'D51/D64', j: ST.judge(base, series(days, (d) => (d.i % 2 ? 1 : -1) + 0.1)) };
  const d = ST.decide([b, a]);
  assert.equal(d.ship.id, 'beatBar=0.5375');
  // (the top one fails the held-out weeks: nothing ships, the next isn't tried)
  const early = { ...a, j: ST.judge(base, series(days, (x) => (x.i % 2 ? 1 : -1) + (x.day < a.j.cut ? 0.5 : -0.1))) };
  assert.equal(ST.decide([b, early]).ship, null);
  assert.equal(ST.decide([b, early]).top.id, 'beatBar=0.5375');
  const p = { ...a, id: 'youngShrink=0.5', knob: 'youngShrink', value: 0.5, from: 1, kind: 'pricing', ref: 'D82', gate: { pass: false, why: ['props projections worse beyond noise'] } };
  assert.equal(ST.decide([p]).ship, null, "a pricing knob D22's gate holds");
  assert.equal(ST.decide([{ ...p, gate: { pass: true, why: [] } }]).ship.id, 'youngShrink=0.5');
  const file = ST.applyShip({ v: 1, sport: 'nfl', knobs: {}, changes: [] }, 'nfl', d.ship, '2026-10-26');
  assert.deepEqual(file.knobs, { beatBar: 0.5375 });
  assert.equal(file.changes.at(-1).from, 0.525);
  assert.equal(file.changes.at(-1).to, 0.5375);
  const text = ST.findingText('nfl', { judged: [a, b], blocked: [], decision: d });
  assert.match(text, /^Self-tune: NFL D60 beatBar 52\.5% → 53\.75%: \+\d/);
  const f = ST.setFindings({ v: 1, entries: [] }, 'nfl', { judged: [a, b], blocked: [], decision: d }, '2026-10-26');
  assert.equal(f.entries[0].group, 'shipped');
  const held = ST.setFindings(f, 'nba', { judged: [], blocked: ['x'], decision: ST.decide([]) }, '2026-10-26');
  const held2 = ST.setFindings(held, 'nba', { judged: [], blocked: ['y'], decision: ST.decide([]) }, '2026-11-02');
  assert.equal(held2.entries.filter((e) => e.sport === 'nba').length, 1, "a held sport's line replaced");
  assert.equal(held2.entries.filter((e) => e.group === 'shipped').length, 1, 'a change kept');
  // (the audit re-records the changed sports; every sport for a pricing knob, the epoch moved)
  assert.deepEqual(HA.tuneAgain([{ sport: 'nfl', shipped: { kind: 'staking' } }, { sport: 'nba', shipped: null }], ['nfl', 'nba', 'nhl']), ['nfl']);
  assert.deepEqual(HA.tuneAgain([{ sport: 'nba', shipped: { kind: 'pricing' } }], ['nfl', 'nba']), ['nfl', 'nba']);
  assert.equal(HA.parseArgs(['--mode', 'weekly']).tune, true);
  assert.equal(HA.parseArgs(['--mode', 'nightly']).tune, false);
  assert.equal(HA.parseArgs(['--mode', 'weekly', '--no-tune']).tune, false);
});

test("D88 the walk-forward fit's stability: the new search's settings taken only past k standard errors", () => {
  assert.equal(FIT_STABLE, true);
  assert.equal(FIT_STABLE_K, 1);
  const pairs = (n, d, noise) => Array.from({ length: n }, (_, i) => [`g${i % 50}`, 1, 1 + d + (i % 2 ? noise : -noise)]);
  assert.equal(stableVerdict(pairs(2000, -0.01, 0.001)).took, true, 'clearly better: taken');
  assert.equal(stableVerdict(pairs(2000, -0.0005, 0.05)).took, false, 'within noise: the old kept');
  assert.equal(stableVerdict(pairs(2000, 0.01, 0.001)).took, false, 'worse: the old kept');
  assert.equal(stableVerdict([]).took, false);
  const gate = fs.readFileSync(path.join(MODEL, 'gate.mjs'), 'utf8');
  assert.ok(gate.includes('prev?.code === code && prev.fits && prev.rows !== before.length'), 'only a re-search of the same code on other rows');
  assert.ok(gate.includes("tuned: hashOf(knobsOf(sport, root))"), "the record's code carries the knobs");
});

test('D88 every committed tuned.json: its knobs on the menu and in bounds, its changes dated and one a week a sport', () => {
  for (const sport of ST.SPORTS) {
    const f = TU.tunedFile(sport);
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.equal(j.sport, sport);
    for (const [name, v] of Object.entries(j.knobs ?? {})) {
      assert.ok(TU.onMenu(sport, name), `${sport} ${name} on the menu`);
      assert.ok(TU.inBounds(name, v), `${sport} ${name} ${v} in bounds`);
    }
    const ch = j.changes ?? [];
    for (let i = 0; i < ch.length; i++) {
      assert.match(ch[i].date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(TU.KNOBS[ch[i].knob]?.grid.includes(ch[i].to), `${sport} ${ch[i].knob} to ${ch[i].to}: a grid value`);
      if (i) assert.ok(ST.daysBetween(ch[i - 1].date, ch[i].date) >= ST.WEEK_DAYS, `${sport}: one change a week`);
    }
  }
});

test("D88 the margin rule: a side the Bot's own model puts under the fair price needs lambda x d + m of price edge; 0 and 0 the rule as it was", async () => {
  const L = await import('../libs/ranker/scripts/model/lean.mjs');
  for (const k of ['leanLambdaLines', 'leanMLines', 'leanLambdaProps', 'leanMProps']) {
    assert.equal(TU.KNOBS[k].def, 0, `${k}: today's behavior by default`);
    assert.ok(!TU.onMenu('mma', k));
  }
  // (the owner's case, NBA MEM @ GS: GS ML -154, the Bot's own model 59.6% against the fair 60.9%, a shopped edge of ~0.3 points)
  const gs = L.marginOf({ p: 0.6093, odds: -154, fair: 0.609, own: 0.596 });
  assert.ok(Math.abs(gs.d - 0.013) < 1e-9);
  assert.ok(gs.e > 0 && gs.e < 0.004);
  assert.equal(L.marginHeld(gs, { lambda: 0, m: 0 }), false, 'today: bet');
  assert.equal(L.marginHeld(gs, { lambda: 0.5, m: 0 }), true, 'at lambda 0.5: the practice stake');
  assert.equal(L.marginHeld(gs, { lambda: 0, m: 0.005 }), true);
  // (a side the model agrees with is never held, whatever the knobs)
  assert.equal(L.marginHeld(L.marginOf({ p: 0.56, odds: -110, fair: 0.52, own: 0.55 }), { lambda: 3, m: 0.03 }), false);
  assert.equal(L.marginGuardOf('nba', 'lines', { p: 0.6093, odds: -154, fair: 0.609, own: 0.596 }).held, false, 'no tuned.json: today');
  const rr = fs.readFileSync(path.join(MODEL, 'replay-record.mjs'), 'utf8');
  assert.ok(rr.includes("T(group === 'props' ? 'leanLambdaProps' : 'leanLambdaLines', 0)"));
  const run = fs.readFileSync(path.join(MODEL, 'run.mjs'), 'utf8');
  assert.ok(run.includes("marginGuardOf(sport, 'lines'") && run.includes("marginGuardOf(sport, 'props'"), 'the live desk reads it, lines and props');
});

test("D88 MMA's open favorites: 0 the rules as they are, 1 the full Kelly stake, 2 the minimum; read by the replay and the live MMA desk", () => {
  assert.deepEqual(TU.KNOBS.mmaOpenFav.grid, [0, 1, 2]);
  assert.equal(TU.KNOBS.mmaOpenFav.def, 0);
  assert.deepEqual(TU.KNOBS.mmaOpenFav.sports, ['mma']);
  const rr = fs.readFileSync(path.join(MODEL, 'replay-record.mjs'), 'utf8');
  assert.ok(rr.includes("T('mmaOpenFav', 0)") && rr.includes("b.timing !== 'open' || !(b.fair >= 0.5)"));
  const md = fs.readFileSync(path.join(MODEL, 'mma-desk.mjs'), 'utf8');
  assert.ok(md.includes("knob(SPORT, 'mmaOpenFav')") && md.includes("!== 'early'"));
});
