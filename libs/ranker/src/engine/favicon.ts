// The browser tab's icon, by the page showing: the sport's own (index.html's favicon) on its rankings, the
// Book's casino chip on the Book, and the site's own mark (the header's star over the podium, in gold) on the
// pages every sport shares (settings, profiles, lists, community, the tracker, the wallet, friends, Privacy,
// Data deletion). The PWA manifest's icons stay the sport's.
// (a view's name as app.component.ts's View spells it; kept a string so this module needs no Angular)
export const BOOK_ICON = 'assets/book-chip.svg';
export const SITE_ICON = 'assets/brand-mark.svg';

// (the icon a view swaps in; null: the sport's own, as index.html has it)
export function faviconFor(view: string): string | null {
  if (view === 'rankings') return null;
  return view === 'book' ? BOOK_ICON : SITE_ICON;
}

// (the page's icon links: rel="icon" (index.html has an SVG and a PNG/ICO fallback) and an apple-touch-icon
// where a page has one; the first swap keeps each one's own href and type on it, data-sport-href and
// data-sport-type, so a way back puts them back exactly)
const ICON_LINKS = 'link[rel~="icon"], link[rel="apple-touch-icon"]';

export function applyFavicon(doc: Pick<Document, 'querySelectorAll'>, view: string): void {
  const icon = faviconFor(view);
  doc.querySelectorAll<HTMLLinkElement>(ICON_LINKS).forEach((link) => {
    if (!link.hasAttribute('data-sport-href')) {
      link.setAttribute('data-sport-href', link.getAttribute('href') ?? '');
      link.setAttribute('data-sport-type', link.getAttribute('type') ?? '');
    }
    const href = icon ?? link.getAttribute('data-sport-href') ?? '';
    const type = icon ? 'image/svg+xml' : (link.getAttribute('data-sport-type') ?? '');
    // (only on a change: a new href makes the browser fetch the icon again)
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    if (type) link.setAttribute('type', type);
    else link.removeAttribute('type');
    // (an SVG has no fixed sizes: the fallback's "16x16 32x32" dropped while a swap shows, put back after)
    if (!link.hasAttribute('data-sport-sizes') && link.hasAttribute('sizes')) {
      link.setAttribute('data-sport-sizes', link.getAttribute('sizes') ?? '');
    }
    const sizes = link.getAttribute('data-sport-sizes');
    if (icon) link.removeAttribute('sizes');
    else if (sizes) link.setAttribute('sizes', sizes);
  });
}
