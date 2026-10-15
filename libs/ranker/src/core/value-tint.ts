// Stock-ticker style tint: green above the list average, red below, stronger the further out
// (capped at 2 standard deviations). Lower-is-better stats are flipped.

// A column's average and spread (null when there's nothing to compare)
export interface TintScale {
  mean: number;
  sd: number;
}

export function tintScale(values: (number | null)[]): TintScale | null {
  const known = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (known.length < 2) return null;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const sd = Math.sqrt(known.reduce((a, b) => a + (b - mean) ** 2, 0) / known.length);
  return sd ? { mean, sd } : null;
}

// How far a value sits from the scale's mean in its spread, capped 2 spreads out: -1 (the bad end) to 1 (the
// good end), flipped for a lower-is-better stat; 0 with nothing to compare. tintFrom's strength, and the Heat
// Maps' diverging scale (engine/heat-map/heat-color.ts)
export function tintStrength(value: number | null, scale: TintScale | null, lowerIsBetter = false): number {
  if (value === null || !scale) return 0;
  const z = (value - scale.mean) / scale.sd;
  return Math.max(-2, Math.min(2, lowerIsBetter ? -z : z)) / 2 || 0;
}

// Tint for one value against a column's precomputed scale (compute the scale once per column)
export function tintFrom(value: number | null, scale: TintScale | null, lowerIsBetter = false): string | null {
  if (value === null || !scale) return null;
  const z = tintStrength(value, scale, lowerIsBetter);
  const strength = Math.round(Math.abs(z) * 85);
  // The row's surface can set its own good / bad colors and the neutral the tint fades toward (light
  // text on dark rows by default; a light surface would fade toward dark instead)
  const hue = z >= 0 ? 'var(--tint-good, #3ee07a)' : 'var(--tint-bad, #ff5a4f)';
  return `color-mix(in srgb, ${hue} ${strength}%, var(--tint-base, #fff))`;
}

