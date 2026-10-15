import { clampTone, pctText as pct, plural, ratio } from '@ranker/core/format';
import { heatSeasonFile } from '@ranker/engine/heat-map/heat-files';
import type { SkillPlayer } from '@sport/positions';
import { tintScale } from '@ranker/core/value-tint';
import { pickPair } from '@ranker/engine/heat-map/heat-color';
import type { HeatCell, HeatChip, HeatMapData, HeatMapDef, HeatMatchup, HeatQuery, HeatSplit, HeatStat } from '@ranker/engine/heat-map/heat-map.model';
import { RINK_ZONE_IDS } from '@ranker/engine/heat-map/surfaces/rink';

// The NHL's Heat Maps (SPORT.heatMaps, the card's Heat Maps tab), from MoneyPuck's shots binned by
// apps/nhl/scripts/build-heat-maps.mjs into sixteen zones of the offensive half of the rink (the rink surface):
//   a skater's   his unblocked shots by zone: goals against expected, shooting % against what his shots were
//                expected to go in at, the quality of his looks (xG a shot); his shot mix (where he shoots from
//                against the league's mix); beside them his numbers (finishing, in close, rebounds)
//   a goalie's   the shots he faced by zone: goals saved above expected, save % against expected, how hard
//                they were; and by shot type (wrist and snap, slap, tips, backhands), or in a situation's split
//                the mix he faced
//   a team's     its offense's chances by zone (xG a game, shots a game, finishing, quality) and its mix, and on
//                its Defense side what it allowed, each against the league's average team
// each split by situation (every one, 5-on-5, the power play or the penalty kill, rebounds) and the playoffs,
// and the AI preview's matchup maps (a team's chances against the next opponent's allowed, and theirs against
// its own). Files: data/heat-maps.json (the league, goalies, teams) and data/heat-maps.forwards.json,
// data/heat-maps.defense.json (the skaters), the season being played's at the top of data/, each earlier one's
// in data/seasons/<year>/. They keep sums (expected goals in hundredths), the regular season's and the
// playoffs', so the whole season is the two added up. Early in the season being played, a cell under its
// sample shows the same row's own last season behind it, faded (the component's fallback).

// ---- the files

// (a cell's fields, as the file's fields.cell names them: expected goals in goals here, hundredths in the file)
type Row = Record<string, number>;
type Packed = number[] | 0;
const XG_FIELDS = new Set(['xg', 'rebXg']);

interface Entry {
  gp: number;
  ev: Row[];
  pp: Row[];
  ot: Row[];
  ty?: Partial<Record<ShotType, Row[]>>;
}
interface Part {
  league: Entry;
  goalies: Record<string, Entry>;
  offense: Record<string, Entry>;
  defense: Record<string, Entry>;
}
export interface HeatFile {
  season: number;
  teams: Record<string, string>;
  regular: Part | null;
  post: Part | null;
}
export interface SkaterFile {
  season: number;
  regular: Record<string, Entry> | null;
  post: Record<string, Entry> | null;
}

type PackedEntry = { gp?: number; ev?: Packed[] | 0; pp?: Packed[] | 0; ot?: Packed[] | 0; ty?: Record<string, Packed[] | 0> };
interface PackedHead {
  season: number;
  fields: { cell: string[]; zones: string[]; types: string[] };
  teams?: Record<string, string>;
}
interface PackedPart {
  league: PackedEntry;
  goalies: Record<string, PackedEntry>;
  offense: Record<string, PackedEntry>;
  defense: Record<string, PackedEntry>;
}
export interface PackedHeatFile extends PackedHead {
  regular: PackedPart | null;
  post: PackedPart | null;
}
export interface PackedSkaterFile extends PackedHead {
  regular: Record<string, PackedEntry> | null;
  post: Record<string, PackedEntry> | null;
}

export const ZONE_IDS: string[] = RINK_ZONE_IDS;
export type ShotType = 'ws' | 'slap' | 'tip' | 'back';
export const SHOT_TYPES: { key: ShotType; label: string; title: string }[] = [
  { key: 'ws', label: 'Wrist & snap', title: 'Wrist shots and snap shots' },
  { key: 'slap', label: 'Slap', title: 'Slap shots' },
  { key: 'tip', label: 'Tips', title: 'Tips and deflections' },
  { key: 'back', label: 'Backhand', title: 'Backhands and wraparounds' },
];

// ---- read back: each tuple a row by the file's names (a plain 0, or a short tuple: zeros)

function rowsOf(names: string[], rows: Packed[] | 0 | undefined): Row[] {
  return ZONE_IDS.map((_, z) => {
    const t = rows ? rows[z] : 0;
    return Object.fromEntries(names.map((n, i) => [n, t ? (t[i] ?? 0) / (XG_FIELDS.has(n) ? 100 : 1) : 0]));
  });
}
function entryOf(names: string[], e: PackedEntry): Entry {
  const ty = e.ty ? Object.fromEntries(Object.entries(e.ty).map(([t, r]) => [t, rowsOf(names, r)])) : undefined;
  return { gp: e.gp ?? 0, ev: rowsOf(names, e.ev), pp: rowsOf(names, e.pp), ot: rowsOf(names, e.ot), ...(ty ? { ty } : {}) };
}
const entries = (names: string[], rows: Record<string, PackedEntry> | null | undefined) => Object.fromEntries(Object.entries(rows ?? {}).map(([id, e]) => [id, entryOf(names, e)]));

