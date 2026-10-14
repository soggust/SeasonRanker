import type { SkillPosition, SkillWeights } from '@sport/positions';

// Presets for every tab, each built around a kind of player and only that: a preset sets the stats it's
// named for (the lead at 100, the rest of its list 40-90, a stat that's only slightly part of the theme at
// a token 10) and every other stat, the support grades too, goes to 0 (positions.ts presetWeights), so a
// Glove list is fielding alone and a Slugger list power alone. Each list names every stat of its theme the
// tab has. The order on every tab: Total Impact, Analytics (the pitchers' Stuff), the archetypes, then Old
// School.
export interface SkillPresetDef {
  key: string;
  label: string;
  description: string;
  weights: SkillWeights;
}

// Hitters: the same presets on every position tab (a catcher's or shortstop's defense counts in the
// all-around and glove presets)
const HITTER_PRESETS: SkillPresetDef[] = [
  {
    key: 'war',
    label: 'Total Impact',
    description: 'The all-in-one number: WAR, with the hitting, fielding and baserunning runs behind it',
    weights: { war: 100, wrcPlus: 60, defRuns: 50, bsr: 50 },
  },
  {
    key: 'saber',
    label: 'Analytics',
    description: 'Hitting quality, not totals: wRC+, xwOBA, barrels, hard contact, walks and few strikeouts',
    weights: { wrcPlus: 100, xwoba: 90, barrelPct: 60, hardHitPct: 60, bbPct: 60, kPct: 60 },
  },
  {
    key: 'slugger',
    label: 'Slugger',
    description: 'Power: home runs, slugging, barrels and hard contact, then RBI',
    weights: { homeRuns: 100, slg: 100, barrelPct: 80, hardHitPct: 70, rbi: 40 },
  },
  {
    key: 'onBase',
    label: 'On-Base Machine',
    description: 'Getting on: OBP, walks, average and few strikeouts, then the runs it scores',
    weights: { obp: 100, bbPct: 80, avg: 70, kPct: 60, runs: 50 },
  },
  {
    key: 'speed',
    label: 'Speed',
    description: 'Legs: sprint speed, stolen bases and baserunning (runs scored a touch)',
    weights: { sprintSpeed: 100, stolenBases: 90, bsr: 90, runs: 10 },
  },
  {
    key: 'glove',
    label: 'Glove',
    description: 'Defense: fielding runs and OAA, then range and fielding %',
    weights: { defRuns: 100, oaa: 90, rangeFactor: 40, fieldingPct: 40 },
  },
  {
    key: 'classic',
    label: 'Old School',
    description: 'The back of the baseball card (fantasy 5x5): AVG, HR, RBI, runs and steals',
    weights: { avg: 100, homeRuns: 100, rbi: 100, runs: 80, stolenBases: 80 },
  },
];

// A hitter tab's list with one preset swapped for its copy (keyed alike) and some left out
function hittersWith(copies: SkillPresetDef[], without: string[] = []): SkillPresetDef[] {
  return HITTER_PRESETS.filter((p) => !without.includes(p.key)).map((p) => copies.find((c) => c.key === p.key) ?? p);
}

// The two pitching lenses the starters and relievers share, in the same words
const PITCHER_IMPACT: SkillWeights = { war: 100, ip: 60, fip: 60, era: 60 };
const PITCHER_IMPACT_TEXT = 'The all-in-one number: WAR, with the innings and run prevention behind it';
// (Stuff counts the strikeout total with the rates, so a full season of dominance counts for more than a
// few dominant starts or outings)
const STUFF_TEXT = 'What the pitches do: whiffs, strikeouts (the rate and the total) and weak contact (2015 on)';

