// Known designs in the uniform tables (apps/<sport>/src/sport/uniform-eras.ts): the kits every fan knows, as the
// splash draws them, plus the cut fields every kit of a sport carries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
async function loadTs(file, tag) {
  const out = path.join(os.tmpdir(), `uniform-designs-${process.pid}-${tag}.mjs`);
  await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  const m = await import(pathToFileURL(out).href);
  rmSync(out, { force: true });
  return m;
}
const { uniformFor } = await loadTs(path.join(ROOT, 'libs/ranker/src/engine/uniform-eras.ts'), 'types');
const MLB = (await loadTs(path.join(ROOT, 'apps/mlb/src/sport/uniform-eras.ts'), 'mlb')).UNIFORM_ERAS;
const NBA = (await loadTs(path.join(ROOT, 'apps/nba/src/sport/uniform-eras.ts'), 'nba')).UNIFORM_ERAS;
const kits = (table) => Object.values(table).flatMap((eras) => eras.flatMap((e) => [e.home, e.away, e.alt].filter(Boolean)));

test('the Yankees: navy home pinstripes, no name on the back; the road gray outlined white through 2023, plain after', () => {
  const home = uniformFor(MLB, '147', 2009, 'home');
  assert.equal(home.pinstripe, '#0c2340');
  assert.equal(home.placket, 'buttons');
  assert.equal(home.collar, home.body, 'no placket piping');
  assert.equal(uniformFor(MLB, '147', 2023, 'away').outline, '#ffffff');
  assert.equal(uniformFor(MLB, '147', 2023, 'away').sleeve, 'stripes');
  assert.equal(uniformFor(MLB, '147', 2024, 'away').outline, '#0c2340');
  assert.equal(uniformFor(MLB, '147', 2024, 'away').sleeve, 'none');
  assert.equal(uniformFor(MLB, '147', 2010, 'alt').body, home.body, 'no alternate: the alt falls back to the home');
  // (no names on the back, home or road, in any era; the photographed back is drawn without the arched name)
  for (const season of [2000, 2009, 2023, 2026]) for (const kit of ['home', 'away']) assert.equal(uniformFor(MLB, '147', season, kit).names, false, `${season} ${kit}`);
  assert.equal(uniformFor(MLB, '111', 2018, 'home').names, false, 'the Red Sox at home');
  assert.notEqual(uniformFor(MLB, '111', 2018, 'away').names, false, 'the Red Sox on the road');
  assert.equal(uniformFor(MLB, '116', 2018, 'home').names, false, 'the Tigers at home');
  const tpl = readFileSync(path.join(ROOT, 'libs/ranker/src/engine/player-card/splash/splash.component.html'), 'utf8');
  const nameBlock = tpl.indexOf('class="sp-j-name"');
  const guard = tpl.lastIndexOf('@if (k.names !== false)', nameBlock);
  assert.ok(guard > 0 && nameBlock - guard < 200, 'the back name is guarded by the kit');
  // (the photographed bases are all backs: no placket, wordmark or front number drawn on them)
  const photo = tpl.slice(tpl.indexOf('@if (ja; as a)'), tpl.indexOf('} @else {', tpl.indexOf('@if (ja; as a)')));
  for (const front of ['a.placket', 'sp-j-mark', 'sp-j-front', 'a.buttons']) assert.ok(!photo.includes(front), `${front} on a photographed back`);
});

test('the Dodgers: blue script, a red front number, plain white; the Reds of 2003 a pinstriped vest', () => {
  const home = uniformFor(MLB, '119', 2015, 'home');
  assert.equal(home.name, '#005a9c');
  assert.equal(home.num, '#ef3e42');
  assert.equal(home.pinstripe, undefined);
  assert.equal(home.nameFont, 'rounded');
  const reds = uniformFor(MLB, '113', 2003, 'home');
  assert.equal(reds.placket, 'vest');
  assert.equal(reds.under, '#c6011f');
  assert.equal(reds.pinstripe, '#c6011f');
});

test('the audit, MLB: Cubs road red numbers, Rockies silver trim, Phillies powder alt from 2018, Red Sox road unpiped', () => {
  assert.equal(uniformFor(MLB, '112', 2016, 'away').num, '#cc3433');
  assert.equal(uniformFor(MLB, '115', 2007, 'home').outline, '#c4ced4');
  assert.equal(uniformFor(MLB, '115', 2007, 'away').pinstripe, '#33006f');
  assert.equal(uniformFor(MLB, '115', 2012, 'away').pinstripe, undefined);
  assert.equal(uniformFor(MLB, '143', 2018, 'alt').body, '#6cace4');
  assert.equal(uniformFor(MLB, '143', 2017, 'alt').body, '#ece4d0');
  assert.equal(uniformFor(MLB, '111', 2018, 'away').collar, uniformFor(MLB, '111', 2018, 'away').body);
  assert.equal(uniformFor(MLB, '142', 2015, 'home').pinstripe, '#002b5c');
  assert.equal(uniformFor(MLB, '142', 2023, 'home').pinstripe, undefined);
  assert.equal(uniformFor(MLB, '142', 2023, 'away').pinstripe, '#002b5c');
});

