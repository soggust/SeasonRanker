// The Book's rows (book-page.component.ts): the algorithm's picks file as the page shows it, and one
// sport's rows joined to the rows the page already has. The page reads a sport's file when it opens, and again
// for a sport that comes into its list late: the admin flag (features.ts ADMIN) lands after the picks, and MMA
// is an admin's alone, so the owner's page learns it should show the UFC picks after it has drawn the rest. No
// Angular here (tested under Node: tests/book-sports.test.mjs)
import { byBand, CheckResolved } from './desk-notes';
import { Confidence, PickWhy, confidenceOf, isSuspect, kellyOf } from './bet-why';
import { heldTo } from './tiers';
import type { BandCap } from './tiers';
import { americanOdds } from './bet-format';
import { PlayerRef, playerCardPath } from '../player-link';
import type { BotRecent } from './recent-form';

// A game as the picks name it
export type BetGame = { week: number; date: string; kickoff?: string | null; matchup: string; teams?: { abbr: string; logo: string | null }[]; line: { line: string; overUnder: number | null } | null };

// A prop's player's card: his sport's page with his name on the link (card-link.ts CARD_NAME_PARAM: the sport's app
// finds him by name across its player tabs, findLinkedCard; the picks carry no position), "/nfl/?name=Drake+Maye".
// A fight's pick is its fighter's: his card the same way ("/mma/?name=Joaquin+Buckley"). His ESPN id rides along
// (&card=): the app finds him by it first, and one the site has no row for (a debut, a fighter out of its
// lists) gets a minimal card by it (SPORT.stubPlayer). Not a prop or a fight, or no player on it: none
// (player-link.ts playerCardPath)
type CardRow = { sport: string; betType: BetKind; player?: string | null; athleteId?: string | number | null };
export function playerCardHref(r: CardRow): string | null {
  const ref = playerRefOf(r);
  return ref ? playerCardPath(ref) : null;
}

// The same as a player link's ref (the <a playerLink> directive), or none
export function playerRefOf(r: CardRow): PlayerRef | null {
  if (!(r.betType === 'player' || r.sport === 'mma') || !r.player) return null;
  return { sport: r.sport, name: r.player, ...(r.athleteId != null && r.athleteId !== '' && { id: r.athleteId }) };
}

