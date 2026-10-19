// A questionable player's chance of playing (the NFL's), from the injury reports of the seasons before this
// one: nflverse's weekly reports (each player's final status for the game, Questionable, and his last
// practice's participation: did not, limited, full) against who took the field for his team (nflverse's snap
// counts: an offensive snap, the work the props read), the skill positions' regulars alone (QB, RB, FB, WR, TE,
// half his team's offensive snaps or more in a game this season before it or in one last season: the ones
// whose absence the props read; a depth player listed questionable plays less often, 2016-2025 43% against
// 70%). Before it, every questionable player counted as missing at half (props.mjs missOf(0.5): the vacated
// work, the next man up, rb1Out and qb1Out).
//
//   the table   the share who played, by what's known before the game, each level pulled toward the one above
//               it by PLAY_K made-up reports (a cell with few reads like its parent): the questionable regulars
//               all, then by the levels kept, in this order: qb (a quarterback or not) and gone (his team's
//               games he's missed in a row this season before it: 0, 1, 2 or more, or new: not yet played for
//               the team this season)
//   the levels  chosen on held-out seasons: each of the last PLAY_HELD prior seasons predicted from the ones
//               before it alone (the table fit as it would have been then), their log loss pooled, priced as
//               it's read live; a level is added (in the order above, each tried after the ones kept) only
//               where it saves PLAY_FLOOR a report or more over the table without it, and no group's held-out
//               bias (the chance less the share who played: each position's, and each of the level's own
//               cells', PLAY_SUB_N reports or more) grows by more than PLAY_TOL: the late terms' gate
//               (project.mjs), its rows' groups. Then each side (a quarterback's, the rest's) against the flat
//               half: a side whose held-out log loss doesn't beat ln 2 by the floor is read at half (the
//               quarterbacks': few reports, their share who played falling from 58% in 2016 to 26% in 2025).
//               Practice isn't read live (ESPN's report doesn't carry it, nflverse's current season's posts a
//               week's reports after its games): measured the same way with the report's own, logged, never
//               kept (PLAY_UNREAD). The table used tonight is then fit on every prior season with the levels
//               kept (no game of this season: no look-ahead)
//   live        ESPN's status (questionable, day-to-day, game-time: timing.mjs Q_STATUS) and position, and his
//               games missed from the model's own work history (matchups.mjs goneOf: his offensive work for
//               this team, as the history's is counted); the table read only for a regular at his position
//               (matchups.mjs regulars), half for the rest, and only once the final report's out (PLAY_FINAL
//               hours before the kickoff: a status before it is an estimate, a population the table isn't fit
//               on). No table (the last season's files unread, too few reports): every questionable player at
//               half, as before
//
// The NBA and NHL: no history of ESPN's statuses is kept (the box score says who played, not who was listed
// day-to-day before), so their questionable players stay at half.

import { nflverseRows } from './sources.mjs';

// (made-up games a cell's share is pulled toward its parent's by; the log-loss saving a level must make, a
// report (natural log); the held-out seasons; the fewest questionable reports a table is built from; the
// levels tried, read live, in order; the ones measured but not read live)
export const PLAY_K = 25;
export const PLAY_FLOOR = 0.003;
export const PLAY_HELD = 3;
export const PLAY_MIN = 1000;
// (practice read live since D45 (2026-10-19): the week's practice status from nflverse's injuries file, the one the
// table was fit on (the final practice of the week, which is the one posted by the time the window opens, 26 hours
// before the kickoff, PLAY_FINAL); measured +0.0203 held out 2023-2025, the largest level)
export const PLAY_LEVELS = ['qb', 'gone', 'practice'];
export const PLAY_UNREAD = [];

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

// (a report's side: a quarterback's or the rest's; each its own check against the flat half)
export const playSide = (x) => (playPos(x.pos) === 'QB' ? 'QB' : 'other');

