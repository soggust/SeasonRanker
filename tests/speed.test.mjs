// The speed work (fewer change detection passes, work done once instead of on every check) changes nothing
// the page shows. The page-wide listeners stay outside Angular until they act; a slider's moves are saved once
// a frame, the latest of them, without losing or reordering a save; and the lookups now kept (a tab's combined
// pairs, a team's ESPN id, a column's width, a column's label, name and cells) give what they gave before and
// follow the sliders, the settings, the list and the tab when those change. A re-rank's rows on screen are
// drawn at once (rows off screen skip being drawn), and let go after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const entry = path.join(import.meta.dirname, 'support/speed-entry.ts');

// (an NgZone that counts its way back in, and a DestroyRef)
const fakeZone = () => ({
  runs: 0,
  outside: 0,
  run(fn) {
    this.runs++;
    return fn();
  },
  runOutsideAngular(fn) {
    this.outside++;
    return fn();
  },
});
const fakeDestroy = () => ({
  hooks: [],
  onDestroy(fn) {
    this.hooks.push(fn);
  },
  destroy() {
    this.hooks.forEach((fn) => fn());
  },
});

test('quietListener: listens outside Angular, back inside only for an event it acts on, gone when destroyed', async () => {
  const { quietListener } = await loadEngine('nfl', { entry });
  const zone = fakeZone();
  const destroy = fakeDestroy();
  const target = new EventTarget();
  let open = false;
  const handled = [];
  quietListener(zone, destroy, target, 'click', () => open, (event) => handled.push(event.type));
  assert.equal(zone.outside, 1, 'added outside Angular');
  target.dispatchEvent(new Event('click'));
  target.dispatchEvent(new Event('click'));
  assert.equal(zone.runs, 0, 'nothing to do: never back in, no change detection');
  assert.deepEqual(handled, []);
  open = true;
  target.dispatchEvent(new Event('click'));
  assert.equal(zone.runs, 1, 'something to do: run inside, as a HostListener would');
  assert.deepEqual(handled, ['click']);
  destroy.destroy();
  target.dispatchEvent(new Event('click'));
  assert.deepEqual(handled, ['click'], 'removed with the component');
});

// (frames run by hand)
function frames() {
  const queue = new Map();
  let next = 1;
  return {
    frame: (run) => (queue.set(next, run), next++),
    cancel: (id) => queue.delete(id),
    tick() {
      const runs = [...queue.values()];
      queue.clear();
      runs.forEach((run) => run());
    },
    get pending() {
      return queue.size;
    },
  };
}

test('SlideSaver: a drag saves once a frame with the latest sliders; other saves neither lost nor reordered', async () => {
  const { SlideSaver } = await loadEngine('nfl', { entry });
  const f = frames();
  const saved = [];
  const saver = new SlideSaver((position, weights) => saved.push([position, { ...weights }]), f.frame, f.cancel);

  // (a drag: the slider writes into the tab's sliders, many moves before a frame)
  const qb = { passYards: 50 };
  for (const v of [55, 60, 65, 70]) {
    qb.passYards = v;
    saver.slid('QB', qb);
  }
  assert.deepEqual(saved, [], 'nothing re-ranked mid-frame');
  assert.equal(f.pending, 1, 'one save waiting');
  f.tick();
  assert.deepEqual(saved, [['QB', { passYards: 70 }]], 'the frame saves the latest');
  f.tick();
  assert.equal(saved.length, 1, 'and only once');

  // (a preset on the same tab before the frame: it takes the waiting save's place)
  qb.passYards = 75;
  saver.slid('QB', qb);
  saver.saving('QB');
  f.tick();
  assert.equal(saved.length, 1, 'the preset is the save');

  // (another tab's save, or a move on another tab: the waiting one goes first)
  saver.slid('QB', qb);
  saver.saving('WR');
  assert.deepEqual(saved.at(-1), ['QB', { passYards: 75 }]);
  const wr = { recYards: 40 };
  saver.slid('QB', qb);
  saver.slid('WR', wr);
  assert.deepEqual(saved.at(-1), ['QB', { passYards: 75 }]);
  assert.equal(saved.length, 3);
  // (the menu going away: the waiting save made at once)
  saver.flush();
  assert.deepEqual(saved.at(-1), ['WR', { recYards: 40 }]);
  f.tick();
  assert.equal(saved.length, 4, 'not twice');
});

