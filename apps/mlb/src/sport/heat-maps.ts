import type { SkillPlayer } from '@sport/positions';
import type { HeatCell, HeatChip, HeatMapData, HeatMapDef, HeatMark, HeatQuery, HeatShape, HeatSplit, HeatStat, HeatSurfaceId } from '@ranker/engine/heat-map/heat-map.model';
import { IN_ZONE, ZONE_CELL_IDS } from '@ranker/engine/heat-map/surfaces/strike-zone';
import { SPRAY_CELL_IDS } from '@ranker/engine/heat-map/surfaces/spray-fan';
import { DIAMOND_POSITIONS } from '@ranker/engine/heat-map/surfaces/diamond-field';
import { at } from '@ranker/engine/heat-map/surfaces/ballpark';
import { wallPath } from '@ranker/engine/game-view/parks';
import { pitchColor } from '@ranker/engine/game-view/pitch-colors';

// MLB's Heat Maps (SPORT.heatMaps, the card's Heat Maps tab; the Zones tab's hot zones and arsenal folded in),
// from Baseball Savant's pitch-by-pitch Statcast data binned by apps/mlb/scripts/build-heat-maps.mjs:
//   a pitcher's   Pitch Location: every pitch's spot in the zone and the chase area around it (5 x 5, the
//                 catcher's view), by pitch type (the picker) and the batter's side (the splits): the expected
//                 wOBA of the plate appearances he ended there, the whiff rate, how often he goes there, each
//                 against the league's pitchers of his hand with the same pitch; beside it his arsenal. And
//                 Damage Zones: where he puts the ball against where that side's hitters do their damage (the
//                 league's expected wOBA there), and how often he lives there
//   a hitter's    Spray Chart: his balls in play by direction (pull, center, opposite) and type (ground ball,
//                 popup, line drive, fly ball), each against the league's, his home runs where they landed over
//                 his home park's wall; Hot Zones: what he does with the pitches in each part of the zone and
//                 the chase area (expected wOBA, whiffs, swings, exit velocity); In the Field: his Outs Above
//                 Average at each position he played (the splits: all pitchers, left-handers, right-handers)
//   a team's      Defense: Outs Above Average at each position on the diamond, its fielders there named
// Files: data/heat-maps.json (the league's cells, the teams' defense, the parks, how the players are spread)
// and data/heat-maps.p<k>.json, .h<k>.json (pitchers, hitters: an MLBAM id's file its remainder over the
// season's count), the season being played's at the top of data/, each earlier one's in data/seasons/<year>/.
// They keep sums, so a split is its parts added up. Early in the season being played a cell under its sample
// shows the same row's own last season behind it, faded (the component's fallback).

// ---- the files

type Packed = number[] | 0;
type Rows = Packed[] | 0;
type Hands = { L: Rows; R: Rows };
export interface MainFile {
  season: number;
  fields: { zone: string[]; spray: string[]; def: string[]; zones: string[]; sprays: string[]; types: string[]; positions: string[] };
  buckets: { p: number; h: number };
  league: { zone: Record<string, Record<string, Rows>>; spray: Hands };
  parks: Record<string, string>;
  defense: {
    teams: Record<string, { rows: Record<string, Packed>; who: Record<string, [string, number][]> }>;
    sd: { team: Record<string, number | null>; fielder: Record<string, number | null> };
  } | null;
}
export interface PitcherEntry {
  // (his hand, the one most of his pitches came from)
  h?: 'L' | 'R';
  t: Record<string, Hands>;
  v: Record<string, [number, number]>;
}
export interface HitterEntry {
  z?: Hands;
  s?: Hands;
  b?: { L: [number, number]; R: [number, number] };
  hr?: [number, number, number, number][];
  d?: Record<string, Packed> | null;
}
export interface BucketFile<T> {
  season: number;
  kind: 'p' | 'h';
  bucket: number;
  rows: Record<string, T>;
}

const files = new Map<string, Promise<unknown>>();
function fetchFile<T extends { season: number }>(season: number, current: boolean, name: string): Promise<T | null> {
  const path = current ? `data/${name}` : `data/seasons/${season}/${name}`;
  if (!files.has(path)) {
    files.set(
      path,
      fetch(path, { cache: current ? 'no-cache' : 'default' })
        .then(async (res) => (res.ok ? ((await res.json()) as T) : null))
        // (a file for another season, the one at the top of data/ before the new season's first pitches: none)
        .then((f) => (f && f.season === season ? f : null))
        .catch(() => null),
    );
  }
  return files.get(path) as Promise<T | null>;
}
export const mainFile = (season: number, current: boolean): Promise<MainFile | null> => fetchFile<MainFile>(season, current, 'heat-maps.json');

// A row's entry: its file the remainder of its MLBAM id over the season's count of them
export async function entryOf<T>(season: number, current: boolean, kind: 'p' | 'h', id: string | number | null | undefined): Promise<{ main: MainFile; entry: T } | null> {
  const main = await mainFile(season, current);
  const n = Number(id);
  if (!main || !n || n <= 0) return null;
  const file = await fetchFile<BucketFile<T>>(season, current, `heat-maps.${kind}${n % (main.buckets[kind] || 1)}.json`);
  const entry = file?.rows[String(n)];
  return entry ? { main, entry } : null;
}

// ---- the sums: a cell's tuple by its fields (trailing zeros dropped in the file), rows added up

export type Cell = number[];
const ZONE_W = 9;
const SPRAY_W = 6;
export const cellsOf = (rows: Rows | undefined, count: number, width: number): Cell[] =>
  Array.from({ length: count }, (_, i) => {
    const c = rows ? rows[i] : 0;
    return Array.from({ length: width }, (_, k) => (c ? (c[k] ?? 0) : 0));
  });
export const addCells = (a: Cell[], b: Cell[]): Cell[] => a.map((c, i) => c.map((v, k) => v + (b[i]?.[k] ?? 0)));
const total = (cells: Cell[], k = 0) => cells.reduce((a, c) => a + c[k], 0);

// (a zone tuple's fields: pitches, swings, whiffs, plate appearances ended, their xwOBA in thousandths, balls in
// play, exit velocity in tenths over evn of them, the balls in play's xwOBA in thousandths; a spray tuple's:
// balls in play, xwOBA in thousandths, exit velocity in tenths over evn, hits, home runs)
const Z = { n: 0, sw: 1, wh: 2, pa: 3, xw: 4, bip: 5, ev: 6, evn: 7, bxw: 8 };
const S = { n: 0, xw: 1, ev: 2, evn: 3, h: 4, hr: 5 };

// The split's hands: the pitcher's (a hitter's splits: all, vl, vr) or the batter's (a pitcher's)
const handsOf = (split: string): ('L' | 'R')[] => (split === 'vl' ? ['L'] : split === 'vr' ? ['R'] : ['L', 'R']);
export const zoneRows = (h: Hands | undefined, split: string): Cell[] =>
  handsOf(split).reduce((a, k) => addCells(a, cellsOf(h?.[k], 25, ZONE_W)), cellsOf(0, 25, ZONE_W));
