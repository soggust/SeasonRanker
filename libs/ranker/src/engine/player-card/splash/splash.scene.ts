// A card's splash, as data: from the card's season (its awards, how it ended, still being played or not) to its
// stage and props. No Angular here (the tests load it as it is); splash.component.ts gathers the input.
//
// Two stages, the same in every scene; only the props change. A season still being played is the LOCKER: a
// team's key players' lockers, each with his jersey, or a player's own locker beside his gear. A finished one
// is the SHELF: up to three props, the most meaningful in the middle, each at its real height (none taller than
// the one in the middle).
import { PROPS, Tier, centered, isPlaque, pickProps } from './splash.props';
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

// A stall in the locker room: a jersey hung in it (a team's player, or the card's own player), or a prop standing
// in it; its brass plate, its tape
export interface Stall {
  jersey?: { name: string; num: string; kit: 'home' | 'away' | 'alt' };
  item?: Piece;
  plate?: string;
  num?: string;
  tape?: string;
  mine?: boolean;
  star?: boolean;
  wide?: boolean;
  tip: string;
}

export interface Scene {
  stage: 'shelf' | 'locker';
  items: Piece[]; // the shelf's props, in their places (the lead in the middle)
  lead: number;
  stalls: Stall[];
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
  const locker = s.current || s.sport === 'mma';
  // (a prop whose words the data doesn't have yet is left out: a hand-set list then filled from the rules)
  const ok = (id: string) => !!PROPS[id] && (!PROPS[id].needs || !!f[PROPS[id].needs!]);
  const defs = [...new Set([...ids.filter(ok), ...ids.filter((id) => !ok(id)).length ? FILLERS[s.sport] ?? [] : []])].filter(ok).slice(0, 3).map((id) => PROPS[id]);
  const inches = defs.map((d, i) => (!locker && i > 0 ? Math.min(d.inches, defs[0].inches * BESIDE_HERO) : d.inches));
  const scale = Math.min(PX_PER_IN, (locker ? STALL_MAX : SHELF_MAX) / Math.max(1, ...inches));
  const pieces: Piece[] = defs.map((d, i) => ({
    t: d.piece,
    lines: d.lines?.map((l) => fill(l, f)),
    tip: fill(d.tip, f),
    h: Math.round(inches[i] * scale),
    wide: d.wide,
    line: s.shoe?.line,
    num: s.number ?? undefined,
    helmet: s.helmet,
  }));

  if (!locker) {
    if (!pieces.length) return null;
    const items = centered(pieces);
    return { stage: 'shelf', items, lead: pieces.length === 3 ? 1 : 0, stalls: [], label: `${s.teamName || s.name}, ${s.seasonLabel}: ${pieces.map((p) => p.tip).join('; ')}` };
  }

  // ---- the locker
  const last = (name: string) => name.split(' ').slice(1).join(' ') || name;
  let stalls: Stall[];
  if (s.team) {
    const roster = (s.roster ?? []).slice(0, 7);
    if (!roster.length) return null;
    // (the first named, the key one, in the middle; the rest either side, the outermost on wide screens only)
    const order: RosterPlayer[] = [];
    roster.forEach((p, i) => (i % 2 ? order.push(p) : order.unshift(p)));
    const leadAt = order.indexOf(roster[0]);
    stalls = order.map((p, i) => ({
      jersey: { name: last(p.name), num: p.num ?? '', kit: i === leadAt ? 'home' : (i - leadAt) % 3 === 1 || (leadAt - i) % 3 === 2 ? 'away' : 'home' },
      plate: p.pos,
      star: i === leadAt,
      wide: Math.abs(i - leadAt) >= 3,
      tip: [p.name, p.pos, p.num ? `No. ${p.num}` : ''].filter(Boolean).join(' · '),
    }));
  } else {
    // (his stall: his jersey; a fighter's holds the belt, or his gloves; his other things either side)
    const fighter = s.sport === 'mma';
    const mine: Stall = fighter
      ? { item: pieces[0], plate: last(s.name), tape: s.tape, mine: true, tip: pieces[0]?.tip ?? s.name }
      : { jersey: { name: last(s.name), num: s.number ?? '', kit: 'home' }, plate: last(s.name), num: s.number ?? undefined, tape: s.tape, mine: true, tip: s.name };
    const rest = (fighter ? pieces.slice(1) : pieces).map((it) => ({ item: it, tip: it.tip ?? '' }) as Stall);
    stalls = [rest[0], mine, ...rest.slice(1)].filter(Boolean);
  }
  const label = s.team
    ? `${s.teamName} locker room, ${s.seasonLabel}: ${stalls.map((st) => st.tip).join('; ')}`
    : `${s.name}'s locker, ${s.seasonLabel}: ${stalls.map((st) => st.tip).join('; ')}`;
  return { stage: 'locker', items: [], lead: 0, stalls, label };
}
