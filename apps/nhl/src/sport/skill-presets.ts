import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every tab, each built around a kind of player and nothing else. A preset names every stat
// of its theme (the lead at 100, the rest of its list 50-90; a closely linked stat at a token 10) and every
// other stat drops to 0 (positions.ts presetWeights), so a Sniper is goals alone and a Shutdown D defense
// alone. The order on every tab: the overall lens, the archetypes (offense, then defense, then physical),
// then Winning or Old School.
export interface SkillPresetDef {
  key: string;
  label: string;
  description: string;
  weights: SkillWeights;
}

// Skaters
const IMPACT: SkillPresetDef = {
  key: 'impact',
  label: 'Total Impact',
  description: 'The all-in-one numbers: Game Score and Rel xGF %, then on-ice xGF %',
  weights: { gameScore: 100, xgfRel: 80, xgfPct: 60 },
};
// (every goal-scoring stat: the goals, the chances behind them, the finishing, the big ones)
const SNIPER: SkillPresetDef = {
  key: 'sniper',
  label: 'Sniper',
  description: 'Goals: goals, ixG, Shooting %, goals above expected, shots, high-danger shots and GWG',
  weights: { goals: 100, ixg: 80, shootingPct: 70, goalsAboveX: 60, shots: 50, hdShots: 50, gwg: 50 },
};
// (points only at a token 10: half of them are his own goals)
const PLAYMAKER: SkillPresetDef = {
  key: 'playmaker',
  label: 'Playmaker',
  description: 'Setting others up: assists and power-play points, a little of points',
  weights: { assists: 100, ppPoints: 50, points: 10 },
};
// (both ends by design: the chance share and puck possession, his points, and the defensive plays; a
// center's with his faceoffs, the wingers' and the Top 50's without: TWO_WAY_W)
const TWO_WAY_C: SkillPresetDef = {
  key: 'twoWay',
  label: 'Two-Way',
  description: 'Both ends: Rel xGF %, xGF %, faceoffs, CF %, takeaways, points, blocks and plus/minus',
  weights: { xgfRel: 100, xgfPct: 80, faceoffPct: 70, cfPct: 60, takeaways: 60, points: 60, blocks: 50, plusMinus: 50 },
};
const TWO_WAY_W: SkillPresetDef = {
  key: 'twoWay',
  label: 'Two-Way',
  description: 'Both ends: Rel xGF %, xGF %, CF %, takeaways, points, blocks and plus/minus',
  weights: { xgfRel: 100, xgfPct: 80, cfPct: 60, takeaways: 60, points: 60, blocks: 50, plusMinus: 50 },
};
// (PIM stays out: the penalties he takes aren't what the preset is after)
const PHYSICAL: SkillPresetDef = {
  key: 'physical',
  label: 'Physical',
  description: 'Throwing the body: hits and blocked shots',
  weights: { hits: 100, blocks: 70 },
};
// (the record leads by far; the on-ice numbers only add a little)
const WINNER: SkillPresetDef = {
  key: 'winner',
  label: 'Winning',
  description: 'His team winning with him: the record, then a little of plus/minus, GWG and Rel xGF %',
  weights: { winPct: 100, plusMinus: 30, gwg: 20, xgfRel: 20 },
};

// Defensemen move the puck or defend
// (the scoring from the back end; Rel xGF % only at a token 10: it counts the chances against too)
const OFFENSIVE_D: SkillPresetDef = {
  key: 'offensiveD',
  label: 'Offensive D',
  description: 'Running the play from the back end: points, assists, power-play points, goals, shots and ixG, a little of Rel xGF %',
  weights: { points: 100, assists: 70, ppPoints: 70, goals: 60, shots: 60, ixg: 50, xgfRel: 10 },
};
// (every defensive stat the tab has: the chance and shot shares against, the plays, and fewer giveaways)
const SHUTDOWN_D: SkillPresetDef = {
  key: 'shutdown',
  label: 'Shutdown D',
  description: 'Keeping it out: xGF %, Rel xGF %, blocks, CF %, hits, takeaways, plus/minus and fewer giveaways',
  weights: { xgfPct: 100, xgfRel: 90, blocks: 80, cfPct: 60, hits: 60, takeaways: 60, plusMinus: 50, giveaways: 40 },
};

