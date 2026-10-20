import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { fetchJson } from '@ranker/core/http';
import { americanOdds, compactCount, deskLeagueLogo, recordTip, fightPick, fightSides, headshot, hideImage, pct, teamLogo, units } from './bet-format';
import { darkLogoOf } from '../team-look';
import { matchupName } from './game-menu';
import { BetGroup, SportGroup, TableSorts, betValue, byGame, gamesBySport } from './desk-columns';
import { DESK_HELP } from './desk-help';
import { BotHistory, HISTORY_RANGES, HistoryRange, HistoryRow, ReplayRecordFile, beatText, beatTip, botHistoryOf, buildLabel, buildOf, emptyRow, isHistoryRange, recordText } from './replay-history';
import { DeskPanel, ESPN_LEAGUES, SPORTS, deskPanelOpen, UNIT_WORDS, DeskEpoch, epochFor, epochShared, countNowOf, deskEpochOf, edgeColorOf, epochLabel, isTracked, meterOf, propState, provisional, sideTextOf, sideTitleOf, toWin } from './desk-math';
import { Board, Meter, ModelBet, ModelState, Settled } from './desk-model';
import { SummaryBox, athleteTeam, liveStat } from './live-props';
import { pickTeamColor, splitPick } from './pick-style';
import type { PlayerRef } from '../player-link';

// The algorithm's admin panel (the Book, admins only): the code-only desk's play-money betting
// (libs/ranker/scripts/model/run.mjs: every market of every game, 0.5 to 3 units), on the Bot's history
// (replay-history.ts botHistoryOf: today's algorithm replayed over the priced history before its epoch, plus its
// real bets since, from each sport's data/model/replay-record.json and ledger.json). The build's time and the
// sport chips on one line up top; under them one board that scrolls: By Sport, By Confidence (LOCK first), the
// bets open now with those In Play, and the last 20 closed. The loops' own files (the self-check, the scorecard,
// the news signals, the miss review, the CHECKs) are still written by the desk and the gate; this tab no longer
// shows them (the owner, 2026-10-19). The time range beside the sport chips (Today to All time, the owner's
// 2026-10-19 notes) filters the history's panels by each bet's settling (replay-history.ts rangeDays); the build at
// the board's foot. The sorting is desk-columns.ts's, the hovers desk-help.ts's.

const SPORT_KEY = 'deskSport';
const readSport = (): string | null => {
  try {
    const saved = localStorage.getItem(SPORT_KEY);
    return saved && SPORTS.includes(saved) ? saved : null;
  } catch {
    return null;
  }
};

// (the time range on show, remembered on this browser: All time to begin with)
const RANGE_KEY = 'deskRange';
const readRange = (): HistoryRange => {
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    return isHistoryRange(saved) ? saved : 'all';
  } catch {
    return 'all';
  }
};

// (the board's panels, open or shut (desk-math.ts deskPanelOpen); a tap turns one the other way, remembered on this
// browser as the sport chip is)
const PANELS_KEY = 'deskPanels';
const readFlipped = (): Set<string> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
};

const getJson = <T>(url: string, init?: RequestInit): Promise<T | null> => fetchJson<T | null>(url, null, init);

// A section of a game's bets on the Algorithm's lists: its game bets, or one team's player props
interface DeskSection {
  key: string;
  props: boolean;
  team: string;
  bets: ModelBet[];
}
// (the game bets' order: the total, the moneyline, the spread)
const MARKET_ORDER: Record<string, number> = { total: 0, ml: 1, spread: 2 };

@Component({
  selector: 'model-desk',
  templateUrl: './model-desk.component.html',
  styleUrls: ['../../styles/components/model-desk.scss'],
  standalone: false,
})
export class ModelDeskComponent implements OnInit, OnDestroy {
  loading = true;
  states: ModelState[] = [];
  // (the bets open in the sport on show: Open Bets and In Play)
  private bets: ModelBet[] = [];
  readonly help = DESK_HELP;

  // The sport on show (the chips up top; null: every sport): every panel follows it. Remembered on this browser.
  readonly sports = SPORTS;
  sport: string | null = readSport();
  private allBets: ModelBet[] = [];
  private allStates: ModelState[] = [];

