import type { SportSettings, StatBasis, StatDef, StatGroup, StatGroupId } from '@ranker/engine/sport';
import { type GroupDef, groupOfKey, resolveGroups } from '@ranker/engine/stat-groups';
import { SKILL_PRESETS } from '@sport/skill-presets';

export type { StatBasis, StatGroupId } from '@ranker/engine/sport';

// The MMA tabs: pound-for-pound (every man, his whole career), the eight men's divisions, heaviest
// first, and the women's pound-for-pound and three divisions (shown with the Women's Divisions setting
// on). A fighter is in the division ESPN lists him in (his last fight's otherwise) and any other he's
// had 3+ fights in, on his fights there.
export type Position = 'P4P' | 'HW' | 'LHW' | 'MW' | 'WW' | 'LW' | 'FW' | 'BW' | 'FLW' | 'WP4P' | 'WBW' | 'WFLW' | 'WSW';
// Every tab uses the same config-driven table, sidebar and scoring below
export type SkillPosition = Position;

export const POSITIONS: Position[] = ['P4P', 'HW', 'LHW', 'MW', 'WW', 'LW', 'FW', 'BW', 'FLW', 'WP4P', 'WBW', 'WFLW', 'WSW'];
export const WOMENS_DIVISIONS: Position[] = ['WP4P', 'WBW', 'WFLW', 'WSW'];

// The footer dropdown's choice (the 'era' setting): today's roster or every era, men's or women's
// ("current", "currentW", "alltime", "alltimeW")
export const allTime = (settings: SportSettings) => String(settings['era']).startsWith('alltime');
export const womens = (settings: SportSettings) => String(settings['era']).endsWith('W');

// Keys of the stats object in skill-players.json (scripts/update-data.mjs): his career
export type SkillStatKey =
  // Record (wins-losses-draws, draws including no contests), and how his fights end
  | 'wins'
  | 'losses'
  | 'ties'
  | 'winPct'
  | 'streak'
  | 'finishRate'
  | 'koShare'
  | 'finishes'
  | 'finished'
  | 'fightTime'
  // Striking (significant strikes; per minute of fight time) and knockdowns (per 15 minutes)
  | 'slpm'
  | 'sapm'
  | 'strAcc'
  | 'strDef'
  | 'strDiff'
  | 'kd15'
  | 'kdAgainst'
  // Grappling (per 15 minutes)
  | 'td15'
  | 'tdAcc'
  | 'tdDef'
  | 'sub15'
  | 'adv15'
  // Competition: the MMA rating over every pro fight (now, and his best), the career points it gives
  // him (the all-time measure), his best win and his quality wins (by the opponent's rating going in),
  // and wins in five-round fights (title fights and main events)
  | 'rating'
  | 'peakRating'
  | 'careerPoints'
  | 'bestWin'
  | 'qualityWins'
  | 'mainEventWins'
  // Title fights: wins (taking a belt, interim ones too, and each defense) and successful defenses
  | 'titleWins'
  | 'titleDefenses'
  // Context
  | 'oppRating'
  | 'officialRank'
  | 'peakRank'
  | 'age'
  | 'reach';

// Columns worked out in the app rather than read from the data
export type SkillColumnKey = SkillStatKey | 'games' | 'recent';

// How counting stats are shown: career totals, per fight, or over a 10-fight stretch. (Most UFC stats
// are rates already: per minute, per 15 minutes, percentages.)
export const STAT_BASIS_LABELS: Record<StatBasis, string> = {
  season: 'Career Totals',
  perGame: 'Per Fight',
  pace17: '10-Fight Pace',
};

export const PACE_GAMES: Record<Position, number> = { P4P: 10, WP4P: 10, HW: 10, LHW: 10, MW: 10, WW: 10, LW: 10, FW: 10, BW: 10, FLW: 10, WBW: 10, WFLW: 10, WSW: 10 };

