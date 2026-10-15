import type { SportConfig } from '@ranker/engine/sport';
import { GradeInputSpec, dataGradeWhy, teamInput } from '@ranker/engine/grade-why';

// What MLB's support grades are curved on (update-data.mjs, kept beside each grade as gradeIn), for the
// grade's breakdown in the grid (engine/grade-why.ts). The team-wide ones (a pitcher's Defense, the
// Stadium) can also be worked out from the Teams tab for a season written before gradeIn.
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const PITCHERS = new Set(['SP', 'RP']);

const INPUTS: Record<string, GradeInputSpec> = {
  lineup: {
    label: "Lineup's batting runs",
    format: (v) => `${signed(v)} / 600 PA`,
    among: 'hitters',
    about: "His teammates' batting runs per 600 plate appearances, without him",
  },
  defense: {
    label: 'Fielding runs',
    format: (v) => signed(v),
    among: 'teams',
    about: "His team's fielding runs saved",
    fromRows: (unit, context) => teamInput(unit, context.rows['TM'], 'fieldingRuns'),
  },
};

const PARK = (pitcher: boolean): GradeInputSpec => ({
  label: 'Park factor',
  format: (v) => `${Math.round(v)}`,
  among: 'parks',
  about: `His home park's factor (Baseball Savant, three years; 100 average, over 100 friendlier to hitters)${pitcher ? ', lowest first for a pitcher' : ''}`,
  lowerIsBetter: pitcher,
  fromRows: (unit, context) => teamInput(unit, context.rows['TM'], 'parkFactor', pitcher),
});

export const gradeWhy: SportConfig['gradeWhy'] = (player, stat, shown, context) => {
  const spec = stat.key === 'park' ? PARK(PITCHERS.has(context.position)) : INPUTS[stat.key];
  return spec ? dataGradeWhy(player, stat, shown, spec, context) : null;
};