  // (the model's epoch, the newest in the sports' states (desk-math.ts deskEpochOf): the build's time without a
  // replay file, and the build line's hover)
  private epoch: DeskEpoch | null = null;

  // (the bets on games not started yet, and in play: started, not graded yet)
  open: ModelBet[] = [];
  live: ModelBet[] = [];
  // (the Bot's history (replay-history.ts): each sport's replayed record (replay-record.json, gate.mjs --record)
  // joined to the live ledger's bets since)
  history: BotHistory | null = null;
  private allReplays: (ReplayRecordFile | null)[] = [];
  private allLedgerBets: ModelBet[] = [];
  readonly recordText = recordText;
  // (Beat close: the share that beat the fair close from BEAT_MIN bets, the count and mean return on hover, D56)
  readonly beatText = beatText;
  readonly beatTip = beatTip;
  readonly recordTip = recordTip;
  readonly compactCount = compactCount;
  readonly buildLabel = buildLabel;
  // (By Confidence's rows, LOCK first, PASS last, the practice picks between LIKE and PASS, the history's)
  bandRows: HistoryRow[] = [];
  // (the build's time at the top: the version's epoch, replay-history.ts buildOf)
  buildAt: string | null = null;

  private flipped = readFlipped();

  // ---------------------------------------------------------------------------
  // The time range: the Book's dropdown (its pill and its listbox), the history's panels by each bet's settling
  // ---------------------------------------------------------------------------
  readonly ranges = HISTORY_RANGES;
  range: HistoryRange = readRange();
  rangeOpen = false;
  rangeActive: HistoryRange = this.range;
  @ViewChild('rangePill') private rangePill?: ElementRef<HTMLButtonElement>;
  @ViewChild('rangeList') private rangeList?: ElementRef<HTMLElement>;

  get rangeLabel(): string {
    return HISTORY_RANGES.find((r) => r.value === this.range)?.label ?? 'All time';
  }

  // (the range in a sentence: "No bets settled this week")
  get rangeWords(): string {
    return this.range === 'all' ? 'yet' : this.rangeLabel.toLowerCase();
  }

  // (what the range holds: "This week: 42 replayed (games before this version) · 6 live")
  rangeNote(h: BotHistory): string {
    const p = h.rangeParts;
    const parts = [`${p.replayed.toLocaleString('en-US')} replayed (games before this version)`, `${p.live.toLocaleString('en-US')} live (since it)`];
    if (p.undated) parts.push(`${p.undated.toLocaleString('en-US')} replayed without dates left out`);
    return `${this.rangeLabel}: ${parts.join(' · ')}`;
  }

  toggleRange(): void {
    this.rangeOpen ? this.closeRange() : this.openRange();
  }

  private openRange(): void {
    this.rangeOpen = true;
    this.rangeActive = this.range;
    setTimeout(() => this.rangeList?.nativeElement.focus());
  }

  private closeRange(focus = false): void {
    this.rangeOpen = false;
    if (focus) this.rangePill?.nativeElement.focus();
  }

  pickRange(range: HistoryRange): void {
    this.closeRange(true);
    if (range === this.range) return;
    this.range = range;
    try {
      if (range === 'all') localStorage.removeItem(RANGE_KEY);
      else localStorage.setItem(RANGE_KEY, range);
    } catch {
      // (storage off: the choice lasts the visit)
    }
    this.show();
  }

