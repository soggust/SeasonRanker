// The Algorithm tab's Miss review panel (model-desk.component.ts): each sport's daily review of its biggest misses
// (data/model/miss-review.json, libs/ranker/scripts/model/miss-review.mjs: Claude reading the news around each one
// for why the model was wrong), each day's misses with their cause, confidence and evidence, the causes tallied, and
// the recommendations (shown in the Self-check panel too). Advice only: nothing in it moves a price or a weight.

export interface MissReview {
  day: string;
  pick: string;
  matchup?: string | null;
  stat: string;
  status?: string;
  result?: string | null;
  reason?: string;
  score?: number;
  cause: string;
  confidence: number;
  evidence: string;
  term?: string;
  bug?: string;
  backfill?: boolean;
}

export interface MissTallyCell {
  sport: string;
  stat: string;
  cause: string;
  n: number;
  w: number;
  of: number;
  share: number;
}

export interface MissRecommendation {
  sport: string;
  stat: string;
  cause: string;
  n: number;
  of: number;
  share: number;
  text: string;
  candidate?: string | null;
  term?: string;
  bug?: boolean;
}

export interface MissReviewFile {
  sport: string;
  at?: string;
  reviews?: MissReview[];
  tally?: MissTallyCell[];
  recommendations?: MissRecommendation[];
  count?: { reviewed: number; backfill: number; usd: number };
}

export const CAUSE_LABELS: Record<string, string> = {
  role: 'Role change',
  availability: 'Availability',
  script: 'Game script',
  matchup: 'Matchup',
  weather: 'Weather / venue',
  term: 'Model term',
  data: 'Bad data',
  market: 'Market knew',
  variance: 'Variance',
};

export interface MissRow {
  key: string;
  where: string;
  pick: string;
  result: string;
  cause: string;
  causeId: string;
  sure: string;
  evidence: string;
  backfill: boolean;
}

export interface MissDay {
  day: string;
  rows: MissRow[];
}

export interface MissTallyRow {
  key: string;
  where: string;
  cause: string;
  causeId: string;
  // ("4 of 9")
  count: string;
  share: number;
}

export interface MissPanel {
  days: MissDay[];
  tally: MissTallyRow[];
  recommendations: MissRecommendation[];
  // ("38 misses reviewed, 31 of them the backfill's")
  line: string;
}

// The panel: the files' reviews (the sport chosen, else every one) by day, the newest first (maxDays days); the tally's
// cells by share (variance last), maxTally at most; the recommendations
export function missPanelOf(files: (MissReviewFile | null)[], labels: Record<string, string>, sport: string | null = null, maxDays = 3, maxTally = 12): MissPanel {
  const mine = files.filter((f): f is MissReviewFile => !!f && (!sport || f.sport === sport));
  const label = (s: string) => labels[s] ?? s.toUpperCase();
  const byDay = new Map<string, MissRow[]>();
  for (const f of mine) {
    for (const [i, r] of (f.reviews ?? []).entries()) {
      if (!r?.cause || !r.day) continue;
      const rows = byDay.get(r.day) ?? [];
      rows.push({
        key: `${f.sport}:${r.day}:${i}`,
        where: `${label(f.sport)} · ${r.stat}`,
        pick: r.pick,
        result: r.result ?? '',
        cause: CAUSE_LABELS[r.cause] ?? r.cause,
        causeId: r.cause,
        sure: Number.isFinite(r.confidence) ? `${Math.round(r.confidence * 100)}% sure` : '',
        evidence: [r.evidence, r.term ? `(term: ${r.term})` : '', r.bug ? `Bug: ${r.bug}` : ''].filter(Boolean).join(' '),
        backfill: !!r.backfill,
      });
      byDay.set(r.day, rows);
    }
  }
  const days = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, maxDays)
    .map(([day, rows]) => ({ day, rows }));
  const tally = mine
    .flatMap((f) => f.tally ?? [])
    .filter((c) => c.n > 0)
    .sort((a, b) => Number(a.cause === 'variance') - Number(b.cause === 'variance') || b.share - a.share || b.n - a.n)
    .slice(0, maxTally)
    .map((c) => ({ key: `${c.sport}:${c.stat}:${c.cause}`, where: `${label(c.sport)} · ${c.stat}`, cause: CAUSE_LABELS[c.cause] ?? c.cause, causeId: c.cause, count: `${c.n} of ${c.of}`, share: c.share }));
  const recommendations = mine.flatMap((f) => f.recommendations ?? []).sort((a, b) => Number(!!b.bug) - Number(!!a.bug) || b.share - a.share);
  const reviewed = mine.reduce((t, f) => t + (f.count?.reviewed ?? 0), 0);
  const backfill = mine.reduce((t, f) => t + (f.count?.backfill ?? 0), 0);
  const line = reviewed ? `${reviewed} miss${reviewed === 1 ? '' : 'es'} reviewed${backfill ? `, ${backfill} of them from the backfill` : ''}` : '';
  return { days, tally, recommendations, line };
}