export const sprayRows = (h: Hands | undefined, split: string): Cell[] =>
  handsOf(split).reduce((a, k) => addCells(a, cellsOf(h?.[k], 12, SPRAY_W)), cellsOf(0, 12, SPRAY_W));

// The league's zone cells: batters of these sides against pitchers of these hands, a pitch type's or every one's
export function leagueZone(main: MainFile, stands: ('L' | 'R')[], throws: ('L' | 'R')[], type: string | null): Cell[] {
  let out = cellsOf(0, 25, ZONE_W);
  for (const s of stands)
    for (const t of throws) {
      const types = main.league.zone[s + t] ?? {};
      for (const [ty, rows] of Object.entries(types)) if (!type || type === 'all' || ty === type) out = addCells(out, cellsOf(rows, 25, ZONE_W));
    }
  return out;
}

// ---- formats

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${v > 0 && v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`;
export const dec3 = (v: number) => v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.');
const dec1 = (v: number) => v.toFixed(1);
export const signed = (v: number) => (v > 0 ? `+${Math.round(v)}` : v < 0 ? `−${Math.abs(Math.round(v))}` : '0');
const signedPct = (v: number) => (v > 0 ? `+${Math.round(v * 100)}%` : v < 0 ? `−${Math.abs(Math.round(v * 100))}%` : '0%');
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const clamp = (v: number) => Math.max(-1, Math.min(1, v)) || 0;
const ratio = (a: number, b: number): number | null => (b ? a / b : null);

// (a cell's spread: the real differences among players (between) and the chance in its sample (within, per
// trial), so a big sample's lean reads stronger than a small one's, and neither past what players differ by)
export const spread = (between: number, within: number, n: number): number => Math.sqrt(between ** 2 + within ** 2 / Math.max(1, n));

// (a share's spread: a quarter of the league's share (how far players' mixes differ), and the binomial's on it
// over his sample)
export const shareSd = (lg: number, trials: number): number => Math.max(0.006, 0.25 * lg) + Math.sqrt(Math.max(0.0004, lg * (1 - lg)) / Math.max(1, trials));

// (a tone for a number beside the map: how far it is from the league's, by its spread, -1 to 1)
const toneOf = (v: number | null, lg: number | null, sd: number, lowerIsBetter = false): number => (v === null || lg === null || !sd ? 0 : clamp((((lowerIsBetter ? -1 : 1) * (v - lg)) / sd) * 0.5));

// ---- pitch types

// (each type's name, its plural, its pill's label and its color: the game view's)
export const PITCH_TYPES: Record<string, { name: string; plural: string; short: string; color: string }> = {
  FF: { name: 'Four-seam fastball', plural: 'four-seamers', short: '4-Seam', color: pitchColor('Four-Seam Fastball') },
  SI: { name: 'Sinker', plural: 'sinkers', short: 'Sinker', color: pitchColor('Sinker') },
  FC: { name: 'Cutter', plural: 'cutters', short: 'Cutter', color: pitchColor('Cutter') },
  SL: { name: 'Slider', plural: 'sliders', short: 'Slider', color: pitchColor('Slider') },
  ST: { name: 'Sweeper', plural: 'sweepers', short: 'Sweeper', color: pitchColor('Sweeper') },
  CU: { name: 'Curveball', plural: 'curveballs', short: 'Curve', color: pitchColor('Curveball') },
  CH: { name: 'Changeup', plural: 'changeups', short: 'Change', color: pitchColor('Changeup') },
  FS: { name: 'Splitter', plural: 'splitters', short: 'Splitter', color: pitchColor('Splitter') },
  KN: { name: 'Knuckleball', plural: 'knuckleballs', short: 'Knuckler', color: pitchColor('Knuckleball') },
  OT: { name: 'Other pitches', plural: 'other pitches', short: 'Other', color: pitchColor('') },
};

// ---- the splits

const SEASON: HeatSplit = { id: 'all', label: 'Season', title: 'Every pitch of the regular season' };
export const PITCHER_SPLITS: HeatSplit[] = [
  { id: 'all', label: 'All', title: 'Every batter he faced' },
  { id: 'vl', label: 'vs LHH', title: 'Left-handed hitters' },
  { id: 'vr', label: 'vs RHH', title: 'Right-handed hitters' },
];
export const HITTER_SPLITS: HeatSplit[] = [
  { id: 'all', label: 'All', title: 'Every pitcher he faced' },
  { id: 'vl', label: 'vs LHP', title: 'Left-handed pitchers' },
  { id: 'vr', label: 'vs RHP', title: 'Right-handed pitchers' },
];
const splitWords = (split: string, pitcher: boolean) => (split === 'all' ? '' : ` ${(pitcher ? PITCHER_SPLITS : HITTER_SPLITS).find((s) => s.id === split)?.label ?? ''}`);

// ---- the rows

export const PITCHERS = ['SP', 'RP'];
export const HITTERS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'TOP'];
// (a team's id from its row, "TM-109"; a player's team from his logo, "assets/MLB_Icons/147.svg")
export const teamIdOf = (player: SkillPlayer): string | null => /^TM-(\d+)$/.exec(String(player.gsisId))?.[1] ?? /(\d+)\.svg$/.exec(player.teamLogo ?? '')?.[1] ?? null;
// (a hitter's side in a split: the one most of his balls in play came from, a switch-hitter's against the
// split's pitchers)
export function majoritySide(b: HitterEntry['b'] | undefined, split: string): 'L' | 'R' {
  const [l, r] = handsOf(split).reduce(([a, c], h) => [a + (b?.[h]?.[0] ?? 0), c + (b?.[h]?.[1] ?? 0)], [0, 0]);
  return l > r ? 'L' : 'R';
}

// ---- the stats

// A pitcher's or hitter's zone stat: the cells' numbers in it, against the league's in the same cells
type ZoneKey = 'xwoba' | 'whiff' | 'freq' | 'swing' | 'ev';
interface ZoneSpec {
  label: string;
  title: string;
  per: string;
  // (each cell's sample and its value; the league's the same way)
  n: (c: Cell) => number;
  value: (c: Cell, all: Cell[]) => number | null;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  scale?: 'lean';
  // (a share of all his pitches: its spread the share's, over all of them)
  share?: boolean;
  ends?: [string, string];
  between: number;
  within: (lg: number) => number;
  minN: number;
  noun: string;
}

const ZONE_SPECS = (pitcher: boolean): Record<ZoneKey, ZoneSpec> => ({
  // (a pitcher's: every plate appearance he ended there, its walks and strikeouts too; a hitter's: his contact
  // there, so a chase pitch's walks don't read as damage)
  xwoba: pitcher
    ? {
        label: 'xwOBA',
        title: 'Expected wOBA against: the plate appearances he ended in each spot, by their strikeouts, walks and the quality of contact',
        per: 'xwOBA against',
        n: (c) => c[Z.pa],
        value: (c) => ratio(c[Z.xw] / 1000, c[Z.pa]),
        format: dec3,
        lowerIsBetter: true,
        between: 0.035,
        within: () => 0.45,
        minN: 8,
        noun: 'plate appearances',
      }
    : {
        label: 'xwOBA',
        title: 'Expected wOBA on contact: the quality of his balls in play on the pitches in each spot, by their exit velocity and launch angle',
        per: 'xwOBA on contact',
        n: (c) => c[Z.bip],
        value: (c) => ratio(c[Z.bxw] / 1000, c[Z.bip]),
        format: dec3,
        between: 0.04,
        within: () => 0.42,
        minN: 5,
        noun: 'balls in play',
      },
  whiff: {
    label: 'Whiff %',
    title: pitcher ? 'Swings and misses of the swings at his pitches in each spot' : 'His swings and misses of his swings in each spot',
    per: 'whiff rate',
    n: (c) => c[Z.sw],
    value: (c) => ratio(c[Z.wh], c[Z.sw]),
    format: pct,
    lowerIsBetter: !pitcher,
    between: 0.06,
    within: (p) => Math.sqrt(Math.max(0.01, p * (1 - p))),
    minN: 8,
    noun: 'swings',
  },
  freq: {
    label: 'Frequency',
    title: "How often he throws there: the spot's share of his pitches, against the league's pitchers' with the same pitch",
    per: 'of his pitches',
    n: (c) => c[Z.n],
    value: (c, all) => ratio(c[Z.n], total(all, Z.n)),
    format: pct1,
    scale: 'lean',
    share: true,
    ends: ['Less often', 'More often'],
    between: 0,
    within: () => 0,
    minN: 1,
    noun: 'pitches',
  },
  swing: {
    label: 'Swing %',
    title: 'How often he swings at the pitches in each spot, against the league’s hitters',
    per: 'swing rate',
    n: (c) => c[Z.n],
    value: (c) => ratio(c[Z.sw], c[Z.n]),
    format: pct,
    scale: 'lean',
    ends: ['Takes more', 'Swings more'],
    between: 0.05,
    within: (p) => Math.sqrt(Math.max(0.01, p * (1 - p))),
    minN: 8,
    noun: 'pitches',
  },
  ev: {
    label: 'Exit Velo',
    title: pitcher ? 'The average exit velocity of the balls put in play on his pitches in each spot' : 'The average exit velocity of his balls in play on the pitches in each spot',
    per: 'mph off the bat',
    n: (c) => c[Z.evn],
    value: (c) => ratio(c[Z.ev] / 10, c[Z.evn]),
    format: dec1,
    lowerIsBetter: pitcher,
    between: 2.2,
    within: () => 14,
    minN: 6,
    noun: 'balls in play',
  },
});

function zoneStat(spec: ZoneSpec, key: string, vs: string): HeatStat {
  return { key, label: spec.label, per: spec.per, format: spec.format, lowerIsBetter: spec.lowerIsBetter, minN: spec.minN, noun: spec.noun, scale: spec.scale, ends: spec.ends, countNoun: 'pitches', vs };
}

// A zone map's cells in a stat: each against the league's there, its spread by its sample; the count the pitches
export function zoneCells(cells: Cell[], league: Cell[], spec: ZoneSpec): HeatCell[] {
  return ZONE_CELL_IDS.map((id, i) => {
    const c = cells[i];
    const n = spec.n(c);
    const lg = spec.value(league[i], league);
    const value = n ? spec.value(c, cells) : null;
    const sd = lg === null ? null : spec.share ? shareSd(lg, total(cells, Z.n)) : spread(spec.between, spec.within(lg), n);
    return { id, n, value, league: lg, sd, count: c[Z.n] } satisfies HeatCell;
  });
}

// ---- the spray chart

type SprayKey = 'xwoba' | 'share' | 'ev';
interface SpraySpec {
  label: string;
  title: string;
  per: string;
  n: (c: Cell) => number;
  value: (c: Cell, all: Cell[]) => number | null;
  format: (v: number) => string;
  scale?: 'lean';
  share?: boolean;
  ends?: [string, string];
  between: number;
  within: number;
  minN: number;
  noun: string;
}
const SPRAY_SPECS: Record<SprayKey, SpraySpec> = {
  xwoba: { label: 'xwOBA', title: 'Expected wOBA on contact: the quality of his balls in play there, by their exit velocity and launch angle', per: 'xwOBA on contact', n: (c) => c[S.n], value: (c) => ratio(c[S.xw] / 1000, c[S.n]), format: dec3, between: 0.04, within: 0.42, minN: 5, noun: 'balls in play' },
  share: {
    label: 'Share',
    title: "Where his balls in play go: each spot's share of them, against the league's hitters'",
    per: 'of his balls in play',
    n: (c) => c[S.n],
    value: (c, all) => ratio(c[S.n], total(all, S.n)),
    format: pct1,
    scale: 'lean',
    share: true,
    ends: ['Less often', 'More often'],
    between: 0,
    within: 0,
    minN: 1,
    noun: 'balls in play',
  },
  ev: { label: 'Exit Velo', title: 'The average exit velocity of his balls in play there', per: 'mph off the bat', n: (c) => c[S.evn], value: (c) => ratio(c[S.ev] / 10, c[S.evn]), format: dec1, between: 2.2, within: 13, minN: 5, noun: 'balls in play' },
};

export function sprayCells(cells: Cell[], league: Cell[], spec: SpraySpec): HeatCell[] {
  const all = total(cells, S.n);
  return SPRAY_CELL_IDS.map((id, i) => {
    const c = cells[i];
    const n = spec.n(c);
    const lg = spec.value(league[i], league);
    const value = n ? spec.value(c, cells) : null;
    const sd = lg === null ? null : spec.share ? shareSd(lg, all) : spread(spec.between, spec.within, n);
    const hits = c[S.h];
    const detail = c[S.n] ? [`${plural(hits, 'hit')}${c[S.hr] ? ` (${plural(c[S.hr], 'homer')})` : ''} on ${plural(c[S.n], 'ball')} in play`] : undefined;
    return { id, n, value, league: lg, sd, count: c[S.n], detail } satisfies HeatCell;
  });
}

// ---- the numbers beside the maps

const chip = (label: string, value: string, sub: string, tone: number, title: string): HeatChip => ({ label, value, sub, tone, title });

// A hitter's batted balls: where they go, their types, their quality, his home runs
export function sprayChips(cells: Cell[], league: Cell[], hrs: [number, number, number, number][]): HeatChip[] {
  const all = total(cells, S.n);
  const lgAll = total(league, S.n);
  if (!all) return [];
  const sumWhere = (list: Cell[], test: (id: string) => boolean, k = S.n) => list.reduce((a, c, i) => a + (test(SPRAY_CELL_IDS[i]) ? c[k] : 0), 0);
  const share = (test: (id: string) => boolean) => sumWhere(cells, test) / all;
  const lgShare = (test: (id: string) => boolean) => (lgAll ? sumWhere(league, test) / lgAll : null);
  const out: HeatChip[] = [];
  const shareChip = (label: string, test: (id: string) => boolean, title: string, good: 1 | 0 | -1 = 0) => {
    const v = share(test);
    const lg = lgShare(test);
    out.push(chip(label, pct(v), lg === null ? `${sumWhere(cells, test)} of ${all}` : `${sumWhere(cells, test)} of ${all} · league ${pct(lg)}`, good && lg !== null ? toneOf(v, lg, shareSd(lg, all), good < 0) : 0, title));
  };
  const xw = total(cells, S.xw) / 1000 / all;
  const lgXw = lgAll ? total(league, S.xw) / 1000 / lgAll : null;
  out.push(chip('xwOBA on contact', dec3(xw), lgXw === null ? `${all} balls in play` : `${all} balls in play · league ${dec3(lgXw)}`, toneOf(xw, lgXw, spread(0.03, 0.42, all)), 'Expected wOBA on his balls in play, by their exit velocity and launch angle'));
  const evn = total(cells, S.evn);
  if (evn) {
    const ev = total(cells, S.ev) / 10 / evn;
    const lgN = total(league, S.evn);
    const lgEv = lgN ? total(league, S.ev) / 10 / lgN : null;
    out.push(chip('Exit velocity', dec1(ev), lgEv === null ? 'mph, average' : `mph · league ${dec1(lgEv)}`, toneOf(ev, lgEv, spread(1.6, 13, evn)), 'His average exit velocity on balls in play'));
  }
  shareChip('Pull', (id) => id.startsWith('pull'), 'Balls in play to his pull side (more than 15 degrees off center)');
  shareChip('Opposite field', (id) => id.startsWith('oppo'), 'Balls in play to the opposite field');
  shareChip('Pulled in the air', (id) => id === 'pull-ld' || id === 'pull-fb', 'Line drives and fly balls to his pull side, of all his balls in play: where power comes from', 1);
  shareChip('Ground balls', (id) => id.endsWith('-gb'), 'Ground balls, of his balls in play');
  shareChip('Line drives', (id) => id.endsWith('-ld'), 'Line drives, of his balls in play', 1);
  shareChip('Fly balls', (id) => id.endsWith('-fb'), 'Fly balls, of his balls in play');
  if (hrs.length) {
    const avg = hrs.reduce((a, h) => a + h[1], 0) / hrs.length;
    const longest = Math.max(...hrs.map((h) => h[1]));
    out.push(chip('Home runs', String(hrs.length), `${Math.round(avg)} ft on average · longest ${longest}`, 0, 'His home runs, and how far they went (Statcast’s projected distance)'));
  }
  return out;
}

// A hitter's approach: what he swings at, misses, and does with what he hits; a pitcher's the same against him
export function plateChips(cells: Cell[], league: Cell[], pitcher: boolean): HeatChip[] {
  const sum = (list: Cell[], k: number, test: (id: string) => boolean) => list.reduce((a, c, i) => a + (test(ZONE_CELL_IDS[i]) ? c[k] : 0), 0);
  const inZ = IN_ZONE;
  const outZ = (id: string) => !IN_ZONE(id);
  const any = () => true;
  const n = total(cells, Z.n);
  if (!n) return [];
  const out: HeatChip[] = [];
  const rate = (label: string, num: [number, (id: string) => boolean], den: [number, (id: string) => boolean], title: string, lowerIsBetter: boolean, between: number) => {
    const a = sum(cells, num[0], num[1]);
    const b = sum(cells, den[0], den[1]);
    if (!b) return;
    const la = sum(league, num[0], num[1]);
    const lb = sum(league, den[0], den[1]);
    const v = a / b;
    const lg = lb ? la / lb : null;
    out.push(chip(label, pct(v), `${a} of ${b}${lg === null ? '' : ` · league ${pct(lg)}`}`, toneOf(v, lg, spread(between, Math.sqrt(Math.max(0.01, (lg ?? v) * (1 - (lg ?? v)))), b), lowerIsBetter), title));
  };
  if (pitcher) {
    rate('In the zone', [Z.n, inZ], [Z.n, any], 'His pitches in the strike zone', false, 0.03);
    rate('Chase rate', [Z.sw, outZ], [Z.n, outZ], 'Swings at his pitches outside the zone, of those pitches', false, 0.03);
    rate('Whiff rate', [Z.wh, any], [Z.sw, any], 'Swings and misses, of the swings at his pitches', false, 0.04);
  } else {
    rate('Chase rate', [Z.sw, outZ], [Z.n, outZ], 'His swings at pitches outside the zone, of those pitches', true, 0.04);
    rate('Zone swing', [Z.sw, inZ], [Z.n, inZ], 'His swings at pitches in the zone, of those pitches', false, 0.04);
    rate('Whiff rate', [Z.wh, any], [Z.sw, any], 'His swings and misses, of his swings', true, 0.04);
    rate('Zone whiffs', [Z.wh, inZ], [Z.sw, inZ], 'His swings and misses in the zone, of his swings there', true, 0.03);
  }
  const pa = total(cells, Z.pa);
  if (pa) {
    const v = total(cells, Z.xw) / 1000 / pa;
    const lgPa = total(league, Z.pa);
    const lg = lgPa ? total(league, Z.xw) / 1000 / lgPa : null;
    out.push(chip(pitcher ? 'xwOBA against' : 'xwOBA', dec3(v), `${plural(pa, 'plate appearance')}${lg === null ? '' : ` · league ${dec3(lg)}`}`, toneOf(v, lg, spread(0.02, 0.45, pa), pitcher), 'Expected wOBA: by the strikeouts, walks and quality of contact'));
  }
  return out;
}

// A pitcher's arsenal (the Zones tab's, folded in): each pitch's share, speed, whiffs and expected wOBA against,
// against the league's pitchers' with the same pitch
export function arsenalChips(entry: PitcherEntry, main: MainFile, split: string, throws: ('L' | 'R')[]): HeatChip[] {
  const types = Object.keys(entry.t);
  const rowsOf = (type: string) => zoneRows(entry.t[type], split);
  const all = types.reduce((a, t) => a + total(rowsOf(t), Z.n), 0);
  if (!all) return [];
  const stands = handsOf(split);
  return types
    .map((type) => ({ type, cells: rowsOf(type) }))
    .filter((x) => total(x.cells, Z.n))
    .sort((a, b) => total(b.cells, Z.n) - total(a.cells, Z.n))
    .map(({ type, cells }) => {
      const n = total(cells, Z.n);
      const [vn, v10] = entry.v[type] ?? [0, 0];
      const lg = leagueZone(main, stands, throws, type);
      const sw = total(cells, Z.sw);
      const wh = total(cells, Z.wh);
      const lgSw = total(lg, Z.sw);
      const lgWh = lgSw ? total(lg, Z.wh) / lgSw : null;
      const pa = total(cells, Z.pa);
      const xw = pa ? total(cells, Z.xw) / 1000 / pa : null;
      const whiff = sw ? wh / sw : null;
      const t = PITCH_TYPES[type] ?? PITCH_TYPES['OT'];
      const parts = [vn ? `${dec1(v10 / 10 / vn)} mph` : null, whiff !== null ? `whiff ${pct(whiff)}` : null, xw !== null && pa >= 10 ? `xwOBA ${dec3(xw)}` : null].filter(Boolean);
      return chip(
        t.name,
        pct1(n / all),
        parts.join(' · '),
        whiff === null ? 0 : toneOf(whiff, lgWh, spread(0.05, 0.45, sw)),
        `${t.name}: ${plural(n, 'pitch', 'pitches')}${lgWh !== null ? `; the league's whiff rate on it ${pct(lgWh)}` : ''} (the value's color: his whiff rate against it)`,
      );
    });
}

