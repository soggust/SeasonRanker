// A collapsed group's strip shows each row's place within the group: the rows ranked by what the group's
// stats added to their scores (weightedTotals' parts: each stat's share of a row's total, the same sliders,
// the same normalization against the same pool, so a group's score is exactly what it adds to the overall
// score). Only a look: the list's order is never touched.
//
// rows: the rows ranked against each other (the list's ranked rows, the current filters'); parts: each row's
// share of its total by stat key; groupOf: each counted stat's group (only stats that added to the scores:
// a slider at 0 or a stat with no spread isn't one, so a group with none has no ranks, a dash).
// Tied scores share a place (1, 1, 3); a row with no share in the group scores 0 in it.
export function groupRanks<T>(rows: T[], parts: Map<T, Map<string, number>>, groupOf: Map<string, string>): Map<string, Map<T, number>> {
  const keys = new Map<string, string[]>();
  for (const [key, group] of groupOf) (keys.get(group) ?? keys.set(group, []).get(group)!).push(key);
  const out = new Map<string, Map<T, number>>();
  for (const [group, own] of keys) {
    const scored = rows.map((row) => {
      const shares = parts.get(row);
      return { row, score: own.reduce((sum, key) => sum + (shares?.get(key) ?? 0), 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    const places = new Map<T, number>();
    scored.forEach(({ row, score }, i) => {
      const prev = scored[i - 1];
      // (a tie, to the float noise of summing the same shares in another order)
      const tied = prev && Math.abs(prev.score - score) <= 1e-9 * Math.max(1, Math.abs(score));
      places.set(row, tied ? places.get(prev.row)! : i + 1);
    });
    out.set(group, places);
  }
  return out;
}
