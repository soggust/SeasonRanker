// Bundled by dossier.mjs (esbuild, through the sport's tsconfig) so a team's fact sheet reads the rows,
// stat labels, default ranks and roster grades exactly as the site shows them at its default sliders.
// comps/prefill.ts runs first and fills DATA from globalThis.__DATA, since unit-scoring reads the rows as
// soon as it loads.
import '../comps/prefill';
export { unitsFor, gridRankings, headlineStats, SKILL_STATS, unitStat } from '../comps/units';
export { SPORT } from '@sport/sport';
export { AWARD_INFO } from '@sport/awards';