export function expandHeat(file: PackedHeatFile): HeatFile {
  const names = file.fields.cell;
  const part = (p: PackedPart | null): Part | null =>
    p && { league: entryOf(names, p.league), goalies: entries(names, p.goalies), offense: entries(names, p.offense), defense: entries(names, p.defense) };
  return { season: file.season, teams: file.teams ?? {}, regular: part(file.regular), post: part(file.post) };
}
export function expandSkaters(file: PackedSkaterFile): SkaterFile {
  const names = file.fields.cell;
  return { season: file.season, regular: file.regular && entries(names, file.regular), post: file.post && entries(names, file.post) };
}

// (added up: two parts into the whole season, or a row's situations into all of them)
const addRow = (a: Row, b: Row): Row => Object.fromEntries(Object.keys({ ...a, ...b }).map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));
const addRows = (a: Row[] | undefined, b: Row[] | undefined): Row[] | undefined => (!a ? b : !b ? a : a.map((r, i) => addRow(r, b[i])));
export function addEntries(a: Entry | undefined, b: Entry | undefined): Entry | undefined {
  if (!a || !b) return a ?? b;
  const ty: Entry['ty'] = a.ty || b.ty ? Object.fromEntries(SHOT_TYPES.map(({ key }) => [key, addRows(a.ty?.[key], b.ty?.[key])]).filter(([, r]) => r)) : undefined;
  return { gp: a.gp + b.gp, ev: addRows(a.ev, b.ev)!, pp: addRows(a.pp, b.pp)!, ot: addRows(a.ot, b.ot)!, ...(ty ? { ty } : {}) };
}
const merge = (x: Record<string, Entry>, y: Record<string, Entry>) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((id) => [id, addEntries(x[id], y[id])!]));
function addParts(a: Part | null, b: Part | null): Part | null {
  if (!a || !b) return a ?? b;
  return { league: addEntries(a.league, b.league)!, goalies: merge(a.goalies, b.goalies), offense: merge(a.offense, b.offense), defense: merge(a.defense, b.defense) };
}

// A split's part: the playoffs, or the whole season (the regular season and the playoffs added up), kept
const wholeSeason = new WeakMap<object, unknown>();
function whole<T>(file: { regular: T | null; post: T | null }, add: (a: T | null, b: T | null) => T | null): T | null {
  if (!wholeSeason.has(file)) wholeSeason.set(file, add(file.regular, file.post));
  return wholeSeason.get(file) as T | null;
}
export function heatPart(file: HeatFile, split: string): Part | null {
  return split === 'post' ? file.post : whole(file, addParts);
}
export function skaterPart(file: SkaterFile, split: string): Record<string, Entry> | null {
  return split === 'post' ? file.post : whole(file, (a, b) => (!a || !b ? (a ?? b) : merge(a, b)));
}

// An entry's rows in a split: every situation's added up, 5-on-5, the power play (a goalie's or a defense's:
// the penalty kill, the other side's power play), its rebounds (every situation's, as plain attempts, goals
// and expected goals: no shots on goal kept for them), the playoffs (every situation)
const allRows = new WeakMap<Entry, Row[]>();
export function splitRows(entry: Entry | undefined, split: string): Row[] | undefined {
  if (!entry) return undefined;
  if (split === 'ev') return entry.ev;
  if (split === 'pp') return entry.pp;
  if (!allRows.has(entry)) allRows.set(entry, addRows(addRows(entry.ev, entry.pp), entry.ot)!);
  const all = allRows.get(entry)!;
  if (split === 'reb') return all.map((r) => ({ att: r['rebAtt'], g: r['rebG'], xg: r['rebXg'], sog: 0 }));
  return all;
}

// ---- the files, once a season

const loaded = new Map<number, HeatFile | null>();
// (heat-files.ts: once a visit; another season's file, the one at the top of data/ before the new season's
// first shots, none)
export function heatFile(season: number, current: boolean): Promise<HeatFile | null> {
  return heatSeasonFile(season, current, 'heat-maps.json', expandHeat).then((f) => {
    loaded.set(season, f);
    return f;
  });
}
export const skaterFile = (season: number, current: boolean, group: 'forwards' | 'defense'): Promise<SkaterFile | null> =>
  heatSeasonFile(season, current, `heat-maps.${group}.json`, expandSkaters);

// ---- what a card's row is on the maps

type Kind = 'F' | 'D' | 'G' | 'off' | 'def';
const SKATERS = ['C', 'LW', 'RW', 'D'];
const TEAMS = ['TM', 'HC'];
// (a team's abbreviation from its logo's file name: "assets/NHL_Icons/WSH_secondary.svg" -> "WSH")
export const logoAbbr = (logo: string | null | undefined): string | null => /([A-Z]{2,3})[^/]*\.svg$/.exec(logo ?? '')?.[1] ?? null;
// (ESPN's abbreviations, the AI preview's schedule, as the site's: "LA" -> "LAK"; the Coyotes' older and newer)
const ESPN_CODES: Record<string, string> = { LA: 'LAK', NJ: 'NJD', SJ: 'SJS', TB: 'TBL', UTAH: 'UTA' };
const ALIASES: Record<string, string[]> = { ARI: ['PHX', 'UTA'], PHX: ['ARI'], UTA: ['ARI'] };
export function siteTeam(code: string, teams: Record<string, string>): string | null {
  const c = ESPN_CODES[code] ?? code;
  if (teams[c]) return c;
  return (ALIASES[c] ?? []).find((a) => teams[a]) ?? null;
}
// (a team's short name: "Boston Bruins" -> "Bruins", "Toronto Maple Leafs" -> "Maple Leafs", "Utah Hockey
// Club" -> "Utah")
const TWO_WORDS = ['Golden Knights', 'Blue Jackets', 'Maple Leafs', 'Red Wings'];
export function nickname(name: string | undefined, abbr: string): string {
  if (!name) return abbr;
  if (name.endsWith(' Hockey Club')) return name.replace(/ Hockey Club$/, '');
  return TWO_WORDS.find((w) => name.endsWith(w)) ?? name.split(' ').pop() ?? abbr;
}

