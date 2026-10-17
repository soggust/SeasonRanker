// A player's name or face outside the rankings grid and the card (the Book's rows, the game modal's
// lines, the wallet's bets and tickets, the bet slip, the Algorithm's desk, a profile's bets): a link to his
// card (the owner's ask, 2026-10-17). His sport's own app, with a card host on the page (the rankings: the grid's
// PlayerCards, setCardOpener): the card opens in place. Anywhere else (another sport's player, or a page with no
// grid, the Book, the wallet): his sport's app in a new tab, by his name and, where the page knows it, his
// tab (card-link.ts CARD_NAME_PARAM: the app finds him by name, findLinkedCard), "/nfl/?name=Drake+Maye&pos=QB",
// a fighter's "/mma/?name=Joaquin+Buckley". No Angular here (tested under Node: tests/player-link.test.mjs);
// the <a playerLink> directive (player-link.directive.ts) renders it.
import { CARD_NAME_PARAM, CARD_PARAM } from './card-link';

export interface PlayerRef {
  // (his sport's site path: 'nfl', 'mma')
  sport: string;
  name: string | null | undefined;
  // (his tab, where the page knows it: 'QB', a fighter's division 'LW')
  pos?: string | null;
  // (his ESPN id, where the page has it: the app finds him by it first, a name shared by two aside)
  id?: string | number | null;
}

export interface PlayerLink {
  href: string;
  // (opened in place by the page's card host; else a new tab)
  inApp: boolean;
}

// His card's address in his sport's app, by name (and tab); none without a sport or a name
export function playerCardPath(ref: PlayerRef): string | null {
  if (!ref.sport || !ref.name) return null;
  const q = new URLSearchParams();
  q.set(CARD_NAME_PARAM, ref.name);
  if (ref.pos) q.set('pos', ref.pos.toUpperCase());
  if (ref.id != null && ref.id !== '') q.set(CARD_PARAM, String(ref.id));
  return `/${ref.sport}/?${q}`;
}

// here: the app the page runs in (SPORT.id) and whether a card host is on the page
export function playerLinkOf(ref: PlayerRef, here: { sport: string; host: boolean }): PlayerLink | null {
  const href = playerCardPath(ref);
  return href ? { href, inApp: here.host && ref.sport === here.sport } : null;
}

// A pick's words with the player's name at their head, split for the name's link: "Drake Maye Over 224.5
// Passing Yards" -> { name: 'Drake Maye', rest: ' Over 224.5 Passing Yards' }; a pick that doesn't lead with
// him (a side, a total, a parlay): null, the words as they are
export function pickName(pick: string | null | undefined, player: string | null | undefined): { name: string; rest: string } | null {
  if (!pick || !player || !pick.startsWith(player)) return null;
  const rest = pick.slice(player.length);
  return rest && /^[\w'.-]/.test(rest) ? null : { name: player, rest };
}

// The page's card host: the rankings' grid while it's on the page (skill-rankings.component.ts). It opens the
// card in place and says whether it found him (false: the link goes to his app's page instead)
export type CardOpener = (ref: { name: string; pos: string | null; id: string | null }) => boolean;
let opener: CardOpener | null = null;

// (set: the grid's; the function it hands back takes it away, the grid gone)
export function setCardOpener(fn: CardOpener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export const hasCardOpener = (): boolean => !!opener;

export function openCardInApp(ref: PlayerRef): boolean {
  return !!opener && !!ref.name && opener({ name: ref.name, pos: ref.pos ? ref.pos.toUpperCase() : null, id: ref.id != null && ref.id !== '' ? String(ref.id) : null });
}

// A bet's player (the wallet's bets and tickets, the slip's lines, a profile's bets, the game modal's Your
// Bets): a prop's, or a fight's fighter (a fight's moneyline pick is his name); a side or a total: none
export function betPlayer(b: { sport: string; market?: string | null; player?: string | null; pick?: string | null }): PlayerRef | null {
  if (b.market === 'prop' && b.player) return { sport: b.sport, name: b.player };
  if (b.sport === 'mma' && b.market === 'moneyline' && (b.player || b.pick)) return { sport: b.sport, name: b.player || b.pick };
  return null;
}
