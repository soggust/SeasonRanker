// MLB's team colors: what goes into each logo's look (libs/ranker/src/engine/team-look.ts, the one source of
// team colors). scripts/build-team-looks.mjs samples every logo (MLB's "cap on dark" marks), today's and each
// old era's, and works out its chip, rim, accent and washes from these into
// libs/ranker/src/engine/team-looks/mlb.json: run npm run team-looks after changing this file, a logo or
// logo-eras.ts (tests/team-looks.test.mjs fails until it's run).
import type { TeamLookOverride } from '@ranker/engine/team-look';

// Each team's logo (its file's name: MLB's team id) -> [ESPN's abbreviation, ESPN's id, its color, its second
// color] (ESPN's color and alternateColor; the second is the chip's rim, and its face where the logo doesn't
// read on the first)
export const TEAMS: Record<string, [string, string, string, string]> = {
  108: ['LAA', '3', '#ba0021', '#c4ced4'], // Angels
  109: ['ARI', '29', '#aa182c', '#000000'], // D-backs
  110: ['BAL', '1', '#df4601', '#000000'], // Orioles
  111: ['BOS', '2', '#0d2b56', '#bd3039'], // Red Sox
  112: ['CHC', '16', '#0e3386', '#cc3433'], // Cubs
  113: ['CIN', '17', '#c6011f', '#ffffff'], // Reds
  114: ['CLE', '5', '#002b5c', '#e31937'], // Guardians
  115: ['COL', '27', '#33006f', '#000000'], // Rockies
  116: ['DET', '6', '#0a2240', '#ff4713'], // Tigers
  117: ['HOU', '18', '#002d62', '#eb6e1f'], // Astros
  118: ['KC', '7', '#004687', '#7ab2dd'], // Royals
  119: ['LAD', '19', '#005a9c', '#ffffff'], // Dodgers
  120: ['WSH', '20', '#ab0003', '#11225b'], // Nationals
  121: ['NYM', '21', '#002d72', '#ff5910'], // Mets
  133: ['ATH', '11', '#003831', '#efb21e'], // Athletics
  134: ['PIT', '23', '#000000', '#fdb827'], // Pirates
  135: ['SD', '25', '#2f241d', '#ffc425'], // Padres
  136: ['SEA', '12', '#005c5c', '#0c2c56'], // Mariners
  137: ['SF', '26', '#000000', '#fd5a1e'], // Giants
  138: ['STL', '24', '#be0a14', '#001541'], // Cardinals
  139: ['TB', '30', '#092c5c', '#8fbce6'], // Rays
  140: ['TEX', '13', '#003278', '#c0111f'], // Rangers
  141: ['TOR', '14', '#134a8e', '#6cace5'], // Blue Jays
  142: ['MIN', '9', '#031f40', '#e20e32'], // Twins
  143: ['PHI', '22', '#e81828', '#003278'], // Phillies
  144: ['ATL', '15', '#0c2340', '#ba0c2f'], // Braves
  145: ['CHW', '4', '#000000', '#c4ced4'], // White Sox
  146: ['MIA', '28', '#00a3e0', '#000000'], // Marlins
  147: ['NYY', '10', '#132448', '#c4ced4'], // Yankees
  158: ['MIL', '8', '#13294b', '#ffc72c'], // Brewers
};

// Old logos whose own colors their pixels would mislead about, by file: [color, second color] (an era not
// here takes its own logo's colors where it doesn't use today's)
export const ERA_COLORS: Record<string, [string, string]> = {
  // (the D-backs' first cap: a teal and copper A on purple; then Sedona red with sand, or black)
  'eras/109-1998.png': ['#5f259f', '#a7795b'],
  'eras/109-2007.png': ['#a71930', '#e3d4ad'],
  'eras/109-2016.png': ['#a71930', '#000000'],
  'eras/109-2020.png': ['#a71930', '#e3d4ad'],
};

// What the rules can't decide, checked by eye, by file (face: a color, or 'primary', the team's own toned
// for the board)
export const OVERRIDES: Record<string, TeamLookOverride> = {};
