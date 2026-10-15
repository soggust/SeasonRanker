import type { SkillPlayer } from './positions';
import { tintScale } from '@ranker/core/value-tint';
import type { HeatCell, HeatChip, HeatMapData, HeatMapDef, HeatMatchup, HeatQuery, HeatSplit, HeatStat } from '@ranker/engine/heat-map/heat-map.model';
import { pickPair } from '@ranker/engine/heat-map/heat-color';
import { COURT_ZONES, COURT_WORDS } from '@ranker/engine/heat-map/surfaces/half-court';
import { seasonName } from './awards';

// The NBA's Heat Maps (SPORT.heatMaps, the card's Heat Maps tab), from heat-maps.json (scripts/shot-zones.mjs:
// data/heat-maps.json for the season being played, data/seasons/<year>/heat-maps.json before it, from 2003-04
// on): every shot from the floor in the standard zones on a half court (the restricted area, the paint,
// mid-range by angle, the corner threes, the threes above the break)
//   shot chart   a player's, a team's (its Offense), or what a team allowed (its Defense): FG% in each zone
//                against the league's there, or how often he shoots from it against how often the league does
//   assist map   where a passer's assists became shots: his assists' mix against the league's
// beside them the shot profile's numbers (FG%, eFG%, at the rim, threes, the corners, mid-range, assisted);
// and the AI preview's matchup maps (the team's shots against the next opponent's defense, and theirs against
// its own). Splits: Season, REG and POST (with playoffs), Last 10 (each row's last 10 games) and Clutch (the
// NBA's: the last five minutes of the fourth or overtime, within 5). Early in the season being played, a
// zone under its sample shows the same row's own last season behind it, faded (the component's fallback).
// The file keeps sums, the regular season's and the playoffs' apart, so the whole season is the two added up.

type Tuple = number[] | 0;
interface PackedRow {
  s: Tuple;
  c?: number[];
  a?: number[];
  am?: number;
  g: number;
}
interface PackedPart {
  league: PackedRow;
  players: Record<string, PackedRow>;
  offenses: Record<string, PackedRow>;
  defenses: Record<string, PackedRow>;
}
export interface PackedNbaHeatFile {
  season: number;
  fields: { zone: string[] };
  games: number;
  shots: number;
  regular: PackedPart | null;
  post: PackedPart | null;
  l10: { players: Record<string, Tuple>; offenses: Record<string, Tuple>; defenses: Record<string, Tuple> };
}

// A zone's shots: tried, made
export interface Zone {
  att: number;
  made: number;
}
// A row read back: its zones (the surface's order), its clutch zones, its assists by where they became shots,
// its assisted makes and its games
export interface ShotEntry {
  s: Zone[];
  c: Zone[];
  a: number[];
  am: number;
  g: number;
}
export interface ShotPart {
  league: ShotEntry;
  players: Record<string, ShotEntry>;
  offenses: Record<string, ShotEntry>;
  defenses: Record<string, ShotEntry>;
}
export interface NbaHeatFile {
  season: number;
  games: number;
  regular: ShotPart | null;
  post: ShotPart | null;
  l10: { players: Record<string, Zone[]>; offenses: Record<string, Zone[]>; defenses: Record<string, Zone[]> };
}

// (the first season with ESPN's shot spots: 2003-04, shot-zones.mjs's FIRST_SEASON)
export const FIRST_SEASON = 2004;

export const ZONE_IDS: string[] = [...COURT_ZONES];
const Z = ZONE_IDS.length;
const THREES = ZONE_IDS.map((id) => !!COURT_WORDS[id as keyof typeof COURT_WORDS].three);

// ---- the file read back (its zones by the file's own order, put in the surface's)

