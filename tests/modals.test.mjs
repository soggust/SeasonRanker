// The modals (the player card, a game, Compare, the lists' and presets' dialogs, About, the login): every
// one over the whole screen, the sport bar too, the same way (_base.scss drops the bar under the page's
// layer while one is open); the filter menu never holds its dialogs inside its own box (no transform on it);
// and a dialog for a sport's own thing (a filter-menu preset, the grid saved as a list) in the sport's light,
// not the app's sand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const engine = 'libs/ranker/src/engine';

const templates = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return templates(file);
    return /\.component\.(html|ts)$/.test(entry.name) ? [file] : [];
  });

// (the dialogs that leave the page usable: a rank tile's why, a support grade's, a bet's why, the bet slip's drawer)
const NOT_MODAL = new Set(['rank-why', 'grade-why', 'bet-why', 'slip']);

test('every modal dialog is aria-modal, so the sport bar goes under it', () => {
  const css = read('libs/ranker/src/styles/_base.scss');
  const rule = css.match(/body:has\(([^)]*)\)\s*\.sport-bar\s*\{\s*z-index:\s*0 !important;/);
  assert.ok(rule, 'the sport bar drops under the page while a modal is open');
  for (const piece of ['.card-backdrop', 'list-modal', '[aria-modal="true"]']) assert.ok(rule[1].includes(piece), piece);

  const seen = [];
  for (const file of templates(engine)) {
    const source = read(file);
    for (const [tag] of source.matchAll(/<(div|aside|section)\b[^>]*\brole="dialog"[^>]*>/g)) {
      const cls = tag.match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) ?? [];
      if (cls.some((c) => NOT_MODAL.has(c))) continue;
      seen.push(file);
      assert.match(tag, /aria-modal="true"/, `${file}: a modal dialog without aria-modal`);
    }
  }
  for (const name of ['player-card', 'game-view', 'player-compare', 'about-frame', 'login-dialog', 'list-modal']) {
    assert.ok(seen.some((file) => file.includes(name)), `${name}'s dialog checked`);
  }
});

test('the filter menu has no transform: its dialogs are fixed to the screen, not to the menu', () => {
  const css = read('libs/ranker/src/styles/components/app.component.scss');
  for (const [, body] of css.matchAll(/\n\s*\.sidebar \{([^}]*)\}/g)) {
    assert.doesNotMatch(body, /\b(transform|filter|backdrop-filter|will-change|contain|perspective):/);
  }
  for (const file of ['libs/ranker/src/styles/components/sidebar.component.scss', 'libs/ranker/src/styles/components/account-presets.scss']) {
    for (const [, selector, body] of read(file).matchAll(/\n(\S[^{\n]*)\{([^}]*)\}/g)) {
      if (/^\.sidebar\s*$|\.filters\s*$|^:host\s*$/.test(selector.trim())) {
        assert.doesNotMatch(body, /(^|[^-])(transform|filter|backdrop-filter|will-change|perspective):/, `${file} ${selector}`);
      }
    }
  }
});

test("a sport's own dialogs use the sport's buttons, the account pages' the app's", () => {
  for (const file of [`${engine}/account/presets/preset-bar.component.ts`, `${engine}/account/lists/save-list-dialog.component.ts`]) {
    const source = read(file);
    assert.doesNotMatch(source, /app-btn-/, `${file}: the app's sand buttons in a sport's dialog`);
    assert.match(source, /class="primary"/, file);
  }
  // (the preset buttons beside the dropdown: the filter menu's own, like Reset and Clear All, one mixin for
  // both, and every theme's dress for those reaching them)
  const presets = read('libs/ranker/src/styles/components/account-presets.scss');
  assert.doesNotMatch(presets, /kit\.(primary|outline)-button/, "the preset buttons beside the dropdown: the menu's, not the app's");
  assert.match(presets, /\.preset-icon,\s*\.preset-update \{\s*@include v\.menu-button;/);
  assert.match(read('libs/ranker/src/styles/components/sidebar.component.scss'), /\.sidebar footer \{[^}]*button \{\s*@include v\.menu-button;/);
  const sportKit = read('libs/ranker/src/styles/_sport-kit.scss');
  assert.match(sportKit, /\$menu-buttons: "[^"]*#\{\$preset-buttons\}, #\{\$preset-buttons-hovered\}/);
  assert.match(sportKit, /\$pressed-buttons: "[^"]*#\{\$preset-buttons-hovered\}"/);
  for (const sport of ['nba', 'nhl', 'mlb', 'mma']) {
    assert.match(read(`apps/${sport}/src/theme/_sport-global.scss`), /#\{kit\.\$menu-buttons\}/, sport);
  }
  // (the presets list's Save as preset… floppy disk inside the option's text, in a span: the options' color,
  // black on a light list, white on a dark one; the divider in it too, faded, never a fixed white)
  assert.match(read(`${engine}/sidebar/sidebar.component.html`), /class="preset-save"[^>]*><span class="preset-save-icon"><mat-icon/);
  const base = read('libs/ranker/src/styles/_base.scss');
  const list = base.slice(base.indexOf('html body .mat-mdc-select-panel.preset-options'));
  assert.doesNotMatch(list.slice(0, list.indexOf('\n}')), /#fff|rgba\(255, 255, 255/);
  // (its label readable on the NBA's orange: 3:1 wants 0.8 or more of the ink)
  const label = list.match(/letter-spacing: 1\.5px !important;\s*opacity: ([\d.]+);/);
  assert.ok(label && Number(label[1]) >= 0.8, 'the MY PRESETS label: 0.8 or more');
  // (MMA's octagon cut clips the focus ring away: its buttons and dropdowns light their edge instead)
  assert.match(read('apps/mma/src/theme/_sport-global.scss'), /@mixin octagon[\s\S]*?&:focus-visible \{\s*background: \$white-text !important;/);
  // (a Cancel beside a Delete: neutral, not the sport's light (MMA's is red, beside the red Delete))
  assert.match(read('libs/ranker/src/styles/components/account-lists-dialog.scss'), /\.modal-actions:has\(\.danger\) \.secondary \{\s*@include kit\.outline-button\(var\(--app-text-muted/);
  // (My Lists, an account page: its dialogs stay the app's own)
  assert.match(read(`${engine}/account/lists/list-view.component.html`), /<list-modal[\s\S]*class="app-btn-primary"/);
});