// ---- the stats: what a cell's row reads as, against what

interface Ctx {
  // (the league's row in the cell; the row's and the league's games, for a team's per game; their shots in
  // the split, for a share)
  league: Row | undefined;
  gp: number;
  leagueGp: number;
  total: number;
  leagueTotal: number;
}
interface StatSpec {
  key: string;
  label: string;
  per: string;
  title: string;
  value: (r: Row, c: Ctx) => number | null;
  // (what it reads against: the league's in the cell, or what the row's own shots were expected to do)
  league: (r: Row, c: Ctx) => number | null;
  n: (r: Row) => number;
  made?: (r: Row) => number;
  format: (v: number) => string;
  // (its fallback spread, and a cell's own when it's the luck in its expected goals: none, the rows' spread there)
  sd: number;
  noise?: (r: Row) => number | null;
  noun: string;
  sample?: string;
  scale?: HeatStat['scale'];
  ends?: [string, string];
  vs?: string | null;
  detail?: (r: Row) => string[];
  // (a shots-on-goal stat: not in the rebounds' split, which keeps none)
  onGoal?: boolean;
}

// (signed, a tenth: "+2.1", "−0.4"; a value that rounds to nothing, "0.0")
export const signed1 = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}`;
};
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
// (".915", ".094": hockey's way)
export const thou = (v: number) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3).replace(/^0/, '');
const dec2 = (v: number) => v.toFixed(2);
const xgText = (v: number) => v.toFixed(1);
// (a sum of expected goals' own luck: how far the goals can land from them by chance, a binomial's spread)
const luck = (r: Row) => (r['att'] ? Math.max(0.6, Math.sqrt(r['xg'] * Math.max(0.05, 1 - r['xg'] / r['att']))) : null);
const att = (r: Row) => r['att'] ?? 0;
const sog = (r: Row) => r['sog'] ?? 0;
const leagueRate = (c: Ctx, a: string, b: string) => (c.league && c.league[b] ? c.league[a] / c.league[b] : null);

function statsFor(kind: Kind): StatSpec[] {
  const goalie = kind === 'G';
  const team = kind === 'off' || kind === 'def';
  const against = goalie || kind === 'def';
  const noun = 'shots';
  const gax: StatSpec = {
    key: goalie ? 'gsax' : 'gax',
    label: goalie ? 'GSAx' : 'Goals vs xG',
    per: goalie ? 'goals saved above expected' : kind === 'def' ? 'goals allowed vs expected' : 'goals vs expected',
    title: goalie
      ? "Goals saved above expected: the goals an average goalie would have allowed on these shots (MoneyPuck's expected goals), less the goals he allowed"
      : kind === 'def'
        ? 'Goals allowed against the expected goals of the shots: its goaltending'
        : "Goals scored against the expected goals of the shots (MoneyPuck's): finishing",
    value: (r) => (goalie ? r['xg'] - r['g'] : r['g'] - r['xg']),
    // (an average shooter's or goalie's on the same shots: the league's goals against its expected goals there)
    league: (r, c) => {
      const rate = c.league?.['att'] ? (c.league['g'] - c.league['xg']) / c.league['att'] : 0;
      return (goalie ? -rate : rate) * att(r);
    },
    n: att,
    format: signed1,
    sd: 1.5,
    noise: luck,
    noun,
    // (against an average shooter's or goalie's on the same shots: behind the net the league's goals beat their
    // expected goals, so a little under is better than most)
    vs: 'average',
    detail: (r) => [`${r['g']} goal${r['g'] === 1 ? '' : 's'}${against ? ' allowed' : ''} on ${xgText(r['xg'])} expected`],
  };
  const onGoal: StatSpec = goalie
    ? {
        key: 'svpct',
        label: 'Save %',
        per: 'save %',
        title: 'Save % on shots on goal, against the save % his shots were expected to allow (their expected goals)',
        value: (r) => (sog(r) ? 1 - r['g'] / sog(r) : null),
        league: (r) => (sog(r) ? 1 - r['xg'] / sog(r) : null),
        n: sog,
        made: (r) => sog(r) - r['g'],
        format: thou,
        sd: 0.03,
        noise: (r) => (sog(r) ? (luck(r) ?? 0) / sog(r) : null),
        noun: 'shots on goal',
        sample: 'saves / shots',
        vs: 'expected',
        onGoal: true,
      }
    : {
        key: 'shpct',
        label: 'Shooting %',
        per: kind === 'def' ? 'shooting % against' : 'shooting %',
        title: 'Goals a shot on goal, against what the shots were expected to go in at (their expected goals)',
        value: (r) => ratio(r['g'], sog(r)),
        league: (r) => ratio(r['xg'], sog(r)),
        n: sog,
        made: (r) => r['g'],
        format: pct1,
        sd: 0.04,
        noise: (r) => (sog(r) ? (luck(r) ?? 0) / sog(r) : null),
        noun: 'shots on goal',
        sample: 'goals / shots',
        vs: 'expected',
        onGoal: true,
      };
  const quality: StatSpec = {
    key: 'xgs',
    label: 'xG a shot',
    per: 'xG a shot',
    title: goalie ? 'How hard the shots he faced were: their expected goals a shot, against the league’s there' : 'How good the looks were: the expected goals a shot, against the league’s there',
    value: (r) => ratio(r['xg'], att(r)),
    league: (_, c) => leagueRate(c, 'xg', 'att'),
    n: att,
    format: thou,
    sd: 0.02,
    noun,
    // (a goalie doesn't pick his shots: harder or easier, neither good)
    ...(goalie ? { scale: 'lean' as const, ends: ['Easier', 'Harder'] as [string, string] } : {}),
  };
  if (!team) return [gax, onGoal, quality];
  const perGame = (k: 'xg' | 'att', label: string, per: string, title: string, format: (v: number) => string, sd: number): StatSpec => ({
    key: k === 'xg' ? 'xgpg' : 'apg',
    label,
    per,
    title,
    value: (r, c) => ratio(r[k], c.gp),
    league: (_, c) => (c.league && c.leagueGp ? c.league[k] / c.leagueGp : null),
    n: att,
    format,
    sd,
    noun,
  });
  return [
    perGame('xg', 'xG a game', against ? 'xG allowed a game' : 'xG a game', against ? 'Expected goals allowed a game from there, against the league’s average team' : 'Expected goals a game from there, against the league’s average team', dec2, 0.05),
    perGame('att', 'Shots', against ? 'shots allowed a game' : 'shots a game', 'Unblocked shot attempts a game from there, against the league’s average team', (v) => v.toFixed(1), 0.6),
    gax,
    quality,
  ];
}

// The shot mix: a zone's share of the row's shots in the split, against the league's share there (more often or
// less, neither good)
function mixStat(kind: Kind): StatSpec {
  const whose = kind === 'G' ? 'the shots he faced' : kind === 'def' ? 'the shots it allowed' : kind === 'off' ? 'its shots' : 'his shots';
  return {
    key: 'mix',
    label: 'Share',
    per: `share of ${whose}`,
    title: `The share of ${whose} from each zone, against the league's`,
    value: (r, c) => ratio(att(r), c.total),
    league: (_, c) => (c.league && c.leagueTotal ? att(c.league) / c.leagueTotal : null),
    n: att,
    format: pct,
    sd: 0.03,
    noun: 'shots',
    scale: 'lean',
    ends: ['Less often', 'More often'],
  };
}