export function expandNbaHeat(file: PackedNbaHeatFile): NbaHeatFile {
  const at = ZONE_IDS.map((id) => file.fields.zone.indexOf(id));
  const zones = (t: Tuple | undefined): Zone[] => at.map((i) => (t && i >= 0 ? { att: t[i * 2] ?? 0, made: t[i * 2 + 1] ?? 0 } : { att: 0, made: 0 }));
  const counts = (t: number[] | undefined): number[] => at.map((i) => (t && i >= 0 ? (t[i] ?? 0) : 0));
  const entry = (r: PackedRow): ShotEntry => ({ s: zones(r.s), c: zones(r.c), a: counts(r.a), am: r.am ?? 0, g: r.g ?? 0 });
  const all = (rows: Record<string, PackedRow> | undefined) => Object.fromEntries(Object.entries(rows ?? {}).map(([id, r]) => [id, entry(r)]));
  const part = (p: PackedPart | null): ShotPart | null => p && { league: entry(p.league), players: all(p.players), offenses: all(p.offenses), defenses: all(p.defenses) };
  const tuples = (rows: Record<string, Tuple> | undefined) => Object.fromEntries(Object.entries(rows ?? {}).map(([id, t]) => [id, zones(t)]));
  return {
    season: file.season,
    games: file.games ?? 0,
    regular: part(file.regular),
    post: part(file.post),
    l10: { players: tuples(file.l10?.players), offenses: tuples(file.l10?.offenses), defenses: tuples(file.l10?.defenses) },
  };
}

// (two parts added up: the whole season)
const addZones = (a: Zone[], b: Zone[]) => a.map((z, i) => ({ att: z.att + b[i].att, made: z.made + b[i].made }));
export function addShotEntries(a: ShotEntry | undefined, b: ShotEntry | undefined): ShotEntry | undefined {
  if (!a || !b) return a ?? b;
  return { s: addZones(a.s, b.s), c: addZones(a.c, b.c), a: a.a.map((n, i) => n + b.a[i]), am: a.am + b.am, g: a.g + b.g };
}
function addParts(a: ShotPart | null, b: ShotPart | null): ShotPart | null {
  if (!a || !b) return a ?? b;
  const merge = (x: Record<string, ShotEntry>, y: Record<string, ShotEntry>) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((id) => [id, addShotEntries(x[id], y[id])!]));
  return { league: addShotEntries(a.league, b.league)!, players: merge(a.players, b.players), offenses: merge(a.offenses, b.offenses), defenses: merge(a.defenses, b.defenses) };
}

const wholeSeason = new WeakMap<NbaHeatFile, ShotPart | null>();
// A split's part: the regular season, the playoffs, or both (the whole season: Last 10's league and Clutch's
// are in it)
export function shotPart(file: NbaHeatFile, split: string): ShotPart | null {
  if (split === 'regular') return file.regular;
  if (split === 'post') return file.post;
  if (!wholeSeason.has(file)) wholeSeason.set(file, addParts(file.regular, file.post));
  return wholeSeason.get(file)!;
}

// ---- the files, once a season

const files = new Map<number, Promise<NbaHeatFile | null>>();
const loaded = new Map<number, NbaHeatFile | null>();
export function nbaHeatFile(season: number, current: boolean): Promise<NbaHeatFile | null> {
  let file = files.get(season);
  if (!file) {
    const path = current ? 'data/heat-maps.json' : `data/seasons/${season}/heat-maps.json`;
    file = fetch(path, { cache: current ? 'no-cache' : 'default' })
      .then(async (res) => (res.ok ? (await res.json()) as PackedNbaHeatFile : null))
      // (the top file is the season being played's: one left from the season before a rollover isn't it)
      .then((f) => (f && f.season === season ? expandNbaHeat(f) : null))
      .catch(() => null)
      .then((f) => {
        loaded.set(season, f);
        return f;
      });
    files.set(season, file);
  }
  return file;
}

