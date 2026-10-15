// The red-zone surface: the field from the 20 to the back of the end zone, looking at the goal from behind the
// offense (the end zone at the top, a touch narrower: the field's perspective), the goalposts over the end line.
// Its twelve cells, three across (left, middle, right) and four deep, near to far: the 20 to the 10, the 10 to
// the 5, the 5 to the goal line and the end zone ("i20-left" ... "ez-right": build-field-maps.mjs's RZ_SPOTS).
// A throw sits where the ball went (its target spot: the snap's yards to go less its air yards, the end zone
// when it went as far as the goal line); a run where it started, in its lane (none starts in the end zone).

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { SIDES, TURF, pts, r1 } from './field';

export type RedZoneRow = 'i20' | 'i10' | 'i5' | 'ez';
// (near to far, each row's yards from the 20: v 0 the 20, 20 the goal line, 30 the end line)
export const RZ_ROWS: RedZoneRow[] = ['i20', 'i10', 'i5', 'ez'];
export const RZ_ROW_YARDS: Record<RedZoneRow, [number, number]> = { i20: [0, 10], i10: [10, 15], i5: [15, 20], ez: [20, 30] };
export const RZ_ROW_WORDS: Record<RedZoneRow, { name: string; short: string }> = {
  i20: { name: 'The 20 to the 10', short: '20 to 10' },
  i10: { name: 'The 10 to the 5', short: '10 to 5' },
  i5: { name: 'Inside the 5', short: 'Inside 5' },
  ez: { name: 'End zone', short: 'End zone' },
};
export const RZ_SPOT_IDS = RZ_ROWS.flatMap((r) => SIDES.map((s) => `${r}-${s}`));

// (the turf runs a few yards short of the 20, where the offense comes from; the cells start at the 20)
const V_MIN = -3;
const V_GOAL = 20;
const V_MAX = 30;
const Y_BOTTOM = 270;
const Y_YARD = 8.2;
const fy = (v: number) => Y_BOTTOM - (v - V_MIN) * Y_YARD;
const halfWidth = (v: number) => 150 - (v - V_MIN) * 1.05;
// A spot: u across (0 the left sideline, 1 the right), v yards from the 20 toward the goal
const spot = (u: number, v: number): [number, number] => [r1(150 + (u - 0.5) * 2 * halfWidth(v)), r1(fy(v))];

function cellShape(row: RedZoneRow, s: number): { points: string; cx: number; cy: number } {
  const [v0, v1] = RZ_ROW_YARDS[row];
  const [u0, u1] = [s / 3, (s + 1) / 3];
  const [cx, cy] = spot((u0 + u1) / 2, (v0 + v1) / 2);
  return { points: pts([spot(u0, v0), spot(u1, v0), spot(u1, v1), spot(u0, v1)]), cx, cy };
}

const across = (v: number) => {
  const [x1, y] = spot(0, v);
  const [x2] = spot(1, v);
  return `M${x1} ${y}H${x2}`;
};

export function redZoneSurface(): HeatSurface {
  const outline = pts([spot(0, V_MIN), spot(1, V_MIN), spot(1, V_MAX), spot(0, V_MAX)]);
  const endZone = pts([spot(0, V_GOAL), spot(1, V_GOAL), spot(1, V_MAX), spot(0, V_MAX)]);
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: TURF, tile: 160, points: outline },
    { kind: 'polygon', points: outline, cls: 'hm-shade' },
  ];
  // (the mowed stripes every 5 yards up to the goal line; the end zone darker)
  for (let v = 0; v < V_GOAL; v += 10) backdrop.push({ kind: 'polygon', points: pts([spot(0, v), spot(1, v), spot(1, v + 5), spot(0, v + 5)]), cls: 'hm-stripe' });
  backdrop.push({ kind: 'polygon', points: endZone, cls: 'hm-endzone' });
  // (a tick every yard at the hashes and in from each sideline, the field's part)
  let hashes = '';
  for (let v = V_MIN + 1; v < V_GOAL; v++) {
    if (v % 5 === 0) continue;
    for (const u of [0.025, 0.44, 0.56, 0.975]) {
      const [x, y] = spot(u, v);
      hashes += `M${r1(x - 2.2)} ${y}h4.4`;
    }
  }
  backdrop.push({ kind: 'path', d: hashes, cls: 'hm-hash' });
  // (the yard lines: the 15 plain; the 20, the 10 and the 5, where the rows change, brighter)
  backdrop.push({ kind: 'path', d: across(5), cls: 'hm-yard' }, { kind: 'path', d: across(0) + across(10) + across(15), cls: 'hm-yard band' });
  // (the numbers at the 20 and the 10 along both sidelines, as the field's)
  for (const [v, text] of [
    [0, '20'],
    [10, '10'],
  ] as const) {
    for (const [u, rotate] of [
      [0.075, 90],
      [0.925, -90],
    ] as const) {
      const [x, y] = spot(u, v);
      backdrop.push({ kind: 'text', x, y, text, cls: 'hm-num', rotate });
    }
  }
  const cells: HeatCellShape[] = RZ_ROWS.flatMap((row) =>
    SIDES.map((side, s) => ({
      id: `${row}-${side}`,
      ...cellShape(row, s),
      name: `${RZ_ROW_WORDS[row].name}, ${side}`,
      short: `${RZ_ROW_WORDS[row].short} ${side}`,
    })),
  );
  // (the goalposts over the middle of the end line: the stem up from it, the crossbar, the two uprights)
  const [px, py] = spot(0.5, V_MAX);
  const posts = `M${px} ${py}V${r1(py - 10)}M${r1(px - 20)} ${r1(py - 10)}H${r1(px + 20)}M${r1(px - 20)} ${r1(py - 10)}V${r1(py - 34)}M${r1(px + 20)} ${r1(py - 10)}V${r1(py - 34)}`;
  return {
    id: 'red-zone',
    viewBox: { x: -4, y: r1(py - 40), w: 308, h: r1(Y_BOTTOM + 22 - (py - 40)) },
    backdrop,
    overlay: [
      { kind: 'path', d: across(V_GOAL), cls: 'hm-goal' },
      { kind: 'path', d: posts, cls: 'hm-posts' },
      ...SIDES.map((s, i): HeatShape => ({ kind: 'text', x: spot((i + 0.5) / 3, V_MIN)[0], y: r1(Y_BOTTOM + 13), text: s.toUpperCase(), cls: 'hm-side' })),
      { kind: 'polygon', points: outline, cls: 'hm-edge' },
    ],
    cells,
    text: { main: 14, sub: 9.5 },
    aria: 'The red zone, looking at the goal from behind the offense: the 20 to the 10, the 10 to the 5, inside the 5 and the end zone, three across',
  };
}
