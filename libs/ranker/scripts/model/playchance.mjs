// A questionable player's chance of playing (the NFL's), from the injury reports of the seasons before this
// one: nflverse's weekly reports (each player's final status for the game, Questionable, and his last
// practice's participation: did not, limited, full) against who took the field (nflverse's snap counts: any
// offensive, defensive or special-teams snap), the skill positions' alone (QB, RB, FB, WR, TE: the ones whose
// absence the props read). Before it, every questionable player counted as missing at half (props.mjs
// missOf(0.5): the vacated work, the next man up, rb1Out and qb1Out); a questionable one plays about two times
// in three (2016-2025: 67%), a quarterback about half the time, one who missed his team's last game less often.
//
//   the table   the share who played, by what's known before the game, each level pulled toward the one above
//               it by PLAY_K made-up reports (a cell with few reads like its parent): the questionable players
//               all, then by the levels kept, in this order: gone (his team's games he's missed in a row this
//               season before it: 0, 1, 2 or more, or new: not yet played for the team this season), qb (a
//               quarterback or not: the other positions alike once his games missed are in) and practice (his
//               last practice before the report: DNP, LP, FP)
//   the levels  chosen on held-out seasons: each of the last PLAY_HELD prior seasons predicted from the ones
//               before it alone (the table fit as it would have been then), their log loss pooled; a level is
//               added (in the order above, each tried after the ones kept) only where it saves PLAY_FLOOR a
//               report or more over the table without it, and no group's held-out bias (the chance less the
//               share who played: each position's, and each of the level's own cells', PLAY_SUB_N reports or
//               more) grows by more than PLAY_TOL: the late terms' gate (project.mjs), its rows' groups. The
//               table used tonight is then fit on every prior season with the levels kept (no game of this
//               season: no look-ahead). The flat half it replaces is the check's baseline, beside it
//   live        ESPN's status (questionable, day-to-day, game-time: timing.mjs Q_STATUS) and position, and his
//               games missed from the model's own work history (matchups.mjs goneOf); a level whose input isn't
//               known tonight reads the level above: practice, as ESPN's report doesn't carry it (nflverse's
//               current season's posts a week's reports after its games), is read at his games missed and
//               position. No table (the files unread, too few reports): every questionable player at half, as
//               before
//
// The NBA and NHL: no history of ESPN's statuses is kept (the box score says who played, not who was listed
// day-to-day before), so their questionable players stay at half.

import { nflverseRows } from './sources.mjs';

// (made-up games a cell's share is pulled toward its parent's by; the log-loss saving a level must make, a
// report (natural log); the held-out seasons; the fewest questionable reports a table is built from)
export const PLAY_K = 25;
export const PLAY_FLOOR = 0.003;
export const PLAY_HELD = 3;
export const PLAY_MIN = 1000;
export const PLAY_LEVELS = ['gone', 'qb', 'practice'];

// (his position's group: QB, RB (a fullback too), WR, TE, the rest one)
export const playPos = (pos) => {
  const p = String(pos ?? '').toUpperCase();
  return p === 'QB' ? 'QB' : p === 'RB' || p === 'FB' || p === 'HB' ? 'RB' : p === 'WR' ? 'WR' : p === 'TE' ? 'TE' : 'oth';
};
// (his last practice's participation, nflverse's words: DNP, LP, FP, or null)
export const playPractice = (s) => (/did not/i.test(s ?? '') ? 'DNP' : /limited/i.test(s ?? '') ? 'LP' : /full/i.test(s ?? '') ? 'FP' : null);
// (his team's games missed in a row: 0, 1, 2+, or new (null: not yet played for it this season))
export const playGone = (g) => (g === null || g === undefined || !Number.isFinite(Number(g)) ? 'new' : Number(g) <= 0 ? '0' : Number(g) === 1 ? '1' : '2+');

// (a row's value at a level: null where it isn't known)
const valueOf = (x, level) => (level === 'gone' ? playGone(x.gone) : level === 'qb' ? (playPos(x.pos) === 'QB' ? 'QB' : 'other') : level === 'practice' ? (x.practice ?? null) : null);

