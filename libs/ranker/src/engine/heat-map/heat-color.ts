// The Heat Maps' colors (plain functions, no Angular: the component paints with them, the tests check them).
// Efficiency: diverging against the league's value in the same cell, as the grid's value tint reads a column
// (core/value-tint.ts: the spread, capped 2 out), green the good side for the row (a defense's: less allowed),
// red the bad. Volume, and a share stat: one hue, light to strong. A matchup (a cell and the opponent's over
// it): the two leanings together. Every fill sits at alpha 0.85 or less, over a darkened surface; a cell short
// of the stat's sample is greyed (hatched), its number dimmed, whatever its value.

import { tintStrength } from '@ranker/core/value-tint';
import type { HeatCell, HeatMode, HeatStat } from './heat-map.model';

// (value-tint's good and bad, and the volume's hue: the broadcast's line-of-scrimmage blue the field already has)
export const HEAT_GOOD: [number, number, number] = [62, 224, 122];
export const HEAT_BAD: [number, number, number] = [255, 90, 79];
export const HEAT_VOLUME: [number, number, number] = [95, 168, 255];
// (a lean's two sides, neither good nor bad: a pass rate's run side amber, its pass side lavender)
export const HEAT_LEAN_LOW: [number, number, number] = [240, 172, 72];
export const HEAT_LEAN_HIGH: [number, number, number] = [138, 120, 236];
export const HEAT_ALPHA_MAX = 0.85;
// (a cell with nothing to say: the surface's own, faintly chalked)
export const HEAT_NEUTRAL = 'rgba(255, 255, 255, 0.06)';

const BASE = 0.14;
// (the strongest a cell gets: 2 spreads out, the league's furthest; under the 0.85 ceiling, the turf showing through)
const FULL = 0.78;
const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r}, ${g}, ${b}, ${Math.min(HEAT_ALPHA_MAX, a).toFixed(3)})`;

// A cell under the stat's sample: greyed, whatever its value (a few throws to a zone say little)
export const isThin = (cell: Pick<HeatCell, 'n'>, stat: Pick<HeatStat, 'minN'>): boolean => cell.n < stat.minN;

// A cell's leaning, -1 (the bad end) to 1 (the good end) for the row: its value against the league's in its
// spread (the cell's own, else the stat's); a defense's flipped (what it allowed: less is better). 0: nothing
// to compare (no value, no league, no spread, or no sample)
export function cellTone(cell: HeatCell, stat: HeatStat, defense = false): number {
  const sd = cell.sd ?? stat.sd;
  if (!cell.n || cell.value === null || cell.league === null || !sd) return 0;
  return Math.round(tintStrength(cell.value, { mean: cell.league, sd }, !!stat.lowerIsBetter !== defense) * 1000) / 1000 || 0;
}

// A matchup's leaning for the row: its own cell's and the opponent's over it, together. An offense's row: its
// cell good for it, and the defense's allowed there (more is softer: good for the offense too). A defense's row
// (defense): what it allowed (less is better), and the offense's there (more is worse for it). Either short of
// its sample: none
export function edgeTone(cell: HeatCell, opponent: HeatCell | undefined, stat: HeatStat, defense = false): number {
  if (!opponent || isThin(cell, stat) || isThin(opponent, stat)) return 0;
  return Math.round(((cellTone(cell, stat, defense) + cellTone(opponent, stat, defense)) / 2) * 1000) / 1000;
}

// Diverging: green or red, stronger the further it leans (none: the neutral chalk)
export function divergingFill(tone: number): string {
  if (Math.abs(tone) < 0.04) return HEAT_NEUTRAL;
  return rgba(tone > 0 ? HEAT_GOOD : HEAT_BAD, BASE + (FULL - BASE) * Math.min(1, Math.abs(tone)));
}

// A lean: the same, in the two neutral hues (above the league's lavender, below amber)
export function leanFill(tone: number): string {
  if (Math.abs(tone) < 0.04) return HEAT_NEUTRAL;
  return rgba(tone > 0 ? HEAT_LEAN_HIGH : HEAT_LEAN_LOW, BASE + (FULL - BASE) * Math.min(1, Math.abs(tone)));
}

// Sequential: the one hue, 0 (faint) to 1 (strong)
export function sequentialFill(strength: number): string {
  const s = Math.max(0, Math.min(1, strength));
  return s <= 0 ? HEAT_NEUTRAL : rgba(HEAT_VOLUME, 0.1 + (FULL - 0.1) * s);
}

// A number in its tone: white, leaning green or red the further it leans (the hover's value, a chip's)
export function toneText(tone: number): string {
  const [r, g, b] = tone >= 0 ? HEAT_GOOD : HEAT_BAD;
  const k = Math.min(1, Math.abs(tone)) * 0.85;
  const mix = (c: number) => Math.round(255 + (c - 255) * k);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// ...and a lean's: leaning lavender or amber
export function leanText(tone: number): string {
  const [r, g, b] = tone >= 0 ? HEAT_LEAN_HIGH : HEAT_LEAN_LOW;
  const k = Math.min(1, Math.abs(tone)) * 0.85;
  const mix = (c: number) => Math.round(255 + (c - 255) * k);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export interface HeatPaint {
  fill: string;
  tone: number;
  thin: boolean;
}

// A cell's paint in a mode: by volume its share of the busiest cell's sample; by efficiency its leaning (a share stat's: its value against the biggest cell's, one hue); with
// an opponent's cell over it, the matchup's leaning. Greyed under the sample, in every mode but volume (a count
// is a count)
export function heatPaint(
  cell: HeatCell,
  { stat, mode, defense = false, opponent, most = 1, top = 1 }: { stat: HeatStat; mode: HeatMode; defense?: boolean; opponent?: HeatCell | null; most?: number; top?: number },
): HeatPaint {
  if (mode === 'volume') {
    const share = most > 0 ? cell.n / most : 0;
    return { fill: cell.n ? sequentialFill(share) : HEAT_NEUTRAL, tone: 0, thin: false };
  }
  // (nothing there at all: the surface's own, no hatch)
  if (!cell.n) return { fill: HEAT_NEUTRAL, tone: 0, thin: false };
  const thin = isThin(cell, stat) || (opponent !== undefined && opponent !== null && isThin(opponent, stat));
  if (thin) return { fill: 'var(--hm-thin)', tone: 0, thin: true };
  if (stat.scale === 'sequential') {
    const s = top > 0 && cell.value !== null ? cell.value / top : 0;
    return { fill: sequentialFill(s), tone: 0, thin: false };
  }
  if (stat.scale === 'lean') {
    const tone = cellTone(cell, stat);
    return { fill: leanFill(tone), tone, thin: false };
  }
  const tone = opponent ? edgeTone(cell, opponent, stat, defense) : cellTone(cell, stat, defense);
  return { fill: divergingFill(tone), tone, thin: false };
}

// ---- last season behind a thin cell (the HeatFallback inputs): early in a season most cells are under the
// stat's sample; where this season's is and the same row's last season had enough, last season's is painted
// instead, turned down (faded) and hatched over, and the hover says which season it is. Once this season's
// sample is enough, this season's, as usual. Never anyone else's: no league average stands in for him

// (how far a faded cell's paint is turned down)
export const HEAT_FADE = 0.36;

export interface HeatPick {
  cell: HeatCell;
  faded: boolean;
}

// The cell to paint: this season's, or last season's when this one's is under the sample (none at all
// included) and last season's isn't
export function pickCell(cell: HeatCell, fallback: HeatCell | null | undefined, stat: Pick<HeatStat, 'minN'>): HeatPick {
  if (!isThin(cell, stat) || !fallback || isThin(fallback, stat) || fallback.value === null) return { cell, faded: false };
  return { cell: fallback, faded: true };
}

// A fill turned down (an rgba's alpha times k; the neutral chalk and a pattern as they are)
export function fadeFill(fill: string, k = HEAT_FADE): string {
  const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(fill);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${(Number(m[4]) * k).toFixed(3)})` : fill;
}

