import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every tab, one set per position, each built around a real player / unit type. A preset
// sets the stats it's named for (the lead at 100, the rest of its list 40-90); every other stat drops to
// the rest weight (positions.ts presetWeights: 25 on a small tab, down to 10 on a big one), and support
// grades and the Total Yds / Total TDs parent sliders stay neutral at 50. A preset that wants one part of a
// combined pair (passing or rushing yards) pushes the other part down: the total adds raw yards, so the
// part with the bigger spread would win at an even slider. Fantasy ranks purely on fantasy points.
// The order on every tab: the overall lens, Analytics, the archetypes, Winning, Stats Only, then Fantasy.
export interface SkillPresetDef {
  key: string;
  label: string;
  description: string;
  weights: SkillWeights;
}

const FANTASY: SkillPresetDef = {
  key: 'fantasy',
  label: 'Fantasy',
  description: 'Fantasy points only (scoring is set in the settings menu)',
  weights: { fantasy: 100 },
};

const WR_TE_ANALYTICS: SkillPresetDef = {
  key: 'efficiency',
  label: 'Analytics',
  description: 'Production per target: EPA / Target, Catch %, YAC Over Exp, few drops and Separation',
  weights: { epaPerTarget: 100, catchPct: 80, yacOverExp: 75, dropPct: 75, separation: 60 },
};

