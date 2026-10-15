import { Component, Input, OnDestroy, OnInit, computed, effect, isDevMode, signal, untracked } from '@angular/core';
import { ModelBet, Settled } from '../../bets/desk-model';
import { CURVE_W } from '../../bets/desk-math';
import { DATE_RANGES, DateRange, inRange, isDateRange, pastRange, rangeWords } from '../../bets/date-range';
import { hideImage, leagueLogo, teamLogo, headshot } from '../../bets/bet-format';
import { AccountService } from '../account.service';
import { ADMIN, canUse } from '../features';
import { chooseBetsView } from '../../bets/bets-view';
import { PRIVACY_HASH } from '../account-page.component';
import { LinesService } from './lines.service';
import { WalletService } from './wallet.service';
import {
  Leaderboard,
  PlayBet,
  PlayLive,
  SPORTS,
  START,
  Versus,
  betToWin,
  byGame,
  legBets,
  liveOf,
  oddsText,
  parlayProgress,
  playBySport,
  playCurve,
  playTally,
  provisionalOf,
  recordText,
  toWin,
  versusBot,
} from './wallet-math';

type Period = Leaderboard['period'];

// #wallet: the play-money bankroll as the Algorithm desk shows the bot's (balance, record, profit, return,
// what's at risk, the profit after each settled bet), the open bets (in play, a result as soon as the score
// decides it, pending settlement: the settler pays it after the game), the settled history by game, the
// user's record beside the bot's over the same stretch, and the leaderboards; a parlay one row, opening to its
// legs (each with its own live column, the parlay "2 of 4 hit"). Reload (back to 1,000, a new run) and Clear
// history (typed to confirm) at the top.
// (the bot's ledgers, every sport's, for You vs the Bot: fetched once a visit, however often the wallet opens)
let ledgerPromise: Promise<ModelBet[]> | null = null;
function botLedger(): Promise<ModelBet[]> {
  ledgerPromise ??= Promise.all(
    SPORTS.map((s) =>
      fetch(`/${s}/data/model/ledger.json`, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        // (its bets alone: a market it tracked, not bet (intent 'track', since Oct 13, 2026), never)
        .then((body: { bets?: ModelBet[] } | null) => (body?.bets ?? []).filter((b) => b.intent !== 'track'))
        .catch(() => [] as ModelBet[]),
    ),
  ).then((all) => all.flat());
  return ledgerPromise;
}

// (the settled history's date range, the Algorithm's dropdown: All Time unless picked, the pick remembered on
// this browser)
const RANGE_KEY = 'closedRange';
const readRange = (): DateRange => {
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    return isDateRange(saved) ? saved : 'all';
  } catch {
    return 'all';
  }
};

// (a game this close to its start, or under way, has its score looked up each minute)
const NEAR = 15 * 60e3;

@Component({
  selector: 'wallet-page',
  host: { role: 'main' },
  templateUrl: './wallet-page.component.html',
  styleUrls: ['../../../styles/components/model-desk.scss', '../../../styles/components/wallet-page.scss'],
  standalone: false,
})
export class WalletPageComponent implements OnInit, OnDestroy {
  readonly canUse = canUse;
  readonly start = START;
  readonly oddsText = oddsText;
  readonly toWin = toWin;
  readonly betToWin = betToWin;
  readonly recordText = recordText;
  readonly hideImage = hideImage;
  readonly leagueLogo = leagueLogo;
  readonly curveWidth = CURVE_W;

  // (the open bets' props in play: each one's count so far, by bet id)
  private readonly propNow = signal(new Map<string, number | null>());
  private timer: ReturnType<typeof setInterval> | null = null;
  // (each sport's ledger: the bot's bets, for the comparison)
  private readonly ledger = signal<ModelBet[] | null>(null);

  // (the three boards, read once: the panel shows only with someone on one, its periods only those with rows)
  readonly period = signal<Period>('week');
  private readonly boards = signal<Partial<Record<Period, Leaderboard | null>> | undefined>(undefined);
  private readonly allPeriods: { id: Period; label: string }[] = [
    { id: 'week', label: 'This week' },
    { id: 'season', label: 'Season' },
    { id: 'all', label: 'All time' },
  ];
  readonly periods = computed(() => this.allPeriods.filter((p) => this.boards()?.[p.id]?.rows?.length));
  readonly board = computed(() => this.boards()?.[this.period()] ?? null);
  // (Clear history: an admin's (the token's claim), and in development for testing)
  readonly admin = (): boolean => isDevMode() || ADMIN();
  // (the Bets page's Open Bets or Closed Bets tab: those bets alone, no tiles, the rest or the slip)
  @Input() only: 'open' | 'closed' | null = null;
  // (a link to the Bets page lands on its Place Bets, not the Algorithm or Open Bets)
  readonly toBets = (): void => chooseBetsView('bets');
  // (Settings, its Privacy panel open: where bet history goes public)
  readonly privacyHash = PRIVACY_HASH;

