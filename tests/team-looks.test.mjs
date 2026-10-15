// Every team's look (libs/ranker/src/engine/team-look.ts, worked out by scripts/build-team-looks.mjs into
// team-looks/<sport>.json): up to date with every logo and input, every logo readable on its chip, no two teams
// in a sport looking alike beyond the pairs accepted, and no red or green team color behind a value (the won
// and lost colors). Fails when a logo or a team-colors.ts changes until npm run team-looks is run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, contrast, distance, isResult, readsBy, sha, sourceHash } from '../scripts/team-looks/look.mjs';
import { OVERRIDES, watermarkDir, watermarkName, watermarkSource } from '../scripts/team-looks/watermark.mjs';

const OUT = path.join(ROOT, 'libs/ranker/src/engine/team-looks');
const ICONS = { nfl: 'NFL_Icons', nba: 'NBA_Icons', nhl: 'NHL_Icons', mlb: 'MLB_Icons' };
const read = (sport, kind = '') => JSON.parse(fs.readFileSync(path.join(OUT, `${sport}${kind}.json`), 'utf8'));
const lookOf = (file, key) => Object.fromEntries(file.fields.map((f, i) => [f, file.looks[key][i]]));

// The look-alikes accepted (the team-colors audit's): teams that share their colors (the Bulls', Raptors' and
// Rockets' red and black, MLB's navy and red), told apart by their logos. A pair not here fails.
const TWINS = {
  nfl: ['Bills~Patriots', 'Bucs~Cardinals', 'Bucs~Falcons', 'Cardinals~Falcons', 'Giants~Patriots', 'Lions~Panthers'],
  nba: ['CHI~HOU', 'CHI~TOR', 'DAL~ORL', 'DEN~IND', 'DET~LAC', 'DET~PHI', 'HOU~TOR', 'LAC~PHI'],
  nhl: [
    'ANA~CAR', 'ANA~NJD', 'ANA~PHI', 'BOS~PIT', 'CAR~CGY', 'CAR~CHI', 'CAR~NJD', 'CAR~PHI', 'CBJ~NYR', 'CBJ~WPG', 'CGY~CHI',
    'CGY~NJD', 'CGY~PHI', 'CHI~NJD', 'FLA~MTL', 'FLA~WSH', 'MTL~WSH', 'NJD~PHI', 'NYR~WPG', 'TBL~TOR',
  ],
  mlb: [
    '108~109', '108~113', '109~113', '111~112', '111~114', '111~140', '111~142', '111~144', '112~114', '112~116', '112~140',
    '112~142', '112~144', '114~140', '114~142', '114~144', '116~121', '116~140', '118~139', '118~141', '120~138', '134~135',
    '138~143', '139~141', '140~142', '140~144', '142~144',
  ],
};

// Logos that read only by an inner outline, on a face picked by hand and checked by eye: the Cowboys' star on
// their own navy (its white inner border draws the star)
const BY_EYE = { nfl: ['Cowboys.png', 'eras/Cowboys-1997.png'] };

test('every sport\'s looks are up to date: worked out from today\'s inputs and every logo file as it is now', () => {
  for (const sport of [...Object.keys(ICONS), 'mma']) {
    const checks = read(sport, '.checks');
    assert.equal(checks.source, sourceHash(sport), `${sport}: team-colors.ts, logo-eras.ts or the script changed: run npm run team-looks`);
    if (sport === 'mma') continue;
    const dir = path.join(ROOT, 'apps', sport, 'src/assets', ICONS[sport]);
    const files = ['', 'eras/']
      .flatMap((sub) => (fs.existsSync(path.join(dir, sub)) ? fs.readdirSync(path.join(dir, sub)).map((f) => sub + f) : []))
      .filter((f) => /\.(png|svg)$/.test(f) && !/^(mlb|nfl|nba|nhl)\.svg$/.test(f));
    assert.deepEqual(Object.keys(checks.logos).sort(), files.sort(), `${sport}: a logo added or removed: run npm run team-looks`);
    for (const file of files) {
      const hash = sha(fs.readFileSync(path.join(dir, file), file.endsWith('.svg') ? 'utf8' : undefined), file.endsWith('.svg'));
      assert.equal(checks.logos[file].hash, hash, `${sport} ${file} changed: run npm run team-looks`);
    }
  }
});