// One of the algorithm's picks as the page shows it
export interface BetRow {
  id: number;
  sport: string;
  game: BetGame | null;
  // (its market's words: "Spread", "Passing Yards")
  market: string;
  // (always a like: the bot never fades)
  strength: 'like' | 'fade';
  reason: string;
  // (the most likely way it loses: the pick's own write-up's (picks.mjs))
  risk?: string;
  // (Claude's analysis where the pick has one (writeups.mjs): its headline above the reason, who wrote the
  // text ('claude' or 'plain') and Claude's own read of the case, apart from the band)
  headline?: string;
  by?: string;
  read?: string;
  // (its band, picks.mjs: LOCK (5% Kelly and a 55% chance), LOVE (2%), LIKE (any edge), PASS)
  confidence: Confidence | null;
  // (a slate's practice pick (picks.json's practice): a LIKE whatever its score, its practice tag on the row)
  practice?: boolean;
  // (a suggestion or a pick the desk caps (board.json and picks.json cap, DECISIONS.md D46 and D52): 'medium' a LIKE
  // at most at every price, 'high' a LOVE at most; capWhy its why)
  cap?: BandCap | null;
  capWhy?: string;
  // (its side, and a prop's player, his ESPN id and his team's: its circle and its color)
  side?: string | null;
  player?: string | null;
  athleteId?: string | number | null;
  playerTeam?: string | null;
  // (its chance to win, a whole percent)
  chance?: number;
  pick: string;
  // (its price at the book, under the pick)
  odds?: string;
  // (the call it makes: pickKey)
  key: string;
  // (the order: its Kelly score)
  sureness: number;
  // its type, for the filter chips
  betType: BetKind;
  // (its score's makings, for the rank tile's breakdown (bet-why.ts): whether it has an edge, the model's and
  // the book's chances, the trusted one, its expected return and stake, its price, and the parts picks.mjs
  // split the score into; older picks files carry only some)
  edge?: boolean;
  model?: number;
  fair?: number;
  p?: number;
  ev?: number;
  units?: number;
  price?: number;
  // (a prop's other side's price, where the bettor kept it)
  otherPrice?: number | null;
  book?: string;
  why?: PickWhy | null;
  // (its line, and its id in the bettor's ledger: "<ESPN event>:<market>", a prop "<event>:prop:<type>:<athlete>")
  line?: number | null;
  pickId?: string;
  // (a CHECK, not a bet the bot made: an admin's alone; its gap from the book, signed for its side, and why the
  // bot didn't bet it; checkCause 'role' for one kept for his role changing (props.mjs roleChangeOf), 'news' for
  // the news on his unit (news.mjs: the headline in checkReason), 'gap' an older one's (the gap's are PASSes now))
  check?: boolean;
  gap?: number | null;
  checkReason?: string | null;
  checkCause?: 'gap' | 'role' | 'news' | null;
  roleReason?: string | null;
  newsUnit?: string | null;
  // (the numbers its popover leads with (picks.json's): its cleared Kelly (checks.mjs checkKelly: the stake's
  // Kelly at the chance it'd be bet at with its doubt answered, the one it's judged and shown by), the model's own
  // Kelly (context only), the model's mean and the one the book's price implies, his record at the line (his over
  // share and the weighted games it's from))
  checkKelly?: number | null;
  modelKelly?: number | null;
  mean?: number | null;
  implied?: number | null;
  lineRecord?: { over: number; n: number } | null;
  // (its last re-evaluation, still a CHECK (picks.json's: checks.mjs resolveChecks): its note answered once after it)
  resolved?: CheckResolved | null;
  // (its news research, where it has one (picks.json's: research.mjs, a label only))
  research?: CheckResearch | null;
  // (a SUGGESTION, not a bet the Bot made (suggestions.ts, the owner's, 2026-10-19): a side on its sport's board
  // (board.json) with an edge at the latest price, its band worked again from the Bot's chance at that price)
  suggested?: boolean;
  // (the latest price the page has for its side: ESPN's for a game line where it's the fresher, else the board's;
  // where it came from; a bet's moved where it differs from the price the Bot locked (price))
  livePrice?: number | null;
  liveFrom?: 'espn' | 'board' | null;
  moved?: boolean;
  // (when the Bot placed it, where the picks file says: its "Bet at −109 · 2:05 PM")
  placedAt?: string | null;
  // (the popover's analysis beside the score's parts (bet-why.ts whyFacts): a prop's usage tonight (usage.mjs, D41:
  // [expected, unit]), the terms that moved it most ([name, amount]: a game line's in points of its margin or total,
  // a prop's in percent of his projection; a suggestion's, board.json w.tm), and a suggestion's plain write-up at
  // the board's price (board.json w.r: the desk's own words for a bet, the same generator))
  usage?: [number, string] | null;
  terms?: [string, number][] | null;
  plain?: string | null;
}

// A CHECK's news research (picks.json's research: research.mjs findingOf, picks.mjs researchRow): what Claude found
// in the news for the gap, the player it's about, a summary and the reports it relied on. A label: never a bet
export interface CheckResearch {
  status: 'out' | 'questionable' | 'active' | 'unknown';
  reason: string;
  player: string | null;
  summary: string;
  sources: string[];
  at: string | null;
  applied?: boolean;
}

// A game's venue and kickoff weather (a pick's where: picks.mjs)
export interface Forecast {
  roof: 'outdoors' | 'retractable' | 'indoors';
  tempF?: number | null;
  windMph?: number | null;
  gustMph?: number | null;
  precipChance?: number | null;
  sky?: string;
}
export interface GameInfo {
  city: string | null;
  stadium: string | null;
  weather: Forecast | null;
}
// The types of bet, for the filter chips under the game dropdown: each a chip of its own color, like
// casino chips' denominations
export type BetKind = 'spread' | 'total' | 'team_total' | 'moneyline' | 'player' | 'team_stat';
// (each chip's short label, and what it means: the chips' key)
export const BET_KINDS: { kind: BetKind; label: string; name: string }[] = [
  { kind: 'spread', label: 'ATS', name: 'Against the spread' },
  { kind: 'total', label: 'O/U', name: 'Over/under (the game total)' },
  { kind: 'team_total', label: 'TT', name: 'Team total' },
  { kind: 'moneyline', label: 'ML', name: 'Moneyline (to win)' },
  { kind: 'player', label: 'PROP', name: 'Player prop' },
  { kind: 'team_stat', label: 'TEAM', name: "Team stat (a team's own numbers)" },
];

