// A sport's heat-map files, each fetched once for the visit: the season being played's from the top of data/
// (asked for fresh), a finished season's from data/seasons/<season>/. A file that isn't there or won't read is
// none, and so is another season's (the one left at the top of data/ before the new season's first games).
// expand: a packed file put back together (after the season is checked).
const files = new Map<string, Promise<unknown>>();

export function heatSeasonFile<T extends { season: number }>(season: number, current: boolean, name: string): Promise<T | null>;
export function heatSeasonFile<P extends { season: number }, T>(season: number, current: boolean, name: string, expand: (packed: P) => T): Promise<T | null>;
export function heatSeasonFile<P extends { season: number }, T>(season: number, current: boolean, name: string, expand?: (packed: P) => T): Promise<T | P | null> {
  const path = current ? `data/${name}` : `data/seasons/${season}/${name}`;
  if (!files.has(path)) {
    files.set(
      path,
      fetch(path, { cache: current ? 'no-cache' : 'default' })
        .then(async (res) => (res.ok ? ((await res.json()) as P) : null))
        .then((f) => (f && f.season === season ? (expand ? expand(f) : f) : null))
        .catch(() => null),
    );
  }
  return files.get(path) as Promise<T | P | null>;
}
