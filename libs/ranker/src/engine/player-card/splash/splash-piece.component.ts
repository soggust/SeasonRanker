// One piece on the splash, drawn in vector: the real trophies' shapes (stylized, no traced
// marks), the season's things (a ticket, a towel, a game ball). Its gradients are the splash's (#sp-*).
import { Component, Input, ViewEncapsulation } from '@angular/core';
import { HelmetLook, SHOE_LINES } from './splash.uniforms';
import { GEAR_BASES, HI_DPI, INFO_CARD, PROP_IMAGES, TINTED, TextBaseArt, propHref, propImage, textBaseArt } from './splash.images';
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

// A ball's info card: the placard's photo under it, its words set on the plate
interface Card {
  href: string;
  x: number;
  w: number;
  h: number;
  texts: { text: string; size: number; y: number }[];
}
// (the props whose words go on an info card: the game balls, the milestone ball, the puck)
const CARDED = new Set(['game-ball', 'nba-game-ball', 'milestone-ball', 'puck']);

interface GearArt {
  shell: string;
  stripe: string;
  decal: { x: number; y: number; w: number; h: number };
  upper: number;
  num: { x: number; y: number };
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

  // ---- The prop's photo (splash.images.ts), when its prop has one and it isn't a tinted base (those draw
  // themselves): the file, its box (100 tall, its aspect wide, a plate's 12 under it when it has words), the
  // plate's place and its words
  img(): { href: string; w: number; h: number; plate: { x: number; w: number; lines: string[] } | null; card: Card | null } | null {
    const key = propImage(this.it.id, this.line(0));
    if (!key || TINTED.has(key)) return null;
    const w = +(PROP_IMAGES[key] * 100).toFixed(2);
    const lines = this.plateLines();
    if (lines.length && CARDED.has(key)) {
      // (a ball's or a puck's words on a photographed info card under it, 30 tall; the ball above it)
      const ca = PROP_IMAGES[INFO_CARD.key] ?? 1.5;
      const ch = 30, cw = +(ca * ch).toFixed(2);
      const box = INFO_CARD.boxes[0];
      const texts = lines.slice(0, 2).map((text, i, all) => {
        const row = (box.h * ch) / all.length;
        const size = +Math.min(box.max ?? 10, row * 0.82, (box.w * cw) / (Math.max(1, text.length) * 0.84)).toFixed(2);
        return { text, size, y: +(100 + box.y * ch + row * i + row / 2 + size * 0.35).toFixed(2) };
      });
      return { href: propHref(key, HI_DPI), w: Math.max(w, cw), h: 100 + ch, plate: null, card: { href: propHref(INFO_CARD.key, HI_DPI), x: +((Math.max(w, cw) - cw) / 2).toFixed(2), w: cw, h: ch, texts } };
    }
    const pw = Math.min(70, Math.max(30, +(w * 0.85).toFixed(2)));
    return { href: propHref(key, HI_DPI), w, h: lines.length ? 112 : 100, plate: lines.length ? { x: +((w - pw) / 2).toFixed(2), w: pw, lines } : null, card: null };
  }

  // The brass plate's words under a photographed prop: the engraving the vector put on the object (two lines at
  // most; the Lombardi's and the conference trophies' read as one line)
  plateLines(): string[] {
    const l = (this.it.lines ?? []).filter((x) => !!x && x.trim());
    if (!l.length) return [];
    switch (this.it.t) {
      case 'lombardi':
        return ['Super Bowl ' + l[0]];
      case 'conf':
        return [l[0] + ' Champions'];
      default:
        return l.slice(0, 2);
    }
  }

  // The piece's blank base and its words on it (splash.images.ts TEXT_BASES), when it has one: the file and
  // everything placed, built once per piece and its words
  private tbCache: { k: string; art: (TextBaseArt & { href: string }) | null } | null = null;
  tbase(): (TextBaseArt & { href: string }) | null {
    const lines = this.it.lines ?? [];
    const k = this.it.t + '|' + (this.it.id ?? '') + '|' + lines.join('|');
    if (this.tbCache?.k === k) return this.tbCache.art;
    const art = textBaseArt(this.it.t, this.it.id, lines);
    this.tbCache = { k, art: art ? { ...art, href: propHref(art.key, HI_DPI) } : null };
    return this.tbCache.art;
  }

  // A tinted base's photo (the helmet, the cap, the sneaker): the file and its box, 100 tall
  base(key: string): { href: string; w: number } | null {
    const aspect = PROP_IMAGES[key];
    return aspect ? { href: propHref(key, HI_DPI), w: +(aspect * 100).toFixed(2) } : null;
  }

  // The gear bases' anchors (fractions of the photo's box) in the box's units, for this piece's base
  private gearCache: { w: number; art: GearArt } | null = null;
  gear(w: number): GearArt {
    if (this.gearCache?.w === w) return this.gearCache.art;
    const f = (d: string) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${(+x * w).toFixed(2)} ${(+y * 100).toFixed(2)}`);
    const box = (b: { x: number; y: number; w: number; h: number }) => ({ x: +(b.x * w).toFixed(2), y: b.y * 100, w: +(b.w * w).toFixed(2), h: b.h * 100 });
    const g = GEAR_BASES;
    const art: GearArt =
      this.it.t === 'helmet'
        ? { shell: f(g.helmet.shell), stripe: f(g.helmet.stripe), decal: box(g.helmet.decal), upper: 100, num: { x: 0, y: 0 } }
        : this.it.t === 'cap'
          ? { shell: '', stripe: '', decal: box(g.cap.decal), upper: 100, num: { x: 0, y: 0 } }
          : { shell: '', stripe: '', decal: { x: 0, y: 0, w: 0, h: 0 }, upper: g.shoe.upper * 100, num: { x: +(g.shoe.num.x * w).toFixed(2), y: g.shoe.num.y * 100 } };
    this.gearCache = { w, art };
    return art;
  }
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

  // (a line that is a year: "2024", "2023–24" reads as its first year; 0 when it isn't one)
  year(i: number): number {
    return Number((this.line(i).match(/\d{4}/) ?? [0])[0]);
  }
}
