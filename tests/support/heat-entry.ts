// The Heat Maps' plain parts (no Angular), bundled for heat-maps.test.mjs with the NFL's tsconfig: the colors,
// the surfaces, the NFL's file reader and maps, and the AI preview's ways headings
export { cellTone, edgeTone, divergingFill, heatPaint, isThin, leanFill, sequentialFill, HEAT_ALPHA_MAX, HEAT_NEUTRAL } from '@ranker/engine/heat-map/heat-color';
export { heatSurface } from '@ranker/engine/heat-map/surfaces';
export { tintStrength, tintFrom } from '@ranker/core/value-tint';
export { addEntries, expandHeat, heatPart, heatMatchups, nflHeatMaps, redZoneSection, ZONE_IDS } from '@sport/heat-maps';
export { waysTitle } from '@ranker/engine/player-card/analysis';
