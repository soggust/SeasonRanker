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

// A row's value as its column shows it: with Show Ranks, the place the cell reads ("#3"), which goes by the
// per-game rate (listRank), so the sort by a season total under it would read #1, #4, #2...; otherwise
// the value shown
export function shownValue<Row, Stat>(
  reader: { showsRank(stat: Stat): boolean; rate(row: Row, stat: Stat): number | null; value(row: Row, stat: Stat): number | null },
  row: Row,
  stat: Stat,
): number | null {
  return reader.showsRank(stat) ? reader.rate(row, stat) : reader.value(row, stat);
}

// Share's Copy Isolated (in the menu only while a column is isolated: copyIsolatedShown): the rows shown in
// the isolated order, as plain text under a line naming the stat ("Passing Yards (sorted by it alone)"),
// each a tab-separated line (pastes into spreadsheets and notes): its place by the stat ("-": none), the
// name, the team (the logo's abbreviation; none on a team's own row or in a sport without teams) and the
// value as the column shows it. The ranked rows only, as the other copy has them (no UR rows).
export interface IsolatedLine {
  place: number | null;
  name: string;
  team: string | null;
  value: string;
}

export function copyIsolatedShown(isolated: unknown): boolean {
  return !!isolated;
}

export function isolatedCopyText<Row>(
  statName: string,
  rows: Row[],
  ranked: number,
  line: (row: Row) => IsolatedLine,
  worstFirst = false,
): string {
  const lines = rows.slice(0, ranked).map(line);
  const title = `${statName} (sorted by it alone${worstFirst ? ', worst first' : ''})`;
  return [title, ...lines.map((l) => [l.place ?? '-', l.name, ...(l.team ? [l.team] : []), l.value].join('\t'))].join('\n');
}

// A Recent cell's results as text (newest first: W, L or T each), as the other copy reads the dots
export function recentText(results: number[]): string {
  return results.map((r) => (r === 1 ? 'W' : r === 0.5 ? 'T' : 'L')).join('');
}