// Each logo's watermark (a hero's big faint logo: scripts/team-looks/watermark.mjs): drawn from the file it's
// drawn from as that is now (a hand-made one in watermark-overrides/ added, changed or removed, or an NFL
// logo's hd copy changed, fails), none missing or left over, each small
test("every logo's watermark is up to date, there, and small", () => {
  for (const sport of Object.keys(ICONS)) {
    const checks = read(sport, '.checks');
    const iconDir = path.join(ROOT, 'apps', sport, 'src/assets', ICONS[sport]);
    const wmDir = watermarkDir(sport);
    const want = [];
    for (const [file, c] of Object.entries(checks.logos)) {
      const src = watermarkSource(sport, iconDir, file);
      assert.equal(c.wm, src.hash, `${sport} ${file}'s watermark source changed: run npm run team-looks`);
      assert.equal(!!c.override, src.asIs, `${sport} ${file}'s watermark override added or removed: run npm run team-looks`);
      const wm = path.join(wmDir, watermarkName(file));
      assert.ok(fs.existsSync(wm), `${sport} ${file}: no watermark: run npm run team-looks`);
      assert.ok(fs.statSync(wm).size < 16_000, `${sport} ${file}'s watermark is over 16 KB`);
      want.push(watermarkName(file));
    }
    const have = ['', 'eras/'].flatMap((sub) => (fs.existsSync(path.join(wmDir, sub)) ? fs.readdirSync(path.join(wmDir, sub)).filter((f) => f.endsWith('.webp')).map((f) => sub + f) : []));
    assert.deepEqual(have.sort(), want.sort(), `${sport}: watermarks without a logo, or logos without one`);
    // (an override for no logo: misnamed)
    const over = path.join(OVERRIDES, sport);
    const overs = ['', 'eras/'].flatMap((sub) => (fs.existsSync(path.join(over, sub)) ? fs.readdirSync(path.join(over, sub)).filter((f) => f.endsWith('.png')).map((f) => sub + f) : []));
    const logos = new Set(Object.keys(checks.logos).map((f) => f.replace(/.(png|svg)$/, '.png')));
    assert.deepEqual(overs.filter((f) => !logos.has(f)), [], `${sport}: watermark overrides named for no logo`);
  }
});

test('every logo, today\'s and every era\'s, reads on its chip (a white one: white on its face at 3:1 or more)', () => {
  const fails = [];
  for (const sport of Object.keys(ICONS)) {
    for (const [file, c] of Object.entries(read(sport, '.checks').logos)) {
      if (BY_EYE[sport]?.includes(file)) continue;
      const ok = c.white !== undefined ? c.white >= 3 : readsBy(c);
      if (!ok) fails.push(`${sport} ${file} (${JSON.stringify(c)})`);
    }
  }
  assert.deepEqual(fails, [], 'logos that vanish on their chips');
});

test("no two teams in a sport look alike (chip, rim and accent) beyond the accepted pairs", () => {
  for (const sport of Object.keys(ICONS)) {
    const file = read(sport);
    const teams = Object.keys(file.teams).map((key) => ({ name: key.replace(/\.\w+$/, ''), ...lookOf(file, key) }));
    const pairs = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const [a, b] = [teams[i], teams[j]];
        const apart = Math.max(distance(a.face, b.face), distance(a.rim, b.rim), distance(a.accent, b.accent) * 0.8);
        if (apart < 10) pairs.push(`${a.name}~${b.name}`);
      }
    }
    assert.deepEqual(pairs.filter((p) => !TWINS[sport].includes(p)), [], `${sport}: new look-alikes`);
  }
});

