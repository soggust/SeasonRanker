// A team's look, the one source of team colors everywhere the site draws a team: the grid's team card and
// the searches' little ones, a player card's hero and its accent, the game view's two sides (their cards,
// the header's washes, the lines and the win probability), Compare's sides, the tracker, lists and the
// Community, and the bets' picks.
//
// Worked out ahead of time, logo by logo (scripts/build-team-looks.mjs: every logo file, today's and each
// old era's, sampled in a browser), into team-looks/<sport>.json. Each sport's team-colors.ts holds what
// goes in: ESPN's two colors for each team, the old eras' own colors, and the hand-checked overrides.
//
//   face     the chip behind the logo: the team's own color toned for the dark board when the logo reads on
//            it, else its curated second color, else cream or near-black (whichever the logo stands out on)
//   rim      the chip's ring: the team's curated second color (ESPN's alternate or the sport's own table),
//            never a color the logo happens to have in it (the Celtics' white, not the ball's orange)
//   accent   the team's own color made to show on the dark board (lines, a side's color, a card's panels)
//   accentSafe  the same, but never a red or a green (those say won and lost): beside a colored value, and
//            the bets' picks; the team's other color then, or a light neutral
//   other    its second color, made to show (a game's home side when the two teams' accents are too close)
//   deep     a deep tone of the team's own hue (a black or silver team's: charcoal)
//   hi, lo   a hero's wash: lighter at the outer edge (hi) darkening into the deep version of the same hue
//            (lo); never grey but for a black team, never another team's color
//   whiteLogo   the logo drawn in white on its face (the Giants' "ny", the Colts' horseshoe, the Jets')
//   logo     the logo's file that season (an old era's own; a hero's big faint watermark is it, drawn white)
import { distance, TOO_CLOSE } from './colors';
import nfl from './team-looks/nfl.json';
import nba from './team-looks/nba.json';
import nhl from './team-looks/nhl.json';
import mlb from './team-looks/mlb.json';
import mma from './team-looks/mma.json';

export interface TeamLook {
  // the logo's file under the sport's icons ("Bills.png", "eras/Bills-1997.png"); null for a team the
  // sport's looks don't have
  key: string | null;
  logo: string | null;
  face: string;
  rim: string;
  whiteLogo: boolean;
  accent: string;
  accentSafe: string;
  other: string;
  deep: string;
  hi: string;
  lo: string;
  // its CSS custom properties, for a [style] binding: a chip's (--team-badge its face, --team-rim, --team-tint
  // its hue for a wash or a disc), a hero's (those, its wash's two ends and its panels' accent)
  chip: Record<string, string>;
  hero: Record<string, string>;
}

// What a sport's team-colors.ts can set by hand for one logo file (its key: "Giants.png",
// "eras/UTA-2017.png"): the team's two colors that era, the chip's face ('primary': the team's own color
// toned for the board, whether the logo reads on it or not) or rim, and its logo drawn white
export interface TeamLookOverride {
  primary?: string;
  alt?: string;
  face?: string;
  rim?: string;
  whiteLogo?: boolean;
}

// (the generated file: each look's colors in its fields' order, then 1 for a white logo; each current logo's
// team by ESPN's abbreviation and id, and its old eras' files by season)
interface LooksFile {
  dir: string;
  fields: string[];
  teams: Record<string, { abbr?: string; id?: string; eras?: [number, number, string][] }>;
  looks: Record<string, (string | number)[]>;
  default?: (string | number)[];
}

const FILES: Record<string, LooksFile> = { nfl, nba, nhl, mlb, mma } as unknown as Record<string, LooksFile>;

// A team the site doesn't know: a quiet charcoal card, a grey rim, the board's light grey for its lines
type Colors = Omit<TeamLook, 'key' | 'logo' | 'chip' | 'hero'>;
const NEUTRAL: Colors = {
  face: '#2c3330',
  rim: '#8a8f8c',
  whiteLogo: false,
  accent: '#b9c2bf',
  accentSafe: '#b9c2bf',
  other: '#8a8f8c',
  deep: '#2a2f2e',
  hi: '#5f6362',
  lo: '#1b1b1b',
};

// A team's ESPN identity, for the views that know it only by ESPN's (the game view, the bets)
export interface EspnTeam {
  id?: string | number | null;
  abbr?: string | null;
}

