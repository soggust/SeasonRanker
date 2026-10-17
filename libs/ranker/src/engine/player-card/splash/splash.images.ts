// The splash's photographed props (libs/ranker/src/assets/props, served at assets/props/): a studio shot of each
// real object, cut out with alpha, as a WebP 400 and 800 tall. A prop with a photo draws it instead of its
// vector (the vector stays as the fallback); the white BASES (the four jersey cuts, the helmet, the sneaker, the
// cap) are tinted with the kit's color and the kit's details are drawn over them at the anchors below. No
// Angular here: the tests load it as it is.
//
// Every base is a FLAT shot: straight on, symmetrical, no perspective (the jerseys from the back with the
// sleeves spread, the helmet in profile, the paper and the plaques face on). So every anchor is a plain
// rectangle or path measured on the image (scratchpad flat-gen/measure.mjs: the alpha's row and column
// profile, a 10% grid over the picture), given in fractions of the image, and every overlay is flat text or
// flat shapes in it: no skew, no homography, nothing leans.
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
  'nfl-helmet': 1.2765,
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
  // (the jersey bases: backs, flat, the sleeves spread, cut at the collar's top)
  'jersey-football': 1.3043,
  'jersey-basketball': 0.6654,
  'jersey-hockey': 1.89,
  'jersey-baseball': 1.3128,
  // (the blank bases the vector pieces draw on: TEXT_BASES, INFO_CARD, the office's desk nameplate)
  'info-placard': 1.7671,
  'plaque-wood': 1.5711,
  'plaque-round': 1.1886,
  'roundel': 0.5088,
  'pennant-base': 1.5653,
  'banner-base': 0.53,
  'ticket-stub': 2.1308,
  'boarding-pass': 2.132,
  'scorecard': 1.6296,
  'beach-towel-base': 1.841,
  'whiteboard': 1.3876,
  'team-frame': 0.9649,
  'desk-nameplate': 2.4107,
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

// ---- The jersey lettering (assets/fonts/jersey/<id>.woff2, one family "J-<id>" each; uniform-eras.ts
// numberFont / nameFont): real athletic faces, each measured in Chrome at 100 px (scratchpad fonts-gen/metrics2.js,
// canvas measureText ink bounds): the digits' cap height, the width of "88", a capital's mean advance and the
// capitals' height, all in ems. A number's size is set from these so two digits fill the same box whatever the
// face (the faces sit at very different sizes in their em: the Ducks' at 0.37, Jersey 716 at 0.72)
export interface FaceMetrics {
  capH: number; // the digits' ink height
  w88: number; // the ink width of "88"
  cap: number; // a capital's mean advance ("WILLIAMS")
  capL: number; // the capitals' ink height
}
export const FACES: Record<string, FaceMetrics> = {
  block: { capH: 0.72, w88: 1.285, cap: 0.711, capL: 0.72 },
  varsity: { capH: 0.77, w88: 0.938, cap: 0.459, capL: 0.77 },
  college: { capH: 0.83, w88: 1.354, cap: 0.748, capL: 0.83 },
  tuscan: { capH: 0.81, w88: 1.197, cap: 0.628, capL: 0.8 },
  rounded: { capH: 0.7, w88: 1.004, cap: 0.588, capL: 0.7 },
  wide: { capH: 0.71, w88: 1.284, cap: 0.737, capL: 0.71 },
  sharp: { capH: 0.74, w88: 1.36, cap: 0.744, capL: 0.74 },
  slim: { capH: 0.68, w88: 0.9, cap: 0.381, capL: 0.75 },
  broncos: { capH: 0.8, w88: 1.09, cap: 0.402, capL: 0.8 },
  chargers: { capH: 0.8, w88: 0.847, cap: 0.351, capL: 0.8 },
  jaguars: { capH: 0.68, w88: 0.9, cap: 0.526, capL: 1.02 },
  packers: { capH: 0.71, w88: 0.925, cap: 0.442, capL: 0.71 },
  astros: { capH: 0.8, w88: 0.68, cap: 0.376, capL: 0.8 },
  bruins: { capH: 0.7, w88: 1.147, cap: 0.497, capL: 0.7 },
  ducks: { capH: 0.37, w88: 0.553, cap: 0.563, capL: 0.36 },
  flames: { capH: 0.64, w88: 0.975, cap: 0.382, capL: 0.65 },
  sabres: { capH: 0.38, w88: 0.728, cap: 0.492, capL: 0.5 },
  wild: { capH: 0.45, w88: 0.631, cap: 0.354, capL: 0.46 },
};
export const FACE_IDS = Object.keys(FACES);
// (the faces that carry their own serifs and take a second outline when the kit has an outline color)
export const OUTLINED_FACES = new Set(['varsity', 'college', 'wide']);
export const faceOf = (id: string | undefined): FaceMetrics => FACES[id ?? ''] ?? FACES['block'];

