// The rink surface: the offensive half of the ice from the shooter's side, the net at the top (looking at it
// from the blue line, as the field looks downfield), to scale: the end boards with their rounded corners, the
// goal line, the crease, the net and the goalie's trapezoid behind it, the faceoff circles with their dots
// and hash marks, the blue line and a few feet of the neutral zone (its dots) under it, fading out. The game
// view's rink (game-view.component.html) draws the same geometry flat, end to end.
//
// Its sixteen cells, near to far (apps/nhl/scripts/build-heat-maps.mjs's ZONE_IDS, binned by MoneyPuck's
// adjusted coordinates: feet, the net at x 89, the blue line at 25, y positive on the shooter's left): beyond
// the blue line; the points (left, middle, right); the top of the circles (each wing outside the dot, each
// circle inside it, the high slot between); down low (each corner, each side of the net inside the dot, the
// slot, the crease); behind the net.

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { pts, r1 } from './field';

// (the rink in feet: x from the red line to the end boards, y across; the corners' radius)
const X_MIN = 14;
const X_MAX = 100;
const Y_HALF = 42.5;
const CORNER = 28;
const GOAL = 89;
const BLUE = 25;
const DOT_X = 69;
const DOT_Y = 22;
const CIRCLE_R = 15;
const CIRCLE_TOP = 54;
const CREASE_X = 80;
const SLOT_HALF = 9;
const NEUTRAL_DOT_X = 20;

// (to the picture: 3.4 units a foot, the net at the top, the shooter's left on the left)
const S = 3.4;
const TOP = 26;
export const rx = (y: number) => r1(150 - y * S);
export const ry = (x: number) => r1(TOP + (X_MAX - x) * S);
const at = (x: number, y: number): [number, number] => [rx(y), ry(x)];

export type RinkZone =
  | 'long'
  | 'point-left'
  | 'point-middle'
  | 'point-right'
  | 'wing-left'
  | 'circle-left'
  | 'high-slot'
  | 'circle-right'
  | 'wing-right'
  | 'corner-left'
  | 'low-left'
  | 'slot'
  | 'low-right'
  | 'corner-right'
  | 'crease'
  | 'behind';

// Each zone: its box in feet (x from, to; y from, to), its name in the hover and the short one
const ZONES: { id: RinkZone; x: [number, number]; y: [number, number]; name: string; short: string }[] = [
  { id: 'long', x: [X_MIN, BLUE], y: [-Y_HALF, Y_HALF], name: 'Beyond the blue line', short: 'Long range' },
  { id: 'point-left', x: [BLUE, CIRCLE_TOP], y: [SLOT_HALF, Y_HALF], name: 'Left point', short: 'Left point' },
  { id: 'point-middle', x: [BLUE, CIRCLE_TOP], y: [-SLOT_HALF, SLOT_HALF], name: 'Center point', short: 'Center point' },
  { id: 'point-right', x: [BLUE, CIRCLE_TOP], y: [-Y_HALF, -SLOT_HALF], name: 'Right point', short: 'Right point' },
  { id: 'wing-left', x: [CIRCLE_TOP, DOT_X], y: [DOT_Y, Y_HALF], name: 'Left wing, outside the dot', short: 'Left wing' },
  { id: 'circle-left', x: [CIRCLE_TOP, DOT_X], y: [SLOT_HALF, DOT_Y], name: 'Left circle, inside the dot', short: 'Left circle' },
  { id: 'high-slot', x: [CIRCLE_TOP, DOT_X], y: [-SLOT_HALF, SLOT_HALF], name: 'High slot', short: 'High slot' },
  { id: 'circle-right', x: [CIRCLE_TOP, DOT_X], y: [-DOT_Y, -SLOT_HALF], name: 'Right circle, inside the dot', short: 'Right circle' },
  { id: 'wing-right', x: [CIRCLE_TOP, DOT_X], y: [-Y_HALF, -DOT_Y], name: 'Right wing, outside the dot', short: 'Right wing' },
  { id: 'corner-left', x: [DOT_X, X_MAX], y: [DOT_Y, Y_HALF], name: 'Left corner, the sharp angle', short: 'Left corner' },
  { id: 'low-left', x: [DOT_X, GOAL], y: [SLOT_HALF, DOT_Y], name: 'Low left, beside the net', short: 'Low left' },
  { id: 'slot', x: [DOT_X, CREASE_X], y: [-SLOT_HALF, SLOT_HALF], name: 'Slot', short: 'Slot' },
  { id: 'low-right', x: [DOT_X, GOAL], y: [-DOT_Y, -SLOT_HALF], name: 'Low right, beside the net', short: 'Low right' },
  { id: 'corner-right', x: [DOT_X, X_MAX], y: [-Y_HALF, -DOT_Y], name: 'Right corner, the sharp angle', short: 'Right corner' },
  { id: 'crease', x: [CREASE_X, GOAL], y: [-SLOT_HALF, SLOT_HALF], name: 'Crease, the net front', short: 'Crease' },
  { id: 'behind', x: [GOAL, X_MAX], y: [-DOT_Y, DOT_Y], name: 'Behind the net', short: 'Behind the net' },
];
export const RINK_ZONE_IDS: RinkZone[] = ZONES.map((z) => z.id);

