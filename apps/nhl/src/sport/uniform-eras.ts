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
// The sweater's cut (what the splash draws, from behind): `yoke` a contrasting shoulder yoke (edged in `piping`),
// `bands` the arm stripes top to bottom, `hem` the waist stripes top to bottom, `collarStyle` ('v' for most,
// 'lace' for the lace-up classics), `numberFont` ('varsity' where the numbers carry two outlines). A sweater
// whose arms are striped but whose waist is plain lists its body color as its one hem stripe (drawn, invisible).
// Striping that isn't horizontal bands (the Flyers' wings down the arms, the Avalanche's color blocks, the
// Canadiens' and Panthers' chest bands, the Kachina stair-steps, the Thrashers' one-shoulder yoke) is
// approximated with the nearest bands or yoke, or left off.
//
// Sources: the English Wikipedia team articles' logo/uniform sections (read 2026-10-15) and their uniform
// diagrams (the 2026-27 sets, read 2026-10-16); the NHL Uniform Database (nhluniforms.com) team pages for the
// Lightning and the Wild; SportsLogos.net's "All the new NHL uniforms for 2025-26" roundup; an Icethetics 2007
// Rbk EDGE review (Lightning); the splash audit of 2026-10-16 (scratchpad splash-round2/audit-nhl.json).
// Hexes are the teams' published palette values (teamcolorcodes.com-style); where a jersey's own shade isn't
// known, the team's standard one.
import type { KitColors, HelmetTable, UniformTable } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee';
const BLACK = '#111111';
const CREAM = '#efe6d2';
const SILVER = '#a2aaad';

// A kit: its body, the numbers' fill and outline, the name's letters, the collar, and its sleeve stripes'
// colors (no stripe color: no sleeve stripes); a V collar and block numbers unless the details say otherwise
const k = (body: string, num: string, outline: string, name: string, collar: string, stripe?: string, stripe2?: string): KitColors =>
  stripe
    ? { body, num, outline, name, collar, sleeve: 'stripes', stripe, ...(stripe2 ? { stripe2 } : {}), collarStyle: 'v', numberFont: 'block' }
    : { body, num, outline, name, collar, sleeve: 'none', collarStyle: 'v', numberFont: 'block' };
// A kit with its cut's details filled in (the yoke, the bands, the hem, the collar's style)
const d = (kit: KitColors, x: Partial<KitColors>): KitColors => ({ ...kit, ...x });

// Anaheim: black, orange, metallic gold (the 2025 set: Ducks orange)
const ANA_OR = '#f47a38', ANA_GD = '#b9975b', ANA_OR2 = '#fc4c02', ANA_PU = '#4f2683', ANA_JD = '#00857c';
const ANA_H1 = d(k(BLACK, WHITE, ANA_GD, WHITE, BLACK, ANA_GD, ANA_OR), { bands: [ANA_GD, ANA_OR, ANA_GD], hem: [ANA_GD, ANA_OR, ANA_GD] });
const ANA_A1 = d(k(WHITE, BLACK, ANA_GD, BLACK, BLACK, ANA_GD, ANA_OR), { bands: [BLACK, ANA_OR, ANA_GD], hem: [BLACK, ANA_OR, ANA_GD] });
const ANA_WEBD = d(k(BLACK, WHITE, ANA_OR, WHITE, BLACK, ANA_OR, ANA_GD), { bands: [ANA_OR, ANA_GD], hem: [ANA_OR, ANA_GD] });
const ANA_H2 = ANA_WEBD;
const ANA_A2 = d(k(WHITE, BLACK, ANA_OR, BLACK, BLACK, ANA_OR, ANA_GD), { bands: [ANA_OR, ANA_GD], hem: [ANA_OR, ANA_GD] });
const ANA_ORALT = d(k(ANA_OR, BLACK, WHITE, BLACK, BLACK, BLACK, ANA_GD), { bands: [BLACK, ANA_GD, BLACK], hem: [BLACK, ANA_GD, BLACK] });
const ANA_H3 = d(k(ANA_OR2, BLACK, WHITE, BLACK, BLACK, BLACK, ANA_GD), { bands: [BLACK, ANA_GD, WHITE], hem: [BLACK, ANA_GD, WHITE], numberFont: 'rounded' });
const ANA_A3 = d(k(WHITE, ANA_OR2, BLACK, ANA_OR2, ANA_OR2, BLACK, ANA_GD), { yoke: ANA_OR2, bands: [BLACK, ANA_GD, WHITE], hem: [BLACK, ANA_GD, WHITE], numberFont: 'rounded' });

// Phoenix / Arizona: Sedona red, desert sand, black; the Kachina set black with green, brick red and sand
const COY_R = '#8c2633', COY_S = '#e2d6b5', COY_G = '#2c5234';
const COY_H = d(k(COY_R, WHITE, BLACK, WHITE, BLACK, BLACK, COY_S), { bands: [BLACK, COY_S, BLACK], hem: [BLACK, COY_S, BLACK], collarStyle: 'lace', numberFont: 'varsity' });
const COY_A = d(k(WHITE, COY_R, BLACK, COY_R, COY_R, COY_R, BLACK), { yoke: COY_R, bands: [COY_R, COY_S], hem: [COY_R, COY_S], collarStyle: 'lace', numberFont: 'varsity' });
const COY_A2 = d(COY_A, { bands: [COY_R, BLACK, COY_S], hem: [COY_R, BLACK, COY_S] });
const KACHINA = d(k(BLACK, WHITE, COY_R, WHITE, COY_G, COY_R, COY_G), { yoke: COY_G, piping: COY_R, bands: [COY_S, COY_R, COY_G], hem: [COY_S, COY_R, COY_G] });
const KACHINA_W = d(k(WHITE, BLACK, COY_R, BLACK, COY_G, COY_R, COY_G), { yoke: COY_G, piping: COY_R, bands: [COY_S, COY_R, COY_G], hem: [COY_S, COY_R, COY_G] });

// Boston: black and gold (PMS 1235)
const BOS_G = '#ffb81c';
const BOS_H = d(k(BLACK, BOS_G, WHITE, WHITE, BLACK, BOS_G, WHITE), { bands: [WHITE, BOS_G, WHITE], hem: [WHITE, BOS_G, WHITE], collarStyle: 'lace' });
const BOS_A = d(k(WHITE, BLACK, BOS_G, BLACK, BLACK, BLACK, BOS_G), { yoke: BLACK, bands: [BLACK, BOS_G, BLACK], hem: [BLACK, BOS_G, BLACK], collarStyle: 'lace' });

// Buffalo: navy, gold, silver (2009-2020); royal blue and gold (2021 on)
const BUF_NV = '#002654', BUF_G = '#ffb81c', BUF_SV = '#a2aaad', BUF_RY = '#003087', BUF_RD = '#c8102e';
const BUF_H2 = d(k(BUF_NV, WHITE, BUF_G, WHITE, BUF_G, BUF_G, WHITE), { bands: [BUF_G, WHITE], hem: [BUF_G, WHITE] });
const BUF_A2 = d(k(WHITE, BUF_NV, BUF_G, BUF_NV, BUF_NV, BUF_NV, BUF_G), { yoke: BUF_NV, piping: BUF_G, bands: [BUF_G, WHITE, BUF_NV], hem: [BUF_G, WHITE, BUF_NV] });
const BUF_H3 = d(k(BUF_RY, WHITE, BUF_G, WHITE, BUF_RY, BUF_G, WHITE), { bands: [BUF_G, WHITE], hem: [BUF_G, WHITE] });
const BUF_A3 = d(k(WHITE, BUF_RY, BUF_G, BUF_RY, BUF_RY, BUF_RY, BUF_G), { yoke: BUF_RY, piping: BUF_G, bands: [BUF_G, WHITE, BUF_RY], hem: [BUF_G, WHITE, BUF_RY] });

// Carolina: red, black, silver
const CAR_R = '#ce1126', CAR_SV = '#a2aaad';
const CAR_H1 = d(k(CAR_R, WHITE, BLACK, WHITE, BLACK, BLACK, CAR_SV), { bands: [BLACK, WHITE, BLACK], hem: [BLACK, WHITE, BLACK], numberFont: 'varsity' });
const CAR_A1 = d(k(WHITE, CAR_R, BLACK, CAR_R, CAR_R, CAR_R, BLACK), { bands: [CAR_R, BLACK, CAR_R], hem: [CAR_R, BLACK, CAR_R], numberFont: 'varsity' });
const CAR_BALT1 = d(k(BLACK, WHITE, CAR_R, WHITE, BLACK, CAR_R, CAR_SV), { bands: [CAR_R, CAR_SV, CAR_R], hem: [CAR_R, CAR_SV, CAR_R] });
const CAR_H2 = d(k(CAR_R, WHITE, BLACK, WHITE, BLACK, WHITE), { bands: [WHITE], hem: [WHITE] });
const CAR_A2 = d(k(WHITE, BLACK, CAR_R, CAR_R, CAR_R, BLACK, CAR_R), { bands: [BLACK, CAR_R, BLACK], hem: [BLACK, CAR_R, BLACK] });
const CAR_H3 = d(k(CAR_R, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), { bands: [BLACK, WHITE, BLACK], hem: [BLACK, WHITE, BLACK] });
const CAR_BLK = d(k(BLACK, WHITE, CAR_R, WHITE, BLACK, CAR_R, WHITE), { bands: [CAR_R, WHITE, CAR_R], hem: [CAR_R, WHITE, CAR_R] });
const CAR_CANES = d(k(WHITE, CAR_R, BLACK, CAR_R, CAR_R, CAR_R, BLACK), { bands: [CAR_R, BLACK, CAR_R], hem: [CAR_R, BLACK, CAR_R] });

// Columbus: union blue, goal red, silver; the cannon third with light blue and vintage white
const CBJ_NV = '#002654', CBJ_R = '#ce1126', CBJ_LB = '#7ca0c7', CBJ_VW = '#ece4cf';
const CBJ_H = d(k(CBJ_NV, WHITE, CBJ_R, WHITE, CBJ_R, WHITE, CBJ_R), { bands: [WHITE, CBJ_R, WHITE], hem: [WHITE, CBJ_R, WHITE], collarStyle: 'lace' });
const CBJ_A = d(k(WHITE, CBJ_NV, CBJ_R, CBJ_NV, CBJ_NV, CBJ_NV, CBJ_R), { bands: [CBJ_NV, CBJ_R, CBJ_NV], hem: [CBJ_NV, CBJ_R, CBJ_NV], collarStyle: 'lace' });
const CBJ_CANNON = d(k(CBJ_NV, CBJ_VW, CBJ_LB, CBJ_VW, CBJ_NV, CBJ_LB, CBJ_VW), { bands: [CBJ_LB, CBJ_VW, CBJ_LB], hem: [CBJ_LB, CBJ_VW, CBJ_LB], collarStyle: 'lace' });

