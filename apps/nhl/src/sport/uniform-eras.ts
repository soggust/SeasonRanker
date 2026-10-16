// The NHL's uniforms, season by season (seasons named by the year they end in: 2009 = 2008-09): each team's
// home (dark, the NHL's home convention since 2003-04), road (white) and main alternate jersey in each era, from
// the site's first NHL season (2009) to today. Shapes and semantics: libs/ranker/src/engine/uniform-eras.ts.
// Keyed by team-colors.ts's TEAMS, where a code is a team name, not a franchise: PHX (2009-2014) then ARI
// (2015-2024), ATL (2009-2011) then WPG (2012 on), UTA from 2025, SEA from 2022, VGK from 2018.
//
// One era per major redesign or per change of the regular third jersey; one-game specials (Winter Classic,
// Stadium Series, Heritage Classic) and the two Reverse Retro rounds (2021, 2023) and the 2027 Hometown Remix
// round are left out. A `?` in `note` marks a color or a range the sources didn't settle (most often the
// numbers' trim, which the written sources rarely give).
//
// Sources: the English Wikipedia team articles' logo/uniform sections (read 2026-10-15); the NHL Uniform
// Database (nhluniforms.com) team pages for the Lightning and the Wild; SportsLogos.net's "All the new NHL
// uniforms for 2025-26" roundup; an Icethetics 2007 Rbk EDGE review (Lightning). Hexes are the teams'
// published palette values (teamcolorcodes.com-style, from memory, not re-fetched); where a jersey's own shade
// isn't known, the team's standard one.
import type { KitColors, HelmetTable, UniformTable } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee';
const BLACK = '#111111';
const CREAM = '#efe6d2';

// A kit: its body, the numbers' fill and outline, the name's letters, the collar, and its sleeve stripes'
// colors (no stripe color: no sleeve stripes)
const k = (body: string, num: string, outline: string, name: string, collar: string, stripe?: string, stripe2?: string): KitColors =>
  stripe
    ? { body, num, outline, name, collar, sleeve: 'stripes', stripe, ...(stripe2 ? { stripe2 } : {}) }
    : { body, num, outline, name, collar, sleeve: 'none' };

// Anaheim: black, orange, metallic gold (the 2025 set: Ducks orange)
const ANA_OR = '#f47a38', ANA_GD = '#b9975b', ANA_OR2 = '#fc4c02', ANA_PU = '#4f2683', ANA_JD = '#00857c';
const ANA_H1 = k(BLACK, WHITE, ANA_GD, WHITE, BLACK, ANA_GD, ANA_OR);
const ANA_A1 = k(WHITE, BLACK, ANA_GD, BLACK, BLACK, ANA_GD, ANA_OR);
const ANA_H2 = k(BLACK, WHITE, ANA_OR, WHITE, BLACK, ANA_OR, ANA_GD);
const ANA_A2 = k(WHITE, BLACK, ANA_OR, BLACK, BLACK, ANA_OR, ANA_GD);
const ANA_ORALT = k(ANA_OR, BLACK, WHITE, BLACK, BLACK, BLACK, ANA_GD);

// Phoenix / Arizona: Sedona red, desert sand, black; the Kachina set black with green, brick red and sand
const COY_R = '#8c2633', COY_S = '#e2d6b5', COY_G = '#2c5234';
const COY_H = k(COY_R, WHITE, BLACK, WHITE, BLACK, BLACK, COY_S);
const COY_A = k(WHITE, COY_R, BLACK, COY_R, COY_R, COY_R, BLACK);
const KACHINA = k(BLACK, WHITE, COY_R, WHITE, COY_G, COY_R, COY_G);

// Boston: black and gold
const BOS_G = '#fcb514';
const BOS_H = k(BLACK, BOS_G, WHITE, BOS_G, BLACK, BOS_G, WHITE);
const BOS_A = k(WHITE, BLACK, BOS_G, BLACK, BLACK, BLACK, BOS_G);

// Buffalo: navy, gold, silver (2009-2020); royal blue and gold (2021 on)
const BUF_NV = '#002654', BUF_G = '#fcb514', BUF_SV = '#a2aaad', BUF_RY = '#003087', BUF_RD = '#c8102e';
const BUF_H2 = k(BUF_NV, WHITE, BUF_G, WHITE, BUF_G, BUF_G, WHITE);
const BUF_A2 = k(WHITE, BUF_NV, BUF_G, BUF_NV, BUF_NV, BUF_NV, BUF_G);
const BUF_H3 = k(BUF_RY, WHITE, BUF_G, WHITE, BUF_RY, BUF_G, WHITE);
const BUF_A3 = k(WHITE, BUF_RY, BUF_G, BUF_RY, BUF_RY, BUF_RY, BUF_G);

// Carolina: red, black, silver
const CAR_R = '#ce1126', CAR_SV = '#a2aaad', CAR_GY = '#5b5f62';
const CAR_H1 = k(CAR_R, WHITE, BLACK, WHITE, BLACK, BLACK, CAR_SV);
const CAR_A1 = k(WHITE, CAR_R, BLACK, CAR_R, CAR_R, CAR_R, BLACK);
const CAR_BALT1 = k(BLACK, WHITE, CAR_R, WHITE, BLACK, CAR_R, CAR_SV);
const CAR_H2 = k(CAR_R, WHITE, BLACK, WHITE, BLACK, WHITE);
const CAR_A2 = k(WHITE, BLACK, CAR_R, WHITE, CAR_R, BLACK, CAR_R);
const CAR_H3 = k(CAR_R, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE);
const CAR_BLK = k(BLACK, WHITE, CAR_R, WHITE, CAR_GY, CAR_R, WHITE);
const CAR_CANES = k(WHITE, CAR_R, BLACK, CAR_R, CAR_R, CAR_R, BLACK);

// Columbus: union blue, goal red, silver; the cannon third with light blue and vintage white
const CBJ_NV = '#002654', CBJ_R = '#ce1126', CBJ_LB = '#7ca0c7', CBJ_VW = '#ece4cf';
const CBJ_H = k(CBJ_NV, WHITE, CBJ_R, WHITE, CBJ_R, WHITE, CBJ_R);
const CBJ_A = k(WHITE, CBJ_NV, CBJ_R, CBJ_NV, CBJ_NV, CBJ_NV, CBJ_R);
const CBJ_CANNON = k(CBJ_NV, CBJ_VW, CBJ_LB, CBJ_VW, CBJ_NV, CBJ_LB, CBJ_VW);

// Calgary: red, gold (yellow), black
const CGY_R = '#c8102e', CGY_G = '#f1be48';
const CGY_H1 = k(CGY_R, WHITE, BLACK, WHITE, BLACK, BLACK, CGY_G);
const CGY_A1 = k(WHITE, CGY_R, BLACK, CGY_R, BLACK, CGY_R, BLACK);
const CGY_RETRO = k(CGY_R, WHITE, CGY_G, WHITE, CGY_G, CGY_G, WHITE);
const CGY_A2 = k(WHITE, CGY_R, CGY_G, CGY_R, CGY_R, CGY_R, CGY_G);

// Chicago: red, black, white
const CHI_R = '#cf0a2c';
const CHI_H = k(CHI_R, WHITE, BLACK, WHITE, WHITE, BLACK, WHITE);
const CHI_A = k(WHITE, CHI_R, BLACK, CHI_R, CHI_R, BLACK, CHI_R);
const CHI_BLK = k(BLACK, WHITE, CHI_R, WHITE, CHI_R, CHI_R, WHITE);

