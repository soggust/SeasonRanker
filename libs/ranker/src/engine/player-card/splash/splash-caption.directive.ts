// The caption on a shelf's edge is a brass band with room for two lines (one under a coach's honors). When its
// words don't fit, the band drops its parts from the end before it shortens a name: "Christian McCaffrey · RB ·
// No. 23" loses "No. 23" first, then "RB", and only a name too long for the band on its own is cut with the
// ellipsis (never an ellipsis inside a name when dropping a part would have fit). The parts are the template's
// .sp-cap-p spans; the first line (the name, the result) is never dropped. Fitted when drawn, when the fonts
// land, when the words change and when the stall or shelf under it is resized.
import { AfterViewChecked, AfterViewInit, Directive, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';

@Directive({ selector: '[spCapFit]', standalone: true })
export class SplashCaptionFit implements AfterViewInit, AfterViewChecked, OnChanges, OnDestroy {
  @Input('spCapFit') lines: string[] | undefined;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private ro?: ResizeObserver;
  private dirty = false;
  private started = false;

  ngOnChanges(): void {
    this.dirty = true;
  }

  ngAfterViewInit(): void {
    this.started = true;
    this.fit();
    if (typeof ResizeObserver !== 'undefined' && this.el.parentElement) {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(this.el.parentElement);
    }
    (document as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.then(() => this.fit()).catch(() => {});
  }

  ngAfterViewChecked(): void {
    if (this.dirty && this.started) this.fit();
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  // Everything shown, then the parts hidden from the end while the words overflow the band's lines
  private fit(): void {
    this.dirty = false;
    const span = this.el.firstElementChild as HTMLElement | null;
    if (!span) return;
    const parts = Array.from(this.el.querySelectorAll<HTMLElement>('.sp-cap-p'));
    for (const p of parts) p.hidden = false;
    for (let i = parts.length - 1; i >= 0 && span.scrollHeight > span.clientHeight + 1; i--) parts[i].hidden = true;
  }
}
