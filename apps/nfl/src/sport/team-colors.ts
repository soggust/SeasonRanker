// The NFL's team colors: what goes into each logo's look (libs/ranker/src/engine/team-look.ts, the one
// source of team colors). scripts/build-team-looks.mjs samples every logo, today's and each old era's, and
// works out its chip, rim, accent and washes from these into libs/ranker/src/engine/team-looks/nfl.json:
// run npm run team-looks after changing this file, a logo or logo-eras.ts (tests/team-looks.test.mjs fails
// until it's run).
import type { TeamLookOverride } from '@ranker/engine/team-look';

// Each team's logo (its file's name) -> [ESPN's abbreviation, ESPN's id, its color, its second color]
// (ESPN's color and alternateColor; the second is the chip's rim, and its face where the logo doesn't read
// on the first)
export const TEAMS: Record<string, [string, string, string, string]> = {
  '49ers': ['SF', '25', '#aa0000', '#b3995d'],
  Bears: ['CHI', '3', '#0b1c3a', '#e64100'],
  Bengals: ['CIN', '4', '#fb4f14', '#000000'],
  Bills: ['BUF', '2', '#00338d', '#d50a0a'],
  Broncos: ['DEN', '7', '#0a2343', '#fc4c02'],
  Browns: ['CLE', '5', '#472a08', '#ff3c00'],
  Bucs: ['TB', '27', '#bd1c36', '#3e3a35'],
  Cardinals: ['ARI', '22', '#a40227', '#ffffff'],
  Chargers: ['LAC', '24', '#0080c6', '#ffc20e'],
  Chiefs: ['KC', '12', '#e31837', '#ffb612'],
  Colts: ['IND', '11', '#003b75', '#ffffff'],
  Commanders: ['WSH', '28', '#5a1414', '#ffb612'],
  Cowboys: ['DAL', '6', '#002a5c', '#b0b7bc'],
  Dolphins: ['MIA', '15', '#008e97', '#fc4c02'],
  Eagles: ['PHI', '21', '#06424d', '#000000'],
  Falcons: ['ATL', '1', '#a71930', '#000000'],
  Giants: ['NYG', '19', '#003c7f', '#c9243f'],
  Jaguars: ['JAX', '30', '#007487', '#d7a22a'],
  Jets: ['NYJ', '20', '#115740', '#ffffff'],
  Lions: ['DET', '8', '#0076b6', '#bbbbbb'],
  Packers: ['GB', '9', '#204e32', '#ffb612'],
  Panthers: ['CAR', '29', '#0085ca', '#000000'],
  Patriots: ['NE', '17', '#002a5c', '#c60c30'],
  Raiders: ['LV', '13', '#000000', '#a5acaf'],
  Rams: ['LAR', '14', '#003594', '#ffd100'],
  Ravens: ['BAL', '33', '#29126f', '#000000'],
  Saints: ['NO', '18', '#d3bc8d', '#000000'],
  Seahawks: ['SEA', '26', '#002a5c', '#69be28'],
  Steelers: ['PIT', '23', '#000000', '#ffb612'],
  Texans: ['HOU', '34', '#021018', '#eb0028'],
  Titans: ['TEN', '10', '#4495d2', '#001532'],
  Vikings: ['MIN', '16', '#4f2683', '#ffc62f'],
};

// Old logos whose own colors their pixels would mislead about, by file: [color, second color] (none: an era
// not here takes its own logo's colors where it doesn't use today's)
export const ERA_COLORS: Record<string, [string, string]> = {};

// What the rules can't decide, checked by eye, by file (face: a color, or 'primary', the team's own toned
// for the board)
export const OVERRIDES: Record<string, TeamLookOverride> = {
  // (lettering drawn in white on their own blue or green, the way the teams use it)
  'Giants.png': { whiteLogo: true, face: '#0b2a63' },
  'Colts.png': { whiteLogo: true, face: 'primary' },
  'eras/Colts-1997.png': { whiteLogo: true, face: 'primary' },
  'eras/Colts-2002.png': { whiteLogo: true, face: 'primary' },
  'Jets.png': { whiteLogo: true, face: 'primary' },
  // (the star on its own navy, ringed in silver: on cream it was anyone's)
  'Cowboys.png': { face: 'primary', rim: '#b0b7bc' },
  'eras/Cowboys-1997.png': { face: 'primary', rim: '#b0b7bc' },
};
