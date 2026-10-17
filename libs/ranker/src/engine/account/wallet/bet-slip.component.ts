import { Component, ElementRef, HostListener, ViewChild, effect } from '@angular/core';
import { AccountService } from '../account.service';
import { WalletService } from './wallet.service';
import { CHIPS, PARLAY_MAX, START, Selection, addChip, oddsText, parlayToWin, payout, slipTotals, toWin } from './wallet-math';
import { Tapped, tapMinimizes } from './slip-sheet';

// The bet slip: the prices clicked on the Bets page, each with its stake (a casino's chips, a half, 1, 5, 10
// and 25 units, stacked on with each click, or a number typed), what it'd win and pay back, then Place. A
// printed ticket (The Book), docked in the page's right column on a wide screen; on a phone a stub along the
// bottom with the totals and Place while it's minimized, its Expand raising the ticket as a sheet (slipOpen);
// the sheet's chevron, Escape or a tap outside it minimize it back to the stub, the bets kept (slip-sheet.ts).
// With 2 selections or more, Straight or Parlay: a parlay the selections as one bet (2 to 10 legs, one a game:
// no same-game parlays), one stake at their combined price. Play money only: signed out, it asks for a sign-in
// first.
@Component({
  selector: 'bet-slip',
  templateUrl: './bet-slip.component.html',
  styleUrls: ['../../../styles/components/wallet-slip.scss'],
  standalone: false,
})
export class BetSlipComponent {
  // (the bankroll a new player starts with)
  readonly start = START;
  readonly chips = CHIPS;
  readonly oddsText = oddsText;
  readonly toWin = toWin;
  readonly payout = payout;
  readonly parlayMax = PARLAY_MAX;
  // (the ticket's date, printed on its head)
  readonly today = new Date();
  error = '';
  @ViewChild('panel') panel?: ElementRef<HTMLElement>;

  constructor(
    readonly wallet: WalletService,
    readonly account: AccountService,
  ) {
    // (opened: focus into it)
    effect(() => {
      if (this.wallet.slipOpen()) setTimeout(() => this.panel?.nativeElement.focus({ preventScroll: true }));
    });
  }

  // (the tray's sums: each straight bet's, or the parlay's one stake on its legs' product, as the settler pays it)
  get totals() {
    if (!this.wallet.asParlay()) return slipTotals(this.wallet.slip());
    const stake = this.wallet.parlayStake();
    if (this.wallet.parlay().odds === null || !(stake > 0)) return slipTotals([]);
    const win = parlayToWin(stake, this.wallet.slip());
    return { count: 1, stake, toWin: win, payout: Math.round((stake + win) * 100) / 100 };
  }

  // (what's left in the wallet for this bet: the balance less the slip's other stakes)
  room(s: Selection): number {
    const others = this.wallet.slip().filter((x) => x.key !== s.key).reduce((t, x) => t + (x.stake > 0 ? x.stake : 0), 0);
    return this.wallet.balance() - others;
  }

  chip(s: Selection, value: number): void {
    this.wallet.setStake(s.key, addChip(s.stake, value, this.room(s)));
  }

  typed(s: Selection, value: string): void {
    this.wallet.setStake(s.key, Number(value));
  }

  // (the parlay's one stake: chips onto it up to the balance, or typed)
  parlayChip(value: number): void {
    this.wallet.setParlayStake(addChip(this.wallet.parlayStake(), value, this.wallet.balance()));
  }

  parlayTyped(value: string): void {
    this.wallet.setParlayStake(Number(value));
  }

  mode(m: 'straight' | 'parlay'): void {
    this.wallet.slipMode.set(m);
    this.wallet.placed.set(null);
  }

  get problems(): boolean {
    if (this.wallet.asParlay()) return !!this.wallet.parlayIssue();
    return this.wallet.slip().some((s) => s.stake > 0 && this.wallet.problem(s));
  }

  // (the phone's sheet down to the stub; the bets stay on the ticket)
  minimize(): void {
    this.wallet.slipOpen.set(false);
  }

  expand(): void {
    this.wallet.slipOpen.set(true);
  }

  // (the failure the last placing had on a bet still on the slip)
  failure(s: Selection | 'parlay'): string | null {
    const key = s === 'parlay' ? s : s.key;
    return this.wallet.placed()?.failed.find((f) => f.key === key)?.why ?? null;
  }

  async place(): Promise<void> {
    this.error = '';
    if (!this.account.signedIn()) {
      this.account.openLogin();
      return;
    }
    try {
      await this.wallet.place();
    } catch (error) {
      this.error = (error as { code?: string }).code === 'auth/no-current-user' ? 'Sign in to place bets' : 'Couldn’t reach the wallet: try again';
    }
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    if (this.wallet.slipOpen() && !this.account.loginOpen()) this.minimize();
  }

  // (a tap outside the open sheet on a phone minimizes it: not one on the sheet, the stub, a price being added
  // or the login; the width read at the tap, as the stylesheet docks the ticket from 1000px)
  @HostListener('document:pointerdown', ['$event'])
  tapped(event: { target: EventTarget | null }, width = window.innerWidth): void {
    if (tapMinimizes(event.target as Tapped, this.wallet.slipOpen() && !this.account.loginOpen(), width)) this.minimize();
  }
}
