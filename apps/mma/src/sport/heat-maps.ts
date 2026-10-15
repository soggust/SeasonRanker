import type { SkillPlayer } from '@sport/positions';
import type { HeatCell, HeatChip, HeatMapData, HeatMapDef, HeatQuery, HeatSplit, HeatStat, HeatSurfaceId } from '@ranker/engine/heat-map/heat-map.model';
import { BODY_3_IDS, BODY_IDS, STRIKE_POSITIONS } from '@ranker/engine/heat-map/surfaces/body';
import { roundClockIds } from '@ranker/engine/heat-map/surfaces/round-clock';

// MMA's Heat Maps (SPORT.heatMaps, the card's Heat Maps tab), from apps/mma/scripts/build-heat-maps.mjs's files:
//   striking   where his significant strikes land, on a fighter's figure by target (head, body, legs) and on
//              three by the position they came from (at distance, in the clinch, on the ground): accuracy,
//              landed a minute and the share, each against his division's; on Defense what he absorbed (his
//              opponents' accuracy against him...). Beside them his grappling (takedowns, control, advances,
//              submission attempts, knockdowns; on Defense the same against him). ESPN's numbers, the UFC's
//              bouts (FightMetric's, back to 1997)
//   finishes   when his fights end, round by minute (three rounds, or five once he's had a five-round fight):
//              each minute's finish rate (his finishes there, of his fights still going at its start), against
//              his division's in the same minute; by KO/TKO or submission; on Defense when he's finished. Every
//              fight ESPN has, in every promotion it covers. Beside it his finishing numbers
// each over his whole career or his last five fights, his career behind the last five's thin cells, faded. The
// base rates are the card's division's (a pound-for-pound row's, his own division's).
//
// Files: data/heat-maps.json (the fields and each division's base rates) and data/heat-maps.<division>.json (its
// fighters: his finish codes, his strike sums).

// ---- the files

interface Clock {
  n: number[];
  all: number[];
  ko: number[];
  sub: number[];
  fights: number;
  decisive: number;
  finishes: number;
  r1: number;
}
type Spread = (number | null)[];
interface StrikeBase {
  sum: number[];
  sd: { acc: Spread; pm: Spread; share: Spread; dacc: Spread; dpm: Spread; dshare: Spread; go: Record<string, number | null>; gd: Record<string, number | null> };
  avg: { go: Record<string, number | null> };
}
export interface MainFile {
  fields: { sum: string[]; cells: string[] };
  divisions: Record<string, { clock: Clock | null; strikes: StrikeBase | null }>;
}
export interface FighterEntry {
  f: string;
  c?: number[];
  l?: number[];
}
export interface DivisionFile {
  division: string;
  fighters: Record<string, FighterEntry>;
}

export const DIVISIONS = ['HW', 'LHW', 'MW', 'WW', 'LW', 'FW', 'BW', 'FLW', 'WBW', 'WFLW', 'WSW'];
const WOMENS = ['WBW', 'WFLW', 'WSW'];
export const MMA_HEAT_POSITIONS = ['P4P', 'WP4P', ...DIVISIONS];

const files = new Map<string, Promise<unknown>>();
function fetchFile<T>(name: string): Promise<T | null> {
  const path = `data/${name}`;
  if (!files.has(path)) {
    files.set(
      path,
      fetch(path, { cache: 'no-cache' })
        .then(async (res) => (res.ok ? ((await res.json()) as T) : null))
        .catch(() => null),
    );
  }
  return files.get(path) as Promise<T | null>;
}
export const mainFile = (): Promise<MainFile | null> => fetchFile<MainFile>('heat-maps.json');
export const divisionFile = (division: string): Promise<DivisionFile | null> => fetchFile<DivisionFile>(`heat-maps.${division.toLowerCase()}.json`);