test("a tab's combined pairs, a team's ESPN id and a column's width: kept, and the same as worked out fresh", async () => {
  const { combinedFor, SPORT, POSITIONS, findEspnTeamId, espnTeamId, columnWidth } = await loadEngine('nfl', { entry });
  for (const position of POSITIONS) {
    const pairs = combinedFor(position);
    assert.equal(combinedFor(position), pairs, `${position}: the same list each time`);
    assert.deepEqual(
      pairs.map((p) => p.stat.key),
      SPORT.combined.stats(position).map((p) => p.stat.key),
    );
  }
  assert.ok(combinedFor('QB').length > 0);

  const bills = findEspnTeamId('football/nfl', ['Buffalo Bills']);
  assert.ok(bills);
  assert.equal(findEspnTeamId('football/nfl', ['Buffalo Bills']), bills, 'asked again');
  assert.equal(findEspnTeamId('football/nfl', [undefined, 'Buffalo Bills']), bills, 'a missing name passed over');
  assert.notEqual(findEspnTeamId('football/nfl', ['Miami Dolphins']), bills);
  assert.equal(findEspnTeamId('football/nfl', ['Nobody At All']), null);
  assert.equal(findEspnTeamId('football/nfl', ['Nobody At All']), null, 'a miss kept as a miss');
  assert.throws(() => espnTeamId('football/nfl', ['Nobody At All']));

  assert.equal(columnWidth('passYards'), 'var(--lw-passYards)');
  assert.equal(columnWidth('passYards'), columnWidth('passYards'));
  assert.equal(columnWidth('k/9 rate'), 'var(--lw-k_9_rate)');
});

// The table's reader as the grid has it (its source read through, the sliders and settings swapped for new
// objects as the position service does), and its tab's ranker
function table(engine, position) {
  const { TabRanker, StatReader, SKILL_STATS, SKILL_UNITS, skillGroups, presetWeights, emptyIn, CURRENT_SEASON, DEFAULT_SETTINGS } = engine;
  const state = { position, settings: { ...DEFAULT_SETTINGS }, weights: presetWeights(position, 'default') };
  const tab = () => ({ position: state.position, stats: SKILL_STATS[state.position], groups: skillGroups(state.position), hidden: {}, weights: state.weights });
  const positions = {
    get settings() {
      return state.settings;
    },
    statHiddenState: {},
    skillHiddenGroups: () => ({}),
    getWeights: (p) => presetWeights(p, 'default'),
    isStatHidden: () => false,
    orderedGroups: (p, groups) => groups,
    orderedStats: (p, group) => group.stats,
  };
  const ranker = new TabRanker(positions, { firstSeasons: async () => ({}) }, tab, () => {});
  const source = {
    get position() {
      return state.position;
    },
    get settings() {
      return state.settings;
    },
    rows: SKILL_UNITS,
    list: [],
    tableSeason: true,
    season: CURRENT_SEASON,
    get weights() {
      return ranker.mixWeights(state.position);
    },
    empty: (key) => emptyIn(SKILL_UNITS[state.position] ?? [], key),
  };
  const reader = new StatReader(source);
  const listed = () => ranker.listed(SKILL_UNITS, CURRENT_SEASON, state.position);
  const rank = () => (source.list = ranker.ranked(reader, listed(), state.position, SKILL_UNITS));
  // (the same tab ranked by a reader made fresh: nothing kept)
  const fresh = () => {
    const own = new StatReader({
      position: state.position,
      settings: state.settings,
      rows: SKILL_UNITS,
      list: [],
      tableSeason: true,
      season: CURRENT_SEASON,
      weights: ranker.mixWeights(state.position),
      empty: source.empty,
    });
    return ranker.ranked(own, listed(), state.position, SKILL_UNITS);
  };
  return { state, reader, rank, fresh };
}

const ids = (rows) => rows.map((r) => r.gsisId);

test('the ranking still follows the sliders: what the reader keeps is let go when they move', async () => {
  const engine = await loadEngine('nfl', { entry });
  const t = table(engine, 'QB');
  const before = ids(t.rank());
  assert.deepEqual(before, ids(t.fresh()));
  // (every slider at 0 but one: the list goes by that one stat, as a fresh reader has it)
  t.state.weights = Object.fromEntries(Object.keys(t.state.weights).map((k) => [k, k === 'ints' ? 100 : 0]));
  const after = ids(t.rank());
  assert.notDeepEqual(after, before, 'the list moved');
  assert.deepEqual(after, ids(t.fresh()), 'as a fresh reader ranks it');
  // (and back)
  t.state.weights = engine.presetWeights('QB', 'default');
  assert.deepEqual(ids(t.rank()), before);
});

