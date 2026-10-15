import type { SkillPlayer } from '@sport/positions';
import { tintScale } from '@ranker/core/value-tint';
import { espnUpcoming } from '@ranker/core/game-logs';
import { rowTeamNames } from '@ranker/engine/row-fields';
import type { HeatCell, HeatChip, HeatMapData, HeatMapDef, HeatMatchup, HeatOpponent, HeatQuery, HeatSplit, HeatStat } from '@ranker/engine/heat-map/heat-map.model';
import { DEPTHS, SIDES } from '@ranker/engine/heat-map/surfaces/field';
import { DISTANCES, DOWNS } from '@ranker/engine/heat-map/surfaces/down-distance';
import type { FieldLane, FieldMapSection, FieldPunt } from '@ranker/engine/player-card/field-map';

// The NFL's Heat Maps (SPORT.heatMaps, the card's Heat Maps tab), from heat-maps.json (build-field-maps.mjs:
// data/heat-maps.json for the season being played, data/seasons/<year>/heat-maps.json before it): a QB's, a
// receiver's, a back's, a defense's and a team's
//   zones           the Field Map's twelve pass zones, by EPA, completion (catch) %, CPOE, YAC a catch, success
//                   and TD rate; the red zone's too (snaps inside the 20), with a player's share of his team's
//                   red-zone targets and carries, inside the 10 and the 5, under it
//   field position  ten 10-yard bands from his own goal line to theirs: EPA, success and TD rate
//   down & distance downs 1-4 by short, medium and long: target and carry shares, pass rate, success, EPA
// each against the league's in the same cell, and the zones under the next opponent's (the overlay; the AI
// preview's matchup maps). The file keeps sums (EPA, CPOE, YAC added up), the regular season's and the
// playoffs', so the whole season is the two added up.

type Row = Record<string, number>;
type Packed = number[] | 0;

interface HeatEntry {
  pass?: Row[];
  targets?: Row[];
  rz?: { pass?: Row[]; targets?: Row[]; runs?: Row[]; share?: Row };
  band?: Row[];
  down?: Row[];
}
interface HeatPart {
  league: HeatEntry;
  players: Record<string, HeatEntry>;
  defenses: Record<string, HeatEntry>;
  offenses: Record<string, HeatEntry>;
}
export interface HeatFile {
  season: number;
  // (each team's Teams-tab name by its abbreviation: "KC" -> "Chiefs")
  teams: Record<string, string>;
  regular: HeatPart | null;
  post: HeatPart | null;
}

interface PackedEntry {
  pass?: Packed[];
  targets?: Packed[];
  rz?: { pass?: Packed[]; targets?: Packed[]; runs?: Packed[]; share?: number[] };
  band?: Packed[];
  down?: Packed[];
}
interface PackedPart {
  league: PackedEntry;
  players: Record<string, PackedEntry>;
  defenses: Record<string, PackedEntry>;
  offenses: Record<string, PackedEntry>;
}
export interface PackedHeatFile {
  season: number;
  fields: { zone: string[]; rzZone: string[]; lane: string[]; band: string[]; down: string[]; share: string[] };
  teams?: Record<string, string>;
  regular: PackedPart | null;
  post: PackedPart | null;
}

// ---- the file read back: each tuple a row by the file's field names (a plain 0: all zeros)

const named =
  (names: string[]) =>
  (t: Packed | undefined): Row =>
    Object.fromEntries(names.map((n, i) => [n, t ? (t[i] ?? 0) : 0]));

export function expandHeat(file: PackedHeatFile): HeatFile {
  const f = file.fields;
  const zone = named(f.zone);
  const rzZone = named(f.rzZone);
  const lane = named(f.lane);
  const band = named(f.band);
  const down = named(f.down);
  const share = named(f.share);
  const entry = (e: PackedEntry): HeatEntry => ({
    pass: e.pass?.map(zone),
    targets: e.targets?.map(zone),
    rz: e.rz && { pass: e.rz.pass?.map(rzZone), targets: e.rz.targets?.map(rzZone), runs: e.rz.runs?.map(lane), share: e.rz.share && share(e.rz.share) },
    band: e.band?.map(band),
    down: e.down?.map(down),
  });
  const all = (rows: Record<string, PackedEntry>) => Object.fromEntries(Object.entries(rows ?? {}).map(([id, e]) => [id, entry(e)]));
  const part = (p: PackedPart | null): HeatPart | null => p && { league: entry(p.league), players: all(p.players), defenses: all(p.defenses), offenses: all(p.offenses) };
  return { season: file.season, teams: file.teams ?? {}, regular: part(file.regular), post: part(file.post) };
}