// Calgary: red, gold (yellow), black
const CGY_R = '#c8102e', CGY_G = '#f1be48';
// (the 2007-2020 Edge set striped the SIDES vertically; the arms end in a black cuff, the waist is plain)
const CGY_H1 = d(k(CGY_R, WHITE, BLACK, WHITE, BLACK, BLACK, CGY_G), { bands: [BLACK], hem: [CGY_R] });
const CGY_A1 = d(k(WHITE, CGY_R, BLACK, CGY_R, BLACK, CGY_R, BLACK), { bands: [BLACK], hem: [WHITE] });
const CGY_RETRO = d(k(CGY_R, WHITE, CGY_G, WHITE, CGY_R, CGY_G, WHITE), { bands: [WHITE, CGY_G, WHITE], hem: [WHITE, CGY_G, WHITE] });
const CGY_A2 = d(k(WHITE, CGY_R, CGY_G, CGY_R, CGY_R, CGY_R, CGY_G), { yoke: CGY_R, bands: [CGY_R, CGY_G, CGY_R], hem: [CGY_R, CGY_G, CGY_R] });

// Chicago: red, black, white
const CHI_R = '#cf0a2c';
const CHI_H = d(k(CHI_R, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), { bands: [BLACK, WHITE, BLACK], hem: [BLACK, WHITE, BLACK] });
const CHI_A = d(k(WHITE, CHI_R, BLACK, CHI_R, BLACK, BLACK, CHI_R), { bands: [BLACK, CHI_R, BLACK], hem: [BLACK, CHI_R, BLACK] });
const CHI_BLK = d(k(BLACK, WHITE, CHI_R, WHITE, CHI_R, CHI_R, WHITE), { bands: [CHI_R, WHITE, CHI_R], hem: [CHI_R, WHITE, CHI_R] });

// Colorado: burgundy, steel blue, black, silver (the 1995-2017 jersey is color-blocked: steel blue lower
// sleeves and hem under black/white zigzags; drawn as one wide band and a hem)
const COL_BU = '#6f263d', COL_SB = '#236192', COL_SV = '#a2aaad', COL_NV = '#00205b';
const COL_H1 = d(k(COL_BU, WHITE, COL_SB, WHITE, COL_SB, COL_SB, BLACK), { bands: [COL_SB], hem: [COL_SB] });
const COL_A1 = d(k(WHITE, COL_BU, COL_SB, COL_BU, COL_BU, COL_BU, COL_SB), { bands: [COL_SB], hem: [COL_SB] });
const COL_H2 = d(k(COL_BU, WHITE, COL_SB, WHITE, COL_SB, COL_SB, COL_SV), { bands: [COL_SV, COL_SB], hem: [COL_SV, COL_SB] });
const COL_A2 = d(k(WHITE, COL_SB, COL_BU, COL_BU, COL_BU, COL_BU, COL_SB), { bands: [COL_SV, COL_SB], hem: [COL_SV, COL_SB] });
const COL_STEEL = d(k(COL_SB, WHITE, COL_BU, WHITE, COL_BU, COL_BU, WHITE), { yoke: COL_BU, bands: [COL_BU, WHITE], hem: [COL_BU, WHITE] });
const COL_NAVY = d(k(COL_NV, WHITE, COL_BU, WHITE, COL_NV, COL_BU, WHITE), { bands: [COL_BU, WHITE, COL_BU], hem: [COL_BU, WHITE, COL_BU] });

// Dallas: black, green, gold (2009-2013); victory green, black, silver (2014 on)
const DAL_GR = '#006a4e', DAL_GD = '#b5985a', DAL_VG = '#006847', DAL_SV = '#8f8f8c', DAL_NEON = '#69be28';
const DAL_H1 = d(k(BLACK, WHITE, DAL_GD, WHITE, BLACK, DAL_GR, DAL_GD), { bands: [DAL_GD, DAL_GR, DAL_GD], hem: [DAL_GD, DAL_GR, DAL_GD] });
const DAL_A1 = d(k(WHITE, DAL_GR, BLACK, DAL_GR, BLACK, BLACK, DAL_GR), { bands: [BLACK, DAL_GR, BLACK], hem: [BLACK, DAL_GR, BLACK] });
const DAL_ARCH = d(k(WHITE, DAL_GR, DAL_GD, DAL_GR, DAL_GR, DAL_GR, DAL_GD), { bands: [DAL_GR, DAL_GD, DAL_GR], hem: [DAL_GR, DAL_GD, DAL_GR] });
const DAL_H2 = d(k(DAL_VG, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), { bands: [WHITE, BLACK], hem: [WHITE, BLACK] });
const DAL_A2 = d(k(WHITE, DAL_VG, BLACK, DAL_VG, DAL_VG, BLACK, DAL_VG), { yoke: DAL_VG, bands: [DAL_VG, BLACK], hem: [DAL_VG, BLACK] });
const DAL_BLACKOUT = d(k(BLACK, BLACK, DAL_NEON, DAL_NEON, BLACK, DAL_NEON, DAL_SV), { bands: [DAL_NEON, DAL_SV], hem: [DAL_NEON, DAL_SV] });
const DAL_99 = d(k(BLACK, WHITE, DAL_VG, WHITE, DAL_VG, DAL_VG, DAL_SV), { bands: [DAL_VG], hem: [DAL_VG], numberFont: 'varsity' });

// Detroit: red and white (the white's lower sleeves are red: one wide band)
const DET_R = '#ce1126';
const DET_H = d(k(DET_R, WHITE, WHITE, WHITE, DET_R, WHITE), { bands: [WHITE], hem: [WHITE] });
const DET_A = d(k(WHITE, DET_R, DET_R, DET_R, DET_R, DET_R), { bands: [DET_R], hem: [DET_R] });

// Edmonton: midnight blue and copper (to 2009), royal blue (PMS 287) and orange, navy
const EDM_MID = '#041e42', EDM_CU = '#b87333', EDM_RD = '#c8102e', EDM_RB = '#003087', EDM_OR = '#fc4c02', EDM_NV = '#041e42';
const EDM_MIDH = d(k(EDM_MID, WHITE, EDM_CU, WHITE, EDM_CU, EDM_CU, EDM_RD), { bands: [EDM_CU, EDM_RD, SILVER], hem: [EDM_MID] });
const EDM_MIDA = d(k(WHITE, EDM_MID, EDM_CU, EDM_MID, EDM_MID, EDM_MID, EDM_CU), { bands: [EDM_MID, EDM_CU, SILVER], hem: [WHITE] });
const EDM_ROYAL = d(k(EDM_RB, WHITE, EDM_OR, WHITE, EDM_OR, EDM_OR, WHITE), { bands: [WHITE, EDM_OR, WHITE], hem: [WHITE, EDM_OR, WHITE] });
const EDM_A2 = d(k(WHITE, EDM_RB, EDM_OR, EDM_RB, EDM_RB, EDM_OR, EDM_RB), { bands: [EDM_OR, EDM_RB, EDM_OR], hem: [EDM_OR, EDM_RB, EDM_OR] });
const EDM_WHA = d(k(EDM_OR, EDM_RB, WHITE, EDM_RB, EDM_RB, EDM_RB, WHITE), { bands: [EDM_RB, WHITE, EDM_RB], hem: [EDM_RB, WHITE, EDM_RB] });
const EDM_ORANGE = d(k(EDM_OR, EDM_NV, WHITE, EDM_NV, EDM_NV, EDM_NV, WHITE), { bands: [EDM_NV, WHITE], hem: [EDM_NV, WHITE] });
const EDM_A3 = d(k(WHITE, EDM_NV, EDM_OR, EDM_NV, EDM_NV, EDM_NV, EDM_OR), { bands: [EDM_NV, EDM_OR], hem: [EDM_NV, EDM_OR] });
const EDM_NAVY = d(k(EDM_NV, EDM_OR, EDM_OR, EDM_OR, EDM_NV, EDM_OR), { bands: [EDM_OR], hem: [EDM_NV] });
const EDM_TAN = d(k('#d6c6a2', EDM_RB, EDM_OR, EDM_RB, EDM_RB, EDM_RB, EDM_OR), { yoke: EDM_RB, bands: [EDM_RB, EDM_OR], hem: [EDM_RB, EDM_OR] });

// Florida: navy, red, yellow (to 2016); red, navy, flat gold (2017 on: a thick navy chest band edged gold, the
// same band round the arms, a plain hem)
const FLA_NV = '#041e42', FLA_R = '#c8102e', FLA_Y = '#ffd100', FLA_G = '#b9975b', FLA_PB = '#9fc5e8';
const FLA_H0 = d(k(FLA_NV, WHITE, FLA_R, WHITE, FLA_R, FLA_R, FLA_Y), { bands: [FLA_R, FLA_Y, FLA_R], hem: [FLA_R, FLA_Y, FLA_R] });
const FLA_H1 = d(k(FLA_R, WHITE, FLA_NV, WHITE, FLA_NV, FLA_NV, FLA_Y), { bands: [FLA_NV, FLA_Y, FLA_NV], hem: [FLA_NV, FLA_Y, FLA_NV] });
const FLA_A1 = d(k(WHITE, FLA_R, FLA_NV, FLA_NV, FLA_NV, FLA_R, FLA_Y), { yoke: FLA_NV, bands: [FLA_R, FLA_NV, FLA_Y], hem: [FLA_R, FLA_NV] });
const FLA_RND = d(k(FLA_NV, WHITE, FLA_PB, WHITE, FLA_PB, FLA_PB, FLA_Y), { bands: [FLA_PB, FLA_Y, FLA_PB], hem: [FLA_PB, FLA_Y, FLA_PB] });
const FLA_H2 = d(k(FLA_R, WHITE, FLA_NV, WHITE, FLA_NV, FLA_NV, FLA_G), { bands: [FLA_G, FLA_NV, FLA_G], hem: [FLA_R] });
const FLA_A2 = d(k(WHITE, FLA_R, FLA_NV, FLA_NV, FLA_NV, FLA_NV, FLA_G), { bands: [FLA_G, FLA_NV, FLA_G], hem: [WHITE] });

// Los Angeles: black, silver, (to 2011) purple
const LAK_SV = '#a2aaad', LAK_PU = '#572a84';
const LAK_H1 = d(k(BLACK, WHITE, LAK_PU, WHITE, LAK_PU, LAK_PU, LAK_SV), { bands: [LAK_PU, LAK_SV, LAK_PU], hem: [LAK_PU, LAK_SV, LAK_PU] });
const LAK_A1 = d(k(WHITE, BLACK, LAK_PU, BLACK, LAK_PU, LAK_PU, LAK_SV), { bands: [LAK_PU, LAK_SV, LAK_PU], hem: [LAK_PU, LAK_SV, LAK_PU] });
const LAK_H2 = d(k(BLACK, WHITE, LAK_SV, WHITE, BLACK, LAK_SV, WHITE), { bands: [LAK_SV, WHITE, LAK_SV], hem: [BLACK] });
const LAK_A2 = d(k(WHITE, BLACK, LAK_SV, BLACK, BLACK, BLACK, LAK_SV), { bands: [BLACK, LAK_SV], hem: [BLACK, LAK_SV] });
const LAK_SILVER = d(k(LAK_SV, BLACK, WHITE, BLACK, BLACK, BLACK, WHITE), { bands: [BLACK, WHITE, BLACK], hem: [BLACK, WHITE, BLACK] });
const LAK_H3 = d(k(BLACK, WHITE, LAK_SV, WHITE, BLACK, WHITE, LAK_SV), { bands: [WHITE, LAK_SV, WHITE], hem: [WHITE, LAK_SV, WHITE] });

