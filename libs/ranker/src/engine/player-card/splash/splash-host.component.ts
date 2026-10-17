// The Overview's splash, loaded lazily: its art (the stage, the props, the jerseys) is a chunk of its own, never
// in the page's first load. The grid fetches it once the page is idle (prefetchSplash), so by the time a card
// opens it's in the cache; and the card always paints FIRST: this host draws a placeholder the splash's own
// height (the dark stage, empty) and lands the splash a frame later, in that same box, so nothing on the card
// moves and the card's first paint never waits on the art.
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, Type, inject } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import type { PlayerCard } from '../card.model';
import type { PlayerCards } from '../player-cards';
import { loadSplashFonts } from './splash-fonts';

let splash: Promise<Type<unknown>> | null = null;

// The splash's chunk and its type, fetched once (the grid calls this when the page is idle; a card's host when
// it opens)
export function prefetchSplash(): Promise<Type<unknown>> {
  loadSplashFonts();
  return (splash ??= import('./splash.component').then((m) => m.CardSplash));
}

@Component({
  selector: 'card-splash-host',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `@if (component; as c) {
    <ng-container *ngComponentOutlet="c; inputs: { card: card, cards: cards }"></ng-container>
  } @else if (!card.ur) {
    <div class="splash-wait" aria-hidden="true"></div>
  }`,
  // (the placeholder: the splash's box exactly, splash.component.scss .splash: its height and the margins that
  // take it edge to edge under the tabs, on a desktop and on a phone)
  styles: `
    .splash-wait { background: #120e0b; border-bottom: 1px solid rgba(255, 255, 255, 0.08); height: 300px; margin: -18px -28px 18px; }
    @media (max-width: 640px) { .splash-wait { height: 236px; margin: -14px -14px 14px; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSplashHost {
  @Input({ required: true }) card!: PlayerCard;
  @Input({ required: true }) cards!: PlayerCards;
  component: Type<unknown> | null = null;
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    prefetchSplash().then((c) => {
      // (a frame after the card is up, whether the chunk was cached or just fetched: the card paints, then
      // the splash lands in the next frame)
      requestAnimationFrame(() =>
        setTimeout(() => {
          this.component = c;
          this.cdr.markForCheck();
        }),
      );
    });
  }
}