// ---- the spreads: a cell's across the rows of its kind with enough of a sample (kept with the part)

const SPREADS = new WeakMap<object, Map<string, (number | null)[]>>();
interface KindRow {
  rows: Row[] | undefined;
  gp: number;
}
function spreads(key: object, id: string, list: KindRow[], spec: StatSpec, minN: number, ctx: (i: number, row: KindRow) => Ctx): (number | null)[] {
  let known = SPREADS.get(key);
  if (!known) SPREADS.set(key, (known = new Map()));
  if (!known.has(id)) {
    known.set(
      id,
      ZONE_IDS.map((_, i) => tintScale(list.map((r) => (r.rows?.[i] && spec.n(r.rows[i]) >= minN ? spec.value(r.rows[i], ctx(i, r)) : null)))?.sd ?? null),
    );
  }
  return known.get(id)!;
}

// ---- a map's cells

interface Source {
  part: Part;
  // (the skaters' rows: his group's file)
  skaters: Record<string, Entry> | null;
  teams: Record<string, string>;
}

// The row's entry and its kind: a skater's by his NHL id, a goalie's, a team's offense or (its Defense side)
// defense by its logo's abbreviation (a coach's card reads as his team)
function subject(src: Source, player: SkillPlayer, position: string, side: string | null): { entry: Entry | undefined; kind: Kind } | null {
  if (SKATERS.includes(position)) return { entry: src.skaters?.[String(player.gsisId)], kind: position === 'D' ? 'D' : 'F' };
  if (position === 'G') return { entry: src.part.goalies[String(player.gsisId)], kind: 'G' };
  if (!TEAMS.includes(position)) return null;
  const abbr = siteTeam(logoAbbr(player.teamLogo) ?? '', src.teams) ?? logoAbbr(player.teamLogo);
  const def = side === 'defense';
  return { entry: abbr ? (def ? src.part.defense : src.part.offense)[abbr] : undefined, kind: def ? 'def' : 'off' };
}
function kindEntries(src: Source, kind: Kind): Entry[] {
  if (kind === 'F' || kind === 'D') return Object.values(src.skaters ?? {});
  if (kind === 'G') return Object.values(src.part.goalies);
  return Object.values(kind === 'def' ? src.part.defense : src.part.offense);
}

const sumOf = (rows: Row[] | undefined, key: string) => (rows ?? []).reduce((a, r) => a + (r[key] ?? 0), 0);

function cellsOf(rows: Row[], league: Row[] | undefined, spec: StatSpec, sds: (number | null)[], gp: number, leagueGp: number): HeatCell[] {
  const total = sumOf(rows, 'att');
  const leagueTotal = sumOf(league, 'att');
  return ZONE_IDS.map((id, i) => {
    const r = rows[i];
    const ctx: Ctx = { league: league?.[i], gp, leagueGp, total, leagueTotal };
    const n = spec.n(r);
    return {
      id,
      n,
      made: spec.made && n ? spec.made(r) : undefined,
      value: n ? spec.value(r, ctx) : null,
      league: spec.league(r, ctx),
      sd: (spec.noise ? spec.noise(r) : null) ?? sds[i],
      detail: n && spec.detail ? spec.detail(r) : undefined,
    };
  });
}

const toStat = (spec: StatSpec, minN: number): HeatStat => ({
  key: spec.key,
  label: spec.label,
  per: spec.per,
  format: spec.format,
  sd: spec.sd,
  minN,
  scale: spec.scale,
  ends: spec.ends,
  noun: spec.noun,
  sample: spec.sample,
  vs: spec.vs,
});

