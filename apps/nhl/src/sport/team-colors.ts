// The NHL's team colors: what goes into each logo's look (libs/ranker/src/engine/team-look.ts, the one
// source of team colors). scripts/build-team-looks.mjs samples every logo, today's and each old era's
// ("ATL_19992000-20102011.svg", its seasons in its name), and works out its chip, rim, accent and washes from
// these into libs/ranker/src/engine/team-looks/nhl.json: run npm run team-looks after changing this file or
// a logo (tests/team-looks.test.mjs fails until it's run).
import type { TeamLookOverride } from '@ranker/engine/team-look';

// Each team (the code at the front of its logos' names) -> [ESPN's abbreviation, ESPN's id, its color, its
// second color] (ESPN's color and alternateColor; the second is the chip's rim, and its face where the logo
// doesn't read on the first). The Thrashers and the Coyotes, gone, have only old logos: their own colors.
export const TEAMS: Record<string, [string, string, string, string]> = {
  ANA: ['ANA', '25', '#fc4c02', '#000000'], // Anaheim Ducks
  ARI: ['', '', '#8c2633', '#e2d6b5'], // Arizona Coyotes
  PHX: ['', '', '#8c2633', '#e2d6b5'], // Phoenix Coyotes
  ATL: ['', '', '#041e42', '#5c88da'], // Atlanta Thrashers
  BOS: ['BOS', '1', '#231f20', '#fdb71a'], // Boston Bruins
  BUF: ['BUF', '2', '#00468b', '#fdb71a'], // Buffalo Sabres
  CAR: ['CAR', '7', '#e30426', '#000000'], // Carolina Hurricanes
  CBJ: ['CBJ', '29', '#002d62', '#e31937'], // Columbus Blue Jackets
  CGY: ['CGY', '3', '#dd1a32', '#000000'], // Calgary Flames
  CHI: ['CHI', '4', '#e31937', '#000000'], // Chicago Blackhawks
  COL: ['COL', '17', '#860038', '#005ea3'], // Colorado Avalanche
  DAL: ['DAL', '9', '#20864c', '#000000'], // Dallas Stars
  DET: ['DET', '5', '#e30526', '#ffffff'], // Detroit Red Wings
  EDM: ['EDM', '6', '#00205b', '#ff4c00'], // Edmonton Oilers
  FLA: ['FLA', '26', '#e51937', '#002d62'], // Florida Panthers
  LAK: ['LA', '8', '#121212', '#a2aaad'], // Los Angeles Kings
  MIN: ['MIN', '30', '#124734', '#ae122a'], // Minnesota Wild
  MTL: ['MTL', '10', '#c41230', '#013a81'], // Montreal Canadiens
  NJD: ['NJ', '11', '#e30b2b', '#000000'], // New Jersey Devils
  NSH: ['NSH', '27', '#fdba31', '#002d62'], // Nashville Predators
  NYI: ['NYI', '12', '#00529b', '#f47d31'], // New York Islanders
  NYR: ['NYR', '13', '#0056ae', '#e51937'], // New York Rangers
  OTT: ['OTT', '14', '#dd1a32', '#b79257'], // Ottawa Senators
  PHI: ['PHI', '15', '#fe5823', '#000000'], // Philadelphia Flyers
  PIT: ['PIT', '16', '#000000', '#fdb71a'], // Pittsburgh Penguins
  SEA: ['SEA', '124292', '#000d33', '#a3dce4'], // Seattle Kraken
  SJS: ['SJ', '18', '#00788a', '#070707'], // San Jose Sharks
  STL: ['STL', '19', '#0070b9', '#fdb71a'], // St. Louis Blues
  TBL: ['TB', '20', '#003e7e', '#ffffff'], // Tampa Bay Lightning
  TOR: ['TOR', '21', '#003e7e', '#ffffff'], // Toronto Maple Leafs
  UTA: ['UTAH', '129764', '#000000', '#7ab2e1'], // Utah Mammoth
  VAN: ['VAN', '22', '#003e7e', '#008752'], // Vancouver Canucks
  VGK: ['VGK', '37', '#344043', '#b4975a'], // Vegas Golden Knights
  WPG: ['WPG', '28', '#002d62', '#c41230'], // Winnipeg Jets
  WSH: ['WSH', '23', '#d71830', '#0b1f41'], // Washington Capitals
};

// Old logos whose own colors their pixels would mislead about, by file: [color, second color] (an era not
// here takes its own logo's colors where it doesn't use today's)
export const ERA_COLORS: Record<string, [string, string]> = {};

// What the rules can't decide, checked by eye, by file (face: a color, or 'primary', the team's own toned
// for the board)
export const OVERRIDES: Record<string, TeamLookOverride> = {
  // (the Blues ringed in their blue, lifted to read on the board, not the gold second color: the owner)
  'STL.svg': { rim: '#4c94dd' },
  'STL_20082009-20242025.svg': { rim: '#4c94dd' },
};