// (the card's division: its tab's, or a pound-for-pound row's own)
export const divisionOf = (player: SkillPlayer, position: string): string | null => (DIVISIONS.includes(position) ? position : DIVISIONS.includes(player.division ?? '') ? player.division! : null);

// ---- the finishes: each fight's code (build-heat-maps.mjs's finishCode), read back

export const CELLS = 25;
export interface FinishTally {
  // (each cell: his fights still going at its start; his finishes there by method; the times he was finished)
  n: number[];
  won: { all: number[]; ko: number[]; sub: number[] };
  lost: { all: number[]; ko: number[]; sub: number[] };
  fights: number;
  wins: number;
  decisions: number;
  rounds5: boolean;
}
const zeros = () => Array(CELLS).fill(0) as number[];

// A fighter's codes split into fights, newest first (x: a format the grid can't hold, still one of his fights)
export const codesOf = (f: string): string[] => f.match(/../g) ?? [];

export function tallyFinishes(codes: string[]): FinishTally {
  const t: FinishTally = { n: zeros(), won: { all: zeros(), ko: zeros(), sub: zeros() }, lost: { all: zeros(), ko: zeros(), sub: zeros() }, fights: 0, wins: 0, decisions: 0, rounds5: false };
  for (const code of codes) {
    const [how, at] = code;
    if (how === 'x') continue;
    t.fights++;
    const decision = 'WLD'.includes(how);
    const through = decision ? Number(at) * 5 - 1 : parseInt(at, 36);
    for (let i = 0; i <= through && i < CELLS; i++) t.n[i]++;
    if (through >= 15) t.rounds5 = true;
    if (how === 'W' || 'KSF'.includes(how)) t.wins++;
    if (decision) {
      t.decisions++;
      continue;
    }
    if (how === 'n') continue;
    const side = how === how.toUpperCase() ? t.won : t.lost;
    side.all[through]++;
    if (how.toLowerCase() === 'k') side.ko[through]++;
    if (how.toLowerCase() === 's') side.sub[through]++;
  }
  return t;
}

// ---- the strikes: a sum's fields by name (build-heat-maps.mjs's SUM_FIELDS)

export type Sum = (name: string) => number;
export const sumOf = (fields: string[], row: number[]): Sum => {
  const at = new Map(fields.map((f, i) => [f, i]));
  return (name) => row[at.get(name) ?? -1] ?? 0;
};

// ---- the stats

const pct = (v: number) => `${Math.round(v * 100)}%`;
// (a small rate's tenth: "7.1%"; none, "0%")
const pct1 = (v: number) => `${v > 0 && v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`;
const dec2 = (v: number) => v.toFixed(2);
const clamp = (v: number) => Math.max(-1, Math.min(1, v)) || 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;

// (a rate's chance spread in a cell: the binomial's on the base rate, the base rate held to at least two in its
// sample, so a single finish in a dozen fights leans, two lean hard, and a minute with none reads faintly)
export const binomialSd = (p: number, n: number): number | null => (n > 0 ? Math.sqrt((Math.max(p, Math.min(0.5, 2 / n)) * (1 - Math.min(p, 0.99))) / n) : null);

interface Ctx {
  he: string;
  his: string;
  him: string;
}
const pronouns = (division: string | null): Ctx => (division && WOMENS.includes(division) ? { he: 'she', his: 'her', him: 'her' } : { he: 'he', his: 'his', him: 'him' });
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---- the splits and sides

export const SPLITS: HeatSplit[] = [
  { id: 'career', label: 'Career', title: 'The whole career' },
  { id: 'last5', label: 'Last 5', title: 'The last five fights (the career behind a thin cell, faded)' },
];
export const SIDES: HeatSplit[] = [
  { id: 'offense', label: 'Offense', title: 'What the fighter does: strikes landed, takedowns, finishes' },
  { id: 'defense', label: 'Defense', title: 'What the fighter takes: strikes absorbed, takedowns stopped, finishes against' },
];

// ---- the striking maps

