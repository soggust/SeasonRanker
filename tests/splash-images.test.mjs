// The splash's photographed props (libs/ranker/src/engine/player-card/splash/splash.images.ts, the files in
// libs/ranker/src/assets/props): every file has its manifest entry and every entry its two files, at the aspect
// the manifest says; every entry is a registry prop (or one of its variants: the NBA's two conference trophies,
// the four jersey bases); a piece finds its photo by its prop id and words, and a prop without one falls back to
// its vector; the real-height scale holds across drawn and photographed props; the jersey bases' anchors land
// inside the jersey's drawing space.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'libs/ranker/src/engine/player-card/splash');
const ASSETS = path.join(ROOT, 'libs/ranker/src/assets/props');
const loadTs = async (file) => {
  const o = path.join(os.tmpdir(), `splash-images-${path.basename(file, '.ts')}-${process.pid}.mjs`);
  await build({ entryPoints: [path.join(DIR, file)], bundle: true, format: 'esm', platform: 'node', outfile: o, logLevel: 'silent' });
  const m = await import(pathToFileURL(o).href);
  fs.rmSync(o, { force: true });
  return m;
};
const { PROP_IMAGES, TINTED, JERSEY_BASES, TEXT_BASES, BASE_KEYS, INFO_CARD, propImage, propHref, jerseyAnchors, textBaseArt } = await loadTs('splash.images.ts');
const { PROPS } = await loadTs('splash.props.ts');
const { buildScene } = await loadTs('splash.scene.ts');

// A WebP's canvas size from its header (VP8X: 24-bit width-1 and height-1 at 24; VP8L: 14-bit fields at 21;
// VP8: 14-bit fields at 26)
function webpSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', file);
  assert.equal(b.toString('ascii', 8, 12), 'WEBP', file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  if (chunk === 'VP8L') {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >>> 14) & 0x3fff) };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

const VARIANTS = { 'nba-conf-trophy-east': 'nba-conf-trophy', 'nba-conf-trophy-west': 'nba-conf-trophy' };
const JERSEY = /^jersey-(football|basketball|hockey|baseball)$/;

test('every image file is in the manifest, and every manifest entry has its 400 and its 800', () => {
  const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith('.webp'));
  for (const f of files) {
    const m = f.match(/^(.+)-(400|800)\.webp$/);
    assert.ok(m, `${f}: named <prop id>-400.webp or -800.webp`);
    assert.ok(m[1] in PROP_IMAGES, `${f}: no manifest entry`);
  }
  for (const key of Object.keys(PROP_IMAGES)) {
    for (const size of [400, 800]) assert.ok(files.includes(`${key}-${size}.webp`), `${key}: missing the ${size}`);
  }
});

test('each file is the size its name says, at the aspect the manifest says', () => {
  for (const [key, aspect] of Object.entries(PROP_IMAGES)) {
    assert.ok(aspect > 0.3 && aspect < 2.5, `${key}: aspect ${aspect}`);
    for (const size of [400, 800]) {
      const { w, h } = webpSize(path.join(ASSETS, `${key}-${size}.webp`));
      assert.ok(h === size || (w === size && aspect > 1), `${key}-${size}: ${w}x${h}`);
      assert.ok(Math.abs(w / h - aspect) < 0.012, `${key}-${size}: aspect ${(w / h).toFixed(3)} vs ${aspect}`);
    }
  }
});

test('every manifest entry is a registry prop, a conference variant of one, a jersey base, or a blank base a piece draws on', () => {
  for (const key of Object.keys(PROP_IMAGES)) {
    const id = VARIANTS[key] ?? key;
    assert.ok(JERSEY.test(key) || BASE_KEYS.has(key) || id in PROPS, `${key}: not a prop`);
  }
  for (const [t, b] of Object.entries(TEXT_BASES)) assert.ok(b.key in PROP_IMAGES, `${t}: base ${b.key} has no image`);
  assert.ok(INFO_CARD.key in PROP_IMAGES);
  for (const key of TINTED) assert.ok(key in PROP_IMAGES && key in PROPS, key);
  for (const cut of Object.keys(JERSEY_BASES)) assert.ok(`jersey-${cut}` in PROP_IMAGES, cut);
});

