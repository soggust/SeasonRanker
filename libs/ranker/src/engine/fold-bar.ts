// A folding panel's header bar: a click anywhere on it folds the panel open or shut, as its chevron does, unless it
// lands on one of the bar's own controls (a button (the chevron's toggle among them: it folds on its own click), a
// link, a field, a select, a tab or switch, the page's controls on a card panel's right, a drag grip). The chevron
// stays the keyboard's control; the bar adds no tab stop, and the panel's body never folds it (the owner's note,
// 2026-10-17)
export const BAR_CLICK_IGNORES =
  'button, a, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="combobox"], [role="listbox"], [role="menu"], input, select, textarea, label, summary, mat-select, [panel-actions], .cdk-drag-handle, [cdkDragHandle]';
export function barClickToggles(target: { closest?: (sel: string) => unknown } | null): boolean {
  return !!target && typeof target.closest === 'function' && !target.closest(BAR_CLICK_IGNORES);
}
