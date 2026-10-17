import { Component, DestroyRef, ElementRef, HostListener, NgZone, ViewChild, inject } from '@angular/core';
import { quietListener } from '@ranker/core/quiet-listener';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PositionService } from '@ranker/engine/position.service';
import { POSITIONS, Position } from '@sport/positions';
import { SPORT } from '@sport/sport';
import { SITE_SPORTS } from '@ranker/core/sports';
import { SportSettings } from '@ranker/engine/sport';
import { AccountService } from '@ranker/engine/account/account.service';
import { canUse } from '@ranker/engine/account/features';
import { forwardOldLink, goTo, pageHash, readPagePath, rememberSport } from '@ranker/engine/page-url';
import { BarCell, barCells, familyOf, familyOpensTo, litTab, selectGroups, subTabs } from '@ranker/engine/tab-families';

// The page showing, by its hash (page-url.ts reads it off the page's own address, /wallet, /u/<username>):
// the rankings (no hash), the Book (#book), or an account page (#account, #lists, #community, #tracker,
// #wallet, #friends, #u/<username>: a public profile), or the site's Privacy Policy (#privacy) and Data
// deletion (#data-deletion) pages, open to anyone
export type View =
  | 'rankings'
  | 'book'
  | 'account'
  | 'lists'
  | 'community'
  | 'tracker'
  | 'wallet'
  | 'friends'
  | 'user'
  | 'privacy'
  | 'data-deletion';
const HASH_VIEWS: Record<string, View> = {
  book: 'book',
  account: 'account',
  lists: 'lists',
  community: 'community',
  tracker: 'tracker',
  wallet: 'wallet',
  friends: 'friends',
  privacy: 'privacy',
  'data-deletion': 'data-deletion',
};

// (#u/<username>: a profile; #lists/<uid>/<id>: one saved list; #community/<tab>/<season>: a board;
// #tracker/<uid>: someone's tracker, read only)
export function viewOf(hash: string): View {
  const key = hash.replace(/^#/, '');
  if (key.startsWith('u/') && key.length > 2) return 'user';
  if (key.startsWith('lists/')) return 'lists';
  if (key.startsWith('community/')) return 'community';
  if (key.startsWith('tracker/') && key.length > 8) return 'tracker';
  // #account/privacy, Settings with Privacy open
  if (key === 'account/privacy') return 'account';
  return Object.hasOwn(HASH_VIEWS, key) ? HASH_VIEWS[key] : 'rankings';
}

// (#u/<username>: the name; '' on any other page)
function userOf(hash: string): string {
  if (viewOf(hash) !== 'user') return '';
  try {
    return decodeURIComponent(hash.slice('#u/'.length));
  } catch {
    return hash.slice('#u/'.length);
  }
}

// (each page's name, for the page heading and the tab)
const VIEW_TITLES: Record<Exclude<View, 'rankings'>, string> = {
  book: 'Book',
  account: 'Settings',
  lists: 'My Lists',
  community: 'Community',
  tracker: 'Track Players',
  wallet: 'Betting Wallet',
  friends: 'Friends',
  user: 'Profile',
  privacy: 'Privacy Policy',
  'data-deletion': 'Data Deletion',
};

// The tabs the sport's settings show (SPORT.tabVisible: MMA's divisions, men's or women's)
function visibleTabs(settings: SportSettings): Position[] {
  return POSITIONS.filter((tab) => SPORT.tabVisible?.(tab, settings) ?? true);
}

// The page: the sport bar, the filter menu, the position tabs and the rankings, and About when it's open
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['../styles/components/app.component.scss'],
  standalone: false,
})
export class AppComponent {
  // The sport bar across the top: each sport is its own app on the same site (apps/<sport>, served at
  // /<sport>/); this one is lit
  readonly sport = SPORT.id;
  // (?gallery=1: the splash art's gallery in place of the page, for checking it)
  readonly gallery = typeof location !== 'undefined' && /[?&]gallery=/.test(location.search);
  readonly siteSports = SITE_SPORTS;
  // (the page's name, for its heading: "NFL")
  readonly sportName = SITE_SPORTS.find((s) => s.id === SPORT.id)?.label ?? SPORT.id.toUpperCase();

  // The page in place of the rankings: the Book (/book, from the sport bar's Book link) or an account
  // page (the account menu's). (An old link, /nfl/#wallet, gets the page's own address, /wallet, first.)
  view: View = viewOf((forwardOldLink(), pageHash()));
  readonly canUse = canUse;

