// The US sportsbooks the Book shops for the best price (the owner, 2026-10-20): their short codes (board.json's pb,
// a user's bet's book) and names, a copy of libs/ranker/scripts/model/best-price.mjs BOOK_NAMES. The hover on a
// price says the book whose price it is ("Best price: FanDuel"); a price the board didn't shop (no pb: the free
// board's) is the home book's, no "best" claimed
export const BOOK_NAMES: Record<string, string> = {
  dk: 'DraftKings',
  fd: 'FanDuel',
  mgm: 'BetMGM',
  czr: 'Caesars',
  espn: 'ESPN Bet',
  fan: 'Fanatics',
  br: 'BetRivers',
  hr: 'Hard Rock Bet',
  bly: 'Bally Bet',
};
// (the home book's code: an unshopped price's, and a bet's where its book isn't known)
export const HOME_BOOK = 'dk';

// (a code's name; none for a code the site doesn't know)
export const bookName = (code: string | null | undefined): string | null => (code && BOOK_NAMES[code]) || null;

// (a name's code, a Bot's bet's book as picks.json names it: 'FanDuel' is 'fd'; none for a name not listed)
export function bookCode(name: string | null | undefined): string | null {
  if (!name) return null;
  if (BOOK_NAMES[name]) return name;
  const low = name.toLowerCase();
  return Object.keys(BOOK_NAMES).find((k) => BOOK_NAMES[k].toLowerCase() === low) ?? null;
}

// (a price's hover: "Best price: FanDuel" where the board shopped it (its pb, a known code), else none)
export function bestPriceTitle(code: string | null | undefined): string {
  const name = bookName(code);
  // (no shopped price: no claim, no book named (D26))
  return name ? `Best price: ${name}` : '';
}

// (an existing hover with the book's line under it; none before, the book's alone)
export const withBookTitle = (title: string | null | undefined, code: string | null | undefined): string =>
  title && bestPriceTitle(code) ? `${title}\n${bestPriceTitle(code)}` : title || bestPriceTitle(code);

// (American prices compared by what they pay: strictly better)
const decimal = (o: number) => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
export const pricier = (a: number, b: number): boolean => decimal(a) > decimal(b) + 1e-9;
