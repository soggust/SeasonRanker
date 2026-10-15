import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

// The map builders' files (apps/mlb/scripts/build-heat-maps.mjs, apps/nhl/scripts/build-heat-maps.mjs,
// apps/nfl/scripts/build-field-maps.mjs)

// A JSON file, or null when it isn't there
export const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

// (nothing new: the file as it was, its "updated" too, so a quiet night commits nothing)
export function writeIfChanged(file, out) {
  const old = readJson(file);
  if (old && JSON.stringify({ ...old, updated: null }) === JSON.stringify({ ...out, updated: null })) return { file, size: statSync(file).size, same: true };
  writeFileSync(file, JSON.stringify(out));
  return { file, size: statSync(file).size, same: false };
}
