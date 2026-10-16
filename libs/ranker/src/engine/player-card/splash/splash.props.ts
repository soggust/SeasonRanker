// The splash's props, and which a season gets. A prop is any one object on the stage (a trophy, a plaque, a
// ball, the beach kit). Each is drawn by a piece (splash-piece.component.html, by its `piece`) and sized by its
// real height, so props stand in true proportion to each other (but none over the shelf's hero, the one in
// the middle: scene.ts BESIDE_HERO); its words and its hover are templates over the
// scene's fields ({season}, {final}, ...; scene.ts fills them). No Angular here: the tests load it as it is.
//
//   piece     the drawing (one per real object; several props can share one: the two conference trophies)
//   inches    its height as it stands: the real object's (the Stanley Cup 35.25", the Lombardi 22"); paper and
//             small things as displayed (a ticket stub in its frame, a ball on its stand)
//   lines     its engraving or printed words
//   tip       its name on hover (and on a tap)
//   wide      a phone shows it only when there's room

export interface PropDef {
  piece: string;
  inches: number;
  lines?: string[];
  tip: string;
  wide?: boolean;
  needs?: string; // a field it can't go without (the prop is left out until the data has it)
}

export const PROPS: Record<string, PropDef> = {
  // ---- NFL
  'nfl-lombardi': { piece: 'lombardi', inches: 22, lines: ['{sb}'], tip: 'Super Bowl {sb} champions · the Vince Lombardi Trophy · {final}' },
  'nfl-afc-trophy': { piece: 'conf', inches: 17, lines: ['AFC', 'AFC'], tip: 'AFC champions · the Lamar Hunt Trophy · {confFinal}' },
  'nfl-nfc-trophy': { piece: 'conf', inches: 17, lines: ['NFC', 'NFC'], tip: 'NFC champions · the George Halas Trophy · {confFinal}' },
  'nfl-honors': { piece: 'honors', inches: 21, lines: ['{award}', '{season}'], tip: '{awardName} · {name}, {season}' },
  'nfl-helmet': { piece: 'helmet', inches: 16, tip: '{teamName} helmet · {seasonLabel}' },
  'deflated-football': { piece: 'deflated', inches: 13, tip: 'A football, a little under 12.5 PSI' },
  'game-ball': { piece: 'gameball', inches: 13, lines: ['{gbTitle}', '{gbLine}'], tip: 'Game ball · {gbTip}', needs: 'gbTitle' },
  // ---- NHL
  'nhl-stanley-cup': { piece: 'stanley', inches: 35.25, lines: ['{teamShort} {seasonEnd}'], tip: 'Stanley Cup champions · {final}' },
  'nhl-wales-trophy': { piece: 'wales', inches: 30, tip: 'Eastern Conference champions · the Prince of Wales Trophy · {confFinal}' },
  'nhl-campbell-bowl': { piece: 'campbell', inches: 28, tip: 'Western Conference champions · the Clarence Campbell Bowl · {confFinal}' },
  'nhl-hart': { piece: 'hart', inches: 30, tip: 'Hart Trophy (MVP) · {name}' },
  'nhl-selke': { piece: 'selke', inches: 18, tip: 'Selke Trophy (best defensive forward) · {name}' },
  'nhl-conn-smythe': { piece: 'smythe', inches: 26, tip: 'Conn Smythe Trophy (playoff MVP) · {name}' },
  'nhl-calder': { piece: 'calder', inches: 26, tip: 'Calder Trophy (rookie of the year) · {name}' },
  'nhl-vezina': { piece: 'vezina', inches: 28, tip: 'Vezina Trophy (goaltender) · {name}' },
  'nhl-norris': { piece: 'norris', inches: 32, tip: 'Norris Trophy (defenseman) · {name}' },
  'puck': { piece: 'puck', inches: 8, lines: ['', '{seasonShort}'], tip: '{teamName} · {seasonLabel}' },
  // ---- NBA
  'nba-obrien': { piece: 'obrien', inches: 24, lines: ['{seasonEnd} Champions'], tip: "NBA champions · the Larry O'Brien Trophy · {final}" },
  'nba-jordan-mvp': { piece: 'mjmvp', inches: 23.6, tip: 'NBA MVP · the Michael Jordan Trophy · {seasonLabel}' },
  'nba-conf-trophy': { piece: 'obrien', inches: 20, lines: ['{confName} Champions'], tip: '{confName} Conference champions · {confFinal}' },
  'signature-shoe': { piece: 'shoe', inches: 9, tip: '{shoeTip}' },
  'nba-game-ball': { piece: 'bball', inches: 13, lines: ['{gbTitle}', '{gbLine}'], tip: 'Game ball · {gbTip}', needs: 'gbTitle' },
  // ---- MLB
  'mlb-commissioners-trophy': { piece: 'commish', inches: 24, lines: ['{season}'], tip: "World Series champions · the Commissioner's Trophy · {final}" },
  'mlb-pennant': { piece: 'pennant', inches: 14, lines: ['{league} Champions', '{season}'], tip: '{league} pennant · {confFinal}' },
  'mlb-mvp': { piece: 'mlbmvp', inches: 18, lines: ['{league}', '{name}'], tip: '{league} MVP · {name}' },
  'mlb-cy-young': { piece: 'cyyoung', inches: 17, lines: ['{name}', '{league}', '{season}'], tip: 'Cy Young Award · {name}, {season}' },
  'mlb-gold-glove': { piece: 'goldglove', inches: 16, tip: 'Gold Glove · {name}, {season}' },
  'mlb-silver-slugger': { piece: 'silverslugger', inches: 40, tip: 'Silver Slugger · {name}, {season}' },
  'milestone-ball': { piece: 'baseball', inches: 10, lines: ['{mbBig}', '{mbSmall}'], tip: '{mbTip}', needs: 'mbBig' },
  'bats': { piece: 'bats', inches: 34, tip: 'His bats' },
  'fielders-glove': { piece: 'glove', inches: 12, tip: 'His glove' },
  // ---- MMA
  'title-belt': { piece: 'belt', inches: 11, tip: '{division} champion' },
  'fight-gloves': { piece: 'gloves', inches: 10, tip: 'His gloves · {record}' },
  // ---- every sport: honors on plaques (All-Pro, All-NBA, All-Star, P4P...), a playoff run, where it ended
  'honors-plaques': { piece: 'plaques', inches: 13, lines: ['{a1}', '{a1sub}', '{a2}', '{a2sub}'], tip: '{plaquesTip}', needs: 'a1' },
  'playoff-medal': { piece: 'medal', inches: 15, lines: ['{confShort} Playoffs', '{seasonShort}'], tip: 'Made the playoffs · {seasonLabel}' },
  'round-plaque': { piece: 'plaque', inches: 16, lines: ['{round}', '{roundResult}'], tip: 'Won the {round} round · {roundResult}', needs: 'round' },
  'division-banner': { piece: 'banner', inches: 28, lines: ['{division}', 'Champions', '{seasonShort}'], tip: '{division} champions · {record}', needs: 'division' },
  'ticket-stub': { piece: 'stub', inches: 15, lines: ['{lostRound}', '{lostMatch}', '{lostWhere}', '{lostScore}'], tip: 'Where it ended · {lostRound}, {lostScore}', needs: 'lostRound' },
  'season-plaque': { piece: 'plaque', inches: 16, lines: ['{seasonLabel}', '{record}'], tip: '{teamName} · {seasonLabel}' },
  // ---- the season that ended early
  'boarding-pass': { piece: 'pass', inches: 18, lines: ['{teamName}', '{abbr}', 'CUN', '{departs}', '{record}'], tip: 'Missed the playoffs · {record}' },
  'beach-towel': { piece: 'towel', inches: 7, tip: 'Beach towel, packed early', wide: true },
  'sunscreen': { piece: 'sunscreen', inches: 12, tip: 'SPF 50, off-season formula' },
  'scorecard': { piece: 'scorecard', inches: 16, lines: ['{teamName}', '{record}', 'Eliminated on the final weekend', 'Missed by {missedBy}'], tip: 'Missed the playoffs by {missedBy} · {record}' },
  'golf-bag': { piece: 'golfbag', inches: 34, tip: 'First team out · {record}' },
  'golf-ball': { piece: 'golfball', inches: 7, tip: 'Tee time · {departs}', wide: true },
};

