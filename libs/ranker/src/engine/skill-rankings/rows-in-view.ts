// Rows off screen skip being drawn (content-visibility: auto, rankings.component.scss), and the browser draws
// one again only a frame after it comes on screen. Scrolling never shows that (it draws rows well past the
// list's edges), but a re-rank can: a row from far down the list put on screen at once (a sort, a preset, a
// setting) showed as an empty row for a frame. So each time the list's rows move, the rows on screen are
// drawn at once (content-visibility: visible on them alone), and let go two frames on, drawn by then.
//
// Rows are all one height (--row-h), so a row's place in the list says where it is: held, the rows at the
// list's scroll, a row either side more, and the top screenful (a sort or a tab starts back at the top). The
// list's height, first row and row height are read as it scrolls or once a move is drawn, when they cost
// nothing. Its scroll is too while it's at the top, where a re-rank leaves it; scrolled down, it's read as
// the rows move (the browser keeps a row on screen in place as they move, so the scroll changes with them),
// which lays the list out early: a cost only then. A slider dragged re-ranks every frame: the rows held
// follow it, let go two frames after it stops.
const ROWS = ':scope > li.player[data-id]';

// Where the list was last seen: its scroll, height, its first row's top and the rows' height
export interface ListView {
  top: number;
  height: number;
  first: number;
  row: number;
}

// The rows (by place in the list) on screen in that view, a row either side more, and the top screenful
export function rowsInView(view: ListView, count: number): number[] {
  if (!(view.row > 0) || !(view.height > 0)) return [];
  const span = Math.ceil(view.height / view.row) + 1;
  const at = new Set<number>();
  const from = Math.max(0, Math.floor((view.top - view.first) / view.row) - 1);
  for (let i = from; i < Math.min(count, from + span + 2); i++) at.add(i);
  for (let i = 0; i < Math.min(count, span); i++) at.add(i);
  return [...at].sort((a, b) => a - b);
}

export function drawRowsInView(
  list: HTMLElement,
  frame: (run: () => void) => number = (run) => requestAnimationFrame(run),
  cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
): () => void {
  let view: ListView | null = null;
  let held = new Set<HTMLElement>();
  let waiting = 0;
  // (read when nothing's waiting to be laid out: as the list scrolls, and once a move's rows are drawn)
  const look = () => {
    const first = list.querySelector<HTMLElement>(ROWS);
    view = first ? { top: list.scrollTop, height: list.clientHeight, first: first.offsetTop, row: first.offsetHeight } : null;
  };
  const release = (keep?: Set<HTMLElement>) => {
    for (const row of held) if (!keep?.has(row)) row.style.removeProperty('content-visibility');
    held = keep ?? new Set();
  };
  const observer = new MutationObserver(() => {
    if (!view) return;
    const rows = list.querySelectorAll<HTMLElement>(ROWS);
    const at = view.top > 0 ? { ...view, top: list.scrollTop } : view;
    const shown = new Set<HTMLElement>();
    for (const i of rowsInView(at, rows.length)) {
      rows[i].style.setProperty('content-visibility', 'visible');
      shown.add(rows[i]);
    }
    // (rows held by an earlier move and not now let go now)
    release(shown);
    cancel(waiting);
    waiting = frame(() => (waiting = frame(() => ((waiting = 0), release(), look()))));
  });
  observer.observe(list, { childList: true });
  list.addEventListener('scroll', look, { passive: true });
  const first = frame(look);
  return () => {
    observer.disconnect();
    list.removeEventListener('scroll', look);
    cancel(first);
    cancel(waiting);
    release();
  };
}
