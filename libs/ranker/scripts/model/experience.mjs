// A player's experience (DECISIONS.md D82, the owner's 2026-10-22 case: the NHL's Schaefer, a second-year
// defenseman whose 82-game rookie season held 57% of his rate in October): the seasons he'd played before a row's.
//
//   yrs     the row's season less his first: 0 a rookie, 1 his second season, 2 his third, 3 or more a veteran.
//           His first season is the earliest of the rows' own (the replay's or the desk's players' games) and the
//           stats site's careers (apps/<sport>/src/StaticData/careers/first-seasons.json, the seasons since
//           2000/2009 its rankings read: an NBA player by his ESPN id there, an MLB one by his StatsAPI id, an NHL
//           one by his name where it's one player's), the NFL's nflverse rookie season (row.draft.year). Known
//           before any game of his season: no look-ahead. Unknown (no source and first seen in the rows' first
//           season): null, read as a veteran (the model as it was)
//   bucket  'r' rookie, 'y2' second year, 'y3' third, 'v' veteran or unknown
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const fin = Number.isFinite;
const site = new Map();
const nameKey = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// (the site's first seasons by the ids the rows carry: { byId, byName }, once a sport)
export function siteFirsts(sport) {
  if (site.has(sport)) return site.get(sport);
  const out = { byId: new Map(), byName: new Map() };
  try {
    const dir = path.join(ROOT, 'apps', sport, 'src/StaticData/careers');
    const fsf = path.join(dir, 'first-seasons.json');
    const nf = path.join(dir, 'names.json');
    if (existsSync(fsf) && existsSync(nf)) {
      const first = JSON.parse(readFileSync(fsf, 'utf8'));
      const names = JSON.parse(readFileSync(nf, 'utf8'));
      const dupe = new Set();
      for (const pos of Object.values(names)) {
        for (const [k, v] of Object.entries(pos)) {
          const f = first[k];
          if (!fin(f) || !Array.isArray(v)) continue;
          if (sport === 'nba' && v[1] !== null && v[1] !== undefined) out.byId.set(String(v[1]), Math.min(f, out.byId.get(String(v[1])) ?? Infinity));
          if (sport === 'mlb') out.byId.set(`mlb:${String(k).replace(/^[A-Z]-/, '')}`, Math.min(f, out.byId.get(`mlb:${String(k).replace(/^[A-Z]-/, '')}`) ?? Infinity));
          const nk = nameKey(v[0]);
          const was = out.byName.get(nk);
          if (was && was.k !== k) dupe.add(nk);
          out.byName.set(nk, { k, f: Math.min(f, was?.k === k ? was.f : Infinity) });
        }
      }
      for (const nk of dupe) out.byName.delete(nk);
    }
  } catch {
    // (no careers: the rows alone)
  }
  site.set(sport, out);
  return out;
}

// (each row's yrs, set on the row: the rows' own first season per player and the sources above)
export function tagExperience(sport, rows) {
  if (!rows?.length) return rows;
  const firstSeen = new Map();
  let r0 = Infinity;
  for (const r of rows) {
    if (!fin(r.season)) continue;
    r0 = Math.min(r0, r.season);
    const k = String(r.pid);
    if (!(firstSeen.get(k) <= r.season)) firstSeen.set(k, r.season);
  }
  const S = siteFirsts(sport);
  const firstOf = new Map();
  for (const r of rows) {
    const k = String(r.pid);
    if (!firstOf.has(k)) {
      const seen = firstSeen.get(k);
      let f = sport === 'nfl' ? (fin(r.draft?.year) && r.draft.year >= 1990 ? r.draft.year : null) : null;
      const s = S.byId.get(k) ?? (sport === 'nhl' ? S.byName.get(nameKey(r.name))?.f : undefined);
      if (fin(s)) f = f === null ? s : Math.min(f, s);
      // (first seen after the rows' first season: that's his first, or the earlier source's)
      if (fin(seen) && seen > r0) f = f === null ? seen : Math.min(f, seen);
      firstOf.set(k, f);
    }
    const f = firstOf.get(k);
    r.yrs = fin(f) && fin(r.season) ? Math.max(0, r.season - f) : null;
  }
  lastFirst.set(sport, firstOf);
  return rows;
}

export const expBucket = (yrs) => (!fin(yrs) ? 'v' : yrs <= 0 ? 'r' : yrs === 1 ? 'y2' : yrs === 2 ? 'y3' : 'v');
export const BUCKETS = ['r', 'y2', 'y3', 'v'];

// (each sport's first seasons as the last tagExperience read them: tonight's rows' yrs on the live desk)
const lastFirst = new Map();
export const yrsOf = (sport, pid, season) => {
  const f = lastFirst.get(sport)?.get(String(pid));
  return Number.isFinite(f) && Number.isFinite(season) ? Math.max(0, season - f) : null;
};
// (the sport's experience weighting, apps/<sport>/src/StaticData/model/young.json: { v, at, table, picks }; the
// table is project.mjs setYoung's: each season's knobs by stat and experience, picked on the seasons before it
// (young-fit.mjs), '*' the pick on every season to date, for a season the walk hasn't reached; null: none)
export function readYoung(sport) {
  try {
    const f = path.join(ROOT, 'apps', sport, 'src/StaticData/model/young.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  } catch {
    return null;
  }
}