// The algorithm's picks file (picks.mjs): its top picks on the games not started, each with its confidence
// score and level, and its record on the picks it has shown
export interface Pick {
  id: string;
  sport: string;
  // (its side, and a prop's player, his ESPN id and his team's: picks written before carry none)
  side?: string | null;
  player?: string | null;
  athlete?: string | number | null;
  team?: string | null;
  score: number;
  // its chance to win, a whole percent (the band its level)
  chance: number;
  level: Confidence;
  // (a slate's practice pick: bet for the slate at the practice stake, short of the vig; a LIKE, tagged)
  practice?: boolean;
  // (the band the desk holds it to (picks.mjs capOf, D36 and D52) and the confidence layer's read of it (D52): the
  // calibrated chance, the quality (the stake's Kelly at it) and the tier cap)
  cap?: BandCap | null;
  conf?: { pc: number; q: number; cap: BandCap | null };
  // (when the Bot placed it: files that don't carry it, none)
  placedAt?: string | null;
  kind: BetKind;
  market: string;
  pick: string;
  line: number | null;
  odds: number;
  // (a prop's other side's price: picks written before carry none)
  otherOdds?: number | null;
  book: string;
  start: string;
  matchup: string;
  teams: { abbr: string; logo: string | null }[];
  where: GameInfo | null;
  reason: string;
  // (its write-up's risk line, the row's Devil's Advocate: files before the write-ups carry none)
  risk?: string;
  // (Claude's analysis, in place of the plain text in the same slots: its headline, 'claude' or 'plain', and
  // its read: strong, fair or thin. Files before it carry none)
  headline?: string;
  by?: string;
  read?: string;
  // (its score's makings: older files carry the chances without the parts)
  edge?: boolean;
  model?: number;
  fair?: number;
  p?: number;
  ev?: number;
  units?: number;
  why?: PickWhy;
  // (a CHECK's: the model's distance from the book, signed for its side, and why it wasn't bet; its cause 'role'
  // where it's kept for a role changing (picks.mjs; none on an older file or a gap's))
  gap?: number | null;
  checkReason?: string | null;
  checkCause?: string | null;
  roleReason?: string | null;
  newsUnit?: string | null;
  checkKelly?: number | null;
  modelKelly?: number | null;
  mean?: number | null;
  implied?: number | null;
  lineRecord?: { over: number; n: number } | null;
  resolved?: CheckResolved | null;
  research?: CheckResearch | null;
  // (a prop's usage tonight (usage.mjs, D41): files before it carry none)
  usage?: { expected?: number | null; unit?: string | null; kind?: string | null } | null;
}
export type ByLevel = Record<string, { wins?: number; losses?: number; pushes?: number; profit?: number } | undefined>;
export interface Picks {
  at: string;
  picks: Pick[];
  // (the CHECKs, level 'check': files before them carry none)
  checks?: Pick[];
  // (the CHECK rule (checks.mjs CHECK_RULE): a role's CHECK only at this model Kelly or more)
  checkRule?: { kelly: number } | null;
  // (its record, by band: the replayed record (today's Bot over the priced history before its latest version) joined
  // to its real bets since (picks.mjs recordBlocks, replay-record.mjs mergeRecord); year this calendar year's, the
  // board's band headers' "This year"; caveat the honesty line, their hover)
  record?: { byLevel?: ByLevel; year?: { year: number; byLevel?: ByLevel } | null; caveat?: string | null } | null;
  // (its recent form on its graded placed bets: the Recent form card's The Bot side, recent-form.ts botForm)
  recent?: BotRecent | null;
}

// A team as the schedule names it (the sportsbook's WSH and LAR are its WAS and LA)
const team = (abbr: string) => ({ WSH: 'WAS', LAR: 'LA' })[abbr] ?? abbr;

// The call a pick makes, the same whoever makes it: a game total's side, a team's side of the spread or
// the moneyline, or a player bet as written ("nfl|TB @ DAL|total|under")
export function pickKey(sport: string, matchup: string, kind: BetKind, pick: string): string {
  const [away, home] = matchup.split(' @ ').map(team);
  const game = `${sport}|${away} @ ${home}`;
  if (kind === 'total') return `${game}|total|${/^over/i.test(pick) ? 'over' : 'under'}`;
  const side = pick.match(/^([A-Z]{2,4})\b/)?.[1];
  if ((kind === 'spread' || kind === 'moneyline') && side) return `${game}|${kind}|${team(side)}`;
  return `${game}|${kind}|${pick.toLowerCase()}`;
}

