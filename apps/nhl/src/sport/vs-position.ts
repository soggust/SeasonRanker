import type { CardBreakdown, CardFlag } from '@ranker/engine/sport';
import { tintFrom, tintScale } from '@ranker/core/value-tint';
import type { SkillPlayer } from './positions';

// A team's card: vs Position (SportConfig.cardBreakdown). What it allowed to opposing centers, wingers and
// defensemen a game, against those players' own averages in their other games, and the share of the points
// against it each of them scored: the team's vsPos (scripts/vs-position.mjs, on its coaches' rows and taken
// onto the Teams tab's row), every season's own. Wingers are left and right together (a listed side is
// often not the one he plays); the forwards' total (F) is in the note. Display only: nothing in the ranking
// reads it.

const ROLES = ['C', 'W', 'D'] as const;
type Role = (typeof ROLES)[number];
interface RoleLine {
  goals: number | null;
  pts: number | null;
  shots: number | null;
  exp: number | null;
  vs: number | null;
  rank: number | null;
}
export type NhlVsPos = { games: number; F: RoleLine; share: Record<Role, { s: number | null; lg: number | null }> } & Record<Role, RoleLine>;

export const nhlVsPosOf = (row: SkillPlayer): NhlVsPos | null => (row as { vsPos?: NhlVsPos | null }).vsPos ?? null;

const ROLE_INFO: Record<Role, { name: string; plural: string }> = {
  C: { name: 'Centers', plural: 'centers' },
  W: { name: 'Wingers', plural: 'wingers' },
  D: { name: 'Defensemen', plural: 'defensemen' },
};

