import type { EngineHost, SportSettings, ValueContext } from '@ranker/engine/sport';
import { Observable, combineLatest, distinctUntilChanged, map, merge, shareReplay, tap } from 'rxjs';
import {
  FantasyScoring,
  RANK_METRICS,
  RankBasis,
  SkillPlayer,
  SkillPosition,
  SkillStat,
  SkillStatKey,
  fantasyPoints,
  unitStat,
} from '@sport/positions';
import { dataWeight, newHeadCoach, preseasonCoaching, preseasonOline, preseasonWeapons, responsibilityWhy, teamGamesPlayed } from '@sport/qb-rows';
import { GradePart, GradeWhy, gradePart, pctText } from '@ranker/engine/grade-why';
import { grade as gradeLetter } from '@ranker/core/format';

// The NFL's values worked out in the app (SPORT.computedValue): fantasy points in the chosen scoring,
// the head coaches' league ranks, and the team grades each tab gets from the others' rankings (a
// better O-line on the Offensive Lines tab is a better O-line grade on every tab).

// ---------------------------------------------------------------------------
// League ranks (1 = best) for the head coaches' offense and defense, and the defenses' against the pass
// and the run, on the stat the Rank Base setting picks. Ties share a rank; a missing value has none (a
// season written before the pass and run splits: "-"). Worked out once per season's rows and setting.
// ---------------------------------------------------------------------------
export type UnitRankKey = keyof typeof RANK_METRICS;

function unitRanks(units: SkillPlayer[], settings: SportSettings): Map<SkillPlayer, Record<UnitRankKey, number | null>> {
  const basis = settings['rankBasis'] as RankBasis;
  const empty = () => Object.fromEntries(Object.keys(RANK_METRICS).map((key) => [key, null])) as Record<UnitRankKey, number | null>;
  const ranks = new Map(units.map((unit) => [unit, empty()]));
  for (const key of Object.keys(RANK_METRICS) as UnitRankKey[]) {
    const [stat, higherIsBetter] = RANK_METRICS[key][basis];
    const values = units.map((unit) => unitStat(unit, stat, settings));
    units.forEach((unit, i) => {
      const v = values[i];
      if (v === null || v === undefined) return;
      const better = values.filter((o) => o !== null && o !== undefined && (higherIsBetter ? o > v : o < v)).length;
      ranks.get(unit)![key] = better + 1;
    });
  }
  return ranks;
}

const rankCache = new WeakMap<SkillPlayer[], Map<string, Map<SkillPlayer, Record<UnitRankKey, number | null>>>>();

function rankOf(player: SkillPlayer, key: UnitRankKey, units: SkillPlayer[], settings: SportSettings): number | null {
  let bySetting = rankCache.get(units);
  if (!bySetting) rankCache.set(units, (bySetting = new Map()));
  const settingKey = `${settings['rankBasis']}.${settings['garbageTime']}`;
  let ranks = bySetting.get(settingKey);
  if (!ranks) bySetting.set(settingKey, (ranks = unitRanks(units, settings)));
  return ranks.get(player)?.[key] ?? null;
}

// ---------------------------------------------------------------------------
// Team grades (0-12) from the tabs' rankings, as last shown (drags included; the default slider
// ranking before a tab has been opened). Each tab only re-sorts while it's on screen, so they can feed
// each other without looping.
// ---------------------------------------------------------------------------

// Team grades from a ranked list: #1 grades 12 (A+), last grades 0 (F)
function gradesByRank(ranked: { teamLogo: string }[]): Map<string, number> {
  const last = Math.max(ranked.length - 1, 1);
  return new Map(ranked.map((unit, rank) => [unit.teamLogo, 12 * (1 - rank / last)]));
}

// Grades on a curve: highest score grades 12 (A+), lowest 0 (F), the rest spread evenly by rank.
// Used for every support grade, so each always runs the full F to A+ range.
function curveGrades<K>(scores: Map<K, number>): Map<K, number> {
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const last = Math.max(ranked.length - 1, 1);
  return new Map(ranked.map(([key], rank) => [key, 12 * (1 - rank / last)]));
}

