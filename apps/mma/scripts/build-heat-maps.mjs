// The card's Heat Maps for MMA (apps/mma/src/sport/heat-maps.ts reads them): when a fighter's fights end, round
// by minute, and where his strikes land and he's struck, by target and position, with his grappling. Binned
// here, never a fight's raw numbers shipped beyond what the card shows.
//
// - Finishes: every fight in the archive (scripts/fights: every promotion ESPN covers), each a two-letter code
//   from the fighter's side, newest first (finishCode): how it ended (K a win by KO/TKO, S by submission, F by
//   another stoppage; k, s, f the same against him; n an early stop with no winner; W, L, D at the final bell)
//   and where (an early stop's cell, the round's minute: 0-9a-o, the first round's first minute to the fifth's
//   last; a decision's scheduled rounds, 1-5). x: a format the grid can't hold (PRIDE's ten-minute first round,
//   the UFC's early no-rounds bouts). The division's base rates beside them: each cell's fighters still going at
//   its start, and the finishes in it, by method (divisionClock)
// - Strikes (scripts/strikes.mjs: ESPN's core API, the UFC's bouts): a fighter's sums over his bouts where both
//   sides' numbers are in, his whole career and his last five: bouts, seconds fought, seconds where control
//   time was kept, then his 25 (STRIKE_FIELDS: landed and attempted by position and target, knockdowns,
//   takedowns, control, advances, submission attempts, reversals) and his opponents' 25 (what he absorbed).
//   The division's sums beside them, and the spreads among its fighters for each cell's rate and each grappling
//   rate (the maps' and the numbers' tint)
//
// Files (StaticData, served at data/): heat-maps.json (the fields and each division's base rates) and
// heat-maps.<division>.json, one per division (heat-maps.lw.json...: the fighters with a row naming it, a
// pound-for-pound row's too; each a few dozen KB to ~120).
//
// Usage: node apps/mma/scripts/build-heat-maps.mjs [--no-fetch]  (after npm run mma:update-data; the nightly
// workflow runs it, a failure keeps yesterday's files)
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { keptFights, methodCode } from './fights.mjs';
import { tabOf, weightOf } from './rating.mjs';
import { POSITIONS, STRIKE_FIELDS, TARGETS, keptStrikes, updateStrikes } from './strikes.mjs';
import { expandRows } from '../../../libs/ranker/scripts/shared-rows.mjs';

const STATIC = path.join(import.meta.dirname, '..', 'src', 'StaticData');
export const ROUND = 300;
export const MINUTES = 5;
export const CELLS = 25;
// (a cell's code: its index in base 36, 0-9 then a-o)
const cellChar = (i) => i.toString(36);
export const DIVISIONS = ['HW', 'LHW', 'MW', 'WW', 'LW', 'FW', 'BW', 'FLW', 'WBW', 'WFLW', 'WSW'];
const DECISION = /^(UD|SD|MD|DEC|DRAW)$/;

// ---- finishes

// A fight's code from one fighter's side (see the top), or null when he isn't in it
export function finishCode(fight, id) {
  const me = fight.fighters.find((f) => f.id === id);
  const opp = fight.fighters.find((f) => f.id !== id);
  if (!me || !opp) return null;
  const { rounds, period, clock } = fight;
  const method = methodCode(fight.method);
  if (!(rounds >= 1 && rounds <= 5) || !(period >= 1 && period <= rounds) || !(clock >= 0 && clock <= ROUND)) return 'xx';
  const distance = DECISION.test(method) || (period >= rounds && clock >= ROUND);
  if (distance) return `${me.winner ? 'W' : opp.winner ? 'L' : 'D'}${rounds}`;
  const cell = (period - 1) * MINUTES + Math.min(MINUTES - 1, Math.floor(clock / 60));
  const kind = method === 'KO' ? 'k' : method === 'SUB' ? 's' : 'f';
  const how = me.winner ? kind.toUpperCase() : opp.winner ? kind : 'n';
  return how + cellChar(cell);
}

