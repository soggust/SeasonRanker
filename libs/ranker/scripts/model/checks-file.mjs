// The CHECKs' own file (model/checks.json, { sport, checks }: checks.mjs) read and split from the ledger, apart
// from run.mjs so the tests can use them without the run's environment (run.mjs loads .env and the keys)
//
//   read        readChecks: the file's list; none there yet, an older ledger's own (ledger.checks, which the
//               next write moves to the file); each one's owner's note as the public file may keep it
//               (notes.mjs publicNote: an older file's words and writer dropped on the next write)
//   unreadable  a file there but not JSON, or no list of checks: warned of once (a GitHub warning, in the
//               Action's summary), the ledger's own or none, and r.checksUnreadable set. While it's set the run
//               leaves everything the CHECKs feed as it was (run.mjs): no CHECK recorded into the list, the
//               file never written over, the ledger's own list kept on it (ledgerWrites), the state's tally
//               and picks.json's list the last good ones, the CHECKs' write-ups not pruned (picks.mjs
//               buildPicks keepChecks); so a truncated file loses nothing till a person mends it
//   written     ledgerWrites: the ledger without its CHECKs (the ledger the wallet and the Algorithm tab fetch
//               keeps its old shape and size), the CHECKs apart, the graded ones' bulk trimmed (checkTrim),
//               every note publicNote's fields alone
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkTrim } from './checks.mjs';
import { publicNote } from './notes.mjs';

// (a committed file the run builds on (the ledger, the state, the history): missing, a fresh start; there
// but unreadable, the sport stops, rather than a fresh one being written over it)
export function readKept(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

// The CHECKs, from their own file (r.files.checks), else the ledger's own; an unreadable file flagged
// (r.checksUnreadable), never thrown
export function readChecks(r, ledger) {
  let list = null;
  try {
    const kept = readKept(r.files.checks, null);
    if (kept !== null && !Array.isArray(kept?.checks)) throw new Error('no list of checks');
    list = kept?.checks ?? null;
  } catch (err) {
    if (!r.checksUnreadable) console.warn(`::warning::${r.sport}: ${path.basename(r.files.checks)} unreadable (${String(err?.message ?? err).slice(0, 120)}): no CHECKs recorded this run; the file, the CHECKs' tally, list and write-ups left as they are till it's mended`);
    r.checksUnreadable = true;
  }
  return publicChecks((list ?? ledger?.checks ?? []).filter((c) => c && typeof c === 'object'));
}

// (the CHECKs as the public file keeps them: each note publicNote's fields alone)
export function publicChecks(checks) {
  for (const c of checks) if (c.note) c.note = publicNote(c.note);
  return checks;
}

// The ledger's two files as they're written: { ledger, checks } (checks null: checks.json not written). An
// unreadable checks file (r.checksUnreadable) never written over, and the ledger's own list (an older
// ledger's, read as the fallback) kept on the ledger till it is mended
export function ledgerWrites(r, ledger) {
  const { checks = [], ...bets } = ledger;
  checkTrim(checks, r.now);
  publicChecks(checks);
  if (r.checksUnreadable) return { ledger: checks.length ? { ...bets, checks } : bets, checks: null };
  return { ledger: bets, checks: checks.length || existsSync(r.files.checks) ? { sport: r.sport, checks } : null };
}
