// The strike zone from the catcher's view: a 5 x 5 grid, the zone's nine boxes (the plate's width, the batter's
// own top and bottom) and the ring around them, the chase area and beyond (every pitch further out counted in
// it). Rows top to bottom, columns the catcher's left to right: a right-handed hitter stands on the left, a
// left-handed one on the right. Cells "z<row><col>" (apps/mlb/scripts/build-heat-maps.mjs's ZONE_IDS: z00 the
// high left corner, z22 the heart of the zone, z44 the low right corner). Home plate under it, on the dirt.

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { pts, r1 } from './field';

export const ZONE_CELL_IDS: string[] = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => `z${r}${c}`)).flat();
// (the zone's own nine and the ring's sixteen)
export const IN_ZONE = (id: string): boolean => /^z[1-3][1-3]$/.test(id);

// (the boxes' sizes: the zone's taller than wide, the ring narrower)
const COLS = [34, 44, 44, 44, 34];
const ROWS = [34, 50, 50, 50, 34];
const GAP = 2;
const LEFT = 28;
const TOP = 8;
const W = COLS.reduce((a, v) => a + v, 0);
const H = ROWS.reduce((a, v) => a + v, 0);
const colX = (c: number) => LEFT + COLS.slice(0, c).reduce((a, v) => a + v, 0);
const rowY = (r: number) => TOP + ROWS.slice(0, r).reduce((a, v) => a + v, 0);

const ROW_WORDS = ['Above the zone', 'High', 'Middle', 'Low', 'Below the zone'];
const COL_WORDS = ['off the plate, left', 'left', 'middle', 'right', 'off the plate, right'];

// A cell's name in the hover: "High left", "Heart of the zone", "Chase: above the zone, left"
export function zoneCellName(row: number, col: number): string {
  if (row === 2 && col === 2) return 'Heart of the zone';
  const inner = row > 0 && row < 4 && col > 0 && col < 4;
  if (inner) return `${ROW_WORDS[row]} ${COL_WORDS[col]}`;
  if (row === 0 || row === 4) return `Chase: ${ROW_WORDS[row].toLowerCase()}${col === 2 ? '' : `, ${col < 2 ? 'left' : 'right'}`}`;
  return `Chase: ${COL_WORDS[col]}${row === 2 ? '' : `, ${ROW_WORDS[row].toLowerCase()}`}`;
}

// (a rounded box as a path)
function box(x0: number, y0: number, w: number, h: number, r = 3): string {
  return `M${r1(x0 + r)} ${r1(y0)}H${r1(x0 + w - r)}Q${r1(x0 + w)} ${r1(y0)} ${r1(x0 + w)} ${r1(y0 + r)}V${r1(y0 + h - r)}Q${r1(x0 + w)} ${r1(y0 + h)} ${r1(x0 + w - r)} ${r1(y0 + h)}H${r1(x0 + r)}Q${r1(x0)} ${r1(y0 + h)} ${r1(x0)} ${r1(y0 + h - r)}V${r1(y0 + r)}Q${r1(x0)} ${r1(y0)} ${r1(x0 + r)} ${r1(y0)}Z`;
}

export function strikeZoneSurface(): HeatSurface {
  const zx0 = colX(1);
  const zy0 = rowY(1);
  const zw = COLS[1] + COLS[2] + COLS[3];
  const zh = ROWS[1] + ROWS[2] + ROWS[3];
  const plateY = TOP + H + 14;
  const plateW = zw;
  const px0 = zx0;
  const backdrop: HeatShape[] = [
    // (the dirt round the plate, under it)
    { kind: 'texture', href: 'assets/textures/dirt.webp', tile: 120, points: pts([[zx0 - 24, plateY - 8], [zx0 + zw + 24, plateY - 8], [zx0 + zw + 24, plateY + 18], [zx0 - 24, plateY + 18]]) },
    { kind: 'rect', x: zx0 - 24, y: plateY - 8, w: zw + 48, h: 26, rx: 5, cls: 'hm-dirt' },
    // (the board: the chase ring a shade darker than the zone)
    { kind: 'path', d: box(LEFT - 4, TOP - 4, W + 8, H + 8, 8), cls: 'hm-zone-board' },
    { kind: 'rect', x: zx0 - 1, y: zy0 - 1, w: zw + 2, h: zh + 2, cls: 'hm-zone-in' },
    // (the batters' boxes: a right-handed hitter on the catcher's left)
    { kind: 'text', x: r1(LEFT - 15), y: r1(zy0 + zh / 2), text: 'RHH', cls: 'hm-batter', rotate: -90 },
    { kind: 'text', x: r1(LEFT + W + 15), y: r1(zy0 + zh / 2), text: 'LHH', cls: 'hm-batter', rotate: 90 },
  ];
  const cells: HeatCellShape[] = ZONE_CELL_IDS.map((id, i) => {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const x0 = colX(col) + GAP / 2;
    const y0 = rowY(row) + GAP / 2;
    const w = COLS[col] - GAP;
    const h = ROWS[row] - GAP;
    return { id, d: box(x0, y0, w, h), cx: r1(x0 + w / 2), cy: r1(y0 + h / 2 - 2.5), name: zoneCellName(row, col) };
  });
  // ---- over the cells: the zone's edge in chalk, its thirds faintly; home plate (seen from behind, a little
  // from above) and the catcher's view named under it
  // (the plate a touch narrower than the zone's boxes, which reach a ball's width past it)
  const inset = 8;
  const plate = pts([
    [px0 + inset, plateY],
    [px0 + plateW - inset, plateY],
    [px0 + plateW - inset, plateY + 3.5],
    [r1(px0 + plateW / 2), plateY + 9],
    [px0 + inset, plateY + 3.5],
  ]);
  const overlay: HeatShape[] = [
    { kind: 'rect', x: zx0, y: zy0, w: zw, h: zh, rx: 2, cls: 'hm-zone-edge' },
    { kind: 'polygon', points: plate, cls: 'hm-plate big' },
    { kind: 'text', x: r1(LEFT + W / 2), y: plateY + 31, text: 'CATCHER’S VIEW', cls: 'hm-axis sub' },
  ];
  return {
    id: 'strike-zone',
    viewBox: { x: 0, y: 0, w: LEFT * 2 + W, h: plateY + 36 },
    backdrop,
    overlay,
    cells,
    text: { main: 12.5, sub: 8 },
    aria: "The strike zone from the catcher's view, a right-handed hitter on the left: its nine boxes and the chase area around them",
  };
}
