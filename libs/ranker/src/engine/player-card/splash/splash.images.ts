// The splash's photographed props (libs/ranker/src/assets/props, served at assets/props/): a studio shot of each
// real object, cut out with alpha, as a WebP 400 and 800 tall. A prop with a photo draws it instead of its
// vector (the vector stays as the fallback); the white BASES (the four jersey cuts, the helmet, the sneaker, the
// cap) are tinted with the kit's color and the kit's details are drawn over them at the anchors below. No
// Angular here: the tests load it as it is.
//
//   PROP_IMAGES   each image's aspect (its width over its height, from the trimmed cut-out), by the prop's id
//                 (the NBA conference trophy by its conference; the jersey bases by their cut): the scene sizes
//                 the slot from this before the image loads, so nothing shifts
//   propImage()   the image a piece draws, by its prop id and its words
//   propHref()    the file: the 400 on phones and ordinary screens, the 800 on a dense desktop screen

export const PROP_IMAGES: Record<string, number> = {
  'nfl-lombardi': 0.406,
  'nfl-afc-trophy': 0.924,
  'nfl-nfc-trophy': 0.583,
  'nfl-honors': 0.399,
  'game-ball': 1.09,
  'deflated-football': 1.022,
  'nfl-helmet': 1.08,
  'nhl-stanley-cup': 0.843,
  'nhl-wales-trophy': 0.369,
  'nhl-campbell-bowl': 0.874,
  'nhl-hart': 0.385,
  'nhl-selke': 0.725,
  'nhl-conn-smythe': 1.09,
  'nhl-calder': 1.111,
  'nhl-vezina': 0.9,
  'nhl-norris': 1.093,
  'puck': 1.269,
  'hockey-stick': 0.384,
  'nba-obrien': 0.57,
  'nba-jordan-mvp': 1.026,
  'nba-conf-trophy-east': 0.621,
  'nba-conf-trophy-west': 0.627,
  'nba-game-ball': 0.748,
  'signature-shoe': 1.485,
  'mlb-commissioners-trophy': 0.599,
  'mlb-mvp': 0.958,
  'mlb-cy-young': 0.718,
  'mlb-gold-glove': 0.819,
  'mlb-silver-slugger': 0.676,
  'milestone-ball': 1,
  'bats': 1.034,
  'fielders-glove': 0.899,
  'ball-cap': 1.364,
  'title-belt': 2.064,
  'fight-gloves': 1.173,
  'ring-box': 0.815,
  'sunscreen': 0.365,
  'golf-bag': 1.034,
  'golf-ball': 0.501,
  'jersey-football': 0.621,
  'jersey-basketball': 0.486,
  'jersey-hockey': 0.616,
  'jersey-baseball': 0.642,
  // (the blank bases the vector pieces draw on: TEXT_BASES, INFO_CARD, the office's desk nameplate)
  'info-placard': 1.264,
  'plaque-wood': 1.073,
  'plaque-round': 0.825,
  'roundel': 0.522,
  'pennant-base': 1.448,
  'banner-base': 0.52,
  'ticket-stub': 1.765,
  'boarding-pass': 1.357,
  'scorecard': 1.599,
  'beach-towel-base': 1.841,
  'whiteboard': 0.976,
  'team-frame': 1.222,
  'desk-nameplate': 1.526,
};

// The white bases: tinted, with the kit's details drawn over them (the piece draws these itself, not as a plain
// photo); the jersey bases are the splash's, not a piece's
export const TINTED = new Set(['nfl-helmet', 'signature-shoe', 'ball-cap']);
const JERSEY_BASE = /^jersey-/;

// The image a prop draws, by its id and its words (the NBA's conference trophy: the East's or the West's by its
// first line); none when it has no photo
export function propImage(id: string | undefined, line0 = ''): string | undefined {
  if (!id) return undefined;
  const key = id === 'nba-conf-trophy' ? (/West/i.test(line0) ? 'nba-conf-trophy-west' : 'nba-conf-trophy-east') : id;
  // (a blank base that shares a prop's name, the ticket stub's or the whiteboard's, is the piece's to draw on, not its photo)
  return key in PROP_IMAGES && !JERSEY_BASE.test(key) && !BASE_KEYS.has(key) ? key : undefined;
}

export function propHref(key: string, hi: boolean): string {
  return `assets/props/${key}-${hi ? 800 : 400}.webp`;
}

// A dense desktop screen gets the 800s; phones and ordinary screens the 400s (decided once)
export const HI_DPI = typeof window !== 'undefined' && window.devicePixelRatio > 1.5 && window.innerWidth >= 700;