// (a cell's sample floor: a skater's few shots a zone, a goalie's and a team's more; the rebounds' lower,
// there are fewer of them; a share's lowest, it's the whole season's mix)
function floor(kind: Kind, split: string, onGoal = false): number {
  const base = kind === 'G' ? 15 : kind === 'off' || kind === 'def' ? 25 : 8;
  const thin = split === 'reb' ? 0.6 : 1;
  return Math.max(4, Math.round(base * thin * (onGoal ? 0.8 : 1)));
}

// ---- the splits

const splitList = (against: boolean): HeatSplit[] => [
  { id: 'all', label: 'All', title: 'Every situation, the whole season' },
  { id: 'ev', label: '5v5', title: 'Five on five' },
  against ? { id: 'pp', label: 'PK', title: 'On the penalty kill: the other side’s power play' } : { id: 'pp', label: 'PP', title: 'On the power play' },
  { id: 'reb', label: 'Rebounds', title: 'Rebounds: shots within a few seconds of another shot (MoneyPuck)' },
  { id: 'post', label: 'Playoffs', title: 'The playoffs, every situation' },
];
const TEAM_SIDES: HeatSplit[] = [
  { id: 'offense', label: 'Offense', title: 'Its shots' },
  { id: 'defense', label: 'Defense', title: 'What it allowed' },
];
// (a goalie's shot types, kept for every situation together: the whole season's, and the playoffs')
const TYPE_SPLITS = ['all', 'post'];

export interface NhlHeatContext {
  // (whether a season is the one being played: its files sit at the top of data/)
  current: (season: number) => boolean;
}

// A map's cells from one season's files: the season showing's, and the same row's last season's behind its
// thin cells
interface Built {
  cells: HeatCell[] | null;
  rows: Row[] | undefined;
  league: Row[] | undefined;
  entry: Entry | undefined;
  total: number;
}

// (a season's name in the fallback's notes: "2025-26")
const seasonLabel = (season: number) => `${season - 1}-${String(season % 100).padStart(2, '0')}`;

