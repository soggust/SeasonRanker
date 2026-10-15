// The NBA's team colors: what goes into each logo's look (libs/ranker/src/engine/team-look.ts, the one
// source of team colors). scripts/build-team-looks.mjs samples every logo, today's and each old era's, and
// works out its chip, rim, accent and washes from these into libs/ranker/src/engine/team-looks/nba.json:
// run npm run team-looks after changing this file, a logo or logo-eras.ts (tests/team-looks.test.mjs fails
// until it's run).
import type { TeamLookOverride } from '@ranker/engine/team-look';

// Each team's logo (its file's name: the franchise's code) -> [ESPN's abbreviation, ESPN's id, its color,
// its second color] (ESPN's color and alternateColor; the second is the chip's rim, and its face where the
// logo doesn't read on the first)
export const TEAMS: Record<string, [string, string, string, string]> = {
  ATL: ['ATL', '1', '#c8102e', '#fdb927'], // Atlanta Hawks
  BOS: ['BOS', '2', '#008348', '#ffffff'], // Boston Celtics
  BRK: ['BKN', '17', '#000000', '#ffffff'], // Brooklyn Nets
  CHI: ['CHI', '4', '#ce1141', '#000000'], // Chicago Bulls
  CHO: ['CHA', '30', '#008ca8', '#1d1060'], // Charlotte Hornets
  CLE: ['CLE', '5', '#860038', '#bc945c'], // Cleveland Cavaliers
  DAL: ['DAL', '6', '#0064b1', '#bbc4ca'], // Dallas Mavericks
  DEN: ['DEN', '7', '#0e2240', '#fec524'], // Denver Nuggets
  DET: ['DET', '8', '#1d428a', '#c8102e'], // Detroit Pistons
  GSW: ['GS', '9', '#fdb927', '#1d428a'], // Golden State Warriors
  HOU: ['HOU', '10', '#ce0e2d', '#000000'], // Houston Rockets
  IND: ['IND', '11', '#0c2340', '#ffd520'], // Indiana Pacers
  LAC: ['LAC', '12', '#12173f', '#c8102e'], // LA Clippers
  LAL: ['LAL', '13', '#552583', '#fdb927'], // Los Angeles Lakers
  MEM: ['MEM', '29', '#5d76a9', '#12173f'], // Memphis Grizzlies
  MIA: ['MIA', '14', '#98002e', '#000000'], // Miami Heat
  MIL: ['MIL', '15', '#00471b', '#eee1c6'], // Milwaukee Bucks
  MIN: ['MIN', '16', '#266092', '#79bc43'], // Minnesota Timberwolves
  NOP: ['NO', '3', '#0a2240', '#b4975a'], // New Orleans Pelicans
  NYK: ['NY', '18', '#1d428a', '#f58426'], // New York Knicks
  OKC: ['OKC', '25', '#007ac1', '#ef3b24'], // Oklahoma City Thunder
  ORL: ['ORL', '19', '#0150b5', '#9ca0a3'], // Orlando Magic
  PHI: ['PHI', '20', '#1d428a', '#e01234'], // Philadelphia 76ers
  PHO: ['PHX', '21', '#29127a', '#e56020'], // Phoenix Suns
  POR: ['POR', '22', '#e03a3e', '#000000'], // Portland Trail Blazers
  SAC: ['SAC', '23', '#5a2d81', '#6a7a82'], // Sacramento Kings
  SAS: ['SA', '24', '#000000', '#c4ced4'], // San Antonio Spurs
  TOR: ['TOR', '28', '#d91244', '#000000'], // Toronto Raptors
  UTA: ['UTAH', '26', '#4e008e', '#79a3dc'], // Utah Jazz
  WAS: ['WSH', '27', '#e31837', '#002b5c'], // Washington Wizards
};

// Old logos whose own colors their pixels would mislead about, by file: [color, second color] (an era not
// here takes its own logo's colors where it doesn't use today's)
export const ERA_COLORS: Record<string, [string, string]> = {
  // (the Jazz's navy and gold, then navy and light blue; the Rockets' red and silver)
  'eras/UTA-2017.png': ['#002b5c', '#f9a01b'],
  'eras/UTA-2005.png': ['#002b5c', '#6caedf'],
  'eras/HOU-2004.png': ['#ce1141', '#c4ced4'],
};

// What the rules can't decide, checked by eye, by file (face: a color, or 'primary', the team's own toned
// for the board)
export const OVERRIDES: Record<string, TeamLookOverride> = {
  // (white, not the ball's orange)
  'BOS.svg': { rim: '#e9ecef' },
  // (a white B on a black disc: a mid charcoal shows both)
  'BRK.svg': { face: '#4a4f54' },
};