// ---- The jersey bases' anchors. Each base is placed in the jersey's own drawing space (viewBox -4 -18 128 164:
// the collar's top at y 10, the hem at 142, the body centered on x 60) by its own landmarks, measured on the
// photo as fractions of its width and height: where the jersey starts under the hanger's hook (top), its hem
// (bottom), the body's center and its sides, the cuffs (a line along each sleeve's end: a band runs parallel to
// it, up the sleeve), the shoulders, the neck. A base is stretched a little wider than its photo (sx) toward the
// vector's proportions; the kit's details are placed from these, in fractions, and resolved to drawing units by
// jerseyAnchors().
export interface Cuff {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dx: number; // the direction up the sleeve from the cuff (unit-ish, in fractions), a band's offset runs along it
  dy: number;
}
export interface JerseyBase {
  top: number;
  bottom: number;
  cx: number;
  body: [number, number];
  sx: number;
  nameY: number; // the name's arc: its ends' y, and its half width (a fraction of the body's width)
  nameHalf: number;
  numY: number; // the number's baseline
  numK: number; // its size over the body's width
  tv?: [[number, number], [number, number]]; // football's sleeve-cap numbers: each one's center
  tvLean?: number; // how far each leans with its sleeve (degrees; the left one the other way)
  cuffs?: [Cuff, Cuff]; // the sleeves' ends (football, baseball: a band runs along each)
  arms?: [[number, number], [number, number]]; // hockey's forearms: each sleeve's x range, the bands' center y
  armY?: number;
  // each sleeve's region (left, right): closed paths in fractions, measured on the photo from the shoulder seam
  // to the cuff; a sleeve's bands are clipped to it, so no band crosses onto the body
  sleeves?: [string, string];
  neck: string; // the neckline, a path in fractions (the collar's trim)
  yoke?: string; // the shoulders, a closed path in fractions
  panels?: [[number, number], [number, number]]; // the body's side panels: each one's x range
  panelY?: number; // where they start
  armholes?: string; // a tank's armholes, a path in fractions
  underL?: string; // a vest's undershirt sleeves, closed paths in fractions
  underR?: string;
}
// (every base is drawn as the BACK of the jersey: the name arched over the number, the sleeves' bands, the yoke
// and the hem where the kit has them, pinstripes; nothing a front carries. The baseball base's placket shows
// faintly through a light kit: the photo is a front, re-shot as a back when the owner says)
export const JERSEY_BASES: Record<string, JerseyBase> = {
  football: {
    top: 0.14, bottom: 0.98, cx: 0.45, body: [0.14, 0.76], sx: 1.2,
    nameY: 0.33, nameHalf: 0.46, numY: 0.72, numK: 0.72,
    // (the TV numbers on the sleeve caps, centered on each sleeve's visible face, measured on the photo: lower
    // and further out than the shoulder seam; each leans with its sleeve and is squashed a little as the cap
    // curves away)
    tv: [[0.115, 0.4], [0.835, 0.41]],
    tvLean: 14,
    cuffs: [{ x1: 0.02, y1: 0.49, x2: 0.15, y2: 0.575, dx: 0.49, dy: -0.87 }, { x1: 0.97, y1: 0.52, x2: 0.76, y2: 0.6, dx: -0.49, dy: -0.87 }],
    sleeves: ['M-0.05 0.08 L0.32 0.08 L0.32 0.18 L0.15 0.6 L-0.05 0.66 Z', 'M1.05 0.08 L0.6 0.08 L0.6 0.18 L0.75 0.64 L1.05 0.7 Z'],
    neck: 'M0.33 0.14 C0.38 0.19 0.52 0.19 0.57 0.14',
    yoke: 'M-0.05 -0.05 L1.05 -0.05 L1.05 0.24 C0.8 0.3 0.6 0.32 0.45 0.32 C0.3 0.32 0.1 0.3 -0.05 0.24 Z',
    panels: [[0.14, 0.2], [0.7, 0.76]], panelY: 0.58,
  },
  basketball: {
    top: 0.16, bottom: 0.98, cx: 0.495, body: [0.09, 0.9], sx: 1.2,
    nameY: 0.36, nameHalf: 0.4, numY: 0.74, numK: 0.66,
    neck: 'M0.33 0.16 C0.38 0.28 0.62 0.28 0.67 0.16',
    armholes: 'M0.24 0.16 C0.2 0.26 0.12 0.34 0.09 0.44 M0.75 0.16 C0.79 0.26 0.87 0.34 0.9 0.44',
    panels: [[0.09, 0.16], [0.83, 0.9]], panelY: 0.44,
  },
  hockey: {
    top: 0.11, bottom: 0.98, cx: 0.52, body: [0.27, 0.77], sx: 1.25,
    nameY: 0.3, nameHalf: 0.46, numY: 0.66, numK: 0.72,
    arms: [[0.02, 0.25], [0.79, 0.98]], armY: 0.74,
    sleeves: ['M-0.05 0.12 L0.3 0.12 L0.26 0.4 L0.26 0.92 L-0.05 0.92 Z', 'M1.05 0.12 L0.72 0.12 L0.77 0.4 L0.78 0.92 L1.05 0.92 Z'],
    neck: 'M0.42 0.12 L0.52 0.26 L0.62 0.12',
    yoke: 'M-0.05 -0.05 L1.05 -0.05 L1.05 0.28 C0.8 0.38 0.65 0.42 0.52 0.42 C0.39 0.42 0.24 0.38 -0.05 0.28 Z',
  },
  baseball: {
    top: 0.16, bottom: 0.98, cx: 0.48, body: [0.19, 0.78], sx: 1.2,
    nameY: 0.33, nameHalf: 0.46, numY: 0.72, numK: 0.72,
    cuffs: [{ x1: 0.03, y1: 0.49, x2: 0.18, y2: 0.555, dx: 0.35, dy: -0.94 }, { x1: 0.95, y1: 0.5, x2: 0.79, y2: 0.56, dx: -0.35, dy: -0.94 }],
    sleeves: ['M-0.05 0.1 L0.33 0.1 L0.33 0.17 L0.19 0.58 L-0.05 0.64 Z', 'M1.05 0.1 L0.65 0.1 L0.65 0.17 L0.78 0.6 L1.05 0.66 Z'],
    neck: 'M0.36 0.16 L0.48 0.27 L0.6 0.16',
    underL: 'M0.3 0.16 L0 0.45 L0 0.62 L0.18 0.57 L0.18 0.16 Z', underR: 'M0.66 0.16 L1 0.45 L1 0.62 L0.78 0.57 L0.78 0.16 Z',
  },
};

