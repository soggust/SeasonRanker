// A component stylesheet's animations are set where Angular can scope them. With emulated encapsulation Angular
// renames a component's @keyframes (ticker-slide -> _ngcontent-xxx_ticker-slide) and rewrites the `animation`
// declarations that name them, but NOT a declaration nested under a @media block: that one keeps the bare name,
// points at a keyframe that no longer exists, and never runs. The Book's ticker shipped still that way
// (2026-10-17), with the wallet's ticket blink and the grid's isolate chip. So: in every stylesheet a component
// loads through styleUrls, an animation whose keyframes are declared in that file is never set inside a @media.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'libs/ranker/src');

const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith('.ts')) out.push(p);
  }
  return out;
};

// (the stylesheets components load, and whether the component keeps the default (emulated) encapsulation)
function componentStyles() {
  const sheets = new Map();
  for (const file of walk(SRC)) {
    const ts = fs.readFileSync(file, 'utf8');
    if (!/@Component\(/.test(ts)) continue;
    const none = /encapsulation:\s*ViewEncapsulation\.None/.test(ts);
    for (const m of ts.matchAll(/styleUrls?:\s*\[?\s*'([^']+\.scss)'/g)) {
      const sheet = path.resolve(path.dirname(file), m[1]);
      if (fs.existsSync(sheet)) sheets.set(sheet, (sheets.get(sheet) ?? true) && !none);
    }
  }
  return sheets;
}

// (the animation names set inside a @media block: a cheap scan of the nesting, enough for the house style)
function animationsUnderMedia(scss) {
  const out = [];
  const lines = scss.split(/\r?\n/);
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    const m = line.match(/^\s*animation(?:-name)?:\s*([a-zA-Z_][\w-]*)/);
    if (m && stack.some((s) => s.media) && !['none', 'inherit', 'initial', 'unset'].includes(m[1])) out.push({ name: m[1], line: i + 1 });
    for (let k = 0; k < opens; k++) stack.push({ media: /@media/.test(line) });
    for (let k = 0; k < closes; k++) stack.pop();
  }
  return out;
}

test("a component stylesheet never sets a scoped animation inside a @media (Angular wouldn't rename it)", () => {
  const sheets = componentStyles();
  assert.ok(sheets.size >= 3, 'component stylesheets found');
  const bad = [];
  for (const [sheet, scoped] of sheets) {
    if (!scoped) continue;
    const scss = fs.readFileSync(sheet, 'utf8');
    const keyframes = new Set([...scss.matchAll(/@keyframes\s+([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
    for (const { name, line } of animationsUnderMedia(scss)) if (keyframes.has(name)) bad.push(`${path.relative(ROOT, sheet)}:${line} animation: ${name}`);
  }
  assert.deepEqual(bad, [], 'set the animation outside the @media and stop it under prefers-reduced-motion: reduce instead');
});