  // The confirmations: Reload's, and Clear history's (typed)
  confirming: 'reload' | 'clear' | null = null;
  typedClear = '';
  busy = false;
  message = '';

  constructor(
    readonly account: AccountService,
    readonly wallet: WalletService,
    readonly lines: LinesService,
  ) {
    // (the open bets' games looked up as soon as the bets arrive, and whenever they change: not while the page
    // is out of sight (a bet placed or settled in another tab), the minute's look picking it up once it's back)
    let seen = '';
    effect(() => {
      const ids = this.open().map((b) => b.id).join(',');
      if (ids && ids !== seen && !document.hidden) {
        seen = ids;
        void this.refresh();
      }
    });
    // (once someone's signed in: the settled history where it shows (the wallet, Closed Bets), and the
    // leaderboards and the bot's ledgers on the wallet itself only: Open and Closed Bets show neither)
    // (its first page only, untracked: loadSettled reads the history's state, and tracked, each page landing asked
    // for the next, the whole history read, a read a bet. Show more and a date range page on from there)
    effect(() => {
      if (!this.account.user()) return;
      untracked(() => {
        if (this.only !== 'open' && this.wallet.settledState() === 'idle') void this.wallet.loadSettled();
        if (!this.only && !this.extrasAsked) {
          this.extrasAsked = true;
          void this.loadBoards();
          void botLedger().then((bets) => this.ledger.set(bets));
        }
      });
    });
  }
  private extrasAsked = false;
  // (a date range picked: the history's next page, and the next, until the range is all here; not again on a
  // page that brought nothing (a failed one: Show more tries it then))
  private autoPaged = -1;
  private readonly rangePages = effect(() => {
    if (this.only === 'open' || !this.account.user()) return;
    if (this.wallet.settledState() !== 'more' || !this.rangeLoading()) return;
    const n = this.wallet.settledBets().length;
    if (n === this.autoPaged) return;
    this.autoPaged = n;
    untracked(() => void this.wallet.loadSettled());
  });

  readonly open = computed(() => this.wallet.bets().filter((b) => b.status === 'open'));
  // (what's in play, game by game: the open straight bets, and the open parlays' legs not graded yet, each a bet
  // of its own for its game's score and a prop's count)
  readonly tracked = computed(() => this.open().flatMap((b) => (b.kind === 'parlay' ? legBets(b).filter((l) => l.status === 'open') : [b])));
  // (each parlay's legs as bets, by the parlay's id)
  readonly legs = computed(() => new Map(this.wallet.bets().filter((b) => b.kind === 'parlay').map((b) => [b.id, legBets(b)])));
  readonly settled = computed(() => this.wallet.bets().filter((b) => b.status !== 'open'));
  readonly tally = computed(() => playTally(this.wallet.bets()));
  readonly curve = computed(() => playCurve(this.wallet.bets()));
  readonly openGames = computed(() => byGame(this.open()));
  // (the settled bets by sport and game, the latest game first unless the Date column's turned it round)
  readonly latestFirst = signal(true);
  readonly settledSports = computed(() => playBySport(byGame(this.settledShown(), this.latestFirst())));
  // (the settled history by its games' dates, the Date column's: Today, Yesterday, This Month, This Year, All
  // Time, as the Algorithm's dropdown. The history comes a page at a time, the latest settled first, and a bet
  // settles after its game starts: so a range's every bet is loaded once the oldest loaded settled before the
  // range began, the pages loaded on their own until then. All Time pages on Show more, as before)
  readonly ranges = DATE_RANGES;
  readonly range = signal<DateRange>(readRange());
  readonly rangeWords = rangeWords;
  readonly settledShown = computed(() => {
    const range = this.range();
    return range === 'all' ? this.settled() : this.settled().filter((b) => inRange(range, b.start));
  });
  // (the range's pages still coming: its bets aren't all here yet)
  readonly rangeLoading = computed(() => {
    const range = this.range();
    const state = this.wallet.settledState();
    if (range === 'all') return false;
    if (state === 'loading') return true;
    if (state !== 'more') return false;
    const loaded = this.wallet.settledBets();
    return !pastRange(range, loaded[loaded.length - 1]?.settledAt);
  });