// (two parts added up: the whole season)
const addRow = (a: Row | undefined, b: Row | undefined): Row | undefined => (!a ? b : !b ? a : Object.fromEntries(Object.keys({ ...a, ...b }).map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)])));
const addRows = (a: Row[] | undefined, b: Row[] | undefined): Row[] | undefined => (!a ? b : !b ? a : a.map((r, i) => addRow(r, b[i])!));
export function addEntries(a: HeatEntry | undefined, b: HeatEntry | undefined): HeatEntry | undefined {
  if (!a || !b) return a ?? b;
  return {
    pass: addRows(a.pass, b.pass),
    targets: addRows(a.targets, b.targets),
    rz: { pass: addRows(a.rz?.pass, b.rz?.pass), targets: addRows(a.rz?.targets, b.rz?.targets), runs: addRows(a.rz?.runs, b.rz?.runs), share: addRow(a.rz?.share, b.rz?.share) },
    band: addRows(a.band, b.band),
    down: addRows(a.down, b.down),
  };
}
function addParts(a: HeatPart | null, b: HeatPart | null): HeatPart | null {
  if (!a || !b) return a ?? b;
  const merge = (x: Record<string, HeatEntry>, y: Record<string, HeatEntry>) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((id) => [id, addEntries(x[id], y[id])!]));
  return { league: addEntries(a.league, b.league)!, players: merge(a.players, b.players), defenses: merge(a.defenses, b.defenses), offenses: merge(a.offenses, b.offenses) };
}

const wholeSeason = new WeakMap<HeatFile, HeatPart | null>();
// A split's part: the regular season, the playoffs, or both (the whole season; the red zone's is in it)
export function heatPart(file: HeatFile, split: string): HeatPart | null {
  if (split === 'regular') return file.regular;
  if (split === 'post') return file.post;
  if (!wholeSeason.has(file)) wholeSeason.set(file, addParts(file.regular, file.post));
  return wholeSeason.get(file)!;
}

// ---- the stats

