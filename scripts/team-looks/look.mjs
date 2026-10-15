// A team's look worked out from its logo's colors and its team's (scripts/build-team-looks.mjs, which says how),
// and the checks on it (tests/team-looks.test.mjs): the color math, a logo read against a face, the look.
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '../..');

// ---------------------------------------------------------------------------
// The inputs: a module bundled from the repo's TypeScript (colors.ts, a sport's team-colors.ts and logo-eras.ts)
// ---------------------------------------------------------------------------
export async function load(file) {
  const out = path.join(os.tmpdir(), `team-looks-${process.pid}-${path.basename(file, '.ts')}-${Math.random().toString(36).slice(2)}.mjs`);
  await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
  try {
    return await import(pathToFileURL(out).href);
  } finally {
    fs.rmSync(out, { force: true });
  }
}
const colors = await load(path.join(ROOT, 'libs/ranker/src/engine/colors.ts'));
export const { distance, contrast, readableOn } = colors;

// (a file's hash, its line endings as git stores them: the same on a Windows checkout as on GitHub's)
export const sha = (buf, text = false) =>
  createHash('sha1')
    .update(text ? String(buf).replace(/\r\n/g, '\n') : buf)
    .digest('hex')
    .slice(0, 12);

// ---------------------------------------------------------------------------
// Color: sRGB, Lab and LCh (D65)
// ---------------------------------------------------------------------------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const hex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const delin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function lab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function lch(h) {
  const [l, a, b] = lab(h);
  return [l, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
function fromLab([l, a, b]) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const fi = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = fi(fx) * 0.95047;
  const Y = fi(fy);
  const Z = fi(fz) * 1.08883;
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
}
// (a color at that lightness, chroma and hue, its chroma lowered until it's one sRGB can show)
export function fromLch(l, c, h) {
  for (let cc = c; cc >= 0; cc -= 1) {
    const rr = fromLab([l, cc * Math.cos((h * Math.PI) / 180), cc * Math.sin((h * Math.PI) / 180)]);
    if (rr.every((v) => v >= -0.001 && v <= 1.001)) return hex(rr.map((v) => delin(Math.max(0, Math.min(1, v)))));
  }
  return hex(fromLab([l, 0, 0]).map((v) => delin(Math.max(0, Math.min(1, v)))));
}
export const neutral = (h) => lch(h)[1] < 10;
// (a saturated red or green: what won and lost are drawn in)
export function isResult(h) {
  const [, c, H] = lch(h);
  if (c > 25 && (H <= 42 || H >= 345)) return 'red';
  if (c > 25 && H >= 110 && H <= 170) return 'green';
  return null;
}
const yellow = (h) => {
  const [, c, H] = lch(h);
  return c > 30 && H > 65 && H < 105;
};

// ---------------------------------------------------------------------------
// A logo on a face
// ---------------------------------------------------------------------------
// (the share of the logo's colors, and of its silhouette's edge, that stand off the face)
export function visibility(logo, face) {
  let v = 0;
  let n = 0;
  let ev = 0;
  let en = 0;
  for (const [r, g, b, c] of logo.buckets) {
    n += c;
    if (distance(hex([r, g, b]), face) >= 20) v += c;
  }
  for (const [r, g, b, c] of logo.edge) {
    en += c;
    if (distance(hex([r, g, b]), face) >= 20) ev += c;
  }
  return { vis: v / n, edge: en ? ev / en : 1 };
}
// (it reads: its outline stands off, or most of it does)
export const readsBy = ({ vis, edge }) => (edge >= 0.8 && vis >= 0.3) || (edge >= 0.6 && vis >= 0.4) || (vis >= 0.6 && edge >= 0.35) || vis >= 0.8;
const reads = (logo, face) => readsBy(visibility(logo, face));

// (a logo's main colors: its buckets clustered, each a twenty-fifth of it or more, the four biggest)
export function dominantOf(buckets, n) {
  const clusters = [];
  for (const [r, g, b, c] of buckets) {
    const h = hex([r, g, b]);
    const near = clusters.find((x) => distance(x.hex, h) < 12);
    if (near) near.n += c;
    else clusters.push({ hex: h, n: c });
  }
  return clusters
    .sort((a, b) => b.n - a.n)
    .filter((x) => x.n / n >= 0.04)
    .slice(0, 4)
    .map((x) => x.hex);
}

