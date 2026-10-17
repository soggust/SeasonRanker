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
  tv?: [[number, number], [number, number]]; // football's shoulder numbers
  cuffs?: [Cuff, Cuff]; // the sleeves' ends (football, baseball: a band runs along each)
  arms?: [[number, number], [number, number]]; // hockey's forearms: each sleeve's x range, the bands' center y
  armY?: number;
  neck: string; // the neckline, a path in fractions (the collar's trim)
  yoke?: string; // the shoulders, a closed path in fractions
  panels?: [[number, number], [number, number]]; // the body's side panels: each one's x range
  panelY?: number; // where they start
  armholes?: string; // a tank's armholes, a path in fractions
  placket?: number; // a baseball jersey's placket: its center x
  placketY?: number;
  markY?: number; // the wordmark's arc
  front?: [number, number]; // the front number
  underL?: string; // a vest's undershirt sleeves, closed paths in fractions
  underR?: string;
}
export const JERSEY_BASES: Record<string, JerseyBase> = {
  football: {
    top: 0.14, bottom: 0.98, cx: 0.45, body: [0.14, 0.76], sx: 1.2,
    nameY: 0.33, nameHalf: 0.46, numY: 0.72, numK: 0.72,
    tv: [[0.2, 0.3], [0.71, 0.3]],
    cuffs: [{ x1: 0, y1: 0.487, x2: 0.16, y2: 0.594, dx: 0.49, dy: -0.87 }, { x1: 1, y1: 0.504, x2: 0.8, y2: 0.567, dx: -0.49, dy: -0.87 }],
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
    arms: [[-0.02, 0.26], [0.78, 1.02]], armY: 0.74,
    neck: 'M0.42 0.12 L0.52 0.26 L0.62 0.12',
    yoke: 'M-0.05 -0.05 L1.05 -0.05 L1.05 0.28 C0.8 0.38 0.65 0.42 0.52 0.42 C0.39 0.42 0.24 0.38 -0.05 0.28 Z',
  },
  baseball: {
    top: 0.16, bottom: 0.98, cx: 0.48, body: [0.18, 0.78], sx: 1.2,
    nameY: 0.33, nameHalf: 0.46, numY: 0.72, numK: 0.72,
    cuffs: [{ x1: 0, y1: 0.473, x2: 0.2, y2: 0.559, dx: 0.49, dy: -0.87 }, { x1: 1, y1: 0.477, x2: 0.78, y2: 0.55, dx: -0.49, dy: -0.87 }],
    neck: 'M0.36 0.16 L0.48 0.27 L0.6 0.16',
    placket: 0.48, placketY: 0.2, markY: 0.42, front: [0.34, 0.7],
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
  tv?: [{ x: number; y: number }, { x: number; y: number }];
  cuffs?: { x1: number; y1: number; x2: number; y2: number; dx: number; dy: number }[];
  arms?: { x: number; w: number; y: number }[];
  neck: string;
  yoke?: string;
  panels?: { x: number; w: number; y: number; h: number }[];
  armholes?: string;
  placket?: { x: number; y: number; w: number; h: number };
  buttons?: number[];
  markArc?: string;
  front?: { x: number; y: number };
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
    tv: b.tv ? [{ x: pt(...b.tv[0])[0], y: pt(...b.tv[0])[1] }, { x: pt(...b.tv[1])[0], y: pt(...b.tv[1])[1] }] : undefined,
    cuffs: b.cuffs?.map((c) => {
      const [x1, y1] = pt(c.x1, c.y1);
      const [x2, y2] = pt(c.x2, c.y2);
      // (the offset up the sleeve, in units: the fraction direction scaled by the box)
      const dx = c.dx * w, dy = c.dy * h;
      const n = Math.hypot(dx, dy);
      return { x1, y1, x2, y2, dx: r2(dx / n), dy: r2(dy / n) };
    }),
    arms: b.arms?.map(([f0, f1]) => ({ x: pt(f0, 0)[0], w: r2((f1 - f0) * w), y: pt(0, b.armY ?? 0.74)[1] })),
    neck: path(b.neck),
    yoke: b.yoke ? path(b.yoke) : undefined,
    panels: b.panels?.map(([f0, f1]) => ({ x: pt(f0, 0)[0], w: r2((f1 - f0) * w), y: pt(0, b.panelY ?? 0.5)[1], h: r2(hemY - pt(0, b.panelY ?? 0.5)[1]) })),
    armholes: b.armholes ? path(b.armholes) : undefined,
    placket: b.placket ? { x: r2(pt(b.placket, 0)[0] - 3.5), y: pt(0, b.placketY ?? 0.2)[1], w: 7, h: r2(hemY - pt(0, b.placketY ?? 0.2)[1]) } : undefined,
    buttons: b.placket ? Array.from({ length: 7 }, (_, i) => r2(pt(0, (b.placketY ?? 0.2) + 0.05 + i * 0.115)[1])) : undefined,
    markArc: b.markY ? arc(b.markY, r2(bodyW * 0.5)) : undefined,
    front: b.front ? { x: pt(...b.front)[0], y: pt(...b.front)[1] } : undefined,
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
// season's plaque and a won round's differ): a photographed blank object, the piece's words set in its boxes
// (each box in fractions of the photo's box: the lines it holds, stacked; its text class, dark engraving unless
// said; its biggest size, in the box's units), the team's mark in its box, a white felt tinted with the team's
// color. A piece can set its base more than once (the two honor plaques side by side).
export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: number[]; // the piece's lines it holds (PROPS[..].lines order)
  cls?: string; // the text's class (sp-engr dark by default)
  max?: number; // the biggest font size (in a 100-tall box's units)
  k?: number; // the letters' width over their size (0.84 for the engraving capitals, 0.6 for a lowercase line)
  anchor?: 'start' | 'middle' | 'end';
  hi?: boolean; // the engraving's lit edge under it (dark text on brass)
  rotate?: number; // the box's tilt (degrees, round its center)
  fit?: boolean; // the first line fills the box's width when it can
}
export interface TextBase {
  key: string;
  tint?: boolean;
  logo?: { x: number; y: number; w: number; h: number };
  boxes: TextBox[];
  noShadow?: boolean;
  copies?: number; // the base drawn this many times side by side (the honor plaques), the boxes' lines offset by `step` each copy
  step?: number;
  play?: { x: number; y: number; w: number; h: number }; // the whiteboard's play, drawn into this box
}
export const TEXT_BASES: Record<string, TextBase> = {
  // the honors: two walnut plaques side by side, the team's mark over each brass plate
  plaques: { key: 'plaque-wood', copies: 2, step: 2, logo: { x: 0.3, y: 0.07, w: 0.4, h: 0.42 }, boxes: [{ x: 0.12, y: 0.61, w: 0.76, h: 0.27, lines: [0, 1], max: 9 }] },
  // a season's plaque, Coach of the Year: the same plaque, its words on the plate
  plaque: { key: 'plaque-wood', logo: { x: 0.3, y: 0.07, w: 0.4, h: 0.42 }, boxes: [{ x: 0.12, y: 0.61, w: 0.76, h: 0.27, lines: [0, 1], max: 9 }] },
  coyplaque: { key: 'plaque-wood', logo: { x: 0.3, y: 0.07, w: 0.4, h: 0.42 }, boxes: [{ x: 0.12, y: 0.6, w: 0.76, h: 0.29, lines: [0, 1, 2], max: 8 }] },
  // a won round: the round black plaque, its words on the brass disc
  'round-plaque': { key: 'plaque-round', boxes: [{ x: 0.25, y: 0.33, w: 0.5, h: 0.34, lines: [0, 1], max: 9 }] },
  // the playoffs: the silver medal on its ribbon, the team's mark on its face, the words round it
  roundel: { key: 'roundel', logo: { x: 0.36, y: 0.53, w: 0.28, h: 0.24 }, boxes: [{ x: 0.2, y: 0.44, w: 0.6, h: 0.08, lines: [0], max: 5 }, { x: 0.22, y: 0.78, w: 0.56, h: 0.15, lines: [1, 2], max: 5.5 }] },
  // a division's banner: white felt tinted the team's color, the mark at the top, the words down it
  banner: { key: 'banner-base', tint: true, logo: { x: 0.39, y: 0.16, w: 0.22, h: 0.2 }, noShadow: true, boxes: [{ x: 0.34, y: 0.4, w: 0.32, h: 0.1, lines: [0], cls: 'sp-banner-t', max: 7 }, { x: 0.34, y: 0.51, w: 0.32, h: 0.12, lines: [1], cls: 'sp-banner-t big', max: 9 }, { x: 0.34, y: 0.65, w: 0.32, h: 0.1, lines: [2], cls: 'sp-banner-t yr', max: 8 }] },
  // a pennant: white felt tinted, the words along it
  pennant: { key: 'pennant-base', tint: true, boxes: [{ x: 0.16, y: 0.32, w: 0.46, h: 0.17, lines: [0], cls: 'sp-pennant-t', max: 11 }, { x: 0.16, y: 0.52, w: 0.36, h: 0.13, lines: [1], cls: 'sp-pennant-t small', max: 8 }] },
  // where it ended: the ticket stub, the round on its red band, the game and the score on the card
  stub: { key: 'ticket-stub', noShadow: true, boxes: [{ x: 0.04, y: 0.03, w: 0.68, h: 0.16, lines: [0], cls: 'sp-engr light', max: 8 }, { x: 0.04, y: 0.28, w: 0.68, h: 0.22, lines: [1], max: 10 }, { x: 0.04, y: 0.52, w: 0.68, h: 0.13, lines: [2], max: 6.5, k: 0.7 }, { x: 0.04, y: 0.68, w: 0.68, h: 0.26, lines: [3], max: 14 }] },
  // the season that ended early: the boarding pass to Cancún
  pass: { key: 'boarding-pass', noShadow: true, boxes: [{ x: 0.05, y: 0.46, w: 0.44, h: 0.1, lines: [0], cls: 'sp-engr light', max: 6 }, { x: 0.05, y: 0.6, w: 0.26, h: 0.2, lines: [1], max: 16 }, { x: 0.36, y: 0.6, w: 0.26, h: 0.2, lines: [2], max: 16 }, { x: 0.05, y: 0.83, w: 0.26, h: 0.08, lines: [3], max: 5, k: 0.7 }, { x: 0.36, y: 0.83, w: 0.26, h: 0.08, lines: [4], max: 5, k: 0.7 }] },
  // the first team out: the golf scorecard, the lines on it
  scorecard: { key: 'scorecard', noShadow: true, boxes: [{ x: 0.3, y: 0.22, w: 0.46, h: 0.46, lines: [0, 1, 2, 3], max: 7, k: 0.7, rotate: -8 }] },
  // the towel, packed early: white terry tinted
  towel: { key: 'beach-towel-base', tint: true, boxes: [] },
  // the office: the whiteboard, the play in marker, his record big in the corner; the framed mark on the desk
  whiteboard: { key: 'whiteboard', play: { x: 0.08, y: 0.22, w: 0.54, h: 0.6 }, boxes: [{ x: 0.63, y: 0.36, w: 0.3, h: 0.22, lines: [0], cls: 'sp-marker blue board', max: 24, k: 0.56 }, { x: 0.63, y: 0.6, w: 0.3, h: 0.1, lines: [1], cls: 'sp-marker board small', max: 9 }, { x: 0.12, y: 0.12, w: 0.4, h: 0.09, lines: [2], cls: 'sp-marker board small', max: 9, anchor: 'start' }] },
  frame: { key: 'team-frame', logo: { x: 0.36, y: 0.22, w: 0.27, h: 0.4 }, boxes: [] },
};

// The info card under a photographed ball or puck (its words), and every base key that isn't a prop's
export const INFO_CARD: TextBase = { key: 'info-placard', boxes: [{ x: 0.1, y: 0.16, w: 0.8, h: 0.56, lines: [0, 1], max: 10 }] };
export const BASE_KEYS = new Set(['info-placard', 'desk-nameplate', ...Object.values(TEXT_BASES).map((b) => b.key)]);

export interface TextBaseArt {
  key: string;
  w: number;
  tint?: boolean;
  noShadow?: boolean;
  imgs: { x: number; y: number; w: number; h: number }[];
  logos: { x: number; y: number; w: number; h: number }[];
  texts: { x: number; y: number; size: number; text: string; cls: string; anchor: string; hi: boolean; transform: string | null }[];
  play?: string;
}

const r2b = (n: number) => Math.round(n * 100) / 100;

// The base for a piece: by the prop's id, then by the piece's type; none when neither has one
export function textBaseFor(t: string, id?: string): TextBase | undefined {
  return (id && TEXT_BASES[id]) || TEXT_BASES[t];
}

// The base resolved to a 100-tall drawing: each copy's photo box, the mark's box, every line's place and size
// (a line too long for its box gets smaller, never squeezed); the copies' lines are the piece's, offset
export function textBaseArt(t: string, id: string | undefined, lines: string[], fontK = 0.84): TextBaseArt | null {
  const b = textBaseFor(t, id);
  const aspect = b && PROP_IMAGES[b.key];
  if (!b || !aspect) return null;
  const copies = b.copies ?? 1;
  const step = b.step ?? 0;
  // (the second plaque only when its lines are there)
  const have = (c: number) => c === 0 || b.boxes.some((box) => box.lines.some((i) => !!lines[i + c * step]));
  const n = Math.max(1, Array.from({ length: copies }, (_, c) => c).filter(have).length);
  const gap = n > 1 ? 4 : 0;
  const iw = aspect * 100;
  const w = r2b(n * iw + (n - 1) * gap);
  const imgs: TextBaseArt['imgs'] = [];
  const logos: TextBaseArt['logos'] = [];
  const texts: TextBaseArt['texts'] = [];
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
    for (const box of b.boxes) {
      const ids = box.lines.map((i) => i + c * step);
      const words = ids.map((i) => lines[i] ?? '').filter((s) => s.trim());
      if (!words.length) continue;
      const bw = box.w * iw, bh = box.h * 100;
      const row = bh / words.length;
      const k = box.k ?? fontK;
      const cx = px(box.x + box.w / 2), cy = py(box.y + box.h / 2);
      words.forEach((text, i) => {
        const max = Math.min(box.max ?? row * 0.8, row * 0.82);
        const size = r2b(Math.min(max, bw / (Math.max(1, text.length) * k)));
        const anchor = box.anchor ?? 'middle';
        const x = anchor === 'start' ? px(box.x) : anchor === 'end' ? px(box.x + box.w) : cx;
        const y = r2b(py(box.y) + row * i + row / 2 + size * 0.35);
        texts.push({ x, y, size, text, cls: box.cls ?? 'sp-engr dark', anchor, hi: box.hi ?? (!box.cls || /sp-engr/.test(box.cls)), transform: box.rotate ? `rotate(${box.rotate} ${cx} ${cy})` : null });
      });
    }
  }
  return { key: b.key, w, tint: b.tint, noShadow: b.noShadow, imgs, logos, texts, play };
}
