// The NFL's uniform eras, 2000 to today: each team's home, road and main alternate jerseys by major set (a new
// set of colors, a new number font or trim, sleeve stripes added or dropped), not by every tweak. Shapes and
// semantics: libs/ranker/src/engine/uniform-eras.ts. Keyed by team-colors.ts's TEAMS (Commanders covers the
// Redskins and the Washington Football Team; Rams covers St. Louis and Los Angeles).
//
// home is the team's designated primary home jersey (the Cowboys' white; the Dolphins' aqua though they often
// wear white at home), away the road jersey, alt the alternate worn regularly (left out where the alternates
// were one-offs). num = the numbers' fill, outline = their trim (the fill again when untrimmed), name = the
// nameplate, collar = the collar; sleeve 'stripes' with stripe (outer) / stripe2 (inner) when the sleeves are
// striped round.
//
// Sources: Wikipedia ("Logos and uniforms of the <Team>" articles and each team article's "Logos and uniforms"
// section), the Gridiron Uniform Database (gridiron-uniforms.com), teamcolorcodes.com (hex values), team and
// league uniform-reveal coverage (NFL.com, SportsLogos.net, team sites) for the 2020-2026 sets. Trim colors are
// the least certain part: a `?` in a note marks a color or a range the sources didn't settle.
import type { KitColors, UniformTable } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee'; // a white jersey's cloth
const W = '#ffffff'; // white numbers, stripes, lettering

// A kit: the jersey, the numbers' fill and trim, the nameplate, the collar, and the sleeve stripes (outer,
// inner) when it has them
function kit(body: string, num: string, outline: string, name: string, collar: string, stripe?: string, stripe2?: string): KitColors {
  const k: KitColors = { body, num, outline, name, collar, sleeve: stripe ? 'stripes' : 'none' };
  if (stripe) k.stripe = stripe;
  if (stripe2) k.stripe2 = stripe2;
  return k;
}


// 49ers
const SF_CARDINAL = '#8f0d1c';
const SF_RED = '#aa0000';
const SF_GOLD = '#b3995d';
// Bears
const CHI_NAVY = '#0b162a';
const CHI_ORANGE = '#c83803';
// Bengals
const CIN_ORANGE = '#fb4f14';
// Bills
const BUF_ROYAL = '#00338d';
const BUF_NAVY = '#0c2e5a';
const BUF_RED = '#c60c30';
// Broncos
const DEN_NAVY = '#0a2343';
const DEN_ORANGE = '#fb4f14';
const DEN_ORANGE24 = '#fc4c02';
// Browns
const CLE_BROWN = '#311d00';
const CLE_ORANGE = '#ff3c00';
// Bucs
const TB_RED = '#d50a0a';
const TB_PEWTER = '#34302b';
const TB_CREAMSICLE = '#ff7900';
// Cardinals
const ARI_RED = '#97233f';
const ARI_SILVER = '#a5acaf';
// Chargers
const LAC_NAVY = '#0c2340';
const LAC_GOLD = '#ffc20e';
const LAC_POWDER = '#0080c6';
const LAC_THROWBACK = '#6ea8dc';
// Chiefs
const KC_RED = '#e31837';
const KC_GOLD = '#ffb81c';
// Colts
const IND_BLUE = '#002c5f';
// Commanders
const WAS_BURGUNDY = '#5a1414';
const WAS_GOLD = '#ffb612';
// Cowboys
const DAL_NAVY = '#041e42';
const DAL_ROYAL = '#003594';
const DAL_SILVER = '#869397';
// Dolphins
const MIA_AQUA = '#008e97';
const MIA_ORANGE = '#fc4c02';
const MIA_NAVY = '#005778';
// Eagles
const PHI_GREEN = '#004c54';
const PHI_SILVER = '#a5acaf';
const PHI_KELLY = '#2f8a3e';
// Falcons
const ATL_RED = '#a71930';
// Giants
const NYG_BLUE = '#0b2265';
const NYG_RED = '#a71930';
// Jaguars
const JAX_TEAL = '#006778';
const JAX_GOLD = '#d7a22a';
// Jets
const NYJ_HUNTER = '#0c371d';
const NYJ_GOTHAM = '#115740';
// Lions
const DET_BLUE = '#0076b6';
const DET_SILVER = '#b0b7bc';
// Packers
const GB_GREEN = '#203731';
const GB_GOLD = '#ffb612';
// Panthers
const CAR_BLUE = '#0085ca';
const CAR_SILVER = '#bfc0bf';
// Patriots
const NE_NAVY = '#002244';
const NE_RED = '#c60c30';
const NE_SILVER = '#b0b7bc';
// Raiders
const LV_SILVER = '#a5acaf';
// Rams
const LAR_NAVY = '#002244';
const LAR_GOLD = '#b3995d';
const LAR_ROYAL = '#003594';
const LAR_YELLOW = '#ffd100';
const LAR_BONE = '#e3dccb';
// Ravens
const BAL_PURPLE = '#241773';
const BAL_MIDNIGHT = '#1a0f3d';
// Saints
const NO_GOLD = '#d3bc8d';
// Seahawks
const SEA_ROYAL = '#003b80';
const SEA_BLUE = '#4c6fa3';
const SEA_NAVY = '#002244';
const SEA_GREEN = '#69be28';
const SEA_GREY = '#a5acaf';
// Steelers
const PIT_GOLD = '#ffb612';
// Texans
const HOU_STEEL = '#03202f';
const HOU_RED = '#a71930';
// Titans
const TEN_NAVY = '#0c2340';
const TEN_BLUE = '#4b92db';
const TEN_RED = '#c8102e';
// Vikings
const MIN_PURPLE = '#4f2683';
const MIN_GOLD = '#ffc62f';