// (each sport's looks, built once: by key, and each ESPN id and abbreviation to its team's key)
interface SportLooks {
  file: LooksFile;
  byEspn: Map<string, string>;
  cache: Map<string, TeamLook>;
}
const sports = new Map<string, SportLooks>();
function sportLooks(sport: string): SportLooks | null {
  let s = sports.get(sport);
  if (!s) {
    const file = FILES[sport];
    if (!file) return null;
    const byEspn = new Map<string, string>();
    for (const [key, team] of Object.entries(file.teams)) {
      if (team.id) byEspn.set(`#${team.id}`, key);
      if (team.abbr) byEspn.set(team.abbr, key);
    }
    s = { file, byEspn, cache: new Map() };
    sports.set(sport, s);
  }
  return s;
}

// "assets/NFL_Icons/eras/Bills-1997.png" -> "eras/Bills-1997.png" (a key as it is stays as it is)
function keyOf(file: LooksFile, logo: string): string {
  const at = logo.indexOf(file.dir);
  return at >= 0 ? logo.slice(at + file.dir.length) : logo.replace(/^.*_Icons\//, '');
}

// A team's look: by its logo (a row's teamLogo, today's or an old era's) or by ESPN's id or abbreviation;
// with a season, that season's era (a team's old logo and its own colors). A team the sport's looks don't
// have: a neutral look (MMA: its one look for every fighter's flag).
export function teamLook(sport: string, team: string | EspnTeam | null | undefined, season?: number | null): TeamLook {
  const s = sportLooks(sport);
  if (!s || !team) return neutral(s, null);
  let key: string | undefined;
  if (typeof team === 'string') {
    key = keyOf(s.file, team);
    if (!s.file.looks[key]) key = s.byEspn.get(team);
  } else {
    key = (team.id !== null && team.id !== undefined ? s.byEspn.get(`#${team.id}`) : undefined) ?? (team.abbr ? s.byEspn.get(team.abbr) : undefined);
  }
  if (!key || !s.file.looks[key]) return neutral(s, typeof team === 'string' ? team : null);
  // (that season's logo: an era's file when one covers it)
  if (season) {
    const era = s.file.teams[key]?.eras?.find(([from, to]) => season >= from && season <= to);
    if (era) key = era[2];
  }
  let look = s.cache.get(key);
  if (!look) {
    look = styled({ key, logo: s.file.dir + key, ...unpack(s.file, s.file.looks[key]) });
    s.cache.set(key, look);
  }
  return look;
}

function unpack(file: LooksFile, row: (string | number)[]): Colors {
  const look = { ...NEUTRAL } as Record<string, string | boolean>;
  file.fields.forEach((field, i) => (look[field] = row[i] as string));
  look['whiteLogo'] = row[file.fields.length] === 1;
  return look as unknown as Colors;
}

const NEUTRAL_LOOK = styled({ key: null, logo: null, ...NEUTRAL });
function neutral(s: SportLooks | null, logo: string | null): TeamLook {
  if (!s) return NEUTRAL_LOOK;
  // (one each: the sport's own, and each logo it doesn't know)
  const kept = s.cache.get(`?${logo}`);
  if (kept) return kept;
  const base = s.file.default ? unpack(s.file, s.file.default) : NEUTRAL;
  const look = styled({ key: null, logo, ...base });
  s.cache.set(`?${logo}`, look);
  return look;
}

// (a look with its CSS: a chip's face, rim and tint (the team's hue, for a wash or a disc behind a face, never
// the face itself: a cream face would wash a panel cream); a hero's wash ends and its panels' accent too)
function styled(look: Omit<TeamLook, 'chip' | 'hero'>): TeamLook {
  const chip = { '--team-badge': look.face, '--team-rim': look.rim, '--team-tint': look.hi };
  return { ...look, chip, hero: { ...chip, '--team-hi': look.hi, '--team-lo': look.lo, '--team-accent': look.accentSafe } };
}

// Two sides' colors (a game's away and home): each its accent, the home side its other color when the
// two accents are too close to tell apart (the Panthers' red and the Hurricanes'), or failing that a soft
// blue or gold (two teams the site doesn't know: an All-Star game's)
export function sideColors(away: TeamLook, home: TeamLook): [string, string] {
  const choices = [home.accent, home.other, '#8ab4e0', '#e3cb8f'];
  return [away.accent, choices.find((c) => distance(away.accent, c) >= TOO_CLOSE) ?? home.accent];
}
