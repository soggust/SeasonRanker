// The NBA's uniforms, 2001 (2000-01) to today: each franchise's major sets, by season (the year a season
// ends in), under every name it played as (BRK: the New Jersey Nets, then Brooklyn; CHO: the Charlotte
// Hornets to 2002, the Bobcats 2005-2014, the Hornets again; NOP: the New Orleans (and NO/Oklahoma City)
// Hornets 2003-2013, then the Pelicans; OKC: the Seattle SuperSonics to 2008; MEM: the Vancouver
// Grizzlies in 2001). Shapes and semantics: libs/ranker/src/engine/uniform-eras.ts.
//
// home: the white jersey (before 2017-18 the home set; from 2017-18 the Association edition), away: the
// colored road jersey (from 2017-18 the Icon edition), alt: the main regularly worn alternate (a classic
// third or the Statement edition), left out for the seasons a club had none. The Lakers are the exception:
// they wore gold at home through the era (white only on "Sunday whites"), so their home is gold.
// City/Earned/Classic one-offs are left out.
//
// The tank's details: sleeve 'stripes' is the binding round the armholes and collar (stripe, then stripe2
// inside it); the side panels down the body (panel) take the trim's color with stripe2 as their edge
// (piping) unless the kit says it has none; pinstripe where the jersey was pinstriped; collarStyle a V-neck
// through the adidas years (to 2017) and round from Nike's 2017-18 sets, except where a kit says (the
// Lakers' V); numberFont 'varsity' for the double-outlined numbers, 'rounded' for the modern rounded faces,
// 'serif' for the Cavs' 2017-22 face, else the block. name: the chest wordmark's color (also the back name's).
//
// Sources: the Wikipedia team articles' "Logos and uniforms" sections (fetched 2026-10-15), for each
// franchise as cited below; sportslogos.net uniform listings for the alternates' first seasons; hexes from
// teamcolorcodes.com and the clubs' brand palettes (ESPN's colors in team-colors.ts for the current sets);
// the 2026-10 audit's reference notes (scratchpad splash-round2/audit-nba/refs). Details the sources don't
// state (a trim color, which wordmark sat on which jersey) are from memory of the sets and carry a '?' in
// the era's note.
import { KitColors, HelmetTable, UniformTable, type FaceTable, withFaces } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee';
const BLACK = '#111111';
const V = { collarStyle: 'v' } as const;
const NOPANEL = { panel: false } as const;

type Detail = Partial<Pick<KitColors, 'piping' | 'pinstripe' | 'collarStyle' | 'numberFont' | 'nameFont'>> & { panel?: string | false };

// A kit: its body, numbers (fill, outline) and wordmark, with the armhole/collar trim when it has one (stripe,
// stripe2), then its details: the side panels (the trim's color, edged in stripe2, unless `panel` is false or
// another color), pinstripes, the collar's style, the number face
function k(body: string, num: string, outline: string, name: string, stripe?: string, stripe2?: string, d: Detail = {}): KitColors {
  const kit: KitColors = { body, num, outline, name, collar: stripe ?? outline, sleeve: stripe ? 'stripes' : 'none' };
  if (stripe) kit.stripe = stripe;
  if (stripe2) kit.stripe2 = stripe2;
  const panel = d.panel === false ? undefined : (d.panel ?? stripe);
  if (panel) kit.panel = panel;
  const piping = d.piping ?? stripe2;
  if (piping) kit.piping = piping;
  if (d.pinstripe) kit.pinstripe = d.pinstripe;
  if (d.collarStyle) kit.collarStyle = d.collarStyle;
  if (d.numberFont) kit.numberFont = d.numberFont;
  if (d.nameFont) kit.nameFont = d.nameFont;
  return kit;
}

// The lettering (libs/ranker/src/engine/uniform-eras.ts withFaces): the collegiate block of the Lakers, Bulls
// and Celtics, the wide block of the Knicks, Warriors, 76ers, Cavaliers and Pistons, the Kings' varsity, the
// rounded faces of the Bucks, Nuggets, Magic and Hornets; every other kit keeps the face its era says.
const FACES: FaceTable = {
  LAL: 'college',
  CHI: 'college',
  BOS: 'college',
  NYK: 'wide',
  GSW: 'wide',
  PHI: 'wide',
  CLE: 'wide',
  DET: 'wide',
  SAC: 'varsity',
  MIL: 'rounded',
  DEN: 'rounded',
  ORL: 'rounded',
  CHO: 'rounded',
};