export function nhlHeatMaps({ current }: NhlHeatContext): HeatMapDef[] {
  // (the season's sources for a row: the main file, and a skater's group's)
  const source = async (q: HeatQuery, season = q.season): Promise<Source | null> => {
    const now = current(season);
    const file = await heatFile(season, now);
    const part = file ? heatPart(file, q.split) : null;
    if (!file || !part) return null;
    const group = SKATERS.includes(q.position) ? (q.position === 'D' ? 'defense' : 'forwards') : null;
    const sk = group ? await skaterFile(season, now, group) : null;
    return { part, skaters: sk ? skaterPart(sk, q.split) : null, teams: file.teams };
  };
  // (last season's for the season being played's: the same split; none for the playoffs or a past season,
  // whose cells are what they'll be)
  const lastSeason = async (q: HeatQuery) => (current(q.season) && q.split !== 'post' ? source(q, q.season - 1) : null);
  const splits = (against: (side?: string | null) => boolean) => (season: number, side?: string | null) => {
    const known = heatSplitsKnown(season);
    const playoffs = known ? known.has('post') : !current(season);
    return splitList(against(side)).filter((s) => playoffs || s.id !== 'post');
  };
  const sides = (position: string) => (TEAMS.includes(position) ? TEAM_SIDES : []);

  // A row's cells in a stat (pick: its rows in the split, or by shot type)
  const build = (src: Source, q: HeatQuery, spec: StatSpec, minN: number, pick: (e: Entry | undefined) => Row[] | undefined, spreadId: string): Built => {
    const who = subject(src, q.player, q.position, q.side);
    if (!who) return { cells: null, rows: undefined, league: undefined, entry: undefined, total: 0 };
    const rows = pick(who.entry);
    const league = pick(src.part.league);
    const leagueGp = src.part.league.gp;
    const leagueTotal = sumOf(league, 'att');
    const ctx = (i: number, r: KindRow): Ctx => ({ league: league?.[i], gp: r.gp, leagueGp, total: sumOf(r.rows, 'att'), leagueTotal });
    // (the spreads across his kind: a forward's among the forwards, a defenseman's among the defensemen)
    const sds = spec.noise ? ZONE_IDS.map(() => null) : spreads(src.skaters ?? src.part, `${spreadId}/${who.kind}/${spec.key}`, kindEntries(src, who.kind).map((e) => ({ rows: pick(e), gp: e.gp })), spec, minN, ctx);
    const cells = rows ? cellsOf(rows, league, spec, sds, who.entry?.gp ?? 0, leagueGp) : null;
    return { cells, rows, league, entry: who.entry, total: sumOf(rows, 'att') };
  };
  const fallbackOf = (q: HeatQuery, last: Built | null): Pick<HeatMapData, 'fallback' | 'fallbackLabel' | 'seasonLabel'> =>
    last?.cells && last.total ? { fallback: last.cells, fallbackLabel: seasonLabel(q.season - 1), seasonLabel: seasonLabel(q.season) } : {};
  const empty = () => ZONE_IDS.map((id) => ({ id, n: 0, value: null, league: null }));
  const scopeOf = (split: string, against: boolean) => (split === 'all' ? '' : split === 'post' ? ' (playoffs)' : ` (${splitList(against).find((s) => s.id === split)?.label ?? split})`);

  // The zones: a skater's shots, a goalie's faced, a team's for or against
  const zones = (id: string, positions: string[], against: (side?: string | null) => boolean): HeatMapDef => ({
    id,
    positions,
    surface: 'rink',
    splits: splits(against),
    sides,
    firstSeason: 2009,
    numbers: true,
    load: async (q) => {
      const src = await source(q);
      const who = src && subject(src, q.player, q.position, q.side);
      if (!src || !who) return null;
      const all = statsFor(who.kind).filter((s) => !s.onGoal || q.split !== 'reb');
      const spec = all.find((s) => s.key === q.stat) ?? all[0];
      const minN = floor(who.kind, q.split, !!spec.onGoal);
      const pick = (e: Entry | undefined) => splitRows(e, q.split);
      const now = build(src, q, spec, minN, pick, `zones/${q.split}`);
      const prior = await lastSeason(q);
      const last = prior ? build(prior, q, spec, minN, pick, `zones/${q.split}`) : null;
      if (!now.total && !last?.total) return null;
      const goalie = who.kind === 'G';
      const def = who.kind === 'def';
      const team = def || who.kind === 'off';
      return {
        surface: 'rink',
        title: goalie ? 'Saves by Zone' : def ? 'Shots Against by Zone' : team ? 'Shots For by Zone' : 'Shooting by Zone',
        count: `${plural(now.total, 'shot')}${goalie ? ' faced' : def ? ' against' : ''}${scopeOf(q.split, goalie || def)}`,
        help:
          (goalie ? 'The unblocked shots he faced' : def ? 'The unblocked shots it allowed' : team ? 'Its unblocked shots' : 'His unblocked shots') +
          ', by where they came from (MoneyPuck’s shot locations), looking at the net from the blue line. Each zone against ' +
          (spec.vs === 'expected' ? 'what the shots were expected to do (their expected goals)' : spec.vs === 'average' ? (goalie ? 'an average goalie' : 'an average shooter') + ' on the same shots (their expected goals, as the league does from there)' : team ? 'the league’s average team' : 'the league') +
          '; a zone short of the sample greyed. Empty-net shots left out',
        stats: all.map((s) => ({ key: s.key, label: s.label, title: s.title })),
        stat: toStat(spec, minN),
        cells: now.cells ?? empty(),
        defense: def,
        chips: zoneChips(who.kind, now, q.split, src, team ? xgShare(src, q) : null),
        chipsTitle: goalie ? 'In Net' : def ? 'Shots Against' : team ? 'Its Shots' : 'His Shots',
        ...fallbackOf(q, last),
      } satisfies HeatMapData;
    },
  });

  // The shot mix beside it: where the shots came from against the league's mix (a goalie's in a situation's
  // split, where his shot types aren't kept)
  const mix = (id: string, positions: string[], against: (side?: string | null) => boolean, when: (split: string) => boolean): HeatMapDef => ({
    id,
    positions,
    surface: 'rink',
    splits: splits(against),
    sides,
    firstSeason: 2009,
    numbers: true,
    load: async (q) => {
      if (!when(q.split)) return null;
      const src = await source(q);
      const who = src && subject(src, q.player, q.position, q.side);
      if (!src || !who) return null;
      const spec = mixStat(who.kind);
      const minN = 1;
      const pick = (e: Entry | undefined) => splitRows(e, q.split);
      const now = build(src, q, spec, minN, pick, `mix/${q.split}`);
      const prior = await lastSeason(q);
      const last = prior ? build(prior, q, spec, minN, pick, `mix/${q.split}`) : null;
      if (!now.total && !last?.total) return null;
      const goalie = who.kind === 'G';
      const def = who.kind === 'def';
      return {
        surface: 'rink',
        title: goalie ? 'Shots Faced' : def ? 'Where It Allows' : 'Shot Mix',
        count: `vs the league’s mix${scopeOf(q.split, goalie || def)}`,
        help: `${spec.title}: lavender where more of them came from than the league's do, amber where fewer; a share is the whole split's, so no zone is greyed`,
        stats: [{ key: spec.key, label: spec.label, title: spec.title }],
        stat: toStat(spec, minN),
        // (no fallback: early in a season the mix is this season's few shots, and says so by its count)
        cells: now.cells ?? empty(),
        defense: false,
      } satisfies HeatMapData;
    },
  });

  // A goalie's by shot type (the whole season or the playoffs, every situation): goals saved above expected
  const types: HeatMapDef = {
    id: 'types',
    positions: ['G'],
    surface: 'rink',
    splits: splits(() => true),
    firstSeason: 2009,
    numbers: true,
    load: async (q) => {
      if (!TYPE_SPLITS.includes(q.split)) return null;
      const src = await source(q);
      if (!src) return null;
      const type = SHOT_TYPES.find((t) => t.key === q.stat) ?? SHOT_TYPES[0];
      const spec = { ...statsFor('G')[0], key: type.key, label: type.label, title: type.title };
      const minN = 10;
      const pick = (e: Entry | undefined) => e?.ty?.[type.key];
      const now = build(src, q, spec, minN, pick, 'types');
      const prior = await lastSeason(q);
      const last = prior ? build(prior, q, spec, minN, pick, 'types') : null;
      // (a goalie with too few shots for his types: none kept, no map)
      if (!now.total && !last?.total) return null;
      return {
        surface: 'rink',
        title: 'By Shot Type',
        count: `${plural(now.total, 'shot')} faced${q.split === 'post' ? ' (playoffs)' : ''}`,
        help: 'Goals saved above expected on one kind of shot at a time (wrist and snap shots, slap shots, tips and deflections, backhands and wraparounds), by where they came from; a zone short of the sample greyed',
        stats: SHOT_TYPES.map((t) => ({ key: t.key, label: t.label, title: t.title })),
        stat: { ...toStat(spec, minN), per: `GSAx on ${type.label.toLowerCase()}` },
        cells: now.cells ?? empty(),
        defense: false,
        ...fallbackOf(q, last),
      } satisfies HeatMapData;
    },
  };
  // (a team's share of the expected goals in its games, in the split: its offense's against its defense's)
  const xgShare = (src: Source, q: HeatQuery): number | null => {
    const abbr = siteTeam(logoAbbr(q.player.teamLogo) ?? '', src.teams) ?? logoAbbr(q.player.teamLogo);
    if (!abbr) return null;
    const [f, a] = [sumOf(splitRows(src.part.offense[abbr], q.split), 'xg'), sumOf(splitRows(src.part.defense[abbr], q.split), 'xg')];
    return f + a ? f / (f + a) : null;
  };
  const defense = (side?: string | null) => side === 'defense';
  return [
    zones('shots', [...SKATERS, ...TEAMS], defense),
    zones('saves', ['G'], () => true),
    types,
    mix('mix', [...SKATERS, ...TEAMS], defense, () => true),
    mix('faced', ['G'], () => true, (split) => !TYPE_SPLITS.includes(split)),
  ];
}

