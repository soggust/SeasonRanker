// The NBA's uniforms, 2001 (2000-01) to today: each franchise's major sets, by season (the year a season
// ends in), under every name it played as (BRK: the New Jersey Nets, then Brooklyn; CHO: the Charlotte
// Hornets to 2002, the Bobcats 2005-2014, the Hornets again; NOP: the New Orleans (and NO/Oklahoma City)
// Hornets 2003-2013, then the Pelicans; OKC: the Seattle SuperSonics to 2008; MEM: the Vancouver
// Grizzlies in 2001). Shapes and semantics: libs/ranker/src/engine/uniform-eras.ts.
//
// home: the white jersey (before 2017-18 the home set; from 2017-18 the Association edition), away: the
// colored road jersey (from 2017-18 the Icon edition), alt: the main regularly worn alternate (a classic
// third or the Statement edition). The Lakers are the exception: they wore gold at home through the era
// (white only on "Sunday whites"), so their home is gold. City/Earned/Classic one-offs are left out.
// sleeve 'stripes': trim round the armholes and collar (stripe, then stripe2 inside it); name: the chest
// wordmark's color.
//
// Sources: the Wikipedia team articles' "Logos and uniforms" sections (fetched 2026-10-15), for each
// franchise as cited below; hexes from teamcolorcodes.com and the clubs' brand palettes (ESPN's colors in
// team-colors.ts for the current sets). Details the sources don't state (a trim color, which wordmark sat on
// which jersey) are from memory of the sets and carry a '?' in the era's note.
import type { KitColors, HelmetTable, UniformTable } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee';
const BLACK = '#111111';

// A kit: its body, numbers (fill, outline) and wordmark, with the armhole/collar trim when it has one
function k(body: string, num: string, outline: string, name: string, stripe?: string, stripe2?: string): KitColors {
  const kit: KitColors = { body, num, outline, name, collar: stripe ?? outline, sleeve: stripe ? 'stripes' : 'none' };
  if (stripe) kit.stripe = stripe;
  if (stripe2) kit.stripe2 = stripe2;
  return kit;
}

