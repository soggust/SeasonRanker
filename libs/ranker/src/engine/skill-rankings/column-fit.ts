// Every column at least as wide as its header's label (the 11px label in one line, never clipped or wrapped,
// with room for the isolated header's direction arrow while it's isolated), its cells in every row the same
// width so the columns stay lined up. The rows are flex rows (the groups display: contents), so a column's
// width can't come from its widest cell: the header's labels are measured here and each column's width set
// on the list as a variable (--lw-<key>; a box of grades the sum of its own, --lw-box-<group>), which the
// header's cell and every row's read the same way (columnWidth; rankings.component.scss: --label-w).
// Measured again when the header changes (columns, labels, isolation) or the rows do (Recent's dots), and
// once the fonts are in.
const ARROW_GAP = 3;

// (a stat key as a variable name: letters, digits, - and _ only)
const cssKey = (key: string) => key.replace(/[^\w-]/g, '_');

export const columnWidth = (key: string) => `var(--lw-${cssKey(key)})`;

// A grade box: as wide as its columns' labels, at least its own minimum (em per column)
export const boxWidth = (group: string, columns: number) => `max(${columns * 7.5}em, var(--lw-box-${cssKey(group)}, 0px))`;

export function fitColumns(list: HTMLElement): void {
  const header = list.querySelector<HTMLElement>(':scope > li.header-row');
  if (!header) return;
  // (every width read first, then every variable written: a write between reads would lay the whole list
  // out again for the next one)
  const widths = new Map<string, number>();
  const boxes = new Map<string, number>();
  for (const cell of Array.from(header.querySelectorAll<HTMLElement>('[data-col]'))) {
    const label = cell.querySelector<HTMLElement>('.stat-label');
    const key = cell.dataset['col'];
    if (!label || !key) continue;
    // (the arrow sits at the cell's right, the label centered: its room on both sides)
    const arrow = cell.querySelector<HTMLElement>('.iso-dir');
    let width = textWidth(label) + 1;
    if (arrow) width += 2 * (arrow.offsetWidth + ARROW_GAP);
    // (Recent: its dots, too, the same in every row)
    if (cell.classList.contains('recent-box')) width = Math.max(width, dotsWidth(list));
    const name = cssKey(key);
    widths.set(name, width);
    const box = cell.parentElement?.dataset['box'];
    if (box) boxes.set(cssKey(box), (boxes.get(cssKey(box)) ?? 0) + width);
  }
  const set = (name: string, width: number) => {
    const value = `${width}px`;
    if (list.style.getPropertyValue(name) !== value) list.style.setProperty(name, value);
  };
  widths.forEach((width, name) => set(`--lw-${name}`, width));
  boxes.forEach((width, group) => set(`--lw-box-${group}`, width));
}

// A label's own width: its text's, not its box's (a block stretched to its cell would read as the cell's
// width, which this sets: a column that had grown could never come back down)
function textWidth(label: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(label);
  return Math.ceil(range.getBoundingClientRect().width);
}

// Recent's dots, their own width (each square and its margins; the row with the most of them), not their
// row's: the row stretches to the column, which this sets
function dotsWidth(list: HTMLElement): number {
  let most: HTMLElement | null = null;
  for (const dots of Array.from(list.querySelectorAll<HTMLElement>(':scope > li.player:not(.header-row) .recent-box .last-five > div'))) {
    if (!most || dots.childElementCount > most.childElementCount) most = dots;
  }
  if (!most) return 0;
  let width = 0;
  for (const dot of Array.from(most.children) as HTMLElement[]) {
    const style = getComputedStyle(dot);
    width += dot.offsetWidth + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
  }
  return Math.ceil(width);
}

// Watches the header and the rows, measuring on the next frame after a change (outside Angular: nothing
// it does needs the page drawn again by Angular). Returns the stop.
export function watchColumns(list: HTMLElement): () => void {
  let frame = 0;
  const soon = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fitColumns(list);
    });
  };
  const observer = new MutationObserver(soon);
  observer.observe(list, { childList: true });
  const header = list.querySelector(':scope > li.header-row');
  if (header) observer.observe(header, { attributeFilter: ['class'], characterData: true, childList: true, subtree: true });
  document.fonts?.ready.then(soon).catch(() => null);
  soon();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