// (log loss a report, and the bias (the chance less the share who played) of each group (by: a row's groups),
// a group's rows counted beside it, and each side's log loss, of a table on rows)
function scoreOf(chance, rows, by = (x) => [playPos(x.pos)]) {
  let loss = 0;
  const groups = new Map();
  const sides = new Map();
  for (const x of rows) {
    const p = chance(x);
    const y = x.played ? 1 : 0;
    const l = y ? -Math.log(p) : -Math.log(1 - p);
    loss += l;
    const s = sides.get(playSide(x)) ?? [0, 0];
    s[0]++;
    s[1] += l;
    sides.set(playSide(x), s);
    for (const g of by(x)) {
      const b = groups.get(g) ?? [0, 0];
      b[0]++;
      b[1] += p - y;
      groups.set(g, b);
    }
  }
  return {
    n: rows.length,
    loss: rows.length ? loss / rows.length : 0,
    bias: Object.fromEntries([...groups].map(([g, [n, s]]) => [g, { n, bias: n ? s / n : 0 }])),
    sides: Object.fromEntries([...sides].map(([g, [n, s]]) => [g, { n, loss: s / n }])),
  };
}

// The held-out check of the levels given: each held-out season predicted from the seasons before it alone,
// pooled (the flat half's log loss is ln 2 a report); its groups the positions' and the cells of the level
// tried (sub). Priced as it's read live (live: the levels known live alone; a report's practice unread)
function heldOf(rows, levels, held, k, sub = null, live = true) {
  const scored = [];
  for (const s of held) {
    const t = fitPlayTable(rows.filter((x) => x.season < s), levels, k);
    if (!t) return null;
    for (const x of rows.filter((r) => r.season === s)) scored.push({ ...x, p: t.chance(live && PLAY_UNREAD.includes('practice') ? { ...x, practice: null } : x) });
  }
  const by = (x) => [playPos(x.pos), ...(sub && valueOf(x, sub) !== null ? [`${sub}=${valueOf(x, sub)}`] : [])];
  return scoreOf((x) => x.p, scored, by);
}

// The levels kept (forward, in PLAY_LEVELS' order, on the held-out seasons: each on the floor and its groups'
// bias), and the table fit on every row with them; null with too few reports. A level's groups (PLAY_SUB_N
// held-out reports or more each) are the positions and the level's own cells (a quarterback, gone 1): none's
// held-out bias (the chance less the share who played) larger than without the level by more than PLAY_TOL, a
// cell's noise at a few hundred reports. Then each side (a quarterback's, the rest's) on its own: one whose
// held-out log loss with the levels kept doesn't beat the flat half's by the floor reads at half (the table
// says nothing it can be trusted with: the quarterbacks', 2016-2025, its few reports' rate falling season by
// season, 58% to 26%). The levels not read live (PLAY_UNREAD: practice) measured after, by the same check with
// the report's own, logged, never kept
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
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const biasOf = (before, next) => Object.fromEntries(Object.keys(next.bias).map((g) => [g, [r4(before.bias[g]?.bias ?? 0), r4(next.bias[g].bias), next.bias[g].n]]));
  for (const l of PLAY_LEVELS) {
    const before = heldOf(rows, levels, held, k, l);
    const next = heldOf(rows, [...levels, l], held, k, l);
    if (!before || !next) continue;
    const gain = before.loss - next.loss;
    const worse = Object.keys(next.bias).filter((g) => next.bias[g].n >= PLAY_SUB_N && Math.abs(next.bias[g].bias) > Math.abs(before.bias[g]?.bias ?? 0) + PLAY_TOL);
    const kept = gain >= floor && !worse.length;
    tried.push({ level: l, gain: r4(gain), kept, bias: biasOf(before, next), ...(worse.length ? { worse } : {}) });
    if (kept) (levels = [...levels, l]), (best = next);
  }
  // (each level not read live: what it'd save known, measured on the table kept)
  for (const l of PLAY_UNREAD) {
    const before = heldOf(rows, levels, held, k, l, false);
    const next = heldOf(rows, [...levels, l], held, k, l, false);
    if (before && next) tried.push({ level: l, gain: r4(before.loss - next.loss), kept: false, unread: true, bias: biasOf(before, next) });
  }
  // (each side against the flat half: a side not beating it by the floor at half)
  const half = Object.entries(best.sides).filter(([, s]) => s.loss > Math.LN2 - floor).map(([g]) => g);
  const fit = fitPlayTable(rows, levels, k);
  if (!fit) return null;
  const sides = Object.fromEntries(Object.entries(best.sides).map(([g, s]) => [g, { n: s.n, loss: r4(s.loss), ...(half.includes(g) ? { half: true } : {}) }]));
  // (the check as it's read live: a side at half at ln 2 a report)
  const loss = Object.entries(best.sides).reduce((t, [g, s]) => t + s.n * (half.includes(g) ? Math.LN2 : s.loss), 0) / Math.max(1, best.n);
  return {
    ...fit,
    chance: (x) => (half.includes(playSide(x)) ? 0.5 : fit.chance(x)),
    half,
    check: { held, n: best.n, loss: r4(loss), flat: r4(Math.LN2), sides, bias: Object.fromEntries(Object.entries(best.bias).map(([g, b]) => [g, r4(b.bias)])), tried },
  };
}

