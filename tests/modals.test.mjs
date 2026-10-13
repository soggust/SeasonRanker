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

// (the dialogs that leave the page usable: a rank tile's why, a bet's why, the bet slip's drawer)
const NOT_MODAL = new Set(['rank-why', 'bet-why', 'slip']);

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
  const presets = read('libs/ranker/src/styles/components/account-presets.scss');
  assert.doesNotMatch(presets, /kit\.primary-button;/, "the preset buttons beside the dropdown: the sport's light");
  assert.match(presets, /kit\.primary-button\(var\(--scoreboard-led\)\)/);
  // (My Lists, an account page: its dialogs stay the app's own)
  assert.match(read(`${engine}/account/lists/list-view.component.html`), /<list-modal[\s\S]*class="app-btn-primary"/);
});