// (the splits a season's file has, once it's in: the playoffs only with playoff games)
export function heatSplitsKnown(season: number): Set<string> | null {
  if (!loaded.has(season)) return null;
  const file = loaded.get(season);
  return new Set(splitList(false).map((s) => s.id).filter((id) => id !== 'post' || !!file?.post));
}

// ---- the numbers beside the maps: the row's whole split, against the league's

const INSIDE = ['slot', 'crease'].map((id) => ZONE_IDS.indexOf(id));
export function zoneChips(kind: Kind, built: Pick<Built, 'rows' | 'league' | 'entry'>, split: string, src: Pick<Source, 'part'>, share: number | null = null): HeatChip[] {
  const rows = built.rows;
  const total = sumOf(rows, 'att');
  if (!rows || !total) return [];
  const goalie = kind === 'G';
  const def = kind === 'def';
  const team = def || kind === 'off';
  const flip = def ? -1 : 1;
  const sum = (key: string, list = rows) => sumOf(list, key);
  const [g, xg, shots] = [sum('g'), sum('xg'), sum('sog')];
  const lg = built.league;
  const chips: HeatChip[] = [];
  const noise = luck({ att: total, xg, g, sog: shots }) ?? 1;
  const onGoal = split !== 'reb';
  // (a team's headline: its share of the expected goals in its games)
  if (share !== null)
    chips.push({
      label: 'xG share',
      value: pct1(share),
      sub: 'of the expected goals, both ends',
      tone: clampTone((share - 0.5) / 0.04 / 2),
      title: 'Its expected goals as a share of both sides’ in its games (xGF%)',
    });
  // (finishing or goaltending: goals against their expected goals, by their luck)
  const gax = goalie ? xg - g : g - xg;
  chips.push({
    label: goalie ? 'GSAx' : def ? 'Goals vs xG against' : 'Goals vs xG',
    value: signed1(gax),
    sub: `${g} goal${g === 1 ? '' : 's'}${goalie || def ? ' allowed' : ''} on ${xgText(xg)} xG`,
    tone: clampTone(((goalie ? 1 : flip) * gax) / noise / 2),
    title: goalie ? 'Goals saved above expected: the expected goals of the shots he faced, less the goals he allowed' : def ? 'Goals allowed against the expected goals of the shots: its goaltending' : 'Goals against the expected goals of the shots: finishing',
  });
  if (onGoal && shots) {
    const rate = goalie ? 1 - g / shots : g / shots;
    const exp = goalie ? 1 - xg / shots : xg / shots;
    chips.push({
      label: goalie ? 'Save %' : def ? 'Shooting % against' : 'Shooting %',
      value: goalie ? thou(rate) : pct1(rate),
      sub: `expected ${goalie ? thou(exp) : pct1(exp)}`,
      tone: clampTone(((goalie ? 1 : flip) * (rate - exp)) / (noise / shots) / 2),
      title: goalie ? 'Save % on shots on goal, against what his shots were expected to allow' : 'Goals a shot on goal, against what the shots were expected to go in at',
    });
  }
  if (team && built.entry?.gp) {
    const gp = built.entry.gp;
    const lgGp = src.part.league.gp;
    const per = xg / gp;
    const lgPer = lgGp ? sum('xg', lg) / lgGp : null;
    chips.push({
      label: def ? 'xG allowed a game' : 'xG a game',
      value: dec2(per),
      sub: lgPer !== null ? `league ${dec2(lgPer)}` : `${gp} games`,
      tone: lgPer ? clampTone((flip * (per - lgPer)) / (lgPer * 0.12) / 2) : 0,
      title: `${def ? 'Expected goals allowed' : 'Expected goals'} a game, in ${gp} games`,
    });
  }
  // (from in close: the slot and the crease)
  const inside = INSIDE.reduce((a, i) => a + (rows[i]?.['att'] ?? 0), 0);
  const lgTotal = sum('att', lg);
  const lgInside = INSIDE.reduce((a, i) => a + (lg?.[i]?.['att'] ?? 0), 0);
  if (goalie) {
    const insideG = INSIDE.reduce((a, i) => a + (rows[i]?.['g'] ?? 0), 0);
    const insideXg = INSIDE.reduce((a, i) => a + (rows[i]?.['xg'] ?? 0), 0);
    if (inside)
      chips.push({
        label: 'GSAx in close',
        value: signed1(insideXg - insideG),
        sub: `${plural(inside, 'shot')} from the slot`,
        tone: clampTone((insideXg - insideG) / (luck({ att: inside, xg: insideXg, g: insideG, sog: 0 }) ?? 1) / 2),
        title: 'Goals saved above expected on the shots from the slot and the crease',
      });
  } else {
    const share = inside / total;
    const lgShare = lgTotal ? lgInside / lgTotal : null;
    chips.push({
      label: def ? 'Allowed in close' : 'From in close',
      value: pct(share),
      sub: lgShare !== null ? `league ${pct(lgShare)}` : `${inside} of ${total}`,
      tone: lgShare !== null ? clampTone((flip * (share - lgShare)) / 0.06 / 2) : 0,
      title: `The share of ${def ? 'the shots it allowed' : team ? 'its shots' : 'his shots'} from the slot and the crease`,
    });
  }
  const quality = xg / total;
  const lgQuality = lgTotal ? sum('xg', lg) / lgTotal : null;
  chips.push({
    label: goalie ? 'xG a shot faced' : def ? 'xG a shot allowed' : 'xG a shot',
    value: thou(quality),
    sub: lgQuality !== null ? `league ${thou(lgQuality)}` : '',
    tone: goalie || lgQuality === null ? 0 : clampTone((flip * (quality - lgQuality)) / 0.02 / 2),
    title: goalie ? 'How hard the shots he faced were: their expected goals a shot' : 'How good the looks were: their expected goals a shot',
  });
  // (the rebounds, in a split that isn't theirs)
  const rebounds = sum('rebAtt');
  if (onGoal && rebounds) {
    const [rg, rxg] = [sum('rebG'), sum('rebXg')];
    chips.push({
      label: goalie || def ? 'Rebounds against' : 'Rebounds',
      value: String(rebounds),
      sub: goalie ? `${signed1(rxg - rg)} GSAx on them` : `${rg} goal${rg === 1 ? '' : 's'} on ${xgText(rxg)} xG`,
      tone: 0,
      title: `Rebound shots${goalie || def ? ' faced' : ''}: ${pct(rebounds / total)} of the shots`,
    });
  }
  return chips;
}

