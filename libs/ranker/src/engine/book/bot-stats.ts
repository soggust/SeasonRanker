// Bot Stats (the owner, 2026-11-04: the Algorithm tab made everyone's, "a cute page with charts or infographics
// in my design theme"): the figures and chart data the page draws, worked out from the same history as the panels
// (replay-history.ts botHistoryOf), so every number agrees with the rows under it. Pure: no Angular, no DOM.
//
//   unitsCurve   the units won over time, by Eastern game day, in the range on show: the replay's day buckets
//                (the record's bands: LOCK, LOVE, LIKE; never a practice pick or a PASS) and the live bets the record
//                counts (liveRealOf), summed into one running total and, with every sport on show, each sport's own
//                line (at any day they add up to the total). Drawn into a CURVE_W by CURVE_H box: the paths, the zero
//                line, clean axis ticks, each day's point for the hover, the end point (the units now)
//   streakOf     the current run off the strip: the newest graded bets in a row that won or lost (pushes and pending
//                skipped)
//   barsOf       rows as diverging bars on one scale (units won to the right of zero, lost to the left), the zero
//                placed where the rows' worst loss and best gain put it, so no space is wasted when every row is up
//   squaresOf    the last twenty results as squares, newest first
//   winPctOf     the share of decided bets won
import { SPORTS } from './desk-math';
import type { ModelBet } from './desk-model';
import { HistoryRange, HistoryRow, HistoryStripBet, ReplayRecordFile, etDay, inDays, liveRealOf, rangeDays, settledOf } from './replay-history';

export const CURVE_W = 600;
export const CURVE_H = 160;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
// (the record's bands in the replay's day buckets)
const RECORD_BANDS = ['lock', 'high', 'medium'];

export interface CurvePoint {
  // ('start' for the point before the first day, 0; 'before' when it carries what the record holds before the
  // buckets drawn; a month 'YYYY-MM' on All time, before the days)
  day: string;
  x: number;
  total: number;
  by: Record<string, number>;
  // (bets graded that day, every sport on show)
  bets: number;
}
export interface CurveLine {
  sport: string;
  values: number[];
  path: string;
  profit: number;
}
export interface CurveTick {
  value: number;
  y: number;
  label: string;
}
export interface UnitsCurve {
  points: CurvePoint[];
  path: string;
  // (the total's wash down to zero: the path closed along the zero line)
  area: string;
  lines: CurveLine[];
  min: number;
  max: number;
  zeroY: number;
  ticks: CurveTick[];
  end: { x: number; y: number };
  profit: number;
  bets: number;
  // (the one sport whose bets these all are: the total is its line)
  solo: string | null;
  // (the first and last game day drawn)
  from: string | null;
  to: string | null;
}

const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const r1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

// (a unit figure with its sign: "+12.3u", "−4.0u", "0.0u")
export const signedUnits = (u: number): string => `${u > 0 ? '+' : u < 0 ? '−' : ''}${Math.abs(u).toFixed(1)}u`;

// A clean step for about `want` ticks over a span: 1, 2 or 5 times a power of ten
export function niceStep(span: number, want = 4): number {
  if (!(span > 0)) return 1;
  const raw = span / want;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / mag;
  const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return step * mag;
}

// The axis ticks between min and max (0 among them when the range holds it), as values
export function niceTicks(min: number, max: number, want = 4): number[] {
  if (!(max > min)) return [0];
  const step = niceStep(max - min, want);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step / 1e6; v += step) out.push(Math.round(v * 1e6) / 1e6 + 0);
  return out;
}

