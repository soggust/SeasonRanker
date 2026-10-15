// A logo's watermark (a hero's big faint logo: a player card's, each side of a game's header), drawn once per
// logo file by scripts/build-team-looks.mjs into apps/<sport>/src/assets/watermarks/<logo>.webp: the logo in
// white, each pixel as opaque as it is light against the logo's own darkest and lightest, so its lettering,
// outlines and inner shapes still read where a white silhouette fills them in (the 49ers' SF in its oval, the
// Celtics' leprechaun, the Kings' crest). A logo's dark parts stay a faint ghost of the shape (FLOOR) rather
// than vanishing (the Raiders' black shield), and its edges between colors are traced in a thin white line
// (the Jazz's navy lettering, colors as light as each other). A logo of one color is its silhouette.
//
// A logo it doesn't draw well: a hand-made watermark (white on transparent, any size; a square-ish PNG) at
// watermark-overrides/<sport>/<the logo's file, .png> (watermark-overrides/nfl/49ers.png,
// watermark-overrides/nba/eras/UTA-2017.png, watermark-overrides/nhl/LAK.png) is used instead, as it is.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sha } from './look.mjs';

// (the longer side, in pixels: a hero draws it ~400px tall at a tenth of its opacity)
export const SIZE = 256;
export const OVERRIDES = path.join(ROOT, 'watermark-overrides');

// "eras/Bills-1997.png" -> "eras/Bills-1997.webp"
export const watermarkName = (key) => key.replace(/\.(png|svg)$/, '.webp');
export const watermarkDir = (sport) => path.join(ROOT, 'apps', sport, 'src/assets/watermarks');

// (a logo's hand-made watermark, if it has one)
export function overrideOf(sport, key) {
  const file = path.join(OVERRIDES, sport, key.replace(/\.(png|svg)$/, '.png'));
  return fs.existsSync(file) ? file : null;
}
// (what a logo's watermark is drawn from: its override as it is, else the sharpest copy of the logo (an NFL
// logo's 256px one in hd/, the card's), else the logo; and that file's hash, which the checks keep)
export function watermarkSource(sport, iconDir, key) {
  const over = overrideOf(sport, key);
  const hd = path.join(iconDir, 'hd', key);
  const file = over ?? (fs.existsSync(hd) ? hd : path.join(iconDir, key));
  const svg = file.endsWith('.svg');
  const buf = fs.readFileSync(file);
  return { file, asIs: !!over, buf, svg, hash: sha(svg ? buf.toString('utf8') : buf, svg) };
}

// (run in the page: a logo's data URL to its watermark's, a WebP; asIs: an override, only resized)
export const WATERMARK = `async (url, asIs) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const N = ${SIZE}, w = img.naturalWidth || N, h = img.naturalHeight || N, s = N / Math.max(w, h);
  const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, W, H);
  if (asIs) return c.toDataURL('image/webp', 0.85);
  const d = g.getImageData(0, 0, W, H).data, n = W * H;
  // (each pixel's lightness, CIE L*, and its opacity)
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = new Float32Array(n), A = new Float32Array(n), seen = [];
  for (let i = 0; i < n; i++) {
    const Y = 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]);
    L[i] = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    A[i] = d[i * 4 + 3] / 255;
    if (A[i] > 0.8) seen.push(L[i]);
  }
  seen.sort((a, b) => a - b);
  // (its darkest and lightest, but for a stray few; a logo of one color or close: all of it as light)
  const hi = seen.length ? seen[Math.floor(seen.length * 0.97)] : 100;
  const lo = Math.min(seen.length ? seen[Math.floor(seen.length * 0.03)] : 0, hi - 40);
  const FLOOR = 0.3, EDGE = 0.6;
  // (an edge: the steepest change in any channel, the color's weighted by its opacity, or in the opacity)
  const at = (x, y, k) => {
    x = x < 0 ? 0 : x >= W ? W - 1 : x;
    y = y < 0 ? 0 : y >= H ? H - 1 : y;
    const i = y * W + x;
    return k === 3 ? A[i] * 255 : d[i * 4 + k] * A[i];
  };
  const out = g.createImageData(W, H), o = out.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let e = 0;
      for (let k = 0; k < 4; k++) {
        const gx = at(x + 1, y - 1, k) + 2 * at(x + 1, y, k) + at(x + 1, y + 1, k) - at(x - 1, y - 1, k) - 2 * at(x - 1, y, k) - at(x - 1, y + 1, k);
        const gy = at(x - 1, y + 1, k) + 2 * at(x, y + 1, k) + at(x + 1, y + 1, k) - at(x - 1, y - 1, k) - 2 * at(x, y - 1, k) - at(x + 1, y - 1, k);
        e = Math.max(e, Math.hypot(gx, gy));
      }
      const i = y * W + x;
      const t = Math.min(1, Math.max(0, (L[i] - lo) / (hi - lo)));
      const a = Math.max(A[i] * (FLOOR + (1 - FLOOR) * t), EDGE * Math.min(1, e / 300));
      o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255;
      // (in 8 steps: a tenth of its opacity on the hero shows no finer, and it packs far smaller)
      o[i * 4 + 3] = Math.round(7 * Math.min(1, a)) * (255 / 7);
    }
  g.putImageData(out, 0, 0);
  return c.toDataURL('image/webp', 0.85);
}`;