// A base resolved to the jersey's drawing units: the photo's box, and every anchor as a point or a path there
export interface JerseyAnchors {
  img: { x: number; y: number; w: number; h: number };
  bodyX: [number, number];
  bodyW: number;
  nameArc: string;
  nameK: number; // the name's size over the vector's (its arc is narrower or wider than the vector's 66)
  markK: number; // the wordmark's, over the vector's 84
  num: { x: number; y: number; size: number };
  tv?: [{ x: number; y: number; transform: string }, { x: number; y: number; transform: string }];
  cuffs?: { x1: number; y1: number; x2: number; y2: number; dx: number; dy: number }[];
  arms?: { x: number; w: number; y: number }[];
  sleeves?: string[]; // each sleeve's clip, a closed path in drawing units
  neck: string;
  yoke?: string;
  panels?: { x: number; w: number; y: number; h: number }[];
  armholes?: string;
  under?: string[];
  pins: number[];
  hemY: number;
  pt: (fx: number, fy: number) => [number, number];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function jerseyAnchors(cut: string): JerseyAnchors | null {
  const b = JERSEY_BASES[cut];
  const aspect = PROP_IMAGES[`jersey-${cut}`];
  if (!b || !aspect) return null;
  const h = 132 / (b.bottom - b.top);
  const w = h * aspect * b.sx;
  const x = 60 - b.cx * w;
  const y = 10 - b.top * h;
  const pt = (fx: number, fy: number): [number, number] => [r2(x + fx * w), r2(y + fy * h)];
  // (a path written in fractions, resolved: each number pair becomes a point; so only M, L, C, Q and Z, never
  // the one-number H and V)
  const path = (d: string) =>
    d.replace(/(-?[\d.]+)\s+(-?[\d.]+)/g, (_, fx, fy) => {
      const [px, py] = pt(+fx, +fy);
      return `${px} ${py}`;
    });
  const bodyX: [number, number] = [pt(b.body[0], 0)[0], pt(b.body[1], 0)[0]];
  const bodyW = bodyX[1] - bodyX[0];
  const cx = (bodyX[0] + bodyX[1]) / 2;
  const half = r2(bodyW * b.nameHalf);
  const arc = (fy: number, hw: number) => {
    const [, ay] = pt(0, fy);
    return `M${r2(cx - hw)} ${ay} Q${r2(cx)} ${r2(ay - hw * 0.28)} ${r2(cx + hw)} ${ay}`;
  };
  const hemY = pt(0, b.bottom)[1];
  const pins: number[] = [];
  for (let px = bodyX[0] + 3; px < bodyX[1]; px += 8) pins.push(r2(px));
  return {
    img: { x: r2(x), y: r2(y), w: r2(w), h: r2(h) },
    bodyX,
    bodyW: r2(bodyW),
    nameArc: arc(b.nameY, half),
    nameK: r2((2 * half) / 66),
    markK: r2(bodyW / 84),
    num: { x: r2(cx), y: pt(0, b.numY)[1], size: r2(bodyW * b.numK) },
    tv: b.tv
      ? (b.tv.map((f, i) => {
          const [tx, ty] = pt(...f);
          const lean = (b.tvLean ?? 0) * (i === 0 ? -1 : 1);
          return { x: tx, y: ty, transform: lean ? `rotate(${lean} ${tx} ${ty}) translate(${tx} 0) scale(0.9 1) translate(${-tx} 0)` : '' };
        }) as [{ x: number; y: number; transform: string }, { x: number; y: number; transform: string }])
      : undefined,
    cuffs: b.cuffs?.map((c) => {
      const [x1, y1] = pt(c.x1, c.y1);
      const [x2, y2] = pt(c.x2, c.y2);
      // (the offset up the sleeve, in units: the fraction direction scaled by the box)
      const dx = c.dx * w, dy = c.dy * h;
      const n = Math.hypot(dx, dy);
      return { x1, y1, x2, y2, dx: r2(dx / n), dy: r2(dy / n) };
    }),
    arms: b.arms?.map(([f0, f1]) => ({ x: pt(f0, 0)[0], w: r2((f1 - f0) * w), y: pt(0, b.armY ?? 0.74)[1] })),
    sleeves: b.sleeves?.map(path),
    neck: path(b.neck),
    yoke: b.yoke ? path(b.yoke) : undefined,
    panels: b.panels?.map(([f0, f1]) => ({ x: pt(f0, 0)[0], w: r2((f1 - f0) * w), y: pt(0, b.panelY ?? 0.5)[1], h: r2(hemY - pt(0, b.panelY ?? 0.5)[1]) })),
    armholes: b.armholes ? path(b.armholes) : undefined,
    under: b.underL && b.underR ? [path(b.underL), path(b.underR)] : undefined,
    pins,
    hemY,
    pt,
  };
}

// ---- The tinted gear bases (the piece draws these: the photo over the kit's color, the details on top), as
// fractions of the photo's box: where the color goes (the helmet's shell, not its mask; the sneaker's upper, not
// its sole), the decal, the stripe over the crown, the number on the heel
export const GEAR_BASES = {
  // (faces left: the mask at the left; the shell from the brow over the crown to the back)
  helmet: {
    shell: 'M0.17 0.42 C0.19 0.16 0.4 0.02 0.62 0.02 C0.85 0.03 0.98 0.24 0.98 0.5 C0.98 0.72 0.9 0.94 0.7 0.98 L0.5 0.97 C0.46 0.9 0.42 0.8 0.4 0.7 L0.17 0.62 Z',
    stripe: 'M0.97 0.56 C0.96 0.26 0.82 0.04 0.6 0.03 C0.45 0.03 0.33 0.08 0.26 0.19',
    decal: { x: 0.49, y: 0.18, w: 0.4, h: 0.4 },
    gloss: 'M0.4 0.14 C0.5 0.07 0.66 0.06 0.8 0.12',
  },
  cap: { decal: { x: 0.38, y: 0.26, w: 0.28, h: 0.28 } },
  // (faces left: the heel at the right; the upper tinted down to the sole)
  shoe: { upper: 0.8, num: { x: 0.83, y: 0.5 } },
};

// ---- The blank bases the vector pieces draw on (TEXT_BASES, by the piece's type, or by the prop's id first: a
// season's plaque and a won round's differ): a photographed blank object, the piece's words set in its boxes,
// the team's mark in its box, a white felt tinted with the team's color. A piece can set its base more than once
// (the two honor plaques side by side).
//
// Each box was MEASURED on the photo (scratchpad grid.js: the red band of the stub, the brass plate of the
// plaque, the felt of the banner) and is given in fractions: of the photo's box, or, when the base has a PLANE,
// of that plane. A plane is the flat face the words sit on, as the photo shows it: its top-left corner, the
// edge along its width and the edge down its height, in fractions of the photo; the words are drawn in the
// plane's own square units and transformed onto it, so they lie ON the surface (the boarding pass's slight
// tilt, the scorecard's lean, the placard on its easel). A face turned away from the lens is narrower than it
// is tall (scaleX: the round plaque's disc, the medal's face). Letters are never squeezed: a line too long for
// its box is set smaller, or wrapped onto more rows where the box allows (wrap).
export interface Plane {
  o: [number, number]; // the face's top-left corner
  u: [number, number]; // its top edge, corner to corner (the width's direction)
  v: [number, number]; // its left edge, corner to corner (the height's direction)
  scaleX?: number; // the face seen turned: its width over what it would be face-on
  // a face the camera keystones (one side nearer, so taller: the plaque's plate, the desk nameplate): its four
  // corners as the photo has them, TL TR BR BL, in fractions; the words are then drawn on an HTML layer over
  // the photo with the projective map (CSS matrix3d) from their own flat box to this quad, computed once here
  q?: [[number, number], [number, number], [number, number], [number, number]];
}
export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  lines?: number[]; // the piece's lines it holds (PROPS[..].lines order); none when `text` is set
  text?: string; // a fixed label ("Final", "Passenger") instead of the piece's lines
  cls?: string; // the text's class (sp-engr dark by default)
  max?: number; // the biggest font size (in a 100-tall box's units)
  k?: number; // the letters' width over their size (0.84 for the engraving capitals, 0.56 for the block, 0.62 for the mono)
  anchor?: 'start' | 'middle' | 'end';
  hi?: boolean; // the engraving's lit edge under it (dark text on brass)
  rotate?: number; // the box's tilt (degrees, round its center)
  wrap?: number; // a single line's words wrapped onto up to this many rows, the size the biggest that fits
  arc?: 'top'; // the line set along an arc inside the box (a medal's rim)
}
// (a printed mark on the base: a barcode, the airline's plane, a rubber stamp)
export interface Mark {
  kind: 'barcode' | 'plane' | 'stamp';
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  rotate?: number;
}
export interface TextBase {
  key: string;
  tint?: boolean;
  logo?: { x: number; y: number; w: number; h: number };
  boxes: TextBox[];
  marks?: Mark[];
  plane?: Plane;
  noShadow?: boolean;
  copies?: number; // the base drawn this many times side by side (the honor plaques), the boxes' lines offset by `step` each copy
  step?: number;
  play?: { x: number; y: number; w: number; h: number }; // the whiteboard's play, drawn into this box
}
// (the type each object carries: the engraved serif on brass and silver, sewn felt block capitals on the banner
// and the pennant, the ticket mono and the printed block labels on the paper, a marker on the scorecard)
const FELT = 'sp-felt';
const MONO = 'sp-mono';
const PRINT = 'sp-print';
const MARKER = 'sp-marker dark';
// (the brass plate of the walnut plaque, measured on the photo: the camera stands to its right, so the plate's
// right side is a third taller than its left; the words are projected onto it)
const PLATE: Plane = { o: [0.09, 0.56], u: [0.75, -0.02], v: [-0.015, 0.24], q: [[0.09, 0.56], [0.84, 0.54], [0.84, 0.86], [0.075, 0.8]] };
const PLATE_BOXES: TextBox[] = [
  { x: 0.04, y: 0.08, w: 0.92, h: 0.42, lines: [0], max: 11 },
  { x: 0.04, y: 0.52, w: 0.92, h: 0.4, lines: [1], max: 10 },
];
// (the office's brass desk nameplate on its walnut base, measured: seen from its left, the left end nearer and
// taller; the coach's name projected onto the plate's face)
export const NAMEPLATE: Plane = { o: [0.11, 0.23], u: [0.735, -0.165], v: [0.07, 0.55], q: [[0.11, 0.23], [0.845, 0.065], [0.875, 0.5], [0.18, 0.78]] };
export const TEXT_BASES: Record<string, TextBase> = {
  // the honors: two walnut plaques side by side, the team's mark over each brass plate
  plaques: { key: 'plaque-wood', copies: 2, step: 2, logo: { x: 0.3, y: 0.09, w: 0.4, h: 0.4 }, plane: PLATE, boxes: PLATE_BOXES },
  // a season's plaque, Coach of the Year: the same plaque, its words on the plate
  plaque: { key: 'plaque-wood', logo: { x: 0.3, y: 0.09, w: 0.4, h: 0.4 }, plane: PLATE, boxes: PLATE_BOXES },
  coyplaque: {
    key: 'plaque-wood',
    logo: { x: 0.3, y: 0.09, w: 0.4, h: 0.4 },
    plane: PLATE,
    boxes: [
      { x: 0.04, y: 0.06, w: 0.92, h: 0.3, lines: [0], max: 8.5 },
      { x: 0.04, y: 0.37, w: 0.92, h: 0.27, lines: [1], max: 7.5 },
      { x: 0.04, y: 0.66, w: 0.92, h: 0.3, lines: [2], max: 8 },
    ],
  },
  // a won round: the round black plaque, its words on the brass disc (seen turned: 0.78 as wide as it is tall)
  'round-plaque': {
    key: 'plaque-round',
    plane: { o: [0.185, 0.13], u: [0.71, 0], v: [0, 0.75], scaleX: 0.78 },
    boxes: [
      { x: 0.12, y: 0.32, w: 0.76, h: 0.17, lines: [0], max: 10 },
      { x: 0.12, y: 0.51, w: 0.76, h: 0.15, lines: [1], max: 8.5 },
    ],
  },
  // the playoffs: the silver medal on its ribbon, the team's mark on its face, the playoffs round the top of
  // the face and the season under the mark; the seed goes on the shelf's caption
  roundel: {
    key: 'roundel',
    logo: { x: 0.31, y: 0.62, w: 0.26, h: 0.15 },
    plane: { o: [0.055, 0.445], u: [0.77, 0], v: [0, 0.51], scaleX: 0.78 },
    boxes: [
      { x: 0.16, y: 0.16, w: 0.68, h: 0.68, lines: [0], arc: 'top', max: 5.6 },
      { x: 0.2, y: 0.72, w: 0.6, h: 0.16, lines: [1], max: 7 },
    ],
  },
  // a division's banner: white felt tinted the team's color, the mark at the top, the division's words stacked
  // down the felt (each row as wide as the felt allows), CHAMPIONS, the season in the second color
  banner: {
    key: 'banner-base',
    tint: true,
    noShadow: true,
    logo: { x: 0.33, y: 0.11, w: 0.32, h: 0.16 },
    boxes: [
      { x: 0.2, y: 0.3, w: 0.58, h: 0.24, lines: [0], cls: FELT, max: 9.5, k: 0.56, wrap: 2 },
      { x: 0.2, y: 0.56, w: 0.58, h: 0.1, lines: [1], cls: FELT, max: 9.5, k: 0.56 },
      { x: 0.2, y: 0.68, w: 0.58, h: 0.12, lines: [2], cls: FELT + ' yr', max: 11, k: 0.56 },
    ],
  },
  // a pennant: white felt tinted, the league, CHAMPIONS and the season set from the pole, each row as long as
  // the taper allows
  pennant: {
    key: 'pennant-base',
    tint: true,
    boxes: [
      { x: 0.13, y: 0.3, w: 0.52, h: 0.15, lines: [0], cls: FELT, max: 10, k: 0.56, anchor: 'start' },
      { x: 0.13, y: 0.47, w: 0.46, h: 0.14, lines: [1], cls: FELT, max: 11, k: 0.56, anchor: 'start' },
      { x: 0.13, y: 0.63, w: 0.34, h: 0.13, lines: [2], cls: FELT + ' yr', max: 11, k: 0.56, anchor: 'start' },
    ],
  },
  // where it ended: the ticket stub (flat, face-on). The round printed on its red band, the game in the ticket
  // mono, the date and the venue under it, FINAL and the score; a barcode down the torn stub
  stub: {
    key: 'ticket-stub',
    noShadow: true,
    boxes: [
      { x: 0.05, y: 0.075, w: 0.73, h: 0.165, lines: [0], cls: PRINT + ' light', max: 7, k: 0.62 },
      { x: 0.06, y: 0.29, w: 0.71, h: 0.22, lines: [1], cls: MONO + ' big', max: 14, k: 0.62 },
      { x: 0.06, y: 0.52, w: 0.71, h: 0.1, lines: [2], cls: MONO + ' dim', max: 6.2, k: 0.62 },
      { x: 0.08, y: 0.7, w: 0.22, h: 0.16, text: 'Final', cls: PRINT + ' dim', max: 6, k: 0.62, anchor: 'end' },
      { x: 0.33, y: 0.64, w: 0.42, h: 0.28, lines: [3], cls: MONO + ' big red', max: 16, k: 0.62, anchor: 'start' },
    ],
    marks: [{ kind: 'barcode', x: 0.86, y: 0.36, w: 0.07, h: 0.46 }],
  },
  // the season that ended early: the boarding pass to Cancún, lying on the shelf with a slight tilt (its plane
  // measured on the photo: the top edge falls 3° to the right). The airline on the band, the passenger, FROM
  // and TO big in the mono, DEPARTS and SEAT (his record), the stub with its barcode, the red ELIMINATED stamp
  pass: {
    key: 'boarding-pass',
    noShadow: true,
    // (measured on the photo: the top edge falls 4° to the right, the ends stand upright: a parallelogram)
    plane: { o: [0.03, 0.49], u: [0.75, 0.055], v: [0.006, 0.375] },
    boxes: [
      { x: 0.03, y: 0.03, w: 0.4, h: 0.18, text: 'Season Ranker Air', cls: PRINT + ' light', max: 4.4, k: 0.62, anchor: 'start' },
      { x: 0.36, y: 0.03, w: 0.24, h: 0.18, text: 'Boarding Pass', cls: PRINT + ' light c2', max: 4.4, k: 0.62, anchor: 'end' },
      { x: 0.03, y: 0.26, w: 0.3, h: 0.09, text: 'Passenger', cls: PRINT + ' dim', max: 3, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.35, w: 0.72, h: 0.16, lines: [0], cls: PRINT + ' bold', max: 6.4, k: 0.58, anchor: 'start' },
      { x: 0.03, y: 0.52, w: 0.2, h: 0.09, text: 'From', cls: PRINT + ' dim', max: 3, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.6, w: 0.25, h: 0.25, lines: [1], cls: MONO + ' big', max: 12, k: 0.62, anchor: 'start' },
      { x: 0.43, y: 0.52, w: 0.2, h: 0.09, text: 'To', cls: PRINT + ' dim', max: 3, k: 0.62, anchor: 'start' },
      { x: 0.43, y: 0.6, w: 0.25, h: 0.25, lines: [2], cls: MONO + ' big', max: 12, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.85, w: 0.2, h: 0.07, text: 'Departs', cls: PRINT + ' dim', max: 2.8, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.91, w: 0.36, h: 0.09, lines: [3], cls: MONO, max: 4.8, k: 0.62, anchor: 'start' },
      { x: 0.43, y: 0.85, w: 0.2, h: 0.07, text: 'Seat', cls: PRINT + ' dim', max: 2.8, k: 0.62, anchor: 'start' },
      { x: 0.43, y: 0.91, w: 0.3, h: 0.09, lines: [4], cls: MONO, max: 4.8, k: 0.62, anchor: 'start' },
      { x: 0.8, y: 0.28, w: 0.18, h: 0.12, text: 'Cancún', cls: PRINT + ' c1', max: 3.8, k: 0.62 },
    ],
    marks: [
      { kind: 'plane', x: 0.3, y: 0.63, w: 0.09, h: 0.2 },
      { kind: 'barcode', x: 0.81, y: 0.44, w: 0.16, h: 0.34 },
      { kind: 'stamp', x: 0.6, y: 0.74, w: 0.38, h: 0.2, text: 'Eliminated', rotate: -8 },
    ],
  },
  // the first team out: the golf scorecard standing like a tent, leaning back (its face's plane measured on the
  // photo); the card's heading printed, his record and the rest in pencil
  scorecard: {
    key: 'scorecard',
    noShadow: true,
    // (measured: the face leans back and to the right, its sides parallel)
    plane: { o: [0.235, 0.29], u: [0.545, -0.22], v: [0.075, 0.61] },
    boxes: [
      { x: 0.06, y: 0.05, w: 0.3, h: 0.1, text: 'Final card', cls: PRINT + ' green', max: 4, k: 0.62, anchor: 'start' },
      { x: 0.06, y: 0.16, w: 0.88, h: 0.14, lines: [0], cls: PRINT + ' bold', max: 5.5, k: 0.58, anchor: 'start' },
      { x: 0.1, y: 0.32, w: 0.8, h: 0.3, lines: [1], cls: MARKER, max: 16, k: 0.5 },
      { x: 0.06, y: 0.64, w: 0.88, h: 0.12, lines: [2], cls: MARKER, max: 5.2, k: 0.5 },
      { x: 0.06, y: 0.78, w: 0.88, h: 0.14, lines: [3], cls: 'sp-marker red', max: 6.5, k: 0.5 },
    ],
  },
  // the towel, packed early: white terry tinted
  towel: { key: 'beach-towel-base', tint: true, boxes: [] },
  // the office: the whiteboard, the play in marker, his record big in the corner; the framed mark on the desk
  whiteboard: { key: 'whiteboard', play: { x: 0.08, y: 0.22, w: 0.54, h: 0.6 }, boxes: [{ x: 0.63, y: 0.36, w: 0.3, h: 0.22, lines: [0], cls: 'sp-marker blue board', max: 24, k: 0.56 }, { x: 0.63, y: 0.6, w: 0.3, h: 0.1, lines: [1], cls: 'sp-marker board small', max: 9 }, { x: 0.12, y: 0.12, w: 0.4, h: 0.09, lines: [2], cls: 'sp-marker board small', max: 9, anchor: 'start' }] },
  frame: { key: 'team-frame', logo: { x: 0.36, y: 0.22, w: 0.27, h: 0.4 }, boxes: [] },
};

