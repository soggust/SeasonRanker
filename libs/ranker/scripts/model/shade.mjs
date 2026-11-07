// The under-shade challengers (DECISIONS.md D110, the owner's ledger mining, 2026-11-07: the Books' player-prop lines
// in the NHL and the NBA sit 1.5 to 3 points toward the over every season; the overs lose 8 to 11% at DraftKings and
// Pinnacle alike, the unders beat the no-vig everywhere, and the Bot has been staking into it). Two rules, each an
// environment flag, default off, measured side by side by the gate; nothing priced or staked moves while both are off.
//
//   UNDER_SHADE   the soft term (preferred): the Book's no-vig fair is read as shaded toward the over by a measured
//                 amount s, so the over's fair is f - s and the under's 1 - f + s, BEFORE the trust's blend and the
//                 residual's (desk.mjs chanceAt reads the shaded fair; the edge bar and the stakes read the chance that
//                 comes out). s is self-tuning, walk-forward, by sport and stat (fitShade, walkShade): on the graded
//                 rows settled before the bet's month (the priced history's closes since 2023 and the ledger's graded
//                 props), the under side's actual rate less its no-vig fair, that is mean(f - y) in the over's frame,
//                 shrunk n / (n + SHADE_N0) toward 0 and clamped to [0, SHADE_MAX]: a stat with no over-shade reads 0,
//                 never a shade the other way. One term for the whole family: no separate "no overs" discount on top
//                 of it (a double count). The row's recorded fair stays the Book's (the ledger's fair, the gate's f and
//                 every measure against the Book); the shaded one rides beside it (fairShaded on a live bet, fs on a
//                 replayed row)
//   NO_PROP_OVERS the hard alternative: the Bot never stakes a player-prop over in the shaded sports; the over is
//                 tracked (intent track, 0u, graded and learned from, as D88's held sides are) and the replay passes it
//   where         SHADE_SPORTS (UNDER_SHADE_SPORTS=nhl,nba,... overrides for a research run): the family the mining
//                 found, the NHL's and the NBA's props. The fit is reported for every sport (gate.mjs) so the owner sees
//                 the NFL's and MLB's numbers; they price nothing till the owner adds them
//   not           the anchor (anchor.mjs reads the Book's implied mean from the unshaded fair, as the history fits
//                 it), the live calibration, the suspect bar (D23: points over the price's break-even), a measure
//                 against the Book or its close (gate-score.mjs reads f, never fs)
// Measured 2026-11-07 (the gate, both candidates against origin/master) and held: neither beat the current model
// (D110's entry has the table). Both land off (SHADE_PRICING, NO_OVERS_PRICING false); the flags stay for the recheck.
// Plain JavaScript, no dependency; nothing here imports the desk.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// (whether each rule prices live: the gate's verdict (D22). The environment overrides it for one run, the gate's
// candidate: UNDER_SHADE=1 / NO_PROP_OVERS=1 on, =0 off)
export const SHADE_PRICING = false;
export const NO_OVERS_PRICING = false;
const envOn = (name, def) => (process.env[name] === '1' ? true : process.env[name] === '0' ? false : def);
export const UNDER_SHADE = envOn('UNDER_SHADE', SHADE_PRICING);
export const NO_PROP_OVERS = envOn('NO_PROP_OVERS', NO_OVERS_PRICING);
export const SHADE_SPORTS = (process.env.UNDER_SHADE_SPORTS ?? 'nhl,nba').split(',').map((s) => s.trim()).filter(Boolean);
// (the shrink's rows: a stat with n graded rows keeps n / (n + SHADE_N0) of its measured shade; the clamp's top)
export const SHADE_N0 = 500;
export const SHADE_MAX = 0.04;
const fin = Number.isFinite;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const clampP = (p) => Math.min(0.999, Math.max(0.001, p));

export const shadeOn = (sport, on = UNDER_SHADE) => !!on && SHADE_SPORTS.includes(sport);
export const noOvers = (sport, on = NO_PROP_OVERS) => !!on && SHADE_SPORTS.includes(sport);
// (the hard rule on a side: a player-prop over in a shaded sport is never staked)
export const overHeld = (sport, market, over, on = NO_PROP_OVERS) => noOvers(sport, on) && market === 'prop' && over === true;