// The NFL's reports of the seasons from..current-1 as rows ({ season, gone, pos, practice, regular, played }): a
// final status of Questionable for a game his team played (its snap counts read), played if he took an
// offensive snap for it in it (the work the props read); his games missed in a row his team's this season, an
// offensive snap for it ending them (as the work history reads him live: one traded in, new); a regular one
// with half his team's offensive snaps or more in a game of his this season before it, or in any last season.
// A season whose files aren't read is left out, logged; null where it's the last one (a stale table: half)
export async function nflPlayRows(from, current) {
  const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'pfr_id'], 24 * 7);
  if (!players?.length) return null;
  const pfrOf = new Map(players.filter((p) => p.pfr_id && p.pfr_id !== 'NA').map((p) => [p.gsis_id, p.pfr_id]));
  const out = [];
  const skipped = [];
  const regsOf = (snaps) => new Set((snaps ?? []).filter((r) => Number(r.offense_pct) >= 0.5).map((r) => r.pfr_player_id));
  let lastRegs = new Set();
  for (let season = from - 1; season < current; season++) {
    const snaps = await nflverseRows('snap_counts', `snap_counts_${season}.csv.gz`, ['week', 'pfr_player_id', 'team', 'offense_snaps', 'offense_pct'], 24 * 365).catch(() => null);
    // (nflverse's injury files: a plain CSV before 2023, gzipped too from then on)
    let inj = null;
    if (season >= from) for (const f of season < 2023 ? [`injuries_${season}.csv`] : [`injuries_${season}.csv.gz`, `injuries_${season}.csv`]) if (!inj?.length) inj = await nflverseRows('injuries', f, ['week', 'gsis_id', 'team', 'position', 'report_status', 'practice_status'], 24 * 365).catch(() => null);
    if (season < from || !snaps?.length || !inj?.length) {
      if (season >= from) skipped.push(season);
      lastRegs = regsOf(snaps);
      continue;
    }
    const played = new Set();
    // (each player's first week with half his team's offensive snaps or more)
    const big = new Map();
    const teamWeeks = new Map();
    for (const r of snaps) {
      const w = Number(r.week);
      if (!teamWeeks.has(r.team)) teamWeeks.set(r.team, new Set());
      teamWeeks.get(r.team).add(w);
      if ((Number(r.offense_snaps) || 0) > 0) played.add(`${r.team}|${w}|${r.pfr_player_id}`);
      if (Number(r.offense_pct) >= 0.5 && !(big.get(r.pfr_player_id) <= w)) big.set(r.pfr_player_id, w);
    }
    const weeksOf = new Map([...teamWeeks].map(([t, s]) => [t, [...s].sort((a, b) => a - b)]));
    for (const x of inj) {
      if (!/^questionable$/i.test(x.report_status ?? '') || playPos(x.position) === 'oth') continue;
      const id = pfrOf.get(x.gsis_id);
      const w = Number(x.week);
      const weeks = weeksOf.get(x.team);
      if (!id || !weeks?.includes(w)) continue;
      // (his team's games before it this season he missed in a row; null where he took no snap for it in any)
      const before = weeks.filter((v) => v < w).reverse();
      const at = before.findIndex((v) => played.has(`${x.team}|${v}|${id}`));
      out.push({ season, gone: at < 0 ? null : at, pos: x.position, practice: playPractice(x.practice_status), regular: big.get(id) < w || lastRegs.has(id) ? 1 : 0, played: played.has(`${x.team}|${w}|${id}`) ? 1 : 0 });
    }
    lastRegs = regsOf(snaps);
  }
  for (const s of skipped) console.warn(`nfl: play chance: ${s}'s injury reports or snap counts not read: left out`);
  if (skipped.includes(current - 1)) return null;
  return out;
}

