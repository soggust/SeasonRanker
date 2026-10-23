// The record's trend (DECISIONS.md D86, the owner, 2026-10-23: "so we can ensure we're improving"): each sport's
// replayed record at every re-record (apps/<sport>/src/StaticData/model/record-history.json, written by gate.mjs
// --record: the history audit's weekly, nightly and code runs, an agent's own), drawn as a small line of the units
// at the Algorithm tab's foot, with the newest units and the change since the re-record before.

export interface RecordHistoryRow {
  at: string;
  trigger?: string;
  commit?: string | null;
  bets?: number;
  record?: string;
  units: number | null;
  roi?: number | null;
  beat?: number | null;
}
export interface RecordHistoryFile {
  v?: number;
  sport?: string | null;
  rows?: RecordHistoryRow[];
}
export interface RecordTrend {
  sport: string;
  points: string;
  width: number;
  height: number;
  last: number;
  delta: number | null;
  n: number;
  since: string;
  title: string;
}

const signed = (u: number): string => `${u > 0 ? '+' : u < 0 ? '−' : ''}${Math.abs(u).toFixed(1)}u`;

// A sport's trend from its file: the last `max` re-records' units as an SVG polyline's points; null under two rows
export function recordTrendOf(sport: string, file: RecordHistoryFile | null, { max = 60, width = 120, height = 24 } = {}): RecordTrend | null {
  const rows = (file?.rows ?? []).filter((r): r is RecordHistoryRow & { units: number } => typeof r.units === 'number' && Number.isFinite(r.units)).slice(-max);
  if (rows.length < 2) return null;
  const us = rows.map((r) => r.units);
  const lo = Math.min(...us);
  const hi = Math.max(...us);
  const span = hi - lo || 1;
  const step = width / (rows.length - 1);
  const points = us.map((u, i) => `${(i * step).toFixed(1)},${(height - 2 - ((u - lo) / span) * (height - 4)).toFixed(1)}`).join(' ');
  const last = us[us.length - 1];
  const delta = last - us[us.length - 2];
  const newest = rows[rows.length - 1];
  return {
    sport,
    points,
    width,
    height,
    last,
    delta,
    n: rows.length,
    since: rows[0].at.slice(5, 10),
    title: `${sport.toUpperCase()}: the replayed record at each of the last ${rows.length} re-records, ${signed(lo)} to ${signed(hi)}. Newest ${newest.at.slice(0, 10)} (${newest.trigger ?? 'manual'}${newest.commit ? `, ${newest.commit}` : ''}): ${newest.record ?? ''} ${signed(last)}`,
  };
}

export const trendUnits = signed;
