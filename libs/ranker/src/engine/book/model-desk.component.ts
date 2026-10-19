import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { TIERS } from './tiers';
import { americanOdds, compactCount, compactRecord, countTip, deskLeagueLogo, recordTip, fightPick, fightSides, headshot, hideImage, num, pct, signed, teamLogo, units } from './bet-format';
import { matchupName } from './game-menu';
import { BetGroup, SportGroup, TableSorts, backtestValue, betValue, byGame, gamesBySport, calibrationValue, contextValue, modelVsMarket, pinnacleEdge, propValue, sportValue, stateValue, tallyValue } from './desk-columns';
import { DESK_HELP } from './desk-help';
import { NewsSignalRow, NewsSignalsFile, newsSignalRows } from './news-signals';
import { MissPanel, MissReviewFile, missPanelOf } from './miss-review';
import { SCORE_H, SCORE_W, ScoreChart, ScorecardFile, scorecardPanelOf } from './scorecard';
import { BotHistory, HistoryRow, ReplayRecordFile, botHistoryOf, buildLabel, buildOf, dayLabel, emptyRow, recordText } from './replay-history';
import {
  BANKROLL,
  CURVE_W,
  ESPN_LEAGUES,
  MARKET_NAMES,
  SPORTS,
  STAKES,
  UNIT_WORDS,
  atUnit,
  DeskEpoch,
  afterEpoch,
  epochFor,
  epochShared,
  calibrationOf,
  countNowOf,
  deskEpochOf,
  edgeColorOf,
  epochLabel,
  gameDaysOf,
  gradedOrder,
  intentOf,
  isTracked,
  meterOf,
  profitCurves,
  propState,
  provisional,
  rebuysFor,
  sideEdge,
  sideTextOf,
  sideTitleOf,
  streakOf,
  tally,
  toWin,
} from './desk-math';
import { Board, CalibrationRow, Change, CheckAdvice, CheckCauseRow, ContextRow, checkPanelOf, ResearchRow, researchPanelOf, CurveLine, CurveSpot, GameDay, Meter, ModelBet, ModelState, OddsUsage, PropRow, PropType, SelfCheckFile, SelfCheckView, selfCheckPanelOf, Settled, SportTally, Tally, BacktestRow, TestNumbers, calibText, playChanceText, propTerms, sameGameText, softTerms } from './desk-model';
import { SummaryBox, athleteTeam, liveStat } from './live-props';
import { confidenceOf, kellyOf } from './bet-why';
import { CheckEntry, checkBets } from './desk-notes';
import { pickTeamColor, splitPick } from './pick-style';
import { DATE_RANGES, DateRange, inRange } from './date-range';
import type { PlayerRef } from '../player-link';

// The algorithm's admin panel (the Book, dev only): the code-only desk's play-money betting
// (libs/ranker/scripts/model/run.mjs: every market of every game, 0.5 to 3 units), read from each sport's
// data/model/ledger.json and state.json. Its bankroll and record, broken down by sport, market and stake,
// how well its chances match what happened, its bankroll over time, the bets still open, the latest graded,
// every change it's made to itself and why, and the context it weighs beyond the ratings (rest, travel,
// starters, weather, parks, officials, the ranker's own numbers) with each term's fitted size. The arithmetic
// is desk-math.ts's, the sorting desk-columns.ts's, the hovers desk-help.ts's. By Confidence has the CHECKs
// too (checks.json: the markets too far from the book to bet), under LOCK, at a unit as if bet: never in the
// total, the record or the bankroll; the props kept for a player's role changing (cause 'role') a row of their
// own (CHECK ROLE), so the CHECK row's record stays the gap's. The CHECKs panel: each sport's CHECKs by what
// drove their gap (state.json's checks.learning, check-learn.mjs: open and graded, the hit rate with its 95%
// interval against the break-even, the profit) and the ranked advice they make (desk-model.ts checkPanelOf).
// The Self-check panel, first: each sport's weekly self-check (selfcheck.json, libs/ranker/scripts/model/
// selfcheck.mjs: free, no AI), its flags and watches first in plain words, the rest folded (desk-model.ts
// selfCheckPanelOf); a check opens to its rows, its threshold, how it's measured and the bets it names.
// The markets tracked, not bet (intent 'track', since TRACKED_FROM: no edge, or a guard cut it; the bettor's
// desk.mjs TRACK) are kept out of everything above (the record, the bankroll, the bands, In Play and Open Bets) and
// shown only in the Tracked panel (folded): their record by sport, a unit each as if bet (desk-math.ts atUnit).


const SPORT_KEY = 'deskSport';
const readSport = (): string | null => {
  try {
    const saved = localStorage.getItem(SPORT_KEY);
    return saved && SPORTS.includes(saved) ? saved : null;
  } catch {
    return null;
  }
};
// (the record since the model's latest change (its epoch), or all time: since it by default; All Time remembered
// on this browser)
const SINCE_KEY = 'deskSince';
const readSince = (): boolean => {
  try {
    return localStorage.getItem(SINCE_KEY) !== 'all';
  } catch {
    return true;
  }
};
// (the tiles' numbers count up this long when the desk opens or the sport changes)
const TICK_MS = 650;

const getJson = <T>(url: string, init?: RequestInit): Promise<T | null> =>
  fetch(url, init)
    .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
    .catch(() => null);

const reducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
};

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
  bets: ModelBet[] = [];
  readonly bankroll = BANKROLL;
  readonly help = DESK_HELP;
  readonly curveWidth = CURVE_W;

  // The sport on show (the chips up top; null: every sport): the panels, the tiles and the lists are all built
  // from its bets and state alone. Remembered on this browser.
  readonly sports = SPORTS;
  sport: string | null = readSport();
  private allBets: ModelBet[] = [];
  private allStates: ModelState[] = [];
  // (the CHECKs, at a unit as if bet (desk-notes.ts checkBets): By Confidence's CHECK row alone)
  private allChecks: ModelBet[] = [];
  private checks: ModelBet[] = [];
  // (the markets tracked, not bet: the Tracked panel alone, never a bet here)
  private allTracked: ModelBet[] = [];
  private tracked: ModelBet[] = [];
  trackedBySport: Tally[] = [];
  trackedTotal: Tally | null = null;
  // (the slate's practice picks (desk.mjs PRACTICE_SPLIT, state.json's practiceSplit): bet at 0.5u for the slate, short
  // of the vig, their own Practice line by sport, out of every record above; with the split off, among the bets)
  private allPractice: ModelBet[] = [];
  practiceBySport: Tally[] = [];
  practiceTotal: Tally | null = null;
  // (the game lines' CLV gate by sport (state.json's lineGate, desk.mjs lineGate): full stakes, or the practice stake and why)
  lineGates: { label: string; on: boolean; text: string }[] = [];

  // (the bets by when the bot placed them, the dropdown left of the game's: the algorithm changes, so today's
  // bets are today's logic; Today on every visit. The record, tiles, chart and results follow it; the bets
  // still open (Open Bets, In Play) are always all there: they're what's happening now)
  readonly ranges = DATE_RANGES;
  range: DateRange = 'today';

  // (the model's epoch, the newest in the sports' states (desk-math.ts deskEpochOf; a sport without one: all its
  // bets), and whether the record is since it (the default) or all time. Display only: the ledgers keep every bet,
  // and the bets still open are always there)
  epoch: DeskEpoch | null = null;
  sinceModel = readSince();

  // (one game on show, the dropdown left of the chips: its ESPN id; '' every game. A new sport clears it)
  game = '';
  gameDays: GameDay[] = [];

  overall!: Tally;
  // (every bet's tally in the sport and game on show, whatever the range: the account's balance and rebuys)
  account!: Tally;
  bySport: SportTally[] = [];
  byMarket: Tally[] = [];
  byStake: Tally[] = [];
  // (the record by the Book's bands, LOCK to PASS, and all of them)
  byConfidence: Tally[] = [];
  confidenceTotal: Tally | null = null;
  // (the bets it saw value in, apart from the ones placed for the data (till TRACKED_FROM): the real record is the edge's)
  byIntent: Tally[] = [];
  byProp: Tally[] = [];
  calibration: CalibrationRow[] = [];
  // (the profit after each graded bet: the total's line, its low and high, the profit now)
  curve = '';
  curveRange = { min: 0, max: 0 };
  curveProfit = 0;
  // (the dashed line at 0, and the last point: the profit now, its dot)
  curveZeroY = 0;
  curveEnd: CurveSpot | null = null;
  // (each point's hover target: a strip across the chart, its dot, and what it was: "After bet 34 of 120:
  // +4.30u, bankroll 1004.30u (+1.82u, NFL Bills -3, won) · NFL +6.10u, NBA -1.80u")
  curveSpots: CurveSpot[] = [];
  // (each sport's own line, with more than one sport in it; or the one sport it all is, the total in its color)
  curveLines: CurveLine[] = [];
  curveSolo: string | null = null;
  // (the latest results' run: "W3")
  streak: string | null = null;
  // (the bets on games not started yet, and in play: started, not graded yet; the latest results)
  open: ModelBet[] = [];
  live: ModelBet[] = [];
  recent: ModelBet[] = [];
  private graded: ModelBet[] = [];
  changes: (Change & { sport: string })[] = [];
  contextRows: ContextRow[] = [];
  contextTests: { label: string; games: number; before: TestNumbers; after: TestNumbers }[] = [];
  propRows: PropRow[] = [];
  // (the NFL's questionable players' chance of playing, in words, a sport a line: desk-model.ts playChanceText)
  playChances: { sport: string; text: string }[] = [];
  // (each sport's same-game sizing, in words: desk-model.ts sameGameText)
  sameGames: { sport: string; text: string }[] = [];
  // (each sport's live calibration of the props' chances, in words: desk-model.ts calibText)
  calibs: { sport: string; text: string }[] = [];
  // (the CHECKs panel: each sport's graded CHECKs by what drove them, and the advice they make: desk-model.ts checkPanelOf)
  checkCauses: CheckCauseRow[] = [];
  checkAdvice: (CheckAdvice & { sport: string })[] = [];
  // (the CHECKs' news research's own scorecard: desk-model.ts researchPanelOf)
  researchRows: ResearchRow[] = [];
  backtestRows: BacktestRow[] = [];
  credits: OddsUsage | null = null;
  // (the weekly self-check: each sport's on show, flags first; the checks opened, and the sports whose folded
  // checks are shown, by key)
  selfChecks: SelfCheckView[] = [];
  // (the News signals panel: the teams' news read for role changes, log only (news-signals.ts); shown once a
  // sport has the file)
  newsSignals: NewsSignalRow[] = [];
  newsSignalsOn = false;
  private allNewsSignals: (NewsSignalsFile | null)[] = [];
  // (the Miss review panel: the biggest misses' causes, read from the news each day (miss-review.ts); shown once a
  // sport has the file; its recommendations in the Self-check panel too)
  missPanel: MissPanel = { days: [], tally: [], recommendations: [], line: '' };
  missOn = false;
  private allMisses: (MissReviewFile | null)[] = [];
  // (the Scorecard panel: each version of the model scored by the replay gate, a point per version (scorecard.ts);
  // shown once a sport has the file)
  scorecards: ScoreChart[] = [];
  scorecardOn = false;
  readonly scoreW = SCORE_W;
  readonly scoreH = SCORE_H;
  private allScorecards: (ScorecardFile | null)[] = [];
  // (the Bot's history (replay-history.ts): each sport's replayed record (replay-record.json, gate.mjs --record:
  // today's algorithm over the priced history before its epoch) joined to the live ledger's bets since; the panel
  // at the top. Shown once a sport has the file; the tiles under it stay the live desk's own)
  history: BotHistory | null = null;
  historyOn = false;
  private allReplays: (ReplayRecordFile | null)[] = [];
  private allLedgerBets: ModelBet[] = [];
  readonly recordText = recordText;
  readonly recordTip = recordTip;
  readonly compactCount = compactCount;
  readonly countTip = countTip;
  readonly buildLabel = buildLabel;
  // (the five on show (the owner, 2026-10-19: "pare it down"): the build, by sport, by confidence, the open bets and
  // the last 20 closed, all on the history; the rest under the hood, folded)
  hoodOpen = false;
  // (By Confidence's rows, PASS to LOCK with the practice picks between, the history's)
  bandRows: HistoryRow[] = [];
  // (the build at the top: the version's epoch, its commit and what changed: replay-history.ts buildOf)
  buildInfo: { at: string | null; commit: string | null; note: string | null; through: string | null } = { at: null, commit: null, note: null, through: null };
  readonly dayLabel = dayLabel;
  private allSelfChecks: (SelfCheckFile | null)[] = [];
  private selfOpen = new Set<string>();

  // (each in-play game's score and clock, by its ESPN id, from ESPN's scoreboard every minute)
  scores = new Map<string, { text: string; score: string; detail: string; final: boolean }>();
  // (each in-play prop's stat so far, by the bet's id, from its game's box score every minute)
  propNow = new Map<string, number | null>();
  // (an in-play prop's player's team, its ESPN id, from the box score: an older prop's color, without its team)
  private livePropTeams = new Map<string, string>();
  // (each in-play game's score as numbers and whether it's over: the bets settled here as soon as they're
  // decided, pending the next run's official grading)
  private boards = new Map<string, Board>();
  private scoreTimer?: ReturnType<typeof setInterval>;
  private closed = false;

  // (the tiles' count-up: 0 to 1 as they tick, 1 once they've landed)
  tick = 1;
  private tickFrame = 0;
  private zone = inject(NgZone);
  private cd = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    // (every sport's files asked at once, not each sport's one after another)
    const files = await Promise.all(
      SPORTS.map(async (sport) => {
        const [ledger, state, checks, selfcheck, news, misses, scorecard, replay] = await Promise.all([
          getJson<{ bets?: ModelBet[] }>(`/${sport}/data/model/ledger.json`, { cache: 'no-cache' }),
          getJson<ModelState>(`/${sport}/data/model/state.json`, { cache: 'no-cache' }),
          // (none before the bettor's first CHECK file: no CHECK row)
          getJson<{ checks?: CheckEntry[] }>(`/${sport}/data/model/checks.json`, { cache: 'no-cache' }),
          // (none before the weekly self-check's first run: the panel says so)
          getJson<SelfCheckFile>(`/${sport}/data/model/selfcheck.json`, { cache: 'no-cache' }),
          // (none till the news signals run (NEWS_SIGNALS=1): no panel)
          getJson<NewsSignalsFile>(`/${sport}/data/model/news-signals.json`, { cache: 'no-cache' }),
          // (none till the miss review's first run: no panel)
          getJson<MissReviewFile>(`/${sport}/data/model/miss-review.json`, { cache: 'no-cache' }),
          // (none till the replay gate records a version (gate.mjs --record): no panel)
          getJson<ScorecardFile>(`/${sport}/data/model/scorecard.json`, { cache: 'no-cache' }),
          // (none till the gate records a version with the replayed record: the live desk alone)
          getJson<ReplayRecordFile>(`/${sport}/data/model/replay-record.json`, { cache: 'no-cache' }),
        ]);
        return { ledger, state, checks, selfcheck, news, misses, scorecard, replay };
      }),
    );
    this.allSelfChecks = files.map((f) => f.selfcheck);
    this.allNewsSignals = files.map((f) => f.news);
    this.newsSignalsOn = this.allNewsSignals.some((f) => !!f);
    this.allMisses = files.map((f) => f.misses);
    this.missOn = this.allMisses.some((f) => !!f);
    this.allScorecards = files.map((f) => f.scorecard);
    this.scorecardOn = this.allScorecards.some((f) => !!f?.entries?.length);
    this.allReplays = files.map((f) => f.replay);
    this.historyOn = this.allReplays.some((f) => !!f?.overall);
    this.allStates = files.map((f) => f.state).filter((s): s is ModelState => !!s);
    const rows = files.flatMap((f) => f.ledger?.bets ?? []);
    this.allLedgerBets = rows;
    const split = this.allStates.some((s) => s.practiceSplit);
    const practice = (b: ModelBet) => split && !!b.topN && !isTracked(b);
    this.allBets = rows.filter((b) => !isTracked(b) && !practice(b));
    this.allTracked = rows.filter(isTracked);
    this.allPractice = rows.filter(practice);
    this.epoch = deskEpochOf(this.allStates);
    this.allChecks = files.flatMap((f) => checkBets(Array.isArray(f.checks?.checks) ? f.checks!.checks : []));
    // (a remembered sport with no bets (NBA before its season): every sport instead, not an untouched
    // 1,000u desk that reads like an empty wallet)
    if (this.sport && !this.allBets.some((b) => b.sport === this.sport)) this.sport = null;
    this.show();
    this.loading = false;
    this.loadTeams();
    // (not if the desk closed while its files loaded: nothing would stop it)
    // (not while the page is out of view: ESPN asked for nothing no one sees)
    if (!this.closed) this.scoreTimer = setInterval(() => !document.hidden && this.loadScores(), 60_000);
  }

  ngOnDestroy(): void {
    this.closed = true;
    clearInterval(this.scoreTimer);
    cancelAnimationFrame(this.tickFrame);
  }

  setGame(game: string): void {
    this.game = game;
    this.show();
  }

  setRange(range: DateRange): void {
    this.range = range;
    this.game = '';
    this.show();
  }

  setSince(since: boolean): void {
    this.sinceModel = since;
    this.game = '';
    try {
      if (since) localStorage.removeItem(SINCE_KEY);
      else localStorage.setItem(SINCE_KEY, 'all');
    } catch {
      // (storage off: the choice lasts the visit)
    }
    this.show();
  }

  // (the toggle's words: "Since this model (Oct 14, 6:00 AM)": the sport on show's epoch, else the one most
  // sports share (desk-math.ts epochShared; a league that started later keeps its own, which the chip's title
  // lists with every sport's date). Each sport's bets are still judged by its own epoch)
  get epochText(): string {
    if (!this.epoch) return 'Since this version';
    const at = (this.sport ? epochFor(this.epoch, this.sport) : null) ?? epochShared(this.epoch);
    return at ? `Since this version (${epochLabel(at)})` : 'Since this version';
  }

  get epochTitle(): string {
    const by = this.epoch?.bySport;
    if (!by) return this.help['epoch'];
    return `${this.help['epoch']}\n${Object.entries(by)
      .map(([sport, at]) => `${sport.toUpperCase()}: ${epochLabel(at)}`)
      .join(' · ')}`;
  }

  // (a bet on the record on show: in the date range, and since the model's epoch unless All Time's picked)
  private shown(b: ModelBet): boolean {
    return this.inRange(b) && (!this.sinceModel || afterEpoch(b, this.epoch));
  }

  // (a bet whose game is in the range on show, by this browser's calendar, as Closed Bets has it: the bot bets a
  // day's games that day, so the game's date and the bet's are the same day)
  private inRange(b: ModelBet): boolean {
    return inRange(this.range, b.start ?? b.placedAt);
  }

  setSport(sport: string | null): void {
    this.sport = sport;
    this.game = '';
    try {
      if (sport) localStorage.setItem(SPORT_KEY, sport);
      else localStorage.removeItem(SPORT_KEY);
    } catch {
      // (storage off: the choice lasts the visit)
    }
    this.show();
  }

  // (what's on show changed: its bets and states picked, everything built from them, the scores asked, the
  // tiles counting up to their new numbers)
  private show(): void {
    const sportAll = this.sport ? this.allBets.filter((b) => b.sport === this.sport) : this.allBets;
    const scoped = this.game ? sportAll.filter((b) => b.event === this.game) : sportAll;
    // (the account is every bet's, whatever the range: a balance doesn't change with the dates on show)
    this.account = tally('All', scoped);
    this.bets = scoped.filter((b) => b.status === 'open' || this.shown(b));
    // (the CHECKs in the same sport, game and range: placed, the first time they were recorded)
    this.checks = this.allChecks.filter((c) => (!this.sport || c.sport === this.sport) && (!this.game || c.event === this.game) && (c.status === 'open' || this.shown(c)));
    // (the tracked rows the same way)
    this.tracked = this.allTracked.filter((c) => (!this.sport || c.sport === this.sport) && (!this.game || c.event === this.game) && (c.status === 'open' || this.shown(c)));
    this.states = this.sport ? this.allStates.filter((s) => s.sport === this.sport) : this.allStates;
    this.build();
    this.loadScores();
    this.startTick();
  }

  // (the Self-check panel's name, with the week it covers)
  get selfTitle(): string {
    const week = this.selfChecks.find((v) => v.week)?.week;
    return week ? `Self-check · week of ${week}` : 'Self-check';
  }

  // (a self-check's row, or a sport's folded checks, opened or closed: by its key)
  selfShown(key: string): boolean {
    return this.selfOpen.has(key);
  }

  toggleSelf(key: string): void {
    if (this.selfOpen.has(key)) this.selfOpen.delete(key);
    else this.selfOpen.add(key);
  }

  // (a self-check's example bet in words: its pick and game, where the desk has it; else its id)
  selfExample(id: string): string {
    const b = this.allBets.find((x) => x.id === id) ?? this.allTracked.find((x) => x.id === id) ?? this.allChecks.find((x) => x.id === id);
    return b ? `${b.pick} · ${matchupName(b.sport, b.matchup)}${b.status !== 'open' ? ` · ${b.status}` : ''}` : id;
  }

  // (the Tracked panel's name: how many on show, how many of them open)
  get trackedTitle(): string {
    const open = this.tracked.filter((b) => b.status === 'open').length;
    return `Tracked, not bet · ${this.tracked.length}${open ? ` (${open} open)` : ''}`;
  }

  // (a sport's open bets, or every sport's: the chips' counts)
  openCount(sport: string | null): number {
    return this.allBets.filter((b) => b.status === 'open' && (!sport || b.sport === sport)).length;
  }

  private build(): void {
    const bets = this.bets;
    const now = Date.now();
    const where = (f: (b: ModelBet) => boolean) => bets.filter(f);
    this.overall = tally('All', bets);
    this.bySport = SPORTS.map((sport) => ({ ...tally(sport.toUpperCase(), where((b) => b.sport === sport)), state: this.states.find((s) => s.sport === sport) ?? null })).filter(
      (t) => t.state || t.bets || t.open,
    );
    this.byMarket = Object.keys(MARKET_NAMES).map((m) => tally(MARKET_NAMES[m], where((b) => b.market === m)));
    // (Action: the bets with no edge placed for the data, till TRACKED_FROM; since then tracked, not bet: the Tracked panel)
    this.byIntent = [tally('Edge', where((b) => intentOf(b) === 'edge')), tally('Action', where((b) => intentOf(b) === 'action'))].filter((t) => t.label === 'Edge' || t.bets || t.open);
    // (the tracked rows' record by sport, a unit each as if bet, and all of them)
    const tracked = this.tracked.map(atUnit);
    this.trackedBySport = SPORTS.map((sport) => tally(sport.toUpperCase(), tracked.filter((b) => b.sport === sport))).filter((t) => t.bets || t.open);
    // (and the NFL's anytime touchdowns on their own row, among the NFL's above: tracked only, never bet)
    const anytime = tally('NFL · Anytime TD', tracked.filter((b) => b.propType === 'anyTd'));
    if (anytime.bets || anytime.open) this.trackedBySport.push(anytime);
    this.trackedTotal = this.trackedBySport.length > 1 ? tally('Total', tracked) : null;
    // (the practice picks the same way, at their own stakes, in the sport, game and range on show)
    const practice = this.allPractice.filter((b) => (!this.sport || b.sport === this.sport) && (!this.game || b.event === this.game) && (b.status === 'open' || this.shown(b)));
    this.practiceBySport = SPORTS.map((sport) => tally(sport.toUpperCase(), practice.filter((b) => b.sport === sport))).filter((t) => t.bets || t.open);
    this.practiceTotal = this.practiceBySport.length > 1 ? tally('Total', practice) : null;
    // (the game lines' CLV gate, a line a sport on show: "NFL lines: bet · CLV +0.012 over 31 graded" or, negative,
    // "NHL lines: practice stake · CLV -0.0347 over 185": still bet, at 0.5u; only the bets since the model's epoch)
    this.lineGates = this.states
      .filter((s) => s.lineGate)
      .map((s) => {
        const g = s.lineGate!;
        const ev = g.ev === null ? 'no CLV read yet' : `CLV ${g.ev >= 0 ? '+' : ''}${g.ev.toFixed(4)} a unit over the last ${g.n} graded line bets`;
        return { label: s.label, on: g.on, text: g.on ? `${s.label} lines: bet · ${ev}${g.n < g.min ? ` (under ${g.min}: too few to gate)` : ''}` : `${s.label} lines: practice stake · CLV ${g.ev?.toFixed(4)} over ${g.n} since the Bot's last change: bet at 0.5u till it's positive` };
      });
    this.byStake = STAKES.map((u) => tally(`${u}u`, where((b) => b.units === u))).filter((t) => t.bets || t.open);
    // (by the Book's bands: each bet's Kelly score and chance when placed, bet-why.ts confidenceOf)
    const band = (b: ModelBet) => confidenceOf(kellyOf(b.p, b.odds) ?? 0, b.p, intentOf(b) === 'edge');
    // (the Book's bands as the desk names them, best first: tiers.ts; CHECK the CHECKs' own, at a unit as if
    // bet, under LOCK and out of the total: the gap's (an older one without a cause the gap's) and the role's apart)
    const isRole = (c: ModelBet) => (c as { cause?: string }).cause === 'role';
    this.byConfidence = TIERS.flatMap((t) =>
      t.confidence === 'check'
        ? [tally(t.label.toUpperCase(), this.checks.filter((c) => !isRole(c))), tally(`${t.label.toUpperCase()} ROLE`, this.checks.filter(isRole))]
        : [tally(t.label.toUpperCase(), where((b) => band(b) === t.confidence))],
    ).filter((t) => t.bets || t.open);
    this.confidenceTotal = this.byConfidence.length ? tally('Total', bets) : null;
    // (the calibration the tracked rows' too: a chance it gave, graded, whether it was bet or not; the no-edge
    // markets are most of them, and the bets alone are only the sides priced over their break-even)
    this.calibration = calibrationOf([...bets, ...this.tracked]);

    // (the profit after each graded bet, in grading order, the total's and each sport's)
    const graded = gradedOrder(bets);
    const curve = profitCurves(graded, this.bankroll, units);
    this.curve = curve.path;
    this.curveRange = curve.range;
    this.curveProfit = curve.profit;
    this.curveSpots = curve.spots;
    this.curveZeroY = curve.zeroY;
    this.curveEnd = curve.end;
    this.curveLines = curve.lines;
    this.curveSolo = curve.solo;
    this.streak = streakOf(graded);

    this.graded = graded.slice(-40).reverse();
    this.splitOpen(now);
    this.gameDays = gameDaysOf(this.allBets.filter((b) => b.status === 'open' || this.shown(b)), this.sport, now);
    this.changes = this.states
      .flatMap((s) => s.changelog.map((c) => ({ ...c, sport: s.label })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30);

    // (each sport's context terms, and its held-out numbers with and without them)
    this.contextRows = this.states.flatMap((s) => (s.context?.terms ?? []).map((t) => ({ ...t, sport: s.label, unitWord: UNIT_WORDS[s.sport] ?? '' })));
    this.contextTests = this.states.filter((s) => s.context?.test).map((s) => ({ label: s.label, ...s.context!.test }));

    // (the backtest: each sport's markets; The Odds API's credits, the latest state's)
    this.backtestRows = this.states.flatMap((s) => Object.entries(s.backtest?.markets ?? {}).map(([market, m]) => ({ ...m, sport: s.label, market })));
    this.credits = [...this.states].sort((a, b) => b.updated.localeCompare(a.updated)).find((s) => s.odds)?.odds ?? null;

    // (the props: each sport's prop types and their projections' fit and check; the bets by type)
    this.propRows = this.states.flatMap((s) => (s.props?.types ?? []).map((t) => ({ ...t, sport: s.label })));
    this.playChances = this.states.flatMap((s) => {
      const text = playChanceText(s.props?.playChance);
      return text ? [{ sport: s.label, text }] : [];
    });
    this.sameGames = this.states.flatMap((s) => {
      const text = sameGameText(s.sameGame);
      return text ? [{ sport: s.label, text }] : [];
    });
    this.calibs = this.states.flatMap((s) => {
      const text = calibText(s.calib);
      return text ? [{ sport: s.label, text }] : [];
    });
    const panel = checkPanelOf(this.states);
    this.selfChecks = selfCheckPanelOf(
      this.allSelfChecks.filter((f) => !!f && (!this.sport || f.sport === this.sport)),
      Object.fromEntries(this.allStates.map((s) => [s.sport, s.label])),
    );
    this.newsSignals = newsSignalRows(this.allNewsSignals, Object.fromEntries(this.allStates.map((s) => [s.sport, s.label])), this.sport);
    this.missPanel = missPanelOf(this.allMisses, Object.fromEntries(this.allStates.map((s) => [s.sport, s.label])), this.sport);
    this.scorecards = scorecardPanelOf(
      this.allScorecards.filter((f) => !!f && (!this.sport || f.sport === this.sport)),
      Object.fromEntries(this.allStates.map((s) => [s.sport, s.label])),
    );
    // (the Bot's history: the sport on show's, or every sport's summed; the game and date filters never cut it)
    // (with no replay file yet, the live ledger alone: the same panels, the same shape)
    const h = botHistoryOf(this.allReplays, this.allLedgerBets, this.sport, Object.fromEntries(this.allStates.map((s) => [s.sport, s.label])));
    this.history = h;
    const histBand = (label: string) => h.byBand.find((r) => r.label === label) ?? emptyRow(label);
    this.bandRows = [histBand('PASS'), h.practice, histBand('LIKE'), histBand('LOVE'), histBand('LOCK')];
    this.buildInfo = buildOf(this.allReplays, this.sport, this.epoch ? ((this.sport ? epochFor(this.epoch, this.sport) : null) ?? epochShared(this.epoch)) : null);
    this.checkCauses = panel.rows;
    this.checkAdvice = panel.advice;
    this.researchRows = researchPanelOf(this.states);
    const typeOf = (b: ModelBet) => `${b.sport.toUpperCase()} ${b.statLabel}`;
    const props = where((b) => b.market === 'prop');
    this.byProp = [...new Set(props.map(typeOf))].map((label) => tally(label, props.filter((b) => typeOf(b) === label)));
  }

  // The open bets as of now: the ones not started yet (soonest first; with them a game past its start that
  // ESPN hasn't begun or has put off: a delayed start, a rainout), and the ones under way: In Play only while
  // their game runs; once it's over they're Latest Results', first, with the result the scores give them until
  // the run grades them
  private splitOpen(now: number): void {
    const open = this.bets.filter((b) => b.status === 'open');
    const waiting = (b: ModelBet) => Date.parse(b.start) > now || this.notUnderWay(b);
    this.open = open.filter(waiting).sort((a, b) => a.start.localeCompare(b.start));
    const started = open.filter((b) => !waiting(b)).sort((a, b) => a.start.localeCompare(b.start));
    this.live = started.filter((b) => !this.isOver(b));
    this.recent = [...started.filter((b) => this.isOver(b)).reverse(), ...this.graded];
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
    for (const slate of slates) {
      const [sport, day] = slate.split('|');
      const board = await getJson<{ events?: ScoreboardEvent[] }>(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[sport]}/scoreboard?dates=${day}`);
      for (const event of board?.events ?? []) this.readEvent(event);
    }
    const props = live.filter((b) => b.market === 'prop' && b.event && b.athlete !== undefined && b.propType);
    for (const event of new Set(props.map((b) => b.event!))) {
      const mine = props.filter((b) => b.event === event);
      const body = await getJson<SummaryBox>(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES[mine[0].sport]}/summary?event=${event}`);
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

  // The tiles count up from 0 to their numbers, quick, eased out (not with reduced motion)
  private startTick(): void {
    cancelAnimationFrame(this.tickFrame);
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') {
      this.tick = 1;
      return;
    }
    // (its frames outside Angular, each checking the desk alone: not a whole-page pass sixty times a second)
    const t0 = performance.now();
    const step = (t: number) => {
      const x = Math.min(1, (t - t0) / TICK_MS);
      this.tick = 1 - (1 - x) ** 3;
      if (!this.closed) this.cd.detectChanges();
      if (x < 1) this.tickFrame = requestAnimationFrame(step);
    };
    this.tick = 0;
    this.zone.runOutsideAngular(() => (this.tickFrame = requestAnimationFrame(step)));
  }

  // (a tile's number as it ticks: a count whole, anything else as it goes)
  // (the Record tile's as it ticks, compact: "6.2k–2.2k–41")
  tickedRecord(): string {
    return compactRecord({ won: this.ticked(this.overall.won, true), lost: this.ticked(this.overall.lost, true), push: this.ticked(this.overall.push, true) });
  }

  // (a count with its words, exact: "1,204 with a close")
  countWith(n: number): string {
    return `${n.toLocaleString('en-US')} with a close`;
  }

  ticked(v: number, whole = false): number {
    const x = v * this.tick;
    return whole ? Math.round(x) : x;
  }

  // ---------------------------------------------------------------------------
  // The account, as at a sportsbook: a bet's stake leaves the balance when it's placed and comes back with its
  // winnings (or doesn't) when it's graded
  // ---------------------------------------------------------------------------

  // (the bankroll: the starting 1,000 plus what's been won or lost, plus 1,000 for each rebuy)
  get balance(): number {
    return this.bankroll + this.account.profit + this.rebuys * this.bankroll;
  }

  // (both from every bet's profit, not the range's)
  get rebuys(): number {
    return rebuysFor(this.bankroll, this.account.profit, this.atRisk);
  }

  // (the stakes on open bets, started or not)
  get atRisk(): number {
    return this.bets.filter((b) => b.status === 'open').reduce((sum, b) => sum + b.units, 0);
  }

  // (what's left to bet with)
  get available(): number {
    return this.balance - this.atRisk;
  }

  // (the stakes in play right now)
  get liveRisk(): number {
    return this.live.reduce((sum, b) => sum + b.units, 0);
  }

  // (the in-play bets decided so far, and what they come to)
  get pending(): { count: number; profit: number } {
    let count = 0;
    let profit = 0;
    for (const b of this.bets) {
      const p = this.provisional(b);
      if (!p) continue;
      count++;
      profit += p.profit;
    }
    return { count, profit };
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

  // (a bet's result in Latest Results: the run's grade (a void one, no action, said so), or for one not graded
  // yet, the scores')
  result(b: ModelBet): { status: string; profit: number } | null {
    return b.status !== 'open' ? { status: b.void ? 'void' : b.status, profit: b.profit } : this.provisional(b);
  }

  // (a bet's final score: the run's, or the scoreboard's before it's graded)
  finalScore(b: ModelBet): string {
    return b.final ?? (b.event ? (this.scores.get(b.event)?.score ?? '') : '');
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

  sideEdge(b: ModelBet): number | null {
    return sideEdge(b, this.boardOf(b));
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

  readonly signed = signed;
  readonly pct = pct;
  readonly units = units;
  readonly num = num;
  readonly odds = americanOdds;
  readonly toWin = toWin;
  readonly modelVsMarket = modelVsMarket;
  readonly pinnacleEdge = pinnacleEdge;

  marketName(m: string): string {
    return MARKET_NAMES[m] ?? m;
  }

  // (a tally's CLV: the share of its bets that beat the close; under it, their mean expected return at it)
  clvBeatText(t: Tally): string {
    return t.clvN ? pct(t.clvBeat, 0) : '-';
  }

  clvEvText(t: Tally): string | null {
    return t.clvN && t.clvEv !== null ? `${t.clvEv >= 0 ? '+' : ''}${(t.clvEv * 100).toFixed(1)}%` : null;
  }

  // (a bet's CLV: the chance its price gained on the close's no-vig chance at its line (clv.mjs prob), a moved
  // line carried to its own; left out (a moved line it couldn't carry, no closing price): the points alone, or none)
  betClv(b: ModelBet): string {
    const c = b.clv;
    if (!c) return '-';
    if (c.prob !== null && c.prob !== undefined) return `${c.prob >= 0 ? '+' : ''}${(c.prob * 100).toFixed(1)}%`;
    if (c.pts !== null && c.pts !== 0) return `${c.pts > 0 ? '+' : ''}${c.pts} pts`;
    return '-';
  }

  trustText(state: ModelState | null): string {
    if (!state) return '-';
    return Object.entries(state.trust)
      .filter(([m]) => !m.startsWith('prop:'))
      .map(([m, t]) => `${MARKET_NAMES[m] ?? m} ${t.trust}${t.fitted ? '' : '*'}`)
      .join(' · ');
  }

  // (credits spent this cycle)
  creditsUsed(c: OddsUsage): number {
    return c.monthly - c.remaining;
  }

  // (a graded bet's premise broke in the game: a starter hurt, a goalie pulled)
  broke(b: ModelBet): boolean {
    return (b.weight ?? 1) < 1;
  }

  // (its post-mortem's hover: the story's headline and opening, and everything noted in the game)
  recapText(b: ModelBet): string {
    return [b.recap?.headline, b.recap?.lede, ...(b.disrupted ?? []).map((d) => `${d.severe ? '! ' : ''}${d.text}`)].filter(Boolean).join('\n');
  }

  // (a prop type's matchup terms: each one's fitted size, or "left out", and its held-out gain)
  matchupText(t: PropType): string {
    const names: Record<string, string> = {
      roleK: 'role split',
      fun: 'funnel (over expected)',
      pc: 'pace',
      tg: 'target share',
      vc: 'teammates out (work left)',
      vcM: 'teammates out, fit again on the NBA minutes base',
      vl: 'teammates out, who absorbs their work (learned by position and depth, across positions)',
      c_wind: 'wind',
      c_cold: 'cold',
      c_precip: 'rain/snow',
      c_backupQb: 'backup QB',
      c_usage: 'teammates out',
      c_b2b: 'back-to-back (his team played last night)',
      c_b2bAll: 'back-to-back, every player one size (his team played last night)',
      c_b2bB: 'back-to-back, a bench player (the minutes the starters give up)',
      c_b2bS: 'back-to-back, a starter',
      c_oppB2b: 'opponent on a back-to-back',
      c_blowout: 'blowout',
      c_blowS: 'blowout by the betting lines, a starter (his fourth quarter sat)',
      c_blowB: 'blowout by the betting lines, a bench player (the garbage time his)',
      c_newStart: 'a bench player who started his last game',
      sn: 'snaps-based rate (NBA: minutes first, his per-minute rate times his expected minutes; NHL: ice time first, the same with his time on ice)',
      ps: 'NBA positions (guards, forwards, centers): the opponent allowed and the prior by position (2: the role split by it too)',
      po: "NBA pace (tonight's expected possessions, against the league's or his own games'; form 0: the other side's over the league's, 2: the game's expected over his games' average, 3: the other side's over his games' average)",
      ep: "NFL expected plays tonight (his team's own pace and the other side's, or the game's total and its share of the ball, against his games this season, leaning on last season's early on; form 1: the expected over his games' expected, 2: over the plays his team ran in them, 3: the game's total times its share over his games', 4: that over the plays run; in place of the defense's pace)",
      tr: "team allocation: the team's game first (its own total of the stat a game, by the opponent's allowed), each player's projection shrunk toward his share of it so his team's players add up, as its backs' carries to its runs (form 1: the team's games and the opponent's; 2 and 3: with the betting lines' implied points, half or in full; 4: the team's games alone; on NFL rush+rec yards scaled so it moves yards between players and games without moving the stat's overall level)",
      c_oppShots: 'opponent shots',
      c_ppLean: "his share of his team's power-play time lately against his season's (NHL: a top unit's spot won or lost)",
      c_teamShots: "his team's expected shots tonight (NHL)",
      c_mTotal: 'the betting total (NHL goals)',
      od: "defense tables' recency: the opponent's latest games count most in what it allows",
      c_oppOut: "the opponent's players out tonight (NBA: its production missing)",
      c_oppD: "the opponent's top-four defensemen out tonight (NHL)",
      c_oppDB: "the opponent's starting cornerbacks and safeties out tonight (NFL)",
      c_oppFront: "the opponent's starting linemen and linebackers out tonight (NFL)",
      c_lineupK: "the other side's posted lineup: its strikeout rate against the league's (MLB pitchers)",
      c_lineupKd: "the other side's posted lineup: its strikeout rate against its usual lineup's (MLB pitchers)",
      c_lineupOb: "the other side's posted lineup: its on-base rate, more batters faced an out (MLB pitchers)",
      c_parkH: "the ballpark's hits against what its batters hit elsewhere (MLB)",
      c_parkTB: "the ballpark's total bases against what its batters hit elsewhere (MLB)",
      c_paX: 'plate appearances expected at his slot tonight, home or away, against his own a game (MLB)',
      c_airTemp: 'temperature at first pitch, outdoors (MLB batters)',
      c_windOutB: 'wind out toward center, in negative (MLB batters)',
      c_homeBat: "home or away (MLB batters: the home side's ninth often not batted)",
      c_parkRel: "the ballpark against the parks his own numbers were made in (MLB batters)",
      c_hitEnv: 'the batting environment: the ballpark against his usual parks, the temperature and the wind out, as one (MLB batters)',
      c_olOut: "his own offensive line's starters changed or out (NFL)",
      c_proe: "his team's pass rate over expected so far (NFL)",
      c_rbLoad: "a back's late-season load: his carries a game from his team's 13th game on (NFL)",
      c_rbPass: 'a passing-down back by the game script (his share of touches that are targets, his side the underdog) (NFL)',
      c_lastGame: "his team's last regular-season game: week 18's rest (NFL)",
      c_rzPass: "his team's red-zone dropbacks a game (its trips inside the 20 times its pass rate there) against the league's (NFL passing TDs)",
      c_rzPassM: "his team's red-zone dropbacks against the league's, with the other side's red-zone defense averaged in (NFL passing TDs)",
      c_rzGap: "his team's passing TDs against what its red-zone passes make at the league's rate (NFL passing TDs)",
      ex: "early exit: his chance of a short game (hurt, benched, pulled) shaping the chances around his projection, its average unchanged (NFL receiving yards)",
      a_WR: 'opponent allowed to wide receivers',
      a_TE: 'opponent allowed to tight ends',
      a_RB: 'opponent allowed to running backs',
      a_QB: 'opponent allowed to quarterbacks',
      vol: 'volume base (targets times yards a target)',
      yk: "yards a target: his longer run's weight (targets)",
      dp: 'draft slot (a rookie\'s prior)',
      c_rb1Out: 'lead running back out',
      c_newCoach: "a new head coach's first games",
      c_qb1Out: 'starting QB out',
      c_qbDeep: "starting QB out, a deep receiver (his air yards a target over the league's)",
      c_ppShare: 'power-play share',
      c_midSeason: 'weeks 5 to 8',
      rp: 'next man up (projected in the role he steps into)',
      nu: "next man up: his share at least this much of the missing one's",
      nt: "next man up: his target share at least this much of the missing one's",
      ij: 'back from injury (his eased games weigh less)',
      ia: 'back from injury: team games missed',
      ir: "back from injury: the returners' first game back",
      ro: 'role order by recent healthy work (not season totals)',
      ab: 'same teammates out: his games with them out weigh in',
      c_aheadOut: 'a regular ahead of him out',
      ot: 'organic trend (his work rising or falling, no injury ahead)',
      sk: "part-timer's prior counted at his snap share",
      rx: "last five reaching back into last season",
      pl: "prior leaning to last season's late games",
      sp: "start-of-season prior: a veteran's prior from last season moved by how players like him (his position, his age, on a new team or not) have opened seasons against it, fading as his own games come in",
      sl: 'extreme projections pulled toward the typical one (or pushed from it), fitted',
      mk: "game script from the betting lines (the market's implied team points, not the desk's own)",
      c_mSpread: 'favored or underdog by the betting lines (spread)',
      cs: 'over/under chance calibrated separately above and below the projection',
      hl: "recency weight: newer games count more in the projection's final lean, spread and calibration (its half-life in seasons; kept only where the held-out games came out better by the floor, 0.03% of log loss, and no more biased)",
    };
    return Object.entries(t.gains ?? {})
      .map(([k, g]) => {
        const P = propTerms(t);
        const v = P[k];
        const on = k === 'roleK' || k.startsWith('a_') ? v !== null && v !== undefined : !!v;
        const gain = g === null ? 'never fit in' : `held-out ${g >= 0 ? '+' : ''}${(g * 100).toFixed(2)}%`;
        const pg = P['pg'] ?? 0;
        // (a soft term (project.mjs softWeight): in at part of its size, its weight)
        const soft = softTerms(t)[k];
        return `${names[k] ?? k} ${on ? (k === 'roleK' ? `k ${v}` : k === 'po' ? `${v}, form ${pg}` : k === 'ep' ? `${v}, form ${P['eg'] ?? 1}` : k === 'tr' ? `${v}, form ${P['tf'] ?? 1}` : k === 'pc' && P['ep'] ? `${v}, replaced by expected plays` : k === 'vl' ? `size ${P['vc'] ?? 0}` : v) : 'left out'}${on && soft ? `, soft ${soft.w}x` : ''} (${gain})`;
      })
      .join(' · ');
  }

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

  // (a game's stakes, and what its bets came to so far: null with none decided)
  groupUnits(g: BetGroup): number {
    return Math.round(g.bets.reduce((sum, b) => sum + b.units, 0) * 100) / 100;
  }

  // (its game's final: a side's or a total's (a prop's says the player's count), else the scoreboard's)
  groupFinal(g: BetGroup): string {
    const game = g.bets.find((b) => b.market !== 'prop');
    return (game && this.finalScore(game)) || (g.bets[0].event ? (this.scores.get(g.bets[0].event)?.score ?? '') : '');
  }

  groupProfit(g: BetGroup): number | null {
    const decided = g.bets.map((b) => this.result(b)).filter((r) => r !== null);
    return decided.length ? decided.reduce((sum, r) => sum + r.profit, 0) : null;
  }

  // ---------------------------------------------------------------------------
  // Sorting (desk-columns.ts): each table its own; Open Bets by EV, best first, Latest Results latest graded first
  // ---------------------------------------------------------------------------

  private sorts = new TableSorts({ open: { key: 'ev', dir: -1 }, recent: { key: 'graded', dir: -1 }, context: { key: 'gain', dir: -1 } });
  sortBy = (table: string, key: string) => this.sorts.sortBy(table, key);
  ariaSort = (table: string, key: string) => this.sorts.ariaSort(table, key);
  sorted = <T>(table: string, rows: T[], value: (row: T, key: string) => unknown): T[] => this.sorts.sorted(table, rows, value);

  readonly tallyValue = tallyValue;
  readonly sportValue = sportValue;
  readonly calibrationValue = calibrationValue;
  readonly stateValue = stateValue;
  readonly backtestValue = backtestValue;
  readonly propValue = propValue;
  readonly contextValue = contextValue;
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