export function unitsCurve(
  files: (ReplayRecordFile | null | undefined)[],
  bets: ModelBet[],
  sport: string | null,
  range: HistoryRange,
  now: number | Date = Date.now(),
): UnitsCurve | null {
  const days = rangeDays(range, now);
  // (each day's units and bets by sport)
  const byDay = new Map<string, Record<string, { profit: number; bets: number }>>();
  const add = (day: string, s: string, profit: number, n: number) => {
    const d = byDay.get(day) ?? byDay.set(day, {}).get(day)!;
    const cell = (d[s] ??= { profit: 0, bets: 0 });
    cell.profit += profit;
    cell.bets += n;
  };
  // (All time: what the record holds before the buckets drawn, a sport's opening units: the months' file adds them as
  // points; without it, or for what it doesn't cover, the whole record less the buckets, at the start)
  const seed: Record<string, number> = {};
  for (const f of files) {
    if (!f || f.v !== 1 || !f.sport || (sport && f.sport !== sport) || !f.daily?.bands) continue;
    const profitAt = f.daily.cols?.indexOf('profit') ?? 4;
    if (!days) {
      let drawn = 0;
      for (const band of RECORD_BANDS) {
        for (const [month, row] of Object.entries(f.monthly?.bands?.[band] ?? {})) {
          const cols = row.split(',').map(Number);
          const [won = 0, lost = 0, push = 0] = cols;
          add(month, f.sport, cols[4] || 0, won + lost + push);
          drawn += cols[4] || 0;
        }
        for (const row of Object.values(f.daily.bands[band] ?? {})) drawn += Number(row.split(',')[profitAt]) || 0;
      }
      const rest = Math.round(((f.overall?.profit ?? 0) - drawn) * 100) / 100;
      if (Math.abs(rest) >= 0.01) seed[f.sport] = rest;
    }
    for (const band of RECORD_BANDS) {
      for (const [day, row] of Object.entries(f.daily.bands[band] ?? {})) {
        if (!inDays(day, days)) continue;
        const cols = row.split(',').map(Number);
        const [won = 0, lost = 0, push = 0] = cols;
        add(day, f.sport, cols[profitAt] || 0, won + lost + push);
      }
    }
  }
  for (const b of liveRealOf(files, bets, sport, range, now)) {
    if (b.void || !['won', 'lost', 'push'].includes(b.status) || !fin(b.profit)) continue;
    add(etDay(settledOf(b)), b.sport, b.profit, 1);
  }
  const dayKeys = [...byDay.keys()].sort();
  if (!dayKeys.length) return null;
  const sports = SPORTS.filter((s) => dayKeys.some((d) => byDay.get(d)![s]));
  const lines = !sport && sports.length > 1 ? sports : [];
  for (const s of Object.keys(seed)) if (!sports.includes(s)) sports.push(s);
  const running: Record<string, number> = Object.fromEntries(sports.map((s) => [s, seed[s] ?? 0]));
  let sum = Math.round(Object.values(seed).reduce((a, b) => a + b, 0) * 1e4) / 1e4;
  let total = 0;
  const raw: { day: string; total: number; by: Record<string, number>; bets: number }[] = [{ day: Object.keys(seed).length ? 'before' : 'start', total: sum, by: { ...running }, bets: 0 }];
  for (const day of dayKeys) {
    const d = byDay.get(day)!;
    let n = 0;
    for (const s of sports) {
      const cell = d[s];
      if (!cell) continue;
      running[s] = Math.round((running[s] + cell.profit) * 1e4) / 1e4;
      sum = Math.round((sum + cell.profit) * 1e4) / 1e4;
      n += cell.bets;
    }
    total += n;
    raw.push({ day, total: sum, by: { ...running }, bets: n });
  }
  const values = raw.flatMap((p) => [p.total, ...lines.map((s) => p.by[s])]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const last = raw.length - 1;
  const step = CURVE_W / Math.max(1, last);
  const yOf = (v: number) => CURVE_H - PAD_BOTTOM - ((v - min) / span) * (CURVE_H - PAD_TOP - PAD_BOTTOM);
  const pathOf = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${r1(i * step)},${r1(yOf(v))}`).join(' ');
  const points: CurvePoint[] = raw.map((p, i) => ({ ...p, x: i * step }));
  const totals = raw.map((p) => p.total);
  const path = pathOf(totals);
  const zeroY = yOf(0);
  return {
    points,
    path,
    area: `${path} L${CURVE_W},${r1(zeroY)} L0,${r1(zeroY)} Z`,
    lines: lines.map((s) => {
      const vals = raw.map((p) => p.by[s]);
      return { sport: s, values: vals, path: pathOf(vals), profit: running[s] };
    }),
    min,
    max,
    zeroY,
    ticks: niceTicks(min, max).map((value) => ({ value, y: yOf(value), label: value === 0 ? '0' : signedUnits(value).replace('.0u', 'u') })),
    end: { x: last * step, y: yOf(sum) },
    profit: sum,
    bets: total,
    solo: sports.length === 1 ? sports[0] : null,
    from: firstOf(files, sport, days) ?? dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
  };
}

// (where the chart's span starts: All time, the earliest replay's first game; a range, its first day drawn)
function firstOf(files: (ReplayRecordFile | null | undefined)[], sport: string | null, days: { from: string; to: string } | null): string | null {
  if (days) return null;
  const starts = files.filter((f): f is ReplayRecordFile => !!f && f.v === 1 && !!f.sport && (!sport || f.sport === sport) && !!f.from).map((f) => etDay(f.from!));
  return starts.sort()[0] ?? null;
}

// (the point nearest a share of the chart's width, 0 to 1: the hover's)
export function pointAt(curve: UnitsCurve, share: number): CurvePoint {
  const i = Math.round(Math.max(0, Math.min(1, share)) * (curve.points.length - 1));
  return curve.points[i];
}

export interface Streak {
  kind: 'W' | 'L' | null;
  n: number;
}

// The current run: the strip newest first; the first decided result starts it, pushes and undecided skipped
export function streakOf(strip: HistoryStripBet[]): Streak {
  let kind: 'W' | 'L' | null = null;
  let n = 0;
  for (const b of strip) {
    if (b.res !== 'W' && b.res !== 'L') continue;
    if (!kind) kind = b.res;
    if (b.res !== kind) break;
    n++;
  }
  return { kind, n };
}

export interface BarRow<T extends { profit: number }> {
  row: T;
  // (the bar's left edge and width, percent of the track)
  left: number;
  width: number;
  up: boolean;
}
export interface Bars<T extends { profit: number }> {
  rows: BarRow<T>[];
  // (where zero sits on the track, percent)
  zero: number;
}

export function barsOf<T extends { profit: number }>(rows: T[]): Bars<T> {
  const posMax = Math.max(0, ...rows.map((r) => r.profit));
  const negMax = Math.max(0, ...rows.map((r) => -r.profit));
  const span = posMax + negMax || 1;
  const zero = (negMax / span) * 100;
  return {
    zero,
    rows: rows.map((row) => {
      const width = (Math.abs(row.profit) / span) * 100;
      return { row, up: row.profit >= 0, left: row.profit >= 0 ? zero : zero - width, width };
    }),
  };
}

export interface FormSquare {
  res: 'W' | 'L' | 'P' | null;
  pending: boolean;
  title: string;
  // (its game, for a click to open it (the owner, 2026-11-04): the bet as the strip has it)
  bet: HistoryStripBet;
}

// The last bets as squares, newest first (on the left, as the Book's other strips read)
export function squaresOf(strip: HistoryStripBet[], n = 20): FormSquare[] {
  return strip
    .slice(0, n)
    .map((b) => ({
      res: b.res,
      pending: b.pending,
      title: `${b.res === 'W' ? 'Won' : b.res === 'L' ? 'Lost' : b.res === 'P' ? 'Push' : 'Pending'}: ${b.sport.toUpperCase()} ${b.pick} (${b.stake}u${b.res ? ', ' + b.units : ''})`,
      bet: b,
    }));
}

export function winPctOf(row: Pick<HistoryRow, 'won' | 'lost'>): number | null {
  const n = row.won + row.lost;
  return n ? row.won / n : null;
}