// ("+.21": EPA a play, the way the analysts write it; "+3.1"; "64%")
export const epaText = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(2).replace(/^0\./, '.')}`;
const signed1 = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(1)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ratio = (a: number, b: number) => (b ? a / b : null);

type Role = 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'TM';
// (what a card's row is on the heat maps: a team's other cards, its line and coach, read as the team)
const roleOf = (position: string): Role | null =>
  (['QB', 'RB', 'WR', 'TE', 'DEF', 'TM'] as string[]).includes(position) ? (position as Role) : position === 'OL' || position === 'HC' ? 'TM' : null;
// (which rows a cell's spread is measured across: the QBs', the skill players', the defenses', the offenses')
type Kind = 'qb' | 'skill' | 'def' | 'off';

// A stat on the cells: its row reading (value, sample, made), how it reads, its sample floor and fallback spread
interface StatSpec {
  key: string;
  label: string;
  per: string;
  title: string;
  value: (r: Row) => number | null;
  n: (r: Row) => number;
  made?: (r: Row) => number;
  format: (v: number) => string;
  sd: number;
  noun?: string;
  // (what a cell's small number is when it's made over tried: "catches / targets")
  sample?: string;
  scale?: HeatStat['scale'];
  ends?: [string, string];
}

const att = (r: Row) => r['att'] ?? 0;
const zoneStats = (role: Role, redZone: boolean): StatSpec[] => {
  const receiving = role === 'RB' || role === 'WR' || role === 'TE';
  const a = receiving ? 'a target' : 'a throw';
  const list: StatSpec[] = [
    { key: 'epa', label: 'EPA', per: `EPA ${a}`, title: `Expected points added ${a}`, value: (r) => ratio(r['epa'], att(r)), n: att, format: epaText, sd: 0.4 },
    {
      key: 'comp',
      label: receiving ? 'Catch %' : 'Comp %',
      per: receiving ? 'caught' : 'completed',
      title: receiving ? 'Share of his targets caught' : 'Completion %',
      value: (r) => ratio(r['comp'], att(r)),
      n: att,
      made: (r) => r['comp'],
      sample: receiving ? 'catches / targets' : 'completions / throws',
      format: pct,
      sd: 0.12,
    },
  ];
  if (!redZone && !receiving) list.push({ key: 'cpoe', label: 'CPOE', per: 'CPOE', title: 'Completion % over expected (nflverse), in points', value: (r) => ratio(r['cpoe'], att(r)), n: att, format: signed1, sd: 8 });
  if (!redZone && role !== 'QB' && role !== 'TM')
    list.push({ key: 'yac', label: 'YAC', per: 'YAC a catch', title: 'Yards after the catch, a catch', value: (r) => ratio(r['yac'], r['comp']), n: (r) => r['comp'] ?? 0, format: (v) => v.toFixed(1), sd: 2, noun: 'catches' });
  list.push({ key: 'success', label: 'Success', per: 'success rate', title: 'Share of plays with positive EPA', value: (r) => ratio(r['success'], att(r)), n: att, format: pct, sd: 0.1 });
  list.push({ key: 'td', label: 'TD rate', per: 'TD rate', title: 'Touchdowns a throw', value: (r) => ratio(r['td'], att(r)), n: att, made: (r) => r['td'], sample: `TDs / ${receiving ? 'targets' : 'throws'}`, format: pct, sd: redZone ? 0.12 : 0.04 });
  return list;
};

const plays = (r: Row) => r['plays'] ?? 0;
const STRIP_STATS: StatSpec[] = [
  { key: 'epa', label: 'EPA', per: 'EPA a play', title: 'Expected points added a play', value: (r) => ratio(r['epa'], plays(r)), n: plays, format: epaText, sd: 0.25 },
  { key: 'success', label: 'Success', per: 'success rate', title: 'Share of plays with positive EPA', value: (r) => ratio(r['success'], plays(r)), n: plays, format: pct, sd: 0.08 },
  { key: 'td', label: 'TD rate', per: 'TD rate', title: 'Touchdowns a play', value: (r) => ratio(r['td'], plays(r)), n: plays, made: (r) => r['td'], sample: 'TDs / plays', format: pct, sd: 0.04 },
];

function downStats(role: Role): StatSpec[] {
  const list: StatSpec[] = [];
  const targetShare: StatSpec = {
    key: 'targets',
    label: 'Target share',
    per: "of the team's targets",
    title: "His share of the team's targets in that spot, in his games",
    value: (r) => ratio(r['pass'], r['teamTargets']),
    n: (r) => r['teamTargets'] ?? 0,
    made: (r) => r['pass'],
    sample: "his / the team's",
    format: pct,
    sd: 0.1,
    noun: 'team targets',
    scale: 'sequential',
  };
  const carryShare: StatSpec = {
    key: 'carries',
    label: 'Carry share',
    per: "of the team's carries",
    title: "His share of the team's designed runs in that spot, in his games",
    value: (r) => ratio(r['plays'] - r['pass'], r['teamCarries']),
    n: (r) => r['teamCarries'] ?? 0,
    made: (r) => r['plays'] - r['pass'],
    sample: "his / the team's",
    format: pct,
    sd: 0.1,
    noun: 'team carries',
    scale: 'sequential',
  };
  if (role === 'RB') list.push(carryShare, targetShare);
  if (role === 'WR' || role === 'TE') list.push(targetShare);
  if (role === 'DEF' || role === 'TM')
    list.push({
      key: 'pass',
      label: 'Pass rate',
      per: role === 'DEF' ? 'pass rate against it' : 'pass rate',
      title: role === 'DEF' ? 'How often offenses dropped back against it (sacks and scrambles in), against the league' : 'How often it dropped back (sacks and scrambles in), against the league',
      value: (r) => ratio(r['pass'], plays(r)),
      n: plays,
      made: (r) => r['pass'],
      sample: 'passes / plays',
      format: pct,
      sd: 0.08,
      scale: 'lean',
      ends: ['Runs more', 'Passes more'],
    });
  list.push(STRIP_STATS[1], STRIP_STATS[0]);
  return list;
}

// ---- the spreads: a cell's across the rows of its kind with enough of a sample (the league's spread there),
// kept with the part

const SPREADS = new WeakMap<HeatPart, Map<string, (number | null)[]>>();
function spreads(part: HeatPart, key: string, rows: (Row[] | undefined)[], spec: StatSpec, minN: number): (number | null)[] {
  let known = SPREADS.get(part);
  if (!known) SPREADS.set(part, (known = new Map()));
  if (!known.has(key)) {
    const width = rows.find((r) => r)?.length ?? 0;
    known.set(
      key,
      Array.from({ length: width }, (_, i) => tintScale(rows.map((r) => (r?.[i] && spec.n(r[i]) >= minN ? spec.value(r[i]) : null)))?.sd ?? null),
    );
  }
  return known.get(key)!;
}

const isQbKey = (id: string) => /^\d+$/.test(id);
function kindRows(part: HeatPart, kind: Kind): HeatEntry[] {
  if (kind === 'def') return Object.values(part.defenses);
  if (kind === 'off') return Object.values(part.offenses);
  return Object.entries(part.players)
    .filter(([id]) => isQbKey(id) === (kind === 'qb'))
    .map(([, e]) => e);
}

// ---- the files, once a season

const files = new Map<number, Promise<HeatFile | null>>();
// (a season whose file is in, for the splits it has: no playoffs, no POST)
const loaded = new Map<number, HeatFile | null>();
export function heatFile(season: number, current: boolean): Promise<HeatFile | null> {
  let file = files.get(season);
  if (!file) {
    const path = current ? 'data/heat-maps.json' : `data/seasons/${season}/heat-maps.json`;
    file = fetch(path, { cache: current ? 'no-cache' : 'default' })
      .then(async (res) => (res.ok ? expandHeat((await res.json()) as PackedHeatFile) : null))
      .catch(() => null)
      .then((f) => {
        loaded.set(season, f);
        return f;
      });
    files.set(season, file);
  }
  return file;
}

// ---- a row's entries

const logoNick = (player: SkillPlayer) => /([^/]+)\.png$/.exec(player.teamLogo ?? '')?.[1] ?? null;
// (a team row's abbreviation: its defense's or line's id, else its logo's name in the file's teams)
function teamAbbr(file: HeatFile, player: SkillPlayer): string | null {
  const own = /^(?:DEF|OL)-([A-Z]+)$/.exec(player.gsisId ?? '')?.[1];
  if (own) return own;
  const nick = logoNick(player);
  return Object.entries(file.teams).find(([, n]) => n === nick)?.[0] ?? null;
}
const offenseOf = (file: HeatFile, part: HeatPart, abbr: string | null) => (abbr && file.teams[abbr] ? part.offenses[`TM-${file.teams[abbr]}`] : undefined);

// The row's entry and what it is: a QB's by his ESPN id, a player's by his gsis id, a defense's, a team's
// offense (or, on its Defense side, its defense)
function subject(file: HeatFile, part: HeatPart, player: SkillPlayer, role: Role, side: string | null): { entry: HeatEntry | undefined; kind: Kind; defense: boolean } {
  if (role === 'QB') return { entry: part.players[String(player.id)] ?? part.players[(player.gsisId ?? '').replace(/^QB-/, '')], kind: 'qb', defense: false };
  if (role === 'DEF' || (role === 'TM' && side === 'defense')) {
    const abbr = teamAbbr(file, player);
    return { entry: abbr ? part.defenses[`DEF-${abbr}`] : undefined, kind: 'def', defense: true };
  }
  if (role === 'TM') return { entry: offenseOf(file, part, teamAbbr(file, player)), kind: 'off', defense: false };
  return { entry: part.players[player.gsisId], kind: 'skill', defense: false };
}

// ---- cells

function toStat(spec: StatSpec, minN: number, noun: string): HeatStat {
  return { key: spec.key, label: spec.label, per: spec.per, format: spec.format, sd: spec.sd, minN, scale: spec.scale, noun: spec.noun ?? noun, sample: spec.sample, ends: spec.ends };
}

function cellsOf(rows: Row[] | undefined, league: Row[] | undefined, ids: string[], spec: StatSpec, sds: (number | null)[]): HeatCell[] {
  return ids.map((id, i) => {
    const r = rows?.[i];
    const lg = league?.[i];
    return {
      id,
      n: r ? spec.n(r) : 0,
      made: r && spec.made ? spec.made(r) : undefined,
      value: r ? spec.value(r) : null,
      league: lg ? spec.value(lg) : null,
      sd: sds[i],
    };
  });
}

export const ZONE_IDS = DEPTHS.flatMap((d) => SIDES.map((s) => `${d}-${s}`));
const BAND_IDS = Array.from({ length: 10 }, (_, k) => `b${k}`);
const DOWN_IDS = DOWNS.flatMap((d) => DISTANCES.map((x) => `${d}-${x.id}`));

const SPLITS: HeatSplit[] = [
  { id: 'all', label: 'Season', title: 'The regular season and the playoffs' },
  { id: 'regular', label: 'REG', title: 'The regular season' },
  { id: 'post', label: 'POST', title: 'The playoffs' },
  { id: 'redzone', label: 'Red zone', title: 'Snaps inside the 20 (the whole season)' },
];
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const sum = (rows: Row[] | undefined, key: string) => (rows ?? []).reduce((a, r) => a + (r[key] ?? 0), 0);
const SIDES_OF_A_TEAM: HeatSplit[] = [
  { id: 'offense', label: 'Offense', title: 'Its offense' },
  { id: 'defense', label: 'Defense', title: 'What its defense allowed' },
];

export interface NflHeatContext {
  // (whether a season is the one being played: its file sits at the top of data/)
  current: (season: number) => boolean;
}

// ---- the maps

export function nflHeatMaps({ current }: NflHeatContext): HeatMapDef[] {
  const load = async (q: HeatQuery) => {
    const role = roleOf(q.position);
    const file = role ? await heatFile(q.season, current(q.season)) : null;
    const part = file ? heatPart(file, q.split) : null;
    return role && file && part ? { role, file, part } : null;
  };
  const teamSides = (position: string) => (roleOf(position) === 'TM' ? SIDES_OF_A_TEAM : []);
  // (the splits a season's file has: with no playoff games (the season being played's till its file says so)
  // the season is its regular season, Season alone, no REG or POST)
  const splits = (all: HeatSplit[]) => (season: number) => {
    const known = heatSplitsKnown(season);
    const playoffs = known ? known.has('post') : !current(season);
    return all.filter((s) => playoffs || (s.id !== 'post' && s.id !== 'regular'));
  };

  const zones: HeatMapDef = {
    id: 'zones',
    positions: ['QB', 'RB', 'WR', 'TE', 'DEF', 'TM', 'OL', 'HC'],
    surface: 'field',
    splits: splits(SPLITS),
    sides: teamSides,
    overlay: true,
    firstSeason: 2006,
    load: async (q) => {
      const got = await load(q);
      if (!got) return null;
      const { role, file, part } = got;
      const red = q.split === 'redzone';
      const { entry, kind, defense } = subject(file, part, q.player, role, q.side);
      const receiving = kind === 'skill';
      const pick = (e: HeatEntry | undefined) => (red ? (receiving ? e?.rz?.targets : e?.rz?.pass) : receiving ? e?.targets : e?.pass);
      const rows = pick(entry);
      if (!rows || !sum(rows, 'att')) return null;
      const specs = zoneStats(role === 'TM' && defense ? 'DEF' : role, red);
      const spec = specs.find((s) => s.key === q.stat) ?? specs.find((s) => s.key === (red ? 'td' : 'epa'))!;
      // (a team's sample floor a little higher: more plays to go round; a receiver's a little lower)
      const minN = red ? (kind === 'def' || kind === 'off' ? 6 : 4) : kind === 'def' || kind === 'off' ? 12 : kind === 'skill' ? 8 : 10;
      const statN = spec.key === 'yac' ? Math.ceil(minN * 0.6) : minN;
      const kindRowsOf = (k: Kind) => kindRows(part, k).map((e) => (red ? (k === 'skill' ? e.rz?.targets : e.rz?.pass) : k === 'skill' ? e.targets : e.pass));
      const sds = spreads(part, `zones/${kind}/${red}/${spec.key}`, kindRowsOf(kind), spec, statN);
      const leagueRows = red ? part.league.rz?.pass : part.league.pass;
      const noun = receiving ? 'targets' : 'throws';
      const cells = cellsOf(rows, leagueRows, ZONE_IDS, spec, sds);
      // (the opponent over it: an offense's zones under its defense, a defense's under its offense)
      let overlay: HeatCell[] | null = null;
      let overlayLabel: string | null = null;
      if (q.opponent) {
        const oppKind: Kind = defense ? 'off' : 'def';
        const opp = defense ? offenseOf(file, part, q.opponent) : part.defenses[`DEF-${q.opponent}`];
        const oppRows = red ? opp?.rz?.pass : opp?.pass;
        if (oppRows) {
          const oppSds = spreads(part, `zones/${oppKind}/${red}/${spec.key}`, kindRowsOf(oppKind), spec, statN * 2);
          overlay = cellsOf(oppRows, leagueRows, ZONE_IDS, spec, oppSds);
          overlayLabel = defense ? `${q.opponent}'s offense` : `${q.opponent}'s D`;
        }
      }
      const total = sum(rows, 'att');
      const what = defense ? 'Pass Defense' : receiving ? 'Targets' : 'Passing';
      const stat = toStat(spec, statN, noun);
      return {
        surface: 'field',
        title: `${red ? 'Red Zone ' : ''}${what} by Zone`,
        count: defense ? `${plural(total, 'throw')} against it` : plural(total, receiving ? 'target' : 'throw'),
        help:
          (defense ? 'What it allowed, by where the ball went' : receiving ? 'Where he was thrown to' : 'Where the throws went') +
          ' (air yards past the line, looking downfield from behind the offense)' +
          (red ? ', on snaps inside the 20' : '') +
          ". Each zone against the league's there; a zone short of the sample greyed",
        stats: specs.map((s) => ({ key: s.key, label: s.label, title: s.title })),
        stat,
        cells,
        overlay,
        overlayLabel,
        defense,
        chips: red ? redZoneChips(entry, part, role, kind, defense) : undefined,
      } satisfies HeatMapData;
    },
  };

  const unitMap = (id: 'strip' | 'downs'): HeatMapDef => ({
    id,
    positions: ['QB', 'RB', 'WR', 'TE', 'DEF', 'TM', 'OL', 'HC'],
    surface: id === 'strip' ? 'field-strip' : 'down-distance',
    splits: splits(SPLITS.filter((s) => s.id !== 'redzone')),
    sides: teamSides,
    load: async (q) => {
      if (q.split === 'redzone') return null;
      const got = await load(q);
      if (!got) return null;
      const { role, file, part } = got;
      const { entry, kind, defense } = subject(file, part, q.player, role, q.side);
      const rows = id === 'strip' ? entry?.band : entry?.down;
      if (!rows || !sum(rows, 'plays')) return null;
      const specs = id === 'strip' ? STRIP_STATS : downStats(role === 'TM' && defense ? 'DEF' : role);
      const spec = specs.find((s) => s.key === q.stat) ?? specs[0];
      const unit = kind === 'def' || kind === 'off';
      const minN = unit ? 15 : id === 'strip' ? 10 : 8;
      const statN = spec.scale === 'sequential' ? 5 : minN;
      const sds = spreads(part, `${id}/${kind}/${spec.key}`, kindRows(part, kind).map((e) => (id === 'strip' ? e.band : e.down)), spec, statN);
      const ids = id === 'strip' ? BAND_IDS : DOWN_IDS;
      const cells = cellsOf(rows, id === 'strip' ? part.league.band : part.league.down, ids, spec, sds);
      const total = sum(rows, 'plays');
      const noun = 'plays';
      return {
        surface: id === 'strip' ? 'field-strip' : 'down-distance',
        title: id === 'strip' ? 'Field Position' : 'Down & Distance',
        count: defense ? `${plural(total, 'play')} against it` : plural(total, 'play'),
        help:
          id === 'strip'
            ? `${defense ? 'What it allowed' : kind === 'skill' ? 'His plays (targets and carries)' : kind === 'qb' ? 'His dropbacks and runs' : 'Its plays'} by where on the field the snap was, his own goal line on the left to theirs on the right, each 10-yard band against the league's there`
            : `${defense ? 'What it allowed' : kind === 'skill' ? 'His plays' : kind === 'qb' ? 'His dropbacks and runs' : 'Its plays'} by down and distance to go: short 1-3, medium 4-7, long 8+, each against the league's there (a share: his of the team's, in his games)`,
        stats: specs.map((s) => ({ key: s.key, label: s.label, title: s.title })),
        stat: toStat(spec, statN, noun),
        cells,
        overlay: null,
        overlayLabel: null,
        defense,
      } satisfies HeatMapData;
    },
  });

  return [zones, unitMap('strip'), unitMap('downs')];
}