// A code read back: how it ended, the cell (an early stop's) and the rounds (a decision's)
export function readCode(code) {
  const [how, at] = code;
  if (how === 'x') return null;
  if ('WLD'.includes(how)) return { how, cell: null, rounds: Number(at) };
  return { how, cell: parseInt(at, 36), rounds: null };
}

// A fight's cells: those it was still going at the start of (an early stop's up to its own; a decision's every
// one of its rounds), and the one it ended in (none at the final bell)
export function exposure(code) {
  const c = readCode(code);
  if (!c) return { through: -1, ended: null };
  return c.cell === null ? { through: c.rounds * MINUTES - 1, ended: null } : { through: c.cell, ended: c.cell };
}

// Each division's base rates: per cell, the sides still going at its start (two a fight) and the finishes in
// it (by KO/TKO, by submission, any), and the division's finish counts (finishes, of the fights with a winner;
// first-round ones; the fights in all)
export function divisionClock(fights) {
  const out = {};
  for (const f of fights) {
    const tab = tabOf(weightOf(f).lbs, weightOf(f).women);
    if (!DIVISIONS.includes(tab) || f.fighters.length !== 2) continue;
    const d = (out[tab] ??= { n: Array(CELLS).fill(0), all: Array(CELLS).fill(0), ko: Array(CELLS).fill(0), sub: Array(CELLS).fill(0), fights: 0, decisive: 0, finishes: 0, r1: 0 });
    const code = finishCode(f, f.fighters[0].id);
    const c = readCode(code ?? 'xx');
    if (!c) continue;
    d.fights++;
    const { through, ended } = exposure(code);
    for (let i = 0; i <= through; i++) d.n[i] += 2;
    const won = f.fighters.some((x) => x.winner);
    if (won) d.decisive++;
    if (ended !== null && won) {
      d.all[ended]++;
      if (/k/i.test(c.how)) d.ko[ended]++;
      if (/s/i.test(c.how)) d.sub[ended]++;
      d.finishes++;
      if (ended < MINUTES) d.r1++;
    }
  }
  return out;
}

// ---- strikes

// A side's numbers added into a sum
const addInto = (sum, row, at = 0) => {
  for (let i = 0; i < row.length; i++) sum[at + i] += row[i];
};
// (the sum's layout: bouts, seconds, seconds with control kept, his STRIKE_FIELDS, his opponents')
export const SUM_FIELDS = ['n', 'secs', 'ctrlSecs', ...STRIKE_FIELDS.map((f) => `o:${f}`), ...STRIKE_FIELDS.map((f) => `d:${f}`)];
const CTRL = STRIKE_FIELDS.indexOf('ctrl');
export const fightSeconds = (f) => ((f.period ?? 1) - 1) * ROUND + Math.max(0, f.clock ?? ROUND);

// A fighter's strike sums over bouts (newest first, each { fight, mine, theirs }): the whole list's, and the
// first five's (null when that's all of them)
export function strikeSums(bouts) {
  const sum = (list) => {
    const s = Array(SUM_FIELDS.length).fill(0);
    for (const { fight, mine, theirs } of list) {
      const secs = fightSeconds(fight);
      s[0]++;
      s[1] += secs;
      // (control time kept: ESPN has it for a bout when either side has any)
      if (mine[CTRL] || theirs[CTRL]) s[2] += secs;
      addInto(s, mine, 3);
      addInto(s, theirs, 3 + STRIKE_FIELDS.length);
    }
    return s;
  };
  if (!bouts.length) return null;
  return { career: sum(bouts), last: bouts.length > 5 ? sum(bouts.slice(0, 5)) : null };
}

// The spread of a rate across a division's fighters with enough of a sample (null: too few to say)
function spread(values) {
  if (values.length < 5) return null;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  return Math.round(sd * 10000) / 10000 || null;
}

// The map cells' ids: the nine (a position's target), then the three targets across the positions
export const CELL_IDS = [...POSITIONS.flatMap((p) => TARGETS.map((t) => `${p}-${t}`)), ...TARGETS];
const fieldsOf = (id) => (id.includes('-') ? [id] : POSITIONS.map((p) => `${p}-${id}`));

