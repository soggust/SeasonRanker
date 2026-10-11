import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { tierLabel, tierOf, unranked } from './tiers';
import { CheckResolved, NotePlayer, byBand, notePlayers } from './desk-notes';
import { BetsView, betsView, chooseBetsView } from './bets-view';
import { LinesService } from '../account/wallet/lines.service';
import { WalletService } from '../account/wallet/wallet.service';
import { SPORT_LINKS } from '@ranker/core/sports';
import { canUse } from '../account/features';
import { SPORTS } from './desk-math';
import { insteadText } from '../player-card/analysis';
import { americanOdds, headshot } from './bet-format';
import { BetWhy, Confidence, PickWhy, betScoreText, betWhy, confidenceOf, kellyOf, signedPoints, withAnalyst } from './bet-why';
import { TeamColors, loadTeamColors, pickTeamColor, splitPick } from './pick-style';

// The Bets page (the sport bar's Bets link, #bets): the algorithm's top picks for every sport (each one's
// data/model/picks.json, written by every run of the model desk: libs/ranker/scripts/model/picks.mjs), ranked
// together by their Kelly score (value and likelihood: the edge on the price, scaled by what it pays; a bet
// without an edge on its price scores 0 or under, sorts last and reads "Pass", its band low). The
// NFL's AI bet desk's sheet for the week (data/analysis/bet-sheet.json) only marks the picks it agrees with
// (the same game, market and side: "Algorithm + Analyst", ranked a little higher); its other picks aren't
// shown. A row opens to its reasoning.
//
// An admin's (canUse('experimental')) list also has the CHECKs (picks.json's checks: markets the model is too
// far from the book on to bet, kept for the owner to look into), under the LOCKs and over the rest, in their
// lavender band with a "?" for a rank: not the bot's bets (their prices bet either side, the slip's bet not the
// bot's pick), the open row its write-up (the disagreement) and a note to the bot (desk-note.component.ts:
// Firestore's deskNotes, which the bettor reads on its next run). Nobody else sees them. Its open bets' rows
// take a note too (the same deskNotes/{pick id}: a player's news re-prices the game's open bets).

// (a game the bot has picks on: its board's key facts, its picks (the CHECKs among them) and its bets alone)
type GameBoardPicks = { sport: string; event: string; start: string; matchup: string; picks: BetRow[]; betPicks: BetRow[] };
// (the game dropdown's day: its header, and its games with how many bets each)
type GameDay = { day: string; games: { key: string; label: string; count: number }[] };

// A game as the picks and the AI desk's sheet name it
type BetGame = { week: number; date: string; kickoff?: string | null; matchup: string; teams?: { abbr: string; logo: string | null }[]; line: { line: string; overUnder: number | null } | null };

// (an AI desk report's bet: data/analysis/bets.json, read only for the week its latest reports are on)
interface BetEntry {
  game: BetGame | null;
  at: string;
}

// One of the algorithm's picks as the page shows it
export interface BetRow {
  id: number;
  sport: string;
  // whose pick: the algorithm's, or the algorithm's and the analyst's both
  source: 'Algorithm' | 'Algorithm + Analyst';
  game: BetGame | null;
  // (its market's words: "Spread", "Passing Yards")
  market: string;
  // (always a like: a fade is the analyst's alone, and the analyst's own picks aren't shown)
  strength: 'like' | 'fade';
  reason: string;
  // (the most likely way it loses: the pick's own write-up's (picks.mjs), and the analyst's where it agrees)
  risk?: string;
  // (Claude's analysis where the pick has one (writeups.mjs): its headline above the reason, who wrote the
  // text ('claude' or 'plain') and Claude's own read of the case, apart from the band)
  headline?: string;
  by?: string;
  read?: string;
  // (its band: its chance to win 60% or more, 53% or more, or under; picks.mjs)
  confidence: Confidence | null;
  // (its side, and a prop's player, his ESPN id and his team's: its circle and its color)
  side?: string | null;
  player?: string | null;
  athleteId?: string | number | null;
  playerTeam?: string | null;
  // (its chance to win, a whole percent)
  chance?: number;
  pick: string;
  // (its price at DraftKings, under the pick)
  odds?: string;
  // (the call it makes: pickKey)
  key: string;
  // (the order: its Kelly score, a quarter higher where the analyst agrees and it has an edge)
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
  // bot didn't bet it; checkCause 'role' for one kept for his role changing (props.mjs roleChangeOf), not the gap)
  check?: boolean;
  gap?: number | null;
  checkReason?: string | null;
  checkCause?: 'role' | null;
  // (its last re-evaluation, still a CHECK (picks.json's: checks.mjs resolveChecks): its note answered once after it)
  resolved?: CheckResolved | null;
}