// (the splits a season's file has, once it's in: POST only with playoff games)
export function heatSplitsKnown(season: number): Set<string> | null {
  if (!loaded.has(season)) return null;
  const file = loaded.get(season);
  return new Set(SPLITS.map((s) => s.id).filter((id) => id !== 'post' || !!file?.post));
}

// ---- the red zone's numbers under its zones: a player's share of his team's looks there (inside the 20, the
// 10, the 5), his end-zone targets and touchdowns; a passer's throws, end-zone throws and TD rate; a defense's
// TD rate allowed

function redZoneChips(entry: HeatEntry | undefined, part: HeatPart, role: Role, kind: Kind, defense: boolean): HeatChip[] {
  const chips: HeatChip[] = [];
  const s = entry?.rz?.share;
  const passRows = kind === 'skill' ? entry?.rz?.targets : entry?.rz?.pass;
  const leaguePass = part.league.rz?.pass;
  const leagueTd = ratio(sum(leaguePass, 'td'), sum(leaguePass, 'att'));
  const shareChip = (label: string, own: number, team: number, title: string) =>
    team ? chips.push({ label, value: pct(own / team), sub: `${own} of ${team}`, tone: 0, title: `${title}: ${own} of the team's ${team} in his games` }) : 0;
  if (kind === 'skill' && s) {
    if (role === 'RB') {
      shareChip('Carry share', s['carries'], s['teamCarries'], 'Red-zone carries');
      shareChip('Carries inside 10', s['carries10'], s['teamCarries10'], 'Carries inside the 10');
      shareChip('Carries inside 5', s['carries5'], s['teamCarries5'], 'Carries inside the 5');
      shareChip('Target share', s['targets'], s['teamTargets'], 'Red-zone targets');
    } else {
      shareChip('Target share', s['targets'], s['teamTargets'], 'Red-zone targets');
      shareChip('Targets inside 10', s['targets10'], s['teamTargets10'], 'Targets inside the 10');
      shareChip('Targets inside 5', s['targets5'], s['teamTargets5'], 'Targets inside the 5');
    }
    if (s['endZone']) chips.push({ label: 'End-zone targets', value: String(s['endZone']), tone: 0, title: 'Targets thrown into the end zone from inside the 20' });
    const looks = s['targets'] + s['carries'];
    chips.push({ label: 'Touchdowns', value: String(s['td']), sub: looks ? `${pct(s['td'] / looks)} of looks` : undefined, tone: 0, title: `Red-zone touchdowns on his ${looks} targets and carries` });
    return chips;
  }
  const throws = sum(passRows, 'att');
  if (!throws) return chips;
  const td = sum(passRows, 'td');
  const ez = sum(passRows, 'endZone');
  const rate = td / throws;
  const tone = leagueTd ? Math.max(-1, Math.min(1, ((rate - leagueTd) / 0.12 / 2) * (defense ? -1 : 1))) : 0;
  chips.push({
    label: defense ? 'TD rate allowed' : 'TD rate',
    value: pct(rate),
    sub: `${td} of ${throws} throws`,
    tone,
    title: `Touchdowns a throw inside the 20${leagueTd !== null ? ` · league ${pct(leagueTd)}` : ''}`,
  });
  chips.push({ label: defense ? 'End-zone throws against' : 'End-zone throws', value: String(ez), sub: `${pct(ez / throws)} of them`, tone: 0, title: 'Throws into the end zone from inside the 20' });
  const runs = entry?.rz?.runs;
  const carries = sum(runs, 'att');
  if (carries && kind !== 'qb') {
    const runTd = sum(runs, 'td');
    const leagueRuns = part.league.rz?.runs;
    const lgRate = ratio(sum(leagueRuns, 'td'), sum(leagueRuns, 'att'));
    const r = runTd / carries;
    chips.push({
      label: defense ? 'Run TD rate allowed' : 'Run TD rate',
      value: pct(r),
      sub: `${runTd} of ${carries} carries`,
      tone: lgRate ? Math.max(-1, Math.min(1, ((r - lgRate) / 0.12 / 2) * (defense ? -1 : 1))) : 0,
      title: `Touchdowns a designed run inside the 20${lgRate !== null ? ` · league ${pct(lgRate)}` : ''}`,
    });
  }
  return chips;
}