const STRIKE_MIN = 10;
type StrikeKey = 'acc' | 'pm' | 'share';

// A strike map's cells (the figure's three targets summed over the positions, or the nine): the sum's numbers
// in the stat, against the division's; nothing on either side when there's no sum
function strikeCells(
  ids: string[],
  sum: Sum | null,
  base: Sum,
  key: StrikeKey,
  side: 'o' | 'd',
  sd: StrikeBase['sd'],
  cellIds: string[],
): { cells: HeatCell[]; landed: number } {
  // (each id's fields: a position's own, or a target's across the three positions)
  const fieldsOf = (id: string) => (id.includes('-') ? [id] : STRIKE_POSITIONS.map((p) => `${p.id}-${id}`));
  const landed = (s: Sum, id: string, p = side) => fieldsOf(id).reduce((a, f) => a + s(`${p}:${f}`), 0);
  const thrown = (s: Sum, id: string, p = side) => fieldsOf(id).reduce((a, f) => a + s(`${p}:${f}-att`), 0);
  const total = (s: Sum, p = side) => BODY_IDS.reduce((a, t) => a + landed(s, t, p), 0);
  const mins = (s: Sum) => s('secs') / 60;
  // (the division's: its landed are its absorbed, so it's the one side either way)
  const value = (s: Sum, id: string, p: 'o' | 'd'): number | null => {
    const l = landed(s, id, p);
    const t = thrown(s, id, p);
    if (key === 'acc') return t ? l / t : null;
    if (key === 'pm') return mins(s) ? l / mins(s) : null;
    return total(s, p) ? l / total(s, p) : null;
  };
  // (the spread: the division's fighters' in the cell, a target's across the positions as summed)
  const spreads = sd[(side === 'd' ? `d${key}` : key) as 'acc' | 'pm' | 'share' | 'dacc' | 'dpm' | 'dshare'];
  const spreadAt = (id: string) => spreads[cellIds.indexOf(id)] ?? null;
  const cells = ids.map((id) => {
    const n = sum ? thrown(sum, id) : 0;
    const l = sum ? landed(sum, id) : 0;
    return { id, n, made: key === 'acc' ? l : undefined, count: l, value: sum && n ? value(sum, id, side) : null, league: value(base, id, 'o'), sd: spreadAt(id) } satisfies HeatCell;
  });
  return { cells, landed: sum ? total(sum) : 0 };
}

function strikeStat(key: StrikeKey, defense: boolean, p: Ctx, minN: number): HeatStat & { title: string } {
  const vs = `${p.his} division`;
  const countNoun = defense ? 'strikes absorbed' : 'strikes landed';
  if (key === 'acc')
    return {
      key,
      label: defense ? 'Opp. accuracy' : 'Accuracy',
      title: defense ? `The share of the significant strikes thrown at ${p.him} that landed, against ${vs}'s` : `The share of ${p.his} significant strikes that landed, against ${vs}'s`,
      per: defense ? "opponents' accuracy" : 'accuracy',
      format: pct,
      sd: 0.06,
      minN,
      noun: 'strikes thrown',
      sample: 'landed / thrown',
      countNoun,
      vs,
    };
  if (key === 'pm')
    return {
      key,
      label: defense ? 'Absorbed a min' : 'Landed a min',
      title: defense ? `Significant strikes absorbed a minute of fight time, against ${vs}'s` : `Significant strikes landed a minute of fight time, against ${vs}'s`,
      per: defense ? 'absorbed a minute' : 'landed a minute',
      format: dec2,
      sd: 0.3,
      minN,
      noun: 'strikes thrown',
      countNoun,
      vs,
    };
  return {
    key,
    label: 'Share',
    title: defense ? `Where the strikes ${p.he} absorbs land, against where ${vs}'s do` : `Where ${p.his} strikes land, against where ${vs}'s do`,
    per: defense ? 'share of the strikes absorbed' : 'share of the strikes landed',
    format: pct,
    sd: 0.05,
    minN: 1,
    noun: 'strikes thrown',
    countNoun,
    scale: 'lean',
    ends: ['Less often', 'More often'],
    vs,
  };
}

