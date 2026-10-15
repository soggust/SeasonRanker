// The body surfaces: where strikes land, on a fighter's figure. 'body': one figure, standing square on, hands
// at his sides, its three targets the cells (head, body, leg), named down the side; 'body-3': three of them, a
// figure for each position the strikes were thrown from (at distance, in the clinch, on the ground), nine
// cells, "<position>-<target>" ("clinch-body"). Each on an octagon-cut board of the octagon's canvas darkened
// under the paint, the cage's red rail around it, the fighter's gloves and waistband in the same red.
// MMA's heat maps (apps/mma/src/sport/heat-maps.ts; the targets and positions are ESPN's, FightMetric's).

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { pts, r1 } from './field';

export const STRIKE_TARGETS = [
  { id: 'head', label: 'HEAD', name: 'Head' },
  { id: 'body', label: 'BODY', name: 'Body' },
  { id: 'leg', label: 'LEGS', name: 'Legs' },
] as const;
export const STRIKE_POSITIONS = [
  { id: 'dist', label: 'DISTANCE', name: 'At distance' },
  { id: 'clinch', label: 'CLINCH', name: 'In the clinch' },
  { id: 'ground', label: 'GROUND', name: 'On the ground' },
] as const;
export const BODY_IDS: string[] = STRIKE_TARGETS.map((t) => t.id);
export const BODY_3_IDS: string[] = STRIKE_POSITIONS.flatMap((p) => STRIKE_TARGETS.map((t) => `${p.id}-${t.id}`));

const CANVAS = 'assets/textures/canvas.svg';

// ---- the figure: drawn about x 80, from the crown at y 8 to the soles at y 370 (a unit's about half an inch),
// then placed and scaled

// (a point on a figure placed at ox, oy, scaled by s)
type At = (x: number, y: number) => string;
const placer =
  (ox: number, oy: number, s: number): At =>
  (x, y) =>
    `${r1(ox + (x - 80) * s)} ${r1(oy + y * s)}`;

// (a path's points, its right side drawn and its left the mirror of it: the figure's square on)
const HEAD = (p: At) =>
  `M${p(80, 8)}C${p(93, 8)} ${p(102, 19)} ${p(102, 35)}C${p(102, 49)} ${p(96, 59)} ${p(89, 63)}L${p(89, 74)}L${p(71, 74)}L${p(71, 63)}C${p(64, 59)} ${p(58, 49)} ${p(58, 35)}C${p(58, 19)} ${p(67, 8)} ${p(80, 8)}Z`;
const TORSO = (p: At) =>
  `M${p(71, 73)}C${p(64, 75)} ${p(50, 77)} ${p(38, 82)}C${p(29, 86)} ${p(25, 96)} ${p(26, 106)}C${p(29, 112)} ${p(34, 116)} ${p(36, 119)}` +
  `C${p(37, 134)} ${p(40, 152)} ${p(46, 168)}C${p(43, 178)} ${p(41, 190)} ${p(40, 200)}L${p(120, 200)}C${p(119, 190)} ${p(117, 178)} ${p(114, 168)}` +
  `C${p(120, 152)} ${p(123, 134)} ${p(124, 119)}C${p(126, 116)} ${p(131, 112)} ${p(134, 106)}C${p(135, 96)} ${p(131, 86)} ${p(122, 82)}C${p(110, 77)} ${p(96, 75)} ${p(89, 73)}Z`;
// (a side's limb, x mirrored for the left: m(x))
const ARM = (p: At, m: (x: number) => number) =>
  `M${p(m(128), 96)}C${p(m(136), 104)} ${p(m(140), 118)} ${p(m(140), 134)}C${p(m(141), 150)} ${p(m(142), 166)} ${p(m(140), 184)}C${p(m(139), 194)} ${p(m(138), 200)} ${p(m(137), 206)}` +
  `L${p(m(124), 206)}C${p(m(124), 196)} ${p(m(125), 184)} ${p(m(125), 170)}C${p(m(125), 156)} ${p(m(124), 138)} ${p(m(124), 119)}Z`;
const LEG = (p: At, m: (x: number) => number) =>
  `M${p(m(80), 200)}L${p(m(120), 200)}C${p(m(123), 214)} ${p(m(124), 232)} ${p(m(121), 254)}C${p(m(118), 272)} ${p(m(115), 284)} ${p(m(115), 294)}` +
  `C${p(m(116), 308)} ${p(m(118), 322)} ${p(m(114), 338)}C${p(m(111), 350)} ${p(m(108), 356)} ${p(m(108), 360)}C${p(m(112), 364)} ${p(m(114), 368)} ${p(m(110), 370)}` +
  `L${p(m(90), 370)}C${p(m(89), 364)} ${p(m(91), 358)} ${p(m(91), 352)}C${p(m(90), 336)} ${p(m(88), 318)} ${p(m(89), 300)}C${p(m(89), 292)} ${p(m(88), 282)} ${p(m(87), 268)}` +
  `C${p(m(85), 248)} ${p(m(83), 230)} ${p(m(81.5), 214)}Z`;
const RIGHT = (x: number) => x;
const LEFT = (x: number) => 160 - x;

// Where each target's numbers sit (the head's a little high: its number and count under it inside the face)
const TEXT_AT = { head: [80, 33], body: [80, 136], leg: [80, 252] } as const;

interface Figure {
  backdrop: HeatShape[];
  overlay: HeatShape[];
  cells: { target: (typeof STRIKE_TARGETS)[number]['id']; d: string; cx: number; cy: number }[];
}

