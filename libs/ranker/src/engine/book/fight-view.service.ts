import { Injectable, computed, inject, signal } from '@angular/core';
import { fetchJson } from '@ranker/core/http';
import { LinesService } from '../account/wallet/lines.service';
import { WalletService } from '../account/wallet/wallet.service';
import { PlayBet, espnDay, legBets } from '../account/wallet/wallet-math';
import { GameViewService } from '../game-view/game-view.service';
import { ESPN_LEAGUES } from './desk-math';
import { FightLedgerRow, FightView, fightViewOf, gameRefOf } from './fight-view';
import { EspnMmaScoreboard, LiveBout, mmaBouts } from './live-mma';

// The fight view's state (the owner, 2026-10-26: a past fight viewable like a game view): the bout open, ESPN's
// card for its day (read on its own, never into the Book's boards, so an old card stays off the ticker), and the
// Bot's ledger rows on it (mma's data/model/ledger.json, kept five minutes). One at a time; its modal is
// fight-view.component. openBet: a ticket's or a strip's game, a fight here, a team sport's game the game view
export interface FightRef {
  event: string;
  start?: string | null;
}

const SCOREBOARD = `https://site.api.espn.com/apis/site/v2/sports/${ESPN_LEAGUES['mma']}/scoreboard`;
const LEDGER = '/mma/data/model/ledger.json';
// (a bout under way read again every thirty seconds while it's open)
const LIVE_BEAT = 30_000;

@Injectable({ providedIn: 'root' })
export class FightViewService {
  private readonly lines = inject(LinesService);
  private readonly wallet = inject(WalletService);
  private readonly games = inject(GameViewService);

  readonly ref = signal<FightRef | null>(null);
  readonly loading = signal(false);
  private readonly bout = signal<LiveBout | null>(null);
  private readonly rows = signal<FightLedgerRow[]>([]);
  // (the view as the modal draws it; none found: null, the modal says so)
  readonly view = computed<FightView | null>(() => {
    const ref = this.ref();
    if (!ref) return null;
    const board = this.lines.board('mma', ref.event) as LiveBout | undefined;
    const bout = this.bout() ?? (board && 'fight' in board ? board : null);
    return fightViewOf(bout, this.rows());
  });
  // (the user's own tickets on it: straight bets and parlay legs, newest first)
  readonly mine = computed<PlayBet[]>(() => {
    const ref = this.ref();
    if (!ref) return [];
    return this.wallet.bets().flatMap((b) => (b.kind === 'parlay' ? legBets(b) : [b])).filter((b) => b.sport === 'mma' && String(b.event) === ref.event);
  });

  private opened = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ledger: { at: number; load: Promise<FightLedgerRow[]> } | null = null;
  private readonly cards = new Map<string, { at: number; load: Promise<LiveBout[]> }>();

  open(ref: FightRef): void {
    const ticket = ++this.opened;
    this.ref.set(ref);
    this.bout.set(null);
    this.rows.set([]);
    this.loading.set(true);
    this.stopBeat();
    void this.load(ticket, ref);
  }

  close(): void {
    this.opened++;
    this.stopBeat();
    this.ref.set(null);
    this.bout.set(null);
    this.rows.set([]);
    this.loading.set(false);
  }

  // A bet's game opened (a ticket's leg, a Recently closed bet): a fight its fight view, a team sport's game the game
  // view over the page (its own tab: a game to come its Preview, else its Summary). No ESPN id: nothing
  openBet(b: { sport: string; event?: string | null; start?: string | null; matchup?: string | null }): void {
    const to = gameRefOf(b);
    if (!to) return;
    if (to.kind === 'fight') this.open({ event: to.event, start: to.start });
    else void this.games.open({ event: to.event }, null, to.league);
  }

  private async load(ticket: number, ref: FightRef): Promise<void> {
    const rows = (await this.ledgerRows()).filter((r) => String(r.event) === ref.event);
    if (ticket !== this.opened) return;
    this.rows.set(rows);
    const start = ref.start || rows[0]?.start || '';
    const bout = await this.findBout(ref.event, start);
    if (ticket !== this.opened) return;
    this.bout.set(bout);
    this.loading.set(false);
    // (under way: read again while it's open)
    if (bout?.state === 'in') {
      this.timer = setInterval(() => {
        void this.findBout(ref.event, start, LIVE_BEAT - 5_000).then((b) => ticket === this.opened && b && this.bout.set(b));
      }, LIVE_BEAT);
    }
  }

  private stopBeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // (the bout on ESPN's card for its day (ESPN's day, US Eastern), else the day after or before (a late main event, a
  // start the ledger has as the card's); none known, the current card's)
  private async findBout(event: string, start: string, maxAge = 5 * 60e3): Promise<LiveBout | null> {
    const t = Date.parse(start);
    const days = Number.isFinite(t) ? [t, t + 864e5, t - 864e5].map((x) => espnDay(x)) : [''];
    for (const day of days) {
      const bout = (await this.card(day, maxAge)).find((b) => b.event === event);
      if (bout) return bout;
    }
    return null;
  }

  private card(day: string, maxAge: number): Promise<LiveBout[]> {
    const kept = this.cards.get(day);
    if (kept && Date.now() - kept.at < maxAge) return kept.load;
    // (the betting board's bouts lend their matchup and faces, as the Live tab's do)
    const model = new Map([...this.lines.boards().values()].filter((g) => g.sport === 'mma').map((g) => [g.event, g]));
    const load = fetchJson<EspnMmaScoreboard | null>(day ? `${SCOREBOARD}?dates=${day}&limit=200` : SCOREBOARD, null).then((body) => mmaBouts(body, model));
    this.cards.set(day, { at: Date.now(), load });
    return load;
  }

  private ledgerRows(): Promise<FightLedgerRow[]> {
    if (this.ledger && Date.now() - this.ledger.at < 5 * 60e3) return this.ledger.load;
    const load = fetchJson<{ bets?: FightLedgerRow[] } | null>(LEDGER, null, { cache: 'no-cache' }).then((body) => body?.bets ?? []);
    this.ledger = { at: Date.now(), load };
    return load;
  }
}
