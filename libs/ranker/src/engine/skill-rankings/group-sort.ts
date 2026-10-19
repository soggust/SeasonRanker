import type { SkillStat, SkillStatGroup } from '@sport/positions';

// A group's own column (its name in the header, each row's rank within the group under it) as a column the
// grid can sort by: a stand-in stat keyed "group:<id>", a rank (lower first, isolate.ts lowerIsBetter), so a
// click on the group's name isolates the rows by it exactly as a stat's header does (the same look, the same
// arrow and chip, the same ways back), never touching the ranking, the saved order, lists or links.
export const GROUP_KEY = 'group:';

const made = new Map<string, SkillStat>();

export function groupStat(group: Pick<SkillStatGroup, 'id' | 'title'>): SkillStat {
  const key = `${GROUP_KEY}${group.id}`;
  let stat = made.get(key);
  if (!stat || stat.label !== group.title) {
    stat = { key, label: group.title, name: `Rank within ${group.title}`, format: 'rank', infoOnly: true } as unknown as SkillStat;
    made.set(key, stat);
  }
  return stat;
}

// The group a stand-in's key is for (null: a real stat)
export function groupOfKey(key: string | null | undefined): string | null {
  return key?.startsWith(GROUP_KEY) ? key.slice(GROUP_KEY.length) : null;
}

// What isolation sorts a group's column by: each ranked row's rank within the group (a UR row, or a group
// with none: no value, last)
export function groupSortValue<T>(places: Map<string, Map<T, number>>, id: string): (row: T, ur: boolean) => number | null {
  const own = places.get(id);
  return (row, ur) => (ur ? null : (own?.get(row) ?? null));
}
