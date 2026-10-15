// The spray fan: the field from home plate, where a hitter's balls in play went, by direction from his view
// (pull, center, opposite: center field 15 degrees either side) and by type, near to far as they land (ground
// balls through the infield, popups just past it, line drives, fly balls to the wall). A right-handed hitter
// pulls to left field ('spray-fan', his pull side on the left), a left-handed one to right ('spray-fan-l').
// Its twelve cells "<pull|center|oppo>-<gb|pu|ld|fb>" (apps/mlb/scripts/build-heat-maps.mjs's SPRAY_IDS), each a
// sector of the field out to a standard park's warning track (its wall 330 down the lines, 400 to center); the row's own park's
// wall and his home runs are his map's layers and marks (HeatMapData.layers, .marks), drawn over it. In the
// spray chart's units (ballpark.ts: Gameday's, home plate at 125.2, 204.5).

import type { HeatCellShape, HeatShape, HeatSurface } from '../heat-map.model';
import { LINE, arcPath, at, fairTerritory, foulLines, sector, standardWall } from './ballpark';
import { pts, r1 } from './field';

export type SprayDir = 'pull' | 'center' | 'oppo';
export type SprayType = 'gb' | 'pu' | 'ld' | 'fb';
export const SPRAY_DIRS: SprayDir[] = ['pull', 'center', 'oppo'];
export const SPRAY_TYPES: SprayType[] = ['gb', 'pu', 'ld', 'fb'];
// (the build script's order: each type, its three directions)
export const SPRAY_CELL_IDS: string[] = ['gb', 'ld', 'fb', 'pu'].flatMap((t) => SPRAY_DIRS.map((d) => `${d}-${t}`));

export const SPRAY_TYPE_WORDS: Record<SprayType, { name: string; plural: string; short: string }> = {
  gb: { name: 'Ground ball', plural: 'Ground balls', short: 'GB' },
  pu: { name: 'Popup', plural: 'Popups', short: 'PU' },
  ld: { name: 'Line drive', plural: 'Line drives', short: 'LD' },
  fb: { name: 'Fly ball', plural: 'Fly balls', short: 'FB' },
};
export const SPRAY_DIR_WORDS: Record<SprayDir, string> = { pull: 'Pull side', center: 'Up the middle', oppo: 'Opposite field' };

// (each type's band, feet from home plate; the fly balls' out to the wall)
const BANDS: Record<SprayType, [number, number | ((deg: number) => number)]> = {
  gb: [34, 150],
  pu: [150, 208],
  ld: [208, 272],
  fb: [272, (d) => standardWall(d) - 12],
};
// (each direction's angles off center, a right-handed hitter's: his pull side to left field)
const CENTER = 15;
const ANGLES: Record<SprayDir, [number, number]> = { pull: [-LINE, -CENTER], center: [-CENTER, CENTER], oppo: [CENTER, LINE] };
// (where a band's numbers sit: its middle; the fly balls' a little in from the wall, where they're widest)
const TEXT_FEET: Record<SprayType, number | ((deg: number) => number)> = { gb: 112, pu: 181, ld: 242, fb: (d) => (272 + standardWall(d) - 12) / 2 + 2 };