  // (the pill: Down, Enter or Space open the list)
  rangePillKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || ((e.key === 'Enter' || e.key === ' ') && !this.rangeOpen)) {
      e.preventDefault();
      this.openRange();
    } else if (e.key === 'Escape' && this.rangeOpen) {
      e.preventDefault();
      this.closeRange(true);
    }
  }

  // (the list: the arrows, Home and End light a row, Enter or Space choose it, Escape and Tab close it)
  rangeListKey(e: KeyboardEvent): void {
    const i = HISTORY_RANGES.findIndex((r) => r.value === this.rangeActive);
    const to = (n: number) => (this.rangeActive = HISTORY_RANGES[Math.max(0, Math.min(HISTORY_RANGES.length - 1, n))].value);
    if (e.key === 'ArrowDown') to(i + 1);
    else if (e.key === 'ArrowUp') to(i - 1);
    else if (e.key === 'Home') to(0);
    else if (e.key === 'End') to(HISTORY_RANGES.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') this.pickRange(this.rangeActive);
    else if (e.key === 'Escape') this.closeRange(true);
    else if (e.key === 'Tab') return this.closeRange();
    else return;
    e.preventDefault();
  }

  // (a click off the pill and its list closes it)
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.rangeOpen) return;
    const t = e.target as Node | null;
    if (t && (this.rangePill?.nativeElement.contains(t) || this.rangeList?.nativeElement.contains(t))) return;
    this.closeRange();
  }

  panelOpen(panel: DeskPanel): boolean {
    return deskPanelOpen(panel, this.flipped);
  }

  togglePanel(panel: DeskPanel): void {
    if (!this.flipped.delete(panel)) this.flipped.add(panel);
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify([...this.flipped]));
    } catch {
      // (storage off: the choice lasts the visit)
    }
  }

  // (each in-play game's score and clock, by its ESPN id, from ESPN's scoreboard every minute)
  scores = new Map<string, { text: string; score: string; detail: string; final: boolean }>();
  // (each in-play prop's stat so far, by the bet's id, from its game's box score every minute)
  propNow = new Map<string, number | null>();
  // (an in-play prop's player's team, its ESPN id, from the box score: an older prop's color, without its team)
  private livePropTeams = new Map<string, string>();
  // (each in-play game's score as numbers and whether it's over)
  private boards = new Map<string, Board>();
  private scoreTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  async ngOnInit(): Promise<void> {
    // (every sport's files asked at once, not each sport's one after another)
    const files = await Promise.all(
      SPORTS.map(async (sport) => {
        const [ledger, state, replay] = await Promise.all([
          getJson<{ bets?: ModelBet[] }>(`/${sport}/data/model/ledger.json`, { cache: 'no-cache' }),
          getJson<ModelState>(`/${sport}/data/model/state.json`, { cache: 'no-cache' }),
          // (none till the gate records a version with the replayed record: the live desk alone)
          getJson<ReplayRecordFile>(`/${sport}/data/model/replay-record.json`, { cache: 'no-cache' }),
        ]);
        return { ledger, state, replay };
      }),
    );
    this.allReplays = files.map((f) => f.replay);
    this.allStates = files.map((f) => f.state).filter((s): s is ModelState => !!s);
    const rows = files.flatMap((f) => f.ledger?.bets ?? []);
    this.allLedgerBets = rows;
    // (the bets placed: not the markets tracked, nor the slate's practice picks with the split on)
    const split = this.allStates.some((s) => s.practiceSplit);
    this.allBets = rows.filter((b) => !isTracked(b) && !(split && !!b.topN));
    this.epoch = deskEpochOf(this.allStates);
    // (a remembered sport with no bets (NBA before its season): every sport instead)
    if (this.sport && !this.allBets.some((b) => b.sport === this.sport)) this.sport = null;
    this.show();
    this.loading = false;
    this.loadTeams();
    // (not if the desk closed while its files loaded; not while the page is out of view)
    if (!this.closed) this.scoreTimer = setInterval(() => !document.hidden && this.loadScores(), 60_000);
  }

  ngOnDestroy(): void {
    this.closed = true;
    clearInterval(this.scoreTimer);
  }

  get epochTitle(): string {
    const by = this.epoch?.bySport;
    if (!by) return this.help['epoch'];
    return `${this.help['epoch']}\n${Object.entries(by)
      .map(([sport, at]) => `${sport.toUpperCase()}: ${epochLabel(at)}`)
      .join(' · ')}`;
  }

  setSport(sport: string | null): void {
    this.sport = sport;
    try {
      if (sport) localStorage.setItem(SPORT_KEY, sport);
      else localStorage.removeItem(SPORT_KEY);
    } catch {
      // (storage off: the choice lasts the visit)
    }
    this.show();
  }

  // (a sport's open bets, or every sport's: the chips' counts)
  openCount(sport: string | null): number {
    return this.allBets.filter((b) => b.status === 'open' && (!sport || b.sport === sport)).length;
  }

  // (what's on show changed: its bets and states picked, the history built, the scores asked)
  private show(): void {
    this.bets = this.allBets.filter((b) => b.status === 'open' && (!this.sport || b.sport === this.sport));
    this.states = this.sport ? this.allStates.filter((s) => s.sport === this.sport) : this.allStates;
    const h = botHistoryOf(this.allReplays, this.allLedgerBets, this.sport, Object.fromEntries(this.allStates.map((s) => [s.sport, s.label])), { range: this.range });
    this.history = h;
    const histBand = (label: string) => h.byBand.find((r) => r.label === label) ?? emptyRow(label);
    this.bandRows = [histBand('LOCK'), histBand('LOVE'), histBand('LIKE'), h.practice, histBand('PASS')];
    this.buildAt = buildOf(this.allReplays, this.sport, this.epoch ? ((this.sport ? epochFor(this.epoch, this.sport) : null) ?? epochShared(this.epoch)) : null).at;
    this.splitOpen(Date.now());
    this.loadScores();
  }

  // The open bets as of now: the ones not started yet (soonest first; with them a game past its start that
  // ESPN hasn't begun or has put off), and the ones under way: In Play while their game runs (one that's over
  // waits for the run to grade it, out of both)
  private splitOpen(now: number): void {
    const waiting = (b: ModelBet) => Date.parse(b.start) > now || this.notUnderWay(b);
    this.open = this.bets.filter(waiting).sort((a, b) => a.start.localeCompare(b.start));
    this.live = this.bets.filter((b) => !waiting(b) && !this.isOver(b)).sort((a, b) => a.start.localeCompare(b.start));
  }

  // (a closed bet's band, for its colour: the Book's tier names; a practice pick its own)
  bandClass(b: { band: string; practice: boolean }): string {
    return b.practice ? 'practice' : b.band.toLowerCase();
  }


  // The in-play games' scores: each sport's scoreboard (today's slate, the NFL's week), matched by ESPN id;
  // a sport whose scoreboard won't load just shows no score. Then the props in play: each game's summary once,
  // its box score read for every prop on it
  private async loadScores(): Promise<void> {
    const live = this.bets.filter((b) => b.status === 'open' && Date.parse(b.start) <= Date.now());
    // (by each game's own day, ESPN's Eastern one: last night's late game is gone from today's default slate,
    // and would sit In Play until graded)
    const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
    const slates = new Set(live.map((b) => `${b.sport}|${dayOf(b.start)}`));
    // (every slate asked at once, then read in order)
    const boards = await Promise.all(
      [...slates].map((slate) => {
        const [sport, day] = slate.split('|');
        return fetchJson<{ events?: ScoreboardEvent[] } | null>(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[sport]}/scoreboard?dates=${day}`, null);
      }),
    );
    for (const board of boards) for (const event of board?.events ?? []) this.readEvent(event);
    const props = live.filter((b) => b.market === 'prop' && b.event && b.athlete !== undefined && b.propType);
    // (each game's summary asked at once, then read in order)
    const games = [...new Set(props.map((b) => b.event!))].map((event) => props.filter((b) => b.event === event));
    const bodies = await Promise.all(
      games.map((mine) => fetchJson<SummaryBox | null>(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[mine[0].sport]}/summary?event=${mine[0].event}`, null)),
    );
    for (const [i, mine] of games.entries()) {
      const body = bodies[i];
      for (const b of mine) {
        this.propNow.set(b.id, liveStat(b.sport, b.propType!, String(b.athlete), body));
        const team = athleteTeam(String(b.athlete), body);
        if (team) this.livePropTeams.set(b.id, team);
        if (!b.team) this.pickColors.delete(b.id);
      }
    }
    // (from the bets on show now: the sport or game may have changed while the scores loaded)
    this.splitOpen(Date.now());
  }

  private readEvent(event: ScoreboardEvent): void {
    const teams = event.competitions?.[0]?.competitors ?? [];
    const away = teams.find((t) => t.homeAway === 'away');
    const home = teams.find((t) => t.homeAway === 'home');
    if (!away || !home) return;
    // (a game called off is never final: its 0-0 isn't a result, as the bettor's espn.mjs gameOf)
    const final = !!event.status?.type?.completed && !/postponed|cancel|suspended|forfeit/i.test(event.status?.type?.name ?? '');
    this.boards.set(String(event.id), { hs: Number(home.score) || 0, as: Number(away.score) || 0, final, state: event.status?.type?.state });
    const score = `${away.team?.abbreviation} ${away.score ?? 0} - ${home.team?.abbreviation} ${home.score ?? 0}`;
    const detail = event.status?.type?.shortDetail ?? '';
    this.scores.set(String(event.id), { text: final ? `Final · ${score}` : `${score} · ${detail}`, score, detail, final });
  }


  // ---------------------------------------------------------------------------
  // A bet in play: its count, its standing and its result as the scores give them (desk-math.ts)
  // ---------------------------------------------------------------------------

  private boardOf(b: ModelBet): Board | undefined {
    return b.event ? this.boards.get(b.event) : undefined;
  }

  provisional(b: ModelBet): Settled | null {
    return provisional(b, this.boardOf(b), this.propNow.get(b.id));
  }

  // (a bet's result for the sorting: the run's grade (a void one, no action, said so), or for one not graded yet,
  // the scores')
  result(b: ModelBet): { status: string; profit: number } | null {
    return b.status !== 'open' ? { status: b.void ? 'void' : b.status, profit: b.profit } : this.provisional(b);
  }

  // (a bet's final score: the run's, or the scoreboard's before it's graded)
  finalScore(b: ModelBet): string {
    return b.final ?? (b.event ? (this.scores.get(b.event)?.score ?? '') : '');
  }

  // (the stakes in play right now: In Play's title)
  get liveRisk(): number {
    return this.live.reduce((sum, b) => sum + b.units, 0);
  }

  // (an in-play bet whose game is over, waiting for the run to grade it)
  isOver(b: ModelBet): boolean {
    return !!this.boardOf(b)?.final;
  }

  // (a game past its start that isn't running: not begun at ESPN, or over without a final, put off)
  private notUnderWay(b: ModelBet): boolean {
    const board = this.boardOf(b);
    return board?.state === 'pre' || (board?.state === 'post' && !board.final);
  }

  // (what an in-play bet's meter counts, and a side's words and color at the score: desk-math.ts, shared with
  // the Book's Open Bets)
  countNow(b: ModelBet): number | null {
    return countNowOf(b, this.boardOf(b), this.propNow.get(b.id));
  }

  propState(b: ModelBet): 'won' | 'alive' | 'lost' | null {
    return propState(b, this.countNow(b));
  }

  meter(b: ModelBet): Meter | null {
    return meterOf(b, this.countNow(b));
  }

  sideText(b: ModelBet): string {
    return sideTextOf(b, this.boardOf(b));
  }

  sideTitle(b: ModelBet): string {
    return sideTitleOf(b, this.boardOf(b));
  }

  edgeColor(b: ModelBet): string | null {
    return edgeColorOf(b, this.boardOf(b));
  }

  // (a total's unit: the game's points, goals or runs)
  totalWord(b: ModelBet): string {
    return UNIT_WORDS[b.sport] ?? 'pts';
  }

  // ---------------------------------------------------------------------------
  // A bet's look: its teams, its pick's one word in its team's color, the pictures
  // ---------------------------------------------------------------------------

  // (a game's two teams, away and home, from its matchup: "PHI @ OTT")
  teamsOf(b: ModelBet): [string, string] {
    const [away, home] = b.matchup.split(' @ ');
    return [away ?? '', home ?? ''];
  }

  // (each team's abbreviation by its ESPN id, from the sport's teams.json: a prop's player's side)
  private async loadTeams(): Promise<void> {
    for (const sport of new Set(this.allBets.map((b) => b.sport))) {
      const file = await getJson<{ teams?: Record<string, { id: string }> }>(`/${sport}/data/model/teams.json`);
      for (const [abbr, t] of Object.entries(file?.teams ?? {})) this.teamAbbr.set(`${sport}#${t.id}`, abbr);
    }
    // (the props' sections are by team: built again with the teams known)
    this.sectionMemo = new WeakMap();
  }

  // (a team's abbreviation by "<sport>#<ESPN id>")
  private teamAbbr = new Map<string, string>();

  // A bet's own color, its team's (never one that reads as a result: pick-style.ts pickTeamColor): a prop its
  // player's team (the one it was placed with, or the box score's once he's playing), a side the team it took;
  // a total, no one's: null, the board's light (as with no team known). Kept, so the template asks once.
  private pickColors = new Map<string, string | null>();

  pickColor(b: ModelBet): string | null {
    if (b.market === 'total') return null;
    const kept = this.pickColors.get(b.id);
    if (kept !== undefined) return kept;
    const [away, home] = this.teamsOf(b);
    // (an older prop, placed without its player's team: the box score's, once he's playing)
    const live = b.market === 'prop' && !b.team ? this.livePropTeams.get(b.id) : undefined;
    if (b.market === 'prop' && !b.team && !live) return null;
    const color = pickTeamColor(b.sport, { total: false, teamId: live ?? b.team, abbr: b.market === 'prop' ? null : b.side === 'home' ? home : away });
    this.pickColors.set(b.id, color);
    return color;
  }

  // (a prop's pick after the player's name: " Under 7.5 Carries")
  pickRest(b: ModelBet): string {
    return b.player && b.pick.startsWith(b.player) ? b.pick.slice(b.player.length) : ' ' + b.pick;
  }

  // A pick split round its one word in its color: what the bet is (the over or under, a moneyline's ML, a
  // spread's line); [before, the word, after]
  pickParts(b: ModelBet): [string, string, string] {
    return splitPick(b.market === 'prop' ? this.pickRest(b).trimStart() : b.pick, b.market === 'prop' || b.market === 'total');
  }

  teamLogo = teamLogo;
  // (a team logo too dark for the bare board: its halo, .logo-lift)
  darkLogo = darkLogoOf;
  leagueLogo = deskLeagueLogo;
  fightSides = fightSides;
  fightPick = fightPick;
  matchupName = matchupName;
  hide = hideImage;

  // (a prop's player: his ESPN headshot, and his card in his sport's app (player-link.ts: ?card= his ESPN id
  // finds him there, his name if it doesn't)
  headshot(b: ModelBet): string {
    return headshot(b.sport, b.athlete);
  }

  playerRef(b: ModelBet): PlayerRef {
    return { sport: b.sport, name: b.player, id: b.athlete ?? null };
  }

  // ---------------------------------------------------------------------------
  // Words and numbers (bet-format.ts)
  // ---------------------------------------------------------------------------
  readonly pct = pct;
  readonly units = units;
  readonly odds = americanOdds;
  readonly toWin = toWin;


  // ---------------------------------------------------------------------------
  // The bet lists by game (desk-columns.ts byGame): a game with more than one bet a row of its own, its bets
  // under it, folded until it's opened (In Play's too: it bets a lot of games at once)
  // ---------------------------------------------------------------------------

  // (a bet list in its order, by game, by sport: kept till its rows, its order or the sport filter change, as the
  // template asks on every check)
  private gamesMemo = new Map<string, { rows: ModelBet[]; all: boolean; out: SportGroup[] }>();

  gamesOf(table: string, rows: ModelBet[]): SportGroup[] {
    const sorted = this.sorted(table, rows, this.betValue);
    const all = !this.sport;
    const kept = this.gamesMemo.get(table);
    if (kept && kept.rows === sorted && kept.all === all) return kept.out;
    const out = gamesBySport(byGame(sorted), all);
    this.gamesMemo.set(table, { rows: sorted, all, out });
    return out;
  }
  // (with every sport listed, each sport a row of its own over its games, folded till it's opened)
  private sportsOpen = new Map<string, boolean>();

  sportOpen(table: string, s: SportGroup): boolean {
    return !s.header || (this.sportsOpen.get(`${table}|${s.sport}`) ?? false);
  }

  toggleSport(table: string, s: SportGroup): void {
    this.sportsOpen.set(`${table}|${s.sport}`, !this.sportOpen(table, s));
  }
  private groupsOpen = new Map<string, boolean>();

  groupOpen(table: string, g: BetGroup): boolean {
    return g.bets.length === 1 || (this.groupsOpen.get(`${table}|${g.key}`) ?? false);
  }

  toggleGroup(table: string, g: BetGroup): void {
    this.groupsOpen.set(`${table}|${g.key}`, !this.groupOpen(table, g));
  }

  // A game's bets in their sections: its game bets (the total, the moneyline, the spread, in that order), then
  // each team's player props (the away side's, the home side's, any whose team isn't known last), each props
  // section folded till it's opened
  private sectionMemo = new WeakMap<BetGroup, DeskSection[]>();

  sectionsOf(g: BetGroup): DeskSection[] {
    const kept = this.sectionMemo.get(g);
    if (kept) return kept;
    const out = this.sectionsFor(g);
    this.sectionMemo.set(g, out);
    return out;
  }

  private sectionsFor(g: BetGroup): DeskSection[] {
    const game = g.bets.filter((b) => b.market !== 'prop').sort((a, b) => (MARKET_ORDER[a.market] ?? 9) - (MARKET_ORDER[b.market] ?? 9));
    const props = g.bets.filter((b) => b.market === 'prop');
    const out: DeskSection[] = game.length ? [{ key: `${g.key}|game`, props: false, team: '', bets: game }] : [];
    if (!props.length) return out;
    const [away, home] = this.teamsOf(g.bets[0]);
    const teamOf = (b: ModelBet) => (b.team ? (this.teamAbbr.get(`${b.sport}#${b.team}`) ?? '') : '');
    const teams = [away, home, ''];
    for (const t of props.map(teamOf)) if (!teams.includes(t)) teams.splice(teams.length - 1, 0, t);
    for (const team of teams) {
      const bets = props.filter((b) => teamOf(b) === team);
      if (bets.length) out.push({ key: `${g.key}|props|${team}`, props: true, team: team || 'Other', bets });
    }
    return out;
  }

  private propsOpen = new Map<string, boolean>();

  propsShown(table: string, s: DeskSection): boolean {
    return this.propsOpen.get(`${table}|${s.key}`) ?? false;
  }

  toggleProps(table: string, s: DeskSection): void {
    this.propsOpen.set(`${table}|${s.key}`, !this.propsShown(table, s));
  }

  sectionUnits(s: DeskSection): number {
    return Math.round(s.bets.reduce((sum, b) => sum + b.units, 0) * 100) / 100;
  }

  // (a game's stakes)
  groupUnits(g: BetGroup): number {
    return Math.round(g.bets.reduce((sum, b) => sum + b.units, 0) * 100) / 100;
  }

  // ---------------------------------------------------------------------------
  // Sorting (desk-columns.ts): each table its own; Open Bets by EV, best first
  // ---------------------------------------------------------------------------

  private sorts = new TableSorts({ open: { key: 'ev', dir: -1 } });
  sortBy = (table: string, key: string) => this.sorts.sortBy(table, key);
  ariaSort = (table: string, key: string) => this.sorts.ariaSort(table, key);
  sorted = <T>(table: string, rows: T[], value: (row: T, key: string) => unknown): T[] => this.sorts.sorted(table, rows, value);

  readonly betValue = betValue(
    (b) => this.result(b),
    (b) => this.finalScore(b),
  );
}

// (an event on ESPN's scoreboard, as much as the desk reads)
interface ScoreboardEvent {
  id: string | number;
  status?: { type?: { completed?: boolean; name?: string; state?: 'pre' | 'in' | 'post'; shortDetail?: string } };
  competitions?: { competitors?: { homeAway: string; score?: string; team?: { abbreviation?: string } }[] }[];
}