// Colorado: burgundy, steel blue, black, silver
const COL_BU = '#6f263d', COL_SB = '#236192', COL_SV = '#a2aaad', COL_NV = '#00205b';
const COL_H1 = k(COL_BU, WHITE, COL_SB, WHITE, COL_SB, COL_SB, BLACK);
const COL_A1 = k(WHITE, COL_BU, COL_SB, COL_BU, COL_BU, COL_BU, COL_SB);
const COL_H2 = k(COL_BU, WHITE, COL_SB, WHITE, COL_SB, COL_SB, COL_SV);
const COL_NAVY = k(COL_NV, WHITE, COL_BU, WHITE, COL_NV, COL_BU, WHITE);

// Dallas: black, green, gold (2009-2013); victory green, black, silver (2014 on)
const DAL_GR = '#006a4e', DAL_GD = '#b5985a', DAL_VG = '#006847', DAL_SV = '#8f8f8c', DAL_NEON = '#69be28';
const DAL_H1 = k(BLACK, WHITE, DAL_GD, WHITE, BLACK, DAL_GR, DAL_GD);
const DAL_ARCH = k(WHITE, DAL_GR, DAL_GD, DAL_GR, DAL_GR, DAL_GR, DAL_GD);
const DAL_H2 = k(DAL_VG, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE);
const DAL_A2 = k(WHITE, DAL_VG, BLACK, DAL_VG, DAL_VG, BLACK, DAL_VG);

// Detroit: red and white
const DET_R = '#ce1126';
const DET_H = k(DET_R, WHITE, WHITE, WHITE, DET_R, WHITE);
const DET_A = k(WHITE, DET_R, DET_R, DET_R, DET_R, DET_R);

// Edmonton: midnight blue and copper (to 2009), royal blue and orange, navy
const EDM_MID = '#00205b', EDM_CU = '#b87333', EDM_RD = '#c8102e', EDM_RB = '#1a3d8f', EDM_OR = '#fc4c02', EDM_NV = '#041e42';
const EDM_MIDH = k(EDM_MID, WHITE, EDM_CU, WHITE, EDM_CU, EDM_CU, EDM_RD);
const EDM_MIDA = k(WHITE, EDM_MID, EDM_CU, EDM_MID, EDM_MID, EDM_MID, EDM_CU);
const EDM_ROYAL = k(EDM_RB, WHITE, EDM_OR, WHITE, EDM_OR, EDM_OR, WHITE);
const EDM_A2 = k(WHITE, EDM_RB, EDM_OR, EDM_RB, EDM_RB, EDM_OR, EDM_RB);
const EDM_ORANGE = k(EDM_OR, EDM_NV, WHITE, EDM_NV, EDM_NV, EDM_NV, WHITE);
const EDM_A3 = k(WHITE, EDM_NV, EDM_OR, EDM_NV, EDM_NV, EDM_NV, EDM_OR);
const EDM_NAVY = k(EDM_NV, EDM_OR, EDM_OR, EDM_OR, EDM_NV, EDM_OR);

// Florida: navy, red, yellow (to 2016); red, navy, flat gold (2017 on)
const FLA_NV = '#041e42', FLA_R = '#c8102e', FLA_Y = '#ffd100', FLA_G = '#b9975b', FLA_PB = '#9fc5e8';
const FLA_A1 = k(WHITE, FLA_NV, FLA_R, FLA_NV, FLA_NV, FLA_R, FLA_Y);
const FLA_RND = k(FLA_NV, WHITE, FLA_PB, WHITE, FLA_PB, FLA_PB, FLA_Y);

// Los Angeles: black, silver, (to 2011) purple
const LAK_SV = '#a2aaad', LAK_PU = '#572a84';
const LAK_H1 = k(BLACK, WHITE, LAK_PU, WHITE, LAK_PU, LAK_PU, LAK_SV);
const LAK_H2 = k(BLACK, WHITE, LAK_SV, WHITE, BLACK, LAK_SV, WHITE);
const LAK_A2 = k(WHITE, BLACK, LAK_SV, BLACK, BLACK, BLACK, LAK_SV);
const LAK_SILVER = k(LAK_SV, BLACK, WHITE, BLACK, BLACK, BLACK, WHITE);

// Minnesota: Iron Range red, forest green, harvest gold (wheat)
const MIN_RD = '#a6192e', MIN_GR = '#154734', MIN_WH = '#ddcba4';
const MIN_H1 = k(MIN_RD, MIN_GR, MIN_WH, MIN_GR, MIN_GR, MIN_GR, MIN_WH);
const MIN_A1 = k(WHITE, MIN_RD, MIN_WH, MIN_RD, MIN_GR, MIN_GR, MIN_RD);
const MIN_A2 = k(WHITE, MIN_GR, MIN_WH, MIN_GR, MIN_GR, MIN_GR, MIN_RD);
const MIN_GALT = k(MIN_GR, MIN_WH, MIN_RD, MIN_WH, MIN_RD, MIN_WH, MIN_RD);

// New Jersey: red, black, white
const NJD_R = '#ce1126';
const NJD_H = k(NJD_R, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE);
const NJD_A = k(WHITE, NJD_R, BLACK, NJD_R, BLACK, BLACK, NJD_R);

// Nashville: navy and gold
const NSH_NV = '#041e42', NSH_G = '#ffb81c';
const NSH_A1 = k(WHITE, NSH_NV, NSH_G, NSH_NV, NSH_NV, NSH_NV, NSH_G);

// Islanders: navy and orange (to 2010), royal blue and orange
const NYI_NV = '#00205b', NYI_RY = '#00539b', NYI_O = '#f47d30', NYI_GY = '#8a8d8f';
const NYI_ROYAL = k(NYI_RY, WHITE, NYI_O, WHITE, NYI_O, NYI_O, WHITE);
const NYI_A2 = k(WHITE, NYI_RY, NYI_O, NYI_RY, NYI_RY, NYI_RY, NYI_O);
const NYI_BLUEALT = k(NYI_RY, NYI_O, WHITE, WHITE, WHITE, WHITE, NYI_O);

// Rangers: blue, red, white; the thirds navy
const NYR_B = '#0038a8', NYR_R = '#ce1126', NYR_NV = '#002d72', NYR_LB = '#6caddf';
const NYR_H = k(NYR_B, NYR_R, WHITE, WHITE, NYR_R, NYR_R, WHITE);
const NYR_A = k(WHITE, NYR_B, NYR_R, NYR_B, NYR_B, NYR_B, NYR_R);
const NYR_SHIELD = k(NYR_NV, WHITE, NYR_R, WHITE, NYR_NV, WHITE, NYR_R);

// Ottawa: black, red, white, gold
const OTT_R = '#c8102e', OTT_G = '#b9975b';
const OTT_H1 = k(BLACK, WHITE, OTT_R, WHITE, BLACK, OTT_R, WHITE);
const OTT_A1 = k(WHITE, BLACK, OTT_R, BLACK, BLACK, BLACK, OTT_R);

// Philadelphia: orange, black, white (the 2024 set back to burnt orange)
const PHI_O = '#f74902', PHI_BO = '#e8541e';
const PHI_BLKH = k(BLACK, WHITE, PHI_O, WHITE, WHITE, PHI_O, WHITE);
const PHI_EDGEA = k(WHITE, PHI_O, BLACK, BLACK, PHI_O, BLACK, WHITE);
const PHI_73H = k(PHI_O, WHITE, BLACK, BLACK, BLACK, WHITE);
const PHI_73A = k(WHITE, PHI_O, BLACK, WHITE, PHI_O, PHI_O, BLACK);
const PHI_SS = k(BLACK, BLACK, WHITE, BLACK, BLACK, PHI_O, WHITE);