// Minnesota: Iron Range red, forest green, harvest gold (wheat)
const MIN_RD = '#a6192e', MIN_GR = '#154734', MIN_WH = '#ddcba4';
const MIN_H1 = d(k(MIN_RD, MIN_GR, MIN_WH, MIN_GR, MIN_GR, MIN_GR, MIN_WH), { bands: [MIN_WH, MIN_GR, MIN_WH], hem: [MIN_WH, MIN_GR, MIN_WH] });
const MIN_A1 = d(k(WHITE, MIN_RD, MIN_WH, MIN_RD, MIN_GR, MIN_GR, MIN_RD), { bands: [MIN_GR, MIN_RD, MIN_GR], hem: [MIN_GR, MIN_RD, MIN_GR] });
const MIN_A2 = d(k(WHITE, MIN_GR, MIN_WH, MIN_GR, MIN_GR, MIN_GR, MIN_RD), { bands: [MIN_GR, MIN_RD, MIN_GR], hem: [MIN_GR, MIN_RD, MIN_GR] });
const MIN_GALT = d(k(MIN_GR, MIN_WH, MIN_RD, MIN_WH, MIN_RD, MIN_WH, MIN_RD), { bands: [MIN_WH, MIN_RD, MIN_WH], hem: [MIN_WH, MIN_RD, MIN_WH] });
const MIN_H2 = d(k(MIN_GR, MIN_WH, MIN_RD, MIN_WH, MIN_GR, MIN_WH, MIN_RD), { bands: [MIN_RD, MIN_WH], hem: [MIN_RD, MIN_WH], collarStyle: 'lace' });
const MIN_NORTH = d(k(MIN_GR, MIN_WH, WHITE, MIN_WH, MIN_GR, WHITE, MIN_WH), { bands: [WHITE, MIN_WH, WHITE], hem: [WHITE, MIN_WH, WHITE], collarStyle: 'lace' });

// Montreal: red, blue, white (the red's blue chest band isn't drawn; the white's lower sleeves are red)
const MTL_R = '#af1e2d', MTL_B = '#192168';
const MTL_H = d(k(MTL_R, WHITE, MTL_B, WHITE, MTL_B, MTL_B, WHITE), { bands: [WHITE, MTL_B, WHITE], hem: [WHITE, MTL_B, WHITE], collarStyle: 'lace' });
const MTL_A = d(k(WHITE, MTL_R, MTL_B, MTL_R, MTL_R, MTL_R, MTL_B), { yoke: MTL_R, bands: [MTL_B, MTL_R], hem: [MTL_B, MTL_R], collarStyle: 'lace' });

// New Jersey: red, black, white
const NJD_R = '#ce1126';
const NJD_H = d(k(NJD_R, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), { bands: [WHITE, BLACK, WHITE], hem: [WHITE, BLACK] });
const NJD_A = d(k(WHITE, NJD_R, BLACK, NJD_R, BLACK, BLACK, NJD_R), { bands: [BLACK, NJD_R, BLACK], hem: [BLACK, NJD_R] });
const NJD_H2 = d(NJD_H, { bands: [WHITE, BLACK], hem: [NJD_R] });
const NJD_A2 = d(NJD_A, { bands: [NJD_R, BLACK], hem: [WHITE] });
const NJD_JERSEY = d(k(BLACK, WHITE, NJD_R, WHITE, BLACK, WHITE), { bands: [WHITE], hem: [WHITE] });

// Nashville: navy and gold
const NSH_NV = '#041e42', NSH_G = '#ffb81c';
const NSH_H1 = d(k(NSH_NV, WHITE, NSH_G, WHITE, SILVER, NSH_G, WHITE), { yoke: SILVER, bands: [NSH_G, WHITE, NSH_G], hem: [NSH_G, WHITE, NSH_G] });
const NSH_A1 = d(k(WHITE, NSH_NV, NSH_G, NSH_NV, NSH_NV, NSH_NV, NSH_G), { yoke: SILVER, bands: [NSH_NV, NSH_G, NSH_NV], hem: [NSH_NV, NSH_G, NSH_NV] });
const NSH_CHECK = d(k(NSH_NV, WHITE, BLACK, WHITE, BLACK, BLACK, NSH_NV), { bands: [BLACK, NSH_NV, BLACK], hem: [BLACK, NSH_NV, BLACK] });
const NSH_H2 = d(k(NSH_G, NSH_NV, WHITE, NSH_NV, NSH_NV, NSH_NV, WHITE), { bands: [WHITE, NSH_NV], hem: [WHITE, NSH_NV] });
const NSH_A2 = d(k(WHITE, NSH_NV, NSH_G, NSH_NV, NSH_NV, NSH_G, NSH_NV), { bands: [NSH_G, NSH_NV], hem: [NSH_G, NSH_NV] });
const NSH_A3 = d(NSH_A2, { yoke: NSH_G });

// Islanders: navy and orange (to 2010), royal blue and orange
const NYI_NV = '#00205b', NYI_RY = '#00539b', NYI_O = '#f47d30', NYI_GY = '#8a8d8f';
const NYI_H1 = d(k(NYI_NV, WHITE, NYI_O, WHITE, NYI_NV, NYI_O), { bands: [NYI_O], hem: [NYI_NV] });
const NYI_A1 = d(k(WHITE, NYI_NV, NYI_O, NYI_NV, NYI_NV, NYI_O), { bands: [NYI_O], hem: [WHITE] });
const NYI_ROYAL = d(k(NYI_RY, WHITE, NYI_O, WHITE, NYI_O, NYI_O, WHITE), { bands: [WHITE, NYI_O, WHITE], hem: [WHITE, NYI_O, WHITE] });
const NYI_A2 = d(k(WHITE, NYI_RY, NYI_O, NYI_RY, NYI_RY, NYI_RY, NYI_O), { bands: [NYI_RY, NYI_O, NYI_RY], hem: [NYI_RY, NYI_O, NYI_RY] });
const NYI_BLACK = d(k(BLACK, NYI_O, WHITE, NYI_O, BLACK, NYI_RY, NYI_O), { yoke: NYI_GY, bands: [NYI_RY, NYI_O, NYI_RY], hem: [NYI_RY, NYI_O, NYI_RY] });
const NYI_SS = d(k(NYI_RY, WHITE, NYI_O, NYI_RY, WHITE, WHITE, NYI_O), { yoke: WHITE, bands: [WHITE, NYI_O], hem: [WHITE, NYI_O] });
const NYI_BKLYN = d(k(BLACK, WHITE, WHITE, WHITE, BLACK, WHITE), { bands: [WHITE], hem: [WHITE] });
const NYI_BLUEALT = d(k(NYI_RY, NYI_O, WHITE, WHITE, NYI_RY, WHITE, NYI_O), { yoke: WHITE, bands: [WHITE, NYI_O], hem: [WHITE, NYI_O] });

// Rangers: blue, red, white; the thirds navy (the diagonal wordmark leaves the chest stripe-free: arm and
// hem bands only, red-white-red)
const NYR_B = '#0038a8', NYR_R = '#ce1126', NYR_NV = '#002d72', NYR_LB = '#6caddf';
const NYR_H = d(k(NYR_B, WHITE, NYR_R, WHITE, NYR_R, NYR_R, WHITE), { bands: [NYR_R, WHITE, NYR_R], hem: [NYR_R, WHITE, NYR_R], collarStyle: 'lace' });
const NYR_A = d(k(WHITE, NYR_B, NYR_R, NYR_B, NYR_B, NYR_B, NYR_R), { bands: [NYR_B, NYR_R, NYR_B], hem: [NYR_B, NYR_R, NYR_B], collarStyle: 'lace' });
const NYR_HERITAGE = d(k(NYR_NV, CREAM, NYR_R, CREAM, NYR_NV, CREAM, NYR_R), { bands: [CREAM, NYR_R, CREAM], hem: [CREAM, NYR_R, CREAM], collarStyle: 'lace' });
const NYR_SHIELD = d(k(NYR_NV, WHITE, NYR_R, WHITE, NYR_NV, WHITE, NYR_R), { bands: [WHITE, NYR_R, WHITE], hem: [WHITE, NYR_R, WHITE], collarStyle: 'lace' });

// Ottawa: black, red, white, gold (the 2020 rebrand's red is a touch brighter)
const OTT_R = '#c8102e', OTT_R2 = '#da1a32', OTT_G = '#b9975b';
const OTT_H1 = d(k(BLACK, WHITE, OTT_R, WHITE, BLACK, OTT_R, WHITE), { bands: [OTT_R, OTT_G], hem: [OTT_R, OTT_G] });
const OTT_A1 = d(k(WHITE, BLACK, OTT_R, BLACK, BLACK, BLACK, OTT_R), { bands: [OTT_R, BLACK], hem: [OTT_R, BLACK] });
const OTT_SENS = d(k(BLACK, WHITE, OTT_R, WHITE, OTT_R, OTT_R, WHITE), { bands: [OTT_R, WHITE, OTT_R], hem: [OTT_R, WHITE, OTT_R] });
const OTT_BARBER = d(k(BLACK, WHITE, OTT_R, WHITE, BLACK, OTT_R, WHITE), { bands: [OTT_R, WHITE, OTT_R], hem: [OTT_R, WHITE, OTT_R] });
const OTT_NHL100 = d(k(OTT_R, WHITE, BLACK, WHITE, BLACK, BLACK, SILVER), { bands: [BLACK, SILVER, BLACK], hem: [BLACK, SILVER, BLACK] });
const OTT_H2 = d(k(BLACK, WHITE, OTT_R2, WHITE, BLACK, OTT_R2, WHITE), { bands: [OTT_R2, WHITE, OTT_R2], hem: [OTT_R2, WHITE, OTT_R2] });
const OTT_A2 = d(k(WHITE, BLACK, OTT_R2, BLACK, BLACK, BLACK, OTT_R2), { bands: [BLACK, OTT_R2, BLACK], hem: [BLACK, OTT_R2, BLACK] });
const OTT_RED3 = d(k(OTT_R2, WHITE, BLACK, WHITE, BLACK, BLACK, OTT_G), { yoke: BLACK, bands: [OTT_G, BLACK], hem: [OTT_G, BLACK] });

// Philadelphia: orange, black, white (the 2024 set back to burnt orange). The 1973-style sets' stripe is a
// "wing" along each shoulder and down the arm, not a band: drawn as a yoke, the arms plain
const PHI_O = '#f74902', PHI_BO = '#e8541e';
const PHI_BLKH = d(k(BLACK, WHITE, PHI_O, WHITE, WHITE, PHI_O, BLACK), { yoke: WHITE, bands: [PHI_O, BLACK], hem: [BLACK] });
const PHI_EDGEA = d(k(WHITE, PHI_O, BLACK, BLACK, PHI_O, BLACK, WHITE), { yoke: PHI_O, bands: [BLACK, WHITE, BLACK], hem: [WHITE] });
const PHI_73H = d(k(PHI_O, WHITE, BLACK, BLACK, BLACK), { yoke: WHITE, piping: BLACK });
const PHI_73A = d(k(WHITE, PHI_O, BLACK, BLACK, PHI_O), { yoke: PHI_O, piping: BLACK });
const PHI_H24 = d(k(PHI_BO, WHITE, BLACK, BLACK, BLACK), { yoke: WHITE, piping: BLACK, hem: [BLACK] });
const PHI_A24 = d(k(WHITE, PHI_BO, BLACK, BLACK, PHI_BO), { yoke: PHI_BO, piping: BLACK });
const PHI_WC = d(k(PHI_O, BLACK, CREAM, BLACK, CREAM, CREAM, BLACK), { bands: [CREAM, BLACK, CREAM], hem: [CREAM, BLACK, CREAM] });
const PHI_50 = d(k(WHITE, '#b9975b', BLACK, BLACK, PHI_O, PHI_O, BLACK), { bands: [PHI_O, BLACK, PHI_O], hem: [PHI_O, BLACK, PHI_O] });
const PHI_SS = d(k(BLACK, BLACK, WHITE, PHI_O, BLACK, PHI_O, WHITE), { bands: [PHI_O], hem: [PHI_O] });