// The info card under a photographed ball or puck: the brass plate on its easel, leaning back (its plane
// measured on the photo), the words engraved on it; and every base key that isn't a prop's
export const INFO_CARD: TextBase = {
  key: 'info-placard',
  // (measured: the plate leans back on its easel, turned 10° up to the right)
  plane: { o: [0.05, 0.25], u: [0.84, -0.18], v: [0.06, 0.49] },
  boxes: [
    { x: 0.06, y: 0.12, w: 0.88, h: 0.4, lines: [0], max: 18 },
    { x: 0.06, y: 0.55, w: 0.88, h: 0.33, lines: [1], max: 13 },
  ],
};
export const BASE_KEYS = new Set(['info-placard', 'desk-nameplate', ...Object.values(TEXT_BASES).map((b) => b.key)]);

export interface TextArt {
  x: number;
  y: number;
  size: number;
  text: string;
  cls: string;
  anchor: string;
  hi: boolean; // drawn twice: a lit (or shadowed) copy offset under it, then the letters
  hiDx: number;
  hiDy: number;
  transform: string | null;
  arc?: string; // the path the line runs along (a medal's rim), in place of x and y
}
export interface MarkArt {
  kind: Mark['kind'];
  transform: string; // the mark's box onto the base: translate (and the plane)
  w: number;
  h: number;
  rects?: { x: number; y: number; w: number; h: number }[]; // a barcode's bars
  text?: string;
  size?: number;
}
// (a keystoned face's words: drawn flat in their own box, w by h units, on a layer projected onto the face)
export interface OverlayArt {
  w: number;
  h: number;
  m3d: string; // the CSS matrix3d, in the base's units
  texts: TextArt[];
}
export interface TextBaseArt {
  key: string;
  w: number;
  tint?: boolean;
  noShadow?: boolean;
  imgs: { x: number; y: number; w: number; h: number }[];
  logos: { x: number; y: number; w: number; h: number }[];
  texts: TextArt[];
  marks: MarkArt[];
  overlays: OverlayArt[];
  play?: string;
}