// ---- the damage zones: where a pitcher puts the ball against where that side's hitters do their damage

// (a spot's damage: the hitters' expected wOBA on contact there, the quality of what they put in play; how far
// from their overall reads as a damage zone, or a cold one, at full strength)
const DAMAGE_SCALE = 0.08;
const contact = (c: Cell): number | null => ratio(c[Z.bxw] / 1000, c[Z.bip]);

export function damageCells(his: Cell[], league: Cell[]): { cells: HeatCell[]; base: number | null } {
  const lgN = total(league, Z.n);
  const lgBip = total(league, Z.bip);
  const n = total(his, Z.n);
  const base = lgBip ? total(league, Z.bxw) / 1000 / lgBip : null;
  const cells = ZONE_CELL_IDS.map((id, i) => {
    const mine = n ? his[i][Z.n] / n : 0;
    const theirs = lgN ? league[i][Z.n] / lgN : 0;
    const xw = league[i][Z.bip] >= 30 ? contact(league[i]) : null;
    // (the spot's weight: a damage zone positive, a cold one negative, as far as 1 either way)
    const w = xw === null || base === null ? 0 : clamp((xw - base) / DAMAGE_SCALE);
    const sdShare = shareSd(theirs, n);
    return {
      id,
      n,
      value: mine * w,
      league: theirs * w,
      sd: Math.abs(w) < 0.05 ? null : sdShare * Math.abs(w),
      label: pct1(mine),
      sub: xw === null ? '' : dec3(xw),
      count: his[i][Z.n],
      detail: [xw === null ? 'Too few balls in play here to say' : `Hitters’ xwOBA on contact here ${dec3(xw)} (${dec3(base ?? 0)} overall)${w > 0.5 ? ': a damage zone' : w < -0.5 ? ': a cold zone' : ''}`, `The league’s pitchers: ${pct1(theirs)} of theirs here`],
    } satisfies HeatCell;
  });
  return { cells, base };
}