  setRange(range: DateRange): void {
    this.range.set(range);
    try {
      if (range === 'all') localStorage.removeItem(RANGE_KEY);
      else localStorage.setItem(RANGE_KEY, range);
    } catch {
      // (storage off: the choice lasts the visit)
    }
  }
  // (folded, as the Algorithm's: a sport's games, and a game's bets, until opened)
  private readonly unfolded = signal(new Set<string>());

  isOpen(key: string): boolean {
    return this.unfolded().has(key);
  }

  toggleOpen(key: string): void {
    const next = new Set(this.unfolded());
    if (!next.delete(key)) next.add(key);
    this.unfolded.set(next);
  }
  readonly versus = computed<Versus | null>(() => {
    const ledger = this.ledger();
    return ledger ? versusBot(this.wallet.bets(), ledger) : null;
  });
  // (the run's own profit: the balance against 1,000, the open stakes counted back in)
  readonly runProfit = computed(() => this.wallet.balance() + this.tally().atRisk - START);

  // (a bet decided in play: its result before the settler pays it)
  readonly decided = computed(() => {
    const out = new Map<string, Settled>();
    const boards = this.lines.boards();
    const props = this.propNow();
    for (const b of this.tracked()) {
      const r = provisionalOf(b, boards.get(`${b.sport}|${b.event}`), props.get(b.id));
      if (r) out.set(b.id, r);
    }
    // (a parlay once its legs decide it: a leg lost, or every leg in)
    for (const [id, p] of this.progress()) {
      if (p.decided) out.set(id, { status: p.decided.status === 'void' ? 'push' : p.decided.status, profit: p.decided.profit });
    }
    return out;
  });
  // (each open parlay as it stands: its legs' results, graded by the settler or decided in play, how many hit)
  readonly progress = computed(() => {
    const out = new Map<string, ReturnType<typeof parlayProgress>>();
    const boards = this.lines.boards();
    const props = this.propNow();
    for (const b of this.open()) {
      if (b.kind !== 'parlay') continue;
      const states = (this.legs().get(b.id) ?? []).map((l) => (l.status !== 'open' ? l.status : (provisionalOf(l, boards.get(`${l.sport}|${l.event}`), props.get(l.id))?.status ?? null)));
      out.set(b.id, parlayProgress(b, states));
    }
    return out;
  });
  // (each open bet's live column, as the Algorithm's In Play: a prop's or a total's meter, a side at the score;
  // none before its game's under way)
  readonly live = computed(() => {
    const out = new Map<string, PlayLive>();
    const boards = this.lines.boards();
    const props = this.propNow();
    for (const b of this.tracked()) {
      const r = liveOf(b, boards.get(`${b.sport}|${b.event}`), props.get(b.id));
      if (r) out.set(b.id, r);
    }
    return out;
  });
  // (the decided bets' profit, pending settlement: a parlay's legs counted only in the parlay's own)
  readonly pending = computed(() => {
    let profit = 0;
    let count = 0;
    for (const b of this.open()) {
      const r = this.decided().get(b.id);
      if (!r) continue;
      profit += r.profit;
      count++;
    }
    return { count, profit };
  });

