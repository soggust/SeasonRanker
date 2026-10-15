// The field surface: a stretch of it looking downfield from behind the offense, the line of scrimmage near the
// bottom, wider at the near end (a touch of perspective), 8 yards behind the line up to 36 past it; its twelve
// pass zones, three across (left, middle, right) and four deep (behind the line, short 0-9 air yards,
// intermediate 10-19, deep 20+). The Field Map's pass chart and the Heat Maps' zones draw on the same one
// (player-card/field-map.ts reads its geometry from here).

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';

export type FieldDepth = 'behind' | 'short' | 'mid' | 'deep';
export type FieldSide = 'left' | 'middle' | 'right';

export const DEPTHS: FieldDepth[] = ['behind', 'short', 'mid', 'deep'];
export const SIDES: FieldSide[] = ['left', 'middle', 'right'];

export const DEPTH_WORDS: Record<FieldDepth, { name: string; range: string }> = {
  behind: { name: 'Behind the line', range: 'behind the line of scrimmage' },
  short: { name: 'Short', range: '0-9 air yds' },
  mid: { name: 'Intermediate', range: '10-19 air yds' },
  deep: { name: 'Deep', range: '20+ air yds' },
};

// "Deep middle", "Behind the line, left"
export function zoneName(depth: FieldDepth, side: FieldSide): string {
  return depth === 'behind' ? `Behind the line, ${side}` : `${DEPTH_WORDS[depth].name} ${side}`;
}

export const PASS_BOX = { x: -4, y: -18, w: 308, h: 304 };
const V_MIN = -8;
const V_MAX = 36;
const Y_BOTTOM = 282;
const Y_YARD = (Y_BOTTOM - 8) / (V_MAX - V_MIN);
// (each depth's yards: behind the line, 0-9, 10-19, 20 on)
export const BAND_YARDS: Record<FieldDepth, [number, number]> = { behind: [V_MIN, 0], short: [0, 10], mid: [10, 20], deep: [20, V_MAX] };

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const pts = (list: [number, number][]) => list.map(([x, y]) => `${x},${y}`).join(' ');
const fy = (v: number) => Y_BOTTOM - (v - V_MIN) * Y_YARD;
const halfWidth = (v: number) => 150 - (v - V_MIN) * 0.92;
// A spot on the field: u across it (0 the left sideline, 1 the right), v yards past the line
export const spot = (u: number, v: number): [number, number] => [r1(150 + (u - 0.5) * 2 * halfWidth(v)), r1(fy(v))];

// A zone's outline and its middle (s: its side's place, 0 left to 2 right)
export function zoneShape(depth: FieldDepth, s: number): { points: string; cx: number; cy: number } {
  const [v0, v1] = BAND_YARDS[depth];
  const [u0, u1] = [s / 3, (s + 1) / 3];
  const [cx, cy] = spot((u0 + u1) / 2, (v0 + v1) / 2);
  return { points: pts([spot(u0, v0), spot(u1, v0), spot(u1, v1), spot(u0, v1)]), cx, cy };
}

// The field itself: its outline, the turf's mowed stripes (every 5 yards), the yard lines, the hash marks,
// the numbers at the 10s along both sidelines, the line of scrimmage
export interface PassField {
  outline: string;
  stripes: string[];
  lines: { d: string; band: boolean }[];
  hashes: string;
  numbers: { x: number; y: number; text: string; rotate: number }[];
  los: { x1: number; x2: number; y: number };
  sides: { x: number; y: number; text: string }[];
}

function passField(): PassField {
  const stripes: string[] = [];
  for (let v = V_MIN; v < V_MAX; v += 5) {
    const top = Math.min(v + 5, V_MAX);
    if (((v - V_MIN) / 5) % 2 === 0) stripes.push(pts([spot(0, v), spot(1, v), spot(1, top), spot(0, top)]));
  }
  const lines: { d: string; band: boolean }[] = [];
  for (let v = -5; v < V_MAX; v += 5) {
    if (v === 0) continue;
    const [x1, y] = spot(0, v);
    const [x2] = spot(1, v);
    lines.push({ d: `M${x1} ${y}H${x2}`, band: v === 10 || v === 20 });
  }
  // (a tick every yard at the hashes and in from each sideline)
  let hashes = '';
  for (let v = V_MIN + 1; v < V_MAX; v++) {
    if (v % 5 === 0) continue;
    for (const u of [0.025, 0.44, 0.56, 0.975]) {
      const [x, y] = spot(u, v);
      hashes += `M${r1(x - 2.2)} ${y}h4.4`;
    }
  }
  const numbers: PassField['numbers'] = [];
  for (const v of [10, 20, 30]) {
    for (const [u, rotate] of [
      [0.075, 90],
      [0.925, -90],
    ] as const) {
      const [x, y] = spot(u, v);
      numbers.push({ x, y, text: String(v), rotate });
    }
  }
  const [losL, losY] = spot(0, 0);
  const [losR] = spot(1, 0);
  return {
    outline: pts([spot(0, V_MIN), spot(1, V_MIN), spot(1, V_MAX), spot(0, V_MAX)]),
    stripes,
    lines,
    hashes,
    numbers,
    los: { x1: losL, x2: losR, y: losY },
    sides: SIDES.map((s, i) => ({ x: spot((i + 0.5) / 3, V_MAX)[0], y: r1(fy(V_MAX) - 7), text: s.toUpperCase() })),
  };
}

export const PASS_FIELD = passField();

// (the turf under every field: the theme's texture, darkened under the chalk)
export const TURF = 'assets/textures/turf.webp';

// The Heat Maps' field: the Field Map's turf and chalk as backdrop pieces, its twelve zones as cells
// ("deep-left": the file's order, depth by depth from behind the line, left to right)
export function fieldSurface(): HeatSurface {
  const f = PASS_FIELD;
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: TURF, tile: 160, points: f.outline },
    { kind: 'polygon', points: f.outline, cls: 'hm-shade' },
    ...f.stripes.map((points): HeatShape => ({ kind: 'polygon', points, cls: 'hm-stripe' })),
    { kind: 'path', d: f.hashes, cls: 'hm-hash' },
    ...f.lines.map((l): HeatShape => ({ kind: 'path', d: l.d, cls: l.band ? 'hm-yard band' : 'hm-yard' })),
    ...f.numbers.map((n): HeatShape => ({ kind: 'text', x: n.x, y: n.y, text: n.text, cls: 'hm-num', rotate: n.rotate })),
    { kind: 'polygon', points: f.outline, cls: 'hm-edge' },
  ];
  const cells: HeatCellShape[] = DEPTHS.flatMap((depth) =>
    SIDES.map((side, s) => ({
      id: `${depth}-${side}`,
      ...zoneShape(depth, s),
      name: depth === 'behind' ? zoneName(depth, side) : `${zoneName(depth, side)} (${DEPTH_WORDS[depth].range})`,
      short: zoneName(depth, side),
    })),
  );
  return {
    id: 'field',
    viewBox: PASS_BOX,
    backdrop,
    overlay: [
      { kind: 'path', d: `M${f.los.x1} ${f.los.y}H${f.los.x2}`, cls: 'hm-los' },
      ...f.sides.map((s): HeatShape => ({ kind: 'text', x: s.x, y: s.y, text: s.text, cls: 'hm-side' })),
    ],
    cells,
    text: { main: 14, sub: 9.5 },
    aria: 'Pass zones, looking downfield from behind the offense: three across, four deep',
  };
}