// (an analyst's pick, as far as the page uses it: the call, its side, its case and its risk)
type SheetCall = { key: string; strength: 'like' | 'fade'; reason: string; risk: string };

// The bet desk's sheet (data/analysis/bet-sheet.json, scripts/analysis/bet-desk.mjs): the week's picks
// from every report's bets, each with its case and its risk, and each game's venue and kickoff weather
interface Forecast {
  roof: 'outdoors' | 'retractable' | 'indoors';
  tempF?: number | null;
  windMph?: number | null;
  gustMph?: number | null;
  precipChance?: number | null;
  sky?: string;
}
interface GameInfo {
  city: string | null;
  stadium: string | null;
  weather: Forecast | null;
}
interface SheetPick {
  sport: string;
  bet: string;
  label: string;
  side: 'like' | 'fade';
  fades: string | null;
  strength: number;
  case: string;
  grade?: { kind: BetKind } | null;
  risk: string;
  sources: string[];
  game: BetGame | null;
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

// A bet's type: the desk's own grading kind when it has one; otherwise read from its market (a bet
// on one of the game's teams' own numbers, "BAL under its rushing average", is a team stat)
function kindOf(graded: BetKind | null | undefined, label: string, bet: string, game: BetGame | null): BetKind {
  if (graded) return graded;
  if (/^spread$/i.test(label)) return 'spread';
  if (/moneyline/i.test(label)) return 'moneyline';
  if (/^game total$/i.test(label)) return 'total';
  if (/team total/i.test(label)) return 'team_total';
  const team = bet.match(/^([A-Z]{2,3})\b/)?.[1];
  return team && game?.teams?.some((t) => t.abbr === team) ? 'team_stat' : 'player';
}

interface Sheet {
  at: string;
  week: number;
  summary: string;
  games: Record<string, GameInfo>;
  picks: SheetPick[];
}

// The algorithm's picks file (picks.mjs): its top picks on the games not started, each with its confidence
// score and level, and its record on the picks it has shown
interface Pick {
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
  resolved?: CheckResolved | null;
}
interface Picks {
  at: string;
  picks: Pick[];
  // (the CHECKs, level 'check': files before them carry none)
  checks?: Pick[];
}

// A team as the schedule names it (the sportsbook's WSH and LAR are its WAS and LA)
const team = (abbr: string) => ({ WSH: 'WAS', LAR: 'LA' })[abbr] ?? abbr;

// The call a pick makes, the same whoever makes it: a game total's side, a team's side of the spread or
// the moneyline, or a player bet as written ("nfl|TB @ DAL|total|under")
function pickKey(sport: string, matchup: string, kind: BetKind, pick: string): string {
  const [away, home] = matchup.split(' @ ').map(team);
  const game = `${sport}|${away} @ ${home}`;
  if (kind === 'total') return `${game}|total|${/^over/i.test(pick) ? 'over' : 'under'}`;
  const side = pick.match(/^([A-Z]{2,4})\b/)?.[1];
  if ((kind === 'spread' || kind === 'moneyline') && side) return `${game}|${kind}|${team(side)}`;
  return `${game}|${kind}|${pick.toLowerCase()}`;
}

// (the sports the bettor covers, as the site names them: MMA has no picks or team colors to ask for)
const BET_SPORTS = SPORT_LINKS.filter((sport) => SPORTS.includes(sport.id));

@Component({
  selector: 'bets-page',
  // (the page's main content: the Bets page has no <main> of its own around it)
  host: { role: 'main' },
  templateUrl: './bets-page.component.html',
  styleUrls: ['../../styles/components/bets-page.scss'],
  standalone: false,
})
export class BetsPageComponent implements OnInit, OnDestroy {
  // Each sport's teams' colors, once a visit (pick-style.ts)
  private teamColors: TeamColors = new Map();
  private pickColors = new Map<number, string | null>();

