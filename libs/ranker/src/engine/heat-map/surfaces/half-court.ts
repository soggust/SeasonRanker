// The half-court surface: the NBA's floor from the baseline (the top) out past the arc, as the game view's shot
// chart draws it (game-chart.ts's court: 50 feet across, the rim 5.25 feet off the baseline, the lane 16 wide
// and 19 deep, the arc 23.75 out and 22 in the corners, the restricted area 4), to scale at 6 units a foot, on
// the sport's own hardwood under a dark stain, its lines painted over the cells. Its twelve cells, the standard
// shot zones (apps/nba/scripts/shot-zones.mjs's ZONES, the same ids): the restricted area, the rest of the lane,
// mid-range by its angle from the rim (each baseline, each elbow, the middle), the two corner threes, and the
// threes above the break (each wing, the top). Left and right as you look at the basket. Cut off 37 feet from
// the baseline: a heave from past there is in its above-the-break zone all the same.

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { r1 } from './field';

// (the floor: the NBA app's maple photo, the body's own)
export const HARDWOOD = 'assets/textures/hardwood.webp';

export const COURT_ZONES = ['ra', 'paint', 'mid-lb', 'mid-lw', 'mid-c', 'mid-rw', 'mid-rb', 'c3-l', 'c3-r', 'atb-l', 'atb-c', 'atb-r'] as const;
export type CourtZone = (typeof COURT_ZONES)[number];

export const COURT_WORDS: Record<CourtZone, { name: string; short: string; three?: boolean }> = {
  ra: { name: 'Restricted area', short: 'At the rim' },
  paint: { name: 'In the paint (outside the restricted area)', short: 'Paint' },
  'mid-lb': { name: 'Mid-range, left baseline', short: 'Left baseline' },
  'mid-lw': { name: 'Mid-range, left elbow', short: 'Left elbow' },
  'mid-c': { name: 'Mid-range, middle', short: 'Middle' },
  'mid-rw': { name: 'Mid-range, right elbow', short: 'Right elbow' },
  'mid-rb': { name: 'Mid-range, right baseline', short: 'Right baseline' },
  'c3-l': { name: 'Left corner three', short: 'Left corner', three: true },
  'c3-r': { name: 'Right corner three', short: 'Right corner', three: true },
  'atb-l': { name: 'Above-the-break three, left wing', short: 'Left wing 3', three: true },
  'atb-c': { name: 'Above-the-break three, top of the key', short: 'Top 3', three: true },
  'atb-r': { name: 'Above-the-break three, right wing', short: 'Right wing 3', three: true },
};

// ---- the court in feet from the rim (x across, left negative; y out from the rim toward half court)

const S = 6;
const BASELINE = -5.25;
const HALF_W = 25;
const ARC = 23.75;
const CORNER_X = 22;
// (where the corner's straight line meets the arc)
const CORNER_Y = Math.sqrt(ARC * ARC - CORNER_X * CORNER_X);
const LANE_X = 8;
const FT_Y = 13.75;
const RA_R = 4;
const BOARD_Y = -1.25;
// (how far out it's drawn: 37 feet from the baseline)
const Y_END = 31.75;

type P = [number, number];
// A spot in the drawing's units: the baseline at the top, x 0-300 across
export const courtXY = ([x, y]: P): P => [r1(150 + x * S), r1((y - BASELINE) * S)];
const pts = (list: P[]) => list.map((p) => courtXY(p).join(',')).join(' ');
const line = (list: P[], close = false) =>
  list.map((p, i) => `${i ? 'L' : 'M'}${courtXY(p).join(' ')}`).join('') + (close ? 'Z' : '');
const rad = (deg: number) => (deg * Math.PI) / 180;
// (an arc around a centre, from one angle to another, a point every 3 degrees or less)
function arc([cx, cy]: P, r: number, from: number, to: number): P[] {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 3));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = rad(from + ((to - from) * i) / steps);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as P;
  });
}

