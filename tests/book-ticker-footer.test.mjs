// The Book's ticker as the page's footer and the recent form off a phone (the owner's notes, 2026-10-19):
// the strip out of the content column, after the page, edge to edge along the screen's foot; the ticket's stub
// and sheet standing on it under the docking width (--book-foot); no strip and no recent form on a phone; and
// "tear up ticket" bold in Nunito in the picks' oxblood.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = read('libs/ranker/src/engine/book/book-page.component.html');
const scss = read('libs/ranker/src/styles/components/book-page.scss');
const slip = read('libs/ranker/src/styles/components/wallet-slip.scss');
const block = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head);
  let d = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) return src.slice(at, i + 1);
  }
  return '';
};

test('the ticker sits after the page, at the host, not under the header', () => {
  const page = html.indexOf('<div class="book-page"');
  const ticker = html.indexOf('<div class="book-ticker"');
  const head = html.indexOf('</header>');
  const modal = html.indexOf('<game-view>');
  assert.ok(ticker > head && ticker < modal);
  // (the page's div closed before it: its last line before the ticker's comment is the page's close)
  assert.match(html.slice(page, ticker), /\n<\/div>\n<!-- The ticker/);
  assert.match(html, /@if \(tickerShown\) \{\n  <div class="book-ticker"/);
  assert.match(html, /\[class\.ticker-on\]="tickerShown"/);
});

test('the host is a column, the page fills it, the strip stays at the foot full width', () => {
  assert.match(block(scss, ':host {'), /display: flex;\s*flex-direction: column;/);
  const t = block(scss, '.book-ticker {');
  assert.match(t, /position: sticky;/);
  assert.match(t, /bottom: 0;/);
  assert.match(t, /width: 100%;/);
  assert.match(t, /env\(safe-area-inset-bottom\)/);
  assert.match(scss, /\.book-page\.ticker-on \{\s*--book-foot: calc\(30px \+ env\(safe-area-inset-bottom\)\);/);
});

test("the ticket's stub and sheet stand on the strip", () => {
  assert.match(block(slip, '  .ticket {'), /bottom: var\(--book-foot, 0px\);/);
  assert.match(block(slip, '  .ticket-stub {'), /bottom: var\(--book-foot, 0px\);/);
});

test('a phone: no strip, no recent form, nothing to stand on', () => {
  const at = scss.indexOf('@include v.down(ai-narrow) {\n  .book-ticker {');
  const phone = block(scss.slice(at), '@include v.down(ai-narrow) {');
  assert.match(phone, /\.book-ticker \{\s*display: none;/);
  assert.match(phone, /--book-foot: 0px;/);
  assert.match(scss, /@include v\.down\(ai-narrow\) \{\s*\.recent-form \{\s*display: none;/);
});

test('"tear up ticket" bold, in Nunito, in the picks\' oxblood', () => {
  assert.match(slip, /\$ink-pick: #7a1f14;/);
  assert.match(block(slip, '  .leg-pick {'), /color: \$ink-pick;/);
  const tear = block(slip, '.ticket-tear {');
  assert.match(tear, /color: \$ink-pick;/);
  assert.match(tear, /font-family: v\.\$font-base;/);
  assert.match(tear, /font-weight: 700;/);
});