test('a piece finds its photo by its prop id (the NBA conference trophy by its conference); a prop without one, or a jersey base, gets none', () => {
  assert.equal(propImage('nfl-lombardi'), 'nfl-lombardi');
  assert.equal(propImage('nba-conf-trophy', 'Eastern'), 'nba-conf-trophy-east');
  assert.equal(propImage('nba-conf-trophy', 'Western'), 'nba-conf-trophy-west');
  assert.equal(propImage('nba-conf-trophy', 'West'), 'nba-conf-trophy-west');
  assert.equal(propImage('honors-plaques'), undefined);
  assert.equal(propImage('ticket-stub'), undefined);
  assert.equal(propImage('jersey-football'), undefined);
  assert.equal(propImage('plaque-wood'), undefined, "a blank base is never a prop's own photo");
  assert.equal(propImage(undefined), undefined);
  assert.equal(propHref('puck', false), 'assets/props/puck-400.webp');
  assert.equal(propHref('puck', true), 'assets/props/puck-800.webp');
});

test('the scene hands each piece its prop id, sized on the real-height scale, photo or not', () => {
  const s = buildScene({
    sport: 'nfl', tab: 'TM', id: 'TM-Chiefs', season: 2023, seasonLabel: '2023', current: false, team: true, name: 'Kansas City Chiefs', teamName: 'Kansas City Chiefs', abbr: 'KC',
    awards: [{ id: 'sb', title: 'Super Bowl LVIII' }, { id: 'conf', title: 'AFC champions' }], outcome: { result: 'champion', record: '11-6', seed: 3, division: 'AFC West', conference: 'AFC', confChamp: true },
  });
  assert.ok(s);
  const lombardi = s.items.find((p) => p.t === 'lombardi');
  const afc = s.items.find((p) => p.t === 'conf');
  assert.equal(lombardi.id, 'nfl-lombardi');
  assert.equal(afc.id, 'nfl-afc-trophy');
  assert.equal(propImage(afc.id, afc.lines[0]), 'nfl-afc-trophy');
  // (the hero at the shelf's max, the conference trophy at its real share of it: 16 over 22)
  assert.equal(lombardi.h, 222);
  assert.equal(afc.h, Math.round(16 * (222 / 22)));
  // (a plaque has no photo: its piece draws the vector)
  const plaque = s.items.find((p) => p.t === 'roundel' || p.t === 'banner');
  if (plaque) assert.equal(propImage(plaque.id), undefined);
});

test('the registry holds to reality: a ball is smaller than a cap, a cap than a helmet, a helmet than a trophy; the conference trophies under their title trophies', () => {
  const inch = (id) => PROPS[id].inches;
  assert.ok(inch('milestone-ball') < inch('ball-cap') + 2 && inch('milestone-ball') <= 6);
  assert.ok(inch('ball-cap') < inch('nfl-helmet'));
  assert.ok(inch('nfl-helmet') < inch('nfl-lombardi'));
  assert.ok(inch('puck') < inch('fielders-glove'));
  assert.equal(inch('nfl-afc-trophy'), inch('nfl-nfc-trophy'));
  assert.ok(inch('nfl-afc-trophy') / inch('nfl-lombardi') > 0.6 && inch('nfl-afc-trophy') / inch('nfl-lombardi') < 0.8);
  assert.ok(inch('nba-conf-trophy') < inch('nba-obrien'));
  assert.ok(inch('nhl-stanley-cup') > inch('nhl-wales-trophy') && inch('nhl-stanley-cup') > inch('nhl-campbell-bowl'));
  assert.equal(inch('bats'), 34);
  assert.equal(inch('nfl-lombardi'), 22);
  assert.ok(inch('golf-ball') < inch('sunscreen') && inch('sunscreen') < inch('golf-bag'));
});

