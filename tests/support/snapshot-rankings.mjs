// Writes tests/support/snapshots/rankings-<sport>.json for every sport (or the ones named): the rankings
// the stat categories must leave alone (rank-snapshot.mjs; categories.test.mjs checks them). Run it only
// when the rankings are meant to change (new data, a scoring change), never to make a category change pass:
//   node tests/support/snapshot-rankings.mjs [nfl mlb ...]
import fs from 'node:fs';
import path from 'node:path';
import { SPORTS, loadEngine } from './engine.mjs';
import { snapshotSport } from './rank-snapshot.mjs';

const dir = path.join(import.meta.dirname, 'snapshots');
fs.mkdirSync(dir, { recursive: true });
const sports = process.argv.slice(2).length ? process.argv.slice(2) : SPORTS;
for (const sport of sports) {
  const engine = await loadEngine(sport);
  const fixture = snapshotSport(engine, sport);
  const file = path.join(dir, `rankings-${sport}.json`);
  fs.writeFileSync(file, JSON.stringify(fixture));
  const tabs = Object.values(fixture.seasons).reduce((n, season) => n + Object.keys(season).length, 0);
  console.log(`${sport}: ${Object.keys(fixture.seasons).join(', ')} (${tabs} tabs) -> ${path.relative(process.cwd(), file)}`);
}
