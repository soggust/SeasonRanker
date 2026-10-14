// A CHECK's news research for its popover (bets-page.component.ts checkWhy): the finding research.mjs made and
// picks.json carries (picks.mjs researchRow), in plain words. A label only: the bot never bets on it.

export interface CheckResearchIn {
  status?: string | null;
  reason?: string | null;
  player?: string | null;
  summary?: string | null;
  sources?: unknown;
  at?: string | null;
  applied?: boolean;
}

export interface CheckResearchView {
  // ('Out', 'Questionable', 'Active' or 'Nothing found')
  status: string;
  // (the status's tone for its color: bad, caution, good or none)
  tone: 'bad' | 'caution' | 'good' | 'none';
  // (why the book is where it is, in a word or two: 'Injury', 'Role change'...; null for none)
  reason: string | null;
  player: string | null;
  summary: string;
  // (each source's link and the site it's on)
  sources: { url: string; host: string }[];
  // (when it was made, "Oct 14, 3:05 PM"; null unknown)
  when: string | null;
  applied: boolean;
}

const STATUS: Record<string, [string, CheckResearchView['tone']]> = {
  out: ['Out', 'bad'],
  questionable: ['Questionable', 'caution'],
  active: ['Active', 'good'],
  unknown: ['Nothing found', 'none'],
};
const REASON: Record<string, string> = { injury: 'Injury', role: 'Role change', suspension: 'Suspension', weather: 'Weather' };

// (a source's site: its host less www.; '' where it isn't a URL)
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// The finding as the popover shows it, or null where there's none
export function researchView(rs: CheckResearchIn | null | undefined): CheckResearchView | null {
  if (!rs || typeof rs !== 'object') return null;
  const [status, tone] = STATUS[rs.status ?? ''] ?? STATUS['unknown'];
  const sources = (Array.isArray(rs.sources) ? rs.sources : [])
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\/\S+$/.test(u))
    .slice(0, 5)
    .map((url) => ({ url, host: hostOf(url) }))
    .filter((s) => s.host);
  const t = Date.parse(rs.at ?? '');
  const when = Number.isFinite(t) ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  return {
    status,
    tone,
    reason: REASON[rs.reason ?? ''] ?? null,
    player: typeof rs.player === 'string' && rs.player.trim() ? rs.player.trim() : null,
    summary: typeof rs.summary === 'string' ? rs.summary.trim() : '',
    sources,
    when,
    applied: !!rs.applied,
  };
}