// (the arc's ends: where it meets the corners, its angle from the rim)
const T0 = (Math.atan2(CORNER_Y, CORNER_X) * 180) / Math.PI;
const THREE_ARC = arc([0, 0], ARC, 180 - T0, T0);

// A polygon cut to a wedge from the rim (angles from the right baseline, counterclockwise as the court's drawn
// from behind the shooter): Sutherland-Hodgman, the wedge's two sides in turn
function clipHalf(poly: P[], [ux, uy]: P, keepLeft: boolean): P[] {
  const side = ([x, y]: P) => (ux * y - uy * x) * (keepLeft ? 1 : -1);
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [sa, sb] = [side(a), side(b)];
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
export function wedge(poly: P[], from: number, to: number): P[] {
  const u = (deg: number): P => [Math.cos(rad(deg)), Math.sin(rad(deg))];
  return clipHalf(clipHalf(poly, u(from), true), u(to), false);
}

// The regions the zones are cut from
const INSIDE_ARC_OUTSIDE_LANE: P[] = [
  [-CORNER_X, BASELINE],
  [-CORNER_X, CORNER_Y],
  ...THREE_ARC,
  [CORNER_X, CORNER_Y],
  [CORNER_X, BASELINE],
  [LANE_X, BASELINE],
  [LANE_X, FT_Y],
  [-LANE_X, FT_Y],
  [-LANE_X, BASELINE],
];
const ABOVE_THE_BREAK: P[] = [[HALF_W, CORNER_Y], [HALF_W, Y_END], [-HALF_W, Y_END], [-HALF_W, CORNER_Y], [-CORNER_X, CORNER_Y], ...THREE_ARC, [CORNER_X, CORNER_Y]];
// (the restricted area: its arc and its two short lines back to the backboard)
const RESTRICTED: P[] = [[-RA_R, BOARD_Y], ...arc([0, 0], RA_R, 180, 0), [RA_R, BOARD_Y]];
const LANE: P[] = [
  [-LANE_X, BASELINE],
  [LANE_X, BASELINE],
  [LANE_X, FT_Y],
  [-LANE_X, FT_Y],
];

// (each mid-range and above-the-break zone's wedge, in degrees: a shot behind the rim's line is a baseline one)
const MID_WEDGES: Record<string, [number, number]> = { 'mid-rb': [-90, 36], 'mid-rw': [36, 72], 'mid-c': [72, 108], 'mid-lw': [108, 144], 'mid-lb': [144, 270] };
const ATB_WEDGES: Record<string, [number, number]> = { 'atb-r': [-90, 72], 'atb-c': [72, 108], 'atb-l': [108, 270] };

// (where each zone's numbers sit, in feet)
const LABEL: Record<CourtZone, P> = {
  ra: [0, 2.3],
  paint: [0, 9.1],
  'mid-lb': [-15.2, 1.6],
  'mid-lw': [-11.6, 14.2],
  'mid-c': [0, 18.4],
  'mid-rw': [11.6, 14.2],
  'mid-rb': [15.2, 1.6],
  'c3-l': [-23.5, 2.2],
  'c3-r': [23.5, 2.2],
  'atb-l': [-19.6, 21.2],
  'atb-c': [0, 27.3],
  'atb-r': [19.6, 21.2],
};

function cell(id: CourtZone, shape: { points?: string; d?: string }): HeatCellShape {
  const [cx, cy] = courtXY(LABEL[id]);
  return { id, ...shape, cx, cy, name: COURT_WORDS[id].name, short: COURT_WORDS[id].short };
}

export function halfCourtSurface(): HeatSurface {
  const floor = pts([
    [-HALF_W, BASELINE],
    [HALF_W, BASELINE],
    [HALF_W, Y_END],
    [-HALF_W, Y_END],
  ]);
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: HARDWOOD, tile: 150, points: floor },
    // (warmed to the sport's honey, as the page's floor is, then stained dark so the colors carry)
    { kind: 'polygon', points: floor, cls: 'hm-honey' },
    { kind: 'polygon', points: floor, cls: 'hm-stain' },
    // (the lane painted a shade deeper, and the top of the key's circle inside the arc)
    { kind: 'polygon', points: pts(LANE), cls: 'hm-lane' },
  ];
  const cells: HeatCellShape[] = [
    cell('ra', { points: pts(RESTRICTED) }),
    // (the lane less the restricted area: a path with the area cut out of it, drawn even-odd)
    cell('paint', { d: line(LANE, true) + line(RESTRICTED, true) }),
    ...(Object.entries(MID_WEDGES) as [CourtZone, [number, number]][]).map(([id, [a, b]]) => cell(id, { points: pts(wedge(INSIDE_ARC_OUTSIDE_LANE, a, b)) })),
    cell('c3-l', {
      points: pts([
        [-HALF_W, BASELINE],
        [-CORNER_X, BASELINE],
        [-CORNER_X, CORNER_Y],
        [-HALF_W, CORNER_Y],
      ]),
    }),
    cell('c3-r', {
      points: pts([
        [CORNER_X, BASELINE],
        [HALF_W, BASELINE],
        [HALF_W, CORNER_Y],
        [CORNER_X, CORNER_Y],
      ]),
    }),
    ...(Object.entries(ATB_WEDGES) as [CourtZone, [number, number]][]).map(([id, [a, b]]) => cell(id, { points: pts(wedge(ABOVE_THE_BREAK, a, b)) })),
  ];
  // (in the zones' own order, the shot-zones file's)
  cells.sort((a, b) => COURT_ZONES.indexOf(a.id as CourtZone) - COURT_ZONES.indexOf(b.id as CourtZone));

  // The lines, painted over the cells: the baseline and sidelines, the lane, the free-throw circle (dashed
  // inside the lane), the arc and its corners, the restricted area, the backboard and the rim
  const ftCircle = arc([0, FT_Y], 6, 0, 180);
  const ftInside = arc([0, FT_Y], 6, 180, 360);
  const [rimX, rimY] = courtXY([0, 0]);
  const top: HeatShape[] = [
    {
      kind: 'path',
      d: line([
        [-HALF_W, Y_END],
        [-HALF_W, BASELINE],
        [HALF_W, BASELINE],
        [HALF_W, Y_END],
      ]),
      cls: 'hm-court-line edge',
    },
    { kind: 'path', d: line(LANE, true), cls: 'hm-court-line' },
    { kind: 'path', d: line(ftCircle), cls: 'hm-court-line' },
    { kind: 'path', d: line(ftInside), cls: 'hm-court-line dashed' },
    { kind: 'path', d: line([[-CORNER_X, BASELINE], [-CORNER_X, CORNER_Y], ...THREE_ARC, [CORNER_X, CORNER_Y], [CORNER_X, BASELINE]]), cls: 'hm-court-line three' },
    { kind: 'path', d: line(RESTRICTED), cls: 'hm-court-line thin' },
    { kind: 'path', d: line([[-3, BOARD_Y], [3, BOARD_Y]]), cls: 'hm-board' },
    { kind: 'path', d: `M${rimX} ${courtXY([0, BOARD_Y])[1]}V${r1(rimY - 4.5)}`, cls: 'hm-board neck' },
    { kind: 'circle', cx: rimX, cy: rimY, r: 4.5, cls: 'hm-rim' },
  ];
  return {
    id: 'half-court',
    viewBox: { x: -6, y: -8, w: 312, h: r1(courtXY([0, Y_END])[1] + 14) },
    backdrop,
    overlay: top,
    cells,
    text: { main: 13, sub: 8.5 },
    aria: 'A half court seen from behind the shooter, the basket at the top: the restricted area, the paint, mid-range (each baseline, each elbow, the middle), the corner threes and the threes above the break (each wing, the top)',
  };
}