test('a jersey base lands in the drawing space: the collar at 10, the hem at 142, the body round x 60, the photo inside the viewBox', () => {
  for (const cut of ['football', 'basketball', 'hockey', 'baseball']) {
    const a = jerseyAnchors(cut);
    assert.ok(a, cut);
    const b = JERSEY_BASES[cut];
    assert.ok(Math.abs(a.img.y + b.top * a.img.h - 10) < 0.05, `${cut}: collar`);
    assert.ok(Math.abs(a.hemY - 142) < 0.05, `${cut}: hem`);
    assert.ok(a.img.x >= -4.5 && a.img.x + a.img.w <= 124.5, `${cut}: ${a.img.x}..${a.img.x + a.img.w} across`);
    assert.ok(a.img.y >= -18, `${cut}: ${a.img.y} up`);
    assert.ok(a.bodyX[0] < 60 && a.bodyX[1] > 60, `${cut}: body ${a.bodyX}`);
    assert.ok(Math.abs(a.num.x - (a.bodyX[0] + a.bodyX[1]) / 2) < 0.02, `${cut}: number centered on the body`);
    assert.ok(a.num.size > 36 && a.num.size < 62, `${cut}: number ${a.num.size}`);
    assert.ok(a.nameK > 0.7 && a.nameK < 1.3, `${cut}: name ${a.nameK}`);
    assert.ok(a.pins.length > 3 && a.pins.every((x) => x > a.bodyX[0] && x < a.bodyX[1]), `${cut}: pinstripes on the body`);
    assert.match(a.neck, /^M-?\d/, `${cut}: neck`);
    // (a fraction path is resolved by number pairs: never the one-number H and V)
    for (const d of [a.neck, a.yoke, a.armholes, ...(a.under ?? [])]) if (d) assert.doesNotMatch(d, /[HV]/, `${cut}: a fraction path with H or V`);
    if (a.cuffs) for (const c of a.cuffs) assert.ok(Math.abs(Math.hypot(c.dx, c.dy) - 1) < 0.02, `${cut}: cuff direction`);
  }
  assert.equal(jerseyAnchors('cricket'), null);
  assert.ok(jerseyAnchors('baseball').placket && jerseyAnchors('baseball').buttons.length === 7);
  assert.ok(jerseyAnchors('hockey').arms.length === 2);
  assert.ok(jerseyAnchors('football').tv && jerseyAnchors('football').cuffs.length === 2);
});

test('a piece on a blank base: its words land in their boxes, sized to fit, never squeezed; the honors need both plaques only with a second honor', () => {
  const one = textBaseArt('plaques', 'honors-plaques', ['Pro Bowl', '2024']);
  const two = textBaseArt('plaques', 'honors-plaques', ['Pro Bowl', '2024', 'All-Pro', 'First team']);
  assert.ok(one && two);
  assert.equal(one.imgs.length, 1);
  assert.equal(two.imgs.length, 2);
  assert.ok(two.w > one.w * 1.9);
  assert.equal(two.texts.length, 4);
  assert.equal(two.logos.length, 2);
  for (const t of two.texts) assert.ok(t.size > 0 && t.size <= 9, t.text);
  // (a long line gets smaller, not wider than its box)
  const long = textBaseArt('plaque', 'season-plaque', ['A very long season label indeed', '12-5']);
  assert.ok(long.texts[0].size < long.texts[1].size);
  const box = TEXT_BASES['plaque'].boxes[0];
  assert.ok(long.texts[0].size * long.texts[0].text.length * 0.84 <= box.w * PROP_IMAGES['plaque-wood'] * 100 + 0.01);
  // (by the prop's id first: a won round's plaque is the round one)
  assert.equal(textBaseArt('plaque', 'round-plaque', ['Wild Card', 'W 31-17']).key, 'plaque-round');
  assert.equal(textBaseArt('plaque', 'season-plaque', ['2024', '12-5']).key, 'plaque-wood');
  // (the whiteboard's play fits its box; a tinted felt is tinted; a piece without a base gets none)
  assert.match(textBaseArt('whiteboard', 'whiteboard', ['13-4', '2024', 'KC']).play, /^translate\(.+\) scale\(0\.\d+\)$/);
  assert.equal(textBaseArt('banner', 'division-banner', ['AFC West', 'Champions', "'24"]).tint, true);
  assert.equal(textBaseArt('lombardi', 'nfl-lombardi', ['LVIII']), null);
});
