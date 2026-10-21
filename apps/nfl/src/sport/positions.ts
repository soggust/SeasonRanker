import { type SportSettings, type StatBasis, type StatDef, type StatGroup, type StatGroupId } from '@ranker/engine/sport';
import { type GroupDef, groupOfKey, resolveGroups } from '@ranker/engine/stat-groups';
import { SKILL_PRESETS } from '@sport/skill-presets';

export type { StatBasis, StatGroupId } from '@ranker/engine/sport';

export type Position = 'TM' | 'OFF' | 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DEF' | 'EDGE' | 'DL' | 'LB' | 'CB' | 'S' | 'ST' | 'K' | 'P' | 'HC';
// Every tab uses the same config-driven table, sidebar and scoring below (TM rows are teams, built in
// the app from the head coach rows; OFF rows are team offenses, OL rows team offensive lines, DEF rows
// team defenses, ST rows team special teams and HC rows head coaches; EDGE, DL, LB, CB and S rows are
// the defensive players, by the position they're listed at that season)
export type SkillPosition = Position;

// (the bar's order: Teams, then the Offense family, the Defense family, the Special Teams family, the coaches;
// sport.ts tabFamilies puts each family's members under its team tab)
export const POSITIONS: Position[] = ['TM', 'OFF', 'QB', 'RB', 'WR', 'TE', 'OL', 'DEF', 'EDGE', 'DL', 'LB', 'CB', 'S', 'ST', 'K', 'P', 'HC'];

// The defensive player tabs: under DEF in the position bar (its family, with Team D: sport.ts tabFamilies)
export const DEF_PLAYER_TABS: Position[] = ['EDGE', 'DL', 'LB', 'CB', 'S'];

// Keys of the stats object in skill-players.json
export type SkillStatKey =
  | 'carries'
  | 'rushYards'
  | 'rushTds'
  | 'targets'
  | 'receptions'
  | 'recYards'
  | 'recTds'
  | 'yac'
  | 'firstDowns'
  | 'fumbles'
  | 'targetShare'
  | 'ypc'
  | 'totalTds'
  | 'catchPct'
  | 'epaPerCarry'
  | 'epaPerTarget'
  | 'fantasyStd'
  // Kickers
  | 'fgMade'
  | 'fgAtt'
  | 'patAtt'
  | 'fgPct'
  | 'fg50'
  | 'fgLong'
  | 'patPct'
  | 'epaPerKick'
  // Punters
  | 'punts'
  | 'grossAvg'
  | 'netAvg'
  | 'inside20'
  | 'inside20Pct'
  | 'touchbacks'
  | 'epaPerPunt'
  // Defenses
  | 'epaAllowed'
  | 'passEpaAllowed'
  | 'rushEpaAllowed'
  | 'successAllowed'
  | 'sacks'
  | 'takeaways'
  | 'ptsAllowedPerGame'
  // (allowed through the air and on the ground: what the app's Pass D and Run D Rank go by)
  | 'passYdsAllowedPerGame'
  | 'rushYdsAllowedPerGame'
  | 'passTdsAllowedPerGame'
  | 'rushTdsAllowedPerGame'
  // Head coaches
  | 'wins'
  | 'losses'
  | 'ties'
  | 'winPct'
  | 'winsOverExpected'
  | 'atsPct'
  | 'pointDiffPerGame'
  | 'netEpa'
  // Added: tracking (Next Gen Stats), contact/drop/pressure (Pro Football Reference via nflverse)
  | 'ryoePerAtt'
  | 'yacoPerCarry'
  | 'brokenTackles'
  | 'snapShare'
  | 'separation'
  | 'yacOverExp'
  | 'adot'
  | 'airYardsShare'
  // Added 2026-10-21 from the play-by-play (update-data.mjs targetDepth): a receiver's total air yards, WOPR,
  // deep and middle target rates and end-zone targets, and a QB's EPA per dropback
  | 'airYards'
  | 'wopr'
  | 'deepTargetPct'
  | 'middleTargetPct'
  | 'endZoneTargets'
  | 'epaPerDropback'
  | 'dropPct'
  | 'drops'
  | 'runBlockEpa'
  | 'passProPct'
  | 'pressureRate'
  | 'missedTacklePct'
  | 'thirdDownPct'
  | 'redZoneTdPct'
  | 'fgOverExp'
  | 'fairCatchPct'
  | 'oneScoreWinPct'
  | 'penaltiesPerGame'
  | 'fourthDownGoPct'
  | 'turnoverDiffPerGame'
  // Offensive lines
  | 'sacksAllowed'
  | 'qbHitRate'
  | 'sackRate'
  | 'stuffRate'
  | 'yardsBeforeContact'
  | 'runEpa'
  | 'runSuccess'
  | 'shortYardagePct'
  | 'linePenaltiesPerGame'
  | 'timeToThrow'
  // Quarterbacks
  | 'compPct'
  | 'passYards'
  | 'passTds'
  | 'ints'
  | 'ypa'
  | 'rating'
  | 'epaPerPlay'
  | 'successRate'
  | 'cpoe'
  | 'pressureToSack'
  | 'badThrowPct'
  | 'aggressiveness'
  | 'responsibility'
  // Head coaches' units (ranked in the app by the Rank Base setting)
  | 'offEpa'
  | 'defEpaAllowed'
  | 'ptsPerGame'
  | 'yardsPerGame'
  | 'yardsAllowedPerGame'
  | 'stEpaPerGame'
  | 'topPerGame'
  // Team offenses (update-data.mjs offenseUnits: the defenses' mirror, from the same plays)
  | 'passEpa'
  | 'rushEpa'
  | 'passYdsPerGame'
  | 'rushYdsPerGame'
  | 'passTdsPerGame'
  | 'rushTdsPerGame'
  | 'giveaways'
  | 'playsPerGame'
  // Team special teams (update-data.mjs specialTeamsUnits: the play-by-play's kicks, punts and returns)
  | 'kickReturnAvg'
  | 'puntReturnAvg'
  | 'returnTds'
  | 'oppReturnAvg'
  | 'blocksMade'
  | 'kicksBlocked'
  | 'stEpaPerPlay'
  | 'kickoffEpa'
  | 'puntEpa'
  | 'fgEpa'
  | 'returnEpa'
  // Defensive players (nflverse box stats; snaps from the snap counts, 2012 on; pressures, hurries, missed
  // tackles and the coverage "allowed" stats from Pro Football Reference's charting, 2018 on)
  | 'tackles'
  | 'soloTackles'
  | 'tfl'
  | 'qbHits'
  | 'pressures'
  | 'hurries'
  | 'forcedFumbles'
  | 'fumbleRecoveries'
  | 'interceptions'
  | 'passesDefended'
  | 'defTds'
  | 'snaps'
  | 'snapPct'
  | 'compPctAllowed'
  | 'yardsAllowed'
  | 'yardsPerTargetAllowed'
  | 'tdsAllowed'
  | 'passerRatingAllowed'
  | 'splashPlays';

// Columns computed in the app: fantasy points in the chosen scoring, and team support grades
export type SkillColumnKey =
  | SkillStatKey
  | 'fantasy'
  | 'oline'
  | 'weapons'
  | 'qbPlay'
  | 'rbPlay'
  | 'coaching'
  | 'defense'
  | 'games'
  | 'totalYards'
  | 'turnovers'
  | 'recent'
  | 'offRank'
  | 'defRank'
  | 'passDefRank'
  | 'runDefRank'
  | 'passOffRank'
  | 'rushOffRank'
  | 'stRank';

export type FantasyScoring = 'std' | 'half' | 'ppr';

export const FANTASY_SCORING_LABELS: Record<FantasyScoring, string> = {
  std: 'Standard',
  half: 'Half PPR',
  ppr: 'PPR',
};

// What the head coaches' Off / Def Rank columns rank on (their EPA per play has its own Advanced
// columns, like special teams' EPA)
export type RankBasis = 'points' | 'yards';

// How counting stats (yards, touchdowns, sacks...) are shown and ranked: season totals, per game, or
// per game over a 17-game season (a full season's pace, whatever the player's games or the era's
// schedule). Per Game and 17-Game Pace rank the same; they only read differently.
export const STAT_BASIS_LABELS: Record<StatBasis, string> = {
  season: 'Season Totals',
  perGame: 'Per Game',
  pace17: '17-Game Pace',
};

// A full season's games, for the 17-Game Pace (every tab)
export const PACE_GAMES: Record<Position, number> = {
  TM: 17, OFF: 17, QB: 17, RB: 17, WR: 17, TE: 17, OL: 17, DEF: 17, EDGE: 17, DL: 17, LB: 17, CB: 17, S: 17, ST: 17, K: 17, P: 17, HC: 17,
};

export const RANK_BASIS_LABELS: Record<RankBasis, string> = {
  points: 'Points',
  yards: 'Yards',
};

// A stat's column / slider label; the unit ranks say what they're ranked on ("Off Rank (Pts)"), so
// the table and sidebar read the same without opening the settings
export function statLabelFor(stat: SkillStat, rankBasis: RankBasis): string {
  if (stat.format !== 'rank') return stat.label;
  return `${stat.label} (${rankBasisShort(stat.key, rankBasis)})`;
}

// The stat each rank uses, and whether higher is better
// (the DEF and OFF tabs' pass and run ranks: points aren't split by play type, so touchdowns stand in for
// them; the special teams' rank goes by their EPA per play whatever the setting, there being no points or
// yards of their own to rank)
export const RANK_METRICS: Record<
  'offRank' | 'defRank' | 'passDefRank' | 'runDefRank' | 'passOffRank' | 'rushOffRank' | 'stRank',
  Record<RankBasis, [SkillStatKey, boolean]>
> = {
  offRank: { points: ['ptsPerGame', true], yards: ['yardsPerGame', true] },
  defRank: { points: ['ptsAllowedPerGame', false], yards: ['yardsAllowedPerGame', false] },
  passDefRank: { points: ['passTdsAllowedPerGame', false], yards: ['passYdsAllowedPerGame', false] },
  runDefRank: { points: ['rushTdsAllowedPerGame', false], yards: ['rushYdsAllowedPerGame', false] },
  passOffRank: { points: ['passTdsPerGame', true], yards: ['passYdsPerGame', true] },
  rushOffRank: { points: ['rushTdsPerGame', true], yards: ['rushYdsPerGame', true] },
  stRank: { points: ['stEpaPerPlay', true], yards: ['stEpaPerPlay', true] },
};
const TD_RANKS = new Set<SkillColumnKey>(['passDefRank', 'runDefRank', 'passOffRank', 'rushOffRank']);
const EPA_RANKS = new Set<SkillColumnKey>(['stRank']);