// ---- the stats

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const ratio = (a: number, b: number) => (b ? a / b : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const sumAtt = (zones: Zone[]) => zones.reduce((a, z) => a + z.att, 0);
const sumMade = (zones: Zone[]) => zones.reduce((a, z) => a + z.made, 0);

// (what a card's row is on the heat maps: a team's coach reads as the team)
type Role = 'player' | 'team';
const PLAYERS = ['PG', 'SG', 'SF', 'PF', 'C', 'TOP'];
const roleOf = (position: string): Role | null => (PLAYERS.includes(position) ? 'player' : position === 'TM' || position === 'HC' ? 'team' : null);
// (which rows a zone's spread is measured across)
type Kind = 'player' | 'off' | 'def';

const SPLITS: HeatSplit[] = [
  { id: 'all', label: 'Season', title: 'The regular season and the playoffs' },
  { id: 'regular', label: 'REG', title: 'The regular season' },
  { id: 'post', label: 'POST', title: 'The playoffs' },
  { id: 'l10', label: 'Last 10', title: 'The last 10 games of the season (playoffs in)' },
  { id: 'clutch', label: 'Clutch', title: "The NBA's clutch: the last five minutes of the fourth quarter or overtime, the score within 5 (the whole season)" },
];
const SIDES_OF_A_TEAM: HeatSplit[] = [
  { id: 'offense', label: 'Offense', title: 'Its shots' },
  { id: 'defense', label: 'Defense', title: "What it allowed: its opponents' shots" },
];

// A zone stat: its value from the zone (and the row's whole), how it reads, its fallback spread
interface StatSpec {
  key: string;
  label: string;
  per: string;
  title: string;
  scale?: HeatStat['scale'];
  ends?: [string, string];
  sd: number;
}
const FG: StatSpec = { key: 'fg', label: 'FG%', per: 'FG%', title: 'Field-goal percentage in the zone, against the league there', sd: 0.08 };
const FREQ: StatSpec = { key: 'freq', label: 'Frequency', per: 'share of the shots', title: "The zone's share of the shots, against the league's share there", scale: 'lean', ends: ['Less often', 'More often'], sd: 0.04 };
const MIX: StatSpec = { key: 'mix', label: 'Assist mix', per: 'share of the assists', title: "The zone's share of the assists, against the league's share there", scale: 'lean', ends: ['Less often', 'More often'], sd: 0.05 };

// A row's zone cells in a stat: FG% (made over tried), or a share of its shots (or assists) there
function cellsOf(zones: Zone[], league: Zone[], spec: StatSpec, sds: (number | null)[]): HeatCell[] {
  const total = sumAtt(zones);
  const leagueTotal = sumAtt(league);
  return ZONE_IDS.map((id, i) => {
    const z = zones[i];
    const lg = league[i];
    if (spec.key === 'fg') return { id, n: z.att, made: z.made, value: ratio(z.made, z.att), league: ratio(lg.made, lg.att), sd: sds[i] };
    return { id, n: z.att, value: ratio(z.att, total), league: ratio(lg.att, leagueTotal), sd: sds[i], detail: [`${z.att} of ${plural(total, spec.key === 'mix' ? 'assist' : 'shot')}`] };
  });
}
// (assists as zones: their counts as the tried, so the frequency's reading serves them)
const asZones = (counts: number[]): Zone[] => counts.map((n) => ({ att: n, made: 0 }));

// ---- the spreads: a zone's across the rows of its kind with enough of a sample, kept with the file

const SPREADS = new WeakMap<object, Map<string, (number | null)[]>>();
function spreads(owner: object, key: string, rows: Zone[][], spec: StatSpec, minN: number): (number | null)[] {
  let known = SPREADS.get(owner);
  if (!known) SPREADS.set(owner, (known = new Map()));
  if (!known.has(key)) {
    const values = (i: number) =>
      rows.map((r) => {
        const total = sumAtt(r);
        if (spec.key === 'fg') return r[i].att >= minN ? r[i].made / r[i].att : null;
        // (a share: across the rows with a real sample of their own)
        return total >= minN * 6 ? r[i].att / total : null;
      });
    known.set(
      key,
      ZONE_IDS.map((_, i) => tintScale(values(i))?.sd ?? null),
    );
  }
  return known.get(key)!;
}

// ---- a row's entries

// (a team row's code, its icon's: "assets/NBA_Icons/BOS.svg" -> "BOS")
export const teamCodeOf = (player: SkillPlayer): string | null => /([A-Z]{2,4})\.svg$/.exec(player.teamLogo ?? '')?.[1] ?? null;
// ESPN's abbreviations (the analysis's opponents) -> the site's codes (box-scores.mjs's ESPN_CODE)
const ESPN_CODE: Record<string, string> = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', NOH: 'NOP', NOK: 'NOP', UTAH: 'UTA', WSH: 'WAS', BKN: 'BRK', NJ: 'BRK', CHA: 'CHO', PHX: 'PHO', SEA: 'OKC', VAN: 'MEM' };
export const siteCode = (abbr: string) => ESPN_CODE[abbr] ?? abbr;

// The row's zones for a split: a player's (by his ESPN id), a team's offense or what its defense allowed
interface Subject {
  zones: Zone[] | null;
  assists: number[] | null;
  entry: ShotEntry | undefined;
  kind: Kind;
  defense: boolean;
}
function subject(file: NbaHeatFile, split: string, player: SkillPlayer, role: Role, side: string | null): Subject {
  const defense = role === 'team' && side === 'defense';
  const kind: Kind = role === 'player' ? 'player' : defense ? 'def' : 'off';
  const key = role === 'player' ? String(player.id ?? '') : teamCodeOf(player);
  const group = kind === 'player' ? 'players' : kind === 'def' ? 'defenses' : 'offenses';
  if (!key) return { zones: null, assists: null, entry: undefined, kind, defense };
  if (split === 'l10') {
    const zones = file.l10[group][key];
    return { zones: zones ?? null, assists: null, entry: undefined, kind, defense };
  }
  const part = shotPart(file, split === 'clutch' ? 'all' : split);
  const entry = part?.[group][key];
  if (!entry) return { zones: null, assists: null, entry, kind, defense };
  return { zones: split === 'clutch' ? entry.c : entry.s, assists: split === 'clutch' || kind === 'def' ? null : entry.a, entry, kind, defense };
}
// (every row of a kind's zones for a split: the spreads')
function kindZones(file: NbaHeatFile, split: string, kind: Kind, assists = false): Zone[][] {
  const group = kind === 'player' ? 'players' : kind === 'def' ? 'defenses' : 'offenses';
  if (split === 'l10') return Object.values(file.l10[group]);
  const part = shotPart(file, split === 'clutch' ? 'all' : split);
  return Object.values(part?.[group] ?? {}).map((e) => (assists ? asZones(e.a) : split === 'clutch' ? e.c : e.s));
}
// (the league's zones for a split: Last 10's the whole season's)
function leagueZones(file: NbaHeatFile, split: string, assists = false): Zone[] | null {
  const part = shotPart(file, split === 'l10' || split === 'clutch' ? 'all' : split);
  if (!part) return null;
  return assists ? asZones(part.league.a) : split === 'clutch' ? part.league.c : part.league.s;
}

// A zone's sample floor: a player's or a team's, by split (a team takes many more shots)
function minShots(kind: Kind, split: string): number {
  const team = kind !== 'player';
  if (split === 'clutch') return team ? 8 : 4;
  if (split === 'l10') return team ? 15 : 6;
  if (split === 'post') return team ? 15 : 8;
  return team ? 40 : 12;
}

function toStat(spec: StatSpec, minN: number, noun: string, sample = spec.key === 'fg' ? undefined : 'the count'): HeatStat {
  return { key: spec.key, label: spec.label, per: spec.per, format: spec.key === 'fg' ? pct : pct1, sd: spec.sd, minN, scale: spec.scale, ends: spec.ends, noun, sample };
}

// ---- the shot profile's numbers beside the maps (a team's defense: what it allowed): its accuracy against the
// league's, then where the shots came from (each share's own FG% under it), and how many of the makes were
// assisted (the season's; Last 10 and Clutch, which don't keep it: the threes above the break instead). Always
// eight, so they sit in even rows

function profileChips(zones: Zone[], league: Zone[], entry: ShotEntry | undefined, defense: boolean, split: string): HeatChip[] {
  const att = sumAtt(zones);
  if (!att) return [];
  const lgAtt = sumAtt(league) || 1;
  const idx = (test: (id: string) => boolean) => ZONE_IDS.map((id, i) => (test(id) ? i : -1)).filter((i) => i >= 0);
  const of = (list: Zone[], at: number[]) => at.reduce((x, i) => ({ att: x.att + list[i].att, made: x.made + list[i].made }), { att: 0, made: 0 });
  const threes = idx((id) => THREES[ZONE_IDS.indexOf(id)]);
  const all = idx(() => true);
  const mine = of(zones, all);
  const lg = of(league, all);
  const [my3, lg3] = [of(zones, threes), of(league, threes)];
  const efg = (z: Zone, z3: Zone) => (z.att ? (z.made + 0.5 * z3.made) / z.att : null);
  // (a rate's tone against the league's: span either way is full; a defense's flipped)
  const tone = (v: number | null, l: number | null, span: number) => (v === null || l === null ? 0 : Math.max(-1, Math.min(1, ((v - l) / span) * (defense ? -1 : 1))));
  const allowed = defense ? ' allowed' : '';
  const fg = mine.made / mine.att;
  const lgFg = lg.att ? lg.made / lg.att : null;
  const e = efg(mine, my3);
  const lgE = efg(lg, lg3);
  const chips: HeatChip[] = [
    { label: `FG%${allowed}`, value: pct1(fg), sub: `${mine.made} of ${mine.att}`, tone: tone(fg, lgFg, 0.04), title: `Field goals${allowed}${lgFg !== null ? ` · league ${pct1(lgFg)}` : ''}` },
    { label: `eFG%${allowed}`, value: e === null ? '–' : pct1(e), sub: lgE !== null ? `league ${pct1(lgE)}` : undefined, tone: tone(e, lgE, 0.05), title: 'Effective field-goal percentage: a three counts one and a half' },
  ];
  // (a share of the shots from some zones, their FG% under it)
  const share = (label: string, at: number[], title: string, base = mine.att, lgBase = lgAtt) => {
    const z = of(zones, at);
    chips.push({
      label,
      value: pct(z.att / (base || 1)),
      sub: z.att ? `${pct(z.made / z.att)} on ${z.att.toLocaleString('en-US')}` : 'none',
      tone: 0,
      title: `${title} · league ${pct(of(league, at).att / (lgBase || 1))}`,
    });
  };
  share('At the rim', idx((id) => id === 'ra'), 'Share of the shots in the restricted area');
  share('In the paint', idx((id) => id === 'paint'), 'Share of the shots in the lane outside the restricted area');
  share('Mid-range', idx((id) => id.startsWith('mid-')), 'Share of the shots from mid-range');
  share('Threes', threes, 'Share of the shots from three');
  share('Corner threes', idx((id) => id.startsWith('c3-')), 'Share of the threes from the corners', my3.att, lg3.att);
  const makes = entry ? sumMade(entry.s) : 0;
  if (entry && makes && split !== 'clutch' && split !== 'l10')
    chips.push({ label: `Assisted${defense ? ' allowed' : ''}`, value: pct(entry.am / makes), sub: `${entry.am.toLocaleString('en-US')} of ${makes.toLocaleString('en-US')} makes`, tone: 0, title: 'Share of the makes off an assist' });
  else share('Above the break', idx((id) => id.startsWith('atb-')), 'Share of the threes above the break', my3.att, lg3.att);
  return chips;
}

// (a passer's map only with this many assists: a few say nothing)
const ASSIST_MAP_MIN = 25;

// ---- the maps

export interface NbaHeatContext {
  // (whether a season is the one being played: its file sits at the top of data/; and whether it's under way,
  // for last season's behind the thin zones)
  current: (season: number) => boolean;
  live: (season: number) => boolean;
}

interface Built {
  cells: HeatCell[] | null;
  total: number;
}

export function nbaHeatMaps({ current, live }: NbaHeatContext): HeatMapDef[] {
  const load = async (q: HeatQuery) => {
    const role = roleOf(q.position);
    const file = role ? await nbaHeatFile(q.season, current(q.season)) : null;
    return role && file ? { role, file } : null;
  };
  // (last season's file for the season under way's maps: none for the playoffs or Last 10, whose zones are
  // what they are)
  const lastSeason = async (q: HeatQuery) => (live(q.season) && q.split !== 'post' && q.split !== 'l10' ? nbaHeatFile(q.season - 1, current(q.season - 1)) : null);
  const fallbackOf = (q: HeatQuery, last: Built | null): Pick<HeatMapData, 'fallback' | 'fallbackLabel' | 'seasonLabel'> =>
    last?.cells ? { fallback: last.cells, fallbackLabel: seasonName(q.season - 1), seasonLabel: seasonName(q.season) } : {};
  const teamSides = (position: string) => (roleOf(position) === 'team' ? SIDES_OF_A_TEAM : []);
  // (the splits a season's file has: with no playoff games the season is its regular season, no REG or POST)
  const splits = (season: number) => {
    const file = loaded.get(season);
    const playoffs = file ? !!file.post : !current(season);
    return SPLITS.filter((s) => playoffs || (s.id !== 'post' && s.id !== 'regular'));
  };
  const ALL = [...PLAYERS, 'TM', 'HC'];

  // The shot chart: a player's shots, a team's, or what a team allowed
  const shots: HeatMapDef = {
    id: 'shots',
    positions: ALL,
    surface: 'half-court',
    splits,
    sides: teamSides,
    firstSeason: FIRST_SEASON,
    numbers: true,
    load: async (q) => {
      const got = await load(q);
      if (!got) return null;
      const { role, file } = got;
      const spec = q.stat === 'freq' ? FREQ : FG;
      const build = (f: NbaHeatFile): Built & { subject: Subject } => {
        const sub = subject(f, q.split, q.player, role, q.side);
        const minN = minShots(sub.kind, q.split);
        const league = leagueZones(f, q.split);
        const cells = sub.zones && league ? cellsOf(sub.zones, league, spec, spreads(f, `shots/${sub.kind}/${q.split}/${spec.key}`, kindZones(f, q.split, sub.kind), spec, minN)) : null;
        return { cells, total: sub.zones ? sumAtt(sub.zones) : 0, subject: sub };
      };
      const now = build(file);
      const prior = await lastSeason(q);
      const last = prior ? build(prior) : null;
      if (!now.total && !last?.total) return null;
      const { kind, defense, entry, zones } = now.subject;
      const minN = minShots(kind, q.split);
      const league = leagueZones(file, q.split);
      const who = kind === 'player' ? 'His' : 'Its';
      const games = q.split === 'l10' ? ' · last 10 games' : entry?.g ? ` · ${plural(entry.g, 'game')}` : '';
      const clutch = q.split === 'clutch' ? 'clutch ' : '';
      return {
        surface: 'half-court',
        title: defense ? 'Shots Allowed by Zone' : kind === 'player' ? 'Shot Chart' : 'Shots by Zone',
        count: `${plural(now.total, `${clutch}shot`)}${defense ? ' against it' : ''}${games}`,
        help: `${defense ? "Its opponents' shots" : `${who} shots`} from the floor by zone, seen from behind the shooter (left and right as you look at the basket): FG% in each against the league's there, or how often ${kind === 'player' ? 'he shoots' : defense ? 'they shot' : 'it shoots'} from it against how often the league does. A zone short of the sample greyed; a heave from past half court left out`,
        stats: [FG, FREQ].map((s) => ({ key: s.key, label: s.label, title: s.title })),
        stat: spec.key === 'fg' ? toStat(spec, minN, 'shots', 'makes / shots') : toStat(spec, 1, 'shots'),
        cells: now.cells ?? ZONE_IDS.map((id) => ({ id, n: 0, value: null, league: null })),
        defense,
        chips: zones && league ? profileChips(zones, league, entry, defense, q.split) : undefined,
        chipsTitle: defense ? 'What It Allows' : 'Shot Profile',
        ...fallbackOf(q, last),
      } satisfies HeatMapData;
    },
  };

  // The assist map: where a passer's assists (a team's) became shots
  const assists: HeatMapDef = {
    id: 'assists',
    positions: ALL,
    surface: 'half-court',
    splits,
    sides: teamSides,
    firstSeason: FIRST_SEASON,
    numbers: true,
    load: async (q) => {
      if (q.split === 'l10' || q.split === 'clutch' || q.side === 'defense') return null;
      const got = await load(q);
      if (!got) return null;
      const { role, file } = got;
      const build = (f: NbaHeatFile): Built => {
        const sub = subject(f, q.split, q.player, role, q.side);
        const league = leagueZones(f, q.split, true);
        if (!sub.assists || !league) return { cells: null, total: 0 };
        const zones = asZones(sub.assists);
        return { cells: cellsOf(zones, league, MIX, spreads(f, `assists/${sub.kind}/${q.split}`, kindZones(f, q.split, sub.kind, true), MIX, 5)), total: sumAtt(zones) };
      };
      const now = build(file);
      const prior = await lastSeason(q);
      const last = prior ? build(prior) : null;
      if (Math.max(now.total, last?.total ?? 0) < ASSIST_MAP_MIN) return null;
      const player = role === 'player';
      return {
        surface: 'half-court',
        title: player ? 'Assist Map' : 'Assists by Zone',
        count: plural(now.total, 'assist'),
        help: `Where ${player ? 'his' : 'its'} assists became shots, by the shot's zone: each zone's share of ${player ? 'his' : 'its'} assists against the league's share there (lavender: more often than the league, amber: less)`,
        stats: [{ key: MIX.key, label: MIX.label, title: MIX.title }],
        stat: toStat(MIX, 1, 'assists'),
        cells: now.cells ?? ZONE_IDS.map((id) => ({ id, n: 0, value: null, league: null })),
        defense: false,
        ...fallbackOf(q, last),
      } satisfies HeatMapData;
    },
  };

  return [shots, assists];
}

// ---- the AI preview's matchup maps

// The compact matchup maps on a card's AI preview (the whole season, by FG%): a team's shots against what the
// opponent's defense allowed in each zone, and the opponent's shots against what its own allowed; a player's
// shots against the opponent's defense. In the season being played each side's own last season behind its
// thin zones, faded, so the maps show from the first weeks. Only when at least five zones have a sample on both
// sides. The opponent by ESPN's abbreviation (the analysis's: "GS", "NY")
export async function nbaHeatMatchups(player: SkillPlayer, position: string, season: number, opponent: string, current: boolean, live: boolean): Promise<HeatMatchup[]> {
  const role = roleOf(position);
  const file = role ? await nbaHeatFile(season, current) : null;
  if (!role || !file) return [];
  const lastFile = live ? await nbaHeatFile(season - 1, false) : null;
  const opp = siteCode(opponent);
  type Side = { zones: (f: NbaHeatFile) => Zone[] | null; kind: Kind };
  const cellsFor = (side: Side, f: NbaHeatFile) => {
    const zones = side.zones(f);
    const league = leagueZones(f, 'all');
    return zones && league && sumAtt(zones) ? cellsOf(zones, league, FG, spreads(f, `shots/${side.kind}/all/fg`, kindZones(f, 'all', side.kind), FG, minShots(side.kind, 'all'))) : null;
  };
  const make = (title: string, caption: string, own: Side, against: Side, defense: boolean): HeatMatchup | null => {
    const minN = minShots(own.kind, 'all');
    const oppN = minShots(against.kind, 'all');
    const cells = cellsFor(own, file);
    const overlay = cellsFor(against, file);
    const fallback = lastFile ? cellsFor(own, lastFile) : null;
    const overlayFallback = lastFile ? cellsFor(against, lastFile) : null;
    if ((!cells && !fallback) || (!overlay && !overlayFallback)) return null;
    const none = ZONE_IDS.map((id) => ({ id, n: 0, value: null, league: null }));
    const mine = cells ?? none;
    const theirs = overlay ?? none;
    const stat = toStat(FG, Math.min(minN, oppN), 'shots', 'makes / shots');
    const shown = mine.filter((c, i) => {
      const p = pickPair(c, fallback?.[i], stat, theirs[i], overlayFallback?.[i]);
      return p.own.cell.n >= minN && !!p.opp && p.opp.cell.n >= oppN;
    });
    if (shown.length < 5) return null;
    return {
      title,
      caption,
      cells: mine,
      overlay: theirs,
      overlayLabel: defense ? `${opp}'s offense` : `${opp}'s D`,
      surface: 'half-court',
      stat,
      defense,
      ...(fallback || overlayFallback ? { fallback, overlayFallback, fallbackLabel: seasonName(season - 1), seasonLabel: seasonName(season) } : {}),
    };
  };
  const all = (group: 'players' | 'offenses' | 'defenses', key: string | null) => (f: NbaHeatFile) => (key ? (shotPart(f, 'all')?.[group][key]?.s ?? null) : null);
  const oppDef: Side = { zones: all('defenses', opp), kind: 'def' };
  if (role === 'team') {
    const code = teamCodeOf(player);
    const oppOff: Side = { zones: all('offenses', opp), kind: 'off' };
    return [
      make(`${code ?? 'Its'} shots vs ${opp}'s D`, `Its shots, against what ${opp} allows`, { zones: all('offenses', code), kind: 'off' }, oppDef, false),
      make(`${opp} shots vs ${code ?? 'its'} D`, `What it allows, against ${opp}'s shots`, { zones: all('defenses', code), kind: 'def' }, oppOff, true),
    ].filter((m): m is HeatMatchup => !!m);
  }
  const m = make(`His shots vs ${opp}'s D`, `His shots, against what ${opp} allows`, { zones: all('players', String(player.id ?? '')), kind: 'player' }, oppDef, false);
  return m ? [m] : [];
}