// A number's font size so "88" fills a box (its cap height the box's height, or narrower to fit its width)
export function numberSize(face: string | undefined, w: number, h: number): number {
  const f = faceOf(face);
  return r2(Math.min(h / f.capH, w / f.w88));
}
// A name's font size: its capitals a given height, smaller to fit a run (the letters' advance plus the
// letter-spacing, in ems)
export function nameSize(face: string | undefined, text: string, run: number, capH: number, spacing = 0.12): number {
  const f = faceOf(face);
  return r2(Math.min(capH / f.capL, run / (Math.max(1, text.length) * (f.cap + spacing))));
}

// ---- The jersey bases' anchors. Each base is a flat back, cut at the collar's top, measured as fractions of
// its image (x over the width, y over the height): where the collar is (top), the hem (bottom), the torso's
// span at mid height (body), the yoke seam (seamY), each sleeve's rectangle (its cuff is its outer edge), the
// neckline's path, the yoke's shape, the side panels, a tank's armholes, a vest's undershirt. The lettering is
// placed by rule from these: the number box centred on the torso from 22% to 62% of the body's height below the
// collar and 60% of the torso wide; the name arched over it between the yoke seam and the number; TV numbers
// and sleeve bands inside the sleeves only (clipped by each sleeve's rectangle and the photo's alpha); hem bands
// in the bottom 12% of the torso.
//
// The base is placed in the jersey's drawing space (viewBox -4 -18 128 164, the collar's top at y 10, the
// body centred on x 60) to fit its width (128) and its height (132): the spread sleeves set the scale, so a
// sweater stands shorter in its stall than a tank.
export interface SleeveBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface JerseyBase {
  top: number;
  bottom: number;
  cx: number;
  body: [number, number];
  seamY: number; // the yoke seam (where the name's arc hangs from)
  neck: string; // the neckline, a path in fractions (the collar's trim)
  sleeves?: [SleeveBox, SleeveBox]; // left, right: each sleeve's rectangle, the cuff at its outer edge
  tv?: [[number, number], [number, number]]; // football's sleeve-cap numbers: each one's centre
  tvBox?: [number, number]; // a TV number's box (w, h) in fractions
  yoke?: string; // the shoulders, a closed path in fractions
  panels?: [[number, number], [number, number]]; // the body's side panels: each one's x range
  panelY?: number; // where they start
  armholes?: string; // a tank's armholes, a path in fractions
  under?: [string, string]; // a vest's undershirt sleeves, closed paths in fractions
  numY?: [number, number]; // the number box's top and bottom, as fractions of the body's height (default 0.22, 0.62)
  numW?: number; // its width over the torso's (default 0.6)
  nameY?: number; // the name's baseline (the arc's ends) as a fraction of the body's height (default 0.19)
  fit?: number; // the width of the drawing space the image fits (default 128: a sweater with its sleeves spread takes a wider viewBox, and its stall gives it the room)
}
export const JERSEY_BASES: Record<string, JerseyBase> = {
  // (810 x 621: the sleeves run out to the edges, their cuffs the near-vertical outer ends between y 0.16 and
  // 0.3; the yoke seam at 0.17 across the shoulders; the torso 0.222-0.774 from 0.4 down to the hem at the
  // bottom edge. The cloth at the TV numbers' row begins 0.015 in from each edge, and a team locker's stall
  // wall covers the first 0.04 of the picture: each number's box sits from 0.07 to 0.18, clear of both and of
  // the torso, so its digits are never cut)
  football: {
    top: 0, bottom: 1, cx: 0.498, body: [0.222, 0.774], seamY: 0.17,
    neck: 'M0.42 0 C0.45 0.045 0.55 0.045 0.58 0',
    sleeves: [{ x0: -0.02, x1: 0.225, y0: 0.1, y1: 0.4 }, { x0: 0.775, x1: 1.02, y0: 0.1, y1: 0.4 }],
    tv: [[0.125, 0.235], [0.875, 0.235]],
    tvBox: [0.11, 0.11],
    yoke: 'M-0.02 -0.02 L1.02 -0.02 L1.02 0.42 L0.775 0.42 L0.775 0.17 Q0.5 0.21 0.225 0.17 L0.225 0.42 L-0.02 0.42 Z',
    panels: [[0.222, 0.262], [0.734, 0.774]], panelY: 0.4,
  },
  // (519 x 780: a tank; the straps 0.17-0.3 and 0.7-0.83, the armholes curving out to the body's full width
  // at 0.4; the inside of the front shows through the neck, so the neckline is read off the picture)
  basketball: {
    top: 0, bottom: 1, cx: 0.5, body: [0.02, 0.98], seamY: 0.13,
    neck: 'M0.3 0 C0.36 0.165 0.64 0.165 0.7 0',
    armholes: 'M0.19 0 C0.16 0.15 0.12 0.3 0.02 0.42 M0.81 0 C0.84 0.15 0.88 0.3 0.98 0.42',
    panels: [[0.02, 0.07], [0.93, 0.98]], panelY: 0.42,
    numY: [0.3, 0.64], numW: 0.5, nameY: 0.26,
  },
  // (962 x 509: the sweater, its sleeves straight out to the edges, the cuffs at the ends between y 0.2 and
  // 0.37; the yoke seam at 0.17; the torso 0.299-0.693, the hem's curve bottoming at the edge)
  hockey: {
    top: 0, bottom: 0.99, cx: 0.496, body: [0.299, 0.693], seamY: 0.17,
    neck: 'M0.44 0 C0.47 0.05 0.53 0.05 0.56 0',
    sleeves: [{ x0: -0.02, x1: 0.3, y0: 0, y1: 0.4 }, { x0: 0.7, x1: 1.02, y0: 0, y1: 0.4 }],
    yoke: 'M-0.02 -0.02 L1.02 -0.02 L1.02 0.22 L0.72 0.3 L0.72 0.17 Q0.5 0.22 0.28 0.17 L0.28 0.3 L-0.02 0.22 Z',
    fit: 156,
  },
  // (747 x 569: a back, cap sleeves to the edges with the cuffs at the ends between y 0.14 and 0.27; the torso
  // 0.213-0.788 from 0.4 down to a curved hem, its sides at 0.9)
  baseball: {
    top: 0, bottom: 1, cx: 0.5, body: [0.213, 0.788], seamY: 0.12,
    neck: 'M0.42 0 C0.46 0.055 0.54 0.055 0.58 0',
    sleeves: [{ x0: -0.02, x1: 0.21, y0: 0.06, y1: 0.42 }, { x0: 0.79, x1: 1.02, y0: 0.06, y1: 0.42 }],
    under: ['M-0.02 0.04 L0.215 0.1 L0.215 0.4 L-0.02 0.3 Z', 'M1.02 0.04 L0.785 0.1 L0.785 0.4 L1.02 0.3 Z'],
    numY: [0.2, 0.58],
  },
};

