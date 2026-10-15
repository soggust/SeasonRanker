import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, OnChanges, inject } from '@angular/core';
import type { HeatCell, HeatCellShape, HeatMark, HeatMode, HeatShape, HeatStat, HeatSurface, HeatSurfaceId } from './heat-map.model';
import { heatSurface } from './surfaces';
import { cellTone, fadeFill, heatPaint, isThin, leanText, pickPair, toneText } from './heat-color';

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
  // (painted from last season: this season's under the sample, the row's own last season's enough)
  faded: boolean;
  tone: number;
  tip: { title: string; lines: { text: string; color?: string }[] };
  aria: string;
}

// <heat-map>: a surface (heat-map/surfaces: the NFL's field, its strip, the down & distance grid; later a rink,
// a half court...) with its cells painted by the stat: by efficiency against the league's in each cell
// (diverging, green the good side for the row; a defense's flipped), by volume by each cell's share of the sample
// (one hue). A cell short of the stat's sample is greyed. With overlay cells (an opponent's, the same ids) it's
// the matchup: the row's cells as an offense's, the overlay's as the defense's allowed, together. Its numbers in
// the cells (none on a compact one), a hover or a tap opens a cell's popover, and its key under it. With a
// fallback (the same row's last season, the same ids; the opponent's too, under an overlay) a cell under the
// sample this season shows last season's instead, faded and hatched over, the hover naming the season; once this
// season's sample is enough, this season's (heat-color.ts's pickCell).
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
  // (the row's last season behind its thin cells, and the opponent's behind the overlay's; which season that is,
  // "2025", and this one, "2026": the key's note and the hover's)
  @Input() fallback: HeatCell[] | null = null;
  @Input() overlayFallback: HeatCell[] | null = null;
  @Input() fallbackLabel: string | null = null;
  @Input() seasonLabel: string | null = null;
  // (the key's note when what's behind isn't a last season: "Faded: his career")
  @Input() fallbackNote: string | null = null;
  // (the row's own pieces over the cells, his home park's wall; his marks over those, his home runs; and the
  // key's word for a mark, "Home run")
  @Input() layers: HeatShape[] | null = null;
  @Input() marks: HeatMark[] | null = null;
  @Input() markKey: string | null = null;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly id = `hm${next++}`;

  shape: HeatSurface | null = null;
  box = '';
  view: HeatCellView[] = [];
  aria = '';
  // (any cell from last season: the key's note)
  faded = false;
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
    this.faded = this.mode !== 'volume' && this.view.some((c) => c.faded);
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

  // (the key's note, in full on a hover)
  get fadeTitle(): string {
    const last = this.fallbackLabel ? `${this.fallbackLabel}'s` : "last season's";
    // (something other than a last season behind it: "under 10 attempts in his last 5 shows his career's")
    if (this.fallbackNote) return `A cell under ${this.stat.minN} ${this.stat.noun}${this.seasonLabel ? ` (${this.seasonLabel})` : ''} shows ${last} instead, faded`;
    return `A cell under ${this.stat.minN} ${this.stat.noun} this season shows ${last} instead, faded, till this season has enough`;
  }

  // (the key's note: whose cells are faded in)
  get fadeKey(): string {
    return this.fallbackNote ?? `Faded: last season${this.fallbackLabel ? ` (${this.fallbackLabel})` : ''}`;
  }

  // (what Volume counts: the stat's count when a cell's isn't its sample, "strikes landed"; else the sample)
  get countNoun(): string {
    return this.stat.countNoun ?? this.stat.noun;
  }

  // (the legend's ends: which way is good for this row; a lean's, or a stat's own, "Into damage", "Away from it")
  get ends(): [string, string] {
    if (this.stat.ends && (this.stat.scale === 'lean' || !this.overlay)) return this.stat.ends;
    if (this.overlay) return ['Tough spot', 'Edge'];
    return this.defense ? ['Leakier', 'Stingier'] : ['Worse', 'Better'];
  }

  // (the key's words after its good end: "than the league", or the stat's own ("than expected", "than
  // average"); none on a matchup)
  get endsVs(): string {
    if (this.overlay) return '';
    const vs = this.stat.vs === undefined ? 'league' : this.stat.vs;
    return vs === 'league' ? ' than the league' : vs ? ` than ${vs}` : '';
  }

  get sequential(): boolean {
    return this.mode === 'volume' || this.stat.scale === 'sequential';
  }

  private build(surface: HeatSurface): HeatCellView[] {
    const byId = new Map(this.cells.map((c) => [c.id, c]));
    const against = new Map((this.overlay ?? []).map((c) => [c.id, c]));
    const mine = new Map((this.fallback ?? []).map((c) => [c.id, c]));
    const theirs = new Map((this.overlayFallback ?? []).map((c) => [c.id, c]));
    const total = this.cells.reduce((a, c) => a + c.n, 0);
    // (what Volume counts: a cell's count, its sample when it has none)
    const count = (c: HeatCell) => c.count ?? c.n;
    const counted = this.cells.reduce((a, c) => a + count(c), 0);
    const most = Math.max(0, ...this.cells.map(count));
    const topOf = (list: HeatCell[]) => Math.max(0, ...list.filter((c) => !isThin(c, this.stat)).map((c) => c.value ?? 0));
    const top = topOf(this.cells);
    const lastTop = topOf(this.fallback ?? []);
    const { stat } = this;
    const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '–' : stat.format(v));
    const last = this.fallbackLabel ?? 'Last season';
    const now = this.seasonLabel ?? 'This season';
    const none = (id: string): HeatCell => ({ id, n: 0, value: null, league: null });
    // (what a value reads against: the league's, by default)
    const vs = stat.vs === undefined ? 'league' : stat.vs;
    return surface.cells.map((shape, i) => {
      const cell = byId.get(shape.id) ?? none(shape.id);
      const opp = this.overlay ? (against.get(shape.id) ?? none(shape.id)) : null;
      // (this season's, or the row's own last season's where this one's is thin: the paint, the numbers, the hover)
      const pick = pickPair(cell, mine.get(shape.id), stat, opp, theirs.get(shape.id));
      const faded = pick.faded;
      const shown = faded ? pick.own.cell : cell;
      const shownOpp = faded ? (pick.opp?.cell ?? null) : opp;
      const paint = heatPaint(shown, { stat, mode: 'efficiency', defense: this.defense, opponent: shownOpp, top: pick.own.faded && faded ? lastTop : top });
      const eff = faded ? { ...paint, fill: fadeFill(paint.fill) } : paint;
      const vol = heatPaint(cell, { stat, mode: 'volume', most });
      const share = total ? `${Math.round((cell.n / total) * 100)}%` : '';
      const volume = count(cell);
      const volumeShare = counted ? `${Math.round((volume / counted) * 100)}%` : '';
      const empty = !cell.n && !faded;
      const value = shown.label ?? fmt(shown.value);
      const ownLast = faded && pick.own.faded;
      const lines: HeatCellView['tip']['lines'] = [];
      if (!shown.n) lines.push({ text: `No ${stat.noun}` });
      else {
        const tone = cellTone(shown, stat, this.defense);
        lines.push({
          text: `${ownLast ? `${last}: ` : ''}${value} ${stat.per ?? stat.label}${shown.league !== null && stat.scale !== 'sequential' && vs !== null ? ` · ${vs} ${fmt(shown.league)}` : ''}`,
          color: eff.thin || stat.scale === 'sequential' ? undefined : this.textOf(stat.scale === 'lean' ? cellTone(shown, stat) : tone),
        });
        const count = `${shown.made !== undefined ? `${shown.made} of ${shown.n}` : shown.n} ${stat.noun}`;
        lines.push({ text: ownLast ? `${count} in ${last}` : `${count}${share ? ` · ${share} of the ${stat.noun}` : ''}` });
      }
      if (shownOpp) {
        // (the opponent's in the row's terms: a defense's allowed, softer the greener for an offense; an
        // offense's, weaker the greener for a defense)
        const who = `${this.overlayLabel ?? 'Opponent'}${faded && pick.opp?.faded ? ` (${last})` : ''}`;
        const allowed = this.defense ? '' : ' allowed';
        lines.push({
          text: shownOpp.n ? `${who}: ${fmt(shownOpp.value)}${allowed}${shownOpp.league !== null ? ` · league ${fmt(shownOpp.league)}` : ''} (${shownOpp.n} ${stat.noun})` : `${who}: none here`,
          color: shownOpp.n && !isThin(shownOpp, stat) ? toneText(cellTone(shownOpp, stat, this.defense)) : undefined,
        });
      }
      for (const d of shown.detail ?? []) lines.push({ text: d });
      if (faded) {
        // (this season's so far, under the sample: the side drawn from last season)
        const so = ownLast ? cell : opp!;
        const whose = ownLast ? '' : `${this.overlayLabel ?? 'Opponent'}, `;
        const sofar = so.n ? `${so.label ?? fmt(so.value)} on ${so.n} ${stat.noun}` : `no ${stat.noun} yet`;
        lines.push({ text: `${whose}${now}: ${sofar} (under ${stat.minN})`, color: 'rgba(255, 255, 255, 0.5)' });
      } else if (!empty && eff.thin) lines.push({ text: `Small sample: under ${stat.minN} ${stat.noun}${opp && isThin(opp, stat) && !isThin(cell, stat) ? ' against them' : ''}`, color: 'rgba(255, 255, 255, 0.5)' });
      return {
        id: shape.id,
        i,
        shape,
        eff: {
          fill: eff.fill,
          main: empty ? '' : value,
          // (a faded cell's small number its season: whose it is, at a glance)
          sub: empty ? '' : faded ? last : shownOpp?.n ? `vs ${fmt(shownOpp.value)}` : shown.sub !== undefined ? shown.sub : shown.made !== undefined ? `${shown.made}/${shown.n}` : this.shape?.text?.noun ? `${shown.n} ${stat.noun}` : String(shown.n),
        },
        vol: { fill: vol.fill, main: volume ? String(volume) : '', sub: volume ? volumeShare : '' },
        thin: !empty && eff.thin,
        faded,
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