const r2b = (n: number) => Math.round(n * 100) / 100;

// The base for a piece: by the prop's id, then by the piece's type; none when neither has one
export function textBaseFor(t: string, id?: string): TextBase | undefined {
  return (id && TEXT_BASES[id]) || TEXT_BASES[t];
}

// The projective map from the flat box (0 0, w 0, w h, 0 h) onto a quad (TL TR BR BL), as a CSS matrix3d: the
// 3x3 homography solved from the four corners (the classic eight equations), its terms laid into the 4x4
export function homography(w: number, h: number, q: [number, number][]): string {
  const src: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
  // (solve A p = b for p = [a b c d e f g h]: x' = (a x + b y + c) / (g x + h y + 1), y' = (d x + e y + f) / (g x + h y + 1))
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = q[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  // (Gauss-Jordan elimination with partial pivoting)
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !M[c][c]) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const p = M.map((row, i) => row[n] / row[i]);
  // (the perspective terms are small, about a thousandth a unit: kept to seven places)
  const r = (v: number) => +v.toFixed(7);
  // (column-major: x's column, y's column, z, then the translation; the perspective terms g h in the fourth row)
  return `matrix3d(${r(p[0])}, ${r(p[3])}, 0, ${r(p[6])}, ${r(p[1])}, ${r(p[4])}, 0, ${r(p[7])}, 0, 0, 1, 0, ${r(p[2])}, ${r(p[5])}, 0, 1)`;
}