// ---- the AI preview's matchup maps

// The compact matchup maps on a team's AI preview (the whole season, every situation, xG a game): its chances
// against what the next opponent allows there, and the opponent's chances against what it allows. In the
// season being played, each side's own last season behind its thin zones, faded, so the maps show from the
// first weeks
export async function heatMatchups(player: SkillPlayer, position: string, season: number, opponent: string, current: boolean): Promise<HeatMatchup[]> {
  if (!TEAMS.includes(position)) return [];
  const file = await heatFile(season, current);
  const part = file && heatPart(file, 'all');
  if (!file || !part) return [];
  const lastFile = current ? await heatFile(season - 1, false) : null;
  const lastPart = lastFile && heatPart(lastFile, 'all');
  const own = siteTeam(logoAbbr(player.teamLogo) ?? '', file.teams) ?? logoAbbr(player.teamLogo);
  const opp = siteTeam(opponent, file.teams);
  if (!own || !opp) return [];
  const minN = 25;
  type Side = 'offense' | 'defense';
  const cellsFor = (p: Part, side: Side, abbr: string) => {
    const kind: Kind = side === 'defense' ? 'def' : 'off';
    const spec = statsFor(kind)[0];
    const e = p[side][abbr];
    const rows = splitRows(e, 'all');
    if (!e || !rows || !sumOf(rows, 'att')) return null;
    const league = splitRows(p.league, 'all');
    const leagueTotal = sumOf(league, 'att');
    const ctx = (i: number, r: KindRow): Ctx => ({ league: league?.[i], gp: r.gp, leagueGp: p.league.gp, total: sumOf(r.rows, 'att'), leagueTotal });
    const sds = spreads(p, `matchup/${kind}`, Object.values(p[side]).map((x) => ({ rows: splitRows(x, 'all'), gp: x.gp })), spec, minN, ctx);
    return cellsOf(rows, league, spec, sds, e.gp, p.league.gp);
  };
  const name = (abbr: string) => nickname(file.teams[abbr], abbr);
  const make = (title: string, caption: string, mine: [Side, string], theirs: [Side, string], defense: boolean): HeatMatchup | null => {
    const cells = cellsFor(part, ...mine);
    const overlay = cellsFor(part, ...theirs);
    const fallback = lastPart ? cellsFor(lastPart, ...mine) : null;
    const overlayFallback = lastPart ? cellsFor(lastPart, ...theirs) : null;
    if ((!cells && !fallback) || (!overlay && !overlayFallback)) return null;
    const none = ZONE_IDS.map((id) => ({ id, n: 0, value: null, league: null }));
    const stat = { ...toStat(statsFor(defense ? 'def' : 'off')[0], minN), per: 'xG a game' };
    const a = cells ?? none;
    const b = overlay ?? none;
    // (only with something to say: at least six zones with a sample on both sides, last season's where this
    // one's is thin)
    const shown = a.filter((c, i) => {
      const p = pickPair(c, fallback?.[i], stat, b[i], overlayFallback?.[i]);
      return p.own.cell.n >= minN && !!p.opp && p.opp.cell.n >= minN;
    });
    if (shown.length < 6) return null;
    return {
      title,
      caption,
      cells: a,
      overlay: b,
      overlayLabel: defense ? `${opponent}'s shots` : `${opponent}'s D`,
      surface: 'rink',
      stat,
      defense,
      ...(fallback || overlayFallback ? { fallback, overlayFallback, fallbackLabel: seasonLabel(season - 1), seasonLabel: seasonLabel(season) } : {}),
    };
  };
  return [
    make(`${name(own)} chances vs ${name(opp)} D`, `Where its chances come from, against what ${opponent} allows there`, ['offense', own], ['defense', opp], false),
    make(`${name(opp)} chances vs ${name(own)} D`, `What it allows, against where ${opponent}'s chances come from`, ['defense', own], ['offense', opp], true),
  ].filter((m): m is HeatMatchup => !!m);
}
