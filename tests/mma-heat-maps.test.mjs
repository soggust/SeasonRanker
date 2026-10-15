// MMA's Heat Maps (apps/mma/scripts/build-heat-maps.mjs, apps/mma/scripts/strikes.mjs, apps/mma/src/sport/heat-maps.ts,
// the round-clock and body surfaces): a fight's finish code on hand-made fights, the cells it was going in, the
// division's base rates, ESPN's competitor statistics read into a row, the strike sums (career and the last five),
// the committed files against their contract and size, the surfaces' cells the script's, and the maps read from
// the real files: a striker's, a grappler's, a long career's last five.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine, readJson, staticDir, expandRows } from './support/engine.mjs';
import { CELL_IDS, DIVISIONS, SUM_FIELDS, buildFiles, divisionClock, exposure, fileName, finishCode, rates, readCode, rowDivisions, strikeSums } from '../apps/mma/scripts/build-heat-maps.mjs';
import { STRIKE_FIELDS, parseStrikes } from '../apps/mma/scripts/strikes.mjs';

const ROOT = staticDir('mma');
let h;
before(async () => {
  h = await loadEngine('mma', { entry: path.join(import.meta.dirname, 'support', 'mma-heat-entry.ts'), data: {} });
});

const fight = (o = {}) => ({
  id: '1',
  league: 'ufc',
  date: '2024-01-01',
  division: 'Lightweight',
  rounds: 3,
  period: 3,
  clock: 300,
  method: 'UD',
  fighters: [
    { id: 'a', name: 'A', winner: true },
    { id: 'b', name: 'B', winner: false },
  ],
  ...o,
});
const noWinner = [
  { id: 'a', winner: false },
  { id: 'b', winner: false },
];

// ---- the finishes

test("finish codes: how it ended from each side, and where (the round's minute) or the rounds it went", () => {
  assert.equal(finishCode(fight(), 'a'), 'W3', 'a decision win, three rounds');
  assert.equal(finishCode(fight(), 'b'), 'L3');
  assert.equal(finishCode(fight({ rounds: 5, period: 5 }), 'a'), 'W5');
  assert.equal(finishCode(fight({ method: 'KO', period: 1, clock: 59 }), 'a'), 'K0', 'a KO in the first minute');
  assert.equal(finishCode(fight({ method: 'KO', period: 1, clock: 60 }), 'b'), 'k1', 'at 1:00: the second minute');
  assert.equal(finishCode(fight({ method: 'SUB', period: 2, clock: 245 }), 'a'), 'S9', 'round 2, 4:05: its fifth minute');
  assert.equal(finishCode(fight({ method: 'KO', period: 3, clock: 300, rounds: 5 }), 'a'), 'Ke', 'stopped at the end of round 3 of 5: its last minute');
  assert.equal(finishCode(fight({ method: 'KO', rounds: 5, period: 5, clock: 299 }), 'a'), 'Ko', 'the last cell');
  assert.equal(finishCode(fight({ method: 'DQ', period: 1, clock: 100 }), 'b'), 'f1', 'another stoppage');
  assert.equal(finishCode(fight({ method: 'NC', period: 1, clock: 100, fighters: noWinner }), 'a'), 'n1', 'an early stop, no winner');
  assert.equal(finishCode(fight({ method: 'DRAW', fighters: noWinner }), 'a'), 'D3');
  assert.equal(finishCode(fight({ clock: 480, period: 1, method: 'KO' }), 'a'), 'xx', "PRIDE's ten-minute first round: off the grid");
  assert.equal(finishCode(fight({ rounds: 0 }), 'a'), 'xx');
  assert.equal(finishCode(fight(), 'z'), null, 'not his fight');
  assert.deepEqual(readCode('S8'), { how: 'S', cell: 8, rounds: null });
  assert.deepEqual(readCode('W5'), { how: 'W', cell: null, rounds: 5 });
  assert.equal(readCode('xx'), null);
  assert.deepEqual(exposure('S8'), { through: 8, ended: 8 });
  assert.deepEqual(exposure('W3'), { through: 14, ended: null });
});

test("the division's base rates: two sides going in each cell, a finish counted once, by method", () => {
  const fights = [fight({ method: 'KO', period: 1, clock: 30 }), fight({ method: 'SUB', period: 2, clock: 70 }), fight(), fight({ division: 'Catch Weight' })];
  const lw = divisionClock(fights).LW;
  assert.equal(lw.fights, 3, 'the catchweight left out');
  assert.equal(lw.n[0], 6);
  assert.equal(lw.n[5], 4, 'the first-minute KO done by round 2');
  assert.equal(lw.n[14], 2, 'only the decision to the end');
  assert.deepEqual([lw.all[0], lw.ko[0], lw.sub[6], lw.finishes, lw.r1, lw.decisive], [1, 1, 1, 2, 1, 3]);
});

