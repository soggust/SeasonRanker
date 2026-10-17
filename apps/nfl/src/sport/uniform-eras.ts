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
// The cut's details (what the splash draws, from behind): `bands` the sleeve stripes top to bottom, `cap` a
// solid sleeve cap in another color instead of stripes, `yoke` a contrasting shoulder block, `panel` a side
// panel, `tv` false for a jersey without TV numbers, `collarStyle` ('stripe' for the classic contrasting
// collar band, 'v' for the Nike-era V collars, else the plain crew), `numberFont` ('varsity' where the numbers
// carry two outlines or a shadow, 'serif' and 'rounded' where the letterforms are).
//
// Sources: Wikipedia ("Logos and uniforms of the <Team>" articles and each team article's "Logos and uniforms"
// section) and its uniform diagrams, the Gridiron Uniform Database (gridiron-uniforms.com), teamcolorcodes.com
// (hex values), team and league uniform-reveal coverage (NFL.com, SportsLogos.net, team sites) for the
// 2020-2026 sets, and the splash audit of 2026-10-16 (scratchpad splash-round2/audit-nfl.json). Trim colors are
// the least certain part: a `?` in a note marks a color or a range the sources didn't settle.
import { KitColors, UniformTable, type FaceTable, withFaces } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee'; // a white jersey's cloth
const W = '#ffffff'; // white numbers, stripes, lettering
const BLACK = '#000000';

// A kit: the jersey, the numbers' fill and trim, the nameplate, the collar, and the sleeve stripes (outer,
// inner) when it has them; block numbers and a crew collar unless the details say otherwise
function kit(body: string, num: string, outline: string, name: string, collar: string, stripe?: string, stripe2?: string): KitColors {
  const k: KitColors = { body, num, outline, name, collar, sleeve: stripe ? 'stripes' : 'none', collarStyle: collar === body ? 'round' : 'stripe', numberFont: 'block' };
  if (stripe) {
    k.stripe = stripe;
    k.bands = stripe2 ? [stripe, stripe2, stripe] : [stripe, stripe];
  }
  if (stripe2) k.stripe2 = stripe2;
  return k;
}
// A kit with its cut's details filled in (a sleeve cap, a yoke, a panel, the bands' order, the fonts)
const d = (k: KitColors, x: Partial<KitColors>): KitColors => ({ ...k, ...x });

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
// Patriots
const NE_NAVY = '#002244';
const NE_RED = '#c60c30';
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

// The Cowboys' Thanksgiving throwback: the 1960-63 double-star navy with white shoulders (stars on them, no
// TV numbers), untrimmed white numbers, plain sleeves
const DAL_THROWBACK = d(kit(DAL_NAVY, W, W, W, W), { yoke: W, tv: false, collarStyle: 'round' });
// The Steelers' black Color Rush (2016 on): gold numbers on black
const PIT_RUSH = d(kit(BLACK, PIT_GOLD, PIT_GOLD, PIT_GOLD, BLACK, PIT_GOLD, BLACK), { numberFont: 'rounded' });

// The lettering (libs/ranker/src/engine/uniform-eras.ts withFaces): the teams whose numbers are their own face
// (the Broncos' from 1997, the Chargers' from 2007, the Jaguars' from 2009, the Packers'), the modern custom
// sets drawn with the nearest face (the Seahawks' and Rams' rounded, the Titans', Falcons', Vikings' and
// 2014-19 Bucs' sharp), the Bengals' plain block from 2021; every other kit keeps the face its era says.
const FACES: FaceTable = {
  Broncos: [[1997, 'broncos']],
  Chargers: [[2007, 'chargers']],
  Jaguars: [[2009, 'jaguars']],
  Packers: 'packers',
  Seahawks: [[2012, 'rounded']],
  Titans: [[2018, 'sharp']],
  Falcons: [[2020, 'sharp']],
  Vikings: [[2013, 'sharp']],
  Rams: [[2020, 'rounded']],
  Bucs: [[2014, 'sharp', 2019]],
  Bengals: [[2021, 'block']],
};

