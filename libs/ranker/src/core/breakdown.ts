// The breakdown popovers' shared workings: the grid's rank tile (rank-why.ts) and support grades
// (grade-why.ts), and the Book's rank tile (bet-why.ts). Each is a scoreboard panel hung from what was
// clicked: a total on top, its parts as lines below (a bar, a label and value, what it adds), a footnote.
// Their look is one set of styles (styles/_breakdown.scss); this is how they open, sit and close.

// Where a popover sits: under its anchor, or over it when there's more room above (top null: bottom set),
// inside the screen's edges, no taller than the room it has (its list of parts scrolls)
export interface PopoverAt {
  top: number | null;
  bottom: number | null;
  left: number;
  room: number;
}

// (tallest: the room below that's always enough to hang it under; width: the panel's, 340)
export function popoverAt(anchor: Element, tallest = 560, width = 340): PopoverAt {
  const rect = anchor.getBoundingClientRect();
  const below = innerHeight - rect.bottom;
  const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
  return below >= tallest || below >= rect.top
    ? { top: rect.bottom + 6, bottom: null, left, room: below - 14 }
    : { top: null, bottom: innerHeight - rect.top + 6, left, room: rect.top - 14 };
}

// Phones: a sheet along the bottom of the screen instead (the styles' down(phone), 575px)
export const phoneSheet = (): boolean => typeof matchMedia === 'function' && matchMedia('(max-width: 575px)').matches;

// A part's amount, signed ("+0.12", "−0.08"; to three places when it's under a hundredth)
export function signedAmount(amount: number): string {
  const digits = Math.abs(amount) < 0.01 && amount !== 0 ? 3 : 2;
  const text = Math.abs(amount).toFixed(digits);
  return Number(text) === 0 ? text : `${amount < 0 ? '−' : '+'}${text}`;
}

// Each part's bar: its length against the largest's (the largest the full width)
export function barWidths<T extends { amount: number }>(parts: T[]): (T & { width: number })[] {
  const largest = Math.max(0, ...parts.map((p) => Math.abs(p.amount)));
  return parts.map((p) => ({ ...p, width: largest ? (Math.abs(p.amount) / largest) * 100 : 0 }));
}

// One popover's state: what's open (with where it sits), and the control that opened it, which gets the
// focus back when it closes from the keyboard. The page wires its own clicks off it, Escape and resizes to
// close(), since what counts as "off it" is the page's.
export class Breakdown<T extends { id: string | number }> {
  shown: (T & { at: PopoverAt; sheet: boolean }) | null = null;
  private anchor: HTMLElement | null = null;

  // (panel: the open popover's element, focused once it's drawn so Escape and a screen reader start there)
  constructor(
    private panel: () => HTMLElement | undefined,
    private tallest = 560,
  ) {}

  isOpen(id: string | number): boolean {
    return this.shown?.id === id;
  }

  open(data: T, anchor: HTMLElement): void {
    this.shown = { ...data, at: popoverAt(anchor, this.tallest), sheet: phoneSheet() };
    this.anchor = anchor;
    setTimeout(() => this.panel()?.focus({ preventScroll: true }));
  }

  // (false: nothing was open)
  close(refocus = false): boolean {
    if (!this.shown) return false;
    this.shown = null;
    if (refocus) this.anchor?.focus({ preventScroll: true });
    this.anchor = null;
    return true;
  }
}