// ---- the Field Map's red zone: the run lanes inside the 20 as a Field Map section (the card's run arrows and
// a defense's lane strip read it as they read a season's)

const EMPTY_PUNT: FieldPunt = { n: 0, gross: 0, net: 0, inside20: 0, touchbacks: 0, fairCatches: 0, blocked: 0, bands: [] };
const LANE_NAMES = ['left end', 'left tackle', 'left guard', 'middle', 'right guard', 'right tackle', 'right end'];
const lanes = (rows: Row[] | undefined): FieldLane[] | undefined =>
  rows?.map((r, i) => ({ lane: LANE_NAMES[i], att: r['att'], yds: r['yds'], td: r['td'], epa: r['att'] ? r['epa'] / r['att'] : 0, success: r['att'] ? r['success'] / r['att'] : 0 }));

const RED_ZONE = new WeakMap<HeatPart, FieldMapSection>();
export function redZoneSection(file: HeatFile): FieldMapSection | null {
  const part = heatPart(file, 'all');
  if (!part) return null;
  if (!RED_ZONE.has(part)) {
    const runsOf = (rows: Record<string, HeatEntry>) => Object.fromEntries(Object.entries(rows).flatMap(([id, e]) => (e.rz?.runs ? [[id, { runs: lanes(e.rz.runs) }]] : [])));
    RED_ZONE.set(part, {
      league: { pass: [], runs: lanes(part.league.rz?.runs) ?? [], fg: [], punt: EMPTY_PUNT },
      players: runsOf(part.players),
      defenses: runsOf(part.defenses),
    });
  }
  return RED_ZONE.get(part)!;
}

