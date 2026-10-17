import { Component, Directive, HostBinding, HostListener, Input, booleanAttribute } from '@angular/core';
import { SPORT } from '@sport/sport';
import { PlayerLink, PlayerRef, hasCardOpener, openCardInApp, pickName, playerLinkOf } from './player-link';

// <a [playerLink]="{ sport, name, pos }">: a player's name or face as a link to his card (player-link.ts): in
// place where his sport's grid is on the page, else his sport's app in a new tab. The site's link look
// (_base.scss .player-link: as the text reads until hovered, then lit; a face lightens), "Open <player>'s
// card" to a reader. playerLinkFace: a face beside his linked name, out of the tab order and hidden from
// readers (the name says it). A click never reaches the row under it (a board row opens its reasons).
@Directive({
  selector: 'a[playerLink]',
  standalone: false,
})
export class PlayerLinkDirective {
  @Input() playerLink: PlayerRef | null = null;
  @Input({ transform: booleanAttribute }) playerLinkFace = false;

  private get link(): PlayerLink | null {
    return this.playerLink ? playerLinkOf(this.playerLink, { sport: SPORT.id, host: hasCardOpener() }) : null;
  }

  @HostBinding('class.player-link') readonly linkClass = true;
  @HostBinding('class.player-link-face') get faceClass(): boolean {
    return this.playerLinkFace;
  }
  @HostBinding('attr.href') get href(): string | null {
    return this.link?.href ?? null;
  }
  @HostBinding('attr.target') get target(): string | null {
    const link = this.link;
    return link && !link.inApp ? '_blank' : null;
  }
  @HostBinding('attr.rel') get rel(): string | null {
    const link = this.link;
    return link && !link.inApp ? 'noopener' : null;
  }
  @HostBinding('attr.title') get title(): string | null {
    return this.link ? `Open ${this.playerLink!.name}'s card` : null;
  }
  @HostBinding('attr.aria-label') get label(): string | null {
    return this.link && !this.playerLinkFace ? `Open ${this.playerLink!.name}'s card` : null;
  }
  @HostBinding('attr.aria-hidden') get hidden(): string | null {
    return this.playerLinkFace ? 'true' : null;
  }
  @HostBinding('attr.tabindex') get tabindex(): string | null {
    return this.playerLinkFace ? '-1' : null;
  }

  @HostListener('click', ['$event'])
  click(event: MouseEvent): void {
    event.stopPropagation();
    const link = this.link;
    // (a new tab's link, or one the user asked for in a tab of its own: the browser's)
    if (!link?.inApp || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!openCardInApp(this.playerLink!)) window.open(link.href, '_blank', 'noopener');
  }
}

// A pick's words with its player's name as the link to his card ("<a>Drake Maye</a> Over 224.5 Passing
// Yards"; a fight's pick, the fighter's name, all link); a pick that doesn't lead with him, the words as they are
@Component({
  selector: 'pick-text',
  template: `@if (split; as s) {<a [playerLink]="player">{{ s.name }}</a>{{ s.rest }}} @else {{{ pick }}}`,
  standalone: false,
})
export class PickTextComponent {
  @Input() pick: string | null | undefined = '';
  @Input() player: PlayerRef | null = null;

  get split(): { name: string; rest: string } | null {
    return this.player ? pickName(this.pick, this.player.name) : null;
  }
}
