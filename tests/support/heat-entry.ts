// The Heat Maps' plain parts (no Angular), bundled for heat-maps.test.mjs with the NFL's tsconfig: the colors,
// the surfaces, the NFL's file reader and maps, and the AI preview's ways headings
export { anyFaded, cellTone, edgeTone, divergingFill, fadeFill, heatPaint, isThin, pickCell, pickPair, leanFill, sequentialFill, HEAT_ALPHA_MAX, HEAT_NEUTRAL } from '@ranker/engine/heat-map/heat-color';
export { heatSurface } from '@ranker/engine/heat-map/surfaces';
export { tintStrength, tintFrom } from '@ranker/core/value-tint';
export { addEntries, expandHeat, heatPart, heatMatchups, nflHeatMaps, ZONE_IDS } from '@sport/heat-maps';
export { waysTitle } from '@ranker/engine/player-card/analysis';
export { RZ_SPOT_IDS } from '@ranker/engine/heat-map/surfaces/red-zone';
export { heatFile } from '@sport/heat-maps';
