// One career across the position tabs. A player's seasons sit on whichever tab he played that year
// (LeBron James: SG as a rookie, SF most years, PF, PG and C some), each ranked among that tab's players,
// but he's one player: one search hit, one Career tab with every season on it, the search's "SF/PF".
// The index ties each tab's id to the player (SPORT.careerId: the NFL's QBs go by ESPN's id, so Taysom
// Hill's QB-2468609 is his TE row's 00-0033357; MLB's H- and P- rows share a number), from the careers'
// names (careers/names.json: every finished season's tabs) and the season being played's rows, so a
// card loads only the careers files of the tabs he played.
//
// Careers are kept apart by SPORT.careerGroup: MLB's hitting and pitching are two careers, linked (Ohtani
// has both). Teams, coaches and pooled tabs (the Top 50, MMA's pound-for-pound lists) are no one's
// career but their own: a team's id is its tab's alone, and a pooled tab's rows are other tabs' players.
import { SKILL_STATS, SkillPlayer, SkillPosition } from '@sport/positions';
import { SPORT } from '@sport/sport';
import { isPooled } from '@ranker/engine/pooled-tabs';

// careers/names.json: per tab, id -> [name, headshot id, last season]
export type CareerNames = Partial<Record<SkillPosition, Record<string, [string, number | null, number]>>>;

// Someone on a tab: the tab, and his id there
export interface TabId {
  position: SkillPosition;
  id: string;
}

// An entry: someone on a tab, with what the index knows of him there
export interface CareerEntry extends TabId {
  name: string;
  headshot: number | null;
  // his last season on the tab
  last: number;
}

// The tabs in their own order (the tab bar's)
export const TAB_ORDER = Object.keys(SKILL_STATS) as SkillPosition[];

// A tab that's its own career alone: a team's or a coach's
const ownTab = (position: string) => !!SPORT.teamTabs?.includes(position) || position === SPORT.coachTab;

// The career a tab's seasons count in: the players' (or the sport's groups: "Hitting", "Pitching"), a team
// or coach tab's own, or none for a pooled tab (its rows are the other tabs' players again)
export function careerGroup(position: string): string | null {
  if (isPooled(position)) return null;
  if (ownTab(position)) return `tab:${position}`;
  return SPORT.careerGroup ? SPORT.careerGroup(position) : 'player';
}

// "SF/PF": his tabs, the one he played most first (a team or coach tab: its name, "Team")
export function tabsLabel(positions: SkillPosition[]): string {
  return positions.map((p) => (ownTab(p) ? SPORT.positionNames[p] : p)).join('/');
}

export class CareerIndex {
  // person -> his entries; tab/id -> person
  private readonly people = new Map<string, CareerEntry[]>();
  private readonly personOf = new Map<string, string>();

  constructor(entries: CareerEntry[]) {
    // (each entry's person: his id on every tab, or for a tab that goes by a headshot id, whoever on the
    // other tabs has that headshot, when it's one person; nobody, his own id there)
    const own = (e: CareerEntry): string | number => (ownTab(e.position) ? `${e.position}:${e.id}` : (SPORT.careerId?.(e.position, e.id) ?? e.id));
    const byHeadshot = new Map<number, Set<string>>();
    for (const e of entries) {
      const person = own(e);
      if (typeof person === 'string' && e.headshot && !ownTab(e.position)) {
        let set = byHeadshot.get(e.headshot);
        if (!set) byHeadshot.set(e.headshot, (set = new Set()));
        set.add(person);
      }
    }
    for (const e of entries) {
      const key = `${e.position}/${e.id}`;
      if (this.personOf.has(key)) {
        // (in the names and this season's rows both: one entry, his latest season)
        const known = this.people.get(this.personOf.get(key)!)!.find((k) => k.position === e.position && k.id === e.id)!;
        known.last = Math.max(known.last, e.last);
        known.headshot ??= e.headshot;
        continue;
      }
      let person = own(e);
      if (typeof person === 'number') {
        const found = byHeadshot.get(person);
        person = found?.size === 1 ? [...found][0] : `${e.position}:${e.id}`;
      }
      this.personOf.set(key, person);
      const list = this.people.get(person);
      if (list) list.push({ ...e });
      else this.people.set(person, [{ ...e }]);
    }
  }

  // The person behind a tab's id, and his career on it (search hits are one per this key)
  key(position: SkillPosition, id: string): string {
    const person = this.personOf.get(`${position}/${id}`) ?? `${position}:${id}`;
    return `${careerGroup(position) ?? position}|${person}`;
  }

  // Every tab he has in this tab's career, in the tab bar's order (the tab itself always among them)
  career(position: SkillPosition, id: string): CareerEntry[] {
    const group = careerGroup(position);
    const person = this.personOf.get(`${position}/${id}`);
    const all = (person && group !== null ? this.people.get(person) : undefined) ?? [];
    const mine = all.filter((e) => careerGroup(e.position) === group);
    if (!mine.some((e) => e.position === position && e.id === id)) mine.push({ position, id, name: '', headshot: null, last: 0 });
    return mine.sort((a, b) => TAB_ORDER.indexOf(a.position) - TAB_ORDER.indexOf(b.position));
  }

  // His other careers (Ohtani's pitching, from his hitting): each group's entry he played last
  linked(position: SkillPosition, id: string): (CareerEntry & { group: string })[] {
    const group = careerGroup(position);
    const person = this.personOf.get(`${position}/${id}`);
    if (!person || group === null || ownTab(position)) return [];
    const out = new Map<string, CareerEntry & { group: string }>();
    for (const e of this.people.get(person) ?? []) {
      const other = careerGroup(e.position);
      if (other === null || other === group || ownTab(e.position)) continue;
      const known = out.get(other);
      if (!known || e.last > known.last) out.set(other, { ...e, group: other });
    }
    return [...out.values()];
  }
}

// The index from the careers' names and any season's rows (this season's, its unranked rows): built once
// for each set of them (the service keeps them, so it's built once a visit)
const built = new WeakMap<object, WeakMap<object, WeakMap<object, CareerIndex>>>();
export function careerIndex(
  names: CareerNames,
  rows: Partial<Record<SkillPosition, SkillPlayer[]>>,
  unranked: Partial<Record<SkillPosition, SkillPlayer[]>> = {},
  season = SPORT.currentSeason,
): CareerIndex {
  let byRows = built.get(names);
  if (!byRows) built.set(names, (byRows = new WeakMap()));
  let byUnranked = byRows.get(rows);
  if (!byUnranked) byRows.set(rows, (byUnranked = new WeakMap()));
  let index = byUnranked.get(unranked);
  if (!index) {
    const entries: CareerEntry[] = [];
    for (const [position, ids] of Object.entries(names) as [SkillPosition, Record<string, [string, number | null, number]>][]) {
      if (careerGroup(position) === null) continue;
      for (const [id, [name, headshot, last]] of Object.entries(ids ?? {})) entries.push({ position, id, name, headshot: headshot ?? null, last });
    }
    for (const tabs of [rows, unranked]) {
      for (const [position, list] of Object.entries(tabs) as [SkillPosition, SkillPlayer[]][]) {
        if (careerGroup(position) === null) continue;
        for (const p of list ?? []) if (p.gsisId) entries.push({ position, id: p.gsisId, name: p.name, headshot: p.id ?? null, last: season });
      }
    }
    byUnranked.set(unranked, (index = new CareerIndex(entries)));
  }
  return index;
}