  ngOnInit(): void {
    void this.account.start().catch(() => undefined);
    // (the open bets' games each minute: only while the page is in view, and only once one's near its start)
    if (this.only !== 'closed') {
      void this.refresh();
      this.timer = setInterval(() => {
        if (!document.hidden && this.tracked().some((b) => Date.parse(b.start) - NEAR <= Date.now())) void this.refresh();
      }, 60e3);
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // The open bets' games: their scores (each sport's scoreboard on their days), and the props' counts once
  // their games are under way
  private async refresh(): Promise<void> {
    const open = this.tracked();
    if (!open.length) return;
    await this.lines.games(open, 50e3);
    const boards = this.lines.boards();
    const next = new Map(this.propNow());
    // (a prop's box score once its game's on the board and under way; once it's final and counted, no more
    // looks while it waits on the settler)
    const props = open.filter((b) => {
      const board = boards.get(`${b.sport}|${b.event}`);
      if (b.market !== 'prop' || !b.propType || !b.athlete || !board || board.state === 'pre') return false;
      return !(board.final && next.get(b.id) != null);
    });
    const events = new Map<string, PlayBet[]>();
    for (const b of props) events.set(`${b.sport}|${b.event}`, [...(events.get(`${b.sport}|${b.event}`) ?? []), b]);
    await Promise.all(
      [...events.values()].map(async (list) => {
        const counts = await this.lines.propCounts(list[0].sport, list[0].event, list.map((b) => ({ id: b.id, propType: b.propType!, athlete: b.athlete! })));
        for (const [id, v] of counts) next.set(id, v);
      }),
    );
    this.propNow.set(next);
  }

  private async loadBoards(): Promise<void> {
    const got = await Promise.all(this.allPeriods.map((p) => this.wallet.leaderboard(p.id).catch(() => null)));
    const boards: Partial<Record<Period, Leaderboard | null>> = {};
    this.allPeriods.forEach((p, i) => (boards[p.id] = got[i]));
    this.boards.set(boards);
    // (the first period with anyone on it)
    const first = this.periods()[0];
    if (first) this.period.set(first.id);
  }

  // ---------------------------------------------------------------------------
  // Words and pictures
  // ---------------------------------------------------------------------------
  units(v: number): string {
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}u`;
  }

  pct(v: number | null | undefined, digits = 1): string {
    return v === null || v === undefined ? '-' : `${(v * 100).toFixed(digits)}%`;
  }

  teams(b: { matchup: string }): [string, string] {
    const [away, home] = b.matchup.split(' @ ');
    return [away ?? '', home ?? ''];
  }

  logo(sport: string, abbr: string): string {
    return teamLogo(sport, abbr);
  }

  face(b: PlayBet): string {
    return headshot(b.sport, b.athlete);
  }

  // (a game's line in play: its score and clock, or when it starts)
  gameState(g: { sport: string; event: string; start: string }): { text: string; live: boolean } {
    const board = this.lines.boards().get(`${g.sport}|${g.event}`);
    if (!board || board.state === 'pre') return { text: '', live: false };
    return { text: `${board.away.abbr} ${board.away.score ?? 0} · ${board.home.abbr} ${board.home.score ?? 0} · ${board.detail}`, live: board.state === 'in' };
  }

  // (a parlay's sport group's name, a sport's its letters)
  sportName(sport: string): string {
    return sport === 'parlay' ? 'Parlays' : sport.toUpperCase();
  }

  // (a parlay's leg's result word on a settled parlay: graded, or not, its parlay lost on another leg first)
  legResult(l: PlayBet): string {
    if (l.status === 'open') return 'not graded';
    const base = l.status === 'won' ? 'hit' : l.status === 'lost' ? 'missed' : l.status;
    return `${base}${l.final ? ' · ' + l.final : ''}${l.note ? ' (' + l.note + ')' : ''}`;
  }

  // (a settled bet's result word: won, lost, push, or void with why)
  resultTitle(b: PlayBet): string {
    const base = `${b.status[0].toUpperCase()}${b.status.slice(1)}${b.final ? `: ${b.final}` : ''}`;
    return b.note ? `${base} (${b.note})` : base;
  }

  // (a past run's open bet: it settles and counts, its payout gone with the run)
  oldRun(b: PlayBet): boolean {
    return b.run !== (this.wallet.wallet()?.resets ?? 0);
  }

  stakeOf(list: PlayBet[]): number {
    return list.reduce((t, b) => t + b.stake, 0);
  }

  // (a game's bets' profit together)
  stakeProfit(list: PlayBet[]): number {
    return Math.round(list.reduce((t, b) => t + (b.profit ?? 0), 0) * 100) / 100;
  }

  // ---------------------------------------------------------------------------
  // Reload and Clear history
  // ---------------------------------------------------------------------------
  async reload(): Promise<void> {
    this.busy = true;
    this.message = '';
    try {
      await this.wallet.reload();
      this.message = `Reloaded: ${START.toLocaleString()} units, a fresh run.`;
      this.confirming = null;
    } catch {
      this.message = 'Couldn’t reload: try again.';
    } finally {
      this.busy = false;
    }
  }

  async clear(): Promise<void> {
    if (this.typedClear.trim().toUpperCase() !== 'CLEAR') return;
    this.busy = true;
    this.message = '';
    try {
      const n = await this.wallet.clearHistory();
      this.message = `Cleared ${n} settled bet${n === 1 ? '' : 's'}.`;
      this.confirming = null;
      this.typedClear = '';
    } catch {
      this.message = 'Couldn’t clear the history: try again.';
    } finally {
      this.busy = false;
    }
  }
}