test('every MLB kit has a placket; a vest has its undershirt; sleeve piping names its color', () => {
  for (const k of kits(MLB)) {
    assert.ok(['buttons', 'vest'].includes(k.placket), JSON.stringify(k));
    if (k.placket === 'vest') assert.match(k.under, /^#[0-9a-f]{6}$/);
    if (k.sleeve === 'stripes') assert.match(k.stripe, /^#[0-9a-f]{6}$/, 'stripe color set');
  }
});

test('the Lakers: gold at home with purple numbers, a V-neck and no side panels', () => {
  const home = uniformFor(NBA, 'LAL', 2010, 'home');
  assert.equal(home.body, '#fdb927');
  assert.equal(home.num, '#552583');
  assert.equal(home.collarStyle, 'v');
  assert.equal(home.panel, undefined);
  assert.equal(uniformFor(NBA, 'LAL', 2024, 'home').body, '#fdb927');
});

test('the Celtics: green with white trim on the road, no alternate before 2006, a green-lettered black Statement', () => {
  const away = uniformFor(NBA, 'BOS', 2008, 'away');
  assert.equal(away.body, '#007a33');
  assert.equal(away.num, '#f3f2ee');
  assert.equal(away.stripe, '#f3f2ee');
  assert.equal(away.panel, undefined);
  assert.equal(uniformFor(NBA, 'BOS', 2005, 'alt').body, '#f3f2ee', 'no alt: falls back to the home');
  assert.equal(uniformFor(NBA, 'BOS', 2024, 'alt').num, '#007a33');
});

test('the Spurs: black and silver; the silver alternate only from 2013, SATX black 2023-25', () => {
  const away = uniformFor(NBA, 'SAS', 2014, 'away');
  assert.equal(away.body, '#111111');
  assert.equal(away.outline, '#c4ced4');
  assert.equal(uniformFor(NBA, 'SAS', 2014, 'alt').body, '#c4ced4');
  assert.equal(uniformFor(NBA, 'SAS', 2012, 'alt').body, '#f3f2ee', 'no alt yet');
  assert.equal(uniformFor(NBA, 'SAS', 2024, 'alt').body, '#111111');
});

test('the audit, NBA: pinstripes where worn, the Pistons\' red numbers, Dallas royal, a round Nike collar', () => {
  assert.equal(uniformFor(NBA, 'CHO', 2002, 'home').pinstripe, '#1d1160');
  assert.equal(uniformFor(NBA, 'CHO', 2022, 'home').pinstripe, '#1d1160');
  assert.equal(uniformFor(NBA, 'ORL', 2012, 'home').pinstripe, '#c4ced4');
  assert.equal(uniformFor(NBA, 'ORL', 2021, 'away').body, '#111111');
  assert.equal(uniformFor(NBA, 'DET', 2004, 'home').num, '#c8102e');
  assert.equal(uniformFor(NBA, 'DET', 2019, 'home').num, '#1d42ba');
  assert.equal(uniformFor(NBA, 'DAL', 2011, 'away').body, '#00538c');
  assert.equal(uniformFor(NBA, 'MIA', 2010, 'home').collarStyle, 'round');
  assert.equal(uniformFor(NBA, 'DET', 2010, 'home').collarStyle, 'v');
  assert.equal(uniformFor(NBA, 'CHI', 2022, 'home').collarStyle, 'round');
  assert.equal(uniformFor(NBA, 'CHI', 2022, 'alt').pinstripe, '#333333');
  assert.equal(uniformFor(NBA, 'GSW', 2003, 'alt').body, '#f3f2ee', 'no alt yet');
  assert.equal(uniformFor(NBA, 'NYK', 2024, 'alt').body, '#0c2340');
});

test('every NBA kit has a collar style; a two-color trim keeps its inner color; panels are hexes', () => {
  for (const k of kits(NBA)) {
    assert.ok(['v', 'round'].includes(k.collarStyle), JSON.stringify(k));
    if (k.panel) assert.match(k.panel, /^#[0-9a-f]{6}$/);
    if (k.stripe2) assert.equal(k.piping, k.stripe2);
  }
});
