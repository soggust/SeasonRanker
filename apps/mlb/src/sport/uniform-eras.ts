// MLB uniform eras, 2000 to today: what each club wore at home (whites, or cream where worn), on the road (grays,
// or the road jersey's actual color) and its main regularly worn colored alternate, one era per major redesign.
// Types and semantics: libs/ranker/src/engine/uniform-eras.ts. Keys are MLB team ids (team-colors.ts TEAMS).
//
// Per kit: name = the chest script/wordmark color, num = the back numbers' fill, outline = their trim, collar = the
// collar/placket piping (the jersey's own color when it has none), sleeve 'stripes' when the sleeve ends carry
// piping/stripes. Throwbacks, City Connect and one-off holiday sets are left out.
//
// Sources: Wikipedia team articles' "Uniforms" / "Logos and uniforms" sections (incl. "Logos and uniforms of the
// Boston Red Sox"), sportslogos.net uniform pages, teamcolorcodes.com for hexes; the rest from memory of the
// sets, flagged with a `?` in `note` where the colors or the years weren't confirmed.

import type { HelmetTable, UniformTable } from '@ranker/engine/uniform-eras';

const WHITE = '#f3f2ee'; // home whites
const GRAY = '#b9bcbf'; // road grays
const CREAM = '#ece4d0'; // cream homes / alternates