test("a column's label, name and cells follow the settings, the list and the tab", async () => {
  const engine = await loadEngine('nfl', { entry });
  const t = table(engine, 'WR');
  const top = t.rank()[0];
  const yards = engine.SKILL_STATS.WR.find((s) => s.key === 'recYards');
  const season = { label: t.reader.label(yards), name: t.reader.name(yards), cell: t.reader.cellText(top, yards) };

  // (per game: a per-game label, name and value)
  t.state.settings = { ...t.state.settings, statBasis: 'perGame' };
  assert.notEqual(t.reader.label(yards), season.label);
  assert.notEqual(t.reader.name(yards), season.name);
  assert.equal(t.reader.cellText(top, yards), (top.stats.recYards / top.games).toFixed(engine.SPORT.perGameDecimals));

  // (Show Ranks: the cell its place)
  t.state.settings = { ...t.state.settings, statBasis: 'season', showRanks: true };
  assert.equal(t.reader.label(yards), season.label);
  assert.match(t.reader.cellText(top, yards), /^#\d+$/);
  t.state.settings = { ...t.state.settings, showRanks: false };
  assert.equal(t.reader.cellText(top, yards), season.cell);

  // (another tab: its own labels, worked out again)
  t.state.position = 'QB';
  t.rank();
  const passYards = engine.SKILL_STATS.QB.find((s) => s.key === 'passYards');
  assert.equal(t.reader.label(passYards), passYards.label);
});

test('rowsInView: the rows on screen at a scroll, a row either side more, and the top screenful', async () => {
  const { rowsInView } = await loadEngine('nfl', { entry });
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  // (300px on screen, 44px rows under a 42px header: 7 rows and a part on screen)
  const view = { top: 0, height: 300, first: 42, row: 44 };
  assert.deepEqual(rowsInView(view, 50), range(0, 10));
  assert.deepEqual(rowsInView({ ...view, top: 1000 }, 50), [...range(0, 8), ...range(20, 30)]);
  assert.deepEqual(rowsInView({ ...view, top: 2000 }, 48), [...range(0, 8), ...range(43, 48)], 'never past the last row');
  assert.deepEqual(rowsInView(view, 5), range(0, 5));
  assert.deepEqual(rowsInView({ ...view, row: 0 }, 50), [], 'nothing laid out yet');
});

test("drawRowsInView: a re-rank's rows on screen drawn at once and let go two frames on; the scroll read only when scrolled down", async () => {
  const { drawRowsInView, rowsInView } = await loadEngine('nfl', { entry });
  const style = () => ({
    props: {},
    setProperty(k, v) {
      this.props[k] = v;
    },
    removeProperty(k) {
      delete this.props[k];
    },
  });
  // (a list of 44px rows under a 42px header, 300px of it on screen; its scroll counted as it's read)
  let rows = Array.from({ length: 50 }, (_, i) => ({ id: i, offsetTop: 42 + i * 44, offsetHeight: 44, style: style() }));
  const listeners = new Map();
  let scroll = 0;
  let reads = 0;
  const list = {
    get scrollTop() {
      reads++;
      return scroll;
    },
    clientHeight: 300,
    querySelector: () => rows[0] ?? null,
    querySelectorAll: () => rows,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const observers = [];
  const real = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(run) {
      this.run = run;
      this.on = false;
      observers.push(this);
    }
    observe() {
      this.on = true;
    }
    disconnect() {
      this.on = false;
    }
  };
  try {
    const f = frames();
    const stop = drawRowsInView(list, f.frame, f.cancel);
    const move = () => observers[0].run();
    const drawn = () => rows.filter((r) => r.style.props['content-visibility'] === 'visible').map((r) => r.id);
    const view = { top: 0, height: 300, first: 42, row: 44 };

    // (before the list is first seen, nothing held)
    move();
    assert.deepEqual(drawn(), []);
    f.tick();

    // (a re-rank at the top: the rows on screen and the top screenful, the scroll not read as the rows move)
    reads = 0;
    move();
    assert.deepEqual(drawn(), rowsInView(view, 50));
    assert.equal(reads, 0, 'at the top, nothing laid out early');
    f.tick();
    assert.notDeepEqual(drawn(), [], 'still held a frame on');
    f.tick();
    assert.deepEqual(drawn(), [], 'let go two frames on');

    // (scrolled down: the scroll read as the rows move, where the browser has taken it)
    scroll = 1000;
    listeners.get('scroll')();
    scroll = 712;
    reads = 0;
    move();
    assert.equal(reads, 1);
    assert.deepEqual(drawn(), rowsInView({ ...view, top: 712 }, 50));
    f.tick();
    f.tick();
    assert.deepEqual(drawn(), []);

    // (a slider dragged: the rows reorder every frame; those at the places held now held, the rest let go)
    scroll = 0;
    listeners.get('scroll')();
    move();
    const places = rowsInView(view, 50);
    for (let k = 0; k < 3; k++) {
      rows = [...rows.slice(25), ...rows.slice(0, 25)];
      move();
      assert.deepEqual(drawn().sort((a, b) => a - b), places.map((i) => rows[i].id).sort((a, b) => a - b));
      f.tick();
    }
    f.tick();
    assert.deepEqual(drawn(), [], 'let go two frames after the last move');

    // (gone with the list: nothing held, nothing waiting, nothing listening)
    move();
    stop();
    assert.deepEqual(drawn(), []);
    assert.equal(f.pending, 0);
    assert.equal(observers[0].on, false);
    assert.equal(listeners.size, 0);
  } finally {
    globalThis.MutationObserver = real;
  }
});