test("a fighter's tally read back on the client: the cells he was going in, his finishes, the times he was finished", () => {
  const t = h.tallyFinishes(h.codesOf('K0W5s8xxL3'));
  assert.equal(t.fights, 4, 'the off-grid fight not counted');
  assert.equal(t.wins, 2);
  assert.equal(t.decisions, 2);
  assert.ok(t.rounds5, 'a five-round fight: the grid shows five');
  assert.deepEqual([t.n[0], t.n[1], t.n[9], t.n[20]], [4, 3, 2, 1]);
  assert.deepEqual([t.won.all[0], t.won.ko[0], t.lost.sub[8], t.lost.all[8]], [1, 1, 1, 1]);
  assert.equal(h.tallyFinishes(h.codesOf('W3K2')).rounds5, false);
  const clock = { n: Array(25).fill(100), all: Array(25).fill(3), ko: Array(25).fill(2), sub: Array(25).fill(1), fights: 50, decisive: 48, finishes: 30, r1: 15 };
  const cells = h.finishCells(t, clock, 'all', false, 5);
  assert.deepEqual(cells.map((c) => c.id), h.roundClockIds(5));
  assert.equal(cells[0].value, 0.25);
  assert.equal(cells[0].league, 0.03);
  assert.equal(cells[0].count, 1, 'volume counts his finishes');
  assert.ok(cells[0].sd > 0);
  // (a minute with none reads faintly; one finish in four leans, a good deal)
  const stat = { key: 'all', label: 'All', format: String, minN: 3, noun: 'fights' };
  assert.ok(Math.abs(h.cellTone(cells[1], stat)) < 0.2, 'none in three: faint');
  assert.ok(h.cellTone(cells[0], stat) > 0.3);
  assert.equal(h.heatPaint(cells[0], { stat, mode: 'volume', most: 1 }).fill.startsWith('rgba'), true, 'volume paints the count');
});

// ---- the strikes

test("ESPN's competitor statistics read into a row; nothing tried, nothing kept", () => {
  const stats = (o) => ({ splits: { categories: [{ stats: Object.entries(o).map(([name, value]) => ({ name, value })) }] } });
  const row = parseStrikes(
    stats({ sigDistanceHeadStrikesLanded: 38, sigDistanceHeadStrikesAttempted: 124, sigGroundLegStrikesLanded: 1, sigGroundLegStrikesAttempted: 2, knockDowns: 1, timeInControl: 300, takedownsLanded: 7, takedownsAttempted: 9 }),
  );
  assert.equal(row.length, STRIKE_FIELDS.length);
  assert.equal(row[STRIKE_FIELDS.indexOf('dist-head')], 38);
  assert.equal(row[STRIKE_FIELDS.indexOf('dist-head-att')], 124);
  assert.equal(row[STRIKE_FIELDS.indexOf('ground-leg-att')], 2);
  assert.deepEqual(['kd', 'ctrl', 'tdl', 'tda'].map((f) => row[STRIKE_FIELDS.indexOf(f)]), [1, 300, 7, 9]);
  assert.equal(parseStrikes(stats({ knockDowns: 0 })), 0);
  assert.equal(parseStrikes(null), 0);
});

const side = (o) => STRIKE_FIELDS.map((f) => o[f] ?? 0);
test("strike sums: his and his opponents', the career and the last five, control time where it was kept", () => {
  const bouts = Array.from({ length: 7 }, (_, i) => ({
    fight: fight({ id: String(i), period: 1, clock: 120 }),
    mine: side({ 'dist-head': 2, 'dist-head-att': 4, ctrl: i < 2 ? 30 : 0 }),
    theirs: side({ 'clinch-body': 1, 'clinch-body-att': 3 }),
  }));
  const { career, last } = strikeSums(bouts);
  const at = (s, f) => s[SUM_FIELDS.indexOf(f)];
  assert.deepEqual([at(career, 'n'), at(career, 'secs'), at(career, 'ctrlSecs')], [7, 840, 240]);
  assert.deepEqual([at(career, 'o:dist-head'), at(career, 'd:clinch-body-att'), at(last, 'n'), at(last, 'o:dist-head')], [14, 21, 5, 10]);
  assert.equal(strikeSums(bouts.slice(0, 5)).last, null, 'five or fewer: the career is the last five');
  assert.equal(strikeSums([]), null);
  const r = rates(career);
  assert.equal(r.o.acc[CELL_IDS.indexOf('dist-head')], 0.5, '14 of 28');
  assert.equal(r.o.acc[CELL_IDS.indexOf('head')], 0.5, 'a target across the positions');
  assert.equal(r.d.acc[CELL_IDS.indexOf('clinch-head')], null, 'under 15 thrown: no rate');
  assert.equal(CELL_IDS.length, 12);
});

