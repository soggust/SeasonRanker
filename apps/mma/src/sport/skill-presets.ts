import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every division, each built around a kind of fighter. A preset is only its theme: it sets
// the stats it's named for (the lead at 100, the rest of its list 40-90) and every other stat drops to 0
// (positions.ts presetWeights). So the style presets rank on the style alone (no rating, rank or record
// behind them), Resume on the results alone, and each list names every stat of its theme.
export interface SkillPresetDef {
  key: string;
  label: string;
  description: string;
  weights: SkillWeights;
}

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
    description: 'Winning on the feet: Strike Diff, Strikes / Min, Strike Acc, Strike Def, Absorbed / Min, KD / 15 and KD Against',
    weights: { strDiff: 100, slpm: 80, strAcc: 80, strDef: 70, sapm: 60, kd15: 60, kdAgainst: 50 },
  },
  {
    key: 'knockout',
    label: 'Knockout Artist',
    description: 'Power: KD / 15, Strikes / Min and Strike Acc (Finish %, submissions in it, a token 10)',
    weights: { kd15: 100, slpm: 60, strAcc: 60, finishRate: 10 },
  },
  {
    key: 'wrestler',
    label: 'Wrestler',
    description: 'Taking it down and keeping it there: TD / 15, TD Acc, Adv / 15 and TD Def',
    weights: { td15: 100, tdAcc: 80, adv15: 70, tdDef: 60 },
  },
  {
    key: 'grappler',
    label: 'Submission Artist',
    description: 'Hunting the finish on the mat: Sub Att / 15 and Adv / 15 (TD / 15 and Finish %, a token 10 each)',
    weights: { sub15: 100, adv15: 80, td15: 10, finishRate: 10 },
  },
  {
    key: 'durable',
    label: 'Hard to Finish',
    description: 'Defense and durability: Strike Def, KD Against, TD Def and Absorbed / Min',
    weights: { strDef: 100, kdAgainst: 100, tdDef: 90, sapm: 80 },
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
