// A card's link and a game's (the Share buttons in their headers): the page's own link (the tab, the season and
// part, the list's sliders when they've changed: share.ts) with the card or the game on top, always on the
// live site's address (clipboard.ts BASE_URL, so one copied from a local server still works when pasted).
//   ?pos=QB&season=2025&card=00-0033873&name=Patrick+Mahomes&cardTab=gamelog
//   ?pos=QB&game=401671789&gameTab=box
// card: the row's id as its tab keys it (gsisId: the NFL's GSIS id, a team's, a coach's, a fighter's); the
// Algorithm's older links (?card=<ESPN id>&name=, no pos) are still read, by ESPN id then by name. name: who
// it was (the fallback when the id isn't found, and readable in the link). The tabs read by the words below,
// or by their own ids.
import { BASE_URL } from '@ranker/core/clipboard';
import type { CardTab } from './player-card/card.model';
import type { GameTab } from './game-view/game-view.service';

export const CARD_PARAM = 'card';
export const CARD_NAME_PARAM = 'name';
export const CARD_TAB_PARAM = 'cardTab';
export const GAME_PARAM = 'game';
export const GAME_TAB_PARAM = 'gameTab';

// A card tab's word in a link (the card's own words for them: Team, Game Log, Career)
const CARD_TABS: Record<CardTab, string> = {
  overview: 'overview',
  analysis: 'analysis',
  depth: 'team',
  stats: 'stats',
  zones: 'zones',
  heatmaps: 'heatmaps',
  games: 'gamelog',
  seasons: 'career',
  history: 'history',
};

const GAME_TABS: Record<GameTab, string> = {
  summary: 'summary',
  box: 'box',
  plays: 'plays',
  chart: 'chart',
  pitches: 'pitches',
  fantasy: 'fantasy',
  highlights: 'highlights',
  info: 'info',
  preview: 'preview',
  injuries: 'injuries',
};

const word = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function tabOf<T extends string>(tabs: Record<T, string>, text: string | null): T | null {
  if (!text) return null;
  const key = word(text);
  const hit = (Object.entries(tabs) as [T, string][]).find(([id, slug]) => slug === key || word(id) === key);
  return hit ? hit[0] : null;
}

export const cardTabOf = (text: string | null): CardTab | null => tabOf(CARD_TABS, text);
export const gameTabOf = (text: string | null): GameTab | null => tabOf(GAME_TABS, text);

// The live site's address for a page link (its path and query kept; a local server's swapped out)
function onSite(page: string): URL {
  const url = new URL(page);
  const site = new URL(url.pathname + url.search, BASE_URL);
  site.hash = '';
  return site;
}

// (one link at a time: a card's link carries no game, a game's no card)
function clear(url: URL): void {
  for (const param of [CARD_PARAM, CARD_NAME_PARAM, CARD_TAB_PARAM, GAME_PARAM, GAME_TAB_PARAM]) url.searchParams.delete(param);
}

export interface CardLink {
  // the tab the link opens the grid on (a Top 50 card's: the Top 50; else the card's own)
  position: string;
  season: number;
  id: string;
  name: string;
  tab: CardTab;
}

// page: the list's own link (PositionService.shareLink); currentSeason: the season a link leaves out
export function cardLink(page: string, link: CardLink, currentSeason: number): string {
  const url = onSite(page);
  clear(url);
  url.searchParams.set('pos', link.position);
  if (link.season === currentSeason) url.searchParams.delete('season');
  else url.searchParams.set('season', String(link.season));
  url.searchParams.set(CARD_PARAM, link.id);
  if (link.name) url.searchParams.set(CARD_NAME_PARAM, link.name);
  if (link.tab !== 'overview') url.searchParams.set(CARD_TAB_PARAM, CARD_TABS[link.tab]);
  return url.toString();
}

export function gameLink(page: string, event: string, tab: GameTab | null): string {
  const url = onSite(page);
  clear(url);
  url.searchParams.set(GAME_PARAM, event);
  if (tab) url.searchParams.set(GAME_TAB_PARAM, GAME_TABS[tab]);
  return url.toString();
}

// What a card's link asked for, read off the address
export interface CardAsk {
  pos: string | null;
  id: string | null;
  name: string | null;
  tab: CardTab | null;
  season: string | null;
}

export function readCardAsk(url: URL): CardAsk | null {
  const id = url.searchParams.get(CARD_PARAM);
  const name = url.searchParams.get(CARD_NAME_PARAM);
  if (!id && !name) return null;
  return {
    pos: url.searchParams.get('pos')?.toUpperCase() ?? null,
    id,
    name,
    tab: cardTabOf(url.searchParams.get(CARD_TAB_PARAM)),
    season: url.searchParams.get('season'),
  };
}

// A card a link found: the grid's tab (grid), the card's own (position) and the row there
export interface LinkedCard {
  grid: string;
  position: string;
  gsisId: string;
  tab: CardTab | null;
}

interface Row {
  gsisId: string;
  id?: number | string | null;
  name: string;
}

// The row a card's link names, in the season's rows: by its id on the link's tab; then (an older link, or a
// row whose id has changed) by ESPN id, then by name, on the link's tab first, then each player tab. A pooled
// tab's row (the Top 50) is the card of his own tab (home), the grid on the pooled tab. A link with a tab
// and an id found on neither (a season he's unranked in): that tab and id, for the card to look further.
// Null: nobody to look for.
export function findLinkedCard(
  ask: CardAsk,
  rows: Record<string, Row[] | undefined>,
  tabs: { all: string[]; players: string[]; pooled: (tab: string) => boolean; home: (row: Row, tab: string) => string },
): LinkedCard | null {
  const pos = ask.pos && tabs.all.includes(ask.pos) ? ask.pos : null;
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const found = (grid: string, row: Row): LinkedCard => {
    const pooled = tabs.pooled(grid);
    return { grid, position: pooled ? tabs.home(row, grid) : grid, gsisId: row.gsisId, tab: ask.tab };
  };
  if (pos && ask.id) {
    const row = rows[pos]?.find((p) => p.gsisId === ask.id);
    if (row) return found(pos, row);
  }
  const order = [...(pos ? [pos] : []), ...tabs.players.filter((tab) => tab !== pos)];
  const matches = [(p: Row) => !!ask.id && p.id != null && String(p.id) === ask.id, (p: Row) => !!ask.name && key(p.name) === key(ask.name)];
  for (const match of matches) {
    for (const tab of order) {
      const row = rows[tab]?.find(match);
      if (row) return found(tab, row);
    }
  }
  if (pos && ask.id && !tabs.pooled(pos)) return { grid: pos, position: pos, gsisId: ask.id, tab: ask.tab };
  return null;
}

// What a game's link asked for
export function readGameAsk(url: URL): { event: string; tab: GameTab | null } | null {
  const event = url.searchParams.get(GAME_PARAM);
  if (!event || !/^[\w-]+$/.test(event)) return null;
  return { event, tab: gameTabOf(url.searchParams.get(GAME_TAB_PARAM)) };
}

// The params taken out of the address once read (closing the card or the game leaves no stale link)
export function clearCardParams(url: URL): void {
  for (const param of [CARD_PARAM, CARD_NAME_PARAM, CARD_TAB_PARAM]) url.searchParams.delete(param);
}

export function clearGameParams(url: URL): void {
  for (const param of [GAME_PARAM, GAME_TAB_PARAM]) url.searchParams.delete(param);
}