export function damageChips(his: Cell[], league: Cell[]): HeatChip[] {
  const lgN = total(league, Z.n);
  const n = total(his, Z.n);
  const lgBip = total(league, Z.bip);
  if (!n || !lgN || !lgBip) return [];
  const base = total(league, Z.bxw) / 1000 / lgBip;
  // (each spot's damage a pitch thrown there: how often it's put in play, times how hard)
  const perPitch = league.map((c) => (c[Z.n] ? c[Z.bxw] / 1000 / c[Z.n] : 0));
  const by = (list: Cell[], of: number) => list.reduce((a, c, i) => a + (c[Z.n] / of) * perPitch[i], 0);
  const mine = by(his, n);
  const theirs = by(league, lgN);
  const hot = (i: number) => league[i][Z.bip] >= 30 && (contact(league[i]) ?? 0) - base > 0.03;
  const hotMine = his.reduce((a, c, i) => a + (hot(i) ? c[Z.n] : 0), 0) / n;
  const hotTheirs = league.reduce((a, c, i) => a + (hot(i) ? c[Z.n] : 0), 0) / lgN;
  const heart = ZONE_CELL_IDS.indexOf('z22');
  const out: HeatChip[] = [
    chip('Damage by location', signedPct(mine / theirs - 1), 'contact damage a pitch, against the league’s pitchers’ spots', toneOf(mine / theirs - 1, 0, 0.04, true), 'What these hitters do on contact (xwOBA) with pitches in the spots he throws to, a pitch, against the spots the league’s pitchers throw to: location alone, not his stuff'),
    chip('In damage zones', pct(hotMine), `league ${pct(hotTheirs)}`, toneOf(hotMine, hotTheirs, 0.03, true), 'His pitches in the spots where these hitters’ xwOBA on contact runs well over their overall'),
    chip('Heart of the zone', pct1(his[heart][Z.n] / n), `league ${pct1(league[heart][Z.n] / lgN)}`, toneOf(his[heart][Z.n] / n, league[heart][Z.n] / lgN, 0.015, true), 'His pitches down the middle'),
  ];
  return out;
}

