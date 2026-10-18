// The Book's right column on a wide screen (book-page.component.html, bet-slip.component.html, book-page.scss,
// wallet-slip.scss): the recent form on top and the empty ticket under it; with a bet on the ticket, the ticket
// takes the column's full height over the form (the form hidden, back once the ticket's emptied), a flex column
// whose bets scroll in its body between the pinned head and foot, rising in once (none with reduced motion).
// Phones keep the stub and the sheet: the body is in the ticket's flow there as it always was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('libs/ranker/src/engine/book/book-page.component.html');
const slip = read('libs/ranker/src/engine/account/wallet/bet-slip.component.html');
const pageCss = read('libs/ranker/src/styles/components/book-page.scss');
const slipCss = read('libs/ranker/src/styles/components/wallet-slip.scss');

// (a top-level block of a stylesheet by its opening line, up to its matching close)
const block = (css, opener) => {
  const at = css.indexOf(opener);
  assert.ok(at >= 0, `has ${opener}`);
  let depth = 0;
  for (let i = at + opener.lastIndexOf('{'); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return css.slice(at);
};
const wide = (css, marker) => {
  const blocks = css.split('@include v.up(wide-menu) {').slice(1).map((rest) => block('@include v.up(wide-menu) {' + rest, '@include v.up(wide-menu) {'));
  const hit = blocks.find((b) => b.includes(marker));
  assert.ok(hit, `a wide-screen block with ${marker}`);
  return hit;
};

test('the right column: the recent form on top, the ticket under it', () => {
  const side = page.slice(page.indexOf('<aside class="book-side"'), page.indexOf('</aside>', page.indexOf('<aside class="book-side"')));
  const form = side.indexOf('<section class="recent-form"');
  const ticket = side.indexOf('<bet-slip></bet-slip>');
  assert.ok(form > 0 && ticket > 0, 'both in the column');
  assert.ok(form < ticket, 'the form before the ticket');
  assert.equal(page.match(/<bet-slip>/g).length, 1, 'one ticket');
  assert.match(page, /\[class\.has-ticket\]="wallet\.slip\(\)\.length > 0"/);
});

test('a bet on the ticket: it takes the column, the form hidden, the column still', () => {
  const css = wide(pageCss, '.book-page.has-ticket');
  const hasTicket = block(css, '.book-page.has-ticket {');
  assert.match(block(hasTicket, '.recent-form {'), /display: none/);
  assert.match(block(hasTicket, '.book-side {'), /overflow: hidden/);
  const host = block(hasTicket, 'bet-slip {');
  assert.match(host, /flex: 1 1 0/);
  assert.match(host, /min-height: 0/);
});

test('the full ticket: head and foot pinned, the bets scrolling in its body', () => {
  assert.match(slip, /<aside #panel class="ticket" \[class\.full\]="wallet\.slip\(\)\.length > 0"/);
  const body = slip.indexOf('<div class="ticket-body">');
  assert.ok(body > slip.indexOf('</header>'), 'the body after the head');
  assert.ok(body < slip.indexOf('<ol class="ticket-legs">'), 'the bets in the body');
  assert.ok(slip.indexOf('ticket-empty') < slip.indexOf('<footer class="ticket-foot">'));
  const close = slip.lastIndexOf('</div>', slip.indexOf('<footer class="ticket-foot">'));
  assert.ok(close > slip.indexOf('ticket-empty'), 'the body closed before the foot');

  assert.match(block(slipCss, '.ticket-body {'), /display: contents/, 'in the flow as it was, off the full ticket');
  const css = wide(slipCss, '.ticket.full');
  assert.match(block(css, ':host {'), /flex-direction: column/);
  const full = block(css, '.ticket.full {');
  assert.match(full, /min-height: 0/);
  assert.match(full, />\s*\.ticket-foot[\s\S]*?flex: none/, 'the foot pinned');
  const scroller = block(full, '.ticket-body {');
  for (const rule of [/display: flex/, /flex: 1 1 auto/, /min-height: 0/, /overflow-y: auto/, /chip\.gold-scrollbar/]) assert.match(scroller, rule);
  assert.match(block(slipCss, '.ticket-mode {'), /flex: none/, 'the Straight / Parlay switch keeps its height in a scroller');
  assert.match(full, /animation: ticket-full/, 'it rises in');
  assert.match(slipCss, /@keyframes ticket-full/);
  assert.match(block(slipCss, '@media (prefers-reduced-motion: reduce) {'), /\.ticket\.full \{\s*animation: none/);
});

test('phones unchanged: the full ticket and the column rules are wide-screen only', () => {
  const phone = block(slipCss, '@media (max-width: #{v.bp(wide-menu) - 1px}) {');
  assert.doesNotMatch(phone, /\.full/);
  assert.match(phone, /\.ticket-stub \{/);
});