// A plane's flat box: its width and height in the base's units (the mean of the opposite edges of its quad,
// or its edges' lengths), and the quad in units
export function planeBox(p: Plane, iw: number, ih = 100): { pw: number; ph: number; quad: [number, number][] | null } {
  const sx = p.scaleX ?? 1;
  if (p.q) {
    const quad = p.q.map(([fx, fy]) => [fx * iw, fy * ih] as [number, number]);
    const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const pw = (len(quad[0], quad[1]) + len(quad[3], quad[2])) / 2 / sx;
    const ph = (len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2;
    return { pw, ph, quad };
  }
  const ux = p.u[0] * iw, uy = p.u[1] * ih, vx = p.v[0] * iw, vy = p.v[1] * ih;
  return { pw: Math.hypot(ux, uy) / sx, ph: Math.hypot(vx, vy), quad: null };
}

// The aspect (width over height) a prop stands with: its photo's, a text base's (one of the honor plaques: the
// pair side by side is two objects, each capped on its own), else about that of a trophy
export function aspectOf(id: string | undefined, piece: string): number {
  const key = propImage(id);
  if (key) return PROP_IMAGES[key];
  const b = textBaseFor(piece, id);
  if (b && PROP_IMAGES[b.key]) return PROP_IMAGES[b.key];
  return 0.6;
}

// (the lit edge under dark engraving, the shadow a sewn felt letter throws; printed ink throws none)
function relief(cls: string): { hi: boolean; dx: number; dy: number } {
  if (/sp-engr/.test(cls)) return { hi: true, dx: 0, dy: 0.4 };
  if (/sp-felt/.test(cls)) return { hi: true, dx: 0.5, dy: 0.7 };
  return { hi: false, dx: 0, dy: 0 };
}

// A line's words over up to n rows: the split (by letters, as even as it can be) whose longest row is shortest
function wrapWords(text: string, n: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (n < 2 || words.length < 2) return [text];
  let best: string[] = [text];
  let bestLen = text.length;
  const rec = (from: number, rowsLeft: number, acc: string[]) => {
    if (rowsLeft === 1 || from >= words.length - 1) {
      const rows = [...acc, words.slice(from).join(' ')];
      const len = Math.max(...rows.map((r) => r.length));
      if (len < bestLen) (bestLen = len), (best = rows);
      return;
    }
    for (let i = from + 1; i <= words.length - (rowsLeft - 1); i++) rec(i, rowsLeft - 1, [...acc, words.slice(from, i).join(' ')]);
  };
  rec(0, Math.min(n, words.length), []);
  return best;
}

// The base resolved to a 100-tall drawing: each copy's photo box, the mark's box, every line's place and size
// (a line too long for its box gets smaller, never squeezed; one that may wrap takes more rows first), the
// printed marks; the copies' lines are the piece's, offset. With a plane, the boxes are laid out in the plane's
// own units and carry its transform, so the words sit on the face as the photo shows it
export function textBaseArt(t: string, id: string | undefined, lines: string[], fontK = 0.84, base?: TextBase, minSize = 0): TextBaseArt | null {
  const b = base ?? textBaseFor(t, id);
  const aspect = b && PROP_IMAGES[b.key];
  if (!b || !aspect) return null;
  const copies = b.copies ?? 1;
  const step = b.step ?? 0;
  // (the second plaque only when its lines are there)
  const have = (c: number) => c === 0 || b.boxes.some((box) => (box.lines ?? []).some((i) => !!lines[i + c * step]));
  const n = Math.max(1, Array.from({ length: copies }, (_, c) => c).filter(have).length);
  const gap = n > 1 ? 4 : 0;
  const iw = aspect * 100;
  const w = r2b(n * iw + (n - 1) * gap);
  const imgs: TextBaseArt['imgs'] = [];
  const logos: TextBaseArt['logos'] = [];
  const texts: TextArt[] = [];
  const marks: MarkArt[] = [];
  const overlays: OverlayArt[] = [];
  let play: string | undefined;
  for (let c = 0; c < n; c++) {
    const x0 = c * (iw + gap);
    const px = (fx: number) => r2b(x0 + fx * iw);
    const py = (fy: number) => r2b(fy * 100);
    imgs.push({ x: r2b(x0), y: 0, w: r2b(iw), h: 100 });
    if (b.logo) logos.push({ x: px(b.logo.x), y: py(b.logo.y), w: r2b(b.logo.w * iw), h: r2b(b.logo.h * 100) });
    if (b.play) {
      const s = Math.min((b.play.w * iw) / 300, (b.play.h * 100) / 150);
      play = `translate(${px(b.play.x)} ${py(b.play.y)}) scale(${r2b(s)})`;
    }
    // the surface: the plane's box in its own units and the transform onto the photo (an affine for a face
    // whose sides stay parallel; a keystoned face gets its own projected layer), or the photo's box itself
    let pw = iw, ph = 100, plane: string | null = null;
    let overlay: OverlayArt | null = null;
    if (b.plane) {
      const p = b.plane;
      const box = planeBox(p, iw);
      pw = box.pw;
      ph = box.ph;
      if (box.quad) {
        overlay = { w: r2b(pw), h: r2b(ph), m3d: homography(pw, ph, box.quad.map(([x, y]) => [x + x0, y])), texts: [] };
        overlays.push(overlay);
      } else {
        const ux = p.u[0] * iw, uy = p.u[1] * 100, vx = p.v[0] * iw, vy = p.v[1] * 100;
        const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
        const sx = p.scaleX ?? 1;
        plane = `matrix(${r2b((ux / lu) * sx)} ${r2b((uy / lu) * sx)} ${r2b(vx / lv)} ${r2b(vy / lv)} ${px(p.o[0])} ${py(p.o[1])})`;
      }
    }
    const onPlane = !!b.plane;
    const lx = (fx: number) => r2b(onPlane ? fx * pw : px(fx));
    const ly = (fy: number) => r2b(onPlane ? fy * ph : py(fy));
    const join = (...ts: (string | null)[]) => ts.filter(Boolean).join(' ') || null;
    // (a line that would set under the smallest readable size is left to the shelf's caption)
    const put = (t: TextArt) => {
      if (t.size < minSize) return;
      (overlay ? overlay.texts : texts).push(t);
    };
    for (const box of b.boxes) {
      // (a fixed label is printed on every copy that has words; a box's lines only where the piece has them)
      const ids = (box.lines ?? []).map((i) => i + c * step);
      let words = box.text ? (c === 0 || have(c) ? [box.text] : []) : ids.map((i) => lines[i] ?? '').filter((s) => s.trim());
      if (!words.length) continue;
      const bw = box.w * pw, bh = box.h * ph;
      const k = box.k ?? fontK;
      const cls = box.cls ?? 'sp-engr dark';
      const cx = lx(box.x + box.w / 2), cy = ly(box.y + box.h / 2);
      const rel = relief(cls);
      const tilt = box.rotate ? `rotate(${box.rotate} ${cx} ${cy})` : null;
      if (box.arc) {
        // (the line along the top of a circle inside the box: as big as the arc's length allows)
        const r = r2b(bw / 2);
        const text = words[0];
        const size = r2b(Math.min(box.max ?? 6, (Math.PI * r * 0.92) / (Math.max(1, text.length) * k)));
        const arc = `M${r2b(cx - r)} ${cy} A${r} ${r} 0 0 1 ${r2b(cx + r)} ${cy}`;
        put({ x: cx, y: cy, size, text, cls, anchor: 'middle', hi: rel.hi, hiDx: rel.dx, hiDy: rel.dy, transform: join(plane, tilt), arc });
        continue;
      }
      if (box.wrap && words.length === 1) {
        // (the rows that let the words stand biggest)
        let bestSize = 0;
        for (let rows = 1; rows <= box.wrap; rows++) {
          const split = wrapWords(words[0], rows);
          if (split.length !== rows) continue;
          const row = bh / rows;
          const size = Math.min(box.max ?? row * 0.8, row * 0.82, ...split.map((s) => bw / (Math.max(1, s.length) * k)));
          if (size > bestSize) (bestSize = size), (words = split);
        }
      }
      const row = bh / words.length;
      words.forEach((text, i) => {
        const max = Math.min(box.max ?? row * 0.8, row * 0.82);
        const size = r2b(Math.min(max, bw / (Math.max(1, text.length) * k)));
        const anchor = box.anchor ?? 'middle';
        const x = anchor === 'start' ? lx(box.x) : anchor === 'end' ? lx(box.x + box.w) : cx;
        const y = r2b(ly(box.y) + row * i + row / 2 + size * 0.35);
        put({ x, y, size, text, cls, anchor, hi: box.hi ?? rel.hi, hiDx: rel.dx, hiDy: rel.dy, transform: join(plane, tilt) });
      });
    }
    for (const m of b.marks ?? []) {
      const mw = r2b(m.w * pw), mh = r2b(m.h * ph);
      const at = `translate(${lx(m.x)} ${ly(m.y)})`;
      const tilt = m.rotate ? `rotate(${m.rotate} ${r2b(mw / 2)} ${r2b(mh / 2)})` : null;
      const art: MarkArt = { kind: m.kind, transform: join(plane, at, tilt)!, w: mw, h: mh, text: m.text };
      if (m.kind === 'barcode') {
        // (bars across the narrow way: a fixed run of widths, read the same every time)
        const across = mw > mh;
        const run = across ? mw : mh;
        const widths = Array.from({ length: 28 }, (_, i) => ((i * 7) % 5) + 1);
        const unit = run / (widths.reduce((s, x) => s + x, 0) + widths.length * 0.9);
        let p = 0;
        art.rects = widths.map((wd) => {
          const a = r2b(p * unit), len = r2b(wd * unit);
          p += wd + 0.9;
          return across ? { x: a, y: 0, w: len, h: mh } : { x: 0, y: a, w: mw, h: len };
        });
      }
      if (m.kind === 'stamp') art.size = r2b(Math.min(mh * 0.62, mw / (Math.max(1, (m.text ?? '').length) * 0.64)));
      marks.push(art);
    }
  }
  return { key: b.key, w, tint: b.tint, noShadow: b.noShadow, imgs, logos, texts, marks, overlays, play };
}
