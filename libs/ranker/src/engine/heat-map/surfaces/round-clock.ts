// The round-clock surface: when fights end, a grid of the rounds (rows, the first at the top) by the minute of
// the round (columns, 0:00 to 5:00 as the clock runs), on the octagon's canvas darkened under the paint. Five
// rounds ('round-clock': a title fight's or a main event's, its championship rounds set apart under a quiet
// label) or three ('round-clock-3': every other fight). Each cell "r<round>-m<minute>" ("r2-m4": the second
// round's fourth minute, 3:00 to 4:00), MMA's heat maps' (apps/mma/src/sport/heat-maps.ts).

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { pts, r1 } from './field';

export const MINUTES = [1, 2, 3, 4, 5];
const CANVAS = 'assets/textures/canvas.svg';

// The cells' ids, rounds by minutes, in order (the first round's first minute first)
export const roundClockIds = (rounds: number): string[] => Array.from({ length: rounds }, (_, r) => MINUTES.map((m) => `r${r + 1}-m${m}`)).flat();

const LEFT = 36;
const RIGHT = 14;
const HEAD = 30;
const W = 340;
const ROW = 44;
const GAP = 3;
const RADIUS = 5;
// (the room between the third round and the championship rounds, its label in it)
const BREAK = 16;
const clock = (m: number) => `${m}:00`;

// (a rounded box as a path)
function box(x0: number, y0: number, w: number, h: number, r = RADIUS): string {
  return `M${r1(x0 + r)} ${r1(y0)}H${r1(x0 + w - r)}Q${r1(x0 + w)} ${r1(y0)} ${r1(x0 + w)} ${r1(y0 + r)}V${r1(y0 + h - r)}Q${r1(x0 + w)} ${r1(y0 + h)} ${r1(x0 + w - r)} ${r1(y0 + h)}H${r1(x0 + r)}Q${r1(x0)} ${r1(y0 + h)} ${r1(x0)} ${r1(y0 + h - r)}V${r1(y0 + r)}Q${r1(x0)} ${r1(y0)} ${r1(x0 + r)} ${r1(y0)}Z`;
}

function surface(rounds: 3 | 5): HeatSurface {
  const colW = (W - LEFT - RIGHT) / MINUTES.length;
  const rowY = (r: number) => HEAD + ROW * r + (r >= 3 ? BREAK : 0);
  const H = rowY(rounds - 1) + ROW;
  // (an octagon-cut board of the canvas, the cage's red rail around it)
  const [x0, y0, x1, y1, c] = [LEFT - 6, HEAD - 6, W - RIGHT + 6, H + 6, 10];
  const board = pts([
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ]);
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: CANVAS, tile: 220, points: board },
    { kind: 'polygon', points: board, cls: 'hm-mat' },
    { kind: 'polygon', points: board, cls: 'hm-cage' },
    // (the clock's minutes over it: a tick at each, 0:00 to 5:00)
    ...MINUTES.concat(0).map((m): HeatShape => ({ kind: 'path', d: `M${r1(LEFT + colW * m)} ${HEAD - 12}V${HEAD - 8}`, cls: 'hm-tick' })),
    ...[0, ...MINUTES].map((m): HeatShape => ({ kind: 'text', x: r1(LEFT + colW * m), y: HEAD - 16, text: clock(m), cls: 'hm-axis sub clock' })),
    ...Array.from({ length: rounds }, (_, r): HeatShape => ({ kind: 'text', x: LEFT - 17, y: r1(rowY(r) + ROW / 2 + 4.5), text: `R${r + 1}`, cls: 'hm-axis down' })),
  ];
  if (rounds === 5) {
    // (the championship rounds: set apart, named in the break, a hairline in the cage's red either side)
    const y = rowY(3) - BREAK / 2 - GAP / 2;
    const mid = (LEFT + W - RIGHT) / 2;
    backdrop.push(
      { kind: 'path', d: `M${LEFT} ${r1(y)}H${r1(mid - 68)}M${r1(mid + 68)} ${r1(y)}H${W - RIGHT}`, cls: 'hm-title-rule' },
      { kind: 'text', x: r1(mid), y: r1(y + 3), text: 'CHAMPIONSHIP ROUNDS', cls: 'hm-axis sub title-rounds' },
    );
  }
  const cells: HeatCellShape[] = Array.from({ length: rounds }, (_, r) =>
    MINUTES.map((m, j) => {
      const x0 = LEFT + colW * j + GAP / 2;
      const y0 = rowY(r) + GAP / 2;
      return {
        id: `r${r + 1}-m${m}`,
        d: box(x0, y0, colW - GAP, ROW - GAP),
        cx: r1(x0 + (colW - GAP) / 2),
        cy: r1(y0 + (ROW - GAP) / 2 - 3),
        name: `Round ${r + 1}, ${clock(m - 1)} to ${clock(m)}`,
        short: `R${r + 1} ${clock(m - 1)}-${clock(m)}`,
      };
    }),
  ).flat();
  return {
    id: rounds === 5 ? 'round-clock' : 'round-clock-3',
    viewBox: { x: 0, y: 0, w: W, h: r1(H + 8) },
    backdrop,
    cells,
    text: { main: 13, sub: 9 },
    aria: `When fights end: ${rounds} rounds by the minute of the round`,
  };
}

export const roundClockSurface = (): HeatSurface => surface(5);
export const roundClock3Surface = (): HeatSurface => surface(3);
