// The Overview's splash, loaded lazily: its art (the stage, the props, the jerseys) is a chunk of its own,
// fetched the first time a card's Overview opens, so the page's first load doesn't carry it.
import { Component, Input, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import type { PlayerCard } from '../card.model';
import type { PlayerCards } from '../player-cards';

let splash: Promise<Type<unknown>> | null = null;

@Component({
  selector: 'card-splash-host',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `@if (component; as c) {
    <ng-container *ngComponentOutlet="c; inputs: { card: card, cards: cards }"></ng-container>
  }`,
})
export class CardSplashHost {
  @Input({ required: true }) card!: PlayerCard;
  @Input({ required: true }) cards!: PlayerCards;
  component: Type<unknown> | null = null;

  constructor() {
    splash ??= import('./splash.component').then((m) => m.CardSplash);
    splash.then((c) => (this.component = c));
  }
}