export interface SkillPlayer {
  // ESPN's fighter id (headshots), and the same as text
  id: number | null;
  gsisId: string;
  name: string;
  // His country's flag (ESPN's), and his gym
  teamLogo: string;
  teamName?: string | null;
  country?: string | null;
  // His pro fights, all of them (the regional ones too), and the ones with striking and grappling stats
  // (the UFC's and PFL's)
  games: number;
  statFights?: number;
  // The division the row's belt is for (his own, or the one he holds, on pound-for-pound)
  division?: string;
  // No UFC fight in the last year (fighting elsewhere, or out of the UFC's rankings for the layoff: unranked,
  // a UFC fighter counts as #12 on Org Rank, one fighting elsewhere as average: sport.ts scoreValue)
  inactive?: boolean;
  // Pound-for-pound rows: what his rank counts as in the ranking, 0-16 (the P4P top 15, then his
  // division rank behind them; null: neither)
  rankScore?: number | null;
  // The champion of this tab's division (his UFC rank counts as #0)
  titleHolder?: boolean;
  stats: Record<SkillStatKey, number | null>;
  // His pro debut (in the promotions covered) came in the last year
  rookie?: boolean;
  // An active fighter's row in only one era's lists: his division now (current) where he fought most in
  // another (all-time)
  only?: 'current' | 'allTime';
  // The belt he holds now: 'UFC' or 'PFL'
  belt?: 'UFC' | 'PFL';
  // His title wins and defenses as they count (a Bellator or PFL title half, an interim one half again),
  // and the promotions he held a title in
  titleScore?: { wins: number; defenses: number };
  titles?: string[];
  // A UFC fighter's division rank in UFC.com's Meta Rankings (the Meta Rankings setting; null: unranked)
  metaRank?: number | null;
  // His promotion now (his last fight's), and whether he's ever fought in the UFC (UFC Fighters Only)
  promotion?: string | null;
  ufcCareer?: boolean;
  // No fight in a major promotion in two years (listed in the all-time lists only)
  retired?: boolean;
  // His last five results, newest first (1 win, 0.5 draw or no contest, 0 loss)
  lastFive?: number[];
  // His whole pro record ("27-1-0")
  pro?: string | null;
  // His fights, newest first: [date, opponent, result, how it ended, event]
  fights?: [string, string, 'W' | 'L' | 'D', string, string][];
  injured?: boolean;
  injuryStatus?: string;
  // Badges: champ (his division's champion), p4p1-p4p15 (pound-for-pound rank)
  awards?: string[];
}

// A fighter's stat (the engine passes the sport's settings; none change a value)
// (the rank column: UFC.com's Meta Rankings in place of the media panel's with that setting on)
export function unitStat(unit: SkillPlayer, key: SkillStatKey, settings?: SportSettings): number | null {
  if (key === 'officialRank' && settings?.['metaRanks'] && unit.metaRank !== undefined) return unit.metaRank;
  return unit.stats[key] ?? null;
}

export type SkillStat = StatDef<SkillColumnKey>;

// Stat names written out in full (label hover text)
export const STAT_NAMES: Partial<Record<SkillColumnKey, string>> = {
  games: 'Pro Fights',
  winPct: 'Record',
  recent: 'Last Five Fights',
  streak: 'Current Streak (wins +, losses -)',
  finishRate: 'Finish Rate (wins inside the distance)',
  koShare: 'KO/TKO Share (wins by knockout)',
  fightTime: 'Average Fight Time (minutes)',
  slpm: 'Significant Strikes Landed per Minute',
  sapm: 'Significant Strikes Absorbed per Minute',
  strAcc: 'Significant Strike Accuracy',
  strDef: 'Significant Strike Defense',
  strDiff: 'Striking Differential (landed minus absorbed per minute)',
  kd15: 'Knockdowns per 15 Minutes',
  kdAgainst: 'Knocked Down per 15 Minutes',
  td15: 'Takedowns per 15 Minutes',
  tdAcc: 'Takedown Accuracy',
  tdDef: 'Takedown Defense',
  sub15: 'Submission Attempts per 15 Minutes',
  adv15: 'Ground Advances per 15 Minutes',
  oppRating: "Strength of Schedule (his opponents' average rating going in)",
  rating: 'MMA Rating (now)',
  peakRating: 'Peak MMA Rating',
  careerPoints: 'Career Points (months ranked, by place and division depth)',
  bestWin: 'Best Win (the highest rated opponent he beat, going in)',
  qualityWins: 'Quality Wins (over opponents rated in the top tenth going in)',
  titleWins: 'Title Fight Wins (winning a belt, interim ones too, and each defense)',
  titleDefenses: 'Successful Title Defenses',
  officialRank: "His Promotion's Official Rank (UFC or PFL)",
  peakRank: 'Peak Division Rank (by the rating, any month of his career)',
  age: 'Age',
  reach: 'Reach (inches)',
};

