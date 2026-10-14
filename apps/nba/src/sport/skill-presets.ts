import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every tab, each built around a kind of player and nothing else. A preset sets the stats it's
// named for (the lead at 100, the rest of its theme 50-90; a closely linked stat now and then at a token 10)
// and every other stat drops to 0 (positions.ts presetWeights), the support grades too: a Defender is only
// defense, a Scorer only scoring. So each list names its whole theme. A rate comes with its count (steal
// rate with steals) so a few good games off the bench don't top a list. The order on every tab: Total
// Impact, the archetypes (offense, then rebounding, then defense), Winning, then Fantasy.
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
  description: 'The all-in-one numbers: Win Shares, VORP, Box Plus/Minus, WS/48, PER and On-Off',
  weights: { ws: 100, vorp: 100, bpm: 100, ws48: 70, per: 60, onOff: 60 },
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
// (3s and their accuracy at the top, then every defensive stat, a count with each rate)
const THREE_AND_D: SkillPresetDef = {
  key: 'threeAndD',
  label: '3 & D',
  description: 'Knock down 3s and guard: 3s made, 3-point accuracy, Defensive Box Plus/Minus, steals and blocks',
  weights: { threes: 100, fg3Pct: 100, dbpm: 90, stlPct: 60, steals: 60, blkPct: 50, blocks: 50 },
};
const POINT_FORWARD: SkillPresetDef = {
  key: 'pointForward',
  label: 'Point Forward',
  description: 'Playmaking from the forward spot: assists, assist rate and ball security, then rebounding',
  weights: { assists: 100, astPct: 100, tovPct: 50, rebounds: 70, trbPct: 50 },
};
const STRETCH_FOUR: SkillPresetDef = {
  key: 'stretch',
  label: 'Stretch Four',
  description: 'A big who spaces the floor: 3s made, 3-point accuracy, True Shooting and rebounding',
  weights: { threes: 100, fg3Pct: 100, tsPct: 60, rebounds: 60, trbPct: 60 },
};
// (the data has total rebounds only, no offensive/defensive split)
const REBOUNDER: SkillPresetDef = {
  key: 'rebounder',
  label: 'Rebounder',
  description: 'Rebounds: total rebounds and rebound rate',
  weights: { rebounds: 100, trbPct: 100 },
};
// (blocks, the count, ahead of the rates: a few minutes' block rate would top it; rebounds at a token 10,
// finishing the stop)
const RIM_PROTECTOR: SkillPresetDef = {
  key: 'rimProtector',
  label: 'Rim Protector',
  description: 'Protecting the paint: blocks, block rate and Defensive Box Plus/Minus, a little rebounding',
  weights: { blocks: 100, blkPct: 70, dbpm: 70, rebounds: 10 },
};
// (the counts lead, the rates behind: a few games' Defensive Box Plus/Minus or steal rate would top it)
const DEFENDER: SkillPresetDef = {
  key: 'defender',
  label: 'Defender',
  description: 'Stops: steals and blocks, their rates and Defensive Box Plus/Minus',
  weights: { steals: 100, blocks: 100, dbpm: 90, stlPct: 50, blkPct: 50 },
};
// (his team's record leads by far; Win Shares, a season's count, and On-Off only order the players on
// the same record, the regulars ahead of a few games off the bench)
const WINNER: SkillPresetDef = {
  key: 'winner',
  label: 'Winning',
  description: 'His team winning: the record first, then Win Shares and On-Off',
  weights: { winPct: 100, ws: 30, onOff: 10 },
};
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
    // (the Coaching Lift only at a token 10 on these two: it's the net rating at both ends, not one)
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
  TOP: [IMPACT, SCORER, REBOUNDER, DEFENDER, WINNER, FANTASY_9CAT],
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
    REBOUNDER,
    DEFENDER,
    WINNER,
    FANTASY_9CAT,
  ],
  SG: [IMPACT, SCORER, SHOOTER, REBOUNDER, THREE_AND_D, DEFENDER, WINNER, FANTASY_9CAT],
  SF: [IMPACT, SCORER, POINT_FORWARD, REBOUNDER, THREE_AND_D, DEFENDER, WINNER, FANTASY_9CAT],
  PF: [IMPACT, SCORER, POINT_FORWARD, STRETCH_FOUR, REBOUNDER, DEFENDER, WINNER, FANTASY_9CAT],
  C: [
    IMPACT,
    SCORER,
    {
      key: 'playmaker',
      label: 'Playmaking Big',
      description: 'The offense runs through him: assists, assist rate and few turnovers per play',
      weights: PLAYMAKING,
    },
    REBOUNDER,
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
      description: "Scheme on offense: the offense's rank, a little of the Coaching Lift",
      weights: { offRank: 100, lift: 10 },
    },
    {
      key: 'defense',
      label: 'Defensive Mind',
      description: "Scheme on defense: the defense's rank, a little of the Coaching Lift",
      weights: { defRank: 100, lift: 10 },
    },
    // (his record leads; playoff wins, the season after it, mostly order coaches with close records)
    {
      key: 'winner',
      label: 'Winning',
      description: 'Results: the record first, then playoff wins',
      weights: { winPct: 100, playoffWins: 20 },
    },
  ],
};