export const UNIFORM_ERAS: UniformTable = withFaces(
  {
  // Atlanta Hawks. Wikipedia "Atlanta Hawks" (Logos and uniforms): red/black/yellow to 2007 (yellow alternate
  // 2004-05 to 2006-07); navy primary with red trim 2007-08 to 2014-15 (red alternate from 2009-10); Torch Red /
  // Volt Green / Granite Gray from 2015-16 (white home, gray road, red alternate); red/black/yellow (1978-82
  // look) from 2020-21.
  ATL: [
    {
      from: 2001, to: 2004,
      home: k(WHITE, '#c8102e', BLACK, '#c8102e', '#c8102e', BLACK),
      away: k('#c8102e', WHITE, BLACK, WHITE, BLACK, '#fdb927'),
      note: 'Hawk-on-ball set (1995-2007): trim and outline colors ?',
    },
    {
      from: 2005, to: 2007,
      home: k(WHITE, '#c8102e', BLACK, '#c8102e', '#c8102e', BLACK),
      away: k('#c8102e', WHITE, BLACK, WHITE, BLACK, '#fdb927'),
      alt: k('#fdb927', '#c8102e', BLACK, '#c8102e', '#c8102e', BLACK),
      note: 'yellow alternate: red "HAWKS" and numbers outlined black',
    },
    {
      from: 2008, to: 2009,
      home: k(WHITE, '#002b5c', '#c8102e', '#002b5c', '#002b5c', '#c8102e'),
      away: k('#002b5c', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      note: 'navy set; no alternate its first two seasons',
    },
    {
      from: 2010, to: 2015,
      home: k(WHITE, '#002b5c', '#c8102e', '#002b5c', '#002b5c', '#c8102e'),
      away: k('#002b5c', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      alt: k('#c8102e', WHITE, '#002b5c', WHITE, '#002b5c', WHITE),
      note: 'red alternate from 2009-10',
    },
    {
      from: 2016, to: 2017,
      home: k(WHITE, '#e03a3e', '#26282a', '#e03a3e', '#e03a3e', '#26282a'),
      away: k('#6e7378', WHITE, '#e03a3e', WHITE, '#e03a3e', '#c1d32f'),
      alt: k('#e03a3e', WHITE, '#c1d32f', WHITE, '#c1d32f'),
      note: 'Volt set: white with red lettering trimmed granite (volt trim on the white from 2017-18), Granite Gray road, red alternate; the gray shade ?',
    },
    {
      from: 2018, to: 2020,
      home: k(WHITE, '#e03a3e', '#c1d32f', '#e03a3e', '#e03a3e', '#c1d32f'),
      away: k('#e03a3e', WHITE, '#c1d32f', WHITE, '#c1d32f'),
      alt: k('#6e7378', WHITE, '#e03a3e', WHITE, '#e03a3e', '#c1d32f'),
      note: 'Nike: red Icon (numbers with volt trim); the Statement (gray?) ?',
    },
    {
      from: 2021,
      home: k(WHITE, '#c8102e', '#fdb927', '#c8102e', '#c8102e', '#fdb927'),
      away: k('#c8102e', WHITE, '#fdb927', WHITE, '#fdb927', WHITE),
      alt: k(BLACK, '#c8102e', '#fdb927', '#c8102e', '#c8102e', '#fdb927'),
      note: 'red/black/legacy yellow (1978-82 look); wordmark and trim colors ?',
    },
  ],

  // Boston Celtics. Wikipedia "Boston Celtics"; the set has stayed essentially the same (no side panels).
  // Green-with-black alternate 2005-06 to 2016-17, a black Statement (green lettering, white trim) from 2017-18.
  BOS: [
    {
      from: 2001, to: 2005,
      home: k(WHITE, '#007a33', '#007a33', '#007a33', '#007a33', undefined, NOPANEL),
      away: k('#007a33', WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      note: 'no alternate before 2005-06; number outlines (none, or black?) ?',
    },
    {
      from: 2006, to: 2017,
      home: k(WHITE, '#007a33', '#007a33', '#007a33', '#007a33', undefined, NOPANEL),
      away: k('#007a33', WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      alt: k('#007a33', WHITE, BLACK, WHITE, BLACK, WHITE, NOPANEL),
      note: 'green-and-black "Boston" alternate',
    },
    {
      from: 2018,
      home: k(WHITE, '#007a33', '#007a33', '#007a33', '#007a33', undefined, NOPANEL),
      away: k('#007a33', WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      alt: k(BLACK, '#007a33', WHITE, '#007a33', '#007a33', WHITE, NOPANEL),
      note: 'Nike: black Statement, green lettering and numbers trimmed white',
    },
  ],

  // New Jersey Nets, Brooklyn Nets. Wikipedia "Brooklyn Nets": 1997-2012 white (navy team name, silver/red
  // trim), navy (silver city name, navy/red trim), dark-gray alternate to 2006, red alternate from 2006-07;
  // Brooklyn black and white from 2012-13 (no side panels): dark-gray sleeveless alternate 2014-15 to 2018-19,
  // lighter gray with black graffiti lettering 2019-22, black Statement with silver-trimmed black from 2022-23.
  BRK: [
    {
      from: 2001, to: 2006,
      home: k(WHITE, '#002a60', '#cd1041', '#002a60', '#002a60', '#8d9093', { numberFont: 'varsity' }),
      away: k('#002a60', '#8d9093', '#cd1041', '#8d9093', '#8d9093', '#cd1041', { numberFont: 'varsity' }),
      alt: k('#4a4f54', WHITE, '#cd1041', WHITE, '#cd1041', '#002a60', { numberFont: 'varsity' }),
      note: 'dark-gray alternate: "NEW JERSEY" and numbers white with red and navy trim',
    },
    {
      from: 2007, to: 2012,
      home: k(WHITE, '#002a60', '#cd1041', '#002a60', '#002a60', '#8d9093', { numberFont: 'varsity' }),
      away: k('#002a60', '#8d9093', '#cd1041', '#8d9093', '#8d9093', '#cd1041', { numberFont: 'varsity' }),
      alt: k('#cd1041', WHITE, '#002a60', WHITE, '#002a60', '#8d9093', { numberFont: 'varsity' }),
      note: 'red alternate (the main dark jersey from 2009)',
    },
    {
      from: 2013, to: 2014,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      away: k(BLACK, WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      note: 'Brooklyn: no sleeveless alternate its first two seasons',
    },
    {
      from: 2015, to: 2019,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      away: k(BLACK, WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      alt: k('#4a4f54', WHITE, BLACK, WHITE, BLACK, undefined, NOPANEL),
      note: 'dark-gray alternate with the team name in white (the Statement 2017-19)',
    },
    {
      from: 2020, to: 2022,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      away: k(BLACK, WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      alt: k('#a1a1a4', BLACK, '#4a4f54', BLACK, BLACK, '#4a4f54', NOPANEL),
      note: 'lighter gray Statement, black graffiti "BKLYN" and numbers, black/dark-gray stripes',
    },
    {
      from: 2023,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      away: k(BLACK, WHITE, WHITE, WHITE, WHITE, undefined, NOPANEL),
      alt: k(BLACK, BLACK, '#c6cfd4', BLACK, '#c6cfd4', undefined, NOPANEL),
      note: 'black Statement: black letters and numbers trimmed silver',
    },
  ],

  // Chicago Bulls. Wikipedia "Chicago Bulls"; unchanged since the 1970s apart from details. Black alternate,
  // the Statement pinstriped dark gray 2019-20 to 2024-25 and red from 2025-26.
  CHI: [
    {
      from: 2001, to: 2019,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141', WHITE),
    },
    {
      from: 2020, to: 2025,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141', WHITE, { pinstripe: '#333333' }),
      note: 'black Statement with dark-gray pinstripes',
    },
    {
      from: 2026,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141', WHITE, { pinstripe: '#ce1141' }),
      note: 'the Statement\'s pinstripes go red',
    },
  ],

  // Charlotte Hornets, Charlotte Bobcats. Wikipedia "Charlotte Hornets" (Uniforms): pinstriped teal/purple
  // to 2002 ("Charlotte" on both, purple pinstriped alternate); Bobcats orange 2004-09 (brighter shades to
  // 2007, blue alternate from 2006-07), blue arched with silver pinstripes 2009-12, navy "Cats" 2012-14;
  // Hornets white/purple + teal alternate 2014-17, white/teal + purple Statement from 2017-18, purple double
  // pinstripes on the Association and Icon from 2020-21.
  CHO: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160', { pinstripe: '#1d1160' }),
      away: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE, { pinstripe: '#1d1160' }),
      alt: k('#1d1160', WHITE, '#00788c', WHITE, '#00788c', WHITE, { pinstripe: '#00788c' }),
      note: 'pinstripes on all three; the purple alternate (1994-2002) white "CHARLOTTE" trimmed teal; number outline colors ?',
    },
    {
      from: 2005, to: 2006,
      home: k(WHITE, '#f58426', '#1d5a99', '#f58426', '#f58426', '#1d5a99'),
      away: k('#f58426', WHITE, '#1d5a99', WHITE, '#1d5a99', BLACK),
      note: 'Bobcats orange set in its brighter original shades; white and orange only',
    },
    {
      from: 2007, to: 2009,
      home: k(WHITE, '#f26532', '#2e5a8b', '#f26532', '#f26532', '#2e5a8b'),
      away: k('#f26532', WHITE, '#2e5a8b', WHITE, '#2e5a8b', BLACK),
      alt: k('#2e5a8b', WHITE, BLACK, WHITE, BLACK, '#f26532'),
      note: 'muted orange/blue, blue alternate from 2006-07',
    },
    {
      from: 2010, to: 2012,
      home: k(WHITE, '#2e5a8b', '#f26532', '#2e5a8b', '#2e5a8b', '#f26532', { pinstripe: '#c4ced4' }),
      away: k('#2e5a8b', WHITE, '#f26532', WHITE, '#f26532', '#8d9093', { pinstripe: '#c4ced4' }),
      alt: k('#f26532', WHITE, '#2e5a8b', WHITE, '#2e5a8b'),
      note: 'Bobcats blue arched set with silver pinstripes; an orange alternate ?',
    },
    {
      from: 2013, to: 2014,
      home: k(WHITE, '#4b9cd3', '#0c2340', '#0c2340', '#0c2340', '#4b9cd3'),
      away: k('#0c2340', WHITE, '#4b9cd3', WHITE, '#4b9cd3'),
      note: 'Bobcats navy/Carolina blue set ("Cats" home)',
    },
    {
      from: 2015, to: 2017,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160', { numberFont: 'varsity' }),
      away: k('#1d1160', WHITE, '#00788c', WHITE, '#00788c', WHITE, { numberFont: 'varsity' }),
      alt: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE, { numberFont: 'varsity' }),
      note: 'wordmark/number colors ?',
    },
    {
      from: 2018, to: 2020,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160', { numberFont: 'varsity' }),
      away: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE, { numberFont: 'varsity' }),
      alt: k('#1d1160', WHITE, '#00788c', WHITE, '#00788c', undefined, { numberFont: 'varsity' }),
      note: 'Nike: teal Icon, purple Statement; trims ?',
    },
    {
      from: 2021,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160', { numberFont: 'varsity', pinstripe: '#1d1160' }),
      away: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE, { numberFont: 'varsity', pinstripe: '#1d1160' }),
      alt: k('#1d1160', WHITE, '#00788c', WHITE, '#00788c', undefined, { numberFont: 'varsity' }),
      note: 'purple double pinstripes on the Association and Icon (the 1997-2002 homage)',
    },
  ],

  // Cleveland Cavaliers. Wikipedia "Cleveland Cavaliers" (Uniforms): blue/orange/black 1999-2003; wine,
  // gold, navy 2003-10 (navy alternate from 2005-06); wine and gold 2010-17 (gold alternate from 2012-13);
  // Nike 2017-22 (gold Icon lettering, black pinstriped Statement with wine numbers); the classic wine and
  // metallic gold from 2022-23 with a gold-lettered black Statement.
  CLE: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#00539b', BLACK, '#00539b', '#00539b', '#f57d31'),
      away: k('#00539b', WHITE, BLACK, WHITE, '#f57d31', BLACK),
      note: 'home: nickname in blue with black lines; road: city name in white with blue lines; the exact blue and orange ?',
    },
    {
      from: 2004, to: 2005,
      home: k(WHITE, '#041e42', '#fdbb30', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', WHITE, '#fdbb30', WHITE, '#fdbb30', '#041e42'),
      note: 'wine/gold/navy set; no alternate its first two seasons',
    },
    {
      from: 2006, to: 2010,
      home: k(WHITE, '#041e42', '#fdbb30', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', WHITE, '#fdbb30', WHITE, '#fdbb30', '#041e42'),
      alt: k('#041e42', WHITE, '#fdbb30', WHITE, '#860038', '#fdbb30'),
      note: 'navy alternate (wine/gold/navy checkerboard trim)',
    },
    {
      from: 2011, to: 2012,
      home: k(WHITE, '#860038', '#860038', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', '#fdbb30', '#fdbb30', '#fdbb30', '#fdbb30', WHITE),
      note: 'wine and gold; no alternate until 2012-13',
    },
    {
      from: 2013, to: 2017,
      home: k(WHITE, '#860038', '#860038', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', '#fdbb30', '#fdbb30', '#fdbb30', '#fdbb30', WHITE),
      alt: k('#fdbb30', '#860038', '#860038', '#860038', '#860038'),
      note: 'gold "CAVS" alternate (a navy alternate too 2015-17)',
    },
    {
      from: 2018, to: 2022,
      home: k(WHITE, '#6f263d', '#ffb81c', '#6f263d', '#6f263d', '#ffb81c', { numberFont: 'varsity' }),
      away: k('#6f263d', '#041e42', '#ffb81c', '#ffb81c', '#ffb81c', '#041e42', { numberFont: 'varsity' }),
      alt: k(BLACK, '#6f263d', '#ffb81c', '#ffb81c', '#ffb81c', undefined, { numberFont: 'varsity', pinstripe: '#333333' }),
      note: 'Icon: gold "Cleveland" and names over navy numbers trimmed gold; Statement: wine numbers trimmed gold, gold names, dark-gray pinstripes',
    },
    {
      from: 2023,
      home: k(WHITE, '#860038', '#fdbb30', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', '#fdbb30', '#fdbb30', '#fdbb30', '#fdbb30'),
      alt: k(BLACK, '#fdbb30', '#fdbb30', '#fdbb30', '#fdbb30'),
      note: '2022 rebrand: classic wine and metallic gold; gold names and numbers on the black Statement',
    },
  ],

  // Dallas Mavericks. Wikipedia "Dallas Mavericks": blue/green "a" set to 2001; midnight blue, royal (#00538c)
  // and silver 2001-10 (green "Mavs" alternate 2004-05 to 2008-09, royal "Mavs" 2009-10); royal road from
  // 2010-11, navy alternate; Nike Icon royal, Statement navy.
  DAL: [
    {
      from: 2001, to: 2001,
      home: k(WHITE, '#00538c', '#00843d', '#00538c', '#00538c', '#00843d'),
      away: k('#00538c', WHITE, '#00843d', WHITE, '#00843d', WHITE),
    },
    {
      from: 2002, to: 2004,
      home: k(WHITE, '#00538c', '#b8c4ca', '#002b5e', '#002b5e', '#b8c4ca'),
      away: k('#002b5e', '#b8c4ca', WHITE, WHITE, '#b8c4ca', '#00538c'),
      note: 'midnight-blue road: silver numbers trimmed white, "Dallas" white; no regular alternate (the silver worn once)',
    },
    {
      from: 2005, to: 2009,
      home: k(WHITE, '#00538c', '#b8c4ca', '#002b5e', '#002b5e', '#b8c4ca'),
      away: k('#002b5e', '#b8c4ca', WHITE, WHITE, '#b8c4ca', '#00538c'),
      alt: k('#00843d', '#b8c4ca', WHITE, WHITE, '#00538c'),
      note: 'green "Mavs" alternate; the green shade ?',
    },
    {
      from: 2010, to: 2010,
      home: k(WHITE, '#00538c', '#b8c4ca', '#002b5e', '#002b5e', '#b8c4ca'),
      away: k('#002b5e', '#b8c4ca', WHITE, WHITE, '#b8c4ca', '#00538c'),
      alt: k('#00538c', '#b8c4ca', WHITE, WHITE, '#002b5e', '#b8c4ca'),
      note: 'royal-blue "Mavs" alternate: white "Mavs" trimmed navy, silver numbers trimmed white',
    },
    {
      from: 2011,
      home: k(WHITE, '#00538c', '#b8c4ca', '#002b5e', '#002b5e', '#00538c'),
      away: k('#00538c', '#b8c4ca', WHITE, '#002b5e', '#002b5e', WHITE),
      alt: k('#002b5e', WHITE, '#00538c', WHITE, '#00538c', '#b8c4ca'),
      note: 'home wordmark/number colors ?',
    },
  ],

  // Denver Nuggets. Wikipedia "Denver Nuggets" (Colors, logos and uniforms): navy, metallic gold and maroon
  // 1993-2003; powder blue, gold, royal (navy from 2008-09) 2003-17 (navy alternate 2005-06 to 2011-12, gold
  // "skyline" alternate 2012-13 to 2016-17, navy numbers and gold scripts 2015-17); Nike 2017-18 with navy
  // primary and a gold Statement; midnight blue, sunshine yellow, Flatirons red, skyline blue from 2018-19.
  DEN: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#00285e', '#bd9b60', '#00285e', '#00285e', '#8b2131'),
      away: k('#00285e', '#bd9b60', '#8b2131', '#bd9b60', '#bd9b60', '#8b2131'),
    },
    {
      from: 2004, to: 2005,
      home: k(WHITE, '#4fa3e0', '#0e2240', '#4fa3e0', '#4fa3e0', '#fdb927'),
      away: k('#4fa3e0', WHITE, '#fdb927', WHITE, '#fdb927', '#0e2240'),
      note: 'powder blue set; no alternate its first two seasons; royal trim became navy in 2008-09',
    },
    {
      from: 2006, to: 2012,
      home: k(WHITE, '#4fa3e0', '#0e2240', '#4fa3e0', '#4fa3e0', '#fdb927'),
      away: k('#4fa3e0', WHITE, '#fdb927', WHITE, '#fdb927', '#0e2240'),
      alt: k('#0e2240', '#fdb927', '#4fa3e0', '#fdb927', '#fdb927', '#4fa3e0'),
      note: 'navy "Nuggets" alternate',
    },
    {
      from: 2013, to: 2015,
      home: k(WHITE, '#4fa3e0', '#0e2240', '#4fa3e0', '#4fa3e0', '#fdb927'),
      away: k('#4fa3e0', WHITE, '#fdb927', WHITE, '#fdb927', '#0e2240'),
      alt: k('#fdb927', WHITE, '#0e2240', '#0e2240', '#0e2240', '#4fa3e0', { numberFont: 'varsity' }),
      note: 'gold "skyline" alternate: white numbers with powder and navy trim, navy name',
    },
    {
      from: 2016, to: 2017,
      home: k(WHITE, '#0e2240', '#fdb927', '#fdb927', '#4fa3e0', '#fdb927'),
      away: k('#4fa3e0', '#0e2240', '#fdb927', '#fdb927', '#fdb927', '#0e2240'),
      alt: k('#fdb927', '#0e2240', WHITE, '#0e2240', '#0e2240', '#4fa3e0'),
      note: 'navy numbers trimmed gold with navy nameplates and gold scripts on both; retro navy "Nuggets" on the gold',
    },
    {
      from: 2018, to: 2018,
      home: k(WHITE, '#0e2240', '#fdb927', '#0e2240', '#0e2240', '#4fa3e0'),
      away: k('#0e2240', '#fdb927', '#4fa3e0', '#fdb927', '#fdb927', '#4fa3e0'),
      alt: k('#fdb927', '#0e2240', WHITE, '#0e2240', '#0e2240', '#4fa3e0'),
      note: 'first Nike season, navy primary; gold Statement with navy "Nuggets" and numbers trimmed white, rainbow sides',
    },
    {
      from: 2019,
      home: k(WHITE, '#0e2240', '#fec524', '#8b2131', '#0e2240', '#fec524'),
      away: k('#0e2240', WHITE, '#8b2131', '#fec524', '#fec524', '#8b2131'),
      alt: k('#1d428a', '#fec524', '#fec524', WHITE, '#0e2240'),
    },
  ],

  // Detroit Pistons. Wikipedia "Detroit Pistons" and sportslogos.net: teal, black, yellow and red 1996-2001;
  // red, white and blue (#1d42ba) in the 1981-96 pattern from 2001-02: red "PISTONS" and numbers trimmed blue
  // on the white; the Nike Association (2017-18) blue lettering trimmed red.
  DET: [
    {
      from: 2001, to: 2001,
      home: k(WHITE, '#006272', BLACK, '#006272', '#006272', '#8b1a3e'),
      away: k('#006272', WHITE, BLACK, WHITE, BLACK, '#8b1a3e'),
      note: 'teal horse set; wordmark/trim colors ?',
    },
    {
      from: 2002, to: 2017,
      home: k(WHITE, '#c8102e', '#1d42ba', '#c8102e', '#1d42ba', '#c8102e'),
      away: k('#1d42ba', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      alt: k('#c8102e', WHITE, '#1d42ba', WHITE, '#1d42ba', WHITE),
      note: 'red alternate ?',
    },
    {
      from: 2018,
      home: k(WHITE, '#1d42ba', '#c8102e', '#1d42ba', '#1d42ba', '#c8102e'),
      away: k('#1d42ba', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      alt: k('#c8102e', WHITE, '#1d42ba', WHITE, '#1d42ba', WHITE),
      note: 'Nike: blue "DETROIT" and numbers trimmed red; the red Statement ?',
    },
  ],

  // Golden State Warriors. Wikipedia "Golden State Warriors": "Thunder" era navy, gold, orange 1997-2010
  // (navy lettering on white from 2001-02, orange alternate from 2004-05); royal blue and gold from 2010-11:
  // gold sleeved alternate from Feb 2013, slate-gray "The Town" 2014-15 to 2018-19, gold "The Bay" 2019-22,
  // navy Statement 2022-24, black from 2024-25.
  GSW: [
    {
      from: 2001, to: 2004,
      home: k(WHITE, '#041e42', '#ff8000', '#041e42', '#041e42', '#ff8000'),
      away: k('#041e42', '#fdb927', '#ff8000', '#fdb927', '#ff8000', '#fdb927'),
      note: 'no alternate before 2004-05; road wordmark/number colors ?',
    },
    {
      from: 2005, to: 2010,
      home: k(WHITE, '#041e42', '#ff8000', '#041e42', '#041e42', '#ff8000'),
      away: k('#041e42', '#fdb927', '#ff8000', '#fdb927', '#ff8000', '#fdb927'),
      alt: k('#ff8000', '#041e42', '#fdb927', '#041e42', '#041e42'),
      note: 'orange alternate',
    },
    {
      from: 2011, to: 2012,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      note: 'royal and gold set; no alternate its first two seasons',
    },
    {
      from: 2013, to: 2014,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      alt: k('#ffc72c', '#1d428a', '#1d428a', '#1d428a', '#1d428a'),
      note: 'gold sleeved alternate (from Feb 2013)',
    },
    {
      from: 2015, to: 2019,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      alt: k('#4a4f54', WHITE, '#ffc72c', WHITE, '#ffc72c'),
      note: 'slate-gray alternate, white lettering trimmed gold (sleeved, then "The Town" Statement 2017-19)',
    },
    {
      from: 2020, to: 2022,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      alt: k('#ffc72c', '#1d428a', '#1d428a', '#1d428a', '#1d428a'),
      note: 'gold "The Bay" Statement',
    },
    {
      from: 2023, to: 2024,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      alt: k('#041e42', '#ffc72c', WHITE, '#ffc72c', '#ffc72c'),
      note: 'navy Statement: block "Golden State", gold numbers trimmed white',
    },
    {
      from: 2025,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      alt: k(BLACK, '#ffc72c', WHITE, '#ffc72c', '#ffc72c'),
      note: 'black Statement: "Golden"/"State" round a gold number',
    },
  ],

  // Houston Rockets. Wikipedia "Houston Rockets" (Logos and uniforms): navy, silver, red pinstripes 1995-2003;
  // red and white with black and silver 2003-19 (black "ROCKETS" alternate from 2016-17); new block-lettered
  // set with a black Statement 2019-20; red and yellow sets announced for 2026-27.
  HOU: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#002d62', '#c4ced4', '#002d62', '#002d62', '#ce1141', { pinstripe: '#c4ced4' }),
      away: k('#002d62', WHITE, '#ce1141', WHITE, '#ce1141', '#c4ced4', { pinstripe: '#c4ced4' }),
      note: 'silver pinstripes; wordmark colors ?',
    },
    {
      from: 2004, to: 2016,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', '#c4ced4', { numberFont: 'rounded' }),
      away: k('#ce1141', WHITE, BLACK, WHITE, '#c4ced4', BLACK, { numberFont: 'rounded' }),
      note: 'no regular alternate (throwbacks and one-offs only)',
    },
    {
      from: 2017, to: 2019,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', '#c4ced4', { numberFont: 'rounded' }),
      away: k('#ce1141', WHITE, BLACK, WHITE, '#c4ced4', BLACK, { numberFont: 'rounded' }),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141', undefined, { numberFont: 'rounded' }),
      note: 'black "ROCKETS" alternate',
    },
    {
      from: 2020, to: 2026,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141'),
      note: 'trims ?',
    },
    {
      from: 2027,
      home: k(WHITE, '#ce1141', '#fdb927', '#ce1141', '#ce1141', '#fdb927'),
      away: k('#ce1141', '#fdb927', WHITE, '#fdb927', '#fdb927', WHITE),
      alt: k(BLACK, '#ce1141', '#fdb927', '#ce1141', '#ce1141', '#fdb927'),
      note: 'announced red-and-yellow set (1973-95 inspired); colors as described, not yet seen ?',
    },
  ],

  // Indiana Pacers. Wikipedia "Indiana Pacers": pinstripes and state name 1997-2005 (yellow alternate); thin
  // stripes, team name on white, silver added 2005-17 (gold alternate from 2008-09); Nike white/navy/yellow.
  // The navy road's lettering and numbers are gold trimmed white.
  IND: [
    {
      from: 2001, to: 2005,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30', { pinstripe: '#002d62' }),
      away: k('#002d62', '#fdbb30', WHITE, '#fdbb30', '#fdbb30', WHITE, { pinstripe: WHITE }),
      alt: k('#fdbb30', '#002d62', WHITE, '#002d62', '#002d62'),
      note: 'navy pinstripes on the white, white on the navy',
    },
    {
      from: 2006, to: 2008,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30'),
      away: k('#002d62', '#fdbb30', WHITE, '#fdbb30', '#fdbb30', '#bec0c2'),
      note: 'no alternate until 2008-09',
    },
    {
      from: 2009, to: 2017,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30'),
      away: k('#002d62', '#fdbb30', WHITE, '#fdbb30', '#fdbb30', '#bec0c2'),
      alt: k('#fdbb30', '#002d62', '#002d62', '#002d62', '#002d62'),
      note: 'gold alternate',
    },
    {
      from: 2018,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30'),
      away: k('#002d62', '#fdbb30', WHITE, '#fdbb30', '#fdbb30'),
      alt: k('#fdbb30', '#002d62', '#002d62', '#002d62', '#002d62'),
    },
  ],

  // LA Clippers. Wikipedia "Los Angeles Clippers" and sportslogos.net: 1987 script set to 2010 (red road, blue
  // alternate 2002-03 to 2009-10); 2010-15 white/red/blue; 2015-17 black-wordmark brand (red road "LAC", black
  // alternate); Nike 2017-24 white, blue Icon, black Statement; navy and red script sets from 2024-25.
  LAC: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, '#1d428a', '#c8102e', '#c8102e', '#c8102e', '#1d428a'),
      away: k('#c8102e', WHITE, '#1d428a', WHITE, '#1d428a', WHITE),
      note: 'no alternate; home script color (red or blue?) ?',
    },
    {
      from: 2003, to: 2010,
      home: k(WHITE, '#1d428a', '#c8102e', '#c8102e', '#c8102e', '#1d428a'),
      away: k('#c8102e', WHITE, '#1d428a', WHITE, '#1d428a', WHITE),
      alt: k('#1d428a', WHITE, '#c8102e', '#c8102e', '#c8102e', WHITE),
      note: 'blue "Los Angeles" alternate',
    },
    {
      from: 2011, to: 2015,
      home: k(WHITE, '#c8102e', '#1d428a', '#1d428a', '#1d428a', '#c8102e'),
      away: k('#c8102e', '#1d428a', WHITE, WHITE, '#1d428a', WHITE),
      alt: k('#1d428a', '#c8102e', WHITE, WHITE, '#c8102e', WHITE),
    },
    {
      from: 2016, to: 2017,
      home: k(WHITE, '#1d428a', '#c8102e', BLACK, BLACK, '#c8102e'),
      away: k('#c8102e', WHITE, '#1d428a', WHITE, '#1d428a', BLACK),
      alt: k(BLACK, WHITE, '#c8102e', WHITE, '#c8102e', '#1d428a'),
      note: 'number colors ?',
    },
    {
      from: 2018, to: 2024,
      home: k(WHITE, '#1d428a', '#c8102e', BLACK, BLACK, '#c8102e'),
      away: k('#1d428a', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      alt: k(BLACK, WHITE, '#c8102e', WHITE, '#c8102e', '#1d428a'),
      note: 'Icon wordmark color ?',
    },
    {
      from: 2025,
      home: k(WHITE, '#c8102e', '#0c2340', '#0c2340', '#0c2340', '#c8102e'),
      away: k('#0c2340', WHITE, '#c8102e', '#c8102e', '#c8102e', WHITE),
      alt: k('#c8102e', WHITE, '#0c2340', '#0c2340', '#0c2340', WHITE),
    },
  ],

  // Los Angeles Lakers. Wikipedia "Los Angeles Lakers": unchanged purple and gold; gold at home, purple on
  // the road, white "Sunday whites" (2002-03 on) and the white Association from 2017-18. V-necks, no side panels.
  LAL: [
    {
      from: 2001,
      home: k('#fdb927', '#552583', WHITE, '#552583', '#552583', WHITE, { ...V, ...NOPANEL }),
      away: k('#552583', '#fdb927', WHITE, '#fdb927', '#fdb927', WHITE, { ...V, ...NOPANEL }),
      alt: k(WHITE, '#552583', '#fdb927', '#552583', '#552583', '#fdb927', { ...V, ...NOPANEL }),
      note: 'home is gold (the Lakers wear it at home); alt is the white, worn from 2002-03',
    },
  ],

  // Vancouver Grizzlies, Memphis Grizzlies. Wikipedia "Vancouver Grizzlies" (black primary and the new
  // white set of 2000-01: black lettering with red and turquoise trim) and "Memphis Grizzlies" (kept to
  // 2004 with "Memphis"; navy, Beale Street blue, gold from 2004-05, the Beale Street blue alternate from
  // 2009-10 with navy split lettering; Nike sets 2018-19).
  MEM: [
    {
      from: 2001, to: 2004,
      home: k(WHITE, BLACK, '#00b2a9', BLACK, '#00b2a9', '#e43c40'),
      away: k(BLACK, WHITE, '#e43c40', WHITE, '#00b2a9', '#e43c40'),
      note: 'Vancouver in 2001, "Memphis" on the same set 2002-04; trim order ?',
    },
    {
      from: 2005, to: 2009,
      home: k(WHITE, '#12173f', '#5d76a9', '#12173f', '#12173f', '#5d76a9'),
      away: k('#12173f', WHITE, '#5d76a9', WHITE, '#5d76a9', '#f5b112'),
      note: 'no alternate before 2009-10',
    },
    {
      from: 2010, to: 2018,
      home: k(WHITE, '#12173f', '#5d76a9', '#12173f', '#12173f', '#5d76a9'),
      away: k('#12173f', WHITE, '#5d76a9', WHITE, '#5d76a9', '#f5b112'),
      alt: k('#5d76a9', '#12173f', WHITE, '#12173f', '#12173f'),
      note: 'Beale Street blue alternate: navy "MEMPHIS" and numbers trimmed white',
    },
    {
      from: 2019,
      home: k(WHITE, '#12173f', '#5d76a9', '#12173f', '#12173f', '#5d76a9'),
      away: k('#12173f', WHITE, '#5d76a9', WHITE, '#5d76a9'),
      alt: k('#5d76a9', WHITE, '#12173f', '#f5b112', '#12173f'),
      note: 'Statement wordmark gold/navy from 2022 ?',
    },
  ],

  // Miami Heat. Wikipedia "Miami Heat"; the set has been the same since the late 1990s: white home, black
  // road, red alternate (red, black and gold on white).
  MIA: [
    {
      from: 2001,
      home: k(WHITE, '#98002e', BLACK, '#98002e', BLACK, '#98002e', { collarStyle: 'round' }),
      away: k(BLACK, WHITE, '#98002e', WHITE, '#98002e', '#f9a01b', { collarStyle: 'round' }),
      alt: k('#98002e', WHITE, BLACK, WHITE, BLACK, '#f9a01b', { collarStyle: 'round' }),
      note: 'lettering and number colors (red or black on white?) ?',
    },
  ],

  // Milwaukee Bucks. Wikipedia "Milwaukee Bucks": purple, green, silver 1993-2006 (silver road lettering
  // from 2001-02); hunter green, red, silver 2006-15 (red "Milwaukee" road alternate from 2008-09); green,
  // cream, blue, black with the Cream City rainbow from 2015-16 (black alternate/Statement).
  MIL: [
    {
      from: 2001, to: 2006,
      home: k(WHITE, '#00471b', '#702f8a', '#00471b', '#702f8a', '#a7a8aa'),
      away: k('#702f8a', '#a7a8aa', '#00471b', '#a7a8aa', '#00471b', WHITE),
      note: 'home wordmark (green or purple?) ?',
    },
    {
      from: 2007, to: 2008,
      home: k(WHITE, '#00471b', '#ac1a2f', '#00471b', '#00471b', '#ac1a2f'),
      away: k('#00471b', WHITE, '#ac1a2f', WHITE, '#ac1a2f', WHITE),
      note: 'no alternate until 2008-09',
    },
    {
      from: 2009, to: 2015,
      home: k(WHITE, '#00471b', '#ac1a2f', '#00471b', '#00471b', '#ac1a2f'),
      away: k('#00471b', WHITE, '#ac1a2f', WHITE, '#ac1a2f', WHITE),
      alt: k('#ac1a2f', WHITE, '#a7a8aa', WHITE, WHITE),
      note: 'red "Milwaukee" road alternate, white lettering with silver',
    },
    {
      from: 2016,
      home: k(WHITE, '#00471b', '#00471b', '#00471b', '#00471b', '#eee1c6'),
      away: k('#00471b', '#eee1c6', '#eee1c6', '#eee1c6', '#eee1c6'),
      alt: k(BLACK, '#eee1c6', '#00471b', '#eee1c6', '#00471b'),
    },
  ],

  // Minnesota Timberwolves. Wikipedia "Minnesota Timberwolves": blue, black, gray 1996-2008 (black alternate);
  // "Wolves"/"Minnesota" 2008-17 (black alternate from Nov 2010); Nike navy/white with a neon green Statement
  // 2017-22 and a charcoal one 2022-26; white, blue and black-trees sets (1989-96 based) for 2026-27.
  MIN: [
    {
      from: 2001, to: 2008,
      home: k(WHITE, '#0053a0', BLACK, '#0053a0', '#0053a0', BLACK),
      away: k('#0053a0', WHITE, BLACK, WHITE, BLACK, '#00a94f'),
      alt: k(BLACK, WHITE, '#0053a0', WHITE, '#0053a0'),
      note: 'tree-line set; the blue shade and wordmark colors ?',
    },
    {
      from: 2009, to: 2010,
      home: k(WHITE, '#236192', '#0c2340', '#236192', '#236192', '#78be20', { numberFont: 'varsity' }),
      away: k('#236192', WHITE, '#0c2340', WHITE, '#0c2340', '#78be20', { numberFont: 'varsity' }),
      note: 'green trim dropped from 2010-11; no alternate until Nov 2010',
    },
    {
      from: 2011, to: 2017,
      home: k(WHITE, '#236192', '#0c2340', '#236192', '#236192', '#78be20', { numberFont: 'varsity' }),
      away: k('#236192', WHITE, '#0c2340', WHITE, '#0c2340', '#78be20', { numberFont: 'varsity' }),
      alt: k(BLACK, WHITE, '#236192', WHITE, '#236192', undefined, { numberFont: 'varsity' }),
      note: 'black alternate',
    },
    {
      from: 2018, to: 2022,
      home: k(WHITE, '#0c2340', '#236192', '#0c2340', '#0c2340', '#236192'),
      away: k('#0c2340', WHITE, '#236192', WHITE, WHITE),
      alt: k('#78be20', WHITE, '#0c2340', '#0c2340', '#0c2340'),
      note: 'neon green Statement',
    },
    {
      from: 2023, to: 2026,
      home: k(WHITE, '#0c2340', '#236192', '#0c2340', '#0c2340', '#236192'),
      away: k('#0c2340', WHITE, '#236192', WHITE, WHITE),
      alt: k('#45484d', '#9ea2a2', '#78be20', WHITE, '#78be20'),
      note: 'charcoal Statement: white "TIMBERWOLVES", gray numbers trimmed neon green',
    },
    {
      from: 2027,
      home: k(WHITE, '#0053a0', '#00a94f', '#0053a0', '#0053a0', '#00a94f'),
      away: k('#0053a0', WHITE, '#00a94f', WHITE, '#00a94f'),
      alt: k(BLACK, WHITE, '#0053a0', WHITE, '#0053a0', '#00a94f'),
      note: 'announced 2026-27 sets (1989-96 style, black-trees Statement); colors ?',
    },
  ],

  // New Orleans Hornets, New Orleans Pelicans. Wikipedia "New Orleans Pelicans": teal, purple, gold 2002-07
  // (city name only; gold alternate from 2004-05, the primary road from 2006-07 with teal the alternate);
  // creole blue with pinstripes 2008-13 (gold "NOLA" alternate from 2010-11); Pelicans navy, red, gold from
  // 2013-14 (red alternate from 2014-15, "Crescent City" lettering from 2023-24).
  NOP: [
    {
      from: 2003, to: 2004,
      home: k(WHITE, '#00778b', '#2b1d5c', '#00778b', '#00778b', '#2b1d5c'),
      away: k('#00778b', WHITE, '#2b1d5c', WHITE, '#2b1d5c', '#c1a362'),
      note: 'no alternate the first two seasons',
    },
    {
      from: 2005, to: 2006,
      home: k(WHITE, '#00778b', '#2b1d5c', '#00778b', '#00778b', '#2b1d5c'),
      away: k('#00778b', WHITE, '#2b1d5c', WHITE, '#2b1d5c', '#c1a362'),
      alt: k('#c1a362', '#2b1d5c', WHITE, '#2b1d5c', '#2b1d5c'),
      note: 'gold alternate (purple "New Orleans" and numbers trimmed white); the NO/OKC "OKC"-patch whites',
    },
    {
      from: 2007, to: 2008,
      home: k(WHITE, '#00778b', '#2b1d5c', '#00778b', '#00778b', '#2b1d5c'),
      away: k('#c1a362', '#2b1d5c', WHITE, '#2b1d5c', '#2b1d5c'),
      alt: k('#00778b', WHITE, '#2b1d5c', WHITE, '#2b1d5c', '#c1a362'),
      note: 'the gold became the primary road, the teal the alternate',
    },
    {
      from: 2009, to: 2010,
      home: k(WHITE, '#0093b2', '#2b1d5c', '#0093b2', '#0093b2', '#c1a362', { pinstripe: '#2b1d5c' }),
      away: k('#0093b2', WHITE, '#c1a362', WHITE, '#c1a362', WHITE, { pinstripe: '#c1a362' }),
      note: 'creole blue pinstriped set; no regular alternate (Mardi Gras one-offs); wordmark colors ?',
    },
    {
      from: 2011, to: 2013,
      home: k(WHITE, '#0093b2', '#2b1d5c', '#0093b2', '#0093b2', '#c1a362', { pinstripe: '#2b1d5c' }),
      away: k('#0093b2', WHITE, '#c1a362', WHITE, '#c1a362', WHITE, { pinstripe: '#c1a362' }),
      alt: k('#c1a362', '#0093b2', WHITE, '#0093b2', '#0093b2', undefined, { pinstripe: '#2b1d5c' }),
      note: 'gold pinstriped "NOLA" alternate',
    },
    {
      from: 2014, to: 2014,
      home: k(WHITE, '#0a2240', '#b4975a', '#0a2240', '#0a2240', '#c8102e'),
      away: k('#0a2240', WHITE, '#b4975a', WHITE, '#b4975a', '#c8102e'),
      note: 'Pelicans: no alternate the first season; trims ?',
    },
    {
      from: 2015, to: 2023,
      home: k(WHITE, '#0a2240', '#b4975a', '#0a2240', '#0a2240', '#c8102e'),
      away: k('#0a2240', WHITE, '#b4975a', WHITE, '#b4975a', '#c8102e'),
      alt: k('#c8102e', WHITE, '#0a2240', WHITE, '#0a2240', '#b4975a'),
      note: 'red alternate/Statement: white "Pelicans" and numbers trimmed navy',
    },
    {
      from: 2024,
      home: k(WHITE, '#0a2240', '#b4975a', '#0a2240', '#0a2240', '#c8102e'),
      away: k('#0a2240', WHITE, '#b4975a', WHITE, '#b4975a', '#c8102e'),
      alt: k('#c8102e', '#0a2240', WHITE, WHITE, '#0a2240', '#b4975a'),
      note: '"Crescent City" Statement: white letters trimmed navy round navy numbers trimmed white',
    },
  ],

  // New York Knicks. Wikipedia "New York Knicks": the 1997 set to 2011-12 (black accents, "NEW YORK" white
  // with orange on the blue); black dropped from 2012-13 (the blue's wordmark orange trimmed white), otherwise
  // the same through Nike. The blue's numbers white trimmed orange. Statements: white 2017-19 (left out), blue
  // 2019-22, navy 2022-25, black 2025-26.
  NYK: [
    {
      from: 2001, to: 2012,
      home: k(WHITE, '#006bb6', '#f58426', '#006bb6', '#006bb6', '#f58426'),
      away: k('#006bb6', WHITE, '#f58426', WHITE, '#f58426', BLACK),
      note: 'black trim; no alternate',
    },
    {
      from: 2013, to: 2019,
      home: k(WHITE, '#006bb6', '#f58426', '#006bb6', '#006bb6', '#f58426'),
      away: k('#006bb6', WHITE, '#f58426', '#f58426', '#f58426', WHITE),
      note: 'black dropped; "NEW YORK" orange trimmed white; the white Statement of 2017-19 left out',
    },
    {
      from: 2020, to: 2022,
      home: k(WHITE, '#006bb6', '#f58426', '#006bb6', '#006bb6', '#f58426'),
      away: k('#006bb6', WHITE, '#f58426', '#f58426', '#f58426', WHITE),
      alt: k('#006bb6', WHITE, '#f58426', WHITE, '#f58426', WHITE),
      note: 'blue Statement: white letters, blue/orange trim',
    },
    {
      from: 2023, to: 2025,
      home: k(WHITE, '#006bb6', '#f58426', '#006bb6', '#006bb6', '#f58426'),
      away: k('#006bb6', WHITE, '#f58426', '#f58426', '#f58426', WHITE),
      alt: k('#0c2340', '#f58426', '#006bb6', '#f58426', '#f58426', '#006bb6'),
      note: 'navy Statement: orange letters trimmed blue, an orange gradient stripe',
    },
    {
      from: 2026,
      home: k(WHITE, '#006bb6', '#f58426', '#006bb6', '#006bb6', '#f58426'),
      away: k('#006bb6', WHITE, '#f58426', '#f58426', '#f58426', WHITE),
      alt: k(BLACK, '#f58426', '#006bb6', '#f58426', '#f58426', '#006bb6'),
      note: 'black Statement with orange/blue gradient stripes',
    },
  ],

  // Seattle SuperSonics, Oklahoma City Thunder. Wikipedia "Seattle SuperSonics" (1995-2001 green, red,
  // orange; 2001-08 white/green/gold "SONICS"/"SEATTLE", gold alternate) and "Oklahoma City Thunder"
  // (2008 set kept almost intact; navy alternate with vertical white "OKC" from Nov 2012; navy Statement with
  // sunset-orange italic "OKC" 2017-19; sunset-orange Statement with light blue lettering from 2019-20).
  OKC: [
    {
      from: 2001, to: 2001,
      home: k(WHITE, '#00653a', '#b3203f', '#00653a', '#00653a', '#b3203f'),
      away: k('#00653a', WHITE, '#b3203f', WHITE, '#b3203f', '#f38b2c'),
      note: '1995-2001 Sonics set; wordmark/trim colors ?',
    },
    {
      from: 2002, to: 2008,
      home: k(WHITE, '#00653a', '#ffc200', '#00653a', '#00653a', '#ffc200'),
      away: k('#00653a', WHITE, '#ffc200', WHITE, '#ffc200', WHITE),
      alt: k('#ffc200', '#00653a', WHITE, '#00653a', '#00653a', WHITE),
    },
    {
      from: 2009, to: 2012,
      home: k(WHITE, '#007ac1', '#002d62', '#007ac1', '#ef3b24', '#fdbb30'),
      away: k('#007ac1', WHITE, '#002d62', WHITE, '#ef3b24', '#fdbb30'),
      note: 'Thunder: no alternate until Nov 2012; trims ?',
    },
    {
      from: 2013, to: 2017,
      home: k(WHITE, '#007ac1', '#002d62', '#007ac1', '#ef3b24', '#fdbb30'),
      away: k('#007ac1', WHITE, '#002d62', WHITE, '#ef3b24', '#fdbb30'),
      alt: k('#002d62', WHITE, '#007ac1', WHITE, '#ef3b24', '#fdbb30'),
      note: 'navy alternate: vertical white "OKC", white numbers',
    },
    {
      from: 2018, to: 2019,
      home: k(WHITE, '#007ac1', '#002d62', '#007ac1', '#ef3b24', '#fdbb30'),
      away: k('#007ac1', WHITE, '#002d62', WHITE, '#ef3b24', '#fdbb30'),
      alt: k('#002d62', '#ef3b24', WHITE, '#ef3b24', '#007ac1'),
      note: 'navy Statement with the sunset-orange italic "OKC"',
    },
    {
      from: 2020,
      home: k(WHITE, '#007ac1', '#002d62', '#007ac1', '#ef3b24', '#fdbb30'),
      away: k('#007ac1', WHITE, '#002d62', WHITE, '#ef3b24', '#fdbb30'),
      alt: k('#ef3b24', '#007ac1', WHITE, '#007ac1', '#007ac1', WHITE),
      note: 'sunset-orange Statement: light blue lettering and numbers trimmed white',
    },
  ],

  // Orlando Magic. Wikipedia "Orlando Magic": sublimated stars 1998-2003; block lettering 2003-08; pinstripes
  // 2008-17 (silver on the white, white on the blue; black pinstriped alternate from 2010-11); Nike white/blue/
  // black (the black the Icon and the blue the Statement 2019-25, black pinstripes on the blue from 2022-23);
  // modernized pinstripes from 2025-26.
  ORL: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0'),
      away: k('#0077c0', WHITE, BLACK, WHITE, WHITE),
      note: 'stars set; trims ?',
    },
    {
      from: 2004, to: 2008,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', '#c4ced4'),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
    },
    {
      from: 2009, to: 2010,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', '#c4ced4', { pinstripe: '#c4ced4' }),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, WHITE, { pinstripe: WHITE }),
      note: 'pinstriped set; no alternate until 2010-11',
    },
    {
      from: 2011, to: 2017,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', '#c4ced4', { pinstripe: '#c4ced4' }),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, WHITE, { pinstripe: WHITE }),
      alt: k(BLACK, WHITE, '#0077c0', WHITE, '#0077c0', '#c4ced4', { pinstripe: '#c4ced4' }),
      note: 'black pinstriped alternate mirroring the blue road: white "ORLANDO" and numbers trimmed blue',
    },
    {
      from: 2018, to: 2019,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', BLACK, { pinstripe: '#c4ced4' }),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, WHITE, '#0077c0', WHITE, '#0077c0', undefined, { pinstripe: '#0077c0' }),
      note: 'Nike: silver pinstripes on the Association, blue on the black Statement',
    },
    {
      from: 2020, to: 2022,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', BLACK),
      away: k(BLACK, WHITE, '#0077c0', WHITE, '#0077c0', '#c4ced4'),
      alt: k('#0077c0', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      note: 'the black jersey the Icon, the blue (silver star, black stripes) the Statement',
    },
    {
      from: 2023, to: 2025,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', BLACK),
      away: k(BLACK, WHITE, '#0077c0', WHITE, '#0077c0', '#c4ced4'),
      alt: k('#0077c0', WHITE, BLACK, WHITE, BLACK, '#c4ced4', { pinstripe: BLACK }),
      note: 'black pinstripes on the blue Statement',
    },
    {
      from: 2026,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', '#c4ced4', { pinstripe: '#c4ced4' }),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, '#c4ced4', { pinstripe: WHITE }),
      alt: k(BLACK, WHITE, '#0077c0', WHITE, '#c4ced4', undefined, { pinstripe: '#c4ced4' }),
      note: 'modernized pinstripes: silver on the white, white on the blue, silver on the black',
    },
  ],

  // Philadelphia 76ers. Wikipedia "Philadelphia 76ers": black, gold, red 1997-2009 (white home black letters,
  // black road white letters, red trim; blue alternate 2000-06, red "SIXERS" 2006-09); "Sixers" blue/red
  // 2009-15; "PHILA" blue/red from 2015-16 (red alternate/Statement).
  PHI: [
    {
      from: 2001, to: 2006,
      home: k(WHITE, BLACK, '#ed174c', BLACK, BLACK, '#ed174c'),
      away: k(BLACK, WHITE, '#ed174c', WHITE, '#ed174c', '#c4a24c'),
      alt: k('#006bb6', WHITE, '#ed174c', WHITE, '#ed174c'),
      note: 'blue "PHILADELPHIA" alternate',
    },
    {
      from: 2007, to: 2009,
      home: k(WHITE, BLACK, '#ed174c', BLACK, BLACK, '#ed174c'),
      away: k(BLACK, WHITE, '#ed174c', WHITE, '#ed174c', '#c4a24c'),
      alt: k('#ed174c', WHITE, BLACK, WHITE, BLACK, '#c4a24c'),
      note: 'red alternate: white "SIXERS" with black trim',
    },
    {
      from: 2010, to: 2015,
      home: k(WHITE, '#ed174c', '#006bb6', '#006bb6', '#006bb6', '#ed174c'),
      away: k('#ed174c', WHITE, '#006bb6', WHITE, '#006bb6', WHITE),
      alt: k('#006bb6', WHITE, '#ed174c', WHITE, '#ed174c', WHITE),
      note: 'the blue became the main road set after 2013',
    },
    {
      from: 2016,
      home: k(WHITE, '#006bb6', '#ed174c', '#006bb6', '#006bb6', '#ed174c'),
      away: k('#006bb6', WHITE, '#ed174c', WHITE, '#ed174c', WHITE),
      alt: k('#ed174c', WHITE, '#006bb6', WHITE, '#006bb6'),
    },
  ],

  // Phoenix Suns. Wikipedia "Phoenix Suns" (Logos and uniforms), all stated there: the Statement black
  // 2017-19, orange ("Streaking Sun", white numbers) 2019-22, black 2022-23.
  PHO: [
    {
      from: 2001, to: 2013,
      home: k(WHITE, '#1d1160', '#e56020', '#1d1160', '#1d1160', '#e56020'),
      away: k('#1d1160', WHITE, '#e56020', WHITE, '#e56020', '#63727a'),
      alt: k('#e56020', WHITE, '#1d1160', WHITE, '#1d1160', '#63727a'),
      note: 'home wordmark color ?',
    },
    {
      from: 2014, to: 2017,
      home: k(WHITE, BLACK, BLACK, '#e56020', '#e56020', BLACK, { numberFont: 'rounded' }),
      away: k('#1d1160', '#e56020', '#e56020', WHITE, WHITE, '#e56020', { numberFont: 'rounded' }),
      alt: k('#e56020', BLACK, BLACK, WHITE, BLACK, undefined, { numberFont: 'rounded' }),
    },
    {
      from: 2018, to: 2019,
      home: k(WHITE, '#1d1160', '#1d1160', '#e56020', '#1d1160', '#e56020'),
      away: k('#1d1160', '#e56020', '#e56020', '#63727a', '#63727a'),
      alt: k(BLACK, '#e56020', '#e56020', '#63727a', '#63727a'),
      note: 'black Statement',
    },
    {
      from: 2020, to: 2022,
      home: k(WHITE, '#1d1160', '#1d1160', '#e56020', '#1d1160', '#e56020'),
      away: k('#1d1160', '#e56020', '#e56020', '#63727a', '#63727a'),
      alt: k('#e56020', WHITE, '#1d1160', WHITE, '#1d1160', '#63727a'),
      note: 'orange Statement: the Streaking Sun, white numbers trimmed purple, "PHX" on the belt',
    },
    {
      from: 2023, to: 2023,
      home: k(WHITE, '#1d1160', '#1d1160', '#e56020', '#1d1160', '#e56020'),
      away: k('#1d1160', '#e56020', '#e56020', '#63727a', '#63727a'),
      alt: k(BLACK, '#e56020', '#e56020', '#63727a', '#63727a'),
      note: 'black Statement again',
    },
    {
      from: 2024,
      home: k(WHITE, '#1d1160', '#e56020', '#1d1160', '#1d1160', '#e56020'),
      away: k('#1d1160', WHITE, '#e56020', '#e56020', '#e56020'),
      alt: k(BLACK, WHITE, '#e56020', '#e56020', '#1d1160', '#e56020'),
      note: '1990s Streaking Sun revival; wordmark colors ?',
    },
  ],

  // Portland Trail Blazers. Wikipedia "Portland Trail Blazers": 1991-2002 white/black with red drop shadows;
  // 2002-03 silver added and a red alternate (white lettering to 2011-12, black trimmed white from 2012-13; the
  // Nike Statement's "RIP CITY" 2017-22 white).
  POR: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, BLACK, '#e03a3e', BLACK, BLACK, '#e03a3e'),
      away: k(BLACK, WHITE, '#e03a3e', WHITE, '#e03a3e', WHITE),
    },
    {
      from: 2003, to: 2012,
      home: k(WHITE, BLACK, '#e03a3e', BLACK, BLACK, '#e03a3e'),
      away: k(BLACK, WHITE, '#e03a3e', WHITE, '#e03a3e', '#8e9090'),
      alt: k('#e03a3e', WHITE, BLACK, WHITE, BLACK),
      note: 'silver trim; red alternate with white "PORTLAND"/"BLAZERS" (city name on the road from 2005-06)',
    },
    {
      from: 2013,
      home: k(WHITE, BLACK, '#e03a3e', BLACK, BLACK, '#e03a3e'),
      away: k(BLACK, WHITE, '#e03a3e', WHITE, '#e03a3e', '#8e9090'),
      alt: k('#e03a3e', BLACK, WHITE, BLACK, BLACK, WHITE),
      note: 'red alternate lettered black trimmed white (the 2017-22 Statement\'s "RIP CITY" white); silver trim to 2025',
    },
  ],

  // Sacramento Kings. Wikipedia "Sacramento Kings" (Logos and uniforms): gold classic-script alternate
  // 2005-07; purple road with the modern black "Kings" script 2008-14 (black alternate with silver numbers
  // 2011-14); 2015 purple Icon and black Statement; from 2023-24 black-lettered white, black Icon, purple
  // Statement.
  SAC: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, '#5a2d81', BLACK, '#5a2d81', '#5a2d81', BLACK),
      away: k(BLACK, WHITE, '#5a2d81', WHITE, '#5a2d81', '#63727a'),
      alt: k('#5a2d81', WHITE, BLACK, WHITE, BLACK),
      note: '1997-2002 set: which of black and purple was the road jersey ?',
    },
    {
      from: 2003, to: 2005,
      home: k(WHITE, '#5a2d81', BLACK, '#5a2d81', '#5a2d81', '#63727a'),
      away: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, '#63727a'),
    },
    {
      from: 2006, to: 2007,
      home: k(WHITE, '#5a2d81', BLACK, '#5a2d81', '#5a2d81', '#63727a'),
      away: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, '#63727a'),
      alt: k('#c4a24c', '#5a2d81', BLACK, '#5a2d81', '#5a2d81', BLACK),
      note: 'gold alternate with the classic purple "Kings" script trimmed black',
    },
    {
      from: 2008, to: 2008,
      home: k(WHITE, '#5a2d81', BLACK, '#5a2d81', '#5a2d81', '#63727a'),
      away: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, '#63727a'),
    },
    {
      from: 2009, to: 2011,
      home: k(WHITE, BLACK, '#5a2d81', BLACK, '#5a2d81', BLACK),
      away: k('#5a2d81', BLACK, WHITE, BLACK, BLACK, '#63727a'),
      note: 'purple road with the modern "Kings" script in black, black numbers trimmed white/silver; home "SACRAMENTO" white trimmed purple and black (drawn black, the back name\'s color)',
    },
    {
      from: 2012, to: 2014,
      home: k(WHITE, BLACK, '#5a2d81', BLACK, '#5a2d81', BLACK),
      away: k('#5a2d81', BLACK, WHITE, BLACK, BLACK, '#63727a'),
      alt: k(BLACK, '#c4ced4', '#5a2d81', '#c4ced4', '#5a2d81'),
      note: 'black alternate: classic "Kings" script, silver numbers trimmed purple',
    },
    {
      from: 2015, to: 2023,
      home: k(WHITE, '#5a2d81', BLACK, BLACK, '#5a2d81', BLACK, { numberFont: 'rounded' }),
      away: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, WHITE, { numberFont: 'rounded' }),
      alt: k(BLACK, '#63727a', '#5a2d81', '#5a2d81', '#5a2d81', undefined, { numberFont: 'rounded' }),
      note: 'home wordmark purple before 2017-18, black (purple trim) after',
    },
    {
      from: 2024,
      home: k(WHITE, BLACK, '#5a2d81', BLACK, '#5a2d81', BLACK),
      away: k(BLACK, WHITE, '#5a2d81', WHITE, '#5a2d81', WHITE),
      alt: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, WHITE),
      note: 'Association black letters trimmed purple, black Icon white letters trimmed purple, purple Statement (black gradient, checkerboard sides) white',
    },
  ],

  // San Antonio Spurs. Wikipedia "San Antonio Spurs": white home, black road, silver-trimmed numbers
  // throughout; silver alternate 2012-13 to 2021-22, black "SATX" Statement 2022-25, silver again from 2025-26.
  SAS: [
    {
      from: 2001, to: 2012,
      home: k(WHITE, BLACK, '#c4ced4', BLACK, BLACK, '#c4ced4'),
      away: k(BLACK, WHITE, '#c4ced4', WHITE, '#c4ced4', WHITE),
      note: 'no alternate before 2012-13',
    },
    {
      from: 2013, to: 2022,
      home: k(WHITE, BLACK, '#c4ced4', BLACK, BLACK, '#c4ced4'),
      away: k(BLACK, WHITE, '#c4ced4', WHITE, '#c4ced4', WHITE),
      alt: k('#c4ced4', BLACK, WHITE, BLACK, BLACK),
      note: 'silver alternate (the Statement from 2017-18), black numbers trimmed white',
    },
    {
      from: 2023, to: 2025,
      home: k(WHITE, BLACK, '#c4ced4', BLACK, BLACK, '#c4ced4'),
      away: k(BLACK, WHITE, '#c4ced4', WHITE, '#c4ced4', WHITE),
      alt: k(BLACK, '#c4ced4', BLACK, '#c4ced4', '#c4ced4'),
      note: 'black "SATX" Statement with silver letters and numbers',
    },
    {
      from: 2026,
      home: k(WHITE, BLACK, '#c4ced4', BLACK, BLACK, '#c4ced4'),
      away: k(BLACK, WHITE, '#c4ced4', WHITE, '#c4ced4', WHITE),
      alt: k('#c4ced4', BLACK, WHITE, BLACK, BLACK),
      note: 'silver Statement with block "SAN ANTONIO" in black',
    },
  ],

  // Toronto Raptors. Wikipedia "Toronto Raptors": purple road 1999-2006 (red alternate 2003-04 to 2005-06);
  // red road from 2006-07, black alternate 2008-09 to 2014-15; 2015 redesign with black and silver trim, Nike
  // sets.
  TOR: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#753bbd', '#ce1141', '#753bbd', '#753bbd', '#ce1141'),
      away: k('#753bbd', WHITE, '#ce1141', WHITE, '#ce1141', BLACK),
      note: 'no alternate before 2003-04; home lettering and the purple shade ?',
    },
    {
      from: 2004, to: 2006,
      home: k(WHITE, '#753bbd', '#ce1141', '#753bbd', '#753bbd', '#ce1141'),
      away: k('#753bbd', WHITE, '#ce1141', WHITE, '#ce1141', BLACK),
      alt: k('#ce1141', WHITE, BLACK, WHITE, BLACK),
      note: 'red alternate',
    },
    {
      from: 2007, to: 2008,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      note: 'red becomes the road; no alternate until 2008-09',
    },
    {
      from: 2009, to: 2015,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      alt: k(BLACK, WHITE, '#ce1141', WHITE, '#ce1141'),
      note: 'black road alternate',
    },
    {
      from: 2016,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', BLACK, '#c4ced4'),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      alt: k(BLACK, WHITE, '#ce1141', WHITE, '#ce1141'),
      note: 'Statement black ?',
    },
  ],

  // Utah Jazz. Wikipedia "Utah Jazz" (Logos and uniforms), all sets as stated there: powder alternate
  // 2006-07 to 2009-10; the 2010-22 navy road (1980s template) with gold numbers trimmed white; green
  // alternate from Dec 2011 to 2016-17, gold Statement 2017-22; black and yellow 2022-25 (the black Statement
  // with purple/sky-blue trim from Jan 2025); purple mountains from 2025-26.
  UTA: [
    {
      from: 2001, to: 2004,
      home: k(WHITE, '#5c2d91', '#00a3ad', '#5c2d91', '#5c2d91', '#00a3ad'),
      away: k('#5c2d91', WHITE, '#00a3ad', WHITE, '#00a3ad', '#b87333'),
      alt: k(BLACK, WHITE, '#b87333', WHITE, '#b87333', '#5c2d91'),
    },
    {
      from: 2005, to: 2006,
      home: k(WHITE, '#002b5c', '#6caedf', '#002b5c', '#002b5c', '#6caedf'),
      away: k('#002b5c', '#6caedf', '#bec0c2', '#6caedf', '#6caedf', '#bec0c2'),
      note: 'navy/powder set; no alternate its first two seasons',
    },
    {
      from: 2007, to: 2010,
      home: k(WHITE, '#002b5c', '#6caedf', '#002b5c', '#002b5c', '#6caedf'),
      away: k('#002b5c', '#6caedf', '#bec0c2', '#6caedf', '#6caedf', '#bec0c2'),
      alt: k('#6caedf', '#002b5c', '#bec0c2', '#002b5c', '#002b5c'),
      note: 'powder blue alternate',
    },
    {
      from: 2011, to: 2011,
      home: k(WHITE, '#00471b', '#002b5c', '#002b5c', '#00471b', '#f9a01b', { numberFont: 'rounded' }),
      away: k('#002b5c', '#f9a01b', WHITE, WHITE, '#00471b', '#f9a01b', { numberFont: 'rounded' }),
      note: '1980s-template set: gold road numbers trimmed white; no alternate until Dec 2011',
    },
    {
      from: 2012, to: 2017,
      home: k(WHITE, '#00471b', '#002b5c', '#002b5c', '#00471b', '#f9a01b', { numberFont: 'rounded' }),
      away: k('#002b5c', '#f9a01b', WHITE, WHITE, '#00471b', '#f9a01b', { numberFont: 'rounded' }),
      alt: k('#00471b', WHITE, '#002b5c', WHITE, '#002b5c', undefined, { numberFont: 'rounded' }),
      note: 'green alternate (2017 "Utah" arched white)',
    },
    {
      from: 2018, to: 2022,
      home: k(WHITE, '#00471b', '#002b5c', '#002b5c', '#00471b', '#f9a01b', { numberFont: 'rounded' }),
      away: k('#002b5c', '#f9a01b', WHITE, WHITE, '#00471b', '#f9a01b', { numberFont: 'rounded' }),
      alt: k('#f9a01b', '#00471b', '#002b5c', '#002b5c', '#002b5c', WHITE, { numberFont: 'rounded' }),
      note: 'gold Statement: navy J-note and name, green numbers trimmed navy/white',
    },
    {
      from: 2023, to: 2024,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      away: k('#fff21f', BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      alt: k(BLACK, '#fff21f', '#fff21f', '#fff21f', '#fff21f', undefined, NOPANEL),
      note: 'black and yellow J-note; the yellow hex ?',
    },
    {
      from: 2025, to: 2025,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      away: k('#fff21f', BLACK, BLACK, BLACK, BLACK, undefined, NOPANEL),
      alt: k(BLACK, WHITE, '#4b2c8d', '#4b2c8d', '#4b2c8d', '#78a3d6', NOPANEL),
      note: 'the black Statement goes to the J-note on a gray Wasatch silhouette with purple and sky-blue trim (Jan 2025)',
    },
    {
      from: 2026,
      home: k(WHITE, '#4b2c8d', '#78a3d6', '#4b2c8d', '#4b2c8d', '#78a3d6'),
      away: k('#4b2c8d', WHITE, BLACK, WHITE, BLACK, '#78a3d6'),
      alt: k(BLACK, WHITE, '#4b2c8d', WHITE, '#4b2c8d', '#78a3d6'),
      note: 'purple-mountains revival (2025-26); purple shade and trims ?',
    },
  ],

  // Washington Wizards. Wikipedia "Washington Wizards", the Washington Times (Oct 2006) and sportslogos.net:
  // blue, bronze (metallic gold from 2007-08), black 1997-2011, the gold alternate (white "WIZARDS", black
  // shoulder stripes) 2006-07 to 2008-09; red, white, navy Bullets-style from 2011-12 (navy alternate/Statement
  // from 2014-15).
  WAS: [
    {
      from: 2001, to: 2006,
      home: k(WHITE, '#003da5', '#9e7e38', '#003da5', '#003da5', BLACK),
      away: k('#003da5', WHITE, '#9e7e38', WHITE, BLACK, '#9e7e38'),
      note: 'bronze trim; no alternate; the blue shade ?',
    },
    {
      from: 2007, to: 2007,
      home: k(WHITE, '#003da5', '#9e7e38', '#003da5', '#003da5', BLACK),
      away: k('#003da5', WHITE, '#9e7e38', WHITE, BLACK, '#9e7e38'),
      alt: k('#c4a24c', WHITE, BLACK, WHITE, BLACK, WHITE),
      note: 'gold alternate: white "WIZARDS" and numbers trimmed black',
    },
    {
      from: 2008, to: 2009,
      home: k(WHITE, '#003da5', '#c4a24c', '#003da5', '#003da5', BLACK),
      away: k('#003da5', WHITE, '#c4a24c', WHITE, BLACK, '#c4a24c'),
      alt: k('#c4a24c', WHITE, BLACK, WHITE, BLACK, WHITE),
      note: 'bronze becomes metallic gold',
    },
    {
      from: 2010, to: 2011,
      home: k(WHITE, '#003da5', '#c4a24c', '#003da5', '#003da5', BLACK),
      away: k('#003da5', WHITE, '#c4a24c', WHITE, BLACK, '#c4a24c'),
      note: 'the gold alternate retired after 2008-09',
    },
    {
      from: 2012, to: 2014,
      home: k(WHITE, '#002b5c', '#e31837', '#e31837', '#002b5c', '#e31837'),
      away: k('#e31837', WHITE, '#002b5c', WHITE, '#002b5c', WHITE),
      note: 'Bullets-style set; no alternate until 2014-15; home wordmark color ?',
    },
    {
      from: 2015,
      home: k(WHITE, '#002b5c', '#e31837', '#e31837', '#002b5c', '#e31837'),
      away: k('#e31837', WHITE, '#002b5c', WHITE, '#002b5c', WHITE),
      alt: k('#002b5c', WHITE, '#e31837', WHITE, '#e31837', WHITE),
      note: 'navy alternate ("The District of Columbia" from 2020, red stars and stripes 2025)',
    },
  ],
  },
  FACES,
);

// The collar's style where a kit didn't say: a V-neck for the eras that ended with the adidas years, round for
// the ones that reach Nike's 2017-18 sets
for (const eras of Object.values(UNIFORM_ERAS)) {
  for (const e of eras) {
    for (const kit of [e.home, e.away, e.alt]) if (kit && !kit.collarStyle) kit.collarStyle = (e.to ?? 9999) <= 2017 ? 'v' : 'round';
  }
}

// (helmets: the NFL's alone)
export const HELMET_ERAS: HelmetTable = {};
