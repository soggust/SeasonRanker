import type { CardBreakdown, CardFlag } from '@ranker/engine/sport';
import { tintFrom, tintScale } from '@ranker/core/value-tint';
import type { SkillPlayer } from './positions';

// A team's card: vs Position (SportConfig.cardBreakdown). What it allowed to opposing point guards, shooting
// guards, small forwards, power forwards and centers a game (points, rebounds, assists, threes and PRA), each
// against those players' own averages in their other games, and the share of the points against it each
// position scored: the team's vsPos (scripts/vs-position.mjs, on its coaches' rows and taken onto the Teams
// tab's row), every season's own. Display only: nothing in the ranking reads it.

const ROLES = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
type Role = (typeof ROLES)[number];
type Stat = 'pts' | 'reb' | 'ast' | 'fg3' | 'pra';
// (a stat against the position: g allowed a game, vs over those players' usual a game, r and rv their ranks,
// 1 the least allowed)
interface StatLine {
  g: number | null;
  vs: number | null;
  r: number | null;
  rv: number | null;
}
export type NbaVsPos = { games: number; share: Record<Role, { s: number | null; lg: number | null }> } & Record<Role, Record<Stat, StatLine>>;

export const nbaVsPosOf = (row: SkillPlayer): NbaVsPos | null => (row as { vsPos?: NbaVsPos | null }).vsPos ?? null;

const ROLE_INFO: Record<Role, { name: string; plural: string }> = {
  PG: { name: 'Point Guards', plural: 'point guards' },
  SG: { name: 'Shooting Guards', plural: 'shooting guards' },
  SF: { name: 'Small Forwards', plural: 'small forwards' },
  PF: { name: 'Power Forwards', plural: 'power forwards' },
  C: { name: 'Centers', plural: 'centers' },
};
const STAT_INFO: Record<Stat, { label: string; words: string }> = {
  pts: { label: 'Pts / G', words: 'points' },
  reb: { label: 'Reb / G', words: 'rebounds' },
  ast: { label: 'Ast / G', words: 'assists' },
  fg3: { label: '3PM / G', words: 'threes' },
  pra: { label: 'PRA / G', words: 'points, rebounds and assists' },
};
// (the table's columns after points and its vs Avg)
const MORE: Stat[] = ['reb', 'ast', 'fg3', 'pra'];