// Pittsburgh: black and Vegas gold (to 2016), black and Pittsburgh gold
const PIT_VG = '#cfc493', PIT_PG = '#fcb514', PIT_PB = '#80b7e2', PIT_NV = '#00205b';
const PIT_H1 = d(k(BLACK, WHITE, PIT_VG, WHITE, BLACK, PIT_VG, WHITE), { bands: [WHITE, PIT_VG, WHITE], hem: [WHITE, PIT_VG, WHITE] });
const PIT_A1 = d(k(WHITE, BLACK, PIT_VG, BLACK, BLACK, BLACK, PIT_VG), { bands: [PIT_VG, BLACK, PIT_VG], hem: [PIT_VG, BLACK, PIT_VG] });
const PIT_POWDER = d(k(PIT_PB, PIT_NV, WHITE, PIT_NV, PIT_NV, PIT_NV, WHITE), { bands: [PIT_NV, WHITE, PIT_NV], hem: [PIT_NV, WHITE, PIT_NV] });
const PIT_WCNAVY = d(k(PIT_NV, WHITE, PIT_PB, WHITE, PIT_NV, WHITE, PIT_PB), { bands: [WHITE, PIT_PB, WHITE], hem: [WHITE, PIT_PB, WHITE] });
const PIT_H2 = d(k(BLACK, WHITE, PIT_PG, WHITE, PIT_PG, PIT_PG, WHITE), { bands: [PIT_PG, WHITE, PIT_PG], hem: [PIT_PG, WHITE, PIT_PG] });
const PIT_A2 = d(k(WHITE, BLACK, PIT_PG, BLACK, BLACK, BLACK, PIT_PG), { bands: [BLACK, PIT_PG, BLACK], hem: [BLACK, PIT_PG, BLACK] });
const PIT_GOLD = d(k(PIT_PG, BLACK, WHITE, BLACK, BLACK, BLACK, WHITE), { bands: [BLACK, WHITE, BLACK], hem: [BLACK, WHITE, BLACK] });
const PIT_RR = d(k(BLACK, WHITE, PIT_PG, WHITE, PIT_PG, PIT_PG, WHITE), { bands: [PIT_PG, WHITE, PIT_PG], hem: [PIT_PG, WHITE, PIT_PG] });
const PIT_RIVERS = d(k(PIT_PG, BLACK, BLACK, BLACK, BLACK, BLACK), { bands: [BLACK], hem: [BLACK] });

// San Jose: Pacific teal, black, orange (to 2013), white; a black yoke on the teal and a teal one on the
// white through 2022
const SJS_T = '#006d75', SJS_O = '#e57200', SJS_GY = '#5f6a72';
const SJS_H1 = d(k(SJS_T, WHITE, BLACK, WHITE, BLACK, BLACK, SJS_O), { yoke: BLACK, bands: [BLACK, SJS_O], hem: [BLACK, SJS_O] });
const SJS_A1 = d(k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, SJS_O), { yoke: SJS_T, bands: [SJS_T, SJS_O], hem: [SJS_T, SJS_O] });
const SJS_BLK = d(k(BLACK, WHITE, SJS_T, WHITE, BLACK, SJS_T, WHITE), { bands: [SJS_T, WHITE, SJS_T], hem: [SJS_T, WHITE, SJS_T] });
const SJS_H2 = d(k(SJS_T, WHITE, BLACK, WHITE, BLACK, BLACK, WHITE), { yoke: BLACK, bands: [BLACK, WHITE], hem: [BLACK, WHITE], collarStyle: 'lace' });
const SJS_A2 = d(k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), { yoke: SJS_T, bands: [SJS_T, BLACK], hem: [SJS_T, BLACK], collarStyle: 'lace' });
const SJS_STEALTH = d(k(BLACK, WHITE, SJS_T, WHITE, BLACK, SJS_T, SJS_GY), { bands: [SJS_T, SJS_GY], hem: [SJS_T, SJS_GY] });
const SJS_H3 = d(k(SJS_T, WHITE, BLACK, WHITE, WHITE, WHITE, BLACK), { bands: [WHITE, SJS_GY, BLACK], hem: [WHITE, SJS_GY, BLACK] });
const SJS_A3 = d(k(WHITE, SJS_T, BLACK, SJS_T, SJS_T, SJS_T, BLACK), { bands: [SJS_T, SJS_GY, BLACK], hem: [SJS_T, SJS_GY, BLACK] });
const SJS_FIN = d(k(BLACK, WHITE, SJS_T, WHITE, BLACK, SJS_T, WHITE), { bands: [SJS_T, WHITE], hem: [SJS_T, WHITE] });

// Seattle: deep sea blue, ice blue, boundless blue, shadow blue, red alert
const SEA_DS = '#001628', SEA_ICE = '#99d9d9', SEA_SH = '#68a2b9', SEA_RED = '#e9072b';
const SEA_H = d(k(SEA_DS, SEA_ICE, WHITE, WHITE, SEA_DS, SEA_ICE, SEA_SH), { bands: [SEA_ICE, SEA_SH, SEA_RED], hem: [SEA_ICE, SEA_SH, SEA_RED] });
const SEA_A = d(k(WHITE, SEA_DS, SEA_ICE, SEA_DS, SEA_DS, SEA_DS, SEA_ICE), { bands: [SEA_DS, SEA_ICE, SEA_RED], hem: [SEA_DS, SEA_ICE, SEA_RED] });
const SEA_GLOW = d(k(BLACK, BLACK, SEA_ICE, SEA_ICE, BLACK, SEA_RED, SEA_ICE), { bands: [SEA_ICE, SEA_RED], hem: [SEA_ICE, SEA_RED] });

// St. Louis: blue, navy, gold (2026: a lighter blue and yellow after the heritage third); a navy yoke on the
// blue, a blue one on the white, both edged gold
const STL_B = '#002f87', STL_NV = '#041e42', STL_G = '#fcb514', STL_LB = '#0070b9';
const STL_H1 = d(k(STL_B, WHITE, STL_NV, WHITE, STL_NV, STL_G, STL_NV), { yoke: STL_NV, piping: STL_G, bands: [STL_G, STL_NV], hem: [STL_G, STL_NV] });
const STL_A1 = d(k(WHITE, STL_B, STL_NV, STL_B, STL_B, STL_B, STL_G), { yoke: STL_B, piping: STL_G, bands: [STL_G, STL_B], hem: [STL_G, STL_B] });
const STL_ARCH = d(k(STL_NV, WHITE, STL_G, WHITE, STL_NV, STL_G, STL_B), { bands: [STL_G, STL_B, STL_G], hem: [STL_G, STL_B, STL_G] });
const STL_H2 = d(k(STL_B, STL_G, STL_NV, STL_G, STL_NV, STL_NV, STL_G), { yoke: STL_NV, piping: STL_G, bands: [STL_G, STL_NV], hem: [STL_G, STL_NV] });
const STL_H3 = d(k(STL_B, WHITE, STL_NV, WHITE, STL_NV, STL_NV, STL_G), { yoke: STL_NV, piping: STL_G, bands: [STL_G, STL_NV], hem: [STL_G, STL_NV], numberFont: 'varsity' });
const STL_A2 = d(k(WHITE, STL_B, STL_NV, STL_B, STL_B, STL_B, STL_NV), { yoke: STL_B, piping: STL_G, bands: [STL_G, STL_B], hem: [STL_G, STL_B], numberFont: 'varsity' });
const STL_HERITAGE = d(k(STL_NV, WHITE, STL_G, WHITE, STL_NV, STL_G, WHITE), { bands: [STL_G, WHITE, STL_G], hem: [STL_G, WHITE, STL_G] });
const STL_H4 = d(k(STL_LB, STL_G, WHITE, STL_G, STL_G, STL_G, WHITE), { bands: [STL_G, WHITE, STL_G], hem: [STL_G, WHITE, STL_G] });
const STL_A4 = d(k(WHITE, STL_LB, STL_G, STL_LB, STL_LB, STL_LB, STL_G), { yoke: STL_LB, piping: STL_G, bands: [STL_G, STL_LB], hem: [STL_G, STL_LB] });

// Tampa Bay: black, blue, silver (to 2011); blue and white, black trim
const TBL_B = '#002868', TBL_EB = '#0a5cb5', TBL_SV = '#a2aaad';
const TBL_H1 = d(k(BLACK, WHITE, TBL_B, WHITE, BLACK, TBL_B, TBL_SV), { bands: [TBL_B], hem: [BLACK] });
const TBL_A1 = d(k(WHITE, BLACK, TBL_B, BLACK, BLACK, TBL_B, BLACK), { bands: [TBL_B, BLACK], hem: [WHITE] });
const TBL_BOLTS = d(k(TBL_EB, WHITE, BLACK, WHITE, BLACK, BLACK, TBL_SV), { bands: [BLACK, TBL_SV, BLACK], hem: [BLACK, TBL_SV, BLACK] });
const TBL_H2 = d(k(TBL_B, WHITE, BLACK, WHITE, TBL_B, WHITE), { bands: [WHITE], hem: [WHITE], collarStyle: 'lace' });
const TBL_A2 = d(k(WHITE, TBL_B, BLACK, TBL_B, TBL_B, TBL_B), { bands: [TBL_B], hem: [TBL_B], collarStyle: 'lace' });
const TBL_BLKBOLTS = d(k(BLACK, WHITE, TBL_B, WHITE, BLACK, TBL_B, TBL_SV), { bands: [TBL_B, TBL_SV, TBL_B], hem: [TBL_B, TBL_SV, TBL_B] });
const TBL_ALLBLACK = d(k(BLACK, '#3a3a3a', '#7a7a7a', '#7a7a7a', BLACK, '#3a3a3a', '#7a7a7a'), { bands: ['#3a3a3a', '#7a7a7a', '#3a3a3a'], hem: ['#3a3a3a', '#7a7a7a', '#3a3a3a'] });
const TBL_ROUNDEL = d(k(BLACK, WHITE, BLACK, WHITE, BLACK, TBL_B, WHITE), { bands: [WHITE, TBL_B, TBL_SV], hem: [WHITE, TBL_B, TBL_SV] });