// Only emit when some team's grade actually changed; shared so every tab sees the same grades
function distinctGrades() {
  return (source: Observable<Map<string, number>>) =>
    source.pipe(
      distinctUntilChanged<Map<string, number>>(
        (a, b) => a.size === b.size && [...a].every(([team, grade]) => b.get(team) === grade),
      ),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
}

// A team grade for one position from its ranked list: each player graded by his spot (#1 = 12,
// last = 0), averaged per team weighted by usage (carries, targets...)
function teamGradesByUsage(ranked: SkillPlayer[], usage: (player: SkillPlayer) => number): Map<string, number> {
  const last = Math.max(ranked.length - 1, 1);
  const totals = new Map<string, { sum: number; usage: number }>();
  ranked.forEach((player, rank) => {
    const weight = usage(player);
    if (!weight) return;
    const total = totals.get(player.teamLogo) ?? { sum: 0, usage: 0 };
    totals.set(player.teamLogo, { sum: total.sum + 12 * (1 - rank / last) * weight, usage: total.usage + weight });
  });
  return new Map([...totals].map(([team, { sum, usage }]) => [team, sum / usage]));
}

// A receiver's targets, or his catches in the seasons that didn't record targets (2003-2008)
const looks = (p: SkillPlayer) => p.stats.targets ?? p.stats.receptions ?? 0;

// How much each position counts toward a team's weapons grade (receivers lead: it's mostly about
// who the QB throws to). A team missing a position splits its share among the others.
const WEAPONS_SHARES: [SkillPosition, number, (player: SkillPlayer) => number][] = [
  ['WR', 0.5, (p) => looks(p)],
  ['RB', 0.3, (p) => (p.stats.carries ?? 0) + looks(p)],
  ['TE', 0.2, (p) => looks(p)],
];

// The O-line grade's two leans, from the Offensive Lines tab's sliders: for QBs pass protection counts
// five times run blocking, for RBs the reverse (penalties count the same either way); head coaches
// get the balanced grade. OLINE_LEAN: which, by tab (the column reads "O-Line (Pass)").
// The pass lean leans on the per-dropback stats; total sacks stay at their usual weight, since a team
// that runs a lot drops back less and gives up fewer whatever its line.
const PASS_PRO = ['qbHitRate', 'pressureRate', 'sackRate', 'timeToThrow'];
const PASS_TOTALS = ['sacksAllowed'];
const RUN_BLOCKING = ['ypc', 'stuffRate', 'shortYardagePct', 'runEpa', 'runSuccess', 'yardsBeforeContact'];
const lean = (more: string[], less: string[]) =>
  Object.fromEntries([...more.map((key) => [key, 1.5]), ...less.map((key) => [key, 0.3])]);
const PASS_LEAN = lean(PASS_PRO, RUN_BLOCKING);
const RUN_LEAN = lean(RUN_BLOCKING, [...PASS_PRO, ...PASS_TOTALS]);
export const OLINE_LEAN: Record<string, 'Pass' | 'Run'> = { QB: 'Pass', RB: 'Run' };

// The grades every tab reads (team logo -> 0-12), kept current by connectTeamGrades, and what they were
// worked out from (a grade's breakdown, gradeWhy below): each tab's list as ranked, and this season's grades
// before the blend with preseason. Replaced whole on every change, never changed in place, so keepTeamGrades
// can hold on to them as they were.
type SeasonKey = 'oline' | 'olinePass' | 'olineRun' | 'weapons' | 'coaching';
interface GradeState {
  defense: Map<string, number>;
  qbPlay: Map<string, number>;
  rbPlay: Map<string, number>;
  // Preseason blended with the Offensive Lines / RB, WR and TE / Head Coaches rankings, then curved
  oline: Map<string, number>;
  olinePass: Map<string, number>;
  olineRun: Map<string, number>;
  weapons: Map<string, number>;
  coaching: Map<string, number>;
  // (this season's, before the blend)
  season: Partial<Record<SeasonKey, Map<string, number>>>;
  // (the lists as ranked; OLPass and OLRun: the Offensive Lines leaned)
  lists: Partial<Record<SkillPosition | 'OLPass' | 'OLRun', SkillPlayer[]>>;
}
let state: GradeState = {
  defense: new Map(),
  qbPlay: new Map(),
  rbPlay: new Map(),
  oline: new Map(),
  olinePass: new Map(),
  olineRun: new Map(),
  weapons: new Map(),
  coaching: new Map(),
  season: {},
  lists: {},
};
const keepList = (key: keyof GradeState['lists']) => (list: SkillPlayer[]) => {
  state = { ...state, lists: { ...state.lists, [key]: list } };
};

// SPORT.connect: the grade streams from the engine's rankings, subscribed once at startup (before any
// page, so the grades are current when the pages hear about a change). Fires when any grade changes.
export function connectTeamGrades(host: EngineHost): Observable<unknown> {
  const ranked = (position: SkillPosition) => host.rankedUnits(position);
  const teamGradesFrom = (position: 'DEF' | 'HC' | 'OL') => ranked(position).pipe(tap(keepList(position)), map(gradesByRank), distinctGrades());

  // Every team in the loaded season (logo path), for grades that cover the whole league (31 teams
  // before 2002)
  const allTeams = () => (host.rows()['DEF'] ?? []).map((unit) => unit.teamLogo);

  // A team grade that starts from preseason: each team's preseason grade blended with this season's
  // grade (leaning on this season more with every game played), then curved so the best team is an
  // A+ and the worst an F
  const blendedCurve = (preseason: (team: string) => number, season: Map<string, number>): Map<string, number> =>
    curveGrades(new Map(allTeams().map((team) => [team, blendScore(preseason(team), season.get(team), team)])));

  const defense$ = teamGradesFrom('DEF');
  const coaching$ = teamGradesFrom('HC');
  const oline$ = teamGradesFrom('OL');
  const olinePass$ = host.rankedUnits('OL', PASS_LEAN).pipe(tap(keepList('OLPass')), map(gradesByRank), distinctGrades());
  const olineRun$ = host.rankedUnits('OL', RUN_LEAN).pipe(tap(keepList('OLRun')), map(gradesByRank), distinctGrades());

  // QB Play: each QB graded by his spot in the QB rankings (#1 = 12, last = 0), averaged per team by
  // his starts there, then curved
  const qbPlay$ = ranked('QB').pipe(
    tap(keepList('QB')),
    map((list) => curveGrades(qbPlayScores(list))),
    distinctGrades(),
  );

  // RB Play: each back graded by his spot in the RB rankings, averaged per team weighted by carries,
  // so the lead back counts most
  const rbPlay$ = ranked('RB').pipe(
    tap(keepList('RB')),
    map((list) => curveGrades(teamGradesByUsage(list, RB_USAGE))),
    distinctGrades(),
  );

  // Weapons from this season: the team's RBs, WRs and TEs graded by the RB / WR / TE tabs' orders
  // (by usage within each position), combined by WEAPONS_SHARES; blended with preseason below
  const weapons$ = combineLatest(WEAPONS_SHARES.map(([position]) => ranked(position))).pipe(
    tap((lists) => WEAPONS_SHARES.forEach(([position], i) => keepList(position)(lists[i]))),
    map((lists) => new Map([...weaponsGroups(lists)].map(([team, groups]) => [team, groups.reduce((sum, g) => sum + g.grade * g.share, 0)]))),
    distinctGrades(),
  );

  // (this season's kept beside the blend, for the breakdowns)
  const blended = (key: SeasonKey, preseason: (team: string) => number) => (grades: Map<string, number>) => {
    state = { ...state, season: { ...state.season, [key]: grades }, [key]: blendedCurve(preseason, grades) };
  };
  oline$.subscribe(blended('oline', preseasonOline));
  olinePass$.subscribe(blended('olinePass', preseasonOline));
  olineRun$.subscribe(blended('olineRun', preseasonOline));
  weapons$.subscribe(blended('weapons', preseasonWeapons));
  coaching$.subscribe(blended('coaching', preseasonCoaching));
  defense$.subscribe((grades) => (state = { ...state, defense: grades }));
  qbPlay$.subscribe((grades) => (state = { ...state, qbPlay: grades }));
  rbPlay$.subscribe((grades) => (state = { ...state, rbPlay: grades }));
  return merge(defense$, coaching$, qbPlay$, oline$, olinePass$, olineRun$, weapons$, rbPlay$);
}

// A team's preseason grade blended with this season's (none yet: preseason alone)
function blendScore(preseason: number, season: number | undefined, team: string): number {
  return season === undefined ? preseason : preseason + (season - preseason) * dataWeight(teamGamesPlayed(team));
}

// QB Play's scores before the curve: each QB graded by his spot in the QB rankings, averaged per team by his
// starts there
function qbPlayScores(list: SkillPlayer[]): Map<string, number> {
  const last = Math.max(list.length - 1, 1);
  const totals = new Map<string, { sum: number; starts: number }>();
  list.forEach((qb, rank) => {
    for (const [team, starts] of Object.entries(qb.starts ?? {})) {
      const total = totals.get(team) ?? { sum: 0, starts: 0 };
      totals.set(team, { sum: total.sum + 12 * (1 - rank / last) * starts, starts: total.starts + starts });
    }
  });
  return new Map([...totals].map(([team, { sum, starts }]) => [team, sum / starts]));
}

const RB_USAGE = (rb: SkillPlayer) => rb.stats.carries ?? 0;

// Weapons' groups per team: each position's grade (by usage within it) and its share of this season's
// weapons grade (WEAPONS_SHARES; a position the team doesn't have split among the others)
function weaponsGroups(lists: SkillPlayer[][]): Map<string, { position: SkillPosition; grade: number; share: number }[]> {
  const byPosition = lists.map((list, i) => teamGradesByUsage(list, WEAPONS_SHARES[i][2]));
  const teams = new Set(byPosition.flatMap((grades) => [...grades.keys()]));
  return new Map(
    [...teams].map((team) => {
      const groups = WEAPONS_SHARES.flatMap(([position, share], i) => {
        const grade = byPosition[i].get(team);
        return grade === undefined ? [] : [{ position, grade, share }];
      });
      const shares = groups.reduce((sum, g) => sum + g.share, 0);
      return [team, groups.map((g) => ({ ...g, share: g.share / shares }))];
    }),
  );
}

// SPORT.keepGrades: every grade as it is now, and a way to put them back (each stream above sets a new
// state, so the kept one is left as it was)
export function keepTeamGrades(): () => void {
  const kept = state;
  return () => {
    state = kept;
  };
}

// The grades from other tabs (support stats but a QB's own Responsibility, and the Teams tab's roster
// grades, the same grades as the team's own strengths): the table's season only
const TEAM_GRADES = new Set(['qbPlay', 'rbPlay', 'weapons', 'oline', 'defense', 'coaching']);
export function fromOtherTabs(stat: SkillStat): boolean {
  return (!!stat.support && stat.key !== 'responsibility') || TEAM_GRADES.has(stat.key);
}

// SPORT.computedValue: fantasy points, unit ranks and team grades; undefined reads the data
export function computedValue(player: SkillPlayer, stat: SkillStat, context: ValueContext): number | null | undefined {
  const { settings } = context;
  switch (stat.key) {
    // (a default ranking scores PPR)
    case 'fantasy': {
      const scoring = (context.defaults ? 'ppr' : settings['fantasyScoring']) as FantasyScoring;
      return fantasyPoints(player.stats.fantasyStd ?? 0, player.stats.receptions ?? 0, scoring);
    }
    case 'offRank':
    case 'defRank':
    case 'passDefRank':
    case 'runDefRank':
      return rankOf(player, stat.key, context.rows[context.position] ?? [], settings);
  }
  if (!fromOtherTabs(stat)) return undefined;
  // Another season's card, or a default ranking: grades from other tabs count as average
  if (context.defaults || !context.tableSeason) return null;
  const team = player.teamLogo;
  switch (stat.key) {
    // (a QB's leans on pass protection, a back's on run blocking)
    case 'oline': {
      const lean = OLINE_LEAN[context.position];
      const curve = lean === 'Pass' ? state.olinePass : lean === 'Run' ? state.olineRun : state.oline;
      return Math.round(curve.get(team) ?? 6);
    }
    case 'weapons':
      return Math.round(state.weapons.get(team) ?? 6);
    case 'coaching':
      return Math.round(state.coaching.get(team) ?? 6);
    // Teams without a graded QB yet count as average
    case 'qbPlay':
      return state.qbPlay.get(team) ?? 6;
    case 'rbPlay':
      return state.rbPlay.get(team) ?? 6;
    case 'defense':
      return Math.round(state.defense.get(team) ?? 6);
    default:
      return unitStat(player, stat.key as SkillStatKey, settings);
  }
}

// ---------------------------------------------------------------------------
// SPORT.gradeWhy: what makes a support grade (its cell clicked in the grid), from the same lists and the
// same math as the grades above, so the parts add up to the score the grade was curved from. Each input is
// on the grade's 0-12 scale: a player or a unit by his spot in his tab's ranking (#1 = 12, last = 0), a
// preseason grade, this season's stats grade.
// ---------------------------------------------------------------------------
const listGrade = (rank: number, of: number) => 12 * (1 - rank / Math.max(of - 1, 1));

// A score's place on its curve (the curve's own grade gives it back: #1 = 12, last = 0)
function placeOn(curve: Map<string, number>, team: string): { rank: number; of: number } | null {
  const grade = curve.get(team);
  if (grade === undefined) return null;
  const last = Math.max(curve.size - 1, 1);
  return { rank: Math.round((1 - grade / 12) * last) + 1, of: curve.size };
}

// The players behind a usage-weighted grade (RB Play's carries, a weapons group's looks), each a part: his
// spot in his tab's ranking, his share of the team's usage
function usageParts(list: SkillPlayer[], team: string, usage: (player: SkillPlayer) => number, tab: string, usageText: (n: number) => string): GradePart[] {
  const rows = list.map((player, rank) => ({ player, rank, used: usage(player) })).filter((r) => r.used > 0 && r.player.teamLogo === team);
  const total = rows.reduce((sum, r) => sum + r.used, 0);
  return rows.map(({ player, rank, used }) =>
    gradePart({
      key: player.gsisId,
      label: player.name,
      value: `#${rank + 1}`,
      place: null,
      grade: listGrade(rank, list.length),
      weight: used / total,
      title: `${player.name}: #${rank + 1} of ${list.length} in your ${tab} rankings, ${usageText(used)} (${pctText(used / total)} of the team's)`,
    }),
  );
}

// A grade that starts from preseason: this season's part(s) at the season's weight, preseason at the rest
function blendedWhy(team: string, key: SeasonKey, shown: number, seasonParts: (weight: number) => GradePart[], preseason: number, preseasonTitle: string): GradeWhy | null {
  const at = placeOn(state[key], team);
  if (!at) return null;
  const season = state.season[key]?.get(team);
  const weight = season === undefined ? 0 : dataWeight(teamGamesPlayed(team));
  const parts = weight > 0 ? seasonParts(weight) : [];
  if (weight < 1) {
    parts.push(gradePart({ key: 'preseason', label: 'Preseason', value: gradeLetter(preseason), place: null, grade: preseason, weight: 1 - weight, title: preseasonTitle }));
  }
  const games = teamGamesPlayed(team);
  const notes =
    weight < 1
      ? [season === undefined ? 'No games yet: the preseason grade alone' : `Early season: this season counts ${pctText(weight)} after ${games} game${games === 1 ? '' : 's'}, all of it from 10`]
      : [];
  return {
    grade: shown,
    score: parts.reduce((sum, p) => sum + p.amount, 0),
    parts,
    curve: { ...at, among: 'teams', on: 'score' },
    facts: [],
    notes,
    foot: 'Each part: its grade (F 0 to A+ 12) times its weight. The score is then curved over the teams: the best an A+, the worst an F',
  };
}

const WEAPON_GROUPS: Record<string, string> = { WR: 'Receivers', RB: 'Backs', TE: 'Tight ends' };

export function gradeWhy(player: SkillPlayer, stat: SkillStat, shown: number, context: ValueContext): GradeWhy | null {
  if (context.defaults || !context.tableSeason) return null;
  const team = player.teamLogo;
  const lists = state.lists;
  switch (stat.key) {
    case 'qbPlay': {
      const list = lists.QB;
      const at = placeOn(state.qbPlay, team);
      if (!list || !at) return null;
      // (a QB's starts for this team: a traded one's for his other team don't count here)
      const rows = list.map((qb, rank) => ({ qb, rank, starts: qb.starts?.[team] ?? 0 })).filter((r) => r.starts > 0);
      const total = rows.reduce((sum, r) => sum + r.starts, 0);
      const parts = rows.map(({ qb, rank, starts }) =>
        gradePart({
          key: qb.gsisId,
          label: qb.name,
          value: `#${rank + 1}`,
          place: null,
          grade: listGrade(rank, list.length),
          weight: starts / total,
          title: `${qb.name}: #${rank + 1} of ${list.length} in your QB rankings, ${starts} start${starts === 1 ? '' : 's'} here (${pctText(starts / total)} of the team's)`,
        }),
      );
      return {
        grade: shown,
        score: parts.reduce((sum, p) => sum + p.amount, 0),
        parts: parts.sort((a, b) => b.amount - a.amount),
        curve: { ...at, among: 'teams', on: 'score' },
        facts: [],
        notes: [],
        foot: 'Each QB: his spot in your QB rankings (#1 an A+, last an F) times his share of the starts. The score is then curved over the teams',
      };
    }
    case 'rbPlay': {
      const list = lists.RB;
      const at = placeOn(state.rbPlay, team);
      if (!list || !at) return null;
      const parts = usageParts(list, team, RB_USAGE, 'RB', (n) => `${n} carries`);
      return {
        grade: shown,
        score: parts.reduce((sum, p) => sum + p.amount, 0),
        parts: parts.sort((a, b) => b.amount - a.amount),
        curve: { ...at, among: 'teams', on: 'score' },
        facts: [],
        notes: [],
        foot: 'Each back: his spot in your RB rankings (#1 an A+, last an F) times his share of the carries. The score is then curved over the teams',
      };
    }
    case 'weapons': {
      const wanted = WEAPONS_SHARES.map(([position]) => lists[position]);
      if (wanted.some((list) => !list)) return null;
      const groups = weaponsGroups(wanted as SkillPlayer[][]).get(team) ?? [];
      return blendedWhy(
        team,
        'weapons',
        shown,
        (weight) =>
          groups.map((g) => {
            const i = WEAPONS_SHARES.findIndex(([position]) => position === g.position);
            const players = usageParts(wanted[i]!, team, WEAPONS_SHARES[i][2], g.position, (n) => `${n} ${g.position === 'RB' ? 'touches' : 'targets'}`)
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 4)
              .map((p) => `${p.label} ${p.value} (${pctText(p.weight)})`);
            return gradePart({
              key: g.position,
              label: `${WEAPON_GROUPS[g.position]} (${g.position})`,
              value: gradeLetter(g.grade),
              place: null,
              grade: g.grade,
              weight: g.share * weight,
              title: `${WEAPON_GROUPS[g.position]}: each by his spot in your ${g.position} rankings, weighted by his ${g.position === 'RB' ? 'carries and targets' : 'targets'}: ${players.join(', ')}\n${pctText(g.share)} of this season's weapons grade`,
            });
          }),
        preseasonWeapons(team),
        "The team's preseason weapons grade",
      );
    }
    case 'oline':
    case 'coaching': {
      const oline = stat.key === 'oline';
      const lean = oline ? OLINE_LEAN[context.position] : undefined;
      const key: SeasonKey = !oline ? 'coaching' : lean === 'Pass' ? 'olinePass' : lean === 'Run' ? 'olineRun' : 'oline';
      const list = lists[!oline ? 'HC' : lean === 'Pass' ? 'OLPass' : lean === 'Run' ? 'OLRun' : 'OL'];
      if (!list) return null;
      const rank = list.findIndex((unit) => unit.teamLogo === team);
      const tab = oline ? `Offensive Lines rankings${lean ? ` (${lean === 'Pass' ? 'pass protection' : 'run blocking'} counting most)` : ''}` : 'Head Coaches rankings';
      const why = blendedWhy(
        team,
        key,
        shown,
        (weight) =>
          rank < 0
            ? []
            : [
                gradePart({
                  key: 'season',
                  label: list[rank].name,
                  value: `#${rank + 1}`,
                  place: null,
                  grade: listGrade(rank, list.length),
                  weight,
                  title: `${list[rank].name}: #${rank + 1} of ${list.length} in your ${tab}`,
                }),
              ],
        oline ? preseasonOline(team) : preseasonCoaching(team),
        oline ? "The team's preseason O-line grade" : newHeadCoach(team) ? 'A first-year head coach: no track record, so a C' : "The team's preseason coaching grade",
      );
      if (why && lean) why.notes.push(`For ${lean === 'Pass' ? 'a QB, pass protection' : 'a back, run blocking'} counts most: your O-line ranking with ${lean === 'Pass' ? 'the pass-pro sliders at 1.5 times and the run-blocking ones at 0.3' : 'the run-blocking sliders at 1.5 times and the pass-pro ones at 0.3'}`);
      if (why && !oline && newHeadCoach(team)) why.notes.push('First-year head coach: his preseason grade is a C');
      return why;
    }
    case 'defense': {
      const list = lists.DEF;
      const rank = list?.findIndex((unit) => unit.teamLogo === team) ?? -1;
      if (!list || rank < 0) return null;
      const grade = listGrade(rank, list.length);
      return {
        grade: shown,
        score: grade,
        parts: [
          gradePart({
            key: 'season',
            label: list[rank].name,
            value: `#${rank + 1}`,
            place: null,
            grade,
            weight: 1,
            title: `${list[rank].name}: #${rank + 1} of ${list.length} in your Defenses rankings`,
          }),
        ],
        curve: null,
        facts: [],
        notes: [],
        foot: "The defense's spot in your Defenses rankings is the grade: #1 an A+, last an F, evenly between",
      };
    }
    case 'responsibility': {
      const why = responsibilityWhy(player.id);
      if (!why) return null;
      const share = (v: number | null | undefined) => (v === null || v === undefined ? '-' : pctText(v));
      const parts: GradePart[] = [];
      if (why.weight > 0 && why.fromData !== null) {
        parts.push(
          gradePart({
            key: 'season',
            label: 'This season',
            value: gradeLetter(why.fromData),
            place: null,
            grade: why.fromData,
            weight: why.weight,
            title: "His shares of his team's plays and yards in the games he led, each against the league's QBs, averaged and graded",
          }),
        );
      }
      if (why.weight < 1) {
        parts.push(gradePart({ key: 'preseason', label: 'Preseason', value: gradeLetter(why.preseason), place: null, grade: why.preseason, weight: 1 - why.weight, title: 'His preseason Responsibility score' }));
      }
      return {
        grade: shown,
        score: parts.reduce((sum, p) => sum + p.amount, 0),
        parts,
        curve: { rank: why.rank, of: why.of, among: 'QBs', on: 'score' },
        facts: why.metrics
          ? [
              { label: 'Share of the plays', value: share(why.metrics.playShare), title: "His dropbacks and designed runs, of his team's plays in the games he led" },
              { label: 'Share of the yards', value: share(why.metrics.yardShare), title: "His passing and rushing yards, of his team's in the games he led" },
            ]
          : [],
        notes: why.weight < 1 ? [`Early season: this season counts ${pctText(why.weight)} after ${why.games} game${why.games === 1 ? '' : 's'}, all of it from 10`] : [],
        foot: "Each part: its grade times its weight. The score is then curved over the season's QBs: the most responsible an A+",
      };
    }
  }
  return null;
}
