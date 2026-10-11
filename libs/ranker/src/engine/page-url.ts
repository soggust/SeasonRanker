import SPORTS from '../../../../sports.json';

// The pages every sport shares, at addresses of their own: seasonranker.com/wallet, /lists, /community,
// /tracker, /friends, /settings, /bets, /privacy, /data-deletion and /u/<username>, not under a sport's
// (/nfl/#wallet). The app still names a page by its old hash ("#wallet", "#u/sam", "#account/privacy",
// "#community/QB/2026"): pageHash() reads it off the address, pagePath() writes the address for it, and
// goTo() moves there without a reload (history.pushState, then a hashchange for the pages listening).
//
// Which app serves them (firebase.json): the first sport's (sports.json's first, NFL), its base href and all,
// since the hosting can't read what the visitor used last. These pages look the same from any sport; the
// sport bar lights none of them, and the way back to the rankings goes to the sport used last (lastSport(),
// remembered here). The three pages measured per sport, the Community's boards, a saved list and the Tracker,
// carry the sport after the page's name (/community/mlb/QB/2026, /lists/mlb/<uid>/<id>, /tracker/mlb), and
// the hosting serves those from that sport's own app.

// (the first segment of each page's address; Settings' hash is #account)
const ROOTS = ['bets', 'settings', 'lists', 'community', 'tracker', 'wallet', 'friends', 'privacy', 'data-deletion', 'u'];
const SPORTED = ['community', 'lists', 'tracker'];
const SPORT_IDS = (SPORTS as { id: string }[]).map((s) => s.id);

// (this app's sport: its base href's, /nfl/, whatever address it answers)
const appSport = (): string => new URL(document.baseURI).pathname.split('/').filter(Boolean)[0];

// A page's address -> its hash and the sport it names (null: any app shows it); null for an address that
// isn't one of these pages (a sport's own, /nfl/)
export function readPagePath(pathname: string): { hash: string; sport: string | null } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (!ROOTS.includes(parts[0])) return null;
  let sport: string | null = null;
  if (SPORTED.includes(parts[0]) && SPORT_IDS.includes(parts[1])) sport = parts.splice(1, 1)[0];
  if (parts[0] === 'settings') parts[0] = 'account';
  return { hash: '#' + parts.join('/'), sport };
}

// A page's hash -> its address ('' or '#': the sport's rankings, /<sport>/)
export function pagePath(hash: string, sport: string): string {
  const parts = hash.replace(/^#/, '').split('/');
  if (!parts[0]) return `/${sport}/`;
  if (parts[0] === 'account') parts[0] = 'settings';
  // (the lists page itself is everyone's; one list is its sport's)
  if (SPORTED.includes(parts[0]) && (parts[0] !== 'lists' || parts.length > 1)) parts.splice(1, 0, sport);
  return '/' + parts.join('/');
}

// ---------------------------------------------------------------------------
// The address bar
// ---------------------------------------------------------------------------

// The page showing, as its hash: from a page's address, else the hash (an old link, /nfl/#wallet, before
// forwardOldLink() cleans it; '' on the rankings)
export function pageHash(): string {
  return readPagePath(location.pathname)?.hash ?? location.hash;
}

// (the rankings' ?pos and ?season, kept while a page is showing, for the way back)
let rankingsSearch = typeof location !== 'undefined' && !readPagePath(location.pathname) ? location.search : '';

// An old link (/nfl/#wallet, /nfl/#u/sam): the page's own address in its place, without a reload
export function forwardOldLink(): void {
  if (readPagePath(location.pathname) || !location.hash) return;
  const path = pagePath(location.hash, appSport());
  if (path === `/${appSport()}/` || !readPagePath(path)) return;
  rankingsSearch = location.search;
  history.replaceState(history.state, '', path);
}

// Another page, by its hash, with no reload; the pages listening hear a hashchange. replace: in place of
// this entry (a page settling its own address); quiet: no hashchange (it's already showing)
export function goTo(hash: string, options: { replace?: boolean; quiet?: boolean } = {}): void {
  if (!hash.replace(/^#/, '')) return goHome();
  const path = pagePath(hash, appSport());
  if (!readPagePath(location.pathname)) rankingsSearch = location.search;
  if (location.pathname + location.search + location.hash !== path) {
    if (options.replace) history.replaceState(null, '', path);
    else history.pushState(null, '', path);
  }
  if (!options.quiet) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// Back to the rankings: this app's, as they were (their ?pos and ?season), or the sport used last's (a page
// opened fresh came up in the first sport's app)
export function goHome(): void {
  const home = lastSport();
  if (home !== appSport()) {
    location.assign(`/${home}/`);
    return;
  }
  history.pushState(null, '', `/${appSport()}/${rankingsSearch}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

// The sport whose rankings were open last (this one's, when none were or the storage can't be read)
const LAST_SPORT = 'lastSport';
export function lastSport(): string {
  try {
    const id = localStorage.getItem(LAST_SPORT);
    if (id && SPORT_IDS.includes(id)) return id;
  } catch {
    // (no storage: this sport)
  }
  return appSport();
}
export function rememberSport(): void {
  try {
    localStorage.setItem(LAST_SPORT, appSport());
  } catch {
    // (no storage: the first sport's app answers a page's address, and its rankings are the way back)
  }
}