// Toronto: blue and white (two arm stripes; waist stripes from 2011, lace collars from 2011)
const TOR_B = '#00205b';
const TOR_H0 = d(k(TOR_B, WHITE, WHITE, WHITE, WHITE, WHITE), { bands: [WHITE, WHITE], hem: [TOR_B], outline: TOR_B });
const TOR_A0 = d(k(WHITE, TOR_B, TOR_B, TOR_B, TOR_B, TOR_B), { yoke: TOR_B, bands: [TOR_B, TOR_B], hem: [WHITE], outline: WHITE });
const TOR_H1 = d(k(TOR_B, WHITE, WHITE, WHITE, WHITE, WHITE), { bands: [WHITE, WHITE], hem: [WHITE, WHITE], collarStyle: 'lace' });
const TOR_A1 = d(k(WHITE, TOR_B, TOR_B, TOR_B, TOR_B, TOR_B), { yoke: TOR_B, bands: [TOR_B, TOR_B], hem: [TOR_B, TOR_B], collarStyle: 'lace' });
const TOR_H2 = d(TOR_H1, { hem: [WHITE] });
const TOR_A2 = d(TOR_A1, { hem: [TOR_B] });
const TOR_60S = d(k(WHITE, TOR_B, TOR_B, TOR_B, TOR_B, TOR_B), { yoke: TOR_B, bands: [TOR_B, TOR_B], hem: [TOR_B, TOR_B] });
const TOR_67 = d(k(TOR_B, WHITE, WHITE, WHITE, TOR_B, WHITE), { bands: [WHITE, WHITE], hem: [WHITE], collarStyle: 'lace' });

// Utah: black, white, mountain blue (rock black, salt white)
const UTA_LB = '#6cace4';
const UTA_H = d(k(BLACK, WHITE, UTA_LB, WHITE, BLACK, UTA_LB, WHITE), { bands: [UTA_LB, WHITE, UTA_LB], hem: [UTA_LB, WHITE, UTA_LB] });
const UTA_A = d(k(WHITE, BLACK, UTA_LB, BLACK, BLACK, BLACK, UTA_LB), { bands: [BLACK, UTA_LB, BLACK], hem: [BLACK, UTA_LB, BLACK] });

// Vancouver: blue, green, white
const VAN_B = '#00205b', VAN_G = '#00843d', VAN_Y = '#ffb81c', VAN_R = '#c8102e';
const VAN_H = d(k(VAN_B, WHITE, VAN_G, WHITE, VAN_B, VAN_G, WHITE), { bands: [VAN_G, WHITE, VAN_G], hem: [VAN_G, WHITE, VAN_G] });
const VAN_A = d(k(WHITE, VAN_B, VAN_G, VAN_B, VAN_B, VAN_B, VAN_G), { bands: [VAN_B, VAN_G, VAN_B], hem: [VAN_B, VAN_G, VAN_B] });
const VAN_RINK = d(k(VAN_B, WHITE, VAN_G, WHITE, VAN_G, VAN_G, WHITE), { bands: [VAN_G, WHITE, VAN_G], hem: [VAN_G, WHITE, VAN_G] });
const VAN_SKATE = d(k(BLACK, VAN_Y, VAN_R, VAN_Y, BLACK, VAN_R, VAN_Y), { bands: [VAN_R, VAN_Y], hem: [VAN_R, VAN_Y] });

// Vegas: steel gray, gold, red, black (black-gold-red bands on the gray, gray-gold-red on the white,
// gray-white-red on the gold)
const VGK_GY = '#333f42', VGK_G = '#b4975a', VGK_R = '#c8102e';
const VGK_GRAY = d(k(VGK_GY, VGK_G, WHITE, VGK_G, VGK_GY, BLACK, VGK_G), { bands: [BLACK, VGK_G, VGK_R], hem: [BLACK, VGK_G, VGK_R] });
const VGK_A = d(k(WHITE, VGK_GY, VGK_G, VGK_GY, VGK_GY, VGK_GY, VGK_G), { bands: [VGK_GY, VGK_G, VGK_R], hem: [VGK_GY, VGK_G, VGK_R] });
const VGK_GOLD = d(k(VGK_G, VGK_GY, WHITE, VGK_GY, VGK_GY, VGK_GY, WHITE), { bands: [VGK_GY, WHITE, VGK_R], hem: [VGK_GY, WHITE, VGK_R] });

// Winnipeg: polar night blue, aviator blue, silver, red
const WPG_NV = '#041e42', WPG_AB = '#004c97', WPG_SV = '#8e9090', WPG_R = '#ac162c', WPG_HB = '#0b4ea2';
const WPG_H = d(k(WPG_NV, WHITE, WPG_AB, WHITE, WPG_NV, WPG_SV, WPG_AB), { bands: [WPG_SV, WPG_AB, WPG_SV], hem: [WPG_SV, WPG_AB, WPG_SV] });
const WPG_A = d(k(WHITE, WPG_NV, WPG_AB, WPG_NV, WPG_NV, WPG_NV, WPG_AB), { bands: [WPG_NV, WPG_AB, WPG_NV], hem: [WPG_NV, WPG_AB, WPG_NV] });
const WPG_AVIATOR = d(k(WPG_AB, WHITE, WPG_NV, WHITE, WPG_NV, WPG_NV, WHITE), { bands: [WPG_NV, WHITE, WPG_NV], hem: [WPG_NV, WHITE, WPG_NV] });
const WPG_HERITAGE = d(k(WPG_HB, WPG_R, WHITE, WPG_R, WPG_HB, WHITE, WPG_R), { yoke: WHITE, bands: [WHITE, WPG_R, WHITE], hem: [WHITE, WPG_R, WHITE] });

// Washington: red, navy, white
const WSH_R = '#c8102e', WSH_NV = '#041e42';
const WSH_H = d(k(WSH_R, WHITE, WSH_NV, WHITE, WSH_NV, WSH_NV, WHITE), { bands: [WHITE, WSH_NV, WHITE], hem: [WSH_NV, WHITE] });
const WSH_A = d(k(WHITE, WSH_R, WSH_NV, WSH_NV, WSH_NV, WSH_NV, WSH_R), { bands: [WSH_NV, WSH_R, WSH_NV], hem: [WSH_R, WSH_NV] });
const WSH_RETRO = d(k(WSH_R, WHITE, WSH_NV, WHITE, WSH_NV, WSH_NV, WHITE), { bands: [WSH_NV, WHITE, WSH_NV], hem: [WSH_NV, WHITE, WSH_NV] });
const WSH_WC11 = d(k(WHITE, WSH_R, WSH_NV, WSH_R, WSH_NV, WSH_R, WSH_NV), { bands: [WSH_R, WSH_NV, WSH_R], hem: [WSH_R, WSH_NV, WSH_R] });
const WSH_W = d(k(WSH_NV, WHITE, WSH_R, WHITE, WSH_NV, WHITE, WSH_R), { yoke: WHITE, bands: [WSH_R, WHITE], hem: [WSH_R, WHITE] });
const WSH_EAGLE_BLK = d(k(BLACK, WHITE, '#b87333', WHITE, BLACK, '#00205b', '#b87333'), { bands: ['#00205b', '#b87333', '#00205b'], hem: ['#00205b', '#b87333', '#00205b'] });
const WSH_EAGLE_RED = d(k(WSH_R, WHITE, WSH_NV, WHITE, WSH_R, WSH_NV, SILVER), { yoke: WHITE, bands: [WSH_NV, SILVER], hem: [WSH_NV, SILVER], numberFont: 'varsity' });

