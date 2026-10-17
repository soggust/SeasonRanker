// The splash's photographed props (libs/ranker/src/engine/player-card/splash/splash.images.ts, the files in
// libs/ranker/src/assets/props): every file has its manifest entry and every entry its two files, at the aspect
// the manifest says; every entry is a registry prop (or one of its variants: the NBA's two conference trophies,
// the four jersey bases); a piece finds its photo by its prop id and words, and a prop without one falls back to
// its vector; the real-height scale holds across drawn and photographed props; the jersey bases' anchors land
// inside the jersey's drawing space, flat; every jersey face has its file and its metrics.
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
const { PROP_IMAGES, TINTED, JERSEY_BASES, TEXT_BASES, BASE_KEYS, INFO_CARD, GEAR_BASES, FACES, FACE_IDS, propImage, propHref, jerseyAnchors, textBaseArt, numberSize, nameSize } = await loadTs('splash.images.ts');
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
  // (beside the hero it is capped by height, 0.85 of the Lombardi's 22", and by area, 0.6 of the Lombardi's
  // footprint: the Hunt trophy, 0.924 wide for its height, stands 11.3" to the Lombardi's 22, not the 8" a
  // width cap gave it)
  const area = 22 * 22 * PROP_IMAGES['nfl-lombardi'];
  assert.equal(afc.h, Math.round(Math.min(16, 0.85 * 22, Math.sqrt((0.6 * area) / PROP_IMAGES['nfl-afc-trophy'])) * (222 / 22)));
  assert.ok(afc.h > lombardi.h * 0.45 && afc.h < lombardi.h * 0.6, `${afc.h} beside ${lombardi.h}`);
  assert.ok(afc.h * afc.h * PROP_IMAGES['nfl-afc-trophy'] <= lombardi.h * lombardi.h * PROP_IMAGES['nfl-lombardi'] * 0.61, 'the area cap holds');
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

test('a jersey base lands in the drawing space flat: the collar at 10, the photo inside the viewBox, the number box centred on the torso, the sleeves clear of the body, nothing leaning', () => {
  const inside = (b, img, what) => assert.ok(b.x >= img.x - 0.01 && b.y >= img.y - 0.01 && b.x + b.w <= img.x + img.w + 0.01 && b.y + b.h <= img.y + img.h + 0.01, what);
  for (const cut of Object.keys(JERSEY_BASES)) {
    const a = jerseyAnchors(cut);
    assert.ok(a, cut);
    assert.equal(a.img.y, 10, `${cut}: the collar's top at 10`);
    const [vx, , vw] = a.vb.split(' ').map(Number);
    assert.ok(a.img.x >= vx - 0.01 && a.img.x + a.img.w <= vx + vw + 0.01 && a.img.y + a.img.h <= 146.01, `${cut}: inside the viewBox ${a.vb} ${JSON.stringify(a.img)}`);
    assert.ok(a.img.w > vw - 2 || Math.abs(a.img.h - 132) < 0.05, `${cut}: fits the width or the height`);
    assert.ok(Math.abs((a.bodyX[0] + a.bodyX[1]) / 2 - 60) < 0.6, `${cut}: the body round x 60`);
    // the number box: centred on the torso, inside it, from about 22% to 62% of the body's height
    const cx = (a.bodyX[0] + a.bodyX[1]) / 2;
    assert.ok(Math.abs(a.num.x + a.num.w / 2 - cx) < 0.02, `${cut}: number centred`);
    assert.ok(a.num.x > a.bodyX[0] && a.num.x + a.num.w < a.bodyX[1], `${cut}: number inside the torso`);
    assert.ok(a.num.y > a.img.y + 0.15 * a.bodyH && a.num.y + a.num.h < a.img.y + 0.7 * a.bodyH, `${cut}: number box ${a.num.y} ${a.num.h}`);
    inside(a.num, a.img, `${cut}: number inside the photo`);
    // the name's arc between the collar and the number, inside the torso
    const [, nx, ny] = a.nameArc.match(/^M([-\d.]+) ([-\d.]+)/).map(Number);
    assert.ok(ny < a.num.y && ny > a.img.y + 0.1 * a.bodyH, `${cut}: name over the number`);
    assert.ok(nx > a.bodyX[0] && a.nameRun < a.bodyW, `${cut}: name inside the torso`);
    // the hem band region at the bottom of the torso, under the number
    assert.ok(a.hemH > 0 && a.hemY - a.hemH > a.num.y + a.num.h && a.hemY <= a.img.y + a.img.h + 0.01, `${cut}: hem region`);
    // the sleeves (where the cut has them) clear of the torso, each cuff at its outer end; TV numbers on them
    for (const s of a.sleeves ?? []) {
      assert.ok(s.dir > 0 ? s.x + s.w <= a.bodyX[0] + 0.5 : s.x >= a.bodyX[1] - 0.5, `${cut}: sleeve clear of the body`);
      assert.ok(s.dir > 0 ? s.cuff < s.x + s.w / 2 : s.cuff > s.x + s.w / 2, `${cut}: the cuff at the sleeve's outer end`);
    }
    for (const t of a.tv ?? []) {
      assert.ok(t.x + t.w < a.bodyX[0] || t.x > a.bodyX[1], `${cut}: TV number on a sleeve`);
      inside(t, a.img, `${cut}: TV number inside the photo`);
    }
    for (const p of a.panels ?? []) inside(p, a.img, `${cut}: panel inside the photo`);
    // (nothing leans: no transform on any anchor)
    const json = JSON.stringify(a);
    assert.ok(!json.includes('rotate') && !json.includes('matrix') && !json.includes('skew'), `${cut}: flat`);
  }
  assert.equal(jerseyAnchors('cricket'), null);
  // (every base is a back: no placket, wordmark or front number; the vest's undershirt; the sweater's yoke)
  assert.equal(jerseyAnchors('baseball').placket, undefined);
  assert.equal(jerseyAnchors('baseball').markArc, undefined);
  assert.equal(jerseyAnchors('baseball').under.length, 2);
  assert.ok(jerseyAnchors('hockey').sleeves.length === 2 && jerseyAnchors('hockey').yoke);
  assert.equal(jerseyAnchors('football').tv.length, 2);
  assert.ok(jerseyAnchors('basketball').armholes && !jerseyAnchors('basketball').sleeves);
  // (the sweater, its sleeves spread, fits the width and stands short; the tank fits the height)
  assert.ok(jerseyAnchors('hockey').img.w > 150 && jerseyAnchors('hockey').img.h < 90 && jerseyAnchors('hockey').vb === '-18 -18 156 164');
  assert.equal(jerseyAnchors('football').vb, '-4 -18 128 164');
  assert.ok(Math.abs(jerseyAnchors('basketball').img.h - 132) < 0.05);
  // (the helmet's decal and stripe inside the photo)
  const d = GEAR_BASES.helmet.decal;
  assert.ok(d.x > 0.4 && d.x + d.w < 1 && d.y > 0 && d.y + d.h < 1 && d.h > 0.3 && d.h < 0.42);
  // (every text base's boxes, marks, logo and paper inside its photo)
  for (const [t, b] of Object.entries({ ...TEXT_BASES, card: INFO_CARD })) {
    for (const bx of [...b.boxes, ...(b.marks ?? []), ...(b.logo ? [b.logo] : []), ...(b.paper ? [b.paper] : []), ...(b.play ? [b.play] : [])]) {
      assert.ok(bx.x >= 0 && bx.y >= 0 && bx.x + bx.w <= 1.001 && bx.y + bx.h <= 1.001, `${t}: box inside the photo ${JSON.stringify(bx)}`);
    }
    assert.equal(b.plane, undefined, `${t}: flat`);
  }
});

