import type { SkillPlayer, SkillStat } from '@sport/positions';
import type { ValueContext } from './sport';
import { grade as gradeLetter, ordinal } from '@ranker/core/format';

// What makes a support grade (a grade cell clicked in the grid: SportConfig.gradeWhy). Every grade is
// built the same way: a few inputs, each on the grade's own 0-12 scale (F to A+) with a weight, adding up
// to a score; then, for most, that score's place among the league's (the curve: the best an A+, the worst
// an F, evenly between). The numbers are the grade's own, from where it's worked out (the NFL's team
// grades from the tabs' rankings, team-grades.ts; the other sports' from their data scripts' inputs,
// gradeIn below), so the parts add up to the score, and the curve gives the grade shown.

// One input: what it is, its value as read, its place in the league, its grade, its weight in the score
// and what that adds (weight x grade)
export interface GradePart {
  key: string;
  label: string;
  // (as read: "#3 of 38", "51.2%"; empty: none to show)
  value: string;
  // (its place in the league or the list, "3rd"; none: not a ranked input)
  place: string | null;
  grade: number;
  weight: number;
  amount: number;
  title: string;
}

export interface GradeWhy {
  // The grade shown (0-12)
  grade: number;
  // What the parts add up to (on the grade's scale); the curve turns it into the grade
  score: number;
  parts: GradePart[];
  // A place among the league's (#rank of of, among: "teams") and what was placed: the score (curved into
  // the grade: the NFL's) or the input (curved, then blended: the data grades); null: the score is the grade
  curve: { rank: number; of: number; among: string; on: 'score' | 'input' } | null;
  // Context beside the parts (the input's own makings: a coach's net rating and his roster's)
  facts: { label: string; value: string; title?: string }[];
  // (early season, a first-year coach: what's unusual about this one)
  notes: string[];
  // How they combine, in a line
  foot: string;
}

// A grade on the curve: #1 of n an A+ (12), #n an F (0), evenly between
export function curveGrade(rank: number, of: number): number {
  return 12 * (1 - (rank - 1) / Math.max(of - 1, 1));
}

// A grade written out: "B+ (8.4)"
export function gradeText(value: number): string {
  return `${gradeLetter(value)} (${(Math.round(value * 10) / 10).toFixed(1)})`;
}

// An input as a part: its weight and grade, what it adds
export function gradePart(part: Omit<GradePart, 'amount' | 'title'> & { title?: string }): GradePart {
  const amount = part.grade * part.weight;
  const math = `${gradeText(part.grade)} × ${pctText(part.weight)} = ${amount.toFixed(2)} of the score`;
  return { ...part, amount, title: [part.title, math].filter(Boolean).join('\n') };
}

export const pctText = (share: number) => `${Math.round(share * 100)}%`;

// ---------------------------------------------------------------------------------------------------------------
// The data scripts' grades (MLB, NBA, NHL): each unit's gradeIn, written beside the grade by the script that
// curved it (libs/ranker/scripts/grades.mjs keepGradeInput, early-season.mjs): per support key, [score, rank, of],
// and early in a season [..., last season's grade, this season's share]. The grade is the curve's (rounded to a
// tenth), blended with last season's by the share (again to a tenth).
// ---------------------------------------------------------------------------------------------------------------
export type GradeInput = [score: number, rank: number, of: number, prior?: number, share?: number];

export function gradeInputs(unit: SkillPlayer): Record<string, GradeInput> | undefined {
  return (unit as SkillPlayer & { gradeIn?: Record<string, GradeInput> }).gradeIn;
}

