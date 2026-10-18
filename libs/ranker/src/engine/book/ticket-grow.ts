// The Book's ticket growing over the recent form on a wide screen: as the first bet lands the ticket goes from its
// empty size under the form to the column's full height (the page's has-ticket class, book-page.scss), and back as
// it empties. The class flips the layout at once; this plays the change out (a FLIP): the ticket's host measured
// before the class lands (measure) and after (grow), then sized from the one to the other, its top edge rising (or
// falling) and its height growing (or shrinking) in 280ms on the site's ease-out, the ticket filling its host while
// it does (wallet-slip.scss :host(.sizing)), the column still (.book-side.sizing). The form fades under it on its
// own CSS transition. Phones (the stub and its sheet) and reduced motion: the change at once, nothing played.
// No Angular here
export const TICKET_GROW_MS = 280;
export const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// (the docking width: variables.scss $bp-wide-menu)
const WIDE = '(min-width: 1000px)';

export interface TicketBox {
  top: number;
  height: number;
}

// The keyframes from the one box to the other: the host's top edge moved back to where it was and its height
// held at what it was, to where they are now (flex-basis: the host is a flex item of the column in both states)
export function growFrames(from: TicketBox, to: TicketBox): Keyframe[] {
  const dy = Math.round((from.top - to.top) * 10) / 10;
  return [
    { transform: `translateY(${dy}px)`, flexGrow: 0, flexShrink: 0, flexBasis: `${from.height}px` },
    { transform: 'none', flexGrow: 0, flexShrink: 0, flexBasis: `${to.height}px` },
  ];
}

// (whether to play it: a wide screen, motion not turned down, and a box that moved or changed size)
export function shouldGrow(from: TicketBox | null, to: TicketBox, wide: boolean, reduced: boolean): boolean {
  if (!from || !wide || reduced) return false;
  return Math.abs(from.top - to.top) > 1 || Math.abs(from.height - to.height) > 1;
}

export class TicketGrow {
  private playing: Animation | null = null;
  private from: TicketBox | null = null;

  // (before the layout flips: where the ticket is now, mid-grow included (the box as drawn), the last one stopped)
  measure(side: HTMLElement | undefined): void {
    const host = side?.querySelector<HTMLElement>('bet-slip');
    this.from = host ? box(host) : null;
    this.stop(side);
  }

  // (after it has: play it from there to here)
  grow(side: HTMLElement | undefined): void {
    const host = side?.querySelector<HTMLElement>('bet-slip');
    const from = this.from;
    this.from = null;
    if (!side || !host || typeof host.animate !== 'function') return;
    const to = box(host);
    if (!shouldGrow(from, to, matchMedia(WIDE).matches, matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    side.classList.add('sizing');
    host.classList.add('sizing');
    const run = host.animate(growFrames(from!, to), { duration: TICKET_GROW_MS, easing: EASE_OUT });
    this.playing = run;
    const done = () => {
      if (this.playing !== run) return;
      this.playing = null;
      side.classList.remove('sizing');
      host.classList.remove('sizing');
    };
    run.onfinish = done;
    run.oncancel = done;
  }

  stop(side: HTMLElement | undefined): void {
    const run = this.playing;
    if (!run) return;
    this.playing = null;
    run.cancel();
    side?.classList.remove('sizing');
    side?.querySelector('bet-slip')?.classList.remove('sizing');
  }
}

const box = (el: HTMLElement): TicketBox => {
  const r = el.getBoundingClientRect();
  return { top: r.top, height: r.height };
};
