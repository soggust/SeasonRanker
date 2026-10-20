import { Component, DestroyRef, ElementRef, HostListener, Injector, NgZone, OnDestroy, OnInit, ViewChild, afterNextRender, effect, inject, untracked } from '@angular/core';
import { fetchJson } from '@ranker/core/http';
import { TicketGrow } from './ticket-grow';
import { quietListener } from '@ranker/core/quiet-listener';
import { favorableGrade, tierLabel, tierOf, unranked } from './tiers';
import { NotePlayer, notePlayers } from './desk-notes';
import { CheckResearchView, researchView } from './check-research';
import { BetsView, betsView, chooseBetsView } from './book-view';
import { LinesService } from '../account/wallet/lines.service';
import { WalletService } from '../account/wallet/wallet.service';
import { Selection, modelGameOf, selectionKey } from '../account/wallet/wallet-math';
import { PriceWhy, botSelection } from '../account/wallet/game-lines.component';
import { SITE_SPORTS } from '@ranker/core/sports';
import { betSports } from './bet-sports';
import { FormSide, RecentForm, botForm, formSide, yourForm } from './recent-form';
import { ADMIN, canUse } from '../account/features';
import { SPORTS } from './desk-math';
import { insteadText } from '../player-card/analysis';
import { TickerSide, TickerTarget, americanOdds, compactRecord, recordTip, headshot, leagueLogo, tickerAria, tickerSide, tickerTarget } from './bet-format';
import { GameViewService } from '../game-view/game-view.service';
import { BetWhy, BetWhyRow, Confidence, PRACTICE_UNITS, PriceAt, WhatIfBase, betScoreText, betWhy, clearedKellyOf, edgeLine, flipLine, priceAt, signedPoints, stepPrice, whatIfCaption, whatIfOf } from './bet-why';
import { BET_KINDS, BandTally, BetKind, BetRow, ByLevel, GameInfo, Picks, bookRows, dropSportRows, fileRows, mergeSportRows, playerCardHref, playerRefOf, rowClickToggles, sportRows, sumRecords } from './book-rows';
// (the rows' types, for the page's other parts: book-rows.ts)
export { BET_KINDS, BetKind, BetRow, CheckResearch } from './book-rows';
import { PopoverAt, phoneSheet, popoverAt } from '@ranker/core/breakdown';
import { pickTeamColor, splitPick } from './pick-style';
import { BEST_BETS_LABEL, MenuDay, allKey, allLabel, allOf, MenuGame, MenuGameIn, MenuTeam, chosenSport, dayBand, defaultClosed, gameLine, gameMenu, gamePicksHead, groupKey, groupOf, linesOnlyGames, menuKey, menuOptionId, menuValues, shownEvents, sportChoice, sportFace, viewsShown } from './game-menu';
import { darkLogoOf, teamLook } from '../team-look';
import { LiveService } from './live.service';
import { QuoteSources, joinSuggestions, quoteOf, suggestionsOf, withLive } from './suggestions';
import type { LivePicks } from './live-tab.component';
import type { ModelBoard } from '../account/wallet/lines.service';
import type { GameBoard } from '../account/wallet/wallet-math';

// The Book (the sport bar's Book link, /book): the algorithm's top picks for every sport (each one's
// data/model/picks.json, written by every run of the model desk: libs/ranker/scripts/model/picks.mjs), ranked
// together by their Kelly score (value and likelihood: the edge on the price, scaled by what it pays; a bet
// without an edge on its price scores 0 or under, sorts last and reads "Pass", its band low). A row opens to
// its reasoning. (The NFL's AI bet desk, whose sheet once marked the picks it agreed with "Algorithm +
// Analyst", is retired (2026-10-14): no sport's AI analysis has betting angles.)
//
// An admin's (canUse('experimental')) list also has the CHECKs (picks.json's checks: markets the model is too
// far from the book on to bet, kept for the owner to look into), under the LOCKs and over the rest, in their
// lavender band with a "?" for a rank: not the bot's bets (their prices bet either side, the slip's bet not the
// bot's pick), the open row its write-up (the disagreement) and a note to the bot (desk-note.component.ts:
// Firestore's deskNotes, which the bettor reads on its next run). Nobody else sees them. Its open bets' rows
// take a note too (the same deskNotes/{pick id}: a player's news re-prices the game's open bets).

// (a game the bot has picks on: its board's key facts, its picks (the CHECKs among them) and its bets alone)
export type GameBoardPicks = { sport: string; event: string; start: string; matchup: string; picks: BetRow[]; betPicks: BetRow[] };

// (the game dropdown's chosen game, for its closed face: its words and its sport's icon)
type ChosenGame = MenuGame & { icon: string };

// (the why popover's own look: the bet's game, its price, the model against the book, the sentence on its place,
// a pass's reason)
interface WhyGame {
  sport: string;
  matchup: string;
  start: string | null;
}
// (the what-if price's view: its numbers said, the flip points, the caption)
interface WhatIfView {
  at: PriceAt;
  odds: string;
  own: string;
  moved: boolean;
  breakEven: string;
  edge: string;
  // (the edge in plain words at the price: "Edge +1.3 pts: the Bot 55.8% vs 54.5% to break even at −120 · Kelly 2.6%
  // of bankroll", bet-why.ts edgeLine)
  edgeLine: string;
  ev: string;
  kelly: string;
  tier: string;
  band: string;
  stake: string;
  flips: { text: string; title: string };
  caption: { text: string; title: string };
  held: string | null;
}

interface WhyLook {
  game: WhyGame | null;
  odds: string | null;
  model: number | null;
  book: number | null;
  sentence: string;
  reason: string | null;
}

// (one game on the ticker: the two sides (a logo or a fighter's face, the words if it fails: failed), their scores
// (none before it starts), its state, and its clock or final as words, or its start when it hasn't begun)
type TickerTeam = TickerSide & { failed?: boolean };
interface TickerItem {
  key: string;
  away: TickerTeam;
  home: TickerTeam;
  awayScore: number | null;
  homeScore: number | null;
  state: 'pre' | 'in' | 'post';
  text: string | null;
  start: string;
  // (what a click opens: tickerTarget; and its words, "Open Lions at Packers")
  target: TickerTarget;
  aria: string;
}

// (a lines-only game's key in the dropdown: its sport, matchup and ESPN event, "mlb|CLE @ TB|401700123")
const linesKey = (g: { sport: string; matchup: string; event: string }): string => `${g.sport}|${g.matchup}|${g.event}`;

// (a line alarm's cause in a few plain words: props.mjs lineAlarmOf's keys)
const LINE_CAUSE: Record<string, string> = {
  'line-questionable': 'he is questionable',
  'line-goalie': 'an unconfirmed goalie',
  'line-lineup': 'lineup not posted',
  'line-rest': 'a back-to-back',
  'line-back': 'teammates back',
  'line-pitch-count': 'a short pitch count',
  'line-teammates': 'teammates out',
};

// (the sports the bettor covers, as the site names them (bet-sports.ts): MMA, not ready for everyone, for someone
// who can use the experimental features alone, the Algorithm tab's gate; read when the page opens and again when the
// admin flag lands: syncSports)
const betSportsNow = () => betSports(SITE_SPORTS, SPORTS, canUse('experimental'));

// (the sport filter this visit chose, sessionStorage; none where storage is out of reach: a private window, a test)
const SPORT_KEY = 'ranker.bets.sport';
function storedSport(): string {
  try {
    return typeof sessionStorage === 'undefined' ? '' : (sessionStorage.getItem(SPORT_KEY) ?? '');
  } catch {
    return '';
  }
}
function storeSport(sport: string): void {
  try {
    if (sport) sessionStorage.setItem(SPORT_KEY, sport);
    else sessionStorage.removeItem(SPORT_KEY);
  } catch {
    // (nothing to keep it in)
  }
}