export const SKILL_PRESETS: Record<SkillPosition, SkillPresetDef[]> = {
  TM: [
    {
      key: 'contender',
      label: 'Contender',
      description: 'The winners: the record, then a little run differential and playoff wins',
      weights: { winPct: 100, runDiff: 30, playoffWins: 30 },
    },
    {
      key: 'roster',
      label: 'Best Roster',
      description: 'The players, by your own rankings at every spot',
      weights: { hitters: 100, rotation: 100, bullpen: 100 },
    },
    {
      key: 'offense',
      label: 'Offense',
      description: 'The offense: runs per game rank and team OPS, then its hitters',
      weights: { offRank: 100, ops: 90, hitters: 60 },
    },
    {
      key: 'prevention',
      label: 'Run Prevention',
      description: 'Run prevention: runs allowed rank and team ERA, then fielding and the staff',
      weights: { defRank: 100, era: 90, fieldingRuns: 60, rotation: 50, bullpen: 50 },
    },
  ],
  // (every position player together: the hitters' presets, less the FLD % and RF/9 the tab leaves out)
  TOP: HITTER_PRESETS.map((p) => ({
    ...p,
    description: p.key === 'glove' ? 'Defense: fielding runs and OAA' : p.description,
    weights: Object.fromEntries(Object.entries(p.weights).filter(([key]) => !['fieldingPct', 'rangeFactor'].includes(key))) as SkillWeights,
  })),
  // (no sprint-speed archetype behind the plate; no OAA for catchers, and RF/9 there is the pitchers' strikeouts)
  C: hittersWith(
    [{ key: 'glove', label: 'Glove', description: 'Defense: fielding runs, then fielding % (no OAA for catchers)', weights: { defRuns: 100, fieldingPct: 40, rangeFactor: 0 } }],
    ['speed'],
  ),
  '1B': HITTER_PRESETS,
  '2B': HITTER_PRESETS,
  '3B': HITTER_PRESETS,
  SS: HITTER_PRESETS,
  OF: HITTER_PRESETS,
  // (no glove to measure: Total Impact without the fielding runs)
  DH: hittersWith(
    [
      {
        key: 'war',
        label: 'Total Impact',
        description: 'The all-in-one number: WAR, with the hitting and baserunning runs behind it',
        weights: { war: 100, wrcPlus: 60, bsr: 50 },
      },
    ],
    ['speed', 'glove'],
  ),
  SP: [
    {
      key: 'ace',
      label: 'Total Impact',
      description: PITCHER_IMPACT_TEXT,
      weights: PITCHER_IMPACT,
    },
    {
      key: 'stuff',
      label: 'Stuff',
      description: STUFF_TEXT,
      weights: { whiffPct: 100, kPct: 90, xera: 70, hardHitAllowed: 70, barrelAllowed: 70, strikeOuts: 60 },
    },
    {
      key: 'workhorse',
      label: 'Workhorse',
      description: 'Carrying the load: innings and strikeouts, then WAR',
      weights: { ip: 100, strikeOuts: 70, war: 50 },
    },
    {
      key: 'runPrevention',
      label: 'Run Prevention',
      description: 'The results: ERA, WHIP and keeping it in the park, over the innings',
      weights: { era: 100, whip: 90, hr9: 60, ip: 50 },
    },
    {
      key: 'classic',
      label: 'Old School',
      description: 'The back of the baseball card: the record, ERA, strikeouts and innings',
      weights: { winPct: 100, era: 100, strikeOuts: 90, ip: 80 },
    },
  ],
  RP: [
    {
      key: 'value',
      label: 'Total Impact',
      description: PITCHER_IMPACT_TEXT,
      weights: PITCHER_IMPACT,
    },
    {
      key: 'stuff',
      label: 'Stuff',
      description: STUFF_TEXT,
      weights: { whiffPct: 100, kPct: 90, xwobaAllowed: 70, hardHitAllowed: 70, strikeOuts: 50 },
    },
    {
      key: 'closer',
      label: 'Closer',
      description: 'The ninth inning: saves, ERA, missing bats and WHIP',
      weights: { saves: 100, era: 80, kPct: 70, whip: 60 },
    },
    {
      key: 'setup',
      label: 'Setup Man',
      description: 'The bridge: holds, ERA, missing bats and WHIP',
      weights: { holds: 100, era: 80, kPct: 70, whip: 60 },
    },
  ],
};
