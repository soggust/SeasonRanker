// Team colors as the game view draws them (ESPN's, made to read on the dark board), and a player card
// hero's

import { findEspnTeamId } from '@ranker/core/game-logs';
import { teamColor } from '../colors';

// The black-clad teams' second colors, for when ESPN names no alternate (the NHL's): by its abbreviation
export const BLACK_TEAMS: Record<string, string> = {
  BOS: 'ffb81c', // the Bruins' gold
  PIT: 'fcb514', // the Penguins' gold
  LA: 'a2aaad', // the Kings' silver
  ANA: 'f47a38', // the Ducks' orange
  VGK: 'b4975a', // the Golden Knights' gold
  LV: 'a5acaf', // the Raiders' silver
  SF: 'fd5a1e', // the Giants' orange
  CHW: 'c4ced4', // the White Sox's silver
  SA: 'c4ced4', // the Spurs' silver
};

// A team's color on the dark board, as everywhere in the app (colors.ts teamColor: its own, softened and
// lifted to read; a colorless black its alternate's color); a grey when it has none
export const NO_COLOR = '#8a8f8c';
export function gameColor(main: string | undefined, alt: string | undefined): string {
  return teamColor([main, alt]) ?? NO_COLOR;
}

// ESPN's colors for each team, by ESPN's id: [color, alternate, abbreviation]. Kept here because ESPN's
// team pages stopped letting the site ask (no CORS header on /teams and /teams/<id>; 2026-10-14)
const ESPN_COLORS: Record<string, Record<string, [string, string, string]>> = {
  'football/nfl': {
    '22': ['a40227', 'ffffff', 'ARI'],
    '1': ['a71930', '000000', 'ATL'],
    '33': ['29126f', '000000', 'BAL'],
    '2': ['00338d', 'd50a0a', 'BUF'],
    '29': ['0085ca', '000000', 'CAR'],
    '3': ['0b1c3a', 'e64100', 'CHI'],
    '4': ['fb4f14', '000000', 'CIN'],
    '5': ['472a08', 'ff3c00', 'CLE'],
    '6': ['002a5c', 'b0b7bc', 'DAL'],
    '7': ['0a2343', 'fc4c02', 'DEN'],
    '8': ['0076b6', 'bbbbbb', 'DET'],
    '9': ['204e32', 'ffb612', 'GB'],
    '34': ['021018', 'eb0028', 'HOU'],
    '11': ['003b75', 'ffffff', 'IND'],
    '30': ['007487', 'd7a22a', 'JAX'],
    '12': ['e31837', 'ffb612', 'KC'],
    '24': ['0080c6', 'ffc20e', 'LAC'],
    '14': ['003594', 'ffd100', 'LAR'],
    '13': ['000000', 'a5acaf', 'LV'],
    '15': ['008e97', 'fc4c02', 'MIA'],
    '16': ['4f2683', 'ffc62f', 'MIN'],
    '17': ['002a5c', 'c60c30', 'NE'],
    '18': ['d3bc8d', '000000', 'NO'],
    '19': ['003c7f', 'c9243f', 'NYG'],
    '20': ['115740', 'ffffff', 'NYJ'],
    '21': ['06424d', '000000', 'PHI'],
    '23': ['000000', 'ffb612', 'PIT'],
    '26': ['002a5c', '69be28', 'SEA'],
    '25': ['aa0000', 'b3995d', 'SF'],
    '27': ['bd1c36', '3e3a35', 'TB'],
    '10': ['4495d2', '001532', 'TEN'],
    '28': ['5a1414', 'ffb612', 'WSH'],
  },
  'basketball/nba': {
    '1': ['c8102e', 'fdb927', 'ATL'],
    '17': ['000000', 'ffffff', 'BKN'],
    '2': ['008348', 'ffffff', 'BOS'],
    '30': ['008ca8', '1d1060', 'CHA'],
    '4': ['ce1141', '000000', 'CHI'],
    '5': ['860038', 'bc945c', 'CLE'],
    '6': ['0064b1', 'bbc4ca', 'DAL'],
    '7': ['0e2240', 'fec524', 'DEN'],
    '8': ['1d428a', 'c8102e', 'DET'],
    '9': ['fdb927', '1d428a', 'GS'],
    '10': ['ce0e2d', '000000', 'HOU'],
    '11': ['0c2340', 'ffd520', 'IND'],
    '12': ['12173f', 'c8102e', 'LAC'],
    '13': ['552583', 'fdb927', 'LAL'],
    '29': ['5d76a9', '12173f', 'MEM'],
    '14': ['98002e', '000000', 'MIA'],
    '15': ['00471b', 'eee1c6', 'MIL'],
    '16': ['266092', '79bc43', 'MIN'],
    '3': ['0a2240', 'b4975a', 'NO'],
    '18': ['1d428a', 'f58426', 'NY'],
    '25': ['007ac1', 'ef3b24', 'OKC'],
    '19': ['0150b5', '9ca0a3', 'ORL'],
    '20': ['1d428a', 'e01234', 'PHI'],
    '21': ['29127a', 'e56020', 'PHX'],
    '22': ['e03a3e', '000000', 'POR'],
    '24': ['000000', 'c4ced4', 'SA'],
    '23': ['5a2d81', '6a7a82', 'SAC'],
    '28': ['d91244', '000000', 'TOR'],
    '26': ['4e008e', '79a3dc', 'UTAH'],
    '27': ['e31837', '002b5c', 'WSH'],
  },
  'baseball/mlb': {
    '29': ['aa182c', '000000', 'ARI'],
    '11': ['003831', 'efb21e', 'ATH'],
    '15': ['0c2340', 'ba0c2f', 'ATL'],
    '1': ['df4601', '000000', 'BAL'],
    '2': ['0d2b56', 'bd3039', 'BOS'],
    '16': ['0e3386', 'cc3433', 'CHC'],
    '4': ['000000', 'c4ced4', 'CHW'],
    '17': ['c6011f', 'ffffff', 'CIN'],
    '5': ['002b5c', 'e31937', 'CLE'],
    '27': ['33006f', '000000', 'COL'],
    '6': ['0a2240', 'ff4713', 'DET'],
    '18': ['002d62', 'eb6e1f', 'HOU'],
    '7': ['004687', '7ab2dd', 'KC'],
    '3': ['ba0021', 'c4ced4', 'LAA'],
    '19': ['005a9c', 'ffffff', 'LAD'],
    '28': ['00a3e0', '000000', 'MIA'],
    '8': ['13294b', 'ffc72c', 'MIL'],
    '9': ['031f40', 'e20e32', 'MIN'],
    '21': ['002d72', 'ff5910', 'NYM'],
    '10': ['132448', 'c4ced4', 'NYY'],
    '22': ['e81828', '003278', 'PHI'],
    '23': ['000000', 'fdb827', 'PIT'],
    '25': ['2f241d', 'ffc425', 'SD'],
    '12': ['005c5c', '0c2c56', 'SEA'],
    '26': ['000000', 'fd5a1e', 'SF'],
    '24': ['be0a14', '001541', 'STL'],
    '30': ['092c5c', '8fbce6', 'TB'],
    '13': ['003278', 'c0111f', 'TEX'],
    '14': ['134a8e', '6cace5', 'TOR'],
    '20': ['ab0003', '11225b', 'WSH'],
  },
  'hockey/nhl': {
    '25': ['fc4c02', '000000', 'ANA'],
    '1': ['231f20', 'fdb71a', 'BOS'],
    '2': ['00468b', 'fdb71a', 'BUF'],
    '7': ['e30426', '000000', 'CAR'],
    '29': ['002d62', 'e31937', 'CBJ'],
    '3': ['dd1a32', '000000', 'CGY'],
    '4': ['e31937', '000000', 'CHI'],
    '17': ['860038', '005ea3', 'COL'],
    '9': ['20864c', '000000', 'DAL'],
    '5': ['e30526', 'ffffff', 'DET'],
    '6': ['00205b', 'ff4c00', 'EDM'],
    '26': ['e51937', '002d62', 'FLA'],
    '8': ['121212', 'a2aaad', 'LA'],
    '30': ['124734', 'ae122a', 'MIN'],
    '10': ['c41230', '013a81', 'MTL'],
    '11': ['e30b2b', '000000', 'NJ'],
    '27': ['fdba31', '002d62', 'NSH'],
    '12': ['00529b', 'f47d31', 'NYI'],
    '13': ['0056ae', 'e51937', 'NYR'],
    '14': ['dd1a32', 'b79257', 'OTT'],
    '15': ['fe5823', '000000', 'PHI'],
    '16': ['000000', 'fdb71a', 'PIT'],
    '124292': ['000d33', 'a3dce4', 'SEA'],
    '18': ['00788a', '070707', 'SJ'],
    '19': ['0070b9', 'fdb71a', 'STL'],
    '20': ['003e7e', 'ffffff', 'TB'],
    '21': ['003e7e', 'ffffff', 'TOR'],
    '129764': ['000000', '7ab2e1', 'UTAH'],
    '22': ['003e7e', '008752', 'VAN'],
    '37': ['344043', 'b4975a', 'VGK'],
    '28': ['002d62', 'c41230', 'WPG'],
    '23': ['d71830', '0b1f41', 'WSH'],
  },
};

// A team's color as the game view draws it (ESPN's, made to read on the dark board), for a player card's
// hero: the team found by the names the row knows (its team's name, its own, its logo's file); null when
// it isn't found
export function heroColor(league: string, names: (string | undefined)[]): Promise<string | null> {
  const id = findEspnTeamId(league, names);
  const t = id === null ? undefined : ESPN_COLORS[league]?.[id];
  return Promise.resolve(t?.[0] ? gameColor(t[0], t[1] || BLACK_TEAMS[t[2]]) : null);
}