// A cell's pick with the opponent's over it (none: no overlay): faded when either side is last season's and
// neither side, as picked, is still under the sample (then it's greyed, as any thin cell)
export function pickPair(cell: HeatCell, fallback: HeatCell | null | undefined, stat: Pick<HeatStat, 'minN'>, opponent?: HeatCell | null, opponentFallback?: HeatCell | null): { own: HeatPick; opp: HeatPick | null; faded: boolean } {
  const own = pickCell(cell, fallback, stat);
  const opp = opponent ? pickCell(opponent, opponentFallback, stat) : null;
  const thin = isThin(own.cell, stat) || (!!opp && isThin(opp.cell, stat));
  return { own, opp, faded: (own.faded || !!opp?.faded) && !thin };
}

// Whether a map has any cell drawn from last season (its key's "Faded" note; the AI preview's shared key)
export function anyFaded(cells: HeatCell[], fallback: HeatCell[] | null | undefined, stat: Pick<HeatStat, 'minN'>, overlay?: HeatCell[] | null, overlayFallback?: HeatCell[] | null): boolean {
  if (!fallback?.length && !overlayFallback?.length) return false;
  const byId = (list: HeatCell[] | null | undefined) => new Map((list ?? []).map((c) => [c.id, c]));
  const [own, mine, opp, theirs] = [byId(cells), byId(fallback), byId(overlay), byId(overlayFallback)];
  const none = (id: string): HeatCell => ({ id, n: 0, value: null, league: null });
  return [...new Set([...own.keys(), ...mine.keys()])].some(
    (id) => pickPair(own.get(id) ?? none(id), mine.get(id), stat, overlay ? (opp.get(id) ?? none(id)) : null, theirs.get(id)).faded,
  );
}