// What a rank goes by, short ("Pts", "TDs", "Yds", "EPA") and in full ("Points", "Touchdowns", "Yards",
// "EPA per Play")
export function rankBasisShort(key: SkillColumnKey, rankBasis: RankBasis): string {
  if (EPA_RANKS.has(key)) return 'EPA';
  if (rankBasis === 'yards') return 'Yds';
  return TD_RANKS.has(key) ? 'TDs' : 'Pts';
}
export function rankBasisLabel(key: SkillColumnKey, rankBasis: RankBasis): string {
  if (EPA_RANKS.has(key)) return 'EPA per Play';
  return rankBasis === 'points' && TD_RANKS.has(key) ? 'Touchdowns' : RANK_BASIS_LABELS[rankBasis];
}

// nflverse fantasy_points is standard scoring; PPR adds 1 per reception (verified against fantasy_points_ppr)
export function fantasyPoints(standard: number, receptions: number, scoring: FantasyScoring): number {
  const perReception = { std: 0, half: 0.5, ppr: 1 }[scoring];
  return standard + receptions * perReception;
}

export interface SkillPlayer {
  id: number | null;
  gsisId: string;
  name: string;
  teamLogo: string;
  games: number;
  // null when a data source doesn't cover the player (shown as "-")
  stats: Record<SkillStatKey, number | null>;
  // The play-by-play stats without garbage time (win probability under 10% or over 90%)
  competitive?: Partial<Record<SkillStatKey, number | null>>;
  // From ESPN's injury report (Out, Doubtful or Injured Reserve); players only, not units
  injured?: boolean;
  injuryStatus?: string;
  // QBs: up to the last five results as a starter, newest first (1 win, 0.5 tie, 0 loss), and starts
  // per team (keyed by logo path, for the team QB Play grade)
  lastFive?: number[];
  starts?: Record<string, number>;
}

// A unit's stat, without garbage time when the Include Garbage Time setting is off (stats that aren't
// built from play-by-play have no filtered copy and stay the same)
export function unitStat(unit: SkillPlayer, key: SkillStatKey, settings: SportSettings = {}): number | null {
  if (settings['garbageTime'] === false && unit.competitive && key in unit.competitive) return unit.competitive[key] ?? null;
  return unit.stats[key];
}

export type SkillStat = StatDef<SkillColumnKey>;

// Stat names written out in full (label hover text)
export const STAT_NAMES: Partial<Record<SkillColumnKey, string>> = {
  recent: 'Last 5 Games',
  compPct: 'Completion Percentage',
  passYards: 'Passing Yards',
  passTds: 'Passing Touchdowns',
  ints: 'Interceptions',
  ypa: 'Yards per Pass Attempt',
  rating: 'Passer Rating',
  epaPerPlay: 'Expected Points Added per Play',
  successRate: 'Success Rate',
  cpoe: 'Completion Percentage Over Expected',
  pressureToSack: 'Pressure-to-Sack Rate',
  badThrowPct: 'Bad Throw Percentage',
  aggressiveness: 'Aggressiveness Percentage',
  responsibility: 'Responsibility to Team Grade',
  games: 'Games Played',
  totalYards: 'Total Rushing + Receiving Yards',
  fantasy: 'Fantasy Points',
  oline: 'Offensive Line Grade',
  weapons: 'Weapons Grade',
  qbPlay: 'Quarterback Play Grade',
  rbPlay: 'Running Back Play Grade',
  coaching: 'Coaching Grade',
  defense: 'Defense Grade',
  targets: 'Targets',
  targetShare: 'Target Share',
  receptions: 'Receptions',
  recYards: 'Receiving Yards',
  recTds: 'Receiving Touchdowns',
  rushTds: 'Rushing Touchdowns',
  yac: 'Yards After Catch',
  catchPct: 'Catch Percentage',
  epaPerTarget: 'Expected Points Added per Target',
  separation: 'Average Separation',
  yacOverExp: 'Yards After Catch Over Expected',
  adot: 'Average Depth of Target',
  airYardsShare: 'Air Yards Share',
  airYards: 'Air Yards',
  wopr: 'Weighted Opportunity Rating',
  deepTargetPct: 'Deep Target Percentage',
  middleTargetPct: 'Middle Target Percentage',
  endZoneTargets: 'End-Zone Targets',
  epaPerDropback: 'Expected Points Added per Dropback',
  dropPct: 'Drop Percentage',
  drops: 'Dropped Passes',
  runBlockEpa: 'Run Game EPA per Carry With Him On vs Off the Field',
  passProPct: 'QB Pressure Rate With Him On vs Off the Field',
  snapShare: 'Snap Percentage',
  carries: 'Carries',
  rushYards: 'Rushing Yards',
  ypc: 'Yards per Carry',
  totalTds: 'Total Rushing + Receiving Touchdowns',
  firstDowns: 'First Downs',
  epaPerCarry: 'Expected Points Added per Carry',
  ryoePerAtt: 'Rush Yards Over Expected per Carry',
  yacoPerCarry: 'Yards After Contact per Carry',
  brokenTackles: 'Broken Tackles',
  fumbles: 'Fumbles Lost',
  fgAtt: 'Field Goal Attempts',
  fgMade: 'Field Goals Made',
  fgPct: 'Field Goal Percentage',
  fg50: '50+ Yard Field Goals Made',
  fgLong: 'Longest Field Goal',
  patPct: 'Extra Point Percentage',
  epaPerKick: 'Expected Points Added per Kick',
  fgOverExp: 'Field Goal Percentage Over Expected',
  punts: 'Punts',
  grossAvg: 'Gross Punting Average',
  netAvg: 'Net Punting Average',
  inside20: 'Punts Inside the 20',
  inside20Pct: 'Inside the 20 Percentage',
  epaPerPunt: 'Expected Points Added per Punt',
  touchbacks: 'Touchbacks',
  fairCatchPct: 'Fair Catch Percentage',
  epaAllowed: 'Expected Points Added per Play Allowed',
  passEpaAllowed: 'Expected Points Added per Pass Play Allowed',
  rushEpaAllowed: 'Expected Points Added per Run Play Allowed',
  successAllowed: 'Success Rate Allowed',
  sacks: 'Sacks',
  pressureRate: 'Pressure Rate',
  takeaways: 'Takeaways',
  ptsAllowedPerGame: 'Points Allowed per Game',
  passYdsAllowedPerGame: 'Passing Yards Allowed per Game',
  rushYdsAllowedPerGame: 'Rushing Yards Allowed per Game',
  passTdsAllowedPerGame: 'Passing Touchdowns Allowed per Game',
  rushTdsAllowedPerGame: 'Rushing Touchdowns Allowed per Game',
  passDefRank: 'Pass Defense Rank',
  runDefRank: 'Run Defense Rank',
  thirdDownPct: 'Third Down Conversion Rate Allowed',
  redZoneTdPct: 'Red Zone Touchdown Rate Allowed',
  missedTacklePct: 'Missed Tackle Percentage',
  winPct: 'Record',
  winsOverExpected: 'Wins Over Expected',
  atsPct: 'Against the Spread Win Percentage',
  pointDiffPerGame: 'Point Differential per Game',
  netEpa: 'Net Expected Points Added per Play',
  oneScoreWinPct: 'One-Score Game Win Percentage',
  penaltiesPerGame: 'Penalties per Game',
  fourthDownGoPct: 'Fourth-Down Go-For-It Rate',
  turnoverDiffPerGame: 'Turnover Differential per Game',
  sacksAllowed: 'Sacks Allowed',
  qbHitRate: 'QB Hit Rate',
  sackRate: 'Sack Rate Allowed',
  stuffRate: 'Stuffed Run Rate',
  yardsBeforeContact: 'Yards Before Contact per Carry',
  runEpa: 'Expected Points Added per Designed Run',
  runSuccess: 'Designed Run Success Rate',
  shortYardagePct: 'Short-Yardage Run Conversion Rate',
  linePenaltiesPerGame: 'Blocking Penalties per Game',
  timeToThrow: 'QB Time to Throw (Seconds)',
  tackles: 'Combined Tackles',
  soloTackles: 'Solo Tackles',
  tfl: 'Tackles for Loss',
  qbHits: 'Quarterback Hits',
  pressures: 'Pressures',
  hurries: 'Quarterback Hurries',
  forcedFumbles: 'Forced Fumbles',
  fumbleRecoveries: 'Fumble Recoveries',
  interceptions: 'Interceptions',
  passesDefended: 'Passes Defended',
  defTds: 'Defensive Touchdowns',
  snaps: 'Defensive Snaps',
  snapPct: 'Defensive Snap Percentage',
  compPctAllowed: 'Completion Percentage Allowed in Coverage',
  yardsAllowed: 'Receiving Yards Allowed in Coverage',
  yardsPerTargetAllowed: 'Yards Allowed per Target',
  tdsAllowed: 'Touchdowns Allowed in Coverage',
  passerRatingAllowed: 'Passer Rating Allowed When Targeted',
  splashPlays: 'Splash Plays (Sacks + Interceptions + Forced Fumbles + Passes Defended)',
  passEpa: 'Expected Points Added per Pass Play',
  rushEpa: 'Expected Points Added per Run Play',
  giveaways: 'Turnovers (Interceptions + Fumbles Lost)',
  playsPerGame: 'Offensive Plays per Game',
  passYdsPerGame: 'Passing Yards per Game',
  rushYdsPerGame: 'Rushing Yards per Game',
  kickReturnAvg: 'Kickoff Return Average',
  puntReturnAvg: 'Punt Return Average',
  returnTds: 'Kickoff and Punt Return Touchdowns',
  oppReturnAvg: "Opponents' Return Average",
  blocksMade: 'Opponent Kicks Blocked',
  kicksBlocked: 'Own Kicks Blocked',
  stEpaPerPlay: 'Special Teams EPA per Play',
  kickoffEpa: 'EPA per Kickoff Kicked',
  puntEpa: 'EPA per Punt',
  fgEpa: 'EPA per Field Goal and Extra Point Try',
  returnEpa: 'EPA per Kickoff and Punt Received',
};