test('a team look\'s safe accent (a card\'s panels, the bets\' picks) is never a red or a green, and reads on the board', () => {
  for (const sport of [...Object.keys(ICONS), 'mma']) {
    const file = read(sport);
    const keys = Object.keys(file.looks);
    const looks = keys.map((key) => [key, lookOf(file, key)]);
    if (file.default) looks.push(['default', Object.fromEntries(file.fields.map((f, i) => [f, file.default[i]]))]);
    for (const [key, look] of looks) {
      assert.equal(isResult(look.accentSafe), null, `${sport} ${key}: ${look.accentSafe} reads as won or lost`);
      assert.ok(contrast(look.accentSafe, '#1f2824') >= 4.5, `${sport} ${key}: ${look.accentSafe} too dark`);
    }
  }
});

// A team color as a fill (a background, an SVG fill) only on a chip, a wash or a disc behind a face: never
// on a value (a rank tile, a stat, a score), which stays on a neutral tile or the dark rank box. Every rule in
// the styles that paints with a team's color, by its selector's last part.
const TEAM_FILLS = [
  // (the mixins: a team card, a little chip, a disc's shade, the wash's texture)
  '@mixin team-card', '@mixin team-chip', '@function team-shade',
  // (the chips)
  '.team-badge', '.hero-card', '.similar-card', '.hit-badge', '.mini-gem', '.chip-logo', '&.logo-disc', '&.logo-face',
  // (the discs behind a headshot)
  '.hit-photo', '.top-photo', '.pin-face', '.chip-photo', '.arc-face-disc',
  // (the washes: a card's hero, a game's, Compare's tapes and chips, the tracker's sides)
  '.card-hero', '.game-hero', '.tape', '.compare-chip', '.pin-side',
];

// (a team's color in a declaration: its custom properties, or the disc's shade of it)
const TEAM_COLOR = /var\(--(team-(badge|tint|hi|lo|rim)|away-(hi|lo)|home-(hi|lo))\b|team-shade\(/;

test('team colors are painted only on chips, washes and discs, never behind a value', () => {
  const dir = path.join(ROOT, 'libs/ranker/src/styles');
  const files = [path.join(dir, '_variables.scss'), ...fs.readdirSync(path.join(dir, 'components')).map((f) => path.join(dir, 'components', f))];
  // (each fill as [file, its rule's selector (the last of a list), the declaration]: a background or fill
  // naming a team color, or a team card or chip included)
  const found = [];
  for (const file of files.filter((f) => f.endsWith('.scss'))) {
    const stack = [];
    let decl = null;
    const done = () => {
      if (TEAM_COLOR.test(decl)) found.push([path.basename(file), stack.at(-1), decl]);
      decl = null;
    };
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (decl !== null) {
        decl += ' ' + t;
        if (t.endsWith(';')) done();
      } else if (t.endsWith('{')) stack.push(t.slice(0, -1).trim().split(',').pop().trim());
      else if (t.startsWith('}')) stack.pop();
      else if (/^@include v\.team-(card|chip)(\(|;)/.test(t)) found.push([path.basename(file), stack.at(-1), t]);
      else if (/^(background|fill)\s*:/.test(t)) {
        decl = t;
        if (t.endsWith(';')) done();
      }
    }
  }
  assert.ok(found.length >= 20, `the team fills found: ${found.length}`);
  const stray = found.filter(([, selector]) => !TEAM_FILLS.some((allowed) => selector === allowed || selector?.startsWith(allowed + '(') || selector?.endsWith(' ' + allowed)));
  assert.deepEqual(stray.map(([file, selector]) => `${file}: ${selector}`), [], 'a team color painted somewhere new: a chip, a wash or a disc? add it here; a value? keep it on a neutral tile');
});
