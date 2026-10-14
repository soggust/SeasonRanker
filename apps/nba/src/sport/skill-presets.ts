import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every tab, each built around a kind of player. A preset sets the stats it's named for (the
// lead at 100, the rest of its list 40-90); every other stat drops to the rest weight (positions.ts
// presetWeights: 25 on a small tab like HC, down to 10 on the player tabs, so what it names leads). A rate
// comes with its count (steal rate with steals) so a few good games off the bench don't top a list.
// Fantasy ranks purely on its nine categories. The order on every tab: Total Impact, the archetypes
// (offense, then defense), Winning, then Fantasy.
export interface SkillPresetDef {
  key: string;
  label: string;
  description: string;
  weights: SkillWeights;
}

// On every player tab
const IMPACT: SkillPresetDef = {
  key: 'impact',
  label: 'Total Impact',
  description: 'The all-in-one numbers: Win Shares, VORP, Box Plus/Minus, WS/48 and On-Off',
  weights: { ws: 100, vorp: 100, bpm: 100, ws48: 70, onOff: 60 },
};
const SCORER: SkillPresetDef = {
  key: 'scorer',
  label: 'Scorer',
  description: 'Buckets: points, usage and True Shooting',
  weights: { points: 100, usgPct: 80, tsPct: 80 },
};
const PLAYMAKING: SkillWeights = { assists: 100, astPct: 100, tovPct: 60 };
const SHOOTER: SkillPresetDef = {
  key: 'shooter',
  label: 'Shooter',
  description: 'Range: 3s made, 3-point and free throw accuracy and True Shooting',
  weights: { threes: 100, fg3Pct: 100, ftPct: 70, tsPct: 70 },
};
const THREE_AND_D: SkillPresetDef = {
  key: 'threeAndD',
  label: '3 & D',
  description: 'Knock down 3s and guard: 3-point shooting, Defensive Box Plus/Minus, steals and blocks',
  weights: { fg3Pct: 90, threes: 90, dbpm: 90, stlPct: 70, blkPct: 40 },
};
const POINT_FORWARD: SkillPresetDef = {
  key: 'pointForward',
  label: 'Point Forward',
  description: 'Playmaking from the forward spot: assists and assist rate, then rebounding',
  weights: { assists: 100, astPct: 100, rebounds: 70, trbPct: 50 },
};
const STRETCH_FOUR: SkillPresetDef = {
  key: 'stretch',
  label: 'Stretch Four',
  description: 'A big who spaces the floor: 3s made, 3-point accuracy, True Shooting and rebounding',
  weights: { threes: 100, fg3Pct: 100, tsPct: 60, rebounds: 60, trbPct: 60 },
};
const GLASS: SkillPresetDef = {
  key: 'glass',
  label: 'Glass Cleaner',
  description: 'Rebounds: total rebounds and rebound rate',
  weights: { rebounds: 100, trbPct: 100 },
};
const RIM_PROTECTOR: SkillPresetDef = {
  key: 'rimProtector',
  label: 'Rim Protector',
  description: 'Protecting the paint: blocks, block rate and Defensive Box Plus/Minus',
  weights: { blocks: 100, blkPct: 100, dbpm: 100 },
};
const DEFENDER: SkillPresetDef = {
  key: 'defender',
  label: 'Defender',
  description: 'Stops: Defensive Box Plus/Minus, steals and blocks',
  weights: { dbpm: 100, stlPct: 80, steals: 80, blkPct: 70, blocks: 70 },
};
// (Win Shares, a season's count, behind the two rates: alone, a few games on a winning team would top it)
const WINNER: SkillPresetDef = {
  key: 'winner',
  label: 'Winning',
  description: 'His team winning with him: the record and On-Off, then Win Shares',
  weights: { winPct: 100, onOff: 80, ws: 40 },
};
// (positions.ts presetWeights puts every other stat at 0 for it, as the NFL's Fantasy does)
const FANTASY_9CAT: SkillPresetDef = {
  key: 'fantasy',
  label: 'Fantasy',
  description: 'Fantasy (9-cat): points, rebounds, assists, steals, blocks, 3s, FG %, FT % and turnovers',
  weights: { points: 100, rebounds: 100, assists: 100, steals: 100, blocks: 100, threes: 100, fgPct: 100, ftPct: 100, turnovers: 100 },
};

// Guards run the offense; wings shoot and defend; bigs rebound, protect the rim and finish. The Top 50
// (every position together) has the ones every tab shares.
export const SKILL_PRESETS: Record<SkillPosition, SkillPresetDef[]> = {
  TM: [
    {
      key: 'contender',
      label: 'Contender',
      description: 'The best teams: net rating, the record and playoff wins',
      weights: { netRtg: 100, winPct: 90, playoffWins: 70 },
    },
    {
      key: 'roster',
      label: 'Best Roster',
      description: 'The players, by your own rankings at every spot',
      weights: { backcourt: 100, wings: 100, frontcourt: 100 },
    },
    {
      key: 'offense',
      label: 'Offense',
      description: 'The offense: its league rank by offensive rating',
      weights: { offRank: 100 },
    },
    {
      key: 'defense',
      label: 'Defense',
      description: 'The defense: its league rank by defensive rating',
      weights: { defRank: 100 },
    },
  ],
  // (every position together: the presets every tab shares)
  TOP: [IMPACT, SCORER, DEFENDER, WINNER, FANTASY_9CAT],
  PG: [
    IMPACT,
    SCORER,
    {
      key: 'floorGeneral',
      label: 'Floor General',
      description: 'Running the offense: assists, assist rate and few turnovers per play',
      weights: PLAYMAKING,
    },
    SHOOTER,
    DEFENDER,
    WINNER,
    FANTASY_9CAT,
  ],
  SG: [IMPACT, SCORER, SHOOTER, THREE_AND_D, DEFENDER, WINNER, FANTASY_9CAT],
  SF: [IMPACT, SCORER, POINT_FORWARD, THREE_AND_D, DEFENDER, WINNER, FANTASY_9CAT],
  PF: [IMPACT, SCORER, POINT_FORWARD, STRETCH_FOUR, GLASS, DEFENDER, WINNER, FANTASY_9CAT],
  C: [
    IMPACT,
    SCORER,
    {
      key: 'playmaker',
      label: 'Playmaking Big',
      description: 'The offense runs through him: assists, assist rate and few turnovers per play',
      weights: PLAYMAKING,
    },
    GLASS,
    RIM_PROTECTOR,
    WINNER,
    FANTASY_9CAT,
  ],
  HC: [
    {
      key: 'coachingJob',
      label: 'Coaching Job',
      description: 'Getting more from a roster than its talent: the Coaching Lift, then close games',
      weights: { lift: 100, pythDiff: 50 },
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
  ],
};