// Short labels for volume stats when Stat Base is on Per Game (yards read as YPG, points as PPG)
export const PER_GAME_LABELS: Partial<Record<SkillColumnKey, string>> = {
  passYards: 'Pass YPG',
  passTds: 'Pass TDs / Game',
  ints: 'INTs / Game',
  turnovers: 'TOs / Game',
  totalYards: 'Total YPG',
  rushYards: 'Rush YPG',
  recYards: 'Rec YPG',
  fantasy: 'Fantasy PPG',
  targets: 'Targets / Game',
  receptions: 'Rec / Game',
  recTds: 'Rec TDs / Game',
  rushTds: 'Rush TDs / Game',
  totalTds: 'Total TDs / Game',
  yac: 'YAC / Game',
  carries: 'Carries / Game',
  firstDowns: '1st Dn / Game',
  brokenTackles: 'Brk Tkl / Game',
  fumbles: 'Fum Lost / Game',
  drops: 'Drops / Game',
  fgMade: 'FG Made / Game',
  fgAtt: 'FG Att / Game',
  fg50: '50+ Made / Game',
  punts: 'Punts / Game',
  inside20: 'Inside 20 / Game',
  touchbacks: 'TBs / Game',
  sacks: 'Sacks / Game',
  takeaways: 'TOs / Game',
  sacksAllowed: 'Sacks / Game',
  tackles: 'Tackles / Game',
  soloTackles: 'Solo / Game',
  tfl: 'TFL / Game',
  qbHits: 'QB Hits / Game',
  pressures: 'Pressures / Game',
  hurries: 'Hurries / Game',
  forcedFumbles: 'FF / Game',
  fumbleRecoveries: 'FR / Game',
  interceptions: 'INTs / Game',
  passesDefended: 'PD / Game',
  defTds: 'Def TDs / Game',
  snaps: 'Snaps / Game',
  yardsAllowed: 'Yds Allowed / Game',
  tdsAllowed: 'TDs Allowed / Game',
  splashPlays: 'Splash / Game',
  giveaways: 'TOs / Game',
  returnTds: 'Ret TDs / Game',
  blocksMade: 'Blocks / Game',
  kicksBlocked: 'Blocked / Game',
};

export type SkillWeights = Partial<Record<SkillColumnKey, number>>;
// 'default' (everything at 50), or a preset key from SKILL_PRESETS for the position
export type SkillPreset = string;

// Games played: the first column on every player / unit tab, for sample-size context
const GAMES_STAT: SkillStat = {
  key: 'games',
  label: 'Games',
  description: 'Games played (for context; not part of the ranking)',
  kind: 'efficiency',
  format: 'int',
  infoOnly: true,
};

// Columns shown in place of a rushing + receiving pair when Combined Rush/Pass is on, and ranked
// as that total, its parts mixed by their sliders (unit-scoring combinedMix)
export const TOTAL_YARDS_STAT: SkillStat = {
  key: 'totalYards',
  label: 'Total Yds',
  description: 'Rushing + receiving yards',
  kind: 'volume',
  format: 'int',
};

export const TOTAL_TDS_STAT: SkillStat = {
  key: 'totalTds',
  label: 'Total TDs',
  description: 'Rushing + receiving touchdowns',
  kind: 'volume',
  format: 'int',
};

export const TURNOVERS_STAT: SkillStat = {
  key: 'turnovers',
  label: 'Turnovers',
  name: 'Total Interceptions + Fumbles Lost',
  description: 'Interceptions + fumbles lost (lower is better)',
  kind: 'volume',
  format: 'int',
  negative: true,
};

// Each combined column and the two stats it stands in for (it takes the first one's spot). In the
// sidebar the pair is one parent slider (labeled like the combined column) with the two as its
// breakdown: the parent's weight scales both parts (50 = as set), and its eye hides all three columns.
// A tab gets the pairs it has both parts of.
export const COMBINED_STATS: { stat: SkillStat; parts: [SkillColumnKey, SkillColumnKey] }[] = [
  { stat: TOTAL_YARDS_STAT, parts: ['rushYards', 'recYards'] },
  { stat: TOTAL_TDS_STAT, parts: ['rushTds', 'recTds'] },
  {
    stat: { ...TOTAL_YARDS_STAT, name: 'Total Passing + Rushing Yards', description: 'Passing + rushing yards' },
    parts: ['passYards', 'rushYards'],
  },
  {
    stat: { ...TOTAL_TDS_STAT, name: 'Total Passing + Rushing Touchdowns', description: 'Passing + rushing touchdowns' },
    parts: ['passTds', 'rushTds'],
  },
  { stat: TURNOVERS_STAT, parts: ['ints', 'fumbles'] },
];

// The combined pairs a position has both parts of
export function combinedFor(position: SkillPosition) {
  return COMBINED_STATS.filter(({ parts }) => parts.every((part) => SKILL_STATS[position].some((s) => s.key === part)));
}

const FANTASY_STAT: SkillStat = {
  key: 'fantasy',
  label: 'Fantasy Pts',
  description: 'Fantasy points (scoring set in the settings menu)',
  kind: 'volume',
  format: 'dec1',
};

// Team QB grade from the QB rankings: a support grade for receivers, runners (a good QB keeps
// defenses honest) and defenses (field position, time of possession)
const QB_PLAY_STAT: SkillStat = {
  key: 'qbPlay',
  label: 'QB Play',
  description: "Team QB grade from the current QB rankings, weighted by each QB's starts",
  kind: 'efficiency',
  format: 'grade',
  support: true,
};

// Team O-line grade (preseason blended with the Offensive Lines rankings)
const OLINE_STAT: SkillStat = {
  key: 'oline',
  label: 'O-Line',
  description: 'Team O-line grade (preseason blended with the Offensive Lines rankings; for QBs leaning on pass protection, for RBs on run blocking)',
  kind: 'efficiency',
  format: 'grade',
  support: true,
};

// Team weapons grade (preseason blended with the RB, WR and TE rankings)
const WEAPONS_STAT: SkillStat = {
  key: 'weapons',
  label: 'Weapons',
  description: 'Team weapons grade (preseason blended with the RB, WR and TE rankings)',
  kind: 'efficiency',
  format: 'grade',
  support: true,
};

// How much the offense runs through the QB (pass rate over expected, his share of the team's yards):
// carrying the offense counts for him
const RESPONSIBILITY_STAT: SkillStat = {
  key: 'responsibility',
  label: 'Responsibility',
  description: 'How much the offense runs through the QB (his share of the plays and yards): carrying it counts for him',
  kind: 'efficiency',
  format: 'grade',
  support: true,
  supportHelps: true,
};

// Team RB grade from the RB rankings: a support grade for offensive lines (a good back makes the
// run blocking look better)
const RB_PLAY_STAT: SkillStat = {
  key: 'rbPlay',
  label: 'RB Play',
  description: "Team RB grade from the current RB rankings, weighted by each back's carries",
  kind: 'efficiency',
  format: 'grade',
  support: true,
};

// Team coaching grade (preseason blended with the Head Coaches rankings, like the QB page)
const COACHING_STAT: SkillStat = {
  key: 'coaching',
  label: 'Coaching',
  description: "Team coaching grade (preseason blended with the Head Coaches rankings)",
  kind: 'efficiency',
  format: 'grade',
  support: true,
};

// Team defense grade from the Defenses rankings (like the QB page)
const DEFENSE_STAT: SkillStat = {
  key: 'defense',
  label: 'Defense',
  description: 'Team defense grade from the current Defenses rankings',
  kind: 'efficiency',
  format: 'grade',
  support: true,
};

// Fumbles lost (rushing + receiving): counts against RBs, WRs and TEs
const FUMBLES_STAT: SkillStat = {
  key: 'fumbles',
  label: 'Fumbles Lost',
  description: 'Fumbles lost',
  kind: 'volume',
  format: 'int',
  negative: true,
};

// Charted drops (Pro Football Reference): counts against RBs, WRs and TEs. Players with no targets
// yet, or that PFR doesn't chart, score as average rather than best or worst.
const DROPS_STAT: SkillStat = {
  key: 'drops',
  label: 'Drops',
  description: 'Catchable passes dropped, as charted by Pro Football Reference (lower is better)',
  kind: 'volume',
  format: 'int',
  negative: true,
  missingIsAverage: true,
};

// Run blocking (finished seasons only: it comes from nflverse's record of who was on the field each
// play, published after each season; this season's column and slider stay hidden until then). The
// team's rushing EPA per carry with him on the field minus with him off (at least 40 runs off). A
// rough read (the line, the back and the play calls all count too), so it starts with a small weight.
export const RUN_BLOCK_STAT: SkillStat = {
  key: 'runBlockEpa',
  label: 'Run Block EPA',
  description: 'Rushing EPA per carry with him on the field minus with him off (finished seasons)',
  kind: 'efficiency',
  format: 'dec2',
  missingIsAverage: true,
};

// A back's pass protection, the same way (finished seasons only): the QB's pressure rate on dropbacks
// with him on the field minus with him off, in percentage points (at least 40 dropbacks off). Lower is
// better. Also rough (he may be running a route rather than blocking), so it starts small too.
export const PASS_PRO_STAT: SkillStat = {
  key: 'passProPct',
  label: 'Pass Pro',
  description: 'QB pressure rate with him on the field minus with him off, in points (lower is better; finished seasons)',
  kind: 'efficiency',
  format: 'pctPoints',
  negative: true,
  missingIsAverage: true,
};

// Passing-game role and efficiency: WR/TE, and RBs' receiving side
const TARGETS_STAT: SkillStat = { key: 'targets', label: 'Targets', description: 'Times targeted', kind: 'volume', format: 'int' };

const TARGET_SHARE_STAT: SkillStat = {
  key: 'targetShare',
  label: 'Target Share',
  description: "Share of the team's targets",
  kind: 'efficiency',
  format: 'pct',
};

const EPA_PER_TARGET_STAT: SkillStat = {
  key: 'epaPerTarget',
  label: 'EPA / Target',
  description: 'Expected Points Added per target',
  kind: 'efficiency',
  format: 'dec2',
};

