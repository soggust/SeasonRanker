// The field-strip surface: the whole field side on, his own goal line on the left to theirs on the right (the
// offense driving left to right), its ten cells the 10-yard bands between them: "b0" his own 1 to 10 ... "b9"
// their 10 to the goal line (the file's band order, from the play's yards to go to score). The end zones, the
// yard lines every 5, the hash ticks along both sidelines and the numbers under it, as on a broadcast's
// overhead shot.

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { TURF, r1 } from './field';

const END = 22;
const YARD = 3.36;
const TOP = 0;
const H = 92;
const W = END * 2 + 100 * YARD;
const x = (yard: number) => r1(END + yard * YARD);

// (a band's name: "Own 1-10", "Midfield to their 41", "Their 10 to the goal line")
export function bandName(k: number): string {
  if (k === 0) return 'Own goal line to the 10';
  if (k < 5) return `Own ${k * 10} to the ${k * 10 + 10}`;
  if (k === 9) return 'Their 10 to the goal line';
  return `Their ${100 - k * 10} to the ${90 - k * 10}`;
}
const bandShort = (k: number) => (k < 5 ? `Own ${k * 10 || 'GL'}-${k * 10 + 10}` : `Opp ${100 - k * 10}-${90 - k * 10 || 'GL'}`);

export function fieldStripSurface(): HeatSurface {
  const outline = `0,${TOP} ${W},${TOP} ${W},${TOP + H} 0,${TOP + H}`;
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: TURF, tile: 160, points: outline },
    { kind: 'polygon', points: outline, cls: 'hm-shade' },
  ];
  // (the mowed stripes, every other 5 yards; the end zones darker)
  for (let yd = 0; yd < 100; yd += 10) backdrop.push({ kind: 'rect', x: x(yd), y: TOP, w: r1(5 * YARD), h: H, cls: 'hm-stripe' });
  backdrop.push({ kind: 'rect', x: 0, y: TOP, w: END, h: H, cls: 'hm-endzone' }, { kind: 'rect', x: W - END, y: TOP, w: END, h: H, cls: 'hm-endzone' });
  let lines = '';
  let majors = '';
  for (let yd = 5; yd < 100; yd += 5) {
    const d = `M${x(yd)} ${TOP}V${TOP + H}`;
    if (yd % 10) lines += d;
    else majors += d;
  }
  // (a tick every yard just in from each sideline)
  let hashes = '';
  for (let yd = 1; yd < 100; yd++) if (yd % 5) hashes += `M${x(yd)} ${TOP + 3}v4M${x(yd)} ${TOP + H - 7}v4`;
  backdrop.push({ kind: 'path', d: hashes, cls: 'hm-hash' }, { kind: 'path', d: lines, cls: 'hm-yard' }, { kind: 'path', d: majors, cls: 'hm-yard band' });
  const cells: HeatCellShape[] = Array.from({ length: 10 }, (_, k) => {
    const x0 = x(k * 10) + 1;
    const x1 = x(k * 10 + 10) - 1;
    return {
      id: `b${k}`,
      points: `${x0},${TOP + 1} ${x1},${TOP + 1} ${x1},${TOP + H - 1} ${x0},${TOP + H - 1}`,
      cx: r1((x0 + x1) / 2),
      cy: TOP + H / 2,
      name: bandName(k),
      short: bandShort(k),
    };
  });
  const numbers: HeatShape[] = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => ({ kind: 'text', x: x(yd), y: TOP + H + 12, text: String(yd <= 50 ? yd : 100 - yd), cls: 'hm-num flat' }));
  return {
    id: 'field-strip',
    viewBox: { x: 0, y: TOP - 2, w: W, h: H + 18 },
    backdrop: [...backdrop, ...numbers],
    overlay: [
      { kind: 'path', d: `M${END} ${TOP}V${TOP + H}M${W - END} ${TOP}V${TOP + H}`, cls: 'hm-goal' },
      { kind: 'text', x: END / 2, y: TOP + H / 2, text: 'OWN', cls: 'hm-ez-text', rotate: -90 },
      { kind: 'text', x: W - END / 2, y: TOP + H / 2, text: 'OPP', cls: 'hm-ez-text', rotate: 90 },
      { kind: 'polygon', points: outline, cls: 'hm-edge' },
    ],
    cells,
    text: { main: 12.5, sub: 8.5 },
    aria: 'Field position: ten 10-yard bands from his own goal line, on the left, to theirs',
  };
}
