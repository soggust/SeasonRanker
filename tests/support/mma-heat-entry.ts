// MMA's Heat Maps' plain parts (no Angular), bundled for mma-heat-maps.test.mjs with the MMA's tsconfig: the
// round-clock and body surfaces, the file readers and maps, and the colors
export { heatSurface } from '@ranker/engine/heat-map/surfaces';
export { roundClockIds } from '@ranker/engine/heat-map/surfaces/round-clock';
export { BODY_IDS, BODY_3_IDS } from '@ranker/engine/heat-map/surfaces/body';
export { cellTone, heatPaint } from '@ranker/engine/heat-map/heat-color';
export { binomialSd, codesOf, divisionOf, finishCells, mmaHeatMaps, sumOf, tallyFinishes, DIVISIONS } from '@sport/heat-maps';
