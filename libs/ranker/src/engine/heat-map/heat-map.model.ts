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

// (built: field, red-zone, field-strip, down-distance, rink, round-clock, body, half-court, strike-zone, spray-fan,
// diamond-field)
export type HeatSurfaceId =
  | 'field'
  | 'red-zone'
  | 'field-strip'
  | 'down-distance'
  // (the NHL's offensive zone: shot locations by area)
  | 'rink'
  // (the NBA's shot zones: surfaces/half-court.ts)
  | 'half-court'
  // (MLB's: pitch location, the zone's 3 x 3 and the ring around it, from the catcher's view; batted balls by
  // direction and type from home plate, a right-handed hitter's pull side on the left ('spray-fan') or a
  // left-handed one's on the right ('spray-fan-l'); fielding by position on the diamond)
  | 'strike-zone'
  | 'spray-fan'
  | 'spray-fan-l'
  | 'diamond-field'
  // (MMA's: when fights end, round by minute, five rounds or three; strikes by target on a fighter's figure, and
  // by position on three of them: at distance, in the clinch, on the ground)
  | 'round-clock'
  | 'round-clock-3'
  | 'body'
  | 'body-3';

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
  // (a narrow cell, a corner three: its numbers drawn smaller, by this much, and set from cx toward the
  // inside, 'end' their right edge at cx, so they stay on the surface)
  fit?: number;
  anchor?: 'start' | 'end';
}

export interface HeatSurface {
  id: HeatSurfaceId;
  viewBox: { x: number; y: number; w: number; h: number };
  backdrop: HeatShape[];
  // (drawn over the cells: the line of scrimmage, the goal lines, labels that sit on top)
  overlay?: HeatShape[];
  cells: HeatCellShape[];
  // (how big a cell's numbers are drawn: a roomy field's 14, a grid's 13; and whether a cell's count says
  // what it counts, "128 plays": room for it, and no picture of the field to say it)
  text?: { main: number; sub: number; noun?: boolean };
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
  // (what Volume counts when it isn't the sample: the strikes landed where the sample is the ones thrown, the
  // finishes where it's the fights still going; none: n)
  count?: number;
  // (the small line under the value when it isn't the sample: a team's fielder there, "Witt Jr."; none: the
  // sample, or made/n)
  sub?: string;
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
  // (a lean's ends, low then high: "Runs more", "Passes more"; a diverging stat's own, bad then good: "Into
  // damage", "Away from damage")
  ends?: [string, string];
  // (what the sample is: "throws", "targets", "plays"; and a made-over-tried cell's small number, "catches /
  // targets": drawn "8/12" under its value)
  noun: string;
  sample?: string;
  // (the hover's line about it: "EPA a target")
  per?: string;
  // (what Volume counts when a cell's count isn't its sample (HeatCell.count): "strikes landed"; none: noun)
  countNoun?: string;
  // (what a cell's value reads against, in the hover and the key: the league's in the cell ("league", the
  // default), what the row's own shots were expected to do ("expected"), an average player's on the same
  // shots ("average"); null: nothing named, the value alone, its comparison in the cell's detail)
  vs?: string | null;
}

// ---- what a sport declares (SPORT.heatMaps): the maps each card type shows

// A split the data has ("Season", "REG", "POST", "Red zone"...): its id and its label on the picker
export interface HeatSplit {
  id: string;
  label: string;
  title?: string;
}

// What a map is asked for: the card's row, its tab, the season and split picked, the stat (layer), the
// side (a team's offense or defense)
export interface HeatQuery {
  player: SkillPlayer;
  position: string;
  season: number;
  split: string;
  stat: string | null;
  side: string | null;
  // (the map's own second pick when it has one, HeatMapData.options: a pitcher's pitch type)
  option?: string | null;
}

// A map's second picker beside its stat's (a pitcher's pitch types): its name, its items (each with a swatch's
// color when it has one) and the one showing
export interface HeatOptions {
  label: string;
  items: { key: string; label: string; title?: string; color?: string }[];
  value: string;
}