// (signed as it shows: +0.004 is 0.00)
const signed = (v: number, digits = 2) => {
  const text = Math.abs(v).toFixed(digits);
  return `${Number(text) === 0 ? '' : v > 0 ? '+' : '−'}${text}`;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function nhlVsPositionBreakdown(player: SkillPlayer, position: string, rows: SkillPlayer[]): CardBreakdown | null {
  const vs = position === 'TM' ? nhlVsPosOf(player) : null;
  if (!vs || !vs.games || !vs.C) return null;
  // (ranked among the teams the season's part has: 32, or the playoff teams)
  const of = Math.max(rows.filter((r) => nhlVsPosOf(r)).length, ...ROLES.map((r) => vs[r].rank ?? 0));
  // (each value tinted as the grid tints its columns: green the further under the other teams' average, red
  // the further over; less allowed is better)
  const tint = (role: Role, key: 'pts' | 'goals' | 'shots' | 'vs', value: number | null) =>
    value === null ? null : tintFrom(value, tintScale(rows.map((r) => nhlVsPosOf(r)?.[role]?.[key] ?? null)), true);
  const rankWords = (rank: number | null) => (rank === null ? '' : ` (#${rank} of ${of}, #1 the fewest)`);

  const tableRows = ROLES.map((role, i) => {
    const line = vs[role];
    const plural = ROLE_INFO[role].plural;
    return {
      label: role,
      group: i,
      title: `Every opposing ${plural.replace(/s$/, '')} (his listed position${role === 'W' ? ', left or right' : ''}): what they did against this team a game`,
      cells: [
        { text: line.pts !== null ? line.pts.toFixed(2) : '-', color: tint(role, 'pts', line.pts), title: line.pts !== null ? `${line.pts.toFixed(2)} points a game to ${plural}` : '' },
        {
          text: line.vs !== null ? signed(line.vs) : '-',
          color: tint(role, 'vs', line.vs),
          title:
            line.pts !== null && line.exp !== null
              ? `${line.pts.toFixed(2)} points a game, against the ${line.exp.toFixed(2)} these ${plural} averaged in their other games${rankWords(line.rank)}`
              : '',
        },
        { text: line.goals !== null ? line.goals.toFixed(2) : '-', color: tint(role, 'goals', line.goals), title: line.goals !== null ? `${line.goals.toFixed(2)} goals a game by ${plural}` : '' },
        { text: line.shots !== null ? line.shots.toFixed(1) : '-', color: tint(role, 'shots', line.shots), title: line.shots !== null ? `${line.shots.toFixed(1)} shots on goal a game by ${plural}` : '' },
      ],
      rank: line.rank,
      of,
    };
  });

  // The Overview's takes: the group it's softest against and the one it shuts down, by points over their
  // usual: half a point a game or more, or the part's own spread when it's wider (the playoffs' handful of
  // games swing about twice as far as a season's: the teams' and groups' root mean square)
  const spread = rows.flatMap((r) => ROLES.map((role) => nhlVsPosOf(r)?.[role]?.vs ?? null)).filter((v): v is number => v !== null);
  const bar = Math.max(0.5, spread.length ? Math.sqrt(spread.reduce((a, v) => a + v * v, 0) / spread.length) : 0);
  const flags: CardFlag[] = [];
  const byVs = ROLES.filter((r) => vs[r].vs !== null).sort((a, b) => vs[b].vs! - vs[a].vs!);
  const soft = byVs[0];
  const tough = byVs.at(-1);
  if (soft && vs[soft].vs! >= bar) {
    flags.push({
      icon: 'person_search',
      tone: 'bad',
      text: `Soft against ${ROLE_INFO[soft].plural}: they score ${vs[soft].vs!.toFixed(2)} more points a game than usual here (#${vs[soft].rank} of ${of})`,
    });
  }
  if (tough && tough !== soft && vs[tough].vs! <= -bar) {
    flags.push({
      icon: 'shield',
      tone: 'good',
      text: `Shuts down ${ROLE_INFO[tough].plural}: they score ${(-vs[tough].vs!).toFixed(2)} fewer points a game than usual here (#${vs[tough].rank} of ${of})`,
    });
  }
  const { s: dShare, lg: dLeague } = vs.share.D;
  if (dShare !== null && dLeague !== null && Math.abs(dShare - dLeague) >= 0.03) {
    flags.push({
      icon: 'track_changes',
      tone: 'info',
      text: `Defensemen get ${pct(dShare)} of the points against it (league ${pct(dLeague)}): ${dShare > dLeague ? 'its blue line gets activated against' : 'the forwards do the damage'}`,
    });
  }

  const f = vs.F;
  return {
    title: 'vs Position',
    icon: 'person_search',
    help: "What this team allowed to opposing centers, wingers (left and right together) and defensemen a game, and against what those same skaters averaged in their other games: holding a top line under its usual output reads as good defense. Ranked by points against the usual, #1 the stingiest. Skaters the site doesn't list (a few games' call-ups) aren't counted.",
    rowHeader: { label: 'Pos', title: "The opposing skaters' listed position (C, wing or D)" },
    rankTitle: "Where the team ranks, by the points it allowed to the position against those skaters' own averages (#1 the stingiest)",
    note:
      f && f.pts !== null && f.vs !== null
        ? `${vs.games} games; forwards together: ${f.pts.toFixed(2)} points a game, ${signed(f.vs)} against their usual (#${f.rank ?? '-'} of ${of})`
        : `${vs.games} games`,
    flags,
    columns: [
      { label: 'Pts / G', title: 'Points the position scored a game against this team' },
      { label: 'vs Avg', title: 'Points a game against what those same skaters averaged in their other games (below zero: held under their norm)' },
      { label: 'G / G', title: 'Goals the position scored a game against this team' },
      { label: 'Shots / G', title: 'Shots on goal a game' },
    ],
    rows: tableRows,
    split: {
      title: 'Where the points go',
      help: "The share of the points against this team each position scored; each slice's hover has the league's share",
      parts: ROLES.map((role) => {
        const { s, lg } = vs.share[role];
        const share = s ?? 0;
        const league = lg ?? 0;
        const line = vs[role];
        return {
          label: role,
          share,
          league,
          title: `${ROLE_INFO[role].name}: ${pct(share)} of the points against it (league ${pct(league)}), ${line.pts?.toFixed(2) ?? '-'} a game, ${line.vs !== null ? signed(line.vs) : '-'} against their usual (#${line.rank ?? '-'})`,
          note: `lg ${pct(league)} · ${line.vs !== null ? signed(line.vs) : '-'} #${line.rank ?? '-'}`,
        };
      }),
    },
  };
}