  // A link to one of the pages this app shows (href="/lists", "/book", "/u/name", or an old "#lists"): the
  // address changes with no reload, which would lose the grid's tab and season and the app's state. A page of
  // another sport's (/community/mlb) loads that sport's app. (Listened for in the constructor: quietListener)
  onPageLink(event: MouseEvent): void {
    const hash = this.pageLinkHash(event);
    if (hash === null) return;
    event.preventDefault();
    goTo(hash);
  }

  // (the page a click on a link goes to, by its hash; null: not one of this app's pages, the browser's to follow)
  private pageLinkHash(event: MouseEvent): string | null {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return null;
    const href = link.getAttribute('href')!;
    let hash: string | null = null;
    // (a bare # is the rankings; any other hash not a page's (#rankings, the skip link) is the page's own anchor)
    if (href.startsWith('#')) hash = href === '#' || viewOf(href) !== 'rankings' ? href : null;
    else {
      const url = new URL(link.href);
      const page = url.origin === location.origin ? readPagePath(url.pathname) : null;
      if (page && (!page.sport || page.sport === SPORT.id)) hash = page.hash;
    }
    return hash;
  }

  // (back and forward between the pages: pushState's entries, which no hashchange announces)
  @HostListener('window:popstate')
  onPopState(): void {
    if (!location.hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  @HostListener('window:hashchange')
  onHashChange(): void {
    forwardOldLink();
    const before = this.view + this.viewUser;
    this.view = viewOf(pageHash());
    this.viewUser = userOf(pageHash());
    this.markBookView();
    // (another page on the sheet: its top, not the last page's scroll)
    if (this.view + this.viewUser !== before && this.sheetBody) this.sheetBody.nativeElement.scrollTop = 0;
  }

  // (the Book's gold light over the whole app, the sport bar and the menus too: _base.scss's book-view; the
  // account menu in the app's sand only over the sheet's pages: sheet-view)
  private markBookView(): void {
    document.documentElement.classList.toggle('book-view', this.view === 'book');
    document.documentElement.classList.toggle('sheet-view', this.onSheet);
    // (the browser tab: the sport's own on its rankings (index.html's, "Season Ranker | NFL"), "Season Ranker |
    // Book" on the Book, and plain "Season Ranker" on the pages every sport shares)
    document.title = this.view === 'rankings' ? this.sportTitle : this.view === 'book' ? 'Season Ranker | Book' : 'Season Ranker';
    // (the rankings open: the sport a page's way back returns to)
    if (this.view === 'rankings') rememberSport();
  }
  // (the sport's tab title, as index.html set it before any page changed it)
  private readonly sportTitle = document.title;

  // Every page but the rankings and the Book sits on the app's sheet (its scroll container)
  get onSheet(): boolean {
    return this.view !== 'rankings' && this.view !== 'book';
  }
  // (the pages with tables and boards get the grid's width; the rest a reading width, the backdrop around it)
  get wideSheet(): boolean {
    return this.view === 'lists' || this.view === 'community' || this.view === 'tracker' || this.view === 'wallet';
  }
  @ViewChild('sheetBody') private sheetBody?: ElementRef<HTMLElement>;

  get viewTitle(): string {
    return this.view === 'rankings' ? this.sportName + ' Season Ranker' : VIEW_TITLES[this.view];
  }

  // (#u/<username>: whose profile; set with the view, so a change of page never hands the profile another
  // page's hash for a name)
  viewUser = userOf(pageHash());

  // The sport bar's sports: a sport not ready for everyone (MMA) only in development or for an admin
  get sports(): { id: string; label: string }[] {
    return this.siteSports.filter((s) => !s.devOnly || canUse('mma'));
  }

  // This sport not ready for everyone (MMA on the live site): Coming soon, unless an admin's signed in
  // (nothing while a sign-in is still being restored)
  readonly sportGated = SITE_SPORTS.find((s) => s.id === SPORT.id)?.devOnly ?? false;
  get gate(): 'open' | 'wait' | 'soon' {
    if (!this.sportGated || canUse('mma')) return 'open';
    return this.account.settled() ? 'soon' : 'wait';
  }

  position$ = this.positionService.position$;
  aboutOpen$ = this.positionService.aboutOpen$;
  readonly positionNames = SPORT.tabNames as Record<Position, string>;

  get positions(): Position[] {
    return visibleTabs(this.positionService.settings.sport);
  }

  // The bar's row (tab-families.ts): its tabs in order, a family (SPORT.tabFamilies: the NFL's Offense,
  // Defense and Special Teams) a tab like any other while it's shut, and the showing tab's family open in
  // place as one group, its own tab the label then its members as tabs. A sport without families: a plain tab
  // for each of its tabs.
  barCells(position: Position): BarCell[] {
    return barCells(SPORT.tabFamilies, this.positions, position);
  }

  // The bar's tab lit for a position: its own, or its family's parent (DEF while a CB list is open)
  litTab(position: Position): Position {
    return litTab(SPORT.tabFamilies, position) as Position;
  }

  // Whether the showing tab is in a family (the row is the accordion, or the sub-row shows under it)
  inFamily(position: Position): boolean {
    return !!familyOf(SPORT.tabFamilies, position);
  }

  // The sub-row under the bar while a family's tab is open (the narrow tablets, where the row can't hold the
  // open family): its tabs and their names (none otherwise)
  subTabs(position: Position): { tab: Position; name: string }[] | null {
    return subTabs(SPORT.tabFamilies, this.positions, position) as { tab: Position; name: string }[] | null;
  }

  subRowLabel(position: Position): string {
    return familyOf(SPORT.tabFamilies, position)?.label ?? '';
  }

  // A shut family's tab clicked: it opens to its first member, the team's tab
  openFamily(parent: string): void {
    const family = familyOf(SPORT.tabFamilies, parent);
    this.selectPosition(family ? (familyOpensTo(family, this.positions) ?? parent) : parent);
  }

  // The phone's dropdown in the sport's groups (SPORT.tabGroups; a tab in no group lists first, ungrouped)
  get selectGroups(): { label: string | null; tabs: { tab: Position; name: string }[] }[] {
    return selectGroups(SPORT.tabGroups, this.positions, (tab) => this.positionNames[tab as Position]) as { label: string | null; tabs: { tab: Position; name: string }[] }[];
  }

  // Below 1200px the filters are a slide-out menu (menu-open); above, a sidebar that collapses. Both
  // follow the one open / closed state (the footer's filter button and the menu's X).
  private readonly smallScreen = window.matchMedia('(max-width: 1199px)');

  constructor(
    private positionService: PositionService,
    readonly account: AccountService,
  ) {
    // (a click or a press anywhere: outside Angular, unless it's a link to one of the app's pages or it shuts
    // the filter menu)
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    quietListener<MouseEvent>(zone, destroyRef, document, 'click', (event) => this.pageLinkHash(event) !== null, (event) => this.onPageLink(event));
    quietListener<PointerEvent>(zone, destroyRef, document, 'pointerdown', (event) => this.outsideFilters(event), () => this.closeFilters());
    this.markBookView();
    // A setting that shows new tabs (MMA's women's divisions) opens the first of them; one that
    // hides the open tab goes back to the first tab
    let shown = this.positions;
    this.positionService.sportSettings$.pipe(takeUntilDestroyed()).subscribe((settings) => {
      if (!SPORT.tabVisible) return;
      const now = visibleTabs(settings);
      const added = now.filter((tab) => !shown.includes(tab));
      shown = now;
      const open = this.positionService.position;
      if (added.length) this.positionService.setPosition(added[0]);
      else if (open && !now.includes(open)) this.positionService.setPosition(POSITIONS[0]);
    });
  }

  get menuOpen(): boolean {
    return this.smallScreen.matches && this.positionService.filtersOpen;
  }

  // (the filters out of sight, a phone's menu shut or the sidebar collapsed: inert, so Tab doesn't wander
  // through its controls off the screen)
  get filtersShut(): boolean {
    return !this.positionService.filtersOpen;
  }

  get sidebarCollapsed(): boolean {
    return !this.smallScreen.matches && !this.positionService.filtersOpen;
  }

  // A click outside the filter menu closes it: not one in its dropdowns' lists (they open over the page)
  // or on the filter button (that toggles it). (Listened for in the constructor: quietListener)
  private outsideFilters(event: PointerEvent): boolean {
    return this.positionService.filtersOpen && !(event.target as Element | null)?.closest('.sidebar-shell, .cdk-overlay-container, .filter-toggle');
  }

  closeFilters(): void {
    this.positionService.setFiltersOpen(false);
  }

  // (Escape with the filters open and nothing over them, a menu or a dialog: shut, focus back on their button)
  @HostListener('document:keydown.escape')
  closeFiltersOnEscape(): void {
    if (!this.positionService.filtersOpen || document.querySelector('.cdk-overlay-pane, [role=dialog]')) return;
    this.closeFilters();
    document.querySelector<HTMLElement>('.filter-toggle')?.focus();
  }

  // (the bar's cells name their tabs as strings: tab-families.ts)
  selectPosition(position: string): void {
    this.positionService.setPosition(position as Position);
  }

  closeAbout(): void {
    this.positionService.setAboutOpen(false);
  }
}
