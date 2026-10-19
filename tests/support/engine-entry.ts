// The engine and one sport's modules, bundled for the tests by engine.mjs (esbuild through the app's
// tsconfig, the way libs/ranker/scripts/build-comps.mjs bundles them). prefill fills DATA from
// globalThis.__DATA first, since unit-scoring builds the rows as soon as it loads.
import '../../libs/ranker/scripts/comps/prefill';

export { DATA, CURRENT_SEASON, SEASONS, withSeason } from '@ranker/engine/data';
export {
  SKILL_UNITS,
  rebuildUnits,
  unitsForSeason,
  weightedTotals,
  byTotals,
  combinedWeights,
  combinedStats,
  defaultRanking,
  emptyIn,
  statValue,
  DEFAULT_SPORT_SETTINGS,
} from '@ranker/engine/unit-scoring';
export { TabRanker } from '@ranker/engine/skill-rankings/tab-ranker';
export { gridRankings } from '@ranker/engine/skill-rankings/grid-rankings';
export { POOLED, adjustFor, homeTab, isPooled, withPooled } from '@ranker/engine/pooled-tabs';
export { SKILL_PRESETS } from '@sport/skill-presets';
export { StatReader } from '@ranker/engine/stat-reader';
export { DEFAULT_SETTINGS, PositionService } from '@ranker/engine/position.service';
export { defaultMin, hasMin, minCount, seasonLength } from '@ranker/engine/playing-time';
export { shareLink, applySharedLink, compareCode, readCompareCode } from '@ranker/engine/share';
export { CARD_PARAM, cardLink, cardTabOf, findLinkedCard, gameLink, gameTabOf, readCardAsk, readGameAsk } from '@ranker/engine/card-link';
export { SPORT } from '@sport/sport';
export { GROUPS, LEGACY_GROUPS, POSITIONS, SKILL_STATS, headlineStats, presetWeights, skillGroups, statGroup } from '@sport/positions';
export { applyHiddenGroup, isGroupId, legacyGroupKeys } from '@ranker/engine/legacy-groups';