// The shade fit on graded rows in the over's frame ({ f: the over's no-vig fair, y: 1 the over won, 0 the under }):
// raw = mean(f - y) (the under's actual rate less its fair), shade = clamp(raw x n / (n + n0), 0, max). { shade, raw, n }
export function fitShade(rows, { n0 = SHADE_N0, max = SHADE_MAX } = {}) {
  let n = 0;
  let s = 0;
  for (const x of rows ?? []) {
    if (!fin(x.f) || !(x.y === 0 || x.y === 1)) continue;
    n++;
    s += x.f - x.y;
  }
  if (!n) return { shade: 0, raw: null, n: 0 };
  const raw = s / n;
  return { shade: r4(Math.min(max, Math.max(0, (raw * n) / (n + n0)))), raw: r4(raw), n };
}

// (the fit by stat on a sport's rows ({ stat, f, y }): { stats: { <stat>: { shade, raw, n } }, n })
export function fitShadeByStat(rows, opts = {}) {
  const by = new Map();
  for (const x of rows ?? []) (by.get(x.stat) ?? by.set(x.stat, []).get(x.stat)).push(x);
  const stats = {};
  for (const [k, list] of [...by].sort(([a], [b]) => String(a).localeCompare(String(b)))) stats[k] = fitShade(list, opts);
  return { stats, n: (rows ?? []).length };
}

const monthStart = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const dayStart = (t) => Math.floor(t / 864e5) * 864e5;
// The walk: graded rows { sport, stat, t (the start, ms), f, y }; at(sport, stat, when) -> the shade fit on the sport and
// stat's rows that started before the month `when` falls in (by 'day': before its day), so no row teaches its own
// placement's month (the history's trust walk's convention, gate-history.mjs walkTrust)
export function walkShade(rows, { by = 'month', ...opts } = {}) {
  const byKey = new Map();
  for (const x of rows ?? []) {
    if (!fin(x.t) || !fin(x.f) || !(x.y === 0 || x.y === 1)) continue;
    const k = `${x.sport}|${x.stat}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)).push(x);
  }
  for (const list of byKey.values()) list.sort((a, b) => a.t - b.t);
  const memo = new Map();
  const at = (sport, stat, when) => {
    if (!fin(when)) return 0;
    const cut = by === 'day' ? dayStart(when) : monthStart(when);
    const k = `${sport}|${stat}`;
    const id = `${k}|${cut}`;
    if (memo.has(id)) return memo.get(id);
    const list = byKey.get(k) ?? [];
    // (sorted by start: the rows before the cut are a prefix)
    let hi = list.length;
    let lo = 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t < cut) lo = mid + 1;
      else hi = mid;
    }
    const v = fitShade(list.slice(0, lo), opts).shade;
    memo.set(id, v);
    return v;
  };
  at.keys = () => [...byKey.keys()];
  return at;
}

// (the over's fair shaded by s, in the over's frame; a side's fair: the over's less s, the under's plus s)
export const shadedOver = (fOver, s) => (fin(fOver) && fin(s) && s > 0 ? clampP(fOver - s) : fOver);
export const shadedSide = (fairSide, over, s) => (fin(fairSide) && fin(s) && s > 0 ? clampP(over ? fairSide - s : fairSide + s) : fairSide);

// The sport's shade as the live desk reads it: apps/<sport>/src/StaticData/model/shade.json, written by gate.mjs
// --record (the fit on every graded row to date, by stat); none: no shade
const ROOT = path.resolve(import.meta.dirname, '../../../..');
export const shadeFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'src/StaticData/model/shade.json');
const cache = new Map();
export function readShade(sport, root = ROOT) {
  const f = shadeFile(sport, root);
  if (cache.has(f)) return cache.get(f);
  let m = null;
  try {
    if (existsSync(f)) m = JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    m = null;
  }
  cache.set(f, m);
  return m;
}
export const shadeOf = (file, stat) => (fin(file?.stats?.[stat]?.shade) ? file.stats[stat].shade : 0);
export const shadeText = (fit) => (fit?.stats ? Object.entries(fit.stats).map(([k, v]) => `${k} ${v.shade} (raw ${v.raw ?? '-'} on ${v.n})`).join(', ') : 'none');
