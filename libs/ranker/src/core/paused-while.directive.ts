import { Directive, EmbeddedViewRef, Injector, Input, OnInit, TemplateRef, ViewContainerRef, afterNextRender, inject } from '@angular/core';

// A part of the page left as it is drawn while something covers it (*pausedWhile="covered"): its bindings
// aren't checked while it's covered, so a pass of change detection behind a dialog skips it (the grid's few
// thousand cells behind an open player card: every click and tab in the card was a pass over all of them).
// It's checked once more as it's covered (the pass that opens the dialog draws it as it was), and again as
// soon as it's uncovered, before anything is drawn: whatever changed meanwhile shows then. Events in it still
// run as before.
@Directive({ selector: '[pausedWhile]', standalone: false })
export class PausedWhileDirective implements OnInit {
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private view?: EmbeddedViewRef<unknown>;
  private paused = false;

  @Input({ required: true }) set pausedWhile(covered: boolean) {
    if (covered === this.paused) return;
    this.paused = covered;
    // (uncovered: back in this same pass, ahead of its own check)
    if (!covered) this.view?.reattach();
    // (covered: once this pass has drawn it)
    else afterNextRender(() => this.paused && this.view?.detach(), { injector: this.injector });
  }

  ngOnInit(): void {
    this.view = this.container.createEmbeddedView(this.template);
  }
}