function fan(lefty: boolean): HeatSurface {
  const flip = lefty ? -1 : 1;
  const angles = (dir: SprayDir): [number, number] => {
    const [a, b] = ANGLES[dir];
    return lefty ? [-b, -a] : [a, b];
  };
  const fair = fairTerritory();
  const backdrop: HeatShape[] = [
    { kind: 'texture', href: 'assets/textures/grass.svg', tile: 48, points: fair },
    { kind: 'polygon', points: fair, cls: 'hm-park' },
    // (the warning track, just inside the wall)
    { kind: 'polygon', points: sector((d) => standardWall(d) - 12, standardWall, -LINE, LINE), cls: 'hm-track' },
  ];
  const cells: HeatCellShape[] = [];
  for (const type of SPRAY_TYPES) {
    const [r0, r1d] = BANDS[type];
    for (const dir of SPRAY_DIRS) {
      const [a0, a1] = angles(dir);
      const mid = (a0 + a1) / 2;
      const tf = TEXT_FEET[type];
      const [cx, cy] = at(typeof tf === 'number' ? tf : tf(mid), mid);
      cells.push({
        id: `${dir}-${type}`,
        points: sector(r0, r1d, a0, a1),
        cx,
        cy,
        name: `${SPRAY_TYPE_WORDS[type].plural}, ${SPRAY_DIR_WORDS[dir].toLowerCase()}`,
        short: `${SPRAY_TYPE_WORDS[type].short} ${dir}`,
      });
    }
  }
  // ---- over the cells: the chalk (the foul lines, the base paths, home plate), the standard wall faintly, each
  // band named along the pull side's line in foul ground, each direction over the wall
  const bases = pts([at(0, 0), at(90, LINE), at(127.3, 0), at(90, -LINE)]);
  const [hx, hy] = at(0, 0);
  const plate = pts([
    [r1(hx - 2.4), r1(hy - 1.6)],
    [r1(hx + 2.4), r1(hy - 1.6)],
    [r1(hx + 2.4), r1(hy + 0.4)],
    [hx, r1(hy + 2.2)],
    [r1(hx - 2.4), r1(hy + 0.4)],
  ]);
  const overlay: HeatShape[] = [
    { kind: 'path', d: foulLines(standardWall(LINE) + 6), cls: 'hm-chalk' },
    { kind: 'polygon', points: bases, cls: 'hm-basepath' },
    ...[at(90, LINE), at(127.3, 0), at(90, -LINE)].map(([x, y]): HeatShape => ({ kind: 'rect', x: r1(x - 1.6), y: r1(y - 1.6), w: 3.2, h: 3.2, cls: 'hm-base' })),
    { kind: 'polygon', points: plate, cls: 'hm-plate' },
    { kind: 'path', d: arcPath(standardWall, -LINE, LINE), cls: 'hm-wall standard' },
  ];
  // (the bands' names in foul ground beside the pull side's line, reading out from home; each direction's over
  // the wall)
  const side = -flip;
  for (const type of SPRAY_TYPES) {
    const [r0, r1d] = BANDS[type];
    // (the ground balls' name past the bag)
    const feet = type === 'gb' ? 124 : (r0 + (typeof r1d === 'number' ? r1d : 318)) / 2;
    const [x, y] = at(feet, side * (LINE + 6));
    overlay.push({ kind: 'text', x, y, text: SPRAY_TYPE_WORDS[type].short, cls: 'hm-band' });
  }
  // (the two sides named in foul ground off the poles, clear of the home runs)
  for (const [dir, deg] of [['PULL', -flip * 54], ['OPPO', flip * 54]] as const) {
    const [x, y] = at(352, deg);
    overlay.push({ kind: 'text', x, y, text: dir, cls: 'hm-dir' });
  }
  const [lx] = at(430, -LINE);
  const [rx] = at(430, LINE);
  const [, top] = at(478, 0);
  const [, bottom] = at(0, 0);
  return {
    id: lefty ? 'spray-fan-l' : 'spray-fan',
    viewBox: { x: r1(lx - 8), y: r1(top), w: r1(rx - lx + 16), h: r1(bottom + 12 - top) },
    backdrop,
    overlay,
    cells,
    text: { main: 11, sub: 7.5 },
    aria: `The field from home plate, ${lefty ? 'a left-handed hitter’s pull side to right field' : 'a right-handed hitter’s pull side to left field'}: ground balls, popups, line drives and fly balls, each to the pull side, up the middle and to the opposite field`,
  };
}

export const sprayFanSurface = (): HeatSurface => fan(false);
export const sprayFanLeftySurface = (): HeatSurface => fan(true);
