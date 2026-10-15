// The Heat Maps' shapes: what a sport hands the <heat-map> component (a surface, its cells' numbers, the stat
// they're in) and what each surface is (its backdrop and its cells' polygons, from its own geometry file under
// surfaces/). Plain types, no Angular: a sport's loader (apps/<sport>/src/sport/heat-maps.ts) builds these from
// its static files, the tests read them as the card does.
//
// A map is a surface (the NFL's field, its goal-line-to-goal-line strip, the down & distance grid; later a
// rink, a half court, a strike zone, a spray fan, a diamond, a fighter's body), cells on it keyed by the
// surface's cell ids, each with its sample (n), its value and the league's in the same cell. By efficiency a
// cell is tinted against the league's (green the good side, red the bad, as far as 2 spreads out: value-tint);
// by volume by its share of the sample (a single hue, light to strong). A cell short of the stat's sample is
// greyed. With overlay cells (an opponent's: what its defense allowed in the same cells) a cell is the two
// together: green where both lean to the offense, red where both lean away.

import type { SkillPlayer } from '@sport/positions';

// ---- the surfaces

// (built: field, field-strip, down-distance; the rest are named for the sports that will draw them)
export type HeatSurfaceId =
  | 'field'
  | 'field-strip'
  | 'down-distance'
  // TODO(NHL): the offensive zone, shot locations by area
  | 'rink'
  // TODO(NBA): shot zones on a half court
  | 'half-court'
  // TODO(MLB): the 3 x 3 zone and its four outside corners (the Zones tab's, folded in)
  | 'strike-zone'
  // TODO(MLB): batted balls by direction and depth
  | 'spray-fan'
  // TODO(MLB): fielding by position on the diamond
  | 'diamond-field'
  // TODO(MMA): strikes landed and absorbed by target (head, body, legs)
  | 'body';

// A backdrop's pieces, drawn in order under the cells (each a class from heat-map.scss: hm-turf, hm-shade,
// hm-chalk, hm-line, hm-num...; a texture is an image tiled inside an outline)
export type HeatShape =
  | { kind: 'polygon'; points: string; cls: string }
  | { kind: 'path'; d: string; cls: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; cls: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; cls: string }
  | { kind: 'text'; x: number; y: number; text: string; cls: string; rotate?: number }
  | { kind: 'texture'; href: string; tile: number; points: string };

// A cell's place on its surface: its outline (an SVG polygon's points, or a path), where its numbers sit, its
// name in the hover ("Deep left", "3rd & long") and the short one a compact map can fit
export interface HeatCellShape {
  id: string;
  points?: string;
  d?: string;
  cx: number;
  cy: number;
  name: string;
  short?: string;
}

export interface HeatSurface {
  id: HeatSurfaceId;
  viewBox: { x: number; y: number; w: number; h: number };
  backdrop: HeatShape[];
  // (drawn over the cells: the line of scrimmage, the goal lines, labels that sit on top)
  overlay?: HeatShape[];
  cells: HeatCellShape[];
  // (how big a cell's numbers are drawn: a roomy field's 14, a grid's 13; and whether a sub line fits)
  text?: { main: number; sub: number };
  // what the surface is, for a screen reader ("Pass zones, looking downfield")
  aria: string;
}

// ---- the numbers

export type HeatMode = 'volume' | 'efficiency';

// A cell's numbers: its id on the surface, the sample (plays, shots, pitches), the made ones when the value is
// a rate of them (catches, makes: "8/12" in the hover), its value in the stat and the league's in the same
// cell, the spread of everyone's there (the diverging scale's: none, the stat's), and more lines for the hover
export interface HeatCell {
  id: string;
  n: number;
  made?: number;
  value: number | null;
  league: number | null;
  sd?: number | null;
  // (the number drawn in the cell when it isn't the value formatted: "7/9")
  label?: string;
  detail?: string[];
}

// The stat the cells are in: its name, how a value reads ("+.21", "64%"), which way is good, the spread the
// diverging scale reaches across (2 of them out is full strength), the sample a cell needs before it's tinted
// (under it: greyed), and its scale: diverging (green the good side, red the bad, against the league's), lean
// (against the league's too, but neither side good: a pass rate, in two neutral hues, its ends named) or
// sequential (a share: one hue, its strength the share against the biggest cell's)
export interface HeatStat {
  key: string;
  label: string;
  format: (value: number) => string;
  lowerIsBetter?: boolean;
  sd?: number | null;
  minN: number;
  scale?: 'diverging' | 'sequential' | 'lean';
  // (a lean's ends, low then high: "Runs more", "Passes more")
  ends?: [string, string];
  // (what the sample is: "throws", "targets", "plays"; and a made-over-tried cell's small number, "catches /
  // targets": drawn "8/12" under its value)
  noun: string;
  sample?: string;
  // (the hover's line about it: "EPA a target")
  per?: string;
}

// ---- what a sport declares (SPORT.heatMaps): the maps each card type shows

// A split the data has ("Season", "REG", "POST", "Red zone"...): its id and its label on the picker
export interface HeatSplit {
  id: string;
  label: string;
  title?: string;
}

// What a map is asked for: the card's row, its tab, the season and split picked, the stat (layer), the
// side (a team's offense or defense), and the opponent whose cells overlay it (none: no overlay)
export interface HeatQuery {
  player: SkillPlayer;
  position: string;
  season: number;
  split: string;
  stat: string | null;
  side: string | null;
  opponent: string | null;
}

// A map ready to draw: its surface, title and count, the stats it can show (the one showing), its cells and
// the overlay's (an opponent's, the same ids), what the overlay is ("vs CLE's pass D"), whether the cells are
// a defense's (what it allowed: less is better), and lines under it (a red zone's shares)
export interface HeatMapData {
  surface: HeatSurfaceId;
  title: string;
  count: string;
  help: string;
  stats: { key: string; label: string; title?: string }[];
  stat: HeatStat;
  cells: HeatCell[];
  overlay: HeatCell[] | null;
  overlayLabel: string | null;
  defense: boolean;
  chips?: HeatChip[];
}

// A number under a map ("31% of the team's red-zone targets"), its tone -1 to 1 against the league's
export interface HeatChip {
  label: string;
  value: string;
  sub?: string;
  tone: number;
  title: string;
}

// A map a sport shows: its id, the card types that show it, the surface, the splits and sides it has, whether
// it can take an opponent's overlay, the first season with data, and its load (null: nothing for this row)
export interface HeatMapDef {
  id: string;
  positions: string[];
  surface: HeatSurfaceId;
  splits: (season: number) => HeatSplit[];
  sides?: (position: string) => HeatSplit[];
  overlay?: boolean;
  firstSeason?: number;
  load: (query: HeatQuery) => Promise<HeatMapData | null>;
}

// The row's next opponent for the overlay (the current season's): its key in the sport's data (the NFL's
// "DEF-KC"), its name on the toggle ("KC") and when ("Sun 10/19")
export interface HeatOpponent {
  key: string;
  label: string;
  when?: string;
}

// A compact matchup map for a card's AI preview: a title and a line under it, the row's cells and the
// opponent's over them (an offense's under the defense's allowed; a defense's, defense, under the offense's)
export interface HeatMatchup {
  title: string;
  caption: string;
  cells: HeatCell[];
  overlay: HeatCell[];
  overlayLabel: string;
  stat: HeatStat;
  surface: HeatSurfaceId;
  defense: boolean;
}