export const UNIFORM_ERAS: UniformTable = {
  // Angels -- Wikipedia (Los Angeles Angels: uniforms); teamcolorcodes
  '108': [
    {
      from: 2000, to: 2001,
      home: { body: WHITE, num: '#ba0021', outline: '#1b2f5c', name: '#1b2f5c', collar: '#1b2f5c', sleeve: 'none' },
      away: { body: GRAY, num: '#ba0021', outline: '#1b2f5c', name: '#1b2f5c', collar: '#1b2f5c', sleeve: 'none' },
      alt: { body: '#1b2f5c', num: '#ba0021', outline: '#ffffff', name: '#ffffff', collar: '#8fa4d8', sleeve: 'none' },
      note: 'Disney-era navy/periwinkle faux vests with navy pinstripes; road wordmark and alt trim ?',
    },
    {
      from: 2002, to: 2006,
      home: { body: WHITE, num: '#ba0021', outline: '#003263', name: '#ba0021', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#ba0021', outline: '#003263', name: '#ba0021', collar: GRAY, sleeve: 'none' },
      note: 'Red "Big A" set; road read "Anaheim" to 2004, "Angels" from 2005',
    },
    {
      from: 2007,
      home: { body: WHITE, num: '#ba0021', outline: '#003263', name: '#ba0021', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#ba0021', outline: '#003263', name: '#ba0021', collar: GRAY, sleeve: 'none' },
      alt: { body: '#ba0021', num: '#ffffff', outline: '#003263', name: '#ffffff', collar: '#ba0021', sleeve: 'none' },
      note: 'red alternate added; its lettering colors ?',
    },
  ],
  // Diamondbacks -- Wikipedia (Arizona Diamondbacks: uniforms); teamcolorcodes
  '109': [
    {
      from: 2000, to: 2006,
      home: { body: WHITE, num: '#5f259f', outline: '#00a3ad', name: '#5f259f', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#00a3ad', outline: '#5f259f', name: '#5f259f', collar: GRAY, sleeve: 'none' },
      alt: { body: '#5f259f', num: '#ffffff', outline: '#b87333', name: '#b87333', collar: '#5f259f', sleeve: 'none' },
      note: 'purple/teal/copper, purple pinstripes; Wikipedia calls the home cream (white used) ?; purple alt to 2002, black after ?',
    },
    {
      from: 2007, to: 2015,
      home: { body: WHITE, num: '#000000', outline: '#a71930', name: '#a71930', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#a71930', name: '#a71930', collar: GRAY, sleeve: 'none' },
      alt: { body: '#a71930', num: '#000000', outline: '#e3d4ad', name: '#e3d4ad', collar: '#a71930', sleeve: 'none' },
      note: 'Sedona red / Sonoran sand / black',
    },
    {
      from: 2016, to: 2023,
      home: { body: WHITE, num: '#a71930', outline: '#000000', name: '#a71930', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#a71930', outline: '#000000', name: '#a71930', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#a71930', outline: '#e3d4ad', name: '#a71930', collar: '#000000', sleeve: 'none' },
      note: 'teal returns (snakeskin shoulders 2016-19); home white went teal-trimmed in 2023; number trim ?',
    },
    {
      from: 2024,
      home: { body: CREAM, num: '#a71930', outline: '#000000', name: '#a71930', collar: '#000000', sleeve: 'none' },
      away: { body: GRAY, num: '#a71930', outline: '#30ced8', name: '#a71930', collar: '#000000', sleeve: 'none' },
      alt: { body: '#000000', num: '#a71930', outline: '#30ced8', name: '#a71930', collar: '#30ced8', sleeve: 'none' },
      note: 'cream home with black piping, red/teal/black; whether the piping runs round the sleeves ?',
    },
  ],
  // Orioles -- Wikipedia (Baltimore Orioles: uniforms); teamcolorcodes
  '110': [
    {
      from: 2000, to: 2008,
      home: { body: WHITE, num: '#000000', outline: '#df4601', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#df4601', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#df4601', outline: '#ffffff', name: '#df4601', collar: '#000000', sleeve: 'none' },
      note: 'road read "Orioles" through 2008; black alternate',
    },
    {
      from: 2009, to: 2011,
      home: { body: WHITE, num: '#000000', outline: '#df4601', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#df4601', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#df4601', outline: '#ffffff', name: '#df4601', collar: '#000000', sleeve: 'none' },
      note: '"Baltimore" returns on the road; road letter colors ?',
    },
    {
      from: 2012,
      home: { body: WHITE, num: '#000000', outline: '#df4601', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#df4601', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#df4601', num: '#000000', outline: '#ffffff', name: '#000000', collar: '#df4601', sleeve: 'none' },
      note: 'cartoon bird returns; orange Saturday alternate (black alt still worn)',
    },
  ],
  // Red Sox -- Wikipedia (Logos and uniforms of the Boston Red Sox); teamcolorcodes
  '111': [
    {
      from: 2000, to: 2002,
      home: { body: WHITE, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#bd3039', sleeve: 'none' },
      away: { body: GRAY, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#0c2340', sleeve: 'none' },
      note: 'red neck/placket piping at home; road piping color ?',
    },
    {
      from: 2003, to: 2008,
      home: { body: WHITE, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#bd3039', sleeve: 'none' },
      away: { body: GRAY, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#0c2340', sleeve: 'none' },
      alt: { body: '#bd3039', num: '#0c2340', outline: '#ffffff', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      note: 'red home alternate (blue piping) added',
    },
    {
      from: 2009, to: 2013,
      home: { body: WHITE, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#bd3039', sleeve: 'none' },
      away: { body: GRAY, num: '#0c2340', outline: '#bd3039', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      alt: { body: '#bd3039', num: '#0c2340', outline: '#ffffff', name: '#0c2340', collar: '#bd3039', sleeve: 'none' },
      note: 'road lettering navy; red alt loses piping; navy road alt added',
    },
    {
      from: 2014,
      home: { body: WHITE, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#bd3039', sleeve: 'none' },
      away: { body: GRAY, num: '#bd3039', outline: '#0c2340', name: '#bd3039', collar: '#0c2340', sleeve: 'none' },
      alt: { body: '#bd3039', num: '#0c2340', outline: '#ffffff', name: '#0c2340', collar: '#bd3039', sleeve: 'none' },
      note: 'road lettering back to red',
    },
  ],
  // Cubs -- teamcolorcodes; set from memory
  '112': [
    {
      from: 2000,
      home: { body: WHITE, num: '#0e3386', outline: '#cc3433', name: '#cc3433', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#0e3386', outline: '#cc3433', name: '#0e3386', collar: GRAY, sleeve: 'none' },
      alt: { body: '#0e3386', num: '#ffffff', outline: '#cc3433', name: '#ffffff', collar: '#0e3386', sleeve: 'none' },
      note: 'navy-pinstriped home with the bullseye (red CUBS); number trim and blue alt lettering ?',
    },
  ],
  // Reds -- Wikipedia (Cincinnati Reds: logos and uniforms); sportslogos.net 1999/2007 road; teamcolorcodes
  '113': [
    {
      from: 2000, to: 2006,
      home: { body: WHITE, num: '#c6011f', outline: '#000000', name: '#c6011f', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#c6011f', outline: '#000000', name: '#c6011f', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#c6011f', outline: '#ffffff', name: '#c6011f', collar: '#000000', sleeve: 'none' },
      note: 'vests, red with white trim and black drop shadows; black alternate ?',
    },
    {
      from: 2007,
      home: { body: WHITE, num: '#c6011f', outline: '#000000', name: '#c6011f', collar: '#c6011f', sleeve: 'stripes' },
      away: { body: GRAY, num: '#c6011f', outline: '#000000', name: '#c6011f', collar: '#c6011f', sleeve: 'stripes' },
      alt: { body: '#c6011f', num: '#ffffff', outline: '#000000', name: '#ffffff', collar: '#ffffff', sleeve: 'stripes' },
      note: 'sleeved, early-1900s lettering, red/white sleeve trim; home piping and alt trim ?',
    },
  ],
  // Indians / Guardians -- Wikipedia (Cleveland Guardians: uniforms); teamcolorcodes
  '114': [
    {
      from: 2000, to: 2021,
      home: { body: WHITE, num: '#0c2340', outline: '#e31937', name: '#0c2340', collar: '#0c2340', sleeve: 'stripes', stripe: '#0c2340', stripe2: '#e31937' },
      away: { body: GRAY, num: '#0c2340', outline: '#e31937', name: '#0c2340', collar: '#0c2340', sleeve: 'stripes', stripe: '#0c2340', stripe2: '#e31937' },
      alt: { body: '#0c2340', num: '#e31937', outline: '#ffffff', name: '#e31937', collar: '#e31937', sleeve: 'stripes' },
      note: 'Indians navy/red; piping across the era and the road set changes (2008, Wahoo off 2019) ?',
    },
    {
      from: 2022,
      home: { body: WHITE, num: '#0c2340', outline: '#e31937', name: '#e31937', collar: '#0c2340', sleeve: 'stripes', stripe: '#e31937', stripe2: '#0c2340' },
      away: { body: GRAY, num: '#0c2340', outline: '#e31937', name: '#0c2340', collar: '#0c2340', sleeve: 'stripes', stripe: '#e31937', stripe2: '#0c2340' },
      alt: { body: '#e31937', num: '#0c2340', outline: '#ffffff', name: '#0c2340', collar: '#0c2340', sleeve: 'stripes', stripe: '#ffffff', stripe2: '#0c2340' },
      note: 'Guardians: red script (navy outline) at home, "Cleveland" navy on the road; red home alt',
    },
  ],
  // Rockies -- teamcolorcodes; set from memory
  '115': [
    {
      from: 2000,
      home: { body: WHITE, num: '#000000', outline: '#33006f', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#33006f', outline: '#000000', name: '#33006f', collar: GRAY, sleeve: 'none' },
      alt: { body: '#33006f', num: '#000000', outline: '#c4ced4', name: '#000000', collar: '#33006f', sleeve: 'none' },
      note: 'purple-pinstriped home, black/purple/silver; vests and black alts came and went; trims ?',
    },
  ],
  // Tigers -- Wikipedia (Detroit Tigers: uniforms and logos); sportslogos.net road; teamcolorcodes
  '116': [
    {
      from: 2000, to: 2025,
      home: { body: WHITE, num: '#0c2340', outline: '#0c2340', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      away: { body: GRAY, num: '#0c2340', outline: '#fa4616', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      note: 'Old English D at home, navy "Detroit" (orange/white trim) on the road; both navy piping',
    },
    {
      from: 2026,
      home: { body: WHITE, num: '#0c2340', outline: '#0c2340', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      away: { body: GRAY, num: '#0c2340', outline: '#fa4616', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      alt: { body: '#fa4616', num: '#0c2340', outline: '#ffffff', name: '#0c2340', collar: '#0c2340', sleeve: 'none' },
      note: 'orange Friday home alternate added (navy road alt too); alt piping ?',
    },
  ],
  // Astros -- Wikipedia (Houston Astros: uniforms); teamcolorcodes
  '117': [
    {
      from: 2000, to: 2012,
      home: { body: WHITE, num: '#9a3324', outline: '#000000', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#9a3324', name: '#9a3324', collar: GRAY, sleeve: 'none' },
      alt: { body: '#9a3324', num: '#d4c19c', outline: '#000000', name: '#d4c19c', collar: '#9a3324', sleeve: 'none' },
      note: 'brick/black/sand, black pinstripes at home; black alt to ~2001 then brick red; number trims ?',
    },
    {
      from: 2013,
      home: { body: WHITE, num: '#002d62', outline: '#eb6e1f', name: '#002d62', collar: '#002d62', sleeve: 'none' },
      away: { body: GRAY, num: '#002d62', outline: '#eb6e1f', name: '#002d62', collar: '#002d62', sleeve: 'none' },
      alt: { body: '#eb6e1f', num: '#002d62', outline: '#ffffff', name: '#002d62', collar: '#002d62', sleeve: 'none' },
      note: 'navy/orange, front piping; piping color ?',
    },
  ],
  // Royals -- Wikipedia (Kansas City Royals: uniforms); teamcolorcodes
  '118': [
    {
      from: 2000, to: 2001,
      home: { body: WHITE, num: '#004687', outline: '#004687', name: '#004687', collar: '#004687', sleeve: 'none' },
      away: { body: GRAY, num: '#004687', outline: '#ffffff', name: '#004687', collar: GRAY, sleeve: 'none' },
      alt: { body: '#004687', num: '#ffffff', outline: '#ffffff', name: '#ffffff', collar: '#004687', sleeve: 'none' },
      note: 'royal blue; home neck piping ?',
    },
    {
      from: 2002, to: 2005,
      home: { body: WHITE, num: '#004687', outline: '#000000', name: '#004687', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#004687', outline: '#000000', name: '#004687', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#004687', outline: '#ffffff', name: '#004687', collar: '#004687', sleeve: 'none' },
      note: 'black drop shadows, sleeveless from 2003, black alternate',
    },
    {
      from: 2006, to: 2021,
      home: { body: WHITE, num: '#004687', outline: '#000000', name: '#004687', collar: '#004687', sleeve: 'stripes' },
      away: { body: GRAY, num: '#004687', outline: '#000000', name: '#004687', collar: '#004687', sleeve: 'stripes' },
      alt: { body: '#7ab2dd', num: '#ffffff', outline: '#004687', name: '#004687', collar: '#004687', sleeve: 'stripes' },
      note: 'sleeved with arm piping; black drop shadows to 2019; powder blue alt from 2008; gold trim 2016-17 ?',
    },
    {
      from: 2022,
      home: { body: WHITE, num: '#004687', outline: '#bd9b60', name: '#004687', collar: '#004687', sleeve: 'stripes' },
      away: { body: GRAY, num: '#004687', outline: '#ffffff', name: '#004687', collar: '#004687', sleeve: 'stripes' },
      alt: { body: '#7ab2dd', num: '#ffffff', outline: '#ffffff', name: '#ffffff', collar: '#ffffff', sleeve: 'stripes' },
      note: 'thicker sleeve stripes, block "Kansas City" road; number trims and powder alt piping ?',
    },
  ],
  // Dodgers -- teamcolorcodes; set unchanged
  '119': [
    {
      from: 2000,
      home: { body: WHITE, num: '#005a9c', outline: '#005a9c', name: '#005a9c', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#005a9c', outline: '#005a9c', name: '#005a9c', collar: GRAY, sleeve: 'none' },
      note: 'Dodger blue script, red front numbers',
    },
  ],
  // Expos / Nationals -- Wikipedia (Montreal Expos; Washington Nationals: uniforms); teamcolorcodes
  '120': [
    {
      from: 2000, to: 2004,
      home: { body: WHITE, num: '#003087', outline: '#e4002b', name: '#003087', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#e4002b', outline: '#003087', name: '#e4002b', collar: GRAY, sleeve: 'none' },
      alt: { body: '#003087', num: '#ffffff', outline: '#e4002b', name: '#ffffff', collar: '#003087', sleeve: 'none' },
      note: 'Expos: blue-pinstriped home, red "Montreal" road; number colors and the blue alternate ?',
    },
    {
      from: 2005, to: 2008,
      home: { body: WHITE, num: '#ab0003', outline: '#c9a95a', name: '#ab0003', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#14225a', outline: '#c9a95a', name: '#14225a', collar: GRAY, sleeve: 'none' },
      alt: { body: '#ab0003', num: '#14225a', outline: '#ffffff', name: '#ffffff', collar: '#ab0003', sleeve: 'none' },
      note: 'Nationals: gold bevels; red "DC" alternate from 2006',
    },
    {
      from: 2009, to: 2010,
      home: { body: WHITE, num: '#ab0003', outline: '#c9a95a', name: '#ab0003', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#ab0003', outline: '#14225a', name: '#ab0003', collar: GRAY, sleeve: 'none' },
      alt: { body: '#ab0003', num: '#ffffff', outline: '#14225a', name: '#ffffff', collar: '#ab0003', sleeve: 'none' },
      note: 'red script road lettering, curly W red alternate',
    },
    {
      from: 2011, to: 2021,
      home: { body: WHITE, num: '#ab0003', outline: '#14225a', name: '#ab0003', collar: '#ab0003', sleeve: 'stripes' },
      away: { body: GRAY, num: '#ab0003', outline: '#14225a', name: '#ab0003', collar: GRAY, sleeve: 'none' },
      alt: { body: '#ab0003', num: '#ffffff', outline: '#14225a', name: '#ffffff', collar: '#14225a', sleeve: 'stripes' },
      note: 'gold gone; curly W home and red alternate, with piping (its colors/extent ?)',
    },
    {
      from: 2022, to: 2023,
      home: { body: WHITE, num: '#14225a', outline: '#ab0003', name: '#14225a', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#ab0003', outline: '#14225a', name: '#ab0003', collar: GRAY, sleeve: 'none' },
      alt: { body: '#ab0003', num: '#ffffff', outline: '#14225a', name: '#ffffff', collar: '#14225a', sleeve: 'stripes' },
      note: 'navy script "Nationals" white becomes the primary home',
    },
    {
      from: 2024,
      home: { body: WHITE, num: '#14225a', outline: '#ab0003', name: '#14225a', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#14225a', outline: '#ab0003', name: '#14225a', collar: GRAY, sleeve: 'none' },
      alt: { body: '#14225a', num: '#ab0003', outline: '#ffffff', name: '#ffffff', collar: '#14225a', sleeve: 'none' },
      note: 'navy block "Washington" road; navy script alt (red curly W back 2025 without piping)',
    },
  ],
  // Mets -- teamcolorcodes; set from memory
  '121': [
    {
      from: 2000, to: 2011,
      home: { body: WHITE, num: '#002d72', outline: '#ff5910', name: '#002d72', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#002d72', outline: '#ff5910', name: '#002d72', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#002d72', outline: '#ff5910', name: '#002d72', collar: '#000000', sleeve: 'none' },
      note: 'blue pinstripes at home, black drop shadows, black alternate (home and road); alt lettering colors ?',
    },
    {
      from: 2012,
      home: { body: WHITE, num: '#002d72', outline: '#ff5910', name: '#002d72', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#002d72', outline: '#ff5910', name: '#002d72', collar: GRAY, sleeve: 'none' },
      alt: { body: '#002d72', num: '#ffffff', outline: '#ff5910', name: '#ffffff', collar: '#002d72', sleeve: 'none' },
      note: 'black dropped; blue alternate (from 2013 ?)',
    },
  ],
  // Athletics -- teamcolorcodes; set from memory
  '133': [
    {
      from: 2000, to: 2024,
      home: { body: WHITE, num: '#003831', outline: '#efb21e', name: '#003831', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#003831', outline: '#efb21e', name: '#003831', collar: GRAY, sleeve: 'none' },
      alt: { body: '#003831', num: '#efb21e', outline: '#ffffff', name: '#efb21e', collar: '#003831', sleeve: 'none' },
      note: 'green/gold; gold alternates also worn (2000s on) ?',
    },
    {
      from: 2025,
      home: { body: WHITE, num: '#003831', outline: '#efb21e', name: '#003831', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#003831', outline: '#efb21e', name: '#003831', collar: GRAY, sleeve: 'none' },
      alt: { body: '#003831', num: '#efb21e', outline: '#ffffff', name: '#efb21e', collar: '#003831', sleeve: 'none' },
      note: 'Sacramento: "Oakland" off the road jersey (reads "Athletics") ?',
    },
  ],
  // Pirates -- Wikipedia (Pittsburgh Pirates: uniforms); teamcolorcodes
  '134': [
    {
      from: 2000, to: 2000,
      home: { body: WHITE, num: '#000000', outline: '#fdb827', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#fdb827', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#fdb827', outline: '#c8102e', name: '#fdb827', collar: '#000000', sleeve: 'none' },
      note: 'last year of the 1997 set with red accents and script "Pittsburgh" road; alt ?',
    },
    {
      from: 2001, to: 2019,
      home: { body: WHITE, num: '#000000', outline: '#fdb827', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#fdb827', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#fdb827', outline: '#ffffff', name: '#fdb827', collar: '#000000', sleeve: 'none' },
      note: 'PNC Park block set, black/gold (red accents to 2009); vest years and alt trims ?',
    },
    {
      from: 2020,
      home: { body: WHITE, num: '#000000', outline: '#fdb827', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#fdb827', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#fdb827', outline: '#ffffff', name: '#fdb827', collar: '#000000', sleeve: 'none' },
      note: 'script "Pittsburgh" road returns, black road alternate',
    },
  ],
  // Padres -- Wikipedia (San Diego Padres: uniforms); teamcolorcodes
  '135': [
    {
      from: 2000, to: 2003,
      home: { body: WHITE, num: '#002d62', outline: '#f37021', name: '#002d62', collar: '#002d62', sleeve: 'none' },
      away: { body: GRAY, num: '#002d62', outline: '#f37021', name: '#002d62', collar: GRAY, sleeve: 'none' },
      alt: { body: '#002d62', num: '#f37021', outline: '#ffffff', name: '#ffffff', collar: '#ffffff', sleeve: 'stripes', stripe: '#ffffff' },
      note: 'navy/orange; 2000 home still pinstriped, plain white (navy piping) from 2001; alt lettering ?',
    },
    {
      from: 2004, to: 2010,
      home: { body: WHITE, num: '#002d62', outline: '#cdbf9f', name: '#002d62', collar: WHITE, sleeve: 'none' },
      away: { body: '#cdbf9f', num: '#002d62', outline: '#ffffff', name: '#002d62', collar: '#cdbf9f', sleeve: 'none' },
      alt: { body: '#002d62', num: '#cdbf9f', outline: '#ffffff', name: '#cdbf9f', collar: '#002d62', sleeve: 'none' },
      note: 'navy/sand, sand road jersey',
    },
    {
      from: 2011, to: 2011,
      home: { body: WHITE, num: '#002d62', outline: '#cdbf9f', name: '#002d62', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#002d62', outline: '#cdbf9f', name: '#002d62', collar: GRAY, sleeve: 'none' },
      alt: { body: '#002d62', num: '#cdbf9f', outline: '#ffffff', name: '#cdbf9f', collar: '#002d62', sleeve: 'none' },
      note: 'road goes gray',
    },
    {
      from: 2012, to: 2019,
      home: { body: WHITE, num: '#002d62', outline: '#cdbf9f', name: '#002d62', collar: '#002d62', sleeve: 'stripes' },
      away: { body: GRAY, num: '#002d62', outline: '#ffffff', name: '#002d62', collar: '#002d62', sleeve: 'stripes' },
      alt: { body: '#002d62', num: '#ffffff', outline: '#ffffff', name: '#ffffff', collar: '#ffffff', sleeve: 'stripes' },
      note: 'navy/white with piping (chest, neck, sleeves); gold trim 2016; brown/gold Friday alt 2016-19 ?',
    },
    {
      from: 2020,
      home: { body: WHITE, num: '#2f241d', outline: '#ffc425', name: '#2f241d', collar: WHITE, sleeve: 'none' },
      away: { body: '#b8b0a2', num: '#2f241d', outline: '#ffc425', name: '#2f241d', collar: '#b8b0a2', sleeve: 'none' },
      alt: { body: '#2f241d', num: '#ffc425', outline: '#ffffff', name: '#ffc425', collar: '#2f241d', sleeve: 'none' },
      note: 'brown/gold, brown pinstripes at home; road base (sand per Wikipedia vs gray) ?',
    },
  ],
  // Mariners -- Wikipedia (Seattle Mariners: uniforms); teamcolorcodes
  '136': [
    {
      from: 2000, to: 2011,
      home: { body: WHITE, num: '#0c2c56', outline: '#005c5c', name: '#0c2c56', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#0c2c56', outline: '#005c5c', name: '#0c2c56', collar: GRAY, sleeve: 'none' },
      alt: { body: '#0c2c56', num: '#c4ced4', outline: '#005c5c', name: '#c4ced4', collar: '#0c2c56', sleeve: 'none' },
      note: 'navy/Northwest green/silver; navy alternate',
    },
    {
      from: 2012, to: 2022,
      home: { body: WHITE, num: '#0c2c56', outline: '#005c5c', name: '#0c2c56', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#0c2c56', outline: '#005c5c', name: '#0c2c56', collar: GRAY, sleeve: 'none' },
      alt: { body: '#005c5c', num: '#c4ced4', outline: '#0c2c56', name: '#c4ced4', collar: '#005c5c', sleeve: 'none' },
      note: 'Northwest green home alt returns; silver inline from 2015; alt letter colors ?',
    },
    {
      from: 2023,
      home: { body: WHITE, num: '#0c2c56', outline: '#005c5c', name: '#0c2c56', collar: WHITE, sleeve: 'none' },
      away: { body: '#0c2c56', num: '#c4ced4', outline: '#005c5c', name: '#c4ced4', collar: '#0c2c56', sleeve: 'none' },
      alt: { body: '#005c5c', num: '#c4ced4', outline: '#0c2c56', name: '#c4ced4', collar: '#005c5c', sleeve: 'none' },
      note: 'navy replaces gray as the standard road jersey; its letter colors ?',
    },
  ],
  // Giants -- Wikipedia (San Francisco Giants: uniforms); teamcolorcodes
  '137': [
    {
      from: 2000, to: 2009,
      home: { body: CREAM, num: '#000000', outline: '#fd5a1e', name: '#000000', collar: '#000000', sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#fd5a1e', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#fd5a1e', outline: '#ffffff', name: '#fd5a1e', collar: '#000000', sleeve: 'none' },
      note: 'cream home, neck stripes; black alt worn only ~2000-02 ?',
    },
    {
      from: 2010, to: 2011,
      home: { body: CREAM, num: '#000000', outline: '#fd5a1e', name: '#000000', collar: '#000000', sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#fd5a1e', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#fd5a1e', num: '#000000', outline: CREAM, name: '#000000', collar: '#fd5a1e', sleeve: 'none' },
      note: 'orange Friday alternate',
    },
    {
      from: 2012,
      home: { body: CREAM, num: '#000000', outline: '#fd5a1e', name: '#000000', collar: '#000000', sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#fd5a1e', name: '#000000', collar: '#000000', sleeve: 'stripes', stripe: '#000000' },
      alt: { body: '#fd5a1e', num: '#000000', outline: CREAM, name: '#000000', collar: '#000000', sleeve: 'stripes', stripe: '#000000' },
      note: 'black piping on the road gray (orange alt from 2014); whether it rings the sleeves ?',
    },
  ],
  // Cardinals -- Wikipedia (St. Louis Cardinals: uniforms); teamcolorcodes
  '138': [
    {
      from: 2000, to: 2012,
      home: { body: WHITE, num: '#c41e3a', outline: '#0c2340', name: '#c41e3a', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#c41e3a', outline: '#0c2340', name: '#c41e3a', collar: GRAY, sleeve: 'none' },
      note: 'birds on the bat home and road; no regular colored alt',
    },
    {
      from: 2013,
      home: { body: WHITE, num: '#c41e3a', outline: '#0c2340', name: '#c41e3a', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#c41e3a', outline: '#0c2340', name: '#c41e3a', collar: GRAY, sleeve: 'none' },
      alt: { body: CREAM, num: '#c41e3a', outline: '#0c2340', name: '#c41e3a', collar: '#c41e3a', sleeve: 'stripes', stripe: '#c41e3a' },
      note: 'cream Saturday "St. Louis" alternate with red trim (powder blue road alt from 2019)',
    },
  ],
  // Devil Rays / Rays -- Wikipedia (Tampa Bay Rays: uniforms); teamcolorcodes
  '139': [
    {
      from: 2000, to: 2000,
      home: { body: WHITE, num: '#000000', outline: '#00a3ad', name: '#00a3ad', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#00a3ad', name: '#00a3ad', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#ffffff', outline: '#00a3ad', name: '#00a3ad', collar: '#000000', sleeve: 'none' },
      note: 'rainbow wordmark (drawn as its teal); number colors ?',
    },
    {
      from: 2001, to: 2007,
      home: { body: WHITE, num: '#000000', outline: '#2e7d4f', name: '#2e7d4f', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#2e7d4f', name: '#2e7d4f', collar: GRAY, sleeve: 'none' },
      alt: { body: '#2e7d4f', num: '#000000', outline: '#ffffff', name: '#000000', collar: '#2e7d4f', sleeve: 'none' },
      note: 'green/black; sleeveless home from 2005; shades and trims ?',
    },
    {
      from: 2008, to: 2022,
      home: { body: WHITE, num: '#092c5c', outline: '#8fbce6', name: '#092c5c', collar: '#092c5c', sleeve: 'stripes' },
      away: { body: GRAY, num: '#092c5c', outline: '#8fbce6', name: '#092c5c', collar: '#092c5c', sleeve: 'stripes' },
      alt: { body: '#092c5c', num: '#ffffff', outline: '#8fbce6', name: '#ffffff', collar: '#8fbce6', sleeve: 'stripes' },
      note: 'navy/Columbia blue, dark blue piping; whether it rings the sleeves ?',
    },
    {
      from: 2023,
      home: { body: WHITE, num: '#092c5c', outline: '#8fbce6', name: '#092c5c', collar: '#092c5c', sleeve: 'stripes' },
      away: { body: '#092c5c', num: '#ffffff', outline: '#8fbce6', name: '#ffffff', collar: '#8fbce6', sleeve: 'stripes' },
      alt: { body: '#8fbce6', num: '#092c5c', outline: '#ffffff', name: '#092c5c', collar: '#092c5c', sleeve: 'stripes' },
      note: 'gray road dropped for navy (or Columbia) tops; rainbow Devil Rays set also in rotation',
    },
  ],
  // Rangers -- Wikipedia (Texas Rangers: uniforms); teamcolorcodes
  '140': [
    {
      from: 2000, to: 2000,
      home: { body: WHITE, num: '#c0111f', outline: '#003278', name: '#c0111f', collar: '#c0111f', sleeve: 'stripes' },
      away: { body: GRAY, num: '#003278', outline: '#ffffff', name: '#003278', collar: GRAY, sleeve: 'stripes', stripe: '#c0111f' },
      alt: { body: '#003278', num: '#ffffff', outline: '#c0111f', name: '#ffffff', collar: '#003278', sleeve: 'none' },
      note: 'red-led 1994 set (red piping), road letters blue in 2000, new blue alt',
    },
    {
      from: 2001, to: 2008,
      home: { body: WHITE, num: '#003278', outline: '#c0111f', name: '#003278', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#003278', outline: '#c0111f', name: '#003278', collar: GRAY, sleeve: 'none' },
      alt: { body: '#003278', num: '#ffffff', outline: '#c4ced4', name: '#ffffff', collar: '#003278', sleeve: 'none' },
      note: 'blue with black drop shadows; home wordmark and trims ?',
    },
    {
      from: 2009, to: 2019,
      home: { body: WHITE, num: '#003278', outline: '#c0111f', name: '#003278', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#003278', outline: '#c0111f', name: '#003278', collar: GRAY, sleeve: 'none' },
      alt: { body: '#003278', num: '#ffffff', outline: '#c0111f', name: '#ffffff', collar: '#003278', sleeve: 'none' },
      note: '"TEXAS" at home too; red home alt also; black shadows off from 2014',
    },
    {
      from: 2020,
      home: { body: WHITE, num: '#003278', outline: '#c0111f', name: '#003278', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#003278', outline: '#c0111f', name: '#003278', collar: GRAY, sleeve: 'none' },
      alt: { body: '#003278', num: '#ffffff', outline: '#c0111f', name: '#ffffff', collar: '#003278', sleeve: 'none' },
      note: 'script "Rangers" home; powder blue alt too; red retired 2023',
    },
  ],
  // Blue Jays -- Wikipedia (Toronto Blue Jays: uniforms); teamcolorcodes
  '141': [
    {
      from: 2000, to: 2000,
      home: { body: WHITE, num: '#003da5', outline: '#008b8b', name: '#003da5', collar: '#003da5', sleeve: 'stripes', stripe: '#003da5', stripe2: '#e8291c' },
      away: { body: GRAY, num: '#003da5', outline: '#e8291c', name: '#003da5', collar: '#003da5', sleeve: 'stripes', stripe: '#003da5', stripe2: '#e8291c' },
      alt: { body: '#003da5', num: '#e8291c', outline: '#ffffff', name: '#e8291c', collar: '#e8291c', sleeve: 'stripes', stripe: '#e8291c' },
      note: '1997 set: blue/teal (home) and blue/red (road) split letters, tricolour stripes; shades ?',
    },
    {
      from: 2001, to: 2003,
      home: { body: WHITE, num: '#003da5', outline: '#008b8b', name: '#003da5', collar: '#003da5', sleeve: 'none' },
      away: { body: GRAY, num: '#003da5', outline: '#e8291c', name: '#003da5', collar: '#003da5', sleeve: 'none' },
      alt: { body: '#003da5', num: '#e8291c', outline: '#ffffff', name: '#e8291c', collar: '#e8291c', sleeve: 'none' },
      note: 'stripes swapped for single-colour chest/neck piping; road faux-vest',
    },
    {
      from: 2004, to: 2007,
      home: { body: WHITE, num: '#4f5459', outline: '#6cace4', name: '#4f5459', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#4f5459', outline: '#6cace4', name: '#4f5459', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#4f5459', outline: '#6cace4', name: '#4f5459', collar: '#000000', sleeve: 'none' },
      note: 'black/graphite/silver "JAYS"; graphite shade ?',
    },
    {
      from: 2008, to: 2011,
      home: { body: WHITE, num: '#4f5459', outline: '#6cace4', name: '#4f5459', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#6cace4', outline: '#000000', name: '#6cace4', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#4f5459', outline: '#6cace4', name: '#4f5459', collar: '#000000', sleeve: 'none' },
      note: 'road to light blue 3D block letters',
    },
    {
      from: 2012, to: 2019,
      home: { body: WHITE, num: '#134a8e', outline: '#1d2d5c', name: '#134a8e', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#134a8e', outline: '#1d2d5c', name: '#134a8e', collar: GRAY, sleeve: 'none' },
      alt: { body: '#134a8e', num: '#ffffff', outline: '#1d2d5c', name: '#ffffff', collar: '#134a8e', sleeve: 'none' },
      note: 'royal blue split letters return; trim colors ?',
    },
    {
      from: 2020,
      home: { body: WHITE, num: '#134a8e', outline: '#1d2d5c', name: '#134a8e', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#134a8e', outline: '#1d2d5c', name: '#134a8e', collar: GRAY, sleeve: 'none' },
      alt: { body: '#6cace4', num: '#1d2d5c', outline: '#ffffff', name: '#1d2d5c', collar: '#6cace4', sleeve: 'none' },
      note: 'powder blue alternate (navy/white/navy split letters)',
    },
  ],
  // Twins -- Wikipedia (Minnesota Twins: uniforms); teamcolorcodes
  '142': [
    {
      from: 2000, to: 2009,
      home: { body: WHITE, num: '#002b5c', outline: '#d31145', name: '#002b5c', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#d31145', outline: '#002b5c', name: '#d31145', collar: GRAY, sleeve: 'none' },
      alt: { body: '#002b5c', num: '#d31145', outline: '#ffffff', name: '#d31145', collar: '#002b5c', sleeve: 'none' },
      note: 'pinstripes home and road; red block "Minnesota"; navy alternate',
    },
    {
      from: 2010, to: 2022,
      home: { body: WHITE, num: '#002b5c', outline: '#d31145', name: '#002b5c', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#d31145', outline: '#002b5c', name: '#d31145', collar: GRAY, sleeve: 'none' },
      alt: { body: '#002b5c', num: '#d31145', outline: '#ffffff', name: '#d31145', collar: '#d31145', sleeve: 'none' },
      note: 'Target Field: underlined red script road; gold drop shadows at home from 2015; road pinstripes ?',
    },
    {
      from: 2023,
      home: { body: WHITE, num: '#d31145', outline: '#002b5c', name: '#002b5c', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#d31145', outline: '#002b5c', name: '#002b5c', collar: GRAY, sleeve: 'none' },
      alt: { body: '#002b5c', num: '#d31145', outline: '#ffffff', name: '#ffffff', collar: '#002b5c', sleeve: 'none' },
      note: 'redesign: red/navy script home, navy "MINNESOTA" on navy-pinstriped road gray',
    },
  ],
  // Phillies -- teamcolorcodes; set from memory
  '143': [
    {
      from: 2000, to: 2007,
      home: { body: WHITE, num: '#e81828', outline: '#002d72', name: '#e81828', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#e81828', outline: '#002d72', name: '#e81828', collar: GRAY, sleeve: 'none' },
      note: 'red pinstripes at home, "Phillies" home and road',
    },
    {
      from: 2008, to: 2018,
      home: { body: WHITE, num: '#e81828', outline: '#002d72', name: '#e81828', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#e81828', outline: '#002d72', name: '#e81828', collar: GRAY, sleeve: 'none' },
      alt: { body: CREAM, num: '#e81828', outline: '#002d72', name: '#e81828', collar: CREAM, sleeve: 'none' },
      note: 'cream Saturday alternate; start year ?',
    },
    {
      from: 2019,
      home: { body: WHITE, num: '#e81828', outline: '#002d72', name: '#e81828', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#e81828', outline: '#002d72', name: '#e81828', collar: GRAY, sleeve: 'none' },
      alt: { body: '#6cace4', num: '#e81828', outline: '#ffffff', name: '#e81828', collar: '#6cace4', sleeve: 'none' },
      note: 'powder blue alternate replaces cream ?',
    },
  ],
  // Braves -- teamcolorcodes; set unchanged
  '144': [
    {
      from: 2000,
      home: { body: WHITE, num: '#13274f', outline: '#ce1141', name: '#ce1141', collar: '#13274f', sleeve: 'stripes', stripe: '#13274f', stripe2: '#ce1141' },
      away: { body: GRAY, num: '#13274f', outline: '#ce1141', name: '#13274f', collar: '#13274f', sleeve: 'stripes', stripe: '#13274f', stripe2: '#ce1141' },
      alt: { body: '#ce1141', num: '#13274f', outline: '#ffffff', name: '#ffffff', collar: '#13274f', sleeve: 'stripes', stripe: '#13274f', stripe2: '#ffffff' },
      note: 'navy/red piping round collar, placket and sleeves; red alt lettering ?',
    },
  ],
  // White Sox -- teamcolorcodes; set unchanged
  '145': [
    {
      from: 2000,
      home: { body: WHITE, num: '#000000', outline: '#c4ced4', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#ffffff', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#ffffff', outline: '#c4ced4', name: '#ffffff', collar: '#000000', sleeve: 'none' },
      note: 'black-pinstriped "SOX" home, "CHICAGO" road, black alt; trims ?',
    },
  ],
  // Marlins -- Wikipedia (Miami Marlins: uniforms); teamcolorcodes
  '146': [
    {
      from: 2000, to: 2002,
      home: { body: WHITE, num: '#000000', outline: '#00a3ad', name: '#00a3ad', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#00a3ad', name: '#00a3ad', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#00a3ad', outline: '#ffffff', name: '#00a3ad', collar: '#000000', sleeve: 'none' },
      note: 'Florida: teal pinstripes, teal script with black; alt (black) ?',
    },
    {
      from: 2003, to: 2011,
      home: { body: WHITE, num: '#000000', outline: '#00a3ad', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#00a3ad', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#c4ced4', outline: '#00a3ad', name: '#c4ced4', collar: '#000000', sleeve: 'none' },
      note: 'black-led with teal/silver; road "Marlins" from 2010',
    },
    {
      from: 2012, to: 2018,
      home: { body: WHITE, num: '#000000', outline: '#ff8200', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#ff8200', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#ff8200', outline: '#c4ced4', name: '#ffffff', collar: '#000000', sleeve: 'none' },
      note: 'Miami: black/orange/blue; home wordmark ("Miami" vs "Marlins") ?',
    },
    {
      from: 2019,
      home: { body: WHITE, num: '#000000', outline: '#ef3340', name: '#000000', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#000000', outline: '#ef3340', name: '#000000', collar: GRAY, sleeve: 'none' },
      alt: { body: '#000000', num: '#ffffff', outline: '#ef3340', name: '#ffffff', collar: '#000000', sleeve: 'none' },
      note: 'Caliente red / Miami blue / black; black alt lettering black until 2024 (white since)',
    },
  ],
  // Yankees -- teamcolorcodes; set unchanged
  '147': [
    {
      from: 2000,
      home: { body: WHITE, num: '#0c2340', outline: '#0c2340', name: '#0c2340', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#0c2340', outline: '#0c2340', name: '#0c2340', collar: GRAY, sleeve: 'none' },
      note: 'navy pinstripes, interlocking NY at home, "NEW YORK" road; no alternate',
    },
  ],
  // Brewers -- Wikipedia (Milwaukee Brewers: uniforms); teamcolorcodes
  '158': [
    {
      from: 2000, to: 2019,
      home: { body: WHITE, num: '#0a2351', outline: '#b6922e', name: '#0a2351', collar: WHITE, sleeve: 'none' },
      away: { body: GRAY, num: '#0a2351', outline: '#b6922e', name: '#0a2351', collar: GRAY, sleeve: 'none' },
      alt: { body: '#0a2351', num: '#b6922e', outline: '#ffffff', name: '#b6922e', collar: '#0a2351', sleeve: 'none' },
      note: 'script "Brewers", navy/metallic gold; navy alt lettering ?',
    },
    {
      from: 2020, to: 2025,
      home: { body: CREAM, num: '#12284b', outline: '#ffc52f', name: '#12284b', collar: CREAM, sleeve: 'none' },
      away: { body: GRAY, num: '#12284b', outline: '#ffc52f', name: '#12284b', collar: GRAY, sleeve: 'none' },
      alt: { body: '#12284b', num: '#ffc52f', outline: '#ffffff', name: '#ffc52f', collar: '#12284b', sleeve: 'none' },
      note: '"Glove Story" ball-in-glove set, cream home; alt lettering ?',
    },
    {
      from: 2026,
      home: { body: CREAM, num: '#12284b', outline: '#ffc52f', name: '#12284b', collar: CREAM, sleeve: 'none' },
      away: { body: '#9ac0e2', num: '#12284b', outline: '#ffc52f', name: '#12284b', collar: '#9ac0e2', sleeve: 'none' },
      alt: { body: '#12284b', num: '#ffc52f', outline: '#ffffff', name: '#ffc52f', collar: '#12284b', sleeve: 'none' },
      note: 'powder blue road top (gray pants); its letter colors ?',
    },
  ],
};

// (helmets: the NFL's alone)
export const HELMET_ERAS: HelmetTable = {};