const RECEIVING_STATS: SkillStat[] = [
  GAMES_STAT,
  { key: 'receptions', label: 'Receptions', description: 'Catches', kind: 'volume', format: 'int' },
  TARGETS_STAT,
  TARGET_SHARE_STAT,
  { key: 'recYards', label: 'Rec Yards', description: 'Receiving yards', kind: 'volume', format: 'int' },
  { key: 'rushYards', label: 'Rush Yards', description: 'Rushing yards', kind: 'volume', format: 'int' },
  { key: 'yac', label: 'YAC', description: 'Yards after the catch', kind: 'volume', format: 'int' },
  { key: 'recTds', label: 'Rec TDs', description: 'Receiving touchdowns', kind: 'volume', format: 'int' },
  { key: 'rushTds', label: 'Rush TDs', description: 'Rushing touchdowns', kind: 'volume', format: 'int' },
  FUMBLES_STAT,
  DROPS_STAT,
  EPA_PER_TARGET_STAT,
  { key: 'catchPct', label: 'Catch %', description: 'Receptions per target', kind: 'efficiency', format: 'pct' },
  {
    key: 'separation',
    label: 'Separation',
    description: 'Average yards from the nearest defender at the catch point (Next Gen Stats)',
    kind: 'efficiency',
    format: 'dec1',
  },
  {
    key: 'yacOverExp',
    label: 'YAC Over Exp',
    description: 'Yards after catch above expected, per reception (Next Gen Stats)',
    kind: 'efficiency',
    format: 'dec1',
  },
  {
    key: 'dropPct',
    label: 'Drop %',
    description: 'Drops per target (lower is better)',
    kind: 'efficiency',
    format: 'pct',
    negative: true,
  },
  {
    key: 'adot',
    label: 'aDOT',
    description: 'Average depth of target in yards (Next Gen Stats)',
    kind: 'efficiency',
    format: 'dec1',
  },
  {
    key: 'airYardsShare',
    label: 'Air Yds Share',
    description: "Share of the team's air yards",
    kind: 'efficiency',
    format: 'pct',
  },
  // (added after the default rankings were set: scored, starting at 0, so DEFAULT doesn't move)
  {
    key: 'airYards',
    label: 'Air Yards',
    description: 'How far the passes thrown his way traveled in the air, caught or not, added up (starts at 0: turn it up to count it)',
    kind: 'volume',
    format: 'int',
    startsOff: true,
  },
  {
    key: 'endZoneTargets',
    label: 'End-Zone Tgts',
    description: 'Passes thrown his way into the end zone, from anywhere on the field (starts at 0: turn it up to count it)',
    kind: 'volume',
    format: 'int',
    startsOff: true,
  },
  {
    key: 'wopr',
    label: 'WOPR',
    description: "Weighted opportunity: 1.5 x target share + 0.7 x air yards share, fantasy's usage number (for context; its two parts are ranked already)",
    kind: 'efficiency',
    format: 'dec2',
    infoOnly: true,
  },
  {
    key: 'deepTargetPct',
    label: 'Deep Tgt %',
    description: 'Share of his targets thrown 20+ yards downfield: his role (for context; aDOT is the ranked depth stat)',
    kind: 'efficiency',
    format: 'pct',
    infoOnly: true,
  },
  {
    key: 'middleTargetPct',
    label: 'Middle Tgt %',
    description: 'Share of his targets thrown over the middle rather than outside: a rough hint of a slot role (for context; not part of the ranking)',
    kind: 'efficiency',
    format: 'pct',
    infoOnly: true,
  },
  {
    key: 'snapShare',
    label: 'Snap %',
    description: 'Average share of offensive snaps played',
    kind: 'efficiency',
    format: 'pct',
  },
  RUN_BLOCK_STAT,
  FANTASY_STAT,
  QB_PLAY_STAT,
];

// Teams: the season (record, point differential, the offense's and defense's ranks), how it plays (EPA
// per play on offense, defense and special teams, the turnover battle), close games, and the roster by
// your own rankings: the team grades each tab gets from the others (QB Play, RB Play, Weapons, O-Line,
// Defense, Coaching), here as the team's own strengths rather than support
const TEAM_STATS: SkillStat[] = [
  { key: 'winPct', label: 'Record', description: 'Win-loss record', kind: 'efficiency', format: 'record' },
  { key: 'recent', label: 'Recent', description: 'The last 5 games, newest first (newer ones count a little more)', kind: 'efficiency', format: 'recent' },
    {
      key: 'pointDiffPerGame',
      label: 'Pt Diff / Game',
      description: 'Average points scored minus points allowed per game',
      kind: 'efficiency',
      format: 'dec1',
    },
    {
      key: 'turnoverDiffPerGame',
      label: 'TO Diff / Game',
      description: 'Takeaways minus giveaways per game',
      kind: 'efficiency',
      format: 'dec1',
    },
    {
      key: 'netEpa',
      label: 'Net EPA / Play',
      description: "Offense EPA/play minus defense EPA/play allowed",
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'offEpa',
      label: 'Off EPA / Play',
      name: 'Offense Expected Points Added per Play',
      description: "The offense's EPA per play",
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'defEpaAllowed',
      label: 'Def EPA / Play',
      name: 'Defense Expected Points Added per Play Allowed',
      description: 'EPA per play allowed by the defense (lower is better)',
      kind: 'efficiency',
      format: 'dec2',
      negative: true,
    },
    {
      key: 'stEpaPerGame',
      label: 'ST EPA / Game',
      name: 'Special Teams EPA per Game',
      description: 'Expected Points Added per game on kicks, punts and returns (net of opponents)',
      kind: 'efficiency',
      format: 'dec2',
    },
  {
    key: 'offRank',
    label: 'Off Rank',
    name: 'Offense Rank',
    description: "The offense's league rank (by points or yards per game: Rank Base setting)",
    kind: 'efficiency',
    format: 'rank',
    negative: true,
  },
  {
    key: 'defRank',
    label: 'Def Rank',
    name: 'Defense Rank',
    description: "The defense's league rank (by points or yards allowed per game: Rank Base setting)",
    kind: 'efficiency',
    format: 'rank',
    negative: true,
  },
  { key: 'topPerGame', label: 'TOP / Game', name: 'Time of Possession per Game', description: "The team's time with the ball per game (for context; not part of the ranking)", kind: 'efficiency', format: 'mmss', infoOnly: true },
  {
    key: 'oneScoreWinPct',
    label: '1-Score Win %',
    description: 'Win % in games decided by 8 points or fewer (luck as much as clutch)',
    kind: 'efficiency',
    format: 'pct',
  },
  { ...QB_PLAY_STAT, support: false },
  { ...RB_PLAY_STAT, support: false },
  { ...WEAPONS_STAT, support: false },
  { ...OLINE_STAT, support: false },
  { ...DEFENSE_STAT, support: false },
  { ...COACHING_STAT, support: false },
];

// ---------------------------------------------------------------------------
// Defensive players (Edge, DL, LB, CB, S): nflverse's box stats for everyone (tackles, sacks, QB hits,
// takeaways), the snap counts from 2012 and Pro Football Reference's charting from 2018 (pressures,
// hurries, missed tackles, and what he allowed as the nearest defender in coverage). A season before a
// stat was recorded has its column hidden (every row empty); a player PFR has no line for in a season it
// charts scores as average on its stats, not as the worst (missingIsAverage)
// ---------------------------------------------------------------------------
const PFR_NOTE = 'as Pro Football Reference charts them (2018 on)';
const DEF_SNAPS_STAT: SkillStat = {
  key: 'snaps',
  label: 'Snaps',
  description: 'Defensive snaps played (2012 on; for context, not part of the ranking)',
  kind: 'volume',
  format: 'int',
  infoOnly: true,
};
const DEF_SNAP_PCT_STAT: SkillStat = {
  key: 'snapPct',
  label: 'Snap %',
  description: "Average share of the defense's snaps he was on the field for (2012 on)",
  kind: 'efficiency',
  format: 'pct',
  missingIsAverage: true,
};
const TACKLES_STAT: SkillStat = { key: 'tackles', label: 'Tackles', description: 'Combined tackles, solo and assisted', kind: 'volume', format: 'int' };
const SOLO_TACKLES_STAT: SkillStat = { key: 'soloTackles', label: 'Solo Tkl', description: 'Solo tackles', kind: 'volume', format: 'int' };
const TFL_STAT: SkillStat = { key: 'tfl', label: 'TFL', description: 'Tackles for loss', kind: 'volume', format: 'int' };
const DEF_SACKS_STAT: SkillStat = { key: 'sacks', label: 'Sacks', description: 'Sacks (a shared sack counts a half)', kind: 'volume', format: 'dec1' };
const QB_HITS_STAT: SkillStat = { key: 'qbHits', label: 'QB Hits', description: 'Hits on the quarterback, sacks included (from the play-by-play)', kind: 'volume', format: 'int' };
const PRESSURES_STAT: SkillStat = {
  key: 'pressures',
  label: 'Pressures',
  description: `Sacks, QB hits and hurries, ${PFR_NOTE}`,
  kind: 'volume',
  format: 'int',
  missingIsAverage: true,
};
const HURRIES_STAT: SkillStat = { key: 'hurries', label: 'Hurries', description: `Quarterback hurries, ${PFR_NOTE}`, kind: 'volume', format: 'int', missingIsAverage: true };
const DEF_PRESSURE_RATE_STAT: SkillStat = {
  key: 'pressureRate',
  label: 'Pressure %',
  description:
    "Pressures per defensive snap (Pro Football Reference doesn't publish pass-rush snaps, so every snap he played counts; 2018 on)",
  kind: 'efficiency',
  format: 'pct',
  missingIsAverage: true,
};
const FORCED_FUMBLES_STAT: SkillStat = { key: 'forcedFumbles', label: 'Forced Fum', description: 'Forced fumbles', kind: 'volume', format: 'int' };
const INTERCEPTIONS_STAT: SkillStat = { key: 'interceptions', label: 'INTs', description: 'Interceptions', kind: 'volume', format: 'int' };
const PASSES_DEFENDED_STAT: SkillStat = { key: 'passesDefended', label: 'Pass Def', description: 'Passes defended', kind: 'volume', format: 'int' };
// (a lineman's or an edge's passes defended: mostly balls batted down at the line (the owner, 2026-10-21: "the JJ Watt
// play"); scored, starting at 0, so DEFAULT doesn't move; Splash Plays already counts them)
const FRONT_PASSES_DEFENDED_STAT: SkillStat = {
  ...PASSES_DEFENDED_STAT,
  description: 'Passes defended: for a lineman or an edge, mostly passes batted down at the line (starts at 0: turn it up to count it)',
  startsOff: true,
};
const DEF_TDS_STAT: SkillStat = { key: 'defTds', label: 'Def TDs', description: 'Defensive touchdowns (interception and fumble returns)', kind: 'volume', format: 'int' };
const DEF_TAKEAWAYS_STAT: SkillStat = { key: 'takeaways', label: 'Takeaways', description: 'Interceptions + opponent fumbles recovered', kind: 'volume', format: 'int' };
const SPLASH_PLAYS_STAT: SkillStat = {
  key: 'splashPlays',
  label: 'Splash Plays',
  description: 'Sacks + interceptions + forced fumbles + passes defended',
  kind: 'volume',
  format: 'dec1',
};
const DEF_MISSED_TACKLE_STAT: SkillStat = {
  key: 'missedTacklePct',
  label: 'Missed Tkl %',
  description: `Missed tackles per tackle attempt, ${PFR_NOTE} (lower is better)`,
  kind: 'efficiency',
  format: 'pct',
  negative: true,
  missingIsAverage: true,
};
// Coverage: what he allowed as the nearest defender on the throws PFR charts to him (targets are his
// coverage workload: a slider to zero if it shouldn't count)
const COVERAGE_TARGETS_STAT: SkillStat = {
  key: 'targets',
  label: 'Targets',
  description: `Throws at the receiver he was covering, ${PFR_NOTE}: his coverage workload`,
  kind: 'volume',
  format: 'int',
  missingIsAverage: true,
};
const COMP_PCT_ALLOWED_STAT: SkillStat = {
  key: 'compPctAllowed',
  label: 'Comp % Allowed',
  description: `Completions per target in his coverage, ${PFR_NOTE} (lower is better)`,
  kind: 'efficiency',
  format: 'pct',
  negative: true,
  missingIsAverage: true,
};
const YARDS_ALLOWED_STAT: SkillStat = {
  key: 'yardsAllowed',
  label: 'Yds Allowed',
  description: `Receiving yards allowed in his coverage, ${PFR_NOTE} (lower is better)`,
  kind: 'volume',
  format: 'int',
  negative: true,
  missingIsAverage: true,
};
const YARDS_PER_TARGET_ALLOWED_STAT: SkillStat = {
  key: 'yardsPerTargetAllowed',
  label: 'Yds / Target',
  description: `Yards allowed per target in his coverage, ${PFR_NOTE} (lower is better)`,
  kind: 'efficiency',
  format: 'dec1',
  negative: true,
  missingIsAverage: true,
};
const TDS_ALLOWED_STAT: SkillStat = {
  key: 'tdsAllowed',
  label: 'TDs Allowed',
  description: `Touchdowns allowed in his coverage, ${PFR_NOTE} (lower is better)`,
  kind: 'volume',
  format: 'int',
  negative: true,
  missingIsAverage: true,
};
const RATING_ALLOWED_STAT: SkillStat = {
  key: 'passerRatingAllowed',
  label: 'Rating Allowed',
  description: `Passer rating on throws into his coverage, ${PFR_NOTE} (lower is better)`,
  kind: 'efficiency',
  format: 'dec1',
  negative: true,
  missingIsAverage: true,
};
const COVERAGE_STATS: SkillStat[] = [
  COVERAGE_TARGETS_STAT,
  COMP_PCT_ALLOWED_STAT,
  YARDS_ALLOWED_STAT,
  YARDS_PER_TARGET_ALLOWED_STAT,
  TDS_ALLOWED_STAT,
  RATING_ALLOWED_STAT,
];

