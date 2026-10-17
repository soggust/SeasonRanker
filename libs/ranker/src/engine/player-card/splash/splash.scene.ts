// A card's splash, as data: from the card's season (its awards, how it ended, still being played or not) to its
// stage and props. No Angular here (the tests load it as it is); splash.component.ts gathers the input.
//
// Three stages, the same in every scene; only the props change. A season still being played is the LOCKER: a
// team's key players' lockers (splash.roster.ts picks them from the depth chart and the season's roster: the
// most popular on offense and defense, the first named in the middle; at least three, or no splash), each with
// his jersey, or a player's own stall with his jersey and his gear in it
// (the helmet, cap, glove or puck on its top shelf, the bats or stick leaning in the corner, the shoes and the
// game ball on the floor: PROPS[..].stall). A finished one is the SHELF: up to three props, the most meaningful
// in the middle, each at its real height (none taller than the one in the middle). A head coach's card, any
// season, is the OFFICE: his desk and nameplate, the whiteboard behind it (his record on it), the team's framed
// logo, the bookshelf; a finished season's honors (up to three) standing on the credenza.
//
// ---- The office's contract (SceneInput, a coach's card: coach: true)
//   name         the coach's, on the desk's nameplate
//   teamName     the framed logo's team (the logo itself is the card's)
//   record       his record that season ("10-7", "41-31-10": the card's wins, losses and ties), on the
//                whiteboard; a season being played shows it so far
//   seasonLabel  on the whiteboard's corner
//   awards       his: 'coy' (Coach of the Year, the Jack Adams) becomes the coach-of-year plaque; a title ('sb',
//                'cup', 'champ') the title trophy and its ring box; 'conf' the conference trophy
//   outcome      his team's (outcomes.json by the team's logo name): a champion's title when the awards don't
//                say so, the division banner, the playoff plaque, else the season plaque
//   current      a season being played: the room alone (no honors yet)
// Output: Scene { stage: 'office', items: his honors (lead first), office: { plate, team, record, board, frame } }
import { PROPS, Tier, centered, isPlaque, pickProps, stallPlace } from './splash.props';
import { HelmetLook } from './splash.uniforms';

// ---- What a season's outcome file says about a team (outcomes.json, a season's folder: by the team's logo name)
export interface Outcome {
  result: Tier; // champion, finalist (lost the final), playoffs, bubble (missed by a game), missed
  record?: string; // "10-7"
  seed?: number;
  division?: string | null; // the division it won ("AFC South")
  conference?: string; // its conference or league ("AFC", "Western", "AL")
  missedBy?: string; // "a game", "a tiebreaker"
  // the game it went out in (or won the title in): its round, the opponent, home or away (or at a neutral site:
  // a Super Bowl), the score (its own first), where and when
  lastGame?: { round: string; opp: string; home: boolean; neutral?: boolean; score: string; won?: boolean; date?: string; venue?: string };
  // a round it won on the way
  roundWon?: { round: string; result: string };
  confChamp?: boolean; // won its conference (reached the final)
  gameBall?: { title: string; line: string; tip: string }; // a champion's title game
}

// One piece as the stage draws it: its drawing, its words, its height (px, desktop), its name, its options
export interface Piece {
  t: string;
  lines?: string[];
  tip?: string;
  h?: number;
  wide?: boolean;
  line?: string; // a shoe's line
  num?: string; // a shoe's number
  helmet?: HelmetLook;
}

// A stall in the locker room: a jersey hung in it (a team's player, or the card's own player), or a prop hung on
// its hook (a fighter's belt); a player's own stall holds his gear too: on its top shelf, on its floor, leaning
// in its corner; its brass plate, its tape
export interface Stall {
  jersey?: { name: string; num: string; kit: 'home' | 'away' | 'alt' };
  item?: Piece;
  shelf?: Piece[];
  floor?: Piece[];
  corner?: Piece;
  plate?: string;
  num?: string;
  tape?: string;
  mine?: boolean;
  star?: boolean;
  wide?: boolean;
  tip: string;
}

