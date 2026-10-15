import { signedText as signed } from '@ranker/core/format';
import type { SportConfig } from '@ranker/engine/sport';
import { GradeInputSpec, dataGradeWhy, teamInput, teamRow } from '@ranker/engine/grade-why';

// What the NBA's support grades are curved on (update-data.mjs, kept beside each grade as gradeIn), for the
// grade's breakdown in the grid (engine/grade-why.ts). Coaching, a team's, can also be worked out from the
// Head Coaches tab for a season written before gradeIn.

const INPUTS: Record<string, GradeInputSpec> = {
  teammates: {
    label: "Teammates' BPM",
    format: (v) => signed(v),
    among: 'players',
    about: "His teammates' Box Plus/Minus, weighted by their minutes, without him",
  },
  coaching: {
    label: 'Coaching Lift',
    format: (v) => signed(v),
    among: 'teams',
    about: "His team's net rating over what its roster's talent coming in predicted (last season's BPM of the players it used, by their minutes)",
    fromRows: (unit, context) => teamInput(unit, context.rows['HC'], 'lift'),
    facts: (unit, context) => {
      const coach = teamRow(unit, context.rows['HC']);
      const net = coach?.stats.netRtg;
      const lift = coach?.stats.lift;
      if (typeof net !== 'number' || typeof lift !== 'number') return [];
      return [
        { label: 'Net rating', value: signed(net), title: 'Points per 100 possessions over its opponents' },
        { label: 'What its roster predicted', value: signed(net - lift), title: "Five of its players on the floor at last season's Box Plus/Minus (a newcomer at replacement level), a quarter of the way back to average" },
        { label: 'Coaching Lift', value: signed(lift), title: 'The net rating less what the roster predicted' },
      ];
    },
  },
};

export const gradeWhy: SportConfig['gradeWhy'] = (player, stat, shown, context) =>
  INPUTS[stat.key] ? dataGradeWhy(player, stat, shown, INPUTS[stat.key], context) : null;
