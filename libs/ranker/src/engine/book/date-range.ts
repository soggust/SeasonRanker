// The date ranges the bet lists filter by: Today, Yesterday, This Month, This Year, All Time, by this browser's
// calendar. The Algorithm's (model-desk.component.ts, by when the bot placed a bet) and a user's Closed Bets
// (wallet-page.component.ts, by the game's date, the Date column's) share them.

export type DateRange = 'today' | 'yesterday' | 'month' | 'year' | 'all';
export const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];
export const isDateRange = (v: unknown): v is DateRange => DATE_RANGES.some((r) => r.value === v);

// (a moment in the range, by the local calendar: an unreadable date in none but All Time)
export function inRange(range: DateRange, when: string | number | Date | undefined | null, now: Date = new Date()): boolean {
  if (range === 'all') return true;
  if (when === undefined || when === null) return false;
  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return false;
  const day = new Date(now.getTime());
  // (yesterday by the calendar: the day before today's, across a month's or a year's turn)
  if (range === 'yesterday') day.setDate(day.getDate() - 1);
  if (at.getFullYear() !== day.getFullYear()) return false;
  if (range === 'year') return true;
  if (at.getMonth() !== day.getMonth()) return false;
  return range === 'month' || at.getDate() === day.getDate();
}

// (the range's first moment, local midnight: null for All Time)
export function rangeStart(range: DateRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null;
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (range === 'today') return new Date(y, m, d);
  if (range === 'yesterday') return new Date(y, m, d - 1);
  if (range === 'month') return new Date(y, m, 1);
  return new Date(y, 0, 1);
}

// (a list loaded newest first, by a date never before the one filtered on (a bet's settling, after its game
// starts), holds the whole range once its oldest is before the range's start: All Time never does)
export function pastRange(range: DateRange, oldest: string | undefined | null, now: Date = new Date()): boolean {
  const start = rangeStart(range, now);
  if (!start || !oldest) return false;
  const at = new Date(oldest);
  return !Number.isNaN(at.getTime()) && at.getTime() < start.getTime();
}

// (the range's words in a sentence: "No settled bets today")
export const rangeWords = (range: DateRange): string =>
  ({ today: 'today', yesterday: 'yesterday', month: 'this month', year: 'this year', all: 'yet' })[range];