// The table from reports ({ gone, pos, practice, played: 0 or 1 }) at the levels given: chance(x), each level
// whose value isn't known for x (null) and the ones after it read at the level above
export function fitPlayTable(rows, levels = [], k = PLAY_K) {
  const cells = new Map();
  const add = (key, y) => {
    const c = cells.get(key) ?? [0, 0];
    c[0]++;
    c[1] += y;
    cells.set(key, c);
  };
  for (const x of rows) {
    const y = x.played ? 1 : 0;
    let key = 'Q';
    add(key, y);
    for (const l of levels) {
      const v = valueOf(x, l);
      if (v === null) break;
      key += `|${l}=${v}`;
      add(key, y);
    }
  }
  const root = cells.get('Q');
  if (!root?.[0]) return null;
  const chance = (x) => {
    let key = 'Q';
    let p = root[1] / root[0];
    for (const l of levels) {
      const v = valueOf(x, l);
      if (v === null) break;
      key += `|${l}=${v}`;
      const c = cells.get(key);
      if (!c) break;
      p = (c[1] + k * p) / (c[0] + k);
    }
    return Math.min(0.99, Math.max(0.01, p));
  };
  return { chance, levels: [...levels], n: root[0], rate: root[1] / root[0] };
}

// (log loss a report, and the bias (the chance less the share who played) of each group (by: a row's groups),
// a group's rows counted beside it, of a table on rows)
function scoreOf(chance, rows, by = (x) => [playPos(x.pos)]) {
  let loss = 0;
  const groups = new Map();
  for (const x of rows) {
    const p = chance(x);
    const y = x.played ? 1 : 0;
    loss -= y ? Math.log(p) : Math.log(1 - p);
    for (const g of by(x)) {
      const b = groups.get(g) ?? [0, 0];
      b[0]++;
      b[1] += p - y;
      groups.set(g, b);
    }
  }
  return { n: rows.length, loss: rows.length ? loss / rows.length : 0, bias: Object.fromEntries([...groups].map(([g, [n, s]]) => [g, { n, bias: n ? s / n : 0 }])) };
}

// The held-out check of the levels given: each held-out season predicted from the seasons before it alone,
// pooled (the flat half's log loss is ln 2 a report); its groups the positions' and the cells of the level
// tried (sub)
function heldOf(rows, levels, held, k, sub = null) {
  const scored = [];
  for (const s of held) {
    const t = fitPlayTable(rows.filter((x) => x.season < s), levels, k);
    if (!t) return null;
    for (const x of rows.filter((r) => r.season === s)) scored.push({ ...x, p: t.chance(x) });
  }
  const by = (x) => [playPos(x.pos), ...(sub && valueOf(x, sub) !== null ? [`${sub}=${valueOf(x, sub)}`] : [])];
  return scoreOf((x) => x.p, scored, by);
}

// The levels kept (forward, in PLAY_LEVELS' order, on the held-out seasons: each on the floor and its groups'
// bias), and the table fit on every row with them; null with too few reports. A level's groups (PLAY_SUB_N
// held-out reports or more each) are the positions and the level's own cells (gone 1, a quarterback, a
// practice missed): none's held-out bias (the chance less the share who played) larger than without the level
// by more than PLAY_TOL, a cell's noise at a few hundred reports
export const PLAY_SUB_N = 100;
export const PLAY_TOL = 0.02;
export function choosePlayTable(rows, { k = PLAY_K, floor = PLAY_FLOOR, heldN = PLAY_HELD, min = PLAY_MIN } = {}) {
  if (rows.length < min) return null;
  const seasons = [...new Set(rows.map((x) => x.season))].sort((a, b) => a - b);
  // (held-out seasons need one before them to be fit on)
  const held = seasons.slice(1).slice(-heldN);
  if (!held.length) return null;
  let levels = [];
  let best = heldOf(rows, levels, held, k);
  if (!best) return null;
  const tried = [];
  for (const l of PLAY_LEVELS) {
    const before = heldOf(rows, levels, held, k, l);
    const next = heldOf(rows, [...levels, l], held, k, l);
    if (!before || !next) continue;
    const gain = before.loss - next.loss;
    const worse = Object.keys(next.bias).filter((g) => next.bias[g].n >= PLAY_SUB_N && Math.abs(next.bias[g].bias) > Math.abs(before.bias[g]?.bias ?? 0) + PLAY_TOL);
    const kept = gain >= floor && !worse.length;
    const r4 = (x) => Math.round(x * 1e4) / 1e4;
    tried.push({ level: l, gain: r4(gain), kept, bias: Object.fromEntries(Object.keys(next.bias).map((g) => [g, [r4(before.bias[g]?.bias ?? 0), r4(next.bias[g].bias), next.bias[g].n]])), ...(worse.length ? { worse } : {}) });
    if (kept) (levels = [...levels, l]), (best = next);
  }
  const table = fitPlayTable(rows, levels, k);
  if (!table) return null;
  const round4 = (x) => Math.round(x * 1e4) / 1e4;
  return {
    ...table,
    check: { held, n: best.n, loss: round4(best.loss), flat: round4(Math.LN2), bias: Object.fromEntries(Object.entries(best.bias).map(([g, b]) => [g, round4(b.bias)])), tried },
  };
}