// A coach's office: the desk's nameplate, the whiteboard (his record), the framed logo
export interface Office {
  plate: string;
  team: string;
  record: string;
  board: Piece;
  frame: Piece;
}

export interface Scene {
  stage: 'shelf' | 'locker' | 'office';
  items: Piece[]; // the shelf's props, in their places (the lead in the middle); the office's honors
  lead: number;
  stalls: Stall[];
  office?: Office;
  mark?: string; // the team's short name: a baseball jersey's wordmark across the chest
  label: string; // the splash's words for a screen reader
}

export interface RosterPlayer {
  name: string;
  pos: string;
  num?: string | null;
}

export interface SceneInput {
  sport: string;
  tab: string;
  id: string;
  season: number;
  seasonLabel: string; // "2023", "2023–24"
  current: boolean;
  team: boolean;
  coach?: boolean; // a head coach's card: the office
  name: string;
  teamName: string;
  abbr: string;
  awards: { id: string; title: string }[];
  outcome?: Outcome | null;
  number?: string | null; // his jersey number that season
  bestGame?: { title: string; line: string; tip: string } | null;
  milestone?: { big: string; small: string; tip: string } | null;
  tape?: string; // his line so far (a locker's tape)
  shoe?: { line: string; name: string } | null;
  roster?: RosterPlayer[]; // a team locker's players, the most important first
  division?: string; // a fighter's division
  record?: string;
  helmet?: HelmetLook;
}

// (what fills a hand-set shelf's gaps)
const FILLERS: Record<string, string[]> = { nfl: ['nfl-helmet'], nhl: ['puck'], nba: ['signature-shoe'], mlb: ['bats'], mma: ['fight-gloves'] };

// How tall the tallest prop stands (px, desktop): on the shelf, and inside a stall; and the most a real inch gets
const SHELF_MAX = 222;
const STALL_MAX = 150;
// (a coach's honors stand on the credenza, under the framed logo: a low shelf)
const OFFICE_MAX = 120;
const PX_PER_IN = 11;
// The shelf's hero (its lead, in the middle) is always its tallest prop: one beside it stands at most this much of
// the hero's height, whatever its own (a division banner, a golf bag, a Stanley Cup beside a Selke), and the scale
// is set by the hero, so it gets the room
const BESIDE_HERO = 0.85;

// ---- the words
// ("vs" at home and at a neutral site, a Super Bowl's "49ers vs KC"; "at" only on the road)
export const vsAt = (home: boolean | undefined, neutral?: boolean) => (home || neutral ? 'vs' : 'at');
const ROMAN: [number, string][] = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) (out += s), (n -= v);
  return out;
}

const AWARD_SHORT: Record<string, string> = { mvp: 'MVP', sbmvp: 'SB MVP', opoy: 'OPOY', dpoy: 'DPOY', oroy: 'OROY', droy: 'DROY', cpoy: 'CPOY' };
const PLAQUE: Record<string, [string, string?]> = {
  ap1: ['All-Pro', '1st Team'],
  ap2: ['All-Pro', '2nd Team'],
  pb: ['Pro Bowl'],
  nba1: ['All-NBA', '1st Team'],
  nba2: ['All-NBA', '2nd Team'],
  nba3: ['All-NBA', '3rd Team'],
  def1: ['All-Defense', '1st Team'],
  def2: ['All-Defense', '2nd Team'],
  as: ['All-Star'],
  roy: ['Rookie', 'of the Year'],
  dpoy: ['Defensive', 'Player of Year'],
  smoy: ['Sixth Man', 'of the Year'],
  mip: ['Most', 'Improved'],
  cpoy: ['Clutch', 'Player'],
  lindsay: ['Ted Lindsay', 'Award'],
  rocket: ['Rocket', 'Richard'],
  artross: ['Art Ross', 'Trophy'],
};
// (MLB's American League clubs, by the ids their logos are named for)
const AL = new Set(['108', '110', '111', '114', '116', '117', '118', '133', '136', '139', '140', '141', '142', '145', '147']);