// Pittsburgh: black and Vegas gold (to 2016), black and Pittsburgh gold
const PIT_VG = '#c5b358', PIT_PG = '#fcb514', PIT_PB = '#80b7e2', PIT_NV = '#00205b';
const PIT_H1 = k(BLACK, WHITE, PIT_VG, WHITE, PIT_VG, PIT_VG, WHITE);
const PIT_A1 = k(WHITE, BLACK, PIT_VG, BLACK, BLACK, BLACK, PIT_VG);
const PIT_H2 = k(BLACK, PIT_PG, WHITE, PIT_PG, PIT_PG, PIT_PG, WHITE);
const PIT_A2 = k(WHITE, BLACK, PIT_PG, BLACK, BLACK, BLACK, PIT_PG);
const PIT_GOLD = k(PIT_PG, BLACK, WHITE, BLACK, BLACK, BLACK, WHITE);

// San Jose: Pacific teal, black, orange (to 2013), white
const SJS_T = '#006d75', SJS_O = '#e57200', SJS_GY = '#5f6a72';
const SJS_BLK = k(BLACK, WHITE, SJS_T, WHITE, BLACK, SJS_T, WHITE);

// St. Louis: blue, navy, gold (2026: a lighter blue and yellow)
const STL_B = '#002f87', STL_NV = '#041e42', STL_G = '#fcb514', STL_LB = '#0070b9';
const STL_ARCH = k(STL_NV, WHITE, STL_G, WHITE, STL_NV, STL_G, STL_B);
const STL_H3 = k(STL_B, WHITE, STL_NV, WHITE, STL_NV, STL_NV, STL_G);
const STL_A2 = k(WHITE, STL_B, STL_NV, STL_B, STL_B, STL_B, STL_NV);
const STL_HERITAGE = k(STL_NV, WHITE, STL_G, WHITE, STL_NV, STL_G, WHITE);

// Tampa Bay: black, blue, silver (to 2011); blue and white, black trim
const TBL_B = '#002868', TBL_EB = '#0a5cb5', TBL_SV = '#a2aaad';
const TBL_BOLTS = k(TBL_EB, WHITE, BLACK, WHITE, BLACK, BLACK, TBL_SV);
const TBL_H2 = k(TBL_B, WHITE, BLACK, WHITE, WHITE, WHITE);
const TBL_A2 = k(WHITE, TBL_B, BLACK, TBL_B, TBL_B, TBL_B);

// Toronto: blue and white
const TOR_B = '#00205b';
const TOR_H = k(TOR_B, WHITE, WHITE, WHITE, WHITE, WHITE);
const TOR_A = k(WHITE, TOR_B, TOR_B, TOR_B, TOR_B, TOR_B);

// Vancouver: blue, green, white
const VAN_B = '#00205b', VAN_G = '#00843d', VAN_Y = '#ffb81c', VAN_R = '#c8102e';
const VAN_H = k(VAN_B, WHITE, VAN_G, WHITE, VAN_G, VAN_G, WHITE);
const VAN_A = k(WHITE, VAN_B, VAN_G, VAN_B, VAN_B, VAN_B, VAN_G);

// Vegas: steel gray, gold, red, black
const VGK_GY = '#333f42', VGK_G = '#b4975a';
const VGK_GRAY = k(VGK_GY, VGK_G, WHITE, VGK_G, VGK_GY, BLACK, VGK_G);
const VGK_A = k(WHITE, VGK_GY, VGK_G, VGK_GY, VGK_GY, VGK_GY, VGK_G);
const VGK_GOLD = k(VGK_G, VGK_GY, WHITE, VGK_GY, VGK_GY, VGK_GY, WHITE);

// Winnipeg: polar night blue, aviator blue, silver, red
const WPG_NV = '#041e42', WPG_AB = '#004c97', WPG_SV = '#8e9090', WPG_R = '#ac162c', WPG_HB = '#0b4ea2';

// Washington: red, navy, white
const WSH_R = '#c8102e', WSH_NV = '#041e42';
const WSH_H = k(WSH_R, WHITE, WSH_NV, WHITE, WSH_NV, WSH_NV, WHITE);
const WSH_A = k(WHITE, WSH_R, WSH_NV, WSH_NV, WSH_NV, WSH_NV, WSH_R);
const WSH_RETRO = k(WSH_R, WHITE, WSH_NV, WHITE, WSH_NV, WSH_NV, WHITE);