export const UNIFORM_ERAS: UniformTable = {
  // Wikipedia "Anaheim Ducks" (Uniforms 2006-2014, 2014-2024, 2024-present)
  ANA: [
    { from: 2009, to: 2010, home: ANA_H1, away: ANA_A1, note: 'Rbk Edge "Ducks" wordmark set; number trim gold/orange?' },
    { from: 2011, to: 2014, home: ANA_H1, away: ANA_A1, alt: ANA_WEBD, note: 'black webbed-D third with thick orange stripes from 2010-11' },
    { from: 2015, to: 2015, home: ANA_H2, away: ANA_A2, note: 'webbed-D third promoted to home, matching white; orange accents replace gold' },
    { from: 2016, to: 2017, home: ANA_H2, away: ANA_A2, alt: ANA_ORALT, note: 'orange third (Mighty Ducks crest); its number colors?' },
    { from: 2018, to: 2018, home: ANA_H2, away: ANA_A2, note: 'Adidas template, no third' },
    { from: 2019, to: 2019, home: ANA_H2, away: ANA_A2, alt: d(k(BLACK, WHITE, ANA_JD, WHITE, BLACK, ANA_PU, ANA_JD), { bands: [ANA_PU, ANA_JD, SILVER], hem: [ANA_PU, ANA_JD, SILVER] }), note: '25th-anniversary black third: the 1993 eggplant/jade/silver stripes run diagonally (drawn as bands)' },
    { from: 2020, to: 2023, home: ANA_H2, away: ANA_A2, alt: ANA_ORALT, note: 'orange third back (Adidas); its number colors?' },
    { from: 2024, to: 2024, home: ANA_H2, away: ANA_A2, alt: d(k(ANA_PU, WHITE, ANA_JD, WHITE, ANA_JD, ANA_JD, WHITE), { bands: [ANA_JD, WHITE, SILVER], hem: [ANA_JD, WHITE, SILVER] }), note: '30th-anniversary eggplant third, the 1993 diagonal jade/white/silver stripes (drawn as bands)' },
    { from: 2025, home: ANA_H3, away: ANA_A3, note: 'Fanatics rebrand: orange home with black/gold/white stripes, white road with orange shoulders; number fill/trim?' },
  ],
  // Wikipedia "Arizona Coyotes" (Logos and jerseys)
  PHX: [
    { from: 2009, to: 2014, home: COY_H, away: COY_A, alt: d(k(BLACK, COY_R, COY_S, COY_R, BLACK, COY_R, COY_S), { bands: [COY_R, COY_S], hem: [COY_R, COY_S] }), note: 'howling-coyote set (red yoke and lace collar on the white from 2007-08); black third 2008-09 to 2013-14; number trims?' },
  ],
  // Wikipedia "Arizona Coyotes" (Logos and jerseys)
  ARI: [
    { from: 2015, to: 2018, home: COY_H, away: COY_A2, note: 'PHX patch becomes AZ; black added to the sleeve stripes from 2015-16; Kachina black worn a few dates (not a regular third)' },
    { from: 2019, to: 2020, home: COY_H, away: COY_A2, alt: KACHINA, note: 'black Kachina third (Adidas): green pointed shoulders trimmed brick red, the stair-step stripes drawn as sand/red/green bands' },
    { from: 2021, to: 2021, home: d(KACHINA, { outline: SILVER }), away: COY_A2, alt: COY_H, note: 'black Kachina home (silver letter trim for the 25th season), red howler third' },
    { from: 2022, to: 2022, home: KACHINA, away: KACHINA_W, alt: COY_H, note: 'Kachina home and new white Kachina road, red howler third; white Kachina number colors?' },
    { from: 2023, to: 2024, home: KACHINA, away: KACHINA_W, alt: d(k(COY_R, COY_S, COY_S, COY_S, BLACK, COY_S, BLACK), { bands: [COY_S, BLACK], hem: [COY_S, BLACK] }), note: 'brick-red/sand "Arizona" desert third; its trims?' },
  ],
  // Wikipedia "Atlanta Thrashers" (Jerseys)
  ATL: [
    { from: 2009, to: 2011, home: d(k('#4167b1', WHITE, '#041e42', WHITE, '#041e42', '#041e42', WHITE), { bands: ['#041e42', WHITE, '#041e42'], hem: ['#4167b1'] }), away: d(k(WHITE, '#041e42', '#4167b1', '#041e42', '#041e42', '#041e42', '#4167b1'), { bands: ['#041e42', '#4167b1', '#041e42'], hem: [WHITE] }), alt: d(k('#c8102e', WHITE, '#041e42', WHITE, '#041e42', '#041e42', '#b9975b'), { bands: ['#041e42', '#b9975b', '#041e42'], hem: ['#041e42', '#b9975b', '#041e42'] }), note: 'blue home (navy RIGHT-shoulder yoke only, not drawn; no waist stripes), red/midnight-blue third from 2008-09; the blue shade and number trims?' },
  ],
  // Wikipedia "Boston Bruins" (Logo and uniforms)
  BOS: [
    { from: 2009, to: 2014, home: BOS_H, away: BOS_A, alt: d(k(BLACK, BOS_G, WHITE, WHITE, BLACK, BOS_G, WHITE), { bands: [BOS_G, WHITE, BOS_G], hem: [BOS_G, WHITE, BOS_G] }), note: 'Rbk Edge spoked-B set (white names, black yoke and lace collar on the white); black walking-bear third from 2008-09, last season of it?' },
    { from: 2015, to: 2016, home: BOS_H, away: BOS_A },
    { from: 2017, to: 2017, home: BOS_H, away: BOS_A, alt: d(k(BLACK, WHITE, BOS_G, WHITE, BLACK, BOS_G, BLACK), { bands: [BOS_G, BLACK, BOS_G], hem: [BOS_G, BLACK, BOS_G] }), note: '2016 Winter Classic black/gold carried as the third; number colors?' },
    { from: 2018, to: 2019, home: BOS_H, away: BOS_A, note: 'Adidas template; no regular third' },
    { from: 2020, to: 2023, home: BOS_H, away: BOS_A, alt: d(k(BLACK, WHITE, BOS_G, WHITE, BLACK, BOS_G, WHITE), { bands: [BOS_G, WHITE], hem: [BOS_G, WHITE] }), note: '1950s-style black block-B third; its number colors?' },
    { from: 2024, to: 2024, home: d(BOS_H, { outline: WHITE }), away: BOS_A, note: 'centennial season: the retro spoked-B on the black home and white road (no regular beige third; the cream sweater was the 2023 Winter Classic one-off)' },
    { from: 2025, to: 2025, home: BOS_H, away: BOS_A, note: 'back to the 2007-2023 look (Fanatics); a regular third?' },
    { from: 2026, home: d(BOS_H, { name: BOS_G, collar: BOS_G }), away: BOS_A, note: 'new set after the 1977-95 uniforms, gold B on black, gold collar (unverified: may be the 2007 cut with the centennial logo)' },
  ],
  // Wikipedia "Buffalo Sabres" (Logo and uniforms)
  BUF: [
    { from: 2009, to: 2010, home: d(k(BUF_NV, WHITE, BUF_G, WHITE, BUF_NV, BUF_SV, BUF_G), { bands: [BUF_SV, BUF_G, BUF_SV], hem: [BUF_SV, BUF_G, BUF_SV] }), away: d(k(WHITE, BUF_NV, BUF_G, BUF_NV, BUF_NV, BUF_SV, BUF_NV), { bands: [BUF_SV, BUF_NV, BUF_SV], hem: [BUF_SV, BUF_NV, BUF_SV] }), alt: BUF_H2, note: '"Buffaslug" set (curved silver/gold side panels, drawn as bands); navy classic-style third from 2008-09; number trims?' },
    { from: 2011, to: 2013, home: BUF_H2, away: BUF_A2, note: 'navy classic set (the third promoted): blue yoke edged gold on the white; the 40th-anniversary throwback third left out?' },
    { from: 2014, to: 2015, home: BUF_H2, away: BUF_A2, alt: d(k(BUF_NV, BUF_G, WHITE, BUF_G, BUF_NV, BUF_G, WHITE), { bands: [BUF_G, WHITE], hem: [BUF_G, WHITE] }), note: 'gold-front third, two seasons: gold in front, navy behind (the splash shows the back)' },
    { from: 2016, to: 2019, home: BUF_H2, away: BUF_A2, note: 'navy home number fill white or gold?' },
    { from: 2020, to: 2020, home: BUF_H2, away: BUF_A2, alt: d(k(WHITE, BUF_NV, '#c5b358', BUF_NV, BUF_NV, BUF_NV, '#c5b358'), { yoke: BUF_NV, piping: '#c5b358', bands: ['#c5b358', BUF_NV], hem: ['#c5b358', BUF_NV] }), note: '50th-anniversary white third with metallic gold' },
    { from: 2021, to: 2022, home: BUF_H3, away: BUF_A3, note: 'royal blue and gold return; number fill/trim?' },
    { from: 2023, home: BUF_H3, away: BUF_A3, alt: d(k(BLACK, WHITE, BUF_RD, WHITE, BUF_RD, BUF_RD, BUF_SV), { bands: [BUF_RD, BUF_SV, BUF_RD], hem: [BUF_RD, BUF_SV, BUF_RD] }), note: '1996-2006 black goathead set back as the third' },
  ],
  // Wikipedia "Carolina Hurricanes" (Logos and uniforms)
  CAR: [
    { from: 2009, to: 2013, home: CAR_H1, away: CAR_A1, alt: CAR_BALT1, note: 'original set (warning-flag bands at the cuffs and hem), black flag-logo third from 2008-09' },
    { from: 2014, to: 2017, home: CAR_H2, away: CAR_A2, alt: CAR_BALT1, note: '2013 set: black/silver dropped; the white carries a red nameplate (drawn as red letters)' },
    { from: 2018, to: 2018, home: CAR_H3, away: CAR_A2, note: 'Adidas red with black striping back; no third' },
    { from: 2019, to: 2019, home: CAR_H3, away: CAR_A2, alt: CAR_BLK, note: 'new black third, red flag-pattern stripes with white trim' },
    { from: 2020, to: 2022, home: CAR_H3, away: CAR_CANES, alt: CAR_BLK, note: 'diagonal "CANES" white road' },
    { from: 2023, to: 2023, home: CAR_BLK, away: CAR_CANES, alt: CAR_H1, note: 'black becomes home; the 1997-2007 red back as a one-season third' },
    { from: 2024, to: 2025, home: CAR_BLK, away: CAR_CANES, alt: CAR_H3, note: 'modern red third' },
    { from: 2026, home: CAR_BLK, away: d(k(WHITE, CAR_R, BLACK, CAR_R, CAR_R, CAR_R, BLACK), { bands: [CAR_R, BLACK], hem: [CAR_R, BLACK] }), alt: CAR_H3, note: 'new white road after the 2023 Stadium Series set' },
  ],
  // Wikipedia "Columbus Blue Jackets" (Logos and jerseys)
  CBJ: [
    { from: 2009, to: 2010, home: CBJ_H, away: CBJ_A, note: 'flag-logo set (the 2003 third promoted), lace collars; sleeve stripe colors?' },
    { from: 2011, to: 2017, home: CBJ_H, away: CBJ_A, alt: CBJ_CANNON, note: 'navy cannon third with light blue and vintage white; shades?' },
    { from: 2018, to: 2018, home: CBJ_H, away: CBJ_A, note: 'Adidas, new lettering; no third' },
    { from: 2019, home: CBJ_H, away: CBJ_A, alt: CBJ_CANNON },
  ],
  // Wikipedia "Calgary Flames" (Jerseys)
  CGY: [
    { from: 2009, to: 2009, home: CGY_H1, away: CGY_A1, note: 'Rbk Edge black-trimmed set: vertical side stripes (not drawn), black cuffs, plain waist; number trims?' },
    { from: 2010, to: 2013, home: CGY_H1, away: CGY_A1, alt: CGY_RETRO, note: '1980s red throwback third; first season of it 2009-10?' },
    { from: 2014, to: 2016, home: CGY_H1, away: CGY_A1, alt: d(k(BLACK, WHITE, CGY_R, WHITE, BLACK, CGY_R, CGY_G), { bands: [CGY_R, CGY_G, CGY_R], hem: [CGY_R, CGY_G, CGY_R] }), note: 'black western "Calgary" script third; trims?' },
    { from: 2017, to: 2017, home: CGY_H1, away: CGY_A1, alt: CGY_RETRO },
    { from: 2018, to: 2018, home: CGY_H1, away: CGY_A1, note: 'Adidas, no third' },
    { from: 2019, to: 2020, home: CGY_H1, away: CGY_A1, alt: CGY_RETRO },
    { from: 2021, to: 2021, home: CGY_RETRO, away: CGY_A2, alt: CGY_H1, note: 'throwback red and the 1980-94 white (red yoke, red/yellow bands) promoted; black-trimmed red a third for its last season' },
    { from: 2022, to: 2022, home: CGY_RETRO, away: CGY_A2 },
    { from: 2023, home: CGY_RETRO, away: CGY_A2, alt: d(k(BLACK, WHITE, CGY_R, WHITE, CGY_R, CGY_R, CGY_G), { bands: [CGY_R, CGY_G, CGY_R], hem: [CGY_R, CGY_G, CGY_R] }), note: '"Blasty" black third back; its trims?' },
  ],
  // Wikipedia "Chicago Blackhawks" (Jerseys)
  CHI: [
    { from: 2009, to: 2009, home: CHI_H, away: CHI_A, alt: CHI_BLK, note: '1996-2007 black third back for 2008-09' },
    { from: 2010, to: 2011, home: CHI_H, away: CHI_A, alt: d(k(BLACK, CREAM, CHI_R, CREAM, BLACK, CREAM, CHI_R), { bands: [CREAM, CHI_R, CREAM], hem: [CREAM, CHI_R, CREAM] }), note: '2009 Winter Classic black/beige third; number colors?' },
    { from: 2012, to: 2025, home: CHI_H, away: CHI_A, note: 'unchanged look (Adidas 2017, Fanatics 2024), black collars; 2019 Winter Classic set worn a few games only' },
    { from: 2026, home: d(CHI_H, { outline: '#b9975b', collarStyle: 'lace' }), away: d(CHI_A, { collarStyle: 'lace' }), alt: CHI_BLK, note: 'centennial: lace-up collar, gold trim on crest and numbers; black third back; does the gold trim stay past 2025-26?' },
  ],
  // Wikipedia "Colorado Avalanche" (Jerseys)
  COL: [
    { from: 2009, to: 2009, home: COL_H1, away: COL_A1, note: 'Rbk Edge version of the 1995 color-blocked set (steel blue lower sleeves and hem); no third; number trims?' },
    { from: 2010, to: 2015, home: COL_H1, away: COL_A1, alt: COL_STEEL, note: 'steel blue third, burgundy shoulder patches (drawn as a yoke)' },
    { from: 2016, to: 2017, home: COL_H1, away: COL_A1, alt: COL_NAVY, note: 'navy Rockies-logo third; its trims?' },
    { from: 2018, to: 2018, home: COL_H2, away: COL_A1, note: 'Adidas set after the 1995-2007 look with a silver border; no third' },
    { from: 2019, to: 2021, home: COL_H2, away: COL_A1, alt: COL_NAVY },
    { from: 2022, home: COL_H2, away: COL_A2, alt: COL_NAVY, note: 'black dropped: white road gets burgundy names, steel blue numbers trimmed burgundy' },
  ],
  // Wikipedia "Dallas Stars" (Logo and jersey design)
  DAL: [
    { from: 2009, to: 2010, home: DAL_H1, away: DAL_A1, alt: DAL_ARCH, note: 'Rbk Edge set: black home (a green band edged gold on the arms) with chest number and arched "Dallas"; white crest road' },
    { from: 2011, to: 2013, home: DAL_H1, away: DAL_ARCH, note: 'the arched white third becomes the road' },
    { from: 2014, to: 2020, home: DAL_H2, away: DAL_A2, note: 'victory green rebrand: green yoke on the white' },
    { from: 2021, to: 2025, home: DAL_H2, away: DAL_A2, alt: DAL_BLACKOUT, note: 'black "Blackout" third with neon green; neon hex?' },
    { from: 2026, home: DAL_H2, away: DAL_A2, alt: DAL_99, note: '"The \'99" black third after the 1997-2007 set: a green lower body meeting the black in star points (drawn as a wide green band and hem)' },
  ],
  // Wikipedia "Detroit Red Wings" (Logo and uniforms)
  DET: [
    { from: 2009, to: 2025, home: DET_H, away: DET_A, note: 'the same look throughout; no regular third' },
    { from: 2026, to: 2026, home: DET_H, away: DET_A, alt: d(k(DET_R, CREAM, CREAM, CREAM, CREAM, CREAM), { bands: [CREAM], hem: [CREAM] }), note: 'centennial red and vintage white third' },
    { from: 2027, home: DET_H, away: DET_A },
  ],
  // Wikipedia "Edmonton Oilers" (Jerseys)
  EDM: [
    { from: 2009, to: 2009, home: EDM_MIDH, away: EDM_MIDA, alt: EDM_ROYAL, note: 'midnight blue/copper Edge set (no waist stripe, copper/red/silver inside the elbow panels), royal blue/orange third' },
    { from: 2010, to: 2011, home: EDM_ROYAL, away: EDM_MIDA, alt: EDM_MIDH, note: 'royal blue becomes home' },
    { from: 2012, to: 2012, home: EDM_ROYAL, away: EDM_A2, alt: EDM_MIDH, note: 'new white road; midnight blue third dropped after this season?' },
    { from: 2013, to: 2015, home: EDM_ROYAL, away: EDM_A2 },
    { from: 2016, to: 2017, home: EDM_ROYAL, away: EDM_A2, alt: EDM_WHA, note: 'orange WHA-style third' },
    { from: 2018, to: 2019, home: EDM_ORANGE, away: EDM_A3, note: 'orange becomes home with navy accents; number fill navy or white?' },
    { from: 2020, to: 2022, home: EDM_ORANGE, away: EDM_A3, alt: EDM_NAVY, note: 'navy third with minimal striping' },
    { from: 2023, to: 2025, home: EDM_ROYAL, away: EDM_A2, alt: EDM_NAVY, note: '1980s royal blue and white back' },
    { from: 2026, home: EDM_ROYAL, away: EDM_A2, alt: EDM_TAN, note: 'tan third with blue shoulders and blue/orange stripes; does it replace the navy?' },
  ],
  // Wikipedia "Florida Panthers" (Logos, colors, and uniforms)
  FLA: [
    { from: 2009, to: 2009, home: FLA_H0, away: FLA_A1, note: 'Rbk Edge navy home; the white has its navy shoulder yoke; number trims?' },
    { from: 2010, to: 2011, home: FLA_H0, away: FLA_A1, alt: FLA_RND, note: 'navy roundel third with powder blue; powder blue hex?' },
    { from: 2012, to: 2012, home: FLA_H1, away: FLA_A1, alt: FLA_RND, note: 'red back as home' },
    { from: 2013, to: 2016, home: FLA_H1, away: FLA_A1 },
    { from: 2017, home: FLA_H2, away: FLA_A2, note: 'shield rebrand: thick navy chest and arm bands edged gold (the chest band not drawn), plain hem; road number fill?' },
  ],
  // Wikipedia "Los Angeles Kings" (Uniforms and logos)
  LAK: [
    { from: 2009, to: 2011, home: LAK_H1, away: LAK_A1, alt: LAK_H2, note: 'purple-tinged crown-logo set; black/silver LA-banner third from 2008-09; purple trims?' },
    { from: 2012, to: 2013, home: LAK_H2, away: LAK_A2, alt: LAK_H1, note: 'black/silver: the banner third becomes home (no tail stripe; the white has a black/silver one); old home a third' },
    { from: 2014, to: 2016, home: LAK_H2, away: LAK_A2 },
    { from: 2017, to: 2017, home: LAK_H2, away: LAK_A2, alt: d(k(LAK_SV, BLACK, '#b9975b', BLACK, LAK_PU, BLACK, WHITE), { bands: [BLACK, WHITE, BLACK], hem: [BLACK, WHITE, BLACK] }), note: '50th-anniversary silver third with gold accents' },
    { from: 2018, to: 2018, home: LAK_H2, away: LAK_A2, note: 'Adidas, no third' },
    { from: 2019, to: 2021, home: LAK_H2, away: LAK_A2, alt: LAK_SILVER },
    { from: 2022, to: 2024, home: LAK_H2, away: LAK_A2, alt: d(k(WHITE, BLACK, LAK_SV, BLACK, BLACK, BLACK, LAK_SV), { bands: [BLACK, LAK_SV], hem: [BLACK, LAK_SV] }), note: 'modernized 1990s white third (chrome helmets)' },
    { from: 2025, to: 2025, home: LAK_H3, away: LAK_A2, note: 'new set after the 1988-98 uniforms' },
    { from: 2026, home: LAK_H3, away: LAK_A2, alt: d(k(BLACK, LAK_SV, LAK_SV, LAK_SV, LAK_SV, LAK_SV), { bands: [LAK_SV], hem: [LAK_SV] }), note: 'black crown-logo third with silver' },
  ],
  // Wikipedia "Minnesota Wild" (Jerseys); nhluniforms.com Wild page
  MIN: [
    { from: 2009, to: 2009, home: MIN_H1, away: MIN_A1, note: 'red Edge home (green lower sleeves outlined wheat); its number colors?' },
    { from: 2010, to: 2013, home: MIN_H1, away: MIN_A1, alt: MIN_GALT, note: 'green script "Minnesota Wild" third' },
    { from: 2014, to: 2017, home: MIN_H1, away: MIN_A2, alt: MIN_GALT, note: 'road redesigned to match; colors?' },
    { from: 2018, to: 2023, home: MIN_H2, away: MIN_A2, note: 'green home: wheat numbers trimmed red, a wheat chest stripe (not drawn), wheat arm band under a red line, lace collar' },
    { from: 2024, home: MIN_H2, away: MIN_A2, alt: MIN_NORTH, note: 'green North Stars-style third; its trims?' },
  ],
  // Wikipedia "Montreal Canadiens" (Crest and sweater design)
  MTL: [
    { from: 2009, home: MTL_H, away: MTL_A, note: 'unchanged; no regular third. The red\'s blue chest band isn\'t drawn; the white has a red yoke and red lower sleeves' },
  ],
  // Wikipedia "New Jersey Devils" (Jerseys)
  NJD: [
    { from: 2009, to: 2017, home: NJD_H, away: NJD_A, note: '1992 design on the Edge template (waist stripes); no third; red home number fill white or black?' },
    { from: 2018, to: 2021, home: NJD_H2, away: NJD_A2, note: 'Adidas: waist stripes gone, thicker equal sleeve bands' },
    { from: 2022, home: NJD_H2, away: NJD_A2, alt: NJD_JERSEY, note: 'black "Jersey" script third' },
  ],
  // Wikipedia "Nashville Predators" (Jersey and logo)
  NSH: [
    { from: 2009, to: 2009, home: NSH_H1, away: NSH_A1, note: 'navy Edge set, silver shoulder yokes; number trims?' },
    { from: 2010, to: 2011, home: NSH_H1, away: NSH_A1, alt: NSH_CHECK, note: 'navy/black checkerboard third (drawn as black/navy bands)' },
    { from: 2012, to: 2017, home: NSH_H2, away: NSH_A2, note: 'gold rebrand; road number fill?' },
    { from: 2018, home: NSH_H2, away: NSH_A3, note: 'white road remade with gold shoulders and gold/navy bands; road number fill?' },
  ],
  // Wikipedia "New York Islanders" (Logo, Jerseys)
  NYI: [
    { from: 2009, to: 2010, home: NYI_H1, away: NYI_A1, alt: NYI_ROYAL, note: 'navy Edge set (orange lower sleeves, chest numbers, orange nameplate); royal throwback third' },
    { from: 2011, to: 2011, home: NYI_ROYAL, away: NYI_A2 },
    { from: 2012, to: 2013, home: NYI_ROYAL, away: NYI_A2, alt: NYI_BLACK, note: 'black third with gray yoke; trims?' },
    { from: 2014, to: 2014, home: NYI_ROYAL, away: NYI_A2 },
    { from: 2015, to: 2015, home: NYI_ROYAL, away: NYI_A2, alt: NYI_SS, note: 'Stadium Series blue (white yoke) as the third' },
    { from: 2016, to: 2017, home: NYI_ROYAL, away: NYI_A2, alt: NYI_BKLYN, note: 'Brooklyn black third' },
    { from: 2018, to: 2018, home: NYI_ROYAL, away: NYI_A2 },
    { from: 2019, to: 2024, home: NYI_ROYAL, away: NYI_A2, alt: NYI_BLUEALT, note: 'blue third, white yoke, orange numbers' },
    { from: 2025, home: NYI_ROYAL, away: NYI_A2, note: 'primaries only under Fanatics' },
  ],
  // Wikipedia "New York Rangers" (Uniforms)
  NYR: [
    { from: 2009, to: 2010, home: NYR_H, away: NYR_A, note: 'white numbers trimmed red on the blue, white names; lace collars' },
    { from: 2011, to: 2017, home: NYR_H, away: NYR_A, alt: NYR_HERITAGE, note: 'heritage navy third with cream; last season 2016-17?' },
    { from: 2018, to: 2023, home: NYR_H, away: NYR_A },
    { from: 2024, to: 2025, home: NYR_H, away: NYR_A, alt: NYR_SHIELD, note: 'navy shield-crest third' },
    { from: 2026, to: 2026, home: NYR_H, away: NYR_A, alt: d(k(NYR_LB, CREAM, CREAM, CREAM, NYR_R, NYR_R, CREAM), { bands: [NYR_R, CREAM, NYR_R], hem: [NYR_R, CREAM, NYR_R], collarStyle: 'lace' }), note: 'centennial light blue third; shade? (may be a darker 1926-style blue)' },
    { from: 2027, home: NYR_H, away: NYR_A, alt: NYR_SHIELD },
  ],
  // Wikipedia "Ottawa Senators" (Logo and jersey design)
  OTT: [
    { from: 2009, to: 2011, home: OTT_H1, away: OTT_A1, alt: OTT_SENS, note: '2007 Edge set (a red/gold sweep down the arms, drawn as bands); black "SENS" third; trims?' },
    { from: 2012, to: 2017, home: OTT_H1, away: OTT_A1, alt: OTT_BARBER, note: 'black barber-pole heritage third' },
    { from: 2018, to: 2018, home: OTT_H1, away: OTT_A1, note: 'Adidas, new number font, no third' },
    { from: 2019, to: 2020, home: OTT_H1, away: OTT_A1, alt: OTT_NHL100, note: 'red NHL 100 Classic set as the third (silver O)' },
    { from: 2021, to: 2025, home: OTT_H2, away: OTT_A2, note: 'rebrand after the 1992-95 set, gold-outlined logo, brighter red' },
    { from: 2026, home: OTT_H2, away: OTT_A2, alt: OTT_RED3, note: 'red third with black shoulders and gold/black stripes; number colors?' },
  ],
  // Wikipedia "Philadelphia Flyers" (Jerseys)
  PHI: [
    { from: 2009, to: 2009, home: PHI_BLKH, away: PHI_EDGEA, alt: PHI_73H, note: 'black Edge home (white shoulders, orange/black elbows); white road with orange shoulders; orange 1973-74 style third' },
    { from: 2010, to: 2010, home: PHI_73H, away: PHI_EDGEA, alt: PHI_BLKH, note: 'orange becomes home' },
    { from: 2011, to: 2014, home: PHI_73H, away: PHI_73A, note: '1973-74 white becomes the road; the wings down the arms drawn as shoulder yokes; names on nameplates (white on the orange, black on the white)' },
    { from: 2015, to: 2016, home: PHI_73H, away: PHI_73A, alt: PHI_WC, note: '2012 Winter Classic orange/cream third' },
    { from: 2017, to: 2017, home: PHI_73H, away: PHI_73A, alt: PHI_50, note: '50th-anniversary white third with gold numbers on a black nameplate' },
    { from: 2018, to: 2018, home: PHI_73H, away: PHI_73A },
    { from: 2019, to: 2023, home: PHI_73H, away: PHI_73A, alt: PHI_SS, note: '2017 Stadium Series black as the third (orange nameplate)' },
    { from: 2024, home: PHI_H24, away: PHI_A24, alt: PHI_SS, note: 'burnt orange redesign, wider wings, a black hem stripe on the home; the burnt orange hex?' },
  ],
  // Wikipedia "Pittsburgh Penguins" (Crest and sweater design)
  PIT: [
    { from: 2009, to: 2011, home: PIT_H1, away: PIT_A1, alt: PIT_POWDER, note: 'Vegas gold Edge set (one wide gold band edged white); powder blue 2008 Winter Classic third; home number fill white or gold?' },
    { from: 2012, to: 2014, home: PIT_H1, away: PIT_A1, alt: PIT_WCNAVY, note: '2011 Winter Classic navy third; trims?' },
    { from: 2015, to: 2016, home: PIT_H1, away: PIT_A1, alt: PIT_H2, note: 'black Pittsburgh-gold third after the 1991-92 set (white numbers trimmed gold)' },
    { from: 2017, to: 2018, home: PIT_H2, away: PIT_A2, note: 'Pittsburgh gold becomes the primary set; no third' },
    { from: 2019, to: 2021, home: PIT_H2, away: PIT_A2, alt: PIT_GOLD, note: 'gold third after the 2017 Stadium Series' },
    { from: 2022, to: 2025, home: PIT_H2, away: PIT_A2, alt: PIT_RR, note: 'black version of the 2021 Reverse Retro (1992-97 look) as the third; trims?' },
    { from: 2026, home: PIT_H2, away: PIT_A2, alt: PIT_RIVERS, note: 'gold "Three Rivers" third, black hem stripe' },
  ],
  // Wikipedia "San Jose Sharks" (Logo and jerseys)
  SJS: [
    { from: 2009, to: 2013, home: SJS_H1, away: SJS_A1, alt: SJS_BLK, note: 'Edge set with orange trim, chest numbers, black/teal shoulder yokes; black jumping-shark third' },
    { from: 2014, to: 2017, home: SJS_H2, away: SJS_A2, alt: SJS_BLK, note: '2013 set: less orange, lace-up collar' },
    { from: 2018, to: 2018, home: SJS_H2, away: SJS_A2, note: 'Adidas, no third' },
    { from: 2019, to: 2022, home: SJS_H2, away: SJS_A2, alt: SJS_STEALTH, note: 'black "Stealth" third; trims?' },
    { from: 2023, to: 2023, home: SJS_H3, away: SJS_A3, note: 'new set after the 1991-98 uniforms: white/gray/black bands, no yoke' },
    { from: 2024, home: SJS_H3, away: SJS_A3, alt: SJS_FIN, note: 'black "Cali Fin" third' },
  ],
  // Wikipedia "Seattle Kraken" (Logo and uniforms)
  SEA: [
    { from: 2022, to: 2025, home: SEA_H, away: SEA_A, note: 'deep sea blue home; number fill/trim and stripe order?' },
    { from: 2026, home: SEA_H, away: SEA_A, alt: SEA_GLOW, note: 'black glow-in-the-dark third (its glow trim drawn ice blue)' },
  ],
  // Wikipedia "St. Louis Blues" (Jerseys)
  STL: [
    { from: 2009, to: 2014, home: STL_H1, away: STL_A1, alt: STL_ARCH, note: 'simplified Edge set (navy yoke on the blue, blue yoke on the white); navy Gateway Arch third (through 2013-14?); number and stripe colors?' },
    { from: 2015, to: 2016, home: STL_H2, away: STL_A2, alt: STL_ARCH, note: '1998-2007 look back, gold home numbers' },
    { from: 2017, to: 2017, home: STL_H2, away: STL_A2 },
    { from: 2018, to: 2018, home: STL_H3, away: STL_A2, note: 'Adidas: home numbers white trimmed navy and gold' },
    { from: 2019, to: 2025, home: STL_H3, away: STL_A2, alt: STL_HERITAGE, note: '2017 Winter Classic navy heritage third; its stripe colors?' },
    { from: 2026, home: STL_H4, away: STL_A4, alt: STL_H3, note: 'blue and yellow set after the heritage third (the lighter blue per the 2026-27 diagram), white road with a blue yoke; number fill/trim?' },
  ],
  // Wikipedia "Tampa Bay Lightning" (Logo and jerseys); nhluniforms.com Lightning page; Icethetics Rbk EDGE review
  TBL: [
    { from: 2009, to: 2011, home: TBL_H1, away: TBL_A1, alt: TBL_BOLTS, note: 'black Edge home (blue cuff panel, no waist stripe), electric blue "BOLTS" third; number trims?' },
    { from: 2012, to: 2014, home: TBL_H2, away: TBL_A2, alt: TBL_BOLTS, note: 'blue and white rebrand, lace collars; blue BOLTS third kept?' },
    { from: 2015, to: 2017, home: TBL_H2, away: TBL_A2, alt: TBL_BLKBOLTS, note: 'black BOLTS third' },
    { from: 2018, to: 2018, home: TBL_H2, away: TBL_A2, note: 'Adidas, TAMPA BAY dropped from the road; no third' },
    { from: 2019, to: 2022, home: TBL_H2, away: TBL_A2, alt: TBL_ALLBLACK, note: 'all-black sublimated third; its grays?' },
    { from: 2023, to: 2023, home: TBL_H2, away: TBL_A2 },
    { from: 2024, home: TBL_H2, away: TBL_A2, alt: TBL_ROUNDEL, note: 'black roundel third (victory stripes; white numbers trimmed black with a blue drop shadow); still the third in 2026-27?' },
  ],
  // Wikipedia "Toronto Maple Leafs" (Logo and uniform)
  TOR: [
    { from: 2009, to: 2010, home: TOR_H0, away: TOR_A0, alt: TOR_60S, note: 'Edge set (no waist stripes, two arm stripes, blue yoke on the white); white 1960s throwback third' },
    { from: 2011, to: 2016, home: TOR_H1, away: TOR_A1, alt: TOR_67, note: 'lace-up collars, two waist stripes back; 1967-70 blue third' },
    { from: 2017, home: TOR_H2, away: TOR_A2, note: 'centennial leaf set, one waist stripe; the black "Next Gen" third worn only occasionally' },
  ],
  // Wikipedia "Utah Mammoth" (Logo, colors, and uniforms)
  UTA: [
    { from: 2025, to: 2025, home: UTA_H, away: UTA_A, note: 'Utah Hockey Club: black with diagonal UTAH; number trims and the blue?' },
    { from: 2026, home: d(UTA_H, { numberFont: 'rounded' }), away: d(UTA_A, { numberFont: 'rounded' }), note: 'Mammoth: logo crest at home, italic UTAH on the road, Mammoth Sans numbers' },
  ],
  // Wikipedia "Vancouver Canucks" (Logos and jerseys)
  VAN: [
    { from: 2009, to: 2017, home: VAN_H, away: VAN_A, alt: VAN_RINK, note: '"Vancouver" over the orca; stick-in-rink third from 2008-09; number trims?' },
    { from: 2018, to: 2019, home: VAN_H, away: VAN_A, note: 'Adidas; a regular third?' },
    { from: 2020, to: 2022, home: VAN_H, away: VAN_A, note: '"Vancouver" script dropped; the 2019 heritage set left out?' },
    { from: 2023, home: VAN_H, away: VAN_A, alt: VAN_SKATE, note: 'black Flying Skate third, thick red/yellow bands; number fill?' },
  ],
  // Wikipedia "Vegas Golden Knights" (Logos, colors, and uniforms)
  VGK: [
    { from: 2018, to: 2020, home: VGK_GRAY, away: VGK_A, note: 'steel gray home; number fill gold or white?' },
    { from: 2021, to: 2022, home: VGK_GRAY, away: VGK_A, alt: VGK_GOLD, note: 'gold third (the road with gold and white swapped)' },
    { from: 2023, home: VGK_GOLD, away: VGK_A, alt: VGK_GRAY, note: 'gold becomes home, gray the third' },
  ],
  // Wikipedia "Winnipeg Jets" (Jerseys)
  WPG: [
    { from: 2012, to: 2018, home: WPG_H, away: WPG_A, note: 'RCAF-inspired set; number trims and stripe colors?' },
    { from: 2019, to: 2021, home: WPG_H, away: WPG_A, alt: WPG_AVIATOR, note: 'aviator blue third' },
    { from: 2022, home: WPG_H, away: WPG_A, alt: WPG_HERITAGE, note: 'blue 1977-79 style heritage third, white yoke, red numbers trimmed white' },
  ],
  // Wikipedia "Washington Capitals" (Logos and jerseys)
  WSH: [
    { from: 2009, to: 2011, home: WSH_H, away: WSH_A, note: 'red/white/blue Edge set (a navy band edged white on the arms); number trims?' },
    { from: 2012, to: 2012, home: WSH_H, away: WSH_A, alt: WSH_WC11, note: '2011 Winter Classic white as a road third (16 games)' },
    { from: 2013, to: 2015, home: WSH_H, away: WSH_A },
    { from: 2016, to: 2017, home: WSH_H, away: WSH_A, alt: WSH_RETRO, note: 'red 1974-style throwback third' },
    { from: 2018, to: 2018, home: WSH_H, away: WSH_A, note: 'Adidas, no third' },
    { from: 2019, to: 2021, home: WSH_H, away: WSH_A, alt: WSH_RETRO },
    { from: 2022, to: 2024, home: WSH_H, away: WSH_A, alt: WSH_W, note: 'navy "W" third with white yoke (yoke unverified); first season 2021-22?' },
    { from: 2025, to: 2025, home: WSH_H, away: WSH_A, alt: WSH_EAGLE_BLK, note: 'black screaming-eagle third (blue and copper); trims?' },
    { from: 2026, home: WSH_H, away: WSH_A, alt: WSH_EAGLE_RED, note: 'red screaming-eagle third, white yoke, navy and silver accents' },
  ],
};

// (helmets: the NFL's alone)
export const HELMET_ERAS: HelmetTable = {};
