// MLB uniform eras, 2000 to today: what each club wore at home (whites, or cream where worn), on the road (grays,
// or the road jersey's actual color) and its main regularly worn colored alternate, one era per major redesign.
// Types and semantics: libs/ranker/src/engine/uniform-eras.ts. Keys are MLB team ids (team-colors.ts TEAMS).
//
// The baseball cut is drawn from the FRONT: the wordmark across the chest (name), the front number (num; where a
// club's front number differs from its back numbers, the Dodgers' red, the front's color is used), the button
// placket and its piping, the sleeve ends' trim, pinstripes, and a sleeveless vest over an undershirt where a club
// wore one. Per kit: name = the chest script/wordmark color, num = the numbers' fill, outline = their trim, piping =
// the collar/placket piping (none when left out), stripe (+ stripe2) = the sleeve ends' piping, pinstripe = the
// pinstripes' color, placket 'buttons' (every regular MLB jersey since 2000) or 'vest' (under = the undershirt).
// numberFont/ for the serifed blocks (Yankees road, Giants, Twins to 2009), 'varsity' for the
// drop-shadowed heavy blocks (Mets to 2011, Royals 2002-21, Rangers 2001-13, Reds), 'rounded' for scripts and the
// modern rounded faces (Rays, Marlins 2012-18). Names on back are not drawn (the front is), so the clubs without
// them (Yankees, Red Sox and Tigers at home, Giants at home to 2020) need no flag. Throwbacks, City Connect and
// one-off holiday sets are left out.
//
// Sources: Wikipedia team articles' "Uniforms" / "Logos and uniforms" sections (incl. "Logos and uniforms of the
// New York Yankees" and "... Boston Red Sox"), sportslogos.net uniform pages, teamcolorcodes.com for hexes; the
// 2026-10 audit's reference notes (scratchpad splash-round2/audit-mlb/refs); the rest from memory of the sets,
// flagged with a `?` in `note` where the colors or the years weren't confirmed.

import { HelmetTable, KitColors, UniformTable, type FaceTable, withFaces } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee'; // home whites
const GRAY = '#b9bcbf'; // road grays
const CREAM = '#ece4d0'; // cream homes / alternates

type Detail = Partial<Pick<KitColors, 'piping' | 'stripe' | 'stripe2' | 'pinstripe' | 'placket' | 'under' | 'numberFont' | 'names'>>;

// A kit: its body, the chest wordmark, the numbers (fill, trim), then its details. The collar is the piping's color
// when the jersey is piped (the collar and placket are piped together), else the body's; sleeve 'stripes' when the
// sleeve ends carry piping (stripe); a button placket unless the kit says 'vest'.
function kit(body: string, name: string, num: string, outline: string, d: Detail = {}): KitColors {
  const k: KitColors = { body, num, outline, name, collar: d.piping ?? body, sleeve: d.stripe ? 'stripes' : 'none', placket: 'buttons' };
  return Object.assign(k, d);
}

// The lettering (libs/ranker/src/engine/uniform-eras.ts withFaces): the Tuscan serif of the Cardinals, Cubs,
// Dodgers, Phillies, Giants and Nationals, the Astros' own face from 2013, the plain block of the Yankees,
// Orioles, Pirates, Rangers and Tigers; every other club the varsity block (the name in the number's face).
const FACES: FaceTable = {
  '138': 'tuscan', // Cardinals
  '112': 'tuscan', // Cubs
  '119': 'tuscan', // Dodgers
  '143': 'tuscan', // Phillies
  '137': 'tuscan', // Giants
  '120': 'tuscan', // Nationals
  '117': [[2013, 'astros']], // Astros
  '147': 'block', // Yankees
  '110': 'block', // Orioles
  '134': 'block', // Pirates
  '140': 'block', // Rangers
  '116': 'block', // Tigers
};