// Edge rushers and interior linemen: the pass rush and the run stop, then the plays that turn games
const FRONT_STATS: SkillStat[] = [
  GAMES_STAT,
  DEF_SNAPS_STAT,
  DEF_SACKS_STAT,
  TFL_STAT,
  TACKLES_STAT,
  QB_HITS_STAT,
  FRONT_PASSES_DEFENDED_STAT,
  FORCED_FUMBLES_STAT,
  DEF_TAKEAWAYS_STAT,
  SPLASH_PLAYS_STAT,
  DEF_TDS_STAT,
  PRESSURES_STAT,
  HURRIES_STAT,
  DEF_PRESSURE_RATE_STAT,
  DEF_MISSED_TACKLE_STAT,
  DEF_SNAP_PCT_STAT,
];

// Corners and safeties: the ball and the receiver first, then the tackling
const SECONDARY_STATS: SkillStat[] = [
  GAMES_STAT,
  DEF_SNAPS_STAT,
  INTERCEPTIONS_STAT,
  PASSES_DEFENDED_STAT,
  TACKLES_STAT,
  TFL_STAT,
  FORCED_FUMBLES_STAT,
  DEF_TAKEAWAYS_STAT,
  SPLASH_PLAYS_STAT,
  DEF_TDS_STAT,
  ...COVERAGE_STATS,
  DEF_MISSED_TACKLE_STAT,
  DEF_SNAP_PCT_STAT,
];