  // (a pick's own color: a prop its player's team's, a side the team it took's; a total, none: the board's)
  pickColor(r: BetRow): string | null {
    const kept = this.pickColors.get(r.id);
    if (kept !== undefined) return kept;
    const teams = r.game?.teams ?? [];
    const abbr = r.betType === 'player' ? null : (r.side === 'home' ? teams[1] : teams[0])?.abbr ?? null;
    const color = pickTeamColor(this.teamColors, r.sport ?? '', { total: r.betType === 'total', teamId: r.betType === 'player' ? r.playerTeam : null, abbr });
    if (this.teamColors.size) this.pickColors.set(r.id, color);
    return color;
  }

  // (a pick split round its one word: a prop's after the player's name, a total's over or under, a side's line)
  pickParts(r: BetRow): [string, string, string] {
    const text = r.betType === 'player' && r.player && r.pick.startsWith(r.player) ? r.pick.slice(r.player.length).trimStart() : r.pick;
    return splitPick(text, r.betType === 'player' || r.betType === 'total');
  }

  // (a side's team's logo, for its circle)
  pickLogo(r: BetRow): string | null {
    const teams = r.game?.teams ?? [];
    const logo = (r.side === 'home' ? teams[1] : teams[0])?.logo;
    return logo ? this.logoSrc(r, logo) : null;
  }

  // (a prop's player's ESPN headshot, for its circle)
  headshot(r: BetRow): string {
    return headshot(r.sport, r.athleteId);
  }

  hide(event: Event): void {
    (event.target as HTMLElement).style.visibility = 'hidden';
  }

  // (the model desk, the Algorithm: an admin's, and on the dev server)
  readonly desk = (): boolean => canUse('experimental');
  readonly canUse = canUse;
  // (the page's About: its header's info button; an admin's has the Algorithm too)
  aboutOpen = false;
  private readonly wallet = inject(WalletService);
  // (Open Bets: only with bets of the user's not yet settled; the last one settled, back to Place Bets)
  readonly hasOpen = (): boolean => canUse('bets') && this.wallet.openBets().length > 0;
  // (Closed Bets: only with bets of the user's settled)
  // (already bet and still open: the stake, so the same bet isn't placed twice by mistake)
  // (by the pick's id and its side: the wallet's openOnPick)
  readonly placedOn = (r: BetRow): number => (r.pickId ? (this.wallet.openOnPick().get(`${r.pickId}|${r.side}`) ?? 0) : 0);
  // (the signed-in user's play money: on hand, and what's out on open bets; none signed out or before it loads)
  readonly bankroll = (): { balance: number; atRisk: number; open: number } | null => {
    if (!canUse('bets') || !this.wallet.loaded() || !this.wallet.wallet()) return null;
    const open = this.wallet.openBets();
    return { balance: this.wallet.balance(), atRisk: open.reduce((t, b) => t + b.stake, 0), open: open.length };
  };
  readonly hasClosed = (): boolean => canUse('bets') && this.wallet.hasSettled();
  // (Place Bets first; Open Bets (with the wallet) or the Algorithm (development only) once chosen in this
  // visit: bets-view.ts)
  get view(): BetsView {
    const view = betsView();
    if (view === 'desk') return this.desk() ? view : 'bets';
    if (view === 'open') return this.hasOpen() ? view : 'bets';
    if (view === 'closed') return this.hasClosed() ? view : 'bets';
    return view;
  }
  set view(view: BetsView) {
    chooseBetsView(view);
  }

  rows: BetRow[] | null = null;
  updated: string | null = null;
  // the filter: all games (the top 40 bets), or one game (its top 15, from all of its bets), by its matchup
  game = '';
  readonly limit = 40;
  readonly gameLimit = 15;
  // (the CHECKs an admin's All Games shows, the biggest gaps first, over the 40 bets)
  readonly checkLimit = 10;
  open = new Set<number>();
  readonly insteadText = insteadText;
  // each game's venue and kickoff weather, from the bet desk's sheet ("nfl|CHI @ GB")
  places = new Map<string, GameInfo>();
  // Under a matchup: the kickoff weather and where it's played ("57° · 8 mph · Lambeau Field"); windy (15+ mph,
  // or gusts of 25+) when the wind could matter
  where(r: BetRow): { icon: string; text: string; windy: boolean } | null {
    const info = r.game ? this.places.get(`${r.sport}|${r.game.matchup}`) : undefined;
    if (!info) return null;
    const w = info.weather;
    // (where: the stadium's name, or its city when the schedule has none)
    const place = info.stadium ?? info.city ?? '';
    if (!w) return place ? { icon: 'place', text: place, windy: false } : null;
    if (w.roof === 'indoors') return { icon: 'stadium', text: ['Indoors', place].filter(Boolean).join(' · '), windy: false };
    const sky = w.sky ?? '';
    const icon = /thunder/.test(sky) ? 'thunderstorm' : /snow/.test(sky) ? 'ac_unit' : /rain|drizzle|shower/.test(sky) ? 'umbrella' : /cloud|overcast|fog/.test(sky) ? 'cloud' : 'wb_sunny';
    const windy = (w.windMph ?? 0) >= 15 || (w.gustMph ?? 0) >= 25;
    const parts = [
      w.tempF !== null && w.tempF !== undefined ? `${w.tempF}°` : null,
      w.windMph !== null && w.windMph !== undefined ? `${w.windMph} mph${windy && w.gustMph ? ` (gusts ${w.gustMph})` : ''}` : null,
      w.roof === 'retractable' ? 'Roof' : null,
      place || null,
    ];
    return { icon: windy ? 'air' : icon, text: parts.filter(Boolean).join(' · '), windy };
  }

