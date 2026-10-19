import { TintScale, tintFrom, tintScale } from '@ranker/core/value-tint';
import { scoreText } from './rank-why';
// A collapsed group's strip shows each row's place within the group: the rows ranked by what the group's
// stats added to their scores (weightedTotals' parts: each stat's share of a row's total, the same sliders,
// the same normalization against the same pool, so a group's score is exactly what it adds to the overall
// score). Only a look: the list's order is never touched.
//
// rows: the rows ranked against each other (the list's ranked rows, the current filters'); parts: each row's
// share of its total by stat key; groupOf: each counted stat's group (only stats that added to the scores:
// a slider at 0 or a stat with no spread isn't one, so a group with none has no ranks, a dash).
// Scores that read the same to two places (as the grid shows a score: rank-why.ts scoreText) are tied and
// share a place, competition style (1, 1, 1, 4); a row with no share in the group scores 0 in it.
export function groupRanks<T>(rows: T[], parts: Map<T, Map<string, number>>, groupOf: Map<string, string>): Map<string, Map<T, number>> {
  const keys = new Map<string, string[]>();
  for (const [key, group] of groupOf) (keys.get(group) ?? keys.set(group, []).get(group)!).push(key);
  const out = new Map<string, Map<T, number>>();
  for (const [group, own] of keys) {
    const scored = rows.map((row) => {
      const shares = parts.get(row);
      return { row, score: own.reduce((sum, key) => sum + (shares?.get(key) ?? 0), 0) };
    });
    // (judged as the grid shows a score: to two places, scoreText, the rank tile's hover)
    const shown = new Map(scored.map(({ row, score }) => [row, scoreText(score)]));
    const rounded = (row: T) => Number(shown.get(row)!.replace('−', '-'));
    scored.sort((a, b) => rounded(b.row) - rounded(a.row));
    // (competition ranking: tied rows share the first place among them, the next row after them all, 1, 1, 1, 4)
    const places = new Map<T, number>();
    scored.forEach(({ row }, i) => {
      const prev = scored[i - 1];
      places.set(row, prev && shown.get(prev.row) === shown.get(row) ? places.get(prev.row)! : i + 1);
    });
    out.set(group, places);
  }
  return out;
}

// A rank's color in a group's column: the grid's value tint (core/value-tint.ts, as every stat cell's), a
// rank being lower-is-better, against the spread of the group's ranks: a 1 the greenest, the last the reddest,
// the middle plain. null: no rank, or nothing to compare.
export function groupRankTint(places: Map<unknown, number> | undefined, place: number | null): string | null {
  if (!places || place === null) return null;
  let scale = scales.get(places);
  if (scale === undefined) scales.set(places, (scale = tintScale([...places.values()])));
  return tintFrom(place, scale, true);
}

// (each group's ranks' spread, once per set of places)
const scales = new WeakMap<Map<unknown, number>, TintScale | null>();