// A figure at ox (its middle), oy (the top of its head's box) and scale s: its silhouette and gloves under the
// cells, its outline and waistband over them, its three cells
function figure(ox: number, oy: number, s: number): Figure {
  const p = placer(ox, oy, s);
  const legs = LEG(p, RIGHT) + LEG(p, LEFT);
  const arms = ARM(p, RIGHT) + ARM(p, LEFT);
  const at = (x: number) => r1(ox + (x - 80) * s);
  const y = (v: number) => r1(oy + v * s);
  const glove = (x: number): HeatShape[] => [
    { kind: 'rect', x: at(x - 9), y: y(203), w: r1(18 * s), h: r1(23 * s), rx: r1(8 * s), cls: 'hm-glove' },
    { kind: 'rect', x: at(x - 9), y: y(203), w: r1(18 * s), h: r1(4.5 * s), rx: r1(2 * s), cls: 'hm-glove-cuff' },
  ];
  return {
    backdrop: [
      // (his shadow on the canvas, under his feet)
      { kind: 'path', d: `M${p(40, 370)}C${p(40, 362)} ${p(120, 362)} ${p(120, 370)}C${p(120, 378)} ${p(40, 378)} ${p(40, 370)}Z`, cls: 'hm-shadow' },
      { kind: 'path', d: arms, cls: 'hm-figure-base' },
      { kind: 'path', d: HEAD(p) + TORSO(p) + legs, cls: 'hm-figure-base' },
      ...glove(130.5),
      ...glove(29.5),
    ],
    overlay: [
      { kind: 'path', d: HEAD(p) + TORSO(p) + legs, cls: 'hm-figure-line' },
      { kind: 'rect', x: at(40), y: y(197.5), w: r1(80 * s), h: r1(5 * s), rx: r1(1.5 * s), cls: 'hm-waistband' },
    ],
    cells: [
      { target: 'head', d: HEAD(p), cx: at(TEXT_AT.head[0]), cy: y(TEXT_AT.head[1]) },
      { target: 'body', d: TORSO(p), cx: at(TEXT_AT.body[0]), cy: y(TEXT_AT.body[1]) },
      { target: 'leg', d: legs, cx: at(TEXT_AT.leg[0]), cy: y(TEXT_AT.leg[1]) },
    ],
  };
}

// An octagon-cut board (the cage from above, stretched to the picture), its corners cut c deep
function octagon(x0: number, y0: number, x1: number, y1: number, c: number): string {
  return pts([
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ]);
}
const board = (points: string): HeatShape[] => [
  { kind: 'texture', href: CANVAS, tile: 220, points },
  { kind: 'polygon', points, cls: 'hm-mat' },
  { kind: 'polygon', points, cls: 'hm-cage' },
];

// One figure, its targets named down the left with a dotted lead to each
export function bodySurface(): HeatSurface {
  const W = 236;
  const H = 400;
  const f = figure(W / 2 + 14, 14, 1);
  const outline = octagon(4, 4, W - 4, H - 4, 34);
  const label = (text: string, yv: number, toX: number): HeatShape[] => [
    { kind: 'text', x: 14, y: yv + 3, text, cls: 'hm-part' },
    { kind: 'path', d: `M44 ${yv}H${toX}`, cls: 'hm-lead' },
  ];
  return {
    id: 'body',
    viewBox: { x: 0, y: 0, w: W, h: H },
    backdrop: [...board(outline), ...f.backdrop],
    overlay: [...f.overlay, ...label('HEAD', 44, 106), ...label('BODY', 164, 68), ...label('LEGS', 314, 94)],
    cells: f.cells.map((c) => {
      const t = STRIKE_TARGETS.find((x) => x.id === c.target)!;
      return { id: t.id, d: c.d, cx: c.cx, cy: c.cy, name: t.name, short: t.name };
    }),
    text: { main: 15, sub: 10 },
    aria: 'A fighter, square on: strikes to the head, the body and the legs',
  };
}

// Three figures, a position each, named under them
export function body3Surface(): HeatSurface {
  const S = 0.6;
  const STEP = 112;
  const W = STEP * 3 + 8;
  const H = 274;
  const outline = octagon(4, 4, W - 4, H - 4, 26);
  const backdrop: HeatShape[] = [...board(outline)];
  const overlay: HeatShape[] = [];
  const cells: HeatCellShape[] = [];
  STRIKE_POSITIONS.forEach((pos, i) => {
    const cx = 4 + STEP * (i + 0.5);
    const f = figure(cx, 14, S);
    backdrop.push(...f.backdrop, { kind: 'text', x: r1(cx), y: H - 18, text: pos.label, cls: 'hm-part under' });
    if (i) backdrop.push({ kind: 'path', d: `M${r1(4 + STEP * i)} 40V${H - 40}`, cls: 'hm-divide' });
    overlay.push(...f.overlay);
    for (const c of f.cells) {
      const t = STRIKE_TARGETS.find((x) => x.id === c.target)!;
      cells.push({ id: `${pos.id}-${t.id}`, d: c.d, cx: c.cx, cy: c.cy, name: `${t.name}, ${pos.name.toLowerCase()}`, short: `${t.name} (${pos.label.toLowerCase()})` });
    }
  });
  return {
    id: 'body-3',
    viewBox: { x: 0, y: 0, w: W, h: H },
    backdrop,
    overlay,
    cells,
    text: { main: 12, sub: 8.5 },
    aria: 'Three fighters: strikes to the head, body and legs at distance, in the clinch and on the ground',
  };
}
