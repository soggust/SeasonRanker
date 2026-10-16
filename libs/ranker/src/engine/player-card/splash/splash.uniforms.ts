// What a team wore, season by season. A jersey drawn for a past season wears that season's uniform:
// its base colors (home and away), its numbers (fill and outline), its sleeves (stripes, or plain) and its collar.
// Keyed by the team's logo name (as team-colors.ts and logo-eras.ts are); each team's eras oldest first, the last
// one open-ended. A team or a season the table doesn't have falls back to the season's team-look colors.
//
// Sources for the rest (all free): Wikipedia's "<team> uniforms" histories and each team's logos-and-uniforms
// section, the Gridiron Uniform Database (gridiron-uniforms.com) for the NFL year by year, and Heritage Uniforms
// and Jerseys for MLB, NBA and NHL. About one row per major redesign: 3-5 per team, ~150 rows for the NFL.

export interface KitColors {
  body: string; // the jersey
  num: string; // the numbers' fill
  outline: string; // the numbers' outline
  name: string; // the name over the numbers
  collar: string;
  sleeve: 'stripes' | 'none'; // stripes round the sleeves
  stripe?: string; // their color (else the outline's)
  stripe2?: string; // a second, inner stripe color
}

export interface UniformEra {
  from: number;
  to?: number;
  home: KitColors;
  away: KitColors;
  alt?: KitColors;
}

const WHITE = '#f3f2ee';

export const UNIFORM_ERAS: Record<string, UniformEra[]> = {
  Jaguars: [
    {
      // (the original look: teal, white numbers trimmed in black and gold, black collar)
      from: 1995,
      to: 2008,
      home: { body: '#006778', num: '#ffffff', outline: '#101820', name: '#ffffff', collar: '#101820', sleeve: 'none' },
      away: { body: WHITE, num: '#006778', outline: '#101820', name: '#006778', collar: '#006778', sleeve: 'none' },
      alt: { body: '#101820', num: '#ffffff', outline: '#006778', name: '#ffffff', collar: '#006778', sleeve: 'none' },
    },
    {
      // (2018 on: teal, black, white; gold trim)
      from: 2018,
      home: { body: '#007487', num: '#ffffff', outline: '#d7a22a', name: '#ffffff', collar: '#d7a22a', sleeve: 'stripes', stripe: '#d7a22a' },
      away: { body: WHITE, num: '#007487', outline: '#d7a22a', name: '#007487', collar: '#d7a22a', sleeve: 'stripes', stripe: '#d7a22a' },
      alt: { body: '#101820', num: '#007487', outline: '#d7a22a', name: '#ffffff', collar: '#d7a22a', sleeve: 'stripes', stripe: '#d7a22a' },
    },
  ],
  Patriots: [
    {
      // (2000-2019: navy, silver numbers outlined red and white; red collar, plain sleeves)
      from: 2000,
      to: 2019,
      home: { body: '#002244', num: '#b0b7bc', outline: '#c60c30', name: '#ffffff', collar: '#c60c30', sleeve: 'none' },
      away: { body: WHITE, num: '#002244', outline: '#c60c30', name: '#002244', collar: '#002244', sleeve: 'none' },
    },
    {
      from: 2020,
      home: { body: '#002244', num: '#ffffff', outline: '#002244', name: '#ffffff', collar: '#002244', sleeve: 'none' },
      away: { body: WHITE, num: '#002244', outline: WHITE, name: '#002244', collar: '#002244', sleeve: 'none' },
    },
  ],
  Chiefs: [
    {
      // (red, white numbers outlined black; white-gold-white sleeve stripes)
      from: 1972,
      home: { body: '#e31837', num: '#ffffff', outline: '#000000', name: '#ffffff', collar: '#ffffff', sleeve: 'stripes', stripe: '#ffffff', stripe2: '#ffb612' },
      away: { body: WHITE, num: '#e31837', outline: '#000000', name: '#e31837', collar: '#e31837', sleeve: 'stripes', stripe: '#e31837', stripe2: '#ffb612' },
    },
  ],
  Broncos: [
    {
      // (the Orange Crush years: orange, white numbers outlined royal blue, blue-white sleeve stripes)
      from: 1968,
      to: 1996,
      home: { body: '#fb4f14', num: '#ffffff', outline: '#002a86', name: '#ffffff', collar: '#002a86', sleeve: 'stripes', stripe: '#002a86', stripe2: '#ffffff' },
      away: { body: WHITE, num: '#fb4f14', outline: '#002a86', name: '#002a86', collar: '#002a86', sleeve: 'stripes', stripe: '#002a86', stripe2: '#fb4f14' },
    },
    {
      // (1997 on: navy, orange numbers outlined white; the orange swoosh at the sides)
      from: 1997,
      home: { body: '#0a2343', num: '#fb4f14', outline: '#ffffff', name: '#ffffff', collar: '#fb4f14', sleeve: 'none' },
      away: { body: WHITE, num: '#0a2343', outline: '#fb4f14', name: '#0a2343', collar: '#0a2343', sleeve: 'none' },
      alt: { body: '#fb4f14', num: '#ffffff', outline: '#0a2343', name: '#ffffff', collar: '#0a2343', sleeve: 'none' },
    },
  ],
  Ravens: [
    {
      from: 1999,
      home: { body: '#241773', num: '#ffffff', outline: '#000000', name: '#ffffff', collar: '#9e7c0c', sleeve: 'stripes', stripe: '#9e7c0c', stripe2: '#000000' },
      away: { body: WHITE, num: '#241773', outline: '#000000', name: '#241773', collar: '#241773', sleeve: 'stripes', stripe: '#241773', stripe2: '#9e7c0c' },
    },
  ],
};