export const UNIFORM_ERAS: UniformTable = withFaces(
  {
  // Angels -- Wikipedia (Los Angeles Angels: uniforms); teamcolorcodes. No red before 2002.
  '108': [
    {
      from: 2000, to: 2001,
      home: kit(WHITE, '#003263', '#003263', '#6f8fcf', { pinstripe: '#003263' }),
      away: kit(GRAY, '#003263', '#003263', '#6f8fcf', { }),
      alt: kit('#003263', '#ffffff', '#ffffff', '#6f8fcf', { piping: '#6f8fcf' }),
      note: 'Disney set: navy script and numbers with periwinkle trim on a navy-pinstriped faux vest, "Anaheim" road; navy alt periwinkle/white',
    },
    {
      from: 2002, to: 2006,
      home: kit(WHITE, '#ba0021', '#ba0021', '#003263', { numberFont: 'tuscan' }),
      away: kit(GRAY, '#ba0021', '#ba0021', '#003263', { numberFont: 'tuscan' }),
      note: 'red "Big A" set; road read "Anaheim" to 2004, "Angels" from 2005; no regular colored alt (a white vest alt 2005-06)',
    },
    {
      from: 2007,
      home: kit(WHITE, '#ba0021', '#ba0021', '#003263', { numberFont: 'tuscan' }),
      away: kit(GRAY, '#ba0021', '#ba0021', '#003263', { numberFont: 'tuscan' }),
      alt: kit('#ba0021', '#ffffff', '#ffffff', '#003263', { numberFont: 'tuscan' }),
      note: 'red alternate added; its lettering colors ?',
    },
  ],
  // Diamondbacks -- Wikipedia (Arizona Diamondbacks: uniforms); teamcolorcodes
  '109': [
    {
      from: 2000, to: 2000,
      home: kit(CREAM, '#5f259f', '#5f259f', '#ffffff', { pinstripe: '#5f259f' }),
      away: kit(GRAY, '#5f259f', '#00a3ad', '#5f259f', { pinstripe: '#5f259f' }),
      alt: kit('#5f259f', '#b87333', '#ffffff', '#b87333'),
      note: 'purple/teal/copper: cream home with purple pinstripes (purple numbers, white and teal trim), pinstriped road with teal numbers; purple alt (teal lettering in 2000, copper after)',
    },
    {
      from: 2001, to: 2002,
      home: kit(CREAM, '#5f259f', '#5f259f', '#ffffff', { pinstripe: '#5f259f', placket: 'vest', under: '#5f259f' }),
      away: kit(GRAY, '#5f259f', '#00a3ad', '#5f259f', { pinstripe: '#5f259f', placket: 'vest', under: '#5f259f' }),
      alt: kit('#5f259f', '#b87333', '#ffffff', '#b87333'),
      note: 'sleeveless vests over purple undershirts from 2001; copper "Arizona" on the purple alt',
    },
    {
      from: 2003, to: 2006,
      home: kit(CREAM, '#5f259f', '#5f259f', '#ffffff', { pinstripe: '#5f259f', placket: 'vest', under: '#5f259f' }),
      away: kit(GRAY, '#5f259f', '#00a3ad', '#5f259f', { pinstripe: '#5f259f', placket: 'vest', under: '#5f259f' }),
      alt: kit('#000000', '#5f259f', '#00a3ad', '#ffffff'),
      note: 'black alt replaces the purple: "Arizona" purple, teal numbers with white and purple trim',
    },
    {
      from: 2007, to: 2015,
      home: kit(WHITE, '#a71930', '#000000', '#a71930'),
      away: kit(GRAY, '#a71930', '#000000', '#a71930'),
      alt: kit('#a71930', '#e3d4ad', '#000000', '#e3d4ad'),
      note: 'Sedona red / Sonoran sand / black',
    },
    {
      from: 2016, to: 2023,
      home: kit(WHITE, '#a71930', '#a71930', '#000000', { numberFont: 'rounded' }),
      away: kit(GRAY, '#a71930', '#a71930', '#000000', { numberFont: 'rounded' }),
      alt: kit('#000000', '#a71930', '#a71930', '#30ced8', { numberFont: 'rounded' }),
      note: 'teal returns (snakeskin shoulders 2016-19): black alt "Arizona" red with teal trim; home white went teal-trimmed in 2023',
    },
    {
      from: 2024,
      home: kit(CREAM, '#a71930', '#a71930', '#000000', { piping: '#000000' }),
      away: kit(GRAY, '#a71930', '#a71930', '#30ced8', { piping: '#000000' }),
      alt: kit('#000000', '#a71930', '#a71930', '#30ced8', { piping: '#30ced8' }),
      note: 'cream home with black piping, red/teal/black; whether the piping runs round the sleeves ?',
    },
  ],
  // Orioles -- Wikipedia (Baltimore Orioles: uniforms); teamcolorcodes
  '110': [
    {
      from: 2000, to: 2008,
      home: kit(WHITE, '#000000', '#000000', '#df4601', { }),
      away: kit(GRAY, '#000000', '#000000', '#df4601', { }),
      alt: kit('#000000', '#df4601', '#df4601', '#ffffff', { stripe: '#df4601' }),
      note: 'road read "Orioles" through 2008; black alternate with orange sleeve piping',
    },
    {
      from: 2009, to: 2011,
      home: kit(WHITE, '#000000', '#000000', '#df4601', { }),
      away: kit(GRAY, '#000000', '#000000', '#df4601', { }),
      alt: kit('#000000', '#df4601', '#df4601', '#ffffff', { stripe: '#df4601' }),
      note: '"Baltimore" returns on the road; road letter colors ?',
    },
    {
      from: 2012,
      home: kit(WHITE, '#000000', '#000000', '#df4601', { }),
      away: kit(GRAY, '#000000', '#000000', '#df4601', { }),
      alt: kit('#df4601', '#000000', '#000000', '#ffffff', { }),
      note: 'cartoon bird returns; orange Saturday alternate (the black Friday alt, orange script and sleeve piping, is worn more)',
    },
  ],
  // Red Sox -- Wikipedia (Logos and uniforms of the Boston Red Sox); teamcolorcodes. Red neck/placket piping at
  // home, no piping on the road gray; no names on back at home.
  '111': [
    {
      from: 2000, to: 2002,
      home: kit(WHITE, '#bd3039', '#bd3039', '#0c2340', { names: false, piping: '#bd3039', numberFont: 'tuscan' }),
      away: kit(GRAY, '#bd3039', '#bd3039', '#0c2340', { numberFont: 'tuscan' }),
    },
    {
      from: 2003, to: 2008,
      home: kit(WHITE, '#bd3039', '#bd3039', '#0c2340', { names: false, piping: '#bd3039', numberFont: 'tuscan' }),
      away: kit(GRAY, '#bd3039', '#bd3039', '#0c2340', { numberFont: 'tuscan' }),
      alt: kit('#bd3039', '#0c2340', '#0c2340', '#ffffff', { piping: '#0c2340', numberFont: 'tuscan' }),
      note: 'red home alternate (blue piping) added',
    },
    {
      from: 2009, to: 2013,
      home: kit(WHITE, '#bd3039', '#bd3039', '#0c2340', { names: false, piping: '#bd3039', numberFont: 'tuscan' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#bd3039', { numberFont: 'tuscan' }),
      alt: kit('#bd3039', '#0c2340', '#0c2340', '#ffffff', { numberFont: 'tuscan' }),
      note: 'road lettering navy; red alt loses piping; a navy road alt (BOSTON red outlined white) also ran 2009-2024',
    },
    {
      from: 2014,
      home: kit(WHITE, '#bd3039', '#bd3039', '#0c2340', { names: false, piping: '#bd3039', numberFont: 'tuscan' }),
      away: kit(GRAY, '#bd3039', '#bd3039', '#0c2340', { numberFont: 'tuscan' }),
      alt: kit('#bd3039', '#0c2340', '#0c2340', '#ffffff', { numberFont: 'tuscan' }),
      note: 'road lettering back to red',
    },
  ],
  // Cubs -- Wikipedia (Chicago Cubs: uniforms); teamcolorcodes
  '112': [
    {
      from: 2000,
      home: kit(WHITE, '#cc3433', '#0e3386', '#cc3433', { pinstripe: '#0e3386' }),
      away: kit(GRAY, '#0e3386', '#cc3433', '#ffffff', { }),
      alt: kit('#0e3386', '#cc3433', '#cc3433', '#ffffff'),
      note: 'navy-pinstriped home with the bullseye (red CUBS), blue numbers trimmed red; road "Chicago" blue, red numbers trimmed white; blue alt red lettering trimmed white',
    },
  ],
  // Reds -- Wikipedia (Cincinnati Reds: logos and uniforms); sportslogos.net 1999/2007 sets; teamcolorcodes
  '113': [
    {
      from: 2000, to: 2006,
      home: kit(WHITE, '#c6011f', '#c6011f', '#000000', { pinstripe: '#c6011f', placket: 'vest', under: '#c6011f', numberFont: 'varsity' }),
      away: kit(GRAY, '#c6011f', '#c6011f', '#000000', { placket: 'vest', under: '#c6011f', numberFont: 'varsity' }),
      alt: kit('#000000', '#c6011f', '#c6011f', '#ffffff', { numberFont: 'varsity' }),
      note: 'sleeveless vests over red (later black) undershirts, red pinstripes at home, black drop shadows; black alternate ?',
    },
    {
      from: 2007,
      home: kit(WHITE, '#c6011f', '#c6011f', '#000000', { piping: '#c6011f', numberFont: 'varsity' }),
      away: kit(GRAY, '#c6011f', '#c6011f', '#000000', { stripe: '#c6011f', stripe2: '#ffffff', numberFont: 'varsity' }),
      alt: kit('#c6011f', '#ffffff', '#ffffff', '#000000', { piping: '#ffffff', stripe: '#ffffff', numberFont: 'varsity' }),
      note: 'sleeved, early-1900s lettering: red placket piping at home, red-and-white sleeve trim on the road, white piping on the red alt',
    },
  ],
  // Indians / Guardians -- Wikipedia (Cleveland Guardians: uniforms); sportslogos.net 2002-2012 sets; teamcolorcodes
  '114': [
    {
      from: 2000, to: 2001,
      home: kit(WHITE, '#0c2340', '#0c2340', '#e31937', { piping: '#0c2340', stripe: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#e31937', { piping: '#0c2340', stripe: '#0c2340' }),
      alt: kit('#0c2340', '#e31937', '#e31937', '#ffffff', { piping: '#e31937', stripe: '#e31937' }),
      note: 'Indians navy/red, navy piping; home script color before 2002 ?',
    },
    {
      from: 2002, to: 2021,
      home: kit(WHITE, '#e31937', '#0c2340', '#e31937', { piping: '#0c2340', stripe: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#e31937', { piping: '#0c2340', stripe: '#0c2340' }),
      alt: kit('#0c2340', '#e31937', '#e31937', '#ffffff', { piping: '#e31937', stripe: '#e31937' }),
      note: 'red "Indians" script with navy trim at home, navy piping throughout (2008 and 2012 tweaks to the outlines); sleeve piping navy ?',
    },
    {
      from: 2022,
      home: kit(WHITE, '#e31937', '#0c2340', '#e31937', { piping: '#0c2340', stripe: '#e31937', stripe2: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#e31937', { piping: '#0c2340', stripe: '#e31937', stripe2: '#0c2340' }),
      alt: kit('#e31937', '#0c2340', '#0c2340', '#ffffff', { piping: '#0c2340', stripe: '#ffffff', stripe2: '#0c2340' }),
      note: 'Guardians: red script (navy outline) at home, "Cleveland" navy on the road; red home alt',
    },
  ],
  // Rockies -- Wikipedia (Colorado Rockies: uniforms); teamcolorcodes. Black letters and numerals trimmed silver.
  '115': [
    {
      from: 2000, to: 2011,
      home: kit(WHITE, '#000000', '#000000', '#c4ced4', { pinstripe: '#33006f', placket: 'vest', under: '#000000' }),
      away: kit(GRAY, '#33006f', '#33006f', '#ffffff', { pinstripe: '#33006f' }),
      alt: kit('#33006f', '#000000', '#000000', '#ffffff'),
      note: 'purple-pinstriped home vest over a black undershirt (sleeved years ?), purple-pinstriped road; purple alt (a black vest alt 2005-21 too)',
    },
    {
      from: 2012,
      home: kit(WHITE, '#000000', '#000000', '#c4ced4', { pinstripe: '#33006f' }),
      away: kit(GRAY, '#33006f', '#33006f', '#ffffff', { piping: '#33006f' }),
      alt: kit('#33006f', '#000000', '#000000', '#ffffff'),
      note: 'sleeves back; road loses its pinstripes for purple piping',
    },
  ],
  // Tigers -- Wikipedia (Detroit Tigers: uniforms and logos); sportslogos.net road; teamcolorcodes. No names on
  // back at home.
  '116': [
    {
      from: 2000, to: 2025,
      home: kit(WHITE, '#0c2340', '#0c2340', '#0c2340', { names: false, piping: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#fa4616', { piping: '#0c2340' }),
      note: 'Old English D at home, navy "Detroit" (orange/white trim) on the road; both navy piping',
    },
    {
      from: 2026,
      home: kit(WHITE, '#0c2340', '#0c2340', '#0c2340', { names: false, piping: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#fa4616', { piping: '#0c2340' }),
      alt: kit('#fa4616', '#0c2340', '#0c2340', '#ffffff', { piping: '#0c2340' }),
      note: 'orange Friday home alternate added (navy road alt too); alt piping ?',
    },
  ],
  // Astros -- Wikipedia (Houston Astros: uniforms); teamcolorcodes
  '117': [
    {
      from: 2000, to: 2012,
      home: kit(WHITE, '#000000', '#9a3324', '#000000', { pinstripe: '#000000', numberFont: 'tuscan' }),
      away: kit(GRAY, '#9a3324', '#000000', '#9a3324', { numberFont: 'tuscan' }),
      alt: kit('#9a3324', '#d4c19c', '#d4c19c', '#000000', { numberFont: 'tuscan' }),
      note: 'brick/black/sand, black pinstripes at home; black alt to ~2001 then brick red; number trims ?',
    },
    {
      from: 2013,
      home: kit(WHITE, '#002d62', '#002d62', '#eb6e1f', { piping: '#002d62' }),
      away: kit(GRAY, '#002d62', '#002d62', '#eb6e1f', { piping: '#002d62' }),
      alt: kit('#002d62', '#eb6e1f', '#eb6e1f', '#ffffff'),
      note: 'navy/orange with navy front piping; the navy alt (orange rainbow side stripes, "Astros" orange from 2016) is the one worn most; an orange alt (navy lettering) too',
    },
  ],
  // Royals -- Wikipedia (Kansas City Royals: uniforms); teamcolorcodes
  '118': [
    {
      from: 2000, to: 2001,
      home: kit(WHITE, '#004687', '#004687', '#004687', { piping: '#004687' }),
      away: kit(GRAY, '#004687', '#004687', '#ffffff', { }),
      alt: kit('#004687', '#ffffff', '#ffffff', '#ffffff', { }),
      note: 'royal blue; home neck piping ?',
    },
    {
      from: 2002, to: 2002,
      home: kit(WHITE, '#004687', '#004687', '#000000', { numberFont: 'varsity' }),
      away: kit(GRAY, '#004687', '#004687', '#000000', { numberFont: 'varsity' }),
      alt: kit('#000000', '#004687', '#004687', '#ffffff', { numberFont: 'varsity' }),
      note: 'black drop shadows, black alternate',
    },
    {
      from: 2003, to: 2005,
      home: kit(WHITE, '#004687', '#004687', '#000000', { placket: 'vest', under: '#004687', numberFont: 'varsity' }),
      away: kit(GRAY, '#004687', '#004687', '#000000', { numberFont: 'varsity' }),
      alt: kit('#000000', '#004687', '#004687', '#ffffff', { numberFont: 'varsity' }),
      note: 'sleeveless home vest over a blue undershirt; road vest too ?',
    },
    {
      from: 2006, to: 2007,
      home: kit(WHITE, '#004687', '#004687', '#000000', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      away: kit(GRAY, '#004687', '#004687', '#000000', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      note: 'sleeved again with royal blue arm piping; no alt until the powder blue of 2008',
    },
    {
      from: 2008, to: 2011,
      home: kit(WHITE, '#004687', '#004687', '#000000', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      away: kit(GRAY, '#004687', '#004687', '#000000', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      alt: kit('#7ab2dd', '#004687', '#004687', '#ffffff', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      note: 'powder blue alt: blue "Royals" and numbers trimmed white',
    },
    {
      from: 2012, to: 2021,
      home: kit(WHITE, '#004687', '#004687', '#000000', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      away: kit(GRAY, '#004687', '#004687', '#000000', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      alt: kit('#7ab2dd', '#ffffff', '#ffffff', '#004687', { piping: '#004687', stripe: '#004687', numberFont: 'varsity' }),
      note: 'powder alt colors reversed (white trimmed blue); black drop shadows to 2019; gold trim on the 2017-21 white alt only',
    },
    {
      from: 2022,
      home: kit(WHITE, '#004687', '#004687', '#004687', { piping: '#004687', stripe: '#004687' }),
      away: kit(GRAY, '#004687', '#004687', '#004687', { piping: '#004687', stripe: '#004687' }),
      alt: kit('#7ab2dd', '#ffffff', '#ffffff', '#ffffff', { piping: '#ffffff', stripe: '#ffffff' }),
      note: 'outlines dropped, one thicker blue sleeve stripe; block "KANSAS CITY" road; powder alt piping ?',
    },
  ],
  // Dodgers -- teamcolorcodes; set unchanged (blue script, a RED front number: the front is what the cut shows)
  '119': [
    {
      from: 2000, to: 2025,
      home: kit(WHITE, '#005a9c', '#ef3e42', '#ef3e42', { }),
      away: kit(GRAY, '#005a9c', '#ef3e42', '#ef3e42', { }),
      note: 'Dodger blue script, red front numbers (blue on the back)',
    },
    {
      from: 2026,
      home: kit(WHITE, '#005a9c', '#ef3e42', '#ef3e42', { }),
      away: kit(GRAY, '#005a9c', '#ef3e42', '#ef3e42', { }),
      alt: kit('#005a9c', '#ffffff', '#ef3e42', '#c4ced4', { }),
      note: 'blue road alternate: white "Dodgers" script, red front number trimmed gray, white back numbers',
    },
  ],
  // Expos / Nationals -- Wikipedia (Montreal Expos; Washington Nationals: uniforms); sportslogos.net 2011 set;
  // teamcolorcodes
  '120': [
    {
      from: 2000, to: 2004,
      home: kit(WHITE, '#003087', '#003087', '#e4002b', { pinstripe: '#003087' }),
      away: kit(GRAY, '#e4002b', '#e4002b', '#003087', { }),
      alt: kit('#003087', '#ffffff', '#ffffff', '#e4002b', { }),
      note: 'Expos: royal-blue-pinstriped home, red "Montreal" road; number colors and the blue alternate ?',
    },
    {
      from: 2005, to: 2008,
      home: kit(WHITE, '#ab0003', '#ab0003', '#c9a95a', { }),
      away: kit(GRAY, '#14225a', '#14225a', '#c9a95a'),
      alt: kit('#ab0003', '#ffffff', '#14225a', '#ffffff'),
      note: 'Nationals: gold bevels; red "DC" alternate from 2006',
    },
    {
      from: 2009, to: 2010,
      home: kit(WHITE, '#ab0003', '#ab0003', '#c9a95a', { }),
      away: kit(GRAY, '#ab0003', '#ab0003', '#14225a', { }),
      alt: kit('#ab0003', '#ffffff', '#ffffff', '#14225a'),
      note: 'red script road lettering, curly W red alternate',
    },
    {
      from: 2011, to: 2021,
      home: kit(WHITE, '#ab0003', '#ab0003', '#14225a', { piping: '#ab0003', stripe: '#ab0003', stripe2: '#14225a' }),
      away: kit(GRAY, '#ab0003', '#ab0003', '#14225a', { }),
      alt: kit('#ab0003', '#ffffff', '#ffffff', '#14225a', { piping: '#ffffff', stripe: '#ffffff', stripe2: '#14225a' }),
      note: 'gold gone; curly W home with red-and-blue placket piping and sleeve trim, red alt with white-and-blue; road piping ?',
    },
    {
      from: 2022, to: 2023,
      home: kit(WHITE, '#14225a', '#14225a', '#ab0003', { }),
      away: kit(GRAY, '#ab0003', '#ab0003', '#14225a', { }),
      alt: kit('#ab0003', '#ffffff', '#ffffff', '#14225a', { piping: '#ffffff', stripe: '#ffffff', stripe2: '#14225a' }),
      note: 'navy script "Nationals" white becomes the primary home',
    },
    {
      from: 2024, to: 2024,
      home: kit(WHITE, '#14225a', '#14225a', '#ab0003', { }),
      away: kit('#14225a', '#ffffff', '#ffffff', '#ab0003'),
      alt: kit('#14225a', '#ffffff', '#ab0003', '#ffffff', { }),
      note: 'navy block "WASHINGTON" road (the gray the secondary road); navy script alt',
    },
    {
      from: 2025,
      home: kit(WHITE, '#14225a', '#14225a', '#ab0003', { }),
      away: kit('#14225a', '#ffffff', '#ffffff', '#ab0003'),
      alt: kit('#ab0003', '#ffffff', '#ffffff', '#14225a'),
      note: 'red curly W alt returns without piping',
    },
  ],
  // Mets -- Wikipedia (New York Mets: uniforms); teamcolorcodes
  '121': [
    {
      from: 2000, to: 2011,
      home: kit(WHITE, '#002d72', '#002d72', '#ff5910', { pinstripe: '#002d72', numberFont: 'varsity' }),
      away: kit(GRAY, '#002d72', '#002d72', '#ff5910', { numberFont: 'varsity' }),
      alt: kit('#000000', '#002d72', '#002d72', '#ff5910', { numberFont: 'varsity' }),
      note: 'royal blue pinstripes at home, black drop shadows, black alternate (home and road); alt lettering colors ?',
    },
    {
      from: 2012, to: 2012,
      home: kit(WHITE, '#002d72', '#002d72', '#ff5910', { pinstripe: '#002d72' }),
      away: kit(GRAY, '#002d72', '#002d72', '#ff5910', { }),
      note: 'black dropped (the black jersey kept and worn twice); no regular alt',
    },
    {
      from: 2013,
      home: kit(WHITE, '#002d72', '#002d72', '#ff5910', { pinstripe: '#002d72' }),
      away: kit(GRAY, '#002d72', '#002d72', '#ff5910', { }),
      alt: kit('#002d72', '#ff5910', '#ff5910', '#ffffff', { piping: '#ff5910', stripe: '#ff5910' }),
      note: 'blue alternates from 2013: the home one orange "Mets" script and numbers outlined white, orange placket and sleeve piping (road version gray "NEW YORK")',
    },
  ],
  // Athletics -- Wikipedia (Oakland Athletics: uniforms); teamcolorcodes
  '133': [
    {
      from: 2000, to: 2013,
      home: kit(WHITE, '#003831', '#003831', '#efb21e', { }),
      away: kit(GRAY, '#003831', '#003831', '#efb21e', { }),
      alt: kit('#003831', '#efb21e', '#efb21e', '#ffffff', { }),
      note: 'green/gold; green alt with gold lettering (gold alternates also worn) ?',
    },
    {
      from: 2014, to: 2017,
      home: kit(WHITE, '#003831', '#003831', '#efb21e', { }),
      away: kit(GRAY, '#003831', '#003831', '#efb21e', { }),
      alt: kit('#003831', '#ffffff', '#ffffff', '#efb21e', { }),
      note: 'green alt: white "A\'s" with gold trim',
    },
    {
      from: 2018, to: 2024,
      home: kit(WHITE, '#003831', '#003831', '#efb21e', { }),
      away: kit(GRAY, '#003831', '#003831', '#efb21e', { }),
      alt: kit('#00843d', '#ffffff', '#ffffff', '#efb21e', { }),
      note: 'kelly green alt: white "Oakland" with gold trim',
    },
    {
      from: 2025,
      home: kit(WHITE, '#003831', '#003831', '#efb21e', { }),
      away: kit(GRAY, '#003831', '#003831', '#efb21e', { }),
      alt: kit('#003831', '#efb21e', '#efb21e', '#ffffff', { }),
      note: 'Sacramento: the road reads "Athletics" (green, gold trim), as the home script has since 2023',
    },
  ],
  // Pirates -- Wikipedia (Pittsburgh Pirates: uniforms); teamcolorcodes
  '134': [
    {
      from: 2000, to: 2000,
      home: kit(WHITE, '#000000', '#000000', '#fdb827'),
      away: kit(GRAY, '#000000', '#000000', '#fdb827', { }),
      alt: kit('#000000', '#fdb827', '#fdb827', '#c8102e'),
      note: 'last year of the 1997 set with red accents and script "Pittsburgh" road; alt ?',
    },
    {
      from: 2001, to: 2008,
      home: kit(WHITE, '#000000', '#000000', '#fdb827', { placket: 'vest', under: '#000000' }),
      away: kit(GRAY, '#000000', '#000000', '#fdb827'),
      alt: kit('#000000', '#fdb827', '#fdb827', '#c8102e'),
      note: 'PNC Park block set: sleeveless home vest over a black undershirt (vest years ?), black alt gold "Pirates" outlined red; a black-pinstriped white vest alt 2005-10',
    },
    {
      from: 2009, to: 2019,
      home: kit(WHITE, '#000000', '#000000', '#fdb827'),
      away: kit(GRAY, '#000000', '#000000', '#fdb827'),
      alt: kit('#000000', '#fdb827', '#fdb827', '#ffffff'),
      note: 'red gone: the black alt carries the gold "P" trimmed white',
    },
    {
      from: 2020,
      home: kit(WHITE, '#000000', '#000000', '#fdb827'),
      away: kit(GRAY, '#000000', '#000000', '#fdb827', { }),
      alt: kit('#000000', '#fdb827', '#fdb827', '#ffffff'),
      note: 'script "Pittsburgh" road returns, black road alternate',
    },
  ],
  // Padres -- Wikipedia (San Diego Padres: uniforms); teamcolorcodes
  '135': [
    {
      from: 2000, to: 2000,
      home: kit(WHITE, '#002d62', '#002d62', '#f37021', { pinstripe: '#002d62' }),
      away: kit(GRAY, '#002d62', '#002d62', '#f37021', { }),
      alt: kit('#002d62', '#ffffff', '#f37021', '#ffffff', { piping: '#ffffff', stripe: '#ffffff' }),
      note: 'navy/orange; the home still navy-pinstriped; alt lettering ?',
    },
    {
      from: 2001, to: 2003,
      home: kit(WHITE, '#002d62', '#002d62', '#f37021', { piping: '#002d62' }),
      away: kit(GRAY, '#002d62', '#002d62', '#f37021', { }),
      alt: kit('#002d62', '#ffffff', '#f37021', '#ffffff', { piping: '#ffffff', stripe: '#ffffff' }),
      note: 'plain white home with navy piping',
    },
    {
      from: 2004, to: 2010,
      home: kit(WHITE, '#002d62', '#002d62', '#cdbf9f', { }),
      away: kit('#cdbf9f', '#002d62', '#002d62', '#ffffff', { }),
      alt: kit('#002d62', '#cdbf9f', '#cdbf9f', '#ffffff', { }),
      note: 'navy/sand, sand road jersey',
    },
    {
      from: 2011, to: 2011,
      home: kit(WHITE, '#002d62', '#002d62', '#cdbf9f', { }),
      away: kit(GRAY, '#002d62', '#002d62', '#cdbf9f', { }),
      alt: kit('#002d62', '#cdbf9f', '#cdbf9f', '#ffffff', { }),
      note: 'road goes gray',
    },
    {
      from: 2012, to: 2015,
      home: kit(WHITE, '#002d62', '#002d62', '#cdbf9f', { piping: '#002d62', stripe: '#002d62' }),
      away: kit(GRAY, '#002d62', '#002d62', '#ffffff', { piping: '#002d62', stripe: '#002d62' }),
      alt: kit('#002d62', '#ffffff', '#ffffff', '#ffffff', { piping: '#ffffff', stripe: '#ffffff' }),
      note: 'navy/white block set with navy piping (chest, neck, sleeves)',
    },
    {
      from: 2016, to: 2019,
      home: kit(WHITE, '#002d62', '#002d62', '#ffc425', { piping: '#002d62', stripe: '#002d62' }),
      away: kit(GRAY, '#002d62', '#002d62', '#ffffff', { piping: '#002d62', stripe: '#002d62' }),
      alt: kit('#002d62', '#ffffff', '#ffffff', '#ffffff', { piping: '#ffffff', stripe: '#ffffff' }),
      note: 'gold trim on the home; brown/gold Friday alt 2016-19 ?',
    },
    {
      from: 2020,
      home: kit(WHITE, '#2f241d', '#2f241d', '#ffc425', { pinstripe: '#2f241d' }),
      away: kit('#c9bb9b', '#2f241d', '#2f241d', '#ffc425', { pinstripe: '#2f241d' }),
      alt: kit('#2f241d', '#ffc425', '#ffc425', '#ffffff', { }),
      note: 'brown/gold: brown pinstripes on the white home and the sand road',
    },
  ],
  // Mariners -- Wikipedia (Seattle Mariners: uniforms); teamcolorcodes
  '136': [
    {
      from: 2000, to: 2002,
      home: kit(WHITE, '#0c2c56', '#0c2c56', '#005c5c', { }),
      away: kit(GRAY, '#0c2c56', '#0c2c56', '#005c5c', { }),
      alt: kit('#0c2c56', '#c4ced4', '#c4ced4', '#005c5c', { piping: '#c4ced4' }),
      note: 'navy/Northwest green/silver; navy alternate with silver piping',
    },
    {
      from: 2003, to: 2011,
      home: kit(WHITE, '#0c2c56', '#0c2c56', '#005c5c', { }),
      away: kit(GRAY, '#0c2c56', '#0c2c56', '#005c5c', { }),
      alt: kit('#0c2c56', '#c4ced4', '#c4ced4', '#005c5c', { }),
      note: 'the navy alt loses its piping',
    },
    {
      from: 2012, to: 2022,
      home: kit(WHITE, '#0c2c56', '#0c2c56', '#005c5c', { }),
      away: kit(GRAY, '#0c2c56', '#0c2c56', '#005c5c', { }),
      alt: kit('#0c2c56', '#c4ced4', '#c4ced4', '#005c5c', { }),
      note: 'the navy "Seattle" alt stays the usual alt (silver, green trim); a Northwest green select-Saturday alt from 2012; silver inline from 2015',
    },
    {
      from: 2023,
      home: kit(WHITE, '#0c2c56', '#0c2c56', '#005c5c', { }),
      away: kit('#0c2c56', '#c4ced4', '#c4ced4', '#005c5c', { }),
      alt: kit('#005c5c', '#c4ced4', '#c4ced4', '#0c2c56', { }),
      note: 'navy replaces gray as the standard road jersey; its letter colors ?',
    },
  ],
  // Giants -- Wikipedia (San Francisco Giants: uniforms); teamcolorcodes. No names on the home cream to 2020.
  '137': [
    {
      from: 2000, to: 2002,
      home: kit(CREAM, '#000000', '#000000', '#fd5a1e', { piping: '#000000', numberFont: 'tuscan' }),
      away: kit(GRAY, '#000000', '#000000', '#fd5a1e', { numberFont: 'tuscan' }),
      alt: kit('#000000', '#fd5a1e', '#fd5a1e', '#ffffff', { numberFont: 'tuscan' }),
      note: 'cream home with black piping; black alt worn 2001-02',
    },
    {
      from: 2003, to: 2009,
      home: kit(CREAM, '#000000', '#000000', '#fd5a1e', { piping: '#000000', numberFont: 'tuscan' }),
      away: kit(GRAY, '#000000', '#000000', '#fd5a1e', { numberFont: 'tuscan' }),
      note: 'no regular colored alt',
    },
    {
      from: 2010, to: 2011,
      home: kit(CREAM, '#000000', '#000000', '#fd5a1e', { piping: '#000000', numberFont: 'tuscan' }),
      away: kit(GRAY, '#000000', '#000000', '#fd5a1e', { numberFont: 'tuscan' }),
      alt: kit('#fd5a1e', '#000000', '#000000', CREAM, { numberFont: 'tuscan' }),
      note: 'orange Friday alternate',
    },
    {
      from: 2012,
      home: kit(CREAM, '#000000', '#000000', '#fd5a1e', { piping: '#000000', numberFont: 'tuscan' }),
      away: kit(GRAY, '#000000', '#000000', '#fd5a1e', { piping: '#000000', stripe: '#000000', numberFont: 'tuscan' }),
      alt: kit('#fd5a1e', '#000000', '#000000', CREAM, { piping: '#000000', stripe: '#000000', numberFont: 'tuscan' }),
      note: 'black piping on the road gray and (from 2014) the orange alt; a black road alt (orange SF, orange piping) back from 2015',
    },
  ],
  // Cardinals -- Wikipedia (St. Louis Cardinals: uniforms); teamcolorcodes
  '138': [
    {
      from: 2000, to: 2012,
      home: kit(WHITE, '#c41e3a', '#c41e3a', '#0c2340', { }),
      away: kit(GRAY, '#c41e3a', '#c41e3a', '#0c2340', { }),
      note: 'birds on the bat home and road; no regular colored alt',
    },
    {
      from: 2013,
      home: kit(WHITE, '#c41e3a', '#c41e3a', '#0c2340', { }),
      away: kit(GRAY, '#c41e3a', '#c41e3a', '#0c2340', { }),
      alt: kit(CREAM, '#c41e3a', '#c41e3a', '#0c2340', { piping: '#c41e3a', stripe: '#c41e3a' }),
      note: 'cream Saturday "St. Louis" alternate with red placket and sleeve trim; a powder blue Saturday road alt (red birds on bat, red piping) from 2019',
    },
  ],
  // Devil Rays / Rays -- Wikipedia (Tampa Bay Rays: uniforms); teamcolorcodes (Devil Rays green #004637)
  '139': [
    {
      from: 2000, to: 2000,
      home: kit(WHITE, '#00a3ad', '#000000', '#00a3ad'),
      away: kit(GRAY, '#00a3ad', '#000000', '#00a3ad'),
      alt: kit('#000000', '#00a3ad', '#ffffff', '#00a3ad'),
      note: 'rainbow wordmark (drawn as its teal); number colors ?',
    },
    {
      from: 2001, to: 2004,
      home: kit(WHITE, '#004637', '#004637', '#000000'),
      away: kit(GRAY, '#004637', '#004637', '#000000'),
      alt: kit('#004637', '#000000', '#000000', '#ffffff'),
      note: 'Devil Rays green/black; green numbers trimmed black ?',
    },
    {
      from: 2005, to: 2007,
      home: kit(WHITE, '#004637', '#004637', '#000000', { placket: 'vest', under: '#000000' }),
      away: kit(GRAY, '#004637', '#004637', '#000000'),
      alt: kit('#004637', '#000000', '#000000', '#ffffff'),
      note: 'sleeveless home vest over a black undershirt',
    },
    {
      from: 2008, to: 2022,
      home: kit(WHITE, '#092c5c', '#092c5c', '#8fbce6', { piping: '#092c5c', stripe: '#092c5c', numberFont: 'rounded' }),
      away: kit(GRAY, '#092c5c', '#092c5c', '#8fbce6', { piping: '#092c5c', stripe: '#092c5c', numberFont: 'rounded' }),
      alt: kit('#092c5c', '#ffffff', '#ffffff', '#8fbce6', { piping: '#8fbce6', stripe: '#8fbce6', numberFont: 'rounded' }),
      note: 'navy/Columbia blue: dark blue piping on collar, placket and sleeve ends; Columbia piping on the navy alt',
    },
    {
      from: 2023,
      home: kit(WHITE, '#092c5c', '#092c5c', '#8fbce6', { piping: '#092c5c', stripe: '#092c5c', numberFont: 'rounded' }),
      away: kit('#092c5c', '#ffffff', '#ffffff', '#8fbce6', { piping: '#8fbce6', stripe: '#8fbce6', numberFont: 'rounded' }),
      alt: kit('#8fbce6', '#092c5c', '#092c5c', '#ffffff', { piping: '#092c5c', stripe: '#092c5c', numberFont: 'rounded' }),
      note: 'gray road dropped for navy (or Columbia) tops; rainbow Devil Rays set also in rotation',
    },
  ],
  // Rangers -- Wikipedia (Texas Rangers: uniforms); teamcolorcodes
  '140': [
    {
      from: 2000, to: 2000,
      home: kit(WHITE, '#c0111f', '#c0111f', '#003278', { piping: '#c0111f', stripe: '#c0111f' }),
      away: kit(GRAY, '#003278', '#003278', '#ffffff', { stripe: '#c0111f' }),
      alt: kit('#003278', '#ffffff', '#ffffff', '#c0111f', { }),
      note: 'red-led 1994 set (red piping), road letters blue in 2000, new blue alt',
    },
    {
      from: 2001, to: 2008,
      home: kit(WHITE, '#003278', '#003278', '#c0111f', { stripe: '#003278', numberFont: 'varsity' }),
      away: kit(GRAY, '#003278', '#003278', '#c0111f', { stripe: '#003278', numberFont: 'varsity' }),
      alt: kit('#003278', '#ffffff', '#ffffff', '#c4ced4', { stripe: '#ffffff', numberFont: 'varsity' }),
      note: 'blue with black drop shadows: blue sleeve piping on the road gray (home matched ?), white on the blue alt',
    },
    {
      from: 2009, to: 2013,
      home: kit(WHITE, '#003278', '#003278', '#c0111f', { numberFont: 'varsity' }),
      away: kit(GRAY, '#003278', '#003278', '#c0111f', { numberFont: 'varsity' }),
      alt: kit('#c0111f', '#ffffff', '#ffffff', '#003278', { numberFont: 'varsity' }),
      note: '"TEXAS" at home too; the red home alt (white "Texas", silver bevel, blue outline) the main alt, the blue alt on the road',
    },
    {
      from: 2014, to: 2019,
      home: kit(WHITE, '#003278', '#003278', '#c0111f'),
      away: kit(GRAY, '#003278', '#003278', '#c0111f'),
      alt: kit('#003278', '#ffffff', '#ffffff', '#c0111f'),
      note: 'black shadows off; blue alt',
    },
    {
      from: 2020,
      home: kit(WHITE, '#003278', '#003278', '#c0111f', { }),
      away: kit(GRAY, '#003278', '#003278', '#c0111f'),
      alt: kit('#003278', '#ffffff', '#ffffff', '#c0111f'),
      note: 'script "Rangers" home; powder blue alt too; red retired 2023',
    },
  ],
  // Blue Jays -- Wikipedia (Toronto Blue Jays: uniforms); sportslogos.net 1997-2000 set; teamcolorcodes
  '141': [
    {
      from: 2000, to: 2000,
      home: kit(WHITE, '#002f6c', '#002f6c', '#006ba6', { piping: '#002f6c', stripe: '#002f6c', stripe2: '#006ba6' }),
      away: kit(GRAY, '#002f6c', '#002f6c', '#da291c', { piping: '#002f6c', stripe: '#002f6c', stripe2: '#006ba6' }),
      alt: kit('#002f6c', '#da291c', '#da291c', '#ffffff', { piping: '#da291c', stripe: '#da291c', stripe2: '#006ba6' }),
      note: '1997 set: split letters (blue/light blue at home, blue/red on the road), sleeve ends banded red, light blue and blue on all three (two bands drawn)',
    },
    {
      from: 2001, to: 2003,
      home: kit(WHITE, '#003da5', '#003da5', '#008b8b', { piping: '#003da5' }),
      away: kit(GRAY, '#003da5', '#003da5', '#e8291c', { piping: '#003da5' }),
      alt: kit('#003da5', '#e8291c', '#e8291c', '#ffffff', { piping: '#e8291c' }),
      note: 'stripes swapped for single-colour chest/neck piping; road faux-vest',
    },
    {
      from: 2004, to: 2007,
      home: kit(WHITE, '#4f5459', '#4f5459', '#6cace4', { numberFont: 'rounded' }),
      away: kit(GRAY, '#4f5459', '#4f5459', '#6cace4', { numberFont: 'rounded' }),
      alt: kit('#000000', '#4f5459', '#4f5459', '#6cace4', { numberFont: 'rounded' }),
      note: 'black/graphite/silver "JAYS"; graphite shade ?',
    },
    {
      from: 2008, to: 2011,
      home: kit(WHITE, '#4f5459', '#4f5459', '#6cace4', { numberFont: 'rounded' }),
      away: kit(GRAY, '#6cace4', '#6cace4', '#000000', { numberFont: 'rounded' }),
      alt: kit('#000000', '#4f5459', '#4f5459', '#6cace4', { numberFont: 'rounded' }),
      note: 'road to light blue 3D block letters',
    },
    {
      from: 2012, to: 2019,
      home: kit(WHITE, '#134a8e', '#134a8e', '#1d2d5c'),
      away: kit(GRAY, '#134a8e', '#134a8e', '#1d2d5c'),
      alt: kit('#134a8e', '#ffffff', '#ffffff', '#1d2d5c'),
      note: 'royal blue split letters return; trim colors ?',
    },
    {
      from: 2020,
      home: kit(WHITE, '#134a8e', '#134a8e', '#1d2d5c'),
      away: kit(GRAY, '#134a8e', '#134a8e', '#1d2d5c'),
      alt: kit('#6cace4', '#1d2d5c', '#1d2d5c', '#ffffff'),
      note: 'powder blue alternate (navy/white/navy split letters)',
    },
  ],
  // Twins -- Wikipedia (Minnesota Twins: uniforms); teamcolorcodes. Navy pinstripes: home 1987-2022, road to 2009
  // and again from 2023.
  '142': [
    {
      from: 2000, to: 2009,
      home: kit(WHITE, '#002b5c', '#002b5c', '#d31145', { pinstripe: '#002b5c', numberFont: 'tuscan' }),
      away: kit(GRAY, '#d31145', '#d31145', '#002b5c', { pinstripe: '#002b5c', numberFont: 'tuscan' }),
      alt: kit('#002b5c', '#d31145', '#d31145', '#ffffff', { numberFont: 'tuscan' }),
      note: 'pinstripes home and road; red block "Minnesota"; navy alternate',
    },
    {
      from: 2010, to: 2022,
      home: kit(WHITE, '#002b5c', '#002b5c', '#d31145', { pinstripe: '#002b5c' }),
      away: kit(GRAY, '#d31145', '#d31145', '#002b5c', { }),
      alt: kit('#002b5c', '#d31145', '#d31145', '#ffffff', { piping: '#d31145' }),
      note: 'Target Field: the pinstriped home stays, the road gray goes plain with an underlined red script; gold drop shadows at home from 2015',
    },
    {
      from: 2023,
      home: kit(WHITE, '#002b5c', '#d31145', '#002b5c', { }),
      away: kit(GRAY, '#002b5c', '#d31145', '#002b5c', { pinstripe: '#002b5c' }),
      alt: kit('#002b5c', '#ffffff', '#d31145', '#ffffff', { }),
      note: 'redesign: plain home with the red/navy "Twins" script (navy chest number, red back numbers), navy "MINNESOTA" on a navy-pinstriped road gray',
    },
  ],
  // Phillies -- Wikipedia (Philadelphia Phillies: uniforms); teamcolorcodes
  '143': [
    {
      from: 2000, to: 2007,
      home: kit(WHITE, '#e81828', '#e81828', '#002d72', { pinstripe: '#e81828' }),
      away: kit(GRAY, '#e81828', '#e81828', '#002d72', { }),
      note: 'red pinstripes at home, "Phillies" home and road',
    },
    {
      from: 2008, to: 2017,
      home: kit(WHITE, '#e81828', '#e81828', '#002d72', { pinstripe: '#e81828' }),
      away: kit(GRAY, '#e81828', '#e81828', '#002d72', { }),
      alt: kit(CREAM, '#e81828', '#e81828', '#002d72', { piping: '#002d72' }),
      note: 'cream day-game alternate: red lettering, blue collar and placket piping',
    },
    {
      from: 2018,
      home: kit(WHITE, '#e81828', '#e81828', '#002d72', { pinstripe: '#e81828' }),
      away: kit(GRAY, '#e81828', '#e81828', '#002d72', { }),
      alt: kit('#6cace4', '#6f263d', '#6f263d', '#ffffff', { }),
      note: 'powder blue Thursday alternate (the 1973-88 road: maroon script and numbers trimmed white) replaces the cream',
    },
  ],
  // Braves -- Wikipedia (Atlanta Braves: uniforms); teamcolorcodes. Navy-red-navy piping round the collar, down
  // the placket and at the sleeve ends.
  '144': [
    {
      from: 2000, to: 2004,
      home: kit(WHITE, '#ce1141', '#13274f', '#ce1141', { piping: '#13274f', stripe: '#13274f', stripe2: '#ce1141' }),
      away: kit(GRAY, '#13274f', '#13274f', '#ce1141', { piping: '#13274f', stripe: '#13274f', stripe2: '#ce1141' }),
      note: 'no regular colored alt before 2005',
    },
    {
      from: 2005,
      home: kit(WHITE, '#ce1141', '#13274f', '#ce1141', { piping: '#13274f', stripe: '#13274f', stripe2: '#ce1141' }),
      away: kit(GRAY, '#13274f', '#13274f', '#ce1141', { piping: '#13274f', stripe: '#13274f', stripe2: '#ce1141' }),
      alt: kit('#ce1141', '#ffffff', '#13274f', '#ffffff', { piping: '#13274f', stripe: '#13274f', stripe2: '#ffffff' }),
      note: 'red Sunday/Friday alternate (navy/white piping) from 2005; its lettering ?',
    },
  ],
  // White Sox -- Wikipedia (Chicago White Sox: uniforms); teamcolorcodes; set unchanged
  '145': [
    {
      from: 2000,
      home: kit(WHITE, '#000000', '#000000', '#c4ced4', { pinstripe: '#000000' }),
      away: kit(GRAY, '#000000', '#000000', '#ffffff', { stripe: '#000000', stripe2: '#ffffff' }),
      alt: kit('#000000', '#ffffff', '#ffffff', '#c4ced4', { }),
      note: 'black-pinstriped "SOX" home, "CHICAGO" road with black-and-white sleeve piping, black alt; trims ?',
    },
  ],
  // Marlins -- Wikipedia (Miami Marlins: uniforms); teamcolorcodes
  '146': [
    {
      from: 2000, to: 2002,
      home: kit(WHITE, '#00a3ad', '#000000', '#00a3ad', { pinstripe: '#00a3ad' }),
      away: kit(GRAY, '#00a3ad', '#000000', '#00a3ad', { }),
      alt: kit('#000000', '#00a3ad', '#00a3ad', '#ffffff', { }),
      note: 'Florida: teal pinstripes, teal script with black; alt (black) ?',
    },
    {
      from: 2003, to: 2011,
      home: kit(WHITE, '#000000', '#000000', '#00a3ad', { pinstripe: '#000000', placket: 'vest', under: '#000000' }),
      away: kit(GRAY, '#000000', '#000000', '#00a3ad', { }),
      alt: kit('#000000', '#c4ced4', '#c4ced4', '#00a3ad', { }),
      note: 'black-led with teal/silver: black-pinstriped home vest over a black undershirt (vest years ?); road "Marlins" from 2010',
    },
    {
      from: 2012, to: 2018,
      home: kit(WHITE, '#000000', '#000000', '#ff8200', { numberFont: 'rounded' }),
      away: kit(GRAY, '#000000', '#000000', '#ff8200', { numberFont: 'rounded' }),
      alt: kit('#000000', '#ffffff', '#ff8200', '#c4ced4', { numberFont: 'rounded' }),
      note: 'Miami: black/orange/blue; home wordmark ("Miami" vs "Marlins") ?',
    },
    {
      from: 2019, to: 2023,
      home: kit(WHITE, '#000000', '#000000', '#ef3340'),
      away: kit(GRAY, '#000000', '#000000', '#ef3340'),
      alt: kit('#000000', '#000000', '#000000', '#ef3340'),
      note: 'Caliente red / Miami blue / black; the black alt lettered black with a red drop shadow',
    },
    {
      from: 2024,
      home: kit(WHITE, '#000000', '#000000', '#ef3340'),
      away: kit(GRAY, '#000000', '#000000', '#ef3340'),
      alt: kit('#000000', '#ffffff', '#ffffff', '#ef3340'),
      note: 'black alt lettering goes white',
    },
  ],
  // Yankees -- Wikipedia (Logos and uniforms of the New York Yankees); teamcolorcodes. No names on back, home or
  // road.
  '147': [
    {
      from: 2000, to: 2023,
      home: kit(WHITE, '#0c2340', '#0c2340', '#0c2340', { names: false, pinstripe: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#ffffff', { names: false, stripe: '#0c2340', stripe2: '#ffffff' }),
      note: 'navy pinstripes and the interlocking NY at home; road "NEW YORK" and numbers navy outlined white, navy-white-navy cuff stripes; no alternate',
    },
    {
      from: 2024, to: 2025,
      home: kit(WHITE, '#0c2340', '#0c2340', '#0c2340', { names: false, pinstripe: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#0c2340', { names: false }),
      note: 'road outlines and sleeve trim removed: solid navy lettering on the gray',
    },
    {
      from: 2026,
      home: kit(WHITE, '#0c2340', '#0c2340', '#0c2340', { names: false, pinstripe: '#0c2340' }),
      away: kit(GRAY, '#0c2340', '#0c2340', '#0c2340', { names: false }),
      alt: kit('#0c2340', '#ffffff', '#ffffff', '#ffffff', { }),
      note: 'navy road tops designated the official alternate for 2026 (not yet worn in a regular-season game at the source\'s writing)',
    },
  ],
  // Brewers -- Wikipedia (Milwaukee Brewers: uniforms); teamcolorcodes
  '158': [
    {
      from: 2000, to: 2015,
      home: kit(WHITE, '#0a2351', '#0a2351', '#b6922e', { pinstripe: '#0a2351' }),
      away: kit(GRAY, '#0a2351', '#0a2351', '#b6922e', { }),
      alt: kit('#0a2351', '#b6922e', '#b6922e', '#ffffff', { }),
      note: 'script "Brewers" on a navy-pinstriped home, navy/metallic gold; navy alt ("Milwaukee" road alt 2010-15)',
    },
    {
      from: 2016, to: 2019,
      home: kit(WHITE, '#0a2351', '#0a2351', '#b6922e', { pinstripe: '#0a2351' }),
      away: kit(GRAY, '#0a2351', '#0a2351', '#b6922e', { }),
      alt: kit('#0a2351', '#ffc52f', '#ffc52f', '#ffffff', { }),
      note: 'the navy alt switches to yellow trim in place of metallic gold',
    },
    {
      from: 2020, to: 2025,
      home: kit(CREAM, '#12284b', '#12284b', '#ffc52f', { }),
      away: kit(GRAY, '#12284b', '#12284b', '#ffc52f', { }),
      alt: kit('#12284b', '#ffc52f', '#ffc52f', '#ffffff', { }),
      note: '"Glove Story" ball-in-glove set, cream home (a navy-pinstriped white alt too); alt lettering ?',
    },
    {
      from: 2026,
      home: kit(CREAM, '#12284b', '#12284b', '#ffc52f', { }),
      away: kit('#9ac0e2', '#12284b', '#12284b', '#ffc52f', { }),
      alt: kit('#12284b', '#ffc52f', '#ffc52f', '#ffffff', { }),
      note: 'powder blue road top (gray pants); its letter colors ?',
    },
  ],
  },
  FACES,
  'varsity',
);

// (helmets: the NFL's alone)
export const HELMET_ERAS: HelmetTable = {};
