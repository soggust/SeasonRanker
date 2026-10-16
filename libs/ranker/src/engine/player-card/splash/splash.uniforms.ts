// What a team wore, season by season, and the NFL's helmets: each sport's own tables (apps/<sport>/src/sport/
// uniform-eras.ts UNIFORM_ERAS and HELMET_ERAS, the shapes in libs/ranker/src/engine/uniform-eras.ts; their sources
// in their comments). A jersey drawn for a past season wears that season's uniform: its base colors (home, away,
// the alternate), its numbers (fill and outline), its sleeves (stripes, or plain) and its collar. A team or a
// season the tables don't have falls back to the season's team-look colors.
import { HELMET_ERAS, UNIFORM_ERAS } from '@sport/uniform-eras';
import { eraFor, uniformFor as kitFor, type KitColors, type UniformEra } from '@ranker/engine/uniform-eras';

export type { KitColors, UniformEra };
export { UNIFORM_ERAS };

// A kit for one season: the team's era for it, else nothing (the caller falls back to the team-look colors)
export function uniformFor(team: string | undefined, season: number, kit: 'home' | 'away' | 'alt'): KitColors | null {
  return kitFor(UNIFORM_ERAS, team, season, kit);
}

// ---- A team's helmet as the piece draws it: its shell (a color, or a fade between two), its stripe pattern over
// the crown (none unless the team has one), the stripe's colors (else the team's second color), the facemask's
// color. A team the table doesn't have: a plain shell in its color, a grey mask.
export interface HelmetLook {
  stripe?: 'none' | 'single' | 'double' | 'triple';
  colors?: [string, string?];
  fade?: boolean;
  fadeColors?: [string, string];
  shell?: string;
  mask?: string;
}

// The team's helmet that season (HELMET_ERAS), or none
export function helmetFor(team: string | undefined, season: number): HelmetLook | undefined {
  const e = eraFor(HELMET_ERAS[team ?? ''], season);
  if (!e) return undefined;
  return { stripe: e.stripe, colors: e.colors, fade: !!e.fade, fadeColors: e.fade, shell: e.shell, mask: e.mask };
}

// ---- Signature shoe lines (the NBA's): a player's line, drawn as a nod to it in his team's colors. By his
// name as the rows have it. Everyone else: the generic team-color sneaker.
export const SIGNATURE_SHOES: Record<string, { line: string; name: string }> = {
  'LeBron James': { line: 'lebron', name: 'the LeBron line' },
  'Stephen Curry': { line: 'curry', name: 'the Curry line' },
  'Giannis Antetokounmpo': { line: 'giannis', name: 'the Freak line' },
  'Luka Doncic': { line: 'luka', name: 'the Luka line' },
  'Luka Dončić': { line: 'luka', name: 'the Luka line' },
  'Ja Morant': { line: 'ja', name: 'the Ja line' },
  'Anthony Edwards': { line: 'ae', name: 'the AE line' },
  'Shai Gilgeous-Alexander': { line: 'shai', name: 'the SHAI line' },
  'Kevin Durant': { line: 'curry', name: 'the KD line' },
  'Kyrie Irving': { line: 'luka', name: 'the Kyrie line' },
  'Devin Booker': { line: 'ae', name: 'the Book line' },
  'Jayson Tatum': { line: 'giannis', name: 'the Tatum line' },
  'Damian Lillard': { line: 'ja', name: 'the Dame line' },
  'Zion Williamson': { line: 'lebron', name: 'the Zion line' },
  'Trae Young': { line: 'curry', name: 'the Trae line' },
};

// A signature shoe line's look: a stylized nod to the line (its cut and its signature detail), drawn in the
// player's team colors. Everyone else: the generic team-color sneaker.
export interface ShoeLine {
  cut: 'low' | 'mid' | 'high';
  detail: 'waves' | 'cage' | 'strap' | 'clean' | 'swirl' | 'panels';
}
export const SHOE_LINES: Record<string, ShoeLine> = {
  ae: { cut: 'mid', detail: 'waves' }, // Anthony Edwards
  shai: { cut: 'mid', detail: 'clean' }, // Shai Gilgeous-Alexander
  curry: { cut: 'low', detail: 'clean' }, // Stephen Curry
  lebron: { cut: 'high', detail: 'strap' }, // LeBron James
  giannis: { cut: 'mid', detail: 'panels' }, // Giannis Antetokounmpo
  luka: { cut: 'mid', detail: 'cage' }, // Luka Doncic
  ja: { cut: 'mid', detail: 'swirl' }, // Ja Morant
  generic: { cut: 'mid', detail: 'clean' },
};