// The NFL's reports of the seasons from..current-1 as rows ({ season, gone, pos, practice, played }): a final
// status of Questionable for a game his team played (its snap counts read), played if he took a snap in it
export async function nflPlayRows(from, current) {
  const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'pfr_id'], 24 * 7);
  if (!players?.length) return null;
  const pfrOf = new Map(players.filter((p) => p.pfr_id && p.pfr_id !== 'NA').map((p) => [p.gsis_id, p.pfr_id]));
  const out = [];
  for (let season = from; season < current; season++) {
    const snaps = await nflverseRows('snap_counts', `snap_counts_${season}.csv.gz`, ['week', 'pfr_player_id', 'team', 'offense_snaps', 'defense_snaps', 'st_snaps'], 24 * 365).catch(() => null);
    let inj = null;
    for (const f of [`injuries_${season}.csv.gz`, `injuries_${season}.csv`]) if (!inj?.length) inj = await nflverseRows('injuries', f, ['week', 'gsis_id', 'team', 'position', 'report_status', 'practice_status'], 24 * 365).catch(() => null);
    if (!snaps?.length || !inj?.length) continue;
    const played = new Set();
    const teamWeeks = new Map();
    for (const r of snaps) {
      const w = Number(r.week);
      if (!teamWeeks.has(r.team)) teamWeeks.set(r.team, new Set());
      teamWeeks.get(r.team).add(w);
      if ((Number(r.offense_snaps) || 0) + (Number(r.defense_snaps) || 0) + (Number(r.st_snaps) || 0) > 0) played.add(`${w}|${r.pfr_player_id}`);
    }
    const weeksOf = new Map([...teamWeeks].map(([t, s]) => [t, [...s].sort((a, b) => a - b)]));
    for (const x of inj) {
      if (!/^questionable$/i.test(x.report_status ?? '') || playPos(x.position) === 'oth') continue;
      const id = pfrOf.get(x.gsis_id);
      const w = Number(x.week);
      const weeks = weeksOf.get(x.team);
      if (!id || !weeks?.includes(w)) continue;
      // (his team's games before it this season he missed in a row; null where he took no snap in any)
      const before = weeks.filter((v) => v < w).reverse();
      const at = before.findIndex((v) => played.has(`${v}|${id}`));
      out.push({ season, gone: at < 0 ? null : at, pos: x.position, practice: playPractice(x.practice_status), played: played.has(`${w}|${id}`) ? 1 : 0 });
    }
  }
  return out;
}

// The NFL's table for the season current (fit on the ones from..current-1), or null (logged)
export async function nflPlayChance(from, current) {
  const rows = await nflPlayRows(from, current).catch((err) => (console.warn(`nfl: play chance: the reports not read (${err.message})`), null));
  const table = rows ? choosePlayTable(rows) : null;
  if (!table) console.warn(`nfl: play chance: ${rows ? `${rows.length} questionable reports, too few` : 'no reports'}: a questionable player at half, as before`);
  return table;
}

// A questionable player's chance of missing tonight (1 less the table's chance he plays), or half with no table
export function missChance(table, x) {
  return table ? Math.round((1 - table.chance(x)) * 1000) / 1000 : 0.5;
}

// (the table for the state file and the model desk: the share who played, the levels kept, the held-out
// check (its per-group bias left out), and the chance by a quarterback or not and his games missed in a row)
export function playChanceSummary(t) {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const cells = {};
  for (const [who, pos] of [['QB', 'QB'], ['other', 'WR']]) for (const [g, gone] of [['0', 0], ['1', 1], ['2+', 2], ['new', null]]) cells[`${who} ${g}`] = r3(t.chance({ pos, gone }));
  const c = t.check;
  return { n: t.n, rate: r3(t.rate), levels: t.levels, check: { held: c.held, n: c.n, loss: c.loss, flat: c.flat, tried: c.tried.map((x) => ({ level: x.level, gain: x.gain, kept: x.kept, ...(x.worse ? { worse: x.worse } : {}) })) }, cells };
}
