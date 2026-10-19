// Best Bets' board (book-page.component.html/.ts, book-page.scss): no "Off the board" fold (the passes and fades
// show only as a game's own lines' PASS / FADE tags), one centred line when nothing favorable is on it (no LOCK,
// LOVE or LIKE; an admin's CHECKs don't count and stay under it), the ticker with no rim, and the views' bar as the game dropdown's pill.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const html = read('libs/ranker/src/engine/book/book-page.component.html');
const ts = read('libs/ranker/src/engine/book/book-page.component.ts');
const scss = read('libs/ranker/src/styles/components/book-page.scss');
const book = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'book-entry.ts'), data: {} });

test('no off-the-board fold anywhere on Best Bets: its markup, members and styles gone', () => {
  for (const gone of [/offBoard/, /offCounts/, /off-words/, /Off the board/, /class="band off"/]) {
    assert.doesNotMatch(html, gone);
    assert.doesNotMatch(ts, gone);
  }
  assert.doesNotMatch(scss, /off-words|&\.off \{/);
  assert.match(html, /@if \(sections\.length\) \{\s*<li class="game-picks"/, "a game's picks section only with picks in its bands");
});

test('favorable: a LOCK, LOVE or LIKE; a CHECK, a pass or a fade is not', () => {
  for (const g of ['lock', 'love', 'like']) assert.equal(book.favorableGrade(g), true, g);
  for (const g of ['check', 'pass', 'fade', null, undefined]) assert.equal(book.favorableGrade(g), false, String(g));
  assert.match(ts, /get favorable\(\): boolean \{\s*return this\.shown\.some\(\(r\) => favorableGrade\(this\.grade\(r\)\)\);/);
});

test('nothing favorable: one centred line and a smaller one, the CHECK bands still under it', () => {
  const at = html.indexOf('@if (!favorable) {');
  assert.ok(at > 0);
  const empty = html.slice(at, html.indexOf('</li>', at));
  assert.match(empty, /class="board-empty"/);
  assert.match(empty, /No favorable bets right now/);
  assert.match(empty, /The Bot checks every hour; pick a game in the dropdown to bet any line yourself\./);
  assert.ok(html.indexOf('bandList; context', at) > at, 'the bands (an admin\'s CHECKs) after it');
  assert.equal(html.match(/No favorable bets right now/g).length, 2, 'and the same line with no picks at all');
  assert.doesNotMatch(html, /picks right now: the algorithm posts/);
  const css = scss.slice(scss.indexOf('.board-empty {'));
  assert.match(css, /text-align: center/);
  assert.match(css, /\.empty-title \{[^}]*rgba\(255, 255, 255, 0\.72\)/);
});

test('the ticker: the scoreboard face, no rim along its top or bottom', () => {
  const at = scss.indexOf('.book-ticker {');
  const rule = scss.slice(at, scss.indexOf('\n}', at));
  assert.match(rule, /scoreboard-panel\(0, none\)/);
  assert.match(rule, /border: none;/);
  assert.doesNotMatch(rule, /felt-gold|border-width/);
});

test('the views\' bar: the game dropdown\'s player-card pill, the chosen tab washed gold, hover lighter not gold', () => {
  const at = scss.indexOf('.book-views {');
  const rule = scss.slice(at, scss.indexOf('\n}', at));
  assert.match(rule, /@include chip\.player-card\(v\.\$radius-pill\)/);
  assert.match(rule, /height: 44px/);
  assert.doesNotMatch(rule, /scoreboard-panel|overflow: hidden/);
  const hover = rule.match(/&:hover:not\(\.active\) \{([^}]*)\}/);
  assert.ok(hover && /rgba\(255, 255, 255/.test(hover[1]) && !/gold|scoreboard-led/.test(hover[1]), 'lighter on hover, not gold');
  const active = rule.match(/&\.active \{([^}]*)\}/);
  assert.ok(active && /@include glow/.test(active[1]) && /chip\.\$gold-led/.test(active[1]));
});

test('the ticket\'s title in Outfit at 2px, on the slip, the wallet\'s stubs and the corkboard; the rest Plex Mono', () => {
  const slip = read('libs/ranker/src/styles/components/wallet-slip.scss');
  const wallet = read('libs/ranker/src/styles/components/wallet-page.scss');
  const rule = (css, opener) => css.slice(css.indexOf(opener), css.indexOf('}', css.indexOf(opener)));
  for (const r of [rule(slip, '.ticket-brand {'), rule(wallet, '.ticket-brand {\n    display: flex;').replace(/^[\s\S]*?span \{/, ''), rule(wallet, '.wall-brand {')]) {
    assert.match(r, /font-family: v\.\$font-heading;/);
    assert.match(r, /letter-spacing: 2px;/);
  }
  assert.match(slip, /\$font-ticket: "IBM Plex Mono"/);
});
