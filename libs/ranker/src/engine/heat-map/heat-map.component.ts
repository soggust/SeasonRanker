import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, OnChanges, inject } from '@angular/core';
import type { HeatCell, HeatCellShape, HeatMode, HeatStat, HeatSurface, HeatSurfaceId } from './heat-map.model';
import { heatSurface } from './surfaces';
import { cellTone, heatPaint, isThin, leanText, toneText } from './heat-color';

// (each map's pattern ids its own: two maps on a card never share one)
let next = 0;

// A cell as drawn: its place, its paint and numbers in each mode (both kept, so a mode switch crossfades), its
// hover's lines and what a screen reader hears
export interface HeatCellView {
  id: string;
  i: number;
  shape: HeatCellShape;
  eff: { fill: string; main: string; sub: string };
  vol: { fill: string; main: string; sub: string };
  thin: boolean;
  tone: number;
  tip: { title: string; lines: { text: string; color?: string }[] };
  aria: string;
}

// <heat-map>: a surface (heat-map/surfaces: the NFL's field, its strip, the down & distance grid; later a rink,
// a half court...) with its cells painted by the stat: by efficiency against the league's in each cell
// (diverging, green the good side for the row; a defense's flipped), by volume by each cell's share of the sample
// (one hue). A cell short of the stat's sample is greyed. With overlay cells (an opponent's, the same ids) it's
// the matchup: the row's cells as an offense's, the overlay's as the defense's allowed, together. Its numbers in
// the cells (none on a compact one), a hover or a tap opens a cell's popover, and its key under it.
@Component({
  selector: 'heat-map',
  templateUrl: './heat-map.component.html',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeatMapComponent implements OnChanges {
  @Input({ required: true }) surface!: HeatSurfaceId;
  @Input({ required: true }) cells!: HeatCell[];
  @Input({ required: true }) stat!: HeatStat;
  @Input() mode: HeatMode = 'efficiency';
  // (an opponent's cells over the row's: what its defense allowed there; and its name in the hover, "KC's D")
  @Input() overlay: HeatCell[] | null = null;
  @Input() overlayLabel: string | null = null;
  // (the row's cells are what a defense allowed: less is better)
  @Input() defense = false;
  // (a small one, the AI preview's: no numbers in the cells, the key one line)
  @Input() compact = false;
  @Input() legend = true;
  // (what the map is, for a screen reader: "Targets by zone")
  @Input() label = '';

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly id = `hm${next++}`;

  shape: HeatSurface | null = null;
  box = '';
  view: HeatCellView[] = [];
  aria = '';
  // (the cell under the pointer or the keyboard's focus, and the one tapped open: it stays till another tap)
  hover: string | null = null;
  pinned: string | null = null;

  ngOnChanges(): void {
    this.shape = heatSurface(this.surface);
    if (!this.shape) {
      this.view = [];
      return;
    }
    const b = this.shape.viewBox;
    this.box = `${b.x} ${b.y} ${b.w} ${b.h}`;
    this.view = this.build(this.shape);
    this.aria = this.summary();
    if (this.pinned && !this.view.some((c) => c.id === this.pinned)) this.pinned = null;
  }

  get active(): HeatCellView | null {
    const id = this.pinned ?? this.hover;
    return id ? (this.view.find((c) => c.id === id) ?? null) : null;
  }

  // (the popover's spot: over the cell, as a share of the stage; below it near the top, and kept off the edges)
  tipAt(c: HeatCellView): { left: number; top: number; below: boolean; align: 'center' | 'start' | 'end' } {
    const b = this.shape!.viewBox;
    const left = ((c.shape.cx - b.x) / b.w) * 100;
    const top = ((c.shape.cy - b.y) / b.h) * 100;
    return { left, top, below: top < 38, align: left < 22 ? 'start' : left > 78 ? 'end' : 'center' };
  }

  tipColor(c: HeatCellView): string {
    return this.mode === 'volume' || c.thin || Math.abs(c.tone) < 0.04 ? 'rgba(255, 255, 255, 0.45)' : this.textOf(c.tone);
  }

  // (a number's color in its leaning: green or red; a lean's lavender or amber)
  private textOf(tone: number): string {
    return this.stat.scale === 'lean' ? leanText(tone) : toneText(tone);
  }

  // A tap (or Enter) opens a cell's popover and keeps it open; again shuts it
  pin(id: string): void {
    if (this.pinned === id) {
      this.pinned = null;
      this.hover = null;
    } else this.pinned = id;
  }

  // (a tap anywhere else shuts it)
  @HostListener('document:pointerdown', ['$event'])
  outside(event: PointerEvent): void {
    if (this.pinned && !this.host.nativeElement.contains(event.target as Node)) this.pinned = null;
  }

  @HostListener('keydown.escape')
  escape(): void {
    this.pinned = null;
    this.hover = null;
  }

  // (the legend's ends: which way is good for this row)
  get ends(): [string, string] {
    if (this.stat.scale === 'lean' && this.stat.ends) return this.stat.ends;
    if (this.overlay) return ['Tough spot', 'Edge'];
    return this.defense ? ['Leakier', 'Stingier'] : ['Worse', 'Better'];
  }

  get sequential(): boolean {
    return this.mode === 'volume' || this.stat.scale === 'sequential';
  }

  private build(surface: HeatSurface): HeatCellView[] {
    const byId = new Map(this.cells.map((c) => [c.id, c]));
    const against = new Map((this.overlay ?? []).map((c) => [c.id, c]));
    const total = this.cells.reduce((a, c) => a + c.n, 0);
    const most = Math.max(0, ...this.cells.map((c) => c.n));
    const top = Math.max(0, ...this.cells.filter((c) => !isThin(c, this.stat)).map((c) => c.value ?? 0));
    const { stat } = this;
    const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '–' : stat.format(v));
    return surface.cells.map((shape, i) => {
      const cell = byId.get(shape.id) ?? { id: shape.id, n: 0, value: null, league: null };
      const opp = this.overlay ? (against.get(shape.id) ?? { id: shape.id, n: 0, value: null, league: null }) : null;
      const eff = heatPaint(cell, { stat, mode: 'efficiency', defense: this.defense, opponent: opp, top });
      const vol = heatPaint(cell, { stat, mode: 'volume', most });
      const share = total ? `${Math.round((cell.n / total) * 100)}%` : '';
      const empty = !cell.n;
      const value = cell.label ?? fmt(cell.value);
      const lines: HeatCellView['tip']['lines'] = [];
      if (!empty) {
        const tone = cellTone(cell, stat, this.defense);
        lines.push({
          text: `${value} ${stat.per ?? stat.label}${cell.league !== null && stat.scale !== 'sequential' ? ` · league ${fmt(cell.league)}` : ''}`,
          color: eff.thin || stat.scale === 'sequential' ? undefined : this.textOf(stat.scale === 'lean' ? cellTone(cell, stat) : tone),
        });
        lines.push({ text: `${cell.made !== undefined ? `${cell.made} of ${cell.n}` : cell.n} ${stat.noun}${share ? ` · ${share} of the ${stat.noun}` : ''}` });
      } else lines.push({ text: `No ${stat.noun}` });
      if (opp) {
        // (the opponent's in the row's terms: a defense's allowed, softer the greener for an offense; an
        // offense's, weaker the greener for a defense)
        const who = this.overlayLabel ?? 'Opponent';
        const allowed = this.defense ? '' : ' allowed';
        lines.push({
          text: opp.n ? `${who}: ${fmt(opp.value)}${allowed}${opp.league !== null ? ` · league ${fmt(opp.league)}` : ''} (${opp.n} ${stat.noun})` : `${who}: none here`,
          color: opp.n && !isThin(opp, stat) ? toneText(cellTone(opp, stat, this.defense)) : undefined,
        });
      }
      for (const d of cell.detail ?? []) lines.push({ text: d });
      if (!empty && eff.thin) lines.push({ text: `Small sample: under ${stat.minN} ${stat.noun}${opp && isThin(opp, stat) && !isThin(cell, stat) ? ' against them' : ''}`, color: 'rgba(255, 255, 255, 0.5)' });
      return {
        id: shape.id,
        i,
        shape,
        eff: { fill: eff.fill, main: empty ? '' : value, sub: empty ? '' : opp?.n ? `vs ${fmt(opp.value)}` : cell.made !== undefined ? `${cell.made}/${cell.n}` : String(cell.n) },
        vol: { fill: vol.fill, main: empty ? '' : String(cell.n), sub: empty ? '' : share },
        thin: !empty && eff.thin,
        tone: eff.tone,
        tip: { title: shape.name, lines },
        aria: `${shape.name}: ${lines.map((l) => l.text).join('; ')}`,
      };
    });
  }

  // (the map in words: the stat, where it's best and worst against the league's, where most of it went)
  private summary(): string {
    const head = [this.label, this.shape?.aria].filter(Boolean).join('. ');
    const ranked = this.view.filter((c) => !c.thin && c.tone).sort((a, b) => b.tone - a.tone);
    const busiest = [...this.view].sort((a, b) => Number(b.vol.main || 0) - Number(a.vol.main || 0))[0];
    const name = (c: HeatCellView) => (c.shape.short ?? c.shape.name).toLowerCase();
    return [
      head,
      busiest?.vol.main ? `most ${name(busiest)} (${busiest.vol.sub})` : '',
      ranked[0] && ranked[0].tone > 0.05 ? `best against the league ${name(ranked[0])} (${ranked[0].eff.main})` : '',
      ranked.length > 1 && ranked[ranked.length - 1].tone < -0.05 ? `worst ${name(ranked[ranked.length - 1])} (${ranked[ranked.length - 1].eff.main})` : '',
    ]
      .filter(Boolean)
      .join('; ');
  }

  url(part: string): string {
    return `url(#${this.id}-${part})`;
  }

  rotate(p: { x: number; y: number; rotate?: number }): string | null {
    return p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : null;
  }
}