export const UNIFORM_ERAS: UniformTable = {
  // Wikipedia "Anaheim Ducks" (Uniforms 2006-2014, 2014-2024, 2024-present)
  ANA: [
    { from: 2009, to: 2010, home: ANA_H1, away: ANA_A1, note: 'Rbk Edge "Ducks" wordmark set; number trim gold/orange?' },
    { from: 2011, to: 2014, home: ANA_H1, away: ANA_A1, alt: k(BLACK, WHITE, ANA_OR, WHITE, BLACK, ANA_OR, ANA_GD), note: 'black webbed-D third with thick orange stripes from 2010-11' },
    { from: 2015, to: 2015, home: ANA_H2, away: ANA_A2, note: 'webbed-D third promoted to home, matching white; orange accents replace gold' },
    { from: 2016, to: 2017, home: ANA_H2, away: ANA_A2, alt: ANA_ORALT, note: 'orange third (Mighty Ducks crest); its number colors?' },
    { from: 2018, to: 2018, home: ANA_H2, away: ANA_A2, note: 'Adidas template, no third' },
    { from: 2019, to: 2019, home: ANA_H2, away: ANA_A2, alt: k(BLACK, WHITE, ANA_JD, WHITE, BLACK, ANA_PU, ANA_JD), note: '25th-anniversary black third with eggplant/jade striping; shades?' },
    { from: 2020, to: 2023, home: ANA_H2, away: ANA_A2, alt: ANA_ORALT, note: 'orange third back (Adidas); its number colors?' },
    { from: 2024, to: 2024, home: ANA_H2, away: ANA_A2, alt: k(ANA_PU, WHITE, ANA_JD, WHITE, ANA_JD, ANA_JD, WHITE), note: '30th-anniversary eggplant/jade third; body and trim?' },
    { from: 2025, home: k(ANA_OR2, BLACK, WHITE, BLACK, BLACK, BLACK, ANA_GD), away: k(WHITE, ANA_OR2, BLACK, ANA_OR2, ANA_OR2, ANA_OR2, BLACK), note: 'Fanatics rebrand: orange home, white road with orange shoulders; number fill/trim?' },
  ],
  // Wikipedia "Arizona Coyotes" (Logos and jerseys)
  PHX: [
    { from: 2009, to: 2014, home: COY_H, away: COY_A, alt: k(BLACK, COY_R, COY_S, COY_R, BLACK, COY_R, COY_S), note: 'howling-coyote set; black third 2008-09 to 2013-14; number trims?' },
  ],
  // Wikipedia "Arizona Coyotes" (Logos and jerseys)
  ARI: [
    { from: 2015, to: 2018, home: COY_H, away: COY_A, note: 'PHX patch becomes AZ; black added to the sleeves from 2015-16; Kachina black worn a few dates (not a regular third)' },
    { from: 2019, to: 2020, home: COY_H, away: COY_A, alt: KACHINA, note: 'black Kachina third (Adidas); Kachina number and shoulder colors?' },
    { from: 2021, to: 2021, home: k(BLACK, WHITE, '#a2aaad', WHITE, COY_G, COY_R, COY_G), away: COY_A, alt: COY_H, note: 'black Kachina home (silver letter trim for the 25th season), red howler third; Kachina colors?' },
    { from: 2022, to: 2022, home: KACHINA, away: k(WHITE, BLACK, COY_R, BLACK, COY_G, COY_R, COY_G), alt: COY_H, note: 'Kachina home and new white Kachina road, red howler third; white Kachina number colors?' },
    { from: 2023, to: 2024, home: KACHINA, away: k(WHITE, BLACK, COY_R, BLACK, COY_G, COY_R, COY_G), alt: k(COY_R, COY_S, COY_S, COY_S, BLACK, COY_S, BLACK), note: 'brick-red/sand "Arizona" desert third; its trims?' },
  ],
  // Wikipedia "Atlanta Thrashers" (Jerseys)
  ATL: [
    { from: 2009, to: 2011, home: k('#4167b1', WHITE, '#041e42', WHITE, '#041e42', '#041e42', WHITE), away: k(WHITE, '#041e42', '#4167b1', '#041e42', '#041e42', '#041e42', '#4167b1'), alt: k('#c8102e', WHITE, '#041e42', WHITE, '#041e42', '#041e42', '#b9975b'), note: 'blue home (navy right-shoulder yoke), red/midnight-blue third from 2008-09; the blue shade and number trims?' },
  ],
  // Wikipedia "Boston Bruins" (Logo and uniforms)
  BOS: [
    { from: 2009, to: 2014, home: BOS_H, away: BOS_A, alt: k(BLACK, BOS_G, WHITE, BOS_G, BLACK, BOS_G, WHITE), note: 'Rbk Edge spoked-B set; black walking-bear third from 2008-09, last season of it?' },
    { from: 2015, to: 2016, home: BOS_H, away: BOS_A },
    { from: 2017, to: 2017, home: BOS_H, away: BOS_A, alt: k(BLACK, WHITE, BOS_G, WHITE, BLACK, BOS_G, BLACK), note: '2016 Winter Classic black/gold carried as the third; number colors?' },
    { from: 2018, to: 2019, home: BOS_H, away: BOS_A, note: 'Adidas template; no regular third' },
    { from: 2020, to: 2023, home: BOS_H, away: BOS_A, alt: k(BLACK, WHITE, BOS_G, WHITE, BLACK, BOS_G, WHITE), note: '1950s-style black block-B third; its number colors?' },
    { from: 2024, to: 2024, home: k(BLACK, WHITE, WHITE, WHITE, BLACK, '#d1a65a', WHITE), away: k(WHITE, BLACK, BLACK, BLACK, BLACK, BLACK, '#d1a65a'), alt: k('#d8c8a8', '#4e3629', WHITE, '#4e3629', '#d1a65a', '#4e3629', WHITE), note: 'centennial set (paler "centennial gold", untrimmed numbers) and beige third, one season; the gold hex?' },
    { from: 2025, to: 2025, home: BOS_H, away: BOS_A, note: 'back to the 2007-2023 look (Fanatics); a regular third?' },
    { from: 2026, home: k(BLACK, BOS_G, WHITE, BOS_G, BOS_G, BOS_G, WHITE), away: BOS_A, note: 'new set after the 1977-95 uniforms, gold B on black, gold collar' },
  ],
  // Wikipedia "Buffalo Sabres" (Logo and uniforms)
  BUF: [
    { from: 2009, to: 2010, home: k(BUF_NV, WHITE, BUF_G, WHITE, BUF_NV, BUF_SV, BUF_G), away: k(WHITE, BUF_NV, BUF_G, BUF_NV, BUF_NV, BUF_SV, BUF_NV), alt: BUF_H2, note: '"Buffaslug" set; navy classic-style third from 2008-09; slug striping and number trims?' },
    { from: 2011, to: 2013, home: BUF_H2, away: BUF_A2, note: 'navy classic set (the third promoted); the 40th-anniversary throwback third left out?' },
    { from: 2014, to: 2015, home: BUF_H2, away: BUF_A2, alt: k(BUF_G, BUF_NV, WHITE, BUF_NV, BUF_NV, BUF_NV, WHITE), note: 'gold-front third, two seasons; its trims?' },
    { from: 2016, to: 2019, home: BUF_H2, away: BUF_A2, note: 'navy home number fill white or gold?' },
    { from: 2020, to: 2020, home: BUF_H2, away: BUF_A2, alt: k(WHITE, BUF_NV, '#c5b358', BUF_NV, BUF_NV, BUF_NV, '#c5b358'), note: '50th-anniversary white third with metallic gold' },
    { from: 2021, to: 2022, home: BUF_H3, away: BUF_A3, note: 'royal blue and gold return; number fill/trim?' },
    { from: 2023, home: BUF_H3, away: BUF_A3, alt: k(BLACK, WHITE, BUF_RD, WHITE, BUF_RD, BUF_RD, BUF_SV), note: '1996-2006 black goathead set back as the third' },
  ],
  // Wikipedia "Carolina Hurricanes" (Logos and uniforms)
  CAR: [
    { from: 2009, to: 2013, home: CAR_H1, away: CAR_A1, alt: CAR_BALT1, note: 'original set (warning-flag tail), black flag-logo third from 2008-09' },
    { from: 2014, to: 2017, home: CAR_H2, away: CAR_A2, alt: CAR_BALT1, note: '2013 set: black/silver dropped, red nameplate on the white; white number colors?' },
    { from: 2018, to: 2018, home: CAR_H3, away: CAR_A2, note: 'Adidas red with black striping back; no third' },
    { from: 2019, to: 2019, home: CAR_H3, away: CAR_A2, alt: CAR_BLK, note: 'new black third, dark gray yoke' },
    { from: 2020, to: 2022, home: CAR_H3, away: CAR_CANES, alt: CAR_BLK, note: 'diagonal "CANES" white road' },
    { from: 2023, to: 2023, home: CAR_BLK, away: CAR_CANES, alt: CAR_H1, note: 'black becomes home; the 1997-2007 red back as a one-season third' },
    { from: 2024, to: 2025, home: CAR_BLK, away: CAR_CANES, alt: CAR_H3, note: 'modern red third' },
    { from: 2026, home: CAR_BLK, away: k(WHITE, CAR_R, BLACK, CAR_R, CAR_R, CAR_R, BLACK), alt: CAR_H3, note: 'new white road after the 2023 Stadium Series set' },
  ],
  // Wikipedia "Columbus Blue Jackets" (Logos and jerseys)
  CBJ: [
    { from: 2009, to: 2010, home: CBJ_H, away: CBJ_A, note: 'flag-logo set (the 2003 third promoted); sleeve stripe colors?' },
    { from: 2011, to: 2017, home: CBJ_H, away: CBJ_A, alt: CBJ_CANNON, note: 'navy cannon third with light blue and vintage white; shades?' },
    { from: 2018, to: 2018, home: CBJ_H, away: CBJ_A, note: 'Adidas, new lettering; no third' },
    { from: 2019, home: CBJ_H, away: CBJ_A, alt: CBJ_CANNON },
  ],
  // Wikipedia "Calgary Flames" (Jerseys)
  CGY: [
    { from: 2009, to: 2009, home: CGY_H1, away: CGY_A1, note: 'Rbk Edge black-trimmed set; number trims?' },
    { from: 2010, to: 2013, home: CGY_H1, away: CGY_A1, alt: CGY_RETRO, note: '1980s red throwback third; first season of it 2009-10?' },
    { from: 2014, to: 2016, home: CGY_H1, away: CGY_A1, alt: k(BLACK, WHITE, CGY_R, WHITE, BLACK, CGY_R, CGY_G), note: 'black western "Calgary" script third; trims?' },
    { from: 2017, to: 2017, home: CGY_H1, away: CGY_A1, alt: CGY_RETRO },
    { from: 2018, to: 2018, home: CGY_H1, away: CGY_A1, note: 'Adidas, no third' },
    { from: 2019, to: 2020, home: CGY_H1, away: CGY_A1, alt: CGY_RETRO },
    { from: 2021, to: 2021, home: CGY_RETRO, away: CGY_A2, alt: CGY_H1, note: 'throwback red and original white promoted; black-trimmed red a third for its last season' },
    { from: 2022, to: 2022, home: CGY_RETRO, away: CGY_A2 },
    { from: 2023, home: CGY_RETRO, away: CGY_A2, alt: k(BLACK, WHITE, CGY_R, WHITE, CGY_R, CGY_R, CGY_G), note: '"Blasty" black third back; its trims?' },
  ],
  // Wikipedia "Chicago Blackhawks" (Jerseys)
  CHI: [
    { from: 2009, to: 2009, home: CHI_H, away: CHI_A, alt: CHI_BLK, note: '1996-2007 black third back for 2008-09' },
    { from: 2010, to: 2011, home: CHI_H, away: CHI_A, alt: k(BLACK, CREAM, CHI_R, CREAM, BLACK, CREAM, CHI_R), note: '2009 Winter Classic black/beige third; number colors?' },
    { from: 2012, to: 2025, home: CHI_H, away: CHI_A, note: 'unchanged look (Adidas 2017, Fanatics 2024); 2019 Winter Classic set worn a few games only' },
    { from: 2026, home: k(CHI_R, WHITE, '#b9975b', WHITE, WHITE, BLACK, WHITE), away: CHI_A, alt: CHI_BLK, note: 'centennial: lace-up collar, gold trim on crest and numbers; black third back; does the gold trim stay past 2025-26?' },
  ],
  // Wikipedia "Colorado Avalanche" (Jerseys)
  COL: [
    { from: 2009, to: 2009, home: COL_H1, away: COL_A1, note: 'Rbk Edge version of the 1995 set; no third; number trims?' },
    { from: 2010, to: 2015, home: COL_H1, away: COL_A1, alt: k(COL_SB, WHITE, COL_BU, WHITE, COL_BU, COL_BU, WHITE), note: 'steel blue third, burgundy shoulder patches' },
    { from: 2016, to: 2017, home: COL_H1, away: COL_A1, alt: COL_NAVY, note: 'navy Rockies-logo third; its trims?' },
    { from: 2018, to: 2018, home: COL_H2, away: COL_A1, note: 'Adidas set after the 1995-2007 look with a silver border; no third' },
    { from: 2019, to: 2021, home: COL_H2, away: COL_A1, alt: COL_NAVY },
    { from: 2022, home: COL_H2, away: k(WHITE, COL_SB, COL_BU, COL_BU, COL_BU, COL_BU, COL_SB), alt: COL_NAVY, note: 'black dropped: white road gets burgundy names, steel blue numbers trimmed burgundy' },
  ],
  // Wikipedia "Dallas Stars" (Logo and jersey design)
  DAL: [
    { from: 2009, to: 2010, home: DAL_H1, away: k(WHITE, DAL_GR, BLACK, DAL_GR, BLACK, BLACK, DAL_GR), alt: DAL_ARCH, note: 'Rbk Edge set: black home with chest number and arched "Dallas"; white crest road; stripe colors?' },
    { from: 2011, to: 2013, home: DAL_H1, away: DAL_ARCH, note: 'the arched white third becomes the road' },
    { from: 2014, to: 2020, home: DAL_H2, away: DAL_A2, note: 'victory green rebrand' },
    { from: 2021, to: 2025, home: DAL_H2, away: DAL_A2, alt: k(BLACK, BLACK, DAL_NEON, DAL_NEON, BLACK, DAL_NEON, DAL_SV), note: 'black "Blackout" third with neon green; neon hex?' },
    { from: 2026, home: DAL_H2, away: DAL_A2, alt: k(BLACK, WHITE, DAL_VG, WHITE, DAL_VG, DAL_VG, DAL_SV), note: '"The \'99" black third after the 1997-2007 green set; trims?' },
  ],
  // Wikipedia "Detroit Red Wings" (Logo and uniforms)
  DET: [
    { from: 2009, to: 2025, home: DET_H, away: DET_A, note: 'the same look throughout; no regular third' },
    { from: 2026, to: 2026, home: DET_H, away: DET_A, alt: k(DET_R, CREAM, CREAM, CREAM, CREAM, CREAM), note: 'centennial red and vintage white third' },
    { from: 2027, home: DET_H, away: DET_A },
  ],
  // Wikipedia "Edmonton Oilers" (Jerseys)
  EDM: [
    { from: 2009, to: 2009, home: EDM_MIDH, away: EDM_MIDA, alt: EDM_ROYAL, note: 'midnight blue/copper Edge set, royal blue/orange third; Edge trims?' },
    { from: 2010, to: 2011, home: EDM_ROYAL, away: EDM_MIDA, alt: EDM_MIDH, note: 'royal blue becomes home; royal shade?' },
    { from: 2012, to: 2012, home: EDM_ROYAL, away: EDM_A2, alt: EDM_MIDH, note: 'new white road; midnight blue third dropped after this season?' },
    { from: 2013, to: 2015, home: EDM_ROYAL, away: EDM_A2 },
    { from: 2016, to: 2017, home: EDM_ROYAL, away: EDM_A2, alt: k(EDM_OR, EDM_RB, WHITE, EDM_RB, EDM_RB, EDM_RB, WHITE), note: 'orange WHA-style third' },
    { from: 2018, to: 2019, home: EDM_ORANGE, away: EDM_A3, note: 'orange becomes home with navy accents; number fill navy or white?' },
    { from: 2020, to: 2022, home: EDM_ORANGE, away: EDM_A3, alt: EDM_NAVY, note: 'navy third with minimal striping' },
    { from: 2023, to: 2025, home: EDM_ROYAL, away: EDM_A2, alt: EDM_NAVY, note: '1980s royal blue and white back' },
    { from: 2026, home: EDM_ROYAL, away: EDM_A2, alt: k('#d6c6a2', EDM_RB, EDM_OR, EDM_RB, EDM_RB, EDM_RB, EDM_OR), note: 'tan third with blue shoulders; does it replace the navy?' },
  ],
  // Wikipedia "Florida Panthers" (Logos, colors, and uniforms)
  FLA: [
    { from: 2009, to: 2009, home: k(FLA_NV, WHITE, FLA_R, WHITE, FLA_R, FLA_R, FLA_Y), away: FLA_A1, note: 'Rbk Edge navy home; number trims?' },
    { from: 2010, to: 2011, home: k(FLA_NV, WHITE, FLA_R, WHITE, FLA_R, FLA_R, FLA_Y), away: FLA_A1, alt: FLA_RND, note: 'navy roundel third with powder blue; powder blue hex?' },
    { from: 2012, to: 2012, home: k(FLA_R, WHITE, FLA_NV, WHITE, FLA_NV, FLA_NV, FLA_Y), away: FLA_A1, alt: FLA_RND, note: 'red back as home' },
    { from: 2013, to: 2016, home: k(FLA_R, WHITE, FLA_NV, WHITE, FLA_NV, FLA_NV, FLA_Y), away: FLA_A1 },
    { from: 2017, home: k(FLA_R, WHITE, FLA_NV, WHITE, FLA_NV, FLA_NV, FLA_G), away: k(WHITE, FLA_R, FLA_NV, FLA_NV, FLA_NV, FLA_NV, FLA_G), note: 'shield rebrand: thick navy chest/sleeve stripes, flat gold; road number fill?' },
  ],
  // Wikipedia "Los Angeles Kings" (Uniforms and logos)
  LAK: [
    { from: 2009, to: 2011, home: LAK_H1, away: k(WHITE, BLACK, LAK_PU, BLACK, LAK_PU, LAK_PU, LAK_SV), alt: LAK_H2, note: 'purple-tinged crown-logo set; black/silver LA-banner third from 2008-09; purple trims?' },
    { from: 2012, to: 2013, home: LAK_H2, away: LAK_A2, alt: LAK_H1, note: 'black/silver: the banner third becomes home; old home a third' },
    { from: 2014, to: 2016, home: LAK_H2, away: LAK_A2 },
    { from: 2017, to: 2017, home: LAK_H2, away: LAK_A2, alt: k(LAK_SV, BLACK, '#b9975b', BLACK, LAK_PU, BLACK, WHITE), note: '50th-anniversary silver third with gold accents' },
    { from: 2018, to: 2018, home: LAK_H2, away: LAK_A2, note: 'Adidas, no third' },
    { from: 2019, to: 2021, home: LAK_H2, away: LAK_A2, alt: LAK_SILVER },
    { from: 2022, to: 2024, home: LAK_H2, away: LAK_A2, alt: k(WHITE, BLACK, LAK_SV, BLACK, BLACK, BLACK, LAK_SV), note: 'modernized 1990s white third (chrome helmets)' },
    { from: 2025, to: 2025, home: k(BLACK, WHITE, LAK_SV, WHITE, BLACK, WHITE, LAK_SV), away: LAK_A2, note: 'new set after the 1988-98 uniforms' },
    { from: 2026, home: k(BLACK, WHITE, LAK_SV, WHITE, BLACK, WHITE, LAK_SV), away: LAK_A2, alt: k(BLACK, LAK_SV, LAK_SV, LAK_SV, LAK_SV, LAK_SV), note: 'black crown-logo third with silver' },
  ],
  // Wikipedia "Minnesota Wild" (Jerseys); nhluniforms.com Wild page
  MIN: [
    { from: 2009, to: 2009, home: MIN_H1, away: MIN_A1, note: 'red Edge home (green crest circle); its number colors?' },
    { from: 2010, to: 2013, home: MIN_H1, away: MIN_A1, alt: MIN_GALT, note: 'green script "Minnesota Wild" third' },
    { from: 2014, to: 2017, home: MIN_H1, away: MIN_A2, alt: MIN_GALT, note: 'road redesigned to match; colors?' },
    { from: 2018, to: 2023, home: k(MIN_GR, WHITE, MIN_RD, WHITE, MIN_GR, MIN_WH, MIN_RD), away: MIN_A2, note: 'green home with a wheat chest stripe; number fill?' },
    { from: 2024, home: k(MIN_GR, WHITE, MIN_RD, WHITE, MIN_GR, MIN_WH, MIN_RD), away: MIN_A2, alt: k(MIN_GR, MIN_WH, WHITE, MIN_WH, MIN_GR, WHITE, MIN_WH), note: 'green North Stars-style third; its trims?' },
  ],
  // Wikipedia "Montreal Canadiens" (Crest and sweater design)
  MTL: [
    { from: 2009, home: k('#af1e2d', WHITE, '#192168', WHITE, '#192168', '#192168', WHITE), away: k(WHITE, '#af1e2d', '#192168', '#af1e2d', '#af1e2d', '#af1e2d', '#192168'), note: 'unchanged; no regular third' },
  ],
  // Wikipedia "New Jersey Devils" (Jerseys)
  NJD: [
    { from: 2009, to: 2017, home: NJD_H, away: NJD_A, note: '1992 design on the Edge template; no third; red home number fill white or black?' },
    { from: 2018, to: 2021, home: NJD_H, away: NJD_A, note: 'Adidas: waist stripes gone, thicker equal sleeve bands' },
    { from: 2022, home: NJD_H, away: NJD_A, alt: k(BLACK, WHITE, NJD_R, WHITE, BLACK, WHITE), note: 'black "Jersey" script third' },
  ],
  // Wikipedia "Nashville Predators" (Jersey and logo)
  NSH: [
    { from: 2009, to: 2009, home: k(NSH_NV, WHITE, NSH_G, WHITE, '#a2aaad', NSH_G, WHITE), away: NSH_A1, note: 'navy Edge set; number trims?' },
    { from: 2010, to: 2011, home: k(NSH_NV, WHITE, NSH_G, WHITE, '#a2aaad', NSH_G, WHITE), away: NSH_A1, alt: k(NSH_NV, WHITE, BLACK, WHITE, BLACK, BLACK, NSH_NV), note: 'navy/black checkerboard third' },
    { from: 2012, home: k(NSH_G, NSH_NV, WHITE, NSH_NV, NSH_NV, NSH_NV, WHITE), away: k(WHITE, NSH_NV, NSH_G, NSH_NV, NSH_NV, NSH_G, NSH_NV), note: 'gold rebrand; road more gold from 2017-18; road number fill?' },
  ],
  // Wikipedia "New York Islanders" (Logo, Jerseys)
  NYI: [
    { from: 2009, to: 2010, home: k(NYI_NV, WHITE, NYI_O, WHITE, NYI_NV, NYI_NV, WHITE), away: k(WHITE, NYI_NV, NYI_O, NYI_NV, NYI_NV, NYI_NV, WHITE), alt: NYI_ROYAL, note: 'navy Edge set (orange sleeves, chest numbers, orange nameplate); royal throwback third' },
    { from: 2011, to: 2011, home: NYI_ROYAL, away: NYI_A2 },
    { from: 2012, to: 2013, home: NYI_ROYAL, away: NYI_A2, alt: k(BLACK, NYI_O, NYI_RY, NYI_O, NYI_GY, NYI_RY, NYI_O), note: 'black third with gray yoke; trims?' },
    { from: 2014, to: 2014, home: NYI_ROYAL, away: NYI_A2 },
    { from: 2015, to: 2015, home: NYI_ROYAL, away: NYI_A2, alt: k(NYI_RY, WHITE, NYI_O, NYI_RY, WHITE, WHITE, NYI_O), note: 'Stadium Series blue (white yoke) as the third' },
    { from: 2016, to: 2017, home: NYI_ROYAL, away: NYI_A2, alt: k(BLACK, WHITE, WHITE, WHITE, BLACK, WHITE), note: 'Brooklyn black third' },
    { from: 2018, to: 2018, home: NYI_ROYAL, away: NYI_A2 },
    { from: 2019, to: 2024, home: NYI_ROYAL, away: NYI_A2, alt: NYI_BLUEALT, note: 'blue third, white yoke, orange numbers' },
    { from: 2025, home: NYI_ROYAL, away: NYI_A2, note: 'primaries only under Fanatics' },
  ],
  // Wikipedia "New York Rangers" (Uniforms)
  NYR: [
    { from: 2009, to: 2010, home: NYR_H, away: NYR_A, note: 'blue nameplate letters white or red?' },
    { from: 2011, to: 2017, home: NYR_H, away: NYR_A, alt: k(NYR_NV, CREAM, NYR_R, CREAM, NYR_NV, CREAM, NYR_R), note: 'heritage navy third with cream; last season 2016-17?' },
    { from: 2018, to: 2023, home: NYR_H, away: NYR_A },
    { from: 2024, to: 2025, home: NYR_H, away: NYR_A, alt: NYR_SHIELD, note: 'navy shield-crest third' },
    { from: 2026, to: 2026, home: NYR_H, away: NYR_A, alt: k(NYR_LB, CREAM, CREAM, CREAM, NYR_R, NYR_R, CREAM), note: 'centennial light blue third; shade?' },
    { from: 2027, home: NYR_H, away: NYR_A, alt: NYR_SHIELD },
  ],
  // Wikipedia "Ottawa Senators" (Logo and jersey design)
  OTT: [
    { from: 2009, to: 2011, home: OTT_H1, away: OTT_A1, alt: k(BLACK, WHITE, OTT_R, WHITE, OTT_R, OTT_R, WHITE), note: '2007 Edge set; black "SENS" third; trims?' },
    { from: 2012, to: 2017, home: OTT_H1, away: OTT_A1, alt: k(BLACK, WHITE, OTT_R, WHITE, BLACK, OTT_R, WHITE), note: 'black barber-pole heritage third' },
    { from: 2018, to: 2018, home: OTT_H1, away: OTT_A1, note: 'Adidas, new number font, no third' },
    { from: 2019, to: 2020, home: OTT_H1, away: OTT_A1, alt: k(OTT_R, WHITE, BLACK, WHITE, BLACK, BLACK, '#a2aaad'), note: 'red NHL 100 Classic set as the third (silver O)' },
    { from: 2021, to: 2025, home: k(BLACK, WHITE, OTT_R, WHITE, BLACK, OTT_R, WHITE), away: k(WHITE, BLACK, OTT_R, BLACK, BLACK, BLACK, OTT_R), note: 'rebrand after the 1992-95 set, gold-outlined logo' },
    { from: 2026, home: k(BLACK, WHITE, OTT_R, WHITE, BLACK, OTT_R, WHITE), away: k(WHITE, BLACK, OTT_R, BLACK, BLACK, BLACK, OTT_R), alt: k(OTT_R, WHITE, BLACK, WHITE, BLACK, BLACK, OTT_G), note: 'red third with black shoulders and gold; number colors?' },
  ],
  // Wikipedia "Philadelphia Flyers" (Jerseys)
  PHI: [
    { from: 2009, to: 2009, home: PHI_BLKH, away: PHI_EDGEA, alt: PHI_73H, note: 'black Edge home (white shoulders); orange 1973-74 style third; Edge number trims?' },
    { from: 2010, to: 2010, home: PHI_73H, away: PHI_EDGEA, alt: PHI_BLKH, note: 'orange becomes home' },
    { from: 2011, to: 2014, home: PHI_73H, away: PHI_73A, note: '1973-74 white becomes the road' },
    { from: 2015, to: 2016, home: PHI_73H, away: PHI_73A, alt: k(PHI_O, BLACK, CREAM, BLACK, CREAM, CREAM, BLACK), note: '2012 Winter Classic orange/cream third' },
    { from: 2017, to: 2017, home: PHI_73H, away: PHI_73A, alt: k(WHITE, '#b9975b', BLACK, WHITE, PHI_O, PHI_O, BLACK), note: '50th-anniversary white third with gold numbers' },
    { from: 2018, to: 2018, home: PHI_73H, away: PHI_73A },
    { from: 2019, to: 2023, home: PHI_73H, away: PHI_73A, alt: PHI_SS, note: '2017 Stadium Series black as the third' },
    { from: 2024, home: k(PHI_BO, WHITE, BLACK, BLACK, BLACK, WHITE, BLACK), away: k(WHITE, PHI_BO, BLACK, WHITE, PHI_BO, PHI_BO, BLACK), alt: PHI_SS, note: 'burnt orange redesign, wider stripes; the burnt orange hex?' },
  ],
  // Wikipedia "Pittsburgh Penguins" (Crest and sweater design)
  PIT: [
    { from: 2009, to: 2011, home: PIT_H1, away: PIT_A1, alt: k(PIT_PB, PIT_NV, WHITE, PIT_NV, PIT_NV, PIT_NV, WHITE), note: 'Vegas gold Edge set; powder blue 2008 Winter Classic third; home number fill white or gold?' },
    { from: 2012, to: 2014, home: PIT_H1, away: PIT_A1, alt: k(PIT_NV, WHITE, PIT_PB, WHITE, PIT_NV, WHITE, PIT_PB), note: '2011 Winter Classic navy third; trims?' },
    { from: 2015, to: 2016, home: PIT_H1, away: PIT_A1, alt: PIT_H2, note: 'black Pittsburgh-gold third after the 1991-92 set' },
    { from: 2017, to: 2018, home: PIT_H2, away: PIT_A2, note: 'Pittsburgh gold becomes the primary set; no third' },
    { from: 2019, to: 2021, home: PIT_H2, away: PIT_A2, alt: PIT_GOLD, note: 'gold third after the 2017 Stadium Series' },
    { from: 2022, to: 2025, home: PIT_H2, away: PIT_A2, alt: k(BLACK, WHITE, PIT_PG, WHITE, PIT_PG, PIT_PG, WHITE), note: 'black version of the 2021 Reverse Retro (1992-97 look) as the third; trims?' },
    { from: 2026, home: PIT_H2, away: PIT_A2, alt: k(PIT_PG, BLACK, BLACK, BLACK, BLACK, BLACK), note: 'gold "Three Rivers" third' },
  ],
  // Wikipedia "San Jose Sharks" (Logo and jerseys)
  SJS: [
    { from: 2009, to: 2013, home: k(SJS_T, WHITE, BLACK, WHITE, BLACK, BLACK, SJS_O), away: k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, SJS_O), alt: SJS_BLK, note: 'Edge set with orange trim, chest numbers; black jumping-shark third; stripe colors?' },
    { from: 2014, to: 2017, home: k(SJS_T, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), away: k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), alt: SJS_BLK, note: '2013 set: less orange, lace-up collar' },
    { from: 2018, to: 2018, home: k(SJS_T, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), away: k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), note: 'Adidas, no third' },
    { from: 2019, to: 2022, home: k(SJS_T, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), away: k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), alt: k(BLACK, WHITE, SJS_T, WHITE, BLACK, SJS_T, SJS_GY), note: 'black "Stealth" third; trims?' },
    { from: 2023, to: 2023, home: k(SJS_T, WHITE, BLACK, WHITE, WHITE, WHITE, BLACK), away: k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), note: 'new set after the 1991-98 uniforms; stripe colors?' },
    { from: 2024, home: k(SJS_T, WHITE, BLACK, WHITE, WHITE, WHITE, BLACK), away: k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), alt: k(BLACK, WHITE, SJS_T, WHITE, BLACK, SJS_T, WHITE), note: 'black "Cali Fin" third' },
  ],
  // Wikipedia "Seattle Kraken" (Logo and uniforms)
  SEA: [
    { from: 2022, to: 2025, home: k('#001628', '#99d9d9', WHITE, WHITE, '#001628', '#99d9d9', '#68a2b9'), away: k(WHITE, '#001628', '#99d9d9', '#001628', '#001628', '#001628', '#99d9d9'), note: 'deep sea blue home; number fill/trim and stripe order?' },
    { from: 2026, home: k('#001628', '#99d9d9', WHITE, WHITE, '#001628', '#99d9d9', '#68a2b9'), away: k(WHITE, '#001628', '#99d9d9', '#001628', '#001628', '#001628', '#99d9d9'), alt: k(BLACK, BLACK, '#99d9d9', '#99d9d9', BLACK, '#e9072b', '#99d9d9'), note: 'black glow-in-the-dark third' },
  ],
  // Wikipedia "St. Louis Blues" (Jerseys)
  STL: [
    { from: 2009, to: 2014, home: k(STL_B, WHITE, STL_NV, WHITE, STL_NV, STL_G, STL_NV), away: k(WHITE, STL_B, STL_NV, STL_B, STL_B, STL_B, STL_G), alt: STL_ARCH, note: 'simplified Edge set; navy Gateway Arch third; number and stripe colors?' },
    { from: 2015, to: 2016, home: k(STL_B, STL_G, STL_NV, STL_G, STL_NV, STL_NV, STL_G), away: STL_A2, alt: STL_ARCH, note: '1998-2007 look back, gold home numbers' },
    { from: 2017, to: 2017, home: k(STL_B, STL_G, STL_NV, STL_G, STL_NV, STL_NV, STL_G), away: STL_A2 },
    { from: 2018, to: 2018, home: STL_H3, away: STL_A2, note: 'Adidas: home numbers white' },
    { from: 2019, to: 2025, home: STL_H3, away: STL_A2, alt: STL_HERITAGE, note: '2017 Winter Classic navy heritage third; its stripe colors?' },
    { from: 2026, home: k(STL_LB, STL_G, WHITE, STL_G, STL_G, STL_G, WHITE), away: k(WHITE, STL_LB, STL_G, STL_LB, STL_LB, STL_LB, STL_G), alt: STL_H3, note: 'blue and yellow set after the heritage third; number fill/trim and the blue?' },
  ],
  // Wikipedia "Tampa Bay Lightning" (Logo and jerseys); nhluniforms.com Lightning page; Icethetics Rbk EDGE review
  TBL: [
    { from: 2009, to: 2011, home: k(BLACK, WHITE, TBL_B, WHITE, WHITE, TBL_B, TBL_SV), away: k(WHITE, BLACK, TBL_B, BLACK, BLACK, TBL_B, BLACK), alt: TBL_BOLTS, note: 'black Edge home (blue cuff panel), electric blue "BOLTS" third; number trims?' },
    { from: 2012, to: 2014, home: TBL_H2, away: TBL_A2, alt: TBL_BOLTS, note: 'blue and white rebrand; blue BOLTS third kept?' },
    { from: 2015, to: 2017, home: TBL_H2, away: TBL_A2, alt: k(BLACK, WHITE, TBL_B, WHITE, BLACK, TBL_B, TBL_SV), note: 'black BOLTS third' },
    { from: 2018, to: 2018, home: TBL_H2, away: TBL_A2, note: 'Adidas, TAMPA BAY dropped from the road; no third' },
    { from: 2019, to: 2022, home: TBL_H2, away: TBL_A2, alt: k(BLACK, '#3a3a3a', '#7a7a7a', '#7a7a7a', BLACK, '#3a3a3a', '#7a7a7a'), note: 'all-black sublimated third; its grays?' },
    { from: 2023, to: 2023, home: TBL_H2, away: TBL_A2 },
    { from: 2024, home: TBL_H2, away: TBL_A2, alt: k(BLACK, WHITE, TBL_B, WHITE, BLACK, TBL_B, WHITE), note: 'black roundel third (victory stripes, drop-shadow numbers); still the third in 2026-27?' },
  ],
  // Wikipedia "Toronto Maple Leafs" (Logo and uniform)
  TOR: [
    { from: 2009, to: 2010, home: TOR_H, away: TOR_A, alt: k(WHITE, TOR_B, TOR_B, TOR_B, TOR_B, TOR_B), note: 'Edge set (no waist stripes); white 1960s throwback third' },
    { from: 2011, to: 2016, home: TOR_H, away: TOR_A, alt: k(TOR_B, WHITE, WHITE, WHITE, TOR_B, WHITE), note: 'lace-up collars, waist stripes back; 1967-70 blue third' },
    { from: 2017, home: TOR_H, away: TOR_A, note: 'centennial leaf set; the black "Next Gen" third worn only occasionally' },
  ],
  // Wikipedia "Utah Mammoth" (Logo, colors, and uniforms)
  UTA: [
    { from: 2025, to: 2025, home: k(BLACK, WHITE, '#6cace4', WHITE, BLACK, '#6cace4', WHITE), away: k(WHITE, BLACK, '#6cace4', BLACK, BLACK, BLACK, '#6cace4'), note: 'Utah Hockey Club: black with diagonal UTAH; number trims?' },
    { from: 2026, home: k(BLACK, WHITE, '#6cace4', WHITE, BLACK, '#6cace4', WHITE), away: k(WHITE, BLACK, '#6cace4', BLACK, BLACK, BLACK, '#6cace4'), note: 'Mammoth: logo crest at home, italic UTAH on the road, Mammoth Sans numbers' },
  ],
  // Wikipedia "Vancouver Canucks" (Logos and jerseys)
  VAN: [
    { from: 2009, to: 2017, home: VAN_H, away: VAN_A, alt: k(VAN_B, WHITE, VAN_G, WHITE, VAN_G, VAN_G, WHITE), note: '"Vancouver" over the orca; stick-in-rink third from 2008-09; number trims?' },
    { from: 2018, to: 2019, home: VAN_H, away: VAN_A, note: 'Adidas; a regular third?' },
    { from: 2020, to: 2022, home: VAN_H, away: VAN_A, note: '"Vancouver" script dropped; the 2019 heritage set left out?' },
    { from: 2023, home: VAN_H, away: VAN_A, alt: k(BLACK, VAN_Y, VAN_R, VAN_Y, BLACK, VAN_R, VAN_Y), note: 'black Flying Skate third; number fill?' },
  ],
  // Wikipedia "Vegas Golden Knights" (Logos, colors, and uniforms)
  VGK: [
    { from: 2018, to: 2020, home: VGK_GRAY, away: VGK_A, note: 'steel gray home; number fill gold or white?' },
    { from: 2021, to: 2022, home: VGK_GRAY, away: VGK_A, alt: VGK_GOLD, note: 'gold third (the road with gold and white swapped)' },
    { from: 2023, home: VGK_GOLD, away: VGK_A, alt: VGK_GRAY, note: 'gold becomes home, gray the third' },
  ],
  // Wikipedia "Winnipeg Jets" (Jerseys)
  WPG: [
    { from: 2012, to: 2018, home: k(WPG_NV, WHITE, WPG_AB, WHITE, WPG_NV, WPG_SV, WPG_AB), away: k(WHITE, WPG_NV, WPG_AB, WPG_NV, WPG_NV, WPG_NV, WPG_AB), note: 'RCAF-inspired set; number trims and stripe colors?' },
    { from: 2019, to: 2021, home: k(WPG_NV, WHITE, WPG_AB, WHITE, WPG_NV, WPG_SV, WPG_AB), away: k(WHITE, WPG_NV, WPG_AB, WPG_NV, WPG_NV, WPG_NV, WPG_AB), alt: k(WPG_AB, WHITE, WPG_NV, WHITE, WPG_NV, WPG_NV, WHITE), note: 'aviator blue third' },
    { from: 2022, home: k(WPG_NV, WHITE, WPG_AB, WHITE, WPG_NV, WPG_SV, WPG_AB), away: k(WHITE, WPG_NV, WPG_AB, WPG_NV, WPG_NV, WPG_NV, WPG_AB), alt: k(WPG_HB, WPG_R, WHITE, WPG_R, WPG_HB, WHITE, WPG_R), note: 'blue 1973-78 style heritage third; its blue and trims?' },
  ],
  // Wikipedia "Washington Capitals" (Logos and jerseys)
  WSH: [
    { from: 2009, to: 2011, home: WSH_H, away: WSH_A, note: 'red/white/blue Edge set; number trims?' },
    { from: 2012, to: 2012, home: WSH_H, away: WSH_A, alt: k(WHITE, WSH_R, WSH_NV, WSH_R, WSH_NV, WSH_R, WSH_NV), note: '2011 Winter Classic white as a road third (16 games)' },
    { from: 2013, to: 2015, home: WSH_H, away: WSH_A },
    { from: 2016, to: 2017, home: WSH_H, away: WSH_A, alt: WSH_RETRO, note: 'red 1974-style throwback third' },
    { from: 2018, to: 2018, home: WSH_H, away: WSH_A, note: 'Adidas, no third' },
    { from: 2019, to: 2021, home: WSH_H, away: WSH_A, alt: WSH_RETRO },
    { from: 2022, to: 2024, home: WSH_H, away: WSH_A, alt: k(WSH_NV, WHITE, WSH_R, WHITE, WHITE, WHITE, WSH_R), note: 'navy "W" third with white yoke; first season 2021-22?' },
    { from: 2025, to: 2025, home: WSH_H, away: WSH_A, alt: k(BLACK, WHITE, '#b87333', WHITE, BLACK, '#00205b', '#b87333'), note: 'black screaming-eagle third (blue and copper); trims?' },
    { from: 2026, home: WSH_H, away: WSH_A, alt: k(WSH_R, WHITE, WSH_NV, WHITE, WHITE, WSH_NV, WHITE), note: 'red screaming-eagle third, white yoke' },
  ],
};

// (helmets: the NFL's alone)
export const HELMET_ERAS: HelmetTable = {};
