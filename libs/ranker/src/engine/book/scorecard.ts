// The Algorithm tab's Scorecard (libs/ranker/scripts/model/gate.mjs --record: each version of the model scored by
// the replay gate, a point per version, oldest first): each sport's edge over the book's own log loss on the frozen
// benchmark (gate-frozen.json, fixed 2026-10-18) and on the rolling set (the last 28 days of graded rows), in nats
// per 100 rows, above 0 the model better than the book; its top picks' CLV and hit rate on the hover. Pure: no
// Angular, tested in model-desk.test.mjs.

export interface ScoreNumbers {
  mode?: 'replay' | 'saved';
  n: number;
  gap: number | null;
  closeGap?: number | null;
  clv: number | null;
  hit: number | null;
  picks?: number;
  units?: number | null;
  from?: string;
}

export interface ScoreEntry {
  sport: string;
  epoch: string | null;
  commit: string | null;
  commitAt?: string | null;
  label?: string;
  at: string;
  frozen: { props?: ScoreNumbers | null; lines?: ScoreNumbers | null };
  rolling: { props?: ScoreNumbers | null; lines?: ScoreNumbers | null };
  proj?: { games: number | null; props: number | null };
}

export interface ScorecardFile {
  v: number;
  sport: string;
  frozen?: string | null;
  entries: ScoreEntry[];
}

export interface ScorePoint {
  x: number;
  y: number;
  title: string;
}

export interface ScoreSeries {
  key: 'frozen' | 'rolling';
  label: string;
  path: string;
  points: ScorePoint[];
}

export interface ScoreChart {
  sport: string;
  label: string;
  layer: 'props' | 'lines';
  versions: number;
  zeroY: number;
  min: number;
  max: number;
  series: ScoreSeries[];
  latest: string;
}

export const SCORE_W = 300;
export const SCORE_H = 80;
const PAD = 6;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
// (the edge over the book in nats per 100 rows: the gap's sign turned, so up is better)
export const edgeOf = (s: ScoreNumbers | null | undefined): number | null => (s && fin(s.gap) ? -s.gap * 100 : null);
const signed = (v: number | null, d = 2) => (v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);
const pctOf = (v: number | null | undefined) => (fin(v) ? `${(v * 100).toFixed(1)}%` : '-');
const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '?');

// A point's hover: the version, then each set's numbers
export function pointTitle(e: ScoreEntry, layer: 'props' | 'lines', key: 'frozen' | 'rolling'): string {
  const s = e[key]?.[layer] ?? null;
  const set = key === 'frozen' ? 'frozen benchmark' : `last 28 days${s?.from ? ` (from ${s.from})` : ''}`;
  return `${e.commit ?? e.label ?? 'version'} (epoch ${dayOf(e.epoch)}): ${set}, ${s?.n ?? 0} ${layer}: edge over the Book ${signed(edgeOf(s))} nats per 100, top picks' CLV ${s && fin(s.clv) ? signed(s.clv * 100, 1) + '%' : '-'}, hit ${pctOf(s?.hit)}`;
}

// Each sport's chart from its scorecard file: the props' where it has any, else the game lines'; none without
// entries
export function scorecardPanelOf(files: (ScorecardFile | null)[], labels: Record<string, string> = {}): ScoreChart[] {
  const out: ScoreChart[] = [];
  for (const f of files) {
    const entries = (f?.entries ?? []).filter((e) => e && typeof e === 'object');
    if (!f || !entries.length) continue;
    const layer: 'props' | 'lines' = entries.some((e) => fin(edgeOf(e.frozen?.props)) || fin(edgeOf(e.rolling?.props))) ? 'props' : 'lines';
    const values = entries.flatMap((e) => [edgeOf(e.frozen?.[layer]), edgeOf(e.rolling?.[layer])]).filter(fin);
    if (!values.length) continue;
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = max - min || 1;
    const yOf = (v: number) => PAD + ((max - v) / span) * (SCORE_H - 2 * PAD);
    const xOf = (i: number) => (entries.length === 1 ? SCORE_W / 2 : PAD + (i / (entries.length - 1)) * (SCORE_W - 2 * PAD));
    const series: ScoreSeries[] = (['frozen', 'rolling'] as const).map((key) => {
      const points: ScorePoint[] = [];
      entries.forEach((e, i) => {
        const v = edgeOf(e[key]?.[layer]);
        if (v !== null) points.push({ x: Math.round(xOf(i) * 10) / 10, y: Math.round(yOf(v) * 10) / 10, title: pointTitle(e, layer, key) });
      });
      return { key, label: key === 'frozen' ? 'Frozen benchmark' : 'Last 28 days', path: points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '), points };
    });
    const last = entries[entries.length - 1];
    const fz = last.frozen?.[layer];
    const rl = last.rolling?.[layer];
    out.push({
      sport: f.sport,
      label: labels[f.sport] ?? f.sport.toUpperCase(),
      layer,
      versions: entries.length,
      zeroY: Math.round(yOf(0) * 10) / 10,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      series,
      latest: `${last.commit ?? last.label ?? 'latest'}: frozen ${signed(edgeOf(fz))} (CLV ${fz && fin(fz.clv) ? signed(fz.clv * 100, 1) + '%' : '-'}, hit ${pctOf(fz?.hit)}), last 28 days ${signed(edgeOf(rl))} (CLV ${rl && fin(rl.clv) ? signed(rl.clv * 100, 1) + '%' : '-'}, hit ${pctOf(rl?.hit)})`,
    });
  }
  return out;
}
