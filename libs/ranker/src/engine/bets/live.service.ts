import { Injectable, computed, inject, signal } from '@angular/core';
import { LinesService } from '../account/wallet/lines.service';
import { WalletService } from '../account/wallet/wallet.service';
import { GameBoard, PlayBet, legBets } from '../account/wallet/wallet-math';
import { ESPN_LEAGUES, SPORTS } from './desk-math';
import { loadGame } from '../game-view/game';
import type { GameView } from '../game-view/game.model';
import { todayGames } from './live-games';
import { betsByGame } from './live-view';

// The Live tab's data, nothing the page doesn't already load: today's games off ESPN's scoreboards (lines.service,
// the boards the Bets page read for its dropdown and ticker), the user's open bets on them (the wallet's), and the
// summaries of the games the user has bets on (the game modal's own read of ESPN's summary: game.ts loadGame), for
// their sparkline and last play. While the tab shows (start, stop), the scoreboards are asked for again every
// thirty seconds (lines.games with a shorter age: its day cache is left as it is), and so are those summaries;
// nothing while it doesn't.
const BEAT = 30_000;
// (the sports with a scoreboard: a UFC card's bouts have none)
export const LIVE_SPORTS = SPORTS.filter((s) => s !== 'mma');

@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly lines = inject(LinesService);
  private readonly wallet = inject(WalletService);
  // (the clock the lists go by: set on each beat, so today's games follow the day as it turns)
  private readonly now = signal(Date.now());

  // Today's games: under way first, then today's still to come, the finished last
  readonly games = computed<GameBoard[]>(() => todayGames(this.lines.boards().values(), this.now(), LIVE_SPORTS));
  // (how many are on now: the tab's count)
  readonly liveCount = computed(() => this.games().filter((g) => g.state === 'in').length);
  // (whether the day has games on or still to come: the tab shows)
  readonly hasGames = computed(() => this.games().some((g) => g.state !== 'post'));
  // The user's open bets by game ("sport|event"): straight bets, and the open legs of parlays as bets of their own
  readonly betsByGame = computed(() => betsByGame(this.wallet.openBets(), legBets));
  // The summaries of the games under way that the user has bets on, by "sport|event" (none for the rest: their
  // cards show without the sparkline and last play)
  readonly summaries = signal(new Map<string, GameView>());

  private timer: ReturnType<typeof setInterval> | null = null;
  private watching = 0;
  private beating = false;

  // (the tab showing: a beat now and every thirty seconds after; stopped when it's gone. Counted: two watchers,
  // two stops)
  start(): void {
    if (this.watching++ > 0) return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), BEAT);
  }

  stop(): void {
    if (--this.watching > 0) return;
    this.watching = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // A beat: the scoreboards of every sport with a game on or to come today (all of them on the first), then the
  // summaries of the live games with bets on them
  private async beat(): Promise<void> {
    if (this.beating || typeof document !== 'undefined' && document.hidden) return;
    this.beating = true;
    try {
      const now = Date.now();
      this.now.set(now);
      const games = this.games();
      const active = new Set(games.filter((g) => g.state !== 'post').map((g) => g.sport));
      const sports = games.length ? LIVE_SPORTS.filter((s) => active.has(s)) : LIVE_SPORTS;
      const start = new Date(now).toISOString();
      await this.lines.games(sports.map((sport) => ({ sport, start })), BEAT - 5_000);
      this.now.set(Date.now());
      await this.readSummaries();
    } finally {
      this.beating = false;
    }
  }

  private async readSummaries(): Promise<void> {
    const bets = this.betsByGame();
    const live = this.games().filter((g) => g.state === 'in' && bets.has(`${g.sport}|${g.event}`) && ESPN_LEAGUES[g.sport]);
    const next = new Map<string, GameView>();
    await Promise.all(
      live.map(async (g) => {
        try {
          next.set(`${g.sport}|${g.event}`, await loadGame(ESPN_LEAGUES[g.sport], g.event));
        } catch {
          // (a summary that won't load: its card shows without the sparkline and last play)
          const kept = this.summaries().get(`${g.sport}|${g.event}`);
          if (kept) next.set(`${g.sport}|${g.event}`, kept);
        }
      }),
    );
    this.summaries.set(next);
  }

  // (the user's bets on a game)
  betsOn(g: Pick<GameBoard, 'sport' | 'event'>): PlayBet[] {
    return this.betsByGame().get(`${g.sport}|${g.event}`) ?? [];
  }
}
