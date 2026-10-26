import { Component, DestroyRef, NgZone, inject } from '@angular/core';
import { quietListener } from '@ranker/core/quiet-listener';
import { oddsText } from '../account/wallet/wallet-math';
import { FightViewService } from './fight-view.service';

// The fight view (the owner, 2026-10-26: "old MMA fight details viewable like a game view"): a UFC bout over the
// page, as the game view is a game: the two fighters (the first-listed first, "A vs. B"), the result or the clock or
// the start between them, the fight's facts (card, division, rounds, records), the Bot's rows on it (the price it
// took, the open, the close, the other side's; bet or tracked, its units; when it placed and when it was graded) and
// the user's own tickets on it. Escape or the backdrop closes it. Its state: fight-view.service.ts; the words:
// fight-view.ts
@Component({
  selector: 'fight-view',
  templateUrl: './fight-view.component.html',
  styleUrls: ['../../styles/components/fight-view.scss'],
  standalone: false,
})
export class FightViewComponent {
  readonly fights = inject(FightViewService);
  readonly oddsText = oddsText;

  constructor() {
    quietListener<KeyboardEvent>(inject(NgZone), inject(DestroyRef), document, 'keydown', (event) => event.key === 'Escape' && !!this.fights.ref(), () => this.fights.close());
  }

  // (an image ESPN hasn't: out of the way, keeping its space)
  hide(event: Event): void {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