// A base resolved to the jersey's drawing units: the photo's box, and every anchor as a box, a point or a path
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Sleeve extends Box {
  cuff: number; // the cuff's x (the sleeve's outer edge)
  dir: 1 | -1; // which way the body lies from the cuff
}
export interface JerseyAnchors {
  vb: string; // the jersey's viewBox: -4 -18 128 164, or wider for a cut that fits a wider space
  img: Box;
  bodyX: [number, number];
  bodyW: number;
  bodyH: number; // the collar's top to the hem
  nameArc: string;
  nameRun: number; // the arc's length, about
  nameCap: number; // the name's capitals' height
  num: Box; // the number's box (two digits fill it)
  tv?: Box[]; // the sleeve caps' number boxes
  sleeves?: Sleeve[]; // each sleeve's clip and its cuff
  neck: string;
  yoke?: string;
  panels?: Box[];
  armholes?: string;
  under?: string[];
  pins: number[];
  hemY: number;
  hemH: number; // the hem bands' region (the bottom 12% of the torso)
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function jerseyAnchors(cut: string): JerseyAnchors | null {
  const b = JERSEY_BASES[cut];
  const aspect = PROP_IMAGES[`jersey-${cut}`];
  if (!b || !aspect) return null;
  // (the image fits the drawing space's width, 128 round the body's centre at 60 unless the cut takes more,
  // and its height, 132: the collar at y 10)
  const fit = b.fit ?? 128;
  const h = Math.min(132 / (b.bottom - b.top), fit / 2 / (b.cx * aspect), fit / 2 / ((1 - b.cx) * aspect));
  const w = h * aspect;
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
  const box = (fx: number, fy: number, fw: number, fh: number): Box => ({ x: r2(x + fx * w), y: r2(y + fy * h), w: r2(fw * w), h: r2(fh * h) });
  const bodyX: [number, number] = [pt(b.body[0], 0)[0], pt(b.body[1], 0)[0]];
  const bodyW = bodyX[1] - bodyX[0];
  const bodyH = (b.bottom - b.top) * h;
  const cx = (bodyX[0] + bodyX[1]) / 2;
  const hemY = pt(0, b.bottom)[1];
  // the name: an arc over the number, its ends on the baseline, its middle risen a fifth of its half width
  const half = r2(bodyW * 0.46);
  const nameY = r2(pt(0, b.top)[1] + (b.nameY ?? 0.19) * bodyH);
  const nameArc = `M${r2(cx - half)} ${nameY} Q${r2(cx)} ${r2(nameY - half * 0.2)} ${r2(cx + half)} ${nameY}`;
  // the number: centred on the torso, from 22% to 62% of the body's height, 60% of the torso wide
  const [n0, n1] = b.numY ?? [0.22, 0.62];
  const numW = bodyW * (b.numW ?? 0.6);
  const num: Box = { x: r2(cx - numW / 2), y: r2(pt(0, b.top)[1] + n0 * bodyH), w: r2(numW), h: r2((n1 - n0) * bodyH) };
  const pins: number[] = [];
  for (let px = bodyX[0] + 3; px < bodyX[1]; px += 8) pins.push(r2(px));
  return {
    vb: `${60 - fit / 2} -18 ${fit} 164`,
    img: { x: r2(x), y: r2(y), w: r2(w), h: r2(h) },
    bodyX,
    bodyW: r2(bodyW),
    bodyH: r2(bodyH),
    nameArc,
    nameRun: r2(2 * half * 1.02),
    nameCap: r2(bodyH * 0.062),
    num,
    tv: b.tv && b.tvBox ? b.tv.map(([fx, fy]) => box(fx - b.tvBox![0] / 2, fy - b.tvBox![1] / 2, b.tvBox![0], b.tvBox![1])) : undefined,
    sleeves: b.sleeves?.map((s, i) => {
      const bx = box(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      return { ...bx, cuff: i === 0 ? pt(0.03, 0)[0] : pt(0.97, 0)[0], dir: i === 0 ? 1 : -1 };
    }),
    neck: path(b.neck),
    yoke: b.yoke ? path(b.yoke) : undefined,
    panels: b.panels?.map(([f0, f1]) => box(f0, b.panelY ?? 0.4, f1 - f0, b.bottom - (b.panelY ?? 0.4))),
    armholes: b.armholes ? path(b.armholes) : undefined,
    under: b.under ? b.under.map(path) : undefined,
    pins,
    hemY,
    hemH: r2(bodyH * 0.12),
  };
}

// ---- The tinted gear bases (the piece draws these: the photo over the kit's color, the details on top), as
// fractions of the photo's box: where the color goes (the helmet's shell, not its mask; the sneaker's upper, not
// its sole), the decal, the stripe over the crown, the number on the heel
export const GEAR_BASES = {
  // (577 x 452, in profile facing left: the mask over the front from the brow clip at 0.15,0.3 down to the
  // chin; the shell from the brow over the crown, its top at 0.5,0.04, round the back at 0.97,0.5 and under to
  // the jaw; the ear hole at 0.6,0.72, a vent at 0.85,0.3)
  helmet: {
    shell: 'M0.17 0.34 C0.25 0.1 0.4 0.03 0.55 0.03 C0.8 0.04 0.97 0.25 0.97 0.5 C0.97 0.75 0.9 0.95 0.72 0.99 L0.5 0.99 L0.42 0.92 L0.3 0.92 L0.27 0.6 L0.17 0.52 Z',
    stripe: 'M0.22 0.3 C0.3 0.1 0.42 0.045 0.52 0.045 C0.72 0.05 0.88 0.18 0.94 0.5',
    // (the decal on the shell's side, behind the mask line, 36% of the shell's height, centred on 0.66,0.4)
    decal: { x: 0.52, y: 0.22, w: 0.28, h: 0.36 },
    gloss: 'M0.4 0.14 C0.5 0.07 0.66 0.06 0.8 0.12',
  },
  cap: { decal: { x: 0.38, y: 0.26, w: 0.28, h: 0.28 } },
  // (faces left: the heel at the right; the upper tinted down to the sole)
  shoe: { upper: 0.8, num: { x: 0.83, y: 0.5 } },
};

// ---- The blank bases the vector pieces draw on (TEXT_BASES, by the piece's type, or by the prop's id first: a
// season's plaque and a won round's differ): a photographed blank object, flat and face on, the piece's words
// set in its boxes, the team's mark in its box, a white felt tinted with the team's color. A piece can set its
// base more than once (the two honor plaques side by side).
//
// Each box was MEASURED on the photo (the red band of the stub, the brass plate of the plaque, the felt of the
// banner) and is given in fractions of the photo's box. Letters are never squeezed: a line too long for its
// box is set smaller, or wrapped onto more rows where the box allows (wrap).
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
  paper?: { x: number; y: number; w: number; h: number; color: string }; // a backing under the mark (a frame's window)
  boxes: TextBox[];
  marks?: Mark[];
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
// (the walnut plaque, 619 x 394: its brass plate fills it, x 0.085-0.915 and y 0.13-0.87; the team's mark on
// the plate's upper half, the words engraved under it)
const PLATE_LOGO = { x: 0.33, y: 0.17, w: 0.34, h: 0.34 };
const PLATE_BOXES: TextBox[] = [
  { x: 0.1, y: 0.54, w: 0.8, h: 0.16, lines: [0], max: 11 },
  { x: 0.1, y: 0.7, w: 0.8, h: 0.14, lines: [1], max: 10 },
];
// (the office's brass desk nameplate on its walnut base, 769 x 319, face on: the plate x 0.05-0.95, y 0.13-0.86)
export const NAMEPLATE = { x: 0.07, y: 0.16, w: 0.86, h: 0.68 };
export const TEXT_BASES: Record<string, TextBase> = {
  // the honors: two walnut plaques side by side, the team's mark over each brass plate
  plaques: { key: 'plaque-wood', copies: 2, step: 2, logo: PLATE_LOGO, boxes: PLATE_BOXES },
  // a season's plaque, Coach of the Year: the same plaque, its words on the plate
  plaque: { key: 'plaque-wood', logo: PLATE_LOGO, boxes: PLATE_BOXES },
  coyplaque: {
    key: 'plaque-wood',
    logo: { x: 0.36, y: 0.16, w: 0.28, h: 0.26 },
    boxes: [
      { x: 0.1, y: 0.45, w: 0.8, h: 0.14, lines: [0], max: 8.5 },
      { x: 0.1, y: 0.59, w: 0.8, h: 0.12, lines: [1], max: 7.5 },
      { x: 0.1, y: 0.72, w: 0.8, h: 0.13, lines: [2], max: 8 },
    ],
  },
  // a won round: the round black plaque, its words on the brass disc (523 x 440, face on: the disc's flat
  // centred, 0.06-0.94 across)
  'round-plaque': {
    key: 'plaque-round',
    boxes: [
      { x: 0.2, y: 0.36, w: 0.6, h: 0.14, lines: [0], max: 10 },
      { x: 0.2, y: 0.52, w: 0.6, h: 0.12, lines: [1], max: 8.5 },
    ],
  },
  // the playoffs: the silver medal on its ribbon (290 x 570: the medal's face a circle centred on 0.5,0.8, its
  // flat 0.4 of the width in radius), the team's mark on its face, the playoffs round the top of the face and
  // the season under the mark; the seed goes on the shelf's caption. (The arc's box is square in units.)
  roundel: {
    key: 'roundel',
    logo: { x: 0.35, y: 0.72, w: 0.3, h: 0.13 },
    boxes: [
      { x: 0.14, y: 0.62, w: 0.72, h: 0.366, lines: [0], arc: 'top', max: 5.6 },
      { x: 0.25, y: 0.855, w: 0.5, h: 0.08, lines: [1], max: 6 },
    ],
  },
  // a division's banner: white felt tinted the team's color (441 x 832: the felt x 0.12-0.88 under its rod,
  // pointed from 0.8 down), the mark at the top, the division's words stacked down the felt (each row as wide
  // as the felt allows), CHAMPIONS, the season in the second color
  banner: {
    key: 'banner-base',
    tint: true,
    noShadow: true,
    logo: { x: 0.32, y: 0.09, w: 0.36, h: 0.16 },
    boxes: [
      { x: 0.17, y: 0.3, w: 0.66, h: 0.24, lines: [0], cls: FELT, max: 9.5, k: 0.56, wrap: 2 },
      { x: 0.17, y: 0.56, w: 0.66, h: 0.1, lines: [1], cls: FELT, max: 9.5, k: 0.56 },
      { x: 0.2, y: 0.68, w: 0.6, h: 0.12, lines: [2], cls: FELT + ' yr', max: 11, k: 0.56 },
    ],
  },
  // a pennant: white felt tinted (731 x 467: the pole 0-0.06, the felt tapering from the pole's full height
  // to its tip at 0.98,0.5), the league, CHAMPIONS and the season set from the pole, each row as long as the
  // taper allows
  pennant: {
    key: 'pennant-base',
    tint: true,
    boxes: [
      { x: 0.1, y: 0.3, w: 0.5, h: 0.15, lines: [0], cls: FELT, max: 10, k: 0.56, anchor: 'start' },
      { x: 0.1, y: 0.46, w: 0.44, h: 0.14, lines: [1], cls: FELT, max: 11, k: 0.56, anchor: 'start' },
      { x: 0.1, y: 0.62, w: 0.34, h: 0.13, lines: [2], cls: FELT + ' yr', max: 11, k: 0.56, anchor: 'start' },
    ],
  },
  // where it ended: the ticket stub (684 x 321, face on: the red band y 0-0.19, the perforation at x 0.84, the
  // stub past it). The round printed on the band, the game in the ticket mono, the date and the venue under it,
  // FINAL and the score; a barcode down the torn stub
  stub: {
    key: 'ticket-stub',
    noShadow: true,
    boxes: [
      { x: 0.04, y: 0.03, w: 0.76, h: 0.13, lines: [0], cls: PRINT + ' light', max: 7, k: 0.62 },
      { x: 0.04, y: 0.26, w: 0.76, h: 0.22, lines: [1], cls: MONO + ' big', max: 14, k: 0.62 },
      { x: 0.04, y: 0.5, w: 0.76, h: 0.1, lines: [2], cls: MONO + ' dim', max: 6.2, k: 0.62 },
      { x: 0.06, y: 0.68, w: 0.2, h: 0.16, text: 'Final', cls: PRINT + ' dim', max: 6, k: 0.62, anchor: 'end' },
      { x: 0.3, y: 0.62, w: 0.5, h: 0.28, lines: [3], cls: MONO + ' big red', max: 16, k: 0.62, anchor: 'start' },
    ],
    marks: [{ kind: 'barcode', x: 0.895, y: 0.3, w: 0.06, h: 0.45 }],
  },
  // the season that ended early: the boarding pass to Cancún (727 x 341, face on: the band y 0-0.15, the
  // perforation at x 0.77). The airline on the band, the passenger, FROM and TO big in the mono, DEPARTS and
  // SEAT (his record), the stub with its barcode, the red ELIMINATED stamp
  pass: {
    key: 'boarding-pass',
    noShadow: true,
    boxes: [
      { x: 0.03, y: 0.02, w: 0.4, h: 0.11, text: 'Season Ranker Air', cls: PRINT + ' light', max: 4.4, k: 0.62, anchor: 'start' },
      { x: 0.5, y: 0.02, w: 0.24, h: 0.11, text: 'Boarding Pass', cls: PRINT + ' light c2', max: 4.4, k: 0.62, anchor: 'end' },
      { x: 0.03, y: 0.2, w: 0.3, h: 0.08, text: 'Passenger', cls: PRINT + ' dim', max: 3, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.28, w: 0.7, h: 0.14, lines: [0], cls: PRINT + ' bold', max: 6.4, k: 0.58, anchor: 'start' },
      { x: 0.03, y: 0.46, w: 0.2, h: 0.07, text: 'From', cls: PRINT + ' dim', max: 3, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.53, w: 0.25, h: 0.22, lines: [1], cls: MONO + ' big', max: 12, k: 0.62, anchor: 'start' },
      { x: 0.42, y: 0.46, w: 0.2, h: 0.07, text: 'To', cls: PRINT + ' dim', max: 3, k: 0.62, anchor: 'start' },
      { x: 0.42, y: 0.53, w: 0.25, h: 0.22, lines: [2], cls: MONO + ' big', max: 12, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.8, w: 0.2, h: 0.06, text: 'Departs', cls: PRINT + ' dim', max: 2.8, k: 0.62, anchor: 'start' },
      { x: 0.03, y: 0.86, w: 0.36, h: 0.08, lines: [3], cls: MONO, max: 4.8, k: 0.62, anchor: 'start' },
      { x: 0.42, y: 0.8, w: 0.2, h: 0.06, text: 'Seat', cls: PRINT + ' dim', max: 2.8, k: 0.62, anchor: 'start' },
      { x: 0.42, y: 0.86, w: 0.3, h: 0.08, lines: [4], cls: MONO, max: 4.8, k: 0.62, anchor: 'start' },
      { x: 0.8, y: 0.22, w: 0.17, h: 0.1, text: 'Cancún', cls: PRINT + ' c1', max: 3.8, k: 0.62 },
    ],
    marks: [
      { kind: 'plane', x: 0.3, y: 0.56, w: 0.08, h: 0.17 },
      { kind: 'barcode', x: 0.8, y: 0.4, w: 0.17, h: 0.3 },
      { kind: 'stamp', x: 0.56, y: 0.68, w: 0.38, h: 0.2, text: 'Eliminated', rotate: -8 },
    ],
  },
  // the first team out: the golf scorecard (572 x 351, face on, ruled); the card's heading printed, his record
  // and the rest in pencil
  scorecard: {
    key: 'scorecard',
    noShadow: true,
    boxes: [
      { x: 0.05, y: 0.04, w: 0.3, h: 0.1, text: 'Final card', cls: PRINT + ' green', max: 4, k: 0.62, anchor: 'start' },
      { x: 0.05, y: 0.15, w: 0.9, h: 0.14, lines: [0], cls: PRINT + ' bold', max: 5.5, k: 0.58, anchor: 'start' },
      { x: 0.1, y: 0.32, w: 0.8, h: 0.3, lines: [1], cls: MARKER, max: 16, k: 0.5 },
      { x: 0.05, y: 0.64, w: 0.9, h: 0.12, lines: [2], cls: MARKER, max: 5.2, k: 0.5 },
      { x: 0.05, y: 0.78, w: 0.9, h: 0.14, lines: [3], cls: 'sp-marker red', max: 6.5, k: 0.5 },
    ],
  },
  // the towel, packed early: white terry tinted
  towel: { key: 'beach-towel-base', tint: true, boxes: [] },
  // the office: the whiteboard (716 x 516: the board's face x 0.03-0.97, y 0.03-0.94, the marker tray under
  // it), the play in marker, his record big in the corner; the framed mark on the desk (605 x 627: the mat's
  // window 0.25-0.75 both ways, cut through, so a paper is laid under the mark)
  whiteboard: { key: 'whiteboard', play: { x: 0.06, y: 0.2, w: 0.52, h: 0.6 }, boxes: [{ x: 0.62, y: 0.34, w: 0.32, h: 0.22, lines: [0], cls: 'sp-marker blue board', max: 24, k: 0.56 }, { x: 0.62, y: 0.58, w: 0.32, h: 0.1, lines: [1], cls: 'sp-marker board small', max: 9 }, { x: 0.08, y: 0.08, w: 0.5, h: 0.09, lines: [2], cls: 'sp-marker board small', max: 9, anchor: 'start' }] },
  frame: { key: 'team-frame', paper: { x: 0.25, y: 0.245, w: 0.5, h: 0.51, color: '#f1ece0' }, logo: { x: 0.28, y: 0.27, w: 0.44, h: 0.46 }, boxes: [] },
};

// The info card under a photographed ball or puck: the brass plate (440 x 249, face on, a screw at each corner),
// the words engraved on it; and every base key that isn't a prop's
export const INFO_CARD: TextBase = {
  key: 'info-placard',
  boxes: [
    { x: 0.08, y: 0.14, w: 0.84, h: 0.4, lines: [0], max: 18 },
    { x: 0.08, y: 0.55, w: 0.84, h: 0.32, lines: [1], max: 13 },
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
  transform: string; // the mark's box onto the base: a translate (and its tilt)
  w: number;
  h: number;
  rects?: { x: number; y: number; w: number; h: number }[]; // a barcode's bars
  text?: string;
  size?: number;
}
export interface TextBaseArt {
  key: string;
  w: number;
  tint?: boolean;
  noShadow?: boolean;
  imgs: Box[];
  papers: (Box & { color: string })[];
  logos: Box[];
  texts: TextArt[];
  marks: MarkArt[];
  play?: string;
}

const r2b = (n: number) => Math.round(n * 100) / 100;

// The base for a piece: by the prop's id, then by the piece's type; none when neither has one
export function textBaseFor(t: string, id?: string): TextBase | undefined {
  return (id && TEXT_BASES[id]) || TEXT_BASES[t];
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
// printed marks; the copies' lines are the piece's, offset. Everything lies flat on the photo.
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
  const imgs: Box[] = [];
  const papers: TextBaseArt['papers'] = [];
  const logos: Box[] = [];
  const texts: TextArt[] = [];
  const marks: MarkArt[] = [];
  let play: string | undefined;
  for (let c = 0; c < n; c++) {
    const x0 = c * (iw + gap);
    const px = (fx: number) => r2b(x0 + fx * iw);
    const py = (fy: number) => r2b(fy * 100);
    const box = (f: { x: number; y: number; w: number; h: number }): Box => ({ x: px(f.x), y: py(f.y), w: r2b(f.w * iw), h: r2b(f.h * 100) });
    imgs.push({ x: r2b(x0), y: 0, w: r2b(iw), h: 100 });
    if (b.paper) papers.push({ ...box(b.paper), color: b.paper.color });
    if (b.logo) logos.push(box(b.logo));
    if (b.play) {
      const s = Math.min((b.play.w * iw) / 300, (b.play.h * 100) / 150);
      play = `translate(${px(b.play.x)} ${py(b.play.y)}) scale(${r2b(s)})`;
    }
    // (a line that would set under the smallest readable size is left to the shelf's caption)
    const put = (t: TextArt) => {
      if (t.size >= minSize) texts.push(t);
    };
    for (const bx of b.boxes) {
      // (a fixed label is printed on every copy that has words; a box's lines only where the piece has them)
      const ids = (bx.lines ?? []).map((i) => i + c * step);
      let words = bx.text ? (c === 0 || have(c) ? [bx.text] : []) : ids.map((i) => lines[i] ?? '').filter((s) => s.trim());
      if (!words.length) continue;
      const bw = bx.w * iw, bh = bx.h * 100;
      const k = bx.k ?? fontK;
      const cls = bx.cls ?? 'sp-engr dark';
      const cx = px(bx.x + bx.w / 2), cy = py(bx.y + bx.h / 2);
      const rel = relief(cls);
      const tilt = bx.rotate ? `rotate(${bx.rotate} ${cx} ${cy})` : null;
      if (bx.arc) {
        // (the line along the top of a circle inside the box: as big as the arc's length allows)
        const r = r2b(bw / 2);
        const text = words[0];
        const size = r2b(Math.min(bx.max ?? 6, (Math.PI * r * 0.92) / (Math.max(1, text.length) * k)));
        const arc = `M${r2b(cx - r)} ${cy} A${r} ${r} 0 0 1 ${r2b(cx + r)} ${cy}`;
        put({ x: cx, y: cy, size, text, cls, anchor: 'middle', hi: rel.hi, hiDx: rel.dx, hiDy: rel.dy, transform: tilt, arc });
        continue;
      }
      if (bx.wrap && words.length === 1) {
        // (the rows that let the words stand biggest)
        let bestSize = 0;
        for (let rows = 1; rows <= bx.wrap; rows++) {
          const split = wrapWords(words[0], rows);
          if (split.length !== rows) continue;
          const row = bh / rows;
          const size = Math.min(bx.max ?? row * 0.8, row * 0.82, ...split.map((s) => bw / (Math.max(1, s.length) * k)));
          if (size > bestSize) (bestSize = size), (words = split);
        }
      }
      const row = bh / words.length;
      words.forEach((text, i) => {
        const max = Math.min(bx.max ?? row * 0.8, row * 0.82);
        const size = r2b(Math.min(max, bw / (Math.max(1, text.length) * k)));
        const anchor = bx.anchor ?? 'middle';
        const x = anchor === 'start' ? px(bx.x) : anchor === 'end' ? px(bx.x + bx.w) : cx;
        const y = r2b(py(bx.y) + row * i + row / 2 + size * 0.35);
        put({ x, y, size, text, cls, anchor, hi: bx.hi ?? rel.hi, hiDx: rel.dx, hiDy: rel.dy, transform: tilt });
      });
    }
    for (const m of b.marks ?? []) {
      const mw = r2b(m.w * iw), mh = r2b(m.h * 100);
      const at = `translate(${px(m.x)} ${py(m.y)})`;
      const tilt = m.rotate ? ` rotate(${m.rotate} ${r2b(mw / 2)} ${r2b(mh / 2)})` : '';
      const art: MarkArt = { kind: m.kind, transform: at + tilt, w: mw, h: mh, text: m.text };
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
  return { key: b.key, w, tint: b.tint, noShadow: b.noShadow, imgs, papers, logos, texts, marks, play };
}