// ---- the defense: Outs Above Average by position

type DefKey = 'oaa' | 'frp' | 'sr';
const DEF = { oaa: 0, frp: 1, in: 2, to3b: 3, to1b: 4, back: 5, sr: 6, xsr: 7, outs: 8, range: 9, arm: 10 };
const defRow = (p: Packed | undefined): number[] => Array.from({ length: 11 }, (_, k) => (p ? (p[k] ?? 0) : 0));

// (what's under a cell's value: a team's who played there most, a fielder's innings there)
const sample = (team: boolean) => (team ? 'who played it most' : 'his innings there');

function defStat(key: DefKey, team: boolean): HeatStat & { title: string } {
  if (key === 'sr')
    return { key, label: 'Success +/-', title: 'The share of the chances turned into outs, against how often an average fielder makes the same plays', per: 'success vs expected', format: signedPct, minN: 1, noun: team ? 'positions' : 'outs played', sample: sample(team), vs: 'expected' };
  if (key === 'frp')
    return { key, label: 'Runs Prevented', title: 'Fielding runs prevented: his Outs Above Average in runs', per: 'runs prevented', format: signed, minN: 1, noun: 'outs played', sample: sample(team), vs: 'average' };
  return { key, label: 'OAA', title: 'Outs Above Average: the outs made beyond what an average fielder makes on the same chances (Statcast’s catch and range probabilities)', per: 'OAA', format: signed, minN: 1, noun: team ? 'positions' : 'outs played', sample: sample(team), vs: 'average' };
}

const defValue = (r: number[], key: DefKey): number | null => (key === 'oaa' ? r[DEF.oaa] : key === 'frp' ? r[DEF.frp] : r[DEF.sr] || r[DEF.xsr] ? (r[DEF.sr] - r[DEF.xsr]) / 1000 : null);
const defSd = (key: DefKey, sd: number | null | undefined): number | null => (key === 'sr' ? 0.02 : key === 'frp' ? (sd ? sd * 0.8 : null) : (sd ?? null));

