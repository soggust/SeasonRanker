// Pre-registration (DECISIONS.md D94, the testing audit's sixth recommendation (a), 2026-10-26): every new idea's bar and
// its variants are written down, dated and hashed, before any of its results are run, so the round can't move the bar
// or add the variant that happened to win after seeing the numbers. The register is prereg.json beside this file
// (committed with the round's first commit); the agents use it:
//
//   node libs/ranker/scripts/model/prereg.mjs add --id <id> --idea "<what and why>" --bar "<what ships it, written
//        before the results: the measure, the z or the threshold, the sample>" --variants "<a>|<b>|..." [--sports nba,nhl]
//        [--by <who>]
//   node libs/ranker/scripts/model/prereg.mjs result --id <id> --variant <a> --text "<the result, as measured>"
//        (refused for an id never registered, or a variant it didn't register: a new variant is a new id)
//   node libs/ranker/scripts/model/prereg.mjs show [<id>]
//
// The DECISIONS entry for the idea cites its id and its registered bar; the result lines say which variant, as
// registered. Registering after the results is the one thing it can't catch: the commit order shows it (the entry's
// hash and date are in the commit before the results'). Free: no API calls, never the bettor.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREREG_FILE = path.join(import.meta.dirname, 'prereg.json');
export const PREREG_V = 1;

const hashOf = (e) => createHash('sha256').update(JSON.stringify([e.id, e.date, e.idea, e.bar, e.variants, e.sports])).digest('hex').slice(0, 16);

export function readRegister(file = PREREG_FILE) {
  try {
    const f = JSON.parse(readFileSync(file, 'utf8'));
    if (f && Array.isArray(f.entries)) return f;
  } catch {
    // (none yet)
  }
  return { v: PREREG_V, entries: [] };
}

// The register with an idea added: { id, idea, bar, variants, sports?, by? }; refused (throws) on a repeated id, or
// without a bar or a variant
export function addEntry(reg, { id, idea, bar, variants, sports = [], by = null }, now = new Date()) {
  if (!id || !/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new Error(`prereg: an id of letters, digits and dashes (${id})`);
  if ((reg.entries ?? []).some((e) => e.id === id)) throw new Error(`prereg: ${id} is registered already (a changed bar or variant is a new id)`);
  if (!idea || !bar) throw new Error('prereg: the idea and its bar are both needed before any result');
  const vs = [...new Set((variants ?? []).map((v) => String(v).trim()).filter(Boolean))];
  if (!vs.length) throw new Error('prereg: at least one variant');
  const e = { id, date: now.toISOString(), by, idea, bar, variants: vs, sports, results: [] };
  return { v: PREREG_V, entries: [...(reg.entries ?? []), { ...e, hash: hashOf(e) }] };
}

// The register with a result added to a registered idea's registered variant (throws otherwise, or where the entry's
// text no longer matches its hash: its bar or variants edited after it was registered)
export function addResult(reg, id, variant, text, now = new Date()) {
  const e = (reg.entries ?? []).find((x) => x.id === id);
  if (!e) throw new Error(`prereg: ${id} was never registered: register its bar and variants first`);
  if (hashOf(e) !== e.hash) throw new Error(`prereg: ${id}'s bar or variants changed after it was registered`);
  if (!e.variants.includes(variant)) throw new Error(`prereg: ${id} registered ${e.variants.join(', ')}, not ${variant}: a new variant is a new id`);
  if (Date.parse(e.date) > now.getTime()) throw new Error(`prereg: ${id}'s result dated before its registration`);
  return { ...reg, entries: reg.entries.map((x) => (x === e ? { ...x, results: [...x.results, { date: now.toISOString(), variant, text }] } : x)) };
}

// (an entry's text intact: its hash still its own)
export const intact = (e) => hashOf(e) === e.hash;

function main() {
  const args = process.argv.slice(2);
  const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const cmd = args[0];
  const reg = readRegister();
  if (cmd === 'add') {
    const next = addEntry(reg, { id: val('--id'), idea: val('--idea'), bar: val('--bar'), variants: String(val('--variants') ?? '').split('|'), sports: String(val('--sports') ?? '').split(',').filter(Boolean), by: val('--by') ?? null });
    writeFileSync(PREREG_FILE, `${JSON.stringify(next, null, 1)}\n`);
    console.log(`registered ${val('--id')} (${next.entries.at(-1).hash})`);
  } else if (cmd === 'result') {
    const next = addResult(reg, val('--id'), val('--variant'), val('--text') ?? '');
    writeFileSync(PREREG_FILE, `${JSON.stringify(next, null, 1)}\n`);
    console.log(`result for ${val('--id')} ${val('--variant')} recorded`);
  } else {
    const id = args[1];
    for (const e of reg.entries.filter((x) => !id || x.id === id)) console.log(`${e.id} (${e.date.slice(0, 10)}${intact(e) ? '' : ', EDITED after registration'}): ${e.idea}\n  bar: ${e.bar}\n  variants: ${e.variants.join(' | ')}${e.results.length ? `\n  results: ${e.results.map((r) => `${r.variant}: ${r.text}`).join('; ')}` : ''}`);
    if (!existsSync(PREREG_FILE)) console.log('(no register yet)');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