// The rates the maps and the numbers tint by, from a sum: each cell's accuracy, landed a minute and share of
// the landed (his, then his opponents'), and the grappling rates (a 15 minutes; takedown accuracy; the share
// of the time in control)
export function rates(s) {
  const at = (name) => s[SUM_FIELDS.indexOf(name)];
  const mins = s[1] / 60;
  const ctrlMins = s[2] / 60;
  const side = (p) => {
    const landed = (id) => fieldsOf(id).reduce((a, f) => a + at(`${p}:${f}`), 0);
    const thrown = (id) => fieldsOf(id).reduce((a, f) => a + at(`${p}:${f}-att`), 0);
    const total = TARGETS.reduce((a, t) => a + landed(t), 0);
    return {
      acc: CELL_IDS.map((id) => (thrown(id) >= 15 ? landed(id) / thrown(id) : null)),
      pm: CELL_IDS.map((id) => (mins >= 15 ? landed(id) / mins : null)),
      share: CELL_IDS.map((id) => (total >= 50 ? landed(id) / total : null)),
    };
  };
  const per15 = (v) => (mins >= 15 ? (v / mins) * 15 : null);
  const g = (p) => ({
    td15: per15(at(`${p}:tdl`)),
    tdAcc: at(`${p}:tda`) >= 5 ? at(`${p}:tdl`) / at(`${p}:tda`) : null,
    ctrl: ctrlMins >= 15 ? at(`${p}:ctrl`) / 60 / ctrlMins : null,
    adv15: per15(at(`${p}:adv`)),
    sub15: per15(at(`${p}:sub`)),
    kd15: per15(at(`${p}:kd`)),
  });
  return { o: side('o'), d: side('d'), go: g('o'), gd: g('d') };
}

// Each division's strike sums (every fighter's bouts in it, so its landed are its absorbed) and its spreads
export function divisionStrikes(bouts) {
  // (a fighter's sum in each division he's fought in)
  const byFighter = new Map();
  for (const b of bouts) {
    const key = `${b.tab}/${b.id}`;
    if (!byFighter.has(key)) byFighter.set(key, { tab: b.tab, list: [] });
    byFighter.get(key).list.push(b);
  }
  const out = {};
  for (const { tab, list } of byFighter.values()) {
    const s = strikeSums(list).career;
    const d = (out[tab] ??= { sum: Array(SUM_FIELDS.length).fill(0), rates: [] });
    addInto(d.sum, s);
    d.rates.push(rates(s));
  }
  const round4 = (v) => (v === null ? null : Math.round(v * 10000) / 10000);
  return Object.fromEntries(
    Object.entries(out).map(([tab, { sum, rates: list }]) => {
      const cells = (side, key) => CELL_IDS.map((_, i) => spread(list.map((r) => r[side][key][i]).filter((v) => v !== null)));
      const grap = (side) => Object.fromEntries(Object.keys(list[0][side]).map((k) => [k, spread(list.map((r) => r[side][k]).filter((v) => v !== null))]));
      return [
        tab,
        {
          sum,
          sd: { acc: cells('o', 'acc'), pm: cells('o', 'pm'), share: cells('o', 'share'), dacc: cells('d', 'acc'), dpm: cells('d', 'pm'), dshare: cells('d', 'share'), go: grap('go'), gd: grap('gd') },
          avg: { go: Object.fromEntries(Object.entries(rates(sum).go).map(([k, v]) => [k, round4(v)])) },
        },
      ];
    }),
  );
}

// ---- the files

// A row's divisions: the ones its rows name (a division tab's own; a pound-for-pound row's, its division)
export function rowDivisions(tabs) {
  const out = new Map();
  for (const [tab, rows] of Object.entries(tabs)) {
    for (const row of rows) {
      const division = DIVISIONS.includes(tab) ? tab : row.division;
      if (!DIVISIONS.includes(division)) continue;
      if (!out.has(row.gsisId)) out.set(row.gsisId, new Set());
      out.get(row.gsisId).add(division);
    }
  }
  return out;
}

export const fileName = (division) => `heat-maps.${division.toLowerCase()}.json`;

