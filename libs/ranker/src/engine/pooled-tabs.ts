// Pooled tabs (SPORT.pooledTabs: the Top 50, every position together): built in the app from the
// season's rows, never read from a file. Each row is a shallow copy of his own tab's, tagged with that
// tab (homeTab), so the position tabs' rows are never touched; the copies share their stats objects. The
// tab ranks like any other (its own sliders, presets and Min Games: every stat measured against the
// pooled players at the default Min Games, as on its sibling tabs), and its Position Adjustment slider
// (0 by default) measures each stat partly against his own position's players. His card, compare side
// and career are his own tab's: a pooled tab keeps no careers file (build-comps.mjs skips it).
import type { SkillPlayer } from '@sport/positions';
import { SPORT } from '@sport/sport';
import { extras } from '@ranker/engine/row-fields';

export const POOLED = SPORT.pooledTabs ?? {};

// A tab made from other tabs' rows
export function isPooled(tab: string): boolean {
  return tab in POOLED;
}

// The tab a row is his own on: a pooled row's homeTab, else the tab it's on
export function homeTab(row: object, position: string): string {
  return extras(row).homeTab ?? position;
}

// The season's rows with each pooled tab added (last, after the real tabs): every pooled tab's rows,
// copied and tagged with their tab, each player once (in two, his row with more playing time); a tab
// the season doesn't have (an old season without one) is skipped
export function withPooled<R extends Record<string, SkillPlayer[]>>(rows: R): R {
  if (!rows || !Object.keys(POOLED).length) return rows;
  const out: Record<string, SkillPlayer[]> = { ...rows };
  for (const [pooled, { tabs }] of Object.entries(POOLED)) {
    const byId = new Map<string, SkillPlayer>();
    for (const tab of tabs) {
      for (const row of rows[tab] ?? []) {
        const known = byId.get(row.gsisId);
        if (known && SPORT.playingTime.of(known) >= SPORT.playingTime.of(row)) continue;
        byId.set(row.gsisId, { ...row, homeTab: tab } as SkillPlayer);
      }
    }
    out[pooled] = [...byId.values()];
  }
  return out as R;
}

// The Position Adjustment a pooled tab's sliders ask for (weightedTotals' adjust): each row's group (his
// own tab, or the sport's group for it: the NHL's wingers together) and the share of each stat's score
// measured within it (the slider over 100). None on other tabs, or at 0.
export function adjustFor(position: string, weights: object): { of: (row: object) => string; share: number } | undefined {
  const pool = POOLED[position];
  if (!pool) return undefined;
  const share = ((weights as Record<string, number | undefined>)['posAdj'] ?? 0) / 100;
  if (!(share > 0)) return undefined;
  const group = pool.group ?? ((tab: string) => tab);
  return { of: (row) => group(homeTab(row, position)), share: Math.min(1, share) };
}