test('the jersey faces: every face has its file, its metrics and its @font-face; a number is sized so two digits fill the box whatever the face; a name shrinks to its run', () => {
  const dir = path.join(ROOT, 'libs/ranker/src/assets/fonts/jersey');
  const css = fs.readFileSync(path.join(dir, 'jersey.css'), 'utf8');
  for (const id of FACE_IDS) {
    assert.ok(fs.existsSync(path.join(dir, id + '.woff2')), id);
    assert.ok(css.includes(`font-family: "J-${id}"`) && css.includes(`url(${id}.woff2)`), `${id} in jersey.css`);
    const f = FACES[id];
    assert.ok(f.capH > 0.3 && f.capH < 1 && f.w88 > 0.4 && f.w88 < 1.5 && f.cap > 0.3 && f.capL > 0.3, id);
    const size = numberSize(id, 40, 30);
    assert.ok(Math.min(Math.abs(size * f.capH - 30), Math.abs(size * f.w88 - 40)) < 0.05, `${id}: fills the box one way`);
    assert.ok(size * f.capH <= 30.05 && size * f.w88 <= 40.05, `${id}: never over the box`);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.woff2')).map((f) => f.replace('.woff2', ''));
  assert.deepEqual(files.sort(), [...FACE_IDS].sort(), 'no stray face file');
  assert.ok(fs.existsSync(path.join(dir, 'SOURCES.md')));
  // (a name: its capitals a given height, smaller for a long one; an unknown face reads as the block)
  assert.ok(nameSize('block', 'SMITH', 60, 6) > nameSize('block', 'ROETHLISBERGER', 60, 6));
  assert.ok(Math.abs(nameSize('block', 'SMITH', 60, 6) * FACES.block.capL - 6) < 0.05);
  assert.equal(numberSize(undefined, 40, 30), numberSize('block', 40, 30));
});

test('the paper carries its words flat, its printed labels and its marks', () => {
  // (the boarding pass: its band and the labels, the passenger, FROM and TO, the stub's barcode and the stamp,
  // every one flat on the paper)
  const pass = textBaseArt('pass', 'boarding-pass', ['Jacksonville Jaguars', 'JAX', 'CUN', 'Jan 5, 2025', '4-13']);
  assert.ok(pass);
  const labels = pass.texts.map((t) => t.text);
  for (const l of ['Season Ranker Air', 'Boarding Pass', 'Passenger', 'Jacksonville Jaguars', 'From', 'JAX', 'To', 'CUN', 'Departs', 'Jan 5, 2025', 'Seat', '4-13', 'Cancún']) assert.ok(labels.includes(l), l);
  for (const t of pass.texts) assert.equal(t.transform, null, t.text);
  assert.deepEqual(pass.marks.map((x) => x.kind), ['plane', 'barcode', 'stamp']);
  assert.ok(pass.marks[1].rects.length > 20 && pass.marks[1].rects.every((r) => r.h > r.w));
  assert.equal(pass.marks[2].text, 'Eliminated');
  // (the ticket stub: the round in print, the game and the score in the mono, FINAL
  // printed, a barcode down the stub)
  const stub = textBaseArt('stub', 'ticket-stub', ['Divisional Round', 'Texans at KC', 'Jan 18, 2025', '14–23']);
  assert.ok(stub.texts.every((t) => t.transform === null));
  assert.ok(stub.texts.find((t) => t.text === 'Final'));
  assert.ok(stub.texts.find((t) => t.text === '14–23').size > stub.texts.find((t) => t.text === 'Jan 18, 2025').size * 1.8);
  assert.equal(stub.marks[0].kind, 'barcode');
  // (the medal: the playoffs on an arc round the face, the season under the mark, the seed left to the shelf)
  const medal = textBaseArt('roundel', 'playoff-medal', ['NFC Playoffs', "'23", 'No. 2 seed']);
  assert.match(medal.texts[0].arc, /^M[-\d.]+ [-\d.]+ A/);
  assert.equal(medal.texts.length, 2);
  assert.ok(!medal.texts.find((t) => t.text === 'No. 2 seed'));
  // (the banner: a long division wraps onto two rows and stands bigger for it)
  const one = textBaseArt('banner', 'division-banner', ['AFC West', 'Champions', "'24"]);
  const two = textBaseArt('banner', 'division-banner', ['NFC East', 'Champions', "'24"]);
  assert.equal(one.texts.filter((t) => /AFC|West/.test(t.text)).length, 2);
  assert.ok(one.texts[0].size > 7, `banner rows ${one.texts[0].size}`);
  assert.equal(two.texts.length, 4);
  // (felt letters throw a shadow, engravings a lit edge, printed ink nothing)
  assert.ok(one.texts[0].hi && one.texts[0].hiDx > 0);
  assert.ok(stub.texts.every((t) => !t.hi));
  assert.ok(medal.texts[1].hi && medal.texts[1].hiDx === 0);
});

test('a piece on a blank base: its words land in their boxes, sized to fit, never squeezed; the honors need both plaques only with a second honor', () => {
  const one = textBaseArt('plaques', 'honors-plaques', ['Pro Bowl', '2024']);
  const two = textBaseArt('plaques', 'honors-plaques', ['Pro Bowl', '2024', 'All-Pro', 'First team']);
  assert.ok(one && two);
  assert.equal(one.imgs.length, 1);
  assert.equal(two.imgs.length, 2);
  assert.ok(two.w > one.w * 1.9);
  // (the plate lies flat: each plaque's words sit in its own box, the second plaque's a plaque to the right)
  assert.equal(two.texts.length, 4);
  assert.equal(two.logos.length, 2);
  const iw = PROP_IMAGES['plaque-wood'] * 100;
  assert.equal(two.texts.filter((t) => t.x > iw).length, 2, 'two lines on the second plaque');
  for (const t of two.texts) assert.ok(t.size > 0 && t.size <= 11 && t.transform === null, t.text);
  // (a long line gets smaller, not wider than its box)
  const long = textBaseArt('plaque', 'season-plaque', ['A very long season label indeed', '12-5']);
  const lt = long.texts;
  assert.ok(lt[0].size < lt[1].size);
  const box = TEXT_BASES['plaque'].boxes[0];
  // (the size is kept to two places, so the fit may run over by that rounding times the letters)
  assert.ok(lt[0].size * lt[0].text.length * 0.84 <= box.w * iw + 0.005 * lt[0].text.length);
  // (a line that would set too small is left to the shelf's caption)
  const tiny = textBaseArt('plaque', 'season-plaque', ['2024', '12-5'], 0.84, undefined, 20);
  assert.equal(tiny.texts.length, 0);
  // (the framed mark lies on a paper under the mat's cut window)
  assert.equal(textBaseArt('frame', 'team-frame', []).papers.length, 1);
  // (by the prop's id first: a won round's plaque is the round one)
  assert.equal(textBaseArt('plaque', 'round-plaque', ['Wild Card', 'W 31-17']).key, 'plaque-round');
  assert.equal(textBaseArt('plaque', 'season-plaque', ['2024', '12-5']).key, 'plaque-wood');
  // (the whiteboard's play fits its box; a tinted felt is tinted; a piece without a base gets none)
  assert.match(textBaseArt('whiteboard', 'whiteboard', ['13-4', '2024', 'KC']).play, /^translate\(.+\) scale\(0\.\d+\)$/);
  assert.equal(textBaseArt('banner', 'division-banner', ['AFC West', 'Champions', "'24"]).tint, true);
  assert.equal(textBaseArt('lombardi', 'nfl-lombardi', ['LVIII']), null);
});