// How a sport reads one of its data grades' inputs
export interface GradeInputSpec {
  // The score's name ("Teammates' BPM") and how it reads ("+1.2")
  label: string;
  format: (score: number) => string;
  // What it's ranked among ("players", "teams") and, written out, what the score measures
  among: string;
  about: string;
  // (the curve runs lowest first: a goalie's shots against, a pitcher's park)
  lowerIsBetter?: boolean;
  // Worked out from the season's rows when the unit has no gradeIn (a season written before it): the
  // team-wide grades, from the Teams or Head Coaches tab (null: not this one)
  fromRows?: (unit: SkillPlayer, context: ValueContext) => RowsInput | null;
  // More about the input (its own makings)
  facts?: (unit: SkillPlayer, context: ValueContext) => GradeWhy['facts'];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

// An input worked out from team rows: its score and place, and the last place it shares with a tie (the
// script's curve put tied teams in an order the rows don't keep: the shown grade says which)
export interface RowsInput {
  score: number;
  rank: number;
  of: number;
  tiedTo: number;
}

// A data grade's breakdown: this season's input on the curve, and early on last season's grade beside it
export function dataGradeWhy(unit: SkillPlayer, stat: SkillStat, shown: number | null, spec: GradeInputSpec, context: ValueContext): GradeWhy | null {
  if (shown === null) return null;
  const input = gradeInputs(unit)?.[stat.key] ?? null;
  const rows = input ? null : (spec.fromRows?.(unit, context) ?? null);
  // (a tie's place: the one in its run of tied places whose grade is the one shown)
  const tied = rows && Array.from({ length: rows.tiedTo - rows.rank + 1 }, (_, i) => rows.rank + i).find((rank) => round1(curveGrade(rank, rows.of)) === round1(shown));
  const at = input ? { score: input[0], rank: input[1], of: input[2] } : rows && { ...rows, rank: tied ?? rows.rank };
  const facts = spec.facts?.(unit, context) ?? [];
  if (!at) {
    // (no inputs kept for this season: the grade's place among the list's, all there is to say)
    return null;
  }
  const now = round1(curveGrade(at.rank, at.of));
  const prior = input?.[3];
  const share = input?.[4];
  const blended = prior !== undefined && share !== undefined && share < 1;
  const place = `#${at.rank} of ${at.of} ${spec.among}`;
  const parts: GradePart[] = [
    gradePart({
      key: 'season',
      label: spec.label,
      value: spec.format(at.score),
      place: ordinal(at.rank),
      grade: now,
      weight: blended ? share : 1,
      title: `${spec.about}: ${spec.format(at.score)}, ${place}${spec.lowerIsBetter ? ' (lowest first)' : ''}: ${gradeText(now)} on the curve`,
    }),
  ];
  if (blended) {
    parts.push(
      gradePart({
        key: 'prior',
        label: 'Last season',
        value: gradeLetter(prior),
        place: null,
        grade: prior,
        weight: 1 - share,
        title: "His team's grade last season (the average over its players then; a team new to the league starts at a C)",
      }),
    );
  }
  const notes: string[] = [];
  if (blended) notes.push(`Early season: this season counts ${pctText(share)}, rising to all of it a quarter of the way in`);
  else if (!input && round1(now) !== round1(shown)) notes.push(`Early season: blended with his team's grade last season, from this season's ${gradeText(now)} (the split comes with the next data update)`);
  const score = parts.reduce((sum, p) => sum + p.amount, 0);
  return {
    grade: shown,
    score,
    parts,
    curve: { rank: at.rank, of: at.of, among: spec.among, on: 'input' },
    facts,
    notes,
    foot: blended
      ? `This season's ${spec.label.toLowerCase()} on a curve (#1 an A+, last an F), blended with last season's grade by games played`
      : `Graded on a curve: #1 of the ${spec.among} an A+, the last an F, evenly between`,
  };
}

// A team-wide grade's input from a tab of team rows (the Head Coaches tab's Coaching Lift, the Teams tab's
// park factor), for a season written before gradeIn: the team's value and its place among the teams' (one
// value a team; lowest first for a lower-is-better one), as the data script curved them
export function teamInput(unit: SkillPlayer, rows: SkillPlayer[] | undefined, key: string, lowerIsBetter = false): RowsInput | null {
  const byTeam = new Map<string, number>();
  for (const row of rows ?? []) {
    const value = (row.stats as Record<string, number | null | undefined>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && !byTeam.has(row.teamLogo)) byTeam.set(row.teamLogo, lowerIsBetter ? -value : value);
  }
  const score = byTeam.get(unit.teamLogo);
  if (score === undefined) return null;
  const values = [...byTeam.values()];
  const rank = 1 + values.filter((v) => v > score).length;
  return { score: lowerIsBetter ? -score : score, rank, of: values.length, tiedTo: values.filter((v) => v >= score).length };
}

// A team row's own (the Head Coaches tab's row for a player's team: its Coaching Lift's makings)
export function teamRow(unit: SkillPlayer, rows: SkillPlayer[] | undefined): SkillPlayer | undefined {
  return rows?.find((row) => row.teamLogo === unit.teamLogo);
}