// ---- Hand-set props for one season: an easter egg, a moment the data can't see. Keyed
// '<sport>:<tab>:<card id>:<season>' (the card's id as its tab has it: a QB's 'QB-<ESPN id>', a team's
// 'TM-<logo name>'), checked before the rules. The first is the scene's centerpiece.
export const SCENE_OVERRIDES: Record<string, string[]> = {
  // (Deflategate: the 2015 season opened with his suspension overturned)
  'nfl:QB:QB-2330:2015': ['deflated-football', 'honors-plaques', 'ticket-stub'],
};

// ---- A season's facts (what the rules read): its outcome, its awards, still being played or not
export type Tier = 'champion' | 'finalist' | 'playoffs' | 'bubble' | 'missed' | 'unknown';
export interface Facts {
  sport: string;
  tab: string;
  id: string;
  season: number;
  current: boolean; // still being played: the locker
  team: boolean; // a team's card (its own tab: TM, DEF, OL)
  tier?: Tier; // how a finished team season ended (the outcomes data; the title and conference from awards)
  awards: string[]; // its awards by the sport's ids, as the card has them
  conf?: string; // the conference trophy's prop, when it won its conference
  division?: boolean; // won its division
  roundWon?: boolean; // won a playoff round before going out
  lostGame?: boolean; // the game it went out in is known (the ticket stub)
  shoe?: boolean; // a signature shoe line
  milestone?: boolean; // a milestone ball
  gameBall?: boolean; // a best game on record
  plaques?: boolean; // honors that go on plaques
}