// ---------------------------------------------------------------------------
// The look
// ---------------------------------------------------------------------------
const CREAM = '#efe7d4';
const NEAR_BLACK = '#17191a';
const BOARD = '#1f2824';
// (a hero's wash: its light end's lightness and chroma ceiling, its deep end's)
const WASH = { hi: 47, lo: 12 };

// (a color made to show on the dark board: lifted to a lightness, its chroma capped)
function lift(h, minL = 58, maxC = 62) {
  const [l, c, H] = lch(h);
  if (c < 10) return fromLch(Math.max(l, 72), 0, 0);
  return fromLch(Math.max(l, minL), Math.min(c, maxC), H);
}
// (a chip's color toned for the dark board; a gold stays gold, not mustard)
function tone(h) {
  const [l, c, H] = lch(h);
  if (c > 20 && H > 65 && H < 105) return fromLch(Math.min(Math.max(l, 66), 76), Math.min(c, 80), H);
  return fromLch(Math.min(Math.max(l, 28), 46), Math.min(c, 60), H);
}

export function lookOf({ primary, alt, logo, era, over = {} }) {
  if (era && !over.primary && !era.listed) {
    // (an old logo not in ERA_COLORS: its own colors when it doesn't use today's)
    const colorful = logo.dom.filter((h) => !neutral(h));
    const inLogo = (c) => logo.dom.some((d) => distance(d, c) < 18);
    if (colorful.length && !inLogo(primary) && !neutral(primary)) {
      primary = colorful[0];
      alt = colorful[1] || alt;
    }
  }
  if (over.primary) primary = over.primary;
  if (over.alt) alt = over.alt;
  const choices = [];
  if (!neutral(primary)) choices.push(tone(primary));
  if (alt && !neutral(alt) && !yellow(alt)) choices.push(tone(alt));
  let face = over.face === 'primary' ? tone(primary) : over.face;
  if (!face) face = choices.find((f) => reads(logo, f));
  if (!face) {
    // (no team color it reads on: cream or near-black, whichever it contrasts with more)
    const sum = (f) => logo.buckets.reduce((s, [r, g, b, n]) => s + n * Math.min(contrast(hex([r, g, b]), f), 7), 0);
    face = neutral(primary) && reads(logo, NEAR_BLACK) ? NEAR_BLACK : sum(CREAM) > sum(NEAR_BLACK) ? CREAM : NEAR_BLACK;
  }
  // (the rim: the second color; the color itself when the face already is the second)
  const second = alt && distance(tone(alt), face) > 12 ? alt : primary;
  const rim = over.rim || (neutral(second) ? (lch(second)[0] > 50 ? '#e9ecef' : '#c4ced4') : lift(second, 55, 70));
  // (the team's hue: its color, charcoal for a black or white team)
  const plain = neutral(primary);
  const [, pc, ph] = lch(primary);
  const deep = plain ? '#2a2f2e' : fromLch(30, Math.min(Math.max(pc, 30), 58), ph);
  const [, dc, dh] = lch(deep);
  const [hi, lo] = dc < 8 ? [fromLch(WASH.hi - 4, 0, 0), fromLch(WASH.lo, 0, 0)] : [fromLch(WASH.hi, Math.min(dc * 1.1, 62), dh), fromLch(WASH.lo, Math.min(dc * 0.8, 40), dh)];
  const accent = plain ? rim : lift(primary, 58);
  const other = rim;
  // (never a red or a green: its other color, else a light neutral; light enough to read as text on the board)
  const safe = [accent, other].find((c) => !isResult(c)) ?? '#c4ced4';
  const accentSafe = readableOn(safe, BOARD, 4.5);
  return { face, rim, accent, accentSafe, other, deep, hi, lo, whiteLogo: !!over.whiteLogo };
}


// (what a sport's looks are worked out from: the scripts, its team-colors.ts and logo-eras.ts; a change to
// any of them means running the script again)
export function sourceHash(sport) {
  const files = ['scripts/build-team-looks.mjs', 'scripts/team-looks/look.mjs', 'scripts/team-looks/watermark.mjs', `apps/${sport}/src/sport/team-colors.ts`, `apps/${sport}/src/sport/logo-eras.ts`];
  return sha(files.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join(''), true);
}
