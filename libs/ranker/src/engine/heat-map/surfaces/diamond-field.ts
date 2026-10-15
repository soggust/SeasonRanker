// The diamond: a ballpark from behind home plate, its fielders' ground as cells (the infield's four from the
// third-base line round to the first-base line past the bags, the outfield's three out to the warning track),
// on the grass and the infield dirt, the bases, the mound and the chalk over them. Cells by position, "1B" ...
// "RF" (apps/mlb/scripts/build-heat-maps.mjs's DEF_POSITIONS): a team's Outs Above Average or a fielder's at each
// position he played. In the spray chart's units (ballpark.ts), its distances drawn on a gentle curve (WARP:
// the bases at 176 feet, the wall nearly where it is), so the infielders' ground has room for its numbers.

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { LINE, type Scale, at as atTrue, fairTerritory, foulLines, sector, standardWall } from './ballpark';
import { pts, r1 } from './field';

export const DIAMOND_POSITIONS = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type DiamondPosition = (typeof DIAMOND_POSITIONS)[number];

export const POSITION_NAMES: Record<DiamondPosition, string> = {
  '1B': 'First base',
  '2B': 'Second base',
  '3B': 'Third base',
  SS: 'Shortstop',
  LF: 'Left field',
  CF: 'Center field',
  RF: 'Right field',
};

// (the diamond's scale: 400 feet as 400, nearer spots drawn further out, the infield larger)
export const WARP: Scale = (feet) => 400 * Math.pow(Math.max(0, feet) / 400, 0.55);
const at = (feet: number, deg: number) => atTrue(feet, deg, WARP);

// (each position's ground: its distances from home (feet) and its angles off center)
const GROUND: Record<DiamondPosition, { r: [number, number | ((deg: number) => number)]; a: [number, number] }> = {
  '3B': { r: [94, 168], a: [-LINE, -23] },
  SS: { r: [104, 172], a: [-23, -1] },
  '2B': { r: [104, 172], a: [1, 23] },
  '1B': { r: [94, 168], a: [23, LINE] },
  LF: { r: [204, (d) => standardWall(d) - 14], a: [-LINE, -15.5] },
  CF: { r: [222, (d) => standardWall(d) - 14], a: [-14, 14] },
  RF: { r: [204, (d) => standardWall(d) - 14], a: [15.5, LINE] },
};
// (where a position's numbers sit, feet and angle; and its name, over the cell's edge nearer home)
// (a position's name: an infielder's in the grass inside his bag, an outfielder's by the warning track)
const TEXT: Record<DiamondPosition, [number, number]> = { '3B': [132, -34], SS: [140, -12], '2B': [140, 12], '1B': [132, 34], LF: [258, -29], CF: [290, 0], RF: [258, 29] };
const LABEL: Record<DiamondPosition, [number, number]> = { '3B': [64, -33], SS: [76, -13], '2B': [76, 13], '1B': [64, 33], LF: [326, -33], CF: [374, 0], RF: [326, 33] };

// (a spot in feet, across (x, right-field side positive) and up the field (y), as a spot on the field)
const feet = (x: number, y: number): [number, number] => at(Math.hypot(x, y), (Math.atan2(x, y) * 180) / Math.PI);

export function diamondFieldSurface(): HeatSurface {
  const fair = fairTerritory(standardWall, WARP);
  // (the infield dirt: the base paths' corner round on an arc 95 feet from the front of the mound, home to the
  // lines)
  const mound: [number, number] = [0, 60.5];
  const arc: [number, number][] = [];
  for (let k = 0; k <= 40; k++) {
    const t = (-Math.PI / 4) * 1.02 + ((Math.PI / 2) * 1.02 * k) / 40;
    arc.push(feet(mound[0] + 95 * Math.sin(t), mound[1] + 95 * Math.cos(t)));
  }
  const dirt = pts([feet(0, 0), feet(-Math.SQRT1_2 * 128, Math.SQRT1_2 * 128), ...arc, feet(Math.SQRT1_2 * 128, Math.SQRT1_2 * 128)]);
  // (the infield grass: the diamond inside the base paths, a few feet in from them)
  const inset = 86;
  const grass = pts([feet(0, 6), feet(Math.SQRT1_2 * inset, Math.SQRT1_2 * inset + 3), feet(0, 127.3 - 6), feet(-Math.SQRT1_2 * inset, Math.SQRT1_2 * inset + 3)]);
  const [mx, my] = feet(0, 60.5);
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: 'assets/textures/grass.svg', tile: 48, points: fair },
    { kind: 'polygon', points: fair, cls: 'hm-park' },
    { kind: 'polygon', points: sector((d) => standardWall(d) - 12, standardWall, -LINE, LINE, WARP), cls: 'hm-track' },
    { kind: 'texture', href: 'assets/textures/dirt.webp', tile: 90, points: dirt },
    { kind: 'polygon', points: dirt, cls: 'hm-infield' },
    { kind: 'polygon', points: grass, cls: 'hm-infield-grass' },
    { kind: 'circle', cx: mx, cy: my, r: 5, cls: 'hm-mound' },
  ];
  const cells: HeatCellShape[] = DIAMOND_POSITIONS.map((pos) => {
    const g = GROUND[pos];
    const [cx, cy] = at(...TEXT[pos]);
    return { id: pos, points: sector(g.r[0], g.r[1], g.a[0], g.a[1], WARP), cx, cy, name: POSITION_NAMES[pos], short: pos };
  });
  // ---- over the cells: the chalk, the bases and the plate, each position's name
  const [hx, hy] = at(0, 0);
  const plate = pts([
    [r1(hx - 2.4), r1(hy - 1.6)],
    [r1(hx + 2.4), r1(hy - 1.6)],
    [r1(hx + 2.4), r1(hy + 0.4)],
    [hx, r1(hy + 2.2)],
    [r1(hx - 2.4), r1(hy + 0.4)],
  ]);
  const overlay: HeatShape[] = [
    { kind: 'path', d: foulLines(standardWall(LINE), WARP), cls: 'hm-chalk' },
    { kind: 'polygon', points: pts([at(0, 0), at(90, LINE), at(127.3, 0), at(90, -LINE)]), cls: 'hm-basepath' },
    ...[at(90, LINE), at(127.3, 0), at(90, -LINE)].map(([x, y]): HeatShape => ({ kind: 'rect', x: r1(x - 1.7), y: r1(y - 1.7), w: 3.4, h: 3.4, cls: 'hm-base' })),
    { kind: 'polygon', points: plate, cls: 'hm-plate' },
    ...DIAMOND_POSITIONS.map((pos): HeatShape => {
      const [x, y] = at(...LABEL[pos]);
      return { kind: 'text', x, y, text: pos, cls: 'hm-pos' };
    }),
  ];
  const [lx] = at(330, -LINE);
  const [rx] = at(330, LINE);
  const [, top] = at(412, 0);
  return {
    id: 'diamond-field',
    viewBox: { x: r1(lx - 6), y: r1(top), w: r1(rx - lx + 12), h: r1(hy + 8 - top) },
    backdrop,
    overlay,
    cells,
    text: { main: 12, sub: 7.5 },
    aria: 'A ballpark from behind home plate: first base, second base, third base and shortstop in the infield, left, center and right field out to the wall',
  };
}
