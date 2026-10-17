// The Book names no sportsbook (the owner, 2026-10-17: "remove DK branding everywhere, even if we use them"): the
// desk keeps its pricing from the book BOOK names in libs/ranker/scripts/model/leagues.mjs, but nothing a user
// reads says which one, nor names the sharp book its fair prices are anchored on. Every user-facing source file
// (the library's and the apps' templates, styles and TypeScript, the README and the About pages) is read with its
// comments taken out and must not name either book; the scripts, the data and the tests are theirs to name.
// A bare book key as data (`book: 'DraftKings'`, a provider match on 'draftkings') is allowed: the templates
// render it as "Book".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const ROOTS = ['libs/ranker/src', ...fs.readdirSync(path.join(root, 'apps')).map((a) => `apps/${a}/src`)];
const EXT = new Set(['.ts', '.html', '.scss', '.md']);
const NAMES = /DraftKings|Draft Kings|\bDK\b|Pinnacle/;

function* files(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (EXT.has(path.extname(e.name)) && !e.name.endsWith('.spec.ts')) yield p;
  }
}

// (the text a user could meet: comments out, and a bare quoted book key, which is data)
function userFacing(file, text) {
  const ext = path.extname(file);
  let s = text;
  if (ext === '.ts' || ext === '.scss') s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  if (ext === '.html') s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s.replace(/'draftkings'/gi, "'book'");
}

test('no user-facing file names the book or the sharp book', () => {
  const hits = [];
  for (const r of ROOTS) {
    const dir = path.join(root, r);
    if (!fs.existsSync(dir)) continue;
    for (const f of files(dir)) {
      const s = userFacing(f, fs.readFileSync(f, 'utf8'));
      const lines = s.split(/\r?\n/);
      lines.forEach((l, i) => {
        if (NAMES.test(l)) hits.push(`${path.relative(root, f)}:${i + 1}: ${l.trim().slice(0, 120)}`);
      });
    }
  }
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  if (NAMES.test(readme)) hits.push('README.md names a book');
  assert.deepEqual(hits, [], 'book names in user-facing files:\n' + hits.join('\n'));
});

test('the desk still prices from a named book: the key stays in the scripts', () => {
  const leagues = fs.readFileSync(path.join(root, 'libs/ranker/scripts/model/leagues.mjs'), 'utf8');
  assert.match(leagues, /BOOK\s*=\s*'draftkings'/);
});
