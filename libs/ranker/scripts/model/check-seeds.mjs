// The CHECKs' seeded labels (2026-10-18, the owner's): past graded CHECKs researched after their games, the same
// research prompt and web search scoped to the news before each game's start (seed-checks.mjs, the Message Batches
// API), so the patterns (check-patterns.mjs) start with hundreds of examples rather than the few the live research
// made. Each label is kept with the fields its pattern and its record need, apart from checks.json (whose graded
// CHECKs are trimmed and pruned): apps/<sport>/scripts/model/check-seeds.json, { sport, seeds: [...] }, committed,
// not deployed. A seed reads as a CHECK whose finding is its seed (seeded true, never live research): its
// resolution counts toward its pattern's share, and its graded result toward its record, weighed as a live one's.
//
//   seedOf     seedOf(c, finding): a CHECK's seed record (its id, cause, diagnosis, role reason, pattern, the
//              projection's teammates out, its price and its graded result) with the finding marked seeded
//   readSeeds  readSeeds(sport, root): the seeds as CHECK-like objects for patternBook; none (a missing or
//              unreadable file) an empty list

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patternKey } from './check-patterns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const seedsFile = (sport, root = ROOT) => path.join(root, 'apps', sport, 'scripts/model/check-seeds.json');

// A CHECK's seed record (see above)
export function seedOf(c, finding) {
  const out = (c.projection?.out ?? []).map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
  return {
    id: c.id,
    sport: c.sport ?? null,
    start: c.start ?? null,
    market: c.market ?? null,
    propType: c.propType ?? null,
    pick: c.pick ?? null,
    player: c.player ?? null,
    team: c.team ?? null,
    cause: c.cause ?? null,
    roleReason: c.roleReason ?? null,
    reason: c.reason ?? null,
    diagnosis: c.diagnosis ? { cause: c.diagnosis.cause, ...(c.diagnosis.sub ? { sub: c.diagnosis.sub } : {}) } : null,
    pattern: patternKey({ ...c, research: undefined, seed: undefined }),
    projection: { out, vac: c.projection?.vac ?? null },
    odds: c.odds ?? null,
    oddsAssumed: !!c.oddsAssumed,
    checkResult: c.checkResult ?? null,
    seed: { ...finding, seeded: true },
  };
}

// The seeds as CHECK-like objects (see above)
export function readSeeds(sport, root = ROOT) {
  const file = seedsFile(sport, root);
  if (!existsSync(file)) return [];
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return (Array.isArray(j?.seeds) ? j.seeds : []).filter((s) => s?.id && s.seed).map((s) => ({ ...s, seed: { ...s.seed, seeded: true, pattern: s.seed.pattern ?? s.pattern } }));
  } catch {
    return [];
  }
}