export const UNIFORM_ERAS: UniformTable = withFaces(
  {
  // Logos and uniforms of the San Francisco 49ers (Wikipedia, with its uniform diagram); the 2009 unveiling's
  // coverage (49ers.com "49ers unveil classic uniforms", NBC Bay Area, Bleacher Report): "plain, white player
  // numerals ... exactly like in the old days", the black drop shadow and the black trim dropped from the
  // primary set, three plain white sleeve stripes (two 2017-21, three again from 2022). The 49ers' colors are
  // scarlet, metallic gold and white: black belongs to the 1996-2008 set alone (and to the alternates left out,
  // the black 2015-17 jersey and the 1994 throwbacks from 2018)
  '49ers': [
    {
      from: 2000,
      to: 2008,
      home: d(kit(SF_CARDINAL, W, SF_GOLD, W, SF_CARDINAL, W, BLACK), { numberFont: 'varsity' }),
      away: d(kit(WHITE, SF_CARDINAL, SF_GOLD, SF_CARDINAL, SF_CARDINAL, SF_CARDINAL, BLACK), { numberFont: 'varsity' }),
      note: '1996 set: deep cardinal red, serif numbers with gold trim and a black block shadow, three white sleeve stripes trimmed in black (drawn white-black-white)',
    },
    {
      from: 2009,
      to: 2016,
      home: d(kit(SF_RED, W, W, W, SF_RED, W), { bands: [W, W, W] }),
      away: d(kit(WHITE, SF_RED, SF_RED, SF_RED, SF_RED, SF_RED), { bands: [SF_RED, SF_RED, SF_RED] }),
      note: 'Classic redesign: scarlet, plain white block numbers (no trim, no shadow), three plain white sleeve stripes cut short on the sleeve; no black',
    },
    {
      from: 2017,
      to: 2021,
      home: kit(SF_RED, W, W, W, SF_RED, W),
      away: kit(WHITE, SF_RED, SF_RED, SF_RED, SF_RED, SF_RED),
      note: '2017 tailoring: two thicker sleeve stripes, the rest unchanged',
    },
    {
      from: 2022,
      home: d(kit(SF_RED, W, W, W, SF_RED, W), { bands: [W, W, W] }),
      away: d(kit(WHITE, SF_RED, SF_RED, SF_RED, SF_RED, SF_RED), { bands: [SF_RED, SF_RED, SF_RED] }),
      note: '2022 update: the third sleeve stripe back, the saloon-font wordmark; plain numbers still',
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
      home: kit(BLACK, W, CIN_ORANGE, W, BLACK, CIN_ORANGE, W),
      away: kit(WHITE, BLACK, CIN_ORANGE, BLACK, BLACK, BLACK, CIN_ORANGE),
      note: '1997 set: tiger-striped sleeves (drawn as stripes), leaping-tiger sleeve logo; number trim ?',
    },
    {
      from: 2004,
      to: 2020,
      home: d(kit(BLACK, W, CIN_ORANGE, W, BLACK), { cap: CIN_ORANGE, panel: CIN_ORANGE, tv: false, numberFont: 'varsity', collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, CIN_ORANGE, BLACK, BLACK), { cap: BLACK, panel: BLACK, tv: false, numberFont: 'varsity', collarStyle: 'v' }),
      alt: d(kit(CIN_ORANGE, BLACK, W, BLACK, BLACK), { cap: BLACK, panel: BLACK, tv: false, numberFont: 'varsity', collarStyle: 'v' }),
      note: '2004 set: side panels, tiger-striped sleeve tips (orange on black, black on white and orange; drawn as caps), no TV numbers, numbers with a block shadow; number colors ?',
    },
    {
      from: 2021,
      home: d(kit(BLACK, W, CIN_ORANGE, W, BLACK, CIN_ORANGE), { bands: [CIN_ORANGE], collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, CIN_ORANGE, BLACK, BLACK, BLACK), { bands: [BLACK], collarStyle: 'v' }),
      alt: d(kit(CIN_ORANGE, W, BLACK, W, BLACK, BLACK), { bands: [BLACK], collarStyle: 'v' }),
      note: '2021 set: panels and number shadow dropped, one tiger sleeve stripe, wordmark on the chest; the orange alternate has white numbers trimmed black',
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
      home: d(kit(BUF_NAVY, W, BUF_RED, W, BUF_NAVY), { panel: BUF_RED, piping: ARI_SILVER, collarStyle: 'v' }),
      away: d(kit(WHITE, BUF_ROYAL, BUF_NAVY, BUF_ROYAL, BUF_NAVY), { yoke: BUF_NAVY, panel: BUF_RED, piping: ARI_SILVER, collarStyle: 'v' }),
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
      home: d(kit(DEN_NAVY, W, DEN_ORANGE, W, DEN_NAVY), { panel: DEN_ORANGE }),
      away: d(kit(WHITE, DEN_NAVY, DEN_ORANGE, DEN_NAVY, DEN_NAVY), { panel: DEN_NAVY }),
      alt: d(kit(DEN_ORANGE, DEN_NAVY, W, DEN_NAVY, DEN_NAVY), { panel: DEN_NAVY }),
      note: '1997 set: navy at home, orange side swoosh (drawn as a panel); orange alternate from 2002 (2002 or 2004 ?)',
    },
    {
      from: 2012,
      to: 2023,
      home: d(kit(DEN_ORANGE, DEN_NAVY, W, DEN_NAVY, DEN_NAVY), { panel: DEN_NAVY }),
      away: d(kit(WHITE, DEN_NAVY, DEN_ORANGE, DEN_NAVY, DEN_NAVY), { panel: DEN_NAVY }),
      alt: d(kit(DEN_NAVY, W, DEN_ORANGE, W, DEN_NAVY), { panel: DEN_ORANGE }),
      note: 'Same set, orange made the primary home jersey and navy the alternate',
    },
    {
      from: 2024,
      home: d(kit(DEN_ORANGE24, W, DEN_NAVY, W, DEN_NAVY), { cap: DEN_NAVY, collarStyle: 'v' }),
      away: d(kit(WHITE, DEN_NAVY, DEN_ORANGE24, DEN_NAVY, DEN_NAVY), { cap: DEN_NAVY, collarStyle: 'v' }),
      alt: d(kit(DEN_NAVY, W, DEN_ORANGE24, W, DEN_NAVY), { cap: DEN_ORANGE24, collarStyle: 'v' }),
      note: 'Mile High Collection: sunset orange home, jagged mountain sleeve caps (drawn as solid caps), perforated numbers; number fills/trims ?',
    },
  ],
  // Logos and uniforms of the Cleveland Browns (Wikipedia); gridiron-uniforms.com
  Browns: [
    {
      from: 2000,
      to: 2014,
      home: kit(CLE_BROWN, W, CLE_ORANGE, W, CLE_BROWN, CLE_ORANGE, W),
      away: kit(WHITE, CLE_ORANGE, CLE_BROWN, CLE_ORANGE, CLE_BROWN, CLE_BROWN, CLE_ORANGE),
      note: '1999 return set: orange-white sleeve stripes on brown, brown-orange on white; number trims ? (the white may have had brown numbers trimmed orange, as the 2020 set restored); orange alternate 2002-04 left out',
    },
    {
      from: 2015,
      to: 2019,
      home: d(kit(CLE_BROWN, CLE_ORANGE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_ORANGE, W), { collarStyle: 'v' }),
      away: d(kit(WHITE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_BROWN, CLE_BROWN, CLE_ORANGE), { collarStyle: 'v' }),
      alt: d(kit(CLE_BROWN, CLE_ORANGE, CLE_ORANGE, CLE_ORANGE, CLE_BROWN, CLE_ORANGE), { cap: CLE_ORANGE, collarStyle: 'v' }),
      note: '2015 set: orange numbers, CLEVELAND on the chest; all-brown Color Rush worn from 2018 (primary home 2019); nameplate colors ?',
    },
    {
      from: 2020,
      home: kit(CLE_BROWN, W, W, W, CLE_BROWN, CLE_ORANGE, W),
      away: kit(WHITE, CLE_BROWN, CLE_ORANGE, CLE_BROWN, CLE_BROWN, CLE_BROWN, CLE_ORANGE),
      note: 'Classic look restored, keeping the 2015 number font: white numbers on the brown, brown numbers trimmed orange on the white',
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
      home: d(kit(TB_RED, W, BLACK, W, TB_RED), { numberFont: 'varsity', collarStyle: 'v', piping: TB_PEWTER }),
      away: d(kit(WHITE, TB_RED, BLACK, TB_RED, TB_RED), { numberFont: 'varsity', collarStyle: 'v', piping: TB_PEWTER }),
      alt: d(kit(TB_PEWTER, TB_RED, BLACK, TB_RED, TB_PEWTER), { numberFont: 'varsity', collarStyle: 'v' }),
      note: '2014 set: "alarm clock" numbers with metallic trim, carbon accents; all-pewter Color Rush 2016-19; number trims ?',
    },
    {
      from: 2020,
      home: kit(TB_RED, W, TB_PEWTER, W, TB_RED),
      away: kit(WHITE, TB_RED, TB_PEWTER, TB_RED, TB_RED),
      alt: kit(TB_CREAMSICLE, W, TB_RED, W, W),
      note: '1997 look restored; creamsicle throwback worn yearly from 2023 (alt: white numbers trimmed red; a white creamsicle followed in 2024-25); number trim pewter ?',
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
      home: d(kit(ARI_RED, W, BLACK, W, ARI_RED), { piping: BLACK, collarStyle: 'v' }),
      away: d(kit(WHITE, ARI_RED, BLACK, ARI_RED, ARI_RED), { piping: BLACK, collarStyle: 'v' }),
      alt: d(kit(BLACK, W, ARI_RED, W, BLACK), { piping: ARI_RED, collarStyle: 'v' }),
      note: '2005 set: black returns, trim lines on shoulders and sides; black alternate from 2010 (numbers ?)',
    },
    {
      from: 2023,
      home: d(kit(ARI_RED, W, ARI_SILVER, W, ARI_RED, ARI_SILVER), { bands: [ARI_SILVER], collarStyle: 'v' }),
      away: d(kit(WHITE, ARI_RED, BLACK, ARI_RED, ARI_RED, ARI_RED, ARI_SILVER), { bands: [ARI_RED], collarStyle: 'v' }),
      alt: d(kit(BLACK, ARI_RED, ARI_SILVER, ARI_RED, BLACK, ARI_RED, ARI_SILVER), { bands: [ARI_RED], collarStyle: 'v' }),
      note: '2023 set: ARIZONA on the chest, white numbers trimmed silver, one sleeve stripe (silver on red, red on white and black)',
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
      home: d(kit(LAC_POWDER, W, LAC_GOLD, W, LAC_POWDER), { collarStyle: 'v' }),
      away: d(kit(WHITE, LAC_POWDER, LAC_GOLD, LAC_POWDER, LAC_POWDER), { collarStyle: 'v' }),
      alt: d(kit(LAC_NAVY, W, LAC_GOLD, W, LAC_NAVY), { collarStyle: 'v' }),
      note: '2020 set: powder blue home, white numbers trimmed gold, gold shoulder bolts; navy alternate',
    },
  ],
  // Logos and uniforms of the Kansas City Chiefs (Wikipedia); uni-watch.com uniform history
  Chiefs: [
    {
      from: 2000,
      home: kit(KC_RED, W, W, W, KC_RED, W, KC_GOLD),
      away: kit(WHITE, KC_RED, KC_RED, KC_RED, KC_RED, KC_RED, KC_GOLD),
      note: 'Unchanged set: white-gold-white sleeve stripes on red, red-gold-red on white, untrimmed numbers (confirmed 2026-10-16)',
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
      home: d(kit(WAS_BURGUNDY, WAS_GOLD, W, WAS_GOLD, WAS_BURGUNDY), { collarStyle: 'v' }),
      away: d(kit(WHITE, WAS_BURGUNDY, BLACK, WAS_BURGUNDY, WAS_BURGUNDY), { yoke: WAS_BURGUNDY, cap: WAS_BURGUNDY, piping: W, collarStyle: 'v' }),
      alt: d(kit(BLACK, WAS_GOLD, WAS_BURGUNDY, WAS_GOLD, BLACK), { collarStyle: 'v' }),
      note: 'Commanders set: stenciled gold numbers outlined white on the burgundy, burgundy numbers trimmed black on the white (burgundy yoke and arms with white/black stripes), gold numbers trimmed burgundy on the black alternate',
    },
    {
      from: 2026,
      home: kit(WAS_BURGUNDY, W, WAS_GOLD, W, WAS_BURGUNDY, W, WAS_GOLD),
      away: kit(WHITE, WAS_BURGUNDY, WAS_GOLD, WAS_BURGUNDY, WAS_BURGUNDY, WAS_BURGUNDY, WAS_GOLD),
      alt: kit(BLACK, WAS_BURGUNDY, WAS_GOLD, WAS_BURGUNDY, BLACK),
      note: '2026 set: Super Bowl-era look, white numbers trimmed gold, white-gold cuffs; black "Hail Raiser" alternate with burgundy block numbers outlined gold',
    },
  ],
  // Logos and uniforms of the Dallas Cowboys (Wikipedia); gridiron-uniforms.com
  Cowboys: [
    {
      from: 2000,
      to: 2003,
      home: kit(WHITE, DAL_ROYAL, DAL_NAVY, DAL_ROYAL, DAL_ROYAL, DAL_ROYAL, DAL_NAVY),
      away: kit(DAL_NAVY, W, DAL_SILVER, W, DAL_NAVY, DAL_SILVER, W),
      note: 'White at home (royal numbers trimmed navy); navy road jersey; number trims and stripe colors ?',
    },
    {
      from: 2004,
      to: 2012,
      home: kit(WHITE, DAL_ROYAL, DAL_NAVY, DAL_ROYAL, DAL_ROYAL, DAL_ROYAL, DAL_NAVY),
      away: kit(DAL_NAVY, W, DAL_SILVER, W, DAL_NAVY, DAL_SILVER, W),
      alt: DAL_THROWBACK,
      note: 'The 1960-63 double-star navy throwback worn on Thanksgiving 2004-12 (alt)',
    },
    {
      from: 2013,
      to: 2021,
      home: kit(WHITE, DAL_ROYAL, DAL_NAVY, DAL_ROYAL, DAL_ROYAL, DAL_ROYAL, DAL_NAVY),
      away: kit(DAL_NAVY, W, DAL_SILVER, W, DAL_NAVY, DAL_SILVER, W),
      note: 'One-helmet rule: the throwback shelved; the white Color Rush (2015+) left out',
    },
    {
      from: 2022,
      home: kit(WHITE, DAL_ROYAL, DAL_NAVY, DAL_ROYAL, DAL_ROYAL, DAL_ROYAL, DAL_NAVY),
      away: kit(DAL_NAVY, W, DAL_SILVER, W, DAL_NAVY, DAL_SILVER, W),
      alt: DAL_THROWBACK,
      note: 'The double-star throwback back on Thanksgiving from 2022 (white helmet)',
    },
  ],
  // Logos and uniforms of the Miami Dolphins (Wikipedia); NFL.com 2013 reveal
  Dolphins: [
    {
      from: 2000,
      to: 2012,
      home: d(kit(MIA_AQUA, W, MIA_NAVY, W, MIA_AQUA, MIA_ORANGE, MIA_NAVY), { numberFont: 'varsity' }),
      away: d(kit(WHITE, MIA_AQUA, MIA_NAVY, MIA_AQUA, MIA_AQUA, MIA_AQUA, MIA_ORANGE), { numberFont: 'varsity' }),
      note: '1997 set: aqua with orange and navy trim; often white at home; number trim and stripe colors ?',
    },
    {
      from: 2013,
      home: d(kit(MIA_AQUA, W, MIA_ORANGE, W, MIA_AQUA), { collarStyle: 'v' }),
      away: d(kit(WHITE, MIA_AQUA, MIA_ORANGE, MIA_AQUA, MIA_AQUA), { collarStyle: 'v' }),
      note: '2013 set (and the 2018 tweak): navy dropped, orange trims the numbers, the dolphin on the sleeve and no sleeve stripes; often white at home; 1970s throwbacks left out',
    },
  ],
  // Philadelphia Eagles, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Eagles: [
    {
      from: 2000,
      to: 2002,
      home: d(kit(PHI_GREEN, W, BLACK, W, PHI_GREEN), { numberFont: 'varsity', piping: PHI_SILVER }),
      away: d(kit(WHITE, PHI_GREEN, BLACK, PHI_GREEN, PHI_GREEN), { numberFont: 'varsity', piping: PHI_SILVER }),
      note: '1996 set: midnight green, wing-shaped shoulder trim, numbers with black and silver trim (trim ?)',
    },
    {
      from: 2003,
      to: 2022,
      home: d(kit(PHI_GREEN, W, BLACK, W, PHI_GREEN), { numberFont: 'varsity', piping: PHI_SILVER }),
      away: d(kit(WHITE, PHI_GREEN, BLACK, PHI_GREEN, PHI_GREEN), { numberFont: 'varsity', piping: PHI_SILVER }),
      alt: d(kit(BLACK, W, PHI_GREEN, W, BLACK), { numberFont: 'varsity', piping: PHI_SILVER }),
      note: 'Same set; black alternate from 2003 (its number colors ?)',
    },
    {
      from: 2023,
      home: d(kit(PHI_GREEN, W, BLACK, W, PHI_GREEN), { numberFont: 'varsity', piping: PHI_SILVER }),
      away: d(kit(WHITE, PHI_GREEN, BLACK, PHI_GREEN, PHI_GREEN), { numberFont: 'varsity', piping: PHI_SILVER }),
      alt: kit(PHI_KELLY, W, PHI_SILVER, W, PHI_KELLY),
      note: 'Same set; Kelly green 1990s throwback the regular alternate from 2023 (its trim ?)',
    },
  ],
  // Atlanta Falcons, "Logos and uniforms" (Wikipedia); 2020 and 2026 reveal coverage (atlantafalcons.com, NBC)
  Falcons: [
    {
      from: 2000,
      to: 2002,
      home: kit(BLACK, W, ATL_RED, W, BLACK, ATL_RED, W),
      away: kit(WHITE, BLACK, ATL_RED, BLACK, BLACK, BLACK, ATL_RED),
      note: '1990 set: black with red and white sleeve stripes; trims ?',
    },
    {
      from: 2003,
      to: 2003,
      home: d(kit(BLACK, W, ATL_RED, W, BLACK), { panel: ATL_RED, collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, ATL_RED, BLACK, BLACK), { panel: BLACK, collarStyle: 'v' }),
      alt: d(kit(ATL_RED, W, BLACK, W, ATL_RED), { panel: BLACK, collarStyle: 'v' }),
      note: '2003 set (side panels, no sleeve stripes): black at home its first season, red the alternate',
    },
    {
      from: 2004,
      to: 2019,
      home: d(kit(ATL_RED, W, BLACK, W, ATL_RED), { panel: BLACK, collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, ATL_RED, BLACK, BLACK), { panel: BLACK, collarStyle: 'v' }),
      alt: d(kit(BLACK, W, ATL_RED, W, BLACK), { panel: ATL_RED, collarStyle: 'v' }),
      note: '2003 set with red made the home jersey and black the alternate; 1966 throwbacks left out',
    },
    {
      from: 2020,
      to: 2025,
      home: d(kit(BLACK, W, W, W, BLACK), { collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, BLACK, BLACK, BLACK), { collarStyle: 'v' }),
      alt: d(kit(ATL_RED, W, W, W, ATL_RED), { collarStyle: 'v' }),
      note: '2020 set: ATL across the chest, black home; red-to-black gradient "Rise Up" alternate; number trims ?',
    },
    {
      from: 2026,
      home: kit(ATL_RED, W, BLACK, W, ATL_RED),
      away: kit(WHITE, ATL_RED, BLACK, ATL_RED, ATL_RED),
      alt: kit(BLACK, W, ATL_RED, W, BLACK, W, ATL_RED),
      note: '2026 set: red home with white numbers, white road with red numbers trimmed black; black 1966 throwback (red helmet) the alternate; home trim and alternate stripes ?',
    },
  ],
  // New York Giants, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Giants: [
    {
      from: 2000,
      home: kit(NYG_BLUE, W, W, W, NYG_BLUE),
      away: kit(WHITE, NYG_RED, NYG_BLUE, NYG_BLUE, NYG_BLUE, NYG_RED, NYG_BLUE),
      note: '2000 set (early-1960s style): plain blue home with untrimmed white numbers and plain sleeves; white road with red numbers trimmed blue and red-blue-red sleeve stripes; 1980s "Legacy" blue alternate (2022+) and red alternates left out',
    },
  ],
  // Jacksonville Jaguars, "Logos and uniforms" (Wikipedia); jaguars.com "A journey through 30 years of Jaguars uniforms"
  Jaguars: [
    {
      from: 2000,
      to: 2008,
      home: d(kit(JAX_TEAL, W, BLACK, W, JAX_TEAL), { numberFont: 'varsity' }),
      away: d(kit(WHITE, JAX_TEAL, BLACK, JAX_TEAL, JAX_TEAL), { numberFont: 'varsity' }),
      alt: d(kit(BLACK, W, JAX_TEAL, W, BLACK), { numberFont: 'varsity' }),
      note: '1995 set: teal, numbers trimmed black and gold; black alternate from 2002; trims ?',
    },
    {
      from: 2009,
      to: 2012,
      home: d(kit(JAX_TEAL, W, BLACK, W, JAX_TEAL), { numberFont: 'varsity' }),
      away: d(kit(WHITE, JAX_TEAL, BLACK, JAX_TEAL, JAX_TEAL), { numberFont: 'varsity' }),
      alt: d(kit(BLACK, W, JAX_TEAL, W, BLACK), { numberFont: 'varsity' }),
      note: '2009 set: simplified, new number font; black became the main home jersey in 2012; trims ?',
    },
    {
      from: 2013,
      to: 2017,
      home: d(kit(BLACK, W, JAX_GOLD, W, BLACK), { cap: JAX_TEAL, numberFont: 'varsity', collarStyle: 'v' }),
      away: d(kit(WHITE, JAX_TEAL, JAX_GOLD, JAX_TEAL, JAX_TEAL), { cap: BLACK, numberFont: 'varsity', collarStyle: 'v' }),
      alt: d(kit(JAX_TEAL, W, JAX_GOLD, W, JAX_TEAL), { cap: BLACK, numberFont: 'varsity', collarStyle: 'v' }),
      note: '2013 set: black home with teal sleeves, numbers trimmed teal and gold, two-tone helmet; the sleeves two-tone (drawn as caps); road trim ?',
    },
    {
      from: 2018,
      to: 2020,
      home: d(kit(BLACK, W, W, W, BLACK, JAX_TEAL), { bands: [JAX_TEAL], collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, BLACK, BLACK, BLACK, BLACK), { bands: [BLACK], collarStyle: 'v' }),
      alt: d(kit(JAX_TEAL, W, W, W, JAX_TEAL, BLACK), { bands: [BLACK], collarStyle: 'v' }),
      note: '2018 set: gold dropped, black helmet, black home; untrimmed numbers (white on black and teal, black on white), one contrasting sleeve stripe',
    },
    {
      from: 2021,
      home: d(kit(JAX_TEAL, W, W, W, JAX_TEAL, BLACK), { bands: [BLACK], collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, BLACK, BLACK, BLACK, BLACK), { bands: [BLACK], collarStyle: 'v' }),
      alt: d(kit(BLACK, W, W, W, BLACK, JAX_TEAL), { bands: [JAX_TEAL], collarStyle: 'v' }),
      note: '2018 set with teal made the home jersey (black the alternate); "Prowler" 1995 throwbacks from 2024 left out',
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
      home: d(kit(NYJ_GOTHAM, W, W, W, NYJ_GOTHAM), { collarStyle: 'v' }),
      away: d(kit(WHITE, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM), { collarStyle: 'v' }),
      alt: d(kit(BLACK, W, NYJ_GOTHAM, W, BLACK), { collarStyle: 'v' }),
      note: '2019 set: Gotham green, no sleeve stripes, plain white numbers on the green and plain green on the white (the Wikipedia diagram); black trim only on the black "Stealth" alternate, its white numbers trimmed green',
    },
    {
      from: 2024,
      home: kit(NYJ_GOTHAM, W, W, W, NYJ_GOTHAM, W),
      away: kit(WHITE, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM, NYJ_GOTHAM),
      alt: kit(BLACK, W, NYJ_GOTHAM, W, NYJ_GOTHAM, NYJ_GOTHAM),
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
      alt: kit(BLACK, W, DET_BLUE, W, BLACK),
      note: 'Classic set; black trim and a black alternate 2005-07; trims and sleeve stripes ?',
    },
    {
      from: 2009,
      to: 2016,
      home: d(kit(DET_BLUE, W, BLACK, W, DET_BLUE), { panel: BLACK, numberFont: 'varsity', collarStyle: 'v' }),
      away: d(kit(WHITE, DET_BLUE, BLACK, DET_BLUE, DET_BLUE), { panel: BLACK, numberFont: 'varsity', collarStyle: 'v' }),
      note: '2009 set: new number font trimmed black and silver, side panels, no sleeve stripes; trims ?',
    },
    {
      from: 2017,
      to: 2023,
      home: d(kit(DET_BLUE, W, W, W, DET_BLUE, W, DET_SILVER), { collarStyle: 'v' }),
      away: d(kit(WHITE, DET_BLUE, DET_BLUE, DET_BLUE, DET_BLUE, DET_BLUE, DET_SILVER), { collarStyle: 'v' }),
      note: '2017 set: black dropped, plain numbers, sleeve stripes; Color Rush and gray alternates left out; stripe colors ?',
    },
    {
      from: 2024,
      home: d(kit(DET_BLUE, W, DET_SILVER, W, DET_BLUE, DET_SILVER, W), { bands: [DET_SILVER, W], collarStyle: 'v' }),
      away: d(kit(WHITE, DET_BLUE, DET_SILVER, DET_BLUE, DET_BLUE, DET_BLUE, DET_SILVER), { bands: [DET_BLUE, DET_SILVER], collarStyle: 'v' }),
      alt: d(kit(BLACK, DET_BLUE, DET_SILVER, DET_BLUE, BLACK, DET_BLUE, DET_SILVER), { bands: [DET_BLUE, DET_SILVER], collarStyle: 'v' }),
      note: '2024 set: white numbers trimmed silver, two Mustang-style sleeve stripes (silver and white on blue, blue and silver on white and black); black "Motor City Muscle" alternate with blue numbers trimmed silver',
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
      home: kit(BLACK, W, CAR_BLUE, W, BLACK),
      away: kit(WHITE, BLACK, CAR_BLUE, BLACK, BLACK),
      alt: kit(CAR_BLUE, W, BLACK, W, CAR_BLUE),
      note: '1995 set: black home (white often worn at home), blue alternate from 2002; number trims ?',
    },
    {
      from: 2012,
      home: d(kit(BLACK, W, CAR_BLUE, W, BLACK), { collarStyle: 'v' }),
      away: d(kit(WHITE, BLACK, CAR_BLUE, BLACK, BLACK), { collarStyle: 'v' }),
      alt: d(kit(CAR_BLUE, W, BLACK, W, CAR_BLUE), { collarStyle: 'v' }),
      note: 'Nike-era update with the 2012 logo: brighter blue; the white keeps its black numbers trimmed process blue',
    },
  ],
  // New England Patriots, "Logos and uniforms" (Wikipedia); patriots.com and SportsLogos.net 2020 reveal
  Patriots: [
    {
      from: 2000,
      to: 2019,
      home: d(kit(NE_NAVY, W, NE_RED, W, NE_NAVY), { numberFont: 'varsity', piping: NE_RED }),
      away: d(kit(WHITE, NE_NAVY, NE_RED, NE_NAVY, NE_NAVY), { numberFont: 'varsity', piping: NE_RED }),
      note: '2000 set: navy with red and silver shoulder piping (no sleeve stripes); silver, red throwback and navy Color Rush alternates left out; number trims red (and silver ?)',
    },
    {
      from: 2020,
      home: d(kit(NE_NAVY, W, NE_RED, W, NE_NAVY, NE_RED, W), { collarStyle: 'v' }),
      away: d(kit(WHITE, NE_NAVY, NE_RED, NE_NAVY, NE_NAVY, NE_RED, NE_NAVY), { collarStyle: 'v' }),
      alt: kit(NE_RED, W, NE_NAVY, W, NE_RED, W, NE_NAVY),
      note: '2020 set (Color Rush-based): sleeve stripes, numbers trimmed red/silver; red "Pat Patriot" throwback the alternate from 2022 (its trims ?)',
    },
  ],
  // Las Vegas Raiders, "Logos and uniforms" (Wikipedia); gridiron-uniforms.com
  Raiders: [
    {
      from: 2000,
      home: kit(BLACK, LV_SILVER, LV_SILVER, LV_SILVER, BLACK),
      away: kit(WHITE, BLACK, BLACK, BLACK, BLACK),
      note: 'Unchanged set (Oakland, then Las Vegas from 2020): untrimmed silver numbers on black, untrimmed black numbers on white',
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
      to: 2025,
      home: d(kit(LAR_ROYAL, W, LAR_YELLOW, W, LAR_ROYAL), { collarStyle: 'v' }),
      away: d(kit(LAR_BONE, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL), { collarStyle: 'v' }),
      alt: d(kit(LAR_ROYAL, W, W, W, LAR_ROYAL), { collarStyle: 'v' }),
      note: '2020 set: royal home with numbers fading white to yellow (drawn white trimmed yellow), bone road with royal numbers; royal throwback alt',
    },
    {
      from: 2026,
      home: d(kit(LAR_ROYAL, LAR_YELLOW, LAR_YELLOW, W, LAR_ROYAL), { collarStyle: 'v' }),
      away: d(kit(WHITE, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL), { collarStyle: 'v' }),
      alt: d(kit(LAR_YELLOW, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL, LAR_ROYAL), { collarStyle: 'v' }),
      note: '2026 revision: solid yellow numbers (the gradient dropped), bone replaced by a white road with royal numbers; "Classic Sol" yellow alternate (royal numbers); a "Fearsome White" alternate left out',
    },
  ],
  // Baltimore Ravens, "Logos and uniforms" (Wikipedia); baltimoreravens.com and NFL.com 2026 "Next Flight" reveal
  Ravens: [
    {
      from: 2000,
      to: 2025,
      home: d(kit(BAL_PURPLE, W, BLACK, W, BAL_PURPLE), { numberFont: 'varsity' }),
      away: d(kit(WHITE, BAL_PURPLE, BLACK, BAL_PURPLE, BAL_PURPLE), { numberFont: 'varsity' }),
      alt: d(kit(BLACK, W, BAL_PURPLE, W, BLACK), { numberFont: 'varsity' }),
      note: '1999 set: numbers trimmed black with a gold drop shadow; black alternate from 2004 (its trim ?)',
    },
    {
      from: 2026,
      home: d(kit(BAL_PURPLE, W, BAL_MIDNIGHT, W, BAL_PURPLE), { collarStyle: 'v' }),
      away: d(kit(WHITE, BAL_PURPLE, BAL_MIDNIGHT, BAL_PURPLE, BAL_PURPLE), { collarStyle: 'v' }),
      alt: d(kit(BLACK, W, BAL_MIDNIGHT, W, BLACK), { collarStyle: 'v' }),
      note: 'Next Flight set: gold shadow replaced by a midnight purple stroke, wings on the collars, BALTIMORE on the road chest; alternate trim ?',
    },
  ],
  // New Orleans Saints, "Logos and uniforms" (Wikipedia); SportsLogos.net
  Saints: [
    {
      from: 2000,
      home: kit(BLACK, NO_GOLD, W, NO_GOLD, BLACK),
      away: kit(WHITE, BLACK, NO_GOLD, BLACK, BLACK),
      note: 'Unchanged set: gold numbers trimmed white on black, black numbers trimmed gold on white; often white at home; Color Rush white and 2025 gold alternates left out',
    },
  ],
  // Seattle Seahawks, "Logos and uniforms" (Wikipedia); uni-watch.com Seahawks uniform history
  Seahawks: [
    {
      from: 2000,
      to: 2001,
      home: kit(SEA_ROYAL, W, SEA_GREEN, W, SEA_ROYAL),
      away: kit(WHITE, SEA_ROYAL, SEA_GREEN, SEA_ROYAL, SEA_ROYAL),
      note: 'Original-style royal blue and silver set; number trim (the 1983-2001 forest green, or none ?) and sleeve treatment ?',
    },
    {
      from: 2002,
      to: 2011,
      home: d(kit(SEA_BLUE, W, SEA_NAVY, W, SEA_BLUE), { panel: SEA_NAVY, collarStyle: 'v' }),
      away: d(kit(WHITE, SEA_NAVY, SEA_BLUE, SEA_NAVY, SEA_NAVY), { panel: SEA_NAVY, collarStyle: 'v' }),
      alt: d(kit(SEA_NAVY, W, SEA_BLUE, W, SEA_NAVY), { panel: SEA_BLUE, collarStyle: 'v' }),
      note: '2002 set: "Seahawks blue" home, navy side panels, navy alternate from 2003; trims ?',
    },
    {
      from: 2012,
      home: d(kit(SEA_NAVY, SEA_GREY, SEA_GREEN, SEA_GREY, SEA_NAVY), { collarStyle: 'v', piping: SEA_GREEN }),
      away: d(kit(WHITE, SEA_NAVY, SEA_GREEN, SEA_NAVY, SEA_NAVY), { collarStyle: 'v', piping: SEA_GREEN }),
      note: 'Nike set: college navy with wolf gray numbers trimmed action green, feather trim; Color Rush green and 1990s throwback alternates left out; road trim ?',
    },
  ],
  // Logos and uniforms of the Pittsburgh Steelers (Wikipedia); gridiron-uniforms.com
  Steelers: [
    {
      from: 2000,
      to: 2015,
      home: d(kit(BLACK, W, W, W, BLACK, PIT_GOLD, BLACK), { numberFont: 'rounded' }),
      away: d(kit(WHITE, BLACK, BLACK, BLACK, BLACK, BLACK, PIT_GOLD), { numberFont: 'rounded' }),
      note: 'Unchanged set (1997 number font): untrimmed white numbers on the black, untrimmed black numbers on the white, gold-black-gold sleeve stripes (black-gold-black on the white); throwbacks left out',
    },
    {
      from: 2016,
      home: d(kit(BLACK, W, W, W, BLACK, PIT_GOLD, BLACK), { numberFont: 'rounded' }),
      away: d(kit(WHITE, BLACK, BLACK, BLACK, BLACK, BLACK, PIT_GOLD), { numberFont: 'rounded' }),
      alt: PIT_RUSH,
      note: 'The black Color Rush (gold numbers) the alternate from 2016',
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
      note: 'Original set: deep steel blue with Battle red trim, thick shoulder stripes (not drawn); red alternate',
    },
    {
      from: 2024,
      home: d(kit(HOU_STEEL, W, HOU_RED, W, HOU_STEEL), { collarStyle: 'v' }),
      away: d(kit(WHITE, HOU_STEEL, HOU_RED, HOU_STEEL, HOU_STEEL), { collarStyle: 'v' }),
      alt: d(kit(HOU_RED, W, HOU_STEEL, W, HOU_RED), { collarStyle: 'v' }),
      note: '2024 set: thick shoulder stripes gone, bullhorn sleeve stripe on the road and red jerseys (not drawn); the red has white numbers trimmed steel blue; H-Town Blue Color Rush left out; home number trim ?',
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
      home: d(kit(TEN_NAVY, W, TEN_BLUE, W, TEN_NAVY), { collarStyle: 'v', yoke: TEN_NAVY, piping: TEN_BLUE }),
      away: d(kit(WHITE, TEN_NAVY, TEN_BLUE, TEN_NAVY, TEN_NAVY), { collarStyle: 'v', yoke: TEN_NAVY }),
      alt: d(kit(TEN_BLUE, W, TEN_NAVY, W, TEN_BLUE), { collarStyle: 'v', yoke: TEN_NAVY }),
      note: '2018 set: navy helmet with a sword stripe, navy shoulder yokes, navy home, light blue alternate; Oilers throwbacks 2023-24 left out; trims ?',
    },
    {
      from: 2025,
      to: 2025,
      home: d(kit(TEN_BLUE, W, TEN_NAVY, W, TEN_BLUE), { collarStyle: 'v', yoke: TEN_NAVY }),
      away: d(kit(WHITE, TEN_NAVY, TEN_BLUE, TEN_NAVY, TEN_NAVY), { collarStyle: 'v', yoke: TEN_NAVY }),
      alt: d(kit(TEN_NAVY, W, TEN_BLUE, W, TEN_NAVY), { collarStyle: 'v', yoke: TEN_NAVY, piping: TEN_BLUE }),
      note: '2018 set with light blue promoted to the home jersey',
    },
    {
      from: 2026,
      home: d(kit(TEN_BLUE, W, TEN_RED, W, TEN_BLUE, TEN_RED, W), { bands: [TEN_RED, W, TEN_NAVY] }),
      away: d(kit(WHITE, TEN_BLUE, TEN_RED, TEN_BLUE, TEN_BLUE, TEN_RED, TEN_NAVY), { bands: [TEN_RED, TEN_NAVY, TEN_BLUE] }),
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
      home: d(kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE), { piping: MIN_GOLD, collarStyle: 'v' }),
      away: d(kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE), { piping: MIN_GOLD, collarStyle: 'v' }),
      note: '2006 set: side and sleeve piping instead of stripes; trims ?',
    },
    {
      from: 2013,
      to: 2015,
      home: d(kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE, MIN_GOLD, W), { bands: [MIN_GOLD, W], numberFont: 'varsity', collarStyle: 'v' }),
      away: d(kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE), { bands: [MIN_PURPLE, MIN_GOLD], numberFont: 'varsity', collarStyle: 'v' }),
      note: '2013 set: gold and white cuff stripes, curved-serif numbers; number trim and road stripes ?',
    },
    {
      from: 2016,
      to: 2022,
      home: d(kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE, MIN_GOLD, W), { bands: [MIN_GOLD, W], numberFont: 'varsity', collarStyle: 'v' }),
      away: d(kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE), { bands: [MIN_PURPLE, MIN_GOLD], numberFont: 'varsity', collarStyle: 'v' }),
      alt: d(kit(MIN_PURPLE, MIN_GOLD, MIN_GOLD, MIN_GOLD, MIN_PURPLE), { numberFont: 'varsity', collarStyle: 'v' }),
      note: 'All-purple Color Rush (gold numbers) the alternate, worn about 2016-18 and kept on the books through 2022 ?',
    },
    {
      from: 2023,
      home: d(kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE, MIN_GOLD, W), { bands: [MIN_GOLD, W], numberFont: 'varsity', collarStyle: 'v' }),
      away: d(kit(WHITE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE, MIN_PURPLE, MIN_GOLD, MIN_PURPLE), { bands: [MIN_PURPLE, MIN_GOLD], numberFont: 'varsity', collarStyle: 'v' }),
      alt: kit(MIN_PURPLE, W, MIN_GOLD, W, MIN_PURPLE, W, MIN_GOLD),
      note: 'The 1960s "Classic" throwback (white numbers trimmed gold, gold/white sleeve stripes, matte purple helmet) the alternate from 2023; the all-white Winter Warrior left out',
    },
  ],
  },
  FACES,
);

// (its helmets: helmets.ts)
export { HELMET_ERAS } from './helmets';