// Everything, from the fights, the strikes kept and the site's rows: { main, divisions: { LW: file, ... } }
export function buildFiles(fights, strikes, tabs) {
  const byFighter = new Map();
  for (const f of fights) for (const x of f.fighters) (byFighter.get(x.id) ?? byFighter.set(x.id, []).get(x.id)).push(f);
  for (const list of byFighter.values()) list.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  // (every UFC bout with both sides' numbers, from each side, in its division)
  const sided = [];
  const boutsOf = new Map();
  for (const f of fights) {
    const s = strikes.get(f.id);
    if (!s || f.fighters.length !== 2) continue;
    const [a, b] = f.fighters;
    if (!s[a.id] || !s[b.id]) continue;
    const tab = tabOf(weightOf(f).lbs, weightOf(f).women);
    for (const [me, opp] of [
      [a, b],
      [b, a],
    ]) {
      const bout = { id: me.id, tab, fight: f, mine: s[me.id], theirs: s[opp.id] };
      if (DIVISIONS.includes(tab)) sided.push(bout);
      (boutsOf.get(me.id) ?? boutsOf.set(me.id, []).get(me.id)).push(bout);
    }
  }
  for (const list of boutsOf.values()) list.sort((x, y) => y.fight.date.localeCompare(x.fight.date) || y.fight.id.localeCompare(x.fight.id));

  const clock = divisionClock(fights);
  const strikeBase = divisionStrikes(sided);
  const main = {
    fields: { sum: SUM_FIELDS, cells: CELL_IDS },
    divisions: Object.fromEntries(DIVISIONS.filter((d) => clock[d] || strikeBase[d]).map((d) => [d, { clock: clock[d] ?? null, strikes: strikeBase[d] ?? null }])),
  };
  const files = Object.fromEntries(DIVISIONS.map((d) => [d, { division: d, fighters: {} }]));
  for (const [id, divisions] of rowDivisions(tabs)) {
    const list = byFighter.get(id) ?? [];
    const sums = strikeSums(boutsOf.get(id) ?? []);
    const entry = {
      f: list.map((f) => finishCode(f, id) ?? 'xx').join(''),
      ...(sums ? { c: sums.career, ...(sums.last ? { l: sums.last } : {}) } : {}),
    };
    for (const d of divisions) files[d].fighters[id] = entry;
  }
  return { main, divisions: files };
}

// Run on its own (the nightly workflow): the strikes fetched (unless --no-fetch), then the files written
if (process.argv[1]?.endsWith('build-heat-maps.mjs')) {
  if (!process.argv.includes('--no-fetch')) {
    const { asked, found } = await updateStrikes();
    console.log(`strikes: ${asked} sides asked, ${found} with numbers`);
  }
  const fights = await keptFights();
  const strikes = await keptStrikes();
  const tabs = expandRows(JSON.parse(await readFile(path.join(STATIC, 'skill-players.json'), 'utf8')));
  const { main, divisions } = buildFiles(fights, strikes, tabs);
  await writeFile(path.join(STATIC, 'heat-maps.json'), JSON.stringify(main));
  // (a division with no one listed: its file taken away)
  const old = (await readdir(STATIC)).filter((f) => /^heat-maps\.[a-z]+\.json$/.test(f));
  for (const f of old) if (!Object.values(divisions).some((d) => Object.keys(d.fighters).length && fileName(d.division) === f)) await unlink(path.join(STATIC, f));
  for (const d of Object.values(divisions)) {
    if (!Object.keys(d.fighters).length) continue;
    await writeFile(path.join(STATIC, fileName(d.division)), JSON.stringify(d));
  }
  const kb = async (f) => Math.round(Buffer.byteLength(await readFile(path.join(STATIC, f))) / 1024);
  console.log(`heat-maps.json ${await kb('heat-maps.json')} KB; ${(await Promise.all(Object.values(divisions).filter((d) => Object.keys(d.fighters).length).map(async (d) => `${d.division} ${Object.keys(d.fighters).length} (${await kb(fileName(d.division))} KB)`))).join(', ')}`);
}