// ---- the ice's outline (in feet): up the left boards, round the corner, across the end boards, round the
// other, down the right; open at the bottom, where the neutral zone goes on
function boards(steps = 14): [number, number][] {
  const out: [number, number][] = [[X_MIN, Y_HALF]];
  const arc = (cy: number, from: number, to: number) => {
    for (let k = 0; k <= steps; k++) {
      const a = from + ((to - from) * k) / steps;
      out.push([X_MAX - CORNER + CORNER * Math.sin(a), cy + CORNER * Math.cos(a)]);
    }
  };
  // (the left corner: from the side boards (angle 0) to the end boards (90 degrees), centred in from both)
  arc(Y_HALF - CORNER, 0, Math.PI / 2);
  arc(-(Y_HALF - CORNER), Math.PI / 2, Math.PI);
  out.push([X_MIN, -Y_HALF]);
  return out;
}
const RINK_FEET = boards();

// A box clipped to the ice (Sutherland-Hodgman against the convex outline, closed along the bottom)
type P = [number, number];
function clip(box: P[], hull: P[]): P[] {
  let out = box;
  // (the hull's winding: each edge's inside is the side the centre of the ice is on)
  const centre: P = [(X_MIN + X_MAX) / 2, 0];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const side = (p: P) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inSign = Math.sign(side(centre)) || 1;
    const inside = (p: P) => side(p) * inSign >= -1e-9;
    const cut = (p: P, q: P): P => {
      const t = side(p) / (side(p) - side(q));
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k];
      const q = input[(k + 1) % input.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
    if (!out.length) break;
  }
  return out;
}

// (an outline's centre: its area's, so a corner's numbers sit in what's left of it after the boards' curve)
function centroid(poly: P[]): P {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : poly[0];
}

// (where a cell's numbers sit, in feet, where its middle won't do: behind the net, over it; the crease, off the
// crease's paint toward the slot a touch)
const TEXT_AT: Partial<Record<RinkZone, P>> = { behind: [96.8, 0], crease: [84.2, 0] };

const line = (x1: number, y1: number, x2: number, y2: number) => `M${rx(y1)} ${ry(x1)}L${rx(y2)} ${ry(x2)}`;
const circle = (x: number, y: number, r: number) => `M${rx(y) - r * S} ${ry(x)}a${r * S} ${r * S} 0 1 0 ${2 * r * S} 0a${r * S} ${r * S} 0 1 0 ${-2 * r * S} 0`;