// The sport's title trophy, and each award as a prop (the first a season has leads); plaque honors are counted
// apart (facts.plaques)
const TITLE: Record<string, string> = { nfl: 'nfl-lombardi', nhl: 'nhl-stanley-cup', nba: 'nba-obrien', mlb: 'mlb-commissioners-trophy' };
const TITLE_AWARD: Record<string, string> = { nfl: 'sb', nhl: 'cup', nba: 'champ', mlb: 'ws' };
export const AWARD_PROP: Record<string, string> = {
  'nfl:mvp': 'nfl-honors',
  'nfl:opoy': 'nfl-honors',
  'nfl:dpoy': 'nfl-honors',
  'nfl:oroy': 'nfl-honors',
  'nfl:droy': 'nfl-honors',
  'nfl:cpoy': 'nfl-honors',
  'nfl:sbmvp': 'nfl-honors',
  'nhl:hart': 'nhl-hart',
  'nhl:conn': 'nhl-conn-smythe',
  'nhl:vezina': 'nhl-vezina',
  'nhl:norris': 'nhl-norris',
  'nhl:calder': 'nhl-calder',
  'nhl:selke': 'nhl-selke',
  'nba:mvp': 'nba-jordan-mvp',
  'mlb:mvp': 'mlb-mvp',
  'mlb:cy': 'mlb-cy-young',
  'mlb:ss': 'mlb-silver-slugger',
  'mlb:gg': 'mlb-gold-glove',
};
// (honors that go on the plaques: a sport's all-league teams, all-stars, the smaller awards)
export const PLAQUE_AWARDS = new Set(['ap1', 'ap2', 'pb', 'nba1', 'nba2', 'nba3', 'def1', 'def2', 'as', 'roy', 'smoy', 'mip', 'lindsay', 'rocket', 'artross']);
export const isPlaque = (sport: string, award: string) => PLAQUE_AWARDS.has(award) || (sport === 'nba' && (award === 'dpoy' || award === 'cpoy')) || /^p4p\d+$/.test(award);

// Each sport's gear: a player's own things (his locker's, and a finished season's filler)
const GEAR: Record<string, string[]> = {
  nfl: ['nfl-helmet', 'game-ball'],
  nba: ['signature-shoe', 'nba-game-ball'],
  mlb: ['bats', 'fielders-glove'],
  nhl: ['puck'],
  mma: ['fight-gloves'],
};

const unique = (ids: (string | false | null | undefined)[], max = 3) => [...new Set(ids.filter((x): x is string => !!x))].slice(0, max);

// ---- The order props are picked (and centered) in, every sport and card: the owner's ranking.
//   1 the title (the Lombardi, the Stanley Cup, the Larry O'Brien, the Commissioner's Trophy, a fighter's belt)
//   2 the MVP (the league's, then the final's: the Super Bowl MVP, the Conn Smythe)
//   3 the major personal awards (OPOY, DPOY, the rookies', Cy Young, Selke, Norris, Vezina, Calder, Gold
//     Glove, Silver Slugger), then the plaques when they hold one (All-Pro, All-NBA, the Art Ross...)
//   4 the conference title (the Lamar Hunt and Halas, the Wales and Campbell, the NBA's, the pennant)
//   5 the playoffs (the division banner, the ticket stub, a won round's plaque, the medal)
//   6 the game ball, a milestone ball (and the plaques when they hold only a Pro Bowl or All-Star)
//   7 his gear (a helmet, bats, a shoe, a puck, his gloves): a filler
// Within a tier, the order they come in. The kits (Cancún, the golf course) only when nothing from 1-5 is there.
const MVP_AWARDS = new Set(['mvp', 'hart']);
const FINAL_MVP_AWARDS = new Set(['sbmvp', 'conn']);
const MINOR_PLAQUES = new Set(['pb', 'as']);
const PLAYOFF_PROPS = new Set(['division-banner', 'ticket-stub', 'round-plaque', 'playoff-medal', 'season-plaque']);
const CONF_PROPS = new Set(['nfl-afc-trophy', 'nfl-nfc-trophy', 'nhl-wales-trophy', 'nhl-campbell-bowl', 'nba-conf-trophy', 'mlb-pennant']);
const FUN_PROPS = new Set(['game-ball', 'nba-game-ball', 'milestone-ball', 'deflated-football']);