// (a band held to the desk's cap: a LIKE at most where the file caps it 'medium', a LOVE at most where the confidence
// layer caps it 'high' (D52), and a LIKE at most where its price is suspect: D23's edge bar)
function cappedBand(band: Confidence, p: Pick): Confidence {
  const held = heldTo(band, p.cap === 'medium' || p.cap === 'high' ? p.cap : null);
  return isSuspect(p.p ?? (p.chance != null ? p.chance / 100 : null), p.ev) ? heldTo(held, 'medium') : held;
}

// (a pick as a row, its id given when it joins the list (mergeSportRows); a bet's band from its score, a CHECK's
// its own, its gap and why it wasn't bet kept)
export function rowOf(sport: string, p: Pick, check: boolean): BetRow {
  // (the order: its Kelly score, the file's, or worked out from its chance and price for a file from before it
  // ranked by one; its chance shows, its band colors it)
  const sureness = Number.isFinite(p.why?.price) ? p.score : (kellyOf(p.p, p.odds) ?? p.score);
  return {
    sport,
    game: { week: 0, date: p.start.slice(0, 10), kickoff: p.start, matchup: p.matchup, teams: p.teams, line: null },
    market: p.market,
    strength: 'like',
    reason: p.reason,
    ...(p.risk ? { risk: p.risk } : {}),
    ...(p.headline ? { headline: p.headline } : {}),
    ...(p.by ? { by: p.by } : {}),
    ...(p.read ? { read: p.read } : {}),
    // (its band: the Kelly's, held to the cap the desk put on it (picks.json cap: a rule's LIKE, the confidence layer's
    // tier cap, D52), as picks.mjs levelOf gave it; a file before the cap: a suspect price (an edge past the bar, bet-why.ts isSuspect, D23)
    // a LIKE at most the same)
    confidence: p.practice ? 'medium' : cappedBand(confidenceOf(sureness, p.p ?? (p.chance != null ? p.chance / 100 : null), p.edge), p),
    ...(p.practice ? { practice: true } : {}),
    ...(p.cap === 'medium' || p.cap === 'high' ? { cap: p.cap } : {}),
    id: -1,
    key: pickKey(sport, p.matchup, p.kind, p.pick),
    pick: p.pick,
    odds: americanOdds(p.odds),
    sureness,
    chance: p.chance,
    betType: p.kind,
    side: p.side ?? null,
    player: p.player ?? null,
    athleteId: p.athlete ?? null,
    playerTeam: p.team ?? null,
    edge: p.edge,
    model: p.model,
    fair: p.fair,
    p: p.p,
    ev: p.ev,
    units: p.units,
    price: p.odds,
    otherPrice: p.otherOdds ?? null,
    book: p.book,
    why: p.why ?? null,
    line: p.line,
    pickId: p.id,
    ...(p.placedAt ? { placedAt: p.placedAt } : {}),
    ...(Number.isFinite(p.usage?.expected) ? { usage: [p.usage!.expected!, String(p.usage!.unit ?? p.usage!.kind ?? '')] as [number, string] } : {}),
    ...(check
      ? {
          check: true,
          confidence: 'check' as const,
          gap: p.gap ?? null,
          checkReason: p.checkReason ?? null,
          // (an older file's without a cause: the gap's)
          checkCause: p.checkCause === 'role' || p.checkCause === 'news' ? p.checkCause : ('gap' as const),
          roleReason: p.roleReason ?? null,
          newsUnit: p.newsUnit ?? null,
          checkKelly: Number.isFinite(p.checkKelly) ? p.checkKelly! : null,
          modelKelly: Number.isFinite(p.modelKelly) ? p.modelKelly! : null,
          mean: Number.isFinite(p.mean) ? p.mean! : null,
          implied: Number.isFinite(p.implied) ? p.implied! : null,
          lineRecord: p.lineRecord && Number.isFinite(p.lineRecord.over) && Number.isFinite(p.lineRecord.n) ? p.lineRecord : null,
          resolved: p.resolved ?? null,
          research: p.research && typeof p.research === 'object' ? p.research : null,
        }
      : {}),
  };
}

// One sport's picks file as rows: the bets, then the CHECKs (apart: never banded again; an admin's alone), each
// game's venue and weather noted in places (a bet's over a CHECK's). An empty or unread file: none
export function fileRows(sport: string, picks: Picks | null | undefined, places: Map<string, GameInfo>): BetRow[] {
  const rows: BetRow[] = [];
  if (!picks?.picks?.length && !picks?.checks?.length) return rows;
  for (const p of picks.picks ?? []) {
    // (a CHECK left in picks by an older file: picks.mjs keeps them in their own list now; never a bet here)
    if (p.level === 'check') continue;
    if (p.where) places.set(`${sport}|${p.matchup}`, p.where);
    rows.push(rowOf(sport, p, false));
  }
  for (const p of picks.checks ?? []) {
    if (p.where && !places.has(`${sport}|${p.matchup}`)) places.set(`${sport}|${p.matchup}`, p.where);
    rows.push(rowOf(sport, p, true));
  }
  return rows;
}

