// A ballpark's pieces in the spray chart's units (the game view's: MLB's Gameday coordinates, home plate at
// 125.2, 204.5, up the field; game-view/parks.ts), shared by the spray fan and the diamond: a spot by its
// distance in feet and its angle off center field (negative to left field), a standard park's wall (330 feet
// down the lines, 400 to center), and sectors of the field between two distances and two angles.

import { HOME, fieldSpot } from '../../game-view/parks';
import { pts, r1 } from './field';

export { HOME };
// (the foul lines' angle off center)
export const LINE = 45;

// (a surface's own scale of distance: the spray fan's true to the feet, the diamond's drawing the infield
// larger, its fielders' ground roomier)
export type Scale = (feet: number) => number;
const TRUE: Scale = (feet) => feet;

// A spot by its distance (feet) and angle off center (degrees, negative to left field)
export const at = (feet: number, deg: number, scale: Scale = TRUE): [number, number] => {
  const [x, y] = fieldSpot(scale(feet), deg + LINE);
  return [r1(x), r1(y)];
};

// A standard park's wall: 330 down each line, 400 to center, a smooth curve between
export const standardWall = (deg: number): number => 330 + 70 * Math.cos((2 * deg * Math.PI) / 180);

// (an arc's angles from a0 to a1, a step about every 3 degrees)
function steps(a0: number, a1: number): number[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3));
  return Array.from({ length: n + 1 }, (_, k) => a0 + ((a1 - a0) * k) / n);
}

// A sector of the field: between two distances (a number, or a distance by angle: the wall) and two angles
export function sector(r0: number | ((deg: number) => number), r1d: number | ((deg: number) => number), a0: number, a1: number, scale: Scale = TRUE): string {
  const r = (v: number | ((deg: number) => number), deg: number) => (typeof v === 'number' ? v : v(deg));
  const outer = steps(a0, a1).map((d) => at(r(r1d, d), d, scale));
  const inner = steps(a1, a0).map((d) => at(r(r0, d), d, scale));
  return pts([...outer, ...inner]);
}

// The fair territory out to a wall, as a polygon (home plate, up the left-field line, along the wall, down the
// right-field line)
export function fairTerritory(wall: (deg: number) => number = standardWall, scale: Scale = TRUE): string {
  return pts([at(0, 0, scale), ...steps(-LINE, LINE).map((d) => at(wall(d), d, scale))]);
}

// An arc as a path, at a distance (or the wall's) from a0 to a1
export function arcPath(r: number | ((deg: number) => number), a0: number, a1: number, scale: Scale = TRUE): string {
  return steps(a0, a1)
    .map((d, k) => {
      const [x, y] = at(typeof r === 'number' ? r : r(d), d, scale);
      return `${k ? 'L' : 'M'}${x} ${y}`;
    })
    .join('');
}

// The foul lines, home plate out to a distance
export const foulLines = (feet: number, scale: Scale = TRUE): string => {
  const [hx, hy] = at(0, 0, scale);
  const [lx, ly] = at(feet, -LINE, scale);
  const [rx, ry] = at(feet, LINE, scale);
  return `M${lx} ${ly}L${hx} ${hy}L${rx} ${ry}`;
};
