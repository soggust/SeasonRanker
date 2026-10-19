// A sport's stat categories as it declares them (each positions.ts's GROUPS table): per tab, the groups in
// the order the grid shows them, each with the keys of its stats in column order. A def may name keys the
// tab doesn't have (one list shared by the hitters' tabs names the fielding stats the DH lacks): they're
// left out when the groups are resolved, and a group left with no stat isn't shown. Every stat of a tab
// (the Position Adjustment aside: never a column) belongs to exactly one group; tests/categories.test.mjs
// holds every sport to that.
//
// Nothing here touches the ranking: a stat's group decides where its column sits, the strip's name and
// color, and which stats the sidebar's eye on the group switches off together (tab-ranker.ts scores).
import type { StatDef, StatGroup } from './sport';

export interface GroupDef<Key extends string = string> {
  id: string;
  title: string;
  fullTitle?: string;
  icon: string;
  tone: number;
  box?: boolean;
  keys: readonly Key[];
}

// The defs with their stats filled in from the tab's, in key order (a key the tab lacks skipped, a group
// with none dropped)
export function resolveGroups<Stat extends StatDef>(defs: readonly GroupDef[], stats: readonly Stat[]): StatGroup<Stat>[] {
  const byKey = new Map<string, Stat>();
  for (const stat of stats) if (!stat.positionAdjust) byKey.set(stat.key, stat);
  return defs
    .map(({ keys, ...def }) => ({ ...def, stats: keys.map((key) => byKey.get(key)).filter((stat): stat is Stat => !!stat) }))
    .filter((group) => group.stats.length);
}

// The id of the group a key sits in (none: a key no def names)
export function groupOfKey(defs: readonly GroupDef[], key: string): string | undefined {
  return defs.find((def) => def.keys.includes(key))?.id;
}

// A def with some keys taken out (a tab without them), or with keys added at the end
export const without = <Key extends string>(def: GroupDef<Key>, drop: readonly Key[]): GroupDef<Key> => ({ ...def, keys: def.keys.filter((key) => !drop.includes(key)) });
