// The bet ticket on a phone (bet-slip.component.html/.ts, slip-sheet.ts): the stub's Expand (a chevron up)
// raises the sheet, the sheet's chevron down minimizes it back to the stub with the bets kept, and a tap
// outside the open sheet minimizes it too, except a tap on the sheet, the stub, a price being added or the
// login. The desktop's docked ticket is untouched: the rule is off from the docking width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadEngine } from './support/engine.mjs';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const wallet = 'libs/ranker/src/engine/account/wallet';
const html = read(`${wallet}/bet-slip.component.html`);
const ts = read(`${wallet}/bet-slip.component.ts`);
const w = await loadEngine('nfl', { entry: path.join(import.meta.dirname, 'support/wallet-entry.ts'), data: {} });

// (a fake pointerdown target: an element whose closest matches the selectors in its ancestry's class list)
const el = (...classes) => ({ closest: (selector) => (selector.split(',').some((s) => classes.includes(s.trim().slice(1))) ? {} : null) });

test('the stub reads Expand with a chevron up, and expands the sheet', () => {
  const stub = html.match(/<button[^>]*class="stub-review"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(stub, 'the stub has its Expand');
  assert.match(stub[0], /\(click\)="expand\(\)"/);
  assert.match(stub[1], /^Expand</, 'labelled Expand');
  assert.match(stub[1], /fontIcon="expand_less"/, 'a chevron up');
  assert.doesNotMatch(html, /review<\/button>/, 'no "review" left');
  assert.match(ts, /expand\(\): void \{\s*this\.wallet\.slipOpen\.set\(true\);/);
});

test('the sheet\'s X is a minimize chevron: the sheet down to the stub, the bets kept', () => {
  const close = html.match(/<button[^>]*class="ticket-close"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(close, /aria-label="Minimize the ticket"/);
  assert.match(close, /fontIcon="expand_more"/);
  assert.match(close, /\(click\)="minimize\(\)"/);
  // (minimize only shuts the sheet: no clearSlip, no remove)
  const body = ts.match(/minimize\(\): void \{([\s\S]*?)\n  \}/)[1];
  assert.match(body, /slipOpen\.set\(false\)/);
  assert.doesNotMatch(body, /clearSlip|remove\(/);
  // (Escape minimizes too, and the outside tap listens on the document's pointerdown)
  assert.match(ts, /keydown\.escape'\)\s*escape\(\): void \{[^}]*this\.minimize\(\)/);
  assert.match(ts, /@HostListener\('document:pointerdown', \['\$event'\]\)\s*tapped\(/);
  assert.doesNotMatch(ts, /\bclose\(\)/, 'the old close is gone');
});

test('a tap outside the open sheet minimizes it on a phone, not on the sheet, the stub, a price or the login', () => {
  const phone = 390;
  assert.equal(w.tapMinimizes(el('book-page'), true, phone), true, 'the board behind the sheet');
  assert.equal(w.tapMinimizes(el('bet-row', 'book-page'), true, phone), true, 'a row\'s words');
  assert.equal(w.tapMinimizes(null, true, phone), true, 'the document itself');
  assert.equal(w.tapMinimizes({}, true, phone), true, 'a target with no closest');
  assert.equal(w.tapMinimizes(el('leg-remove', 'ticket'), true, phone), false, 'inside the sheet');
  assert.equal(w.tapMinimizes(el('stub-review', 'ticket-stub'), true, phone), false, 'the stub');
  assert.equal(w.tapMinimizes(el('bet-price'), true, phone), false, 'a board price (the click adds the bet, the sheet stays)');
  assert.equal(w.tapMinimizes(el('tile-price'), true, phone), false, 'a game\'s line tile');
  assert.equal(w.tapMinimizes(el('login-panel'), true, phone), false, 'the login dialog');
  // (minimized already: nothing to do; the docked ticket from 1000px: never)
  assert.equal(w.tapMinimizes(el('book-page'), false, phone), false);
  assert.equal(w.tapMinimizes(el('book-page'), true, 999), true);
  assert.equal(w.tapMinimizes(el('book-page'), true, 1000), false);
  assert.equal(w.tapMinimizes(el('book-page'), true, 1440), false);
  assert.equal(w.SHEET_BELOW, 1000);
  // (the stylesheet docks the ticket at the same width)
  assert.match(read('libs/ranker/src/styles/_variables.scss'), /\$bp-wide-menu: 1000px;/);
  assert.match(read('libs/ranker/src/styles/components/wallet-slip.scss'), /@media \(max-width: #\{v\.bp\(wide-menu\) - 1px\}\) \{\s*\.ticket \{/);
  // (the price buttons the rule spares are the ones the templates draw)
  assert.match(read('libs/ranker/src/engine/book/book-page.component.html'), /class="bet-price"[^>]*\(click\)="takeRow\(/);
  assert.match(read(`${wallet}/game-lines.component.html`), /class="tile-price"/);
  assert.match(read(`${wallet}/../login-dialog.component.html`), /class="login-panel"/);
});

// The placed note (the owner's bugs, 2026-10-17: it never went away, so no more bets; the ticket looked out of
// place on the wallet page): a close X (aria-label Close) clears it, a new price clears it (wallet.toggle), no
// timer; the ticket isn't on the wallet page at all, the Book's alone.
test('the placed note closes on its X or a new price, and the ticket is the Book\'s alone', () => {
  const notes = html.match(/placed\. <a href="\/wallet">See them in your wallet<\/a><button type="button" class="ticket-close" aria-label="Close" title="Close" \(click\)="closePlaced\(\)">/g) ?? [];
  assert.equal(notes.length, 2, 'the ticket\'s note and the stub\'s');
  assert.match(ts, /closePlaced\(\): void \{\s*this\.wallet\.placed\.set\(null\)/);
  assert.doesNotMatch(ts, /setTimeout\([^)]*placed/, 'no auto-dismiss');
  assert.doesNotMatch(read(`${wallet}/wallet-page.component.html`), /<bet-slip/);
  assert.match(read('libs/ranker/src/engine/book/book-page.component.html'), /<bet-slip><\/bet-slip>/);
  assert.match(read(`${wallet}/wallet.service.ts`), /toggle\(sel[\s\S]*?this\.placed\.set\(null\);\s*this\.slip\.update/, 'a new price clears the note');
});