  async ngOnInit(): Promise<void> {
    // (the teams' colors for the picks' words, alongside the picks)
    loadTeamColors(BET_SPORTS.map((s) => s.id)).then((colors) => {
      this.teamColors = colors;
      this.pickColors.clear();
    });
    const get = (url: string) =>
      fetch(url, { cache: 'no-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
    // every sport's algorithm picks, and the AI desk's sheet where the sport has AI analyses (sports.json)
    const files = await Promise.all(
      // (each sport's files together, not one after another)
      BET_SPORTS.map(async (s) => {
        const [picks, bets, sheet] = await Promise.all([
          get(`/${s.id}/data/model/picks.json`),
          s.analysis ? get(`/${s.id}/data/analysis/bets.json`) : null,
          s.analysis ? get(`/${s.id}/data/analysis/bet-sheet.json`) : null,
        ]);
        return { sport: s.id, picks: picks as Picks | null, bets, sheet: sheet as Sheet | null };
      }),
    );
    const algoRows: BetRow[] = [];
    const checkRows: BetRow[] = [];
    const sheetRows: SheetCall[] = [];
    // (a pick as a row; a CHECK's band its own, its gap and why it wasn't bet kept)
    const rowOf = (sport: string, p: Pick, id: number, check: boolean): BetRow => ({
      sport,
      source: 'Algorithm',
      game: { week: 0, date: p.start.slice(0, 10), kickoff: p.start, matchup: p.matchup, teams: p.teams, line: null },
      market: p.market,
      strength: 'like',
      reason: p.reason,
      ...(p.risk ? { risk: p.risk } : {}),
      ...(p.headline ? { headline: p.headline } : {}),
      ...(p.by ? { by: p.by } : {}),
      ...(p.read ? { read: p.read } : {}),
      confidence: p.level,
      id,
      key: pickKey(sport, p.matchup, p.kind, p.pick),
      pick: p.pick,
      odds: americanOdds(p.odds),
      // (the order: its Kelly score, the file's, or worked out from its chance and price for a file from
      // before it ranked by one; its chance shows, its band colors it)
      sureness: Number.isFinite(p.why?.price) ? p.score : (kellyOf(p.p, p.odds) ?? p.score),
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
      ...(check ? { check: true, confidence: 'check' as const, gap: p.gap ?? null, checkReason: p.checkReason ?? null, checkCause: p.checkCause === 'role' ? ('role' as const) : null, resolved: p.resolved ?? null } : {}),
    });
    for (const { sport, picks, bets: file, sheet } of files) {
      // The algorithm's picks
      if (picks?.picks?.length || picks?.checks?.length) {
        if (!this.updated || picks.at > this.updated) this.updated = picks.at;
        for (const p of picks.picks ?? []) {
          // (a CHECK left in picks by an older file: picks.mjs keeps them in their own list now; never a bet here)
          if (p.level === 'check') continue;
          if (p.where) this.places.set(`${sport}|${p.matchup}`, p.where);
          algoRows.push(rowOf(sport, p, algoRows.length, false));
        }
        // (the CHECKs, apart: never the analyst's, never banded again; an admin's alone)
        for (const p of picks.checks ?? []) {
          if (p.where && !this.places.has(`${sport}|${p.matchup}`)) this.places.set(`${sport}|${p.matchup}`, p.where);
          checkRows.push(rowOf(sport, p, -1, true));
        }
      }
      if (!file?.bets?.length) continue;
      // (the AI desk's sheet: only the coming week's, from its latest reports)
      const newest = Math.max(...file.bets.map((b: BetEntry) => Date.parse(b.at)));
      const latest = file.bets.filter((b: BetEntry) => newest - Date.parse(b.at) < 6 * 3600e3);
      const week = Math.min(...latest.map((b: BetEntry) => b.game?.week ?? Infinity));
      if (sheet?.week === week && sheet.picks?.length) {
        for (const [matchup, info] of Object.entries(sheet.games ?? {})) if (!this.places.has(`${sport}|${matchup}`)) this.places.set(`${sport}|${matchup}`, info);
        for (const p of sheet.picks) {
          const betType = kindOf(p.grade?.kind, p.label, p.bet, p.game);
          sheetRows.push({
            key: p.game ? pickKey(sport, p.game.matchup, betType, p.bet) : `${sport}|sheet|${sheetRows.length}`,
            strength: p.side,
            reason: p.case,
            risk: p.risk,
          });
        }
      }
    }
    // Where the analyst's sheet makes the same call as an algorithm pick: marked as both's, its reasons added,
    // and its score counted a quarter higher in the order where it has an edge (two independent reads agreeing;
    // never a negative one made worse); the sheet's other picks aren't shown
    const byKey = new Map(algoRows.map((r) => [r.key, r]));
    for (const s of sheetRows) {
      const a = byKey.get(s.key);
      if (!a || s.strength === 'fade') continue;
      a.source = 'Algorithm + Analyst';
      a.sureness = withAnalyst(a.sureness);
      a.reason = `${a.reason} Analyst: ${s.reason}`;
      // (the pick's own risk kept, the analyst's beside it where it says something else)
      a.risk = a.risk ? (s.risk && s.risk !== a.risk ? `${a.risk} Analyst: ${s.risk}` : a.risk) : s.risk;
    }
    // (each one's band from its score as it now stands, the analyst's quarter in it; all sports' picks together,
    // the locks above the rest, then the best Kelly score first)
    for (const a of algoRows) a.confidence = confidenceOf(a.sureness, a.p ?? (a.chance != null ? a.chance / 100 : null), a.edge);
    // (the CHECKs' ids after the bets': each row's own)
    checkRows.forEach((c, i) => (c.id = algoRows.length + i));
    // (the LOCKs, then the CHECKs (the biggest gap first), then the rest by the Kelly score: desk-notes.ts byBand)
    this.rows = [...algoRows, ...checkRows].sort(byBand);
    this.dropStarted();
    // (not if the page closed while its files loaded: nothing would stop it)
    if (!this.closed) this.ticker = setInterval(() => this.dropStarted(), 60_000);
    this.buildBoards();
  }

  // Play betting: each game's every line (<game-lines>, ESPN's DraftKings board, the bot's picks lit), its
  // ESPN id, start and the bot's picks on it, by the game filter's key; and the games on the boards the bot
  // has no pick on, for the dropdown (their lines only). The slip (<bet-slip>) and #wallet do the rest.
  readonly lines = inject(LinesService);
  // (each board's picks, the CHECKs among them, and its bets alone (betPicks): an admin's lines light the CHECKs too)
  boards = new Map<string, GameBoardPicks>();
  private buildBoards(): void {
    for (const r of this.rows ?? []) {
      const event = r.pickId?.split(':')[0];
      if (!r.game || !event) continue;
      const key = this.gameKey(r);
      const b = this.boards.get(key) ?? { sport: r.sport, event, start: r.game.kickoff ?? r.game.date, matchup: r.game.matchup, picks: [], betPicks: [] };
      b.picks.push(r);
      if (!r.check) b.betPicks.push(r);
      this.boards.set(key, b);
    }
    // (each sport's board on the days the picks are on: the lines, and the games without a pick)
    void this.lines.games([...this.boards.values()]);
  }

  // (a game on ESPN's boards, not begun, with DraftKings' lines, that the bot has no pick on)
  get moreGames(): { key: string; label: string }[] {
    const out: { key: string; label: string; at: string }[] = [];
    for (const g of this.lines.boards().values()) {
      const key = `${g.sport}|${g.matchup}`;
      // (a game with picks on show is in the days above; one with none on show (a CHECK's alone, not an admin) here)
      if (g.state !== 'pre' || this.boardPicks(this.boards.get(key)).length || !(g.spread || g.total || g.ml)) continue;
      const time = new Date(g.start).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      out.push({ key, label: `${g.sport.toUpperCase()} · ${g.matchup} · ${time}`, at: g.start });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at) || a.label.localeCompare(b.label));
  }

  // (the chosen game's board: one with picks, or one from the boards alone)
  // (a board's picks as this viewer has them: an admin's with the CHECKs)
  boardPicks(b: GameBoardPicks | null | undefined): BetRow[] {
    return !b ? [] : this.desk() ? b.picks : b.betPicks;
  }

  boardFor(key: string): GameBoardPicks | null {
    const known = this.boards.get(key);
    if (known) return known;
    for (const g of this.lines.boards().values()) {
      if (`${g.sport}|${g.matchup}` === key) {
        const board = { sport: g.sport, event: g.event, start: g.start, matchup: g.matchup, picks: [], betPicks: [] };
        this.boards.set(key, board);
        return board;
      }
    }
    return null;
  }

  // (a pick whose game has started can't be bet: off the list, and its game off the dropdown, when the
  // page loads and each minute after; the picks file is only rewritten hourly)
  private ticker: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private dropStarted(): void {
    const now = Date.now();
    const open = (this.rows ?? []).filter((r) => !r.game?.kickoff || Date.parse(r.game.kickoff) > now);
    if (this.rows && open.length === this.rows.length) return;
    this.rows = open;
    if (this.game && !this.listed.some((r) => this.gameKey(r) === this.game)) this.game = '';
  }

  ngOnDestroy(): void {
    this.closed = true;
    if (this.ticker) clearInterval(this.ticker);
  }

  // A team logo's address: a path under the sport's own site, or a full address as it is
  logoSrc(r: BetRow, logo: string): string {
    return /^https?:/.test(logo) ? logo : `/${r.sport}/${logo}`;
  }

  // All games: the top 40 bets; a game: its top 15 (from all of its bets, not just those in the top 40). An admin's
  // CHECKs besides, never taking a bet's place: All Games the 10 biggest gaps, a game all of its own
  get shown(): BetRow[] {
    // (the chips on that this game has: a game without any of them shows all its bets, not an empty list
    // whose chips have gone)
    const inGame = this.inGame;
    const kinds = [...this.kinds].filter((k) => inGame.some((r) => r.betType === k));
    const rows = kinds.length ? inGame.filter((r) => kinds.includes(r.betType)) : inGame;
    const limit = this.game ? this.gameLimit : this.limit;
    const checkLimit = this.game ? Infinity : this.checkLimit;
    let bets = 0;
    let checks = 0;
    return rows.filter((r) => (r.check ? checks++ < checkLimit : bets++ < limit));
  }

  // The bets in the chosen game (all of them for All Games)
  private get inGame(): BetRow[] {
    const rows = this.listed;
    return this.game ? rows.filter((r) => this.gameKey(r) === this.game) : rows;
  }

  // The rows this viewer sees: an admin's every one, the CHECKs among them; anyone else's the bets alone (kept till
  // the rows or the admin flag change: the flag can arrive after the picks)
  private listedFor: { rows: BetRow[] | null; desk: boolean; list: BetRow[] } | null = null;
  get listed(): BetRow[] {
    const desk = this.desk();
    if (this.listedFor?.rows !== this.rows || this.listedFor?.desk !== desk) {
      const rows = this.rows ?? [];
      this.listedFor = { rows: this.rows, desk, list: desk ? rows : rows.filter((r) => !r.check) };
    }
    return this.listedFor.list;
  }

  // (a CHECK's note's players: its own first, then its game's on the picks; kept per row)
  private playersFor = new Map<number, NotePlayer[]>();
  notePlayers(r: BetRow): NotePlayer[] {
    let list = this.playersFor.get(r.id);
    if (!list) {
      list = notePlayers(r, this.boards.get(this.gameKey(r))?.picks ?? []);
      this.playersFor.set(r.id, list);
    }
    return list;
  }

  // The filter chips: the types of bet in the chosen game, each with how many; none on shows them all
  kinds = new Set<BetKind>();
  get kindChips(): { kind: BetKind; label: string; name: string; count: number }[] {
    const rows = this.inGame;
    return BET_KINDS.map((k) => ({ ...k, count: rows.filter((r) => r.betType === k.kind).length })).filter((k) => k.count);
  }

  toggleKind(kind: BetKind): void {
    this.closeWhy();
    if (!this.kinds.delete(kind)) this.kinds.add(kind);
  }

  // The week's games with bets: the dropdown's choices under a header for each day, by kickoff (in the
  // viewer's time zone; London's morning game first on Sunday), each with how many bets it has. Built once the
  // picks are in (they don't change after), not on every check of the page
  // (kept till the rows on show change: an admin's with the CHECKs' games and counts)
  private daysFor: { list: BetRow[]; days: GameDay[] } | null = null;
  get gameDays(): GameDay[] {
    const list = this.listed;
    if (this.daysFor?.list !== list) this.daysFor = { list, days: this.buildGameDays(list) };
    return this.daysFor.days;
  }
  private buildGameDays(rows: BetRow[]): GameDay[] {
    const byGame = new Map<string, { key: string; label: string; day: string; at: number; count: number; bets: number }>();
    for (const r of rows) {
      if (!r.game) continue;
      const key = this.gameKey(r);
      let game = byGame.get(key);
      if (!game) {
        const kickoff = r.game.kickoff ? new Date(r.game.kickoff) : null;
        const day = kickoff ?? new Date(`${r.game.date}T12:00:00`);
        game = {
          key,
          label: kickoff
            ? `${r.game.matchup} · ${kickoff.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
            : r.game.matchup,
          day: day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
          at: day.getTime(),
          count: 0,
          bets: 0,
        };
      }
      // (the bets it shows, gameLimit at most, and an admin's CHECKs on it, all shown)
      if (r.check) game.count++;
      else if (game.bets < this.gameLimit) {
        game.bets++;
        game.count++;
      }
      byGame.set(key, game);
    }
    const days: GameDay[] = [];
    for (const game of [...byGame.values()].sort((a, b) => a.at - b.at || a.label.localeCompare(b.label))) {
      if (days.at(-1)?.day !== game.day) days.push({ day: game.day, games: [] });
      days.at(-1)!.games.push(game);
    }
    return days;
  }

  gameKey(r: BetRow): string {
    return `${r.sport}|${r.game?.matchup ?? ''}`;
  }

  // A bet's side: fade (going against what it names) or like (backing it); an older report's lean is a
  // like (how sure is the confidence's job)
  side(r: BetRow): 'like' | 'fade' {
    return r.strength === 'fade' ? 'fade' : 'like';
  }

  // Its chip, by its band (bet-why.ts confidenceOf; a CHECK's its own): "Lock", "Check", "Love", "Like", or "Pass"
  // (a small edge, or none on its price: a bet the bot made for the data, never one to make); a fade "Fade"
  grade(r: BetRow): 'lock' | 'check' | 'love' | 'like' | 'fade' | 'pass' {
    if (r.strength === 'fade') return 'fade';
    return tierOf(this.level(r)) ?? 'pass';
  }

  // A bet's band, its row's color: a lock, then its Kelly score 5 or more, 2 or more, or under (picks.mjs)
  level(r: BetRow): Confidence {
    return r.confidence ?? 'low';
  }

  // (the locks and CHECKs shown: above the ranks, the first bet under them #1)
  lockCount(rows: BetRow[]): number {
    return rows.filter((r) => unranked(r.confidence)).length;
  }

  toggle(id: number): void {
    if (!this.open.delete(id)) this.open.add(id);
  }

  // ---------------------------------------------------------------------------
  // Why a bet ranks where it does: its rank tile clicked (or Enter / Space on it) opens how its score is
  // built (bet-why.ts), as the grid's rank tile does
  // ---------------------------------------------------------------------------
  why: (BetWhy & { at: { top: number | null; bottom: number | null; left: number; room: number }; sheet: boolean }) | null = null;
  @ViewChild('whyPop') whyPop?: ElementRef<HTMLElement>;
  private whyTile: HTMLElement | null = null;
  readonly signedPoints = signedPoints;
  readonly betScoreText = betScoreText;

  // (a CHECK's popover, its "?" clicked: the model's chance against the book's, the gap, the model's Kelly, why
  // it isn't bet)
  checkWhy: {
    id: number;
    name: string;
    at: { top: number | null; bottom: number | null; left: number; room: number };
    sheet: boolean;
    kelly: number | null;
    model: number | null;
    fair: number | null;
    gap: number | null;
    cause: string;
    reason: string | null;
  } | null = null;

  // (a CHECK's model Kelly: its own chance at the price, untrusted: the disagreement's size)
  checkKelly(r: BetRow): number | null {
    return kellyOf(r.model, typeof r.price === 'number' ? r.price : null);
  }

  // The rank tile's hover: its place (a lock's, above the ranks), its Kelly score and its chance ("#2 of 40 ·
  // Kelly +3.12 · 64% to win")
  rankTitle(r: BetRow, i: number, n: number, locks: number): string {
    if (r.check && r.checkCause === 'role') return `Check · his role is changing: the model's numbers are his old role's, so neither side is bet (the model ${r.chance ?? '–'}%, the book's ${Number.isFinite(r.fair) ? Math.round(r.fair! * 100) : '–'}%)`;
    if (r.check) return `Check · the model ${r.chance ?? '–'}% against the book's ${Number.isFinite(r.fair) ? Math.round(r.fair! * 100) : '–'}%: too far apart to bet`;
    const place = unranked(r.confidence) ? tierLabel(r.confidence!) : `#${i + 1 - locks} of ${n - locks}`;
    return `${place} · Kelly ${betScoreText(r.sureness * 100)}${r.chance != null ? ` · ${r.chance}% to win` : ''}`;
  }

  toggleWhy(index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const rows = this.shown;
    const row = rows[index];
    if (!row) return;
    if (this.why?.id === row.id || this.checkWhy?.id === row.id) {
      this.closeWhy(true);
      return;
    }
    const tile = event.currentTarget as HTMLElement;
    // (hung under the tile, or over it when there's more room above; inside the screen's edges, no taller
    // than the room it has; phones: a sheet along the bottom)
    const rect = tile.getBoundingClientRect();
    const below = innerHeight - rect.bottom;
    const left = Math.max(8, Math.min(rect.left, innerWidth - 348));
    const at =
      below >= 420 || below >= rect.top
        ? { top: rect.bottom + 6, bottom: null, left, room: below - 14 }
        : { top: null, bottom: innerHeight - rect.top + 6, left, room: rect.top - 14 };
    const sheet = matchMedia('(max-width: 575px)').matches;
    // (a CHECK's: no rank to build, its disagreement instead)
    if (row.check) {
      this.why = null;
      const model = row.model ?? null;
      const fair = row.fair ?? null;
      this.checkWhy = {
        id: row.id,
        name: row.pick,
        at,
        sheet,
        kelly: this.checkKelly(row),
        model: model === null ? null : Math.round(model * 1000) / 10,
        fair: fair === null ? null : Math.round(fair * 1000) / 10,
        gap: Number.isFinite(row.gap) ? Math.round(Math.abs(row.gap!) * 1000) / 10 : model !== null && fair !== null ? Math.round(Math.abs(model - fair) * 1000) / 10 : null,
        cause: row.checkCause === 'role' ? 'His role is changing' : 'Too far from the market',
        reason: row.checkReason ?? null,
      };
    } else {
      this.checkWhy = null;
      this.why = { ...betWhy(rows, index), at, sheet };
    }
    this.whyTile = tile;
    setTimeout(() => this.whyPop?.nativeElement.focus({ preventScroll: true }));
  }

  closeWhy(refocus = false): void {
    if (!this.why && !this.checkWhy) return;
    this.why = null;
    this.checkWhy = null;
    if (refocus) this.whyTile?.focus({ preventScroll: true });
    this.whyTile = null;
  }

  // (a click anywhere off it and its tile shuts it; so does the list scrolling out from under it, or the
  // screen changing size)
  @HostListener('document:click', ['$event'])
  clickOff(event: MouseEvent): void {
    if ((this.why || this.checkWhy) && !(event.target as Element | null)?.closest('.bet-why, .bet-rank')) this.closeWhy();
  }

  @HostListener('window:resize')
  listMoved(): void {
    this.closeWhy();
  }

  // (Escape shuts it, focus back on its tile)
  @HostListener('document:keydown.escape')
  escape(): void {
    this.closeWhy(true);
  }

  // The slot handle: pulled, it swings down and springs back, and as it lands the rows spin in like reels
  pulling = false;
  spinning = false;
  pull(): void {
    if (this.pulling) return;
    this.closeWhy();
    this.pulling = true;
    setTimeout(() => (this.spinning = true), 280);
    setTimeout(() => (this.pulling = false), 700);
    setTimeout(() => (this.spinning = false), 2400);
  }
}

