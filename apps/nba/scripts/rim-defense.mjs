// The Teams tab's rim defense (added 2026-10-21): what each team's opponents shot within 4 feet of the rim
// (the restricted area, shot-zones.mjs's 'ra' zone), from the season's heat-maps.json (every shot's spot from
// ESPN's play-by-play: kept for the season being played on each run, and for every season since 2003-04).
//   oppRimPct   their makes there over their tries there (Opp Rim FG %)
//   oppRimRate  their tries there over all their shots from the floor (Opp Rim Rate)
// Both in percentage points (61.3), like the team's other shooting stats. Set on every head coach row (each
// carries its team's season: the Teams tab reads its stats off them, apps/nba/src/sport/sport.ts teamRows);
// null without the season's shots (before 2003-04), so the columns hide there. update-data.mjs calls
// addRimDefense on each part it writes; run on its own, it puts them into the seasons' files as they are:
//   node apps/nba/scripts/rim-defense.mjs [2004 2005 ...]   (no seasons: the season being played and every one kept)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ZONE_INDEX } from './shot-zones.mjs';

const RIM = ZONE_INDEX.get('ra');
const round1 = (v) => Math.round(v * 10) / 10;

// A heat-maps.json's defenses for a part: the regular season's, the playoffs', or both added up
function defensesOf(heat, part) {
  if (!heat) return null;
  const parts = part === 'all' ? [heat.regular, heat.post] : [heat[part === 'post' ? 'post' : 'regular']];
  const out = new Map();
  for (const p of parts.filter(Boolean)) {
    for (const [code, row] of Object.entries(p.defenses ?? {})) {
      const zones = Array.isArray(row?.s) ? row.s : [];
      const sums = out.get(code) ?? out.set(code, { tried: 0, rimTried: 0, rimMade: 0 }).get(code);
      for (let i = 0; i < zones.length; i += 2) sums.tried += zones[i];
      sums.rimTried += zones[2 * RIM] ?? 0;
      sums.rimMade += zones[2 * RIM + 1] ?? 0;
    }
  }
  return out;
}

// The two stats on a part's head coach rows (out.HC), by the team in the row's logo (heat-maps.json keys its
// teams by the same code)
export function addRimDefense(out, heat, part) {
  const defenses = defensesOf(heat, part);
  let set = 0;
  for (const coach of out.HC ?? []) {
    const code = coach.teamLogo?.split('/').pop()?.replace('.svg', '');
    const d = defenses?.get(code);
    coach.stats.oppRimPct = d?.rimTried ? round1((100 * d.rimMade) / d.rimTried) : null;
    coach.stats.oppRimRate = d?.tried ? round1((100 * d.rimTried) / d.tried) : null;
    if (coach.stats.oppRimPct !== null) set++;
  }
  return set;
}

export const readHeat = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

const FILES = { regular: 'skill-players.json', post: 'skill-players.post.json', all: 'skill-players.all.json' };

// Run on its own: each season folder's (and the season being played's) files, as they are
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const STATIC = path.join(import.meta.dirname, '../src/StaticData');
  const named = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
  const dirs = named.length
    ? named.map((season) => path.join(STATIC, 'seasons', season))
    : [STATIC, ...readdirSync(path.join(STATIC, 'seasons')).filter((d) => /^\d{4}$/.test(d)).map((d) => path.join(STATIC, 'seasons', d))];
  for (const dir of dirs) {
    const heat = readHeat(path.join(dir, 'heat-maps.json'));
    const done = [];
    for (const [part, name] of Object.entries(FILES)) {
      const file = path.join(dir, name);
      if (!existsSync(file)) continue;
      const out = JSON.parse(readFileSync(file, 'utf8'));
      done.push(`${part} ${addRimDefense(out, heat, part)}/${out.HC?.length ?? 0}`);
      writeFileSync(file, JSON.stringify(out));
    }
    console.log(`${path.basename(dir)}: rim defense on ${done.join(', ')} coach rows${heat ? '' : ' (no heat-maps.json: nulls)'}`);
  }
}