// ---- the finishes map

type FinishKey = 'all' | 'ko' | 'sub';
const FINISH_STATS: { key: FinishKey; label: string; title: string }[] = [
  { key: 'all', label: 'All', title: 'Every finish: KO/TKO, submission, doctor and corner stoppages' },
  { key: 'ko', label: 'KO/TKO', title: 'Knockouts and technical knockouts' },
  { key: 'sub', label: 'Sub', title: 'Submissions' },
];
const FINISH_MIN = 3;

export function finishCells(t: FinishTally, clock: Clock, key: FinishKey, defense: boolean, rounds: number): HeatCell[] {
  const side = defense ? t.lost : t.won;
  return roundClockIds(rounds).map((id, i) => {
    const n = t.n[i];
    const made = side[key][i];
    const p = clock.n[i] ? clock[key][i] / clock.n[i] : null;
    const detail = key === 'all' && made ? [[side.ko[i] && `${side.ko[i]} by KO/TKO`, side.sub[i] && `${side.sub[i]} by submission`, made - side.ko[i] - side.sub[i] > 0 && `${made - side.ko[i] - side.sub[i]} other`].filter(Boolean).join(', ')] : undefined;
    return { id, n, made, count: made, value: n ? made / n : null, league: p, sd: p === null ? null : binomialSd(p, n), detail } satisfies HeatCell;
  });
}

function finishStat(key: FinishKey, defense: boolean, p: Ctx): HeatStat {
  const what = FINISH_STATS.find((s) => s.key === key)!;
  const by = key === 'all' ? '' : key === 'ko' ? ' by KO/TKO' : ' by submission';
  return {
    key,
    label: what.label,
    per: defense ? `finished${by}` : `finish rate${by}`,
    format: pct1,
    sd: 0.03,
    minN: FINISH_MIN,
    noun: 'fights still going',
    sample: defense ? 'finished / going' : 'finishes / going',
    countNoun: defense ? 'times finished' : 'finishes',
    vs: `${p.his} division`,
  };
}

// ---- the numbers beside the maps

