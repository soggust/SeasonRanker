// The splash's type: an engraved serif, a condensed block, a ticket mono and a marker, subset to the characters
// the splash uses and self-hosted (assets/fonts/splash/faces.css, about 80 KB). Added to the document once, and
// each face fetched right away, because a face arriving after the splash is drawn relays out the whole document
// (three of them, 200 ms each on a throttled phone): the grid asks for them at idle (splash-host.component.ts
// prefetchSplash), so they're in the cache before any card opens.
// The jersey lettering (assets/fonts/jersey/jersey.css, eighteen faces, 58 KB in all, one family "J-<id>" each)
// is added the same way: a face is fetched only when a jersey wears it, and the lot is warmed at idle too.
import { FACE_IDS } from './splash.images';

let added = false;

export function loadSplashFonts(): void {
  if (added || typeof document === 'undefined') return;
  added = true;
  const add = (href: string, warm: string[]) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      for (const face of warm) document.fonts?.load(face).catch(() => {});
    };
    document.head.appendChild(link);
  };
  add('assets/fonts/splash/faces.css', ['700 10px Cinzel', '600 10px Oswald', '700 10px "IBM Plex Mono"', '400 10px "Permanent Marker"']);
  add(
    'assets/fonts/jersey/jersey.css',
    FACE_IDS.map((id) => `400 10px "J-${id}"`),
  );
}
