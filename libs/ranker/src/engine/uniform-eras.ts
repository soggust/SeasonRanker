// What a team wore, season by season: the shapes of each sport's uniform table (apps/<sport>/src/sport/
// uniform-eras.ts, UNIFORM_ERAS) and the NFL's helmets (apps/nfl/src/sport/helmets.ts, HELMET_ERAS). Data only:
// the Overview's splash draws a past season's jerseys and helmet from them.
//
// Keyed by the team's logo name, as team-colors.ts and logo-eras.ts are (NFL 'Jaguars', NBA 'BRK', NHL 'FLA',
// MLB '147'); each team's eras oldest first, the last one open-ended (no `to`). Seasons are the site's (NBA and
// NHL by the year a season ends in). The tables start with the site's first season for the sport (NFL and MLB
// 2000, NBA 2001, NHL 2009): an era that began earlier starts at that season. A team or a season a table
// doesn't have falls back to the season's team-look colors.
//
// home / away / alt: what the team wore at home, on the road, and its main alternate (a third jersey worn
// regularly), by its league's convention in that era (the NFL's Cowboys wore white at home; MLB and pre-2017
// NBA homes are white; NHL homes are dark from 2003-04). A `?` in `note` marks a color or a range the sources
// didn't settle.

export interface KitColors {
  body: string; // the jersey
  num: string; // the numbers' fill
  outline: string; // the numbers' outline (the fill again when they have none)
  name: string; // the name over the numbers (or, MLB and NBA, the wordmark across the chest)
  collar: string;
  sleeve: 'stripes' | 'none'; // stripes round the sleeves (or the NBA's armholes, MLB's sleeve piping)
  stripe?: string; // their color (else the outline's)
  stripe2?: string; // a second, inner stripe color
}

export interface UniformEra {
  from: number;
  to?: number;
  home: KitColors;
  away: KitColors;
  alt?: KitColors;
  note?: string; // what changed, and any doubt ('?')
}

export type UniformTable = Record<string, UniformEra[]>;

// An NFL team's helmet in an era: its shell, its stripe pattern over the crown (none unless it has one) and the
// stripe's colors, a fade instead of a solid shell (the two colors, top first), the facemask, the logo's colors
export interface HelmetEra {
  from: number;
  to?: number;
  shell: string;
  finish?: 'gloss' | 'matte' | 'metallic' | 'chrome';
  stripe: 'none' | 'single' | 'double' | 'triple';
  colors?: [string, string?]; // the stripe's colors: the center one first, then its trim
  fade?: [string, string];
  mask: string;
  logo?: string; // the logo's main color
  note?: string;
}

export type HelmetTable = Record<string, HelmetEra[]>;

// A team's era for a season (null when the table hasn't one)
export function eraFor<T extends { from: number; to?: number }>(eras: T[] | undefined, season: number): T | null {
  return (eras ?? []).find((e) => season >= e.from && season <= (e.to ?? 9999)) ?? null;
}

// A kit for one season: its era's, else null (the caller falls back to the team-look colors)
export function uniformFor(table: UniformTable, team: string | undefined, season: number, kit: 'home' | 'away' | 'alt'): KitColors | null {
  const era = eraFor(table[team ?? ''], season);
  if (!era) return null;
  return (kit === 'alt' ? era.alt : kit === 'away' ? era.away : era.home) ?? era.home;
}
