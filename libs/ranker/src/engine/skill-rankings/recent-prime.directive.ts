import { Directive, ElementRef, Input, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import type { SkillPlayer } from '@sport/positions';
import { rowTeamNames } from '@ranker/engine/row-fields';
import { GameViewService } from '@ranker/engine/game-view/game-view.service';

// A grid row's Recent squares: the pointer resting on them loads the team's scores for their hovers
// (GameViewService.primeSoon, after a moment; leaving first asks for none). Listened for outside Angular: a
// sweep down the list sets off no change detection, only the load, once it comes (primeSoon's timer runs
// back inside).
@Directive({
  selector: '[recentPrime]',
  standalone: false,
})
export class RecentPrimeDirective implements OnInit, OnDestroy {
  @Input({ required: true }) recentPrime!: SkillPlayer;
  @Input({ required: true }) recentSeason!: number;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly games = inject(GameViewService);

  ngOnInit(): void {
    const el = this.host.nativeElement;
    this.zone.runOutsideAngular(() => {
      el.addEventListener('mouseenter', this.enter);
      el.addEventListener('mouseleave', this.leave);
    });
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('mouseenter', this.enter);
    el.removeEventListener('mouseleave', this.leave);
  }

  private enter = () => this.games.primeSoon(rowTeamNames(this.recentPrime), this.recentSeason);
  private leave = () => this.games.cancelPrime();
}