export function teamDefenseCells(main: MainFile, team: string, key: DefKey): HeatCell[] | null {
  const t = main.defense?.teams[team];
  if (!t) return null;
  return DIAMOND_POSITIONS.map((pos) => {
    const r = defRow(t.rows[pos]);
    const who = t.who[pos] ?? [];
    return {
      id: pos,
      n: t.rows[pos] ? 1 : 0,
      value: t.rows[pos] ? defValue(r, key) : null,
      league: 0,
      sd: defSd(key, main.defense!.sd.team[pos]),
      // (who played there most: his last name, "Witt Jr.")
      sub: who[0]?.[0].replace(/^\S+\. /, '') ?? '',
      detail: who.length ? who.map(([name, oaa]) => `${name} ${signed(oaa)} OAA`) : undefined,
    } satisfies HeatCell;
  });
}

export function fielderCells(main: MainFile, rows: Record<string, Packed>, key: DefKey): HeatCell[] {
  return DIAMOND_POSITIONS.map((pos) => {
    if (!rows[pos]) return { id: pos, n: 0, value: null, league: null };
    const r = defRow(rows[pos]);
    const outs = r[DEF.outs];
    return {
      id: pos,
      n: Math.max(1, outs),
      count: outs,
      value: defValue(r, key),
      league: 0,
      sd: defSd(key, main.defense?.sd.fielder[pos]),
      sub: outs ? `${Math.round(outs / 3).toLocaleString('en-US')} inn` : '',
      detail: [`${signed(r[DEF.oaa])} OAA · ${signed(r[DEF.frp])} runs prevented`, r[DEF.sr] ? `Success ${Math.round(r[DEF.sr] / 10)}% · expected ${Math.round(r[DEF.xsr] / 10)}%` : ''].filter(Boolean),
    } satisfies HeatCell;
  });
}

// The directions and totals beside a defense's map: a team's (all its positions), a fielder's (all of his)
export function defenseChips(rows: number[][], team: boolean, sds: (number | null)[], positions: string[] = []): HeatChip[] {
  const sum = (k: number) => rows.reduce((a, r) => a + r[k], 0);
  const sd = Math.sqrt(sds.reduce((a: number, v) => a + (v ?? 4) ** 2, 0)) || 4;
  const oaa = sum(DEF.oaa);
  const out: HeatChip[] = [chip('Outs Above Average', signed(oaa), team ? 'every position' : `at ${positions.join(', ')}`, toneOf(oaa, 0, sd), 'Outs made beyond what average fielders make on the same chances')];
  if (!team) {
    out.push(chip('Runs prevented', signed(sum(DEF.frp)), 'his OAA in runs', toneOf(sum(DEF.frp), 0, sd * 0.8), 'Fielding runs prevented'));
    const range = sum(DEF.range) / 10;
    const arm = sum(DEF.arm) / 10;
    if (range || arm) out.push(chip('Range · arm', `${signed(range)} · ${signed(arm)}`, 'runs, Fielding Run Value', toneOf(range + arm, 0, sd * 0.8), 'His Fielding Run Value’s range runs and arm runs'));
  }
  const dir = (label: string, k: number, title: string) => out.push(chip(label, signed(sum(k)), 'OAA', toneOf(sum(k), 0, sd / 2), title));
  dir('Coming in', DEF.in, 'Outs above average on the balls in front of the fielder');
  dir('Going back', DEF.back, 'Outs above average on the balls behind the fielder');
  dir('Toward 3B line', DEF.to3b, 'Outs above average moving toward the third-base line');
  dir('Toward 1B line', DEF.to1b, 'Outs above average moving toward the first-base line');
  return out;
}

// ---- the maps

export interface MlbHeatContext {
  current: (season: number) => boolean;
}

const HEAT_FIRST = 2015;
const OAA_FIRST = 2016;

