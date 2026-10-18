// The browser tab's icon (favicon.ts applyFavicon, app.component.ts markBookView): the Book swaps in its casino
// chip, the shared pages the site's own mark, and the way back to a sport's rankings puts the sport's own icon
// (index.html's links, their href, type and sizes) back exactly; the PWA manifest is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const f = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support', 'favicon-entry.ts'), data: {} });
const ROOT = path.join(import.meta.dirname, '..');

// (a page's head, as much of it as the swap reads: its link elements' attributes)
function fakeLink(attrs) {
  const a = new Map(Object.entries(attrs));
  return {
    a,
    getAttribute: (k) => (a.has(k) ? a.get(k) : null),
    setAttribute: (k, v) => a.set(k, String(v)),
    hasAttribute: (k) => a.has(k),
    removeAttribute: (k) => a.delete(k),
  };
}
function fakeHead() {
  const links = [
    fakeLink({ rel: 'icon', type: 'image/svg+xml', href: 'favicon.svg' }),
    fakeLink({ rel: 'icon', type: 'image/x-icon', href: 'favicon.ico', sizes: '16x16 32x32 48x48' }),
    fakeLink({ rel: 'apple-touch-icon', href: 'apple-touch-icon.png' }),
  ];
  const manifest = fakeLink({ rel: 'manifest', href: 'manifest.webmanifest' });
  const doc = {
    querySelectorAll: (sel) => {
      assert.ok(!/manifest/.test(sel), 'the manifest is not among the links swapped');
      return links;
    },
  };
  return { doc, links, manifest };
}
const snapshot = (links) => links.map((l) => Object.fromEntries([...l.a].filter(([k]) => !k.startsWith('data-'))));

test('faviconFor: the sport\'s own on the rankings, the chip on the Book, the site\'s mark on every shared page', () => {
  assert.equal(f.faviconFor('rankings'), null);
  assert.equal(f.faviconFor('book'), 'assets/book-chip.svg');
  for (const v of ['account', 'user', 'lists', 'community', 'tracker', 'wallet', 'friends', 'privacy', 'data-deletion']) {
    assert.equal(f.faviconFor(v), 'assets/brand-mark.svg', v);
  }
});

test('applyFavicon: entering the Book swaps every icon link to the chip, leaving puts the sport\'s back exactly', () => {
  const { doc, links } = fakeHead();
  const before = snapshot(links);
  f.applyFavicon(doc, 'rankings');
  assert.deepEqual(snapshot(links), before, 'the rankings leave the sport\'s icons as they were');
  f.applyFavicon(doc, 'book');
  for (const l of links) {
    assert.equal(l.getAttribute('href'), 'assets/book-chip.svg');
    assert.equal(l.getAttribute('type'), 'image/svg+xml');
    assert.equal(l.getAttribute('sizes'), null);
  }
  f.applyFavicon(doc, 'wallet');
  for (const l of links) assert.equal(l.getAttribute('href'), 'assets/brand-mark.svg');
  f.applyFavicon(doc, 'book');
  f.applyFavicon(doc, 'rankings');
  assert.deepEqual(snapshot(links), before, 'back on the rankings: href, type and sizes as index.html had them');
});

test('applyFavicon: a direct landing on a shared page, then the way to the rankings, restores the sport\'s icon', () => {
  const { doc, links } = fakeHead();
  const before = snapshot(links);
  f.applyFavicon(doc, 'privacy');
  assert.equal(links[0].getAttribute('href'), 'assets/brand-mark.svg');
  f.applyFavicon(doc, 'rankings');
  assert.deepEqual(snapshot(links), before);
});

test('the icons ship, and the app swaps them on every view change', () => {
  for (const file of ['book-chip.svg', 'brand-mark.svg']) {
    const svg = fs.readFileSync(path.join(ROOT, 'libs/ranker/src/assets', file), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/, file);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'libs/ranker/src/assets/book-chip.svg'), 'utf8'), /#d2691e/i, 'the Book\'s clay');
  const app = fs.readFileSync(path.join(ROOT, 'libs/ranker/src/engine/app.component.ts'), 'utf8');
  const mark = app.slice(app.indexOf('private markBookView'));
  assert.match(mark.slice(0, mark.indexOf('\n  }')), /applyFavicon\(document, this\.view\)/);
});