export const SKILL_PRESETS: Record<SkillPosition, SkillPresetDef[]> = {
  // Carried over from the original QB page: each group weight (Support, Advanced) is folded into the
  // sliders it scaled. The combined pairs' parts are set with their parent; Fantasy Pts is 0 outside
  // Fantasy (it's the same yards, TDs and turnovers again)
  QB: [
    {
      key: 'mvp',
      label: 'MVP',
      description: 'What MVP voters reward: Total TDs, Total Yds, few turnovers, the record, Rating and EPA',
      // (support at 25: voters don't adjust for the cast around him)
      weights: {
        winPct: 80, recent: 40, compPct: 30, totalYards: 60, passYards: 50, rushYards: 50,
        ypa: 40, totalTds: 75, passTds: 50, rushTds: 50, turnovers: 60, ints: 50,
        fumbles: 50, rating: 60, epaPerPlay: 60, cpoe: 40, successRate: 40, fantasy: 0,
        pressureToSack: 20, badThrowPct: 20, timeToThrow: 0, adot: 0, aggressiveness: 0, weapons: 25,
        coaching: 25, oline: 25, defense: 25, responsibility: 25,
      },
    },
    {
      key: 'analytics',
      label: 'Analytics',
      description: 'Efficiency first: EPA / Play, CPOE, Success, Pressure → Sack and Bad Throw %, then turnovers',
      weights: {
        winPct: 0, recent: 0, compPct: 0, totalYards: 20, passYards: 50, rushYards: 50,
        ypa: 50, totalTds: 20, passTds: 50, rushTds: 50, turnovers: 40, ints: 50,
        fumbles: 50, rating: 0, epaPerPlay: 100, cpoe: 100, successRate: 100, fantasy: 0,
        pressureToSack: 100, badThrowPct: 100, timeToThrow: 25, adot: 25, aggressiveness: 25,
      },
    },
    {
      key: 'gunslinger',
      label: 'Gunslinger',
      description: 'Pushes the ball downfield: passing yards and TDs, aDOT, Aggressive % and Per Attempt, then Bad Throw %',
      weights: {
        winPct: 30, recent: 30, compPct: 20, totalYards: 80, passYards: 100, rushYards: 0,
        ypa: 80, totalTds: 80, passTds: 100, rushTds: 0, turnovers: 20, ints: 50,
        fumbles: 50, rating: 40, epaPerPlay: 60, cpoe: 30, successRate: 30, fantasy: 0,
        pressureToSack: 30, badThrowPct: 25, timeToThrow: 0, adot: 100, aggressiveness: 100,
      },
    },
    {
      key: 'dualThreat',
      label: 'Dual Threat',
      description: 'Hurts you with his legs as well as his arm: rushing yards and TDs, then passing and EPA',
      // (passing's parts down to 10: passing yards' spread is about 2.5x rushing's, so at even sliders the
      // totals would mostly be passing)
      weights: {
        winPct: 40, recent: 40, compPct: 30, totalYards: 100, passYards: 10, rushYards: 100,
        ypa: 40, totalTds: 100, passTds: 10, rushTds: 100, turnovers: 25, ints: 50,
        fumbles: 50, rating: 40, epaPerPlay: 75, successRate: 50, fantasy: 0,
        pressureToSack: 50, timeToThrow: 0,
      },
    },
    {
      key: 'gameManager',
      label: 'Game Manager',
      description: 'Careful and accurate: few turnovers, CPOE, Bad Throw %, Comp %, Success and quick throws',
      weights: {
        winPct: 70, recent: 30, compPct: 90, totalYards: 25, passYards: 50, rushYards: 50,
        ypa: 40, totalTds: 30, passTds: 50, rushTds: 50, turnovers: 50, ints: 75,
        fumbles: 75, rating: 70, epaPerPlay: 60, cpoe: 100, successRate: 90, fantasy: 0,
        pressureToSack: 90, badThrowPct: 100, timeToThrow: 90, adot: 0, aggressiveness: 0,
      },
    },
    {
      key: 'winner',
      label: 'Winning',
      description: 'Wins: the record and recent form, then the stats as a tiebreaker',
      weights: {
        winPct: 100, recent: 100, compPct: 10, totalYards: 10, passYards: 50, rushYards: 50,
        ypa: 10, totalTds: 10, passTds: 50, rushTds: 50, turnovers: 10, ints: 50,
        fumbles: 50, rating: 10, epaPerPlay: 10, cpoe: 10, successRate: 10, fantasy: 0,
        pressureToSack: 10, badThrowPct: 10, timeToThrow: 0, adot: 0, aggressiveness: 0,
      },
    },
    {
      key: 'stats',
      label: 'Stats Only',
      description: 'Just the numbers: no record, recent form or support adjustments',
      weights: {
        winPct: 0, recent: 0, compPct: 50, totalYards: 50, passYards: 50, rushYards: 50,
        ypa: 50, totalTds: 50, passTds: 50, rushTds: 50, turnovers: 50, ints: 50,
        fumbles: 50, rating: 50, epaPerPlay: 50, cpoe: 50, successRate: 50, fantasy: 0,
        pressureToSack: 50, badThrowPct: 50, timeToThrow: 50, adot: 50, aggressiveness: 50, weapons: 0,
        coaching: 0, oline: 0, defense: 0, responsibility: 0,
      },
    },
    FANTASY,
  ],
  RB: [
    {
      key: 'workhorse',
      label: 'Workhorse',
      description: 'Every-down volume: carries, rushing yards and TDs, snaps, first downs, then catches and pass protection',
      weights: { carries: 100, rushYards: 90, snapShare: 90, rushTds: 80, firstDowns: 75, receptions: 50, passProPct: 50 },
    },
    {
      key: 'efficiency',
      label: 'Analytics',
      description: 'Production per touch: EPA / Carry, RYOE / Carry, Yds / Carry, YAC / Carry and EPA / Target',
      weights: { epaPerCarry: 100, ryoePerAtt: 100, ypc: 90, yacoPerCarry: 75, epaPerTarget: 75 },
    },
    {
      key: 'passCatcher',
      label: 'Pass Catcher',
      description: 'The passing game: targets, catches, receiving yards and TDs, EPA / Target, then few drops',
      // (the rushing parts down: rushing yards' spread is about 2.5x receiving's)
      weights: { targets: 100, receptions: 90, recYards: 90, recTds: 75, epaPerTarget: 75, drops: 50, rushYards: 10, rushTds: 10 },
    },
    {
      key: 'elusive',
      label: 'Elusive',
      description: 'Breaks tackles: Broken Tkl, YAC / Carry, RYOE / Carry and Yds / Carry (2018 on)',
      weights: { brokenTackles: 100, yacoPerCarry: 100, ryoePerAtt: 60, ypc: 60 },
    },
    FANTASY,
  ],
  WR: [
    {
      key: 'alpha',
      label: 'Alpha',
      description: 'The focal point of the offense: targets, target and air-yards share, yards, catches, TDs and snaps',
      weights: { targets: 100, targetShare: 100, airYardsShare: 90, recYards: 90, receptions: 80, recTds: 75, snapShare: 60 },
    },
    WR_TE_ANALYTICS,
    {
      key: 'deepThreat',
      label: 'Deep Threat',
      description: 'Stretches the field: aDOT, Air Yds Share, yards, TDs and EPA / Target',
      weights: { adot: 100, airYardsShare: 90, recYards: 75, recTds: 75, epaPerTarget: 60 },
    },
    {
      key: 'playmaker',
      label: 'Playmaker',
      description: 'Dangerous with the ball: YAC and YAC Over Exp, then TDs',
      weights: { yac: 100, yacOverExp: 100, recTds: 50 },
    },
    {
      key: 'routeRunner',
      label: 'Route Runner',
      description: 'Gets open and earns the ball: Separation, Target Share, targets and Catch %',
      weights: { separation: 100, targetShare: 80, targets: 60, catchPct: 60 },
    },
    FANTASY,
  ],
  TE: [
    {
      key: 'receivingTe',
      label: 'Pass Catcher',
      description: 'A true target: targets, Target Share, catches, yards, TDs and Air Yds Share',
      weights: { targets: 100, targetShare: 100, receptions: 90, recYards: 90, recTds: 75, airYardsShare: 60 },
    },
    WR_TE_ANALYTICS,
    {
      key: 'everyDown',
      label: 'Two-Way TE',
      description: 'On the field every down: snap share and run blocking, then catches, Catch % and few drops',
      weights: { snapShare: 100, runBlockEpa: 75, receptions: 50, catchPct: 50, dropPct: 50 },
    },
    FANTASY,
  ],
  K: [
    {
      key: 'accuracy',
      label: 'Accuracy',
      description: 'Makes what he should and more: FG %, FG % Over Exp, XP % and EPA / Kick',
      weights: { fgPct: 100, fgOverExp: 100, patPct: 80, epaPerKick: 75 },
    },
    {
      key: 'bigLeg',
      label: 'Big Leg',
      description: 'Range: 50+ yard makes and the longest kick, then FG % Over Exp',
      weights: { fg50: 100, fgLong: 100, fgOverExp: 60 },
    },
    { ...FANTASY, description: 'Fantasy points only (standard kicker scoring)' },
  ],
  P: [
    {
      key: 'distance',
      label: 'Distance',
      description: 'Distance: gross and net average',
      weights: { grossAvg: 100, netAvg: 80 },
    },
    {
      key: 'placement',
      label: 'Placement',
      description: 'Pins them deep: In-20 % and few touchbacks, then punts inside the 20',
      weights: { inside20Pct: 100, touchbacks: 80, inside20: 50 },
    },
    {
      key: 'hangTime',
      label: 'Unreturnable',
      description: 'Gives the returner nothing: Fair Catch %, net average and EPA / Punt',
      weights: { fairCatchPct: 100, netAvg: 80, epaPerPunt: 80 },
    },
  ],
  DEF: [
    {
      key: 'passRush',
      label: 'Pass Rush',
      description: 'Gets home: sacks, Pressure %, QB Hit % and pass EPA allowed',
      weights: { sacks: 100, pressureRate: 100, qbHitRate: 100, passEpaAllowed: 75 },
    },
    {
      key: 'analytics',
      label: 'Analytics',
      description: 'Play-by-play efficiency: EPA, success rate, pass EPA and rush EPA allowed',
      weights: { epaAllowed: 100, successAllowed: 90, passEpaAllowed: 75, rushEpaAllowed: 75 },
    },
    {
      key: 'runStop',
      label: 'Run Stop',
      description: 'Shuts down the ground game: rush EPA allowed, tackling and run defense rank, then Success %',
      weights: { rushEpaAllowed: 100, missedTacklePct: 80, runDefRank: 75, successAllowed: 50 },
    },
    {
      key: 'ballHawks',
      label: 'Ball Hawks',
      description: 'Takes the ball away: takeaways, then pass EPA allowed and pass defense rank',
      weights: { takeaways: 100, passEpaAllowed: 75, passDefRank: 60 },
    },
    {
      key: 'bendDontBreak',
      label: "Bend Don't Break",
      description: 'Keeps points off the board: points allowed, Red Zone TD % and 3rd Down %',
      weights: { ptsAllowedPerGame: 100, redZoneTdPct: 100, thirdDownPct: 80 },
    },
    { ...FANTASY, description: 'Fantasy points only (standard D/ST scoring)' },
  ],
  OL: [
    {
      key: 'passPro',
      label: 'Pass Pro',
      description: 'Keeps the QB clean: pressure and sack rate, then sacks, QB hits and time to throw',
      weights: { pressureRate: 100, sackRate: 100, sacksAllowed: 75, qbHitRate: 75, timeToThrow: 75 },
    },
    {
      key: 'analytics',
      label: 'Analytics',
      description: 'Play-by-play efficiency: Run EPA, Run Success %, Pressure % and Sack %',
      weights: { runEpa: 100, runSuccess: 90, pressureRate: 75, sackRate: 75 },
    },
    {
      key: 'maulers',
      label: 'Run Blocking',
      description: 'Moves people in the run game: YBC, few stuffs, Yds / Carry, Run Success % and Short Yd %',
      weights: { yardsBeforeContact: 100, stuffRate: 90, ypc: 75, runSuccess: 60, shortYardagePct: 60 },
    },
  ],
  HC: [
    {
      key: 'overachiever',
      label: 'Coaching Job',
      description: 'Getting more from a roster than its talent: Wins Over Exp, then ATS %',
      weights: { winsOverExpected: 100, atsPct: 60 },
    },
    {
      key: 'units',
      label: 'Complete Team',
      description: 'How good his units are: offense rank, defense rank and special teams EPA',
      weights: { offRank: 100, defRank: 100, stEpaPerGame: 75 },
    },
    {
      key: 'analytics',
      label: 'Aggressive',
      description: 'Plays the percentages: 4th Down Go %',
      weights: { fourthDownGoPct: 100 },
    },
    {
      key: 'winner',
      label: 'Winning',
      description: 'Wins: the record, then close games',
      weights: { winPct: 100, oneScoreWinPct: 50 },
    },
  ],
  TM: [
    {
      key: 'contender',
      label: 'Contender',
      description: 'The best teams: point differential, net EPA and the record',
      weights: { pointDiffPerGame: 100, netEpa: 90, winPct: 80 },
    },
    {
      key: 'roster',
      label: 'Best Roster',
      description: 'The players, by your own rankings at every spot',
      weights: { qbPlay: 100, rbPlay: 60, weapons: 90, oline: 80, defense: 90 },
    },
    {
      key: 'offense',
      label: 'Offense',
      description: 'The offense: Off EPA and Off Rank, then the QB, weapons, line and backs',
      weights: { offEpa: 100, offRank: 70, qbPlay: 60, weapons: 50, oline: 50, rbPlay: 40 },
    },
    {
      key: 'defense',
      label: 'Defense',
      description: 'The defense: EPA allowed and Def Rank, then the defense grade',
      weights: { defEpaAllowed: 100, defRank: 70, defense: 60 },
    },
  ],
};