export function mlbHeatMaps({ current }: MlbHeatContext): HeatMapDef[] {
  const hitter = (q: HeatQuery) => entryOf<HitterEntry>(q.season, current(q.season), 'h', q.player.id);
  const pitcherOf = (q: HeatQuery, season = q.season) => entryOf<PitcherEntry>(season, current(season), 'p', q.player.id);
  // (the same row's last season behind the season being played's thin cells)
  const fallbackOf = (q: HeatQuery, cells: HeatCell[] | null): Partial<HeatMapData> => (cells ? { fallback: cells, fallbackLabel: String(q.season - 1), seasonLabel: String(q.season) } : {});
  const early = (q: HeatQuery) => current(q.season) && q.season - 1 >= HEAT_FIRST;

  // (a pitcher's league: the pitchers of his hand, as his entry keeps it; both before the file kept it)
  const throwsOf = (entry: PitcherEntry): ('L' | 'R')[] => (entry.h ? [entry.h] : ['L', 'R']);

  // ---- a pitcher's location
  const location: HeatMapDef = {
    id: 'location',
    positions: PITCHERS,
    surface: 'strike-zone',
    group: 'location',
    numbers: true,
    firstSeason: HEAT_FIRST,
    splits: () => PITCHER_SPLITS,
    load: async (q) => {
      const got = await pitcherOf(q);
      if (!got) return null;
      const { main, entry } = got;
      const types = Object.keys(entry.t).sort((a, b) => total(zoneRows(entry.t[b], 'all'), Z.n) - total(zoneRows(entry.t[a], 'all'), Z.n));
      const type = q.option && (q.option === 'all' || types.includes(q.option)) ? q.option : 'all';
      const rowsOf = (e: PitcherEntry, split: string) => (type === 'all' ? Object.keys(e.t).reduce((a, t) => addCells(a, zoneRows(e.t[t], split)), cellsOf(0, 25, ZONE_W)) : zoneRows(e.t[type], split));
      const cells = rowsOf(entry, q.split);
      const n = total(cells, Z.n);
      const all = types.reduce((a, t) => a + total(zoneRows(entry.t[t], 'all'), Z.n), 0);
      const throws = throwsOf(entry);
      const league = leagueZone(main, handsOf(q.split), throws, type);
      const specs = ZONE_SPECS(true);
      const keys: ZoneKey[] = ['xwoba', 'whiff', 'freq'];
      const key = keys.find((k) => k === q.stat) ?? 'xwoba';
      const vs = type === 'all' ? 'the league' : `the league’s ${PITCH_TYPES[type]?.plural ?? 'pitches'}`;
      const last = early(q) ? await pitcherOf(q, q.season - 1) : null;
      const behind = last && (type === 'all' || last.entry.t[type]) ? zoneCells(rowsOf(last.entry, q.split), leagueZone(last.main, handsOf(q.split), throws, type), specs[key]) : null;
      return {
        surface: 'strike-zone',
        title: 'Pitch Location',
        count: type === 'all' ? `${plural(n, 'pitch', 'pitches')}${splitWords(q.split, true)}` : `${n.toLocaleString('en-US')} ${PITCH_TYPES[type]?.plural ?? 'pitches'}${splitWords(q.split, true)}`,
        help: `Every pitch's spot over the plate, from the catcher's view: the zone's nine boxes and the chase area around them, each against ${type === 'all' ? "the league's pitchers of his hand" : `${vs} from pitchers of his hand`} in the same spot; a spot with too small a sample greyed. Statcast, the regular season`,
        stats: keys.map((k) => ({ key: k, label: specs[k].label, title: specs[k].title })),
        stat: zoneStat(specs[key], key, vs),
        cells: zoneCells(cells, league, specs[key]),
        defense: false,
        options: {
          label: 'Pitch type',
          value: type,
          items: [
            { key: 'all', label: 'All', title: `Every pitch: ${plural(all, 'pitch', 'pitches')}` },
            ...types.map((t) => {
              const tn = total(zoneRows(entry.t[t], 'all'), Z.n);
              return { key: t, label: PITCH_TYPES[t]?.short ?? t, color: PITCH_TYPES[t]?.color, title: `${PITCH_TYPES[t]?.name ?? t}: ${pct1(tn / (all || 1))} of his pitches` };
            }),
          ],
        },
        chips: [...arsenalChips(entry, main, q.split, throws), ...plateChips(cells, league, true)],
        chipsTitle: 'Arsenal',
        ...fallbackOf(q, behind),
      } satisfies HeatMapData;
    },
  };

  // ---- a pitcher's damage zones
  const damage: HeatMapDef = {
    id: 'damage',
    positions: PITCHERS,
    surface: 'strike-zone',
    group: 'damage',
    numbers: true,
    firstSeason: HEAT_FIRST,
    splits: () => PITCHER_SPLITS,
    load: async (q) => {
      const got = await pitcherOf(q);
      if (!got) return null;
      const { main, entry } = got;
      const throws = throwsOf(entry);
      const sideRows = (side: 'L' | 'R') => Object.keys(entry.t).reduce((a, t) => addCells(a, cellsOf(entry.t[t][side], 25, ZONE_W)), cellsOf(0, 25, ZONE_W));
      // (the side: the split's, else the one picked, else the one he faced more)
      const faced = { L: total(sideRows('L'), Z.n), R: total(sideRows('R'), Z.n) };
      const fixed = q.split === 'vl' ? 'L' : q.split === 'vr' ? 'R' : null;
      const side: 'L' | 'R' = fixed ?? (q.stat === 'L' || q.stat === 'R' ? q.stat : faced.L > faced.R ? 'L' : 'R');
      const his = sideRows(side);
      const n = total(his, Z.n);
      if (n < 30) return null;
      const league = leagueZone(main, [side], throws, null);
      const { cells } = damageCells(his, league);
      const who = side === 'L' ? 'LHH' : 'RHH';
      const stat: HeatStat = {
        key: side,
        label: `vs ${who}`,
        per: 'of his pitches here',
        format: pct1,
        lowerIsBetter: true,
        minN: 30,
        noun: 'pitches',
        sample: 'their xwOBA on contact',
        countNoun: 'pitches',
        ends: ['Into damage', 'Away from damage'],
        vs: null,
      };
      return {
        surface: 'strike-zone',
        title: `${who} Damage Zones`,
        count: `${plural(n, 'pitch', 'pitches')} to ${side === 'L' ? 'left' : 'right'}-handed hitters`,
        help: `Where he throws to ${side === 'L' ? 'left' : 'right'}-handed hitters (each spot's share of his pitches, the big number) against where they do their damage (the league's expected wOBA there, the small one): red where he goes more often than the league's pitchers to a spot they hit hard, or less to one they don't; green the other way`,
        stats: fixed ? [] : (['L', 'R'] as const).map((s) => ({ key: s, label: `vs ${s}HH`, title: `${s === 'L' ? 'Left' : 'Right'}-handed hitters: ${plural(faced[s], 'pitch', 'pitches')}` })),
        stat,
        cells,
        defense: false,
        chips: damageChips(his, league),
        chipsTitle: `Against ${who}`,
      } satisfies HeatMapData;
    },
  };

  // ---- a hitter's spray chart
  const spray: HeatMapDef = {
    id: 'spray',
    positions: HITTERS,
    surface: 'spray-fan',
    group: 'spray',
    numbers: true,
    firstSeason: HEAT_FIRST,
    splits: () => HITTER_SPLITS,
    load: async (q) => {
      const got = await hitter(q);
      if (!got?.entry.s) return null;
      const { main, entry } = got;
      const cells = sprayRows(entry.s, q.split);
      const n = total(cells, S.n);
      if (!n) return null;
      const league = handsOf(q.split).reduce((a, h) => addCells(a, cellsOf(main.league.spray[h], 12, SPRAY_W)), cellsOf(0, 12, SPRAY_W));
      const keys: SprayKey[] = ['xwoba', 'share', 'ev'];
      const key = keys.find((k) => k === q.stat) ?? 'xwoba';
      const spec = SPRAY_SPECS[key];
      const lefty = majoritySide(entry.b, q.split) === 'L';
      const surface: HeatSurfaceId = lefty ? 'spray-fan-l' : 'spray-fan';
      const hrs = (entry.hr ?? []).filter((h) => q.split === 'all' || (q.split === 'vl') === (h[3] === 1));
      // (his home runs where they landed: their direction, their distance as Statcast projects it)
      const marks: HeatMark[] = hrs.map(([angle, dist, ev, lhp]) => {
        const [x, y] = at(Math.min(dist, 478), Math.max(-47, Math.min(47, angle)));
        return { x, y, r: 2.4, cls: 'hr', title: `Home run: ${dist} ft${ev ? `, ${ev} mph` : ''} off a ${lhp ? 'left' : 'right'}-hander` };
      });
      // (his home park's wall, as it stood that season)
      const team = teamIdOf(q.player);
      const venue = team ? main.parks[team] : null;
      const layers: HeatShape[] = venue ? [{ kind: 'path', d: wallPath(venue).wall, cls: 'hm-wall park' }, { kind: 'text', ...pos(at(452, 0)), text: venue.toUpperCase(), cls: 'hm-park-name' }] : [];
      const last = early(q) ? await entryOf<HitterEntry>(q.season - 1, false, 'h', q.player.id) : null;
      const behind = last?.entry.s ? sprayCells(sprayRows(last.entry.s, q.split), handsOf(q.split).reduce((a, h) => addCells(a, cellsOf(last.main.league.spray[h], 12, SPRAY_W)), cellsOf(0, 12, SPRAY_W)), spec) : null;
      return {
        surface,
        title: 'Spray Chart',
        count: `${plural(n, 'ball')} in play${splitWords(q.split, false)}${hrs.length ? ` · ${plural(hrs.length, 'homer')}` : ''}`,
        help: `His balls in play by direction (his pull side, up the middle, the opposite field) and type, each against the league's; his home runs where they landed${venue ? `, over ${venue}'s wall` : ''}. Statcast, the regular season`,
        stats: keys.map((k) => ({ key: k, label: SPRAY_SPECS[k].label, title: SPRAY_SPECS[k].title })),
        stat: { key, label: spec.label, per: spec.per, format: spec.format, minN: spec.minN, noun: spec.noun, scale: spec.scale, ends: spec.ends, countNoun: 'balls in play' },
        cells: sprayCells(cells, league, spec),
        defense: false,
        layers,
        marks,
        markKey: marks.length ? 'Home run' : undefined,
        chips: sprayChips(cells, league, hrs),
        chipsTitle: 'Batted Balls',
        ...fallbackOf(q, behind),
      } satisfies HeatMapData;
    },
  };

  // ---- a hitter's hot zones
  const zones: HeatMapDef = {
    id: 'zones',
    positions: HITTERS,
    surface: 'strike-zone',
    group: 'zones',
    numbers: true,
    firstSeason: HEAT_FIRST,
    splits: () => HITTER_SPLITS,
    load: async (q) => {
      const got = await hitter(q);
      if (!got?.entry.z) return null;
      const { main, entry } = got;
      const cells = zoneRows(entry.z, q.split);
      const n = total(cells, Z.n);
      if (!n) return null;
      const stand = majoritySide(entry.b, 'all');
      const league = leagueZone(main, [stand], handsOf(q.split), null);
      const specs = ZONE_SPECS(false);
      const keys: ZoneKey[] = ['xwoba', 'whiff', 'swing', 'ev'];
      const key = keys.find((k) => k === q.stat) ?? 'xwoba';
      const last = early(q) ? await entryOf<HitterEntry>(q.season - 1, false, 'h', q.player.id) : null;
      const behind = last?.entry.z ? zoneCells(zoneRows(last.entry.z, q.split), leagueZone(last.main, [stand], handsOf(q.split), null), specs[key]) : null;
      return {
        surface: 'strike-zone',
        title: 'Hot Zones',
        count: `${plural(n, 'pitch', 'pitches')} seen${splitWords(q.split, false)}`,
        help: `What he does with the pitches in each part of the zone and the chase area, from the catcher's view, against the league's ${stand === 'L' ? 'left' : 'right'}-handed hitters there. Statcast, the regular season`,
        stats: keys.map((k) => ({ key: k, label: specs[k].label, title: specs[k].title })),
        stat: zoneStat(specs[key], key, 'the league'),
        cells: zoneCells(cells, league, specs[key]),
        defense: false,
        chips: plateChips(cells, league, false),
        chipsTitle: 'At the Plate',
        ...fallbackOf(q, behind),
      } satisfies HeatMapData;
    },
  };

  // ---- the defense: a fielder's positions, a team's
  const defKeys = (team: boolean): DefKey[] => (team ? ['oaa', 'sr'] : ['oaa', 'frp', 'sr']);
  const fielding: HeatMapDef = {
    id: 'fielding',
    positions: HITTERS,
    surface: 'diamond-field',
    group: 'fielding',
    numbers: true,
    firstSeason: OAA_FIRST,
    splits: () => HITTER_SPLITS,
    load: async (q) => {
      const got = await hitter(q);
      const rows = got?.entry.d;
      if (!got || !rows || !Object.keys(rows).length || !got.main.defense) return null;
      const { main } = got;
      const key = defKeys(false).find((k) => k === q.stat) ?? 'oaa';
      const played = DIAMOND_POSITIONS.filter((p) => rows[p]);
      const outs = played.reduce((a, p) => a + defRow(rows[p])[DEF.outs], 0);
      return {
        surface: 'diamond-field',
        title: 'In the Field',
        count: `${played.map((p) => p).join(', ')}${outs ? ` · ${plural(Math.round(outs / 3), 'inning')}` : ''} · the season`,
        help: `His Outs Above Average at each position he played: the outs he made beyond what an average fielder makes on the same chances. Statcast, the whole regular season (not by the pitcher's hand)`,
        stats: defKeys(false).map((k) => ({ key: k, label: defStat(k, false).label, title: defStat(k, false).title })),
        stat: defStat(key, false),
        cells: fielderCells(main, rows, key),
        defense: false,
        chips: defenseChips(
          played.map((p) => defRow(rows[p])),
          false,
          played.map((p) => main.defense!.sd.fielder[p]),
          played,
        ),
        chipsTitle: 'Fielding',
      } satisfies HeatMapData;
    },
  };
  const teamDefense: HeatMapDef = {
    id: 'team-defense',
    positions: ['TM'],
    surface: 'diamond-field',
    group: 'defense',
    numbers: true,
    volume: false,
    firstSeason: OAA_FIRST,
    splits: () => [SEASON],
    load: async (q) => {
      const main = await mainFile(q.season, current(q.season));
      const team = teamIdOf(q.player);
      if (!main?.defense || !team) return null;
      const key = defKeys(true).find((k) => k === q.stat) ?? 'oaa';
      const cells = teamDefenseCells(main, team, key);
      const t = main.defense.teams[team];
      if (!cells || !t) return null;
      // (its rank among the teams, by OAA added up)
      const sums = Object.entries(main.defense.teams).map(([id, x]) => [id, DIAMOND_POSITIONS.reduce((a, p) => a + defRow(x.rows[p])[DEF.oaa], 0)] as const);
      const mine = sums.find(([id]) => id === team)?.[1] ?? 0;
      const rank = sums.filter(([, v]) => v > mine).length + 1;
      const chips = defenseChips(
        DIAMOND_POSITIONS.map((p) => defRow(t.rows[p])),
        true,
        DIAMOND_POSITIONS.map((p) => main.defense!.sd.team[p]),
      );
      chips[0] = { ...chips[0], sub: `#${rank} of ${sums.length} teams` };
      const infield = ['1B', '2B', '3B', 'SS'].reduce((a, p) => a + defRow(t.rows[p])[DEF.oaa], 0);
      const outfield = ['LF', 'CF', 'RF'].reduce((a, p) => a + defRow(t.rows[p])[DEF.oaa], 0);
      chips.splice(1, 0, chip('Infield', signed(infield), '1B, 2B, 3B, SS', toneOf(infield, 0, 14), 'The infielders’ Outs Above Average'), chip('Outfield', signed(outfield), 'LF, CF, RF', toneOf(outfield, 0, 11), 'The outfielders’ Outs Above Average'));
      return {
        surface: 'diamond-field',
        title: 'Defense',
        count: 'Outs Above Average by position',
        help: 'Each position’s Outs Above Average, everyone who played it for the team: the outs made beyond what average fielders make on the same chances, each tinted by how far it is from average among the teams. Statcast, the regular season',
        stats: defKeys(true).map((k) => ({ key: k, label: defStat(k, true).label, title: defStat(k, true).title })),
        stat: defStat(key, true),
        cells,
        defense: false,
        chips,
        chipsTitle: 'Team Defense',
      } satisfies HeatMapData;
    },
  };

  return [location, damage, spray, zones, fielding, teamDefense];
}

const pos = ([x, y]: [number, number]) => ({ x, y });
