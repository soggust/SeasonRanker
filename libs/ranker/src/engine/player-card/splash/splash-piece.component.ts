// One piece on the splash, drawn in vector: the real trophies' shapes (stylized, no traced
// marks), the season's things (a ticket, a towel, a game ball). Its gradients are the splash's (#sp-*).
import { Component, Input, ViewEncapsulation } from '@angular/core';
import { HelmetLook, SHOE_LINES } from './splash.uniforms';
import type { Piece } from './splash.scene';
export type { Piece } from './splash.scene';


// (a maple leaf, the Conn Smythe's: its points round the center)
const LEAF: [number, number][] = [
  [0, -30], [5, -18], [12, -22], [10, -8], [23, -13], [19, -4], [29, -3], [18, 6], [21, 13], [4, 9], [3, 22],
  [-3, 22], [-4, 9], [-21, 13], [-18, 6], [-29, -3], [-19, -4], [-23, -13], [-10, -8], [-12, -22], [-5, -18],
];

// (the Selke's crown rim: arches between points, a bead on each point)
function crown(x0: number, x1: number, base: number, peak: number, n: number): string {
  const w = (x1 - x0) / n;
  let d = `M${x0} ${base}`;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w;
    d += ` L${a + w * 0.12} ${peak + 4} Q${a + w * 0.5} ${peak - 8} ${a + w * 0.88} ${peak + 4} L${a + w} ${base - 2}`;
  }
  return d + ` L${x1} ${base} Z`;
}

const SEAM = [[20, 44], [44, 24], [106, 24], [130, 44]];
function seamAt(t: number): [number, number, number, number] {
  const u = 1 - t;
  const p = (i: number) => u * u * u * SEAM[0][i] + 3 * u * u * t * SEAM[1][i] + 3 * u * t * t * SEAM[2][i] + t * t * t * SEAM[3][i];
  const d = (i: number) => 3 * u * u * (SEAM[1][i] - SEAM[0][i]) + 6 * u * t * (SEAM[2][i] - SEAM[1][i]) + 3 * t * t * (SEAM[3][i] - SEAM[2][i]);
  return [p(0), p(1), d(0), d(1)];
}
function laceRun(): string {
  const pts = Array.from({ length: 13 }, (_, i) => seamAt(0.33 + (0.34 * i) / 12));
  return 'M' + pts.map(([x, y]) => x.toFixed(2) + ' ' + y.toFixed(2)).join(' L');
}
function laces() {
  return Array.from({ length: 8 }, (_, i) => {
    const [x, y, dx, dy] = seamAt(0.355 + (0.29 * i) / 7);
    const n = Math.hypot(dx, dy);
    const [nx, ny] = [-dy / n, dx / n];
    const r = (v: number) => +v.toFixed(2);
    return { x1: r(x - nx * 3.2), y1: r(y - ny * 3.2), x2: r(x + nx * 3.2), y2: r(y + ny * 3.2) };
  });
}

@Component({
  selector: 'splash-piece',
  standalone: true,
  templateUrl: './splash-piece.component.html',
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: contents' },
})
export class SplashPiece {
  @Input() it!: Piece;
  @Input() logo = '';

  readonly leaf = 'M' + LEAF.map(([x, y]) => `${x} ${y}`).join(' L') + ' Z';
  readonly crown = crown(10, 160, 20, 6, 8);
  readonly crownBeads = Array.from({ length: 8 }, (_, i) => 10 + (150 / 8) * (i + 0.5));

  // The Commissioner's Trophy's ring of flags: each pole from the base's ring up and out, the far ones first
  readonly flags = Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    // (the ring seen from a little above: the front poles end lowest, the back ones highest)
    return { bx: 48 * sin, tx: 52 * sin, by: 7 * cos, ty: 22 + 18 * cos, front: cos > 0, dir: sin >= 0 ? 1 : -1, z: cos };
  }).sort((a, b) => a.z - b.z);

  // The helmet's shell, facing right: the back of the shell, the crown, the brow, the face opening, the jaw flap
  // down to the chin, the bottom edge back to the neck
  readonly shell =
    'M30 100 C14 84 14 46 40 26 C62 8 104 8 124 28 C134 38 136 50 132 58 L114 62 C108 70 108 80 114 88 L122 104 C110 112 92 112 80 106 L64 104 C50 106 38 106 30 100 Z';

  // The ball's lace, on its top seam (the cubic 14,44 40,26 110,26 136,44): the run along it and eight cross-laces
  // square to it, each through two stitch holes
  readonly laceRun = laceRun();

  // The NFL ball side-on: 11 in long, 22 in round the middle, so about 0.62 as deep as it's long; the ends full,
  // rounding to a slight point
  readonly ball = 'M20 44 C27 23 50 11 75 11 C100 11 123 23 130 44 C123 65 100 77 75 77 C50 77 27 65 20 44 Z';

  // The helmet's look (the team's helmet table: its stripes, a fade, the mask's color), and its stripes as drawn
  hm(): Required<Pick<HelmetLook, 'mask'>> & HelmetLook {
    return { mask: '#7a8189', ...this.it.helmet };
  }

  stripes(): { color: string; w: number; dy: number }[] {
    const h = this.it.helmet;
    const a = h?.colors?.[0] ?? 'var(--c2)';
    const b = h?.colors?.[1] ?? '#ffffff';
    switch (h?.stripe) {
      case 'single':
        return [{ color: a, w: 9, dy: 0 }];
      case 'double':
        return [{ color: a, w: 3.4, dy: -3.4 }, { color: a, w: 3.4, dy: 3.4 }];
      case 'triple':
        return [{ color: b, w: 2.2, dy: -5.6 }, { color: a, w: 6, dy: 0 }, { color: b, w: 2.2, dy: 5.6 }];
      default:
        return [];
    }
  }
  readonly laces = laces();

  readonly bars = Array.from({ length: 34 }, (_, i) => ((i * 7) % 5) + 1);

  shoe() {
    return SHOE_LINES[this.it.line ?? 'generic'] ?? SHOE_LINES['generic'];
  }

  // A line's size on its plate: its own size, or smaller to fit its width (letters never squeezed or stretched;
  // the engraving capitals run about 0.84 em a letter with their spacing)
  fs(text: string | undefined, width: number, base: number, k = 0.84): number {
    const n = (text ?? '').length || 1;
    return Math.min(base, +(width / (n * k)).toFixed(2));
  }

  // An octagon, flat on top (a plaque's inlay, a belt's side plates)
  oct(cx: number, cy: number, r: number): string {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = ((i * 45 + 22.5) * Math.PI) / 180;
      return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    });
    return 'M' + pts.join(' L') + ' Z';
  }

  // A long octagon (the belt's center plate): its half width and height, its corners cut by c
  octWide(cx: number, cy: number, hw: number, hh: number, c: number): string {
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
    return `M${x0 + c} ${y0} H${x1 - c} L${x1} ${y0 + c} V${y1 - c} L${x1 - c} ${y1} H${x0 + c} L${x0} ${y1 - c} V${y0 + c} Z`;
  }

  // (a line longer than its plate: squeezed to the plate)
  fit(text: string | undefined, chars: number, len: number): number | null {
    return text && text.length > chars ? len : null;
  }

  line(i: number): string {
    return this.it.lines?.[i] ?? '';
  }
}
