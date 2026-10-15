import type { DestroyRef, NgZone } from '@angular/core';

// A page-wide listener (a click or a key anywhere, the window resizing, a list scrolling) that only sometimes
// has anything to do: it listens outside Angular, so the events it lets go by never set off change detection
// (one pass over the whole page each, the grid's every cell: a click anywhere was several), and runs its
// handler back inside, as a @HostListener would have, when wanted(event) says it acts. wanted is the
// handler's own early return turned around: read only, no changes. Removed when destroyRef is.
export function quietListener<E extends Event>(
  zone: NgZone,
  destroyRef: DestroyRef,
  target: EventTarget,
  type: string,
  wanted: (event: E) => boolean,
  handler: (event: E) => void,
  options?: AddEventListenerOptions,
): void {
  const listener = (event: Event) => {
    if (wanted(event as E)) zone.run(() => handler(event as E));
  };
  zone.runOutsideAngular(() => target.addEventListener(type, listener, options));
  destroyRef.onDestroy(() => target.removeEventListener(type, listener, options));
}