// A template filled, the parts left empty dropped (" · " between them, no dangling words)
export function fill(t: string, fields: Record<string, string | undefined>): string {
  return t
    .split(' · ')
    .map((part) => {
      let missing = false;
      const out = part.replace(/\{(\w+)\}/g, (_, k: string) => {
        const v = fields[k];
        if (!v) missing = true;
        return v ?? '';
      });
      return missing && !out.replace(/[\s,.:()-]/g, '') ? '' : missing ? out.replace(/\s+,/g, ',').replace(/,\s*$/, '').trim() : out;
    })
    .filter(Boolean)
    .join(' · ');
}

function fieldsOf(s: SceneInput): Record<string, string | undefined> {
  const o = s.outcome ?? undefined;
  const has = (id: string) => s.awards.find((a) => a.id === id);
  const conf = has('conf') ?? has('pennant');
  const confText = o?.conference ?? conf?.title ?? '';
  const confShort = /\bAFC\b/.test(confText) ? 'AFC' : /\bNFC\b/.test(confText) ? 'NFC' : /West/.test(confText) ? 'West' : /East/.test(confText) ? 'East' : /American|\bAL\b/.test(confText) ? 'AL' : /National|\bNL\b/.test(confText) ? 'NL' : '';
  const league = s.sport === 'mlb' ? (AL.has(s.id.replace(/\D/g, '')) || AL.has(s.abbr) || confShort === 'AL' ? 'American League' : confShort === 'NL' || conf ? 'National League' : 'American League') : undefined;
  // (the NFL Honors award reads his best, as props.ts ranks it: the MVP, the Super Bowl MVP, then the rest)
  const honor = Object.keys(AWARD_SHORT).map((id) => s.awards.find((a) => a.id === id)).find(Boolean);
  const plaques = s.awards.filter((a) => isPlaque(s.sport, a.id));
  const plaque = (i: number) => {
    const a = plaques[i];
    if (!a) return [undefined, undefined];
    const p4p = /^p4p(\d+)$/.exec(a.id);
    if (p4p) return ['P4P', `No. ${p4p[1]}`];
    const [top, sub] = PLAQUE[a.id] ?? [a.title.replace(/^\S+\s+/, ''), undefined];
    return [top, sub ?? s.seasonLabel];
  };
  const [a1, a1sub] = plaque(0);
  const [a2, a2sub] = plaque(1);
  // (the coaches' award, by the name the sport gives it: "Coach of the Year", "Jack Adams Award")
  const coy = s.awards.find((a) => a.id === 'coy');
  const coyName = coy ? coy.title.replace(/^\S+\s+/, '').replace(/\s*\(.*$/, '') : undefined;
  const lg = o?.lastGame;
  const lostRound = lg && !lg.won ? lg.round : undefined;
  const match = lg ? `${s.teamName.split(' ').pop()} ${vsAt(lg.home, lg.neutral)} ${lg.opp}` : undefined;
  const final = lg && (o?.result === 'champion' || o?.result === 'finalist') ? `${lg.won ? 'W' : 'L'} ${lg.score} ${vsAt(lg.home, lg.neutral)} ${lg.opp}` : undefined;
  return {
    season: String(s.season),
    seasonLabel: s.seasonLabel,
    seasonShort: s.seasonLabel,
    seasonEnd: String(s.season),
    sb: s.sport === 'nfl' ? roman(s.season - 1965) : undefined,
    name: s.name,
    teamName: s.teamName,
    teamShort: s.teamName.split(' ').pop(),
    abbr: s.abbr,
    record: o?.record ?? s.record,
    conf: confShort,
    confShort,
    confName: /West/.test(confText) ? 'Western' : /East/.test(confText) ? 'Eastern' : confShort,
    // (the NBA's conference trophies by name: the Bob Cousy and Oscar Robertson trophies from 2022)
    confTrophy: s.sport === 'nba' ? (s.season >= 2022 ? (/West/.test(confText) ? 'the Oscar Robertson Trophy' : 'the Bob Cousy Trophy') : 'the conference trophy') : undefined,
    coyName,
    league,
    final,
    confFinal: undefined,
    division: o?.division ?? s.division ?? undefined,
    seed: o?.seed ? `No. ${o.seed} seed` : undefined,
    round: o?.roundWon?.round,
    roundResult: o?.roundWon?.result,
    lostRound,
    lostMatch: lostRound ? match : undefined,
    lostWhere: lostRound ? [lg?.venue, lg?.date].filter(Boolean).join(' · ') : undefined,
    lostScore: lostRound ? lg?.score : undefined,
    missedBy: o?.missedBy ?? 'a game',
    departs: lg?.date ?? `Jan ${s.season + 1}`,
    award: honor ? AWARD_SHORT[honor.id] : undefined,
    awardName: honor ? honor.title.replace(/^\S+\s+/, '').replace(/:.*$/, '') : undefined,
    a1,
    a1sub,
    a2,
    a2sub,
    plaquesTip: plaques.map((a) => a.title.replace(/^\S+\s+/, '')).join(' · '),
    gbTitle: s.bestGame?.title,
    gbLine: s.bestGame?.line,
    gbTip: s.bestGame?.tip,
    mbBig: s.milestone?.big,
    mbSmall: s.milestone?.small,
    mbTip: s.milestone?.tip,
    shoeTip: s.shoe ? `His signature shoe · ${s.shoe.name}` : 'His shoes',
    num: s.number ?? undefined,
  };
}

// (a props' conference trophy, by the conference it won)
function confProp(s: SceneInput, f: Record<string, string | undefined>): string | undefined {
  if (!s.awards.some((a) => a.id === 'conf' || a.id === 'pennant') && !s.outcome?.confChamp) return undefined;
  if (s.sport === 'nfl') return f['conf'] === 'AFC' ? 'nfl-afc-trophy' : 'nfl-nfc-trophy';
  if (s.sport === 'nhl') return f['confName'] === 'Western' ? 'nhl-campbell-bowl' : 'nhl-wales-trophy';
  if (s.sport === 'nba') return 'nba-conf-trophy';
  if (s.sport === 'mlb') return 'mlb-pennant';
  return undefined;
}

// The scene for a card's season (null: no splash for it)
export function buildScene(s: SceneInput): Scene | null {
  const f = fieldsOf(s);
  const awardIds = s.awards.map((a) => a.id);
  const o = s.outcome ?? undefined;
  const ids = pickProps({
    sport: s.sport,
    tab: s.tab,
    id: s.id,
    season: s.season,
    current: s.current,
    team: s.team,
    coach: s.coach,
    tier: o?.result,
    awards: awardIds,
    conf: confProp(s, f),
    division: !!o?.division,
    roundWon: !!o?.roundWon,
    lostGame: !!(o?.lastGame && !o.lastGame.won),
    shoe: !!s.shoe,
    milestone: !!s.milestone,
    gameBall: !!s.bestGame,
    plaques: awardIds.some((a) => isPlaque(s.sport, a)),
  });
  const locker = !s.coach && (s.current || s.sport === 'mma');
  // (a prop whose words the data doesn't have yet is left out: a hand-set list then filled from the rules)
  const ok = (id: string) => !!PROPS[id] && (!PROPS[id].needs || !!f[PROPS[id].needs!]);
  const defs = [...new Set([...ids.filter(ok), ...ids.filter((id) => !ok(id)).length ? FILLERS[s.sport] ?? [] : []])].filter(ok).slice(0, 3).map((id) => PROPS[id]);
  const inches = defs.map((d, i) => (!locker && i > 0 ? Math.min(d.inches, defs[0].inches * BESIDE_HERO) : d.inches));
  const scale = Math.min(PX_PER_IN, (s.coach ? OFFICE_MAX : locker ? STALL_MAX : SHELF_MAX) / Math.max(1, ...inches));
  const piece = (d: (typeof defs)[number], h: number): Piece => ({
    t: d.piece,
    lines: d.lines?.map((l) => fill(l, f)),
    tip: fill(d.tip, f),
    h,
    wide: d.wide,
    line: s.shoe?.line,
    num: s.number ?? undefined,
    helmet: s.helmet,
  });
  const pieces: Piece[] = defs.map((d, i) => piece(d, Math.round(inches[i] * scale)));

  if (s.coach) {
    // ---- the office
    // (his own record first, the coach's row's: a man hired in midseason owns only his games; the team's when
    // the row has none)
    const record = s.record ?? o?.record ?? '';
    const board = piece(PROPS['whiteboard'], 150);
    const frame = piece(PROPS['team-frame'], 70);
    return {
      stage: 'office',
      items: pieces,
      lead: 0,
      stalls: [],
      office: { plate: s.name, team: s.teamName, record, board, frame },
      label: `${s.name}'s office, ${s.seasonLabel}: ${[record && `${record} on the whiteboard`, ...pieces.map((p) => p.tip)].filter(Boolean).join('; ')}`,
    };
  }

  if (!locker) {
    if (!pieces.length) return null;
    const items = centered(pieces);
    return { stage: 'shelf', items, lead: pieces.length === 3 ? 1 : 0, stalls: [], label: `${s.team ? s.teamName || s.name : s.name}, ${s.seasonLabel}: ${pieces.map((p) => p.tip).join('; ')}` };
  }

  // ---- the locker
  const last = (name: string) => name.split(' ').slice(1).join(' ') || name;
  let stalls: Stall[];
  if (s.team) {
    // (a room with fewer than three jerseys isn't a locker room: no splash until the data fills it)
    const roster = (s.roster ?? []).slice(0, 7);
    if (roster.length < 3) return null;
    // (the first named, the key one, in the middle; the rest either side, the outermost on wide screens only)
    const order: RosterPlayer[] = [];
    roster.forEach((p, i) => (i % 2 ? order.push(p) : order.unshift(p)));
    const leadAt = order.indexOf(roster[0]);
    stalls = order.map((p, i) => ({
      jersey: { name: last(p.name), num: p.num ?? '', kit: i === leadAt ? 'home' : (i - leadAt) % 3 === 1 || (leadAt - i) % 3 === 2 ? 'away' : 'home' },
      // (a baseball jersey is drawn from the front, its wordmark on the chest: his name goes on the plate)
      plate: s.sport === 'mlb' ? `${p.pos} · ${last(p.name)}` : p.pos,
      star: i === leadAt,
      wide: Math.abs(i - leadAt) >= 3,
      tip: [p.name, p.pos, p.num ? `No. ${p.num}` : ''].filter(Boolean).join(' · '),
    }));
  } else {
    // (his own stall: his jersey on the hook, or a fighter's belt or gloves; his gear where each belongs, the
    // top shelf, the floor, the corner, at the stall's sizes: props.ts stall)
    const fighter = s.sport === 'mma';
    const mine: Stall = fighter
      ? { item: pieces[0], plate: last(s.name), tape: s.tape, mine: true, tip: pieces[0]?.tip ?? s.name }
      : { jersey: { name: last(s.name), num: s.number ?? '', kit: 'home' }, plate: last(s.name), num: s.number ?? undefined, tape: s.tape, mine: true, tip: s.name };
    const gear = ids.filter(ok).filter((id) => !(fighter && PROPS[id].piece === pieces[0]?.t));
    for (const id of gear) {
      const at = stallPlace(id);
      const it = piece(PROPS[id], at.h);
      if (at.place === 'shelf') (mine.shelf ??= []).push(it);
      else if (at.place === 'corner') mine.corner ??= it;
      else if (at.place === 'hook' && !mine.jersey && !mine.item) mine.item = it;
      else (mine.floor ??= []).push(it);
    }
    stalls = [mine];
  }
  const label = s.team
    ? `${s.teamName} locker room, ${s.seasonLabel}: ${stalls.map((st) => st.tip).join('; ')}`
    : `${s.name}'s locker, ${s.seasonLabel}: ${stalls.map((st) => st.tip).join('; ')}`;
  return { stage: 'locker', items: [], lead: 0, stalls, mark: s.teamName.split(' ').pop(), label };
}