test("the build on hand-made data: a fighter in his rows' divisions, a pound-for-pound row's too", () => {
  const s = side({ 'dist-head': 1, 'dist-head-att': 2 });
  const strikes = new Map([['1', { a: s, b: s }]]);
  const { main: m, divisions } = buildFiles([fight({ method: 'KO', period: 1, clock: 10 })], strikes, { P4P: [{ gsisId: 'a', division: 'LW' }], WW: [{ gsisId: 'a' }] });
  assert.equal(divisions.LW.fighters.a.f, 'K0');
  assert.equal(divisions.WW.fighters.a.c[0], 1);
  assert.equal(divisions.FW.fighters.a, undefined);
  assert.ok(m.divisions.LW.clock && m.divisions.LW.strikes);
});

// ---- the committed files

const main = readJson(path.join(ROOT, 'heat-maps.json'));
const tabs = expandRows(readJson(path.join(ROOT, 'skill-players.json')));

test("heat-maps.json: the fields, and every division's base rates", () => {
  assert.deepEqual(main.fields.sum, SUM_FIELDS);
  assert.deepEqual(main.fields.cells, CELL_IDS);
  for (const d of DIVISIONS) {
    const b = main.divisions[d];
    assert.ok(b?.clock && b.strikes, d);
    for (const k of ['n', 'all', 'ko', 'sub']) assert.equal(b.clock[k].length, 25, `${d} ${k}`);
    assert.ok(
      b.clock.all.every((v, i) => v <= b.clock.n[i] && v >= b.clock.ko[i] + b.clock.sub[i]),
      `${d}: finishes within the fights going, KOs and submissions among them`,
    );
    assert.ok(b.clock.n[0] >= b.clock.n[14] && b.clock.n[14] >= b.clock.n[15], `${d}: fewer going as the clock runs`);
    assert.equal(b.strikes.sum.length, SUM_FIELDS.length);
    for (const k of ['acc', 'pm', 'share', 'dacc', 'dpm', 'dshare']) assert.equal(b.strikes.sd[k].length, CELL_IDS.length, `${d} sd ${k}`);
  }
  assert.ok(fs.statSync(path.join(ROOT, 'heat-maps.json')).size < 60 * 1024);
});

test("each division's file: its rows' fighters, their codes and sums; each under 300 KB, all under 2 MB", () => {
  const listed = rowDivisions(tabs);
  let total = 0;
  for (const d of DIVISIONS) {
    const file = path.join(ROOT, fileName(d));
    const size = fs.statSync(file).size;
    total += size;
    assert.ok(size < 300 * 1024, `${d} ${size}`);
    const { division, fighters } = readJson(file);
    assert.equal(division, d);
    for (const [id, e] of Object.entries(fighters)) {
      assert.ok(listed.get(id)?.has(d), `${d} ${id} a row naming it`);
      assert.match(e.f, /^([KSFksfn][0-9a-o]|[WLD][1-5]|xx)*$/, `${id}'s codes`);
      if (e.c) assert.equal(e.c.length, SUM_FIELDS.length);
      if (e.l) assert.ok(e.l[0] === 5 && e.c[0] > 5, 'the last five beside a longer career');
    }
    for (const [id, divisions] of listed) if (divisions.has(d)) assert.ok(fighters[id], `${d}: ${id} listed`);
  }
  assert.ok(total < 2 * 1024 * 1024, `${total}`);
});

