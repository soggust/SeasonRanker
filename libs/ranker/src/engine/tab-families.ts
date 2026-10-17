// The position bar's families (SportConfig.tabFamilies: the NFL's Offense, Defense and Special Teams, each a
// top-row tab whose members open from it), worked out from the sport's config alone so the bar and the tests
// read them the same way. A sport without families has a bar of its tabs and nothing else here.
//
// Desktop and tablet: ONE row, an accordion. A family that isn't open is one tab, like any other on the row;
// the open family (the one the showing tab belongs to) expands in place as one group: its own tab as the
// group's label, then its members as ordinary tabs, one lit rule under the whole group and the showing member
// lit. Narrower tablets, where eleven cells don't fit: the parent
// tabs alone on the row, lit for any member, with the family's members on a sub-row under it (app.component
// shows one or the other by width). Phones: the native select, in the sport's groups, and no sub-row.
import type { SportConfig } from '@ranker/engine/sport';

export type TabFamily = NonNullable<SportConfig['tabFamilies']>[number];
export type TabGroup = NonNullable<SportConfig['tabGroups']>[number];

// One cell of the accordion row: a plain tab, a collapsed family (a tab like any other), or the open family:
// its label and its members
export type BarCell =
  | { kind: 'tab'; tab: string }
  | { kind: 'family'; tab: string; label: string }
  | { kind: 'open'; tab: string; label: string; members: { tab: string; name: string }[] };

// The family a tab belongs to (its parent included); none for a tab of its own
export function familyOf(families: TabFamily[] | undefined, tab: string): TabFamily | null {
  return families?.find((family) => family.parent === tab || tab in family.names) ?? null;
}

// The row's own tabs, in the sport's order: every tab but the ones grouped under another
export function mainTabs(families: TabFamily[] | undefined, shown: string[]): string[] {
  return shown.filter((tab) => {
    const family = familyOf(families, tab);
    return !family || family.parent === tab;
  });
}

// The row's tab lit for a showing one: its own, or its family's parent (DEF while a CB list is open)
export function litTab(families: TabFamily[] | undefined, position: string): string {
  return familyOf(families, position)?.parent ?? position;
}

// A family's members among the tabs shown, in its order, with their short names
export function familyMembers(family: TabFamily, shown: string[]): { tab: string; name: string }[] {
  return Object.entries(family.names)
    .filter(([tab]) => shown.includes(tab))
    .map(([tab, name]) => ({ tab, name }));
}

// The sub-row under the bar while a family's tab is open (the narrow-tablet fallback): its members; none
// for a tab of its own
export function subTabs(families: TabFamily[] | undefined, shown: string[], position: string): { tab: string; name: string }[] | null {
  const family = familyOf(families, position);
  return family ? familyMembers(family, shown) : null;
}

// The accordion row's cells for a showing tab: the main tabs in order, the showing tab's family expanded
// in place. A sport without families: a plain tab for each of its tabs, exactly the bar it had.
export function barCells(families: TabFamily[] | undefined, shown: string[], position: string): BarCell[] {
  const open = familyOf(families, position);
  return mainTabs(families, shown).map((tab) => {
    const family = familyOf(families, tab);
    if (!family) return { kind: 'tab', tab };
    if (family === open) return { kind: 'open', tab, label: family.label, members: familyMembers(family, shown) };
    return { kind: 'family', tab, label: family.label };
  });
}

// The tab a collapsed family opens to: the member last shown in it this session (familyMemory), else its
// first member (Team O, Team D, Team ST: the parent lists first)
export function familyOpensTo(family: TabFamily, shown: string[], remembered: string | null): string | null {
  const members = familyMembers(family, shown).map((m) => m.tab);
  if (remembered && members.includes(remembered)) return remembered;
  return members[0] ?? null;
}

// What this session last showed in each family: sessionStorage, a key a sport (none where storage is
// out of reach: a private window, a test)
export function familyMemory(sport: string): { get(parent: string): string | null; set(parent: string, tab: string): void } {
  const key = (parent: string) => `ranker.${sport}.family.${parent}`;
  const storage = (): Storage | null => {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    get: (parent) => {
      try {
        return storage()?.getItem(key(parent)) ?? null;
      } catch {
        return null;
      }
    },
    set: (parent, tab) => {
      try {
        storage()?.setItem(key(parent), tab);
      } catch {
        // (storage full or refused: the family opens to its first member)
      }
    },
  };
}

// The phone's dropdown in the sport's groups (SportConfig.tabGroups; a tab in no group lists first,
// ungrouped), each option named as the group says, else as the bar does
export function selectGroups(
  groups: TabGroup[] | undefined,
  shown: string[],
  nameOf: (tab: string) => string,
): { label: string | null; tabs: { tab: string; name: string }[] }[] {
  const grouped = new Set((groups ?? []).flatMap((group) => group.tabs));
  const loose = shown.filter((tab) => !grouped.has(tab)).map((tab) => ({ tab, name: nameOf(tab) }));
  const named = (groups ?? [])
    .map((group) => ({
      label: group.label as string | null,
      tabs: group.tabs.filter((tab) => shown.includes(tab)).map((tab) => ({ tab, name: group.names?.[tab] ?? nameOf(tab) })),
    }))
    .filter((group) => group.tabs.length);
  return [...(loose.length ? [{ label: null, tabs: loose }] : []), ...named];
}