export const PER_GAME_LABELS: Partial<Record<SkillColumnKey, string>> = {
  qualityWins: 'Quality Wins / Fight',
  titleWins: 'Title Wins / Fight',
  titleDefenses: 'Defenses / Fight',
};

export type SkillWeights = Partial<Record<SkillColumnKey, number>>;
export type SkillPreset = string;

// A career total's weight: as given all-time, none in the current lists (where form leads, and a long
// career's totals shouldn't outweigh who's better now)
// (and not shown there: shownWhen)
const careerTotal = (allTimeBoost: number) => (settings: SportSettings) => (allTime(settings) ? allTimeBoost : 0);

// The striking and grappling stats' weight: half behind their sliders, in the current lists as in the all-time
// ones. Twelve rates that read a style rather than results: at full strength the twelve together outweighed
// the results and pushed the current lists away from the sport's own rankings (the 2026-10-17 audit: the men's
// divisions' rank correlation with the UFC's top 15s 0.79 at full, 0.81 at half, Org Rank off). The sliders
// are still the user's weights: a stat at 100 counts twice what it does at 50.
const BOX_BOOST = 0.5;
const boxBoost = () => BOX_BOOST;

// Every division has the same columns; the presets (skill-presets.ts) weigh them
const MMA_STATS: SkillStat[] = [
  { key: 'winPct', label: 'Record', description: 'His whole pro record, wins-losses-draws, the regional fights before the big promotions too (ranked on win percentage; 3x behind its slider all-time)', kind: 'efficiency', format: 'record', boost: (settings) => (allTime(settings) ? 3 : 1) },
  { key: 'recent', label: 'Recent', description: 'His last five fights, newest first (ranked on a recency-weighted win rate); counts double behind its slider in the current lists, not at all in the all-time ones', kind: 'efficiency', format: 'recent', boost: (settings) => (allTime(settings) ? 0 : 2), shownWhen: (settings) => !allTime(settings) },
  { key: 'officialRank', label: 'Org Rank', description: "His promotion's official rank in his division, or pound-for-pound on those tabs: UFC.com's top 15 for a UFC fighter, the PFL's top 10 for a PFL one (counting five places below the UFC's, its field shallower: its champion as the UFC's #5, its #10 as #15). A champion is #0, above #1; an unranked fighter counts as #16, or #12 when he's had no UFC fight in a year (dropped from the rankings for the layoff, not beaten out of them: between the ranked and the rest); one fighting elsewhere (no rankings), or retired, as average. With UFC Fighters Only on, it's the UFC's rank. Counts 6x behind its slider among current fighters, 1x in the all-time lists", kind: 'efficiency', format: 'rank', noTies: true, negative: true, missingIsAverage: true, scale: [0, 16], settled: true, boost: (settings) => (allTime(settings) ? 1 : 6), shownWhen: (settings) => !allTime(settings) },
  { key: 'peakRank', label: 'Peak Rank', description: "The best he ranked in his division in any month of his career, by the rating across every promotion (the same monthly rankings career points come from): the top spot as the belt, the next as #1, and so on (#16: never that high). The all-time lists' rank, in the current ones' Org Rank place; counts 1x behind its slider", kind: 'efficiency', format: 'rank', noTies: true, negative: true, scale: [0, 16], settled: true, shownWhen: (settings) => allTime(settings) },
  // (the title ones count double and triple behind their sliders all-time, the rating 12x in the current lists and career points 6x all-time: the clearest marks of an elite career.
  // The career totals (titles, quality wins) don't count in the current lists, where form leads: careerTotal)
  { key: 'titleDefenses', label: 'Title Defenses', description: 'Successful title defenses, across every reign, in the UFC, PRIDE, Strikeforce, the WEC, Bellator and the PFL (from Wikipedia\'s lists of champions; a Bellator or PFL defense counts half); counts double behind its slider all-time, not at all in the current lists; scored in proportion, 0 to 10 (most fighters have none, so against the list one defense would score like ten)', kind: 'volume', format: 'int', boost: careerTotal(2), scale: [10, 0], shownWhen: (settings) => allTime(settings) },
  { key: 'titleWins', label: 'Title Wins', description: 'Title fight wins in the UFC, PRIDE, Strikeforce, the WEC, Bellator and the PFL: winning a belt and each defense (a Bellator or PFL title counts half, an interim one half again); counts double behind its slider all-time, not at all in the current lists; scored in proportion, 0 to 10', kind: 'volume', format: 'int', boost: careerTotal(3), scale: [10, 0], shownWhen: (settings) => allTime(settings) },
  // (the competition ones: results weighed by whom they came against. The rating leads the current
  // lists and career points the all-time ones: each counts many times over behind its slider there)
  { key: 'rating', label: 'Rating', description: "The MMA rating: every pro fight since 1997 across the promotions covered, each moving it by how surprising the result was (beating a highly rated opponent is worth far more than beating a low one; a finish counts fully, a split decision for less), shown cautiously (less its uncertainty, which grows while he's out). On pound-for-pound tabs, against his own division's best. Counts 12x behind its slider in the current lists, not at all in the all-time ones (a career is judged by its points and peak, not where it stands today); scored in proportion, 1600 to 2400, like Peak (against the list, a division's elite would all cap out alike and tie)", kind: 'efficiency', format: 'int', scale: [2400, 1600], settled: true, boost: (settings) => (allTime(settings) ? 0 : 12), shownWhen: (settings) => !allTime(settings) },
  { key: 'careerPoints', label: 'Career Pts', description: 'Points for every month he was ranked in his division by the rating (across every promotion): the most for #1, fewer down to #15, full points only when the division was deep; his whole career, in every division. Counts 6x behind its slider all-time, not at all in the current lists; scored in proportion, 0 to 12 (most fighters have next to none, so against the list every great career would score alike)', kind: 'volume', format: 'dec1', scale: [12, 0], boost: (settings) => (allTime(settings) ? 6 : 0), shownWhen: (settings) => allTime(settings) },
  { key: 'peakRating', label: 'Peak', description: 'His best MMA rating at any point (shown cautiously, after 3+ fights); counts 8x behind its slider all-time, where it leads (how good he was at his best); scored in proportion, 1600 to 2400 (against the list every great peak would score alike)', kind: 'efficiency', format: 'int', scale: [2400, 1600], settled: true, boost: (settings) => (allTime(settings) ? 8 : 1) },
  { key: 'bestWin', label: 'Best Win', description: 'The rating of the best opponent he beat, going into the fight', kind: 'efficiency', format: 'int', missingIsAverage: true, settled: true },
  { key: 'qualityWins', label: 'Quality Wins', description: 'Wins over opponents rated in the top tenth of every rated fighter going in; counts all-time, not in the current lists', kind: 'volume', format: 'int', boost: careerTotal(1), shownWhen: (settings) => allTime(settings) },
  { key: 'streak', label: 'Streak', description: 'His current run: +3 is three straight wins, -2 two straight losses (current form: not counted in the all-time lists)', kind: 'efficiency', format: 'int', boost: (settings) => (allTime(settings) ? 0 : 1), shownWhen: (settings) => !allTime(settings) },
  { key: 'finishRate', label: 'Finish %', description: 'Share of his wins that ended inside the distance (knockout or submission)', kind: 'efficiency', format: 'pct', missingIsAverage: true },
  { key: 'slpm', label: 'Strikes / Min', description: 'Significant strikes landed per minute', kind: 'efficiency', format: 'dec2', skipMissing: true, boost: boxBoost },
  { key: 'strAcc', label: 'Strike Acc', description: 'Significant strikes landed per attempt (50+ attempts)', kind: 'efficiency', format: 'pct', skipMissing: true, boost: boxBoost },
  { key: 'sapm', label: 'Absorbed / Min', description: 'Significant strikes absorbed per minute (lower is better)', kind: 'efficiency', format: 'dec2', negative: true, skipMissing: true, boost: boxBoost },
  { key: 'strDef', label: 'Strike Def', description: "Opponents' significant strikes he avoided (50+ thrown at him)", kind: 'efficiency', format: 'pct', skipMissing: true, boost: boxBoost },
  { key: 'kd15', label: 'KD / 15', description: 'Knockdowns per 15 minutes: power', kind: 'efficiency', format: 'dec2', skipMissing: true, boost: boxBoost },
  { key: 'td15', label: 'TD / 15', description: 'Takedowns landed per 15 minutes', kind: 'efficiency', format: 'dec2', skipMissing: true, boost: boxBoost },
  { key: 'tdAcc', label: 'TD Acc', description: 'Takedowns landed per attempt (5+ attempts)', kind: 'efficiency', format: 'pct', skipMissing: true, boost: boxBoost },
  { key: 'tdDef', label: 'TD Def', description: "Opponents' takedowns he stopped (5+ attempted on him)", kind: 'efficiency', format: 'pct', skipMissing: true, boost: boxBoost },
  { key: 'sub15', label: 'Sub Att / 15', description: 'Submission attempts per 15 minutes', kind: 'efficiency', format: 'dec2', skipMissing: true, boost: boxBoost },
  // (the differential leads the advanced ones: the striking battle in one number)
  { key: 'strDiff', label: 'Strike Diff', description: 'Significant strikes landed minus absorbed, per minute: who wins the striking', kind: 'efficiency', format: 'dec2', skipMissing: true, boost: boxBoost },
  { key: 'kdAgainst', label: 'KD Against', description: 'Times knocked down per 15 minutes: his chin (lower is better)', kind: 'efficiency', format: 'dec2', negative: true, skipMissing: true, boost: boxBoost },
  { key: 'adv15', label: 'Adv / 15', description: 'Ground position advances (to the back, mount, side or half guard) per 15 minutes: control on the mat', kind: 'efficiency', format: 'dec2', skipMissing: true, boost: boxBoost },
  { key: 'oppRating', label: 'Opp Rating', description: "His opponents' average rating going into their fights: who he's beaten and lost to", kind: 'efficiency', format: 'int', missingIsAverage: true, settled: true },
  { key: 'koShare', label: 'KO %', description: 'Share of his wins by KO or TKO (Finish % counts submissions too; for context, not part of the ranking: Knockout Power reads it)', kind: 'efficiency', format: 'pct', infoOnly: true },
  { key: 'fightTime', label: 'Avg Time', description: 'Average fight time, in minutes (for context; not part of the ranking)', kind: 'efficiency', format: 'dec1', infoOnly: true },
  { key: 'age', label: 'Age', description: 'Age (for context; not part of the ranking)', kind: 'efficiency', format: 'int', infoOnly: true },
  { key: 'reach', label: 'Reach', description: 'Reach, in inches (for context; not part of the ranking)', kind: 'efficiency', format: 'int', infoOnly: true },
];