export const UNIFORM_ERAS: UniformTable = {
  // Atlanta Hawks. Wikipedia "Atlanta Hawks" (Logos and uniforms): red/black/yellow to 2007; navy primary
  // with red trim 2007-08 to 2014-15; Torch Red / Volt Green / Granite Gray from 2015-16 (white home, gray
  // road, red alternate); red/black/yellow (1978-82 look) from 2020-21.
  ATL: [
    {
      from: 2001, to: 2007,
      home: k(WHITE, '#c8102e', BLACK, '#c8102e', '#c8102e', BLACK),
      away: k('#c8102e', WHITE, BLACK, WHITE, BLACK, '#fdb927'),
      note: 'Hawk-on-ball set (1995-2007): trim and outline colors ?',
    },
    {
      from: 2008, to: 2015,
      home: k(WHITE, '#002b5c', '#c8102e', '#002b5c', '#002b5c', '#c8102e'),
      away: k('#002b5c', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      alt: k('#c8102e', WHITE, '#002b5c', WHITE, '#002b5c', WHITE),
      note: 'navy set; red alternate ?',
    },
    {
      from: 2016, to: 2017,
      home: k(WHITE, '#e03a3e', '#c1d32f', '#e03a3e', '#e03a3e', '#c1d32f'),
      away: k('#6e7378', WHITE, '#e03a3e', WHITE, '#e03a3e', '#c1d32f'),
      alt: k('#e03a3e', WHITE, '#c1d32f', WHITE, '#c1d32f'),
      note: 'Volt set: Wikipedia gives a Granite Gray road and a red alternate; the gray shade and trims ?',
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

  // Boston Celtics. Wikipedia "Boston Celtics"; the set has stayed essentially the same. Green-with-black
  // alternate in the 2000s-2010s, a black Statement from 2017-18.
  BOS: [
    {
      from: 2001, to: 2017,
      home: k(WHITE, '#007a33', '#007a33', '#007a33', '#007a33'),
      away: k('#007a33', WHITE, WHITE, WHITE, WHITE),
      alt: k('#007a33', WHITE, BLACK, WHITE, BLACK, WHITE),
      note: 'number outlines (none, or black?) ?; the green-and-black alternate ran roughly 2006-2014 ?',
    },
    {
      from: 2018,
      home: k(WHITE, '#007a33', '#007a33', '#007a33', '#007a33'),
      away: k('#007a33', WHITE, WHITE, WHITE, WHITE),
      alt: k(BLACK, WHITE, '#007a33', WHITE, '#007a33'),
      note: 'Nike: black Statement; its lettering colors ?',
    },
  ],

  // New Jersey Nets, Brooklyn Nets. Wikipedia "Brooklyn Nets": 1997-2012 white (navy team name, silver/red
  // trim), navy (silver city name, navy/red trim), red alternate from 2009 (white team name, navy/silver trim);
  // Brooklyn black and white from 2012-13, dark-gray Statement 2017-19, black Statement from 2022.
  BRK: [
    {
      from: 2001, to: 2012,
      home: k(WHITE, '#002a60', '#cd1041', '#002a60', '#002a60', '#8d9093'),
      away: k('#002a60', '#8d9093', '#cd1041', '#8d9093', '#8d9093', '#cd1041'),
      alt: k('#cd1041', WHITE, '#002a60', WHITE, '#002a60', '#8d9093'),
    },
    {
      from: 2013,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK),
      away: k(BLACK, WHITE, WHITE, WHITE, WHITE),
      alt: k('#4a4f54', WHITE, BLACK, WHITE, BLACK),
      note: 'alt is the dark-gray Statement (2017-19; gray alternates before, black from 2022) ?',
    },
  ],

  // Chicago Bulls. Wikipedia "Chicago Bulls"; unchanged since the 1970s apart from details. Black alternate.
  CHI: [
    {
      from: 2001,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141', WHITE),
    },
  ],

  // Charlotte Hornets, Charlotte Bobcats. Wikipedia "Charlotte Hornets" (Uniforms): pinstriped teal/purple
  // to 2002 ("Charlotte" on both); Bobcats orange 2004-09, blue arched 2009-12, navy "Cats" 2012-14;
  // Hornets white/purple + teal alternate 2014-17, white/teal + purple Statement from 2017-18.
  CHO: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160'),
      away: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE),
      note: 'pinstripes; number outline colors ?',
    },
    {
      from: 2005, to: 2009,
      home: k(WHITE, '#f26532', '#2e5a8b', '#f26532', '#f26532', '#2e5a8b'),
      away: k('#f26532', WHITE, '#2e5a8b', WHITE, '#2e5a8b', BLACK),
      alt: k('#2e5a8b', WHITE, BLACK, WHITE, BLACK, '#f26532'),
      note: 'Bobcats orange set (blue alternate from 2006-07)',
    },
    {
      from: 2010, to: 2012,
      home: k(WHITE, '#2e5a8b', '#f26532', '#2e5a8b', '#2e5a8b', '#f26532'),
      away: k('#2e5a8b', WHITE, '#f26532', WHITE, '#f26532', '#8d9093'),
      alt: k('#f26532', WHITE, '#2e5a8b', WHITE, '#2e5a8b'),
      note: 'Bobcats blue arched set; an orange alternate ?',
    },
    {
      from: 2013, to: 2014,
      home: k(WHITE, '#4b9cd3', '#0c2340', '#0c2340', '#0c2340', '#4b9cd3'),
      away: k('#0c2340', WHITE, '#4b9cd3', WHITE, '#4b9cd3'),
      note: 'Bobcats navy/Carolina blue set ("Cats" home)',
    },
    {
      from: 2015, to: 2017,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160'),
      away: k('#1d1160', WHITE, '#00788c', WHITE, '#00788c', WHITE),
      alt: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE),
      note: 'wordmark/number colors ?',
    },
    {
      from: 2018,
      home: k(WHITE, '#00788c', '#1d1160', '#00788c', '#00788c', '#1d1160'),
      away: k('#00788c', WHITE, '#1d1160', WHITE, '#1d1160', WHITE),
      alt: k('#1d1160', WHITE, '#00788c', WHITE, '#00788c'),
      note: 'Nike: teal Icon, purple Statement; trims ?',
    },
  ],

  // Cleveland Cavaliers. Wikipedia "Cleveland Cavaliers" (Uniforms): blue/orange/black 1999-2003; wine,
  // gold, navy 2003-10 (navy alternate); wine and gold 2010-17 (gold alternate); Nike 2017-22 (black
  // pinstriped Statement); wine, gold, black from 2022-23.
  CLE: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#00539b', BLACK, '#00539b', '#00539b', '#f57d31'),
      away: k('#00539b', WHITE, BLACK, WHITE, '#f57d31', BLACK),
      note: 'home: nickname in blue with black lines; road: city name in white with blue lines; the exact blue and orange ?',
    },
    {
      from: 2004, to: 2010,
      home: k(WHITE, '#041e42', '#fdbb30', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', WHITE, '#fdbb30', WHITE, '#fdbb30', '#041e42'),
      alt: k('#041e42', WHITE, '#fdbb30', WHITE, '#860038', '#fdbb30'),
    },
    {
      from: 2011, to: 2017,
      home: k(WHITE, '#860038', '#860038', '#860038', '#860038', '#fdbb30'),
      away: k('#860038', '#fdbb30', '#fdbb30', '#fdbb30', '#fdbb30', WHITE),
      alt: k('#fdbb30', '#860038', '#860038', '#860038', '#860038'),
    },
    {
      from: 2018, to: 2022,
      home: k(WHITE, '#6f263d', '#ffb81c', '#6f263d', '#6f263d', '#ffb81c'),
      away: k('#6f263d', '#041e42', '#ffb81c', WHITE, '#ffb81c', '#041e42'),
      alt: k(BLACK, '#ffb81c', '#6f263d', '#6f263d', '#ffb81c'),
      note: 'Icon wordmark color (white?) and trims ?',
    },
    {
      from: 2023,
      home: k(WHITE, '#6f263d', '#ffb81c', '#6f263d', '#6f263d', '#ffb81c'),
      away: k('#6f263d', '#ffb81c', '#ffb81c', '#ffb81c', '#ffb81c'),
      alt: k(BLACK, '#ffb81c', '#ffb81c', '#6f263d', '#ffb81c'),
    },
  ],

  // Dallas Mavericks. Wikipedia "Dallas Mavericks": blue/green "a" set to 2001; midnight blue, royal and
  // silver 2001-10 (green alternate 2004-09); royal road from 2010-11, navy alternate; Nike Icon royal,
  // Statement navy.
  DAL: [
    {
      from: 2001, to: 2001,
      home: k(WHITE, '#0053bc', '#00843d', '#0053bc', '#0053bc', '#00843d'),
      away: k('#0053bc', WHITE, '#00843d', WHITE, '#00843d', WHITE),
    },
    {
      from: 2002, to: 2010,
      home: k(WHITE, '#0053bc', '#b8c4ca', '#002b5e', '#002b5e', '#b8c4ca'),
      away: k('#002b5e', WHITE, '#b8c4ca', WHITE, '#b8c4ca', '#0053bc'),
      alt: k('#00843d', '#b8c4ca', WHITE, WHITE, '#0053bc'),
      note: 'alt is the green "Mavs" (2004-05 to 2008-09); the green shade ?',
    },
    {
      from: 2011,
      home: k(WHITE, '#0053bc', '#b8c4ca', '#002b5e', '#002b5e', '#0053bc'),
      away: k('#0053bc', '#b8c4ca', WHITE, '#002b5e', '#002b5e', WHITE),
      alt: k('#002b5e', WHITE, '#0053bc', WHITE, '#0053bc', '#b8c4ca'),
      note: 'home wordmark/number colors ?',
    },
  ],

  // Denver Nuggets. Wikipedia "Denver Nuggets" (Colors, logos and uniforms): navy, metallic gold and maroon
  // 1993-2003; powder blue, gold, royal (navy from 2008-09) 2003-17; Nike 2017-18 with navy primary;
  // midnight blue, sunshine yellow, Flatirons red, skyline blue from 2018-19.
  DEN: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#00285e', '#bd9b60', '#00285e', '#00285e', '#8b2131'),
      away: k('#00285e', '#bd9b60', '#8b2131', '#bd9b60', '#bd9b60', '#8b2131'),
    },
    {
      from: 2004, to: 2017,
      home: k(WHITE, '#4fa3e0', '#0e2240', '#4fa3e0', '#4fa3e0', '#fdb927'),
      away: k('#4fa3e0', WHITE, '#fdb927', WHITE, '#fdb927', '#0e2240'),
      alt: k('#0e2240', '#fdb927', '#4fa3e0', '#fdb927', '#fdb927', '#4fa3e0'),
      note: 'royal trim became navy in 2008-09; navy alternate 2006-2012, gold "skyline" after; 2015-16 gold script ?',
    },
    {
      from: 2018, to: 2018,
      home: k(WHITE, '#0e2240', '#fdb927', '#0e2240', '#0e2240', '#4fa3e0'),
      away: k('#0e2240', '#fdb927', '#4fa3e0', '#fdb927', '#fdb927', '#4fa3e0'),
      alt: k('#4fa3e0', '#0e2240', '#fdb927', WHITE, '#0e2240'),
      note: 'first Nike season, navy primary; the Statement colors ?',
    },
    {
      from: 2019,
      home: k(WHITE, '#0e2240', '#fec524', '#8b2131', '#0e2240', '#fec524'),
      away: k('#0e2240', WHITE, '#8b2131', '#fec524', '#fec524', '#8b2131'),
      alt: k('#1d428a', '#fec524', '#fec524', WHITE, '#0e2240'),
    },
  ],

  // Detroit Pistons. Wikipedia "Detroit Pistons": teal, black, yellow and red 1996-2001; red, white and blue
  // in a 1981-96 pattern from 2001-02 (modernized logo 2017).
  DET: [
    {
      from: 2001, to: 2001,
      home: k(WHITE, '#006272', BLACK, '#006272', '#006272', '#8b1a3e'),
      away: k('#006272', WHITE, BLACK, WHITE, BLACK, '#8b1a3e'),
      note: 'teal horse set; wordmark/trim colors ?',
    },
    {
      from: 2002,
      home: k(WHITE, '#1d428a', '#c8102e', '#1d428a', '#1d428a', '#c8102e'),
      away: k('#1d428a', WHITE, '#c8102e', WHITE, '#c8102e', WHITE),
      alt: k('#c8102e', WHITE, '#1d428a', WHITE, '#1d428a', WHITE),
      note: 'wordmark colors (blue on white?) and the red alternate/Statement ?',
    },
  ],

  // Golden State Warriors. Wikipedia "Golden State Warriors": "Thunder" era navy, gold, orange 1997-2010
  // (navy lettering on white from 2001-02, orange alternate from 2004-05); royal blue and gold from 2010-11.
  GSW: [
    {
      from: 2001, to: 2010,
      home: k(WHITE, '#041e42', '#ff8000', '#041e42', '#041e42', '#ff8000'),
      away: k('#041e42', '#fdb927', '#ff8000', '#fdb927', '#ff8000', '#fdb927'),
      alt: k('#ff8000', '#041e42', '#fdb927', '#041e42', '#041e42'),
      note: 'road wordmark/number colors ?',
    },
    {
      from: 2011,
      home: k(WHITE, '#1d428a', '#ffc72c', '#1d428a', '#1d428a', '#ffc72c'),
      away: k('#1d428a', '#ffc72c', '#ffc72c', '#ffc72c', '#ffc72c', WHITE),
      alt: k('#ffc72c', '#1d428a', '#1d428a', '#1d428a', '#1d428a'),
      note: 'alt: gold sleeved (2013) / gold "The Bay" Statement (2019-22) ?',
    },
  ],

  // Houston Rockets. Wikipedia "Houston Rockets" (Logos and uniforms): navy, silver, red pinstripes 1995-2003;
  // red and white with black and silver 2003-19; new block-lettered set with a black Statement 2019-20;
  // red and yellow sets announced for 2026-27.
  HOU: [
    {
      from: 2001, to: 2003,
      home: k(WHITE, '#002d62', '#c4ced4', '#002d62', '#002d62', '#ce1141'),
      away: k('#002d62', WHITE, '#ce1141', WHITE, '#ce1141', '#c4ced4'),
      note: 'pinstripes; wordmark colors ?',
    },
    {
      from: 2004, to: 2019,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', '#c4ced4'),
      away: k('#ce1141', WHITE, BLACK, WHITE, '#c4ced4', BLACK),
      alt: k(BLACK, '#ce1141', WHITE, '#ce1141', '#ce1141'),
      note: 'alt black (2016-17 on) ?',
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
  // stripes, team name on white, silver added 2005-17 (gold alternate 2008-09); Nike white/navy/yellow.
  IND: [
    {
      from: 2001, to: 2005,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30'),
      away: k('#002d62', '#fdbb30', WHITE, '#fdbb30', '#fdbb30', WHITE),
      alt: k('#fdbb30', '#002d62', WHITE, '#002d62', '#002d62'),
      note: 'road wordmark/number colors (gold or white?) ?',
    },
    {
      from: 2006, to: 2017,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30'),
      away: k('#002d62', WHITE, '#fdbb30', '#fdbb30', '#fdbb30', '#bec0c2'),
      alt: k('#fdbb30', '#002d62', '#002d62', '#002d62', '#002d62'),
    },
    {
      from: 2018,
      home: k(WHITE, '#002d62', '#fdbb30', '#002d62', '#002d62', '#fdbb30'),
      away: k('#002d62', WHITE, '#fdbb30', '#fdbb30', '#fdbb30'),
      alt: k('#fdbb30', '#002d62', '#002d62', '#002d62', '#002d62'),
    },
  ],

  // LA Clippers. Wikipedia "Los Angeles Clippers": 1987 script set to 2010 (red road, blue alternate);
  // 2010-15 white/red/blue; 2015-17 black-wordmark brand (red road "LAC", black alternate); Nike 2017-24
  // white, blue Icon, black Statement; navy and red script sets from 2024-25.
  LAC: [
    {
      from: 2001, to: 2010,
      home: k(WHITE, '#1d428a', '#c8102e', '#c8102e', '#c8102e', '#1d428a'),
      away: k('#c8102e', WHITE, '#1d428a', WHITE, '#1d428a', WHITE),
      alt: k('#1d428a', WHITE, '#c8102e', '#c8102e', '#c8102e', WHITE),
      note: 'home script color (red or blue?) ?',
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
  // the road, white "Sunday whites" (2002-03 on) and the white Association from 2017-18.
  LAL: [
    {
      from: 2001,
      home: k('#fdb927', '#552583', WHITE, '#552583', '#552583', WHITE),
      away: k('#552583', '#fdb927', WHITE, '#fdb927', '#fdb927', WHITE),
      alt: k(WHITE, '#552583', '#fdb927', '#552583', '#552583', '#fdb927'),
      note: 'home is gold (the Lakers wear it at home); alt is the white, worn from 2002-03',
    },
  ],

  // Vancouver Grizzlies, Memphis Grizzlies. Wikipedia "Vancouver Grizzlies" (black primary and the new
  // white set of 2000-01: black lettering with red and turquoise trim) and "Memphis Grizzlies" (kept to
  // 2004 with "Memphis"; navy, Beale Street blue, gold from 2004-05; Nike sets 2018-19).
  MEM: [
    {
      from: 2001, to: 2004,
      home: k(WHITE, BLACK, '#00b2a9', BLACK, '#00b2a9', '#e43c40'),
      away: k(BLACK, WHITE, '#e43c40', WHITE, '#00b2a9', '#e43c40'),
      note: 'Vancouver in 2001, "Memphis" on the same set 2002-04; trim order ?',
    },
    {
      from: 2005, to: 2018,
      home: k(WHITE, '#12173f', '#5d76a9', '#12173f', '#12173f', '#5d76a9'),
      away: k('#12173f', WHITE, '#5d76a9', WHITE, '#5d76a9', '#f5b112'),
      alt: k('#5d76a9', WHITE, '#12173f', WHITE, '#12173f'),
      note: 'Beale Street blue alternate from 2009',
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
      home: k(WHITE, '#98002e', BLACK, '#98002e', BLACK, '#98002e'),
      away: k(BLACK, WHITE, '#98002e', WHITE, '#98002e', '#f9a01b'),
      alt: k('#98002e', WHITE, BLACK, WHITE, BLACK, '#f9a01b'),
      note: 'lettering and number colors (red or black on white?) ?',
    },
  ],

  // Milwaukee Bucks. Wikipedia "Milwaukee Bucks": purple, green, silver 1993-2006 (silver road lettering
  // from 2001-02); hunter green, red, silver 2006-15 (red alternate 2008-09); green, cream, blue, black with
  // the Cream City rainbow from 2015-16 (black alternate/Statement).
  MIL: [
    {
      from: 2001, to: 2006,
      home: k(WHITE, '#00471b', '#702f8a', '#00471b', '#702f8a', '#a7a8aa'),
      away: k('#702f8a', '#a7a8aa', '#00471b', '#a7a8aa', '#00471b', WHITE),
      note: 'home wordmark (green or purple?) ?',
    },
    {
      from: 2007, to: 2015,
      home: k(WHITE, '#00471b', '#ac1a2f', '#00471b', '#00471b', '#ac1a2f'),
      away: k('#00471b', WHITE, '#ac1a2f', WHITE, '#ac1a2f', WHITE),
      alt: k('#ac1a2f', WHITE, '#a7a8aa', WHITE, WHITE),
    },
    {
      from: 2016,
      home: k(WHITE, '#00471b', '#00471b', '#00471b', '#00471b', '#eee1c6'),
      away: k('#00471b', '#eee1c6', '#eee1c6', '#eee1c6', '#eee1c6'),
      alt: k(BLACK, '#eee1c6', '#00471b', '#eee1c6', '#00471b'),
    },
  ],

  // Minnesota Timberwolves. Wikipedia "Minnesota Timberwolves": blue, black, gray 1996-2008 (black alternate);
  // "Wolves"/"Minnesota" 2008-17; Nike navy/white/neon green Statement 2017-26; white, blue and black-trees
  // sets (1989-96 based) for 2026-27.
  MIN: [
    {
      from: 2001, to: 2008,
      home: k(WHITE, '#0053a0', BLACK, '#0053a0', '#0053a0', BLACK),
      away: k('#0053a0', WHITE, BLACK, WHITE, BLACK, '#00a94f'),
      alt: k(BLACK, WHITE, '#0053a0', WHITE, '#0053a0'),
      note: 'tree-line set; the blue shade and wordmark colors ?',
    },
    {
      from: 2009, to: 2017,
      home: k(WHITE, '#236192', '#0c2340', '#236192', '#236192', '#78be20'),
      away: k('#236192', WHITE, '#0c2340', WHITE, '#0c2340', '#78be20'),
      alt: k(BLACK, WHITE, '#236192', WHITE, '#236192'),
      note: 'green trim dropped from 2010-11; black alternate 2010-13',
    },
    {
      from: 2018, to: 2026,
      home: k(WHITE, '#0c2340', '#236192', '#0c2340', '#0c2340', '#236192'),
      away: k('#0c2340', WHITE, '#236192', WHITE, WHITE),
      alt: k('#78be20', WHITE, '#0c2340', '#0c2340', '#0c2340'),
      note: 'Statement neon green to 2022, dark gray after ?',
    },
    {
      from: 2027,
      home: k(WHITE, '#0053a0', '#00a94f', '#0053a0', '#0053a0', '#00a94f'),
      away: k('#0053a0', WHITE, '#00a94f', WHITE, '#00a94f'),
      alt: k(BLACK, WHITE, '#0053a0', WHITE, '#0053a0', '#00a94f'),
      note: 'announced 2026-27 sets (1989-96 style, black-trees Statement); colors ?',
    },
  ],

  // New Orleans Hornets, New Orleans Pelicans. Wikipedia "New Orleans Pelicans": teal, purple, gold
  // 2002-07 (city name only; gold road from 2006, teal kept as alternate); creole blue with pinstripes
  // 2008-13 (gold alternate); Pelicans navy, red, gold from 2013-14 (red alternate/Statement).
  NOP: [
    {
      from: 2003, to: 2008,
      home: k(WHITE, '#00778b', '#2b1d5c', '#00778b', '#00778b', '#2b1d5c'),
      away: k('#00778b', WHITE, '#2b1d5c', WHITE, '#2b1d5c', '#c1a362'),
      alt: k('#c1a362', '#2b1d5c', WHITE, '#2b1d5c', '#2b1d5c'),
      note: 'gold was the main road jersey 2006-07 (teal the alternate); the NO/OKC "OKC"-patch whites',
    },
    {
      from: 2009, to: 2013,
      home: k(WHITE, '#0093b2', '#2b1d5c', '#0093b2', '#0093b2', '#c1a362'),
      away: k('#0093b2', WHITE, '#c1a362', WHITE, '#c1a362', WHITE),
      alt: k('#c1a362', '#0093b2', WHITE, '#0093b2', '#0093b2'),
      note: 'pinstripes; wordmark colors ?',
    },
    {
      from: 2014,
      home: k(WHITE, '#0a2240', '#b4975a', '#0a2240', '#0a2240', '#c8102e'),
      away: k('#0a2240', WHITE, '#b4975a', WHITE, '#b4975a', '#c8102e'),
      alt: k('#c8102e', WHITE, '#0a2240', WHITE, '#0a2240', '#b4975a'),
      note: 'trims ?',
    },
  ],

  // New York Knicks. Wikipedia "New York Knicks": the 1997 set to 2011-12 (black accents); black dropped
  // from 2012-13, otherwise the same through Nike. Statements vary (white 2017-19, blue 2019-22, navy 2022-25).
  NYK: [
    {
      from: 2001,
      home: k(WHITE, '#006bb6', '#f58426', '#006bb6', '#006bb6', '#f58426'),
      away: k('#006bb6', '#f58426', WHITE, '#f58426', '#f58426', WHITE),
      note: 'black trim to 2012; number/wordmark colors ?',
    },
  ],

  // Seattle SuperSonics, Oklahoma City Thunder. Wikipedia "Seattle SuperSonics" (1995-2001 green, red,
  // orange; 2001-08 white/green/gold "SONICS"/"SEATTLE", gold alternate) and "Oklahoma City Thunder"
  // (2008 set kept almost intact; navy Statement from 2017).
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
      from: 2009,
      home: k(WHITE, '#007ac1', '#002d62', '#007ac1', '#ef3b24', '#fdbb30'),
      away: k('#007ac1', WHITE, '#002d62', WHITE, '#ef3b24', '#fdbb30'),
      alt: k('#002d62', '#ef3b24', WHITE, '#ef3b24', '#007ac1'),
      note: 'alt is the navy (2012 alternate, Statement from 2017); trims ?',
    },
  ],

  // Orlando Magic. Wikipedia "Orlando Magic": sublimated stars 1998-2003; block lettering 2003-08; pinstripes
  // 2008-17 (black alternate from 2010); Nike white/blue/black; modernized pinstripes from 2025-26.
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
      from: 2009, to: 2017,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', '#c4ced4'),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, '#0077c0', '#c4ced4', '#0077c0', '#c4ced4'),
    },
    {
      from: 2018, to: 2025,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', BLACK),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, WHITE, '#0077c0', WHITE, '#0077c0'),
      note: 'Wikipedia has a black Icon / blue Statement 2019-25 ?',
    },
    {
      from: 2026,
      home: k(WHITE, '#0077c0', BLACK, '#0077c0', '#0077c0', '#c4ced4'),
      away: k('#0077c0', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      alt: k(BLACK, WHITE, '#0077c0', WHITE, '#c4ced4'),
    },
  ],

  // Philadelphia 76ers. Wikipedia "Philadelphia 76ers": black, gold, red 1997-2009 (white home black letters,
  // black road white letters, red trim; blue alternate 2000-06, red from 2006); "Sixers" blue/red 2009-15;
  // "PHILA" blue/red from 2015-16 (red alternate/Statement).
  PHI: [
    {
      from: 2001, to: 2009,
      home: k(WHITE, BLACK, '#ed174c', BLACK, BLACK, '#ed174c'),
      away: k(BLACK, WHITE, '#ed174c', WHITE, '#ed174c', '#c4a24c'),
      alt: k('#006bb6', WHITE, '#ed174c', WHITE, '#ed174c'),
      note: 'alt blue to 2006, red after',
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

  // Phoenix Suns. Wikipedia "Phoenix Suns" (Logos and uniforms), all stated there.
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
      home: k(WHITE, BLACK, BLACK, '#e56020', '#e56020', BLACK),
      away: k('#1d1160', '#e56020', '#e56020', WHITE, WHITE, '#e56020'),
      alt: k('#e56020', BLACK, BLACK, WHITE, BLACK),
    },
    {
      from: 2018, to: 2023,
      home: k(WHITE, '#1d1160', '#1d1160', '#e56020', '#1d1160', '#e56020'),
      away: k('#1d1160', '#e56020', '#e56020', '#63727a', '#63727a'),
      alt: k(BLACK, '#e56020', '#e56020', '#63727a', '#63727a'),
      note: 'Statement black to 2019, orange 2019-22, black after',
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
  // 2002-03 silver added and a red alternate (city name on the road from 2005-06).
  POR: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, BLACK, '#e03a3e', BLACK, BLACK, '#e03a3e'),
      away: k(BLACK, WHITE, '#e03a3e', WHITE, '#e03a3e', WHITE),
    },
    {
      from: 2003,
      home: k(WHITE, BLACK, '#e03a3e', BLACK, BLACK, '#e03a3e'),
      away: k(BLACK, WHITE, '#e03a3e', WHITE, '#e03a3e', '#8e9090'),
      alt: k('#e03a3e', WHITE, BLACK, WHITE, BLACK),
      note: 'silver trim to 2025; red alternate lettering black from 2012-13 ?',
    },
  ],

  // Sacramento Kings. Wikipedia "Sacramento Kings" (Logos and uniforms).
  SAC: [
    {
      from: 2001, to: 2002,
      home: k(WHITE, '#5a2d81', BLACK, '#5a2d81', '#5a2d81', BLACK),
      away: k(BLACK, WHITE, '#5a2d81', WHITE, '#5a2d81', '#63727a'),
      alt: k('#5a2d81', WHITE, BLACK, WHITE, BLACK),
      note: '1997-2002 set: which of black and purple was the road jersey ?',
    },
    {
      from: 2003, to: 2008,
      home: k(WHITE, '#5a2d81', BLACK, '#5a2d81', '#5a2d81', '#63727a'),
      away: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, '#63727a'),
    },
    {
      from: 2009, to: 2014,
      home: k(WHITE, BLACK, '#5a2d81', '#5a2d81', '#5a2d81', BLACK),
      away: k(BLACK, '#5a2d81', WHITE, '#5a2d81', '#5a2d81', '#63727a'),
      note: 'road script color ?',
    },
    {
      from: 2015,
      home: k(WHITE, '#5a2d81', BLACK, BLACK, '#5a2d81', BLACK),
      away: k('#5a2d81', WHITE, BLACK, WHITE, BLACK, WHITE),
      alt: k(BLACK, '#63727a', '#5a2d81', '#5a2d81', '#5a2d81'),
      note: 'home wordmark purple before 2017-18, black (purple trim) after',
    },
  ],

  // San Antonio Spurs. Wikipedia "San Antonio Spurs": white home, black road, silver-trimmed numbers
  // throughout; silver alternate from 2012-13 (Statement through 2022, then black).
  SAS: [
    {
      from: 2001,
      home: k(WHITE, BLACK, '#c4ced4', BLACK, BLACK, '#c4ced4'),
      away: k(BLACK, WHITE, '#c4ced4', WHITE, '#c4ced4', WHITE),
      alt: k('#c4ced4', BLACK, WHITE, BLACK, BLACK),
      note: 'alt is the silver, from 2013',
    },
  ],

  // Toronto Raptors. Wikipedia "Toronto Raptors": purple road 1999-2006 (red alternate 2003-05); red road from
  // 2006-07, black alternate 2008-15; 2015 redesign with black and silver trim, Nike sets.
  TOR: [
    {
      from: 2001, to: 2006,
      home: k(WHITE, '#753bbd', '#ce1141', '#753bbd', '#753bbd', '#ce1141'),
      away: k('#753bbd', WHITE, '#ce1141', WHITE, '#ce1141', BLACK),
      alt: k('#ce1141', WHITE, BLACK, WHITE, BLACK),
      note: 'home lettering and the purple shade ?',
    },
    {
      from: 2007, to: 2015,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', '#ce1141', BLACK),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      alt: k(BLACK, WHITE, '#ce1141', WHITE, '#ce1141'),
    },
    {
      from: 2016,
      home: k(WHITE, '#ce1141', BLACK, '#ce1141', BLACK, '#c4ced4'),
      away: k('#ce1141', WHITE, BLACK, WHITE, BLACK, '#c4ced4'),
      alt: k(BLACK, WHITE, '#ce1141', WHITE, '#ce1141'),
      note: 'Statement black ?',
    },
  ],

  // Utah Jazz. Wikipedia "Utah Jazz" (Logos and uniforms), all sets as stated there.
  UTA: [
    {
      from: 2001, to: 2004,
      home: k(WHITE, '#5c2d91', '#00a3ad', '#5c2d91', '#5c2d91', '#00a3ad'),
      away: k('#5c2d91', WHITE, '#00a3ad', WHITE, '#00a3ad', '#b87333'),
      alt: k(BLACK, WHITE, '#b87333', WHITE, '#b87333', '#5c2d91'),
    },
    {
      from: 2005, to: 2010,
      home: k(WHITE, '#002b5c', '#6caedf', '#002b5c', '#002b5c', '#6caedf'),
      away: k('#002b5c', '#6caedf', '#bec0c2', '#6caedf', '#6caedf', '#bec0c2'),
      alt: k('#6caedf', '#002b5c', '#bec0c2', '#002b5c', '#002b5c'),
      note: 'powder alternate 2006-07 to 2009-10',
    },
    {
      from: 2011, to: 2022,
      home: k(WHITE, '#00471b', '#002b5c', '#002b5c', '#00471b', '#f9a01b'),
      away: k('#002b5c', WHITE, '#f9a01b', WHITE, '#00471b', '#f9a01b'),
      alt: k('#00471b', WHITE, '#002b5c', WHITE, '#002b5c'),
      note: 'green alternate to 2017, gold Statement 2017-22; road number colors ?',
    },
    {
      from: 2023, to: 2025,
      home: k(WHITE, BLACK, BLACK, BLACK, BLACK),
      away: k('#fff21f', BLACK, BLACK, BLACK, BLACK),
      alt: k(BLACK, '#fff21f', '#fff21f', '#fff21f', '#fff21f'),
      note: 'black and yellow J-note; the yellow hex ?',
    },
    {
      from: 2026,
      home: k(WHITE, '#4b2c8d', '#78a3d6', '#4b2c8d', '#4b2c8d', '#78a3d6'),
      away: k('#4b2c8d', WHITE, BLACK, WHITE, BLACK, '#78a3d6'),
      alt: k(BLACK, WHITE, '#4b2c8d', WHITE, '#4b2c8d', '#78a3d6'),
      note: 'purple-mountains revival (2025-26); purple shade and trims ?',
    },
  ],

  // Washington Wizards. Wikipedia "Washington Wizards": blue, bronze (later gold), black 1997-2011
  // (gold-and-black alternate 2006-07); red, white, navy Bullets-style from 2011-12 (navy alternate/Statement).
  WAS: [
    {
      from: 2001, to: 2011,
      home: k(WHITE, '#003da5', '#9e7e38', '#003da5', '#003da5', BLACK),
      away: k('#003da5', WHITE, '#9e7e38', WHITE, BLACK, '#9e7e38'),
      alt: k(BLACK, '#9e7e38', WHITE, '#9e7e38', '#9e7e38'),
      note: 'bronze became gold c. 2007; the blue shade ?',
    },
    {
      from: 2012,
      home: k(WHITE, '#002b5c', '#e31837', '#e31837', '#002b5c', '#e31837'),
      away: k('#e31837', WHITE, '#002b5c', WHITE, '#002b5c', WHITE),
      alt: k('#002b5c', WHITE, '#e31837', WHITE, '#e31837', WHITE),
      note: 'home wordmark color ?',
    },
  ],
};

// (helmets: the NFL's alone)
export const HELMET_ERAS: HelmetTable = {};