// The NFL's table for the season current (fit on the regulars' reports of the ones from..current-1), or null
// (logged)
export async function nflPlayChance(from, current) {
  const all = await nflPlayRows(from, current).catch((err) => (console.warn(`nfl: play chance: the reports not read (${err.message})`), null));
  const rows = all ? all.filter((x) => x.regular) : null;
  const table = rows ? choosePlayTable(rows) : null;
  if (!table) console.warn(`nfl: play chance: ${rows ? `${rows.length} questionable regulars' reports, too few` : 'no reports'}: a questionable player at half, as before`);
  return table;
}

// The week's practice status by ESPN id (D45): nflverse's injuries rows (the current season's file, read again every
// 12 hours: its practice_status is the latest practice posted) for the week given, through the players file's gsis
// to ESPN ids. practiceFrom: the pure part (rows: { week, gsis_id, practice_status }; espnOf: gsis -> ESPN id)
export function practiceFrom(rows, espnOf, week) {
  const out = new Map();
  for (const x of rows ?? []) {
    if (Number(x.week) !== Number(week)) continue;
    const id = espnOf.get(x.gsis_id);
    const p = playPractice(x.practice_status);
    if (id && p) out.set(String(id), p);
  }
  return out;
}
export async function nflPractice(season, week) {
  if (!Number.isFinite(Number(week))) return new Map();
  const players = await nflverseRows('players', 'players.csv.gz', ['gsis_id', 'espn_id'], 24 * 7).catch(() => null);
  const espnOf = new Map((players ?? []).filter((p) => p.espn_id && p.espn_id !== 'NA').map((p) => [p.gsis_id, String(Number(p.espn_id))]));
  if (!espnOf.size) return new Map();
  const inj = await nflverseRows('injuries', `injuries_${season}.csv.gz`, ['week', 'gsis_id', 'practice_status'], 12).catch(() => null);
  return practiceFrom(inj ?? [], espnOf, week);
}

// A regular's chance of missing the game when his props are missing from the board while teammates' are listed
// (board-miss.mjs nflBoardMiss's rates, D45): by his report status group ('q' questionable, else 'none'); null
// without the rates
export function boardMissChance(rates, status, missing = true) {
  const g = rates?.[status === 'q' ? 'q' : 'none'];
  const r = g ? (missing ? g.missing : g.listed) : null;
  return Number.isFinite(r) ? r : null;
}

// The table's reports are the final ones (a Sunday game's Friday's, a Monday's Saturday's, a Thursday's
// Wednesday's): a status before them is an estimate, its players some not listed at all by the final one (nearly
// all of those play) and some out (none do), not the population the table's fit on. So it's read only within
// PLAY_FINAL hours of the kickoff, every final report out by then (a Thursday night's posted the afternoon
// before: 26 hours before an 8:15 kickoff is 6:15 the evening before); before it, or with no kickoff known,
// every questionable one at half, as before
export const PLAY_FINAL = 26;
export function playAt(table, kickoff, now = Date.now()) {
  const t = Date.parse(kickoff ?? '');
  return table && Number.isFinite(t) && t - now <= PLAY_FINAL * 36e5 ? table : null;
}

// A questionable player's chance of missing tonight (1 less the table's chance he plays), or half with no table
// or for one who isn't a regular (regular false: the table is the regulars')
export function missChance(table, x) {
  return table && x?.regular !== false ? Math.round((1 - table.chance(x)) * 1000) / 1000 : 0.5;
}

// (the table for the state file and the model desk: the share who played, the levels kept, the held-out
// check (its per-group bias left out; each side's, a side at half flagged), and the chance by a quarterback or
// not and his games missed in a row)
export function playChanceSummary(t) {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const cells = {};
  for (const [who, pos] of [['QB', 'QB'], ['other', 'WR']]) for (const [g, gone] of [['0', 0], ['1', 1], ['2+', 2], ['new', null]]) cells[`${who} ${g}`] = r3(t.chance({ pos, gone }));
  const c = t.check;
  return { n: t.n, rate: r3(t.rate), levels: t.levels, half: t.half ?? [], check: { held: c.held, n: c.n, loss: c.loss, flat: c.flat, sides: c.sides, tried: c.tried.map((x) => ({ level: x.level, gain: x.gain, kept: x.kept, ...(x.unread ? { unread: true } : {}), ...(x.worse ? { worse: x.worse } : {}) })) }, cells };
}