// A mark over a map's cells, the row's own (a hitter's home runs where they landed): its spot in the surface's
// units, its radius, its class (heat-map.scss) and its hover
export interface HeatMark {
  x: number;
  y: number;
  r?: number;
  cls?: string;
  title: string;
}

// The same row's last season behind a map's thin cells (HeatFallback below): early in a season most cells are
// under the stat's sample, so where this season's is, last season's is drawn instead, faded, hatched over and
// named in the hover; once this season's sample is enough, this season's as usual. Only the row's own: no
// league average stands in for it. Its cells the map's ids, its overlay's the opponent's own last season
export interface HeatFallback {
  // (the same row's cells last season, the map's ids; and the opponent's, under an overlay)
  fallback?: HeatCell[] | null;
  overlayFallback?: HeatCell[] | null;
  // (which season it is, "2025", in the key and the hover; and this one's, "2026", in the hover)
  fallbackLabel?: string | null;
  seasonLabel?: string | null;
  // (the key's note when what's behind isn't a last season: "Faded: his career", MMA's last five fights on his
  // whole career; none: "Faded: last season (2025)")
  fallbackNote?: string | null;
}

// A map ready to draw: its surface, title and count, the stats it can show (the one showing), its cells,
// whether they're a defense's (what it allowed: less is better), the numbers beside it (a red zone's shares), last season's
// behind its thin cells, and whether it leads its tab (drawn first: a back's red-zone carries)
export interface HeatMapData extends HeatFallback {
  surface: HeatSurfaceId;
  title: string;
  count: string;
  help: string;
  stats: { key: string; label: string; title?: string }[];
  stat: HeatStat;
  cells: HeatCell[];
  defense: boolean;
  chips?: HeatChip[];
  // (the numbers' heading: "Inside the 20" when there's none, the red zone's)
  chipsTitle?: string;
  lead?: boolean;
  // (its second picker: a pitcher's pitch types)
  options?: HeatOptions;
  // (the row's own pieces drawn over the cells, under the marks: his home park's wall; the marks, his home runs;
  // and the key's word for them, "Home run")
  layers?: HeatShape[];
  marks?: HeatMark[];
  markKey?: string;
}

// A number under a map ("31% of the team's red-zone targets"), its tone -1 to 1 against the league's
export interface HeatChip {
  label: string;
  value: string;
  sub?: string;
  tone: number;
  title: string;
}

// A map a sport shows: its id, the card types that show it, the surface, the splits and sides it has, the first
// season with data, and its load (null: nothing for this row)
export interface HeatMapDef {
  id: string;
  positions: string[];
  surface: HeatSurfaceId;
  // (the side showing, a team's offense or defense, where a split's name depends on it: a power play's a
  // penalty kill on defense)
  splits: (season: number, side?: string | null) => HeatSplit[];
  sides?: (position: string) => HeatSplit[];
  firstSeason?: number;
  // (its maps carry their numbers (HeatMapData.chips) in every split: laid out with them in a column beside,
  // as the red zone's are)
  numbers?: boolean;
  // (numbered maps laid out in a row of their own, their own numbers beside them: MMA's striking, then its
  // finishes. None: every numbered map in the one row, as the NHL's are)
  group?: string;
  // (false: nothing a Volume switch would change, a team's Outs Above Average; a tab with only such maps has no
  // Efficiency / Volume switch)
  volume?: boolean;
  load:(query: HeatQuery) => Promise<HeatMapData | null>;
}

// A compact matchup map for a card's AI preview: a title and a line under it, the row's cells and the
// opponent's over them (an offense's under the defense's allowed; a defense's, defense, under the offense's),
// and both sides' last seasons behind their thin cells (early in a season, so the maps show at all)
export interface HeatMatchup extends HeatFallback {
  title: string;
  caption: string;
  cells: HeatCell[];
  overlay: HeatCell[];
  overlayLabel: string;
  stat: HeatStat;
  surface: HeatSurfaceId;
  defense: boolean;
}
