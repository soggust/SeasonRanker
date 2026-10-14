import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every tab, each built around a kind of player. A preset sets the stats it's named for (the
// lead at 100, the rest of its list 50-90); every other stat drops to the rest weight (positions.ts
// presetWeights: 25 on a small tab like HC or the goalies, down to 10 on the skater tabs, so what it names
// leads). The order on every tab: the overall lens, the archetypes (offense, then defense, then physical),
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
const SNIPER: SkillPresetDef = {
  key: 'sniper',
  label: 'Sniper',
  description: 'Goals: goals, ixG, Shooting %, goals above expected, shots and high-danger shots',
  weights: { goals: 100, ixg: 80, shootingPct: 70, goalsAboveX: 60, shots: 50, hdShots: 50 },
};
const PLAYMAKER: SkillPresetDef = {
  key: 'playmaker',
  label: 'Playmaker',
  description: 'Setting others up: assists, points and power-play points',
  weights: { assists: 100, points: 60, ppPoints: 60 },
};
// (a center's, with his faceoffs; the wingers' and the Top 50's without: TWO_WAY_W)
const TWO_WAY_C: SkillPresetDef = {
  key: 'twoWay',
  label: 'Two-Way',
  description: 'Both ends: Rel xGF %, xGF %, faceoffs, takeaways, points and blocks',
  weights: { xgfRel: 100, xgfPct: 80, faceoffPct: 70, takeaways: 60, points: 60, blocks: 50 },
};
const TWO_WAY_W: SkillPresetDef = {
  key: 'twoWay',
  label: 'Two-Way',
  description: 'Both ends: Rel xGF %, xGF %, takeaways, points and blocks',
  weights: { xgfRel: 100, xgfPct: 80, takeaways: 60, points: 60, blocks: 50 },
};
// (PIM off: the penalties he takes aren't what the preset is after)
const PHYSICAL: SkillPresetDef = {
  key: 'physical',
  label: 'Physical',
  description: 'Throwing the body: hits and blocked shots',
  weights: { hits: 100, blocks: 70, pim: 0 },
};
const WINNER: SkillPresetDef = {
  key: 'winner',
  label: 'Winning',
  description: 'His team winning with him: the record, plus/minus, Rel xGF % and game-winning goals',
  weights: { winPct: 100, plusMinus: 70, xgfRel: 60, gwg: 50 },
};

// Defensemen move the puck or defend
const OFFENSIVE_D: SkillPresetDef = {
  key: 'offensiveD',
  label: 'Offensive D',
  description: 'Running the play from the back end: points, assists, power-play points, shots and Rel xGF %',
  weights: { points: 100, assists: 70, ppPoints: 70, shots: 60, xgfRel: 50 },
};
const SHUTDOWN_D: SkillPresetDef = {
  key: 'shutdown',
  label: 'Shutdown D',
  description: 'Keeping it out: xGF %, Rel xGF %, blocks, hits and plus/minus',
  weights: { xgfPct: 100, xgfRel: 90, blocks: 80, hits: 60, plusMinus: 50 },
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
    description: 'The back of the hockey card: the record, save percentage, GAA and shutouts',
    weights: { winPct: 100, savePct: 90, gaa: 80, shutouts: 70 },
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
    weights: { xgfPct: 100, cfPct: 60, gsaxTeam: 50, ptsOver: 0 },
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
  {
    key: 'offense',
    label: 'Offensive Mind',
    description: "Scheme on offense: the offense's rank, then the Coaching Lift",
    weights: { offRank: 100, lift: 60 },
  },
  {
    key: 'defense',
    label: 'Defensive Mind',
    description: "Scheme on defense: the defense's rank, then the Coaching Lift",
    weights: { defRank: 100, lift: 60 },
  },
  {
    key: 'winner',
    label: 'Winning',
    description: 'Results: the record and playoff wins',
    weights: { winPct: 100, playoffWins: 100 },
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