// (signed as it shows: +0.04 is 0.0)
const signed = (v: number, digits = 1) => {
  const text = Math.abs(v).toFixed(digits);
  return `${Number(text) === 0 ? '' : v > 0 ? '+' : '−'}${text}`;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function nbaVsPositionBreakdown(player: SkillPlayer, position: string, rows: SkillPlayer[]): CardBreakdown | null {
  const vs = position === 'TM' ? nbaVsPosOf(player) : null;
  if (!vs || !vs.games) return null;
  // (ranked among the teams the season's part has: 30, or the playoff teams)
  const of = Math.max(rows.filter((r) => nbaVsPosOf(r)).length, ...ROLES.map((r) => vs[r]?.pts?.rv ?? 0));
  // (each value tinted as the grid tints its columns: green the further under the other teams' average, red
  // the further over; less allowed is better)
  const tint = (role: Role, stat: Stat, key: 'g' | 'vs', value: number | null) =>
    value === null ? null : tintFrom(value, tintScale(rows.map((r) => nbaVsPosOf(r)?.[role]?.[stat]?.[key] ?? null)), true);
  const rankWords = (rank: number | null) => (rank === null ? '' : ` (#${rank} of ${of}, #1 the fewest)`);
  // (a stat's hover: a game, and against the usual)
  const statTitle = (role: Role, stat: Stat, line: StatLine) =>
    line.g === null
      ? ''
      : `${line.g.toFixed(1)} ${STAT_INFO[stat].words} a game to ${ROLE_INFO[role].plural}${rankWords(line.r)}` +
        (line.vs !== null ? `; ${signed(line.vs)} against what they averaged in their other games${rankWords(line.rv)}` : '');

  const tableRows = ROLES.map((role, i) => {
    const line = vs[role];
    const pts = line.pts;
    return {
      label: role,
      group: i,
      title: `Every opposing ${ROLE_INFO[role].plural.replace(/s$/, '')} (his listed position): what they did against this team a game`,
      cells: [
        { text: pts.g !== null ? pts.g.toFixed(1) : '-', color: tint(role, 'pts', 'g', pts.g), title: statTitle(role, 'pts', pts) },
        {
          text: pts.vs !== null ? signed(pts.vs) : '-',
          color: tint(role, 'pts', 'vs', pts.vs),
          title:
            pts.g !== null && pts.vs !== null
              ? `${pts.g.toFixed(1)} points a game, against the ${(pts.g - pts.vs).toFixed(1)} these ${ROLE_INFO[role].plural} averaged in their other games${rankWords(pts.rv)}`
              : '',
        },
        ...MORE.map((stat) => {
          const s = line[stat];
          return { text: s.g !== null ? s.g.toFixed(1) : '-', color: tint(role, stat, 'g', s.g), title: statTitle(role, stat, s) };
        }),
      ],
      rank: pts.rv,
      of,
    };
  });

  // The Overview's takes: the position it's softest against and the one it shuts down, by points over their
  // usual (1.5 a game or more)
  const flags: CardFlag[] = [];
  const byVs = ROLES.filter((r) => vs[r].pts.vs !== null).sort((a, b) => vs[b].pts.vs! - vs[a].pts.vs!);
  const soft = byVs[0];
  const tough = byVs.at(-1);
  if (soft && vs[soft].pts.vs! >= 1.5) {
    flags.push({
      icon: 'person_search',
      tone: 'bad',
      text: `Soft against ${ROLE_INFO[soft].plural}: they score ${vs[soft].pts.vs!.toFixed(1)} more a game than usual here (#${vs[soft].pts.rv} of ${of})`,
    });
  }
  if (tough && tough !== soft && vs[tough].pts.vs! <= -1.5) {
    flags.push({
      icon: 'shield',
      tone: 'good',
      text: `Shuts down ${ROLE_INFO[tough].plural}: they score ${(-vs[tough].pts.vs!).toFixed(1)} fewer a game than usual here (#${vs[tough].pts.rv} of ${of})`,
    });
  }

  return {
    title: 'vs Position',
    icon: 'person_search',
    help: "What this team allowed to each position a game (every opposing player by his listed position), and against what those same players averaged in their other games: holding a star to his usual reads as average, under it as good defense. Ranked by points against the usual, #1 the stingiest.",
    rowHeader: { label: 'Pos', title: "The opposing players' listed position (Basketball-Reference's)" },
    rankTitle: "Where the team ranks, by the points it allowed to the position against those players' own averages (#1 the stingiest)",
    note: `${vs.games} games; each value's hover has its rank and how it compares with the players' usual`,
    flags,
    columns: [
      { label: 'Pts / G', title: 'Points the position scored a game against this team' },
      { label: 'vs Avg', title: 'Points a game against what those same players averaged in their other games (below zero: held under their norm)' },
      ...MORE.map((stat) => ({ label: STAT_INFO[stat].label, title: `${STAT_INFO[stat].words.charAt(0).toUpperCase() + STAT_INFO[stat].words.slice(1)} a game (the hover: against their usual)` })),
    ],
    rows: tableRows,
    split: {
      title: 'Where the points go',
      help: "The share of the points against this team each position scored; each slice's hover has the league's share",
      parts: ROLES.map((role) => {
        const { s, lg } = vs.share[role];
        const share = s ?? 0;
        const league = lg ?? 0;
        const pts = vs[role].pts;
        return {
          label: role,
          share,
          league,
          title: `${ROLE_INFO[role].name}: ${pct(share)} of the points against it (league ${pct(league)}), ${pts.g?.toFixed(1) ?? '-'} a game, ${pts.vs !== null ? signed(pts.vs) : '-'} against their usual (#${pts.rv ?? '-'})`,
          note: `lg ${pct(league)} · ${pts.vs !== null ? signed(pts.vs) : '-'} #${pts.rv ?? '-'}`,
        };
      }),
    },
  };
}