// (a prop's rank: its tier, a tenth below for the final's MVP and for plaques after the trophies)
export function propRank(id: string, f: Pick<Facts, 'sport' | 'awards'>): number {
  if (id === TITLE[f.sport] || id === 'title-belt') return 1;
  // (the trophy an award is drawn as; the NFL's one Honors award reads the season's first, so ranks by its best)
  const awards = f.awards.filter((a) => AWARD_PROP[`${f.sport}:${a}`] === id);
  if (awards.length) return awards.some((a) => MVP_AWARDS.has(a)) ? 2 : awards.some((a) => FINAL_MVP_AWARDS.has(a)) ? 2.1 : 3;
  if (id === 'honors-plaques') return f.awards.some((a) => isPlaque(f.sport, a) && !MINOR_PLAQUES.has(a)) ? 3.1 : 6.1;
  if (CONF_PROPS.has(id)) return 4;
  if (PLAYOFF_PROPS.has(id)) return 5;
  if (FUN_PROPS.has(id)) return 6;
  return 7;
}

// (the candidates in the owner's order: stable, so a tier keeps the order they came in)
const ranked = (ids: (string | false | null | undefined)[], f: Facts) =>
  unique(ids, 99)
    .map((id, i) => ({ id, i, r: propRank(id, f) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);

// The rules: a season's 1-3 props, the most meaningful first (it stands in the middle), in the owner's order
// (propRank). A hand-set season wins as written; a fighter's stall holds his belt, or his gloves; a season still
// being played has his gear and no trophies (a team's locker is its players' jerseys); a finished one shows what
// it won, then how it ended.
export function pickProps(f: Facts): string[] {
  const hand = SCENE_OVERRIDES[`${f.sport}:${f.tab}:${f.id}:${f.season}`];
  if (hand) return hand.slice(0, 3);
  const has = (id: string) => f.awards.includes(id);
  const trophies = f.awards.map((a) => AWARD_PROP[`${f.sport}:${a}`]).filter(Boolean);
  const title = has(TITLE_AWARD[f.sport]) || (f.team && f.tier === 'champion') ? TITLE[f.sport] : undefined;
  const gear = (GEAR[f.sport] ?? []).filter((g) => !g.includes('game-ball') || f.gameBall);

  if (f.sport === 'mma') {
    // (his stall holds the belt, or his gloves when he has none; his honors beside it)
    const own = has('champ') ? 'title-belt' : 'fight-gloves';
    return unique([own, ...ranked([f.plaques && 'honors-plaques', 'fight-gloves'], f)]);
  }
  if (f.current) return f.team ? [] : unique(gear);

  // what the season won (tiers 1-4), and then how it ended (5) or his things (6-7)
  const honors = [title, ...trophies, f.plaques && 'honors-plaques', f.conf];
  if (f.team) {
    const tier: Tier = title ? 'champion' : f.conf ? 'finalist' : f.tier ?? 'unknown';
    const won = ranked(honors, f).filter((id) => propRank(id, f) < 5);
    switch (tier) {
      case 'champion':
        return ranked([...won, f.division && 'division-banner', 'playoff-medal', f.gameBall && 'game-ball'], f).slice(0, 3);
      case 'finalist':
        return ranked([...won, f.lostGame ? 'ticket-stub' : 'playoff-medal', f.division && 'division-banner'], f).slice(0, 3);
      case 'playoffs':
        return ranked([...won, f.division ? 'division-banner' : f.lostGame ? 'ticket-stub' : 'playoff-medal', f.lostGame && 'ticket-stub', f.roundWon && 'round-plaque', 'playoff-medal'], f).slice(0, 3);
      case 'bubble':
        return won.length ? ranked([...won, 'season-plaque'], f).slice(0, 3) : ['scorecard', 'golf-bag', 'golf-ball'];
      case 'missed':
        return won.length ? ranked([...won, 'season-plaque'], f).slice(0, 3) : ['boarding-pass', 'beach-towel', 'sunscreen'];
      default:
        return ranked([...won, 'season-plaque', f.sport === 'nfl' ? 'nfl-helmet' : f.sport === 'nhl' && 'puck'], f).slice(0, 3);
    }
  }
  // a player's finished season: the title if his team won it, his trophies, his plaques, his conference's, then
  // his milestone, his game ball and his gear
  return ranked([...honors, f.milestone && 'milestone-ball', f.shoe && 'signature-shoe', ...gear], f).slice(0, 3);
}

// The stage's order: the lead in the middle, the next either side (one or two props: as they come)
export function centered<T>(items: T[]): T[] {
  return items.length === 3 ? [items[1], items[0], items[2]] : items;
}
