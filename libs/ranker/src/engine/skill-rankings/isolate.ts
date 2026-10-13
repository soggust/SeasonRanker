// A header clicked: the grid sorted by that one stat for a look (isolation), the ranking itself untouched.
// The rows shown are put in the stat's order, best first (lower first for a lower-is-better stat or a
// rank), rows without a value last, ties in the list's own order; the UR rows stay below the ranked ones,
// sorted the same among themselves. Each ranked row gets its place by the stat (tied values share one;
// none without a value), the rank tile's number while the look lasts.
import type { StatDef } from '@ranker/engine/sport';

export interface IsolatedRows<Row> {
  rows: Row[];
  places: Map<Row, number | null>;
}

// Lower is better: a negative stat, or a rank (#1 the best)
export function lowerIsBetter(stat: Pick<StatDef, 'negative' | 'format'>): boolean {
  return !!stat.negative || stat.format === 'rank';
}

// rows: the rows shown (the Teams Included filter already applied), the first `ranked` of them ranked, in
// the list's order; value: a row's value as its column shows it (null or not a number: none)
export function isolateRows<Row>(
  rows: Row[],
  ranked: number,
  value: (row: Row, ur: boolean) => number | null,
  lowerBetter: boolean,
): IsolatedRows<Row> {
  const sorted = (part: Row[], ur: boolean) => {
    const keyed = part.map((row, i) => {
      const v = value(row, ur);
      return { row, i, v: typeof v === 'number' && Number.isFinite(v) ? v : null };
    });
    keyed.sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const diff = lowerBetter ? a.v - b.v : b.v - a.v;
      return diff || a.i - b.i;
    });
    return keyed;
  };
  const top = sorted(rows.slice(0, ranked), false);
  const ur = sorted(rows.slice(ranked), true);
  // (a place: one more than the rows ahead with a better value, so tied values share it)
  const places = new Map<Row, number | null>();
  top.forEach((entry, i) => {
    const before = top[i - 1];
    const place = entry.v === null ? null : before && before.v === entry.v ? places.get(before.row)! : i + 1;
    places.set(entry.row, place);
  });
  return { rows: [...top, ...ur].map((entry) => entry.row), places };
}
