import type { SportConfig } from '@ranker/engine/sport';
import { GradeInputSpec, dataGradeWhy, teamInput, teamRow } from '@ranker/engine/grade-why';

// What the NHL's support grades are curved on (update-data.mjs, kept beside each grade as gradeIn), for the
// grade's breakdown in the grid (engine/grade-why.ts). Coaching, a team's, can also be worked out from the
// Head Coaches tab for a season written before gradeIn.
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const INPUTS: Record<string, GradeInputSpec> = {
  linemates: {
    label: 'xGF % off the ice',
    format: pct,
    among: 'skaters',
    about: "His team's share of the expected goals at 5-on-5 with him off the ice",
  },
  defense: {
    label: 'xGA / 60 faced',
    format: (v) => v.toFixed(2),
    among: 'goalies',
    about: 'The shot quality he faced: expected goals against per 60 minutes (goalies with 5+ games)',
    lowerIsBetter: true,
  },
  coaching: {
    label: 'Coaching Lift',
    format: (v) => signed(v),
    among: 'teams',
    about: "His team's 5-on-5 expected-goal share over what its skaters predicted (their share last season, by ice time), in points",
    fromRows: (unit, context) => teamInput(unit, context.rows['HC'], 'lift'),
    facts: (unit, context) => {
      const coach = teamRow(unit, context.rows['HC']);
      const xgf = coach?.stats.xgfPct;
      const lift = coach?.stats.lift;
      if (typeof xgf !== 'number' || typeof lift !== 'number') return [];
      return [
        { label: 'xGF % at 5-on-5', value: pct(xgf), title: "The team's share of the expected goals at 5-on-5" },
        { label: 'What its skaters predicted', value: pct(xgf - lift / 100), title: 'Its skaters at their share last season (a newcomer at replacement level), by ice time, a quarter of the way back to even' },
        { label: 'Coaching Lift', value: signed(lift), title: 'The share less what the skaters predicted, in points' },
      ];
    },
  },
};

export const gradeWhy: SportConfig['gradeWhy'] = (player, stat, shown, context) =>
  INPUTS[stat.key] ? dataGradeWhy(player, stat, shown, INPUTS[stat.key], context) : null;
