import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { HeatMode, HeatSplit } from './heat-map.model';

// <heat-map-controls>: the bar over a card's heat maps, in groups: what's showing (the season, any the row has
// a file for, and the split: Season, REG, POST, Red zone... as the maps' data has them), how it's colored (by
// efficiency against the league's, or by volume) and, for a team, the side of the ball. The season a
// dropdown and the rest pills, all in the sport's own inputs (the grid's: _sport-kit.scss's $dropdowns and
// .game-filter, dressed by each theme); a change goes out, the card keeps it.
@Component({
  selector: 'heat-map-controls',
  templateUrl: './heat-map-controls.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeatMapControlsComponent {
  @Input() seasons: number[] = [];
  @Input() season: number | null = null;
  // (a season's name in the dropdown: "Current Season" while it's being played, the sport's own else)
  @Input() seasonText: (season: number) => string = String;
  @Input() splits: HeatSplit[] = [];
  @Input() split = '';
  @Input() sides: HeatSplit[] | null = null;
  @Input() side: string | null = null;
  @Input() mode: HeatMode = 'efficiency';
  // (no mode switch for a row with nothing it changes: a kicker's rings, a punter's punts)
  @Input() showMode = true;

  @Output() seasonChange = new EventEmitter<number>();
  @Output() splitChange = new EventEmitter<string>();
  @Output() sideChange = new EventEmitter<string>();
  @Output() modeChange = new EventEmitter<HeatMode>();

  readonly modes: { id: HeatMode; label: string; title: string }[] = [
    { id: 'efficiency', label: 'Efficiency', title: "Each cell tinted against the league's there" },
    { id: 'volume', label: 'Volume', title: 'Each cell by its share of the plays' },
  ];
}
