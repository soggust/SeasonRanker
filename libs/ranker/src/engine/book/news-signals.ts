// The Algorithm tab's News signals panel (model-desk.component.ts): each sport's role signals from the teams'
// news (data/model/news-signals.json, libs/ranker/scripts/model/news-signals.mjs: claude-haiku-5-5 reading ESPN's
// team stories once a day), in plain words. Log only: they move no price yet, kept for a later fit to test.

export interface NewsSignal {
  team: string;
  abbr?: string | null;
  athlete?: string | null;
  player?: string | null;
  kind: string;
  direction: string;
  confidence: number;
  headline: string;
  at: string;
}

export interface NewsSignalsFile {
  sport: string;
  days?: number;
  at?: string;
  signals?: NewsSignal[];
}

export interface NewsSignalRow {
  key: string;
  // ("NFL · NYJ")
  where: string;
  // ("Breece Hall: role change, more work")
  what: string;
  // ("80% sure")
  sure: string;
  headline: string;
  at: string;
}

const KIND: Record<string, string> = {
  starting: 'named a starter',
  benched: 'benched',
  restriction: 'on a restriction',
  role: 'role change',
  coaching: 'coaching change',
  return: 'back from injury',
};
const DIRECTION: Record<string, string> = { up: 'more work', down: 'less work' };

// The panel's rows: the files' signals (the sport chosen, else every one), the newest first, at most max
export function newsSignalRows(files: (NewsSignalsFile | null)[], labels: Record<string, string>, sport: string | null = null, max = 40): NewsSignalRow[] {
  const rows: (NewsSignalRow & { t: number })[] = [];
  for (const f of files) {
    if (!f || (sport && f.sport !== sport) || !Array.isArray(f.signals)) continue;
    for (const [i, s] of f.signals.entries()) {
      const t = Date.parse(s?.at ?? '');
      if (!s || !KIND[s.kind] || !Number.isFinite(t)) continue;
      const how = [KIND[s.kind], DIRECTION[s.direction]].filter(Boolean).join(', ');
      rows.push({
        key: `${f.sport}:${i}`,
        where: `${labels[f.sport] ?? f.sport.toUpperCase()} · ${s.abbr || s.team}`,
        what: s.player ? `${s.player}: ${how}` : how,
        sure: Number.isFinite(s.confidence) ? `${Math.round(s.confidence * 100)}% sure` : '',
        headline: s.headline ?? '',
        at: s.at,
        t,
      });
    }
  }
  return rows
    .sort((a, b) => b.t - a.t)
    .slice(0, max)
    .map(({ t: _t, ...r }) => r);
}