test('the surfaces: the round clock, three rounds or five; the figure and the three', () => {
  for (const [id, rounds] of [
    ['round-clock', 5],
    ['round-clock-3', 3],
  ]) {
    const s = h.heatSurface(id);
    assert.deepEqual(s.cells.map((c) => c.id), h.roundClockIds(rounds));
    assert.ok(s.cells.every((c) => c.d && c.name && Number.isFinite(c.cx)));
  }
  assert.ok(h.heatSurface('round-clock').backdrop.some((p) => p.text === 'CHAMPIONSHIP ROUNDS'));
  assert.ok(!h.heatSurface('round-clock-3').backdrop.some((p) => p.text === 'CHAMPIONSHIP ROUNDS'));
  assert.deepEqual(h.heatSurface('body').cells.map((c) => c.id), h.BODY_IDS);
  assert.deepEqual(h.heatSurface('body-3').cells.map((c) => c.id), h.BODY_3_IDS);
  assert.deepEqual([...h.BODY_3_IDS, ...h.BODY_IDS], CELL_IDS, "the surfaces' cells, the script's");
  for (const id of ['body', 'body-3']) assert.ok(h.heatSurface(id).overlay.length && h.heatSurface(id).aria);
});

// ---- the maps from the real files

function withFiles(fn) {
  return async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const file = path.join(ROOT, String(url).replace(/^data\//, ''));
      return fs.existsSync(file) ? { ok: true, json: async () => readJson(file) } : { ok: false, json: async () => null };
    };
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
    }
  };
}
const q = (player, position, extra = {}) => ({ player, position, season: 2026, split: 'career', stat: null, side: 'offense', ...extra });
const pereira = { gsisId: '4705658', name: 'Alex Pereira', division: 'HW' };
const makhachev = { gsisId: '3332412', name: 'Islam Makhachev', division: 'WW' };
const miller = { gsisId: '2335718', name: 'Jim Miller', division: 'LW' };

test(
  "the maps: a striker's targets and positions, a grappler's grappling, a long career's last five, each side",
  withFiles(async () => {
    const defs = h.mmaHeatMaps();
    const by = (id) => defs.find((d) => d.id === id);
    assert.deepEqual(defs.map((d) => d.group), ['strikes', 'strikes', 'finishes']);
    const t = await by('targets').load(q(pereira, 'HW'));
    assert.equal(t.surface, 'body');
    assert.equal(t.stat.key, 'acc', 'accuracy first: the efficiency');
    assert.deepEqual(t.cells.map((c) => c.id), h.BODY_IDS);
    const head = t.cells.find((c) => c.id === 'head');
    assert.ok(head.n > 300 && head.made <= head.n && head.league > 0.2 && head.league < 0.6 && head.sd > 0);
    assert.equal(t.chipsTitle, 'Grappling');
    assert.ok(t.chips.some((c) => c.label === 'Knockdowns a 15'));
    const p = await by('positions').load(q(pereira, 'HW'));
    assert.deepEqual(p.cells.map((c) => c.id), h.BODY_3_IDS);
    assert.equal(p.cells.reduce((a, c) => a + c.n, 0), t.cells.reduce((a, c) => a + c.n, 0), 'the nine add up to the three');
    assert.equal((await by('targets').load(q(pereira, 'HW', { stat: 'pm' }))).stat.key, 'pm');
    const d = await by('targets').load(q(pereira, 'HW', { side: 'defense' }));
    assert.ok(d.defense && d.title === 'Strikes Absorbed' && d.chipsTitle === 'Grappling Defense');
    // (a grappler, on his pound-for-pound row: his division's file, takedowns well over its average)
    const g = await by('targets').load(q(makhachev, 'P4P'));
    const td = g.chips.find((c) => c.label === 'Takedowns a 15');
    assert.ok(Number(td.value) > 2 && td.tone > 0, 'Makhachev takes them down');
    // (finishes: a long career's, and its last five with the career behind them)
    const f = await by('finishes').load(q(miller, 'LW'));
    assert.ok(f.surface === 'round-clock' || f.surface === 'round-clock-3');
    assert.equal(f.stat.key, 'all');
    assert.ok(f.cells[0].n > 30, 'dozens of fights going at the opening bell');
    const l5 = await by('finishes').load(q(miller, 'LW', { split: 'last5' }));
    assert.ok(l5.cells[0].n <= 5 && l5.fallback?.length === l5.cells.length && l5.fallbackNote === 'Faded: his career');
    const fd = await by('finishes').load(q(miller, 'LW', { side: 'defense', stat: 'sub' }));
    assert.ok(fd.defense && fd.title === "When He's Finished" && fd.stat.key === 'sub');
    assert.equal(await by('targets').load(q({ gsisId: 'nobody' }, 'LW')), null, 'no row: no map');
    assert.equal(h.divisionOf({ division: 'WSW' }, 'WP4P'), 'WSW');
  }),
);
