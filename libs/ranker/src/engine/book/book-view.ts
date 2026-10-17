// The Book's view (Place Bets; Live, the day's games as they're played; Open Bets, the user's bets not yet
// settled; Closed Bets, those settled; or the Algorithm desk: an admin's): Place Bets unless the user chose
// another in this visit (kept for the page's life, not stored); a link that means the bets (the wallet's Place
// bets) sets it back to Place Bets first.
export type BetsView = 'bets' | 'live' | 'open' | 'closed' | 'desk';

let chosen: BetsView = 'bets';

export function betsView(): BetsView {
  return chosen;
}

export function chooseBetsView(view: BetsView): void {
  chosen = view;
}