// (the pound-for-pound tabs without Peak Rank: a rank in one division says little across them)
export const SKILL_STATS: Record<SkillPosition, SkillStat[]> = Object.fromEntries(
  POSITIONS.map((p) => [p, p === 'P4P' || p === 'WP4P' ? MMA_STATS.filter((stat) => stat.key !== 'peakRank') : MMA_STATS]),
) as Record<
  SkillPosition,
  SkillStat[]
>;

// Default: everything at 50. A preset (skill-presets.ts) sets the stats it's named for and puts every
// other stat at 0: a preset is only its theme (a style preset ranks on the style alone, no rating or rank
// behind it). MMA has no support stats: every slider is a ranking stat.
export function presetWeights(position: SkillPosition, preset: SkillPreset): SkillWeights {
  const def = SKILL_PRESETS[position].find((p) => p.key === preset);
  const weights: SkillWeights = {};
  for (const stat of SKILL_STATS[position]) {
    if (stat.infoOnly) continue;
    weights[stat.key] = def ? 0 : 50;
  }
  return { ...weights, ...(def?.weights ?? {}) };
}

// ---------------------------------------------------------------------------
// Stat groups (categories): every division's, in the grid's order, each group its stats in column order
// (stat-groups.ts resolves them; a key a tab lacks, the pound-for-pound tabs' Peak Rank, is skipped). Only
// a look: where a column sits, the strip's name, icon and color, and what the sidebar's eye on the group
// switches off together. The ranking reads the sliders alone.
// ---------------------------------------------------------------------------
type Group = GroupDef<SkillColumnKey>;
const group = (id: string, title: string, icon: string, tone: number, keys: SkillColumnKey[], box = false): Group => (box ? { id, title, icon, tone, keys, box } : { id, title, icon, tone, keys });