export function rinkSurface(): HeatSurface {
  const hull: P[] = [...RINK_FEET];
  const ice = pts(hull.map(([x, y]) => at(x, y)));
  const edge = `M${hull.map(([x, y]) => at(x, y).join(' ')).join('L')}`;

  const backdrop: HeatShape[] = [
    // (the ice: the site's own sheet with its skate marks, darkened under the paint)
    { kind: 'texture', href: 'assets/textures/ice.svg', tile: 240, points: ice },
    { kind: 'polygon', points: ice, cls: 'hm-ice' },
  ];
  // (the neutral zone fading out under the blue line: a few bands, darker as they go)
  for (let k = 0; k < 5; k++) {
    const x0 = X_MIN + k * 1.6;
    backdrop.push({ kind: 'polygon', points: pts([at(x0, Y_HALF), at(x0, -Y_HALF), at(x0 + 1.6, -Y_HALF), at(x0 + 1.6, Y_HALF)]), cls: `hm-ice-fade f${k}` });
  }
  // (the crease's blue paint, under the cells: a D off the goal line, its flat sides 4 feet out, a 6-foot arc)
  const creaseSide = Math.sqrt(36 - 16);
  const crease = `M${rx(4)} ${ry(GOAL)}L${rx(4)} ${ry(GOAL - creaseSide)}A${6 * S} ${6 * S} 0 0 0 ${rx(-4)} ${ry(GOAL - creaseSide)}L${rx(-4)} ${ry(GOAL)}Z`;
  backdrop.push({ kind: 'path', d: crease, cls: 'hm-crease' });
  // (the net: 6 feet wide, 40 inches deep, its frame rounded at the back; under the cells, so the numbers
  // behind it read over it)
  const net = `M${rx(3)} ${ry(GOAL)}L${rx(3)} ${ry(GOAL + 2.2)}Q${rx(3)} ${ry(GOAL + 3.33)} ${rx(1.8)} ${ry(GOAL + 3.33)}L${rx(-1.8)} ${ry(GOAL + 3.33)}Q${rx(-3)} ${ry(GOAL + 3.33)} ${rx(-3)} ${ry(GOAL + 2.2)}L${rx(-3)} ${ry(GOAL)}`;
  backdrop.push({ kind: 'path', d: net, cls: 'hm-net' });

  const cells: HeatCellShape[] = ZONES.map((z) => {
    const box: P[] = [
      [z.x[0], z.y[0]],
      [z.x[1], z.y[0]],
      [z.x[1], z.y[1]],
      [z.x[0], z.y[1]],
    ];
    const poly = clip(box, hull);
    const [fx, fy] = TEXT_AT[z.id] ?? centroid(poly);
    return { id: z.id, points: pts(poly.map(([x, y]) => at(x, y))), cx: rx(fy), cy: ry(fx), name: z.name, short: z.short };
  });

  // ---- over the cells: the markings (thin, so a cell's numbers read through them)
  // (the boards' Y at the goal line: where the corners' curve meets it)
  const goalHalf = Y_HALF - CORNER + Math.sqrt(CORNER ** 2 - (GOAL - (X_MAX - CORNER)) ** 2);
  const circles = [DOT_Y, -DOT_Y].map((y) => circle(DOT_X, y, CIRCLE_R)).join('');
  // (each circle's hash marks, a pair on either side, 2 feet long, 5'7" apart)
  let hashes = '';
  for (const y of [DOT_Y, -DOT_Y])
    for (const dir of [1, -1])
      for (const dx of [-2.9, 2.9]) {
        const y0 = y + dir * Math.sqrt(CIRCLE_R ** 2 - dx ** 2);
        hashes += line(DOT_X + dx, y0, DOT_X + dx, y0 + dir * 2);
      }
  // (the dots: the end zone's in the circles, the neutral zone's under the blue line)
  const dots = [DOT_X, NEUTRAL_DOT_X].flatMap((x) => [DOT_Y, -DOT_Y].map((y) => circle(x, y, 1))).join('');
  // (the goalie's trapezoid behind the net: 22 feet wide at the goal line, 28 at the boards)
  const trapezoid = line(GOAL, 11, X_MAX, 14) + line(GOAL, -11, X_MAX, -14);
  const overlay: HeatShape[] = [
    { kind: 'path', d: trapezoid, cls: 'hm-rink-red thin' },
    { kind: 'path', d: circles + hashes, cls: 'hm-rink-red' },
    { kind: 'path', d: dots, cls: 'hm-rink-dot' },
    { kind: 'path', d: crease, cls: 'hm-crease-line' },
    { kind: 'path', d: line(GOAL, goalHalf, GOAL, -goalHalf), cls: 'hm-rink-red goal' },
    { kind: 'rect', x: rx(Y_HALF), y: ry(BLUE + 1), w: r1(2 * Y_HALF * S), h: r1(S), cls: 'hm-blue-line' },
    { kind: 'path', d: edge, cls: 'hm-boards' },
    { kind: 'text', x: rx(Y_HALF - 6), y: r1(ry(X_MIN) + 14), text: 'LEFT', cls: 'hm-side' },
    { kind: 'text', x: rx(-(Y_HALF - 6)), y: r1(ry(X_MIN) + 14), text: 'RIGHT', cls: 'hm-side' },
  ];
  return {
    id: 'rink',
    viewBox: { x: -2, y: r1(TOP - 6), w: 304, h: r1(ry(X_MIN) + 20 - (TOP - 6)) },
    backdrop,
    overlay,
    cells,
    text: { main: 13.5, sub: 9 },
    aria: "The offensive zone from the blue line, the net at the top, left and right as the shooter sees them: beyond the blue line, the points, the circles, the slot, the crease, the corners and behind the net",
  };
}
