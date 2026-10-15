import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { HeatMode, HeatOpponent, HeatSplit } from './heat-map.model';

// <heat-map-controls>: the bar over a card's heat maps: the season (any the row has a file for), the split
// (Season, REG, POST, Red zone... as the maps' data has them), the side (a team's offense or defense), the
// mode (efficiency against the league's, or volume), and the overlay (the next opponent's defense over the
// zones). Each a pill group in the sport's own pills (.game-filter, dressed by each theme); a change goes out,
// the card keeps it.
@Component({
  selector: 'heat-map-controls',
  templateUrl: './heat-map-controls.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeatMapControlsComponent {
  @Input() seasons: number[] = [];
  @Input() season: number | null = null;
  @Input() seasonText: (season: number) => string = String;
  @Input() splits: HeatSplit[] = [];
  @Input() split = '';
  @Input() sides: HeatSplit[] | null = null;
  @Input() side: string | null = null;
  @Input() mode: HeatMode = 'efficiency';
  // (no mode switch for a row with nothing it changes: a kicker's rings, a punter's punts)
  @Input() showMode = true;
  @Input() opponent: HeatOpponent | null = null;
  @Input() overlay = false;

  @Output() seasonChange = new EventEmitter<number>();
  @Output() splitChange = new EventEmitter<string>();
  @Output() sideChange = new EventEmitter<string>();
  @Output() modeChange = new EventEmitter<HeatMode>();
  @Output() overlayChange = new EventEmitter<boolean>();

  readonly modes: { id: HeatMode; label: string; title: string }[] = [
    { id: 'efficiency', label: 'Efficiency', title: "Each cell tinted against the league's there" },
    { id: 'volume', label: 'Volume', title: 'Each cell by its share of the plays' },
  ];

  get overlayTitle(): string {
    const o = this.opponent;
    return o ? `Lay ${o.label}'s defense over the zones: where the matchup leans${o.when ? ` (${o.when})` : ''}` : '';
  }

  pickSeason(value: string): void {
    this.seasonChange.emit(Number(value));
  }
}