// Grappling: the sum's rates against the division's average fighter's, by the spread among its fighters
export function grapplingChips(s: Sum, base: StrikeBase, defense: boolean, p: Ctx): HeatChip[] {
  const mins = s('secs') / 60;
  const ctrlMins = s('ctrlSecs') / 60;
  const side = defense ? 'd' : 'o';
  const avg = base.avg.go;
  const sd = defense ? base.sd.gd : base.sd.go;
  const tone = (v: number | null, mean: number | null | undefined, spread: number | null | undefined, lowerIsBetter = false) =>
    v === null || mean === null || mean === undefined || !spread ? 0 : clamp((((lowerIsBetter ? -1 : 1) * (v - mean)) / spread) * 0.5);
  const per15 = (v: number) => (mins >= 15 ? (v / mins) * 15 : null);
  const chips: HeatChip[] = [];
  const add = (label: string, v: number | null, fmt: (v: number) => string, sub: string, title: string, mean: number | null | undefined, spread: number | null | undefined, lower = false) => {
    if (v === null) return;
    chips.push({ label, value: fmt(v), sub, tone: tone(v, mean, spread, lower), title });
  };
  const [tdl, tda] = [s(`${side}:tdl`), s(`${side}:tda`)];
  const lg = (v: number | null | undefined, fmt: (v: number) => string) => (v === null || v === undefined ? '' : ` · division ${fmt(v)}`);
  if (!defense) {
    add('Takedowns a 15', per15(tdl), dec2, `${tdl} of ${tda} tried${lg(avg['td15'], dec2)}`, 'Takedowns landed a 15 minutes of fight time', avg['td15'], sd['td15']);
    add('Takedown accuracy', tda >= 5 ? tdl / tda : null, pct, `division ${pct(avg['tdAcc'] ?? 0)}`, 'The share of the takedowns tried that landed', avg['tdAcc'], sd['tdAcc']);
  } else {
    add('Takedown defense', tda >= 5 ? 1 - tdl / tda : null, pct, `${tdl} of ${tda} landed on ${p.him}`, `The share of the takedowns tried on ${p.him} ${p.he} stopped`, avg['tdAcc'] === null || avg['tdAcc'] === undefined ? null : 1 - avg['tdAcc'], sd['tdAcc']);
    add('Taken down a 15', per15(tdl), dec2, `division ${dec2(avg['td15'] ?? 0)}`, 'Takedowns landed on the fighter a 15 minutes', avg['td15'], sd['td15'], true);
  }
  // (control time: only the bouts ESPN kept it for)
  if (ctrlMins >= 15) {
    const share = s(`${side}:ctrl`) / 60 / ctrlMins;
    add(
      defense ? 'Controlled' : 'Control time',
      share,
      pct,
      `${mmss(share * 900)} a 15${lg(avg['ctrl'], pct)}`,
      defense ? `The share of the fight time ${p.he} spent controlled by ${p.his} opponents (the bouts ESPN keeps control time for)` : `The share of the fight time ${p.he} spent in control (the bouts ESPN keeps control time for)`,
      avg['ctrl'],
      sd['ctrl'],
      defense,
    );
  }
  add(defense ? 'Advances against' : 'Advances a 15', per15(s(`${side}:adv`)), dec2, `${s(`${side}:adv`)} in all${lg(avg['adv15'], dec2)}`, 'Ground advances (to half guard, side control, mount, the back) a 15 minutes', avg['adv15'], sd['adv15'], defense);
  add(defense ? 'Sub attempts against' : 'Sub attempts a 15', per15(s(`${side}:sub`)), dec2, `${s(`${side}:sub`)} in all${lg(avg['sub15'], dec2)}`, 'Submission attempts a 15 minutes', avg['sub15'], sd['sub15'], defense);
  add(defense ? 'Knocked down a 15' : 'Knockdowns a 15', per15(s(`${side}:kd`)), dec2, `${s(`${side}:kd`)} in all${lg(avg['kd15'], dec2)}`, defense ? 'Times knocked down a 15 minutes' : 'Knockdowns scored a 15 minutes', avg['kd15'], sd['kd15'], defense);
  return chips;
}