export const SKILL_STATS: Record<SkillPosition, SkillStat[]> = {
  TM: TEAM_STATS,
  // Record, Recent and ESPN box stats; play-by-play and charting stats (nflverse) in Advanced
  QB: [
    { key: 'winPct', label: 'Record', name: 'Record as Starter', description: 'Win % as a starter', kind: 'efficiency', format: 'record' },
    { key: 'recent', label: 'Recent', description: 'Last five starts, newest counts most', kind: 'efficiency', format: 'recent' },
    { key: 'passYards', label: 'Pass Yards', description: 'Passing yards', kind: 'volume', format: 'int' },
    { key: 'ypa', label: 'Per Attempt', description: 'Yards per pass attempt', kind: 'efficiency', format: 'dec1' },
    { key: 'compPct', label: 'Comp %', description: 'Completion percentage', kind: 'efficiency', format: 'pctPoints' },
    { key: 'rushYards', label: 'Rush Yards', description: 'Rushing yards', kind: 'volume', format: 'int' },
    { key: 'passTds', label: 'Pass TDs', description: 'Passing touchdowns', kind: 'volume', format: 'int' },
    { key: 'rushTds', label: 'Rush TDs', description: 'Rushing touchdowns', kind: 'volume', format: 'int' },
    {
      key: 'ints',
      label: 'Interceptions',
      description: 'Interceptions thrown (lower is better)',
      kind: 'volume',
      format: 'int',
      negative: true,
    },
    FUMBLES_STAT,
    { key: 'rating', label: 'Rating', description: 'Passer rating', kind: 'efficiency', format: 'dec1' },
    {
      key: 'epaPerPlay',
      label: 'EPA / Play',
      description: 'Expected Points Added per play (dropbacks and runs)',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'epaPerDropback',
      label: 'EPA / Dropback',
      description: 'Expected Points Added per dropback: his passing alone, sacks and scrambles in, designed runs out (starts at 0: turn it up to count it)',
      kind: 'efficiency',
      format: 'dec2',
      startsOff: true,
    },
    {
      key: 'successRate',
      label: 'Success',
      description: 'Share of plays gaining positive EPA',
      kind: 'efficiency',
      format: 'pct',
    },
    {
      key: 'cpoe',
      label: 'CPOE',
      description: 'Completion % over expected',
      kind: 'efficiency',
      format: 'pctPoints',
    },
    {
      key: 'pressureToSack',
      label: 'Pressure → Sack',
      description: 'Share of pressures that turn into sacks (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'badThrowPct',
      label: 'Bad Throw %',
      description: 'Share of attempts charted as inaccurate (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'timeToThrow',
      label: 'Time to Throw',
      name: 'Time to Throw',
      description: 'Seconds from snap to throw (quicker is better)',
      kind: 'efficiency',
      format: 'dec2',
      negative: true,
    },
    { key: 'adot', label: 'aDOT', description: 'Average depth of target', kind: 'efficiency', format: 'dec1' },
    {
      key: 'aggressiveness',
      label: 'Aggressive %',
      description: 'Throws into tight coverage',
      kind: 'efficiency',
      format: 'pctPoints',
    },
    FANTASY_STAT,
    WEAPONS_STAT,
    OLINE_STAT,
    DEFENSE_STAT,
    COACHING_STAT,
    RESPONSIBILITY_STAT,
  ],
  RB: [
    GAMES_STAT,
    { key: 'carries', label: 'Carries', description: 'Rushing attempts', kind: 'volume', format: 'int' },
    { key: 'rushYards', label: 'Rush Yards', description: 'Rushing yards', kind: 'volume', format: 'int' },
    { key: 'ypc', label: 'Yds / Carry', description: 'Yards per carry', kind: 'efficiency', format: 'dec1' },
    { key: 'receptions', label: 'Receptions', description: 'Catches', kind: 'volume', format: 'int' },
    // Receiving role, so pass-catching backs get their due (EPA / Target sits in Advanced; no target
    // share: targets already carry it)
    TARGETS_STAT,
    { key: 'recYards', label: 'Rec Yards', description: 'Receiving yards', kind: 'volume', format: 'int' },
    { key: 'rushTds', label: 'Rush TDs', description: 'Rushing touchdowns', kind: 'volume', format: 'int' },
    { key: 'recTds', label: 'Rec TDs', description: 'Receiving touchdowns', kind: 'volume', format: 'int' },
    FUMBLES_STAT,
    DROPS_STAT,
    {
      key: 'firstDowns',
      label: '1st Downs',
      description: 'Rushing + receiving first downs',
      kind: 'volume',
      format: 'int',
    },
    {
      key: 'epaPerCarry',
      label: 'EPA / Carry',
      description: 'Expected Points Added per carry',
      kind: 'efficiency',
      format: 'dec2',
    },
    EPA_PER_TARGET_STAT,
    {
      key: 'ryoePerAtt',
      label: 'RYOE / Carry',
      description: 'Rush yards over expected per carry, given the blocking and defenders (Next Gen Stats)',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'yacoPerCarry',
      label: 'YAC / Carry',
      description: 'Rushing yards after first contact per carry',
      kind: 'efficiency',
      format: 'dec1',
    },
    {
      key: 'brokenTackles',
      label: 'Broken Tkl',
      description: 'Broken tackles on runs and catches',
      kind: 'volume',
      format: 'int',
    },
    {
      key: 'snapShare',
      label: 'Snap %',
      description: 'Average share of offensive snaps played',
      kind: 'efficiency',
      format: 'pct',
    },
    PASS_PRO_STAT,
    FANTASY_STAT,
    QB_PLAY_STAT,
    OLINE_STAT,
  ],
  WR: RECEIVING_STATS,
  TE: RECEIVING_STATS,
  K: [
    GAMES_STAT,
    { key: 'fgMade', label: 'FG Made', description: 'Field goals made', kind: 'volume', format: 'int' },
    // Context for FG Made and FG %: shown, but no slider and no weight in the ranking
    { key: 'fgAtt', label: 'FG Att', description: 'Field goal attempts (for context; not part of the ranking)', kind: 'volume', format: 'int', infoOnly: true },
    { key: 'fgPct', label: 'FG %', description: 'Field goal percentage', kind: 'efficiency', format: 'pct' },
    { key: 'fg50', label: '50+ Made', description: 'Field goals made from 50+ yards', kind: 'volume', format: 'int' },
    { key: 'fgLong', label: 'Long', description: 'Longest field goal', kind: 'efficiency', format: 'int' },
    { key: 'patPct', label: 'XP %', description: 'Extra point percentage', kind: 'efficiency', format: 'pct' },
    {
      key: 'epaPerKick',
      label: 'EPA / Kick',
      description: 'Expected Points Added per field goal and extra point attempt',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'fgOverExp',
      label: 'FG % Over Exp',
      description: 'Field goal % above what the kick distances predict, in percentage points',
      kind: 'efficiency',
      format: 'pctPoints',
    },
    {
      ...FANTASY_STAT,
      description: 'Standard kicker scoring: FG 3/4/5 by distance, XP 1, misses -1',
    },
  ],
  P: [
    GAMES_STAT,
    { key: 'punts', label: 'Punts', description: 'Punts', kind: 'volume', format: 'int' },
    { key: 'grossAvg', label: 'Gross Avg', description: 'Yards per punt', kind: 'efficiency', format: 'dec1' },
    {
      key: 'netAvg',
      label: 'Net Avg',
      description: 'Net yards per punt (after returns and touchbacks)',
      kind: 'efficiency',
      format: 'dec1',
    },
    { key: 'inside20', label: 'Inside 20', description: 'Punts downed inside the 20', kind: 'volume', format: 'int' },
    {
      key: 'inside20Pct',
      label: 'In-20 %',
      description: 'Share of punts downed inside the 20',
      kind: 'efficiency',
      format: 'pct',
    },
    {
      key: 'epaPerPunt',
      label: 'EPA / Punt',
      description: 'Expected Points Added per punt (for the punting team)',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'touchbacks',
      label: 'Touchbacks',
      description: 'Punts into the end zone',
      kind: 'volume',
      format: 'int',
      negative: true,
    },
    {
      key: 'fairCatchPct',
      label: 'Fair Catch %',
      description: 'Share of punts fair caught',
      kind: 'efficiency',
      format: 'pct',
    },
  ],
  // Team offenses: the defenses' mirror (update-data.mjs offenseUnits). Turnovers and sacks taken count
  // against it; the ranks are there to read, the EPA columns already rank it
  OFF: [
    GAMES_STAT,
    { key: 'playsPerGame', label: 'Plays / Game', description: "Passes and runs per game: the offense's pace (for context; not part of the ranking)", kind: 'efficiency', format: 'dec1', infoOnly: true },
    { key: 'topPerGame', label: 'TOP / Game', name: 'Time of Possession per Game', description: "The offense's time with the ball per game (for context; not part of the ranking)", kind: 'efficiency', format: 'mmss', infoOnly: true },
    {
      key: 'offRank',
      label: 'Off Rank',
      name: 'Offense Rank',
      description: "The offense's league rank (1 = best), by the Rank Base setting: points per game (the scoring offense rank) or yards per game",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'passOffRank',
      label: 'Pass O Rank',
      name: 'Passing Offense Rank',
      description:
        "The offense's league rank through the air (1 = best), by the Rank Base setting. Yards: passing yards per game, sacks taken off. Points: passing touchdowns per game (points aren't split by pass and run, so touchdowns stand in)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'rushOffRank',
      label: 'Run O Rank',
      name: 'Rushing Offense Rank',
      description:
        "The offense's league rank on the ground (1 = best), by the Rank Base setting. Yards: rushing yards per game, QB scrambles included. Points: rushing touchdowns per game (points aren't split by pass and run, so touchdowns stand in)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    { key: 'epaPerPlay', label: 'EPA / Play', description: 'Expected Points Added per play', kind: 'efficiency', format: 'dec2' },
    { key: 'passEpa', label: 'Pass EPA', description: 'EPA per pass play', kind: 'efficiency', format: 'dec2' },
    { key: 'rushEpa', label: 'Rush EPA', description: 'EPA per run play', kind: 'efficiency', format: 'dec2' },
    { key: 'successRate', label: 'Success %', description: 'Share of plays that gained positive EPA', kind: 'efficiency', format: 'pct' },
    { key: 'ptsPerGame', label: 'Pts / Game', description: 'Points scored per game', kind: 'efficiency', format: 'dec1' },
    { key: 'yardsPerGame', label: 'Yds / Game', description: 'Yards from scrimmage per game', kind: 'efficiency', format: 'dec1' },
    { key: 'passYdsPerGame', label: 'Pass Yds / G', description: 'Passing yards per game (sacks taken off, as the league counts them)', kind: 'efficiency', format: 'dec1' },
    { key: 'rushYdsPerGame', label: 'Rush Yds / G', description: 'Rushing yards per game (QB scrambles included)', kind: 'efficiency', format: 'dec1' },
    { key: 'redZoneTdPct', label: 'Red Zone TD %', description: 'Share of its red-zone drives ending in a touchdown', kind: 'efficiency', format: 'pct' },
    { key: 'thirdDownPct', label: '3rd Down %', description: 'Third-down conversion rate', kind: 'efficiency', format: 'pct' },
    { key: 'giveaways', label: 'Turnovers', description: 'Interceptions thrown + fumbles lost (lower is better)', kind: 'volume', format: 'int', negative: true },
    { key: 'sacksAllowed', label: 'Sacks Taken', description: 'Sacks taken (lower is better)', kind: 'volume', format: 'int', negative: true },
    DEFENSE_STAT,
    COACHING_STAT,
  ],
  // Lower is better for everything "allowed", so those count against the defense
  DEF: [
    GAMES_STAT,
    { key: 'topPerGame', label: 'TOP / Game', name: 'Time of Possession per Game', description: "The team's own time with the ball per game: how long its defense rests (for context; not part of the ranking)", kind: 'efficiency', format: 'mmss', infoOnly: true },
    // Where it ranks in the league (1 = best), in all and against the pass and the run, by the Rank Base
    // setting: there to read, not part of the ranking (a slider at 0% would hide the column; its EPA columns
    // already rank it)
    {
      key: 'defRank',
      label: 'Def Rank',
      name: 'Defense Rank',
      description:
        "The defense's league rank (1 = best), by the Rank Base setting: points allowed per game (the scoring defense rank) or yards allowed per game",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'passDefRank',
      label: 'Pass D Rank',
      name: 'Pass Defense Rank',
      description:
        "The defense's league rank against the pass (1 = best), by the Rank Base setting. Yards: passing yards allowed per game, sacks taken off. Points: passing touchdowns allowed per game (points aren't split by pass and run, so touchdowns stand in)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'runDefRank',
      label: 'Run D Rank',
      name: 'Run Defense Rank',
      description:
        "The defense's league rank against the run (1 = best), by the Rank Base setting. Yards: rushing yards allowed per game, QB scrambles included. Points: rushing touchdowns allowed per game (points aren't split by pass and run, so touchdowns stand in)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'epaAllowed',
      label: 'EPA / Play',
      description: 'Expected Points Added per play allowed (lower is better)',
      kind: 'efficiency',
      format: 'dec2',
      negative: true,
    },
    {
      key: 'passEpaAllowed',
      label: 'Pass EPA',
      description: 'EPA per pass play allowed (lower is better)',
      kind: 'efficiency',
      format: 'dec2',
      negative: true,
    },
    {
      key: 'rushEpaAllowed',
      label: 'Rush EPA',
      description: 'EPA per run play allowed (lower is better)',
      kind: 'efficiency',
      format: 'dec2',
      negative: true,
    },
    {
      key: 'successAllowed',
      label: 'Success %',
      description: 'Share of plays where the offense gained positive EPA (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    { key: 'sacks', label: 'Sacks', description: 'Sacks', kind: 'volume', format: 'int' },
    {
      key: 'pressureRate',
      label: 'Pressure %',
      description:
        "Pressures per opponent dropback, as Pro Football Reference's charters count them (a judgment call: other sources, like Next Gen Stats, count differently)",
      kind: 'efficiency',
      format: 'pct',
    },
    {
      key: 'qbHitRate',
      label: 'QB Hit %',
      description: 'QB hits per opponent dropback, sacks included (from the play-by-play: no charting)',
      kind: 'efficiency',
      format: 'pct',
    },
    {
      key: 'takeaways',
      label: 'Takeaways',
      description: 'Interceptions + fumbles recovered',
      kind: 'volume',
      format: 'int',
    },
    {
      key: 'ptsAllowedPerGame',
      label: 'Pts / Game',
      description: 'Points allowed per game (lower is better)',
      kind: 'efficiency',
      format: 'dec1',
      negative: true,
    },
    {
      key: 'thirdDownPct',
      label: '3rd Down %',
      description: 'Opponent third-down conversion rate (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'redZoneTdPct',
      label: 'Red Zone TD %',
      description: 'Share of opponent red-zone drives ending in a touchdown (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'missedTacklePct',
      label: 'Missed Tkl %',
      description: 'Missed tackles per tackle attempt (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      ...FANTASY_STAT,
      description:
        'Standard D/ST scoring: sack 1, takeaway 2, TD 6, safety 2, plus points-allowed tier each game',
    },
    QB_PLAY_STAT,
    COACHING_STAT,
  ],
  EDGE: FRONT_STATS,
  DL: FRONT_STATS,
  // Team special teams (update-data.mjs specialTeamsUnits): the kicking, the punting, the returns and the
  // coverage, each with its EPA; opponents' returns and its own kicks blocked count against it
  ST: [
    GAMES_STAT,
    {
      key: 'stRank',
      label: 'ST Rank',
      name: 'Special Teams Rank',
      description: "The unit's league rank (1 = best) by special-teams EPA per play, its kicks, punts and returns together (the Rank Base setting doesn't apply: special teams have no points or yards of their own)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'stEpaPerPlay',
      label: 'ST EPA / Play',
      description: "Expected Points Added per special-teams play from the team's side: its kickoffs and punts, its field goal and extra point tries, its returns",
      kind: 'efficiency',
      format: 'dec2',
    },
    { key: 'fgMade', label: 'FG Made', description: 'Field goals made', kind: 'volume', format: 'int' },
    { key: 'fgPct', label: 'FG %', description: 'Field goal percentage', kind: 'efficiency', format: 'pct' },
    { key: 'patPct', label: 'XP %', description: 'Extra point percentage', kind: 'efficiency', format: 'pct' },
    { key: 'fgEpa', label: 'Kick EPA', description: 'EPA per field goal and extra point try', kind: 'efficiency', format: 'dec2' },
    { key: 'netAvg', label: 'Net Punt', name: 'Net Punting Average', description: "Net yards per punt (the punt's distance less the return, a touchback 20)", kind: 'efficiency', format: 'dec1' },
    { key: 'inside20Pct', label: 'In-20 %', description: 'Share of punts downed inside the 20', kind: 'efficiency', format: 'pct' },
    { key: 'puntEpa', label: 'Punt EPA', description: 'EPA per punt, the coverage included', kind: 'efficiency', format: 'dec2' },
    { key: 'kickReturnAvg', label: 'KR Avg', description: 'Yards per kickoff return', kind: 'efficiency', format: 'dec1' },
    { key: 'puntReturnAvg', label: 'PR Avg', description: 'Yards per punt return', kind: 'efficiency', format: 'dec1' },
    { key: 'returnTds', label: 'Return TDs', description: 'Kickoff and punt return touchdowns', kind: 'volume', format: 'int' },
    { key: 'returnEpa', label: 'Return EPA', description: 'EPA per kickoff and punt received: the returns, the fair catches and the touchbacks', kind: 'efficiency', format: 'dec2' },
    { key: 'kickoffEpa', label: 'Kickoff EPA', description: 'EPA per kickoff kicked: the kick and its coverage', kind: 'efficiency', format: 'dec2' },
    { key: 'oppReturnAvg', label: 'Opp Ret Avg', description: "Opponents' yards per return on its kickoffs and punts (lower is better)", kind: 'efficiency', format: 'dec1', negative: true },
    { key: 'blocksMade', label: 'Blocks', description: 'Opponent field goals, extra points and punts it blocked', kind: 'volume', format: 'int' },
    { key: 'kicksBlocked', label: 'Blocked', description: 'Its own field goals, extra points and punts blocked (lower is better)', kind: 'volume', format: 'int', negative: true },
    COACHING_STAT,
  ],
  // Linebackers do everything: the tackling, the blitz, the coverage and the takeaways
  LB: [
    GAMES_STAT,
    DEF_SNAPS_STAT,
    TACKLES_STAT,
    SOLO_TACKLES_STAT,
    TFL_STAT,
    DEF_SACKS_STAT,
    QB_HITS_STAT,
    INTERCEPTIONS_STAT,
    PASSES_DEFENDED_STAT,
    FORCED_FUMBLES_STAT,
    DEF_TAKEAWAYS_STAT,
    SPLASH_PLAYS_STAT,
    DEF_TDS_STAT,
    PRESSURES_STAT,
    HURRIES_STAT,
    ...COVERAGE_STATS,
    DEF_MISSED_TACKLE_STAT,
    DEF_SNAP_PCT_STAT,
  ],
  CB: SECONDARY_STATS,
  // (a safety's sacks too: the blitz off the edge)
  S: [...SECONDARY_STATS.slice(0, 6), SOLO_TACKLES_STAT, DEF_SACKS_STAT, ...SECONDARY_STATS.slice(6)],
  // Lower is better for everything "allowed", and for stuffs and penalties
  OL: [
    GAMES_STAT,
    {
      key: 'sacksAllowed',
      label: 'Sacks',
      description: 'Sacks allowed (lower is better)',
      kind: 'volume',
      format: 'int',
      negative: true,
    },
    {
      key: 'qbHitRate',
      label: 'QB Hit %',
      description: 'QB hits allowed per dropback, sacks included (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    { key: 'ypc', label: 'Yds / Carry', description: 'Yards per designed run', kind: 'efficiency', format: 'dec1' },
    {
      key: 'stuffRate',
      label: 'Stuff %',
      description: 'Share of designed runs stopped at or behind the line (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'shortYardagePct',
      label: 'Short Yd %',
      description: 'Conversion rate on 3rd and 4th and 1-2 runs',
      kind: 'efficiency',
      format: 'pct',
      missingIsAverage: true,
    },
    {
      key: 'linePenaltiesPerGame',
      label: 'Penalties / Game',
      description: 'Holding, false starts and other blocking penalties per game (lower is better)',
      kind: 'efficiency',
      format: 'dec1',
      negative: true,
    },
    {
      key: 'runEpa',
      label: 'Run EPA',
      description: 'Expected Points Added per designed run',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'runSuccess',
      label: 'Run Success %',
      description: 'Share of designed runs with positive EPA',
      kind: 'efficiency',
      format: 'pct',
    },
    {
      key: 'pressureRate',
      label: 'Pressure %',
      description: 'Pressures allowed per dropback (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'sackRate',
      label: 'Sack %',
      description: 'Sacks allowed per dropback (lower is better)',
      kind: 'efficiency',
      format: 'pct',
      negative: true,
    },
    {
      key: 'yardsBeforeContact',
      label: 'YBC / Carry',
      description: 'Yards before first contact per carry',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'timeToThrow',
      label: 'Time to Throw',
      description: "QB seconds from snap to throw. Longer counts in the line's favor: a QB who holds the ball takes sacks and hits that aren't all the line's fault, and a quick one hides a weak line",
      kind: 'efficiency',
      format: 'dec2',
    },
    QB_PLAY_STAT,
    RB_PLAY_STAT,
    COACHING_STAT,
  ],
  HC: [
    { key: 'winPct', label: 'Record', description: 'Win-loss record', kind: 'efficiency', format: 'record' },
    {
      key: 'winsOverExpected',
      label: 'Wins Over Exp',
      description: 'Wins minus the wins implied by the betting lines before each game',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'atsPct',
      label: 'ATS %',
      description: 'Share of games covering the point spread (pushes excluded)',
      kind: 'efficiency',
      format: 'pct',
    },
    // Where the coach's units rank in the league (1 = best), by the Rank Base setting
    {
      key: 'offRank',
      label: 'Off Rank',
      name: 'Offense Rank',
      description: "The offense's league rank (by points or yards per game: Rank Base setting)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    {
      key: 'defRank',
      label: 'Def Rank',
      name: 'Defense Rank',
      description: "The defense's league rank (by points or yards allowed per game: Rank Base setting)",
      kind: 'efficiency',
      format: 'rank',
      negative: true,
    },
    // (special teams, the third phase: the ranks above cover only offense and defense)
    {
      key: 'stEpaPerGame',
      label: 'ST EPA / Game',
      name: 'Special Teams EPA per Game',
      description: 'Expected Points Added per game on kicks, punts and returns (net of opponents)',
      kind: 'efficiency',
      format: 'dec2',
    },
    {
      key: 'penaltiesPerGame',
      label: 'Penalties / Game',
      description: 'Penalties called on the team per game (lower is better)',
      kind: 'efficiency',
      format: 'dec1',
      negative: true,
    },
    {
      key: 'oneScoreWinPct',
      label: '1-Score Win %',
      description: 'Win % in games decided by 8 points or fewer',
      kind: 'efficiency',
      format: 'pct',
    },
    {
      key: 'fourthDownGoPct',
      label: '4th Down Go %',
      description: 'How often the team goes for it on 4th and 1-2 at midfield or beyond (outside blowouts)',
      kind: 'efficiency',
      format: 'pct',
      missingIsAverage: true,
    },
    QB_PLAY_STAT,
    WEAPONS_STAT,
    OLINE_STAT,
    DEFENSE_STAT,
  ],
};

// Default: everything at 50 (Run Block EPA and Pass Pro at 10). A preset (skill-presets.ts) is only its
// theme: it sets the stats it's named for and puts every other stat at 0, the support grades (a cast
// adjustment, not a theme) and the rough Run Block EPA / Pass Pro reads included, unless it names them. The
// parent Total Yds / Total TDs / Turnovers sliders stay at 50: they only scale the parts they pair (50 = as
// set), so a pair whose parts are both 0 counts for nothing and one with a named part counts as that part.
// Fantasy ranks purely on fantasy points.
export function presetWeights(position: SkillPosition, preset: SkillPreset): SkillWeights {
  const def = SKILL_PRESETS[position].find((p) => p.key === preset);
  const fantasyOnly = preset === 'fantasy';
  // Run blocking is a rough read, so it starts small in DEFAULT (a touch of weight, never the story)
  const small = (stat: SkillStat) => stat.key === 'runBlockEpa' || stat.key === 'passProPct';
  const weights: SkillWeights = {};
  for (const stat of SKILL_STATS[position]) {
    if (stat.infoOnly) continue;
    weights[stat.key] = def || stat.startsOff ? 0 : small(stat) ? 10 : 50;
  }
  for (const { stat } of combinedFor(position)) weights[stat.key] = fantasyOnly ? 0 : 50;
  return { ...weights, ...(def?.weights ?? {}) };
}

// ---------------------------------------------------------------------------
// Stat groups (categories): each tab's, in the grid's order, each group its stats in column order
// (stat-groups.ts resolves them). Only a look: where a column sits, the strip's name, icon and color, and
// what the sidebar's eye on the group switches off together. The ranking reads the sliders alone.
//
// The players, Offenses, Defenses, O-Lines, kickers and punters keep Results | Basic | Advanced | Support
// (the owner, 2026-10-19). The Teams tab reads as a team's profile (Results | Offense | Defense | Special
// Teams | Support), a head coach's as his (Results | Offense | Defense | Coaching | Support: Coaching his own
// calls, 4th-down aggressiveness, discipline and the third phase), the Special Teams tab by its units
// (Results | Kicking | Punting | Returns | Support; Returns the return game both ways, the block units with
// it). Tones (colors): Results 0, Support 3, the profile strips 1, 2, 4, 5 in order.
// ---------------------------------------------------------------------------
type Group = GroupDef<SkillColumnKey>;
const group = (id: string, title: string, icon: string, tone: number, keys: SkillColumnKey[], box = false): Group => (box ? { id, title, icon, tone, keys, box } : { id, title, icon, tone, keys });

const results = (keys: SkillColumnKey[]) => group('results', 'Results', 'emoji_events', 0, keys);
const basic = (keys: SkillColumnKey[]) => group('box', 'Basic', 'bar_chart', 1, keys);
const advanced = (keys: SkillColumnKey[]) => group('advanced', 'Advanced', 'insights', 2, keys);
const support = (keys: SkillColumnKey[]) => group('support', 'Support', 'groups', 3, keys, true);
const offense = (keys: SkillColumnKey[]) => group('offense', 'Offense', 'bolt', 1, keys);
const defense = (keys: SkillColumnKey[]) => group('defense', 'Defense', 'shield', 2, keys);

const RECEIVER_GROUPS: Group[] = [
  results(['games']),
  basic(['receptions', 'targets', 'targetShare', 'recYards', 'rushYards', 'yac', 'recTds', 'rushTds', 'fumbles', 'drops']),
  advanced(['epaPerTarget', 'catchPct', 'separation', 'yacOverExp', 'dropPct', 'adot', 'airYardsShare', 'airYards', 'endZoneTargets', 'wopr', 'deepTargetPct', 'middleTargetPct', 'snapShare', 'runBlockEpa', 'fantasy']),
  support(['qbPlay']),
];
const RUSHER_GROUPS: Group[] = [
  results(['games']),
  basic(['snaps', 'sacks', 'tfl', 'tackles', 'qbHits', 'passesDefended', 'forcedFumbles', 'takeaways', 'splashPlays', 'defTds']),
  advanced(['pressures', 'hurries', 'pressureRate', 'missedTacklePct', 'snapPct']),
];
const COVERAGE_ADVANCED: SkillColumnKey[] = ['compPctAllowed', 'yardsAllowed', 'yardsPerTargetAllowed', 'tdsAllowed', 'passerRatingAllowed', 'missedTacklePct', 'snapPct'];

export const GROUPS: Record<SkillPosition, Group[]> = {
  TM: [
    results(['winPct', 'recent', 'pointDiffPerGame', 'turnoverDiffPerGame', 'netEpa', 'oneScoreWinPct', 'topPerGame']),
    offense(['offRank', 'offEpa']),
    defense(['defRank', 'defEpaAllowed']),
    { ...group('special', 'Special', 'sports_football', 4, ['stEpaPerGame']), fullTitle: 'Special Teams' },
    support(['qbPlay', 'rbPlay', 'weapons', 'oline', 'defense', 'coaching']),
  ],
  OFF: [
    results(['games', 'topPerGame', 'offRank', 'passOffRank', 'rushOffRank']),
    basic(['playsPerGame', 'ptsPerGame', 'yardsPerGame', 'passYdsPerGame', 'rushYdsPerGame', 'redZoneTdPct', 'thirdDownPct', 'giveaways', 'sacksAllowed']),
    advanced(['epaPerPlay', 'passEpa', 'rushEpa', 'successRate']),
    support(['defense', 'coaching']),
  ],
  QB: [
    results(['winPct', 'recent']),
    basic(['passYards', 'ypa', 'compPct', 'rushYards', 'passTds', 'rushTds', 'ints', 'fumbles', 'rating']),
    advanced(['epaPerPlay', 'epaPerDropback', 'successRate', 'cpoe', 'pressureToSack', 'badThrowPct', 'timeToThrow', 'adot', 'aggressiveness', 'fantasy']),
    support(['weapons', 'oline', 'defense', 'coaching', 'responsibility']),
  ],
  RB: [
    results(['games']),
    basic(['carries', 'rushYards', 'ypc', 'receptions', 'targets', 'recYards', 'rushTds', 'recTds', 'fumbles', 'drops', 'firstDowns']),
    advanced(['epaPerCarry', 'epaPerTarget', 'ryoePerAtt', 'yacoPerCarry', 'brokenTackles', 'snapShare', 'passProPct', 'fantasy']),
    support(['qbPlay', 'oline']),
  ],
  WR: RECEIVER_GROUPS,
  TE: RECEIVER_GROUPS,
  OL: [
    results(['games']),
    basic(['sacksAllowed', 'ypc', 'stuffRate', 'shortYardagePct', 'linePenaltiesPerGame']),
    advanced(['qbHitRate', 'runEpa', 'runSuccess', 'pressureRate', 'sackRate', 'yardsBeforeContact', 'timeToThrow']),
    support(['qbPlay', 'rbPlay', 'coaching']),
  ],
  DEF: [
    results(['games', 'topPerGame', 'defRank', 'passDefRank', 'runDefRank']),
    basic(['sacks', 'takeaways', 'ptsAllowedPerGame', 'thirdDownPct', 'redZoneTdPct']),
    advanced(['epaAllowed', 'passEpaAllowed', 'rushEpaAllowed', 'successAllowed', 'pressureRate', 'qbHitRate', 'missedTacklePct', 'fantasy']),
    support(['qbPlay', 'coaching']),
  ],
  EDGE: RUSHER_GROUPS,
  DL: RUSHER_GROUPS,
  LB: [
    results(['games']),
    basic(['snaps', 'tackles', 'soloTackles', 'tfl', 'sacks', 'qbHits', 'interceptions', 'passesDefended', 'forcedFumbles', 'takeaways', 'splashPlays', 'defTds', 'targets']),
    advanced(['pressures', 'hurries', ...COVERAGE_ADVANCED]),
  ],
  CB: [
    results(['games']),
    basic(['snaps', 'interceptions', 'passesDefended', 'tackles', 'tfl', 'forcedFumbles', 'takeaways', 'splashPlays', 'defTds', 'targets']),
    advanced(COVERAGE_ADVANCED),
  ],
  S: [
    results(['games']),
    basic(['snaps', 'interceptions', 'passesDefended', 'tackles', 'tfl', 'soloTackles', 'sacks', 'forcedFumbles', 'takeaways', 'splashPlays', 'defTds', 'targets']),
    advanced(COVERAGE_ADVANCED),
  ],
  ST: [
    results(['games', 'stRank', 'stEpaPerPlay']),
    group('kicking', 'Kicking', 'sports_football', 1, ['fgMade', 'fgPct', 'patPct', 'fgEpa', 'kickoffEpa', 'kicksBlocked']),
    group('punting', 'Punting', 'arrow_outward', 2, ['netAvg', 'inside20Pct', 'puntEpa']),
    group('returns', 'Returns', 'u_turn_left', 4, ['kickReturnAvg', 'puntReturnAvg', 'returnTds', 'returnEpa', 'oppReturnAvg', 'blocksMade']),
    support(['coaching']),
  ],
  K: [results(['games']), basic(['fgMade', 'fgAtt', 'fgPct', 'fg50', 'fgLong', 'patPct']), advanced(['epaPerKick', 'fgOverExp', 'fantasy'])],
  P: [results(['games']), basic(['punts', 'grossAvg', 'netAvg', 'inside20', 'inside20Pct', 'touchbacks', 'fairCatchPct']), advanced(['epaPerPunt'])],
  HC: [
    results(['winPct', 'winsOverExpected', 'atsPct', 'oneScoreWinPct']),
    offense(['offRank']),
    defense(['defRank']),
    group('coaching', 'Coaching', 'sports', 4, ['fourthDownGoPct', 'penaltiesPerGame', 'stEpaPerGame']),
    support(['qbPlay', 'weapons', 'oline', 'defense']),
  ],
};

// The groups a tab retired, each its stats of the day it went (legacy-groups.ts: a link, preset or pin that
// hid one hides those stats one by one, so it ranks as its author saw it). The Teams, Head Coaches and
// Special Teams tabs' Basic and Advanced, as they were on 2026-10-19.
export const LEGACY_GROUPS: Partial<Record<SkillPosition, Record<string, SkillColumnKey[]>>> = {
  TM: { box: ['pointDiffPerGame', 'turnoverDiffPerGame'], advanced: ['netEpa', 'offEpa', 'defEpaAllowed', 'stEpaPerGame', 'oneScoreWinPct'] },
  HC: { box: ['penaltiesPerGame'], advanced: ['stEpaPerGame', 'oneScoreWinPct', 'fourthDownGoPct'] },
  ST: {
    box: ['fgMade', 'fgPct', 'patPct', 'netAvg', 'inside20Pct', 'kickReturnAvg', 'puntReturnAvg', 'returnTds', 'oppReturnAvg', 'blocksMade', 'kicksBlocked'],
    advanced: ['stEpaPerPlay', 'fgEpa', 'puntEpa', 'returnEpa', 'kickoffEpa'],
  },
};

// A stat's group on a tab (a combined column, Total Yds: its parts')
export function statGroup(stat: SkillStat, position: SkillPosition): StatGroupId {
  const defs = GROUPS[position];
  const own = groupOfKey(defs, stat.key);
  if (own) return own;
  const pair = COMBINED_STATS.find(({ stat: total }) => total.key === stat.key);
  return (pair && groupOfKey(defs, pair.parts[0])) ?? defs[0].id;
}

// A position's headline stats for the player card's Seasons tab (build-comps.mjs writes them into the
// careers files, so they're pinned here: never a grade, record, rank or display-only count)
const HEADLINE: Record<SkillPosition, SkillColumnKey[]> = {
  TM: ['pointDiffPerGame', 'turnoverDiffPerGame'],
  OFF: ['ptsPerGame', 'yardsPerGame', 'passYdsPerGame'],
  QB: ['passYards', 'ypa', 'compPct'],
  RB: ['carries', 'rushYards', 'ypc'],
  WR: ['receptions', 'targets', 'targetShare'],
  TE: ['receptions', 'targets', 'targetShare'],
  OL: ['sacksAllowed', 'ypc', 'stuffRate'],
  DEF: ['sacks', 'takeaways', 'ptsAllowedPerGame'],
  EDGE: ['sacks', 'tfl', 'tackles'],
  DL: ['sacks', 'tfl', 'tackles'],
  LB: ['tackles', 'soloTackles', 'tfl'],
  CB: ['interceptions', 'passesDefended', 'tackles'],
  S: ['interceptions', 'passesDefended', 'tackles'],
  ST: ['fgMade', 'fgPct', 'patPct'],
  K: ['fgMade', 'fgPct', 'fg50'],
  P: ['punts', 'grossAvg', 'netAvg'],
  HC: ['penaltiesPerGame'],
};

export function headlineStats(position: SkillPosition): SkillStat[] {
  const stats = SKILL_STATS[position];
  return HEADLINE[position].map((key) => stats.find((stat) => stat.key === key)).filter((stat): stat is SkillStat => !!stat);
}

export type SkillStatGroup = StatGroup<SkillStat>;

// A position's groups with their stats, leaving out groups it has no stats for
export function skillGroups(position: SkillPosition): SkillStatGroup[] {
  return resolveGroups(GROUPS[position], SKILL_STATS[position]);
}
