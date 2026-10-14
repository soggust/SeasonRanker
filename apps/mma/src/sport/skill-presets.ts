import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every division, each built around a kind of fighter. A preset sets the stats it's named
// for (the lead at 100, the rest of its list 40-90); every other stat drops to 10 (positions.ts
// presetWeights). The style presets also set the results stats low (FLOOR): behind their boosts (the
// rating 12x and Org Rank 6x in the current lists, career points 6x all-time) even 10 would outweigh the
// style, yet the results still sort fighters of the same style. Resume is the results alone.
export interface SkillPresetDef {
  key: string;
  label: string;
  description: string;
  weights: SkillWeights;
}

const FLOOR: SkillWeights = { rating: 10, officialRank: 10, winPct: 15, recent: 20, peakRating: 5, careerPoints: 5, titleWins: 5, titleDefenses: 5 };

const PRESETS: SkillPresetDef[] = [
  {
    key: 'resume',
    label: 'Resume',
    description: "Who he's beaten and what he's won: Rating, Best Win, Opp Rating and Org Rank, all-time Career Pts and Title Wins",
    weights: {
      careerPoints: 100, titleWins: 100, qualityWins: 100, bestWin: 100, titleDefenses: 90, rating: 90,
      peakRating: 80, oppRating: 80, officialRank: 70, peakRank: 60, winPct: 60,
    },
  },
  {
    key: 'striker',
    label: 'Striker',
    description: 'Winning on the feet: Strike Diff, Strikes / Min, Strike Acc and Strike Def',
    weights: { ...FLOOR, strDiff: 100, slpm: 80, strAcc: 80, strDef: 60 },
  },
  {
    key: 'knockout',
    label: 'Knockout Artist',
    description: 'Power: KD / 15, Strikes / Min, Strike Acc and Finish %',
    weights: { ...FLOOR, kd15: 100, slpm: 60, strAcc: 60, finishRate: 40 },
  },
  {
    key: 'wrestler',
    label: 'Wrestler',
    description: 'Taking it down and keeping it there: TD / 15, TD Acc, Adv / 15 and TD Def',
    weights: { ...FLOOR, td15: 100, tdAcc: 80, adv15: 70, tdDef: 60 },
  },
  {
    key: 'grappler',
    label: 'Submission Artist',
    description: 'Hunting the finish on the mat: Sub Att / 15, Adv / 15, TD / 15 and Finish %',
    weights: { ...FLOOR, sub15: 100, adv15: 80, td15: 50, finishRate: 40 },
  },
  {
    key: 'durable',
    label: 'Hard to Finish',
    description: 'Defense and durability: Strike Def, KD Against, TD Def and Absorbed / Min',
    weights: { ...FLOOR, strDef: 100, kdAgainst: 100, tdDef: 90, sapm: 80 },
  },
];

// (the same presets in every division; written out rather than read from positions.ts, which loads this
// file: the type makes sure every division is here)
export const SKILL_PRESETS: Record<SkillPosition, SkillPresetDef[]> = {
  P4P: PRESETS,
  WP4P: PRESETS,
  HW: PRESETS,
  LHW: PRESETS,
  MW: PRESETS,
  WW: PRESETS,
  LW: PRESETS,
  FW: PRESETS,
  BW: PRESETS,
  FLW: PRESETS,
  WBW: PRESETS,
  WFLW: PRESETS,
  WSW: PRESETS,
};
