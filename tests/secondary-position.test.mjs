// A defensive back listed only as "DB" (apps/nfl/scripts/secondary-position.mjs, read by update-data.mjs's
// defensePlayers): the season's roster or snap label first, then PFR's, then his career's (a safety in any
// season a safety), then the tackles-per-pass-defended tilt; and the 2000s' safeties the "DB" label hid from
// the S tab are on it in every built season.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SAFETY_TACKLES_PER_PD, secondaryLabel, secondaryTab } from '../apps/nfl/scripts/secondary-position.mjs';
import { staticDir } from './support/engine.mjs';

test('labels: FS, SS, S and SAF safeties; CB, NB, LCB and RCB corners; DB and blanks unknown', () => {
  for (const pos of ['S', 'FS', 'SS', 'SAF', 'fs']) assert.equal(secondaryLabel(pos), 'S', pos);
  for (const pos of ['CB', 'NB', 'LCB', 'RCB']) assert.equal(secondaryLabel(pos), 'CB', pos);
  for (const pos of ['DB', '', null, undefined, 'LB', 'NA']) assert.equal(secondaryLabel(pos), null, String(pos));
});

test("the season's own label wins: depth chart, then roster position, then snap counts", () => {
  // (a corner's tackle-heavy line, a safety's career: the season still says)
  assert.equal(secondaryTab({ season: ['FS', 'DB'], career: ['CB'], tackles: 20, passesDefended: 15 }), 'S');
  assert.equal(secondaryTab({ season: ['', 'CB'], career: ['SS'], tackles: 100, passesDefended: 1 }), 'CB');
  assert.equal(secondaryTab({ season: ['DB', 'DB', 'SS'], tackles: 10, passesDefended: 10 }), 'S');
  assert.equal(secondaryTab({ season: ['NB'], pfr: 'FS' }), 'CB');
});

test("then PFR's position (2018 on)", () => {
  assert.equal(secondaryTab({ season: ['DB', 'DB'], pfr: 'SS', career: ['CB'], tackles: 30, passesDefended: 12 }), 'S');
  assert.equal(secondaryTab({ season: ['DB'], pfr: 'RCB', career: ['S'], tackles: 90, passesDefended: 2 }), 'CB');
});

test('then his career: a safety in any season a safety, else a corner anywhere a corner', () => {
  assert.equal(secondaryTab({ season: ['DB'], pfr: 'DB', career: ['CB', 'DB', 'FS', 'CB'], tackles: 40, passesDefended: 15 }), 'S');
  assert.equal(secondaryTab({ season: [], career: ['DB', 'CB'], tackles: 90, passesDefended: 1 }), 'CB');
});

test('last, the tackles per pass defended tilt at the fitted cut', () => {
  const cut = SAFETY_TACKLES_PER_PD;
  assert.ok(cut > 3 && cut < 15, 'a safety makes several times the tackles a pass defended a corner does');
  assert.equal(secondaryTab({ season: ['DB'], career: ['DB'], tackles: 85, passesDefended: 6 }), 'S'); // 85 / 7
  assert.equal(secondaryTab({ season: ['DB'], career: ['DB'], tackles: 55, passesDefended: 16 }), 'CB'); // 55 / 17
  assert.equal(secondaryTab({ tackles: cut * 5, passesDefended: 4 }), 'S');
  assert.equal(secondaryTab({ tackles: cut * 5 - 1, passesDefended: 4 }), 'CB');
  assert.equal(secondaryTab({}), 'CB');
});

test("the 2000s' safeties are on the S tab, never the CB tab", () => {
  const dir = staticDir('nfl');
  const safeties = ['Ed Reed', 'Troy Polamalu', 'Brian Dawkins', 'Sean Taylor', 'Bob Sanders', 'John Lynch', 'Lawyer Milloy', 'Darren Woodson'];
  const seen = new Set();
  for (let year = 2000; year <= 2012; year++) {
    for (const file of ['skill-players.json', 'skill-players.ur.json']) {
      const rows = JSON.parse(fs.readFileSync(path.join(dir, 'seasons', String(year), file), 'utf8'));
      for (const row of rows.CB ?? []) assert.ok(!safeties.includes(row.name), `${year} ${row.name} on CB (${file})`);
      for (const row of rows.S ?? []) if (safeties.includes(row.name)) seen.add(row.name);
    }
  }
  assert.deepEqual([...seen].sort(), [...safeties].sort());
  // (2001's roster lists them "DB": its depth chart's FS and S put them there)
  const s2001 = JSON.parse(fs.readFileSync(path.join(dir, 'seasons', '2001', 'skill-players.json'), 'utf8')).S.map((row) => row.name);
  assert.ok(s2001.includes('Brian Dawkins') && s2001.includes('John Lynch'));
});