// Finishing: how often and how he finishes, or is finished, against the division's
export function finishChips(t: FinishTally, clock: Clock, defense: boolean, p: Ctx): HeatChip[] {
  const sum = (list: number[]) => list.reduce((a, v) => a + v, 0);
  const side = defense ? t.lost : t.won;
  const [all, ko, sub] = [sum(side.all), sum(side.ko), sum(side.sub)];
  const r1 = sum(side.all.slice(0, 5));
  const chips: HeatChip[] = [];
  const lgR1 = clock.finishes ? clock.r1 / clock.finishes : null;
  if (!defense) {
    const lg = clock.decisive ? clock.finishes / clock.decisive : null;
    const rate = t.wins ? all / t.wins : null;
    if (rate !== null)
      chips.push({
        label: 'Finish rate',
        value: pct(rate),
        sub: `${all} of ${plural(t.wins, 'win')}${lg !== null ? ` · division ${pct(lg)}` : ''}`,
        tone: lg === null ? 0 : clamp(((rate - lg) / (binomialSd(lg, t.wins) ?? 1)) * 0.5),
        title: `${cap(p.his)} wins inside the distance, of all ${p.his} wins`,
      });
  } else {
    const lg = clock.fights ? clock.finishes / (2 * clock.fights) : null;
    const rate = t.fights ? all / t.fights : null;
    if (rate !== null)
      chips.push({
        label: 'Finished',
        value: pct(rate),
        sub: `${all} of ${plural(t.fights, 'fight')}${lg !== null ? ` · division ${pct(lg)}` : ''}`,
        tone: lg === null ? 0 : clamp(((lg - rate) / (binomialSd(lg, t.fights) ?? 1)) * 0.5),
        title: `The fights ${p.he} lost inside the distance, of all ${p.his} fights`,
      });
  }
  const share = (n: number, of: number) => (of ? ` · ${pct(n / of)}` : '');
  chips.push(
    { label: defense ? 'By KO/TKO' : 'KO/TKO', value: String(ko), sub: defense ? `of ${plural(t.fights, 'fight')}` : `of ${plural(t.wins, 'win')}${share(ko, t.wins)}`, tone: 0, title: defense ? 'Times stopped by strikes' : 'Wins by knockout or technical knockout' },
    { label: defense ? 'By submission' : 'Submissions', value: String(sub), sub: defense ? `of ${plural(t.fights, 'fight')}` : `of ${plural(t.wins, 'win')}${share(sub, t.wins)}`, tone: 0, title: defense ? 'Times submitted' : 'Wins by submission' },
  );
  if (all)
    chips.push({
      label: 'In round 1',
      value: String(r1),
      sub: `${pct(r1 / all)} of them${lgR1 !== null ? ` · division ${pct(lgR1)}` : ''}`,
      tone: 0,
      title: defense ? 'Times finished in the first round' : 'Finishes in the first round',
    });
  chips.push({ label: 'Went the distance', value: String(t.decisions), sub: `of ${plural(t.fights, 'fight')}${share(t.decisions, t.fights)}`, tone: 0, title: 'Fights that went to the final bell (decisions and draws)' });
  return chips;
}

// ---- the maps