// A kit for one season: the team's era for it, else nothing (the caller falls back to the team-look colors)
export function uniformFor(team: string | undefined, season: number, kit: 'home' | 'away' | 'alt'): KitColors | null {
  const era = (UNIFORM_ERAS[team ?? ''] ?? []).find((e) => season >= e.from && season <= (e.to ?? 9999));
  if (!era) return null;
  return (kit === 'alt' ? era.alt : kit === 'away' ? era.away : era.home) ?? era.home;
}

// ---- A team's helmet: its stripe pattern over the crown (none unless the team has one), the stripe's colors
// (else the team's second color), a fade instead of a solid shell, the facemask's color. A team the table
// doesn't have: a plain shell in its color, a grey mask.
export interface HelmetLook {
  stripe?: 'none' | 'single' | 'double' | 'triple';
  colors?: [string, string?];
  fade?: boolean;
  mask?: string;
}
export const HELMETS: Record<string, HelmetLook> = {
  Jaguars: { stripe: 'none', fade: true, mask: '#3b3f44' }, // black fading to teal, no stripe
  Ravens: { stripe: 'none', mask: '#3b3f44' },
  Chiefs: { stripe: 'triple', colors: ['#ffffff', '#e31837'], mask: '#e8e8e8' },
  Bengals: { stripe: 'none', mask: '#3b3f44' },
  Patriots: { stripe: 'triple', colors: ['#c60c30', '#ffffff'], mask: '#d6d9dc' },
  Packers: { stripe: 'triple', colors: ['#ffffff', '#203731'], mask: '#2a2a2a' },
  Colts: { stripe: 'triple', colors: ['#002c5f', '#ffffff'], mask: '#002c5f' },
  Bears: { stripe: 'triple', colors: ['#c83803', '#ffffff'], mask: '#2a2a2a' },
  Broncos: { stripe: 'single', colors: ['#fb4f14'], mask: '#0a2343' },
  Steelers: { stripe: 'single', colors: ['#ffb612'], mask: '#2a2a2a' },
  Browns: { stripe: 'triple', colors: ['#311d00', '#ffffff'], mask: '#9a9a9a' },
  Bills: { stripe: 'double', colors: ['#c60c30'], mask: '#9aa1a8' },
  Dolphins: { stripe: 'none', mask: '#e9e9e9' },
  Jets: { stripe: 'none', mask: '#e9e9e9' },
  '49ers': { stripe: 'triple', colors: ['#aa0000', '#ffffff'], mask: '#b3995d' },
};

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
