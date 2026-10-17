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
  name: string; // the name over the numbers (or, MLB, the wordmark across the chest)
  collar: string;
  sleeve: 'stripes' | 'none'; // stripes round the sleeves (or the NBA's armholes, MLB's sleeve piping)
  stripe?: string; // their color (else the outline's)
  stripe2?: string; // a second, inner stripe color

  // ---- the cut's details (all optional; a kit without them draws as before). Each sport's jersey is drawn
  // in its own cut (the splash: football, basketball tank, hockey sweater, baseball button-front), and these
  // fill in what that cut can show. Colors are hexes; a field left out draws nothing (or the plain default).
  //
  //   bands       the sleeve stripes as an explicit list, top to bottom (a hockey sweater's 1-3 arm bands, a
  //               football sleeve's stripe set): overrides stripe/stripe2 when given ['#fff', '#c00', '#fff']
  //   hem         hem stripes, top to bottom (a hockey sweater's; a basketball tank's hem trim is one band)
  //   yoke        a shoulder yoke in another color (hockey's; football's shoulder/sleeve-cap color when the
  //               sleeves are a solid block rather than striped: Broncos, Falcons)
  //   cap         football: the sleeve ends in a solid color block (a sleeve cap) instead of stripes
  //   panel       a side panel down the body in another color (basketball tanks, modern football cuts)
  //   piping      thin piping along the edges: a tank's armholes and neck, a baseball placket and collar, a
  //               panel's edge
  //   pinstripe   pinstripes in this color over the body (baseball; a few basketball tanks)
  //   placket     baseball: 'buttons' (the default button-front), 'pullover' (a V-neck pullover, no buttons),
  //               'vest' (a sleeveless vest over an undershirt in `under`)
  //   under       baseball vest: the undershirt's color (the sleeves showing under the vest)
  //   tv          football: TV numbers on the shoulders (default true); false for a kit without them
  //   collarStyle 'round' (the default crew), 'v' (a V-neck), 'lace' (a hockey lace-up collar),
  //               'stripe' (a contrasting collar band, football's old style)
  //   numberFont  the numbers' letterforms: 'block' (the default athletic block), 'rounded' (a rounded
  //               sans), 'serif' (a serifed block), 'varsity' (a heavy block with a second outline)
  //   nameFont    the nameplate's letterforms: as numberFont (default 'block')
  //   names       false for a kit with no names on the back (the Yankees', the Red Sox' and Tigers' home)
  bands?: string[];
  names?: boolean;
  hem?: string[];
  yoke?: string;
  cap?: string;
  panel?: string;
  piping?: string;
  pinstripe?: string;
  placket?: 'buttons' | 'pullover' | 'vest';
  under?: string;
  tv?: boolean;
  collarStyle?: 'round' | 'v' | 'lace' | 'stripe';
  numberFont?: 'block' | 'rounded' | 'serif' | 'varsity';
  nameFont?: 'block' | 'rounded' | 'serif' | 'varsity';
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