// The page's rows with one sport's: any rows it had for that sport dropped first (a file read again never doubles
// them), the others keeping their ids (an open row stays open), the sport's given the ids after the highest; the
// whole in the board's order (the LOCKs, then the CHECKs (the biggest gap first), then the rest by the Kelly
// score: desk-notes.ts byBand). A new list each time: the page's caches (listed, menu) go by its identity
export function mergeSportRows(rows: readonly BetRow[], sport: string, added: readonly BetRow[]): BetRow[] {
  const kept = dropSportRows(rows, sport);
  let next = kept.reduce((m, r) => Math.max(m, r.id + 1), 0);
  return [...kept, ...added.map((r) => ({ ...r, id: next++ }))].sort(byBand);
}

// Whether the Book lists a row (the owner's note, 2026-10-19: "Why are we showing super negative Kelly practice
// bets in Best Bets?"): Best Bets, the Live tab's card and a game's picks show only rows with an edge at the
// current price. The Bot's bets clear the vig and suggestions are listed only with an edge, so both show; a
// practice pick (the slate's top few, placed short of the vig: picks.json's practice) shows only where its
// Kelly at the live price (the locked one without it) is above 0, its practice tag kept. Hidden, it is still
// the Bot's bet: its Practice line (PRACTICE_SPLIT), the wallet, the Algorithm tab and the ledger all keep it
export function bookShows(r: BetRow): boolean {
  if (!r.practice || r.suggested || r.check) return true;
  const live = Number.isFinite(r.livePrice) && r.livePrice ? r.livePrice : null;
  const k = kellyOf(r.p, live ?? (typeof r.price === 'number' ? r.price : null)) ?? (live === null && Number.isFinite(r.sureness) ? r.sureness : null);
  return k !== null && k > 0;
}
export function bookRows(rows: readonly BetRow[]): BetRow[] {
  return rows.filter(bookShows);
}

// The page's rows without a sport's (the flag that let it in gone)
export function dropSportRows(rows: readonly BetRow[], sport: string): BetRow[] {
  return rows.filter((r) => r.sport !== sport);
}

// The page's rows with a sport chosen in the dropdown (game-menu.ts sportChoice): that sport's alone; none
// chosen (''), every one
export function sportRows(rows: readonly BetRow[], sport: string): BetRow[] {
  return sport ? rows.filter((r) => r.sport === sport) : [...rows];
}

// The bands' seasons for the board's band headers: each sport's picks.json record.byLevel (the file's grades of
// its own picks), summed over the sports on the board: a sport chosen, its file alone; none, every file's.
// A band no file has graded isn't in the map
export type BandTally = { wins: number; losses: number; pushes: number; profit: number };
export function sumRecords(files: Iterable<readonly [string, ByLevel | null | undefined]>, sport: string): Map<string, BandTally> {
  const out = new Map<string, BandTally>();
  for (const [id, byLevel] of files) {
    if ((sport && id !== sport) || !byLevel) continue;
    for (const level of ['lock', 'high', 'medium', 'low']) {
      const r = byLevel[level];
      if (!r) continue;
      const t = out.get(level) ?? { wins: 0, losses: 0, pushes: 0, profit: 0 };
      t.wins += r.wins ?? 0;
      t.losses += r.losses ?? 0;
      t.pushes += r.pushes ?? 0;
      t.profit += r.profit ?? 0;
      out.set(level, t);
    }
  }
  return out;
}

// A click on a board row toggles it open or shut, as its chevron does, unless it lands on one of the row's own
// controls (the meter, the price, the rank tile, a player's link, the desk note: anything a button, a link, a
// [role=button] or a field) or inside the open content (the owner's note, 2026-10-17). The chevron stays the
// keyboard's control; the row adds no tab stop
export const ROW_CLICK_IGNORES = 'button, a, [role="button"], input, select, textarea, label, .bet-reasons';
export function rowClickToggles(target: { closest?: (sel: string) => unknown } | null): boolean {
  return !!target && typeof target.closest === 'function' && !target.closest(ROW_CLICK_IGNORES);
}
