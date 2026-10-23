// The experience weighting's walk-forward pick (DECISIONS.md D82): each season's knobs by stat and experience from the
// player games of the seasons before it alone, written to apps/<sport>/src/StaticData/model/young.json.
//
//   input   the layer-a dumps of the gate's walk-forward replay (gate.mjs REPLAY_DUMP: <sport>-layera.json, each player
//           game's [stat, pid, game, season, log loss, yrs, mu, value]) under each grid point, one directory a point,
//           named k<km>w<wa> ('id' the model as it is, k1w0): YOUNG_KW='{"*":{"*":{"r":[km,wa],"y2":[km,wa],"y3":[km,wa]}}}'
//           REPLAY_DUMP=<dir>/k<km>w<wa> node gate.mjs --score-only worktree <sport>. A player's projection reads
//           only his own knobs, so one replay a point serves every stat and experience at once
//   pick    for stat x experience x season S: the point whose summed log loss over that cell's player games of the
//           seasons before S is the lowest, from YF_MIN games (else the model as it is); '*' the pick on every season
//   usage   node young-fit.mjs <sport> <dir> [--write]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const YF_MIN = 300;
export const BUCKETS = ['r', 'y2', 'y3'];
const ROOT = path.resolve(import.meta.dirname, '../../../..');
const bk = (y) => (!Number.isFinite(y) || y >= 3 ? 'v' : y <= 0 ? 'r' : y === 1 ? 'y2' : 'y3');
export const knobOf = (c) => (c === 'id' ? [1, 0] : c.match(/^k([\d.]+)w([\d.]+)$/)?.slice(1).map(Number) ?? null);

// (the picks from { cfg: [[stat, pid, game, season, loss, yrs], ...] }: { table, picks })
export function pickYoung(dumps, { min = YF_MIN } = {}) {
  const cfgs = Object.keys(dumps).filter((c) => knobOf(c));
  const loss = Object.fromEntries(cfgs.map((c) => [c, new Map(dumps[c].map((r) => [`${r[0]}|${r[1]}|${r[2]}`, r[4]]))]));
  const base = dumps.id ?? dumps[cfgs[0]];
  const rows = base.map((r) => ({ k: `${r[0]}|${r[1]}|${r[2]}`, stat: r[0], season: r[3], b: bk(r[5]) })).filter((x) => x.b !== 'v' && cfgs.every((c) => loss[c].has(x.k)));
  const seasons = [...new Set(base.map((r) => r[3]))].sort((a, b) => a - b);
  const stats = [...new Set(rows.map((x) => x.stat))];
  const table = {};
  const picks = {};
  const pick = (list) => {
    if (list.length < min) return 'id';
    let best = 'id';
    let bl = Infinity;
    for (const c of cfgs) {
      const l = list.reduce((t, x) => t + loss[c].get(x.k), 0);
      if (l < bl - 1e-9 || (Math.abs(l - bl) <= 1e-9 && c === 'id')) (bl = l), (best = c);
    }
    return best;
  };
  for (const st of stats) for (const b of BUCKETS) for (const S of [...seasons, '*']) {
    const c = pick(rows.filter((x) => x.stat === st && x.b === b && (S === '*' || x.season < S)));
    (picks[S] ??= {})[`${st}|${b}`] = c;
    // (every season's cell written, the model as it is too: a season's own pick, never the '*' one, so no season reads a pick made on itself or later)
    ((table[st] ??= {})[S] ??= {})[b] = knobOf(c);
  }
  return { table, picks, seasons, points: cfgs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [sport, dir] = process.argv.slice(2);
  const dumps = {};
  for (const c of readdirSync(dir)) {
    const f = path.join(dir, c, `${sport}-layera.json`);
    if (knobOf(c) && existsSync(f)) dumps[c] = JSON.parse(readFileSync(f, 'utf8'));
  }
  const out = pickYoung(dumps);
  const doc = { v: 1, at: new Date().toISOString(), sport, points: out.points, seasons: out.seasons, table: out.table, picks: out.picks, text: `young players' prior weight and form weight by stat and experience, picked walk-forward (${Object.keys(out.table).length} stats)` };
  console.log(JSON.stringify(doc.picks, null, 0));
  if (process.argv.includes('--write')) writeFileSync(path.join(ROOT, 'apps', sport, 'src/StaticData/model/young.json'), JSON.stringify(doc, null, 1) + '\n');
}
