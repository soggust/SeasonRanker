// The down-distance surface: a grid of the four downs (rows, 1st to 4th) by the distance to go (columns:
// short 1-3, medium 4-7, long 8+), each cell "<down>-<distance>" ("3-long"), on the turf like the field's.

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { TURF, r1 } from './field';

export const DOWNS = [1, 2, 3, 4];
export const DISTANCES = [
  { id: 'short', label: 'SHORT', range: '1-3', words: 'short (1-3 to go)' },
  { id: 'medium', label: 'MEDIUM', range: '4-7', words: 'medium (4-7 to go)' },
  { id: 'long', label: 'LONG', range: '8+', words: 'long (8+ to go)' },
];
const ORD = ['1st', '2nd', '3rd', '4th'];

const LEFT = 38;
const HEAD = 24;
const W = 320;
const ROW = 46;
const GAP = 3;
const RADIUS = 6;

// (a rounded box as a path)
function box(x0: number, y0: number, w: number, h: number, r = RADIUS): string {
  return `M${r1(x0 + r)} ${r1(y0)}H${r1(x0 + w - r)}Q${r1(x0 + w)} ${r1(y0)} ${r1(x0 + w)} ${r1(y0 + r)}V${r1(y0 + h - r)}Q${r1(x0 + w)} ${r1(y0 + h)} ${r1(x0 + w - r)} ${r1(y0 + h)}H${r1(x0 + r)}Q${r1(x0)} ${r1(y0 + h)} ${r1(x0)} ${r1(y0 + h - r)}V${r1(y0 + r)}Q${r1(x0)} ${r1(y0)} ${r1(x0 + r)} ${r1(y0)}Z`;
}

export function downDistanceSurface(): HeatSurface {
  const colW = (W - LEFT) / 3;
  const H = HEAD + ROW * 4;
  const board = `${LEFT - 4},${HEAD - 4} ${W},${HEAD - 4} ${W},${H} ${LEFT - 4},${H}`;
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: TURF, tile: 160, points: board },
    { kind: 'polygon', points: board, cls: 'hm-shade' },
    ...DISTANCES.flatMap((d, j): HeatShape[] => [
      { kind: 'text', x: r1(LEFT + colW * (j + 0.5)), y: HEAD - 12, text: d.label, cls: 'hm-axis' },
      { kind: 'text', x: r1(LEFT + colW * (j + 0.5)), y: HEAD - 3.5, text: `${d.range} to go`, cls: 'hm-axis sub' },
    ]),
    ...DOWNS.map((d, i): HeatShape => ({ kind: 'text', x: LEFT - 12, y: HEAD + ROW * (i + 0.5) + 4, text: ORD[i], cls: 'hm-axis down' })),
  ];
  const cells: HeatCellShape[] = DOWNS.flatMap((down, i) =>
    DISTANCES.map((d, j) => {
      const x0 = LEFT + colW * j + GAP / 2;
      const y0 = HEAD + ROW * i + GAP / 2;
      return {
        id: `${down}-${d.id}`,
        d: box(x0, y0, colW - GAP, ROW - GAP),
        cx: r1(x0 + (colW - GAP) / 2),
        cy: r1(y0 + (ROW - GAP) / 2 - 3),
        name: `${ORD[i]} & ${d.words}`,
        short: `${ORD[i]} & ${d.id}`,
      };
    }),
  );
  return {
    id: 'down-distance',
    viewBox: { x: 0, y: 0, w: W, h: H + 2 },
    backdrop,
    cells,
    text: { main: 14, sub: 9.5, noun: true },
    aria: 'Down and distance: the four downs by short, medium and long to go',
  };
}