const DIVISION_GROUPS: Group[] = [
  group('results', 'Results', 'emoji_events', 0, ['winPct', 'recent', 'officialRank', 'peakRank', 'titleDefenses', 'titleWins', 'rating', 'careerPoints', 'peakRating', 'bestWin', 'qualityWins', 'streak', 'finishRate']),
  group('box', 'Striking', 'sports_mma', 1, ['slpm', 'strAcc', 'sapm', 'strDef', 'kd15', 'strDiff', 'kdAgainst']),
  group('advanced', 'Grappling', 'sports_kabaddi', 2, ['td15', 'tdAcc', 'tdDef', 'sub15', 'adv15']),
  // (the context stats share the dark box the other sports' support grades use)
  group('support', 'Context', 'insights', 3, ['oppRating', 'koShare', 'fightTime', 'age', 'reach'], true),
];

export const GROUPS: Record<SkillPosition, Group[]> = Object.fromEntries(POSITIONS.map((p) => [p, DIVISION_GROUPS])) as Record<SkillPosition, Group[]>;

// The groups a tab retired, each its stats of the day it went (legacy-groups.ts: a link, preset or pin that
// hid one hides those stats one by one, so it ranks as its author saw it)
export const LEGACY_GROUPS: Partial<Record<SkillPosition, Record<string, SkillColumnKey[]>>> = {};

export function statGroup(stat: SkillStat, position: SkillPosition): StatGroupId {
  return groupOfKey(GROUPS[position], stat.key) ?? GROUPS[position][0].id;
}

// The card's headline stats (no Seasons tab for MMA: kept for the engine), pinned
const HEADLINE: SkillColumnKey[] = ['slpm', 'strAcc', 'sapm'];

export function headlineStats(position: SkillPosition): SkillStat[] {
  const stats = SKILL_STATS[position];
  return HEADLINE.map((key) => stats.find((stat) => stat.key === key)).filter((stat): stat is SkillStat => !!stat);
}

export type SkillStatGroup = StatGroup<SkillStat>;

// A division's groups with their stats
export function skillGroups(position: SkillPosition): SkillStatGroup[] {
  return resolveGroups(GROUPS[position], SKILL_STATS[position]);
}