// ---- the overlay's opponent, and the AI preview's matchup maps

// ESPN's abbreviations where nflverse's differ
const FROM_ESPN: Record<string, string> = { LAR: 'LA', WSH: 'WAS' };

export async function nextOpponent(player: SkillPlayer, position: string, season: number): Promise<HeatOpponent | null> {
  if (!roleOf(position)) return null;
  const [game] = await espnUpcoming('football/nfl', rowTeamNames(player), season, 1).catch(() => []);
  const abbr = game?.vs?.split(' ').pop();
  if (!abbr) return null;
  const key = FROM_ESPN[abbr] ?? abbr;
  const [y, m, d] = game.date.split('-').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  return { key, label: key, when: `${day} ${m}/${d} ${game.vs}` };
}

// The compact matchup maps on a card's AI preview (the season's whole file, by EPA): a QB's throws, a
// receiver's or a back's targets, against the opponent's pass defense; a team's two (its passing against
// theirs, and theirs against its pass defense)
export async function heatMatchups(player: SkillPlayer, position: string, season: number, opponent: string, current: boolean): Promise<HeatMatchup[]> {
  const role = roleOf(position);
  const file = role ? await heatFile(season, current) : null;
  const part = file && heatPart(file, 'all');
  if (!role || !file || !part) return [];
  const spec = zoneStats('QB', false)[0];
  const oppDef = part.defenses[`DEF-${opponent}`];
  const oppOff = offenseOf(file, part, opponent);
  // (a map only when it has something to say: at least 4 zones with a sample on both sides; a back's targets,
  // nearly all short, never do)
  const make = (title: string, caption: string, rows: Row[] | undefined, kind: Kind, against: Row[] | undefined, againstKind: Kind, defense: boolean, receiving = false): HeatMatchup | null => {
    if (!rows || !against || !sum(rows, 'att')) return null;
    const minN = kind === 'def' || kind === 'off' ? 12 : 8;
    const rowsOf = (k: Kind) => kindRows(part, k).map((e) => (k === 'skill' ? e.targets : e.pass));
    const cells = cellsOf(rows, part.league.pass, ZONE_IDS, spec, spreads(part, `zones/${kind}/false/epa`, rowsOf(kind), spec, minN));
    const overlay = cellsOf(against, part.league.pass, ZONE_IDS, spec, spreads(part, `zones/${againstKind}/false/epa`, rowsOf(againstKind), spec, 12));
    if (cells.filter((c, i) => c.n >= minN && overlay[i].n >= minN).length < 4) return null;
    const stat = { ...toStat(spec, minN, receiving ? 'targets' : 'throws'), per: receiving ? 'EPA a target' : 'EPA a throw' };
    return { title, caption, cells, overlay, overlayLabel: defense ? `${opponent}'s offense` : `${opponent}'s D`, surface: 'field', stat, defense };
  };
  if (role === 'TM' || role === 'DEF') {
    const abbr = teamAbbr(file, player);
    const nick = abbr ? file.teams[abbr] : null;
    const off = offenseOf(file, part, abbr);
    const def = abbr ? part.defenses[`DEF-${abbr}`] : undefined;
    const oppName = file.teams[opponent] ?? opponent;
    return [
      make(`${nick ?? 'Its'} passing vs ${oppName} pass D`, `Where its throws go, against what ${opponent} allows there`, off?.pass, 'off', oppDef?.pass, 'def', false),
      make(`${oppName} passing vs ${nick ?? 'its'} pass D`, `What it allows, against where ${opponent} throws`, def?.pass, 'def', oppOff?.pass, 'off', true),
    ].filter((m): m is HeatMatchup => !!m);
  }
  const { entry, kind } = subject(file, part, player, role, null);
  const receiving = kind === 'skill';
  const m = make(receiving ? `His targets vs ${opponent}'s pass D` : `His throws vs ${opponent}'s pass D`, `Where he ${receiving ? 'is thrown to' : 'throws'}, against what ${opponent} allows there`, receiving ? entry?.targets : entry?.pass, kind, oppDef?.pass, 'def', false, receiving);
  return m ? [m] : [];
}
