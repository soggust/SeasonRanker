// A CHECK's news research for its popover (book-page.component.ts checkWhy): the finding research.mjs made and
// picks.json carries (picks.mjs researchRow), in plain words, with its verdict (research.mjs verdictOf): a real
// reason put into the model's inputs and the market priced again, nothing found and the model's side bet at half a
// unit, or can't tell and still a CHECK.

export interface CheckResearchIn {
  status?: string | null;
  reason?: string | null;
  player?: string | null;
  summary?: string | null;
  sources?: unknown;
  at?: string | null;
  applied?: boolean;
  explains?: boolean;
  category?: string | null;
  confidence?: string | null;
  verdict?: string | null;
  act?: string | null;
  actWhy?: string | null;
  inOurFeeds?: boolean;
  feed?: string | null;
  moved?: string | null;
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
  // (the verdict in words: "Reason found: into the model's inputs", "Nothing found: bet at 0.5u", "Can't tell:
  // still a CHECK"; and its tone)
  verdict: string;
  verdictTone: 'bad' | 'caution' | 'good' | 'none';
  // (what this run did with it, where it says: the run's own words, e.g. why it stayed a CHECK)
  actWhy: string | null;
  // (the reason's category and confidence: "Injury / limited, high confidence")
  detail: string | null;
  // (whether the bot's own feeds already had the reason: "Our feeds had it (injury report)" / "Not in our feeds")
  feeds: string | null;
  // (what it put into the model's inputs and how the projection moved: "Kyle Pitts out (teammate) (the injury
  // report, this run): projection 3.1 -> 3.6, model over 61% -> 55%; no edge: passed"; null where it moved none)
  moved: string | null;
}

const STATUS: Record<string, [string, CheckResearchView['tone']]> = {
  out: ['Out', 'bad'],
  doubtful: ['Doubtful', 'bad'],
  limited: ['Limited', 'caution'],
  questionable: ['Questionable', 'caution'],
  active: ['Active', 'good'],
  unknown: ['Nothing found', 'none'],
};
const REASON: Record<string, string> = { injury: 'Injury', role: 'Role change', suspension: 'Suspension', weather: 'Weather', lineup: 'Lineup' };
// (the verdict's category in words: research.mjs CATEGORIES)
const CATEGORY: Record<string, string> = {
  injury: 'Injury / limited',
  role: 'Role / depth change',
  suspension: 'Suspension / personal',
  weather: 'Weather / venue',
  lineup: 'Lineup / starter news',
  market: 'Market only',
  other: 'Other',
};
const VERDICT: Record<string, [string, CheckResearchView['verdictTone']]> = {
  adjust: ["Reason found: put into the model's inputs and priced again", 'caution'],
  bet: ['Nothing found: the model’s side bet at 0.5u at most', 'good'],
  check: ['Can’t tell: still a CHECK', 'none'],
};

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
    verdict: (VERDICT[rs.verdict ?? ''] ?? VERDICT['check'])[0],
    verdictTone: (VERDICT[rs.verdict ?? ''] ?? VERDICT['check'])[1],
    actWhy: rs.act && rs.act !== rs.verdict && typeof rs.actWhy === 'string' && rs.actWhy.trim() ? rs.actWhy.trim() : null,
    detail: rs.category && CATEGORY[rs.category] ? `${CATEGORY[rs.category]}${rs.confidence ? `, ${rs.confidence} confidence` : ''}` : null,
    moved: typeof rs.moved === 'string' && rs.moved.trim() ? rs.moved.trim() : null,
    feeds: typeof rs.inOurFeeds === 'boolean' ? (rs.inOurFeeds ? `Our feeds had it${rs.feed ? ` (${rs.feed})` : ''}: the model didn't use it` : 'Not in any feed the bot reads') : null,
  };
}