export function mmaHeatMaps(): HeatMapDef[] {
  // (the row's entry and the division's base rates; null: nothing for this card)
  const source = async (q: HeatQuery) => {
    const division = divisionOf(q.player, q.position);
    if (!division) return null;
    const [main, file] = await Promise.all([mainFile(), divisionFile(division)]);
    const base = main?.divisions[division];
    const entry = file?.fighters[String(q.player.gsisId)];
    if (!main || !base || !entry) return null;
    return { main, base, entry, division, p: pronouns(division) };
  };
  const last5 = (q: HeatQuery) => q.split === 'last5';
  const fallbackOf = (cells: HeatCell[] | null, p: Ctx): Partial<HeatMapData> => (cells ? { fallback: cells, fallbackLabel: 'Career', seasonLabel: 'Last 5', fallbackNote: `Faded: ${p.his} career` } : {});

  const strikes = (id: string, surface: HeatSurfaceId, ids: string[], title: (defense: boolean, p: Ctx) => string, chips: boolean): HeatMapDef => ({
    id,
    positions: MMA_HEAT_POSITIONS,
    surface,
    group: 'strikes',
    numbers: true,
    splits: () => SPLITS,
    sides: () => SIDES,
    load: async (q) => {
      const src = await source(q);
      if (!src?.entry.c || !src.base.strikes) return null;
      const { main, entry, p } = src;
      const base = src.base.strikes;
      const defense = q.side === 'defense';
      const fields = main.fields.sum;
      const career = sumOf(fields, entry.c!);
      // (the last five: their own sum, or the career when that's all there is)
      const sum = last5(q) && entry.l ? sumOf(fields, entry.l) : career;
      const baseSum = sumOf(fields, base.sum);
      const keys: StrikeKey[] = ['acc', 'pm', 'share'];
      const key = keys.find((k) => k === q.stat) ?? 'acc';
      const stat = strikeStat(key, defense, p, STRIKE_MIN);
      const sd = base.sd;
      const now = strikeCells(ids, sum, baseSum, key, defense ? 'd' : 'o', sd, main.fields.cells);
      const behind = last5(q) && entry.l ? strikeCells(ids, career, baseSum, key, defense ? 'd' : 'o', sd, main.fields.cells).cells : null;
      const bouts = sum('n');
      return {
        surface,
        title: title(defense, p),
        count: `${plural(now.landed, defense ? 'absorbed' : 'landed', defense ? 'absorbed' : 'landed')} · ${plural(bouts, 'UFC fight')}${last5(q) && !entry.l ? ' (all of them)' : ''}`,
        help: `Significant strikes ${defense ? `landed on ${p.him}` : `${p.he} landed`}, by ${surface === 'body' ? 'target' : 'the position they came from and their target'}, each against ${p.his} division's; a cell short of ${STRIKE_MIN} strikes thrown greyed. ESPN's numbers (the UFC's, FightMetric's), ${p.his} UFC fights`,
        stats: keys.map((k) => {
          const s = strikeStat(k, defense, p, STRIKE_MIN);
          return { key: s.key, label: s.label, title: s.title };
        }),
        stat,
        cells: now.cells,
        defense,
        ...(chips ? { chips: grapplingChips(sum, base, defense, p), chipsTitle: defense ? 'Grappling Defense' : 'Grappling' } : {}),
        ...fallbackOf(behind, p),
      } satisfies HeatMapData;
    },
  });

  const finishes: HeatMapDef = {
    id: 'finishes',
    positions: MMA_HEAT_POSITIONS,
    surface: 'round-clock',
    group: 'finishes',
    numbers: true,
    splits: () => SPLITS,
    sides: () => SIDES,
    load: async (q) => {
      const src = await source(q);
      if (!src?.base.clock) return null;
      const { base, entry, p } = src;
      const clock = base.clock!;
      const defense = q.side === 'defense';
      const codes = codesOf(entry.f);
      const career = tallyFinishes(codes);
      const t = last5(q) ? tallyFinishes(codes.slice(0, 5)) : career;
      if (!t.fights) return null;
      const key = FINISH_STATS.find((s) => s.key === q.stat)?.key ?? 'all';
      // (five rounds once there's a five-round fight in the split; three else)
      const rounds = t.rounds5 ? 5 : 3;
      const surface: HeatSurfaceId = rounds === 5 ? 'round-clock' : 'round-clock-3';
      const side = defense ? t.lost : t.won;
      const done = side.all.reduce((a, v) => a + v, 0);
      return {
        surface,
        title: defense ? `When ${cap(p.he)}'s Finished` : `When ${cap(p.he)} Finishes`,
        count: defense ? `finished ${plural(done, 'time')} in ${plural(t.fights, 'fight')}` : `${plural(done, 'finish', 'finishes')} in ${plural(t.fights, 'fight')}`,
        help: `Each minute of each round: the share of ${p.his} fights still going at its start that ${defense ? `ended with ${p.him} finished` : `${p.he} finished`} in it, against ${p.his} division's in the same minute; a minute with under ${FINISH_MIN} fights going greyed. Every fight ESPN has, in every promotion it covers`,
        stats: FINISH_STATS.map((s) => ({ key: s.key, label: s.label, title: s.title })),
        stat: finishStat(key, defense, p),
        cells: finishCells(t, clock, key, defense, rounds),
        defense,
        chips: finishChips(t, clock, defense, p),
        chipsTitle: defense ? 'Finished' : 'Finishing',
        ...fallbackOf(last5(q) ? finishCells(career, clock, key, defense, rounds) : null, p),
      } satisfies HeatMapData;
    },
  };

  return [
    strikes('targets', 'body', BODY_IDS, (defense) => (defense ? 'Strikes Absorbed' : 'Strikes by Target'), true),
    strikes('positions', 'body-3', BODY_3_IDS, (defense) => (defense ? 'Absorbed by Position' : 'By Position'), false),
    finishes,
  ];
}