export const UNIFORM_ERAS: UniformTable = {
  // Logos and uniforms of the San Francisco 49ers (Wikipedia); gridiron-uniforms.com
  '49ers': [
    {
      from: 2000,
      to: 2008,
      home: kit(SF_CARDINAL, W, SF_GOLD, W, SF_CARDINAL, W, '#000000'),
      away: kit(WHITE, SF_CARDINAL, SF_GOLD, SF_CARDINAL, SF_CARDINAL, SF_CARDINAL, '#000000'),
      note: '1996 set: deep cardinal red, serif numbers with gold trim and a black block shadow, sleeve stripes trimmed in black (stripe colors ?)',
    },
    {
      from: 2009,
      home: kit(SF_RED, W, '#000000', W, SF_RED, W, '#000000'),
      away: kit(WHITE, SF_RED, '#000000', SF_RED, SF_RED, SF_RED, '#000000'),
      note: 'Classic redesign: brighter red, truncated sleeve stripes (two from 2017, three again from 2022); number trim black ?; alternates (black 2015-17, 1994 throwbacks 2018+) left out',
    },
  ],
  // Chicago Bears, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Bears: [
    {
      from: 2000,
      home: kit(CHI_NAVY, W, CHI_ORANGE, W, CHI_NAVY, CHI_ORANGE, W),
      away: kit(WHITE, CHI_NAVY, CHI_ORANGE, CHI_NAVY, CHI_NAVY, CHI_NAVY, CHI_ORANGE),
      alt: kit(CHI_ORANGE, CHI_NAVY, W, CHI_NAVY, CHI_NAVY, CHI_NAVY, W),
      note: 'Unchanged set; orange alternate worn 2004-11 and again from 2018 (off some seasons); sleeve stripe order ?',
    },
  ],
  // Logos and uniforms of the Cincinnati Bengals (Wikipedia); gridiron-uniforms.com
  Bengals: [
    {
      from: 2000,
      to: 2003,
      home: kit('#000000', W, CIN_ORANGE, W, '#000000', CIN_ORANGE, W),
      away: kit(WHITE, '#000000', CIN_ORANGE, '#000000', '#000000', '#000000', CIN_ORANGE),
      note: '1997 set: tiger-striped sleeves (drawn as stripes), leaping-tiger sleeve logo; number trim ?',
    },
    {
      from: 2004,
      to: 2020,
      home: kit('#000000', W, CIN_ORANGE, W, '#000000', CIN_ORANGE),
      away: kit(WHITE, '#000000', CIN_ORANGE, '#000000', '#000000', '#000000'),
      alt: kit(CIN_ORANGE, '#000000', W, '#000000', '#000000', '#000000'),
      note: '2004 set: side panels, tiger-striped sleeve tips (orange on black, black on white), numbers with a block shadow; number colors ?',
    },
    {
      from: 2021,
      home: kit('#000000', W, CIN_ORANGE, W, '#000000', CIN_ORANGE),
      away: kit(WHITE, '#000000', CIN_ORANGE, '#000000', '#000000', '#000000'),
      alt: kit(CIN_ORANGE, '#000000', W, '#000000', '#000000', '#000000'),
      note: '2021 set: panels and number shadow dropped, new tiger sleeve stripe, wordmark on the chest; black-jersey number fill/trim ?',
    },
  ],
  // Logos and uniforms of the Buffalo Bills (Wikipedia); gridiron-uniforms.com
  Bills: [
    {
      from: 2000,
      to: 2001,
      home: kit(BUF_ROYAL, W, BUF_RED, W, BUF_ROYAL, W, BUF_RED),
      away: kit(WHITE, BUF_ROYAL, BUF_RED, BUF_ROYAL, BUF_ROYAL, BUF_ROYAL, BUF_RED),
      note: '1984 set (red helmet): royal blue, red and white sleeve stripes; number trim and stripe order ?',
    },
    {
      from: 2002,
      to: 2010,
      home: kit(BUF_NAVY, W, BUF_RED, W, BUF_NAVY),
      away: kit(WHITE, BUF_ROYAL, BUF_NAVY, BUF_ROYAL, BUF_NAVY),
      note: '2002 set: dark blue with red side panels and nickel accents, no sleeve stripes; white jersey has a dark blue yoke and royal numbers; number trims ?',
    },
    {
      from: 2011,
      home: kit(BUF_ROYAL, W, BUF_RED, W, BUF_ROYAL, W, BUF_RED),
      away: kit(WHITE, BUF_ROYAL, BUF_RED, BUF_ROYAL, BUF_ROYAL, BUF_ROYAL, BUF_RED),
      alt: kit(BUF_RED, W, BUF_ROYAL, W, BUF_RED, W, BUF_ROYAL),
      note: 'Royal blue returns (white helmet, shoulder stripes); red Color Rush from 2015; number trim red ?',
    },
  ],
  // Denver Broncos, "Logos and uniforms" (Wikipedia); denverbroncos.com uniform history; 2024 reveal coverage
  Broncos: [
    {
      from: 2000,
      to: 2011,
      home: kit(DEN_NAVY, W, DEN_ORANGE, W, DEN_NAVY),
      away: kit(WHITE, DEN_NAVY, DEN_ORANGE, DEN_NAVY, DEN_NAVY),
      alt: kit(DEN_ORANGE, DEN_NAVY, W, DEN_NAVY, DEN_NAVY),
      note: '1997 set: navy at home, orange side swoosh; orange alternate from 2002 (2002 or 2004 ?)',
    },
    {
      from: 2012,
      to: 2023,
      home: kit(DEN_ORANGE, DEN_NAVY, W, DEN_NAVY, DEN_NAVY),
      away: kit(WHITE, DEN_NAVY, DEN_ORANGE, DEN_NAVY, DEN_NAVY),
      alt: kit(DEN_NAVY, W, DEN_ORANGE, W, DEN_NAVY),
      note: 'Same set, orange made the primary home jersey and navy the alternate',
    },
    {
      from: 2024,
      home: kit(DEN_ORANGE24, W, DEN_NAVY, W, DEN_NAVY),
      away: kit(WHITE, DEN_NAVY, DEN_ORANGE24, DEN_NAVY, DEN_NAVY),
      alt: kit(DEN_NAVY, W, DEN_ORANGE24, W, DEN_NAVY),
      note: 'Mile High Collection: sunset orange home, jagged mountain sleeve caps, perforated numbers; number fills/trims ?',
    },
  ],
  // Logos and uniforms of the Cleveland Browns (Wikipedia); gridiron-uniforms.com
  Browns: [
    {
      from: 2000,
      to: 2014,
      home: kit(CLE_BROWN, W, CLE_ORANGE, W, CLE_BROWN, CLE_ORANGE, W),
      away: kit(WHITE, CLE_ORANGE, CLE_BROWN, CLE_ORANGE, CLE_BROWN, CLE_BROWN, CLE_ORANGE),
      note: '1999 return set: orange-white sleeve stripes on brown, brown-orange on white; number trims ?; orange alternate 2002-04 left out',
    },
    {
      from: 2015,
      to: 2019,
      home: kit(CLE_BROWN, CLE_ORANGE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_ORANGE, W),
      away: kit(WHITE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_BROWN, CLE_BROWN, CLE_ORANGE),
      alt: kit(CLE_BROWN, CLE_ORANGE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_ORANGE),
      note: '2015 set: orange numbers, CLEVELAND on the chest; all-brown Color Rush worn from 2018 (primary home 2019); nameplate colors ?',
    },
    {
      from: 2020,
      home: kit(CLE_BROWN, W, W, W, CLE_BROWN, CLE_ORANGE, W),
      away: kit(WHITE, CLE_ORANGE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_BROWN, CLE_ORANGE),
      note: 'Classic look restored, keeping the 2015 number font; number colors and trims ?',
    },
  ],
  // Tampa Bay Buccaneers, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Bucs: [
    {
      from: 2000,
      to: 2013,
      home: kit(TB_RED, W, TB_PEWTER, W, TB_RED),
      away: kit(WHITE, TB_RED, TB_PEWTER, TB_RED, TB_RED),
      note: '1997 set: red and pewter; number trim pewter ?',
    },
    {
      from: 2014,
      to: 2019,
      home: kit(TB_RED, W, '#000000', W, TB_RED),
      away: kit(WHITE, TB_RED, '#000000', TB_RED, TB_RED),
      alt: kit(TB_PEWTER, TB_RED, '#000000', TB_RED, TB_PEWTER),
      note: '2014 set: "alarm clock" numbers with metallic trim, carbon accents; all-pewter Color Rush 2016-19; number trims ?',
    },
    {
      from: 2020,
      home: kit(TB_RED, W, TB_PEWTER, W, TB_RED),
      away: kit(WHITE, TB_RED, TB_PEWTER, TB_RED, TB_RED),
      alt: kit(TB_CREAMSICLE, TB_RED, W, TB_RED, TB_RED),
      note: '1997 look restored; creamsicle throwback worn yearly from 2023 (alt); number trim pewter ?',
    },
  ],
  // Arizona Cardinals, "Logos and uniforms" (Wikipedia); 2023 reveal coverage
  Cardinals: [
    {
      from: 2000,
      to: 2004,
      home: kit(ARI_RED, W, W, W, ARI_RED),
      away: kit(WHITE, ARI_RED, ARI_RED, ARI_RED, ARI_RED),
      note: '1996-2004 set: black accents dropped, state flag high on the sleeve; trims and sleeve treatment ?',
    },
    {
      from: 2005,
      to: 2022,
      home: kit(ARI_RED, W, '#000000', W, ARI_RED),
      away: kit(WHITE, ARI_RED, '#000000', ARI_RED, ARI_RED),
      alt: kit('#000000', W, ARI_RED, W, '#000000'),
      note: '2005 set: black returns, trim lines on shoulders and sides; black alternate from 2010 (numbers ?)',
    },
    {
      from: 2023,
      home: kit(ARI_RED, W, ARI_SILVER, W, ARI_RED, ARI_SILVER),
      away: kit(WHITE, ARI_RED, '#000000', ARI_RED, ARI_RED, ARI_RED, ARI_SILVER),
      alt: kit('#000000', ARI_RED, ARI_SILVER, ARI_RED, '#000000', ARI_RED, ARI_SILVER),
      note: '2023 set: ARIZONA on the chest, white numbers trimmed silver, silver sleeve stripe',
    },
  ],
  // Los Angeles Chargers, "Logos and uniforms" (Wikipedia); chargers.com uniform history
  Chargers: [
    {
      from: 2000,
      to: 2006,
      home: kit(LAC_NAVY, W, LAC_GOLD, W, LAC_NAVY),
      away: kit(WHITE, LAC_NAVY, LAC_GOLD, LAC_NAVY, LAC_NAVY),
      alt: kit(LAC_THROWBACK, W, LAC_NAVY, W, LAC_THROWBACK),
      note: '1988 set: navy with shoulder bolts; powder blue throwback alternate 2002-06 (its colors ?); number trim gold ?',
    },
    {
      from: 2007,
      to: 2019,
      home: kit(LAC_NAVY, W, LAC_GOLD, W, LAC_NAVY),
      away: kit(WHITE, LAC_NAVY, LAC_GOLD, LAC_NAVY, LAC_NAVY),
      alt: kit(LAC_POWDER, W, LAC_NAVY, W, LAC_POWDER),
      note: '2007 set: new bolt and number font, powder blue the alternate; number trims ?',
    },
    {
      from: 2020,
      home: kit(LAC_POWDER, W, LAC_GOLD, W, LAC_POWDER),
      away: kit(WHITE, LAC_POWDER, LAC_GOLD, LAC_POWDER, LAC_POWDER),
      alt: kit(LAC_NAVY, W, LAC_GOLD, W, LAC_NAVY),
      note: '2020 set: powder blue home, white numbers trimmed gold, gold shoulder bolts; navy alternate',
    },
  ],
  // Logos and uniforms of the Kansas City Chiefs (Wikipedia); uni-watch.com uniform history
  Chiefs: [
    {
      from: 2000,
      home: kit(KC_RED, W, W, W, KC_RED, W, KC_GOLD),
      away: kit(WHITE, KC_RED, KC_RED, KC_RED, KC_RED, KC_RED, KC_GOLD),
      note: 'Unchanged set: white-gold-white sleeve stripes on red, red-gold-red on white; number trim ?',
    },
  ],
  // Indianapolis Colts, "Logos and uniforms" (Wikipedia); colts.com
  Colts: [
    {
      from: 2000,
      home: kit(IND_BLUE, W, W, W, IND_BLUE, W),
      away: kit(WHITE, IND_BLUE, IND_BLUE, IND_BLUE, IND_BLUE, IND_BLUE),
      note: 'Unchanged set: two shoulder stripes, untrimmed numbers (1950s-style number font from 2020); black "Indiana Nights" alternate from 2023 left out; stripes drawn as sleeve stripes ?',
    },
  ],
  // Washington Commanders, "Logos and uniforms" (Wikipedia); 2022 and 2026 reveal coverage (SportsLogos.net, commanders.com)
  Commanders: [
    {
      from: 2000,
      to: 2021,
      home: kit(WAS_BURGUNDY, W, WAS_GOLD, W, WAS_BURGUNDY, W, WAS_GOLD),
      away: kit(WHITE, WAS_BURGUNDY, WAS_GOLD, WAS_BURGUNDY, WAS_BURGUNDY, WAS_BURGUNDY, WAS_GOLD),
      note: 'Redskins set (1979 design), worn as the Washington Football Team 2020-21; they often wore white at home; stripe order ?',
    },
    {
      from: 2022,
      to: 2025,
      home: kit(WAS_BURGUNDY, WAS_GOLD, WAS_GOLD, WAS_GOLD, WAS_BURGUNDY),
      away: kit(WHITE, WAS_BURGUNDY, WAS_BURGUNDY, WAS_BURGUNDY, WAS_BURGUNDY),
      alt: kit('#000000', WAS_BURGUNDY, WAS_GOLD, WAS_BURGUNDY, '#000000'),
      note: 'Commanders set: stenciled numbers, no sleeve stripes, black alternate; number colors and trims ?',
    },
    {
      from: 2026,
      home: kit(WAS_BURGUNDY, W, WAS_GOLD, W, WAS_BURGUNDY, W, WAS_GOLD),
      away: kit(WHITE, WAS_BURGUNDY, WAS_GOLD, WAS_BURGUNDY, WAS_BURGUNDY, WAS_BURGUNDY, WAS_GOLD),
      alt: kit('#000000', WAS_BURGUNDY, WAS_GOLD, WAS_BURGUNDY, '#000000'),
      note: '2026 set: Super Bowl-era look, white numbers trimmed gold, white-gold cuffs; black "Hail Raiser" alternate (trim ?)',
    },
  ],
  // Logos and uniforms of the Dallas Cowboys (Wikipedia); gridiron-uniforms.com
  Cowboys: [
    {
      from: 2000,
      home: kit(WHITE, DAL_ROYAL, DAL_NAVY, DAL_ROYAL, DAL_ROYAL, DAL_ROYAL, DAL_NAVY),
      away: kit(DAL_NAVY, W, DAL_SILVER, W, DAL_NAVY, DAL_SILVER, W),
      alt: kit(DAL_ROYAL, W, W, W, DAL_ROYAL, W),
      note: 'White at home; navy road jersey; royal 1960s throwback worn on Thanksgiving (alt); number trims and stripe colors ?',
    },
  ],
  // Logos and uniforms of the Miami Dolphins (Wikipedia); NFL.com 2013 reveal
  Dolphins: [
    {
      from: 2000,
      to: 2012,
      home: kit(MIA_AQUA, W, MIA_NAVY, W, MIA_AQUA, MIA_ORANGE, MIA_NAVY),
      away: kit(WHITE, MIA_AQUA, MIA_NAVY, MIA_AQUA, MIA_AQUA, MIA_AQUA, MIA_ORANGE),
      note: '1997 set: aqua with orange and navy trim; often white at home; number trim and stripe colors ?',
    },
    {
      from: 2013,
      home: kit(MIA_AQUA, W, MIA_ORANGE, W, MIA_AQUA, MIA_ORANGE, W),
      away: kit(WHITE, MIA_AQUA, MIA_ORANGE, MIA_AQUA, MIA_AQUA, MIA_AQUA, MIA_ORANGE),
      note: '2013 set: navy dropped, orange trims the numbers and stripes; often white at home; 1970s throwbacks left out; stripe colors ?',
    },
  ],
  // Philadelphia Eagles, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Eagles: [
    {
      from: 2000,
      to: 2002,
      home: kit(PHI_GREEN, W, '#000000', W, PHI_GREEN),
      away: kit(WHITE, PHI_GREEN, '#000000', PHI_GREEN, PHI_GREEN),
      note: '1996 set: midnight green, wing-shaped shoulder trim, numbers with black and silver trim (trim ?)',
    },
    {
      from: 2003,
      to: 2022,
      home: kit(PHI_GREEN, W, '#000000', W, PHI_GREEN),
      away: kit(WHITE, PHI_GREEN, '#000000', PHI_GREEN, PHI_GREEN),
      alt: kit('#000000', W, PHI_GREEN, W, '#000000'),
      note: 'Same set; black alternate from 2003 (its number colors ?)',
    },
    {
      from: 2023,
      home: kit(PHI_GREEN, W, '#000000', W, PHI_GREEN),
      away: kit(WHITE, PHI_GREEN, '#000000', PHI_GREEN, PHI_GREEN),
      alt: kit(PHI_KELLY, W, PHI_SILVER, W, PHI_KELLY),
      note: 'Same set; Kelly green 1990s throwback the regular alternate from 2023 (its trim ?)',
    },
  ],
  // Atlanta Falcons, "Logos and uniforms" (Wikipedia); 2020 and 2026 reveal coverage (atlantafalcons.com, NBC)
  Falcons: [
    {
      from: 2000,
      to: 2002,
      home: kit('#000000', W, ATL_RED, W, '#000000', ATL_RED, W),
      away: kit(WHITE, '#000000', ATL_RED, '#000000', '#000000', '#000000', ATL_RED),
      note: '1990 set: black with red and white sleeve stripes; trims ?',
    },
    {
      from: 2003,
      to: 2003,
      home: kit('#000000', W, ATL_RED, W, '#000000'),
      away: kit(WHITE, '#000000', ATL_RED, '#000000', '#000000'),
      alt: kit(ATL_RED, W, '#000000', W, ATL_RED),
      note: '2003 set (side panels, no sleeve stripes): black at home its first season, red the alternate',
    },
    {
      from: 2004,
      to: 2019,
      home: kit(ATL_RED, W, '#000000', W, ATL_RED),
      away: kit(WHITE, '#000000', ATL_RED, '#000000', '#000000'),
      alt: kit('#000000', W, ATL_RED, W, '#000000'),
      note: '2003 set with red made the home jersey and black the alternate; 1966 throwbacks left out',
    },
    {
      from: 2020,
      to: 2025,
      home: kit('#000000', W, W, W, '#000000'),
      away: kit(WHITE, '#000000', '#000000', '#000000', '#000000'),
      alt: kit(ATL_RED, W, W, W, ATL_RED),
      note: '2020 set: ATL across the chest, black home; red-to-black gradient "Rise Up" alternate; number trims ?',
    },
    {
      from: 2026,
      home: kit(ATL_RED, W, '#000000', W, ATL_RED),
      away: kit(WHITE, ATL_RED, '#000000', ATL_RED, ATL_RED),
      alt: kit('#000000', W, ATL_RED, W, '#000000', W, ATL_RED),
      note: '2026 set: red home with white numbers, white road with red numbers trimmed black; black 1966 throwback (red helmet) the alternate; home trim and alternate stripes ?',
    },
  ],
  // New York Giants, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Giants: [
    {
      from: 2000,
      home: kit(NYG_BLUE, W, NYG_RED, W, NYG_BLUE, W, NYG_RED),
      away: kit(WHITE, NYG_BLUE, NYG_RED, NYG_BLUE, NYG_BLUE, NYG_RED, NYG_BLUE),
      note: '2000 set (1950s-style): blue home, red-trimmed numbers, striped sleeves; stripe order ?; 1980s "Legacy" blue alternate (2022+) and red alternates left out',
    },
  ],
  // Jacksonville Jaguars, "Logos and uniforms" (Wikipedia); jaguars.com "A journey through 30 years of Jaguars uniforms"
  Jaguars: [
    {
      from: 2000,
      to: 2008,
      home: kit(JAX_TEAL, W, '#000000', W, JAX_TEAL),
      away: kit(WHITE, JAX_TEAL, '#000000', JAX_TEAL, JAX_TEAL),
      alt: kit('#000000', W, JAX_TEAL, W, '#000000'),
      note: '1995 set: teal, numbers trimmed black and gold; black alternate from 2002; trims ?',
    },
    {
      from: 2009,
      to: 2012,
      home: kit(JAX_TEAL, W, '#000000', W, JAX_TEAL),
      away: kit(WHITE, JAX_TEAL, '#000000', JAX_TEAL, JAX_TEAL),
      alt: kit('#000000', W, JAX_TEAL, W, '#000000'),
      note: '2009 set: simplified, new number font; black became the main home jersey in 2012; trims ?',
    },
    {
      from: 2013,
      to: 2017,
      home: kit('#000000', W, JAX_GOLD, W, '#000000'),
      away: kit(WHITE, JAX_TEAL, JAX_GOLD, JAX_TEAL, JAX_TEAL),
      alt: kit(JAX_TEAL, W, JAX_GOLD, W, JAX_TEAL),
      note: '2013 set: black home with teal sleeves, numbers trimmed teal and gold, two-tone helmet; sleeves left plain (two-tone, not striped); road trim ?',
    },
    {
      from: 2018,
      to: 2020,
      home: kit('#000000', W, JAX_TEAL, W, '#000000'),
      away: kit(WHITE, JAX_TEAL, '#000000', JAX_TEAL, JAX_TEAL),
      alt: kit(JAX_TEAL, W, '#000000', W, JAX_TEAL),
      note: '2018 set: gold dropped, black helmet, black home; number trims ?',
    },
    {
      from: 2021,
      home: kit(JAX_TEAL, W, '#000000', W, JAX_TEAL),
      away: kit(WHITE, JAX_TEAL, '#000000', JAX_TEAL, JAX_TEAL),
      alt: kit('#000000', W, JAX_TEAL, W, '#000000'),
      note: '2018 set with teal made the home jersey (black the alternate); "Prowler" 1995 throwbacks from 2024 left out; trims ?',
    },
  ],
  // Logos and uniforms of the New York Jets (Wikipedia); 2019 and 2024 reveal coverage (newyorkjets.com, SportsLogos.net)
  Jets: [
    {
      from: 2000,
      to: 2018,
      home: kit(NYJ_HUNTER, W, W, W, NYJ_HUNTER, W),
      away: kit(WHITE, NYJ_HUNTER, NYJ_HUNTER, NYJ_HUNTER, NYJ_HUNTER, NYJ_HUNTER),
      note: '1998 set (1960s style): hunter green, plain numbers, sleeve stripes',
    },
    {
      from: 2019,
      to: 2023,
      home: kit(NYJ_GOTHAM, W, '#000000', W, NYJ_GOTHAM),
      away: kit(WHITE, NYJ_GOTHAM, '#000000', NYJ_GOTHAM, NYJ_GOTHAM),
      alt: kit('#000000', W, NYJ_GOTHAM, W, '#000000'),
      note: '2019 set: Gotham green, no sleeve stripes, black "Stealth" alternate; number trims ?',
    },
    {
      from: 2024,
      home: kit(NYJ_GOTHAM, W, W, W, NYJ_GOTHAM, W),
      away: kit(WHITE, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM),
      alt: kit('#000000', W, NYJ_GOTHAM, W, NYJ_GOTHAM, NYJ_GOTHAM),
      note: 'Legacy Collection (1978-89 design in Gotham/"Legacy" green): double shoulder stripes; black alternate with white numbers trimmed green',
    },
  ],
  // Detroit Lions, "Logos and uniforms" (Wikipedia); 2024 reveal coverage (NFL.com, ESPN, SportsLogos.net)
  Lions: [
    {
      from: 2000,
      to: 2008,
      home: kit(DET_BLUE, W, DET_SILVER, W, DET_BLUE, W),
      away: kit(WHITE, DET_BLUE, DET_SILVER, DET_BLUE, DET_BLUE, DET_BLUE),
      alt: kit('#000000', W, DET_BLUE, W, '#000000'),
      note: 'Classic set; black trim and a black alternate 2005-07; trims and sleeve stripes ?',
    },
    {
      from: 2009,
      to: 2016,
      home: kit(DET_BLUE, W, '#000000', W, DET_BLUE),
      away: kit(WHITE, DET_BLUE, '#000000', DET_BLUE, DET_BLUE),
      note: '2009 set: new number font trimmed black and silver, side panels, no sleeve stripes; trims ?',
    },
    {
      from: 2017,
      to: 2023,
      home: kit(DET_BLUE, W, W, W, DET_BLUE, W, DET_SILVER),
      away: kit(WHITE, DET_BLUE, DET_BLUE, DET_BLUE, DET_BLUE, DET_BLUE, DET_SILVER),
      note: '2017 set: black dropped, plain numbers, sleeve stripes; Color Rush and gray alternates left out; stripe colors ?',
    },
    {
      from: 2024,
      home: kit(DET_BLUE, W, DET_SILVER, W, DET_BLUE),
      away: kit(WHITE, DET_BLUE, DET_SILVER, DET_BLUE, DET_BLUE),
      alt: kit('#000000', DET_BLUE, DET_SILVER, DET_BLUE, '#000000'),
      note: '2024 set: white numbers trimmed silver, black "Motor City Muscle" alternate with blue numbers trimmed silver; sleeve treatment ?',
    },
  ],
  // Green Bay Packers, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Packers: [
    {
      from: 2000,
      home: kit(GB_GREEN, W, W, W, GB_GREEN, GB_GOLD, W),
      away: kit(WHITE, GB_GREEN, GB_GREEN, GB_GREEN, GB_GREEN, GB_GREEN, GB_GOLD),
      note: 'Unchanged set: striped sleeves, plain numbers; occasional throwbacks left out; stripe order ?',
    },
  ],
  // Carolina Panthers, "Logos and uniforms" (Wikipedia); SportsLogos.net
  Panthers: [
    {
      from: 2000,
      to: 2011,
      home: kit('#000000', W, CAR_BLUE, W, '#000000'),
      away: kit(WHITE, '#000000', CAR_BLUE, '#000000', '#000000'),
      alt: kit(CAR_BLUE, W, '#000000', W, CAR_BLUE),
      note: '1995 set: black home (white often worn at home), blue alternate from 2002; number trims ?',
    },
    {
      from: 2012,
      home: kit('#000000', W, CAR_BLUE, W, '#000000'),
      away: kit(WHITE, CAR_BLUE, CAR_SILVER, CAR_BLUE, CAR_BLUE),
      alt: kit(CAR_BLUE, W, '#000000', W, CAR_BLUE),
      note: 'Nike-era update with the 2012 logo: brighter blue; sources say the jerseys changed little; number colors and trims ?',
    },
  ],
  // New England Patriots, "Logos and uniforms" (Wikipedia); patriots.com and SportsLogos.net 2020 reveal
  Patriots: [
    {
      from: 2000,
      to: 2019,
      home: kit(NE_NAVY, W, NE_RED, W, NE_NAVY),
      away: kit(WHITE, NE_NAVY, NE_RED, NE_NAVY, NE_NAVY),
      note: '2000 set: navy with red and silver shoulder piping (no sleeve stripes); silver, red throwback and navy Color Rush alternates left out; number trims red (and silver ?)',
    },
    {
      from: 2020,
      home: kit(NE_NAVY, W, NE_RED, W, NE_NAVY, NE_RED, W),
      away: kit(WHITE, NE_NAVY, NE_RED, NE_NAVY, NE_NAVY, NE_RED, NE_NAVY),
      alt: kit(NE_RED, W, NE_NAVY, W, NE_RED, W, NE_NAVY),
      note: '2020 set (Color Rush-based): sleeve stripes, numbers trimmed red/silver; red "Pat Patriot" throwback the alternate from 2022 (its trims ?)',
    },
  ],
  // Las Vegas Raiders, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Raiders: [
    {
      from: 2000,
      home: kit('#000000', LV_SILVER, W, LV_SILVER, '#000000'),
      away: kit(WHITE, '#000000', LV_SILVER, '#000000', '#000000'),
      note: 'Unchanged set (Oakland, then Las Vegas from 2020): silver numbers trimmed white on black',
    },
  ],
  // Los Angeles Rams, "Logos and uniforms" (Wikipedia); therams.com and NFL.com 2020 reveal; SportsLogos.net
  Rams: [
    {
      from: 2000,
      to: 2017,
      home: kit(LAR_NAVY, W, LAR_GOLD, W, LAR_NAVY),
      away: kit(WHITE, LAR_NAVY, LAR_GOLD, LAR_NAVY, LAR_NAVY),
      note: '2000 set: navy and metallic gold (St. Louis, then LA from 2016); royal throwbacks left out; number trims ?',
    },
    {
      from: 2018,
      to: 2019,
      home: kit(LAR_ROYAL, W, W, W, LAR_ROYAL),
      away: kit(WHITE, LAR_NAVY, LAR_GOLD, LAR_NAVY, LAR_NAVY),
      note: 'Royal and yellow throwback (yellow shoulder horns) replaced the navy as the home jersey; road stayed navy/gold; horns not drawn',
    },
    {
      from: 2020,
      home: kit(LAR_ROYAL, W, LAR_YELLOW, W, LAR_ROYAL),
      away: kit(LAR_BONE, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL),
      alt: kit(LAR_ROYAL, W, W, W, LAR_ROYAL),
      note: '2020 set: royal home with numbers fading white to yellow (drawn white trimmed yellow; gradient dropped in 2026), bone road with royal numbers; royal throwback alt',
    },
  ],
  // Baltimore Ravens, "Logos and uniforms" (Wikipedia); baltimoreravens.com and NFL.com 2026 "Next Flight" reveal
  Ravens: [
    {
      from: 2000,
      to: 2025,
      home: kit(BAL_PURPLE, W, '#000000', W, BAL_PURPLE),
      away: kit(WHITE, BAL_PURPLE, '#000000', BAL_PURPLE, BAL_PURPLE),
      alt: kit('#000000', W, BAL_PURPLE, W, '#000000'),
      note: '1999 set: numbers trimmed black with a gold drop shadow; black alternate from 2004 (its trim ?)',
    },
    {
      from: 2026,
      home: kit(BAL_PURPLE, W, BAL_MIDNIGHT, W, BAL_PURPLE),
      away: kit(WHITE, BAL_PURPLE, BAL_MIDNIGHT, BAL_PURPLE, BAL_PURPLE),
      alt: kit('#000000', W, BAL_MIDNIGHT, W, '#000000'),
      note: 'Next Flight set: gold shadow replaced by a midnight purple stroke, wings on the collars, BALTIMORE on the road chest; alternate trim ?',
    },
  ],
  // New Orleans Saints, "Logos and uniforms" (Wikipedia); SportsLogos.net
  Saints: [
    {
      from: 2000,
      home: kit('#000000', NO_GOLD, W, NO_GOLD, '#000000'),
      away: kit(WHITE, NO_GOLD, '#000000', NO_GOLD, '#000000'),
      note: 'Unchanged set: gold numbers trimmed white on black, trimmed black on white; often white at home; Color Rush white and 2025 gold alternates left out',
    },
  ],
  // Seattle Seahawks, "Logos and uniforms" (Wikipedia); uni-watch.com Seahawks uniform history
  Seahawks: [
    {
      from: 2000,
      to: 2001,
      home: kit(SEA_ROYAL, W, SEA_GREEN, W, SEA_ROYAL),
      away: kit(WHITE, SEA_ROYAL, SEA_GREEN, SEA_ROYAL, SEA_ROYAL),
      note: 'Original-style royal blue and silver set; number trim and sleeve treatment ?',
    },
    {
      from: 2002,
      to: 2011,
      home: kit(SEA_BLUE, W, SEA_NAVY, W, SEA_BLUE),
      away: kit(WHITE, SEA_NAVY, SEA_BLUE, SEA_NAVY, SEA_NAVY),
      alt: kit(SEA_NAVY, W, SEA_BLUE, W, SEA_NAVY),
      note: '2002 set: "Seahawks blue" home, navy alternate from 2003; trims ?',
    },
    {
      from: 2012,
      home: kit(SEA_NAVY, SEA_GREY, SEA_GREEN, SEA_GREY, SEA_NAVY),
      away: kit(WHITE, SEA_NAVY, SEA_GREEN, SEA_NAVY, SEA_NAVY),
      note: 'Nike set: college navy with wolf gray numbers trimmed action green, feather trim; Color Rush green and 1990s throwback alternates left out; road trim ?',
    },
  ],
  // Pittsburgh Steelers, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Steelers: [
    {
      from: 2000,
      home: kit('#000000', PIT_GOLD, PIT_GOLD, PIT_GOLD, '#000000', PIT_GOLD),
      away: kit(WHITE, '#000000', PIT_GOLD, '#000000', '#000000', '#000000', PIT_GOLD),
      note: 'Unchanged set (1997 number font); throwbacks left out; sleeve stripes and the road number trim ?',
    },
  ],
  // Houston Texans, "Logos and uniforms" (Wikipedia); houstontexans.com and NFL.com 2024 reveal
  Texans: [
    {
      from: 2002,
      to: 2023,
      home: kit(HOU_STEEL, W, HOU_RED, W, HOU_STEEL),
      away: kit(WHITE, HOU_STEEL, HOU_RED, HOU_STEEL, HOU_STEEL),
      alt: kit(HOU_RED, W, HOU_STEEL, W, HOU_RED),
      note: 'Original set: deep steel blue with Battle red trim; red alternate',
    },
    {
      from: 2024,
      home: kit(HOU_STEEL, W, HOU_RED, W, HOU_STEEL),
      away: kit(WHITE, HOU_STEEL, HOU_RED, HOU_STEEL, HOU_STEEL),
      alt: kit(HOU_RED, HOU_STEEL, W, HOU_STEEL, HOU_RED),
      note: '2024 set: thick shoulder stripes gone, bullhorn sleeve stripe on the road and red jerseys (not drawn); H-Town Blue Color Rush left out; home number trim ?',
    },
  ],
  // Tennessee Titans, "Logos and uniforms" (Wikipedia); tennesseetitans.com, NFL.com, SportsLogos.net (2018, 2025, 2026)
  Titans: [
    {
      from: 2000,
      to: 2007,
      home: kit(TEN_NAVY, W, TEN_BLUE, W, TEN_NAVY),
      away: kit(WHITE, TEN_NAVY, TEN_BLUE, TEN_NAVY, TEN_NAVY),
      alt: kit(TEN_BLUE, W, TEN_NAVY, W, TEN_BLUE),
      note: '1999 set: navy home, light blue alternate from 2003; trims ?',
    },
    {
      from: 2008,
      to: 2017,
      home: kit(TEN_BLUE, W, TEN_NAVY, W, TEN_BLUE),
      away: kit(WHITE, TEN_NAVY, TEN_BLUE, TEN_NAVY, TEN_NAVY),
      alt: kit(TEN_NAVY, W, TEN_BLUE, W, TEN_NAVY),
      note: 'Same set with light blue the main home jersey (from 2008 or 2009 ?, to 2013 or 2015 ?)',
    },
    {
      from: 2018,
      to: 2024,
      home: kit(TEN_NAVY, W, TEN_BLUE, W, TEN_NAVY),
      away: kit(WHITE, TEN_NAVY, TEN_BLUE, TEN_NAVY, TEN_NAVY),
      alt: kit(TEN_BLUE, W, TEN_NAVY, W, TEN_BLUE),
      note: '2018 set: navy helmet with a sword stripe, navy home, light blue alternate; Oilers throwbacks 2023-24 left out; trims ?',
    },
    {
      from: 2025,
      to: 2025,
      home: kit(TEN_BLUE, W, TEN_NAVY, W, TEN_BLUE),
      away: kit(WHITE, TEN_NAVY, TEN_BLUE, TEN_NAVY, TEN_NAVY),
      alt: kit(TEN_NAVY, W, TEN_BLUE, W, TEN_NAVY),
      note: '2018 set with light blue promoted to the home jersey',
    },
    {
      from: 2026,
      home: kit(TEN_BLUE, W, TEN_RED, W, TEN_BLUE, TEN_RED, W),
      away: kit(WHITE, TEN_BLUE, TEN_RED, TEN_BLUE, TEN_BLUE, TEN_RED, TEN_NAVY),
      note: '2026 set (Oilers roots): light blue home, white numbers trimmed red, "6-String" red/white/navy/light blue sleeve stripes; road numbers and stripe order ?',
    },
  ],
  // Minnesota Vikings, "Logos and uniforms" (Wikipedia); SportsLogos.net 2013 reveal
  Vikings: [
    {
      from: 2000,
      to: 2005,
      home: kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE, W, MIN_GOLD),
      away: kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE, MIN_PURPLE, MIN_GOLD),
      note: 'Classic set: striped sleeves; number trim and stripe order ?',
    },
    {
      from: 2006,
      to: 2012,
      home: kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE),
      away: kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE),
      note: '2006 set: side and sleeve piping instead of stripes; trims ?',
    },
    {
      from: 2013,
      home: kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE, MIN_GOLD, W),
      away: kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE),
      alt: kit(MIN_PURPLE, MIN_GOLD, MIN_GOLD, MIN_GOLD, MIN_PURPLE),
      note: '2013 set: gold and white cuff stripes, curved-serif numbers; all-purple Color Rush (gold numbers) the alternate; number trim and road stripes ?',
    },
  ],
};

// (its helmets: helmets.ts)
export { HELMET_ERAS } from './helmets';