@Component({
  selector: 'book-page',
  // (the page's main content: the Book has no <main> of its own around it)
  host: { role: 'main' },
  templateUrl: './book-page.component.html',
  styleUrls: ['../../styles/components/book-page.scss'],
  standalone: false,
})
export class BookPageComponent implements OnInit, OnDestroy {
  // (a pick's own color, pick-style.ts: a prop its player's team's, a side the team it took's; a total, none:
  // the board's)
  pickColor(r: BetRow): string | null {
    const teams = r.game?.teams ?? [];
    const abbr = r.betType === 'player' ? null : ((r.side === 'home' ? teams[1] : teams[0])?.abbr ?? null);
    return pickTeamColor(r.sport ?? '', { total: r.betType === 'total', teamId: r.betType === 'player' ? r.playerTeam : null, abbr });
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

  // (a prop's player's card, his sport's app by his name: book-rows.ts playerCardHref; the face and the name link it)
  readonly cardHref = playerCardHref;
  // (a team logo too dark for the bare board: its halo, .logo-lift)
  readonly darkLogo = darkLogoOf;
  readonly playerRef = playerRefOf;

  hide(event: Event): void {
    (event.target as HTMLElement).style.visibility = 'hidden';
  }

  // (the model desk, the Algorithm: an admin's, and on the dev server)
  readonly desk = (): boolean => canUse('experimental');
  // (a note to the bot: a signed-in admin's alone, the dev server too (the rules keep only an admin's))
  readonly admin = ADMIN;
  readonly canUse = canUse;
  // (the page's About: its header's info button; an admin's has the Algorithm too)
  aboutOpen = false;
  readonly wallet = inject(WalletService);

  constructor() {
    // (a click anywhere, the list scrolling: outside Angular unless a breakdown is open to shut; the list's
    // scroll caught on its way down to it. The window resizing stays a HostListener: the page's layout follows it)
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    const open = () => !!(this.why || this.checkWhy);
    quietListener<MouseEvent>(zone, destroyRef, document, 'click', (event) => open() && !(event.target as Element | null)?.closest('.bet-why, .bet-meter, .tile-k'), (event) => this.clickOff(event));
    quietListener(zone, destroyRef, document, 'scroll', (event) => open() && !!(event.target as Element | null)?.classList?.contains('board-scroll'), () => this.closeWhy(), { capture: true, passive: true });
    // (the game list open: a click anywhere off it and its pill shuts it, the same quiet way)
    quietListener<MouseEvent>(zone, destroyRef, document, 'click', (event) => this.menuOpen && !(event.target as Element | null)?.closest('.book-game-wrap'), () => this.closeMenu(false));
    // (the signed-in user's newest settled bets: the recent form card's last five and streak, the Closed Bets tab;
    // one read of a few once they're followed (a page of the history already on hand stands in))
    this.wallet.wantRecent();
  }
  // (Open Bets: only with bets of the user's not yet settled; the last one settled, back to Place Bets)
  readonly hasOpen = (): boolean => canUse('book') && this.wallet.openBets().length > 0;
  // (Closed Bets: only with bets of the user's settled)
  // (already bet and still open: the stake, so the same bet isn't placed twice by mistake)
  // (by the pick's id and its side: the wallet's openOnPick)
  readonly placedOn = (r: BetRow): number => (r.pickId ? (this.wallet.openOnPick().get(`${r.pickId}|${r.side}`) ?? 0) : 0);
  // (the signed-in user's play money: on hand, and what's out on open bets; none at all signed out or before the
  // wallet loads. No record on it (the owner, 2026-10-19: its lifetime record, the tally's, read against the
  // Cashed bar's last seven days and looked wrong; the record is the wallet's and the Cashed bar's, by date range))
  readonly bankroll = (): { balance: number; atRisk: number; open: number } | null => {
    if (!canUse('book') || !this.wallet.loaded() || !this.wallet.wallet()) return null;
    const open = this.wallet.openBets();
    return { balance: this.wallet.balance(), atRisk: open.reduce((t, b) => t + b.stake, 0), open: open.length };
  };
  // (the Open tab's count: the user's bets not yet settled)
  readonly openCount = (): number => this.wallet.openBets().length;
  readonly hasClosed = (): boolean => canUse('book') && this.wallet.hasSettled();
  // (Live: the day's games as they're played (live-tab.component.ts, live.service.ts), the tab there whenever the
  // day has games on or still to come; and while it's the view showing with games on the card at all, so it
  // doesn't vanish under the viewer as the last game ends (ALL DONE TONIGHT). Its count: the games on now)
  readonly liveTab = inject(LiveService);
  readonly hasLive = (): boolean => this.liveTab.hasGames() || (betsView() === 'live' && this.liveTab.games().length > 0);
  readonly liveCount = (): number => this.liveTab.liveCount();
  // (Place Bets first; Open Bets (with the wallet) or the Algorithm (development only) once chosen in this
  // visit: book-view.ts)
  get view(): BetsView {
    const view = betsView();
    if (view === 'live') return this.hasLive() ? view : 'bets';
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
  // (the sports whose picks the page read: the site's that the bettor covers, MMA an admin's; the dropdown's names)
  private betSports = betSportsNow();
  // the filter: all games (the top 40 bets), or one game (its top 15, from all of its bets), by its matchup
  game = '';
  // (or one sport's best bets, every day's: the dropdown's sport heading chosen (game-menu.ts sportChoice); kept
  // for the visit in sessionStorage, as a game isn't (a game is gone by the next visit; a sport isn't). A game
  // chosen inside it opens that game, the sport still under it (the game's back is that sport's board); a game
  // of another sport, or Best bets · every game, clears it)
  sport = storedSport();
  readonly limit = 40;
  readonly gameLimit = 15;
  // (the CHECKs an admin's All Games shows, the biggest gaps first, over the 40 bets)
  readonly checkLimit = 10;
  open = new Set<number>();
  readonly insteadText = insteadText;
  // each game's venue and kickoff weather, from its picks ("nfl|CHI @ GB")
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
    // every sport's algorithm picks (each sport's file together, not one after another)
    await this.syncSports();
    // (the started games dropped each minute: the picks file is only rewritten hourly. Not if the page closed while
    // its files loaded: nothing would stop it)
    if (!this.closed)
      this.ticker = setInterval(() => {
        this.refreshPrices();
        this.dropStarted();
      }, 60_000);
  }

  // The sports on the page, kept to the list the viewer may see: the admin flag (features.ts ADMIN) lands when
  // Firebase's auth resolves, after the picks have loaded, and MMA is an admin's alone, so the owner's page learns
  // it should show the UFC picks after it has drawn the rest. The flag flipped on: the sports it hasn't read, read
  // and joined to the rows (book-rows.ts mergeSportRows: the others' rows kept as they are); off: that sport's
  // rows dropped. Each file read once, however many times the flag and the page's own start ask
  private readonly adminWatch = effect(() => {
    ADMIN();
    untracked(() => void this.syncSports());
  });
  // (the sports whose files the page has read, or is reading)
  private readonly loaded = new Set<string>();
  private reading = 0;
  private async syncSports(): Promise<void> {
    const sports = betSportsNow();
    this.betSports = sports;
    const wanted = new Set(sports.map((s) => s.id));
    // (a sport filter the viewer may not see (MMA's, signed out of an admin's account): Best bets)
    if (this.sport && !wanted.has(this.sport)) this.chooseSport('');
    for (const sport of [...this.loaded].filter((s) => !wanted.has(s))) this.dropSport(sport);
    const fresh = sports.filter((s) => !this.loaded.has(s.id));
    if (!fresh.length) {
      // (nothing to read, nothing on its way: the page has its (empty) list)
      if (!this.reading) this.rows ??= [];
      return;
    }
    for (const s of fresh) this.loaded.add(s.id);
    this.reading++;
    const get = (url: string) => fetchJson<unknown>(url, null, { cache: 'no-cache' });
    const files = await Promise.all(fresh.map(async (s) => ({ sport: s.id, picks: (await get(`/${s.id}/data/model/picks.json`)) as Picks | null })));
    this.reading--;
    if (this.closed) return;
    // (not a sport the flag dropped while its file loaded)
    for (const f of files) if (this.loaded.has(f.sport)) this.takeFile(f.sport, f.picks);
    this.rows ??= [];
    this.dropStarted();
    this.buildBoards();
  }

  // One sport's picks file onto the page: its rows joined to the others' (an open row stays open), its venues and
  // weather, the CHECK rule as the bettor publishes it (the page's words read from it, never a copy of its own),
  // its bands' seasons for the board's band headers, and when it was written
  private readonly files = new Map<string, Picks | null>();
  private takeFile(sport: string, picks: Picks | null): void {
    this.files.set(sport, picks);
    if (Number.isFinite(picks?.checkRule?.kelly)) this.checkBar = picks!.checkRule!.kelly;
    this.rows = mergeSportRows(this.rows ?? [], sport, fileRows(sport, picks, this.places));
    this.readFiles();
  }
  // (a sport the viewer may no longer see: its rows, venues and file gone; the dropdown and its chosen game follow
  // the rows (dropGone), the boards rebuilt)
  private dropSport(sport: string): void {
    this.loaded.delete(sport);
    this.files.delete(sport);
    for (const key of [...this.places.keys()].filter((k) => k.startsWith(`${sport}|`))) this.places.delete(key);
    this.rows = dropSportRows(this.rows ?? [], sport);
    this.readFiles();
    this.dropStarted();
    this.buildBoards();
  }
  // (what the page says of its files as a whole, from the files it has: the latest write, and each sport's bands'
  // seasons for the band headers (summed over the sports on the board when asked: bandRecord))
  private readFiles(): void {
    this.updated = null;
    this.records = new Map();
    // (the bot's recent form, the five sports' recent blocks joined: the Recent form card's The Bot side)
    this.botForm = botForm([...this.files.values()].map((p) => p?.recent));
    for (const [sport, picks] of this.files) {
      if (!picks?.picks?.length && !picks?.checks?.length) continue;
      if (!this.updated || picks.at > this.updated) this.updated = picks.at;
      // (this calendar year's by band (picks.mjs recordBlocks: the replayed record joined to the real bets since the
      // Bot's latest version); an older file's all-time byLevel)
      this.records.set(sport, picks.record?.year?.byLevel ?? picks.record?.byLevel);
      if (picks.record?.caveat) this.recordCaveat = picks.record.caveat;
    }
  }
  // (the band headers' hover: what the record is, with the honesty line the bettor wrote)
  recordCaveat: string | null = null;
  get bandRecordTitle(): string {
    return `The Bot's record on this band's picks this calendar year, every sport's, and the units it made or lost.${this.recordCaveat ? ` ${this.recordCaveat}` : ''}`;
  }

  // Play betting: each game's every line (<game-lines>, ESPN's DraftKings board, the bot's picks lit), its
  // ESPN id, start and the bot's picks on it, by the game filter's key; and the games on the boards the bot
  // has no pick on, for the dropdown (their lines only). The slip (<bet-slip>) and #wallet do the rest.
  readonly lines = inject(LinesService);
  // (each board's picks, the CHECKs among them, and its bets alone (betPicks): an admin's lines light the CHECKs too)
  boards = new Map<string, GameBoardPicks>();
  // (built again from the rows whenever they change for a sport joining or leaving: a lines-only board, made on
  // demand (boardFor), is made again the same way; the players cache (playersFor) goes by the rows' ids, kept)
  private buildBoards(): void {
    this.boards = new Map();
    for (const r of this.rows ?? []) {
      const event = r.pickId?.split(':')[0];
      if (!r.game || !event) continue;
      const key = this.gameKey(r);
      const b = this.boards.get(key) ?? { sport: r.sport, event, start: r.game.kickoff ?? r.game.date, matchup: r.game.matchup, picks: [], betPicks: [] };
      b.picks.push(r);
      if (!r.check) b.betPicks.push(r);
      this.boards.set(key, b);
    }
    // (each sport's board on the days the picks are on, and every betting sport's today and tomorrow whether the
    // bot picked anything there or not: the lines, and the games without a pick, so a game it passed on is still
    // there to bet)
    const now = Date.now();
    const days = [now, now + 24 * 3600e3].map((t) => new Date(t).toISOString());
    void this.lines.games([...this.boards.values(), ...SPORTS.flatMap((sport) => days.map((start) => ({ sport, start })))]);
    // (and each sport's own betting board: the games ESPN has no board for (a UFC card's bouts) come from it,
    // into the dropdown and the ticker with the rest: lines.service boards)
    for (const s of this.betSports) void this.lines.model(s.id);
  }

  // (the prices again, for the live re-pricing: ESPN's scoreboards for today, tomorrow and the boards' games (a
  // minute's cache), each sport's betting board (five minutes'))
  private refreshPrices(): void {
    const now = Date.now();
    const days = [now, now + 24 * 3600e3].map((t) => new Date(t).toISOString());
    const games = [...this.lines.modelBoards()].flatMap(([sport, b]) => (b.games ?? []).map((g) => ({ sport, start: g.start })));
    void this.lines.games([...games, ...this.betSports.flatMap((s) => days.map((start) => ({ sport: s.id, start })))]);
    for (const s of this.betSports) void this.lines.model(s.id);
  }

  // (the ticker shown along the page's foot: games on the boards, on any view but the desk's and Live's; the page's
  // ticker-on class lifts the phone stub of the ticket over it, book-page.scss --book-foot)
  get tickerShown(): boolean {
    return this.view !== 'desk' && this.view !== 'live' && this.tickerItems.length > 0;
  }

  // The ticker along the page's foot: every game on the boards the page has already read (ESPN's scoreboards for
  // today and tomorrow, lines.games above: nothing fetched for it), finals first, then the games under way with
  // their clock, then the ones to come with their start; a sport chosen, its games alone; built again only when
  // the boards or the sport change. Empty, the strip hides
  private tickerFor: { boards: unknown; sport: string; items: TickerItem[] } | null = null;
  get tickerItems(): TickerItem[] {
    const boards = this.lines.boards();
    const sport = this.sport;
    if (this.tickerFor?.boards !== boards || this.tickerFor.sport !== sport) {
      const order = { post: 0, in: 1, pre: 2 };
      const games = [...boards.values()].filter((g) => g.away.abbr && g.home.abbr && (!sport || g.sport === sport)).sort((a, b) => order[a.state] - order[b.state] || a.start.localeCompare(b.start));
      const items = games.slice(0, 30).map((g): TickerItem => ({
        key: `${g.sport}|${g.event}`,
        away: tickerSide(g.sport, g.away),
        home: tickerSide(g.sport, g.home),
        awayScore: g.state === 'pre' ? null : g.away.score,
        homeScore: g.state === 'pre' ? null : g.home.score,
        state: g.state,
        // (a final as ESPN says it, "FINAL" or "FINAL/OT"; a game under way its clock, "4:12 - 3RD")
        text: g.state === 'pre' ? null : (g.detail || (g.state === 'post' ? 'Final' : 'Live')).toUpperCase(),
        start: g.start,
        target: tickerTarget(g),
        aria: tickerAria(tickerSide(g.sport, g.away), tickerSide(g.sport, g.home)),
      }));
      this.tickerFor = { boards, sport, items };
    }
    return this.tickerFor.items;
  }

  // (the games on ESPN's boards, not begun, with DraftKings' lines, that the bot has no pick on: in the dropdown
  // with the picked ones, their lines only. A game with picks on show is counted from them; one with none on show
  // (a CHECK's alone, not an admin) is here. Each keyed by its event too (linesKey): a series' games on
  // consecutive days share a matchup, and the next one, or one beside a picked game of the same two teams, is
  // its own game)
  private linesOnly(): MenuGameIn[] {
    const out: MenuGameIn[] = [];
    // (a game with a row on show on it, a bet or a suggestion, is a picked one: its rows count it (pickedGames).
    // Only a row on show: a game whose picks the list hides (a practice pick with no edge) is here by its lines,
    // never gone from the dropdown (game-menu.ts linesOnlyGames))
    for (const g of linesOnlyGames(this.lines.boards().values(), shownEvents(this.listed))) {
      out.push({ key: linesKey(g), sport: g.sport, matchup: g.matchup, start: g.start, count: null, teams: [g.away, g.home].map((t) => this.menuTeam(g.sport, t.abbr, t.logo)) });
    }
    return out;
  }

  // (the chosen game's board: one with picks, or one from the boards alone)
  // (a board's picks as this viewer has them: an admin's with the CHECKs)
  boardPicks(b: GameBoardPicks | null | undefined): BetRow[] {
    return !b ? [] : this.desk() ? b.picks : b.betPicks;
  }

  boardFor(key: string): GameBoardPicks | null {
    const known = this.boards.get(key);
    if (known) return known;
    // (a game with suggestions alone: its board from its rows, no bets of the Bot's on it)
    const row = this.listed.find((r) => r.suggested && r.game && this.gameKey(r) === key);
    if (row?.game && row.pickId) {
      const board = { sport: row.sport, event: row.pickId.split(':')[0], start: row.game.kickoff ?? row.game.date, matchup: row.game.matchup, picks: [], betPicks: [] };
      this.boards.set(key, board);
      return board;
    }
    for (const g of this.lines.boards().values()) {
      if (linesKey(g) === key) {
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
    this.minute++;
    const open = (this.rows ?? []).filter((r) => !r.game?.kickoff || Date.parse(r.game.kickoff) > now);
    if (!this.rows || open.length !== this.rows.length) this.rows = open;
    this.dropGone();
  }

  // (a game chosen keeps its place while it's in the dropdown: with bets left, or its lines alone, not begun.
  // Gone, the list is Best Bets again: checked each minute, and whenever the boards change (a lines-only game's
  // own board, refreshed while it's chosen, is what finds it under way), before the page is drawn again)
  private dropGone(): void {
    if (this.game && !this.menu().games.has(this.game)) this.game = '';
  }
  // (the ticket growing over the recent form as its first bet lands, and back as it empties (ticket-grow.ts): its
  // box measured here, before the page's has-ticket class lands (a component's effect runs ahead of its view's
  // refresh), and played out after the render; the first run only notes where it starts)
  @ViewChild('side') sideCol?: ElementRef<HTMLElement>;
  private readonly injector = inject(Injector);
  private readonly ticketGrow = new TicketGrow();
  private ticketFull: boolean | null = null;
  private readonly ticketWatch = effect(() => {
    const full = this.wallet.slip().length > 0;
    untracked(() => {
      const was = this.ticketFull;
      this.ticketFull = full;
      if (was === null || was === full) return;
      this.ticketGrow.measure(this.sideCol?.nativeElement);
      afterNextRender(() => this.ticketGrow.grow(this.sideCol?.nativeElement), { injector: this.injector });
    });
  });
  private readonly boardsWatch = effect(() => {
    this.lines.boards();
    untracked(() => this.dropGone());
  });

  ngOnDestroy(): void {
    this.closed = true;
    if (this.ticker) clearInterval(this.ticker);
  }

  // A ticker game clicked: a team sport's game view on its state's tab (tickerTarget), over the page; a UFC
  // bout chosen in the game dropdown (its key there, if it has one; else the MMA games), on Place Bets
  readonly gameView = inject(GameViewService);
  openTick(t: TickerItem): void {
    const to = t.target;
    if (to.kind === 'game') {
      void this.gameView.open({ event: to.event }, to.tab, to.league);
      return;
    }
    this.view = 'bets';
    const games = this.menu().games;
    const key = to.keys.find((k) => games.has(k));
    if (key) this.chooseGame(key);
    else this.chooseSport('mma');
  }

  // (a ticker logo ESPN hasn't: the dark one falls back to the plain one, then the side's words take its place)
  tickImgError(event: Event, side: TickerTeam): void {
    const img = event.target as HTMLImageElement;
    if (img.src.includes('/500-dark/')) img.src = img.src.replace('/500-dark/', '/500/');
    else side.failed = true;
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

  // The bets in the chosen game; none chosen, the chosen sport's (book-rows.ts sportRows); neither, all of them.
  // The chips, the bands, their counts and the off-the-board line all run from these
  get inGame(): BetRow[] {
    const rows = this.listed;
    return this.game ? rows.filter((r) => this.gameKey(r) === this.game) : sportRows(rows, this.sport);
  }

  // The rows this viewer sees: an admin's every one, the CHECKs among them; anyone else's the bets alone (kept till
  // the rows or the admin flag change: the flag can arrive after the picks)
  // The Bot's bets with their live prices beside the locked ones, and the suggestions (suggestions.ts: every side
  // on the sports' boards with an edge at the latest price, priced again as the prices move), one list in the
  // board's order; worked again when the rows, the boards, the betting boards, the admin flag or the minute change
  private listedFor: { rows: BetRow[] | null; desk: boolean; boards: unknown; models: unknown; at: number | null; minute: number; list: BetRow[] } | null = null;
  get listed(): BetRow[] {
    const desk = this.desk();
    const boards = this.lines.boards();
    const models = this.lines.modelBoards();
    const at = this.lines.loadedAt();
    const f = this.listedFor;
    if (!f || f.rows !== this.rows || f.desk !== desk || f.boards !== boards || f.models !== models || f.at !== at || f.minute !== this.minute) {
      // (a practice pick without an edge at the current price off the list: book-rows.ts bookShows)
      const rows = this.rows === null ? [] : bookRows(this.withSuggestions(this.rows, boards, models, at));
      this.listedFor = { rows: this.rows, desk, boards, models, at, minute: this.minute, list: desk ? rows : rows.filter((r) => !r.check) };
    }
    return this.listedFor!.list;
  }
  // (each suggestion's id, by its market's side: kept for the visit, so an open row stays open as its price moves;
  // well past the picks' own ids)
  private readonly suggestionIds = new Map<string, number>();
  private suggestionId(key: string): number {
    let id = this.suggestionIds.get(key);
    if (id === undefined) this.suggestionIds.set(key, (id = 1_000_000 + this.suggestionIds.size));
    return id;
  }
  // (the minute, ticked by dropStarted: a suggestion whose game has begun goes with it)
  private minute = 0;
  private withSuggestions(rows: BetRow[], boards: Map<string, GameBoard>, models: Map<string, ModelBoard>, at: number | null): BetRow[] {
    const now = Date.now();
    const sources = (sport: string, event: string): QuoteSources => {
      const board = models.get(sport);
      return { espn: boards.get(`${sport}|${event}`) ?? null, espnAt: at, model: modelGameOf(board?.games, event) ?? null, modelAt: board?.at ?? null };
    };
    const bets = rows.map((r) => (r.check || !r.pickId ? r : withLive(r, quoteOf(r, sources(r.sport, r.pickId.split(':')[0])))));
    const suggested = [...models].flatMap(([sport, board]) => (this.loaded.has(sport) ? suggestionsOf(sport, board, now, (g) => sources(sport, g.id)) : []));
    return joinSuggestions(bets, suggested, (key) => this.suggestionId(key));
  }
  // (the Live tab's read on each game: the Bot's bets, and the suggestions on it, by "sport|matchup")
  private liveFor: { list: BetRow[]; map: Map<string, LivePicks> } | null = null;
  get liveBoards(): Map<string, LivePicks> {
    const list = this.listed;
    if (this.liveFor?.list !== list) {
      const map = new Map<string, LivePicks>();
      for (const r of list) {
        if (r.check) continue;
        const key = this.gameKey(r);
        const g = map.get(key) ?? { betPicks: [], suggestions: [] };
        (r.suggested ? g.suggestions! : g.betPicks).push(r);
        map.set(key, g);
      }
      this.liveFor = { list, map };
    }
    return this.liveFor.map;
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

  // The game dropdown (game-menu.ts): a header for each day (in the viewer's time zone; London's morning game first
  // on Sunday), under it each sport with a game that day (its icon once) by its first game, and under that its
  // every game early to late: the ones with bets with how many each shows, the rest marked lines only. Built again
  // only when the rows on show (an admin's with the CHECKs' games and counts) or the boards change, not on every
  // check of the page
  private menuFor: { list: BetRow[]; boards: unknown; desk: boolean; days: MenuDay[]; games: Map<string, ChosenGame> } | null = null;
  get gameMenu(): MenuDay[] {
    return this.menu().days;
  }
  // (the chosen game as the closed dropdown shows it: its sport's icon and its words)
  get chosenGame(): ChosenGame | null {
    if (!this.game) return null;
    // (never one gone from the list: dropGone has made that Best Bets)
    return this.menu().games.get(this.game) ?? null;
  }
  private menu(): { days: MenuDay[]; games: Map<string, ChosenGame> } {
    const list = this.listed;
    const boards = this.lines.boards();
    const desk = this.desk();
    if (this.menuFor?.list !== list || this.menuFor.boards !== boards || this.menuFor.desk !== desk) {
      const days = gameMenu([...this.pickedGames(list), ...this.linesOnly()], this.betSports);
      const games = new Map(days.flatMap((d) => d.sports.flatMap((s) => s.games.map((g) => [g.key, { ...g, icon: s.icon }] as const))));
      this.menuFor = { list, boards, desk, days, games };
    }
    return this.menuFor;
  }
  // (the games with bets, each with how many it shows: its bets, gameLimit at most, and an admin's CHECKs on it,
  // all shown)
  private pickedGames(rows: BetRow[]): MenuGameIn[] {
    const byGame = new Map<string, MenuGameIn & { count: number; bets: number }>();
    for (const r of rows) {
      if (!r.game) continue;
      const key = this.gameKey(r);
      const game = byGame.get(key) ?? { key, sport: r.sport, matchup: r.game.matchup, start: r.game.kickoff ?? null, date: r.game.date, count: 0, bets: 0, teams: r.game.teams?.map((t) => this.menuTeam(r.sport, t.abbr, t.logo)) };
      if (r.check) game.count++;
      else if (game.bets < this.gameLimit) {
        game.bets++;
        game.count++;
      }
      byGame.set(key, game);
    }
    return [...byGame.values()];
  }

  // (how many bets Best bets shows, for the dropdown's face: the list's bets, the top 40 at most; a sport's
  // heading, its own)
  get bestCount(): number {
    return this.sportCount('');
  }
  sportCount(sport: string): number {
    return Math.min(this.limit, sportRows(this.listed, sport).filter((r) => !r.check).length);
  }

  // The dropdown's value: the chosen game's key, else the chosen sport (game-menu.ts sportChoice), else Best
  // bets (''); and what it chose: a sport's heading, a game, or Best bets · every game (both filters off)
  readonly sportChoice = sportChoice;
  readonly dayBand = dayBand;
  readonly groupKey = groupKey;
  readonly allKey = allKey;
  readonly allLabel = allLabel;
  // (a sport row's mark in the list: the league's own logo (bet-format.ts leagueLogo, ESPN's, as the wallet's and
  // the desk's tables show it) for the four leagues; MMA keeps its gloves icon)
  leagueMark(sport: string): string | null {
    return ['nfl', 'nhl', 'nba', 'mlb'].includes(sport) ? leagueLogo(sport) : null;
  }
  readonly optId = menuOptionId;
  get choice(): string {
    return this.game || (this.sport ? sportChoice(this.sport) : '');
  }

  // The dropdown's open list, the page's own (a listbox under the pill, not Material's overlay): Best bets ·
  // every game first, then each day on a band, under it each sport's heading (its icon, name and count) and its
  // games (the two teams' faces, the matchup, its start and its count). Open, the list has the focus and
  // aria-activedescendant names the lit choice; the arrows walk it, Enter takes it, Escape shuts it (game-menu.ts
  // menuKey); a click anywhere off it shuts it too (the constructor's listener). Shut, the pill takes the focus
  // back when the keyboard shut it
  menuOpen = false;
  active = '';
  // (the sport headings folded shut, by groupKey (folded: the page's closed is its lifetime flag): a busy list opens with every sport shut but the chosen game's
  // and the chosen sport's (game-menu.ts defaultClosed); the heading's chevron, or Right and Left, folds one)
  folded = new Set<string>();
  isOpen(day: string, sport: string): boolean {
    return !this.folded.has(groupKey(day, sport));
  }
  toggleGroup(key: string): void {
    if (this.folded.has(key)) this.folded.delete(key);
    else this.folded.add(key);
  }
  @ViewChild('gamePill') gamePill?: ElementRef<HTMLElement>;
  @ViewChild('gameList') gameList?: ElementRef<HTMLElement>;
  toggleMenu(): void {
    if (this.menuOpen) this.closeMenu(false);
    else this.openMenu();
  }
  openMenu(): void {
    this.menuOpen = true;
    this.folded = defaultClosed(this.gameMenu, this.game, this.sport);
    // (the lit row: the chosen game, or the chosen sport's first "All ..." row (its heading when folded), or Best Bets)
    const values = menuValues(this.gameMenu, this.folded);
    this.active = this.game || (this.sport ? (values.find((v) => allOf(v) === this.sport) ?? values.find((v) => chosenSport(v) === this.sport) ?? '') : '');
    // (the list is in the DOM on the next check: then the focus and the lit row into view)
    setTimeout(() => {
      this.gameList?.nativeElement.focus({ preventScroll: true });
      this.showActive();
    });
  }
  closeMenu(refocus: boolean): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    if (refocus) this.gamePill?.nativeElement.focus({ preventScroll: true });
  }
  // (the pill's keys: the arrows open the list (Enter and Space click it); Escape with the list open shuts it)
  pillKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.menuOpen) this.openMenu();
      else this.gameList?.nativeElement.focus({ preventScroll: true });
    }
  }
  listKey(event: KeyboardEvent): void {
    const action = menuKey(event.key, menuValues(this.gameMenu, this.folded), this.active);
    if (!action) return;
    if (event.key !== 'Tab') event.preventDefault();
    // (Escape here alone: the board's own Escape (the why popover's) stays out of it)
    event.stopPropagation();
    if (action.kind === 'move') {
      this.active = action.value;
      this.showActive();
    } else if (action.kind === 'choose') {
      // (a heading's Enter folds or unfolds it, the list staying open; an "All ..." row's chooses its sport)
      const all = allOf(this.active);
      if (chosenSport(this.active) !== null) this.toggleGroup(this.active);
      else this.pick(all !== null ? sportChoice(all) : this.active, true);
    }
    else if (action.kind === 'expand' || action.kind === 'collapse') {
      // (on a heading: unfold or fold its games; Left on a game: up to its heading)
      if (chosenSport(this.active) !== null) {
        if (action.kind === 'expand') this.folded.delete(this.active);
        else this.folded.add(this.active);
      } else if (action.kind === 'collapse') {
        const heading = groupOf(this.gameMenu, this.active);
        if (heading) {
          this.active = heading;
          this.showActive();
        }
      }
    } else this.closeMenu(event.key === 'Escape');
  }
  // (a choice taken from the list, by a click or Enter: chosen, the list shut)
  pick(value: string, refocus = false): void {
    this.choose(value);
    this.closeMenu(refocus);
  }
  private showActive(): void {
    document.getElementById(menuOptionId(this.active))?.scrollIntoView({ block: 'nearest' });
  }
  // (a team's face in the list: its logo's address under its sport's site (a full address as it is: ESPN's, a
  // fighter's headshot), or the site's own logo for its abbreviation when the board has none)
  private menuTeam(sport: string, abbr: string, logo: string | null): MenuTeam {
    const own = logo ?? teamLook(sport, abbr).logo;
    return { abbr, logo: !own ? null : /^https?:/.test(own) ? own : `/${sport}/${own}` };
  }
  choose(value: string): void {
    const sport = chosenSport(value);
    if (sport !== null) this.chooseSport(sport);
    else if (value) this.chooseGame(value);
    else {
      this.chooseSport('');
      this.chooseGame('');
    }
  }
  // (the closed dropdown's words with a sport chosen: "NFL · Best Bets", with its icon (MMA's; the leagues their mark))
  get chosenSport(): { label: string; icon: string; name: string } | null {
    if (!this.sport) return null;
    const s = this.menu().days.flatMap((d) => d.sports).find((x) => x.sport === this.sport);
    return { label: sportFace(this.sport, this.betSports), icon: s?.icon ?? 'sports', name: this.betSports.find((x) => x.id === this.sport)?.label ?? this.sport.toUpperCase() };
  }
  chooseSport(sport: string): void {
    if (sport !== this.sport) {
      this.sport = sport;
      storeSport(sport);
    }
    this.game = '';
    this.closeWhy();
  }

  // (a game picked from the dropdown, or no game (''): the list's filter, as before; a game of another sport than
  // the one chosen drops the sport filter)
  chooseGame(key: string): void {
    if (key && this.sport && !key.startsWith(`${this.sport}|`)) {
      this.sport = '';
      storeSport('');
    }
    this.game = key;
    this.gamePicksOpen = false;
    this.closeWhy();
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
  // (no edge on its price: an older bet the bot made for the data, never one to make; since Oct 13, 2026 any edge
  // is a Like at the least and no edge isn't bet); a fade "Fade"
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

  // (a click on the row itself, not one of its controls nor its open content: the chevron's toggle; book-rows.ts
  // rowClickToggles)
  rowClick(id: number, event: MouseEvent): void {
    if (rowClickToggles(event.target as Element | null)) this.toggle(id);
  }

  toggle(id: number): void {
    if (!this.open.delete(id)) this.open.add(id);
  }

  // ---------------------------------------------------------------------------
  // Why a bet ranks where it does: its rank tile clicked (or Enter / Space on it) opens how its score is
  // built (bet-why.ts), as the grid's rank tile does
  // ---------------------------------------------------------------------------
  why: (BetWhy & { at: PopoverAt; sheet: boolean; look: WhyLook; wi: WhatIfBase | null }) | null = null;
  // (the popover's what-if price: the price it's at and its numbers there, worked again on each nudge; the page's
  // alone, nothing saved, no bet changed: bet-why.ts priceAt and flipsAt)
  whatIf: WhatIfView | null = null;
  // (the what-if's own price a suggestion's latest one, not a price the Bot took)
  whyLatest = false;
  @ViewChild('whyPop') whyPop?: ElementRef<HTMLElement>;
  private whyTile: HTMLElement | null = null;
  readonly signedPoints = signedPoints;
  readonly betScoreText = betScoreText;

  // (a CHECK's popover, its "?" clicked: the model's chance against the book's, the gap, the model's Kelly, why
  // it isn't bet)
  checkWhy: {
    id: number;
    name: string;
    game: WhyGame | null;
    at: PopoverAt;
    sheet: boolean;
    kelly: number | null;
    model: number | null;
    fair: number | null;
    gap: number | null;
    // (a prop's: the model's mean against the book's implied one, his record at the line on this side)
    means: string | null;
    record: string | null;
    cause: string;
    reason: string | null;
    // (turned a PASS since it was shown: why)
    passed: string | null;
    // (its news research, finished: research.mjs; null where none)
    research: CheckResearchView | null;
  } | null = null;

  // (the CHECK rule, picks.json's checkRule: a role's CHECK only at this model Kelly or more; null till read)
  checkBar: number | null = null;

  // (a CHECK's Kelly, the one it's judged and shown by: its cleared Kelly (checks.mjs checkKelly, 2026-10-18: the
  // stake's Kelly at the chance it'd be bet at with its doubt answered, never the model's own number); picks.json's,
  // else worked out from its chances and price at its line's starting trust)
  checkKelly(r: BetRow): number | null {
    if (Number.isFinite(r.checkKelly)) return r.checkKelly!;
    const market = r.betType === 'player' ? 'prop' : r.betType === 'moneyline' ? 'ml' : r.betType;
    return clearedKellyOf(r.model, r.fair, typeof r.price === 'number' ? r.price : null, market, r.line ?? null);
  }

  // (why a CHECK isn't bet, in a few words: its cause)
  checkCauseText(r: BetRow): string {
    // (outside the NFL a role CHECK of 2026-10-13 is a far line with its cause (props.mjs lineAlarmOf: line-rest,
    // line-goalie...), its cause in plain words)
    if (r.checkCause === 'role' && /^line-/.test(r.roleReason ?? '')) return `The line reads news the Bot hasn't (${LINE_CAUSE[r.roleReason!] ?? 'a role change'})`;
    if (r.checkCause === 'role') return `His role is changing${r.roleReason ? ` (${r.roleReason})` : ''}`;
    if (r.checkCause === 'news') return `News on his team's ${r.newsUnit ?? 'unit'}`;
    return 'Too far from the market';
  }

  // (a CHECK that turned a PASS since it was shown: checks.mjs, its price frozen where it stood)
  passed(r: BetRow): boolean {
    return r.resolved?.as === 'passed';
  }

  // The rank tile's hover: its place (a lock's, above the ranks), its Kelly score and its chance ("#2 of 40 ·
  // Kelly +3.12 · 64% to win")
  rankTitle(r: BetRow, i: number, n: number, locks: number): string {
    if (r.check) {
      const k = this.checkKelly(r);
      const chances = `the Bot ${r.chance ?? '–'}%, the Book's ${Number.isFinite(r.fair) ? Math.round(r.fair! * 100) : '–'}%`;
      if (this.passed(r)) return `Passed · no longer a CHECK: ${r.resolved?.why ?? 'under the CHECK bar now'} (${chances})`;
      // (too big to bet blind only where it is: at the bar or over; a news CHECK's held for the news, at any Kelly)
      const kText = k === null ? 'the Bot' : `a ${betScoreText(k * 100)} Kelly with its doubt cleared`;
      const held = r.checkCause === 'news' ? 'held for the news' : k !== null && this.checkBar !== null && k >= this.checkBar ? 'too big to bet blind' : 'kept for a look';
      return `CHECK · ${kText}, ${held}: ${this.checkCauseText(r).toLowerCase()} (${chances})`;
    }
    const place = unranked(r.confidence) ? tierLabel(r.confidence!) : `#${i + 1 - locks} of ${n - locks}`;
    return `${place} · Kelly ${betScoreText(r.sureness * 100)}${r.chance != null ? ` · ${r.chance}% to win` : ''}${r.suggested ? ' · suggested at the latest price' : ''}`;
  }

  // A price's K score button on the game view: the bot's pick, its own popover (its row's, as its meter opens
  // it); any other price, the popover built from what the board has on it (bet-why.ts betWhy over the one bet: its
  // Kelly score, its chance and its price; no neighbors, no parts beyond the edge on the price)
  priceWhy(at: PriceWhy, event: Event): void {
    const shown = this.shown;
    const index = at.bot ? shown.findIndex((r) => r.pickId === at.bot!.pickId && r.side === at.bot!.side) : -1;
    if (index >= 0) {
      this.toggleWhy(index, event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const id = -1;
    if (this.why?.id === id) {
      this.closeWhy(true);
      return;
    }
    const tile = event.currentTarget as HTMLElement;
    const confidence: Confidence | null = at.tier === 'lock' ? 'lock' : at.tier === 'check' ? 'check' : at.tier === 'love' ? 'high' : at.tier === 'like' ? 'medium' : at.tier === 'pass' ? 'low' : null;
    const row: BetWhyRow = { id, pick: at.words, market: at.market, confidence, sureness: at.kelly, price: at.odds, ...(at.chance === null ? {} : { chance: Math.round(at.chance * 100), p: at.chance }), edge: at.kelly > 0, ...(at.cap === 'medium' || at.cap === 'high' ? { cap: at.cap } : {}) };
    this.checkWhy = null;
    const w = betWhy([row], 0);
    const wi = whatIfOf(row, !!at.bot);
    this.whyLatest = false;
    // (a guard's pass (the board's sr, DECISIONS.md D31: no silent skip): the popover says the bot passes and why, not
    // its rank)
    const look = this.whyLook(w, row, at.game);
    this.why = { ...w, at: popoverAt(tile, 420), sheet: phoneSheet(), look: at.reason ? { ...look, sentence: 'The Bot passes on this one: a guard stops it, whatever its Kelly score.', reason: `Why: ${at.reason}.` } : look, wi };
    this.priceTo(wi?.odds ?? null);
    this.whyTile = tile;
    setTimeout(() => this.whyPop?.nativeElement.focus({ preventScroll: true }));
  }

  // The popover's own look (The Book): the bet's game, its price, the model against the book, a sentence on its
  // place beside its neighbors (a pass's or a fade's, why it isn't bet), all from what betWhy and the row already
  // hold
  private whyGame(r: BetRow): WhyGame | null {
    return r.game ? { sport: r.sport.toUpperCase(), matchup: r.game.matchup, start: r.game.kickoff ?? null } : null;
  }
  private whyLook(w: BetWhy, r: BetWhyRow & { price?: number; chance?: number; fair?: number; strength?: string; reason?: string; pick: string }, game: WhyGame | null): WhyLook {
    const m = this.meter({ chance: r.chance, price: r.price, fair: r.fair } as BetRow);
    // (its place alone: the comparison with its neighbors dropped, the owner's, 2026-10-19: keep it lean)
    let sentence: string;
    if (w.noEdge) sentence = `${w.levelText}: the Bot tracks it, it doesn't bet it.`;
    else if (w.place === 'Lock') sentence = 'A lock, above the ranks.';
    else if (w.of <= 1) sentence = 'The one bet on this board.';
    else sentence = `Ranked ${w.place} of ${w.of} on the board.`;
    const pass = w.noEdge || r.strength === 'fade';
    return {
      game,
      odds: Number.isFinite(r.price) ? americanOdds(r.price!) : null,
      model: m?.model ?? null,
      book: m?.book ?? null,
      sentence,
      reason: pass && r.reason ? (r.strength === 'fade' ? insteadText(r.pick) : r.reason) : null,
    };
  }

  // (where the chosen game is played, for the game view's header: its picks' venue, where they carry one)
  venueOf(b: GameBoardPicks): string | null {
    const info = this.places.get(`${b.sport}|${b.matchup}`);
    return info?.stadium ?? info?.city ?? null;
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
    // (hung under the meter, or over it when there's more room above; inside the screen's edges, no taller
    // than the room it has; phones: a sheet along the bottom: the breakdowns' shared placing, core/breakdown.ts)
    const at = popoverAt(tile, 420);
    const sheet = phoneSheet();
    // (a CHECK's: no rank to build, its disagreement instead)
    if (row.check) {
      this.why = null;
      const model = row.model ?? null;
      const fair = row.fair ?? null;
      this.checkWhy = {
        id: row.id,
        name: row.pick,
        game: this.whyGame(row),
        at,
        sheet,
        kelly: this.checkKelly(row),
        model: model === null ? null : Math.round(model * 1000) / 10,
        fair: fair === null ? null : Math.round(fair * 1000) / 10,
        gap: Number.isFinite(row.gap) ? Math.round(Math.abs(row.gap!) * 1000) / 10 : model !== null && fair !== null ? Math.round(Math.abs(model - fair) * 1000) / 10 : null,
        means: Number.isFinite(row.mean) && Number.isFinite(row.implied) ? `${row.mean!.toFixed(2)} vs ${row.implied!.toFixed(2)}` : null,
        record: row.lineRecord ? `${row.side ?? 'over'} in ${Math.round((row.side === 'under' ? 1 - row.lineRecord.over : row.lineRecord.over) * 100)}% of ${row.lineRecord.n} weighted games` : null,
        cause: this.checkCauseText(row),
        reason: row.checkReason ?? null,
        passed: this.passed(row) ? (row.resolved?.why ?? 'under the CHECK bar now') : null,
        research: researchView(row.research),
      };
    } else {
      this.checkWhy = null;
      const w = betWhy(rows, index);
      // (a suggestion's what-if a price the Bot didn't take: its band the price's alone)
      const wi = whatIfOf(row, !row.suggested);
      this.whyLatest = !!row.suggested;
      const look = this.whyLook(w, row, this.whyGame(row));
      this.why = { ...w, at, sheet, look: row.suggested ? { ...look, reason: "Suggested at the latest price, not one of the Bot's bets: its band moves as the price does." } : look, wi };
      this.priceTo(wi?.odds ?? null);
    }
    this.whyTile = tile;
    setTimeout(() => this.whyPop?.nativeElement.focus({ preventScroll: true }));
  }

  // The what-if price: a step up the books' ladder (+1, a price that pays more) or down
  // (its own click kept to itself: never the outside click that shuts the popover)
  nudgePrice(dir: 1 | -1, event?: Event): void {
    event?.stopPropagation();
    if (this.whatIf) this.priceTo(stepPrice(this.whatIf.at.odds, dir));
  }
  private priceTo(odds: number | null): void {
    const base = this.why?.wi;
    if (!base || odds === null) {
      this.whatIf = null;
      return;
    }
    const at = priceAt(base, odds);
    const flips = flipLine(base, odds);
    const sign = (v: number) => (v >= 0 ? '+' : '−');
    this.whatIf = {
      at,
      odds: americanOdds(at.odds).replace('-', '−'),
      own: americanOdds(base.odds).replace('-', '−'),
      moved: at.odds !== base.odds,
      breakEven: `${(at.breakEven * 100).toFixed(1)}%`,
      edge: `${sign(at.edge)}${Math.abs(at.edge * 100).toFixed(1)}`,
      edgeLine: edgeLine(base.p, at),
      ev: `${sign(at.ev)}${Math.abs(at.ev * 100).toFixed(1)}%`,
      kelly: betScoreText(at.kelly * 100),
      tier: tierOf(at.level) ?? 'pass',
      band: tierLabel(at.level).toUpperCase(),
      stake: at.units === null ? 'no bet' : `${at.units}u`,
      flips,
      caption: whatIfCaption(base),
      held: at.units === null ? null : base.unitsCap !== null ? `Held to ${base.unitsCap}u, the Bot's own stake` : base.cap === 'medium' ? "Held to LIKE, as the Bot's pick is" : base.most === 'medium' && at.units === PRACTICE_UNITS && !at.suspect ? 'A LIKE at most at the practice stake: the desk caps this side (a gate at practice, a role or research pick)' : base.most === 'medium' && !at.suspect ? "A LIKE at most: the confidence layer's record hasn't earned LOVE yet" : base.most === 'high' && at.level === 'high' && at.kelly >= 0.05 ? "A LOVE at most: the confidence layer's record hasn't earned LOCK yet" : at.suspect ? 'Past the 15% sanity bar: a LIKE at the practice stake' : null,
    };
  }

  closeWhy(refocus = false): void {
    if (!this.why && !this.checkWhy) return;
    this.why = null;
    this.whatIf = null;
    this.checkWhy = null;
    if (refocus) this.whyTile?.focus({ preventScroll: true });
    this.whyTile = null;
  }

  // (a click anywhere off it and its tile shuts it; so does the list scrolling out from under it, or the
  // screen changing size: the first two listened for outside Angular, quietListener, so with nothing open
  // neither sets off change detection)
  clickOff(event: MouseEvent): void {
    if ((this.why || this.checkWhy) && !(event.target as Element | null)?.closest('.bet-why, .bet-meter, .tile-k')) this.closeWhy();
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

  // ---------------------------------------------------------------------------
  // The board's look (The Book): the rows in their bands' sections, each with its model-vs-book meter and a price
  // button for the slip; the look's own state, nothing of the list's order or limits
  // ---------------------------------------------------------------------------
  // The bands' seasons (each sport's picks.json record.byLevel, the same read as the picks; readFiles), for the
  // band headers: wins, losses, pushes and units, summed over the sports on the board (a sport chosen, its file
  // alone: book-rows.ts sumRecords; summed again only when the files or the sport change). A band no file has
  // graded has none
  private records = new Map<string, ByLevel | undefined>();
  private sumsFor: { records: unknown; sport: string; sums: Map<string, BandTally> } | null = null;
  get bandRecords(): Map<string, BandTally> {
    if (this.sumsFor?.records !== this.records || this.sumsFor.sport !== this.sport) this.sumsFor = { records: this.records, sport: this.sport, sums: sumRecords(this.records, this.sport) };
    return this.sumsFor.sums;
  }
  // (a band's season as its header says it: "23–9 · +18.4u"; none till a bet in it is graded)
  bandRecord(band: Confidence): { record: string; full: string | null; units: string; up: boolean } | null {
    const t = this.bandRecords.get(band);
    if (!t || !(t.wins + t.losses + t.pushes)) return null;
    const r = { won: t.wins, lost: t.losses, push: t.pushes };
    return { record: compactRecord(r), full: recordTip(r), units: `${t.profit >= 0 ? '+' : '−'}${Math.abs(t.profit).toFixed(1)}u`, up: t.profit >= 0 };
  }

  // The sections: the rows shown, in their order (the locks, an admin's CHECKs, then the rest by their Kelly score),
  // grouped by band, LOCK, CHECK, LOVE, LIKE; the passes and fades not on Best Bets at all (a game's own lines tag
  // them: game-lines' PASS / FADE). Each row keeps its place in the list (i: the rank tile's number and its popover's
  // index)
  readonly BAND_SECTIONS: readonly { band: Confidence; tier: 'lock' | 'check' | 'love' | 'like'; name: string }[] = [
    { band: 'lock', tier: 'lock', name: 'Locks' },
    { band: 'check', tier: 'check', name: 'Checks' },
    { band: 'high', tier: 'love', name: 'Loves' },
    { band: 'medium', tier: 'like', name: 'Likes' },
  ];
  // (each band's icon on its header, a stroke path: a padlock, a question, a heart, a thumbs-up)
  readonly BAND_ICONS: Record<string, string> = {
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    check: 'M12 17h.01M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 1.9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    love: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
    like: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 16.7 20H7',
  };
  get sections(): { band: Confidence; tier: string; name: string; rows: { r: BetRow; i: number }[] }[] {
    const shown = this.shown;
    return this.BAND_SECTIONS.map((s) => ({ ...s, rows: shown.map((r, i) => ({ r, i })).filter(({ r }) => this.grade(r) === s.tier) })).filter((s) => s.rows.length);
  }
  // (whether anything favorable is on the board: a LOCK, LOVE or LIKE, an admin's CHECKs not counted; none, Best
  // Bets says so in one line, the CHECKs under it)
  get favorable(): boolean {
    return this.shown.some((r) => favorableGrade(this.grade(r)));
  }
  // (how many picks the bands hold: a chosen game's picks header)
  get sectionCount(): number {
    return this.sections.reduce((n, s) => n + s.rows.length, 0);
  }
  // (the bands folded shut: the CHECKs start shut (an admin's held bets are a long list, its count on the band's
  // badge))
  readonly closedBands = new Set<string>(['check']);
  // (a chosen game's picks: its own bordered section above the game's menu, folded shut each time a game is chosen,
  // its header saying how many)
  gamePicksOpen = false;
  readonly bestBetsLabel = BEST_BETS_LABEL;
  gamePicksHead(n: number): string {
    return gamePicksHead(n);
  }
  get viewsShown(): boolean {
    return viewsShown({ desk: !!this.desk(), open: !!this.hasOpen(), closed: !!this.hasClosed(), live: !!this.hasLive() });
  }
  bandOpen(band: string): boolean {
    return !this.closedBands.has(band);
  }
  toggleBand(band: string): void {
    this.closeWhy();
    if (!this.closedBands.delete(band)) this.closedBands.add(band);
  }

  // The model-vs-book meter: the model's chance (the row's, a whole percent) and the book's (its fair chance
  // without the vig where the file has it, else the price's implied chance); none without the model's
  meter(r: BetRow): { model: number; book: number | null } | null {
    if (r.chance === undefined || r.chance === null) return null;
    const implied = typeof r.price === 'number' && r.price ? (r.price < 0 ? -r.price / (-r.price + 100) : 100 / (r.price + 100)) : null;
    const book = Number.isFinite(r.fair) ? r.fair! : implied;
    return { model: r.chance, book: book === null ? null : Math.round(book * 100) };
  }

  // (the edge in chance points, the model's over the book's, for the open row's meta line)
  edgePoints(r: BetRow): number | null {
    const m = this.meter(r);
    return m && m.book !== null ? m.model - m.book : null;
  }

  // The row's price button: the pick as a bet for the slip (game-lines' botSelection: the one slip call the lines'
  // tiles make), on the slip or not, and clicked, onto it or off it (wallet.toggle). A game begun can't be bet
  // (the list drops it on the minute; till then the button does nothing)
  private rowSelection(r: BetRow): Omit<Selection, 'key' | 'stake'> | null {
    const event = r.pickId?.split(':')[0];
    if (!r.game || !event) return null;
    // (at the live price where the page has one: the Bot's locked price may be gone)
    const at = Number.isFinite(r.livePrice) && r.livePrice ? { ...r, price: r.livePrice } : r;
    return botSelection({ sport: r.sport, event, matchup: r.game.matchup, start: r.game.kickoff ?? r.game.date }, at, this.desk());
  }
  // (the price the row's button shows: the live one where the page has it, else the row's own)
  priceText(r: BetRow): string | undefined {
    return Number.isFinite(r.livePrice) && r.livePrice ? americanOdds(r.livePrice) : r.odds;
  }
  onSlip(r: BetRow): boolean {
    const sel = this.rowSelection(r);
    return !!sel && this.wallet.slipKeys().has(selectionKey(sel));
  }
  canBet(r: BetRow): boolean {
    return !!this.rowSelection(r) && (!r.game?.kickoff || Date.parse(r.game.kickoff) > Date.now());
  }
  takeRow(r: BetRow, event: Event): void {
    event.stopPropagation();
    const sel = this.rowSelection(r);
    if (!sel || !this.canBet(r)) return;
    this.wallet.toggle(sel);
  }

  // The recent form card (recent-form.ts), a You / The Bot switch: the user's last seven days from the settler's
  // tally the wallet holds, their streak and their last five settled bets where the history's on hand (none signed
  // out, or with nothing settled); the bot's from the recent blocks of the picks files the page has read (botForm,
  // in readFiles). The card shows when either side has its form, on the viewer's pick of the switch, else theirs,
  // else the bot's (formSide); the side without one says so
  botForm: RecentForm | null = null;
  formChoice: FormSide | null = null;
  get yourForm(): RecentForm | null {
    return yourForm({ signedIn: canUse('book'), loaded: this.wallet.loaded(), tally: this.wallet.tally(), settled: this.wallet.settledBets(), recent: this.wallet.recentSettled() });
  }
  get form(): { side: FormSide; f: RecentForm | null } | null {
    const you = this.yourForm;
    const side = formSide(this.formChoice, you, this.botForm);
    return side ? { side, f: side === 'you' ? you : this.botForm } : null;
  }
  chooseForm(side: FormSide): void {
    this.formChoice = side;
  }

  // (the closed row's line under the pick: its game and its start, "NYJ @ NE · Sun 12:00 PM" (game-menu.ts
  // gameLine); the sport and the reason are the open row's)
  subLine(r: BetRow): { name: string; when: string | null; text: string } | null {
    return r.game ? gameLine(r.sport, r.game.matchup, r.game.kickoff) : null;
  }
}