// Goalies
const GOALIE_PRESETS: SkillPresetDef[] = [
  {
    key: 'saves',
    label: 'Shot Stopper',
    description: 'Stopping the puck against the shots he faced: GSAx, save percentage, high-danger saves and GSAx / 60',
    weights: { gsax: 100, savePct: 80, hdSavePct: 80, gsaxPer60: 70 },
  },
  {
    key: 'workhorse',
    label: 'Workhorse',
    description: 'Carrying the load: saves, GSAx and shutouts',
    weights: { saves: 100, gsax: 70, shutouts: 60 },
  },
  {
    key: 'classic',
    label: 'Old School',
    description: 'The back of the hockey card: the record, save percentage, GAA, shutouts and saves',
    weights: { winPct: 100, savePct: 90, gaa: 80, shutouts: 70, saves: 30 },
  },
];

// Teams
const TEAM_PRESETS: SkillPresetDef[] = [
  {
    key: 'contender',
    label: 'Contender',
    description: 'The best teams: goal differential, the record, chance share and playoff wins',
    weights: { goalDiff: 100, winPct: 90, xgfPct: 70, playoffWins: 60 },
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: "How it plays, not how it bounced: xGF %, CF % and its goalies' GSAx",
    weights: { xgfPct: 100, cfPct: 60, gsaxTeam: 50 },
  },
  {
    key: 'roster',
    label: 'Best Roster',
    description: 'The players, by your own rankings at every spot',
    weights: { forwards: 100, blueline: 100, goaltending: 100 },
  },
  {
    key: 'offense',
    label: 'Offense',
    description: 'The offense: its league rank, then the power play',
    weights: { offRank: 100, ppPct: 70 },
  },
  {
    key: 'defense',
    label: 'Defense',
    description: "The defense: its league rank, then its goalies' GSAx, the penalty kill and your goalie rankings",
    weights: { defRank: 100, gsaxTeam: 70, pkPct: 60, goaltending: 50 },
  },
];

// Head coaches (the NBA's, word for word)
const COACH_PRESETS: SkillPresetDef[] = [
  {
    key: 'coachingJob',
    label: 'Coaching Job',
    description: 'Getting more from a roster than its talent: the Coaching Lift, then close games',
    weights: { lift: 100, ptsOver: 50 },
  },
  // (the Coaching Lift only at a token 10 on these two: it's the chance share at both ends, not one)
  {
    key: 'offense',
    label: 'Offensive Mind',
    description: "Scheme on offense: the offense's rank, a little of the Coaching Lift",
    weights: { offRank: 100, lift: 10 },
  },
  {
    key: 'defense',
    label: 'Defensive Mind',
    description: "Scheme on defense: the defense's rank, a little of the Coaching Lift",
    weights: { defRank: 100, lift: 10 },
  },
  // (the record leads; playoff wins add to it)
  {
    key: 'winner',
    label: 'Winning',
    description: 'Results: the record, then playoff wins',
    weights: { winPct: 100, playoffWins: 30 },
  },
];

export const SKILL_PRESETS: Record<SkillPosition, SkillPresetDef[]> = {
  TM: TEAM_PRESETS,
  // (every skater together: the presets forwards and defensemen share, Two-Way without Faceoff %)
  TOP: [IMPACT, SNIPER, PLAYMAKER, TWO_WAY_W, WINNER],
  C: [IMPACT, SNIPER, PLAYMAKER, TWO_WAY_C, WINNER],
  LW: [IMPACT, SNIPER, PLAYMAKER, TWO_WAY_W, PHYSICAL, WINNER],
  RW: [IMPACT, SNIPER, PLAYMAKER, TWO_WAY_W, PHYSICAL, WINNER],
  D: [IMPACT, OFFENSIVE_D, SHUTDOWN_D, PHYSICAL, WINNER],
  G: GOALIE_PRESETS,
  HC: COACH_PRESETS,
};
