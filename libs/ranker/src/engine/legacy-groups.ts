// A group switched off by an id the tab no longer has. Share links (?list= g), saved presets (settings.groups)
// and tracker pins name a hidden group by its id; when a sport re-cuts its categories, the ids retired
// ("box", "advanced") keep a frozen copy of their stats in the sport's LEGACY_GROUPS, and hiding one hides
// those stats one by one (the per-stat eye, which the scoring reads the same way), so the list ranks exactly
// as its author saw it. An id the tab has is hidden as a group, as ever; an id nobody knows is ignored.
import { LEGACY_GROUPS, SkillPosition, skillGroups } from '@sport/positions';

export function legacyGroupKeys(position: SkillPosition, id: string): readonly string[] | null {
  const own = (LEGACY_GROUPS as Partial<Record<string, Partial<Record<string, readonly string[]>>>>)[position];
  return own?.[id] ?? null;
}

export function isGroupId(position: SkillPosition, id: string): boolean {
  return skillGroups(position).some((group) => group.id === id);
}

interface HidesGroups {
  setSkillGroupHidden(position: SkillPosition, id: string, hidden: boolean): void;
  setStatHidden(position: SkillPosition, key: string, hidden: boolean): void;
}

// true: something was hidden (a group of the tab's, or a retired one's stats)
export function applyHiddenGroup(service: HidesGroups, position: SkillPosition, id: string): boolean {
  if (isGroupId(position, id)) {
    service.setSkillGroupHidden(position, id, true);
    return true;
  }
  const keys = legacyGroupKeys(position, id);
  if (!keys) return false;
  for (const key of keys) service.setStatHidden(position, key, true);
  return true;
}
