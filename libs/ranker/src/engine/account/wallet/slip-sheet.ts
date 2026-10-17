// The phone's ticket sheet (bet-slip.component.ts): under the docking width the ticket is a sheet along the bottom
// of the screen while it's open and a stub while it's minimized, and a tap outside the open sheet minimizes it,
// as the sheet's own chevron does. No Angular, no DOM types: the component's pointerdown handler asks here with
// the event's target, so the rule is tested with fake events (tests/bet-slip-sheet.test.mjs).

// (the width the ticket docks from: _variables.scss $bp-wide-menu; under it the ticket is the sheet)
export const SHEET_BELOW = 1000;

// What a tap lands on without minimizing the sheet: the sheet itself, the stub (its Expand opens the sheet), a
// price on the board (book-page's .bet-price, game-lines' .tile-price: the click adds the bet and keeps the sheet
// open, as wallet.toggle has always done) and the login dialog it may have opened
export const KEEPS_SHEET = '.ticket, .ticket-stub, .bet-price, .tile-price, .login-panel';

// (the piece of an event target the rule reads: an element's closest)
export type Tapped = { closest?: (selector: string) => unknown } | null;

// True when a pointerdown on the document should minimize the sheet: the sheet open on a phone width, the tap on
// none of KEEPS_SHEET. A target that isn't an element (the document itself) counts as outside.
export function tapMinimizes(target: Tapped, open: boolean, width: number): boolean {
  if (!open || width >= SHEET_BELOW) return false;
  if (!target || typeof target.closest !== 'function') return true;
  return !target.closest(KEEPS_SHEET);
}
